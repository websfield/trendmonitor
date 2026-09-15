# Respin — developer remediation plan
## Execution sequence, acceptance evidence and release boundaries

**Version:** 1.0 · **Date:** 10 September 2026  
**Companion:** `01_Developer_Brief.md`  
**Status:** Developer handoff requested by the owner; commercial, spending, processor and deployment decisions remain separately scoped. No application code or services were inspected or changed while producing these documents.

## 1. Execution map

Use the existing T0–T8 IDs. The suffixes below are proposed subdivisions, not a competing backlog or descriptions of existing repository tickets. Confirm actual paths, interfaces and test commands in T0. This plan translates the supplied recommendations into implementation/acceptance work; additional test detail is a proposed contract, not a claim that a particular defect exists. [P5 §4; L1 §2]

| Sequence | Existing ticket / subdivision | Required result |
|---|---|---|
| 1 | **T0 — baseline** | Reproducible starting revision; current obligation, configuration and input-support records; revised estimate. |
| 2 | **T0 release closures → T7** | Applicable admission, access, data, payment, telemetry and operating obligations closed. |
| 3 | **T1 → T2 — evaluate and improve** | Preserved baseline/holdouts; targeted quality and optional filming-constraint changes. |
| 4 | **T3 — handoff; T3-REF — reference** | Three clear entry routes, saved-result handoff, explicit costs and evidence-bounded reference analysis. |
| 4 | **T6-C — correctness; T6-P — policy** | Correct operation identity/recovery; separately approved refusal-policy change, if adopted. |
| 5 | **T7-A — release acceptance** | Candidate and real-service evidence suitable for controlled user admission. |
| 6 | **T7-B/C — observe, fix, retest** | First observed creators; bounded feedback batch; fresh regression and journey acceptance. |
| Parallel | **T8 — truth-only minimum** | Published/help/checkout claims agree with actual accepted capability and approved terms. |

After T0, release-obligation work can run alongside fixture preparation and UX investigation. T2 prompt changes require T1 baseline evidence. Integrate T3 with the accepted T6 behavior before release. All applicable safety obligations converge at T7-A. T4 follow-ups, T5 model/caching optimization and T8 demo/referral polish stay outside the critical path. [P5 §§3, 5; L1 §§2–4]

## 2. T0 — establish the actual starting state

**Purpose:** avoid overwriting owner work or fixing a system that differs from the one actually present.

The supplied snapshot names branch `respin-m1-billing-credits`, base commit `961c2a9d7e7911e3c591d904dd52576a69495b5a`, plus uncommitted work. That commit alone does not reproduce it. Treat this as an inspection lead, not an instruction to reset the current repository. [P1 §0]

**Work:** inventory the current branch/HEAD, staged/unstaged/untracked work, lockfile, migrations and relevant configuration. Preserve changes through an agreed recoverable snapshot without committing secrets or overwriting unrelated work. Inspect repository instructions, current delivery records, the intended environment and authorized service configuration. Keep credentials and customer material out of the report.

Trace admission, brain activation, generation, autopsy/Spin, revision, price resolution, settlement, retrieval/export, recovery and deletion. Compare executable behavior with the dated snapshot. Record differences and their effect on this package before revising scope.

| Inspection area | Starting points from P1; verify against the actual tree |
|---|---|
| Status and obligations | Master-plan Progress tracking; slice 8c/10a cards; open-findings record; `todos.md`. See P1 evidence register E12 for original relative links. |
| Auth and creator context | `packages/auth/src/create-auth.ts`; `packages/db/src/with-workspace.ts`; brain/interview schemas; `packages/credits/src/infer-voice.ts`. |
| Generation and handoff | `app/(product)/studio/actions.ts`; `packages/modes/src/{modes,pipeline,output,traceability}.ts`; generation schema. |
| Financial authority | `packages/credits/src/generate.ts`; balance/ledger/fold; Stripe setup/webhooks; versioned config and pricing copy. |
| Reference and operations | `packages/trends/src/sources.ts`; `worker/production.ts`; autopsy, lifecycle, telemetry and recovery paths identified from their callers. |

