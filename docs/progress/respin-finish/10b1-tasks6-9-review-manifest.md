# Phase 10b-1 Tasks 6–9 review manifest

Status: built 2026-09-08 (commit `4515447`), gated 2026-09-08. **Two reviewer rounds, both budgeted rounds spent. Every gate returned BLOCK in round 1; three of six still BLOCK in round 2.** Six distinct BLOCK-class defects in total — four root causes in round 1, two more in round 2 — five of them proven by executed database probes rather than argued. All six are fixed with witnesses that redden when the defect is replanted. **No round 3 was run**; the residuals are registered as T69-R1…R16 in `respin-finish-open-items.md` and are the owner's list, not a third gate. Round 1 is recorded first, round 2 at the end of this file.

The brief named this tree as "everything uncommitted at HEAD `0629032`". It is not uncommitted — Tasks 6–9 were committed at `4515447` and the tree was clean. The gate target was therefore the diff `0629032..4515447`: the same 64 files.

## What was gated, and by whom

Three reviewer runs, announced before spawning. CLAUDE.md sets `Gate intensity: lean`, but this change touches billing, tenancy **and** the erasure path, so the two `Full gates? = yes` paths ran separately and the rest consolidated.

| Gate | Verdict | Counts |
|---|---|---|
| respin-billing-reviewer (separate) | **BLOCK** | 4 BLOCK · 7 CHANGE · 6 NOTE |
| respin-tenancy-reviewer (separate) | **BLOCK** | 1 BLOCK · 6 CHANGE · 5 NOTE |
| lean run — code review | **BLOCK** | 3 BLOCK · 6 CHANGE · 6 NOTE |
| lean run — security (`/api/deletion/recover`) | **BLOCK** | 1 BLOCK · 3 CHANGE · 2 NOTE |
| lean run — spin compliance | NEEDS CHANGES | 0 BLOCK · 3 CHANGE · 3 NOTE |
| lean run — learning honesty | NEEDS CHANGES | 0 BLOCK · 2 CHANGE · 3 NOTE |

The security lens was folded into the consolidated run rather than spawned as a fourth agent: `/api/deletion/recover` is the one genuinely new unauthenticated surface in the diff, and it deserved the OWASP pass without doubling the announced spend.

The entry gate before them was green — 181 files / 4,819 tests / 0 failed, typecheck, worker typecheck, lint, `db:check` and `next build` all exit 0 (`entry-gate-task9-final.txt`). **Not one of the four root causes was visible to it.**

## Round 1 — four root causes

Nine BLOCK findings deduplicate to four defects. Two reviewers found the recovery-link break independently; all three found some face of the row-class defect.

1. **The identity-deletion recovery email pointed at a route that does not exist.** `actions.ts` built the link as `/settings/account/recover`; the page is `/recover-deletion`. Next's own generated `routes.d.ts` — written by the green Task-9 build — enumerates every route and does not contain it. Worse, `/settings` is in `PROTECTED_PREFIXES`, and every session is revoked at acknowledgement, so even a page there would have bounced its session-less recipient to `/sign-in`. A creator who requested account deletion could never cancel it, while `IDENTITY_DELETE_COPY` promised they could within seven days. Found by billing, tenancy **and** the lean run; confirmed here three ways before any edit.

2. **A settled, paid-for generation was deleted 24 hours after it succeeded.** The `generation_attempts` measure's own `why` string said "one year after terminal time"; the registry gave it `generation_recovery_24_hours`, a 24-hour clock — the *recovery* receiver's hard-clear boundary borrowed as a *retention* clock. `generations_attempt_fk` is `ON DELETE cascade`, and `generation_feedback`, `results` and `generations.parent_id` all cascade from `generations`, so one sweep took the creator's script, its output, its feedback and its logged results. The `credit_ledger` debit survived pointing at nothing. The reviewer executed it: `attempts=1 generations=1 ledger=1` → `attempts=0 generations=0 ledger=1`, with the tick reporting `failureCode: null`. This is CLAUDE.md's 2026-07-30 lesson exactly — a comment claiming a property is not the property.

