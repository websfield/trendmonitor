"""OCR sub-stage tests (Phase 2 task 4, REQ-013 / D-19).

Split deliberately in two:

* Everything from `TestNormalizePolygon` down is **pure logic** — pixel->normalized
  conversion, tick arithmetic, the confidence floor, ID assignment, ordering, and
  the PaddleOCR result adapter. None of it imports paddle or downloads a model,
  so it runs in the fast suite on every change. These are the tests that must
  always be green.
* `TestAgainstRealOcr` is marked `slow`: it downloads PP-OCRv5 weights on first
  use and runs real inference against a fixture whose text was burned in by
  FFmpeg, so the ground truth is known rather than asserted against whatever the
  model happened to say.

Fixture provenance — `cutdown/skills/index/fixtures/ocr/captions.mp4`, 4 s,
640x360, 25 fps, ~11 KB. Generated with (Git Bash on Windows; the drive-relative
font path avoids FFmpeg's filtergraph colon escaping entirely — the escaped form
is `fontfile=C\\\\:/Windows/Fonts/arial.ttf`):

    ffmpeg -y -f lavfi -i "color=c=white:s=640x360:d=4:r=25" \
      -vf "drawtext=fontfile=/Windows/Fonts/arial.ttf:text=CUTDOWN OCR\
:fontcolor=black:fontsize=56:x=64:y=36:enable='lt(t,2)'" \
      -c:v libx264 -pix_fmt yuv420p -crf 28 -g 25 -an \
      skills/index/fixtures/ocr/captions.mp4

The `enable='lt(t,2)'` is the whole point: the first half carries the caption
(the POSITIVE case) and the second half is blank white (the CONTROL). One asset
proves both that text is found where it exists and that nothing is reported
where it does not.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest

from harness import ModelUnavailableError, SubStageContext, SubStageError
from ocr import (
    DEFAULT_OCR_CONFIG,
    ShotWindow,
    TextDetection,
    build_observations,
    compute_ocr,
    detections_from_paddle_result,
    normalize_polygon,
    run_ocr_sub_stage,
    shot_windows_from_keyframe_ticks,
    shot_windows_from_shots,
    ticks_to_milliseconds,
)
from shots import Timebase

FIXTURE_DIR = Path(__file__).resolve().parents[3] / "skills" / "index" / "fixtures" / "ocr"
CAPTIONS = FIXTURE_DIR / "captions.mp4"

#: The fixture's container timebase, from `ffprobe -show_entries stream=time_base`.
FIXTURE_TIMEBASE = Timebase(num=1, den=12800)
#: 4 s at 1/12800 — the second half is the no-text control.
FIXTURE_DURATION_TICKS = 51200

TB = Timebase(num=1, den=25)

ENGINE = {"name": "paddleocr", "version": "3.7.0", "parameters": [{"key": "lang", "value": "en"}]}


def _fake_paddleocr(constructor) -> types.ModuleType:
    """A stand-in `paddleocr` module, so model-boundary tests cost no download."""
    module = types.ModuleType("paddleocr")
    module.__version__ = "3.7.0"
    module.PaddleOCR = constructor
    return module


@pytest.fixture
def stub_paddleocr(monkeypatch):
    """Install the stub for tests that only need the module's version string."""
    monkeypatch.setitem(sys.modules, "paddleocr", _fake_paddleocr(lambda **_: object()))
    return sys.modules["paddleocr"]


def detection(text: str, confidence: float, box: tuple[float, float, float, float]) -> TextDetection:
    """A detection from an axis-aligned pixel box, as PaddleOCR would emit it."""
    x1, y1, x2, y2 = box
    return TextDetection(
        text=text,
        confidence=confidence,
        polygon=((x1, y1), (x2, y1), (x2, y2), (x1, y2)),
    )


