"""Every external tool behind an interface, so a unit test needs no network and no binary.

``yt-dlp``, blob storage, ``ffprobe``, ``ffmpeg`` frame extraction, native captions, Whisper,
scene detection, and OCR are all ``Protocol``s here. Each has a deterministic fake under
``tests/fakes/``. The pipeline depends on these protocols, never on a concrete tool.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from extraction.model import (
    BoundingBox,
    CompositionKind,
    ConfidenceBand,
    ContrastBand,
    LightingKind,
)

__all__ = [
    "AcquiredMedia",
    "IBlobStore",
    "IFrameExtractor",
    "IMediaDownloader",
    "IMediaProbe",
    "IOcr",
    "ISceneDetector",
    "ISignalExtractor",
    "ITranscriber",
    "MediaUnreachableError",
    "OcrHit",
    "OcrResult",
    "ProbeResult",
    "SceneResult",
    "SignalResult",
]


class MediaUnreachableError(RuntimeError):
    """The downloader or blob store could not reach the media. No ``FeatureRecord`` is produced;
    the caller degrades to ``NEEDS_REVIEW`` and retries. Never a default record."""


@dataclass(frozen=True, slots=True)
class AcquiredMedia:
    """Bytes plus the provenance the allowlist review established."""

    uri: str
    media_sha256: str
    source_host: str
    no_redistribute: bool
    local_ref: str  # opaque handle a tool consumes; fakes ignore it


@dataclass(frozen=True, slots=True)
class ProbeResult:
    """``ffprobe`` output. ``codec_supported=False`` means no record is produced (unsupported
    codec), reason recorded. ``audio_present=False`` sets the REQ-018 degraded flags."""

    duration_ms: int
    audio_present: bool
    codec_supported: bool
    reason: str = ""


@dataclass(frozen=True, slots=True)
class SceneResult:
    """Scene-change detection. ``supported=False`` (e.g. compressed vertical mobile video) yields
    evenly-spaced frames and a ``LOW`` confidence that is surfaced, not silently scored."""

    cut_timestamps_ms: tuple[int, ...]
    confidence: ConfidenceBand
    supported: bool


@dataclass(frozen=True, slots=True)
class OcrHit:
    text: str
    bbox: BoundingBox
    contrast_band: ContrastBand
    in_safe_zone: bool


@dataclass(frozen=True, slots=True)
class OcrResult:
    """OCR for one frame. ``succeeded=False`` means the frame contributed *no* result — which is
    not the same as "no text present". The owning record's ``onscreen_text_complete`` goes False
    and a disclosure veto cannot pass on that absence."""

    ts_ms: int
    hits: tuple[OcrHit, ...]
    succeeded: bool


@dataclass(frozen=True, slots=True)
class SignalResult:
    """First-frame, disclosure, and authenticity signals derived from the media."""

    face_present: bool
    face_scale: float
    composition: CompositionKind
    clutter_index: float
    onscreen_disclosure_tags: tuple[str, ...]
    caption_disclosure_tags: tuple[str, ...]
    spoken_disclosure_ts_ms: int | None
    handheld_motion: float
    ambient_audio: bool
    filler_word_rate: float
    lighting_kind: LightingKind
    audio_signals_complete: bool
    """False when the audio analysis did not run or produced nothing usable. The pipeline ANDs
    this with ``audio_present`` — an audio-derived scalar is complete only if audio existed *and*
    the analysis ran."""


class IMediaDownloader(Protocol):
    """``yt-dlp`` for exemplars. Raises :class:`MediaUnreachableError` when the media is gone."""

    def fetch(self, uri: str) -> AcquiredMedia: ...


class IBlobStore(Protocol):
    """Direct blob read for submissions. Raises :class:`MediaUnreachableError` when unreachable."""

    def read(self, uri: str) -> AcquiredMedia: ...


class IMediaProbe(Protocol):
    def probe(self, media: AcquiredMedia) -> ProbeResult: ...


class IFrameExtractor(Protocol):
    """Renders one frame at a timestamp to a blob and returns its URI (``ffmpeg``)."""

    def extract_frame(self, media: AcquiredMedia, ts_ms: int) -> str: ...


class ITranscriber(Protocol):
    """Native captions first; Whisper only as fallback and only when audio is present. Either may
    return ``None`` — captions absent, or Whisper unavailable — and that is recorded, not hidden."""

    def native_captions(self, media: AcquiredMedia) -> str | None: ...

    def whisper(self, media: AcquiredMedia) -> str | None: ...


class ISceneDetector(Protocol):
    def detect(self, media: AcquiredMedia, duration_ms: int) -> SceneResult: ...


class IOcr(Protocol):
    def ocr_frame(self, media: AcquiredMedia, ts_ms: int) -> OcrResult: ...


class ISignalExtractor(Protocol):
    def extract(self, media: AcquiredMedia, probe: ProbeResult) -> SignalResult: ...
