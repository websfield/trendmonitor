# Phase 10b-1 Task 4 review manifest

Status: built 2026-09-07; round-1 gates BLOCK → every finding fixed; round-2 gates NEEDS CHANGES on every path with no BLOCK → every Medium item fixed the same day under the pack's two-round rule (contract, "Round-2 gate fixes"); the canonical gate on the final tree is recorded under "Canonical gate (round-2 tree)" below. Task 3 (Grade A / Ready) is preserved.

## Contract under review

Task-sequence item 4 of `docs/plans/respin-finish-phase-10b-1.md`, bounded in `10b1-task4-contract.md`: the closed Resend auth-delivery authority with budgets and receivers, the external-command outbox with reconciliation, the production worker executor, populated fixtures and cross-scope tests. Task 5 (S3 journal, cost forecast, backup/restore), Task 6 (finance extractor and remaining receivers), Task 7 (activation classifier), Task 8 (owner UI, privacy copy) and Task 9 (registration API) are out of scope. No feature flag is enabled; production composes a refusing journal until Task 5.

Reviewers must block Task 4 for defects in: command identity before dispatch; unknown outcomes stepping forward or being retried as new; the quota admission race; a dropped or indeterminate send reported delivered; secret material stored or logged; erasure running without a durable journal version; a non-zero residue committing; a stub receipt that still names the erased target; tenancy leakage through the sentinel subjects or the generic SQL port; a scope's erasure running while its enablement is off; the worker importing beyond its sanctioned surface.

## Frozen implementation surface

Database package (`respin/packages/db/src/`):

- `lifecycle-schema.ts` (`deletion_external_commands`), `auth-mail-schema.ts` (`auth_mail_outbox`), `drizzle.config.ts`
- `deletion-external-commands.ts`, `auth-mail.ts`, `deletion-executor.ts`, `lifecycle-sql-port.ts`, `lifecycle-subjects.ts`
- `deletion-lifecycle.ts` (Task-3 seam only: exported `prepareJournalPlan`, `appendJournalTransitionInTx`, `databaseNow`, `JournalPlanStep`; `validateWorkerTransitionInTx` replacing the Task-3 placeholder; a `tx` argument on the plan validator callback)
- `creator-data-registry.ts`, `lifecycle-executors.ts`, `lifecycle-probes.ts`, `index.ts`
- migrations `0050_external_commands.sql`, `0051_auth_mail_outbox.sql`, `0052_deferrable_transition_identity_fk.sql` and their snapshots/journal

Auth package (`respin/packages/auth/src/`): `resend-mail.ts`, `create-auth.ts`, `server.ts`, `index.ts`.

Credits package (`respin/packages/credits/`): `src/stripe/deletion-commands.ts`, `src/deletion-server.ts`, `package.json` (`./deletion-server` export).

Worker (`respin/worker/`): `deletion-lifecycle.ts`, `pg-boss-runtime.ts`, `production.ts`, `main.ts`, `health.ts`.

App and boundary: `respin/app/(product)/billing-errors.ts` (copy for the two mail refusals), `respin/eslint.config.mjs`, `respin/env.example`.

Round-1 fix pass additions to the surface: `packages/credits/src/stripe/webhooks.ts` (spreads `AUTO_TOPUP_DISARMED_FIELDS` into the dead-subscription reset), `packages/db/src/lifecycle-executors.ts` (`stripeCustomerIds` on the workspace subject), `packages/db/src/creator-data-registry.ts` (snapshot `workspace_link` entry, the RESTRICT-into-root closure rule, `DYNAMIC_LIFECYCLE_WRITER`), `packages/db/tests/lifecycle-scrub-rules.test.ts` (new), `packages/db/tests/lifecycle-probes.test.ts` and `auth-mail-quota.docker.test.ts` (fixture shapes).

Tests added: `packages/db/tests/{deletion-external-commands,auth-mail,auth-mail-quota.docker,deletion-executor,deletion-executor.docker}.test.ts`, `packages/auth/tests/{resend-mail,auth-mail-wiring}.test.ts`, `packages/credits/tests/deletion-commands.test.ts`, `worker/tests/deletion-lifecycle.test.ts`. Tests updated with reasoned registry entries: `tests/{table-writers,symbol-citations,feedback-readers,retention,import-boundary}.test.ts`, `packages/credits/tests/isolation.test.ts`, `packages/db/tests/{brain-schema,deletion-lifecycle}.test.ts`.

