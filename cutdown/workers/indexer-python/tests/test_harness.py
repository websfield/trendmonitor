"""Sub-stage harness tests (Phase 2 task 1).

The behaviours proved here are the ones the phase plan names as acceptance
evidence: resume-after-kill, no re-index on unchanged content, and structured
errors that leave a failed sub-stage resumable rather than permanently "done".
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from harness import (
    EXIT_RUNTIME,
    ModelUnavailableError,
    SubStageContext,
    SubStageError,
    compute_cache_key,
    hash_file,
    main_guard,
    read_checkpoint,
    run_sub_stage,
    write_json_atomic,
)


@pytest.fixture
def ctx(tmp_path: Path) -> SubStageContext:
    return SubStageContext(
        job_id="test-1",
        asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
        job_root=tmp_path / "jobs" / "test-1",
        content_hash="a" * 64,
        traceparent="00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    )


def read_run_log(ctx: SubStageContext) -> list[dict]:
    if not ctx.run_log.exists():
        return []
    return [json.loads(line) for line in ctx.run_log.read_text(encoding="utf-8").splitlines() if line]


class TestCacheKeying:
    """REQ-005: content hash + indexer version + model config."""

    def test_same_inputs_produce_the_same_key(self, ctx: SubStageContext) -> None:
        assert compute_cache_key(ctx, "transcript", {"model": "small"}) == compute_cache_key(
            ctx, "transcript", {"model": "small"}
        )

    def test_model_config_changes_the_key(self, ctx: SubStageContext) -> None:
        # The load-bearing one: a different whisper model yields a different
        # transcript for byte-identical media. A key ignoring it serves a stale
        # artefact forever.
        assert compute_cache_key(ctx, "transcript", {"model": "small"}) != compute_cache_key(
            ctx, "transcript", {"model": "medium"}
        )

    def test_content_hash_changes_the_key(self, ctx: SubStageContext) -> None:
        other = SubStageContext(**{**ctx.__dict__, "content_hash": "b" * 64})
        assert compute_cache_key(ctx, "transcript", None) != compute_cache_key(other, "transcript", None)

    def test_indexer_version_changes_the_key(self, ctx: SubStageContext) -> None:
        other = SubStageContext(**{**ctx.__dict__, "indexer_version": "2.0.0"})
        assert compute_cache_key(ctx, "transcript", None) != compute_cache_key(other, "transcript", None)

    def test_sub_stages_do_not_share_a_key(self, ctx: SubStageContext) -> None:
        assert compute_cache_key(ctx, "transcript", None) != compute_cache_key(ctx, "ocr", None)


class TestResume:
    def test_first_run_computes_and_second_run_is_a_cache_hit(self, ctx: SubStageContext) -> None:
        calls = []

        def compute():
            calls.append(1)
            return {"words": ["hello"]}

        first = run_sub_stage(ctx, "transcript", compute)
        assert first.cache_hit is False
        assert first.artefact == {"words": ["hello"]}

        second = run_sub_stage(ctx, "transcript", compute)
        assert second.cache_hit is True, "unchanged content must not be re-indexed"
        assert len(calls) == 1, "the expensive work must not run twice"
        assert second.artefact == {"words": ["hello"]}, "the cached artefact is read back, not re-derived"

    def test_cache_hit_is_logged_so_the_skip_is_visible(self, ctx: SubStageContext) -> None:
        run_sub_stage(ctx, "transcript", lambda: {"ok": True})
        run_sub_stage(ctx, "transcript", lambda: {"ok": True})

        skipped = [e for e in read_run_log(ctx) if e.get("status") == "skipped"]
        assert len(skipped) == 1
        assert skipped[0]["reason"] == "cache-hit"

    def test_changed_model_config_invalidates_the_checkpoint(self, ctx: SubStageContext) -> None:
        run_sub_stage(ctx, "transcript", lambda: {"v": 1}, model_config={"model": "small"})
        rerun = run_sub_stage(ctx, "transcript", lambda: {"v": 2}, model_config={"model": "medium"})
        assert rerun.cache_hit is False
        assert rerun.artefact == {"v": 2}

    def test_force_reruns_even_on_a_valid_checkpoint(self, ctx: SubStageContext) -> None:
        run_sub_stage(ctx, "transcript", lambda: {"v": 1})
        assert run_sub_stage(ctx, "transcript", lambda: {"v": 2}, force=True).cache_hit is False

    def test_a_checkpoint_without_its_artefact_recomputes(self, ctx: SubStageContext) -> None:
        # Exactly the state a crash between the artefact write and the checkpoint
        # write would produce if the order were reversed. Trusting the checkpoint
        # alone would hand the next sub-stage a missing input.
        first = run_sub_stage(ctx, "transcript", lambda: {"v": 1})
        first.artefact_path.unlink()

        rerun = run_sub_stage(ctx, "transcript", lambda: {"v": 2})
        assert rerun.cache_hit is False
        assert rerun.artefact_path.exists()

    def test_a_corrupt_checkpoint_is_treated_as_absent(self, ctx: SubStageContext) -> None:
        run_sub_stage(ctx, "transcript", lambda: {"v": 1})
        (ctx.checkpoint_dir / "transcript.json").write_text("{not json", encoding="utf-8")
        assert run_sub_stage(ctx, "transcript", lambda: {"v": 2}).cache_hit is False

    def test_other_sub_stages_resume_independently(self, ctx: SubStageContext) -> None:
        # "Kill during OCR; re-run → transcript/shots skipped, OCR resumes."
        run_sub_stage(ctx, "transcript", lambda: {"t": 1})
        run_sub_stage(ctx, "shots", lambda: {"s": 1})

        ocr_calls = []
        with pytest.raises(SubStageError):
            run_sub_stage(ctx, "ocr", lambda: (_ for _ in ()).throw(SubStageError("BOOM", "killed mid-OCR")))

        assert run_sub_stage(ctx, "transcript", lambda: {"t": 2}).cache_hit is True
        assert run_sub_stage(ctx, "shots", lambda: {"s": 2}).cache_hit is True

        def ocr_compute():
            ocr_calls.append(1)
            return {"o": 1}

        resumed = run_sub_stage(ctx, "ocr", ocr_compute)
        assert resumed.cache_hit is False, "the killed sub-stage must actually re-run"
        assert len(ocr_calls) == 1


class TestFailureLeavesNoPoisonedState:
    def test_a_failed_sub_stage_writes_no_checkpoint(self, ctx: SubStageContext) -> None:
        with pytest.raises(SubStageError):
            run_sub_stage(ctx, "ocr", lambda: (_ for _ in ()).throw(SubStageError("E", "no")))
        assert read_checkpoint(ctx, "ocr") is None, "a checkpoint would make the failure permanent"

    def test_a_failure_is_recorded_in_the_run_log(self, ctx: SubStageContext) -> None:
        with pytest.raises(SubStageError):
            run_sub_stage(ctx, "ocr", lambda: (_ for _ in ()).throw(SubStageError("E_CODE", "detail")))
        failed = [e for e in read_run_log(ctx) if e.get("status") == "failed"]
        assert len(failed) == 1
        assert failed[0]["error"]["code"] == "E_CODE"

    def test_model_unavailable_names_the_model(self, ctx: SubStageContext) -> None:
        error = ModelUnavailableError("faster-whisper/small", "HF cache is empty and the host is offline")
        payload = error.to_payload()
        assert payload["code"] == "MODEL_UNAVAILABLE"
        assert payload["details"]["model"] == "faster-whisper/small"
        assert payload["skill"] == "index"


class TestAtomicWrites:
    def test_a_written_file_round_trips(self, tmp_path: Path) -> None:
        target = tmp_path / "nested" / "artefact.json"
        write_json_atomic(target, {"b": 2, "a": 1})
        assert json.loads(target.read_text(encoding="utf-8")) == {"a": 1, "b": 2}

    def test_keys_are_canonically_ordered(self, tmp_path: Path) -> None:
        target = tmp_path / "a.json"
        write_json_atomic(target, {"z": 1, "a": 2})
        assert target.read_text(encoding="utf-8") == '{"a":2,"z":1}'

    def test_a_failed_write_leaves_no_temp_file_behind(self, tmp_path: Path) -> None:
        target = tmp_path / "a.json"

        class Unserialisable:
            pass

        with pytest.raises(TypeError):
            write_json_atomic(target, {"bad": Unserialisable()})

        assert not target.exists()
        assert list(tmp_path.iterdir()) == [], "an orphan .tmp would accumulate on every failed run"

    def test_overwrite_replaces_atomically(self, tmp_path: Path) -> None:
        target = tmp_path / "a.json"
        write_json_atomic(target, {"v": 1})
        write_json_atomic(target, {"v": 2})
        assert json.loads(target.read_text(encoding="utf-8")) == {"v": 2}


class TestStructuredErrors:
    def test_structured_error_carries_the_tech_spec_shape(self) -> None:
        payload = SubStageError("C", "m", details={"k": "v"}).to_payload()
        assert set(payload) == {"code", "message", "skill", "skillVersion", "details"}
        assert payload["skill"] == "index"

    def test_main_guard_converts_a_sub_stage_error_to_its_exit_code(self, capsys) -> None:
        code = main_guard(lambda: (_ for _ in ()).throw(SubStageError("C", "m", exit_code=2)))
        assert code == 2
        assert json.loads(capsys.readouterr().err)["code"] == "C"

    def test_main_guard_converts_an_unexpected_exception_too(self, capsys) -> None:
        # The contract says every caller surfaces a structured object, not a
        # stack trace — including for bugs nobody anticipated.
        code = main_guard(lambda: (_ for _ in ()).throw(ValueError("surprise")))
        assert code == EXIT_RUNTIME
        payload = json.loads(capsys.readouterr().err)
        assert payload["code"] == "UNEXPECTED_ERROR"
        assert "surprise" in payload["message"]
        assert "traceback" in payload["details"]

    def test_main_guard_passes_a_success_code_through(self) -> None:
        assert main_guard(lambda: 0) == 0


class TestHashing:
    def test_file_hash_is_stable_and_content_sensitive(self, tmp_path: Path) -> None:
        a, b = tmp_path / "a.bin", tmp_path / "b.bin"
        a.write_bytes(b"hello world")
        b.write_bytes(b"hello world!")
        assert hash_file(a) == hash_file(a)
        assert hash_file(a) != hash_file(b)

    def test_file_hash_matches_a_known_sha256(self, tmp_path: Path) -> None:
        target = tmp_path / "a.bin"
        target.write_bytes(b"abc")
        assert hash_file(target) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


class TestTraceContext:
    def test_traceparent_reaches_the_run_log(self, ctx: SubStageContext) -> None:
        # There is no automatic context propagation across spawn (tech-spec §13),
        # so if it is not threaded explicitly the job's trace silently breaks in two.
        run_sub_stage(ctx, "transcript", lambda: {"v": 1})
        started = [e for e in read_run_log(ctx) if e.get("status") == "started"]
        assert started[0]["traceparent"] == ctx.traceparent
