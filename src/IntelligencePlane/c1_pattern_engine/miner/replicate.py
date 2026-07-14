"""P6-T5 — temporal replication and the prior-quarter back-test.

Two of the three promotion guards live here (the third, Benjamini-Hochberg, is in
``multiplicity``):

* **Temporal replication** — a pattern mined on period 1 must confirm on period 2. The two periods
  are *separate corpora, temporally disjoint* — this is never a random split, and there is no
  splitter here that could become one. Confirmation means both slices show an effect with a CI
  excluding zero and the *same sign*.
* **Back-test** — the pattern is evaluated against the prior quarter before it can influence a
  score. A pattern that replicates but back-tests poorly is not rejected: it is promoted **with a
  note and watched**, so the note is recorded rather than the pattern silently dropped or silently
  trusted.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from c1_pattern_engine.miner.estimate import BOOTSTRAP_ITERATIONS, estimate_predicate
from c1_pattern_engine.miner.model import CandidatePredicate, InternalPost
from c1_pattern_engine.miner.pattern import EffectSize

__all__ = ["Replication", "replicate"]

BACKTEST_POOR_NOTE = "replicated but back-tested poorly against the prior quarter; watched"


def _same_sign(a: float, b: float) -> bool:
    return (a > 0 and b > 0) or (a < 0 and b < 0)


@dataclass(frozen=True, slots=True)
class Replication:
    """The replication + back-test result for one predicate."""

    period_1: EffectSize
    period_2: EffectSize
    prior_quarter: EffectSize
    replicated: bool
    backtest_passed: bool
    note: str | None


def replicate(
    predicate: CandidatePredicate,
    *,
    period_1: Iterable[InternalPost],
    period_2: Iterable[InternalPost],
    prior_quarter: Iterable[InternalPost],
    n_boot: int = BOOTSTRAP_ITERATIONS,
    seed: int = 0,
) -> Replication:
    """Estimate on three temporally-disjoint corpora and judge replication + back-test.

    ``period_1``, ``period_2``, and ``prior_quarter`` are separate corpora passed in explicitly —
    the temporal boundary is a property of the data, never a split computed here.
    """
    e1 = estimate_predicate(predicate, period_1, n_boot=n_boot, seed=seed)
    e2 = estimate_predicate(predicate, period_2, n_boot=n_boot, seed=seed)
    bt = estimate_predicate(predicate, prior_quarter, n_boot=n_boot, seed=seed)

    replicated = (
        e1.ci_excludes_zero
        and e2.ci_excludes_zero
        and _same_sign(e1.lift, e2.lift)
    )
    backtest_passed = bt.ci_excludes_zero and _same_sign(bt.lift, e1.lift)

    note: str | None = None
    if replicated and not backtest_passed:
        # Not a rejection: promoted with a note and watched.
        note = BACKTEST_POOR_NOTE

    return Replication(
        period_1=e1,
        period_2=e2,
        prior_quarter=bt,
        replicated=replicated,
        backtest_passed=backtest_passed,
        note=note,
    )
