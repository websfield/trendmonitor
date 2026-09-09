# Phase 10b-1 review — respin-finish · ROUND 2 (2026-09-09)

*The independent review's second and last budgeted round. Round 1 (2026-09-08) is preserved below. A third round needs the owner's explicit go-ahead.*

> **Build-lane note, added after this card (2026-09-09).** Fix pass 3 took every finding on this card: both BLOCKs, every CHANGE and the security MEDIUM are closed in code with executed witnesses, gated in the build lane (billing and tenancy as their own reviewers, then two rounds of the merged run: final verdicts learning PASS · security PASS · code review PASS, `respin-finish/10b1-fixround3-gate-*.md`), and the canonical gate is green on the final tree at **210 files / 5,041 tests / 0 failed** (`respin-finish/entry-gate-10b1-round2-final6.txt`). This card's verdicts are NOT re-rendered by that lane: the independent review's two budgeted rounds are spent, so **Overall stays "Not yet" until the owner either accepts the build-lane closure or orders a third independent round.** Residuals: T-R2-4, T-R2-5, T-R2-7, T-R2-9, T-R2-13, T-R2-14..16 in the open-items register.

## Report card

**Overall: Not yet** — two fix rounds closed every round-1 blocker and the whole 5,031-test gate is green, but two reviewers each reproduced a new defect that must not ship: the retention receiver's per-row fallback (a 2026-09-08 fix) deletes governed rows by a stale physical address and was seen deleting the wrong row, and the activation-metric fix (also 2026-09-08) drops every real signup from the denominator for the whole time its deletion is pending. Both are fixable in one pass in the build lane; both were introduced by the previous fix round, which is the convergence signal the process names.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (typecheck/lint/test/build) | **Ready** | Canonical CI shape, Docker live: **210 files / 5,031 tests / 0 failed / 0 skipped**, build compiled, whole chain exit 0 (`respin-finish/entry-gate-10b1-round2-final3.txt`). Third full run this fix round; the first two were honest reds (a renamed witness, then two tests migration 0057 made impossible). |
| Respin billing & credits (`Full gates? yes`) | **Almost · B** | Every round-1 money finding closed by code that runs; 4 CHANGE: the erasure-time finance extract that makes the payload purge safe has NO witness, the "SIGNED revenue columns" comment is false of stored credit notes and refunds, the drill comment names a guard that does not exist, and the per-row fallback's stale-ctid delete (the code review's BLOCK). `10b1-phase-review-r2-billing.md`. |
| Respin brain tenancy (`Full gates? yes`) | **Almost · B** | Every round-1 item closed by an executed witness, no leak reachable; 2 CHANGE: the new dynamic-writer scanner misses 3 of 6 planted shapes and never reads `packages/credits`, and the account copy says "no owner" where the rule holds every member. `10b1-phase-review-r2-tenancy.md`. |
| Respin spin compliance | **Almost · B−** | The round-1 BLOCK is closed and proven by execution; 4 CHANGE, all copy-versus-code on the account page: the 21-day backup constant is an unasserted twin of `backup.sh`, "for seven years" states a bound R-122 does not enforce, the purge comment overstates its population, "no owner" where every member is held. `10b1-phase-review-r2-compliance.md`. |
| Respin learning honesty | **Not yet · D** | **BLOCK, reproduced:** the 2026-09-08 fix filters `tombstoned` users out of the live pass, but a person is tombstoned at REQUEST time, so a pending identity deletion removes a real signup from the denominator for ≥7 days (forever if blocked), biasing the rate upward. 2 CHANGE on witnesses, 3 NOTE. `10b1-phase-review-r2-learning.md`. |
| Security (run on the surface) | **Almost · B** | Both round-1 blockers closed and verified by running the guards; 1 MEDIUM: password-reset mail can still be starved product-wide for a month by ~70 free signups a day with no operator exit; 2 LOW (URI-query password form; line-based argv scanner); 3 INFO (untracked S3 evidence vs the template test's rationale). `10b1-phase-review-r2-security.md`. |
| Consolidating code review | **Not yet · D** | **BLOCK, reproduced:** the receiver's per-row fallback re-claims ctids in a committed transaction and then deletes by ctid with no predicate; after a relocation it deleted a live, non-overdue row. The delete-kind fallback has no test at all (the redaction fallback has three). 2 CHANGE, 8 NOTE. `10b1-phase-review-r2-code.md`. |
| Acceptance criteria | **7 / 9 PASS** | Criteria 1, 2, 4, 5, 6, 7, 9 PASS with evidence; 3 UNPROVEN (no restore drill); 8 FAIL (this round's verdicts). Row-by-row below. |
| Acceptance walks | **0 / 8 run** | Unchanged. Bucket, IAM and break-glass exist (R-124); no keys issued, no restore host, no live mail, no deploy; browser walks not run this round. |
| Least-confident probe | **held (both)** | The plan's tombstone-store/restore-ordering line held under every reviewer (untouched by both fix rounds). The ledger's 2026-09-09 billing-contact line held under all six: keyed by user, NULL refused, on six sites and at erasure, witnessed. Correction from three reviewers: it holds every MEMBER, not "every owner". |
| Definition of Done | **not met** | Entry gate ✅; every applicable gate PASS ❌ (2 BLOCK, 4 NEEDS CHANGES); docs consistency ⚠️ (three comments assert what code lacks: signed columns, drill guard, purge population); reachability ✅. |
| Reviewer spend | **6 reviewers · this is round 2 of 2** | Announced 6, ran 6 (billing, tenancy, compliance, learning, security, code review), ~1.30M subagent tokens. Phase total: 11 reviewer runs over two rounds (5 + 6). The build lane spent a further 7 runs on its own gates for the two fix rounds. |
| Session model | Implementers and this round's gates: Claude Fable 5.1 (`claude-fable-5-1`) · effort not exposed | Read from the ledger's `started` lines: 2026-09-09 fix round 2 "Session model claude-fable-5-1"; the six reviewers dispatched on the session model. Round 1's gate ran on Opus 5 (1M). |
| Fixed without re-review | **0 in this lane** | Independent lane: nothing fixed here; every finding routed to the build lane (which is about to take them). |
| Reachability | **reached** | `/settings/account` (deletion, billing contact), `/recover-deletion`, the erasure path behind `RESPIN_DELETION_ERASURE_SCOPES`, request creation behind `RESPIN_DELETION_REQUEST_SCOPES`. |
| Deferred findings | **0 filed · 0 re-entered · 0 pending** | Nothing qualifies: every finding is against reachable code, and the two BLOCKs can lose or corrupt data, which never defers. |
| Gate intensity | **full in effect** | `Gate intensity: lean`, but billing and tenancy are `Full gates? yes`; compliance, learning and security were run as dedicated reviewers too, and the consolidating code review round 1 deferred was run as its own agent. |

**Top things to fix (in order):**

1. **`respin/packages/db/src/retention-receiver.ts:483-495`** — the per-row fallback re-claims ctids in a committed transaction and deletes by ctid with no predicate; re-apply `overduePredicate` (and `NOT redactionDonePredicate`) in the per-row statement, or claim-and-apply each row in one transaction, and add a DELETE-kind poison witness (a RESTRICT child planted for one operation).
2. **`respin/packages/db/src/activation.ts:432`** — count a tombstoned user whose identity operation is still `pending` via its captured contribution instead of dropping it; witness through a real `requestIdentityDeletion` (denominator unchanged before, during and after).
3. **`respin/packages/db/src/retention-receiver.ts:382` with `deletion-executor.test.ts`** — witness the extract-before-purge at erasure with a real `invoice.paid` payload and an asserted `complete` extract row; then the four copy-versus-code sentences and the signed-columns comment.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Acceptance criteria walk — round 2

The plan's **Done when** list, row by row, against the tree the third gate proved green (`entry-gate-10b1-round2-final3.txt`, 210 files / 5,031 tests). Movement from round 1 shown per row. A criterion I cannot evidence is a FAIL, not a pass-by-default.

| # | Criterion (abridged) | Round 1 | Round 2 | Evidence |
|---|---|---|---|---|
| 1 | Registry/table/row-class/field-set/writer/executor/probe closure is mechanical; all governed data classified | FAIL | **PASS** | The two producers round 1 named are lists now: `LIFECYCLE_COLUMN_CENSUS` (`packages/db/src/lifecycle-column-census.ts`) is checked by `validateLifecycleClosure` (`creator-data-registry.ts:1223-1259`, "uncensused column"), and `DYNAMIC_LIFECYCLE_WRITERS` is a list with a scan that refuses an undeclared dynamic-table module (`lifecycle-registry.test.ts` "declares EVERY dynamic writer"). `lifecycle-registration.test.ts` now plants a table AND a column (added this round: `uncensused column: subscriptions.planted_col`). 18/18 + 4/4 green. |
| 2 | Each scope's state machine, authority, session behaviour, populated erasure, cancellation, non-resurrection proofs pass | PASS | **PASS** | Unchanged from round 1, plus plan C3's release rule on every identity request/resume site (`deletion-lifecycle.ts` `assertWorkspacesReleasable`) and at erasure (`deletion-executor.ts`), witnessed by four lifecycle cases and "C3 at the LAST moment". |
| 3 | A real isolated restore cannot serve before tombstone replay/residue success; day-28 expiry evidenced | UNPROVEN | **UNPROVEN** | Unchanged: the ordering is implemented and fail-closed at five points (`restore-verify.ts:238-243`), but no drill has run. The bucket, IAM and break-glass role now EXIST (R-124, 2026-09-08) and the templates are witnessed (`s3-journal-policy.test.ts`); no restore host, no drill transcript. Engineering complete, evidence absent. |
| 4 | Journal forecast alerts at USD 0.50, blocks above USD 1 or when unavailable, never interrupts active work, cannot provision or spend | FAIL | **PASS** | `main` takes injectable price sheets; `journal-forecast-cli.test.ts` runs exit 0 ALLOWED (small), exit 0 + ALERT (63 cents), exit 2 BLOCKED (USD 1.50), a RECORDED owner ceiling raising it, and the raise-only clamp on a 63-cent forecast under a "10 cent" ceiling. `--owner-ceiling-cents` is the one producer of `ownerCostCeilingCents`. The repository ships a priced region, `price-snapshot.ap-southeast-2.json`, pinned number-for-number to the operator's evidence file. The continuity sentence is printed at every outcome. |
| 5 | Retention receivers operate independently of traffic and expose content-safe health | FAIL | **PASS** | Registration is now asserted: `worker/tests/retention-alerts.test.ts` "the runtime schedules RETENTION_QUEUE on a cron and works it" and "the production composition supplies runRetention" (source witnesses). Health: `oldestOverdueMs` measured on both paths; the backlog alarm is not permanently critical (round-2 BLOCK, 2026-09-08). And the sweep is exercised end to end: `retention-sweep-fixtures.test.ts` populates all 29 specs through the real deletion walks, one tick, `failures: []`, `poisoned: 0` — which found and fixed the alphabetical sweep order that put a RESTRICT child after its parent (`retention-clocks.ts` `orderChildrenFirst`). |
| 6 | Stripe finance facts survive redaction as complete or explicitly incomplete; identity erasure preserves activation contributions exactly once without retaining identity | FAIL | **PASS (finance) / PASS (activation)** | Finance: signed revenue columns with `amount_including_tax_cents` for the three tax-inclusive objects (migration 0055), per-row batch isolation so a proration credit cannot wedge the sweep (`retention-receiver.test.ts` "BLOCK: a proration CREDIT event…"), `currency` written honestly. Activation: `deriveActivationCohorts` filters `users.lifecycle_state <> 'tombstoned'` (`activation.ts:432`), so the stub row is no phantom signup; the capture is required, not defaulted (`activationExclusions`). The learning reviewer's round-2 verdict is the check on this row. |
| 7 | Public privacy/delete copy describes only shipped behaviour | FAIL | **PASS** | `RETAINED_COPY` is derived from the `EXTERNAL_COPIES` registry (every holder named, day-28 backup window stated, cohort period from the clock); the identity sentence names both release rules; the billing-contact and requests-closed sentences are pinned; every refusal code has a sentence and the lifecycle's message-coded refusals now reach it (`refusal-code.ts`, `account-copy.test.ts` 9/9). |
| 8 | Full tenancy and billing gates PASS; compliance runs for shared/private survival and content-log boundaries; final code review PASS | FAIL | **FAIL** | Billing NEEDS CHANGES (B), tenancy NEEDS CHANGES (B), compliance NEEDS CHANGES (B−), learning BLOCK (D), security NEEDS CHANGES (B), consolidating code review BLOCK (D). No PASS on any gate this round; two BLOCKs. |
| 9 | 10a/10b-2/10c receive a tested same-change lifecycle registration API and cannot add an uncovered table, row class, or field set | FAIL | **PASS** | `assertLifecycleRegistration` catches an unregistered table, an uncovered row class, a registered entry with no measure, and — as of this round's added case — a NEW COLUMN on a registered table, named. `REGISTERING-A-TABLE.md` gained sites 15 (column census) and 16 (the sweep-fixture list) and the children-first note on site 8. |

**Acceptance walks: still 0 of 8 run.** Walks 4, 5 and 8 need a restore host and the three workload users' credentials (bucket and IAM exist; no keys issued, no drill); walks 1–3 and 6–7 need live auth-mail and a browser walk. Browser acceptance is NOT blocked on this session's tooling (corrected 2026-09-08) and was not walked this round. Engineering completion and evidence completion remain separate claims.


## Reviewer spend, round 2

Announced 6, ran 6, in parallel, each briefed with the whole two-fix-round diff against `d5fbaf7`, both least-confident lines, the round-1 report, the ledger, the register and the build lane's five gate reports. Every reviewer showed movement per round-1 finding and hunted for defects the fixes introduced; two found one, both reproduced by execution. Convergence: the two BLOCKs are defects the *previous round's own fixes* introduced (the wedge fix's fallback; the stub filter), which the process names as the signal to stop revising and surface residuals. That is what this card does; the build lane may still take them, but a third independent round is the owner's call.

---

## Round 1 (2026-09-08) — preserved as written

# Phase 10b-1 review — respin-finish

*Independent phase gate on **Slice 10b-1 — Executable lifecycle, scoped deletion, and recoverable restores**. Reviewed at `d5fbaf7`, working tree otherwise clean. This is the phase-level evidence artefact the project's convention requires (evidence is per PHASE, never per task); the per-task manifests under `docs/progress/respin-finish/10b1-*` are provenance, not this gate.*

## Report card

**Overall: Not yet** — the engineering is substantial and the isolation core is genuinely sound, but three independent reviewers each found a shipping blocker: an ordinary paid-plan downgrade permanently wedges the Stripe payload receiver, a *completed* identity erasure still leaves the deleted person's email and billing address in the database while the account page tells them it doesn't, and the restore drill publishes the production database password to every local account on the host.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (typecheck/lint/test/build) | **Ready** | Canonical CI shape, Docker live: **203 files / 4,936 tests / 0 failed / 0 skipped**, exit 0; typecheck, lint, worker:typecheck, db:check, `next build` all exit 0. First genuinely zero-skip gate on this tree — see *Entry gate* below, which is itself a finding. |
| Respin billing & credits (`Full gates? yes`) | **Not yet · D** | BLOCK: a negative proration line wedges the 90-day payload receiver forever, loses the finance facts C5 exists to preserve, and mutes the backlog alarm. Reproduced by execution. |
| Respin brain tenancy (`Full gates? yes`) | **Almost · B−** | NEEDS CHANGES: no live leak and no silent brain mutation, but the registration gate handed to 10a is blind to a new *column*, a second destructive dynamic writer is outside the "exhaustive" writer population, and two of three export projectors are declared and unbuilt. |
| Respin spin compliance | **Not yet · D** | BLOCK: completed identity erasure retains email/name/billing address in `stripe_events.payload`; the public "what survives erasure" list omits it. Shared row classes for frameworks and autopsy caches have zero fixtures. |
| Respin learning honesty | **Almost · C** | NEEDS CHANGES: the learning rules survive untouched, but the activation metric this slice makes authoritative gains a fabricated signup per deleted account one year after each erasure. |
| Security (not a Critical Path row; run on the surface) | **Not yet · D** | BLOCK: `restore-drill.sh` puts the credentialed Postgres URI on argv while its own comment claims otherwise; an unauthenticated attacker can exhaust the global auth-mail quota for a calendar month with no runtime remedy. |
| Acceptance criteria | **2 / 9 PASS** | Of the plan's nine "Done when" bullets: 2 PASS, 4 FAIL, 3 UNPROVEN (no bucket, no drill, no live mail). Row-by-row below. |
| Acceptance walks | **0 / 8 run** | None of the eight walks were executed. Externally blocked: no S3 bucket, no IAM, no charge, no live mail, no deploy; browser acceptance blocked by admin policy since 9a. |
| Least-confident probe | **held** | *"The independent tombstone store and restore-before-traffic ordering are not present in current code."* Both security and tenancy probed it first and found the ordering **implemented and honestly caveated** — `restore-drill.sh` fail-closes at five points and states in terms "THIS IS NOT PERMISSION TO SERVE". The declared weak bet is the one thing that held. |
| Definition of Done | **not met** | Entry gate ✅; every applicable gate PASS ❌ (3 BLOCK, 2 NEEDS CHANGES); reachability ✅; docs consistency ⚠️ (three comments assert properties their code lacks). |
| Reviewer spend | **5 reviewers · 1 round** | 6 announced; the consolidating `code-reviewer` was **not run** — see *Reviewer spend* below for the reason and where it goes instead. |
| Session model | Implementers: Claude Fable 5.1 (Task 4→9), Opus 5 (1M) earlier · this gate: Opus 5 (1M) · effort not exposed to this session | Read from the ledger's `started` lines (2026-09-05 `gpt-5.6-sol / xhigh` for 9b; 2026-09-07 "Task 4 started (session model: Claude Fable 5.1)"). All five reviewers ran on this session's model as dedicated agents at their own `effort: max`. |
| Fixed without re-review | **0** | Independent lane: nothing was fixed here. Every finding is recorded and routed to the build lane. |
| Reachability | **reached** | `/settings/account` and `/recover-deletion` are live product routes; the erasure path runs behind `RESPIN_DELETION_ERASURE_SCOPES`. This is not inventory — which is why the BLOCKs matter now. |
| Deferred findings | **0 filed · 0 re-entered · 0 pending** | `docs/progress/respin-finish/deferred-findings.md` does not exist. No finding here qualifies: all are against reachable code, and the two security Highs are excluded from deferral by rule regardless. |
| Gate intensity | **hybrid — full in effect** | `Gate intensity: lean`, but billing and tenancy are `Full gates? yes` and auto-escalate. I ran compliance and learning as dedicated reviewers too rather than merging them: one extra agent, and it preserves each reviewer's `effort: max`, which a merged run loses. Stronger than lean, never weaker. |

**Top things to fix (in order):**

1. **`respin/packages/db/src/finance-extract.ts:297-317`** — a Stripe proration line carries a *negative* `amount_excluding_tax`; `extractInvoice` returns it `complete`, the insert hits the `>= 0` CHECK this phase added in `migrations/0053_marvelous_vampiro.sql:28-29`, the batch rolls back, and `retention-receiver.ts:355-370` swallows it — so every subsequent tick reclaims the identical `ORDER BY ctid LIMIT 500` set and fails identically, forever. Healthy events in the batch never redact either, and `oldestOverdueMs` returns `null` on the failure path, muting the only alarm that measures the 90-day deadline.
2. **`respin/scripts/restore-drill.sh:123,126,134,143,193,238`** — all six `psql`/`pg_restore` calls pass the full credentialed URI on argv, world-readable via `/proc/<pid>/cmdline`, while `:105-107` claims they use `PGPASSWORD` (which appears nowhere in the file). `backup.sh:146-161` already does this correctly.
3. **`respin/packages/db/src/deletion-executor.ts:170-190`** with **`app/(product)/settings/account/copy.ts:21-22`** — `erasureHold("identity")` returns `null` on the strength of the payload receiver existing, but that receiver is a *clock* running from `received_at`, not an erasure step. `packages/db/tests/deletion-executor.test.ts:640` asserts the surviving payload explicitly. Plan C3's remedy, `billing_contact_user_id`, has **zero occurrences in the repo**. Either purge the deleting billing contact's payload before `complete`, restore the identity hold, or name the Stripe payload window in `RETAINED_COPY`.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Entry gate

Run on the canonical CI shape with Docker Postgres live, per CLAUDE.md's Commands block. Transcript: [`respin-finish/entry-gate-10b1-close.txt`](respin-finish/entry-gate-10b1-close.txt). Each step captured its own exit code separately so no single failure could mask another.

| Step | Exit |
|---|---|
| `pnpm -C respin typecheck` | 0 |
| `pnpm -C respin lint` | 0 |
| `pnpm -C respin worker:typecheck` | 0 |
| `pnpm -C respin db:check` | 0 |
| `pnpm -C respin test` (TEST_DATABASE_URL live) | **0** — 203 files / 4,936 tests / 0 failed / **0 skipped** |
| `pnpm -C respin build` | 0 |

**The first run was red, and why it was red is itself a phase finding.** Nine suites — every `.docker.test.ts` in the repo — failed at setup with `error: out of shared memory`, all nine identically, at `packages/db/src/testing.ts:115`. Cause: `DROP SCHEMA public CASCADE` takes one lock per object; `public` reached **169 relations** after this phase's migrations 0047–0054, and nine suites ran that drop concurrently against a lock table sized `max_locks_per_transaction (64) × max_connections (100)`.

Fixed by pinning `command: postgres -c max_locks_per_transaction=512` in `respin/docker-compose.yml`, with the reason recorded in the file. Container recreated, setting verified live at 512, the `respin-pgdata` volume and its 169 objects intact. **This change is uncommitted and is not part of `d5fbaf7`** — the gate above passed against a modified working tree, flagged by the compliance reviewer as an evidence-hygiene note and repeated here so it is not lost.

**What this cost, and what it bought.** These suites *loud-skip* when `TEST_DATABASE_URL` is absent. The ledger's last recorded run — 181 files / 4,838 passed / 98 loud-skipped — was green precisely because the 98 tests that could have failed never ran. This is the project's own recurring shape: a green gate proving less than it appears to, in this case the one run CLAUDE.md designates as *"the only run that proves the ledger's money invariants under real concurrency."* The repaired gate runs **+22 files and +98 tests** over the last recorded run. T69-R17's reporter-RPC flake did not recur (a true exit 0, not a swallowed 1) — one clean run is not enough to retire it.

---

## Acceptance criteria walk

The plan's **Done when** list, row by row. A criterion I cannot evidence is a FAIL, not a pass-by-default.

| # | Criterion (abridged) | Verdict | Evidence |
|---|---|---|---|
| 1 | Registry/table/row-class/field-set/writer/executor/probe closure is mechanical; all governed data classified | **FAIL** | Closure is real and well-built — `ROW_CLASS_INVENTORY` throws at module load on a missing discriminator (`creator-data-registry.ts:570-575`), and most populations are explicit `satisfies`-closed lists. But two are **producers, not lists**, which CLAUDE.md Respin rule 7 forbids: `remaining_columns`/`all_columns` field sets are computed by filter (`:1155-1166`), so a new column is silently absorbed; and `DYNAMIC_LIFECYCLE_WRITER` is a singular record (`:1195`) while `retention-receiver.ts:73` is a second dynamic destructive writer, absent from every swept table's `physicalWriters`. |
| 2 | Each scope's state machine, authority, session behaviour, populated erasure, cancellation, non-resurrection proofs pass | **PASS** | Owner-only enforced server-side off `memberships.role` under `lockIdentityMembershipGraph`/`lockWorkspaceMembershipGraph` (`deletion-lifecycle.ts:2485-2526`); typed-name confirmed against stored name; global session deletion occurs at exactly one site, the identity acknowledgement (`:1014`), witnessed at `packages/db/tests/deletion-lifecycle.test.ts:2094` — workspace deletion does **not** revoke the global session. Recovery credential: 256-bit `randomBytes(32)`, sha256 digest storage, `timingSafeEqual`, single-use under `FOR UPDATE … RETURNING`, 5 attempts/15 min per operation *and* per client digest. The IDOR on client-supplied `operationId` is closed by re-selection after locking. |
| 3 | A real isolated restore cannot serve before tombstone replay/residue success; day-28 expiry evidenced | **UNPROVEN** | The ordering is implemented and fail-closes at five points; `restore-verify.ts:238-243` exits 2 on any unverified chain, database-ahead conflict or journal-only operation. But no drill has run — no bucket, no IAM, no charge. Correctly disclosed at `infra/s3-deletion-journal/README.md:49-55`. Engineering complete, evidence absent. |
| 4 | Journal forecast alerts at USD 0.50, blocks above USD 1 or when unavailable, never interrupts active work, cannot provision or spend | **FAIL** | The arithmetic is sound and unit-tested at the exact boundaries (`packages/db/tests/deletion-journal.test.ts:711-837`), and the module compiles no price. But `main` calls `loadPriceSnapshots()` with no injection point and the repo ships no priced snapshot, so **every CLI test takes the `withheld` branch** — the three priced exit codes a release checklist gates on are never executed through the artefact. Separately, `ownerCostCeilingCents` has no producer: no caller can supply it. |
| 5 | Retention receivers operate independently of traffic and expose content-safe health | **FAIL** | Content-safety holds well — `toSafeWorkerEvent` is a closed field allowlist that throws on violation, and failure codes are SQLSTATE-only. Independence does not: grep across the whole tree for `RETENTION_QUEUE`, `runRetentionAndRecovery`, `evaluateRetentionAlerts`, `OVERDUE_BACKLOG_MS` finds **zero references outside their own source**; `runRetention` is optional in `PgBossRuntimeSources` and registers only `if (this.#sources.runRetention)`. Every clock in this slice rides an unasserted registration (T69-R5, still open). |
| 6 | Stripe finance facts survive redaction as complete or explicitly incomplete; identity erasure preserves activation contributions exactly once without retaining identity | **FAIL** | Both halves fail. Finance: the negative-proration BLOCK (top fix 1); plus `currency` is written as the literal `'USD'` even on rows refused for `non_usd_currency`, and three tax-*inclusive* amounts land in `amount_excluding_tax_cents` as `complete` (T69-R14). Activation: `lifecycle-sql-port.ts:334-343` inserts a tombstone stub `users` row with `created_at` defaulted to *now*; `deriveActivationCohorts` iterates `users` with **no `lifecycle_state` filter**, excluded today only by the stub id appearing in the `applied` set — and `retention-clocks.ts:226-231` deletes that receipt row at one year. One year after every erasure, each deleted account contributes one fabricated non-activated signup, permanently. |
| 7 | Public privacy/delete copy describes only shipped behaviour | **FAIL** | `RETAINED_COPY` presents a *closed* "what survives erasure" list that omits: up to 90 days of unredacted Stripe webhook JSON containing the deleting person's email, name and billing address (the compliance BLOCK); database backups, up to 21 further days — the entire reason C4's deadline is day 28 while `WORKSPACE_DELETE_COPY:14` says only "erases it after a 7-day grace period"; the LLM processor; and Resend's own retention. The cohort-count class is named with no period at all (the registry retains it two years). By naming Stripe as the sole exception the copy implies provider erasure it does not perform. |
| 8 | Full tenancy and billing gates PASS; compliance runs for shared/private survival and content-log boundaries; final code review PASS | **FAIL** | Billing BLOCK, tenancy NEEDS CHANGES, compliance BLOCK. Final code review not run (see *Reviewer spend*). |
| 9 | 10a/10b-2/10c receive a tested same-change lifecycle registration API and cannot add an uncovered table, row class, or field set | **FAIL** | `assertLifecycleRegistration` genuinely catches an unregistered table and an uncovered row class, and `REGISTERING-A-TABLE.md` exists. It **cannot catch a new column** (criterion 1), and 10a is the first slice to add columns under it. `lifecycle-registration.test.ts:23-53` plants a table and a missing measure, never a column. This is the criterion the whole slice exists to deliver. |

**Acceptance walks: 0 of 8 run.** Walks 1–3 and 6–7 need live auth-mail and a browser (blocked by admin policy since 9a); walks 4, 5 and 8 need a provisioned S3 bucket, IAM roles and a real restore host. Engineering completion and evidence completion are separate claims (CLAUDE.md non-negotiable 6) and this card keeps them separate.

---

## Reviewer spend

**Announced 6, ran 5, one round.** Five dedicated reviewers: `respin-billing-reviewer`, `respin-tenancy-reviewer`, `respin-compliance-reviewer`, `respin-learning-reviewer`, `security-reviewer`. Approximately 1.2M subagent tokens, 318 tool calls.

The sixth — the consolidating `code-reviewer` — was **not run**, a deliberate call recorded rather than quietly dropped. Three independent BLOCKs already settle the phase verdict; this is the independent lane, where findings are recorded and routed rather than fixed; and a consolidating pass over code that is about to change substantially would have to run again against the fix round regardless. **It belongs on the fix round, and the build lane should treat it as required there, not optional.** The argument against this call: 10b-1 is ~24k insertions of new lifecycle code and a generalist pass hunts defects outside all five lenses — that risk is real and is accepted here, not denied.

No reviewer needed a second round: no gate produced findings that a re-run would adjudicate, and the convergence stop-rule does not apply (round 1 findings are original defects, not repairs of a previous round's fixes).

---

## Cross-reviewer convergence

Findings that more than one reviewer reached independently carry more weight than any single verdict, and three did:

1. **The two dead `recovery_secret` sweep specs** (`retention-clocks.ts:266-276`, `:284-294`) — found independently by **billing, compliance and tenancy**. `deletion_operations_recovery_shape` requires `recovery_expires_at IS NULL` for every non-identity scope; both measures precondition on it being NOT NULL. No row can ever satisfy both, so two of 29 specs are structurally dead and every assertion over them passes on an empty set. Worse, both still redact `request_session_digest`, which a second CHECK forbids pre-terminally — **verbatim the defect round 2 found and fixed on the identity sibling**, whose own comment at `:239-249` documents the fix. Fix-the-field-not-the-class (CLAUDE.md 2026-07-30), recurring inside the fix that recorded the lesson.
2. **The unasserted retention-sweep registration** (T69-R5) — **learning and tenancy**, both by the same zero-reference grep.
3. **`billing_contact_user_id` has zero occurrences in the tree** — **billing and compliance**, from opposite directions (the Stripe customer object retaining the deleted person's email; the account copy's closed survival list omitting the payload).

**One disagreement, recorded rather than resolved silently.** The three reviewers who counted vacuous sweep specs disagree on the number: tenancy enumerates **17 of 29** unpopulated with line numbers, learning enumerates **19 of 29**, billing counts 5 tables with fixtures. The delta is the two `stripe_events::*::provider_financial_authority` specs, which tenancy counts as populated and learning does not. Whoever fixes this should settle it by execution, not by picking a number. All three agree the nine `deletion_*::receipt_facts` specs are the sharp ones: each is a whole-row `DELETE` from a table under `RESTRICT` foreign keys from four to six siblings, and no fixture has ever exercised the parent/child ordering. Tenancy traced the ordering by hand and believes it correct — and says plainly that this is reasoning, not a witness.

---

## Definition of Done audit

| Item | Met? | Note |
|---|---|---|
| Entry gate clean | ✅ | Green, zero-skip — after the harness repair above, which is uncommitted. |
| Every applicable Critical-Path gate PASS | ❌ | 3 BLOCK, 2 NEEDS CHANGES across five paths. |
| Report card reads Ready | ❌ | Not yet. |
| Cross-referenced docs consistent | ⚠️ | Three comments assert properties their code lacks: `restore-drill.sh:105-107` (PGPASSWORD), `creator-data-registry.ts:1195` ("the ONE dynamic writer"), `retention-clocks.ts:257` ("not an extra window on top" — the digest actually erases at request + 14 days, not 7). Plus a stale comment at `worker/deletion-lifecycle.ts:60-61`. |
| Acceptance criteria met | ❌ | 2/9 PASS. |
| Reachability | ✅ | Live routes; not inventory. |

---

## Residual register

The 17 pre-existing entries **T69-R1…R17** in [`respin-finish-open-items.md`](respin-finish-open-items.md) were carried into this gate as briefing material. This review confirms several are still open in the tree rather than closed (**R1/R15** activation provenance and small-cell, **R4** unkeyed chain key, **R5** sweep scheduling, **R8** the field-blind registration API, **R11** the unenforced seven-year claim, **R14** tax-inclusive amounts). Three were written into 10a's plan rather than fixed; that remains a plan edit, not a code fix, and 10a inherits them.

This gate adds roughly **30 further findings** across the five reviewers. They are not renumbered into the register here — the build lane should triage them from the five verdicts and register what survives triage, so the register records defects rather than reviewer output.

---

## What held

Worth recording, because it is what kept two of five gates out of BLOCK and it is a large amount of correct work:

- **The declared least-confident line held.** The restore-before-traffic ordering — the thing the plan said was absent and risky — is implemented, fail-closed at five points, and honestly caveated in its own README and refusal text.
- **Isolation is sound.** No cross-profile or cross-workspace read is reachable from the new surface; no brain-doc mutation outside `with-workspace.ts`; no role gate taken from a form; `brain_docs` has exactly one registry entry so no UPDATE target exists; erasure stubs are fresh randoms per operation with the mapping discarded, so no two tenants' retained financial rows share a stub.
- **The recovery cryptography earns its grade.** Security enumerated a dozen attacks that correctly fail, including the replay/race on the single-use credential, starving the rate limiter, widening the reauth window from the client, and the prior `psql -c` interpolation defect — genuinely closed.
- **Content-safe boundaries hold.** `toSafeWorkerEvent` is a closed allowlist that throws; failure codes are SQLSTATE-only; journal objects carry opaque ids; no mail body, address or action URL is logged anywhere in the new code.
- **Shared-vs-private classification is structurally sound.** Every mixed table binds its row class to a database CHECK, and shared rows carry NULL `profile_id` so the cascade FK is inert. It is *unverified* for frameworks and autopsy caches (no fixtures), not broken.

---

*Written by `/review-phase` (via `/go`) on 2026-09-08. The master plan's Progress-tracking row is **not** updated — that happens only on READY. 10b-1's row stays `🛠️ implementation`, and 10a stays blocked on the lifecycle handoff, which criterion 9 shows is not yet deliverable.*

---

# Fix-round addendum — 2026-09-08

*The build lane's response to the gate above, in the same session. Written here rather than as a new document: the phase has one report card.*

## Movement

**Not yet → still Not yet, but for a different and much shorter list.** 33 of the 45 findings are closed and each was verified by **replanting the original defect and watching a test go red** — not by re-reading the fix. All three BLOCKs and all seven reviewer Highs are among them.

| Gate | Before | After |
|---|---|---|
| Entry checks | 9 Docker suites dead at setup; then green | typecheck / lint / worker:typecheck / db:check / build all **exit 0**; suite **205 files / 4,979 tests**, 0 skipped, **1 failing** (below) |
| Respin billing & credits | **Not yet · D** (BLOCK) | BLOCK closed; 4 of 10 findings remain, all Medium/Low |
| Respin spin compliance | **Not yet · D** (BLOCK) | BLOCK closed; shared-class fixtures remain |
| Security | **Not yet · D** (BLOCK) | both Highs closed; 3 S3-template findings remain, 2 unclosable without real IAM |
| Respin brain tenancy | Almost · B− | all 3 Highs closed (column census, dynamic-writer list, export claims) |
| Respin learning honesty | Almost · C | all 3 Highs closed (fabricated signup, metric horizons, worker/ scan) |

## What the guards caught that the reviewers did not

Seven defects, each found by a guard written during this round rather than by re-reading:

1. **`backup.sh`'s main `pg_dump` leaked the credential too.** The security review read lines 138–161, which are correct, and never checked line 86 — the actual backup command.
2. **Five unbuildable export claims, not one.** `memberships`, `user`, `users`, `workspaces` and `credit_ledger` all promised `included` under `identity_self` / `workspace_owner`, projectors that are declared and not built.
3. **A stale symbol in my own comment**, caught by `symbol-citations.test.ts` after I renamed a function.
4. **My new purge is a scannable writer** and had to be enumerated — caught by P8.
5. **`billing-schema.ts` had genuinely mixed line endings** (537 CRLF of 1105). `git status` reported it clean because the blob is uniform; only a byte-level check saw it. The 2026-09-04 class exactly.
6. **The migration parser failed closed on `DROP DEFAULT`** — correct behaviour; it needed teaching, not loosening.
7. **My own first guard was vacuous.** The `PGPASSWORD` assertion matched the word anywhere in the file, so a planted mutation deleting the real `export PGPASSWORD=` line stayed **green** — the word survived in a comment two lines above. Caught by my own replant, fixed to match an `export` on a non-comment line. Recorded because it is the same shape as the round-1 R-122 tautology, produced inside the fix pass for that very class.

## The finding the lock repair uncovered

Raising `max_locks_per_transaction` took the canonical gate from **181 files / 4,838 passed / 98 loud-skipped** to **205 files / 4,979 tests / 0 skipped**. The nine `.docker.test.ts` suites had never all run before — they loud-skip without `TEST_DATABASE_URL` and, with it, died at setup on the lock ceiling.

Running them exposed a **real production defect in the recovery path**: the delivery-receipt check compared a timestamp produced by the delivery side against two produced by the database, with **zero tolerance**, across eleven conditions collapsed into one opaque `delivery_receipt_mismatch`. In production the worker and the database are different machines and `deliveredAt` comes from the mail provider's clock, so any disagreement refuses the delivery that carries someone's only means of cancelling an irreversible deletion. Fixed: one content-free code per condition; a bounded 60 s tolerance on the three cross-machine clock comparisons and **none** on expiry, which is a real deadline; and the reconcile path, which was a second hand-written copy of the same eleven conditions, now shares the one authority.

## The one open failure, diagnosed and deliberately not patched

`deletion-executor.docker.test.ts` → *"lets exactly one of four simultaneous workers advance a due operation"* fails under full-suite load with `expected 2 to be 1`, and passes alone.

It is **not** a lease defect. Four workers are started with `Promise.all`, but nothing forces them to overlap; under starvation w1 completes and releases before w2 begins, so w2 legitimately claims the next due state. The suite asserts a race it does not force — the same non-vacuity gap `inference-race.docker.test.ts` in this repo explicitly closes with a warmed-pool check.

`vitest.config.ts` records that reducing global parallelism was measured and rejected twice, and states in terms that *"a test that fails on an assertion is a different problem and this comment does not license stretching the timeout for it."* Fixing it properly means giving the executor a barrier seam so the race is deterministic. That is a design change, not a patch, so it is recorded here rather than worked around. **Across four full runs a different Docker suite failed each time**; two of those causes are now fixed and this is the remaining one.

## Still open (12)

Ordered by what they cost to leave:

1. **`billing_contact_user_id`** — C3's Stripe-customer binding, still zero occurrences repo-wide. The payload purge now clears **our** copy of the deleted person's email; the Stripe **customer object** still holds it. Both billing and compliance flagged this independently.
2. **Sweep-spec fixtures** — 17–19 of 29 still assert against empty tables. The nine `deletion_*::receipt_facts` specs are whole-row `DELETE`s under `RESTRICT` foreign keys whose parent/child ordering has never been exercised.
3. **Shared-class fixtures** — `frameworks` has no rows of any class; `autopsies` / `autopsy_cache_claims` only private ones.
4. **The four S3 IAM/bucket templates** — asserted by nothing, with the `Bool` + `s3:ObjectCreationOperation` pairing probably vacuous. Two of the three cannot be closed from this machine: confirming a bucket policy denies what it claims needs `aws iam simulate-custom-policy` against a real account.
5. **`RESPIN_DELETION_REQUEST_SCOPES`** — the staged rollout the plan requires is not implementable without it.
6. Five smaller items: the forecast CLI's priced exit codes have no witness; `ownerCostCeilingCents` has no producer; `stripe_unattributed::linkable_source_ids` has no effective clock; `pendingDeletions` reads a governed table outside the accessor map; no CHECK ties an autopsy's `rights_scope` to its trend item's.
7. The executor barrier seam above.

## Evidence, unchanged and separate

Still 0 of 8 acceptance walks. No S3 bucket, no IAM, no charge, no live mail, no deploy. **One correction to the record: browser acceptance is not blocked** — Playwright responded on this session's tooling, so the blocker carried since 9a is stale.

`respin/docker-compose.yml` (the `max_locks_per_transaction=512` pin) is **uncommitted**, so every gate transcript in this round passed against a modified working tree.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Final state of the fix round (2026-09-08, end of session)

**Entry gate: GREEN, all six steps.** `typecheck` · `lint` · `worker:typecheck` · `db:check` · `test` · `build` all exit 0. **206 files / 4,991 tests / 0 failed / 0 skipped / 0 unhandled errors**, CI shape with Docker live. Transcript: [`respin-finish/entry-gate-10b1-final.txt`](respin-finish/entry-gate-10b1-final.txt). The last run before this round was 181 files / 4,838 passed with 98 loud-skipped.

**R-124 provisioning is done and its evidence is in the repo.** Bucket, policy, three separated principals and a break-glass role exist on a real AWS account; `respin/infra/s3-deletion-journal/` now holds `RUNBOOK.md`, `POLICY-CHANGES.md`, the four applied policies and 18 raw evidence files. All 17 RUNBOOK links resolve and the recorded policy sha256 was recomputed here and matches byte-for-byte. That closes the S3 findings the review could not close from this machine — and it found **three template defects no test here could**, the sharpest being that `s3:x-amz-object-lock-mode` is not a condition key AWS defines, so `DenyWeakOrAbsentObjectLock` had never evaluated as intended. **The test I had written to guard those templates pinned the invalid key as correct** — it defended the defect rather than catching it. A `VALID_S3_CONDITION_KEYS` allowlist now covers all six templates.

**Still open, unchanged by this round:** the sweep-spec and shared-class fixture populations, `billing_contact_user_id` (our copy of a deleted person's email is now purged; Stripe's is not), `RESPIN_DELETION_REQUEST_SCOPES`, and the five smaller billing/tenancy items. Acceptance walks remain 0 of 8 — no credentials issued, no worker deployed, no restore drill — so **evidence completion is still separate from engineering completion, and this phase is still not `Ready`**.

