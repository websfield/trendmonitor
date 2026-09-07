# Slice 4c report card - Phases 1-4 closure

**Readiness: Ready**
**Date: 2026-08-31**
**Plan: [`respin-finish-master-plan.md`](../plans/respin-finish-master-plan.md) | Prior aggregate review: [`respin-finish-phases-1-4-review-2026-08-30.md`](respin-finish-phases-1-4-review-2026-08-30.md)**

The implementation, complete browser acceptance, integrated entry gate, specialist gates, final general code review, and real-model debit/cost-retention path are complete. C1-C7 are evidenced on the current tree, so the phases 1-4 aggregate returns to **Ready** and Slice 5 is unblocked.

## C1 - honest entry gate

PASS on the current shared tree:

- TypeScript: root plus auth/config/credits/db/llm packages.
- Full repository ESLint.
- Drizzle migration drift check.
- CI-shaped Vitest with real PostgreSQL: **81 files / 1663 tests / 0 skipped**. An initial full-load-only CLI timeout passed 9/9 in isolation and the unchanged full rerun passed 1663/1663.
- Next production build, including every product/admin/API route.

## C2 - creator-reachable no-store safety check

The onboarding surface now submits a candidate draft to a server action that derives workspace and the member's selected profile server-side. Preview and hard write use the same pure echo/retained-quote-budget decision; the write always reloads the current corpus. No client profile id, corpus id, or preview token is accepted.

The hydrated browser walk refused an eight-segment overlap with actionable, bounded evidence. Complete before/after fingerprints and row counts for all 13 relevant workspace-scoped tables were identical, and the unique candidate sentinel appeared in none of them. The panel also says plainly that the check uses no model or credits, stores neither candidate nor result, does not guarantee originality, and is re-run when a real write occurs.

Evidence: [no-store refusal](respin-finish/evidence/slice4c-no-store-refusal-beta.png).

## C3 - browser evidence

The complete browser path passed:

- Hydrated no-store refusal plus database inspection.
- Two creator profiles created and selected in a production build.
- Posts and Brain documents remained isolated through repeated switching.
- Direct visits to `/usage` and `/settings/billing` succeeded.

Evidence: [profile Beta Brain](respin-finish/evidence/slice4c-beta-brain.png) and [profile Alpha Brain](respin-finish/evidence/slice4c-alpha-brain.png).

Under explicit user authorization, a fresh disposable Free workspace made exactly two real Anthropic calls. Call 1 used 756 input / 1,093 output tokens and cost USD 0.018663; call 2 used 756 input / 1,293 output tokens and cost USD 0.021663. Total vendor cost was **USD 0.040326**, below the USD 5.00 cap. The second call created one genuine `-50` inference debit, and `/usage` showed 50 spent / 50 remaining. Evidence: [metered Usage](respin-finish/evidence/slice4c-metered-usage.png).

The fail-closed admin route then showed the retained August 2026 Free-tier row as `$0.04`, 2 calls, 0 unpriced calls, `reconciled`. Evidence: [model spend before deletion](respin-finish/evidence/slice4c-model-spend-before-deletion.png). A clearly labelled, precondition-locked local fixture pseudonymised that one rollup and deleted that one disposable workspace in the same transaction; it does not claim a production deletion executor exists before Slice 10b-2. Post-transaction inspection proved the old workspace, model-usage detail, credit ledger, and old-ID rollup were gone, while one pseudonymised rollup retained 40,326 micro-USD and 2 calls. The live admin report classified it `orphaned` with zero drift. Evidence: [model spend after deletion](respin-finish/evidence/slice4c-model-spend-orphaned.png). No further vendor call was made.

## C4 - reconciliation reachability

Resolved by honest removal. No authenticated provider webhook, durable job, or operator import owns a corrected-cost payload, so the exported `applyReconciliationDelta`, its private signed-delta writer, typed error/copy/lint plumbing, `model_usage` UPDATE allowance, and mutation-only tests were removed.

The live new-call spend UPSERT, retained `unknown_call_count`, deletion pseudonymisation instrument, and read-only reconciliation/orphan/drift report remain. Structural tests refuse a new production reconciliation mutator or `model_usage` UPDATE until a real integration owns it. Current-truth overrides are recorded in the governing spec, decision R-60, plan/card history, open-items register, aggregate review, and ledger.

## C5 - first-login scope race

`/usage` and `/settings/billing` now use the bootstrap-then-scope authority. Unit witnesses model concurrent layout/page rendering, and the real-PostgreSQL bootstrap race converges on one workspace. Both pages were also visited directly in the production browser build.

## C6 - usable multi-profile selection

Added per-membership selected-profile storage with composite membership/workspace and profile/workspace foreign keys, active-only scoped selection, unambiguous one-profile backfill, and atomic create-and-select under the existing workspace lock. Onboarding, interview, Brain reads/actions, and export links bind the displayed selected profile; missing or stale selection produces an explicit chooser and never falls back to `profiles[0]`.

The browser walk created two profiles with distinct posts and Brain documents, switched in both directions, and asserted each view contained its own sentinel and not its sibling's. Cross-tab list-snapshot races are handled by membership-verifying and merging the selected profile rather than silently reverting to list order.

## C7 - status truth and gates

| Gate | Result |
|---|---|
| Respin brain tenancy (Full) | **PASS - Ready/A** after the cross-tab fix |
| Respin billing & credits (Full) | **PASS - A**, scoped round 2 after map/comment fixes |
| Respin spin compliance (safety path) | **PASS - Ready/A** |
| Final code review | **PASS - Ready/A, zero findings** |

The aggregate phases 1-4 review is closed by its dated Slice 4c addendum, and the master progress table records this slice as complete. Slice 5's preserved additive implementation may now enter its own review and closure lane.

## Current residual

None blocking Slice 4c. The browser exercise deliberately used a local, guarded deletion fixture because the production deletion executor belongs to Slice 10b-2; this card claims only the spend-retention/orphan behaviour exercised above. The disposable workspace was deleted and is not recoverable through the product; its spend survives only under an unlinkable pseudonym. The disposable auth user remains solely as a local acceptance identity.
