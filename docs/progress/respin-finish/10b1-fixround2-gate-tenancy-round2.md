# Respin brain tenancy review — Phase 10b-1 fix round 2 (round 2 of this gate, 2026-09-09)

*Report returned by `respin-tenancy-reviewer`; saved verbatim by the build lane. Both budgeted rounds of this gate are now spent; the three CHANGEs were fixed afterwards without re-review and are listed as such on the ledger.*

**Readiness: Almost · Grade: C · The replayable-key BLOCK is genuinely closed and every witness I ran is green, but the profile-key migration turns two existing suites red, and the retention fix replaced one false claim with another that a zero-row UPDATE cannot see.**

Counts: 0 BLOCK, 3 CHANGE, 2 NOTE. Round 1 was 1 BLOCK / 3 CHANGE / 2 NOTE.

**Scope**: the round-2 fixes against the round-1 report, all uncommitted on `respin-m1-billing-credits`. Only Respin code was touched.

## Movement on round-1 findings

| Round 1 | Movement | Evidence |
|---|---|---|
| BLOCK — replayable handover key | **Closed.** | `billing-contact.ts` keys `customer:outgoing:acceptor:emailDigest:randomUUID()`. Safe for SDK retries: stripe-node 22.5.0 builds headers once per request and a caller-supplied key overrides the generated one (`RequestSender.js:211-238, 264`), so automatic network retries of one call reuse the nonce and a later handover is always a new request. Key ≈165 chars. Witness `billing-contact.test.ts` — 4 calls, 4 distinct keys, `cache.size === 4` — green; deterministic. |
| CHANGE 2 — rights-scope tie unwitnessed, no profile tie | **Closed as asked, but the fix reddens two suites** (new CHANGE 1). | Migration 0057 adds `trend_items_id_profile_uq` then three `(trend_item_id, profile_id)` FKs; registry entries present; `trend-rights-keys.test.ts` 3/3 green including refusal by constraint name; `db:check` fine; `lifecycle-registry.test.ts` 18/18. Every live producer in `trends-storage.ts` selects the item by `profile.profileId` before inserting and `system-spend.ts` copies `profileId` from the claim, so no production path is refused. |
| CHANGE 3 — false citation on the `recovery_secret` reasons | **Half closed.** Half one real (23514 on the real rows); half two vacuous and its claim false (new CHANGE 2). | |
| CHANGE 4 — `billing_contact_unknown` population understated | **Closed**, with a new problem in the remedy text (new CHANGE 3). | Comment states every member; viewer refusal witnessed; register re-rated. |
| NOTE — executor re-check comment | **Closed.** | The argument holds: sole inserter sets the contact; SET NULL needs a contact's `users` row deleted, which this rule refuses. |
| NOTE — `pendingDeletionsForScope` visibility | **Closed.** | |
| (added) `page.tsx` `NOTICE_COPY` lookup | Fine. | `Object.hasOwn`. |

## Findings

- ⚠️ CHANGE `respin/packages/db/tests/trends-storage.test.ts:518-529` and `respin/packages/db/tests/pasted-reference.test.ts:468-479` — Migration 0057 makes both tests red: each plants a mis-parented row to prove the *readers* refuse it, and the database now refuses the plant with 23503 on a `_trend_item_profile_fk`. The key doing its job, but the change shipped with a red entry gate and the round's summary did not say so. · Fix: rewrite both as refused-write witnesses (assert the constraint by name) and keep the reachable reader assertions. **Fixed after this round without re-review** (the third full gate is the proof).
- ⚠️ CHANGE `respin/packages/db/src/retention-clocks.ts` (both non-identity `recovery_secret` `why` strings) and `retention-sweep-fixtures.test.ts:424-437` — The `why` said the measure is "kept in the LEGAL shape" and the suite "asserts … this measure's UPDATE is legal". Both false: the live CHECK requires `recovery_consumed_at IS NULL` for every non-identity scope and the effect set `recovery_consumed_at = COALESCE(…, now())`; the constraint evaluated legal before that UPDATE and illegal after it. The witness could not see this because its UPDATE carried `AND FALSE`. · Fix: an effect the CHECK admits and a witness that runs the UPDATE on a real row. **Fixed after this round without re-review:** the two measures now redact digest and prefix only; the witness runs the real UPDATE on the real workspace and profile operations and asserts the identity stamp is refused on them (T-R2-8).
- ⚠️ CHANGE `docs/progress/respin-finish-open-items.md` T-R2-5 — the "operator remedy" documented a raw `UPDATE subscriptions SET billing_contact_user_id = …`, which moves the binding *without* the provider write and verification that C3 rests on — the round's BLOCK reopened as a runbook line. · Fix: primary remedy is an owner accepting on `/settings/account`; a raw UPDATE only for a workspace with no active owner, after clearing the personal-field class on the Stripe customer object. **Fixed after this round.**
- 💡 NOTE `billing-contact.test.ts:1-5` — header still claimed ORDER. **Fixed.**
- 💡 NOTE `billing-contact.test.ts:177-182` — the "replay" tail used a fresh echoing fake, re-proving the stale-object case rather than replay; the replay property is carried by `cache.size === 4`. **Comment corrected to say what it proves.**

## Checks run

- T1 — ✅ holds; the profile key strengthens it structurally. T2 — n/a. T3 / REQ-B02 — n/a. T4 — ✅ schema/registry, ✅ provider level in code (BLOCK closed), ❌ runbook level (CHANGE 3, fixed after). T5 — ✅ (accept owner-only; viewer refusal witnessed). T6 — ✅ (key carries ids and a 16-hex digest, never the email; error message content-free). Provenance — ❌ at CHANGE 2 (fixed after); ✅ the round's other claims checked out.

## Coverage

- read fully: `billing-contact.ts`, `billing-contact.test.ts`, `deletion-commands.ts`, migration 0057, `trend-rights-keys.test.ts`; diffs of `trends-schema.ts`, `creator-data-registry.ts`, `retention-clocks.ts`, `deletion-executor.ts`, `page.tsx`; ranges of `deletion-lifecycle.ts`, `deletion-lifecycle.test.ts`, `retention-sweep-fixtures.test.ts`, `system-spend.ts`, migration 0043's `recovery_shape` CHECK, stripe-node `RequestSender.js`; the register's 2026-09-09 section · skimmed: `trends-storage.ts`, `account-view.tsx` · not run: the Docker suites.
- commands run: `vitest run billing-contact trend-rights-keys retention-sweep-fixtures` → 18/18; `vitest run deletion-lifecycle -t "UNKNOWN contact|Plan C3"` → 3/3; `vitest run lifecycle-registry retention-clocks` → 31/31; `pnpm db:check` fine; regression run of every suite inserting into the three tables → 2 failed, 322 passed (the CHANGE 1 pair); a scratchpad probe evaluating the live `deletion_operations_recovery_shape` definition against a workspace row before/after the measure's UPDATE → `legal = true | after = false`; `git status --short respin/`.

## Verdict

NEEDS CHANGES
The BLOCK is closed by code, witness and SDK source; what remains is one red gate the migration caused, one re-introduced false claim under a zero-row witness, and one runbook line that bypasses the verification the fix just built — all fixable in one pass with no tenancy leak left open in code.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
