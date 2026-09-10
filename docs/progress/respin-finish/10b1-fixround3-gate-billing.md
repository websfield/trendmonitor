# Respin billing & credits review — Phase 10b-1 fix pass 3 (build lane, 2026-09-09)

*Report returned by `respin-billing-reviewer`; saved verbatim by the build lane.*

**Readiness: Almost · Grade: B · Every round-2 money finding is closed by code I ran, the per-row fallback now makes forward progress without spinning or touching the wrong row, but two defects this pass introduced need one more edit: a re-requested identity deletion is counted twice in the activation denominator, and a connection blip during a batch is reported as 500 poisoned rows.**

0 BLOCK · 2 CHANGE · 4 NOTE. Round-2 movement: 4 of 4 billing CHANGEs RESOLVED; the consolidating review's BLOCK and its CHANGE on this path RESOLVED; its `retentionPoisoned` NOTE resolved in code but unwitnessed.

**Scope**: the seven changes of this pass, read as diffs against `d5fbaf7` and as the working files: the receiver, billing schema, auth-mail, activation, both scripts, the worker tick and health, and their witnesses. `packages/credits` is unchanged by this pass.

## Movement on round-2 findings

| Finding | Status | Evidence |
|---|---|---|
| Billing CHANGE 1 — extract-before-purge unwitnessed | **RESOLVED, non-vacuous** | Real `invoice.paid` line (1900, usd); `expectFinanceFactSurvived` asserts a complete row with the amount and a `wk_[0-9a-f]{32}` key not containing the workspace id, after identity and workspace erasure. `persistFinanceExtractsInTx` has exactly one production caller and the executor suite never runs the tick, so deleting the extract call reddens both cases; the `wk_` match also pins purge-before-executors ordering. 19/19. |
| Billing CHANGE 2 — "SIGNED" comment | **RESOLVED** | `billing-schema.ts:1116-1126` matches `finance-extract.ts:277-290` and the pinned 700 / 2280. |
| Billing CHANGE 3 — drill comment | **RESOLVED** | Names `tests/shell-credentials.test.ts`, which exists, runs 5/5, and is planted-non-vacuous. |
| Billing CHANGE 4 / code BLOCK — stale-ctid fallback | **RESOLVED** | One transaction per row; predicate re-stated on DELETE and UPDATE; failed refs excluded; DELETE-kind witness green; probe A: 1,200 overdue rows with one poisoned drain across three ticks with no spin. |
| Code CHANGE — batch failure code on a transient error | **RESOLVED** | witnessed by the AFTER STATEMENT case. |
| Code NOTE — `retentionPoisoned` | **RESOLVED in code, unwitnessed** | see NOTE. **Fixed after this report: a tick-event assertion.** |
| T-R2-12 — reset starvation | verified | verification 60, reset 70, recovery 80 per day; 19/19. |

## The two probes the brief asked for

- Forward progress past a poisoned row without spinning — holds (probe A, three ticks, the table drains, the poisoned row counted once per tick).
- Can the re-stated predicate refuse a row the batch path would have written — no: the write's predicate is the claim's own, over rows locked in the same transaction, with `cutoff` fixed per sweep; only a concurrent modification could differ and the lock excludes it.

## Findings

- ⚠️ CHANGE `respin/packages/db/src/activation.ts:432-450` — a cancelled identity operation keeps its `pending` capture, so a person who requests, cancels, then requests again is counted twice, and stays double-counted after erasure (the cancelled row persists a year). Reproduced: 1 → 1 → 2 → 2. · Fix: exclude terminal operations from the pending query; witness request → cancel → re-request. **Fixed in the same pass, before this report landed.**
- ⚠️ CHANGE `respin/packages/db/src/retention-receiver.ts:515-529` — a failed CLAIM inside the per-row pass is counted as a poisoned row: a connection loss makes the loop run 500 failing claims and report `poisoned: 500`, paging `retention_poisoned_rows` critical for rows that do not exist. Reproduced (probe B: `57P01` from the second transaction → `poisoned: 500`, 559 transactions). · Fix: if `ref === undefined`, set the failure code and break. **Fixed in the same pass.**
- 💡 NOTE `retention-receiver.ts:515,540` — with one poisoned row a table advances at most 499 rows per tick; at the one-minute cron that is ~700k rows/day, immaterial; say so. **Fixed: comment added.**
- 💡 NOTE `worker/retention.ts:182-184` — `retentionPoisoned` sent but unwitnessed on the event. **Fixed.**
- 💡 NOTE `restore-drill.sh:117-119` — "`?sslpassword=` … lifted" was not what the code does; only `password` is lifted. **Fixed: the comment says sslpassword is stripped, not re-supplied, fail-closed.**
- 💡 NOTE `retention-receiver.ts:534` — `if (poisoned > 0) failureCode ??= batchCode` is effectively dead (a row's own error has already set the code). **Fixed: the branch removed and the comment corrected.**

## Checks run

B1 — ✅ n/a (no credits source change, no balance write). B2 — ✅ (no webhook change; the purge idempotent). B3 — n/a. B4 — n/a. B5 — ✅ (`AUTH_MAIL_RESET_RESERVE` cited). B6 — n/a. Threshold provenance — ✅. B7 — ✅ for the four closures; ❌ two gaps this pass opened (both fixed after).

## Coverage

- read fully: the receiver (whole file + diff), the receiver, executor, auth-mail, shell-credentials, activation and retention-alerts tests, the diffs of the billing schema, both scripts, the worker tick and health, auth-mail and activation, ranges of `deletion-lifecycle.ts`, `lifecycle-schema.ts` CHECKs, `finance-extract.ts:265-300`, the three review documents, register T-R2-9..13 · not read: `deletion-executor.ts` body, `lifecycle-inventory.ts`, `creator-data-registry.ts`, the S3 templates, the Docker suites.
- commands run: `vitest run retention-receiver` → 32/32; `deletion-executor` → 19/19; `shell-credentials retention-alerts finance-extract` → 40/40; `auth-mail activation` → 36/36; scratchpad probes A (1,200-row drain), B (`57P01` blip → 500 phantom poisoned), C (activation 1 → 1 → 2 → 2).

## Verdict

NEEDS CHANGES
No money invariant is at risk and every round-2 finding on this path is closed by code that runs and by witnesses that would go red — but the activation fix double-counts a cancel-then-re-request person permanently (reproduced), and the fallback's catch turns a connection blip into 500 phantom poisoned rows that page critical (reproduced); both are one-line predicate/branch fixes with a witness each.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
