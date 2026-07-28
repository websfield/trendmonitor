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
from datetime import date
from typing import Literal
from uuid import UUID

from c1_pattern_engine.detector.lifecycle import Band, Stage

__all__ = [
    "DEFAULT_THETA_FIT",
    "LEAD_TIME_SAFETY_FACTOR",
    "IssuedVerdict",
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
    if risk_flag not in ("none", "caution", "blocked"):
        # Defense-in-depth behind TenantBrief's boundary validation: an unknown flag from any
        # future caller must fail loudly, never fall through to caution (the loose direction).
        raise ValueError(f"risk_flag must be one of none/caution/blocked, got {risk_flag!r}")

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


@dataclass(frozen=True, slots=True)
class IssuedVerdict:
    """A verdict at issuance time — the outcome is unknowable until the trend closes.

    ``trend_survived`` resolves at the nightly scan that first classifies the signal
    ``declining`` or archives it: survived iff the signal stayed non-declining for at least
    ``lead_time_days`` after issuance (the window the verdict promised — Phase 6 R2).
    """

    trend_id: UUID
    tenant_id: UUID
    verdict: Verdict
    issued_on: date
    lead_time_days: float
    signal_scope: str = "public"


class VerdictLedger:
    """Tracks verdict outcomes so verdict accuracy is itself measured and reported.

    A ``go`` whose trend was already dead when the campaign shipped is a **verdict miss**. Accuracy
    is reported, not assumed — REQ-005f's rising-trend coupling has to earn its keep.

    Rendering and outcome-recording are split: :meth:`issue` at render time (first issuance per
    ``(trend, tenant)`` wins — accuracy measures the promise the manager first acted on),
    :meth:`resolve_trend` at the trend's close. ``go_accuracy`` aggregates **public-signal
    verdicts only** — an internal-signal verdict's outcome is tenant data and never enters the
    global fraction (CLAUDE.md rule 8; Phase 6 R2).
    """

    def __init__(self) -> None:
        self._outcomes: list[_Outcome] = []
        self._issued: dict[tuple[UUID, UUID], IssuedVerdict] = {}
        self._resolved: set[tuple[UUID, UUID]] = set()

    def issue(
        self,
        verdict: TrendVerdict,
        *,
        issued_on: date,
        lead_time_days: float,
        signal_scope: str = "public",
    ) -> IssuedVerdict | None:
        """First issuance per ``(trend, tenant)`` wins — a re-render never rewrites the promise,
        and a *resolved* pair is closed forever (a still-declining trend re-detected nightly must
        not churn a fresh skip outcome per scan). Two accepted asymmetries: a caution that later
        upgrades to go is measured as the caution first promised — the honest single choice over
        cherry-picking the best render; and a rebound go (same live episode re-classifying rising
        after its decline resolved) is served but never measured — the closed-forever rule wins
        over re-opening the churn it exists to prevent."""
        key = (verdict.trend_id, verdict.tenant_id)
        if key in self._resolved:
            return None  # the outcome is already history; never re-open it
        existing = self._issued.get(key)
        if existing is not None:
            return existing  # first issuance wins; a re-render never rewrites the promise
        issued = IssuedVerdict(
            trend_id=verdict.trend_id,
            tenant_id=verdict.tenant_id,
            verdict=verdict.verdict,
            issued_on=issued_on,
            lead_time_days=lead_time_days,
            signal_scope=signal_scope,
        )
        self._issued[key] = issued
        return issued

    def open_issues(self) -> list[IssuedVerdict]:
        """Every tenant's open issuances, internal-signal ones included — C1-internal use only.
        Any future serving surface must filter by tenant at the repository layer (the
        ``TrendSignalStore.feed`` discipline) before exposing these."""
        return list(self._issued.values())

    def resolve_trend(self, trend_id: UUID, *, closed_on: date) -> int:
        """Resolve every open verdict on this trend. Returns how many resolved. Idempotent —
        a second close finds nothing open."""
        resolved = 0
        for key in [k for k in self._issued if k[0] == trend_id]:
            issued = self._issued.pop(key)
            self._resolved.add(key)
            # closed_on biases survival UPWARD by design (archive closes at valid_to — the
            # presumption horizon; decline closes at the observing scan day, so a missed cron
            # inflates survival) — the same deliberate lesser-distortion trade as the sample
            # book (see run_scan's archive-close comment).
            survived = (closed_on - issued.issued_on).days >= issued.lead_time_days
            if issued.signal_scope == "public":
                self.record(issued.verdict, trend_survived=survived)
            resolved += 1
        return resolved

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
