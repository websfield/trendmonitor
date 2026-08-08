"""Sub-stage harness tests (Phase 2 task 1).

The behaviours proved here are the ones the phase plan names as acceptance
evidence: resume-after-kill, no re-index on unchanged content, and structured
errors that leave a failed sub-stage resumable rather than permanently "done".
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from harness import (
    EXIT_INPUT_VALIDATION,
    EXIT_RUNTIME,
    ModelUnavailableError,
    SubStageContext,
    SubStageError,
    assert_safe_id,
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


class TestSafeIdentifiers:
    """`assert_safe_id` is this worker's OWN guard, and it had no tests.

    It is duplicated from `apps/cli/src/paths.ts` deliberately — the worker is
    documented as directly invocable (`uv run ... main.py --input <request.json>`),
    so a guard living only in the caller is a guard with a documented bypass. An
    untested duplicate is the next stage of the same problem: the two copies drift
    and nothing notices.
    """

    def test_traversal_shapes_are_refused(self) -> None:
        for bad in ["..", "../..", "a/../b", "a/b", "a\\b", "/abs", "job..1"]:
            with pytest.raises(SubStageError) as caught:
                assert_safe_id(bad, "jobId")
            assert caught.value.code == "UNSAFE_IDENTIFIER"
            assert caught.value.exit_code == EXIT_INPUT_VALIDATION

    def test_an_id_may_not_start_with_a_dot_dash_or_underscore(self) -> None:
        for bad in [".hidden", "-lead", "_lead", ""]:
            with pytest.raises(SubStageError):
                assert_safe_id(bad, "jobId")

    def test_a_windows_reserved_DEVICE_name_is_refused(self) -> None:
        # Not a traversal. `nul` genuinely misbehaves on the D-33 platform — see
        # `TestWindowsDeviceNamesReallyMisbehave`, which measures it rather than
        # asserting it in prose — and the rest are refused for portability across
        # Windows builds and APIs. `nul.json` is included because the stem is what
        # the reserved namespace keys on.
        for bad in ["nul", "NUL", "con", "Aux", "com1", "LPT9", "nul.json"]:
            with pytest.raises(SubStageError) as caught:
                assert_safe_id(bad, "jobId")
            assert caught.value.code == "UNSAFE_IDENTIFIER"
            assert "Windows reserved namespace" in caught.value.message

    def test_ordinary_ids_are_accepted(self) -> None:
        # The acceptance half: a guard that refuses everything passes every
        # rejection test ever written. `nul-check`/`falcon` also prove the device
        # rule anchors at the stem instead of matching anywhere in the string.
        for good in [
            "01HQZX3F5G7K9M2N4P6R8S0T2V",
            "idx-1",
            "job_1.a",
            "nul-check",
            "falcon",
            "com10",
        ]:
            assert assert_safe_id(good, "jobId") == good


class TestSafeIdMirrorsAgree:
    """THE SHARED FIXTURE — one case list, three mirrors, one verdict each.

    `assert_safe_id` here, `assertSafeId` in `@cutdown/skill-runtime`, and
    `assertSafeJobId` in `apps/cli` are deliberate duplicates: each entrypoint is
    independently invocable, so a guard living only in the caller is a guard with
    a documented bypass. Three copies with three separate test suites is how they
    drift — and they HAD drifted. Python's `$` also matches just before a
    trailing newline while JavaScript's does not, so `"abc\\n"` was ACCEPTED
    here and REJECTED by both TypeScript mirrors, in the one copy reachable
    without the CLI. `_SAFE_ID` now anchors with `\\Z`, and this fixture is what
    stops the next divergence being found by a security review instead of a test.
    """

    CASES = json.loads(
        (
            Path(__file__).resolve().parents[3]
            / "packages"
            / "skill-runtime"
            / "tests"
            / "safe-id-cases.json"
        ).read_text(encoding="utf-8")
    )

    def test_every_rejected_case_is_rejected_here_too(self) -> None:
        for bad in self.CASES["reject"]:
            with pytest.raises(SubStageError, match="Invalid jobId"):
                assert_safe_id(bad, "jobId")

    def test_every_accepted_case_is_accepted_here_too(self) -> None:
        for good in self.CASES["accept"]:
            assert assert_safe_id(good, "jobId") == good

    def test_the_trailing_newline_case_specifically(self) -> None:
        # Named on its own because it is the divergence that actually happened,
        # and a regression would otherwise hide inside a 40-case loop.
        with pytest.raises(SubStageError):
            assert_safe_id("abc\n", "jobId")


@pytest.mark.skipif(os.name != "nt", reason="measures Win32 device-namespace behaviour")
class TestWindowsDeviceNamesReallyMisbehave:
    """The claim in `assert_safe_id`'s comment, MEASURED rather than restated.

    The guard's justification is a factual assertion about the platform, and this
    project's rule is that a comment claiming a property is not the property. The
    first version of that comment said every reserved name silently discards
    writes; measuring showed only `nul` misbehaves, and it fails LOUDLY on a
    child write rather than silently. The comment now says that — and this test
    is what keeps it true.
    """

    def test_a_nul_directory_accepts_mkdir_then_fails_every_child_write(
        self, tmp_path: Path
    ) -> None:
        (tmp_path / "nul").mkdir()
        with pytest.raises(OSError):
            (tmp_path / "nul" / "brief.json").write_text("payload", encoding="utf-8")

    def test_an_ordinary_name_in_the_same_place_works(self, tmp_path: Path) -> None:
        # The control: proves the failure above is the device name, not tmp_path.
        (tmp_path / "nul-check").mkdir()
        (tmp_path / "nul-check" / "brief.json").write_text("payload", encoding="utf-8")
        assert (tmp_path / "nul-check" / "brief.json").read_text(encoding="utf-8") == "payload"


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


class TestProgressHeartbeat:
    """`append_progress` — the liveness channel for minutes-long sub-stages.

    Observability, never state: the file is append-only JSONL an operator can
    tail, and a write failure must cost a warning, never the work.
    """

    def test_appends_one_valid_json_line_per_call(self, ctx: SubStageContext) -> None:
        from harness import append_progress

        append_progress(ctx, "ocr", 1, 35, "shot-0001")
        append_progress(ctx, "ocr", 2, 35, "shot-0002")

        path = ctx.index_dir / "progress.jsonl"
        lines = path.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 2
        first = json.loads(lines[0])
        assert first["subStage"] == "ocr"
        assert first["assetId"] == ctx.asset_id
        assert (first["current"], first["total"], first["note"]) == (1, 35, "shot-0001")
        assert "ts" in first
        second = json.loads(lines[1])
        assert second["current"] == 2

    def test_a_write_failure_warns_once_and_never_raises(
        self, ctx: SubStageContext, monkeypatch, capsys
    ) -> None:
        import harness as harness_module
        from harness import append_progress

        monkeypatch.setattr(harness_module, "_progress_write_failed", False)

        def refuse(*_args, **_kwargs):
            raise OSError("disk says no")

        monkeypatch.setattr(harness_module.Path, "mkdir", refuse)
        append_progress(ctx, "ocr", 1, 10, "shot-0001")  # must not raise
        append_progress(ctx, "ocr", 2, 10, "shot-0002")  # and must not warn again
        err = capsys.readouterr().err
        assert err.count("progress heartbeat unwritable") == 1
