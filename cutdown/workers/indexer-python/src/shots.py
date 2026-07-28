"""Shot detection sub-stage (Phase 2 task 3) — PRD REQ-012, decisions.md D-18.

REQ-012 asks for three things a single detector cannot give you: hard cuts,
fades, and camera changes, with *every threshold recorded in the index*. This
module runs PySceneDetect 0.7 three times over the same media and reads the
three answers against each other:

* ``ContentDetector(threshold=hard_cut_threshold)`` — a large HSV+luma delta
  between consecutive frames. This is a **hard cut**.
* ``ContentDetector(threshold=camera_change_threshold)`` — the same detector at
  a lower bar. A boundary the low bar sees and the high bar does not is a
  continuous take whose framing moved enough to read as a new shot: a
  **camera change** (see `enums/shot-transition-kind.json`).
* ``ThresholdDetector(threshold=fade_threshold)`` — average frame luma falling
  below a floor, i.e. fade to/from black. This is a **fade**.

A fade also spikes the content delta, so the three answers overlap. They are
merged by precedence — ``fade > hard_cut > camera_change`` — because a
fade-to-black misread as a hard cut is exactly the confusion the schema's Shot
description calls out.

Three properties this module owes the rest of the index:

1. **Shots tile the asset.** Contiguous, non-overlapping, half-open ranges from
   tick 0 to the asset's exact duration. A gap silently loses footage that no
   downstream Moment can ever reference again, so `assert_tiles` enforces it and
   `compute_shots` calls it before returning.
2. **A static take still yields shots.** `broll-silent.mp4` is a single frozen
   frame; every detector correctly reports nothing. Emitting zero shots would
   starve OCR and visual description, and emitting one shot spanning the asset
   would make `keyframeTicks` a single frame standing in for the whole clip.
   Instead the asset is sliced deterministically by time, with both transitions
   recorded as `unknown` — no detection is claimed that did not happen.
3. **Ticks are in the asset's own timebase, never derived from an fps guess.**
   `ugly.mp4` is genuinely variable-frame-rate: its average rate is 400/19 while
   its container timebase is 1/15360. Converting a frame number through an
   average fps would place every boundary in the wrong spot. The ``pyav``
   backend carries real presentation timestamps (`FrameTimecode.pts` /
   `.time_base` — new in 0.7), and ffprobe's `duration_ts` gives the exact
   duration as an integer in that same timebase, so no float second ever enters
   the arithmetic after the engine boundary.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

from harness import SubStageContext, SubStageError, SubStageResult, run_sub_stage

#: Bumped whenever the boundary classification or tiling rules change. Recorded
#: in the EngineRecord and in the cache key, so an old artefact cannot be served
#: for new rules.
SHOT_RULES_VERSION = "1.0.0"

ENGINE_NAME = "pyscenedetect"

#: Every value here changes the output, so every value is both an EngineRecord
#: parameter (REQ-012: thresholds recorded with the index) and part of the
#: sub-stage cache key (REQ-005).
DEFAULT_SHOT_CONFIG: dict[str, Any] = {
    "rules_version": SHOT_RULES_VERSION,
    # PySceneDetect's own default. Chosen unchanged: it is the value the
    # upstream project tuned against real footage, and departing from it would
    # need evidence this repo does not yet have.
    "hard_cut_threshold": 27.0,
    # Deliberately well below the hard-cut bar. On the `camera-change.mp4`
    # fixture (a continuous take panning across a testsrc2 field) the content
    # delta peaks between these two values: 27.0 sees nothing, 10.0 sees the
    # pan. That gap IS the camera-change band.
    "camera_change_threshold": 10.0,
    # ThresholdDetector's default average-luma floor (0-255). The fade fixture
    # holds ~0.3 s of true black, which sits far under it.
    "fade_threshold": 12.0,
    # Frames. PySceneDetect's default; suppresses a detector firing twice on the
    # ramp of one transition.
    "min_scene_len_frames": 15,
    # Two detectors rarely agree on the exact frame of the same transition —
    # ThresholdDetector fires when luma crosses the floor, ContentDetector on
    # the delta peak. Candidates closer together than this are one boundary.
    "boundary_merge_seconds": 0.25,
    # A shorter shot is a detector artefact, not footage anyone can cut to.
    "min_shot_seconds": 0.25,
    # Static-take fallback slice length. 2 s is short enough that one keyframe
    # plausibly represents its slice and long enough not to flood OCR.
    "static_take_slice_seconds": 2.0,
    # Confidence is a property of WHICH detector fired, not a score the engine
    # reports — PySceneDetect returns boundaries, not probabilities. These are
    # the honest ordering: a luma floor crossing and a large content delta are
    # strong evidence; the low-threshold band is weaker; a time slice is not
    # evidence of a transition at all.
    "confidence_hard_cut": 0.9,
    "confidence_fade": 0.8,
    "confidence_camera_change": 0.6,
    "confidence_time_slice": 0.3,
    # pyav exposes real container PTS; opencv reports millisecond positions and
    # an averaged frame rate, which is wrong for VFR media.
    "backend": "pyav",
}

#: fade beats hard_cut beats camera_change when detectors disagree about the
#: same instant. Higher wins.
_TRANSITION_PRECEDENCE = {"fade": 3, "hard_cut": 2, "camera_change": 1, "unknown": 0}


@dataclass(frozen=True)
class Timebase:
    """Seconds per tick as an exact rational (`timecode-v1.json#/$defs/Timebase`)."""

    num: int
    den: int

    def to_dict(self) -> dict[str, int]:
        return {"num": self.num, "den": self.den}


@dataclass(frozen=True)
class VideoProbe:
    """The three facts shot detection needs from the container, all exact."""

    timebase: Timebase
    #: Duration as an integer count of `timebase` ticks — ffprobe `duration_ts`.
    duration_ticks: int
    #: The container's *average* frame rate. Recorded because it is the number a
    #: naive implementation would convert frame numbers through, and on a VFR
    #: asset that is wrong: `ugly.mp4` averages 400/19 fps while its timebase is
    #: 1/15360. Nothing in this module places a boundary with it.
    avg_frame_rate: Fraction


@dataclass(frozen=True)
class Boundary:
    """One detected transition, already in asset ticks."""

    ticks: int
    kind: str
    confidence: float


def seconds_to_ticks(seconds: float, timebase: Timebase) -> int:
    """Convert at the engine boundary and never again (contract §3)."""
    return round(seconds * timebase.den / timebase.num)


def rescale_ticks(pts: int, source_timebase: Fraction, target: Timebase) -> int:
    """Move a presentation timestamp between timebases with exact rationals.

    The engine's timebase and the container's need not match (the opencv backend
    reports microseconds regardless of the container). Going via `float` seconds
    would reintroduce exactly the drift tech-spec §3 forbids.
    """
    # ticks = pts * (seconds per source tick) / (seconds per target tick).
    # `Fraction(target.den, target.num)` is built from the raw fields rather than
    # by inverting a reduced Fraction: reduction changes the denominator, and a
    # reduced denominator is no longer the target's tick count.
    return round(Fraction(pts) * source_timebase * Fraction(target.den, target.num))


def _ffprobe_binary() -> str:
    found = shutil.which("ffprobe")
    if found is None:
        raise SubStageError(
            code="FFPROBE_UNAVAILABLE",
            message="ffprobe was not found on PATH; the asset timebase cannot be established.",
        )
    return found


def probe_video(media_path: Path) -> VideoProbe:
    """Read the container's own timebase and exact duration via ffprobe.

    `duration_ts` is an integer already counted in the stream's `time_base`, so
    the asset duration reaches us without ever being a float. Spawned as an argv
    array with no shell — Windows is the dev machine (contract §0).
    """
    argv = [
        _ffprobe_binary(),
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=time_base,duration_ts,avg_frame_rate",
        "-of",
        "json",
        str(media_path),
    ]
    try:
        completed = subprocess.run(argv, capture_output=True, text=True, check=False)
    except OSError as error:  # pragma: no cover - defensive
        raise SubStageError(code="FFPROBE_FAILED", message=f"ffprobe could not be spawned: {error}") from error

    if completed.returncode != 0:
        raise SubStageError(
            code="FFPROBE_FAILED",
            message=f"ffprobe exited {completed.returncode} for {media_path.name}",
            details={"stderr": completed.stderr[-2000:]},
        )

    try:
        streams = json.loads(completed.stdout).get("streams") or []
    except json.JSONDecodeError as error:
        raise SubStageError(code="FFPROBE_FAILED", message=f"ffprobe emitted unparseable JSON: {error}") from error

    if not streams:
        raise SubStageError(
            code="NO_VIDEO_STREAM",
            message=f"{media_path.name} has no video stream; shot detection is not applicable.",
        )

    stream = streams[0]
    try:
        time_base = Fraction(stream["time_base"])
        duration_ticks = int(stream["duration_ts"])
        avg_frame_rate = Fraction(stream["avg_frame_rate"])
    except (KeyError, ValueError, ZeroDivisionError) as error:
        raise SubStageError(
            code="TIMEBASE_UNAVAILABLE",
            message=f"{media_path.name} does not report a usable timebase or duration.",
            details={"stream": stream},
        ) from error

    if duration_ticks <= 0 or time_base <= 0:
        raise SubStageError(
            code="TIMEBASE_UNAVAILABLE",
            message=f"{media_path.name} reports a non-positive duration or timebase.",
            details={"durationTs": duration_ticks, "timeBase": str(time_base)},
        )

    # `time_base` is seconds-per-tick, which is exactly the Timebase convention.
    return VideoProbe(
        timebase=Timebase(num=time_base.numerator, den=time_base.denominator),
        duration_ticks=duration_ticks,
        avg_frame_rate=avg_frame_rate,
    )


def _detect_starts(media_path: Path, detector: Any, backend: str, timebase: Timebase) -> list[int]:
    """Run one detector and return its scene START ticks (the boundaries)."""
    from scenedetect import SceneManager, open_video
    from scenedetect.video_stream import VideoOpenFailure

    try:
        video = open_video(str(media_path), backend=backend)
    except VideoOpenFailure as error:
        raise SubStageError(
            code="MEDIA_OPEN_FAILED",
            message=f"PySceneDetect could not open {media_path.name}: {error}",
        ) from error

    manager = SceneManager()
    manager.add_detector(detector)
    manager.detect_scenes(video=video, show_progress=False)

    starts: list[int] = []
    for start, _end in manager.get_scene_list():
        # `pts` + `time_base` are authoritative for VFR; `frame_num` is not.
        starts.append(rescale_ticks(start.pts, start.time_base, timebase))
    # The first scene starts at the asset head, which is not a transition.
    return [tick for tick in starts if tick > 0]


def detect_boundaries(media_path: Path, probe: VideoProbe, config: dict[str, Any]) -> list[Boundary]:
    """Run all three detectors and merge their answers into one classified list."""
    from scenedetect import ContentDetector, ThresholdDetector

    min_scene_len = int(config["min_scene_len_frames"])
    backend = str(config["backend"])

    passes = [
        (
            "fade",
            ThresholdDetector(threshold=float(config["fade_threshold"]), min_scene_len=min_scene_len),
            float(config["confidence_fade"]),
        ),
        (
            "hard_cut",
            ContentDetector(threshold=float(config["hard_cut_threshold"]), min_scene_len=min_scene_len),
            float(config["confidence_hard_cut"]),
        ),
        (
            "camera_change",
            ContentDetector(threshold=float(config["camera_change_threshold"]), min_scene_len=min_scene_len),
            float(config["confidence_camera_change"]),
        ),
    ]

    candidates: list[Boundary] = []
    for kind, detector, confidence in passes:
        for ticks in _detect_starts(media_path, detector, backend, probe.timebase):
            candidates.append(Boundary(ticks=ticks, kind=kind, confidence=confidence))

    merge_ticks = seconds_to_ticks(float(config["boundary_merge_seconds"]), probe.timebase)
    return merge_boundaries(candidates, merge_ticks)


def merge_boundaries(candidates: list[Boundary], merge_ticks: int) -> list[Boundary]:
    """Collapse candidates that describe the same transition (pure logic).

    Detectors do not agree on the exact frame of a transition, so three passes
    over one fade produce three nearby candidates. Clustering by proximity and
    keeping the highest-precedence member is what stops one fade being reported
    as a fade AND a hard cut AND a camera change.
    """
    if not candidates:
        return []

    ordered = sorted(candidates, key=lambda b: (b.ticks, -_TRANSITION_PRECEDENCE[b.kind], b.kind))
    clusters: list[list[Boundary]] = [[ordered[0]]]
    for candidate in ordered[1:]:
        if candidate.ticks - clusters[-1][0].ticks <= merge_ticks:
            clusters[-1].append(candidate)
        else:
            clusters.append([candidate])

    merged = [max(cluster, key=lambda b: (_TRANSITION_PRECEDENCE[b.kind], -b.ticks)) for cluster in clusters]
    return sorted(merged, key=lambda b: b.ticks)


def _keyframe_ticks(start: int, end: int) -> int:
    """Midpoint, guaranteed strictly inside [start, end).

    OCR and visual description sample this frame. A keyframe on `endTicks` would
    read the FOLLOWING shot's first frame and attribute its text to this shot.
    """
    midpoint = start + (end - start) // 2
    return min(max(midpoint, start), end - 1)


def build_shots(
    boundaries: list[Boundary],
    probe: VideoProbe,
    config: dict[str, Any],
    engine: dict[str, Any],
) -> list[dict[str, Any]]:
    """Turn boundaries into shots that tile [0, duration) — pure, no media needed."""
    duration = probe.duration_ticks
    min_shot_ticks = seconds_to_ticks(float(config["min_shot_seconds"]), probe.timebase)

    kept: list[Boundary] = []
    previous = 0
    for boundary in sorted(boundaries, key=lambda b: b.ticks):
        if boundary.ticks - previous < min_shot_ticks:
            continue
        if duration - boundary.ticks < min_shot_ticks:
            continue
        kept.append(boundary)
        previous = boundary.ticks

    if not kept:
        return _time_sliced_shots(probe, config, engine)

    edges = [0, *[b.ticks for b in kept], duration]
    #: index i is the transition entering shot i; None means "the asset began/ended
    #: here", which is not a detection and must not be scored as one.
    incoming: list[Boundary | None] = [None, *kept]
    outgoing: list[Boundary | None] = [*kept, None]

    fallback_confidence = float(config["confidence_time_slice"])
    shots: list[dict[str, Any]] = []
    for index in range(len(edges) - 1):
        start, end = edges[index], edges[index + 1]
        detected = [b for b in (incoming[index], outgoing[index]) if b is not None]
        confidence = min((b.confidence for b in detected), default=fallback_confidence)
        shots.append(
            {
                "shotId": f"shot-{index + 1:04d}",
                "startTicks": start,
                "endTicks": end,
                "timebase": probe.timebase.to_dict(),
                "transitionIn": incoming[index].kind if incoming[index] else "unknown",
                "transitionOut": outgoing[index].kind if outgoing[index] else "unknown",
                "keyframeTicks": _keyframe_ticks(start, end),
                "confidence": confidence,
                "engine": engine,
            }
        )
    return shots


def _time_sliced_shots(probe: VideoProbe, config: dict[str, Any], engine: dict[str, Any]) -> list[dict[str, Any]]:
    """Static-take fallback: deterministic equal time slices, transitions `unknown`.

    Reached when no detector found anything — a locked-off camera on a static
    subject, which `broll-silent.mp4` is. Zero shots would leave OCR and visual
    description with nothing to sample; one asset-long shot would compress the
    whole clip into a single keyframe. Slicing is honest because it claims no
    transition: both ends are `unknown` and the confidence is the floor.
    """
    duration = probe.duration_ticks
    slice_ticks = seconds_to_ticks(float(config["static_take_slice_seconds"]), probe.timebase)

    # Ceiling division: an asset longer than one slice always yields at least two
    # shots, which is the property the phase plan asks to be proven.
    slice_count = max(1, -(-duration // slice_ticks)) if slice_ticks > 0 else 1

    shots: list[dict[str, Any]] = []
    for index in range(slice_count):
        start = duration * index // slice_count
        end = duration * (index + 1) // slice_count
        shots.append(
            {
                "shotId": f"shot-{index + 1:04d}",
                "startTicks": start,
                "endTicks": end,
                "timebase": probe.timebase.to_dict(),
                "transitionIn": "unknown",
                "transitionOut": "unknown",
                "keyframeTicks": _keyframe_ticks(start, end),
                "confidence": float(config["confidence_time_slice"]),
                "engine": engine,
            }
        )
    return shots


def assert_tiles(shots: list[dict[str, Any]], duration_ticks: int) -> None:
    """Contiguous, non-overlapping, covering [0, duration). Raises if not.

    Called on the way out of `compute_shots` rather than only in tests: a gap
    loses footage silently, and silent loss is the failure this whole sub-stage
    exists to avoid.
    """
    if not shots:
        raise SubStageError(code="SHOT_TILING_BROKEN", message="shot detection produced no shots at all")

    expected = 0
    for shot in shots:
        if shot["startTicks"] != expected:
            raise SubStageError(
                code="SHOT_TILING_BROKEN",
                message=f"{shot['shotId']} starts at {shot['startTicks']}, expected {expected}",
                details={"shotId": shot["shotId"]},
            )
        if shot["endTicks"] <= shot["startTicks"]:
            raise SubStageError(
                code="SHOT_TILING_BROKEN",
                message=f"{shot['shotId']} is empty or inverted",
                details={"shotId": shot["shotId"]},
            )
        if not shot["startTicks"] <= shot["keyframeTicks"] < shot["endTicks"]:
            raise SubStageError(
                code="SHOT_KEYFRAME_OUT_OF_RANGE",
                message=f"{shot['shotId']} keyframe {shot['keyframeTicks']} is outside its own range",
                details={"shotId": shot["shotId"]},
            )
        expected = shot["endTicks"]

    if expected != duration_ticks:
        raise SubStageError(
            code="SHOT_TILING_BROKEN",
            message=f"shots end at {expected} but the asset is {duration_ticks} ticks long",
        )


def shot_engine_record(config: dict[str, Any]) -> dict[str, Any]:
    """EngineRecord with EVERY threshold as a key/value pair (REQ-012).

    Sorted by key so the record — and therefore the artefact bytes — is identical
    across runs regardless of dict construction order.
    """
    import scenedetect

    return {
        "name": ENGINE_NAME,
        "version": str(scenedetect.__version__),
        "parameters": [{"key": key, "value": _stringify(config[key])} for key in sorted(config)],
    }


def _stringify(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def compute_shots(media_path: Path, config: dict[str, Any] | None = None) -> dict[str, Any]:
    """The sub-stage body: probe, detect, classify, tile, verify."""
    resolved = {**DEFAULT_SHOT_CONFIG, **(config or {})}
    probe = probe_video(media_path)
    engine = shot_engine_record(resolved)
    boundaries = detect_boundaries(media_path, probe, resolved)
    shots = build_shots(boundaries, probe, resolved, engine)
    assert_tiles(shots, probe.duration_ticks)
    return {"shots": shots}


def run_shots_sub_stage(
    ctx: SubStageContext,
    media_path: Path,
    *,
    config: dict[str, Any] | None = None,
    force: bool = False,
) -> SubStageResult:
    """`shots` as an independently resumable sub-stage (tech-spec §6.5).

    The full threshold set is the `model_config`, so changing any threshold
    invalidates the checkpoint instead of serving an artefact produced under
    different rules.
    """
    resolved = {**DEFAULT_SHOT_CONFIG, **(config or {})}
    return run_sub_stage(
        ctx,
        "shots",
        lambda: compute_shots(media_path, resolved),
        model_config=resolved,
        force=force,
    )
