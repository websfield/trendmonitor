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

from c1_pattern_engine.detector.signals import Confidence, TrendSignal

__all__ = ["TrendSignalStore"]


class TrendSignalStore:
    """In-memory store (Phase 0/2 dataclass-store convention). Append-only in effect: a signal is
    never removed, only transitioned to ``archived``."""

    def __init__(self) -> None:
        self._signals: dict[UUID, TrendSignal] = {}
        self._last_refresh: dict[UUID, date] = {}

    def add(self, signal: TrendSignal, *, observed_at: date) -> None:
        existing = self._signals.get(signal.id)
        if existing is not None and existing.is_archived:
            # An archived signal is immutable history ("append-only in effect"). Overwriting it
            # would silently resurrect a dead episode and erase archived_at; a resurgence is a
            # new episode with a new first_seen — and therefore a new id (Phase 2 R2).
            raise ValueError(
                f"Signal {signal.id} is archived; archived history is never overwritten — "
                "a resurgence is a new episode with a new first_seen/id."
            )
        if existing is not None and existing.detection_origin != signal.detection_origin:
            # `detection_origin` is a BIRTH property, immutable for the life of a signal id: it
            # records how this episode came to EXIST, not what has since corroborated it. A
            # submission-born (human_sourced) signal that the scanner later also detects
            # regenerates the same id and would otherwise be silently overwritten with the
            # assembler's default `automated` — relabelling human coverage as automated and
            # overstating automated reach (the Phase 9 R3 conflation, in reverse). Corroboration
            # raises the CONFIDENCE rung via upgrade_confidence; it never rewrites origin.
            signal = replace(signal, detection_origin=existing.detection_origin)
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
        if signal.is_archived:
            # Same rule as add(): archived history is immutable; a late refresh cannot resurrect
            # or retro-edit a closed window (mirrors the add() guard — R4).
            raise ValueError(
                f"Signal {signal_id} is archived; archived history is never refreshed or "
                "extended — a resurgence is a new episode."
            )
        self._last_refresh[signal_id] = observed_at
        if extend_valid_to is not None:
            self._signals[signal_id] = replace(signal, valid_to=extend_valid_to)

    def upgrade_confidence(self, signal_id: UUID, *, to: Confidence) -> None:
        """Raise a live signal's confidence rung **in place** (Phase 9 human corroboration).

        Preserves ``_last_refresh`` (unlike ``add``, which would reset the refresh clock) and, by
        design, leaves ``detection_origin`` untouched — an automated signal that a human predated
        stays ``automated`` origin so coverage still counts it as automated (Phase 9 R3). Archived
        history is immutable: a late corroboration cannot reopen a closed window (mirrors ``add``).
        """
        signal = self._signals[signal_id]
        if signal.is_archived:
            raise ValueError(
                f"Signal {signal_id} is archived; archived history is never re-graded — "
                "a corroboration arriving after the window closed cannot reopen it."
            )
        self._signals[signal_id] = replace(signal, confidence=to)

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

    @staticmethod
    def _visible(signal: TrendSignal, for_tenant: UUID | None) -> bool:
        # Repository-layer tenancy (Rule 8): an internal signal is returned only to a query
        # carrying its tenant_id. There is no unfiltered read path a caller can forget to filter.
        return signal.scope == "public" or (
            for_tenant is not None and signal.tenant_id == for_tenant
        )

    def feed(self, *, for_tenant: UUID | None = None) -> list[TrendSignal]:
        """Live signals only — public, plus (with ``for_tenant``) that tenant's own internal ones.

        Archived signals have left every feed.
        """
        return [
            s
            for s in self._signals.values()
            if not s.is_archived and self._visible(s, for_tenant)
        ]

    def query(
        self, *, include_archived: bool = True, for_tenant: UUID | None = None
    ) -> list[TrendSignal]:
        """All visible signals when ``include_archived`` (the default) — archived trends stay
        reachable for ``n_trends``, decay-curve fitting, and resolution. Tenancy filtering
        applies exactly as in :meth:`feed`."""
        if include_archived:
            return [s for s in self._signals.values() if self._visible(s, for_tenant)]
        return self.feed(for_tenant=for_tenant)
