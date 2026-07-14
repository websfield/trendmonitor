"""Deterministic fakes + builders for the extraction pipeline (P2-T8).

Every fake is a frozen-ish dataclass configured entirely by construction. ``build_extractor``
wires a full :class:`Extractor` from fakes so a test states only what it wants to vary.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

from extraction.acquire import Allowlist, AllowlistEntry
from extraction.model import (
    BoundingBox,
    CompositionKind,
    ConfidenceBand,
    ContrastBand,
    DeidentifiedRecord,
    FeatureRecord,
    LightingKind,
)
from extraction.pipeline import Extractor
from extraction.ports import (
    AcquiredMedia,
    MediaUnreachableError,
    OcrHit,
    OcrResult,
    ProbeResult,
    SceneResult,
    SignalResult,
)

FIXED_NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _host_of(uri: str) -> str:
    return urlsplit(uri).hostname or ""


def make_media(uri: str = "https://exemplars.public-cc0.example/clip/1") -> AcquiredMedia:
    return AcquiredMedia(
        uri=uri,
        media_sha256=_sha256(uri),
        source_host=_host_of(uri),
        no_redistribute=False,
        local_ref=uri,
    )


@dataclass
class FakeDownloader:
    """``yt-dlp`` fake. Set ``unreachable=True`` to simulate media that is gone."""

    unreachable: bool = False

    def fetch(self, uri: str) -> AcquiredMedia:
        if self.unreachable:
            raise MediaUnreachableError(f"yt-dlp could not reach {uri!r}")
        return make_media(uri)


@dataclass
class FakeBlobStore:
    """Direct blob read fake for submissions / live posts."""

    unreachable: bool = False

    def read(self, uri: str) -> AcquiredMedia:
        if self.unreachable:
            raise MediaUnreachableError(f"blob store could not reach {uri!r}")
        return make_media(uri)


@dataclass
class FakeProbe:
    duration_ms: int = 8000
    audio_present: bool = True
    codec_supported: bool = True
    reason: str = ""

    def probe(self, media: AcquiredMedia) -> ProbeResult:
        return ProbeResult(
            duration_ms=self.duration_ms,
            audio_present=self.audio_present,
            codec_supported=self.codec_supported,
            reason=self.reason,
        )


@dataclass
class FakeTranscriber:
    """Configure native captions and Whisper independently. ``None`` means absent/unavailable."""

    native: str | None = "here is the opening line"
    whisper_text: str | None = "whisper heard this"

    def native_captions(self, media: AcquiredMedia) -> str | None:
        return self.native

    def whisper(self, media: AcquiredMedia) -> str | None:
        return self.whisper_text


@dataclass
class FakeSceneDetector:
    cut_timestamps_ms: tuple[int, ...] = (3000, 5000)
    confidence: ConfidenceBand = ConfidenceBand.HIGH
    supported: bool = True

    def detect(self, media: AcquiredMedia, duration_ms: int) -> SceneResult:
        cuts = tuple(c for c in self.cut_timestamps_ms if c < duration_ms)
        return SceneResult(
            cut_timestamps_ms=cuts, confidence=self.confidence, supported=self.supported
        )


@dataclass
class FakeFrameExtractor:
    def extract_frame(self, media: AcquiredMedia, ts_ms: int) -> str:
        return f"blob://{media.media_sha256}/frame/{ts_ms}"


@dataclass
class FakeOcr:
    """Returns one hit per frame by default. ``fail_timestamps`` marks frames whose OCR fails."""

    fail_timestamps: frozenset[int] = field(default_factory=frozenset)
    hits_per_frame: tuple[OcrHit, ...] = field(
        default_factory=lambda: (
            OcrHit(
                text="#ad",
                bbox=BoundingBox(0.1, 0.1, 0.2, 0.05),
                contrast_band=ContrastBand.HIGH,
                in_safe_zone=True,
            ),
        )
    )

    def ocr_frame(self, media: AcquiredMedia, ts_ms: int) -> OcrResult:
        if ts_ms in self.fail_timestamps:
            return OcrResult(ts_ms=ts_ms, hits=(), succeeded=False)
        return OcrResult(ts_ms=ts_ms, hits=self.hits_per_frame, succeeded=True)


@dataclass
class FakeSignalExtractor:
    filler_word_rate: float = 0.12

    def extract(self, media: AcquiredMedia, probe: ProbeResult) -> SignalResult:
        # Honour audio_present: with no audio track the filler-word analysis cannot run, so it
        # reports a bare 0.0 AND marks itself incomplete — the guard must catch that 0.0, not the
        # fake pretending it measured zero.
        audio_ran = probe.audio_present
        return SignalResult(
            face_present=True,
            face_scale=0.4,
            composition=CompositionKind.CENTERED,
            clutter_index=0.3,
            onscreen_disclosure_tags=("#ad",),
            caption_disclosure_tags=(),
            spoken_disclosure_ts_ms=None,
            handheld_motion=0.6,
            ambient_audio=probe.audio_present,
            filler_word_rate=self.filler_word_rate if audio_ran else 0.0,
            lighting_kind=LightingKind.NATURAL,
            audio_signals_complete=audio_ran,
        )


def make_allowlist() -> Allowlist:
    return Allowlist(
        version="test.1",
        entries=(
            AllowlistEntry("exemplars.public-cc0.example", True, True),
            AllowlistEntry("research-partner.example", True, False),
            AllowlistEntry("clienthub.internal", True, True),
        ),
    )


def build_extractor(
    *,
    extractor_version: str = "extractor-v1",
    allowlist: Allowlist | None = None,
    downloader: FakeDownloader | None = None,
    blob_store: FakeBlobStore | None = None,
    probe: FakeProbe | None = None,
    transcriber: FakeTranscriber | None = None,
    scene_detector: FakeSceneDetector | None = None,
    frame_extractor: FakeFrameExtractor | None = None,
    ocr: FakeOcr | None = None,
    signal_extractor: FakeSignalExtractor | None = None,
    hook_window_ms: int = 2000,
) -> Extractor:
    return Extractor(
        extractor_version=extractor_version,
        allowlist=allowlist or make_allowlist(),
        downloader=downloader or FakeDownloader(),
        blob_store=blob_store or FakeBlobStore(),
        probe=probe or FakeProbe(),
        transcriber=transcriber or FakeTranscriber(),
        scene_detector=scene_detector or FakeSceneDetector(),
        frame_extractor=frame_extractor or FakeFrameExtractor(),
        ocr=ocr or FakeOcr(),
        signal_extractor=signal_extractor or FakeSignalExtractor(),
        hook_window_ms=hook_window_ms,
    )


@dataclass
class FakeFeatureRecordStore:
    """In-memory artefact store for the de-identification job."""

    records: dict[UUID, FeatureRecord] = field(default_factory=dict)
    deidentified: dict[UUID, DeidentifiedRecord] = field(default_factory=dict)

    def add(self, record: FeatureRecord) -> None:
        self.records[record.id] = record

    def get(self, record_id: UUID) -> FeatureRecord | None:
        return self.records.get(record_id)

    def list_ids(self) -> tuple[UUID, ...]:
        return tuple(self.records)

    def replace_with_deidentified(self, deidentified: DeidentifiedRecord) -> None:
        self.records.pop(deidentified.id, None)
        self.deidentified[deidentified.id] = deidentified
