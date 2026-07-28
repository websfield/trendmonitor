"""The per-tenant verdict-input supplier (Phase 6 R1).

**The contract is config/artefact-only — forever, not just initially.** C1 never grows a read
path into ClientHub operational data (the "convenience read replica" the integration contract
names as how the decoupling dies); if real tenant briefs are ever needed, they arrive as a
pushed/exported artefact that lands as this same file shape (ADR-0009 invariant 5). No pooling
or summarizing across tenants — a summary statistic of outcome data is outcome data (ADR-0006).

The file is non-secret: lead times and thresholds, no credentials, no outcome data.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import yaml

from c1_pattern_engine.detector.verdict import RiskFlag

__all__ = ["TenantBrief", "load_tenant_briefs"]


@dataclass(frozen=True, slots=True)
class TenantBrief:
    """One tenant's verdict inputs. Always consumed one-tenant-at-a-time; never aggregated."""

    tenant_id: UUID
    lead_time_days: float
    brand_fit: float
    risk_flag: RiskFlag

    def __post_init__(self) -> None:
        if self.lead_time_days < 0:
            raise ValueError("lead_time_days must be non-negative")
        if not 0.0 <= self.brand_fit <= 1.0:
            raise ValueError("brand_fit must be in [0, 1]")
        if self.risk_flag not in ("none", "caution", "blocked"):
            # Literal isn't runtime-enforced; an unvalidated typo ("Blocked", "block", null)
            # would silently soften a tenant's hard skip to caution in compute_verdict — the
            # loose direction. Fail loudly at the artefact boundary instead.
            raise ValueError(
                f"risk_flag must be one of none/caution/blocked, got {self.risk_flag!r}"
            )


def load_tenant_briefs(path: str | Path) -> list[TenantBrief]:
    """Load tenant briefs from the artefact file. Absent file → no tenants → no verdicts
    (a scan without tenant config still produces signals + coverage — Phase 6 R5)."""
    path = Path(path)
    if not path.exists():
        return []
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    briefs = [
        TenantBrief(
            tenant_id=UUID(row["tenant_id"]),
            lead_time_days=float(row["lead_time_days"]),
            brand_fit=float(row["brand_fit"]),
            risk_flag=row.get("risk_flag", "none"),
        )
        for row in raw.get("tenants", [])
    ]
    ids = [b.tenant_id for b in briefs]
    if len(ids) != len(set(ids)):
        # Two rows for one tenant would render conflicting verdicts for the same trend — the
        # same config-typo-softens-a-gate family as an invalid risk_flag. Fail loudly.
        raise ValueError("duplicate tenant_id rows in the tenant-brief artefact")
    return briefs
