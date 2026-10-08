# Respin recurring creative workflow — master implementation plan

**Date:** 2026-09-30. **Stage:** 3 of 3. **Implementation:** planned; gated by prior delivery and creator evidence.

Prerequisites: [launch remediation](respin-launch-remediation-master-plan.md), selected accepted releases from [creator journey](respin-creator-journey-master-plan.md). Programme: [creator-ready](creator-ready-master-plan.md); execution record: [existing ledger](../progress/creator-ready/ledger.md). [Planning evidence](../progress/respin-remediation-2026-09-30-codebase-review.md).

## Objective

Make Respin a dependable recurring concept-to-recording workflow that uses creator-controlled context, preserves original work and earns continued paid use with evidence-bounded improvement.

## Non-goals

A new product direction or architecture; perfect prediction; fine-tuning personal models; autonomous creativity; rendering; generated actors/voices; automatic publishing; agency approvals; every adjacent creator tool. A new memory library, format, editor handoff or media processor needs a demonstrated problem and its own bounded decision. Optional analytics connectors are not a prerequisite for preparation value or renewal measurement; their absence must remain visible in outcome claims.

This stage integrates and proves capabilities delivered earlier. It does not build the same context, editor, series or result subsystem again, and does not turn all unfinished finish/visual-v2 work into a launch requirement.

## Critical Paths touched

| Path | Reviewer | Full gates? | Work |
|---|---|---|---|
| Respin billing & credits | `respin-billing-reviewer` | yes | Metered context, model upgrades, sustainable offer/cost evidence |
| Respin brain tenancy | `respin-tenancy-reviewer` | yes | Integrated context, versions, source inspection and lifecycle |
| Respin spin compliance | `respin-compliance-reviewer` | no | Original concept planning, curation, supported forms and handoff |
| Respin learning honesty | `respin-learning-reviewer` | no | Recommendations, outcomes, creator cohorts and success criteria |

Use complete current checklists and applicable security/outbound-truth/accessibility reviews at code time. No plan verdict certifies production operation, creative quality or business success.

## Phases

