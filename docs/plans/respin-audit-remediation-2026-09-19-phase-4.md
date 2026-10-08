# Phase 4 — Money: ledger invariants, scoped reads, cost

Depends on: Phase 3 (takes migration `0062`; this phase takes `0063`). Owner: `respin-engineer`. Est. 5–7 h; **10–13 h with the 2026-10-05 additions** (an estimate). **Amended 2026-10-05:** the landing ordinal is the next free one on disk. Under the amended order Phases 3, 5, 2 and 6 land migrations first, so this phase's ledger trigger is expected at `0067`, matching the master's *Database* landing map.
**Read first:** the codebase review §2's *Ledger* paragraph — three triggers on `credit_ledger`, **all INSERT-time**, and no `CREATE RULE` anywhere in the migration set.

## Objective

CLAUDE.md's second Respin non-negotiable is "the ledger is the balance… `credit_ledger` is append-only, balance derived". Today that is convention plus a lint fence: nothing in the database forbids an UPDATE or a DELETE, two test files freely issue one, and the erasure port genuinely issues one on purpose. This is the 2026-08-21 lesson one level down — **not typed shut *and* not runtime-stripped**.

The rest of the phase is three edges that are correct on today's fixtures and wrong on a populated table: a guard whose population is a hand-list over one file while real writers sit outside it, cross-workspace reads on request paths, and a full-table scan with a 2N query loop inside a page render.

**Lesson that bites here,** verbatim: *2026-08-21 — **Proving a field cannot be TYPED is not proving it cannot be CAST**: for every server-derived column, assert the runtime strip by smuggling a value in through `as unknown as`, not only by `@ts-expect-error`.*

## Critical Paths touched and gate selection

| Path | Why | Verdict owed |
|---|---|---|
| Respin billing & credits | the ledger, the subscription mirror, spend reconciliation | 1 (**separate full gate**) |
| Respin brain tenancy | unscoped cross-workspace reads on request paths | 1 (**separate full gate**) |

