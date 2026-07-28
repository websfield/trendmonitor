"""Audio-events sub-stage tests (Phase 2 task 6, REQ-015, D-20).

Two tiers, on purpose:

* **Pure-logic tests** — tick conversion, the AudioSet mapping, RMS-delta
  thresholding, merging and ordering. No model, no checkpoint, no torch. These
  always run, and they are where the REQ-015 rules are actually pinned down.
* **`@pytest.mark.slow`** — anything that loads a real engine. The PANNs ones
  additionally skip when the ~320 MB CNN14 checkpoint is not already on the
  machine, so a default run never silently starts a large download.

The REQ-015 rule under test throughout: volume alone is never emotional
importance. It has two halves, and both can fail independently — a loud span
must not be relabelled as applause/laughter/crowd_reaction, AND a loud span must
not become an event at all without classifier corroboration.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
import pytest

from audio_events import (
    AUDIO_EVENT_KINDS,
    AUDIO_SAMPLE_RATE,
    AUDIO_TIMEBASE,
    AUDIOSET_CLASS_COUNT,
    AUDIOSET_TO_KIND,
    ENGINE_ENERGY_CHANGE,
    ENGINE_PANNS,
    ENGINE_RMS,
    ENGINE_VAD,
    FRAME_TICKS,
    PANNS_CHECKPOINT_PATH,
    PANNS_CONFIDENCE_FLOOR,
    PANNS_OWNED_KINDS,
    PANNS_SAMPLE_RATE,
    RMS_DELTA_TRIGGER_DB,
    SILENCE_DBFS_FLOOR,
    VENDORED_CLASS_LABELS,
    Detection,
    build_engine_records,
    build_model_config,
    build_window_spans,
    compute_audio_events,
    corroborate_energy_changes,
    detect_energy_candidates,
    detect_silence_spans,
    detections_from_probabilities,
    frame_dbfs,
    load_audioset_labels,
    map_audioset_class,
    merge_detections,
    probe_audio_stream,
    resample_ticks,
    run_audio_events,
    seconds_to_ticks,
    ticks_to_seconds,
    to_audio_events,
)
from harness import SubStageContext, SubStageError

REPO_CUTDOWN = Path(__file__).resolve().parents[3]
GOLDEN = REPO_CUTDOWN / "data" / "golden-sets" / "ingest"
FIXTURES = REPO_CUTDOWN / "skills" / "index" / "fixtures" / "audio_events"

CLEAN = GOLDEN / "clean.mp4"
SILENT = GOLDEN / "broll-silent.mp4"
#: Generated with FFmpeg (command recorded in fixtures/audio_events/README.md):
#: two 150 ms 440 Hz bursts at t=1.0 and t=2.5 against digital silence.
IMPACT_BURSTS = FIXTURES / "impact-bursts.wav"

CHECKPOINT_PRESENT = PANNS_CHECKPOINT_PATH.exists() and PANNS_CHECKPOINT_PATH.stat().st_size > 3e8
needs_panns = pytest.mark.skipif(
    not CHECKPOINT_PRESENT,
    reason="PANNs CNN14 checkpoint not present; run once with allow_download to fetch it",
)


@pytest.fixture
def ctx(tmp_path: Path) -> SubStageContext:
    return SubStageContext(
        job_id="audio-1",
        asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
        job_root=tmp_path / "jobs" / "audio-1",
        content_hash="c" * 64,
    )


def labels_fixture() -> list[str]:
    return load_audioset_labels()


# ==========================================================================
# Timebase — contract §3
# ==========================================================================


class TestTimebase:
    """Audio ticks ARE sample counts; no float seconds ever reach an artefact."""

    def test_timebase_is_one_over_the_sample_rate(self) -> None:
        assert AUDIO_TIMEBASE == {"num": 1, "den": AUDIO_SAMPLE_RATE}

    def test_one_second_is_exactly_the_sample_rate_in_ticks(self) -> None:
        assert seconds_to_ticks(1.0) == AUDIO_SAMPLE_RATE
        assert seconds_to_ticks(0.5) == 8000

    def test_conversion_returns_an_integer_not_a_float(self) -> None:
        # A float here would propagate into startTicks and break the schema's
        # integer requirement at the far end of the pipeline, not here.
        ticks = seconds_to_ticks(1.234)
        assert isinstance(ticks, int)
        assert ticks == 19744

    def test_round_trip_is_exact_on_sample_boundaries(self) -> None:
        for ticks in (0, 1, 512, 16000, 80214):
            assert seconds_to_ticks(ticks_to_seconds(ticks)) == ticks

    def test_sixteen_to_thirty_two_kilohertz_is_an_exact_doubling(self) -> None:
        # PANNs runs at 32 kHz. Because it is exactly 2x, no window boundary
        # rounds — a non-integer ratio would drift across a long asset.
        for ticks in (0, 1, 511, 16000, 80215):
            assert resample_ticks(ticks, AUDIO_SAMPLE_RATE, PANNS_SAMPLE_RATE) == ticks * 2

    def test_thirty_two_back_to_sixteen_kilohertz_halves(self) -> None:
        assert resample_ticks(32000, PANNS_SAMPLE_RATE, AUDIO_SAMPLE_RATE) == 16000


# ==========================================================================
# The AudioSet -> enum mapping
# ==========================================================================


class TestAudioSetMapping:
    """527 classes onto 8 kinds, explicitly. An unmapped class is DROPPED."""

    def test_the_vendored_label_file_has_all_527_classes(self) -> None:
        assert len(labels_fixture()) == AUDIOSET_CLASS_COUNT

    def test_every_mapping_key_is_a_real_audioset_class(self) -> None:
        # Catches a typo in the table, which would otherwise be invisible: the
        # class simply never matches and the kind silently never fires.
        known = set(labels_fixture())
        unknown = sorted(set(AUDIOSET_TO_KIND) - known)
        assert unknown == [], f"mapping keys absent from AudioSet: {unknown}"

    def test_every_mapping_target_is_a_contract_kind(self) -> None:
        bad = sorted({k for k in AUDIOSET_TO_KIND.values() if k not in AUDIO_EVENT_KINDS})
        assert bad == []

    def test_energy_change_is_never_a_mapping_target(self) -> None:
        # THE REQ-015 rule, at its root. energy_change is a level phenomenon;
        # a classifier cannot see it. Mapping any AudioSet class to it would be
        # precisely the "volume alone is importance" shortcut the requirement
        # forbids, laundered through the classifier.
        assert "energy_change" not in set(AUDIOSET_TO_KIND.values())

    def test_known_classes_map_to_their_kind(self) -> None:
        assert map_audioset_class("Applause") == "applause"
        assert map_audioset_class("Clapping") == "applause"
        assert map_audioset_class("Belly laugh") == "laughter"
        assert map_audioset_class("Cheering") == "crowd_reaction"
        assert map_audioset_class("Gunshot, gunfire") == "impact"
        assert map_audioset_class("Music") == "music"

    def test_an_unmapped_class_returns_none_rather_than_a_neighbour(self) -> None:
        # "Sigh" is adjacent to laughter in AudioSet's ontology and is NOT
        # laughter. Guessing it into the nearest category would put a kind on an
        # event the classifier never claimed.
        assert map_audioset_class("Sigh") is None
        assert map_audioset_class("Vehicle") is None
        assert map_audioset_class("not-an-audioset-class") is None

    def test_the_mapping_covers_every_classifier_owned_kind(self) -> None:
        targets = set(AUDIOSET_TO_KIND.values())
        assert PANNS_OWNED_KINDS <= targets

    def test_speech_and_silence_are_mapped_but_not_classifier_owned(self) -> None:
        # Both appear in the table (it describes AudioSet honestly) but are
        # owned by silero-vad and the dBFS floor. Two detectors emitting one
        # kind would double-report and leave `engine` unable to say which saw it.
        assert map_audioset_class("Speech") == "speech"
        assert map_audioset_class("Silence") == "silence"
        assert "speech" not in PANNS_OWNED_KINDS
        assert "silence" not in PANNS_OWNED_KINDS


# ==========================================================================
# RMS / dBFS
# ==========================================================================


class TestFrameDbfs:
    def test_digital_silence_clamps_to_minus_one_hundred(self) -> None:
        # log10(0) is -inf; without the clamp every delta against silence would
        # be inf and confidence would be NaN.
        dbfs = frame_dbfs(np.zeros(FRAME_TICKS * 4, dtype=np.float32))
        assert np.all(dbfs == -100.0)

    def test_full_scale_is_about_zero_dbfs(self) -> None:
        ones = np.ones(FRAME_TICKS * 2, dtype=np.float32)
        assert frame_dbfs(ones) == pytest.approx(0.0, abs=1e-6)

    def test_half_amplitude_is_about_minus_six_dbfs(self) -> None:
        half = np.full(FRAME_TICKS * 2, 0.5, dtype=np.float32)
        assert frame_dbfs(half) == pytest.approx(-6.0206, abs=1e-3)

    def test_a_trailing_partial_frame_is_dropped_not_zero_padded(self) -> None:
        # Padding would invent quiet audio and could manufacture a silence event
        # at the tail of every asset.
        dbfs = frame_dbfs(np.ones(FRAME_TICKS * 2 + 100, dtype=np.float32))
        assert len(dbfs) == 2

    def test_audio_shorter_than_one_frame_yields_no_frames(self) -> None:
        assert len(frame_dbfs(np.ones(FRAME_TICKS - 1, dtype=np.float32))) == 0


class TestSilenceDetection:
    def test_a_long_quiet_run_becomes_a_silence_detection(self) -> None:
        dbfs = np.array([-90.0] * 20, dtype=np.float64)
        found = detect_silence_spans(dbfs, [])
        assert len(found) == 1
        assert found[0].kind == "silence"
        assert found[0].start_ticks == 0
        assert found[0].end_ticks == 20 * FRAME_TICKS

    def test_loud_audio_yields_no_silence(self) -> None:
        assert detect_silence_spans(np.array([-10.0] * 40), []) == []

    def test_a_run_shorter_than_the_minimum_is_not_reported(self) -> None:
        # 300 ms at 16 kHz = 4800 ticks ~= 9.4 frames, so 5 frames must not pass.
        assert detect_silence_spans(np.array([-90.0] * 5), []) == []

    def test_a_run_just_over_the_minimum_is_reported(self) -> None:
        assert len(detect_silence_spans(np.array([-90.0] * 12), [])) == 1

    def test_the_floor_is_the_boundary_that_decides(self) -> None:
        just_below = np.array([SILENCE_DBFS_FLOOR - 0.1] * 20)
        just_above = np.array([SILENCE_DBFS_FLOOR + 0.1] * 20)
        assert len(detect_silence_spans(just_below, [])) == 1
        assert detect_silence_spans(just_above, []) == []

    def test_silence_is_not_reported_inside_a_speech_span(self) -> None:
        # silero can hold a span across a short intra-word gap. Reporting
        # `silence` there would put two contradictory events on the same ticks.
        dbfs = np.array([-90.0] * 20)
        assert detect_silence_spans(dbfs, [(0, 20 * FRAME_TICKS)]) == []

    def test_silence_outside_the_speech_span_survives(self) -> None:
        # Two separate quiet runs; speech overlaps only the first. The second
        # must still be reported — the VAD exclusion is per-run, not global.
        dbfs = np.array([-90.0] * 12 + [-10.0] * 5 + [-90.0] * 12)
        found = detect_silence_spans(dbfs, [(0, 5 * FRAME_TICKS)])
        assert len(found) == 1
        assert found[0].start_ticks == 17 * FRAME_TICKS

    def test_two_runs_separated_by_sound_stay_two_detections(self) -> None:
        dbfs = np.array([-90.0] * 12 + [-10.0] * 5 + [-90.0] * 12)
        found = detect_silence_spans(dbfs, [])
        assert len(found) == 2
        assert found[0].end_ticks < found[1].start_ticks

    def test_silence_confidence_grows_with_depth_below_the_floor(self) -> None:
        shallow = detect_silence_spans(np.array([SILENCE_DBFS_FLOOR - 2.0] * 20), [])[0]
        deep = detect_silence_spans(np.array([SILENCE_DBFS_FLOOR - 18.0] * 20), [])[0]
        assert deep.confidence > shallow.confidence
        assert 0.0 <= shallow.confidence <= 1.0 and 0.0 <= deep.confidence <= 1.0

    def test_silence_is_produced_by_the_rms_engine(self) -> None:
        assert detect_silence_spans(np.array([-90.0] * 20), [])[0].engine_name == ENGINE_RMS


# ==========================================================================
# RMS-delta thresholding — the energy track
# ==========================================================================


class TestEnergyCandidates:
    def test_a_jump_above_the_trigger_produces_a_candidate(self) -> None:
        dbfs = np.array([-60.0, -60.0, -20.0, -20.0])
        found = detect_energy_candidates(dbfs)
        assert len(found) == 1
        assert found[0].kind == "energy_change"

    def test_a_jump_below_the_trigger_produces_nothing(self) -> None:
        dbfs = np.array([-60.0, -55.0, -50.0, -46.0])  # 5 dB and 4 dB steps
        assert detect_energy_candidates(dbfs) == []

    def test_the_trigger_is_the_boundary_that_decides(self) -> None:
        assert len(detect_energy_candidates(np.array([-60.0, -60.0 + RMS_DELTA_TRIGGER_DB]))) == 1
        assert detect_energy_candidates(np.array([-60.0, -60.0 + RMS_DELTA_TRIGGER_DB - 0.1])) == []

    def test_a_drop_counts_as_much_as_a_rise(self) -> None:
        # A hard cut to silence is as editorially material as a hit. Taking only
        # rises would quietly encode "louder = more important".
        rise = detect_energy_candidates(np.array([-60.0, -20.0]))
        drop = detect_energy_candidates(np.array([-20.0, -60.0]))
        assert len(rise) == 1 and len(drop) == 1
        assert rise[0].confidence == drop[0].confidence

    def test_a_candidate_spans_the_frames_either_side_of_the_jump(self) -> None:
        found = detect_energy_candidates(np.array([-60.0, -60.0, -20.0, -20.0]))[0]
        assert found.start_ticks == 1 * FRAME_TICKS
        assert found.end_ticks == 3 * FRAME_TICKS

    def test_confidence_is_bounded_and_monotone_in_magnitude(self) -> None:
        small = detect_energy_candidates(np.array([-60.0, -46.0]))[0]
        large = detect_energy_candidates(np.array([-60.0, -20.0]))[0]
        assert small.confidence < large.confidence
        assert large.confidence <= 1.0

    def test_an_enormous_jump_saturates_rather_than_exceeding_one(self) -> None:
        found = detect_energy_candidates(np.array([-100.0, 0.0]))[0]
        assert found.confidence == 1.0

    def test_candidates_carry_the_rms_engine_so_they_are_recognisable(self) -> None:
        # They MUST NOT reach an artefact in this state — the schema calls an
        # RMS-only engine on an energy_change a Phase 2 test failure.
        assert detect_energy_candidates(np.array([-60.0, -20.0]))[0].engine_name == ENGINE_RMS


# ==========================================================================
# REQ-015 — the rule that rides along downstream
# ==========================================================================


class TestVolumeIsNeverImportance:
    """Both halves of REQ-015, each able to fail on its own."""

    def test_a_loud_span_alone_is_never_emitted_as_an_event(self) -> None:
        # Half one: the classifier must corroborate. With nothing from PANNs,
        # a 40 dB jump yields no event whatsoever.
        candidates = detect_energy_candidates(np.array([-90.0, -90.0, -20.0, -20.0]))
        assert len(candidates) == 1, "the level track must still propose"
        assert corroborate_energy_changes(candidates, []) == []

    def test_a_corroborated_span_is_emitted_naming_both_tracks(self) -> None:
        candidates = detect_energy_candidates(np.array([-90.0, -90.0, -20.0, -20.0]))
        support = [
            Detection(
                start_ticks=0,
                end_ticks=10 * FRAME_TICKS,
                kind="applause",
                confidence=0.8,
                engine_name=ENGINE_PANNS,
            )
        ]
        emitted = corroborate_energy_changes(candidates, support)
        assert len(emitted) == 1
        assert emitted[0].kind == "energy_change"
        assert emitted[0].engine_name == ENGINE_ENERGY_CHANGE
        assert ENGINE_RMS in emitted[0].engine_name and ENGINE_PANNS in emitted[0].engine_name

    def test_a_corroborated_span_stays_energy_change_and_is_not_relabelled(self) -> None:
        # Half two: even when the corroborating class is applause, the LEVEL
        # event stays `energy_change`. Promoting it on loudness is how a slammed
        # door becomes "the audience loved it".
        candidates = detect_energy_candidates(np.array([-90.0, -20.0]))
        support = [
            Detection(0, 10 * FRAME_TICKS, "applause", 0.9, ENGINE_PANNS),
            Detection(0, 10 * FRAME_TICKS, "laughter", 0.9, ENGINE_PANNS),
            Detection(0, 10 * FRAME_TICKS, "crowd_reaction", 0.9, ENGINE_PANNS),
        ]
        emitted = corroborate_energy_changes(candidates, support)
        assert {d.kind for d in emitted} == {"energy_change"}

    def test_silence_cannot_corroborate_a_level_jump(self) -> None:
        # Self-contradictory: "the level changed, and the classifier confirms
        # there was nothing there."
        candidates = detect_energy_candidates(np.array([-90.0, -20.0]))
        support = [Detection(0, 10 * FRAME_TICKS, "silence", 0.99, ENGINE_PANNS)]
        assert corroborate_energy_changes(candidates, support) == []

    def test_corroboration_requires_temporal_overlap_not_merely_presence(self) -> None:
        # Applause 30 s later does not vindicate a bang at t=0.
        candidates = detect_energy_candidates(np.array([-90.0, -20.0]))
        far_away = [
            Detection(100 * FRAME_TICKS, 110 * FRAME_TICKS, "applause", 0.9, ENGINE_PANNS)
        ]
        assert corroborate_energy_changes(candidates, far_away) == []

    def test_confidence_is_the_weaker_of_the_two_tracks(self) -> None:
        # The event asserts BOTH saw something, so it can be no more confident
        # than whichever saw it less clearly.
        candidates = detect_energy_candidates(np.array([-100.0, 0.0]))  # saturates at 1.0
        assert candidates[0].confidence == 1.0
        support = [Detection(0, 10 * FRAME_TICKS, "impact", 0.31, ENGINE_PANNS)]
        assert corroborate_energy_changes(candidates, support)[0].confidence == pytest.approx(0.31)

    def test_the_classifier_can_never_emit_energy_change_itself(self) -> None:
        # Every AudioSet class at probability 1.0 still produces no
        # energy_change, because no class maps to it and it is not PANNs-owned.
        probs = np.ones((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        found = detections_from_probabilities(probs, [(0, 16000)], labels_fixture())
        assert "energy_change" not in {d.kind for d in found}


# ==========================================================================
# Classifier post-processing (pure — synthetic probability matrices)
# ==========================================================================


class TestDetectionsFromProbabilities:
    def test_a_class_above_the_floor_becomes_a_detection(self) -> None:
        labels = labels_fixture()
        probs = np.zeros((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Applause")] = 0.9
        found = detections_from_probabilities(probs, [(0, 16000)], labels)
        assert [(d.kind, d.confidence) for d in found] == [("applause", pytest.approx(0.9))]

    def test_a_class_below_the_floor_is_dropped(self) -> None:
        labels = labels_fixture()
        probs = np.zeros((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Applause")] = PANNS_CONFIDENCE_FLOOR - 0.01
        assert detections_from_probabilities(probs, [(0, 16000)], labels) == []

    def test_a_class_exactly_at_the_floor_is_kept(self) -> None:
        labels = labels_fixture()
        probs = np.zeros((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Applause")] = PANNS_CONFIDENCE_FLOOR
        assert len(detections_from_probabilities(probs, [(0, 16000)], labels)) == 1

    def test_an_unmapped_class_produces_nothing_however_confident(self) -> None:
        labels = labels_fixture()
        probs = np.zeros((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Vehicle")] = 1.0
        assert detections_from_probabilities(probs, [(0, 16000)], labels) == []

    def test_classifier_speech_is_suppressed_in_favour_of_the_vad(self) -> None:
        labels = labels_fixture()
        probs = np.zeros((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Speech")] = 1.0
        assert detections_from_probabilities(probs, [(0, 16000)], labels) == []

    def test_the_strongest_class_of_a_kind_sets_its_confidence(self) -> None:
        labels = labels_fixture()
        probs = np.zeros((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Applause")] = 0.4
        probs[0, labels.index("Clapping")] = 0.85
        found = detections_from_probabilities(probs, [(0, 16000)], labels)
        assert len(found) == 1
        assert found[0].confidence == pytest.approx(0.85)

    def test_different_kinds_in_one_window_are_both_reported(self) -> None:
        # Overlapping music and applause are two true facts about one second.
        labels = labels_fixture()
        probs = np.zeros((1, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Music")] = 0.7
        probs[0, labels.index("Applause")] = 0.6
        found = detections_from_probabilities(probs, [(0, 16000)], labels)
        assert sorted(d.kind for d in found) == ["applause", "music"]

    def test_consecutive_windows_of_one_kind_merge_into_one_event(self) -> None:
        labels = labels_fixture()
        probs = np.zeros((2, AUDIOSET_CLASS_COUNT), dtype=np.float32)
        probs[0, labels.index("Music")] = 0.6
        probs[1, labels.index("Music")] = 0.8
        found = detections_from_probabilities(probs, [(0, 16000), (8000, 24000)], labels)
        assert len(found) == 1
        assert (found[0].start_ticks, found[0].end_ticks) == (0, 24000)
        assert found[0].confidence == pytest.approx(0.8), "merged confidence is the max"

    def test_a_row_count_mismatch_is_a_structured_error_not_a_crash(self) -> None:
        with pytest.raises(SubStageError) as caught:
            detections_from_probabilities(
                np.zeros((3, AUDIOSET_CLASS_COUNT), dtype=np.float32),
                [(0, 16000)],
                labels_fixture(),
            )
        assert caught.value.code == "AUDIO_EVENTS_SHAPE_MISMATCH"


class TestWindowSpans:
    def test_windows_overlap_by_the_hop(self) -> None:
        spans = build_window_spans(48000)
        assert spans[0] == (0, 16000)
        assert spans[1] == (8000, 24000)

    def test_no_window_runs_past_the_end_of_the_media(self) -> None:
        # A zero-padded overrun looks like a level drop to both tracks.
        spans = build_window_spans(20000)
        assert all(end <= 20000 for _, end in spans)

    def test_media_shorter_than_one_window_yields_a_single_span(self) -> None:
        assert build_window_spans(5000) == [(0, 5000)]

    def test_the_tail_is_covered_by_a_final_window(self) -> None:
        spans = build_window_spans(30000)
        assert spans[-1][1] == 30000

    def test_empty_media_yields_no_windows(self) -> None:
        assert build_window_spans(0) == []


class TestMerging:
    def test_same_kind_overlapping_spans_merge(self) -> None:
        found = merge_detections(
            [
                Detection(0, 1000, "music", 0.5, ENGINE_PANNS),
                Detection(900, 2000, "music", 0.7, ENGINE_PANNS),
            ]
        )
        assert len(found) == 1
        assert (found[0].start_ticks, found[0].end_ticks) == (0, 2000)

    def test_different_kinds_never_merge(self) -> None:
        found = merge_detections(
            [
                Detection(0, 1000, "music", 0.5, ENGINE_PANNS),
                Detection(0, 1000, "applause", 0.5, ENGINE_PANNS),
            ]
        )
        assert len(found) == 2

    def test_different_engines_never_merge(self) -> None:
        found = merge_detections(
            [
                Detection(0, 1000, "silence", 0.5, ENGINE_RMS),
                Detection(0, 1000, "silence", 0.5, ENGINE_PANNS),
            ]
        )
        assert len(found) == 2

    def test_disjoint_spans_stay_separate(self) -> None:
        found = merge_detections(
            [
                Detection(0, 1000, "music", 0.5, ENGINE_PANNS),
                Detection(5000, 6000, "music", 0.5, ENGINE_PANNS),
            ]
        )
        assert len(found) == 2

    def test_merged_confidence_is_the_maximum(self) -> None:
        found = merge_detections(
            [
                Detection(0, 1000, "music", 0.9, ENGINE_PANNS),
                Detection(500, 2000, "music", 0.2, ENGINE_PANNS),
            ]
        )
        assert found[0].confidence == pytest.approx(0.9)

    def test_merging_is_order_independent(self) -> None:
        a = Detection(900, 2000, "music", 0.7, ENGINE_PANNS)
        b = Detection(0, 1000, "music", 0.5, ENGINE_PANNS)
        assert merge_detections([a, b]) == merge_detections([b, a])


# ==========================================================================
# Artefact shape, IDs, determinism — contract §4/§5
# ==========================================================================


class TestArtefactShape:
    def test_events_carry_exactly_the_contract_keys(self) -> None:
        engines = build_engine_records()
        events = to_audio_events([Detection(0, 1000, "speech", 0.5, ENGINE_VAD)], engines)
        assert set(events[0]) == {
            "eventId",
            "kind",
            "startTicks",
            "endTicks",
            "timebase",
            "confidence",
            "engine",
        }

    def test_ticks_are_integers_and_timebase_is_the_audio_one(self) -> None:
        engines = build_engine_records()
        event = to_audio_events([Detection(0, 1000, "speech", 0.5, ENGINE_VAD)], engines)[0]
        assert isinstance(event["startTicks"], int) and isinstance(event["endTicks"], int)
        assert event["timebase"] == {"num": 1, "den": 16000}

    def test_ids_are_deterministic_and_ordered_by_start_tick(self) -> None:
        engines = build_engine_records()
        detections = [
            Detection(5000, 6000, "music", 0.5, ENGINE_PANNS),
            Detection(0, 1000, "speech", 0.5, ENGINE_VAD),
            Detection(2000, 3000, "silence", 0.5, ENGINE_RMS),
        ]
        events = to_audio_events(detections, engines)
        assert [e["eventId"] for e in events] == [
            "audio-event-0001",
            "audio-event-0002",
            "audio-event-0003",
        ]
        assert [e["kind"] for e in events] == ["speech", "silence", "music"]

    def test_ids_do_not_depend_on_input_order(self) -> None:
        # The cache and every downstream reference break if the same input
        # yields different IDs on a different run.
        engines = build_engine_records()
        detections = [
            Detection(5000, 6000, "music", 0.5, ENGINE_PANNS),
            Detection(0, 1000, "speech", 0.5, ENGINE_VAD),
        ]
        assert to_audio_events(detections, engines) == to_audio_events(
            list(reversed(detections)), engines
        )

    def test_an_unknown_kind_is_rejected_rather_than_written(self) -> None:
        with pytest.raises(SubStageError) as caught:
            to_audio_events([Detection(0, 1, "vibes", 0.5, ENGINE_VAD)], build_engine_records())
        assert caught.value.code == "AUDIO_EVENTS_INVALID_KIND"

    def test_an_unregistered_engine_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            to_audio_events([Detection(0, 1, "speech", 0.5, "made-up")], build_engine_records())
        assert caught.value.code == "AUDIO_EVENTS_UNKNOWN_ENGINE"


class TestEngineRecords:
    def test_parameters_are_a_sorted_list_of_string_pairs(self) -> None:
        record = build_engine_records()[ENGINE_VAD]
        assert isinstance(record["parameters"], list)
        keys = [p["key"] for p in record["parameters"]]
        assert keys == sorted(keys)
        assert all(isinstance(p["value"], str) for p in record["parameters"])

    def test_every_threshold_is_recorded_somewhere_in_the_engine_records(self) -> None:
        # REQ-012: thresholds recorded with the index. Missing one makes the
        # artefact unreproducible by anyone reading it.
        recorded = {
            p["key"]
            for record in build_engine_records().values()
            for p in record["parameters"]
        }
        for required in (
            "speechProbability",
            "silenceDbfsFloor",
            "rmsDeltaTriggerDb",
            "confidenceFloor",
        ):
            assert required in recorded, f"{required} is not recorded in any EngineRecord"

    def test_the_energy_change_engine_names_both_tracks(self) -> None:
        # The schema is explicit: an energy_change whose engine is the RMS track
        # alone is a Phase 2 test failure.
        record = build_engine_records()[ENGINE_ENERGY_CHANGE]
        assert ENGINE_RMS in record["name"]
        assert ENGINE_PANNS in record["name"]

    def test_the_energy_change_engine_carries_both_tracks_thresholds(self) -> None:
        keys = {p["key"] for p in build_engine_records()[ENGINE_ENERGY_CHANGE]["parameters"]}
        assert "rmsDeltaTriggerDb" in keys and "confidenceFloor" in keys


class TestModelConfig:
    """REQ-005: the thresholds participate in the cache key."""

    def test_every_threshold_is_present_in_the_model_config(self) -> None:
        config = build_model_config()
        assert config["vad"]["speechProbability"] == pytest.approx(0.5)
        assert config["energy"]["silenceDbfsFloor"] == pytest.approx(SILENCE_DBFS_FLOOR)
        assert config["energy"]["rmsDeltaTriggerDb"] == pytest.approx(RMS_DELTA_TRIGGER_DB)
        assert config["classifier"]["confidenceFloor"] == pytest.approx(PANNS_CONFIDENCE_FLOOR)

    def test_the_config_is_json_serialisable_for_hashing(self) -> None:
        json.dumps(build_model_config(), sort_keys=True)

    def test_the_config_is_computable_without_importing_panns(self) -> None:
        # The cache key must not itself depend on the import that fix (b) keeps
        # lazy — otherwise a missing checkpoint would break even a cache hit.
        # Poison the import so any attempt to reach panns_inference raises.
        import builtins
        import sys

        sys.modules.pop("panns_inference", None)
        real_import = builtins.__import__

        def blocked(name: str, *args: object, **kwargs: object):
            if name.startswith("panns_inference"):
                raise AssertionError("build_model_config must not import panns_inference")
            return real_import(name, *args, **kwargs)

        builtins.__import__ = blocked
        try:
            config = build_model_config()
        finally:
            builtins.__import__ = real_import

        assert config["classifier"]["engine"] == ENGINE_PANNS
        assert config["classifier"]["version"] != "unknown", "version comes from installed metadata"

    def test_the_config_names_the_engines_decisions_d20_settled(self) -> None:
        config = build_model_config()
        assert "silero-vad" in config["vad"]["engine"]
        assert "Cnn14" in config["classifier"]["engine"]


# ==========================================================================
# Vendored label file — the offline contract
# ==========================================================================


class TestVendoredLabels:
    def test_the_label_file_is_vendored_in_the_repo(self) -> None:
        # Fix (a): panns_inference reads this at IMPORT time and shells out to
        # wget when absent — a binary that does not exist on Windows. Vendoring
        # is what makes the build offline-reproducible.
        assert VENDORED_CLASS_LABELS.exists()

    def test_the_vendored_file_is_the_527_class_audioset_index(self) -> None:
        with VENDORED_CLASS_LABELS.open("r", encoding="utf-8", newline="") as handle:
            rows = list(csv.reader(handle))
        assert rows[0] == ["index", "mid", "display_name"]
        assert len(rows) == AUDIOSET_CLASS_COUNT + 1
        assert rows[1][2] == "Speech"

    def test_labels_load_without_importing_panns_inference(self) -> None:
        labels = load_audioset_labels()
        assert labels[0] == "Speech"
        assert len(labels) == AUDIOSET_CLASS_COUNT


# ==========================================================================
# Media probing
# ==========================================================================


class TestProbe:
    def test_clean_has_an_audio_stream(self) -> None:
        has_audio, duration = probe_audio_stream(CLEAN)
        assert has_audio is True
        assert duration > 0

    def test_silent_broll_has_no_audio_stream_at_all(self) -> None:
        # Not a quiet track — no stream. librosa raises NoBackendError on it,
        # which is why the pipeline probes instead of discovering this as a
        # decode crash.
        has_audio, duration = probe_audio_stream(SILENT)
        assert has_audio is False
        assert duration == pytest.approx(4.0, abs=0.1)

    def test_a_missing_file_is_a_structured_input_error(self) -> None:
        with pytest.raises(SubStageError) as caught:
            compute_audio_events(GOLDEN / "does-not-exist.mp4")
        assert caught.value.code == "AUDIO_INPUT_MISSING"
        assert caught.value.exit_code == 2


# ==========================================================================
# Silence: the negative control (no model needed — no audio stream)
# ==========================================================================


class TestSilentBrollNegativeControl:
    """`broll-silent.mp4`: silence events, and NO speech events."""

    def test_silent_broll_yields_silence(self) -> None:
        events = compute_audio_events(SILENT)["audioEvents"]
        assert [e["kind"] for e in events] == ["silence"]

    def test_silent_broll_yields_no_speech(self) -> None:
        # The negative half of the pair. A detector that reported speech here
        # would report it anywhere.
        events = compute_audio_events(SILENT)["audioEvents"]
        assert "speech" not in {e["kind"] for e in events}

    def test_the_silence_spans_the_whole_asset_in_ticks(self) -> None:
        event = compute_audio_events(SILENT)["audioEvents"][0]
        assert event["startTicks"] == 0
        assert event["endTicks"] == seconds_to_ticks(4.0) == 64000
        assert event["timebase"] == {"num": 1, "den": 16000}

    def test_no_model_is_loaded_for_a_stream_less_asset(self) -> None:
        # This is what keeps the negative control in the FAST suite and makes it
        # runnable on a machine with no checkpoint at all.
        import sys

        sys.modules.pop("panns_inference", None)
        compute_audio_events(SILENT)
        assert "panns_inference" not in sys.modules

    def test_the_result_is_byte_identical_across_runs(self) -> None:
        first = json.dumps(compute_audio_events(SILENT), sort_keys=True)
        second = json.dumps(compute_audio_events(SILENT), sort_keys=True)
        assert first == second


# ==========================================================================
# Generated impact fixture — RMS track behaviour on real decoded audio
# ==========================================================================


class TestImpactBurstFixture:
    def test_the_fixture_exists_and_is_sixteen_kilohertz_mono(self) -> None:
        assert IMPACT_BURSTS.exists()
        has_audio, duration = probe_audio_stream(IMPACT_BURSTS)
        assert has_audio is True
        assert duration == pytest.approx(4.0, abs=0.05)

    def test_the_two_bursts_are_found_by_the_rms_delta_track(self) -> None:
        from audio_events import decode_audio

        samples = decode_audio(IMPACT_BURSTS, AUDIO_SAMPLE_RATE)
        candidates = detect_energy_candidates(frame_dbfs(samples))
        # Two bursts, each with a rise and a fall = four level transitions.
        assert len(candidates) == 4
        starts = [c.start_ticks for c in candidates]
        assert starts[0] == pytest.approx(seconds_to_ticks(1.0), abs=FRAME_TICKS * 2)
        assert starts[2] == pytest.approx(seconds_to_ticks(2.5), abs=FRAME_TICKS * 2)

    def test_the_quiet_stretches_are_detected_as_silence(self) -> None:
        from audio_events import decode_audio

        samples = decode_audio(IMPACT_BURSTS, AUDIO_SAMPLE_RATE)
        found = detect_silence_spans(frame_dbfs(samples), [])
        assert len(found) >= 2, "the gaps between and around the bursts are silent"
        assert all(d.kind == "silence" for d in found)

    def test_the_bursts_produce_no_event_without_classifier_corroboration(self) -> None:
        # REQ-015 on real audio: four genuine level transitions, zero events.
        from audio_events import decode_audio

        samples = decode_audio(IMPACT_BURSTS, AUDIO_SAMPLE_RATE)
        candidates = detect_energy_candidates(frame_dbfs(samples))
        assert candidates
        assert corroborate_energy_changes(candidates, []) == []


# ==========================================================================
# Real engines
# ==========================================================================


@pytest.mark.slow
class TestSileroVadRealModel:
    """silero-vad ships its weights in the package — no download needed."""

    def test_clean_yields_speech_where_there_is_speech(self) -> None:
        from audio_events import decode_audio, run_vad

        spans = run_vad(decode_audio(CLEAN, AUDIO_SAMPLE_RATE))
        assert spans, "clean.mp4 contains speech and the VAD must find it"
        assert all(0 <= s < e for s, e in spans)

    def test_vad_spans_are_sample_counts_not_seconds(self) -> None:
        # The one engine boundary needing no conversion: silero returns sample
        # indices at the sampling rate, and our timebase IS that rate.
        from audio_events import decode_audio, run_vad

        samples = decode_audio(CLEAN, AUDIO_SAMPLE_RATE)
        spans = run_vad(samples)
        assert all(isinstance(s, int) and isinstance(e, int) for s, e in spans)
        assert max(e for _, e in spans) <= len(samples)

    def test_the_fixture_with_no_speech_yields_no_speech(self) -> None:
        # Positive/negative pair for the same detector: 440 Hz tone bursts are
        # not speech, and the VAD must not call them speech.
        from audio_events import decode_audio, run_vad

        assert run_vad(decode_audio(IMPACT_BURSTS, AUDIO_SAMPLE_RATE)) == []

    def test_the_vad_is_deterministic_across_runs(self) -> None:
        from audio_events import decode_audio, run_vad

        samples = decode_audio(CLEAN, AUDIO_SAMPLE_RATE)
        assert run_vad(samples) == run_vad(samples)


@pytest.mark.slow
@needs_panns
class TestPannsRealModel:
    def test_panns_imports_after_the_vendored_labels_are_installed(self) -> None:
        # The blocker this task named: `import panns_inference` reads
        # ~/panns_data/class_labels_indices.csv at import time and shells out to
        # wget when it is absent. ensure_panns_labels() populates it first.
        from audio_events import ensure_panns_labels

        ensure_panns_labels()
        import panns_inference

        assert len(panns_inference.labels) == AUDIOSET_CLASS_COUNT

    def test_clean_produces_a_well_formed_artefact(self) -> None:
        events = compute_audio_events(CLEAN)["audioEvents"]
        assert events
        for event in events:
            assert event["kind"] in AUDIO_EVENT_KINDS
            assert 0 <= event["confidence"] <= 1
            assert event["startTicks"] < event["endTicks"]
            assert event["timebase"] == {"num": 1, "den": 16000}

    def test_clean_yields_speech(self) -> None:
        events = compute_audio_events(CLEAN)["audioEvents"]
        assert "speech" in {e["kind"] for e in events}

    def test_no_energy_change_carries_the_rms_engine_alone(self) -> None:
        # The schema's Phase 2 test failure, asserted on a real run.
        events = compute_audio_events(CLEAN)["audioEvents"]
        for event in events:
            if event["kind"] == "energy_change":
                assert event["engine"]["name"] == ENGINE_ENERGY_CHANGE
                assert event["engine"]["name"] != ENGINE_RMS

    def test_the_full_run_is_byte_identical_across_invocations(self) -> None:
        first = json.dumps(compute_audio_events(CLEAN), sort_keys=True)
        second = json.dumps(compute_audio_events(CLEAN), sort_keys=True)
        assert first == second


# ==========================================================================
# Harness integration
# ==========================================================================


class TestSubStageIntegration:
    def test_the_sub_stage_is_registered_under_its_contract_name(self) -> None:
        from audio_events import SUB_STAGE_NAME

        assert SUB_STAGE_NAME == "audio_events"

    def test_running_it_writes_an_artefact_and_a_checkpoint(self, ctx: SubStageContext) -> None:
        result = run_audio_events(ctx, SILENT)
        assert result.cache_hit is False
        assert result.artefact_path.exists()
        assert (ctx.checkpoint_dir / "audio_events.json").exists()

    def test_a_second_run_on_unchanged_content_is_a_cache_hit(self, ctx: SubStageContext) -> None:
        run_audio_events(ctx, SILENT)
        assert run_audio_events(ctx, SILENT).cache_hit is True

    def test_the_artefact_holds_the_audio_events_key(self, ctx: SubStageContext) -> None:
        artefact = run_audio_events(ctx, SILENT).artefact
        assert set(artefact) == {"audioEvents"}
        assert isinstance(artefact["audioEvents"], list)

    def test_a_model_unavailable_failure_leaves_the_stage_resumable(
        self, ctx: SubStageContext, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Fix (b)'s whole point: a missing model must name itself and leave the
        # job resumable, never poison a checkpoint or fabricate a result.
        import audio_events as module
        from harness import ModelUnavailableError, read_checkpoint

        def explode(*_args: object, **_kwargs: object) -> None:
            raise ModelUnavailableError(ENGINE_PANNS, "checkpoint absent and host offline")

        monkeypatch.setattr(module, "run_panns", explode)
        with pytest.raises(ModelUnavailableError) as caught:
            run_audio_events(ctx, CLEAN)

        assert caught.value.to_payload()["details"]["model"] == ENGINE_PANNS
        assert read_checkpoint(ctx, "audio_events") is None

    def test_the_model_config_reaches_the_cache_key(self, ctx: SubStageContext) -> None:
        from harness import compute_cache_key

        with_config = compute_cache_key(ctx, "audio_events", build_model_config())
        without = compute_cache_key(ctx, "audio_events", None)
        assert with_config != without
