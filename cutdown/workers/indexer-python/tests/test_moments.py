"""Moment extraction + embeddings (Phase 2 task 9).

decisions.md D-31 fixes two properties this file exists to hold in place:
segmentation is DETERMINISTIC (never model-driven), and Moments land inside a
3–30 second granularity window. The phase plan's acceptance criterion — "every
Moment field of REQ-018 populated or explicitly null-with-reason" — is asserted
against the generated Pydantic model, the same validator the entry gate runs.
"""

from __future__ import annotations

import pytest
from cutdown_contracts.moment_v1 import Moment

from embed import DIMENSIONS, MAX_DIMENSIONS, embed_text
from harness import canonical_json
from ids import derive_ulid
from moments import (
    MAX_SECONDS,
    MIN_SECONDS,
    SEGMENTATION_METHOD,
    Timebase,
    build_moment,
    collect_boundaries,
    link_dependencies,
    segment_ranges,
)

TB = Timebase(1, 30)  # 30 fps: 30 ticks = 1 s
ASSET = "01HQZX3F5G7K9M2N4P6R8S0T2V"
INDEX_ID = derive_ulid("source-index", ASSET, "a" * 64)


def turn(turn_id: str, start: int, end: int, **over):
    base = {
        "turnId": turn_id, "startTicks": start, "endTicks": end,
        "timebase": TB.to_json(), "inferredLabel": "Speaker 1",
        "inferredConfidence": 0.8, "lowConfidence": False, "correction": None,
    }
    base.update(over)
    return base


def shot(shot_id: str, start: int, end: int):
    return {
        "shotId": shot_id, "startTicks": start, "endTicks": end, "timebase": TB.to_json(),
        "transitionIn": "hard_cut", "transitionOut": "hard_cut",
        "keyframeTicks": (start + end) // 2, "confidence": 0.9,
        "engine": {"name": "scenedetect", "version": "0.7", "parameters": []},
    }


def segment(seg_id: str, start: int, end: int, text: str, words=None):
    return {
        "segmentId": seg_id, "startTicks": start, "endTicks": end, "timebase": TB.to_json(),
        "verbatimText": text, "displayText": text, "confidence": 0.9,
        "speakerTurnId": "turn-0001", "words": words or [],
    }


def word(text: str, low: bool = False, proper: bool = False):
    return {
        "startTicks": 0, "endTicks": 1, "timebase": TB.to_json(), "verbatim": text,
        "confidence": 0.4 if low else 0.95, "lowConfidence": low, "properNounCandidate": proper,
    }


def make_moment(start=0, end=300, **over):
    kwargs = dict(
        job_id="test-1", asset_id=ASSET, source_index_id=INDEX_ID,
        start_ticks=start, end_ticks=end, timebase=TB,
        speaker_turns=[turn("turn-0001", 0, 300)], shots=[shot("shot-0001", 0, 300)],
        transcript={"segments": [segment("seg-0001", 0, 300, "hello world")]},
        ocr=[], audio_events=[], quality_flags=[], visual_descriptions=[],
        rights_state="unknown", rights_concerns=[], created_at="2026-07-21T00:00:00Z",
    )
    kwargs.update(over)
    return build_moment(**kwargs)


class TestSegmentationIsDeterministic:
    def test_boundaries_come_from_turns_and_shots_only(self) -> None:
        # D-31: boundaries are detector output, never a model's choice.
        boundaries = collect_boundaries([turn("t1", 0, 90)], [shot("s1", 90, 300)], 300)
        assert boundaries == [0, 90, 300]

    def test_boundaries_always_tile_the_asset(self) -> None:
        boundaries = collect_boundaries([turn("t1", 50, 100)], [], 300)
        assert boundaries[0] == 0 and boundaries[-1] == 300

    def test_out_of_range_detections_are_dropped_not_clamped(self) -> None:
        # A detector reporting past the end is reporting a defect; clamping would
        # hide it and silently produce a plausible-looking range.
        assert 9999 not in collect_boundaries([turn("t1", 0, 9999)], [], 300)

    def test_segmentation_records_its_method_as_the_audit_hook(self) -> None:
        moment = make_moment()
        assert moment["segmentation"]["method"] == SEGMENTATION_METHOD
        assert moment["segmentation"]["speakerTurnIds"] == ["turn-0001"]
        assert moment["segmentation"]["shotIds"] == ["shot-0001"]

    def test_segmentation_is_repeatable(self) -> None:
        assert segment_ranges([0, 90, 300, 600], TB) == segment_ranges([0, 90, 300, 600], TB)


