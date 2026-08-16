# Phase 6: Per-tenant Verdict Rendering

## Objective
Render `TrendVerdict`s from live signals. `compute_verdict` needs per-tenant inputs (`tenant_id, lead_time_days, brand_fit, risk_flag`) that no supplier provides today — add a **per-tenant config supplier** and wire verdict rendering into the run, tenant-scoped.

## Prerequisites
- [ ] Phase 5 entrypoint merged.
- [ ] Read `detector/verdict.py` (`compute_verdict` `:57`, "rising+go" `:94`, `VerdictLedger` `:122`).

## Requirements Checklist
- [ ] R1: A per-tenant verdict-input supplier (config/fixture-driven initially) yielding `{tenant_id, lead_time_days, brand_fit, risk_flag}` per tenant. **The supplier's contract is config/artefact-only — forever, not just initially**: C1 never grows a read path into ClientHub operational data (the "convenience read replica" that kills the decoupling); if real tenant briefs are ever needed, they arrive as a pushed/exported artefact. This is stated in the Phase 1 ADR. Acceptance: supplier is per-tenant; **no pooling/summarizing across tenants** (a summary statistic of outcome data is outcome data — ADR-0006); the supplier interface docstring states the artefact-only contract.
- [ ] R2: The verdict cross-product is **public signals × subscribed tenants, plus each tenant's own internal signals only** — tenant B's verdicts are never rendered against tenant A's internal signal (that leaks the existence of A's internal trend). For each pair, call `compute_verdict(...)` — its `band`/`days_remaining_est` inputs come from `lifecycle.days_remaining(stage, resolved_samples)` fed by Phase 4 R3's origin-scoped pool **matching the signal's origin class**, and the estimate is **age-adjusted before use**: the pool's samples are full lifetimes (Phase 4 R3), so `days_remaining_est := max(0, est_lifetime − signal_age_days)` where `signal_age_days = as_of − first_seen` — serving the raw lifetime median would overstate the window and loosen the `go` lead-time guard (measurement gate, 2026-07-16; acceptance test required). **The `band` is re-derived from the age-adjusted remaining estimate too** — at ≥20 samples `days_remaining()` bands the raw lifetime median, and `compute_verdict` gates on the band independently of `est` (skip-on-short, go-requires-medium/long), so an unadjusted band loosens the go guard through the other field (measurement gate round 2; its own acceptance test required). **Rendering and outcome-recording are split** (`VerdictLedger.record(verdict, trend_survived=...)` at `verdict.py:132` needs an outcome unknowable at render time): issued verdicts persist to the durable ledger (Phase 4 R6) without an outcome; the outcome resolves at the nightly scan that first classifies the signal `declining` or archives it — `trend_survived := the signal stayed non-declining for ≥ the tenant's `lead_time_days` after issuance` (the window the verdict promised) — which is also what gives REQ-005f's `go_accuracy` its data path. Acceptance: a rising+medium/long, brand-fit, no-risk case → `go`; declining/blocked/short → `skip`; else `caution` (per `verdict.py:83-94`); an issued verdict resolves at the signal's decline/archive with the stated rule (test). If `VerdictLedger.go_accuracy()` is ever surfaced to managers, it is reported with its `n` (= go count), never as a bare fraction — and never pooled across tenants when any recorded verdict derives from an internal signal (a summary statistic of outcome data is outcome data, CLAUDE.md rule 8): ledgers are per-tenant, or accuracy is computed over public-signal verdicts only.
- [ ] R3: **Tenant isolation preserved** — a verdict is computed against only that tenant's inputs; verdicts for tenant A are never derived from tenant B's data. Acceptance: `test_internal_signal_is_tenant_scoped` green; a cross-tenant test constructs **exactly the internal-signal case** (tenant A internal signal + tenant B subscribed → no verdict for B against it, and B's feed/ledger never learns of it).
- [ ] R4: **No trend→score leak via the verdict** — `TrendVerdict` carries no numeric a scorer reads (already true; keep). Acceptance: `test_trend_never_enters_vps` green.
- [ ] R5: Verdict rendering is optional/config-gated in the run (a scan without tenant config still produces signals + coverage). Acceptance: run with no tenants → signals only, no error.

## Implementation Tasks
1. [ ] Add a tenant-config supplier (`detector/tenants.py` or config loader).
2. [ ] Wire per-tenant verdict rendering into `run_scan`/`run`.
3. [ ] Tests: go/skip/caution paths, tenant isolation, no-tenant run.

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `src/IntelligencePlane/c1_pattern_engine/detector/tenants.py` | Create | Per-tenant verdict-input supplier |
| `src/IntelligencePlane/c1_pattern_engine/detector/run_scan.py` | Modify | Optional per-tenant verdict rendering + outcome resolution at decline/archive |
| `src/IntelligencePlane/c1_pattern_engine/detector/run.py` | Modify | Wire tenant config + verdict rendering into the entrypoint (Task 2) |
| `tests/Architecture/test_trend_verdict_render.py` | Create | go/skip/caution + tenant isolation |

## Verification Steps
1. [ ] Verdict paths match `verdict.py` semantics.
2. [ ] `test_internal_signal_is_tenant_scoped`, `test_rationale_injection_isolated` green.
3. [ ] Run with no tenant config still succeeds.

## Completion Criteria
- [ ] Boundaries + Measurement gates PASS; guard tests green; entry gate no new failures.
