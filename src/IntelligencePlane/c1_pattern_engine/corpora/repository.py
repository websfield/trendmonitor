"""P6-T8 — the tenant-scoped pattern repository. No widening override.

A ``Pattern`` is estimated from *this tenant's* internal outcome corpus, so Tenant A's patterns
must never inform Tenant B's library (Rule 8). This repository enforces that structurally: a
pattern is stored under ``(tenant_id, vertical, platform)``, and :meth:`retrieve` requires all
three. There is **no parameter** that widens the query across tenants — not a flag, not an admin
scope, not a "cross-tenant" mode. A tenant boundary you can override from a keyword argument is a
comment; here the only key that reaches storage is the caller's own tenant.

Retrieval also applies the evidence gate: only ``active`` patterns are returned. An
``insufficient_evidence`` or ``stale`` pattern is retained (shipped in the artefact for
auditability) but never surfaced for scoring.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from c1_pattern_engine.miner.pattern import Pattern

__all__ = ["PatternRepository"]


class PatternRepository:
    """In-memory tenant-scoped store (Phase 0/2 dataclass-store convention).

    Keyed by ``(tenant_id, vertical, platform)``. Patterns are retained regardless of status; the
    status gate is applied at retrieval, so nothing is destroyed and the audit trail is complete.
    """

    def __init__(self) -> None:
        self._by_key: dict[tuple[UUID, str, str], list[Pattern]] = {}

    def add(self, pattern: Pattern) -> None:
        """Store a pattern under its own tenant/vertical/platform. It can land nowhere else."""
        key = (pattern.tenant_id, pattern.vertical, pattern.platform)
        self._by_key.setdefault(key, []).append(pattern)

    def retrieve(
        self, *, tenant_id: UUID, vertical: str, platform: str, as_of: date
    ) -> list[Pattern]:
        """Return the **active** patterns for exactly this tenant/vertical/platform.

        There is no widening parameter. A pattern that has gone stale by ``as_of`` is excluded even
        if it was stored ``active``, so an expired window never leaks into scoring.
        """
        key = (tenant_id, vertical, platform)
        patterns = self._by_key.get(key, ())
        return [
            p
            for p in patterns
            if p.evidence_status == "active" and as_of <= p.valid_to
        ]

    def all_for_audit(self, *, tenant_id: UUID, vertical: str, platform: str) -> list[Pattern]:
        """Every pattern for a cohort regardless of status — the auditability path.

        Still tenant-scoped: it cannot reach another tenant's patterns either. An
        ``insufficient_evidence`` or ``stale`` pattern appears here (shipped in the artefact) but
        never in :meth:`retrieve`.
        """
        return list(self._by_key.get((tenant_id, vertical, platform), ()))