**Deliverables:** baseline manifest; evidence-backed closed/open/unknown obligation register; actual configuration/offer comparison; initial reference-support matrix; bounded change list and estimate separated into known enhancements, existing remediation and verification. Resolve absent access as **unknown/blocked**, not passed or zero effort.

**Acceptance:** another engineer can reproduce the candidate; owner changes are preserved; the next slice has identified paths, dependencies, tests and rollback. Inspect referenced files that are actually available; missing repository records remain missing evidence. Do not treat the historical 5,168-test report as a fresh run. [P1 §§0, 3, 15; P5 T0]

## 3. Existing release obligations — verify, then close

Create child work only for confirmed applicable gaps. Reuse existing controls. A disabled optional feature does not remove deletion/recovery obligations for retained data. Do not import unrelated planned seats or public-API expansion. [P3 §2A; L1 §2]

| Area | Required implementation/verification | Exit evidence and dependency |
|---|---|---|
| Admission and entitlement | Enforce the approved pilot boundary on signup, OAuth and workspace/bootstrap routes; retain server-side scope and plan checks. | Admitted and non-admitted cases, cross-workspace/profile denial and real full-script entitlement tested. Owner supplies admission rule and research access. Extra Free credits alone do not unlock full scripts. |
| Deletion and recovery | Verify external deletion-journal provisioning, restore handling and applicable autopsy scrub residual; include newly retained fields/records. | Controlled restore exercise shows erased material is not resurrected or recreated by delayed jobs; worker/lifecycle evidence recorded. Operations provides authorized environment access. |
| Billing configuration | Reconcile actual configuration, checkout, entitlements, displayed operation costs and applicable existing commitments; examine the seeded tier/add-on concern rather than assume a live exploit. | Versioned offer/configuration record; payment grant, invoice, cancellation and failure paths witnessed. No changed prices, live charge or refund without authority. |
| Telemetry and support | Verify intended collectors, content minimization, spend/error visibility, alert recipients and recovery diagnosis. | Intended-environment events/errors arrive without raw scripts/source text; support contact and incident/rollback owners assigned. Unknown cost coverage is disclosed. |
| Truth and customer documents | Replace relevant placeholders with approved customer material; align page/help/checkout with accepted routes, charges and limitations. | Owner-approved offer/data/support copy accessible at admission/checkout; unsupported capabilities not sold. Developer integrates supplied text, not legal certification. |

The journal, restore, autopsy receiver, telemetry and legal-placeholder issues are historical obligations in P1 §§10–11, not verified current defects. Record current proof when already closed. Close applicable gaps before real customer admission; policy/copy approval can proceed in parallel with engineering.

## 4. T1 → T2 — measured quality and practical filming

**T1: baseline before tuning.** Assemble the proposed approximately 20 permissioned briefs from at least five suitable creators, covering real source/context and realistic filming constraints. Reserve held-out material, with creator-level separation where practical. Preserve current outputs and model/config/prompt/brain-activation versions. Recruitment and permissioned material are dependencies supplied by the owner/research lead, not assumed assets. [P5 T1; L1 §3]

Include invented-experience temptations, unsupported numbers/names, conflicting style rules, scarce footage and source caveats. Record voice, source fidelity, substance, spoken readability, filmability, correction time, latency and all available failure/repair usage. Permissioned research storage holds the content; general analytics does not. If creator material is unavailable, synthetic fixtures may support technical checks, clearly labelled as such; they cannot establish creator-specific quality acceptance. This fallback is an execution proposal, not customer evidence.

Audit builder instructions without modifying first. Remove only demonstrated duplication through a separate reviewed change; this audit is not a reason to delay release work or delete invariants/tests. [P5 T1]

