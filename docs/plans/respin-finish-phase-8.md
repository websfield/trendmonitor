# Slice 8: Trends + Spin

**Current status (2026-09-03): ALMOST, not Ready.** The deterministic source, DB migration, production pg-boss worker and entry gate are complete: typecheck 0, lint 0, `db:check` clean, `next build` 0, and Docker-live **143 files / 3290 tests / 0 failed / 0 skipped** after the independent review's two fix passes (artefact `docs/progress/respin-finish/entry-gate-slice-8-round2-final.txt`, 2026-09-03; the pre-review tree was 141 / 3185 — `entry-gate-slice-8-review.txt`). pg-boss 12.29.0 is pinned and proved against real Postgres for cron scheduling, finite retry/backoff, singleton admission, bounded concurrency/connection use and graceful shutdown. Remaining evidence is explicit: T-15 live YouTube metadata/quota acceptance, T-16 Resend delivery, the creator/vendor browser walk, the target-host systemd/provider walk, and independent Critical-Path/final review. The lexical similarity gate is the shipped deterministic release control, not a claim of semantic or plagiarism detection.

Deferred acceptance instructions are in [`respin-vendor-acceptance-walks.md`](../runbooks/respin-vendor-acceptance-walks.md), §§7–10. That runbook is an execution procedure, not evidence that any walk occurred.

## A creator can…
**Browse a trend with a compliant transcript, read its autopsy, and spin it into their own voice — and be blocked when the spin comes out too close to the original.**

