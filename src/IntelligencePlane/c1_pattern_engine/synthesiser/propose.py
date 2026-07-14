"""P8-T2 — the **independent** predicate proposer, over the exemplar corpus alone.

*"The synthesiser proposes its own predicates over the exemplar corpus alone. It does not consume
the pattern miner's union-reading proposal stage. This duplication is deliberate."* (ADR-0007.)
This module imports **nothing** from Phase 6's miner. The claim ADR-0007 makes is that tenant data
is *unreachable* from the synthesiser — implemented as reachability, not as washing out.

A ``FeaturePredicate`` is a deterministic boolean over a :class:`FeatureRecord` — a claim about the
**content**, never about the creator. A predicate that reads creator identity, follower count, or a
demographic proxy is *not a mechanism* and :func:`review_predicate` rejects it (REQ; A19).

Absence is not evidence: a predicate over an audio- or OCR-derived feature carries a
``completeness_flag``; when that flag is False the record is *unmeasured* and is excluded from both
numerator and denominator of a prevalence count — never counted as a measured zero.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from extraction.model import CompositionKind, FeatureRecord, LightingKind

if TYPE_CHECKING:
    from c1_pattern_engine.corpora.exemplar import ExemplarCorpus

__all__ = [
    "FORBIDDEN_PREDICATE_TOKENS",
    "FeaturePredicate",
    "PredicateReviewError",
    "propose_predicates",
    "review_predicate",
]

# A predicate is about the CONTENT (the FeatureRecord), never the creator. These tokens name the
# creator/audience axis; a feature_path touching one is rejected at review (A19).
FORBIDDEN_PREDICATE_TOKENS: frozenset[str] = frozenset(
    {
        "creator",
        "creator_id",
        "author",
        "handle",
        "username",
        "follower",
        "followers",
        "follower_count",
        "audience",
        "demographic",
        "age",
        "gender",
        "ethnicity",
        "location",
        "verified",
    }
)

_OPERATORS = frozenset({"eq", "ne", "lt", "le", "gt", "ge", "in", "truthy", "nonempty"})


class PredicateReviewError(ValueError):
    """A proposed predicate is not a mechanism predicate — it reads the creator, not the content."""


@dataclass(frozen=True, slots=True)
class FeaturePredicate:
    """A machine-evaluable boolean over a ``FeatureRecord`` — the only machine-read part of a
    Mechanism, and what makes the statement falsifiable rather than a story.

    ``feature_path`` is a dotted path into a ``FeatureRecord`` (content only).
    ``completeness_flag``, when set, is a dotted path to a bool that must be True for the record to
    be *evaluable* — the ``onscreen_text_complete`` / ``audio_signals_complete`` discipline.
    """

    id: str
    description: str
    feature_path: str
    operator: str
    operand: Any = None
    completeness_flag: str | None = None
    _reviewed: bool = field(default=False, repr=False)

    def __post_init__(self) -> None:
        if self.operator not in _OPERATORS:
            raise PredicateReviewError(f"Unknown predicate operator {self.operator!r}.")

    def evaluable(self, record: FeatureRecord) -> bool:
        """False when a required completeness flag is not set — the record is *unmeasured* for
        this predicate and must be excluded from a prevalence count, never counted as a zero."""
        if self.completeness_flag is None:
            return True
        return bool(_resolve(record, self.completeness_flag))

    def satisfied(self, record: FeatureRecord) -> bool:
        """Evaluate the predicate deterministically over the media's ``FeatureRecord``."""
        value = _resolve(record, self.feature_path)
        op = self.operator
        if op == "truthy":
            return bool(value)
        if op == "nonempty":
            return bool(value) and len(value) > 0
        if op == "eq":
            return value == self.operand
        if op == "ne":
            return value != self.operand
        if op == "lt":
            return value < self.operand
        if op == "le":
            return value <= self.operand
        if op == "gt":
            return value > self.operand
        if op == "ge":
            return value >= self.operand
        if op == "in":
            return value in self.operand
        raise PredicateReviewError(f"Unknown predicate operator {op!r}.")

    def to_dict(self) -> dict[str, Any]:
        operand = self.operand
        if isinstance(operand, LightingKind | CompositionKind):
            operand = operand.value
        return {
            "id": self.id,
            "description": self.description,
            "feature_path": self.feature_path,
            "operator": self.operator,
            "operand": operand,
            "completeness_flag": self.completeness_flag,
        }


