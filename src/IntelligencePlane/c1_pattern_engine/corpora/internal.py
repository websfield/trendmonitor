"""P4-T7 — the C1 internal corpus assembler.

Folds the append-only event log into one record per submission, joining features to outcome, arm,
and human judgement. C1 is a **consumer only**: it reads the log C2 writes and never emits an
``OutcomeEvent`` (Rule 3). :func:`replay` is the primary operation, not a recovery path — an
extractor bump means backfill features, replay the log, re-mine, and the same log replayed twice
yields the same corpus.

Four disciplines are enforced here:

* **Dedupe on ``idempotency_key`` before folding.** At-least-once delivery means the same event
  can arrive twice; a double-counted outcome inflates an effect size, so the first occurrence
  wins and the rest are dropped.
* **Arm propagation.** ``AmplificationAllocated.arm`` is the arm of every subsequent
  ``PerformanceSnapshot`` for that ``live_post_id``. A snapshot on an amplified post that arrives
  **without** its arm is a broken propagation: the assembler **raises**, it never imputes an arm.
  *"An assembler that loses the arm tag converts the exploration budget into a donation."*
* **True ``as_of``.** A ``PerformanceSnapshot`` records the true collection time, never its
  intended horizon; log lag makes these differ and the record keeps the real one.
* **Tenancy.** Records are per-submission and never aggregated across tenants (Rule 8).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

__all__ = [
    "EVENT_TYPES",
    "AmplificationArm",
    "AssembledRecord",
    "AssembledSnapshot",
    "MissingArmError",
    "OutcomeEvent",
    "replay",
]

AmplificationArm = Literal["exploit", "explore"]

# The event types this assembler folds (events-v1.json). AmplificationSignedOff and
# RightsGrantChanged exist in the log but are not part of the feature->outcome fold here.
EVENT_TYPES: frozenset[str] = frozenset(
    {
        "SubmissionScored",
        "VerdictIssued",
        "VerdictOverridden",
        "PostPublished",
        "PerformanceSnapshot",
        "AmplificationAllocated",
    }
)


class MissingArmError(RuntimeError):
    """A ``PerformanceSnapshot`` for an amplified post arrived without its arm.

    The assembler raises rather than imputing: guessing exploit vs explore would convert the
    exploration budget's only unconfounded evidence into noise, silently.
    """


@dataclass(frozen=True, slots=True)
class OutcomeEvent:
    """One event off the append-only log, in the envelope shape C2 writes (events-v1.json).

    ``payload`` is the event-type-specific body. The assembler reads it by key; it is modelled as a
    plain mapping so this consumer stays decoupled from the C# writer's concrete types.
    """

    event_id: UUID
    event_type: str
    idempotency_key: str
    tenant_id: UUID
    occurred_at: datetime
    recorded_at: datetime
    payload: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class AssembledSnapshot:
    """One folded performance snapshot. ``as_of`` is the true collection time, not the horizon."""

    live_post_id: UUID
    horizon: str
    engagement_rate: float
    denominator: str
    series: str
    provenance: str
    as_of: datetime
    arm: AmplificationArm | None


@dataclass
class AssembledRecord:
    """One submission's folded history: features -> outcome, arm, human judgement."""

    submission_id: UUID
    tenant_id: UUID
    feature_record_id: UUID | None = None
    cohort_key: Mapping[str, Any] | None = None
    version_triple: Mapping[str, Any] | None = None
    breaker_state_at_score: str | None = None
    vps: float | None = None
    bas: float | None = None
    anomalous: bool = False
    verdict: str | None = None
    human_approved_at: datetime | None = None
    override_verdict: str | None = None
    override_reason: str | None = None
    override_reviewer_id: UUID | None = None
    live_post_id: UUID | None = None
    published_at: datetime | None = None
    arm: AmplificationArm | None = None
    snapshots: list[AssembledSnapshot] = field(default_factory=list)


def _dedupe(events: Iterable[OutcomeEvent]) -> list[OutcomeEvent]:
    """Drop repeat deliveries: the first event seen for an ``idempotency_key`` wins.

    Order is preserved so the fold is deterministic. A double-counted outcome would inflate an
    effect size, so this runs *before* any folding.
    """
    seen: set[str] = set()
    out: list[OutcomeEvent] = []
    for e in events:
        if e.idempotency_key in seen:
            continue
        seen.add(e.idempotency_key)
        out.append(e)
    return out


