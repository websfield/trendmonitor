"""Phase 4 (Python half) — C3 calibration + C1 internal corpus assembler tests.

Acceptance criteria A1, A5, A7, A8, A9, A9b, plus the named edge/failure tests. Test names carry
the plan's identifiers so a reviewer maps a green line to a criterion. No live DB, no network:
events are dataclasses and every store is in-memory (the Phase 0/2/7 convention).
"""

from __future__ import annotations

import ast
import pathlib
import warnings
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from c1_pattern_engine.calibration import (
    EXCLUDED_FROM_AI_SCORING,
    MIN_N,
    CalibrationRecord,
    CalibrationStat,
    CohortKey,
    MixedCohortError,
    NonMeasuredOutcomeError,
    build_calibration_dataset,
    calibration_stat,
    cohort_statistic,
    temporal_holdout,
)
from c1_pattern_engine.corpora import (
    MissingArmError,
    OutcomeEvent,
    replay,
)
from substrate.provenance import Origin, Provenance, Provenanced

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)
_TENANT = uuid4()


# --- helpers -------------------------------------------------------------------------------


def make_cohort(pattern_library_version: str = "pl-1") -> CohortKey:
    return CohortKey(
        tenant_id=_TENANT,
        vertical="beauty",
        platform="tiktok",
        rubric_version="rubric-v1",
        pattern_library_version=pattern_library_version,
    )


def measured(value: float) -> Provenanced[float]:
    return Provenanced(value, Provenance.MEASURED, NOW)


def make_cal_record(
    *,
    cohort: CohortKey | None = None,
    predicted: float = 50.0,
    actual: Provenanced[float] | None = None,
    scored_at: datetime = NOW,
    verdict: str = "APPROVED",
    anomalous: bool = False,
    origin: Origin = Origin.REAL,
    campaign_id: str | None = None,
) -> CalibrationRecord:
    return CalibrationRecord(
        submission_id=uuid4(),
        cohort_key=cohort or make_cohort(),
        predicted_vps=predicted,
        actual_7d_percentile=actual if actual is not None else measured(50.0),
        scored_at=scored_at,
        verdict=verdict,
        anomalous=anomalous,
        origin=origin,
        campaign_id=campaign_id,
    )


def event(
    event_type: str,
    payload: dict,
    *,
    idempotency_key: str | None = None,
    occurred_at: datetime = NOW,
) -> OutcomeEvent:
    return OutcomeEvent(
        event_id=uuid4(),
        event_type=event_type,
        idempotency_key=idempotency_key or f"{event_type}:{uuid4()}",
        tenant_id=_TENANT,
        occurred_at=occurred_at,
        recorded_at=occurred_at,
        payload=payload,
    )


# --- A1: refuses to emit rho when n < 60 ----------------------------------------------------


def test_calibration_below_n60_refuses_rho() -> None:
    below = calibration_stat(list(range(59)), list(range(59)))
    assert below.n == 59
    assert below.rho is None  # no rho below the floor, ever
    assert below.suspected_leak is False

    at_floor = calibration_stat(list(range(60)), list(range(60)))
    assert at_floor.n == 60
    assert at_floor.rho is not None  # the 60th unlocks a rho

    # The type itself forbids a small-n rho: there is no back door.
    with pytest.raises(ValueError, match="refuses to emit"):
        CalibrationStat(n=59, rho=0.4, suspected_leak=False)


# --- A5: temporal splits, never random ------------------------------------------------------


def test_temporal_holdout_is_time_ordered_and_campaign_atomic() -> None:
    # Three campaigns of two posts each, at increasing times.
    recs: list[CalibrationRecord] = []
    for c_idx, camp in enumerate(("A", "B", "C")):
        for post in range(2):
            day = 1 + c_idx * 2 + post
            recs.append(
                make_cal_record(
                    scored_at=NOW + timedelta(days=day),
                    campaign_id=camp,
                )
            )

    split = temporal_holdout(recs, holdout_fraction=0.3)
    assert split.method == "temporal"

    train_campaigns = {r.campaign_id for r in split.train}
    holdout_campaigns = {r.campaign_id for r in split.holdout}

    # No campaign straddles the split — the exact leak a random split would create.
    assert train_campaigns.isdisjoint(holdout_campaigns)
    # The held-out campaigns are the temporally-latest: training never sees the future.
    assert max(r.scored_at for r in split.train) < min(r.scored_at for r in split.holdout)
    assert "C" in holdout_campaigns  # the latest campaign is held out


