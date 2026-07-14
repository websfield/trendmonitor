"""P8-T7 — auto-demotion on corpus refresh (Rule 5; mechanisms-v1.json ``promotion_and_demotion``).

*"Automatic to demote. Human to promote."* On every corpus refresh the warrant is **recomputed
from scratch** on the new temporal slice, through the very same :func:`compute_warrant` that
promotes at synthesis time — so promotion and demotion can never drift on the four criteria that
gate ``contrasted`` (recurrence counts, mining-slice ratio, disjoint-slice ratio, slice count). The
demotion target is that **recomputed rung**, not always ``falsified``:

* When the disjoint-slice ratio is **undefined** (contrast prevalence went to 0) or falls **below**
  the ``1.5`` threshold, the asymmetry has vanished: the mechanism auto-demotes to ``falsified`` and
  is withdrawn the same cycle — no human step.
* When the disjoint-slice ratio still clears but the mining-slice ratio or the recurrence counts
  have decayed, the mechanism recomputes to ``recurrent``: it is **withdrawn to ``recurrent``**
  (still servable) rather than falsified — the asymmetry did not vanish, it only stopped clearing
  the *contrasted* bar.

Every change is logged as a :class:`MechanismWarrantTransition` carrying the causing
``corpus_snapshot_sha256`` — which is what makes the transition reproducible: recompute the
predicate over that exact snapshot and you get the same rung.

*"The pressure to widen a threshold arrives at exactly the moment the threshold is telling the
truth."* — so demotion never waits on a click.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from c1_pattern_engine.synthesiser.mechanism import Mechanism
from c1_pattern_engine.synthesiser.warrant import (
    DISJOINT_SLICE_RATIO_THRESHOLD,
    Warrant,
    WarrantInputs,
)

__all__ = ["MechanismWarrantTransition", "refresh_and_demote"]


@dataclass(frozen=True, slots=True)
class MechanismWarrantTransition:
    """An audit record of one warrant change, with the corpus snapshot that caused it."""

    mechanism_id: UUID
    from_warrant: Warrant
    to_warrant: Warrant
    corpus_snapshot_sha256: str
    occurred_at: datetime
    automatic: bool


def refresh_and_demote(
    mechanisms: list[Mechanism],
    *,
    recompute_inputs: Callable[[Mechanism], WarrantInputs],
    corpus_snapshot_sha256: str,
    occurred_at: datetime,
) -> tuple[list[Mechanism], list[MechanismWarrantTransition]]:
    """Recompute each ``contrasted`` mechanism's warrant on the refreshed corpus and demote.

    ``recompute_inputs`` returns the refreshed :class:`WarrantInputs` — the *full* input set the
    warrant ladder is computed from, so promotion and demotion share one source of truth
    (:func:`compute_warrant`) rather than re-checking a single criterion. The target rung is decided
    as:

    * If the refreshed disjoint-slice ratio is **undefined** (contrast prevalence went to 0) or
      **below** the ``1.5`` threshold, the asymmetry has vanished → ``falsified`` (withdrawn the
      same cycle). ``falsified`` is a lifecycle transition :func:`compute_warrant` never returns;
      demotion owns it.
    * Otherwise the target is exactly :meth:`WarrantInputs.warrant` — the recomputed rung. A
      ``contrasted`` mechanism whose mining-slice ratio or recurrence counts decayed but whose
      disjoint ratio still clears recomputes to ``recurrent`` and is **withdrawn to ``recurrent``**
      (still servable), not falsified.

    A transition is emitted only when the rung actually changed. Returns the updated mechanisms
    **and** the transitions to append to the audit log.
    """
    updated: list[Mechanism] = []
    transitions: list[MechanismWarrantTransition] = []

    for mechanism in mechanisms:
        if mechanism.warrant is not Warrant.CONTRASTED:
            updated.append(mechanism)
            continue

        refreshed = recompute_inputs(mechanism)
        disjoint = refreshed.disjoint_slice_ratio
        if disjoint is None or disjoint < DISJOINT_SLICE_RATIO_THRESHOLD:
            target = Warrant.FALSIFIED
        else:
            target = refreshed.warrant()

        if target is mechanism.warrant:  # still contrasted — nothing decayed
            updated.append(mechanism)
            continue

        demoted = dataclasses.replace(mechanism, warrant=target)
        updated.append(demoted)
        transitions.append(
            MechanismWarrantTransition(
                mechanism_id=mechanism.id,
                from_warrant=Warrant.CONTRASTED,
                to_warrant=target,
                corpus_snapshot_sha256=corpus_snapshot_sha256,
                occurred_at=occurred_at,
                automatic=True,
            )
        )

    return updated, transitions
