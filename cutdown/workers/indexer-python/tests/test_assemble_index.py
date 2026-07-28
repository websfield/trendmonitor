"""Index assembly + deterministic identity (Phase 2 tasks 8, 9-support).

The assertions that matter here are contract conformance (every produced index
validates against the SAME generated Pydantic model the entry gate uses) and
byte-level determinism (tech-spec §12 — a deterministic stage re-run on
identical input must produce identical bytes).
"""

from __future__ import annotations

import re

import pytest
from cutdown_contracts.source_index_v1 import SourceIndex

from assemble_index import (
    SUB_STAGE_ORDER,
    Timebase,
    assemble_index,
    build_timebase_map,
    convert_ticks,
    rescale_item,
    rescale_items,
    sub_stage_record,
)
from harness import canonical_json
from ids import derive_ulid, ordinal_id

ULID_PATTERN = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")

TB_30 = Timebase(1, 30)
TB_2997 = Timebase(1001, 30000)
TB_48K = Timebase(1, 48000)
HASH = "a" * 64
ASSET = "01HQZX3F5G7K9M2N4P6R8S0T2V"


def minimal_index(**overrides):
    kwargs = dict(
        job_id="test-1",
        asset_id=ASSET,
        source_content_hash=HASH,
        timebase_map=build_timebase_map(mode="cfr", source_timebase=TB_30, normalized_timebase=TB_30),
        sub_stages=[
            sub_stage_record("transcript", "completed", started_at="2026-07-21T00:00:00Z",
                             completed_at="2026-07-21T00:00:01Z")
        ],
        created_at="2026-07-21T00:00:00Z",
    )
    kwargs.update(overrides)
    return assemble_index(**kwargs)


class TestDeterministicIdentity:
    def test_derived_id_matches_the_ulid_contract(self) -> None:
        # Every consumer validates against this pattern; a derived ID that fails
        # it would be rejected downstream rather than merely unusual.
        assert ULID_PATTERN.match(derive_ulid("a", "b"))

    def test_same_inputs_give_the_same_id(self) -> None:
        assert derive_ulid("source-index", ASSET, HASH) == derive_ulid("source-index", ASSET, HASH)

    def test_different_inputs_give_different_ids(self) -> None:
        assert derive_ulid("source-index", ASSET, HASH) != derive_ulid("source-index", ASSET, "b" * 64)

    def test_field_separator_prevents_boundary_collisions(self) -> None:
        # Without a separator, ("ab","c") and ("a","bc") would concatenate to the
        # same string and collide — a subtle, silent identity bug.
        assert derive_ulid("ab", "c") != derive_ulid("a", "bc")

    def test_ordinal_ids_are_zero_padded_and_stable(self) -> None:
        assert ordinal_id("shot", 7) == "shot-0007"
        assert ordinal_id("ocr", 1234) == "ocr-1234"


class TestTickConversion:
    def test_identity_conversion_is_exact(self) -> None:
        assert convert_ticks(300, TB_30, TB_30) == 300

    def test_video_to_audio_timebase(self) -> None:
        # 300 ticks @ 30fps = 10 s = 480000 samples @ 48 kHz.
        assert convert_ticks(300, TB_30, TB_48K) == 480_000

    def test_ntsc_conversion_does_not_drift(self) -> None:
        # 30000/1001 fps is the case that punishes float arithmetic.
        assert convert_ticks(30_000, TB_2997, TB_48K) == convert_ticks(30_000, TB_2997, TB_48K)
        assert convert_ticks(30_000, TB_2997, TB_48K) == 48_048_000

    def test_large_tick_counts_stay_exact(self) -> None:
        fine = Timebase(1, 1_000_000_000)
        assert convert_ticks(9_007_199_254_740_993, fine, fine) == 9_007_199_254_740_993


class TestTimebaseMap:
    def test_cfr_carries_no_entries(self) -> None:
        # The linear relation is exact and sufficient; one entry per frame would
        # bloat the artefact without adding information.
        result = build_timebase_map(mode="cfr", source_timebase=TB_30, normalized_timebase=TB_30,
                                    presentation_ticks=[0, 1, 2])
        assert result["entries"] == []

    def test_vfr_records_observed_presentation_timestamps(self) -> None:
        result = build_timebase_map(mode="vfr", source_timebase=TB_30, normalized_timebase=TB_48K,
                                    presentation_ticks=[0, 15, 30])
        assert result["entries"] == [
            {"sourceTicks": 0, "normalizedTicks": 0},
            {"sourceTicks": 15, "normalizedTicks": 24_000},
            {"sourceTicks": 30, "normalizedTicks": 48_000},
        ]

    def test_unknown_mode_is_treated_as_cautiously_as_vfr(self) -> None:
        # We cannot prove the source is constant, so we do not assume it.
        result = build_timebase_map(mode="unknown", source_timebase=TB_30, normalized_timebase=TB_30,
                                    presentation_ticks=[0, 5])
        assert len(result["entries"]) == 2

    def test_an_invalid_mode_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            build_timebase_map(mode="sometimes", source_timebase=TB_30, normalized_timebase=TB_30)


