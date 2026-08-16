# Phase 2 — `packages/config` + `packages/credits` core (balance authority, debit, tier state machine)

**Feature:** respin-m1 · **Master plan:** `docs/plans/respin-m1-master-plan.md` · **Depends on:** 1

## Project Conventions Pinned (READ FIRST)

**Golden rules (CLAUDE.md, verbatim):**
1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.** Verify library APIs against the installed version before use.

**Respin non-negotiables that bind this phase (verbatim):**
- **2. The ledger is the balance.** `credit_ledger` is append-only, balance derived; webhooks idempotent on Stripe event id; debit in the generation's transaction (REQ-G04/G06, R-6).
- **5. No leakage.** Nothing crosses profiles or workspaces.
- **6. No invented specifics, no guarantees.**

**Billing skill rules (verbatim headlines):**
- **B1** — Balance is computed, cached per request, **never stored as a mutable counter**. A `balance` column, an `UPDATE … SET balance`, or a cached counter that outlives the request is the violation itself.
- **B3** — The ledger debit lands **inside the same transaction** that persists the generation. Insufficient balance rejects *before* the model call.
- **B4** — Grants expire `period_end + 1 month` (that IS the rollover). Packs 12 months. Oldest unexpired first. Pause: expiry clocks suspended; a pause that quietly lets credits expire is a finding.
- **B5** — Costs/allowances/thresholds live in DB config with a version row. A hardcoded credit cost or allowance is a finding.
- **B7** — Money paths get integration tests before UI polish.

**Lessons:** 2026-07-21 (prove installs by import); 2026-07-30 (a claimed property is asserted in a test or deleted; guard the class at the boundary every consumer passes); 2026-08-02 (pin configs; know which config produced green); 2026-08-10 (present-and-verified vs present-and-unrun).

**Stack & boundaries:** `app/` imports `packages/`, never the reverse; packages may hold the DB connection (the `packages/auth` precedent); factory pattern `createX(db)` + PGlite-testable, mirroring `packages/auth/src/create-auth.ts`. Docker concurrency harness from Phase 1 (`TEST_DATABASE_URL`, loud skip).

**Agents:** implementer is `respin-engineer`. Do NOT request agents not in `.claude/agents/`.

## Requirements Checklist (functional)

