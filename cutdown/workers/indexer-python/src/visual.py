"""Shot-level visual descriptions from SELECTIVE keyframes (Phase 2 task 5).

REQ-013 asks the index to "describe silent or visually important footage at shot
and moment level, not only isolated sampled frames." At Phase 0 the scope is
`shot`; `moment` scope arrives with Moment extraction.

Three properties this module exists to guarantee:

1. **Selective keyframes, and the count is logged.** PRD §10.7 minimisation is a
   cost-control requirement, not a nicety: we never send every frame, and every
   `VisualDescription` carries `keyframeCount` — the number of frames the VLM
   actually saw — so the minimisation claim is auditable after the fact rather
   than asserted in a comment.
2. **A clean, default skip.** The D-21 spend ceiling is owner-set and NOT SET
   yet, so the DEFAULT PATH of the whole indexer is to skip this sub-stage
   cleanly. `--no-vlm`, a missing key, a missing ceiling, an unavailable keyframe
   extractor, or a provider error all produce `visualDescriptions: []` plus a
   sub-stage record of `status: "skipped"` with a non-null `reason`. It NEVER
   produces a fabricated description — a made-up shot description is worse than
   no description, because a downstream editor cannot tell them apart.
3. **Resumability.** A *configuration* skip is a stable, cacheable answer. A
   *runtime degradation* (provider error, extractor failure) is not — so the
   checkpoint is invalidated afterwards and the next run retries, rather than
   the empty result being cached forever.

Because a live VLM call is neither deterministic nor free, the tests follow the
tech-spec §6.6 recorded-model convention: a `recorded-model.json` response is
replayed through the injected transport for byte-stable regression, alongside
property assertions (every description references a real `shotId`;
`keyframeCount` equals what was sent).
"""

from __future__ import annotations

import base64
import subprocess
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from harness import (
    SubStageContext,
    SubStageError,
    SubStageResult,
    append_run_log,
    hash_json,
    run_sub_stage,
)
from model_gateway import (
    GatewayConfig,
    ModelGateway,
    Transport,
    load_config,
    scrub,
)

SUB_STAGE = "visual_descriptions"

#: Bumped when the selection algorithm changes. Part of the cache key, because a
#: different keyframe set is a different question and therefore a different answer.
KEYFRAME_POLICY = "shot-keyframe-plus-cadence-v1"

#: One extra keyframe per this many seconds of shot duration, capped by
#: `max_keyframes`. Chosen so a 2s cut costs one frame and a 15s talking-head
#: costs three: below ~5s a single representative frame carries the shot's
#: content, and above it the framing usually changes at least once. It is a cost
#: knob, not a perceptual constant — it is recorded in the EngineRecord so a
#: later change is visible in the artefact rather than silently re-reading it.
SECONDS_PER_EXTRA_KEYFRAME = 5.0

SYSTEM_PROMPT = (
    "You describe a single video shot for a downstream video editor. "
    "You are shown selected keyframes from ONE shot. "
    "Describe only what is visibly present: subjects, setting, framing, action, on-screen text. "
    "Do not speculate about audio, intent, brand, or anything outside the frames. "
    'Reply with ONLY a JSON object of the form {"description": "..."} and nothing else.'
)


@dataclass(frozen=True)
class KeyframeImage:
    """One decoded keyframe, ready to be sent as an image content block."""

    ticks: int
    media_type: str
    data_base64: str


#: Supplied by the caller (the `index` orchestrator). Injecting it keeps the
#: sub-stage testable with no media and no network; the production loader is
#: `ffmpeg_keyframe_loader` below.
KeyframeLoader = Callable[[dict[str, Any], int], KeyframeImage]

#: The one on-disk source of gateway config (tech-spec: cutdown/.env), resolved
#: relative to this file so the worker finds it regardless of spawn cwd.
#: visual.py lives at workers/indexer-python/src/ → parents[3] is cutdown/.
DEFAULT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

#: PRD §10.7 minimisation: the VLM needs composition, not 4K — frames are
#: downscaled so the long edge is at most this many pixels before encoding.
KEYFRAME_MAX_EDGE = 1024


