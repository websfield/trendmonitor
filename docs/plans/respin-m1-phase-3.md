# Phase 3 — Stripe integration: adapter, setup script, checkout/portal, idempotent webhooks, pause/resume, auto-top-up

**Feature:** respin-m1 · **Master plan:** `docs/plans/respin-m1-master-plan.md` · **Depends on:** 2

## Project Conventions Pinned (READ FIRST)

**Golden rules (CLAUDE.md, verbatim):**
1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** A new dependency needs a reason the standard library can't answer.
6. **Report honestly.**
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.** Verify library APIs against the installed version (SDK type definitions, official docs) before use — **this phase lives or dies by it: every Stripe API shape (Checkout Session params, `pause_collection`, webhook `constructEvent`, test-header generation, event payload types) is verified against the installed `stripe` package's types and current Stripe docs, never written from memory.**

**Respin non-negotiables that bind this phase (verbatim):**
- **2. The ledger is the balance.** Webhooks idempotent on Stripe event id (REQ-G04/G06, R-6).
- **5. No leakage.** Nothing crosses workspaces — the webhook is a non-session entry; D-M1-6 fail-closed resolution governs it.
- **6. No invented specifics, no guarantees.**

**Billing skill rules (verbatim headlines):** B2 — every webhook-driven state change idempotent on the event id; a double-delivered `invoice.paid` grants once; the M1 acceptance tests name the cases and a billing change that doesn't keep them green isn't done. B4 — pause via Stripe `pause_collection`; resuming shifts expiries. B5 — price/cost config, never code. B6 — Free tier has **no Stripe subscription** (default state, not a $0 price); only owners touch billing (REQ-A02). B7 — money paths integration-tested before UI polish.

**Lessons:** 2026-07-21 (prove installs by import); 2026-07-30 (guard the class: validate at the boundary every event passes — one dispatch entry, not per-handler guards; assert claimed properties in tests); 2026-08-02 (pin configs); 2026-08-10 (present-and-verified vs present-and-unrun — a handler registered but untested is unrun).

**Stack & boundaries:** `app/` imports `packages/`, never the reverse — the webhook **route** is thin (`await req.text()` → signature verify → `handleStripeEvent`); all logic in `packages/credits`. Lazy Stripe client (env `STRIPE_SECRET_KEY` read at first use, never module top — keyless build stays green; the `createAuth` lazy pattern is the precedent). Middleware: `/api/*` is already outside the product-prefix matchers — verify, don't assume (`lib/routes.ts`, `routes.test.ts`).

**Agents:** implementer is `respin-engineer`. Do NOT request agents not in `.claude/agents/`.

## Requirements Checklist (functional)

- REQ-G01: checkout for the three paid tiers (Checkout Session, price from config `stripePriceMap`); Customer Portal session; self-serve up/downgrade/cancel via Portal.
- REQ-G03: pack checkout (one-off price); auto-top-up opt-in + monthly cap (request-time trigger, D-M1-4) — trigger API this phase, UI next phase.
- REQ-G06: webhook handler, signature-verified, idempotent (D-M1-1 `stripe_events` + ledger unique event id); events: `checkout.session.completed`, **`checkout.session.async_payment_succeeded`**, `customer.subscription.created|updated|deleted`, `invoice.paid` (grant `expires_at = the SUBSCRIPTION LINE ITEM's service period end + 1 month` — **not** the top-level `invoice.period_end`, which is invoice-creation time on a `subscription_create` invoice, and **not** `lines.data[0]`, which is the proration whenever one exists), `invoice.payment_failed` (grace 7 days from config `graceDays`), pack purchase, auto-top-up `payment_intent.succeeded`. **The production endpoint MUST subscribe to `checkout.session.async_payment_succeeded`**: delayed-notification payment methods complete the session as `unpaid` and settle only on that event, so without it a delayed pack payment settles and never mints. (`stripe listen` forwards everything locally, which is why local testing cannot catch a missing production subscription.) All three corrections were made in the Phase-3 code-review round.
- REQ-G08: pause (bounds from config `pauseMonths`) via `pause_collection`; resume; both recorded via Phase 2's `recordPauseStart/End` in the same transaction as the mirror update. **"No grants while paused" is Stripe-enforced** (no invoices are issued while collection is paused) and asserted by the pause/resume integration test — an `invoice.paid` that nevertheless arrives for a mirror-paused workspace is **processed normally** (a paid invoice is a fact; taking money and granting nothing is the worse failure), as an ORDINARY grant row (`refType: "invoice"`), with the expected `subscription.updated` closing the pause; never silently dropped (billing round-1 note). **Corrected in round 7** (billing round-7 NOTE, plan-vs-code drift): this row used to say the grant is "flagged in its ledger `refType`", which the code has never done and now must not — `credit_ledger_invoice_grant_uq` is a partial unique `WHERE ref_type = 'invoice'`, so a paused-workspace grant written under a different `refType` would slip past the per-invoice idempotency guarantee and a redelivery would mint a second allowance. The pause is already recorded, in `pause_periods` and `subscriptions.paused_at`; the ledger row does not need to carry it, and carrying it would cost more than it tells.
- REQ-A02 slice: every billing mutation (checkout, portal, pause, resume, auto-top-up opt-in) requires `role === 'owner'` — enforced in the package-level action functions, not just UI.

