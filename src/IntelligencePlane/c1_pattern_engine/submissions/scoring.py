"""Submitter scoring: ranked probability score, credit, and shrunk reputation.

    RPS         = (1 / (k-1)) * sum_{i=1}^{k-1} (Pcum_i - Ocum_i)^2     k = 3
    skill_score = clamp(1 - RPS / RPS_baseline, 0, 1)
    lead_days   = max(0, corroboration_date - submitted_at)
    credit      = skill_score * ln(1 + lead_days)
    shrunk_wt   = (n/(n+k)) * observed_mean_credit + (k/(n+k)) * prior_credit    k = 20

RPS, not Brier, because the three classes are **ordered** (rising < peak < declining): being one
step wrong should cost less than being two steps wrong, and only a cumulative score charges that.
``ln(1 + 0) = 0`` is the sandbagging guard: a correct call made only after independent
corroboration earns exactly nothing, structurally rather than by policy.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from math import log

__all__ = [
    "CLASSES",
    "REPUTATION_SHRINKAGE_K",
    "credit",
    "lead_days",
    "rps",
    "shrunk_weight",
    "skill_score",
]

# Ordered: rising precedes peak precedes declining. The order is what makes RPS the right score.
CLASSES: tuple[str, str, str] = ("rising", "peak", "declining")
_K = len(CLASSES)  # 3
REPUTATION_SHRINKAGE_K = 20


def rps(forecast: Mapping[str, float], observed: str) -> float:
    """Ranked probability score for an ordered-class forecast against the observed class.

    ``forecast`` is a distribution over :data:`CLASSES`; ``observed`` is the realised class. Lower
    is better; a forecast that put all mass on the wrong end scores worst.
    """
    if observed not in CLASSES:
        raise ValueError(f"observed {observed!r} is not one of {CLASSES}.")
    probs = [float(forecast.get(c, 0.0)) for c in CLASSES]
    obs = [1.0 if c == observed else 0.0 for c in CLASSES]

    cum_p = 0.0
    cum_o = 0.0
    total = 0.0
    for i in range(_K - 1):  # cumulative up to k-1 boundaries
        cum_p += probs[i]
        cum_o += obs[i]
        total += (cum_p - cum_o) ** 2
    return total / (_K - 1)


def skill_score(rps_value: float, rps_baseline: float) -> float:
    """``clamp(1 - RPS / RPS_baseline, 0, 1)``. The baseline is the reference (e.g. a climatology
    forecast); beating it earns skill, matching or worse earns zero."""
    if rps_baseline <= 0:
        raise ValueError("rps_baseline must be positive.")
    raw = 1.0 - rps_value / rps_baseline
    return max(0.0, min(1.0, raw))


def lead_days(corroboration_date: datetime, submitted_at: datetime) -> float:
    """``max(0, corroboration_date - submitted_at)`` in days. A call made *after* corroboration
    has non-positive lead and floors at zero."""
    delta = (corroboration_date - submitted_at).total_seconds() / 86400.0
    return max(0.0, delta)


def credit(skill: float, lead: float) -> float:
    """``skill_score * ln(1 + lead_days)``. With ``lead = 0`` this is exactly ``0`` — the
    sandbagging guard — no matter how skilled the call."""
    return skill * log(1.0 + lead)


def shrunk_weight(
    observed_mean_credit: float,
    n: int,
    prior_credit: float,
    k: int = REPUTATION_SHRINKAGE_K,
) -> float:
    """James-Stein-style shrinkage toward the prior with ``k = 20``.

    With ``n = 0`` the weight is **exactly** the prior — a submitter with no track record carries
    the prior, nothing borrowed from a mean that does not yet exist.
    """
    if n < 0:
        raise ValueError("n must be non-negative.")
    denom = n + k
    return (n / denom) * observed_mean_credit + (k / denom) * prior_credit
