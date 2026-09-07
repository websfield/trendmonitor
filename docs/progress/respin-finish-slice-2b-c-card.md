# Slice 2b-c report card — the spend-retention correction

**Readiness: Ready**
**Date: 2026-08-30**
**Plan: [`respin-finish-master-plan.md`](../plans/respin-finish-master-plan.md) · Card: [`respin-finish-phase-2b.md`](../plans/respin-finish-phase-2b.md) (corrective addendum to the closed slice-2b card)**

> **Superseded capability note (Slice 4c, 2026-08-31):** this card is immutable evidence of the Slice 2b-c run, not current reachability proof for R4a. Slice 4c removed `applyReconciliationDelta`, its `model_usage` UPDATE allowance, typed error/copy plumbing, and reconciliation-mutation tests because no real provider/job/operator-import caller exists. The retained unknown denominator, normal spend UPSERT, route rename, and read-only `reconcileSpend` report remain current. Corrected-cost mutation is explicitly re-homed to the future real integration that can prove payload identity and idempotency.

## The line this addendum closes

**Keep the unknown-cost share after detail deletion, reconcile cost deltas once, use correct Free periods, and see cost at the accurately named route.**

Slice 2b closed 2026-08-29 at Ready, but a 2026-08-29 plan audit found its card's own corrected scope (R4, R4a, R14/R15) had not actually been built: `workspace_spend_monthly` had no retained `unknown_call_count`, `costState` never transitioned to `reconciled` anywhere in the codebase (no writer existed), and the operator route still read `/admin/margin`. This addendum builds exactly those three gaps. `burnPeriodStart`'s Free/paid UTC-period split (R7) was checked and found already correct from slice 2b — no change needed there.

## What got built

- **R4 — retained `unknown_call_count`.** Migration `0017_clumsy_wither.sql` adds `workspace_spend_monthly.unknown_call_count integer NOT NULL DEFAULT 0`, backfilled from extant `model_usage` at the exact grain `upsertSpendRollup` uses. `upsertSpendRollup` (`packages/db/src/spend-rollup.ts`) increments it on `costState === 'unknown'`, never `cost_micro_usd`. The unknown share now survives `model_usage` detail deletion by construction — it lives on the retained row, never derived from the deleted detail. Surfaced on `/admin/model-spend` as an "Unpriced calls" column.
- **R4a — `model_usage`'s first sanctioned UPDATE.** `applyReconciliationDelta` transitions one row `estimated`/`unknown` → `reconciled` by primary key inside its own transaction: `SELECT ... FOR UPDATE` locks the row first, the already-`reconciled` check runs strictly after the lock is held (no TOCTOU), and the correct branch-specific delta (unknown → `+cost`, `-1` unknown-count; estimated → `reconciledCost − estimatedCost` only) applies to the rollup via a new `applyRollupDelta` helper. No live caller exists yet (no vendor cost-reconciliation webhook in this codebase) — built ahead of that trigger the same way R16/R17's pseudonymisation function was, with tests substituting for the missing caller.
- **R14/R15 — the route rename.** `app/(admin)/admin/margin/` moved to `app/(admin)/admin/model-spend/`; a 307 redirect in `next.config.ts` covers the old path; `requireAdmin()` still runs first on the new page. Renders no margin figure (unchanged from slice 2b, re-verified at the new path).

## Gate summary

| Gate | Round 1 | Final |
|---|---|---|
| Respin billing & credits (Full gates) | NEEDS CHANGES (0 BLOCK · 1 CHANGE(Medium) · 2 NOTE) | **PASS** (fixed without re-review) |
| Respin brain tenancy (Full gates) | **PASS** (0 BLOCK · 1 CHANGE flagged for billing's domain, not tenancy's · 1 NOTE) | **PASS** |

**Reviewer spend: 2 agent runs**, both round 1, run against the main tree rather than an isolated worktree — this project's own slice-3 ledger records that a worktree reviews HEAD, not uncommitted changes, and nothing in this branch (187+ files across five prior slices) has been committed, so an isolated worktree would have shown each reviewer a stale, near-empty diff. All findings were Medium-or-below, so both gates close in this build lane with no second reviewer round.

## Findings and fixes (all fixed without re-review)