def ffmpeg_keyframe_loader(media_path: Path, *, ffmpeg: str = "ffmpeg") -> KeyframeLoader:
    """Extract one JPEG per (shot, tick) from the SOURCE media via ffmpeg.

    Seconds are derived by the same exact rational conversion the keyframe
    budget uses (`ticks * num / den`); no float value ever reaches an artefact.
    A failed or empty extraction raises `SubStageError`, which the sub-stage
    catches and degrades to a skip with the reason recorded (never fabricates).
    """

    def load(shot: dict[str, Any], tick: int) -> KeyframeImage:
        timebase = shot["timebase"]
        seconds = int(tick) * int(timebase["num"]) / int(timebase["den"])
        argv = [
            ffmpeg,
            "-v", "error",
            "-ss", f"{seconds:.6f}",
            "-i", str(media_path),
            "-frames:v", "1",
            "-vf", f"scale='min({KEYFRAME_MAX_EDGE},iw)':-2",
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "-",
        ]
        try:
            completed = subprocess.run(argv, capture_output=True, check=False)
        except OSError as error:
            raise SubStageError(
                code="KEYFRAME_EXTRACTION_FAILED",
                message=f"ffmpeg could not be spawned: {error}",
            ) from error
        if completed.returncode != 0 or not completed.stdout:
            raise SubStageError(
                code="KEYFRAME_EXTRACTION_FAILED",
                message=(
                    f"ffmpeg produced no frame at tick {tick} ({seconds:.3f}s) "
                    f"from {media_path.name}"
                ),
                details={"stderr": completed.stderr[-2000:].decode("utf-8", errors="replace")},
            )
        return KeyframeImage(
            ticks=int(tick),
            media_type="image/jpeg",
            data_base64=base64.b64encode(completed.stdout).decode("ascii"),
        )

    return load

Clock = Callable[[], str]


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# --- keyframe selection -----------------------------------------------------


def shot_duration_seconds(shot: dict[str, Any]) -> float:
    """Exact rational conversion: `ticks * num / den` (contract §3).

    Only used to decide *how many* frames to send. Every value that reaches the
    artefact stays in integer ticks — no float seconds are ever emitted.
    """
    timebase = shot["timebase"]
    span = int(shot["endTicks"]) - int(shot["startTicks"])
    return span * int(timebase["num"]) / int(timebase["den"])


