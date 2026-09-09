# Respin learning honesty review — Phase 10b-1 independent review, round 2 (2026-09-09)

*Report returned by `respin-learning-reviewer`; saved verbatim by the review lane.*

**Readiness: Not yet · Grade: D · The round-1 fix that stopped erasure stubs counting as signups now drops every real signup from the denominator for the whole time its deletion is pending — proven by execution, not by argument.**

**Scope**: whole uncommitted working tree vs `d5fbaf7`. Learning-path files read: `activation.ts` (full), `retention-clocks.ts` (diff + measures), `lifecycle-sql-port.ts:320-369`, `deletion-lifecycle.ts:1040-1146, 3350-3374, 845-886`, `deletion-executor.ts:510-590` + diff, `schema.ts:20-70`, `worker/retention.ts`, `worker/tests/retention-alerts.test.ts`, `packages/db/tests/activation.test.ts`, `retention-sweep-fixtures.test.ts:55-130, 195-295`, `deletion-executor.test.ts:770-800`, `tests/table-writers.test.ts:866-874`; the round-1 review, the ledger fix-round entries, the register, the 10a plan C5 + Task 1. `packages/brain/` and the Results surface are untouched by this diff.

## Movement on round-1 findings

| Round-1 finding | Status | Evidence |
|---|---|---|
| Fabricated non-activated signup per deleted account at +1 year | **Closed, but the fix regressed** (BLOCK below) | `activation.ts:432` adds `ne(users.lifecycleState, "tombstoned")`; the stub is inserted `'tombstoned'` (`lifecycle-sql-port.ts:339`); `activation.test.ts:212-253` non-vacuous. 28/28 green. |
| R-121 verification-timestamp limitation not on the returned shape (T69-R1) | **Closed** | `ACTIVATION_VERIFICATION_LIMITATION` (`activation.ts:333-334`), `limitation` required on `ActivationCohort` (`:361`), asserted per row (`activation.test.ts:286-288`). |
| `smallCell` computed but not enforced (T69-R15) | **Routed, not closed — acceptable** | No consumer outside `index.ts:120` and tests; 10a plan owns it (`:121`, mutation row `:182`). Verified against code. |
| Unasserted retention-sweep registration (T69-R5) | **Closed (weak witness)** | `worker/tests/retention-alerts.test.ts:121-145` source regexes; `production.ts:365-367` confirms. See NOTE. |
| "Written into 10a's plan" claims | **Accurate** | 10a plan `:120-122`, Done-when `:203`. |

## Findings

- ❌ BLOCK `respin/packages/db/src/activation.ts:432` — **A signup whose identity deletion is pending is in neither half of the metric.** `requestIdentityDeletion` sets the person's own `users.lifecycle_state = 'tombstoned'` at request time (`deletion-lifecycle.ts:1120-1125`; the enum is only `active | tombstoned`), and the contribution stays `pending` until the erasure transaction applies it (`deletion-executor.ts:579`). The new filter cannot distinguish that person from an erasure stub, so for the whole request→erasure window — minimum 7 days, plus external actions, plus indefinitely for a `blocked` operation — the signup vanishes from the denominator. Deleting users skew non-activated, so this biases the rate upward, toward the PRD success-metric-1 target. At HEAD the live pass had no `where` and counted this person; the regression is the round-1 fix's. **Executed**: scratchpad probe on PGlite — `signupsBefore: 1`, after a real `requestIdentityDeletion`: `usersLifecycleState: "tombstoned"`, `contributionState: "pending"`, `signupsAfter: 0`. The shipped tests miss it because `activation.test.ts:97-126` inserts the operation row directly (users row stays `active`) and `:223-228` seeds a stub with no operation. · Fix: treat a `tombstoned` row with an identity operation in `pending` as counted via its captured contribution, and exclude `tombstoned` rows only when no operation claims them; add a witness that drives a real `requestIdentityDeletion` and asserts `signups` unchanged before and after.
- ⚠️ CHANGE `respin/packages/db/tests/activation.test.ts:187-200` — the "counts each account once" witness seeds `state: "erasing"` by direct insert, never through the request path (how the BLOCK escaped; same shape as T69-R13). · Fix: drive at least one cohort assertion through `requestIdentityDeletion` → `advanceDeletionOperations` → erasure.
- ⚠️ CHANGE `respin/packages/db/tests/retention-sweep-fixtures.test.ts:116, 300` — the register claims "every producible spec seeded through the real producer"; the `activation_cohort_daily` fixture is a direct row insert (the list says so). Claim overstated by one spec. · Fix: seed through `applyActivationContributionInTx` or amend the register line.
- 💡 NOTE `respin/worker/tests/retention-alerts.test.ts:138` — source regexes a comment could satisfy (2026-08-26 lesson). Holds today. · Fix: assert via the composed sources object or plant a mutation.
- 💡 NOTE `respin/packages/db/src/activation.ts:456` — `aggregateExpired` uses strict `<` against `asOf − (2y+1d)` while the sweep measures with the same duration; one boundary day under-flags. · Fix: `<=`, or one shared predicate.
- 💡 NOTE `respin/packages/db/tests/activation.test.ts:262-267` — the title claims a per-row check the body does not make (it lives in the next test). · Fix: retitle or move.

## Checks run

- L1 sole emitter — ✅ n/a (`packages/brain/` untouched; writer map unchanged). L2 minimum n — n/a. L3 unverified never learns — n/a. L4 no pooling — ✅ (activation never summed across `metric_version`). L5 own baseline / stated exclusions — ✅ exclusions are two audited id lists; ❌ population hole at `:432` (BLOCK). L6 declared metric — ✅. L7 approval writes — n/a. L8 two claims — ✅ engineering and evidence kept separate; ⚠️ one overstated fixture claim. L9 number provenance — ✅ (R-121/C5 cited; public copy pins `COHORT_RETENTION_YEARS` to the clock).
- Least-confident lines: the billing-contact rule matches `deletion-lifecycle.ts:860-875` and is re-asserted in the erasure transaction with an empty workspace list; the tombstone-store ordering is outside this lens.

## Coverage

- read fully / skimmed as listed in Scope; not read: `retention-receiver.ts`, `creator-data-registry.ts` body, `deletion-lifecycle.test.ts`, `retention-receiver.test.ts`, `retention-clocks.test.ts`.
- commands run: `git diff HEAD --stat -- respin/`, `git status --short respin/`; `vitest run packages/db/tests/activation.test.ts worker/tests/retention-alerts.test.ts` → 28/28; scratchpad probe `grace-gap.test.ts` on PGlite → `expected +0 to be 1` (the BLOCK's execution).

## Verdict

**BLOCK**
The round-1 fix is correct for the stub it targeted and wrong for the person it forgot: every real signup disappears from the activation denominator for at least seven days per deletion request, and forever for a blocked one, in the direction that flatters the success metric — reproduced by driving the real request path against PGlite.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
