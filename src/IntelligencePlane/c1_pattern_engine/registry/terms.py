"""The tracked-term registry (P7-T1).

A *tracked term* is a string the keyless scanner (P7-T3) computes a robust-z against. Terms enter
from five origins, carry a deterministic priority, and are capped at 250 per
``(vertical, platform)``. When the cap is hit the lowest-priority term is evicted **to cold
storage, not to nothing** — and a term unseen for 90 days evicts the same way. Cold storage is
append-only and queryable; nothing here is ever deleted.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

__all__ = [
    "CAP_PER_VERTICAL_PLATFORM",
    "EVICTION_DAYS",
    "AdmissionOrigin",
    "TermRegistry",
    "TrackedTerm",
]

CAP_PER_VERTICAL_PLATFORM = 250
EVICTION_DAYS = 90


class AdmissionOrigin(StrEnum):
    """The five ways a term earns a place in the registry."""

    SCHEDULED_SCAN = "scheduled_scan"
    """The keyless scanner saw volume worth tracking."""

    HUMAN_SUBMISSION = "human_submission"
    """A manager/client/resolver put a candidate trend on the board (REQ-005a)."""

    MECHANISM_OCCASION = "mechanism_occasion"
    """A mechanism named this trend in ``occasioned_by_trend_ids`` — the corpus builder wants it."""

    CLIENT_BRIEF = "client_brief"
    """A stored brief named a format/sound/hashtag/topic to watch."""

    EDITORIAL_SEED = "editorial_seed"
    """A hand-seeded term, lowest standing priority; earns its keep or evicts."""


# Deterministic origin weights. Human intent outranks the scanner; an editorial seed is the
# first thing evicted when the cap bites.
_ORIGIN_WEIGHT: dict[AdmissionOrigin, float] = {
    AdmissionOrigin.HUMAN_SUBMISSION: 1.0,
    AdmissionOrigin.CLIENT_BRIEF: 0.9,
    AdmissionOrigin.MECHANISM_OCCASION: 0.7,
    AdmissionOrigin.SCHEDULED_SCAN: 0.5,
    AdmissionOrigin.EDITORIAL_SEED: 0.2,
}


@dataclass(frozen=True, slots=True)
class TrackedTerm:
    """One tracked term in one ``(vertical, platform)`` bucket."""

    term: str
    vertical: str
    platform: str
    origin: AdmissionOrigin
    admitted_at: datetime
    last_activity_at: datetime

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.term, self.vertical, self.platform)

    @property
    def bucket(self) -> tuple[str, str]:
        return (self.vertical, self.platform)

    def priority(self, now: datetime) -> float:
        """Origin weight plus a linear recency bonus that decays over the eviction horizon.

        Deterministic and total-order-able so eviction is never a coin toss. A term seen today
        ranks above the same-origin term last seen 60 days ago.
        """
        idle_days = max(0.0, (now - self.last_activity_at).total_seconds() / 86400.0)
        recency = max(0.0, 1.0 - idle_days / EVICTION_DAYS)
        return _ORIGIN_WEIGHT[self.origin] + recency


class TermRegistry:
    """In-memory registry (matches Phase 0/2's dataclass-store convention; no live DB stood up).

    Active terms live in ``_active`` keyed by ``(term, vertical, platform)``. Everything evicted —
    by cap pressure or by 90-day staleness — moves to ``_cold``, which is append-only.
    """

    def __init__(self) -> None:
        self._active: dict[tuple[str, str, str], TrackedTerm] = {}
        self._cold: list[TrackedTerm] = []

    def admit(self, term: TrackedTerm) -> TrackedTerm:
        """Admit or refresh a term. Enforces the per-bucket cap by evicting the lowest priority.

        Re-admitting an existing key refreshes ``last_activity_at`` (and never trips the cap).
        """
        existing = self._active.get(term.key)
        if existing is not None:
            refreshed = TrackedTerm(
                term=existing.term,
                vertical=existing.vertical,
                platform=existing.platform,
                origin=existing.origin,
                admitted_at=existing.admitted_at,
                last_activity_at=term.last_activity_at,
            )
            self._active[term.key] = refreshed
            return refreshed

        bucket_members = [t for t in self._active.values() if t.bucket == term.bucket]
        if len(bucket_members) >= CAP_PER_VERTICAL_PLATFORM:
            victim = min(bucket_members, key=lambda t: t.priority(term.admitted_at))
            # A newcomer of higher priority displaces the weakest; else it goes straight to cold.
            if victim.priority(term.admitted_at) >= term.priority(term.admitted_at):
                self._cold.append(term)
                return term
            self._evict(victim)

        self._active[term.key] = term
        return term

    def _evict(self, term: TrackedTerm) -> None:
        self._active.pop(term.key, None)
        self._cold.append(term)

    def evict_stale(self, now: datetime) -> list[TrackedTerm]:
        """Evict every term unseen for ``EVICTION_DAYS`` to cold storage. Returns the evicted."""
        stale = [
            t
            for t in self._active.values()
            if (now - t.last_activity_at).total_seconds() / 86400.0 > EVICTION_DAYS
        ]
        for t in stale:
            self._evict(t)
        return stale

    def active(self) -> list[TrackedTerm]:
        return list(self._active.values())

    def active_in(self, vertical: str, platform: str) -> list[TrackedTerm]:
        return [t for t in self._active.values() if t.bucket == (vertical, platform)]

    def cold_storage(self) -> list[TrackedTerm]:
        """Queryable, append-only. Nothing admitted here is ever deleted."""
        return list(self._cold)

    def ranked(self, now: datetime) -> list[TrackedTerm]:
        return sorted(self._active.values(), key=lambda t: t.priority(now), reverse=True)