## Requirements Checklist (technical)

- The build-plan M1 accept-when list maps 1:1 to named integration tests (see AC-2).
- Every handler idempotent; **out-of-order tolerant** (e.g. `subscription.updated` before `created` upserts by subscription id).
- Unknown customer / missing metadata → `refused_unknown_customer` recorded, HTTP 200 (Stripe must not retry forever), nothing granted (D-M1-6 fail-closed).
- No `STRIPE_*` env read at module load; keyless `pnpm build` green.
- Setup script idempotent (lookup by `lookup_key`/metadata before create) and **checked in**; it prints price ids and the exact next step (paste into admin config / dev seed command) — it never writes config itself (config changes go through the versioned append API).

## Edge Cases & Failure Paths (each maps to a task/test)

- Double delivery of every handled event type (not just `invoice.paid`).
- Same event id arriving **concurrently** (Docker race — `stripe_events` PK + ledger unique survive).
- `invoice.paid` for a subscription in grace → grace cleared, grant lands (recovery path).
- `invoice.payment_failed` twice → one grace deadline (idempotent, not extended).
- Grace expiry passed then payment succeeds → state machine returns to tier (lazy derivation handles; test).
- `checkout.session.completed` for a pack with no `workspace_id` metadata → **processed for the mapped workspace** (D-M1-6: the stored customer→workspace mapping is the SOLE identity authority; metadata is a cross-check only, so *absent* metadata is fine and *present-and-mismatched* refuses). Amended from "refused, recorded" during the Phase-3 code review — the plan predated D-M1-6 and the two had never been reconciled; a metadata-absence refusal would drop legitimate events Stripe can emit without our metadata.
- Subscription deleted while paused → canceled wins; pause period closed.
- Auto-top-up: cap reached mid-month → refused with typed error; disabled → never triggered; Stripe PaymentIntent creation fails → debit refusal propagates unchanged (no credits, no partial state).
- **Second tier checkout while a live subscription exists → `AlreadySubscribedError`, no Stripe call** (plan-review F1; named test in the AC-6 matrix suite).
- **Proration/non-cycle `invoice.paid` → `ignored`, zero ledger writes** (named test; plan-review F2).
- Webhook body unparseable / signature invalid → 400, **no** `stripe_events` row (nothing to make idempotent — the event never authenticated).
- Injected first-attempt handler failure → event row rolled back → redelivery succeeds (one grant total) — the discriminating test for the D-M1-1 single-transaction design.
- Metadata/mapping **mismatch** (checkout or auto-top-up PI naming workspace B while the customer maps to A) → `refused_identity_mismatch`, zero ledger writes.
- `payment_intent.succeeded` **without** auto-top-up metadata (the PI that accompanies every pack Checkout) → `ignored`, zero ledger writes (named test).
- `invoice.paid` arriving before the `subscription.updated` that clears a local pause (resume interleaving) → grant processed, not dropped (see REQ-G08 row above).
- Inverse events: subscription deleted ⇒ effective free; pack is never revoked by subscription changes (12-month validity independent); refund webhooks are **out of scope** (M6 admin `refund` op exists from Phase 2 — receiver noted in master-plan Deferral Ledger under admin UI).

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| Stripe API (checkout/portal/pause) | unreachable / error | typed error to caller; **no local state written** (state only ever follows webhooks or explicit local records in the same tx as the API success) | user retries | test with injected failing client |
| Stripe webhook → us | endpoint down | Stripe retries (its own queue); idempotency makes retries safe | automatic | double-delivery tests |
| Webhook → config | config unavailable during `invoice.paid` (allowance unknown) | handler throws → whole D-M1-1 tx rolls back (event row **not present**) → 500 → Stripe retries later (fail closed, self-healing) | automatic on config fix | test |
| Us → Stripe (auto-top-up PaymentIntent) | off-session charge fails | no credits; opt-in stays; typed refusal at the debit site | user pays manually via pack checkout | test with failing client |
| Clock | grace/pause boundaries | all derivations take explicit `at` (Phase 2 contract) | — | fixed-date tests |

