"""Phase 6 — per-tenant verdict rendering: go/skip/caution, age adjustment, isolation, outcomes.

Locks: the supplier's artefact-only shape (R1), the scoped cross-product + age-adjusted est AND
band + render/outcome split (R2), tenant isolation incl. the exact internal-signal case (R3),
no trend→score leak (R4 — guard tests stay green in the suite), and the no-tenant run (R5).
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from c1_pattern_engine.detector import (
    StateRoot,
    TenantBrief,
    TrendSignal,
    days_remaining_adjusted,
    load_tenant_briefs,
    run_scan,
)
from c1_pattern_engine.detector.run import run_once
from c1_pattern_engine.registry import AdmissionOrigin, TrackedTerm

AS_OF = datetime(2026, 3, 2, tzinfo=UTC)
TENANT_A, TENANT_B = uuid4(), uuid4()


def brief(tenant=None, *, lead=5.0, fit=0.8, risk="none"):
    return TenantBrief(
        tenant_id=tenant or TENANT_A, lead_time_days=lead, brand_fit=fit, risk_flag=risk
    )


def make_term(text="glass skin"):
    return TrackedTerm(
        term=text,
        vertical="beauty",
        platform="tiktok",
        origin=AdmissionOrigin.SCHEDULED_SCAN,
        admitted_at=AS_OF,
        last_activity_at=AS_OF,
        kind="topic",
    )


def fake_fetch(tail):
    def fetch(_term, span):
        days = list(span.days())
        vols = {d: (9.0 if i % 2 == 0 else 11.0) for i, d in enumerate(days)}
        for j, v in enumerate(tail):
            vols[days[len(days) - len(tail) + j]] = v
        return vols

    return fetch


RISING_TAIL = [14.0, 16.0, 19.0, 23.0, 30.0]  # accelerating: classifies rising
DECLINING_TAIL = [30.0, 30.0, 24.0, 18.0, 12.0]  # candidate then falling: declining


def scan(state: StateRoot, *, tail=None, tenants=None, as_of=AS_OF):
    return run_scan(
        terms=[make_term()],
        fetchers={"reddit": fake_fetch(tail if tail is not None else RISING_TAIL)},
        as_of=as_of,
        store=state.signals,
        identity_index=state.identity,
        samples=state.samples,
        tenants=tenants,
        ledger=state.ledger,
    )


# --- R2: verdict paths ---------------------------------------------------------------------------


def test_rising_long_brand_fit_no_risk_is_go(tmp_path):
    state = StateRoot.load(tmp_path)
    result = scan(state, tenants=[brief()])
    assert len(result.verdicts) == 1
    v = result.verdicts[0]
    assert (v.verdict, v.stage, v.tenant_id) == ("go", "rising", TENANT_A)


def test_declining_is_skip_and_blocked_risk_is_skip(tmp_path):
    state = StateRoot.load(tmp_path)
    result = scan(state, tail=DECLINING_TAIL, tenants=[brief()])
    assert [v.verdict for v in result.verdicts] == ["skip"]

    state2 = StateRoot.load(tmp_path / "2")
    result2 = scan(state2, tenants=[brief(risk="blocked")])
    assert [v.verdict for v in result2.verdicts] == ["skip"]


def test_caution_paths(tmp_path):
    state = StateRoot.load(tmp_path)
    result = scan(state, tenants=[brief(fit=0.2)])  # rising but brand_fit below theta
    assert [v.verdict for v in result.verdicts] == ["caution"]


# --- R2: age-adjusted est AND band ----------------------------------------------------------------


def test_age_adjustment_covers_est_and_band():
    # 20 resolved lifetimes with median 25 → raw band "long" (est 25).
    pool = [25.0] * 20
    old = days_remaining_adjusted("rising", pool, age_days=24.0)
    assert old.est == 1.0
    assert old.band == "short"  # re-derived from the remaining estimate, not the raw lifetime
    young = days_remaining_adjusted("rising", pool, age_days=2.0)
    assert young.est == 23.0
    assert young.band == "long"
    ungated = days_remaining_adjusted("rising", [25.0] * 5, age_days=24.0)
    assert ungated.est is None  # below MIN_RESOLUTIONS stays band-only, stage-derived
    assert ungated.band == "long"


def test_aged_signal_with_lifetime_pool_skips_not_goes(tmp_path):
    """The exact loosen-the-go-guard failure: 25d median lifetime, 24d-old signal ⇒ skip."""
    state = StateRoot.load(tmp_path)
    scan(state)  # mint the signal (first_seen = AS_OF - 1)
    scan(state, as_of=AS_OF + timedelta(days=10))  # re-detected: stays live, first_seen reused
    for _ in range(20):
        state.samples.record(
            uuid4(), platform="reddit", origin="automated", scope="public", duration_days=25.0
        )
    late = scan(state, tenants=[brief()], as_of=AS_OF + timedelta(days=23))
    # Same identity, still live (valid_to extended by the re-detection), first_seen = AS_OF-1:
    # age = 24 days ⇒ remaining ≈ 1 ⇒ band short ⇒ skip (an unadjusted band would say long/go).
    assert [v.verdict for v in late.verdicts] == ["skip"]


# --- R3: tenant isolation — the exact internal-signal case ---------------------------------------


def test_tenant_b_never_renders_against_tenant_a_internal_signal(tmp_path):
    state = StateRoot.load(tmp_path)
    result = scan(state, tenants=[brief(TENANT_A), brief(TENANT_B)])
    public_id = result.stored_signal_ids[0]

    # Inject tenant A's internal signal directly (no automated path mints internal yet).
    internal = replace(
        state.signals.get(public_id), id=uuid4(), scope="internal", tenant_id=TENANT_A
    )
    state.signals.add(internal, observed_at=AS_OF.date())

    rendered = scan(state, tenants=[brief(TENANT_A), brief(TENANT_B)])
    by_tenant = {}
    for v in rendered.verdicts:
        by_tenant.setdefault(v.tenant_id, set()).add(v.trend_id)
    assert internal.id in by_tenant[TENANT_A]  # A sees its own internal signal
    assert internal.id not in by_tenant[TENANT_B]  # B never learns A's internal trend exists
    assert public_id in by_tenant[TENANT_B]


# --- R2: render/outcome split + REQ-005f data path ------------------------------------------------


def test_outcome_resolves_at_decline_with_the_promised_window(tmp_path):
    state = StateRoot.load(tmp_path)
    first = scan(state, tenants=[brief(lead=5.0)])
    assert [v.verdict for v in first.verdicts] == ["go"]
    assert state.ledger.go_count == 0  # issued, not yet an outcome (unknowable at render time)
    assert len(state.ledger.open_issues()) == 1

    # 10 days later the trend declines: survived (10 >= lead 5) → a go hit, accuracy 1.0 with n.
    scan(state, tail=DECLINING_TAIL, tenants=[brief(lead=5.0)], as_of=AS_OF + timedelta(days=10))
    assert state.ledger.go_count == 1
    assert state.ledger.misses == 0
    assert state.ledger.go_accuracy() == 1.0


def test_go_whose_trend_dies_early_is_a_miss(tmp_path):
    state = StateRoot.load(tmp_path)
    scan(state, tenants=[brief(lead=5.0)])
    scan(state, tail=DECLINING_TAIL, tenants=[brief(lead=5.0)], as_of=AS_OF + timedelta(days=2))
    assert state.ledger.go_count == 1
    assert state.ledger.misses == 1  # died 2 days in; the verdict promised >= 5


def test_internal_scope_outcome_never_enters_global_accuracy(tmp_path):
    from c1_pattern_engine.detector import compute_verdict

    state = StateRoot.load(tmp_path)
    v = compute_verdict(
        trend_id=uuid4(),
        tenant_id=TENANT_A,
        stage="rising",
        band="long",
        days_remaining_est=None,
        lead_time_days=5.0,
        brand_fit=0.8,
        risk_flag="none",
    )
    state.ledger.issue(v, issued_on=AS_OF.date(), lead_time_days=5.0, signal_scope="internal")
    state.ledger.resolve_trend(v.trend_id, closed_on=AS_OF.date() + timedelta(days=30))
    assert state.ledger.go_count == 0  # tenant data never pools into the global fraction
    assert state.ledger.go_accuracy() is None


def test_resolved_trend_never_churns_duplicate_outcomes(tmp_path):
    """The measurement gate's execution-confirmed repro: a still-declining trend re-detected
    nightly must not append one tautological skip outcome per scan, forever."""
    state = StateRoot.load(tmp_path)
    scan(state, tenants=[brief(lead=5.0)])  # go issued
    for day in (10, 11, 12, 13):  # trend declines and keeps being re-detected declining
        scan(
            state,
            tail=DECLINING_TAIL,
            tenants=[brief(lead=5.0)],
            as_of=AS_OF + timedelta(days=day),
        )
    assert len(state.ledger._outcomes) == 1  # exactly the one resolved go — zero churn
    assert state.ledger.go_count == 1
    assert state.ledger.open_issues() == []

    # And the closed-forever rule survives a restart.
    state.persist()
    reloaded = StateRoot.load(tmp_path)
    scan(
        reloaded,
        tail=DECLINING_TAIL,
        tenants=[brief(lead=5.0)],
        as_of=AS_OF + timedelta(days=14),
    )
    assert len(reloaded.ledger._outcomes) == 1


def test_issued_verdicts_survive_restart(tmp_path):
    state = StateRoot.load(tmp_path)
    scan(state, tenants=[brief(lead=5.0)])
    state.persist()
    reloaded = StateRoot.load(tmp_path)
    assert len(reloaded.ledger.open_issues()) == 1
    assert reloaded.ledger.open_issues()[0].verdict == "go"


# --- R5: no tenants → signals only ----------------------------------------------------------------


def test_scan_without_tenant_config_yields_signals_only(tmp_path):
    result = run_once(
        state_root=tmp_path / "state",
        as_of=AS_OF,
        terms_file=tmp_path / "no-terms.yaml",  # absent
        tenants_file=tmp_path / "no-tenants.yaml",  # absent → no verdicts, no error (R5)
    )
    assert result.verdicts == ()


# --- R1: the supplier -----------------------------------------------------------------------------


def test_risk_flag_typo_fails_loudly_not_softly(tmp_path):
    """A mistyped risk flag must never silently soften a tenant's blocked gate to caution."""
    import pytest

    with pytest.raises(ValueError, match="risk_flag"):
        TenantBrief(tenant_id=TENANT_A, lead_time_days=5.0, brand_fit=0.8, risk_flag="Blocked")

    f = tmp_path / "tenant-briefs.yaml"
    f.write_text(
        f"tenants:\n  - {{ tenant_id: '{TENANT_A}', lead_time_days: 5, brand_fit: 0.8, "
        "risk_flag: block }\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="risk_flag"):
        load_tenant_briefs(f)


def test_supplier_loads_briefs_and_absent_file_is_empty(tmp_path):
    f = tmp_path / "tenant-briefs.yaml"
    f.write_text(
        f"tenants:\n  - {{ tenant_id: '{TENANT_A}', lead_time_days: 5, brand_fit: 0.8 }}\n",
        encoding="utf-8",
    )
    briefs = load_tenant_briefs(f)
    assert briefs == [brief()]
    assert load_tenant_briefs(tmp_path / "missing.yaml") == []


def test_signal_and_verdict_expose_no_scorer_readable_numeric(tmp_path):
    """R4 sanity at the phase level (the three guard tests run in the same suite)."""
    from dataclasses import fields

    state = StateRoot.load(tmp_path)
    result = scan(state, tenants=[brief()])
    sig = state.signals.get(result.stored_signal_ids[0])
    for f in fields(TrendSignal):
        assert not isinstance(getattr(sig, f.name), (int, float))
    v = result.verdicts[0]
    assert not any(isinstance(getattr(v, f.name), (int, float)) for f in fields(v))