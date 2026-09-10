# Respin: system-builder implementation brief

**Version:** proposed v1, 8 September 2026  
**Purpose:** translate the proposed recording-preparation positioning, pack-based pricing and paid pilot into an engineering contract.  
**Status:** recommended changes, not a description of what is already implemented. Owner adoption of this brief is required before changing the governing product contract. This document does not authorize cloud expenditure, production deployment, refunds or changes to real customers' subscriptions.

## 0. Read this first

Do not rebuild Respin or replace its stack. Refocus the current application around a **recording pack**: one creator-owned brief becomes angles, a selected script and practical recording instructions. Preserve tenant isolation, inspectable creator memory, deterministic controls, metering, authoritative billing and recovery.

The first customer is a solo expert-creator already publishing original short-form educational/business content and earning from their expertise. The launch workflow targets YouTube Shorts preparation, not finished video production or a performance-prediction product.

The supplied screener described Respin's original three-part concept: creator context, curated frameworks and connector-verified learning. It also documented credit-based Free/Creator/Pro/Studio plans. This brief deliberately changes the launch packaging while retaining useful underlying capabilities.

### Evidence boundary

This brief follows inspection of publicly accessible repository documents and selected implementation files on 8 September 2026. It is **not** a fresh test run, full repository audit or production verification. References to existing implementation mean code inspected, not operational guarantees. The builder must pin a commit and reproduce relevant tests before accepting the starting state. Current `main` URLs are not immutable evidence.

Some repository documents describe different implementation stages. Do not resolve that by picking whichever status sounds most complete. Record the pinned commit, relevant decisions, actual code paths and executable evidence, then reconcile the governing documents explicitly.

## 1. Product contract to implement

### 1.1 Proposed launch offer

- One verified customer account, one workspace and one creator profile in the pilot. Retain the existing role/isolation model internally; do not expose new team sales.
- One personalized sample pack after email verification and pilot admission, with no card required. This is a bounded grant, not a permanent free generation plan.
- Creator: **A$149/month**, **12 recording packs per paid billing period**.
- One pack includes three initial angle/opening options, one selected full script, shot plan, on-screen text, caption, checklist and up to **two successful customer-requested AI revisions** of the same brief.
- Technical retries and automatic quality-repair attempts are not customer revisions. They still incur internal cost and must be bounded and recorded.
- Manual editing and repeat export do not consume packs or AI revisions.
- Additional capacity: **A$59 for four packs**, explicitly purchased; automatic top-up is not offered in the pilot.
- Subscription allowance can carry into the immediately following paid period, up to 12 carried packs. Subscription balance must not grow indefinitely. Purchased add-ons are a separate grant class.
- Prices above are proposed pre-tax commercial amounts. Tax behavior, customer-facing total-price presentation, add-on expiry and cancellation/pause/refund treatment must be adopted explicitly before checkout goes live. Do not silently invent them in code.
- No annual plans, new Studio sales, public API entitlement, automatic publishing, rendering, avatars, broad trend discovery or performance-learning promises at launch.

**Important:** twelve packs are twelve separate video preparations, not twelve model calls. A recording session grouping three packs consumes three pack entitlements, not one.

### 1.2 Customer journey

Admission and verification -> minimal creator profile -> source brief -> three angles -> select one -> complete editable recording pack -> resolve checks and approve -> record -> optionally mark published.

The product promises preparation, not virality, guaranteed time savings or finished video files. Until verified integrations exist, recorded/published actions are customer reports, not platform verification.

## 2. Existing architecture: preserve responsibilities

The inspected technical specification names Next.js/TypeScript, Better Auth, PostgreSQL/Drizzle, Stripe, a provider adapter and a pg-boss worker on Lightsail [S1]. The generation composition already contains claim/checkpoint/settlement machinery [S2]. The recommendation is to extend these responsibilities, not replace them.

