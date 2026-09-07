# Phase 10b-1 Task 3 final review manifest

Status: Grade A / Ready as of 2026-09-07; all five required final reviewer gates passed with zero BLOCK and zero CHANGE findings.

## Contract under review

This manifest covers task-sequence item 3 in `docs/plans/respin-finish-phase-10b-1.md`: shared membership locks; identity/profile/workspace request, tombstone, cancellation and recovery state machines; lifecycle read/write fences; and recovery-delivery plus external-journal linearisation through injected ports. It also covers the R-118 high-risk billing reauthentication and serialization work required so workspace lifecycle operations cannot race a payment capability.

Task 4 still owns the concrete closed Resend authority and quotas, durable external-command outbox/reconciliation, production worker executor, and the full populated cross-scope fixture. Task 5 owns the S3 journal adapter, IAM/policy, cost authority, and backup/restore machinery. No deletion feature flag is enabled by this change.

Reviewers must block Task 3 for defects in the implemented boundary: authority/role checks, exact-session fresh reauthentication, target/idempotency binding, last-owner rules, lock order, state transitions and grace cutoffs, delivery receipt binding, deterministic journal replay, login/session fences, cancellation replay, stale-scope rejection, job resurrection after tombstone, or payment mutations racing lifecycle/membership state.

## Frozen implementation surface

Lifecycle, tenancy, and persistence:

- `respin/packages/db/src/{auth-schema,auth-lifecycle,lifecycle-schema,deletion-ports,deletion-lifecycle,membership-lifecycle,lifecycle-inventory,lifecycle-executors,lifecycle-probes}.ts`
- `respin/packages/db/src/{with-workspace,profile-selection,bootstrap,frameworks,interview-ops,trends-storage,system-spend,creator-data-registry}.ts`
- `respin/packages/db/src/{app-server,schema,index}.ts`
- `respin/packages/auth/src/{create-auth,server,index}.ts`

R-118 and billing/lifecycle serialization:

- `respin/packages/credits/src/stripe/{actions,auto-topup,customers,webhooks}.ts`
- `respin/packages/credits/src/stripe/{auto-topup-authority,auto-topup-rollout,auto-topup-rollout-reconcile,auto-topup-v1-reconcile}.ts`
- `respin/packages/credits/src/stripe/{pack-checkout-authority,tier-checkout-authority,tier-checkout-rollout,tier-checkout-v1-reconcile,tier-invoice-authority}.ts`
- The corresponding bounded rollout/reconciliation CLIs under `respin/packages/credits/src/stripe/`
- `respin/packages/credits/src/{app-server,infer-voice,profiles,mode-access,errors,index}.ts`
- `respin/app/(product)/settings/billing/actions.ts`
- `respin/app/(product)/settings/billing/billing-view.tsx`
- `respin/app/(product)/billing-errors.ts`
- `respin/app/api/stripe/webhook/route.ts`
- owner-only selected-profile call sites under onboarding, Studio, and Usage that were aligned with the package authority

Schema history:

- `respin/packages/db/migrations/0035_oval_ironclad.sql` through `0046_minor_mephisto.sql`
- `respin/packages/db/migrations/0047_deletion_profile_prior_state_shape.sql`
- `respin/packages/db/migrations/0048_auto_topup_attempt_authority.sql`
- `respin/packages/db/migrations/0049_narrow_mentallo.sql`
- `respin/packages/db/migrations/meta/_journal.json` and corresponding snapshots through `0049_snapshot.json`

Verification-harness stability fixes discovered by the canonical gate:

- `respin/tests/table-writers.test.ts`: the CPU-heavy mutation witness yields between scans so Vitest worker RPC cannot time out; assertions and mutation population are unchanged.
- `respin/tests/safe-log.test.ts`: the product source walk ignores paths classified by the shared transient-probe registry, preventing a concurrent probe-removal race without excluding product files.
- `respin/vitest.config.ts`: the heavy writer mutation has an explicit bounded timeout.
- `respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts`: the last-owner racer deletes the membership inserted into the target workspace, and database guard assertions require PostgreSQL SQLSTATE `23514` plus the exact constraint name instead of matching Drizzle's wrapper text.
- `respin/packages/credits/tests/concurrency.docker.test.ts`: the Stripe PaymentIntent fixture carries the provider-required object `created` timestamp as well as the event timestamp.
- `respin/packages/credits/tests/inference-race.docker.test.ts`: the uncommitted-usage case follows the current lifecycle-fence order, proves the second writer is blocked through `pg_locks`, and releases the held transaction in `finally` so a failed premise cannot wedge teardown.

## Implemented behavior to grade

