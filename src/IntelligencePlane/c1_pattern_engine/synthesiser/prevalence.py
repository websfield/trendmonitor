"""P8-T3 — prevalence counting, with **undefined-on-zero-contrast** (Rule 9).

Prevalence is a **count over a proxy-selected set**, not an aggregation of proxy *values*. The
top-decile membership was decided using ``Proxy`` engagement (a selection); the predicate is then
evaluated **deterministically** over the ``FeatureRecord`` extracted from the media. No ``Proxy``
value is aggregated, displayed, or compared as ``Measured`` — the ADR-0001 hard invariant holds no
matter where the resulting number travels. Label: ``Proxy-selected, Measured-evaluated``.

Two disciplines:

* **Absence is not a zero.** A record for which the predicate is *unmeasured* (its completeness
  flag is False) is excluded from **both** numerator and denominator — never counted as a
  measured zero. A gap is a gap.
* **Zero contrast is undefined, not infinite.** When ``prevalence_in_contrast_set == 0`` the ratio
  is **undefined** (``None``); the mechanism stays ``conjectured`` and the zero is surfaced. *"A
  predicate absent from every non-winner is more likely a corpus artefact than a discovery."*

Counts are computed at the corpus snapshot, so they **survive URI death**: a source post deleted
after the snapshot leaves its ``FeatureRecord`` — and therefore its count — intact.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from c1_pattern_engine.corpora.exemplar import ExemplarPost
from c1_pattern_engine.synthesiser.propose import FeaturePredicate

__all__ = ["PrevalenceResult", "compute_prevalence", "prevalence_over"]


@dataclass(frozen=True, slots=True)
class PrevalenceResult:
    """The counts and prevalences for one predicate over one cohort's two retained sets."""

    n_top_decile_evaluable: int
    n_top_decile_satisfied: int
    n_contrast_evaluable: int
    n_contrast_satisfied: int
    prevalence_in_top_decile: float
    prevalence_in_contrast_set: float
    prevalence_ratio: float | None

    @property
    def ratio_undefined(self) -> bool:
        """True when the contrast prevalence is 0 — the ratio is undefined, not infinite."""
        return self.prevalence_ratio is None


def prevalence_over(
    predicate: FeaturePredicate, posts: Iterable[ExemplarPost]
) -> tuple[int, int, float]:
    """Return ``(n_evaluable, n_satisfied, prevalence)`` for one set.

    Unmeasured records (completeness flag False) are excluded from both counts. ``prevalence`` is
    ``0.0`` over an empty evaluable set — a real zero denominator, surfaced by ``n_evaluable``.
    """
    n_eval = 0
    n_sat = 0
    for post in posts:
        record = post.feature_record
        if not predicate.evaluable(record):
            continue
        n_eval += 1
        if predicate.satisfied(record):
            n_sat += 1
    prevalence = n_sat / n_eval if n_eval else 0.0
    return n_eval, n_sat, prevalence


def compute_prevalence(
    predicate: FeaturePredicate,
    top_decile: Iterable[ExemplarPost],
    contrast_set: Iterable[ExemplarPost],
) -> PrevalenceResult:
    """Count the predicate over the top-decile and contrast sets, within one cohort.

    Never pooled across cohorts — *"two (vertical, platform) populations are not one population."*
    When the contrast prevalence is 0 the ratio is ``None`` (undefined); the zero is preserved in
    ``prevalence_in_contrast_set`` so it can be surfaced rather than hidden.
    """
    top_eval, top_sat, top_prev = prevalence_over(predicate, top_decile)
    con_eval, con_sat, con_prev = prevalence_over(predicate, contrast_set)

    ratio = top_prev / con_prev if con_prev > 0 else None

    return PrevalenceResult(
        n_top_decile_evaluable=top_eval,
        n_top_decile_satisfied=top_sat,
        n_contrast_evaluable=con_eval,
        n_contrast_satisfied=con_sat,
        prevalence_in_top_decile=top_prev,
        prevalence_in_contrast_set=con_prev,
        prevalence_ratio=ratio,
    )
