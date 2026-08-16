# Plan review — respin-m1 (Billing and the Credit Ledger)

**Readiness: Almost · Grade: C · The plan is executable end-to-end and the round-2 fixes are all present, but two likely production failures (repeat-checkout double-subscription, upgrade-proration invoice) have no receiving task and one cross-phase pause/grant wording conflict could produce contradictory code — all four blocking fixes are a dozen lines of plan text.**

Reviewer: plan-reviewer (integrity + consolidation) · Date: 2026-08-14
Inputs: master plan + phases 1–4 + brief + codebase review, read in full; repo cross-checks (agents, referenced files, decisions.md tail, docker-compose creds, `with-workspace.ts` scope shape).

## Review history

| Round | Reviewer | Verdict | Disposition |
|---|---|---|---|
| Step 5.5 | Codex cross-check (Mode 2) | FAIL — 8 P1 | All fixed or dismissed-with-reason before Claude reviewers ran |
| 1 | respin-billing-reviewer | NEEDS CHANGES (6 CHANGE + 5 NOTE) | Absorbed into D-M1-1/6/7/8, Phase 2/3 text |
| 2 | respin-billing-reviewer | NEEDS CHANGES (5 CHANGE + 4 NOTE) | All applied — **verified this round** (see fix verification) |
| 1 | respin-tenancy-reviewer | BLOCK (stripe_events PII/deletion + 4 CHANGE) | BLOCK cleared in round 2 |
| 2 | respin-tenancy-reviewer | NEEDS CHANGES (3 CHANGE + 3 NOTE) | All applied — **verified this round** (see fix verification) |
| final | plan-reviewer (this review) | **NOT READY (Almost, C)** | 4 CHANGE + 7 NOTE below |

## Round-2 fix verification (spot-checked in current text)

Billing round-2 — all present:
- ✅ Master plan Derived Budgets "Lot consumption order" row cites **D-M1-8** (master-plan:83) and D-M1-8 exists as its own decision row (master-plan:43).
- ✅ Phase 2 task 5 orders the fold "per D-M1-8" (phase-2:117); REQ-G03 row cites "the D-M1-8 order" (phase-2:39).
- ✅ D-M1-7 lock-composition paragraph present (master-plan:42, "Lock composition (billing round-2)"); mirrored in the Phase 2 contract comment (phase-2:91–93) and the mixed debit-tx-vs-bare-db Docker race case (phase-2:64).
- ✅ Clock-discipline bullet extended to every allocating write incl. `debitCredits` and negative `adjust` (phase-2:61).
- ✅ `pauseSubscription(db, scope, months: number, at)` with runtime validation against config `pauseMonths`, "never a type-level bound" (phase-3:83; phase-2 task 6 echoes "never a hardcoded or type-level 1–3").
- ✅ Phase 1 task 9 appends R-20 as "D-M1-1…8" (phase-1:104).

Tenancy round-2 — all present:
- ✅ Phase 1 functional checklist no longer calls `pause_periods` append-only — "one row per pause period, close-on-resume (D-M1-3)" (phase-1:36), consistent with the technical-checklist exception (phase-1:42) and D-M1-3.
- ✅ Phase 3 task 8b restricts the config **write** facade export (`appendConfigVersion`) to `app/(admin)/**` in the lint mechanism (phase-3:105).
- ✅ `stripe_events` receipt-time attribution "whenever the customer maps, regardless of outcome — `ignored` rows for a resolvable customer join the cascade" (phase-1:53).
- ✅ Codebase-review supersession markers present (codebase-review:49–50 accessor/D-M1-6 italics; :75 D-M1-5 paragraph kept-honest note).
- ✅ Phase 2 AC numbering coherent through AC-10; Phase 1 through AC-9 (named-skip assertion).

Repo-level facts the plans assert — verified:
- ✅ `respin-engineer`, `respin-billing-reviewer`, `respin-tenancy-reviewer` all exist in `.claude/agents/`; `respin-billing-credits` skill exists.
- ✅ Every file the phases list as Modify exists today (`with-workspace.ts`, `bootstrap.ts`, `seed.ts`, `testing.ts`, `eslint.config.mjs`, `tests/{import-boundary,routes,gate-completeness}.test.ts`, `packages/auth/tests/auth.test.ts`, `app/(product)/layout.tsx`, `.github/workflows/respin.yml`, `respin/README.md`, `env.example`, `lib/routes.ts`).
- ✅ `docs/initial/decisions.md` currently ends at R-19 — R-20 append lands where Phase 1 task 9 expects.
- ✅ Phase 1's verification URL creds (`respin:respin_local_dev@localhost:5435`) match the already-committed `docker-compose.yml` — not a secret leak.
- ✅ `with-workspace.ts` scope carries `role` — Phase 3's `BillingRoleError` owner gate is implementable as written.

## Execution simulation (task-by-task, as respin-engineer with only the plan text)

