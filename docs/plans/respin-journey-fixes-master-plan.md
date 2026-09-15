# respin-journey-fixes — master implementation plan

> **Re-homed 2026-09-15:** the parked money-path phases here are **Phase 3 of the programme master plan** [`creator-ready-master-plan.md`](creator-ready-master-plan.md) (owner tickets T0 release closures, T6-C, T6-P); the service phases moved to `respin-service-quality` (creator-ready Phases 1–2). This file keeps its Plan Review Log unchanged.

Status: **PARKED by the owner (2026-09-15)** — "services need to come first … let's park [payment] now." Phase 1 (money path), Phase 3's paid-path CI and the Stripe sandbox prerequisite are parked with their full review history below; the service items (Phase 2 and the Free-path parts of Phase 3) continue as the new goal [`respin-service-quality-master-plan.md`](respin-service-quality-master-plan.md). Gate state at parking: NOT READY — three plan-review batches run (0, 1, 2) and the generalist (NOT READY, Grade D); every finding applied to the text; last verdicts rendered on earlier text; retry budget exhausted; post-report edits unverified. Resuming this goal needs the owner's batch-3 go-ahead. Date: 2026-09-15. Baseline: `3273f36`.
Brief: [`respin-journey-fixes-brief.md`](respin-journey-fixes-brief.md) · Audit: [`../progress/respin-journey-fixes-audit.md`](../progress/respin-journey-fixes-audit.md) · Codebase review: [`../progress/respin-journey-fixes-codebase-review.md`](../progress/respin-journey-fixes-codebase-review.md)

## Objective

Make the paid path reachable and honest, fix the first-session flow and page ergonomics the four persona journeys surfaced on 2026-09-15, and make those journeys prove the paid path on every run.

## Requirement IDs

Defining set: every row of the audit's sections A–C with a phase disposition (F-01–F-05, F-07–F-14, F-17–F-21). PRD bindings per row are in the codebase review's first table: REQ-G01/G02/G03/G04, REQ-E05, REQ-A01, REQ-B01/B02/B04, REQ-C01/C02, REQ-I03/I05, REQ-A02, REQ-H01.

## Non-goals

- REQ-J01 admin surfaces and the invite-a-seat UI (F-15, F-16): owned by [`respin-finish-phase-10b-2.md`](respin-finish-phase-10b-2.md).
- Any second producer of the rollout `active` state (seed, env flag, migration, seeded `subscriptions` rows, a widened audit). The ceremony stays the only path.
- Provider-side deletion of historical Stripe customers on the shared dev account to make its audit clear.
- Worker dead-letter residue on the shared dev DB (F-06): operator action, not product work.
- Visual redesign; new dependencies; changes to the similarity gate, kill test, or the specifics *scan* (`traceability` rendering only; `claims` never filtered).

## Critical Paths touched

Defining set: every row of `CLAUDE.md`'s three Critical-Path tables.