| Area | Required direction |
|---|---|
| `respin/app` | Recording-pack journey, minimal onboarding, mobile-readable recording view, authenticated status reads, usage and pilot administration. Thin actions/routes only. |
| `respin/packages/modes` | Pure prompt assembly, output contracts and quality checks. Add/compose pack preparation here rather than in React or route handlers. |
| `respin/packages/credits` | Sole billing/entitlement authority and metered generation orchestration. Extend for pack entitlements and included revisions. No parallel charge authority. |
| `respin/packages/db` | Scoped persistence, migrations, constraints, snapshots and atomic settlement. Every new writer joins existing boundary tests and data registry. |
| `respin/packages/brain` | Creator-approved preference proposals. Verified-only numerical evidence eligibility; performance-driven promotion disabled during pilot. |
| `respin/packages/config` | Versioned plan rules, limits, model selections, quote policy and rollout configuration. |
| `respin/worker` | Dedicated bounded queue/handlers for pack work, reusing the durable attempt authority. Protect retention/recovery work from generation load. |

These paths are existing ownership areas, not an instruction to introduce new services. Map logical entities below onto existing tables wherever appropriate. Do not add Kubernetes, a new message broker, an agent framework or a vector database without a measured requirement.

## 3. First implementation step: baseline and superseding decision

Deliver an evidence-backed delta inventory before feature work:

1. Record the exact repository commit, clean-clone commands, results and environment used. A documented previous pass is not a new pass.
2. Inventory reachable account creation, OAuth callbacks, workspace bootstrap, checkout, generation, revision, sample and API paths. Identify every path that can spend tokens or grant units.
3. Inspect actual Stripe objects and any real customers through authorized operational access. Do not infer an empty Stripe account from a document saying the app is undeployed.
4. Adopt a new product decision superseding conflicting launch scope, billing units, pricing, learning claims and acceptance metrics. Amend PRD, build plan, tech spec and public copy references; preserve historical decisions rather than rewriting their history.
5. Classify findings as: must fix before pilot; already implemented but needs operational evidence; disabled and deferred; superseded requirement. Do not fund every historical backlog item indiscriminately.

**Deliverable:** a short implementation map naming changes, migrations, acceptance tests, feature flags, unresolved owner decisions and effort estimates by increment.

## 4. Recording-pack domain model

These are logical concepts. Reuse existing generation, input, brain, billing and usage stores; do not duplicate their content or authority unnecessarily.

| Concept | Required information and invariants |
|---|---|
| Source input/version | Workspace/profile scope; immutable normalized text; source kind; creator ownership/permission assertion; source offsets; revision/version identity. Optional audio object and transcript references. |
| Creator production constraints | Available equipment, location, assets, preferred presentation style, target duration and optional measured speaking pace. Creator-editable and versioned. |
| Pack | Workspace/profile scope; immutable brief-version reference for a build; selected angle; current content-version pointer; build status; commercial settlement reference. |
| Pack version | Parent/version identity; generated, AI-revised or manually edited origin; relevant generation reference; exact source/context versions; approval/check state. Store each authoritative content version once. |
| Build operation | Pack/version, immutable request fingerprint, idempotency key, step, lease/fencing identity, bounded attempts, typed outcome and spend association. Prefer extending the existing attempt mechanism. |
| Entitlement grant/consumption | Unit type, origin, quantity, subscription period, expiry rule, reservation and settlement links. Preserve the existing ledger's single authority. |
| Recording session | Ordered references to packs plus shared setup notes. No collaboration engine or scheduling integration required. |
| Workflow observation | Version-specific recorded/published report, origin, occurrence time and recording time. Corrections append history rather than changing past observations silently. |

### 4.1 Keep three state machines separate

**Build:** draft -> queued -> generating -> checking -> delivered; with typed refusal/failure/recovery branches.

**Creator workflow:** needs review -> ready to record -> recorded -> published. Readiness requires creator approval of the relevant version and resolution/removal of blocking checks.

**Entitlement:** reserved -> consumed OR released, with auditable correction/refund entries where needed.

A completed model call is not creator approval. A customer approval is not a platform publication. A failed revision must not erase the last good pack. Editing an approved version creates a new version needing review; a previously published version remains identifiable in history.

