"""Quality-flag sub-stage of the `index` skill (Phase 2 task 7, PRD REQ-014).

REQ-014 names twelve technical-quality signals and this module implements a
detector for **every one of them** — eight over the video track, four over the
audio track. Nothing here is a sample or a placeholder; each detector reduces the
media to one measured number per unit of time, compares that number against a
recorded threshold, and reports the *time span* over which the comparison held.

Three properties are load-bearing and are worth stating before the code:

1. **Flags are evidence, never a gate.** A `QualityFlag` says "this span measured
   X against threshold Y". It carries a severity so a human can triage, and that
   is the whole of its authority — this sub-stage does not compute a `usable`
   verdict, does not veto, and nothing downstream may read a flag as permission.
   Advisory-only is a design constraint, not an omission.
2. **Every number is data.** Each threshold appears in `QualityFlag.threshold`,
   in `EngineRecord.parameters`, and in the `model_config` that feeds the REQ-005
   cache key. Re-tuning a threshold therefore invalidates cached artefacts and is
   visible in the artefact itself rather than buried in a code diff (tech-spec
   §12.1's "numbers are data" discipline).
3. **Flags are time-ranged.** A blur flag names the span that is blurry. Reporting
   the whole asset would be useless to an editor looking for the bad two seconds,
   so per-unit measurements are grouped into maximal runs and each run must clear
   a minimum duration before it is reported — which also suppresses the
   single-frame noise every frame-differencing metric produces.

## Detector inventory

| kind | rule key | measured quantity | fires |
|---|---|---|---|
| blur | `blur.laplacian_variance` | variance of the Laplacian of the luma plane | below |
| shake | `shake.translation_jerk` | frame-to-frame change in global translation (phase correlation) | above |
| exposure | `exposure.shadow_clipping` | fraction of luma samples at/below the black point | above |
| exposure | `exposure.highlight_clipping` | fraction of luma samples at/above the white point | above |
| black_or_frozen_frame | `black_or_frozen_frame.mean_luma` | mean luma of the frame | below |
| black_or_frozen_frame | `black_or_frozen_frame.frame_delta` | mean absolute luma difference vs the previous frame | below |
| occlusion | `occlusion.centre_flat_cells` | fraction of centre grid cells with no detail (given detail at the periphery) | above |
| poor_crop | `poor_crop.bar_fraction` | fraction of the frame taken by flat dark bars on opposing edges | above |
| low_resolution | `low_resolution.high_frequency_energy` | share of spectral energy above half-Nyquist | below |
| duplicate_frames | `duplicate_frames.dhash_match` | 1.0 when this frame's difference hash equals the previous frame's | above |
| audio_clipping | `audio_clipping.clipped_sample_fraction` | share of samples inside a run of full-scale samples | above |
| audio_noise | `audio_noise.noise_floor_dbfs` | level of the quietest fifth of the window (given a flat, noise-like spectrum there) | above |
| speech_intelligibility | `speech_intelligibility.speech_band_snr_db` | speech-band (300–3400 Hz) energy of the loud frames over the quiet frames | below |
| silence | `silence.frame_level_dbfs` | frame RMS level | below |

Two kinds carry more than one rule because REQ-014 names one *enum member* for
what are two physically distinct defects — under- and over-exposure, black and
frozen frames. Each rule keeps its own threshold and its own `threshold.name`, so
which rule fired is readable off the artefact.

## Deliberate overlaps

A defect rarely trips exactly one detector: a frozen segment is also duplicate
frames, a heavily blurred frame also lacks high-frequency energy, speech buried
in noise is both `audio_noise` and `speech_intelligibility`. That is correct
behaviour — these are independent measurements of a shared cause, not duplicates
— and the coverage matrix in `tests/test_quality.py` is written to allow it: a
positive fixture must fire *its* kind, and the negative controls (which carry no
defect at all) must fire nothing.

## Determinism

The whole pipeline is fixed-point in the sense that matters: FFmpeg decodes to
raw luma / raw float samples with no scaling choice left to chance, every metric
is a deterministic function of those samples, and no wall-clock, random seed, or
dict ordering enters an artefact. Two runs over the same file are byte-identical.
The one honest caveat is VFR: `ticks` are frame indices in the source's
*nominal* `r_frame_rate` timebase, so on a variable-frame-rate source a span's
tick range maps to real time only as accurately as that nominal rate — the
`timebaseMap` (REQ-019) is where an exact mapping lives, not here.

## Known gap: subject-clipping

`poor_crop` is detected by the framing proxy only — flat bars on opposing edges,
i.e. a picture that does not fill its frame. The other half of the defect, a
*subject* cut by the frame edge, is NOT detected. A spectral-residual saliency
rule was implemented and measured against this project's fixtures and then
removed: the border-band saliency ratio has no content-independent threshold
(1.18 on dense `testsrc2` texture against 0.16 on a flat b-roll card, with a
deliberately edge-clipped subject reaching only 0.77), so any fixed fire point
would be tuned to one kind of footage and silently blind on another. Closing this
properly needs a subject or face model, which this worker does not carry. It is
recorded here rather than papered over, because a detector that cannot fire is
worse than a documented absence: it reads as coverage.
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from harness import SubStageContext, SubStageError, SubStageResult, run_sub_stage

SUB_STAGE = "quality_flags"

ENGINE_NAME = "cutdown-quality"
# Bumped whenever a metric's *definition* changes. Distinct from a threshold
# change: both invalidate the cache (both are in model_config), but a definition
# change also makes previously recorded scores incomparable.
ENGINE_VERSION = "1.0.0"

#: Luma metrics are computed on a fixed-width copy of the frame so that a
#: threshold means the same thing for a 4K source as for a 640x360 one. The
#: spectral metric (`low_resolution`) deliberately uses the NATIVE frame — its
#: whole question is how much real detail the declared resolution carries.
WORK_WIDTH = 320

#: Audio is decoded to mono at this rate. 16 kHz spans the 300–3400 Hz speech
#: band with room to spare and keeps the analysis cheap; it is recorded in
#: model_config because changing it changes every audio score.
AUDIO_SAMPLE_RATE = 16_000
AUDIO_FRAME = 512  # 32 ms
AUDIO_HOP = 256  # 16 ms
#: Window over which the three statistical audio metrics are estimated. A noise
#: floor or a speech-band SNR is meaningless on a single 32 ms frame.
AUDIO_WINDOW_FRAMES = 62  # ~1.0 s
AUDIO_WINDOW_HOP_FRAMES = 31  # ~0.5 s, so a defect cannot fall between windows

GREATER_THAN = "greater_than"
LESS_THAN = "less_than"


@dataclass(frozen=True)
class Rule:
    """One detector: a measured quantity, the point it fires, and its severity ladder.

    `fire_at` is the value recorded in `QualityFlag.threshold` — it is the
    boundary of "worth reporting at all". `warning_at` and `severe_at` are the
    two escalation points; they are recorded in `EngineRecord.parameters` and in
    `model_config` for the same reason `fire_at` is, so no number that changes an
    output is invisible to the cache key or to a reader of the artefact.

    `min_units` is the minimum number of consecutive measuring units (video
    frames, or audio windows) a run must span before it is reported. Every
    frame-differencing metric produces isolated single-unit spikes on ordinary
    footage; without a floor the artefact fills with them.
    """

    key: str
    kind: str
    comparison: str
    fire_at: float
    warning_at: float
    severe_at: float
    min_units: int
    #: Human-readable statement of what the number means, for the report card.
    units: str

    def fires(self, score: float) -> bool:
        if self.comparison == GREATER_THAN:
            return score > self.fire_at
        return score < self.fire_at

    def severity(self, score: float) -> str:
        """info at `fire_at`, warning at `warning_at`, severe at `severe_at`."""
        if self.comparison == GREATER_THAN:
            if score > self.severe_at:
                return "severe"
            if score > self.warning_at:
                return "warning"
            return "info"
        if score < self.severe_at:
            return "severe"
        if score < self.warning_at:
            return "warning"
        return "info"

    def worst(self, a: float, b: float) -> float:
        """The more-defective of two scores, so a span reports its worst moment."""
        return max(a, b) if self.comparison == GREATER_THAN else min(a, b)

    def to_threshold(self) -> dict[str, Any]:
        return {"name": self.key, "value": self.fire_at, "comparison": self.comparison}


# --------------------------------------------------------------------------
# Thresholds
#
# Every value below was chosen by measuring the actual fixture corpus under
# `skills/index/fixtures/quality/` — the defective clip and the clean control —
# and placing the fire point in the gap between the two populations rather than
# at a remembered "industry" number. `fixtures/quality/README.md` records the
# measured separation alongside the FFmpeg command that generated each clip, so
# a future re-tune starts from evidence rather than from taste.
# --------------------------------------------------------------------------

RULES: tuple[Rule, ...] = (
    Rule(
        key="blur.laplacian_variance",
        kind="blur",
        comparison=LESS_THAN,
        fire_at=40.0,
        warning_at=20.0,
        severe_at=8.0,
        min_units=3,
        units="variance of the Laplacian, 8-bit luma at 320 px wide",
    ),
    Rule(
        key="shake.translation_jerk",
        kind="shake",
        comparison=GREATER_THAN,
        fire_at=8.0,
        warning_at=14.0,
        severe_at=22.0,
        min_units=3,
        units="px of frame-to-frame change in global translation, at 320 px wide",
    ),
    Rule(
        key="exposure.shadow_clipping",
        kind="exposure",
        comparison=GREATER_THAN,
        fire_at=0.30,
        warning_at=0.45,
        severe_at=0.65,
        min_units=3,
        units="fraction of luma samples at or below the black point (16)",
    ),
    Rule(
        key="exposure.highlight_clipping",
        kind="exposure",
        comparison=GREATER_THAN,
        fire_at=0.30,
        warning_at=0.45,
        severe_at=0.65,
        min_units=3,
        units="fraction of luma samples at or above the white point (239)",
    ),
    Rule(
        key="black_or_frozen_frame.mean_luma",
        kind="black_or_frozen_frame",
        comparison=LESS_THAN,
        fire_at=8.0,
        warning_at=5.0,
        severe_at=2.0,
        min_units=2,
        units="mean 8-bit luma of the frame",
    ),
    Rule(
        key="black_or_frozen_frame.frame_delta",
        kind="black_or_frozen_frame",
        comparison=LESS_THAN,
        fire_at=0.15,
        warning_at=0.06,
        severe_at=0.02,
        min_units=3,
        units="mean absolute 8-bit luma difference against the previous frame",
    ),
    Rule(
        key="occlusion.centre_flat_cells",
        kind="occlusion",
        comparison=GREATER_THAN,
        fire_at=0.6,
        warning_at=0.8,
        severe_at=0.95,
        min_units=3,
        units="fraction of the 16 centre grid cells with no detail",
    ),
    Rule(
        key="poor_crop.bar_fraction",
        kind="poor_crop",
        comparison=GREATER_THAN,
        fire_at=0.1,
        warning_at=0.25,
        severe_at=0.4,
        min_units=3,
        units="fraction of the frame occupied by flat dark bars on opposing edges",
    ),
    Rule(
        key="low_resolution.high_frequency_energy",
        kind="low_resolution",
        comparison=LESS_THAN,
        fire_at=0.002,
        warning_at=0.001,
        severe_at=0.0005,
        min_units=3,
        units="share of spectral energy above half-Nyquist, native resolution",
    ),
    Rule(
        key="duplicate_frames.dhash_match",
        kind="duplicate_frames",
        comparison=GREATER_THAN,
        fire_at=0.5,
        warning_at=0.5,
        severe_at=0.5,
        min_units=2,
        units="1.0 when the difference hash equals the previous frame's",
    ),
    Rule(
        key="audio_clipping.clipped_sample_fraction",
        kind="audio_clipping",
        comparison=GREATER_THAN,
        fire_at=0.001,
        warning_at=0.010,
        severe_at=0.050,
        min_units=1,
        units="fraction of samples inside a run of >=3 full-scale samples",
    ),
    Rule(
        key="audio_noise.noise_floor_dbfs",
        kind="audio_noise",
        comparison=GREATER_THAN,
        fire_at=-30.0,
        warning_at=-24.0,
        severe_at=-18.0,
        min_units=1,
        units="dBFS level of the quietest fifth of the window",
    ),
    Rule(
        key="speech_intelligibility.speech_band_snr_db",
        kind="speech_intelligibility",
        comparison=LESS_THAN,
        fire_at=10.0,
        warning_at=6.0,
        severe_at=3.0,
        min_units=1,
        units="dB, speech-band energy of the loud frames over the quiet frames",
    ),
    Rule(
        key="silence.frame_level_dbfs",
        kind="silence",
        comparison=LESS_THAN,
        fire_at=-50.0,
        warning_at=-60.0,
        severe_at=-80.0,
        # ~1.0 s at the 16 ms frame hop. This is the number that separates a gap
        # between two words from a dead track, and it is declared here rather
        # than applied at the call site so that the value recorded in
        # `EngineRecord.parameters` is the value the detector actually used.
        min_units=AUDIO_WINDOW_FRAMES,
        units="dBFS frame RMS, sustained for min_units frames",
    ),
)

RULES_BY_KEY: dict[str, Rule] = {rule.key: rule for rule in RULES}

#: The twelve REQ-014 enum members. Asserted against the rule table at import
#: time below, so adding an enum member without a detector fails loudly rather
#: than silently shipping eleven-twelfths of the requirement.
QUALITY_FLAG_KINDS: tuple[str, ...] = (
    "blur",
    "shake",
    "exposure",
    "black_or_frozen_frame",
    "occlusion",
    "poor_crop",
    "low_resolution",
    "duplicate_frames",
    "audio_clipping",
    "audio_noise",
    "speech_intelligibility",
    "silence",
)

_covered = {rule.kind for rule in RULES}
if _covered != set(QUALITY_FLAG_KINDS):  # pragma: no cover - import-time guard
    raise RuntimeError(
        "quality-flag-kind coverage broken: "
        f"missing={sorted(set(QUALITY_FLAG_KINDS) - _covered)} "
        f"unknown={sorted(_covered - set(QUALITY_FLAG_KINDS))}"
    )

# --------------------------------------------------------------------------
# Qualifiers — secondary conditions that keep a rule honest.
#
# Two rules would be wrong without a second condition, and in both cases the
# second condition answers "is this metric even meaningful here?" rather than
# "how bad is it?". They are recorded as parameters (and in model_config) but
# are not the reported threshold, because the reported score is the primary
# quantity a reader would want to compare against other assets.
# --------------------------------------------------------------------------

#: A flat centre region is only *occlusion* if the rest of the frame still has
#: detail. Without this, a black frame or a fade would be reported as occluded.
OCCLUSION_PERIPHERY_DETAIL_MIN = 5.0
#: A raised noise floor is only *noise* if the floor is spectrally flat. Without
#: this, sustained music or room tone — loud but structured — reads as noise.
AUDIO_NOISE_FLATNESS_MIN = 0.20

#: Per-cell Laplacian variance below this counts as "no detail" (occlusion grid).
OCCLUSION_CELL_FLAT_MAX = 5.0
#: Luma at or below / at or above these counts as clipped (exposure).
BLACK_POINT = 16
WHITE_POINT = 239
#: |sample| at or above this is full scale (audio clipping); a run of this many
#: consecutive full-scale samples is clipping rather than a single loud peak.
CLIP_LEVEL = 0.98
CLIP_RUN = 3
#: A row/column is a "bar" if its luma spread is below this and it is dark.
BAR_SPREAD_MAX = 8
BAR_LEVEL_MAX = 24
#: A window whose loudest frames sit below this carries nothing to be
#: intelligible. Without it, a silent track reports a speech-band SNR of 0 dB and
#: is flagged unintelligible — a measurement of absence dressed up as a defect.
SPEECH_PRESENCE_MIN_DBFS = -50.0
#: Speech band, in Hz (ITU-T G.712 telephony band).
SPEECH_BAND_HZ = (300.0, 3400.0)


def model_config() -> dict[str, Any]:
    """Every parameter that changes an output, for the REQ-005 cache key.

    A threshold re-tune must invalidate cached artefacts: the same media with a
    different fire point is a different answer, and serving the old one would
    make the re-tune invisible until someone deleted a cache by hand.
    """
    config: dict[str, Any] = {
        "engine": ENGINE_NAME,
        "engineVersion": ENGINE_VERSION,
        "workWidth": WORK_WIDTH,
        "dhashGrid": DHASH_GRID,
        "audioSampleRate": AUDIO_SAMPLE_RATE,
        "audioFrame": AUDIO_FRAME,
        "audioHop": AUDIO_HOP,
        "audioWindowFrames": AUDIO_WINDOW_FRAMES,
        "audioWindowHopFrames": AUDIO_WINDOW_HOP_FRAMES,
        "blackPoint": BLACK_POINT,
        "whitePoint": WHITE_POINT,
        "clipLevel": CLIP_LEVEL,
        "clipRun": CLIP_RUN,
        "barSpreadMax": BAR_SPREAD_MAX,
        "barLevelMax": BAR_LEVEL_MAX,
        "occlusionCellFlatMax": OCCLUSION_CELL_FLAT_MAX,
        "occlusionPeripheryDetailMin": OCCLUSION_PERIPHERY_DETAIL_MIN,
        "audioNoiseFlatnessMin": AUDIO_NOISE_FLATNESS_MIN,
        "speechPresenceMinDbfs": SPEECH_PRESENCE_MIN_DBFS,
        "speechBandHz": list(SPEECH_BAND_HZ),
    }
    for rule in RULES:
        config[rule.key] = {
            "comparison": rule.comparison,
            "fireAt": rule.fire_at,
            "warningAt": rule.warning_at,
            "severeAt": rule.severe_at,
            "minUnits": rule.min_units,
        }
    return config


def engine_record() -> dict[str, Any]:
    """EngineRecord with every threshold as a stringified key/value pair (REQ-012).

    The schema's `parameters` is an array of pairs, not an object, so the value
    is stringified; the key namespace is the rule key plus the field, which keeps
    a reader's eye on which number belongs to which detector.
    """
    parameters: list[dict[str, str]] = [
        {"key": "workWidth", "value": str(WORK_WIDTH)},
        {"key": "dhashGrid", "value": str(DHASH_GRID)},
        {"key": "audioSampleRate", "value": str(AUDIO_SAMPLE_RATE)},
        {"key": "audioFrame", "value": str(AUDIO_FRAME)},
        {"key": "audioHop", "value": str(AUDIO_HOP)},
        {"key": "audioWindowFrames", "value": str(AUDIO_WINDOW_FRAMES)},
        {"key": "audioWindowHopFrames", "value": str(AUDIO_WINDOW_HOP_FRAMES)},
        {"key": "blackPoint", "value": str(BLACK_POINT)},
        {"key": "whitePoint", "value": str(WHITE_POINT)},
        {"key": "clipLevel", "value": str(CLIP_LEVEL)},
        {"key": "clipRun", "value": str(CLIP_RUN)},
        {"key": "barSpreadMax", "value": str(BAR_SPREAD_MAX)},
        {"key": "barLevelMax", "value": str(BAR_LEVEL_MAX)},
        {"key": "occlusionCellFlatMax", "value": str(OCCLUSION_CELL_FLAT_MAX)},
        {"key": "occlusionPeripheryDetailMin", "value": str(OCCLUSION_PERIPHERY_DETAIL_MIN)},
        {"key": "audioNoiseFlatnessMin", "value": str(AUDIO_NOISE_FLATNESS_MIN)},
        {"key": "speechPresenceMinDbfs", "value": str(SPEECH_PRESENCE_MIN_DBFS)},
        {"key": "speechBandHz", "value": f"{SPEECH_BAND_HZ[0]}-{SPEECH_BAND_HZ[1]}"},
    ]
    for rule in RULES:
        parameters.append({"key": f"{rule.key}.comparison", "value": rule.comparison})
        parameters.append({"key": f"{rule.key}.fireAt", "value": str(rule.fire_at)})
        parameters.append({"key": f"{rule.key}.warningAt", "value": str(rule.warning_at)})
        parameters.append({"key": f"{rule.key}.severeAt", "value": str(rule.severe_at)})
        parameters.append({"key": f"{rule.key}.minUnits", "value": str(rule.min_units)})
    return {
        "name": ENGINE_NAME,
        "version": ENGINE_VERSION,
        # Sorted so the record is byte-identical run to run regardless of the
        # order the rule table happens to be written in.
        "parameters": sorted(parameters, key=lambda pair: pair["key"]),
    }


# --------------------------------------------------------------------------
# Media access — FFmpeg via argv arrays only. No shell, ever: a Windows path
# with a space in it is the least exotic thing that breaks a shell string, and
# a media path is attacker-adjacent input.
# --------------------------------------------------------------------------


def _run(argv: Sequence[str]) -> bytes:
    try:
        completed = subprocess.run(argv, capture_output=True, check=False)
    except FileNotFoundError as error:
        raise SubStageError(
            "FFMPEG_MISSING",
            f"{argv[0]} is not on PATH; the quality sub-stage cannot decode media",
            details={"tool": argv[0]},
        ) from error
    if completed.returncode != 0:
        raise SubStageError(
            "MEDIA_DECODE_FAILED",
            f"{argv[0]} exited {completed.returncode}",
            details={
                "tool": argv[0],
                "exitCode": completed.returncode,
                "stderr": completed.stderr.decode("utf-8", "replace")[-2000:],
            },
        )
    return completed.stdout


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    #: Nominal frame rate as an exact rational — the video tick timebase is its
    #: reciprocal, so one tick is one frame.
    frame_rate: Fraction

    @property
    def timebase(self) -> dict[str, int]:
        return {"num": self.frame_rate.denominator, "den": self.frame_rate.numerator}


def probe(path: Path) -> tuple[VideoInfo | None, bool]:
    """Return (video stream info or None, whether an audio stream exists).

    An absent stream is a fact about the asset, not an error: `broll-silent.mp4`
    has no audio track at all, and reporting `silence` for it would be a lie —
    silence is a property of audio that exists.
    """
    raw = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=index,codec_type,width,height,r_frame_rate",
            "-of",
            "json",
            str(path),
        ]
    )
    try:
        streams = json.loads(raw.decode("utf-8", "replace")).get("streams", [])
    except json.JSONDecodeError as error:
        raise SubStageError(
            "MEDIA_PROBE_FAILED", f"ffprobe returned unparseable JSON for {path.name}"
        ) from error

    video: VideoInfo | None = None
    has_audio = False
    for stream in streams:
        if stream.get("codec_type") == "video" and video is None:
            rate = stream.get("r_frame_rate") or "0/0"
            numerator, _, denominator = rate.partition("/")
            try:
                frame_rate = Fraction(int(numerator), int(denominator or 1))
            except (ValueError, ZeroDivisionError):
                frame_rate = Fraction(0)
            if frame_rate <= 0 or not stream.get("width"):
                continue
            video = VideoInfo(int(stream["width"]), int(stream["height"]), frame_rate)
        elif stream.get("codec_type") == "audio":
            has_audio = True
    return video, has_audio


def iter_luma_frames(path: Path, info: VideoInfo) -> Iterator[np.ndarray]:
    """Stream the luma plane frame by frame.

    Decoding to `gray` rather than to a colour space keeps memory constant and
    costs nothing: every video metric here is a luma metric. The frames are read
    off a pipe rather than buffered because a long source would otherwise be
    gigabytes of uint8 held for no reason.
    """
    argv = [
        "ffmpeg",
        "-v",
        "error",
        "-nostdin",
        "-i",
        str(path),
        "-map",
        "0:v:0",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-",
    ]
    frame_bytes = info.width * info.height
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout is not None
    try:
        while True:
            buffer = process.stdout.read(frame_bytes)
            if len(buffer) < frame_bytes:
                break
            yield np.frombuffer(buffer, dtype=np.uint8).reshape(info.height, info.width)
    finally:
        # A consumer that stops early (a test reading two frames) must not leave
        # an ffmpeg holding the pipe open.
        if process.poll() is None:
            process.kill()
        process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()
        process.wait()


def read_audio(path: Path) -> np.ndarray:
    """Decode the first audio stream to mono float32 at `AUDIO_SAMPLE_RATE`.

    `f32le` output is unclamped, so a clipped source still reads as samples at
    full scale — which is precisely what `audio_clipping` measures. Decoding to
    16-bit first would make the detector measure its own decoder.
    """
    raw = _run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-i",
            str(path),
            "-map",
            "0:a:0",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-ac",
            "1",
            "-ar",
            str(AUDIO_SAMPLE_RATE),
            "-",
        ]
    )
    return np.frombuffer(raw, dtype="<f4").astype(np.float64)


# --------------------------------------------------------------------------
# Video metrics
# --------------------------------------------------------------------------


#: dHash grid. The textbook 8x8 (64-bit) hash was measured against this project's
#: own control clip and FAILED: consecutive `testsrc2` frames, which are visibly
#: moving, hash identically at 64 bits because the moving elements are small
#: relative to a 1/8-frame cell — the control fired `duplicate_frames` on every
#: frame. 32x32 (1024 bits) separates them cleanly while still absorbing the
#: requantisation noise that makes byte equality useless.
DHASH_GRID = 32


def _dhash(small: np.ndarray) -> bytes:
    """Difference hash: resize to (GRID+1)xGRID, compare each pixel to its right neighbour.

    Chosen over exact frame equality because a re-encoded still is not always
    bit-identical — H.264 requantises across a GOP boundary — so byte comparison
    would under-report the very footage that is visibly frozen. dHash tolerates
    that requantisation while still separating two genuinely different frames.
    """
    resized = cv2.resize(
        small, (DHASH_GRID + 1, DHASH_GRID), interpolation=cv2.INTER_AREA
    ).astype(np.int16)
    return np.packbits((resized[:, 1:] > resized[:, :-1]).reshape(-1)).tobytes()


def _high_frequency_energy(frame: np.ndarray) -> float:
    """Share of spectral energy above half-Nyquist, on the NATIVE frame.

    An upscaled low-resolution source has had its high spatial frequencies
    removed by the downscale and cannot get them back, so the top half of its
    spectrum is nearly empty however large the declared frame is. This is the
    "effective resolution vs declared" question asked directly in the frequency
    domain, which avoids having to guess a scale factor.
    """
    centred = frame.astype(np.float64) - float(frame.mean())
    spectrum = np.abs(np.fft.rfft2(centred)) ** 2
    height, width = centred.shape
    fy = np.fft.fftfreq(height)[:, None]
    fx = np.fft.rfftfreq(width)[None, :]
    radius = np.sqrt((fy / 0.5) ** 2 + (fx / 0.5) ** 2)
    total = float(spectrum.sum())
    if total <= 0.0:
        return 0.0
    return float(spectrum[radius > 0.5].sum() / total)


def _bars(frame: np.ndarray) -> tuple[float, np.ndarray]:
    """(bar fraction, the frame's interior with any bars removed).

    The documented simpler proxy the task allows for `poor_crop`: content that
    does not fill its frame has been fitted to the wrong aspect, which is a
    framing defect an editor must fix before the asset is usable at that size.
    Bars are required on *opposing* edges — a single dark edge is ordinary
    composition (a shadowed foreground), whereas a matched pair is a letterbox.

    The interior is returned because the exposure detectors must not see the
    bars. Measured on this project's own fixtures, a letterboxed clip reads 50%
    of its luma samples at the black point purely from its bars — reported as
    `exposure`, that would be a plain false positive: black bars are not a
    crushed shadow, they are an absence of picture.
    """
    height, width = frame.shape

    def flat_run(lines: np.ndarray) -> int:
        spread = lines.max(axis=1) - lines.min(axis=1)
        level = lines.mean(axis=1)
        flat = (spread <= BAR_SPREAD_MAX) & (level <= BAR_LEVEL_MAX)
        run = 0
        for is_flat in flat:
            if not is_flat:
                break
            run += 1
        return run

    top = flat_run(frame)
    bottom = flat_run(frame[::-1])
    left = flat_run(frame.T)
    right = flat_run(frame.T[::-1])

    # A frame that is bars all the way through has no picture to be badly
    # cropped — it is a black frame, which `black_or_frozen_frame` owns. Without
    # this guard a fade-to-black reports as a severe crop defect.
    if top + bottom >= height or left + right >= width:
        return 0.0, frame

    # min() enforces "opposing": one bar alone contributes nothing.
    letterbox = 2 * min(top, bottom) / height
    pillarbox = 2 * min(left, right) / width
    interior = frame[top : height - bottom, left : width - right]
    return float(max(letterbox, pillarbox)), interior if interior.size else frame


def _occlusion_metrics(small: np.ndarray) -> tuple[float, float]:
    """(fraction of flat centre cells, median detail at the periphery).

    An 8x8 grid of Laplacian variances. Occlusion — a hand, a lens cap, a sticker
    — reads as a contiguous detail-free region over the middle of the frame while
    the edges still carry detail. The periphery term is the qualifier that stops a
    fade-to-black or a blank slate being reported as an occlusion; it is not part
    of the reported score because "how occluded" is the centre measurement.
    """
    height, width = small.shape
    rows = np.linspace(0, height, 9).astype(int)
    cols = np.linspace(0, width, 9).astype(int)
    detail = np.empty((8, 8), dtype=np.float64)
    for r in range(8):
        for c in range(8):
            cell = small[rows[r] : rows[r + 1], cols[c] : cols[c + 1]]
            detail[r, c] = float(cv2.Laplacian(cell, cv2.CV_64F).var()) if cell.size else 0.0
    centre = detail[2:6, 2:6]
    mask = np.ones((8, 8), dtype=bool)
    mask[2:6, 2:6] = False
    periphery = detail[mask]
    flat_centre = float((centre < OCCLUSION_CELL_FLAT_MAX).mean())
    return flat_centre, float(np.median(periphery))


@dataclass
class VideoMetrics:
    """Per-frame series. Index i is frame i; every array has the same length."""

    laplacian_variance: list[float]
    translation_jerk: list[float]
    shadow_clipping: list[float]
    highlight_clipping: list[float]
    mean_luma: list[float]
    frame_delta: list[float]
    centre_flat_cells: list[float]
    periphery_detail: list[float]
    bar_fraction: list[float]
    high_frequency_energy: list[float]
    dhash_match: list[float]


def measure_video(path: Path, info: VideoInfo) -> VideoMetrics:
    """Reduce every frame to the twelve numbers the video rules compare."""
    metrics = VideoMetrics([], [], [], [], [], [], [], [], [], [], [])
    work_height = max(1, round(WORK_WIDTH * info.height / info.width))
    previous_small: np.ndarray | None = None
    previous_hash: int | None = None
    previous_shift: tuple[float, float] | None = None

    for frame in iter_luma_frames(path, info):
        small = cv2.resize(frame, (WORK_WIDTH, work_height), interpolation=cv2.INTER_AREA)
        small_f = small.astype(np.float64)

        bar_fraction, interior = _bars(frame)
        metrics.laplacian_variance.append(float(cv2.Laplacian(small, cv2.CV_64F).var()))
        metrics.mean_luma.append(float(frame.mean()))
        # Exposure is measured on the picture, not on the letterbox — see `_bars`.
        metrics.shadow_clipping.append(float((interior <= BLACK_POINT).mean()))
        metrics.highlight_clipping.append(float((interior >= WHITE_POINT).mean()))
        metrics.high_frequency_energy.append(_high_frequency_energy(frame))
        metrics.bar_fraction.append(bar_fraction)

        flat_centre, periphery = _occlusion_metrics(small)
        metrics.centre_flat_cells.append(flat_centre)
        metrics.periphery_detail.append(periphery)

        current_hash = _dhash(small)
        if previous_small is None:
            # The first frame has no predecessor, so every differential metric
            # is reported at its most benign value rather than at zero — zero
            # would read as "frozen" and put a false flag on frame 0 of
            # every asset.
            metrics.frame_delta.append(255.0)
            metrics.translation_jerk.append(0.0)
            metrics.dhash_match.append(0.0)
        else:
            metrics.frame_delta.append(
                float(np.abs(small_f - previous_small.astype(np.float64)).mean())
            )
            (shift_x, shift_y), _ = cv2.phaseCorrelate(previous_small.astype(np.float64), small_f)
            if previous_shift is None:
                # Jerk needs two shifts; the first shift alone cannot be one.
                metrics.translation_jerk.append(0.0)
            else:
                metrics.translation_jerk.append(
                    float(np.hypot(shift_x - previous_shift[0], shift_y - previous_shift[1]))
                )
            previous_shift = (shift_x, shift_y)
            metrics.dhash_match.append(1.0 if current_hash == previous_hash else 0.0)

        previous_small = small
        previous_hash = current_hash

    return metrics


# --------------------------------------------------------------------------
# Audio metrics
# --------------------------------------------------------------------------


def _dbfs(power: float) -> float:
    """Level in dBFS, floored so digital silence is a number and not -inf.

    -120 dBFS is far below any threshold here and below 16-bit resolution, so the
    floor cannot change a verdict; it exists so the value stays JSON-serialisable
    (`Infinity` is not valid JSON) and comparable.
    """
    if power <= 0.0:
        return -120.0
    return max(-120.0, float(10.0 * np.log10(power)))


@dataclass
class AudioMetrics:
    """Frame-level series plus the sample count, at `AUDIO_SAMPLE_RATE`."""

    sample_count: int
    frame_dbfs: list[float]
    clipped_fraction: list[float]
    flatness: list[float]
    speech_band_power: list[float]


def measure_audio(samples: np.ndarray) -> AudioMetrics:
    """Reduce the waveform to per-frame level, clipping, flatness and speech-band energy."""
    if samples.size < AUDIO_FRAME:
        return AudioMetrics(int(samples.size), [], [], [], [])

    # Clipping is a *sample-run* property, so it is computed on the waveform and
    # only then aggregated per frame. A single sample at full scale is a peak;
    # three in a row is a flat top, which is the audible artefact.
    at_full_scale = np.abs(samples) >= CLIP_LEVEL
    in_run = np.zeros(samples.size, dtype=bool)
    if at_full_scale.any():
        run_start = 0
        for index in range(1, samples.size + 1):
            if index == samples.size or not at_full_scale[index] or not at_full_scale[index - 1]:
                if at_full_scale[run_start] and index - run_start >= CLIP_RUN:
                    in_run[run_start:index] = True
                run_start = index

    window = np.hanning(AUDIO_FRAME)
    frequencies = np.fft.rfftfreq(AUDIO_FRAME, d=1.0 / AUDIO_SAMPLE_RATE)
    speech_bins = (frequencies >= SPEECH_BAND_HZ[0]) & (frequencies <= SPEECH_BAND_HZ[1])

    metrics = AudioMetrics(int(samples.size), [], [], [], [])
    for start in range(0, samples.size - AUDIO_FRAME + 1, AUDIO_HOP):
        frame = samples[start : start + AUDIO_FRAME]
        metrics.frame_dbfs.append(_dbfs(float(np.mean(frame**2))))
        metrics.clipped_fraction.append(float(in_run[start : start + AUDIO_FRAME].mean()))
        spectrum = np.abs(np.fft.rfft(frame * window)) ** 2
        # Spectral flatness (Wiener entropy): geometric mean over arithmetic
        # mean of the power spectrum. ~1 for white noise, ~0 for a tone or for
        # voiced speech, which is exactly the discrimination the noise rule needs.
        guarded = spectrum + 1e-20
        metrics.flatness.append(
            float(np.exp(np.mean(np.log(guarded))) / np.mean(guarded))
        )
        metrics.speech_band_power.append(float(spectrum[speech_bins].sum()))
    return metrics


# --------------------------------------------------------------------------
# Span building — the part that makes a flag time-ranged rather than global.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Span:
    start_ticks: int
    end_ticks: int
    score: float


def build_spans(
    rule: Rule,
    scores: Sequence[float],
    tick_of: Sequence[tuple[int, int]],
    *,
    qualifier: Sequence[bool] | None = None,
) -> list[Span]:
    """Group consecutive firing units into maximal runs, then drop the short ones.

    `tick_of[i]` is the (start, end) tick range of measuring unit `i`. Passing it
    in rather than deriving it keeps this function identical for video frames
    (one tick each) and audio windows (thousands of ticks each, overlapping).

    A span's reported score is its *worst* unit, not its mean: the question a
    reader asks of a blur flag is how blurry it got, and averaging over a run
    would dilute exactly the moment worth looking at.
    """
    spans: list[Span] = []
    open_start: int | None = None
    open_end = 0
    open_score = 0.0
    open_units = 0

    for index, score in enumerate(scores):
        firing = rule.fires(score) and (qualifier is None or qualifier[index])
        if firing:
            start, end = tick_of[index]
            if open_start is None:
                open_start, open_end, open_score, open_units = start, end, score, 1
            else:
                open_end = max(open_end, end)
                open_score = rule.worst(open_score, score)
                open_units += 1
        elif open_start is not None:
            if open_units >= rule.min_units:
                spans.append(Span(open_start, open_end, open_score))
            open_start = None

    if open_start is not None and open_units >= rule.min_units:
        spans.append(Span(open_start, open_end, open_score))
    return spans


def _frame_ticks(count: int) -> list[tuple[int, int]]:
    """One video frame is one tick in the r_frame_rate-reciprocal timebase."""
    return [(index, index + 1) for index in range(count)]


def _audio_window_ticks(frame_count: int) -> list[tuple[int, int]]:
    """Audio ticks ARE sample indices, because the timebase is 1/sampleRate."""
    ticks: list[tuple[int, int]] = []
    last = max(1, frame_count - AUDIO_WINDOW_FRAMES + 1)
    for start_frame in range(0, last, AUDIO_WINDOW_HOP_FRAMES):
        end_frame = min(frame_count, start_frame + AUDIO_WINDOW_FRAMES)
        ticks.append((start_frame * AUDIO_HOP, end_frame * AUDIO_HOP + AUDIO_FRAME))
    return ticks


def _windows(frame_count: int) -> list[tuple[int, int]]:
    """Frame index ranges matching `_audio_window_ticks`, for statistics."""
    spans: list[tuple[int, int]] = []
    last = max(1, frame_count - AUDIO_WINDOW_FRAMES + 1)
    for start_frame in range(0, last, AUDIO_WINDOW_HOP_FRAMES):
        spans.append((start_frame, min(frame_count, start_frame + AUDIO_WINDOW_FRAMES)))
    return spans


# --------------------------------------------------------------------------
# Detection
# --------------------------------------------------------------------------


def detect_video_spans(metrics: VideoMetrics) -> list[tuple[Rule, Span]]:
    """Apply every video rule to the per-frame series."""
    count = len(metrics.mean_luma)
    ticks = _frame_ticks(count)
    if count == 0:
        return []

    series: list[tuple[str, Sequence[float], Sequence[bool] | None]] = [
        ("blur.laplacian_variance", metrics.laplacian_variance, None),
        ("shake.translation_jerk", metrics.translation_jerk, None),
        ("exposure.shadow_clipping", metrics.shadow_clipping, None),
        ("exposure.highlight_clipping", metrics.highlight_clipping, None),
        ("black_or_frozen_frame.mean_luma", metrics.mean_luma, None),
        ("black_or_frozen_frame.frame_delta", metrics.frame_delta, None),
        (
            "occlusion.centre_flat_cells",
            metrics.centre_flat_cells,
            [value > OCCLUSION_PERIPHERY_DETAIL_MIN for value in metrics.periphery_detail],
        ),
        ("poor_crop.bar_fraction", metrics.bar_fraction, None),
        ("low_resolution.high_frequency_energy", metrics.high_frequency_energy, None),
        ("duplicate_frames.dhash_match", metrics.dhash_match, None),
    ]

    found: list[tuple[Rule, Span]] = []
    for key, values, qualifier in series:
        rule = RULES_BY_KEY[key]
        for span in build_spans(rule, values, ticks, qualifier=qualifier):
            found.append((rule, span))
    return found


def detect_audio_spans(metrics: AudioMetrics) -> list[tuple[Rule, Span]]:
    """Apply the four audio rules.

    `silence` is measured per frame (a gap has sharp edges and should be reported
    tightly); the other three are estimated per one-second window, because a
    noise floor, a speech-band SNR and a clipping rate are all statistics that a
    32 ms frame cannot carry.
    """
    frame_count = len(metrics.frame_dbfs)
    if frame_count == 0:
        return []

    found: list[tuple[Rule, Span]] = []

    silence_rule = RULES_BY_KEY["silence.frame_level_dbfs"]
    frame_ticks = [
        (index * AUDIO_HOP, index * AUDIO_HOP + AUDIO_FRAME) for index in range(frame_count)
    ]
    for span in build_spans(silence_rule, metrics.frame_dbfs, frame_ticks):
        found.append((silence_rule, span))

    windows = _windows(frame_count)
    window_ticks = _audio_window_ticks(frame_count)
    if not windows:
        return found

    clipping: list[float] = []
    noise_floor: list[float] = []
    noise_flat: list[bool] = []
    speech_snr: list[float] = []
    speech_present: list[bool] = []

    for start, end in windows:
        clipped = np.asarray(metrics.clipped_fraction[start:end])
        clipping.append(float(clipped.mean()) if clipped.size else 0.0)

        levels = np.asarray(metrics.frame_dbfs[start:end])
        order = np.argsort(levels)
        quiet = order[: max(1, order.size // 5)]
        loud = order[-max(1, order.size // 5) :]
        # The noise floor is the level of the window's quietest fifth: content
        # comes and goes, the floor does not, so the low percentile is the floor
        # rather than the mean (which content would drag upward).
        noise_floor.append(float(levels[quiet].mean()))
        flatness = np.asarray(metrics.flatness[start:end])
        noise_flat.append(float(flatness[quiet].mean()) > AUDIO_NOISE_FLATNESS_MIN)

        band = np.asarray(metrics.speech_band_power[start:end])
        signal = float(band[loud].mean())
        floor = float(band[quiet].mean())
        # Speech-band SNR as the energy-percentile estimate: how far the speech
        # band rises above its own floor. Speech buried in broadband noise cannot
        # rise far, because the noise is already in the band.
        speech_snr.append(10.0 * np.log10(signal / floor) if floor > 0.0 and signal > 0.0 else 0.0)
        speech_present.append(float(levels[loud].mean()) > SPEECH_PRESENCE_MIN_DBFS)

    for key, values, qualifier in (
        ("audio_clipping.clipped_sample_fraction", clipping, None),
        ("audio_noise.noise_floor_dbfs", noise_floor, noise_flat),
        ("speech_intelligibility.speech_band_snr_db", speech_snr, speech_present),
    ):
        rule = RULES_BY_KEY[key]
        for span in build_spans(rule, values, window_ticks, qualifier=qualifier):
            found.append((rule, span))
    return found


def analyse(path: Path) -> list[dict[str, Any]]:
    """Measure one media file and return its QualityFlags, ordered and identified.

    Ordering is by real elapsed time and then by kind. Real time — not raw
    `startTicks` — because video ticks and audio ticks live in different
    timebases, so comparing the integers directly would interleave a 30 fps frame
    index with a 16 kHz sample index and produce an order that means nothing.
    The comparison uses `Fraction`, so it stays exact: a float here would make
    the ID assignment depend on rounding, and IDs must be reproducible.
    """
    if not path.exists():
        raise SubStageError(
            "INPUT_NOT_FOUND", f"media file does not exist: {path.name}", exit_code=2
        )

    video, has_audio = probe(path)
    engine = engine_record()
    found: list[tuple[Fraction, str, Rule, Span, dict[str, int]]] = []

    if video is not None:
        timebase = video.timebase
        for rule, span in detect_video_spans(measure_video(path, video)):
            seconds = Fraction(span.start_ticks * timebase["num"], timebase["den"])
            found.append((seconds, rule.kind, rule, span, timebase))

    if has_audio:
        samples = read_audio(path)
        timebase = {"num": 1, "den": AUDIO_SAMPLE_RATE}
        for rule, span in detect_audio_spans(measure_audio(samples)):
            seconds = Fraction(span.start_ticks, AUDIO_SAMPLE_RATE)
            found.append((seconds, rule.kind, rule, span, timebase))

    # Sort key includes the rule key so two rules of the same kind starting on
    # the same tick still have one defined order.
    found.sort(key=lambda item: (item[0], item[1], item[2].key, item[3].end_ticks))

    flags: list[dict[str, Any]] = []
    for ordinal, (_, kind, rule, span, timebase) in enumerate(found, start=1):
        flags.append(
            {
                "flagId": f"quality-{ordinal:04d}",
                "kind": kind,
                "startTicks": span.start_ticks,
                "endTicks": span.end_ticks,
                "timebase": timebase,
                "severity": rule.severity(span.score),
                # Rounded so a float that differs in its last bit between runs
                # cannot change the artefact's bytes. Six places is far finer
                # than any threshold here.
                "score": round(span.score, 6),
                "threshold": rule.to_threshold(),
                "engine": engine,
            }
        )
    return flags


def run(ctx: SubStageContext, media_path: Path, *, force: bool = False) -> SubStageResult:
    """Run the quality-flags sub-stage through the shared harness.

    The result is advisory by construction: the artefact is a list of
    observations with severities and nothing else. No `usable` boolean is
    computed here and none should be computed downstream from these flags alone —
    a severe blur flag over a two-frame span may be an intentional transition.
    """
    return run_sub_stage(
        ctx,
        SUB_STAGE,
        lambda: {"qualityFlags": analyse(media_path)},
        model_config=model_config(),
        force=force,
    )
