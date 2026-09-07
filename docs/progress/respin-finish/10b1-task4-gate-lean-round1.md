# Phase 10b-1 Task 4 — lean consolidated reviewer gate, round 1 (2026-09-07)

**This was a LEAN CONSOLIDATED run** (`Gate intensity: lean` in CLAUDE.md): one read-only
reviewer pass rendering three separate verdicts — Respin spin compliance, Respin learning
honesty, and the general code/security/state-machine review. Each keeps its own checklist and
its own verdict; the merged run does not carry each reviewer's `effort: max`, and the advisory
simplification pass is skipped. The two `Full gates? = yes` paths (billing, tenancy) ran as
their own separate reviewers and are not covered here. No file was edited.

Tree reviewed: the frozen surface named in `10b1-task4-review-manifest.md`, working tree at
`cc3ed43` + uncommitted Phase-10 work, read 2026-09-07.

---

## Probe of the author's least-confident line (done first)

> "The generic SQL port's per-column scrub rules … were driven to green on the populated
> fixture; a table the fixture does not populate could still carry a column shape the rules
> refuse, which would surface as `lifecycle_executor_refused:cannot_pseudonymise`."

**Probed by enumerating every `pseudonymise` entry in `LIFECYCLE_REGISTRY` and resolving each
one's columns against the Drizzle schema.** The complete population is: `auth_mail_outbox`
(`auth_user_id`, `recipient_digest`), `deletion_operations` (`linkable_identifiers`,
`requester_identity`), `deletion_operation_transitions` (same two), `deletion_membership_snapshots`
(`linkable_identifiers`), `deletion_external_commands` (`linkable_identifiers`), `stripe_events`
(`linkable_source_ids`, `provider_financial_authority`), `workspace_spend_monthly`
(special-cased), `system_model_usage`, `system_model_usage_reconciliations`, `system_spend_claims`
(link-id columns only).

Every one of those columns resolves to a rule in `scrubAssignments`
(`packages/db/src/lifecycle-sql-port.ts:359-453`):

- link columns → `LINK_COLUMNS` null-or-repoint (`:375-399`);
- `target_key` → the CASE rewrite (`:401-413`); `payload_hash` → the per-operation replacement (`:415-419`);
- `uuid` → NULL or `md5(random()…)::uuid` (`:420-426`) — and the three NOT NULL uuid cases
  (`deletion_membership_snapshots.membership_id`, `system_spend_claims.trend_item_id`,
  `…autopsy_cache_claim_id`) carry **no** foreign key, so a random uuid does not violate one;
- `text` → digest-shaped or `'pseudonymised:'||md5` (`:428-444`), which satisfies the two
  CHECKs that demand presence (`stripe_events_receipt_attribution_shape`,
  `deletion_operations_recovery_delivery_shape`) via `TOKEN_REPLACEMENT` / `KEEP_DIGEST_SHAPE`;
- `stripe_events.tier_invoice_authority` is `jsonb` **nullable** (`billing-schema.ts:864`), so it
  takes the nullable fallback (`:446-448`), not the refusal.

**Result: `cannot_pseudonymise` cannot fire on the current registry, for any fixture population.**
The declared risk does not exist today. What *does* exist is the absence of any guard keeping
that true — see code-review finding **C3**. Two adjacent things the probe surfaced instead are
the compliance findings **S1** and **S2** below.

---
---

# 1. Respin spin compliance — report

## Readiness headline

**Almost.** The compliance surface this task touches is narrow and disciplined — one new
outbound origin, content-free mail and logs, no automation, correct shared/private survival.
Two erasure-completeness gaps stop it short: a raw Stripe webhook payload containing the erased
subject's email survives a `complete` erasure by design, and the one JSON column carrying
declared identifier paths is cleared by code no test exercises and no probe can see.

## Findings

### ❌ / ⚠️ CHANGE — S1. A completed erasure leaves a raw Stripe payload holding the subject's email, and the independent probe reports zero residue

`respin/packages/db/src/creator-data-registry.ts:327` classifies `stripe_events.payload` as
`delete_explicit` on a **partial** field set with a 90-day receiver clock. In the executor,
a partial `delete_explicit` set is skipped outright:

- `respin/packages/db/src/lifecycle-sql-port.ts:477-486` — `wholeRow` is false, so the branch
  pushes `skipped: receiver_clock:stripe_payload_90_days` and issues no statement;
- `respin/packages/db/src/lifecycle-sql-port.ts:648-651` — the independent probe returns `0`
  for exactly the same class.

The task's own fixture makes the consequence concrete:
`respin/packages/db/tests/deletion-executor.test.ts:295` inserts
`payload: { customer: "cus_owner", email: "owner@example.test" }`, and the workspace-erasure
assertions (`:423-427`) check `workspace_id`, `stripe_customer_id` and `receipt_attribution` —
**never the payload**. So a workspace erasure reaches `state = 'complete'` with `residue = 0`
while that email address is still in the table, for up to 90 days from receipt.