- ✅ Phase 1 — all 10 tasks executable from the text alone. The Schema section pins every column, CHECK, and index; the Docker harness task even pins the CREATE-DATABASE-has-no-IF-NOT-EXISTS workaround and the not-`respin_test` destructive-statement guard. AC-4's enumeration is 1:1 against the Schema section. Files-to-Create/Modify closes against the task table exactly.
- ✅ Phase 2 — all 11 tasks executable; the Handoff Contract gives verbatim signatures; fold/materialization/lock-composition semantics are specified to implementation depth. Ambiguities an implementer must resolve solo: F3, F6, F10, F11 below. One AC is unsatisfiable as literally written at this phase boundary: F5.
- ✅ Phase 3 — all 11 tasks executable; D-M1-1 single-transaction dispatch, D-M1-6 resolution, and the auto-top-up idempotency-key scheme are fully specified. Two real gaps: F1 (no already-subscribed guard anywhere) and F2 (upgrade/proration invoice unenumerated); one underspecification: F4 (top-up purchase size).
- ✅ Phase 4 — all 9 tasks executable; gate-completeness and breach-validator hooks named; runbook and engineering-vs-evidence discipline pinned. One soft receiver: F8.
- ✅ Closure checks: every Owner agent exists; every phase carries a non-empty Least-confident line (P1 cross-file FK, P2 pause×expiry fold, P3 Stripe payload nullability, P4 read-only-while-paused convention — each probed; P2's and P3's are honest and mitigated by tasks 7/9 respectively); requirement IDs reconcile master↔phases (G01–G08, A02, J01 all have receiving phase rows); Depends-on chain 1→2→3→4, no forward/cyclic references; every AC has a concrete evidence pointer (test name, grep, command output, screenshot, read-back).

## Pre-mortem (shipped and failed in production — likely causes vs receivers)

