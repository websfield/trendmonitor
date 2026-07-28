"""P7-T3..T8 — the detector: robust-z, lifecycle, archive, verdict, coverage, feed.

This package turns keyless observations into ``TrendSignal``s and tenant-scoped
``TrendVerdict``s. It never produces a number a scorer consumes: a ``TrendSignal`` carries no
effect size, no weight, no VPS input — *"No ``TrendSignal`` value enters VPS computation, at any
weight, under any configuration"* (REQ-005e).
"""

from __future__ import annotations

from c1_pattern_engine.detector.archive import TrendSignalStore
from c1_pattern_engine.detector.assemble import (
    assemble_signal,
    select_primary_series,
    signal_id,
)
from c1_pattern_engine.detector.coupling import TrendDirection, apply_trend_direction
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
from c1_pattern_engine.detector.identity import IdentityIndex, IdentityRecord, SignalIdentity
from c1_pattern_engine.detector.lifecycle import (
    DaysRemaining,
    classify_stage,
    days_remaining,
    days_remaining_adjusted,
    ema,
)
from c1_pattern_engine.detector.run_scan import (
    DEFAULT_TRACKED_PLATFORMS,
    SOURCE_PLATFORM,
    ScanResult,
    TermAlert,
    group_observations,
    run_scan,
)
from c1_pattern_engine.detector.signals import (
    Confidence,
    TrendSignal,
    assess_confidence,
)
from c1_pattern_engine.detector.store_durable import (
    ResolvedSampleBook,
    StateCorrupted,
    StateRoot,
)
from c1_pattern_engine.detector.tenants import TenantBrief, load_tenant_briefs
from c1_pattern_engine.detector.verdict import (
    IssuedVerdict,
    TrendVerdict,
    VerdictLedger,
    compute_verdict,
)

__all__ = [
    "DEFAULT_TRACKED_PLATFORMS",
    "SOURCE_PLATFORM",
    "Confidence",
    "DaysRemaining",
    "DetectionResult",
    "FeedAccessDenied",
    "IdentityIndex",
    "IdentityRecord",
    "IssuedVerdict",
    "PlatformCoverage",
    "ResolvedSampleBook",
    "ScanResult",
    "SignalIdentity",
    "SpikeAlert",
    "StateCorrupted",
    "StateRoot",
    "TenantBrief",
    "TermAlert",
    "TrendCandidate",
    "TrendDirection",
    "TrendSignal",
    "TrendSignalStore",
    "TrendVerdict",
    "VerdictLedger",
    "apply_trend_direction",
    "assemble_signal",
    "assess_confidence",
    "classify_stage",
    "compute_verdict",
    "coverage_report",
    "days_remaining",
    "days_remaining_adjusted",
    "detect_candidates",
    "ema",
    "group_observations",
    "load_tenant_briefs",
    "require_feed_access",
    "robust_baseline",
    "robust_z",
    "run_scan",
    "select_primary_series",
    "signal_id",
    "trend_feed",
    "z_series",
]
