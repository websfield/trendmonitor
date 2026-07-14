"""P9-T8 - the quarterly fairness audit (REQ-054). It reports; it mutates nothing.

*"The thing that actually matters: regress measured 7-day performance on follower band, and compare
that slope to the slope of VPS on follower band. If VPS rises with follower band faster than
performance does, the rubric is scoring audience size and calling it craft."*

Two axes, two regressions, **never pooled or summed**:

* **VPS on follower band.** VPS is ``Estimated`` (a model output), present for every observation.
* **Measured 7-day performance on follower band.** The performance value is ``Measured`` /
  ``User-provided`` - it passes the ``MeasuredOutcome`` barrier (substrate.provenance). A ``Proxy``
  or ``Estimated`` performance value is **excluded, never imputed**: it cannot enter the regression,
  so a proxy engagement can never masquerade as measured performance in a fairness slope.

Discipline notes:

* Each slope names what it is regressed on (the follower-band index 0..3), and is computed with a
  robust Theil-Sen estimator (the median of pairwise slopes over the per-band medians) so a single
  outlier band does not manufacture a trend - the same median-not-mean discipline used elsewhere.
* A band with too few samples on an axis is surfaced as ``insufficient`` for that axis and never
  imputed; a slope over fewer than two sufficient bands is ``None`` (undefined), not zero.
* The recommended action (raise ``authenticity_register``, re-run calibration, decompose by
  criterion) is a **string the audit reports** - a human decision, executed nowhere here.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from statistics import median

from substrate.provenance import MeasuredOutcome, Provenanced

__all__ = [
    "DEFAULT_MATERIAL_OVERRIDE_MARGIN",
    "DEFAULT_MATERIAL_SLOPE_MARGIN",
    "DEFAULT_MIN_PER_BAND",
    "DEFAULT_MIN_TIER_SAMPLES",
    "REVISIONS_REQUIRED",
    "BandDistribution",
    "FairnessObservation",
    "FairnessReport",
    "FollowerBand",
    "OverrideBiasReport",
    "TierOverrideStat",
    "VerdictOverrideRecord",
    "follower_band",
    "override_bias_by_tier",
    "run_fairness_audit",
]

REVISIONS_REQUIRED = "REVISIONS_REQUIRED"

# A band needs at least this many samples on an axis before its median enters a slope.
DEFAULT_MIN_PER_BAND = 5
# VPS-on-band exceeding performance-on-band by more than this (points per band step) is flagged.
DEFAULT_MATERIAL_SLOPE_MARGIN = 5.0
# Macro override rate exceeding nano's by more than this (fraction) is flagged.
DEFAULT_MATERIAL_OVERRIDE_MARGIN = 0.15
DEFAULT_MIN_TIER_SAMPLES = 10

_RECOMMENDED_SLOPE_ACTION = (
    "VPS rises with follower band faster than measured performance does: the rubric may be scoring "
    "audience size and calling it craft. Recommended (a human decision, not executed here): raise "
    "authenticity_register weight (currently 0.06, a guess) and re-run calibration; where it "
    "persists, decompose by criterion - text_readability and pacing are the likely proxies, both "
    "rewarding editing labour."
)
_RECOMMENDED_OVERRIDE_ACTION = (
    "Managers override REVISIONS_REQUIRED for macro creators at a materially higher rate than for "
    "nano creators: the humans may be correcting a bias the system has. Recommended (a human "
    "decision): review the rubric's treatment of production quality against creator tier."
)


class FollowerBand(StrEnum):
    """Creator follower bands (REQ-054). The band index is the regression's x-axis."""

    NANO = "nano"     # < 10k
    MICRO = "micro"   # 10k - 100k
    MID = "mid"       # 100k - 500k
    MACRO = "macro"   # > 500k


_BAND_ORDER: tuple[FollowerBand, ...] = (
    FollowerBand.NANO,
    FollowerBand.MICRO,
    FollowerBand.MID,
    FollowerBand.MACRO,
)


def follower_band(follower_count: int) -> FollowerBand:
    """The band for a follower count. Boundaries: <10k nano, <100k micro, <500k mid, else macro."""
    if follower_count < 0:
        raise ValueError("follower_count cannot be negative.")
    if follower_count < 10_000:
        return FollowerBand.NANO
    if follower_count < 100_000:
        return FollowerBand.MICRO
    if follower_count < 500_000:
        return FollowerBand.MID
    return FollowerBand.MACRO


def _band_index(band: FollowerBand) -> int:
    return _BAND_ORDER.index(band)


