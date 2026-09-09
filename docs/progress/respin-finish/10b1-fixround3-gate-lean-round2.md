# Phase 10b-1 — fix round 3, LEAN merged gate, ROUND 2 (learning honesty · security · consolidating code review)

*2026-09-09 · build lane · read-only · Claude Fable 5.1 (`claude-fable-5-1`). Scoped to the round-1 findings in `10b1-fixround3-gate-lean.md` (and the converging billing/tenancy reports): movement per finding, then a hunt for defects the fixes introduced. Tree: uncommitted working copy on `respin-m1-billing-credits` over `d5fbaf7`.*

**The bytes this round judged.** `auth-mail.ts`, `auth-mail.test.ts` and `auth-mail-quota.docker.test.ts` were rewritten by the build lane at 04:02:02 *while this round was running* (the compiled invite ceiling moved from `60 − reserve` at the check site to a compiled `50`; the Docker fixture moved from `30/10` to `40/10`). Every auth-mail claim below was re-read and re-executed on the post-04:02 bytes; the earlier red Docker run is recorded under "Commands" as history, not as a finding. Checksums (md5) of the reviewed files: `activation.ts a676095d…`, `retention-receiver.ts 8b8a036e…`, `auth-mail.ts 18f04a4f…`, `deletion-lifecycle.test.ts 6eb4f230…`, `retention-receiver.test.ts 5b2a23b0…`, `auth-mail.test.ts 31ec4717…`, `auth-mail-quota.docker.test.ts aea3e6bb…`, `lifecycle-registry.test.ts 23f6ea05…`, `worker/tests/retention-alerts.test.ts c1e9fc6d…` (untracked, new), `backup.sh 9d351bec…`, `restore-drill.sh 465449e4…`.

## Readiness headlines

| Lens | Verdict | Headline |
|---|---|---|
| Respin learning honesty | **PASS** | L-1 is closed by the operation-state filter and the closure is **executed**, not argued: the committed cancel → re-request witness is green; a probe of the expired-recovery **abandonment** path (cancelled, never tombstoned, then a fresh request) counts 2 / 2 / 2; the same probe against `activation.ts` with only the new `notInArray` line removed counts **3** — so the filter is exactly what carries both paths. |
| Security | **PASS** (1 LOW) | S-1 is closed at the compiled level (`invitesPerDay` 50 / 1,500): the derived reserve is now 30 / 900 = recovery 10 + reset 10 + verification headroom 10, no admissible tighten-only override can drive any ceiling negative or below 10 / 300 of invite-proof verification headroom, and both the PGlite witness (19/19) and the **Docker concurrency suite (1/1, live)** are green on the current bytes. `decisions.md` R-118 still states 60 / 1,800 — one superseding line is owed (S-2, LOW). |
| Consolidating code review | **PASS** (3 LOW, 3 INFO) | R-1 closed (as L-1). R-2: the source-level pin is **accepted** — it goes red on the round-1 two-transaction mutant, on a predicate-dropped mutant and on an `async`-arrow two-transaction mutant (executed), so the reproduced defect can no longer ship green; one of its three per-row regexes is fitted narrower than the real old shape and rides on the count (R-3, LOW). R-4 (claim failure ≠ poisoned) closed and correct. R-5 widened; four ordinary shapes still evade, as the test's own title now admits (R-4 below, LOW). |

## Commands run

```
pnpm -C respin exec vitest run packages/db/tests/deletion-lifecycle.test.ts packages/db/tests/retention-receiver.test.ts packages/db/tests/auth-mail.test.ts packages/db/tests/lifecycle-registry.test.ts packages/db/tests/activation.test.ts worker/tests/retention-alerts.test.ts
  → 6 files / 138 tests / 0 failed (145.7 s)  [pre-04:02 auth-mail bytes]
pnpm -C respin typecheck
  → every package Done (the closure-assigned `ref` narrowing in the per-row catch typechecks)
TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin exec vitest run packages/db/tests/auth-mail-quota.docker.test.ts
  → 1st run (03:58, fixture 30/10, check site `invitesPerDay − reserve`): FAILED — refusal set held `invite_quota_day_exhausted` while `invitesAdmitted (0) !== 10`
  → 2nd run (04:04, fixture 40/10, compiled 50): 1/1 PASSED
pnpm -C respin exec vitest run packages/db/tests/auth-mail.test.ts   [post-04:02 bytes] → 19/19
```

Scratch probes (session scratchpad `probe/`, round-1 harness reused; nothing tracked was edited):