class TestNormalizePolygon:
    """A pixel box must become a 0..1 rect, or Phase 4's safe-zone check is blind."""

    def test_a_known_pixel_box_converts_to_known_fractions(self) -> None:
        # The exact box PaddleOCR returned for the fixture caption on a 640x360
        # frame: [66, 35] -> [494, 80]. Hand-computed: 66/640, 35/360, 428/640, 45/360.
        box = normalize_polygon(((66, 35), (494, 35), (494, 80), (66, 80)), 640, 360)
        assert box == {
            "x": pytest.approx(0.103125),
            "y": pytest.approx(0.097222),
            "width": pytest.approx(0.66875),
            "height": pytest.approx(0.125),
        }

    def test_a_full_frame_box_is_the_unit_rect(self) -> None:
        assert normalize_polygon(((0, 0), (640, 0), (640, 360), (0, 360)), 640, 360) == {
            "x": 0.0,
            "y": 0.0,
            "width": 1.0,
            "height": 1.0,
        }

    def test_a_box_overhanging_the_frame_is_clamped_into_the_unit_square(self) -> None:
        # PaddleOCR's unclip_ratio routinely pushes a box past the frame edge.
        # The schema caps every component at 1, so an unclamped value is not just
        # wrong, it fails validation.
        box = normalize_polygon(((-20, -10), (700, -10), (700, 400), (-20, 400)), 640, 360)
        assert box == {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}

    def test_clamping_never_leaves_the_rect_running_off_the_frame(self) -> None:
        # The bug this guards: clamping the WIDTH instead of the edges leaves
        # x + width > 1, a rectangle describing pixels that do not exist.
        box = normalize_polygon(((320, 180), (900, 180), (900, 500), (320, 500)), 640, 360)
        assert box["x"] + box["width"] <= 1.0
        assert box["y"] + box["height"] <= 1.0
        assert box == {"x": 0.5, "y": 0.5, "width": 0.5, "height": 0.5}

    def test_a_rotated_quadrilateral_becomes_its_containing_box(self) -> None:
        # Rotated text still has to fit the schema's axis-aligned NormalizedRect.
        box = normalize_polygon(((100, 50), (300, 90), (290, 150), (90, 110)), 1000, 200)
        assert box == {"x": 0.09, "y": 0.25, "width": 0.21, "height": 0.5}

    def test_a_degenerate_frame_size_is_an_error_not_a_division(self) -> None:
        with pytest.raises(SubStageError) as caught:
            normalize_polygon(((0, 0), (1, 0), (1, 1), (0, 1)), 0, 360)
        assert caught.value.code == "FRAME_DIMENSIONS_INVALID"

    def test_a_polygon_with_too_few_points_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            normalize_polygon(((0, 0), (1, 1)), 640, 360)
        assert caught.value.code == "BOUNDING_BOX_INVALID"


class TestTickArithmetic:
    """Seeking must be driven by the asset's timebase, never by an assumed fps."""

    def test_ticks_convert_exactly_at_a_broadcast_timebase(self) -> None:
        # 1001/30000 s per tick, i.e. ticks ARE 29.97 fps frames. 30 of them is
        # 1.001 s exactly — the NTSC case where treating fps as 29.97 and
        # dividing in float drifts by ~1 ms per second.
        assert ticks_to_milliseconds(30, Timebase(num=1001, den=30000)) == pytest.approx(1001.0)

    def test_ticks_convert_at_the_fixture_timebase(self) -> None:
        # 12800 ticks at 1/12800 is exactly one second.
        assert ticks_to_milliseconds(12800, FIXTURE_TIMEBASE) == pytest.approx(1000.0)

    def test_tick_zero_is_the_start_of_the_asset(self) -> None:
        assert ticks_to_milliseconds(0, TB) == 0.0


class TestShotWindows:
    def test_windows_come_from_the_shots_artefact(self) -> None:
        windows = shot_windows_from_shots(
            [
                {"shotId": "shot-0002", "startTicks": 50, "endTicks": 100, "keyframeTicks": 75},
                {"shotId": "shot-0001", "startTicks": 0, "endTicks": 50, "keyframeTicks": 25},
            ]
        )
        assert [w.shot_id for w in windows] == ["shot-0001", "shot-0002"], "windows are time-ordered"
        assert windows[0].keyframe_ticks == 25

    def test_a_keyframe_outside_its_own_shot_is_rejected(self) -> None:
        # A keyframe that is not inside its shot means the observation's time
        # range would not contain the frame it was read from.
        with pytest.raises(SubStageError) as caught:
            shot_windows_from_shots(
                [{"shotId": "shot-0001", "startTicks": 0, "endTicks": 50, "keyframeTicks": 60}]
            )
        assert caught.value.code == "SHOTS_ARTEFACT_INVALID"

    def test_a_shot_missing_keyframe_ticks_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            shot_windows_from_shots([{"shotId": "shot-0001", "startTicks": 0, "endTicks": 50}])
        assert caught.value.code == "SHOTS_ARTEFACT_INVALID"

    def test_bare_keyframe_ticks_tile_up_to_the_asset_end(self) -> None:
        # The standalone path: no shots artefact, so each keyframe owns the span
        # to the next one and shotId is honestly null.
        windows = shot_windows_from_keyframe_ticks([100, 0], duration_ticks=300)
        assert [(w.start_ticks, w.end_ticks) for w in windows] == [(0, 100), (100, 300)]
        assert all(w.shot_id is None for w in windows)

    def test_a_keyframe_past_the_asset_end_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            shot_windows_from_keyframe_ticks([500], duration_ticks=300)
        assert caught.value.code == "KEYFRAME_OUT_OF_RANGE"


