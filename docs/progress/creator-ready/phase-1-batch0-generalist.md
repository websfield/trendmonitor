# Phase 1 implementation batch 0 — independent final generalist and merged compliance

Terminal whole-phase verdict: BLOCK, Not yet/Grade D. Local implementation: NEEDS CHANGES, Almost/C. Ten Medium, high-confidence findings; no High/BLOCK source defect established. One reserved evaluation completed, requested Astra/max, separate context; resolved runtime unverified.

Record integrity: parent restored this assessment from the original received independent report after a builder mistakenly replaced it with its repair notes. Those notes are preserved in phase-1-presentation-implementer-notes.md. This is the pre-repair verdict; author repairs do not close it.

## Snapshot and findings

All 48 manifest source entries, contract and lock matched before/after; changed/new inventory matched exactly. Complete diffs and four new files reviewed against pinned base. No repairs during assessment.

All findings below were unresolved, Medium/high confidence:

| ID | Snapshot location | Finding / bounded correction |
|---|---|---|
| BILL-P1-001 | respin/tests/onboarding-ui.test.tsx:1503 | Money-honesty scan omits three rendered pre-vendor states. Extend rendered scan, retain omission witness. |
| BILL-P1-002 | respin/tests/onboarding-ui.test.tsx:1624 | Preservation test checks names, not contents of ONBOARDING_ERROR_CODES/ONBOARDING_OVERRIDES. Independently pin initializers. |
| P1-TEN-01 | respin/packages/llm/tests/assemble-kinds.test.ts:320 | End-extension fixtures duplicate whitespace range; injected edge/surrogate cases missing; pure surrogate case also fails canonical equality. Add distinct isolated literal cases and repeat w2b/w2e. |
| P1-TEN-02 | respin/packages/llm/tests/assemble-kinds.test.ts:387 | Namespace override/local replacement evade mapper scan. Verify namespace calls and unchanged parameter-derived binding; plant both. No current production override found. |
| P1-TEN-03 | respin/app/(product)/onboarding/page.tsx:99; onboarding-view.tsx:270 | Listed scoped failure renders unexplained unknown. Keep unknown plus existing safe refusal/remedy, test real page path. |
| P1-GEN-01 | respin/app/(product)/results/page.tsx:173 | Actual render duplicates Free view-only sentence (count2). Keep once, assert real rendered count. |
| P1-GEN-02 | respin/tests/studio-ui.test.tsx:658,1951 | Incomplete voice-condition matrix, failed-history rendered remedies, new-state honesty scan. Add required conditions/renders/STATES members. |
| P1-GEN-03 | respin/tests/studio-ui.test.tsx:872; first-ideas-ui.test.tsx:551 | Studio substituted five-row/three-offer fixture for accepted four-row/two-offer fixture; firstideas lacks full mirrored heading/provenance-count/all-disclosure/hard-disclosure checks. Restore exact fixtures and preserve extra TikTok controls separately. |
| P1-GEN-04 | respin/tests/studio-ui.test.tsx:692; first-ideas-ui.test.tsx:667 | Missing exact fold text, firstideas usable count/set, refusal reason/sharper-angle placement. Complete four-state exact assertions. |
| P1-GEN-05 | respin/tests/page-wiring.test.tsx:280 | Scanner accepts isolated destructure removal. Verify prop declaration, destructure and named generation-hook forwarding; add isolated control. |

Five specialist findings retained without duplication/severity changes. GEN02–05 and specialist test findings establish required assurance gaps, not corresponding production failures.

## Acceptance walk

| AC | Verdict | Basis |
|---|---|---|
| 1 | PASS | Closed kinds and throw-site coverage. |
| 2 | FAIL | TEN01/02; runtime held-out probes passed. |
| 3 | FAIL | BILL001/002; kind-only logging/static copy otherwise passes. |
| 4 | PASS locally | Auth destinations/navigation/support; live journey pending. |
| 5 | FAIL | TEN03 failure presentation. |
| 6 | PASS | Scoped accessor, mine/sibling/attempt-only/foreign/P4, registrations/PGlite. |
| 7 | PASS | Brain folds, draft-only opening, editor placement/document order. |
| 8 | FAIL | GEN02 rendered-state/honesty scan coverage. |
| 9 | FAIL | GEN03 exact acceptance coverage; runtime filtering holds. |
| 10 | FAIL | GEN01/04/05; screenshot pending. |
| 11 | PASS locally | Allowance/shared timestamp/copy/removal; live branch unrun. |
| 12 | PASS recorded evidence | Required21 plants plus extra literal w3b probe, reds/restore greens/hashes. No reviewer mutation of frozen files. |

