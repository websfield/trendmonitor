"""Shared sub-stage harness for the `index` skill (Phase 2 task 1).

`index` is ONE public skill (tech-spec §6.5); transcript, shots/scenes, OCR,
visual description, audio events, quality flags and Moment extraction are
internal sub-stages. Each is an independently resumable checkpoint recorded in
`run-log.jsonl`. This module owns the four things every sub-stage would
otherwise reimplement — and reimplement slightly differently:

1. **Cache keying** (REQ-005). A sub-stage's result is keyed by
   `content hash + indexer version + that sub-stage's model config`. Model
   configs are part of the key because swapping a whisper model changes the
   transcript for byte-identical input; a key that ignored it would serve a
   stale artefact forever.
2. **Resume.** A completed checkpoint whose key still matches is skipped, and
   the skip is logged. `cutdown index` killed during OCR must resume with
   transcript and shots skipped, which is only true if every sub-stage records
   completion the same way.
3. **Atomicity.** Artefacts are written to a temp file in the destination
   directory and renamed. `os.replace` is atomic on NTFS and POSIX alike. A
   crash mid-write must never leave a partial artefact that a later run mistakes
   for a complete one — tech-spec §6.2 makes the presence of an output
   trustworthy only alongside its run-log completion entry, and this is the
   other half of that promise.
4. **Structured errors** (tech-spec §6.2). One JSON object on stderr —
   `{code, message, skill, skillVersion, details?}` — exit 2 for input
   validation, 3 for runtime. The CLI surfaces this object verbatim rather than
   a stack trace, so a failure inside a Python sub-stage reads the same to a
   caller as a failure inside a TypeScript one.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SKILL_NAME = "index"

# Bumped when ANY sub-stage's output shape or algorithm changes. It is part of
# every cache key and is stamped into every index artefact, so a bump
# invalidates prior artefacts rather than silently mixing versions.
INDEXER_VERSION = "1.0.0"

EXIT_INPUT_VALIDATION = 2
EXIT_RUNTIME = 3


class SubStageError(Exception):
    """A failure that must reach the caller as a structured error, not a traceback."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        exit_code: int = EXIT_RUNTIME,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
        self.exit_code = exit_code

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
            "skill": SKILL_NAME,
            "skillVersion": INDEXER_VERSION,
        }
        if self.details:
            payload["details"] = self.details
        return payload


class ModelUnavailableError(SubStageError):
    """A model or its cache could not be loaded.

    Separate from a generic runtime failure because the phase plan's degraded
    behaviour depends on the distinction: an offline or gated model must name the
    model and leave the run RESUMABLE so the other sub-stages still proceed —
    never a fabricated result, and never a poisoned checkpoint.
    """

    def __init__(self, model: str, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            code="MODEL_UNAVAILABLE",
            message=message,
            details={"model": model, **(details or {})},
        )
        self.model = model


# Mirrors `apps/cli/src/paths.ts::assertSafeJobId`. Duplicated deliberately: the
# TypeScript guard protects the CLI path, but this worker is documented as
# directly invocable (`uv run ... main.py --input <request.json>`), so a guard
# that lives only in the caller is a guard with a documented bypass.
#: `\Z`, NOT `$`. Python's `$` also matches just before a trailing newline, while
#: JavaScript's (without `/m`) matches only at end of input — so the mirror in
#: `apps/cli/src/paths.ts` REJECTED `"abc\n"` while this one ACCEPTED it. A
#: triplicated guard whose copies disagree is the failure class this project has
#: logged repeatedly, and it disagreed in the one mirror reachable without the
#: CLI (`uv run ... main.py --input`), which is the entire reason it exists.
#: `tests/safe-id-cases.json` is the shared fixture that now pins all three.
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")

