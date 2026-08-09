"""Audio-events sub-stage of the `index` skill (Phase 2 task 6, PRD REQ-015, D-20).

Three tracks, one artefact. Each `AudioEvent.kind` has exactly ONE producing
detector, so a reader can always answer "what saw this?" from `engine` alone:

    speech                                    <- silero-vad (D-20)
    silence                                   <- RMS dBFS floor
    music/applause/laughter/
      crowd_reaction/impact                   <- PANNs CNN14 (D-20)
    energy_change                             <- RMS delta, CORROBORATED by PANNs

## REQ-015: volume alone is never emotional importance

This is the requirement with teeth, and it constrains this module twice over.
`source-index-v1.json` states it directly: *"an `energy_change` event whose
engine is the RMS track alone is a Phase 2 test failure — the classifier
(decisions.md D-20, PANNs CNN14) must corroborate it."* So:

1. **A loud span is never relabelled.** A spike in RMS may become an
   `energy_change` and nothing else. It is never promoted to `applause`,
   `laughter` or `crowd_reaction` on loudness — those kinds come only from the
   classifier, which is looking at spectral content, not at level. Getting this
   wrong is how a slammed door becomes "the audience loved it".
2. **A loud span is not even an event on its own.** The RMS delta only
   *proposes*; an `energy_change` is emitted only where PANNs independently
   reports some audible class above the confidence floor over the same span.
   Its confidence is the weaker of the two tracks, and its `EngineRecord` names
   both — never the RMS track alone.

The two rules are different. (1) stops loudness borrowing another kind's
meaning; (2) stops loudness meaning anything by itself. Dropping either one
re-admits "loud therefore important" by a side door.

## The panns_inference import blocker (fixed here, deliberately, twice)

`panns_inference/config.py` reads `~/panns_data/class_labels_indices.csv` **at
import time** and, when it is absent, shells out to `wget` — a binary that does
not exist on Windows. `os.system` reports no error, so the failure surfaces as a
bare `FileNotFoundError` on a path the caller never asked for. The same pattern
repeats in `inference.py` for the ~320 MB CNN14 checkpoint.

Both halves are handled, in the order the task requires:

(a) The AudioSet label file (527 classes, CC-BY 4.0) is **vendored** at
    `workers/indexer-python/data/class_labels_indices.csv` and copied into the
    path the package insists on *before* the import is attempted. This is what
    makes the build offline-reproducible — no network, no wget, no surprise.
(b) `panns_inference` is imported **lazily**, inside the classifier call and
    never at module top level. If the label file or the checkpoint cannot be
    made available, this raises `ModelUnavailableError` naming the model, so the
    failure is honest, the run stays resumable, and every other sub-stage keeps
    going. (a) makes it work; (b) makes it fail truthfully if it ever doesn't.

Nothing here substitutes a different classifier: D-20 settles PANNs CNN14, and
an engine swap would be a decisions.md change, not a code change.

## Timebase

Audio uses `{num: 1, den: 16000}`, so **ticks ARE sample counts** at 16 kHz.
Engines report float seconds (or their own sample rate); each is converted once,
at the engine boundary, with integer arithmetic. No float seconds are ever
emitted. PANNs runs at 32 kHz, which is exactly 2x the artefact rate, so its
window boundaries convert without rounding at all.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from importlib import metadata
from pathlib import Path
from typing import Any

import numpy as np

from harness import (
    ModelUnavailableError,
    SubStageContext,
    SubStageError,
    SubStageResult,
    run_sub_stage,
)

SUB_STAGE_NAME = "audio_events"

# --------------------------------------------------------------------------
# Timebase (contract §3): ticks are samples at this rate.
# --------------------------------------------------------------------------

AUDIO_SAMPLE_RATE = 16000
AUDIO_TIMEBASE: dict[str, int] = {"num": 1, "den": AUDIO_SAMPLE_RATE}

#: PANNs CNN14 is trained at 32 kHz and resampling it would change its output.
#: 32000 = 2 * 16000, so window boundaries map between the rates exactly.
PANNS_SAMPLE_RATE = 32000

# --------------------------------------------------------------------------
# Thresholds. Every one of these is recorded in an EngineRecord's `parameters`
# (REQ-012: "thresholds recorded with the index") and in `model_config`, which
# makes them part of the REQ-005 cache key — retuning any of them invalidates
# prior artefacts instead of silently serving output from the old threshold.
# --------------------------------------------------------------------------

#: silero's own documented default. It is well calibrated across datasets and we
#: have no labelled speech/non-speech set of our own to justify moving it.
VAD_SPEECH_PROBABILITY = 0.5
#: Below ~250 ms a "speech" span is more often a click or a breath than a word.
VAD_MIN_SPEECH_MS = 250
#: Gaps shorter than this are within-utterance pauses, not turn boundaries.
VAD_MIN_SILENCE_MS = 100

#: Editorial silence, not digital silence. Room tone and encoder noise floors sit
#: around -60 dBFS; dialogue sits above -30. -50 dBFS separates them with margin
#: while still calling a genuinely dead track silent.
SILENCE_DBFS_FLOOR = -50.0
#: An editor cannot use a pause shorter than this, so reporting one is noise.
SILENCE_MIN_MS = 300

#: A frame-to-frame jump this large is a level change a listener notices; below
#: it, level drift is ordinary programme dynamics. Deliberately coarse — this
#: track only PROPOSES, and the classifier has to agree before anything is
#: emitted, so a false proposal costs nothing.
RMS_DELTA_TRIGGER_DB = 12.0

#: PANNs is multi-label over 527 classes; probabilities are not softmaxed and
#: run low. 0.20 keeps recall usable while dropping the long tail of near-zero
#: co-activations. Anything below it is not reported at all.
PANNS_CONFIDENCE_FLOOR = 0.20

#: 32 ms at 16 kHz, and an exact divisor of the sample rate's tick grid, so
#: frame boundaries are integers with no accumulated rounding.
FRAME_TICKS = 512

#: 1 s windows, 0.5 s hop. PANNs is a clip-level tagger; this is what gives it
#: time resolution, and the overlap keeps a short event from straddling two
#: windows and being diluted in both.
PANNS_WINDOW_TICKS = AUDIO_SAMPLE_RATE
PANNS_HOP_TICKS = AUDIO_SAMPLE_RATE // 2

#: 20*log10(1e-5) = -100 exactly. Digital silence is 0.0, whose log is -inf;
#: clamping keeps dBFS finite so a delta against silence stays a real number.
_RMS_FLOOR = 1e-5
SILENCE_DBFS_CLAMP = -100.0

# --------------------------------------------------------------------------
# Engine identity
# --------------------------------------------------------------------------

#: Bumped when the RMS track's arithmetic changes. It is not a package version —
#: this track is ours — but it belongs in the cache key all the same.
RMS_ALGORITHM_VERSION = "1.0.0"

ENGINE_VAD = "silero-vad"
ENGINE_RMS = "rms-delta-energy"
ENGINE_PANNS = "panns-inference/Cnn14"
#: energy_change names BOTH tracks. The schema makes an RMS-only engine here a
#: test failure, so the composite name is the contract, not a nicety.
ENGINE_ENERGY_CHANGE = f"{ENGINE_RMS}+{ENGINE_PANNS}"

# --------------------------------------------------------------------------
# Vendored AudioSet labels
# --------------------------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
VENDORED_CLASS_LABELS = DATA_DIR / "class_labels_indices.csv"
#: The path `panns_inference.config` hardcodes. Not configurable upstream.
PANNS_HOME = Path.home() / "panns_data"
PANNS_LABELS_PATH = PANNS_HOME / "class_labels_indices.csv"
PANNS_CHECKPOINT_PATH = PANNS_HOME / "Cnn14_mAP=0.431.pth"
PANNS_CHECKPOINT_URL = "https://zenodo.org/records/3987831/files/Cnn14_mAP=0.431.pth?download=1"
#: Upstream refuses any checkpoint smaller than this, treating it as a partial
#: download. Mirrored so we reject a truncated file before torch does.
PANNS_CHECKPOINT_MIN_BYTES = int(3e8)
#: sha256 of the CNN14 checkpoint, pinned trust-on-first-use.
#:
#: HONEST PROVENANCE: this digest was computed from the copy fetched on the
#: Phase 0 development machine, NOT taken from a publisher-signed manifest —
#: upstream publishes no checksum. It therefore does NOT prove the original
#: download was authentic. What it does do is pin the artefact from here on: a
#: repointed Zenodo record, a tampered cache, or a silently-replaced file now
#: fails loudly instead of being unpickled by `torch.load` (which is arbitrary
#: code execution by design). Replace this with a publisher checksum if one is
#: ever published.
PANNS_CHECKPOINT_SHA256 = "0dc499e40e9761ef5ea061ffc77697697f277f6a960894903df3ada000e34b31"
#: A stalled connection must not hang the sub-stage forever.
PANNS_DOWNLOAD_TIMEOUT_SECONDS = 60

AUDIOSET_CLASS_COUNT = 527

# --------------------------------------------------------------------------
# The AudioSet -> AudioEventKind mapping table.
#
# EXPLICIT AND CLOSED. PANNs emits 527 AudioSet classes; the contract enum has
# 8 kinds. A class that is not a key here is DROPPED, never assigned to the
# nearest-looking category: "Sigh" is not laughter, "Vehicle" is not an impact,
# and guessing would put a kind on an event the classifier never claimed.
#
# `energy_change` is deliberately absent as a target and is asserted absent by a
# test — it is not something a classifier can see. It is a level phenomenon, and
# admitting it here would be exactly the "volume alone" shortcut REQ-015 bans.
# --------------------------------------------------------------------------

AUDIOSET_TO_KIND: dict[str, str] = {
    # --- speech ---
    "Speech": "speech",
    "Male speech, man speaking": "speech",
    "Female speech, woman speaking": "speech",
    "Child speech, kid speaking": "speech",
    "Conversation": "speech",
    "Narration, monologue": "speech",
    "Speech synthesizer": "speech",
    "Whispering": "speech",
    # --- music ---
    "Music": "music",
    "Musical instrument": "music",
    "Singing": "music",
    "Choir": "music",
    "Song": "music",
    "Pop music": "music",
    "Rock music": "music",
    "Background music": "music",
    "Theme music": "music",
    "Soundtrack music": "music",
    "Jingle (music)": "music",
    "Drum": "music",
    "Guitar": "music",
    "Piano": "music",
    "Brass instrument": "music",
    "Wind instrument, woodwind instrument": "music",
    "Orchestra": "music",
    # --- applause ---
    "Applause": "applause",
    "Clapping": "applause",
    # --- laughter ---
    "Laughter": "laughter",
    "Baby laughter": "laughter",
    "Giggle": "laughter",
    "Snicker": "laughter",
    "Belly laugh": "laughter",
    "Chuckle, chortle": "laughter",
    # --- crowd_reaction ---
    "Cheering": "crowd_reaction",
    "Crowd": "crowd_reaction",
    "Chatter": "crowd_reaction",
    "Hubbub, speech noise, speech babble": "crowd_reaction",
    "Children shouting": "crowd_reaction",
    "Children playing": "crowd_reaction",
    "Battle cry": "crowd_reaction",
    "Shout": "crowd_reaction",
    "Yell": "crowd_reaction",
    # --- impact ---
    "Slam": "impact",
    "Knock": "impact",
    "Bang": "impact",
    "Boom": "impact",
    "Thump, thud": "impact",
    "Thunk": "impact",
    "Whack, thwack": "impact",
    "Smash, crash": "impact",
    "Explosion": "impact",
    "Gunshot, gunfire": "impact",
    # --- silence ---
    "Silence": "silence",
}

#: Kinds the classifier is ALLOWED to emit. `speech` and `silence` are mapped
#: above (the table describes AudioSet, and staying complete keeps it honest and
#: reviewable) but are OWNED by silero-vad and the dBFS floor respectively. Two
#: detectors emitting one kind would double-report every utterance and leave
#: `engine` unable to answer which one saw it.
PANNS_OWNED_KINDS: frozenset[str] = frozenset(
    {"music", "applause", "laughter", "crowd_reaction", "impact"}
)

#: Classes that count as corroboration for an energy_change: anything audible.
#: `Silence` cannot corroborate a level jump — that would be self-contradictory.
_NON_CORROBORATING_KINDS: frozenset[str] = frozenset({"silence"})

AUDIO_EVENT_KINDS: frozenset[str] = frozenset(
    {
        "speech",
        "music",
        "applause",
        "laughter",
        "crowd_reaction",
        "impact",
        "silence",
        "energy_change",
    }
)


# --------------------------------------------------------------------------
# Pure helpers — no model, no I/O. These are the always-run tests' subject.
# --------------------------------------------------------------------------


def seconds_to_ticks(seconds: float, timebase: dict[str, int] | None = None) -> int:
    """Convert at the engine boundary ONCE, then stay in integers forever."""
    tb = timebase or AUDIO_TIMEBASE
    return round(seconds * tb["den"] / tb["num"])


def ticks_to_seconds(ticks: int, timebase: dict[str, int] | None = None) -> float:
    """Inverse of `seconds_to_ticks`, for tests and human-readable logging only.

    Never used to build an artefact field — float seconds do not go on the wire.
    """
    tb = timebase or AUDIO_TIMEBASE
    return ticks * tb["num"] / tb["den"]


def resample_ticks(ticks: int, from_rate: int, to_rate: int) -> int:
    """Exact integer tick conversion between two audio rates.

    Integer arithmetic first, so 16k<->32k (an exact factor of two) never
    round-trips through a float and comes back off by one.
    """
    return (ticks * to_rate) // from_rate


def map_audioset_class(display_name: str) -> str | None:
    """AudioSet display name -> contract kind, or None if unmapped.

    None means DROP. It never means "pick the closest" — see the table's note.
    """
    return AUDIOSET_TO_KIND.get(display_name)


@dataclass(frozen=True, order=True)
class Detection:
    """One detector's claim about one span, before IDs are assigned."""

    start_ticks: int
    end_ticks: int
    kind: str
    confidence: float
    engine_name: str


