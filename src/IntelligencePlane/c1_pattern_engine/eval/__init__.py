"""Evaluation audits that report and never mutate (Phase 9).

These modules compute audits the operator reads; they change no rubric weight and re-run no
calibration. The recommended actions they surface are human decisions.
"""

from __future__ import annotations

from c1_pattern_engine.eval.fairness import (
    FairnessObservation,
    FairnessReport,
    FollowerBand,
    OverrideBiasReport,
    VerdictOverrideRecord,
    follower_band,
    override_bias_by_tier,
    run_fairness_audit,
)

__all__ = [
    "FairnessObservation",
    "FairnessReport",
    "FollowerBand",
    "OverrideBiasReport",
    "VerdictOverrideRecord",
    "follower_band",
    "override_bias_by_tier",
    "run_fairness_audit",
]