3. **`overduePredicate` ignored the row class**, though every measure is *keyed* by it. One defect, three consequences, all silent: (a) the 90-day `customer_attributed` sweep stripped `workspace_id` and `tier_invoice_authority` from `workspace_attributed` rows that R-122 retains for **seven years**, on live workspaces; (b) because the link sweep sorts before the payload sweep, `extractBeforeRedaction` then read an already-nulled `workspace_id`, so **every** finance extract was written with `workspace_key = NULL` and C5's "linked pseudonymous financial chain" did not exist; (c) `incomplete` finance extracts — "the permanent authority for withholding that period" — were deleted at 30 days by the complete-row measure. `ROW_CLASS_DISCRIMINATORS` already named the discriminating column for all three tables, two files away, unused.

4. **Above 500 overdue events, the extract and the redaction selected different row sets.** The extract took 500 ordered by `received_at`; the redaction took 500 ordered by `ctid`. A row in the second set and not the first was redacted with its finance facts never extracted — and permanently, because `extractBeforeRedaction` skips `payload = '{}'`. Probed at 600 rows: 100 money facts lost, `failures: []`. This is the mutation-matrix row *"Redact Stripe payload before finance extraction"* firing on shipped code with no mutation applied.

**Every one of these ticks reported success.** That is the direct answer to the owner's contested item 7, below.

## The fixes, and the witness for each

Every fix carries a test that goes **red** when the original defect is replanted. Each replant below was executed, not reasoned.

| Fix | Witness | Replant result |
|---|---|---|
| Recovery link: one `RECOVER_DELETION_PATH` authority in `lib/routes.ts`, used by the mail builder and the route's redirects | `deletion-recover-route.test.ts` — the built URL's pathname resolves to a page that exists on disk, is not `isProtectedPath`, carries exactly `op`+`s`; plus a caller pin, since a `"use server"` module can export no constant | **RED** on the exact round-1 URL |
| `generation_attempt_terminal_one_year` (365 d) replaces the 24-hour rule; precondition `state IN ('refused','recovery_required')` excludes settled/debited rows, which follow the financial chain | `retention-receiver.test.ts` ×3 — a settled attempt survives 2 days and 2 years; a refused one is swept at a year and not before | **RED** ×3 on the 24-hour clock + removed exclusion |
| `rowClassSql()` folds the registry's discriminator into `overduePredicate`; an unknown class or an unrenderable discriminator **throws** rather than over-selecting | `retention-receiver.test.ts` ×4 — the workspace link and tier authority survive; the extract gets a real chain key; the customer class is still redacted; each row gets its own token | **RED** ×2 with the filter removed |
| One row set claimed once, by id, for both the extract and the redaction | `retention-receiver.test.ts` — 600 rows inserted in reverse physical order; every redacted row has an extract | **RED** (500 vs 600) with two independent orderings |
| Per-row `gen_random_uuid()` replaces one JS `randomUUID()` per statement | same file — two rows in one batch get distinct tokens | **RED** on the shared token |
| Credit note reads `total_excluding_tax`, not the tax-inclusive `total` | `finance-extract.test.ts` ×2 — the right field wins; absence yields `incomplete("missing_amount")` rather than a tax-inflated number | test flipped from pinning the defect |
| `erasureHold` takes its two module constants as seams so a hold can be planted | `deletion-executor.test.ts` — both refusals planted, plus the negative case proving the filter is on *retention*, not table name | previously: deleting the whole body left 4,819 tests green |
| `activationExclusions` is **required** on both seams — no default | `deletion-lifecycle.test.ts` — a non-empty admin set drives the real request path and the captured `activation_excluded` column is `true` | making it required surfaced 21 silent call sites; each now states its choice |
| `activation_payload_hash` asserted NULL after identity erasure, contribution facts asserted present | `deletion-executor.test.ts` | **RED** with *both* null mechanisms removed — the reviewer's stated green case |

Two comments that stated false facts were corrected rather than left: `deletion-executor.ts` claimed migration 0053 "dropped their cascade foreign keys" (it moved them to RESTRICT and the keys stay), and the route's header claimed all three recovery steps are rate-limited (the third is reachable only through the rate-limited second).

**One of my own tests was vacuous and I caught it by replanting.** The first version of the 500-row parity test inserted rows whose `ctid` order matched their `received_at` order, so the two orderings never disagreed and the mutation passed. It only became a real witness after the fixture was rewritten to insert in reverse physical order.

## The owner's seven contested points, answered

