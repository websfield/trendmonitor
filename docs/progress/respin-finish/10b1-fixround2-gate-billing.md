# Respin billing & credits review — Phase 10b-1 fix round 2 (round 1 of this gate, 2026-09-09)

*Report returned by `respin-billing-reviewer`; saved verbatim by the build lane because the read-only agent writes no files.*

**Readiness: Almost · Grade: B · The money core is untouched and the new C3 handover is built the right way round, but three of the claims this round rests on have tests that would stay green if the claim were false.**

0 BLOCK · 3 CHANGE · 5 NOTE.

**Scope**: the round-2 files, reviewed in the uncommitted working tree against HEAD d5fbaf7. Focus: `packages/credits/src/stripe/{billing-contact,customers,deletion-commands,actions}.ts`, `packages/credits/src/app-server.ts`, `packages/db/src/{billing-schema,creator-data-registry,deletion-lifecycle,deletion-executor,deletion-request-enablement,app-server,lifecycle-sql-port,lifecycle-probes}.ts`, migration 0056, `scripts/journal-forecast.ts`, the two price JSONs, `app/(product)/settings/account/{actions,refusal-code}.ts`, and the tests that witness them. The `stripe_finance_extracts` changes sharing the same `billing-schema.ts` diff are round-1 work (ledger 2026-09-08) and were not re-reviewed.

## Findings

- ⚠️ CHANGE `respin/packages/credits/tests/billing-contact.test.ts:128-135` — The personal-field half of the provider verification has no witness. `acceptBillingContact` refuses when `updated.email !== email || !customerPersonalFieldsClear(updated)` (`billing-contact.ts:136`), but the only fake that returns a non-handed-over object (line 130) also echoes the *departing* email, so deleting the `customerPersonalFieldsClear` clause keeps all six cases green — the email check catches it alone. · Fix: add a fake returning the acceptor's email with `name: "Departing Person"` (or a non-null `address`) and assert `provider_object_not_handed_over` plus an unmoved binding.
- ⚠️ CHANGE `respin/tests/journal-forecast-cli.test.ts:168-175` — "Lowering is refused by the module's clamp: a ceiling of 1 cent changes nothing" is vacuous. The forecast for that exact input (1 KB, 10 puts, 10 reads) is `amountCents = 1`; without the clamp the ceiling becomes 1 and `overCeiling` is `1 > 1 = false`, so the case exits 0 either way. The clamp itself is correct (`deletion-journal-cost.ts:363-367`). · Fix: use `measured(25 * 1024 ** 3)` (63 cents) with `--owner-ceiling-cents 10` and assert exit 0 / no BLOCKED — that goes red the moment the clamp is removed.
- ⚠️ CHANGE `respin/packages/db/tests/deletion-executor.test.ts:484-641` — "`billing_contact_user_id` never survives in a retained seven-year row" has no witness on the workspace path, and "the residue probes agree" is not what the probe checks. The scrub rule is right (nullable uuid → `uuid_null`, `lifecycle-sql-port.ts:300, :460-464`; `lifecycle-scrub-rules.test.ts` passes) but (a) the residue probe for `subscriptions::workspace_row::workspace_link` matches only `workspace_id` (`lifecycle-probes.ts:250-252`), so a surviving contact id is invisible to it, and (b) the populated workspace erasure seeds `billingContactUserId: survivor.user.id` and never reads the retained `subscriptions` row back. · Fix: after `complete` in the workspace case assert the retained row has `billingContactUserId === null` (and `workspaceId !== fixture.workspaceId`).
- 💡 NOTE `respin/packages/db/src/deletion-executor.ts:565` — The erasure-time re-check passes `[]`, so only the by-user binding is re-asserted; the `billing_contact_unknown` population is not. Practically safe: NULL is produced only by pre-C3 rows (already refused at request) and by `ON DELETE SET NULL`, which fires only on an identity erasure the by-user rule itself refuses. Say so in the comment, or pass the snapshot's workspace ids.
- 💡 NOTE `respin/packages/credits/src/stripe/billing-contact.ts:1-12, 121` — "The order is the point" is not what the tests prove. Both the provider write and the binding update sit inside one `db.transaction`, so a DB-first implementation whose provider call throws would also roll back; the cases cannot tell the orders apart. Either assert order (have the fake `update` read the row mid-call and expect the departing id) or soften the comment — Lesson 2026-07-30.
- 💡 NOTE `respin/packages/db/src/deletion-lifecycle.ts:827-831, 858-861` — On the author's least-confident line: the shape is right, with one sharpening. `lockIdentityWorkspaces` returns every membership regardless of role, so `billing_contact_unknown` also refuses editors and viewers of a pre-C3 workspace, who have no remedy of their own (accept is owner-only). Acceptable before any production row exists; T-R2-5 should name the non-owner case.
- 💡 NOTE `respin/packages/credits/src/stripe/actions.ts:539, 1067` (medium confidence, pre-existing) — Plan C3's personal-field class is the Customer object. Checkout sessions created with `customer:` attach a PaymentMethod whose `billing_details` (name/email/address of whichever owner paid) lives under the customer, and neither `stripe_customer_personal_fields_clear` nor the handover touches payment methods. A non-contact owner who bought a pack can delete their identity with their card billing details still attached in Stripe. Belongs in the vendor-acceptance batch beside T-R2-4.
- 💡 NOTE `respin/packages/credits/src/stripe/billing-contact.ts:107-129` — The provider call runs while the transaction holds `takeWorkspaceLock`. Consistent with `getOrCreateCustomer` inside `createTierCheckoutUrl`'s transaction, so no finding.

