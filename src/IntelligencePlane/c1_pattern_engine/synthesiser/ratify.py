"""P8-T6 — ratification: human to promote, with the rubber-stamp decay signal.

*"Automatic to demote, human to promote."* No rung is served until a **named human** ratifies the
``statement``: :func:`ratify` requires ``ratified_by`` **and** a non-empty ``ratification_note``.
A click with no reason decays into a rubber stamp — the same discipline the breaker's arming rule
enforces (Contract C). So :func:`ratification_report` surfaces, per cohort, the **volume**, the
**median latency**, and the **rejection rate** — the decay signal the operator watches.

Two re-checks happen at ratification, not only at synthesis:

* **Disjointness of ``temporal_slices``** is re-verified for a ``contrasted`` mechanism (REQ-065a).
* **The forbidden-verb lexicon** is run again on the statement — the regression test on the
  ratifier. A subtle injection that avoids every forbidden verb still cannot be served without the
  human, which is the point.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from statistics import median
from uuid import UUID

from c1_pattern_engine.synthesiser.mechanism import Mechanism
from c1_pattern_engine.synthesiser.statement import contains_forbidden_verb
from c1_pattern_engine.synthesiser.warrant import Warrant, assert_disjoint_slices

__all__ = [
    "RatificationCohortReport",
    "RatificationDecision",
    "RatificationError",
    "ratification_report",
    "ratify",
]


class RatificationError(ValueError):
    """A promotion attempt that does not meet the ratification discipline (REQ-065)."""


def ratify(
    mechanism: Mechanism,
    *,
    ratified_by: UUID,
    ratification_note: str,
    ratified_at: datetime,
) -> Mechanism:
    """Ratify a mechanism for serving. Requires a named human and a non-empty note.

    Refuses to ratify anything below the served bar (``recurrent``/``contrasted``), re-checks slice
    disjointness for ``contrasted``, and re-runs the lexicon check. Returns a ratified copy; the
    original stays unratified and therefore unservable.
    """
    if not ratification_note or not ratification_note.strip():
        raise RatificationError(
            "Ratification requires a non-empty ratification_note in the ratifier's own words "
            "(REQ-065). A click with no reason decays into a rubber stamp."
        )
    if mechanism.warrant not in (Warrant.RECURRENT, Warrant.CONTRASTED):
        raise RatificationError(
            f"Only recurrent/contrasted mechanisms are served; refusing to ratify a "
            f"{mechanism.warrant.value!r} mechanism."
        )
    # The lexicon runs over BOTH served prose fields: `statement` and `falsifier` are each carried
    # on every C4 response, so a forbidden causal verb in either is rejected here. Same lexicon
    # (FORBIDDEN_VERB_FORMS) for both; the message names the field so a rejected falsifier is
    # distinguishable from a rejected statement.
    for field_name in ("statement", "falsifier"):
        if contains_forbidden_verb(getattr(mechanism, field_name)):
            raise RatificationError(
                f"The {field_name} uses a forbidden causal verb (causes|lifts|drives|predicts, "
                "any inflection). `contrasted` is the ceiling and is not a causal claim; the "
                f"{field_name} is served on every C4 response, so it is rejected at ratification."
            )
    if mechanism.warrant is Warrant.CONTRASTED:
        slices = mechanism.evidence.temporal_slices
        if len(slices) < 2:
            raise RatificationError(
                "A contrasted mechanism must carry >= 2 temporal slices; re-checked when ratifying."
            )
        assert_disjoint_slices(slices)  # re-check the cross-item disjointness (REQ-065a)

    return mechanism.with_ratification(
        ratified_by=ratified_by,
        ratified_at=ratified_at,
        ratification_note=ratification_note,
    )


@dataclass(frozen=True, slots=True)
class RatificationDecision:
    """One recorded ratifier decision, for the decay-signal report."""

    cohort_key: str
    submitted_at: datetime
    decided_at: datetime
    approved: bool

    @property
    def latency_seconds(self) -> float:
        return (self.decided_at - self.submitted_at).total_seconds()


@dataclass(frozen=True, slots=True)
class RatificationCohortReport:
    """The rubber-stamp decay signal, per cohort (REQ-065)."""

    cohort_key: str
    volume: int
    median_latency_seconds: float | None
    rejection_rate: float


def ratification_report(
    decisions: Sequence[RatificationDecision],
) -> dict[str, RatificationCohortReport]:
    """Volume, median latency, and rejection rate per cohort.

    A rising volume with a falling latency and a zero rejection rate is the rubber-stamp signature
    the operator is meant to see — reported, never silent.
    """
    by_cohort: dict[str, list[RatificationDecision]] = {}
    for d in decisions:
        by_cohort.setdefault(d.cohort_key, []).append(d)

    report: dict[str, RatificationCohortReport] = {}
    for cohort_key, ds in by_cohort.items():
        latencies = [d.latency_seconds for d in ds]
        rejections = sum(1 for d in ds if not d.approved)
        report[cohort_key] = RatificationCohortReport(
            cohort_key=cohort_key,
            volume=len(ds),
            median_latency_seconds=median(latencies) if latencies else None,
            rejection_rate=rejections / len(ds) if ds else 0.0,
        )
    return report