class TestPaddleResultAdapter:
    """The one function that knows PaddleOCR 3.x's shape, tested without paddle."""

    def test_the_three_parallel_lists_become_detections(self) -> None:
        # Exactly the shape paddleocr 3.7.0 returns: an OCRResult mapping with
        # rec_texts / rec_scores / rec_polys. NOT the 2.x [[box, (text, score)]].
        result = {
            "rec_texts": ["CUTDOWN OCR"],
            "rec_scores": [0.9997978806495667],
            "rec_polys": [[[66, 35], [494, 35], [494, 80], [66, 80]]],
        }
        [found] = detections_from_paddle_result(result)
        assert found.text == "CUTDOWN OCR"
        assert found.confidence == pytest.approx(0.99979788)
        assert found.polygon[0] == (66.0, 35.0)

    def test_an_empty_result_yields_no_detections(self) -> None:
        # A blank frame comes back with the keys present and empty.
        assert detections_from_paddle_result({"rec_texts": [], "rec_scores": [], "rec_polys": []}) == []

    def test_a_result_missing_the_expected_keys_is_a_structured_error(self) -> None:
        # If a future PaddleOCR renames these, the run must say so rather than
        # quietly index zero text on every frame.
        with pytest.raises(SubStageError) as caught:
            detections_from_paddle_result({"boxes": [], "txts": []})
        assert caught.value.code == "OCR_RESULT_UNRECOGNISED"

    def test_mismatched_list_lengths_are_rejected_not_truncated(self) -> None:
        with pytest.raises(SubStageError) as caught:
            detections_from_paddle_result(
                {"rec_texts": ["a", "b"], "rec_scores": [0.9], "rec_polys": [[[0, 0], [1, 0], [1, 1], [0, 1]]]}
            )
        assert caught.value.code == "OCR_RESULT_UNRECOGNISED"


def observations(windowed, *, floor: float = 0.6, width: int = 640, height: int = 360):
    return build_observations(
        windowed,
        timebase=TB,
        frame_width=width,
        frame_height=height,
        engine=ENGINE,
        confidence_floor=floor,
    )


