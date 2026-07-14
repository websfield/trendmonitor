"""P6-T2 — the estimator, over the INTERNAL corpus ONLY.

This is where the load-bearing invariant lives. :func:`estimate_effect_size` accepts
``Iterable[MeasuredOutcome]`` and nothing else. An exemplar post's engagement is ``Proxy`` on every
platform that matters, and ``MeasuredOutcome.try_from(Proxy)`` returns ``None`` — so an
exemplar-sourced outcome reaching this function is a **type error**, not a runtime check a reviewer
must notice. :func:`estimate_predicate` admits internal outcomes only through that barrier and
*excludes* — never imputes — anything it declines.

This module deliberately imports neither the proposal stage nor any exemplar corpus. Adding a
union-reading line here is exactly what ``test_estimator_provenance`` is built to catch.

The effect size is the lift in the 24h engagement-rate percentile for posts satisfying a predicate
versus the cohort median, with a bootstrapped CI. Median, not mean — one viral outlier must not
manufacture an effect.
"""

from __future__ import annotations

from collections.abc import Iterable
from statistics import median

import numpy as np

from c1_pattern_engine.miner.model import CandidatePredicate, InternalPost
from c1_pattern_engine.miner.pattern import Arm, EffectSize
from substrate.provenance import MeasuredOutcome

__all__ = ["BOOTSTRAP_ITERATIONS", "estimate_effect_size", "estimate_predicate"]

BOOTSTRAP_ITERATIONS = 2000


def estimate_effect_size(
    outcomes: Iterable[MeasuredOutcome],
    cohort_median: float,
    *,
    n_boot: int = BOOTSTRAP_ITERATIONS,
    seed: int = 0,
) -> EffectSize:
    """Lift of ``median(outcomes) - cohort_median`` with a bootstrapped 95% CI.

    ``outcomes`` is ``Iterable[MeasuredOutcome]`` — the type barrier. A ``Proxy`` value cannot be
    constructed into a ``MeasuredOutcome`` (ADR-0001), so it cannot be passed here at all.
    """
    values = np.array([o.value for o in outcomes], dtype=float)
    n = int(values.size)
    if n == 0:
        # No measured evidence for this predicate. Not an effect of zero — an *absent* effect.
        return EffectSize(lift=0.0, ci=(0.0, 0.0), n=0, p_value=1.0)

    lift = float(np.median(values) - cohort_median)

    rng = np.random.default_rng(seed)
    idx = rng.integers(0, n, size=(n_boot, n))
    boot_lifts = np.median(values[idx], axis=1) - cohort_median
    lo, hi = np.percentile(boot_lifts, [2.5, 97.5])

    # Two-sided bootstrap p: the mass on the wrong side of zero, doubled and clamped.
    frac_le = float(np.mean(boot_lifts <= 0.0))
    frac_ge = float(np.mean(boot_lifts >= 0.0))
    p_value = min(1.0, 2.0 * min(frac_le, frac_ge))

    return EffectSize(lift=lift, ci=(float(lo), float(hi)), n=n, p_value=p_value)


def _cohort_median(internal_corpus: Iterable[InternalPost]) -> tuple[float, list[MeasuredOutcome]]:
    """Admit the cohort's measured outcomes and return (median, admitted).

    The admission is the barrier: each outcome must pass ``MeasuredOutcome.try_from``. A Proxy or
    Estimated outcome yields ``None`` and is dropped — excluded, never imputed.
    """
    admitted = [
        mo
        for mo in (MeasuredOutcome.try_from(p.outcome) for p in internal_corpus)
        if mo is not None
    ]
    if not admitted:
        return 0.0, admitted
    return float(median(m.value for m in admitted)), admitted


def estimate_predicate(
    predicate: CandidatePredicate,
    internal_corpus: Iterable[InternalPost],
    *,
    arm: Arm | None = None,
    n_boot: int = BOOTSTRAP_ITERATIONS,
    seed: int = 0,
) -> EffectSize:
    """Estimate one predicate's effect on the INTERNAL corpus only.

    Reads ``InternalPost``s — never a ``ProposalPost``, never an exemplar. Optionally restricts to
    one amplification ``arm``. Only measured outcomes enter the estimate; the cohort median is over
    the cohort's measured outcomes too.
    """
    posts = list(internal_corpus)
    cohort_median, _ = _cohort_median(posts)

    matching: list[MeasuredOutcome] = []
    for post in posts:
        if arm is not None and post.arm != arm:
            continue
        if not predicate.matches(post.features):
            continue
        mo = MeasuredOutcome.try_from(post.outcome)
        if mo is None:
            # A non-measured outcome for a matching post is excluded from the effect size, exactly
            # as ADR-0001 requires — it is never imputed to keep the row.
            continue
        matching.append(mo)

    return estimate_effect_size(matching, cohort_median, n_boot=n_boot, seed=seed)
