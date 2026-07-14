"""P4-T2/T3/T3b — the C3 Calibration Monitor's Python half.

C3 is the referee: *"a scorer that decides whether to keep trusting itself never stops trusting
itself."* This package produces the calibration statistic C3 adjudicates on. It **decides
nothing** — it does not trip or arm the breaker (that is the C# C3 authority), and it only
consumes the append-only event log; it never writes an ``OutcomeEvent`` (C2 is the sole writer).

The cross-plane contract is the tuple ``(n, rho, suspected_leak)`` per cohort key, computed on a
**temporal** held-out set, with ``rho`` refused below ``n = 60``.
"""

from __future__ import annotations

from c1_pattern_engine.calibration.dataset import (
    EXCLUDED_FROM_AI_SCORING,
    CalibrationRecord,
    CohortKey,
    build_calibration_dataset,
    exclusion_reason,
)
from c1_pattern_engine.calibration.holdout import TemporalSplit, temporal_holdout
from c1_pattern_engine.calibration.spearman import (
    MIN_N,
    SUSPECTED_LEAK_THRESHOLD,
    CalibrationStat,
    MixedCohortError,
    NonMeasuredOutcomeError,
    calibration_stat,
    cohort_statistic,
)

__all__ = [
    "EXCLUDED_FROM_AI_SCORING",
    "MIN_N",
    "SUSPECTED_LEAK_THRESHOLD",
    "CalibrationRecord",
    "CalibrationStat",
    "CohortKey",
    "MixedCohortError",
    "NonMeasuredOutcomeError",
    "TemporalSplit",
    "build_calibration_dataset",
    "calibration_stat",
    "cohort_statistic",
    "exclusion_reason",
    "temporal_holdout",
]
