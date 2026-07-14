"""P7-T4 — lifecycle stage and the days-remaining band.

Lifecycle from a 3-day EMA: ``v`` is the first difference, ``a`` the second.

* ``rising``    iff ``v > 0`` and ``a >= 0``
* ``peak``      iff (``v`` approx 0 and ``a < 0``) or (``v > 0`` with strongly negative ``a``)
* ``declining`` iff ``v < 0``

Days-remaining is a **band, never a number**, until at least 20 trends have resolved on that
platform. Below 20 the band comes from the stage alone (rising -> long, peak -> short,
declining -> short) and ``days_remaining_est`` is ``None``. At 20+ a robust estimate (median and
MAD of resolved samples, never mean/stddev) is exposed with its interval.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median
from typing import Literal

__all__ = [
    "EMA_SPAN",
    "MIN_RESOLUTIONS",
    "Band",
    "DaysRemaining",
    "Stage",
    "classify_stage",
    "days_remaining",
    "ema",
]

Stage = Literal["rising", "peak", "declining"]
Band = Literal["short", "medium", "long"]

EMA_SPAN = 3
MIN_RESOLUTIONS = 20

# Tolerances for "v approx 0" and "strongly negative a", relative to the EMA level so the same
# rule reads a 100-view series and a 100k-view series alike.
_V_EPS_FRAC = 0.02
_A_STRONG_FRAC = 0.05

# Band thresholds on a numeric days-remaining estimate.
_SHORT_MAX_DAYS = 7.0
_LONG_MIN_DAYS = 21.0


def ema(values: Sequence[float], span: int = EMA_SPAN) -> list[float]:
    """Exponential moving average with ``alpha = 2 / (span + 1)``."""
    if not values:
        return []
    alpha = 2.0 / (span + 1.0)
    out = [float(values[0])]
    for v in values[1:]:
        out.append(alpha * v + (1.0 - alpha) * out[-1])
    return out


def classify_stage(smoothed: Sequence[float]) -> Stage:
    """Classify the latest lifecycle stage from a smoothed (EMA) series.

    Needs at least three points to form a second difference; with fewer it reads the sign of the
    last first difference and calls a flat/short series ``rising`` by default (a young series is
    presumed on its way up until it shows otherwise).
    """
    if len(smoothed) < 2:
        return "rising"

    v = smoothed[-1] - smoothed[-2]
    a = 0.0
    if len(smoothed) >= 3:
        v_prev = smoothed[-2] - smoothed[-3]
        a = v - v_prev

    level = abs(smoothed[-1]) or 1.0
    v_eps = _V_EPS_FRAC * level
    a_strong = _A_STRONG_FRAC * level

    if v < -v_eps:
        return "declining"
    if v > v_eps:
        # Rising, unless acceleration has turned strongly negative: that is the peak rolling over.
        if a < -a_strong:
            return "peak"
        return "rising"
    # v approx 0: a flat top with negative acceleration is a peak; otherwise still rising.
    if a < 0:
        return "peak"
    return "rising"


@dataclass(frozen=True, slots=True)
class DaysRemaining:
    """The days-remaining band, and the numeric estimate/interval once it is earned."""

    band: Band
    est: float | None
    lower: float | None
    upper: float | None

    @property
    def is_numeric(self) -> bool:
        return self.est is not None


def _band_from_stage(stage: Stage) -> Band:
    # rising -> long, peak -> short, declining -> short (the pre-20-resolutions rule).
    return "long" if stage == "rising" else "short"


def _band_from_est(est: float) -> Band:
    if est < _SHORT_MAX_DAYS:
        return "short"
    if est > _LONG_MIN_DAYS:
        return "long"
    return "medium"


def days_remaining(stage: Stage, resolved_samples: Sequence[float]) -> DaysRemaining:
    """The days-remaining band for a trend at ``stage``, given resolved samples on its platform.

    ``resolved_samples`` are observed remaining-days figures from trends already resolved on that
    platform. Until there are ``MIN_RESOLUTIONS`` (20) of them, ``est`` stays ``None`` and the band
    is read from the stage alone — a numeric days-remaining before 20 resolutions would be
    spurious precision. At 20+ the estimate is the robust median with a MAD interval.
    """
    if len(resolved_samples) < MIN_RESOLUTIONS:
        return DaysRemaining(band=_band_from_stage(stage), est=None, lower=None, upper=None)

    med = median(resolved_samples)
    mad = median([abs(s - med) for s in resolved_samples])
    return DaysRemaining(
        band=_band_from_est(med),
        est=med,
        lower=med - mad,
        upper=med + mad,
    )