class TestGranularityWindow:
    def test_short_segments_merge_forward(self) -> None:
        # 0-30 is 1 s — below the 3 s floor, so it must not survive alone.
        ranges = segment_ranges([0, 30, 300], TB)
        assert all(TB.seconds(e - s) >= MIN_SECONDS for s, e in ranges)

    def test_a_trailing_runt_merges_backwards(self) -> None:
        # The last segment has nothing to merge forward into.
        ranges = segment_ranges([0, 300, 310], TB)
        assert all(TB.seconds(e - s) >= MIN_SECONDS for s, e in ranges)

    def test_long_segments_split(self) -> None:
        # 0-3000 ticks = 100 s, well over the 30 s ceiling.
        ranges = segment_ranges([0, 3000], TB)
        assert len(ranges) > 1
        assert all(TB.seconds(e - s) <= MAX_SECONDS + 0.001 for s, e in ranges)

    def test_a_split_prefers_a_real_detected_boundary(self) -> None:
        # A real edge is always a better cut than an arbitrary one.
        ranges = segment_ranges([0, 1500, 3000], TB)
        assert any(start == 1500 or end == 1500 for start, end in ranges)

    def test_a_static_take_falls_back_to_even_time_slices(self) -> None:
        # No speech, no cuts — the phase plan requires a deterministic
        # time-sliced fallback rather than one unusable 100 s Moment.
        ranges = segment_ranges([0, 3000], TB)
        assert len(ranges) >= 4
        assert all(TB.seconds(e - s) <= MAX_SECONDS + 0.001 for s, e in ranges)

    def test_ranges_tile_without_gaps_or_overlap(self) -> None:
        ranges = segment_ranges([0, 120, 400, 3000], TB)
        for (_, prev_end), (next_start, _) in zip(ranges, ranges[1:]):
            assert prev_end == next_start, "a gap silently loses footage"
        assert ranges[0][0] == 0 and ranges[-1][1] == 3000

    def test_ranges_are_non_empty(self) -> None:
        assert all(end > start for start, end in segment_ranges([0, 120, 3000], TB))


class TestEveryRequiredFieldIsPopulated:
    def test_a_moment_validates_against_the_generated_model(self) -> None:
        Moment.model_validate(make_moment())

    def test_all_req_018_fields_are_present(self) -> None:
        moment = make_moment()
        for field in (
            "momentId", "envelope", "jobId", "assetId", "sourceIndexId", "sourceRange",
            "durationSeconds", "segmentation", "transcript", "visualSummary", "speakers",
            "entities", "keywords", "energyCues", "technicalQuality", "rights",
            "candidateNarrativeFunctions", "sourceDependencies", "embedding",
        ):
            assert field in moment, f"{field} is required by moment-v1"

    def test_source_range_uses_integer_ticks_not_float_seconds(self) -> None:
        source_range = make_moment()["sourceRange"]
        assert isinstance(source_range["startTicks"], int)
        assert isinstance(source_range["endTicks"], int)
        assert source_range["timebase"] == {"num": 1, "den": 30}


class TestNullWithReasonNeverFabrication:
    def test_a_skipped_vlm_yields_null_visual_summary_with_a_reason(self) -> None:
        moment = make_moment(visual_descriptions=[],
                             visual_absent_reason="--no-vlm: D-21 spend ceiling not set")
        assert moment["visualSummary"]["value"] is None
        assert "no-vlm" in moment["visualSummary"]["absentReason"]

    def test_a_present_description_populates_the_value_and_clears_the_reason(self) -> None:
        moment = make_moment(visual_descriptions=[{
            "descriptionId": "vis-0001", "scope": "shot", "shotId": "shot-0001",
            "startTicks": 0, "endTicks": 300, "timebase": TB.to_json(),
            "text": "a person speaking to camera", "keyframeCount": 2,
            "engine": {"name": "anthropic", "version": "x", "parameters": []},
        }])
        assert moment["visualSummary"]["value"] == "a person speaking to camera"
        assert moment["visualSummary"]["absentReason"] is None

    def test_absent_reason_is_never_silently_empty(self) -> None:
        # An empty visual summary with no reason would be indistinguishable from
        # "we looked and saw nothing".
        assert make_moment(visual_descriptions=[])["visualSummary"]["absentReason"]


