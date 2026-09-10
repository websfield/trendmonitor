# Respin brain tenancy review — Phase 10b-1 fix pass 3 (build lane, 2026-09-09)

*Report returned by `respin-tenancy-reviewer`; saved verbatim by the build lane.*

**Readiness: Almost · Grade: B · Every round-2 closure I was asked to verify is real and its witness runs green, the receiver's one-transaction fallback keeps its locking and predicate properties, and no tenancy leak or silent brain mutation is reachable — but this pass's activation fix counts a person twice when they cancel and request again (reproduced by execution), and the widened dynamic-writer predicate still misses ordinary destructive shapes the test claims to cover.**

Counts: 0 BLOCK, 2 CHANGE, 3 NOTE. Round 2 (independent) was NEEDS CHANGES (B) with 2 CHANGE.

**Scope**: the six enumerated changes of this pass, read against the uncommitted tree (69 files, +3,559/−497 vs `d5fbaf7`). Respin only.

## Movement on round-2 findings

| Round-2 finding | Movement | Evidence |
|---|---|---|
| Tenancy CHANGE 1 — scanner misses 3 of 6 shapes, never reads `packages/credits` | **Closed as specified; the predicate is still narrower than its claim (CHANGE 1 below).** | `lifecycle-registry.test.ts:152-157` predicate is a function; `:158-185` walks `packages/*/src/**`; `:187-209` plants six destructive and three safe shapes. 19/19 green. A scan over 159 files reports exactly the two declared writers, zero false positives. |
| Tenancy CHANGE 2 / compliance CHANGE 4 — "no owner" | **Closed.** | `copy.ts:64-65` "no member"; `:18` names both populations; pinned `account-copy.test.ts:115-117`. |
| Compliance CHANGE 1 — `BACKUP_MAX_RETENTION_DAYS` twin | **Closed.** | `shell-scripts.test.ts:124-135`; 21/21 green. |
| Compliance CHANGE 2 — "seven years" unbounded | **Closed.** | `copy.ts:28` "at least seven years"; pinned to `kind: "financial_chain"`. |
| Compliance CHANGE 3 / code CHANGE 2 — purge comment | **Closed.** | `retention-receiver.ts:341-358` states memberships ∪ this operation's snapshot, the removed-member gap (T-R2-4), the incomplete-extract cost. |
| Compliance NOTEs — accepted notice; `last_owner` remedy | **Closed.** | `copy.ts:68-69`; `refusal-code.ts:69`. |
| Code BLOCK — stale-ctid fallback | **Closed, and the isolation properties hold.** | `retention-receiver.ts:433-452` claim under `FOR UPDATE SKIP LOCKED`; `:461-487` apply re-states `overduePredicate` (and `NOT alreadyDone`); `:515-529` one `db.transaction` per row holding the lock through the write; failed refs excluded; single table per statement. Witnesses `retention-receiver.test.ts:689-758` ran green. |
| Code CHANGE 1 — batch code kept when every row survives | **Closed.** | `:512,534`; witness asserts `failureCode: null`, `failures: []`. |
| Learning BLOCK — pending deletion dropped from the denominator | **Closed for the case named; the fix opens a new one (CHANGE 2).** | `activation.ts:433-450`; witnesses request→complete and request→cancel green. |
| Billing CHANGE — erasure-time extract unwitnessed | **Closed.** | Real invoice payload; `expectFinanceFactSurvived` after both erasures. |
| Code NOTEs — `DELETION_SCOPES`, `PENDING_DELETION_STATES`, `digestEquals` doc, `retentionPoisoned`, argv scanner | **All closed.** | |
| Security MEDIUM — reset starvation | **Closed** (witness ran). | `AUTH_MAIL_RESET_RESERVE`; 19/19. |

## Findings