**T2: smallest demonstrated improvement.** Reuse mode contracts, output parser, traceability and the existing single automatic-repair bound. Add an independently written compact rubric to the relevant prompts/checks where the baseline shows a problem. Do not install external writing skills or add unconditional editing calls. Any proposed copied material needs separate review. [P5 T2]

Offer optional per-brief filming information, for example talking head versus screen demonstration, available footage and time limitations. Unspecified constraints must not invent assets or creator experiences. Preserve current approved-context activation and creator voice priorities. If new request fields are retained, include them in applicable request identity, provenance and lifecycle handling; confirm the design in the change brief.

**Acceptance:** historical outputs still render; checks/caveats and disclosures survive; no unresolved material invented facts in release fixtures; no material voice/filmability regression; bounded repair and costs remain visible. Report held-out human preference and correction effort, not only parser success. A majority preference for the changed output is a proposed evaluation target, not an approved benchmark. Keep the baseline when the change does not earn its place. [P5 T1–T2, §6]

## 5. T3 — entry, revision and recording handoff

**Reuse:** existing Studio actions, mode registry, generation storage, revision lineage, feedback and workspace/profile authorization. Do not create a second document authority or a full manual editor. [P1 §§4–8; P5 T3]

Make **Start with an idea**, **Use your own source**, and **Break down a reference** easy to find; retain other safe modes. Show the approved creator context being used. Organize each saved result into **Script**, **Filming plan**, and **Checks/rationale**. Treat `whyThisPerforms` as creative rationale in presentation while keeping historical readers compatible. [L1 §§1–2]

Add or repair copy-spoken-script, copy-full-output and text/Markdown download only where current behavior is inadequate. Retrieve/export the intended stored generation or revision under server-side scope checks. Keep unresolved markers associated with the relevant material and include outstanding checks/disclosure information in the handoff. Do not silently offer a supposedly verified clean script. The existing creator-brain export is a different function. [P1 §5; P5 T3]

Expose targeted revision actions through the existing priced revision operation, with parent identity and actual configured cost visible before submission. Copy, download and retrieval are not requests for another generation. Do not imply included revisions or charge internal automatic repair as a separately commissioned operation.

**State contract to implement against existing attempts:** submitted/in progress, usable stored result, terminal explained refusal, and recovery required must be distinguishable in the UI. These are presentation requirements, not new mandated database enums. Do not show success before durable settlement; do not label a recoverable operation as a new purchase. Use the existing architecture and add only the minimum status/retrieval interface needed; no wholesale queue rewrite.

**Acceptance:** complete and return to the same saved revision on desktop and mobile; all views/export agree; keyboard/focus/loading/error states support completion; costs match server configuration; wrong-profile reads/exports fail; double-click/reload behavior passes T6-C; old outputs remain readable.

## 6. T3-REF — preserve and verify reference breakdown

This supplements T0/T3/T7, rather than defining a new generation mode. P1 documents pasted-reference autopsy, Trends/Spin and Analyse and spin; it does not prove current Instagram/TikTok URL coverage. [P1 §§1, 3, 8; L1 §2]

Inspect the retained reference intake → retrieval → autopsy → display → optional Spin path. Record each actual platform/input contract using this matrix; its initial state below is deliberately unverified.

| Target | Supported URL forms and retrieved material | Analysis limits and charging | Current evidence |
|---|---|---|---|
| Instagram | Discover from code and authorized tests; do not assume video/audio retrieval. | Record actual coverage, retention and autopsy outcomes. | Unverified by supplied snapshot. |
| TikTok | Discover from code and authorized tests; do not assume video/audio retrieval. | Record actual coverage, retention and autopsy outcomes. | Unverified by supplied snapshot. |
| Other retained inputs | Enumerate every route advertised for this release, including pasted text where applicable. | Text analysis must be labelled as text analysis. | Current route acceptance required. |

For each supported route, record adapter/access method and authorization basis, retrieved text/transcript/frames/media, bounds, failures, costs, retention, environment and last successful test. An accepted link or embed is not evidence of media analysis. Verify relevant platform/provider permissions freshly before approving an ingestion change; this handoff makes no current API-permission claim.

