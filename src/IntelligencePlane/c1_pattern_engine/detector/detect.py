"""P7-T3 — the robust-z detector.

    robust_z = 0.6745 * (x_today - median_28) / MAD_28

Median and MAD, **never mean and stddev** — one news event must not mask a genuine emerging trend
for a month. A candidate is raised only when ``z > 3`` is **sustained across two or more
consecutive calendar days**. A single day with ``z > 5`` alerts a manager but creates **no
signal** — a one-day spike is noise until the next day agrees.

Two consecutive days means two days one apart. A gap between two above-threshold days breaks the
run: they are not consecutive, and nothing imputes the missing day to bridge them.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from statistics import median

__all__ = [
    "BASELINE_DAYS",
    "MIN_BASELINE_POINTS",
    "MIN_CONSECUTIVE_DAYS",
    "ROBUST_CONST",
    "Z_CANDIDATE",
    "Z_SINGLE_DAY_ALERT",
    "DetectionResult",
    "SpikeAlert",
    "TrendCandidate",
    "detect_candidates",
    "robust_baseline",
    "robust_z",
    "z_series",
]

ROBUST_CONST = 0.6745
BASELINE_DAYS = 28
Z_CANDIDATE = 3.0
Z_SINGLE_DAY_ALERT = 5.0
MIN_CONSECUTIVE_DAYS = 2
# Fail closed on a too-sparse window: a MAD from a handful of points is not a baseline.
MIN_BASELINE_POINTS = 14


def robust_baseline(volumes: Sequence[float]) -> tuple[float, float]:
    """Return ``(median, MAD)``. MAD is the median absolute deviation from the median."""
    med = median(volumes)
    mad = median([abs(v - med) for v in volumes])
    return med, mad


def robust_z(x: float, baseline: Sequence[float]) -> float | None:
    """Robust z of ``x`` against a trailing baseline, or ``None`` when it cannot be computed.

    Returns ``None`` — never a fabricated number — when the window is too sparse or MAD is zero.
    A ``None`` means *frozen*: the caller skips this day, it never fills it in.
    """
    if len(baseline) < MIN_BASELINE_POINTS:
        return None
    med, mad = robust_baseline(baseline)
    if mad == 0:
        return None
    return ROBUST_CONST * (x - med) / mad


def z_series(observed: Mapping[date, float]) -> dict[date, float]:
    """Compute the robust z for each observed day against its own trailing 28-day baseline.

    ``observed`` maps only the days that were actually read (a gap is simply an absent key). A
    day whose z cannot be computed — sparse window, zero MAD — is **omitted from the result**, not
    assigned a value. No missing day is ever imputed to widen a window.
    """
    days = sorted(observed)
    out: dict[date, float] = {}
    for d in days:
        window = [observed[e] for e in days if 0 < (d - e).days <= BASELINE_DAYS]
        z = robust_z(observed[d], window)
        if z is not None:
            out[d] = z
    return out


@dataclass(frozen=True, slots=True)
class TrendCandidate:
    """A ``z > 3`` run sustained across ``>= 2`` consecutive days: a candidate, not a signal."""

    start_day: date
    days: tuple[date, ...]
    z_scores: tuple[float, ...]

    @property
    def run_length(self) -> int:
        return len(self.days)


@dataclass(frozen=True, slots=True)
class SpikeAlert:
    """A single-day ``z > 5`` that did **not** sustain. Alerts a human; creates no signal."""

    day: date
    z: float


@dataclass(frozen=True, slots=True)
class DetectionResult:
    candidates: tuple[TrendCandidate, ...]
    alerts: tuple[SpikeAlert, ...]


def detect_candidates(z_by_day: Mapping[date, float]) -> DetectionResult:
    """Apply the two-consecutive-day rule and the single-day alert rule.

    ``z_by_day`` holds a z **only** for days that were observed and computable — the same-shaped
    output of :func:`z_series`. Missing days are missing; the run-length walk treats a break in
    consecutive calendar days as the end of a run.
    """
    days = sorted(z_by_day)
    candidates: list[TrendCandidate] = []
    alerts: list[SpikeAlert] = []

    i = 0
    n = len(days)
    while i < n:
        d = days[i]
        if z_by_day[d] <= Z_CANDIDATE:
            i += 1
            continue

        run = [d]
        j = i + 1
        while (
            j < n
            and (days[j] - days[j - 1]).days == 1
            and z_by_day[days[j]] > Z_CANDIDATE
        ):
            run.append(days[j])
            j += 1

        if len(run) >= MIN_CONSECUTIVE_DAYS:
            candidates.append(
                TrendCandidate(
                    start_day=run[0],
                    days=tuple(run),
                    z_scores=tuple(z_by_day[x] for x in run),
                )
            )
        else:
            # An unsustained run of one day: it alerts only if it clears the single-day bar.
            only = run[0]
            if z_by_day[only] > Z_SINGLE_DAY_ALERT:
                alerts.append(SpikeAlert(day=only, z=z_by_day[only]))
        i = j

    return DetectionResult(candidates=tuple(candidates), alerts=tuple(alerts))
