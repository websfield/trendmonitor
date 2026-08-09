"""Scene grouping tests (Phase 2 task 3) — PRD REQ-012, decisions.md D-18.

The load-bearing test in this file is `TestNoUnboundedScene`. The phase plan
names the failure mode outright: "Fade and camera-change fixtures must not
collapse into one unbounded scene." Grouping that only ever joins produces
exactly one scene spanning the asset, which is indistinguishable from having no
scene layer at all — and it looks *plausible*, which is why it needs a fixture
that can fail rather than an eyeball check.

Everything except that class is pure: the grouping rules take shots, an optional
transcript and optional histograms, so a grouping bug is reproducible without
decoding anything.
"""

from __future__ import annotations

import functools
from pathlib import Path

import pytest

from harness import SubStageContext, canonical_json
from scenes import (
    DEFAULT_SCENE_CONFIG,
    SCENE_RULES_VERSION,
    compute_scenes,
    group_shots,
    join_signals,
    keyframe_histograms,
    pearson_correlation,
    run_scenes_sub_stage,
    scene_engine_record,
    transcript_spans,
)
from shots import Timebase, compute_shots

CUTDOWN_ROOT = Path(__file__).resolve().parents[3]
INGEST = CUTDOWN_ROOT / "data" / "golden-sets" / "ingest"
FIXTURES = CUTDOWN_ROOT / "skills" / "index" / "fixtures" / "shots"

HARD_CUT_MP4 = FIXTURES / "hard-cut.mp4"
FADE_MP4 = FIXTURES / "fade.mp4"
CAMERA_CHANGE_MP4 = FIXTURES / "camera-change.mp4"
BROLL_MP4 = INGEST / "broll-silent.mp4"

VIDEO_TIMEBASE = {"num": 1, "den": 15360}
AUDIO_TIMEBASE = {"num": 1, "den": 48000}

ENGINE_STUB = {"name": "test", "version": "0", "parameters": []}


@functools.cache
def detected_shots(media_path: Path) -> tuple[dict, ...]:
    """Shot detection is deterministic, so decoding each fixture once is enough.

    Returned as a tuple of frozen-by-convention dicts purely to make the cache
    key hashable; callers copy before mutating.
    """
    return tuple(compute_shots(media_path)["shots"])


def shots_for(media_path: Path) -> list[dict]:
    return [dict(entry) for entry in detected_shots(media_path)]


def shot(index: int, start: int, end: int, transition_in: str = "hard_cut", transition_out: str = "hard_cut") -> dict:
    return {
        "shotId": f"shot-{index:04d}",
        "startTicks": start,
        "endTicks": end,
        "timebase": VIDEO_TIMEBASE,
        "transitionIn": transition_in,
        "transitionOut": transition_out,
        "keyframeTicks": start + (end - start) // 2,
        "confidence": 0.9,
        "engine": ENGINE_STUB,
    }


def tiled(*kinds: str) -> list[dict]:
    """Contiguous 1 s shots whose transitionIn is each given kind in turn."""
    shots = []
    for index, kind in enumerate(kinds):
        start = index * 15360
        shots.append(
            shot(
                index + 1,
                start,
                start + 15360,
                transition_in="unknown" if index == 0 else kind,
                transition_out=kinds[index + 1] if index + 1 < len(kinds) else "unknown",
            )
        )
    return shots


def transcript(*segments: tuple[int, int, str | None], timebase: dict | None = None) -> dict:
    return {
        "segments": [
            {
                "segmentId": f"seg-{i:04d}",
                "startTicks": start,
                "endTicks": end,
                "timebase": timebase or VIDEO_TIMEBASE,
                "speakerTurnId": speaker,
            }
            for i, (start, end, speaker) in enumerate(segments, start=1)
        ]
    }


@pytest.fixture
def ctx(tmp_path: Path) -> SubStageContext:
    return SubStageContext(
        job_id="scenes-1",
        asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
        job_root=tmp_path / "jobs" / "scenes-1",
        content_hash="d" * 64,
    )