Display hook, structure, payoff and call to action where supported. Pacing, editing, camera work and visual techniques require supporting retrieved evidence. State what was and was not analyzed. Use “possible creative mechanisms,” not proven causes of virality.

**Acceptance cases:** permissioned supported examples; private/deleted/unavailable and malformed URLs; redirects and timeouts; duplicates/reload; cross-workspace access; reference-only completion; optional adaptation to the creator’s own topic. Where URL fetching exists, verify bounded fetches and protection against private-network/redirect access. Treat fetched content as untrusted data, not system instructions. These are risk-matched tests proposed by L1 §2, not reported vulnerabilities.

Show separate configured prices for breakdown and subsequent script generation. Viewing the breakdown must not silently commission a script. Inspect autopsy settlement separately from Studio. Preserve Spin’s similarity protection.

**Missing adapter rule:** stop promising that platform, not all useful reference analysis. Return a bounded authorized ingestion option and an explicitly limited-input option for owner choice. Do not buy a scraper, silently remove the route, or count pasted-text substitution as success for a customer whose essential task is URL analysis.

## 7. T6 — financial correctness and proposed policy change

### T6-C: operation identity, retrieval and recovery

Correctness work must not wait for a decision on free refusals. Reuse authoritative attempts/request fingerprints, checkpoints, scoped generations and the ledger. P1 says separate Studio submissions currently receive fresh attempt IDs; a UI button lock alone is insufficient proof against accidental new purchases. [P1 §§7–8; P5 T3, T6]

Proposed acceptance contract: a transport retry of the same user operation resolves the existing attempt; a deliberate new commission receives a new operation identity and cost disclosure. Do not deduplicate every identical text forever. Reject an operation identity reused with incompatible input. Verify scope on every retrieval. Retrieval of a recorded result must not invoke the model again.

Cover duplicates, concurrent submissions, lost client responses, delayed provider responses, crash after checkpoint, settlement retry, insufficient balance and parent/scope mismatch. Where vendor completion is uncertain, retain an explicit recovery state rather than blindly replaying a paid call or claiming success. Prove no duplicate customer debit/grant and no new provider call caused merely by retrieval; do not claim universal exactly-once external execution.

### T6-P: terminal no-draft quality refusal — approval required

The snapshot documents `honest_refusal` cases that debit credits. The proposed pilot change is **no customer debit when a terminal quality refusal produces no usable deliverable**, with outcome/provider-cost recording and all admission, spend, concurrency and repair bounds retained. This is not an automatic refund for subjective dislike. [P1 §7; P5 T6]

Before changing settlement, obtain the explicit policy scope: affected cohort, operations, effective version and in-flight treatment. Keep provider/parser/transport failures distinct; document their actual and approved outcomes rather than imposing one generic failure rule. Decide autopsy’s separate policy explicitly.

Implement a versioned rule through the existing settlement authority. Preserve historical ledger entries and stored outputs. A proposed safe design is to bind the applicable policy version durably to the operation so deployment/recovery does not reinterpret it; confirm the exact implementation against existing schema before coding.

**Acceptance matrix:** usable generation and paid revision settle once at the configured cost; approved failed-repair and Spin near-copy no-draft cases store the refusal without a debit; retries/recovery apply the same approved policy; old and in-flight operations receive their explicitly defined treatment; provider costs remain recorded; free refusal does not allow unlimited attempts. Repeat the applicable tests for autopsy’s own state machine.

Independent review is required for changed financial/recovery paths. Keep vendor calls outside the settlement transaction. No parallel balance, pack allowance or historical ledger rewrite. Until approved, report T6-P as **awaiting policy decision**, and make all copy truthful to the behavior actually enabled.

## 8. T7-A — integrated release acceptance

Run the current repository’s risk-matched checks and record the commands/results. Inspect applicable typecheck, lint, worker, build, migration and regression gates rather than copying an old report. Pin code, schema, prompt/config and enabled-route versions. Use authorized test services first; real transactions or production changes need explicit authority. [P5 T7; L1 §§2, 5]