Plan `10b-1` §C3 says of retained financial/audit rows: *"no email, name, address, prompt,
completion, brain/reference text, **raw webhook payload**, IP, or free-form admin note
survives"*, and §C4 says *"At day 7 live data is gone"*. The registry decision (payload → C5's
90-day receiver, Task 6) is defensible and is stated in `10b1-task4-contract.md` line 35 in the
abstract — but nowhere does the contract, the runbook, or the completion receipt say that an
erasure marked `complete` can still hold the deleted subject's personal data. That is the
sentence a legal or operator reader needs.

**Required before `RESPIN_DELETION_ERASURE_SCOPES` is ever set** (either is acceptable):
scrub `stripe_events.payload` inside the subject-erasure transaction for the operation's own
event ids, *or* append a decision that supersedes C3's sentence for this field set and state the
residual explicitly in the contract, the runbook and the deletion copy. Add the missing
assertion either way.

### ⚠️ CHANGE — S2. `tier_invoice_authority`'s identifier paths are cleared by untested code that the independent probe is structurally blind to

`creator-data-registry.ts:329` pseudonymises `stripe_events.tier_invoice_authority` and declares
seven governed JSON paths including `respin_tier_workspace_id` and `respin_tier_customer_id`
(also classified `identifier_paths` at `:569`). The executor clears it by nulling the whole
column (`lifecycle-sql-port.ts:446-448`, jsonb nullable) — correct, and safe from the
target-ordering hazard because this row class's predicate is the *pre-captured event-id snapshot*
plus the never-scrubbed `receipt_attribution` discriminator (`lifecycle-executors.ts:342-350`),
not `workspace_id`.

But the promise that executor and probe derive independently
(`lifecycle-sql-port.ts:6-8`, `:558-561`) does not hold here. `countResidual` for this entry runs
the `stripe_events` + workspace-subject branch (`:657-659`): `… WHERE <snapshot ids> AND
workspace_id = <ws>`. The **other** target already nulled `workspace_id`, so this returns `0`
whether or not the JSON was cleared. And no test populates `tier_invoice_authority` at all
(`deletion-executor.test.ts:292-296`).

Populate the column in the fixture, assert it is gone after each scope's walk, and give the
JSON-path field sets a probe that actually inspects the paths.

### ⚠️ CHANGE — S3. The mail-delivery refusal copy guesses in the direction everything else refuses to guess

`respin/app/(product)/billing-errors.ts:1039-1043`:

> "That email was not confirmed as sent — The mail provider did not confirm the message, **so it
> is not on its way.**"

`AuthMailDeliveryError` carries `status: "failed" | "unknown"` (`auth-mail.ts:399-404`) and both
map to this one copy. The `unknown` cases are precisely those the adapter classifies as *possibly
delivered* — 409 `concurrent_idempotent_requests`, any 5xx, timeout, DNS/TLS/socket
(`packages/auth/src/resend-mail.ts:57-70, 100-106`) — and the module docblock says so in terms
(`:10-14`). Every other surface in this diff refuses to convert indeterminate into definite; this
sentence does it. Split the copy, or say "we cannot confirm it was sent".

### 💡 NOTE — S4. Sources allowlist (S1 checklist): clean

No ingest adapter, autopsy, Spin or similarity-gate file is in the diff. Dependency diff adds
only `pg-boss@12.29.0`, `tsx`, `@playwright/test` and workspace links — no scraping dependency,
no Resend SDK (the adapter is raw `fetch`).

### 💡 NOTE — S5. Outbound HTTP surface: exactly one new origin, pinned

`packages/auth/src/resend-mail.ts:17` `RESEND_ORIGIN = "https://api.resend.com"` as a constant;
`redirect: "error"` and a 15 s `AbortController` (`:83-98`); nothing logged in the adapter — the
recipient address and action URL never leave the process except over TLS to that origin. Grepping
the whole in-scope surface for `fetch(` / `http` returns that one file. No auto-posting, no
engagement automation, no platform-account interaction (REQ-E08).

### 💡 NOTE — S6. Mail bodies and worker events are content-free

`renderAuthMail` (`auth-mail.ts:151-168`) emits purpose line + action URL + ISO expiry and
nothing else; asserted at `packages/auth/tests/auth-mail-wiring.test.ts:66, 75, 88`. Worker
events carry counts only (`worker/health.ts:204-237`, `worker/pg-boss-runtime.ts:400-407`).
Without a mail port, the dev console line is id-only outside development
(`create-auth.ts:300-305`), asserted at `auth-mail-wiring.test.ts:154-178`.

### 💡 NOTE — S7. Shared/private survival at erasure is correct and asserted