## Handoff Contracts

**From Phase 2 (consumed verbatim):** `grantCredits`/`purchasePackCredits`/`refundCredits`, `getWorkspaceBillingState`, `recordPauseStart/End`, `getActiveConfig`, `trustWorkspaceId` (webhook resolution path — the ONE sanctioned non-session mint, per its lint).
**To Phase 4 (pinned here):**
```ts
// packages/credits/src/stripe/actions.ts  (server-action-callable, all owner-gated internally)
// SIGNATURES VERIFIED AGAINST THE CODE in the round-5 fix round — three had drifted
// from this block (email params absent here, a phantom `at` on resume, a
// `tierOrPriceId` that is really a tier). A handoff contract Phase 4 codes against
// must match what it will actually call: the same drift on maybeAutoTopup below is
// billing review finding 7.
createTierCheckoutUrl(db, scope: WorkspaceScope, tier: "creator"|"pro"|"studio", email: string, urls: CheckoutUrls): Promise<string>
createPackCheckoutUrl(db, scope, email: string, urls: CheckoutUrls): Promise<string>
createPortalUrl(db, scope, returnUrl): Promise<string>
pauseSubscription(db, scope, months: number, at): Promise<void>  // validated at runtime against config pauseMonths (B5 — never a type-level bound)
resumeSubscription(db, scope): Promise<void>
setAutoTopup(db, scope, opts: { enabled: boolean; monthlyCapCents?: number }): Promise<void>
// each throws BillingRoleError unless scope.role === 'owner'
// TYPED ERROR SURFACE (round 10): every refusal these six can raise is an Error
// SUBCLASS re-exported from `@respin/credits/app-server` — Phase 4 may import
// ONLY that entrypoint, so an anonymous Error there is an opaque failure it
// cannot tell from a Stripe outage. Added this round: NoStripeCustomerError,
// NoLiveSubscriptionError, NotPausedError, PauseLengthError, AutoTopupCapError,
// StripeSessionUrlMissingError, CustomerMappingLostError (alongside
// AlreadySubscribedError, BillingRoleError, CheckoutInFlightError,
// UnknownTierPriceError, StripeNotConfiguredError, ClockSkewError,
// LedgerIntegrityError). `tests/facade-errors.test.ts` asserts the set is
// complete AND that no plain `new Error` remains reachable from this facade.
// `setAutoTopup({enabled: true})` now also requires a LIVE subscription
// (NoLiveSubscriptionError); disabling is always permitted.
// packages/credits/src/stripe/auto-topup.ts  (no M1 caller — M3's debit-refusal site)
maybeAutoTopup(db, workspaceId, shortfall: number, at: Date): Promise<AutoTopupResult>
// packages/credits/src/stripe/webhooks.ts
handleStripeEvent(db, event: Stripe.Event): Promise<StripeEventOutcome>
// app/api/stripe/webhook/route.ts — thin: text body → constructEvent(sig, secret) → handleStripeEvent
```
**Setup script contract:** `pnpm -C respin stripe:setup` (root script → `packages/credits/src/stripe/setup.ts` CLI) — idempotent; prints `{creator, pro, studio, pack}` price ids + paste instructions. **Round-7 CHANGE 4:** it takes a `DbLike` and needs `DATABASE_URL` as well as `STRIPE_SECRET_KEY` — the pack price is created at the ACTIVE CONFIG's `pack.priceUsd` (the same number `maybeAutoTopup` charges off-session), and re-running the script is the **divergence check**: an existing Stripe pack price whose `unit_amount` disagrees with config is a typed refusal naming both amounts and the only remedy Stripe permits (price amounts are immutable — a new price plus a `stripePriceMap` update).

