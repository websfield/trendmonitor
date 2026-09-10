# Respin: current system

**Snapshot date:** 9 September 2026  
**Purpose:** give product, creator-workflow, engineering and commercial reviewers a factual baseline to compare with [Respin: system-builder implementation brief, proposed v1](Respin_System_Builder_Brief_v1_2026-09-08.md).  
**Scope:** the current local `respin/` implementation and recorded delivery evidence. This document describes the existing system; it does not adopt the proposed offer or change the governing product decisions.

## 0. Read this first

Respin currently implements a **credit-based creator content application**. A creator builds an inspectable profile, supplies an idea or source material, and uses Studio or Trends/Spin to produce structured scripts, hooks, captions and filming instructions. It also has a Results surface, creator-approved memory changes, subscription billing and substantial recovery/data-lifecycle machinery.

The proposed brief would reorganize this into a **recording-pack product**: one brief, three initial angles, one selected editable deliverable, two included AI revisions, explicit approval/recording states and pack-based billing. Several ingredients already exist, especially structured script output and durable generation settlement. The integrated recording-pack workflow and its commercial unit are additional work.

Three distinctions matter throughout this comparison:

- **Implemented** means the relevant code was inspected in this working tree. It does not mean deployed or proven with customers.
- **Recorded evidence** means an existing report or result on disk, identified below. Those checks were not rerun while preparing this document.
- **Gap / assessment** means a difference identified against the proposal, or a reasoned tradeoff. It is not a new product decision.

**Repository basis:** branch `respin-m1-billing-credits`, base commit `961c2a9d7e7911e3c591d904dd52576a69495b5a`, plus existing uncommitted changes inspected on 9 September. In particular, Phase 10a is present in the working tree. Checking out the base commit alone will not reproduce this snapshot. Repository records describe the product as undeployed; this review did not inspect a deployment, live configuration, Stripe account or customer data.

Section numbers broadly follow the proposed brief, so the two documents can be read together.

## 1. Current product contract and customer journey

The governing product direction is a creator content engine with three layers of context: universal creative rules, a curated shared framework library, and each creator's versioned brain. The PRD targets solo short-form creators; the intended initial platform wedge is YouTube Shorts, subject to the recorded source/access and launch gates. Studio, Trends, Results and the supporting account/billing/marketing surfaces form the application. [E1]

The existing journey is approximately:

```text
Sign up / sign in
  -> workspace and creator profile
  -> own-post intake and strategy interview
  -> review, confirm and activate creator brain
  -> choose a Studio mode or a Trends reference
  -> receive structured output or an explained refusal
  -> optionally request a paid revision and record feedback
  -> optionally log post results and review eligible memory proposals
```

This is a description of connected capabilities, not evidence that every stage has passed a current live acceptance walk. The server-side generation operation requires an existing brain activation snapshot. [E3, E5]

### Commercial defaults

These are repository defaults and offer definitions, **not a reading of currently configured Stripe prices or active customer subscriptions**. Subscription setup uses USD. [E2]

| Tier | Monthly price, USD | Monthly credits | Creator-profile cap | Generation access |
|---|---:|---:|---:|---|
| Free | $0 | 25 | 1 | Hooks, Caption, Ideation |
| Creator | $10 | 250 | 1 | All seven modes |
| Pro | $60 | 2,000 | 1 | All seven modes |
| Studio | $200 | 8,000 | 5 | All seven modes |

The existing add-on called a **pack** is **1,000 credits for US$10**, with a seeded validity of 12 months. It is not a recording pack. Profile capacity also does not prove team collaboration is complete: seats/invites and related administration remain in the planned 10b-2 scope. [E2, E12]

### Studio modes

