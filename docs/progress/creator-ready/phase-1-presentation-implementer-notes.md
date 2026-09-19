# Phase 1 presentation implementer notes

## Decisions

- T2 sends e-mail and Google sign-ups to `/onboarding`; sign-ins continue to `/studio`.
- T4 uses native document-control folds and keeps Brain's three document sections before supporting panels.
- T5 preserves `null` for unreadable courtesy brain-state reads, names documents in force, and shows a voice-document remedy when another document is active.
- T6 stores disclosure traceability but hides only flag-level `/disclosure/` rows from the creator traceability list. Claims remain unfiltered. R-127 records the residual.
- T7 uses one native pre-form fold per panel. `initialState` is an internal test-only panel prop, source-scanned to keep it out of app call sites.
- The disclosure traceability fixture includes a creator-owned TikTok proper noun and a separate disclosure TikTok token. This keeps both directions of the disclosure-scope mutation observable.

## Files changed

- `respin/app/(auth)/auth-form.tsx`, `respin/e2e/support/auth.ts`, `respin/app/(product)/nav.tsx`
- `respin/app/(product)/brain/brain-view.tsx`
- `respin/app/(product)/studio/copy.ts`, `run-copy.ts`, `generation-outcome.tsx`, `studio-panel.tsx`, `studio-view.tsx`, `page.tsx`
- `respin/app/(product)/onboarding/first-ideas/copy.ts`, `page.tsx`, `first-ideas-panel.tsx`
- `respin/app/(product)/results/page.tsx`, `docs/initial/decisions.md`
- `respin/tests/auth-form.test.tsx`, `brain-ui.test.tsx`, `studio-ui.test.tsx`, `first-ideas-ui.test.tsx`, `results-page-wiring.test.tsx`, `page-wiring.test.tsx`, `claims-vocabulary-agreement.test.ts`

## Validation

- `pnpm -C respin exec vitest run tests/auth-form.test.tsx tests/page-wiring.test.tsx` — 21 passed after T2.
- `pnpm -C respin exec vitest run tests/brain-ui.test.tsx` — 130 passed after T4.
- `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx` — 195 passed after T5.
- `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx tests/claims-vocabulary-agreement.test.ts` — 207 passed after T6.
- `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx tests/page-wiring.test.tsx tests/results-page-wiring.test.tsx tests/claims-vocabulary-agreement.test.ts` — 247 passed after T7.
- `pnpm -C respin exec vitest run tests/auth-form.test.tsx tests/brain-ui.test.tsx tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx tests/page-wiring.test.tsx tests/results-page-wiring.test.tsx tests/claims-vocabulary-agreement.test.ts` — 389 passed.
- `pnpm -C respin exec tsc --noEmit` — passed.
- Historical early typecheck note: recursive package typecheck was then blocked; the later core-owner green report below supersedes it.

- `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx tests/page-wiring.test.tsx tests/claims-vocabulary-agreement.test.ts` — 223 passed after the AC12 presentation mutation cohort restored.
- The core owner reported the later integrated full typecheck green after fixing package tuple typing; the presentation owner did not re-run that broader command during this mutation-only pass.
- Detailed mutation evidence, failed assertion identities, exit codes, and byte-restore hashes: `docs/progress/creator-ready/phase-1-mutations-presentation.txt`.
## Unresolved work

- AC12 presentation mutation witnesses are complete; no mutation residual remains on owned targets.
- Remaining mutation obligation: the disjoint T1/T3 cohort is core-owned; no presentation witness remains.
- The mandated Phase 1 screenshot is not produced by this implementation pass.

## Weakest bet

- The native-fold source closure is a maintained eight-file list; a new wrapper component would need to be added to that list.

## Batch 0 repair follow-up

- GEN01 removes the duplicate Free access sentence from Results promotion copy;
  a real Results page render counts it once.
- GEN02 adds the complete Studio voice-condition matrix, failed-history
  literal/reload coverage, and failed-history honesty-scan fixtures.
- GEN03 makes both traceability suites use the four-row two-offer fixture and
  adds all-disclosure, hard-disclosure, heading, and provenance assertions.
- GEN04 adds four whole-panel fold checks with exact literal fold text,
  test-id set equality, and source-closure positive control.
- GEN05 upgrades the initial-state guard to a TypeScript AST check for one
  prop declaration, one destructure, and one named generation-hook forward;
  it includes isolated forwarding and destructure controls.

Batch focused validation: `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx tests/page-wiring.test.tsx tests/results-page-wiring.test.tsx tests/claims-vocabulary-agreement.test.ts` - exit 0; 255 passed.

Batch mutation validation is recorded in
`docs/progress/creator-ready/phase-1-mutations-presentation.txt`; every Batch
0 target was byte-restored. The weakest bet remains the maintained eight-file
native-fold closure list.

Owned Batch 0 lint passed with `pnpm -C respin exec eslint 'app/(product)/results/page.tsx' 'tests/results-page-wiring.test.tsx' 'tests/studio-ui.test.tsx' 'tests/first-ideas-ui.test.tsx' 'tests/page-wiring.test.tsx' 'tests/claims-vocabulary-agreement.test.ts'`; `pnpm -C respin exec tsc --noEmit` also passed.
# Phase 1 Batch 0 presentation repair

## Disposition

- **P1-GEN-01:** Results renders the shared Free view-only sentence once. The log block keeps the history/access context; promotion copy states only its separate proposal boundary. A real `ResultsPage` render counts the shared sentence across its actual children.
- **P1-GEN-02:** Studio tests cover Voice, Strategy-only, Kill-test-only, empty, and unreadable document conditions; unreadable Studio and first-ideas states assert the literal reload remedies and enter both honesty scans.
- **P1-GEN-03:** Studio and first-ideas each use the exact four-row `5`/`Dorset`/platform-`TikTok`/guidance-`AI` fixture with exactly two offers. Creator-owned TikTok remains a separate Studio control. Both surfaces cover heading, provenance count/limit, all-disclosure, and hard-disclosure cases.
- **P1-GEN-04:** The four injected usable/refusal panel cases assert one fold, exact folded text, exact folded test-id set, and required whole-panel placement. The source-closure scan keeps the enumerated eight-file fold boundary and has a positive control.
- **P1-GEN-05:** The initial-state guard parses TypeScript ASTs and independently requires one prop declaration, one panel destructure, and one named `action` hook forwarding. Isolated forwarding and destructure plants are covered.

## Validation

- Red before GEN-01 fix: `pnpm -C respin exec vitest run tests/results-page-wiring.test.tsx` - exit 1; real page count was 2, expected 1.
- Restored focused suite: `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx tests/page-wiring.test.tsx tests/results-page-wiring.test.tsx tests/claims-vocabulary-agreement.test.ts` - exit 0; 255 passed.
- Owned ESLint: `pnpm -C respin exec eslint 'app/(product)/results/page.tsx' 'tests/results-page-wiring.test.tsx' 'tests/studio-ui.test.tsx' 'tests/first-ideas-ui.test.tsx' 'tests/page-wiring.test.tsx' 'tests/claims-vocabulary-agreement.test.ts'` - exit 0.
- TypeScript: `pnpm -C respin exec tsc --noEmit` - exit 0.
- Real-target mutation results and SHA-256 restorations: `docs/progress/creator-ready/phase-1-mutations-presentation.txt`.

## Weakest bet

The maintained eight-file native-fold closure must be extended when a new rendering wrapper joins either panel tree.
