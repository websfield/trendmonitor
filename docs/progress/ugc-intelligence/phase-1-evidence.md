# Phase 1 — C2 Gate A (deterministic compliance lane) — Completion Evidence

**Status: Complete — Ready.** Both Critical-Path gates PASS. Definition of Done satisfied.

## Gate verdicts
| Reviewer | Critical Path | Round 1 | Round 2 | Final |
|---|---|---|---|---|
| `veto-integrity-reviewer` | Veto & verdict integrity | **PASS** (Grade A) | — | **PASS** |
| `boundary-reviewer` | Boundaries & authority | NEEDS CHANGES (1 CHANGE + 1 NOTE) | **PASS** (Grade A) | **PASS** |

`simplification-reviewer` is a skill, not a spawnable agent — advisory-only, absence never gates. Skipped, no impact.
Codex cross-check: not available in this environment; gate proceeds on the Claude reviewers (both PASS).

## Entry gate (artefact: `phase-1-entry-gate.md`, re-verified post-fix)
- `dotnet build UgcIntelligence.slnx` → **0 Warning(s), 0 Error(s)**
- `dotnet test tests/Architecture` → **Passed! 192, Failed: 0, Skipped: 0** (124 Phase-0 + 44 Phase-1 impl + 14 eval + 10 tenancy-fix; every prior test preserved)
- 16 Python architecture tests green · ruff clean · 3 contract schemas parse (`events-v1.json` @ contract_version **1.1.0**)

## Acceptance Criteria (all PASS, each with its test)
- A1 — five day-one injection cases leave veto outcome unchanged: `AdversarialInjectionTests.Case1..Case5` (differential, non-vacuous)
- A2 — subtle injection avoiding forbidden verbs cannot clear a veto: `SubtleInjection_CannotClearVeto`
- A3 — `ComplianceGate`/`VerdictEngine` reference no model-output type; **falsifiable**: `ModelNotInDecisionPathTests` (IL-body scan + Canary self-check; proven RED when `suspected_veto[]` injected into `Resolve`)
- A4 — APPROVED with null `human_approved_at` rejected at persistence: `ApprovalTests.Approved_WithoutHumanClick_IsRejected`
- A5 — no auto-approval path; `auto.?approv` grep hits are prohibitions only: `NoAutoApprovalSourceTests`
- A6 — V1..V5 subsets (31) ⇒ REJECTED; V6 (63 subsets) ⇒ EXCLUDED_FROM_AI_SCORING dominating: `VerdictEngineTests.V1toV5ForceRejected` + `V6ForcesExcluded_Dominates`
- A6b — V6-excluded never in calibration set: `V6Excluded_NotInCalibrationSet`
- A7 — unevaluable veto never resolves to a pass: `UnevaluableVeto_NeverApproves`
- A8 — V6 unknown age fails closed: `V6_AgeUnknown_FailsClosed`
- A9 — V4 grant without `evidence_uri` fires: `V4_GrantWithoutEvidence_IsNotAGrant`
- A10 — `VerdictOverridden` records original/override/reason/reviewer_id: `OverrideTests`
- A11 — triage sorts compliance risks first: `TriageSorterTests.ComplianceRisksFirst`
- A12 — `events-v1.json` → 1.1.0 with changelog, `VerdictIssued.verdict` accepts `EXCLUDED_FROM_AI_SCORING`, 1.0.0 not mutated, Contract B updated same change: `VerdictIssuedContractTests`
- Tenant isolation (boundary fix) — both-directions across every read path + base-class-aware can-fail guard: `TenantScopedRepositoryTests` (10 tests, guard proven RED on injected `ListAll()` leak)

## Definition of Done
- ✅ Entry gate clean; build + test green
- ✅ `veto-integrity-reviewer` PASS · `boundary-reviewer` PASS
- ✅ Acceptance criteria met with cited evidence
- ✅ `RUNBOOK.md` observability section updated: OutcomeEvent log as system-of-record (contract 1.1.0), C2 sole writer

## Accepted residuals (do not re-litigate without cause)
1. **In-memory persistence** (`ConcurrentDictionary`), not EF Core/SQLite — matches Phase 0's actual convention; the human-approval guard and tenant scoping both hold at whatever the persistence boundary is. Both reviewers judged this a correct decision, not a defect. *(If a later phase needs durable storage, standing EF up is a separate, additive step; the invariants live at the boundary, not the backend.)*
2. **`SubmissionScored` deferred to Phase 3** — `events-v1.json` requires `vps`/`bas` on that event, which don't exist without the scoring lane; emitting a compliance-only variant would produce a Contract-B-invalid event. Fail-closed, contract-faithful. No veto/verdict signal lost.
3. **Two latent can-fail-guard NOTEs** (boundary reviewer, non-gating): the reflection guard unwraps one generic level (a future `Task<IReadOnlyList<T>>` async read would need recursion) and tests for a `Guid` parameter's presence not its use (a decoy `ListAll(Guid ignored)` could evade the *structural* scan — the behavioural tests are the backstop). Both are latent: no async repo and no decoy exists this phase. Revisit if/when async repositories land.
