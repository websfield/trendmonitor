# Phase 10b-1 — fix round 3, LEAN merged gate (learning honesty · security · consolidating code review)

*2026-09-09 · build lane · read-only · Claude Fable 5.1 (`claude-fable-5-1`). Tree: uncommitted working copy on `respin-m1-billing-credits` on top of `d5fbaf7`, after the round-3 fix pass that answered the independent review's round 2 (`respin-finish-phase-10b-1-review.md`, `10b1-phase-review-r2-*.md`). Three verdicts, one per lens; each lens's checklist walked as pasted.*

## Readiness headlines

| Lens | Verdict | Headline |
|---|---|---|
| Respin learning honesty | **BLOCK** | The pending-capture fix closes the round-2 BLOCK for the single-operation case and its witnesses are non-vacuous (the pre-fix filter reddens them) — but a **cancelled** identity operation keeps `activation_contribution_state = 'pending'`, and the new query filters on that column with no operation-state filter, so a person who cancels and later re-requests is counted **twice** for the whole second request → erasure window and, because erasure re-points the cancelled row's `user_id` to the tombstoned stub, stays over-counted for up to a year. **Reproduced by execution** (signups 2 → 3). |
| Security | **NEEDS CHANGES** | Every round-2 item is closed as described and the arithmetic cannot go negative, but carving the reset floor out of the *shared* total makes the non-reserved share exactly equal the invite ceiling (60/day, 1,800/month): a day or month of maximum invite traffic now admits **zero** `email_verification` and `local_factor_enrollment` mail, where round 2's tree left 10/day and R-118 promises 20. One MEDIUM, two LOW/INFO. |
| Consolidating code review | **BLOCK** (inherits L-1) + 1 CHANGE | Correctness: the same double-count defect (R-1). Tests: the two new DELETE-fallback witnesses **stay green under the exact round-2 BLOCK shape** (executed mutant: claim in one committed transaction, delete by bare ctid in another, no predicate — 2/2 pass), so the one-transaction property has no witness (R-2). The transient-batch case, the activation witnesses and the planted dynamic-writer shapes are real. |

## Scope

Read in full or by diff against `HEAD`: `respin/packages/db/src/{activation,retention-receiver,auth-mail,deletion-lifecycle (request/cancel paths),lifecycle-schema,retention-clocks,deletion-request-enablement,billing-schema}.ts`, `respin/scripts/{backup,restore-drill}.sh`, `respin/tests/{shell-credentials,shell-scripts,account-copy}.test.ts`, `respin/packages/db/tests/{activation,retention-receiver,auth-mail,auth-mail-quota.docker,deletion-lifecycle,deletion-executor,lifecycle-registry}.test.ts`, `respin/app/(product)/settings/account/{copy.ts,page.tsx,refusal-code.ts}`, `respin/worker/{retention,health}.ts`, the register's T-R2-9..13 and the round-2 card. `packages/brain` and every `promotion_proposals` writer are untouched by this pass (checked: no modified file names them).

## Commands run

```
pnpm -C respin exec vitest run packages/db/tests/activation.test.ts packages/db/tests/retention-receiver.test.ts packages/db/tests/auth-mail.test.ts tests/shell-credentials.test.ts tests/shell-scripts.test.ts tests/account-copy.test.ts packages/db/tests/lifecycle-registry.test.ts packages/db/tests/deletion-lifecycle.test.ts packages/db/tests/deletion-executor.test.ts packages/db/tests/deletion-request-enablement.test.ts
  → 10 files / 182 tests / 0 failed (60.5 s)
```

Scratch probes (session scratchpad `probe/`, run with `pnpm -C respin exec vitest run --config <scratch>/vitest.config.ts --root <scratch>`; bare `better-auth/crypto` and `drizzle-orm` aliased to `respin/packages/db/node_modules`; nothing tracked was edited):

1. `probe-activation.test.ts` — the `deletion-lifecycle.test.ts` "requested-then-CANCELLED" walk extended by a **second** `requestIdentityDeletion` after the cancel. Result: `before 2 … during second pending 3` — **FAIL** (double count). Operation rows at that moment: `[{state:"tombstoned", activation:"pending"}, {state:"cancelled", activation:"pending"}]`.
2. `probe-activation-mutant.test.ts` — `activation.ts` with the new pending-capture pass removed (the pre-fix filter), against the pending assertion. Result: `expected 1 to be 2` — **RED**, so the round-3 witnesses are non-vacuous.
3. `probe-mutant.test.ts` — `retention-receiver.ts` with the fallback rewritten to the round-2 BLOCK shape (`[ref] = await db.transaction(claim)`, then `db.transaction(DELETE … WHERE ctid = $1)` with no predicate), against verbatim copies of the two new "DELETE fallback" witnesses. Result: **2/2 GREEN** — the witnesses do not distinguish the fix from the defect.
4. `node -e` URL probe: `u.searchParams.delete()` does mutate `u.search` before `toString()` (safe URI `postgres://u@h/db?sslmode=require` from `…?sslmode=require&password=x%25y`); `?password=a+b` lifts as `a b`; `?password=100%2525` lifts as `100%` (double decode); `?sslpassword=only` is stripped and lifts nothing.