class TestTimebaseNormalisation:
    """The defect the old suite was structurally blind to.

    Every prior fixture put turns, shots, OCR, audio and quality on ONE
    timebase, so mixing them was invisible. In production they are not: the
    transcript counts 16 kHz samples, shots count container video ticks, and
    quality mixes frame indices with sample indices. A 16 kHz tick is
    numerically LARGER than the video tick for the same instant, so the error
    does not merely misplace a boundary — it pushes it past the duration filter,
    which then discards it with no record.
    """

    def test_a_16khz_turn_rescales_onto_the_video_timebase(self) -> None:
        turn = {
            "turnId": "turn-0001", "startTicks": 0, "endTicks": 79680,
            "timebase": {"num": 1, "den": 16000},
        }
        rescaled = rescale_item(turn, TB_30)
        # 79680 samples @16 kHz = 4.98 s = 149.4 -> 149 ticks @30 fps.
        assert rescaled["endTicks"] == 149
        assert rescaled["timebase"] == {"num": 1, "den": 30}

    def test_the_observed_production_case_stops_being_dropped(self) -> None:
        # Real numbers from job idx-1: a turn ending at 4.98 s was compared
        # against a 5.0 s asset as raw integers (79680 > 76800) and silently
        # discarded as out of range.
        video_tb = Timebase(1, 15360)
        turn = {"turnId": "t", "startTicks": 0, "endTicks": 79680, "timebase": {"num": 1, "den": 16000}}
        rescaled = rescale_item(turn, video_tb)
        duration_ticks = 76800
        assert rescaled["endTicks"] <= duration_ticks, (
            "after rescaling the turn end is inside the asset and survives the duration filter"
        )
        # 79680 * (15360/16000) = 76492.8 exactly, rounded once at the end.
        assert rescaled["endTicks"] == 76493

    def test_nested_words_inside_segments_are_rescaled_too(self) -> None:
        segment = {
            "segmentId": "seg-0001", "startTicks": 0, "endTicks": 16000,
            "timebase": {"num": 1, "den": 16000},
            "words": [{"startTicks": 8000, "endTicks": 16000, "timebase": {"num": 1, "den": 16000}}],
        }
        out = rescale_item(segment, TB_30)
        assert out["endTicks"] == 30
        assert out["words"][0]["startTicks"] == 15, "a word left in samples would misplace every quote"

    def test_keyframe_ticks_are_rescaled(self) -> None:
        shot = {
            "shotId": "shot-0001", "startTicks": 0, "endTicks": 32000, "keyframeTicks": 16000,
            "timebase": {"num": 1, "den": 16000},
        }
        assert rescale_item(shot, TB_30)["keyframeTicks"] == 30

    def test_an_item_already_in_the_target_timebase_is_unchanged(self) -> None:
        shot = {"shotId": "s", "startTicks": 30, "endTicks": 60, "timebase": {"num": 1, "den": 30}}
        assert rescale_item(shot, TB_30) == shot

    def test_rescaling_does_not_mutate_the_input(self) -> None:
        turn = {"turnId": "t", "startTicks": 0, "endTicks": 16000, "timebase": {"num": 1, "den": 16000}}
        rescale_item(turn, TB_30)
        assert turn["endTicks"] == 16000, "sub-stage artefacts are cached; mutating one corrupts the cache"

    def test_an_item_without_a_timebase_is_left_alone(self) -> None:
        # Not everything in an artefact is time-valued.
        assert rescale_item({"engine": {"name": "x"}}, TB_30) == {"engine": {"name": "x"}}

    def test_a_collection_rescales_elementwise(self) -> None:
        items = [
            {"a": 1, "startTicks": 16000, "endTicks": 32000, "timebase": {"num": 1, "den": 16000}},
            {"a": 2, "startTicks": 0, "endTicks": 16000, "timebase": {"num": 1, "den": 16000}},
        ]
        out = rescale_items(items, TB_30)
        assert [i["endTicks"] for i in out] == [60, 30]


