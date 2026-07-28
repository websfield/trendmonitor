"""P8-T1 — the exemplar corpus builder (C1 §1.5).

Two sets are retained per cohort, both extracted under the **same ``extractor_version``**:

* the **top-decile** posts — each creator's own best, ranked against that creator's own
  engagement (the exemplar corpus proper); and
* the **contrast set** — the *same creators'* posts that did **not** reach their own top decile.

*"Same creators controls for audience; same platform controls for format norms; nothing controls
for the content nobody made."* (mechanisms-v1.json, ``contrast_set_definition``.)

**Provenance discipline (ADR-0001).** Top-decile membership is decided using ``Proxy`` public
engagement reads — that is *selection*, not aggregation. The engagement value never enters an
effect-size calculation and is never displayed as ``Measured``. Ranking is deterministic (ties
broken by post id); no missing engagement is ever imputed. The prevalence a mechanism reports is
a **count over this proxy-selected set**, evaluated deterministically over the ``FeatureRecord``.

**Live ingestion is blocked (D5).** Real live-source ingestion waits on the source-allowlist legal
review; :func:`ingest_live` refuses unless the allowlist is ratified. Tests and the synthesiser run
on :func:`fixture_exemplar_corpus`.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from enum import StrEnum
from math import ceil
from uuid import UUID, uuid4

from extraction.model import (
    AuthenticitySignals,
    CompositionKind,
    ConfidenceBand,
    DisclosureSignals,
    FeatureRecord,
    FirstFrameFeatures,
    LightingKind,
    SourceKind,
    TranscriptSource,
)
from extraction.untrusted import Untrusted
from substrate.provenance import Provenance, Provenanced

__all__ = [
    "CONTRAST_SET_DEFINITION_V1",
    "Cohort",
    "ContrastSet",
    "CreatorSampling",
    "ExemplarCorpus",
    "ExemplarPost",
    "IngestionArm",
    "LiveIngestionBlocked",
    "SourceAllowlist",
    "build_exemplar_corpus",
    "fixture_exemplar_corpus",
    "ingest_live",
    "occasion_exemplar",
]

CONTRAST_SET_DEFINITION_V1 = (
    "the same creators' posts that did NOT reach their own top decile, extracted and retained "
    "alongside the top-decile corpus under the same extractor_version (C1 §1.5)"
)


class IngestionArm(StrEnum):
    """Which exemplar-*ingestion* policy surfaced a post. **Not** the amplification ``arm``.

    The amplification ``arm`` (exploit|explore) governs client spend and never appears on a
    Mechanism (mechanisms-v1.json, ``ingestion_arm_is_not_the_amplification_arm``). This field
    governs corpus-ingestion effort and is the REQ-005f coupling-gate stratifier. The two names
    must never converge.
    """

    TREND_DIRECTED = "trend_directed"
    UNIFORM = "uniform"
    MIXED = "mixed"


@dataclass(frozen=True, slots=True)
class Cohort:
    """A ``(vertical, platform)`` pair. **There is no tenant axis** (REQ-060)."""

    vertical: str
    platform: str

    @property
    def key(self) -> str:
        return f"{self.vertical}.{self.platform}"


@dataclass(frozen=True, slots=True)
class ExemplarPost:
    """One public post in the exemplar corpus.

    ``engagement`` is ``Proxy`` **by construction** (ADR-0001, Tier 3) — it is used only to *select*
    the top decile, never aggregated into a magnitude. ``captured_at`` is the public post date
    (tenant-neutral metadata), used to cut temporally disjoint slices. If the source post is deleted
    after the snapshot, ``unresolvable`` marks the dead URI while the counts — computed at the
    snapshot — survive.
    """

    id: UUID
    creator_id: UUID
    uri: str
    feature_record: FeatureRecord
    engagement: Provenanced[float]
    ingestion_arm: IngestionArm
    captured_at: date
    occasioned_by_trend_ids: tuple[UUID, ...] = ()
    unresolvable: bool = False

    def __post_init__(self) -> None:
        if self.engagement.provenance is not Provenance.PROXY:
            raise ValueError(
                "An exemplar's engagement is Proxy by construction (ADR-0001, Tier 3): every "
                "keyless public read is Proxy. Top-decile membership is a proxy-SELECTED set; the "
                "value must never be aggregated as Measured."
            )


@dataclass(frozen=True, slots=True)
class CreatorSampling:
    """Per-creator recorded sampling: how many of a creator's posts landed in each set."""

    creator_id: UUID
    n_top_decile: int
    n_contrast: int


@dataclass(frozen=True, slots=True)
class ExemplarCorpus:
    """The retained top-decile set for one cohort, under one ``extractor_version``."""

    cohort: Cohort
    extractor_version: str
    posts: tuple[ExemplarPost, ...]
    window: tuple[date, date]
    sampling: tuple[CreatorSampling, ...]