@dataclass(frozen=True, slots=True)
class FairnessObservation:
    """One creator-post observation for the audit.

    ``vps`` is the Estimated craft score (always present). ``performance`` is the measured 7-day
    engagement-rate percentile as a ``Provenanced`` value - it enters the performance regression
    only if it passes the MeasuredOutcome barrier (Measured / User-provided); a Proxy is dropped.
    """

    follower_count: int
    vps: float
    performance: Provenanced[float]

    @property
    def band(self) -> FollowerBand:
        return follower_band(self.follower_count)


@dataclass(frozen=True, slots=True)
class BandDistribution:
    """The VPS and measured-performance summary for one follower band."""

    band: FollowerBand
    n_observations: int
    n_measured_performance: int
    median_vps: float | None
    median_performance: float | None
    vps_sufficient: bool
    performance_sufficient: bool


@dataclass(frozen=True, slots=True)
class FairnessReport:
    """The audit output for one cohort. Reports only - mutates no weight, runs no calibration."""

    cohort_key: str
    bands: tuple[BandDistribution, ...]
    slope_vps: float | None
    slope_performance: float | None
    slope_margin: float | None            # slope_vps - slope_performance, when both are defined
    material_slope_margin: float
    flag_scoring_audience_size: bool
    n_measured_performance: int
    n_dropped_nonmeasured: int
    insufficient_vps_bands: tuple[FollowerBand, ...]
    insufficient_performance_bands: tuple[FollowerBand, ...]
    override_bias: OverrideBiasReport | None = None
    recommended_action: str | None = None

    @property
    def assessable(self) -> bool:
        """True when both slopes are defined, so the comparison actually means something."""
        return self.slope_vps is not None and self.slope_performance is not None


def _theil_sen(points: Sequence[tuple[int, float]]) -> float | None:
    """The robust slope: the median of pairwise slopes over ``(x, y)`` points. None below two."""
    slopes: list[float] = []
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            xi, yi = points[i]
            xj, yj = points[j]
            if xi != xj:
                slopes.append((yj - yi) / (xj - xi))
    if not slopes:
        return None
    return median(slopes)


def run_fairness_audit(
    cohort_key: str,
    observations: Sequence[FairnessObservation],
    *,
    overrides: Sequence[VerdictOverrideRecord] | None = None,
    min_per_band: int = DEFAULT_MIN_PER_BAND,
    material_slope_margin: float = DEFAULT_MATERIAL_SLOPE_MARGIN,
    min_tier_samples: int = DEFAULT_MIN_TIER_SAMPLES,
    material_override_margin: float = DEFAULT_MATERIAL_OVERRIDE_MARGIN,
) -> FairnessReport:
    """Run the quarterly fairness audit for one cohort.

    Computes the VPS-on-band and measured-performance-on-band slopes, flags when VPS rises with
    follower band faster than performance does, and (if ``overrides`` given) the macro/nano override
    bias. The performance axis admits only MeasuredOutcome-eligible values; Proxy/Estimated dropped.
    """
    by_band: dict[FollowerBand, list[FairnessObservation]] = {b: [] for b in _BAND_ORDER}
    for obs in observations:
        by_band[obs.band].append(obs)

    n_dropped = 0
    distributions: list[BandDistribution] = []
    vps_points: list[tuple[int, float]] = []
    perf_points: list[tuple[int, float]] = []
    insufficient_vps: list[FollowerBand] = []
    insufficient_perf: list[FollowerBand] = []
    total_measured = 0

    for band in _BAND_ORDER:
        group = by_band[band]
        vps_values = [o.vps for o in group]

        # The barrier: a Proxy / Estimated performance returns None and is excluded, never imputed.
        measured: list[float] = []
        for o in group:
            admitted = MeasuredOutcome.try_from(o.performance)
            if admitted is None:
                n_dropped += 1
            else:
                measured.append(admitted.value)
        total_measured += len(measured)

        vps_ok = len(vps_values) >= min_per_band
        perf_ok = len(measured) >= min_per_band
        med_vps = median(vps_values) if vps_values else None
        med_perf = median(measured) if measured else None

        distributions.append(
            BandDistribution(
                band=band,
                n_observations=len(group),
                n_measured_performance=len(measured),
                median_vps=med_vps,
                median_performance=med_perf,
                vps_sufficient=vps_ok,
                performance_sufficient=perf_ok,
            )
        )

        if vps_ok and med_vps is not None:
            vps_points.append((_band_index(band), med_vps))
        elif len(vps_values) > 0:
            insufficient_vps.append(band)

        if perf_ok and med_perf is not None:
            perf_points.append((_band_index(band), med_perf))
        elif len(measured) > 0 or len(group) > 0:
            insufficient_perf.append(band)

    slope_vps = _theil_sen(vps_points) if len(vps_points) >= 2 else None
    slope_perf = _theil_sen(perf_points) if len(perf_points) >= 2 else None

    slope_margin: float | None = None
    flag = False
    if slope_vps is not None and slope_perf is not None:
        slope_margin = slope_vps - slope_perf
        flag = slope_margin > material_slope_margin

    override_bias = (
        override_bias_by_tier(
            overrides,
            min_tier_samples=min_tier_samples,
            material_margin=material_override_margin,
        )
        if overrides is not None
        else None
    )

    actions: list[str] = []
    if flag:
        actions.append(_RECOMMENDED_SLOPE_ACTION)
    if override_bias is not None and override_bias.flag_macro_bias:
        actions.append(_RECOMMENDED_OVERRIDE_ACTION)

    return FairnessReport(
        cohort_key=cohort_key,
        bands=tuple(distributions),
        slope_vps=slope_vps,
        slope_performance=slope_perf,
        slope_margin=slope_margin,
        material_slope_margin=material_slope_margin,
        flag_scoring_audience_size=flag,
        n_measured_performance=total_measured,
        n_dropped_nonmeasured=n_dropped,
        insufficient_vps_bands=tuple(insufficient_vps),
        insufficient_performance_bands=tuple(insufficient_perf),
        override_bias=override_bias,
        recommended_action="\n".join(actions) if actions else None,
    )