1. `probe-abandon.test.ts` — the "journals an expired recovery reservation as cancelled" walk (`deletion-lifecycle.test.ts:934`) with `signups` asserted at every step and a fresh request appended. Result: `requested/pending → 2`, `cancelled/pending (user active) → 2`, `[tombstoned/pending, cancelled/pending] → 2`, before 2. **PASS.**
2. `probe-abandon-mutant.test.ts` — the same walk against `mutant-activation-nostate.ts` = current `activation.ts` with only the `notInArray(deletionOperations.state, ["cancelled","complete"])` line deleted. Result: `expected 3 to be 2` at "fresh request pending after an abandonment". **RED** — the state filter is the whole closure for this path.
3. `r2-regex.cjs` — the five assertions of `retention-receiver.test.ts:773-783` applied to: current source → GREEN; the round-1 old-shape mutant (`mutant-retention-receiver.ts`) → RED (`oneTx` false, `claimThenApply` false); current with `AND (${predicate})` removed from the DELETE → RED (`deletePred`); current with claim and apply in two `async (tx) =>` transactions → RED (`oneTx`). In all three mutants `noClaimOutside` stayed **true**.
4. `node -e` predicate probe — the widened `rendersDynamicTable` against: `sql.raw("DELETE FROM " + name)` MISSED; `` sql.raw(`DELETE FROM "` + name + `"`) `` MISSED; `` sql`DELETE FROM ${sql`${t}`}` `` MISSED; `MERGE INTO ${sql.identifier(t)} … WHEN MATCHED THEN DELETE` MISSED; `` sql`DELETE FROM ${t}` `` with `t` imported and no helper token in the file MISSED; `` SELECT … FOR UPDATE ${lock} `` beside `recordIncident(` CAUGHT (false positive).
5. `grep -rln "sql\.raw|sql\.identifier|relation\(|ident\("` over `respin/worker` and `respin/app` → no files (the population scan walks `packages/*/src` only; nothing outside it renders SQL today).

---

## LENS 1 — Respin learning honesty · **PASS**

Checklist items 1–7 (sole emitter, minimum n, unverified never learns, no pooling, own baseline, declared metric, approval writes) — untouched by this pass; no modified file names `promotionProposals` / `packages/brain`. Items 8–9 (two claims, number provenance) unchanged from round 1: PASS.

### Movement

- **L-1 · BLOCK → RESOLVED · `respin/packages/db/src/activation.ts:429-450`** — the pending-capture read now carries `notInArray(deletionOperations.state, ["cancelled", "complete"])` beside the scope, contribution-state and tombstone predicates, and the comment (`:429-445`) states the cancelled-keeps-pending fact, the re-request double count, and the post-erasure repoint it would have caused — a comment that now describes what the code does (Lesson 2026-07-30). State table re-walked on the current bytes:

  | Operation state | user row | capture | counted from | once? |
  |---|---|---|---|---|
  | `requested` / `journal_pending` | active | pending | live pass | yes (join needs tombstoned) |
  | `tombstoned` … `grace` / `blocked` / `erasing` | tombstoned | pending | capture | yes |
  | `verifying` → `complete` | stub | applied | aggregate | yes — apply runs at `deletion-executor.ts:579`, inside the identity-scope branch (`:558`) of the erasure transaction, before the `complete` transition at `:659`, and refuses on a missing contribution, so `complete ∧ pending` is unreachable through the executor |
  | `cancelled` (cancel path `deletion-lifecycle.ts:3363-3391`) | restored active | **pending** | live pass; capture excluded by state | yes — witnessed `deletion-lifecycle.test.ts:2506-2572` (before / pending / cancelled / **pending again**) |
  | `cancelled` (expired-recovery abandonment `deletion-lifecycle.ts:1051-1064`) | never tombstoned, active | **pending** | live pass; capture excluded by state | yes — probe 1; the same filter covers it (probe 2 shows it is the *only* thing that does) |
  | `cancelled` after a later erasure (user id repointed to the stub) | stub | pending | excluded by state; stub skipped | yes |

  The witness extension at `:2553-2572` runs the second request through the real path (new `session` row, new idempotency key), asserts a distinct operation id, and pins `signups === before`. Non-vacuity for the committed shape is by probe 2 (identical steps, mutant read → 3).

- **L-2 · PASS (recorded)** — unchanged.
- **L-3 · INFO** — unchanged.

### New findings

- **L-4 · INFO · `respin/packages/db/src/activation.ts:446`, `deletion-lifecycle.ts:800`, `deletion-lifecycle.test.ts:2578`** — the terminal set `{cancelled, complete}` is now spelled in three places (the activation read, `activeOperationForTarget`, and the enum-binding test for `PENDING_DELETION_STATES`). Each is an explicit list (Respin rule 7 satisfied); a fourth terminal state would be caught by the test at `:2578` but would have to be carried to `:446` and `:800` by hand. `inArray(deletionOperations.state, PENDING_DELETION_STATES)` at `:446` would make the enum-bound list the single authority. Not blocking.

**Verdict: PASS.**