### 4.2 Minimal operation contract

Keep existing route/action conventions. Equivalent operations are needed; these names are conceptual, not mandatory URLs:

- Create/update a draft brief without consuming an entitlement.
- Start/resume angle preparation under an authorized bounded operation.
- Select an angle and build the pack.
- Read scoped build status and retrieve a settled output.
- Revise an explicit parent version using a server-resolved remaining allowance.
- Save a manual edit using optimistic concurrency/version checks.
- Approve an explicit version; mark it recorded/published with evidence origin.
- Export an explicit version; group existing packs into a recording session.

For cost-incurring requests, the server determines scope, entitlement and quote. A client must not supply a trusted price, role, usage balance or verification state. Reusing an idempotency key with a different request is a conflict, not a fresh operation.

## 5. Onboarding, inputs and source grounding

### 5.1 Minimum useful profile

Start with up to three creator-owned text examples, a short description of audience/offer, a real upcoming topic, essential tone restrictions and practical filming constraints. Review/approve inferred fields. Make missing context visible and allow the first attempt with a clearly provisional profile rather than require a comprehensive strategy interview.

Reuse immutable onboarding evidence and coherent brain activation; do not create a second memory store just for packs. Additional questions should follow actual editing feedback.

### 5.2 Text first; audio as a bounded input adapter

Text paste and owned examples are the first production path. A voice-memo promise requires a real, measured transcription path. Until it exists, do not show a functioning-looking microphone or claim audio support.

For audio, validate type/size/duration, obtain the required processing consent, keep objects private, meter transcription, let the creator correct the transcript before it becomes source evidence, and add raw audio/transcript storage to export/deletion/retention coverage. Do not reuse the deletion-journal bucket for creator media.

No arbitrary website fetching, public transcript scraping or new video-render pipeline is needed. A pasted source URL can be metadata without automatically fetching its contents. Any later fetch adapter needs separately reviewed authorization, network restrictions and failure behavior.

### 5.3 Source and claim contract

Every relevant output claim should distinguish:

- supported by a named creator-provided source span;
- confirmed by the creator;
- unresolved and needing confirmation or removal;
- an editorial suggestion rather than a factual assertion.

Use stable source IDs/versions and offsets. A citation-shaped field does not prove that the source supports the sentence, and a source itself does not establish external truth. Do not label creator confirmation as independent verification.

Generated personal achievements, financial results, credentials, testimonials or customer stories must not silently become facts. Treat input text as untrusted data, not instructions that can change roles, tools, billing or access. Apply safe text/Markdown rendering to model output.

## 6. Generation and editing contract

### 6.1 Build sequence

Read an authorized immutable input/context snapshot -> validate input bounds and entitlement -> claim/reserve -> produce bounded angles -> select one -> generate structured script/recording instructions -> run schema, grounding and other applicable checks -> at most the configured automatic repair allowance -> checkpoint -> settle -> expose the deliverable.

Angle previews before final pack settlement need their own budget/rate bounds and cached reuse. Repeated abandonment or angle regeneration must not create an unlimited free-generation channel. Reservations expire under an explicit rule; waiting for a creator click must not hold a database transaction or worker slot.

### 6.2 Output contract

A delivered pack must include: selected thesis/angle; required openings; script; shot/asset instructions aligned to the script; on-screen text; caption; recording checklist; unresolved claim indicators; appropriate disclosure guidance; and version/provenance metadata.

Estimated speaking duration must be labeled estimated. Do not invent available footage or equipment. New generated-text fields must be enumerated in the same safety/claim/traceability checks as existing script sections; moving risky text into a checklist must not bypass controls.

The current output parser requires `whyThisPerforms` and disclosure [S3]. For the new product, render the former as **Creative rationale and limitations** and revise its prompt semantics. Preserve historical readers or introduce an explicit output schema version; do not remove the field from old documents or weaken parsing to make the new UI pass. Keep the useful limitation/weakest-point information without implying proven effectiveness.

### 6.3 Revisions are a product operation