def keyframe_budget(shot: dict[str, Any], max_keyframes: int) -> int:
    """How many frames this shot is worth, capped by the configured maximum."""
    if max_keyframes < 1:
        return 1
    duration = shot_duration_seconds(shot)
    earned = 1 + int(duration // SECONDS_PER_EXTRA_KEYFRAME)
    return max(1, min(max_keyframes, earned))


def select_keyframe_ticks(shot: dict[str, Any], max_keyframes: int) -> list[int]:
    """Pick the keyframes for one shot — deterministic, selective, capped.

    The shot's own declared `keyframeTicks` is always included (it is the
    representative frame the shot detector chose); any additional budget is spent
    on evenly spaced positions so a shot whose framing changes mid-way is still
    covered. Returned sorted and de-duplicated, so `len()` is exactly what gets
    sent and therefore exactly what `keyframeCount` reports.
    """
    start = int(shot["startTicks"])
    end = int(shot["endTicks"])
    budget = keyframe_budget(shot, max_keyframes)

    candidates = [int(shot["keyframeTicks"])]
    span = max(0, end - start)
    for index in range(1, budget):
        candidates.append(start + round(span * index / budget))

    last = max(start, end - 1)
    clamped = {min(max(tick, start), last) for tick in candidates}
    return sorted(clamped)[:budget]


# --- artefact assembly ------------------------------------------------------


def _sub_stage_record(
    *,
    status: str,
    reason: str | None,
    engine: dict[str, Any] | None,
    started_at: str,
    completed_at: str | None,
) -> dict[str, Any]:
    """A `SubStageRecord` with every required key present (closed schema)."""
    return {
        "name": SUB_STAGE,
        "status": status,
        "reason": reason,
        "engine": engine,
        "startedAt": started_at,
        "completedAt": completed_at,
    }


def _engine_record(config: GatewayConfig) -> dict[str, Any]:
    """`EngineRecord` naming the provider and the exact model ID (PRD §10.6)."""
    parameters = config.engine_parameters()
    parameters.append({"key": "keyframePolicy", "value": KEYFRAME_POLICY})
    parameters.append(
        {"key": "secondsPerExtraKeyframe", "value": str(SECONDS_PER_EXTRA_KEYFRAME)}
    )
    return {
        "name": config.provider,
        "version": config.model_id,
        "parameters": sorted(parameters, key=lambda pair: pair["key"]),
    }


def skipped_artefact(
    reason: str, *, started_at: str, completed_at: str | None = None
) -> dict[str, Any]:
    """The one shape every degraded path produces: EMPTY plus a stated reason.

    `visualDescriptions` is `[]` — never a placeholder entry, never a description
    with empty text, never a description the model did not produce.
    """
    return {
        "visualDescriptions": [],
        "subStage": _sub_stage_record(
            status="skipped",
            reason=reason,
            engine=None,
            started_at=started_at,
            completed_at=completed_at,
        ),
    }


def _validate_description(payload: Any) -> None:
    """Structured-output contract for one shot. Raises `ValueError` when wrong."""
    if not isinstance(payload, dict):
        raise ValueError(f"expected a JSON object, got {type(payload).__name__}")
    text = payload.get("description")
    if not isinstance(text, str):
        raise ValueError("'description' must be a string")
    if not text.strip():
        raise ValueError("'description' must not be empty")


def describe_shot(
    gateway: ModelGateway,
    shot: dict[str, Any],
    keyframes: Sequence[KeyframeImage],
) -> str:
    """One structured call for one shot; returns the validated description text."""
    content: list[dict[str, Any]] = []
    for frame in keyframes:
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": frame.media_type,
                    "data": frame.data_base64,
                },
            }
        )
    content.append(
        {
            "type": "text",
            "text": (
                f"These are {len(keyframes)} selected keyframes from shot {shot['shotId']}. "
                "Describe this shot."
            ),
        }
    )
    result = gateway.complete_json(
        system=SYSTEM_PROMPT, content=content, validate=_validate_description
    )
    return result.data["description"].strip()


def build_descriptions(
    gateway: ModelGateway,
    shots: Sequence[dict[str, Any]],
    keyframe_loader: KeyframeLoader,
    *,
    max_keyframes: int,
) -> list[dict[str, Any]]:
    """Describe every shot. Any failure propagates — nothing partial is kept.

    Descriptions are emitted in shot order with zero-padded deterministic IDs, so
    the same input produces the same IDs and downstream references stay valid.
    """
    engine = _engine_record(gateway.config)
    descriptions: list[dict[str, Any]] = []

    ordered = sorted(shots, key=lambda shot: (int(shot["startTicks"]), str(shot["shotId"])))
    for index, shot in enumerate(ordered, start=1):
        ticks = select_keyframe_ticks(shot, max_keyframes)
        frames = [keyframe_loader(shot, tick) for tick in ticks]
        text = describe_shot(gateway, shot, frames)
        descriptions.append(
            {
                "descriptionId": f"visdesc-{index:04d}",
                "scope": "shot",
                "shotId": shot["shotId"],
                "startTicks": int(shot["startTicks"]),
                "endTicks": int(shot["endTicks"]),
                "timebase": dict(shot["timebase"]),
                "text": text,
                # The auditable half of the minimisation claim: the number of
                # frames actually sent, not the number available.
                "keyframeCount": len(frames),
                "engine": engine,
            }
        )
    return descriptions


# --- sub-stage entry point --------------------------------------------------


def _warn(ctx: SubStageContext, reason: str) -> None:
    """Record a degradation in the job's append-only log at WARN level."""
    append_run_log(
        ctx,
        {
            "event": "index-sub-stage-warning",
            "subStage": SUB_STAGE,
            "jobId": ctx.job_id,
            "assetId": ctx.asset_id,
            "level": "warn",
            "reason": reason,
        },
    )


