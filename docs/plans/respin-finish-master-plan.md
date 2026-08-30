# Master Plan: Finish Respin

**Objective:** get from today's state — auth, billing and a credit ledger that work, plus a brain substrate no user can reach — to a product a creator walks end to end.

**Codebase review:** [`../progress/respin-finish-codebase-review.md`](../progress/respin-finish-codebase-review.md) · **extended 2026-08-29 for the nine unbuilt slices:** [`../progress/respin-finish-slices-2b-10b-codebase-review.md`](../progress/respin-finish-slices-2b-10b-codebase-review.md) · **phases 1–4 re-review (2026-08-30):** [`../progress/respin-finish-phases-1-4-review-2026-08-30.md`](../progress/respin-finish-phases-1-4-review-2026-08-30.md)
**Open items:** [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md) — all 73 review findings, each with exactly one home. It is the only status source for those findings; it is **not** the product-requirements register. Milestone coverage is tracked separately below against the PRD and build plan.
**Slice cards:** every feature slice has a full card — see the Progress table. Audit close-out Slice 4c is governed by its inline contract below and gets a report card only after execution. [`respin-finish-slice-stubs.md`](respin-finish-slice-stubs.md) is **superseded** and kept only for provenance.
**Scope contract:** `docs/initial/build-plan.md` M2–M6 · **Supersedes:** `respin-m2b1-brain-surface-plan.md` (its 26 TODO tasks are re-homed into the slices below)

---

## The rule this plan exists to enforce

M2b-1 shipped **3,062 lines of source and 2,236 lines of tests through 11 gate rounds and ~80 blocks, with zero product callers and zero user-reachable routes**, against a build-plan budget of 1–2 sessions. It was not reachable even in principle: nothing in product code can create a `creator_profile`, and `app/**` is denied `writeCapabilities`.

> **Every slice below ends in a path a creator can walk. No package ships without a caller in the same slice. Gates run on the slice, not on primitives.**

A slice is **done** when a person can do the thing, not when the module is elegant.

---

## Slices

| # | Slice | A creator can… | Est. | Depends on | Open items closing here |
|---|---|---|---|---|---|
| **1** | **Profile + intake** | Create a creator profile and paste their own posts, and see them listed back | 3–4 h | — | R-30.2, R-30.3, R-30.11, tasks 24 · 25 · 26 · 46 |
| **2a** | **One metered model call** | Press a button, cause a real Anthropic call, and see the credits and the usage row it produced | 4–6 h | 1 | G-14, G-17, B-4, B-10, R-30.1, R-30.4, R-30.8, tasks 10 · 33 |
| **2b** | **The spend record that outlives deletion** | See this month's **credit** burn on `/usage`, and have it still be right after a retry — *and an operator can see what a workspace cost us, from a record that survives its deletion* | 3–4 h | 2a | R-30.5, R-30.9, **R-41's reconciliation debt** |
| **2b-c** | **Spend-retention correction** | Keep the unknown-cost share after detail deletion, reconcile cost deltas once, use correct Free periods, and see cost at the accurately named route | 2–3 h | 2b | 2026-08-29 plan-audit correction; same [`phase-2b`](respin-finish-phase-2b.md) card |
| **3** | **Infer → confirm → activate** | See a voice brain inferred from *their* posts, with the quote behind every field, confirm each, and activate it | 4–6 h | 2a | B-1, B-3, B-5, B-6, R-30.6, **G-12** (trigger corrected — see below), tasks 11 · 17 · 20 · 30 · 40 · 45 |
| **3b** | **Interview + complete Creator Brain** | Complete the structured interview, review Voice + Strategy + Kill Test + north-star metric, and activate one coherent brain | **6–8 h** | 3 | PRD B01/B03/B04, build-plan M2 brain completeness, first canonical `creator_authored` evidence |
| **4** | **References + the R-3 promise** | Add reference posts they admire, run a no-store safety check, and be stopped from copying them | 3–4 h | 3b | **G-10, G-11**, G-16, B-7, B-11, R-30.10, tasks 12 · 42 · 47 |
| **4c** | **Phases 1–4 close-out — NEXT** | Run the missing reference safety check, use multiple profiles, reach usage/billing safely on first login, and complete the real spend/browser evidence | **8–12 h** | 2b-c, 4 | 2026-08-30 phases 1–4 re-review: all six findings and the clean-gate/status correction below |
| **5** | **Brain editing, versions, export** | Edit any brain document or declared metric, see the old version still readable, export JSON + markdown | **6–8 h** | 3b, **4c** | tasks 15 · 21 · 22 · 23 · 37 · 44 |
| **6** | **First generation** | Generate hooks from their own brain, kill-tested, atomically settled and debited | 7–9 h | 4, 5 | Free-tier credit minting (DL-2/R-21), REQ-I03 at the generation surface |
| **7** | **The rest of the Studio** | Use all seven modes, revise with lineage, give feedback | 8–10 h | 6 | — |
| **8** | **Trends + Spin** | Browse a trend with a compliant transcript, read an autopsy, and spin it into their own voice | 11–14 h | 7 | Background runner, system-spend accounting, worker observability |
| **9** | **Results + learning** | Log comparable results and get an evidence-linked promotion proposal from an honest n ≥ 3 cohort | 10–13 h | 7 | `packages/brain` vs `@respin/db`, REQ-G07 brain-as-asset view |
| **10a** | **Public surface + observability** | (Anonymous visitor) run the comparison demo, see two outputs differ, and subscribe | 6–8 h | 8, 9 | — |
| **10b-1** | **Seats + revenue/margin admin** | Invite a seat that can generate but cannot touch billing; an operator can see a defined contribution-margin view | 8–12 h | 10a | **B-2 / G-13**, task 41, REQ-G05 margin aggregation |
| **10b-2** | **Retention + scoped deletion** | Delete their user identity without deleting shared work; an owner can separately delete a profile or workspace and have every governed copy age out | 8–12 h | 10b-1 | retention receiver, REQ-A04 deletion, T-12 (Respin restatement) |
| **10c** | **Launch contract** | Use a documented keyed Studio API, get abuse-resistant Free/demo access, and receive platform-specific AI disclosure guidance | 8–12 h | 10b-2 | build-plan M6 API + abuse + FAQ, PRD I05 |

