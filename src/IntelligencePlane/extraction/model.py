"""The ``FeatureRecord`` and every type it is built from.

*"An exemplar post scraped from TikTok and a creator submission uploaded to ClientHub produce
the same shape."* That symmetry is why extraction is one shared, versioned service, and it is the
reason this data model has one ``FeatureRecord`` type rather than two.

Two invariants live in this module:

* **Features are comparable only within an ``extractor_version``.** :func:`require_comparable`
  and :meth:`FeatureRecord.diff` raise across versions — a version bump triggers a backfill or a
  cohort split, never a silent mix.
* **Absence is not proof.** ``onscreen_text_complete=False`` means OCR did not finish, so the
  absence of a disclosure signal proves nothing and a disclosure veto cannot pass on it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from extraction.untrusted import Untrusted

if TYPE_CHECKING:
    from collections.abc import Mapping

__all__ = [
    "AudioDependentCriterion",
    "AuthenticitySignals",
    "BoundingBox",
    "CompositionKind",
    "ConfidenceBand",
    "ContrastBand",
    "CrossVersionComparisonError",
    "DegradationFlag",
    "DeidentifiedRecord",
    "DisclosureSignals",
    "FeatureRecord",
    "FirstFrameFeatures",
    "Frame",
    "LightingKind",
    "OnscreenText",
    "SourceKind",
    "TranscriptSource",
    "require_comparable",
]


class SourceKind(StrEnum):
    """Where the media came from. All three produce the same ``FeatureRecord`` shape."""

    EXEMPLAR = "exemplar"
    SUBMISSION = "submission"
    LIVE_POST = "live_post"


class TranscriptSource(StrEnum):
    """*Which* transcript, recorded — a Whisper transcript of a noisy handheld clip has a
    different error profile than platform captions, and emotional specificity reads the opening
    line."""

    NATIVE_CAPTIONS = "native_captions"
    WHISPER = "whisper"
    NONE = "none"


class ContrastBand(StrEnum):
    """On-screen-text contrast in three coarse bands. Not a float — the tech spec says a precise
    claim will not survive, and a spurious-precision measure invites a spurious-precision veto."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ConfidenceBand(StrEnum):
    """How much to trust a derived signal. Scene detection on compressed vertical mobile video is
    an open question, so ``cut_cadence_per_sec`` carries one of these; ``LOW`` is surfaced, never
    silently scored from noise."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CompositionKind(StrEnum):
    CENTERED = "centered"
    RULE_OF_THIRDS = "rule_of_thirds"
    OFF_CENTER = "off_center"
    UNKNOWN = "unknown"


class LightingKind(StrEnum):
    """Part of the friction-over-polish register: ``natural`` and ``mixed`` are captured as
    first-class so a production-quality-biased scorer cannot quietly penalise them."""

    NATURAL = "natural"
    ARTIFICIAL = "artificial"
    MIXED = "mixed"
    UNKNOWN = "unknown"


class AudioDependentCriterion(StrEnum):
    """REQ-018. The three criteria that read audio; each is flagged degraded when audio or a
    usable transcript is missing."""

    HOOK_STRENGTH = "hook_strength"
    EMOTIONAL_SPECIFICITY = "emotional_specificity"
    COMPLETION_LIKELIHOOD = "completion_likelihood"


class CrossVersionComparisonError(RuntimeError):
    """Raised when two ``FeatureRecord``s from different ``extractor_version``s are compared.

    *"Features from different extractor versions are never compared, and a version bump triggers a
    backfill or a cohort split, never a silent mix."* This makes that a runtime error rather than
    a convention a reviewer must catch.
    """


@dataclass(frozen=True, slots=True)
class BoundingBox:
    """Normalised [0, 1] box for an on-screen-text region."""

    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True, slots=True)
class Frame:
    ts_ms: int
    blob_uri: str
    is_first_frame: bool = False


@dataclass(frozen=True, slots=True)
class OnscreenText:
    """One OCR hit. ``text`` is :class:`Untrusted` — a caption can carry a prompt injection."""

    ts_ms: int
    text: Untrusted[str]
    bbox: BoundingBox
    contrast_band: ContrastBand
    in_safe_zone: bool


@dataclass(frozen=True, slots=True)
class FirstFrameFeatures:
    face_present: bool
    face_scale: float
    composition: CompositionKind
    clutter_index: float


@dataclass(frozen=True, slots=True)
class DisclosureSignals:
    """Signals a V1/V5 disclosure check reads. Emptiness is only meaningful when
    ``onscreen_text_complete`` is True on the owning record."""

    onscreen_tag: tuple[str, ...] = ()
    caption_tag: tuple[str, ...] = ()
    spoken_disclosure_ts_ms: int | None = None


@dataclass(frozen=True, slots=True)
class AuthenticitySignals:
    """The friction-over-polish register, captured as first-class features *precisely because* a
    production-quality-biased scorer would penalise them. ``filler_word_rate`` survives
    de-identification because it is a derived scalar, not personal content.

    ``filler_word_rate`` is *audio-derived* and one of the two scalars that survive into Phase 8
    mechanism-prevalence counts, so it carries ``audio_signals_complete`` — the audio analogue of
    ``FeatureRecord.onscreen_text_complete``. When it is False (no audio track, or the audio
    analysis did not run), a ``filler_word_rate`` of ``0.0`` is *unmeasured*, not "no filler words
    present": a prevalence count must exclude it, exactly as V1 cannot pass on absent OCR. Without
    this marker a no-audio ``0.0`` would be indistinguishable from a real measured zero."""

    handheld_motion: float
    ambient_audio: bool
    filler_word_rate: float
    lighting_kind: LightingKind
    audio_signals_complete: bool


@dataclass(frozen=True, slots=True)
class DegradationFlag:
    """REQ-018 in one record. When set, the criterion is *still scored* — a degraded low hook
    score is still a low hook score, and the hook hard gate still applies — but its confidence
    band is widened by ``band_widen_factor`` and the reason is recorded, not hidden."""

    criterion: AudioDependentCriterion
    degraded: bool
    reason: str
    band_widen_factor: float
    is_hard_gate: bool

    def __post_init__(self) -> None:
        if self.degraded and self.band_widen_factor <= 1.0:
            raise ValueError(
                "A degraded criterion must widen its confidence band (band_widen_factor > 1.0); "
                "REQ-018 requires the band to widen, not merely a flag to flip."
            )


@dataclass(frozen=True, slots=True)
class FeatureRecord:
    """The one artefact extraction produces, stamped ``extractor_version``.

    Content-addressed by ``(media_sha256, extractor_version)`` (Migration Steps: no relational
    entity). Consumed by P1 (V1/V5), P3 (VPS), P6 (miner), and P8 (synthesiser prevalence).

    **Provenance boundary.** These fields are *structural* features of the media (durations, cut
    cadence, contrast bands) — equally valid for an exemplar and a submission, which is what lets
    one shared pipeline serve both corpora. They are NOT wrapped in ``substrate.provenance``'s
    ``Provenanced``/``MeasuredOutcome``: that barrier governs *outcome* metrics (engagement, which
    is ``Proxy`` on exemplars) and attaches later, at the outcome join in the miner/estimator
    (Phase 3/6) — an exemplar's engagement must be wrapped ``Proxy`` there and can never reach an
    effect size (ADR-0001). Reliability *here* is carried per-feature instead
    (``onscreen_text_complete``, ``cut_confidence``, ``degradation``,
    ``authenticity_signals.audio_signals_complete``). Do not join ``Proxy`` engagement onto this
    record without wrapping it; do not read a per-feature reliability flag as provenance.
    """

    id: UUID
    source_kind: SourceKind
    extractor_version: str
    media_sha256: str
    media_duration_ms: int
    audio_present: bool
    transcript: Untrusted[str]
    transcript_source: TranscriptSource
    frames: tuple[Frame, ...]
    hook_window_ms: int
    onscreen_text: tuple[OnscreenText, ...]
    onscreen_text_complete: bool
    cut_timestamps_ms: tuple[int, ...]
    cut_cadence_per_sec: float
    cut_confidence: ConfidenceBand
    first_frame_features: FirstFrameFeatures
    disclosure_signals: DisclosureSignals
    authenticity_signals: AuthenticitySignals
    degradation: tuple[DegradationFlag, ...]
    derived_at: datetime
    no_redistribute: bool = False

    def degradation_for(self, criterion: AudioDependentCriterion) -> DegradationFlag | None:
        for flag in self.degradation:
            if flag.criterion is criterion:
                return flag
        return None

    @property
    def hook_frames(self) -> tuple[Frame, ...]:
        """Frames sampled inside the hook window — the ones that carry the hard gate."""
        return tuple(f for f in self.frames if f.ts_ms < self.hook_window_ms)

    def diff(self, other: FeatureRecord) -> Mapping[str, tuple[object, object]]:
        """Compare two records field-by-field — but *only* within one ``extractor_version``.

        Raises :class:`CrossVersionComparisonError` otherwise. This is the comparison the
        anti-pattern forbids across versions, made into a guarded operation.
        """
        require_comparable(self, other)
        deltas: dict[str, tuple[object, object]] = {}
        for name in ("media_duration_ms", "audio_present", "cut_cadence_per_sec", "cut_confidence"):
            a, b = getattr(self, name), getattr(other, name)
            if a != b:
                deltas[name] = (a, b)
        return deltas


def require_comparable(a: FeatureRecord, b: FeatureRecord) -> None:
    """Guard every cross-record feature comparison. Raises across ``extractor_version``s."""
    if a.extractor_version != b.extractor_version:
        raise CrossVersionComparisonError(
            f"Refusing to compare features across extractor versions "
            f"({a.extractor_version!r} vs {b.extractor_version!r}). A version bump triggers a "
            "backfill or a cohort split, never a silent mix."
        )


@dataclass(frozen=True, slots=True)
class DeidentifiedRecord:
    """What survives de-identification: the derived scalars, none of the personal content.

    APP 11 / compliance-notes: after the rights window, frames and the transcript are dropped and
    only tenant-neutral derived scalars remain. ``cut_cadence_per_sec`` and ``filler_word_rate``
    are the two the plan names explicitly; both are structural, neither is content.
    """

    id: UUID
    extractor_version: str
    media_sha256: str
    media_duration_ms: int
    cut_cadence_per_sec: float
    cut_confidence: ConfidenceBand
    filler_word_rate: float
    audio_signals_complete: bool
    """Travels with ``filler_word_rate`` so a Phase 8 prevalence count over de-identified records
    can exclude audio-absent values. Without it, a no-audio ``filler_word_rate`` of ``0.0`` would
    be pooled as a measured zero — the same absence-as-evidence failure ``onscreen_text_complete``
    guards against for OCR."""
    no_redistribute: bool
    derived_at: datetime
    deidentified_at: datetime
    # These fields are gone by construction; kept as a positive assertion of the drop.
    frames: tuple[Frame, ...] = field(default=())
    transcript: None = None