---

## LENS 2 — Security · **PASS** (1 LOW)

Checklist items 1–6 unchanged from round 1 (no new endpoint, identifiers only via `ident(...)`, `PGPASSWORD` lifted once, no new dependency).

### Movement

- **S-1 · MEDIUM → RESOLVED · `respin/packages/db/src/auth-mail.ts:80-95, 338-350`** (post-04:02 bytes) — the fix moved to the compiled level: `invitesPerDay: 50`, `invitesPerMonth: 1_500` (`:87-88`), so `AUTH_MAIL_SECURITY_RESERVE` derives to **30 / 900** and the invite check is the plain `inviteDay >= ceilings.invitesPerDay` (`:349`). Arithmetic on the current bytes, for every override `resolveAuthMailCeilings` admits (each value a positive safe integer ≤ compiled, `total − invites ≥ 30 / 900`):
  - verification / factor-enrollment see `total − 20`; after a full invite day they keep `total − invites − 20 ≥ 10` (month: `≥ 300`) — invite-proof headroom is never below the reset reserve's worth;
  - reset sees `total − 10`, so after verification is spent it still holds exactly 10 / 300; recovery sees the full total and holds 10 / 300 above that;
  - nothing can go negative: the smallest admissible day is `total 31, invites 1` (verification 11, reset 21, recovery 31, invites 1). The earlier `invitesPerDay − reserve` check-site form, which I read before 04:02, would have zeroed invites for any override `invitesPerDay ≤ 10` (the 03:58 Docker failure is exactly that dead zone, on the then-fixture `30/10`); that form is gone.
  - Witnesses: `auth-mail.test.ts:259-293` — 50 invites admit, the 51st refuses `invite_quota_day_exhausted`, ten verifications admit, the eleventh refuses `quota_day_exhausted`, ten resets admit, then the day is spent at `80 − 10` with the recovery floor untouched; `:295-315` the verification-flood case. Docker: `auth-mail-quota.docker.test.ts` fixture `{40, 10}` (the minimal admissible total for a 10-invite override), 40 resets + 40 invites concurrent → 30 admitted, invites ≤ 10, refusal set consistent — **1/1 live**, and this is the CI-shape suite that loud-skips without `TEST_DATABASE_URL`.
- **S-2 · LOW → unchanged** (query-form `?password=` double-decode; loud failure, not a leak). The `sslpassword` comment in both scripts now says "stripped … NOT re-supplied anywhere … fails loudly at connect" (`restore-drill.sh:101-105`, `backup.sh`), which matches `u.searchParams.delete("sslpassword")` with no `PGSSL*` re-supply — closed as a comment fix.
- **S-3 · INFO → unchanged** (argv scanner joiner before comment filter; no such line exists).
- **S-4 · PASS (recorded)** — re-derived above on the new constants.

### New findings

- **S-5 · LOW · `docs/initial/decisions.md:1604` vs `respin/packages/db/src/auth-mail.ts:76-88`** — R-118 still reads "invites are further capped at **60/day and 1,800/month** so account/security mail retains at least 20/day and 600/month". The code now caps invites at 50 / 1,500 and retains 30 / 900; the promise ("at least 20 / 600") is kept and the deviation is in the tightening direction, but the code comment cites R-118 for numbers R-118 does not state, and no superseding line exists (grep for `50/day`, `1,500`, `1_500` over `decisions.md`, the open-items register and the ledger: nothing). Conventions "docs-first" and Golden rule 1: append one R-118 supersession line (invites 50 / 1,500; derived reserve 30 / 900 = recovery + reset + verification headroom) so the decision and the constant agree. One line; not blocking.

**Verdict: PASS** — S-5 is owed in the same phase's doc sync.

---

## LENS 3 — Consolidating code review · **PASS** (3 LOW, 3 INFO)

### Movement

- **R-1 · BLOCK → RESOLVED** — as L-1 (executed).
- **R-2 · CHANGE → RESOLVED · `respin/packages/db/tests/retention-receiver.test.ts:764-784`** — the question asked was whether I accept a source-level pin for a property PGlite cannot race. **Yes, on these terms and with this evidence:** the property (claim and apply under one lock, predicate re-stated on the write) is a *shape* of the code, the test names it as such and says why a behavioural witness is impossible on one connection, and probe 3 shows the pin is not vacuous — the round-1 old shape (the exact reproduced defect), a predicate-dropped mutant and a two-`async`-transaction mutant all go RED. A Docker-suite race (an `UPDATE` on the claimed row between claim and apply) would still be the stronger witness and remains open to add; it is not required to close this finding.
- **R-3 · PASS (recorded)** — unchanged; the batch-then-recover case and the planted shapes are real.
- **R-4 · LOW → RESOLVED · `respin/packages/db/src/retention-receiver.ts:515-548`** — `ref` is per-iteration; in the catch, `ref === undefined` (the claim itself threw) sets `failureCode` and breaks the table's pass; only a write failure after a successful claim increments `poisoned` and excludes the ref. Walked: claim throws on the first row → `progressed 0` → break, one failure code, zero phantom poisoned; claim throws after N written rows → `touched = N < 500` → the batch loop ends, the failure code stands, the backlog age is still measured (`:566-570`). The per-tick bound is stated at `:543-548`. The dead `if (poisoned > 0) failureCode ??= batchCode` is gone and the comment above `void batchCode` explains why a transient batch code is not reported on its own.
- **R-5 · LOW → widened, still LOW** (see R-4 below).
- **R-6 · CHANGE → RESOLVED** — as S-1.
- **R-7 · INFO** — `retentionPoisoned` is now asserted on the tick event, `worker/tests/retention-alerts.test.ts:147-164` (ran green in the 6-file run).

