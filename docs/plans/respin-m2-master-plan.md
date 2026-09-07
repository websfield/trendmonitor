# Master Plan — Respin M2 (The Brain: Onboarding and Profile)

> **SUPERSEDED IN PART — 2026-08-20. Phase 1 has been split out to [`respin-m2a-cage-plan.md`](respin-m2a-cage-plan.md) and is the plan being built.**
>
> After three plan-gate rounds (blocking counts **14 → 10 → 18**, all four Critical-Path reviewers BLOCK every round), the failure mode was identical each time: a decision applied to some paragraphs and contradicted in others. The cause is structural — a six-phase, 105-criterion plan carrying thirteen cross-cutting decisions cannot be kept consistent across eight documents by hand, and every revision re-randomises it.
>
> **This document is retained as the scope contract and the decision record for M2 as a whole.** Its Non-Goals, Deferral Ledger, Derived Budgets, Risk Assessment and Plan Review Log remain authoritative. Its **phase plans 2-6 are not to be implemented as written** — they are re-planned, one small document at a time, once M2a's substrate exists.
>
> Two owner decisions post-date the phase plans and govern the re-planning: onboarding rebuilds are **priced** (D-M2-2, with the stated consequence that on Free this presents as a refusal until M3's minting), and ingestion is **paste-only** with a single oEmbed endpoint (D-M2-9).

**Objective:** Ship the per-creator brain as inspectable, confirmable context — a caged `creator_profiles`/`brain_docs` substrate, a guided onboarding that infers a draft brain from the creator's own material with per-field evidence and confidence, versioned brain editors, brain export, and a mechanism-level shared framework library seed.

**Brief:** [`respin-m2-brief.md`](respin-m2-brief.md) (Chosen scope: **Full M2 including library seeding**)
**Codebase review:** [`../progress/respin-m2-codebase-review.md`](../progress/respin-m2-codebase-review.md)
**Profile-cage design (binding entry gate):** [`respin-m2-profile-cage-design.md`](respin-m2-profile-cage-design.md)

**Requirement IDs:** REQ-A01, REQ-A03, REQ-A04 (export half), REQ-B01, REQ-B02, REQ-B03, REQ-C05 (versioning half), REQ-D01, REQ-D02, REQ-D04, REQ-I03, REQ-J02.

## Non-Goals (this plan)

| Not building | Receiving milestone | Why not here |
|---|---|---|
| REQ-B04 — onboarding ends by generating the first three ideas | **M3** | Needs `packages/modes`, the kill test, and the in-transaction credit debit. Onboarding ends at an activated, confirmed brain. |
| The seven Studio modes, streaming UI, kill test | **M3** | M2 builds the brain the modes read, not the modes. |
| Promotion proposals from results, minimum-n learning | **M5** | `promotion_proposals` is not created here; `packages/brain` emits nothing. |
| Studio seats and roles (REQ-A02) | **M6** | Better Auth organizations plugin (R-19). The cage is designed so seats do not re-plumb consumers. |
| Account deletion (REQ-A04's deletion half) | **M6** | Export ships here; deletion does not. |
| Private frameworks (REQ-D05, Should) | **M6+** | `visibility='private'` is schema-only in M2; nothing writes it. |
| The M6 curation-queue UI | **M6** | M2 seeds `frameworks` with a `curator_status`; M6 builds the queue that drives it. |
| Free-tier credit minting | **M3** | R-21's named receiver. M2 does not build it and does not depend on it (see D-M2-2). |

## Critical Paths touched

| Critical Path | Touched | Reviewer agent | Reviewer skill |
|---|---|---|---|
| Respin brain tenancy | **YES (primary)** | `respin-tenancy-reviewer` | `respin-brain-tenancy` |
| Respin billing & credits | **YES** | `respin-billing-reviewer` | `respin-billing-credits` |
| Respin learning honesty | **YES** | `respin-learning-reviewer` | `respin-learning-honesty` |
| Respin spin compliance | **YES (narrow — REQ-I03)** | `respin-compliance-reviewer` | `respin-spin-compliance` |

Four gates plus the generalist `plan-reviewer`. All exist in `.claude/agents/`.

## Project Conventions Pinned

Pinned **verbatim into every phase plan** (create-plan Step 5): the `CLAUDE.md` golden rules, the six Respin non-negotiables, the Lessons entries that touch this ground (2026-07-30 *fix the class, not the field*; 2026-08-02 *nested config inheritance*; 2026-08-10 *present-and-verified vs present-and-unrun*; 2026-08-18 *prove a parser-dependent guard generatively, and never report a thing recorded before re-reading the file*), the stack (Next.js 15 App Router, TS, self-hosted Postgres + Drizzle, pnpm, Zod at boundaries), the import direction (`app/` -> `packages/`, never the reverse), and the available specialist agents with a do-NOT-request line.

## Decisions baked in (defaults the doc set does not settle)

| ID | Decision | Why |
|---|---|---|
| **D-M2-1** | `VerifiedProfileId` and `ProfileScope` live in `packages/db/src/with-workspace.ts`, beside `VerifiedWorkspaceId`. **No `trustProfileId`.** | The cage design says exactly this: the two brands and their mints must be read together, and no webhook or external system resolves a profile the way Stripe's customer mapping resolves a workspace. An escape hatch "for symmetry" is the hole. |
| **D-M2-2** | **The first onboarding inference per profile is included at 0 credits; every subsequent one is PRICED and debited.** Recorded as **R-30**. The first build reads `creditCosts.onboardingBrainBuild` (0); a rebuild reads a new key `creditCosts.onboardingBrainRebuild` and calls `debitCredits` **in the same transaction that writes the inference's `model_usage` row** (REQ-G04/G06, non-negotiable 2). "Which build is this" is counted as **distinct `attempt_id`s** in `model_usage` — never rows, never process memory. | **Corrected after round 2, on the owner's reading.** Round 1 inherited the zero without reading its clause; round 2 then over-read the clause the other way, treating `PRD.md:135`'s "(included once per profile)" as authority for a permanent refusal. It is a **credit-cost list** — every other entry is a price, and *included* is a pricing word: it says what the first build costs, not that a second is forbidden. Owner decision 2026-08-19: **priced**. Two consequences stated rather than discovered: (a) **M2 becomes the product's first credit-debit call site**, which discharges the audit's deferred **E9** (debit-refused) evidence row; (b) on **Free**, with no minting path until M3 (R-21), a rebuild is refused for insufficient balance — the honest R-21 consequence surfaced with the top-up prompt, not a separate rule. This also closes round 2's billing BLOCK 1: `creditCosts.onboardingBrainBuild` is now **read** by M2 code rather than hardcoded by omission. |
| **D-M2-2b** | Every model call writes a `model_usage` row on success **and** failure, one per **HTTP call**, carrying `attempt_id`, model, tokens, cost (or `cost_state='unknown'`), `prompt_bundle_version`, `config_version`, `outcome`, and a `stripe_price_id` snapshot. **Only a billable vendor response consumes an attempt** — a success or a schema-invalid 200. A 429, a 5xx, or a pre-response transport failure consumes nothing. | Round 1 had "recorded" meaning *returned*, with no table. Round 2 fixed that and left 429/5xx unclassified while F7 said "any attempt that produced a vendor response consumes it" — under which one rate-limit blip permanently cost a creator their brain build, and the retry the same table promised was then refused. The `stripe_price_id` snapshot exists because tier is **derived at read time** from a mutable mirror: without it, a cancellation retroactively re-attributes a paid workspace's entire spend history to Free, inflating paid-tier margin — the flattering direction. |
| **D-M2-3** | `brain_docs` is **append-only with a partial unique index** on `(profile_id, kind) WHERE status='active'`. Activation is a transaction: deactivate current, insert new active. | "One active version per (profile, kind)" enforced by application code is a race, and this repo's ledger precedent is that money-shaped invariants get a DB constraint plus a concurrency test, not a comment. |
| **D-M2-4** | `source_evidence` stores, per field, a **verbatim quote plus a foreign key into an immutable `onboarding_inputs` row** (input id + character offsets), never a paraphrase. The quote is re-validated as a literal substring of the **stored** input **inside the activation transaction**, and again in the export path. | REQ-B02's "source evidence" is only inspectable if the creator can trace a field to the actual text. Three reviewers independently found the round-1 defect: the validator had **no runtime corpus** — no phase created a table holding the submitted posts — so a model-fabricated quote was storable and renderable as provenance. An invented quote is worse than an invented field, because it carries a fabricated warrant. |
| **D-M2-5** | **M2 ships a countable label, not a confidence enum.** Each inferred field renders **"evidence: N of M posts"**, where N is the number of distinct `onboarding_inputs` rows whose cited quote passes the D-M2-4 substring check **at its recorded offsets**, and M is the number of inputs submitted. **No agreement clause. The word *confidence* is not used in M2.** | Round 2 found D-M2-5's *agreement* half and phase 3's AC-6 perturbation test **mutually unsatisfiable** — agreement compares model-extracted values, AC-6 requires those values to vary without moving the result — and two reviewers reached it independently. The path of least resistance (weaken AC-6) re-opens the laundering channel, because the model then decides whether two extractions agree. And even a clean derivation counts quote *existence*, not quote *support*: a model asserting "register: deadpan" while citing three real quotes about something else would score `high`, which a creator reads as "we are confident this is true of you". **A count cannot be laundered.** The word is re-earned in M5, when effect and n exist. |
| **D-M2-5b** | **Activation refuses while ANY inferred field is unconfirmed** — not merely below-threshold ones. Confidence governs *presentation and evidence strength*, never the gate. | `PRD.md:67` (REQ-B02, [Must]) is explicit: "the creator confirms or edits **each** before the brain activates". Round 1 narrowed a Must to "below the confirm threshold cannot activate unconfirmed", which let high-confidence fields — rated by a confidence that may itself have been the model's — become a brain write the creator never approved. Two reviewers found it independently. |
| **D-M2-9** | **M2 is paste-only for content.** The **only** outbound request URL the product may construct is `https://www.youtube.com/oembed?url=...&format=json`, for **metadata only** (title, author). The creator's URL is **never itself fetched** — it is passed as a query parameter. **The captions leg is dropped from M2.** Every other host, and every failure, falls back to paste. The allowlist is an **endpoint allowlist in code**, changed only by a decision entry — never in `respinConfigV1`. `redirect: "manual"`, no cross-host redirect followed. Its test is **generative against the installed URL parser**. | Round 1 had no mechanism at all. Round 2's fix was **host**-scoped, so `fetch("https://www.youtube.com/watch?v=X")` plus a scrape, and `youtube.com/api/timedtext` (the endpoint every `youtube-transcript` package uses), both passed its AC unchanged. What made that the *likely* implementation rather than a theoretical one: round 2 named "the captions API" with no auth model, and `captions.download` **requires OAuth ownership of the video** — so it cannot serve a reference post or any unlinked video, and the engineer hits that wall and reaches for the endpoint that works. Owner decision 2026-08-19: **drop captions, paste-only** — which is `tech-spec.md:90`'s own "compliance-safe default". Config is excluded as the allowlist's home because `/admin/config` is a paste-the-whole-document editor with no deploy, i.e. a deploy-free path to add `instagram.com`, and the compliance skill is explicit that no config flag weakens a hard rule. Matching is exact-hostname equality over a closed set, `https` only, userinfo and punycode homoglyphs rejected — a counterexample list is the 2026-08-18 lesson's failing form. |
| **D-M2-10** | Every submitted input carries an **input class** — `own_post` / `reference` / `creator_authored`. A `reference`-classed quote may never be provenance on **any writable brain kind**, and **no brain-doc content string may be a verbatim substring of any `reference`-classed input** — the D-M2-4 validator, run inverted. | Round 2 implemented only the `voice` half of this decision's own wording, while `strategy` and `killtest` also reach M3's prompt bundle (phase 6's pinned handoff says so). And nothing stopped a third-party sentence appearing in a field's **value** while grounded by an `own_post` quote — R-3 failing through the very door the round-1 finding named. The machinery already exists; it is the substring validator, run the other way. |
| **D-M2-11** | **A paused workspace is read-only.** The predicate is **`hasOpenPause`** (`pause_periods`) — never `isPausedSubscription`, which `state.ts` documents as "NOT the authority, and deliberately not used to gate money". `hasOpenPause` is **added to the `@respin/credits` facade** in phase 1. The refusal lives **inside** `packages/llm.structured()` and `packages/brain.activateNewVersion()` (typed `WorkspacePausedError`); the app-layer check is a second layer. It covers **every** M2 write — profile creation, `onboarding_inputs`, draft rows, activation, and editor saves. **Export stays available**: reading is not writing. | Round 2 named no predicate and put the check where the authority is unreachable — `app/**` may import only `@respin/credits/app-server`, and `hasOpenPause` is not on it, so the only reachable signal was the non-authority. Phase 5 then forbade the fix ("do not touch `packages/credits`"). Its AC could not discriminate either: the ordinary pause fixture writes both the period row and the mirror, so both predicates agree and the test passes under either implementation. Guarding at the caller is also the exact thing this plan corrected for `performance_meta` one round earlier — and an app-layer guard does not travel to M3's modes, which will call `packages/llm` too. |
| **D-M2-12** | **Free ships the full brain in M2.** PRD.md:125's "1 (lite brain)" is corrected in the same change; no field or kind subset is built. | "lite brain" appears exactly once in the whole doc set (`PRD.md:125`) and is defined nowhere. Shipping Free a full brain while a table says "lite" is deciding an undefined tier gate by omission — the R-28 failure mode. R-21's precedent is to correct the PRD rather than leave the gap. |
| **D-M2-6** | Every profile-grained table carries `workspace_id` as a **real column with a real FK**, and every `ProfileScope` accessor filters on **both** `profile_id` and `workspace_id`. | Cage design rule 3. The single-predicate form is correct today and silently wrong the moment a profile is moved, merged, soft-deleted, or re-parented. |
| **D-M2-7** | Per-tier profile caps (REQ-A01: Free 1 / Creator 1 / Pro 1 / Studio 5) live in **`respinConfigV1`**, not in code. | B5: thresholds live in versioned config. Same rule that moved `monthlyPeriodDays` out of `packages/credits`. |
| **D-M2-7b** | **Every phase that adds a `respinConfigV1` key ships a config *data* step in the same change** — a new version row appended via `appendConfigVersion` for databases that already hold one — plus a test that parses a **stored pre-change document** and asserts the outcome. One phase owns each config key; no key is added in two phases. | The round-1 plan added required keys to a `.strict()` schema and wrote "Migration Steps: None", with the parity test as its stated mitigation. The mitigation does not hold: the parity test drives from the in-memory `CONFIG_V1_SEED`, so it passes trivially while every already-seeded database breaks; `getActiveConfig` `safeParse`s the **stored** row and throws `ConfigUnavailableError` for the whole document; and `seedDb` inserts only when `config_versions` is empty, so `db:seed` cannot repair it. Blast radius: `getActiveConfig(tx)` is called at **five sites inside the single-transaction Stripe webhook dispatch (`webhooks.ts:588,786,1082,1197,1283` — verified; round 2 propagated an unchecked "six" across five documents)** — a throw there rolls the `stripe_events` row back, Stripe retries with backoff for roughly three days and then **disables the endpoint**, so the grant is eventually *lost* rather than delayed, and grants/packs/downgrades stop landing. On the branch that just completed a live Stripe evidence run. |
| **D-M2-13** | The model **price table is keyed by model id**, with a fail-closed lookup: an active `llm.model` with no price row is a typed refusal, not a silent zero. `config_version` is recorded on every `model_usage` row, **required not optional**. | Round 1 made `model` and the two price scalars independent config keys, so an admin changing the model from `/admin/config` — the deploy-free path D-M1-2 exists to enable — would silently make every recorded cost wrong, in the direction that flatters the margin dashboard. `configVersion` is required on `DebitParams` (`ledger.ts:310`) and on `PackParams` (audit #24) for exactly this reason: the config table is append-only and the active version moves. |
| **D-M2-8** | The framework seed is a **checked-in JSON data file** reviewable as text, loaded by an idempotent seeder; seeded rows carry `visibility='shared'`, `owner_profile_id=NULL`, and a `curator_status` set by a named curator. The seed does not self-approve. | R-29 plus REQ-D02. A boundary you can only verify by running code is a boundary nobody verifies. |

## Dependencies

| Depends on | Proof it shipped |
|---|---|
| M0 skeleton, auth, CI | `docs/progress/respin-m0/ledger.md`; `.github/workflows/respin.yml` |
| M1 billing + credit ledger | `docs/progress/respin-m1-review.md` (Ready, A/A); `respin/packages/credits/src/ledger.ts:335` |
| Workspace tenancy cage | `respin/packages/db/src/with-workspace.ts`; `respin/packages/db/tests/with-workspace.test.ts` |
| Audit remediation R0-R4 | `docs/progress/audit/closure-2026-08-17.md` |
| Profile-cage design (audit #23) | `docs/plans/respin-m2-profile-cage-design.md` — **discharged** |
| PRD Open Decision 3 | **R-29** (`docs/initial/decisions.md`, 2026-08-19) — **discharged** |

**Stop Conditions checked:** (1) every phase binds >=1 REQ id — pass. (2) no dependency unshipped — pass, evidenced above. (3) all four reviewer agents exist — pass. (4) new core dependency `@anthropic-ai/sdk` — **requires a decision record**; it is already sanctioned by R-5/tech-spec §1 ("Anthropic behind a `packages/llm` adapter"), and D-M2-2 records its cost posture. (5) North Star — M2 advances Goal item 1 directly; no Non-goal hit.

## Deferral Ledger

| # | Deferred | Receiving task | Resolvable by |
|---|---|---|---|
| DL-1 | REQ-B04 first-three-ideas at onboarding end | build-plan **M3**, at the modes pipeline | M3 plan's dependency check |
| DL-2 | Free-tier monthly credit minting (R-21) | build-plan **M3**, at the debit call site | R-21's own tripwire, unchanged by M2 |
| DL-3 | Curation-queue UI for `frameworks` | build-plan **M6** admin surface | M6 plan |
| DL-4 | Brain **deletion** (REQ-A04 second half) | build-plan **M6** | M6 plan |
| DL-5 | `promotion_proposals` table and emitters | build-plan **M5** | M5 plan |
| DL-6 | Per-profile private frameworks (REQ-D05) | **M6+** | schema supports it; no writer in M2 |
| DL-7 | Anthropic **prompt caching** and cost optimisation | **M3** (where volume makes it matter) | M3 margin work. **Pinned constraint:** any cache key is `(profileId, bundleHash)` or responses are never cached across profiles — `prompt_bundle_version` is a content hash, so a cache keyed on it alone would serve one profile's completion to another. |
| DL-8 | Phase 4's seed guards (personal-specifics tripwire, causal-claim check) become **load-time validators** when a non-seed writer exists | **M4** — the autopsy pipeline emits `proposed_framework` into the curation queue (`tech-spec.md` §4) | M4 plan's dependency check. Phase 4's "a test not a runtime filter" argument is correct *while the seed is the only writer*, and stops being correct the moment M4 adds a second one. |
| DL-9 | Full **role enforcement** (REQ-A02 seats: owner/editor/viewer) | **M6** | M6 plan. M2 asserts instead that no in-product path creates a non-owner membership, so "M2 assumes one owner per workspace" is tested rather than assumed. |

Every row names an *ocean*, not a completable lake punted to later.

## Derived Budgets (numbers with provenance)

| Number | Value | Provenance |
|---|---|---|
| Profile caps per tier | 1 / 1 / 1 / 5 | `docs/initial/PRD.md:59` (REQ-A01); tier table `docs/initial/PRD.md:125` |
| Onboarding inference credit cost | 0 | **`docs/initial/PRD.md:135`** — the authority. (`respin/packages/db/src/seed.ts:53` is the *implementation* of that number, not its provenance; round 1 cited the value as its own source.) |
| **Onboarding inferences included per profile** | **1** | **`docs/initial/PRD.md:135`** — "onboarding brain build 0 **(included once per profile)**". The zero and the "once" are one clause; round 1 inherited the zero and dropped the qualifier, leaving the only brake on token spend with no value. |
| Own posts collected at onboarding | 5-10 | `docs/initial/PRD.md:66` (REQ-B01) |
| Reference posts | 0-3 (optional) | `docs/initial/PRD.md:66` (REQ-B01) |
| Onboarding completion target | <20 minutes | `docs/initial/PRD.md:66`; build-plan M2 accept-when. **Evidence criterion, not an engineering gate** (Risk R8) |
| Brain doc kinds | 4 | `docs/initial/tech-spec.md:63` (`voice`, `strategy`, `performance_meta`, `killtest`) |
| Seeded frameworks | 9 (F1-F9) | build-plan M2; R-29 |
| Gross margin target | >=70% Creator tier | `docs/initial/PRD.md` §5.4 — the constraint D-M2-2's token metering serves |
| **Recurring cost — Anthropic API** | usage-based, **no free tier**; production spend is bounded by (1 inference x profiles onboarded), per D-M2-2 | New paid dependency. Test spend is **zero** — every suite drives the stub adapter, enforced by phase 2 AC-5's source scan. The **only** live-token spend in M2 is phase 5's manual evidence run (a handful of calls, outside the test tree so it does not trip AC-5); that harness and its cost are named in phase 5. |
| **Recurring cost — YouTube Data API (oEmbed + captions)** | free tier; quota-limited | Introduced by D-M2-9 as the *only* allowlisted link resolver. Quota-aware refresh is M4's problem; M2 resolves at most 10 links per onboarding, so no quota design is needed here. Stated so the dependency is not invisible. |

No other new external service or paid dependency is introduced.

## Risk Assessment (seeded from the brief's pre-mortem)

Carried from the codebase review §9: R1 cage retro-fit · R2 P4 is the test that matters · R3 provenance theatre · R4 two active versions · R5 first real token spend at zero credit cost · R6 seed leaks a person · R7 inference invents specifics · R8 the <20-minute claim.

The brief's three pre-mortem items map to R1 (cage retro-fit), R3 (confirm screen theatre), and R4 (versioning append-only in schema, mutable in practice).

**Round-1 gate outcome, recorded because it is the most useful thing in this section.** Four Critical-Path reviewers returned BLOCK. **R2 came true inside the plan that named it**: P4's fixture, as written, could not fail against the un-caged accessor, so the mutation check written to prove the guard works would have stayed green. R3 came true as well — the validator had no stored corpus to validate against. A risk register that names a hazard and then walks into it is the argument for the gate, not against the register; both are recorded rather than quietly fixed. Risks added by the gate:

| # | Risk | Mitigation |
|---|---|---|
| R9 | **A verified brand is bypassable by a cast** (`id as VerifiedProfileId`, compiled at `tsc` exit 0), and the same hole exists today for `VerifiedWorkspaceId` | Repo-wide brand-provenance scan proving both brands are produced only by the sanctioned mints; `VerifiedProfileId` stays **off** the app allowlist; `packages/brain` takes `ProfileScope` only. Fixing it as a class closes both brands at once. (P1) |
| R10 | **A config-key addition breaks every money read on an existing database**, including six sites inside the Stripe webhook transaction | D-M2-7b: a config data step in the same change, plus a test that parses a stored pre-change document. (P1, P2) |
| R11 | **Onboarding runs during a pause** — real vendor spend against zero revenue, and a `brain_docs` write against REQ-G08's read-only Must | D-M2-11: pause checked before inference and before activation. (P5) |
| R12 | **A link input becomes a scraper** — the guardrail is `warn`-level and matches `package.json` only, so a bare `fetch()` trips nothing | D-M2-9: paste-first, allowlisted YouTube oEmbed only, with an AC asserting no non-allowlisted outbound fetch, proven red against a planted `fetch`. (P5) |
| R13 | **Third-party reference text reaches the prompt bundle as brain provenance**, through a surface the spin-only similarity gate does not cover | D-M2-10: input class on every provenance record; `reference` quotes barred from `voice`. (P1, P3, P5) |

## Phase Plans

| Phase | Description | Depends on | Primary agent(s) | Plan file |
|---|---|---|---|---|
| 1 | **Profile cage (entry gate)** — the **complete M2 schema** in one migration (`creator_profiles`, `brain_docs`, `frameworks`, `onboarding_inputs`, `model_usage`), `VerifiedProfileId`, `ProfileScope`, composite accessors, P1-P7 shown red then green | none | `respin-engineer` | `respin-m2-phase-1.md` |
| 2 | **`packages/llm`** — Anthropic behind the adapter, Zod-validated structured output, `prompt_bundle_version`, **persisted** `model_usage` rows, stub adapter for tests, D-M2-2's once-per-profile limit | **1** | `respin-engineer` | `respin-m2-phase-2.md` |
| 3 | **`packages/brain`** — versioned brain docs (D-M2-3), provenance + confidence model (D-M2-4/5), north-star metric, export as JSON + markdown | 1 | `respin-engineer` | `respin-m2-phase-3.md` |
| 4 | **Shared framework library seed** — `frameworks` seeder, the F1-F9 mechanism-level JSON, curator status, the no-personal-specifics tripwire (R-29) | 1 | `respin-engineer` | `respin-m2-phase-4.md` |
| 5 | **Onboarding wizard** — interview -> own posts -> references -> inference -> review-and-confirm with evidence + confidence -> activate; north-star declaration; tier profile caps | 2, 3 | `respin-engineer` | `respin-m2-phase-5.md` |
| 6 | **Brain editor + export UI** — voice/strategy/killtest editors where every edit versions, readable version history, export download | 3, 5 | `respin-engineer` | `respin-m2-phase-6.md` |

**Phase 1 gates every other phase, phase 2 included.** Round 1 exempted phase 2 from the stop condition while phase 2 planned a per-profile counter and per-call token records — i.e. profile-grained, creator-derived data arriving in the one phase the cage did not cover, and the phase where creator post text starts flowing into prompt bundles. The binding design says *"M2 implementation does not start"*, not "phases 3-6 do not start". Phases 3 and 4 may run alongside each other after 1; 5 needs 2 and 3; 6 needs 3 and 5.

## Progress Tracking

| Phase | Status | Evidence |
|---|---|---|
| 1 | Not started | |
| 2 | Not started | |
| 3 | Not started | |
| 4 | Not started | |
| 5 | Not started | |
| 6 | Not started | |

Append-only ledger: `docs/progress/respin-m2/ledger.md`.

## Plan Review Log

| Round | Reviewer | Verdict | Findings addressed |
|---|---|---|---|
| 1 | `respin-tenancy-reviewer` | **BLOCK (D)** — 5 BLOCK · 10 CHANGE · 7 NOTE | P4's fixture could not fail against the accessor it exists to catch (Risk R2, landing exactly as the plan predicted); `packages/brain`'s query paths — including the only write to `brain_docs` — got no enumeration and no cross-profile suite, a regression from M1's own bar; the brand is defeated by `id as VerifiedProfileId` (**compiled: `tsc` exit 0**) and phase 1 task 7 put the type on the app allowlist, enabling it; REQ-B02 narrowed; phase 2 held profile-grained data outside the stop condition |
| 1 | `respin-billing-reviewer` | **BLOCK (D)** — 3 BLOCK · 7 CHANGE · 5 NOTE | "Recorded" meant *returned*, never persisted, with no table to persist into; adding required keys to a `.strict()` config with "Migration Steps: None" would throw at six `getActiveConfig(tx)` sites inside the Stripe webhook transaction; `pause` appeared **zero times** in all seven documents while REQ-G08 makes paused workspaces read-only; the re-inference limit had no value, period, storage or non-vacuity test; model id decoupled from its price; "lite brain" decided by omission. **Also corrected a factual error in the codebase review** (`PRD.md:135` decided the zero in writing, and its "once per profile" clause is the missing limit) |
| 1 | `respin-learning-reviewer` | **BLOCK (D)** — 3 BLOCK · 8 CHANGE · 5 NOTE | AC-6 could not force the distinction its own *Least confident* line named — the laundered path (model returns `supportingQuotes[]`, derivation counts them) passes it, and no derivation rule was stated anywhere; `performance_meta`'s sole-emitter guard sat at the app layer while the write path is built in `packages/brain`; REQ-B02 narrowed; the north-star metric live at a past time is not reconstructable (no `activated_at`/`superseded_at`); framework `confidence` with no evidence records to derive from |
| 1 | `respin-compliance-reviewer` | **BLOCK (D)** — 3 BLOCK · 6 CHANGE · 2 NOTE | The link input specified no resolution mechanism, no allowlist, and no prohibition — its obvious implementation scrapes a closed platform; the verbatim-quote validator had no runtime corpus; third-party reference text was citable as brain provenance with nothing marking it third-party, reaching M3's prompt bundle through a surface the spin-only similarity gate does not cover; **five phases claimed this gate PASSes and not one of the 60 ACs mentioned `[check]`, REQ-I03, or invented specifics** |
| 1 | `plan-reviewer` | *deferred to round 2 — see note below* | |

**Convergent findings** (independently reached, therefore certain rather than arguable): the missing submitted-input store (tenancy C4, learning CHANGE, compliance BLOCK 2 — **3 of 4**); the REQ-B02 narrowing (learning BLOCK 3, tenancy B4); token/cost never persisted (billing BLOCK 1, tenancy B5).

**One reviewer disagreement, resolved against the plan.** Tenancy's check 3 called the `performance_meta` guard "asserted at the action layer, which is the right level"; learning's BLOCK 2 showed the write path is *built* in `packages/brain`, where `activateNewVersion` accepts any `kind`, so a generic editor action taking `kind` from the form body passes both the UI test and the `app/**` source scan and still accepts a crafted POST. Learning is correct, and it is this repo's 2026-07-30 lesson verbatim — **guard where the path is built; a caller-side guard is a documented bypass**. The refusal moved into `packages/brain`.

**Deviation from `/create-plan` Step 6c, recorded rather than hidden.** The command spawns the generalist `plan-reviewer` last in the same round, with the Critical-Path verdicts attached. With all four returning BLOCK and the schema itself changing (three new tables), a simulate-and-pre-mortem pass over the round-1 draft would have been a simulation of a document already being replaced. `plan-reviewer` therefore runs in **round 2**, against the revised draft, with all four round-1 verdicts attached — which is the input the command intends it to have.

## Exit Demonstration (M2 acceptance, engineering vs evidence)

**Engineering claim (gateable):**
1. `scope.profile(<id from another workspace>)` throws `ProfileAccessError` with a message byte-identical to the not-found case; every `ProfileScope` accessor returns only the scope's own rows, proven per accessor from both sides with non-vacuous row counts, **against a planted cross-parented row** (P1-P4).
2. A bare `string` where `VerifiedProfileId` is required fails `tsc`, **and** a repo-wide scan proves the only expressions producing either verified brand live in `with-workspace.ts`'s sanctioned mints — the cast form included (P5, P6, P7).
3. Editing any brain field creates a new version; the previous version remains readable; two concurrent activations cannot both leave an active row (D-M2-3's index, proven under real Postgres).
4. Every active brain field renders its verbatim source quote and its derived confidence; **each stored quote is re-validated as a literal substring of its persisted `onboarding_inputs` row inside the activation transaction** (D-M2-4).
5. Activation refuses while **any** inferred field is unconfirmed (D-M2-5b, REQ-B02).
6. Export produces complete, readable JSON **and** markdown covering all three writable kinds and every active field, with `performance_meta` rendered as "not yet earned — written by M5's learning loop" rather than as an empty section, **plus every exported Drizzle table, each exported or excluded-with-reason under a default-deny coverage set**, with every quote re-validated against its stored input.
7. No seeded framework row carries personal-specific fields — asserted against four planted violation classes, with the residual (a named human read of the nine entries) stated rather than claimed closed (R-29/R6).
8. Every model call writes a queryable `model_usage` row on success and on failure; a second onboarding inference for the same profile is refused (D-M2-2, `PRD.md:135`).
9. A paused workspace can neither run inference nor activate a brain (D-M2-11, REQ-G08).
10. No outbound fetch reaches a non-allowlisted host (D-M2-9, R-4).
11. Entry gate green on the CI shape (`TEST_DATABASE_URL` set, both Docker suites live), `db:check` clean, **a stored pre-change config document still parses** (D-M2-7b), `pnpm audit --audit-level high --prod` exit 0 with no new baseline entries.

**Evidence claim (separate, not a gate):** a new user completes onboarding in under 20 minutes with realistic inputs — recorded in `docs/progress/respin-m2/onboarding-timing.md` from real runs, never from fixtures. Per the build-plan's own M3 precedent, the engineering claim and the evidence claim are never reported as one.

**The evidence claim names its population, or it is not made.** Each recorded run states: the operator **and whether they are the builder**, the date, the inputs used, what "start" and "complete" mean, and wall-clock including thinking time. A builder running their own wizard is a **different population** from the build-plan's accept-when ("*a new user* completes onboarding in under 20 minutes"), and until the runs are real new users the honest claim is **"not yet measured"** — never "<20 minutes". No milestone copy states the figure without n and population. This is the measurement-discipline rule this repo already applies to every rate: a time claim that does not name its denominator is not a claim.