class TestVfrMapIsHonestWithoutBeingAnOutage:
    """The identity case is honest; a genuine re-basing without a mapping is not.

    An earlier revision refused every non-CFR asset outright, which made VFR,
    unknown-rate and audio-only assets unindexable — VFR being the exact case
    REQ-019 exists to serve. Trading a silent lie for a hard outage is not a fix.
    """

    def test_a_vfr_asset_in_its_own_timebase_is_indexable(self) -> None:
        # Identity normalisation: ticks are already in the container's exact
        # integer timebase, which is true of VFR presentation timestamps too.
        result = build_timebase_map(mode="vfr", source_timebase=TB_30, normalized_timebase=TB_30)
        assert result["mode"] == "vfr"
        assert result["entries"] == []

    def test_an_unknown_rate_asset_is_indexable(self) -> None:
        # `unknown` is emitted deliberately to carry uncertainty; refusing it
        # would make an audio-only asset unindexable, since it has no video.
        assert build_timebase_map(mode="unknown", source_timebase=TB_30, normalized_timebase=TB_30)["entries"] == []

    def test_cfr_still_needs_no_entries(self) -> None:
        assert build_timebase_map(
            mode="cfr", source_timebase=TB_30, normalized_timebase=TB_30
        )["entries"] == []

    def test_a_genuine_rebasing_without_a_mapping_is_refused(self) -> None:
        # Here the two timebases really differ, so a mapping must exist.
        with pytest.raises(ValueError, match="mapping must be supplied"):
            build_timebase_map(mode="vfr", source_timebase=TB_30, normalized_timebase=TB_48K)

    def test_a_rebasing_with_a_mapping_is_accepted(self) -> None:
        result = build_timebase_map(
            mode="vfr", source_timebase=TB_30, normalized_timebase=TB_48K,
            presentation_ticks=[0, 15, 30],
        )
        assert len(result["entries"]) == 3


class TestSubStageLedger:
    def test_a_skip_without_a_reason_is_rejected(self) -> None:
        # This is the ambiguity the ledger exists to remove: an empty result plus
        # no reason cannot distinguish "did not look" from "found nothing".
        with pytest.raises(ValueError, match="reason"):
            sub_stage_record("visual_descriptions", "skipped", started_at="2026-07-21T00:00:00Z")

    def test_a_failure_without_a_reason_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="reason"):
            sub_stage_record("ocr", "failed", started_at="2026-07-21T00:00:00Z")

    def test_a_skip_with_a_reason_is_accepted(self) -> None:
        record = sub_stage_record("visual_descriptions", "skipped", started_at="2026-07-21T00:00:00Z",
                                  reason="--no-vlm: D-21 spend ceiling not set")
        assert record["reason"].startswith("--no-vlm")

    def test_an_unknown_sub_stage_name_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            sub_stage_record("vibes", "completed", started_at="2026-07-21T00:00:00Z")

    def test_records_are_ordered_by_pipeline_not_completion(self) -> None:
        out_of_order = [
            sub_stage_record("quality_flags", "completed", started_at="t"),
            sub_stage_record("transcript", "completed", started_at="t"),
            sub_stage_record("shots", "completed", started_at="t"),
        ]
        index = minimal_index(sub_stages=out_of_order)
        names = [record["name"] for record in index["subStages"]]
        assert names == sorted(names, key=SUB_STAGE_ORDER.index)


class TestContractConformance:
    def test_a_minimal_index_validates_against_the_generated_model(self) -> None:
        # The strongest available assertion: the SAME validator the entry gate runs.
        SourceIndex.model_validate(minimal_index())

    def test_every_required_field_is_present(self) -> None:
        index = minimal_index()
        for field in (
            "indexId", "envelope", "jobId", "assetId", "sourceContentHash", "indexerVersion",
            "timebaseMap", "subStages", "transcript", "speakerTurns", "shots", "scenes",
            "ocr", "visualDescriptions", "audioEvents", "qualityFlags",
        ):
            assert field in index, f"{field} is required by source-index-v1"

    def test_absent_sub_stages_yield_empty_collections_not_placeholders(self) -> None:
        index = minimal_index()
        assert index["shots"] == []
        assert index["ocr"] == []
        assert index["transcript"] is None

    def test_a_bad_content_hash_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="sha256"):
            minimal_index(source_content_hash="tooshort")


class TestDeterminism:
    def test_assembly_is_byte_identical_across_runs(self) -> None:
        # tech-spec §12: a deterministic stage re-run on identical input must
        # produce identical bytes, or the determinism assertion is untestable.
        assert canonical_json(minimal_index()) == canonical_json(minimal_index())

    def test_collections_are_sorted_by_start_time(self) -> None:
        shots = [
            {"shotId": "shot-0002", "startTicks": 90, "endTicks": 180},
            {"shotId": "shot-0001", "startTicks": 0, "endTicks": 90},
        ]
        index = minimal_index(shots=shots)
        assert [s["shotId"] for s in index["shots"]] == ["shot-0001", "shot-0002"]

    def test_input_order_does_not_change_the_bytes(self) -> None:
        a = [{"ocrId": "ocr-0001", "startTicks": 0, "endTicks": 10},
             {"ocrId": "ocr-0002", "startTicks": 10, "endTicks": 20}]
        assert canonical_json(minimal_index(ocr=a)) == canonical_json(minimal_index(ocr=list(reversed(a))))

    def test_the_index_id_is_a_function_of_content_not_of_time(self) -> None:
        early = minimal_index(created_at="2026-01-01T00:00:00Z")
        late = minimal_index(created_at="2027-01-01T00:00:00Z")
        assert early["indexId"] == late["indexId"], (
            "a time-based ID would break the REQ-005 cache: two identical re-runs "
            "would differ in the ID alone"
        )
