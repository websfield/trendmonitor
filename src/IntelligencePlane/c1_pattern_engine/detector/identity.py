"""The identity index — where a trend's persisted first-detection identity lives (Phase 3 R6).

``TrendSignalStore`` is id-keyed and ``TrendSignal`` carries no ``term``, so nothing else can
answer "have we seen this ``(scope, tenant, platform, vertical, term)`` before, and when?".
The index answers it: identity → (``first_seen``, ``signal_id``). The orchestrator consults it to
resolve ``first_seen`` per Phase 2 R2 (a live signal's persisted ``first_seen`` always wins over a
nightly-recomputed ``start_day``), which is what keeps signal ids stable when keyless sources
revise their windows.

In-memory this phase; Phase 4 makes it durable and adds ``first_detected_at`` (the store-add
event timestamp Phase 9's submitter scoring anchors on) plus the reverse lookup Phase 8 needs.
An archived identity's record is *kept* — but the orchestrator only reuses ``first_seen`` while
the recorded signal is live (new-episode semantics: an archived-then-resurging identity mints a
new signal).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

from c1_pattern_engine.detector.signals import Scope

__all__ = ["IdentityIndex", "IdentityRecord", "SignalIdentity"]


@dataclass(frozen=True, slots=True)
class SignalIdentity:
    """The business identity a deterministic signal id is minted from (Phase 2 R2)."""

    scope: Scope
    tenant_id: UUID | None
    platform: str
    vertical: str
    term: str


@dataclass(frozen=True, slots=True)
class IdentityRecord:
    first_seen: date
    signal_id: UUID
    first_detected_at: datetime | None = None
    """The store-add *event* timestamp (the injected ``as_of`` at 00:00 UTC — never wall-clock;
    Phase 4 R2). The internal, non-revisable anchor Phase 9's submitter scoring compares
    ``submitted_at`` against; ``None`` only on records written before Phase 4."""


class IdentityIndex:
    """identity ↔ (first_seen, first_detected_at, signal_id) — bidirectional (Phase 4 R2).

    Forward: the orchestrator resolves ``first_seen``. Reverse (``by_signal_id``): Phase 8
    resolves a verdict's ``trend_id`` back to its term. Append/overwrite by identity; never
    silently dropped.
    """

    def __init__(self) -> None:
        self._records: dict[SignalIdentity, IdentityRecord] = {}
        # Every episode ever recorded, keyed by its own signal id, in insertion order. A
        # resurgence overwrites the identity's *current* record but never an old episode's row —
        # Phase 8/9 must resolve a superseded id to ITS OWN dates, never the successor's.
        self._episodes: dict[UUID, tuple[SignalIdentity, IdentityRecord]] = {}

    def get(self, identity: SignalIdentity) -> IdentityRecord | None:
        return self._records.get(identity)

    def by_signal_id(self, signal_id: UUID) -> tuple[SignalIdentity, IdentityRecord] | None:
        """Episode-faithful reverse lookup: a superseded episode's id resolves to its own
        immutable record (or ``None`` if unknown) — never to the succeeding episode's dates."""
        return self._episodes.get(signal_id)

    def record(
        self,
        identity: SignalIdentity,
        *,
        first_seen: date,
        signal_id: UUID,
        first_detected_at: datetime | None = None,
    ) -> IdentityRecord:
        """Ordering invariant: episodes for an identity are recorded chronologically, and a
        superseded episode is never re-recorded after its successor — re-recording one would make
        the in-process current map diverge from the persistence replay. The orchestrator upholds
        this (it resolves through ``get(identity)`` and skips archived-id collisions)."""
        existing = self._records.get(identity)
        if (
            existing is not None
            and existing.signal_id == signal_id
            and first_detected_at is None
        ):
            # Same-episode re-record without a new detection event keeps the anchor immutable.
            # (A *new* episode never inherits the old anchor — the caller supplies its own.)
            first_detected_at = existing.first_detected_at
        rec = IdentityRecord(
            first_seen=first_seen, signal_id=signal_id, first_detected_at=first_detected_at
        )
        self._records[identity] = rec
        self._episodes[signal_id] = (identity, rec)
        return rec

    def items(self) -> list[tuple[SignalIdentity, IdentityRecord]]:
        return list(self._records.items())

    def episodes(self) -> list[tuple[SignalIdentity, IdentityRecord]]:
        """All episodes in insertion order (the persistence surface — replaying them through
        ``record`` rebuilds both the per-identity current map and the per-episode history)."""
        return list(self._episodes.values())
