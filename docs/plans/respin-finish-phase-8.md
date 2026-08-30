# Slice 8: Trends + Spin

## A creator can…
**Browse a trend with a compliant transcript, read its autopsy, and spin it into their own voice — and be blocked when the spin comes out too close to the original.**

## The runner decision is RECORDED — R-52 (2026-08-29): pg-boss, dedicated worker process, on the Lightsail box

This card was originally written before the decision existed, with every runner-dependent requirement tagged `[RUNNER]` and deliberately unfilled — because a card written against an unchosen scheduler *selects* the scheduler (`tech-spec.md:18`). The decision is now in `decisions.md` **R-52**, taken under the owner's explicit delegation, and the former holes below are filled **at the decision's level of detail**.

**What stays deliberately open is API-level detail.** Nothing is installed, so R-52 names pg-boss's capabilities from memory and makes verification this slice's **first task** (Golden rule 9): retry, cron scheduling and the bounded pool are proven against the installed version before anything is built on them, with systemd timer + idempotent CLI as the recorded fallback.

Verified state today: **no scheduler of any kind is installed** — no `inngest`, `bullmq`, `pg-boss`, `agenda`, `node-cron`, `trigger.dev`, no `vercel.json`, no cron config. The repo's only non-session entrypoint is the Stripe webhook. Every state transition in the product so far derives lazily at read time, deliberately (`state.test.ts:64`: *"past the deadline → free (lazy, no cron)"*), and the run slot **refuses rather than queues** (`run-slot.ts:128-130`). A scheduler is a genuinely new operational surface, not a library choice.

**Two more dependencies are absent and are not the runner**, so they are named here rather than discovered:
- **No YouTube credentials of any kind.** `env.example` has no `YOUTUBE_*` or `GOOGLE_API_KEY` — the only Google entry is commented-out OAuth sign-in. A Data API key supports discovery/metadata, **not arbitrary public caption download**; the captions download endpoint requires OAuth permission to edit the video.
- **No email sender.** Resend is in `tech-spec.md` §1 and is not installed; there is no `RESEND_*` env var. REQ-E05's weekly digest needs it.

## Open items closing here
The **background-runner decision** — **closed 2026-08-29 as R-52**, before the slice, as `tech-spec.md:18` required.

## Prerequisites
- [ ] Slice 7 shipped
- [x] **The background-runner decision recorded** — R-52 (2026-08-29): pg-boss, dedicated worker process, on the box, own bounded pool
- [ ] YouTube Data API credentials provisioned for discovery/metadata, with the quota figure the batching math will be checked against. Third-party transcripts use creator paste in v1; creator-owned caption download is optional and requires an explicitly consented OAuth scope. No plan assumes an API key can fetch arbitrary public captions.
- [x] **The email sender decided** — Resend, per R-52; provision the account before this slice, or the digest cuts to 10a with the reason recorded

---

## The four questions, answered — three now, one deferred to the decision

### 1. Which runner, and does it run on the Lightsail box? — **pg-boss, in a dedicated worker process, on the box (R-52)**