def frame_dbfs(samples: np.ndarray, frame_ticks: int = FRAME_TICKS) -> np.ndarray:
    """Per-frame RMS in dBFS over non-overlapping frames.

    Frames do not overlap so that frame *i* covers exactly ticks
    `[i*frame_ticks, (i+1)*frame_ticks)` — the tick maths stays integer and a
    span never has to be apportioned between two frames. A trailing partial
    frame is dropped rather than zero-padded: padding would invent quiet audio
    and could manufacture a silence event at the end of every asset.
    """
    usable = (len(samples) // frame_ticks) * frame_ticks
    if usable == 0:
        return np.zeros(0, dtype=np.float64)
    frames = samples[:usable].astype(np.float64).reshape(-1, frame_ticks)
    rms = np.sqrt(np.mean(np.square(frames), axis=1))
    return 20.0 * np.log10(np.maximum(rms, _RMS_FLOOR))


def merge_detections(detections: list[Detection]) -> list[Detection]:
    """Merge overlapping/adjacent spans of the SAME kind and engine.

    Confidence of a merged span is the max of its parts: the span is being
    claimed because the strongest evidence in it cleared the floor, and
    averaging would let a long quiet tail talk a real detection back below it.
    Different kinds are never merged — overlapping music and applause are two
    true facts about the same second.
    """
    if not detections:
        return []
    merged: list[Detection] = []
    for det in sorted(detections):
        prev = merged[-1] if merged else None
        if (
            prev is not None
            and prev.kind == det.kind
            and prev.engine_name == det.engine_name
            and det.start_ticks <= prev.end_ticks
        ):
            merged[-1] = Detection(
                start_ticks=prev.start_ticks,
                end_ticks=max(prev.end_ticks, det.end_ticks),
                kind=prev.kind,
                confidence=max(prev.confidence, det.confidence),
                engine_name=prev.engine_name,
            )
        else:
            merged.append(det)
    return merged


def detect_silence_spans(
    dbfs: np.ndarray,
    speech_spans: list[tuple[int, int]],
    *,
    floor_dbfs: float = SILENCE_DBFS_FLOOR,
    min_ticks: int | None = None,
    frame_ticks: int = FRAME_TICKS,
) -> list[Detection]:
    """Runs of frames below the dBFS floor, excluding anything the VAD claimed.

    The VAD exclusion is not belt-and-braces: silero can hold a span across a
    short intra-word gap, and reporting `silence` inside a span already reported
    as `speech` would put two contradictory events on the same ticks.

    Confidence is how far below the floor the run's *loudest* frame sits,
    normalised over 20 dB — the quietest evidence in the run is what the claim
    rests on, so the strongest frame is the honest bound.
    """
    if min_ticks is None:
        min_ticks = seconds_to_ticks(SILENCE_MIN_MS / 1000.0)

    detections: list[Detection] = []
    run_start: int | None = None
    for index in range(len(dbfs) + 1):
        below = index < len(dbfs) and bool(dbfs[index] < floor_dbfs)
        if below and run_start is None:
            run_start = index
        elif not below and run_start is not None:
            start_ticks = run_start * frame_ticks
            end_ticks = index * frame_ticks
            loudest = float(np.max(dbfs[run_start:index]))
            if end_ticks - start_ticks >= min_ticks and not _overlaps_any(
                start_ticks, end_ticks, speech_spans
            ):
                detections.append(
                    Detection(
                        start_ticks=start_ticks,
                        end_ticks=end_ticks,
                        kind="silence",
                        confidence=_clamp01((floor_dbfs - loudest) / 20.0),
                        engine_name=ENGINE_RMS,
                    )
                )
            run_start = None
    return merge_detections(detections)


def detect_energy_candidates(
    dbfs: np.ndarray,
    *,
    trigger_db: float = RMS_DELTA_TRIGGER_DB,
    frame_ticks: int = FRAME_TICKS,
) -> list[Detection]:
    """Frame-to-frame level jumps of at least `trigger_db`, in either direction.

    These are CANDIDATES and nothing else. They carry
    `engine_name = ENGINE_RMS` precisely so that an un-corroborated one is
    recognisable — and `corroborate_energy_changes` is the only way any of them
    reaches an artefact. Emitting this list directly would be the REQ-015
    violation the schema calls a Phase 2 test failure.

    A drop counts as much as a rise: a hard cut to silence is as editorially
    material as a hit, and taking only rises would quietly encode "louder =
    more important".
    """
    detections: list[Detection] = []
    for index in range(1, len(dbfs)):
        delta = abs(float(dbfs[index]) - float(dbfs[index - 1]))
        if delta >= trigger_db:
            detections.append(
                Detection(
                    start_ticks=(index - 1) * frame_ticks,
                    end_ticks=(index + 1) * frame_ticks,
                    kind="energy_change",
                    # Normalised over 2x the trigger so the floor maps to 0.5 and
                    # a jump of 24 dB or more saturates. Magnitude of a LEVEL
                    # change — explicitly not a claim about importance.
                    confidence=_clamp01(delta / (2.0 * trigger_db)),
                    engine_name=ENGINE_RMS,
                )
            )
    return merge_detections(detections)


def corroborate_energy_changes(
    candidates: list[Detection],
    classifier_detections: list[Detection],
) -> list[Detection]:
    """Keep only the level jumps the CLASSIFIER also has something to say about.

    `source-index-v1.json`: *"an `energy_change` event whose engine is the RMS
    track alone is a Phase 2 test failure — the classifier must corroborate
    it."* This is that gate. A candidate survives only where some audible
    classifier detection overlaps it, and the surviving event's engine names
    both tracks.

    Confidence is `min(level, classifier)` — the weaker track. The event asserts
    that BOTH saw something, so it can be no more confident than whichever saw
    it less clearly.
    """
    audible = [d for d in classifier_detections if d.kind not in _NON_CORROBORATING_KINDS]
    corroborated: list[Detection] = []
    for candidate in candidates:
        overlapping = [
            d
            for d in audible
            if d.start_ticks < candidate.end_ticks and candidate.start_ticks < d.end_ticks
        ]
        if not overlapping:
            continue
        support = max(d.confidence for d in overlapping)
        corroborated.append(
            Detection(
                start_ticks=candidate.start_ticks,
                end_ticks=candidate.end_ticks,
                kind="energy_change",
                confidence=min(candidate.confidence, support),
                engine_name=ENGINE_ENERGY_CHANGE,
            )
        )
    return merge_detections(corroborated)


def detections_from_probabilities(
    probabilities: np.ndarray,
    window_spans: list[tuple[int, int]],
    labels: list[str],
    *,
    floor: float = PANNS_CONFIDENCE_FLOOR,
    allowed_kinds: frozenset[str] | None = None,
) -> list[Detection]:
    """Turn a (windows x 527) probability matrix into merged detections.

    Split out from inference so the whole mapping/thresholding/merging path is
    unit-testable against a hand-written matrix, with no 320 MB checkpoint and
    no torch in the loop.
    """
    allowed = PANNS_OWNED_KINDS if allowed_kinds is None else allowed_kinds
    if probabilities.shape[0] != len(window_spans):
        raise SubStageError(
            "AUDIO_EVENTS_SHAPE_MISMATCH",
            f"{probabilities.shape[0]} probability rows for {len(window_spans)} windows",
        )

    detections: list[Detection] = []
    for row, (start_ticks, end_ticks) in zip(probabilities, window_spans, strict=True):
        best: dict[str, float] = {}
        for class_index, probability in enumerate(row):
            value = float(probability)
            if value < floor or class_index >= len(labels):
                continue
            kind = map_audioset_class(labels[class_index])
            if kind is None or kind not in allowed:
                # Unmapped: dropped on purpose, never guessed into a neighbour.
                continue
            if value > best.get(kind, 0.0):
                best[kind] = value
        # Sorted so construction order cannot leak into the artefact.
        for kind in sorted(best):
            detections.append(
                Detection(
                    start_ticks=start_ticks,
                    end_ticks=end_ticks,
                    kind=kind,
                    confidence=_clamp01(best[kind]),
                    engine_name=ENGINE_PANNS,
                )
            )
    return merge_detections(detections)


def build_window_spans(
    total_ticks: int,
    *,
    window_ticks: int = PANNS_WINDOW_TICKS,
    hop_ticks: int = PANNS_HOP_TICKS,
) -> list[tuple[int, int]]:
    """Fixed analysis windows over `total_ticks`, clipped to the media.

    Windows never run past the end: a window padded with zeros would look like a
    level drop to the classifier and to the RMS track alike.
    """
    if total_ticks <= 0:
        return []
    if total_ticks <= window_ticks:
        return [(0, total_ticks)]
    spans: list[tuple[int, int]] = []
    start = 0
    while start + window_ticks <= total_ticks:
        spans.append((start, start + window_ticks))
        start += hop_ticks
    if spans and spans[-1][1] < total_ticks:
        spans.append((total_ticks - window_ticks, total_ticks))
    return spans


def to_audio_events(
    detections: list[Detection],
    engines: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Assign deterministic IDs and render the contract `AudioEvent` shape.

    Sorted by (startTicks, endTicks, kind, engine) BEFORE numbering, so the same
    input yields the same `eventId` on every run and on every machine — the
    cache and every downstream reference depend on it (contract §4/§5).
    """
    ordered = sorted(
        detections,
        key=lambda d: (d.start_ticks, d.end_ticks, d.kind, d.engine_name),
    )
    events: list[dict[str, Any]] = []
    for ordinal, det in enumerate(ordered, start=1):
        if det.kind not in AUDIO_EVENT_KINDS:
            raise SubStageError(
                "AUDIO_EVENTS_INVALID_KIND",
                f"{det.kind!r} is not an AudioEventKind",
            )
        engine = engines.get(det.engine_name)
        if engine is None:
            raise SubStageError(
                "AUDIO_EVENTS_UNKNOWN_ENGINE",
                f"no EngineRecord registered for {det.engine_name!r}",
            )
        events.append(
            {
                "eventId": f"audio-event-{ordinal:04d}",
                "kind": det.kind,
                "startTicks": int(det.start_ticks),
                "endTicks": int(det.end_ticks),
                "timebase": dict(AUDIO_TIMEBASE),
                "confidence": round(float(det.confidence), 6),
                "engine": engine,
            }
        )
    return events


def _clamp01(value: float) -> float:
    if math.isnan(value):
        return 0.0
    return max(0.0, min(1.0, float(value)))


def _overlaps_any(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    return any(s < end and start < e for s, e in spans)


def engine_record(name: str, version: str, parameters: dict[str, Any]) -> dict[str, Any]:
    """EngineRecord: `parameters` is a key/value ARRAY, sorted, values stringified.

    Sorted because the record is hashed into the artefact — dict iteration order
    must not be able to change the bytes on disk (contract §5).
    """
    return {
        "name": name,
        "version": version,
        "parameters": [
            {"key": key, "value": _stringify(parameters[key])} for key in sorted(parameters)
        ],
    }


def _stringify(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        # repr keeps the exact value; str() of a float is already shortest-repr
        # in 3.12 but being explicit stops a future format change moving hashes.
        return format(value, ".6g")
    return str(value)


# --------------------------------------------------------------------------
# Media I/O — FFmpeg, argv arrays only (Windows: no shell, no shebang).
# --------------------------------------------------------------------------


def _tool(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise SubStageError(
            "FFMPEG_NOT_FOUND",
            f"{name} is required to decode audio but is not on PATH",
            details={"tool": name},
        )
    return path


def probe_audio_stream(media_path: Path) -> tuple[bool, float]:
    """(has_audio_stream, duration_seconds) via ffprobe.

    `broll-silent.mp4` has NO audio stream at all — not a quiet one. librosa
    raises `NoBackendError` on it, which is why the pipeline probes first rather
    than discovering the absence as a decode crash.
    """
    argv = [
        _tool("ffprobe"),
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        str(media_path),
    ]
    completed = subprocess.run(argv, capture_output=True, check=False)
    if completed.returncode != 0:
        raise SubStageError(
            "AUDIO_PROBE_FAILED",
            f"ffprobe failed for {media_path.name}",
            details={"stderr": completed.stderr.decode("utf-8", "replace")[-2000:]},
        )
    payload = json.loads(completed.stdout.decode("utf-8", "replace") or "{}")
    has_audio = any(s.get("codec_type") == "audio" for s in payload.get("streams", []))
    try:
        duration = float(payload.get("format", {}).get("duration", 0.0))
    except (TypeError, ValueError):
        duration = 0.0
    return has_audio, duration


def decode_audio(media_path: Path, sample_rate: int) -> np.ndarray:
    """Decode to mono float32 at `sample_rate` — deterministic, no shell."""
    argv = [
        _tool("ffmpeg"),
        "-v",
        "error",
        "-nostdin",
        "-i",
        str(media_path),
        "-vn",
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-",
    ]
    completed = subprocess.run(argv, capture_output=True, check=False)
    if completed.returncode != 0:
        raise SubStageError(
            "AUDIO_DECODE_FAILED",
            f"ffmpeg could not decode audio from {media_path.name}",
            details={"stderr": completed.stderr.decode("utf-8", "replace")[-2000:]},
        )
    return np.frombuffer(completed.stdout, dtype="<f4").copy()


# --------------------------------------------------------------------------
# Engines
# --------------------------------------------------------------------------


def _package_version(distribution: str, fallback: str = "unknown") -> str:
    try:
        return metadata.version(distribution)
    except metadata.PackageNotFoundError:
        return fallback


def load_audioset_labels(path: Path | None = None) -> list[str]:
    """Read the vendored 527-class label list WITHOUT importing panns_inference.

    Reading it ourselves is what lets the mapping table be validated in the fast
    test suite: no torch, no checkpoint, no import-time wget.
    """
    source = path or VENDORED_CLASS_LABELS
    if not source.exists():
        raise ModelUnavailableError(
            ENGINE_PANNS,
            f"vendored AudioSet label file is missing at {source.name}",
            details={"expectedFile": source.name},
        )
    with source.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))
    labels = [row[2] for row in rows[1:] if len(row) >= 3]
    if len(labels) != AUDIOSET_CLASS_COUNT:
        raise ModelUnavailableError(
            ENGINE_PANNS,
            f"AudioSet label file has {len(labels)} classes, expected {AUDIOSET_CLASS_COUNT}",
        )
    return labels


def ensure_panns_labels() -> Path:
    """Populate `~/panns_data/class_labels_indices.csv` from the vendored copy.

    Fix (a). MUST run before `import panns_inference`: the package reads this
    path at import time and, finding nothing, shells out to `wget` — absent on
    Windows — leaving a bare FileNotFoundError. Copying from the repo makes the
    import work offline and pins the label set to a reviewed file rather than
    whatever a URL serves today.
    """
    if not VENDORED_CLASS_LABELS.exists():
        raise ModelUnavailableError(
            ENGINE_PANNS,
            "vendored AudioSet label file is missing; panns_inference cannot be imported offline",
            details={"expectedPath": str(VENDORED_CLASS_LABELS)},
        )
    if not PANNS_LABELS_PATH.exists() or PANNS_LABELS_PATH.stat().st_size == 0:
        PANNS_HOME.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(VENDORED_CLASS_LABELS, PANNS_LABELS_PATH)
    return PANNS_LABELS_PATH


def _sha256_file(path: Path) -> str:
    """Streamed sha256 — the checkpoint is ~320 MB and must not be slurped."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_panns_checkpoint(*, allow_download: bool = True) -> Path:
    """Make the CNN14 checkpoint available, without upstream's `wget`.

    Same blocker as the labels, larger file: `AudioTagging.__init__` shells out
    to wget for a ~320 MB checkpoint. We fetch it with urllib to a temp file and
    rename, so an interrupted download can never be mistaken for a complete one
    — upstream's own size check would otherwise re-trigger a wget that fails
    silently on this platform.
    """
    if (
        PANNS_CHECKPOINT_PATH.exists()
        and PANNS_CHECKPOINT_PATH.stat().st_size >= PANNS_CHECKPOINT_MIN_BYTES
    ):
        # Verify the CACHED file too, not just a fresh download. The realistic
        # threat here is not a MITM (transport is HTTPS and the URL is a
        # constant) but any local process that can write `~/panns_data/` — and a
        # cache trusted forever is exactly what such a process would rely on.
        # This file is unpickled by `torch.load`, so a swap is code execution.
        actual = _sha256_file(PANNS_CHECKPOINT_PATH)
        if actual != PANNS_CHECKPOINT_SHA256:
            raise ModelUnavailableError(
                ENGINE_PANNS,
                "Cached CNN14 checkpoint failed its pinned sha256 check; refusing to unpickle it. "
                f"Delete {PANNS_CHECKPOINT_PATH} to re-download.",
                details={"expected": PANNS_CHECKPOINT_SHA256, "actual": actual},
            )
        return PANNS_CHECKPOINT_PATH
    if not allow_download:
        raise ModelUnavailableError(
            ENGINE_PANNS,
            "CNN14 checkpoint is absent and downloads are disabled",
            details={"expectedPath": str(PANNS_CHECKPOINT_PATH)},
        )
    PANNS_HOME.mkdir(parents=True, exist_ok=True)
    partial = PANNS_CHECKPOINT_PATH.with_suffix(".partial")
    try:
        with urllib.request.urlopen(
            PANNS_CHECKPOINT_URL, timeout=PANNS_DOWNLOAD_TIMEOUT_SECONDS
        ) as response, partial.open("wb") as out:
            shutil.copyfileobj(response, out)
    except (urllib.error.URLError, OSError, TimeoutError) as error:
        partial.unlink(missing_ok=True)
        raise ModelUnavailableError(
            ENGINE_PANNS,
            f"CNN14 checkpoint could not be fetched: {error}",
            details={"url": PANNS_CHECKPOINT_URL},
        ) from error
    if partial.stat().st_size < PANNS_CHECKPOINT_MIN_BYTES:
        size = partial.stat().st_size
        partial.unlink(missing_ok=True)
        raise ModelUnavailableError(
            ENGINE_PANNS,
            f"CNN14 checkpoint download was truncated ({size} bytes)",
        )

    # A size floor catches truncation but cannot distinguish a 320 MB malicious
    # checkpoint from the real one — and this file is handed to `torch.load`,
    # i.e. unpickled, which executes whatever it contains.
    actual = _sha256_file(partial)
    if actual != PANNS_CHECKPOINT_SHA256:
        partial.unlink(missing_ok=True)
        raise ModelUnavailableError(
            ENGINE_PANNS,
            "CNN14 checkpoint failed its pinned sha256 check; refusing to unpickle it.",
            details={"expected": PANNS_CHECKPOINT_SHA256, "actual": actual},
        )

    os.replace(partial, PANNS_CHECKPOINT_PATH)
    return PANNS_CHECKPOINT_PATH


def run_vad(samples: np.ndarray) -> list[tuple[int, int]]:
    """silero-vad speech spans, in ticks (== samples at 16 kHz).

    `get_speech_timestamps(..., return_seconds=False)` already returns sample
    indices at `sampling_rate`, and our timebase IS 16 kHz — so this is the one
    engine boundary that needs no conversion at all. Asked for seconds instead,
    we would be converting a float back into the integer we already had.
    """
    try:
        import torch
        from silero_vad import get_speech_timestamps, load_silero_vad
    except ImportError as error:
        raise ModelUnavailableError(
            ENGINE_VAD, f"silero-vad is not importable: {error}"
        ) from error

    try:
        torch.set_num_threads(1)  # single-threaded == reproducible
        model = load_silero_vad()
        spans = get_speech_timestamps(
            torch.from_numpy(samples.astype(np.float32)),
            model,
            sampling_rate=AUDIO_SAMPLE_RATE,
            threshold=VAD_SPEECH_PROBABILITY,
            min_speech_duration_ms=VAD_MIN_SPEECH_MS,
            min_silence_duration_ms=VAD_MIN_SILENCE_MS,
            return_seconds=False,
        )
    except Exception as error:
        raise ModelUnavailableError(
            ENGINE_VAD, f"silero-vad failed to run: {error}"
        ) from error
    return [(int(s["start"]), int(s["end"])) for s in spans]


def run_panns(
    samples_32k: np.ndarray,
    window_spans: list[tuple[int, int]],
    *,
    allow_download: bool = True,
) -> np.ndarray:
    """PANNs CNN14 clipwise probabilities per window. LAZY import (fix (b)).

    `panns_inference` is imported HERE and never at module scope, so a machine
    without the label file or checkpoint fails as a named
    `ModelUnavailableError` instead of taking the whole module — and every other
    sub-stage down with it — at import time.
    """
    ensure_panns_labels()
    checkpoint = ensure_panns_checkpoint(allow_download=allow_download)

    try:
        import torch
        from panns_inference import AudioTagging
    except Exception as error:
        raise ModelUnavailableError(
            ENGINE_PANNS, f"panns_inference could not be imported: {error}"
        ) from error

    if not window_spans:
        return np.zeros((0, AUDIOSET_CLASS_COUNT), dtype=np.float32)

    try:
        torch.set_num_threads(1)
        tagger = AudioTagging(checkpoint_path=str(checkpoint), device="cpu")
        batch = np.stack(
            [
                _window_at(samples_32k, start, end)
                for start, end in window_spans
            ]
        )
        clipwise, _embedding = tagger.inference(batch)
    except Exception as error:
        raise ModelUnavailableError(
            ENGINE_PANNS, f"PANNs CNN14 inference failed: {error}"
        ) from error
    return np.asarray(clipwise, dtype=np.float32)


def _window_at(samples_32k: np.ndarray, start_ticks: int, end_ticks: int) -> np.ndarray:
    """Slice a 16 kHz-tick window out of 32 kHz audio, exact 2x, fixed length.

    All rows of a batch must be the same length, so a short final window is
    zero-padded HERE (at the tensor boundary) rather than by shifting its span —
    the reported ticks stay the true ones.
    """
    lo = resample_ticks(start_ticks, AUDIO_SAMPLE_RATE, PANNS_SAMPLE_RATE)
    hi = resample_ticks(end_ticks, AUDIO_SAMPLE_RATE, PANNS_SAMPLE_RATE)
    width = resample_ticks(PANNS_WINDOW_TICKS, AUDIO_SAMPLE_RATE, PANNS_SAMPLE_RATE)
    chunk = samples_32k[lo:hi].astype(np.float32)
    if len(chunk) < width:
        chunk = np.pad(chunk, (0, width - len(chunk)))
    return chunk[:width]


# --------------------------------------------------------------------------
# Model config -> REQ-005 cache key
# --------------------------------------------------------------------------


def build_model_config() -> dict[str, Any]:
    """Every parameter that can change the output, and nothing that cannot.

    Package versions are read from installed metadata rather than the checkpoint
    so this is computable WITHOUT importing panns_inference — the cache key must
    not itself depend on the import that fix (b) keeps lazy.
    """
    return {
        "sampleRate": AUDIO_SAMPLE_RATE,
        "pannsSampleRate": PANNS_SAMPLE_RATE,
        "frameTicks": FRAME_TICKS,
        "windowTicks": PANNS_WINDOW_TICKS,
        "hopTicks": PANNS_HOP_TICKS,
        "vad": {
            "engine": ENGINE_VAD,
            "version": _package_version("silero-vad"),
            "speechProbability": VAD_SPEECH_PROBABILITY,
            "minSpeechMs": VAD_MIN_SPEECH_MS,
            "minSilenceMs": VAD_MIN_SILENCE_MS,
        },
        "energy": {
            "engine": ENGINE_RMS,
            "version": RMS_ALGORITHM_VERSION,
            "silenceDbfsFloor": SILENCE_DBFS_FLOOR,
            "silenceMinMs": SILENCE_MIN_MS,
            "rmsDeltaTriggerDb": RMS_DELTA_TRIGGER_DB,
            "dbfsClamp": SILENCE_DBFS_CLAMP,
        },
        "classifier": {
            "engine": ENGINE_PANNS,
            "version": _package_version("panns-inference"),
            "confidenceFloor": PANNS_CONFIDENCE_FLOOR,
            "mappingRevision": RMS_ALGORITHM_VERSION,
            "mappedClasses": len(AUDIOSET_TO_KIND),
        },
    }


def build_engine_records() -> dict[str, dict[str, Any]]:
    """One EngineRecord per producing detector, thresholds attached to their owner.

    Each record carries the thresholds that engine actually applies, so a reader
    inspecting a single event sees the parameters that produced *it* and not an
    undifferentiated dump of every constant in the module. The complete set
    still reaches the cache key via `build_model_config`.
    """
    vad_version = _package_version("silero-vad")
    panns_version = _package_version("panns-inference")
    vad_parameters = {
        "speechProbability": VAD_SPEECH_PROBABILITY,
        "minSpeechMs": VAD_MIN_SPEECH_MS,
        "minSilenceMs": VAD_MIN_SILENCE_MS,
        "sampleRate": AUDIO_SAMPLE_RATE,
    }
    energy_parameters = {
        "silenceDbfsFloor": SILENCE_DBFS_FLOOR,
        "silenceMinMs": SILENCE_MIN_MS,
        "rmsDeltaTriggerDb": RMS_DELTA_TRIGGER_DB,
        "dbfsClamp": SILENCE_DBFS_CLAMP,
        "frameTicks": FRAME_TICKS,
        "sampleRate": AUDIO_SAMPLE_RATE,
    }
    panns_parameters = {
        "confidenceFloor": PANNS_CONFIDENCE_FLOOR,
        "windowTicks": PANNS_WINDOW_TICKS,
        "hopTicks": PANNS_HOP_TICKS,
        "sampleRate": PANNS_SAMPLE_RATE,
        "checkpoint": "Cnn14_mAP=0.431",
    }
    return {
        ENGINE_VAD: engine_record(ENGINE_VAD, vad_version, vad_parameters),
        ENGINE_RMS: engine_record(ENGINE_RMS, RMS_ALGORITHM_VERSION, energy_parameters),
        ENGINE_PANNS: engine_record(ENGINE_PANNS, panns_version, panns_parameters),
        # Names both tracks: the schema makes an RMS-only engine on an
        # energy_change a test failure.
        ENGINE_ENERGY_CHANGE: engine_record(
            ENGINE_ENERGY_CHANGE,
            f"{RMS_ALGORITHM_VERSION}+{panns_version}",
            {**energy_parameters, **panns_parameters},
        ),
    }


# --------------------------------------------------------------------------
# The sub-stage
# --------------------------------------------------------------------------


def compute_audio_events(
    media_path: Path,
    *,
    allow_download: bool = True,
) -> dict[str, Any]:
    """Produce the `audioEvents` artefact for one media file."""
    media_path = Path(media_path)
    if not media_path.exists():
        raise SubStageError(
            "AUDIO_INPUT_MISSING",
            f"media file does not exist: {media_path.name}",
            exit_code=2,
        )

    engines = build_engine_records()
    has_audio, duration_seconds = probe_audio_stream(media_path)

    if not has_audio:
        # Silent b-roll has no audio STREAM, not a quiet one — and an AudioEvent
        # is a DETECTION: a claim some engine made after measuring samples.
        # Synthesising a whole-asset `silence` here (decisions.md D-53) meant
        # emitting `confidence: 1.0` under `ENGINE_RMS` for an engine that
        # processed zero samples — a false provenance claim, and one that
        # contradicted `quality.py`, which refuses to report `silence` for an
        # asset with no audio on the grounds that silence is a property of audio
        # that exists. The honest shape is the one `source-index-v1.json`
        # prescribes: an EMPTY collection, with the reason it is empty carried in
        # the sub-stage ledger entry rather than in a manufactured observation.
        #
        # Nothing here loads a model, which is what keeps this the fast negative
        # control for speech.
        return {
            "audioEvents": [],
            "subStage": {
                "status": "completed",
                "reason": (
                    "asset has no audio stream"
                    + (
                        f" ({duration_seconds:.3f} s of video only)"
                        if duration_seconds > 0
                        # ffprobe reports no duration for some containers, and
                        # "0.000 s" would read as an empty asset rather than an
                        # unknown length.
                        else " (container reports no duration)"
                    )
                    + ", so no audio events could be detected — this empty collection "
                    "is an absence of audio, not an absence of events in audio"
                ),
            },
        }

    samples = decode_audio(media_path, AUDIO_SAMPLE_RATE)
    total_ticks = len(samples)
    if total_ticks == 0:
        return {"audioEvents": []}

    dbfs = frame_dbfs(samples)

    # 1. speech — silero-vad, the sole authority for this kind.
    speech_spans = run_vad(samples)
    detections: list[Detection] = [
        Detection(
            start_ticks=start,
            end_ticks=end,
            kind="speech",
            confidence=VAD_SPEECH_PROBABILITY,
            engine_name=ENGINE_VAD,
        )
        for start, end in speech_spans
    ]

    # 2. silence — dBFS floor, excluding anything the VAD claimed as speech.
    detections.extend(detect_silence_spans(dbfs, speech_spans))

    # 3. classifier kinds — PANNs CNN14 over overlapping windows.
    window_spans = build_window_spans(total_ticks)
    samples_32k = decode_audio(media_path, PANNS_SAMPLE_RATE)
    probabilities = run_panns(samples_32k, window_spans, allow_download=allow_download)
    classifier_detections = detections_from_probabilities(
        probabilities,
        window_spans,
        load_audioset_labels(),
    )
    detections.extend(classifier_detections)

    # 4. energy_change — proposed by level, EMITTED only with classifier
    #    corroboration. Never relabelled as applause/laughter/crowd_reaction.
    candidates = detect_energy_candidates(dbfs)
    detections.extend(corroborate_energy_changes(candidates, classifier_detections))

    return {"audioEvents": to_audio_events(detections, engines)}


def run_audio_events(
    ctx: SubStageContext,
    media_path: Path,
    *,
    force: bool = False,
    allow_download: bool = True,
) -> SubStageResult:
    """Entry point: the audio-events sub-stage, cached and resumable."""
    return run_sub_stage(
        ctx,
        SUB_STAGE_NAME,
        lambda: compute_audio_events(media_path, allow_download=allow_download),
        model_config=build_model_config(),
        force=force,
    )
