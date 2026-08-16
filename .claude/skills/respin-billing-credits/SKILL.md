---
name: respin-billing-credits
description: Use whenever a Respin change touches billing, the credit ledger, metering, Stripe objects or webhooks, tiers/pricing/allowances, overage packs, auto-top-up, pause/resume, expiry semantics, `packages/credits`, `packages/config`, or the margin dashboard. The hard rules — the ledger is append-only and balance is derived, never stored; every billing state change is idempotent on its Stripe event id; the debit lands in the same transaction as the generation it meters. Mandatory before writing any ledger operation, webhook handler, tier gate, or pricing config, and before editing PRD §4G or tech-spec §5.
---

# Respin Billing & Credit Integrity

This is the rule canon for the **Respin billing & credits** Critical Path. Its gate is
`.claude/agents/respin-billing-reviewer.md`. Sources: `docs/initial/PRD.md` §4G
(REQ-G01–G08), `docs/initial/tech-spec.md` §5, `docs/initial/decisions.md` R-6, R-7,
R-12, `docs/initial/build-plan.md` M1. Scope is Respin (`app/`, `packages/`); the parked
Cutdown and UGC Intelligence products have their own paths.

Authored from the doc set before M0 — where a rule names a file that does not exist yet,
the rule governs the file when it lands, and the doc citation is the authority meanwhile.

## Why this path exists

This product charges real money against an internal unit (credits) whose worth is set by
config. Every failure mode here is silent: a double-granted webhook, a mutable balance
drifting from its ledger, an expiry clock that keeps running through a pause. M1 builds
metering **before** generation exists, deliberately — "metering exists before anything
burns tokens" — so this path gates from the first session.

## The rules

### B1 — The ledger is the balance (REQ-G04, R-6)

`credit_ledger` is append-only. Balance is `sum(delta)` of unexpired rows — computed,
cached per request, **never stored as a mutable counter**. A `balance` column, an
`UPDATE … SET balance`, or a cached counter that outlives the request is the violation
itself. Every debit references its generation; every credit references its source
(grant / pack / refund / adjust — adjustments carry reason codes, REQ-J01).

### B2 — Idempotent on the Stripe event id (REQ-G06)

Every webhook-driven state change is idempotent on the Stripe event id (unique
`stripe_event_id`). A double-delivered `invoice.paid` grants once. The M1 acceptance
tests name the cases: subscribe → grant, cancel → downgrade, payment-failed → grace (7
days) → downgrade, pack purchase, **double-delivered webhook with no double grant**,
debit refused at zero balance. A billing change that doesn't keep those green isn't done.

### B3 — Debit and generation are one transaction (tech-spec §3 step 5)

The ledger debit lands **inside the same transaction** that persists the generation.
Insufficient balance rejects *before* the model call, with the top-up prompt — never a
generation that ran unmetered, never a debit for output that was never persisted.

### B4 — Expiry semantics are exact (REQ-G02/G03/G08, R-12)

Monthly grants expire at `period_end + 1 month` (that IS the rollover — no separate
rollover mechanism). Packs expire at 12 months. Debits consume oldest unexpired first.
**Pause** (R-12): no charges, no grants, credits frozen, **expiry clocks suspended** —
resuming shifts expiries by the pause duration; a pause that quietly lets credits expire
is a finding. The cancel flow always offers pause first.

### B5 — Prices and costs live in versioned config, not code (REQ-G05, R-6)

Credit costs per operation, tier allowances, model tiers, and similarity thresholds live
in DB config with a version row, editable from admin without deploy. Every generation
records the config version it ran under. A hardcoded credit cost or allowance is a
finding; a config change that can't be attributed to a version is a finding. PRD §4G's
launch numbers are **indicative** — code must not assume them.

### B6 — Tier gates match the PRD table (REQ-G01, R-7)

Feature gating (modes, niches, seats, private frameworks, API) follows the PRD §4G table
exactly, from config. Free tier has no Stripe subscription — it is default state, not a
$0 price. Roles: only owners touch billing (REQ-A02).

### B7 — Money paths are integration-tested before UI polish (build-plan agreement)

Every money- or credit-mutating path carries integration tests including webhook replay
and double-delivery (tech-spec §7) **before** UI work on the same surface. The margin
dashboard (REQ-G05) reports from recorded tokens × provider price — never estimated
after the fact.

## Checklist before shipping a change on this path

- [ ] No mutable balance anywhere; ledger rows are the only write.
- [ ] Every webhook path idempotent on `stripe_event_id`; double-delivery test green.
- [ ] Debit in-transaction with the generation; zero balance rejects before the model call.
- [ ] Expiry: grants `period_end + 1mo`, packs 12mo, oldest-first, pause suspends clocks.
- [ ] No hardcoded credit cost / allowance / threshold; config version recorded per generation.
- [ ] Every threshold or price cites PRD §4G or the config row it came from.
