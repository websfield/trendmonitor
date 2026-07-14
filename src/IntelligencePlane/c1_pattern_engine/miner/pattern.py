"""The ``Pattern`` handoff artefact and the small value types the miner shares.

A ``Pattern`` is **tenant-scoped** (Rule 8): it is estimated from *this tenant's* internal outcome
corpus, so it carries a ``tenant_id`` and the repository enforces it with no widening override.
That is the opposite of a ``Mechanism`` (Phase 8), which is tenant-neutral by construction — the
two are mined from different corpora with different proposal stages and must never converge.

A ``Pattern`` records an effect size and its CI, but a ``Pattern`` below the evidence floor
(``sample_size < 30`` or a CI that includes zero) rests at ``insufficient_evidence`` forever — a
resting state, never a queue with a deadline. A pattern whose evidence came from exploit-arm data
carries ``is_upper_bound=True``: amplification confounds the estimate, so it is a ceiling pending
replication (ADR-0003).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal
from uuid import UUID

__all__ = [
    "SAMPLE_FLOOR",
    "Arm",
    "EffectSize",
    "EvidenceStatus",
    "Pattern",
]

# The evidence floor (REQ-003). Below it, a candidate rests at insufficient_evidence.
SAMPLE_FLOOR = 30

Arm = Literal["exploit", "explore"]
EvidenceStatus = Literal["active", "insufficient_evidence", "stale", "retired"]


@dataclass(frozen=True, slots=True)
class EffectSize:
    """A lift in 24h engagement-rate percentile vs the cohort median, with a bootstrapped CI.

    ``p_value`` is a two-sided bootstrap p (the fraction of resampled lifts on the wrong side of
    zero, doubled), carried so Benjamini-Hochberg can run across the full candidate set.
    """

    lift: float
    ci: tuple[float, float]
    n: int
    p_value: float

    @property
    def ci_excludes_zero(self) -> bool:
        lo, hi = self.ci
        return lo > 0.0 or hi < 0.0


@dataclass(frozen=True, slots=True)
class Pattern:
    """Consumed by C2 (Contract A, pinned read). **Not** read by Phase 8's synthesiser.

    Keyed by ``(vertical, platform)`` (REQ-003) within a ``tenant_id`` (Rule 8). ``is_upper_bound``
    flags an exploit-arm estimate; ``backtest_note`` records a pattern that replicated but
    back-tested poorly (promoted with a note, watched).
    """

    id: UUID
    tenant_id: UUID
    vertical: str
    platform: str
    assertion: str
    feature_predicate: dict
    effect_size: float
    effect_ci: tuple[float, float]
    sample_size: int
    evidence_arm: Arm
    evidence_status: EvidenceStatus
    valid_from: date
    valid_to: date
    is_upper_bound: bool = False
    backtest_note: str | None = None

    @property
    def is_retrievable(self) -> bool:
        """Only an ``active`` pattern is ever retrieved for scoring. ``insufficient_evidence`` and
        ``stale`` are shipped in the artefact for auditability but never surfaced."""
        return self.evidence_status == "active"
