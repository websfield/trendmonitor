# Phase 10b-1 Task 4 — lean consolidated reviewer gate, round 2 (2026-09-07)

**This was a LEAN CONSOLIDATED run** (`Gate intensity: lean` in CLAUDE.md): one read-only
reviewer pass rendering three separate verdicts — Respin spin compliance, Respin learning
honesty, and the general code/security/state-machine review — each against its own checklist.
The merged run does not carry each reviewer's `effort: max`, and the advisory simplification
pass is skipped. The two `Full gates? = yes` paths (billing, tenancy) run as their own separate
reviewers and are not covered here. No file in the tree was edited; the only file written is
this report.

Tree reviewed: the round-1-fixed working tree at `cc3ed43` + uncommitted Phase-10 work, read
2026-09-07 between 13:20 and 13:45 local. Round-1 report: `10b1-task4-gate-lean-round1.md`
(S1–S8, L1–L8, C1–C15). Every round-1 item is tracked below as CLOSED / STILL OPEN with the
witness I read or ran.

---

## Probe of the author's new least-confident line (done first)

> "The orphaned journal version after a rolled-back erasure … the in-memory journal port accepts
> a second append at the same version with different content; the S3 adapter does not exist yet,
> and its conflict rule decides whether a blocked-after-residue operation can ever leave
> `blocked` in production."

**Mechanism, verified in code.** `eraseOperation` reserves the two-step plan
`erasing→verifying→complete` in its own committed transaction (`deletion-executor.ts:437-442`),
then inside the erasure transaction appends `verifying` to the journal port *before* the
executors run (`:479-482`, journal-before-effect, plan C2). On residue the transaction throws
(`:503`), PostgreSQL rolls back the `verifying` transition row and the `journal_version` bump,
and the `.catch` releases the reservation (`:539-545` → `abandonJournalPlan`,
`deletion-lifecycle.ts:3422-3443`). The port has already durably recorded version N =
`erasing→verifying`. The next append — `erasing→blocked` from `handleErasing`'s catch
(`:582`) — is computed from the database's `journal_version` (N−1) and is therefore **also
version N, with different content**. The test pins exactly this
(`deletion-executor.test.ts:728-732`: `[verifying, blocked]` at one version).

**Judgement on the recording.** Recording it as a Task 5 limitation is *honest*: it is stated
in the contract (`10b1-task4-contract.md:47`), the ledger (`:2051`), the open-items register
(T4-R1) and the manifest, and pinned in a test rather than hidden. Task 4 does not have to change
the append order today, because (i) production composes `unavailableDeletionJournal`
(`worker/deletion-lifecycle.ts:64-70`), so no operation can reach `erasing` before Task 5, and
(ii) the failure is fail-closed in every store shape — nothing commits, nothing completes.