class TestObservationShape:
    def test_an_observation_carries_exactly_the_schema_fields(self) -> None:
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        [found] = observations([(window, [detection("SALE", 0.9, (64, 36, 320, 108))])])
        assert set(found) == {
            "ocrId",
            "startTicks",
            "endTicks",
            "timebase",
            "text",
            "confidence",
            "boundingBox",
            "shotId",
            "engine",
        }
        assert set(found["boundingBox"]) == {"x", "y", "width", "height"}
        assert found["timebase"] == {"num": 1, "den": 25}

    def test_text_is_ranged_over_the_shot_not_the_keyframe_instant(self) -> None:
        # The observation answers "when was this on screen?", so a caption read
        # from the frame at tick 25 spans its whole shot.
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        [found] = observations([(window, [detection("SALE", 0.9, (0, 0, 64, 36))])])
        assert (found["startTicks"], found["endTicks"]) == (0, 50)
        assert found["endTicks"] > found["startTicks"]

    def test_the_observation_links_back_to_its_shot(self) -> None:
        window = ShotWindow(shot_id="shot-0007", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        [found] = observations([(window, [detection("SALE", 0.9, (0, 0, 64, 36))])])
        assert found["shotId"] == "shot-0007"

    def test_shot_id_is_null_when_there_was_no_shot(self) -> None:
        window = ShotWindow(shot_id=None, start_ticks=0, end_ticks=50, keyframe_ticks=25)
        [found] = observations([(window, [detection("SALE", 0.9, (0, 0, 64, 36))])])
        assert found["shotId"] is None, "a fabricated shot-0001 would be a lie about provenance"


class TestConfidenceFloor:
    def test_a_detection_below_the_floor_is_dropped(self) -> None:
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        found = observations(
            [(window, [detection("CONFIDENT", 0.95, (0, 0, 64, 36)), detection("gibb3rish", 0.41, (0, 40, 64, 76))])],
            floor=0.6,
        )
        assert [o["text"] for o in found] == ["CONFIDENT"]

    def test_the_floor_is_inclusive_at_its_own_value(self) -> None:
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        found = observations([(window, [detection("EDGE", 0.6, (0, 0, 64, 36))])], floor=0.6)
        assert [o["text"] for o in found] == ["EDGE"]

    def test_lowering_the_floor_admits_what_it_previously_dropped(self) -> None:
        # Proves the floor is actually applied rather than incidentally passing.
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        windowed = [(window, [detection("MARGINAL", 0.45, (0, 0, 64, 36))])]
        assert observations(windowed, floor=0.6) == []
        assert [o["text"] for o in observations(windowed, floor=0.4)] == ["MARGINAL"]

    def test_the_floor_is_recorded_in_the_engine_parameters(self, stub_paddleocr) -> None:
        # REQ-012: every threshold recorded with the index. A dropped observation
        # is unexplainable without the value that dropped it. Runs against a
        # stubbed module so the assertion costs no model download.
        from ocr import ocr_engine_record

        record = ocr_engine_record(DEFAULT_OCR_CONFIG)
        recorded = {p["key"]: p["value"] for p in record["parameters"]}
        assert recorded["confidence_floor"] == "0.6"
        assert recorded["lang"] == "en"
        assert recorded["enable_mkldnn"] == "false", "the inference-path choice is part of the record"
        assert [p["key"] for p in record["parameters"]] == sorted(recorded), "sorted for stable bytes"


class TestNoTextMeansNoObservations:
    """REQ-013's negative case, at the logic level."""

    def test_a_frame_with_no_detections_produces_zero_observations(self) -> None:
        window = ShotWindow(shot_id="shot-0002", start_ticks=50, end_ticks=100, keyframe_ticks=75)
        assert observations([(window, [])]) == []

    def test_an_empty_string_detection_is_dropped_not_recorded(self) -> None:
        # The exact failure this guards: emitting text:"" so a blank frame is
        # indistinguishable from a caption that could not be read.
        window = ShotWindow(shot_id="shot-0002", start_ticks=50, end_ticks=100, keyframe_ticks=75)
        assert observations([(window, [detection("", 0.99, (0, 0, 64, 36))])]) == []

    def test_a_whitespace_only_detection_is_dropped(self) -> None:
        window = ShotWindow(shot_id="shot-0002", start_ticks=50, end_ticks=100, keyframe_ticks=75)
        assert observations([(window, [detection("   \n\t ", 0.99, (0, 0, 64, 36))])]) == []

    def test_a_blank_shot_does_not_suppress_a_captioned_one(self) -> None:
        captioned = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        blank = ShotWindow(shot_id="shot-0002", start_ticks=50, end_ticks=100, keyframe_ticks=75)
        found = observations([(captioned, [detection("SALE", 0.9, (0, 0, 64, 36))]), (blank, [])])
        assert [(o["shotId"], o["text"]) for o in found] == [("shot-0001", "SALE")]


class TestDeterministicIdsAndOrdering:
    def test_ids_are_zero_padded_ordinals_in_time_order(self) -> None:
        first = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        second = ShotWindow(shot_id="shot-0002", start_ticks=50, end_ticks=100, keyframe_ticks=75)
        found = observations(
            [(second, [detection("LATER", 0.9, (0, 0, 64, 36))]), (first, [detection("EARLIER", 0.9, (0, 0, 64, 36))])]
        )
        assert [o["ocrId"] for o in found] == ["ocr-0001", "ocr-0002"]
        assert [o["text"] for o in found] == ["EARLIER", "LATER"], "sorted by startTicks, not input order"

    def test_the_result_is_sorted_by_start_ticks_then_ocr_id(self) -> None:
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        found = observations(
            [
                (
                    window,
                    [
                        detection("BOTTOM", 0.9, (0, 300, 64, 340)),
                        detection("TOP", 0.9, (0, 10, 64, 50)),
                        detection("MIDDLE", 0.9, (0, 150, 64, 190)),
                    ],
                )
            ]
        )
        keys = [(o["startTicks"], o["ocrId"]) for o in found]
        assert keys == sorted(keys)
        assert [o["text"] for o in found] == ["TOP", "MIDDLE", "BOTTOM"], "ties broken top-to-bottom"

    def test_input_order_does_not_change_the_output(self) -> None:
        # The determinism requirement (contract §5) made concrete: PaddleOCR is
        # free to emit regions in any order, and the artefact must not be.
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        a = detection("ALPHA", 0.9, (0, 10, 64, 50))
        b = detection("BETA", 0.9, (0, 150, 64, 190))
        assert observations([(window, [a, b])]) == observations([(window, [b, a])])

    def test_identical_input_yields_identical_ids(self) -> None:
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        windowed = [(window, [detection("SALE", 0.9, (0, 0, 64, 36)), detection("50% OFF", 0.8, (0, 40, 64, 76))])]
        assert [o["ocrId"] for o in observations(windowed)] == [o["ocrId"] for o in observations(windowed)]

    def test_ids_are_contiguous_after_filtering(self) -> None:
        # IDs are assigned AFTER the floor drops things, so a filtered artefact
        # has no gaps — ocr-0002 always exists if ocr-0003 does.
        window = ShotWindow(shot_id="shot-0001", start_ticks=0, end_ticks=50, keyframe_ticks=25)
        found = observations(
            [
                (
                    window,
                    [
                        detection("KEPT-A", 0.9, (0, 10, 64, 50)),
                        detection("DROPPED", 0.1, (0, 60, 64, 100)),
                        detection("KEPT-B", 0.9, (0, 150, 64, 190)),
                    ],
                )
            ]
        )
        assert [o["ocrId"] for o in found] == ["ocr-0001", "ocr-0002"]


class TestKeyframeExtraction:
    """Frames must arrive at DISPLAY dimensions, or every box is transposed."""

    def test_a_rotated_source_decodes_at_its_display_dimensions(self) -> None:
        # `ugly.mp4` is STORED 640x360 with a rotation=90 side-data tag, so its
        # display size is 360x640. The schema normalizes bounding boxes against
        # display dimensions; normalizing a portrait phone clip against its
        # landscape storage size would transpose x and y on every observation.
        # Verified against the installed OpenCV 4.10: CAP_PROP_ORIENTATION_AUTO
        # makes the FFMPEG backend apply the tag during decode.
        from ocr import extract_keyframes
        from shots import probe_video

        rotated = Path(__file__).resolve().parents[3] / "data" / "golden-sets" / "ingest" / "ugly.mp4"
        if not rotated.exists():
            pytest.skip(f"golden-set fixture missing: {rotated}")

        probe = probe_video(rotated)
        [frame] = extract_keyframes(rotated, [ShotWindow(None, 0, probe.duration_ticks, 0)], probe)
        height, width = frame.shape[:2]
        assert (width, height) == (360, 640), "rotation must be applied, not ignored"

    def test_an_unopenable_file_is_a_structured_error(self, tmp_path: Path) -> None:
        from ocr import extract_keyframes
        from shots import Timebase, VideoProbe
        from fractions import Fraction

        broken = tmp_path / "not-a-video.mp4"
        broken.write_bytes(b"not video data")
        probe = VideoProbe(timebase=Timebase(1, 25), duration_ticks=100, avg_frame_rate=Fraction(25))
        with pytest.raises(SubStageError) as caught:
            extract_keyframes(broken, [ShotWindow(None, 0, 100, 0)], probe)
        assert caught.value.code == "KEYFRAME_DECODE_FAILED"


class TestSubStageWiring:
    def test_missing_input_is_a_structured_input_validation_error(self) -> None:
        with pytest.raises(SubStageError) as caught:
            compute_ocr(CAPTIONS, shots=None, keyframe_ticks=None)
        assert caught.value.code == "OCR_INPUT_MISSING"
        assert caught.value.exit_code == 2

    @pytest.mark.parametrize(
        ("key", "changed"),
        [("lang", "japan"), ("ocr_version", "PP-OCRv4"), ("confidence_floor", 0.3)],
    )
    def test_changing_any_output_affecting_setting_invalidates_the_cache(self, tmp_path: Path, key, changed) -> None:
        # REQ-005: language, model version and the confidence floor each change
        # the artefact for byte-identical media, so each must key the cache.
        # Serving a 0.60-floored artefact to a caller who asked for 0.30 is the
        # concrete failure this prevents.
        from harness import compute_cache_key

        ctx = SubStageContext(
            job_id="ocr-1",
            asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
            job_root=tmp_path,
            content_hash="d" * 64,
        )
        baseline = compute_cache_key(ctx, "ocr", DEFAULT_OCR_CONFIG)
        assert compute_cache_key(ctx, "ocr", {**DEFAULT_OCR_CONFIG, key: changed}) != baseline

    def test_a_weights_download_failure_names_the_model(self, monkeypatch) -> None:
        # Contract §6: PaddleOCR fetches its detection and recognition weights on
        # first use. Offline, gated or corrupt-cache must name the model and
        # leave the run resumable — never fabricate an empty OCR artefact that
        # then gets cached as complete.
        import ocr as ocr_module

        def unreachable(**_kwargs):
            raise OSError("HuggingFace is unreachable")

        monkeypatch.setitem(sys.modules, "paddleocr", _fake_paddleocr(unreachable))
        with pytest.raises(ModelUnavailableError) as caught:
            ocr_module.load_ocr_engine(DEFAULT_OCR_CONFIG)

        payload = caught.value.to_payload()
        assert payload["code"] == "MODEL_UNAVAILABLE"
        assert payload["details"]["model"] == "paddleocr/PP-OCRv5/en"
        assert "HuggingFace is unreachable" in payload["message"]

    def test_an_uninstalled_paddleocr_also_names_the_model(self, monkeypatch) -> None:
        import ocr as ocr_module

        monkeypatch.setitem(sys.modules, "paddleocr", None)  # forces ImportError
        with pytest.raises(ModelUnavailableError) as caught:
            ocr_module.load_ocr_engine(DEFAULT_OCR_CONFIG)
        assert caught.value.model == "paddleocr/PP-OCRv5/en"

    def test_a_failed_ocr_run_leaves_the_sub_stage_resumable(self, tmp_path: Path, monkeypatch) -> None:
        import ocr as ocr_module
        from harness import read_checkpoint

        ctx = SubStageContext(
            job_id="ocr-1",
            asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
            job_root=tmp_path / "jobs" / "ocr-1",
            content_hash="c" * 64,
        )

        def explode(*_args, **_kwargs):
            raise ModelUnavailableError("paddleocr/PP-OCRv5/en", "weights unavailable")

        monkeypatch.setattr(ocr_module, "compute_ocr", explode)
        with pytest.raises(ModelUnavailableError):
            run_ocr_sub_stage(ctx, CAPTIONS, keyframe_ticks=[0])

        assert read_checkpoint(ctx, "ocr") is None, "a checkpoint would make the failure permanent"


@pytest.fixture(scope="module")
def artefact() -> dict:
    """One real OCR pass, shared by the whole slow class.

    Module-scoped because constructing the PaddleOCR pipeline dominates the
    runtime; re-running it per assertion would multiply a five-minute suite by six.
    """
    assert CAPTIONS.exists(), f"missing fixture {CAPTIONS}"
    # Tick 12800 = 1.0 s (inside the captioned half); tick 38400 = 3.0 s
    # (inside the blank control half).
    return compute_ocr(CAPTIONS, keyframe_ticks=[12800, 38400])


@pytest.mark.slow
class TestAgainstRealOcr:
    """Real PP-OCRv5 inference over the burned-in fixture. Downloads weights."""

    def test_the_burned_in_caption_is_read_back(self, artefact: dict) -> None:
        texts = [o["text"] for o in artefact["ocr"]]
        assert "CUTDOWN OCR" in texts, f"expected the drawtext caption, got {texts}"

    def test_the_blank_control_frame_contributes_nothing(self, artefact: dict) -> None:
        # The negative half of the fixture: the 3.0 s keyframe is plain white.
        blank_window = [o for o in artefact["ocr"] if o["startTicks"] == 38400]
        assert blank_window == [], f"a frame with no text must produce no observations, got {blank_window}"

    def test_the_bounding_box_matches_where_ffmpeg_drew_the_text(self, artefact: dict) -> None:
        # drawtext placed it at x=64, y=36 on a 640x360 frame -> ~0.10, ~0.10.
        # Asserted as a band because the detector's box hugs the glyphs, not the
        # requested origin — but it must be the top-left region, not anywhere.
        [caption] = [o for o in artefact["ocr"] if o["text"] == "CUTDOWN OCR"]
        box = caption["boundingBox"]
        assert 0.05 <= box["x"] <= 0.20, box
        assert 0.05 <= box["y"] <= 0.20, box
        assert 0.4 <= box["width"] <= 0.9, box
        assert 0.05 <= box["height"] <= 0.30, box
        assert box["x"] + box["width"] <= 1.0
        assert box["y"] + box["height"] <= 1.0

    def test_every_value_stays_inside_the_schema_bounds(self, artefact: dict) -> None:
        for observation in artefact["ocr"]:
            assert 0.0 <= observation["confidence"] <= 1.0
            for component in ("x", "y", "width", "height"):
                assert 0.0 <= observation["boundingBox"][component] <= 1.0
            assert observation["endTicks"] > observation["startTicks"] >= 0
            assert observation["text"].strip() == observation["text"] != ""

    def test_the_engine_record_names_the_installed_paddleocr(self, artefact: dict) -> None:
        [caption] = [o for o in artefact["ocr"] if o["text"] == "CUTDOWN OCR"]
        engine = caption["engine"]
        assert engine["name"] == "paddleocr"
        assert engine["version"].startswith("3.")
        recorded = {p["key"]: p["value"] for p in engine["parameters"]}
        assert recorded["confidence_floor"] == "0.6"
        assert recorded["lang"] == "en"
        assert recorded["ocr_version"] == "PP-OCRv5"

    def test_a_second_run_is_byte_identical(self, artefact: dict) -> None:
        from harness import canonical_json

        again = compute_ocr(CAPTIONS, keyframe_ticks=[12800, 38400])
        assert canonical_json(again) == canonical_json(artefact)


class TestProgressCallback:
    """`compute_ocr(progress=...)` — one heartbeat per recognised keyframe."""

    def test_progress_ticks_once_per_keyframe_plus_engine_load(self, monkeypatch) -> None:
        import ocr as ocr_module
        from fractions import Fraction as _Fraction
        from shots import Timebase as _Timebase, VideoProbe as _VideoProbe

        class _Frame:
            shape = (1280, 720, 3)

        probe = _VideoProbe(timebase=_Timebase(num=1, den=12800), duration_ticks=64000, avg_frame_rate=_Fraction(30, 1))
        monkeypatch.setattr(ocr_module, "probe_video", lambda _path: probe)
        monkeypatch.setattr(ocr_module, "extract_keyframes", lambda _p, windows, _probe: [_Frame() for _ in windows])
        monkeypatch.setattr(ocr_module, "load_ocr_engine", lambda _config: object())
        monkeypatch.setattr(ocr_module, "_predict_one", lambda _engine, _frame: object())
        monkeypatch.setattr(ocr_module, "detections_from_paddle_result", lambda _result: [])

        ticks: list[tuple[int, int, str]] = []
        result = ocr_module.compute_ocr(
            CAPTIONS,
            keyframe_ticks=[12800, 25600, 38400],
            progress=lambda current, total, note: ticks.append((current, total, note)),
        )

        assert result == {"ocr": []}
        assert ticks[0] == (0, 3, "engine loaded; recognising keyframes")
        assert [t[0] for t in ticks[1:]] == [1, 2, 3]
        assert all(t[1] == 3 for t in ticks)

    def test_no_callback_still_works(self, monkeypatch) -> None:
        import ocr as ocr_module
        from fractions import Fraction as _Fraction
        from shots import Timebase as _Timebase, VideoProbe as _VideoProbe

        class _Frame:
            shape = (1280, 720, 3)

        probe = _VideoProbe(timebase=_Timebase(num=1, den=12800), duration_ticks=64000, avg_frame_rate=_Fraction(30, 1))
        monkeypatch.setattr(ocr_module, "probe_video", lambda _path: probe)
        monkeypatch.setattr(ocr_module, "extract_keyframes", lambda _p, windows, _probe: [_Frame() for _ in windows])
        monkeypatch.setattr(ocr_module, "load_ocr_engine", lambda _config: object())
        monkeypatch.setattr(ocr_module, "_predict_one", lambda _engine, _frame: object())
        monkeypatch.setattr(ocr_module, "detections_from_paddle_result", lambda _result: [])

        assert ocr_module.compute_ocr(CAPTIONS, keyframe_ticks=[12800]) == {"ocr": []}
