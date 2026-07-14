"""P8-T4 — the warrant ladder, deterministic from corpus counts (REQ-064).

``warrant ∈ {conjectured, recurrent, contrasted, falsified, retired}``. What you are permitted to
*say*, given what you have *observed*. Every rung is a function of counts and prevalence ratios —
never of a human's optimism, never of a proxy *value* aggregated into a magnitude.

* ``recurrent`` — ``n_creators ≥ 8 ∧ n_cohorts ≥ 2 ∧ n_trends ≥ 2``. ``n_creators`` counts
  **distinct** creators; ``n_trends`` counts **unrelated** trends. A predicate carried by only one
  trend stays ``conjectured`` no matter how many creators carry it — *"one trend is a trend"*.
* ``contrasted`` — additionally ``prevalence_ratio ≥ 2.0`` on the mining slice **and** ``≥ 1.5`` on
  a temporally disjoint slice, over ``≥ 2`` ordered, non-overlapping ``temporal_slices``.
* When the prevalence ratio is **undefined** (contrast prevalence is 0, or no contrast set exists),
  the mechanism stays ``conjectured`` and the zero is surfaced (REQ-065b; Rule 9).

``falsified`` and ``retired`` are lifecycle transitions (P8-T7 / supersession), not outputs of
:func:`compute_warrant`.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from itertools import pairwise

__all__ = [
    "DISJOINT_SLICE_RATIO_THRESHOLD",
    "MINING_SLICE_RATIO_THRESHOLD",
    "RECURRENT_MIN_COHORTS",
    "RECURRENT_MIN_CREATORS",
    "RECURRENT_MIN_TRENDS",
    "Evidence",
    "OverlappingSlicesError",
    "TemporalSlice",
    "Warrant",
    "WarrantInputs",
    "assert_disjoint_slices",
    "compute_warrant",
    "slices_are_ordered_disjoint",
]

RECURRENT_MIN_CREATORS = 8
RECURRENT_MIN_COHORTS = 2
RECURRENT_MIN_TRENDS = 2
MINING_SLICE_RATIO_THRESHOLD = 2.0
DISJOINT_SLICE_RATIO_THRESHOLD = 1.5


class Warrant(StrEnum):
    CONJECTURED = "conjectured"
    RECURRENT = "recurrent"
    CONTRASTED = "contrasted"
    FALSIFIED = "falsified"
    RETIRED = "retired"


class OverlappingSlicesError(ValueError):
    """Temporal slices are not ordered and non-overlapping (``slice[i].to <= slice[i+1].from``)."""


@dataclass(frozen=True, slots=True)
class TemporalSlice:
    """One temporal window a prevalence ratio was computed over. ``from``/``to`` in the schema."""

    from_date: date
    to: date
    prevalence_ratio: float | None

    def to_dict(self) -> dict[str, object]:
        return {
            "from": self.from_date.isoformat(),
            "to": self.to.isoformat(),
            "prevalence_ratio": self.prevalence_ratio,
        }


@dataclass(frozen=True, slots=True)
class Evidence:
    """The corpus counts and prevalences a warrant is computed from — carries **no effect size**."""

    n_exemplars: int
    n_creators: int
    n_cohorts: int
    n_trends: int
    prevalence_in_top_decile: float
    prevalence_in_contrast_set: float
    prevalence_ratio: float | None
    temporal_slices: tuple[TemporalSlice, ...]
    contrast_set_definition: str

    def to_dict(self) -> dict[str, object]:
        return {
            "n_exemplars": self.n_exemplars,
            "n_creators": self.n_creators,
            "n_cohorts": self.n_cohorts,
            "n_trends": self.n_trends,
            "prevalence_in_top_decile": self.prevalence_in_top_decile,
            "prevalence_in_contrast_set": self.prevalence_in_contrast_set,
            "prevalence_ratio": self.prevalence_ratio,
            "contrast_set_definition": self.contrast_set_definition,
            "temporal_slices": [s.to_dict() for s in self.temporal_slices],
        }


def slices_are_ordered_disjoint(slices: Sequence[TemporalSlice]) -> bool:
    """True iff every slice is well-formed and consecutive slices do not overlap.

    ``slice[i].to <= slice[i+1].from`` — the cross-item comparison JSON Schema cannot express, so
    the synthesiser owns it (REQ-065a). Empty and single-slice sequences are trivially disjoint.
    """
    if any(s.from_date > s.to for s in slices):
        return False
    return all(a.to <= b.from_date for a, b in pairwise(slices))


def assert_disjoint_slices(slices: Sequence[TemporalSlice]) -> None:
    """Raise :class:`OverlappingSlicesError` unless the slices are ordered and non-overlapping.

    Called by the synthesiser when it constructs a ``contrasted`` mechanism and **re-checked at
    ratification** — the same rule enforced twice, because a laundered overlap is exactly what a
    single check misses (REQ-065a)."""
    if not slices_are_ordered_disjoint(slices):
        raise OverlappingSlicesError(
            "temporal_slices must be ordered and non-overlapping (slice[i].to <= slice[i+1].from). "
            "A `contrasted` mechanism mined on slice 1 and confirmed on slice 2 needs the two "
            "windows disjoint; JSON Schema cannot express this cross-item comparison, so the "
            "synthesiser enforces it and ratification re-checks it (REQ-065a)."
        )


def compute_warrant(
    *,
    n_creators: int,
    n_cohorts: int,
    n_trends: int,
    prevalence_ratio: float | None,
    mining_slice_ratio: float | None,
    disjoint_slice_ratio: float | None,
    temporal_slices: Sequence[TemporalSlice],
) -> Warrant:
    """The warrant rung, purely from counts and ratios. Deterministic, no human input.

    ``prevalence_ratio`` is the whole-cohort (mining) ratio; ``None`` means **undefined** — the
    contrast prevalence was 0 or there is no contrast set, so the mechanism cannot leave
    ``conjectured`` (REQ-065b, Rule 9). ``mining_slice_ratio`` / ``disjoint_slice_ratio`` are the
    per-slice ratios the ``contrasted`` rung requires.
    """
    if prevalence_ratio is None:
        return Warrant.CONJECTURED

    recurrent = (
        n_creators >= RECURRENT_MIN_CREATORS
        and n_cohorts >= RECURRENT_MIN_COHORTS
        and n_trends >= RECURRENT_MIN_TRENDS
    )
    if not recurrent:
        return Warrant.CONJECTURED

    contrasted = (
        mining_slice_ratio is not None
        and mining_slice_ratio >= MINING_SLICE_RATIO_THRESHOLD
        and disjoint_slice_ratio is not None
        and disjoint_slice_ratio >= DISJOINT_SLICE_RATIO_THRESHOLD
        and len(temporal_slices) >= 2
        and slices_are_ordered_disjoint(temporal_slices)
    )
    return Warrant.CONTRASTED if contrasted else Warrant.RECURRENT


@dataclass(frozen=True, slots=True)
class WarrantInputs:
    """The full input set :func:`compute_warrant` needs, packaged as one value.

    This is the **single source of truth** the warrant ladder is computed from — the same object
    shape produced at synthesis-time promotion and recomputed at refresh-time demotion, so the two
    can never silently drift on the four criteria that gate ``contrasted`` (REQ-064). ``.warrant()``
    is exactly :func:`compute_warrant`; there is no second rung function to diverge from it.
    """

    n_creators: int
    n_cohorts: int
    n_trends: int
    prevalence_ratio: float | None
    mining_slice_ratio: float | None
    disjoint_slice_ratio: float | None
    temporal_slices: tuple[TemporalSlice, ...]

    def warrant(self) -> Warrant:
        """The recomputed rung — ``conjectured``/``recurrent``/``contrasted`` (never ``falsified``,
        a lifecycle transition owned by demotion/supersession)."""
        return compute_warrant(
            n_creators=self.n_creators,
            n_cohorts=self.n_cohorts,
            n_trends=self.n_trends,
            prevalence_ratio=self.prevalence_ratio,
            mining_slice_ratio=self.mining_slice_ratio,
            disjoint_slice_ratio=self.disjoint_slice_ratio,
            temporal_slices=self.temporal_slices,
        )