1. **RESTRICT + stub repoint — right, and the ordering is a real guarantee.** Both money reviewers agree independently. Dropping `model_usage_profile_workspace_fk` removed the *composite* key that structurally refuses a cross-parented row; RESTRICT keeps that property and only removes the cascade. `orderTargetsForExecution` sorts with an explicit comparator — root tables last, then `pseudonymise(0) < delete_explicit(1) < cascade(2)`, then FK-topological — reading each target's own action, never its position, so a later registration cannot reorder it. `stubFor` mints a **fresh random** stub per operation and discards the mapping, so no re-linkage path exists from the four financial tables. Two caveats, both recorded as residuals: the comparator has no direct unit test, and the *other* pseudonymisation in this change (`stripe_finance_extracts.workspace_key`) is an **unkeyed** sha256 and is relinkable by anyone holding a workspace id.
2. **Verified-as-of-capture is acceptable, but the limitation must be registered, not commented.** R-121 binds all three steps to "within 24 hours of `users.created_at`"; Better Auth stores no verification timestamp and the `verification` rows are deleted 24 h after expiry by this very receiver, so no in-tree fix exists. The bias is **one-directional — the numerator over-reports**, never under. It belongs in `respin-finish-open-items.md` naming that direction, because the day-90 40% target is measured against an over-count. A code comment and a ledger line are not the register.
3. **The optional default was not acceptable, and it is now required.** The unit-level classifier had a real witness; the *seams* had none. Every test call site omitted it and one optional line in `worker/production.ts` was the only supplier — deleting that line left the whole suite green while the executor's C4 absence probe became a no-op, so erasure would complete with the deleted id still a re-linkable copy in `ADMIN_USER_IDS`. Fixed: required on both seams, 21 call sites now state their choice, and a new test drives a non-empty set through the real request path.
4. **Moot, and it was never the binding constraint.** Task 8 had a BLOCK independent of the bucket. The drill deferral stands as recorded; it is not what held this task.
5. **Link possession alone genuinely reaches nothing — but nothing could reach the link.** The three-step chain is real and server-enforced: `@respin/auth` injects the server DB and the HMAC'd IP digest so the route cannot supply its own, and `cancelIdentityDeletion` re-presents secret, proof id and receipt. The refusal is uniform in shape and now has a test proving three different failure modes produce byte-identical refusals. Two residuals: refusal timing is a weak oracle for "is this link live", and steps 1–2 share one rate-limit bucket.
6. **Fail-safe today — but for a different reason than the constant.** Restore refuses unless the membership is bit-identical to its snapshot, including `version === snapshot + 1`, so any independent revoke, role change or re-invite yields `changed`/`removed`, and no seat cap exists to over-fill. "Allow everything" is nonetheless the unsafe *direction* as a default; the port is already required at the call site, so the residual risk is only that the permissive constant is left wired when 10b-2 lands.
7. **No — the health signal was not sufficient, and the reason is precise.** A *throwing* sweep is visible (`failureCode` per table, `retention_sweep_failed` at critical). A sweep that redacts zero rows forever **without throwing** is not, because the only metric that could distinguish it — `oldestOverdueMs` — is computed from `overduePredicate`, the *same* expression the sweep uses. When the predicate is what is wrong, the backlog metric is wrong identically and reads `null`; and `retentionTableEvents` drops zero-count tables from the stream, so the table simply stops appearing. "Nothing was due" and "this sweep is structurally blind" emit the same thing. Root causes 3 and 4 both destroyed retained data while reporting `failures: []`. **This is fixed only in its instances, not in its class** — see the first residual.

## Verification on the fixed tree

`entry-gate-tasks6-9-gate-round1-fixes.txt`. Ten planted mutations executed against the fixes; eight reddened on the first attempt, one (the relink hash) required removing both null mechanisms as the reviewer specified, and one exposed a vacuous test of my own that was then rewritten.

## Residuals — NOT fixed, for the owner

Ranked by what they would cost if they bite.

**High**