| Path | Touched? | Reviewer / reason |
|---|---|---|
| Veto & verdict integrity (UGC) | No | UGC code untouched |
| Boundaries & authority (UGC) | No | UGC code untouched |
| Measurement discipline (UGC) | No | UGC code untouched |
| Money & exploration (UGC) | No | UGC code untouched |
| Cutdown measurement honesty | No | `cutdown/` untouched |
| Cutdown tenancy & boundaries | No | `cutdown/` untouched |
| **Respin billing & credits** | **Yes** (Phase 1; Phase 3 T3 — a test-only Stripe cancel helper with the webhook downgrade asserted — and T4's activation step) | `respin-billing-reviewer` — **Full gates: yes**, separate reviewer on Phases 1 and 3 |
| **Respin brain tenancy** | **Yes** (Phase 2 T3) | `respin-tenancy-reviewer` — **Full gates: yes**, separate reviewer: `hasGenerationForProfile` is a new profile-scoped query (required — `BrainAssetSummary` carries no generation count) |
| **Respin spin compliance** | **Yes** (Phase 2 T5–T7) | `respin-compliance-reviewer` — lean merged run carries this one checklist |
| Respin learning honesty | No | Phase 2 T7 keeps `NO_RESULTS_BASIS` (the n=0 sentence) outside any fold by acceptance criterion; results copy dedupe only |

Gate intensity: `lean` (CLAUDE.md). Billing escalates to full by the `Full gates?` column; compliance runs as the lean merged run; `plan-reviewer` runs separately and last.

## Project Conventions Pinned

Each phase plan embeds the golden rules, the Respin non-negotiables that apply, the Lessons that touch its ground, the stack, the guards that bind copy/error classes, and the agent roster verbatim (create-plan Step 5).

## Decisions baked in

- **No bypass of the rollout authority.** Dev and CI activate through the shipped CLIs with the DB-enforced 300 s drain, both drains opened first and the fence waited once (≈ 6 minutes plus two account audits).
- **Activation is one ceremony per (database lineage, Stripe account).** The tier-checkout audit lists Sessions account-wide with no date filter and flags any Session from another lineage as `orphaned_customer_mapping` (`tier-checkout-rollout.ts:354-363`); so the dev lineage binds to a **dedicated Stripe sandbox** (owner prerequisite, Phase 1), and CI restores a **persistent, already-activated snapshot** bound to its own sandbox (Phase 3 T4) instead of recreating its database per run.
- **A parse failure is billable but does not consume the included build**, following the truncation precedent: new class `LlmUnusableReplyError` (no constructor text, `consumesIncludedBuild=false`), raised inside the metered run after usage is captured so the row carries tokens and cost; `LlmSchemaInvalidError("no_text_block")` aligned to the same rule (same fact: vendor answered, nothing usable). New `BillingErrorCode` `llm_attempt_not_consuming` branched before the billable→`llm_attempt_recorded` line; copy never states the entitlement's price.
- **One "Start a plan" form** with a tier choice; the existing tier gate gains a named code (`unknown_tier`).
- **Disclosure findings stay in the scan, leave the traceability list.** Filter by field prefix only; heading counts follow the filtered list; `claims` never filtered; the provenance sentence says the guidance is product-written from platform policy, not traced to the creator's material, **and still checked for concealment advice**.
- **Honesty blocks are never folded.** Disclosure, weakest point, kill test, legend, provenance, `NO_RESULTS_BASIS`, `NO_STREAM_NOTE` stay outside every `<details>`, asserted by test.
- **Sign-up lands on `/onboarding`; sign-in keeps `/studio`.**
- **Journeys in CI are manual or nightly, never per push**, and a run counts only after two consecutive greens.
- **Native `<details>` for collapsing**, no client library.
- **The three journey specs change with the billing form, in Phase 1** (their `subscribe-<tier>` locators would otherwise strand AC1 until Phase 3).
- **CI hosts Postgres through `docker compose`** (container `respin-postgres`) because the journeys' DB shortcut shells into that name; the platform-admin identity is baked into the activated snapshot and handed to the spec from secrets, so no persona can end in a bootstrap skip that reads green.
- **Plan size:** Phase 2's file table is 22 rows but ≈ 30 files once its two remaining globs expand (gate-rules §11 signal); the owner is asked to accept the round-budget risk rather than split — recorded here, not pre-authorising any further batch.

## Dependencies

All proven in the codebase review's dependency table. Owner prerequisites (not code): a dedicated Stripe sandbox for the dev lineage (Phase 1) and one for CI plus its activated snapshot (Phase 3).

## Deferral Ledger

| Deferred item | From | Receiving task | Note |
|---|---|---|---|
| Admin curation queue / trend sources / credit adjustments (F-15) | audit | `respin-finish-phase-10b-2.md` | already planned there |
| Invite-a-seat UI (F-16) | audit | `respin-finish-phase-10b-2.md` | already planned there; the harness keeps its DB shortcut until then |
| CI sandbox + activated snapshot provisioning | Phase 1 (documents the requirement in the runbook) | Phase 3 T4 | owner action; Phase 3 cannot close AC6 without it |

No phase defers a completable lake.

## Derived Budgets

| Number | Source |
|---|---|
| Drain window 300 s | `respin/packages/credits/src/stripe/tier-checkout-rollout.ts:33-35` (`STRIPE_MAX_CALL_WINDOW_MS` 250 000 + 50 000), `adapter.ts:19-24`; the auto-top-up drain is the same length (`auto-topup-protocol-v1-rollout.md:36-40`); both opened first, waited once |
| Free grant 25 credits; voice rebuild 50 credits | billing page copy under config v17 (`solo-creator/05-onboarding-voice-run-result.png`); config-sourced, never hardcoded (B5) |
| Uncharged-attempt cap N | `content.onboarding.maxUnchargedBillableAttempts` (`inference.ts:468-477`), read in tests from config |
| Journey wall time ≈ 3 min (solo), 1 min (studio), 20 s each (editor, admin) on Free | run logs this session; paid path adds autopsy + spin polling ≤ 2 min (spec's 12 × 10 s poll) |
| **Recurring cost — CI journeys:** Stripe test mode $0; Anthropic spend per run = the sum of `model_usage` rows the run writes, read from `/admin/model-spend` after the first CI run; not estimated here (REQ-G05: recorded, never guessed). **Ceiling:** the nightly `schedule` trigger stays disabled (only `workflow_dispatch`) until the owner records the first measured per-run figure and a monthly ceiling in the runbook's CI section; the job fails at start if the month-to-date `model_usage` sum for the CI workspace exceeds that ceiling | Phase 3 acceptance records the first measured figure; the ceiling is the owner's number, never invented here |

## Risk Assessment

Seeded from the brief's pre-mortem, the codebase review's invariant table and batch 0: the sandbox + `stripe:setup` may not reproduce every object the price map needs (Phase 1 least-confident); the new error class must pass `consumesIncludedBuild=false` explicitly and be branched before the billable line (witnesses w1–w2); the hook must run after usage capture (w3); the disclosure filter must be by field, never by kind (AC7's two-offer fixture); the step header must derive every state from a read the page performs; `stripe listen` must deliver in CI within the journey's poll.

## Phase Plans

| Phase | Description | Depends on | Primary agent | Plan file |
|---|---|---|---|---|
| 1 | Paid tiers reachable on a sandbox-bound lineage; included build survives an unusable reply; billing and niche copy honest | none | `respin-engineer` | [`respin-journey-fixes-phase-1.md`](respin-journey-fixes-phase-1.md) |
| 2 | First-session flow: landing, nav, ordered onboarding with step header, collapsed brain page, Studio voice notice, disclosure offers, prose | none | `respin-engineer` | [`respin-journey-fixes-phase-2.md`](respin-journey-fixes-phase-2.md) |
| 3 | Journeys prove the paid path and run in CI on a persistent activated snapshot | 1, 2 | `respin-engineer` | [`respin-journey-fixes-phase-3.md`](respin-journey-fixes-phase-3.md) |

## Progress Tracking

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 1 | planned | | | |
| 2 | planned | | | |
| 3 | planned | | | |

## Plan Review Log

Gate: plan review for `respin-journey-fixes`, created this session (2026-09-15); no evaluation dispatched before the batch-0 reservation. `plan gate ran lean (consolidated)` for the compliance path; billing ran full. Merged-context posture: session model, "think hard" instruction; each specialist's configured `effort: max` was not applied (lean trade, gate-rules §7).

| Batch | Slot | Reviewer | Inputs (frozen) | Status | Verdict |
|---|---|---|---|---|---|
| 0 | billing (full, separate) | `respin-billing-reviewer` (agent a88bc0f63e790f98c) | master plan, phase 1–3, codebase review, audit as first written 2026-09-15 | evaluated | **BLOCK** — 1 BLOCK (activation impossible on any Stripe account with Sessions from another lineage; CI per-run DB fails from night 2), 7 CHANGE (billable-first mapping → false copy; `included` copy guard; no-text error-class guard; hook placement after usage capture; paid-rebuild row invented a charge; auto-top-up CLI order; worker precondition), 6 NOTE |
| 0 | compliance (lean merged run — one path) | `respin-compliance-reviewer` (agent a8d63813b8e50df6c) | same | evaluated | **NEEDS CHANGES** — 8 CHANGE (provenance sentence untrue as "unchecked"; fixture blind to a kind-based filter; three pinned tests unnamed; heading counts unfiltered; AC7 unmeasurable; `claims` ambiguity; T7 collided with per-finding note rule; AC8 fold assertion), 5 NOTE |
| 0 | generalist (last) | `plan-reviewer` | — | **not launched** — material fixes required a retry batch first; the slot is consumed as reserved-unlaunched and re-reserved in batch 1 | — |
| 1 | billing (full, separate) | `respin-billing-reviewer` (agent adf7abf5001150177) | master plan, phase 1–3, codebase review, audit as revised after batch 0 | evaluated | **NEEDS CHANGES** — BLOCK and all 7 CHANGE verified resolved; 3 new CHANGE (script deadlocks in a mixed rollout state; T6 re-invented the existing `table-writers` scanner and a `.mjs` script fell outside it; `no_text_block` alignment had no witness), 8 NOTE (two literal lists to extend; sandbox needs the Customer Portal config saved once and the price map replaced whole; CI key fingerprint; sandbox subscription accumulation; `reconcile-v1` citation; heartbeat wait; password count derivation) |
| 1 | compliance (lean merged run) | `respin-compliance-reviewer` (agent ab8ede38f74c9de7d) | same | evaluated | **NEEDS CHANGES** — all 8 CHANGE addressed, two with regressions: 4 new CHANGE (fixture still blind to a date-kind filter; AC8 "≤ 2 paragraphs" contradicted the keep-outside list; AC8 vacuous in honest-refusal (those testids do not render there); `studio-mode-note` fold would falsify `studio-no-modes` copy), 5 NOTE (equality test is the only branch; heading test is pure-function; provenance sentence placement; wording "about the platform's policy"; filter lives in `KillTestBlock`) |
| 1 | generalist (last) | `plan-reviewer` | — | **not launched** — material fixes again; consumed as reserved-unlaunched, re-reserved in batch 2 | — |
| 2 | billing (full, separate) | `respin-billing-reviewer` (agent a6e4a1fff382a3c64) | master plan, phase 1–3, codebase review, audit as revised after batch 1 | evaluated | **NEEDS CHANGES** — all 3 batch-1 CHANGE resolved; 3 new CHANGE (the literal-list population is six, not two — without `ONBOARDING_ERROR_CODES` the F-02 copy falls to `unknown`; AC7 unscoped against four reauthenticated forms on an active render; the "cancel via the product's own flow" chapter targets a portal hand-off, not a product action), 7 NOTE |
| 2 | compliance (lean merged run) | `respin-compliance-reviewer` (agent a5967001dcdebaf75) | same | evaluated | **NEEDS CHANGES** — all 4 batch-1 CHANGE resolved; 3 new CHANGE (AC8 named Studio testids on first-ideas; the fold-proof is not producible under the static-render harness without an injected state; verification step 4 pointed at the wrong place), 4 NOTE |
| 2 | generalist (last) | `plan-reviewer` (agent ad135b8d2e037c653) | master plan, phase 1–3, codebase review, audit as revised after batch 2 + the two batch-2 verdicts | evaluated | **NOT READY** — Grade D; 24 findings (4 High: Studio false-free-draft scan reddens on the new code's copy; CI cannot run the journeys' `docker exec respin-postgres` shortcut; the admin persona ends in a bootstrap `test.skip` that reads green; the billing-form rewrite strands the journeys' locators), 7 Medium, 13 Low; report at [`../progress/respin-journey-fixes-plan-review.md`](../progress/respin-journey-fixes-plan-review.md) |

Post-report edits (2026-09-15, after the generalist, **unverified by any reviewer**): all 24 generalist findings applied to the plan text — Phase 1 (Studio override + retirement of `inference_unusable`, journey locators updated in T4, handoff lines aligned, niche testids, recover-invoice AC7 state, guarded `main()`, REQ-G04); Phase 2 (`claims-vocabulary-agreement.test.ts` rewritten instead of a new file, accessor required + tenancy full gate, `studio-intro` moved into the panel, results copy pinned to `page.tsx:166/:173` with its test, `@internal` prop scan, Google-on-sign-up edge row); Phase 3 (compose-hosted Postgres, admin identity in the snapshot + handoff from secrets, snapshot in an owner-keyed S3 object, cancel helper via Stripe customer lookup in `afterAll` plus a job-start sweep, webhook secret from `--print-secret`, billing full gate on T3/T4, REQ-H01); master plan (tenancy and billing rows, three decisions, spend ceiling, §11 size acceptance requested). Three findings were decisions and were taken conservatively (more gates, same phase): P-04, P-08, P-09. **Gate state: NOT READY. Batches 0–2 consumed on both specialist paths and the generalist slot; a batch 3 (both specialists plus the newly triggered tenancy reviewer, then a fresh generalist) needs the owner's explicit go-ahead.**

Disposition of batch 2 (6 CHANGE + 11 NOTE, all applied 2026-09-15 to the plan text): Phase 1 T3 (vii) six lists + AC6 onboarding reachability; AC7 scoped per state; T2 tier-fence wait source, forwarder "not checked"; w3 location; T1 amounts note and portal cancellation setting; Phase 3 T3 cancel via a test-only Stripe API helper with the handler downgrade asserted, T4 scan script `.ts`; Phase 2 T7 first-ideas fold list and the injected-state test mechanism, AC8 rewritten per surface and state, verification 4, T6 (iv) `DISCLOSURE_FIELD_PREFIX`; codebase review file table. **These fixes are unverified by either specialist: the retry budget (batches 1 and 2) is exhausted.** Under gate-rules §3 a further specialist batch needs the owner's explicit go-ahead; until then the two path verdicts stand at NEEDS CHANGES on the previous text and the plan is **NOT READY**. The reserved generalist runs on the current text so the consolidated report exists.

Disposition of batch 1 (7 CHANGE + 13 NOTE, all applied 2026-09-15): Phase 1 T2 (per-protocol branching, fence-only expectation, `.ts` via `tsx`, heartbeat wait, two new unit-test cases, citation fixed), T6 (existing scanner + witness only), T3 (iii) asserted with w5 and case (d), T3 (vii) two literal lists, T1 sandbox section (portal config, whole-map replacement, key fingerprint, accumulation), AC7 per-form, AC10; Phase 2 T6 (same-kind fixture with token assertions; heading test split into pure and render; equality test definite; sentence inside `KillTestBlock`, wording "about the platform's policy"), T7 (mode note kept outside; explicit fold list), AC7/AC8 rewritten per state with presence asserted first; Phase 3 T3 closing cancel chapter. **Batch 2 is the last retry**; if either specialist does not PASS on it, the gate stops and the round budget is the owner's decision (gate-rules §3).

Disposition of batch 0 (all 15 CHANGE/BLOCK items and every NOTE): applied in the phase plans — Phase 1 (activation constraint section, T1–T6, tests a/a′/b/c, witnesses w1–w4, AC2 derived from the union, AC10 allowlist), Phase 2 (T5 `STATES` list, T6 rewritten with the pinned tests named and the two-offer fixture, T7 scoped to pre-form prose with AC8), Phase 3 (T4 persistent snapshot, two consecutive runs). One NOTE accepted as-is with reasoning: the lifetime uncharged-attempt cap now also bounds a nondeterministic failure — recorded in Phase 1's edge-case table and runbook, not changed. Retry batch 2 remains unreserved.

## Exit Demonstration

Drawn from the Respin Definition of Done (CLAUDE.md): entry gate clean (`pnpm -C respin typecheck && lint && test && build`, `preflight`, `worker:typecheck`, `db:check`), every applicable Critical-Path gate PASS, report card Ready per phase, and the reachability sentence of each phase demonstrated in a browser — Phase 3's closing demonstration is the four journeys walked twice in CI against a restored, activated snapshot, with the solo and studio journeys' notes reading "webhook confirmed by the billing page".