| Mode | Input / output emphasis | Default credits per original operation |
|---|---|---:|
| Footage to thesis | Text describing available footage into a thesis and script/shot plan | 5 |
| Idea to script | An idea into a complete structured script | 5 |
| Source to reel | Supplied source text rebuilt into a creator-oriented script | 5 |
| Analyse and spin | A resolved reference/autopsy adapted into a new script | 5 |
| Hooks | Three to five hooks with named mechanics | 2 |
| Caption | Caption and hashtags | 1 |
| Ideation | Three to five hook/thesis/framework combinations | 3 |

AI revision has its own default price of **2 credits**. Reference autopsy is a separate **4-credit** operation. These prices come from versioned configuration; the tables show seeded values. Some older map descriptions still say six modes, but the current mode registry, plan gate and Spin path cover all seven. [E2, E4, E5, E8]

## 2. Existing architecture and responsibilities

The application is a self-contained TypeScript workspace under `respin/`. The repository also contains the earlier UGC Intelligence and Cutdown products; their capabilities should not be counted as integrated Respin features. [E1]

| Area | Current responsibility |
|---|---|
| `app/` | Next.js App Router pages, thin server actions and API handlers; React presentation |
| `packages/auth` | Better Auth integration, session/admin gates, optional Google sign-in, auth mail and rate-limit configuration |
| `packages/db` | PostgreSQL/Drizzle persistence, workspace/profile scopes, brain and generation records, results, lifecycle/export/deletion machinery |
| `packages/config` | Versioned operational configuration, allowances, credit costs, limits and model settings |
| `packages/credits` | Billing authority, credit balance/debits, Stripe operations, and metered generation orchestration |
| `packages/modes` | Prompt/output contracts, mode-specific checks, quality decisions, traceability and Spin similarity checks |
| `packages/llm` | Provider adapter and model request/response/cost types; Anthropic implementation |
| `packages/trends` | Compliant source adapters, reference intake and autopsy-related logic |
| `packages/brain` | Comparison and memory-proposal construction from scoped evidence |
| `worker/` | Separate pg-boss process for background autopsy work, lifecycle/retention/recovery and scheduled reporting |

The current package manifest names Next.js 15, React 19, Better Auth, Stripe and pg-boss 12.29.0. The documented deployment direction is self-hosted PostgreSQL and a Lightsail-hosted application/worker. This is architecture/configuration evidence, not a claim that the deployment is operating. [E1, E3, E5, E8]

## 3. Current implementation and delivery status