**Reachability (2026-09-03, review round 1):** what a creator can reach today is `/trends` as a live route — **track a niche (Creator/Pro/Studio; a viewer seat is now refused at the writer), untrack it, and see the designed empty feed.** Nothing else: no production code calls `recordSharedTrendItem`, `recordPrivateTrendItem`, `recordPrivateTrendTranscript`, `claim*AutopsyForSystem`, `scoreOutlier` or `measureSaturation`; no paste-transcript or submit-link form exists; `worker/production.ts` wires YouTube discovery to the T-15 blocker. Every `trend_items` row that can exist today is a fixture, so the feed, the autopsy view, the spin and the near-copy block are engineering-complete and **unreachable**. What makes the rest live is one of two things, and the owner decides which: **the creator paste-transcript / submit-link intake** (a production `ReferenceIntakePort` over slice 4's reference intake, wired to `recordPrivateTrendTranscript`, so the R-3 quote budget governs the persisted text), or **T-15** (live YouTube discovery with a creator-owned-caption consent path).

## The runner decision is RECORDED — R-52 (2026-08-29): pg-boss, dedicated worker process, on the Lightsail box

This card was originally written before the decision existed, with every runner-dependent requirement tagged `[RUNNER]` and deliberately unfilled — because a card written against an unchosen scheduler *selects* the scheduler (`tech-spec.md:18`). The decision is now in `decisions.md` **R-52**, taken under the owner's explicit delegation, and the former holes below are filled **at the decision's level of detail**.

Golden rule 9 is now discharged against the installed version rather than memory: pg-boss 12.29.0 is pinned exactly, and its retry/backoff, cron, stately singleton-key admission, bounded `localConcurrency`/pool footprint, dead-letter state and graceful shutdown are exercised on real Postgres. The production runner is a dedicated process with its own code-clamped pool; the systemd timer + idempotent CLI remains only the recorded fallback.

**Two external acceptance inputs remain absent and are not the runner:**
- **YouTube credentials/quota evidence (T-15).** A Data API key supports discovery/metadata, **not arbitrary public caption download**; the captions download endpoint requires creator-owned OAuth authority. Creator-paste remains the v1 third-party transcript path.
- **Resend account/delivery evidence (T-16).** Sender-independent digest construction exists, but actual delivery is cut to Slice 10a under R-92 until a controlled delivery walk is available.

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
- [x] **R1:** `packages/trends` with the `TrendSource` interface, and **exactly two adapters: `youtube` and `submitted`.** M4's compliance criterion is inherited verbatim: the ingest layer contains adapters for exactly the compliant sources named in tech-spec §4 **and nothing else**, plus a grep-level check that no scraping dependency exists. That check is a **test**, not a review step — and it needs a planted violation to prove it is not scanning an empty set (CLAUDE.md 2026-08-21).
- [x] **R2:** `packages/trends` joins the import boundary deliberately — `@respin/trends` is **already pre-registered as denied** at `tests/import-boundary.test.ts:862`, so this is a negation-list edit plus the gitignore-semantics trap at `eslint.config.mjs:249-262`.
- [x] **R3:** No media is downloaded. The YouTube Data API adapter fetches discovery/metadata/views only. A third-party video's transcript is creator-pasted through the submitted/reference path in v1; a licensed transcript provider requires a separately approved adapter and rights/retention decision. Caption download is permitted only for creator-owned videos under explicit OAuth permission to edit that video. Store provenance and `rights_scope = profile_private|shared_analysis`; creator-pasted third-party text defaults to `profile_private` and raw transcript is never shown to another tenant.
- [x] **R3a:** Metadata-only candidates remain `transcript_required`/`transcript_unavailable` and cannot enter the current creator's autopsied feed, autopsy job or Spin path until a compliant transcript accessible to that profile exists. The UI may offer "paste transcript" and must never render metadata-only analysis as an autopsy. Shared feed/cache use requires an affirmative shared-analysis rights basis; private submissions stay profile-scoped.
- [ ] **R4:** The submitted-link adapter routes transcripts through slice 4's `reference` intake (question 4), and a test proves a submitted transcript is subject to the quote budget. *Un-ticked 2026-09-03 (review round 1): proven against an injected double only — `trends.test.ts:104,122` drive a fake `ReferenceIntakePort`, nothing in `app/**`, `packages/*/src` or `worker/` implements `intakeReferenceTranscript`, and the writer that persists third-party text (`recordPrivateTrendTranscript`) carries no `onboarding_inputs` link. Ticks again when the paste-transcript intake exists in production.*

### Outlier scoring (REQ-E02)
- [x] **R5:** `outlier_ratio = video_views / channel_median_recent_views`, against **the channel's own baseline** — never absolute views. Score, baseline and data window are stored **per item**, so a ratio shown to a creator is reproducible from stored data. M4's acceptance criterion is exactly this and it is what makes the number honest rather than decorative. *2026-09-03: pure function + DB constraint proven; no production producer until T-15 / the paste-transcript intake. The window is now DERIVED in `scoreOutlier` from the observations used (`BASELINE_RECENT_OBSERVATIONS`: ≤10 prior videos within 90 days, an unmeasured launch choice); the DB writer still accepts the window it is handed — the writer-side refusal is open (ledger 2026-09-03).*
- [x] **R6:** The baseline is a **median**, and the window is stated wherever the ratio is displayed. A ratio with no visible denominator is the measurement defect this repo has shipped before. *2026-09-03: pure function + DB constraint proven; no production producer until T-15 / the paste-transcript intake.*
- [x] **R7:** Saturation and staleness are labels on the item, and stale items are **marked, never deleted** (REQ-E06). *2026-09-03: pure function + DB constraint proven; no production producer until T-15 / the paste-transcript intake. Two honest gaps, recorded not built: **v1 has no saturation method** — `measureSaturation` validates caller-supplied counts, nothing counts a population over stored rows, no `methodVersion` exists, so every storable row is `unmeasured: incomplete_provenance` (`packages/trends/README.md` §Saturation); and **`stale_at` has no writer** — `markStale` labels an in-memory candidate only, the feed filters stale rows out and the page renders `stale: false`, so the designed stale state cannot appear from data until a producer exists.*

### Autopsy (REQ-E03)
- [x] **R8:** The autopsy runs in the fixed order — hook mechanic → beats → ending → follow trigger — on a Haiku-class tier, and is cached by content digest + analysis version + rights scope. A private submission is reused only inside its profile; a shared-rights autopsy may be served to all. A second authorized view costs zero (M4's criterion) without widening access. *Pure function + DB unique cache identity proven; no production producer of an autopsy row until the paste-transcript intake or T-15 (Reachability, above).*
- [x] **R9:** Every canonical autopsy mechanism unmatched against the approved, non-retired shared library creates or reuses exactly one `proposed_framework` in the curation queue (REQ-D03) with `curator_status = 'proposed'`. There is no separate "strong" threshold in v1 (R-94): human curation remains the authority, and a proposal cannot enter generation. The DB sole writer performs normalized approved/non-retired matching and idempotent proposed-only persistence under concurrency.
- [x] **R10:** **REQ-D04 / R-9 on every framework proposal**: mechanism-level content only, stripped of the source creator's personal details, numbers and performance data. Reuse slice 7's mechanism-level content validator and approved/non-retired library reader; proposals remain `proposed` and cannot enter generation until 10b-1 curation approves them.

### Spin (REQ-E04 — the hard gate)
- [x] **R11:** The similarity gate exists, runs **before display**, and is a hard release gate (REQ-I02).
- [x] **R12:** The floor is code, config may only tighten (question 2), with a test that a config document cannot permit a spin the code refuses.
- [x] **R13:** A spin **must change at minimum the subject matter, the hook wording, and one structural element** (REQ-E04). That is three checkable properties, not one similarity score, and the gate checks all three.
- [x] **R14:** **A deliberately-forced near-copy is blocked** (M4's acceptance criterion), as a fixture that stays in the suite — "keep a growing fixture set of near-copies; every gate change reruns it" is a standing risk in `build-plan.md`.
- [x] **R15:** Original and spin are displayed side by side (REQ-E04), and the original is clearly the other creator's work.
- [x] **R16:** Spin costs `creditCosts.spin` (5, seeded, no reader) and **the autopsy is cached separately** so a second spin of the same item does not re-pay for the autopsy. *Priced and settled on the production path (`modes.ts` `creditCostKey: "spin"`, durable near-copy case); the stored autopsy the spin reads has no production producer yet (Reachability, above).*

### Feed and tiers (REQ-E05, E06)
- [x] **R17:** Tracked niches per tier — Free: digest only; Creator 1; Pro 3; Studio 10 — read from the active config document's `trackedNiches` row (R-95; moved out of a code map by the review's fix pass), with slice 7's completeness property (an unmapped or unpriced tier fails a test) and the config-not-literal witness (same tier, two documents, two answers).
- [x] **R18:** The feed is per profile: tracked niches ∩ non-stale ∩ transcript/autopsy rights accessible to that profile, ranked by `outlier_ratio × recency decay`, saturation labels rendered. *2026-09-03: reader + DB constraint proven (cross-profile attempt now witnessed at the writer level, `trends-storage.test.ts`); no production producer of items until T-15 / the paste-transcript intake. The decay span is the named constant `FEED_RECENCY_DECAY_DAYS = 7`, an unmeasured launch choice.*
- [ ] **R19:** Daily refresh per niche runs as a **scheduled job in the worker** (R-52), quota-aware, with the batching math documented in `packages/trends/README` and checked against the real quota figure (tech-spec §7).
- [x] **R20:** The weekly digest email, via **Resend** (R-52), as a scheduled worker job — or its recorded cut to 10a if Resend is not provisioned by this slice. The cut is recorded as R-92/T-16; sender-independent composition remains complete.
- [x] **R21:** A scheduled autopsy is a **spend path with no session** and never uses `model_usage`, `workspace_spend_monthly` or a workspace's credits. Add append-only `system_model_usage` and retained `system_spend_daily` (or equivalent), with job/item/purpose/model, token/cost state, outcome, business date, `call_count`, `unknown_call_count` and unique job-attempt id. Rows carry no creator/workspace/profile id, are classified `NOT_CREATOR_DATA`, and reconcile estimated/unknown cost deltas idempotently while preserving unknown share after detail deletion. Slice 10b-1 includes this spend as product overhead in the defined margin view.
- [x] **R21a:** System work has a code ceiling plus config-tightenable daily cost cap, bounded worker concurrency and finite retry count. Cap decisions are atomic; repeated failure parks/dead-letters the item rather than retrying forever.
- [x] **R21b:** Worker operations ship here, not in 10a: heartbeat, last successful schedule/run, schedule lag, active/parked/dead-letter counts, pool use and budget exhaustion; content-safe structured logs; alerts for stale heartbeat, missed schedule, growing dead letters and near/exhausted budget. An operator runbook names diagnosis and recovery.

### Honesty
- [x] **R22:** A trend item's ratio, baseline and window are shown together or not at all (R6). *2026-09-03: rendering proven against fixtures; no production producer until T-15 / the paste-transcript intake.*
- [x] **R23:** No screen claims a spin will perform. REQ-I04 and `tests/support/forbidden-claims.ts` already ban the vocabulary; the trends feed is the surface most likely to reach for it.
- [x] **R24:** The empty feed and the saturated/stale states are designed, not defaults — `DESIGN.md:63` already names them as required honesty states, and `DESIGN.md:108-109` already specs the screens. *2026-09-03: the empty state is reachable; the stale state is designed and rendered from fixtures only — `stale_at` has no writer (see R7), so it cannot appear from data.*

---

## Left to the developer

- **The three checkable properties in R13** — how "subject matter changed" and "one structural element changed" are computed. Their invariant is that they are computed, not asserted by the model that wrote the spin.
- **The trends table shapes**, subject to tech-spec §2's sketch and to `creator-data-registry.ts`'s auto-detecting completeness test. System-spend tables are explicitly `NOT_CREATOR_DATA`; transcript-bearing rows remain governed creator/shared-content data with source provenance.
- **Whether the feed is a route or a section**, subject to `DESIGN.md:108-109`.
- **The worker's process shape** — entry point, systemd unit, restart policy. Its invariants are R-52's: own process, own bounded pool, and the system-budget spend authority.

## Tasks
1. [x] **Install and verify the selected pg-boss version before building**: cron/scheduling, retry/backoff, singleton/unique jobs, dead-letter/failed-job inspection, graceful shutdown and connection-pool behaviour. Record evidence; if any required capability is absent, append the fallback decision before task 2.
2. [x] `packages/trends` + the import-boundary edit + the no-scraping scan with its planted violation (R1–R3)
3. [x] Trends tables + migration + registry entries + writer registrations
4. [x] The YouTube metadata adapter, compliant transcript-state/provenance workflow, outlier scoring and stored baselines (R3–R7)
5. [ ] The submitted-link adapter through slice 4's reference intake (R4) — **adapter and `ReferenceIntakePort` built and proven against an injected double only; no production port implements `intakeReferenceTranscript` and no screen submits a link** (review round 1; the owner's paste-transcript decision under Reachability above makes it live)
6. [x] The autopsy pipeline, caching, framework proposals + R-9 stripping (R8–R10)
7. [x] The similarity gate: floor in code, config clamped, three properties, near-copy fixtures (R11–R14)
8. [x] The spin action through the modes pipeline; side-by-side; pricing (R15, R16)
9. [x] The feed, niche tracking, tier gate, honesty states (R17, R18, R22–R24)
10. [ ] The worker process: refresh, digest, separate system-usage/rollup accounting, atomic budget/concurrency, parking/dead letters, health/alerts/runbook (R19–R21b). The runner, system spend, autopsy dispatch, bounded refresh, health and operations are complete; live quota-aware YouTube refresh remains T-15 and Resend delivery is the recorded R20 cut/T-16.
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
1. [x] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Browse → autopsy → spin → side-by-side, in a browser**, against the real vendor. Follow [`respin-vendor-acceptance-walks.md`](../runbooks/respin-vendor-acceptance-walks.md), §7.
3. [x] **A forced near-copy is blocked before display** (R14) — the slice's compliance headline
4. [x] A config document cannot loosen the gate below the code floor (R12)
5. [x] Item ratios are **reproducible from stored baselines** (R5, M4's criterion) — DB CHECK `trend_items_outlier_ratio_matches_inputs` + `derivedOutlierRatio`, proven on fixtures
5b. [ ] A tracked niche **fills** with such items — *un-ticked 2026-09-03: no production producer of a trend item exists (see Reachability above)*
6. [x] A second view of an autopsy costs zero (R8) — *proven on fixture rows; no production producer until the paste-transcript intake or T-15*
7. [ ] A submitted link's transcript is subject to the R-3 quote budget (R4) — *un-ticked 2026-09-03: proven against an injected double only; no production `intakeReferenceTranscript`*
8. [x] The ingest layer contains exactly two adapters; a planted scraping dependency fails the scan (R1)
9. [x] A framework proposal contains no personal specifics from the source creator (R10)
10. [x] A scheduled autopsy's spend is bounded by the system budget and attributable; at the cap it is refused; a repeatedly-failing item is parked (R21)
11. [ ] A public third-party YouTube id with only an API key → metadata stored, transcript state named, **no autopsy/feed/Spin** until the creator pastes a transcript; a creator-owned OAuth caption succeeds only with the required consent (R3/R3a)
12. [x] Delete tenant/profile detail → system-spend totals remain non-tenant and the product-overhead input to 10b-1 remains; no creator id exists in either system-spend table (R21)
13. [ ] Stop the worker/miss a schedule/exhaust budget/park jobs → health state and the matching alert fire without prompt, transcript or creator content (R21b). In-process health and the operator query exist, but a stopped worker cannot emit its own alert; the required out-of-process monitor and target-host evidence remain open. Follow [`respin-vendor-acceptance-walks.md`](../runbooks/respin-vendor-acceptance-walks.md), §9.

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

**Population note — read before reporting "N of N".** Eleven named mutations now target code that exists. The source and ordinary tests are present, and the no-scraping check carries its planted violation; an independent non-author mutation pass was not run this session and no independent matrix result is claimed. The central residual remains the similarity equivalence relation itself: the shipped gate is a deterministic lexical/structural proxy, so its growing near-copy fixtures are evidence for the named relation, not proof of semantic or plagiarism detection.

## Done when
- [ ] All requirements met, all verification steps pass, **and R-52's verify-first task passed against the installed pg-boss — or its fallback was taken and recorded by appending to R-52**
- [ ] The "A creator can…" line walked in a browser, **including the block**
- [ ] **Spin compliance** PASS — this is the slice that path exists for — plus **billing** (Full gates), **learning honesty** and **brain tenancy** (Full gates), reviewers in **isolated worktrees**
- [x] `decisions.md` carries: the runner choice and its connection footprint, the similarity floor-in-code/config-may-tighten rule, the submitted-link-is-reference-class decision, and the sessionless-spend authority
- [x] `build-plan.md` M4's compliance criterion is **measured by a test**, not asserted