- REQ-G02: allowance grants with `expires_at = period_end + 1 month`; monthly reset semantics fall out of expiry (no separate rollover mechanism).
- REQ-G03 (core half): packs consumed after monthly credits — realized by the **D-M1-8 order** (soonest effective expiry first; grants' 1-month expiries naturally precede packs' 12-month ones); debit refused at zero/insufficient balance with a typed error the UI can turn into the top-up prompt.
- REQ-G04: every op appends; every debit references its target (`refType`/`refId`); every credit references its source.
- REQ-G05 (read/write API): `packages/config` versioned read/append, Zod-validated; **nothing** in `packages/credits` hardcodes a cost or allowance.
- REQ-G06 (state half): grace state derived lazily — `graceExpiresAt` passed ⇒ effective tier `free` (D-M1-4).
- REQ-G08 (semantics half): paused ⇒ debits refused (read-only) and effective-expiry shift per D-M1-3/D-M1-7. **"No grants while paused" is a Stripe-enforced property (pause_collection issues no invoices), NOT a `grantCredits` guard** — `grantCredits` itself carries no pause check (a paid invoice is a fact that always grants; Phase 3's paused-`invoice.paid` contract depends on this — plan-review F3); only allocating/debiting ops are pause-guarded.

## Requirements Checklist (technical)

- Single balance authority: exactly one exported function derives balance; every other consumer (debit check, UI, tests) calls it. A second derivation is a finding.
- D-M1-7 fold + lazy `expiry` materialization, idempotent on lot id; invariant test: post-materialization `sum(delta)` of all rows === fold result.
- All ops take `TxLike` (composable into M3's generation transaction — B3's consumer contract).
- `VerifiedWorkspaceId` branded type introduced in `packages/db` (`with-workspace.ts` returns it; credits' public API accepts only it; `trustWorkspaceId()` escape hatch exported for non-session resolution, **lint-forbidden in `app/**`**).

## Edge Cases & Failure Paths (each maps to a task/test below)

- Debit larger than balance; debit exactly equal to balance; zero/negative-cost debit request (rejected — CHECK + API validation).
- Debit spanning lots (partial consumption across grant then pack).
- **Consumption order is D-M1-8 (soonest effective expiry first; equal expiry → older first; then grants before packs; never-expiring `adjust` lots last)** — cases: a January pack (12-mo expiry) coexisting with a February grant (1-mo expiry) → the grant is consumed first even though the pack is older (the REQ-G03 case billing round-1 finding 5 named); equal-expiry tiebreaks both directions.
- Lot expires with remainder while unconsumed; lot fully consumed before expiry (no `expiry` row — nothing remained).
- **Fold domain covers all six kinds (D-M1-7):** `refund` is a lot whose `expires_at` was computed at refund time from the original debit's consumed lots — case: grant 100 → debit 40 → lot expires (materialized `expiry −60`) → refund +40 referencing that debit: fold-with-history equals `sum(delta)` (the invariant holds because the fold replays the existing `expiry` row, never recomputes it); positive `adjust` with and without `expires_at`; negative `adjust` allocates like a debit.
- Pause opened, lot's natural expiry falls inside pause → effective expiry shifted by pause duration; multiple sequential pauses compound (chronological fold); pause still open (ended_at null) → clocks frozen "now".
- Debit attempted while paused → typed refusal distinct from insufficient-balance.
- **Clock discipline:** caller `at` produces a pure read only — materialization and pause writes key to DB `now()` (D-M1-7). Every **allocating write** (`debitCredits`, negative `adjust`, pause ops) rejects an `at` beyond 60s of DB `now()` **or earlier than the workspace's latest ledger/pause event** with typed errors — a stale clock must never let a debit pass its balance check against lots that have since expired (billing round-1 finding 4 + round-2 finding 3).
- Concurrent debits racing the same balance (Docker) — total consumed never exceeds available.
- Concurrent identical grant (same `stripeEventId`) — exactly one row (unique constraint under concurrency).
- **Concurrent `deriveBalance` over an expired lot (Docker)** — bare-`db` materialization runs in its own transaction under the per-workspace advisory lock with on-conflict-do-nothing + re-read: exactly one `expiry` row, all callers return the same balance (billing round-1 finding 3). **Mixed case:** a `debitCredits` transaction (holding the lock, materializing in-tx) racing a concurrent bare-`db` derivation over the same expired lot — no hang, one `expiry` row, consistent balances (billing round-2 finding 2).
- **Cross-workspace isolation (tenancy round-1 finding 2):** two-workspace suite — seed workspaces A and B; every public credits API (`deriveBalance`, `debitCredits`, `getWorkspaceBillingState`, pause ops, each ledger op) is exercised on A and asserted unaffected by B's rows **and by B's open pause** (B's pause must not shift A's effective expiries); enumerated 1:1 against the exported API surface, mirroring the AC-7 completeness pattern.
- Config: empty `config_versions` table → typed fail-closed error (never a default cost of 0 or silent free generation); malformed content row → same.
- Inverse ops: `refund` and `adjust` (requires reason code) exist and are tested — the M6 admin UI consumes them later.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| Config read | no/invalid active version | typed `ConfigUnavailableError`; **debits and grants refuse** (fail closed — no operation prices itself) | fix config; ops retry naturally | test |
| Balance fold | ledger contains sign-violating row (should be impossible via CHECK) | fold throws (integrity error), never guesses | manual investigation; CHECKs make it unreachable | test with hand-forged row via raw SQL |
| Docker suite | env absent | loud named skip (never silent green) | CI service container | Phase 1 harness |
| Clock (`at` param) | caller passes stale `at` | all time-dependent APIs take explicit `at: Date`; production callers pass `new Date()` at the entry point only; allocating writes reject `at` outside skew of DB `now()` | — | pure-read table cases use fixed historical dates; allocating-write tests construct fixtures **relative to real now** so the guard passes (plan-review F6) |

## Handoff Contracts

**To Phase 3 (verbatim signatures — Phase 3 imports these):**
```ts
// packages/credits/src/ledger.ts
grantCredits(tx, { workspaceId: VerifiedWorkspaceId, amount, expiresAt, stripeEventId?, refType, refId, configVersion }): Promise<LedgerRow>
purchasePackCredits(tx, { workspaceId, amount, expiresAt, stripeEventId?, refType, refId, amountCents, configVersion? }): Promise<LedgerRow>
adjustCredits(tx, { workspaceId, delta, reasonCode, expiresAt?, refType?, refId? }): Promise<LedgerRow>  // positive delta = lot (expiresAt nullable); negative allocates like a debit
refundCredits(tx, { workspaceId, amount, originalDebitId, stripeEventId? }): Promise<LedgerRow>  // expires_at computed per D-M1-7 from the original debit's consumed lots; NO M1 caller — ships package-tested for the M6 admin surface (plan-review F9)
debitCredits(tx, { workspaceId, cost, refType, refId, at }): Promise<LedgerRow>  // throws InsufficientCreditsError | WorkspacePausedError — cost is caller-resolved (M3 prices it from config before calling), so debit itself reads no config (plan-review F11)
// packages/credits/src/balance.ts
deriveBalance(db|tx, workspaceId, at): Promise<{ balance: number; lots: LotView[] }>
// sole authority; consumption order per D-M1-8; caller `at` = pure read; lazy expiry materialization
// keyed to DB now(). Lock composition (D-M1-7): given a caller tx (debit path, lock already held) it JOINS
// that tx (same-session advisory re-acquire = no-op); given bare `db` it opens its own tx under the
// per-workspace advisory lock, on-conflict-do-nothing + re-read
// packages/credits/src/state.ts — tier derived AT READ TIME from subscriptions.stripePriceId × active config stripePriceMap
// (no stored tier column — Phase 1 D-M1 refinement: config fixes self-heal without event replay);
// unmapped price ⇒ tier 'free' + reason 'unmapped_price' (fail closed on entitlements, remedy surfaced by UI)
getWorkspaceBillingState(db, workspaceId, at): Promise<{ tier: 'free'|'creator'|'pro'|'studio'; state: 'free'|'active'|'grace'|'paused'; reason?: 'unmapped_price'; graceExpiresAt?; resumesAt? }>
// packages/credits/src/pause.ts
recordPauseStart(tx, workspaceId, at) / recordPauseEnd(tx, workspaceId, at)
// record-keeping only — the pauseMonths bounds check lives in Phase 3's pauseSubscription action, which
// resolves months against config BEFORE calling Stripe and this (plan-review F10); `at` validated against
// DB now() and the workspace's latest recorded event — future/retroactive values rejected
// packages/config/src/index.ts
getActiveConfig(db): Promise<{ version: number; content: RespinConfigV1 }>
appendConfigVersion(db, content: RespinConfigV1, createdBy: string): Promise<number>
```
**To M3 (pinned now, consumed later):** `debitCredits` composes into the generation-persist transaction; the M3 pipeline calls it with the generation id as `refId` inside the same `tx`.
**From Phase 1:** table shapes + the seeded config v1 JSON (the Zod schema here must parse that exact seed — parity test).

## Implementation Tasks

| # | Task | Owner agent | File(s) |
|---|---|---|---|
| 1 | `packages/config`: package scaffold (mirror `packages/auth` layout), `RespinConfigV1` Zod schema matching the Phase-1 seed exactly, `getActiveConfig` (fail-closed), `appendConfigVersion` | respin-engineer | `packages/config/*` |
| 2 | Parity test: Phase-1 seeded row parses under the Zod schema (drives from the real seed function, not a copied literal) | respin-engineer | `packages/config/tests/config.test.ts` |
| 3 | `VerifiedWorkspaceId` brand in `with-workspace.ts` (+ `trustWorkspaceId` escape hatch) and an ESLint **allowlist** rule: `trustWorkspaceId` importable ONLY from the named sanctioned files (`packages/credits/src/stripe/{webhooks,customers}.ts` + test files) — everywhere else, including all other `packages/**`, is denied; fixtures prove allow, app-deny, and package-deny directions (AC-8) | respin-engineer | `packages/db/src/with-workspace.ts`, `respin/eslint.config.mjs`, `tests/import-boundary.test.ts` |
| 4 | `packages/credits` scaffold + `ledger.ts` ops per the contract (all `TxLike`-composable; advisory per-workspace xact lock — `pg_advisory_xact_lock(hashtextextended(workspace_id::text, 0))` — taken in `debitCredits` and lot-writing ops; verify the function exists in installed PGlite/pg, golden rule 9) | respin-engineer | `packages/credits/src/{index,ledger}.ts` |
| 5 | `balance.ts`: chronological lot-allocation fold with **consumption order per D-M1-8** (soonest effective expiry first; equal → older first → grants before packs; never-expiring lots last), pause-aware effective expiry (fold over `pause_periods`), lazy `expiry` materialization idempotent on lot id — joining the caller's tx when one is passed (the debit path already holds the advisory lock; same-session re-acquire is a no-op), own-tx-under-lock only on the bare-`db` path (D-M1-7 lock composition) | respin-engineer | `packages/credits/src/balance.ts` |
| 6 | `state.ts` tier/state machine (D-M1-4 lazy grace) + `pause.ts` (start/end writes `pause_periods` + mirror fields; **bounds from config `pauseMonths`** — never a hardcoded or type-level 1–3) | respin-engineer | `packages/credits/src/{state,pause}.ts` |
| 7 | Table-driven expiry/pause suite: every Edge-Case bullet above = ≥1 named case with fixed dates; the invariant test (sum === fold) | respin-engineer | `packages/credits/tests/balance.test.ts` |
| 8 | Ledger-op suite on PGlite: every op, every typed error, refund/adjust, debit-spanning-lots | respin-engineer | `packages/credits/tests/ledger.test.ts` |
| 9 | Docker race suite: concurrent debits never over-consume; concurrent same-event grants yield one row; N concurrent `deriveBalance` over an expired lot → exactly one `expiry` row, all callers agree | respin-engineer | `packages/credits/tests/concurrency.docker.test.ts` |
| 9b | Two-workspace isolation suite per the cross-workspace edge-case bullet, enumerated 1:1 against the exported credits API (a public function without an isolation case fails the enumeration assertion, mirroring AC-7) | respin-engineer | `packages/credits/tests/isolation.test.ts` |
| 10 | Wire new packages into workspace scripts (`typecheck` recursion already covers `--filter=!respin -r`; verify), CI concurrency step covers the new suite; ledger entries | respin-engineer | `respin/package.json`, `.github/workflows/respin.yml`, `docs/progress/respin-m1/ledger.md` |

## Files to Create / Modify

Create: `packages/config/{package.json,tsconfig.json,src/index.ts,src/schema.ts,tests/config.test.ts}` · `packages/credits/{package.json,tsconfig.json,src/{index,ledger,balance,state,pause}.ts,tests/{ledger,balance,isolation}.test.ts,tests/concurrency.docker.test.ts}`.
Modify: `packages/db/src/with-workspace.ts` (brand only — **no new accessors yet**, that's Phase 4) · `respin/eslint.config.mjs` · `respin/tests/import-boundary.test.ts` · `respin/package.json` · `.github/workflows/respin.yml` · `docs/progress/respin-m1/ledger.md`.

## Migration Steps

None (no schema change; Phase 1 owns 0001). If implementation reveals a missing column, **stop and amend Phase 1's migration via a new 0002** — never edit 0001 after Phase 1 completes.

## Verification Steps (paper-dry-run)

1. `pnpm -C respin install` — new workspace packages resolve; prove by import (typecheck), not exit code.
2. `pnpm -C respin typecheck` — requires tasks 1–6.
3. `pnpm -C respin test` — requires tasks 2, 7, 8 (PGlite); concurrency suites loud-skip locally without env.
4. `TEST_DATABASE_URL=… pnpm -C respin --filter @respin/credits test:concurrency` (and the db one from Phase 1 still green) — requires task 9 + Docker up.
5. `pnpm -C respin lint` — the new `trustWorkspaceId` rule proven by fixtures both directions (task 3).
6. `pnpm -C respin build` — keyless.

## Acceptance Criteria (PASS/FAIL, with evidence)

- AC-1: every Handoff-Contract signature exists as written (typecheck + explicit API-surface test importing each).
- AC-2: the invariant test passes: after lazy materialization, `sum(delta)` over ALL rows equals the fold's balance, across every table-driven case.
- AC-3: every Edge-Case bullet has a named test; the suite enumerates them 1:1 (test file section comments name the bullet).
- AC-4: debit at insufficient balance throws `InsufficientCreditsError` *without writing a row* (assert row count unchanged); debit while paused throws `WorkspacePausedError` likewise.
- AC-5: Docker race — 20 concurrent debits of 10 against a 100 balance: exactly 10 succeed, final fold = 0, sum(delta)=0 consumed beyond available never occurs.
- AC-6: no hardcoded cost/allowance: grep for the allowance literals (25, 250, 2000, 8000) and any cost-map-shaped object in `packages/credits/src` finds none outside tests; single-digit cost literals are ungreppable noise, so their absence is asserted by the reviewer reading every priced call site pulling from `getActiveConfig` (B5; plan-review F7).
- AC-7: config fail-closed: empty table and malformed row both yield `ConfigUnavailableError`; no code path defaults a price.
- AC-8: the `trustWorkspaceId` lint is an **allowlist of named files** (`packages/credits/src/stripe/webhooks.ts`, `packages/credits/src/stripe/customers.ts`, and test files), not a deny-list of `app/**` — fixtures prove: importable from an allowlisted path, unimportable from `app/**` AND from a non-allowlisted `packages/**` fixture; plus a grep-based test asserting **no live import site exists outside the allowlist** (at this phase the allowlisted files don't exist yet, so the assertion passes with zero sites; Phase 3 tightens it to exact-match once they land — plan-review F5).
- AC-9: the two-workspace isolation suite covers the exported credits API 1:1 (enumeration assertion green), including B's-open-pause-does-not-shift-A's-expiries.
- AC-10: `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build` all exit 0 with no `STRIPE_*`/`DATABASE_URL` env set (command outputs in the ledger entry).

## Least confident (one line)

The pause-aware effective-expiry fold (D-M1-3 + D-M1-7 interacting: shifted expiries feeding lot allocation order and lazy materialization) — the one place two clocks compose; if any table-driven case is wrong, it's here.

## Out of Scope (Surgical Changes)

No Stripe imports anywhere this phase; no `app/` UI; no accessor-map extension; no edits to migration 0001, `src/`, `cutdown/`.

## Completion Criteria (Definition of Done)

Entry gate clean (or no new failures vs baseline); ACs green with named evidence; ledger updated; the billing + tenancy reviewer gates run at phase review.
