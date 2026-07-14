"""P7-T1 — the tracked-term registry.

Five admission origins, a deterministic priority function, a cap of 250 per
``(vertical, platform)``, and 90-day eviction to cold storage. Evicted terms are **never
deleted** — cold storage stays queryable so a term that quiets down and re-emerges is not
mistaken for a brand-new one.
"""

from __future__ import annotations

from c1_pattern_engine.registry.terms import (
    CAP_PER_VERTICAL_PLATFORM,
    EVICTION_DAYS,
    AdmissionOrigin,
    TermRegistry,
    TrackedTerm,
)

__all__ = [
    "CAP_PER_VERTICAL_PLATFORM",
    "EVICTION_DAYS",
    "AdmissionOrigin",
    "TermRegistry",
    "TrackedTerm",
]