| Test group | Required witness |
|---|---|
| Access/context | Approved admission succeeds; bypass and cross-scope cases fail; creator reviews/activates context; full-script plan gate remains effective. |
| Core journey | Idea and owned-source routes generate, revise, reload, retrieve and export the intended result with correct charges. |
| Reference journey | Every advertised input passes T3-REF; failures and analysis limits are truthful; adaptation is separately commissioned. |
| Money/recovery | T6-C and adopted T6-P cases pass; invoice/event replay does not duplicate grants; payment failure/cancellation follow approved terms. |
| Content/compatibility | Old/new outputs render; no fixture-level unresolved material invention; checks, disclosures and revision identity survive handoff. |
| Data lifecycle | Applicable new and retained data participate in export/deletion/retention; actual journal/restore and delayed-job scenarios preserve erasure. |
| Operations/truth | Actual telemetry destinations, alerts, spend boundaries, support route, terms and advertised availability are witnessed. |
| Rollback | Previous compatible candidate or bounded disable path is rehearsed; historical retrieval and deletion work remain available; erased data stays erased. |

**Gate:** no unresolved release-blocking access, money, customer-data or misleading-capability defect on the admitted path. Failed or unrun applicable evidence is not a pass. Any excluded case has a specific reason, route boundary and reviewer acknowledgement. Technical acceptance permits an owner-controlled pilot; it does not approve public launch or establish customer demand.

## 9. T7-B/C — observed users, bounded remediation, retest

After the safety/admission gate and research permissions, support the first **five observed creators** with real upcoming briefs. The owner/research lead recruits and obtains consent; the developer provides the candidate, traceable operations and defect support. Test the participant’s natural idea/source/reference route, not a mandatory feature tour. [L1 §3; P5 §6]

Observe offer comprehension, setup/brain approval, input preparation, output read-aloud, one genuinely needed revision, leaving/returning, and recording handoff. Follow actual recording and a later independent task. Record active and elapsed preparation time, checks/rewrites, failures, assistance, selected generation, recording evidence and rejection reasons. Separate reference-only value from script-to-recording results. Start with permissioned manual records and existing IDs, not a new analytics platform.

**Feedback record:** candidate/version; participant/task ID; route; observed behavior; expected behavior; severity; restricted evidence reference; operation/generation ID; time/assistance; proposed cause; smallest change; acceptance case; owner/retest status. Raw creator content stays in approved product/research storage, not public issue trackers or unrestricted telemetry.

**Triage:** money/data/recovery or materially false capability claims require containment before further affected use. Completion blockers precede cohort expansion. For other issues, select at most **three highest-impact problems** per refinement batch, plus all necessary safety fixes. That batch limit is a carried-forward proposal, not a cap on safety remediation. Defer isolated preferences/new capabilities unless evidence changes the core assumption. [L1 §4]

Retest changed behavior with fresh tasks and include new/untrained participants before expansion. Rerun affected technical tests and T7-A witnesses; preserve holdouts and versions. The launch pack’s proposed four-of-five uncoached completion rule is an expansion aid requiring approval, not a statistical benchmark or permission to ignore a severe defect. Recording, preparation effort and eventual renewal remain separate business evidence. No renderer or pack migration is automatically authorized by a poor result. [L1 §§3–4, 7]

## 10. Handoff, ownership and decisions

Every completed slice returns the customer problem/obligation, changed paths/commits, schema/config/compatibility effects, exact executed checks, restricted evidence locations, review findings, rollback and residual limitations. Report each state separately: **implemented / locally tested / real-service accepted / deployed / customer-observed**. Mark unexecuted checks **NOT RUN**. Use the repository’s existing evidence location; the following are deliverable categories, not mandated filenames. [P3 §6; P5 §7]