@dataclass(frozen=True, slots=True)
class ContrastSet:
    """The retained below-decile set — the same creators, same ``extractor_version`` (REQ-065b)."""

    cohort: Cohort
    extractor_version: str
    posts: tuple[ExemplarPost, ...]
    sampling: tuple[CreatorSampling, ...]


class LiveIngestionBlocked(RuntimeError):
    """Live-source ingestion is blocked pending the source-allowlist legal review (D5)."""


@dataclass(frozen=True, slots=True)
class SourceAllowlist:
    """The allowlist config gating live ingestion. Fixtures do not need it; live reads do."""

    sources: tuple[str, ...] = ()
    ratified: bool = False


def ingest_live(source: str, allowlist: SourceAllowlist) -> list[ExemplarPost]:
    """Refuse live ingestion until the allowlist is ratified (D5). Use fixtures meanwhile."""
    if not allowlist.ratified or source not in allowlist.sources:
        raise LiveIngestionBlocked(
            f"Live ingestion of {source!r} is blocked pending the source-allowlist legal review "
            "(D5). Build from fixture_exemplar_corpus() until the allowlist is ratified."
        )
    raise LiveIngestionBlocked(
        "Live ingestion is not implemented in Phase 8; the allowlist gate is the point."
    )


def occasion_exemplar(post: ExemplarPost, trend_ids: Iterable[UUID]) -> ExemplarPost:
    """Production ingestion tag (Phase 8 R2): mark an exemplar ingested **because** specific
    rising+go trends directed the corpus at its format — ``ingestion_arm = TREND_DIRECTED`` and
    ``occasioned_by_trend_ids = (…)``. Empty ``trend_ids`` leaves the post untouched (it was not
    trend-directed). This is the real ingestion path, not the fixture's hardcoded ``_post``.

    Uses :func:`dataclasses.replace`, so ``ExemplarPost.__post_init__`` re-validates the Proxy
    engagement invariant. It does **not** touch the amplification ``arm`` (``IngestionArm`` is a
    separate axis — mechanisms-v1.json ``ingestion_arm_is_not_the_amplification_arm``) and does
    **not** unblock D5 — :func:`ingest_live` still raises ``LiveIngestionBlocked``.

    **Caller contract (tenancy):** this low-level tagger has no scope guard of its own — it stamps
    whatever ``trend_ids`` it is handed. The only trend id it may ever receive is a **public**-scope
    ``TrendDirection.trend_id`` from :func:`detector.coupling.apply_trend_direction` (which refuses
    internal-scope signals). When the production ingestion path is wired (a future phase), that seam
    must assert the same, so the shared-corpus tenant boundary (REQ-060, CLAUDE.md rule 8) is never
    carried by an upstream caller alone.
    """
    ids = tuple(dict.fromkeys(trend_ids))  # dedupe, preserve first-seen order
    if not ids:
        return post
    return replace(
        post, ingestion_arm=IngestionArm.TREND_DIRECTED, occasioned_by_trend_ids=ids
    )


def build_exemplar_corpus(
    posts: list[ExemplarPost],
    cohort: Cohort,
    *,
    extractor_version: str,
) -> tuple[ExemplarCorpus, ContrastSet]:
    """Split each creator's posts into their own top decile and the contrast remainder.

    Ranked **against each creator's own** engagement (a proxy-selected split, never pooled across
    creators). Both sets carry the same ``extractor_version`` — a version bump triggers a backfill
    or cohort split, never a silent mix (REQ-065b). Sampling is recorded per creator.
    """
    for p in posts:
        if p.feature_record.extractor_version != extractor_version:
            raise ValueError(
                f"Exemplar {p.id} was extracted under {p.feature_record.extractor_version!r}, not "
                f"{extractor_version!r}. Both corpus sets must share one extractor_version "
                "(REQ-065b); a version bump is a backfill or a cohort split, never a silent mix."
            )

    by_creator: dict[UUID, list[ExemplarPost]] = {}
    for p in posts:
        by_creator.setdefault(p.creator_id, []).append(p)

    top: list[ExemplarPost] = []
    contrast: list[ExemplarPost] = []
    sampling: list[CreatorSampling] = []

    for creator_id, cposts in by_creator.items():
        # Rank by the creator's OWN proxy engagement; ties broken deterministically by post id.
        ranked = sorted(cposts, key=lambda p: (p.engagement.value, str(p.id)), reverse=True)
        k = max(1, ceil(0.1 * len(ranked)))
        td, cs = ranked[:k], ranked[k:]
        top.extend(td)
        contrast.extend(cs)
        sampling.append(CreatorSampling(creator_id, len(td), len(cs)))

    dates = [p.captured_at for p in posts]
    window = (min(dates), max(dates)) if dates else (date.today(), date.today())
    sampling_t = tuple(sorted(sampling, key=lambda s: str(s.creator_id)))

    return (
        ExemplarCorpus(cohort, extractor_version, tuple(top), window, sampling_t),
        ContrastSet(cohort, extractor_version, tuple(contrast), sampling_t),
    )


