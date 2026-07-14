"""P7-T2 — keyless source adapters.

Seven public, keyless sources, each a pure ``(term, date_range) -> [TrendObservation]``,
independently deployable, independently failing, independently disabled. **Every read is
``Proxy``** (ADR-0001, Tier 3). When a source goes dark an adapter raises :class:`AdapterDark`
and returns nothing — it **never imputes a missing volume**, because a z-score computed across an
imputed gap is a fabrication with a decimal point.
"""

from __future__ import annotations

from c1_pattern_engine.adapters.base import (
    AdapterDark,
    DateRange,
    RawVolumeFetch,
    TrendAdapter,
    TrendObservation,
    build_adapter,
)
from c1_pattern_engine.adapters.sources import SOURCE_NAMES, all_adapters

__all__ = [
    "SOURCE_NAMES",
    "AdapterDark",
    "DateRange",
    "RawVolumeFetch",
    "TrendAdapter",
    "TrendObservation",
    "all_adapters",
    "build_adapter",
]