**Config contract (round-7 CHANGE 3):** `RespinConfigV1` gains `monthlyPeriodDays: { min, max }` (seeded 20/45). It is the band a grant-bearing invoice's SERVICE period must fall in for REQ-G02's "expiry = period end + 1 month" to hold; out-of-band throws, which rolls back the D-M1-1 transaction and makes Stripe retry, so the threshold must be operator-adjustable from `/admin/config` without a deploy (B5). No migration: `config_versions.content` is jsonb, and D-M1-2 is append-only — an existing database needs a NEW version appended, never an edit to v1.

## Implementation Tasks

| # | Task | Owner agent | File(s) |
|---|---|---|---|
| 1 | Add `stripe` dep; lazy client factory (`getStripe()`); prove by import; keyless build stays green | respin-engineer | `respin/package.json`, `packages/credits/package.json`, `packages/credits/src/stripe/adapter.ts` |
| 2 | Setup script per contract (idempotent via `lookup_key`; verify lookup-key API against installed SDK) | respin-engineer | `packages/credits/src/stripe/setup.ts`, root script wiring |
| 3 | Customer resolution: get-or-create Stripe customer per workspace (writes `subscriptions` row with `stripeCustomerId`, unique-safe under races via upsert-on-conflict) | respin-engineer | `packages/credits/src/stripe/customers.ts` |
| 4 | Checkout + portal + pause/resume + auto-top-up opt-in actions per contract, owner-gated (`BillingRoleError`), price ids validated against config `stripePriceMap` (unknown → typed error, never pass-through). **`createTierCheckoutUrl` refuses (typed `AlreadySubscribedError`) when the workspace already has a live subscription** (status active/grace/paused/cancel-at-period-end) — a second Checkout would create a second Stripe subscription = double-billing (plan-review F1); tier changes go through the Customer Portal (REQ-G01 self-serve up/downgrade) | respin-engineer | `packages/credits/src/stripe/actions.ts` |
| 5 | `handleStripeEvent`: single dispatch entry implementing the **D-M1-1 single-transaction design**: one tx = insert `stripe_events` row + run the per-type handler + set `processedAt`/outcome; handler failure rolls the event row back (non-2xx → Stripe redelivers; no stale in-flight row can exist); a concurrent duplicate blocks on the PK, then conflicts after the winner commits → existing row always means final outcome → 200. Workspace resolution per D-M1-6: stored customer→workspace mapping is the **sole authority**; metadata is a cross-check — mismatch ⇒ `refused_identity_mismatch`, null/absent customer field ⇒ refusal, never a metadata fallback. Outcomes: `processed`/`refused_unknown_customer`/`refused_identity_mismatch`/`ignored`. Log lines for refusals carry event id + outcome only, never payload | respin-engineer | `packages/credits/src/stripe/webhooks.ts` |
| 6 | Handlers: subscription lifecycle mirror (upsert, out-of-order tolerant; stores `stripePriceId` — **never a tier**, tier is read-time-derived per the Phase 2 contract), `invoice.paid` → grant **only for subscription-cycle invoices** (billing_reason subscription_create/subscription_cycle — verify exact field/values against the installed SDK, golden rule 9; allowance = active config's tier mapping for the invoice's price; **unmapped price on a grant-bearing invoice throws** → 500 → Stripe retries → self-heals after config fix, same path as config-unavailable); **proration and other non-cycle `invoice.paid` shapes → `ignored`, zero ledger writes, never a throw** (plan-review F2: a real-money event must not retry-loop; stated consequence, recorded in R-20: a mid-cycle portal upgrade grants no extra allowance until the next billing anniversary — REQ-G02's "monthly credits reset on the billing anniversary", revisit if pilot creators hit it), `invoice.payment_failed` → grace (config `graceDays`, idempotent), checkout completed (pack → pack row; subscription → ensure mirror), `payment_intent.succeeded` (auto-top-up metadata → pack-kind row) | respin-engineer | same file(s), split as needed |
| 7 | Auto-top-up trigger: `maybeAutoTopup(db, workspaceId, shortfall, at)` — **purchases exactly one standard pack per trigger** (config `pack.credits` at `pack.priceUsd`; if one pack doesn't cover the shortfall the debit still refuses and the user buys manually — stated consequence, plan-review F4; keeps cap math in whole packs); refuses when workspace is paused (R-12 "no charges"; guard in the function, not the caller); enabled? cap headroom computed in **cents** from this-calendar-month auto-top-up rows' `amountCents` (never reconstructed from credits — billing round-1 finding 6)? → off-session PaymentIntent, idempotency key = `autotopup:{workspaceId}:{yyyy-mm}:{n+1}` where n = count of this-month auto-top-up rows (concurrent duplicate triggers compute the same key → Stripe dedupes to one PI; Docker race case asserts it). Auto-top-up rows are discriminated from ordinary pack rows by **`refType = 'auto_topup'`** (pinned — the cap query and n-count filter on it); the PI carries matching metadata. Stated consequence: a **declined** off-session PI replays its decline under the same key until the month's row count changes — fail-safe and accepted (the user's manual pack checkout is the recovery path). Credits land via the `payment_intent.succeeded` webhook (`pack`-kind row with `refType='auto_topup'`, `amountCents`, event id). **M1 ships and tests this function directly; no M1 code calls it** — the debit-refusal call site is M3's (master-plan Deferral Ledger row). `debitCredits` (Phase 2) is unchanged | respin-engineer | `packages/credits/src/stripe/auto-topup.ts` |
| 8 | Webhook route (thin, `await req.text()`, `constructEvent`, 400 on bad signature) + verify `/api/stripe/webhook` sits outside auth matchers (extend `routes.test.ts`) | respin-engineer | `app/api/stripe/webhook/route.ts`, `respin/tests/routes.test.ts` |
| 8b | **App-facing facades** (tenancy round-1 finding 5): wired `app-server.ts` entrypoints for `@respin/credits` and `@respin/config` following the `packages/db/src/app-server.ts` (`respinDb`) precedent — exporting ONLY the sanctioned surface (the six actions, `getWorkspaceBillingState`, `deriveBalance`, `getActiveConfig`, `appendConfigVersion`) already bound to the server db handle; extend the eslint default-deny allowlist with `@respin/credits`/`@respin/config` naming only these facades; the config facade's **write** export (`appendConfigVersion`) is import-restricted to `app/(admin)/**` in the same lint mechanism (tenancy round-2: the admin boundary for a global config write must not rest on route gating alone); **`getServerDb`/`createDb` stay off the app allowlist forever**; import-boundary fixtures updated in all directions (facade-allow, admin-only-write, app-deny, package-deny) | respin-engineer | `packages/credits/src/app-server.ts`, `packages/config/src/app-server.ts`, `respin/eslint.config.mjs`, `respin/tests/import-boundary.test.ts` |
| 9 | Integration test suite: every build-plan accept-when case + every Edge-Case bullet, on PGlite with constructed `Stripe.Event` objects (typed from the installed SDK); signature verification tested via the SDK's test-header helper (verify it exists in installed version; if absent, test the route's 400 path with a real-but-wrong signature) | respin-engineer | `packages/credits/tests/stripe.test.ts`, `respin/tests/routes.test.ts` |
| 10 | Docker race: same event id delivered concurrently ×8 → one grant; ledger entries | respin-engineer | `packages/credits/tests/concurrency.docker.test.ts`, `docs/progress/respin-m1/ledger.md` |