# --- Fixture corpus (D5: live ingestion blocked) -------------------------------------------

EXTRACTOR_VERSION_FIXTURE = "extractor-3.2.0"


def _feature_record(
    *,
    face_present: bool,
    lighting: LightingKind,
    duration_ms: int,
    cut_cadence: float,
    ambient_audio: bool = True,
    filler_word_rate: float = 0.02,
    audio_complete: bool = True,
) -> FeatureRecord:
    return FeatureRecord(
        id=uuid4(),
        source_kind=SourceKind.EXEMPLAR,
        extractor_version=EXTRACTOR_VERSION_FIXTURE,
        media_sha256=uuid4().hex,
        media_duration_ms=duration_ms,
        audio_present=ambient_audio,
        transcript=Untrusted("a first-person problem statement to camera"),
        transcript_source=TranscriptSource.WHISPER,
        frames=(),
        hook_window_ms=1200,
        onscreen_text=(),
        onscreen_text_complete=True,
        cut_timestamps_ms=(),
        cut_cadence_per_sec=cut_cadence,
        cut_confidence=ConfidenceBand.HIGH,
        first_frame_features=FirstFrameFeatures(
            face_present=face_present,
            face_scale=0.4 if face_present else 0.0,
            composition=CompositionKind.CENTERED,
            clutter_index=0.2,
        ),
        disclosure_signals=DisclosureSignals(),
        authenticity_signals=AuthenticitySignals(
            handheld_motion=0.3,
            ambient_audio=ambient_audio,
            filler_word_rate=filler_word_rate,
            lighting_kind=lighting,
            audio_signals_complete=audio_complete,
        ),
        degradation=(),
        derived_at=datetime(2026, 3, 1, tzinfo=UTC),
    )


def _post(
    *,
    creator_id: UUID,
    engagement: float,
    face_present: bool,
    ingestion_arm: IngestionArm,
    captured_at: date,
    trend_id: UUID,
    duration_ms: int = 12000,
    cut_cadence: float = 1.4,
    lighting: LightingKind = LightingKind.NATURAL,
) -> ExemplarPost:
    return ExemplarPost(
        id=uuid4(),
        creator_id=creator_id,
        uri=f"https://example.test/p/{uuid4().hex}",
        feature_record=_feature_record(
            face_present=face_present,
            lighting=lighting,
            duration_ms=duration_ms,
            cut_cadence=cut_cadence,
        ),
        engagement=Provenanced(engagement, Provenance.PROXY, datetime(2026, 3, 1, tzinfo=UTC)),
        ingestion_arm=ingestion_arm,
        captured_at=captured_at,
        occasioned_by_trend_ids=(trend_id,),
    )


def fixture_exemplar_corpus(
    cohort: Cohort | None = None,
) -> tuple[ExemplarCorpus, ContrastSet, tuple[UUID, UUID]]:
    """A deterministic fixture corpus: 10 creators, two unrelated trends, two temporal windows.

    The face-in-first-frame structure is dense in each creator's top post and sparse below it, so
    the synthesiser can reach ``contrasted``. Returns the two trend ids so a caller can wire
    matching ``TrendSignal``s. Live ingestion stays blocked (D5).
    """
    cohort = cohort or Cohort("beauty", "tiktok")
    trend_a, trend_b = uuid4(), uuid4()
    early, late = date(2026, 1, 15), date(2026, 3, 15)
    posts: list[ExemplarPost] = []

    # 20 posts per creator so the top decile (ceil(0.1 * 20) = 2) holds BOTH winners — one per
    # temporal window — which is what lets the face-in-first-frame structure reach `contrasted`.
    for i in range(10):
        creator = uuid4()
        trend = trend_a if i % 2 == 0 else trend_b
        arm = IngestionArm.TREND_DIRECTED if i % 2 == 0 else IngestionArm.UNIFORM
        # Two winners (one per temporal window), face present, clearly highest engagement.
        for slot, when in enumerate((early, late)):
            posts.append(
                _post(
                    creator_id=creator,
                    engagement=100.0 + slot,
                    face_present=True,
                    ingestion_arm=arm,
                    captured_at=when,
                    trend_id=trend,
                )
            )
        # Eighteen non-winners. Two carry a face (one per window) so the contrast prevalence is
        # small but non-zero in BOTH slices; the rest have none. This keeps the asymmetry high
        # without driving a slice's contrast prevalence to an undefined zero.
        for j in range(18):
            posts.append(
                _post(
                    creator_id=creator,
                    engagement=10.0 + j,
                    face_present=(j in (0, 1)),
                    ingestion_arm=arm,
                    captured_at=early if j % 2 == 0 else late,
                    trend_id=trend,
                )
            )

    corpus, contrast = build_exemplar_corpus(
        posts, cohort, extractor_version=EXTRACTOR_VERSION_FIXTURE
    )
    return corpus, contrast, (trend_a, trend_b)
