"""P7-T7 — the tenant-scoped ``TrendVerdict`` (go / caution / skip).

    go      iff stage=rising and band in {medium, long}
             and (days_remaining_est is null or days_remaining_est > lead_time * 1.5)
             and brand_fit >= theta_fit and risk_flag = none
    caution iff stage=peak or risk_flag = caution
    skip    iff stage=declining or risk_flag = blocked or band = short

The ``* 1.5`` safety factor exists because brief-to-live is a median, not a guarantee, and the
cost of landing a campaign into a dying trend is the whole campaign. The computation is
**deterministic and takes no rationale** — a submitter's prose (untrusted, possibly a prompt
injection) is not an input to a verdict, ever.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from c1_pattern_engine.detector.lifecycle import Band, Stage

__all__ = [
    "DEFAULT_THETA_FIT",
    "LEAD_TIME_SAFETY_FACTOR",
    "RiskFlag",
    "TrendVerdict",
    "Verdict",
    "VerdictLedger",
    "compute_verdict",
]

Verdict = Literal["go", "caution", "skip"]
RiskFlag = Literal["none", "caution", "blocked"]

LEAD_TIME_SAFETY_FACTOR = 1.5
DEFAULT_THETA_FIT = 0.6


@dataclass(frozen=True, slots=True)
class TrendVerdict:
    """Always tenant-scoped (Rule 8): a verdict is rendered against *this tenant's* brief-to-live
    lead time, and never crosses tenants."""

    trend_id: UUID
    tenant_id: UUID
    verdict: Verdict
    stage: Stage
    band: Band
    reason: str

    def __post_init__(self) -> None:
        if self.tenant_id is None:  # type: ignore[redundant-expr]
            raise ValueError("A TrendVerdict is always tenant-scoped and requires a tenant_id.")


def compute_verdict(
    *,
    trend_id: UUID,
    tenant_id: UUID,
    stage: Stage,
    band: Band,
    days_remaining_est: float | None,
    lead_time_days: float,
    brand_fit: float,
    risk_flag: RiskFlag,
    theta_fit: float = DEFAULT_THETA_FIT,
) -> TrendVerdict:
    """Render a verdict. Note the signature: **no rationale, no evidence_uris** — untrusted prose
    cannot reach a deterministic decision (A13)."""

    def _v(verdict: Verdict, reason: str) -> TrendVerdict:
        return TrendVerdict(
            trend_id=trend_id,
            tenant_id=tenant_id,
            verdict=verdict,
            stage=stage,
            band=band,
            reason=reason,
        )

    # skip dominates: a dying trend, a blocked risk, or a short window is a campaign-ending land.
    if stage == "declining":
        return _v("skip", "stage=declining")
    if risk_flag == "blocked":
        return _v("skip", "risk_flag=blocked")
    if band == "short":
        return _v("skip", "band=short")

    lead_guard = days_remaining_est is None or (
        days_remaining_est > lead_time_days * LEAD_TIME_SAFETY_FACTOR
    )

    if (
        stage == "rising"
        and band in ("medium", "long")
        and lead_guard
        and brand_fit >= theta_fit
        and risk_flag == "none"
    ):
        return _v("go", "rising + adequate window + brand-fit + no risk")

    if stage == "peak":
        return _v("caution", "stage=peak")
    if risk_flag == "caution":
        return _v("caution", "risk_flag=caution")

    # Anything that failed the go gate without tripping skip is held at caution (fail safe).
    if not lead_guard:
        return _v("caution", "days_remaining does not clear lead_time * 1.5")
    if brand_fit < theta_fit:
        return _v("caution", "brand_fit below theta_fit")
    return _v("caution", "go gate not fully met")


@dataclass(frozen=True, slots=True)
class _Outcome:
    verdict: Verdict
    trend_survived: bool


class VerdictLedger:
    """Tracks verdict outcomes so verdict accuracy is itself measured and reported.

    A ``go`` whose trend was already dead when the campaign shipped is a **verdict miss**. Accuracy
    is reported, not assumed — REQ-005f's rising-trend coupling has to earn its keep.
    """

    def __init__(self) -> None:
        self._outcomes: list[_Outcome] = []

    def record(self, verdict: Verdict, *, trend_survived: bool) -> None:
        self._outcomes.append(_Outcome(verdict=verdict, trend_survived=trend_survived))

    def is_miss(self, verdict: Verdict, *, trend_survived: bool) -> bool:
        return verdict == "go" and not trend_survived

    @property
    def misses(self) -> int:
        return sum(1 for o in self._outcomes if o.verdict == "go" and not o.trend_survived)

    @property
    def go_count(self) -> int:
        return sum(1 for o in self._outcomes if o.verdict == "go")

    def go_accuracy(self) -> float | None:
        """Fraction of ``go`` verdicts whose trend actually survived. ``None`` before any ``go``."""
        gos = self.go_count
        if gos == 0:
            return None
        hits = sum(1 for o in self._outcomes if o.verdict == "go" and o.trend_survived)
        return hits / gos