## Files to Create / Modify

Create: `packages/credits/src/stripe/{adapter,setup,customers,actions,webhooks,auto-topup}.ts` · `packages/credits/src/app-server.ts` · `packages/config/src/app-server.ts` · `packages/credits/tests/stripe.test.ts` · `app/api/stripe/webhook/route.ts` · (round 7) `packages/credits/tests/facade-errors.test.ts` (the call-graph assertion behind the facades' error re-exports) · `packages/credits/tests/setup.test.ts` (the pack-price divergence check).
Modify: `respin/package.json` (dep + `stripe:setup` script — task 1/2) · `packages/credits/package.json` (task 1) · `pnpm-lock.yaml` (task 1's install owns it) · `packages/credits/tests/concurrency.docker.test.ts` (tasks 7/10) · `respin/tests/routes.test.ts` (tasks 8–9) · `respin/eslint.config.mjs` + `respin/tests/import-boundary.test.ts` (task 8b) · `docs/progress/respin-m1/ledger.md` (task 10).

## Migration Steps

None expected. If a column proves missing, new migration `0002` + seed update in the same commit (never edit 0001).

## Verification Steps (paper-dry-run)

1. `pnpm -C respin install` — `stripe` resolves; prove by typecheck import.
2. `pnpm -C respin typecheck` — tasks 1–8.
3. `pnpm -C respin test` — task 9 (PGlite suites; Docker suites loud-skip).
4. `TEST_DATABASE_URL=… test:concurrency` — task 10 + Docker up.
5. `pnpm -C respin lint && pnpm -C respin build` — **no `STRIPE_*` env set** (keyless proof).
6. `pnpm -C respin stripe:setup` **without** keys → clean typed error naming the missing env (never a stack trace) — the script's own degraded path, tested by running it.

## Acceptance Criteria (PASS/FAIL, with evidence)

- AC-1: keyless `pnpm build` green with `stripe` installed and no `STRIPE_*` env (command output).
- AC-2: named integration tests exist and pass for each accept-when case: `subscribe → grant`, `cancel → downgrade`, `payment-failed → grace → downgrade`, `pack purchase`, `double-delivered webhook (no double grant)` — test names cite the case verbatim; the sixth case, `debit refused at zero balance`, is discharged by Phase 2's AC-4 test (cite its name in this phase's ledger entry rather than duplicating the test).
- AC-3: every handled event type has a double-delivery test; the Docker concurrent-same-event test passes (exactly one grant row); the **injected first-attempt-failure test** proves rollback + successful redelivery (one grant total) — the case that discriminates the D-M1-1 single-transaction design.
- AC-3b: metadata/mapping mismatch ⇒ `refused_identity_mismatch` with zero ledger writes; PI-without-auto-top-up-metadata ⇒ `ignored` with zero ledger writes (named tests).
- AC-4 (amended in the Phase-3 code-review round — see the edge-case bullet above): **unknown-customer** events produce `refused_unknown_customer` rows, HTTP-level 200, zero ledger writes. **Missing-metadata** events are NOT a refusal: per D-M1-6 the stored customer→workspace mapping is the sole identity authority and metadata is a cross-check, so absent metadata processes for the mapped workspace while present-and-mismatched metadata produces `refused_identity_mismatch` with zero ledger writes. Both directions carry named tests in `packages/credits/tests/stripe.test.ts`.
- AC-5: out-of-order `subscription.updated`-before-`created` converges to the same mirror state as in-order (test).
- AC-6: all six action functions throw `BillingRoleError` for `editor`/`viewer` scopes (matrix test).
- AC-7: auto-top-up honors the monthly cap across the calendar-month boundary (table-driven with fixed dates) and never triggers when disabled.
- AC-8: `routes.test.ts` proves the webhook path is outside auth matchers; bad signature → 400 with no `stripe_events` row.
- AC-9: **a test**, not a hand-grep, proves no non-lazy Stripe construction (`new Stripe(` only inside `getStripe`) — a source scan over `packages/credits/src/**` in `stripe.test.ts`, asserting the offender list equals exactly `["stripe/adapter.ts"]` and that the scan is non-vacuous. Changed in the round-5 fix round: the rule was recorded as satisfied for four review rounds while `stripe/setup.ts` constructed a second client, because a hand-grep only runs when someone remembers to run it.

## Least confident (one line)

The Stripe event payload shapes I'll code against (esp. `invoice.paid`'s subscription/period fields and `pause_collection` semantics on `subscription.updated`) — mitigated by golden-rule-9 verification against the installed SDK types, but the types allow more nullability than the docs imply, and the null-handling branches are where a wrong guess would hide.

## Out of Scope (Surgical Changes)

No UI pages (Phase 4); no accessor-map changes; no config-content changes beyond reading; no `middleware.ts` edits (the matcher already excludes `/api` — if it doesn't, STOP and surface, don't widen silently); no `src/`, `cutdown/`.

## Completion Criteria (Definition of Done)

Entry gate clean (or no new failures vs baseline); ACs green with named evidence; ledger updated; billing + tenancy gates run at phase review.
