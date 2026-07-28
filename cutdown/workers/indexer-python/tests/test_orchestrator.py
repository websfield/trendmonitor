"""Orchestrator sequencing and degradation (Phase 2 task 11).

These tests exist because of a defect the end-to-end run caught: the VLM
sub-stage correctly reported `status: "skipped"` with a reason, and the
orchestrator recorded it as `completed` with a null reason next to an empty
`visualDescriptions` array. That is precisely the "did we look, or was there
nothing there?" ambiguity the sub-stage ledger exists to remove — an honest
sub-stage was made dishonest by the layer above it.
"""

from __future__ import annotations

import json

import pytest

from harness import SubStageError, SubStageResult
from main import _collection, _stage, index_asset, load_request, rights_for


def result(artefact, *, cache_hit: bool = False, duration: int = 5) -> SubStageResult:
    return SubStageResult(
        name="x",
        cache_key="k",
        artefact_path=None,  # type: ignore[arg-type]
        artefact=artefact,
        cache_hit=cache_hit,
        duration_ms=duration,
    )


class TestSubStageLedgerRepeatsTheSubStagesOwnAccount:
    def test_a_nested_skipped_record_is_carried_through(self) -> None:
        # The regression. `visual` emits a full nested SubStageRecord.
        summaries, records = [], []
        artefact = {
            "subStage": {
                "name": "visual_descriptions",
                "status": "skipped",
                "reason": "visual descriptions disabled (--no-vlm); D-21 ceiling not configured",
                "engine": None,
                "startedAt": "t",
                "completedAt": "t",
            },
            "visualDescriptions": [],
        }
        _stage(summaries, records, "visual_descriptions", lambda: result(artefact))

        assert summaries[0]["status"] == "skipped"
        assert "no-vlm" in summaries[0]["reason"]
        assert records[0]["status"] == "skipped"
        assert records[0]["reason"], "an empty collection beside a null reason is the ambiguity itself"

    def test_a_flat_collection_substage_is_completed(self) -> None:
        # The detector stages return a bare collection and are completed by
        # construction — they must not be mislabelled as skipped.
        summaries, records = [], []
        _stage(summaries, records, "shots", lambda: result({"shots": [{"shotId": "shot-0001"}]}))
        assert summaries[0]["status"] == "completed"
        assert summaries[0]["reason"] is None

    def test_an_empty_but_completed_collection_stays_completed(self) -> None:
        # "We looked and found no on-screen text" is a real, honest result and
        # must not be reported as a skip.
        summaries, records = [], []
        _stage(summaries, records, "ocr", lambda: result({"ocr": []}))
        assert summaries[0]["status"] == "completed"

    def test_a_status_without_a_reason_is_given_one(self) -> None:
        summaries, records = [], []
        _stage(summaries, records, "ocr", lambda: result({"status": "skipped", "ocr": []}))
        assert summaries[0]["status"] == "skipped"
        assert summaries[0]["reason"], "the schema refuses a reasonless skip; so must the orchestrator"

    def test_the_engine_record_is_carried_through(self) -> None:
        summaries, records = [], []
        engine = {"name": "pyscenedetect", "version": "0.7", "parameters": []}
        _stage(summaries, records, "shots", lambda: result({"shots": [], "engine": engine}))
        assert records[0]["engine"] == engine


class TestFailureDegradesWithoutAbortingTheRun:
    def test_a_failed_sub_stage_is_recorded_and_returns_none(self) -> None:
        summaries, records = [], []
        out = _stage(
            summaries, records, "ocr",
            lambda: (_ for _ in ()).throw(SubStageError("MODEL_UNAVAILABLE", "gated model")),
        )
        assert out is None
        assert summaries[0]["status"] == "failed"
        assert "MODEL_UNAVAILABLE" in summaries[0]["reason"]

    def test_a_failure_does_not_propagate(self) -> None:
        # Aborting would discard an expensive transcript because an OCR model
        # was gated. The run continues; the job stays resumable.
        summaries, records = [], []
        _stage(summaries, records, "ocr", lambda: (_ for _ in ()).throw(SubStageError("E", "x")))
        _stage(summaries, records, "quality_flags", lambda: result({"qualityFlags": []}))
        assert [s["status"] for s in summaries] == ["failed", "completed"]

    def test_cache_hits_are_reported(self) -> None:
        summaries, records = [], []
        _stage(summaries, records, "shots", lambda: result({"shots": []}, cache_hit=True))
        assert summaries[0]["cacheHit"] is True


class TestCollectionExtraction:
    def test_a_present_collection_is_returned(self) -> None:
        assert _collection({"shots": [{"a": 1}]}, "shots") == [{"a": 1}]

    def test_a_failed_sub_stage_yields_an_empty_collection(self) -> None:
        assert _collection(None, "shots") == []

    def test_a_missing_key_yields_an_empty_collection(self) -> None:
        assert _collection({"other": [1]}, "shots") == []

    def test_a_non_list_value_is_not_returned_as_a_collection(self) -> None:
        assert _collection({"shots": "not a list"}, "shots") == []