- ⚠️ CHANGE `respin/packages/db/src/activation.ts:433-450` with `:428-432` — **A person who requests identity deletion, cancels, and requests again is counted twice for as long as the second request is pending.** Cancellation restores the user to `active` but leaves the first operation's capture at `pending`; a fresh request is permitted because `activeOperationForTarget` excludes `cancelled`; the new pending query filters on scope, contribution state and the user's tombstone only, never on the operation's state. Reproduced through the real request → cancel → request path: signups 2, after the second request 3. After erasure the SQL port repoints every `deletion_operations` row's `user_id` to the stub, so the cancelled operation keeps matching until `deletion_receipt_one_year`. The comment asserts a property the code lacks (2026-07-30). · Fix: `notInArray(state, ["cancelled", "complete"])` on the pending query (or a `discarded` state at cancellation); add the request → cancel → request witness. **Fixed in the same pass, before this report landed: the state filter and the witness are in.**
- ⚠️ CHANGE `respin/packages/db/tests/lifecycle-registry.test.ts:152-157, 165, 187-209` — the predicate is fitted to the round-2 planted list; it misses `TRUNCATE TABLE`, schema-qualified `"public"."${name}"` / `public.${name}`, `DELETE FROM ONLY` / `UPDATE ONLY`, lowercase, `DROP TABLE`; and a helper imported from a sibling (`ident(table)`). Nothing is absorbed today. · Fix: widen with the `i` flag, ONLY/TABLE, a schema qualifier, drop the helper conjunct for TRUNCATE/DROP, plant each, rename the test. **Fixed in the same pass: thirteen planted shapes.**
- 💡 NOTE `retention-receiver.ts:515-529` — if `claim` itself throws inside the per-row transaction, nothing is excluded and the loop retries the same claim up to 500 times, inflating `poisoned`. **Fixed: a failed claim stops the table's pass.**
- 💡 NOTE `worker/retention.ts:184` — `retentionPoisoned` sent but only the alert detail is witnessed. **Fixed: a tick-event assertion.**
- 💡 NOTE `backup.sh`, `restore-drill.sh` — `sslpassword` is deleted from the URI but never lifted; fail-closed and fine, record it. **Fixed: the comment says so.**

## Checks run

T1 holds (no new route query path; the activation join is a tenant-neutral aggregate). T2 n/a. T3 holds (no `brain_docs` writer; `DYNAMIC_LIFECYCLE_WRITERS` unchanged; the scan reports exactly those two). T4 n/a. T5 holds (`stripe_finance_extracts` rows carry only the `wk_` key after both erasures). T6 holds (the unknown-contact rule matches its copy; accept owner-only). T7 holds (both scripts strip the query password; the argv scanner joins continued lines with a planted case). Provenance partly violated (the two CHANGEs' comment/title claims), otherwise every claim cites its source with a red-on-defect witness.

## Coverage

- read fully: `lifecycle-registry.test.ts`, `retention-receiver.ts`, `copy.ts`, `account-copy.test.ts`, `deletion-request-enablement.ts`, `shell-credentials.test.ts`, the `activation.ts` diff, ranges of the receiver, lifecycle and executor tests and of `deletion-lifecycle.ts` and `lifecycle-sql-port.ts`, the diffs of both scripts, `shell-scripts.test.ts`, `worker/retention.ts`, `auth-mail.ts`, `page.tsx`; the round-2 card and reports; register T-R2-4..13 · not read: `deletion-executor.ts` diff body, `finance-extract.ts`, the S3 templates, `journal-forecast.ts`, the Docker suites, `account-view.tsx`, `actions.ts`.
- commands run: `vitest run lifecycle-registry retention-receiver account-copy` → 60/60; `vitest run shell-scripts shell-credentials auth-mail deletion-request-enablement retention-alerts` → 59/59; the identity erasure and denominator cases → 3/3; a scratchpad scan applying the predicate to `packages/*/src/**` → 159 files, 2 declared writers, 0 false positives, 7 of 9 extra evasion shapes missed; a scratchpad probe through the real request → cancel → request path → 3 where 2 is correct.

## Verdict

NEEDS CHANGES
Every round-2 closure is real and executed, the fallback's locking and predicate properties hold, and nothing crosses a workspace or mutates a brain — but the activation fix double-counts a cancel-and-retry person (reproduced), and the population guard still proves less than its title says.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
