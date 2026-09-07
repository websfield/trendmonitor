# Report card — slice 2a: bounding the spend path (2026-08-28)

**Readiness: Almost.** The work asked for is built, gated twice, and the entry gate is clean. What stops this being *Ready* is not a defect on disk — it is that four reviewers raised BLOCK-severity findings in round 2, those findings were fixed, and **under the pack's two-round bound nothing has re-reviewed the fixes**. A third round is the owner's call, not mine to spend.

| Gate | Round 2 verdict | After the fix round |
|---|---|---|
| Respin billing & credits | NEEDS CHANGES (Almost / B) — 0 BLOCK, 3 CHANGE, 3 NOTE | all 3 CHANGE fixed; 2 NOTE recorded as R-41/R-42, 1 NOTE fixed |
| Respin brain tenancy | NEEDS CHANGES (Almost / B) — 0 BLOCK, 3 CHANGE | all 3 fixed |
| Respin spin compliance | **BLOCK** — 1 BLOCK, 4 CHANGE | BLOCK fixed + class-level control; 3 CHANGE fixed, 1 deferred (see below) |
| Production readiness | **BLOCK** — 2 BLOCK, 5 CHANGE | both BLOCKs fixed; 5 CHANGE fixed; 2 NOTE recorded |

**Reviewer spend: 4 reviewers × 1 round** (round 2 of 2). Round 1 was also 4 × 1. Gate intensity `lean`; billing and tenancy are `Full gates? yes` so they kept separate reviewers regardless.

## Entry checks

typecheck 0 · lint 0 · **52 files / 1092 tests / 0 failed / 0 skipped** (CI shape, Docker live) · `db:check` clean · `next build` clean, `/onboarding` 1.38 kB first-load JS, no `pg` in the client bundle. Evidence: `respin-finish/entry-gate-slice-2a-round2.txt`.

Test count: 1052 (fix round 1) → 1071 (the bound) → 1092 (round 2's fixes).

## What was built

- **The run slot** — a counting semaphore over N session advisory locks, held across the vendor call, on a dedicated pool. Closes production BLOCK 4. Limits from config, workspace-grained (owner decision, R-39).
- **The overall deadline** — `llm.overallDeadlineMs`, enforced by racing the whole call against the signal, because the SDK's retry backoff is not abortable (R-40).
- **Two smaller fixes** — the bookkeeping failure no longer masks the vendor error; the money control's pending label no longer says "Saving…".
- **One I found on the way** — a failed attempt reporting zero tokens recorded `cost_state: 'estimated'` 0, claiming we spent nothing when an aborted call may well have been billed. Now `unknown` with NULL cost.

## Least-confident probe

**Declared before the gate:** that `pgRunSlots` returns or destroys its pooled connection on every path, so the slot pool cannot silently drain and turn every run into a `server_capacity` refusal.

**It held**, and three reviewers verified it independently — one with a fake pool across ten enumerated paths, two by execution against live Postgres. The property was sound; what was missing was the test that said so, and that absence was itself the finding all four raised.

## Deferred findings (the two-round bound reached)

| Finding | Severity | State |
|---|---|---|
| `RunInferenceState.code` is typed as the full `BillingErrorCode` union rather than the screen's closed set | Medium | **Not fixed.** The derived-code test now catches the defect this would have prevented. Narrowing the type is a cleaner belt-and-braces and is a small, separate change. |
| No reconciliation for a `model_usage` row whose debit never landed; no `SIGTERM` handler | Medium | **Recorded, not built** (R-41). Owed by the slice that gives `model_usage` its first reader — M2b-2's rollup, per the scope note. |
| `packages/llm`'s own abort-classification branch is untested | Low | **Not fixed.** Both routes end non-billable, so the consequence is a message difference. |
| Marketing copy "built on mechanisms that perform" | Low | **Pre-existing, out of this diff.** Belongs to the outbound-truth machinery. |

## Definition of Done

- Docs updated in the same change: `decisions.md` R-39/R-40/R-41/R-42; `tech-spec.md` §6 amended **by that one bullet**, neighbours byte-unchanged; `env.example` documents `RUN_SLOT_POOL_MAX`, the 26-connection footprint and the operator procedure for each refusal code.
- Reachability: a creator pressing the run button on `/onboarding` reaches all of it — **walked in a real browser**, including a real Anthropic call.
- No migration: an advisory lock needs no table, and `db:check` confirms no drift.

## The honest part

Three things in this slice were *my* defects, found by others:

1. **I recorded a claim about a test that did not exist**, in the docblock of the one control whose subject is that a claim must not rest on an argument. All four reviewers found it.
2. **I hardened against one named counterexample and left the class open** — pg-pool's second connect-timeout message. That is CLAUDE.md's 2026-08-18 lesson, for the second time in one session.
3. **I added copy to one registry and not the second**, so the feature's two refusal sentences rendered as "Something went wrong" with 194 UI tests green. The class-level control now derives the requirement instead of restating it — and my first draft of *that* scan was itself fail-open.

One unexplained single-run test failure is recorded in the evidence file rather than dismissed: it did not reproduce in three subsequent runs, the cause was not established, and the bound I introduced that could plausibly explain it was loosened rather than defended.