## Implemented behaviour to grade

- Every external side effect is a durable command row before dispatch; the dispatch mark fences racing dispatchers; `unknown` blocks `grace`, `erasing`, cancellation and erasure until reconciled; `failed` blocks and retries up to three attempts; terminal rows accept only identical replays.
- Auth mail: one advisory-locked admission against compiled ceilings with a derived security reserve; tighten-only override; exact TTLs; content-free rendering; provider acceptance recorded as a digest; reconciliation without plaintext resolves only to confirmed-from-durable-acceptance or failed; 90-day receiver; identity-erasure recipient scrub. Resend adapter classifies exchanges honestly and pins its origin.
- Executor: lease per operation; reversible fences before grace; irreversible commands and row erasure only after `grace_expires_at` and per-scope enablement; the erasure transaction captures subjects, journals, runs the registry executors through the SQL port, runs the independent probes, journals again, and rolls back on residue. Retained receipts are repointed at random stub roots; the transitions composite FK is deferrable for that transaction; the requester digest is replaced per operation on identity erasure.
- Populated proofs per scope in `deletion-executor.test.ts`; lease exclusivity and quota atomicity on real PostgreSQL.
- Round 1 added: the auto-top-up fence's four-field contract shared with the webhook reset; cancellation refuses on an unknown fence and enqueues the reopen only for its own period-end fence, dispatched by the executor under the attempt bound; the financial-chain gate (executor and worker startup) while `credit_ledger`/`subscriptions`/`pause_periods` cascade; enablement re-read at every irreversible step; a rolled-back erasure releases its reservation and becomes `blocked` with the code on the row; the reserve floor in `resolveAuthMailCeilings`; the RESTRICT-into-root closure rule; the probe's independent check of every governed receipt column and JSON path; the scrub-rule classifier walked over the registry.

## Least-confident declaration (author)

The generic SQL port's per-column scrub rules (link → stub or NULL, digest-like → NULL or random, provider ids → token, NOT NULL uuid/text → random) were driven to green on the populated fixture; a table the fixture does not populate could still carry a column shape the rules refuse, which would surface as a `lifecycle_executor_refused:cannot_pseudonymise` block on first real erasure rather than as silent residue. Probe that first.

## Verification evidence (this frozen candidate)

- Focused: outbox 10/10; auth-mail 16/16; adapter 4/4; wiring 5/5; docker quota 1/1; executor 6/6; docker lease 1/1; Stripe adapter 7/7; worker 13 files / 96 tests; registry closure, probes, writer scanner, migration, export, retention and boundary gates green after the reasoned entries (9 files / 646 tests).
- `pnpm typecheck` 0, `pnpm lint` 0, `pnpm worker:typecheck` 0, `pnpm db:check` clean.
- Canonical `pnpm test`: 167 files / 4,588 tests passed, the 22 live-Postgres files (98 tests) loud-skipped, exit 0 (`entry-gate-task4-pglite.txt`). Live-Postgres `vitest run docker --no-file-parallelism`: 22 files / 98 tests passed, zero skipped, exit 0 (`entry-gate-task4-docker.txt`). Together all 189 files / 4,686 tests executed and passed. `pnpm build`: compiled successfully, exit 0 (`entry-gate-task4-build.txt`). Documentation scans re-run after the README/runbook edits: 4 files / 57 tests green.

## Round 1 (2026-09-07)

| Critical path | Reviewer | Verdict | Report |
|---|---|---|---|
| Respin billing & credits (full) | `respin-billing-reviewer` | BLOCK · Grade D · 2 BLOCK / 2 CHANGE / 3 NOTE | `10b1-task4-gate-billing-round1.md` |
| Respin brain tenancy (full) | `respin-tenancy-reviewer` | BLOCK · Grade D · 1 BLOCK / 4 CHANGE / 5 NOTE | `10b1-task4-gate-tenancy-round1.md` |
| Respin spin compliance (lean) | consolidated | NEEDS CHANGES · Grade B · 3 CHANGE | `10b1-task4-gate-lean-round1.md` |
| Respin learning honesty (lean) | consolidated | NEEDS CHANGES · Grade A- · 2 CHANGE | same |
| Code / security / state machine (lean) | consolidated | BLOCK · Grade B- · 1 BLOCK / 4 CHANGE | same |