**Slice 2b's line was corrected on 2026-08-29** when its card was written. The original — "see this month's burn on `/usage` computed from the rollup" — conflated two numbers: `workspace_spend_monthly.cost_micro_usd` is **our model spend** (its own docblock calls it "the margin history"), while REQ-G07's burn is **credits**; and the rollup's grain is `(workspace_id, period_month, tier)` with **no `purpose` column**, so "by mode" is not derivable from it at all. The slice now has two readers: the creator's credit burn from `credit_ledger`, and a minimal operator view over the rollup so its first writer is not shipped unread. Detail in [`respin-finish-phase-2b.md`](respin-finish-phase-2b.md).

**Slices 1–5, including 3b and the 4c close-out, complete the M2 brain; M2's B04 first-three-ideas product contract closes in slice 7. Slices 6–7 complete M3.** Slice 4 is separated from 3 deliberately — see below.
Slice 5 is raised from 3–4 h because **no brain export exists**: `packages/db/src/export.ts` is not a
file, and the codebase review's "export helpers exist" was wrong (plan review F-3).
The framework seeder formerly assigned to slice 5 moves to slice 7, where the Studio is its first production reader. Slice 2 is split because its card reached 22 requirements against a ~12 budget; the rollup writer moved out because it changes no creator-visible behaviour in 2a. Slice 10 is split because M6 is four milestones' worth of obligation and triggers all four Critical
Paths at once — the largest unshipped surface in the plan going into a four-gate round is the shape
M2b-1's eleven rounds came from (F-6).

**Estimates, stated plainly.** These 105–145 engineering hours (the table sum, including the 4c close-out) supersede `build-plan.md`'s session budget for
M2–M6 (7–12 sessions). That budget is wrong, not optimistic: M2 alone was budgeted at 1–2 sessions
and has consumed 8 days without finishing. `build-plan.md`'s **acceptance criteria** are untouched —
only its sizing was. The estimate excludes infrastructure/vendor provisioning, legal review, collection
of real-world evidence, and independent review/gate elapsed time.

### Milestone requirement coverage

The 73-item disposition register tracks review findings, not product obligations. This matrix is the
requirements source of truth for M2–M6; each phase card must refine its row without silently moving or
dropping an obligation.

| Milestone | Required outcome | Owning slices | Completion evidence |
|---|---|---|---|
| **M2 — Creator Brain** | Structured interview; own/reference inputs; editable and versioned Voice, Strategy and Kill Test; declared/changeable north-star metric; review/confirm/activate; first-three-ideas entry; export; evidence-backed inference | 1, 3, **3b**, 4, **4c**, 5, 7 (B04 ideation entry) | Browser walk from empty account to active complete brain, then edit/history/export and first three ideas; 4c closes the phases 1–4 re-review before later evidence is accepted |
| **M3 — Studio** | Seven modes, approved framework library and Pro+ private frameworks, brain/context version provenance, kill tests, lineage, feedback, credits, retry-safe atomic settlement, burn by mode | 6, 7 | Free-account browser walk plus duplicate/concurrency/crash settlement tests |
| **M4 — Trends** | Compliant transcript acquisition, trend scoring/autopsy, safe spin, daily collection, bounded system budget, digest and worker operations | 8 | End-to-end worker + UI walk with transcript provenance, budget exhaustion, dead-letter and stale-worker tests |
| **M5 — Results/learning** | Honest evidence state, comparable cohorts and external baseline, feedback/result-linked proposals, approval-only promotion, brain-as-asset view | 9 | n≥3 treatment cohort walk and adversarial cohort/baseline/staleness tests |
| **M6 — Launch** | Public demo, subscription path, seats/RBAC, revenue/cost/margin admin, retention/deletion, abuse controls, thin Studio API, AI-disclosure guidance and FAQ | 10a, 10b-1, 10b-2, **10c** | Anonymous + invited-seat + operator + deletion + keyed-API launch walks |

### Why slice 4 is its own slice

Three open register items — **G-10** (`[check]`-citable evidence), **G-11** (a trailing space mints a fresh quote budget), **G-12** (an `own_post` label switches both R-3 controls off) — are unreachable today and become live the moment onboarding accepts a reference post. R-3 ("spin, never copy") stops being a substrate property and becomes a promise to a creator in that slice, so **G-10 and G-11 close inside slice 4 or slice 4 does not ship.**