`captureSourceIdsInTx` collects only `rightsScope = 'profile_private'` rows
(`lifecycle-subjects.ts:117-144`), so no shared source id ever enters a scrub predicate;
`targetAppliesToOperation` (`:266-275`) excludes every `system`-subject target, which is what
`independently_licensed` rows compile to. Proven at `deletion-executor.test.ts:402-404`
(shared item and `"SHARED-TRANSCRIPT"` survive a workspace erasure) and `:421` (the shared
claim keeps its real `trend_item_id` while the private one does not). Private
trend/autopsy/claim/transcript rows cascade with the profile.

### 💡 NOTE — S8. Failure codes can embed a driver-supplied literal

`deletion-executor.ts:124-130` falls back to `cause.message` when no constraint name is present.
Most Postgres messages are content-free, but some embed the offending value (e.g. `invalid input
syntax for type uuid: "…"`), and this string is persisted to `deletion_operations.last_failure_code`
and surfaced to operators. Sanitising and truncating narrows it; preferring the
`sqlstate_<code>:<constraint>` branch and a fixed code otherwise would close it.

## Checks run

S1 sources allowlist ✅ · S2 similarity gate — not touched by this diff (no finding) ·
S3 minimum-difference — not touched · S4 kill-test honesty — not touched ·
S5 `[check]` placeholders — not touched · S6 no guarantees ⚠️ (S3 above) ·
S7 no automation / no concealment ✅ · S8 autopsy caching — not touched ·
plus the five live questions named in the gate brief: shared/private survival ✅,
outbound HTTP surface ✅, content-free logs and mail ✅, engagement automation ✅,
private autopsy/claim/trend rows erasing with their profile ✅.

## Coverage

Read in full: `lifecycle-sql-port.ts`, `lifecycle-executors.ts`, `lifecycle-subjects.ts`,
`deletion-external-commands.ts`, `auth-mail.ts`, `auth-mail-schema.ts`, `resend-mail.ts`,
`deletion-commands.ts`, `deletion-executor.ts`, `worker/deletion-lifecycle.ts`; read in part:
`creator-data-registry.ts`, `deletion-lifecycle.ts`, `lifecycle-schema.ts`, `billing-schema.ts`,
`create-auth.ts`, `billing-errors.ts`, `worker/health.ts`, `worker/pg-boss-runtime.ts`,
`worker/production.ts`, `eslint.config.mjs`, `env.example`, `README.md`,
`docs/runbooks/respin-worker-operations.md`, migrations 0050/0051/0052, and the tests named in
the manifest.

Commands run:

```
pnpm exec vitest run packages/db/tests/deletion-executor.test.ts \
  packages/db/tests/deletion-external-commands.test.ts packages/db/tests/auth-mail.test.ts
  → 3 files / 32 tests passed
grep -n "fetch(\|https://\|http://" <the eight in-scope source files>   → 2 hits, both resend-mail.ts
git diff HEAD -- package.json packages/*/package.json                   → no scraping dependency
```

## Verdict

**NEEDS CHANGES.** S1 and S2 must close (or be explicitly superseded and disclosed) before any
scope is added to `RESPIN_DELETION_ERASURE_SCOPES`; S3 is a copy fix.

## Grade

**B**

---
---

# 2. Respin learning honesty — report

## Readiness headline

**Almost.** The learning invariants this task could have damaged are intact and, where it
matters, proven by assertion rather than asserted by comment: the sole-emitter boundary is
untouched and still guarded, results/proposal/evidence rows erase with their profile, and
retained cost facts are tested to be un-relinkable. Every headline count in the manifest and
ledger re-derives from the recorded transcripts. Two outward-facing claims are imprecise, one of
them an operator instruction that names a code the system cannot write.

## Findings

### ⚠️ CHANGE — L1. The runbook tells operators to look for a failure code the executor cannot produce

`docs/runbooks/respin-worker-operations.md:79` lists `residue_detected:<n>` among the values
`deletion_operations.last_failure_code` holds. It cannot: on residue the erasure transaction
rolls back and `handleErasing` immediately calls `transitionDeletionOperation(…, "blocked", …)`,
which refuses `journal_plan_conflict` before anything records the residue code — see code-review
finding **C1**, which is the same defect. The recorded code will be the plan-conflict refusal.
An operability instruction that names a signal the system never emits is a false claim about the
system, and it is on the one page an operator reads at 2 a.m.

Fix C1, then re-verify this list against a run rather than against intent.

### ⚠️ CHANGE — L2. One ledger count compresses away the composition that is the proof

`docs/progress/respin-finish/ledger.md:2041` — "Live-Postgres quota witness: 80 concurrent
admissions → exactly the ceiling." The artefact names the test
"admits exactly the ceiling under **40 concurrent security sends and 40 concurrent invites**"
(`entry-gate-task4-docker.txt`). The sum is right; the split is the load-bearing part, because
it is what demonstrates the derived 20/day security reserve holds under contention rather than
just the 80/day total. Quote the composition.

### 💡 NOTE — L3. Sole emitter (checklist L1): intact and still guarded

