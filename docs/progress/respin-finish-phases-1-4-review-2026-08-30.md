# Finish Respin phases 1–4 review — 2026-08-30

## Report card

**Current overall: Ready (closed by Slice 4c on 2026-08-31).** The dated review below remains the immutable 2026-08-30 failure snapshot; the closure addendum records the evidence that resolves every finding without rewriting that history.

### Slice 4c closure addendum - 2026-08-31

| Original gap | Current disposition |
|---|---|
| Red current-tree entry gate | **Resolved.** Root/package TypeScript, full ESLint, `db:check`, Next production build, and CI-shaped real-PostgreSQL Vitest all pass; the final suite was **81 files / 1663 tests / 0 skipped**. |
| Missing creator no-store safety check | **Resolved.** One server-scoped preview/write decision is live, the hydrated refusal passed, and fingerprints across all 13 relevant workspace tables proved candidate and result were not stored. |
| Missing Slice 2b/4 browser evidence | **Resolved.** Multi-profile isolation, direct `/usage` and billing visits, the no-store refusal, one real debit, the admin cost row, and the post-deletion orphan row were walked and captured in the [Slice 4c card](respin-finish-slice-4c-card.md). |
| Unreachable reconciliation mutator | **Resolved by honest removal.** No production mutator remains without an authenticated/idempotent owner; ordinary spend recording and the read-only reconciliation report remain live. |
| First-login workspace race | **Resolved.** Usage and billing route through bootstrap-then-scope, with deterministic and real-PostgreSQL concurrency witnesses plus direct browser visits. |
| Unusable multi-profile allowance | **Resolved.** Membership-selected active profiles are persisted, create-and-select is atomic, all relevant pages/actions bind the displayed selection, and the two-profile browser walk proved isolation. |
| Current status truth and reviewer gates | **Resolved.** Tenancy, billing, spin compliance, and final code review all PASS; the clean close-out card is **Ready** and the master plan restores Slices 1-4 as current dependency proof. |

Real-model evidence used exactly two authorised Anthropic calls at total vendor cost **USD 0.040326**. The admin row showed 2 priced calls before deletion; a guarded local fixture pseudonymised the rollup and deleted only the disposable workspace in one transaction; the live report then showed one `orphaned` row, 0 drift, while database inspection proved the old workspace/detail/ledger rows were gone. Evidence: [Usage](respin-finish/evidence/slice4c-metered-usage.png), [cost row](respin-finish/evidence/slice4c-model-spend-before-deletion.png), and [orphan row](respin-finish/evidence/slice4c-model-spend-orphaned.png).

### Original 2026-08-30 snapshot

**Overall: Not yet** — the then-current tree failed the mandatory entry gate, and the existing completion records also showed unresolved acceptance and reachability gaps, including a missing Slice 4 safety-check surface.

| Gate | Result | One line |
|---|---|---|
| Entry checks (typecheck/lint/test) | **Not yet** | `typecheck` passed; `lint` failed at `respin/packages/db/src/export.ts:432` (`prefer-const`); tests/build were not run after the mandatory stop. No `docs/progress/entry-baseline.md` exists. |
| Acceptance criteria | **Not scored on the current tree** | The entry-gate stop prevents a fresh row-by-row verdict. Existing evidence nevertheless proves several criteria were recorded Ready without being completed; see findings. |
| Critical-Path reviewers | **Not run** | The review-phase workflow stops before reviewer spend when the entry gate is red. Prior cards are historical evidence, not fresh verdicts on this uncommitted tree. |
| Least-confident probe | **Not run** | Blocked at entry gate. |
| Definition of Done | **Not met** | Clean entry checks, all acceptance criteria, and all reviewer gates are not presently evidenced. |
| Reviewer spend | **0 reviewers · 0 rounds** | No reviewer agents were dispatched after the entry-gate failure. |
| Fixed without re-review | **0** | Independent review lane; no implementation changes made. |
| Reachability | **Mixed** | Core onboarding/brain routes are live, but Slice 4's required no-store safety check and Slice 2b-c's reconciliation-delta application have no live caller. |
| Deferred findings | **0 filed · 0 re-entered · existing residuals remain** | This review records current gaps here; it does not mutate prior ledgers after a blocked gate. |
| Gate intensity | **lean, not reached** | Billing and tenancy would auto-escalate to separate Full-gate reviewers once entry is green. |

