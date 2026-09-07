# Slice 9b stable review manifest

**Frozen contract:** `docs/plans/respin-finish-phase-9b.md`, SHA-256 `3B21162AC1563BC5FED2E62970E30DE113D25B4FC12CAC1FACED77BE45D8A36C`.

**Review state:** complete on 2026-09-05; browser acceptance remains externally blocked. The repository began as an untracked working tree, so reviewers inspected the exact phase surfaces below rather than inferring scope from `git diff`.

## Exact phase surfaces

- Brain authority: `respin/packages/brain/src/{proposal,comparison,vocabulary,index}.ts` and their tests.
- Config and schema: `respin/packages/config/src/{schema,migrate-config}.ts`, config tests, `respin/packages/db/src/seed.ts`, `respin/packages/db/src/{promotion-schema,onboarding-schema,generation-schema,schema,creator-data-registry}.ts`, migration `0033_pale_shiver_man.sql`, its journal/snapshot, and promotion/migration tests.
- Scoped persistence and ceremony: `respin/packages/db/src/{promotion-ops,brain-content,brain-reason,brain-ops,results-schema,results-comparison-ops,results-ops,with-workspace,app-server,index,export,errors}.ts` and focused promotion, result, scope, export, reference, content, reason, schema, migration, and concurrency tests.
- Billing and runway: `respin/packages/credits/src/{mode-access,app-server,days-to-empty,errors}.ts` and entitlement, runway, isolation, and live-DB tests.
- Reachable UI: `respin/app/(product)/results/**`, `respin/app/(product)/brain/**`, `respin/app/(product)/usage/**`, and `respin/app/(product)/billing-errors.ts`; includes the server-bound Results actions and client-safe `promotion-state.ts` split.
- Cross-cutting instruments: `respin/tests/{feedback-readers,table-writers,profile-cage,gate-completeness,import-boundary,client-bundle-boundary,results-comparison,results-entry,results-honesty,results-page-wiring,brain-usage-9b-ui,usage-burn-by-mode,page-wiring,first-login-pages,selected-profile-pages,studio-ui,framework-ui,symbol-citations}.test.*`.
- Canon and closeout: `docs/initial/{decisions,tech-spec}.md`, `docs/plans/respin-finish-master-plan.md`, `docs/progress/respin-finish-open-items.md`, this manifest, the 9b card, and the append-only ledger.

## Earned verification

- Focused integrated implementation: 31 files / 1,384 tests / 0 failed.
- Live PostgreSQL migration, config, and promotion concurrency: 3 files / 7 tests / 0 failed / 0 skipped.
- Repaired integration regressions together: 14 files / 381 tests / 0 failed.
- Static gate: typecheck 0, worker typecheck 0, lint 0, and `db:check` clean on the final tree.
- Final zero-skip canonical run executed 169 files / 4,382 tests / 0 failed / 0 skipped. It then exited 1 only on the recorded `9a-G1` `onTaskUpdate` reporter timeout, so the canonical gate is not called green. Earlier stable-tree canonical runs exited 0; they do not overwrite this later evidence.
- Final production build exit 0; local production server Ready at `http://localhost:8000` against the migrated local database.

## Explicit non-evidence

- Browser acceptance is blocked by an admin-enforced localhost policy. Alternate browser surfaces and circumvention are explicitly prohibited; no screenshot or HTTP substitute is accepted.
- 9a remains `ALMOST`; its prior `9a-G1` non-zero harness exit and browser block are not closed by 9b's clean test run.
- `connector_verified` has no v1 writer, and PRD §5 product-efficacy evidence requires the post-M6 real-creator pilot.

## Required reviewer verdicts

Run the Full billing/credits and brain-tenancy gates separately; run learning-honesty and Spin/no-guarantee compliance against their exact checklists; run the general code review last, followed by the additive simplification pass. Findings must identify file and line, severity, violated invariant, concrete failure path, and the narrowest safe fix. Browser absence is already classified and must not be relabelled as code evidence.

## Round 1 findings and stable repair tree

Specialist round 1 returned billing PASS and ten distinct findings with two overlaps across tenancy, learning honesty, and compliance. The repaired tree now:

- requires explicit unchecked-by-default confirmation of every current claim before Accept while Reject submits an empty set;
- derives proposal observation envelopes and declaration membership only from exact immutable joined evidence;
- validates a non-empty `metricDeclaredByDocIds` set and uses a both-axis-scoped SQL `IN` predicate;
- preserves finite numeric Performance Meta claims through history;
- renders terminal decision actor id/role/time and the exact deleted-actor label;
- emits a dedicated Performance Meta Markdown record with signed observational wording and adjacent non-causal/non-forecast disclosure;
- uses neutral performance-record wording and scans the actual rendered reason, full-review state, entitlement states, and Markdown;
- fails closed rather than calling a missing signed effect “level”.

Parent repair evidence: 17 files / 556 tests / 0 failed; typecheck, worker typecheck, lint, and `db:check` exit 0; live PostgreSQL migration/config/promotion concurrency remains 3 files / 7 tests / 0 failed / 0 skipped. The post-repair canonical run reported 169 files / 4,371 tests / 0 failed / 0 skipped but exited 1 solely with the known `9a-G1` unhandled `onTaskUpdate` timeout; it is not called green. The post-repair production build exits 0 and the rebuilt local app reached Ready on port 8000. This is the stable round-2 specialist target; no code changed after these checks.

Round 2 returned billing PASS and tenancy PASS. Learning and compliance each identified one narrow remaining Results assertion gap: the exact metric tuple sentence omitted `label`, and the Free/configuration claim scan duplicated strings instead of executing `ResultsPage`. The final narrow patch names `{key,label,unit,direction}` and runs/scans the real page branches. Parent verification passes 2 files / 57 tests plus typecheck, worker typecheck, lint, and `db:check`. This is the stable final-general-review target. No third specialist round is claimed.

The final general review then found one BLOCK in the inherited Results action: a half-completed lever pair was dropped to `undefined`, allowing an append-only unquantified success. The repaired action omits a lever only when both halves are blank; a one-sided pair reaches the sole DB writer with the missing half preserved as blank and receives the named `ResultInputError`. Four action cases prove refusal/no revalidation and four real PGlite writer cases prove zero inserted rows for reach/conversion × value/denominator missing. Parent verification passes the complete owned Results set at 7 files / 217 tests plus typecheck, worker typecheck, lint, and `db:check`. This is the stable final-review recheck target.

The exact-path final reviewer recheck returned PASS: the action omits only an all-blank pair, the writer refuses either missing half before insert, and all eight action/PGlite cases hold. The additive simplification review found only optional deletions; none were applied because each would trade away explicit audit seams for no behavioural reduction.

A final closeout audit then found two frozen-contract residuals still described but not implemented. The repair registered `credit_ledger` and its two production writer modules in the exact-writer scanner, and rewrote `/usage` to render all three current creator-paid charge paths with a source-derived `autopsy_claim` guard. The focused money/UI/writer set passes 4 files / 424 tests, and the final six boundary suites pass 309/309. These close 9a-D3 and 8c-W2 without changing any reviewed money operation.

Because that was a post-review diff, the existing final reviewer rechecked the exact three files. It found two Low truth defects confined to the new commentary: obsolete writer function names and a stale “both” statement that conflated the two `inference` purposes with the direct `autopsy_claim` debit. Both were corrected; 4 files / 424 tests and targeted ESLint pass, and the reviewer's exact-fix recheck returned PASS. This is the final-tree review verdict.