## Checks run

- B1 ledger untouched — ✅ holds (`packages/credits/src` diff: only `app-server.ts`, `actions.ts` call sites, `customers.ts`, `deletion-commands.ts`, new `billing-contact.ts`).
- B2 idempotency — n/a for webhooks; the new provider write is keyed `billing-contact:${customer}:${user}:${emailDigest}`, verified on the returned object, no call when already the contact; the erasure command's key and `CLEARED_CUSTOMER_FIELDS` unchanged in effect; handover params carry no `metadata` key (asserted).
- B3 debit in-transaction — n/a. B4 expiry/pause — n/a.
- B5 config not code — ✅ `price-snapshot.ap-southeast-2.json` equals `price-evidence.ap-southeast-2.json` (0.025 / 0.0055 / 0.00044 / list=0.0055), pinned by `journal-forecast-cli.test.ts:38-46`.
- B6 owners only — ✅ `acceptBillingContact` refuses non-owners before and inside the transaction with fresh password proof; the page offers the button only to owners; the action passes the session user's own email.
- Threshold provenance — ✅ USD 1 / USD 0.50 cite R-124; `--owner-ceiling-cents` documented as a recorded owner decision.
- B7 money paths tested, not vacuous — ❌ partially (the three CHANGEs).
- Request flag never gates cancellation — ✅ three sites on the request facades only; source witness counts exactly three and scans both cancellation bodies.
- Erasure-time re-check — ✅ `deletion-executor.ts:560-571`, witnessed by "C3 at the LAST moment" (run).

## Coverage

- read fully: `billing-contact.ts`, `customers.ts`, `deletion-commands.ts`, `billing-contact.test.ts`, `journal-forecast.ts`, `journal-forecast-cli.test.ts`, `deletion-request-enablement.ts`, `refusal-code.ts`, account `actions.ts`, migration 0056, both price JSONs, the register entry, the skill canon; diffs of `billing-schema.ts`, `actions.ts`, both `app-server.ts`, `deletion-executor.ts`, `deletion-external-commands.ts`, the import-boundary/profile-cage/table-writers/lifecycle-registry tests; targeted ranges of `deletion-lifecycle.ts`, `deletion-executor.test.ts`, `deletion-lifecycle.test.ts`, `isolation.test.ts`, `lifecycle-sql-port.ts`, `lifecycle-probes.ts`, `creator-data-registry.ts`, `lifecycle-column-census.ts`.
- not read: `retention-clocks.ts` body, `retention-receiver.ts`, `trends-schema.ts` composite FKs, `retention-sweep-fixtures.test.ts`, `deletion-executor.docker.test.ts`, `worker/deletion-lifecycle.ts`, `env.example`, `README.md`, `eslint.config.mjs`, `copy.ts` — outside the money path or covered by other gates.
- commands run: `vitest run packages/credits/tests/billing-contact.test.ts tests/journal-forecast-cli.test.ts tests/account-copy.test.ts` → 25/25; `vitest run packages/db/tests/deletion-lifecycle.test.ts packages/db/tests/deletion-executor.test.ts -t "C3"` → 3/3; `vitest run packages/db/tests/{lifecycle-registry,lifecycle-scrub-rules,retention-clocks,deletion-request-enablement}.test.ts` → 36/36; `tsx -e …forecastDeletionJournalCost(…)` on the CLI test's inputs → `1KB forecast 1 100 false`, `25GiB forecast 63 100 false`; git diff/status and ripgrep over the money identifiers.

## Verdict

NEEDS CHANGES
No mutable balance, no unkeyed provider write, no unmetered path, no invented price — but three of the round's stated witnesses (personal-field verification, raise-only ceiling, contact-id nulling on the retained row) do not go red when their property is broken, and B7 requires that they do.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