def _as_uuid(value: Any) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def replay(events: Sequence[OutcomeEvent]) -> dict[UUID, AssembledRecord]:
    """Replay the log into a per-submission corpus. Deterministic and idempotent.

    Replaying the same events twice yields the same result — replay is the primary operation, so an
    extractor bump can backfill and re-fold without a bespoke recovery path.
    """
    deduped = _dedupe(events)

    # First pass: the joins we need before folding snapshots.
    #   live_post_id -> submission_id (from PostPublished)
    #   live_post_id -> allocated arm (from AmplificationAllocated; presence == "amplified")
    post_to_submission: dict[UUID, UUID] = {}
    allocated_arm: dict[UUID, AmplificationArm] = {}
    for e in deduped:
        if e.event_type == "PostPublished":
            sub = _as_uuid(e.payload["submission_id"])
            live = _as_uuid(e.payload["live_post_id"])
            post_to_submission[live] = sub
        elif e.event_type == "AmplificationAllocated":
            live = _as_uuid(e.payload["live_post_id"])
            arm = e.payload.get("arm")
            if arm not in ("exploit", "explore"):
                # AmplificationAllocated.arm is required and enumerated; a missing/blank arm here
                # is not something to impute either.
                raise MissingArmError(
                    f"AmplificationAllocated for live_post {live} carries no valid arm ({arm!r})."
                )
            allocated_arm[live] = arm  # type: ignore[assignment]

    records: dict[UUID, AssembledRecord] = {}

    def record_for(submission_id: UUID, tenant_id: UUID) -> AssembledRecord:
        rec = records.get(submission_id)
        if rec is None:
            rec = AssembledRecord(submission_id=submission_id, tenant_id=tenant_id)
            records[submission_id] = rec
        return rec

    # Second pass: fold everything else.
    for e in deduped:
        p = e.payload
        if e.event_type == "SubmissionScored":
            sub = _as_uuid(p["submission_id"])
            rec = record_for(sub, e.tenant_id)
            rec.feature_record_id = _as_uuid(p["feature_record_id"])
            rec.cohort_key = p.get("cohort_key")
            rec.version_triple = p.get("version_triple")
            rec.breaker_state_at_score = p.get("breaker_state_at_score")
            rec.vps = p.get("vps")
            rec.bas = p.get("bas")
            rec.anomalous = bool(p.get("anomalous", False))
        elif e.event_type == "VerdictIssued":
            sub = _as_uuid(p["submission_id"])
            rec = record_for(sub, e.tenant_id)
            rec.verdict = p.get("verdict")
            rec.human_approved_at = p.get("human_approved_at")
        elif e.event_type == "VerdictOverridden":
            sub = _as_uuid(p["submission_id"])
            rec = record_for(sub, e.tenant_id)
            rec.override_verdict = p.get("override_verdict")
            rec.override_reason = p.get("reason")
            reviewer = p.get("reviewer_id")
            rec.override_reviewer_id = _as_uuid(reviewer) if reviewer is not None else None
        elif e.event_type == "PostPublished":
            sub = _as_uuid(p["submission_id"])
            rec = record_for(sub, e.tenant_id)
            rec.live_post_id = _as_uuid(p["live_post_id"])
            rec.published_at = p.get("published_at")
            rec.arm = allocated_arm.get(rec.live_post_id)

    # Third pass: fold snapshots, enforcing arm propagation. Done last so every join is in place.
    for e in deduped:
        if e.event_type != "PerformanceSnapshot":
            continue
        p = e.payload
        live = _as_uuid(p["live_post_id"])
        is_amplified = live in allocated_arm
        snap_arm = p.get("arm")

        if is_amplified and snap_arm is None:
            raise MissingArmError(
                f"PerformanceSnapshot for amplified live_post {live} has no arm. The arm from "
                "AmplificationAllocated must propagate to every snapshot; the assembler refuses "
                "to impute it."
            )
        if is_amplified and snap_arm != allocated_arm[live]:
            raise MissingArmError(
                f"PerformanceSnapshot for live_post {live} carries arm {snap_arm!r} but the "
                f"allocation says {allocated_arm[live]!r}. The log's arm propagation is broken; "
                "the assembler will not reconcile it silently."
            )

        submission_id = post_to_submission.get(live)
        if submission_id is None:
            # A snapshot for a post we never saw published: keep it out of the corpus rather than
            # invent a submission for it. (An orphan snapshot is a log-lag artefact, not evidence.)
            continue
        rec = records.get(submission_id)
        if rec is None:
            rec = record_for(submission_id, e.tenant_id)

        rec.snapshots.append(
            AssembledSnapshot(
                live_post_id=live,
                horizon=str(p.get("horizon", "")),
                engagement_rate=float(p["engagement_rate"]),
                denominator=str(p.get("denominator", "")),
                series=str(p.get("series", "")),
                provenance=str(p.get("provenance", "")),
                as_of=p["as_of"],  # true collection time, never the intended horizon
                arm=allocated_arm.get(live),
            )
        )

    return records
