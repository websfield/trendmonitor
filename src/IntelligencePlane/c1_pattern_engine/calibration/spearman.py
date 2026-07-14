"""P4-T3 — the rolling Spearman calibration statistic.

Produces the cross-plane tuple ``(n, rho, suspected_leak)`` the C# C3 authority consumes to decide
the ``BreakerState``. This module computes the statistic; it does **not** decide the breaker.

Two hard disciplines:

* **Fail closed below n = 60.** There is *no* code path that returns a ``rho`` for ``n < 60``.
  Below the floor the tuple is ``(n, None, False)`` — the harness refuses to emit a correlation it
  cannot defend, and the C# side reads that as ``cold``.
* **A high correlation is a warning, not a win.** ``rho > 0.5`` out-of-sample on ``n >= 60`` sets
  ``suspected_leak`` — *"If the composite shows rho > 0.5 out-of-sample on n >= 60, look for the
  leak before celebrating."* It is surfaced to the operator; it never trips the breaker and is
  never presented as success.

The Spearman is computed within **one cohort-key window**. Promotion changes the cohort key and
resets the window — that reset is the C# authority's job; this code refuses to fold two cohort
keys together (:func:`cohort_statistic` raises on a mixed window) so a correlation is never
computed across a library swap.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from scipy.stats import spearmanr

from c1_pattern_engine.calibration.dataset import CalibrationRecord, CohortKey
from substrate.provenance import MeasuredOutcome

__all__ = [
    "MIN_N",
    "SUSPECTED_LEAK_THRESHOLD",
    "CalibrationStat",
    "MixedCohortError",
    "NonMeasuredOutcomeError",
    "calibration_stat",
    "cohort_statistic",
]

# The cross-plane floor. Below this, no rho is emitted — ever.
MIN_N = 60
# The high side of the threshold, fixed in advance so it cannot be rationalised after the fact.
SUSPECTED_LEAK_THRESHOLD = 0.5


class MixedCohortError(ValueError):
    """Raised when a calibration window mixes cohort keys.

    A rolling correlation must never be computed across a library swap: promotion resets the
    window. Two distinct ``pattern_library_version``s are two cohort keys, and folding them into
    one Spearman would silently span the reset the C3 authority performs.
    """


class NonMeasuredOutcomeError(ValueError):
    """Raised when a non-measured percentile reaches the rank correlation (ADR-0001, Rule 5).

    A Spearman rho moves the circuit breaker, so it is an effect-size calculation, and *"a Proxy
    value never enters an effect-size calculation, at any weight, under any configuration."*
    ``build_calibration_dataset`` drops non-measured outcomes in bulk upstream; this is the seam's
    last line — it raises loudly if one arrives anyway, so the invariant is structural (like the
    sibling :class:`MixedCohortError`), not merely a matter of the caller's pipeline order.
    """


@dataclass(frozen=True, slots=True)
class CalibrationStat:
    """The cross-plane tuple. ``rho is None`` exactly when ``n < MIN_N``."""

    n: int
    rho: float | None
    suspected_leak: bool

    def __post_init__(self) -> None:
        # Enforce the contract at the type boundary: a small-n stat can never carry a rho, and a
        # suspected leak can never be flagged without a rho above threshold on a large-enough n.
        if self.n < MIN_N and self.rho is not None:
            raise ValueError(
                f"No rho may be emitted for n={self.n} < {MIN_N}. The harness refuses to emit a "
                "correlation below the floor (fail closed)."
            )
        if self.rho is not None and not math.isfinite(self.rho):
            raise ValueError(
                "rho must be None or finite; a NaN/inf rho is an absent statistic, not a number. "
                "A degenerate zero-variance cohort emits rho=None (read as cold), never NaN."
            )
        if self.suspected_leak and (self.rho is None or self.rho <= SUSPECTED_LEAK_THRESHOLD):
            raise ValueError(
                "suspected_leak requires rho > 0.5 on n >= 60; it is never set otherwise."
            )


def calibration_stat(
    predicted_vps: Sequence[float],
    actual_percentile: Sequence[float],
) -> CalibrationStat:
    """Compute ``(n, rho, suspected_leak)`` from paired predicted/actual sequences.

    ``predicted_vps`` and ``actual_percentile`` are the **temporal held-out** set, already paired
    by submission. Returns ``rho=None`` whenever ``n < MIN_N``; there is no path that returns a
    number for a small n.
    """
    if len(predicted_vps) != len(actual_percentile):
        raise ValueError(
            f"predicted ({len(predicted_vps)}) and actual ({len(actual_percentile)}) "
            "must be paired one-to-one."
        )
    n = len(predicted_vps)
    if n < MIN_N:
        return CalibrationStat(n=n, rho=None, suspected_leak=False)

    result = spearmanr(predicted_vps, actual_percentile)
    rho = float(result.statistic)
    if not math.isfinite(rho):
        # A degenerate cohort — all-identical predicted VPS or all-identical percentiles — has zero
        # variance, so a rank correlation is undefined and scipy returns NaN. That is an *absent*
        # statistic, n >= 60 notwithstanding: the C# monitor reads absent-rho-at-n>=60 as cold,
        # never armed. Mapping NaN -> None here keeps the fail-closed guarantee, and JSON has no
        # native NaN to leak a raw one across the plane seam.
        return CalibrationStat(n=n, rho=None, suspected_leak=False)
    suspected = rho > SUSPECTED_LEAK_THRESHOLD
    return CalibrationStat(n=n, rho=rho, suspected_leak=suspected)


def _ensure_single_cohort(records: Sequence[CalibrationRecord]) -> CohortKey | None:
    keys = {r.cohort_key for r in records}
    if len(keys) > 1:
        raise MixedCohortError(
            f"A calibration window must hold exactly one cohort key; found {len(keys)}. "
            "Promotion resets the window — a correlation is never computed across a library swap."
        )
    return next(iter(keys)) if keys else None


def cohort_statistic(held_out: Sequence[CalibrationRecord]) -> CalibrationStat:
    """Compute the statistic for one cohort's **held-out** records.

    Raises :class:`MixedCohortError` if the window spans more than one cohort key. The held-out set
    is produced by :func:`c1_pattern_engine.calibration.holdout.temporal_holdout`.
    """
    _ensure_single_cohort(held_out)
    predicted = [r.predicted_vps for r in held_out]
    # Seam guard: every outcome must prove it is measured before it can be ranked. Routing each
    # through MeasuredOutcome (the substrate's canonical "prove this is measured" type) makes it
    # structurally impossible for a Proxy/Estimated percentile to reach the correlation, regardless
    # of whether the caller went through build_calibration_dataset. A non-measurable value yields
    # None from try_from and raises here, mirroring the MixedCohortError guard above.
    actual: list[float] = []
    for r in held_out:
        measured = MeasuredOutcome.try_from(r.actual_7d_percentile)
        if measured is None:
            raise NonMeasuredOutcomeError(
                f"A {r.actual_7d_percentile.provenance!s} 7d-percentile reached the rank "
                "correlation. Only a Measured outcome may enter the calibration statistic that "
                "moves the breaker (ADR-0001, Rule 5); it is never imputed or laundered."
            )
        actual.append(measured.value)
    return calibration_stat(predicted, actual)