# --- second check: override rate by creator tier ----------------------------------------------


@dataclass(frozen=True, slots=True)
class VerdictOverrideRecord:
    """One recorded verdict, and whether a manager overrode it. ``creator_tier`` is the band."""

    creator_tier: FollowerBand
    verdict: str
    overridden: bool


@dataclass(frozen=True, slots=True)
class TierOverrideStat:
    """REVISIONS_REQUIRED override counts for one creator tier."""

    tier: FollowerBand
    n_revisions_required: int
    n_overridden: int

    @property
    def override_rate(self) -> float | None:
        if self.n_revisions_required == 0:
            return None
        return self.n_overridden / self.n_revisions_required


@dataclass(frozen=True, slots=True)
class OverrideBiasReport:
    """Whether macro REVISIONS_REQUIRED overrides materially exceed nano's (a bias signal)."""

    by_tier: Mapping[FollowerBand, TierOverrideStat] = field(default_factory=dict)
    macro_rate: float | None = None
    nano_rate: float | None = None
    rate_margin: float | None = None       # macro_rate - nano_rate, when both are defined
    material_margin: float = DEFAULT_MATERIAL_OVERRIDE_MARGIN
    flag_macro_bias: bool = False
    assessable: bool = False


def override_bias_by_tier(
    overrides: Sequence[VerdictOverrideRecord],
    *,
    min_tier_samples: int = DEFAULT_MIN_TIER_SAMPLES,
    material_margin: float = DEFAULT_MATERIAL_OVERRIDE_MARGIN,
) -> OverrideBiasReport:
    """Compute the REVISIONS_REQUIRED override rate per tier and flag a macro-vs-nano gap.

    A tier with fewer than ``min_tier_samples`` REVISIONS_REQUIRED verdicts is not assessed - the
    gap is surfaced as unassessable, never imputed from a handful of overrides.
    """
    counts: dict[FollowerBand, list[int]] = {b: [0, 0] for b in _BAND_ORDER}
    for rec in overrides:
        if rec.verdict != REVISIONS_REQUIRED:
            continue
        counts[rec.creator_tier][0] += 1
        if rec.overridden:
            counts[rec.creator_tier][1] += 1

    by_tier = {
        band: TierOverrideStat(band, n_rr, n_ov)
        for band, (n_rr, n_ov) in counts.items()
    }

    macro = by_tier[FollowerBand.MACRO]
    nano = by_tier[FollowerBand.NANO]
    macro_ok = macro.n_revisions_required >= min_tier_samples
    nano_ok = nano.n_revisions_required >= min_tier_samples

    macro_rate = macro.override_rate if macro_ok else None
    nano_rate = nano.override_rate if nano_ok else None

    assessable = macro_rate is not None and nano_rate is not None
    rate_margin = (macro_rate - nano_rate) if assessable else None
    flag = assessable and rate_margin is not None and rate_margin > material_margin

    return OverrideBiasReport(
        by_tier=by_tier,
        macro_rate=macro_rate,
        nano_rate=nano_rate,
        rate_margin=rate_margin,
        material_margin=material_margin,
        flag_macro_bias=flag,
        assessable=assessable,
    )
