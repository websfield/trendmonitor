"""The shared adapter machinery: ``TrendObservation``, ``DateRange``, and the no-imputation rule.

Every adapter is the same shape wrapped around a different keyless fetch. The fetch returns the
volumes it actually observed; a day with no data is *absent from the mapping*, and the adapter
leaves it absent. Nothing here fills a gap, averages across one, or carries a value forward.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Protocol

from substrate.provenance import Provenance, Provenanced

__all__ = [
    "AdapterDark",
    "DateRange",
    "RawVolumeFetch",
    "TrendAdapter",
    "TrendObservation",
    "build_adapter",
]


class AdapterDark(RuntimeError):
    """A keyless source went dark (404, shape change, rate limit).

    The caller freezes baselines for terms sourced only from this adapter and drops the affected
    signals to ``single_source`` or archives them at ``valid_to``. It **never** substitutes a
    volume — degraded coverage is surfaced, not papered over.
    """


@dataclass(frozen=True, slots=True)
class TrendObservation:
    """One volume reading for one term on one day from one source.

    The volume is ``Provenanced`` and its provenance is **always** ``Proxy`` — a keyless read can
    never be ``Measured``. Corroboration by a second source upgrades a *signal's confidence*; it
    never upgrades this observation's provenance (``__post_init__`` makes that a constructor error,
    not a review note).
    """

    term: str
    source: str
    day: date
    volume: Provenanced[float]

    def __post_init__(self) -> None:
        if self.volume.provenance is not Provenance.PROXY:
            raise ValueError(
                f"A keyless TrendObservation must be Proxy, got {self.volume.provenance!s}. "
                "Every keyless read is Proxy (ADR-0001, Tier 3); corroboration upgrades a "
                "signal's confidence, never an observation's provenance."
            )


@dataclass(frozen=True, slots=True)
class DateRange:
    """An inclusive span of calendar days."""

    start: date
    end: date

    def __post_init__(self) -> None:
        if self.end < self.start:
            raise ValueError(f"DateRange end {self.end} precedes start {self.start}.")

    def days(self) -> Iterator[date]:
        d = self.start
        while d <= self.end:
            yield d
            d += timedelta(days=1)


class RawVolumeFetch(Protocol):
    """The keyless read itself. Returns only the days it observed; may raise to signal darkness.

    A day it did not observe is simply **not a key** in the returned mapping. It is never a key
    mapped to ``0`` or ``None`` standing in for "we don't know" — absence is absence.
    """

    def __call__(self, term: str, span: DateRange) -> Mapping[date, float]: ...


class TrendAdapter(Protocol):
    name: str

    def observe(self, term: str, span: DateRange) -> list[TrendObservation]: ...


@dataclass(frozen=True, slots=True)
class _KeylessAdapter:
    name: str
    _fetch: RawVolumeFetch
    _as_of: datetime

    def observe(self, term: str, span: DateRange) -> list[TrendObservation]:
        try:
            raw = self._fetch(term, span)
        except AdapterDark:
            raise
        except Exception as exc:  # any transport/shape failure = the source is dark
            raise AdapterDark(f"{self.name} went dark for term {term!r}: {exc}") from exc

        observations: list[TrendObservation] = []
        for day, value in raw.items():
            # A gap is a gap. We emit only what was actually observed; nothing is imputed.
            observations.append(
                TrendObservation(
                    term=term,
                    source=self.name,
                    day=day,
                    volume=Provenanced(float(value), Provenance.PROXY, self._as_of),
                )
            )
        observations.sort(key=lambda o: o.day)
        return observations


def build_adapter(name: str, fetch: RawVolumeFetch, *, as_of: datetime) -> TrendAdapter:
    """Wrap a keyless fetch as an adapter. The wrapper stamps every reading ``Proxy``."""
    return _KeylessAdapter(name=name, _fetch=fetch, _as_of=as_of)
