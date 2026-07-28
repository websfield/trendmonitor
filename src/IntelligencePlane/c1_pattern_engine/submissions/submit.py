"""The submission book: open positions, resolution, and the rules around both.

Invariants enforced here:

* ``max_open_positions`` default 5 — a sixth open submission from the same submitter is refused.
* A **submitter may never resolve their own submission**. Such a resolution is *void and logged*;
  it neither scores nor frees the position.
* Dead evidence voids a submission, and the position is **held for 14 days**, not freed.
* ``rationale`` and ``evidence_uris`` are :class:`Untrusted` — they are stored and shown, but they
  are never an input to any deterministic decision (the verdict does not even accept them).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal
from uuid import UUID

from c1_pattern_engine.submissions.scoring import (
    CLASSES,
    credit,
    lead_days,
    rps,
    skill_score,
)
from extraction.untrusted import Untrusted

__all__ = [
    "MAX_OPEN_POSITIONS",
    "POSITION_HOLD_DAYS",
    "Provenance",
    "SelfResolutionError",
    "SubmissionBook",
    "SubmissionRefused",
    "SubmitterReputation",
    "TrendResolution",
    "TrendSubmission",
    "load_submission_book",
]

_LOG = logging.getLogger(__name__)

MAX_OPEN_POSITIONS = 5
POSITION_HOLD_DAYS = 14

# Mirror of substrate.Provenance's value for a resolver's evidence, kept local to avoid pulling the
# effect-size machinery into the submission book.
Provenance = Literal["User-provided"]

SubmissionStatus = Literal["open", "resolved", "void"]


class SubmissionRefused(RuntimeError):
    """A submission was refused — e.g. the submitter already holds the maximum open positions."""


class SelfResolutionError(PermissionError):
    """A submitter attempted to resolve their own submission. The resolution is void and logged."""


@dataclass(frozen=True, slots=True)
class TrendSubmission:
    """A human-submitted candidate trend (REQ-005a).

    ``forecast`` is a distribution over ``{rising, peak, declining}`` at T+14d. ``rationale`` and
    ``evidence_uris`` are untrusted content: readable for processing, never coercible into a
    prompt or a decision.
    """

    id: UUID
    submitter_id: UUID
    role: str
    platform: str
    vertical: str
    label: str
    kind: str
    evidence_uris: tuple[Untrusted[str], ...]
    forecast: Mapping[str, float]
    rationale: Untrusted[str]
    submitted_at: datetime
    status: SubmissionStatus = "open"
    void_reason: str = ""
    hold_until: datetime | None = None

    def __post_init__(self) -> None:
        missing = [c for c in CLASSES if c not in self.forecast]
        if missing:
            raise ValueError(f"forecast must cover every class in {CLASSES}; missing {missing}.")
        if self.submitted_at.tzinfo is None:
            # Two deliberate, complementary policies for a naive stamp: the REPLAY path *coerces*
            # naive→UTC in `_parse_utc` before constructing (an operator-authored NDJSON line is
            # forgiving), while a PROGRAMMATIC construction is *refused* here — a caller with a
            # datetime in hand should say which zone it means. Either way nothing naive survives to
            # the merge, which compares submitted_at against the UTC-anchored first_detected_at.
            raise ValueError(
                "submitted_at must be timezone-aware: it is compared against the UTC-anchored "
                "first_detected_at to decide lead credit and the confidence upgrade."
            )

    # `label` is the trend's term (the tech-spec `POST /api/trends/submissions` names it; it is the
    # `TermRegistry` key a novel submission admits and the identity a corroborating one matches).
    # `kind` mirrors `detector.signals.Kind` (plain str here to keep the submission book import-free
    # of the detector). Both are attacker-influenceable submitter input — like any term — so they
    # are DATA, never markup: any UI must render them as plain text (Phase 9 R5, stored-XSS seam).
    # They are matched/keyed on, never parsed as a decision the way `rationale` is forbidden to be.


@dataclass(frozen=True, slots=True)
class TrendResolution:
    """The outcome of scoring a submission. ``void=True`` means it neither scored nor freed the
    position (e.g. a self-resolution)."""

    submission_id: UUID
    resolver_id: UUID
    observed_class: str
    provenance: Provenance
    resolved_at: datetime
    corroboration_date: datetime
    skill: float
    credit: float
    void: bool = False
    void_reason: str = ""


@dataclass
class SubmitterReputation:
    """Running record for one submitter, folded into a shrunk promotion weight elsewhere."""

    submitter_id: UUID
    n: int = 0
    total_credit: float = 0.0

    @property
    def observed_mean_credit(self) -> float:
        return self.total_credit / self.n if self.n else 0.0

    def record(self, credit_earned: float) -> None:
        self.n += 1
        self.total_credit += credit_earned


@dataclass
class SubmissionBook:
    """In-memory book of submissions and resolutions (Phase 0/2 dataclass-store convention)."""

    rps_baseline: float = 0.5
    max_open_positions: int = MAX_OPEN_POSITIONS
    _submissions: dict[UUID, TrendSubmission] = field(default_factory=dict)
    _resolutions: list[TrendResolution] = field(default_factory=list)

    def open_positions(self, submitter_id: UUID) -> int:
        """Open submissions plus positions still held under a dead-evidence 14-day hold."""
        return sum(
            1
            for s in self._submissions.values()
            if s.submitter_id == submitter_id and self._holds_a_position(s)
        )

    @staticmethod
    def _holds_a_position(s: TrendSubmission) -> bool:
        if s.status == "open":
            return True
        # A void submission with an unexpired hold still occupies a position (dead-evidence rule).
        return s.status == "void" and s.hold_until is not None

    def submit(self, submission: TrendSubmission) -> TrendSubmission:
        """Add a submission. Refuses a sixth open position for the same submitter."""
        if self.open_positions(submission.submitter_id) >= self.max_open_positions:
            raise SubmissionRefused(
                f"Submitter {submission.submitter_id} already holds "
                f"{self.max_open_positions} open positions; a further submission is refused "
                "(REQ-005a max_open_positions)."
            )
        self._submissions[submission.id] = submission
        return submission

    def void_dead_evidence(self, submission_id: UUID, *, now: datetime, reason: str) -> None:
        """Void a submission whose evidence URI is dead, holding the position for 14 days."""
        from dataclasses import replace

        s = self._submissions[submission_id]
        self._submissions[submission_id] = replace(
            s,
            status="void",
            void_reason=reason,
            hold_until=now + timedelta(days=POSITION_HOLD_DAYS),
        )

    def resolve(
        self,
        submission_id: UUID,
        *,
        resolver_id: UUID,
        observed_class: str,
        provenance: Provenance,
        resolved_at: datetime,
        corroboration_date: datetime,
        reputation: SubmitterReputation | None = None,
    ) -> TrendResolution:
        """Resolve a submission, scoring it and paying credit.

        Refuses a self-resolution: if ``resolver_id`` equals the submitter, the resolution is void
        and logged, no score is paid, and the position is not freed.
        """
        submission = self._submissions[submission_id]

        if resolver_id == submission.submitter_id:
            _LOG.warning(
                "SELF_RESOLUTION_VOID submission=%s submitter=%s resolver=%s: a submitter may "
                "not resolve their own submission (REQ-005b).",
                submission_id,
                submission.submitter_id,
                resolver_id,
            )
            void = TrendResolution(
                submission_id=submission_id,
                resolver_id=resolver_id,
                observed_class=observed_class,
                provenance=provenance,
                resolved_at=resolved_at,
                corroboration_date=corroboration_date,
                skill=0.0,
                credit=0.0,
                void=True,
                void_reason="self-resolution",
            )
            self._resolutions.append(void)
            raise SelfResolutionError(
                f"Submitter {submission.submitter_id} may not resolve their own submission "
                f"{submission_id}. Resolution voided and logged."
            )

        rps_value = rps(submission.forecast, observed_class)
        skill = skill_score(rps_value, self.rps_baseline)
        lead = lead_days(corroboration_date, submission.submitted_at)
        earned = credit(skill, lead)

        from dataclasses import replace

        self._submissions[submission_id] = replace(submission, status="resolved", hold_until=None)
        resolution = TrendResolution(
            submission_id=submission_id,
            resolver_id=resolver_id,
            observed_class=observed_class,
            provenance=provenance,
            resolved_at=resolved_at,
            corroboration_date=corroboration_date,
            skill=skill,
            credit=earned,
        )
        self._resolutions.append(resolution)
        if reputation is not None:
            reputation.record(earned)
        return resolution

    def resolutions(self) -> list[TrendResolution]:
        return list(self._resolutions)

    def submissions(self) -> list[TrendSubmission]:
        return list(self._submissions.values())

    def open_submissions(self) -> list[TrendSubmission]:
        """Submissions still ``open`` (a candidate on the board). Void/resolved excluded."""
        return [s for s in self._submissions.values() if s.status == "open"]

    def get(self, submission_id: UUID) -> TrendSubmission:
        return self._submissions[submission_id]


def _parse_utc(value: str) -> datetime:
    """ISO-8601 → tz-aware UTC datetime. A naive stamp is assumed UTC (Phase 9 R1): the merge
    compares ``submitted_at`` against ``first_detected_at`` (both UTC-anchored), so a naive value
    slipping through would make the anti-gaming lead comparison ambiguous."""
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _submission_from_row(row: Mapping) -> TrendSubmission:
    hold = row.get("hold_until")
    return TrendSubmission(
        id=UUID(row["id"]),
        submitter_id=UUID(row["submitter_id"]),
        role=row["role"],
        platform=row["platform"],
        vertical=row["vertical"],
        label=row["label"],
        kind=row["kind"],
        evidence_uris=tuple(Untrusted(u) for u in row.get("evidence_uris", [])),
        forecast=dict(row["forecast"]),
        rationale=Untrusted(row.get("rationale", "")),
        submitted_at=_parse_utc(row["submitted_at"]),
        status=row.get("status", "open"),
        void_reason=row.get("void_reason", ""),
        hold_until=_parse_utc(hold) if hold else None,
    )


def _resolution_from_row(row: Mapping) -> TrendResolution:
    return TrendResolution(
        submission_id=UUID(row["submission_id"]),
        resolver_id=UUID(row["resolver_id"]),
        observed_class=row["observed_class"],
        provenance=row["provenance"],
        resolved_at=_parse_utc(row["resolved_at"]),
        corroboration_date=_parse_utc(row["corroboration_date"]),
        skill=float(row["skill"]),
        credit=float(row["credit"]),
        void=bool(row.get("void", False)),
        void_reason=row.get("void_reason", ""),
    )


def load_submission_book(
    path: str | Path, *, rps_baseline: float = 0.5
) -> SubmissionBook:
    """Hydrate a :class:`SubmissionBook` from an NDJSON file (Phase 9 R1).

    The interim ingestion surface until the tech-spec's ``POST /api/trends/submissions`` lands
    (recorded as a deferral): one JSON object per line, ``type`` is ``"submission"`` or
    ``"resolution"``, append-only, so submissions and their resolutions survive across nightly
    processes. This is a **replay** — rows are restored directly (like the ``StateRoot``
    deserializer), not re-run through ``submit``/``resolve`` business logic. An absent file is a
    legitimate empty book. ``submitted_at`` and every stamp parse tz-aware UTC (``_parse_utc``).
    """
    book = SubmissionBook(rps_baseline=rps_baseline)
    p = Path(path)
    if not p.exists():
        return book
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if row["type"] == "submission":
            sub = _submission_from_row(row)
            book._submissions[sub.id] = sub
        elif row["type"] == "resolution":
            book._resolutions.append(_resolution_from_row(row))
        else:
            raise ValueError(f"submission NDJSON row has unknown type {row.get('type')!r}")
    return book
