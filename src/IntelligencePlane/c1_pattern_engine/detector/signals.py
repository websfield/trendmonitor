"""``TrendSignal`` — the handoff artefact — and the confidence ladder.

The handoff contract (consumed by Phase 8, **never** by C2's scorer): a signal carries a scope, a
tenant only when internal, a platform/vertical/kind, a lifecycle stage, a confidence rung, and a
validity window. It carries **no float a scorer could read** — no effect size, no weight, no
score. That absence is the whole point of REQ-005e, and the structural test asserts it.

The confidence ladder is where corroboration lives. A second source agreeing lifts
``single_source -> corroborated``; a human submission that predates automated corroboration lifts
to ``human_corroborated``. **None of these touch provenance** — a keyless read stays ``Proxy``
forever (that is enforced one layer down, on ``TrendObservation``).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal
from uuid import UUID

__all__ = [
    "Confidence",
    "Kind",
    "LifecycleStage",
    "Scope",
    "TrendSignal",
    "assess_confidence",
]

Scope = Literal["public", "internal"]
Kind = Literal["format", "sound", "hashtag", "topic", "aesthetic"]
LifecycleStage = Literal["candidate", "rising", "peak", "declining", "archived"]
Confidence = Literal["single_source", "corroborated", "human_corroborated"]


@dataclass(frozen=True, slots=True)
class TrendSignal:
    """Consumed by P8 (ingestion priority; ``occasioned_by_trend_ids``; ``n_trends``).

    **Never** by C2's scorer. Deliberately exposes no numeric accessor — see the structural guard
    ``test_trend_never_enters_vps``.
    """

    id: UUID
    scope: Scope
    tenant_id: UUID | None  # non-null iff internal
    platform: str
    vertical: str
    kind: Kind
    lifecycle_stage: LifecycleStage
    confidence: Confidence
    valid_to: date
    archived_at: datetime | None = None

    def __post_init__(self) -> None:
        # Rule 8: an internal trend is tenant-scoped and never crosses; a public one has no tenant.
        if self.scope == "internal" and self.tenant_id is None:
            raise ValueError(
                "An internal TrendSignal is tenant-scoped and must carry a tenant_id (Rule 8)."
            )
        if self.scope == "public" and self.tenant_id is not None:
            raise ValueError(
                "A public TrendSignal has no tenant; a public-web trend is not tenant-scoped."
            )

    @property
    def is_archived(self) -> bool:
        return self.lifecycle_stage == "archived" or self.archived_at is not None


def assess_confidence(*, distinct_sources: int, human_corroborated: bool = False) -> Confidence:
    """The confidence rung from how many *independent* sources corroborate.

    This never returns or reads a provenance — provenance is fixed at ``Proxy`` on the underlying
    observations. Confidence is a separate axis: how many keyless surfaces agree, plus whether a
    human called it before automation did.
    """
    if human_corroborated:
        return "human_corroborated"
    if distinct_sources >= 2:
        return "corroborated"
    return "single_source"
