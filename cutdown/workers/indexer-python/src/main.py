"""`index` skill entrypoint — Phase 2 task 11.

Spawned as an argv array with the skill directory as cwd (tech-spec §6.2):

    uv run --project ../.. python ../../workers/indexer-python/src/main.py \
        --input <request.json> --output <result.json>

## What this file owns

Sequencing and degradation, and nothing else. Every sub-stage owns its own
engine, thresholds, caching and artefact shape; the orchestrator decides what
runs, in what order, and what happens when one of them cannot.

## The degradation rule

A failing sub-stage does **not** abort the run. Sub-stages are independent, the
expensive ones are cached, and a model that could not be downloaded today will
download tomorrow — so a failure is recorded as a `failed` (or `skipped`)
sub-stage carrying a reason, the other sub-stages proceed, and the job stays
resumable. Aborting would throw away an expensive transcript because an OCR
model was gated.

The one thing that is NOT tolerated is a silently degraded result. Every
sub-stage that did not complete appears in `subStages` with a status and a
reason, so an empty `ocr` array is never mistakable for "there was no text".

## Bounds checking is delegated, never reimplemented

After Moments are cut, this file shells out to `cutdown range-check` — the single
TypeScript implementation — rather than re-deriving the rule in Python. A second
implementation would be a second set of rounding rules, and the Phase 0 exit
criterion would measure whichever ran. An out-of-bounds Moment fails the run:
that is the criterion, enforced rather than merely reported.

## Which media is analysed

The **source**, not the proxy. The proxy is CFR-normalised (D-25), so analysing
it would silently destroy the variable-frame-rate mapping that REQ-019 requires
and every Moment range on a VFR clip depends on. The proxy exists to make draft
renders and scrubbing cheap, which is a different job.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

CUTDOWN_ROOT = Path(__file__).resolve().parents[3]
# The generated Pydantic models validate what we write BEFORE it lands, so a
# contract violation is a failed run rather than a corrupt artefact discovered
# by the next phase.
sys.path.insert(0, str(CUTDOWN_ROOT / "packages" / "contracts" / "generated" / "python"))

from assemble_index import (  # noqa: E402
    Timebase as IndexTimebase,
    assemble_index,
    build_timebase_map,
    rescale_item,
    rescale_items,
    sub_stage_record,
)
from harness import hash_json  # noqa: E402
from ids import derive_ulid  # noqa: E402
from harness import (  # noqa: E402
    EXIT_INPUT_VALIDATION,
    INDEXER_VERSION,
    SubStageContext,
    SubStageError,
    append_run_log,
    assert_contained,
    assert_safe_id,
    assert_safe_media_path,
    main_guard,
    write_json_atomic,
)
from moments import Timebase as MomentTimebase, build_moment, collect_boundaries, link_dependencies, segment_ranges  # noqa: E402

CLI_ENTRY = CUTDOWN_ROOT / "apps" / "cli" / "dist" / "src" / "main.js"


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def parse_args(argv: list[str]) -> tuple[Path, Path]:
    """`--input` and `--output` are both mandatory (tech-spec §6.2)."""
    values: dict[str, str] = {}
    index = 0
    while index < len(argv):
        token = argv[index]
        if token in ("--input", "--output") and index + 1 < len(argv):
            values[token.lstrip("-")] = argv[index + 1]
            index += 2
        else:
            index += 1
    if "input" not in values or "output" not in values:
        raise SubStageError(
            "MISSING_IO_ARGUMENTS",
            "index requires --input <request.json> and --output <result.json>.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    return Path(values["input"]), Path(values["output"])


def load_request(path: Path) -> dict[str, Any]:
    try:
        request = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SubStageError(
            "REQUEST_UNREADABLE",
            f"Could not read the index request at {path}: {error}",
            exit_code=EXIT_INPUT_VALIDATION,
        ) from error

    for field in ("jobId", "assetId"):
        if not request.get(field):
            raise SubStageError(
                "REQUEST_INVALID",
                f"index request is missing required field `{field}`.",
                details={"field": field},
                exit_code=EXIT_INPUT_VALIDATION,
            )

    # Both become path segments. The TypeScript CLI validates `jobId`, but this
    # module's own docstring documents direct invocation, so a guard that lives
    # only in the caller is a guard with a documented bypass — and `assetId` was
    # validated nowhere at all.
    assert_safe_id(request["jobId"], "jobId")
    assert_safe_id(request["assetId"], "assetId")
    return request


def load_asset(job_root: Path, asset_id: str) -> dict[str, Any]:
    path = job_root / "assets" / f"{asset_id}.json"
    if not path.exists():
        raise SubStageError(
            "ASSET_NOT_FOUND",
            f"No ingested asset {asset_id} in job {job_root.name}. Run `cutdown ingest` first.",
            details={"expectedPath": str(path)},
            exit_code=EXIT_INPUT_VALIDATION,
        )
    return json.loads(path.read_text(encoding="utf-8"))


def rights_for(asset: dict[str, Any]) -> tuple[str, list[str]]:
    """Moments INHERIT rights; they never restate them.

    A Moment cannot be more permissively licensed than the footage it is cut
    from, and duplicating the full record would let the two drift.
    """
    record = asset.get("rights") or {}
    state = record.get("state", "unknown")
    concerns: list[str] = []
    if state != "cleared":
        concerns.append(f"asset rights state is `{state}`")
    if record.get("talentReleaseStatus") not in (None, "cleared"):
        concerns.append(f"talent release is `{record.get('talentReleaseStatus')}`")
    return state, concerns


def run_bounds_check(bounds: dict[str, Any], ranges: list[dict[str, Any]], job_root: Path) -> dict[str, Any]:
    """Delegate to `cutdown range-check` — the single implementation."""
    if not CLI_ENTRY.exists():
        raise SubStageError(
            "RANGE_CHECK_UNAVAILABLE",
            f"The bounds checker is not built at {CLI_ENTRY}. Run `pnpm -C cutdown build`. "
            "Refusing to emit Moments that were never bounds-checked.",
        )

    request_path = job_root / "index" / "bounds-check-request.json"
    write_json_atomic(request_path, {"bounds": bounds, "ranges": ranges})

    completed = subprocess.run(
        ["node", str(CLI_ENTRY), "range-check", "--input", str(request_path)],
        capture_output=True,
        text=True,
        cwd=str(CUTDOWN_ROOT),
        check=False,
    )
    if completed.returncode == 2 or not completed.stdout.strip():
        raise SubStageError(
            "RANGE_CHECK_FAILED",
            f"range-check could not evaluate the generated Moments: {completed.stderr.strip()[:500]}",
        )
    return json.loads(completed.stdout)


def _stage(
    summaries: list[dict[str, Any]],
    records: list[dict[str, Any]],
    name: str,
    thunk,
) -> Any:
    """Run one sub-stage, recording status either way; never abort the run.

    Returns the sub-stage artefact, or `None` when it did not complete. The
    caller treats `None` as "absent", and the recorded reason is what keeps that
    absence honest.
    """
    started = _now_iso()
    try:
        result = thunk()
    except SubStageError as error:
        reason = f"{error.code}: {error.message}"[:500]
        summaries.append(
            {"name": name, "status": "failed", "reason": reason, "cacheHit": False, "durationMs": 0}
        )
        records.append(sub_stage_record(name, "failed", started_at=started, reason=reason))
        return None
    except Exception as error:  # noqa: BLE001 — the degradation contract is the point
        # The docstring promises a failing sub-stage does not abort the run. A
        # narrow `except SubStageError` broke that promise for every engine
        # exception an engine can actually raise — a torch RuntimeError, a cv2
        # error, an OSError — any of which would have killed the run and
        # discarded the expensive transcript this design exists to protect.
        reason = f"UNEXPECTED_SUB_STAGE_ERROR: {type(error).__name__}: {error}"[:500]
        summaries.append(
            {"name": name, "status": "failed", "reason": reason, "cacheHit": False, "durationMs": 0}
        )
        records.append(sub_stage_record(name, "failed", started_at=started, reason=reason))
        return None

    artefact = getattr(result, "artefact", result)
    cache_hit = bool(getattr(result, "cache_hit", False))
    duration = int(getattr(result, "duration_ms", 0))

    # A sub-stage may legitimately decline to produce anything (the VLM stage
    # under --no-vlm). It says so in its own artefact; the ledger must REPEAT
    # that, not overwrite it.
    #
    # Two shapes are honoured because the sub-stages genuinely differ: `visual`
    # emits a complete nested `subStage` record (it is the one stage that
    # routinely declines), while the detector stages return a bare collection
    # and are `completed` by construction.
    #
    # Reading only the top level was a real defect: the VLM stage reported
    # `status: "skipped"` with a full reason under `subStage`, the orchestrator
    # missed it, and the run recorded `completed` with a null reason beside an
    # empty `visualDescriptions` array — reintroducing exactly the "did we look?"
    # ambiguity the whole ledger exists to remove. A sub-stage's own account of
    # itself always wins.
    status = "completed"
    reason = None
    engine = None
    if isinstance(artefact, dict):
        nested = artefact.get("subStage")
        if isinstance(nested, dict) and nested.get("status"):
            status = str(nested["status"])
            reason = nested.get("reason")
            engine = nested.get("engine")
        elif artefact.get("status") in {"skipped", "failed"}:
            status = str(artefact["status"])
            reason = artefact.get("reason")
            engine = artefact.get("engine")
        else:
            engine = artefact.get("engine")

        if status != "completed" and not reason:
            reason = f"{name} reported `{status}` without a reason"

    summaries.append(
        {"name": name, "status": status, "reason": reason, "cacheHit": cache_hit, "durationMs": duration}
    )
    records.append(
        sub_stage_record(
            name,
            status,
            started_at=started,
            completed_at=_now_iso(),
            reason=reason,
            engine=engine,
        )
    )
    return artefact


def _skipped(
    summaries: list[dict[str, Any]],
    records: list[dict[str, Any]],
    name: str,
    reason: str,
) -> None:
    """Record a sub-stage that was not attempted, with the reason it was not.

    Deliberately NOT a checkpointed skip: nothing ran, so nothing is cached, and
    the next run re-attempts it once its dependency succeeds.
    """
    now = _now_iso()
    summaries.append(
        {"name": name, "status": "skipped", "reason": reason, "cacheHit": False, "durationMs": 0}
    )
    records.append(sub_stage_record(name, "skipped", started_at=now, completed_at=now, reason=reason))
    return None


def _collection(artefact: Any, key: str) -> list[dict[str, Any]]:
    """Sub-stages return `{key: [...], ...}`; absent or failed means empty."""
    if isinstance(artefact, dict):
        value = artefact.get(key)
        if isinstance(value, list):
            return value
    return []


#: Sub-stages an operator may skip. Deliberately just `ocr` for now: it is the
#: one stage whose output nothing downstream *requires* (Moment entities lose
#: their ocr-source entries; captions and retrieval are transcript-driven), and
#: on real footage it is ~90% of indexing cost under the shipped single-threaded
#: config. Widening this list is a decision, not a default.
OPERATOR_SKIPPABLE = frozenset({"ocr"})

#: The reason recorded when the operator skips a stage — the sub-stage ledger
#: refuses a skip without one, and "did we look?" must stay answerable.
_OPERATOR_SKIP_REASON = (
    "skipped by operator request (skip: {name}); this job's editorial path does not consume its output"
)


def resolve_ocr_stage(
    skip: set[str], force: set[str], ocr_threads: int | None
) -> tuple[bool, str | None, dict[str, Any]]:
    """Decide whether OCR runs, and with what config overrides.

    `force` is accepted but unused BY DESIGN: skip-wins-over-force means the
    decision never consults it (the caller applies force separately, and only
    on the run path this function has already approved). It stays in the
    signature so the contract "this function saw both flags and skip won" is
    explicit at the call site — do not "simplify" it away.

    Returns (run, skip_reason, config_overrides). An explicit skip WINS over an
    explicit force — the same precedent as `--no-vlm` beating `--vlm`: the
    opt-out is the flag an operator reaches for deliberately, and honouring the
    opt-in over it would run a multi-minute stage against an explicit no.

    `ocr_threads` becomes `cpu_threads` in the engine config, which sits in the
    REQ-005 cache key — so a thread-count change re-indexes rather than serving
    a checkpoint produced under different reduction ordering. The shipped
    default stays 1 (byte-identical re-runs); >1 trades that reproducibility
    for wall-clock and says so in the schema.
    """
    if "ocr" in skip:
        return False, _OPERATOR_SKIP_REASON.format(name="ocr"), {}
    overrides: dict[str, Any] = {}
    if ocr_threads is not None:
        overrides["cpu_threads"] = int(ocr_threads)
    return True, None, overrides


def index_asset(request: dict[str, Any]) -> dict[str, Any]:
    job_id = request["jobId"]
    asset_id = request["assetId"]
    force = set(request.get("force") or [])
    # Fail closed: the VLM stage is skipped unless explicitly enabled, because
    # the D-21 spend ceiling is owner-set and not yet in place.
    no_vlm = request.get("noVlm", True)
    raw_skip = request.get("skip")
    if raw_skip is not None and not isinstance(raw_skip, list):
        # A string would set-explode into characters and the refusal would name
        # ['c','o','r'] — fail closed with a message that reads correctly.
        raise SubStageError(
            "SKIP_NOT_SKIPPABLE",
            f"skip must be a list of sub-stage names or null, got {type(raw_skip).__name__}.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    skip = set(raw_skip or [])
    unknown_skip = skip - OPERATOR_SKIPPABLE
    if unknown_skip:
        raise SubStageError(
            "SKIP_NOT_SKIPPABLE",
            f"skip names sub-stage(s) that cannot be operator-skipped: {sorted(unknown_skip)}. "
            f"Skippable: {sorted(OPERATOR_SKIPPABLE)}.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    ocr_threads = request.get("ocrThreads")
    # Guarded here as well as in the schema and the CLI: a skill's `entrypoint`
    # is a documented direct invocation, and nothing runs Ajv on the spawn path —
    # a caller-only guard is a documented bypass (the Phase 2 lesson). Validated
    # BEFORE any asset read so a bad value refuses in milliseconds, not after
    # the transcript has run.
    if ocr_threads is not None and (
        isinstance(ocr_threads, bool) or not isinstance(ocr_threads, int) or not 1 <= ocr_threads <= 64
    ):
        raise SubStageError(
            "OCR_THREADS_INVALID",
            f"ocrThreads must be an integer in [1, 64] or null, got {ocr_threads!r}.",
            exit_code=EXIT_INPUT_VALIDATION,
        )

    jobs_root = CUTDOWN_ROOT / "project-data" / "jobs"
    job_root = jobs_root / job_id
    # Belt and braces: the id is already validated, but containment also catches
    # a symlinked job directory pointing out of the tree.
    assert_contained(job_root, jobs_root, "Job directory")
    asset = load_asset(job_root, asset_id)

    preflight = asset.get("preflight") or {}
    duration = preflight.get("duration")
    if not duration:
        raise SubStageError(
            "ASSET_HAS_NO_DURATION",
            f"Asset {asset_id} has no preflighted duration, so no range on it could be proven in bounds. "
            "Failing closed.",
            exit_code=EXIT_INPUT_VALIDATION,
        )

    video = preflight.get("video") or {}
    source_timebase = duration["timebase"]
    duration_ticks = int(duration["ticks"])
    # `storedPath` comes out of a stored artefact and flows straight into an
    # ffmpeg/ffprobe argv. An ABSOLUTE value would silently replace the join
    # root, and a UNC path would make FFmpeg fetch over SMB — leaking NTLM
    # credentials to whoever owns the share.
    media_path = assert_safe_media_path(job_root / asset["storedPath"], job_root)
    content_hash = asset["contentHash"]["value"]

    ctx = SubStageContext(
        job_id=job_id,
        asset_id=asset_id,
        job_root=job_root,
        content_hash=content_hash,
        # There is no automatic trace propagation across spawn (tech-spec §13):
        # adopted explicitly here or the job's trace silently breaks in two.
        traceparent=os.environ.get("TRACEPARENT"),
    )

    summaries: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []

    # --- video/audio analysis sub-stages ------------------------------------
    import audio_events
    import ocr as ocr_module
    import quality
    import scenes as scenes_module
    import shots as shots_module
    import transcript as transcript_module
    import visual as visual_module

    transcript_artefact = _stage(summaries, records, "transcript", lambda: transcript_module.run_transcript_sub_stage(
        ctx, media_path, force="transcript" in force))
    shots_artefact = _stage(summaries, records, "shots", lambda: shots_module.run_shots_sub_stage(
        ctx, media_path, force="shots" in force))

    shot_list = _collection(shots_artefact, "shots")
    transcript_body = (transcript_artefact or {}).get("transcript") if isinstance(transcript_artefact, dict) else None

    # A FAILED `shots` yields an empty list that is indistinguishable, to the
    # stages downstream, from "this asset genuinely has no shots". Passing it on
    # made `ocr` and `visual` report `completed` beside an empty collection —
    # the same "did we look?" ambiguity as before, one level down — and because
    # neither stage's cache key covers the shots it consumed, that empty result
    # was then served from checkpoint FOREVER, even after shots started working.
    # So: when shots did not complete, its dependants are skipped with a reason,
    # and their cache keys carry a digest of the shots they actually saw.
    shots_ok = shots_artefact is not None
    shots_reason = "upstream `shots` sub-stage did not complete, so no keyframes could be selected"
    shots_digest = hash_json(shot_list)

    scenes_artefact = _stage(summaries, records, "scenes", lambda: scenes_module.run_scenes_sub_stage(
        ctx, shot_list, media_path=media_path, transcript=transcript_body, force="scenes" in force))

    run_ocr, ocr_skip_reason, ocr_overrides = resolve_ocr_stage(skip, force, ocr_threads)
    if shots_ok:
        if run_ocr:
            ocr_artefact = _stage(summaries, records, "ocr", lambda: ocr_module.run_ocr_sub_stage(
                ctx, media_path, shots=shot_list,
                config={**ocr_module.DEFAULT_OCR_CONFIG, "shotsDigest": shots_digest, **ocr_overrides}
                if hasattr(ocr_module, "DEFAULT_OCR_CONFIG") else {"shotsDigest": shots_digest, **ocr_overrides},
                force="ocr" in force))
        else:
            # Operator skip — visual descriptions are unaffected; only OCR is
            # opted out, and the ledger records exactly that with its reason.
            ocr_artefact = _skipped(summaries, records, "ocr", ocr_skip_reason or "skipped by operator request")
        visual_artefact = _stage(summaries, records, "visual_descriptions", lambda: visual_module.run_visual_descriptions(
            ctx, shot_list, enable_vlm=not no_vlm, force="visual_descriptions" in force))
    else:
        ocr_artefact = _skipped(summaries, records, "ocr", shots_reason)
        visual_artefact = _skipped(summaries, records, "visual_descriptions", shots_reason)
    audio_artefact = _stage(summaries, records, "audio_events", lambda: audio_events.run_audio_events(
        ctx, media_path, force="audio_events" in force))
    quality_artefact = _stage(summaries, records, "quality_flags", lambda: quality.run(
        ctx, media_path, force="quality_flags" in force))

    # --- normalise every collection into ONE timebase -----------------------
    # Must happen before anything compares or unions ticks. See
    # `assemble_index.rescale_item` for why mixing them is silent rather than loud.
    target_tb = IndexTimebase(**source_timebase)
    speaker_turns = rescale_items(_collection(transcript_artefact, "speakerTurns"), target_tb)
    shot_list = rescale_items(shot_list, target_tb)
    scene_list = rescale_items(_collection(scenes_artefact, "scenes"), target_tb)
    ocr_list = rescale_items(_collection(ocr_artefact, "ocr"), target_tb)
    visual_list = rescale_items(_collection(visual_artefact, "visualDescriptions"), target_tb)
    audio_list = rescale_items(_collection(audio_artefact, "audioEvents"), target_tb)
    quality_list = rescale_items(_collection(quality_artefact, "qualityFlags"), target_tb)
    if transcript_body is not None:
        transcript_body = rescale_item(transcript_body, target_tb)

    # The index is ASSEMBLED here but not written until the bounds gate has run
    # (see below) — an artefact on disk is an artefact Phase 3 can glob.
    timebase_map = build_timebase_map(
        mode=video.get("frameRateMode", "unknown"),
        source_timebase=target_tb,
        normalized_timebase=target_tb,
        presentation_ticks=_collection(shots_artefact, "presentationTicks") or None,
    )

    # The index id is derived from content, so it can be computed before the
    # index object exists. That breaks the ordering knot: Moments need the id,
    # the index's sub-stage ledger needs the `moment_extraction` record, and
    # NEITHER may be written until the bounds gate has passed.
    index_id = derive_ulid("source-index", asset_id, content_hash, INDEXER_VERSION)

    # --- cut Moments --------------------------------------------------------
    moment_timebase = MomentTimebase(**source_timebase)
    boundaries = collect_boundaries(speaker_turns, shot_list, duration_ticks)
    ranges = segment_ranges(boundaries, moment_timebase)

    rights_state, rights_concerns = rights_for(asset)
    visual_reason = next(
        (s["reason"] for s in summaries if s["name"] == "visual_descriptions" and s["reason"]),
        None,
    )

    encoder = None
    embed_warning: str | None = None
    if ranges:
        try:
            from embed import load_encoder

            encoder = load_encoder()
        except SubStageError as error:
            # An unavailable embedding model costs retrieval quality later, not
            # correctness now — the Moment carries `embedding: null` rather than
            # a fabricated vector, and a re-run fills it in.
            embed_warning = f"{error.code}: {error.message}"[:300]

    moments: list[dict[str, Any]] = []
    for start, end in ranges:
        moment = build_moment(
            job_id=job_id,
            asset_id=asset_id,
            source_index_id=index_id,
            start_ticks=start,
            end_ticks=end,
            timebase=moment_timebase,
            speaker_turns=speaker_turns,
            shots=shot_list,
            transcript=transcript_body,
            ocr=ocr_list,
            audio_events=audio_list,
            quality_flags=quality_list,
            visual_descriptions=visual_list,
            rights_state=rights_state,
            rights_concerns=rights_concerns,
            created_at=_now_iso(),
            visual_absent_reason=visual_reason,
        )
        if encoder is not None:
            from embed import embed_text

            moment["embedding"] = embed_text(moment["transcript"]["verbatimText"], encoder)
        moments.append(moment)

    moments = link_dependencies(moments)
    for moment in moments:
        _validate("Moment", moment)

    now = _now_iso()
    records.append(sub_stage_record("moment_extraction", "completed", started_at=now, completed_at=now))
    summaries.append(
        {"name": "moment_extraction", "status": "completed", "reason": None, "cacheHit": False, "durationMs": 0}
    )

    # --- the exit-criterion gate, BEFORE anything is written ----------------
    # Writing first and checking second would put out-of-bounds Moments at their
    # final, deterministic, globbable path with nothing marking them invalid —
    # and the error text claims to be "refusing to commit" them. The gate has to
    # precede the commit for that claim to be true.
    # A zero-Moment index is a legitimate outcome (an asset too short to yield a
    # 3 s Moment), NOT a bounds failure. The checker correctly exits 2 on an
    # empty list — "nothing to check" must never read as "nothing wrong" — so
    # that case is decided here rather than being routed into a false failure.
    if not moments:
        verdict = {"checked": 0, "ok": True, "violations": []}
    else:
        verdict = run_bounds_check(
            {"assetId": asset_id, "duration": duration},
            [m["sourceRange"] for m in moments],
            job_root,
        )
    if not verdict["ok"]:
        raise SubStageError(
            "MOMENT_OUT_OF_BOUNDS",
            f"{len(verdict['violations'])} generated Moment range(s) fall outside the source. "
            "This is the 'zero invalid source ranges' exit criterion; refusing to commit the index.",
            details={"violations": verdict["violations"][:10]},
        )

    # --- commit: gate passed, both artefacts land together ------------------
    index = assemble_index(
        job_id=job_id,
        asset_id=asset_id,
        source_content_hash=content_hash,
        timebase_map=timebase_map,
        sub_stages=records,
        transcript=transcript_body,
        speaker_turns=speaker_turns,
        shots=shot_list,
        scenes=scene_list,
        ocr=ocr_list,
        visual_descriptions=visual_list,
        audio_events=audio_list,
        quality_flags=quality_list,
        created_at=_now_iso(),
    )
    if index["indexId"] != index_id:  # pragma: no cover - guards the derivation above
        raise SubStageError(
            "INDEX_ID_MISMATCH",
            "The pre-derived index id disagrees with the assembled one; every Moment's "
            "`sourceIndexId` would dangle.",
        )
    _validate("SourceIndex", index)

    index_path = job_root / "index" / f"source-index-{index_id}.json"
    moments_path = job_root / "moments" / f"moments-{index_id}.json"
    write_json_atomic(index_path, index)
    write_json_atomic(moments_path, moments)

    warnings = [s["reason"] for s in summaries if s["status"] != "completed" and s["reason"]]
    if embed_warning:
        warnings.append(f"Moment embeddings omitted: {embed_warning}")

    append_run_log(
        ctx,
        {
            "event": "index-complete",
            "jobId": job_id,
            "assetId": asset_id,
            "indexId": index["indexId"],
            "momentCount": len(moments),
            "boundsChecked": verdict["checked"],
            "cacheHits": sum(1 for s in summaries if s["cacheHit"]),
        },
    )

    return {
        "jobId": job_id,
        "assetId": asset_id,
        "indexId": index["indexId"],
        "indexPath": str(index_path.relative_to(job_root)).replace("\\", "/"),
        "indexerVersion": INDEXER_VERSION,
        "momentCount": len(moments),
        "momentsPath": str(moments_path.relative_to(job_root)).replace("\\", "/"),
        "subStages": summaries,
        "boundsCheck": {
            "checked": verdict["checked"],
            "ok": verdict["ok"],
            "violations": verdict.get("violations", []),
        },
        "cacheHits": sum(1 for s in summaries if s["cacheHit"]),
        "warnings": warnings,
    }


def _validate(model_name: str, instance: dict[str, Any]) -> None:
    """Validate against the generated model before the artefact lands.

    Catching a contract violation here makes it a failed run; catching it in
    Phase 3 makes it a corrupt artefact somebody has to trace back.
    """
    try:
        if model_name == "SourceIndex":
            from cutdown_contracts.source_index_v1 import SourceIndex as Model
        else:
            from cutdown_contracts.moment_v1 import Moment as Model
    except ImportError:  # pragma: no cover - generated types are an entry-gate artefact
        return

    try:
        Model.model_validate(instance)
    except Exception as error:  # noqa: BLE001 — surface as a structured contract failure
        raise SubStageError(
            "CONTRACT_VIOLATION",
            f"Produced {model_name} does not satisfy its schema: {str(error)[:600]}",
        ) from error


def entrypoint() -> int:
    input_path, output_path = parse_args(sys.argv[1:])
    request = load_request(input_path)
    result = index_asset(request)
    write_json_atomic(output_path, result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main_guard(entrypoint))