**G-12's trigger is SLICE 3, not slice 4 — corrected by the compliance gate on slice 1 (2026-08-27).** The two R-3 controls an `own_post` label switches off are both keyed on `inputClass === "reference"`: the reference-provenance bar in `validateSourceEvidence` and the reference echo corpus in `referenceCorpusAsOf`. What makes them load-bearing is therefore the first **`voice` brain document written from an onboarding input** — which is slice 3 ("Infer → confirm → activate"), scheduled *before* slice 4. Slice 1 is the first live producer of `own_post` rows, and it opens a **creator-side** version of G-12 the register did not name: a textarea whose only warrant for the `own_post` label is the sentence "Paste the text of posts you wrote yourself", with no attestation and no verification. Slice 3's card must carry G-12; slice 4 keeps G-10 and G-11.

### Slice 4c — phases 1–4 close-out (NEXT)

The 2026-08-30 re-review found that the implementation and the progress table had diverged: Slice 4's promised no-store safety-check surface is absent; Slices 2b and 4 lack their mandatory browser evidence; the reconciliation-delta function has no production caller; the first-login scope race and multi-profile reachability gap remain; and prior `Ready`/`✅` claims were made on red entry gates or contradict their own `Almost` cards. **Slice 4c blocks Slice 5 and every later completion claim.** Historical cards remain evidence of what ran, but their old status is not current readiness evidence until this slice closes.

**Source:** [`../progress/respin-finish-phases-1-4-review-2026-08-30.md`](../progress/respin-finish-phases-1-4-review-2026-08-30.md)

**Least confident:** the shape and identity of a real vendor-cost reconciliation event. Probe that first; a fake admin action or test-only call does not satisfy reachability.

#### Requirements

1. **C1 — restore an honest entry gate.** Fix the current lint failure (`packages/db/src/export.ts:432`) and every other current-tree failure, then run typecheck, lint, `db:check`, the CI-shaped test suite with Docker live and zero skips, and `next build`. Do not create a brownfield baseline inside this close-out; recording one remains an explicit owner decision made in a build lane.
2. **C2 — build Slice 4 R14/R14a as written.** Add a creator-reachable candidate-draft safety check beside reference intake. It derives workspace/profile scope server-side, calls the same production echo/budget decision used by writes, stores neither draft nor result, returns actionable refusal copy, and has a contract test proving preview and hard-write decisions agree for the same corpus. A changed corpus must still be rechecked on write.
3. **C3 — perform the missing browser evidence.** Walk the no-store refusal with database inspection proving no candidate/result row was stored. Separately, run a real metered inference and show the corresponding `/usage` burn and `/admin/model-spend` cost row; exercise the deletion/orphaned report path. Record screenshots/log-safe evidence in the close-out card. Slice 4's safety-check walk does **not** require a vendor call; do not conflate it with the model-driven hard-write path again.
4. **C4 — settle reconciliation reachability.** Either wire `applyReconciliationDelta` to a real, authenticated/idempotent provider/job/operator-import source whose payload identity is proven against the actual integration, or remove/re-home the unused capability and correct every completion claim that says reconciled deltas are live. A synthetic caller added only to make a reachability test pass is not acceptable.
5. **C5 — close the first-login scope race.** Route `/usage` and `/settings/billing` through the bootstrap-then-scope authority (`scopeForUser`) and test a brand-new authenticated user landing directly on each page while layout rendering is concurrent.
6. **C6 — make multi-profile allowance usable.** Add a creator-reachable way to create a second profile and select the active profile. Onboarding, interview, brain and subsequent actions bind the selected, membership-verified profile rather than silently taking `profiles[0]`. Browser-walk: create two profiles, switch between them, and prove posts/brain data never cross.
7. **C7 — repair status truth.** Re-run `/review-phase` for the aggregate phases 1–4 close-out after C1–C6. Only a clean entry gate, every required browser walk, and PASS from applicable Critical Paths may return Slices 1–4 to current `Ready`; until then the checked progress rows below are historical markers, not dependency proof.

#### Expected surface

- `respin/app/(product)/onboarding/**` — candidate safety-check action/UI and multi-profile creation/selection.
- `respin/app/(product)/usage/page.tsx`, `respin/app/(product)/settings/billing/page.tsx` — bootstrap-safe scoping.
- `respin/packages/db/src/app-server.ts`, `onboarding-ops.ts`, `echo.ts`, `spend-rollup.ts` — scoped safety-check/reconciliation ports without widening raw capabilities.
- The narrowest relevant tests under `respin/tests/**` and `respin/packages/*/tests/**`, including cross-profile/cross-workspace, no-store, preview-vs-write, duplicate reconciliation and first-login concurrency witnesses.
- A new close-out report card under `docs/progress/`; this master plan's status override is removed only when that card is `Ready`.

#### Done when

- C1–C7 are evidenced, not merely checked off.
- Both missing browser acceptance paths are recorded and reproducible.
- There is no production-exported reconciliation function without a real caller or an explicit later owner.
- **Respin brain tenancy** and **Respin billing & credits** run as separate Full gates; **Respin spin compliance** runs on the safety-check path; any other path the final diff actually touches is added rather than assumed away.
- The aggregate phases 1–4 review moves **Not yet → Ready**, and the progress table is updated in the same change.

---

## Everything else that is open, and why it is not in a slice