No write path into `promotion_proposals` is added — the only files naming it are
`db/index.ts`, `creator-data-registry.ts`, `with-workspace.ts`, `promotion-ops.ts` and
`promotion-schema.ts`, all pre-existing. The guard is live and non-vacuous:
`respin/tests/feedback-readers.test.ts:92` pins `PROPOSAL_CONSTRUCTOR_PACKAGE = "packages/brain/"`
with a planted-prefix proof, and the Task-4 registry additions to that file
(`:75-81`, the SQL port) are a reasoned prose entry naming why the generic port is not a
product-path content reader — not a widened allowlist.

### 💡 NOTE — L4. Results, proposals and evidence erase with their profile and never survive as learning input

`results`, `promotion_proposals`, `proposal_evidence_results`, `proposal_evidence_feedback` and
`generation_feedback` are all `profile_row` → `cascade` → `profile_cascade`
(`creator-data-registry.ts`, the `profile()` helper at `:220-232`), so they go with the profile
and with the workspace, and identity erasure deliberately leaves them (they belong to work that
survives under the remaining owners). `targetAppliesToOperation` (`lifecycle-subjects.ts:270`)
makes that structural rather than incidental. Walked by the three populated scope tests.

### 💡 NOTE — L5. Retained system-spend cost facts are *tested* to be un-relinkable

`deletion-executor.test.ts:409-421` asserts, after a workspace erasure, that
`system_model_usage.trendItemId`, `.jobId` and `.jobAttemptId` are all different from the fixture
values while `costMicroUsd` is preserved, and that the *shared* claim keeps its real
`trend_item_id`. That is the exact "cost facts survive, links do not, and the shared row is not
collateral" property, proven rather than claimed.

### 💡 NOTE — L6. Two claims (checklist L7): separated consistently