def _invalidate_checkpoint(ctx: SubStageContext) -> None:
    """Drop the checkpoint so a runtime degradation is retried, not cached.

    A configuration skip is a stable answer and stays cached. A provider outage
    is not an answer at all — caching it would mean a transient failure silently
    becomes this job's permanent "no visual descriptions".
    """
    path = ctx.checkpoint_dir / f"{SUB_STAGE}.json"
    if path.exists():
        path.unlink()


def run_visual_descriptions(
    ctx: SubStageContext,
    shots: Sequence[dict[str, Any]],
    *,
    enable_vlm: bool = False,
    config: GatewayConfig | None = None,
    transport: Transport | None = None,
    keyframe_loader: KeyframeLoader | None = None,
    clock: Clock = _now_iso,
    force: bool = False,
) -> SubStageResult:
    """Run the visual-description sub-stage, or skip it cleanly.

    `enable_vlm` defaults to **False**: `--no-vlm` is the default posture of the
    whole indexer until the D-21 ceiling is set (REQUIRED skip semantics). The
    caller flips it on explicitly; even then, a missing key or ceiling still
    degrades to a skip rather than to a failure or a paid call.

    The config fallback reads `cutdown/.env` ONLY when the VLM is enabled: the
    disabled path uses pure defaults so tests (and every skip run) never touch
    a real key file, and its cache key stays machine-independent.
    """
    if config is None:
        config = load_config(env_file=DEFAULT_ENV_FILE) if enable_vlm else GatewayConfig()
    started_at = clock()
    degraded: list[str] = []

    def compute() -> dict[str, Any]:
        if not enable_vlm:
            return skipped_artefact(
                "visual descriptions disabled (--no-vlm); "
                "the D-21 spend ceiling is owner-set and not yet configured",
                started_at=started_at,
                completed_at=clock(),
            )

        unconfigured = config.unconfigured_reason()
        if unconfigured is not None:
            degraded.append(unconfigured)
            return skipped_artefact(unconfigured, started_at=started_at, completed_at=clock())

        if keyframe_loader is None:
            reason = "no keyframe extractor was supplied; no frames could be sent to the VLM"
            degraded.append(reason)
            return skipped_artefact(reason, started_at=started_at, completed_at=clock())

        gateway = ModelGateway(config, transport=transport)
        try:
            descriptions = build_descriptions(
                gateway, shots, keyframe_loader, max_keyframes=config.max_keyframes
            )
        except SubStageError as error:
            # Degrade, never fabricate. The reason is scrubbed on the way out so
            # a provider error body can never carry a credential into the artefact.
            reason = scrub(f"{error.code}: {error.message}", config.api_key)
            degraded.append(reason)
            return skipped_artefact(reason, started_at=started_at, completed_at=clock())

        return {
            "visualDescriptions": descriptions,
            "subStage": _sub_stage_record(
                status="completed",
                reason=None,
                engine=_engine_record(config),
                started_at=started_at,
                completed_at=clock(),
            ),
        }

    result = run_sub_stage(
        ctx,
        SUB_STAGE,
        compute,
        model_config={
            **config.cache_key_fields(),
            "keyframePolicy": KEYFRAME_POLICY,
            "secondsPerExtraKeyframe": SECONDS_PER_EXTRA_KEYFRAME,
            "enableVlm": enable_vlm,
            # The shots this run actually saw are part of the key. They are an
            # upstream ARTEFACT, not media, so the context's content hash does
            # not cover them — without this, a run made with a broken or empty
            # shot list would have its (empty) descriptions served from
            # checkpoint forever, even after shots started working. `scenes`
            # already keys on its inputs for exactly this reason.
            "shotsDigest": hash_json(list(shots)),
        },
        force=force,
    )

    for reason in degraded:
        _warn(ctx, reason)
    if degraded:
        _invalidate_checkpoint(ctx)

    return result
