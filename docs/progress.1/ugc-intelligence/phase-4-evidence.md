# Phase 4 — C3 Calibration Monitor (the referee) + C1 internal corpus assembler — Completion Evidence

**Status: Complete — Ready.** Both Critical-Path gates PASS. DoD satisfied. Closes deferral D4 (C3 component doc).

## Gate verdicts
| Reviewer | Critical Path | Round 1 | Round 2 | Final |
|---|---|---|---|---|
| `boundary-reviewer` | Boundaries & authority | **PASS** (Grade A, 0 BLOCK/CHANGE) | — | **PASS** |
| `measurement-reviewer` | Measurement discipline | BLOCK (Grade D) | **PASS** (Grade A) | **PASS** |

## Entry gate (artefact: `phase-4-entry-gate.md`, re-verified post-fix)
- `dotnet build` 0W/0E · `dotnet test tests/Architecture` → **302 passed** (266 + 36 Phase-4 C#)
- `uv run pytest` → **84 passed** (65 + 19 Phase-4 Python) · ruff clean · schemas parse
- C3 component doc exists (`docs/initial/component-3-calibration-monitor.md`), linked in README, CLAUDE.md gap-line closed

## Acceptance Criteria (all PASS)
A1 refuses ρ when n<60 · A2 auto-trip / manual-arm-with-reason (arm w/o reason rejected) · A3 C2 has no write path to breaker (reference-graph fact, falsifiable) · A4 C3 down / cache>60s ⇒ cold, never last-known-armed · A5 temporal splits, test fails on a random split (falsifiable, scans both planes) · A6 promotion resets the window · A7 assembler dedupes on idempotency_key · A8 arm propagates; missing arm raises · A9 anomalous + V6 + fixture excluded from calibration (three tests) · A9b out-of-sample ρ>0.5 n≥60 ⇒ suspected_leak, surfaced never celebrated · A9c fixture cohort never client-facing · A10 breaker_state travels with the score · A11 C3 doc exists + linked.

## Findings resolved this phase
- **Eval-found production defect (Python, pre-gate):** `calibration_stat` had no NaN guard → a zero-variance cohort could emit `rho=NaN` at n≥60. Fixed: non-finite rho maps to `None` (behavioural) + `__post_init__` rejects NaN/inf (structural). A degenerate cohort now emits `rho=None`, read as cold, never armed.
- **Measurement BLOCK (round 1 → resolved):** the correlation seam read `actual_7d_percentile.value` into the Spearman without a measurability check — Proxy-never-in-correlation was enforced only upstream (order-dependent). Fixed: `cohort_statistic` routes every outcome through `MeasuredOutcome.try_from` and raises `NonMeasuredOutcomeError` (sibling of `MixedCohortError`); it is the sole `Provenanced→float` conversion feeding the Spearman (grep-verified), so a Proxy percentile cannot reach the breaker-driving correlation regardless of call path. Defense-in-depth: upstream bulk-drop unchanged, seam hard-fail added.

## Definition of Done
- ✅ Entry gate clean; all three suites green
- ✅ `boundary-reviewer` PASS · `measurement-reviewer` PASS
- ✅ Acceptance criteria met with cited evidence
- ✅ CLAUDE.md's "C3 has no component doc — known gap" line updated (gap closed, D4)

## Accepted residuals / notes (non-gating)
1. **Production `IBreakerReader` (HTTP proxy to C3) is a documented, unwired seam** — same posture as Phase 3's deferred live `IJudge`. The type system forbids the in-process C2→C3 shortcut (`IBreakerReader` in shared `Contracts`; `CalibrationMonitor` unreferenceable from C2), so the deferral opens no boundary hole.
2. **Auto-trip-on-read** (`CalibrationMonitor.ReadAsync` persists a trip) is load-bearing, not a defect: persisting the trip revokes a stale manual arm so a later rho recovery cannot silently re-arm. Stays inside C3's process/authority.
3. **C#/plan test-name drift (traceability note):** the plan cites `Calibration_BelowN60_RefusesToEmitRho` / `Calibration_HighRho_FlagsSuspectedLeak` — satisfied by the **Python** tests of those names (`test_calibration_below_n60_refuses_rho`, `test_Calibration_HighRho_FlagsSuspectedLeak`); the C# monitor's equivalents are `InsufficientN_IsCold_WithNoRho` / `SuspectedLeak_IsSurfaced_ButDoesNotTrip`. Coverage is real and non-vacuous on both planes; names differ across planes only.
4. **In-memory persistence** (accepted convention).
