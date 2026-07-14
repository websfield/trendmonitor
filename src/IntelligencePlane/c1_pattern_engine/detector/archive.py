"""P7-T6 — auto-archive at ``valid_to``, and the store that keeps archived signals queryable.

A ``TrendSignal`` with no observation refresh inside its validity window is auto-archived and
leaves every feed. But it does **not** leave the store: archived signals remain queryable for
resolution, decay-curve fitting, and a mechanism's ``occasioned_by_trend_ids`` / ``n_trends``
(REQ-005h). A mechanism does not lose a trend when that trend dies.

Refresh state is tracked *beside* the signal, not on it — the handoff ``TrendSignal`` stays the
clean immutable contract Phase 8 consumes.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime
from uuid import UUID

from c1_pattern_engine.detector.signals import TrendSignal

__all__ = ["TrendSignalStore"]


class TrendSignalStore:
    """In-memory store (Phase 0/2 dataclass-store convention). Append-only in effect: a signal is
    never removed, only transitioned to ``archived``."""

    def __init__(self) -> None:
        self._signals: dict[UUID, TrendSignal] = {}
        self._last_refresh: dict[UUID, date] = {}

    def add(self, signal: TrendSignal, *, observed_at: date) -> None:
        self._signals[signal.id] = signal
        self._last_refresh[signal.id] = observed_at

    def refresh(
        self,
        signal_id: UUID,
        *,
        observed_at: date,
        extend_valid_to: date | None = None,
    ) -> None:
        """Record a fresh observation. Optionally extends ``valid_to`` to keep the signal alive."""
        signal = self._signals[signal_id]
        self._last_refresh[signal_id] = observed_at
        if extend_valid_to is not None:
            self._signals[signal_id] = replace(signal, valid_to=extend_valid_to)

    def archive_due(self, now: datetime) -> list[UUID]:
        """Archive every live signal whose window elapsed with no refresh inside it.

        Returns the ids archived. Idempotent: an already-archived signal is skipped.
        """
        archived: list[UUID] = []
        for signal_id, signal in list(self._signals.items()):
            if signal.is_archived:
                continue
            # REQ-005h: a signal past its validity window with no refresh *inside* that window is
            # archived. An out-of-window refresh does NOT keep it alive — only an explicit
            # extend_valid_to() (which raises valid_to, so this test then goes False) does. Testing
            # now.date() > valid_to directly is the truest form: a late refresh cannot resurrect a
            # signal whose window already closed.
            if now.date() > signal.valid_to:
                self._signals[signal_id] = replace(
                    signal, lifecycle_stage="archived", archived_at=now
                )
                archived.append(signal_id)
        return archived

    def get(self, signal_id: UUID) -> TrendSignal:
        """Fetch any signal by id, archived or not — the queryable path REQ-005h guarantees."""
        return self._signals[signal_id]

    def feed(self) -> list[TrendSignal]:
        """Live signals only. Archived signals have left every feed."""
        return [s for s in self._signals.values() if not s.is_archived]

    def query(self, *, include_archived: bool = True) -> list[TrendSignal]:
        """All signals when ``include_archived`` (the default) — archived trends stay reachable for
        ``n_trends``, decay-curve fitting, and resolution."""
        if include_archived:
            return list(self._signals.values())
        return self.feed()
