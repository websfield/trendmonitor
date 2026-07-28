"""The one permitted, one-way coupling (Phase 8, REQ-005f): a rising+go ``TrendVerdict`` raises
**ingestion priority** so the corpus builder points at that format.

The coupling flows in exactly one direction — trend detection → corpus direction — and has **no
path to any score**. It admits/upgrades a term in the ``TermRegistry`` (origin
``TREND_DETECTED``, weight 0.8) and hands the ingestion path the trend ids to stamp on the
exemplars it ingests (``ExemplarPost.ingestion_arm = TREND_DIRECTED``, via
:func:`corpora.exemplar.occasion_exemplar`). It does **not**:

* read or write the amplification ``arm`` (``miner/arm.py``) — the exploit/explore money axis is a
  different concept that must never converge with the corpus-ingestion axis (mechanisms-v1.json,
  ``ingestion_arm_is_not_the_amplification_arm``); this module imports nothing from
  ``scoring``/``amplif``/``miner.arm`` (a standing test in ``test_trend_coupling.py`` enforces it);
* touch an internal-scope signal — ``TermRegistry`` and ``ExemplarPost`` are shared, tenant-neutral
  state (REQ-060: "there is no tenant axis"), so a tenant's internal-signal ``go`` must never reach
  them (CLAUDE.md rule 8 — tenant data never crosses into the shared corpus). The coupling resolves
  the verdict's signal identity and refuses when ``scope != "public"``, fail-closed;
* produce any numeric a scorer could read — its only payoff is the REQ-005f stratified
  contrasted-rate report (``ingestion_arm``), never a VPS/warrant input.

``TrendVerdict`` carries only ``trend_id`` (``TrendSignal`` carries no ``term``), so the term is
resolved through the Phase 4 bidirectional identity index (``by_signal_id`` → ``SignalIdentity``).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from c1_pattern_engine.detector.identity import IdentityIndex
from c1_pattern_engine.detector.verdict import TrendVerdict
from c1_pattern_engine.registry.terms import AdmissionOrigin, TermRegistry, TrackedTerm

__all__ = ["TrendDirection", "apply_trend_direction"]


@dataclass(frozen=True, slots=True)
class TrendDirection:
    """The corpus-direction result of a rising+go public verdict: the term that was admitted and
    the trend id the ingestion path stamps on exemplars it ingests because of it."""

    trend_id: UUID
    term: str
    vertical: str
    platform: str


def apply_trend_direction(
    verdict: TrendVerdict,
    registry: TermRegistry,
    *,
    identity_index: IdentityIndex,
    as_of: datetime,
    kind: str = "topic",
) -> TrendDirection | None:
    """Apply the one permitted coupling for a single verdict, returning the direction or ``None``.

    Admits nothing and returns ``None`` unless the verdict is ``go`` on a resolvable, **public**
    signal. A ``skip``/``caution`` verdict, an unresolvable ``trend_id``, or an internal-scope
    signal all fail closed (nothing admitted, nothing tagged). On a public ``go`` the term is
    admitted or **origin-upgraded** to ``TREND_DETECTED`` (monotonic — a ``HUMAN_SUBMISSION`` term
    is never downgraded), and the direction is returned so the caller can stamp ingestion.
    """
    if verdict.verdict != "go" or verdict.stage != "rising":
        # go ⟹ stage==rising by construction (compute_verdict), but the dataclass does not enforce
        # it — the explicit stage re-check hardens against a hand-built TrendVerdict, fail-closed.
        return None

    looked_up = identity_index.by_signal_id(verdict.trend_id)
    if looked_up is None:
        return None  # can't resolve the term → can't admit an unknown; fail closed

    identity, _record = looked_up
    if identity.scope != "public":
        # An internal-signal go never reaches the shared, tenant-neutral registry/corpus
        # (CLAUDE.md rule 8; REQ-060). The refusal is here, robust to any caller.
        return None

    registry.admit(
        TrackedTerm(
            term=identity.term,
            vertical=identity.vertical,
            platform=identity.platform,
            origin=AdmissionOrigin.TREND_DETECTED,
            admitted_at=as_of,
            last_activity_at=as_of,
            kind=kind,
        ),
        upgrade_origin=True,
    )
    return TrendDirection(
        trend_id=verdict.trend_id,
        term=identity.term,
        vertical=identity.vertical,
        platform=identity.platform,
    )