def test_holdout_module_has_no_random_split() -> None:
    # Structural guarantee: a random split is not merely discouraged, it is absent. Parse the
    # source (not a substring scan — the docstring legitimately says the words "random split") and
    # assert no calibration module imports a splitter or shuffles.
    calib_dir = (
        pathlib.Path(__file__).resolve().parents[2]
        / "src"
        / "IntelligencePlane"
        / "c1_pattern_engine"
        / "calibration"
    )
    assert calib_dir.is_dir()

    for py in calib_dir.glob("*.py"):
        tree = ast.parse(py.read_text(encoding="utf-8"))
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(a.name for a in node.names)
            elif isinstance(node, ast.ImportFrom):
                imported.add(node.module or "")
        assert not any(
            "sklearn" in m or m == "random" or m.endswith(".random") for m in imported
        ), f"{py.name} imports a random/split source: {imported}"

        name_calls = {
            n.func.id
            for n in ast.walk(tree)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
        }
        assert "train_test_split" not in name_calls
        attr_calls = {
            n.func.attr
            for n in ast.walk(tree)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
        }
        assert "shuffle" not in attr_calls
        assert "train_test_split" not in attr_calls


# --- A7: dedupe on idempotency_key ----------------------------------------------------------


def test_Assembler_DuplicateEvent_CountedOnce() -> None:
    submission = uuid4()
    live_post = uuid4()
    key = "PerformanceSnapshot:post-1:t7d"
    events = [
        event("PostPublished", {"submission_id": submission, "live_post_id": live_post}),
        event(
            "PerformanceSnapshot",
            {
                "live_post_id": live_post,
                "horizon": "t7d",
                "engagement_rate": 0.08,
                "denominator": "reach",
                "series": "organic",
                "provenance": "Measured",
                "as_of": NOW,
                "arm": None,
            },
            idempotency_key=key,
        ),
        # Redelivery of the SAME event (at-least-once transport).
        event(
            "PerformanceSnapshot",
            {
                "live_post_id": live_post,
                "horizon": "t7d",
                "engagement_rate": 0.08,
                "denominator": "reach",
                "series": "organic",
                "provenance": "Measured",
                "as_of": NOW,
                "arm": None,
            },
            idempotency_key=key,
        ),
    ]
    records = replay(events)
    assert len(records[submission].snapshots) == 1  # counted once, not twice


# --- A8: arm propagates; a missing arm raises rather than imputes ----------------------------


def test_Assembler_MissingArm_Raises() -> None:
    submission = uuid4()
    live_post = uuid4()
    events = [
        event("AmplificationAllocated", {"live_post_id": live_post, "arm": "explore"}),
        event("PostPublished", {"submission_id": submission, "live_post_id": live_post}),
        event(
            "PerformanceSnapshot",
            {
                "live_post_id": live_post,
                "horizon": "t7d",
                "engagement_rate": 0.09,
                "denominator": "reach",
                "series": "boosted",
                "provenance": "Measured",
                "as_of": NOW,
                "arm": None,  # missing on an amplified post
            },
        ),
    ]
    with pytest.raises(MissingArmError):
        replay(events)


def test_assembler_arm_propagates_to_snapshots() -> None:
    submission = uuid4()
    live_post = uuid4()
    events = [
        event("AmplificationAllocated", {"live_post_id": live_post, "arm": "explore"}),
        event("PostPublished", {"submission_id": submission, "live_post_id": live_post}),
        event(
            "PerformanceSnapshot",
            {
                "live_post_id": live_post,
                "horizon": "t7d",
                "engagement_rate": 0.09,
                "denominator": "reach",
                "series": "boosted",
                "provenance": "Measured",
                "as_of": NOW,
                "arm": "explore",
            },
        ),
    ]
    records = replay(events)
    rec = records[submission]
    assert rec.arm == "explore"
    assert [s.arm for s in rec.snapshots] == ["explore"]

    # An unamplified post's snapshot legitimately carries no arm and does not raise.
    sub2 = uuid4()
    post2 = uuid4()
    unamplified = [
        event("PostPublished", {"submission_id": sub2, "live_post_id": post2}),
        event(
            "PerformanceSnapshot",
            {
                "live_post_id": post2,
                "horizon": "t7d",
                "engagement_rate": 0.05,
                "denominator": "reach",
                "series": "organic",
                "provenance": "Measured",
                "as_of": NOW,
                "arm": None,
            },
        ),
    ]
    recs2 = replay(unamplified)
    assert recs2[sub2].arm is None
    assert recs2[sub2].snapshots[0].arm is None


