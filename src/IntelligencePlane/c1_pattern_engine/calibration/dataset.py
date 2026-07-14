"""P4-T3b — the calibration dataset builder.

Calibration correlates a *predicted* VPS (``Estimated``) against the *actual* measured 7-day
performance percentile of the post it scored (REQ-050). Three classes of record **never enter**
the calibration set, and this module is the one place that decides so:

* an ``anomalous`` score (the model returned out of range; clamped and logged, never calibrated on),
* a submission the verdict engine routed to ``EXCLUDED_FROM_AI_SCORING`` — a V6 minor-creator
  submission excluded entirely from AI scoring (rubric-v1.json V6, events-v1.json 1.1.0),
* any ``Origin.Fixture`` outcome — a seeded cohort must never reach an operator or client surface.

A fourth gate is structural rather than policy: the actual percentile must be a *measured* value.
The cross-plane contract counts ``n`` as held-out **(scored, measured)** submissions, so a
``Proxy``/``Estimated`` outcome is not yet calibration evidence.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from substrate.provenance import Origin, Provenanced

__all__ = [
    "EXCLUDED_FROM_AI_SCORING",
    "CalibrationRecord",
    "CohortKey",
    "build_calibration_dataset",
    "exclusion_reason",
]

# The V6 routing verdict (events-v1.json 1.1.0). A minor's submission is excluded from AI scoring
# entirely — a different act from REJECTED, and it is not calibration evidence.
EXCLUDED_FROM_AI_SCORING = "EXCLUDED_FROM_AI_SCORING"


@dataclass(frozen=True, slots=True)
class CohortKey:
    """The calibration cohort key. Library promotion changes this key and resets the window
    (Contract C / D). Tenant-scoped by construction — a cohort never spans tenants (Rule 8)."""

    tenant_id: UUID
    vertical: str
    platform: str
    rubric_version: str
    pattern_library_version: str


@dataclass(frozen=True, slots=True)
class CalibrationRecord:
    """One held-out (scored, measured) pair: the predicted VPS and the actual 7d percentile.

    ``predicted_vps`` is always ``Estimated`` (it is a model output), so it is a plain float.
    ``actual_7d_percentile`` carries its provenance — only a *measured* outcome is admissible.
    ``campaign_id`` lets the temporal splitter keep a campaign atomic; ``None`` means the record
    is its own singleton campaign.
    """

    submission_id: UUID
    cohort_key: CohortKey
    predicted_vps: float
    actual_7d_percentile: Provenanced[float]
    scored_at: datetime
    verdict: str
    anomalous: bool
    origin: Origin = Origin.REAL
    campaign_id: str | None = None


def exclusion_reason(record: CalibrationRecord) -> str | None:
    """Return why a record is excluded from the calibration set, or ``None`` if it is admissible.

    Naming the reason (rather than returning a bare bool) keeps the exclusion auditable — an
    operator can see *why* a submission is not being calibrated on, not merely that it isn't.
    """
    if record.anomalous:
        return "anomalous_score"
    if record.verdict == EXCLUDED_FROM_AI_SCORING:
        return "excluded_from_ai_scoring_v6"
    if record.origin is Origin.FIXTURE:
        return "fixture_origin"
    if not record.actual_7d_percentile.is_measurable:
        # n counts (scored, MEASURED) submissions; a Proxy/Estimated outcome is not yet evidence.
        return "unmeasured_outcome"
    return None


def build_calibration_dataset(
    records: Iterable[CalibrationRecord],
) -> list[CalibrationRecord]:
    """Filter candidate records down to the admissible calibration set.

    This is the sole admission gate. Everything it drops is dropped for a named, auditable reason;
    nothing is imputed to keep a record in.
    """
    return [r for r in records if exclusion_reason(r) is None]