---

## LENS 1 — Respin learning honesty · **BLOCK**

Checklist walk (verbatim items 1–9):

1. **Sole emitter (L1)** — not touched by this pass; no modified file names `promotionProposals`/`promotion_proposals`. Unchanged, PASS by absence.
2. **Minimum n (L2)** — not touched. Unchanged.
3. **Unverified never learns (L2)** — not touched. Unchanged.
4. **No pooling, no collapsing (L3)** — not touched. Unchanged.
5. **Own baseline, stated exclusions (L4)** — not touched. Unchanged.
6. **Declared metric (L5)** — not touched. Unchanged.
7. **Approval writes (L6)** — not touched. Unchanged.
8. **Two claims (L7)** — the register keeps "Evidence completion, unchanged: no restore drill, no live mail, no charge, no deploy; acceptance walks still 0 of 8" separate from the FIXED lines. `RETAINED_COPY` now says "at least seven years" and pins it to the disabled receiver (`account-copy.test.ts`). PASS.
9. **Number provenance** — `smallCell: signups < 10` cites R-121; `aggregateExpired` is derived from `RETENTION_CLOCKS.cohort_two_years`; `ACTIVATION_VERIFICATION_LIMITATION` rides on every row; `COHORT_RETENTION_YEARS` in copy comes from the clock. PASS.

**The live question — the activation fix, state by state** (`respin/packages/db/src/activation.ts:421-460`):

| Operation state | `users.lifecycle_state` | `activation_contribution_state` | Counted from | Once? |
|---|---|---|---|---|
| `requested` / `journal_pending` (before tombstone) | active | pending | live pass | yes (join needs tombstoned) |
| `tombstoned` … `grace` (pending) | tombstoned | pending | capture | **yes** — witnessed, reddens under the pre-fix filter (probe 2) |
| `blocked` | tombstoned | pending | capture | yes (no state filter needed; user stays tombstoned) |
| `complete` | stub row tombstoned | applied | aggregate | yes (`applied` set excludes the live pass; stub skipped) |
| `cancelled`, no later request | active (restored) | **pending** | live pass | yes — witnessed (`deletion-lifecycle.test.ts:2506`) |
| `cancelled`, then **re-requested** | tombstoned again | old **pending** + new pending | capture **twice** | **NO — L-1** |

### Findings

- **L-1 · BLOCK · `respin/packages/db/src/activation.ts:433-449`** — the pending-capture query is `scope = 'identity' AND activation_contribution_state = 'pending' AND users.lifecycle_state = 'tombstoned'` with **no filter on `deletion_operations.state`**. Nothing in `applyIdentityCancellationInTx` (`deletion-lifecycle.ts:3363-3391`) or anywhere else moves a cancelled operation's contribution state off `pending` (`grep activationContributionState` over `packages/db/src` finds only the capture, the apply and this read), and `activeOperationForTarget` (`deletion-lifecycle.ts:782-805`) admits a fresh request once the old one is `cancelled`. So a person who cancels and later re-requests joins the query **twice** — the stale capture and the new one — for the entire second request → erasure window (≥ 7 days; forever if blocked). Executed: probe 1, signups 2 → 3. After the second operation completes, the `identifier_scrubber` re-points the cancelled row's `user_id` to the per-operation tombstoned stub (`creator-data-registry.ts:318-319`, identity_row `pseudonymise`; `deletion-executor.ts:153`), so the stale capture keeps joining and the cohort stays **+1 over-counted for up to a year**, until `deletion_receipt_one_year` deletes the cancelled row (`retention-clocks.ts:227-231`). This is the same class as the round-2 BLOCK (a wrong denominator through the real walk) in the opposite direction — it *deflates* the rate. Note the comment at `:429-432` claims "the join on the tombstoned row is what keeps the two from double counting" — true only until the person is tombstoned again (Lesson 2026-07-30). *Remedy (either):* filter the pending read to non-terminal operations (`inArray(deletionOperations.state, PENDING_DELETION_STATES)` — already exported and enum-bound) **or** void the capture on cancel (the CHECK at `lifecycle-schema.ts:203-212` already admits `activation_contribution_state IS NULL` for identity scope). *Witness:* extend `deletion-lifecycle.test.ts:2506` with a second request after the cancel — signups constant while the second is pending — and, in `deletion-executor.test.ts`, after its erasure. The expired-recovery abandonment path (`deletion-lifecycle.ts:1051-1064`, cancelled without tombstoning) leaves the same stale `pending` capture and needs the same fix.
- **L-2 · PASS (recorded)** — the single-operation witnesses are real: `deletion-lifecycle.test.ts:2506` (before / pending / cancelled) and `deletion-executor.test.ts` identity case (before / pending / erased) both go red on the pre-fix filter (probe 2: `expected 1 to be 2`).
- **L-3 · INFO** — `deriveActivationCohorts` keys totals by `(cohort_date, metric_version)` and reads every version; `aggregateExpired` names the survivorship bias; `limitation` is on every row. Consistent with R-121 and L-9 provenance.