| N | Title / source | Depends on | Makes live | Status | Contract |
|---|---|---|---|---|---|
| R1 | Coherent personal workspace; RP3-01/03 | Launch L1–L6; accepted J1/J2/J3 capabilities included in the offer | Returning `/studio` session → selected recording pack → next session | planned | [R1](#r1--coherent-personal-context-and-production-handoff) |
| R2 | Original concepts and maintained forms; RP3-02 | R1; candidate/baseline evaluation protocol | Accepted concept forms and reviewed framework curation in normal use | planned | [R2](#r2--original-concepts-and-maintained-creative-forms) |
| R3 | Evidence and sustainable operation; RP3-04/05 | R1, R2, J5 cohort protocol; J4 only for connector-derived claims | Explainable improvement and repeat paid operation at the tested offer | planned | [R3](#r3--evidence-bounded-improvement-and-sustainable-operation) |

RP3-01 → R1; RP3-02 → R2; RP3-03 → R1; RP3-04 → R3; RP3-05 → R3. Every source requirement has an implementation/acceptance owner. Unsupported optional branches stay explicitly unavailable instead of blocking unrelated recurring preparation work.

### R1 — Coherent personal context and production handoff

**Goal / requirements:** a creator resumes work or develops the next piece without repeating approved facts/preferences, losing selected versions or silently rewriting their identity; REQ-A03/A04, B02/B03, C01–C08, I03/I04. **Owner:** `respin-engineer`, with independent tenancy and other affected gates.

**Existing/future-prerequisite files:** credits `respin/packages/credits/src/{generate,saved-generation}.ts`; modes `respin/packages/modes/src/{assemble,traceability}.ts`; DB `respin/packages/db/src/{creative-work-ops,creative-version-ops,series-ops,with-workspace,export}.ts`; Studio `page.tsx` and saved-result views; Brain actions. The launch/J packages create the marked-by-dependency modules before R1 can use them. Reuse the visual-v2 P2–P5 functional/scope/assembled-app requirements and finish lifecycle; do not import their stale status claims.

**Tasks / contracts:** integrate approved personal preferences/facts, practical resources, current piece/series, recent generated drafts, rejected ideas and supported audience observations through their existing typed authority classes. Retrieval selects relevant bounded context and records IDs/versions/reasons; it never appends the whole history. Provide source inspection, correction, expiry and reversal. An expired preference or deleted item cannot continue influencing a new commission via a cached summary. Generated examples remain drafts, audience observations remain observations, references remain mechanisms and connector counts remain qualified measurements.

Preserve the source chain idea batch/item → selected piece → model/manual script versions → recording plan/version → creator-reported filming → optional published post. Resume, alternative selection and series continuation all reach normal UI, with warnings/checks tied to the selected version. Losing membership, switching profile or receiving a late response cannot reveal previous-profile content. Expired context cannot be restored by an offline/queued save. Export covers supported context classes and version relationships; erasure also fences retries/jobs and restore-before-traffic.

Complete only remaining gaps demonstrated by the integrated journey. Optional reading views/export/editor handoffs require measured production friction and a no-new-spend read path; no renderer is implied. Resolve selected visual-v2 residuals against their own acceptance; do not claim whole-redesign completion until its full required matrix and comparative evidence pass. R-133's manual screen-reader deferral remains nonblocking and unverified when not obtained.

**Acceptance / proof:** extend launch `recording-pack.spec.ts`, J1 `returning-creator.spec.ts`, J3 `production-continuity.spec.ts`, scoped context/version tests and lifecycle/restore fixtures. Run the actual app with all enabled record types: first session, revision, manual edit, profile switch, explicit preference reversal, series continuation, disconnect/revoke where enabled, export, delete and restored-backup fence. Expected: correct selected version, zero retrieval spend, source inspection/correction works, no stale/cross-scope content, no reappearance after erasure. Repeated permissioned tasks show reduced context repetition and unwanted corrections with assistance/dropouts recorded, not inferred from generated-output count.

**Least confident:** individually correct context classes may conflict when retrieved together. **Out of scope:** a new memory dependency without a measured failure and comparative evidence.

### R2 — Original concepts and maintained creative forms

**Goal / requirements:** a few original developed concepts consistently become filmable work across supported creator groups; REQ-C01–C04/C07/C08, D01–D05, E04, I02–I05. **Owner:** `respin-engineer` plus named curator/research owner.

**Files:** `respin/packages/modes/src/{assemble,modes,output,mode-checks,bundle,pipeline}.ts`; existing DB framework/curation authority; `respin/packages/credits/src/generate.ts`; Studio form/output readers and exports. Reuse the existing reviewed/private framework paths and finish 10b-2's curation contract only for the necessary curator lifecycle; team seats, broad admin credit adjustment and API work are not pulled in. Tests extend existing modes/Spin and human evaluation harnesses.

**Tasks / contracts:** maintain a bounded library of accepted structures and real applicability/caveat/retirement evidence. New patterns are proposed and curator-approved through the existing authority; private/session-derived contribution strips to mechanism level, with no personal facts, voice, numbers or performance pooling. Retire unhelpful/saturated patterns from future recommendation while preserving historical version readability. Custom structures retain their explicit unreviewed provenance; they never silently become approved shared frameworks.

For each model/prompt/context/form upgrade, preserve a versioned baseline and independent held-out creators/tasks, measure originality relative to references and recent own work, premise specificity, voice, filmability and major-rewrite effort. An intentional sequel is an allowed relationship rather than a novelty failure. Human selection/filming decisions are primary; an LLM judge may triage but cannot certify willingness to use/pay. Bound retries and record all provider usage, including failures.

Wider forms are demand-gated. Before claiming one, add its versioned schema, text population/scanners, integrity rules, conditional structure, rendered recording plan, exports and legacy reader/rollback compatibility in one reviewed change. A prompt label alone cannot implement visual-only/silent content. No new format enters the offer before its relevant user journey and held-out evaluation pass.

**Acceptance / proof:** existing mode/traceability/near-copy tests plus form-specific positive/negative fixtures; baseline/new/rollback stored-output round trips; held-out human evaluation under the frozen programme rubric. Expected: hard integrity violations blocked, no historical reader break, at least the predeclared non-regression levels for each supported group/form, and no collapse into a single template. Report a stable selected-to-filmed share over predefined mature windows; choose the numeric acceptance floor before observation using prior cohort evidence, never after a weak result. Insufficient held-out evidence leaves the upgrade disabled and preserves the baseline.

**Least confident:** a model upgrade may improve average quality while harming a supported creator group. **Out of scope:** growth guarantees or pooled creator performance as shared-library evidence.

### R3 — Evidence-bounded improvement and sustainable operation

**Goal / requirements:** explain recommendation changes and establish repeat paid use with complete cost evidence; REQ-F01–F05, G05/G08, H01/I04 and amended PRD §5. **Owner:** product/research/operations owners with implementation and independent learning/billing review.

**Files:** `docs/initial/{PRD,gtm,decisions,build-plan}.md`, `NORTH_STAR.md`; J5 `docs/progress/creator-ready/cohort-protocol.md`; DB `results-comparison-ops.ts`/`promotion-ops.ts`, brain `comparison.ts`/`proposal.ts`, Results presentation; existing model-spend report and source cost records. Add reporting code only where existing scoped exports plus the frozen cohort protocol cannot produce the required measure. Claude-owned canon remains read-only; any necessary canon amendment is an explicit boundary handoff, not an indirect edit.

**Tasks / contracts:** explain each changed recommendation by approved preference, selected/rejected work, supported observation or qualified outcome evidence. Taste changes use their explicit/proposed approval paths, never implied audience success. Descriptive numerical comparisons use complete compatible windows/populations, provenance, paid/organic separation, reach/conversion separation and stated uncertainty. Result-derived proposals still need R-115's three treatment plus three outside-treatment observations and creator approval; that threshold is not causal proof. When no connector exists, show this evidence path as unavailable.

Formally replace the proposed business criterion of a selected winning post through an approved, append-only decision and versioned PRD/North Star metric amendment. Historical reports keep their original definitions and evidence; the existing activation metric is not silently redefined. Add the separately named primary operational measure **repeat creator-reported filming v1**: paying creators confirming at least two distinct Respin-assisted pieces within 28 days, with mature-window cohort denominator, assistance flags and missing reports. An export, generated script, opened page or subjective positive reaction is not filming evidence. Independently linked/verified states are labelled separately and do not retroactively change the self-reported series.

Use that measure with active preparation effort, major-rewrite frequency, eligible paid renewal, complete contribution and avoidable support burden. Run J5's initial 20-creator management checkpoint, then preregister multiple-cohort confirmation: at least two non-overlapping cohorts using the same offer/definitions and full windows, with thresholds and sample sizes chosen before enrollment from the initial evidence. Keep cancelled/dropped-out/failed-payment/paused/assisted populations explicit. No best-post-only population or single outlier can establish success.

Operate one repeatable, permissioned acquisition route with truthful platform-native proof and self-serve onboarding that does not depend on bespoke founder rescue. Costs include model/source/hosting/payment/support and allocated free/demo/failed use; same currency/period, unknowns disclosed and margin withheld when incomplete. Recheck heavy-use economics on provider/model/processor changes before widening the offer. Keep cancellation, pause, data access, source revocation and recovery usable throughout.

**Acceptance / proof:** proposal/comparison and billing integration tests; a protocol-driven cohort report with explicit numerator/denominator/window/price/cost/missingness, independent learning/billing/outbound-truth review, and a production operations record for the enabled offer. Expected: each recommendation's authority inspectable, insufficient evidence honest, no unverified numerical learning or causal inference, all operational measures reproducible and current offer economically supportable under its declared assumptions. Success requires the predeclared repeat-use/renewal/effort/cost/support criteria across the multiple cohorts; engineering green alone cannot close R3. Weak evidence triggers a named diagnosis and one bounded correction/review point, not an automatic feature expansion.

**Least confident:** repeated preparation value may not translate into profitable renewal at the tested price. **Out of scope:** population-wide efficacy claims from small management cohorts.

## Risks and decisions

The [launch validation/lifecycle/rollback contract](respin-launch-remediation-master-plan.md#shared-implementation-and-validation-contract) applies to every change. Run focused tests while working, the canonical full entry gate on each stable integrated candidate, complete touched Critical-Path checklists and the actual enabled user journeys. Retain exactly one phase report card and ledger line with acceptance proofs; existing evidence can be referenced but never upgraded silently.

No new external service or price is selected. Optional intake/connectors/reminders retain the journey master's authorization, cost/free-tier, outage and revocation gates. New forms require explicit product/contract decisions. Adoption of new success criteria requires the stated PRD/decision amendment; it does not authorize changing Claude-owned files. Full rendering, agency approvals and auto-publishing remain optional future extensions requiring demonstrated demand, permissions, economics and their own scope decisions.

Completion is two separately reported claims: **implementation accepted on candidate** and **recurring customer/business evidence achieved**. This master is complete only when both its enabled integration obligations and its preregistered cohort outcome obligations are met; no generated-output count or plan-review verdict can stand in for them.

## Plan Review Log

| Date | Round | Reviewer | Reviewed ref | Verdict | Notes |
|---|---|---|---|---|---|
| 2026-09-30 | — | — | working tree | UNCHECKED | Draft integration/acceptance master; prior work and cohort evidence remain execution prerequisites. |
| 2026-09-30 | 0 | independent plan-reviewer | frozen draft `e6ea39af7093` | READY | Grade A: R1–R3 simulation and pre-mortem passed; implementation/dependency/cohort prerequisites remain. |
| 2026-09-30 | 1 | independent plan-reviewer | frozen draft `0c6045f57054` | READY | Grade A retained after upstream L1/J2 repairs; no dependency regression. No implementation or business evidence is certified by this verdict. |