def _resolve(record: FeatureRecord, path: str) -> Any:
    obj: Any = record
    for part in path.split("."):
        obj = getattr(obj, part)
    return obj


def review_predicate(predicate: FeaturePredicate) -> FeaturePredicate:
    """Reject a predicate that references creator identity, follower count, or a demographic proxy.

    *"That is not a mechanism — a predicate is about the CONTENT, never the creator."* The lexicon
    check on ``feature_path`` (and ``completeness_flag``) is the structural gate for A19. Returns a
    reviewed copy; only reviewed predicates are admitted to prevalence counting.
    """
    for path in (predicate.feature_path, predicate.completeness_flag):
        if path is None:
            continue
        segments = {seg.lower() for seg in path.split(".")}
        offending = segments & FORBIDDEN_PREDICATE_TOKENS
        if offending:
            raise PredicateReviewError(
                f"Predicate {predicate.id!r} reads {sorted(offending)} — a creator/audience axis, "
                "not content. A mechanism predicate is a claim about the FeatureRecord (the "
                "content), never about the creator. Rejected at review (A19)."
            )
    import dataclasses

    return dataclasses.replace(predicate, _reviewed=True)


# --- The independent catalogue (content only) ----------------------------------------------
#
# These are C1's OWN candidate predicates, proposed over the exemplar corpus. They are NOT the
# pattern miner's proposals and this module imports no Phase-6 proposer.

_CATALOGUE: tuple[FeaturePredicate, ...] = (
    FeaturePredicate(
        id="face_in_first_frame",
        description="a human face is present in the first frame",
        feature_path="first_frame_features.face_present",
        operator="truthy",
    ),
    FeaturePredicate(
        id="natural_lighting",
        description="the lighting reads as natural rather than studio-lit",
        feature_path="authenticity_signals.lighting_kind",
        operator="eq",
        operand=LightingKind.NATURAL,
    ),
    FeaturePredicate(
        id="rapid_cuts",
        description="the cut cadence is at least one cut per second",
        feature_path="cut_cadence_per_sec",
        operator="ge",
        operand=1.0,
    ),
    FeaturePredicate(
        id="short_form",
        description="the media runs no longer than fifteen seconds",
        feature_path="media_duration_ms",
        operator="le",
        operand=15000,
    ),
    FeaturePredicate(
        id="low_filler_speech",
        description="spoken delivery carries few filler words",
        feature_path="authenticity_signals.filler_word_rate",
        operator="le",
        operand=0.05,
        completeness_flag="authenticity_signals.audio_signals_complete",
    ),
    FeaturePredicate(
        id="rule_of_thirds",
        description="the first frame composes on the rule of thirds",
        feature_path="first_frame_features.composition",
        operator="eq",
        operand=CompositionKind.RULE_OF_THIRDS,
    ),
)


def propose_predicates(exemplar_corpus: ExemplarCorpus) -> list[FeaturePredicate]:
    """Propose candidate predicates observed in the **exemplar corpus alone**.

    Only predicates that at least one *evaluable* top-decile post satisfies are proposed — a
    predicate proposed from the corpus, not imported. Every proposal is passed through
    :func:`review_predicate`, so a creator-axis predicate could never survive even if it were added
    to the catalogue. Reads the top-decile corpus and nothing else (no contrast set, no tenant
    data, no Phase-6 proposal).
    """
    proposed: list[FeaturePredicate] = []
    for predicate in _CATALOGUE:
        reviewed = review_predicate(predicate)
        if any(
            reviewed.evaluable(p.feature_record) and reviewed.satisfied(p.feature_record)
            for p in exemplar_corpus.posts
        ):
            proposed.append(reviewed)
    return proposed


def catalogue() -> Sequence[FeaturePredicate]:
    """The raw candidate catalogue, for tests that assert independence."""
    return _CATALOGUE
