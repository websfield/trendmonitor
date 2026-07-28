"""Scene grouping sub-stage (Phase 2 task 3) — PRD REQ-012, decisions.md D-18.

REQ-012 asks for "longer semantic scenes" above the shot layer. A scene is a run
of adjacent shots that belong together; the job of this module is to decide
where such a run must STOP.

The rule set is versioned (`SCENE_RULES_VERSION`) and every threshold it uses is
recorded in the EngineRecord, because a scene boundary is a judgement call and a
judgement whose parameters are not written down cannot be reproduced or argued
with later.

**The failure mode this module is built against** (phase plan, verbatim): "fade
and camera-change fixtures must not collapse into one unbounded scene." Naive
grouping — "adjacent shots are temporally proximate, so join them" — swallows an
entire asset into one scene, and a scene that spans the asset carries no
information at all. Three separate defences stop that:

1. A `fade` or `camera_change` entering a shot is a hard barrier. A fade is a
   deliberate authorial separation; a camera change is a framing move large
   enough that the enum's own description calls it "a new shot". Neither is ever
   absorbed. A `hard_cut` IS absorbed — cutting between angles inside one scene
   is ordinary grammar, and refusing to absorb it would make scenes and shots
   the same layer.
2. Shots must abut (`temporal_proximity`). Shots tile the asset, so this holds
   for genuine neighbours and fails the moment a caller hands us a
   non-contiguous shot list.
3. A scene is capped at `max_scene_seconds` regardless of signals. "Unbounded"
   is the word in the failure mode; this is the bound.

`transcript_continuity`, `speaker_continuity` and `visual_continuity` do not
create joins — they record WHY a join was justified, which is what
`groupingSignals` is for. A scene of one shot grouped nothing and honestly
reports an empty signal list.

Grouping is pure: it takes shots, an optional transcript artefact, and optional
per-shot keyframe histograms. Nothing here needs a model or a decoder, so the
rules are unit-testable without media — the media-backed part is confined to
`keyframe_histograms`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

from harness import SubStageContext, SubStageError, SubStageResult, hash_json, run_sub_stage
from shots import Timebase, seconds_to_ticks

#: Bumped whenever a grouping rule or barrier changes. Recorded in the
#: EngineRecord parameters (REQ-012) and in the cache key (REQ-005).
SCENE_RULES_VERSION = "1.0.0"

ENGINE_NAME = "cutdown-scene-grouper"

DEFAULT_SCENE_CONFIG: dict[str, Any] = {
    "rules_version": SCENE_RULES_VERSION,
    # The barriers. Comma-joined rather than a list so the value survives the
    # EngineRecord's string-valued key/value form unchanged.
    "scene_break_transitions": "camera_change,fade",
    # Shots tile the asset, so a genuine neighbour has a gap of exactly 0. A
    # non-zero tolerance exists only so a caller that hands us shots derived
    # from a trimmed range is not silently split at every boundary.
    "temporal_proximity_max_gap_seconds": 0.5,
    # Speech carrying across a cut is evidence the cut is intra-scene. One
    # second is about the length of a natural sentence pause; beyond it the
    # speech either side is not obviously the same thought.
    "transcript_continuity_max_gap_seconds": 1.0,
    # Pearson correlation between the two shots' keyframe HSV histograms. 0.60
    # is deliberately permissive: it is recorded as supporting evidence, never
    # required for a join, so a false negative costs a signal label, not a scene.
    "visual_continuity_min_correlation": 0.60,
    # The bound in "must not collapse into one unbounded scene".
    "max_scene_seconds": 30.0,
    # Keyframe histogram shape. Hue and saturation only — value is dropped so a
    # lighting change does not read as a location change.
    "histogram_hue_bins": 16,
    "histogram_saturation_bins": 8,
    "backend": "pyav",
}

_ALL_SIGNALS = (
    "speaker_continuity",
    "temporal_proximity",
    "transcript_continuity",
    "visual_continuity",
)


@dataclass(frozen=True)
class _Span:
    """A transcript segment reduced to the shot timebase."""

    start: int
    end: int
    speaker: str | None


def _break_transitions(config: dict[str, Any]) -> frozenset[str]:
    return frozenset(part for part in str(config["scene_break_transitions"]).split(",") if part)


def _timebase_of(shot: dict[str, Any]) -> Timebase:
    return Timebase(num=int(shot["timebase"]["num"]), den=int(shot["timebase"]["den"]))


def pearson_correlation(left: list[float], right: list[float]) -> float:
    """Correlation between two histograms — the OpenCV `HISTCMP_CORREL` formula.

    Implemented here rather than called from cv2 so the grouping rules stay pure
    Python and testable with hand-written vectors: a grouping bug must be
    reproducible without decoding a video.
    """
    if len(left) != len(right) or not left:
        return 0.0
    mean_left = sum(left) / len(left)
    mean_right = sum(right) / len(right)
    covariance = sum((a - mean_left) * (b - mean_right) for a, b in zip(left, right, strict=True))
    variance_left = sum((a - mean_left) ** 2 for a in left)
    variance_right = sum((b - mean_right) ** 2 for b in right)
    denominator = math.sqrt(variance_left * variance_right)
    if denominator == 0.0:
        # Two flat histograms are indistinguishable, not "perfectly similar".
        # Claiming 1.0 here would make every uniform frame visually continuous
        # with every other one.
        return 0.0
    return covariance / denominator


def transcript_spans(transcript: dict[str, Any] | None, target: Timebase) -> list[_Span]:
    """Project transcript segments into the shot timebase.

    The transcript sub-stage may work in an audio timebase (`{1, sampleRate}`),
    which is a different tick scale entirely. Comparing its ticks against shot
    ticks without rescaling would be an off-by-a-factor-of-1000 bug that still
    produced plausible-looking output.
    """
    if not transcript:
        return []
    spans: list[_Span] = []
    for segment in transcript.get("segments") or []:
        source = segment.get("timebase") or target.to_dict()
        scale = Fraction(int(source["num"]), int(source["den"])) * Fraction(target.den, target.num)
        spans.append(
            _Span(
                start=round(Fraction(int(segment["startTicks"])) * scale),
                end=round(Fraction(int(segment["endTicks"])) * scale),
                speaker=segment.get("speakerTurnId"),
            )
        )
    return sorted(spans, key=lambda s: (s.start, s.end))


def _transcript_signals(
    boundary: int,
    spans: list[_Span],
    max_gap_ticks: int,
) -> set[str]:
    """Does speech carry across `boundary`, and is it the same speaker?"""
    signals: set[str] = set()
    if not spans:
        return signals

    spanning = [s for s in spans if s.start < boundary < s.end]
    if spanning:
        signals.add("transcript_continuity")
        if any(s.speaker for s in spanning):
            signals.add("speaker_continuity")
        return signals

    before = [s for s in spans if s.end <= boundary]
    after = [s for s in spans if s.start >= boundary]
    if not before or not after:
        return signals

    last = max(before, key=lambda s: s.end)
    first = min(after, key=lambda s: s.start)
    if first.start - last.end <= max_gap_ticks:
        signals.add("transcript_continuity")
        if last.speaker is not None and last.speaker == first.speaker:
            signals.add("speaker_continuity")
    return signals


def join_signals(
    previous: dict[str, Any],
    following: dict[str, Any],
    *,
    config: dict[str, Any],
    spans: list[_Span],
    histograms: dict[str, list[float]] | None = None,
) -> set[str]:
    """Which continuity signals fire across the boundary between two shots."""
    timebase = _timebase_of(previous)
    signals: set[str] = set()

    gap = following["startTicks"] - previous["endTicks"]
    if 0 <= gap <= seconds_to_ticks(float(config["temporal_proximity_max_gap_seconds"]), timebase):
        signals.add("temporal_proximity")

    signals |= _transcript_signals(
        following["startTicks"],
        spans,
        seconds_to_ticks(float(config["transcript_continuity_max_gap_seconds"]), timebase),
    )

    if histograms:
        left = histograms.get(previous["shotId"])
        right = histograms.get(following["shotId"])
        if left and right:
            correlation = pearson_correlation(left, right)
            if correlation >= float(config["visual_continuity_min_correlation"]):
                signals.add("visual_continuity")

    return signals


def group_shots(
    shots: list[dict[str, Any]],
    engine: dict[str, Any],
    *,
    config: dict[str, Any] | None = None,
    transcript: dict[str, Any] | None = None,
    histograms: dict[str, list[float]] | None = None,
) -> list[dict[str, Any]]:
    """Group adjacent shots into scenes. Pure — no media, no model, no clock."""
    resolved = {**DEFAULT_SCENE_CONFIG, **(config or {})}
    if not shots:
        return []

    ordered = sorted(shots, key=lambda s: (s["startTicks"], s["shotId"]))
    timebase = _timebase_of(ordered[0])
    barriers = _break_transitions(resolved)
    max_scene_ticks = seconds_to_ticks(float(resolved["max_scene_seconds"]), timebase)
    spans = transcript_spans(transcript, timebase)

    groups: list[list[dict[str, Any]]] = [[ordered[0]]]
    group_signals: list[set[str]] = [set()]

    for shot in ordered[1:]:
        current = groups[-1]
        previous = current[-1]

        signals = join_signals(previous, shot, config=resolved, spans=spans, histograms=histograms)

        # Order matters: a barrier is checked FIRST so no accumulation of
        # supporting signals can ever argue a fade away.
        blocked = (
            shot["transitionIn"] in barriers
            or previous["transitionOut"] in barriers
            or "temporal_proximity" not in signals
            or shot["endTicks"] - current[0]["startTicks"] > max_scene_ticks
        )

        if blocked:
            groups.append([shot])
            group_signals.append(set())
        else:
            current.append(shot)
            group_signals[-1] |= signals

    scenes: list[dict[str, Any]] = []
    for index, (members, signals) in enumerate(zip(groups, group_signals, strict=True)):
        scenes.append(
            {
                "sceneId": f"scene-{index + 1:04d}",
                "shotIds": [member["shotId"] for member in members],
                "startTicks": members[0]["startTicks"],
                "endTicks": members[-1]["endTicks"],
                "timebase": timebase.to_dict(),
                # Sorted, and drawn from a fixed vocabulary, so the artefact is
                # byte-identical across runs (contract §5).
                "groupingSignals": [signal for signal in _ALL_SIGNALS if signal in signals],
                "engine": engine,
            }
        )
    return scenes


def keyframe_histograms(
    media_path: Path,
    shots: list[dict[str, Any]],
    config: dict[str, Any] | None = None,
) -> dict[str, list[float]]:
    """Hue/saturation histogram of each shot's keyframe, for `visual_continuity`.

    Sampling the recorded `keyframeTicks` — rather than any frame that happens
    to be convenient — is what makes this reproducible: the same frame OCR and
    visual description will read.
    """
    resolved = {**DEFAULT_SCENE_CONFIG, **(config or {})}
    if not shots:
        return {}

    import cv2
    import numpy as np
    from scenedetect import FrameTimecode, open_video
    from scenedetect.video_stream import VideoOpenFailure

    try:
        video = open_video(str(media_path), backend=str(resolved["backend"]))
    except VideoOpenFailure as error:
        raise SubStageError(
            code="MEDIA_OPEN_FAILED",
            message=f"scene grouping could not open {media_path.name}: {error}",
        ) from error

    hue_bins = int(resolved["histogram_hue_bins"])
    saturation_bins = int(resolved["histogram_saturation_bins"])

    histograms: dict[str, list[float]] = {}
    for shot in sorted(shots, key=lambda s: s["startTicks"]):
        timebase = _timebase_of(shot)
        seconds = shot["keyframeTicks"] * timebase.num / timebase.den
        try:
            video.seek(FrameTimecode(float(seconds), video.frame_rate))
            frame = video.read()
        except Exception as error:  # noqa: BLE001 — a decode failure must not be a traceback
            raise SubStageError(
                code="KEYFRAME_READ_FAILED",
                message=f"could not read the keyframe for {shot['shotId']}: {error}",
                details={"shotId": shot["shotId"]},
            ) from error
        if frame is False or frame is None:
            # Past the last decodable frame. A missing histogram simply means
            # `visual_continuity` cannot fire for this shot — it is never a
            # fabricated zero vector, which would read as "definitely different".
            continue

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        histogram = cv2.calcHist([hsv], [0, 1], None, [hue_bins, saturation_bins], [0, 180, 0, 256])
        cv2.normalize(histogram, histogram, 0.0, 1.0, cv2.NORM_MINMAX)
        histograms[shot["shotId"]] = [float(value) for value in np.asarray(histogram).flatten()]

    return histograms


def scene_engine_record(config: dict[str, Any]) -> dict[str, Any]:
    """EngineRecord carrying the rule-set version and EVERY grouping threshold."""
    return {
        "name": ENGINE_NAME,
        "version": str(config.get("rules_version", SCENE_RULES_VERSION)),
        "parameters": [{"key": key, "value": _stringify(config[key])} for key in sorted(config)],
    }


def _stringify(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def compute_scenes(
    shots: list[dict[str, Any]],
    *,
    media_path: Path | None = None,
    transcript: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The sub-stage body. `media_path`/`transcript` are optional inputs.

    Both are optional on purpose: `shots` is the only hard dependency, so scene
    grouping still completes when the transcript sub-stage failed or the media
    is unreadable — with fewer signals recorded, which is visible in
    `groupingSignals` rather than hidden.
    """
    resolved = {**DEFAULT_SCENE_CONFIG, **(config or {})}
    engine = scene_engine_record(resolved)
    histograms = keyframe_histograms(media_path, shots, resolved) if media_path is not None else None
    return {"scenes": group_shots(shots, engine, config=resolved, transcript=transcript, histograms=histograms)}


def run_scenes_sub_stage(
    ctx: SubStageContext,
    shots: list[dict[str, Any]],
    *,
    media_path: Path | None = None,
    transcript: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
    force: bool = False,
) -> SubStageResult:
    """`scenes` as an independently resumable sub-stage, separate from `shots`.

    The cache key carries a digest of the SHOTS and the TRANSCRIPT as well as the
    thresholds. Both are upstream artefacts rather than media, so the context's
    content hash does not cover them: re-running with a different shot threshold
    would otherwise serve scenes grouped from shots that no longer exist.
    """
    resolved = {**DEFAULT_SCENE_CONFIG, **(config or {})}
    model_config = {
        **resolved,
        "shots_digest": hash_json(shots),
        "transcript_digest": hash_json(transcript) if transcript else None,
    }
    return run_sub_stage(
        ctx,
        "scenes",
        lambda: compute_scenes(shots, media_path=media_path, transcript=transcript, config=resolved),
        model_config=model_config,
        force=force,
    )