## Critical-path dispositions

Billing NEEDS CHANGES, Almost/B. Checks1 ledger,2 idempotency/transactions,3 debit/vendor boundaries,4 expiry/pause/allocation,5 config/re-export-only,6 entitlement/shared clock,7 threshold provenance PASS for diff. Check8 required assurance fails BILL001/002. Specialist report retained.

Tenancy NEEDS CHANGES, Almost/B. Check1 scoping PASS;2 mechanism stripping unchanged;3 runtime provenance/append-only/approval holds but TEN01/02 assurance incomplete;4 sensitive inference unchanged;5 export/deletion unchanged;6 roles preserved;7 kind-only logging/sentinels PASS;8 coverage fails TEN01/02/03. Specialist report retained.

Merged Spin Compliance NEEDS CHANGES, Almost/C:
1. Sources PASS: YouTube API/submitted registry, no scraping dependency.
2. Similarity before display PASS: traced Spin→generation→gate→refusal/display; near-copy tests.
3. Minimum difference PASS: computed subject/hook/structure; paired presentation.
4. Kill-test honesty runtime holds, bounded rewrite/withholding; mandatory panel assurance fails GEN04.
5. Invented specifics runtime creator/hard findings/claims visible; flag-only disclosure exclusion; AC9 assurance fails GEN03.
6. No guarantees found; weakest point covered; new-state scan fails GEN02.
7. Automation/concealment PASS: no new posting/engagement/weakened flag; claims listed.
8. Autopsy cache/honesty PASS: cache, fixed stages, score/baseline/window/staleness intact.

Eight-file closure inspected: StudioPanel/FirstIdeasPanel one details each; FeedbackBlock/GenerationOutcome/LineageView/FirstIdeasResult/Banner/SubmitButton none. Enumerated imports covered, not a substitute for per-state assertions.

## Evidence and limits

Parent transcript observed: all seven commands exit0 (typecheck/lint/test/build/preflight/worker:typecheck/db:check);5203 tests passed/101 skipped,212 files passed/23 Docker skipped.

Reviewer executed:
`pnpm -C respin exec vitest run tests/auth-form.test.tsx tests/brain-ui.test.tsx tests/studio-ui.test.tsx tests/first-ideas-ui.test.tsx tests/page-wiring.test.tsx tests/results-page-wiring.test.tsx tests/claims-vocabulary-agreement.test.ts packages/modes/tests/spin-reference.test.ts packages/modes/tests/pipeline.test.ts packages/modes/tests/kill-test.test.ts packages/trends/tests/trends.test.ts`
Exit0;548 tests/11files, no skips.

Read-only probes: actual mapper/parser via node/tsx144 whitespace/astral/combining/nonfolding cases passed; actual ResultsPage/children via in-memory TS loader duplicate count2; exact committed AST-extracted scanner accepted baseline and erroneous missing-destructure control; before/after hashes48 matches/0differences. Specialist298/180 tests inspected, not claimed as generalist executions.

Fully read required canon, active phase contract, specialist reports, three implementer notes, two mutation records, four new files, principal presentation components. All48 complete diffs/new files reviewed; unchanged large modules inspected at relevant scoping/generation/similarity/kill-test/trend integrations, no full-body audit claim.

Live journeys and five screenshots remain PENDING: onboarding header, Brain, Studio notice, draft, Free Trends. Docker unavailable, required process variables absent; niche journey collected only. DoD lacks live reachability/visual proof, passing critical paths and Ready card. Separate reviewer context; cross-model Codex unavailable. No release/deploy/spending/Phase2 dispatch follows from this verdict.