#: Windows reserved DEVICE names — see `WINDOWS_RESERVED_DEVICE` in
#: `@cutdown/skill-runtime` for the full reasoning and the measurements. Short
#: version: not a traversal. `nul` is confirmed on the D-33 machine to name the
#: null device, so a job directory called `nul` accepts `mkdir` and then fails
#: EVERY child write with "no such file or directory" on a path that appears to
#: exist. The rest are refused for portability across Windows builds and APIs,
#: not because a write silently vanishes here.
_WINDOWS_RESERVED_DEVICE = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|\Z)", re.IGNORECASE)

#: FFmpeg reads `concat:`, `http:`, `subfile:` and friends as protocols rather
#: than filenames. A drive letter (`C:\...`) is deliberately NOT matched — it is
#: a real Windows path, and containment is what rejects it if it escapes.
_PROTOCOL_SHAPED = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]{1,}:")


def assert_safe_id(value: str, label: str) -> str:
    """Reject an identifier that could escape its directory.

    Job and asset ids become path segments, and they arrive from a CLI argument
    or from free text a conversational agent turned into a request. `../..`
    would put client footage — or a written artefact — somewhere nobody is
    looking for it.
    """
    if not isinstance(value, str) or not _SAFE_ID.match(value) or ".." in value:
        raise SubStageError(
            "UNSAFE_IDENTIFIER",
            f"Invalid {label} {value!r}. Use letters, digits, dot, dash or underscore "
            "(max 64 chars); it becomes a path segment.",
            details={"field": label},
            exit_code=EXIT_INPUT_VALIDATION,
        )
    if _WINDOWS_RESERVED_DEVICE.match(value):
        raise SubStageError(
            "UNSAFE_IDENTIFIER",
            f"Invalid {label} {value!r}: it names a device in the Windows reserved "
            "namespace, and it becomes a path segment. `nul` is the worst case — the "
            "directory appears to be created and then every write inside it fails with "
            "'no such file or directory' — and the rest are unreliable across Windows "
            "builds and APIs. Choose another value.",
            details={"field": label},
            exit_code=EXIT_INPUT_VALIDATION,
        )
    return value


def assert_contained(path: Path, root: Path, label: str) -> Path:
    """Assert `path` resolves inside `root`.

    The belt to `assert_safe_id`'s braces. Identifier validation stops the
    obvious traversal; this catches anything that reaches a path by another
    route — a symlink, an absolute value substituted into a join (which silently
    discards the join root), or a UNC share on Windows.
    """
    resolved = path.resolve()
    root_resolved = root.resolve()
    if resolved != root_resolved and root_resolved not in resolved.parents:
        raise SubStageError(
            "PATH_ESCAPES_ROOT",
            f"{label} resolves to {resolved}, outside {root_resolved}. Refusing to read or write there.",
            details={"path": str(resolved), "root": str(root_resolved)},
            exit_code=EXIT_INPUT_VALIDATION,
        )
    return resolved


