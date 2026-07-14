"""Contract E — ``synthesise()``: the tenant-neutrality guarantee **is** the signature (REQ-061).

    def synthesise(cohort, exemplar_corpus, contrast_set, trends) -> list[Mechanism]

There is **no parameter** through which an ``OutcomeEvent``, a ``Pattern``, a
``PerformanceSnapshot``, a ``Submission``, or a ``tenant_id`` could arrive. That absence is the
guarantee — by construction, not by a scoping check. The synthesiser proposes its **own** predicates
over the exemplar corpus alone; it never consumes a pattern-miner proposal (ADR-0007).

The flow keeps the disciplines structural:

1. propose predicates over the exemplar corpus alone (P8-T2);
2. **draft the statement + falsifier first** — the falsifier is fixed before any evidence is
   counted (REQ-063);
3. count prevalence over the proxy-selected top-decile and the contrast set, on two temporally
   disjoint slices (P8-T3);
4. compute the warrant deterministically from counts (P8-T4).

Also here: the **recalibration metric** (fraction of proposed predicates reaching ``contrasted`` —
if a majority do in year one, the bar is too low) and the **``ingestion_arm``-stratified
contrasted-rate** (the REQ-005f coupling gate). Reported, never silent.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

from c1_pattern_engine.corpora.exemplar import (
    CONTRAST_SET_DEFINITION_V1,
    Cohort,
    ContrastSet,
    ExemplarCorpus,
    ExemplarPost,
    IngestionArm,
)
from c1_pattern_engine.detector.signals import TrendSignal
from c1_pattern_engine.synthesiser.mechanism import Mechanism
from c1_pattern_engine.synthesiser.prevalence import compute_prevalence
from c1_pattern_engine.synthesiser.propose import FeaturePredicate, propose_predicates
from c1_pattern_engine.synthesiser.statement import (
    MechanismConjecture,
    MechanismDraftClient,
    OfflineDraftClient,
)
from c1_pattern_engine.synthesiser.warrant import (
    Evidence,
    TemporalSlice,
    Warrant,
    compute_warrant,
)

__all__ = [
    "RecalibrationMetric",
    "ingestion_arm_report",
    "recalibration_metric",
    "synthesise",
]

Proposer = Callable[[ExemplarCorpus], Sequence[FeaturePredicate]]


def _satisfying_top_posts(
    predicate: FeaturePredicate, corpus: ExemplarCorpus
) -> list[ExemplarPost]:
    return [
        p
        for p in corpus.posts
        if predicate.evaluable(p.feature_record) and predicate.satisfied(p.feature_record)
    ]


def _ingestion_arm_of(posts: Sequence[ExemplarPost]) -> IngestionArm:
    arms = {p.ingestion_arm for p in posts}
    if len(arms) == 1:
        return next(iter(arms))
    return IngestionArm.MIXED


def _trend_group_count(
    posts: Sequence[ExemplarPost], related_trend_groups: Mapping[UUID, str] | None
) -> int:
    """Count **unrelated** trends carrying the predicate — grouped ids collapse to one."""
    groups: set[str] = set()
    for post in posts:
        for trend_id in post.occasioned_by_trend_ids:
            if related_trend_groups is not None and trend_id in related_trend_groups:
                groups.add(related_trend_groups[trend_id])
            else:
                groups.add(str(trend_id))
    return len(groups)


def _slice_boundary(posts: Sequence[ExemplarPost]) -> date | None:
    """The date that splits the corpus into two non-empty, temporally disjoint halves, or None."""
    unique = sorted({p.captured_at for p in posts})
    if len(unique) < 2:
        return None
    return unique[len(unique) // 2]


def _temporal_slices(
    predicate: FeaturePredicate,
    top: Sequence[ExemplarPost],
    contrast: Sequence[ExemplarPost],
    window: tuple[date, date],
    overall_ratio: float | None,
) -> tuple[tuple[TemporalSlice, ...], float | None, float | None]:
    """Build ordered disjoint slices; return ``(slices, mining_ratio, disjoint_ratio)``.

    Mined on slice 1 (the earlier window), confirmed on slice 2 (the later, disjoint window). With
    too few distinct dates to cut two windows, a single whole-window slice is returned and the
    per-slice ratios are ``None`` (so the mechanism cannot reach ``contrasted``).
    """
    boundary = _slice_boundary(list(top) + list(contrast))
    if boundary is None:
        single = TemporalSlice(window[0], window[1], overall_ratio)
        return (single,), None, None

    early_top = [p for p in top if p.captured_at < boundary]
    late_top = [p for p in top if p.captured_at >= boundary]
    early_con = [p for p in contrast if p.captured_at < boundary]
    late_con = [p for p in contrast if p.captured_at >= boundary]

    early = compute_prevalence(predicate, early_top, early_con)
    late = compute_prevalence(predicate, late_top, late_con)

    early_dates = [p.captured_at for p in early_top + early_con] or [window[0]]
    late_dates = [p.captured_at for p in late_top + late_con] or [window[1]]
    slices = (
        TemporalSlice(min(early_dates), max(early_dates), early.prevalence_ratio),
        TemporalSlice(min(late_dates), max(late_dates), late.prevalence_ratio),
    )
    return slices, early.prevalence_ratio, late.prevalence_ratio


def synthesise(
    cohort: Cohort,
    exemplar_corpus: ExemplarCorpus,
    contrast_set: ContrastSet,
    trends: Sequence[TrendSignal],
    *,
    draft_client: MechanismDraftClient | None = None,
    proposer: Proposer = propose_predicates,
    cross_cohort_recurrence: Mapping[str, int] | None = None,
    related_trend_groups: Mapping[UUID, str] | None = None,
    now: datetime | None = None,
) -> list[Mechanism]:
    """Synthesise mechanisms for one cohort from the exemplar corpus, contrast set, and trends.

    The four positional parameters are the whole of Contract E. The keyword-only extras carry the
    drafting client, the independent proposer, and pure **recurrence counts** — none of them an
    ``OutcomeEvent``, a ``Pattern``, a ``PerformanceSnapshot``, or a ``tenant_id``. Returns
    **unratified** mechanisms; a human ratifies before any rung is served (P8-T6).
    """
    client = draft_client or OfflineDraftClient()
    now = now or datetime.now(UTC)
    valid_from = now.date()
    valid_to = (now + timedelta(days=365)).date()

    mechanisms: list[Mechanism] = []
    for predicate in proposer(exemplar_corpus):
        satisfying = _satisfying_top_posts(predicate, exemplar_corpus)
        if not satisfying:
            continue

        # Step 2: draft the statement + falsifier BEFORE any evidence is counted (REQ-063).
        drafted = client.draft(predicate, satisfying)
        conjecture = MechanismConjecture(
            predicate=predicate, statement=drafted.statement, falsifier=drafted.falsifier
        )

        # Step 3: count prevalence over the proxy-selected sets.
        overall = compute_prevalence(predicate, exemplar_corpus.posts, contrast_set.posts)
        slices, mining_ratio, disjoint_ratio = _temporal_slices(
            predicate,
            exemplar_corpus.posts,
            contrast_set.posts,
            exemplar_corpus.window,
            overall.prevalence_ratio,
        )

        n_creators = len({p.creator_id for p in satisfying})
        n_cohorts = 1 + (
            cross_cohort_recurrence.get(predicate.id, 0) if cross_cohort_recurrence else 0
        )
        n_trends = _trend_group_count(satisfying, related_trend_groups)

        # Step 4: the warrant, deterministic from counts.
        warrant = compute_warrant(
            n_creators=n_creators,
            n_cohorts=n_cohorts,
            n_trends=n_trends,
            prevalence_ratio=overall.prevalence_ratio,
            mining_slice_ratio=mining_ratio,
            disjoint_slice_ratio=disjoint_ratio,
            temporal_slices=slices,
        )

        evidence = Evidence(
            n_exemplars=len(satisfying),
            n_creators=n_creators,
            n_cohorts=n_cohorts,
            n_trends=n_trends,
            prevalence_in_top_decile=overall.prevalence_in_top_decile,
            prevalence_in_contrast_set=overall.prevalence_in_contrast_set,
            prevalence_ratio=overall.prevalence_ratio,
            temporal_slices=slices,
            contrast_set_definition=CONTRAST_SET_DEFINITION_V1,
        )

        occasioned = sorted(
            {t for p in satisfying for t in p.occasioned_by_trend_ids}, key=str
        )
        mechanisms.append(
            Mechanism(
                id=uuid4(),
                statement=conjecture.statement,
                feature_predicate=predicate,
                falsifier=conjecture.falsifier,
                warrant=warrant,
                evidence=evidence,
                ingestion_arm=_ingestion_arm_of(satisfying),
                valid_from=valid_from,
                valid_to=valid_to,
                occasioned_by_trend_ids=tuple(occasioned),
            )
        )

    return mechanisms


@dataclass(frozen=True, slots=True)
class RecalibrationMetric:
    """The recalibration rule, reported not silent: are the thresholds too generous?

    *"If a majority of proposed predicates reach ``contrasted`` in year one, the bar is too low and
    the corpus is too small, in that order."* (mechanisms-v1.json, ``the maths``.)
    """

    n_proposed: int
    n_contrasted: int

    @property
    def contrasted_fraction(self) -> float:
        return self.n_contrasted / self.n_proposed if self.n_proposed else 0.0

    @property
    def bar_too_low(self) -> bool:
        return self.n_proposed > 0 and self.contrasted_fraction > 0.5


def recalibration_metric(mechanisms: Sequence[Mechanism]) -> RecalibrationMetric:
    """Fraction of proposed mechanisms that reached ``contrasted`` — the recalibration signal."""
    contrasted = sum(1 for m in mechanisms if m.warrant is Warrant.CONTRASTED)
    return RecalibrationMetric(n_proposed=len(mechanisms), n_contrasted=contrasted)


@dataclass(frozen=True, slots=True)
class IngestionArmStratum:
    """Contrasted-rate for one ``ingestion_arm`` — the REQ-005f coupling-gate stratum."""

    ingestion_arm: str
    n_total: int
    n_contrasted: int

    @property
    def contrasted_rate(self) -> float:
        return self.n_contrasted / self.n_total if self.n_total else 0.0


def ingestion_arm_report(
    mechanisms: Sequence[Mechanism],
) -> dict[str, IngestionArmStratum]:
    """``contrasted``-rate stratified by ``ingestion_arm`` (REQ-005f coupling gate; A20).

    Answers *"does trend-directed ingestion earn its coupling?"* — reported, never silent. Uses
    ``ingestion_arm`` (corpus-ingestion effort), which is **not** the amplification ``arm``.
    """
    by_arm: dict[str, list[Mechanism]] = {}
    for m in mechanisms:
        by_arm.setdefault(m.ingestion_arm.value, []).append(m)

    report: dict[str, IngestionArmStratum] = {}
    for arm, ms in by_arm.items():
        report[arm] = IngestionArmStratum(
            ingestion_arm=arm,
            n_total=len(ms),
            n_contrasted=sum(1 for m in ms if m.warrant is Warrant.CONTRASTED),
        )
    return report
