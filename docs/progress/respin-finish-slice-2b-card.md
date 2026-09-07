# Report card — slice 2b: the spend record that outlives deletion (2026-08-29)

**Readiness: Ready.** Both Full-gates Critical Paths converged: tenancy PASS since round 2, billing NEEDS CHANGES → NEEDS CHANGES → NEEDS CHANGES with strictly narrowing severity and reachability, every named finding fixed and pinned by a permanent regression test, closed at the owner's explicit go-ahead after round 3 (per this project's "round three needs the person's go-ahead, asked for at that moment" rule).

| Gate | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Respin billing & credits | **BLOCK** — 2 BLOCK | NEEDS CHANGES — 1 CHANGE, live on an admin-only report | NEEDS CHANGES — 1 CHANGE, **confirmed not reachable through any code path today** |
| Respin brain tenancy | NEEDS CHANGES | **PASS / Ready** | — (not re-run; already Ready) |

**Reviewer spend: billing 3 rounds (Full gates, kept separate under `lean`); tenancy 2 rounds.** Round 3 was launched only after the owner was asked and chose to run it, rather than close on round 2's evidence.

## Entry checks

typecheck 0 · lint 0 · **1324/1325 (0 skipped)** on the CI shape, Docker live — the one red is the pre-existing `(marketing)/for/[audience]` gate-completeness gap from a concurrent, unrelated marketing stream, confirmed to predate this session's work · `db:check` clean · `next build` clean, including `ƒ /admin/margin`. Final confirmation batch: `spend-rollup.test.ts` (24/24), plus `spend-rollup.docker.test.ts` + `inference-race.docker.test.ts` + `concurrency.docker.test.ts` together — **47/47**.

## What was built

- **`workspace_spend_monthly`** — an upsert-maintained rollup, `(workspaceId, periodMonth, tier)` grain, deliberately with no FK to `workspaces` so it outlives an R-30.5/R-54 deletion. Written inside `recordModelUsage`'s own transaction (R1–R6, proven on real Postgres via a forced-poison pair).
- **`/usage`'s credit-burn panel** — `monthlySpend(scope, periodStart)` over `credit_ledger`, scoped through `assertScoped`, correctly excluding `expiry`/`adjust` rows and cross-workspace debits (R7–R9, the T1 adversarial cross-workspace test).
- **`/admin/margin`** — a minimal operator reader over the rollup: spend table, reconciliation counts (reconciled/orphaned/drift), and an `unbilledAttempts` report explicitly framed as advisory ("report, not automatic charge"). Renders no gross-margin figure (R14–R15, proven by a real forbidden-word scan over visible, tag-stripped text).
- **`pseudonymiseWorkspaceSpend`** — the R-54 deletion answer (random-id replacement, mapping discarded), plus its own deletion-executor tripwire test (R16–R17).
- **`burnPeriodStart`** — pure helper resolving the billing-period start from a live Stripe subscription or a UTC calendar month.

## Least-confident probe

**Declared before the gate:** that `reconcileSpend`'s `unbilledAttempts` query matches `countBillableAttempts`'s real pricing semantics exactly — both the *population* it counts (which outcomes/flags are billable) and the *grain* it counts at (attempts, not rows).

**It did not hold on the first two tries.** Round 1 found the population inverted (a filter I had reasoned about instead of re-reading `with-workspace.ts`'s actual authority). Round 2 found the query summing session-default timezone instead of UTC. Round 3 found the grain wrong — ranking rows where `countBillableAttempts` counts `DISTINCT attempt_id`, a gap a documented-but-not-yet-reachable retry shape would have exploited. Each was root-caused against the real authority function, fixed, and given a fixture test that plants the exact failing scenario as a permanent regression check.

## Deferred / residual

| Item | State |
|---|---|
| Two "can…" browser walks (real inference → `/usage` shows burn → `/admin/margin` shows cost → delete profile → reconciliation reports `orphaned`) | **Not done.** No live `ANTHROPIC_API_KEY` was confirmed available this session (`.env.local` read was permission-denied), and spending real vendor money autonomously was judged outside this session's authorized scope without being asked. Recorded as an owner-facing residual, not claimed as passed. |
| `reconcileSpend`'s workspace-vs-profile grain gap | **Documented, not redesigned** — a tenancy round-1 finding accepted as a known limitation, carried in the function's own docblock, proven by a permanent test that asserts the current (documented) behaviour rather than papering over it. |

## Definition of Done

- Docs updated in the same change: `decisions.md` R-57 (same-transaction rollup + the burn/margin split correction); `docs/progress/respin-finish-open-items.md` closes R-30.5/R-30.9/R-41 by append.
- Reachability: `/usage`'s burn panel and `/admin/margin` are both real routes behind `requireAdmin`/session auth, proven by `gate-completeness.test.ts` and `next build`'s route table — the two browser walks are the one residual, named above rather than silently skipped.
- No cross-referenced doc left stale: `creator-data-registry.ts`'s deletion-behaviour reason for `workspace_spend_monthly` matches R-54's decided wording, pinned by an existing test.

## The honest part

Three of this slice's four billing findings were my own reasoning errors, not oversights of omission:

1. **I inverted `consumedIncludedBuild`'s meaning** — read it as "this attempt was priced" when it is `true` on every successful attempt and on billable-but-refused ones. Caught only by re-reading `countBillableAttempts`'s real implementation, not by re-deriving from the field name.
2. **I left a `date_trunc` unpinned to a timezone**, trusting the session default rather than being explicit — the same class of "worked on my machine" gap this project's Lessons section already warns about elsewhere.
3. **I ranked rows where the real authority counts attempts** — a grain mismatch that only a reviewer's own scratch test (planting the exact two-row-one-attempt shape) surfaced; my own 23-test suite at the time did not cover it because I had not yet imagined the shape `onboarding-schema.ts`'s docblock already named as a possibility.

The pattern across all three rounds: every fix was root-caused against the actual pricing authority function, not against the reviewer's restated symptom — and every fix left behind a fixture test that plants the failing scenario permanently, not just a corrected line.
