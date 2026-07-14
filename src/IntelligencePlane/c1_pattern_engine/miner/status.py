"""P6-T6 — evidence status: active / insufficient_evidence / stale.

Three rules decide whether a pattern is scored on:

* **Stale on ``valid_to``** (REQ-006). A pattern past its validity window without refresh is
  ``stale`` and excluded from retrieval — it is not silently kept applying. This is automatic and
  independent of how strong the evidence was.
* **The evidence floor** (REQ-003). ``sample_size < 30`` **or** a bootstrapped CI that includes
  zero ⇒ ``insufficient_evidence``. That is a *resting state*, not a queue: there is no deadline by
  which it must become active, and it is retained in the artefact for auditability but never
  retrieved and never shown to a client.
* Otherwise ``active``.

``retired`` is a terminal state set by an operator, never inferred here.
"""

from __future__ import annotations

from datetime import date

from c1_pattern_engine.miner.pattern import SAMPLE_FLOOR, EffectSize, EvidenceStatus

__all__ = ["evidence_status"]


def evidence_status(
    *,
    sample_size: int,
    effect: EffectSize,
    valid_to: date,
    as_of: date,
) -> EvidenceStatus:
    """Compute a pattern's evidence status.

    Staleness is checked first: a pattern past ``valid_to`` is ``stale`` regardless of how good its
    evidence once was — an expired window is not scored on.
    """
    if as_of > valid_to:
        return "stale"
    if sample_size < SAMPLE_FLOOR or not effect.ci_excludes_zero:
        return "insufficient_evidence"
    return "active"