- Deletion request and cancellation identities are persisted authority bindings, not caller claims. Identity requests can resume from an operation id after durable journal reservation; cancellation can resume from its operation and exact bound proof.
- Identity recovery delivery is durable before tombstone acknowledgement. Pre-reservation delivery reconciliation does not require retained plaintext or a live session; unexpired failed delivery can replay under the same request and original expiry.
- Profile/workspace scoped drafts reset stale unreserved clocks, retain the current profile prior state through rebinds, and restore that exact state on cancellation. The seven-day deadline remains anchored to the original accepted request.
- Archived-profile delete/cancel goes through `WorkspaceScope`; foreign/malformed/nonexistent ids share the same non-enumerating refusal. Terminal scoped resumes and competing cancellation replays converge without reopening irreversible work.
- Tombstoned workspaces are excluded from bootstrap and from already-minted scope reads/writes. Membership, lifecycle, and billing locks follow one order and authoritative clocks are read after locks.
- Terminal request/session identity material is scrubbed to stable digests while preserving content-free replay receipts.
- Migrations 0046/0047 backfill stable requester digests, make raw identity links nullable only after backfill, preflight ambiguous legacy profile restore state, and enforce the exact `profile_prior_state` shape.
- Every one of the seven live Stripe payment/billing actions requires the exact current session's fresh password proof at the server action and package boundary. Owner role and lifecycle state are revalidated under membership/lifecycle/billing/subscription locks before local or Stripe mutation. UI forms collect the proof and editor/viewer paths remain blocked.
- Tier and pack checkout use durable customer mapping plus final locked revalidation. Tier retries use stable idempotency and concurrent different-tier starts collapse to the same open-checkout authority.
- Pack and tier attempts carry signed, provider-bound generation authority. Tier invoice settlement additionally requires exact signed invoice-time economic authority persisted beside the immutable Stripe event; event payloads are never rewritten to manufacture authority.
- Tier rollout transitions serialize with the config authority they validate. The durable customer mapping remains the sole workspace authority; signed provider metadata is only a cross-check, and recovery refuses a missing or conflicting mapping. Two event ids for the same invoice converge to one financial grant while retaining distinct replay receipts, including after workspace tombstoning.
- Auto-top-up now makes its decision and creates the PaymentIntent inside one database transaction after membership-graph and workspace lifecycle locks, uses the database clock for the monthly cap and idempotency period, and holds locks through provider dispatch. Concurrent disable, cap reduction, webhook-shaped pause, and workspace tombstone are pinned by real-Postgres race tests.
- Persistent owner-only behavior is aligned across onboarding, profile, trend/paste, promotion, and billing entrypoints; `ProfileRoleError` reports owner/editor requirements precisely.

## Verification evidence for this frozen candidate

Observed on the current frozen tree with `TEMP`/`TMP` redirected to `respin/.tmp`:

- `pnpm test`: PASS — 160 files and 4,526 tests passed. The 20 opt-in real-PostgreSQL files and their 96 tests skipped loudly in this default PGlite entry gate.
- Zero-skip real-PostgreSQL entry gate, `pnpm exec vitest run docker --no-file-parallelism` with `TEST_DATABASE_URL` set: PASS — all 20 files and all 96 tests executed and passed. File parallelism is disabled for this gate because launching all isolated databases concurrently exceeded the local PostgreSQL shared-memory budget; no assertion is omitted or skipped.
- Credits action state-machine suite inside the canonical run: PASS — 91/91.
- Full Stripe webhook/checkout suite inside the canonical run: PASS — 101/101.
- Tier Checkout v1 reconciliation: PASS — 1/1, restoring missing attempt authority only through the pre-existing durable customer mapping, then verifying the signed provider-bound cross-check before any mutation.
- Deletion lifecycle: PASS — 31/31; lifecycle migration upgrades: PASS — 4/4.
- Real-PostgreSQL auto-top-up races: PASS — 5/5; real-PostgreSQL inference races: PASS — 11/11; real-PostgreSQL deletion/recovery races: PASS — 3/3; real-PostgreSQL credit-ledger/Stripe fixture concurrency: PASS — 11/11.
- `pnpm typecheck`: PASS, including every workspace package.
- `pnpm lint`: PASS.
- `pnpm worker:typecheck`: PASS.
- `pnpm db:check`: PASS (`drizzle-kit check`, schema and migration metadata consistent).
- `pnpm build`: PASS after the final product-code changes. The later corrections were confined to test fixtures/choreography and this manifest. The build emitted only the known policy/environment and framework warnings: denied `.env.local` read, jose CompressionStream/DecompressionStream Edge warnings, and Next's ESLint-plugin detection warning.

Together the default entry gate and the bounded live entry gate execute all 180 test files and all 4,622 tests: the PGlite run supplies the broad deterministic suite, and the live run supplies the 96 assertions that require real PostgreSQL connections, locks, constraints, workers, and migrations. There is no unexecuted Docker/live test in this candidate.

## Final reviewer verdicts

- Code review: Grade A / Ready — zero BLOCK, zero CHANGE.
- Security review: Grade A / Ready — zero BLOCK, zero CHANGE; two non-blocking defense-in-depth and Phase 10b-2 sequencing notes.
- State-machine/correctness review: Grade A / Ready — zero BLOCK, zero CHANGE.
- Tenancy review: Grade A / Ready — zero BLOCK, zero CHANGE.
- Billing review: Grade A / Ready — zero BLOCK, zero CHANGE.

The reviewer gate evaluated the frozen implementation and evidence above. This status update records the verdicts only; no product, migration, or test code changed after the final verification runs.

## Required reviewer output

Review the live frozen tree described here, not an earlier diff or manifest. Return BLOCK/CHANGE/NOTE findings with file-and-line evidence, then an explicit Grade and Ready/Not Ready verdict. Treat the concrete Task 4/5 adapters as out of scope, but verify Task 3 has not falsely claimed them or left a boundary that prevents their safe implementation. A Grade A / Ready verdict is required from code, security, state-machine/correctness, tenancy, and billing reviewers before Task 3 can close or Task 4 can begin.