A customer revision uses a specific pack version and creates a new version. It does not overwrite the approved original. Enforce remaining included revisions server-side, including concurrent requests and alternate entry points.

Automatic safety repair, transport retry and customer-requested revision are three separate counters. The inspected pure pipeline already bounds automatic rewriting [S4]; preserve a bounded policy when adding orchestration.

Two included revisions means two successful revised outputs. A technical failure consumes neither an additional pack nor a revision allowance. A third requested AI revision is refused with a clear choice to purchase/use another pack or edit manually; do not invent an undisclosed per-revision price. Copying a pack must not reset its paid lineage/revision allowance.

Freeze the source brief per build. Changes to the source brief/new topic start a new pack action with explicit cost confirmation. Avoid an expensive AI judge tasked with guessing whether arbitrary revision prose constitutes a new business brief; control the operation through explicit inputs and bounded allowance.

## 7. Billing and entitlement changes — highest-risk workstream

### 7.1 Keep one entitlement authority

Retain the existing ledger and settlement authority. Extend it with a versioned unit discriminator or another unambiguous representation for recording-pack grants/consumption. If the builder proposes a separate entitlement table, it must remain inside the same authority and atomic settlement boundary, not become an independently mutable second balance.

Historical credits are not automatically packs. Never reinterpret a balance of 250 credits as 250 packs, overwrite old ledger semantics or delete payment history. A clean new-user pilot and a migration of real paid customers are different projects.

Implement new Stripe Price mappings and snapshot the applicable offer/plan version. Stripe documentation requires creating a new Price for an amount change rather than editing the amount in place [S5]. Do not migrate real subscriptions or balances without an approved rule and reconciliation report.

### 7.2 Settlement rule

A pack entitlement is consumed once when a complete, schema-valid, policy-accepted **editable deliverable is durably stored and made available**. It is not consumed for creating a draft, vendor retries, terminal quality refusal, malformed output, refresh or repeat export.

Creator approval/publishing happens later and must not control billing. Otherwise customers can use delivered work without approving it and never consume allowance. A delivered pack may contain clearly marked items requiring creator confirmation; those block readiness, not silently masquerade as verified facts. Product-quality complaints are handled through an audited service-credit/refund workflow rather than unlimited invisible regeneration.

Reserve capacity atomically before paid work. Record every vendor call separately. At settlement atomically consume the reservation, persist/expose the validated output, advance operation state and record a deduplicated event. Release reservations on terminal failure. The exact reservation expiry and cancellation-race rules must be written and tested.

Use short database transactions; never hold them open during vendor HTTP or a human selection. Recheck authorization/tombstones at execution and publication of results. Customer exactly-once charging does not imply exactly-once vendor execution under all network failures.

### 7.3 Grants and lifecycle edge cases

- Use paid invoice/business-object identities to grant once per intended billing period. Do not grant merely because the browser returns from checkout.
- Deduplicate events and business grants. Stripe events may be duplicated or arrive out of order [S6]. Reconcile current authoritative state rather than let an older webhook roll it backward.
- Keep sample, monthly allowance and purchased add-ons distinguishable. The sample grant cannot renew by creating another profile/workspace.
- Enforce allowance reservations under concurrent requests. Two new pack requests cannot both spend the final available pack.
- Expire by grant class and billing period; define consume-oldest-expiring-first behavior. Do not reset grants on browser-local month boundaries.
- Included revisions stay linked to the consumed parent pack, not to whichever allowance is current when the user clicks.
- Renewal, failure/grace, cancellation, refund, chargeback, pause, deletion and in-flight jobs must have an adopted behavior table. Retain fulfilled historical outputs subject to the adopted access/retention policy; do not accidentally delete them because allowance expires.
- New pilot plans do not expose automatic top-up. Keep historical opt-ins and authorizations intact unless an approved migration changes them.

### 7.4 Cost and revenue accounting

Record model/transcription cost for every call, including failed builds, repairs, samples and abandoned previews. Preserve provider-native cost currency and pricing/version evidence; a missing cost is unknown, not zero. Track full attempts, not only the successful final model call.