**Verdict: BLOCK** — L-1 must be fixed and witnessed before the metric can be called exactly-once.

---

## LENS 2 — Security · **NEEDS CHANGES**

Checklist walk (verbatim items 1–6):

1. **Authentication & authorization** — no new endpoint in this pass. `page.tsx` now validates `?e=` against `ACCOUNT_ERROR_CODES` and `?ok=` with `Object.hasOwn` before indexing copy tables; the identity scope no longer renders a scoped-cancel control it cannot honour. PASS.
2. **Input validation & injection** — receiver per-row path (`retention-receiver.ts:427-483`): table identifiers only via `ident(spec.measure.table)` from `retentionSweepSpecs()`; refs bound as `${ref}::tid` / `${ref}`; `limit` bound; predicate from `overduePredicate`; the finance-extract gate is the explicit `FINANCE_EXTRACT_SPEC_KEYS` list with `assertFinanceExtractSpecClosure` run at the top of every tick. Shell: every `psql`/`pg_restore`/`pg_dump` line takes a password-less URI; `node -e` receives the URI via the environment, never argv; `-v db=` + `:"db"` quoting retained. PASS.
3. **Secrets** — `PGPASSWORD` exported once per script from the lifted value; unparseable URL prints a placeholder rather than the raw URI (the previous `backup.sh` fallback echoed `process.env.RESPIN_DB_URI`). PASS, with S-2/S-3 notes.
4. **Sensitive data handling** — unchanged surface; the erasure-time purge and its `expectFinanceFactSurvived` witness are the billing lane's; the docker quota test now asserts no `@example.test` in outbox rows. PASS.
5. **External calls / SSRF / idempotency** — none in this pass.
6. **Dependencies** — none added.

### Findings