Two verdicts, both full gates. Row 21 (`trends-storage.ts`'s four pre-vendor refusals) changes the **class** of a thrown error on the Spin path, not the similarity gate's decision or any refusal predicate — the merged reviewer's cross-phase note that it "could select compliance" is answered here: compliance is not selected, because nothing the gate decides moves; the card quotes the four diffs so the reviewer can confirm each is a type change alone.

## Requirements

- **P4-R1 (REG-5, MEDIUM).** `credit_ledger` refuses UPDATE and DELETE **at the database**, with one explicit, commented exemption for the pseudonymiser's `workspace_id`-only assignment (`lifecycle-sql-port.ts:561-570` via `creator-data-registry.ts:187-190`). The exemption is expressed as "this column and no other", not as a role or a flag — an authority overridable from the component it governs is a comment. **Its exact form is one trigger:** `IF (to_jsonb(OLD) - 'workspace_id') IS DISTINCT FROM (to_jsonb(NEW) - 'workspace_id') THEN RAISE`, so `workspace_id` may change and every other column is compared byte-for-byte; DELETE raises unconditionally. The exempt set is then named in two places — the migration SQL and `SPLIT_TABLE_FIELD_SETS.credit_ledger[0].columns` (`creator-data-registry.ts:187-190`, `["workspace_id"]`) — and a test reads the column name out of the migration SQL and asserts equality with the registry's list, so the two cannot drift. **The migration comment records** that R-122's seven-year financial-chain receiver (`retention-clocks.ts:79-85`: "keeps the DESTRUCTIVE receiver disabled until jurisdiction and ledger-chain review") will need the DELETE guard **re-decided** when it is enabled — a one-line note at the guard, so the engineer who enables the receiver meets the answer rather than the wall.
  - **The source scan covers both shapes (billing gate CHANGE).** `packages/credits/tests/ledger.test.ts:749-790` extends from insert-only *shape* to *mutation* across the **builder** shape (`.update(creditLedger)`, `.delete(creditLedger)`) **and** the **raw** shape (`UPDATE\s+"?credit_ledger`, `DELETE\s+FROM\s+"?credit_ledger`, and `relation(...)`-rendered writes — the pseudonymiser renders `` sql`UPDATE ${relation(physical.schema, physical.table)} SET …` `` at `lifecycle-sql-port.ts:566-570`, resolving the table name at runtime, so the scan also flags any `sql\`UPDATE ${relation(` / `sql\`DELETE FROM ${relation(` under production roots and requires each to sit on the exemption list with the `lifecycle-sql-port.ts` site as its only member). Measured 2026-09-21 (orchestrator-verified): zero raw `UPDATE`/`DELETE` against `credit_ledger` in `src/`; the pseudonymiser is the one `relation(...)`-rendered writer.
  - **Test files that mutate the ledger, all listed:** `packages/db/tests/db.test.ts:518` and `brain-schema.test.ts:780` (builder `.update(creditLedger)`) are rewritten to set up through inserts. `packages/db/tests/lifecycle-migration.test.ts:256,288,563,569` (raw `UPDATE "credit_ledger"` / `UPDATE credit_ledger` / `DELETE FROM credit_ledger`) is **reviewed and unaffected**: it runs on PGlite and applies only the migrations *before* `0046`/`0047`/`0048` (`:23-30`, `:132-140`, `:214-222`), so `0063`'s trigger never exists in that database and its raw statements keep exercising the earlier constraints they were written for; it is listed on the scan's exemption list with that reason, under `packages/db/tests/` only.
- **P4-R2 (REG-6, MEDIUM).** The mirror-writer lock guard's population is **derived**: every module that writes `subscriptions` is enumerated by reading the table's writer set, not by scanning one file against a literal list (`actions.test.ts:2428-2440`, which reads `actions.ts` alone). **The derivation's predicate, written out (batch-1 generalist MEDIUM — the earlier text classed `deletion-commands.ts:192` as "another verb" when it is the same verb under a namespace, and stated no predicate at all):** over every file `sourceFilesUnder(PRODUCTION_ROOTS)` returns whose path has no `tests/` segment (`PRODUCTION_ROOTS` = `packages, app, worker, scripts, lib, ops` — Phase 1 row 1's export from the shared walker `tests/support/source-files.ts`, CRLF-normalised; **not** `ROOT_DIRS`, which carries `tests` and `e2e` — this sentence named `ROOT_DIRS` until the 2026-09-21 Codex re-check, the same root set Phase 1 row 23, Phase 3 row 13 and Phase 11 row 11 use), a file is a writer when it matches **(i) the builder shape** `/\.(update|insert|delete)\(\s*(?:[\w$]+\.)*subscriptions\s*\)/` — the bare identifier, any depth of namespace prefix (`schema.subscriptions`, `tables.db.subscriptions`), and a destructured `const { subscriptions } = schema` (which yields the bare spelling); **(ii) the raw shape** `/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?subscriptions\b/i` inside any `` sql` `` template or string; or **(iii) the `relation(`-rendered shape** P4-R1's ledger scan already recognises (`` sql`UPDATE ${relation( ``), the same predicate family so the two scans cannot drift on what "a write" is. **One spelling the text predicate cannot see, handled by a second pass rather than left as a hole:** an aliased import (`import { subscriptions as subs } from "@respin/db"` → `.update(subs)`) — the scan reads every `@respin/db`/`./billing-schema` import specifier in the file, collects any alias of `subscriptions`, and adds it to the identifier set for (i). **Measured 2026-09-21 (Codex re-check — the batch-1 figure of eleven had run (i) and (ii) and stated (iii) without running it) with (i)–(iii) over that population: twelve writer modules.** Eleven in `packages/credits/src` by (i), thirty-one sites — nine issue the bare `.update(subscriptions)` (`pause.ts` ×4, `stripe/auto-topup-rollout.ts:207,511`, `stripe/billing-contact.ts:161`, `stripe/auto-topup.ts` ×5, `stripe/auto-topup-v1-reconcile.ts:361`, `stripe/actions.ts` ×6, `stripe/tier-checkout-rollout.ts:174`, `stripe/tier-checkout-v1-reconcile.ts:666,728`, `stripe/webhooks.ts` ×7), `stripe/deletion-commands.ts:192` issues the **namespaced** `.update(schema.subscriptions)`, and `stripe/customers.ts:106` issues `.insert(subscriptions)`; zero by (ii) under any root; **and one by (iii): `packages/db/src/lifecycle-sql-port.ts`**, five `relation(`-rendered writes (`:488,497,508` `DELETE FROM`, `:554,568` `UPDATE`), whose table is resolved at runtime from the lifecycle registry — and the registry routes `subscriptions` through it (`creator-data-registry.ts:381`: `action: "pseudonymise"`, `executor: "workspace_pseudonymiser"`, the `SPLIT_TABLE_FIELD_SETS.subscriptions[0]` column set), so the port really writes the mirror at erasure and is the twelfth writer, not a false fire. (The registry's own `physicalWriters` list for `subscriptions` at `:1416` names the eleven `packages/credits` files and not the port, for the reason `:1332-1341` records — a dynamic writer is present in no per-table list — which is exactly why this scan derives the population instead of reading that list.) One dynamic-write spelling (iii) does not see, dispositioned rather than left as a hole: `retention-receiver.ts:465,481` render `DELETE FROM ${table}` / `UPDATE ${table}` over an `sql.raw` identifier from `retention-clocks.ts`'s spec list, which names no `subscriptions` measure (measured 2026-09-21: `grep subscriptions retention-clocks.ts` → zero; the receiver's only `subscriptions` mention is a `SELECT` at `:382`), and the scan pins that by reading the spec list's table names, so a planted `subscriptions` retention spec is a writer without a disposition and red. Tests are outside the population by the `tests/` segment — `packages/db/tests/lifecycle-migration.test.ts` and `deletion-lifecycle.test.ts` write the mirror as fixtures. **Five of the twelve have no in-file `takeWorkspaceLock`** (the `takeWorkspaceLock(` count per writer file is the guard's second predicate — measured 2026-09-21: `pause.ts` 1, `actions.ts` 10, `auto-topup-v1-reconcile.ts` 5, `auto-topup.ts` 6, `billing-contact.ts` 1, `tier-checkout-v1-reconcile.ts` 1, `webhooks.ts` 1, and zero in the five below), and each gets a disposition at the line:
  - `stripe/tier-checkout-rollout.ts:172-187` (`fenceEligibleGenerations`) — **exemption, stated at the line:** it runs only inside `beginTierCheckoutProtocolDrain`'s transaction, which first takes `LOCK TABLE subscriptions, … IN SHARE ROW EXCLUSIVE MODE` (`:203-205`), a table lock that waits out and excludes every per-row writer; the per-workspace advisory lock is subsumed. Its quiescence precondition is expressed as a check, not as prose.
  - `stripe/auto-topup-rollout.ts:207,511` — **exemption, stated at the line:** the same `LOCK TABLE subscriptions, credit_ledger, pause_periods, auto_topup_protocol_rollouts IN SHARE ROW EXCLUSIVE MODE` at `:191`, `:253`, `:475` precedes each write in its transaction.
  - `stripe/customers.ts:105-130` — **exemption, stated at the line:** it is an `INSERT … ON CONFLICT (workspace_id) DO NOTHING` (`:129`) that creates the mirror row and mutates nothing; the unique constraint is the serialisation, and the loser reads the winner (`:131-137`). Phase 8's idempotency key makes the concurrent Stripe side converge too.
  - `stripe/deletion-commands.ts:191-194` (`auto_topup_disable`, writing `AUTO_TOPUP_DISARMED_FIELDS`) — **lock it:** `dispatchExternalCommands` (`deletion-external-commands.ts:414`) runs the port with `db`, outside the executor's transaction, so this charge-authority write races `maybeAutoTopup`, which holds the lock. It gains its own `db.transaction` with `takeWorkspaceLock`; if it is ever composed inside a transaction that already holds `lockWorkspaceMembershipGraph`, the order is membership graph first, then workspace lock, matching `webhooks.ts:1017-1018`.
  - `packages/db/src/lifecycle-sql-port.ts:566-570` (the pseudonymiser's `UPDATE ${relation(…)} SET workspace_id = …`, which the registry routes `subscriptions` through) — **exemption, stated at the line, with the reason it is not locked:** the write runs inside the deletion executor's transaction under `lockWorkspaceMembershipGraph` (`deletion-executor.ts:297`, `lockScopeInTx`) on a workspace already `erasing`, whose Stripe subscription was cancelled two phases earlier in `external_actions_pending` (Phase 5 P5-R1) and whose every billing action the lifecycle fence refuses; it assigns `workspace_id` alone (the same column-scoped write P4-R1 exempts on `credit_ledger`, and P5-R1's second money consequence); and `packages/db` **cannot** take `takeWorkspaceLock` — the lock lives in `packages/credits/src/clock.ts` and `@respin/credits` depends on `@respin/db`, never the reverse — so locking it would need the advisory-lock key duplicated one package down. The exemption is therefore a recorded choice with its witness: the entry names the port, asserts that the registry still routes `subscriptions` to `workspace_pseudonymiser` (`creator-data-registry.ts:381`), and asserts the port's `subscriptions` assignment set is `SPLIT_TABLE_FIELD_SETS.subscriptions[0].columns` and nothing wider, so the exemption cannot outlive the write it describes. Row 6 carries the line.
  The derived assertion is proved by plants (AC3): deleting a known writer from the population reddens it, **and** a new file under production roots with an unlocked write and no exemption reddens it in **each spelling the predicate claims** — the namespaced `.update(schema.subscriptions)` (the spelling `deletion-commands.ts:192` really uses), the bare `.update(subscriptions)`, the aliased `.update(subs)`, a raw `` sql`UPDATE subscriptions SET … ` `` and a `relation(`-rendered `` sql`UPDATE ${relation("public", "subscriptions")} SET … ` `` — because a plant in only the bare spelling would prove the derivation finds an unknown writer that happens to spell the table the way the existing nine do. **One hop outward:** the guard that consumes this population is the assertion itself (`actions.test.ts:2428-2440` today, rewritten over the derived set); the disposition list — the five entries above (four exemptions and one lock) — is the second input to that assertion, and a writer that is neither locked nor on the list is the red case, so a sixth unlocked writer added later is a list edit (rule 7), not a silent pass.
- **P4-R3 (REG-7, MEDIUM).** Every request-path `credit_ledger` read carries a `workspaceId` predicate when the verified workspace is in hand — `auto-topup.ts:640-644`, `:885-889`, `webhooks.ts:2431-2433`, `auto-topup-v1-reconcile.ts:172-174,218-220,244-246,275-277,705-707`, `auto-topup-rollout.ts:331-332,496-502`. Where a global sweep is intended, the line says so.
- **P4-R4 (REG-8, MEDIUM).** `reconcileSpend` is one grouped statement (or explicitly paginated) rather than an unbounded `db.select()` plus 2N sequential queries inside a server-component render (`spend-rollup.ts:299,307-338,398-400`).
- **P4-R5 (D11, MEDIUM).** The three documented contracts in `generate.ts` that are false become true, in the direction that keeps the honest answer:
  - `frameworkOffer` is `null` rather than zeroes when no offer was built (`:274-278` vs `:694-707`, `:1022`) — and `projection.ts:175-187`, which states the invariant as fact it depends on, keeps working; `run-copy.ts:331`'s collapse of `0` and `null` stops masking it.
  - `droppedShared`'s docblock (`:294-296`) matches the cumulative predicate (`:2476-2479`) that `packages/credits/tests/generate.test.ts:929-930` already exercises (path corrected 2026-09-21; there is no `respin/tests/generate.test.ts`).
  - `replayed: true`'s documented implication (`:272-274`) matches `:1022`'s unwind case.
- **P4-R6 (D12, MEDIUM).** `spinReferenceForProfile`'s four refusal sites (`trends-storage.ts:1018,1026,1033,1036` — the register's `:1012,1023` were the query starts, not the throws) throw the typed error its immediate neighbour on the same path already throws (`generate.ts:1036-1043`), so the similarity-gated mode's pre-vendor refusals reach the creator as themselves rather than as "Something went wrong".
- **P4-R7 (D12's LOW half).** `generate.ts`'s ORDER block names step 2 as a denylist where `inference.ts:575` is an allowlist; the numbered list omits the similarity-gated reference resolution although it is the only step with its own refusal code; `CANDIDATE_VERSION = 3` (`:1740`) is documented by a block explaining the move to 2; four docblocks are orphaned onto the wrong symbols (`:1742`, `:1964`, `:2007`, `:2367`). Each is corrected against the file **in the same action that records it**.

### 2026-10-05 register additions

Homed here from `docs/progress/audit/2026-10-05.md`. Every `file:line` below was re-read on 2026-10-05.

**Amendments to the requirements above (lines moved through L0–L4):**
- **P4-R1** is register item 24, re-confirmed. Migrations `0048`/`0049` still add INSERT-time triggers only, and the registry-driven UPDATE is still the pseudonymiser's.
- **P4-R3** is item 42's unscoped-read sub-item. The ledger reads keyed on `autoTopupAttemptId` alone are now at `auto-topup.ts:643,888`, `webhooks.ts:2432`, `auto-topup-v1-reconcile.ts:173,219,245,276,706` and `auto-topup-rollout.ts:329`. All are within a line or two of the cites above.
- **P4-R5** is item 41's `frameworkOffer` sub-item: `GenerateResult.frameworkOffer` at `generate.ts:355`, set at `:1253`, and the zero-cost path at `:1360`.
- **P4-R6** is item 41's spin-reference sub-item. The four throws are now at `trends-storage.ts:1030,1038,1045,1048`.
- **P4-R7** takes item 45's `generate.ts` tails as well:
  - `CANDIDATE_VERSION` is now **6** (`:2135`), so the stale block is re-read against that value;
  - `refusalCodeFor`'s "named by `name` … not a dependency this module may narrow against" (`:1993-1997`) sits under an `instanceof` branch at `:1990`;
  - the dead "CLAUDE.md's 2026-08-29 lesson" citation (`:788-789`: no such lesson exists in CLAUDE.md's Lessons);
  - the two `as RespinConfigV1` casts against the file's own doctrine: `:595` (the quoted config version read through `configVersionContents`) and `:1712`. `grep -n "as RespinConfigV1" generate.ts` on 2026-10-05 finds exactly these two.

  Each is corrected against the file in the same edit. The register's step-numbering mismatch and "replay tier at `view.asOf`" are re-located by the build, because this addendum did not pin their lines.

**New requirements:**
- **P4-A1 (item 20 — MEDIUM; REQ-G08). Pause is not checked at mint. The population is every mint producer**, measured 2026-10-05 with `grep -rn "grantCredits(\|purchasePackCredits(\|adjustCredits(\|refundCredits(\|mintFreeAllowanceIfDue(" packages/credits/src app worker scripts`:
  - `webhooks.ts:1271`: a pack checkout. The handler `:1160-1282` has no pause check.
  - `webhooks.ts:2168`: the invoice allowance.
  - `webhooks.ts:2399`, `:2452` and `:2494`: the auto-top-up `payment_intent.succeeded` mints.
  - `balance.ts:70`: the Free mint, already pause-gated at `:263-264`.
  - `pasted-reference.ts:508`: a refund. That is a return of the creator's own debit, not a new grant, so it is recorded and exempt.

  Checkout **creation** already refuses during a pause (`stripe/actions.ts:972-973`, `:1004-1005`). The open path is a payment that settles **after** a pause began.

  **Fix:** one predicate, `pauseAtMint(tx, workspaceId)`, reads both pause truths and is called by every listed grant producer. A payment Stripe has settled during a pause is **minted, never dropped** — REQ-G08: credits frozen, not lost — and its lot's expiry starts at the pause's end. A source scan asserts each listed producer calls the predicate and that the list equals the grep, two-way. Proof: AC11.
- **P4-A2 (item 21 — MEDIUM). A checkout's partial bind can repoint a live mirror to a different subscription.** The plain bind path (`webhooks.ts:1407-1415`) lacks the refusal its sibling enforces at `:1448-1457`: `hasLiveStripeSubscription(mirror) && mirror.stripeSubscriptionId !== sub.id` throws. That turns the loud duplicate refusal into silent acceptance, and the orphaned subscription's renewals become `ignored` 200s. **Fix:** the same guard on the plain path, through one helper both sites call. Proof: AC12.
- **P4-A3 (item 23 — MEDIUM; Stripe's anchor-day return is `[UNVERIFIED]` in the register). Grant expiry can land before the next period end.** The expiry is `addMonthsUtc(servicePeriodEnd, 1)` (`webhooks.ts:2174`). `months.ts` clamps to the target month's last day (`:6-13`). So a 29th–31st anchor whose period ended on a short month's last day gets an expiry 1–3 days before the next period end. **Fix:** the expiry steps from the subscription's **anchor day** (`billing_cycle_anchor`), not from the clamped period end, so the result never precedes the next period end at any anchor. Tests cover anchors 28–31 across February and 30-day months. The live confirmation of Stripe's anchor behaviour is a deferral row in the master (trigger: the money track unparks). Proof: AC13.
- **P4-A4 (item 41's tracked-niche sub-item — MEDIUM). Six tracked-niche refusals throw bare `Error`, which renders "Something went wrong".** Measured 2026-10-05 with `grep -n 'throw new Error("tracked niche' packages/db/src/trends-storage.ts`, which finds six sites in two functions. The register's evidence named only the first four.
  - `trackNicheForProfile` (`:793`): `:798` ("entitlement is invalid"), `:801` (blank), `:802` (over 80 characters), `:824` ("entitlement exhausted").
  - `untrackNicheForProfile` (`:854`): `:860` ("id is required") and `:877` ("not accessible to this profile").
  The `:813` pause refusal is already typed. **Fix:** typed errors on the P4-R6 pattern for all six, each mapped by `billingErrorCode` and given copy. `:877` keeps the foreign-or-absent indistinguishability the export route uses. The grep is pinned as the population, two-way, in row 32. Proof: AC14.
- **P4-A5 (item 41's `reviseSaved` sub-item — MEDIUM). `reviseSaved` does not enforce the block it computes.** `revisionBlockOf` (`packages/credits/src/saved-generation.ts:645`) feeds the view's `revisable`/`blocked` (`:705-706`), but `reviseSaved` (`:794`) never consults it. **Fix:** `reviseSaved` refuses with the same block code before any claim or spend. A test drives each block kind to the action and asserts no claim row. Proof: AC15.
- **P4-A6 (item 42's remaining money LOWs).**
  - **`refType` is a free string**, so it can squat mint keys: `GrantParams.refType: string` (`ledger.ts:64`). Fix: a closed union of the literals the callers pass.
  - **The refund count includes refunds the balance never sees.** `creditsReturned` adds the full amount (`pasted-reference.ts:515`), including refunds born already expired. Fix: count only the portion the fold sees, and say so on screen.
  - **A dead branch.** The auto-top-up disable-clear branch (`stripe/actions.ts:1360-1364`, `autoTopupAttemptDispatchedAt === null`) is unreachable, because `auto-topup.ts:593` stamps `dispatchedAt` at reservation. Fix: delete the branch, or move the stamp to real dispatch; the build chooses by reading which one `auto-topup.ts:143`'s reconcile relies on.

  `maybeAutoTopup`'s recursion and the reconciliation metric are P3-R7. Proof: AC16.
- **P4-A7 (item 45's `webhooks.ts` tails — LOW).** Fix each against the file:
  - the `ACTIVE_STATUSES` comment (`:111-112`) describes removed behaviour;
  - log lines interpolate payload enums (`:1168-1170`, `:1524-1526`) beyond what the file's own logging rule claims;
  - "see subscriptionLineOf" (`:1862`) names no symbol in the tree (grep 2026-10-05: one hit, the comment itself);
  - **item 45's monthly-band branch:** the `invoice.paid` guard at `:2108-2114` throws when the service period falls outside `monthlyPeriodDays`, and its message names a remedy. The build proves the branch reachable with a test, by planting a line whose period is outside the band, and makes the message's remedy the one an operator can act on. If no input the handler admits can reach the branch, it is deleted with the reason recorded. Either way the card records which.

  Proof: AC17.
- **P4-A8 (item 47's sign-up-farming sub-item — LOW; owner-delegated decision R-162; rewritten after the addendum's plan review). An unverified email receives Free credits.**
  - **The defect.** `create-auth.ts` sets no `requireEmailVerification`; only `sendVerificationEmail` exists (`:453`). `mintFreeAllowanceIfDue` (`balance.ts:233`) mints for any Free workspace.
  - **The decision (R-162).** The Free monthly mint requires the workspace owner's verified email (`emailVerified`; Google sign-ins arrive verified), and joins P4-A1's producer list.
  - **The consequence the first draft missed.** With the mint withheld, an unverified creator's first paid press meets a short balance. Today that renders as "insufficient credits" — false, and with no way forward. First Ideas, for example, spends `ideationBatch` = 3 credits (`packages/db/src/seed.ts:48`; `app/(product)/onboarding/first-ideas/actions.ts:66`).
  - **The producers of the short-balance refusal** (measured with `grep -rn "new InsufficientCreditsError" packages/credits/src`): the three **pre-call** gates are `generate.ts:730`, `inference.ts:740` and `pasted-reference.ts:295`. `ledger.ts:199,418` are in-lock and post-call, and become `PostCallDebitError`.
  - **The surfaces where a Free balance is first spent** (measured with `grep -rnE "respinCredits\.(generate|inferVoice|findConcept|commissionPiece|reviseSaved|submitPastedReference)\(" app`): **eight** —
    - `onboarding/actions.ts:289` (`inferVoice`);
    - `onboarding/first-ideas/actions.ts:66`;
    - `studio/actions.ts:140,261,390`;
    - `studio/saved/actions.ts:102`;
    - `trends/actions.ts:178,261`.
  - **Fix.**
    - Each of the three pre-call gates, when short **and** the workspace's Free mint is being withheld for verification, throws a typed `EmailVerificationRequiredError` instead of `InsufficientCreditsError`. The check is one predicate beside the mint gate, `freeAllowanceWithheldForVerification`.
    - The error is re-exported as a value from the `@respin/credits/app-server` facade, with its own `billingErrorCode`. The copy says what to do: verify your email, with a resend link that posts to `/send-verification-email` (rate-limited by P1-R9). It says the credits arrive on verification.
    - All eight surfaces render it, and `/usage` names it. The per-screen refusal-code lists that admit `insufficient_credits`, measured with `grep -rn '"insufficient_credits"' app --include=*.ts --include=*.tsx`, are two besides the master `BILLING_ERROR_CODES` (`billing-errors.ts:246`): `ONBOARDING_ERROR_CODES` (`app/(product)/onboarding/copy.ts:128`, entry at `:170`) and `STUDIO_ERROR_CODES` (`app/(product)/studio/copy.ts:148`, entry at `:171`). Each gains `email_verification_required`. A third list that admits `insufficient_credits` without the new code is red in row 36.
  - Proof: AC18.
- **P4-A9 (item 48's trend-feed sub-item — LOW). The scoped trend feed is unbounded, with N+1 reads** (`trends-storage.ts:895-951`). **Fix:** a page limit and one grouped read for the per-item joins, the P4-R4 shape. The query count is asserted for a 50-item feed. Proof: AC19.

## Tasks

| Task | Work | File rows |
|---|---|---|
| 1 | Migration `0063`: refuse UPDATE/DELETE on `credit_ledger` with the single column-scoped exemption; extend the source scan to mutation; rewrite the two mutating tests | 1–7 |
| 2 | Derive the mirror-writer population; disposition at the line for all five unlocked writers (two rollout exemptions, the insert-if-absent exemption, the pseudonymiser port's exemption, the disarm write locked); express the fence precondition as a check | 6, 8–12, 23–25 (row 6 shared with Task 1: the port's `credit_ledger` and `subscriptions` writes are one statement) |
| 3 | Scope every request-path ledger read; annotate the intended sweeps | 13–15 |
| 4 | `reconcileSpend` as one grouped statement; assert the query count | 16–17 |
| 5 | The three `generate.ts` contracts and their consumer; the four typed refusals; the ORDER-block and docblock corrections | 18–22 |
| 6 | 2026-10-05 additions: pause at every mint (A1); the bind guard (A2); anchor-day expiry (A3); typed niche refusals (A4); `reviseSaved` enforcement (A5); the money LOWs (A6); the `webhooks.ts` tails (A7); the verified-email Free mint (A8); the bounded feed (A9) | 14, 18–19, 21, 22, 26–37 |

## Files to create / modify

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `packages/db/migrations/0063_*.sql` | N | UPDATE/DELETE refusal + the column-scoped exemption |
| 2 | `packages/db/migrations/meta/_journal.json` | M | Journal entry |
| 3 | `packages/credits/tests/ledger.test.ts` | M | Scan both shapes — builder `.update(`/`.delete(` and raw `UPDATE\s+"?credit_ledger` / `DELETE\s+FROM\s+"?credit_ledger` / `relation(...)`-rendered writes — with the two-member exemption list (`lifecycle-sql-port.ts`, `lifecycle-migration.test.ts`); `as unknown as` runtime probe; a planted raw-SQL specimen (AC2) |
| 4 | `packages/db/tests/db.test.ts` | M | `:518` sets up through inserts |
| 5 | `packages/db/tests/brain-schema.test.ts` | M | `:780` sets up through inserts |
| 6 | `packages/db/src/lifecycle-sql-port.ts` | M | The pseudonymiser write (`:566-570`) matches the exemption exactly — `workspace_id` alone in the SET list for `credit_ledger`; **and** its `subscriptions` disposition at the line (P4-R2's twelfth writer: `relation(`-rendered, under `lockWorkspaceMembershipGraph`, no `takeWorkspaceLock` reachable from `packages/db` — exempt, with the registry-routing and column-set witnesses) |
| 7 | `packages/db/tests/ledger-mutation-guard.docker.test.ts` | N | The exemption is exercised on live Postgres and nothing wider passes — new, because no existing Docker suite touches the pseudonymiser's `credit_ledger` write (`deletion-executor.docker.test.ts` never names the table; there is no `lifecycle-port.docker.test.ts`); also reads the exempt column name out of `0063`'s SQL and asserts it equals `SPLIT_TABLE_FIELD_SETS.credit_ledger[0].columns` |
| 8 | `packages/credits/tests/actions.test.ts` | M | Derived mirror-writer population (`:2428-2440` today reads `actions.ts` alone): the three-shape predicate plus the alias pass from P4-R2, over `sourceFilesUnder(PRODUCTION_ROOTS)` minus the `tests/` segment via `tests/support/source-files.ts`; the twelve-module list asserted equal to the scan; the disposition list as the second input; the retention-receiver spec-list pin; the AC3 plants — a deleted known writer, and a new unlocked writer in each of the five spellings (namespaced `schema.subscriptions` first, bare, aliased, raw SQL, `relation(`-rendered) |
| 9 | `packages/credits/src/stripe/tier-checkout-rollout.ts` | M | Exemption stated at `:172-187` (table lock at `:203-205` subsumes the advisory lock); fence precondition as a check |
| 10 | `packages/credits/src/stripe/auto-topup-rollout.ts` | M | Exemption stated at `:207` and `:511` (table lock at `:191`/`:253`/`:475`); scoped reads |
| 11 | `packages/credits/tests/tier-checkout-rollout.test.ts` | M | Pin the lock/exemption and the fence check |
| 12 | `packages/credits/tests/auto-topup-rollout.test.ts` | M | Pin the lock/exemption and the scoped reads (there is no single `rollout.test.ts`; each rollout has its own) |
| 13 | `packages/credits/src/stripe/auto-topup.ts` | M | `workspaceId` predicates |
| 14 | `packages/credits/src/stripe/webhooks.ts` | M | `workspaceId` predicate at `:2431` |
| 15 | `packages/credits/src/stripe/auto-topup-v1-reconcile.ts` | M | `workspaceId` predicates; sweeps annotated |
| 16 | `packages/db/src/spend-rollup.ts` | M | One grouped statement |
| 17 | `packages/db/tests/spend-rollup.test.ts` | M | Assert the query count does not scale with rows |
| 18 | `packages/credits/src/generate.ts` | M | The three contracts; ORDER block; orphaned docblocks |
| 19 | `app/(product)/studio/projection.ts` | M | Consumer of the `frameworkOffer` invariant |
| 20 | `app/(product)/studio/run-copy.ts` | M | Stop collapsing `0` and `null` |
| 21 | `packages/db/src/trends-storage.ts` | M | Four typed refusals (`:1018,1026,1033,1036` today) |
| 22 | `app/(product)/billing-errors.ts` | M | Map them — this is where `GenerationAssemblyError` is already mapped (`:671`); there is no `packages/credits/src/billing-errors.ts` |
| 23 | `packages/credits/src/stripe/customers.ts` | M | Exemption stated at `:105-130`: insert-if-absent, the unique constraint serialises |
| 24 | `packages/credits/src/stripe/deletion-commands.ts` | M | `auto_topup_disable`'s mirror write (`:191-194`) takes `takeWorkspaceLock` in its own transaction; lock order stated |
| 25 | `packages/credits/tests/deletion-commands.test.ts` | M | The disarm write holds the lock (a stub `takeWorkspaceLock` that records it was called before the write) |
| 26 | `packages/credits/src/pause.ts`, `packages/credits/src/balance.ts` | M | P4-A1: `pauseAtMint` beside `hasOpenPause`, and the lot's expiry starting at the pause's end; P4-A8: the verified-email gate in `mintFreeAllowanceIfDue` (`balance.ts:233`). One row: the predicate and its two in-package consumers. **The additions' `webhooks.ts` work rides row 14:** P4-A1 at `:1271`, `:2168`, `:2399`, `:2452` and `:2494`; P4-A2 at `:1407-1415`; P4-A3 at `:2174`; P4-A7's tails. **The `trends-storage.ts` work rides row 21:** P4-A4 and P4-A9. **The `billing-errors.ts` copy rides row 22:** P4-A4 and P4-A8 |
| 27 | `packages/credits/src/months.ts` | M | P4-A3: the anchor-preserving month step beside `addMonthsUtc` |
| 28 | `packages/credits/tests/stripe.test.ts` | M | P4-A1: each listed producer under an open pause mints with frozen expiry; P4-A2: a plain-path bind onto a mirror with a different live subscription throws; P4-A3: anchors 28–31 never expire before the next period end |
| 29 | `packages/credits/tests/mint-producers.test.ts` | N | P4-A1: the producer list equals the grep two-way, and each listed producer calls `pauseAtMint`; a planted sixth producer is red |
| 30 | `packages/credits/src/saved-generation.ts`, `packages/credits/tests/saved-generation.test.ts` | M | P4-A5: `reviseSaved` (`:794`) refuses on `revisionBlockOf` (`:645`) before any claim; the test drives each block kind. One row: the action and its test |
| 31 | `packages/credits/src/ledger.ts`, `packages/credits/src/pasted-reference.ts`, `packages/credits/src/stripe/actions.ts` | M | P4-A6: the closed `refType` union (`ledger.ts:64`); the fold-visible `creditsReturned` (`pasted-reference.ts:515`); the dead disable branch (`actions.ts:1360-1364`). One row: three one-site LOW fixes |
| 32 | `packages/db/tests/trends-storage.test.ts` | M | P4-A4 and P4-A9: each of the six typed refusals is asserted by class, and the six-site grep is pinned two-way; a 50-item feed runs a bounded query count |
| 33 | `packages/credits/src/inference.ts` | M | P4-A8: the `inference.ts:740` pre-call gate throws `EmailVerificationRequiredError` when the mint is withheld (`generate.ts:730` is row 18, `pasted-reference.ts:295` is row 31) |
| 34 | `packages/credits/src/errors.ts`, `packages/credits/src/app-server.ts` | M | P4-A8: `EmailVerificationRequiredError`, re-exported as a value by the facade so `billing-errors.ts` (row 22) can `instanceof` it. One row: the class and its one route to `app/**` |
| 35 | `packages/credits/tests/email-verification-gate.test.ts` | N | P4-A8: the three pre-call gates each refuse with the typed error while the mint is withheld, and pass once it lands |
| 36 | `tests/onboarding-verify-email.test.tsx` | N | P4-A8: AC18's onboarding walk; the eight-surface code mapping; every per-screen list carrying `insufficient_credits` also carries `email_verification_required` (the grep, two-way) |
| 37 | `app/(product)/onboarding/copy.ts`, `app/(product)/studio/copy.ts` | M | P4-A8: `email_verification_required` added to `ONBOARDING_ERROR_CODES` (`:128`, beside `:170`) and `STUDIO_ERROR_CODES` (`:148`, beside `:171`), with each screen's copy. One row: the two measured lists |

**2026-10-05 addendum: 37 rows (25 + 12), above the 25-row target; the overage is accepted under the owner's 2026-10-05 delegation (master Plan review log).** Every new row is a file the nine additions edit. Rows 14, 18–19, 21 and 22 carry addendum work on files already listed. The §11 signal is recorded in the master.

**25 rows; at the target.** Three rows added on the batch-0 billing gate's writer census (the two unlocked writers the plan missed and the test that pins the one that gains a lock). The task→row ranges above are derived from the table.

## Edge cases and external failures

| Condition | Handling | Requirement |
|---|---|---|
| The exemption is written as "allow UPDATE when a session flag is set" | Refused. The exemption is column-scoped — `workspace_id` may change and nothing else — because a guard a caller can switch off is not a guard | P4-R1 |
| A legitimate future correction needs a ledger row changed | It does not get one: the ledger is append-only, so a correction is a compensating row. The migration comment says this, so the next engineer meets the answer rather than the wall | P4-R1 |
| Locking the rollout writers deadlocks against an existing lock family | G-17 (lock ordering) is open and eight families already nest; the rollout writers take no advisory lock (their table lock subsumes it); the one writer that gains a lock (`deletion-commands.ts`) states its order relative to `lockWorkspaceMembershipGraph` at the line, matching `webhooks.ts:1017-1018` | P4-R2 |
| The R-122 seven-year receiver is enabled later and its DELETE meets the new guard | The migration comment at the guard says so and names the re-decision; enabling the receiver is a decision, not a drift, and the guard reddens the receiver's first run rather than silently deleting | P4-R1 |
| A ledger read genuinely is a global sweep | It keeps no predicate and gains a comment naming why, which is the difference between a decision and an omission | P4-R3 |
| The grouped `reconcileSpend` statement changes a displayed number | Any change is a defect found, not a regression introduced — the card records the before/after on the same fixture | P4-R4 |
| Making `frameworkOffer` null breaks a consumer that reads `.dropped` | `projection.ts` is the known consumer and is in this phase's file list; a second consumer found during the work is added to the list, not worked around | P4-R5 |

## Verification and acceptance

| # | Criterion | Evidence |
|---|---|---|
| AC1 | `UPDATE credit_ledger SET amount = …` and `DELETE FROM credit_ledger` are both refused by the database on a live Postgres, and the pseudonymiser's `workspace_id` assignment still succeeds | card quotes the three statements and their outcomes |
| AC2 | A `.update(creditLedger)` planted anywhere under the production roots turns the scan red; a planted raw `` sql`UPDATE credit_ledger SET amount = 0` `` and a planted `` sql`DELETE FROM ${relation("public","credit_ledger")}` `` each turn it red too; smuggling a mutation through `as unknown as` still hits the database refusal | card quotes all four probes |
| AC3 | The derivation over `sourceFilesUnder(PRODUCTION_ROOTS)` minus the `tests/` segment reproduces exactly the **twelve** measured writer modules (the eleven in `packages/credits/src` and `packages/db/src/lifecycle-sql-port.ts`; the list is pinned, rule 7); deleting a module from the population turns the derived assertion red; **a new file under production roots with an unlocked write and no exemption turns it red in each spelling — the namespaced `.update(schema.subscriptions)`, the bare `.update(subscriptions)`, an aliased `.update(subs)`, a raw `` sql`UPDATE subscriptions … ` `` and a `relation(`-rendered `` sql`UPDATE ${relation("public", "subscriptions")} … ` ``**; a planted `subscriptions` spec in `retention-clocks.ts` is red; all five unlocked writers carry their disposition at the line, and `deletion-commands.ts`'s disarm write is observed holding the lock | card quotes the derivation's twelve, the deletion plant, the five spelling plants, the spec plant and the five disposition lines |
| AC4 | Every request-path `credit_ledger` read either carries `workspaceId` or a comment declaring a sweep — asserted by a scan, not by inspection | card quotes the scan |
| AC5 | `reconcileSpend`'s query count is constant in the number of rollup rows (measured at 1 row and at 200) | card quotes both counts |
| AC6 | For a `caption` run, `frameworkOffer` is `null`, not zeroes; `droppedShared`'s docblock matches the predicate the existing test exercises; `replayed: true` implies what it documents | card quotes all three |
| AC7 | Each of `spinReferenceForProfile`'s four refusals reaches the creator as its own message, not as the generic fallback | card quotes the four |
| AC8 | `pnpm -C respin db:check` clean; entry gate clean; `TEST_DATABASE_URL=… pnpm -C respin test` green with the Docker concurrency suites live | card quotes all three |
| AC9 | The migration's trigger exempts exactly `SPLIT_TABLE_FIELD_SETS.credit_ledger[0].columns` — the Docker suite reads the column name from `0063`'s SQL and asserts equality; a planted second column in the trigger's exemption turns it red | card quotes the assertion and the plant |
| AC10 | `generate.ts`'s ORDER block names step 2 as an allowlist, lists the similarity-gated reference resolution, `CANDIDATE_VERSION = 3`'s block explains 3, and the four docblocks sit on the symbols they describe — each asserted by re-reading the file after the edit, quoted in the card | card quotes the five diffs |
| AC11 | Each listed mint producer, driven under an open pause, mints a lot whose expiry starts at the pause's end. `mint-producers.test.ts` reddens on a planted sixth producer and on a listed producer that stops calling `pauseAtMint` | card quotes the five producer runs and both plants |
| AC12 | A plain-path `checkout.session.completed` naming a different subscription while the mirror holds a live one throws, as the sibling path does. Red today | card quotes the throw |
| AC13 | Anchors 28, 29, 30 and 31 across a February and a 30-day month: every grant's expiry is at or after the next period end | card quotes the eight expiries |
| AC14 | Each of the six tracked-niche refusals reaches its own `billingErrorCode`, never `unknown`. A planted seventh bare `throw new Error("tracked niche` is red | card quotes the four codes |
| AC15 | `reviseSaved` against each `revisionBlockOf` kind refuses with that code, and no `generation_attempts` row is written | card quotes the refusals |
| AC16 | A planted unknown `refType` is a type error. A refund over a born-expired lot reports only the fold-visible credits. The disable-clear branch is gone, or reachable with a test that reaches it | card quotes the three |
| AC17 | The three `webhooks.ts` tails are re-read against the file after the edit, quoted in the card | card quotes the diffs |
| AC18 | **The onboarding walk, unverified.** An email sign-up that has not verified completes the interview and inference, then presses First Ideas. It gets `EmailVerificationRequiredError`, rendered as the verify copy with the resend control, and **not** insufficient-credits copy. After verification the mint lands once and the same press succeeds. Each of the other seven surfaces maps the error to the same code, never to insufficient credits. A verified or Google identity is unchanged | card quotes the walk's three screens and the eight-surface mapping |
| AC19 | A 50-item scoped feed runs a bounded number of queries, asserted, and is paged | card quotes the count |

### Requirement → AC mapping

Every requirement has an AC (tabulated 2026-09-21). AC8 is the entry gate and maps to no single requirement.

| Requirement | AC(s) |
|---|---|
| P4-R1 | AC1, AC2, AC9 |
| P4-R2 | AC3 |
| P4-R3 | AC4 |
| P4-R4 | AC5 |
| P4-R5 | AC6 |
| P4-R6 | AC7 |
| P4-R7 | AC10 (added — it had none) |
| P4-A1 | AC11 |
| P4-A2 | AC12 |
| P4-A3 | AC13 |
| P4-A4 | AC14 |
| P4-A5 | AC15 |
| P4-A6 | AC16 |
| P4-A7 | AC17 |
| P4-A8 | AC18 |
| P4-A9 | AC19 |

## Definition of done

Every AC passes; both full gates report PASS; report card **Ready**; one card, one ledger line. No decision entry is owed by this phase — it enforces invariants already decided, and says so in the card.

## Reachability

A creator whose Spin reference is inaccessible or unready reads that refusal by name on `/trends` instead of "Something went wrong" (callers: `trends-storage.ts` row 21 → `app/(product)/billing-errors.ts` row 22, on the existing `analyseAndSpin` action); an admin opening `/admin/model-spend` gets `reconcileSpend` as one grouped statement (row 16, called from `app/(admin)/admin/model-spend/page.tsx`); every request-path ledger read a creator triggers via auto-top-up or a Stripe webhook is workspace-scoped (rows 13–15). The database-level append-only guard lands with migration `0063` (row 1), applied by `pnpm -C respin db:migrate`.

## Least confident

Whether the column-scoped UPDATE exemption in one trigger (`(to_jsonb(OLD) - 'workspace_id') IS DISTINCT FROM (to_jsonb(NEW) - 'workspace_id')`) stays honest as a second place that knows the erasure schema. The pin is the answer: AC9 asserts the trigger's exempt set equals `SPLIT_TABLE_FIELD_SETS.credit_ledger[0].columns` read from the migration SQL, so the second place cannot drift from the first. **There is no viable fallback on a balance-derived ledger** — the earlier draft's "insert a replacement row and delete nothing" was struck by the plan gate: a replacement row with a new `workspace_id` either double-counts (the original stays live in the fold) or needs the DELETE the exemption exists to avoid. If the single trigger cannot be written, the phase stops and records why rather than substituting a mechanism that breaks the fold.

## Out of scope

The workspace lock held across provider HTTP calls, and the render path's contention on it — Phase 8. Anything about how the balance is folded: the fold is the strongest code in the repo and nothing here touches it.