- ✅ Double-granted webhook (replay/redelivery) — D-M1-1 single-tx + injected-first-attempt-failure test (P3 AC-3), Docker concurrent-same-event (P3 task 10).
- ✅ Double-debit race / over-consumption — P2 AC-5 Docker race; advisory xact lock (P2 task 4).
- ✅ Expired-partially-consumed-lot over-subtraction — D-M1-7 fold + invariant test (P2 AC-2).
- ✅ Pause quietly lets credits expire — D-M1-3 effective-expiry shift, table-driven cases incl. compounding pauses (P2 task 7).
- ✅ Webhook grants to the wrong workspace — D-M1-6 sole-authority mapping + mismatch refusal (P3 AC-3b/AC-4); two-workspace isolation suite (P2 task 9b).
- ✅ Keyless build breaks / secret at module load — lazy client, P3 AC-1/AC-9.
- ✅ Auto-top-up runaway charge — cents-denominated cap, month-keyed idempotency key with Docker race case, paused-refusal, declined-PI replay accepted as fail-safe (P3 task 7).
- ✅ Config edit bricks billing — Zod server-side (P4 task 4), fail-closed `ConfigUnavailableError`, invoice.paid throws → Stripe retry self-heal (P3 failure-mode row), unmapped price → free-with-reason (P2 state contract).
- ✅ Grace recovery after deadline; subscription-deleted-while-paused; Stripe auto-resume closing the local pause (`subscription.updated` closes it, phase-3:36); clock-skew stale `at`; workspace-deletion data surface (REQ-A04 deferral row + cascades tested in P1) — all have named receivers.
- ❌ **Already-subscribed owner clicks a tier button → second live Stripe subscription** (F1) — no receiving task. Checkout Sessions create new subscriptions; nothing in P3 task 4 guards `createTierCheckoutUrl` against an existing active subscription, and P4 explicitly renders "subscribe/upgrade per tier" buttons. The mirror's workspace-unique upsert would then silently hide one of two live subscriptions while both bill. Fix: P3 task 4 guard + typed error (Portal is the upgrade path per REQ-G01) + edge-case row + test; P4 edge-case row for the subscribed-workspace button state.
- ❌ **Mid-cycle up/downgrade proration invoice** (F2) — no receiving task. Portal upgrades fire `invoice.paid` with proration line items; the handler rule "allowance = active config's tier mapping for the invoice's price" + "unmapped price throws → 500" means a proration-shaped invoice can 500 on every redelivery, permanently, for money already taken. Fix: edge-case row naming the policy (e.g. grant keyed to the subscription's current mapped price; a proration-only invoice with no mappable full-period line → named outcome, never an unbounded retry loop) + test.

## Consolidated findings (mine + residuals; prior rounds' applied fixes verified above)

**CHANGE (block Ready):**
1. **F1 — Double-subscription via repeat checkout** (P3 task 4 / P4 task 3). Severity: high (double-billing, silent mirror). Confidence: high that the plan lacks it. Fix as in pre-mortem.
2. **F2 — Upgrade/proration `invoice.paid` unenumerated** (P3 tasks 6/9). Severity: medium-high (poisoned-retry loop on a legitimate payment). Confidence: medium (payload shapes vary — which is exactly why the case must be enumerated; P3's own Least-confident line names this territory without a receiving edge case).
3. **F3 — Pause/grant contradiction across phases.** P2 REQ-G08 row says "paused ⇒ … **no grants**" (phase-2:43); P3 REQ-G08 row requires an `invoice.paid` for a mirror-paused workspace to be **processed normally** (phase-3:36). An implementer who puts a pause guard in `grantCredits` breaks P3's documented behavior. Severity: medium. Confidence: high (the words conflict as written). Fix: one clause in P2 — "no grants" is Stripe-enforced upstream; `grantCredits` carries no pause guard.
4. **F4 — Auto-top-up purchase size unspecified** (P3 task 7). `maybeAutoTopup(db, workspaceId, shortfall, at)` never says what it buys — one config pack, or enough packs to cover `shortfall`? PI amount, cap math, and granted credits all depend on it. Severity: medium. Confidence: high. Fix: one sentence pinning the size.

**NOTE (should fix, not blocking):**
5. **F5** — P2 AC-8's grep test says live `trustWorkspaceId` import sites "match the allowlist **exactly**", but the two allowlisted files (`stripe/{webhooks,customers}.ts`) only exist in Phase 3 — equality fails at P2's own gate. State subset semantics (sites ⊆ allowlist) until P3. Severity: low. Confidence: high.
6. **F6** — P2's allocating-write clock guard (reject `at` >60s from DB `now()`) vs "table-driven tests use fixed dates" (failure-mode table): a fixed-date `debitCredits` test can't pass the guard against PGlite's real clock. Name the mechanism (fixed dates for pure reads/folds only, or a test-only clock injection). Severity: low-medium. Confidence: medium.
7. **F7** — P2 AC-6's grep for literals `2,1,3,5,4,250,2000,8000,25` in `packages/credits/src` will false-positive on any loop index or offset. Scope it (cost/allowance-shaped contexts) or lean on AC-7's fail-closed tests as the real proof. Severity: low. Confidence: high.
8. **F8** — P4 task 9 makes the tech-spec edit conditional ("only if wording drifted") and cites D-M1-7/§2 as its example, while master-plan D-M1-8 (master-plan:43, :83) promises "Phase 4 task 9 syncs tech-spec **§5**'s wording" unconditionally — the condition is already true by construction; name the §5/D-M1-8 sync as required so it can't be skipped. Severity: low. Confidence: high.
9. **F9** — P3 Handoff lists `refundCredits` as "consumed verbatim" from P2, but refund webhooks are out of scope and no P3 task calls it. Cosmetic; drop it from the consumed list or annotate. Severity: low. Confidence: high.
10. **F10** — P2 `recordPauseStart(tx, workspaceId, at)` carries a "pause length bounds read from config" comment but no `months` param; the bounds check actually lives in P3's `pauseSubscription`. Say where the validation lives. Severity: low. Confidence: medium-high.
11. **F11** — P2 `debitCredits` is typed to throw `ConfigUnavailableError` though `cost` is caller-supplied, and the failure-mode row says debits refuse when config is unavailable — the plan never says what a debit reads config *for*. State the reason (e.g. deliberate fail-closed liveness check) or drop the error from the signature. Severity: low. Confidence: medium.

## Verdict

**NOT READY** — but only just. The structure, contracts, enumerations, and both Critical-Path reviewers' round-2 fixes are all verified in place; the simulation found every task executable. What blocks Ready is small and mechanical:

Ordered fix list (fix these 4 and this is Ready; F5–F11 are worth sweeping in the same pass):
1. F1 — add the already-subscribed checkout guard + edge cases + tests (P3 task 4/edge list, P4 edge list).
2. F2 — enumerate the upgrade/proration `invoice.paid` case with a named non-looping outcome + test (P3 edge list, task 6).
3. F3 — one clause in P2's REQ-G08 row: "no grants while paused" is Stripe-enforced; `grantCredits` has no pause guard.
4. F4 — one sentence in P3 task 7 pinning the auto-top-up purchase size.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Disposition (orchestrator, same session)

The ordered 4-fix list was applied verbatim (F1: `AlreadySubscribedError` in Phase 3 task 4 + edge case + Phase 4 portal-only upgrade UI; F2: cycle-only grants, proration/non-cycle `invoice.paid` → `ignored` never a throw, mid-cycle-upgrade consequence recorded for R-20; F3: Phase 2 REQ-G08 row now states grants are never pause-guarded — Stripe enforces no-invoices-while-paused; F4: one standard pack per auto-top-up trigger). All seven NOTEs (F5–F11) also applied: phased allowlist-equality assertion, relative-to-now fixtures for allocating writes, realistic AC-6 grep scope, mandatory tech-spec §2/§5 sync, `refundCredits` no-M1-caller annotation, `recordPauseStart` bounds-location comment, `debitCredits` config-free contract. Per the reviewer's own "fix these 4 lines and this is Ready" condition, the plan is **Ready** as amended; the build starts at Phase 1.