- **S-1 · MEDIUM · `respin/packages/db/src/auth-mail.ts:321-344`** — the reset floor is subtracted from the **shared** total for every non-reserved purpose, so `email_verification` and `local_factor_enrollment` now see `totalPerDay − 20 = 60`, which is exactly `invitesPerDay` (and `2,400 − 600 = 1,800 = invitesPerMonth`). Consequence: a maximum invite day admits **zero** signup-verification or factor-enrollment mail for the rest of that UTC day, and a maximum invite month blocks them for the rest of the calendar month. Invites are owner-only (R-118) and capped 5/user/day by the new per-subject bucket, so the attacker needs ~12 free-signup owners — cheap. The round-2 tree left 10/day for these two purposes; the original R-118 text ("invites are further capped … so account/security mail retains at least 20/day and 600/month") promised 20, and that promise is now kept only for `password_reset` and `identity_deletion_recovery`. The comment at `:333-336` observes the equality ("the non-reserved share of the day equals the invite ceiling exactly") and reorders the invite check *for* it without stating what the equality costs, and `auth-mail.test.ts:259-283` pins the new behaviour (verification refused after 60 invites). *Remedy:* restore an invite-proof floor for the two remaining account purposes — e.g. check `workspace_invite` against `totalPerDay − AUTH_MAIL_SECURITY_RESERVE.perDay − (RECOVERY + RESET)` so the derived 20/day reserve sits *above* the two named floors rather than being consumed by them, or add a verification floor of the same shape — and either way add the witness "after `invitesPerDay` invites, `email_verification` and `local_factor_enrollment` still admit". If the product decision is to accept this, R-118's sentence needs a superseding decision line, not silent drift (Golden rule 1, Conventions "docs-first").
- **S-2 · LOW · `respin/scripts/backup.sh:99-108`, `respin/scripts/restore-drill.sh:126-133`** — the `?password=` form is lifted through `URLSearchParams.get` (which decodes `+` to a space and percent-decodes once) and then `decodeURIComponent` again, so a query-form password containing `+` or a literal `%NN` sequence is lifted differently from libpq's single percent-decode (probe 4: `a+b` → `a b`, `100%2525` → `100%`). Failure mode is a loud auth failure at `pg_dump`/`psql` under `set -euo pipefail`, not a leak; the userinfo form (the documented one) decodes exactly once and matches. `?sslpassword=` is stripped (correct — it is the client-key passphrase, and leaving it on argv would leak it) but has no `PG*` environment equivalent, so a client-cert deployment with an encrypted key now fails loudly rather than silently. Worth one line in the scripts' comments.
- **S-3 · INFO · `respin/tests/shell-credentials.test.ts:39-44`** — the joiner runs before the comment filter, so a comment line ending in `\` would fold the next physical line into the comment and hide it from the scan. No such line exists in either script today; a planted case for it would close the gap. The planted continued-line case, the `(?![A-Z_])` suffix guard and the export-not-mention check are all real.
- **S-4 · PASS (recorded)** — reserve arithmetic: `resolveAuthMailCeilings` enforces `total − invites ≥ 20/600`, so the smallest admissible totals are 21/601 and the effective non-reserved totals are ≥ 1 — never negative; since `RECOVERY + RESET = SECURITY_RESERVE` exactly, the invite ceiling can never exceed the effective invite share, so the reordered invite check changes only *which* refusal code an invite flood sees, not admission. The per-subject bucket counts under the same advisory lock as the totals.

**Verdict: NEEDS CHANGES** — S-1.

---

## LENS 3 — Consolidating code review · **BLOCK** (R-1, inherited) · 1 CHANGE · 3 LOW

Checklist walk (verbatim items 1–5):

1. **Correctness** — R-1 (= L-1). Receiver: the per-row fallback claims and writes in one transaction (`:516-523`); `ref` is per-iteration and only pushed to `unwritable` when the claim succeeded and the write threw; `written === null` breaks cleanly; `poisoned > 0` gates the batch code (`:534`); `oldestOverdueMs` is measured on every path. Activation: the `applied` set still excludes applied users from the live pass; tombstoned stubs are skipped; totals keyed by version. Auth-mail: see S-4. Shell: `DB_PASSWORD` lifted before the first consumer (`backup.sh:99`), `TARGET_URL`/`MAINTENANCE_URL` appear only as `node -e` environment inputs (`restore-drill.sh:100,126`). No off-by-one, inverted condition or leak found beyond R-1 / R-4.
2. **Security** — the obvious only: S-1 relayed as R-6; nothing else.
3. **Convention adherence** — Respin rule 7 (lists): `FINANCE_EXTRACT_SPEC_KEYS` + closure assertion; `DELETION_SCOPES` exhaustive via `Record<DeletionScope, true>`; `PENDING_DELETION_STATES` bound to the enum (`deletion-lifecycle.test.ts:2555`); `CREDENTIALED_VARS` explicit; `DYNAMIC_LIFECYCLE_WRITERS` plural with a population scan over every package. Lesson 2026-07-30 (comments): the purge comment now states the real population and the over-inclusion cost; `digestEquals` carries the constant-time docstring; the `billing-schema.ts` sign comment matches `finance-extract.test.ts:109,244-246` (700 credit note, 2280 refund/charge stored positive per `object_type`). **Exception:** `activation.ts:429-432` asserts a no-double-count property the code lacks (R-1), and `auth-mail.ts:333-336` records an equality without its consequence (R-6). Lesson 2026-08-26 (verifiers): the dynamic-writer predicate has planted shapes; the argv scanner has a planted continued line; the finance-extract list has a planted unlisted spec. R-2 is the one place a fix has no verifier that can fail.
4. **Tests** — see R-2 (fails), R-3 (passes).
5. **Maintainability** — R-4, R-5.

### Findings

- **R-1 · BLOCK · `respin/packages/db/src/activation.ts:433-449`** — as L-1: no operation-state filter on the pending-capture read; cancelled operations keep `pending`; cancel-then-re-request double counts (executed). The fix is one predicate (or nulling the capture on cancel) plus the witness named under L-1.
- **R-2 · CHANGE · `respin/packages/db/tests/retention-receiver.test.ts:689-759` (witnesses for `retention-receiver.ts:499-538`)** — the answer to "would the old two-transaction shape fail the new witnesses?" is **no**: probe 3 rewrote the fallback to the round-2 BLOCK shape (claim in a committed transaction, `DELETE … WHERE ctid = $1` in another, no predicate) and both new tests stayed green. The one-transaction claim-and-write and the re-stated predicate — the two properties the round-2 BLOCK demanded — therefore have no witness; a regression to the exact defect the review reproduced would ship green. Under PGlite (one connection) the stale-ctid race cannot be staged behaviourally, so the witness is either (a) a Docker-suite case that runs an `UPDATE` on the claimed row between claim and apply and asserts the fallback deletes nothing it should not, or (b) a source-level assertion in the PGlite suite that the fallback's `claim` and `apply` sit inside one `db.transaction` callback and that the DELETE/UPDATE statements carry `AND (${predicate})` — the shape `deletion-lifecycle.test.ts:2380-2390` already uses for ordering claims. Lessons 2026-07-30 and 2026-08-26.
- **R-3 · PASS (recorded)** — the transient-batch case really exercises batch-then-recover: the `AFTER DELETE … FOR EACH STATEMENT REFERENCING OLD TABLE` trigger raises only when `count(*) > 1`, so the 2-row batch fails and each 1-row fallback delete succeeds, and the test asserts `poisoned 0`, `failureCode null`, `failures []`, both rows gone. The activation witnesses go red on the pre-fix filter (probe 2). The six planted dynamic-writer shapes (quoted/unquoted interpolation after DELETE/UPDATE/TRUNCATE) and three safe shapes behave as claimed (`lifecycle-registry.test.ts:190-212`, run green).
- **R-4 · LOW · `respin/packages/db/src/retention-receiver.ts:526-540`** — after a fallback pass the loop sets `touched = progressed`, so a batch with, say, 3 poisoned + 497 written rows exits the batch loop (`touched < RETENTION_BATCH_SIZE`) with overdue rows still present and `truncated` still false; the table is only picked up next tick. Not data loss (`oldestOverdueMs` is still measured and will alarm), just under-progress per tick on a poisoned table. Separately, a non-row failure of the batch (connection dropped, relation missing) drives up to 500 single-row transactions that each fail before `progressed === 0` breaks — 500 `poisoned` for one cause. Both are worth one guard (`if (ref === undefined && claim itself threw) break`) or a comment stating the cost.
- **R-5 · LOW · `respin/packages/db/tests/lifecycle-registry.test.ts:152-157`** — `rendersDynamicTable` requires one of `sql.raw|sql.identifier|relation(` in the **same file** as the interpolated DELETE/UPDATE; a module that imports a render helper from a sibling (`import { ident } from "./x"`) and writes ``DELETE FROM ${ident(t)}`` is invisible to the population scan. The declared list remains the authority (rule 7), so this only weakens the witness, not the guard.
- **R-6 · CHANGE (= S-1) · `respin/packages/db/src/auth-mail.ts:321-344`** — the reserve design consumes the whole R-118 security reserve for two of the four account purposes; fix the code or supersede the decision text, and add the "after a full invite day, verification still admits" witness.
- **R-7 · INFO** — `worker/retention.ts:118-120,184` sends `retentionPoisoned` and raises `retention_poisoned_rows` (critical), allow-listed in `worker/health.ts:261`, witnessed in `worker/tests/retention-alerts.test.ts:73-79`. The docker quota test's arithmetic (30 total / 10 invites → 20 admitted, invites ≤ 10, resets ≥ 10) is consistent with the two-floor rule under interleaving. `page.tsx` `isCancellable(scope, state)` and the `?ok=` / `?e=` hardening are correct.

**Verdict: BLOCK** — R-1 is the same correctness defect as L-1 and must not land; R-2 and R-6 are NEEDS CHANGES on top of it.

---

## Coverage summary

| Area | Executed | Reasoned only |
|---|---|---|
| Activation exactly-once by state | pending, cancelled, cancel→re-request (probe 1), pre-fix mutant (probe 2), the 10-file run | blocked and post-erasure persistence (from the executor/registry code paths and `deletion_receipt_one_year`) |
| Receiver fallback | the 10-file run; two-transaction mutant (probe 3) | stale-ctid race (not stageable on PGlite) |
| Auth-mail reserves | the 10-file run; arithmetic bounds from `resolveAuthMailCeilings` | invite-month starvation (arithmetic) |
| Shell scripts | `shell-credentials` + `shell-scripts` suites; URL probe 4 | none |

Nothing tracked was edited; the scratch probes live only in the session scratchpad.
