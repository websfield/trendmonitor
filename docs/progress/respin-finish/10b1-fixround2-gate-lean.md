# Phase 10b-1 — fix round 2 — lean merged gate (compliance / security / code review)

Date: 2026-09-09. Reviewer: lean merged run (three lenses, one verdict each). Read-only.
Scope: the uncommitted working tree on `respin-m1-billing-credits` at HEAD d5fbaf7, restricted to the files the round names (register entry "Added 2026-09-09 — Phase 10b-1 phase-review fix round 2" in `docs/progress/respin-finish-open-items.md`).

Verdict summary

| Lens | Readiness | Verdict |
|---|---|---|
| 1. Respin spin & source compliance | Ready | PASS |
| 2. Security | Almost | NEEDS CHANGES (one MEDIUM) |
| 3. Code review (consolidating) | Almost | NEEDS CHANGES (the same defect, plus LOWs) |

The one change that must land before this round closes is S-1 / R-1 below: the billing-contact handover's Stripe idempotency key does not vary with the contact being replaced, so an A -> B -> A handover inside Stripe's 24-hour replay window verifies a *cached* customer object and moves the binding while the provider record still carries B's email — the exact leak the provider-first order exists to prevent. One-line fix plus one witness.

Author's least-confident line, probed first. The by-USER rule is the right shape and is proven, not argued: `deletion-lifecycle.test.ts` "matches the binding by USER, not by membership" (a contact who left the workspace is still refused; an unknown contact on a workspace the person does not belong to is not their problem). NULL-as-unknown is refused at request on all six sites through `assertWorkspacesReleasable` and the page says so (`BILLING_CONTACT_UNKNOWN_COPY`). The consequence the author names — every pre-C3 workspace refuses every owner until one accepts — is real, documented (T-R2-5), and has a self-service remedy for any owner who is not the deleting person (`canAcceptContact = isOwner && hasCustomer && !isCurrentUser`). The genuinely operator-only case (all owners gone) is correctly recorded as open. I found no defect in that rule; the defect is in the handover that lifts it (S-1).

---

## Lens 1 — Respin spin & source compliance

**Readiness: Ready.**

Scope. Nothing under `packages/trends`, the autopsy pipeline, Spin, the similarity gate or the kill test changed (`git status`: no file there is modified). What this round touches on the compliance path is (a) the database's rights-scope tie for autopsy rows and (b) new user-facing sentences on `/settings/account`.

### Checks

1. **Sources allowlist (S1).** No adapter added or changed; no new dependency in any manifest. Not exercised by this diff. PASS.
2. **Similarity gate before display (S2).** Untouched. Not exercised.
3. **Minimum-difference rule (S2).** Untouched. Not exercised.
4. **Kill test honesty (S3).** Untouched. Not exercised.
5. **No invented specifics (S4).** Untouched. Not exercised.
6. **No guarantees (S4, REQ-I04).** `grep -inE "guarantee|will (grow|perform|convert)|viral|promise"` over `app/(product)/settings/account/copy.ts` and `refusal-code.ts`: no hits. Every new sentence describes shipped behaviour and is pinned: `BILLING_CONTACT_COPY` "before anything changes here" is asserted against the provider-first order (`account-copy.test.ts`), `REQUESTS_CLOSED_COPY` "can still be cancelled" against the ungated cancel facades (`import-boundary.test.ts`), `RETAINED_COPY` now enumerates every `EXTERNAL_COPIES` holder rather than a hand-picked two. PASS.
7. **No automation, no concealment (S5).** The only new provider interaction is `customers.update` on the workspace's own Stripe customer, initiated by an owner with password proof. No posting, no engagement, no platform accounts. PASS.
8. **Autopsy caching and honesty (S6).** This is the live question. Migration 0056 adds `trend_items_id_rights_scope_uq` and composite `(trend_item_id, rights_scope)` FKs on `autopsies`, `autopsy_cache_claims` and `trend_transcripts` (the class, not one table). Effect: a cached autopsy or claim can no longer carry a rights scope its item does not have, so the "one autopsy per trend item, cached" invariant is now also "one autopsy per item *under that item's scope*". The producers in `packages/db/src/trends-storage.ts` already select the item by scope (lines 291, 370, 484, 603-686, 904, 937, 1021), so no producer regresses; the database refuses the disagreement instead of trusting the caller. PASS.