# --- A9: anomalous, V6, and fixture outcomes are excluded (three tests) ----------------------


def test_Calibration_ExcludesAnomalous() -> None:
    good = make_cal_record()
    anomalous = make_cal_record(anomalous=True)
    kept = build_calibration_dataset([good, anomalous])
    assert good in kept
    assert anomalous not in kept


def test_Calibration_ExcludesV6() -> None:
    good = make_cal_record()
    v6 = make_cal_record(verdict=EXCLUDED_FROM_AI_SCORING)
    kept = build_calibration_dataset([good, v6])
    assert good in kept
    assert v6 not in kept


def test_Calibration_ExcludesFixtures() -> None:
    good = make_cal_record(origin=Origin.REAL)
    fixture = make_cal_record(origin=Origin.FIXTURE)
    kept = build_calibration_dataset([good, fixture])
    assert good in kept
    assert fixture not in kept


def test_calibration_excludes_unmeasured_outcome() -> None:
    # n counts (scored, MEASURED) submissions: a Proxy outcome is not yet calibration evidence.
    proxy = make_cal_record(actual=Provenanced(50.0, Provenance.PROXY, NOW))
    assert build_calibration_dataset([proxy]) == []


# --- A9b: high out-of-sample rho flags suspected_leak, surfaced never celebrated -------------


def test_Calibration_HighRho_FlagsSuspectedLeak() -> None:
    cohort = make_cohort()
    # 60 held-out records with predicted tracking actual almost perfectly => rho > 0.5.
    held = [
        make_cal_record(cohort=cohort, predicted=float(i), actual=measured(float(i)))
        for i in range(60)
    ]
    stat = cohort_statistic(held)
    assert stat.n == 60
    assert stat.rho is not None and stat.rho > 0.5
    assert stat.suspected_leak is True  # surfaced as a warning...
    # ...and structurally it is just a flag on the tuple, never a "win" field.
    assert isinstance(stat.suspected_leak, bool)


def test_high_rho_does_not_trip_and_low_rho_does_not_flag() -> None:
    cohort = make_cohort()
    # Perfectly anti-correlated: rho = -1. No suspected_leak, and still a real emitted rho.
    inverse = [
        make_cal_record(cohort=cohort, predicted=float(i), actual=measured(float(59 - i)))
        for i in range(60)
    ]
    stat = cohort_statistic(inverse)
    assert stat.n == 60
    assert stat.rho is not None and stat.rho < 0
    assert stat.suspected_leak is False


def test_zero_variance_cohort_yields_absent_rho_not_nan() -> None:
    # A degenerate cohort with zero variance on one axis (all-identical actual percentiles) makes
    # scipy.stats.spearmanr return NaN. A rank correlation is undefined there, so it is an *absent*
    # statistic even at n >= 60: the harness emits rho=None (which the C# monitor reads as cold),
    # never a raw NaN that JSON cannot carry across the plane seam.
    predicted = [float(i) for i in range(60)]
    actual = [50.0] * 60  # zero variance
    with warnings.catch_warnings():
        # scipy legitimately warns that an input is constant — the exact degeneracy under test.
        warnings.simplefilter("ignore")
        stat = calibration_stat(predicted, actual)
    assert stat.n == 60
    assert stat.rho is None  # not NaN
    assert stat.suspected_leak is False

    # The structural guard: a NaN rho can never even be constructed and slip downstream.
    with pytest.raises(ValueError, match="None or finite"):
        CalibrationStat(n=60, rho=float("nan"), suspected_leak=False)


# --- Edge / failure paths (named as the plan does) ------------------------------------------