Do not subtract USD model costs directly from AUD revenue. Any AUD margin calculation needs a dated conversion basis plus coverage status. Report contribution only when the included cost population is explicit; shared hosting and recurring support must appear somewhere in the operating model.

At the proposed A$149 price, a 75% direct contribution target permits A$37.25 direct monthly delivery cost per paying account. This is a business target, not a model allowance to hard-code. Model budgets, maximum repair counts, per-profile concurrent jobs and daily system ceilings should be versioned operational controls.

## 8. Durable jobs and user experience

Use the existing pg-boss worker with an isolated pack-work queue and bounded concurrency [S7]. The existing generation composition has durable claims and validated-response checkpoints [S2]. Extend that design; do not call individual charged modes repeatedly and accidentally bill once per component.

The HTTP request should accept/reject the operation quickly and return its job/pack identity. Authenticated polling is sufficient for pilot status; streaming unvalidated model tokens is unnecessary. Show real stages, not a fictional percentage or a promised duration unsupported by measurements. The creator can leave and return without triggering another paid operation.

Queue messages should carry scoped IDs and version references, not raw creator content. The worker reloads authorized records, checks the initiating actor's current access and deletion state, and uses the same metering/settlement path as interactive requests.

Use leases/fencing and idempotent checkpoint/settlement transitions. Test crashes before provider call, after provider acceptance, after response checkpoint, after debit/settlement and before job acknowledgement. A response lost before durable checkpoint may have unknown provider cost; record and bound recovery instead of promising impossible end-to-end exactly-once execution.

Measure queue wait separately from vendor/validation time, report p50/p95 with sample sizes, and monitor oldest job, failures, uncosted calls and settlement reconciliation. Generation must not starve erasure, retention or restore work on the same deployment. Do not add another queue service solely to achieve this pilot.

## 9. Creator memory versus numerical performance learning

Keep preference feedback usable immediately: dislike phrase, prefer different tone, correct a fact, adjust available equipment. Propose permanent profile changes and require explicit approval. A one-off edit is not automatically a new global creator rule.

Disable performance-driven proposals during the pilot. Existing `comparison.ts` currently allows `quantified_self_reported` as well as `connector_verified` into numerical comparisons [S8], conflicting with the verified-only policy in the build plan [S9]. Correct the shared backend eligibility rule and all relevant writers/readers, not just the page label.

Audit stored comparisons/proposals/accepted activations that may have used ineligible evidence. Do not silently erase the audit trail or leave those outcomes treated as verified. Recompute or mark stale, and require explicit review of impacted profile changes. Handlers, jobs and alternate surfaces must honor the same pilot gate.

Recording/publishing reports remain useful workflow evidence but must not become verified audience metrics. Neither a connector flag nor three observations establishes causation. General analytics connectors are not needed to test preparation time, recorded output and repeat payment.

## 10. Instrumentation for the paid pilot

Instrument outcomes, not merely token usage:

- admitted/verified, source submitted, profile confirmed;
- angles available, pack build started/delivered/refused, revision delivered, manual edit saved;
- version approved, export performed, recorded reported, published reported;
- checkout paid, renewal paid, cancellation/refund, support contact and support time.

Use stable event identities, deduplicate important server events, record event schema version, UTC occurrence/record times, relevant pack version, internal pseudonymous scope, plan version and origin. Keep creator scripts, source text, audio, external identifiers and email out of analytics payloads and exception telemetry. Do cohort joining inside the first-party database and export aggregate counts where practical. Session replay is off for pilot creator-content screens.

Dashboard definitions must include numerator, denominator, maturity window and exclusions. Examples: approved/exported within 24 hours of first qualified activation; recorded within seven days of approval; renewal only among accounts actually due to renew; paid and actively producing at eight weeks. Keep all-signup conversion visible separately from qualified-cohort conversion.

Time savings require a baseline from observed work or explicit creator reports. Do not label time between page open and page close as preparation time saved. Distinguish founder-assisted from independent use. Support labor and incentives are real costs, not free acquisition.

