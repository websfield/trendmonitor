"""P6-T3 — arm conditioning (ADR-0003 confounding-by-treatment).

A post that was amplified performed better partly *because* it was amplified. So an effect size
estimated on exploit-arm data is confounded: it is an **upper bound requiring replication**, not a
settled magnitude. Explore-arm data is the unconfounded evidence, so where the explore arm has
enough matching posts we estimate on it; otherwise we fall back to the exploit arm and flag the
result as a ceiling. Where neither is honest, the caller lets the pattern rest at
``insufficient_evidence`` indefinitely — there is no deadline.

**Equal weighting (REQ-053).** An explore-arm outcome and an exploit-arm outcome count the *same*
when they enter an estimate. The arm decides *which* estimate is trustworthy and how it is labelled;
it never becomes a per-outcome weight. :data:`ARM_WEIGHT` makes that explicit and equal.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from c1_pattern_engine.miner.estimate import BOOTSTRAP_ITERATIONS, estimate_predicate
from c1_pattern_engine.miner.model import CandidatePredicate, InternalPost
from c1_pattern_engine.miner.pattern import Arm, EffectSize

__all__ = [
    "ARM_WEIGHT",
    "EXPLORE_MIN_N",
    "ArmedEstimate",
    "estimate_with_arm",
]

# REQ-053: explore and exploit outcomes are weighted EQUALLY when updating the library.
ARM_WEIGHT: dict[Arm, float] = {"explore": 1.0, "exploit": 1.0}

# The explore arm must have at least this many matching posts before we trust it over the exploit
# arm. Same as the evidence floor: below it, explore is not yet "where n permits".
EXPLORE_MIN_N = 30


@dataclass(frozen=True, slots=True)
class ArmedEstimate:
    """An effect estimate plus which arm it came from and whether it is an upper bound."""

    effect: EffectSize
    evidence_arm: Arm
    is_upper_bound: bool


def estimate_with_arm(
    predicate: CandidatePredicate,
    internal_corpus: Iterable[InternalPost],
    *,
    n_boot: int = BOOTSTRAP_ITERATIONS,
    seed: int = 0,
) -> ArmedEstimate:
    """Estimate a predicate, preferring the unconfounded explore arm.

    Estimates on the explore arm when it has ``>= EXPLORE_MIN_N`` matching posts (``is_upper_bound``
    is then False). Otherwise estimates on the exploit arm and marks the result an upper bound
    pending replication. Both arms weight their outcomes equally (:data:`ARM_WEIGHT`).
    """
    posts = list(internal_corpus)

    explore = estimate_predicate(predicate, posts, arm="explore", n_boot=n_boot, seed=seed)
    if explore.n >= EXPLORE_MIN_N:
        return ArmedEstimate(effect=explore, evidence_arm="explore", is_upper_bound=False)

    exploit = estimate_predicate(predicate, posts, arm="exploit", n_boot=n_boot, seed=seed)
    return ArmedEstimate(effect=exploit, evidence_arm="exploit", is_upper_bound=True)