- **Billing CHANGE (Medium) — silent-drop on a repeat/corrected reconciliation call.** `applyReconciliationDelta`'s no-op branch couldn't distinguish a duplicate webhook delivery from a genuine second reconciliation carrying a corrected price; the correction would have vanished with no trace. Fixed: the no-op branch now returns `{ applied: false, priorCostMicroUsd }` instead of a bare `{ applied: false }`, so a future caller can detect and log a real mismatch. Docblock updated with an explicit `KNOWN LIMITATION` note matching this file's existing convention. New test proves the mismatch is now detectable.
- **Tenancy CHANGE — a real, empirically-reproduced race, flagged for billing's domain.** The docker test proving `applyReconciliationDelta`'s idempotency under concurrent real-Postgres transactions failed 1 run in 7 (`got [true,true]` — both racing calls applied). Root-caused, not assumed: 40 clean local runs first (couldn't reproduce the original flake in isolation), then direct inspection confirmed the function's own locking was already correct (lock-then-check, no TOCTOU) — the bug was the **test's** synchronization, a JS-flag-plus-fixed-sleep handshake that proves ordering in JS but never confirms genuine DB-level contention. Replaced with a `pg_stat_activity`-based lock witness (this repo's own precedent from `activate.docker.test.ts`), with a symmetric gated callback so either racing call can be the "loser." A first attempt at the witness (`pg_locks` on `locktype = 'tuple'`) was itself empirically wrong — row-lock waiters block on the holder's `transactionid`, not a tuple lock — caught by the fix reddening instead of passing. Final version verified **40/40** across two independent 20-run batches.
- **Billing NOTE — stale `margin-*` test ids after the R14 rename.** Renamed to `model-spend-*` throughout `model-spend-view.tsx` and `model-spend-ui.test.tsx`.
- **Billing NOTE — no rollback/restore note on migration 0017.** This repo carries no down-migrations and no prose in `.sql` files; per its own convention, the rollback/restore note (functionally safe: additive `DEFAULT 0 NOT NULL` column plus backfill only, no data loss) was appended to `decisions.md`'s R-59 entry instead.

## Entry gate

Final run, CI shape, Docker live, `TEST_DATABASE_URL` set: typecheck clean, lint clean, `db:check` clean, **1389/1390 passed, 0 skipped**. The one failure is `tests/gate-completeness.test.ts`'s pre-existing `(marketing)/for/[audience]` gap — untracked in git, not created by this diff, recorded as belonging to a concurrent marketing stream in slices 2b/3/4's own ledger entries.

## Deferred / residual

| Item | State |
|---|---|
| The two "can…" browser walks (real inference → `/usage` burn → `/admin/model-spend` cost row → delete profile → reconciliation `orphaned`) | **Not repeated this session** — already recorded as a slice-2b residual (no confirmed live `ANTHROPIC_API_KEY` this session); this addendum changed the reader (`/admin/model-spend`) and one writer branch (`applyReconciliationDelta`, no live caller), not the walked path itself. |
| R4a's delta math and idempotency contract | Validated only by tests written against this implementation, not against a real reconciliation integration's actual payload shape — no such integration exists in this codebase yet. If a real source reports costs per `attempt_id` rather than per `model_usage.id`, or batches multiple rows per event, the contract will need to change. Named explicitly as the least-confident bet both build passes made. |
| Corrected-price detection (the Fix-1 return shape) | Makes a mismatch **detectable**, not **enforced** — nothing today diffs `priorCostMicroUsd` against an incoming value, since no caller exists yet. A careless future caller could still check only `.applied` and discard a correction silently. |

## Definition of Done

- All of phase-2b.md's R4, R4a, R14, R15 checkboxes closed; R1-R3, R5-R13, R16-R17 were already closed by slice 2b proper and untouched by this diff.
- Both Full-gates Critical Paths PASS.
- Docs updated in the same change: `decisions.md` R-59 (this addendum) plus its rollback/restore addendum; `respin-finish-phase-2b.md`'s R4a line carries a dated addendum; this card; the master plan's slice-2b-c progress row (below).
- Reachability: `/admin/model-spend` is a real route behind `requireAdmin()`, proven by `gate-completeness.test.ts` and `next build`'s route table. `applyReconciliationDelta` has no live caller yet — an accepted, named gap (see Deferred), not a silent one.