### New findings

- **R-3 · LOW · `respin/packages/db/tests/retention-receiver.test.ts:778`** — the "no claim outside that transaction" regex `/await db\.transaction\(\(tx\) => claim\(/` matches only a non-`async` arrow; the shape the consolidating review actually reproduced (`await db.transaction(async (tx) => claim(tx, 1, unwritable))`) does not trip it — in all three mutants of probe 3 this assertion stayed true, and the `toHaveLength(1)` count at `:776` did the catching. Loosen it to `/await db\.transaction\((async )?\(tx\) => claim\(/` (or drop it and let the count carry, which it does) so the test does not claim a guard it lacks (Lesson 2026-07-30).
- **R-4 · LOW · `respin/packages/db/tests/lifecycle-registry.test.ts:152-160, 187-212`** — the predicate now catches all thirteen planted shapes and its title honestly says "a shape not in it is not proven caught". Probe 4 names four ordinary shapes still outside it: string concatenation into `sql.raw` (`"DELETE FROM " + name`), a nested *dynamic* tag `` ${sql`${t}`} `` (the `(?!sql\`)` exclusion was written for the static `` ${sql`"session"`} `` case and swallows this one), `MERGE … WHEN MATCHED THEN DELETE`, and a table rendered by a sibling module with no helper token in the writing file. The declared `DYNAMIC_LIFECYCLE_WRITERS` list stays the authority (rule 7); this weakens only the population witness. Also the new `ident\(` conjunct matches inside `incident(` / `resident(` — a false-positive risk only (the scan over 159 files reports exactly the two declared writers today). Title says "twelve"; thirteen are planted.
- **R-5 · LOW** — = L-4 (three spellings of the terminal-state set).
- **R-6 · INFO · `respin/packages/db/src/retention-receiver.ts:540-541`** — "`batchCode` is kept only for the log line" — there is no log line; the only use is `void batchCode`. Either log it (a content-free SQLSTATE beside the row code is useful when a transient batch error precedes a real poisoned row) or delete the variable and the sentence.
- **R-7 · INFO · `respin/packages/db/src/retention-receiver.ts:526-533`** — a commit failure *after* a successful `apply` (connection lost at COMMIT) has `ref` set, so it counts as `poisoned` and excludes the ref for the tick; the next claim then also fails and breaks with the failure code. One phantom poisoned row per such event; the row is retried next tick. Acceptable; worth a clause in the comment.
- **R-8 · INFO · `respin/packages/db/tests/lifecycle-registry.test.ts:165-185`** — the population scan walks `packages/*/src` only; `worker/` and `app/` render no SQL through any helper today (probe 5), so nothing is absorbed, but a dynamic writer added under `worker/` would be outside the witness.

**Verdict: PASS.**

---

## Coverage summary

| Area | Executed | Reasoned only |
|---|---|---|
| Activation exactly-once by state | committed cancel → re-request witness (6-file run); abandonment → fresh request (probe 1); state-filter-only mutant (probe 2) | `blocked`, `verifying → complete` ordering (from `deletion-executor.ts:558-579, 659`), post-erasure repoint |
| Receiver fallback | 6-file run; R-2 regexes vs three mutants (probe 3); typecheck of the closure-assigned `ref` | claim-failure branch walk; commit-after-apply failure (R-7) |
| Auth-mail reserves | PGlite 19/19 and Docker 1/1 on the post-04:02 bytes; the 03:58 red run on the pre-04:02 bytes | override bounds re-derived from `resolveAuthMailCeilings` on the new constants |
| Dynamic-writer predicate | lifecycle-registry run; six probe shapes (probe 4); helper grep over `worker/`, `app/` (probe 5) | — |
| Shell scripts | comment-vs-code read of the `sslpassword` handling | — |

Nothing tracked was edited; the scratch probes and mutants live only in the session scratchpad.