**But the wording understates what Task 5 has to do, and one comment in the test says the
opposite of the decision record.** R-124 requires `PutObject` with `If-None-Match: *`, Object
Lock COMPLIANCE, a writer principal that "cannot delete, add delete markers, copy over, change
retention", and a restore that "requires exactly one object version per logical key … blocks on
a duplicate … conflict". Under those rules a second `{requestId}/N.json` with different bytes
is refused at the store and, if it somehow existed, would block restore. So "the S3 adapter's
conflict rule must accept or supersede that orphan" (open item T4-R1) describes a rule R-124
forbids the adapter from having. The consequence for a real append-only S3 store, in one
paragraph: **after any rolled-back erasure, the operation is permanently stuck in `erasing`.**
The `blocked` append conflicts at N; the retried erasure re-reserves with a fresh
`journal_intent_effective_at`, so its `verifying` bytes differ from the orphan and conflict at
N too (even byte-identical retry would only work if the adapter treats "exists with identical
checksum" as confirmed — which is the *designed* path for a crash after a successful put, and
the C1 fix's `abandonJournalPlan` deliberately leaves that path); meanwhile the journal, which is
the restore authority, claims the operation progressed to `verifying` when the database says
`erasing` — a state the restore verifier would derive and the database would contradict. The
fix is version accounting in the lifecycle/executor (burn the orphaned version by journaling
the rollback as a transition, or journal `verifying` only after the probes pass), not a
permissive adapter rule; Task 5's scope must say so. That is finding **C-R2-2** below, a claim
correction, not a code BLOCK — the code is fail-closed and unreachable in production today.

---
---

# 1. Respin spin compliance — report

## Readiness headline

**Almost.** Round-1's three findings are closed with real witnesses: the payload residue is
pinned in the workspace walk and disclosed in four places, the receipt probe now inspects the
captured customer ids and every governed JSON path independently of the executor's rewrite, and
the delivery copy no longer guesses a direction. One recorded claim is still wrong: the
"no completed erasure can hold this residue" sentence is scoped to workspace erasure, but the
same payload survives an *identity* erasure of the workspace's Stripe contact, and identity
erasure is not gated.

## Findings

### ✅ CLOSED — S1. Payload residue pinned and stated (with one scope gap, see S-R2-1)

`deletion-executor.test.ts:499-506` asserts, after a completed workspace erasure, that
`stripe_events.payload` still equals `{ customer: "cus_owner", email: "owner@example.test" }`
and says why in the comment. `10b1-task4-contract.md:49` states it as a limitation;
`respin-finish-open-items.md` T4-R3 records it for Task 6; the executor refuses workspace
erasure at grace while the financial chain cascades (`deletion-executor.ts:135-145, 386-391`;
witnessed `deletion-executor.test.ts:444-446`) and the worker refuses the `workspace` scope token
at startup (`worker/deletion-lifecycle.ts:49-60`; witnessed `worker/tests/deletion-lifecycle.test.ts:38-43`).
The round-1 "either scrub it or supersede and disclose" was met by the disclose branch.

### ✅ CLOSED — S2. The receipt probe is independent of the executor's whole-column null

Executor side: the `tier_invoice_authority` column is nullable `jsonb` → `scrubRuleFor` returns
`"null"` (`lifecycle-sql-port.ts:308`) → `SET tier_invoice_authority = NULL`. Probe side, in the
separate renderer (`:686-706`): for the `stripe_events` + workspace-subject class it counts a row
in the captured event-id set as residue if `workspace_id = <ws>` **or** `stripe_customer_id IN
(<captured customer ids>)` **or** any governed path `tier_invoice_authority->>'<key>' IS NOT
NULL`. The customer ids are captured before the scrub (`lifecycle-subjects.ts:252-273`,
`stripeCustomerIds` on the workspace subject, `lifecycle-executors.ts:42`), so the check does
not depend on the already-nulled workspace link. The fixture populates five governed paths
(`deletion-executor.test.ts:338-344`) and the walk asserts the column is null afterwards
(`:498`). This answers brief question (c): yes — a `->> path IS NOT NULL` check cannot be
satisfied by a scrub that failed to run, whichever way the executor clears the column.

### ✅ CLOSED — S3. The delivery-refusal copy claims neither direction

`app/(product)/billing-errors.ts:1039-1047`: "That email was not confirmed as sent — The mail
provider did not confirm the message. It may still arrive; if it does not, request it again in a
few minutes." One copy still covers both `failed` and `unknown`, and the comment says so; for a
definitive refusal "it may still arrive" is over-hopeful by a shade, but it no longer converts
indeterminate into definite, which was the finding.

### ⚠️ CHANGE — S-R2-1. The payload residual is claimed contained, but identity erasure is not gated and leaves the same email

`deletion-executor.test.ts:503-505`: "Workspace erasure is refused in production until Task 6
lands (financial-chain gate above), so **no completed erasure can hold this residue** before the
receiver exists." Open item T4-R3: "moot while T4-R2 holds." Both are true only for the
*workspace* scope. `stripe_events` rows are workspace- or system-scoped in the registry
(`creator-data-registry.ts:337-352`) and `targetAppliesToOperation` admits only
identity-subject targets to an identity operation (`lifecycle-subjects.ts:290`), so an
**identity** erasure of the owner whose email sits in a workspace-attributed payload (the
fixture's exact shape: `owner@example.test` in `evt_owner_1`) completes with that email intact,
and the identity walk never looks at `stripe_events`. The `identity` scope token is accepted by
`resolveErasureEnablement` today. Plan C3's designed control is the billing-contact refusal
("identity deletion refuses until another active owner accepts that contact"), which contract
decision 5 defers; that deferral is stated for the Stripe-side clearing but not for the local
payload copy.

Nothing can complete in production before Task 5, so this is a claim defect, not a live one.
Required: extend T4-R3 and the contract's limitation to identity scope (Task 6's purge, or the
C3 billing-contact binding, must land before *identity* erasure is enabled — not only before
workspace erasure), and correct the test comment at `:503-505`.

### 💡 NOTE — S-R2-2. Two round-1 refinements landed without a witness

C9 (an unreadable 409 body is indeterminate, `resend-mail.ts:57-65`) has no test:
`resend-mail.test.ts:64-71` covers a named 409 in both directions and `:86` an unreadable 503,
never `classifyResendResponse(409, null)`. C8's typed `failed` on a racing reconciliation
(`auth-mail.ts:539-547`) likewise: `auth-mail.test.ts:298` pins the writer's
`terminal_outcome_conflict` refusal, not the recovery port's mapping of it. Both are one-line
tests.

### 💡 NOTE — S4–S8 re-checked on the fixed tree

Outbound surface still one pinned origin (`resend-mail.ts:17, 87, 101`); no new dependency in
the fix pass (`git diff HEAD --stat` on the four package manifests shows the same files round 1
inspected); mail body and worker events unchanged; shared/private survival asserted in all three
walks (`:469-470, :579, :668`) including the new consent-only row. S8's failure code is
SQLSTATE-first (`deletion-executor.ts:191-200`); the message fallback remains for non-database
errors, as intended.

## Checks run

S1 sources allowlist ✅ · S2 similarity gate — not touched · S3 minimum-difference — not
touched · S4 kill-test honesty — not touched · S5 `[check]` — not touched · S6 no guarantees ✅
(S3 closed) · S7 no automation / no concealment ✅ · S8 autopsy caching — not touched · brief
(c) payload-residue claim ⚠️ (S-R2-1) · brief (c) probe independence ✅.

## Verdict

**NEEDS CHANGES** — S-R2-1 (claim scope) before Ready; S-R2-2 optional.

## Grade

**B+** (round 1: B)

---
---

# 2. Respin learning honesty — report

## Readiness headline

**Almost.** The learning invariants are untouched by the fix pass and still guarded; the ledger
correction was appended, not rewritten; every runbook failure code now names something the
executor writes. Two outward claims still outrun their evidence: the runbook's Status paragraph
cites a round-2 transcript that, at the moment it was cited, held an `exit=1` run and is now
being regenerated, and the runbook's "a rolled-back erasure resumes on the next tick" is true
only against the in-memory port.

## Findings

### ✅ CLOSED — L1. Every code the runbook names is one the executor writes

Grepped `deletion-executor.ts` for each code in the "Reading what is stuck" and "Two holds"
paragraphs (`respin-worker-operations.md:79-80`): `external_command_unknown` (4 sites),
`external_command_pending` (4), `nested_operation_active` (2), `external_command_failed` (3),
`residue_detected:` (1, `:503`), `sqlstate_` (1, `:197`), `unknown_outcome_pending` (1, `:454`),
`erasure_disabled` (5), `financial_chain_unretained` (1, `:389`), `blocked_resume_state`
(column, set at `deletion-lifecycle.ts:662`). The two holds write no `last_failure_code` because
`NORMAL_HOLD_CODES` is matched by prefix (`:298, :719`) — verified. The residue code reaches the
row through `handleErasing`'s explicit update (`:583-586`) and is witnessed at
`deletion-executor.test.ts:702-704`.

### ✅ CLOSED — L2. The ledger correction is appended; the original is untouched

`git diff HEAD --stat -- ledger.md`: 299 insertions, **0 deletions**; HEAD has 1,752 lines, the
working tree 2,051. The original 4.2 entry (`ledger.md:2041`) still reads "Live-Postgres quota
witness: 80 concurrent admissions → exactly the ceiling" verbatim, and the correction is a new
entry at `:2050` that names the 40 + 40 composition and the post-fix 30/10 witness.

### ⚠️ CHANGE — L-R2-1. The runbook cites a gate artefact that was red when cited and is being regenerated

`respin-worker-operations.md:3` names `entry-gate-task4-r2-{pglite,docker,build}.txt` as "the
most recent recorded gate on this tree". What those files held while I reviewed:

| Artefact | State at 13:38 | State at 13:42 |
|---|---|---|
| `…-r2-pglite.txt` | complete: `168 passed \| 22 skipped (190)` files, `4599 passed \| 98 skipped (4697)` tests, **`Errors 1 error`** — `[vitest-worker]: Timeout calling "onTaskUpdate"` (vitest RPC timeout, not a test assertion), **`exit=1`** | truncated to 11 KB and growing: a re-run in progress |
| `…-r2-docker.txt` | in progress | complete: `22 passed (22)` files, `98 passed (98)` tests, `exit=0` — includes `auth-mail-quota.docker` 1/1, `deletion-executor.docker` 1/1, `deletion-recovery-concurrency.docker` 3/3 |
| `…-r2-build.txt` | complete: `exit=0` | same |

The Status paragraph was therefore written before the artefact it names had finished — the
same class of miss the contract itself records at `:51` ("a claim recorded without re-reading
the file it names", Golden rule 1). The first pglite attempt's 4,599 passing tests and one
harness-level RPC timeout are almost certainly a load flake (512 s wall, 8,137 s test time), but
a transcript ending `exit=1` is not a green gate and cannot be cited as one. Required: when the
re-run finishes, re-read it, and either cite a transcript that ends `exit=0` or record the
`exit=1` and its cause in the ledger beside the citation. The manifest's "round-2 gates and the
canonical gate on the fixed tree recorded below" must be filled from the finished file, not from
intent.

### ⚠️ CHANGE — L-R2-2. "A rolled-back erasure resumes on the next tick and is retried" is unqualified

`respin-worker-operations.md:79`. Against the in-memory port that is what happens
(`deletion-executor.test.ts:714-718`). Against the production journal R-124 specifies, it cannot
(see the probe above): the resumption's own append conflicts at the orphaned version. The runbook
is the 2 a.m. page for an operator running the S3 journal Task 5 ships; it must say that a
residue-blocked operation is *not* self-resuming until Task 5 resolves T4-R1, or say "in-memory
port only". It should also say the retry is unbounded today (C-R2-1) — "retries a failed command
up to three attempts" at `:75` is the command bound, not an erasure bound.

### 💡 NOTE — L-R2-3. `retry_count counts real failures only` — a residue rollback is not counted at all

`respin-worker-operations.md:79`. A residue or constraint rollback returns `to: "blocked"`,
so `advanceDeletionOperations` leaves `code` null and `releaseLease` increments nothing
(`deletion-executor.ts:719-721, 315-320`); `handleErasing` writes `last_failure_code` directly
(`:583-586`) without touching `retry_count`. An operator reading `retry_count = 0` beside
`residue_detected:3` after twenty loops would be misled. Closes with C-R2-1.

### 💡 NOTE — L-R2-4. Number provenance of the fix-pass entry

`ledger.md:2049` — "Focused: 16 files / 343 tests green; docker quota + lease 2/2 live". The
entry names neither the sixteen files nor a transcript, so the count is not re-derivable as
recorded (round-1 L7 could re-derive every number from a named artefact). My re-derivation: the
seven suites the brief named → **7 files / 66 tests passed, exit 0** (executor 12, external
commands 10, auth-mail 16, registry 15, worker 7, adapter 4, scrub rules 2); the "docker 2/2"
matches the two named suites in `entry-gate-task4-r2-docker.txt` (`auth-mail-quota.docker` 1/1,
`deletion-executor.docker` 1/1). Name the file set next time, or the transcript.

### 💡 NOTE — L3–L7 re-checked on the fixed tree

Sole emitter: `promotion_proposals` is still named only by `creator-data-registry.ts`,
`index.ts`, `promotion-ops.ts`, `promotion-schema.ts`, `with-workspace.ts` — the same five
pre-existing files as round 1; no writer added. Results/feedback/evidence still cascade with the
profile and the workspace and survive identity erasure (`deletion-executor.test.ts:457-459`
workspace, `:649-650` profile, `:583` identity keeps the brain document). Retained cost facts
still un-relinkable (`:476-490`). Claim separation intact in the contract's extended
limitations (`:39-51`) and the open-items register (T4-R7 keeps live proofs separate).

## Checks run

L1 sole emitter ✅ · L2–L6 — not touched · L7 approval writes — not touched · L8 two claims ⚠️
(L-R2-1, L-R2-2) · L9 number provenance ⚠️/💡 (L-R2-1, L-R2-4) · brief (e) codes ✅, transcript
state reported as found · brief (f) appended-not-rewritten ✅ · brief (g) re-derivation ✅ (7/66).

## Verdict

**NEEDS CHANGES** — L-R2-1 and L-R2-2 are claim-precision items on the operator page and the
gate record; neither is a learning defect.

## Grade

**B+** (round 1: A−; the movement is the red-then-regenerating citation, which did not exist
in round 1)

---
---

# 3. Code / security / state-machine review — report

## Readiness headline

**Not yet → Almost · Grade B · The round-1 BLOCK is closed with a real witness and no fix
introduced a regression I could find; two things must still change — an unbounded
erase-rollback-resume loop the fix created, and a test comment that asserts a journal property
R-124 forbids. 2 must-fix, 6 optional.**

## Round-1 items

### ✅ CLOSED — C1. The residue → `blocked` path now runs

- Release: `abandonJournalPlan` (`deletion-lifecycle.ts:3422-3443`) clears the three intent
  fields only where `journal_intent_plan_digest = <this plan>` **and**
  `journal_intent_base_version = journal_version`. After a rollback the base equals the current
  version (the `verifying` bump rolled back with the transaction), so it clears; after a
  committed append the versions differ, so it is a no-op. That is the "never released while an
  append of the plan has committed" property from brief (a), by construction.
- Every failure path (brief (a)): a refusal thrown *before* the transaction is thrown by
  `prepareJournalPlan` inside its own transaction, which rolls the reservation back with it
  (`:264-317`) — nothing to release; inside the transaction (residue `:503`, a constraint, a
  port `conflict` refused at `:614`, a port throw, `state_changed_during_erasure` `:508`) the
  `.catch` at `:539-545` releases and rethrows; a failed release itself leaves the erasure
  reservation in place so the next tick idempotently re-enters the same plan (`:292-296`) —
  self-healing, not stuck.
- Blocked with the code: `handleErasing` `:573-588` turns every erasure failure into
  `transitionDeletionOperation(…, "blocked")`, which now finds no reservation, then writes the
  code. `validateWorkerTransitionInTx` (`:3383-3411`) admits `erasing → blocked`
  (`TRANSITIONS.erasing = ["verifying","blocked"]`, `:181`) and `blocked → erasing` when
  `blocked_resume_state = erasing` (`:183, :3396-3398`).
- Witness: `deletion-executor.test.ts:676-733` plants residue through the probe seam
  (`vi.spyOn(LIFECYCLE_PROBES.profile_residue, "execute").mockResolvedValueOnce(1)`) and asserts
  `[["blocked","residue_detected:1"]]`, `blockedResumeState: "erasing"`,
  `journalIntentPlanDigest` null, the profile row still present, no committed `verifying`
  transition, then `resumed_after_retry` and `complete`. Without the release, `prepareJournalPlan`
  meets a non-null digest that differs and refuses `journal_plan_conflict` (`:286-298`), so the
  `journalIntentPlanDigest` null assertion and the `blocked` outcome would both fail — I did not
  plant that mutation (no edits permitted), the reasoning is from the code path round 1 traced.
  Ran green: 12/12 in the executor suite.

### ✅ CLOSED — C2. The Better Auth comment now states what the installed library does

`create-auth.ts:415-425` says the hook runs "through its background-task helper and still
answers 'If this email exists…' (its enumeration guard)". Re-verified against
`node_modules/better-auth@1.6.28` (`package.json` version read): `dist/api/routes/password.mjs`
`:82-90` awaits `runInBackgroundOrAwait(sendResetPassword(...))` then returns the fixed
`{ status: true, message: "If this email exists…" }`; `dist/context/create-context.mjs:214-224`
catches and only logs. The comment and the library agree.

### ✅ CLOSED — C3. The scrub rule set is a list walked over the registry

`scrubRuleFor` (`lifecycle-sql-port.ts:295-310`) is a pure classifier; `scrubAssignments`
(`:396-482`) consumes it and refuses only on `null`. Behaviour-for-behaviour against the round-1
version I read: `id`/`operation_id` skip; `LINK_COLUMNS` null-or-repoint with the
`requester_digest` replacement and the NULL-stays-NULL CASE; `target_key` CASE; projection
`payload_hash` replacement; uuid null/random; text digest-like null/random with
`KEEP_DIGEST_SHAPE`; text token with `TOKEN_REPLACEMENT`; nullable fallback null; else refuse —
identical outcomes, the branches merely moved into the classifier. `lifecycle-scrub-rules.test.ts`
walks every `pseudonymise` entry × the PGlite-built schema (`loadTableMetaInTx`, the same
`information_schema` read production uses) and asserts zero unruled columns over > 40 checked;
the planted negatives (`:43-46`) are real — `int4`, `jsonb` and `varchar` NOT NULL each return
`null`, so the walk can go red. Brief (d): JSON-path field sets are covered (the
`tier_invoice_authority` entry's field set is the column itself → nullable jsonb → `"null"`);
supporting stores are **not** walked, but every supporting store compiles to `not_applicable`
or `delete_explicit` (`creator-data-registry.ts:1191-1232`, the `pgBossStore` helper), never
`pseudonymise`, so today the omission is moot — a future pg-boss `pseudonymise` entry is a
list edit here too. Ran green: 2/2.

### ✅ CLOSED — C4. Clock-skew margin

`AUTH_MAIL_CLOCK_SKEW_MS = 60_000` (`auth-mail.ts:226`) on the upper bound only (`:251`), with
the reason in the docblock; `auth-mail.test.ts:210` refuses `TTL + skew + 60 s`. (No assertion
admits a value *inside* the margin, e.g. `TTL + 30 s`; the TTL-refusal test alone would pass
without the constant. Optional.)

### ✅ CLOSED — C5. The recovery digest is nulled inside the erasure transaction

`deletion-executor.ts:519-527`, in the final `UPDATE` of the same transaction as the `complete`
append; the post-grace statement (`:397-410`) remains as the early clear.

### ✅ CLOSED — C8, C9, C10, C11, C12, C13 (NOTEs taken)

C8 `auth-mail.ts:539-547` typed `failed` on `terminal_outcome_conflict` · C9
`resend-mail.ts:57-65` unnamed 409 → `unknown` · C10 `deletion-commands.ts:82-86` real
`createHash("sha256")` · C11 `deletion-external-commands.ts:104-110` every kind `["workspace"]`
(the 0050 CHECK stays a superset, stated) · C12 `EXTERNAL_COMMAND_MAX_ATTEMPTS` in the sole
writer (`:236, :248`), `retry_count` only on non-waiting codes (`deletion-executor.ts:297-323,
:719-721`) · C13 `scrubAuthMailRecipientLinksInTx` gone from `auth-mail.ts` and `index.ts`
(grep: no match); `sweepExpiredAuthMail` still exported and declared inventory in the contract
(`:50`) and the test title (`auth-mail.test.ts:333`), though its own docblock (`auth-mail.ts:586`)
does not say so.

### ⏳ STILL OPEN — C15 (NOTE, not required, not claimed fixed)

`env.example:72-73` — "Immutable key id v1. Back up this secret…" still sits after
`RESPIN_STRIPE_LIVEMODE` (`:71`) describing `RESPIN_AUTO_TOPUP_AUTHORITY_KEY` (`:67`). The
contract's "Lean NOTEs taken" list does not claim it, so this is consistent, just open.

## New findings

### ⚠️ CHANGE — C-R2-1. The C1 fix creates an unbounded erase → rollback → resume → erase loop

`deletion-executor.ts:576-588` blocks with `blocked_resume_state = erasing`; `handleBlocked`
(`:617-641`) resumes as soon as the erasing-phase commands are clean — which, after a residue
rollback, they already are (the irreversible commands succeeded before the transaction ran).
Nothing bounds this: `retry_count` is not incremented (`:719-721`, `to` is `"blocked"` /
`"erasing"`, never null), there is no erasure-attempt counter, and no code stops the resume. A
residue that is a real bug (a probe/executor disagreement — the exact case plan C1 says "fails
closed") therefore re-runs the **entire** erasure transaction every second tick, forever: scope
lock, every registry `DELETE`/`UPDATE`, probes, rollback — with `last_failure_code` the only
signal and no alert. Under the in-memory port that is a one-minute DB load loop; under the
production journal it also burns two conflicting appends per cycle (see the probe). Contrast the
external-command path, which stops after three attempts and waits for an operator
(`EXTERNAL_COMMAND_MAX_ATTEMPTS`). Fix: count erasure failures on the row (a column or the
existing `retry_count`, incremented in the catch at `:581-586`), and after the bound transition
to `blocked` **without** a resume state so `handleBlocked` returns
`blocked_awaiting_operator` (`:619-621`); add the residue-twice test; say it in the runbook
(L-R2-2/L-R2-3). Not BLOCK: fail-closed, nothing commits, production cannot reach it before
Task 5.

### ⚠️ CHANGE — C-R2-2. A test comment asserts a journal replay property that R-124 forbids; the open item asks the adapter for it

`deletion-executor.test.ts:708-711`: "The re-run below appends the same version again — a
replay the Task 5 S3 adapter must accept for an unconsumed version." It is not a replay — the
same test's own assertion twelve lines later (`:728-732`) proves the second append at that
version is `blocked`, different content, and the honest comment at `:722-727` says "the
in-memory port here accepts it, which is not evidence that S3 will". R-124: conditional create,
never overwritten, restore blocks on conflict. Two comments in one test, one false — CLAUDE.md
lesson 2026-07-30 (assert it or delete the claim): delete `:708-711`. In the same change, reword
T4-R1 (`respin-finish-open-items.md:349`) and `10b1-task4-contract.md:47` from "the S3 adapter's
conflict rule must accept or supersede that orphan" to what the probe above establishes: the
adapter *cannot* under R-124, so Task 5 owns a version-accounting change in the executor/lifecycle
(journal the rollback as a transition so the orphan is a recorded version, or defer the
`verifying` append until the probes pass) — and until then a residue-blocked operation is stuck
in production, not resumable.

### 💡 NOTE — C-R2-3. The RESTRICT-into-root closure rule has no planted negative

`creator-data-registry.ts:905-925` adds the failure string "restrict foreign key into scope root
has no erasure coverage under that scope". `lifecycle-registry.test.ts` has fourteen
`toThrow(/…/)` negatives (`:102-208`); none matches this string — the rule is proven only by not
firing on the current registry (15/15 green). CLAUDE.md lesson 2026-08-26. One negative: remove
the snapshot `workspace_link` entry from a copied registry and expect the throw. This belongs to
the tenancy gate; flagged here for `tenancy-task4-r2`.

### 💡 NOTE — C-R2-4. Resume does not re-check the financial-chain gate

`handleGrace` (`:386-391`) refuses workspace erasure while `unretainedFinancialChainTables()` is
non-empty; `handleErasing` and `handleBlocked` do not. The list is a compile-time registry fact
and the `workspace` token is refused at startup, so no live path reaches `erasing` past the
gate — the tests reach it only by calling `transitionDeletionOperation` by hand (`:449, :762`).
Consistent with the runbook's wording ("re-read at grace"). Optional: mirror it at `:557` for
symmetry with enablement.

### 💡 NOTE — C-R2-5. `columnsOf` in the scrub test duplicates the registry's `fieldSetColumns`

`lifecycle-scrub-rules.test.ts:11-17` re-implements `remaining_columns` expansion that
`validateLifecycleClosure` also implements (`creator-data-registry.ts:911-917`). If either
changes, the walk silently covers a different set. Export one and use it in both.

### 💡 NOTE — C-R2-6. Witness gaps carried from S-R2-2

C8 and C9 have no tests (see the compliance report); the C4 inside-margin admission likewise.

## Security pass (OWASP-oriented, on the fix-pass diff)

- **Injection**: the new `CANCELLATION_REVERSAL_DUE` (`deletion-executor.ts:106-121`) binds
  `DELETION_EXECUTOR_MAX_COMMAND_ATTEMPTS` as a parameter and references tables through drizzle
  objects; the probe's JSON-path renderer binds the path as a parameter
  (`lifecycle-sql-port.ts:701`) and `inList` binds every id (`:120-122`); `scrubRuleFor` adds no
  interpolation. Clean.
- **Auth/authz**: no new endpoint; the worker-only executor is unchanged in reach.
- **Secrets**: none stored or logged; the Resend key stays in the adapter closure.
- **Sensitive data**: the S-R2-1 residual is a *claim* gap, not a new exposure; the email was
  already in the payload column and the row class is unchanged.
- **External calls**: still one pinned origin, `redirect: "error"`, 15 s abort.
- **Dependencies**: no new package in the fix pass.

## Convention adherence (CLAUDE.md)

- ✅ Respin rule 7 (list, not producer) — `scrubRuleFor` + walk; `FINANCIAL_CHAIN_TABLES` is an
  explicit list (`deletion-executor.ts:135`); `EXTERNAL_COMMAND_SCOPES_BY_KIND` explicit.
- ✅ Golden rule 1 — the C2 comment now matches the installed file it names.
- ⚠️ Golden rule 1 / Lesson 2026-07-30 — the `:708-711` comment (C-R2-2) and the runbook
  transcript citation (L-R2-1) record claims their artefacts do not support.
- ⚠️ Lesson 2026-08-26 — closure rule without a planted violation (C-R2-3).
- ✅ Golden rule 6 — the contract's extended limitations and the open-items register report the
  orphan, the payload, the unwired sweep and the copy items as exactly what they are.

## Checks run

1 Correctness — ✅ C1, C4, C5 closed · ⚠️ C-R2-1 · 💡 C-R2-4 ·
2 Security — ✅ (above) ·
3 Convention — ✅ C3, C2 · ⚠️ C-R2-2, C-R2-3 ·
4 Tests — ✅ residue witness real, scrub negatives real, three cancellation witnesses real ·
💡 C-R2-3, C-R2-6 ·
5 Maintainability — 💡 C-R2-5, C15.
Brief (h) regressions: `webhooks.ts:257` spreads `AUTO_TOPUP_DISARMED_FIELDS` into the
dead-subscription reset ✅; the due predicate is exercised by the three cancellation walks on
PGlite (`deletion-executor.test.ts:897-990`) ✅; the closure rule refuses nothing else in the
current registry (`lifecycle-registry.test.ts` 15/15) ✅.

## Coverage

Read in full: `deletion-executor.ts`, `lifecycle-sql-port.ts`, `lifecycle-subjects.ts`,
`resend-mail.ts`, `lifecycle-scrub-rules.test.ts`, `resend-mail.test.ts`,
`deletion-executor.test.ts`, `worker/tests/deletion-lifecycle.test.ts`. Read in part (the
named seams): `deletion-lifecycle.ts` (transition table, `prepareJournalPlan`,
`appendJournalTransitionInTx`, `validateWorkerTransitionInTx`, `abandonJournalPlan`,
`transitionDeletionOperation`, the cancellation authority/apply/resume functions),
`lifecycle-executors.ts` (subject types, `subjectAndPredicateFor`, supporting-store compile),
`creator-data-registry.ts` (split field sets, snapshot/stripe rows, `DYNAMIC_LIFECYCLE_WRITER`,
the closure rule, `RESTRICT_ROOT_SCOPES`, `pgBossStore`, `SUPPORTING_LIFECYCLE_STORES`),
`auth-mail.ts` (ceilings, admission bound, recovery port, sweep), `auth-mail-schema.ts`,
`create-auth.ts:410-470`, `deletion-commands.ts:70-90, 145, 222`,
`deletion-external-commands.ts:40-120, 228-262`, `billing-errors.ts:1032-1050`,
`webhooks.ts:16-20, 254-258`, `worker/deletion-lifecycle.ts:28-75`, `env.example`,
`lifecycle-registry.test.ts` (test list), `auth-mail.test.ts` (test list, `:210, :298`),
`deletion-ports.ts:55-160`, the runbook Status paragraph and deletion section, the round-1
report, contract, manifest, ledger `:2039-2051`, open items `:345-356`, plan C1–C3, R-118/
R-119/R-122/R-124, and `node_modules/better-auth/dist/{api/routes/password.mjs,context/create-context.mjs}`.
Not read: `lifecycle-probes.ts`, migrations 0050–0052 (unchanged since round 1),
`packages/credits/tests/deletion-commands.test.ts`, `auth-mail-wiring.test.ts`.

Commands run (from `respin/`, `TEMP`/`TMP` at `respin/.tmp`):

```
pnpm typecheck                                                        → exit 0
pnpm lint                                                             → exit 0
pnpm exec vitest run packages/db/tests/deletion-executor.test.ts \
  packages/db/tests/lifecycle-scrub-rules.test.ts packages/db/tests/lifecycle-registry.test.ts \
  packages/db/tests/auth-mail.test.ts packages/auth/tests/resend-mail.test.ts \
  worker/tests/deletion-lifecycle.test.ts packages/db/tests/deletion-external-commands.test.ts
                                                                      → 7 files / 66 tests passed, exit 0
node -e "require('./node_modules/better-auth/package.json').version"  → 1.6.28
grep -c <each runbook code> packages/db/src/deletion-executor.ts      → all present (see L1)
git diff HEAD --stat -- docs/progress/respin-finish/ledger.md         → +299 / −0
tail docs/progress/respin-finish/entry-gate-task4-r2-{pglite,docker,build}.txt  (twice; see L-R2-1)
```

Not run: the full canonical `pnpm test` (the author's r2 run was in progress; its first attempt
ended `exit=1` on a vitest-worker RPC timeout with all 4,599 tests passing), `pnpm build` (r2
transcript ends `exit=0`), the docker suite (r2 transcript: 22 files / 98 tests, `exit=0`).

## Verdict

**NEEDS CHANGES** — C-R2-1 (bound the rollback-resume loop) and C-R2-2 (delete the false
replay comment; reword T4-R1 and the contract so Task 5 owns a lifecycle change, not an adapter
rule). Movement from round 1: **Not yet → Almost**.

## Grade

**B** (round 1: B−)

---

## Summary of the three verdicts

| Critical path | Round 1 | Round 2 | Grade |
|---|---|---|---|
| Respin spin compliance (lean) | NEEDS CHANGES · B | **NEEDS CHANGES** | B+ |
| Respin learning honesty (lean) | NEEDS CHANGES · A− | **NEEDS CHANGES** | B+ |
| Code / security / state machine (lean) | BLOCK · B− | **NEEDS CHANGES** | B |

**Round-1 items:** C1, C2, C3, C4, C5, C8–C13, S1, S2, S3, L1, L2, L8 — CLOSED with witnesses
named above. C15 — STILL OPEN (NOTE, never claimed fixed). C6, C7, C14, S4–S8, L3–L7 —
re-checked, still hold.

**Must close before this task is Ready:**

1. **C-R2-1** — bound the erase → rollback → resume loop and count its failures; test the
   second residue; runbook line to match (closes L-R2-3).
2. **C-R2-2** — delete `deletion-executor.test.ts:708-711`; reword T4-R1 and
   `10b1-task4-contract.md:47` so Task 5's scope includes the executor/lifecycle version
   accounting and states that a residue-blocked operation is not resumable in production until
   then.
3. **S-R2-1** — extend the payload-residue limitation and T4-R3 to identity erasure; correct
   `deletion-executor.test.ts:503-505`.
4. **L-R2-1** — cite the round-2 pglite transcript only after re-reading its finished tail; a
   transcript ending `exit=1` is recorded as such, with the RPC-timeout cause, or re-run to
   green.
5. **L-R2-2** — the runbook's "resumes on the next tick and is retried" must name its
   condition (in-memory port / after Task 5) and the bound from item 1.

**Optional before Ready:** S-R2-2 / C-R2-6 (C8, C9, C4-margin witnesses), C-R2-3 (closure-rule
planted negative — for the tenancy gate), C-R2-4, C-R2-5, C15.

**Must close before `RESPIN_DELETION_ERASURE_SCOPES` names `identity` in any environment:**
S-R2-1's control (Task 6's payload purge or plan C3's billing-contact binding) — in addition to
Task 5 for the journal.

Reviewed read-only. Nothing in the tree was modified; this report is the only file written.