**Top things to fix (in order):**

1. `respin/app/(product)/onboarding/actions.ts` and the onboarding UI — implement Slice 4 R14/R14a's scoped, no-store candidate safety check using the production echo predicate, then perform the required browser refusal walk.
2. `respin/packages/db/src/export.ts:432` — restore the clean entry gate, then run the complete CI-shaped Respin gate with Docker live and zero skips.
3. `docs/plans/respin-finish-master-plan.md:130-135` — stop marking slices complete when their own cards say Almost or their mandatory browser acceptance was not performed; either close the evidence gaps or change the status honestly.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

## Scope

“Phases 1–4” is interpreted using the finish master plan as Slices 1, 2a, 2b/2b-c, 3/3b, and 4. The tree contains extensive uncommitted work after commit `8f67167`, including later Slice 5 work, so commit history cannot isolate the phase scope. The review therefore used the phase cards' declared surfaces plus the current tree.

## Entry gate

- `pnpm -C respin typecheck`: **PASS**.
- `pnpm -C respin lint`: **FAIL** — `respin/packages/db/src/export.ts:432`, `timer` is never reassigned (`prefer-const`).
- `pnpm -C respin test`, `db:check`, and `build`: **not run after the mandatory entry-gate stop**.
- Brownfield baseline: **none** (`docs/progress/entry-baseline.md` does not exist).

The lint failure is in the later Slice 5 export surface, not a Phase 1–4 file. It still blocks an official phase review because the workflow requires the current tree's real entry scripts to be green, or no worse than an approved baseline.

## Ranked findings

### High — Slice 4's required creator-reachable no-store safety check is absent

The phase contract requires a creator to paste a candidate draft, run the exact scoped production echo/budget predicate without persisting draft or result, receive actionable copy, and walk the first refusal in a browser (`respin-finish-phase-4.md:110,159-160,185-187`). The current onboarding action surface exports profile creation, own-post intake, reference-post intake, and voice inference (`actions.ts:71,105,151,191`) but no candidate safety-check action. A repository search finds the echo predicate only on brain write/activation paths and tests; it finds no onboarding no-store safety-check caller or UI.

The Slice 4 card records Ready while reframing the missing evidence as a “live-vendor browser walk” (`respin-finish-slice-4-card.md:12,61-63`). That is a different path: R14 explicitly specifies a creator-pasted candidate and does not require a vendor call. Consequently the advertised Slice 4 outcome — “run a no-store safety check” — is not implemented, and R14/R14a plus the browser acceptance criterion are unmet.

### High — completion status contradicts the phase cards and the clean-gate rule

- Slice 1 is marked complete in the master plan (`respin-finish-master-plan.md:130`), while its own review says **Overall: Almost** and leaves reviewer PASS unchecked (`respin-finish-phase-1-review.md:3,46-59,79`).
- Slice 2a is marked complete (`respin-finish-master-plan.md:131`), while its own card says **Readiness: Almost** because round-2 BLOCK fixes were never re-reviewed (`respin-finish-slice-2a-round2-card.md:3,33-40`).
- Slices 2b, 3, 3b, and 4 were recorded Ready with one failing test and no approved brownfield baseline (`respin-finish-master-plan.md:132-135`; their cards report 1324/1325, 1274/1275, 1521/1522, and 1379/1380 respectively). Under the repository's review workflow, pre-existing red is not an exception unless it is recorded in `docs/progress/entry-baseline.md`.

These are not cosmetic status mismatches: downstream slices use a Ready review file as dependency proof. A check mark currently does not mean the repository's own Definition of Done was met.