Chosen over Inngest (its rationale was Vercel-bound and dissolved with R-18; production self-hosting adds an external control plane to a one-box deployment) and over systemd timers + a CLI (which hand-rolls durability for the ingest pipeline's multi-step work, and puts the schedule where no test can see it). pg-boss keeps jobs and schedules as **rows in the same Postgres** — observable via SQL, testable in the existing harness, retry and cron built in, no new infra, no vendor — extending the repo's standing pattern that Postgres is the coordination substrate (advisory locks, run slots, the config lock).

The two constraints this card originally recorded as inputs are now part of the decision:

- **Connections.** The product has **26 Postgres connections per app process** (`DEFAULT_QUERY_POOL_MAX` 10 + `DEFAULT_RUN_SLOT_POOL_MAX` 16) against a default `max_connections` of 100 that `docker-compose.yml` does not override (R-42), which already records that a fourth app process does not fit. The worker is therefore its own process with its **own bounded pool**, sized so app + worker + psql fit, and the number lands in `env.example` with the operator note.
- **Sessionless spend.** Autopsies call a vendor and cost credits (`creditCosts.autopsy = 4`, seeded, no reader), and every existing gate in `runInference` keys off a `WorkspaceScope` minted from a session. R-52 fixes the authority: scheduled autopsies run under a **system budget** — see R21. This remains the single largest new risk in the slice.

### 2. Similarity thresholds — config or code? The B-11 tension, resolved

**The refusal floor is code; config may only make the gate stricter, never looser.**

`tech-spec.md:109` and `decisions.md` R-6 say similarity thresholds live in config. `echo.ts:48-51` says the opposite for `ECHO_MIN_SEGMENTS`, with a reason that applies here **more strongly, not less**: `/admin/config` is a paste-the-whole-document editor that takes effect with no deploy, so a config home is a deploy-free path to weaken a hard rule — and REQ-I02 makes the spin similarity gate a **hard release gate on output**, which is a stronger claim than the echo bar's.

Slice 4 resolved B-11 by recording that the two documents were about *this* gate, which did not exist. Now it does, and the resolution that satisfies both:

> A code constant sets the floor. A config key may raise strictness above the floor and is clamped to it. There is no configuration of the document that permits a spin the code would refuse.

That is checkable, it is one line of clamping, and it makes the admin editor safe by construction rather than by policy.

### 3. What does a similarity or kill-test failure show a creator?

**One automatic rewrite, then an honest refusal — and the near-copy is never displayed.** REQ-E04 says the similarity check runs *before display* and REQ-I02 makes it a hard gate, so "show it with a warning" is not available. This is slice 6 R6's shape and slice 7 question 3's rule, applied to a second gate: the failed candidate is replaced, not annotated, and the copy says what happened, that the spend was real, and what to try.

**And the refusal is the product working.** A spin that comes out too close to its source and is blocked is REQ-E04 doing its job; the copy should not apologise for it in language that implies a defect.

### 4. Does the submitted-link adapter share slice 4's reference intake — and therefore the R-3 quote budget?

**Yes, and this is the compliance-critical answer in the slice.**

A creator-submitted link resolves to a third party's transcript. That is exactly what `input_class = "reference"` means, and slice 4 built the intake, the `source_url` capture, the containment bucket, the quote budget and the barred-kind set for it. A submitted-link adapter that stored transcripts anywhere else would create **a second corpus of third-party content outside every R-3 control** — the "second source of truth" shape C-29 removed for the echo corpus, on the one class of data where it matters most.

So: submitted transcripts land as `reference` onboarding inputs, through slice 4's path, with the URL captured. They are subject to the quote budget and the barred-kind rule, and a `voice` document still may not be grounded in one.

**The trend-monitor's own items are a different case and are treated differently**: they are not a creator's inputs, they are shared library material (one autopsy serves all users, REQ-E03), so they live in the trends tables — and REQ-D04/R-9 governs them instead: mechanism-level only, stripped of personal specifics.

---

## Requirements

### Ingest (REQ-E01 — the compliance floor)
- [ ] **R1:** `packages/trends` with the `TrendSource` interface, and **exactly two adapters: `youtube` and `submitted`.** M4's compliance criterion is inherited verbatim: the ingest layer contains adapters for exactly the compliant sources named in tech-spec §4 **and nothing else**, plus a grep-level check that no scraping dependency exists. That check is a **test**, not a review step — and it needs a planted violation to prove it is not scanning an empty set (CLAUDE.md 2026-08-21).
- [ ] **R2:** `packages/trends` joins the import boundary deliberately — `@respin/trends` is **already pre-registered as denied** at `tests/import-boundary.test.ts:862`, so this is a negation-list edit plus the gitignore-semantics trap at `eslint.config.mjs:249-262`.
- [ ] **R3:** No media is downloaded. The YouTube Data API adapter fetches discovery/metadata/views only. A third-party video's transcript is creator-pasted through the submitted/reference path in v1; a licensed transcript provider requires a separately approved adapter and rights/retention decision. Caption download is permitted only for creator-owned videos under explicit OAuth permission to edit that video. Store provenance and `rights_scope = profile_private|shared_analysis`; creator-pasted third-party text defaults to `profile_private` and raw transcript is never shown to another tenant.
- [ ] **R3a:** Metadata-only candidates remain `transcript_required`/`transcript_unavailable` and cannot enter the current creator's autopsied feed, autopsy job or Spin path until a compliant transcript accessible to that profile exists. The UI may offer "paste transcript" and must never render metadata-only analysis as an autopsy. Shared feed/cache use requires an affirmative shared-analysis rights basis; private submissions stay profile-scoped.
- [ ] **R4:** The submitted-link adapter routes transcripts through slice 4's `reference` intake (question 4), and a test proves a submitted transcript is subject to the quote budget.

### Outlier scoring (REQ-E02)
- [ ] **R5:** `outlier_ratio = video_views / channel_median_recent_views`, against **the channel's own baseline** — never absolute views. Score, baseline and data window are stored **per item**, so a ratio shown to a creator is reproducible from stored data. M4's acceptance criterion is exactly this and it is what makes the number honest rather than decorative.
- [ ] **R6:** The baseline is a **median**, and the window is stated wherever the ratio is displayed. A ratio with no visible denominator is the measurement defect this repo has shipped before.
- [ ] **R7:** Saturation and staleness are labels on the item, and stale items are **marked, never deleted** (REQ-E06).

### Autopsy (REQ-E03)
- [ ] **R8:** The autopsy runs in the fixed order — hook mechanic → beats → ending → follow trigger — on a Haiku-class tier, and is cached by content digest + analysis version + rights scope. A private submission is reused only inside its profile; a shared-rights autopsy may be served to all. A second authorized view costs zero (M4's criterion) without widening access.
- [ ] **R9:** An unmatched strong mechanism creates a `proposed_framework` into the curation queue (REQ-D03) with `curator_status = 'proposed'`. The `frameworks` table, its three enums and its two CHECK constraints already exist; **nothing has ever written to it**, and `tests/table-writers.test.ts:321` pins `frameworks: {}` as "the strongest assertion this file can carry" — so this is a deliberate edit to that instrument.
- [ ] **R10:** **REQ-D04 / R-9 on every framework proposal**: mechanism-level content only, stripped of the source creator's personal details, numbers and performance data. Reuse slice 7's mechanism-level content validator and approved/non-retired library reader; proposals remain `proposed` and cannot enter generation until 10b-1 curation approves them.

### Spin (REQ-E04 — the hard gate)
- [ ] **R11:** The similarity gate exists, runs **before display**, and is a hard release gate (REQ-I02). It does not exist in any form today.
- [ ] **R12:** The floor is code, config may only tighten (question 2), with a test that a config document cannot permit a spin the code refuses.
- [ ] **R13:** A spin **must change at minimum the subject matter, the hook wording, and one structural element** (REQ-E04). That is three checkable properties, not one similarity score, and the gate checks all three.
- [ ] **R14:** **A deliberately-forced near-copy is blocked** (M4's acceptance criterion), as a fixture that stays in the suite — "keep a growing fixture set of near-copies; every gate change reruns it" is a standing risk in `build-plan.md`.
- [ ] **R15:** Original and spin are displayed side by side (REQ-E04), and the original is clearly the other creator's work.
- [ ] **R16:** Spin costs `creditCosts.spin` (5, seeded, no reader) and **the autopsy is cached separately** so a second spin of the same item does not re-pay for the autopsy.

### Feed and tiers (REQ-E05, E06)
- [ ] **R17:** Tracked niches per tier — Free: digest only; Creator 1; Pro 3; Studio 10 — through slice 6's tier map, with slice 7's completeness property (an unmapped tier fails a test).
- [ ] **R18:** The feed is per profile: tracked niches ∩ non-stale ∩ transcript/autopsy rights accessible to that profile, ranked by `outlier_ratio × recency decay`, saturation labels rendered.
- [ ] **R19:** Daily refresh per niche runs as a **scheduled job in the worker** (R-52), quota-aware, with the batching math documented in `packages/trends/README` and checked against the real quota figure (tech-spec §7).
- [ ] **R20:** The weekly digest email, via **Resend** (R-52), as a scheduled worker job — or its recorded cut to 10a if Resend is not provisioned by this slice.
- [ ] **R21:** A scheduled autopsy is a **spend path with no session** and never uses `model_usage`, `workspace_spend_monthly` or a workspace's credits. Add append-only `system_model_usage` and retained `system_spend_daily` (or equivalent), with job/item/purpose/model, token/cost state, outcome, business date, `call_count`, `unknown_call_count` and unique job-attempt id. Rows carry no creator/workspace/profile id, are classified `NOT_CREATOR_DATA`, and reconcile estimated/unknown cost deltas idempotently while preserving unknown share after detail deletion. Slice 10b-1 includes this spend as product overhead in the defined margin view.
- [ ] **R21a:** System work has a code ceiling plus config-tightenable daily cost cap, bounded worker concurrency and finite retry count. Cap decisions are atomic; repeated failure parks/dead-letters the item rather than retrying forever.
- [ ] **R21b:** Worker operations ship here, not in 10a: heartbeat, last successful schedule/run, schedule lag, active/parked/dead-letter counts, pool use and budget exhaustion; content-safe structured logs; alerts for stale heartbeat, missed schedule, growing dead letters and near/exhausted budget. An operator runbook names diagnosis and recovery.

### Honesty
- [ ] **R22:** A trend item's ratio, baseline and window are shown together or not at all (R6).
- [ ] **R23:** No screen claims a spin will perform. REQ-I04 and `tests/support/forbidden-claims.ts` already ban the vocabulary; the trends feed is the surface most likely to reach for it.
- [ ] **R24:** The empty feed and the saturated/stale states are designed, not defaults — `DESIGN.md:63` already names them as required honesty states, and `DESIGN.md:108-109` already specs the screens.

---

## Left to the developer

- **The three checkable properties in R13** — how "subject matter changed" and "one structural element changed" are computed. Their invariant is that they are computed, not asserted by the model that wrote the spin.
- **The trends table shapes**, subject to tech-spec §2's sketch and to `creator-data-registry.ts`'s auto-detecting completeness test. System-spend tables are explicitly `NOT_CREATOR_DATA`; transcript-bearing rows remain governed creator/shared-content data with source provenance.
- **Whether the feed is a route or a section**, subject to `DESIGN.md:108-109`.
- **The worker's process shape** — entry point, systemd unit, restart policy. Its invariants are R-52's: own process, own bounded pool, and the system-budget spend authority.

## Tasks
1. [ ] **Install and verify the selected pg-boss version before building**: cron/scheduling, retry/backoff, singleton/unique jobs, dead-letter/failed-job inspection, graceful shutdown and connection-pool behaviour. Record evidence; if any required capability is absent, append the fallback decision before task 2.
2. [ ] `packages/trends` + the import-boundary edit + the no-scraping scan with its planted violation (R1–R3)
3. [ ] Trends tables + migration + registry entries + writer registrations
4. [ ] The YouTube metadata adapter, compliant transcript-state/provenance workflow, outlier scoring and stored baselines (R3–R7)
5. [ ] The submitted-link adapter through slice 4's reference intake (R4)
6. [ ] The autopsy pipeline, caching, framework proposals + R-9 stripping (R8–R10)
7. [ ] The similarity gate: floor in code, config clamped, three properties, near-copy fixtures (R11–R14)
8. [ ] The spin action through the modes pipeline; side-by-side; pricing (R15, R16)
9. [ ] The feed, niche tracking, tier gate, honesty states (R17, R18, R22–R24)
10. [ ] The worker process: refresh, digest, separate system-usage/rollup accounting, atomic budget/concurrency, parking/dead letters, health/alerts/runbook (R19–R21b)
11. [ ] Walk it: browse a trend → read the autopsy → spin it → see the side-by-side → force a near-copy and be blocked

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/worker/index.ts` | Create | The pg-boss worker: schedules, bounded pool, system budget, heartbeat and parking/dead letters |
| `respin/packages/trends/**` | Create | `TrendSource`, both adapters, outlier scoring, the autopsy pipeline |
| `respin/packages/modes/**` | Modify | The spin pipeline + the similarity gate as a pipeline step |
| `respin/packages/db/src/trends-schema.ts` | Create | `trend_sources`, transcript state/provenance, `trend_items`, `autopsies` |
| `respin/packages/db/src/system-spend-schema.ts` | Create | Non-tenant `system_model_usage`, retained daily rollup and worker health |
| `respin/packages/db/migrations/0019_*.sql` | Create | Trends, system-spend and worker-health tables/constraints |
| `respin/packages/db/src/creator-data-registry.ts` | Modify | Export and deletion decisions for each new table |
| `respin/app/(product)/trends/**` | Create | Feed, autopsy view, spin side-by-side |
| `respin/lib/routes.ts`, `respin/middleware.ts` | Modify | `/trends` prefix + the static matcher (kept in sync by `tests/routes.test.ts:14-33`) |
| `respin/app/(product)/nav.tsx` | Modify | The `/trends` entry |
| `respin/eslint.config.mjs` | Modify | R2's negation entry |
| `respin/env.example` | Modify | YouTube metadata credentials, optional creator-owned caption OAuth, runner/budget/pool and Resend variables |
| `respin/tests/no-scraping.test.ts` | Create | R1's compliance scan + its planted violation |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Browse → autopsy → spin → side-by-side, in a browser**, against the real vendor
3. [ ] **A forced near-copy is blocked before display** (R14) — the slice's compliance headline
4. [ ] A config document cannot loosen the gate below the code floor (R12)
5. [ ] A tracked niche fills with items whose ratios are **reproducible from stored baselines** (R5, M4's criterion)
6. [ ] A second view of an autopsy costs zero (R8)
7. [ ] A submitted link's transcript is subject to the R-3 quote budget (R4)
8. [ ] The ingest layer contains exactly two adapters; a planted scraping dependency fails the scan (R1)
9. [ ] A framework proposal contains no personal specifics from the source creator (R10)
10. [ ] A scheduled autopsy's spend is bounded by the system budget and attributable; at the cap it is refused; a repeatedly-failing item is parked (R21)
11. [ ] A public third-party YouTube id with only an API key → metadata stored, transcript state named, **no autopsy/feed/Spin** until the creator pastes a transcript; a creator-owned OAuth caption succeeds only with the required consent (R3/R3a)
12. [ ] Delete tenant/profile detail → system-spend totals remain non-tenant and the product-overhead input to 10b-1 remains; no creator id exists in either system-spend table (R21)
13. [ ] Stop the worker/miss a schedule/exhaust budget/park jobs → health state and the matching alert fire without prompt, transcript or creator content (R21b)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Similarity gate moved after display | R11's ordering test |
| M2 | Config permitted to lower the floor | Verification 4 |
| M3 | Spin checks one property instead of three | R13's per-property tests |
| M4 | Autopsy cache disabled | Verification 6 |
| M5 | Outlier ratio switched to absolute views | R5's baseline test |
| M6 | Submitted transcripts stored outside the reference corpus | Verification 7 |
| M7 | No-scraping scan's pattern broken | R1's planted violation |
| M8 | Framework proposal carries the source creator's follower count | R10's stripping test |
| M9 | Metadata-only YouTube item enters the autopsied feed | Verification 11 |
| M10 | Scheduled autopsy writes tenant `model_usage` | R21 separation test |
| M11 | Worker heartbeat stops without alerting | Verification 13 |

**Population note — read before reporting "N of N".** Eight mutations on code that will exist. **The hazards this matrix cannot reach:** (a) **the similarity gate is brand-new equivalence logic**, and CLAUDE.md's 2026-08-26 record is that a wrong equivalence relation is precisely the class mutation testing is blind to — G-11 was that finding, and this is the same risk one control over; R14's growing near-copy fixture set is the only real instrument. (b) **The worker's controls (R19–R21) live in a component that does not exist while this card is being read**, so no mutation of today's code can reach them — and R-52's own capability claims about pg-boss are unverified until the slice's first task runs. (c) R1's scan is a **fail-open shape by construction** — a scan that finds no scraping dependency is indistinguishable from a scan whose pattern is broken, which is why the planted violation is a requirement and not a nicety. Before claiming a matrix result, state which requirements have no control, and have someone other than the author plant at least three mutations against the gate.

## Done when
- [ ] All requirements met, all verification steps pass, **and R-52's verify-first task passed against the installed pg-boss — or its fallback was taken and recorded by appending to R-52**
- [ ] The "A creator can…" line walked in a browser, **including the block**
- [ ] **Spin compliance** PASS — this is the slice that path exists for — plus **billing** (Full gates), **learning honesty** and **brain tenancy** (Full gates), reviewers in **isolated worktrees**
- [ ] `decisions.md` carries: the runner choice and its connection footprint, the similarity floor-in-code/config-may-tighten rule, the submitted-link-is-reference-class decision, and the sessionless-spend authority
- [ ] `build-plan.md` M4's compliance criterion is **measured by a test**, not asserted