def assert_safe_media_path(path: Path, root: Path) -> Path:
    """Validate a media path before it reaches an ffmpeg/ffprobe argv.

    Mirrors `packages/renderer-core/src/ffmpeg.ts::assertSafeInputPath`. FFmpeg
    treats certain strings as protocols rather than files (`concat:`, `http:`,
    `subfile:`), and on Windows a UNC path makes it fetch over SMB — which leaks
    NTLM credentials to whoever owns the share. The path also has to stay inside
    the job, because an absolute value substituted into a join silently replaces
    the join root entirely.

    Note which check carries which guarantee: **containment** is what neutralises
    the protocol class, because a protocol-shaped string joined onto the job root
    resolves to a path under it and then fails the containment test. The explicit
    scheme check below is belt to that braces, for any future caller that passes
    an already-absolute path.
    """
    if _PROTOCOL_SHAPED.match(str(path)):
        raise SubStageError(
            "UNSAFE_MEDIA_PATH",
            f"Media path {str(path)!r} is protocol-shaped; FFmpeg would treat it as a stream, not a file.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    raw = str(path)
    if "\x00" in raw:
        raise SubStageError(
            "UNSAFE_MEDIA_PATH",
            "Media path contains a NUL byte.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    if raw.startswith("-"):
        raise SubStageError(
            "UNSAFE_MEDIA_PATH",
            f"Media path {raw!r} is option-shaped and would be read as a flag.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    if raw.startswith(("\\\\", "//")):
        raise SubStageError(
            "UNSAFE_MEDIA_PATH",
            f"Media path {raw!r} is a UNC share; FFmpeg would fetch it over SMB.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    return assert_contained(path, root, "Media path")


def canonical_json(value: Any) -> str:
    """Canonical form used for hashing.

    Mirrors `packages/contracts/src/hash.ts`: keys sorted, no insignificant
    whitespace, array order preserved. The two implementations must agree,
    because a cache key computed in Python is compared against artefacts written
    by TypeScript.
    """
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def hash_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def hash_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    """sha256 of a media file, streamed — source files are far too large to slurp."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def write_json_atomic(path: Path, value: Any) -> None:
    """Write JSON via temp-file + rename, so a reader never observes a half-file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # The temp file MUST share a directory with the destination: os.replace is
    # only atomic within a filesystem, and %TEMP% is routinely a different volume.
    handle, temp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            file.write(canonical_json(value))
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_name, path)
    except BaseException:
        # Leave no orphan temp behind on failure — including on KeyboardInterrupt,
        # which is how the kill-during-write test terminates the process.
        with suppress_errors():
            os.unlink(temp_name)
        raise


class suppress_errors:
    """Tiny context manager: best-effort cleanup must never mask the real error."""

    def __enter__(self) -> None:
        return None

    def __exit__(self, *exc_info: object) -> bool:
        return True


@dataclass(frozen=True)
class SubStageContext:
    """Everything a sub-stage needs to locate its inputs and record its outputs."""

    job_id: str
    asset_id: str
    job_root: Path
    #: sha256 of the media this run indexes — the content half of the cache key.
    content_hash: str
    indexer_version: str = INDEXER_VERSION
    #: W3C traceparent adopted from the CLI. There is no automatic propagation
    #: across spawn (tech-spec §13), so it is passed explicitly or it is lost.
    traceparent: str | None = None

    @property
    def index_dir(self) -> Path:
        return self.job_root / "index"

    @property
    def checkpoint_dir(self) -> Path:
        return self.index_dir / "checkpoints"

    @property
    def run_log(self) -> Path:
        return self.job_root / "run-log.jsonl"


@dataclass
class SubStageResult:
    name: str
    cache_key: str
    artefact_path: Path
    artefact: Any
    #: True when a matching checkpoint let the work be skipped entirely.
    cache_hit: bool
    duration_ms: int
    warnings: list[str] = field(default_factory=list)


#: Set once a progress write has failed, so a broken observability channel warns
#: exactly once instead of spamming stderr per keyframe.
_progress_write_failed = False


def append_progress(ctx: SubStageContext, sub_stage: str, current: int, total: int, note: str = "") -> None:
    """Append one heartbeat line to `index/progress.jsonl` — observability, never state.

    Long sub-stages (OCR is minutes-per-asset on real footage) otherwise produce
    NOTHING observable until their atomic artefact lands, which reads as a hang.
    This file is the liveness channel an operator can tail: one JSON line per unit
    of work, appended with an immediate flush.

    It is deliberately NOT an artefact: nothing reads it back, it carries no cache
    key, it is not part of any contract, and a failure to write it must never cost
    the work it reports on — a progress write failing after 60 minutes of OCR
    would turn the observability channel into the outage. Hence best-effort with a
    single stderr warning on first failure.
    """
    global _progress_write_failed
    try:
        ctx.index_dir.mkdir(parents=True, exist_ok=True)
        line = json.dumps(
            {
                "ts": _now_iso(),
                "assetId": ctx.asset_id,
                "subStage": sub_stage,
                "current": current,
                "total": total,
                "note": note,
            },
            separators=(",", ":"),
            ensure_ascii=False,
        )
        with open(ctx.index_dir / "progress.jsonl", "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
            handle.flush()
    except OSError as error:
        if not _progress_write_failed:
            _progress_write_failed = True
            # The `file=sys.stderr` is the whole point, and the suppression below
            # exists to say so. A sub-stage's STDOUT is a contract surface
            # (tech-spec §6.2) that the caller parses as the result document, so an
            # operator warning must go to stderr — writing it to stdout would
            # corrupt the result. Selecting T20 (D-58) is what makes every
            # remaining print state which stream it uses, and why.
            print(  # noqa: T201
                f"warning: progress heartbeat unwritable ({error}); work continues without it",
                file=sys.stderr,
            )


def append_run_log(ctx: SubStageContext, entry: dict[str, Any]) -> None:
    """Append one line to the job's authoritative append-only record (tech-spec §5).

    Same file and same shape the TypeScript CLI writes, so one job's history reads
    as a single timeline regardless of which language produced each step.
    """
    ctx.job_root.mkdir(parents=True, exist_ok=True)
    line = json.dumps(
        {**entry, "loggedAt": _now_iso()},
        sort_keys=False,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    # The run log is the artefact a human reads months later, and entries carry
    # sub-stage failure reasons built from exception text nobody vetted.
    with ctx.run_log.open("a", encoding="utf-8") as handle:
        handle.write(scrub_secrets(line) + "\n")


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def compute_cache_key(
    ctx: SubStageContext,
    sub_stage: str,
    model_config: dict[str, Any] | None,
) -> str:
    """`content hash + indexer version + model config` (REQ-005, tech-spec §3)."""
    return hash_json(
        {
            "subStage": sub_stage,
            "contentHash": ctx.content_hash,
            "assetId": ctx.asset_id,
            "indexerVersion": ctx.indexer_version,
            "modelConfig": model_config or {},
        }
    )


def _checkpoint_path(ctx: SubStageContext, sub_stage: str) -> Path:
    return ctx.checkpoint_dir / f"{sub_stage}.json"


def read_checkpoint(ctx: SubStageContext, sub_stage: str) -> dict[str, Any] | None:
    path = _checkpoint_path(ctx, sub_stage)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        # A corrupt checkpoint is treated as absent: redoing deterministic work is
        # cheap, whereas trusting an unreadable completion record is how a partial
        # artefact gets promoted to authoritative.
        return None


def run_sub_stage(
    ctx: SubStageContext,
    sub_stage: str,
    compute: Callable[[], Any],
    *,
    model_config: dict[str, Any] | None = None,
    force: bool = False,
) -> SubStageResult:
    """Run one sub-stage, or skip it if a valid checkpoint already covers this input.

    The resume contract, concretely: a sub-stage whose checkpoint records the same
    cache key AND whose artefact is still on disk is skipped. Both halves are
    required — a checkpoint without its artefact is exactly the state a crash
    between the two writes produces, and treating it as complete would hand the
    next sub-stage a missing input.
    """
    started = time.monotonic()
    cache_key = compute_cache_key(ctx, sub_stage, model_config)
    artefact_path = ctx.index_dir / f"{sub_stage}-{cache_key[:16]}.json"

    if not force:
        checkpoint = read_checkpoint(ctx, sub_stage)
        if (
            checkpoint is not None
            and checkpoint.get("cacheKey") == cache_key
            and checkpoint.get("status") == "completed"
            and artefact_path.exists()
        ):
            append_run_log(
                ctx,
                {
                    "event": "index-sub-stage",
                    "subStage": sub_stage,
                    "jobId": ctx.job_id,
                    "assetId": ctx.asset_id,
                    "cacheKey": cache_key,
                    "status": "skipped",
                    "reason": "cache-hit",
                    "artefactPath": str(artefact_path),
                    "traceparent": ctx.traceparent,
                },
            )
            return SubStageResult(
                name=sub_stage,
                cache_key=cache_key,
                artefact_path=artefact_path,
                artefact=json.loads(artefact_path.read_text(encoding="utf-8")),
                cache_hit=True,
                duration_ms=int((time.monotonic() - started) * 1000),
            )

    append_run_log(
        ctx,
        {
            "event": "index-sub-stage",
            "subStage": sub_stage,
            "jobId": ctx.job_id,
            "assetId": ctx.asset_id,
            "cacheKey": cache_key,
            "status": "started",
            "traceparent": ctx.traceparent,
        },
    )

    try:
        artefact = compute()
    except SubStageError as error:
        append_run_log(
            ctx,
            {
                "event": "index-sub-stage",
                "subStage": sub_stage,
                "jobId": ctx.job_id,
                "assetId": ctx.asset_id,
                "cacheKey": cache_key,
                "status": "failed",
                "error": error.to_payload(),
            },
        )
        # Deliberately NO checkpoint write: a failed sub-stage must remain
        # resumable, and a checkpoint here would make the failure permanent.
        raise

    # Artefact first, checkpoint second. The reverse order would let a crash
    # between the two writes leave a checkpoint claiming work whose output does
    # not exist — the resume guard above also re-checks the artefact, so the two
    # defences agree rather than relying on either alone.
    write_json_atomic(artefact_path, artefact)
    duration_ms = int((time.monotonic() - started) * 1000)
    write_json_atomic(
        _checkpoint_path(ctx, sub_stage),
        {
            "subStage": sub_stage,
            "cacheKey": cache_key,
            "status": "completed",
            "artefactPath": str(artefact_path),
            "indexerVersion": ctx.indexer_version,
            "contentHash": ctx.content_hash,
            "completedAt": _now_iso(),
        },
    )

    append_run_log(
        ctx,
        {
            "event": "index-sub-stage",
            "subStage": sub_stage,
            "jobId": ctx.job_id,
            "assetId": ctx.asset_id,
            "cacheKey": cache_key,
            "status": "completed",
            "artefactPath": str(artefact_path),
            "durationMs": duration_ms,
            "traceparent": ctx.traceparent,
        },
    )

    return SubStageResult(
        name=sub_stage,
        cache_key=cache_key,
        artefact_path=artefact_path,
        artefact=artefact,
        cache_hit=False,
        duration_ms=duration_ms,
    )


#: An Anthropic key shape, caught even when the configured key is unknown to us
#: (a different key, a key from the environment, a key pasted into a prompt).
_KEY_PATTERN = re.compile(r"sk-ant-[A-Za-z0-9_\-]{8,}")


def scrub_secrets(text: str) -> str:
    """Redact anything key-shaped from a string bound for stderr or the run log.

    `model_gateway` already scrubs at the transport boundary, which is where a
    provider error body carrying a credential would arrive. This is the outer
    net: an unexpected exception reaches `main_guard` with a message and a
    traceback that nobody vetted, and both are written where a human will later
    read them. Redacting twice costs nothing; missing once is a
    rotate-everything incident.
    """
    return _KEY_PATTERN.sub("sk-ant-[REDACTED]", text)


def emit_structured_error(error: SubStageError) -> None:
    """Write the one JSON object the caller parses off stderr (tech-spec §6.2)."""
    sys.stderr.write(scrub_secrets(json.dumps(error.to_payload(), ensure_ascii=False)) + "\n")
    sys.stderr.flush()


def main_guard(entrypoint: Callable[[], int]) -> int:
    """Wrap a sub-stage `main` so no failure escapes as a traceback.

    Every caller — CLI, local runner, future Temporal activity — surfaces the
    structured object, not a stack trace. An unexpected exception is still a
    structured error (`UNEXPECTED_ERROR`); the traceback goes in `details` where
    a developer can read it without the contract being broken for the caller.
    """
    try:
        return entrypoint()
    except SubStageError as error:
        emit_structured_error(error)
        return error.exit_code
    except Exception as error:  # noqa: BLE001 — the boundary is the point
        import traceback

        emit_structured_error(
            SubStageError(
                code="UNEXPECTED_ERROR",
                message=f"{type(error).__name__}: {error}",
                details={"traceback": traceback.format_exc()[-4000:]},
            )
        )
        return EXIT_RUNTIME