### Findings

- **C-1 (LOW, witness gap, not a behaviour defect)** — `respin/packages/db/tests/deletion-executor.test.ts:277-303` seeds `creator_consent` rows for `autopsies`, `autopsy_cache_claims` and `frameworks` with **only the owner** as `rights_subject_user_id`. The identity case at :778-792 then asserts the `creator_consent` class is absent after the owner's erasure. That is consistent with "consent-only rows whose subject is the identity go" but cannot distinguish it from "all consent rows go": a consent row whose subject is the *survivor* is not seeded, so its survival is not witnessed. The property is structural today (`autopsies_rights_subject_user_id_users_id_fk` cascades only the deleted user's rows — registry role `identity_subject`), so this is coverage, not a defect. Add one consent row with `rightsSubjectUserId: survivor.user.id` to the fixture and assert it stays in the identity case.

### Coverage
- Ran: `pnpm exec vitest run packages/db/tests/deletion-executor.test.ts` — 19/19 green, including the three rights-class cases (workspace, identity, profile) and "C3 at the LAST moment".
- Ran: `packages/db/tests/lifecycle-registry.test.ts` (in group A) — the classified FK list, now carrying the three composite keys, matches migration 0056's physical FKs bidirectionally.

### Verdict: PASS.

---

## Lens 2 — Security

**Readiness: Almost.**

### Findings