Every BLOCK, CHANGE and NOTE was fixed in one pass on 2026-09-07; the contract's "Round-1 gate fixes" names each fix and its witness. The author's least-confident line was probed by two reviewers independently: the scrub rules cannot refuse on the current registry, and the real unpopulated-table defect was at foreign-key level (the tenancy BLOCK), now closed by a registry rule rather than a row.

## Least-confident declaration after round 1 (author) — superseded

The orphaned journal version after a rolled-back erasure. Three reviewers judged it an executor defect under R-124's never-overwrite store, not an adapter question; round 2 closed it by appending both receipts after the probes inside the erasure transaction (no orphan, no reuse).

## Round 2 (2026-09-07)

| Critical path | Round 1 | Round 2 | Report |
|---|---|---|---|
| Respin billing & credits (full) | BLOCK · D | NEEDS CHANGES · B- · 0 BLOCK / 3 CHANGE / 4 NOTE | `10b1-task4-gate-billing-round2.md` |
| Respin brain tenancy (full) | BLOCK · D | NEEDS CHANGES · B · 0 BLOCK / 3 CHANGE / 4 NOTE | `10b1-task4-gate-tenancy-round2.md` |
| Respin spin compliance (lean) | NEEDS CHANGES · B | NEEDS CHANGES · B+ | `10b1-task4-gate-lean-round2.md` |
| Respin learning honesty (lean) | NEEDS CHANGES · A- | NEEDS CHANGES · B+ | same |
| Code / security / state machine (lean) | BLOCK · B- | NEEDS CHANGES · B | same |

Every round-1 BLOCK and CHANGE was confirmed CLOSED by the round-2 reviewers with witnesses they ran. Every round-2 CHANGE and NOTE was fixed in one pass (contract, "Round-2 gate fixes"); under the pack's rule (max two rounds; Medium and below fixed without re-review and listed on the card) there is no round 3, and the report card lists them.

## Least-confident declaration after round 2 (author)

The erasure-failure bound uses `retry_count` as the operation's whole failure budget: three real failures of any kind (not waits) before the blocked path stops resuming an erasure. A workspace that failed twice on something unrelated earlier in its lifecycle reaches the operator after one residue instead of three. Fail-closed and visible, but the budget is shared where a dedicated counter would be cleaner; Task 8's operator surface should show the count.

## Canonical gate (round-2 tree)

Run sequentially on an idle host after the round-2 docs landed, from the finished transcripts: default `pnpm test` 168 files / 4,608 tests passed, 22 files / 98 tests loud-skipped, 0 errors, exit 0 (`entry-gate-task4-r2-pglite.txt`); live-Postgres 22 files / 98 tests passed, zero skipped, exit 0 (`entry-gate-task4-r2-docker.txt`); together 190 files / 4,706 tests; `pnpm build` exit 0, 0 warnings (`entry-gate-task4-r2-build.txt`); typecheck, lint, worker typecheck, db:check clean. The first default-suite attempt ended in a vitest worker RPC timeout under reviewer load with every test passing; it is kept as `entry-gate-task4-r2-pglite-attempt1-rpc-timeout.txt` and was not counted.

## Report card

**Ready (engineering) · evidence completion separate.** Billing B- → fixes landed; tenancy B → fixes landed; compliance B+ / learning B+ / code B → fixes landed; no round 3 by the pack's rule, every round-2 item fixed and listed in the contract's "Round-2 gate fixes". What remains is owned by later tasks and recorded in the open-items register (T4-R2/R3 Task 6 receivers; T4-R4 sweep wiring; T4-R5 Task 8 copy; T4-R7 live Stripe/Resend proofs; T4-R8–R12). No feature is enabled; every erasure scope is held by the executor and refused by the worker until Task 6; production composes a refusing journal until Task 5.

## Required reviewer output

Review the frozen tree described here, not an earlier diff. Return BLOCK/CHANGE/NOTE findings with file-and-line evidence, then an explicit Grade and Ready/Not Ready verdict per Critical Path touched: Respin billing & credits (full gate), Respin brain tenancy (full gate), Respin spin compliance and Respin learning honesty (lean, consolidated), and a code/security/state-machine review.