def test_Snapshot_RecordsTrueAsOf() -> None:
    submission = uuid4()
    live_post = uuid4()
    published = NOW
    true_as_of = published + timedelta(days=9)  # log lag: 9 days, not the 7d horizon
    events = [
        event(
            "PostPublished",
            {"submission_id": submission, "live_post_id": live_post, "published_at": published},
        ),
        event(
            "PerformanceSnapshot",
            {
                "live_post_id": live_post,
                "horizon": "t7d",  # intended horizon
                "engagement_rate": 0.07,
                "denominator": "reach",
                "series": "organic",
                "provenance": "Measured",
                "as_of": true_as_of,  # the TRUE collection time
                "arm": None,
            },
        ),
    ]
    snap = replay(events)[submission].snapshots[0]
    assert snap.as_of == true_as_of  # true collection time preserved
    assert snap.horizon == "t7d"  # horizon kept separately, never overwriting as_of
    assert snap.as_of != published + timedelta(days=7)


def test_Calibration_LogLag_StopsAdvancing_DoesNotGuess() -> None:
    # When the log lags, the window reports the true (smaller) n and refuses a rho — it never
    # guesses a 60th record to cross the threshold. Deterministic: same data, same answer.
    lagged = [make_cal_record(predicted=float(i), actual=measured(float(i))) for i in range(59)]
    first = cohort_statistic(lagged)
    second = cohort_statistic(lagged)
    assert first.n == 59
    assert first.rho is None  # does not guess the missing record into existence
    assert first == second  # no drift between reads


def test_cohort_statistic_refuses_mixed_cohort() -> None:
    # A rolling correlation is never computed across a library swap: two pattern_library_versions
    # are two cohort keys, and folding them would span the reset C3 performs on promotion.
    a = [make_cal_record(cohort=make_cohort("pl-1"), actual=measured(float(i))) for i in range(30)]
    b = [make_cal_record(cohort=make_cohort("pl-2"), actual=measured(float(i))) for i in range(30)]
    with pytest.raises(MixedCohortError):
        cohort_statistic(a + b)


def test_cohort_statistic_refuses_non_measured_outcome() -> None:
    # A Proxy/non-measured percentile must never reach the rank correlation that moves the breaker
    # (ADR-0001, Rule 5) — regardless of whether the caller went through build_calibration_dataset.
    # Called directly on the seam, one Proxy outcome among 60 measured ones raises.
    cohort = make_cohort()
    held = [
        make_cal_record(cohort=cohort, predicted=float(i), actual=measured(float(i)))
        for i in range(60)
    ]
    poisoned = make_cal_record(
        cohort=cohort,
        predicted=99.0,
        actual=Provenanced(99.0, Provenance.PROXY, NOW),  # not measurable
    )
    with pytest.raises(NonMeasuredOutcomeError):
        cohort_statistic([*held, poisoned])


def test_replay_is_deterministic_and_idempotent() -> None:
    # Replay is the primary operation: the same log replayed twice yields the same corpus.
    submission = uuid4()
    live_post = uuid4()
    events = [
        event("SubmissionScored", {
            "submission_id": submission,
            "feature_record_id": uuid4(),
            "cohort_key": {"vertical": "beauty"},
            "vps": 61.0,
            "bas": 40.0,
        }),
        event("VerdictIssued", {"submission_id": submission, "verdict": "APPROVED"}),
        event("PostPublished", {"submission_id": submission, "live_post_id": live_post}),
    ]
    first = replay(events)
    second = replay(events)
    assert first[submission].vps == 61.0
    assert first[submission].verdict == "APPROVED"
    assert first[submission].live_post_id == live_post
    assert first[submission].snapshots == second[submission].snapshots


def test_cohort_statistic_small_holdout_is_cold() -> None:
    # The realistic path: a 70-record cohort, temporally split, yields a held-out set below 60 and
    # therefore no rho (cold) — exactly the correct early state.
    cohort = make_cohort()
    recs = [
        make_cal_record(
            cohort=cohort,
            predicted=float(i),
            actual=measured(float(i)),
            scored_at=NOW + timedelta(hours=i),
            campaign_id=f"camp-{i}",
        )
        for i in range(70)
    ]
    split = temporal_holdout(recs, holdout_fraction=0.3)
    stat = cohort_statistic(split.holdout)
    assert stat.n < MIN_N
    assert stat.rho is None
