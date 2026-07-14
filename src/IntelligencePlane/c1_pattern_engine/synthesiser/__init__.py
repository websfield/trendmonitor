"""C1 §1.9 — the Mechanism Synthesiser (Phase 8).

Mines tenant-neutral ``Mechanism`` claims — falsifiable, carrying **no effect size**,
human-ratified — from the **public exemplar corpus alone** and from trend signals. It reads no
``OutcomeEvent``, no ``Pattern``, no ``PerformanceSnapshot``, no ``tenant_id`` (REQ-061): the
absence of those parameters on :func:`synthesise` is the tenant-neutrality guarantee, by
construction. Its drafting client is **C1's own** — it never imports or calls C2 (Rule 3).
"""

from __future__ import annotations

from c1_pattern_engine.synthesiser.demote import (
    MechanismWarrantTransition,
    refresh_and_demote,
)
from c1_pattern_engine.synthesiser.mechanism import (
    Mechanism,
    MissingFalsifierError,
)
from c1_pattern_engine.synthesiser.prevalence import (
    PrevalenceResult,
    compute_prevalence,
)
from c1_pattern_engine.synthesiser.propose import (
    FeaturePredicate,
    PredicateReviewError,
    propose_predicates,
    review_predicate,
)
from c1_pattern_engine.synthesiser.ratify import (
    RatificationCohortReport,
    RatificationDecision,
    RatificationError,
    ratification_report,
    ratify,
)
from c1_pattern_engine.synthesiser.statement import (
    FORBIDDEN_VERBS,
    DraftedStatement,
    MechanismConjecture,
    MechanismDraftClient,
    OfflineDraftClient,
    contains_forbidden_verb,
)
from c1_pattern_engine.synthesiser.synthesise import (
    RecalibrationMetric,
    ingestion_arm_report,
    recalibration_metric,
    synthesise,
)
from c1_pattern_engine.synthesiser.warrant import (
    Evidence,
    OverlappingSlicesError,
    TemporalSlice,
    Warrant,
    assert_disjoint_slices,
    compute_warrant,
    slices_are_ordered_disjoint,
)

__all__ = [
    "FORBIDDEN_VERBS",
    "DraftedStatement",
    "Evidence",
    "FeaturePredicate",
    "Mechanism",
    "MechanismConjecture",
    "MechanismDraftClient",
    "MechanismWarrantTransition",
    "MissingFalsifierError",
    "OfflineDraftClient",
    "OverlappingSlicesError",
    "PredicateReviewError",
    "PrevalenceResult",
    "RatificationCohortReport",
    "RatificationDecision",
    "RatificationError",
    "RecalibrationMetric",
    "TemporalSlice",
    "Warrant",
    "assert_disjoint_slices",
    "compute_prevalence",
    "compute_warrant",
    "contains_forbidden_verb",
    "ingestion_arm_report",
    "propose_predicates",
    "ratification_report",
    "ratify",
    "recalibration_metric",
    "refresh_and_demote",
    "review_predicate",
    "slices_are_ordered_disjoint",
    "synthesise",
]
