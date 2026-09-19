# Respin visual v2 plan review

Overall: **Not yet**. Batch 0 in progress; construction has not started.

## Scope and evidence

Assessed contract: `docs/plans/respin-visual-v2-master-plan.md`, phase plans 1–3, `respin-visual-v2-codebase-review.md` and `respin-visual-v2-audit.md`. User authorized both planning and implementation. New gate created this session, no inherited review history. Canonical plan gate ran lean (consolidated) for compliance/learning, with billing and tenancy separate and final plan generalist separate/last.

Actual dispatches: `/root/plan_billing`, `/root/plan_tenancy`, `/root/plan_honesty`, each explicitly requested `gpt-6-astra` / `ultra`. Actual resolved runtime model/effort is unexposed. Final generalist slot reserved but not launched yet. Batch-0 specialist evaluations consumed: 3. Retry batches 1–2 remain available; none used yet.

Pre-change focused baseline: `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/shell-rail.test.tsx tests/brain-ui.test.tsx tests/landing-pricing.test.ts` passed 4 files / 324 tests. No full application entry gate or live provider/billing run claimed. `http://localhost:8000/` read-only probe returned ECONNREFUSED. Supplied prototype inspected with installed Playwright; light and dark screenshots captured under `.tmp/`.

## Batch 0 findings and original verdicts

### Billing — PASS

Original reviewer headline: Ready / Grade A for the billing plan only; 0 BLOCK/High/Medium, 1 Low. All eight billing checklist dimensions assessed against the planned preservation of the existing authorities and relevant source/tests. Reviewer ran read-only source inspection, no application tests or live writes.

- **B-V2-01 — Low, high confidence:** phase 2 Least confident incorrectly says GenerationOutcome renders within Trends. Trends has a separate SpinOutcome. Editorial correction pending; existing phase-3 Trends obligations remain.
- Reviewer original report stated Studio was the only production caller. Root's fresh `rg -n 'GenerationOutcome|generation-outcome' respin/app` additionally found `onboarding/first-ideas/first-ideas-result.tsx:31,78`. That incomplete coverage statement is preserved here as a correction, not silently presented as verified evidence. The combined reviewer is assessing the phase-2 test impact.
- Authority qualification: current tech-spec chronological lot fold and soonest-effective-expiry allocation supersede the older checklist's naive unexpired sum / oldest-first language. This redesign preserves current authority.

### Tenancy — NEEDS CHANGES

Original workflow readiness Not yet. One High, high-confidence finding; no other tenancy finding reported. All eight numbered tenancy dimensions assessed. No files edited by reviewer.

- **T-V2-01 — High, high confidence; invariant `scoped-data-stays-scoped`:** phase 2's mounted Studio state owner lacks an explicit workspace/profile transition boundary. Existing page/view supply profileName and bound actions; preserving the tree can preserve another profile's input/result/lineage/feedback. Theme preservation and scope isolation require distinct state-lifetime rules. Repair pending.
- Reviewer executed an in-memory Playwright component probe of actual StudioView/StudioPanel, esbuild `write:false`: render Profile A with a private lineage note, rerender Profile B with fresh actions and empty initial state. Observed `beforeProfileA=true`, `beforeContainsA=true`, `afterProfileB=true`, `afterContainsA=true`. Component evidence only; no authenticated route, provider or billing execution.
- Phase 1 theme-storage restriction and phase 3 evidence/approval/history preservation had no additional tenancy finding. The current REQ-B02 per-field evidence amendment is respected; withdrawn confidence fields must not return.

### Compliance and learning — pending

The combined context is still evaluating the frozen plan. No verdict claimed.

### Final generalist — pending

Reserved for after every specialist returns, on the same frozen contract. No assessment claimed. Material repairs require affected retry evaluation under the same gate allowance.