class TestHistogramCorrelation:
    def test_identical_histograms_correlate_perfectly(self) -> None:
        assert pearson_correlation([1.0, 0.2, 0.5], [1.0, 0.2, 0.5]) == pytest.approx(1.0)

    def test_opposed_histograms_correlate_negatively(self) -> None:
        assert pearson_correlation([1.0, 0.0], [0.0, 1.0]) == pytest.approx(-1.0)

    def test_two_flat_histograms_are_not_treated_as_similar(self) -> None:
        # Zero variance means "no information", not "identical". Returning 1.0
        # here would make every uniform frame visually continuous with every
        # other uniform frame regardless of colour.
        assert pearson_correlation([0.5, 0.5], [0.9, 0.9]) == 0.0

    def test_mismatched_lengths_do_not_raise(self) -> None:
        assert pearson_correlation([1.0, 2.0], [1.0]) == 0.0


class TestTranscriptSpans:
    def test_segments_are_rescaled_into_the_shot_timebase(self) -> None:
        # The transcript sub-stage works in audio samples ({1, 48000}); shots are
        # in video ticks ({1, 15360}). Comparing them unscaled would be an
        # off-by-3.125x bug that still produced plausible-looking scenes.
        spans = transcript_spans(transcript((48000, 96000, None), timebase=AUDIO_TIMEBASE), Timebase(1, 15360))
        assert [(s.start, s.end) for s in spans] == [(15360, 30720)]

    def test_a_same_timebase_transcript_passes_through_unchanged(self) -> None:
        spans = transcript_spans(transcript((100, 200, None)), Timebase(1, 15360))
        assert [(s.start, s.end) for s in spans] == [(100, 200)]

    def test_no_transcript_yields_no_spans(self) -> None:
        assert transcript_spans(None, Timebase(1, 15360)) == []


class TestJoinSignals:
    def test_abutting_shots_are_temporally_proximate(self) -> None:
        signals = join_signals(
            shot(1, 0, 15360), shot(2, 15360, 30720), config=DEFAULT_SCENE_CONFIG, spans=[]
        )
        assert "temporal_proximity" in signals

    def test_a_wide_gap_breaks_temporal_proximity(self) -> None:
        # Negative control for the signal that everything else rests on.
        signals = join_signals(
            shot(1, 0, 15360), shot(2, 60000, 70000), config=DEFAULT_SCENE_CONFIG, spans=[]
        )
        assert "temporal_proximity" not in signals

    def test_speech_spanning_the_boundary_is_transcript_continuity(self) -> None:
        spans = transcript_spans(transcript((10000, 20000, "turn-1")), Timebase(1, 15360))
        signals = join_signals(
            shot(1, 0, 15360), shot(2, 15360, 30720), config=DEFAULT_SCENE_CONFIG, spans=spans
        )
        assert "transcript_continuity" in signals
        assert "speaker_continuity" in signals

    def test_silence_across_the_boundary_is_not_transcript_continuity(self) -> None:
        # Negative control: two segments a long way either side of the cut.
        # 40000 - 5000 ticks is ~2.3 s, past the 1.0 s continuity window.
        spans = transcript_spans(transcript((0, 5000, "turn-1"), (40000, 50000, "turn-2")), Timebase(1, 15360))
        signals = join_signals(
            shot(1, 0, 15360), shot(2, 15360, 30720), config=DEFAULT_SCENE_CONFIG, spans=spans
        )
        assert "transcript_continuity" not in signals

    def test_a_speaker_change_across_the_boundary_is_not_speaker_continuity(self) -> None:
        spans = transcript_spans(transcript((14000, 15300, "turn-1"), (15400, 20000, "turn-2")), Timebase(1, 15360))
        signals = join_signals(
            shot(1, 0, 15360), shot(2, 15360, 30720), config=DEFAULT_SCENE_CONFIG, spans=spans
        )
        assert "transcript_continuity" in signals, "the gap is short enough to be one thought"
        assert "speaker_continuity" not in signals, "but a different speaker is a different speaker"

    def test_similar_keyframes_are_visual_continuity(self) -> None:
        histograms = {"shot-0001": [1.0, 0.2, 0.4], "shot-0002": [0.9, 0.25, 0.45]}
        signals = join_signals(
            shot(1, 0, 15360),
            shot(2, 15360, 30720),
            config=DEFAULT_SCENE_CONFIG,
            spans=[],
            histograms=histograms,
        )
        assert "visual_continuity" in signals

    def test_dissimilar_keyframes_are_not_visual_continuity(self) -> None:
        histograms = {"shot-0001": [1.0, 0.0, 0.0], "shot-0002": [0.0, 0.0, 1.0]}
        signals = join_signals(
            shot(1, 0, 15360),
            shot(2, 15360, 30720),
            config=DEFAULT_SCENE_CONFIG,
            spans=[],
            histograms=histograms,
        )
        assert "visual_continuity" not in signals


