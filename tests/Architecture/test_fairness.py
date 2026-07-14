"""P9-T8 - the quarterly fairness audit (REQ-054, A15).

The audit compares two slopes regressed on the follower band: VPS-on-band and measured-7d-
performance-on-band. If VPS rises with follower band faster than performance does, the rubric may be
scoring audience size and calling it craft - the report flags it. It also flags a macro-vs-nano gap
in REVISIONS_REQUIRED override rate. It reports; it mutates nothing.

Non-vacuity is the discipline here: a fixture where the slopes match does NOT flag; a matched
override fixture does NOT flag. And the performance axis admits only measured outcomes - a Proxy
performance value cannot enter the regression (the MeasuredOutcome barrier, mirrored from the
estimator-provenance suite).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from c1_pattern_engine.eval.fairness import (
    FairnessObservation,
    FollowerBand,
    VerdictOverrideRecord,
    follower_band,
    override_bias_by_tier,
    run_fairness_audit,
)
from substrate.provenance import Provenance, Provenanced

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)

# A representative follower count for each band, and a small deterministic jitter whose median is 0.
_BAND_FOLLOWERS = {
    FollowerBand.NANO: 5_000,
    FollowerBand.MICRO: 50_000,
    FollowerBand.MID: 250_000,
    FollowerBand.MACRO: 1_000_000,
}
_JITTER = (-2.0, -1.0, 0.0, 0.0, 1.0, 2.0)   # 6 samples per band; median == the centre


def _measured(value: float) -> Provenanced[float]:
    return Provenanced(value, Provenance.MEASURED, NOW)


def _proxy(value: float) -> Provenanced[float]:
    return Provenanced(value, Provenance.PROXY, NOW)


def _observations(
    vps_by_band: dict[FollowerBand, float],
    perf_by_band: dict[FollowerBand, float],
    *,
    performance_provenance: str = "measured",
) -> list[FairnessObservation]:
    """Six observations per band whose per-band median VPS/performance are the given centres."""
    obs: list[FairnessObservation] = []
    for band, followers in _BAND_FOLLOWERS.items():
        for k in _JITTER:
            pv = perf_by_band[band] + k
            perf = _proxy(pv) if performance_provenance == "proxy" else _measured(pv)
            obs.append(
                FairnessObservation(
                    follower_count=followers,
                    vps=vps_by_band[band] + k,
                    performance=perf,
                )
            )
    return obs


# --- band boundaries --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "count,expected",
    [
        (0, FollowerBand.NANO),
        (9_999, FollowerBand.NANO),
        (10_000, FollowerBand.MICRO),
        (99_999, FollowerBand.MICRO),
        (100_000, FollowerBand.MID),
        (499_999, FollowerBand.MID),
        (500_000, FollowerBand.MACRO),
        (5_000_000, FollowerBand.MACRO),
    ],
)
def test_follower_band_boundaries(count: int, expected: FollowerBand) -> None:
    assert follower_band(count) == expected


# --- A15: the two slopes, flagged when VPS outpaces performance, not when they match -----------


def test_fairness_slopes() -> None:
    # VPS climbs steeply with follower band; measured performance is nearly flat.
    steep_vps = {
        FollowerBand.NANO: 40.0, FollowerBand.MICRO: 55.0,
        FollowerBand.MID: 70.0, FollowerBand.MACRO: 90.0,
    }
    flat_perf = {
        FollowerBand.NANO: 60.0, FollowerBand.MICRO: 62.0,
        FollowerBand.MID: 63.0, FollowerBand.MACRO: 64.0,
    }
    flagged = run_fairness_audit("beauty.tiktok", _observations(steep_vps, flat_perf))

    assert flagged.assessable
    assert flagged.slope_vps is not None and flagged.slope_performance is not None
    assert flagged.slope_vps > flagged.slope_performance
    assert flagged.slope_margin is not None
    assert flagged.slope_margin > flagged.material_slope_margin
    assert flagged.flag_scoring_audience_size is True
    assert flagged.recommended_action is not None
    assert "authenticity_register" in flagged.recommended_action

    # Non-vacuous control: VPS and performance rise together -> no flag.
    matched = run_fairness_audit("beauty.tiktok", _observations(steep_vps, steep_vps))

    assert matched.assessable
    assert matched.slope_vps == matched.slope_performance
    assert matched.flag_scoring_audience_size is False
    assert matched.recommended_action is None


def test_slope_is_undefined_when_too_few_bands_have_samples() -> None:
    # Only the macro band has enough samples on either axis -> a slope needs >= 2 bands.
    obs = [
        FairnessObservation(1_000_000, vps=80.0 + k, performance=_measured(80.0 + k))
        for k in _JITTER
    ]
    report = run_fairness_audit("beauty.tiktok", obs, min_per_band=5)

    assert report.slope_vps is None            # one band is not a slope
    assert report.slope_performance is None
    assert report.assessable is False
    assert report.flag_scoring_audience_size is False   # cannot flag what it cannot assess


# --- the measurement barrier: a Proxy performance value cannot enter the regression ------------


def test_proxy_performance_cannot_enter_the_performance_regression() -> None:
    steep_vps = {
        FollowerBand.NANO: 40.0, FollowerBand.MICRO: 55.0,
        FollowerBand.MID: 70.0, FollowerBand.MACRO: 90.0,
    }
    perf = {
        FollowerBand.NANO: 60.0, FollowerBand.MICRO: 62.0,
        FollowerBand.MID: 63.0, FollowerBand.MACRO: 64.0,
    }
    # Every performance value is Proxy (an exemplar-style engagement read). It must be excluded.
    report = run_fairness_audit(
        "beauty.tiktok",
        _observations(steep_vps, perf, performance_provenance="proxy"),
    )

    assert report.n_dropped_nonmeasured == 24          # 6 per band x 4 bands, all Proxy
    assert report.n_measured_performance == 0
    assert report.slope_performance is None            # no measured evidence -> undefined, not zero
    assert report.assessable is False
    assert report.flag_scoring_audience_size is False  # a Proxy value never manufactures a flag
    for band in report.bands:
        assert band.median_performance is None
        assert band.performance_sufficient is False


def test_a_single_proxy_value_is_dropped_but_measured_ones_still_regress() -> None:
    steep_vps = {
        FollowerBand.NANO: 40.0, FollowerBand.MICRO: 55.0,
        FollowerBand.MID: 70.0, FollowerBand.MACRO: 90.0,
    }
    perf = {
        FollowerBand.NANO: 60.0, FollowerBand.MICRO: 62.0,
        FollowerBand.MID: 63.0, FollowerBand.MACRO: 64.0,
    }
    obs = _observations(steep_vps, perf)
    # Poison one nano performance value with a huge Proxy; it must not move the measured median.
    obs.append(FairnessObservation(5_000, vps=40.0, performance=_proxy(9_999.0)))

    report = run_fairness_audit("beauty.tiktok", obs)

    assert report.n_dropped_nonmeasured == 1
    nano = next(b for b in report.bands if b.band == FollowerBand.NANO)
    assert nano.n_measured_performance == 6            # the Proxy did not join the measured set
    assert nano.median_performance == 60.0             # ...and did not drag the median up


# --- second check: override rate by creator tier ----------------------------------------------


def _overrides(tier: FollowerBand, n: int, n_overridden: int) -> list[VerdictOverrideRecord]:
    records = [
        VerdictOverrideRecord(tier, "REVISIONS_REQUIRED", overridden=i < n_overridden)
        for i in range(n)
    ]
    return records


def test_override_rate_by_tier_flags_macro_bias() -> None:
    # Macro REVISIONS_REQUIRED are overridden 70% of the time; nano only 10%.
    overrides = (
        _overrides(FollowerBand.MACRO, 20, 14)   # 0.70
        + _overrides(FollowerBand.NANO, 20, 2)   # 0.10
    )
    report = override_bias_by_tier(overrides)

    assert report.assessable
    assert report.macro_rate == pytest.approx(0.70)
    assert report.nano_rate == pytest.approx(0.10)
    assert report.rate_margin == pytest.approx(0.60)
    assert report.flag_macro_bias is True


def test_override_rate_matched_across_tiers_does_not_flag() -> None:
    overrides = (
        _overrides(FollowerBand.MACRO, 20, 4)    # 0.20
        + _overrides(FollowerBand.NANO, 20, 4)   # 0.20
    )
    report = override_bias_by_tier(overrides)

    assert report.assessable
    assert report.flag_macro_bias is False


def test_override_bias_is_unassessable_below_the_sample_floor() -> None:
    # Too few macro REVISIONS_REQUIRED to judge - the gap is surfaced unassessable, never imputed.
    overrides = (
        _overrides(FollowerBand.MACRO, 3, 3)     # 100% but n=3
        + _overrides(FollowerBand.NANO, 20, 2)
    )
    report = override_bias_by_tier(overrides, min_tier_samples=10)

    assert report.assessable is False
    assert report.macro_rate is None
    assert report.flag_macro_bias is False


def test_only_revisions_required_verdicts_count_toward_override_bias() -> None:
    # A pile of overridden APPROVED verdicts must not inflate the REVISIONS_REQUIRED override rate.
    approved_noise = [
        VerdictOverrideRecord(FollowerBand.MACRO, "APPROVED", overridden=True) for _ in range(50)
    ]
    overrides = (
        _overrides(FollowerBand.MACRO, 20, 2)    # REVISIONS_REQUIRED: 0.10
        + approved_noise
        + _overrides(FollowerBand.NANO, 20, 2)   # 0.10
    )
    report = override_bias_by_tier(overrides)

    assert report.macro_rate == pytest.approx(0.10)   # the APPROVED overrides were ignored
    assert report.flag_macro_bias is False


def test_audit_wires_override_bias_into_the_report() -> None:
    steep_vps = {
        FollowerBand.NANO: 40.0, FollowerBand.MICRO: 55.0,
        FollowerBand.MID: 70.0, FollowerBand.MACRO: 90.0,
    }
    perf = {
        FollowerBand.NANO: 60.0, FollowerBand.MICRO: 62.0,
        FollowerBand.MID: 63.0, FollowerBand.MACRO: 64.0,
    }
    overrides = (
        _overrides(FollowerBand.MACRO, 20, 14)
        + _overrides(FollowerBand.NANO, 20, 2)
    )
    report = run_fairness_audit(
        "beauty.tiktok", _observations(steep_vps, perf), overrides=overrides
    )

    assert report.override_bias is not None
    assert report.override_bias.flag_macro_bias is True
    # Both flags contribute their recommended action.
    assert report.recommended_action is not None
    assert "authenticity_register" in report.recommended_action
    assert "macro creators" in report.recommended_action
