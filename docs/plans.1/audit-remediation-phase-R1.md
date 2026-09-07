# Phase R1 — Veto/verdict & compliance integrity (C#)

**Depends on:** R0 (`events-v1.json` 1.3.0). **Primary agent:** `control-plane-engineer`. **Gates:** `veto-integrity-reviewer` (#1,#4,#11,#17,#19), `code-reviewer`/correctness (#5,#20,#21).

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **Non-negotiable rule 1:** The model never decides. Vetoes (V1–V6) and verdicts are computed in deterministic application code; the model may raise a `suspected_veto` but may **never** clear one, and its output is never an input to veto/verdict computation.
- **Non-negotiable rule 2:** No auto-approval, ever. Every `APPROVED` requires a real human click (`human_approved_at`). REQ-021 is won't-change.
- **Non-negotiable rule 4:** Fail closed. Missing/unevaluable inputs degrade to `NEEDS_REVIEW`/held-for-review — never to a default score, never to approval.
- **Golden rule 1:** Read before you write. **Golden rule 4:** Fix causes, not symptoms.
- **Available agents:** `control-plane-engineer`, `veto-integrity-reviewer`, `code-reviewer`. Do NOT request non-existent agents.

## Requirements Checklist (functional)

1. **#1 (CRITICAL, REQ-021/017):** the override path cannot record `APPROVED` without (a) a real `human_approved_at` timestamp and (b) a live `ComplianceResult` re-check showing no fired/unevaluable veto. **Both guards live at the persistence boundary** (`EmitVerdictOverriddenAsync`): to make the veto re-check enforceable there (the record today carries no compliance data), `VerdictOverriddenRecord` gains a `bool BlockingVeto` (= `compliance.AnyFired || compliance.AnyUnevaluable`) alongside `HumanApprovedAt`; the emitter throws when `OverrideVerdict == APPROVED && (HumanApprovedAt is null || BlockingVeto)`. `OverrideService.OverrideAsync` computes both from the live `ComplianceResult` it now accepts — so a direct emitter call cannot approve over a fired veto either.
2. **#4 (HIGH, V1):** `DisclosureDetector` returns `Unevaluable` (held for review), not `Pass`, when `features == null` and the caption alone shows no claim — matching the stated fail-closed invariant.
3. **#5 (HIGH):** `JudgeResultValidator.TryValidate` null-checks `result.Criteria` before indexing; `ScoringService.CallOnceAsync` treats a malformed/`NullReferenceException`-class judge result as a schema failure (→ `NEEDS_REVIEW`). **The widened catch must exempt `OperationCanceledException`** (cooperative `ct` cancellation must propagate, never be laundered into `NEEDS_REVIEW`) and keep `TimeoutException` in its existing `Unavailable`/retry class (`ScoringService.cs:143`) — the widening targets unexpected result-shape exceptions only, not cancellation or timeout.
4. **#11 (MEDIUM):** `RecordHumanApprovalAsync` asserts the submission actually cleared the BAS/hook ladder before persisting — not only the compliance-veto check. The accepted deterministic pre-state is `VerdictEngine.Resolve(...) ∈ { APPROVED, APPROVED_WITH_NOTES }` (the engine returns `APPROVED_WITH_NOTES` for a clean-but-vps<70 submission, `VerdictEngine.cs:73-74`; a strict `== APPROVED` would make every `APPROVED_WITH_NOTES` submission unapprovable). A test pins that `APPROVED_WITH_NOTES` is human-approvable and a REJECTED/REVISIONS/NEEDS_REVIEW pre-state is not.
5. **#17 (LOW):** `ComplianceGate.cs:16-17` doc comment describes the *real* pass conditions (no longer overclaims V1/V5 "cannot pass").
6. **#19 (LOW):** `VerdictIssued` payload populates `hook_gate_fired` from `VerdictEngine` (schema field `events-v1.json:104`), instead of omitting it.
7. **#20 (LOW):** an explicit `SuspectedVeto.FromModel(vetoId)` adapter connects the model's `IReadOnlyList<string> SuspectedVetoes` to the `SuspectedVeto` record type.
8. **#21 (LOW):** untrusted content (`Submission.Caption`, `FeatureRecord.Transcript`) is marked `Untrusted<T>` at the point it is loaded, not only inside `FencedPrompt.Build`'s signature.

## Requirements Checklist (technical / non-negotiables)

- The #1 guard mirrors `EmitVerdictIssuedAsync` (`ComplianceEventEmitter.cs:137`): throw `AutoApprovalRejectedException` when `OverrideVerdict == Verdict.APPROVED && HumanApprovedAt is null`. The invariant must hold even if a future caller bypasses `OverrideService`.
- `VerdictOverriddenRecord` gains `DateTimeOffset? HumanApprovedAt`; the payload emits `human_approved_at` (matches R0's `events-v1.json` 1.3.0).
- No new auto-approval path is created. No model output is read by any veto/verdict computation.
- Fail-closed for #4/#5: the degraded outcome is `Unevaluable`/`NEEDS_REVIEW`, never `Pass`/`APPROVED`/a default score.

## Edge Cases & Failure Paths

- **#1 bypass:** a direct `EmitVerdictOverriddenAsync(APPROVED, HumanApprovedAt: null)` call → must throw. Test this path directly, not only through `OverrideService`.
- **#1 live veto:** override into APPROVED while `ComplianceResult.AnyFired` → must be rejected with a recorded reason (no silent clear).
- **#4:** `features == null`, caption has a claim phrase or `IsSponsored == true` → still requires disclosure (unchanged); `features == null`, caption bare → now `Unevaluable` (changed).
- **#5 double-failure:** judge returns `Criteria: null` → schema failure → `NEEDS_REVIEW`; judge throws an arbitrary exception → schema failure → `NEEDS_REVIEW` (widened catch).
- **Degraded mode:** every changed path degrades to held-for-review, never to a pass/approval.

## Handoff Contracts

Consumes R0's `events-v1.json` 1.3.0 `VerdictOverridden.human_approved_at`. Produces no new artefact for later phases (self-contained hardening).

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R1-T1 | Add `HumanApprovedAt` **and `bool BlockingVeto`** to `VerdictOverriddenRecord`; emit `human_approved_at` in `EmitVerdictOverriddenAsync` payload; throw `AutoApprovalRejectedException` when `OverrideVerdict == APPROVED && (HumanApprovedAt is null || BlockingVeto)` — the veto re-check is now enforceable **at the boundary**, not only the service | control-plane-engineer | `Events/ComplianceEventEmitter.cs` |
| R1-T2 | `OverrideService.OverrideAsync` accepts `ComplianceResult compliance` + `DateTimeOffset? humanApprovedAt`; computes `BlockingVeto = compliance.AnyFired \|\| compliance.AnyUnevaluable` and the timestamp into the record (defence-in-depth; the boundary still enforces) | control-plane-engineer | `Verdicts/OverrideService.cs` |
| R1-T3 | `DisclosureDetector`: when `features is null` and caption shows no claim, return `Unevaluable` not `Pass` | control-plane-engineer | `Compliance/DisclosureDetector.cs` |
| R1-T4 | `JudgeResultValidator.TryValidate` null-checks `result.Criteria`; `ScoringService.CallOnceAsync` widens catch to unexpected result-shape exceptions → schema failure, **exempting `OperationCanceledException` (propagate) and keeping `TimeoutException` in the `Unavailable` class** | control-plane-engineer | `Scoring/JudgeResultValidator.cs`, `Scoring/ScoringService.cs` |
| R1-T5 | `RecordHumanApprovalAsync` asserts `VerdictEngine.Resolve(...) ∈ { APPROVED, APPROVED_WITH_NOTES }` (BAS/hook ladder cleared) before persist | control-plane-engineer | `Verdicts/ApprovalService.cs`, `Verdicts/VerdictEngine.cs` |
| R1-T6 | Tighten `ComplianceGate.cs` doc comment to real pass conditions | control-plane-engineer | `Compliance/ComplianceGate.cs` |
| R1-T7 | Populate `hook_gate_fired` in `VerdictIssued` payload — derive from the **same** `VerdictEngine` `hook < 50m` branch (`VerdictEngine.cs:66-69`) that `Resolve` uses, not a re-computed threshold in the emitter (single source of truth) | control-plane-engineer | `Events/ComplianceEventEmitter.cs`, `Verdicts/VerdictEngine.cs` |
| R1-T8 | Add `SuspectedVeto.FromModel(string vetoId)` adapter | control-plane-engineer | `.../SuspectedVeto.cs` |
| R1-T9 | (#21) Apply `Untrusted<T>` at any caption/transcript load site that **already exists** in current code; the real scoring-endpoint load site does not exist yet (audit #21: "when the real scoring endpoint is wired") → the marking at that site is **re-sequenced to R4b-T7**. If no load site exists today, R1-T9 is satisfied by confirming that and recording it. | control-plane-engineer | existing load sites (if any); else deferred to R4b |
| R1-T10 | Tests: override-bypass (direct emitter, APPROVED + null-timestamp **and** APPROVED + BlockingVeto) throws; V1 null-features → Unevaluable; judge Criteria:null → NEEDS_REVIEW; judge `OperationCanceledException` → propagates (not NEEDS_REVIEW); RecordHumanApproval rejects un-cleared ladder + accepts APPROVED_WITH_NOTES; **structural assertion that `SuspectedVeto.FromModel` output never reaches `VerdictEngine`/`ComplianceGate`** (extend `ModelNotInDecisionPathTests`) | control-plane-engineer | `tests/Architecture/*` (or existing C2 test suite) |

## Files to Create / Modify

Exact paths under `src/ControlPlane/UgcIntelligence.C2.Api/` (verify each by Read before edit): `Events/ComplianceEventEmitter.cs`, `Verdicts/OverrideService.cs`, `Verdicts/ApprovalService.cs`, `Verdicts/VerdictEngine.cs`, `Compliance/DisclosureDetector.cs`, `Compliance/ComplianceGate.cs`, `Scoring/JudgeResultValidator.cs`, `Scoring/ScoringService.cs`, and `SuspectedVeto.cs`; plus test files under `tests/Architecture/`.

## Verification Steps

1. `dotnet build UgcIntelligence.slnx` → 0 warnings / 0 errors. (State: R1-T1..T9 done.)
2. `dotnet test tests/Architecture` → all green, including the four new R1-T10 tests by name. (State: R1-T10 done.)
3. Falsification check (each new guard must bite): revert R1-T1 → override-bypass test fails; revert R1-T3 → V1 null-features test fails; revert R1-T4 null-check → judge-Criteria:null test fails; revert R1-T5 → RecordHumanApproval ladder test fails. Restore each after confirming.
4. Entry gate: schemas parse (unchanged from R0). 

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R1-1 (#1):** a test named e.g. `OverrideToApproved_WithNullHumanApprovedAt_Throws` passes; `EmitVerdictOverriddenAsync` throws `AutoApprovalRejectedException` on override→APPROVED with null timestamp. (evidence: test name + `ComplianceEventEmitter.cs` line)
- **A-R1-2 (#1):** a **direct** `EmitVerdictOverriddenAsync` call with `OverrideVerdict == APPROVED` and `BlockingVeto == true` (bypassing `OverrideService`) throws — the veto re-check is enforced at the boundary. (evidence: test name + `ComplianceEventEmitter.cs` line)
- **A-R1-3 (#4):** `DisclosureDetector` null-features/bare-caption returns `Unevaluable`. (evidence: `DisclosureDetector.cs` line + test)
- **A-R1-4 (#5):** `JudgeResult` with `Criteria: null` yields `NEEDS_REVIEW`, not an uncaught NRE. (evidence: `JudgeResultValidator.cs`/`ScoringService.cs` line + test)
- **A-R1-5 (#11):** `RecordHumanApprovalAsync` rejects a submission that failed the BAS/hook ladder. (evidence: `ApprovalService.cs` line + test)
- **A-R1-6 (#17/#19/#20/#21):** doc comment corrected; `hook_gate_fired` populated; `SuspectedVeto.FromModel` exists; caption/transcript marked `Untrusted` at load. (evidence: file:line each)
- **A-R1-7:** full suite green (`dotnet test`), no regression in the existing 395 C# tests.

## Out of Scope (Surgical Changes)

Do not touch C1 (Python), C3, C4, budget/GateB, frontend. Do not create an auto-approval path. Do not alter `events-v1.json` (R0 owns the schema).

## Completion Criteria (Definition of Done)

`dotnet build`/`dotnet test` green; `veto-integrity-reviewer` PASS; `code-reviewer` PASS on the correctness items; no new invariant claimed without R0's doc already stating it.
