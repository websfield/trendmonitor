"""P7-T5 — the human-submission book and submitter scoring.

Managers, clients, and resolvers submit candidate trends with a probability distribution over
``{rising, peak, declining}`` at T+14d. Resolutions score that call with a *ranked* probability
score (the classes are ordered), pay ``credit = skill_score * ln(1 + lead_days)`` — where
``ln(1 + 0) = 0`` is the structural sandbagging guard — and fold it into a shrunk reputation. A
submitter may never resolve their own submission.
"""

from __future__ import annotations

from c1_pattern_engine.submissions.scoring import (
    CLASSES,
    REPUTATION_SHRINKAGE_K,
    credit,
    lead_days,
    rps,
    shrunk_weight,
    skill_score,
)
from c1_pattern_engine.submissions.submit import (
    MAX_OPEN_POSITIONS,
    POSITION_HOLD_DAYS,
    SelfResolutionError,
    SubmissionBook,
    SubmissionRefused,
    SubmitterReputation,
    TrendResolution,
    TrendSubmission,
)

__all__ = [
    "CLASSES",
    "MAX_OPEN_POSITIONS",
    "POSITION_HOLD_DAYS",
    "REPUTATION_SHRINKAGE_K",
    "SelfResolutionError",
    "SubmissionBook",
    "SubmissionRefused",
    "SubmitterReputation",
    "TrendResolution",
    "TrendSubmission",
    "credit",
    "lead_days",
    "rps",
    "shrunk_weight",
    "skill_score",
]