class TestQuotationIntegrity:
    def test_verbatim_and_display_text_stay_separate_fields(self) -> None:
        # The deterministic quotation gate tokenises the verbatim side, so a
        # cleaned caption must never be able to launder a misquote past it.
        moment = make_moment(transcript={"segments": [{
            **segment("seg-0001", 0, 300, "um we we grew by ten percent"),
            "displayText": "We grew by ten percent",
        }]})
        assert moment["transcript"]["verbatimText"] == "um we we grew by ten percent"
        assert moment["transcript"]["displayText"] == "We grew by ten percent"

    def test_low_confidence_words_are_counted(self) -> None:
        moment = make_moment(transcript={"segments": [segment(
            "seg-0001", 0, 300, "hello world",
            words=[word("hello"), word("world", low=True), word("again", low=True)],
        )]})
        assert moment["transcript"]["lowConfidenceWordCount"] == 2
        assert moment["transcript"]["wordCount"] == 3


class TestSpeakerIdentity:
    def test_an_uncorrected_label_is_marked_uncorrected(self) -> None:
        # The editorial gate treats an uncorrected label as an UNVERIFIED identity.
        speaker = make_moment()["speakers"][0]
        assert speaker["isCorrected"] is False
        assert speaker["label"] == "Speaker 1"

    def test_a_correction_wins_and_is_flagged(self) -> None:
        corrected = turn("turn-0001", 0, 300,
                         correction={"name": "Dr Ada Lovelace", "author": "fred",
                                     "correctedAt": "2026-07-21T00:00:00Z"})
        speaker = make_moment(speaker_turns=[corrected])["speakers"][0]
        assert speaker["label"] == "Dr Ada Lovelace"
        assert speaker["isCorrected"] is True


class TestEnergyCuesAndQuality:
    def test_volume_alone_is_never_an_energy_cue(self) -> None:
        # REQ-015: speech and silence are presence facts, not emotional signals.
        moment = make_moment(audio_events=[{
            "eventId": "audio-0001", "kind": "speech", "startTicks": 0, "endTicks": 300,
            "timebase": TB.to_json(), "confidence": 0.99,
            "engine": {"name": "silero-vad", "version": "6.2.1", "parameters": []},
        }])
        assert moment["energyCues"] == []

    def test_a_classified_event_becomes_a_cue_naming_its_evidence(self) -> None:
        moment = make_moment(audio_events=[{
            "eventId": "audio-0002", "kind": "laughter", "startTicks": 0, "endTicks": 60,
            "timebase": TB.to_json(), "confidence": 0.7,
            "engine": {"name": "panns", "version": "cnn14", "parameters": []},
        }])
        cue = moment["energyCues"][0]
        assert cue["kind"] == "laughter"
        assert cue["audioEventIds"] == ["audio-0002"], "a cue must trace back to classified evidence"

    def test_quality_rollup_takes_the_worst_severity(self) -> None:
        def flag(flag_id, kind, severity):
            return {"flagId": flag_id, "kind": kind, "startTicks": 0, "endTicks": 300,
                    "timebase": TB.to_json(), "severity": severity, "score": 1.0,
                    "threshold": {"name": "t", "value": 1.0, "comparison": "greater_than"},
                    "engine": {"name": "quality", "version": "1", "parameters": []}}
        moment = make_moment(quality_flags=[flag("q1", "blur", "info"), flag("q2", "shake", "severe")])
        assert moment["technicalQuality"]["worstSeverity"] == "severe"
        assert set(moment["technicalQuality"]["flagKinds"]) == {"blur", "shake"}
        assert moment["technicalQuality"]["usable"] is False

    def test_a_clean_moment_reports_no_flags(self) -> None:
        quality = make_moment()["technicalQuality"]
        assert quality["flagKinds"] == [] and quality["worstSeverity"] == "none"
        assert quality["usable"] is True


