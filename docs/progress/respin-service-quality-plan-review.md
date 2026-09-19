# Plan review — respin-service-quality

## Post-batch-10 bounded repair (2026-09-17)

**Current assurance remains NOT READY / Not yet / Grade D.** [Final generalist report](creator-ready/batch10-generalist.md): one Medium (B10-C1 failed-dispatch consumption evidence lost), one Low (B10-C2 persisted fixture). All four authorized evaluations completed; no further evaluation authorized. Tenancy and compliance passed the assessed contracts. Nine of ten batch-9 findings closed; B9-C1 remained partial. All 13 tasks and 19 ACs were simulated. Historical 35 reconcile as 33 present, one no-change, one unrecoverable.

The final reviewer supplied the bounded §5 diagnostic: the behavioral scan incorrectly gated both journey success and evidence retention. Under the original repair request, Phase 2 now separates a strictly validated, content-free consumption manifest from the main report, retains it only after verified cleanup, and keeps missing-screenshot/BLOCKING failures red. Initial unknown records, upload/validation failure, strict field/path validation, duplicate handling, download/reconciliation, and negative/mutation cases are specified in the handoff, T2/T4, verification and ACs. The persisted fixture is `succeeded`; the database enum was directly inspected. Both repairs are **unverified plan changes**, not closed findings or product implementation.

Proposed finite reassessment: **billing, tenancy, final generalist**. Compliance text is unchanged; its plan verdict remains scoped to that unchanged contract. This proposal grants no review allowance. Phase 0 stays Ready/A; Phase 3 stays parked. No product tests, hosted dispatches or external writes ran.

Validation observed after this repair: **26 inline Node document assertions passed** (retention contract, separate upload conditions, fixture correction, report presence and current gate link); `git diff --check` passed with only the pre-existing Phase-0 CRLF warning; `git diff HEAD --name-only -- respin` returned no product paths, with a global-ignore access warning. These are document checks, not runtime or independent acceptance. An initial replacement script stopped before writing because its status-text match failed; the corrected script then applied the changes. The planned scan script does not exist yet, as expected for this unimplemented phase.

## Batch 10 — owner-approved eighth extension (2026-09-17)

Owner approved the proposed four-reviewer batch with “go ahead”. All three specialists and the final generalist assessed the same frozen contracts. **Overall: Not yet / Grade D — one Medium and one Low finding.** No product implementation or runtime acceptance is claimed. Batches 0–10 remain consumed; batch 10 completed four evaluations and authorizes no fifth evaluation.

- [Tenancy report](creator-ready/batch10-tenancy.md): Ready/A, PASS; all four batch-9 tenancy findings closed at plan level.
- [Billing report](creator-ready/batch10-billing.md): NEEDS CHANGES, one Medium and one Low. Failed artifact scans can discard consumption reconciliation evidence; the post-parse fixture names the wrong persisted usage outcome.
- [Compliance report](creator-ready/batch10-compliance.md): Ready/A, PASS; w8b propagation and retained findings closed.
- [Generalist report](creator-ready/batch10-generalist.md): NOT READY, Not yet/D; full 13-task/19-AC simulation, mechanical closure, premortem and consolidation completed. No additional substantive findings.

Reports above preserve the returned verdicts and substantive findings/checklist dispositions. Billing's returned “Almost / Grade B” headline is retained in its report; the parent does not infer Ready from that label. Current proof is plan assessment only. Optional cross-model review unavailable; no tests or external writes performed. Earlier no-batch-10-approval statements below are historical and superseded by this explicit reservation.

## Repair disposition — 2026-09-17

The owner's current $go request authorizes the bounded batch-9 repairs. **Ten of ten findings now have plan edits or explicit disposition; independent verification remains owed.** This is constructor accounting, not a reviewer verdict. No product implementation or new reviewer evaluation ran. Batches 0–9 remain consumed; batch 10 requires explicit approval. Phase 0 stays Ready/A and Phase 3 stays parked. The original batch-9 reports below are unchanged.

### Current ten findings

| Finding | Plan repair / disposition | Re-read location |
|---|---|---|
| T9-1 | Mapper scan admits exactly one internal forwarding call, rejects production overrides, and has positive/negative controls. | `docs/plans/respin-service-quality-phase-1.md:90`, `docs/plans/respin-service-quality-phase-1.md:188` |
| T9-2 | Predicate validates offset domain before slicing; predicate and end-to-end seam negatives include the clamped over-end reproducer. | `docs/plans/respin-service-quality-phase-1.md:110`, `docs/plans/respin-service-quality-phase-1.md:188` |
| T9-3 | Separate process groups, bounded TERM/KILL, group absence and conditional artifact upload; Linux probes exercise delayed and failed cleanup. | `docs/plans/respin-service-quality-phase-2.md:95`, `docs/plans/respin-service-quality-phase-2.md:124`, `docs/plans/respin-service-quality-phase-2.md:139` |
| B9-C1 | Read-only per-press claim/usage snapshots, scoped attempt reconciliation, deduplicated refusal counter and unknown-evidence stop; no policy change. | `docs/plans/respin-service-quality-phase-2.md:72`, `docs/plans/respin-service-quality-phase-2.md:135`, `docs/plans/respin-service-quality-master-plan.md:346` |
| T9-4 | Concrete mapper signature, position-table semantics, private default and exact forwarding exception recorded in Handoff Contracts. | `docs/plans/respin-service-quality-phase-1.md:90` |
| C9-1 / B9-C2 | w8b now appears in governing Verification 7 and AC12 as well as AC3. | `docs/plans/respin-service-quality-phase-1.md:181`, `docs/plans/respin-service-quality-phase-1.md:198` |
| B9-C3 | Removed positive call-count floor; retained conditional 17/run and 51/demonstration upper estimate before SDK retries; solo verification also has no floor. | `docs/plans/respin-service-quality-master-plan.md:104`, `docs/plans/respin-service-quality-phase-1.md:180` |
| B9-C4 | Corrected the historical all-applied claim and supplied all 35 individual dispositions below; missing original report remains unrecoverable. | `docs/plans/respin-service-quality-master-plan.md:9` |
| B9-N1 | Removed conditional-pass reading: absent buy-pack/config failure fails the chapter before the reason assertion. | `docs/plans/respin-service-quality-phase-2.md:135` |
| G9-1 | Refreshed both phase headers, Phase-0 dependency and current umbrella projections; standing-rule reference uses a section link. | `docs/plans/respin-service-quality-phase-1.md:3`, `docs/plans/respin-service-quality-phase-2.md:3`, `docs/plans/respin-service-quality-master-plan.md:115`, `docs/plans/creator-ready-master-plan.md:3` |

### Historical 35-item correction

Each item from the batch-9 reconstruction is retained separately. **33 plan changes/disclosures present, 1 original item required no change, 1 original report unrecoverable.** Six formerly partial items (3, 10, 14, 15, 20, 27) have been repaired in this pass; their substantive changes are not independently verified. A present requirement is not implemented or tested behavior.

| # | Retained obligation | Current author disposition | Re-read location |
|---:|---|---|---|
| 1 | B7 tenancy CHANGE 4 — workflow plants | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-2.md:138` |
| 2 | B7 tenancy NOTE 1 — numeric floor | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 3 | B7 tenancy NOTE 2 — test-only mapper | Plan repair applied; reassessment pending. | `docs/plans/respin-service-quality-phase-1.md:90` |
| 4 | B7 tenancy NOTE 3 — README conditional | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-2.md:96`, `docs/plans/respin-service-quality-phase-2.md:141` |
| 5 | B7 tenancy NOTE 4 — persistent-secret wording | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-2.md:95` |
| 6 | B7 billing C2 / compliance C-2 — scan alternative | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:189` |
| 7 | B7 billing N1 — standing-rule reference | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 8 | B7 billing N2 / compliance N-a — rule scope | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-master-plan.md:70` |
| 9 | B7 billing N3 — unguarded history residual | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 10 | B7 billing N4 — surface-present precondition | Plan repair applied; reassessment pending. | `docs/plans/respin-service-quality-phase-2.md:135` |
| 11 | B7 compliance C-3 — eight render files | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:196` |
| 12 | B7 compliance N-c — nonliteral-fold residual | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:196` |
| 13 | B7 compliance N-b — destination degradation | No change required; original recommendation was None. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 14 | B8 #1 — individual disposition | Plan repair applied; reassessment pending. | `docs/plans/respin-service-quality-master-plan.md:9` |
| 15 | B8 #2 — pointer assertion/witness | Plan repair applied; reassessment pending. | `docs/plans/respin-service-quality-phase-1.md:189`, `docs/plans/respin-service-quality-phase-1.md:181`, `docs/plans/respin-service-quality-phase-1.md:198` |
| 16 | B8 #3 — impossible scan arm | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:189` |
| 17 | B8 #4 — eight-file population | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:196` |
| 18 | B8 #5 — trigger clauses/plants | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-2.md:138` |
| 19 | B8 #6 — generative floor | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 20 | B8 #7 — mapper scan/signature/handoff | Plan repair applied; reassessment pending. | `docs/plans/respin-service-quality-phase-1.md:90` |
| 21 | B8 #8 — parked-clause guard | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:189` |
| 22 | B8 #9 — standing rule/reference | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-master-plan.md:70`, `docs/plans/respin-service-quality-phase-1.md:110` |
| 23 | B8 #10 — historical search correction | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-master-plan.md:250` |
| 24 | B8 #11 — w2e invariant credit | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:202` |
| 25 | B8 #12 — README conditional | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-2.md:141` |
| 26 | B8 #13 — persistent-secret wording | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-2.md:95` |
| 27 | B8 #14 — config precondition | Plan repair applied; reassessment pending. | `docs/plans/respin-service-quality-phase-2.md:135` |
| 28 | B8 #15 — umbrella refresh | Existing plan edit/disclosure retained. | `docs/plans/creator-ready-master-plan.md:63` |
| 29 | B8 #16 — historical pointer label | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-master-plan.md:317` |
| 30 | B8 #17 — unguarded read residual | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 31 | B8 #18 — widened consuming-refusal population | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-master-plan.md:93` |
| 32 | B8 #19 — literal-fold residual | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:196` |
| 33 | B8 #20 — live wording label | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 34 | B8 #21 — empty-needle citation | Existing plan edit/disclosure retained. | `docs/plans/respin-service-quality-phase-1.md:110` |
| 35 | B8 #22 — missing batch-7 generalist report | Undone: complete original report was not retained and cannot be recovered; no reconstruction claimed. | `docs/plans/respin-service-quality-master-plan.md:252` |

### Verification and next action

Validation: an inline Node assertion script delivered through a PowerShell here-string passed **89 document/citation and isolated range-contract checks**: ten current findings, 35 historical items, every recorded plan citation, mapper forwarding/domain requirements, w8b propagation, cleanup/upload conditions, claim-based counting, config precondition and status/dependency projections. The isolated range check reproduces JavaScript slice clamping; it is not a test of product code. `git diff --check` passed; `git diff HEAD --name-only -- respin` returned no product changes. Product suites and planned runtime/mutation witnesses are **NOT RUN** (plan-only repair). No reviewer was dispatched; review spend this repair: **0 evaluations**. Required next gate is one finite batch 10: tenancy, billing, compliance, then final generalist, against the repaired contracts. This is a proposed batch, not a reservation or authorization. Product implementation resumes only after current independent plan assurance; approval to continue work does not reset consumed review allowance.


## Batch 9 — owner-approved seventh extension (2026-09-17)

Current assessment: **NOT READY — Not yet, Grade D; four Medium and six Low findings (one Low uncertain).** All four authorized evaluations completed; batches 0–9 are consumed and no batch 10 is authorized. Reservation and frozen inputs: `docs/plans/respin-service-quality-master-plan.md`, current review reservation. Historical reports below remain unchanged. No plan/source repair occurred during this batch. Each report is returned by its independent context and recorded by the orchestrator. The final generalist report and reconciliation below govern the current status.

### Compliance — `/root/batch9_compliance`

**Readiness: Almost · Grade B.** One Low verification-list omission remains; no BLOCK, High, or Medium compliance finding.

**Verdict: NEEDS CHANGES — Respin spin compliance.** Plan review only. `plan gate ran lean (consolidated)`.

**Finding**

- **C9-1 — Low, high confidence:** `docs/plans/respin-service-quality-phase-1.md:187` introduces pointer-deletion witness **w8b**, but the governing mutation instructions at `:179` and complete witness/transcript criterion at `:196` omit it. AC3 requires the witness, while the prescribed verification transcript does not include it—the same population omission previously corrected for w6b. This is an evidence-list consistency defect; the literal assertion itself is now buildable.

**Prior compliance findings**

| Prior item | Current disposition |
|---|---|
| Batch 7 C-1: obsolete pointer in AC3/Decisions | Closed: P1 `:108`, `:187`; master `:63` reference one live sentence. |
| Batch 7 C-2 / batch 8 C3: `SPEND_ONLY` alternative | Closed: P1 `:187` deletes the alternative and requires rendered pre-vendor states. Source confirmed at `respin/tests/onboarding-ui.test.tsx:1411`. |
| Batch 7 C-3 / batch 8 C2: incomplete fold population | Closed: P1 `:194` enumerates all eight rendered component files, excludes the string-only button helper, and requires list maintenance. The current component tree matches. |
| Batch 7 N-a / batch 8 C1: standing rule forbids adopted copy | Closed: master `:62` permits stable locations and forbids external values; P1 `:108` reflects that distinction. |
| Batch 7 N-b: destination’s degraded states | Retained, acknowledged residual: P1 `:108`. No new money-path repair inferred. |
| Batch 7 N-c / batch 8 N1: nonliteral fold residual | Recorded at P1 `:194`; no prop-selected element was found in the inspected render tree. |
| Batch 8 C4: pointer lacks independent literal/witness | Literal requirement closed at P1 `:187`; witness accounting remains C9-1 above. |
| Batch 8 C5: misleading propagation record | Superseded wording is now explicitly marked at master `:286`; the correction and historical search record are retained at `:264`. |
| Batch 8 N2: second live-pointer copy | Historical status explicitly marked at master `:309`. |
| Batch 8 N3: byte identity presented as truth | Closed: P1 `:187` separates static-string invariance from ledger-location evidence. |
| Batch 8 N4: silently omitted dispositions | Compliance items are now addressed at master `:238–244`; the missing historical generalist report remains explicitly unrecoverable. Whole-list accounting belongs to the final generalist. |

**Eight checklist dispositions**

1. **Sources allowlist — holds within scope.** No adapter/dependency change planned. Manifest search found only the existing Playwright test dependency among the searched scraping/browser terms.
2. **Similarity gate before display — n/a.** Spin execution and similarity gating are outside this change.
3. **Minimum-difference rule — n/a.** No Spin-generation or comparison change.
4. **Kill-test honesty — holds in planned behavior.** P1 `:113–114`, `:194` preserve refusal reasons, sharper angle, charge and preparation disclosures. Current renderer separates honest refusal from draft display (`generation-outcome.tsx:473`, `:510`, `:543`). C9-1 concerns the additional voice-refusal witness record.
5. **No invented specifics — holds under the approved R-68 amendment.** Creator-field offers, hard disclosure fallback, filtered counts and unchanged stored findings are explicitly tested at P1 `:193`. The disclosure-specific residual is recorded.
6. **No guarantees — holds.** New copy promises no performance or resolution timeline; weakest-point visibility remains required. AC3 uses independent literals rather than its own copy table.
7. **No automation/concealment — holds.** No automation surface is introduced. T6 leaves `summary.claims` unfiltered; hard disclosure enforcement remains at `respin/packages/modes/src/claims.ts:467`, with context demotion retaining findings at `:691`.
8. **Autopsy caching/honesty — n/a.** No autopsy or trend-score change.

**Least-confident probes**

- **Phase 1:** The suspected quote-normalisation cause remains unproven and is honestly labelled. The current parser has the stated exact-match failure path (`assemble.ts:264`, `:372`); the planned kind and mapper-witness thread can diagnose subsequent refusals without claiming the observed failure is solved.
- **Phase 2:** Hosted-runner bootstrap assumptions remain explicitly unverified pending the bounded dispatch demonstration. No runtime assurance was inferred.

**Coverage**

Read fully: `AGENTS.md`, `CLAUDE.md`, gate rules, compliance agent/skill, master plan, both phase plans, codebase review, retained batch-7/8 compliance reports and batch-8 generalist report; all eight component files in AC10, plus `studio-view.tsx`, onboarding `run-outcome.tsx`, and `safe-log.ts`.

Read targeted sections: codebase-map feature index; R-68/R-69 and PRD requirements; assembly/inference and settlement paths; disclosure scanners; copy functions; UI/agreement tests; usage ledger display; Phase-0 card confirming **Ready, Grade A**.

Commands: read-only PowerShell `Get-Content`/line selections and `rg` searches. **No product tests, mutation runs, writes, network operations, or credential/environment-file reads.** Requested model/effort: `gpt-6-astra`/`max`; resolved runtime unverified.

### Tenancy — `/root/batch9_tenancy`

**Readiness: Not yet · Grade C · TENANCY verdict: NEEDS CHANGES.**
**0 BLOCK · 0 High · 3 Medium · 1 Low.** CI secret-lifetime proof remains incomplete under gate-rules §1.

References below use `P1` = `docs/plans/respin-service-quality-phase-1.md`, `P2` = corresponding `phase-2.md`, and `Master` = corresponding `master-plan.md`.

| ID | Severity / confidence | Finding |
|---|---|---|
| T9-1 | **Medium / High** | **`P1:108` — the new test-only scan rejects the required implementation.** `parseVoiceReply` must forward `mapBack` to its internal `locateQuote` call, while the scan prohibits `mapBack` at every call site outside `packages/llm/tests/**`. That required call is in `packages/llm/src/assemble.ts:372`. No permitted forwarding exception is specified. Keeping `defaultMapBack` private also does not prevent callers supplying their own mapper. **Defect introduced by the plan repair; no observed production leakage.** |
| T9-2 | **Medium / High** | **`P1:108` — the promised mis-map classification lacks a bounds failure case.** The mandated predicate checks canonical equality and whitespace edges, but does not require integer/in-bounds offsets. Inspection counterexample: content `"a-b"`, model quote `"a–b"`, injected range `[0,4)`. `slice` clamps to `"a-b"`; both specified checks pass, but the database rejects `endUtf16 > content.length` at `respin/packages/db/src/with-workspace.ts:5723`. Neither the wrong-range table nor seam negatives covers this case. Thus a mis-map can still reach a kindless provenance refusal. **Newly identified gap in the planned guarantee; existing database protection remains intact.** |
| T9-3 | **Medium / High** | **`P2:89`, `P2:130` — HTTP shutdown does not establish that key-bearing processes have exited.** Step 6 records PIDs without specifying the process-group setup that step 8 assumes. Step 8 signals TERM and waits only for HTTP connection refusal; the separate worker handles TERM asynchronously (`respin/worker/main.ts:45`) and awaits graceful shutdown with a 30-second timeout (`respin/worker/pg-boss-runtime.ts:448`). Upload runs with `if: always()`, including after cleanup failure. The worker can therefore retain the vendor key during upload, contrary to the stated boundary. AC5 provides workflow-text checks, not this negative case. **Gap in the proposed workflow, not an observed deployed leak.** |
| T9-4 | **Low / High** | **`P1:88`, `P1:108`, `Master:240` — the claimed mapper handoff was not added.** Handoff Contracts contains no `mapBack` entry, and its callback signature remains unspecified. Literal injected ranges and private default visibility are now stated, but the retained contract item is only partly addressed. **Remaining documentation/accounting defect.** |

The least-confident probes support P1’s diagnosis-first approach: the original failed reply is unavailable, and the plan does not promise canonicalization fixes that incident. Its stronger mis-map guarantee fails T9-2. P2’s UI-based admin bootstrap matches `platform-admin.spec.ts:41`; hosted-runner behavior remains explicitly pending the first dispatch, while cleanup already has the source-supported gap T9-3.

Retained-item accounting — **12 closed, 3 partial**, counting each retained report item separately:

| Retained item | Disposition and current evidence |
|---|---|
| Batch 7 CHANGE 1 — seam reachability | **Closed on its original defect:** `P1:108` threads the mapper through `parseVoiceReply`; containment tracked separately below. |
| Batch 7 CHANGE 2 — obsolete w2b | **Closed:** governing definition `P1:179`. |
| Batch 7 CHANGE 3 — AC12 “only” claim | **Closed:** `P1:196`. |
| Batch 7 CHANGE 4 — missing workflow plants | **Closed:** both plants and clauses at `P2:89`, `P2:129`. |
| Batch 7 NOTE 1 — numerical floor | **Closed:** 20 qualifying cases/run, `P1:108`. |
| Batch 7 NOTE 2 — test-only seam | **Partial:** scan exists but conflicts with forwarding, T9-1. |
| Batch 7 NOTE 3 — repository-secret qualification | **Closed:** `P2:90`, `P2:132`. |
| Batch 7 NOTE 4 — artifact-secret wording | **Closed:** “persistent” qualifier, `P2:89`. |
| Batch 8 CHANGE 1 — numerical floor | **Closed:** `P1:108`. |
| Batch 8 CHANGE 2 — scan and handoff | **Partial:** T9-1 and T9-4. |
| Batch 8 CHANGE 3 — workflow plants | **Closed:** `P2:89`, `P2:129`. |
| Batch 8 NOTE 1 — README qualification | **Closed:** `P2:90`, `P2:132`. |
| Batch 8 NOTE 2 — artifact-secret wording | **Closed:** `P2:89`. |
| Batch 8 NOTE 3 — w2e credit | **Closed:** `P1:200`. |
| Batch 8 NOTE 4 — mapper contract | **Partial:** literal mapper/private default specified; signature and handoff remain absent. |

All eight numbered checks, in **plan-review mode**:

| Check | Disposition |
|---|---|
| **1. Single scoping helper** | **Holds.** The actual proposed accessor is `hasGenerationForProfile`, not `hasFullScript`. `P1:94` composes scoped `generationsNewest({limit:1})`; registration points, selected-profile callers, sibling/workspace negatives and P4 contamination witness are enumerated. |
| **2. Mechanism-level stripping** | **N/A:** no new shared-library flow. |
| **3. Append-only brains, provenance, approval** | **Violated for the matcher guarantee — T9-2.** Existing scoped evidence validation, versioning and confirmation remain preserved. Confidence is withdrawn by current `PRD.md:67`; its absence is not a finding. |
| **4. Sensitive inference** | **N/A:** no new inferred fields or sensitive-trait inference. |
| **5. Export/deletion completeness** | **N/A:** no new creator-data table. |
| **6. Roles/admin boundary** | **Holds in plan.** Bootstrap creates an ephemeral identity through signup; existing allowlist remains authoritative. No billing/admin authority is added to seats. |
| **7. PII/secrets posture** | **Violated — T9-3.** Static refusal diagnostics and explicit synthetic-artifact disclosures otherwise hold. |
| **8. Requirement provenance and tested claims** | **Violated — T9-1 through T9-4.** Requirements are cited, but the stated containment, classification and cleanup claims exceed their specified proofs. |

Coverage: read the master, both phase plans, brief and codebase review fully; read canon, reviewer/skill, retained tenancy reports and relevant requirement sections. Inspected exact matcher/export/caller, DB provenance/scoping, accessor-registration/tests, onboarding/logging, admin bootstrap/auth/artifact, workflow and worker-shutdown sources. Read the codebase map before source exploration. Money Phase 3 stayed outside scope.

Actual commands were read-only `Get-Content -LiteralPath` with bounded line selections, targeted `rg -n` searches, and `rg --files .github/workflows`. One unquoted-path read failed in PowerShell and was retried quoted; no product command ran. **No fresh tests, witness mutations, writes, network access or secret-file reads.**

Phase 0’s final batch-15 **Ready / A** reconciliation is accepted; its dependency finding is not reopened. Historical entry evidence remains 5,067 passed / 101 skipped, with 23 Docker files not run. This verdict assesses the plans, not implementation acceptance. Requested model was `gpt-6-astra/max`; runtime resolution was not independently verified.

### Billing — `/root/batch9_billing`

**Readiness: Almost · Grade B · NEEDS CHANGES.** Four CHANGE findings and one NOTE; no BLOCK. This is a plan verdict, not implementation acceptance.

Scope: `docs/plans/respin-service-quality-{master-plan,phase-1,phase-2}.md`. Below, **M**, **P1**, and **P2** refer to those files. Phase 0’s batch-15 Ready/A dependency proof is accepted.

| ID | Severity / confidence | Finding |
|---|---|---|
| C1 | **Medium / High** | **M:338; P2:87,126:** the demonstration stops after two refusals that **consumed** an included build, but the planned evidence records only outcome/code/optional assembly kind. Non-assembly failures have no consumption witness: `workspace_paused` occurs before consumption (`respin/packages/credits/src/inference.ts:562`) and after it (`respin/packages/db/src/with-workspace.ts:4076`, called after settlement by `infer-voice.ts:256`); truncation explicitly consumes nothing (`respin/packages/llm/src/errors.ts:256`). The action returns code without consumption or attempt identity (`respin/app/(product)/onboarding/actions.ts:323`). No reconciliation step or negative-case test establishes the required count. **Unsatisfied plan requirement; underlying settlement behavior is pre-existing.** |
| C2 | **Low / High** | **P1:179,196:** AC3 introduces pointer-deletion witness **w8b** at P1:187, but both the required mutation execution list and AC12’s transcript list omit it. This repeats the propagation gap previously repaired for w6b. **Introduced by the latest plan fix.** |
| C3 | **Low / High** | **M:96:** the asserted 11-call lower estimate says each solo generation makes at least two calls because scoring is active. Parsing can refuse after the first call (`respin/packages/modes/src/pipeline.ts:164`), and scoring runs only on an accepted draft with usable rules (`:313–319`). Authorized refusal branches therefore invalidate that floor. The 51-call upper estimate remains conservative. **Existing plan claim remains inaccurate.** |
| C4 | **Low / High** | **M:238–244:** the 35-item disposition adds totals but condenses 25 items into grouped prose without individually identifying every item and its location/status. It still does not satisfy `.claude/gate-rules.md:431–433`. **Prior billing accounting finding remains partially unresolved.** |
| N1 | **Low / Medium** | **P2:126:** “the assertion runs only where `config.ok`” permits skipping the owner-boundary assertion on unavailable config, whereas T1 at P2:86 requires asserting the surface exists first. The acceptance wording leaves a conditional-pass interpretation that T1 excludes. The control really is absent when config fails (`respin/app/(product)/settings/billing/billing-view.tsx:436`). **Ambiguity introduced by the precondition fix.** |

The pre-existing unguarded credit-history read and parked false sibling money clauses are recorded residuals, not new blockers. The widened post-settlement refusal population is now explicitly recorded at M:85.

| Check | Disposition |
|---|---|
| **1 — B1, ledger/balance** | **N/A to mutation:** P1:52,208 exclude ledger/balance changes. No mutable balance is proposed. This was not a fresh whole-ledger audit. |
| **2 — B2, idempotency** | **N/A to mutation:** no webhook changes. Existing double-delivery and grace/downgrade tests inspected at `credits/tests/stripe.test.ts:609,675`; zero-balance pre-call refusal inspected at `credits/tests/inference.test.ts:300`. Not executed. |
| **3 — B3, settlement** | **N/A to mutation:** claim/debit-before-parser ordering verified at `credits/src/inference.ts:869,927` and `infer-voice.ts:214,236,256`. The plan preserves the parked policy rather than promising atomic voice-document settlement. |
| **4 — B4, expiry/pause** | **N/A:** no expiry/allocation/pause implementation changes. Applied current canon’s lot-fold/soonest-effective-expiry supersession, not the checklist’s obsolete naive-sum/oldest-first wording (`tech-spec.md:80,118`). |
| **5 — B5, config authority** | **Holds:** T8 uses the existing live entitlement facade; no seeded tier-name list or numeric price enters product copy. Verified `app-server.ts:642`, `mode-access.ts:310`, `trends/actions.ts:99`; P1:115,195. |
| **6 — B6, tiers/owners** | **Holds in product design:** Free stays keyless/default; owner reason outranks Stripe/config mapping remedies. Existing action-owner test covers all seven operations (`credits/tests/actions.test.ts:471`). Planned UI acceptance ambiguity is N1. |
| **7 — number provenance** | **Holds for authority:** allowance/rebuild examples cite seed config; dispatch/refusal caps cite owner decisions. The vendor-call estimate itself remains inaccurate: C3. |
| **8 — B7, effective tests** | **Violated in planned proof:** C1 lacks a consuming-refusal witness; C2 drops the new pointer witness from execution requirements. Other scoped tests are meaningfully specified: literal pointer, static-entry check, four parked-clause pins, allowance-zero/positive/error cases and shared-Date identity. No money-mutating implementation is proposed. |

Prior-item accounting, using batch-8 billing findings in their recorded order:

| Prior item | Closure |
|---|---|
| Batch7 C1 — stale pointer in AC/master | **RESOLVED:** P1:108,187; M:63. |
| Batch7 C2 — `SPEND_ONLY` alternative | **RESOLVED:** P1:187 removes it. |
| Batch7 N1 — dangling standing-rule citation | **RESOLVED:** P1:108 points to master Decisions. |
| Batch7 N2 — overbroad causal claim/rule | **RESOLVED:** M:62 scopes the rule and says three of five defects. |
| Batch7 N3 — unguarded history read | **RESOLVED as disclosure only:** P1:108; code at `usage/page.tsx:108` remains pre-existing. |
| Batch7 N4 — AC1 surface precondition | **PARTIAL:** P2:126 adds config wording but leaves N1’s ambiguity. |
| Batch8 C1 — impossible scan alternative | **RESOLVED:** P1:187. |
| Batch8 C2 — three identical renders | **RESOLVED:** P1:187 specifies one render, static-source check and separate price-line tests. |
| Batch8 C3 — unspecified literal pin | **RESOLVED in design:** P1:187 requires a literal independent of the copy table; C2 identifies the new execution-list gap. |
| Batch8 C4 — parked-clause guard | **RESOLVED:** P1:187 pins all four named clauses. |
| Batch8 C5 — individual disposition | **PARTIAL:** totals added; C4 remains. |
| Batch8 N1 — second live wording | **RESOLVED:** M:309 labels the historical copy explicitly. |
| Batch8 N2 — rule forbids its own pointer | **RESOLVED:** M:62 permits stable locations. |
| Batch8 N3 — destination failure residual | **RESOLVED as disclosure only:** P1:108. |
| Batch8 N4 — enlarged charged/refused population | **RESOLVED as disclosure only:** M:85. |
| Batch8 N5 — live sentence label | **RESOLVED:** P1:108. |

**Least-confident probes:** P1:204 correctly leaves the original model failure unexplained; the proposed tolerance cannot establish that root cause, and M:85 now records its billing consequence. P2:140 correctly leaves hosted-runner bootstrap assumptions for the bounded dispatch demonstration; that uncertainty is separate from C1’s missing consumption evidence.

**Coverage and commands:** Read the master, both phases, brief, and codebase review fully; also AGENTS, CLAUDE, gate rules, billing reviewer, billing skill and project context. Read the codebase-map index before source exploration; retained-history coverage included lines 1255–1332 and 1404–1508.

Source coverage included:

- Onboarding outcome/state/cost-copy modules fully; actions:275–331; billing-error producer/copy ranges:570–625,970–1180,1908–2010,2045–2063; honesty tests:1361–1490.
- Credits `infer-voice`:126–280; `inference`:521–1020,1078–1104; entitlement facade:631–655; mode-access:281–325; Stripe actions:279–316,900–1002.
- LLM assembly:46–400; error classifications:85–203,226–258.
- Usage page:1–140,228–245; history view:546–585; DB accessor:739–762 and pause-write producer:4064–4080.
- Trends page:287–357; actions:78–122; niche panel fully; billing-view owner/config/control ranges.
- Seed:29–89; config schema:21–72; relevant creator journey bodies, artifact-note writer, pipeline:140–204,302–323 and worker schedules:340–365.
- PRD §4G; tech-spec settlement/config/ledger provisions; decisions R-6/R-7/R-12; M1 acceptance; T6-P deferral; Phase0 batch-15 verdict.

Commands were read-only `Get-Content -LiteralPath … -Encoding UTF8` with numbered-range loops and `rg -n` source/history searches. Failed lookups for nonexistent brain-write files and a misplaced billing-errors path were corrected through source search. **No writes, product execution, tests, network or secret-file reads.** Historical 5,067 passed/101 skipped and 23 Docker files NOT RUN are not fresh acceptance evidence. Requested model/effort: `gpt-6-astra/max`; resolution unverified.

### Generalist — `/root/batch9_generalist`

**Readiness: Not yet · Grade D · NOT READY.** The mapper instructions conflict, and two Phase 2 controls lack sufficient evidence contracts.

This is the reserved batch-9 final assessment. No files changed, tests ran, or additional reviews launched.

References: **M** = `docs/plans/respin-service-quality-master-plan.md`; **P1/P2** = corresponding phase plans; **R** = `docs/progress/respin-service-quality-plan-review.md`; **U** = `docs/plans/creator-ready-master-plan.md`.

#### Consolidated findings

**Four Medium, six Low; one Low is uncertain. No High or BLOCK.**

| ID | Severity / confidence | Finding |
|---|---|---|
| **T9-1** | Medium / High | **P1:108:** the required `parseVoiceReply` → `locateQuote` forwarding passes `mapBack` outside `packages/llm/tests/**`, which the new source scan forbids. No forwarding exception is specified. The instructions cannot both be satisfied. |
| **T9-2** | Medium / High | **P1:108,186,204:** the postcondition lacks integer/bounds checks. For content `"a-b"`, needle `"a–b"` and injected `[0,4)`, `slice` clamps; canonical equality and whitespace-edge checks pass. The database rejects the range at `respin/packages/db/src/with-workspace.ts:5723`, producing the kindless provenance refusal the plan promises to prevent. Neither mandated seam negative covers this. |
| **T9-3** | Medium / High | **P2:89,130:** step 6 records PIDs without establishing the process groups step 8 assumes. HTTP connection refusal does not prove the separate worker exited; its TERM handler awaits asynchronous shutdown (`respin/worker/main.ts:45`, `pg-boss-runtime.ts:448`). Upload also runs after cleanup failure. The stated key-lifetime boundary is therefore unproven. |
| **B9-C1** | Medium / High | **M:338; P2:87,126:** the two-consuming-refusal stop rule has no consumption reconciliation or negative-case witness. `workspace_paused` can occur before consumption (`inference.ts:562`) or after settlement (`with-workspace.ts:4076`); truncation consumes nothing (`llm/src/errors.ts:256`). Outcome/code/optional kind cannot reliably establish the count. |
| **T9-4** | Low / High | **P1:88,108; M:240:** the claimed mapper handoff remains absent, and its callback signature is unspecified. Literal injected ranges and private default visibility address only part of the retained item. |
| **C9-1 = B9-C2** | Low / High | **P1:179,187,196:** AC3 adds **w8b**, but Verification 7 and AC12 omit it. This repeats the earlier w6b propagation omission. |
| **B9-C3** | Low / High | **M:96:** the 11-call floor assumes every solo generation reaches scoring. Parsing can fail after call one (`pipeline.ts:164`); scoring requires an accepted draft with usable rules (`:313–319`). The 51-call upper estimate remains conservative under its stated exclusions. |
| **B9-C4** | Low / High | **M:238–244:** “35 applied” is unsupported. The disposition groups items without individual status/location accounting; six reconstructed obligations remain partial or defective, and one historical report remains unrecoverable. |
| **B9-N1** | Low / Medium — uncertain | **P2:86,126:** T1 requires asserting the billing surface exists; AC1 says the assertion runs only where `config.ok`. That permits a conditional-pass interpretation which T1 excludes. The control is absent when configuration fails (`billing-view.tsx:436`). |
| **G9-1** | Low / High | **P1:3; P2:3; M:107:** current projections still say “pending batch 6,” and M’s Phase-1 dependency cell says `none` despite P1:102 and U:102 requiring Phase 0. P1:108’s standing-rule citation also points to M:43 rather than its current home at M:62. Phase 0 is satisfied; this is document inconsistency, not a reopened dependency failure. |

The original specialist reports remain unchanged:

| Reviewer | Original result |
|---|---|
| Tenancy | Not yet / C; NEEDS CHANGES; three Medium, one Low |
| Billing | Almost / B; NEEDS CHANGES; one Medium, four Low |
| Compliance | Almost / B; NEEDS CHANGES; one Low |

The aggregate uses the plan-reviewer’s **Not yet / D** rule because T1 contains incompatible instructions. No original verdict is converted into PASS. The compliance finding is deduplicated with billing C2.

#### Execution simulation

All **13 tasks and 19 ACs** were walked.

| Task | Outcome |
|---|---|
| P1 T1(i) — kinds | Buildable: sixteen named throw sites, exhaustive set check and fixtures. |
| P1 T1(ii)/(iv) — matcher and proof | **Blocked:** T9-1; promised classification also fails T9-2. Mapper contract remains incomplete. |
| P1 T1(iii) — refusal/logging | Buildable; w8b execution accounting remains incomplete. |
| P1 T2 — landing/nav | Buildable; destinations, caller and tests named. |
| P1 T3 — steps/accessor | Buildable; scoped composition, registration population, unknown/rethrow cases and sibling witnesses named. |
| P1 T4 — brain folds | Buildable; default/open states and section order specified. |
| P1 T5 — active-document notices | Buildable; Studio and first-ideas failed-read handling included. |
| P1 T6 — disclosure offers | Buildable under the approved R-68 narrowing; creator findings and concealment assertions retained. |
| P1 T7 — progressive disclosure | Buildable; eight-file render population, state fixtures and planted violations specified. |
| P1 T8 — niche block | Buildable; live allowance, shared `Date`, preserved rows and journey branch specified. |
| P2 T1 — settled waits/owner assertions | Buildable except B9-N1’s acceptance ambiguity. |
| P2 T2 — voice/editor handoff | Branch handling buildable; consuming-refusal demonstration evidence is missing. |
| P2 T3 — routes/paid gates | Buildable; route population and branch-independent screenshot names specified. |
| P2 T4 — workflow/scanners | **Incomplete:** process shutdown/key-lifetime proof fails T9-3; demonstration counting fails B9-C1. |
| P2 T5 — README | Buildable as documentation; its shutdown claim inherits T9-3. |

| Acceptance criterion | Simulation outcome |
|---|---|
| P1 AC1 | Buildable. |
| P1 AC2 | **Incomplete:** incompatible scan and uncovered bounds failure. |
| P1 AC3 | Literal/static-source assertions are now buildable; w8b is missing from governing execution lists. |
| P1 AC4 | Buildable. |
| P1 AC5 | Buildable. |
| P1 AC6 | Buildable. |
| P1 AC7 | Buildable. |
| P1 AC8 | Buildable. |
| P1 AC9 | Buildable, including named manual checks. |
| P1 AC10 | Buildable; previous render-population omission closed. |
| P1 AC11 | Buildable. |
| P1 AC12 | **Incomplete witness enumeration:** w8b omitted. |
| P2 AC1 | Branch evidence specified; config precondition ambiguous and insufficient for consumption counting. |
| P2 AC2 | Buildable, with both planted proximity violations. |
| P2 AC3 | Buildable from the explicit F-20 route population. |
| P2 AC4 | Buildable; both previously missing workflow plants now present. |
| P2 AC5 | **Incomplete:** workflow-text checks do not prove worker/process exit. |
| P2 AC6 | First-run evidence specified; the master’s bounded closing demonstration still lacks consumption evidence. |
| P2 AC7 | Conditional repository-secret disclosure is specified; shutdown assurance remains incomplete. |

#### Pre-mortem and weakest assumptions

- **Wrong original diagnosis:** honestly retained at P1:204. The failed reply is unavailable; kinds diagnose a subsequent refusal. Tolerance is not claimed to prove that incident’s cause.
- **Wrong map-back loses the diagnostic:** **unabsorbed bounds case**, T9-2. Original seam reachability is repaired; the broader guarantee remains incomplete.
- **Invented onboarding completion:** absorbed by T3’s scoped reads, clamp/config cases and explicit unexpected-error rethrow.
- **Green run conceals skipped personas:** absorbed by shared screenshot names, missing-screenshot plants and explicit operator/editor branches.
- **Key-bearing worker survives until upload:** **unabsorbed**, T9-3.
- **Demonstration stops or continues on the wrong refusal count:** **unabsorbed**, B9-C1.
- **Cold bootstrap/compile failure:** explicitly addressed by readiness checks and bounded redispatch; hosted-runner behavior remains unverified until execution, as P2:140 states.
- **Hidden disclosure/parked-copy regression:** addressed by the eight-file population and four clause pins.
- **Unusable `/usage` destination and charged-without-deliverable policy:** recorded existing residuals under the approved scope. This review does not reopen the parked money implementation.

#### Mechanical checks

- **Dependency proof:** Phase 0’s final batch-15 reconciliation is **Ready / A**, plan and execution PASS (`creator-ready-phase-0-card.md:279,315`). Historical failures were not treated as current.
- **Task/file closure:** P1 has **43 rows / 49 distinct paths**; P2 has **14 rows**. Task ownership and modification tables reconcile.
- **Owners/reviewers:** all five named agent files exist.
- **Requirement routing:** service/paid splits reconcile through U:31, including its explicit F-17 override.
- **Invariants:** P1’s eleven and P2’s three named slugs reconcile with their checklists and coverage sections. No silent rename found in the retained history.
- **Handoffs:** kinds, testids, signup destination and scoped accessor are specified; mapper handoff is the exception.
- **Reachability/Least confident:** present in both phases and probed above.
- **Numbers:** the call-floor claim fails B9-C3. The newly pinned 20-case floor resolves its previous missing-value finding.
- **Size:** the >25-row warning remains applicable and owner-accepted. I could simulate the current tasks; no additional inability-to-simulate finding is claimed.

#### Individual accounting of the claimed 35 fixes

This reconstructs the **13 residual batch-7 items** from R:1654–1663 and the **22 numbered batch-8 items** from R:1640–1644. Repeated defects across batches are counted separately because the claim does so.

“Closed” means the requested plan edit or explicitly requested residual disclosure is present—not that implementation passed.

| # | Retained obligation | Current disposition / evidence |
|---:|---|---|
| 1 | B7 tenancy CHANGE 4 — workflow plants | **Closed:** P2:89,129. |
| 2 | B7 tenancy NOTE 1 — numeric floor | **Closed:** P1:108. |
| 3 | B7 tenancy NOTE 2 — test-only mapper | **Partial/defective:** conflicting scan, T9-1; P1:108. |
| 4 | B7 tenancy NOTE 3 — README conditional | **Closed:** P2:90,132. |
| 5 | B7 tenancy NOTE 4 — artifact wording | **Closed:** “persistent” qualifier, P2:89. |
| 6 | B7 billing C2 / compliance C-2 — scan alternative | **Closed:** P1:187. |
| 7 | B7 billing N1 — standing-rule reference | **Closed in substance:** M’s Decisions identified, P1:108; current line drift is G9-1. |
| 8 | B7 billing N2 / compliance N-a — rule scope | **Closed:** M:62. |
| 9 | B7 billing N3 — unguarded history destination | **Closed as disclosure:** P1:108. |
| 10 | B7 billing N4 — surface-present precondition | **Partial:** P2:126 retains B9-N1 ambiguity. |
| 11 | B7 compliance C-3 — missing render files | **Closed:** P1:194. |
| 12 | B7 compliance N-c — nonliteral-fold residual | **Closed as disclosure:** P1:194. |
| 13 | B7 compliance N-b — destination degradation | **No change required:** original fix was “None”; acknowledged at P1:108. |
| 14 | B8 #1 — individual disposition | **Partial:** M:238–244 still groups items. |
| 15 | B8 #2 — pointer assertion/witness | **Partial:** literal/source check present at P1:187; w8b execution lists incomplete. |
| 16 | B8 #3 — impossible scan arm | **Closed:** P1:187. |
| 17 | B8 #4 — eight-file population | **Closed:** P1:194. |
| 18 | B8 #5 — trigger clauses/plants | **Closed:** P2:89,129. |
| 19 | B8 #6 — generative floor | **Closed:** P1:108. |
| 20 | B8 #7 — mapper scan/signature/handoff | **Partial/defective:** T9-1 and T9-4; P1:88,108. |
| 21 | B8 #8 — parked-clause guard | **Closed:** P1:187. |
| 22 | B8 #9 — standing rule/dangling reference | **Closed in substance:** M:62; P1:108. |
| 23 | B8 #10 — search record/supersession marker | **Closed:** dated correction M:264; explicit marker M:286. |
| 24 | B8 #11 — w2e invariant credit | **Closed:** P1:200. |
| 25 | B8 #12 — README conditional | **Closed:** P2:90,132. |
| 26 | B8 #13 — persistent-secret wording | **Closed:** P2:89. |
| 27 | B8 #14 — config precondition | **Partial:** P2:126; B9-N1. |
| 28 | B8 #15 — umbrella batch-8 refresh | **Closed for that historical correction:** U:63,94; current projections are separate. |
| 29 | B8 #16 — second live-sentence copy | **Closed:** historical label, M:309. |
| 30 | B8 #17 — unguarded read residual | **Closed as disclosure:** P1:108. |
| 31 | B8 #18 — enlarged consuming-refusal population | **Closed as disclosure:** M:85. |
| 32 | B8 #19 — literal-fold residual | **Closed as disclosure:** P1:194. |
| 33 | B8 #20 — label live wording | **Closed:** P1:108. |
| 34 | B8 #21 — empty-needle citation | **Closed:** P1:108 cites `assemble.ts:269`. |
| 35 | B8 #22 — missing batch-7 generalist report | **Unrecoverable history:** acknowledged at M:244,252; the complete original report is still absent. |

**Total: 35 — 27 closed, 6 partial/defective, 1 required no change, 1 unrecoverable-history item.** The missing generalist’s original four-item report was not reconstructed or invented; the retained batch-8 enumeration supplies the 35-item accounting above.

#### §5 convergence diagnostic

| Recurring class | Reproducer | Bounded repair surface |
|---|---|---|
| Mapper contract/proof | Required forwarding violates its own scan; `[0,4)` clamps yet reaches database rejection. | T1 mapper signature, permitted forwarding, predicate domain and corresponding negative witnesses. |
| Key lifetime | Web port closes while worker shutdown is pending; upload still runs after cleanup failure. | P2 T4 process lifecycle and AC5’s cleanup-failure evidence. |
| Consumption accounting | Same refusal code arises before and after durable consumption. | Journey evidence/reconciliation and demonstration counter; no settlement-policy change implied. |
| Disposition propagation | w8b exists in AC3 but not Verification 7/AC12; claimed handoff row absent. | Existing disposition and governing task/AC lists. No additional artifact layer. |

The original seam and refusal wording improvements remain valid. Their stronger proof and propagation claims have not converged. **Stop here with the residuals recorded; batch 9 supplies no authorization for repair-driven reevaluation or batch 10.**

#### Evidence and limits

Read fully: AGENTS, CLAUDE, gate rules, plan-reviewer contract, using-the-pack skill, overlay/project context; service-quality master, both phases, brief and codebase review; all current specialists; retained batch-7 specialists and all batch-8 reports. Read relevant map descriptors, umbrella scope/translation/dependencies and Phase-0 final reconciliation.

Source inspection covered matcher/assembly, logging and refusal rendering, provenance bounds, settlement/consumption, worker shutdown, billing control rendering, generation scoring, bootstrap, Playwright configuration and the eight-file render population.

Actual commands were read-only:

- `Get-Content -LiteralPath … -Encoding UTF8` with bounded numbered selections.
- Targeted `rg -n` searches.
- `rg --files .claude/agents` and `.github/workflows`.

No product execution, mutation witnesses, writes, network operations, credential reads or environment-file reads occurred. Parent-supplied unchanged-hash/product-diff and successful `git diff --check` evidence is retained as parent-observed. Historical entry evidence remains **5,067 passed / 101 skipped; 23 Docker files NOT RUN**, not fresh acceptance.

Requested reviewer posture: `gpt-6-astra/max`, independent default fallback; resolved runtime unverified. Nested cross-model review was unavailable and not recursively invoked.

**Verdict: NOT READY. Batch 9’s four authorized evaluations are consumed; no further evaluation is authorized.**

*Ask `/go` to explain any finding in plain words — or to just fix them.*

### Orchestrator reconciliation — 2026-09-17

Four independent evaluations completed in batch 9, with actual dispatch requests `agent_type: default`, `model: gpt-6-astra`, `reasoning_effort: max`, `fork_turns: none`. The reports above preserve their verdicts; final workflow status is **Not yet / NOT READY, Grade D**. Report citations refer to the assessed file positions before final report insertion and status-only projection updates. No constructor self-review or optional unavailable cross-model check is counted as independent assurance.

All ten consolidated findings remain recorded, **0 repaired / 10 unresolved**: T9-1 mapper-scan conflict; T9-2 offset-domain gap; T9-3 worker shutdown; B9-C1 consumption evidence; T9-4 mapper handoff; C9-1/B9-C2 witness list; B9-C3 call floor; B9-C4 historical disposition claim; B9-N1 config ambiguity; G9-1 phase metadata. Each location and uncertainty is retained in the consolidated table. No semantic repairs are made after assessment: the recurring classes reached the §5 convergence stop, and batch 9 has exhausted the approved allowance. Status-only master projections record the verdict without claiming those findings closed. Implementation remains unstarted; Phase 0 remains Ready/A and Phase 3 remains parked. Next action is an owner decision on the bounded repair surfaces above; no batch 10 is assumed.

## Historical reports — batches 2–8

Written by the generalist `plan-reviewer` (batch 2, last slot, 2026-09-15) and recorded verbatim by the orchestrator. `plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full. Merged-context posture: session model with a "think hard" instruction; each specialist's configured `effort: max` was not applied (gate-rules §7 lean trade).

**Readiness: Not yet · Grade: D · The plan is unusually well-anchored to the code, but three specialist verdicts still stand at NEEDS CHANGES on unverified fixes, one Phase 1 task names an error class the page cannot import, and the Phase 2 CI job is missing the environment it needs to start.**

Reviewer: `plan-reviewer` (generalist, batch 2 last slot), session model, read-only. Date: 2026-09-15. Inputs: master plan, phase 1–2, codebase review, brief, audit register, `CLAUDE.md`, gate-rules §11, plus ~60 line-cites re-read in `respin/` at baseline `3273f36`.

## Counts

| | High | Medium | Low | Total |
|---|---|---|---|---|
| Generalist findings (this review) | 2 | 7 | 10 | 19 |
| Standing specialist CHANGE items (batch 2, unverified fixes) | — | 6 | — | 6 |

## Scope and standing state (carried into the verdict)

- Three specialists ran three batches each. **Batch 2 was the last permitted retry.** Its verdicts, rendered on the text *before* the batch-2 fixes: tenancy NEEDS CHANGES (3 CHANGE), billing NEEDS CHANGES (2 CHANGE), compliance NEEDS CHANGES (1 CHANGE). All six were applied to the plan text on 2026-09-15 (Plan Review Log, "Disposition of batch 2"). **Those fixes are unverified by any specialist; no specialist PASS exists for any path.** Under gate-rules §3 a batch 3 needs the owner's explicit go-ahead.
- The owner has parked all payment work. The Non-goals record Trends autopsy/Spin and Results logging as **unassessed**; this review does not treat that as a gap.
- Gate intensity `lean`; tenancy and billing keep separate reviewers; compliance is the merged run.

## Batch history

| Batch | Tenancy | Billing | Compliance | Generalist |
|---|---|---|---|---|
| 0 | BLOCK (2 BLOCK, 5 CHANGE, 4 NOTE) | NEEDS CHANGES (3 CHANGE, 5 NOTE) | NEEDS CHANGES (5 CHANGE, 6 NOTE) | not launched |
| 1 | NEEDS CHANGES (5 CHANGE, 5 NOTE) | interrupted, no verdict | NEEDS CHANGES (1 CHANGE, 7 NOTE) | not launched |
| 2 | NEEDS CHANGES (3 CHANGE, 6 NOTE) | NEEDS CHANGES (2 CHANGE, 6 NOTE) | NEEDS CHANGES (1 CHANGE, 5 NOTE) | **this report** (on the post-fix text) |

## Execution simulation (as `respin-engineer`, plan text only)

Verified while walking: all 16 `AssemblyError` throw sites at the cited lines (`assemble.ts:174,186,193,295-391`); `AssemblyError` at `:107-112`; `locateQuote` `:264-273`; `validateSourceEvidence` `:5737`; the refusal catch `actions.ts:321-331`; `logRefusal(prefix, err, context: LogContext)` with `LogContext = Readonly<Record<string, string|number>>` (`safe-log.ts:107,160-168`); `ProfileScope.mint` `:2735-2743`; `generationsNewest` `:2466-2476`; `brainAssetSummary` seam `:2780-2787` and facade `app-server.ts:598-602`, `index.ts:437`; `profile-cage.test.ts:1309-1310`; `tableOf` `:2263-2320`; the three page mocks; `isolation.test.ts:263,1030,1248`; `client-bundle-boundary.test.ts:41,205`; `import-boundary.test.ts:1027-1036`; steps 6/8b `inference.ts:677-711,869-884`; seed `:60,63,84`; `run-copy.ts:553,556-566,579-589,456-459`; `studio-ui.test.tsx:566-594,596-622,741,1184,1747,2787-2790`; `claims-vocabulary-agreement.test.ts:44,201-222`; `HARD_CLAIM_FIELD_PREFIXES` includes `/disclosure/` (`claims.ts:467-470`); `studio-panel.tsx` testids incl. `studio-selected-cost` `:282-284`; `studio-view.tsx:79-87`; `studio/page.tsx:131-140`; the only `run={null}` is the no-profile branch (`:84-91`); `trends/page.tsx:305-317,322-330`; `trends-page.test.tsx:43-49` enumerated mock; `trackedNicheEntitlement` returns `{ maxTrackedNiches }` and throws `UnknownEntitlementTierError` (`mode-access.ts:310-318`, code at `billing-errors.ts:701`); `landing-pricing.test.ts:52-59`; `nav.tsx:9-21`; `auth-form.tsx:47,121`; `results/page.tsx:166,173`; `first-ideas-panel.tsx:65-91`; `platform-admin.spec.ts:29,41-56,64,70`; `requireAdmin` → `notFound()` `server.ts:120`; `getAuth` exported `auth/index.ts:30`; no `requireEmailVerification`/`generateId` in `packages/auth/src`; `production.ts:309,340` pass `process.env`; `handoff.ts:9`; `playwright.config.ts:23`; `auth.ts:17,28`; `db-shortcut.ts:52-56,66-82`; `docker-compose.yml:11,20`; `stripe.ts:2-3`; `activateBrainSection` at `solo-creator.spec.ts:265`; `waitForGenerationOutcome` returns `timed_out`; `worker:start` is plain `tsx worker/main.ts`; vitest includes `tests/**/*.test.{ts,tsx}`; `.gitignore` covers `e2e/journeys/artifacts/` and `playwright-report/`; all four reviewer agents and `respin-engineer` exist in `.claude/agents/`.

**Phase 1**
- PASS T1 — executable. Every cited anchor holds; the re-export inventory direction, the `import type` rule, the DB-backed cross-package harness (`infer-voice.test.ts:23,29,107,131`) are all real. Two gaps, neither blocking: AC3's "log-shape test on the action" has no file named (P1-7); the generative test's alphabet is unstated (P1-3). One pre-mortem miss inside its copy edit (P1-2).
- **FAIL T3 / Failure Modes row** — the `unknown` allowlist names "the driver's `DrizzleQueryError`". `@respin/db` does not export it (`packages/db/src/index.ts:2`: app may import only `respinDb`, `WorkspaceAccessError`, `ProfileAccessError` and types), `app/**` cannot import `drizzle-orm`, and the class never sets `.name` (`safe-log.ts:89-96`: `err.name` is literally `"Error"`). An implementer cannot write the `instanceof` the task text describes from `onboarding/page.tsx`. Fix: export a predicate from `@respin/db` (`index.ts` is already in the Files table) and name it in T3, or drop the driver class and let it rethrow (then the row and AC5 change). Everything else in T3 executes: the composition over `generationsNewest`, the enumerated registration points, the `tableOf` note (verified correct), the foreign-axis rejection.
- PASS T2 — executable; `signUp` currently waits `**/studio` (`auth.ts:28`), nav ITEMS verified.
- PASS T4 — executable; section positions and testids exist.
- PASS T5 — executable; `activeKinds` from the three histories the page already reads.
- PASS T6 — executable; the batch-2 rewrite is internally consistent (see opinion table). Wording nit P1-8.
- PASS T7 — executable; the premise "no state renders the generate panel with a profile and `run === null`" **holds** (the sole `run={null}` is the `!profile` branch), so the fallback clause is moot. The `initialState` mechanism and string-span fold check are specified to the level of a test.
- PASS T8 — executable; facade signature, error class, the enumerated mock and the seed row all verified; the expected plan list derives as creator/pro/studio.

**Phase 2**
- PASS T1 — executable, but the settled-wait lint test AC2 relies on is produced by no task and listed in no file (P2-2).
- PASS T2 — executable; retry rule residual P2-8.
- **FAIL T3/T4 (mechanism)** — `MAIN_CHAPTER_SCREENSHOT` "exported from each spec" cannot be read by `scripts/scan-journey-notes.ts`: importing a Playwright spec outside the runner throws at the top-level `test()` call, and screenshots are numbered `NN-name.png` (`artifacts.ts:72`), so the presence check is a suffix match the plan never states (P2-3).
- **FAIL T4 (environment)** — the job starts `db:migrate`, `db:seed`, the identity script, `pnpm dev` and `worker:start` with no enumerated env. Required by code: `DATABASE_URL` (compose maps **5435**, not the gate job's 5432 service), `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` (`create-auth.ts:354-355`, `server.ts:69`), `ANTHROPIC_API_KEY` (`worker/main.ts:14`, `credits/app-server.ts:525`), `ADMIN_USER_IDS`. There is no `respin/.env.example` to copy from. Also no readiness wait before the first spec (P2-1, P2-6).
- PASS T5 — executable.

**§11 plan size:** Phase 1's table is 40 rows bundling **46 distinct files** (master says "≈ 32 files"). I could simulate every task faithfully at this size, so the second §11 signal does not fire; the first (>25 rows) does. The master records a *request* for the owner's acceptance, not an acceptance — §11 requires the record (P1-6).

## Pre-mortem (shipped, then failed in production)

| # | Likely cause | Receiving task / spec | Status |
|---|---|---|---|
| 1 | Run-2 refusal was a kind other than `quote_not_found`; tolerance is not the fix | T1 (i)(iii) record the kind first; Least-confident says so; Verification 3 is the diagnostic | Absorbed, honestly. The brief's "reproduce against the stored reply shape" is not possible (the reply is not retained) — the plan should say that outright. |
| 2 | Free creator refused with a kind, told to "try again", re-press refused before the vendor (50 > 25) | Failure Modes row states the money fact; `inference_unusable` copy at `billing-errors.ts:1170` still says "Your run was still made, so it counted; try again" and T1 only rewrites the "most often a quote…" guess | **No receiving task** for the copy's false remedy (P1-2). |
| 3 | Position map wrong around surrogate pairs / combining marks → evidence slice verbatim but pointing at the wrong span | AC2 generative test | Absorbed only if the alphabet includes them; unstated (P1-3). |
| 4 | Step header infers "done" | T3/AC5, states read not inferred | Absorbed. |
| 5 | Scoped-read failure on the step header takes the page down or renders "done" | T3 `unknown` allowlist | Absorbed in intent; not executable as written (P1-1). |
| 6 | Journeys fold the brain edit form; `activateBrainSection` ticks checkboxes inside a closed `<details>` | T4 opens the fold when nothing is in force; testids kept; Phase 2 verification 2 | Absorbed (first activation has no in-force version). |
| 7 | Nightly run passes on skips/refusals | T4 scan + AC5/AC6 planted violations | Absorbed. |
| 8 | CI red on cold `next dev` compile (> `navigationTimeout` 30 s), no product defect | — | **No receiving task** (P2-6). |
| 9 | Dev server/worker refuse to start in CI (missing `DATABASE_URL`/`BETTER_AUTH_*`) | T5 README "env" | **Not in the workflow task** (P2-1). |
| 10 | Nightly spend runs away | `schedule` disabled until ceiling; "job refuses to start above the ceiling" | The refusal mechanism has **no task and is unimplementable** from an ephemeral CI database (P2-4). |
| 11 | Admin password in a retained failure trace | T4 states the residual | Absorbed as residual; a cheaper full closure exists (P2-9). |
| 12 | Post-vendor `LlmError` (no kind) consumes the build; harness re-presses; balance gate refuses; note misleads | T2 retry rule | Money property holds (refused pre-vendor); note quality residual (P2-8). |
| 13 | `_handoff/` uploaded with credentials | T4 delete + scan on both trees + upload exclude | Absorbed. |
| 14 | Editor persona blocked because Profile A has no brain | T2 `buildVoiceBrain` for Profile A; AC1 | Absorbed. |

## Findings

| ID | Sev | Conf | Location | Finding | Fix |
|---|---|---|---|---|---|
| P1-1 | High | High | Phase 1 T3; Failure Modes row 2; AC5 | `DrizzleQueryError` is named in an `app/**` allowlist but is not exported by `@respin/db`, cannot be imported from `app/**`, and has `.name === "Error"` — the `instanceof` cannot be written. | Export `isDriverQueryError(err)` from `@respin/db` (name it in T3 and the `index.ts` row), or remove the class and let it rethrow; update the row and AC5 accordingly. |
| P2-1 | High | High | Phase 2 T4; technical checklist "one persistent secret" | CI env for migrate/seed/identity/dev/worker not enumerated: `DATABASE_URL` (port 5435), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`, `ADMIN_USER_IDS`. No `.env.example` exists. | List the env in T4 with sources; state `BETTER_AUTH_SECRET` is minted per run (ephemeral DB) so the one-persistent-secret claim stays true. |
| P1-2 | Med | High | Phase 1 T1 (iii); `billing-errors.ts:1170` | `inference_unusable` copy tells the creator "try again"; on Free the re-press is refused before the vendor. T1 rewrites only the "most often a quote" guess. DESIGN.md: refusals name the remedy; non-negotiable 6. | T1 rewrites the whole `detail`: no "try again"; the per-kind static sentence or the panel's price line is the remedy. Add to AC3. |
| P2-2 | Med | High | Phase 2 AC2; Files table | AC2's evidence is a "lint-style test over the spec sources" that no task writes and no file lists. | Add to T1 and the table (e.g. `respin/tests/journey-settled-waits.test.ts`), with the planted violation. |
| P2-3 | Med | Med | Phase 2 T3, T4 | Scan cannot `import` a spec to read `MAIN_CHAPTER_SCREENSHOT`; screenshot names are `NN-name.png`. | Move the per-persona map to `e2e/support/main-chapters.ts` (imported by specs and scan); state the suffix-glob rule. |
| P2-4 | Med | High | Master Derived Budgets, spend row | "the job refuses to start above the ceiling" has no task and cannot read cumulative spend from a DB created fresh per run. | Replace with an owner-side vendor spend limit; keep `/admin/model-spend` as per-run evidence only. |
| P2-5 | Med | High | Master Exit Demonstration vs Phase 2 T4/AC4 | Exit demo needs "two consecutive nightly runs"; `schedule` stays commented until the owner records a ceiling; no ledger row. | Exit demo = two consecutive `workflow_dispatch` runs; ledger row "enable `schedule`" → owner, with the README ceiling. |
| P2-6 | Med | Med | Phase 2 T4 | No readiness wait after `pnpm dev` (`next dev`, cold compile) before the first spec; `navigationTimeout` 30 s. | Add a readiness loop on `http://localhost:8000/` and a warm-up hit of `/sign-up`; state how background processes survive step boundaries. |
| P1-6 | Med | High | Master "Plan size"; Phase 1 Files note | 40 rows / 46 distinct files (master says ≈32). §11 signal fired; acceptance is requested, not recorded. | Correct the numbers; record the owner's acceptance (or split). |
| P1-3 | Low | Med | Phase 1 T1 (iv), AC2 | Generative alphabet unstated (surrogate pairs, combining marks, whitespace at quote edges, quote at index 0/end, `\n\n`); whether a quote may span a paragraph break is undecided. | State the alphabet and the paragraph rule. |
| P1-8 | Low | Med | Phase 1 T6 (ii); `run-copy.ts:563`; `studio-ui.test.tsx:581` | Dropping the clause leaves "a plain number, a name, where an ordinary word can land" — the test at `:581` pins the exact phrase and must be rewritten to a stated replacement. | Give the replacement sentence. |
| P1-7 | Low | Med | Phase 1 AC3 | "a log-shape test on the action" — file unnamed. | Name it. |
| P1-4 | Low | High | Phase 1 Files table | `page-wiring.test.tsx` row says T2, T7 but T3 also edits it; `first-ideas-result.tsx` is in T7 with no stated change. | Fix the notes. |
| P1-5 | Low | High | Master Requirement IDs; brief scope | "F-07–F-14" includes F-12 (billing page ergonomics), parked by Non-goals and claimed by no phase. | F-07–F-11, F-13, F-14. |
| P1-9 | Low | High | Master Dependencies | "No owner prerequisite except one secret" — T6 (viii) needs owner-approved decision text; Phase 2 verification 4 needs the owner to configure secrets and trigger. | List them. |
| P2-7 | Low | High | Phase 2 Files table; T4; Out of Scope | `e2e/support/stripe.ts` edited by T1 but absent from the table and named in Out of Scope; `scripts/e2e-admin-identity.ts` in the table but not in T4's File(s). | Reconcile. |
| P2-8 | Low | Med | Phase 2 T2 | Retry keyed on "no kind attribute" also matches post-vendor `LlmError`s that consumed the build (`inference.ts:806-807`); re-press is refused pre-vendor (no spend) but the note records a misleading second refusal. | Key the retry on the refusal code as well (banner `data-code`), or state the note wording. |
| P2-9 | Low | Med | Phase 2 T4 residual | Trace zip may carry the per-run admin password; `playwright test --trace off` for the admin spec (CLI, no config edit) or excluding `playwright-report/data/*.zip` closes it fully. | Offer it to the tenancy reviewer. |
| P2-10 | Low | Med | Master Derived Budgets | Recurring spend has no estimate; derivable now (≈7 vendor calls per run: solo 5, operator 1, editor 1). | Add estimate × 30 and the ceiling. |

## Mechanical consistency

- **Coverage parity** — PASS: 16 kinds ↔ 16 throw sites (verified); AC4 nav order ↔ `ITEMS` + Brain; AC10 testid sets ↔ `studio-panel.tsx`/`first-ideas-panel.tsx`; F-20 routes enumerated with `/for/*` from `AUDIENCES`; `hasGenerationForProfile` registration points enumerated (only `selected-profile-pages.test.tsx` imports the onboarding page directly; the other two mock lists are enumerated objects). FAIL: T3's `unknown` list names an unreachable class (P1-1).
- **Closure** — Phase 1: every task file is in the table and vice versa; two note mismatches (P1-4). Phase 2: `stripe.ts` missing from table; `e2e-admin-identity.ts` missing from T4; AC2's test absent everywhere (P2-2, P2-7). Owner agents: all exist. Evidence pointers: every AC has one; AC2 (Phase 2) points at a test nothing produces. Requirement IDs: F-12 mismatch (P1-5). Depends-on: Phase 2 → 1 only. Least-confident lines: both non-empty (probed below). Reachability lines: both name in-phase callers.
- **Deferral ledger** — three rows resolve to the parked plan + Non-goals. Missing: enabling `schedule` (P2-5).
- **Handoff contracts** — `AssemblyError.kind` + `data-assembly-kind`, testids, `signUp` wait, `hasGenerationForProfile` pinned in Phase 1 and cited by Phase 2. PASS.
- **Verifiability** — PASS/FAIL with evidence throughout; AC6 (Phase 2) depends on an owner action, stated.
- **Number provenance** — `minOwnPostsForVoice`, 50/25, wall times cited. Failing: file counts (P1-6), ceiling mechanism (P2-4), spend estimate (P2-10).
- **Invariant slugs** — 8 (Phase 1) + 2 (Phase 2), unique, each with a named test; new plan, no renames.
- **Paper dry-run of verification steps** — Phase 1 steps 1–7 runnable as written (step 3 honestly says three builds are impossible on Free). Phase 2 step 2 needs the env from P2-1 locally too (README T5 covers it); step 3 runnable; step 4 owner-gated.
- **Boil-the-lake** — Phase 1 covers every in-scope audit row; the one uncovered lake edge is the F-02 copy (P1-2).

## Least-confident probes

- **Phase 1** — "canonicalisation is what the run-2 reply failed on." Evidence: the log carried only `errorName: 'AssemblyError'`; 13 of the 16 kinds are unrelated to quote matching. The bet is genuinely open and the plan ships the diagnostic (kind) with the tolerance rather than before it. **Holds as an honest statement**; the plan should add that reproduction against the stored reply is impossible (not retained), and close P1-2 so the creator's dead end is not restated as "try again" whichever kind fires.
- **Phase 2** — "green on first `workflow_dispatch` without a runner surprise." Probe found two concrete surprises the line does not name: unenumerated env (P2-1) and cold-compile readiness (P2-6). **Fails as stated**; both are closable in text.

## Batch-2 fixes — generalist opinion (NOT a specialist verdict)

| Specialist CHANGE (batch 2) | Where fixed in current text | Opinion |
|---|---|---|
| Tenancy 1 — T3 text said the foreign axis returns `false` | T3 task text: "rejects `ProfileAccessError` … never swallowed into `false`"; AC6; w5 | Plausibly resolved; consistent across T3/AC6/w5 and with `mint` at `:2735-2743`. |
| Tenancy 2 — password scan could not read zipped traces | T4: no scan claimed; residual stated; per-run password; `::add-mask::` | Plausibly resolved by honest restatement; a full closure without touching config exists (P2-9) — the tenancy reviewer may prefer it. |
| Tenancy 3 — `unknown` population was a producer | Failure Modes row: explicit three-class list | Partially: it is now a list, but its third member cannot be tested from `app/**` (P1-1). Expect a further CHANGE unless fixed. |
| Billing 1 — `trends-page.test.tsx` mock not listed | T8: mock at `:43-49` named, three cases | Resolved; mock verified enumerated. |
| Billing 2 — harness retry counted a refused vendor call | Phase 2 T2: retry only on kind-less pre-vendor refusal; master spend row | Resolved in substance (max one vendor call per build); P2-8 is a note-quality residual, not money. |
| Compliance 1 — flag branch asked to both carry and not carry "disclosure"; text at `:556-566` misdescribed | T6 (vi): only the zero-count branch (`:553`) rescoped; flag/hard branches drop the clause only; AC9 | Resolved; verified against `run-copy.ts:551-567`; wording nit P1-8. |

## Ordered fix list

1. P1-1 — make T3's `unknown` allowlist executable from `app/**` (predicate export or drop the driver class).
2. P2-1 — enumerate the CI env in T4 (ports, auth secret/URL minted per run, vendor key, admin ids).
3. P1-2 — T1 rewrites the whole `inference_unusable` detail; no "try again" on a path the balance gate refuses.
4. P2-2 + P2-3 — name the settled-wait test and move `MAIN_CHAPTER_SCREENSHOT` into a support module the scan can import; state the suffix match.
5. P2-4 + P2-5 — drop the unimplementable ceiling refusal; restate the exit demonstration as two `workflow_dispatch` runs; add the `schedule` ledger row.
6. P2-6 — readiness wait before the first spec.
7. P1-6 — correct the size numbers and record the owner's §11 acceptance.
8. Low items P1-3, P1-4, P1-5, P1-7, P1-8, P1-9, P2-7, P2-8, P2-9, P2-10.
9. Then, with the owner's explicit go-ahead (gate-rules §3), a batch 3 for the three paths — the six batch-2 fixes are unverified and cannot be counted as PASS.

## Verdict

**NOT READY** — two tasks cannot be executed from the plan text as written (T3's unreachable error class; T4's missing environment), two pre-mortem causes have no receiving task (the "try again" copy; cold-start readiness), the exit demonstration is unreachable within the plan, and all three Critical-Path verdicts stand at NEEDS CHANGES on text the specialists have not re-read.

---

## Orchestrator addendum (2026-09-15, after the report)

The 19 generalist findings were applied to the plan text on the same day (see the master plan's Plan Review Log). One correction to the report's own text: `respin/env.example` exists (no leading dot); the env list finding stands regardless. Three findings were decisions, made conservatively: P1-1 → drop the driver class from the `unknown` allowlist (only the two scope errors render `unknown`; everything else rethrows); P2-4 → the nightly ceiling is an owner-side vendor spend limit, not a job-side refusal; P1-6 → the owner is asked to record acceptance of the Phase 1 size (46 files) or to split. **These post-report edits are unverified by any reviewer.** The gate's state is unchanged by them: NOT READY, retry budget exhausted, a specialist batch 3 (tenancy, billing, compliance) and a fresh generalist run need the owner's go-ahead.

---

# Batch 3 (owner-approved extension, 2026-09-15) — specialist reports

*Recorded verbatim by the orchestrator (only each tool's trailing "Ask /go…" footer omitted). Dispatch for all three: model inherit / no override requested (each agent's configured pin applies), read-only tools instructed (Read/Grep/Glob, no Bash); resolved model and effort not exposed. The tenancy reviewer disclosed one Bash call (`echo skip`) made against the instruction — it read and changed nothing. Fixed inputs: master plan, phase 1–2, codebase review, brief, audit register, and the batch-2 generalist report as revised by the post-report edits of 2026-09-15 plus the owner-decision record. `plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full.*

## Tenancy plan review — respin-service-quality — batch 3

**Readiness: Almost · Grade: C · Batch-2 fixes largely hold and nothing in the plan leaks, but eight fixable defects remain — a quote-location property that cannot catch a mis-mapped evidence slice, a journeys job that would run with the vendor key on every push/PR, and a scan order that makes the plan's own verification unpassable.**

Counts: 0 ❌ BLOCK · 8 ⚠️ CHANGE · 8 💡 NOTE.

Scope read: plan text for Phase 1 T1/T3 and Phase 2 T4. UGC (`src/`) and Cutdown untouched.

### Least-confident probes

- **Phase 1 (canonicalisation is the run-2 cause): unproven, correctly stated as such.** The audit register (`respin-journey-fixes-audit.md:25`) records only `errorName: 'AssemblyError'`, which has 13 reply-side sites (`assemble.ts:295-391`); tolerance only helps `quote_not_found`. One thing supports T1 regardless: today the code stores the model's own quote (`evidence: { inputId, quote: v.quote, ...at }`, `assemble.ts:383`) at offsets computed from the NFC-normalised needle (`:268-272`), so a quote that differs only by NFC already fails later as a `ProvenanceError` (`with-workspace.ts:5737`). Storing the original slice fixes that independently. Tenancy-wise the tolerance does not weaken provenance — provided C1 is fixed.
- **Phase 2 (green first run on hosted Docker, no `stripe listen`): partly holds on this path.** Env wiring verifies (5435 at `docker-compose.yml:20`; worker reads `process.env` at `worker/main.ts:10,14`, `worker/production.ts:309,340`; `requireAdmin` reads `ADMIN_USER_IDS` at request time and compares the Better Auth session id, `packages/auth/src/server.ts:43,119` — the minted id can match). Two defects stop a green run as planned: trigger placement (C2) and the delete/scan order (C3).

### Batch-2 CHANGE resolution

| # | Batch-2 CHANGE | Status | Evidence |
|---|---|---|---|
| i | T3 said the foreign axis returns `false` | **Closed** | T3, AC6, w5 now reject `ProfileAccessError`, matching `ProfileScope.mint` (`with-workspace.ts:2735-2743`) and precedent `profile-scope.test.ts:2248-2250`. (w5's P4 claim is overstated — C6.) |
| ii | password scan cannot read zipped traces | **Partly closed** | Scan claim removed and residual stated, but T4 still says excluding `data/*.zip` "closes that residual entirely" and "Secrets never reach an artifact", while calling the residual unscanned in the same paragraph; `playwright-report/index.html` (uploaded) may carry the same value (C4). |
| iii | `unknown` population was a producer | **Closed as a list** | Two named classes in `onboarding/page.tsx`; some expected refusals sit outside it and rethrow — safe, but unstated (N1). |

### Post-report edits on this path — verified against code

- **Allowlist reduced to the two scope errors: correct and executable.** `WorkspaceAccessError` is exported at `packages/db/src/index.ts:380` (the plan cites `:2`, which is a comment); `ProfileAccessError` is exported at `index.ts:484` and allowlisted for `app/**` at `eslint.config.mjs:214` (precedent import `app/api/export/route.ts:5`). So "confirm and add it" requires no edit — and names the wrong authority: importability from `app/**` is decided by eslint `allowImportNames`, not `index.ts` (N2).
- **Job environment enumeration: correct values.** `DATABASE_URL` 5435, `BETTER_AUTH_URL` (`create-auth.ts:355`), `ANTHROPIC_API_KEY` (`worker/main.ts:14`), `BETTER_AUTH_SECRET` per run, `ADMIN_USER_IDS` exported to `$GITHUB_ENV` before start — all verified. Placement in `respin.yml` is wrong (C2).
- **Report upload excluding `data/*.zip`: correct for trace zips, incomplete for the report** (C4).

### Findings

| Sev | Severity / confidence | Plan file · section | Evidence | Fix |
|---|---|---|---|---|
| ⚠️ CHANGE C1 | Medium / High | Phase 1 T1 (iv), AC2, w2 | The property `post.slice(start,end) === evidence.quote` + round-trip is **tautological once the stored quote is the slice**: a wrong position-table map-back (end one short, start drifted into adjacent text) still yields a quote "verbatim at its offsets", passes `validateSourceEvidence` (`with-workspace.ts:5737`) and both AC2 assertions — evidence the model never cited. The two-occurrence fixture has the same blind spot. | Add `canon(evidence.quote) === canon(modelQuote)` to the generative property and the cross-package case; add witness w2b (shift the mapped end by one → red). |
| ⚠️ CHANGE C2 | Medium / High | Phase 2 T4, AC4, stack "never on push or pull_request" | `.github/workflows/respin.yml:5-14` triggers on `push` and `pull_request`; triggers are workflow-level, not job-level. A `journeys` job added to this file runs on every push/same-repo PR with `ANTHROPIC_API_KEY` and real spend unless guarded, and AC4 ("triggers are exactly `workflow_dispatch`") is unsatisfiable in this file without removing the gate job's triggers. | Put the job in a new `.github/workflows/respin-journeys.yml` with `on: workflow_dispatch` (and `schedule` later); or a job-level `if: github.event_name == 'workflow_dispatch'` with AC4 rewritten to grep that guard. |
| ⚠️ CHANGE C3 | Medium / High | Phase 2 T4 step order; Verification 3; AC5 | The enumerated order is specs → scan → upload, and "delete `_handoff/`" is pinned only "before the upload step". `studio-operator.spec.ts:137` and the identity step both write `_handoff/` (`handoff.ts:9`), so a scan run before the delete exits 1 on a green run. Verification 3 ("scan on the run from 2 → exit 0") is unpassable locally for the same reason — an invitation to weaken the scan. | Pin: specs → delete `_handoff/` (`if: always()`) → scan → upload (`if: always()`, exclusions). Verification 3 deletes `_handoff/` first, then expects exit 0, plus a planted `_handoff/` case → exit 1. |
| ⚠️ CHANGE C4 | Low / Medium (~0.65) | Phase 2 T4 "Secrets never reach an artifact", "closes that residual entirely", "Stated residual" | Installed playwright-core 1.63.0 titles fill steps `Fill "{value}"` with `renderParams: ["value"]` (`node_modules/.pnpm-copy/playwright-core@1.63.0/.../lib/coreBundle.js:4139`); the HTML reporter stores step titles for all tests in `playwright-report/index.html` (base64 zip), uploaded and not excluded. `signIn` fills the per-run admin password (`e2e/support/auth.ts:37`). Impact nil (identity dies with the runner DB), but the recorded claim is false and self-contradictory. | Remove "closes entirely"/"never reach an artifact"; state one residual covering the whole `playwright-report` (index.html + `data/`), or upload `playwright-report` only on failure, or `--trace off` for the admin spec and state step titles. |
| ⚠️ CHANGE C5 | Low-Med / High | Phase 1 AC5, T3 tests | AC5's page-level assertions (called-with minted scope + profile id; listed class → `unknown`; `TypeError` rethrow) are assigned to `onboarding-ui.test.tsx`, which has zero `vi.mock` and never imports the page. The harness that imports `onboarding/page` with an enumerated `respinDb` mock is `tests/selected-profile-pages.test.tsx:23-58`. Unnamed, the wiring test risks becoming a source-string check with no executed code. | Point AC5's wiring/rethrow cases at `selected-profile-pages.test.tsx` (already in Files); keep view-state rendering in `onboarding-ui.test.tsx`. |
| ⚠️ CHANGE C6 | Low / High | Phase 1 Verification 7 (w5), AC6 | w5 says "catch `ProfileAccessError` inside the seam and return false → … and the P4 cross-parented case red". P4 (`profile-scope.test.ts:2253`) tests the row filter on a scope that minted successfully; catching mint errors cannot redden it. | Scope that mutation to the foreign-axis assertion; give P4 its own mutation (a seam bypassing `generationsNewest` with a profile-only filter). |
| ⚠️ CHANGE C7 | Low / High | Master plan Decisions (line 50, "admin identity is supplied from secrets"); Phase 2 functional checklist (line 40, "supplied from secrets"); codebase review line 113 | Contradicts T4's per-run minted identity; a static secret can never match (Better Auth mints the id — batch 1's finding). An implementer reading the checklist rebuilds the defect. | Rewrite all three to "minted per run by the identity step". |
| ⚠️ CHANGE C8 | Low / Medium | Phase 1 T3 (posts step from `content.onboarding.minOwnPostsForVoice`) | The page's config read is caught and swallowed (`onboarding/page.tsx:223-232`), so the minimum can be unavailable without a throw; the `unknown` rule is keyed only on thrown scope errors, so a null minimum becomes `next`/`done` — an inferred state against `step-state-derived-not-assumed`. | State: posts step `unknown` when the minimum (or the post read) is unavailable; add the case to AC5. |
| 💡 NOTE N1 | Low / High | Phase 1 Failure Modes row 2 | (a) The step reads can also throw plain `Error("lifecycle_refused:*")` (`membership-lifecycle.ts:44-46`) — via `getInterviewDraft`'s in-tx check (`interview-ops.ts:321`, `with-workspace.ts:3549`) and via `mint`'s `assertFreshWorkspaceAuthority` outside its catch (`with-workspace.ts:2744`); these rethrow to `error.tsx` — fail-closed and fine, unstated. (b) `mint` converts *any* error from its access check, driver errors included, into `ProfileAccessError` (`:2741-2743`), so "a database failure rethrows" is only true post-mint. | State both in the row so the list is complete. |
| 💡 NOTE N2 | Low / High | Phase 1 Failure Modes row 2 | `index.ts:2` is a comment whose "ONLY respinDb, WorkspaceAccessError" is stale; the export is `:380`; importability is `eslint.config.mjs:37,214`. | Cite those; drop "add it to index.ts". |
| 💡 NOTE N3 | Low / High | Phase 1 Handoff Contracts (registration points) | `page-wiring.test.tsx` and `first-login-pages.test.tsx` render Usage/Billing, not onboarding — adding the mock there is harmless but unnecessary; the real registration list is otherwise complete (seam, facade `app-server.ts:55` import + `:598`, `index.ts:437`, `profile-cage.test.ts:1309-1310`). | Optional. |
| 💡 NOTE N4 | Low / Med | Phase 2 T4 env | `$GITHUB_ENV` reaches only *subsequent* steps; `BETTER_AUTH_SECRET` must be minted in a step before the identity step, and it is not masked. | Pin the mint step; `::add-mask::` it. |
| 💡 NOTE N5 | Low / Med | Phase 2 T4 | On spec failure, later steps without `if: always()` are skipped; the upload's `_handoff/**` exclusion is the only guard that runs on every path. | Keep the exclusion; mark the delete step `if: always()`. |
| 💡 NOTE N6 | Low / Med | Phase 1 T1 (ii) | No minimum quote length (pre-existing); folding widens it slightly (a one-char `-` quote now matches any dash form). A quote empty after trimming must stay `quote_not_found` (`locateQuote`'s `needle.length === 0` rule, `assemble.ts:269`). | Add an empty-after-canonicalisation fixture; consider a minimum length as a separate decision. |
| 💡 NOTE N7 | Low / High | Phase 2 T5 README | Uploaded artifacts include full-page screenshots of synthetic personas' brain docs/generations and a console log (`artifacts.ts:53-77`); synthetic, but the brain-tenancy skill's PII rule (T6) asks content capture be stated. | One README sentence. |
| 💡 NOTE N8 | Info | Phase 1 T1 | Verified, no change: `parseVoiceReply` is not wrapped between `infer-voice.ts:236` and the action (`AssemblyError → inference_unusable`, `billing-errors.ts:611`), so `err instanceof AssemblyError` at `actions.ts:321-331` is reachable; the cross-package harness is real (`createTestDb` + `writeCapabilities`, `infer-voice.test.ts:22-31,131`). | — |

### Checks run

1 Single scoping helper — holds: the seam mints via `ProfileScope.mint` and composes the breach-tested `generationsNewest` (`with-workspace.ts:2466-2476`, `profile-scope.test.ts:1047,2296`); no raw table access. 2 Library stripping — n/a. 3 Append-only brains & provenance — stored evidence obeys the verbatim rule, but the property cannot detect a mis-mapped slice (C1); no brain mutation outside proposal/approval. 4 Sensitive inference — n/a. 5 Export & deletion — n/a (no new table). 6 Roles & admin boundary — allowlist can match the minted id (`server.ts:43,119`); CI trigger placement wrong (C2). 7 PII & secrets — vendor key on push/PR (C2); fill value in the report (C4); `BETTER_AUTH_SECRET` unmasked (N4); content capture unstated (N7). 8 Requirement provenance — "closes entirely" (C4), w5 P4 claim (C6), "supplied from secrets" (C7) are unbacked recorded claims.

Absences checked and not found: a scope minted from the wrong id, a missed mint registration point, the model's quote stored, the worker started before `ADMIN_USER_IDS` is exported, a driver error class imported into `app/**`.

**Verdict: NEEDS CHANGES** — no BLOCK and no leakage in the plan, but eight fixable defects on this path; C1 (tautological provenance property), C2 (journeys job inherits push/PR triggers with the vendor key) and C3 (delete/scan order makes a green run and Verification 3 fail) should be fixed first.

## Billing plan review — respin-service-quality — batch 3

**Readiness: Almost · Grade: C · T8's niche gate and the credits re-export are sound, but the harness retry keys on an attribute the product does not render, its "pre-vendor" list includes a post-vendor code, and the spend estimate counts presses, not vendor calls.**

Counts: 0 BLOCK · 8 CHANGE · 6 NOTE. No fix requires an allowance, price, ledger, metering, Stripe or rollout change; where a finding touches parked money work I say so.

Scope: plan text named in the brief (`docs/plans/respin-service-quality-master-plan.md` incl. Plan Review Log, `respin-service-quality-phase-1.md`, `-phase-2.md`, `docs/progress/respin-service-quality-plan-review.md`); codebase review and brief grepped for money terms; every money claim verified against `respin/` at HEAD `3273f36`. Read-only tools; no Bash.

### 1. Batch-2 CHANGE resolution

| Batch-2 CHANGE | Status | Evidence |
|---|---|---|
| (i) `tests/trends-page.test.tsx` enumerated `respinCredits` mock not listed | **RESOLVED** | T8 now names the mock `:43-49` (verified: enumerates only `settleParkedAutopsies`, `pastedReferenceQuote`), adds three cases, and has a Files row. Residual in N2. |
| (ii) harness retry counted a vendor call the Free balance gate refuses after an assembly refusal | **PARTIAL** | No-retry-on-kind is correct, and the money chain is verified: included build claimed at step 8b (`inference.ts:869-884`), rebuild 50 (`packages/db/src/seed.ts:60`) vs Free 25 (`:63`), step 6 refuses pre-vendor (`inference.ts:677-711`). The replacement rule has three new defects: C1 (attribute absent), C2 (a post-vendor producer), C3 (3 pre-vendor kinds). |

### 2. Money-touching post-report edits

- **Retry code list — producers enumerated:** `run_slot_busy` / `server_at_capacity` come only from `RunSlotBusyError` (`billing-errors.ts:1997-2000`), thrown at `inference.ts:740` — pre-vendor, pre-claim, pre-debit (`generate.ts:627` is not on the voice path). **Holds.** `workspace_paused` has three voice-path producers: `inference.ts:561-562` (step 4, pre-vendor); `with-workspace.ts:4075-4076` (`writeBrainDoc`, called by `inferVoice` at `infer-voice.ts:257-258` **after** `runInference` returns, i.e. after the 8b claim); `ledger.ts:413-414` (`debitCredits`, step 9 post-vendor, on a paid rebuild). **The "all pre-vendor" claim fails** (C2).
- **`stripe-unconfigured` keyless state:** `settings/billing/page.tsx:144` passes `isStripeConfigured()`; `billing-view.tsx:258-262` renders `stripe-unconfigured`. **Holds** — but the keyless state makes the editor-seat billing assertion vacuous (C6).
- **Spend call count vs four specs:** 7 generation presses per specs — but one generation is up to 3 vendor calls (C5).

### 3. New money defects introduced

- Facade widening: none — `trackedNicheEntitlementFor` exists (`credits/src/app-server.ts:642-650`), read-only (`state.ts:228-258`, `getActiveConfig`); T1's `app-server.ts` touch is re-export lines only (`AssemblyError` already at `:385`). **Holds.**
- Second `new Date()`: plan mandates one `at`, but no test can detect two instants (C4).
- Tier-name pinning: no — T8 tests are allowance-driven; the copy test may miss a dropped tier (C8).
- Double vendor call for one included build: not reachable on Free (every post-vendor re-press is priced 50 > 25 and refused at step 6); the remaining risk is unbuildability (C1) and wrong rationale (C2/C3).

### Findings

| # | Type | Sev | Conf | Plan file + section | Evidence (`respin/`) | Fix |
|---|---|---|---|---|---|---|
| C1 | CHANGE | Medium | High | phase-2 T2; phase-1 Handoff Contracts | The retry reads "the banner's `data-code`". The onboarding refusal banner has none: `run-outcome.tsx:45-52` renders only `data-testid="run-refusal"`. Phase 1 adds only `data-assembly-kind`; Phase 2 forbids product edits ("a testid the product lacks is a finding routed to Phase 1"). An implementer must reverse-map copy or fall back to "no kind attribute" — the batch-2 shape that re-presses after a post-vendor `LlmError`. | Phase 1 T1: add `data-code="<BillingErrorCode>"` to the `run-refusal` banner (id only, beside `data-assembly-kind`); list in Handoff Contracts; AC3 assert; Phase 2 consumes it. |
| C2 | CHANGE | Low-Med | High | phase-2 T2 ("pre-vendor … still the included build at 0 credits"); phase-2 Edge Cases | `workspace_paused` also comes from `writeBrainDoc` (`with-workspace.ts:4075-4076`) after `runInference`/8b claim (`infer-voice.ts:214-258`) and from `debitCredits` (`ledger.ts:413-414`). The list was built from one producer (non-negotiable 7). No money lost on Free (re-press refused at step 4/6), but the stated rationale is false. | Drop `workspace_paused` from the retry list (Free CI never pauses; pause chapter is gated off), or keep it and list all three producers with the post-vendor caveat. Name each code's producers in T2. |
| C3 | CHANGE | Medium | High | phase-1 T1 (iii) copy rewrite; Failure Modes row 1; phase-2 T2 no-retry rationale | 3 of 16 kinds are thrown by `assembleVoicePrompt` (`assemble.ts:174,186,193`), which runs at `infer-voice.ts:207`, **before** `runInference` at `:214`: no vendor call, no claim, re-press priced 0. The plan asserts every kind refusal follows the 8b claim and forbids naming a re-press; the shared `inference_unusable` copy today says "Your run was still made, so it counted" (`billing-errors.ts:1170`) — false for these three. | T1: partition kinds pre-vendor (no call, build not used) vs post-vendor (build used, Free re-press refused) in the per-kind sentences and the rewritten detail; pin the partition in AC3 with one pre- and one post-vendor fixture. T2: restate the no-retry rationale (still right — pre-vendor kinds are deterministic). |
| C4 | CHANGE | Low-Med | High | phase-1 T8 (shared `const at`) | T8's test uses `expect.any(Date)`, which stays green if the page makes two `new Date()` calls — exactly the two-instant defect the shared `at` exists to prevent (page comment `trends/page.tsx:322-330`). Lesson 2026-07-30: assert or delete the claim. | Add `expect(trackedNicheEntitlementFor.mock.calls[0][1]).toBe(pastedReferenceQuote.mock.calls[0][1])` (same object). |
| C5 | CHANGE | Medium | High | master Derived Budgets, spend row | "≈ 7 vendor calls" counts generation presses. Each generation calls the vendor for the draft (`modes/src/pipeline.ts:160`), one rewrite on a rejected draft (`:186`), and self-criteria scoring when that document is active (`pipeline.ts:318-319`, `generate.ts:934-935`) — solo activates it (`solo-creator.spec.ts:99`). Realistic: ~9–17 calls per run, before SDK `llm.maxRetries`. "Plus at most one retry after a pre-vendor refusal" adds a call that is not incremental (the refused attempt made none). The owner sizes the vendor limit from this. | Restate as presses × up to 3 calls per generation + 1 per voice build + SDK retries; give the range; drop "+1 retry". |
| C6 | CHANGE | Medium | High | phase-2 T1 (keyless Free billing) | With no Stripe key and an empty `stripePriceMap` (`seed.ts:74`), every subscribe/pack button is disabled for every role (`billing-view.tsx:226, 410-415, 442-451`), so `editor-seat.spec.ts:97-102` passes with the owner-only gate deleted. The REQ-A02/B6 check goes vacuous exactly when T1 moves CI keyless. | Assert the owner-only reason text is rendered in editor-seat (`billing-view.tsx:219-221` checks role first) and absent owner-side. |
| C7 | CHANGE | Low-Med | Med | phase-1 T1 (iii) "never a re-press the balance gate will refuse" | Other post-build codes also tell the creator to try again, which Free refuses: `brain_pointer_divergence` (`billing-errors.ts:1175`, thrown at `infer-voice.ts:253`, after `:214`), `llm_attempt_recorded` (`:1003`), `brain_content_schema` (`:1160`), `brain_content_walk` (`:1195`), `reference_echo` (`:1130`), onboarding `workspace_paused` override (`onboarding/copy.ts:232`). Rewriting one code but not its siblings breaks non-negotiable 7. (Only the first three are verified post-vendor on the voice path.) | Enumerate these in T1; either rewrite (copy-only) or add a Deferral Ledger row routing them to the parked plan as included-build copy. |
| C8 | CHANGE | Low | Med | phase-1 T8 copy test; AC11 | The `landing-pricing` precedent the plan cites, and the paste copy test, use substring `toContain` (`trends-ui.test.tsx:968`). If the seed drops `creator`, "Pro and Studio" is still a substring of "Creator, Pro and Studio" — a seed edit may not redden. | Assert the full sentence equals one built from the derived list; add a failing check against a seed clone with one tier set to 0. |
| N1 | NOTE | Low | High | phase-1 T8 "same tier at the same instant" | A shared `at` gives the same clock instant, not the same DB snapshot — `trackedNicheEntitlementFor` and `pastedReferenceQuote` each call `getWorkspaceBillingState` (`pasted-reference.ts:226` itself calls this "the two-read shape"). | Say "same clock instant". |
| N2 | NOTE | Low | High | phase-1 T8 mock | `beforeEach` (`trends-page.test.tsx:181-211`) needs a default `mockResolvedValue({ maxTrackedNiches: n > 0 })`, else every existing case renders against `undefined`. | Name the default. |
| N3 | NOTE | Low | High | phase-1 T8 Copy paragraph | "no facade or config read is added" reads as contradicting the facade call in the same task. | "no new facade method". |
| N4 | NOTE | Low | High | phase-1 T8; master Decisions | Seed-pinned copy can go false after an admin config edit without a deploy (B5). Stated, precedented (`paste-panel.tsx:76`); a live plan list would widen parked `packages/credits`; the blocking decision reads the live allowance; schema requires exactly the four tier keys (`config/src/schema.ts:132-140`). | Accepted residual; route to the parked plan. |
| N5 | NOTE | Low | Med | phase-1 Least confident; master Exit Demonstration | Probe: if the next real refusal is a post-vendor kind other than `quote_not_found`, the Free creator stays stuck (build consumed, rebuild 50 > 25), and the "voice build succeeding in both" exit runs may be unreachable without the parked re-ask. | State that outcome routes to the parked plan, not a retry here. |
| N6 | NOTE | Low | Med | master spend row; phase-2 Least confident | Probe: the vendor limit is required before `schedule`, not before the first two `workflow_dispatch` runs; I could not verify the Anthropic limit mechanism (per workspace vs per key). | Require the limit before the first dispatch; verify the mechanism when recording it (golden rule 9). |

### Checks run

1 (B1 append-only ledger): no ledger write in either phase; T8 read-only (`state.ts:228-258`) — holds. 2 (B2 Stripe idempotency): n/a, no webhook path; CI keyless. 3 (B3 debit-in-transaction): metering unchanged; T1 tolerance leaves the 8b claim and step-9 debit untouched (`inference.ts:869-973`) — holds. 4 (B4 expiry/pause): n/a except the pause code in the retry list (C2). 5 (B5 config-not-code): T8 blocks on the live allowance (`app-server.ts:647-649`); seed-pinned copy is a stated residual (N4); spend count wrong (C5). 6 (B6 tier gates / owner-only billing): Free allowance 0 (`seed.ts:84`) matches PRD §4G; `trackNicheAction` remains the gate (`trends/actions.ts:97-108`); owner-only billing assertion vacuous in keyless CI (C6). 7 (number provenance): 50/25/0 cited correctly; call count wrong (C5). 8 (money paths tested): T8 allowance-driven, rename-proof; shared `at` untested (C4); copy test may miss a dropped tier (C8); retry rule unimplementable (C1).

**Verdict: NEEDS CHANGES** — T8, the credits re-export and the no-retry-on-kind rule hold, but the retry reads an attribute nothing renders (C1), treats a post-vendor code as pre-vendor (C2), mislabels 3 pre-vendor kinds as post-vendor (C3), the shared-instant claim is untested (C4), the spend estimate undercounts vendor calls (C5), and keyless CI makes the owner-only billing check vacuous (C6). All eight CHANGEs are plan-text fixes that stay off the parked money path.

## Compliance plan review — respin-service-quality — batch 3 (lean merged run)

**Readiness: Almost · Grade: C · My batch-2 CHANGE is closed and the disclosure filter is sound, but six fixable text gaps remain — the worst is that the approved R-68 entry text, read literally, would license hiding concealment claims.**

Counts: 0 ❌ BLOCK · 6 ⚠️ CHANGE · 7 💡 NOTE.

Scope: plan text only, at HEAD `3273f36`; Phase 1 T5, T6, T7 and T1 (iii) refusal copy. `src/`, `cutdown/`, `docs/initial.past/` untouched.

### 1. Batch-2 CHANGE — closed

(ii) is now true against code: the flag branch `run-copy.ts:561-565` loses only "or something in the disclosure guidance"; the new sentence contains no "disclosure"; post-filter the flag bucket really is plain numbers and names (`plain-number`/`proper-noun` flag at `traceability.ts:267,274`; all `/disclosure/` flag at `:303-304`). (vi) touches only the zero-count sentence (`run-copy.ts:553`); the hard branch (`:556-560`) and flag branch make no universal claim, as the plan now says. `studio-ui.test.tsx:581` pins the exact old phrase and T6 rewrites it; `:567` asserts on the zero-count sentence and AC9 rewrites it; `:580` (`/\bnames? (was|were)\b/`) still passes against "a plain number or a name, where…". (ii), (vi) and AC9 agree.

### 2. Post-report edits on this path

- **Flag-heading sentence:** verified (§1).
- **`claims-vocabulary-agreement.test.ts:201-222`:** rewritten in place (imports `FLAG_ONLY_FIELD_PREFIXES` at `:44`, pins `["/disclosure/"]` at `:218-221`); the new `toEqual([DISCLOSURE_FIELD_PREFIX])` is the right relation — if `@respin/modes` adds a second flag-only prefix, the test reddens and forces a decision.
- **`inference_unusable` detail rewrite:** closes the "try again" in `billing-errors.ts:1170`; see C2 (per-kind sentences unscanned) and N2.
- **Fold check:** `vitest.config.ts:9` confirms `environment: "node"`; the string-span method over `renderToStaticMarkup` is the only viable one; ≥1-span, no-nested-`<details`, and w6 make it non-vacuous.

### 3. R-68 amendment — plan implementation

- **The filter cannot hide concealment:** it reads only `summary.traceability`; concealment lives in `summary.claims` (`generation-outcome.tsx:177-208`), hard on `/disclosure/` (`claims.ts:467-470`).
- **Stated residual is complete for what renders:** every `/disclosure/` shape loses offer, count and per-finding note; the stored `kill_test` and revision "unvouched" handling (`traceability.ts:114-132`) are unaffected; the revisit trigger is measurable because findings stay stored.
- **The entry's wording is not scoped to traceability** — C1.

### Findings

| # | Sev | Conf | Plan file + section | Evidence | Fix |
|---|---|---|---|---|---|
| **C1 ⚠️ CHANGE** | Medium | High | Phase 1 T6 (viii); master Plan Review Log owner decision (2) | Entry text: "`/disclosure/` findings are stored at flag level and **not listed**". R-69 (`decisions.md:884`, `claims.ts:467-470`) keeps `/disclosure/` concealment *claims* hard, and the plan's own `disclosure-claims-never-filtered` depends on them being listed (`generation-outcome.tsx:177`). As worded, the canon log reads as permission to filter claims too — a later "align code to decision" edit would hide concealment advice (S5). The master "Decisions baked in" bullet is correctly scoped; (viii) is not. | "`/disclosure/` **traceability** findings…" plus one clause: claim findings (concealment, hard since R-69) are unaffected and always listed. Tightens the approved text without reopening the decision. |
| **C2 ⚠️ CHANGE** | Medium-low | High | Phase 1 T1 (iii), AC3; *Least confident* | AC3 asserts only the shared detail has no "try again"; the 16 per-kind sentences have no such assertion, and the onboarding honesty scan (`onboarding-ui.test.tsx:1441-1451`) checks only the forbidden-claims canon. Probe: if the next real refusal is `not_json`/`bad_shape`/`fields_unfilled`/`list_max`, natural copy is "run it again" — refused pre-vendor on Free (50 > 25). | Extend AC3 to every `Record<AssemblyKind,string>` value: no re-press wording (e.g. `/try again\|run (it )?again\|press again\|rebuild/i`), proven with one planted sentence. |
| **C3 ⚠️ CHANGE** | Low | High | Phase 1 T6 (v) | Provenance sentence: "its **names and terms** are not listed here **as traced** to your brain". (a) The accepted residual is every shape — numbers and dates included ("within the first 3 seconds") — so the creator-facing limit is narrower than the decision. (b) The list under "Where the specifics came from" shows specifics **not** traced (`generation-outcome.tsx:114-151`); "not listed as traced" inverts it. | "…so its names, numbers and dates are not listed here." Keep the R-69 limit sentence. |
| **C4 ⚠️ CHANGE** | Low | High | Phase 1 T6 (vi) filter clause | The plan claims `prefix && enforcement === "flag"` makes a hard disclosure finding "surface rather than vanish", but no fixture witnesses it: deleting `&& flag` leaves AC9 and w3/w3b green (lesson 2026-08-26 no-witness shape). | AC9 fixture row `{enforcement:"hard", field:"/disclosure/guidance", token:"$4,000"}` asserted rendered; witness w3c: drop `&& flag` → red. |
| **C5 ⚠️ CHANGE** | Low | Medium | Phase 1 T7 test mechanism; w7 | Studio panel props are spread: `<StudioPanel {...run} />` (`studio-view.tsx:87`), `run` built in `studio/page.tsx`. The natural `initialState` leak is an object key, not a JSX attribute; a scanner matching `initialState=` and proven by a JSX-only plant misses it. A leaked `initialState` would render a draft that never passed the kill test (S3). | Scan for the identifier `initialState` anywhere under `app/**` except its two declaring panels; plant w7 in both shapes (JSX attribute and object key). |
| **C6 ⚠️ CHANGE** | Low | High | Phase 1 T6 (vii) | "The two stale comments" undercounts what becomes false: `generation-outcome.tsx:136-140` says the note "keys on `kind` and `field`" (false once (iii) removes the field branch); `run-copy.ts:538-547` says the heading's flag bucket "holds… disclosure dates" (false once counts are filtered). T1 also adds a type import to onboarding `run-copy.ts`, whose header (`:1`) says "NO imports at all". | Enumerate them in (vii), or make (vii) "every comment naming `/disclosure/`, `traceabilityFlagNote` inputs, or the import rule". |
| 💡 N1 | Low | High | T6 tests; harness facts | `:1184` is a projection-only test (`studioStateFor`, `:1167-1305`) — it renders nothing. The render-level `disclosure-claims-never-filtered` witness is `CONCEALMENT` (`:304-310`) rendered at `:821-835`, which already reddens under a claims filter. | Cite `:821-835` and keep it. |
| 💡 N2 | Low | Medium | T1 (iii) | 3 kinds are thrown before the vendor call (`assembleVoicePrompt` at `infer-voice.ts:207` precedes `runInference` at `:214`); for them the shared title "The model's answer could not be used" and any "your run counted" copy are false. Effectively unreachable (constant field list, DB-sourced post ids), but AC3 adds them to the scan. | Their per-kind sentence says nothing was sent to the model, or the shared detail makes no model-call claim. |
| 💡 N3 | Low | High | Failure Modes row 1 vs *Least confident* | Row 1 says "T1's tolerance is the whole remedy for the observed failure"; Least confident says it may not be. | "the only remedy this goal can ship". |
| 💡 N4 | Low | Medium | T5 | On a failed history read (`studio/page.tsx:141-149`) the in-force line would state "none in force" from a failed read. | Follow the nullable "could not be read" convention (`onboarding/run-copy.ts:49-51`). |
| 💡 N5 | Low | Medium | T5 / AC10 | T5 does not name whether `studio-in-force` renders in `StudioView` or `StudioPanel`; AC10 requires it in the whole-panel render — if it lands in the view, AC10 fails (loudly). | Name the file. |
| 💡 N6 | Low | Low | T6 (iii) | Removing the field branch leaves `traceabilityFlagNote`'s `field` parameter unused — may trip lint (unverified). | Decide: drop the parameter or keep it, and say why. |
| 💡 N7 | Low | High | T7 | The fold check detects `<details>` only, not `hidden`/`display:none`; "native `<details>` only" is plan policy, not enforced. | Optional: extend the span check. |

### Checks run

1 Sources · 2 Similarity gate · 3 Minimum difference · 8 Autopsy — n/a (no ingest/spin/autopsy code; Trends/Spin recorded unassessed). 4 Kill test honesty — holds: honest-refusal branch (`generation-outcome.tsx:473-525`) unchanged; `studio-no-stream`/`studio-status` outside the fold (AC10, w6). 5 No invented specifics — holds with C3/C4; creator-material offers kept (w3/w3b); residual owner-accepted. 6 No guarantees — holds: new sentences match no pattern in `tests/support/forbidden-claims.ts`; weakest point outside fold (AC10); C2 covers refusal remedies. 7 No automation / no concealment — holds with C1/C5: claims block never filtered; provenance sentence carries no concealment advice.

**Verdict: NEEDS CHANGES** — no BLOCK; six fixable plan-text gaps, of which C1 (the R-68 entry text must be scoped to traceability so it can never be read as licensing hidden concealment claims) matters most.

---

# Plan review — respin-service-quality — batch 3 generalist (final slot)

*Recorded verbatim by the orchestrator (the tool's trailing "Ask /go…" footer and file list omitted). Dispatch: `plan-reviewer`, model inherit / no override requested, "think hard", read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Inputs: the frozen plan text the three batch-3 specialists read, plus their reports above. None of the batch-3 findings has been applied.*

**Readiness: Not yet · Grade: D · The plan is anchored to the code and most batch-2 fixes hold, but Phase 2's admin-identity script cannot pass the project's own lint, Phase 2 consumes a page attribute Phase 1 never adds, one Phase 1 verification step is broken by Phase 1's own T8, and all three specialist verdicts stand at NEEDS CHANGES.**

`plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full. Reviewer context: session model, "think hard", read-only tools (Read/Grep/Glob, no Bash), HEAD `3273f36`. No commands run.

## Counts

| | High | Medium | Low | Info |
|---|---|---|---|---|
| Consolidated findings (after dedupe) | 1 | 16 | 15 | 19 |
| of which new in this review | 1 (G1) | 3 (G2, G3, G4) | 6 | 1 |

Severity normalisation: specialist "Low-Med"/"Medium-low" → Medium; tenancy C8 raised Low → Medium because it lets a named material invariant's check pass on an inferred state. No unrated CHANGE.

## Standing specialist verdicts (batch 3, recorded verbatim, not applied)

| Path | Verdict | Items |
|---|---|---|
| Brain tenancy (full) | NEEDS CHANGES | 0 BLOCK, 8 CHANGE, 8 NOTE |
| Billing & credits (full, scoped T8 + money claims) | NEEDS CHANGES | 0 BLOCK, 8 CHANGE, 6 NOTE |
| Spin compliance (lean merged run) | NEEDS CHANGES | 0 BLOCK, 6 CHANGE, 7 NOTE |

No path has a PASS; the retry budget ends with this slot.

## Batch-2 P-series resolution check (current text)

| ID | Status | Evidence / residual |
|---|---|---|
| P1-1 `unknown` allowlist | Resolved, one false sentence | Two scope errors listed, everything else rethrows; "a database failure rethrows" is only true post-mint — `mint` converts any error into `ProfileAccessError` (tenancy N1b, `with-workspace.ts:2741-2743`). |
| P2-1 CI env | Resolved with an ordering gap | Values verified; `$GITHUB_ENV` reaches only later steps and the secret is unmasked (tenancy N4). |
| P1-2 "try again" copy | Partly resolved | Shared detail rewritten; per-kind sentences unscanned (compliance C2); sibling codes still say try again (billing C7); 3 pre-vendor kinds described as post-claim (billing C3). |
| P2-2 settled-wait test | Resolved | `journey-settled-waits.test.ts` in T1 and Files. |
| P2-3 main-chapter map | Resolved | `e2e/support/main-chapters.ts`, suffix match (`artifacts.ts:72`). |
| P2-4 unimplementable ceiling | Resolved | Owner-side vendor limit; mechanism unverified (billing N6). |
| P2-5 exit demo vs `schedule` | Resolved | Exit demo on `workflow_dispatch`; ledger row. |
| P2-6 cold-compile readiness | Partly resolved | Warm-up GET `/studio` has no session — middleware redirects it; no product page compiles (G5). |
| P1-6 size numbers / acceptance | Resolved | 41 rows / ~46 files; owner acceptance recorded. |
| P1-3 generative alphabet | Resolved — **introduced a regression** | The new "may not span `\n\n`" rule refuses verbatim quotes the code accepts today (G3). |
| P1-8 replacement sentence | Resolved | Verified against `run-copy.ts:561-565`. |
| P1-7 log test file | Resolved in Files only | Missing from T1's File(s) column (G8). |
| P1-4 Files notes | Mostly resolved | T7 File(s) still lists `first-ideas-result.tsx`, which the Files table calls read-only (G8). |
| P1-5 F-12 | Resolved | Brief (line 7) still says F-07–F-14; shaping text, informational. |
| P1-9 owner prerequisites | Resolved | — |
| P2-7 stripe.ts / identity script closure | Resolved in text | The identity script itself is unbuildable as described (G1). |
| P2-8 retry keyed on code | Wording resolved, unbuildable | Banner has no `data-code` (billing C1); list includes a post-vendor producer (billing C2). |
| P2-9 trace zip residual | **Fix-induced regression** | "closes that residual entirely" is false; the value can also sit in `playwright-report/index.html` (tenancy C4). |
| P2-10 spend estimate | Added, undercounts | Counts presses, not vendor calls (billing C5). |

**Result:** 19 addressed in text; 11 fully resolved; 8 partly resolved or carrying a defect, 2 of them introduced by the fix itself (P1-3 → G3, P2-9 → tenancy C4).

## Execution simulation (as `respin-engineer`, plan text only)

Cross-checked in code this session: `.github/workflows/respin.yml:5-16`; `playwright.config.ts:13-28`; `package.json` scripts (dev `-p 8000`, `worker:start`, `lint: eslint .`); `worker/main.ts:10-14`; `packages/auth/src/server.ts:1-30`; `packages/auth/src/index.ts:1-36`; `create-auth.ts:341-355`; `eslint.config.mjs:584-608, 1017-1023, 1076-1078`; all four spec files; `e2e/support/{auth,artifacts,db-shortcut}.ts`; `docker-compose.yml:11,20,27-31`; `assemble.ts:107-112, 167-196, 264-273, 284-399`; `infer-voice.ts:202-258`; `onboarding/{run-outcome.tsx, run-state.ts, actions.ts:275-332, page.tsx:104-410, copy.ts:130-244}`; `billing-errors.ts:1157-1199`; `studio/{page.tsx:84-189, studio-panel.tsx:181-293, studio-view.tsx:64-91, run-copy.ts:530-594, generation-outcome.tsx:90-179}`; `brain-view.tsx` section structure; `nav.tsx:9-21`; `auth-form.tsx:47,121`; `seed.ts:45-94`; `billing-view.tsx:200-265`; `pipeline.ts:155-194`; `WorkspacePausedError` producers; `tests/onboarding-ui.test.tsx:1242-1270, 1379-1451`; `tests/selected-profile-pages.test.tsx` mocks and page import; `assemble.test.ts:145-213`. No `initialState` anywhere under `app/`; audience routes exist.

**Phase 1**
- **PASS\* T1** — executable, but builds three defects: a provenance property that proves nothing once the stored quote is the original slice (tenancy C1); an over-tolerant matcher no test would catch (G4); a paragraph-break rule that refuses quotes `assemble.ts:270` accepts today (G3). Does not add the `data-code` Phase 2 needs (billing C1).
- **PASS T2** — `auth.ts:28` and `nav.tsx` ITEMS verified.
- **PASS\* T3** — executable; the config read supplying the post minimum is swallowed (`page.tsx:223-232`), so a failed read renders the posts step as next/done instead of `unknown` (tenancy C8); AC5 wiring cases are assigned to a file with no mocks (tenancy C5; real harness `selected-profile-pages.test.tsx:23-57`).
- **PASS T4** — the confirm card (`brain-view.tsx:813-874`) is separate from Edit (`:507`) and history (`:664`), so the journeys' `activateBrainSection` still works. Low: the declared-metric editor (`:557`) is not addressed (L15).
- **PASS T5** — compliance N4/N5 are notes.
- **PASS\* T6** — compliance C1, C3, C4, C6.
- **PASS\* T7** — `<StudioPanel {...run} />` (`studio-view.tsx:87`) makes a leak an object key, not a JSX attribute (compliance C5).
- **PASS\* T8** — billing C4, C8. **It also breaks Verification 6** (below).
- **FAIL Verification 6** — T8 removes the niche form on Free, but `solo-creator.spec.ts:180` does `page.locator("#tracked-niche").fill(...)`, which times out at the 15 s action timeout and fails the spec; Phase 1's Out of Scope forbids editing the journey beyond the `signUp` wait (G2).
- PASS Verification 1–5, 7 as written.

**Phase 2**
- **PASS\* T1** — keyless CI makes editor-seat's owner-only billing check vacuous (billing C6, `billing-view.tsx:219-226`, `seed.ts:74`).
- **FAIL T2** — the retry reads the refusal banner's `data-code`; `run-outcome.tsx:45-52` renders only `data-testid="run-refusal"`, and Phase 2 forbids product edits (billing C1).
- **PASS T3**
- **FAIL T4**, three independent blockers: (a) **G1** — `respin/scripts/**` is linted with `appRestrictedImports({ operatorScriptSurface: true })` (`eslint.config.mjs:1076-1078`); its `@respin/auth` allowlist (`:584-608`) excludes `getAuth`/`createAuth`, and its message says those "stay package-only". So `scripts/e2e-admin-identity.ts` "signing up through the sanctioned server entry point" fails `pnpm lint`, which is in the entry gate. The Least-confident line's "a `respin/scripts/` file is outside `app/**`'s default-deny" is wrong: the default-deny covers everything except `packages/**` and `tests/**` (`:1018-1019`). (b) Workflow-level `push`/`pull_request` triggers (`respin.yml:5-14`) would also run the journeys job with the vendor key (tenancy C2). (c) The scan runs before `_handoff/` is deleted, and `studio-operator.spec.ts:137` writes to it, so a green run exits 1 (tenancy C3).
- **PASS T5**
- **FAIL Verification 3** — same `_handoff/` order (tenancy C3).

**Size (gate-rules §11):** Phase 1's 41 rows exceed the 25-row signal (owner-accepted); every task could still be simulated, so the second signal does not fire. No new size finding.

## Pre-mortem (shipped, then failed)

| # | Likely cause | Receiving task / spec | Status |
|---|---|---|---|
| 1 | Run-2 refusal was a non-quote kind; tolerance is not the fix | T1 (i)(iii) record kind; Least confident | Absorbed honestly |
| 2 | Tolerant matcher maps the evidence slice one character off | AC2 | **Not absorbed** — property is vacuous (tenancy C1) |
| 3 | Canonicaliser too broad (case, punctuation) accepts text the creator never wrote while provenance passes | AC2 paraphrase fixture only | **No receiving check** (G4) |
| 4 | Verbatim quote spanning a paragraph now refused — assembly fails *more* often | T1 (iv) rule | **Plan causes it** (G3) |
| 5 | Free creator with consumed build hits a post-vendor kind: stuck, no voice brain, no Studio | Failure Modes row 1; money parked | Partial — copy honest, but no ledger row for the dead end or for the exit demo's "voice build succeeds in both" (G9, billing N5) |
| 6 | Refusal copy tells a Free creator to re-press on sibling codes | T1 rewrites only `inference_unusable` | **No receiving task** (billing C7, compliance C2) |
| 7 | Step header shows posts done/next when the config read failed | T3 | **Gap** (tenancy C8) |
| 8 | Hidden concealment claims justified later by the R-68 entry wording | T6 (viii) | **Gap** (compliance C1) |
| 9 | Test-only `initialState` leaks via the `run` object spread and renders an unchecked draft | T7 w7 scanner | **Gap** (compliance C5) |
| 10 | Journeys job fires on every push/PR with real spend | T4 / AC4 | **Gap** (tenancy C2) |
| 11 | Green CI run fails the scan because `_handoff/` still exists | T4 order | **Gap** (tenancy C3) |
| 12 | Admin identity step cannot be built without breaking lint — or someone widens the auth boundary to make it pass | T4 | **No viable receiving task** (G1) |
| 13 | Harness retries after a post-vendor refusal, or cannot find the code at all | T2 | **Gap** (billing C1, C2) |
| 14 | Cold `next dev` compile of authenticated pages exceeds the 30 s navigation timeout | T4 warm-up | Partial (G5) |
| 15 | Postgres not yet healthy at `db:migrate` | T4 | Masked by install time; no explicit wait (G11) |
| 16 | Failure evidence lost because each spec invocation overwrites `playwright-report/` | T4 | **No receiving task** (G10) |
| 17 | Owner sizes the vendor limit from an undercount | Master spend row | **Gap** (billing C5) |
| 18 | Editor billing boundary silently unasserted in keyless CI | T1 | **Gap** (billing C6) |
| 19 | Editor persona blocked for lack of a brain | T2 `buildVoiceBrain`; AC1 | Absorbed |
| 20 | Nightly run passes on skips | T4 presence scan; AC5 | Absorbed (the editor-seat `test.skip` at `editor-seat.spec.ts:25` is also caught by presence) |
| 21 | Phase 1 merge breaks the solo journey | Verification 6 | **Plan causes it** (G2) |

## Consolidated findings

Abbreviations: T-Cn/T-Nn tenancy, B-Cn/B-Nn billing, C-Cn/C-Nn compliance, Gn this review. "Built" = changes what is built; "Records" = changes only how the plan reads.

| ID | Sev / conf | Source | Plan file + section | Finding | Fix | Built / records | Code cross-check |
|---|---|---|---|---|---|---|---|
| H1 | High / High | G1 | P2 T4, Files, Least confident | `scripts/e2e-admin-identity.ts` cannot import `getAuth`/`createAuth` — scripts lint allowlist omits them (`eslint.config.mjs:584-608, 1076-1078`) and `lint` is in the entry gate; `server.ts:6-7` also imports `next/headers` at module top. The "answered" Least-confident claim is false. | Drop the script. Start dev (no allowlist) → sign up via the existing UI bootstrap branch of `platform-admin.spec.ts:41-56` (UI sign-up + `lookupAuthUserId` via docker psql, handoff written) → export `ADMIN_USER_IDS` → kill dev → restart dev + start worker in a later step → readiness. Do **not** widen the auth lint allowlist. | Built | Confirmed |
| M1 | Medium / High | T-C1 | P1 T1 (iv), AC2, w2 | `post.slice === evidence.quote` is tautological once the quote *is* the slice; a one-char map-back error passes AC2 and `validateSourceEvidence`. | Add `canon(evidence.quote) === canon(modelQuote)` **and** "slice's first/last character is not whitespace unless the model quote's is"; w2b shifts end into a **non-whitespace** character. | Built | Confirmed by logic (`assemble.ts:264-273, 383`) |
| M2 | Medium / High | G4 | P1 T1 (iv), AC2, invariant `evidence-quote-still-required` | Only a one-word paraphrase guards the negative side. A canonicaliser that lowercases or strips punctuation passes AC2 and w1, and because the stored quote is the original slice, provenance passes too. The named check cannot fail on over-tolerance. | Pin the canonical map as a table-driven unit test (only the listed characters fold); add a generative negative property (canon-non-substring → `null`); witness w1b (case-fold inside canon → red). | Built | Confirmed (`assemble.ts:268-272`) |
| M3 | Medium / Med | G3 (from the P1-3 fix) | P1 T1 (iv), Edge Cases row 2 | "A quote may not span `\n\n` — `quote_not_found` by rule" refuses verbatim cross-paragraph quotes the exact `indexOf` accepts today (`assemble.ts:270`), and clashes with "whitespace runs → one space". Makes the failure T1 exists to fix more frequent. | Canonicalise `\n{2,}` to a paragraph token distinct from space: a verbatim quote across a break still locates; a quote with a space where the post has a break is `quote_not_found`. Generative draws include verbatim `\n\n` spans. | Built | Confirmed |
| M4 | Medium / High | T-C2 | P2 T4, AC4, Files | Triggers are workflow-level (`respin.yml:5-14`); a `journeys` job there runs on push/PR with the vendor key, and AC4 cannot pass in that file. | New `.github/workflows/respin-journeys.yml`, `on: workflow_dispatch`; AC4 greps that file; Files updated. | Built | Confirmed |
| M5 | Medium / High | T-C3 | P2 T4 steps, Verification 3, AC5 | Scan-before-delete fails a green run (`_handoff/` written by `studio-operator.spec.ts:137` and the identity step). | Order: specs → delete `_handoff/` (`if: always()`) → scan both trees → upload (`if: always()`, exclusions); Verification 3 deletes first; planted `_handoff/` → exit 1. | Built | Confirmed |
| M6 | Medium / High | B-C1 | P2 T2; P1 T1 (iii), Handoff Contracts, AC3 | `run-refusal` banner has no `data-code` (`run-outcome.tsx:45-52`); T2's retry key is unreadable. | P1 T1 adds `data-code="<BillingErrorCode>"` beside `data-assembly-kind`; pin in Handoff Contracts; AC3 asserts it. | Built | Confirmed |
| M7 | Medium / High | B-C3 + C-N2 | P1 T1 (iii), Failure Modes row 1; P2 T2 rationale | `no_fields_supplied`, `duplicate_post`, `duplicate_field_request` throw inside `assembleVoicePrompt` (`infer-voice.ts:207`) before `runInference` (`:214`): no vendor call, no claim. Copy and rationale assume every kind is post-claim. | Partition `ASSEMBLY_KINDS` pre/post-vendor; pre-vendor sentences say nothing was sent and nothing spent (and that it is ours to fix — deterministic); the shared detail makes no "run counted" claim; AC3 one fixture each. | Built | Confirmed (`assemble.ts:174,186,193`) |
| M8 | Medium / High | C-C1 | P1 T6 (viii); master decision (2) | Entry text "`/disclosure/` findings … not listed" reads as covering *claims* — licensing hidden concealment advice (R-69 keeps those hard). | "`/disclosure/` **traceability** findings…" + "claim findings (concealment, hard since R-69) are unaffected and always listed". Show the owner — it tightens approved text. | Built (canon decision log) | Confirmed (`generation-outcome.tsx:177`) |
| M9 | Medium / High | C-C2 + B-C7 | P1 T1 (iii), AC3 | Per-kind sentences unscanned for re-press wording; sibling voice-path codes still say try again (`brain_pointer_divergence` `billing-errors.ts:1175`, `brain_content_walk` `:1195`, `brain_content_schema` `:1160`, `reference_echo`). | AC3 regex over every per-kind sentence (`/try again\|run (it )?again\|press again/i`), proven with a planted sentence; for siblings, **onboarding-only overrides** in `ONBOARDING_OVERRIDES` (`onboarding/copy.ts:228`; add the file to Files) or a Deferral Ledger row — **not** rewriting the shared entries (see conflicts). | Built | Confirmed; codes are shared with `brain/*` |
| M10 | Medium / High | B-C5 | Master Derived Budgets | "≈7 vendor calls" counts presses; each generation up to 3 calls (draft `pipeline.ts:160`, rewrite `:186`, scoring); "+1 retry" is not incremental. | presses × up to 3 + 1 per voice build + SDK retries (≈9–17); drop "+1". | Records (sizes owner's limit) | Confirmed |
| M11 | Medium / High | B-C6 | P2 T1; editor-seat | Keyless CI + empty `stripePriceMap` disables every billing button for every role, so `editor-seat.spec.ts:97-102` passes with the owner gate deleted. | Editor-seat asserts the not-owner reason text (`billing-view.tsx:219-221`); owner run asserts it absent. | Built | Confirmed |
| M12 | Medium / High | G2 | P1 Verification 6, Out of Scope; T8 | After T8, `solo-creator.spec.ts:180` cannot fill the missing `#tracked-niche`; Verification 6 fails. | Either T8 adds a minimal branch in the solo spec (settle on `niche-disabled-tier`) and lists the file, or move Verification 6 to Phase 2 and say so. | Built | Confirmed (`track-niche-panel.tsx:37-40`) |
| M13 | Medium (↑ from Low) / Med | T-C8 | P1 T3, AC5, invariant `step-state-derived-not-assumed` | Config read giving `minOwnPostsForVoice` is swallowed (`page.tsx:223-232`); a null minimum renders next/done. | Posts step `unknown` when the minimum or the post read is unavailable; AC5 case. | Built | Confirmed |
| M14 | Medium (Low-Med) / High | T-C5 | P1 AC5, T3 tests | Page-level wiring/rethrow cases pointed at `onboarding-ui.test.tsx`, which has no `vi.mock`. | Point them at `selected-profile-pages.test.tsx:23-57` (already imports the page and mocks `readBrainHistory`/`getInterviewDraft`). | Built | Confirmed |
| M15 | Medium (Low-Med) / High | B-C2 | P2 T2, Edge Cases | `workspace_paused` also produced by `writeBrainDoc` (`with-workspace.ts:4076`, post-claim) and `debitCredits` (`ledger.ts:414`). | Drop `workspace_paused` from the retry list; name each remaining code's producer. | Built | Confirmed |
| M16 | Medium (Low-Med) / High | B-C4 | P1 T8 tests | `expect.any(Date)` cannot catch two `new Date()` calls. | Assert same Date object across both calls. | Built | Logic sound (not code-checked) |
| L1 | Low / Med | T-C4 | P2 T4 "closes entirely", "never reach an artifact" | Fill values can appear in `playwright-report/index.html`; self-contradictory text. | With H1's fix the admin uses the repo's constant throwaway password (`auth.ts:17`) — no secret; delete the absolute claims, state one residual. | Records | Not verified (Playwright internals) |
| L2 | Low / High | T-C6 | P1 Verification 7 w5 | Catching mint errors cannot redden P4. | Split: foreign-axis mutation vs a separate P4 mutation. | Built (tests) | Logic |
| L3 | Low / High | T-C7 + G6 | Master :30 and :50; P2 checklist :40; codebase review :113 | "supplied from secrets" contradicts the per-run minted identity. | "minted per run" in all four. | Records | Confirmed |
| L4 | Low / Med | B-C8 | P1 T8, AC11 | Substring check can miss a dropped tier. | Exact-sentence equality built independently from the seed; a seed clone with one tier at 0 → red. | Built (tests) | Logic |
| L5 | Low / High | C-C3 | P1 T6 (v) | "names and terms … not listed here as traced" is narrower than the accepted residual and inverts what the list shows. | "…so its names, numbers and dates are not listed here." | Built (copy) | Confirmed (`generation-outcome.tsx:114-151`) |
| L6 | Low / High | C-C4 | P1 T6 (vi), AC9 | `&& flag` unwitnessed (a hard disclosure finding cannot arise today, `traceability.ts:297,303`). | Synthetic hard `/disclosure/guidance` row asserted rendered; w3c. | Built (tests) | Confirmed |
| L7 | Low / Med | C-C5 | P1 T7, w7 | `initialState` scanner misses object-key/spread leaks. | Identifier-wide scan under `app/**` except the two panels; plant both shapes (no existing `initialState` in `app/`, so no false positives). | Built (tests) | Confirmed |
| L8 | Low / High | C-C6 | P1 T6 (vii) | More stale comments: `generation-outcome.tsx:136-140`, `run-copy.ts:538-547`, onboarding `run-copy.ts:1` "NO imports". | Enumerate. | Built (comments) | Confirmed |
| L9 | Low / Med | G5 | P2 T4 warm-up | Unauthenticated GET `/studio` is middleware-redirected; compiles no product page. | Warm up with the identity's session cookie, or state the cold-compile residual and the re-dispatch rule. | Built | Confirmed (`server.ts:1-3`) |
| L10 | Low / Med | G10 | P2 T4 | Four `playwright test` runs overwrite one `playwright-report/`. | Per-spec `PLAYWRIGHT_HTML_OUTPUT_DIR`; upload all. | Built | Inferred from config |
| L11 | Low / Med | G11 | P2 T4 | No health wait before `db:migrate`. | `docker compose … up -d --wait` (healthcheck at `docker-compose.yml:27-31`). | Built | Confirmed |
| L12 | Low / Med | G9 + B-N5 | Master Exit Demo; ledger | No rule for a demo run whose voice build fails on a model reply; the Free dead end has no ledger row. | State the re-dispatch rule; ledger row routing the stuck-Free-creator case to the parked plan. | Records | — |
| L13 | Low / High | G7 | P1 "## Depends on: none" | Contradicts the header's creator-ready Phase 0 dependency. | Fix the line. | Records | — |
| L14 | Low / High | G8 | P1 T1/T7 File(s) columns | Closure mismatches (`onboarding-refusal-log.test.ts`, `first-ideas-result.tsx`). | Reconcile. | Records | — |
| L15 | Low / Med | G15 | P1 T4 | Declared-metric editor (`brain-view.tsx:557`) not addressed by the fold rule. | State whether it folds. | Built | Confirmed |
| Info | — | T-N1–N8, B-N1–N4/N6, C-N1, C-N3–N7 | various | Carried as recorded; adopt in the same edits T-N4 (mint+mask `BETTER_AUTH_SECRET` in an earlier step), T-N6 (empty-after-canon fixture), B-N2 (`beforeEach` default mock), C-N1 (cite `studio-ui.test.tsx:821-835` as the render witness). | — | mixed | — |

## Conflicts and fix-induced risks

1. **Billing C7's "rewrite siblings" would introduce a defect.** `brain_content_schema`, `brain_content_walk`, `reference_echo`, `brain_pointer_divergence` are shared with `app/(product)/brain/{actions,copy,edit-state}.ts`, where re-submitting is free and "try again" is honest. Rewriting the shared `billing-errors.ts` entries would falsify brain-surface copy. Endorsed route: `ONBOARDING_OVERRIDES` (`onboarding/copy.ts:228`) or a ledger row.
2. **Compliance C2 vs billing C3.** A blanket no-re-press regex is compatible with billing C3 only if pre-vendor sentences also do not invite a re-press — and they should not, since those failures are deterministic (a re-press repeats them). Resolve by pre-vendor sentences saying "nothing was sent, nothing spent, this is ours". Keep price words out of kind sentences so the regex (drop `rebuild`) does not false-positive on the price line.
3. **Tenancy C1's fix is not sufficient against a mis-map.** `canon()` trims, so a slice whose start/end drifts into adjacent whitespace keeps `canon(slice) === canon(model)`, and w2b "shift end by one" stays green whenever the next character is a space. Add the boundary-character assertion and aim the witness at a non-whitespace character (M1).
4. **The batch-2 P2-9 fix produced tenancy C4** — the earlier generalist's "closes fully" suggestion was wrong. H1's fix (UI bootstrap with the constant throwaway password) makes the password non-secret and reduces C4 to wording.
5. **The batch-2 P1-3 fix produced G3** (paragraph rule).
6. **Tenancy C2 options:** a job-level `if:` still spawns a workflow run per push and keeps AC4 grep-fragile; a separate workflow file is cleaner and leaves the gate job's triggers undisturbed.
7. **Tenancy C3 order:** once deletion always runs first, the scan's `_handoff/` check only guards a failed delete — acceptable, but AC5 must keep its planted case so the check is not dead code.
8. **H1 reverses batch-1's "password generated per run"** by using the specs' own UI sign-up; the identity dies with the ephemeral DB and the password is already a committed constant (`auth.ts:17`) — the tenancy reviewer must re-evaluate this, not self-certified here.
9. No specialist pair conflicts on a Medium+ fix beyond 1–2; all billing fixes stay off the parked money path.

## Least-confident probes

- **Phase 1 — "canonicalisation is what run 2 failed on": plausible, not proven, stated honestly.** Supporting: the solo posts contain straight apostrophes ("Today's", "didn't", `solo-creator.spec.ts:40-41`); run 1 succeeded and run 2 failed on identical posts (audit F-02), which fits a nondeterministic curly apostrophe hitting `quote_not_found` at `assemble.ts:372-379`. An NFC-only mismatch would surface later as `ProvenanceError`, not `AssemblyError` (`assemble.ts:383`), so it is not the observed failure. Caveat: G3 could make the fix net-negative for multi-paragraph posts, and M2 leaves over-tolerance unguarded. **Holds as a bet; the implementation text needs M1–M3.**
- **Phase 2 — "green first `workflow_dispatch` with compose Postgres and no `stripe listen`": fails as stated.** Four concrete blockers the line does not name: H1 (lint), M4 (triggers), M5 (scan order), M6 (retry key); secondary: L9 (warm-up compiles nothing authenticated), L11 (no health wait). Docker on the hosted runner, `container_name: respin-postgres` and port 5435 check out.

## Mechanical consistency (summary)

Handoff contracts: FAIL — `data-code` consumed by Phase 2 T2, pinned nowhere (M6). Closure: L13, L14; Files needs `onboarding/copy.ts` if M9 takes the override route; owner agents all exist. Deferral ledger: missing rows for the stuck Free creator / exit-demo rule (L12) and sibling copy if not overridden (M9). Number provenance: spend row wrong (M10). Verifiability: P1 Verification 6 unpassable (M12); P2 Verification 3 unpassable (M5); AC4 unsatisfiable in `respin.yml` (M4). Invariant slugs: 10, unique, no renames; checks that can pass while the invariant fails: `evidence-quote-still-required` (M2), `step-state-derived-not-assumed` (M13), `journeys-manual-or-nightly-only` (M4), `signup-lands-on-onboarding` via Verification 6 (M12). Reachability: both lines name in-phase callers.

## Smallest closing edit sequence

| # | Edit | Closes | Built? | Needs independent evaluation (§9 row 4) |
|---|---|---|---|---|
| E1 | P1 T1 (ii)/(iv)/AC2/Verification 7: explicit canonical map with paragraph token; canon-equality + boundary assertion; negative generative property; w1b, w2b (non-whitespace); empty-after-canon fixture | M1, M2, M3, T-N6 | Yes | **Tenancy** |
| E2 | P1 T1 (iii)/Handoff/AC3/Files: `data-code` on `run-refusal`; pre/post-vendor kind partition and sentences; re-press regex over every kind sentence with a plant; onboarding-only overrides for sibling codes (add `onboarding/copy.ts`) or a ledger row | M6, M7, M9 | Yes | **Billing + compliance** |
| E3 | P1 T3/AC5/Failure Modes: posts step `unknown` on null minimum; wiring cases in `selected-profile-pages.test.tsx`; mint/driver-error sentence corrected (T-N1, N2) | M13, M14 | Yes | **Tenancy** |
| E4 | P1 T6/T7: scope (viii) to traceability — **owner sees the text**; provenance sentence wording; hard-disclosure witness w3c; enumerate stale comments; identifier-wide `initialState` scan with two plants | M8, L5–L8 | Yes | **Compliance** |
| E5 | P1 T8 tests: same-Date assertion; exact seed-derived sentence + seed clone; `beforeEach` default | M16, L4, B-N2 | Yes (missing assertions are not cosmetic, §4) | **Billing** |
| E6 | P1 T8 + Verification 6: niche branch in the solo spec, or move the step to Phase 2 | M12 | Yes | Generalist |
| E7 | P2 T4/AC4/AC5/Verification 3/Files/Least confident: `respin-journeys.yml`; UI-bootstrap admin identity + dev restart (delete the script row); step order delete → scan → upload with `if: always()`; mint+mask the auth secret in an earlier step; `up -d --wait`; per-spec report dirs; warm-up residual; remove absolute secret claims | H1, M4, M5, L1, L9–L11, T-N4 | Yes | **Tenancy + generalist** |
| E8 | P2 T2/T1: drop `workspace_paused`, name each producer; editor-seat asserts the not-owner reason | M15, M11 | Yes | **Billing** |
| E9 | Text only: "minted per run" ×4; spend-row restatement + vendor limit before the first dispatch (B-N6); exit-demo re-dispatch rule and ledger row; P1 Depends-on; column closure; w5 split wording | M10, L2 (text part), L3, L12–L15 | No (L15 is a one-line decision) | None — fix, batch, log |

**Why Phase 1 cannot start now:** E1–E8 all change what will be built, so each owes its reviewer under §9 row 4 before its phase starts; the allowance — including this owner-approved batch 3 — is consumed, so that re-evaluation needs a new explicit owner approval (§3), and the accepted size risk does not grant it (§11). Phase 1 also still depends on creator-ready Phase 0, itself NOT READY.

**Smallest set that unblocks only Phase 1:** E1+E3 (tenancy), E2+E5 (billing), E2+E4 (compliance), E6 (generalist). E7–E8 must be re-evaluated before Phase 2 starts; splitting that way is the owner's call — the gate as recorded is one plan gate.

## Verdict

**NOT READY.** Ordered fix list: E7 (H1 first) → E2 (M6, M7, M9) → E1 (M1–M3) → E4 (M8 first) → E3 → E8 → E5 → E6 → E9, then an owner-approved re-evaluation (tenancy, billing, compliance, generalist) scoped to E1–E8.

---

# Batch 4 (second owner-approved extension, 2026-09-15) — specialist reports

*Recorded verbatim by the orchestrator (trailing "Ask /go…" footers and file lists omitted). Dispatch for all three: model inherit / no override requested (agent pins apply), read-only tools (Read/Grep/Glob, no Bash; none reported a Bash call); resolved model and effort not exposed. Fixed inputs: the plan as revised by the batch-3 disposition (E1–E9) on 2026-09-15.*

## Tenancy plan review — respin-service-quality — batch 4

**Readiness: Almost · Grade: C · Most batch-3 fixes hold and the owner's admin bootstrap opens no tenancy or secret hole, but seven fixable defects remain — a new boundary assertion no witness can redden, provenance properties that pass vacuously if the tests reuse the implementation's canonicaliser, and a restart race in the bootstrap.**

Counts: 0 ❌ BLOCK · 7 ⚠️ CHANGE · 9 💡 NOTE.

Scope: plan text only; read in full the master plan (incl. Plan Review Log and batch-3 disposition), Phase 1, Phase 2, and the batch-3 section of `docs/progress/respin-service-quality-plan-review.md` (tenancy report + generalist table and conflicts); grepped the codebase review and brief for the admin/"minted per run" wording. UGC (`src/`) and Cutdown untouched. Read/Grep/Glob only — no Bash.

### Least-confident probes

- **Phase 1 (canonicalisation is the run-2 cause): still unproven, honestly stated.** The tolerance does not weaken provenance: `validateSourceEvidence` checks only schema, owner, reference-post input, offset bounds and `slice === quote` (`packages/db/src/with-workspace.ts:5685-5741`), and the schema puts no length/whitespace limit on `quote` (`:2923-2929`), so an original-slice store always passes. The remaining risk is test detection of a wrong map-back or an over-tolerant canonicaliser (CHANGE 1–3).
- **Phase 2 (two-start bootstrap, compose Postgres, unauthenticated warm-up): mostly holds.** `pnpm dev` is `next dev -p 8000` (`package.json:25`); compose container `respin-postgres`, user/db `respin` (`docker-compose.yml:11,22-24`) match `lookupAuthUserId`'s `docker exec … psql -U respin -d respin` (`e2e/support/db-shortcut.ts:64-86`); `requireAdmin` reads `ADMIN_USER_IDS` per request and fails closed (`packages/auth/src/server.ts:117-121`, `allowlist.ts:4-24`). Gap: the bootstrap server's stop has no port-release wait (CHANGE 5); the warm-up residual is stated, but step 5 itself runs cold with 30 s waits (`playwright.config.ts:27`, `e2e/support/auth.ts:28`).

### Batch-3 C1–C8 resolution

| # | Batch-3 CHANGE | Status | Evidence |
|---|---|---|---|
| C1 | tautological quote-location property | **Partly closed** | P1 T1 (iv)/AC2 now carry `canon(evidence.quote) === canon(modelQuote)` and a boundary-character assertion — but the boundary assertion has no witness and w2b misstates what reddens (CHANGE 1); `canon`'s independence from the implementation is unpinned (CHANGE 2). |
| C2 | journeys job inherits push/PR | **Closed** | New `.github/workflows/respin-journeys.yml`, `workflow_dispatch`; `respin.yml` untouched (workflow-level triggers, `respin.yml:5-14`). AC4 proof is weak (CHANGE 6). |
| C3 | delete/scan order | **Closed** | P2 T4 steps (8)→(9)→(10), all `if: always()`; Verification 3 deletes `_handoff/` first; AC5 keeps the planted `_handoff/` case. |
| C4 | password in report / "closes entirely" | **Closed** | Absolute claim removed; residual now covers `index.html` and traces, all carrying the `auth.ts:17` constant. The per-persona directories make the `data/*.zip` exclusion glob ambiguous (NOTE 1). |
| C5 | AC5 wiring in the wrong harness | **Closed** | `tests/selected-profile-pages.test.tsx` imports `onboarding/page` (`:56-58`) with an enumerated `respinDb` mock (`:23-38`) and a `getActiveConfigServer` mock (`:51-54`) — it can drive a listed-class rejection, a `TypeError` rethrow and a called-with assertion. |
| C6 | w5 cannot redden P4 | **Closed** | Split into w5a/w5b/w5c; w5c needs a P4-style case for the new seam function, and a cross-parented `generations` fixture already exists (`profile-scope.test.ts:1847-1857`). |
| C7 | "supplied from secrets" | **Closed** | Master `:30,:50,:55`, P2 checklist `:40`, codebase review `:113` now say minted/generated per run. |
| C8 | posts step inferred on null minimum | **Closed in intent, partly in text** | T3/AC5 say `unknown` on a null minimum; "unknown when the post read fails" contradicts the page's existing whole-page refusal, and an `undefined` minimum is not covered (CHANGE 4). |

### E1 / E3 / E7 against code

**E1** (canonical map, P1 T1 (ii)/(iv), Edge Cases row 2, AC2, w1b/w2b). *`validateSourceEvidence` keeps passing:* yes — stored quote is `content.slice(start, end)`, so `:5737` holds by construction for any in-bounds offsets. *Still refuses what it should:* paraphrase, case change and a space-for-paragraph-break are refused if the map is implemented as pinned; an empty-after-canon quote is refused (matches `locateQuote`'s existing empty-needle rule, `assemble.ts:269`); the existing decomposed-quote test (`packages/llm/tests/assemble.test.ts:165-170`) still guards quote-side NFC. *One-char mis-map (generalist conflict 3):* into **non-whitespace** (`"Hello"` → `"Hello w"`) — canon-equality reddens, the boundary assertion does **not** (both last chars `w`/`o` non-whitespace); into **whitespace** (`"Hello"` → `"Hello "`) — canon-equality stays green (`canon` trims), only the boundary assertion reddens. Together they cover both directions, but w2b claims "canon-equality **and boundary** red" (false), and no witness exercises the whitespace direction — the boundary assertion is an unwitnessed control (CHANGE 1). *Paragraph token:* consistent on both sides for `\n\n+`; unpinned: whether trim removes an edge token, rule order for mixed runs (` \n \n`, `\t\n\n`), and non-ASCII whitespace JS `\s`/`trim()` fold (CHANGE 3).

**E3** (P1 T3, AC5, Failure Modes row 2). Listed classes and cites correct: `WorkspaceAccessError` export `packages/db/src/index.ts:380`, `ProfileAccessError` `:484`, both allowed for `app/**` (`eslint.config.mjs:37,214`). Mint/lifecycle nuance accurate: the access check's `.catch` converts any error to `ProfileAccessError` (`with-workspace.ts:2736-2743`); `assertFreshWorkspaceAuthority` runs outside it (`:2744`). Seam composition sound: `generationsNewest` filters `both(generations)` (`:2466-2476`); precedent `brainAssetSummary` (`:2780-2787`). Swallowed config read at `page.tsx:223-232` as cited. Gap: `listOnboardingInputs` failure already returns a whole-page `AccessRefusal` (`page.tsx:265-268`), so the header cannot show `unknown` for a post-read failure unless T3 rewrites a catch it does not list (CHANGE 4).

**E7** (P2 T4). *Bootstrap branch runs and exits 0:* with no handoff it signs up, looks up the id, writes the handoff, screenshots and calls `test.skip` (`platform-admin.spec.ts:41-56`); Playwright counts a skipped test as not failed, so exit 0 is expected (high confidence, not executed). A missing handoff afterwards makes "read `authUserId` from the handoff" fail and stop the job. *Interference with the later persona run:* none — `journeyArtifacts` deletes the persona's screenshots and rewrites its `console.log` at module load (`e2e/support/artifacts.ts:31-39`), so step 7 wipes the bootstrap evidence; the handoff (`handoff.ts:9`) is exactly what step 7 needs. *Rate limits:* Better Auth's limiter is on in dev with database storage (`create-auth.ts:374-393`); 4 sign-ups per run (bootstrap, solo, operator, editor) vs 10/hour, 2 sign-ins vs 5/min — fits. *`lookupAuthUserId` in CI:* works (host `docker exec respin-postgres`; the email shape `e2e.admin.<digits>-<digits>@example.test` passes `EMAIL_PATTERN`, `db-shortcut.ts:17`). *`ADMIN_USER_IDS` in both step-6 processes:* yes (`$GITHUB_ENV` written in step 5 applies from step 6). *`BETTER_AUTH_SECRET` identical across starts:* yes via `$GITHUB_ENV` from step 4 — and immaterial: no bootstrap session is reused (step 7 signs in fresh) and password hashes do not depend on the secret. *Restart:* stop "by its recorded PID" with no port-release wait (CHANGE 5).

### Admin bootstrap re-evaluation (owner direction: UI sign-up, committed throwaway password)

**No tenancy, secret or admin-boundary hole in CI.** The identity lives only in the runner's throwaway compose database; `ADMIN_USER_IDS` exists only in that job's environment; the server binds only on the runner (no inbound). Knowing `correct horse battery staple 9` (`auth.ts:17`) grants nothing on any persistent system. The allowlist admits exactly one id and fails closed on empty/unset (`allowlist.ts:14-24`); a stale/wrong id yields `notFound()` → loud failure at the `heading "Admin"` assertion (`platform-admin.spec.ts:70`), never a skip. The auth boundary is not widened — no script imports `getAuth`/`createAuth`; the scripts lint surface is unchanged (`eslint.config.mjs:1076-1080`). Versus batch 1's generated password: it protected nothing that outlives the runner; the reversal removes a secret-handling duty (mask, scan) rather than adding risk. Residuals: an id written to `$GITHUB_ENV` without a shape check (NOTE 2); `workflow_dispatch` runs any branch's code with the vendor key (NOTE 3); locally, the same known-password identity is allowlisted against a persistent dev DB, and the README "admin identity contract" should say that is local-only (NOTE 4).

### Findings

| Sev | Severity / confidence | Plan file · section | Evidence | Fix |
|---|---|---|---|---|
| ⚠️ CHANGE 1 | Medium / High | P1 T1 (iv); Verification 7 w2b; AC12 | The boundary-character assertion exists to catch drift into whitespace, which `canon`'s trim hides from canon-equality (generalist conflict 3). w2b shifts into a **non-whitespace** character, where the boundary assertion passes (`w`/`o` both non-whitespace), so its "boundary assertions red" claim is false, and no mutation shifts into whitespace — the boundary assertion is never shown to fail (lesson 2026-08-26). | Reword w2b to "canon-equality red"; add **w2c** shift the end offset one char into whitespace and **w2d** shift the start one char back into whitespace — each must redden only the boundary assertion; list both in AC12. |
| ⚠️ CHANGE 2 | Medium / Medium-High | P1 T1 (iv); AC2; w1b; cross-package case | The plan never says where the tests' `canon` comes from. If they import the implementation's canonicaliser, the canon-equality property and the negative property ("canon non-substring → `quote_not_found`") both apply the defective function to both sides and pass — e.g. w1b (case-fold inside `canon`) leaves the negative property green, so w1b's "negative property red" holds only if `canon` is an independent test-side implementation. Only the table-driven test is independent (it calls `locateQuote` directly). | Pin that `canon` in `assemble-kinds.test.ts` and `voice-build-tolerance.test.ts` is a **test-side reference built from the Edge Cases row 2 table**, never imported from `assemble.ts`/`@respin/llm`; make the negative generator mutate a located substring by one char (case flip, punctuation drop, a non-folding Unicode quote such as `«` or `„`, an ellipsis). |
| ⚠️ CHANGE 3 | Low / Medium | P1 Edge Cases row 2; T1 (ii)/(iv) alphabet | "The pinned map and nothing else" is unenforceable as written: JS `\s` and `String.prototype.trim` also match U+00A0, U+2028/2029, U+3000, U+FEFF, and the generative alphabet contains none, so an implementation using `/\s+/` or `.trim()` silently folds more than the map. Also unpinned: whether trim removes an edge paragraph token (a `"\n\n"`-only quote locates today via `indexOf`, `assemble.ts:270`), and rule order for mixed runs (` \n \n`, `\t\n\n`; "surrounding spaces" excludes tabs). | Add those code points to the alphabet as must-not-fold (or decide they fold and list them); forbid `\s`/`.trim()` in the canonicaliser and spell the class; state rule order and whether an edge token is trimmed (recommend yes, so a whitespace-only quote is `quote_not_found`); NFC-normalise generated posts as `normaliseContent` does. |
| ⚠️ CHANGE 4 | Low / Medium | P1 T3; AC5; Failure Modes row 2 | (a) "`unknown` when … the post read fails": `listOnboardingInputs` failure already returns a whole-page `AccessRefusal` (`app/(product)/onboarding/page.tsx:265-268`), so the header never renders — implementing the sentence needs a second read or rewriting a sibling catch T3 does not list. (b) The existing config mock has no `minOwnPostsForVoice` (`tests/selected-profile-pages.test.tsx:137-143`); `n >= undefined` is `false`, so the step renders "next" — an assumed state — while AC5's rejected-config case stays green. | State: the posts step reuses `fetched` (no second read); a post-read failure keeps today's `AccessRefusal` (AC5 asserts that); treat any non-finite minimum as unavailable → `unknown`; add the missing-field case beside the rejected-config case. |
| ⚠️ CHANGE 5 | Low-Med / Medium (~0.55) | P2 T4 steps (5)–(6); Edge Cases row 1 | Step 5 stops `pnpm dev` "by its recorded PID" and step 6 immediately starts `next dev -p 8000` (`package.json:25`); nothing waits for exit or port release. Step 6's readiness curl can get 200 from the dying bootstrap server (no `ADMIN_USER_IDS`) while the new server exits on EADDRINUSE — loud, not open, but an intermittent green in the plan's own least-confident step. Step 5 also has no warm-up, yet the sign-up → `/onboarding` compile runs under 30 s waits (`auth.ts:28`, `playwright.config.ts:27`), and the re-dispatch rule covers only step 7 specs. | After the kill, loop until `curl localhost:8000` refuses (or kill the process group) before step 6; in step 6 confirm the new PIDs alive after readiness; warm `/sign-up` in step 5; extend the one-re-dispatch rule to a step-5 timeout. |
| ⚠️ CHANGE 6 | Low-Med / High | P2 AC4; technical invariant `journeys-manual-or-nightly-only`; Risk coverage | The invariant's only evidence is a one-off "grep transcript over both files" — not a repeatable test, no planted violation — so a later edit adding `push`, `pull_request_target` (fork PR code with repo secrets) or `workflow_run` to `respin-journeys.yml`, or a Playwright/`ANTHROPIC_API_KEY` job to `respin.yml` under another name, is never caught; a grep for `workflow_dispatch` cannot fail on the added-trigger case. | A vitest (e.g. `respin/tests/journeys-workflow-triggers.test.ts`) reading both files: the `on:` keys of `respin-journeys.yml` ⊆ {`workflow_dispatch`, `schedule`}; `respin.yml` contains neither `ANTHROPIC_API_KEY` nor `playwright`; proven with planted `pull_request_target` and `push` fixtures; list in Files and AC4. |
| ⚠️ CHANGE 7 | Low / Medium | P2 T4 "Job environment, enumerated" | `ANTHROPIC_API_KEY` is listed as job-level env, so it is present during `pnpm install` (dependency lifecycle scripts), `playwright install --with-deps`, the bootstrap step and third-party actions, none of which need it; the worker reads it at startup (`worker/main.ts:14`), and only step 6's processes need it. | Scope the key to step 6 via step-level `env:` (backgrounded processes inherit it); say so in T4 and the README. |
| 💡 NOTE 1 | Low / Medium | P2 T4 step (10); AC5 | Per-persona `PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/<persona>` moves traces to `playwright-report/<persona>/data/*.zip`; a pattern written `!playwright-report/data/*.zip` excludes nothing, and AC5's "workflow grep" for `data/*.zip` would still pass. Nothing secret is lost (constant passwords, runner-only session tokens), but the AC becomes vacuous. | Pin `!playwright-report/*/data/*.zip` and match that exact line in AC5; name the bootstrap report directory and keep it inside the uploaded tree so a step-5 failure has a report. |
| 💡 NOTE 2 | Low / Medium | P2 T4 step (5) | `authUserId` from the handoff JSON goes straight into `$GITHUB_ENV`; a newline would inject variables, and a jq `null` becomes the literal `"null"` (fails closed, confusingly). | Validate `^[A-Za-z0-9_-]+$` before writing; fail the step otherwise. |
| 💡 NOTE 3 | Low / Medium | P2 T4; master Dependencies | Anyone with write access can dispatch on an unreviewed branch whose specs/scripts run with the vendor key. | A protected GitHub `environment:` for the key, or `if: github.ref == 'refs/heads/main'`; or state the accepted risk in the README. |
| 💡 NOTE 4 | Low / Medium (~0.6) | P2 T5 README "admin identity contract" | Locally the same known-password identity is allowlisted via `.env.local` against the persistent `respin-pgdata` volume (`docker-compose.yml:25-26`); `next dev` binds all interfaces by default (recalled from Next.js docs, not verified here), so on a shared network `/admin/config` and `/admin/model-spend` are one sign-in away. Pre-existing, but the README now presents it as the contract. | One README sentence: the journey admin id goes only into a local or ephemeral environment, never a shared/deployed `ADMIN_USER_IDS`; remove it from `.env.local` after a local run. |
| 💡 NOTE 5 | Low / Medium | P1 T1 (ii) | Canonical-first matching changes which occurrence is cited — and the stored bytes — for quotes that match exactly today when a post holds two occurrences differing only typographically (e.g. `It's` and `It’s`). Provenance stays true, but byte-identical behaviour for today's accepted quotes is the smaller change. | Exact `indexOf` (after NFC/CRLF) first; canonical only on a miss; say so in the two-occurrence fixture. |
| 💡 NOTE 6 | Info / High | P1 T3 ("a mock missing the method") | `selected-profile-pages.test.tsx:27-28` spreads `...actual.respinDb`, so a missing mock calls the real facade (`getServerDb` → `assertScoped`'s `ScopeForgeryError`, `with-workspace.ts:574-583`), not a `TypeError` — still a loud rethrow. | Make the rethrow witness an explicit mock rejecting `TypeError`. |
| 💡 NOTE 7 | Info / Medium | P2 T3 / `main-chapters.ts` | The presence scan's suffix match `*-<name>.png` would accept the bootstrap's `01-admin-bootstrap-identity-created.png` if the admin main-chapter name were a suffix of it and step 7's admin run never loaded. | Pick a name that is not a suffix of any bootstrap screenshot name; add that case to `scan-journey-notes.test.ts`. |
| 💡 NOTE 8 | Info / High | Codebase review `:113` | "the persona run's bootstrap skip is unreachable" is a structural claim no test proves; what actually catches it is the presence scan (AC5). | "caught by the main-chapter presence scan". |
| 💡 NOTE 9 | Info / High | Master plan `:5` Status | Still says batch-3 "findings not applied", contradicting the disposition at `:125` (for the generalist). | Refresh the status line. |

### Checks run

1 Single scoping helper — holds: `hasGenerationForProfile` mints via `ProfileScope.mint` and composes breach-tested `generationsNewest` (`with-workspace.ts:2466-2476`, `:2729-2758`); registration points enumerated; no raw table access from `app/**`. 2 Mechanism-level stripping — n/a. 3 Append-only brains & provenance — stored quote is the creator's own slice; `validateSourceEvidence` untouched (`:5737`); test strength gaps CHANGE 1–3; no brain mutation outside proposal/approval. 4 Sensitive inference — n/a. 5 Export & deletion — n/a (no new table). 6 Roles & admin boundary — holds: allowlist read per request, fail-closed (`server.ts:117-121`); bootstrap cannot widen it and admits exactly one ephemeral id; restart race CHANGE 5. 7 PII & secrets — `BETTER_AUTH_SECRET` masked before `$GITHUB_ENV`; `_handoff/` deleted, scanned and excluded; remaining: vendor key job scope (CHANGE 7), exclusion glob (NOTE 1), env injection (NOTE 2), dispatch from any branch (NOTE 3), local allowlist (NOTE 4). 8 Requirement provenance — w2b "boundary red" (CHANGE 1), w1b "negative property red" (CHANGE 2), "nothing else" (CHANGE 3), "unreachable" (NOTE 8) are recorded claims no test backs yet.

Negative examples vs named checks: `evidence-quote-still-required` — table test can fail on paraphrase/case; negative property and w2b only once CHANGE 1–2 land. `generation-read-profile-scoped` — w5a/b/c each failable. `step-state-derived-not-assumed` — failable on rejected config, not yet on a missing field (CHANGE 4). `journeys-manual-or-nightly-only` — cannot fail on an added `pull_request_target` (CHANGE 6). Planted `_handoff/` → exit 1 — failable.

Absences hunted and not found: the model's quote stored anywhere; a scope minted from an untrusted id; a driver error class imported into `app/**`; worker/dev server started before `ADMIN_USER_IDS` is exported; the auth lint surface widened; a persistent credential in any uploaded tree; an interfering skipped bootstrap run.

Commands run: none (no Bash, as instructed). Nothing was executed — Playwright's exit code on a skipped test, pnpm's signal forwarding and `next dev`'s default bind address are reasoned, not observed.

**Verdict: NEEDS CHANGES** — no BLOCK, no leakage, and the owner's admin-bootstrap direction holds on tenancy and secrets; seven fixable defects on this path, with CHANGE 1–2 first, because without them the round's new provenance properties can pass while the map-back or canonicaliser is wrong.

## Billing plan review — respin-service-quality — batch 4

**Readiness: Almost · Grade: C · Five of eight batch-3 CHANGEs are closed and the harness retry is now sound, but E2's copy rule misclassifies a build-consuming code, drops the only "your run counted" disclosure, rests on a Free premise that becomes false when packs open, and rewrites a copy table two onboarding banners share.**

Counts: 0 BLOCK · 6 CHANGE · 8 NOTE. No fix needs an allowance, price, ledger, metering, Stripe or rollout change; the one policy question (a stuck Free creator) is already routed to the parked plan.

Scope: E2, E5, E8 and M10 in the master plan, `respin-service-quality-phase-1.md` and `-phase-2.md`, plus my batch-3 report and the generalist's conflicts in `docs/progress/respin-service-quality-plan-review.md`. Every citation checked against `respin/` at HEAD `3273f36` with Read, Grep and Glob only; no Bash.

### 1. Batch-3 CHANGE resolution

| # | Status | Evidence |
|---|---|---|
| C1 `data-code` absent | **RESOLVED** | T1 (iii), Handoff Contracts and AC3 add it; `Banner` spreads extra props (`app/ui/banner.tsx:7-17`), so the attribute renders. |
| C2 `workspace_paused` in retry list | **RESOLVED** | Dropped in Phase 2 T2 with producers named (`inference.ts:562`, `writeBrainDoc` `with-workspace.ts:4076`, `ledger.ts:414`). |
| C3 pre/post-vendor partition | **RESOLVED (partition only)** | The three pre-vendor kinds are at `assemble.ts:174,186,193`, called at `infer-voice.ts:207`, before `:214`. The post-vendor copy's money half is open (F2). |
| C4 two instants undetectable | **RESOLVED** | A `toBe` on the same `Date` object reddens a second `new Date()`; the called-with assertion prevents a vacuous pass when neither method is called. |
| C5 spend row counted presses | **RESOLVED** | Lines verified: draft `pipeline.ts:160`, rewrite `:186`, scoring `:318-319`; "+1 retry" removed. Lower bound loose (N5). |
| C6 owner-only check vacuous keyless | **PARTIAL** | Assertion added, but the sentence renders at least 5 times, so a bare text locator fails Playwright strict mode (F6). |
| C7 sibling codes say try again | **PARTIAL** | The population is now a list and the override route is chosen, but the claim anchor, the shared table and the money claims are wrong (F1, F3, F4, F5). |
| C8 copy substring can miss a dropped tier | **RESOLVED** | Whole-sentence equality against the seed plus a seed clone. |

Batch-3 NOTEs N1, N2, N3, N5, N6 applied; N4 (seed-pinned copy) remains an accepted residual (N7 below).

### 2. E2 / E5 / E8 / M10 against code

**`PRE_CLAIM_CODES` definable from the text?** Mostly, but not safely. All 37 entries of `ONBOARDING_ERROR_CODES` (`copy.ts:128-221`) walked:
- **`llm_attempt_recorded` — wrong under the plan's anchor.** Thrown at step 7 (before step 8b at `:857`), but the included build is already claimed at **step 8a**: `inference.ts:806-807` and `:831-846` call `recordUsage` with `consumesIncludedBuild`, and `with-workspace.ts:4048-4060` inserts the claim row. The plan's rule would exempt a code that consumed the build (F1).
- `llm_truncated` pre-claim (`consumesIncludedBuild=false`, `llm/src/errors.ts:251-256`); `llm_unavailable` pre-claim (non-billable).
- `topup_in_flight`, `insufficient_credits`, `uncharged_attempt_cap` pre-claim (`inference.ts:655-709`); the debit's own insufficient-credits error is rethrown as `debit_refused_after_call` (`:966-967`).
- `run_slot_busy`, `server_at_capacity` pre-claim (`:740`); `not_enough_posts` pre-claim (`assemble.ts:179`).
- `unknown` mixed: any unmapped post-claim throw lands there, including three codes missing from the list — `brain_content_schema`, `brain_claim_walk`, `brain_schema_shape` (fallback `run-outcome.tsx:38`).
- `onboarding_input_limit`, `post_content` and the profile codes have no voice-build producer — vacuously classified (N1).
- `brain_document_limit`, `provenance`, `reference_echo`, `brain_content_walk`, `segmenter_unavailable`, `brain_pointer_divergence` are post-claim; of these only `reference_echo`, `brain_content_walk`, `brain_pointer_divergence` match the pattern.

**Match count:** 14 shared entries match (`billing-errors.ts:983, 1003, 1008, 1013, 1063, 1130, 1165, 1170, 1175, 1195, 1258, 1263, 1281, 1925`) plus the `workspace_paused` override (`copy.ts:232`) = 15, not 13; the list has 37 entries, not 32 (N2).

**Overrides honest on paid tiers?** Only if the copy says the run counted, which the plan does not require (F2). Pause is paid-only, where a rebuild is affordable, and the plan's rewrite drops "try again" on the one surface where it works (F4).

**Pattern collides with kept copy?** Yes — the existing `workspace_paused` override, shared with profile/paste refusals (F4), and the honest "buy a pack … then run it again" in `debit_refused_after_call` (F3).

**Step-8b reference:** `:857` is the 8b comment and the claim write is `:869-884` — holds, but misses 8a (F1).

**Spend-row call count:** correct — up to 3 per generation (`pipeline.ts:160,186,318-319`), 2 and no scoring on a refused generation (`:218-241`). "A harness retry adds none" holds: `RunSlotBusyError` at `:740` precedes any usage row or claim, and each press gets a fresh `attemptId` (`actions.ts:285`).

**Not-owner assertion fails if the role gate is deleted?** Yes for the view gate (sentence derives from `isOwner`, `billing-view.tsx:219-221`, `page.tsx:125`); no for the action gate — deleting `assertOwner` (`stripe/actions.ts:907`) stays green; the screen is a courtesy (F6).

**E5:** page lines hold (`trends/page.tsx:305-317`, `:311`); facade method exists (`credits/src/app-server.ts:642-650`); mock enumerated (`trends-page.test.tsx:43-49`), `beforeEach` at `:181-211`; `trackNicheAction` remains the gate (`actions.ts:97-108`); seed allowances `seed.ts:84`.

**E8:** holds — on the voice path `RunSlotBusyError` is thrown only at `inference.ts:740` (`generate.ts:627` is the generation path).

**Probes:** Phase 1 *Least confident* — if the next real refusal is any post-vendor kind, the included build is consumed; recovery then needs a pack (F3); the exit rule routes the case correctly. Phase 2 rewritten retry line — sound as far as money is concerned.

### 3. Findings

| # | Type | Sev | Conf | Plan file + section | Evidence (`respin/`) | Fix |
|---|---|---|---|---|---|---|
| F1 | CHANGE | Medium | High | phase-1 T1 (iii) "before the included-build claim (step 8b, `inference.ts:857`)"; Failure Modes row 1 | A billable, build-consuming vendor failure is claimed at **step 8a**: the catch at `inference.ts:787-855` calls `recordUsage` with `consumesIncludedBuild` (`:806-807, :831-846`), inserting the claim row (`with-workspace.ts:4048-4060`). `LlmRefusedError` (`llm/src/errors.ts:161-168`) and `LlmSchemaInvalidError` (no text block) map to `llm_attempt_recorded` (`billing-errors.ts:1991`), whose copy says "Try again" (`:1003`). Its throw at step 7 precedes `:857`, so the literal rule classifies it pre-claim and exempts it; a Free re-press is then refused at step 6. | Define the claim as step 8a (`:831-846`, when `consumesIncludedBuild`) or 8b (`:869-884`); pin `PRE_CLAIM_CODES` in the plan as a list naming `llm_attempt_recorded` post-claim and `llm_truncated`/`llm_unavailable` pre-claim with reasons. |
| F2 | CHANGE | Medium | High | phase-1 T1 (iii) rewritten `inference_unusable` detail; AC3 | The rewrite deletes "Your run was still made, so it counted" (`billing-errors.ts:1170`); AC3 only checks a post-vendor sentence does *not* say nothing was spent. The price line deliberately never predicts the branch (`onboarding/run-copy.ts:17-27`) and still reads "Your first run for a creator is included" (`:65`). A paid creator (or a Free creator with a pack) not told the build was consumed re-presses expecting a free run and is debited 50 (`inference.ts:936-964`, `seed.ts:60`). | Require every post-vendor kind sentence and every override for a non-`PRE_CLAIM_CODES` code to say this run counted; assert presence in AC3 with a planted removal; keep it true on every tier. |
| F3 | CHANGE | Medium | Medium | phase-1 Failure Modes row 1 "on Free there is no re-press"; T1 (iii) scan rationale; master Deferral Ledger row "cannot rebuild … stuck" | Pack purchase has no tier/subscription requirement: `createPackCheckoutUrl` checks owner, re-auth and pause only (`stripe/actions.ts:900-998`), and REQ-G03 applies to all users. The premise holds only while the pack rollout gates stay closed (`:981-986`); once they open, "Buy an overage pack … then run it again" (`billing-errors.ts:1008`) is an honest remedy the scan would force out. The ledger row also understates the owner's choice — today's recovery is paying $10 for our failure, while truncation already opts out of consuming the build (`llm/src/errors.ts:242-257`). | Restate as "no re-press without buying credits (a pack)"; allow a purchase-conditional re-press invitation, or keep `debit_refused_after_call` on its shared copy as a named exception; correct the ledger row and cite the truncation precedent. The CI rationale (keyless → no pack) may stand. |
| F4 | CHANGE | Medium | High | phase-1 T1 (iii) "onboarding-only override in `ONBOARDING_OVERRIDES`"; Files row `copy.ts` | `onboardingErrorFor` feeds **two** banners: the `?e=` redirect for create-profile/paste/reference (`onboarding/page.tsx:457`) and the voice run's `refusalCopy` (`page.tsx:365-366`). The `workspace_paused` override (`copy.ts:229-233`, "…and try again") has post-claim producers (`with-workspace.ts:4076`, `ledger.ts:414`), so the scan forces a rewrite — as would a new `unknown` override — degrading paste/profile refusals where retrying is free. Pause is paid-only, so re-pressing after resume is affordable. | Put voice-run overrides in a separate map applied only where `page.tsx:365` builds `refusalCopy`, and scan that map; leave `onboardingErrorFor` and the redirect copy untouched. |
| F5 | CHANGE | Medium | Medium | phase-1 T1 (iii) scan (re-press pattern only) | `unknown` says "nothing was charged" (`billing-errors.ts:1925`). On a rebuild, step 9 commits the debit (`inference.ts:927-973`) before `parseVoiceReply`/`writeBrainDoc` (`infer-voice.ts:236-274`); unmapped errors and unlisted codes (`brain_content_schema`, `brain_claim_walk`, `brain_schema_shape`, thrown from `brain-content.ts:106-832`) fall back to `unknown` (`run-outcome.tsx:38`). The override F4 requires can carry that false clause, because the scan checks only re-press wording. | The voice-run `unknown` override must not claim nothing was charged/spent; add a money-claim pattern over non-pre-claim voice copy with a planted violation. |
| F6 | CHANGE | Low-Med | High | phase-2 T1 not-owner assertion; AC1 | The sentence renders once per blocked control — 3 subscribe tiers (`billing-view.tsx:403-416`), pack (`:442-443`), auto-top-up (`:477-478`) — so `expect(getByText(...)).toBeVisible()` violates Playwright strict mode and fails falsely. It also covers only the view's `isOwner`, not the action's `assertOwner` (`stripe/actions.ts:907`). | Scope: `getByTestId("subscribe-creator").getByText(...)` visible for the editor; `toHaveCount(0)` for owners; state the action gate is proven by the unit suite (`packages/credits/tests/actions.test.ts`). |
| N1 | NOTE | Low | High | phase-1 T1 (iii) classification rule | Codes with no voice-build producer (`profile_*`, `post_content`, `post_attestation`, `onboarding_input_limit`) are pre-claim only vacuously; their paste copy "try again" (`billing-errors.ts:1063, 1258`) is honest. | Say they are pre-claim because they have no spend-path producer. |
| N2 | NOTE | Low | Med | phase-1 T1 (iii) "13 listed codes"; orchestrator "32 codes" | The list has 37 entries; 14 shared matches + the `workspace_paused` override = 15 (line grep; a split-line match could be missed). | Replace the count with the list. |
| N3 | NOTE | Low | Med | phase-1 T1 (iii) pattern; w8 | The pattern misses "press Build again", "rebuild", "run the build again", and flags negations ("do not run it again"); w8 plants one phrase. | Plant a paraphrase too, or state the limit. |
| N4 | NOTE | Low | High | phase-1 T1 (iii) | The plan rewrites the shared `inference_unusable` entry while saying shared entries stay untouched — defensible (only onboarding lists it, `onboarding/copy.ts:151`), but unstated. | Name the exception. |
| N5 | NOTE | Low | Med | master Derived Budgets | Solo activates the kill test (`solo-creator.spec.ts:99`) before its 4 generations, each ≥ 2 calls → minimum ≈ 11, not 9; the worker's schedules (`worker/pg-boss-runtime.ts:353,357`) are unnamed system spend paths (expected zero on a fresh DB). | Derive the lower bound; name the worker paths. |
| N6 | NOTE | Low | Med | master Exit Demonstration | "two such refusals" is not stated as consecutive or cumulative, and there are two voice builds per run (solo, operator), so the dispatch count — and spend — is unbounded as written. | Pin both. |
| N7 | NOTE | Low | High | phase-1 T8 copy | Seed-pinned niche copy vs live allowance — accepted residual carried from batch 3. | Stays routed to the parked plan. |
| N8 | NOTE | Low | Med | phase-2 Edge Cases row 2 vs T2/AC1 | If the operator's voice build is refused (no retry), the editor is precondition-blocked; Edge Cases says "asserts the precondition refusal", T2/AC1 say "fails on `studio-blocked`" — contradictory. | Reconcile (generalist scope). |

### 4. Checks run

1 Stored balance (B1): no ledger write in either phase; T8 read-only — holds. 2 Webhook idempotency (B2): n/a (no webhook path; CI keyless). 3 Debit-in-transaction (B3): steps 6–9 unchanged; retry reaches no vendor — holds; F1 is copy classification, not metering. 4 Expiry/pause (B4): Free lots expire next month-start (`balance.ts:157-159`), so Free is capped at 25; pause code correctly dropped from the retry list. 5 Config-not-code (B5): T8 reads the live allowance; N7 stated residual. 6 Tier gates / owner-only billing (B6): Free niche allowance 0, action is the gate; not-owner check weakened by F6. 7 Number provenance: 50/25/0 and call lines cited correctly; lower bound loose (N5); 8b anchor misses 8a (F1). 8 Money paths tested (B7): C4 and C8 now redden on their target defects; AC3 lacks a presence check for "run counted" (F2) and a money-claim scan (F5).

Commands run: none (no Bash) — Read, Grep, Glob only.

**Verdict: NEEDS CHANGES** — retry list, Trends niche tests, `data-code` handoff and spend row are sound; E2's copy-honesty rule misclassifies a build-consuming code (F1), removes the "run counted" fact that prevents an unexpected 50-credit rebuild (F2), rests on a Free premise that becomes false when packs open (F3), rewrites a two-banner table (F4) and cannot catch a false "nothing was charged" (F5); the not-owner assertion as specified would fail every run (F6). All six are plan-text fixes that stay off the parked money path.

## Compliance plan review — respin-service-quality — batch 4 (lean merged run)

**Readiness: Almost · Grade: C · E4's disclosure edits are now true against the code and all six batch-3 CHANGEs are acted on, but E2's re-press scan catches only some of today's "run it again" wording and would strip legitimate remedies from surfaces where retrying is free.**

Counts: 0 ❌ BLOCK · 5 ⚠️ CHANGE · 7 💡 NOTE. Scope: plan text only, HEAD `3273f36`; Phase 1 T1 (iii), T5–T7, E2/E4 as far as S-rules and refusal copy go. `src/`, `cutdown/`, `docs/initial.past/` untouched. Read/Grep/Glob only; no Bash.

### 1. Batch-3 CHANGEs C1–C6

| # | Status | Evidence |
|---|---|---|
| C1 R-68 entry scoping | **Closed** | T6 (viii) now says "`/disclosure/` **traceability** findings" and that claim findings are always listed — matches R-69 (`decisions.md:884`) and `claims.ts:467-470`. AC9 names it, though no test can check a `decisions.md` entry (N5). |
| C2 re-press wording in kind sentences | **Partly closed** | Scan and plant w8 exist, but the pattern misses live re-press copy and the scan runs over a copy table the free-retry actions share (K1, K2). |
| C3 provenance sentence | **Closed** | "names, numbers and dates are not listed here" is true post-filter; the list shows specifics **not** traced (`generation-outcome.tsx:114-151`), and the sentence no longer claims they were traced. One fixture edge (N1). |
| C4 `&& flag` unwitnessed | **Closed** | Fixtures are literal `KillTestSummary` objects (`studio-ui.test.tsx:207-230, 713-735`), so a hard `/disclosure/guidance` `$4,000` row is constructible although `enforcementFor` never produces one (`traceability.ts:297,303`); deleting `&& enforcement === "flag"` drops the row → the assertion reddens. |
| C5 `initialState` spread leak | **Closed, with a gap** | Identifier-wide scan with plants w7a/w7b; no false positives today (`app/**` has no `initialState`; every `useActionState` there initialises from a named `IDLE_*` constant). Gap: nothing checks the declaring panels themselves (K4). |
| C6 stale comments | **Closed** | Enumerated sites verified: `generation-outcome.tsx:132-141` (still "keys on `kind` and `field`"), `:172-175`; `run-copy.ts:456-461`, `:538-547`, `:579-584`; onboarding `run-copy.ts:1`. The `field`-parameter decision is recorded. AC9 still says "two" comments (N5). |

### 2. E2/E4 against code

- **(v) sentence vs screen:** holds — the filter hides every flag-level `/disclosure/` row; heading, list and list-presence gate (`:118`) follow the filtered list; `TRACEABILITY_LIMIT_NOTE` ("every number, date and name … was checked") stays true because findings are still scanned and stored.
- **w3c constructible and reddens:** yes (C4).
- **`studio-in-force` "inside `StudioPanel`":** holds — `run` is null only on the no-profile branch (`studio/page.tsx:84-99`); every profile render passes `run` (`:268-301`). T7's "no state renders the panel with a profile and `run === null`" also holds. T5's file list lags (N2).
- **Could-not-be-read state:** honest — `Promise.all` over the three histories (`page.tsx:133-149`) means one failure covers all three, so "could not be read" is accurate; listed outside folds in AC10. It can sit beside `studio-blocked`'s "activate a brain first" (N3).
- **Pre-vendor sentences:** true for all three kinds — `assembleVoicePrompt` (`infer-voice.ts:207`) precedes `runInference` (`:214`), and nothing spending or reserving runs earlier (`:161-202`); the fields are a constant (`VOICE_FIELDS`) and post ids come from the DB (`assemble.ts:174,186,193`), so "the fault is the product's" holds. Nothing forbids a fix timeline and no remedy is required (K1, N6).
- **Model text in refusal sentences:** none — static `Record<AssemblyKind,string>`, `err.message` forbidden, refused state carries code + kind only.
- **Does the re-press scan remove an owed remedy:** yes (K1), and it misses live wording (K2).
- **Material checks' ability to fail:** `check-markers-kept-for-creator-fields` (w3, w3b) ✓; hard-disclosure surfacing (w3c) ✓; `disclosure-claims-never-filtered` — render witness `:821-835` uses a flag-level concealment finding, a real state because R-69's context guards demote to flag (`decisions.md:886`), and a claims filter would redden it ✓; `honesty-blocks-never-folded` (w4, w6) ✓ but lists incomplete (K5); `initialState` leak (w7a/b) ✓ except rename (K4); `assembly-kind-content-free` ✓ sentinel test; re-press wording (w8) catches its plant but leaves the class open (K2).

### 3. Findings

| # | Sev | Conf | Plan file + section | Evidence | Fix |
|---|---|---|---|---|---|
| **K1 ⚠️ CHANGE** | Medium | High | Phase 1 T1 (iii) re-press scan, `PRE_CLAIM_CODES`, AC3 | One onboarding copy table serves two channels: the voice-run panel (`onboarding/page.tsx:365-367`) and the `?e=` redirect for create-profile, add-post and add-reference (`:457`), where resubmitting is free. Any code with both a free-retry producer and a post-claim voice producer must lose its remedy under the scan — e.g. `unknown` ("Try again", `billing-errors.ts:1925`) and the `workspace_paused` override ("…and try again", `copy.ts:232`), which `writeBrainDoc` also produces post-claim. `debit_refused_after_call` ("Buy an overage pack … then run it again", `:1008`) is a real paid remedy. The plan never requires an override or pre-vendor sentence to **name** a remedy (`DESIGN.md:75` "Refusals name the remedy"). Codes with no voice-build producer at all (`post_content`, `onboarding_input_limit`) fall into "every producer runs before the claim" only vacuously. | Apply voice-run overrides only to the run panel's `refusalCopy` (a separate map at `page.tsx:365`), leaving `?e=` copy intact; list no-voice-producer codes as their own exempt category; require every scanned override and kind sentence to name a remedy (the priced rebuild shown in the panel's price line, "buy credits, then build", or "tell us") and assert its presence. |
| **K2 ⚠️ CHANGE** | Medium | High | Phase 1 T1 (iii), AC3, w8 | `/try again\|run (it )?again\|press again/i` is a list of phrasings, not a rule. Post-claim onboarding copy already evades it: `provenance` "Try the build again" (`billing-errors.ts:1028`; code listed at `copy.ts:218`; raised by `validateSourceEvidence` in `writeBrainDoc`, post-claim) and `brain_document_limit` "rebuild or submit the replacement again" (`:1053`). `provenance` is precisely the refusal a T1 offset mis-map would produce — telling a Free creator to rebuild when that rebuild is refused pre-vendor. A "try again" plant proves only that instance (lesson 2026-08-18). My count of matching listed codes is 14, not 13. | Class pattern, e.g. `/\bagain\b\|\bretry\|\bre-?run\b\|once more/i` over the scanned (post-claim, run-panel) set; plant at least two shapes ("try the build again", "retry"); add `provenance` and `brain_document_limit` to T1's classification. |
| **K3 ⚠️ CHANGE** | Medium | Medium | Phase 1 T1 (iii), AC3 | Today the `inference_unusable` detail discloses "Your run was still made, so it counted" (`billing-errors.ts:1170`) — true for every post-vendor kind (the debit/claim commits before the parse, `infer-voice.ts:231-236`). E2 strips every call/counted claim from title and detail and delegates it to the kind sentence, but AC3 only asserts a post-vendor sentence does **not** say "nothing was spent", and price words are barred — so the creator is no longer told the build counted: a spend disclosure disappears from a refusal (overlaps billing). | Require every post-vendor kind sentence (or one shared post-vendor clause) to say the run was made and counted, without price words (no regex collision); assert in AC3. |
| **K4 ⚠️ CHANGE** | Low | High | Phase 1 T7 test mechanism, w7a/w7b, AC10 | The scan exempts the two declaring panels as whole files and never checks they use the identifier. If the prop ships as `initialStudioState`, the plant still reddens the scan, real code passes, and a leak via the renamed prop is invisible — rendering a draft that never passed the kill test (S3). The whole-file exemption also hides a leaky default inside a panel. | Positive control: each panel declares exactly one `initialState` prop and passes it to `useActionState` (fixed occurrence count per panel), else the scan is red. |
| **K5 ⚠️ CHANGE** | Low | High | Phase 1 AC10, T7 | The shared `USABLE` fixture has `claims: []` (`studio-ui.test.tsx:241`), so the concealment claims block never renders in the fold check. The "outside" lists omit `studio-claims`, `studio-traceability-heading`, `studio-traceability-note` (the REQ-I03 limit) and `studio-charge`; honest refusal omits `studio-honest-refusal`, `studio-refusal-why`, `studio-sharper-angle` (`generation-outcome.tsx:481-491`) — S3's "here is why, here is a sharper angle". "Inside: exactly …" is not defined as set equality, so folding "Where the specifics came from" could pass. | `CONCEALMENT` plus one traceability row in both AC10 fixtures; add the listed testids; define inside as set equality over every `data-testid` within a `<details>` span. |
| 💡 N1 | Low | High | T6 (v) vs (vi) w3c | The w3c render shows disclosure-guidance `$4,000` in the list beside a sentence saying its "names, numbers and dates are not listed here"; production cannot reach it while `FLAG_ONLY_FIELD_PREFIXES` is pinned (agreement test). | "flagged names, numbers and dates", or record in the test why the fixture contradicts the sentence. |
| 💡 N2 | Low | High | T5 File(s) | The line renders in `StudioPanel`, a client component that must not import `studio/copy.ts` (`studio-panel.tsx:34-38`); T5 lists `copy.ts` and `studio-view.tsx` but not `studio-panel.tsx`/`run-copy.ts`. | Add both; state the sentence is a server-computed prop or lives in `run-copy.ts`. |
| 💡 N3 | Low | Med | T5 | After a failed read `brainActivated` stays false (`page.tsx:141-149`), so "could not be read" renders beside "activate a brain first". | Optional: same could-not-be-read wording in the block reason. |
| 💡 N4 | Low | High | Phase 1 *Least confident* (probe) | Kinds are 1:1 with throw sites (16/16), so kind sentences stay honest whichever kind comes next. But a tolerance map-back error surfaces as `provenance` (`ProvenanceError`, not `AssemblyError`) with no kind — "the kind on the next real refusal is the diagnostic" does not cover T1's own likeliest regression, and that path's copy evades the scan (K2). | Name that case in *Least confident*. |
| 💡 N5 | Low | High | AC9 | Still "the two stale 'only hard section' comments" while (vii) enumerates more; its evidence column cites tests for the decision-entry clause, which no test reads. | Align the count; mark the decision entry as a manual check. |
| 💡 N6 | Low | Med | T1 (iii) pre-vendor sentences | No bar on a fix timeline ("fixed soon"); no remedy named. | Add "no timeline"; name "tell us" as the remedy (the `uncharged_attempt_cap` pattern, `billing-errors.ts:1330`). |
| 💡 N7 | Info | High | T6 | Trends Spin has its own disclosure locator (`trends/spin-state.ts:79`, hard-only in the withheld state) — unaffected by T6 and still unassessed, as the master plan says. | — |

### Checks run

1 Sources · 2 Similarity gate · 3 Minimum difference · 8 Autopsy — n/a (no ingest/spin/autopsy code; Trends/Spin recorded unassessed). 4 Kill-test honesty — holds: honest-refusal branch unchanged (`generation-outcome.tsx:473-525`); pre-vendor copy true (§2); gaps K3, K5. 5 No invented specifics — holds: creator-material offers kept (w3/w3b), hard disclosure rows surface (w3c), zero-count heading rescoped; residual owner-accepted. 6 No guarantees — holds for new sentences; refusal remedies K1/K2. 7 No automation / concealment — holds: `summary.claims` never filtered, render witness failable, R-68 entry scoped to traceability.

**Verdict: NEEDS CHANGES** — no BLOCK; E4 holds against the code, but E2's re-press scan misses post-claim copy already on screen (including the refusal T1's own likeliest bug would produce) and would strip free-retry remedies from the shared onboarding copy table (K1, K2), and the post-vendor "your run counted" disclosure must survive the rewrite (K3).

---

# Plan review — respin-service-quality — batch 4 generalist (final slot)

*Recorded verbatim by the orchestrator (trailing "Ask /go…" footer and file list omitted). Dispatch: `plan-reviewer`, model inherit / no override requested, "think hard", read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Inputs: the plan as revised by E1–E9 (frozen) plus the three batch-4 specialist reports above; no batch-4 finding applied.*

**Readiness: Not yet · Grade: D · Batch-3 fixes largely hold, but the refusal-copy work in Phase 1 T1 (iii) has not converged, all three specialist verdicts stand at NEEDS CHANGES, and Phase 2 carries one assertion that fails every run and one unresolved task contradiction.**

`plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full. Reviewer context: session model, "think hard", Read/Grep/Glob only, no Bash, nothing executed, HEAD `3273f36`. No file edited or written; this message is the report.

## Counts

| | BLOCK/High | Medium | Low | Info |
|---|---|---|---|---|
| Consolidated findings (after dedupe) | 0 | 14 | 31 | 6 |
| of which new in this review (incl. severity raises) | 0 | 3 raised (M12, M13, M14) | 9 (L6–L12, L30, L31) | 1 |

Normalisation (batch-3 convention): specialist "Low-Med" → Medium (billing F6, tenancy CHANGE 5 and CHANGE 6); raised to Medium because they decide what is built or let a named invariant's check pass on a violation: billing N8 (M12), tenancy CHANGE 4 (M13), compliance K5 (M14).

## Standing specialist verdicts (batch 4, not applied)

| Path | Verdict | Items |
|---|---|---|
| Brain tenancy (full) | NEEDS CHANGES | 0 BLOCK, 7 CHANGE, 9 NOTE |
| Billing & credits (full) | NEEDS CHANGES | 0 BLOCK, 6 CHANGE, 8 NOTE |
| Spin compliance (lean merged) | NEEDS CHANGES | 0 BLOCK, 5 CHANGE, 7 NOTE |

No path has a PASS; this slot is the last authorised evaluation.

## Batch-3 closure table (current text)

| ID | Status | Evidence / residual |
|---|---|---|
| H1 identity script fails lint | **Closed** | UI bootstrap T4 steps (5)–(6); no script row; tenancy found no tenancy/secret/admin hole. Fix introduced a restart race (M9). |
| M1 tautological quote property | **Partly closed** | Canon-equality + boundary assertion added; boundary assertion unwitnessed and w2b misstates what reddens (M1); `canon` independence unpinned (M2). |
| M2 over-tolerance guard | **Partly closed** | Table-driven map + negative property added; negative property vacuous if tests import `canon` (M2); "nothing else" unenforceable against JS `\s`/`trim()` (L1). |
| M3 paragraph-rule regression | **Closed** | Paragraph token; verbatim `\n\n` locates. Mixed-run order and edge-token trim unpinned (L1). |
| M4 journeys job in `respin.yml` | **Closed** | New `respin-journeys.yml`, `workflow_dispatch`. Proof is a one-off grep (M10). |
| M5 delete/scan order | **Closed** | Steps (8)→(9)→(10) `if: always()`; Verification 3 deletes first. |
| M6 `data-code` absent | **Closed** | T1 (iii), Handoff, AC3; `Banner` spreads props (billing verified). |
| M7 pre/post-vendor partition | **Closed (partition); fix-induced regression** | The rewrite drops "Your run was still made, so it counted" (`billing-errors.ts:1170`) with no replacement (M4). |
| M8 R-68 entry scoping | **Closed** | T6 (viii) traceability + claims always listed. |
| M9 sibling "try again" codes | **Not closed; fix-induced defects** | 8b anchor misses 8a (M3); one shared table feeds two banners (M5); phrase-list pattern (M7); `unknown` "nothing was charged" (M6); Free premise breaks when packs open (M8). |
| M10 spend row | **Closed** | ≈9–17 calls; lower bound should be ≈11 (L19). |
| M11 not-owner assertion | **Partly closed** | Added, but the sentence renders ≥5 times → strict-mode failure (M11). |
| M12 T8 breaks Verification 6 | **Closed** | See E6. |
| M13 null minimum | **Partly closed** | Post-read failure is already a whole-page refusal; `undefined` minimum renders "next" (M13). |
| M14 AC5 harness | **Closed** | `selected-profile-pages.test.tsx` imports the page with mocks. |
| M15 `workspace_paused` retry | **Closed** | Dropped; producers named. |
| M16 same-`Date` instant | **Closed** | `toBe` same object. |
| L1 absolute secret claims | **Closed** | — |
| L2 w5 split | **Closed** | w5a/b/c. |
| L3 "minted per run" ×4 | **Closed** | Codebase review `:113` still says "unreachable" (Info). |
| L4 whole-sentence seed | **Closed** | — |
| L5 provenance wording | **Closed** | Fixture edge (L21). |
| L6 w3c hard-disclosure witness | **Closed** | — |
| L7 identifier-wide `initialState` scan | **Closed with gap** | No positive control on declaring panels (L4). |
| L8 stale comments | **Closed** | AC9 still says "two" (L25). |
| L9 warm-up residual | **Partly closed** | Stated for step 7; step-5 bootstrap runs cold with no re-dispatch rule (M9). |
| L10 per-spec report dirs | **Closed** | Makes the `data/*.zip` exclusion glob and its AC grep vacuous (L13). |
| L11 `up -d --wait` | **Closed** | — |
| L12 exit-demo rule + ledger row | **Closed in text** | Refusal count ambiguous (L20); ledger row understates the pack route (M8). |
| L13 Depends on | **Closed** | — |
| L14 column closure | **Closed** | A separate T5 closure gap (L22) predates E9. |
| L15 declared-metric fold | **Closed** | T4 + AC7. |

Tally: 21 closed, 7 partly closed, 1 not closed (M9), 1 closed with a fix-induced regression (M7). Every open residual except M11/L9 is concentrated in two places: T1 (iii) refusal copy and T1's quote-tolerance test strength.

## E6 / E9 check

**E6 (P1 T8 solo niche branch, Verification 6): closed.** The branch is in T8's text, the Files table (`solo-creator.spec.ts`, "CRLF preserved") and Out of Scope; Verification 6 references the spec. Anchor verified: chapter 12 at `solo-creator.spec.ts:175-185`, the unconditional `#tracked-niche` fill at `:180`. A non-waiting `isVisible()` on `niche-disabled-tier` immediately after `page.goto("/trends")` suffices because the block is server-rendered and `goto` waits for load. Verification 6 walked against every Phase 1 change the spec touches: T2 `signUp` wait ✓; T3 reorder — `#content` unique (`onboarding-view.tsx:378`), "Save post" (`:440`), "Build my voice brain" (`run-inference-panel.tsx:156`) unique ✓; T4 folds — `activateBrainSection` ticks checkboxes only on first activation, when no version is in force, so folds are open ✓; keyless chapter 9 — the password fill times out, is caught, writes a `BLOCKING APP BUG` note and continues → passes ✓. Residuals: CRLF preservation has no byte check (L11); the branch's screenshot name/note text is unnamed although Phase 2 T3's main-chapter map may need it (Info); Verification 6 does not state it needs the dev server, worker and vendor key, and spends ≈9–13 calls (L7).

**E9 (master-plan text edits):**

| Item | Status |
|---|---|
| Spend row | Present and correctly derived (`pipeline.ts:160,186,318-319`); lower bound ≈11, not 9 (solo activates the kill test before 4 generations of ≥2 calls) (L19). |
| Vendor limit before first dispatch | Present: master Dependencies `:55`, P2 Verification 4, Deferral Ledger `schedule` row. |
| Exit-demo re-dispatch rule | Present; "two such refusals" neither consecutive nor cumulative, two voice builds per run, and T4 step 6 adds a second re-dispatch rule → dispatch count unbounded (L20). |
| Stuck-Free-creator ledger row | Present; omits the pack route and the truncation precedent (M8). |
| P1 Depends on | Fixed (creator-ready Phase 0). |
| File-column closure | Holds for everything E9 named; new gap: T5's File(s) omits `studio-panel.tsx`/`run-copy.ts` (L22). |
| w5 split | Done (w5a/b/c). |
| Declared-metric fold | T4 + AC7. |
| Status lines | Master `:5` still says batch-3 "findings not applied" (tenancy N9); umbrella `creator-ready-master-plan.md:61` still says "batch 3 is the owner's call"; the Plan Review Log's `:136` paragraph now sits after batch 4 and reads as current (L31). |

## Execution simulation (as `respin-engineer`, plan text only)

Verified this session: `onboarding/page.tsx:86-141, 215-469` (incl. `:265-268` whole-page refusal, `:365-367` `refusalCopy`, `:457` `?e=` channel); `onboarding/copy.ts:100-259`; `run-outcome.tsx` (whole); `run-copy.ts` (whole); `run-inference-panel.tsx` testids; `inference.ts:780-889`; `infer-voice.ts:196-280`; `assemble.ts:40-69, 255-399`; `billing-errors.ts:995-1059, 1155-1199, 1918-1927`; `billing-view.tsx` `notOwner` render sites; all four spec files, `artifacts.ts`, `playwright.config.ts`; `eslint.config.mjs:1000-1081`; `schema.ts:257-268`; `tsconfig.json` include; `selected-profile-pages.test.tsx:12-57, 133-144`; `gate-rules.md` §3–§11.

**Phase 1** (start also blocked externally: creator-ready Phase 0 NOT READY)
- **PASS\* T1 (i)/(ii)/(iv)** — executable; builds four test-strength defects (M1, M2, L1, L17).
- **FAIL T1 (iii)** — executable as written, but executing it ships defects: the literal rule ("a post-claim code that fails the scan gets an `ONBOARDING_OVERRIDES` entry") forces rewrites of `unknown` and the existing `workspace_paused` override, both of which also serve the create-profile/paste banners via `?e=` (`page.tsx:457`) where retrying is free (M5); it exempts build-consuming `llm_attempt_recorded` (M3); drops the "counted" disclosure (M4); misses live post-claim wording (M7); leaves a false "nothing was charged" (M6).
- **PASS T2.**
- **PASS\* T3** — M13; the post count comes from `fetched`, clamped to `PAGE_SIZE + 1 = 26` (`page.tsx:261`), while `minOwnPostsForVoice` has no max (`schema.ts:259`) (L6). Info: the minimum would share the try block with `onboardingBrainPrices` (`page.tsx:223-228`), so a price-shape failure also makes the minimum `unknown` — fails safe, unstated; the existing test mock lacks `onboardingBrainBuild`.
- **PASS T4.**
- **PASS\* T5** — L22.
- **PASS T6** — compliance verified E4 against code; L21, L25.
- **PASS\* T7** — L4, M14.
- **PASS T8** — incl. E6.
- **Verification 3** — unreachable on a voice refusal: Free cannot rebuild, so "4 of 4 done" needs a fresh sign-up the step does not state (L7).
- **Verification 7** — w2b's "boundary assertion red" is false (M1).

**Phase 2**
- **FAIL T1** — `getByText("Only the workspace owner…")` hits multiple `notOwner` render sites (`billing-view.tsx:365, 388, 477-478, 590, 608-609, 658-659, 702`); strict mode fails every run (M11).
- **AMBIGUOUS T2** — Edge Cases row 2 says the editor chapter records a precondition refusal when the operator's build is refused; T2/AC1 say editor-seat fails on `studio-blocked`. An implementer cannot tell whether a model refusal turns the nightly red (M12).
- **PASS T3** — Info on the suffix match.
- **PASS\* T4** — M9 (restart race, step-5 cold compile), M10, L3 (vendor key at job scope), L13 (exclusion glob), L14 (unvalidated id into `$GITHUB_ENV`); step 7 runs four commands in one step — under GitHub Actions' default `bash -e` the first failing spec aborts the rest, losing later personas' evidence, unstated (L10); the scan's `BLOCKING` match is not anchored to `[note] ` lines, while `console.log` also carries page console text and URLs (`artifacts.ts:53-67`) (L9).
- **PASS T5** — L16.
- **Verification 2** (local) — does not say the admin two-start bootstrap must be done by hand; repeated local runs against the persistent DB can hit Better Auth's DB-backed 10 sign-ups/hour limit (≈4–5 per full run) (L30).

**Size (gate-rules §11):** 42 rows > 25 (owner-accepted). Every task could be simulated; the second signal does not fire. T1 is a single ≈1,700-word cell, but the recurrences stem from what T1 (iii) is asked to do, not phase size — a split would not have prevented any batch-3 or batch-4 finding (Lessons 2026-09-08).

## Pre-mortem (shipped, then failed)

| # | Likely cause | Receiving task / spec | Status |
|---|---|---|---|
| 1 | Run-2 failure was not `quote_not_found`; tolerance not the fix | T1 (i)(iii) record kind; Least confident | Absorbed honestly |
| 2 | Tolerance mis-maps; write refuses as `provenance` with no kind — the diagnostic misses T1's own likeliest regression | Least confident | **Gap** (L24, compliance N4) |
| 3 | Mis-mapped slice stored into whitespace, hidden by canon trim | AC2 boundary assertion | **Gap** — unwitnessed (M1) |
| 4 | Tests import the implementation's `canon`; properties pass while `canon` is wrong | AC2/w1b | **Gap** (M2) |
| 5 | Canonicaliser folds NBSP/U+2028 via `\s`/`trim()` | "nothing else" | **Gap** (L1) |
| 6 | Free creator re-presses after build-consuming `llm_attempt_recorded` and is refused | `PRE_CLAIM_CODES` | **Plan causes it** (M3) |
| 7 | Paid creator / pack buyer not told the run counted; re-presses into a 50-credit debit | AC3 | **Plan causes it** (M4) |
| 8 | Profile/paste banners lose an honest "try again" via the shared override table | T1 (iii) overrides | **Plan causes it** (M5) |
| 9 | `unknown` tells a debited creator "nothing was charged" | T1 scan (re-press only) | **Gap** (M6) |
| 10 | "Try the build again" on `provenance` survives the scan | re-press pattern | **Gap** (M7) |
| 11 | Pack rollout opens; honest "buy a pack, then run it again" gets stripped | Failure Modes row 1 premise | **Gap** (M8) |
| 12 | Step header shows "next" on undefined minimum / cannot render `unknown` for a post read | T3/AC5 | **Gap** (M13) |
| 13 | Minimum configured > 26; header "next" forever | T3 | **Gap** (L6) |
| 14 | Honesty block folded but absent from AC10's hand list (claims, sharper angle, heading) | AC10 | **Gap** (M14) |
| 15 | `initialState` renamed; leak scan passes | T7 scan | **Gap** (L4) |
| 16 | T8 breaks the solo journey | T8 branch | Absorbed (E6) |
| 17 | A later edit adds `pull_request_target`/`push` to the journeys workflow | AC4 grep | **Gap** (M10) |
| 18 | Bootstrap dev server not released; readiness hits the dying server | T4 step 5→6 | **Gap** (M9) |
| 19 | Cold compile >30 s during the step-5 bootstrap | none (re-dispatch rule covers step 7 only) | **Gap** (M9) |
| 20 | Every nightly red on a strict-mode violation | P2 T1 | **Plan causes it** (M11) |
| 21 | Operator's voice build model-refused; nightly red or silently green | T2 vs Edge Cases | **Unresolved** (M12) |
| 22 | Owner sizes the vendor limit from an undercount | spend row | Absorbed (L19 loose bound) |
| 23 | Exit demo never reached; dispatches unbounded | Exit Demonstration | Partial (L20) |
| 24 | `_handoff/` uploaded | T4 (8)–(10) | Absorbed |
| 25 | Nightly passes on skips | presence scan with plants | Absorbed |
| 26 | Scan fails on a console line containing "BLOCKING" | T4 scan | **Gap** (L9) |
| 27 | First spec failure aborts the step; later evidence lost | T4 step 7 | **Gap** (L10) |
| 28 | Vendor key read by an install script / third-party action | job-level env | **Gap** (L3) |
| 29 | Settled-wait lint satisfied by a nearby wait in another branch (e.g. `solo-creator.spec.ts:167-173`) | AC2 lint | **Gap** (L8) |
| 30 | R-68 entry later read as licensing hidden concealment claims | T6 (viii) | Absorbed |

## Consolidated findings

Sources: T = tenancy b4, B = billing b4, C = compliance b4, G = this review. "Built" = changes what is built; "Records" = changes only how the plan reads.

| ID | Sev / conf | Source | Plan file + section | Finding | Fix | Built / records | Code cross-check |
|---|---|---|---|---|---|---|---|
| M1 | Medium / High | T-CH1 | P1 T1 (iv); V7 w2b; AC12 | Boundary assertion catches drift into whitespace only, and no witness shifts into whitespace; w2b (non-whitespace) reddens only canon-equality. | w2b → "canon-equality red"; add w2c (end into whitespace), w2d (start into whitespace) — or see convergence redesign | Built | Confirmed by logic against Edge Cases row 2 trim rule |
| M2 | Medium / Med-High | T-CH2 | P1 T1 (iv), AC2, w1b, cross-package case | Test `canon` provenance unpinned; if imported, canon-equality and the negative property pass while `canon` is wrong. | Test-side reference `canon` from the table, never imported; negative generator mutates one char (case, punctuation, `«`, `„`, ellipsis) | Built | Plan text silent — confirmed |
| M3 | Medium / High | B-F1 | P1 T1 (iii) "step 8b, `inference.ts:857`"; Failure Modes row 1 | A vendor-failure billable claim is recorded at step 8a (`recordUsage` with `consumedIncludedBuild`), so `llm_attempt_recorded` consumes the build but the 8b anchor exempts it. | Name 8a and 8b as the claim; pin the classification as a list — or remove the scan (convergence) | Built | Confirmed `inference.ts:806-807, 831-846` |
| M4 | Medium / High | B-F2 = C-K3 | P1 T1 (iii) `inference_unusable` rewrite; AC3 | "Your run was still made, so it counted" deleted; nothing requires a replacement; AC3 only negative; price words barred. | Keep the counted clause for post-vendor kinds; assert presence | Built | Confirmed `billing-errors.ts:1170`; `run-copy.ts:20-27` never predicts the branch |
| M5 | Medium / High | B-F4 = C-K1 | P1 T1 (iii) overrides; Files `copy.ts` | `onboardingErrorFor` feeds both the voice-run `refusalCopy` and the `?e=` banner for profile/paste/reference; scan-forced overrides degrade honest free-retry copy; no rule requires a remedy be named. | Separate voice-run map applied only at `page.tsx:365` — or remove the scan (convergence) | Built | Confirmed `page.tsx:365-367, 457`; `copy.ts:229-233` |
| M6 | Medium / Medium | B-F5 | P1 T1 (iii) | `unknown` fallback says "nothing was charged" after a committed rebuild debit; unmapped `brain_*` codes fall back to it. | No money claim in voice-run `unknown` — or route to the ledger (convergence) | Built | Confirmed `billing-errors.ts:1925`, `run-outcome.tsx:38`; rebuild debit path not re-traced |
| M7 | Medium / High | C-K2 (+B-N3) | P1 T1 (iii), AC3, w8 | `/try again\|run (it )?again\|press again/i` is a phrase list: misses `provenance` "Try the build again" (the refusal a mis-map produces) and `brain_document_limit` "rebuild or submit … again"; flags negations. | Class pattern + two plants — or remove the scan (convergence) | Built | Confirmed `billing-errors.ts:1028, 1053`; codes listed at `copy.ts:137, 218` |
| M8 | Medium / Medium | B-F3 | P1 Failure Modes row 1; master Deferral Ledger row | "On Free there is no re-press" holds only while the pack rollout gates stay closed; ledger row omits the pack route and the truncation precedent. | "no re-press without buying credits"; correct the ledger row | Built (copy premise) + Records | Not re-traced (billing cites `stripe/actions.ts:900-998`); `assertOwner` at `:293` seen |
| M9 | Medium / Medium | T-CH5 (+G) | P2 T4 steps (5)–(6); Least confident | Bootstrap dev server killed by PID with no port-release wait; readiness may answer from the dying server; step 5 runs cold under 30 s waits with no re-dispatch rule. | Loop until the port refuses; confirm new PIDs alive; warm `/sign-up` in step 5; extend the re-dispatch rule | Built | Plan text confirmed; runtime reasoned (`playwright.config.ts:27`) |
| M10 | Medium / High | T-CH6 | P2 AC4; invariant `journeys-manual-or-nightly-only` | One-off grep cannot catch an added `pull_request_target`/`push`/`workflow_run`. | Vitest over both YAML files with planted triggers; add to Files | Built | Confirmed AC4 text |
| M11 | Medium / High | B-F6 | P2 T1; AC1 | Not-owner sentence renders per blocked control; a bare text locator breaks strict mode every run; action gate `assertOwner` unproven. | Scope to `subscribe-creator`; `toHaveCount(0)` for owners; cite the unit suite for the action gate | Built | Confirmed seven `notOwner` render sites in `billing-view.tsx` |
| M12 | Medium (↑ Note) / High | B-N8 + G | P2 Edge Cases row 2 vs T2/AC1 | Contradiction: on an operator voice-build refusal, does editor-seat record a precondition refusal or fail on `studio-blocked`? Decides whether model nondeterminism turns the nightly red and how `journeys-no-persona-skips` reads. | Owner/plan decision; make row, T2, AC1 agree | Built | Confirmed plan text; `editor-seat.spec.ts:61-79` records today |
| M13 | Medium (↑ Low) / Medium | T-CH4 | P1 T3; AC5; Failure Modes row 2 | "`unknown` when the post read fails" is unreachable (that failure already renders a whole-page `AccessRefusal`); an `undefined` minimum compares `n >= undefined` → false → "next", with AC5 green. | Reuse `fetched`; keep today's refusal (asserted); non-finite minimum → `unknown`; add missing-field case | Built | Confirmed `page.tsx:265-268`; `selected-profile-pages.test.tsx:137-143` lacks `minOwnPostsForVoice` |
| M14 | Medium (↑ Low) / High | C-K5 | P1 AC10, T7 | Fold-check "outside" lists omit `studio-claims`, `studio-traceability-heading`, `studio-traceability-note`, `studio-charge`, `studio-honest-refusal`, `studio-refusal-why`, `studio-sharper-angle`; fixture has `claims: []`; "inside: exactly" is not set equality. | `CONCEALMENT` + a traceability row in fixtures; set equality over every testid inside `<details>` spans | Built (tests) | AC10 text confirmed; fixture cite from compliance |
| L1 | Low / Medium | T-CH3 | P1 Edge Cases row 2; T1 alphabet | "Pinned map and nothing else" unenforceable: `\s`/`trim()` fold more; edge-token trim and mixed-run order unpinned. | Spell the class; ban `\s`/`trim()`; exhaustive code-point check | Built | JS semantics |
| L2 | — | — | — | (merged into M13) | — | — | — |
| L3 | Low / Medium | T-CH7 | P2 T4 env | `ANTHROPIC_API_KEY` at job scope, visible to install and third-party steps. | Step-level `env:` on step 6 | Built | Plan text |
| L4 | Low / High | C-K4 | P1 T7 scan | Declaring panels exempt with no positive control; a rename passes. | Fixed occurrence count per panel | Built (tests) | Plan text |
| L5 | — | — | — | (merged into M7, B-N3) | — | — | — |
| L6 | Low / Medium | G | P1 T3 | Post count uses `fetched`, clamped to 26; `minOwnPostsForVoice` has `min(1)`, no max. | Use the count accessor, or cap the minimum and state it | Built | Confirmed `page.tsx:84, 261`; `schema.ts:259` |
| L7 | Low / High | G | P1 Verification 3, 6 | V3 "4 of 4 done" unreachable after a Free voice refusal; V6 does not state its process/key/spend prerequisites. | Fresh-sign-up rule on refusal; state prerequisites | Records | Plan text |
| L8 | Low / Medium | G | P2 T1 / AC2 lint | "within five lines" proves proximity, not settledness; a wait inside an untaken branch satisfies it. | Require the wait to share a block with the screenshot, or a named settled helper | Built (tests) | `solo-creator.spec.ts:167-173` |
| L9 | Low / Medium | G | P2 T4 scan | `BLOCKING` match not anchored to `[note] ` lines; console lines may false-positive. | Match `^\[note\] ` + prefix; plant a console-line case | Built | `artifacts.ts:53-67, 80` |
| L10 | Low / Medium | G | P2 T4 step 7 | First failing spec aborts later specs (default `bash -e`); unstated. | Run each, collect exit codes, fail at end | Built | Reasoned |
| L11 | Low / Medium | G | P1 T8 / V6 | CRLF preservation has no byte check (lesson 2026-09-04). | Diff shows only branch lines; line-ending check | Records | Orchestrator verified CRLF at HEAD |
| L12 | Low / Medium | G | P2 Completion Criteria; P1 Agents line | Phase 2's gate omits billing although T1/T2 carry money assertions; Phase 1's compliance scope omits T1 (iii) copy, which compliance has reviewed twice. | Name them | Records | Plan text |
| L13 | Low / Medium | T-N1 | P2 T4 (10); AC5 | Per-persona report dirs make the `data/*.zip` exclusion and its AC grep vacuous. | `!playwright-report/*/data/*.zip`; match that line | Built | Reasoned |
| L14 | Low / Medium | T-N2 | P2 T4 (5) | `authUserId` into `$GITHUB_ENV` unvalidated. | Validate id shape | Built | — |
| L15 | Low / Medium | T-N3 | P2 T4; master Dependencies | Dispatch from any branch runs with the vendor key. | Protected environment or `refs/heads/main` guard, or a README residual | Built / Records | — |
| L16 | Low / Medium | T-N4 | P2 T5 | README should state the admin identity is local/ephemeral only. | One sentence | Records | — |
| L17 | Low / Medium | T-N5 | P1 T1 (ii) | Canonical-first changes which occurrence and bytes are cited for today's exact matches. | Exact first, canonical on miss | Built | `assemble.ts:268-272` |
| L18 | — | — | — | (merged into M7) | — | — | — |
| L19 | Low / Medium | B-N5 | Master Derived Budgets | Lower bound ≈11; worker schedule paths unnamed. | Derive bound | Records | — |
| L20 | Low / Medium | B-N6 + G | Master Exit Demo; P2 T4 (6) | Refusal count ambiguous; two re-dispatch rules; dispatch count unbounded. | Pin a cap | Records | — |
| L21 | Low / High | C-N1 | P1 T6 (v) vs w3c | w3c fixture shows `$4,000` beside "not listed here". | Wording or test comment | Built (copy) | — |
| L22 | Low / High | C-N2 | P1 T5 File(s) | Missing `studio-panel.tsx`/`run-copy.ts`; client panel cannot import `studio/copy.ts`. | Add; state where the sentence lives | Records | — |
| L23 | Low / Medium | C-N3 | P1 T5 | "could not be read" beside "activate a brain first". | Optional wording | Built | — |
| L24 | Low / High | C-N4 | P1 Least confident | Mis-map surfaces as `provenance`, no kind. | Name it — or adopt the runtime postcondition (convergence) | Records | — |
| L25 | Low / High | C-N5 | P1 AC9 | "two" comments; decision entry has no test. | Align; mark manual | Records | — |
| L26 | Low / Medium | C-N6 | P1 T1 pre-vendor sentences | No bar on a fix timeline; remedy "tell us" unnamed. | Add | Built (copy) | — |
| L27 | — | — | — | (merged into M5, B-N1) | — | — | — |
| L28 | Low / Medium | B-N2 | P1 T1 (iii) | Counts wrong (37 codes; 15 matches, not 13). | Replace counts with the list | Records | `copy.ts:128-221` 37 entries — confirmed |
| L29 | Low / High | B-N4 | P1 T1 (iii) | Shared `inference_unusable` edit contradicts "shared entries untouched"; unstated exception. | Name the exception | Records | — |
| L30 | Low / Medium | G | P2 Verification 2; T5 README | Repeated local runs can hit Better Auth's DB-backed 10 sign-ups/hour limit. | README note | Records | Limiter per tenancy report |
| L31 | Low / High | T-N9 + G | Master `:5`, `:136`; umbrella `:61` | Stale status lines. | Refresh | Records | Confirmed |
| Info | — | T-N6, T-N7, T-N8, B-N7, C-N7; G (config/price try-block coupling in T3) | various | Carried as recorded. | — | — | — |

(26 open Low items — L2, L5, L18 and L27 are merge markers.)

## Convergence diagnostic (gate-rules §5 — one bounded diagnosis, not a new verdict)

### Refusal-copy honesty (Phase 1 T1 (iii)) — batch 2 P1-2 → batch 3 billing C7/C3 + compliance C2 → batch 4 billing F1–F5 + compliance K1–K3

**Root cause: T1's scope, not the scan's mechanics.** T1 (iii) tries to make **static per-code copy guarantee a runtime money fact** — "this refusal never invites a re-press the product will refuse". Whether "try again" is true is a function of (code × producer step [pre-claim / 8a / 8b / 9] × tier × balance × pack availability × banner channel [voice run vs `?e=`]) — and of the **parked** included-build policy: if the owner decides a model-reply failure should not consume the build (as truncation already does, `llm/src/errors.ts:242-257`), today's "try again" becomes true. The design pushed that multi-factor fact through three lossy proxies — a producer classification (`PRE_CLAIM_CODES`, which got the claim step wrong), a phrase regex (a list, not a rule — lesson 2026-08-18) and a shared override table (which also serves another channel) — so every fix tightened one factor and exposed the next, and the batch-3 fix itself removed a true disclosure and forced the wrong table. The Deferral Ledger's "stuck Free creator" row is the same fact seen from the money side, and it is already routed to the parked plan.

**Smallest change that removes the class: stop making copy predict re-press economics in this goal.**
1. Delete from T1 (iii): the re-press scan, `PRE_CLAIM_CODES`, all `ONBOARDING_OVERRIDES` edits (drop `onboarding/copy.ts` from Files), w8.
2. **Kind sentences** say only which of the product's checks failed — static, product vocabulary. The 3 pre-vendor kinds (`ASSEMBLY_KINDS_PRE_VENDOR`) render their sentence *instead of* the shared detail (nothing was sent, nothing spent, the fault is the product's, "tell us", no timeline); the 13 post-vendor kinds render under it.
3. **`inference_unusable`**: title makes no claim that a model answered; detail removes only the false "most often a quote…" guess, **keeps** "Your run was still made, so it counted" (true for every post-vendor kind on every tier), and replaces "try again" with a pointer that is true on every tier and under any policy — "the price line above shows what another build costs and your balance" (`run-cost`, computed from `onboardingBrainPrices` and `getBalance`, rendered unconditionally, `run-inference-panel.tsx:89-90`). Test: counted-clause present for a post-vendor kind, absent for a pre-vendor kind; no "try again" in this one entry.
4. **Ledger row to the parked plan** (included-build policy, T6-P): list the 14 shared entries + the `workspace_paused` override whose "try again" is false for a Free creator with a consumed build (incl. `llm_attempt_recorded`, `provenance`, `brain_pointer_divergence`, `brain_content_walk`, `reference_echo`) and `unknown`'s "nothing was charged" after a rebuild debit, stating that their honesty depends on that policy decision.

**Does it leave this goal?** Only the sibling-code honesty moves, and it lands beside the ledger row that already owns the decision. **What Phase 1 still ships honestly:** the 16 closed kinds and source-parsed equality test; the tolerance; the content-free log with `assemblyKind`; the refused state carrying the kind; `data-code`/`data-assembly-kind` for Phase 2; kind sentences that are honest about exactly what they claim; `inference_unusable` without its false guess or false remedy, keeping its true spend disclosure. This dissolves M3, M4, M5, M7, M8, moves M6 to the ledger, and shrinks billing/compliance re-review to a handful of sentences and two assertions.

### Quote-provenance test strength (batch 3 M1–M3 → batch 4 T-CH1–3, T-N5, C-N4)

**Root cause:** mis-map detection was delegated to test properties that call `canon` — the thing under test — so every round found a direction (whitespace, over-tolerance, test-side vs imported) the properties could not see. **Class-removing design (stays in T1):** (1) exact `indexOf` first — today's behaviour byte-for-byte; (2) on a miss, a canonical match with a single `canon` built from an explicit code-point table (no `\s`, no `trim()`); (3) a **runtime postcondition inside `locateQuote`**: accept a canonical match only if `canon(slice) === canon(needle)` and the slice boundaries are non-whitespace unless the needle's are — otherwise return null → `quote_not_found` with a kind, so a mis-map fails closed and names its kind instead of surfacing as kindless `provenance`; (4) pin `canon` by an **exhaustive** check over every code point in `\p{White_Space}|\p{Pd}|\p{Pi}|\p{Pf}`, not a generated sample; (5) one witness (delete the postcondition, plant an off-by-one map → the stored-slice test reddens) replaces w2b/w2c/w2d. The M2 vacuity disappears because correctness no longer rests on a test's copy of `canon`.

### Other invariants with findings in both batches

- **`step-state-derived-not-assumed`** (C8 → CHANGE 4): cause — step derivation is prose against reads that fail differently. Fix — a pure `deriveOnboardingSteps({ownPosts: number|null, minOwnPosts: unknown, voiceActive: boolean|null, interviewSubmitted: boolean|null, hasGeneration: boolean|null})` where any null/non-finite → `unknown`, table-tested over the null/non-finite combinations; the page passes null only on the listed classes.
- **`honesty-blocks-never-folded`** (C5 → K4/K5): cause — hand-listed "outside" testids. Fix — set equality over testids inside `<details>` spans with a fixture rendering every honesty block, plus a positive control per panel.
- **`journeys-manual-or-nightly-only`** (C2 → CHANGE 6): cause — proven by grep. Fix — YAML-reading vitest with planted triggers.
- **Owner-only billing** (C6 → F6): cause — an assertion added without checking locator cardinality. Fix — scoped locator.

Per §5 a thinner usable slice is partial progress; the original scope stays owed unless the owner changes it.

## Least-confident probes

- **Phase 1 — "canonicalisation is what run 2 failed on": a plausible bet, honestly stated.** Supporting: solo posts use straight apostrophes (`solo-creator.spec.ts:40-41`) and run 1 succeeded where run 2 failed on the same posts, consistent with a nondeterministic curly apostrophe hitting `assemble.ts:372-379`; an NFC-only mismatch would have surfaced as `ProvenanceError` (the model's quote is stored at `:383`), not the observed `AssemblyError`. Gap: T1's own likeliest regression (a mis-map) would surface as kindless `provenance` (L24) — closed by the runtime postcondition above.
- **Phase 2 — "two-start bootstrap, compose Postgres, unauthenticated warm-up": mostly holds.** Compose container name, user, db and port match `db-shortcut.ts`; `--wait` + healthcheck exist; `ADMIN_USER_IDS` reaches both step-6 processes; the auth rate limit fits a fresh CI DB. The likeliest first failures are ones the line does not name: the restart race and step-5 cold compile (M9), then a strict-mode false failure on every run (M11). Docker availability on hosted runners and Compose `--wait` support are assumed (training knowledge, not verified).

## Owner decisions required before any Phase 1 implementation can start

1. **The T1 (iii) scope under §5:** (a) adopt the class-removing reduction above and route sibling-code remedy honesty and `unknown`'s money claim to the parked included-build policy row (recommended), or (b) keep the scan design and apply F1–F5/K1–K3, accepting that it has failed to converge twice.
2. **Authorise (or decline) one further evaluation.** Every Medium above changes what is built, so §9 row 4 and §3 require its reviewer, and both extensions are consumed. Minimum scope if (a) and the matcher redesign are adopted: tenancy (T1 matcher, T3, P2 T4), billing (the reduced T1 (iii) sentences, P2 T1/T2), compliance (T1 (iii) sentences, AC10/T7), and a generalist — or a split gate (Phase 1 now, Phase 2 later) if the owner prefers.
3. **What a model refusal does to the nightly:** should the operator's voice-build refusal fail the run or be recorded (M12)? This defines "green" for `journeys-no-persona-skips`.
4. **Exit-demonstration bound:** how many dispatches/refusals before the stuck-creator ledger row applies (L20).
5. **Accept or fix residuals:** dispatch from any branch with the vendor key (L15); the local known-password admin identity (L16); seed-pinned niche copy (B-N7); the pack-premise wording (M8) if not dissolved by (1a).
6. **Programme dependency:** creator-ready Phase 0 must reach READY and publish its baseline manifest (Phase 1's header precondition).

Nothing here reopens the R-68 text, the Phase 1 size acceptance, the UI-bootstrap direction or payment parking.

## Verdict

**NOT READY.** Ordered fix list: (1) owner decision on T1 (iii) scope → if (a), the reduction + ledger row (M3–M8, L28, L29); if (b), F1–F5 and K1–K3 as specified; (2) T1 matcher: exact-first, table `canon`, runtime postcondition, exhaustive code-point check, one witness (M1, M2, L1, L17, L24); (3) P2 T1/T2: scoped not-owner locator (M11); resolve the editor-on-refusal contradiction (M12); (4) P2 T4: port-release wait + step-5 warm-up/re-dispatch (M9), trigger vitest (M10), step-scoped key (L3), exclusion glob (L13), id validation (L14), per-spec exit collection (L10), anchored note match (L9); (5) P1 T3: pure step derivation, reuse `fetched`, non-finite minimum, count clamp (M13, L6); (6) P1 AC10/T7: set equality with full fixtures, positive control (M14, L4); (7) records-only batch L7, L11, L12, L16, L19–L22, L25, L30, L31; (8) an owner-approved re-evaluation scoped to the built edits, then creator-ready Phase 0 READY.

---

# Batch 5 (owner-approved third extension, 2026-09-15)

*Dispatch for every batch-5 slot: model inherit / no override requested (agent pin applies), read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Inputs: the plans as revised by the batch-4 disposition (master plan Plan Review Log). Reports condensed by the orchestrator; verdicts, findings, evidence cites and fixes unchanged.*

## Compliance plan review — respin-service-quality — batch 5 (lean merged run)

`plan gate ran lean (consolidated)`. **Readiness: Almost · Grade: B** — Option A implemented faithfully; every batch-4 compliance item closed or dissolved (K1 dissolved, remedy half partly closed via C-1; K2 dissolved; K3, K4, K5 closed — K5 with a residual of the same class, C-2; N1–N6 closed; N4 dissolved by decision 4; N7 carried). Counts: 0 BLOCK · 2 CHANGE · 6 NOTE. Checks: kill-test honesty holds (residuals C-1, C-2); no invented specifics holds; no guarantees holds; no automation/concealment holds; sources/similarity/minimum-difference/autopsy n/a.

| # | Sev / conf | Plan location | Code evidence | Issue | Fix |
|---|---|---|---|---|---|
| **C-1 CHANGE** | Medium / Medium (no-refresh reasoned, not run) | P1 T1 (iii)(c); AC3; master Decisions :43 | `onboarding/page.tsx:214-239` reads price and balance once at render; `run-inference-panel.tsx:89-90` prints them; `onboarding/actions.ts:321-331` returns `{status:"refused"}` with no balance and no `revalidatePath` (only `results/actions.ts`, `trends/actions.ts` call it); `run-copy.ts:50,69` | The pointer "shows what another build costs and your balance" is claimed true on every tier and policy but, after a post-vendor refusal on a paid rebuild (debit committed), the line shows the pre-press balance — overstated by the debit, compounding across presses; with a failed balance read it shows none. The refusal's only way forward can point at a wrong money number. Overlaps billing. | (a) word it true ("…what a build costs; it was read before this run, so your current balance is on the usage page"), or (b) `revalidatePath("/onboarding")` on the voice-run refusal branch; assert in AC3 (a) or an action test (b); drop "and your balance" from the every-tier claim. |
| **C-2 CHANGE** | Low / High | P1 AC10; T7; `honesty-blocks-never-folded` | Testid-less honesty sentences: `generation-outcome.tsx:485, 505-509, 518-522`; `studio-panel.tsx:349-352, 368-371`; `first-ideas-panel.tsx:127-130`. State-conditional testids: `studio-frameworks-not-used` (`:80-88`, fixture `privateFrameworksNotUsed: 0`, `studio-ui.test.tsx:278`), `studio-why-withheld` (`:240`), `studio-blocked`/`studio-no-modes` (`studio-panel.tsx:225,233`), `studio-refusal` (`:415`), `first-ideas-blocked`, `first-ideas-count-note` (`first-ideas-result.tsx:65`) | Set equality sees only rendered testids and AC10 requires only span count ≥ 1, so wrapping a testid-less sentence in a second `<details>`, or folding an element absent from both fixtures, passes green (lesson 2026-08-26). | (1) exact `<details` span count (1 per surface) and span text equals the folded sentences; (2) state-independent source check: `<details` 0 times in `generation-outcome.tsx`/`first-ideas-result.tsx`, exactly once in `studio-panel.tsx`/`first-ideas-panel.tsx`; (3) fixture variants for blocked, withheld-why, frameworks-not-used > 0, count-note, or name them covered by (2); plant w6b. |
| N-a | Low / High | P1 Completion Criteria | line 36, master :31 | Completion still says compliance PASS "(T5–T7)". | "(T1 (iii), T5–T7)". |
| N-b | Low / Med | P1 T7 w7c | `studio-panel.tsx:129-136` two `useActionState` calls | "its `useActionState` call" ambiguous; a raw count is satisfied by a comment. | Name the generate-action call; count destructure + argument. |
| N-c | Low / Med | P1 T5 (L23) | `DESIGN.md:54,75`; `studio/page.tsx:143-147` | "could not be read" block reason names no remedy. | Add "reload this page"; add the block-reason case to AC8. |
| N-d | Low / Med | P1 AC3 | — | "no timeline word such as 'soon'" is a word list. | Assert each pre-vendor sentence by exact string. |
| N-e | Low / High | P1 T5 scope | `onboarding/first-ideas/page.tsx:111-124,199-200` | First-ideas has the same failed-courtesy-read defect L23 fixes on Studio (fix the class). | Same `boolean \| null` there, or a Deferral Ledger sibling row. |
| N-f | Info / High | P1 AC10 first-ideas usable | — | "the five outcome testids" unnamed. | List them. |

Commands run: none. **Verdict: NEEDS CHANGES.**

## Billing plan review — respin-service-quality — batch 5

**Readiness: Almost · Grade: C** — Option A dissolves every batch-4 scan defect; the new price-line pointer is false after a rebuild debit, "under any policy" overclaims, the ledger list misses two false money claims, and the not-owner locator fails on the paid path. Counts: 0 BLOCK · 7 CHANGE · 4 NOTE; no fix needs a billing, Stripe, ledger, rollout or included-build change.

Batch-4 resolution: F1 dissolved (8a claim named in M:66); F2 closed (new pointer defect C1); F3 closed (gate list incomplete, N1); F4 dissolved; F5 routed, partial (C3); F6 partial — Free path correct, paid path fails (C5); N1 closed; N2, N3 dissolved; N4 closed; N5 closed; N6 closed (counting scope C6); N7 open (fix C4); N8 closed by decision (5). Checks: B1 holds; B2 n/a; B3 holds (pre-vendor kinds at `infer-voice.ts:207` before `:214`; post-vendor at `:236` after 8b `inference.ts:869-884` and step 9 `:927-973`); B4 holds; B5 T8 condition live, sentence seed-pinned (C4); B6 view gate asserted, action gate cited, paid-branch locator breaks (C5); number provenance holds for every opened cite; B7 w8 reddens, pointer truth untested (C1).

| # | Type | Sev | Conf | Plan location | Code evidence | Fix |
|---|---|---|---|---|---|---|
| C1 | CHANGE | Medium | High | P1 T1 (iii)(c) pointer; AC3 | Price line rendered once (`onboarding/page.tsx:233-239,399-403`), passed as a prop (`run-inference-panel.tsx:89-90`); no revalidate in `onboarding/`; refused state carries no balance (`run-state.ts:83`, `actions.ts:321-331`); a rebuild debits 50 at step 9 before the parse fails; unreadable price/balance branches (`run-copy.ts:49-50,69`) | Reword true on every branch, e.g. "The line above this control states what a build costs; any charge for this run is in your credit history on the usage page."; AC3 case for the unreadable-price branch. |
| C2 | CHANGE | Low-Med | High | P1 T1 (iii) "true … under any included-build policy"; M:43 | T6-P proposal "no customer debit when a terminal quality refusal produces no usable deliverable" (`02_Remediation_Plan.md:123`) | State the clause is true under today's settlement (8b, 9); add the "counted" clause and pointer to M:66 as policy-dependent copy; w8 warns the T6-P implementer. |
| C3 | CHANGE | Low-Med | High | M:66 ledger list | `writeBrainDoc` runs after the debit (`infer-voice.ts:256-274`); `provenance` "no credits were spent" (`billing-errors.ts:1028`); `reference_echo` via `NOTHING_SAVED_CLAUSE` (`refusal-clauses.ts:31-32`, `billing-errors.ts:1130`) — false after a rebuild debit | List every money clause, not only re-press wording, per post-claim code; add these two. |
| C4 | CHANGE | Medium | Med | P1 T8 copy; M:44, M:67 | Block condition and gate read the live allowance (`app-server.ts:642-650`, `trends/actions.ts:99-108`); only the plan-list sentence is seed-pinned (`seed.ts:84`) | Drop the plan list: "This workspace's plan does not include tracking niches. The billing page shows what this workspace is on today."; allowance-driven T8/AC11 tests; closes M:67. |
| C5 | CHANGE | Low | High | P2 T1 locator; AC1 | `subscribe-*` renders only without a live subscription (`billing-view.tsx:375-432`); with `E2E_PAID_TIERS=1` the operator upgrades (`studio-operator.spec.ts:38-55`) before provisioning the editor (`:130-137`) | Scope to `buy-pack` (renders in both branches, not-owner reason first via `baseBlock`, `:438-454`). |
| C6 | CHANGE | Low | Med | M § Exit Demonstration; P2 T2 | Repeated `run_slot_busy`/`server_at_capacity` (`inference.ts:740`) or pre-vendor kinds (`infer-voice.ts:207`) consume no build | Count only build-consuming post-vendor refusals toward the stuck-creator stop; pre-vendor refusals are product-defect notes. |
| C7 | CHANGE | Low | High | P1:36 Agents; P1 Completion Criteria | T1 (iii) rewrites a money claim in `billing-errors.ts` | Add T1 (iii) to the billing reviewer's scope in both places. |
| N1 | NOTE | Low | High | P1 Failure Modes row 1; M:65 | Pack also refused while an auto-top-up is pending (`stripe/actions.ts:976-979`) and with no mapped pack price (`:988`; `seed.ts:74`) | "…until the rollout is active and a pack price is mapped". |
| N2 | NOTE | Low | High | M:66 pre-vendor list | `inference_role`, `profile_archived`, `config_not_migrated`, `unpriced_operation`, `uncharged_attempt_cap`, `topup_reconciliation_required` etc. absent (`onboarding/copy.ts:128-222`) | "every other listed code keeps its copy". |
| N3 | NOTE | Low | High | P2 T2 rationale | Pre-vendor kinds carry `data-assembly-kind` without a claim | Limit the 8b reason to the 13 post-vendor kinds. |
| N4 | NOTE | Low | Med | M Derived Budgets | Row is per run; vendor limit sized for the demonstration | Optionally "≤ 3 × 17 = 51 calls before SDK retries". |

Not found: a spent claim on a pre-vendor kind; a retry reaching the vendor; spend above 17 on a refused path; any metering/allowance/checkout edit. Commands run: none. **Verdict: NEEDS CHANGES.**

## Tenancy plan review — respin-service-quality — batch 5

**Readiness: Almost · Grade: C** — batch-4 fixes largely hold and the redesigned matcher can only ever store the creator's own bytes; six fixable defects remain, led by an unwitnessable postcondition and a `main` guard that does not keep the vendor key from branches. Counts: 0 BLOCK · 6 CHANGE · 6 NOTE.

Batch-4 resolution: C1 dissolved by decision (4) but the same gap recurs on the postcondition (CHANGE 1); C2 closed; C3 closed with residual (CHANGE 3); C4 closed (missing-field mock reaches the non-finite branch; `onboardingBrainPrices` does not throw, `included-build.ts:204-222`, `inference.ts:414-438`); C5 closed (residual NOTE 3); C6 closed with residual (CHANGE 6); C7 closed with residual (NOTE 2); N1 closed; N2 text closed, behaviour wrong (CHANGE 5); N3 implemented but not protective (CHANGE 4); N4–N9 closed. Checks: 1 scoping holds (`ProfileScope.mint` `with-workspace.ts:2735-2743`, `generationsNewest` `:2466-2476`, registrations verified); 2, 4, 5 n/a; 3 provenance holds for correctness (`validateSourceEvidence` `:5685-5741`, `quote` unbounded `:2925`; today stores `v.quote`, `assemble.ts:383`); 6 roles/admin holds (`db-shortcut.ts:17-23`); 7 secrets gaps (CHANGE 4, 5, NOTE 2); 8 provenance gaps (three unbacked claims).

| Sev | Severity / confidence | Plan location | Code evidence / finding | Fix |
|---|---|---|---|---|
| CHANGE 1 | Medium / High | P1 T1 (iv) one witness; V7 w2b; AC2; risk `quote-mis-map-fails-closed-with-kind` | (a) w2b deletes the postcondition *and* plants an off-by-one — literal fixtures redden on the off-by-one alone; deleting only the postcondition leaves every test green (lesson 2026-08-26), yet AC2 credits w2b with the failure path. (b) The generative property holds for any in-bounds slice and for a map-back that refuses every canonical match. (c) No canonical-branch literal fixture for mixed-run paragraph tokens; the verbatim `\n\n` fixture takes the exact branch (`assemble.ts:270`). | Give `locateQuote` a defaulted map-back seam; test an off-by-one mapper (into non-whitespace and whitespace) → `quote_not_found` via `parseVoiceReply`; witness = delete the postcondition → that test red. Generative property: build the model quote from a known range with non-whitespace ends by table substitutions; assert non-null and offsets `=== [s,e)` when exact misses and the canonical needle is unique. Add mixed-run canonical fixtures. Or record the postcondition as untested defence in depth and drop the claims. |
| CHANGE 2 | Low-Med / High | P1 Edge Cases rows 2–3; T1 (iv) whitespace-only fixture; AC2 | Exact branch is today's behaviour: `locateQuote(" ")` returns a range for any post containing a space; only an empty needle is refused (`assemble.ts:269-272`). The whitespace-only `quote_not_found` holds only in the canonical branch, and a `" "` quote backs a value with no evidence (REQ-B02). | Refuse before the exact branch any needle empty after trimming the table's whitespace set, named as a deliberate narrowing; fixture post contains the whitespace verbatim. |
| CHANGE 3 | Low / Medium | P1 T1 (iv) exhaustive check; AC2 | (a) Covered classes miss likely look-alikes: U+2032 (Po), U+02BC (Lm), U+FF07 (Po), U+00B4 (Sk), U+2212 (Sm), U+200B/U+00AD (Cf). (b) Step (3) trims, so `canon(" ")` is `""`, not the table entry — a correct implementation fails the check as written. | Enumerate every scalar value U+0000–U+10FFFF (skip lone surrogates); probe `canon("a"+cp+"b") === "a"+expected+"b"` (table entry; single space for U+0020/U+0009/U+000A; else the code point). |
| CHANGE 4 | Medium / Medium-High (GitHub behaviour recalled, not re-verified) | P2 T4 `if:` guard; P2 `:40`, `:47`; T5 README; master `:56` | (a) `workflow_dispatch` uses the workflow file from the selected ref, so a branch can delete the `if:`. (b) A repository secret is readable by any workflow triggered on any branch (`cutdown.yml`, `respin.yml`, or a new file). (c) The trigger test checks only `respin.yml`; the population is the whole `.github/workflows/` directory (non-negotiable 7). | Store `ANTHROPIC_API_KEY` only as an environment secret on a GitHub Environment (e.g. `journeys`) with a `main`-only deployment-branch policy, no repository secret; job declares `environment: journeys`, keep `if:` as courtesy; owner prerequisite at master `:56`; trigger test asserts `environment: journeys` and that no other workflow file names the key; reword claims. |
| CHANGE 5 | Low / High | P2 T4 step (5); AC5 | `^[A-Za-z0-9_-]+$` accepts `null`; `ADMIN_USER_IDS=null` fails later at `platform-admin.spec.ts:70`, not in step 5; AC5 is a grep. | `jq -er '.authUserId \| strings'` and reject literal `null`, or correct the sentence; name it in AC5. |
| CHANGE 6 | Low / Medium | P2 T4 trigger test; AC4 | Flow form `on: [workflow_dispatch, push]` or quoted `"on":` yields an empty key set, a vacuous subset. | Assert the `on:` block exists, is non-empty, contains `workflow_dispatch`; fail on any other `on` form; plant flow and quoted forms. |
| NOTE 1 | Low / High | P1 T1 (iv) literal fixtures | Canonical-branch fixtures can exact-match (e.g. `"Hello "` in `"Hello world"`). | Each asserts `content.indexOf(needle) === -1` first. |
| NOTE 2 | Low / Medium | P2 T4 key scope claim | Step-6 processes live through steps 8–10 with the key; upload action runs as the same user (`/proc/<pid>/environ`). | Group-kill before step 8 (`if: always()`), pin actions by SHA, or narrow the claim. |
| NOTE 3 | Low / Medium | P2 T4 step (5) port loop | `curl` without timeout can hang on a dying server. | `--connect-timeout 2 --max-time 5`, loop until exit 7. |
| NOTE 4 | Info / Medium | P1 T1 (iv) mutation property | Mutation may occur elsewhere in the post, or a case flip may be a no-op. | Assert the mutated needle absent exactly and canonically first. |
| NOTE 5 | Info / Medium | P1 V7 w5c; AC6 | w5c reddens only if the P4 profile has no generations of its own. | State it in the fixture. |
| NOTE 6 | Info / Medium | P1 T3 | `fetched` is `[]` whenever `selectedProfile` is null (`page.tsx:256-264`). | Key the header on `selectedProfile !== null`. |

Not found: the model's quote stored; a `validateSourceEvidence` edit; new `packages/db` query text; a scope minted from an untrusted id; a driver error class in `app/**`; widened scripts auth lint; `ADMIN_USER_IDS` exported before bootstrap; the key visible to bootstrap or install; any reopened batch-3/4 closure. Commands run: none. **Verdict: NEEDS CHANGES.**

# Plan review — respin-service-quality — batch 5 generalist (final slot)

*Dispatch: `plan-reviewer`, model inherit / no override requested, "think hard", read-only tools (no Bash); resolved model and effort not exposed. Inputs frozen as reserved, plus the three batch-5 specialist reports. Condensed by the orchestrator; verdict, severities, findings and fixes unchanged. `plan gate ran lean (consolidated)` (compliance lean; tenancy and billing full).*

**Readiness: Not yet · Grade: D** — Medium count 14 → 7; T1 contradicts itself twice, the new price-line pointer shows a wrong balance, and the `main` guard does not keep the vendor key from branches.

Counts (deduped): 0 High · 7 Medium · 25 Low · 6 Info (new here: 3 severity raises, 8 Low, 1 Info). Normalisation: "Low-Med" → Medium (tenancy CH2 → M5, billing C2 → M6, billing C3 → M7). Dedupe: billing C1 = compliance C-1 (M2); billing C7 = compliance N-a (L8).

Batch-4 closure: 34 closed (2 with fix-induced defects: M4 → M2 pointer; L17 → M5 contradiction), 7 partly (M1, M6, M11, L12, L14, L15, L20), 4 dissolved, 2 carried, 0 not closed. §16 accounting holds (47 = 45 + 2); every opened P1/P2/M line and code cite matches, except **L12 recorded as applied but only partly applied** (P1:36 billing scope, P1:209 Completion).

| ID | Sev | Source | Location | Finding | Fix | Built / records |
|---|---|---|---|---|---|---|
| M1 | Medium | T CH1 | P1 T1 (iv); V7 w2b; AC2/AC12 | Postcondition has no isolated witness; generative property holds for any in-bounds slice; no canonical-branch mixed-run fixture | Export the postcondition as a pure predicate `acceptCanonicalMatch(content, needle, start, end)`, literal wrong-range table (non-whitespace, whitespace, mid-surrogate); witness "predicate returns true → table red"; mixed-run canonical fixtures | Built (tests) |
| M2 | Medium | B C1 = C C-1 | P1 T1 (iii)(c); AC3; M:43 | Pointer "shows … your balance" false after a rebuild debit and on unreadable branches (`onboarding/page.tsx:223-239`, `run-copy.ts:49-50,69`, `actions.ts:321-331`) | Location-only: "Any charge for this run is in your credit history on the usage page." (precedent `run-outcome.tsx:127`); AC3 unreadable-price case | Built (copy) |
| M3 | Medium | T CH4 | P2 T4 guard; P2:40,:47; T5; M:56 | `if:` guard lives in the dispatched ref; repository secret readable from any branch; test checks only `respin.yml` | `main`-only `journeys` Environment secret, no repository secret; `environment: journeys`; test asserts it and key absence across `.github/workflows/`; correct claims | Built + owner prerequisite |
| M4 | Medium | B C4 | P1 T8 copy; M:44, M:67 | Seed-pinned plan list; off-parked-path fix exists | "This workspace's plan does not include tracking niches. The billing page shows what this workspace is on today." | Built (copy) |
| M5 | Medium | T CH2 | P1 Edge Cases 2–3; T1 (iv); AC2 | Exact-first accepts a single-space quote; the whitespace-only fixture expects `quote_not_found` (`assemble.ts:148,269-272`) | Owner choice: (a) refuse whitespace-only needles before exact (narrowing decision 4) or (b) limit the fixture to the canonical branch | Built |
| M6 | Medium | B C2 | P1 T1 (iii); M:43; risk description | "under any included-build policy" false under T6-P (`02_Remediation_Plan.md:123`) | Scope to today's settlement (8b, 9); list clause and pointer in M:66 | Records (+ledger) |
| M7 | Medium | B C3 | M:66 | Ledger lists re-press wording, not money clauses (`billing-errors.ts:1028,1130`, `refusal-clauses.ts:31-32`, `infer-voice.ts:236,256-274`) | Enumerate every money/re-press clause over `ONBOARDING_ERROR_CODES` × voice-build producers | Records (ledger) |
| L1 | Low | T CH3 | P1 T1 (iv) | Probed classes miss look-alikes; trim fails a correct canon on single whitespace | Probe `canon("a"+cp+"b")` over all scalars | Built (tests) |
| L2 | Low | G | P1 Edge Cases 2 | Paragraph token representation unpinned (U+2029 collision) | Pin as U+000A; U+2029 post + `\n\n` needle → `quote_not_found` | Built |
| L3 | Low | C C-2 | P1 AC10, T7 | Set equality blind to testid-less sentences / a second `<details>` | Source-level `<details` count per file; exact span text; w6b | Built (tests) |
| L4 | Low | T CH5 | P2 T4 (5); AC5 | Regex accepts `null` (unreachable from this producer, `platform-admin.spec.ts:45-47`) | Extract with jq's error-on-null mode and reject `null`, or correct the sentence | Built |
| L5 | Low | T CH6 | P2 trigger test | Flow/quoted `on:` passes vacuously | Require block form containing `workflow_dispatch`; plant both | Built (tests) |
| L6 | Low | B C5 | P2 T1; AC1 | `subscribe-*` absent on the paid path (`billing-view.tsx:375-454`) | `buy-pack` | Built (tests) |
| L7 | Low | B C6 | M Exit Demo; P2 T2 | Pre-vendor refusals count toward the stuck-creator stop | Count only build-consuming post-vendor refusals | Records |
| L8 | Low | B C7 = C N-a | P1:36; P1:209 | Reviewer scope lines out of step with M:29/:31 | State once, cite from both | Records |
| L9 | Low | G | M Exit Demo | No outcome when 3 dispatches yield no pair and fewer than 2 refusals | State it (e.g. Phase 2 stays Not yet; owner decides) | Records |
| L10 | Low | G | P1 AC3 vs T3 | AC3 "copy.ts unchanged" vs T3 header copy home (`onboarding-view.tsx:34`) | Scope AC3 to the error-code tables, or name the header copy home | Records |
| L11 | Low | G | M:52, M:56; umbrella :63 | Stale "42 rows / ~48 files"; "record (or decline) size acceptance" | Refresh | Records |
| L12 | Low | G | M:66 last cell | `llm_unavailable`/`llm_truncated` labelled pre-vendor-only (`inference.ts:753-855`) | Relabel "no build consumed, no debit" | Records |
| L13 | Low | G | umbrella :85; M Derived Budgets | Hosted-runner minutes unnamed as recurring cost | Add estimate and ceiling | Records |
| L14 | Low | G | P2 T3/T2; AC1 | Main-chapter names unlisted; AC1 evidence cannot exist on the green refused branch | List four main chapters reachable on every green branch | Built (tests) |
| L15 | Low | B N1 | P1 Failure Modes 1; M:65 | Pack refused during a pending top-up / unmapped price | Add both | Records |
| L16 | Low | B N2 | M:66 | Incomplete "keep their copy" list | "every other listed code keeps its copy" | Records |
| L17 | Low | B N3 | P2 T2 | 8b reason applied to pre-vendor kinds | Limit to the 13 post-vendor kinds | Records |
| L18 | Low | C N-b | P1 T7 w7c | Two `useActionState` calls | Name the generate call; count destructure + argument | Built (tests) |
| L19 | Low | C N-c | P1 T5 | No remedy in the could-not-be-read reason | "reload this page"; AC8 case | Built (copy) |
| L20 | Low | C N-d | P1 AC3 | Timeline word list | Exact strings | Built (tests) |
| L21 | Low | C N-e | P1 T5 scope | First-ideas sibling defect (`first-ideas/page.tsx:111-124`) | Same fix or ledger row | Built |
| L22 | Low | T NOTE 1 | P1 T1 fixtures | Canonical fixtures may exact-match | `indexOf === -1` precheck | Built (tests) |
| L23 | Low | T NOTE 2 | P2 T4 | Step-6 processes hold the key through steps 8–10 | Kill before step 8 / pin by SHA / narrow claim | Built |
| L24 | Low | T NOTE 3 | P2 T4 (5) | `curl` without timeout | `--connect-timeout 2 --max-time 5` | Built |
| L25 | Low | G | P1:57 vs :197; P2:47-48 vs :135 | Invariant slug parity (8 vs 11; 2 vs 3) | Add the four new slugs to the checklists | Records |
| I1–I6 | Info | B N4, C N-f, T N4–N6, G | various | 51-call demonstration ceiling; unnamed testids; mutation absence; w5c fixture; header keyed on `selectedProfile`; batch-4 "26 vs 27 Low" miscount | as stated | mixed |

Execution simulation: P1 — T1 AMBIGUOUS ((iv) not executable as written: M5, L1b, M1); T2, T4, T6 PASS; T3, T5, T7, T8 PASS\*; Phase 1 externally blocked (creator-ready Phase 0 NOT READY). P2 — T3 AMBIGUOUS (L14); T1, T2, T4, T5 PASS\*.

Pre-mortem: batch-4 rows mostly absorbed; new gaps 31 stale balance (M2, plan causes it), 32 key readable from branches (M3), 33 whitespace quote (M5), 34 token collision (L2), 35 loosened exhaustive check (L1b), 36 niche plan list (M4), 37 T6-P "counted" (M6), 38 exhausted dispatches (L9), 39 operator main chapter (L14), 40 first-ideas signpost (L21).

§5 convergence diagnostic: six invariants recurred batch 4 → batch 5 — (1) quote-matcher witness strength (same class, third round: a control with no isolated failure path; residue is test strength, not a leak), smallest change: exported postcondition predicate + wrong-range table, LF token, all-scalar probe, owner whitespace decision; (2) refusal-copy truth (much reduced; a runtime quantity and a policy prediction entered the copy; ledger again a one-wording list), smallest change: copy never names a quantity or policy-conditional truth, ledger enumerates the population; (3) fold-check completeness, smallest change: source-level `<details` count; (4) dispatch/key protection, smallest change: Environment secret (owner) + whole-directory, block-form-only test; (5) owner-only locator, smallest change: `buy-pack`; (6) gate scope lines, smallest change: state once and cite. Exit bound: new properties, not a recurrence. Step-state derivation: converged. Every smallest change is a wording edit or one test; none adds a phase or document.

Owner decisions required: (1) authorise or decline one more evaluation (M1–M5 change what is built; minimum scope tenancy, billing, compliance, generalist) or stop with the residual recorded; (2) whitespace-only quotes (M5); (3) `main`-only Environment secret (M3); (4) generic niche sentence (M4, reverses a baked decision, closes the open finding); (5) exit-bound counting and exhaustion outcome (L7, L9); (6) creator-ready Phase 0 B5-1 reading.

Commands run: none. **Verdict: NOT READY.** Ordered fixes: T1 matcher (M1, M5, L1, L2, L22, I3); T1 (iii) copy and ledger (M2, M6, M7, L12, L15–L17); P2 key protection (M3, L4, L5, L23, L24); T8 copy (M4); P2 T1/T3 (L6, L14); AC10/T7 (L3, L18); exit demonstration (L7, L9); records-only (L8, L10, L11, L13, L19–L21, L25, I1, I2, I4–I6); then an owner-approved re-evaluation and creator-ready Phase 0 READY.

# Batch 6 (owner-approved fourth extension, 2026-09-15)

*Dispatch for every batch-6 specialist slot: model inherit / no override requested (agent pin applies), read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Inputs: the plans as revised by the batch-5 disposition (master plan Plan Review Log). Findings tables, verdicts, severities and evidence cites recorded verbatim; the per-check narrative and coverage lists are condensed by the orchestrator. **Method disclosure (gate-rules §1):** the billing reviewer reports one stray no-op `echo skip` Bash call, and the tenancy reviewer two read-only Bash calls (`ls .github/workflows/`, one `grep -o` to read a plan line Grep elided), each against a read-only brief. Nothing was written; every finding below is sourced from Read/Grep/Glob. Disclosure is the expected outcome and is not itself a finding; the reports stand.*

## Tenancy plan review — respin-service-quality — batch 6

**Readiness: Almost · Grade: C** — four of six batch-5 items properly closed and nothing in the plan leaks, but the postcondition's *call site* is still unwitnessed (fourth round of that class), the new positive property can pass on zero cases, and the key's protection now rests on an owner-side setting no run can distinguish from the old one. Counts: **0 BLOCK · 5 CHANGE · 5 NOTE**.

Batch-5 closure: CHANGE 1 **partly** ((a) closed — `acceptCanonicalMatch` is a pure exported predicate with a literal wrong-range table and w2b mutates the predicate alone; (c) closed — mixed-run fixtures with `indexOf === -1` prechecks; (b) not closed, plus a new gap); CHANGE 2 **closed** (refusal before the exact branch, matches `assemble.ts:268-272`); CHANGE 3 **closed** (all-scalar in-context probe, seven look-alikes, trim problem gone — but a new contradiction in the rule it probes); CHANGE 4 **closed in text** (verified against the tree: `respin.yml:5-14` is `push`/`pull_request`, and **no** workflow today names `ANTHROPIC_API_KEY`, `environment:` or `playwright`); CHANGE 5 **closed** (`jq -er '.authUserId | strings'` then the shape regex; `-e` exits non-zero on `null` and on a missing key); CHANGE 6 **closed**; NOTE 1, 2, 4, 5, 6 **closed** (NOTE 6 verified sound against `onboarding/page.tsx:136-141` — `step` is `paste-posts` whenever a profile exists, so the "unknown elsewhere" branch is unreachable while the header renders); NOTE 3 **closed for steps 5 and 8**, step 6 still untimed.

| Sev | Severity / confidence | Plan location | Code evidence | Fix | Built or records |
|---|---|---|---|---|---|
| CHANGE 1 | Medium / High | P1:107 T1 (ii)/(iv); P1:177 w2b; AC2 last clause; AC12; risk slug `quote-mis-map-fails-closed-with-kind` (P1:198) | w2b proves the **table tests the predicate**, not that **`locateQuote` obeys it**. With a correct map-back the predicate can never return `false`: the needle is trimmed, so the canonical match's first and last characters are non-whitespace and map to non-whitespace originals, and `canon(slice) === canon(needle)` holds by construction (`assemble.ts:264-273` + Edge Cases row 2 steps 1–3). So deleting `if (!acceptCanonicalMatch(...)) return null;` leaves every named test green, and AC2's "a canonical match the predicate rejects surfaces as kind `quote_not_found`" **cannot be constructed** — there is no stated mechanism to produce a rejected match. Fourth round of this class (batch 3 C1 → 4 C1 → 5 CHANGE 1) | Restore the one thing the redesign dropped: a **defaulted map-back parameter** on `locateQuote`, so a test injects an off-by-one mapper, drives a real `quote_not_found` through `parseVoiceReply`, and witness **w2e** ("delete the predicate call → that test red") exists. Otherwise record the call site as untested defence in depth and delete AC2's end-to-end clause and the slug's postcondition credit | Built (one parameter + one test) |
| CHANGE 2 | Medium / High | P1:107 T1 (iv) positive canonical clause; AC2 | The clause asserts non-null **only** "in the cases where the exact `indexOf` misses and the canonical needle occurs exactly once" — a guard with **no stated minimum of qualifying cases**, so the clause passes on zero (lesson 2026-08-26). Its own example strategy makes that likely: "table substitution only (straight↔curly quote, hyphen↔dash, **space↔NBSP**…)" — U+00A0 is **not** in the table and is named must-not-fold twice (P1:64, AC2), so a space→NBSP needle has **no** canonical match, is excluded by the guard, and an implementer who takes the example as authoritative widens `canon` and fails w1b | Name the substitution set as exactly the table's (straight↔curly, hyphen↔en/em dash, space↔tab, run-length changes) — delete "space↔NBSP" — and assert the number of guard-qualifying cases is ≥ a stated floor, failing when it is zero | Built (tests) |
| CHANGE 3 | Low-Med / High | P1:64 Edge Cases row 2, step (2) | The paragraph-token rule is stated **twice, incompatibly**, in one sentence pair: "a maximal run … containing **two or more** U+000A becomes one paragraph token … any other maximal run becomes one U+0020", then (the L2 fix) "**every whitespace run containing U+000A** becomes the token". A single `\n` folds to a space under the first and to the token under the second — and both the "single `\n`" literal fixture and the exhaustive probe's expected value ("a single space for U+0020, U+0009 **and U+000A**", AC2) pin the first reading | Delete the second phrasing (the collision argument survives: under the ≥2 rule every surviving U+000A *is* a token) | Records |
| CHANGE 4 | Low-Med / Medium-High (GitHub semantics recalled, not re-verified) | P2:88 T4 key paragraph; P2:47 invariant; AC4; master `:56` | The protection now rests on two owner-side facts, one of which is **invisible to the repo and to the run**: "no repository secret of that name exists". A repository secret is issued to every job in the repo, so a green first dispatch looks identical whether the owner deleted it or not, and the whole `main`-only property silently reverts. The trigger test proves the *file* side only. There is a cheap in-repo witness | Add a second job in `respin-journeys.yml` with **no** `environment:` that fails when `secrets.ANTHROPIC_API_KEY != ''` (environment secrets are not issued to it; a repository secret is), and have the trigger test assert that job exists — the owner prerequisite then has a running proof, per golden rule 1 | Built (workflow + test) |
| CHANGE 5 | Low / High | P2:88 T4 "**What an uploaded artifact can contain, stated once**" | The list was built from two producers (`_handoff/` contents, report fill titles), not by walking every writer into the uploaded tree. The bootstrap run writes the admin identity's **email and Better Auth id** — the run's `ADMIN_USER_IDS` value — as a plain note into the uploaded `artifacts/platform-admin/console.log` (`platform-admin.spec.ts:49` → `artifacts.ts:79-80`), and repeats the id in the `test.skip` reason (`:51-54`), which lands in the uploaded `playwright-report/bootstrap`. Impact is low (ephemeral runner database) but the recorded enumeration is false as written — non-negotiable 7 | Add the sentence (console logs carry the admin identity's email and Better Auth id), or have the bootstrap note the email only; state that the id is the run's admin allowlist value for a database that dies with the runner | Records (or one spec line) |
| NOTE 1 | Low / High | P1:65, T1 (ii) | The narrowing's population is the table's three code points, so `locateQuote(" ")` or `"　"` still returns a range and can back a value with evidence quoting nothing — the same REQ-B02 shape the narrowing closes for `" "` | Either use `\p{White_Space}` **for the refusal test only** (not for `canon`) or state the residual explicitly | Records |
| NOTE 2 | Low / Medium | P2:88 T4 step (6) | Steps (5) and (8) now carry `--connect-timeout 2 --max-time 5`; step 6's readiness loop is still "a curl loop … until 200, up to 3 minutes" with no timeouts — the same hang NOTE 3 named | Same flags | Records |
| NOTE 3 | Low / Medium | P2:88 trigger test; P2:47 | The asserted population is "files **naming** `ANTHROPIC_API_KEY`". A workflow reaches an environment secret without naming it — `environment: journeys` plus `${{ toJSON(secrets) }}`. Only `main` can deploy to the Environment, so the exposure needs main write access, but the list is one producer short | Add: no other workflow file declares `environment: journeys`, and none dumps `toJSON(secrets)` | Built (test) |
| NOTE 4 | Low / High | P2:119 Verification 4 | Pre-M3 wording: "requires the `ANTHROPIC_API_KEY` secret configured" — does not say environment secret on `journeys`, nor that the dispatch must be on `main` (master `:56` does) | Restate to match T4/T5 | Records |
| NOTE 5 | Info / High | P1:193 AC11 (billing's path, flagged for the record) | AC11 still reads "the tier-block copy equals the plan list derived from `CONFIG_V1_SEED.trackedNiches`", contradicting M4/T8's "names no plans" sentence and T8's own test ("contains no tier name") | Rewrite AC11 to the static sentence; billing owns it | Records |

Checks: single scoping helper **holds** (`hasGenerationForProfile` composes `generationsNewest` inside the profile seam, `with-workspace.ts:2466-2476`; `ProfileScope.mint` refuses a non-UUID at `:2735` and converts access-check failure to `ProfileAccessError` at `:2736-2743`); mechanism-level stripping **n/a**; append-only brains and provenance **holds for what is stored, gapped for what is proven** — the redesigned matcher can only ever store the creator's own bytes (`infer-voice.ts:190-194`, `assemble.ts:367-370`, the `content.slice` replacement of `:383`), `validateSourceEvidence` untouched, the cross-package case runs a real `writeCapabilities` write; what is not proven is that a mis-map fails closed (CHANGE 1); sensitive inference **n/a**; export/deletion **n/a**; roles and admin boundary **holds** (`requireAdmin` reads `ADMIN_USER_IDS` at request time and `notFound()`s, `packages/auth/src/server.ts:117-123`; the bootstrap server starts without it; the scripts lint boundary is not widened); PII/secrets **gapped** (CHANGE 4, CHANGE 5, NOTE 3); requirement provenance — three recorded claims outrun their evidence (AC2's end-to-end reject clause and the slug's postcondition credit; "no repository secret of that name exists"; the artifact-content enumeration).

**§5 note (reviewer's):** the quote-matcher witness class has now recurred **four** rounds. The residue is no longer a leak or a wrong stored byte — it is one missing seam parameter. Each remaining item is a wording edit, one test, or one workflow job; none adds a phase, a document or a contract.

**Not found:** the model's quote stored; an evidence path reading another profile's or workspace's bytes; a `validateSourceEvidence` or provenance-check edit; new `packages/db` query text; a scope minted from an untrusted id; a driver error class reaching `app/**`; a widened scripts auth lint; a brain mutation outside proposal→approval; a new creator-data table missing from export or deletion; `ADMIN_USER_IDS` exported before the bootstrap; the vendor key visible to install, bootstrap or a third-party action; any reopened batch-3/4/5 closure.

**Verdict: NEEDS CHANGES** — no BLOCK and no leakage; the matcher redesign stores only the creator's own bytes and the key protection is now correctly described, but the postcondition's call site remains unwitnessed, the new positive property can pass on zero cases, and the "no repository secret" half of the key control has no running proof.

## Billing plan review — respin-service-quality — batch 6

**Readiness: Almost · Grade: B** — the batch-5 fixes mostly landed and no money-path code moves, but the replacement price-line pointer is still false on one of the three branches the plan pins it in, and the niche-copy fix was not carried into AC11. Counts: **0 BLOCK · 3 CHANGE · 2 NOTE**.

Batch-5 closure: **C1 partly** (the balance claim is gone — that half is fixed; the replacement's first clause is false on the price-unreadable branch and AC3 now pins it there); **C2 closed** (`02_Remediation_Plan.md:123` says verbatim what M:43/P1 T1 (iii) attributes to T6-P); **C3 closed** — the reviewer re-walked `ONBOARDING_ERROR_CODES` (`onboarding/copy.ts:128-222`) against the copy table: the only other onboarding-listed post-claim codes are `brain_version_limit` (`:1055-1059`), `brain_content_walk` (`:1192-1196`) and `segmenter_unavailable` (`:1207-1211`), none asserting a money fact; `brain_content_schema` (`:1157`), `brain_claim_walk` (`:1187`) and `usage_raw` (`:1137`) do carry "no credits were spent" but are absent from the onboarding list and fall back to `unknown` as the row already states — **no sixth clause found**; **C4 partly** (T8's copy names no plan, but AC11 still asserts the seed-derived list and the ledger still calls it an open finding); **C5 closed** (`buy-pack` renders in the `pack` panel independent of the subscription branch, `billing-view.tsx:434-454`; `subscribe-*` only in the no-live-subscription branch `:398-431`; `baseBlock` puts `notOwner` first `:219-226`); **C6 closed** (`RunSlotBusyError` at `inference.ts:738-741`, before the step-7 vendor call); **C7 closed**; **N1 closed** (`stripe/actions.ts:976-979`, `:981-986`, `:988`; `seed.ts:74`; rebuild 50 / Free 25 at `seed.ts:60,63`; pack $10/1000 at `:64`); **N2, N3, N4 closed** (I1's ≤ 3 × 17 = 51 is arithmetically consistent with M:76's composition, 1 + 4×3 + 1 + 3 = 17); **L12 closed** (`errors.ts:246-257` — truncation is `billable: true` but `consumesIncludedBuild: false`; unavailable is non-billable; `inference.ts:798-807,854` throws before step 9, so "no build consumed, no debit" is exact); **L13 closed**.

| # | Type | Sev | Conf | Plan location | Code evidence | Fix |
|---|---|---|---|---|---|---|
| **C1** | CHANGE | Medium | High | P1 T1 (iii)(c) pointer; P1 AC3 (`:185`); master Decisions `:43`; disposition M2 (`:209`) | When the price cannot be read, the line above the control reads *"The price of a run could not be read just now, so it is not shown here."* (`onboarding/run-copy.ts:49-50`). The pointer's first clause — *"The line above this control states what a build costs"* — is therefore **false on exactly the branch AC3 requires it in**. The panel does render both (`run-inference-panel.tsx:89-91` cost line above the form, `RunOutcome` at `:161-165` below), so the *positional* half holds; the *content* half does not. AC3's rationale ("byte-identical in all three, so no branch can make it false") is the error: byte-identity is what makes it false, because the sentence describes another line's content | Drop the first clause: *"Any charge for this run is in your credit history on the usage page."* — true in all three states and still a location pointer. If the price clause is wanted, key it to the same nullability `runCostSentence` already carries and assert per branch |
| **C2** | CHANGE | Low-Med | High | P1 AC11 (`:193`); P1 F-05 (`:48`) | T8 (`:114`) now specifies *"This workspace's plan does not include tracking niches. The billing page shows what this workspace is on today."* and allowance-driven tests, but AC11 still reads "the tier-block copy equals the plan list derived from `CONFIG_V1_SEED.trackedNiches`" — the superseded seed-pinned design, and the acceptance criterion an implementer builds to. F-05's "a **named** tier block" reads the same way | Rewrite AC11 to T8's assertions (exact string equality; no tier name from the active config's tier list; 0 → block, >0 → form; rows and Remove persist); reword F-05 to "a tier block that names no plan" |
| **C3** | CHANGE | Low | High | Master Deferral Ledger `:67` vs Decisions `:44` and disposition M4 (`:211`) | The ledger row still stands as "**open finding** — the owner did not accept it as a residual (2026-09-15)" while `:44` and `:211` say the same finding is **closed** by the no-plan wording. The master plan asserts both | Delete the row (or mark it closed 2026-09-15 by M4) so the §16 accounting and the ledger agree |
| **N1** | NOTE | Low | Med | P1 T1 (iii)(c) "named exception" rationale | The rationale scopes safety to "among the onboarding surfaces". The shared map is wider: `/usage` and `/settings/billing` render **any** code arriving as `?e=` (`tests/billing-ui.test.tsx:1891-1898`; `usage/page.tsx:20` imports `billingErrorFromCode`), so `/usage?e=inference_unusable` would print a sentence about "the line above this control" on a page with no such line. No producer puts that code in a `?e=` today (`AssemblyError` reaches only the onboarding action, `billing-errors.ts:611`), so this is latent | Either enumerate the `?e=` producers for this code or adopt C1's non-positional wording, which removes the exposure |
| **N2** | NOTE | Low | Med | P2 T1 `buy-pack` locator; AC1 | `buy-pack` renders only inside `config.ok ?` (`billing-view.tsx:436-454`); on a failed active-config read the panel renders `<Blocked>` and the locator finds nothing, so the editor chapter would fail for a config reason while reading as a role failure | State the precondition (seeded config in CI) or assert `config.ok`'s surface first |

Checks: B1 append-only ledger and derived balance **holds, untouched** (`packages/credits/src/ledger.ts:406-419`); B2 webhook idempotency **n/a** (zero `webhook`/`stripe_event` occurrences in either phase plan); B3 debit-in-transaction **holds and is correctly described**; B4 expiry and pause **untouched**; B5 config-not-code **holds** except AC11 (C2); B6 tier gates and owner-only **holds**; threshold provenance **holds** (`seed.ts:60,63,64,74,84`); B7 money paths tested — the pointer's *truth* per branch is still untested (C1); **no money-path change introduced** — the only `packages/credits` edits are a re-export line and a new test, `billing-errors.ts` is a copy edit, Phase 2 is test/CI-only.

**Not found:** a stored or mutable balance anywhere in the plans; a webhook path without `stripe_event_id` idempotency; a generation that could run unmetered; a hardcoded price, allowance or threshold where config is the authority; a sixth false money clause among the onboarding-listed codes; a pre-vendor kind that claims a spend; a retry that reaches the vendor; any metering, allowance, checkout, rollout or ledger edit introduced by the batch-5 fixes.

**Verdict: NEEDS CHANGES** — three fixable plan-text defects, one of them a money sentence the plan would pin false on a live branch; no BLOCK, and nothing in the batch-5 fixes touches metering, allowances, checkout, rollout or the ledger.

## Compliance plan review — respin-service-quality — batch 6 (lean merged run)

`plan gate ran lean (consolidated)`. **Readiness: Almost · Grade: B−** — five of seven batch-5 items closed against the code, but the new price-line pointer re-opens the same class it was written to close: it is false on the branch where the price could not be read, and AC3 pins it byte-identical *there*. Counts: **0 BLOCK · 4 CHANGE · 3 NOTE**.

Batch-5 closure: **C-1 partly** (the balance claim and the stale-balance defect are gone; the replacement's first clause is branch-dependent); **C-2 closed, one residual** — AC10 now has the exact `<details` span count (1/surface), span-text equality, the state-independent source check, fixture variants and w6b, and the source check is writable as stated: `<details` appears **0** times today in `studio/generation-outcome.tsx`, `first-ideas/first-ideas-result.tsx`, `studio/studio-panel.tsx`, `first-ideas/first-ideas-panel.tsx` (only `trends-view.tsx:175`, `results/comparison-view.tsx:155`, `onboarding-view.tsx:587` carry one); **N-a closed** (`phase-1.md:36` and Completion `:210` both read "(T1 (iii), T5–T7)"); **N-b closed** (`studio-panel.tsx:129` and `:133` are two `useActionState` calls; w7c names the generate call and counts the destructure and the argument position); **N-c closed** (`studio/copy.ts:69-72`, `studio/page.tsx:141-149`, `DESIGN.md:54,75`); **N-d partly** — the timeline half is genuinely covered (the onboarding FORBIDDEN scan bans `soon`/`coming`/`later`, `tests/onboarding-ui.test.tsx:154-156`, with a per-pattern non-vacuity plant at `:561-566`), the *positive* half is not; **N-e closed in substance, misfiled** (`first-ideas/page.tsx:111-124` still swallows an unreadable read into `brainActivated = false` → `FIRST_IDEAS_NEEDS_BRAIN` at `:199-200`; homes are wrong); **N-f closed** — all five verified in `generation-outcome.tsx`: `studio-ideas` `:312`, `studio-weakest-point` `:235`/`:449`, `studio-disclosure` `:393`, `studio-kill-test` `:94`, `studio-check-legend` `:552`.

| # | Sev / conf | Plan location | Code evidence | Issue | Fix |
|---|---|---|---|---|---|
| **C-1 CHANGE** | Medium / High | P1 T1 (iii)(c); AC3 "byte-identical in all three states, so no branch can make it false"; master `:43`, `:209` | `run-copy.ts:49-50` returns *"The price of a run could not be read just now, so it is not shown here…"*; `run-inference-panel.tsx:89-91` renders it as `run-cost` above the form, `:161-165` renders `RunOutcome` below | On the price-unreadable branch the line above the control states **no** price, so *"The line above this control states what a build costs"* is false — and AC3 makes it false **by construction** by requiring the pointer byte-identical in exactly that state. Third round on `refusal-copy-true-on-every-tier`: the fix added a new branch-dependent clause while removing the old one | Drop the first clause; keep the location-only sentence the batch-5 generalist specified: **"Any charge for this run is in your credit history on the usage page."** (precedent `run-outcome.tsx:127`). Then byte-identity across the three states is a true claim, and AC3 keeps all three cases |
| **C-2 CHANGE** | Low-Med / High | P1 AC3 pre-vendor sentences | The assertion is "exact string equality **against the `Record<AssemblyKind, string>` entry**"; the money-honesty scan is keyed on codes, not kinds (`tests/onboarding-ui.test.tsx:1386-1420`) and `inference_unusable` is **not** in `SPEND_ONLY`; for the three pre-vendor kinds the kind sentence *replaces* the shared detail | Comparing the render against the copy table proves wiring, never content: the properties named in the same sentence — nothing was sent, nothing was spent, the fault is ours, "tell us" — are asserted nowhere, and no existing scan requires a pre-vendor refusal to say what happened to the money (lesson 2026-08-26: a control with no failure path) | Pin the three sentences as **literals in the test**, and extend the `/spent\|charged/` money-honesty scan to the three **rendered** pre-vendor states (or add `inference_unusable` to `SPEND_ONLY`), keeping its existing non-vacuity probe `:1422-1425` |
| **C-3 CHANGE** | Low / High | P1 T5 (L21); Files rows `:153`, `:154`; AC8 evidence cell | The block reason lives in `onboarding/first-ideas/copy.ts:113` (`FIRST_IDEAS_NEEDS_BRAIN`), not in `first-ideas-panel.tsx` (which only renders `block.reason`); first-ideas view tests live in `tests/first-ideas-ui.test.tsx:554,670,763` — `tests/onboarding-ui.test.tsx` contains **one** first-ideas mention, a comment at `:1766` | The sibling fix names a copy home that holds no copy and an evidence file that renders no first-ideas panel, so the half of L21 that closes the class has no file and no test | Add `respin/app/(product)/onboarding/first-ideas/copy.ts` to T5's File(s) and the Files table; point AC8's first-ideas half at `tests/first-ideas-ui.test.tsx` and add that file to T5's row |
| **C-4 CHANGE** | Low / High | P1 AC10, first-ideas **usable** row | T6 (v) puts `studio-disclosure-provenance` inside `KillTestBlock`, which renders in **both** states (`generation-outcome.tsx:510`, `:543`), and first-ideas wraps that component (`first-ideas-result.tsx:31`) | Every other of the four rows asserts the provenance sentence present-and-outside-folds; the first-ideas usable row omits it, so the one new honesty sentence this phase adds is unasserted in one of the four states it renders in | Add `studio-disclosure-provenance` to the first-ideas usable list |
| N-a NOTE | Low / Med | P1 AC10 (2) source check | The Studio panel tree is `studio-panel.tsx` → `feedback-block.tsx`, `generation-outcome.tsx`, `lineage-view.tsx` (`studio-panel.tsx:29-33`); the check names four files | The population is "where honesty sentences live today", read off one call site, not the render tree (non-negotiable 7): a `<details>` added in `feedback-block.tsx` or `lineage-view.tsx` in a state no fixture drives escapes both the span count and the source check | Name all six files, with the two extras asserted `<details`-free, so a later move is a list edit |
| N-b NOTE | Low / High | P1 T1 (iii)(c) "the one **named exception** … among the onboarding surfaces only the voice build lists it" | `billingErrorFromCode` maps any valid code from `?e=` (`billing-errors.ts:2052-2057`); `/usage` feeds it `search.e` unrestricted (`usage/page.tsx:237-239`); `tests/usage-honesty.test.tsx:370-378` scans **every** `BILLING_ERROR_COPY` entry as /usage copy; the same hole was closed for onboarding by narrowing its own list (`onboarding/copy.ts:91-97`) | `inference_unusable` is shared-surface copy, not voice-build-only copy; position-relative wording ("the line above this control") is wrong wherever else the table renders. Independent support for C-1's fix | Scope the claim to `onboarding/copy.ts`'s narrowed list and keep the entry position-independent |
| N-c NOTE | Info / High | P1 T8 copy (M4) | `settings/billing/page.tsx:37-99` gates on `requireUser()` only and `billing-view.tsx:267-270` renders `current-plan`/`tier` for every role — so the sentence holds across roles; it does not hold in the config-unavailable branch `:315-320` ("Your plan could not be determined"), where the page says so itself | Minor residual on "The billing page shows what this workspace is on today"; the destination degrades honestly | None needed; billing's call |

Checks: kill-test honesty **holds** (`KillTestBlock` in both branches `:510`/`:543`; refusal names why plus sharper angle `:486-492`; nothing folded by T7); no invented specifics **holds** (AC9's `[check]` fixture, w3/w3b/w3c); no guarantees **holds** — the new kind sentences enter the FORBIDDEN scan (`FORBIDDEN_CLAIMS` plus `soon`/`coming`/`later`, `:145-157`) which has a per-pattern plant, but the positive money clauses are unasserted (C-2); no automation or concealment **holds**; sources allowlist — no ingest change and no scraping dependency in any `respin/**/package.json` (grepped `puppeteer|cheerio|playwright-extra|apify|scrape`, no matches); similarity gate, minimum difference and autopsy caching **n/a**.

**Absences hunted and not found:** a guarantee or timeline word in the new sentences; a `[check]` offer restored for `/disclosure/`; a fold that would hide `studio-in-force`, the charge line or a no-results-basis sentence; a re-press invitation reintroduced into the rewritten detail; an autopsy or Spin surface touched.

**Verdict: NEEDS CHANGES** — the refusal pointer is still false on one reachable branch and AC3 pins it there (C-1); the pre-vendor sentences' honesty is asserted against their own source (C-2); the first-ideas sibling fix names the wrong copy and test homes (C-3); one honesty testid is missing from an AC10 row (C-4).

## Plan review — respin-service-quality — batch 6 generalist (final slot)

*Dispatch: `plan-reviewer`, model inherit / no override requested, "think hard", read-only tools (no Bash — commands run: none). Inputs frozen as reserved, plus the three batch-6 specialist reports. Recorded verbatim by the orchestrator; only the trailing footer is omitted.*

**Readiness: Almost · Grade: C · No BLOCK, no High, nothing leaks — but five internal contradictions and dead controls would each be built wrong from the plan text as written, and two of them are the third and fourth recurrence of the same class.**

Counts (deduped): **0 BLOCK · 0 High · 5 Medium · 17 Low · 1 Info** — 19 unique specialist items (22 raised, 3 dedupes) plus 4 of the generalist's own. Two severities are **raised above the finding reviewer's rating**, flagged as such.

### Medium — all five keep the gate Not yet

| # | Finding | Source(s) | Fix | §9 row 4? |
|---|---|---|---|---|
| **M1** | **`locateQuote`'s postcondition has no failure path.** With a correct map-back, `acceptCanonicalMatch` can never return `false` (the needle is trimmed, so the canonical match's edges are non-whitespace and `canon(slice)===canon(needle)` holds by construction). w2b proves the *table* tests the predicate, not that `locateQuote` *calls* it — deleting the call leaves every named test green, and AC2's clause "a canonical match the predicate rejects surfaces as kind `quote_not_found`" **cannot be constructed** by an implementer holding only the plan text. `locateQuote` (`respin/packages/llm/src/assemble.ts:264-273`, opened) has no seam to inject a broken mapper. Lesson 2026-08-26 verbatim: a required refusal with no witness. **Fourth round** (b3 C1 → b4 C1 → b5 CH1 → b6 CH1) | T-CH1 | Add a defaulted map-back parameter, drive a real `quote_not_found` through `parseVoiceReply`, add witness w2e — **or** delete AC2's end-to-end clause and drop the postcondition credit from the `quote-mis-map-fails-closed-with-kind` slug (P1:198). Both are one edit; the choice is a code-shape decision, not more plan prose | Yes |
| **M2** | **The replacement price-line pointer is false on the branch AC3 pins it in.** `runCostSentence` returns *"The price of a run could not be read just now, so it is not shown here…"* (`respin/app/(product)/onboarding/run-copy.ts:49-50`, opened), so *"The line above this control states what a build costs"* is false there — and AC3 (P1:185) requires the pointer **byte-identical in exactly that state**, reasoning that byte-identity makes it unfalsifiable. Byte-identity is what makes it false. **Third round** on `refusal-copy-true-on-every-tier` | B-C1 = K-C-1 (independent) | Subtract, don't replace: *"Any charge for this run is in your credit history on the usage page."* True in all three states, still a location pointer, and it also removes L11's shared-surface exposure | Yes |
| **M3** | **The positive canonical clause can pass on zero cases, and its own example is a must-not-fold code point.** The clause fires only "in the cases where the exact `indexOf` misses and the canonical needle occurs exactly once" with **no stated minimum**; its substitution example says "space↔NBSP", but U+00A0 is named must-not-fold twice (P1:64, AC2), so those cases are excluded by the guard — and an implementer taking the example as authoritative widens `canon` and reddens w1b | T-CH2 | Name the substitution set as exactly the table's (delete "space↔NBSP"); assert the guard-qualifying count ≥ a stated floor, failing at zero | Yes |
| **M4** | **The paragraph-token rule is stated twice, incompatibly, in one sentence pair** (P1:64): "a maximal run … containing **two or more** U+000A becomes one paragraph token … any other maximal run becomes one U+0020", then "**every whitespace run containing U+000A** becomes the token — pinned here, not left to the implementer". A single `\n` folds to a space under the first and to the token under the second. AC2's exhaustive probe ("a single space for U+0020, U+0009 **and U+000A**") and the "single `\n`" literal fixture both pin the first reading | T-CH3 | Delete the second phrasing — the U+2029 collision argument survives it | Yes |
| **M5** | **AC11 still specifies the superseded seed-pinned niche copy.** P1:193 reads "the tier-block copy equals the plan list derived from `CONFIG_V1_SEED.trackedNiches`" while T8 (P1:114) specifies the no-plan sentence and a test asserting no tier name appears. F-05 (P1:48) still says "a **named** tier block". The AC is what an implementer builds to, so the M4 fix would be reverted at the acceptance step | B-C2 = T-N5 | Rewrite AC11 to T8's assertions; reword F-05 to "a tier block that names no plan" | Yes |

**Severity raises, stated openly:** M4 (tenancy rated Low-Med) and M5 (billing Low-Med, tenancy Info). Both are the same class — *a task body and its pinned acceptance criterion specify different artifacts* — and both meet gate-rules §9 row 4's own test.

**§4 consequence:** M1, M3 and L6 are missing-assertion / ineffective-test findings, which §4 says **cannot** be cosmetic. M2, M4, M5 change what is built. The whole Medium set owes a re-evaluation, which under §3 needs a fresh owner approval.

### Low (17)

| # | Finding | Source |
|---|---|---|
| L1 | "No repository secret of that name exists" has no in-repo or in-run witness — a green first dispatch is identical whether the owner deleted it or not. The proposed canary job is sound **but rests on recalled GitHub semantics the reviewer states it did not re-verify** — golden rule 9 applies before it is built | T-CH4 |
| L2 | The uploaded-artifact enumeration is false: the bootstrap writes the admin identity's email and Better Auth id into the uploaded `platform-admin/console.log` and the `test.skip` reason. Population built from two producers — **non-negotiable 7, third instance in this plan** | T-CH5 |
| L3 | **Deferral Ledger contradiction:** M:67 still reads "**open finding** — the owner did not accept it as a residual" while M:44 says the same finding is "**closed**" and the §16 disposition M4 (M:211) says the ledger row was closed | B-C3 |
| L4 | T5's first-ideas sibling fix names the wrong homes: `FIRST_IDEAS_NEEDS_BRAIN` lives at `respin/app/(product)/onboarding/first-ideas/copy.ts:113` (opened), not in `first-ideas-panel.tsx`; AC8's evidence cell points at `tests/onboarding-ui.test.tsx`, which contains **one** first-ideas mention. `copy.ts` appears in **neither** T5's File(s) **nor** the Files table — a closure break | K-C-3 |
| L5 | AC10's first-ideas **usable** row omits `studio-disclosure-provenance` — unasserted in one of the four states it renders in | K-C-4 |
| L6 | The three pre-vendor sentences are asserted by equality **against the copy table they come from** — wiring, never content | K-C-2 |
| L7 | The whitespace-only narrowing's population is the table's three code points, so `locateQuote("　")` still returns a range | T-N1 |
| L8 | Step 6's readiness loop is still untimed; steps 5 and 8 got the timeouts | T-N2 |
| L9 | Trigger-test population is "files **naming** the key" — a workflow reaches an environment secret without naming it | T-N3 |
| L10 | P2 Verification 4 (`:119`) still carries pre-M3 wording | T-N4 |
| L11 | T1 (iii)(c)'s "named exception" rationale is scoped to onboarding surfaces, but the entry is shared-table copy `/usage` renders from any `?e=`. **Independent support for M2's subtraction** | B-N1 = K-N-b |
| L12 | P2 T1's `buy-pack` locator renders only inside `config.ok ?` (`billing-view.tsx:434-436`, opened) | B-N2 |
| L13 | AC10's source check names four files; the Studio panel tree is six | K-N-a |
| **L14** | **Generalist's own — witness w6b exists in AC10 and AC12 only.** It appears at P1:192 and :194 and **nowhere in Verification 7** (P1:177), which is AC12's cited evidence. Introduced by the batch-5 L3 fix | G |
| **L15** | **Generalist's own — the L11 size recount is false against its own table.** M:52 and P1:163 claim "42 file rows, **one path each**". Counting: 42 rows, but P1:124 names 3 paths, P1:126 names 2, P1:129 names 4 → **48 distinct paths**. The recount replaced a correct figure with an incorrect one, on the number that feeds gate-rules §11 | G |
| **L16** | **Generalist's own — cross-file staleness:** `creator-ready-master-plan.md:61` reads "batches 0–4 run … owner-approved batch 5" while `:3` reads "pending batch 6 on both gates" | G |
| **L17** | **Generalist's own — Phase 2 invariant parity:** `operator-refusal-recorded-not-silent` appears in P2 Risk coverage (`:135`) with no row in the technical checklist (`:47-48`). Exactly the defect L25 fixed in Phase 1; the class fix was not carried to the sibling file | G |

**Info (1):** I1 — "The billing page shows what this workspace is on today" does not hold in the config-unavailable branch (`billing-view.tsx:315-320`), where the page says so itself. Degrades honestly; no action.

**Dedupes applied:** B-C1 = K-C-1 → M2 · B-C2 = T-N5 → M5 · B-N1 = K-N-b → L11.

### Batch-5 closure verdict — the "38 applied, 0 dissolved, 0 refused" accounting does **not** hold

**31 cleanly applied · 4 applied-but-incomplete · 3 applied-but-defective.** Five fix-induced defects, one more than expected.

*Applied but incomplete:* **M4** (niche copy) landed in T8 and master Decisions; **AC11, F-05 and the Deferral Ledger row still carry the superseded design** — the clearest failure in the accounting. **M3** (Environment secret) landed everywhere except **P2 Verification 4**. **L3** — w6b added to AC10 and AC12, not to Verification 7, which is AC12's evidence. **L11** — the recount landed everywhere and is **wrong** (L15).

*Applied but defective:* **M2** — the balance claim is genuinely gone; the replacement is false on the price-unreadable branch, which AC3 then pins byte-identically. **L2** — the paragraph-token pinning contradicts the ≥2 rule it was pinning. **M1** — the predicate was correctly isolated, which moved the witness *away from* the call site.

*Cleanly applied and verified against the tree:* M5, M6, M7, L1, L4–L10, L12–L25, I1–I6, plus the specialists' re-walks (billing found no sixth false money clause; tenancy verified no workflow today names the key, `environment:` or `playwright`; compliance verified all five first-ideas testids and both `useActionState` call sites).

**Pattern worth naming:** every one of the five fix-induced defects is the same authoring move — *replacing a false claim with a new claim, or a weak control with a differently-placed control*, instead of subtracting.

### Whole-plan simulation

**Phase 1 — 5 of 8 executable, 3 ambiguous, 0 blocked.** T2, T3, T4, T6, T7 executable (T3 the most thoroughly specified task in the plan). T1 fails the simulation in three places (M4 canon contradiction; M2 copy built false and AC3 certifying it; M1 unconstructible clause and M3's contradictory example). T5's first-ideas half names a copy file that holds no copy and an evidence file that renders no first-ideas panel (L4). T8's task text and AC11 specify different sentences (M5).

**Phase 2 — 4 of 5 executable, 1 ambiguous.** T1, T2, T3, T5 executable (T1 with one unstated precondition, L12). T4 buildable with four one-line gaps: L8, L9, L2, L1.

**External blocks (noted, not re-litigated):** Phase 1 cannot start until creator-ready Phase 0 reads Ready. Phase 2's first dispatch waits on the owner provisioning the `journeys` Environment and recording a vendor-side spend limit.

### Pre-mortem — built as written today

1. **The honesty suite certifies a false money sentence** — AC3 pins the pointer byte-identical in the state where its first clause is false; the test written to prove the copy true locks the falsehood in.
2. **The mis-map guard ships dead** — suite green, guard deleted or never called; on the first production mis-map the creator gets a kindless `provenance` refusal, and P1's *Least confident* is a claim the phase cannot back (the R8 `attested !== true` lesson, 158 green tests).
3. **The canon forks** — an implementer builds the token rule, the exhaustive probe goes red on U+000A, and the cheapest repair relaxes the probe.
4. **The niche fix is reverted at acceptance** — AC11 fails, the implementer restores the seed list, and the ledger row still calls it open so nobody notices.
5. **The `main`-only key silently isn't** — if the repository secret survives, the first dispatch is green and indistinguishable from the correct configuration.
6. **The sibling defect survives the class fix** — first-ideas keeps swallowing an unreadable read, because T5's first-ideas half points at files that hold no copy and run no first-ideas test.
7. **A dispatch is burned on a hang, not a failure** — step 6's untimed curl consumes one of three sanctioned dispatches with no diagnostic.
8. **The recorded artifact claim is false** — the admin id and email reach an uploaded console log while the plan states no identifier does.

### Mechanical consistency

P1 invariant parity ✅ (eleven slugs in both places, L25 applied correctly); **P2 invariant parity ❌ (L17)**; all 14 slugs unique, no rename; **witness closure ❌ (w6b absent from Verification 7, L14)**; **P1 Files-table closure ❌ (one break, L4)**; P2 Files-table closure ✅; depends-on chain ✅ (umbrella `:100-101` agrees); **number provenance ❌ (L15)** with everything else cited or derived (the ≤ 3 × 17 = 51 ceiling checks out: 1 + 4×3 + 1 + 3 = 17); recurring cost ✅ both named and carried into the umbrella `:86`; **Deferral ledger ❌ (L3)**; handoff contracts ✅; AC verifiability ✅ with two exceptions (M1 unconstructible, M5 contradicts its task); §11 size — 42 rows / 48 paths against a 25-row signal, the owner accepted the risk, **but the accepted figure should be the true one**.

Cross-file: Phases 1–2 map correctly to umbrella Phases 1–2; Critical-Path row `:40` matches; owner-input row `:63` carries M3's prerequisite; recurring-cost row `:86` carries L13. One stale row (L16). The niche contradiction is confined to the service-quality master plan.

### §5 convergence diagnosis

**(a) Quote-matcher witness class — fourth round. Same invariant throughout; the design is fine, the closure is a code-shape decision.** Trace: b3 C1 → b4 C1 → b5 CH1 → b6 CH1, one invariant the whole way (`quote-mis-map-fails-closed-with-kind`, specifically "can this control be observed to fail?"). The residue shrinks strictly every round and is now **one line**. Each round the author satisfied the letter of the finding by adding a *test of the control*, which moved the control one level further from the path that would exercise it. The loop will not close on prose: the only two terminal states are code decisions — **(i)** a defaulted map-back parameter so a test can inject a broken mapper (one parameter, one test, one witness), or **(ii)** accept the call site as untested defence in depth, delete AC2's end-to-end clause and drop the postcondition from the slug's credit. Either ends the class permanently. **Recommend (i)**, because the plan's own *Least confident* leans on the guard working in production; if the owner prefers not to widen the signature, (ii) is honest and cheap but must be paired with removing the claim.

**(b) Refusal-copy class — third round. Same invariant, and it *is* converging.** Trace: b3 → b4 → b5 ("…and your balance" false after a debit) → b6 (the replacement's first clause false when the price is unreadable). The residue is strictly smaller each round: a whole paragraph → one sentence → **one clause**. The failure mode is one authoring habit: *each round replaced a false claim with a new claim about another part of the screen.* Both reviewers converged independently on the same fix, and it is a **subtraction**. Two independent forces make it terminal: byte-identity across the three branches becomes true rather than false, and L11's shared-surface exposure disappears with the positional wording. No fourth round hides here **provided the next edit subtracts**.

**Standing rule worth adding to the plan, one line:** *a refusal sentence may reference only the state the refusal itself carries — never the content of another line, another page or a policy.* That rule would have pre-empted three of the five fix-induced defects.

### Verdict

**NOT READY.** Five unresolved Mediums — M1, M3 and L6 are missing-assertion/ineffective-test findings that §4 says cannot close as cosmetic; M2, M4, M5 change what is built under §9 row 4. All three specialists returned NEEDS CHANGES; no path has PASS; batches 0–6 consumed.

Ordered fix list — every item is a wording edit, one test, one parameter or one workflow job: (1) **M2** subtract the first clause (fixes L11 with it); (2) **M1** owner picks seam-plus-w2e or delete-the-claim; (3) **M5, M4, L3** reconcile the three contradictions; (4) **M3** delete "space↔NBSP", add the guard floor; (5) **L4, L5, L14, L17** the sibling/parity closures; (6) **L1, L2, L8, L9, L13** Phase 2 and population fixes, verifying GitHub's secret-issuance semantics against current docs **before** building the canary job (golden rule 9); (7) **L6, L7, L10, L12, L15, L16**.

**Method note for the record:** the review-file header discloses one stray `echo skip` from billing and two read-only Bash calls from tenancy; batch 3 carried the same disclosure. The reports stand — but three batches running, the read-only instruction has not held, and that is worth addressing in the dispatch rather than in each report.

# Batch 7 (owner-approved fifth extension, 2026-09-15)

*Dispatch for every batch-7 specialist slot: model inherit / no override requested (agent pin applies), read-only as a hard precondition. Findings tables, verdicts, severities and evidence cites recorded verbatim; the per-check narrative and coverage lists condensed by the orchestrator. **Method disclosure (gate-rules §1):** the compliance reviewer reports one stray no-op `echo skip` Bash call against the precondition, producing no evidence used in its report; tenancy and billing report none. The reports stand.*

## Tenancy plan review — batch 7

**Readiness: Almost · Grade: C** — nothing leaks and four of five batch-6 items closed cleanly, but the map-back seam the owner chose does not reach the function the witness test is told to drive, so the postcondition's call site is still unwitnessed on its fifth round. Counts: **0 BLOCK · 4 CHANGE · 4 NOTE**.

Batch-6 closure: CHANGE 1 **partly** (the defaulted `mapBack`, the seam tests and w2e are all written; the injection cannot reach the call site the test drives); CHANGE 2 **closed** (substitution set is "exactly the table's own folds", `Never space↔NBSP` named with its reason, guard-qualifying cases counted against a floor); CHANGE 3 **closed** (second phrasing deleted and marked deleted; AC2's probe agrees with the ≥2 rule); CHANGE 4 **closed, conditionally and honestly** (the canary only if GitHub's semantics are confirmed and the reference recorded, else an owner-attested prerequisite — golden rule 9); CHANGE 5 **closed** (verified: `platform-admin.spec.ts:49` writes exactly that note, `:51-54` repeats the id); NOTE 1, 2, 4, 5 **closed**; NOTE 3 **closed in the test text, incomplete in AC4 and the plant list**.

**Does the seam give the postcondition a real failure path? Not as written — it stops one function short.** The seam itself is sound: with the predicate in place, an end shifted into non-whitespace fails `canon(slice) === canon(needle)`, and one shifted into whitespace survives that clause (canon trims) and is caught by the edge clause — so both injected shapes produce a genuinely rejected canonical match, the thing four rounds could not construct. w2e reddens what the plan says and only that. **But the injection cannot reach `parseVoiceReply`**: the only call site is `const at = locateQuote(content, v.quote);` at `assemble.ts:372`, two arguments, intra-module, inside `parseVoiceReply` (`:284`), and nothing in the plan gives `parseVoiceReply` the parameter or forwards it. An implementer can build the seam test **or** the kind assertion, not both, and AC2's end-to-end clause is again unconstructible. `locateQuote` is already exported (`assemble.ts:264`, re-exported `index.ts:40`), so a test reaches the parameter with no new export — but the seam does widen a package-public signature.

| id | Sev / conf | Location | Issue | Fix |
|---|---|---|---|---|
| **CHANGE 1** | Medium / High | `phase-1.md:108` (T1 (ii)/(iv)); AC2 `:186`; slug `quote-mis-map-fails-closed-with-kind` `:200` | The seam is on `locateQuote`; the witness test is told to drive `parseVoiceReply`, which calls it with two arguments and is never given the mapper. The call-site witness and AC2's end-to-end clause remain unbuildable — the exact wording of batch-6 CHANGE 1, fifth round of this class | Thread the same defaulted `mapBack` through `parseVoiceReply`'s params object to the single call at `:372` (one line), state it in T1 (ii) and Handoff Contracts, and add the T7-style scan that no production call site passes it — **or** state that the seam test calls `locateQuote` directly and asserts `null`, and rewrite AC2's clause to the two-step form (predicate rejects → `null`; `null` → `quote_not_found` at `assemble.ts:372-380`, pinned by the paraphrase fixture) |
| **CHANGE 2** | Low-Med / High | `phase-1.md:179` (Verification 7) | Verification 7 still carries the **superseded** w2b — "delete the runtime postcondition **and plant an off-by-one end offset in the map-back** → the literal-slice fixtures red" — the definition T1 (iv) itself names as broken. AC12 cites Verification 7 as its evidence, so the transcript would be produced from the definition batch-5's M1 removed; batch 6's L14 and batch 7's M1 both edited this line without noticing | Replace Verification 7's w2b with the predicate-neutering definition, byte-identical to AC2's |
| **CHANGE 3** | Low-Med / High | `phase-1.md:196` (AC12) | "**w2b reddens the wrong-range table only** (the literal-slice fixtures stay green)" is false once the seam tests exist: with the predicate neutered to `true`, the injected off-by-one mapper is accepted and the seam tests asserting `quote_not_found` go red too | "w2b reddens the wrong-range table **and the seam tests**; the literal-slice fixtures stay green" — keeping w2e's asymmetry, which is what distinguishes the two |
| **CHANGE 4** | Low-Med / High | `phase-2.md:89` (T4 trigger test), `:129` (AC4) | The two assertions the L9 fix added have **no planted violation**: nothing plants a second file declaring `environment: journeys`, nothing plants `toJSON(secrets)`. AC4 carries only the naming clause. Verified: `.github/workflows/` holds `cutdown.yml` and `respin.yml`, neither containing the key, `environment:`, `toJSON(secrets)` or `playwright` — so both new clauses pass vacuously today (lesson 2026-08-26) | Add the two plants; carry both clauses and the directory-glob population into AC4 |
| NOTE 1 | Low / High | `phase-1.md:108` | The counted guard "fails when that count is below a **stated floor**" never states the number | Pin a figure (e.g. ≥ 20 qualifying cases per run) or a fraction |
| NOTE 2 | Low / High | `packages/llm/src/index.ts:40` | `locateQuote` is package-public, so the seam widens `@respin/llm`'s exported signature. No leakage path | Say the parameter is test-only and prove it the way T7 proves `initialState` |
| NOTE 3 | Low / High | `phase-2.md:90` (T5 README), `:132` (AC7) | T4's L1 fix makes "no repository secret" conditional, but T5's README bullet still asserts it flatly and AC7 has no slot for the attestation branch | Carry T4's conditional into both |
| NOTE 4 | Info / High | `phase-2.md:89` | "fill-step titles … may contain the personas' and the admin's passwords … so **no secret reaches an artifact**" contradicts itself in one sentence | Scope the clause to *persistent* secrets |

Checks: single scoping helper ✅ unchanged; mechanism stripping n/a; append-only brains ✅ for what is stored, ⚠️ gapped for what is proven — a mis-map can only record the creator's own bytes at wrong offsets **within the cited post**, never another profile's, but that it fails closed *with a kind* is unproven (CHANGE 1); sensitive inference n/a; export/deletion n/a; roles and admin boundary ✅; PII and secrets ✅ mostly, gapped at CHANGE 4, NOTE 3, NOTE 4; requirement provenance ⚠️ three claims outrun their evidence (AC2's end-to-end clause and the slug's credit; AC12's "w2b … only"; T5's flat "no repository secret"). **No batch-6 fix replaced a control with a differently-placed one this round** — CHANGE 1 is an *incomplete* fix, not a moved one.

**Not found:** the model's quote stored in place of the creator's slice; an evidence path reading another profile's or workspace's bytes; a `validateSourceEvidence` or provenance-check edit; new `packages/db` query text; a scope minted from an untrusted id; a driver error class reaching `app/**`; a widened `respin/scripts/**` auth lint; a brain mutation outside proposal→approval; a new creator-data table missing from export or deletion; `ADMIN_USER_IDS` exported before the bootstrap; the vendor key visible to install, bootstrap, a third-party action or a surviving step-6 process at upload; a second workflow reaching the `journeys` Environment; any reopened closure.

**Verdict: NEEDS CHANGES** — nothing leaks, no brain mutation escapes the proposal path, and the matcher still stores only the creator's own bytes; but the owner's chosen seam stops one function short of the call the witness has to drive, and w2b is now defined three different ways across four places.

## Billing plan review — batch 7

**Readiness: Almost · Grade: C** — the subtraction is right, but it never reached the acceptance criterion: AC3 still pins the old two-clause pointer byte-identical on the branch where it is false. Counts: **0 BLOCK · 2 CHANGE · 4 NOTE**.

Batch-6 closure: **C1 PARTIAL** (subtracted at `phase-1.md:108` and recorded at `master:240`, but `phase-1.md:187` and `master:44` still carry the two-clause sentence verbatim); **C2 RESOLVED** (AC11 asserts the static sentence exactly, no tier name, allowance-driven, and explicitly deletes the superseded assertion; F-05 reads "a tier block that names no plan"); **C3 RESOLVED** (ledger row struck and marked closed; residual records-only — the batch-4 §16 line `master:190` still reads "recorded as an open finding" with no supersession marker); **N1 PARTIAL** (verified real: `billing-errors.ts:2052-2057`, `usage/page.tsx:237-239`; T1's wording removes the exposure, AC3's retained sentence would put it back); **N2/L12 resolved in T1, not in AC1**; **L6 PARTIAL** (the literals half is in AC3; the scan-extension half offers an alternative that cannot work); **L15 RESOLVED** — the reviewer counted the table: `phase-1.md:121-163` = **43 rows**, distinct paths 17 + 32 = **49**, exactly as `:165` states.

| # | Type | Sev | Conf | Location | Issue | Fix |
|---|---|---|---|---|---|---|
| **C1** | CHANGE | Medium | High | `phase-1.md:187` (AC3); `master-plan.md:44` | The batch-6 subtraction landed in the task text only. AC3 still requires the detail to contain the two-clause sentence **verbatim in three rendered states, including price-unreadable**, and master Decisions quotes the same sentence as the chosen copy. The first clause is false where `runCostSentence` returns "The price of a run could not be read just now…" (`run-copy.ts:49-50`) — the exact state AC3 names. The plan now asserts two different money sentences, and the AC is the one an implementer builds to and the one the test pins | Replace the quoted sentence at both locations with "Any charge for this run is in your credit history on the usage page.", leaving the three-state assertion in place |
| **C2** | CHANGE | Low-Med | High | `phase-1.md:187` | L6's parenthetical "or `inference_unusable` is added to `SPEND_ONLY`" is not an equivalent option and would not pass. The scan runs against `onboardingErrorFor(code)` — the **shared** detail (`tests/onboarding-ui.test.tsx:1411-1419`) — which the three pre-vendor kinds never render, because their kind sentence *replaces* it; and the predicate is `/spent|charged/` (`:1418`), while the detail T1 specifies contains "so it counted" and "Any charge" — neither matches. Adding the code either reddens the suite or forces spend language back into the copy the plan just rewrote | Delete the parenthetical; keep "extend the `/spent|charged/` scan to the three **rendered** pre-vendor states", with the `:1422-1425` non-vacuity probe |
| N1 | NOTE | Low | High | `phase-1.md:108` | T1 (iii)(c) cites "the standing rule below"; no standing rule appears anywhere in Phase 1 (it lives at `master:43` and `:246`) | Cite the master plan's Decisions line, or restate the rule in Phase 1 |
| N2 | NOTE | Low | Med | `master-plan.md:43` | The standing rule reaches only *refusal sentences* that reference other content. It forbids the move that produced the M2 defect, but cannot reach the other two of the five fix-induced defects `master:248` attributes to the same move (M1's control moved off its call site, L2's rule restated incompatibly), and it has no AC, scan or witness anywhere | Either scope the claim honestly ("for refusal copy") or generalise it to fixes |
| N3 | NOTE | Low | Med | `usage/page.tsx:108` | The pointer's destination is now the authoritative money surface, and the ledger read is the one read on that page **not** wrapped in a try/catch (balance `:62`, runway `:79`, brain assets `:94`, billing state `:128`, burn `:167`, burn-by-mode `:187` all degrade; the ledger does not). Pre-existing, not introduced here; flagged because the copy now sends refused creators there | — |
| N4 | NOTE | Low | Med | `phase-2.md:126` | AC1 asserts the not-owner reason inside `buy-pack` but does not carry T1's "assert the surface is present before asserting the reason" precondition (`:86`) | Carry it into AC1 |

**Is the subtracted pointer now true on every branch?** Yes — the subtracted sentence is, verified against code rather than the plan. The detail is a static `BILLING_ERROR_COPY` entry rendered by code (`run-outcome.tsx:38,51`); the price line is a different component (`run-inference-panel.tsx:89-91`), so no render state can change it — byte-identity across the three states is now a **true** claim, and precisely because of that an assertion that can no longer fail: it tests wiring, not truth. With AC3 uncorrected, byte-identity is still what locks in the falsehood. Destination verified: `<h2>Credit history</h2>` (`usage-view.tsx:556`), rows newest-first with an id tie-break (`with-workspace.ts:751-758`), so a charge made seconds earlier is on the first page. Included build → no charge, and the product's own success copy already says an included build "adds no entry to your credit history" (`run-outcome.tsx:127-128`).

**Does the standing rule forbid the authoring move?** Partly — it closes the M2 class but is scoped to refusal sentences, so it cannot reach M1's relocated control or L2's incompatible restatement, and it carries no AC, scan or witness. **Replace-instead-of-subtract, re-checked:** the three batch-6 copy fixes in scope are genuine subtractions. The recurrence this round is not a replacement — it is an **incomplete** subtraction: the same "fix landed in the task, not in the acceptance criterion" shape batch-6 C2 raised against the niche copy, one batch later on the pointer.

Checks: append-only ledger ✅ untouched; idempotency n/a; debit-in-transaction ✅ verified (`inference.ts:857-884` step 8b, debit at step 9, both before `infer-voice.ts:231-236`); expiry/pause n/a; config-not-code ✅ (`app-server.ts:642-650` verified); tier gates ✅ (`billing-view.tsx:219-226`, `stripe/actions.ts:293`; `/usage` gates on `requireUser()` with the portal owner-gated, so the pointer's destination is reachable by a non-owner member); threshold provenance ✅; money paths tested ⚠️ partly (AC3 asserts the superseded sentence, one arm of the scan extension unrunnable).

**Not found:** a stored or mutable balance; a webhook path without idempotency; a generation that could run unmetered; a debit without its generation; a hardcoded price or threshold where config is the authority; a pause or expiry change; any metering, allowance, checkout, rollout or ledger edit; a sixth false money clause; a tier-gate regression.

**Verdict: NEEDS CHANGES** — two fixable plan-text defects, one of them an acceptance criterion that would have an implementer write a test pinning a false money sentence on a branch where it is false.

## Compliance plan review — batch 7 (lean merged run)

`plan gate ran lean (consolidated)`. **Readiness: Almost · Grade: C** — the pointer was subtracted in the task body but not in the acceptance criterion an implementer builds to. Counts: **0 BLOCK · 3 CHANGE · 3 NOTE**.

Batch-6 closure: **C-1 PARTLY** (re-raised); **C-2/L6 closed in substance, one defective half**; **C-3/L4 CLOSED** (verified: `first-ideas/copy.ts:113`, swallow shape at `first-ideas/page.tsx:111,118,199-200`, tests at `tests/first-ideas-ui.test.tsx:554,670,763`, `copy.ts` in T5 File(s) `:112` and the Files table `:156`, AC8 evidence `:192`); **C-4/L5 CLOSED**; **N-a/L13 PARTLY** (re-raised as C-3); **N-b** closed in the task body, **re-opened by C-1**; **N-c closed**; **L14 CLOSED** (`:179` lists w6b; AC12 cites the Verification 7 transcript).

| # | Sev / conf | Plan location | Code evidence | Issue | Fix |
|---|---|---|---|---|---|
| **C-1 CHANGE** | Medium / High | `phase-1.md:187` (AC3); `master-plan.md:44` | `run-copy.ts:49-50`; `:69` | AC3 still requires the two-clause sentence **verbatim in three rendered states, including price-unreadable** — the exact construction batch-6 C-1/M2 found false. Master `:44` says the same. Only `:108` carries the subtraction. An implementer builds to the AC, so the false clause ships. Fourth round of `refusal-copy-true-on-every-tier` | Replace the quoted string in AC3 and master `:44` with the subtracted sentence alone |
| **C-2 CHANGE** | Low-Med / High | `phase-1.md:187` money-honesty clause | `tests/onboarding-ui.test.tsx:1386-1400`, `:1411-1420`, `:1422-1425`; `billing-errors.ts:1167-1171` | The disjunct scans the **shared table entry**, which the three pre-vendor kinds *replace*, so it cannot cover the sentences C-2 was about; and against the detail AC3 pins in the same breath it matches neither `spent` nor `charged` | Delete the disjunct; keep the rendered-states extension with its probe |
| **C-3 CHANGE** | Low / High | `phase-1.md:194`, AC10 item (2) | `studio-panel.tsx:29-33`; `generation-outcome.tsx:34`, `:412-419`; `app/ui/banner.tsx` | The six-file list is still derived from one call site, and does not even cover that site: `app/ui/banner.tsx` and `onboarding/submit-button.tsx` render inside both panel trees and are unlisted. `studio-refusal` is in AC10's own "absent from both fixtures" list, which item (3) permits to be declared "covered by (2)" — so a `<details>` added in `banner.tsx` is caught by neither the rendered span count (state undriven) nor the source check (file unlisted). Non-negotiable 7, and L13 was itself the fix for this shape | Add both files (asserted `<details`-free), and state the list is the render-tree walk |
| N-a NOTE | Low / High | `master-plan.md:43`; `phase-1.md:108`, T8 `:115`, T7 / `studio-panel.tsx:233-238` | `usage-view.tsx:556` | As written the rule forbids the sentence it was adopted to bless — "your credit history on the usage page" is a claim about another page's content — and it has two live counter-instances in this phase's scope (T8's billing-page sentence; `studio-no-modes`, which T7 keeps true by *pinning* the referenced line outside the fold rather than subtracting) | Scope the rule to another surface's **state** (a stable location is fine) and name T7's pin-the-referent as the sanctioned alternative |
| N-b NOTE | Info / High | `phase-1.md:108` | `usage-view.tsx:384`, `:571` | Residual: the usage page has its own unreadable and clamped states. The destination degrades honestly and the sentence names a location, not a number | None |
| N-c NOTE | Low / Med | `phase-1.md:194`, AC10 (1)–(2) | — | Both halves key on the literal `<details`: a fold introduced through a wrapper component or `dangerouslySetInnerHTML` is caught only where a fixture drives the state. w6b plants the literal shape, so this shape has no witness | State the residual, or assert on `renderToStaticMarkup` output for each fixture variant |

Checks: sources allowlist ✅ (no ingest adapter touched; no scraping dependency in any `respin/**/package.json`); similarity gate and minimum-difference n/a; kill-test honesty ✅ (`generation-outcome.tsx:473-524`, each element asserted present-and-outside-every-fold on both surfaces); no invented specifics ✅ (AC9's `[check]` fixture with w3/w3b/w3c); no guarantees ✅ (`FORBIDDEN_CLAIMS` plus the timeline words with script-strip probes; `inference_unusable` is in the scanned table); no automation or concealment ✅ (`packages/modes/src/claims.ts:467-470`, `:697-701` — the R-68 amendment cannot hide concealment advice); autopsy caching n/a. **Does the honesty-block scanner catch a planted violation of each shape it claims to cover?** ⚠️ three of four — not caught: an undriven-state fold inside `app/ui/banner.tsx` (C-3), and a fold that never writes the literal `<details` (N-c).

**Absences hunted and not found:** a guarantee, timeline or reach claim in any new sentence; a `[check]` offer restored for `/disclosure/`; a scraping dependency or new ingest path; an auto-posting or engagement surface; a fold hiding `studio-in-force`, the charge line, the no-results-basis sentence or the kill-test block; a re-press invitation reintroduced; a fifth false money clause; any concealment-advice path weakened by the R-68 amendment.

**Verdict: NEEDS CHANGES** — the subtraction landed in T1 (iii)(c) but not in AC3 or the master plan's live Decisions (C-1); AC3's money-honesty disjunct cannot do the job it is offered for (C-2); AC10's fold-scanner population is still a call-site read, not a list (C-3).

---

# Batch 8 (owner-approved sixth extension, 2026-09-15)

*Scope: the batch-7 disposition — M1 (the pointer sentence propagated to AC3 and master Decisions as a pointer under propagation rule 1), M2 (`mapBack` threaded through `parseVoiceReply` to the call at `assemble.ts:372`), and the w2b consolidation (one definition in Verification 7, three pointers). Four slots: tenancy, billing, compliance, then the generalist last. Every reviewer was dispatched with read-only as a hard precondition — Read/Grep/Glob only, no Bash of any kind — after three reviewers made stray Bash calls across batches 3 and 6. All three specialists report "Commands run: none". Reports recorded by the orchestrator; findings, verdicts and the reviewers' own tables are verbatim, the mechanical sections condensed where noted.*

## Tenancy plan review — respin-service-quality — batch 8

**Readiness: Almost · Grade: B · Both Mediums are genuinely closed and nothing leaks, but four of the eight batch-7 tenancy items were never dispositioned and two of them are missing-assertion findings.**

Scope read: `respin-service-quality-phase-1.md` (fully), `-phase-2.md` T1–T5 + ACs, the master plan, `plan-review.md` § Batch 7. Code checked: `respin/packages/llm/src/assemble.ts`, `respin/packages/credits/src/infer-voice.ts`, `respin/packages/db/src/with-workspace.ts:5700-5760`. **Commands run: none.**

**Counts: 0 BLOCK · 3 CHANGE · 4 NOTE. Verdict: NEEDS CHANGES.**

- CHANGE (Low-Med, high conf) `phase-1.md:108` — the generative property's anti-vacuity guard still "fails when that count is below a stated floor" and **the floor is still not stated**. Batch-6 M3 asked for the count (applied); batch-7 NOTE 1 asked for the number (not applied). Second round on the same control, and §4 bars a missing-assertion item from closing as cosmetic. A floor of 1 restores exactly the zero-qualifying-case vacuity of lesson 2026-08-26. *Fix:* write a figure ("at least 20 qualifying cases per run", or a fraction of the generated set) into T1 (iv) and AC2. **Changes what is built.**
- CHANGE (Low-Med, high conf) `phase-1.md:108` — the `mapBack` seam now widens **two** package-public signatures (`locateQuote` `assemble.ts:264-273`, `parseVoiceReply` `:284-288`) with a parameter that exists only for tests, and **nothing proves production never passes it**. Batch 7 asked for this twice (CHANGE 1's own fix text: "add the T7-style scan that no production call site passes it"; and NOTE 2); the disposition applied only the thread. The plan holds T7's `initialState` to precisely this standard one task away. **No leakage path confirmed**: a wrong mapper can only yield offsets into the same cited post, and `acceptCanonicalMatch` plus `validateSourceEvidence` (`with-workspace.ts:5737`) reject anything not canonically equal and verbatim — seam hygiene and an unfinished reviewer fix, not a tenancy hole. *Fix:* source scan that `mapBack` appears at no call site outside `packages/llm/tests/**`, with one planted violation; add the parameter to Handoff Contracts. **Changes what is built.**
- CHANGE (Low-Med, high conf) `phase-2.md:89`, AC4 `:129` — **batch-7 tenancy CHANGE 4 is entirely unapplied.** The trigger test's two L9 clauses — no other workflow declares `environment: journeys`, none dumps `toJSON(secrets)` — are the clauses that catch a workflow reaching the vendor key *without naming it*, and the plant list still covers only the naming clause. AC4 carries neither clause nor plant. Both assertions pass vacuously against today's `.github/workflows/` (batch 7 verified `cutdown.yml` and `respin.yml` contain neither string) — the 2026-08-26 lesson exactly. *Fix:* add both plants and carry both clauses plus the directory-glob population into AC4. **Changes what is built.**
- NOTE `phase-2.md:90`, AC7 `:132` — batch-7 NOTE 3 unapplied: T4 makes "no repository secret exists" conditional (canary only if GitHub's semantics are confirmed, else an owner-attested prerequisite with no running proof) while T5's README bullet and AC7 still assert it flatly. A README sentence claiming an unproven property is the 2026-07-30 lesson's shape.
- NOTE `phase-2.md:89` — batch-7 NOTE 4 unapplied: "may contain the personas' and the admin's passwords … so no secret reaches an artifact" still contradicts itself inside one sentence. The paragraph's later "the only persistent secret the job holds is `ANTHROPIC_API_KEY`" is the correct scoping; the earlier clause should say *persistent* secret.
- NOTE `phase-1.md:200` — the risk slug `quote-mis-map-fails-closed-with-kind` still credits "AC2 literal-slice fixtures + postcondition + **w2b**". The witness that actually proves the call site is wired is **w2e**. Batch-7 CHANGE 1 named `:200` as one of its three locations and the disposition edited only T1 (ii) — **the first application of propagation rule 2 already left a cited location behind.** The claim is not false (AC2 now carries the end-to-end clause) but the credit is stale.
- NOTE `phase-1.md:108` — the seam's parameter shape is unspecified and `defaultMapBack` is named but absent from the export list (`canon`, its table and `acceptCanonicalMatch` are exported; the default mapper is not). The seam tests are still buildable — the injected mapper can be a literal wrong range — but on a class's fifth round, one line removes the last ambiguity.

**Checks run.** (1) Single scoping helper — unchanged; no new query text; the thread touches no `packages/db` path. (2) Mechanism-level stripping n/a. (3) Append-only brains, provenance, approval — **now proven rather than argued**: the seam is reachable from the function the witness drives (`parseVoiceReply`'s single `locateQuote` call is `assemble.ts:372`, params object `:284-288`), and the production caller `infer-voice.ts:236` passes `{ text, fields, posts }` with no mapper, so the default applies and no shipped behaviour changes; a rejected canonical match surfaces as `AssemblyError` kind `quote_not_found` with an isolated failure path (w2e) instead of a kindless `provenance` refusal at the write. (4) Sensitive inference n/a. (5) Export and deletion n/a. (6) Roles and admin boundary — admin identity still minted per run through `/sign-up`, never a static `ADMIN_USER_IDS` secret; `_handoff/` deleted, refused by the scan, excluded from upload, pinned in AC5. (7) PII and secrets posture — gapped at the three phase-2 items above. (8) Requirement provenance — one stale credit (`:200`); every code citation checked holds (`assemble.ts:264-273`, `:284-288`, `:372`, `:52-56`; `infer-voice.ts:207,214,231-236,256-274`; `with-workspace.ts:5737`). One loose span: T1 (ii) cites the empty-needle refusal as `assemble.ts:269-272`, but the refusal is `:269` alone and `:270-272` is the exact branch — Edge Cases row 3 cites it correctly.

**w2b consolidation — landed.** One definition at `phase-1.md:179` (Verification 7), three pointers: T1 (iv) `:108`, AC2 `:186`, AC12 `:196`. The superseded off-by-one plant is gone from the definition; AC12's "reddens the wrong-range table only" rider is gone and replaced by the true statement that the seam tests redden too. Every V7 witness checked for an isolated failure path and for claims it lacks: **w2b's "every literal-slice fixture stays green" holds** — each negative fixture (paraphrase, case change, comma/full-stop drop, space-for-paragraph-break, empty-after-canon, trailing-space boundary) refuses by *absence of a canonical match* or by the pre-exact whitespace narrowing, never by the predicate. **w2e's asymmetry holds.** No witness in Verification 7 now claims a failure path it lacks.

**Quote-matcher class, fifth round: CLOSED on its defect.** The seam reaches the call the witness drives, the predicate has its own table, the call site has w2e, and every clause of AC2 is buildable by one implementer in one pass. Named residue, neither reopening the call-site question: the generative guard's floor is still a number the implementer picks (CHANGE 1), and the seam's own containment is unproven where the sibling seam one task away is proven (CHANGE 2).

**Batch-7 tenancy items — 3 closed, 5 unapplied, 0 partly.**

| Item | State | Evidence |
|---|---|---|
| CHANGE 1 seam stops one function short | closed | `phase-1.md:108` threads optional `mapBack` to `assemble.ts:372`; seam tests and kind assertions both buildable. Two of three cited locations edited; `:200` not; the fix's "T7-style scan" half did not land |
| CHANGE 2 V7 carried the superseded w2b | closed | `phase-1.md:179`: off-by-one plant gone, predicate-neutering only, single governing home |
| CHANGE 3 AC12's "only" rider false | closed | `phase-1.md:196` drops the rider |
| CHANGE 4 two L9 trigger clauses have no plants | unapplied | `phase-2.md:89` plant list lacks second-file `environment: journeys` and `toJSON(secrets)`; AC4 `:129` carries neither |
| NOTE 1 counted guard's floor never stated | unapplied (2nd round; batch-6 M3 was the 1st) | `phase-1.md:108` still "below a stated floor", no number |
| NOTE 2 prove the seam test-only as T7 does | unapplied, and now wider | thread added a second public signature; no scan exists |
| NOTE 3 README/AC7 assert "no repository secret" flatly | unapplied | `phase-2.md:90`, `:132` |
| NOTE 4 "no secret reaches an artifact" self-contradiction | unapplied | `phase-2.md:89` |

**The three closed are exactly the three the owner's sixth decision named (M2 and the w2b ruling); the five unapplied are the ones the disposition at `master-plan.md:223` never mentions — it accounts for 2 of 21 unique batch-7 items.**

## Compliance plan review — respin-service-quality — batch 8 (lean merged run)

**Readiness: Almost · Grade: C · The pointer sentence is now propagated correctly and no live home quotes the superseded wording, but three of batch 7's compliance findings were never applied and the fold-scanner population is still a call-site read.**

Scope read: master plan (300 lines), `phase-1.md` (213 lines), `plan-review.md` § Batch 7 (`:1255-1329`), `-phase-2.md` grepped. Code opened: `studio-panel.tsx`, `generation-outcome.tsx`, `app/ui/banner.tsx`, `button.tsx`, `onboarding/submit-button.tsx`, `tests/onboarding-ui.test.tsx:1380-1426`, `packages/modes/src/claims.ts`. **Commands run: none.**

**Counts: 0 BLOCK · 5 CHANGE · 4 NOTE. Verdict: NEEDS CHANGES.**

| Batch-7 item | State now |
|---|---|
| **C-1** (AC3 + master Decisions still quoted the superseded two-clause pointer) | **CLOSED** — `phase-1.md:187` requires "the pointer sentence defined at T1 (iii)(c) verbatim"; `master:44` cites the same location; `phase-1.md:108` is the one home. No live home quotes the superseded string |
| **C-2** (`SPEND_ONLY` disjunct cannot pass) | **NOT APPLIED** — re-raised, now verified against the test file |
| **C-3** (AC10's six-file list misses two files) | **NOT APPLIED** — re-raised and widened |
| **N-a** (the standing rule forbids the sentence adopted to satisfy it) | **NOT APPLIED** — re-raised with the precise clause and minimal subtraction |
| **N-b** (usage page's own degraded states) | closed by construction; its fix column was "None" |
| **N-c** (both halves key on the literal `<details`) | **NOT APPLIED** — narrowed by new evidence |

*The reason is visible in the disposition itself: `master:223-229` dispositions only the 2 Mediums (M1, M2) plus the w2b consolidation. Batch 7's 16 Low and 3 Info — which include C-2, C-3, N-a and N-c — have no recorded disposition at all, against the owner's standing fix-scope instruction (`master:143`, third set: apply every reviewer-specified fix).*

- **CHANGE** `master-plan.md:43` (with `phase-1.md:108`, `master:44`, `:276`) — **the standing refusal-copy rule still refuses the copy adopted to satisfy it.** The forbidding clause is *"never the content of another line, another page or a policy"*; the adopted sentence is a claim about **another page's content**, so the "another page" item refuses it. Two further live counter-instances in this phase's scope: T8's "The billing page shows what this workspace is on today." (`phase-1.md:115`) and `studio-no-modes` ("the note at the top of this panel lists every mode", `studio-panel.tsx:233-238`), which T7 keeps true by *pinning* the referent outside the fold. `phase-1.md:108` compounds it by describing the sentence as naming "no other line and **no other page's content**" — which is not what it does — and by citing "the standing rule below", a rule that appears nowhere in Phase 1 (`standing rule` occurs once in that file, at `:108`). **Minimal subtraction:** strike "another page" and forbid a *value rendered elsewhere* instead — "may reference only the state the refusal itself carries, or a stable **location** where the authoritative record lives; never a value rendered elsewhere (a price, a balance, another line's wording), and never a policy; where a refusal must point at a line on the same screen, that line is pinned outside every fold and asserted (T7's `studio-mode-note`) rather than described" — then correct `phase-1.md:108`'s descriptor and repoint "the standing rule below" at `master:43`. Not cosmetic: as written the rule instructs the implementer to delete the pointer, and a refusal with no location is a refusal with no way forward (DESIGN.md "refusals name the remedy"; lesson 2026-07-30). Also fold in the second verbatim copy of the rule at `master:276` — under propagation rule 1 it should cite `:43`. *How the plan reads — but drives what is built.*
- **CHANGE** `phase-1.md:194` (AC10 item (2)) — **the fold-scanner population is still a producer, not a list, and the batch-7 fix as stated would repeat the error.** Verified: `generation-outcome.tsx:34` imports `Banner` from `app/ui/banner.tsx`; `studio-panel.tsx:30` and `first-ideas-panel.tsx:24` import `SubmitButton` from `onboarding/submit-button.tsx` — both render inside both panel trees, neither is listed, and `studio-refusal` sits in AC10's own "absent from both fixtures" list that item (3) permits to be declared "covered by (2)", so a `<details>` in `banner.tsx` is caught by neither the rendered span count nor the source check. But "add the two files the reviewer named" is itself a call-site read (non-negotiable 7, third round of this shape). **Fix:** state the population as the **import closure of the two panels**, enumerated — `studio-panel.tsx`, `feedback-block.tsx`, `generation-outcome.tsx`, `lineage-view.tsx`, `first-ideas-panel.tsx`, `first-ideas-result.tsx`, `app/ui/banner.tsx`, `onboarding/submit-button.tsx` — **eight**, with `app/ui/button.tsx` explicitly excluded and why (imported for the `buttonClass` string helper only; its `Button` component is not rendered in either tree, `button.tsx:11-24`), and the rule that a new import into any of the eight is a **list edit**, never an automatic inclusion. Both new files are `<details`-free today (read in full: `banner.tsx` 23 lines, `submit-button.tsx` 93 lines), so the assertions are true on landing. **Changes what is built.**
- **CHANGE** `phase-1.md:187` (AC3, money-honesty clause) — **the `SPEND_ONLY` disjunct is still offered and still cannot pass** (batch-7 C-2, unapplied). The scan reads `onboardingErrorFor(code)` — the **shared** table entry (`tests/onboarding-ui.test.tsx:1411-1419`) — which the three pre-vendor kinds never render, because their kind sentence *replaces* it; and the predicate is `/spent|charged/` (`:1418`), while the detail T1 (iii)(c) specifies contains "so it counted" and "Any charge" — `charge` does not match `charged`, and `spent` is absent. Adding `inference_unusable` to `SPEND_ONLY` (`:1386-1400`) therefore either reddens the suite or forces spend language back into the copy the plan just rewrote. *Fix:* delete the parenthetical; keep "extend the `/spent|charged/` scan to the three **rendered** pre-vendor states", with the `:1422-1425` non-vacuity probe. **Changes what is built.**
- **CHANGE** `phase-1.md:187` (AC3, pointer clause) — **the pointer sentence is the only honesty string in this AC with neither a test-side-literal rule nor a witness.** The three pre-vendor sentences carry the L6 rule and the counted clause carries w8 (`phase-1.md:179`); the pointer carries neither, so an implementer can satisfy it with `detail.includes(BILLING_ERROR_COPY.inference_unusable.detail)` — the render compared against its own copy table, exactly the defect batch 6's C-2 raised about the pre-vendor sentences — and no witness reddens if the sentence is dropped or re-worded. *Fix:* extend the L6 literal rule to the pointer clause and add **w8b** (delete the pointer sentence from the `inference_unusable` detail so AC3's pointer assertion goes red). **Changes what is built.**
- **CHANGE** `master-plan.md:225` — **propagation rule 2's first recorded search does not match the file.** The record states the search returned "`master:44`, `:230` and `phase-1.md:108`" and that "in all three the string now appears only inside a clause describing it as superseded". Verified by search: the string is at `master:44`, `master:225` (the record's own quoted command), `master:247` and `phase-1.md:108` — **not** at `:230` — and at `:247` (batch-5 disposition M2) it appears with **no supersession marker**. The substance of M1 is right (no live home quotes it); the *record* of the check is not, which is the one claim propagation rule 2 exists to make trustworthy (golden rule 1). *Fix:* re-run the search, correct the cited lines, and mark `:247` superseded in place. *How the plan reads.*
- **NOTE** `phase-1.md:194` — batch-7 N-c's residual is still unstated but narrower than it reads: `dangerouslySetInnerHTML` appears **nowhere** in `respin/` (0 files), and no component in either panel tree renders a prop-chosen element, so the only live non-literal `<details` route is a *new* wrapper component — which the eight-file closure closes while the list is maintained.
- **NOTE** `master-plan.md:270` — the adopted pointer sentence appears verbatim a second time, in the batch-6 disposition. It is history, so nothing is false today, but propagation rule 1 says one verbatim home; if the sentence moves again, this is the location that will read as live.
- **NOTE** `phase-1.md:187` — "the pointer is byte-identical in all three, so no branch can make it false" is a **non-sequitur**: byte-identity proves the string does not vary, not that it is true. The sentence is true because any charge is written to the ledger and rendered newest-first on the usage page (`usage-view.tsx:556`, `with-workspace.ts:751-758`). Replace the justification, or the AC records a wiring test as a truth proof.
- **NOTE** `master-plan.md:223-229` — the batch-7 §16 accounting dispositions 2 of 21 items and is silent on the remaining 19. Three of the five CHANGEs above are simply "the batch-7 finding was not applied and not refused". Whether that was the owner's sixth decision set narrowing scope to M1/M2, or an accounting omission, should be stated — §16 accounting is what the batch-8 generalist is asked to audit.

**(a) Refusal-copy class:** substantively closed, formally open with a named residue — no reviewer found a false claim in the chosen sentence, and the propagation defect is genuinely fixed; the residue is three items, none of them the copy: the standing rule that forbids it (C1), the missing literal rule and witness on the pointer clause (C4), and the unrunnable half of the money-honesty scan (C3) — C1 being the only one that can still reach production text. **(b) AC10 population:** the fix names it as the enumerated import closure of the two panel roots (eight files, `button.tsx` excluded with its reason) and states non-negotiable 7's maintenance rule outright.

## Billing plan review — respin-service-quality — batch 8

**Readiness: Almost · Grade: B− · The refusal sentence itself is now right and properly propagated, but the acceptance criterion that pins it still can't be built as written, and four of the five batch-7 billing items were never applied.**

Scope read: master plan, `phase-1.md`, `-phase-2.md` (T1/AC1 only), `plan-review.md` § Batch 7, plus the Respin code each claim names. **Commands run: none.**

**Counts: 0 BLOCK · 5 CHANGE · 5 NOTE. Verdict: NEEDS CHANGES.**

| Prior (batch 7) | State | Evidence |
|---|---|---|
| **C1** (Medium) pointer subtraction never reached AC3 / master Decisions | **RESOLVED** | `phase-1.md:187` now requires "the pointer sentence defined at T1 (iii)(c)" and carries no second copy; `master:44` cites the same location. Rule-2 search re-run across all four plan files: `"and your balance"` → `master:44`, `phase-1:108` only, both inside a "former wording / superseded" clause; `"line above this control states what a build costs"` → `master:44`, `master:247`, `phase-1:108`, all historical. **No live home quotes a superseded wording**, including the umbrella `creator-ready-master-plan.md` (`:3`, `:113` reference it, never quote it) |
| **C2** `SPEND_ONLY` disjunct cannot pass | **UNRESOLVED** | text at `phase-1.md:187` unchanged |
| **N1** dangling "the standing rule below" | **UNRESOLVED** | `standing rule` occurs exactly once in `phase-1.md` — at `:108`, the citation itself. The rule lives at `master:43`/`:276` |
| **N2** standing rule scoped to refusal sentences only | **UNRESOLVED** | `master-plan.md:43` unchanged |
| **N3** the pointer's destination has the page's one unguarded read | **UNRESOLVED (records-only)** | `usage/page.tsx:108` `scope.accessors.ledger(...)` is still outside any `try`; balance `:62`, runway `:79`, assets `:94`, billing state `:128` all degrade |
| **N4** AC1 lacks T1's surface-present precondition | **UNRESOLVED** | `phase-2.md:126` still asserts the not-owner reason inside `buy-pack` with no `config.ok` precondition (`phase-2.md:86` has it) |

*Root cause: the batch-7 disposition (`master-plan.md:223-229`) dispositioned **2 of 21 items** — M1, M2 and the w2b ruling. The 16 Lows and 3 Infos, which include billing C2 and N1–N4, have no recorded disposition at all, against the owner's standing "apply every reviewer-specified fix" instruction (third decision set, `master:143`).*

- **CHANGE** `phase-1.md:187` — **the `SPEND_ONLY` disjunct still cannot pass** (batch-7 C2, re-verified in code). The scan reads `onboardingErrorFor(code)` — the *shared* detail (`respin/tests/onboarding-ui.test.tsx:1411-1419`) — which the three pre-vendor kinds never render, because their kind sentence *replaces* it; and the predicate is `/spent|charged/` (`:1418`), while the detail T1 (iii)(c) specifies contains "so it counted" and "Any charge" — **neither matches** ("charge" ≠ "charged"). Either arm of the "or" reddens the suite or forces spend language back into copy the plan just subtracted. *Fix:* delete the parenthetical; keep "extend the `/spent|charged/` scan to the three **rendered** pre-vendor states" with the `:1422-1425` non-vacuity probe.
- **CHANGE** `phase-1.md:187` — **AC3's "three rendered states" assertion is not constructible, and cannot fail.** `RunOutcome` takes `{ state, refusalCopy, fallbackCopy }` only (`run-outcome.tsx:20-26`) — no price or balance input; the price line is a sibling component's prop (`run-inference-panel.tsx:66,89-91`), and the refusal reaches that panel only through `useActionState` (`:82-85`), which yields `IDLE_VOICE_STATE` under static render (the harness fact at `phase-1.md:34`, and the existing suite's own note at `onboarding-ui.test.tsx:1428-1440`). So the three named states are three **identical** `RunOutcome` calls: byte-identity across them is true by construction, so the assertion cannot fail; it tests wiring while reading as proof of truth. *Fix — what AC3 should assert instead:* (i) render `RunOutcome` **once** with `{ status: "refused", code: "inference_unusable" }` and assert the detail contains the pointer literal, "Your run was still made, so it counted", and neither "try again" nor "most often a quote"; (ii) add the check that actually earns branch-independence — a **source check that `BILLING_ERROR_COPY.inference_unusable.detail` is a static string literal** (no template interpolation, no function), which is *why* no render state can change it; (iii) keep the price-line states as what they really are — a separate `runCostSentence(null, …)` / `(…, null)` unit assertion that the panel's cost line degrades honestly — and drop the claim that the pointer was "asserted in three rendered states".
- **CHANGE** `phase-1.md:187` — **AC3 never says how the pointer is pinned.** Its literal-in-the-test rule (L6) is scoped to the three pre-vendor sentences and to the `Record<AssemblyKind, string>` table; the pointer lives in a different table, so an implementer may write `expect(html).toContain(BILLING_ERROR_COPY.inference_unusable.detail)` — a render compared against its own copy table, exactly the vacuity L6 exists to prevent, on the only money sentence in the phase. *Fix:* "asserted as a literal written in the test, never by equality against `BILLING_ERROR_COPY`" — the one second copy propagation rule 1 has to tolerate.
- **CHANGE** `phase-1.md:108` (T1 File(s)) + AC3 — **nothing guards the parked sibling money clauses while `billing-errors.ts` is open.** The Deferral Ledger (`master:67`) names four that are false after a rebuild debit and **parked**: `provenance` "no credits were spent" (`billing-errors.ts:1028`), `reference_echo`'s `NOTHING_SAVED_CLAUSE` (`refusal-clauses.ts:31-32` at `:1130`), `unknown` "nothing was charged" (`:1925`), `brain_document_limit` (`:1053`). AC3 pins `onboarding/copy.ts` unchanged but says nothing about the file being edited. Every existing whole-map sweep checked — `billing-ui.test.tsx:1711` (entitlement-price), `:1900-1931` (claims canon, apology), `:1119`/`:1167` (length, distinctness) — **none reddens** if one of those four is "fixed" in passing, which would be an unsanctioned money-copy change on a parked path. *Fix:* AC3 asserts those four clauses byte-identical.
- **CHANGE** `master-plan.md:223-229` — the §16 accounting covers 2 of 21 items; billing C2 and N1–N4 are neither applied nor dispositioned, against the owner's standing instruction (`master:143`). *Fix:* per-item disposition (applied / dissolved / refused, with reason) for the 16 Lows and 3 Infos before batch 9.
- **NOTE** `master-plan.md:270` — the only remaining verbatim second copy of the **live** sentence sits in the batch-6 disposition record. True today; if the copy ever changes it becomes a fourth stale copy. Mark it "(the sentence as decided in batch 6)" or make it a pointer.
- **NOTE** `master-plan.md:43` — the standing rule ("never the content of another line, **another page** or a policy") forbids the very sentence adopted to satisfy it. This is compliance's batch-8 N-a — counted there, flagged here because the rule governs money copy. Honest scoping: "never a claim whose truth depends on state the refusal does not carry" — a durable location stays legal, the M2 wording stays forbidden.
- **NOTE** `respin/app/(product)/usage/page.tsx:108` — the pointer now sends every refused creator to the one read on that page that does **not** degrade (`scope.accessors.ledger` is outside any `try`; balance `:62`, runway `:79`, assets `:94`, billing state `:128` all degrade). If it throws they get the error boundary instead of the credit history the refusal promised. Pre-existing, not introduced here; one stated-residual line in T1 (iii)(c) or a ledger row stops it being invisible.
- **NOTE** `master-plan.md:67` (Deferral Ledger) — M5's whitespace-only narrowing (`phase-1.md:108`, T1 (ii)) converts builds that previously **succeeded** with evidence quoting nothing into refusals raised **after** the money commits (`infer-voice.ts:231-236`). Right call under REQ-B02, but it strictly enlarges the "charged and got nothing" population that row tracks, and the row does not say so. Confidence: high on the mechanism, low on the volume.
- **NOTE** `phase-1.md:108` — T1 (iii)(c) holds three wordings in one paragraph (live pointer plus two superseded). AC3 now points at it by name, so label the live one ("**the pointer sentence (live):**") rather than leaving prose to distinguish it.

**(a) Refusal-copy class at round four.** The **copy** is closed — the sentence is true on every branch checked in code (price+balance readable; balance unreadable `run-copy.ts:69`; price unreadable `:49-50`; and outside onboarding via `?e=`, `billing-errors.ts:2052-2057`, `usage/page.tsx:237-239`; destination verified `usage-view.tsx:555-556`, 50 rows a page, newest first), no live home in any of the four plan files quotes a superseded wording, and no new false money clause was introduced. Its **pin** is not closed: named residue = AC3's unfailable three-state assertion, its unstated pinning method, and the unpassable `SPEND_ONLY` arm.

**(b) Money-path change: none.** The disposition's edits are an AC citation, a Decisions citation, a defaulted `mapBack` parameter threaded through `parseVoiceReply` (production caller `infer-voice.ts:236` passes nothing, so shipped behaviour is unchanged; `locateQuote` has exactly one production call site, `assemble.ts:372`), and the w2b consolidation. No allowance, price, ledger entry, Stripe object, webhook, expiry or pause is touched, and `phase-1.md:52` still forbids it. One residual: the phase opens `billing-errors.ts`, and nothing stops a well-meant edit to the four parked clauses beside the one entry it is allowed to change.

## Plan review — respin-service-quality — batch 8 generalist (final slot)

**Readiness: Almost · Grade: C · The plan itself is close — nothing leaks, no money path moves, and both batch-7 Mediums are genuinely closed — but the disposition that closed them left 13 of 21 reviewer-specified fixes neither applied nor refused, and the acceptance criterion that pins the phase's one money sentence still cannot fail.**

Read: both phase plans in full, the master plan's Plan Review Log and dispositions, the three batch-8 specialist reports, the batch-7 reports they audit, the umbrella plan, and the source files each load-bearing claim names. **Commands run: none** (Read/Grep/Glob only).

**Counts after dedupe: 0 BLOCK · 0 High · 3 Medium · 12 Low · 7 Info (22 unique). Verdict: NOT READY.**

### Execution simulation (as `respin-engineer`, plan text only)

13 tasks walked (P1 T1 (i)–(iv), T2–T8; P2 T1–T5) plus 19 acceptance criteria.

- ✅ **P1 T1 (i), (ii), (iii)** — executable. (ii) is the item batch 7 blocked on and is now buildable end to end: `parseVoiceReply` `assemble.ts:284-288` taking `{ text, fields, posts }`, single `locateQuote` call `:372`, `locateQuote` `:264-273` with two positional parameters — all three re-read. With `mapBack` threaded, one implementer builds the seam test **and** the kind assertion in one pass.
- ❌ **P1 T1 (iv)** — the generative property "fails when that count is below **a stated floor**" and the plan never states the number. **Third round** (batch-6 M3 → batch-7 NOTE 1 → batch-8 tenancy). An implementer picks 1 and restores the zero-qualifying-case vacuity of lesson 2026-08-26.
- ✅ **T2–T8, and P2 T1, T2, T3, T5** — executable from the text alone. T4's ten steps are executable and its one unprovable claim (no repository secret) is honestly conditioned *in the task* — but not in T5/AC7.
- ❌ **AC3** — three defects in the criterion an implementer builds to: (1) the `SPEND_ONLY` arm cannot pass — the scan reads `onboardingErrorFor(code)` (`tests/onboarding-ui.test.tsx:1411-1419`) matching `/spent|charged/` (`:1418`), while the detail contains "so it counted" and "Any **charge**" — `charge` ≠ `charged`, `spent` absent; (2) the "three rendered states" are three identical calls — `RunOutcome` takes `{ state, refusalCopy, fallbackCopy }` only (`run-outcome.tsx:20-26`), so **the assertion cannot fail** and its justification ("byte-identical … so no branch can make it false") is a non-sequitur; (3) the pointer sentence is the only honesty string in the phase with **neither** a literal-in-the-test rule **nor** a witness.
- ❌ **AC10 item (2)** — `generation-outcome.tsx:34` imports `Banner` from `app/ui/banner.tsx`; `studio-panel.tsx:30` imports `SubmitButton` from `onboarding/submit-button.tsx`. Both render in both panel trees; neither is in the six-file list. Non-negotiable 7, third round of this shape.
- ❌ **P2 AC4 / T4 trigger test** — the two clauses catching a workflow that reaches the vendor key *without naming it* have **no planted violation**, and AC4 carries neither clause. Both pass vacuously.

**Pre-mortem — likely causes with no receiving task (4):** the refusal points creators at `/usage`, whose ledger read `usage/page.tsx:108` is the one **outside any `try`** (balance `:62`, assets `:94-103`, billing state `:128` degrade); a well-meant edit to one of the four **parked** false money clauses in `billing-errors.ts` (`:1028`, `:1053`, `:1130`, `:1925`) while T1 has that file open, which no existing whole-map sweep reddens; a second workflow reaching the `journeys` Environment without naming the key; an honesty sentence folded inside `banner.tsx` / `submit-button.tsx`. **Absorbed:** wrong map-back, look-alike code point, nightly operator refusal, cold-compile death, stuck Free creator. ⚠️ M5's whitespace narrowing enlarges the parked "charged and got nothing" population and the row tracking it does not say so.

### Consolidated findings

**Medium (3)** — 1. `master:223-229` the §16 accounting dispositions **8 of 21** batch-7 items; **13 neither applied nor refused** (×3 specialists + own count), 8 of the 13 change what is built, against `master:143`. **Built.** · 2. `phase-1.md:187` **AC3 cannot fail** on the phase's one money sentence (×2). **Built.** Fix: render once and assert the literal; add a **source check that `BILLING_ERROR_COPY.inference_unusable.detail` is a static string literal** — that is what earns branch-independence; add **w8b** (delete the pointer → AC3 red); move the price-line branches to a `runCostSentence(null, …)` unit assertion; drop the three-state claim. · 3. `phase-1.md:187` the **`SPEND_ONLY` arm cannot pass** (×2, verified in code), second round. **Built.**

**Low (12)** — 4. AC10's population as the enumerated **eight-file import closure** of the two panel roots, `app/ui/button.tsx` excluded with its reason, "a new import is a list edit". **Built.** · 5. AC4's two plants and two clauses. **Built.** · 6. the generative floor as a number or fraction, third round. **Built.** · 7. `mapBack` has no test-only scan (T7's `initialState` is held to that standard one task away), is absent from Handoff Contracts, parameter shape and `defaultMapBack` export unpinned; the thread widened a **second** public signature. **Built.** · 8. assert the four parked money clauses byte-identical while `billing-errors.ts` is open. **Built.** · 9. `master:43` (+`:276`, `phase-1.md:108`) the standing rule forbids the sentence adopted to satisfy it; "the standing rule below" dangles (`standing rule` occurs once in `phase-1.md`, at `:108`, the citation itself). **Reads — but as written it instructs the implementer to delete the pointer.** ×2. · 10. `master:225` rule 2's recorded search does not match the file; **mark `:247` superseded in place**. **Reads.** · 11. `phase-1.md:200` the slug credits **w2b** where **w2e** proves the call site. **Reads.** · 12. `phase-2.md:90`+AC7 carry T4's conditional into the README and AC7. **Built.** · 13. `phase-2.md:89` "no secret reaches an artifact" self-contradiction; scope to *persistent*. **Reads.** · 14. `phase-2.md:126` AC1 carry T1's `config.ok` precondition. **Built.** · 15. **cross-file:** `creator-ready-master-plan.md:61` and `:92` stale (one and three batches respectively); third recurrence of the row-refresh class. **Reads.** *(Orchestrator: both corrected 2026-09-15, before this report arrived.)*

**Info (7)** — 16. `master:270` the only remaining verbatim second copy of the **live** sentence ×2. · 17. `usage/page.tsx:108` unguarded read — record as a stated residual. · 18. `master:67` M5's narrowing enlarged that row's population. · 19. `phase-1.md:194` the literal-`<details` residual is narrower than it reads (`dangerouslySetInnerHTML` appears **nowhere** in `respin/`). · 20. `phase-1.md:108` label the live wording among the three. · 21. `phase-1.md:108` cites `assemble.ts:269-272` for the empty-needle refusal; it is `:269` alone. · 22. **`master:211` cites "Report at `plan-review.md` § batch 7" and no such section exists** — the file jumps from the compliance report to Batch 8; the batch-7 generalist's four items survive only as prose at `master:213-219`. **That is why "21 unique items" cannot be audited item-by-item by anyone but its author.**

### Mechanical consistency

Files ↔ tasks closure holds both ways in both phases (P1's 43 rows against T1–T8, P2's 14 against T1–T5); the "43 rows naming 49 distinct paths" figure is the one batch 7 recounted. All five agents exist and match the master plan's Critical-Path rows; `phase-1.md:36` and Completion Criteria state the same scopes. Invariant slugs 11 = 11 (P1), 3 = 3 (P2), none renamed, no duplicates. Reachability and Least-confident non-empty in both. Deferral ledger: every parked promise has a row; the struck niche row correctly kept struck. Handoff contracts pinned and cited — one gap, `mapBack`. Number provenance: every quantitative target cited or derived **except the generative floor**. Verifiability: 19 ACs PASS/FAIL with evidence **except AC3's three-state clause (cannot fail) and AC4's two vacuous clauses**.

### Batch-7 closure table

Count: 8 tenancy + 6 billing + 6 compliance = 20 specialist items; three dedupes (billing C1 = compliance C-1; billing C2 = compliance C-2; billing N2 = compliance N-a) → **17 unique specialist**, plus the generalist's **4** own = **21**, reconciling with the recorded 2 Medium + 16 Low + 3 Info.

| Batch-7 item | Dispositioned? | State |
|---|---|---|
| billing C1 = compliance C-1 (AC3 + Decisions pointer) | yes (M1) | **closed** — no live home quotes a superseded wording |
| tenancy CHANGE 1 (seam one function short) | yes (M2) | **closed on its defect**; two halves left — the "T7-style scan" and the cited location `phase-1.md:200` |
| tenancy CHANGE 2, CHANGE 3 | yes (w2b ruling) | closed |
| generalist ×4 (§16 audit, rules 1–2, w2b ruling) | recorded / adopted | rule 1 held; **rule 2 failed twice on first use** |
| tenancy CHANGE 4, NOTEs 1–4 | **no** (5 items) | unapplied |
| billing C2 = compliance C-2, N1, N2 = compliance N-a, N3, N4 | **no** (5 items) | unapplied; each verified in code |
| compliance C-3, N-c | **no** (2 items) | unapplied |
| compliance N-b | n/a | fix column was "None" |

**Verdict on the accounting: 8 of 21 have a recorded disposition; 13 do not, 12 of which owe an edit or a stated refusal.** The specialists' "2 of 21" understates what was closed but is exactly right about what matters: **13 reviewer-specified fixes were silently dropped**, against `master:143`. **Whether the sixth decision set narrowed scope to M1/M2 or this is an omission is not recorded, and §16 requires it per item.**

**Rule 1: followed where applied, two residues** (`master:270` the live sentence verbatim; `master:276` a second copy of the standing rule). **Rule 2: failed on both of its first two applications** — once because the search was recorded from pre-edit state (a recorded claim not matching the file it names, golden rule 1: true hits are `master:44`, `:225`, `:247`, `phase-1.md:108`; `:230` is not a hit, and `:247` carries the superseded wording **with no supersession marker**), once because the edit started from one of three cited locations rather than from a search (`phase-1.md:200` left behind). *The rule-1 mechanism works; the rule-2 mechanism did not run as written either time.*

### The two §5 classes

**(a) Quote matcher — CLOSED on its defect, round five**, verified against the code independently. One implementer can build the seam test and the kind assertion in one pass, which four earlier rounds could not produce. Production unchanged. Residues: the unstated floor, and the seam's own containment unproven where the sibling seam is proven — the thread widened a second public signature, so that gap got wider.

**(b) Refusal copy — the COPY is closed; the PIN is not.** Four reviewers over two batches have failed to find a false claim in the sentence, and the propagation was verified rather than taken. **But a class is closed when the property is witnessed, and this property is not:** the three-state assertion cannot fail, the pointer has no pinning rule and no witness, and one arm of its money-honesty scan reddens the suite. Substantively closed, formally open; the residue is all in AC3, not in the copy.

### Would another round converge?

**No. And another four-slot round is the wrong next step.**

1. **The binding constraint is not this gate.** `phase-1.md:3` gates Phase 1 on creator-ready **Phase 0**, NOT READY (Grade D) after batch 10 with three unwritten enumerations, all High. Even a READY here starts nothing.
2. **The yield curve has flattened and the residue changed kind.** 5 Medium (batch 6) → 2 (batch 7) → 3 (batch 8); of batch 8's 22 items only **three are genuinely new** — AC3-cannot-fail, the parked-clause guard, and rule 2's bad search record — and the first two came from reading *component signatures and existing test sweeps*, not the plan. A ninth batch would spend four slots confirming that 22 already-written items were applied, which a §16 accounting does for free.
3. **The failure mode is now the disposition, not the review.** Two rounds running, the accounting claimed more than the edits delivered: batch 6 "22 applied" → 11 clean; batch 7 "every location found by search" → the search record does not match the file. Another *review* round does not fix that.

**Recommended instead:** apply all 22 items as one disposition pass with a per-item §16 line, no new artefacts. Then either **(i)** spend **one slot, not four**, on a scoped mechanical re-check of the five items that change what is built and can be settled by reading (AC3, AC10, AC4, the floor, the `mapBack` scan); or **(ii)** close this gate at "Almost, with a recorded residual list" — 0 BLOCK / 0 High has held for four consecutive batches, every remaining item is a test-design fix, and the sharpest one ("AC3's assertion cannot fail") is provable in thirty seconds at implementation time by deleting a line and watching the suite stay green, which is the only place it was ever going to be *settled* rather than argued. **The reviewer would take (ii).**

**Either way, the next unit of effort belongs on creator-ready Phase 0's three High enumerations. That is what actually blocks the build.**

**Verdict: NOT READY (Almost, Grade C). The plan is B-grade work; the disposition process around it is D-grade, and that is the whole gap.**

**Ordered fix list:** (1) disposition all 13 undispositioned batch-7 items, per item, applied/dissolved/refused with a reason; (2) rebuild AC3 — render once, literal assertion, static-string-literal source check, w8b, delete the `SPEND_ONLY` arm, move the price-line branches to a unit assertion; (3) AC10's eight-file import closure, AC4's two plants and two clauses; (4) the floor, the `mapBack` scan + Handoff row, the parked-clause byte-identical assertion; (5) the standing rule's subtraction, rule 2's corrected search record (mark `master:247`), the slug credit at `phase-1.md:200`, README/AC7's conditional, AC1's `config.ok` precondition, the umbrella's two stale rows.
