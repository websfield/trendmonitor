"""P6-T4 — Benjamini-Hochberg across the FULL candidate set.

The proposal stage is generous: it emits many candidate predicates, most of which will show a
spurious effect on any finite corpus. The correction for that is Benjamini-Hochberg FDR control
(`statsmodels.stats.multitest.multipletests`, method ``fdr_bh``) — but it only controls the false
discovery rate if it runs across **every** candidate tested, not across the ones that already
looked significant. Running BH over the survivors re-introduces exactly the multiplicity it is
meant to remove. So :func:`select_survivors` takes the whole candidate set and returns the subset
BH accepts.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from statsmodels.stats.multitest import multipletests

__all__ = ["DEFAULT_ALPHA", "BHResult", "benjamini_hochberg", "select_survivors"]

DEFAULT_ALPHA = 0.05


def benjamini_hochberg(p_values: Sequence[float], *, alpha: float = DEFAULT_ALPHA) -> list[bool]:
    """Return a reject mask over the FULL set of ``p_values`` (True = discovery survives BH-FDR)."""
    if not p_values:
        return []
    reject, _p_corrected, _a, _b = multipletests(list(p_values), alpha=alpha, method="fdr_bh")
    return [bool(r) for r in reject]


@dataclass(frozen=True, slots=True)
class BHResult[T]:
    """The outcome of correcting a candidate set. ``n_uncorrected`` is deliberately reported so a
    caller can *see* that BH changed the survivor count — the whole point of the guard."""

    survivors: tuple[T, ...]
    n_candidates: int
    n_uncorrected: int
    n_survivors: int


def select_survivors[T](
    candidates: Sequence[T],
    p_values: Sequence[float],
    *,
    alpha: float = DEFAULT_ALPHA,
) -> BHResult[T]:
    """Apply BH across the full candidate set and return the survivors.

    ``candidates`` and ``p_values`` are paired one-to-one over the *entire* set proposed. The
    uncorrected count (raw ``p < alpha``) is reported alongside so the correction is auditable.
    """
    if len(candidates) != len(p_values):
        raise ValueError(
            f"candidates ({len(candidates)}) and p_values ({len(p_values)}) must be paired "
            "one-to-one over the full candidate set — BH is never run over a filtered subset."
        )
    reject = benjamini_hochberg(p_values, alpha=alpha)
    survivors = tuple(c for c, keep in zip(candidates, reject, strict=True) if keep)
    n_uncorrected = sum(1 for p in p_values if p < alpha)
    return BHResult(
        survivors=survivors,
        n_candidates=len(candidates),
        n_uncorrected=n_uncorrected,
        n_survivors=len(survivors),
    )