class TestRightsAndNarrative:
    def test_rights_are_inherited_not_restated(self) -> None:
        moment = make_moment(rights_state="restricted", rights_concerns=["no paid amplification"])
        assert moment["rights"]["state"] == "restricted"
        assert moment["rights"]["concerns"] == ["no paid amplification"]

    def test_narrative_functions_are_heuristic_sourced_at_phase_0(self) -> None:
        # `model` entries are advisory evidence and can never become blocking.
        for candidate in make_moment()["candidateNarrativeFunctions"]:
            assert candidate["source"] == "heuristic"
            assert candidate["rationale"]

    def test_a_cta_phrase_is_detected(self) -> None:
        moment = make_moment(transcript={"segments": [segment("s1", 0, 300, "link in bio to buy")]})
        assert any(c["function"] == "cta" for c in moment["candidateNarrativeFunctions"])

    def test_there_is_always_at_least_one_candidate(self) -> None:
        moment = make_moment(transcript={"segments": [segment("s1", 0, 300, "mm")]})
        assert len(moment["candidateNarrativeFunctions"]) >= 1


class TestDependencies:
    def test_a_back_referencing_moment_requires_its_setup(self) -> None:
        first = make_moment(0, 300, transcript={"segments": [segment("s1", 0, 300, "we tried three things")]})
        second = make_moment(300, 600, transcript={"segments": [segment("s2", 300, 600, "so we shipped it")]})
        linked = link_dependencies([first, second])
        assert linked[1]["sourceDependencies"] == [
            {"momentId": first["momentId"], "relation": "requires_setup"}
        ]

    def test_the_first_moment_never_depends_on_anything(self) -> None:
        first = make_moment(0, 300, transcript={"segments": [segment("s1", 0, 300, "so we shipped it")]})
        assert link_dependencies([first])[0]["sourceDependencies"] == []

    def test_an_independent_moment_has_no_dependency(self) -> None:
        a = make_moment(0, 300)
        b = make_moment(300, 600, transcript={"segments": [segment("s2", 300, 600, "here is a new topic")]})
        assert link_dependencies([a, b])[1]["sourceDependencies"] == []


class TestEmbedding:
    class FakeEncoder:
        """Deterministic stand-in — tests must not download a model."""

        def __init__(self, dims: int = DIMENSIONS) -> None:
            self.dims = dims
            self.calls: list[list[str]] = []

        def encode(self, sentences, **kwargs):
            self.calls.append(sentences)
            return [[0.1] * self.dims]

    def test_text_produces_a_384_dimension_vector(self) -> None:
        result = embed_text("hello world", self.FakeEncoder())
        assert result["dimensions"] == DIMENSIONS
        assert len(result["vector"]) == DIMENSIONS
        assert result["model"] == "BAAI/bge-small-en-v1.5"

    def test_empty_text_yields_no_embedding_not_a_zero_vector(self) -> None:
        # A zero vector is a real point in the space and would match by accident.
        assert embed_text("", self.FakeEncoder()) is None
        assert embed_text("   ", self.FakeEncoder()) is None

    def test_the_model_id_is_recorded_for_every_vector(self) -> None:
        # Vectors from different models are not comparable; recording the ID is
        # what makes a later re-embed detectable instead of silently mixed.
        assert embed_text("x", self.FakeEncoder())["modelVersion"] == "1.5"

    def test_a_model_over_the_dimension_cap_is_rejected(self) -> None:
        # moment-v1 caps dimensions so the Stage B pgvector migration stays possible.
        with pytest.raises(ValueError, match=str(MAX_DIMENSIONS)):
            embed_text("x", self.FakeEncoder(dims=MAX_DIMENSIONS + 1))

    def test_vectors_are_plain_json_serialisable_floats(self) -> None:
        canonical_json(embed_text("x", self.FakeEncoder()))

    def test_a_moment_carries_its_embedding_inline(self) -> None:
        # Stored ON the Moment so Phase 3 retrieval reads vectors from disk and
        # never calls Python.
        embedding = embed_text("hello", self.FakeEncoder())
        Moment.model_validate(make_moment(embedding=embedding))

    def test_a_moment_without_an_embedding_is_still_valid(self) -> None:
        Moment.model_validate(make_moment(embedding=None))