Engineering completion and evidence completion are separate in every artefact I read:
`10b1-task4-contract.md:39-46` (Stated limitations — Better Auth's reply, the Stripe `Emptyable`
contract "a live proof against a real account is separate rollout evidence, as is real Resend
delivery (T-16)", the refusing production journal, the missing config key);
`docs/runbooks/respin-worker-operations.md:26-27` (an "Installed" column beside a "Still deferred"
column, naming T-16 and Task 5 by id); `env.example` ("T-16 … remains separate acceptance
evidence; **nothing here is that evidence**"); `README.md:203-216`; ledger entries 2042, 2046,
2047. No fixture-derived number is presented as pilot evidence, and no success-metric copy
appears in this diff.

### 💡 NOTE — L7. Number provenance (checklist L9): re-derivable

| Claim | Source | Artefact |
|---|---|---|
| 167 files / 4,588 tests passed, 22 files / 98 tests skipped (189 / 4,686) | ledger 2046, manifest 44-46 | `entry-gate-task4-pglite.txt` tail: `167 passed \| 22 skipped (189)`, `4588 passed \| 98 skipped (4686)`, `exit=0` |
| 22 files / 98 tests passed, zero skipped | ledger 2046 | `entry-gate-task4-docker.txt` tail: `22 passed (22)`, `98 passed (98)`, `exit=0` |
| `pnpm build` exit 0 | ledger 2047 | `entry-gate-task4-build.txt` tail: `exit=0` |
| focused suites 10/10, 16/16, 4/4, 5/5, 6/6, 7/7 | manifest 44 | re-ran three of them myself: 3 files / 32 tests passed |

### 💡 NOTE — L8. A stale count sits beside a Task-4 section

`docs/runbooks/respin-worker-operations.md:3` pins "143 files / 3290 tests / 0 failed / 0 skipped"
from the 2026-09-03 artefact and honestly tells the reader to re-run rather than trust it once
the tree moves — which is the right convention. But that number is now two gates old and sits
above a section documenting the Task-4 deletion tick. Name `entry-gate-task4-pglite.txt` /
`-docker.txt` for the deletion half so the reader is not re-deriving from a superseded run.

## Checks run

L1 sole emitter ✅ · L2 minimum n — not touched · L3 unverified never learns — not touched ·
L4 no pooling / no collapsing — not touched · L5 own baseline — not touched ·
L6 declared metric — not touched · L7 approval writes — not touched (deletion is T-12's
sanctioned exception to `brain_docs` immutability and runs through the registry, not a brain
mutation path) · L8 two claims ⚠️ (L1, L2 above) · L9 number provenance ✅ ·
plus the three live questions named in the gate brief: results/proposal/evidence erasure ✅,
retained cost facts cannot re-link ✅, claim separation in contract/manifest/ledger/README/runbook
⚠️ (two imprecisions, no overclaim).

## Coverage

`10b1-task4-contract.md`, `10b1-task4-review-manifest.md`, `ledger.md:2039-2047`, `README.md`
diff, `docs/runbooks/respin-worker-operations.md`, `env.example` diff,
`entry-gate-task4-{pglite,docker,build}.txt` (tails), `creator-data-registry.ts`,
`lifecycle-subjects.ts`, `deletion-executor.test.ts`, `tests/feedback-readers.test.ts`,
`tests/table-writers.test.ts`, `tests/retention.test.ts`, `tests/import-boundary.test.ts`.

Commands run:

```
pnpm exec vitest run packages/db/tests/{deletion-executor,deletion-external-commands,auth-mail}.test.ts
  → 3 files / 32 tests passed
tail -30 docs/progress/respin-finish/entry-gate-task4-pglite.txt
tail -25 docs/progress/respin-finish/entry-gate-task4-docker.txt
tail -20 docs/progress/respin-finish/entry-gate-task4-build.txt
rg 'promotionProposals|promotion_proposals' --glob '**/src/**/*.ts'   → 5 pre-existing files
```

## Verdict

**NEEDS CHANGES** — both findings are claim-precision, not learning defects; L1 is coupled to
code-review C1 and closes with it.

## Grade

**A-**

---
---

# 3. Code / security / state-machine review — report

## Readiness headline

**Not yet.** The state machine, the outbox fences and the SQL port are careful, well-argued work
with real concurrency proofs behind them, and the injection surface is clean. One declared
recovery control provably cannot execute, and it is the control the runbook tells operators to
watch for. Three smaller items — a comment that contradicts the library it describes, a
clock-skew-tight admission bound, and a rule set with no totality guard — should close with it.

## Findings

### ❌ BLOCK — C1. The residue → `blocked` recovery path cannot run: the journal reservation survives the rollback and conflicts with its own next plan

`respin/packages/db/src/deletion-executor.ts:340-345` reserves the erasure journal plan **in its
own committed transaction** (`prepareJournalPlan` wraps everything in `db.transaction`,
`deletion-lifecycle.ts:258`), writing `journalIntentPlanDigest`, `journalIntentBaseVersion` and
`journalIntentEffectiveAt` for `ERASURE_STEPS`. Those three fields are cleared **only** on the
last plan index (`deletion-lifecycle.ts:668-684`); I grepped every writer of
`journalIntentPlanDigest` in `packages/db/src` — `prepareJournalPlan:299` and
`appendJournalTransitionInTx:680` are the only two, and neither has a failure-path clear.

When the erasure transaction rolls back on residue (`deletion-executor.ts:406`), the reservation
therefore stays. `handleErasing`'s catch (`:452-458`) then calls
`transitionDeletionOperation(db, id, "blocked", ports.journal)`, which builds
`[{ from: "erasing", to: "blocked" }]` (`deletion-lifecycle.ts:3407-3416`) — a **different** plan
digest. Inside `prepareJournalPlan`:

- `:273-279` early-return needs all three intent fields null → not taken;
- `:281` `operation.state !== steps[0].from`? `"erasing" === "erasing"` → passes;
- `:282-292` an intent exists and its digest does not match → **`refuse("journal_plan_conflict")`**.

Net effect: the operation never reaches `blocked`. The refusal propagates to
`advanceDeletionOperations`' catch (`:555-557`), `last_failure_code` records the plan conflict
rather than `residue_detected:<n>`, and every subsequent tick re-attempts the same erasure — the
reservation still matches `ERASURE_STEPS`, so `prepareJournalPlan` returns idempotently and the
loop repeats. The same shape applies to any refusal raised after the reservation, not only
residue.

**Nothing has ever witnessed this.** `deletion-executor.test.ts` has no residue case; the only
`blocked` test (`:602-629`) is the pre-grace command path, where no reservation exists. This is
the CLAUDE.md 2026-08-26 lesson exactly — "a mutation matrix is blind to a control that was never
written"; here the control was written but never executed.

It is **fail-closed**: no residue commits, nothing completes, and production cannot reach
`erasing` at all while `unavailableDeletionJournal` is composed
(`worker/deletion-lifecycle.ts:54-58`). So this blocks the *claim*, not safety. But
`10b1-task4-contract.md:23` states the rollback behaviour and the runbook
(`respin-worker-operations.md:75-79`) documents the resulting operator signal, and both are wrong.

**Fix:** clear (or re-reserve) the journal intent when a plan is abandoned, or give the
`blocked` transition a plan that composes with the reservation. Then write the residue test —
plant a probe that returns non-zero and assert the operation lands in `blocked` with
`last_failure_code = residue_detected:<n>`.

### ⚠️ CHANGE — C2. A comment claims a property the installed Better Auth does not have, and the file's own test says the opposite

`respin/packages/auth/src/create-auth.ts:414-416`:

> "A refused or non-accepted send **THROWS so Better Auth cannot answer 'check your email'** for a
> mail that did not go."

Against the installed `better-auth@1.6.28`:
`node_modules/better-auth/dist/api/routes/password.mjs:82-90` calls the hook through
`ctx.context.runInBackgroundOrAwait(...)` and then unconditionally returns
`{ status: true, message: "If this email exists in our system, check your email for the reset
link" }`; `node_modules/better-auth/dist/context/create-context.mjs:214-224` shows that helper
`await`ing the promise inside a `try/catch` that **swallows** the error and only logs it. The
`APIError("SERVICE_UNAVAILABLE")` at `create-auth.ts:434-437` never reaches the client.

The honest version is already recorded twice — `10b1-task4-contract.md:41` and the wiring test's
own header, `packages/auth/tests/auth-mail-wiring.test.ts:101-107` ("the route's generic reply is
Better Auth's enumeration guard, not a delivery claim"). Only the comment beside the code says
the false thing. CLAUDE.md lesson 2026-07-30: assert it or delete the claim. Delete/correct it.

(Related, for whoever writes Task 8: the endpoint's own JSON body already says "check your email
for the reset link" — the limitation is not only about the page copy Task 8 controls.)

### ⚠️ CHANGE — C3. The SQL port's per-column rule set is a producer, not a list

Following on from the least-confident probe above: today every `pseudonymise` column resolves,
so `cannot_pseudonymise` (`lifecycle-sql-port.ts:450`) is unreachable. Nothing keeps it that way.
A future registry entry that puts a **NOT NULL** `jsonb`, `timestamptz`, `integer`, `boolean`,
`varchar` (note: `udt_name` is `varchar`, not `text`, so `:428` would not catch it) or enum
column into a `pseudonymise` field set compiles, type-checks, and passes every existing test —
and refuses on the first real erasure, in the worst possible place.

This is CLAUDE.md non-negotiable rule 7 ("a derived guard's population is a list, not a
producer"), which this repo has already been bitten by twice. Add a derivation test that walks
`LIFECYCLE_REGISTRY × migrationInventory()` and asserts every column of every `pseudonymise`
field set matches one of the port's rules — the same shape as the existing registry-closure
tests, and it costs no database.

### ⚠️ CHANGE — C4. The mail admission's expiry bound is tight against app-vs-database clock skew

`create-auth.ts:431` and `:458` compute `actionExpiresAt = new Date(Date.now() + AUTH_MAIL_TTL_MS[...])`
from the **app node's** clock. `admitAuthMail` refuses when
`actionExpiresAt > dbNow + AUTH_MAIL_TTL_MS[purpose]` with `dbNow` read from `clock_timestamp()`
(`auth-mail.ts:228-235`). The margin is exactly zero: if the database clock lags the app clock by
even a millisecond, **every** password-reset and signup-verification mail refuses with
`action_expiry_out_of_range`. The failure is close to silent — the reset path's throw is swallowed
by Better Auth (C2), and the verification path only `console.error`s (`create-auth.ts:462-465`).
App and DB are separate hosts in the Lightsail target.

Fix: derive the expiry from the database clock inside the admission (it already reads it), or
allow a small explicit tolerance with the reason recorded.

### ⚠️ CHANGE — C5. "grace → erasing (recovery digest gone)" is not atomic

`deletion-executor.ts:301-313` clears `recovery_secret_digest` / `recovery_secret_prefix` in a
**separate statement after** the `erasing` transition has already committed. A crash in that
window leaves the digest live: the erasure transaction will not remove it either, because the
`recovery_secret` field set is a partial `delete_explicit` and is skipped as a receiver clock
(`lifecycle-sql-port.ts:482-486`), and Task 6's receiver does not exist. It cannot authorise
anything — `assertDeletionTransition` forbids `erasing → cancelled` and
`validateWorkerTransitionInTx:3368` refuses cancellation outright — so this is a durability gap
in a stated property (plan C5: "identity recovery digest erases on … erasure start"), not a live
authorisation hole. Move the clear into the transition's transaction, or re-apply it idempotently
at the top of `handleErasing`.

### 💡 NOTE — C6. Injection surface: clean

Every identifier in the SQL port goes through `sql.identifier` — `:117, 158, 171, 178, 190, 374,
405, 512, 569, 584, 592, 609` — and every value is a bound parameter, including the column-name
seeds inside `md5(random()::text || clock_timestamp()::text || ${column})` (`:424, 435, 441`) and
the stub ids in the `target_key` CASE (`:405-412`). No string is concatenated into SQL anywhere in
the port; `SET CONSTRAINTS` uses a literal constraint name (`deletion-executor.ts:349`). The
deferred-constraint statement is correct: migration `0052` recreates the composite FK as
`DEFERRABLE INITIALLY IMMEDIATE`, and the erasure transaction defers it before rewriting parent
and children — with the same random `payload_hash` and `requester_digest` keyed on
`operation_id` for both sides (`:512-528`), which is what keeps the five-column FK satisfied at
commit. No secret is stored or logged anywhere in the diff (the API key lives only in the adapter
closure, `resend-mail.ts:73-107`).

### 💡 NOTE — C7. Lease handling is correct

`releaseLease` runs in `finally` against `db`, never the failed transaction, and is guarded on
`lease_owner = workerName` (`deletion-executor.ts:224-234`, `:558-560`); a successful erasure
clears the lease inside its own transaction first (`:416-420`), so the `finally` is a harmless
no-op. `claimLease` is a single conditional `UPDATE … RETURNING` on an expired-or-null lease
(`:206-222`), and the four-way race is proven on real PostgreSQL
(`deletion-executor.docker.test.ts`, in the 22-file docker run). The outbox has the matching
structural guarantee: `deletion_external_commands_operation_kind_attempt_uq` on
`(operation_id, kind, attempt)` (migration 0050:44).

### 💡 NOTE — C8. Auth-mail reconciliation race: safe, but it throws instead of returning

`reconcileIdentityRecovery` (`auth-mail.ts:528-550`) reads the row **without** `FOR UPDATE`, so a
dispatcher can mark it dispatched between the read and the `failed` close. The close is still
safe — `recordAuthMailOutcome` re-reads `FOR UPDATE` and its `UPDATE … WHERE status = <observed>`
(`:340-353`) is the real fence, and `markDispatched` also requires `status = 'pending'`
(`:284-297`) — so **no rotated secret can be sent on a closed row**, which is the property the
comment claims. The loser's `recordAuthMailOutcome(accepted)` then hits `terminal_outcome_conflict`
(`:322-327`) and throws out of `deliverIdentityRecovery`, whose `try/catch` covers only
`admitAuthMail` (`:493-508`). Nothing is reported delivered; the caller just gets an exception
instead of a typed `failed` result. Map it.

### 💡 NOTE — C9. Resend classification is honest; one refinement

`classifyResendResponse` (`resend-mail.ts:45-71`) is right on the hard cases: 2xx **without** an
id is `unknown`, not `accepted` (`:49-56`) — the case the review brief singled out — and 409
`concurrent_idempotent_requests` / 5xx / network are `unknown` while definitive 4xx are `failed`.
429 → `failed` is correct (rate-limited means not accepted). The one gap: a 409 with an
unreadable body (`readJson` returns `null` on a parse failure, `:36-42`) falls to
`provider_rejected` = `failed`, when a 409 whose reason cannot be read is by definition
indeterminate. Prefer `unknown` for an unnamed 409.

### 💡 NOTE — C10. `reconciliationDigest` in the Stripe adapter is a fake sha256

`packages/credits/src/stripe/deletion-commands.ts:76-83` builds a 64-hex string by repeating an
8-hex 32-bit rolling hash eight times. It satisfies `HEX64` and is only a replay key, so nothing
breaks — but every other digest in this diff is a real `createHash("sha256")`
(`deletion-external-commands.ts:33`, `auth-mail.ts:39`), and a value shaped like a digest that is
not one invites a future reader to treat it as one. Use sha256.

### 💡 NOTE — C11. `stripe_customer_personal_fields_clear` declares a scope it cannot serve

`deletion-external-commands.ts:68` allows the kind for `["identity", "workspace"]`, but both
`execute` and `reconcile` return `failed: workspace_target_missing` without
`command.workspaceId` (`deletion-commands.ts:126, 198`). It is unreachable today —
`erasingCommandKinds` returns `[]` for non-workspace scopes (`deletion-executor.ts:182`) and
contract decision 5 says identity clearing does not run until C3's billing-contact binding
exists. Narrow the declared list to `["workspace"]` so the closed population matches what the
adapter can actually do; widen it in the same change that builds the binding.

### 💡 NOTE — C12. Two small ownership/telemetry smells

- `DELETION_EXECUTOR_MAX_COMMAND_ATTEMPTS` is enforced at the call site
  (`deletion-executor.ts:482`), not inside `retryFailedExternalCommandInTx`
  (`deletion-external-commands.ts:191-223`). One caller today; the bound belongs with the module
  that is declared the sole writer.
- `releaseLease` increments `retry_count` for every non-null code (`:231`), which includes benign
  waits like `external_command_pending`, `nested_operation_active` and
  `blocked_awaiting_operator` (`:552-554`). The counter measures ticks, not retries. Nothing
  reads it yet; an operator will.

### 💡 NOTE — C13. Exported-but-unreachable helpers duplicate a rule the SQL port already owns

`scrubAuthMailRecipientLinksInTx` and `sweepExpiredAuthMail` (`auth-mail.ts:557, 570`) are
exported from `@respin/db` (`index.ts:67, 69`) and called only from
`packages/db/tests/auth-mail.test.ts:325, 329`. Real identity erasure goes through the generic
SQL port's `pseudonymise` on the `recipient_link` field set. The sweep is legitimately
pre-registered for Task 6's receiver — say so in a comment; the scrub is a second implementation
of a rule the port already owns and will drift (CLAUDE.md Definition of Done, *Reachability*).

### 💡 NOTE — C14. Registry edits in the guard tests are reasoned, not widened

I read the three the ledger names. `tests/table-writers.test.ts:765-793, 889-891` gives each stub
`INSERT` a sentence naming R-122 and Task 4; `tests/feedback-readers.test.ts:75-81` and
`tests/retention.test.ts:41-43` likewise. None is a bare path addition. The ledger's own NOTE
(2045) that the AST writer scanner cannot see the SQL port's dynamically-rendered
`DELETE`/`UPDATE` is honest and is compensated structurally —
`compileLifecycleExecutionTargets` throws for a table absent from the migration inventory
(`lifecycle-executors.ts:519`), so the port can only ever render a registry table. On CRLF: I
edited nothing; the `git diff` line-ending warnings are the pre-existing `core.autocrlf`
condition, and the multi-line anchors in all three registry files read intact.

### 💡 NOTE — C15. `env.example` has an orphaned comment

The block "`# Immutable key id v1. Back up this secret outside PostgreSQL; paid Stripe events may
need it after a point-in-time database restore.`" sits after `RESPIN_STRIPE_LIVEMODE=false` and
before a blank line, describing `RESPIN_AUTO_TOPUP_AUTHORITY_KEY`, which is declared three lines
above it with no comment. Not Task 4's variable, but it is in the file this task edits.

## Checks run

1 Correctness — ❌ C1, ⚠️ C4, ⚠️ C5, 💡 C7-C9, C11, C12 ·
2 Security — ✅ C6 (identifiers, parameters, deferred constraint, secrets, outbound origin) ·
3 Convention adherence — ⚠️ C3 (non-negotiable rule 7), ⚠️ C2 (Lessons 2026-07-30),
💡 C13 (Definition of Done, Reachability); golden rule 6 upheld throughout the ledger/contract ·
4 Tests — ⚠️ C1 (no residue case), ⚠️ S2 (no `tier_invoice_authority` case), ⚠️ C3 (no totality
test); everything else in the manifest is covered by assertions that would fail if inverted ·
5 Maintainability — 💡 C10, C12, C13, C15.
All eight items the gate brief named to hunt were checked and are reported above.

## Coverage

Files read in full: `packages/db/src/{deletion-external-commands,auth-mail,auth-mail-schema,deletion-executor,lifecycle-sql-port,lifecycle-subjects,lifecycle-executors}.ts`,
`packages/auth/src/resend-mail.ts`, `packages/credits/src/{deletion-server,stripe/deletion-commands}.ts`,
`worker/deletion-lifecycle.ts`, `packages/auth/tests/auth-mail-wiring.test.ts`.
Read in part: `deletion-lifecycle.ts` (the Task-4 seam: `prepareJournalPlan`,
`appendJournalTransitionInTx`, `validateWorkerTransitionInTx`, `transitionDeletionOperation`),
`creator-data-registry.ts`, `lifecycle-schema.ts`, `billing-schema.ts`, `create-auth.ts`,
`server.ts`, `worker/{production,pg-boss-runtime,health}.ts`, `app/(product)/billing-errors.ts`,
`eslint.config.mjs`, `env.example`, `README.md`, the runbook, migrations 0050/0051/0052, and the
tests named in the manifest. Third-party facts were verified against the installed version, not
memory: `node_modules/better-auth@1.6.28/dist/api/routes/password.mjs` and
`dist/context/create-context.mjs`.

Commands run:

```
pnpm exec vitest run packages/db/tests/deletion-executor.test.ts \
  packages/db/tests/deletion-external-commands.test.ts packages/db/tests/auth-mail.test.ts
  → Test Files 3 passed (3) · Tests 32 passed (32)
node -e "require('./node_modules/better-auth/package.json').version"     → 1.6.28
grep -rn "runInBackgroundOrAwait|sendResetPassword" node_modules/better-auth/dist/
grep -n "journalIntentPlanDigest" packages/db/src/*.ts                   → only :299 and :680 write it
grep -n "uniqueIndex|INDEX" packages/db/src/lifecycle-schema.ts packages/db/migrations/0050_*.sql
tail -30/-25/-20 docs/progress/respin-finish/entry-gate-task4-{pglite,docker,build}.txt
```

Not run: the full canonical `pnpm test`, the docker suite, `pnpm build` — the author's recorded
transcripts were checked instead and are consistent (see learning finding L7). C1 is reported
from code reading, not from a red test; **that it has never been executed is part of the
finding**, and the fix must land with the test.

## Verdict

**BLOCK** on C1, with C2–C5 as required changes alongside it.

## Grade

**B-**

---

## Summary of the three verdicts

| Critical path | Verdict | Grade |
|---|---|---|
| Respin spin compliance (lean) | NEEDS CHANGES | B |
| Respin learning honesty (lean) | NEEDS CHANGES | A- |
| Code / security / state machine (lean) | BLOCK | B- |

**Must close before this task is Ready:** C1 (with its test), S1, S2, C2, C3, C4, C5, L1, L2.
**Must close before `RESPIN_DELETION_ERASURE_SCOPES` is ever set in any environment:** S1 and S2.

Reviewed read-only. Nothing in the tree was modified.