The slice column above homes **50** items. This section carries the other **23**, so the plan covers
all 73 rather than only the schedulable ones. Claims and `file:line` evidence stay in
[`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md) — this is the
index, not a second register.

### Deferred with an owner and a trigger (3)

| ID | What it is | Owner | Trigger that reopens it |
|---|---|---|---|
| **B-9** | `respin-m2b1-brain-surface-plan.md`'s status column is stale in both directions — task 28 is marked TODO and `brain-content.ts:418` proves it built | engineering | Anyone cites that document for status again. The fix is to stop reading it: this plan supersedes it and the disposition register replaces its task table |
| **G-15** | The import-time throw in `brain-content.ts` did not move after billing's recommendation was recorded ACCEPTED in R-33. Blast radius, not likelihood — an unimportable `@respin/db` is a 500 on every Stripe delivery with no env escape | engineering | Slice 10a's observability pass, **or** the first deploy where a schema-registry edit ships without a full CI run |
| **T-8** | Analytics access and consent — whose analytics, under what permission, retained how long | owner / legal | Any work on REQ-F05 analytics connectors (post-M6). v1 is unblocked because manual result entry is the universal path |

### Deferred to Cutdown — parked by R-1, not dropped (8)

**T-2** (D-21 spend ceiling) · **T-3** (three accounts with rights records) · **T-4** (twenty resolved
real outputs) · **T-5** (rights basis beyond owner-directed) · **T-7** (unowned PRD Phase 1 exit
obligations) · **T-9** (one tenant or many) · **T-10** (Remotion licence) · **T-11** (golden-set asset
permissions).

Owners are recorded per row in the register. **Trigger for all eight: Cutdown resumes.** None binds
Respin — each either has a built Respin equivalent (credit costs and the top-up cap for T-2; the
post-M6 evidence phase for T-4/T-7) or was answered structurally (REQ-A03/R-9 for T-9).

### Verified closed, listed so nothing is invisible (12)

**B-8** · **T-6** · **R-30.12** · brain-surface tasks **6/34, 18, 19, 27, 28, 29, 32, 36, 38**.

Each carries the `file:line` that closes it in the register. They are listed here because an item
that vanishes from the plan is indistinguishable from an item that was forgotten — which is how
"all 67 closed" got through once already.

### Seven rows in the register that are not register items

Free-tier credit minting · REQ-I03 at the generation surface · `packages/brain` vs `@respin/db` ·
the background runner · the retention receiver · REQ-G05 margin aggregation · REQ-A04 deletion.
These came from reading `build-plan.md` M2–M6 and the codebase review against the slice list (plan
review F-5), not from any register, and all seven are homed in the slice column above. (The
`frameworks` seeder is **not** one of them — it is R-30.7, a register item, homed with its first
production reader in slice 7.)

---

## Progress tracking

**Current-readiness override (2026-08-30):** the checked rows for Slices 1–4 are historical completion markers only. The phases 1–4 re-review is `Not yet`; Slice 4c is the next blocking work and must close before those rows serve as dependency proof again. Do not erase the historical notes—the 4c card records the revalidation.

| Slice | Status | Started | Completed | Notes |
|---|---|---|---|---|
| **4c** | **▶ NEXT** | | | Close every finding in [`respin-finish-phases-1-4-review-2026-08-30.md`](../progress/respin-finish-phases-1-4-review-2026-08-30.md); inline contract above. Blocks Slice 5 and later completion claims |
| 2b-c | ✅ | 2026-08-30 | 2026-08-30 | Corrective addendum in [`respin-finish-phase-2b.md`](respin-finish-phase-2b.md): retained unknown denominator, reconciliation deltas, and `/admin/model-spend`. The completed 2b row below remains historical evidence for its earlier scope; this row closes the delta. R4: migration `0017_clumsy_wither.sql` adds `workspace_spend_monthly.unknown_call_count`, backfilled from extant `model_usage`; `upsertSpendRollup` increments it on `costState='unknown'`, surfaced on `/admin/model-spend`. R4a: `applyReconciliationDelta` (`packages/db/src/spend-rollup.ts`) is `model_usage`'s first implementation of its one sanctioned UPDATE (`estimated`/`unknown` -> `reconciled`), idempotent by row-locked state — proven sequentially, concurrently (real Postgres, two racing transactions serialize on the row lock and exactly one applies — **40/40 across two independent 20-run batches** after the gate round below found the original proof flaky), and integration-tested against `reconcileSpend` itself. New `ReconciliationTargetError` (`packages/db/src/errors.ts`), wired through `billing-errors.ts` copy and the eslint allowlist. R7's Free UTC period semantics were already correct in slice 2b's `burn-period.ts`, confirmed and left alone. Route rename R14/R15: `/admin/margin` moved to `/admin/model-spend` (`next.config.ts` 307 redirect; `tests/gate-completeness.test.ts`, `tests/model-spend-ui.test.tsx` updated; R15's forbidden-word scan re-run at the new file). Entry gate on the CI shape, Docker live, final run: typecheck 0, lint 0, `db:check` clean, **1389/1390, 0 skipped** — the one red is the pre-existing `(marketing)/for/[audience]` gap, unrelated. **Two Full-gates reviewers, one round each, run on the MAIN TREE (not isolated worktrees — slice 3's own ledger records that a worktree reviews HEAD, not uncommitted changes, and nothing across slices 1-4 is committed to this branch):** tenancy PASS round 1 (all four checks verified directly, including a planted eslint-boundary probe); billing NEEDS CHANGES -> PASS, one Medium finding (a repeat/corrected reconciliation call silently dropped — now returns a detectable `{applied: false, priorCostMicroUsd}` mismatch) fixed without re-review. Tenancy's reviewer also independently reproduced a real race in the concurrent-idempotency proof (1 failure in 7 docker runs); root-caused to the DOCKER TEST's own JS-timing synchronization, not the function's locking, and fixed with a `pg_stat_activity` lock witness. **CLOSED 2026-08-30 at Ready.** Decisions: `decisions.md` R-59 (plus its rollback/restore addendum). **Residuals, not claimed done:** the two "can…" browser walks not repeated this session (already an accepted slice-2b gap, unchanged by this addendum); R4a's delta math validated only against its own tests — no real reconciliation integration exists yet to check the payload-shape assumption against. Report card: `../progress/respin-finish-slice-2b-c-card.md` |
| 1 | ✅ | 2026-08-27 | 2026-08-27 | Walked in a browser (×3). 46 files / 914 tests / 0 skipped; `db:check` clean; build compiles. Mutations 16/16 — **see the population note**. Two gate rounds, four reviewers each: both BLOCKs lifted, three CHANGE-level residuals scheduled. Report card: `../progress/respin-finish-phase-1-review.md`. Decisions: `decisions.md` R-35 (the four slice decisions) and R-36 (what the gates found). **G-13 also closed here**, unscheduled, forced by the tenancy BLOCK |
| 2a | ✅ | 2026-08-27 | 2026-08-28 | **Walked in a browser against the real Anthropic API** (`claude-sonnet-5`, 48 in / 5 out) through the real server action's progressive-enhancement POST. Entry gate on the CI shape with Docker live: **exit 0**, typecheck 0, lint 0, 52 files / 1092 tests / 0 failed / 0 skipped, `db:check` clean, `next build` clean — the reporter-RPC exit-code flake did NOT reproduce (`../progress/respin-finish/entry-gate-slice-2a-close.txt`). Two gate rounds, four reviewers each; round 2's two BLOCKs and eleven CHANGEs all fixed. **Closed at Almost, not Ready:** the round-2 fixes were never re-reviewed under the two-round bound, and the owner took that call on 2026-08-28 rather than spend a third round. Four findings deferred with owners — see the report card. Decisions: `decisions.md` R-37/R-39/R-40/R-41/R-42. Report card: `../progress/respin-finish-slice-2a-round2-card.md` |
| 2b | ✅ | 2026-08-29 | 2026-08-29 | Card: [`respin-finish-slice-2b-card.md`](../progress/respin-finish-slice-2b-card.md); build plan: [`respin-finish-phase-2b.md`](respin-finish-phase-2b.md). **Its acceptance line was corrected when the card was written** — see the note under the Slices table. All R1–R17 implemented: the rollup upsert composed into `recordModelUsage`'s transaction (R1–R5), R6 proven on real Postgres via a forced-poison pair (`spend-rollup.docker.test.ts`), `/usage`'s scoped credit-burn total (R7–R9), the reconciliation query with its three classes + `unbilled` (R11–R13), the minimal `/admin/margin` reader with no margin figure (R14–R15, its own forbidden-word scan), the registry pseudonymisation answer + its deletion-executor tripwire (R16–R17). Entry gate on the CI shape, Docker live: typecheck 0, lint 0, `db:check` clean, **1324/1325, 0 skipped** — the one red is the pre-existing `(marketing)/for/[audience]` gap from the concurrent marketing stream (unrelated to this slice, not introduced by it), `next build` clean including `ƒ /admin/margin`. **Tenancy PASS/Ready at round 2. Billing ran three rounds** (BLOCK, both live → NEEDS CHANGES, live on an admin report → NEEDS CHANGES, confirmed not reachable today) — every finding fixed with a permanent regression test; round 3 launched only after the owner was asked and approved it, and closed at Ready on the owner's explicit call rather than a fourth round. Decisions: R-57. **Residual, not claimed done:** the two "can…" browser walks, deferred for lack of a confirmed live Anthropic key this session |
| 3 | ✅ | 2026-08-28 | 2026-08-29 | Card: [`respin-finish-phase-3.md`](respin-finish-phase-3.md). Both prerequisites recorded (`decisions.md` R-43 editor-confirm, R-44 `packages/brain`). **Built:** the inference half (2026-08-28), then the `/brain` confirm+activate surface, R8's attestation, B-3 (sha over the pair), B-5 (`activated_at` in the CHECK, migration 0015), and 95 new tests. 2a's connectivity ping **retired** by owner decision (R-46). Decisions: R-45/R-46/R-47. Entry gate on the CI shape, Docker live: typecheck 0, lint 0, `db:check` clean, **1233/1234, 0 skipped** — the single failure is `(marketing)/for/[audience]/page.tsx`, an untracked route from the concurrent marketing stream that owes its own `PUBLIC_ENTRYPOINTS` entry, and is reported rather than absorbed. **Walked in a browser against the real Anthropic API** (`claude-sonnet-5`, 816 in / 1214 out, included run): paste → infer → ten rules each beside a verbatim quote from Anna's own posts → confirm each → activate; DB shows `active` + `activated_at` + 10 confirmed = 10 evidence = 10 positions. The walk found **three defects 1,234 green tests could not see** — every voice inference failing on 2a's 1024-token ceiling *after the vendor was paid*, `/brain` 500ing because a `"use server"` module may export only async functions, and two refusal codes degrading a paid failure to "Something went wrong". All three fixed; entry gate re-run **1241/1242, 0 skipped**. **Three reviewer gates run TWICE.** Round 1: all three BLOCK, seven blocking findings (no lock on confirm/activate → an active brain nobody confirmed; `/brain` bricking past 50 posts; the priced corpus silently truncated; the config fix unable to reach any existing database; a truncation consuming the creator's included build; R4's filter untested; the paste panel telling creators their posts stay on this server). Round 2: tenancy and compliance **NEEDS CHANGES**, billing **BLOCK** — on a defect the round-1 fix INTRODUCED (a billable non-consuming call, repeatable forever at our expense; R-48). All fixed; decisions R-48/R-49/R-50. Entry gate **1264/1265, 0 skipped**. **The two-round bound is spent, so this fix pass is UNREVIEWED** — residuals and their recommendations are in the ledger. Slice 3 is NOT closed; the owner decides whether a third round runs. **Call taken 2026-08-29 under owner delegation (R-51): a third round RUNS, scoped to the fix-pass diff only — billing separate (Full gates), tenancy+compliance lean-merged, isolated worktrees. Slices 2b/4/5 wait for it.** **CLOSED 2026-08-29 at Ready.** Before round 3, the owner's close-out pass shut the four recorded residuals (corpus bound on screen; R-47 wording corrected — the `own_post` label IS the record, no column; `respinCredits.runInference` deleted; `/brain` refusal-copy scan) and fixed a real test-vs-test race (`__cage_probe.ts` vs the isolation enumeration). Round 3 ran as **three separate reviewers** (more than R-51's lean merge; main tree, not worktrees — a worktree reviews HEAD on an uncommitted change, the deviation rounds 1–2 recorded): tenancy/billing/compliance all **NEEDS CHANGES with ZERO BLOCKs**, every prior BLOCK confirmed closed by execution. The 5 CHANGEs + 8 NOTEs (all below the re-run bar) fixed without re-review, each with a witness — including the three-50s ceiling tie test, the cap's config-not-literal witness, the scoped `pg_locks` lock witnesses (proven live, 16/16), and three copy corrections. Final entry gate, CI shape, Docker live: **1274/1275, 0 skipped**, build 0 — the one red stays the marketing route, its author's. Decisions: R-48 addendum. Report card: `../progress/respin-finish-slice-3-card.md` |
| 3b | ✅ | 2026-08-30 | 2026-08-30 | Card: [`respin-finish-phase-3b.md`](respin-finish-phase-3b.md). Closes the structured-interview, Strategy, Kill Test and declared-metric hole — **M2's Creator Brain is now complete** except slice 5's editing/versioning/export UI. First build attempt failed on an API context-length error mid-way through a monolithic single-agent build; rebuilt as a split, narrowly-scoped multi-stage build (DB layer, then interview UI + brain UI in parallel) with the partial, sound schema work from the failed attempt kept rather than discarded. Built: the 11-field structured interview (`interview-ops.ts`, fully deterministic — no vendor call for Strategy/Kill Test assembly), coherent multi-document activation (`activateBrainDocCoherent`, R8/R9 — one append-only `brain_activation_snapshots` row per activation, workspace-locked, all-or-nothing), Strategy/Kill Test generalized from `brain-ops.ts`'s voice-only machinery. **Walked live in a browser** (no Anthropic key needed): interview → review → submit → confirm 8 Strategy claims → coherent activate → "In force now," DB-verified snapshot correctness. The walk found and fixed a real R1 gap (list fields couldn't express "decided, zero items") and investigated a second suspected bug that turned out to be correct behaviour (`writeBrainDoc`'s own REQ-B02 refusal for a fully vacuous document) — a tempting alternative "fix" was tried, found to make things worse (crashes the whole atomic submission), and reverted with the reasoning permanently documented. An independent mutation-planting pass (6/6 planted, reddened, reverted) also found and fixed a missing advisory lock on `saveInterviewDraft`, proven on real Postgres. Entry gate on the CI shape, Docker live: typecheck 0, lint 0, `db:check` clean, **1521/1522, 0 skipped** — the one red the pre-existing `(marketing)/for/[audience]` gap. **Four Critical-Path gates: billing PASS round 1 (collateral-risk check, zero findings), tenancy NEEDS CHANGES → PASS round 2 (2 CHANGE — a schema comment overstating referential integrity, and the same vacuous-document interaction surfacing as a real creator-facing dead end, both fixed), compliance + learning-honesty PASS round 1 as one merged lean run (1 Info, zero findings).** **CLOSED 2026-08-30 at Ready.** Report card: `../progress/respin-finish-slice-3b-card.md` |
| 4 | ✅ | 2026-08-29 | 2026-08-29 | Card: [`respin-finish-phase-4.md`](respin-finish-phase-4.md). **G-10 and G-11 closed.** G-11's two-layer budget identity (Layer A: a normalised digest closing the trailing-space evasion; Layer B: a union-find containment bucket closing the excerpt-reassembly evasion — both self-caught and fixed via this slice's own tests, including a coordinate-space mixing bug the original union math had). G-16 (shared span-validity predicate, stops a malformed stored row from permanently bricking a profile), G-10 (the third evidence bijection direction), R-30.10 (barred-kind widening to `{voice, killtest, performance_meta}`, `strategy` exempt), B-7 (honesty relabel) and B-11 (config-vs-code carve-out, `decisions.md` R-58) all closed. `appendReferencePost` (no attestation, its own 50-post cap) and a new onboarding UI panel wired end to end. Entry gate: CI shape, Docker live, **67 files / 1380 tests / 1379 passed / 0 skipped** (one pre-existing unrelated marketing-route gap), `db:check` clean, `next build` clean. Two gate rounds: tenancy and compliance NEEDS CHANGES → PASS (one real CHANGE each, both fixed with regression tests); billing PASS on round 1. Learning-honesty excluded — genuinely untouched by this diff. **CLOSED 2026-08-29 at Ready.** Residuals: R14's live-vendor browser walk not performed (mechanism proven by direct integration test instead — same shape as slices 2b/3's precedent); the M1–M8 mutation population named but not independently planted. Report card: `../progress/respin-finish-slice-4-card.md` |
| 5 | ⏳ | | | Card: [`respin-finish-phase-5.md`](respin-finish-phase-5.md). Framework seeding moved to slice 7 so this slice contains only creator-reachable editing/history/export work |
| 6 | ⏳ | | | Card: [`respin-finish-phase-6.md`](respin-finish-phase-6.md). Walk is **on Free**, so free-tier minting is a precondition of the acceptance test, not a nicety |
| 7 | ⏳ | | | Card: [`respin-finish-phase-7.md`](respin-finish-phase-7.md). **Not done until the background-runner decision is in `decisions.md`** |
| 8 | ⏳ | | | Card: [`respin-finish-phase-8.md`](respin-finish-phase-8.md). **Runner decided 2026-08-29 (R-52: pg-boss, dedicated worker on the box)** — the former `[RUNNER]` holes are filled at the decision's level; API detail is proven verify-first at the slice's first task |
| 9 | ⏳ | | | Card: [`respin-finish-phase-9.md`](respin-finish-phase-9.md). Executes R-44 — `packages/brain` is created here, proposal construction only |
| 10a | ⏳ | | | Card: [`respin-finish-phase-10a.md`](respin-finish-phase-10a.md). Closes G-15 |
| 10b-1 | ⏳ | | | Card: [`respin-finish-phase-10b.md`](respin-finish-phase-10b.md), Part A. Seats/invites and authoritative revenue/cost/margin reporting are independently reviewable before deletion work |
| 10b-2 | ⏳ | | | Card: [`respin-finish-phase-10b.md`](respin-finish-phase-10b.md), Part B. Retention and scoped user/profile/workspace deletion; T-12 and `session.ip_address` retention pre-decided in R-56 |
| 10c | ⏳ | | | Card: [`respin-finish-phase-10c.md`](respin-finish-phase-10c.md). Owns the previously unassigned M6 Studio API, full Free/demo abuse pass, disclosure guidance and FAQ |

### On the just-in-time rule, and why these cards depart from it

**The rule stands and is not repealed:** *phase plans are written one slice ahead, because writing all of M2b-2→M6 at once reproduces the 489-line specification that got reviewed instead of built.*

The original nine cards were written together on **2026-08-29 at the owner's explicit request**. This audit adds 3b/10c and corrective addenda rather than pretending that original batch covered requirements it did not. The departure is recorded rather than quiet: whole-plan review finds cross-slice holes, while the cost remains **documents that can be reviewed instead of built, and that go stale as the code moves under them.**

Three mitigations, so the cost is bounded rather than accepted:

1. **A card is re-read against the code before its slice starts, not trusted.** Each one's Files table says in terms that it is an expected surface and not a contract. Golden rule 1 applies to these documents as much as to the code.
2. **Cards after slice 5 rest on code that does not exist yet.** Slices 6–10c assume the pipeline, tables and packages their predecessors build. The further down the list, the more the card is a well-researched *proposal* and the less it is a plan. Every card is re-read against current code before execution.
3. **No card is a commitment to its own scope.** Where a slice's answer changes with what the previous slice actually built, the card names the question rather than pre-empting it.

**The signal that the rule was right after all:** if a card is being edited more than it is being executed, stop editing it and build the slice.

---

## Owner decision queue

One row per decision engineering cannot make for itself. **The default column is what stops the
build from stalling**: if the answer has not arrived when the step is reached, the developer builds
the default, records it in `decisions.md` with a revisit trigger, and keeps moving. A row whose
default is *none is safe* stops its step and nothing else.

### Still open (0)

Nothing. The last three rows were answered on **2026-08-29 under the owner's explicit delegation** ("make these decisions for me") — R-52 (runner), R-54 (pseudonymisation), R-55 (Free card) — and moved to the table below. The two facts the runner decision needed (nothing installed; the 26-connections-per-process budget of R-42) are recorded inside R-52 so they travel with it. Two of the delegated decisions have a legal dimension (R-54, R-56a) and their entries name the cheap reversal window.

Two further owner calls the cards had surfaced were taken in the same pass: **R-51** (slice 3 closes through a third review round, scoped to the fix-pass diff — slices 2b/4/5 wait for it) and **R-53** (slice 10b splits into 10b-1 and 10b-2).

### Answered — kept so a resolved row is not mistaken for an open one (8)

| Decision | Answer | Recorded in |
|---|---|---|
| `creditCosts.onboardingBrainRebuild` value | **50 credits**, config not code | `decisions.md` R-37 (2026-08-27) |
| Downgrade semantics: does `creator_profiles` get a `state` column? | **Yes** — migration 0013; the cap counts `active` rows only | `decisions.md` R-35 §2 |
| Model tiers per operation | Generation Sonnet-class, classification Haiku-class — live in config as `llm.models.{generation,classification}` | `packages/config/src/schema.ts` + R-37 |
| `packages/brain` vs `@respin/db` | **`packages/brain` at slice 9, proposal construction only**; storage stays in `@respin/db`; `tech-spec.md:36` re-pointed there | `decisions.md` R-44 (2026-08-28) |
| May an **editor** confirm someone's inferred voice rules? | **Yes** — REQ-B02's "the creator" is satisfied at the workspace grain. Its cost is named and its revisit trigger is **slice 10b** | `decisions.md` R-43 (2026-08-28) |
| Background runner | **pg-boss**, dedicated worker process, on the Lightsail box, own bounded pool. Verify-first at slice 8 task 1; fallback systemd timer + idempotent CLI. Digest sender stays Resend. The 10b retention receiver uses the same runner | `decisions.md` R-52 (2026-08-29, delegated) |
| `workspace_spend_monthly` pseudonymisation | **At deletion time, by random replacement** — one fresh identifier per deleted workspace, mapping discarded, no re-linkage path. Slice 2b's tripwire carries the obligation to 10b-2's executor | `decisions.md` R-54 (2026-08-29, delegated) |
| Does Free require a card? | **No** — decide-after-observing-abuse taken as written; revisit on first multi-account abuse or 10c's full Free-tier abuse pass | `decisions.md` R-55 (2026-08-29, delegated) |

---

## Risks

| Risk | Mitigation |
|---|---|
| **The M2b-1 pattern repeats** — building substrate ahead of its caller | The slice rule. A package with no caller in its own slice is not done |
| **First outbound HTTP in `packages/**`** (slice 2) — key handling, base-URL pinning, retries, timeouts | Pinned non-overridable `baseURL` proved by a planted `fetch` to a closed platform; no prompt or completion text in logs or thrown errors |
| **Generation settlement splits truth** — a crash between generation persistence and debit can expose an unpaid usable output, while duplicate requests can repeat the vendor sequence | `model_usage` remains an independent append-only spend fact; after gates, a workspace-locked settlement transaction rechecks balance and atomically stores the generation/refusal plus its debit. A claimed `attempt_id` gives one execution owner; retries settle a durable result or surface `recovery_required` without guessing/reissuing after an ambiguous crash |
| **A triggered auto-top-up is treated as money** | `maybeAutoTopup` never licenses proceeding — refuse this attempt regardless, and do not promise the next will succeed |
| **The 73-item findings register is mistaken for requirements coverage** | Findings keep one home in `respin-finish-open-items.md`; PRD/build-plan obligations use the separate milestone matrix. The 2026-08-30 phases 1–4 re-review supersedes the earlier current-readiness claim: **Slice 4c is now a blocker**, and M2 is not complete until 4c plus Slice 5's editing/versioning/export UI close. Historical closures remain recorded without being advertised as current proof |
| **A new package lands outside the import boundary** — the plan creates four (`llm`, `modes`, `trends`, `brain`) | `eslint.config.mjs` gains a negation-form catch-all in slice 1, with a deny fixture for an unnamed package (brain-surface task 25) |
| **Review cost recurs** | Gates run on the slice; reviewers run in **isolated worktrees** |

---

## Quality gates (per slice, not per module)

- [ ] Entry gate clean: `pnpm -C respin typecheck && lint && test` on the CI shape (Docker live, zero skips)
- [ ] `db:check` clean, migration applied
- [ ] **A person can walk the slice's "A creator can…" line** — the actual acceptance test
- [ ] Applicable Critical-Path gates PASS, run **on the slice**, reviewers in isolated worktrees
- [ ] Mutation matrix **names its population**, including what it could not cover
- [ ] Traceability row updated: every applicable PRD/build-plan requirement has one owning slice and evidence; no requirement is silently deferred or duplicated
- [ ] UI work satisfies `respin/DESIGN.md` at 360 px and 1440 px, keyboard-only navigation, visible focus, semantic/live-region announcements, reduced motion, and explicit loading/empty/error/refusal states
- [ ] Schema work documents forward/backward compatibility, expand/migrate/contract deploy order, rollback limits, restore implications and deletion-registry impact
- [ ] External-call and worker work has bounded timeout/retry/concurrency/spend, heartbeat and last-success health, lag/dead-letter/budget-exhaustion alerts, and content-safe structured logs
- [ ] Privacy/security review covers tenant scope, capability boundaries, secret/token storage, content retention, exports and backup expiry
- [ ] Every paid or state-changing path proves idempotency under duplicate submission; concurrency/crash tests cover the relevant settlement boundary
- [ ] Docs updated in the same change if an invariant moved

---

## Non-goals

Anything not in a slice above. Specifically: no new brain-substrate hardening without a caller; no plan-document expansion; no gate round on an artifact a user cannot reach.