| Final packet | Contents |
|---|---|
| Baseline and change record | Reproducible revision, preserved work, actual dependencies/config versions and observed divergence from P1. |
| Obligations and acceptance | Closed/open/unknown register, test commands/results, independent reviews, intended-environment witnesses and exclusions. |
| Customer contract | Supported-input matrix, approved operation/offer semantics, entitlement/admission settings and accurate user help. |
| Operational release record | Migration/rollout/rollback steps, deletion/restore evidence, spend limits, alert recipients and support/escalation owners. |
| Feedback and retest | Observed tasks, assistance/correction effort, selected fix batch, fresh retest and remaining customer uncertainties. |

The technical partner remains scope and go/no-go owner. Assign actual implementation, independent-review, operations and research/commercial owners; the supplied sources do not name them.

| Blocking decision/input | Needed before | Work that can still proceed |
|---|---|---|
| Repository/environment access, assigned scope and resource limit | T0 inspection and resource-consuming work | Prepare read-only inspection checklist from these sources. |
| Admission rule, permitted research data/storage and test entitlement | Real user-data collection/admission | Synthetic technical checks and unrelated remediation. |
| No-draft policy, operation coverage and in-flight rule | T6-P implementation | T6-C correctness and policy-diff/test design. |
| Approved offer, currency, entitlements and renewal/cancellation terms | Paid admission and published payable offer | Baseline, quality and handoff work. |
| Missing platform input contract or new authorized provider | Advertising/implementing that additional ingestion route | Verify and improve existing accepted reference routes. |
| Named operations/reviewer, spend bounds and rollout approval | Target release/customer invitations | Candidate preparation and non-production acceptance within authority. |

**Estimation:** re-estimate after T0; separate release remediation, enhancements, verification/review and external dependencies. The prior 13–21 engineering-day proposal excluded unknown release remediation and is not a commitment for this handoff. No launch deadline, rate, A$40,000 budget or commercial price is approved here. [P5 §5]

### Copyable kickoff instruction

> Start with T0 in the authorized repository. Preserve all existing work, establish the actual reproducible baseline, inspect the retained idea/source/reference journeys and financial/data obligations, and return the current blocker register plus the first bounded change plan. Reuse Respin’s credit, brain, generation, autopsy and recovery foundations. Do not implement recording-pack billing, remove reference breakdown, change commercial policy, add processors or deploy without the corresponding authority. Record exact checks and mark anything unrun NOT RUN. After baseline review, execute the assigned remediation slices and provide the acceptance/rollback evidence defined in this plan.

### Decision record — proposed R-12 / 10 September 2026

Owner requested developer-ready remediation handoff. Retain the existing-core paid-pilot direction and T0–T8 mapping; make reference coverage, correctness versus refusal policy, and feedback/retest responsibilities explicit. No new technical/customer evidence changes the product direction. Handoff documents created; original sources, code and services unchanged. Scope assignment and exceptional approvals are to be recorded by the owner, not inferred from document creation.

## Source register

**P0 — `00_START_HERE.md`:** source/decision authority and original snapshot boundary.  
**P1 — `01_CURRENT_SYSTEM_2026-09-09.md`:** only supplied inspected implementation baseline; includes uncommitted work. Relevant §§0–3, 5–11 and 15.  
**P2 — `02_STRATEGY_AND_DECISION_LOG.md`:** working recommendation, unapproved offer/budget and evidence-led change discipline.  
**P3 — `03_PILOT_AND_ENGINEERING_PRIORITIES.md`:** obligations, invariants, evaluation, boundaries and builder handoff.  
**P5 — `Respin_Now_Implementation_Plan_2026-09-10.md`:** proposed T0–T8 package; ticket details, sequence and historical planning estimates.  
**L1 — `Respin_Launch_Pack_2026-09-10.md`:** proposed launch framework, reference acceptance supplement, observed journeys, feedback cycle and operating gates.

No external product/API/licence claims were freshly researched for this source-based developer handoff. Repository-relative links in P1 do not imply the repository was available to this author. This plan is not the historical recording-pack brief or its A01–A20 acceptance contract.
