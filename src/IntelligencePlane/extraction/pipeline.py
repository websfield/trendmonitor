"""The extraction pipeline: one URI in, one versioned ``FeatureRecord`` out (REQ-001).

*"Ingest a post by URI -> structured feature record ... without a human transcribing or watching
it."* The stages run in order — acquire, probe, transcript, frames, cuts, OCR, signals — and the
record is assembled only at the end. Nothing partial is persisted: any stage that fails
(unreachable media, unsupported codec) raises, the caller sees no record and degrades to
``NEEDS_REVIEW``. The ports are injected so a unit test needs no network and no binary.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from extraction.acquire import Allowlist, acquire
from extraction.cuts import cut_cadence, detect_cuts
from extraction.frames import (
    DEFAULT_HOOK_WINDOW_MS,
    clamp_hook_window,
    extract_frames,
    plan_frame_timestamps,
)
from extraction.model import FeatureRecord, SourceKind
from extraction.ocr import run_ocr
from extraction.ports import (
    IBlobStore,
    IFrameExtractor,
    IMediaDownloader,
    IMediaProbe,
    IOcr,
    ISceneDetector,
    ISignalExtractor,
    ITranscriber,
)
from extraction.probe import compute_degradation, probe_media
from extraction.signals import (
    authenticity_signals,
    disclosure_signals,
    first_frame_features,
)
from extraction.transcript import transcribe

__all__ = ["Extractor"]


@dataclass(frozen=True, slots=True)
class Extractor:
    """Holds the injected tools and the ``extractor_version`` stamp. One instance per version.

    ``extractor_version`` stamps every record it produces; features are comparable only within a
    version, so binding the version to the extractor makes a silent cross-version mix impossible.
    """

    extractor_version: str
    allowlist: Allowlist
    downloader: IMediaDownloader
    blob_store: IBlobStore
    probe: IMediaProbe
    transcriber: ITranscriber
    scene_detector: ISceneDetector
    frame_extractor: IFrameExtractor
    ocr: IOcr
    signal_extractor: ISignalExtractor
    hook_window_ms: int = DEFAULT_HOOK_WINDOW_MS

    def extract(
        self,
        uri: str,
        source_kind: SourceKind,
        *,
        record_id: UUID | None = None,
        now: datetime | None = None,
    ) -> FeatureRecord:
        derived_at = now or datetime.now(UTC)

        # 1. Acquire — raises SourceNotAllowlistedError / MediaUnreachableError (no record).
        media = acquire(
            uri,
            source_kind,
            allowlist=self.allowlist,
            downloader=self.downloader,
            blob_store=self.blob_store,
        )

        # 2. Probe — raises UnsupportedCodecError (no partial record persisted).
        probe = probe_media(media, self.probe)

        # 3. Transcript — native first, Whisper fallback, source recorded.
        transcript = transcribe(media, self.transcriber, audio_present=probe.audio_present)

        # 4. REQ-018 degradation flags from audio + transcript availability.
        degradation = compute_degradation(
            audio_present=probe.audio_present, transcript_source=transcript.source
        )

        # 5. Scene detection -> cut cadence (+ confidence).
        scene = detect_cuts(media, self.scene_detector, duration_ms=probe.duration_ms)
        cadence = cut_cadence(scene, duration_ms=probe.duration_ms)

        # 6. Frames — true first frame + >= 3 inside the (clamped) hook window.
        effective_hook_window = clamp_hook_window(self.hook_window_ms, probe.duration_ms)
        timestamps = plan_frame_timestamps(
            probe.duration_ms, effective_hook_window, cadence.cut_timestamps_ms
        )
        frames = extract_frames(media, timestamps, self.frame_extractor)

        # 7. OCR — 3-band contrast, safe-zone; a failed frame flips onscreen_text_complete.
        ocr_outcome = run_ocr(media, timestamps, self.ocr)

        # 8. First-frame / disclosure / authenticity signals.
        signal = self.signal_extractor.extract(media, probe)

        return FeatureRecord(
            id=record_id or uuid4(),
            source_kind=source_kind,
            extractor_version=self.extractor_version,
            media_sha256=media.media_sha256,
            media_duration_ms=probe.duration_ms,
            audio_present=probe.audio_present,
            transcript=transcript.text,
            transcript_source=transcript.source,
            frames=frames,
            hook_window_ms=effective_hook_window,
            onscreen_text=ocr_outcome.onscreen_text,
            onscreen_text_complete=ocr_outcome.complete,
            cut_timestamps_ms=cadence.cut_timestamps_ms,
            cut_cadence_per_sec=cadence.cadence_per_sec,
            cut_confidence=cadence.confidence,
            first_frame_features=first_frame_features(signal),
            disclosure_signals=disclosure_signals(signal),
            authenticity_signals=authenticity_signals(
                signal, audio_present=probe.audio_present
            ),
            degradation=degradation,
            derived_at=derived_at,
            no_redistribute=media.no_redistribute,
        )