- **S-1 (MEDIUM) — handover idempotency key replays a stale provider object.** `respin/packages/credits/src/stripe/billing-contact.ts:125-129`: the key is `billing-contact:${stripeCustomerId}:${scope.userId}:${sha256(email).slice(0,16)}`. It varies with the *acceptor* only. Stripe stores the first response for a key and returns it for any later request with the same key and identical parameters for at least 24 hours (Stripe idempotent-requests documentation; parameters here are byte-identical: the same blank personal fields and the same acceptor email). Sequence: owner A accepts (key K_A, provider now carries A's email); owner B accepts (key K_B, provider carries B's email); A accepts again within 24 h (key K_A again). Stripe replays the first response — an object showing A's email and cleared fields — **without writing**. Line 138's check (`updated.email !== email || !customerPersonalFieldsClear(updated)`) passes on the replayed object, and line 143 moves the binding to A. State after: database says A is the contact; the Stripe customer carries **B's** email. `assertBillingContactReleased` now admits B's identity deletion (B is not bound), the executor's last-moment re-check admits it too, and B is erased with their email on a provider object — precisely the leak the provider-first order (file header, lines 5-12) exists to forbid. The verification "on the object the provider returned, never assumed from a 200" (line 137) is defeated because the returned object is cached. Remedy: make the key vary with the handover, not just the acceptor — include the outgoing contact (`row.billingContactUserId ?? "unknown"`) in the key, or a per-call nonce (the workspace money lock already serialises callers, and `customers.update` with identical params is naturally idempotent, so a nonce loses nothing). Add a witness in `billing-contact.test.ts`: a fake `customers.update` that caches by `idempotencyKey` and replays; run A -> B -> A and assert the third call's key differs from the first (or that the provider object actually shows A's email after the third call).

- **S-2 (LOW, pre-existing, in a touched file)** — `respin/app/(product)/settings/account/page.tsx` (`notice={ok ? (NOTICE_COPY[ok] ?? null) : null}`; present at HEAD line 73 too): `NOTICE_COPY` is a plain object, so `?ok=constructor` / `?ok=toString` resolves to a prototype function (`node -e` confirmed: `typeof m['constructor'] === 'function'`), which is handed to `AccountView` as a string prop and rendered as a child — React throws "Functions are not valid as a React child", i.e. a 500 from a crafted URL. No data exposure; availability only, self-inflicted per request. Use `Object.hasOwn(NOTICE_COPY, ok)` or the same closed-list guard the `?e=` path now has (`isErrorCode`).

- **S-3 (INFO) — `?e=` codes carry no identifiers.** `page.tsx` validates `search.e` against `ACCOUNT_ERROR_CODES` (`isErrorCode`) before lookup; `refusal-code.ts` maps every lifecycle message to a fixed code and everything unrecognised to `unknown`. `BillingContactProviderError`'s message carries only `code` (a Stripe `error.code`/`error.type` token or `provider_unreachable`), never the email (`billing-contact.ts:45-49`). Nothing user-controlled or personal reaches the URL.

- **S-4 (INFO) — `acceptBillingContactAction` authorisation.** `actions.ts:100-111`: `requireUser()` -> `respinDb.withWorkspace({ authUserId })` (the caller's own scope, not a client-supplied id) -> password reauth -> `acceptBillingContact(scope, user.email, authority)`. The package re-checks: `assertScoped`, `role === "owner"` pre-tx (`billing-contact.ts:97`), then `assertReauthenticatedWorkspaceScopeInTx` re-proves role and freshness inside the transaction (:103-112), `takeWorkspaceLock` (:114). The email written to Stripe is the session user's, the same source `settings/billing/actions.ts:108,127` uses for checkout. Cross-workspace: `isolation.test.ts` "acceptBillingContact on A rewrites A's customer and A's binding only" green. The idempotency key digests the email rather than embedding it. Correct, apart from S-1.

- **S-5 (INFO) — `RESPIN_DELETION_REQUEST_SCOPES` cannot be bypassed from the app.** The only callers of the three request facades are the two account server actions (`grep` over `app/`, `worker/`, `lib/`, `packages/*/src`); each facade asserts its own scope (`app-server.ts`), an unknown token throws a plain `Error` (no `deletion_refused:` prefix -> rendered as `unknown`, nothing enabled). Cancellation (`cancelScopedDeletion`, `cancelIdentityDeletion`) and the recovery-link resume path assert nothing, so an in-flight operation stays cancellable after rollback. Behavioural witness `deletion-request-enablement.test.ts` (3/3) plus the source witness in `import-boundary.test.ts`.

- **S-6 (INFO) — raw SQL in `retention-sweep-fixtures.test.ts`.** `backdate()` (:352-377) and `count()` (:379-382) build identifiers only through `sql.identifier(...)` from registry constants (`spec.measure.table`, `measuredFrom`, `LIFECYCLE_COLUMN_CENSUS`) and pass values as parameters; the one literal identifier is `"activation_cohort_daily"`. Test-only; no data-derived interpolation.

- **S-7 (INFO) — executor re-check passes `[]`.** `deletion-executor.ts` `assertBillingContactReleased(tx, operation.userId, [])` re-asserts the by-USER binding at erasure but not the `billing_contact_unknown` class. Safe today: a NULL contact can only exist on a pre-C3 row (refused at request) or be produced by `ON DELETE SET NULL` when the contact's own user row goes, which cannot happen while they are the contact. Worth one sentence in the executor comment so a future writer of `subscriptions` does not reopen it.

### Checks
1. AuthN/AuthZ — S-4, S-5: PASS.
2. Injection — S-6, and Drizzle-built queries throughout: PASS.
3. Secrets — none in the diff; `price-snapshot.ap-southeast-2.json` carries public prices only: PASS.
4. Sensitive data — the handover writes an email to Stripe by design; the message/URL/log path is content-free (S-3): PASS with S-1 as the exception on the *removal* side.
5. External calls — one Stripe write, verified on the returned object; idempotency defeats the verification in the replay case: **S-1**.
6. Dependencies — none added.

### Verdict: NEEDS CHANGES (S-1). No CRITICAL/HIGH.

---

## Lens 3 — Code review (consolidating)

**Readiness: Almost.**

### Findings

- **R-1 (CHANGE) — same defect as S-1.** `respin/packages/credits/src/stripe/billing-contact.ts:125-129`. Correctness: the post-write verification at :138 is only meaningful if the write happened; with a key that repeats across handovers it verifies a replay. Fix the key and add the replaying-fake witness described in S-1.

- **R-2 (LOW) — the personal-field LIST and its verifier are two hand-maintained artefacts.** `deletion-commands.ts:117-124` (`CUSTOMER_PERSONAL_FIELDS_CLEARED`, the rule-7 list) and :132-135 (`customerPersonalFieldsClear`, which re-enumerates `name/phone/description/address/shipping` by hand). A field added to the list is written blank but not checked on the returned object. Derive the predicate from `Object.keys(CUSTOMER_PERSONAL_FIELDS_CLEARED)` (excluding `email`) so the two cannot disagree — the comment on the list promises exactly that they cannot.

- **R-3 (LOW) — `import-boundary.test.ts:1994-2001` `body(from, to)` uses `indexOf` without checking for -1.** If `to` is ever renamed, `slice(i, -1)` returns nearly the whole file and `not.toContain` passes vacuously; if `from` is missing the slice is empty and `length > 0` catches only that half. Throw on a missing anchor.

- **R-4 (LOW, pre-existing)** — S-2, the `?ok=` prototype lookup in `page.tsx`.

- **R-5 (INFO) — rule 7 (a derived guard's population is a LIST).** `LIFECYCLE_FOREIGN_KEY_EDGES` (`creator-data-registry.ts:894-900`) is derived from `FINAL_SCHEMA_FOREIGN_KEYS` (:723), which is hand-classified — acceptable because `validateLifecycleClosure` (:1029-1052) compares that list **bidirectionally** against the migration snapshot's physical FKs (`classified ... is missing` / `unclassified final-schema foreign key`), so a physical edge cannot exist without a list edit; `lifecycle-registry.test.ts` green with 0056's three composite keys and the `subscriptions` set-null key present. `FIXTURES` is asserted in bijection with `retentionSweepSpecs()` (`retention-sweep-fixtures.test.ts:387-389`). `CUSTOMER_PERSONAL_FIELDS_CLEARED` is a list with two consumers (R-2 notes the verifier). `ACCOUNT_ERROR_CODES` is a list, every code pinned to a sentence. `PENDING_DELETION_STATES` is a list owned by the lifecycle module. Compliant.

- **R-6 (INFO) — tests, answering the four named questions.**
  - `orderChildrenFirst` regression witness: `retention-clocks.test.ts:141-166` asserts, for every swept FK edge, `lastOf(child) < firstOf(parent)`, then asserts key order alone put `deletion_recovery_sessions` after `deletion_operations` and the produced order reverses it. A regression to alphabetical goes red at :161-163. Non-vacuity guarded by `checked > 0`. Ran green.
  - One-tick fixture: "at least one row BEFORE" (:411-415) counts the *table*, not the row class — but the one-tick case (:430-437) asserts per **spec key** `outcome.deleted > 0` / `outcome.redacted > 0`, so a spec whose class has no rows cannot pass silently. 29 specs, 25 producible, 4 `unproducible` with asserted reasons; `failures: []`, `poisoned: 0`, second tick a no-op. Ran green (6/6).
  - Executor race: `deletion-executor.docker.test.ts:42-71,118-148` arms the journal hold *for the worker's append* (`holdNext()` after the request's own version-1 append), awaits `held`, then runs w2..w4 to completion before `release()`. `claimLease(db, ...)` (`deletion-executor.ts:869`) commits in its own transaction before the transition that appends, so w1's lease is live and committed while the others run: the overlap is forced, not hoped for. Docker-only; not run here (PGlite); reasoning from source.
  - Forecast CLI: `journal-forecast-cli.test.ts:111-177` injects a priced sheet through `main`'s new `snapshots` parameter and exercises exit 0 ALLOWED, exit 0 with ALERT, exit 2 BLOCKED, and the raised owner ceiling — all through `main`. The "a ceiling of 1 cent changes nothing" assertion (:170-173) is vacuous in the CLI (1000 bytes is under one cent with or without the clamp); the clamp itself is witnessed in `deletion-journal.test.ts:837`. Ran green.

- **R-7 (INFO) — `accountErrorCodeOf`** reads the `deletion_refused:` prefix first and falls back to `err.code`; `requests_disabled:<scope>` maps by prefix; `invalid_transition*` / `erasure_started` to `not_cancellable`. Every `ACCOUNT_ERROR_CODES` entry has copy (asserted). The identity-scope "Cancel" button is now hidden (`isCancellable`), so the `operation_not_available` refusal that used to render as "unknown" is unreachable from the page.

- **R-8 (INFO) — migration 0056** adds the composite FKs to existing rows; a pre-existing disagreeing row would fail the migration loudly rather than silently. No production data exists, so this is a note for the operator runbook, not a defect. The UNIQUE precedes the FKs in the file, as the register says.

- **R-9 (INFO) — `assertWorkspacesReleasable`** is called on all six identity sites the register names (`finalizeIdentityDeletionRequest`, `reserveIdentityDeletionRequest`, `requestIdentityDeletion` x2, `resumeIdentityDeletionRequest` x2). Id spaces agree: `subscriptions.billing_contact_user_id -> users.id`, `deletion_operations.user_id -> users.id`, `WorkspaceScope.userId` is the domain `VerifiedUserId`.

### Convention adherence (CLAUDE.md rules this diff touches)
- Respin rule 2 (ledger append-only, webhooks idempotent) — not touched. Rule 5 (no leakage) — the cage is asserted first in `pendingDeletionsForScope` and `billingContactStatus` (`profile-cage.test.ts` lists both), and `isolation.test.ts` proves A/B separation for the handover. Rule 7 — R-5. Golden rule 1 — the register's claims I checked against the files are accurate (six sites, bijection, the composite keys on three tables, the receiver ordering). Lessons 2026-07-30 ("a comment claiming a property is not the property") — `billing-contact.ts` header claims "the order is the point"; the order is tested; the replay case (R-1) is the one path where the claim and the code part.

### Verdict: NEEDS CHANGES (R-1; R-2/R-3/R-4 optional in the same pass).

---

## Commands run (all from `respin/`)

- `git status --short`, `git diff --stat`, `git diff <each file in scope>`
- `pnpm exec vitest run packages/credits/tests/billing-contact.test.ts packages/db/tests/deletion-request-enablement.test.ts packages/db/tests/retention-clocks.test.ts tests/journal-forecast-cli.test.ts tests/account-copy.test.ts tests/import-boundary.test.ts packages/db/tests/lifecycle-registry.test.ts tests/profile-cage.test.ts tests/table-writers.test.ts packages/credits/tests/isolation.test.ts` — 10 files, 318/318 passed
- `pnpm exec vitest run packages/db/tests/deletion-executor.test.ts packages/db/tests/retention-sweep-fixtures.test.ts packages/db/tests/deletion-lifecycle.test.ts packages/db/tests/retention-receiver.test.ts` — 4 files, 90/90 passed
- `pnpm exec vitest run tests/facade-errors.test.ts` — passed
- `node -e "const m={a:'x'}; console.log(typeof m['constructor'])"` — `function` (S-2)
- `grep` probes: request-facade callers, `insert(subscriptions)` writers, guarantee language in new copy, `rightsScope` producers in `trends-storage.ts`, `ownerCostCeilingCents` witnesses
- Not run: `deletion-executor.docker.test.ts` (needs live Postgres); the entry gate (the author's `entry-gate-10b1-round2-final.txt` ends `GATE_EXIT=0`)
- No mutation planted: the R-1 replay could not be reproduced without editing a tracked test file; the finding is reasoned from Stripe's documented idempotency semantics and the key's construction at `billing-contact.ts:125-129`.