- **The silent-sweep class is still open.** Contested point 7 is fixed for the four instances found, not for the shape. `oldestOverdueMs` still derives from the sweep's own predicate, and `retentionTableEvents` still drops zero-count tables. A future measure with a wrong predicate will still read `scanned=0, oldestOverdueMs=null, failureCode=null`. The remedy both money reviewers propose is one predicate-**independent** age per swept table plus a `financeExtracts >= redacted` invariant, and emitting a per-table event even at zero so a table that stops appearing is itself the signal.
- **`retention-receiver.ts` is an unregistered writer and the writer gate structurally cannot see it.** It DELETEs from thirteen tables and UPDATEs `stripe_events`, but appears in no `LIFECYCLE_WRITER_INVENTORY.physicalWriters` entry and no `table-writers.test.ts` EXPECTED map — because the raw-SQL detector matches literal table names and the receiver composes its FROM clause from `ident(spec.measure.table)`. The matrix row *"Add an unregistered app table or writer"* does not redden for the most destructive writer in the tree.
- **`stripe_finance_extracts.workspace_key` is an unkeyed `sha256("respin-finance-chain:" + workspaceId)`.** The repo already classifies this exact shape as a relink vector and fixes it elsewhere (`requester_digest` is replaced per operation "because a known-id dictionary would relink the retained receipt"). Anyone holding a list of workspace ids — logs, an old backup, a support ticket — can relink seven years of retained finance rows. Either HMAC it under a held secret, or drop the "no re-linkage path" claim from the Task 6 contract.
- **No test asserts the retention sweep is actually scheduled.** `runRetention` is *optional* in `PgBossRuntimeSources` and the queue is registered only `if (this.#sources.runRetention)`. A composition that omits it registers no queue, runs no sweep — and `erasureHold` still returns `null`, because `STRIPE_PAYLOAD_RECEIVER_WIRED` is a hand-set boolean with no link to scheduling. `worker/retention.ts`'s alert thresholds, `evaluateRetentionAlerts` and `OVERDUE_BACKLOG_MS` have no test file at all.
- **The 5-minute settlement retry was never built.** Plan C5 and contract deliverable 6.5 both say the receiver "attempts idempotent settlement of `vendor_complete` older than 5 minutes"; `countSettlementCandidates` performs `SELECT count(*)`. Settlement remains traffic-dependent, so a `vendor_complete` attempt whose settlement transaction crashed is never settled if the creator does not return — and at 24 h the hard clear destroys the candidate. This is a **deferral that was never recorded** in the contract's "Out of scope" or the ledger's "NOT done"; recording it is the minimum, building it is the fix.

- **`table-writers.test.ts`'s P8 witness was a latent red and is now only masked.** It re-runs the full AST closure scan once per planted shape — seven full-tree parses in one test. Measured: **156.8 s on the Task-9 "green" tree (87% of its 180 s budget)**, 173.2 s once these fixes added sources for it to walk (96%), then an outright timeout on the next full-suite run under contention. The budget was raised to 420 s with the measurement recorded in the test, because trimming plants would weaken the guard — but that is headroom, not a fix. The real fix is to memoise the parse across plants. Until then the entry gate carries a test whose pass/fail depends on machine load, which is exactly the kind of harness a green run cannot be trusted from.

**Medium**