The [master plan's Progress tracking section](../plans/respin-finish-master-plan.md#progress-tracking) is the status authority. Individual evidence cards explain what its statuses mean. [E12]

| Area | Current recorded position |
|---|---|
| Early foundation, onboarding and brain editing/export | Built; the 4c closure and slice 5 record Ready evidence for their scopes |
| Studio expansion, Trends/Spin and pasted-reference autopsy | Built; slices 6–8c retain ALMOST status and outstanding acceptance/review evidence |
| Results and proposal review | Slices 9a/9b built, with incomplete acceptance evidence; Phase 10a adds the verified-only correction |
| Phase 10a | ALMOST: engineering complete, two review rounds recorded, evaluation and live acceptance evidence incomplete |
| Phase 10b-1 | Lifecycle/deletion work is substantially built; the master row remains implementation and records residuals |
| Phase 10b-2 | Plan Ready/A; seats, broader administration and associated work remain planned |
| Phase 10c | Plan Ready/A; public/API controls, platform policy and launch truth remain planned |

The 10a card records a final integrated gate of **231 test files, 5,168 tests, zero failed and zero skipped**, with Docker live, plus successful typecheck, lint, worker typecheck, migration-drift check and build. This is a **reported historical run**, not a fresh verification by this document's author. The same card explicitly retains ALMOST, including findings fixed without another independent review and missing real-service walks. [E12]

There is no customer-usefulness, preparation-time, renewal or product-market-fit conclusion in that test count.

## 4. Current domain model

The existing persistence model centers on creator context, generation attempts and generated documents. [E3, E5, E9]

| Existing concept | What it represents |
|---|---|
| Workspace / membership / creator profile | Account ownership, roles and per-creator data scope |
| Onboarding input | Creator-owned examples, reference material and structured interview evidence |
| Brain document / activation snapshot | Versioned context and the coherent approved document versions used for generation |
| Framework | Shared curated or eligible private creative mechanism/context |
| Generation attempt | Idempotent operation identity, request hash, vendor/checkpoint/settlement state |
| Generation | Stored request, output or refusal, model/config/prompt provenance, brain activation, billing link and optional revision parent |
| Generation feedback | Creator reaction and note linked to a generation |
| Result / promotion proposal | Logged observation or proposed memory change with evidence references |
| Credit ledger / subscription | Grant, consumption and billing history |

The generation-attempt states are `claimed`, `vendor_started`, `vendor_complete`, `settled`, `refused` and `recovery_required`. Stored generation outcomes distinguish `usable` from `honest_refusal`. [E5]

**Gap against brief §4:** in the inspected generation schema and Studio actions, there is no dedicated recording-pack entity combining selected angles, manually edited content versions, version-specific approval, ready-to-record state and recorded/published observations. Existing generation lineage is useful groundwork, but it is not that complete workflow. Similarly, credit grants and durable attempts do not establish the proposed pack reservation/release contract.

## 5. Onboarding, inputs and source grounding

Current onboarding accepts creator examples and reference text. Voice inference reads examples classified as the creator's own posts; the seeded minimum is three and the corpus cap is 50. Strategy and Kill Test setup use an eleven-field structured interview covering audience, positioning, goals, ambitions, metric definition, banned words and banned styles. Strategy/Kill Test assembly is deterministic. Inferred brain content goes through confirmation and activation. [E2, E3]

The brain has four document kinds: **Voice, Strategy, Performance Meta and Kill Test**. These are stored context, not model weights. Brain editing/versioning and JSON/Markdown export exist. The explicit download endpoint is a **creator-brain export**, not a recording-pack export. [E1, E3, E7]

The inspected Studio input path supplies text, platform, mode and an optional revision parent. “Footage to thesis” should therefore be understood as working from a description of footage. No audio-upload/transcription or rendered-video workflow was identified in the inspected Respin app paths.

Output traceability checks numbers, dates and names against creator context/input and surfaces findings or `[check]` markers. The implementation itself states that tracing a specific to input is not proof that the specific is true. [E4]

**Gap against brief §5:** the proposal adds a minimal provisional profile, practical production constraints and a source-span/claim-review model. Current structured brain provenance and traceability are reusable pieces; they should not be described as complete sentence-level factual support, an editable source ledger or a measured voice-memo service.

## 6. Generation, output and editing

### Output already available

A full-script mode requires a thesis, framework, three to five hooks, timestamped voice-over beats, a marked turn, a shot map referencing beats, on-screen text, caption/hashtags, rationale with a weakest point, and disclosure guidance. Hooks, captions and ideation have narrower mode-specific contracts. The parser rejects missing required sections, unexpected sections and malformed structures. [E4]

Every output includes `whyThisPerforms` and `disclosure`. Despite the former's name, its rationale is not measured evidence of performance. The proposed “Creative rationale and limitations” presentation would be a terminology/prompt change with historical-schema compatibility to preserve.

These checks have bounded coverage: enforcing an output shape or finding a repeated phrase does not establish creative quality, complete factual correctness or whether a creator can actually film the result.

### Current generation sequence

```text
Session / workspace / profile and plan checks
  -> price, credit, spend-limit and concurrency checks
  -> activated brain and eligible framework context
  -> durable attempt claim and request fingerprint
  -> vendor draft, parse and quality checks
  -> one automatic rewrite if required
  -> creator-rule scoring on an accepted draft where applicable
  -> durable response checkpoint
  -> transactional settlement: debit + generation record
  -> return the settled result to the page
```

The orchestration invokes the vendor outside the settlement transaction. Schema errors, transport failures and quality refusals have different outcomes; “failed generation” is not one uniform billing category. Spin adds reference resolution and similarity checks before a usable output can be returned. [E4, E5]

### Revisions and manual work

The creator can select an existing generation as a revision parent and submit a revision note. The backend resolves the parent through the profile scope and records lineage. The revision is a separately priced operation, not one of two included revisions attached to a paid pack. Feedback supports reactions such as off-voice, too-generic, wrong-angle and not-filmable. [E5, E9]

The inspected Studio actions expose generation and feedback. A full editor with optimistic manual saves, explicit content-version approval, checklist resolution and recording-session grouping was not identified. Those are substantive additions in the proposal, even though much of the script content already exists.

## 7. Billing, credits and cost accounting

The current balance is derived from an append-only credit ledger. Generation settlement takes a workspace lock and writes the debit and generation within one transaction. Stripe handling includes event/business-grant deduplication; the paid invoice grant is keyed to the invoice identity. [E5, E6]

Paid monthly credit grants expire one month after the invoiced service period ends, providing limited rollover. Purchased credit add-ons have their own expiry. The ledger allocation model accounts for expiry and pause periods. Pause/resume, billing portal, invoice recovery and opt-in auto-top-up are existing billing concerns. [E2, E6]

### A material difference: a quality refusal can be charged

The current generation operation can store an `honest_refusal` with no draft and debit the operation's credits. Its focused test explicitly expects a failed rewrite to produce one stored refusal and one debit; there is also a Spin near-copy refusal case with a debit. A parse/provider failure follows a different path. [E5]

The proposed brief instead consumes a pack only when an editable deliverable is durably available, and consumes no pack for terminal quality refusal. Adopting that rule changes product economics and settlement behavior; it is not just changing the displayed price.

### Further differences

- Current units are credits; the proposal sells recording packs and included successful revisions.
- Current defaults are USD; the proposal quotes A$149/month and A$59 add-ons. These are different currencies as well as different offers.
- Current generation checks balance before the vendor call and again at settlement. A durable attempt claim should not be mistaken for a reservation of one commercial pack.
- `/admin/model-spend` is a cost/reconciliation surface. The repository explicitly distinguishes it from a verified revenue-minus-cost margin dashboard. [E12]
- Tenant generation meters model calls; the public Sample Spin uses aggregate usage per attempt with known limitations recorded in the 10a card. A blanket statement that every path already has identical per-call accounting would overclaim. [E5, E10, E12]

## 8. Durable jobs and the current user experience

Studio's server action awaits the generation result. Its persisted attempts/checkpoints provide backend recovery structure, but the current action does not implement the brief's quick job acceptance followed by authenticated pack-status polling. It also creates a fresh attempt ID per submission: separate submissions can represent separate charged operations, even when their text is similar. [E5]

The standalone pg-boss worker already supports background autopsy processing, retention/deletion work, generation recovery and scheduled activation reporting. The production composition still selects unavailable adapters for YouTube discovery and weekly digest delivery. Source-adapter code and scheduled jobs therefore do not prove an operating discovery feed or delivered email digest. [E8]

**Gap against brief §8:** a bounded pack-work queue, return-later pack status, user selection between stages, and admission/reservation semantics require integration with the existing attempt authority. The presence of pg-boss alone does not complete that journey.

## 9. Creator memory and numerical learning

Current memory changes are proposals subject to creator review. The code supports feedback-derived proposals and result-derived Performance Meta proposals. Feedback proposals use a closed reaction mapping and require evidence from at least three distinct generations with compatible context; they do not turn arbitrary one-off edits into permanent preferences. [E9]

For numerical comparisons, `isNumerical()` now accepts **only `connector_verified`** results. Result-proposal construction also rejects self-reported evidence. The minimum population is three comparable observations; treatment and baseline populations are checked separately. Comparisons preserve profile/platform/metric/observation context, separate paid from organic, and separate reach from conversion. This is observational comparison, not a causal performance guarantee. [E9]

The current manual result writer produces `quantified_self_reported` or `unquantified` rows. It writes no connector verification provenance. As a result, manually entering more numbers does not unlock numerical learning. Authorized analytics connectors remain a missing source of eligible evidence. The Results UI has a verification-unavailable state. [E9]

**Correction to the proposed brief's starting state:** its §9 statement that `comparison.ts` permits self-reported numerical evidence describes the earlier state. The current working tree has already implemented the R-115 correction, plus a legacy-proposal audit path. The 10a card records an empty local audit; that does not establish the state of another database. The proposal's broader pilot-wide disabling of performance-driven functionality remains a separate product/rollout decision. [E9, E12]

## 10. Instrumentation and evaluation

The current activation measure concerns brain activation and a first usable full-script generation within 24 hours of signup. It has defined numerator/denominator handling, exclusions, maturity and small-cohort presentation. An admin activation page and aggregate-emission path were added in Phase 10a. Sentry/PostHog integration code exists, but real collector/project acceptance is still outstanding in that phase's evidence card. [E11, E12]

This does not measure the proposed pilot's entire outcome chain. In particular, the inspected current workflow does not supply version approval, recording-pack export, recorded-within-seven-days, preparation-time savings, support labor or eight-week paid-and-producing outcomes.

The proposed pilot metrics would test a different promise: whether creators prepare and record useful work repeatedly. Existing token usage and activation counts are inputs to that assessment, not substitutes for it.

## 11. Pilot access, privacy and operations

Better Auth account creation, optional Google login, session gates and rate limits exist. A closed/invite-only/public admission gate covering every signup/bootstrap path is not established by those controls; `todos.md` T-18 explicitly records that the journal enablement decision was not wired into signup. [E3, E12]

The current **Sample Spin** is a separate sessionless demo using a fictional creator/reference fixture and visitor text. Its rollout parser accepts disabled or preview; a `public` value is rejected. It has shared spend and abuse controls. It is therefore different from the proposed once-per-admitted-customer personalized sample pack. The pre-registered evaluation and live demo walks remain unrun in the 10a record. [E10, E12]

Lifecycle/deletion code, an external deletion journal, recovery tooling and restore procedures have been built. Real journal provisioning and a real restore exercise remain recorded obligations. Phase 10a also records an inherited Medium residual for the autopsy identifier scrub's missing clock-driven receiver, along with other outstanding items. The current legal route is recorded as a placeholder. [E12]

These are part of the current baseline a reviewer should consider before judging readiness for real pilot customers. This document does not certify privacy compliance, operational recovery or public-launch readiness.

## 12. How to interpret existing acceptance evidence

The proposed brief's A01–A20 are acceptance criteria for the **changed product**. They cannot be marked passed merely because current credit-generation or lifecycle tests pass.

| Proposed acceptance area | Existing foundation | Additional proof needed for the proposal |
|---|---|---|
| A01–A02: personalized sample and abuse bounds | Preview Sample Spin and included onboarding mechanisms | Admitted, verified account; one personalized full pack; anti-reminting across account/profile paths |
| A03–A06, A13–A15: money and recovery | Credit ledger, Stripe deduplication, generation checkpoints, recovery | Pack reservations, changed refusal policy, included revisions, adopted rollover/migration rules and crash/race witnesses |
| A07–A10: revisions, editing, approval and claims | Revision lineage, structured output, traceability/quality checks | Two-successful-revision allowance; manual concurrency; version readiness; complete new-field claim coverage |
| A11–A12, A17–A19: scope, deletion and admission | Existing scope/lifecycle systems and content-safe telemetry work | Every new pack/source/version store registered; new job races tested; deployed recovery and admission evidence |
| A16: verified-only learning | Current comparison and proposal correction | Pilot-wide behavior and any other database's legacy evidence audit |
| A20: economic reconciliation | Model-spend and billing records | Pack/cohort revenue, complete cost population, currency basis and honestly withheld incomplete margin |

**Verification for this document:** source inspection and comparison with recorded evidence; no fresh application test suite, browser acceptance or external-service test. The document is a review baseline, not an A01–A20 report card.

## 13. Strengths and tradeoffs for expert review

The following are assessments based on the implementation above, not measured customer findings.

| Current choice | Strength worth preserving | Cost, limitation or review question |
|---|---|---|
| Multiple generation modes | Supports different creator entry points and reuses structured generation | More choices and separate operations may make the first useful outcome harder to explain |
| Inspectable creator brain | Explicit context, provenance and approval give creators control | Example collection, interview and activation add work before value; the provisional-profile proposal changes that tradeoff |
| Rich script output | Much of a recording pack's content already exists | A document with shots is not yet a complete editing/approval/recording workflow |
| Credit-based operations | Fine-grained pricing and established accounting infrastructure | Customers must translate credits into work; a charged refusal may feel different from paying for a deliverable |
| Metering and recovery investment | Provides reusable foundations for retries, attribution and settlement | New pack semantics still need integration and tests; existing machinery does not make the transition a cosmetic change |
| Verified-only numerical learning | Keeps self-reporting from becoming unsupported performance evidence | The future learning promise depends on connectors and sufficient comparable results; it cannot establish current differentiation by results |
| Trends and autopsy | Offers a reference-led creative entry point | Discovery/digest integrations and evidence remain incomplete, and they broaden the scope beyond recording preparation |
| Data-lifecycle controls | Existing ownership and recovery responsibilities can cover new retained data | Real-service evidence and known residuals remain obligations when new customer data is introduced |

Useful expert questions: Is mode breadth or one complete preparation journey more valuable to the initial customer? Does the brain produce enough early benefit to justify its onboarding effort? What service promise justifies the proposed price and revision policy? Which existing capabilities must remain visible during the pilot? What creator behavior would demonstrate that the integrated workflow is worth paying for again?

## 14. Direct comparison with the proposed brief

| Dimension | Current system | Proposed brief |
|---|---|---|
| Primary unit of value | Mode-specific generation | One complete recording pack |
| Initial audience | Solo short-form creators across content categories | Solo expert-creator publishing original educational/business Shorts |
| Entry offer | Recurring Free credit tier; separate fictional preview demo | One personalized sample after verification/admission |
| Paid offer | USD credit tiers | A$149/month for 12 packs |
| Additional capacity | US$10 for 1,000 credits | A$59 for four packs |
| Revisions | Separately priced, parent-linked generation | Two successful AI revisions included per pack |
| Quality refusal | Can settle as a charged explained refusal | Releases pack capacity; no pack consumed |
| Onboarding | Examples, structured interview, activated brain | Minimal approved/provisional profile and production constraints |
| Angles | Hooks/ideas are mode outputs | Explicit three-angle stage followed by selection |
| Manual editing / approval | Brain editing; generation revision lineage | Pack-version editor, approval and readiness checks |
| Export | Creator-brain JSON/Markdown endpoint | Explicit recording-pack version export |
| Recording workflow | No dedicated pack state model identified | Ready, recorded, published; session grouping |
| Background generation | Awaited Studio action plus durable attempts/recovery | Queued pack operation and authenticated status polling |
| Numerical learning | Connector-only substrate; manual input cannot qualify | Disabled during pilot; preference proposals retained |
| Trend scope | Autopsy/Spin plus partially integrated discovery/digest | Broad discovery deferred for launch |
| Pilot metrics | Activation and model/billing records | Approval/export, recording, repeat payment, support and preparation time |
| Launch status | Substantial implementation; incomplete acceptance and operations evidence | Closed pilot with explicit admission and release gates |

This comparison supports evaluating a refocus of the current application. It does not imply that the proposed pricing, demand, usefulness or migration cost has been validated.

## 15. Evidence register

Paths below are relative to this document and refer to the inspected working tree or existing records. Historical comments and older status summaries were not treated as stronger evidence than current executable code. Keep the date and dirty-worktree qualification when sharing this document.

- **E1 — Product and architecture canon:** [CLAUDE.md](../../CLAUDE.md), [PRD and intended audience](../initial/PRD.md), [Respin package manifest](../../respin/package.json).
- **E2 — Commercial definitions:** [seeded configuration](../../respin/packages/db/src/seed.ts), [mode access](../../respin/packages/credits/src/mode-access.ts), [Stripe setup and USD price defaults](../../respin/packages/credits/src/stripe/setup.ts), [displayed pricing](../../respin/app/%28marketing%29/pricing-copy.ts). Displayed seat/digest claims are not used as delivery proof.
- **E3 — Auth and creator context:** [auth factory](../../respin/packages/auth/src/create-auth.ts), [brain schema](../../respin/packages/db/src/brain-schema.ts), [interview fields](../../respin/packages/db/src/interview-ops.ts), [voice inference](../../respin/packages/credits/src/infer-voice.ts), [scope and write operations](../../respin/packages/db/src/with-workspace.ts).
- **E4 — Generation contract and checks:** [mode registry](../../respin/packages/modes/src/modes.ts), [output parser](../../respin/packages/modes/src/output.ts), [pipeline](../../respin/packages/modes/src/pipeline.ts), [traceability](../../respin/packages/modes/src/traceability.ts).
- **E5 — Generation orchestration and lineage:** [metered generation](../../respin/packages/credits/src/generate.ts), [generation schema](../../respin/packages/db/src/generation-schema.ts), [Studio actions](../../respin/app/%28product%29/studio/actions.ts), [generation tests, including charged refusal](../../respin/packages/credits/tests/generate.test.ts). Tests were inspected, not rerun.
- **E6 — Credit behavior:** [balance derivation](../../respin/packages/credits/src/balance.ts), [ledger operations](../../respin/packages/credits/src/ledger.ts), [ledger allocation model](../../respin/packages/credits/src/fold.ts), [Stripe webhooks and invoice grants](../../respin/packages/credits/src/stripe/webhooks.ts).
- **E7 — Existing download:** [creator-brain export route](../../respin/app/api/export/route.ts).
- **E8 — Trends and worker:** [source adapters](../../respin/packages/trends/src/sources.ts), [production worker composition](../../respin/worker/production.ts), [slice 8c status](../progress/respin-finish-slice-8c-card.md).
- **E9 — Results and proposals:** [comparison eligibility](../../respin/packages/brain/src/comparison.ts), [proposal construction](../../respin/packages/brain/src/proposal.ts), [result operations](../../respin/packages/db/src/results-ops.ts), [manual result writer](../../respin/packages/db/src/with-workspace.ts), [10a correction/evidence card](../progress/respin-finish/respin-finish-slice-10a-card.md).
- **E10 — Sample Spin:** [rollout enablement](../../respin/packages/credits/src/sample-spin/enablement.ts), [10a implementation/evidence record](../progress/respin-finish/respin-finish-slice-10a-card.md).
- **E11 — Activation reporting:** [activation definitions](../../respin/packages/db/src/activation.ts), [10a acceptance status](../progress/respin-finish/respin-finish-slice-10a-card.md).
- **E12 — Delivery status and residuals:** [master-plan progress](../plans/respin-finish-master-plan.md#progress-tracking), [10a report card](../progress/respin-finish/respin-finish-slice-10a-card.md), [open findings](../progress/respin-finish-open-items.md), [owner/external evidence obligations](../../todos.md).

**Weakest part of this snapshot:** operational state and real-creator usefulness. The repository provides substantial implementation and historical test evidence, but this document cannot establish deployed behavior, active commercial configuration or customer outcomes.
