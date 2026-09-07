# M1 Review — Stripe Billing and the Credit Ledger · Report Card

**Date:** 2026-08-17 · **Plan:** `docs/plans/respin-m1-master-plan.md` (4 phases, all complete) · **Ledger:** `docs/progress/respin-m1/ledger.md` (130+ entries)

## Overall readiness: **Ready (engineering) / Discharged-to-the-extent-possible (evidence)**

Build-plan M1's own rule applies, unchanged from M0: engineering completion and evidence completion are separate claims (non-negotiable rule 6). Everything provable inside this repo is green. The owner then ran a live Stripe test-mode evidence session (real browser, real webhooks via `stripe listen`) — E1–E7 and E4b are discharged against real Stripe objects; E8 is honestly blocked (this product has no route to a Stripe test-clock customer today) and E9 is not runnable until M3 builds the only debit call site.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| Plan review (2 billing + 2 tenancy rounds + Codex cross-check + generalist) | READY | `docs/progress/respin-m1-plan-review.md`; ordered 4-fix list + 7 NOTEs applied verbatim |
| Entry gate — Respin | PASS | typecheck/lint/db:check all exit 0; **443 tests / 23 files** in CI shape (both Docker concurrency suites live in one parallel run); credits race suite 5/5 standalone; keyless `next build` exit 0 with `stripe` installed and no `STRIPE_*` env |
| Critical Path: Respin billing & credits (phase 1-4 code, all rounds) | **PASS (Ready, A)** | 12 gate rounds across 4 phases, each round's findings fixed and re-verified; final round on the evidence-run finding-1 fix passed clean on the first attempt |
| Critical Path: Respin brain tenancy (phase 1-4 code, all rounds) | **PASS (Ready, A)** | same arc; isolation/enumeration suites hardened from filename allowlists to properties derived from the installed Next and from real module exports after three successive escapes were found and closed |
| Live Stripe evidence run | E1-E7 + E4b DISCHARGED, E8 blocked (documented), E9 deferred to M3 | `docs/progress/respin-m1/ledger.md` lines 114-127; screenshots at `docs/progress/respin-m1/evidence/` |
| Definition of Done | PASS | R-20 through R-24 recorded in `decisions.md`; README runbook corrected against what actually ran (not what was assumed); all deferrals ledgered with named M2/M3 receivers |

## What got built

- **Schema** (`packages/db/src/billing-schema.ts`, migrations 0001-0009): `subscriptions`, `credit_ledger` (append-only, balance derived), `stripe_events`, `config_versions`, `pause_periods` — with knowledge-time columns (`started_known_at`/`ended_known_at`) added mid-milestone once webhook-delivery-order defects proved processing-time was the wrong clock for two staleness bounds.
- **`@respin/config`**: strict-Zod versioned config, fail-closed active-version read, append-only writes (v1 seed → v2 `monthlyPeriodDays` → v3 `stripePriceMap`, all owner-attributed).
- **`@respin/credits`**: pure ledger fold (`deriveBalance` sole authority), grant/pack/adjust/refund/debit ops, pause state machine, Stripe adapter + webhook dispatch (single-tx per event, idempotent on event id AND on three business-object uniques — checkout session, invoice, payment intent — closing double-mint paths event-id idempotency alone couldn't catch), six owner-gated actions, `VerifiedWorkspaceId` brand cage.
- **UI**: `/usage` (derived balance, ledger table, honest empty states naming their receiver), `/settings/billing` (tier/state, subscribe-vs-portal on one liveness definition, pause-before-cancel, auto-top-up), `/admin/config` (append-only editor with field-level errors and draft preservation).
- **The `cancel_at` mirror fix**: discovered only by running the live Stripe evidence session — the Customer Portal cancels via `cancel_at` on this API version, not the legacy `cancel_at_period_end` boolean the app originally read exclusively. Fixed, migrated (0009), verified against the real sandbox.

## Money-path defects the gate arc actually caught (the reason this took 4 phases and 12 rounds)

Recorded here because they are the substance of what "Ready" means for this milestone, not just its cost:
- A `now()` = `transaction_timestamp()` read on the balance fold that could permanently poison a workspace's ledger under concurrent writes (round 7-8, diagnosed from a real intermittent Docker-race failure, not from review).
- Two independent pause-staleness bounds compared knowledge time against processing time, each capable of stranding a real Stripe-side pause/resume with no further event to correct it (rounds 2-3, migrations 0007-0008).
- A resurrection hazard where a re-subscribe checkout event could permanently orphan the mirror onto a dead subscription id (round 5b).
- An `api/` gate predicate that accepted `getSessionUser` (which returns `null` and refuses nothing) as if it were an enforcing gate — a correctly-filtered cross-tenant read reachable through it (round 4, closed by binding resolution rather than name matching after a first fix still matched on local aliases).
- The evidence-run's own finding: the Portal's real cancellation shape (`cancel_at`, not the boolean) was invisible to fixtures because no fixture in this repo was ever a captured live payload — the thing every round's least-confident line named as the largest gap, confirmed true when it finally mattered.

## Pending owner evidence

- **E8** (payment-failed → grace → downgrade with a real dunning event): needs a Stripe test-clock-attached customer, which has no creation path in this product today. State was deliberately left with a failing default payment method on the live subscription so the real 2026-09-16 renewal will produce a genuine `invoice.payment_failed` — recorded so it isn't mistaken for an accident.
- **E9** (debit refused at zero balance): not runnable — M3's generation pipeline is the only debit caller, and it doesn't exist yet.

## Residuals (all ledgered, none blocking)

- `db:migrate`/`db:seed` still don't load `.env.local` the way `stripe:setup` now does — README documents the workaround (`DATABASE_URL` passed inline); a same-class fix is a cheap M2 pickup.
- Three narrow gate-evasion shapes remain that need scope/binding analysis beyond what a regex can prove (a gated call inside a branch that never runs, a real import used only in type position beside a stub, both patterns inside a template literal) — deliberately deferred to M2 when `api/` grows past two allowlisted files.
- Two informational NOTEs from the final gate round: a lapsed-grace `past_due` row never surfaces a live `cancelAt` (judged correct — a workspace already treated as free has nothing to "end"); `scheduledCancelAt`'s legacy-boolean branch can silently answer "no scheduled end" instead of "unknown" for a `currentPeriodEnd: null` shape no observed row has.