- **The registration API cannot catch a new *field*.** `assertLifecycleRegistration` catches an unregistered table (planted and reddening) and an uncovered row class, but the field partition is complete *by construction* because the last set is `remaining_columns` — so a column added in 10a/10b-2/10c silently lands in `receipt_facts`, never scrubbed at erasure, and the closure passes. Task 7 had to add `activation_payload_hash` to `linkable_identifiers` by hand and nothing would have caught forgetting. "Done when" requires that a later slice cannot add an uncovered "table, row class, **or field set**".
- **One FK-blocked row may wedge a whole table's sweep permanently.** Each batch is a single `DELETE … WHERE ctid IN (…) ORDER BY ctid`; four `deletion_*` children RESTRICT to `deletion_operations`, and an unresolved external command is never swept by design. One such row past its one-year clock would raise 23503, fail the whole batch, and — because `ORDER BY ctid` is deterministic — head every future batch. Reasoned by the reviewer, **not executed**; worth one focused test before it is either fixed or dismissed.
- **The recovery secret travels in a query string** and lands in the address bar and browser history. The mandatory password second factor means this is not takeover, but it is not the "not in a URL that lands in logs or a Referer" property the task asked for.
- **The account copy still claims seven-year financial retention that nothing enforces.** `RETENTION_CLOCKS.financial_chain_seven_years` has no duration and no receiver (R-122 keeps the destructive half disabled), so retention is in fact unbounded; the copy says "for seven years" and its pin asserts only that the enum *name* appears. Either say what ships or make the clock executable. (The other half of this finding — the copy's claim that the workspace link is "replaced by a pseudonymous key" — is now **true** for the four financial tables after root cause 3 was fixed.)
- **`orderTargetsForExecution`'s comparator has no direct unit test.** The property holds by construction and is referenced from two end-to-end tests' comments, but nothing would fail if a future edit changed the comparator.
- **Steps 1–2 of the recovery flow share one rate-limit bucket** (`purpose: "identity_cancellation"`), so the limiter is per-IP-per-flow rather than per step, and `ip ?? "no-trusted-ip"` collapses every client into one bucket when `RESPIN_TRUSTED_PROXIES` is unset — a self-DoS direction, not a bypass.
- **`activation.ts`'s double-count guard is inert in production.** Apply and erasure commit in the same transaction and erasure nulls `deletion_operations.user_id`, so the `applied` set is always empty on a real tree; "no double count" holds because the `users` row is gone. The test that proves it exercises a state production cannot reach.
- **`smallCell` is computed but not enforced.** `deriveActivationCohorts` returns raw `signups`/`activated` alongside the flag, on the `@respin/db` facade, so 10a can render a cell of 3 without consulting it.
- **The email-verification limitation is not on the returned shape.** `ActivationCohort` carries no provenance or caveat field, so 10a's reporting surface can render the number with nothing attached. Contested point 2 above says where the limitation belongs; carrying it on the shape is the stronger form.

**Low / noted**

- `cohort_two_years` is `(2*365+1)` days; leap days sweep up to a day early (safe direction, but the derivation should say so).
- A `complete` dispute row can carry `disputeEffectiveAt: null` with no incomplete reason, though C5 names effective timestamps as required facts.
- Refunds and credit notes land **positive** in `amount_excluding_tax_cents` with no sign or direction column; a 10b-2 projector that sums the column will double-count. The sign convention should be recorded on the row now.
- Retention sweep order is alphabetical by registry key, not FK-aware — unlike `orderTargetsForExecution`, which is.
- `RETENTION_CRON` runs 29 `count(*)` plus 29 aggregate scans every minute, several over unindexed columns. Consider splitting the one-minute attempt receiver from the daily sweep.
- `loadActivationSignals` reads across every workspace the user belongs to with no `assertScoped`. Correct for a lifecycle authority and unreachable from `app/**` today, but R-121 obliges 10a to consume `queryActivation` — 10a must put it behind `requireAdmin` and add it to the isolation suite in the same change.
- `RETENTION_TICK_CRON` is exported and documented as the schedule and used by nothing; the live schedule is `RETENTION_CRON`.
- A non-USD object becomes `incomplete/non_usd_currency` but is still written with `currency = 'USD'` — correct in effect, misleading in the row.
- The ledger's Task 6 entry claims both lifted holds "keep a planted-hold witness". That was false when written; it is true now.
- Counted claim: the ledger and contract say 28 measures; `retentionSweepSpecs()` emits 29.

## Vacuous guarantees the reviewers identified

Recorded because they are the reason the entry gate was green over four data-destroying defects.

- **`retention-receiver.test.ts`'s R-122 assertion is a tautology.** It reads `retentionSweepSpecs().map(spec => spec.measure.table)`, but that function already `continue`s on any clock that is not `scheduled`. The set can never contain a `financial_chain` rule, so the loop restates the function's own filter — and root causes 3 and 4 were live counterexamples to what it was taken to prove. The guarantee it should assert is "a financial *table* cannot be swept", not "a financial *rule* cannot be".
- **The same shape appears in `retention-clocks.test.ts`.**
- **`account-copy.test.ts`'s "never claims something the code does not do"** is a four-string denylist, the hardened-against-named-counterexamples pattern CLAUDE.md's 2026-08-18 lesson forbids. It passed while the copy's pseudonymous-key claim was false.
- **`assertExecutorProbeAgreement`** derives both sides from the same `REGISTRATION_SUBJECTS`, whose id lists are all empty, so any target that only materialises for a non-empty list would be absent from both and agree vacuously. Unconfirmed — flagged as risk, not defect.
- **The route test could not distinguish a refusal from the auth chain never running** (an environment failure produces the identical redirect). Partly addressed — three failure modes are now asserted byte-identical — but the strong property, *valid* secret plus wrong password, still needs a database.
- **Only 5 of the 29 sweep specs are exercised with a real row**, against a plan that demands populated fixtures for every receiver table.

## What is NOT proven by anything in this repository

Unchanged from Task 5, and not narrowed by this gate. No S3 bucket, no restore drill, no charge, no live mail, no deploy. The receiver is proven against PGlite and the shipped migrations; the live-Postgres run is the CI shape and is reported separately. The destructive financial receiver remains disabled under R-122. Engineering completion and evidence completion are separate claims, and the second one is not made here.

Two rounds were budgeted; one was used. **No round 2 was run** — the fixes above carry executed replant evidence instead, and the residuals are a list for the owner rather than a third gate. That is a deliberate call and the owner may reverse it: the strongest argument for one more round is that root cause 3 was a *class* defect found in three places, and a reviewer who has seen the fix is better placed than I am to say whether the class is now closed.

---

# Round 2 — the fix pass audited

Three reviewers again, scoped to the uncommitted fix diff with this manifest as the thing to audit. **Both budgeted rounds are now spent; there is no round 3.** The residuals below and in `respin-finish-open-items.md` (T69-R1…R16) are the owner's list.

| Gate | Round 1 | Round 2 | Counts |
|---|---|---|---|
| respin-billing-reviewer | BLOCK | **BLOCK** | 1 BLOCK · 5 CHANGE · 5 NOTE |
| respin-tenancy-reviewer | BLOCK | **BLOCK** | 1 BLOCK · 6 CHANGE · 5 NOTE |
| lean — code review | BLOCK | **BLOCK** | 1 BLOCK · 5 CHANGE · 2 NOTE |
| lean — security | BLOCK | **NEEDS CHANGES** | 0 BLOCK · 1 CHANGE · 2 NOTE |
| lean — spin compliance | NEEDS CHANGES | **NEEDS CHANGES** | 0 BLOCK · 2 CHANGE · 1 NOTE |
| lean — learning honesty | NEEDS CHANGES | **NEEDS CHANGES** | 0 BLOCK · 2 CHANGE · 1 NOTE |

## Every round-1 finding closed, verified by someone else replanting it

The lean run planted seven mutations against the round-1 fixes and **all seven reddened**; tenancy planted four more independently, including the one the author had flagged as needing both mechanisms removed. Confirmed CLOSED: the recovery-link route, the 24-hour generation clock, the row-class predicate, the 500-row extract/redact parity (including the fixture the author had admitted was vacuous), the per-row redaction token, `erasureHold`'s planted refusals, the rate-limit wording, and the migration-0053 comment.

**Root cause 3 is closed as a class, and two reviewers checked it independently rather than accepting the claim.** All eleven mixed tables in `ROW_CLASS_DISCRIMINATORS` are `enum_value` and all render; `overduePredicate` is the single entry point and all four consumers pass through it; `ROW_CLASS_INVENTORY` *throws at module load* if a mixed table lacks a discriminator, if a single-class table has one, or if a class has no value — so a second producer of row classes cannot escape, it makes the module unimportable. **Respin non-negotiable rule 7 is satisfied.** Tenancy also proved the fail-closed direction by planting a `nullness` discriminator: 10 of 22 tests went red.

## Two new BLOCKs — both pre-existing, both in specs nobody had ever populated

Neither was introduced by the fix pass. Both were found the same way: a reviewer put a real row in front of a sweep spec that had never had one.

1. **The seven-day identity-recovery-secret sweep had never once run.** Found independently by billing and tenancy, each with an executed probe. `deletion_operations_recovery_shape` admits an identity row in exactly two shapes — LIVE (`recovery_consumed_at` NULL, digest and prefix present) or SPENT (consumed_at set, both NULL). The measure nulled the digest and prefix without stamping `recovery_consumed_at`, landing between both branches, so the UPDATE raised 23514 and the whole batch aborted **on every tick, forever**. The single-use recovery credential was retained indefinitely, and `evaluateRetentionAlerts` would have raised `retention_sweep_failed` at **critical** permanently from the first expired link in production. Investigating the fix found it deeper than reported: the measure also tried to null `request_session_digest`, which `deletion_operations_request_session_digest_shape` requires **NULL exactly when terminal and NON-NULL otherwise** — so a clock can never null it (refused pre-terminal, already null post-terminal). That column is governed by the state machine, not a clock.

2. **The backlog alarm was permanently critical on healthy code.** `countOverdue` and `oldestOverdueMs` used the sweep's clock predicate **without** `NOT (redactionDonePredicate)`. Redaction blanks columns; it does not move `received_at`. So a correctly redacted row stayed "overdue" forever and its age grew daily. `OVERDUE_BACKLOG_MS` is 24 h at `critical`, so 25 hours after the first Stripe payload was correctly redacted, a fully caught-up receiver pages forever — and the one signal separating "keeping up" from "losing the race" is the first thing an operator mutes. This is the direct refutation of this manifest's own round-1 answer to contested point 7, which rested on `oldestOverdueMs` being the metric that would show a blind sweep. It could not be, for the *opposite* reason as well as the recorded one.

Why the existing health test missed it: `retention-receiver.test.ts` asserted `oldestOverdueMs` is null after a sweep — but seeded only a `session` row, a **delete_row** measure, where the row is gone and the assertion cannot fail. The nine `redact_columns` specs, where it was false forever, were untested. That is the round-1 R-122 tautology shape recurring inside the fix pass: a property asserted on the one case that cannot falsify it.

## Round-2 fixes, and their witnesses

| Fix | Witness | Replant result |
|---|---|---|
| `now_if_null` redaction kind stamps `recovery_consumed_at` alongside the nulled digest; `request_session_digest` removed from the measure with the reason recorded | `deletion-lifecycle.test.ts` — drives the **real `requestIdentityDeletion` producer**, asserts a live secret was minted, advances the tick clock past expiry, asserts digest and prefix null, `recovery_consumed_at` set, no table failed | **RED** on dropping the stamp |
| `outstandingPredicate` excludes already-redacted rows from `countOverdue` and `oldestOverdueMs` | `retention-receiver.test.ts` — two ticks over a **redaction** measure; every payload spec reports `scanned: 0`, `oldestOverdueMs: null` | **RED** on reverting |
| — (the lean run's `M1c` survived green in round 2) | `retention-receiver.test.ts` — an `incomplete` extract survives the 30-day complete-row clock while its `complete` sibling is swept | **RED** on exempting the table from the class filter |
| `failureCodeOf` reads the driver's SQLSTATE off `.cause` as well as the error | — | the branch was dead for every real database failure; a CHECK violation surfaced as generic `receiver_error` |

**Two regressions the fix pass introduced, both mine, both fixed:** a stale JSDoc still claiming `activationExclusions` "defaults to nobody excluded" directly above the now-required parameter; and unbounded reflection of `op`/`s` into a server-issued `Location` header on a public unauthenticated route (now bounded to a UUID and a 64-char base64url value). The lean run confirmed the echo weakens nothing else — refusals stay byte-identical, `encodeURIComponent` closes CRLF injection, `new URL(path, req.url)` cannot leave the origin, and React escapes both into hidden inputs.

**The author's own line-ending verification was vacuous.** `grep -c $'\r'` reported CRLF on a pure-LF file. A byte-level audit found `lib/routes.ts` genuinely **mixed** — 49 CRLF and 22 LF, from a heredoc append into a CRLF worktree file. Normalised; every subsequent edit detects the file's endings first. This is CLAUDE.md's 2026-09-04 lesson landing on the check written to honour it.

## What round 2 says about the shape of this phase

Two rounds, **six BLOCKs, every one invisible to a green ~4,800-test entry gate.** The gate is not what caught them. Populated fixtures are — and **24 of 29 sweep specs still have none**, which is exactly where both round-2 BLOCKs were sitting. Round 1 shut the class of *class-blind predicates*; it did not shut the class of *specs with no populated fixture*, and that is now the highest-value residual in the register (T69-R16).

Three residuals are load-bearing for **10a specifically** and have been written into that plan's Task 1, its mutation matrix and its "Done when" rather than left in a list: the registration API's field hole (T69-R8), the activation over-count with no caveat on the returned shape (T69-R1/R15), and the unasserted sweep scheduling (T69-R5). The remaining thirteen stand in `respin-finish-open-items.md`.
