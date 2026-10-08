# Respin creator journey — master implementation plan

**Date:** 2026-09-30. **Stage:** 2 of 3. **Implementation:** planned, evidence-prioritized backlog.

Prerequisite: [launch remediation](respin-launch-remediation-master-plan.md). Destination: [recurring workflow](respin-recurring-workflow-master-plan.md). Programme and single execution record: [creator-ready](creator-ready-master-plan.md), [existing ledger](../progress/creator-ready/ledger.md). [Planning evidence](../progress/respin-remediation-2026-09-30-codebase-review.md).

## Objective

Reduce repeated explanation, unsuitable concepts, substantive rewriting and avoidable filming friction across the full creator journey, using observed pilot problems to choose each release.

## Non-goals

Building every backlog row before learning from creators; general-purpose chat; social scheduling/publishing; full video editing; silent-format promises without a separately accepted contract; automatic brain changes; cross-profile learning; a new memory or analytics framework; new prices, processors or trial terms without decisions. Optional connectors, media intake, reminders and reading-view enhancements are gated options, not prerequisites for preparation value.

This master incorporates unfinished **requirements** from the service-quality, visual-v2 and finish plans. It does not mark those programmes complete. Their historical evidence, required checks, parked restrictions and review-round budgets survive. See the [cross-plan disposition](respin-launch-remediation-master-plan.md#existing-plan-disposition).

## Critical Paths touched

| Path | Reviewer | Full gates? | Work |
|---|---|---|---|
| Respin billing & credits | `respin-billing-reviewer` | yes | Priced revisions, any metered intake, source cost, connector jobs, offer experiments |
| Respin brain tenancy | `respin-tenancy-reviewer` | yes | Onboarding, returning work, edits, preferences, references, series and lifecycle |
| Respin spin compliance | `respin-compliance-reviewer` | no | Concept ranking, sourced content, manual/model distinction, reference adaptation |
| Respin learning honesty | `respin-learning-reviewer` | no | Feedback proposals, process measures, connectors, results and cohort reporting |

Use the complete checklists and code-time rules linked by the launch master. Auth/OAuth/external fetch/storage changes also receive security review. Every new retained record participates in export/deletion/retention **in its owning package**, not at the end of this stage.

## Source coverage and inherited work

| Source ID | Implementation home | Existing work to extend |
|---|---|---|
| RP2-01 discovery/consideration | J5 | Audit P6 truth instruments, visual-v2 P4 marketing, launch L5 examples |
| RP2-02 onboarding/recovery | J1 | Completed service-quality first-session work; visual-v2 P3; finish brain approval/versioning |
| RP2-03 returning home | J1 | Launch L2 piece/selection records, L3 history, L4 saved output; visual-v2 P2/P3 |
| RP2-04 concept choice | J1 | Launch three-form contract and bounded history |
| RP2-05 references/research | J3 | Existing Trends/autopsy/Spin and creator-ready T3-REF matrix; audit P11 bounds |
| RP2-06 script development | J2 | Launch saved versions/priced revisions; visual-v2 P2 |
| RP2-07 shooting preparation | J3 | Launch recording pack; visual-v2 P2 filming workspace |
| RP2-08 feedback/personalisation | J2 | Existing feedback/proposal authority; audit P2 proposal history fixes |
| RP2-09 series/continuity | J3 | REQ-C07/C08 and launch source/piece lineage |
| RP2-10 results/reflection | J4 | Finish 9a/9b, R-115 boundary and visual-v2 P4 Results |
| RP2-11 pricing/support | J5 | Launch offer, parked T6 remainder only after unpark, finish revenue/cost duties |
| RP2-12 trust/export/deletion | J1–J5 same-change duty; J5 integrated witness | Finish 10b-1 lifecycle and audit P5; no separate retention system |

## Phases

| N | Title | Depends on | Makes live | Status | Contract |
|---|---|---|---|---|---|
| J1 | Resume, enrich and choose | Accepted launch candidate and observed pilot friction | `/onboarding`, `/brain`, `/studio` returning-session flow | planned | [J1](#j1--resume-enrich-and-choose) |
| J2 | Edit, revise and learn preferences | J1; launch L2–L4 contracts | Saved pack editor and explicit preference proposals | planned | [J2](#j2--script-edits-and-specific-feedback) |
| J3 | Reference library, filming and series continuity | J1; J2's version contract for editable packs | `/trends` saved references and `/studio` board/recording view | planned | [J3](#j3--references-production-and-series) |
| J4 | Link outcomes and optionally connect analytics | J1; connector branch has separate permission/provider gate | `/results` process feedback and qualified outcomes | planned | [J4](#j4--results-and-authorized-connectors) |
| J5 | Discovery, commercial support and cohort checkpoint | J1; applicable accepted J2–J4 releases | Accurate acquisition/offer, usable support, cohort decision | planned | [J5](#j5--discovery-economics-trust-and-cohort-checkpoint) |

Discovery/truth/support fixes may start against the accepted launch offer while feature packages proceed. Pilot evidence selects one consequential correction at a time among J1/J2; then J3, then the optional connector branch of J4. A safety, privacy, charging or materially false-offer defect takes immediate priority regardless of numbering. J5 does not require optional connectors or every backlog feature to ship.

### J1 — Resume, enrich and choose

**Goal / requirements:** resume approved context and unfinished work, and choose differentiated feasible concepts; RP2-02/03/04/12, REQ-A03/A04, B01–B04, C01/C04/C08. **Owner:** `respin-engineer`.

**Source files:** existing `respin/app/(product)/onboarding/actions.ts`, `onboarding/interview/actions.ts`, `brain/actions.ts`, `studio/page.tsx`, `studio/studio-panel.tsx`; `respin/packages/db/src/{onboarding-ops,interview-ops,creative-work-ops,with-workspace}.ts`; `respin/packages/modes/src/assemble.ts`. `creative-work-ops.ts` is supplied by launch L2; missing L2 proof blocks that dependency. Reuse visual-v2 P3's exact source/scope and stale-response contracts; do not rewrite its foundations.

**Tasks / contracts:** autosave/resume onboarding with explicit unsaved/saved/conflict states and scope-bound draft identity. Keep the minimum approved-context activation and entitlement checks; enrichment is optional after that minimum. Returning Studio lists unfinished pieces, selected versions and recent rejection notes with true state labels; never infer filming/publication from export or a generated draft. Profile change clears pending local state and late responses from the previous scope. Rank a small candidate set using declared goals, specificity, practical feasibility and recent-work novelty; explain which inputs were used without a predicted-performance score or an extra routing call. Alternatives must change premise. Prefer existing input storage and deterministic ordering before adding new records.

Voice-note or owned-media intake is a **separate conditional extension**: only after an observed input-effort problem, an approved processor/access/cost decision, and a bounded media/provenance/lifecycle contract. Without those, text/pasted material remains supported; do not block J1 or imply media was inspected.

**Acceptance / proof:** extend `respin/tests/studio-ui.test.tsx`; add `respin/e2e/journeys/returning-creator.spec.ts` and `respin/packages/db/tests/creative-work.test.ts` cases. Expected: resume after session expiry without promised-progress loss; viewer/foreign scope cannot write/read; stale autosave and late profile response refuse; returning creator opens the selected piece; differing premises remain filmable under declared constraints. Permissioned baseline/candidate task protocol records completion, abandonment and active effort, including assistance, with failed users retained. Do not call elapsed browser time effort saved.

**Least confident:** shortened setup could hide a missing source/approval precondition. **Out of scope:** changing minimum activation or paid entitlements through UX work.

### J2 — Script edits and specific feedback

**Goal / requirements:** preserve a creator's edits and propose precisely scoped preferences they can approve, expire and undo; RP2-06/08/12, REQ-C05/C06, B02, A03/A04. **Owner:** `respin-engineer`; tenancy and learning reviews, billing where commissioned revisions change.

**Source files:** launch saved route and `respin/packages/credits/src/saved-generation.ts`; `respin/packages/db/src/{generation-schema,creative-work-ops,feedback-ops,promotion-ops}.ts`; `respin/packages/brain/src/proposal.ts`; `respin/app/(product)/studio/feedback-block.tsx` and `brain/actions.ts`. New `respin/packages/db/src/creative-version-ops.ts` and corresponding `creative-version.test.ts` own editable versions; new UI `respin/app/(product)/studio/saved/[attemptId]/edit-panel.tsx`. Migrations and lifecycle registration land with the records.

**Tasks / contracts:** add append-only piece versions with origin `model` or `creator_edit`, base version ID, producing generation ID when present, edited fields and server-derived scope/time. Use optimistic version tokens for autosave; conflicting tabs get an explicit compare/reload choice, never overwrite each other. Add a selected-version pointer alongside L2's selected generation, with a deterministic legacy-to-model-version mapping. Original paid generations and their acceptance/charge facts remain immutable. Reopening/exporting selects exactly this version; ordinary edit/save/compare costs no credits. A newly commissioned revision receives its own operation ID, parent/base-version identity, quote and pinned context under launch L2.

Human edits are clearly labelled and are not silently declared model-verified or publish-safe. Preserve unresolved checks and stale-check labels; making the editor available does not certify altered text. Capture exact edits, explanations and positive examples in permissioned product storage. Explicit **remember** actions create reviewed preference versions; repeated patterns construct a proposal only in `packages/brain`, with supporting versions, intended scope and expiry. Approve/edit/reject/expire/undo are visible actions; undo appends a new brain version and cannot erase historical evidence. Rejected evidence must not regenerate the same active proposal indefinitely; stale/superseded evidence follows the existing audit P2 history-preserving rules. Taste evidence never becomes numerical result evidence.

**Inference amendment gate:** audit P2-R9/R-115 currently permit closed-static feedback values from at least three distinct generations, with `strength: repeated`, targets only `voice`/`killtest`, and no numeric or `performance_meta` draft. Keep that behaviour until the owner approves a dated `J2-feedback-policy` amendment in `docs/initial/decisions.md` and the affected PRD C05 contract. Ordinary editing, precise evidence capture and explicit user preference edits can ship before that amendment; arbitrary inferred preference text cannot. Amend inherited P2-R9's contract/acceptance by an explicit cross-reference and required review, never by silently treating it as already satisfied.

The proposed extension keeps `packages/brain` as sole constructor, `strength: repeated`, explicit approval, and no numerical/result/performance/sensitive-trait assertions. Permitted targets are `/avoid/-` on Voice or `/rules/-` on KillTest; contextual style/filmability preference text is bounded and validated through existing brain schemas, never an unrestricted field/target patch. Its evidence grain is **one independently commissioned root creative piece**: require at least three distinct source generation IDs across at least three distinct piece roots, all in the same profile and compatible basis brain version, supporting the same scoped candidate preference. Revisions, retries, alternatives, edits and repeated autosaves of one piece count once. Positive examples need an explicit user selection/endorsement; saving or exporting alone is not positive evidence. Preserve both supporting and contradictory notes; a directly contradictory instruction blocks the candidate pending user clarification. Store exact evidence IDs/versions and the proposal-policy version; deletion/revocation/expiry invalidates pending evidence and triggers revalidation before approval. Existing decided proposals remain immutable. Any model-assisted interpretation must use an explicitly approved, bounded metered operation through the current provider authority; otherwise use deterministic repeated evidence or leave the suggestion unavailable.

**Acceptance / proof:** extend `packages/brain/tests/proposal.test.ts`, `packages/db/tests/lineage-feedback.test.ts`, new `creative-version.test.ts`, launch `saved-generation.test.ts`, and `e2e/journeys/recording-pack.spec.ts`. Expected: conflicting autosaves never silently win; reload/export returns the selected human/model version; edits do not mutate generations or debit; retries of priced revisions use pinned base versions; wrong-scope evidence rejected; no silent proposal application; rejection/expiry/undo hold. Inference tests require zero proposals from many autosaves/revisions of one piece or two independent pieces; three eligible independent roots can propose only after amendment enablement and with explicit positive support where used. Reject numeric, performance, sensitive-trait, wrong-target, incompatible-brain and contradictory candidates; removing an evidence item before approval prevents application. Verify old-policy behaviour remains closed-static and unsupported policy versions fail closed. A paired later task records whether the same correction recurs and whether unrelated output degrades, retaining positive and negative examples.

**Least confident:** exact edit evidence may overfit a local correction as a general preference. **Out of scope:** automatic brain activation, causal performance learning or shared-library personal examples.

### J3 — References, production and series

**Goal / requirements:** return to supported references, prepare selected work for filming and deliberately continue a series; RP2-05/07/09/12, REQ-C02/C07/C08, E01–E08, A03/A04. **Owner:** `respin-engineer` with compliance, tenancy and applicable billing review.

**Source files:** `respin/app/(product)/trends/page.tsx` and `actions.ts`, existing Studio saved views; `respin/packages/trends/src/trend-source.ts`; `respin/packages/credits/src/pasted-reference.ts`; `respin/packages/db/src/{trends-schema,content-rights-schema,creative-work-ops}.ts`; `respin/worker/{refresh,system-autopsy}.ts`. New `respin/packages/db/src/series-ops.ts`/`series-ops.test.ts` and a scoped `reference-bookmarks.ts`/test only if existing reference storage cannot represent the save relationship.

**Tasks / contracts:** save a scoped reference-to-piece relationship with rights, source/analysis version, fetched material classes and freshness. Existing autopsy/shared-rights storage keeps its authority; a bookmark is not permission to republish or a second cached analysis. Distinguish transcript, visual and audio observations and state absent material. Handle private/deleted/unavailable sources, redirects, timeouts, duplicate submissions, stale analysis and revoked rights through the existing bounded intake/settlement path. Breakdown remains useful by itself; adaptation is separately priced and similarity-gated.

Authorized Instagram/TikTok retrieval is conditional on demand plus current rights/API/provider approval, actual retrieved-material contract, retention/deletion propagation, known monthly/free-tier limits and per-attempt cost. The implementation owner verifies current official terms when that option is activated. No scraper, URL-as-media assumption or free-form fetch bypass; limited pasted-input analysis remains labelled as such.

Group shots by location/setup, show missing assets and practical alternatives, and tie checklist/progress to the selected version. Creator-reported filmed state records piece/version/time/provenance; it is not a platform-verified result. Effort estimates are labelled estimates and calibrated from reported/observed work. Add minimal series records (profile, name, premise/arc, ordered piece links, active/paused/archived state), episode premises and a small work board. New requests can deliberately continue a series without a generic duplicate blocker. No fixed universal series/experiment ratio.

Reminders and teleprompter-like reading are optional after observed need. If reminders are approved, reuse pg-boss with explicit opt-in, timezone/quiet hours, frequency/cost cap, deduplication and cancel-on-opt-out/deletion. Deletion/revocation checks apply again at execution, not only enqueue. Keep them disabled until the complete delivery/cancellation contract is tested.

**Acceptance / proof:** retain existing source/Spin tests; add bookmark/series tests and `respin/e2e/journeys/production-continuity.spec.ts`. Expected: saved supported reference reopens with accurate material limits, stale/rights-revoked input cannot create a misleading new analysis, no scope leak or accidental script charge; changed selected version invalidates stale checklist state; missing assets visible; series continuation survives reopen; deletion covers series/bookmarks/jobs. Conditional source/reminder branches require real authorized integration evidence plus failure/timeout/cancel tests before being advertised. Human filming task records missing-shot/setup-change burden, not an assumed productivity gain.

**Least confident:** a broad reference library may add cost before it improves accepted concepts. **Out of scope:** a scheduler, video editor or global trend coverage.

### J4 — Results and authorized connectors

**Goal / requirements:** link a filmed piece to a published post and separate preparation feedback from qualified outcomes; RP2-10/12, REQ-F01–F05, A03/A04, C05. **Owner:** `respin-engineer`; dedicated security/tenancy and learning review for the connector branch.

**Source files:** `respin/app/(product)/results/page.tsx`, `respin/app/(product)/results/actions.ts`, `respin/packages/db/src/{results-schema,results-ops,results-comparison-ops,promotion-ops}.ts`, `respin/packages/brain/src/{comparison,proposal}.ts`. Conditional new adapter/worker files: `respin/packages/trends/src/analytics-connector.ts`, `respin/worker/analytics-refresh.ts`, `respin/packages/db/src/analytics-connection-ops.ts`, with tests beside the existing package/worker suites. A new external provider is not selected by naming these extension points.

**Tasks, always available:** attach a published URL/platform/date to the scoped piece/version; record preparation/filming reports with self-reported provenance. Show unavailable or insufficient outcome evidence honestly. Do not promote a user-entered count, URL, admin assertion or test fixture into `connector_verified`.

**Conditional connector implementation:** first resolve inherited T-8 (whose account/data, granted permissions, retention and revocation), provider scopes/access approval, costs/caps and a versioned metric/window mapping. Approve a bounded adapter contract before its implementation: server-bound workspace/profile/account, OAuth state/PKCE where applicable, encrypted server-only credentials, reconnect/revoke/expiry paths, source post identity and source observation IDs/windows, raw-response retention/minimisation, rate limits, bounded retries and visible stale/partial/error state. Fetch through the provider adapter outside DB transactions; only the scoped verified-ingestion capability may derive verification from authenticated connector receipts. Wire scheduled refresh via existing worker and cancel/recheck tombstones on disconnect/deletion; test races with revocation and deletion. Missing authorization leaves this branch blocked; manual reporting still ships.

Comparisons preserve complete compatible populations and windows; paid/organic and reach/conversion stay separate. Numerical proposals require R-115's at least three comparable verified treatment and three eligible verified outside-treatment baseline observations, correct creator/metric scope and confounders. Approval remains explicit and the sole proposal constructor stays `packages/brain`; three observations never imply causality. Revoked/expired evidence must be excluded from future derivation according to the approved retention/verification contract, with prior recommendations retaining honest historical attribution.

**Acceptance / proof:** extend result, comparison and proposal suites; add `respin/packages/db/tests/analytics-connection.test.ts` and `respin/worker/tests/analytics-refresh.test.ts` only for the approved connector branch. Expected: manual/admin spoof cannot mint verification, wrong-account/profile receipt denied, rate-limit/partial/timeout does not fabricate zero, revoke/delete prevents new reads/jobs, incompatible series never pool, missing/insufficient cohorts yield no numerical proposal. Actual approved-provider connection/reconnect/revoke witness required before enabling connector claims; fakes establish protocol behaviour only.

**Least confident:** permitted APIs may not expose the required metric/window populations. **Out of scope:** causality, guaranteed reach or a connector requirement for pilot launch.

### J5 — Discovery, economics, trust and cohort checkpoint

**Goal / requirements:** creators understand the job/offer, recover from problems and choose repeat paid use at sustainable cost; RP2-01/11/12, REQ-H01, G01–G08, A04 and PRD §5. **Owner:** product/research/operations owners plus `respin-engineer` for necessary implementation.

**Files:** `docs/initial/{PRD,gtm,decisions}.md`, existing marketing/help and billing/usage/account views, `respin/packages/config/src/schema.ts`, credits Stripe/ledger authorities, DB lifecycle/export and existing model-spend report. Reuse audit P6, finish revenue duties and launch offer proof. New `docs/progress/creator-ready/cohort-protocol.md` is one programme research protocol, not a per-component test programme.

**Tasks / contracts:** publish platform-native, permissioned or labelled synthetic input→concept→pack examples with real limitations; competitor claims require their own current evidence. Measure qualified arrival to first useful session rather than impressions. Fix understandable costs, actionable support/recovery and unobstructed cancellation/pause. Change one owner-approved price/allowance hypothesis at a time, with versioned cohorts and preserved existing commitments. No experiment silently changes historical pack expiry or entitlements.

Keep the existing model-spend metric named. Define a separate contribution calculation with recognized revenue, model/source/hosting/payment/support and allocated free/demo/failed-use costs; align periods/currencies and show allocation assumptions. Unknown costs withhold a complete margin rather than become zero. A permissioned offline cohort worksheet is sufficient until an in-app report has a demonstrated need; do not build a dashboard merely to store a proposed measure. Include heavy-use and failed-run populations.

Run integrated source-inspection/correction/profile-switch/export/deletion/restore checks over the new context, human edits, references, series, pending proposals and scheduled jobs. No rehydrated deleted context may reach a future prompt. Reuse the lifecycle authority and preserve previous evidence labels.

**Cohort protocol / proof:** before observation, freeze cohort membership, qualifying payment/second-billing opportunity, 28-day filming window, distinct-piece key, assistance, major-rewrite rubric, effort method, cost allocation and review date. Initial proposed management rules for 20 qualified paying creators: at least 12 independently use Respin for two distinct filmed pieces, at least 10 choose a second paid month at the tested offer, preparation effort/major rewrites improve versus the recorded alternative, and contribution is credible under the declared cost population. Keep dropout/cancellation, payment failures, pauses and concessions in the report; separate paid/trial/founder-assisted/team populations. These are proposed decision rules, not statistical proof. No thresholds change after seeing the result.

**Acceptance:** marketing/pricing regression tests and applicable billing integration/concurrency tests stay green; integrated lifecycle witnesses pass; frozen cohort report includes numerator/denominator/price/window/missingness for each rule, including failed and cancelled users. Weak results name one diagnosis and one bounded correction hypothesis with a predeclared review point. A missing cohort is `evidence pending`, never technical failure or claimed business success.

**Least confident:** retention and costs may not support the tested offer even if creators like the output. **Out of scope:** hiding cancellations, an upgrade-pressure flow or endless feature expansion after a weak checkpoint.

## Risks and decisions

All packages inherit the launch master's [same-change lifecycle, rollback and validation contract](respin-launch-remediation-master-plan.md#shared-implementation-and-validation-contract). Use its exact canonical commands once each integrated change is stable, plus each package's focused tests and actual user journey. Additive/versioned records and rollback readers must support outputs created under both old and new contracts; disable new writes without losing retrieval or erasure. Include source/proposal/series jobs in cancellation and deletion proofs.

No external dependency is approved here. J1 media, J3 intake/reminders and J4 analytics require a decision naming the provider, current rights/scopes, monthly and per-operation cap, free-tier ceiling if any, outage path and deletion obligations. J5 commercial changes require explicit offer/transition decisions. Previously parked money work still needs unpark and its retained review obligations. None of these conditions block unrelated already-authorized fixes.

For each release, select the affected contracts/files from this master and the named inherited phase, reconcile against current source, and record the bounded execution slice in the existing ledger. Do not dispatch all J packages to concurrent writers. A new requirement or changed acceptance contract requires plan review before implementation; routine task tracking does not.

## Plan Review Log

| Date | Round | Reviewer | Reviewed ref | Verdict | Notes |
|---|---|---|---|---|---|
| 2026-09-30 | — | — | working tree | UNCHECKED | Draft master-level amendment; conditional external branches are not approved for execution. |
| 2026-09-30 | 0 | independent plan-reviewer | frozen draft `8845bdf378ba` | NOT READY | Grade C: richer feedback inference lacked an amendment gate and independent evidence grain. Fixed in J2, retaining the current closed-static policy until approval. One follow-up review pending. |
| 2026-09-30 | 1 | independent plan-reviewer | frozen draft `5c09f1815dac` | READY | Grade A: inference amendment, independent evidence, bounded proposals and revalidation close the gap. Conditional branches retain their prerequisites. |
