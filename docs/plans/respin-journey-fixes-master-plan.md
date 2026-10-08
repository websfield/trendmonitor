# respin-journey-fixes — master implementation plan

> **Re-homed 2026-09-15:** the parked money-path phases here are **Phase 3 of the programme master plan** [`creator-ready-master-plan.md`](creator-ready-master-plan.md) (owner tickets T0 ~~release closures, T6-C,~~ money closures, T6-P); the service phases moved to `respin-service-quality` (creator-ready Phases 1–2). This file keeps its Plan Review Log unchanged (rows are only appended).
>
> **Amended 2026-10-04 (owner decision A-1, ledger 2026-10-04):** **this plan contains no T6-C task** — no phase here has ever specified operation identity or recovery (phase 1's only "T6" is the rollout single-producer witness, [`respin-journey-fixes-phase-1.md`](respin-journey-fixes-phase-1.md) T6). T6-C was unparked on 2026-10-04 into launch-remediation L2, whose section ([`respin-launch-remediation-master-plan.md`](respin-launch-remediation-master-plan.md#l2--entry-selection-and-operation-identity)) is its contract, with [`../creator-ready/02_Remediation_Plan.md`](../creator-ready/02_Remediation_Plan.md) §7 "T6-C" as the owner's source.

Status: **PARKED by the owner (2026-09-15)** — "services need to come first … let's park [payment] now." Phase 1 (money path), Phase 3's paid-path CI and the Stripe sandbox prerequisite are parked with their full review history below; the service items (Phase 2 and the Free-path parts of Phase 3) continue as the new goal [`respin-service-quality-master-plan.md`](respin-service-quality-master-plan.md). Gate state at parking: NOT READY — three plan-review batches run (0, 1, 2) and the generalist (NOT READY, Grade D); every finding applied to the text; last verdicts rendered on earlier text; retry budget exhausted; post-report edits unverified. ~~Resuming this goal needs the owner's batch-3 go-ahead.~~ **Batch 3 ran on 2026-10-04** (owner-authorised; billing, compliance, generalist — see the Plan Review Log) and covered **honest parking and this plan's overlap with launch-remediation L2 only** (shared files, usage semantics, journey specs); it did not review T6-C, which this plan does not contain. F-01, F-02, F-05, F-12 and the paid half of F-17 **stay PARKED until launch-remediation L5**. Date: 2026-09-15 (amended 2026-10-04). Baseline: `3273f36`.
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
- **Proposal pending T6-P (L0 A-4) and A-11 — not decided** (amended 2026-10-04). Since this was written the automatic re-ask shipped (`4a19e04`: `runInference`'s `validate` hook, `respin/packages/credits/src/inference.ts:205-235`, one extra call at `:794`) and its **terminal attempt consumes the included build** (`const consumedIncludedBuild = terminal;`, `inference.ts:951`). A-11 was answered 2026-10-04: that re-ask stays fixed-unverified and its billing verdict comes at L5 with F-02/T6-P. The original proposal follows, PARKED and unexecuted: **A parse failure is billable but does not consume the included build**, following the truncation precedent: new class `LlmUnusableReplyError` (no constructor text, `consumesIncludedBuild=false`), raised inside the metered run after usage is captured so the row carries tokens and cost; `LlmSchemaInvalidError("no_text_block")` aligned to the same rule (same fact: vendor answered, nothing usable). New `BillingErrorCode` `llm_attempt_not_consuming` branched before the billable→`llm_attempt_recorded` line; copy never states the entitlement's price.
- **One "Start a plan" form** with a tier choice; the existing tier gate gains a named code (`unknown_tier`).
- **Disclosure findings stay in the scan, leave the traceability list.** Filter by field prefix only; heading counts follow the filtered list; `claims` never filtered; the provenance sentence says the guidance is product-written from platform policy, not traced to the creator's material, **and still checked for concealment advice**.
- **Honesty blocks are never folded.** Disclosure, weakest point, kill test, legend, provenance, `NO_RESULTS_BASIS`, `NO_STREAM_NOTE` stay outside every `<details>`, asserted by test.
- **Sign-up lands on `/onboarding`; sign-in keeps `/studio`.**
- **Journeys in CI are manual or nightly, never per push**, and a run counts only after two consecutive greens.
- **Native `<details>` for collapsing**, no client library.
- **SUPERSEDED 2026-10-04 (batch 3) — the next two decisions.** CI journeys now live in `.github/workflows/respin-journeys.yml` (built by service-quality Phase 2 — creator-ready Phase 2), which already starts Postgres through `docker compose -f respin/docker-compose.yml up -d --wait` (`respin-journeys.yml:90`) under the `journeys` Environment (`:56`); no journeys job goes in `respin.yml`. Phase 1 T4's journey-spec edits re-base after launch-remediation L2 lands, because L2 edits the same Studio and journey files. Original text kept below for history:
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
| 1 | **PARKED until launch-remediation L5; T3 SUPERSEDED (by the shipped re-ask); T4/T5 re-base** (2026-10-04). Original: Paid tiers reachable on a sandbox-bound lineage; included build survives an unusable reply; billing and niche copy honest | none | `respin-engineer` | [`respin-journey-fixes-phase-1.md`](respin-journey-fixes-phase-1.md) |
| 2 | First-session flow: landing, nav, ordered onboarding with step header, collapsed brain page, Studio voice notice, disclosure offers, prose | none | `respin-engineer` | [`respin-journey-fixes-phase-2.md`](respin-journey-fixes-phase-2.md) |
| 3 | **PARKED; stale against service-quality Phase 2; re-base keeping the paid chapters only** (`creator-ready-master-plan.md` Phase Plans row 3) (2026-10-04). Original: Journeys prove the paid path and run in CI on a persistent activated snapshot | 1, 2 | `respin-engineer` | [`respin-journey-fixes-phase-3.md`](respin-journey-fixes-phase-3.md) |

## Progress Tracking

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 1 | ~~planned~~ **parked** (2026-09-15; reaffirmed 2026-10-04 — until launch-remediation L5) | | | T3 superseded; T4/T5 re-base |
| 2 | ~~planned~~ **moved to service-quality and done there** (journey-fixes Phase 2 → creator-ready Phase 1 = service-quality Phase 1, per `creator-ready-master-plan.md`'s Phase-number translation; Ready on its DoD 2026-09-19 per that plan's Progress Tracking) | | | |
| 3 | ~~planned~~ **parked; re-base required** (2026-10-04) | | | paid chapters only on re-base |

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

**Batch 3 (owner-authorised 2026-10-04, ledger "OWNER DECISIONS" of that date, A-1).** Inputs frozen and matched before and after by all three reviewers (sha256 prefixes): master `f04e155a0eaa`, phase 1 `d514723cabf6`, phase 3 `a28269164f0e`, codebase review `54225d5ca4f6`, audit `0b4a53ce2a85`, phase 2 `7d0570f917ec` (context only); read against `3533dbf` plus the uncommitted launch-remediation L1 diff.

| Batch | Slot | Reviewer | Inputs (frozen) | Status | Verdict |
|---|---|---|---|---|---|
| 3 (owner-authorised 2026-10-04) | billing (full, separate) | `respin-billing-reviewer` (agent a6ba9c08519adcee7) | as above | evaluated | **NOT READY · Almost · Grade C** — 0 BLOCK, 2 High (no T6-C contract in the parked text; L2's actual-app journey needs a paid tier only parked F-01 produces), 3 Medium (phase 1 T3 predates `4a19e04`; T6-P stated as decided; phase 3 never re-based), 4 Low, 2 Note; report [`../progress/respin-journey-fixes-plan-batch3-billing.md`](../progress/respin-journey-fixes-plan-batch3-billing.md) |
| 3 (owner-authorised 2026-10-04) | compliance (lean merged run) | `respin-compliance-reviewer` (agent a0e06bf31bc448c7a) | as above | evaluated | **NOT READY · Almost · Grade C** — 0 BLOCK, 3 High (no T6-C contract; T3's "fixed message of ours" copy false; F-02 design no longer matches the shipped re-ask), 2 Medium (retiring `inference_unusable` unsafe; live `/onboarding` "nothing you wrote" copy false — outside the plan), 2 Low, 3 Note; report [`../progress/respin-journey-fixes-plan-batch3-compliance.md`](../progress/respin-journey-fixes-plan-batch3-compliance.md) |
| 3 (owner-authorised 2026-10-04) | generalist (last) | `plan-reviewer` (agent adfd9648c39acde45) | as above + the two batch-3 verdicts | evaluated | **NOT READY · Not yet · Grade D** — consolidated H-1–H-4, M-1–M-6, M-ext, L-1–L-7; edit list E-1–E-30 (no E-15 issued); report [`../progress/respin-journey-fixes-plan-batch3-final.md`](../progress/respin-journey-fixes-plan-batch3-final.md) |

**Batch 3 scope, stated once.** It reviewed **honest parking and this plan's overlap with launch-remediation L2 only**. **T6-C was not reviewed**, because this plan contains no T6-C task (see the 2026-10-04 amendment under the title); T6-C's contract is launch-remediation L2's own section, code-gated there by `respin-billing-reviewer` and `respin-tenancy-reviewer`. **Tenancy did not run**: its only trigger here (Phase 2 T3, the profile-scoped `hasGenerationForProfile` query) moved to service-quality and closed there. **One writer at a time** for the files this plan shares with L2 — `respin/app/(product)/billing-errors.ts`, `respin/app/(product)/studio/copy.ts`, `respin/tests/studio-ui.test.tsx` and the `respin/e2e/journeys/*.spec.ts` specs; parked tasks re-base after L2. **L2 does not change voice-purpose usage accounting** (`ONBOARDING_BRAIN_PURPOSE`, `respin/packages/credits/src/inference.ts:77`): its `recordUsage` / `consumedIncludedBuild` semantics stay as shipped, fenced by owner decision A-11 (2026-10-04) until L5.

**Owner decisions on the batch-3 questions (2026-10-04, ledger):** H-2 option C (Free-path journey to the priced confirmation; paid confirm → script proven on real Postgres; paid browser walk to L6 LA-2); A-11 (re-ask stays fixed-unverified, verdict at L5, L2 fenced); journey model spend (transport-seam fake for actual-app journeys, no paid model run); re-check (one sole `respin-billing-reviewer` run on the edited L2 contract lines; compliance re-check on the parked text waived). Disposition: E-1–E-30 applied 2026-10-04 to this plan, its phases 1 and 3, `creator-ready-master-plan.md` and `respin-launch-remediation-master-plan.md`, adapted to those decisions; E-30 reads "transport-seam fake for actual-app journeys; no paid model run in L2–L4; real-model behaviour measured at L6 under LR-EVAL-1".

**Batch 3 billing re-check** (the one owner-authorised affected re-run, on the edited L2 contract lines; frozen inputs launch-remediation `20ed705ad1f6`, this master `7e826feb5ea2`, phase 1 `5a321428fab3`, phase 3 `2f282d2b83c9`, creator-ready master `33268e91e5b0`):

| Batch | Slot | Reviewer | Inputs (frozen) | Status | Verdict |
|---|---|---|---|---|---|
| 3 re-check (2026-10-04) | billing (full, separate, sole) | `respin-billing-reviewer` (agent aebbb0f21ad9031ef) | as above | evaluated | **NOT READY · Almost · Grade C** — 0 BLOCK, 2 High (both new, introduced by the batch-3 edits: E-25(ii) "caps bound calls, not operations" contradicts R5 and the attempt-grain cap; E-30's transport fake had no production-exclusion mechanism), 4 Medium, 2 Low, 3 Note; batch-3 H-1 and H-2 resolved; report [`../progress/respin-journey-fixes-plan-batch3-billing-recheck.md`](../progress/respin-journey-fixes-plan-batch3-billing-recheck.md). **Owner disposition 2026-10-04 (ledger, "OWNER DISPOSITION (L2 plan)"):** the reviewer's own fix text for all eight findings applied to launch-remediation L2 the same day, and the plan **accepted without further review**; L2's billing and tenancy code gates verify the built behaviour. |

**Gate state:** NOT READY on the reviewers' verdicts, with the open findings **accepted by the owner** (2026-10-04). That acceptance satisfies launch-remediation L2 prerequisite (2) and L2 may start. F-01, F-02, F-05, F-12, T6-P and the paid half of F-17 stay parked until L5.

## Exit Demonstration

Drawn from the Respin Definition of Done (CLAUDE.md): entry gate clean (`pnpm -C respin typecheck && lint && test && build`, `preflight`, `worker:typecheck`, `db:check`), every applicable Critical-Path gate PASS, report card Ready per phase, and the reachability sentence of each phase demonstrated in a browser — Phase 3's closing demonstration is the four journeys walked twice in CI against a restored, activated snapshot, with the solo and studio journeys' notes reading "webhook confirmed by the billing page".
