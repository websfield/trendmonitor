"""The two corpus post shapes and the candidate predicate — the miner's inputs.

The single most important sentence in this component: **proposal runs over the union of both
corpora; estimation runs over the internal corpus only.** These two types make that concrete.

* :class:`ProposalPost` is a post in the *proposal* union. It carries a ``source`` tag
  (``exemplar`` | ``internal``) and *only its features* — proposal never reads an outcome, so an
  exemplar's ``Proxy`` engagement has no path into the proposal logic at all.
* :class:`InternalPost` is a post in the *internal* corpus, the only corpus estimation reads. It
  carries a ``Provenanced`` 24h outcome; estimation admits it only through
  ``MeasuredOutcome.try_from`` (a ``Proxy`` returns ``None`` and is excluded, never imputed).

A :class:`CandidatePredicate` is evaluated against a feature mapping and is source-agnostic — the
same predicate can be proposed from the union and estimated on the internal corpus.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from c1_pattern_engine.miner.pattern import Arm
from substrate.provenance import Provenanced

__all__ = [
    "CandidatePredicate",
    "InternalPost",
    "ProposalPost",
    "Source",
]

Source = Literal["exemplar", "internal"]


@dataclass(frozen=True, slots=True)
class ProposalPost:
    """A post in the PROPOSAL union. Features only — proposal never reads an outcome."""

    features: Mapping[str, Any]
    source: Source


@dataclass(frozen=True, slots=True)
class InternalPost:
    """A post in the INTERNAL corpus, for estimation. Carries a Provenanced 24h outcome.

    ``outcome`` is the 24h engagement-rate percentile. Its provenance is what the barrier reads: an
    exemplar-sourced ``Proxy`` value can never become a ``MeasuredOutcome`` and so can never reach
    the estimator. ``period`` labels a temporal slice for replication/back-test — the slices are
    separate corpora, never a random split.
    """

    submission_id: UUID
    tenant_id: UUID
    vertical: str
    platform: str
    features: Mapping[str, Any]
    outcome: Provenanced[float]
    arm: Arm | None
    period: str = "p1"


@dataclass(frozen=True, slots=True)
class CandidatePredicate:
    """A feature predicate proposed cheaply and generously; discipline lives in promotion.

    ``feature_predicate`` is a conjunction: ``{"all": [{"feature": .., "op": .., "value": ..}]}``.
    Supported ops: ``eq`` / ``ge`` / ``le``. ``matches`` evaluates it against a feature mapping.
    """

    id: str
    assertion: str
    feature_predicate: dict[str, Any]

    def matches(self, features: Mapping[str, Any]) -> bool:
        for cond in self.feature_predicate.get("all", ()):
            feat = cond["feature"]
            op = cond["op"]
            want = cond["value"]
            if feat not in features:
                return False
            got = features[feat]
            if op == "eq":
                if got != want:
                    return False
            elif op == "ge":
                if not (got >= want):
                    return False
            elif op == "le":
                if not (got <= want):
                    return False
            else:  # pragma: no cover - guarded by the proposer that builds these
                raise ValueError(f"Unknown predicate op {op!r}.")
        return True