## 11. Pilot release gate, privacy and operations

Create server-enforced closed/invite-only/public admission, initially closed. The admission gate must cover every account-entry path including OAuth/bootstrap and not merely hide the signup button. Individual-customer pilot invitations are not the same permission as inviting an editor into an existing workspace.

Add explicit independent controls for new checkout, pack work, sample work, trend discovery and performance learning. Disabled product surfaces must reject server calls, not only disappear from navigation. Disabling signup or generation must not disable customer export, deletion or support.

The current repository records real deletion-journal provisioning and a production restore exercise as outstanding evidence [S10]. Treat safe handling of real customer data as a pilot requirement too, not a concern only once signup is public. Wire actual admission into the required enablement decision. Forecast/spend gates must never stop an in-flight erasure, journal append, purge or restore operation [S11].

Every new retained table/object joins the creator-data registry, export path, erasure receiver and independent residue verification. Include transcripts, pack/manual versions, derived source excerpts, job checkpoints, cached prompts, evaluation examples and telemetry. Immediate tombstones must prevent queued work from recreating deleted content. Restore procedures must replay deletion information before traffic returns. Store no creator content in the immutable deletion journal.

**Correct a stale provisioning statement:** repository instructions say Object Lock cannot be enabled on an existing bucket. AWS currently documents enabling it on an existing versioned bucket [S12]. Keep the project's conservative rule to configure the dedicated journal before its first write, but state it as a project requirement, not an AWS limitation.

Have a clean-deployment runbook covering secrets, region, bounded DB pools, worker health, dependency/lockfile review, backups, restore, rollback, alerts, spend ceilings and operational ownership. Tests using fake S3/Stripe/LLM providers do not replace targeted real-service acceptance evidence.

## 12. Acceptance tests that must accompany the changes

| ID | Required witness |
|---|---|
| A01 | A customer can complete the personalized sample through the real authorized/metered path and receive a full pack, not only hooks. |
| A02 | Recreating a profile/workspace, refreshing or replaying a request does not mint another sample grant. Abuse limits also bound costly failed samples. |
| A03 | Two concurrent starts with one available pack reserve at most one; no negative spendable balance. |
| A04 | Duplicate job delivery/request replay yields one customer charge and the same settled output. Different payload under the same key conflicts. |
| A05 | Duplicate and out-of-order Stripe events neither double-grant nor regress a newer subscription state. |
| A06 | Provider timeout, malformed output and terminal refusal do not consume a pack; their known or unknown vendor spend remains visible. |
| A07 | Included revisions are enforced at two across concurrent requests/alternate entry points; automatic repairs and failed revisions do not consume them. |
| A08 | Failed revision preserves the last good version. Concurrent manual saves fail visibly rather than overwrite each other. |
| A09 | Changing the current approved draft invalidates readiness for that new version; the earlier published version remains identifiable. |
| A10 | Claims in scripts, captions, rationale and shot/checklist sections all enter the required checks. Missing evidence is labeled and cannot silently become verified. |
| A11 | Cross-workspace/profile source IDs, jobs, versions, exports and revision parents refuse without leaking existence or content. |
| A12 | A profile/workspace deletion or access revocation during a queued/running job prevents unauthorized delivery and recreation of erased data. |
| A13 | Worker crash after response checkpoint resumes settlement without another normal vendor call; crash in the ambiguous pre-checkpoint window is bounded and labeled. |
| A14 | Subscription rollover, add-on rules, first/last-day billing, expiry, cancellation and refund follow the adopted policy with a deterministic test clock. |
| A15 | Existing credit records and old output schemas remain interpretable; new plan rules do not silently relabel balances or break historical readers. |
| A16 | Self-reported results cannot enter verified numerical comparison/promotion; pilot gating holds across UI, server and worker paths. |
| A17 | No raw creator content appears in analytics/error logs or queue payloads. New stores are exported/erased and fail residue checks if a receiver is omitted. |
| A18 | Real deployed backup/restore and deletion-journal evidence is recorded; restoring old data does not resurrect an erased creator for live traffic. |
| A19 | Signup closed/ invite-only gates cannot be bypassed through OAuth, bootstrap, old checkout or direct generation routes. Privacy actions remain reachable. |
| A20 | Revenue, entitlements and model costs reconcile on the same cohort/currency basis, or coverage is explicitly incomplete—not displayed as a fabricated margin. |

