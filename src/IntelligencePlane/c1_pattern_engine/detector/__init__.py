"""P7-T3..T8 — the detector: robust-z, lifecycle, archive, verdict, coverage, feed.

This package turns keyless observations into ``TrendSignal``s and tenant-scoped
``TrendVerdict``s. It never produces a number a scorer consumes: a ``TrendSignal`` carries no
effect size, no weight, no VPS input — *"No ``TrendSignal`` value enters VPS computation, at any
weight, under any configuration"* (REQ-005e).
"""

from __future__ import annotations

from c1_pattern_engine.detector.archive import TrendSignalStore
from c1_pattern_engine.detector.coverage import PlatformCoverage, coverage_report
from c1_pattern_engine.detector.detect import (
    DetectionResult,
    SpikeAlert,
    TrendCandidate,
    detect_candidates,
    robust_baseline,
    robust_z,
    z_series,
)
from c1_pattern_engine.detector.feed import FeedAccessDenied, require_feed_access, trend_feed
from c1_pattern_engine.detector.lifecycle import (
    DaysRemaining,
    classify_stage,
    days_remaining,
    ema,
)
from c1_pattern_engine.detector.signals import (
    Confidence,
    TrendSignal,
    assess_confidence,
)
from c1_pattern_engine.detector.verdict import (
    TrendVerdict,
    VerdictLedger,
    compute_verdict,
)

__all__ = [
    "Confidence",
    "DaysRemaining",
    "DetectionResult",
    "FeedAccessDenied",
    "PlatformCoverage",
    "SpikeAlert",
    "TrendCandidate",
    "TrendSignal",
    "TrendSignalStore",
    "TrendVerdict",
    "VerdictLedger",
    "assess_confidence",
    "classify_stage",
    "compute_verdict",
    "coverage_report",
    "days_remaining",
    "detect_candidates",
    "ema",
    "require_feed_access",
    "robust_baseline",
    "robust_z",
    "trend_feed",
    "z_series",
]