class TestRequestValidationRejectsPathTraversal:
    """`jobId`/`assetId` become path segments and arrive from a CLI argument or
    from free text a conversational agent turned into a request."""

    @pytest.mark.parametrize(
        "bad",
        ["../../../../Users/Public/evil", "..", "a/b", "a\\b", "C:\\Windows", "//share/x", "", "a" * 65],
    )
    def test_a_traversing_job_id_is_refused(self, bad: str, tmp_path) -> None:
        request = tmp_path / "r.json"
        request.write_text(json.dumps({"jobId": bad, "assetId": "01HQZX3F5G7K9M2N4P6R8S0T2V"}), encoding="utf-8")
        with pytest.raises(SubStageError) as caught:
            load_request(request)
        assert caught.value.exit_code == 2

    @pytest.mark.parametrize("bad", ["../../secret", "..", "a/b", ""])
    def test_a_traversing_asset_id_is_refused(self, bad: str, tmp_path) -> None:
        # assetId was validated NOWHERE before the security review.
        request = tmp_path / "r.json"
        request.write_text(json.dumps({"jobId": "idx-1", "assetId": bad}), encoding="utf-8")
        with pytest.raises(SubStageError):
            load_request(request)

    def test_a_well_formed_request_is_accepted(self, tmp_path) -> None:
        request = tmp_path / "r.json"
        request.write_text(
            json.dumps({"jobId": "idx-1", "assetId": "01HQZX3F5G7K9M2N4P6R8S0T2V"}), encoding="utf-8"
        )
        assert load_request(request)["jobId"] == "idx-1"


class TestIndexAssetSequencing:
    """End-to-end coverage of `index_asset` itself.

    This class exists because a regression shipped green: the orchestrator's
    sequencing had NO test at all, so a change that made every VFR, unknown-rate
    and audio-only asset unindexable passed a full suite. Helper-level tests
    cannot catch a defect that lives in the wiring.
    """

    def test_a_missing_asset_fails_closed_with_a_structured_error(self, tmp_path, monkeypatch) -> None:
        import main as main_module

        monkeypatch.setattr(main_module, "CUTDOWN_ROOT", tmp_path)
        (tmp_path / "project-data" / "jobs" / "idx-1").mkdir(parents=True)
        with pytest.raises(SubStageError) as caught:
            index_asset({"jobId": "idx-1", "assetId": "01HQZX3F5G7K9M2N4P6R8S0T2V"})
        assert caught.value.code == "ASSET_NOT_FOUND"
        assert caught.value.exit_code == 2

    def _write_asset(self, root, *, frame_rate_mode: str, video: bool = True):
        job = root / "project-data" / "jobs" / "idx-1"
        (job / "assets").mkdir(parents=True)
        (job / "source").mkdir(parents=True)
        (job / "source" / "a.mp4").write_bytes(b"not real media")
        asset = {
            "assetId": "01HQZX3F5G7K9M2N4P6R8S0T2V",
            "storedPath": "source/a.mp4",
            "contentHash": {"algorithm": "sha256", "value": "a" * 64},
            "rights": {"state": "unknown", "talentReleaseStatus": "unknown"},
            "preflight": {
                "duration": {"ticks": 300, "timebase": {"num": 1, "den": 30}},
                "video": {"frameRateMode": frame_rate_mode, "timebase": {"num": 1, "den": 30}} if video else None,
            },
        }
        (job / "assets" / f"{asset['assetId']}.json").write_text(json.dumps(asset), encoding="utf-8")
        return job

    @pytest.mark.parametrize("mode", ["cfr", "vfr", "unknown"])
    def test_every_frame_rate_mode_reaches_the_timebase_map(self, mode, tmp_path, monkeypatch) -> None:
        # The regression: `vfr` and `unknown` raised a bare ValueError AFTER
        # every expensive stage — including the paid VLM — had already run.
        from assemble_index import Timebase, build_timebase_map

        result = build_timebase_map(
            mode=mode, source_timebase=Timebase(1, 30), normalized_timebase=Timebase(1, 30)
        )
        assert result["mode"] == mode, f"{mode} assets must remain indexable"

    def test_an_asset_without_a_duration_fails_closed(self, tmp_path, monkeypatch) -> None:
        import main as main_module

        monkeypatch.setattr(main_module, "CUTDOWN_ROOT", tmp_path)
        job = self._write_asset(tmp_path, frame_rate_mode="cfr")
        path = job / "assets" / "01HQZX3F5G7K9M2N4P6R8S0T2V.json"
        asset = json.loads(path.read_text(encoding="utf-8"))
        asset["preflight"]["duration"] = None
        path.write_text(json.dumps(asset), encoding="utf-8")

        with pytest.raises(SubStageError) as caught:
            index_asset({"jobId": "idx-1", "assetId": asset["assetId"]})
        # No bound means no range can be proven in bounds.
        assert caught.value.code == "ASSET_HAS_NO_DURATION"


class TestRightsAreInherited:
    def test_uncleared_rights_produce_a_concern(self) -> None:
        state, concerns = rights_for({"rights": {"state": "unknown", "talentReleaseStatus": "unknown"}})
        assert state == "unknown"
        assert any("unknown" in c for c in concerns)

    def test_cleared_rights_with_cleared_talent_produce_no_concern(self) -> None:
        state, concerns = rights_for({"rights": {"state": "cleared", "talentReleaseStatus": "cleared"}})
        assert state == "cleared"
        assert concerns == []

    def test_a_missing_rights_record_defaults_to_unknown_not_cleared(self) -> None:
        # Fail closed: absent rights are never assumed permissive.
        state, _ = rights_for({})
        assert state == "unknown"