Deterministic tests establish software behavior. Real-creator evaluation separately establishes usefulness. Use owned/permissioned briefs to compare preparation time, preference, recording rate and founder assistance. Do not present a test-suite count as product-market fit or an automated quality score as proof of no hallucinations.

## 13. Delivery sequence and scope control

| Increment | Work | Exit |
|---|---|---|
| 0. Contract and baseline | Pin commit; reconcile status; adopt scope/offer; inventory paths and real billing state. | Written delta map and approved unresolved commercial/operational decisions. |
| 1. Safe pilot foundation | Admission gates, applicable security/privacy blockers, deploy/restore evidence, bounded paid sample entitlement. | Real customer data can be handled safely without opening public signup. |
| 2. One complete vertical workflow | Text sources, minimal profile, one pack, source checks, durable build, settlement, editor, export and status. | Complete paid-path demonstration plus failure/concurrency tests. |
| 3. Repeat use and monetization | Two revisions, monthly grants/rollover, add-ons, audit-safe pricing, recording sessions, outcome metrics. | Commercial contract and real renewals can be tested. |
| 4. Evidence-led improvement | Voice memo input if justified; targeted speed/output improvements; acquisition friction fixes. | Improvements supported by measured creator behavior and delivery cost. |

Some money-path/schema work must precede external access even if its UI lands later. Do not let the table be interpreted as permission to accept payment before entitlement correctness exists.

Defer public trend scraping/discovery, general analytics connectors, performance scoring, fine-tuning, rendering, auto-publishing, multi-client approvals, public API growth and an elaborate calendar. Hide/disable safe existing deferred functionality rather than delete it blindly; continue to maintain security and data-handling obligations on retained code.

## 14. Required handoff from the builder

For each increment require: changed paths; migration and seed/config changes; requirement/decision mapping; tests and exact commands; evidence from actual service acceptance where required; rollback/degraded-mode behavior; remaining limitations; and owner inputs still required. Distinguish implemented, tested locally, deployed and verified with real customers.

The first demonstration must show a full paid recording-pack journey plus a deliberately failed generation with correct entitlement recovery. A collection of screens or a successful prompt is not completion.

## 15. Source register

These are public source locations inspected for this brief. Pin their commit before implementation. Statements elsewhere in this document are proposed requirements unless explicitly identified as existing code/documentation.

- **S1 — Respin technical specification:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/docs/initial/tech-spec.md`
- **S2 — Existing generation composition/settlement:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/respin/packages/credits/src/generate.ts`
- **S3 — Existing structured output parser:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/respin/packages/modes/src/output.ts`
- **S4 — Existing pure generation pipeline:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/respin/packages/modes/src/pipeline.ts`
- **S5 — Stripe price management:** `https://docs.stripe.com/products-prices/manage-prices`
- **S6 — Stripe webhook ordering and duplicates:** `https://docs.stripe.com/webhooks`
- **S7 — Existing worker entry point:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/respin/worker/main.ts`
- **S8 — Current comparison eligibility:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/respin/packages/brain/src/comparison.ts`
- **S9 — Current build plan and verified-only policy:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/docs/initial/build-plan.md`
- **S10 — Outstanding owner/operational items:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/todos.md`
- **S11 — Journal provisioning and operational gating:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/respin/infra/s3-deletion-journal/README.md`
- **S12 — AWS Object Lock configuration:** `https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-configure.html`
- **Additional current-code anchor — creator-data registry:** `https://raw.githubusercontent.com/websfield/trendmonitor/main/respin/packages/db/src/creator-data-registry.ts`
- **User-supplied background:** `vc-project-screeners.md`, Respin section, lines 15–23. Its progress summary is not used as proof of current implementation state.