class TestGroupingRules:
    def test_hard_cuts_are_absorbed_into_one_scene(self) -> None:
        # Cutting between angles inside one scene is ordinary grammar; refusing
        # to absorb it would make the scene layer a copy of the shot layer.
        scenes = group_shots(tiled("unknown", "hard_cut", "hard_cut"), ENGINE_STUB)
        assert len(scenes) == 1
        assert scenes[0]["shotIds"] == ["shot-0001", "shot-0002", "shot-0003"]

    def test_a_fade_always_breaks_the_scene(self) -> None:
        scenes = group_shots(tiled("unknown", "fade", "hard_cut"), ENGINE_STUB)
        assert [s["shotIds"] for s in scenes] == [["shot-0001"], ["shot-0002", "shot-0003"]]

    def test_a_camera_change_always_breaks_the_scene(self) -> None:
        scenes = group_shots(tiled("unknown", "camera_change", "hard_cut"), ENGINE_STUB)
        assert [s["shotIds"] for s in scenes] == [["shot-0001"], ["shot-0002", "shot-0003"]]

    def test_supporting_signals_cannot_argue_a_fade_away(self) -> None:
        # Every signal fires across this boundary — speech carries, the frames
        # match, the shots abut — and the fade still wins. A barrier that could
        # be outvoted is not a barrier.
        shots = tiled("unknown", "fade")
        scenes = group_shots(
            shots,
            ENGINE_STUB,
            transcript=transcript((10000, 20000, "turn-1")),
            histograms={"shot-0001": [1.0, 0.2], "shot-0002": [1.0, 0.2]},
        )
        assert len(scenes) == 2

    def test_a_scene_is_capped_so_it_can_never_be_unbounded(self) -> None:
        # 40 one-second shots, all joinable. Without the cap this is one 40 s
        # scene; the cap is set at 30 s.
        scenes = group_shots(tiled("unknown", *["hard_cut"] * 39), ENGINE_STUB)
        assert len(scenes) > 1
        assert all(s["endTicks"] - s["startTicks"] <= 30 * 15360 for s in scenes)

    def test_non_contiguous_shots_are_not_grouped(self) -> None:
        shots = [shot(1, 0, 15360, "unknown", "hard_cut"), shot(2, 60000, 70000, "hard_cut", "unknown")]
        assert len(group_shots(shots, ENGINE_STUB)) == 2

    def test_scenes_cover_every_shot_exactly_once(self) -> None:
        shots = tiled("unknown", "hard_cut", "fade", "hard_cut", "camera_change")
        scenes = group_shots(shots, ENGINE_STUB)
        grouped = [shot_id for scene in scenes for shot_id in scene["shotIds"]]
        assert grouped == [s["shotId"] for s in shots]

    def test_scene_bounds_match_their_member_shots(self) -> None:
        scenes = group_shots(tiled("unknown", "hard_cut", "fade"), ENGINE_STUB)
        assert scenes[0]["startTicks"] == 0
        assert scenes[0]["endTicks"] == 30720
        assert scenes[1]["startTicks"] == 30720

    def test_no_shots_yields_no_scenes(self) -> None:
        assert group_shots([], ENGINE_STUB) == []

    def test_scene_ids_are_deterministic_and_ordinal(self) -> None:
        scenes = group_shots(tiled("unknown", "fade", "fade"), ENGINE_STUB)
        assert [s["sceneId"] for s in scenes] == ["scene-0001", "scene-0002", "scene-0003"]


