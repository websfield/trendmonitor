"""ADR-0001 / REQ-008, enforced in the language that enforces it.

Phase 6's estimator is Python. If ``MeasuredOutcome`` exists only in C#, then "a Proxy value
cannot enter an effect-size calculation" is a comment, not a type error.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

import pytest

from substrate.provenance import (
    MeasuredOutcome,
    MixedProvenanceError,
    Origin,
    Provenance,
    Provenanced,
    ProvenanceLaunderingError,
    ensure_homogeneous,
)

AS_OF = datetime(2026, 7, 1, tzinfo=UTC)
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provenance-parity.json"


def value(p: Provenance) -> Provenanced[float]:
    return Provenanced(1.41, p, AS_OF)


# --- the invariant, in one assertion ------------------------------------------------------


def test_proxy_cannot_become_measured_outcome() -> None:
    assert MeasuredOutcome.try_from(value(Provenance.PROXY)) is None


def test_estimated_cannot_become_measured_outcome() -> None:
    assert MeasuredOutcome.try_from(value(Provenance.ESTIMATED)) is None


@pytest.mark.parametrize("p", [Provenance.MEASURED, Provenance.USER_PROVIDED])
def test_measurable_provenance_becomes_measured_outcome(p: Provenance) -> None:
    assert MeasuredOutcome.try_from(value(p)) is not None


# --- the front door is not the only door ---------------------------------------------------
#
# A @dataclass generates a public __init__. Guarding only `try_from` leaves the invariant true
# for every caller who happened to use the front door — which is every caller until the one who
# doesn't. These four tests are the ones whose absence let a Proxy value into an effect size.


@pytest.mark.parametrize("p", [Provenance.PROXY, Provenance.ESTIMATED])
def test_direct_construction_from_a_nonmeasurable_value_is_refused(p: Provenance) -> None:
    with pytest.raises(ProvenanceLaunderingError):
        MeasuredOutcome(1.41, p, AS_OF)


@pytest.mark.parametrize("p", [Provenance.MEASURED, Provenance.USER_PROVIDED])
def test_direct_construction_from_a_measurable_value_is_allowed(p: Provenance) -> None:
    assert MeasuredOutcome(1.41, p, AS_OF).provenance is p


def test_dataclass_replace_cannot_launder_a_proxy_value() -> None:
    """`dataclasses.replace` re-runs __post_init__, so it cannot smuggle a label past the guard."""
    import dataclasses

    measured = MeasuredOutcome(1.41, Provenance.MEASURED, AS_OF)
    with pytest.raises(ProvenanceLaunderingError):
        dataclasses.replace(measured, provenance=Provenance.PROXY)


def test_estimator_signature_admits_only_measured_outcomes() -> None:
    """The estimator's *type* is the invariant.

    A mixed corpus reaches ``admit``; only the internal-corpus half survives into the estimate.
    An exemplar's Proxy engagement contributes a candidate predicate and a retrieval anchor —
    never a number.
    """

    def estimate_effect_size(outcomes: Iterable[MeasuredOutcome]) -> float:
        vals = [o.value for o in outcomes]
        return sum(vals) / len(vals) if vals else 0.0

    mixed_corpus = [
        value(Provenance.MEASURED),       # internal corpus
        value(Provenance.PROXY),          # exemplar corpus — must not contribute a number
        value(Provenance.USER_PROVIDED),  # client export
        value(Provenance.ESTIMATED),      # a VPS. Never an input to an effect size.
    ]

    admitted = MeasuredOutcome.admit(mixed_corpus)

    assert len(admitted) == 2
    assert all(o.provenance in (Provenance.MEASURED, Provenance.USER_PROVIDED) for o in admitted)
    assert estimate_effect_size(admitted) == pytest.approx(1.41)


def test_fixture_origin_is_carried_through() -> None:
    fixture = Provenanced(1.0, Provenance.MEASURED, AS_OF, Origin.FIXTURE)
    admitted = MeasuredOutcome.try_from(fixture)
    assert admitted is not None
    assert admitted.origin is Origin.FIXTURE  # so a client-facing surface can refuse it


# --- ADR-0001's mixed-provenance aggregation guard ----------------------------------------


def test_mixed_provenance_requires_logged_override() -> None:
    with pytest.raises(MixedProvenanceError):
        ensure_homogeneous([value(Provenance.MEASURED), value(Provenance.PROXY)])


def test_homogeneous_provenance_aggregates() -> None:
    assert len(ensure_homogeneous([value(Provenance.MEASURED), value(Provenance.MEASURED)])) == 2


def test_override_without_a_reason_is_refused() -> None:
    with pytest.raises(MixedProvenanceError):
        ensure_homogeneous(
            [value(Provenance.MEASURED), value(Provenance.PROXY)],
            approved_override=("a-human", "   "),
        )


def test_override_with_a_reason_is_allowed_and_logged() -> None:
    """ADR-0001 says *explicit, logged*. An override nobody can find afterwards is an override
    nobody agreed to."""
    logged: list[str] = []
    out = ensure_homogeneous(
        [value(Provenance.MEASURED), value(Provenance.PROXY)],
        approved_override=("a-human", "backfill audit 2026-07"),
        sink=logged.append,
    )
    assert len(out) == 2
    assert len(logged) == 1
    assert "MIXED_PROVENANCE_OVERRIDE" in logged[0]
    assert "a-human" in logged[0]
    assert "backfill audit 2026-07" in logged[0]


# --- cross-language parity ----------------------------------------------------------------


def test_python_matches_the_shared_parity_fixture() -> None:
    """The C# suite reads this same table. A divergence means one plane launders a Proxy value."""
    table = json.loads(FIXTURES.read_text(encoding="utf-8"))["admits_to_measured_outcome"]

    for row in table:
        provenance = Provenance(row["provenance"])
        admitted = MeasuredOutcome.try_from(value(provenance)) is not None
        assert admitted == row["admitted"], (
            f"Python admits {provenance!s} = {admitted}, fixture says {row['admitted']}. "
            f"{row['why']}"
        )