### Medium — mandatory Slice 2b and Slice 4 browser acceptance was waived but the slices were still marked Ready

Slice 2b requires both creator and operator “can…” lines to be walked in a browser (`respin-finish-phase-2b.md:154-155,181-184`). Its card says the two walks were **not done** (`respin-finish-slice-2b-card.md:30-40`), and the corrective addendum says they were not repeated (`respin-finish-slice-2b-c-card.md:39-43`). Slice 4 similarly requires the no-store refusal walk and explicitly says the browser walk is the only instrument for the dormant-control hazard (`respin-finish-phase-4.md:159-160,183,185-187`), but its card lists that walk as residual.

The implementation may be well covered at unit/integration level, but those tests are not evidence for the deliberately separate user-path acceptance criteria.

### Medium — Slice 2b-c's reconciliation-delta path is inventory, not a live capability

`applyReconciliationDelta` is implemented and tested in `packages/db/src/spend-rollup.ts`, but it is not exposed by `respinDb`, called by an app action, webhook, job, or provider integration. The current operator page calls `reconcileSpend`, which reports reconciliation state; it does not apply a cost delta. The card explicitly confirms “no live caller” and that no real reconciliation integration exists (`respin-finish-slice-2b-c-card.md:43-45,52`).

This conflicts with the finish master plan's governing rule that no package ships without a caller in the same slice. It also means corrected vendor cost cannot reach the supposedly completed rollup transition in production.

**Slice 4c disposition (2026-08-31): resolved by honest removal.** No real provider/job/operator-import contract exists, so `applyReconciliationDelta`, its public/error plumbing, the sanctioned `model_usage` UPDATE entry, and mutation-only tests were removed. A structural test now refuses a production reconciliation mutator without its real owner. The normal spend UPSERT and read-only operator reconciliation report remain live. C1-C3 and C5-C7 are now also evidenced in the closure addendum above, so the aggregate review is Ready.

### Medium — the first-login bootstrap race remains on `/usage` and `/settings/billing`

The Phase 1 review routed this known race into Slice 2a (`respin-finish-phase-1-review.md:52-54`). The current pages still call `respinDb.withWorkspace` directly (`usage/page.tsx:35-37`, `settings/billing/page.tsx:47-49`) while `workspace-scope.ts` documents that page/layout rendering can race and provides `scopeForUser` to bootstrap before scoping (`workspace-scope.ts:5-18,39-47`).

A newly authenticated creator who lands directly on either page can therefore receive a transient workspace-access refusal even though the layout is creating the workspace concurrently.

### Medium — multi-profile capacity has no product path

The Phase 1 card records that no UI path exists to create or select a second creator profile (`respin-finish-phase-1-review.md:52`). That remains true: onboarding switches permanently from `create-profile` to `paste-posts` once `profileCount > 0` (`onboarding/copy.ts:11-22`), and the onboarding/interview/brain surfaces bind `profiles[0]` rather than a user-selected profile (`onboarding/page.tsx:219-242,337-380`; `onboarding/interview/page.tsx:47-60`).

The server enforces multi-profile plan caps, but creators cannot use the allowance through the product. This does not invalidate Slice 1's singular first-profile walk, but it is a real reachability gap in the Phase 1–4 implementation.

## Acceptance and Definition-of-Done disposition

A fresh row-by-row acceptance walk and fresh Critical-Path verdicts were not produced because the entry gate failed. Based on existing evidence alone, the following criteria are definitely not closed:

- Slice 4 R14/R14a and its browser acceptance walk.
- Slice 2b's two browser “can…” walks.
- Clean entry-gate evidence for the current tree.
- Ready status for Slices 1 and 2a; their own cards remain Almost.
- Reachability for reconciliation-delta application.

At the time of this 2026-08-30 snapshot, the aggregate Phase 1-4 implementation was therefore **NOT READY** for a new completion claim. The 2026-08-31 closure addendum above supersedes that current-readiness conclusion and records **Ready**.