class TestGroupingSignalsAreRecorded:
    """`groupingSignals` records WHY a join happened — it is evidence, not decoration."""

    def test_a_single_shot_scene_records_no_signals(self) -> None:
        # It grouped nothing, so claiming a continuity signal would be a lie.
        scenes = group_shots(tiled("unknown", "fade"), ENGINE_STUB)
        assert scenes[0]["groupingSignals"] == []

    def test_transcript_continuity_is_recorded_when_speech_carries_across(self) -> None:
        scenes = group_shots(
            tiled("unknown", "hard_cut"),
            ENGINE_STUB,
            transcript=transcript((10000, 20000, "turn-1")),
        )
        assert scenes[0]["groupingSignals"] == [
            "speaker_continuity",
            "temporal_proximity",
            "transcript_continuity",
        ]

    def test_transcript_continuity_is_absent_without_a_transcript(self) -> None:
        # The control for the test above: same shots, no transcript, so the
        # signal must not appear.
        scenes = group_shots(tiled("unknown", "hard_cut"), ENGINE_STUB)
        assert scenes[0]["groupingSignals"] == ["temporal_proximity"]

    def test_signals_are_sorted_so_the_artefact_is_byte_stable(self) -> None:
        scenes = group_shots(
            tiled("unknown", "hard_cut"),
            ENGINE_STUB,
            transcript=transcript((10000, 20000, "turn-1")),
            histograms={"shot-0001": [1.0, 0.2], "shot-0002": [1.0, 0.21]},
        )
        assert scenes[0]["groupingSignals"] == sorted(scenes[0]["groupingSignals"])


class TestEngineRecord:
    """REQ-012: the rule-set version and every grouping threshold are recorded."""

    def test_the_rule_set_version_is_recorded(self) -> None:
        record = scene_engine_record(DEFAULT_SCENE_CONFIG)
        assert record["version"] == SCENE_RULES_VERSION
        assert {"key": "rules_version", "value": SCENE_RULES_VERSION} in record["parameters"]

    def test_every_grouping_threshold_reaches_the_record(self) -> None:
        record = scene_engine_record(DEFAULT_SCENE_CONFIG)
        keys = {pair["key"] for pair in record["parameters"]}
        assert keys == set(DEFAULT_SCENE_CONFIG)
        for required in (
            "scene_break_transitions",
            "max_scene_seconds",
            "visual_continuity_min_correlation",
            "transcript_continuity_max_gap_seconds",
            "temporal_proximity_max_gap_seconds",
        ):
            assert required in keys

    def test_parameter_values_are_strings(self) -> None:
        for pair in scene_engine_record(DEFAULT_SCENE_CONFIG)["parameters"]:
            assert set(pair) == {"key", "value"}
            assert isinstance(pair["value"], str)


class TestNoUnboundedScene:
    """The phase plan's named failure mode, proved end-to-end on real media."""

    def test_a_fade_fixture_does_not_collapse_into_one_scene(self) -> None:
        shots = shots_for(FADE_MP4)
        scenes = compute_scenes(shots, media_path=FADE_MP4)["scenes"]
        assert len(scenes) >= 2, "the fade must survive grouping as a scene boundary"
        assert not any(
            scene["startTicks"] == 0 and scene["endTicks"] == shots[-1]["endTicks"] for scene in scenes
        ), "no scene may swallow the whole asset"

    def test_a_camera_change_fixture_does_not_collapse_into_one_scene(self) -> None:
        shots = shots_for(CAMERA_CHANGE_MP4)
        scenes = compute_scenes(shots, media_path=CAMERA_CHANGE_MP4)["scenes"]
        assert len(scenes) >= 2
        assert not any(
            scene["startTicks"] == 0 and scene["endTicks"] == shots[-1]["endTicks"] for scene in scenes
        )

    def test_a_hard_cut_only_fixture_may_legitimately_be_one_scene(self) -> None:
        # The counter-case that keeps the rule honest: if EVERY fixture split,
        # the tests above would pass for the wrong reason.
        shots = shots_for(HARD_CUT_MP4)
        scenes = compute_scenes(shots, media_path=HARD_CUT_MP4)["scenes"]
        assert len(scenes) == 1
        assert scenes[0]["shotIds"] == [s["shotId"] for s in shots]


