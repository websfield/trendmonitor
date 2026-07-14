"""Provenance as a type, mirrored from the C# control plane.

ADR-0001 chose *structural* provenance over *documentary* provenance. The estimator in
``c1_pattern_engine.miner`` is Python, so the barrier that keeps a ``Proxy`` value out of an
effect-size calculation has to exist in Python too. A C#-only invariant is not an invariant
for the code that actually enforces it.

``tests/architecture/test_provenance_parity.py`` asserts this module and its C# twin accept
and reject exactly the same values.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

_LOG = logging.getLogger(__name__)

__all__ = [
    "Denominator",
    "MeasuredOutcome",
    "MixedProvenanceError",
    "Origin",
    "Provenance",
    "ProvenanceLaunderingError",
    "Provenanced",
    "Series",
    "ensure_homogeneous",
]


class Provenance(StrEnum):
    """REQ-002. Every metric carries one of these, together with an as-of date."""

    MEASURED = "Measured"
    """Read from a first-party analytics surface, or computed from one."""

    USER_PROVIDED = "User-provided"
    """Supplied by the client or creator; trusted but unverified."""

    ESTIMATED = "Estimated"
    """Derived, modelled, or projected. Includes every VPS, every AWS, every effect size."""

    PROXY = "Proxy"
    """An adjacent public source standing in for an unavailable measurement.

    Every keyless read is Proxy, without exception (ADR-0001, Tier 3). Corroboration by a
    second source upgrades a signal's *confidence*. It never upgrades its *provenance*.
    """


class Origin(StrEnum):
    """A fixture never reaches a client surface, and never enters the calibration dataset."""

    REAL = "real"
    FIXTURE = "fixture"


class Denominator(StrEnum):
    """REQ-030. Declared and period-stable. Rates on different denominators are not compared."""

    REACH = "reach"
    IMPRESSIONS = "impressions"
    FOLLOWERS = "followers"


class Series(StrEnum):
    """REQ-030. Organic and boosted are separate series and are *never summed*."""

    ORGANIC = "organic"
    BOOSTED = "boosted"


@dataclass(frozen=True, slots=True)
class Provenanced[T]:
    """A value that cannot be laundered: it carries its label wherever it travels."""

    value: T
    provenance: Provenance
    as_of: datetime
    origin: Origin = Origin.REAL

    @property
    def is_measurable(self) -> bool:
        return self.provenance in (Provenance.MEASURED, Provenance.USER_PROVIDED)


class ProvenanceLaunderingError(TypeError):
    """Raised when a non-measurable value is forced into a :class:`MeasuredOutcome`.

    This is the exception that makes ADR-0001 a type barrier in Python rather than a comment.
    """


@dataclass(frozen=True, slots=True)
class MeasuredOutcome:
    """The *only* type an effect-size calculation accepts (ADR-0001, REQ-008).

    Construct it with :meth:`try_from`, which returns ``None`` for ``Proxy`` and ``Estimated``.

    **Direct construction is guarded too.** A ``@dataclass`` generates a public ``__init__``, so
    ``MeasuredOutcome(1.41, Provenance.PROXY, as_of)`` would otherwise sail straight past
    ``try_from``. ``__post_init__`` closes that door, mirroring the C# twin's private constructor.
    Without it, the invariant holds only for callers who happened to use the front door — which is
    every caller until the one who doesn't.

    This is what makes *"a Proxy value never enters an effect-size calculation, at any weight,
    under any configuration"* a property of the type rather than a rule a reviewer must notice.
    Pattern *proposal* may read the exemplar corpus; pattern *estimation* may not::

        def estimate_effect_size(outcomes: Iterable[MeasuredOutcome]) -> EffectSize: ...

    An exemplar post's engagement is ``Proxy`` on every platform that matters, so it cannot be
    constructed into a ``MeasuredOutcome`` and therefore cannot reach the estimator. An estimator
    receiving ``None`` must *exclude* the observation, never impute it.
    """

    value: float
    provenance: Provenance
    as_of: datetime
    origin: Origin = Origin.REAL

    def __post_init__(self) -> None:
        if self.provenance not in (Provenance.MEASURED, Provenance.USER_PROVIDED):
            raise ProvenanceLaunderingError(
                f"Cannot construct a MeasuredOutcome from a {self.provenance!s} value. "
                "ADR-0001: a Proxy value never enters an effect-size calculation, at any weight, "
                "under any configuration. Pattern proposal reads both corpora; pattern estimation "
                "reads the internal corpus only. Use MeasuredOutcome.try_from() and exclude the "
                "observations it declines — never impute them."
            )

    @staticmethod
    def try_from(v: Provenanced[float]) -> MeasuredOutcome | None:
        if not v.is_measurable:
            return None
        return MeasuredOutcome(v.value, v.provenance, v.as_of, v.origin)

    @staticmethod
    def admit(values: Iterable[Provenanced[float]]) -> list[MeasuredOutcome]:
        """Filter a mixed corpus down to what may legitimately enter an estimate."""
        return [m for m in (MeasuredOutcome.try_from(v) for v in values) if m is not None]


class MixedProvenanceError(RuntimeError):
    """ADR-0001: the query layer refuses to aggregate across mixed provenance."""


def ensure_homogeneous(
    values: Sequence[Provenanced[float]],
    approved_override: tuple[str, str] | None = None,
    sink: Callable[[str], None] = _LOG.warning,
) -> Sequence[Provenanced[float]]:
    """Refuse to aggregate across mixed provenance without an explicit, *logged* override.

    ``approved_override`` is ``(approved_by, reason)``. The override is **logged**, not merely
    permitted — ADR-0001 says *explicit, logged*, and an override nobody can find afterwards is
    an override nobody agreed to. A reason is required: a click with no reason decays into a
    rubber stamp.
    """
    if not values:
        return values

    distinct = {v.provenance for v in values}
    if len(distinct) == 1:
        return values

    if approved_override is None:
        raise MixedProvenanceError(
            f"Refusing to aggregate across mixed provenance ({', '.join(sorted(distinct))}) "
            "without an explicit, logged override. Provenance is structural, not documentary "
            "(ADR-0001)."
        )

    approved_by, reason = approved_override
    if not reason.strip():
        raise MixedProvenanceError("A mixed-provenance override requires a recorded reason.")

    sink(
        f"MIXED_PROVENANCE_OVERRIDE by={approved_by} reason={reason} "
        f"provenances={','.join(sorted(distinct))}"
    )
    return values
