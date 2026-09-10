# Respin billing & credits review — Phase 10b-1 fix round 2 (round 2 of this gate, 2026-09-09)

*Report returned by `respin-billing-reviewer`; saved verbatim by the build lane. Both budgeted rounds of this gate are now spent; the one remaining CHANGE was fixed afterwards without re-review and is listed as such on the ledger.*

**Readiness: Almost · Grade: B · All three round-1 witnesses now go red when their property breaks and the nonce fix is sound for the money path, but the same vacuous-witness shape survives on the erasure command's side of the shared predicate.**

0 BLOCK · 1 CHANGE · 3 NOTE. Round-1 movement: 3 CHANGE → 3 RESOLVED; 5 NOTE → 3 RESOLVED, 1 PARTIAL, 1 UNRESOLVED.

**Scope**: the round-2 fixes in the uncommitted working tree against HEAD d5fbaf7 — `respin/packages/credits/src/stripe/{billing-contact,deletion-commands,customers}.ts`, `respin/packages/credits/tests/{billing-contact,deletion-commands,isolation}.test.ts`, `respin/tests/journal-forecast-cli.test.ts`, `respin/scripts/journal-forecast.ts`, `respin/packages/db/src/{deletion-executor,deletion-journal-cost,billing-schema}.ts`, `respin/packages/db/tests/{deletion-executor,deletion-lifecycle}.test.ts`, migration 0057, register T-R2-5, and stripe 22.5.0's `RequestSender.js`.

## Movement on round-1 findings

- **CHANGE 1 (personal-field half unwitnessed) — RESOLVED.** `billing-contact.test.ts` returns `email: acceptor.email, name: "Departing Person"`; deleting the `customerPersonalFieldsClear` clause lets the binding move and the case goes red. Dropping `name` from `CUSTOMER_PERSONAL_FIELDS_CLEARED` is also red via the params assertion.
- **CHANGE 2 (raise-only clamp vacuous) — RESOLVED.** 63-cent forecast under `--owner-ceiling-cents 10`: with the clamp the ceiling stays 100 → exit 0; without it 63 > 10 → BLOCKED, exit 2, red.
- **CHANGE 3 (retained row keeps no contact id, unwitnessed) — RESOLVED.** The retained row is read by `stripeCustomerId = "cus_owner"` after `complete`; `billingContactUserId === null`, `workspaceId !== fixture.workspaceId`. Non-vacuous: the survivor's user row survives a workspace erasure, so SET NULL never fires and the only path to NULL is the `workspace_link` scrub.
- **NOTE (executor re-check passes `[]`) — RESOLVED.** Both comment claims verified: `customers.ts:106` is the sole `subscriptions` inserter; the FK is `set null`.
- **NOTE ("order is the point") — PARTIAL.** Module comment fixed; the test file header still claimed ORDER (fixed after this round).
- **NOTE (T-R2-5 non-owner case) — RESOLVED.** Register names the viewer/editor case and the remedy; witnessed and run.
- **NOTE (PaymentMethod `billing_details`) — UNRESOLVED** at review time; recorded after this round as T-R2-7.
- **NOTE (provider call under workspace lock) — RESOLVED** (informational).

## Findings

- ⚠️ CHANGE `respin/packages/credits/tests/deletion-commands.test.ts:216-222` — The erasure command's `customerIsClear` composes the shared predicate and its personal-field half has no witness on this side: the only echoing fake returns `email: "still@example.test"` with every other field clear, so deleting `customerPersonalFieldsClear(customer) &&` from `customerIsClear` keeps all cases green. (Honest note: the pre-refactor inline check had the same gap and was not flagged in round 1.) · Fix: a fake returning `email: ""` with `name: "Owner"` and assert `customer_fields_not_cleared`; optionally the same through `reconcile` → `not_applied`. **Fixed after this round without re-review:** both `execute` and `reconcile` witnesses added.
- 💡 NOTE `billing-contact.test.ts:1-5` — header still claims ORDER. **Fixed after this round.**
- 💡 NOTE `billing-contact.ts:148` — with the per-call UUID present, the `outgoing:acceptor:emailDigest` segments are inert; kept for log readability.
- 💡 NOTE `actions.ts:539, 1067` (medium confidence, pre-existing) — Checkout attaches a PaymentMethod whose `billing_details` sits under the customer; neither the erasure command nor the handover touches payment methods. **Recorded as T-R2-7.**

## Money-path questions (answered)

- **Per-call nonce:** does not weaken the key. `customers.update` is a customer-field write with no charge, invoice, subscription or ledger effect and is idempotent in effect. stripe-node 22.5.0 builds headers once per `_request` and reuses them across its automatic network retries (`RequestSender.js:25, :445`), which is the one job the key still does. Erasure command key and webhook path untouched. Key length ≈ 174 chars, under 255.
- **Derived `customerPersonalFieldsClear`:** keeps `customerIsClear` correct; the only widening (address/shipping accepting `undefined`/`""`) is equivalent on real Stripe responses, and a missing key cannot carry a person's details.
- **Do the three witnesses go red?** Yes, each reasoned from the test text and code path; the nonce witness too (without `randomUUID()`, D→A→D→A collapses to two keys and both `new Set(keys).size` and `cache.size` go red).

## Checks run

- B1 ledger untouched — ✅. B2 idempotency — ✅ (handover key fresh per call and verified on the returned object; erasure key unchanged; SDK retry reuse verified). B3 — n/a. B4 — n/a. B5 config not code — ✅ (on-disk snapshot pinned to the evidence). B6 owner-only — ✅ (`billing-contact.ts:95, :107`; isolation case). Threshold provenance — ✅. B7 money paths tested, not vacuous — ❌ one survivor (the CHANGE above, fixed after). Migration 0057 — n/a for money.

## Coverage

- read fully: `billing-contact.ts`, `deletion-commands.ts`, `billing-contact.test.ts`, `journal-forecast-cli.test.ts`, migration 0057, the round-1 report, register T-R2-4/5, `isolation.test.ts` diff, `customers.ts` diff; targeted ranges of `deletion-executor.ts`, `deletion-executor.test.ts`, `deletion-lifecycle.test.ts`, `deletion-journal-cost.ts`, `journal-forecast.ts`, `billing-schema.ts`, `deletion-commands.test.ts`, `RequestSender.js`.
- commands run: `vitest run billing-contact journal-forecast-cli deletion-commands` → 27/27; `vitest run deletion-executor deletion-lifecycle -t "contact|erasure|erases|workspace"` → 26 passed; stripe version 22.5.0; git diff/status; ripgrep for the subscriptions inserter (1 src hit), `billing_contact_unknown`, `customer_fields_not_cleared`, `billing_details|PaymentMethod`, `.only|.skip` (0 hits).

## Verdict

NEEDS CHANGES
Every round-1 finding is fixed with a witness that reads red-on-break, and the nonce is confirmed harmless for money — but the round's own refactor left `customerIsClear`'s personal-field clause with no witness on the erasure side, the same shape B7 refused last round.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