class TestKeyframeHistograms:
    def test_a_histogram_is_produced_for_every_shot(self) -> None:
        shots = shots_for(HARD_CUT_MP4)
        histograms = keyframe_histograms(HARD_CUT_MP4, shots)
        assert set(histograms) == {s["shotId"] for s in shots}

    def test_differently_coloured_shots_have_dissimilar_histograms(self) -> None:
        # hard-cut.mp4 is red / near-white / dark-blue. If the histograms did not
        # separate these, `visual_continuity` would be a signal that always fires.
        shots = shots_for(HARD_CUT_MP4)
        histograms = keyframe_histograms(HARD_CUT_MP4, shots)
        assert pearson_correlation(histograms["shot-0001"], histograms["shot-0003"]) < 1.0

    def test_a_static_take_has_near_identical_histograms(self) -> None:
        shots = shots_for(BROLL_MP4)
        histograms = keyframe_histograms(BROLL_MP4, shots)
        assert pearson_correlation(histograms["shot-0001"], histograms["shot-0002"]) > 0.99

    def test_no_shots_needs_no_decode(self) -> None:
        assert keyframe_histograms(HARD_CUT_MP4, []) == {}


class TestScenesSubStage:
    """`scenes` is separately resumable from `shots` (contract requirement 9)."""

    def test_the_second_run_is_a_cache_hit(self, ctx: SubStageContext) -> None:
        shots = shots_for(FADE_MP4)
        assert run_scenes_sub_stage(ctx, shots, media_path=FADE_MP4).cache_hit is False
        assert run_scenes_sub_stage(ctx, shots, media_path=FADE_MP4).cache_hit is True

    def test_different_shots_invalidate_the_checkpoint(self, ctx: SubStageContext) -> None:
        # Shots are an upstream ARTEFACT, not media, so the context's content
        # hash does not cover them. Without the digest, re-running after a shot
        # threshold change would serve scenes grouped from shots that no longer
        # exist.
        run_scenes_sub_stage(ctx, tiled("unknown", "hard_cut"))
        assert run_scenes_sub_stage(ctx, tiled("unknown", "fade")).cache_hit is False

    def test_adding_a_transcript_invalidates_the_checkpoint(self, ctx: SubStageContext) -> None:
        shots = tiled("unknown", "hard_cut")
        run_scenes_sub_stage(ctx, shots)
        rerun = run_scenes_sub_stage(ctx, shots, transcript=transcript((10000, 20000, "turn-1")))
        assert rerun.cache_hit is False
        assert "transcript_continuity" in rerun.artefact["scenes"][0]["groupingSignals"]

    def test_scenes_and_shots_checkpoint_independently(self, ctx: SubStageContext) -> None:
        from shots import run_shots_sub_stage

        run_shots_sub_stage(ctx, FADE_MP4)
        run_scenes_sub_stage(ctx, shots_for(FADE_MP4))
        assert (ctx.checkpoint_dir / "shots.json").exists()
        assert (ctx.checkpoint_dir / "scenes.json").exists()

    def test_grouping_without_media_still_completes(self, ctx: SubStageContext) -> None:
        # Degraded, not failed: the visual signal is simply never recorded.
        result = run_scenes_sub_stage(ctx, tiled("unknown", "hard_cut"))
        assert result.artefact["scenes"][0]["groupingSignals"] == ["temporal_proximity"]

    def test_grouping_is_byte_identical_across_runs(self) -> None:
        shots = shots_for(FADE_MP4)
        assert canonical_json(compute_scenes(shots, media_path=FADE_MP4)) == canonical_json(
            compute_scenes(shots, media_path=FADE_MP4)
        )
