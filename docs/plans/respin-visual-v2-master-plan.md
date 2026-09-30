# Respin visual v2 implementation plan

Current implementation status (2026-09-21): Phase 1 code is implemented; **Not yet / NOT READY** on one item only — the independent verdict on the unreviewed repairs — and **Phase 2 is authorised to start** (owner, decisions.md R-133). Entry gate on the current tree (measured 2026-09-20, after the batch-3 repairs): typecheck 0, lint 0, `pnpm test` **243 files / 23 skipped, 5,605 passed / 119 skipped, exit 0**, `pnpm build` exit 0, preflight ok, `db:check` clean, worker typecheck 0, and the three-engine visual matrix **356 passed / 4 skipped**. Both escalated owner decisions are ruled and applied (decisions.md **R-130**, corrected by **R-131** after batch 3 returned four BLOCKs): the marketing surfaces are enrolled in the claims canon, and the visual matrix now has its own secret-free CI workflow (`.github/workflows/respin-visual.yml`). **Still pending:** an independent verdict on round 3's nine repairs and on the R-130 work (the reviewer allowance is exhausted; a further evaluation needs the owner's approval), and the first GitHub run of the new workflow (`todos.md` T-21). **Closed by owner ruling on 2026-09-21 (R-133):** the manual NVDA + Firefox observation is demoted to lowest priority, is never a blocker and is recorded as not obtained (`todos.md` T-22); A11Y-1 is accepted as a known defect, not fixed and not closed. See [Phase 1 report](../progress/respin-visual-v2-phase-1-review.md). Implementation manifest corrections retain 25/25/19/24/7 rows and 100 total, now 81 unique paths; historical plan-review counts remain preserved below.

## Objective

Apply the supplied Colour Pop / After Hours design to the existing Respin application, including a focused Studio and scene workspace, while preserving production data, pricing, access and evidence semantics.

Accepted source: user request of 2026-09-19; `docs/design/v2/Respin_Visual_Refinement_Handoff.md` v5; `Respin_Visual_Prototype.html`; four supplied mockups. User authorized planning and implementation. This goal was created in this session; actual reviewer consumption is retained in the Plan Review Log below.

Current amendment: the user requested that the seven subsequent design/experience/regression findings be addressed in these plans. Their acceptance IDs are V2-R1–V2-R7 below. This is an amended implementation contract, not a fresh independent approval or evidence that the application has changed. Prior gate reports remain historical evidence.

## Requirements and non-goals

Bindings: REQ-A02–A04, B01–B04, C01–C06, D01–D05 (existing Frameworks presentation and isolation only), E01–E07, F01–F04, G01/G04/G05/G07/G08, H01–H03, I01–I05. These are presentation changes to existing implementations, not claims to finish every underlying product requirement.

No new history/search service, media upload/analysis, video rendering, analytics connector, pricing model, subscription operation, Brain activation shortcut, prototype runtime or external service. Prototype fixture values and historical qualifications are not product authority. No deployment/push/live paid operation.

## Critical Paths touched

| Path | Trigger | Separate full gate |
|---|---|---|
| Respin billing & credits | Shared financial surfaces, offer presentation, displayed prices/charges | Yes |
| Respin brain tenancy | Shell identity, scoped views, Brain/setup presentation, local export | Yes |
| Respin spin compliance | Output/checks/withholding, reference and marketing presentation | No; lean merge |
| Respin learning honesty | Results/proposal and Brain evidence presentation | No; lean merge |

Project conventions are pinned verbatim in every phase. Canonical source remains read-only. User requested Luna/max context gathering and Astra/ultra planning/orchestration; the dispatched context reader/adviser use those explicit requests. Main session model/effort is not independently observable. Reviewer requests are Astra/ultra; implementation owner is the main orchestrator except independently bounded delegated work under the same phase contract.

## Decisions baked in

Token foundation (from handoff §4; implementation extends this with accessible secondary inks and category/status roles in DESIGN.md):

| Existing semantic role | Colour Pop | After Hours |
|---|---|---|
| `--bg` | `#FAFBFF` | `#090F22` |
| `--surface-1` | `#FFFFFF` | `#121B33` |
| `--surface-2` | `#F3F2FB` | `#1A2442` |
| `--text-1` | `#15152E` | `#F6F4FF` |
| `--accent-text` | `#6337E8` | `#B99AFF` |
| `--border` | `#E0E3F0` | `#2E3A5B` |

Primary button fill is a separately contrasted violet gradient; After Hours' pale accent text is not a white-text button background. Category roles are lavender/peach/mint/blue with corresponding dark tints; checks use amber in both themes. Compact control radius 12px, card radius 24px; retain 4px spacing base, 44px minimum target and Geist roles. These derived dimensions implement the supplied rounded-card direction and are not product thresholds.

- Colour Pop is default. `html[data-theme="dark"]` selects After Hours. Persist only validated light/dark under `respin.theme.v1`, with guarded read/write and light fallback. No account sync or system option.
- Retain existing semantic token names for current consumers; add category, amber-check, gradient and decoration tokens. Document exact values in `respin/DESIGN.md` before code. Accent gradients belong to primary actions/entry art; content/evidence/financial surfaces remain quiet.
- Keep the existing Geist/Geist Mono self-hosted fonts; decorative annotation uses local cursive fallbacks, never essential instructions. Responsive navigation changes at 800px. Controls target 44px and focus is visible. Text contrast is ≥4.5:1, or ≥3:1 for large text as defined by [WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); essential control/state graphics meet ≥3:1 against adjacent colors under [SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Reduced motion is respected. The 44px target is this design's control-size budget, not a claim about the AA minimum.
- Add display grouping and an exhaustive execution-surface descriptor to the existing mode offer, without changing access or prices. Idea, own writing, footage description and quick tools use their existing Studio modes; **A reference navigates to `/trends`**, where a completed, scoped analysis supplies the opaque autopsy ID to the existing Spin action. It never submits Analyse & Spin through Studio's generic action. All seven modes remain reachable; Free foregrounds available quick tools and names restrictions. Separate analysis and Spin costs remain attached to the respective existing operations, never combined into a guessed card price (V2-R1).
- Keep client form/action state mounted within the same verified scope. The defining scope-bearing page population is Studio, first-ideas, Brain, onboarding intake, onboarding interview, Trends, Results and Frameworks. Each page keys its entire returned scope-bearing subtree by a collision-free tuple of the exact workspace/profile IDs used for its data/actions, including sibling/early-return branches. No display-name/theme key or separate shell query. Scope changes discard all previous inputs/results/refusals/feedback/lineage and late old responses; same-scope theme changes preserve work. Brain editable forms additionally key by immutable source brainDocId/kind so a version change resets stale edits/refusals. Page-call tests prove identity wiring; browser component tests prove transitions. Preserve money/pending/refusal semantics.
- Result tabs derive from present fields. Preserve all document content, weakest-point pair, disclosure, actual charges and persistent finding summary. Refused/replayed states retain existing semantics.
- A filming scene is a beat, joined to all shots whose beatIndex matches. Timed on-screen cues remain a separate full ordered list; do not invent a stored cue-to-scene relation or final duration. Generic planning sketches are labelled, not purported footage.
- A local Markdown export of the current usable document includes all fields and checks, preserves exact generated text/markers, and does not claim to be the complete creator-data export. No result is exported from a withholding/replay state without a document.
- Prototype-only search/recent drafts are omitted. Existing production navigation and complete onboarding remain available.
- Prefer cohesive components under roughly 300 lines and CSS modules/files under roughly 350 lines; these are authoring budgets, not permission to truncate functionality. Existing large touched files are extracted by responsibility, with source scanners expanded to the complete new population.
- Preserve current product invariants, correcting obsolete assertions: phase 2 replaces Studio/first-ideas claims that no results are stored and no code reads feedback. Current Results reads stored rows and proposal construction consumes structured reactions. Manual results never qualify numerical learning, and every Brain update still requires explicit approval.

## Visual acceptance population

The defining list for the two-theme, 390/768/1024/1440 matrix is: product shell, Studio start/brief/all result states, onboarding first-ideas, Brain, onboarding intake, onboarding interview, references/Trends, Frameworks (`/studio/frameworks`), Results, Usage, Billing, Account, landing (including each shared audience route), and sign-in/sign-up. Phase 1 covers shell plus landing/auth baseline; phase 2 adds Studio and first-ideas; phase 3 adds Brain/complete setup; phase 4 completes the full list. For each surface exercise its applicable populated, empty, blocked/refused/error and long-content state. Financial fixtures include real zero and unavailable separately; Brain includes active/proposed/missing evidence; result fixtures include usable/refused/replayed/honest-refusal. Frameworks includes shared/private, approved/unapproved, empty, viewer/plan/paused restrictions, refusal, long content and profile changes (V2-R4). A state that the surface cannot represent is marked not applicable with its prop contract, never silently omitted. The visual spec's explicit surface/state table is the coverage authority; rendered fixture evidence stays separate from real authenticated-route evidence.

## Design conformance — V2-R3

Before source styling changes, phase 1 Task 1 records the reference captures and checklist in DESIGN.md, using the v5 prototype's real DOM screens at the four specified widths and both themes, plus the four images under `docs/design/v2/mockups`. Handoff v5 governs behaviour and capability qualifications; the prototype governs implemented layouts/interactions; the images govern art direction where they do not conflict with those qualifications. Production data/access/pricing remains authoritative. Record each intentional difference: Geist, real costs, omitted sample search/history, complete onboarding, truthful cue/timing relationships and real reference routing. A difference is assessed against its documented production equivalent, not silently omitted or used to inflate the score.

| ID | Dimension and source | Weight |
|---|---|---|
| D1 | Exact theme palette, contrast roles and quiet content/evidence surfaces — handoff §4 | 15 |
| D2 | Shell/main-area proportions, alignment, navigation and responsive composition — §8 and mockups | 15 |
| D3 | Heading/body hierarchy, text measure and density — prototype and mockups | 10 |
| D4 | Spacing, rounded cards, borders, elevation and selected states — §4 and mockups | 10 |
| D5 | Wordmark, category icons, illustration character and restrained annotations — §4 and mockups | 10 |
| D6 | Action hierarchy, creator/access context and visible authoritative costs — §3 | 10 |
| D7 | Surface-specific structure: task/brief, result tabs, reference stages, Brain sections — §3 | 10 |
| D8 | Persistent amber checks, evidence labels and find-the-detail interactions — §§3/6 | 10 |
| D9 | Scene-strip/instructions/preview relationship, or the corresponding selected-detail view — §3 | 5 |
| D10 | Mobile reading order, local scrolling and long-content resilience — §8 | 5 |

Score each dimension as met (1), partially met (0.5, with the specific mismatch), or unmet (0). Met requires the pinned reference's structure, hierarchy and applicable tokens/treatments; partial is limited to a nonfunctional spacing/art deviation; absent/reversed hierarchy or the wrong theme treatment is unmet. Compare identical synthetic content and viewport sizes; documented Geist/production-content differences do not excuse missing structure. Freeze applicable dimensions by surface/state before implementation; any N/A cites the reference and component contract, and is excluded from both numerator and denominator. Score = 100 × earned applicable weight / total applicable weight. **At least 90% is required for each core surface in each theme**: shell, Studio start/brief, script/checks, filming plan, References and Brain; no averaging a failed surface into a pass. Retain width-level observations and representative before/reference/after screenshots in phase evidence. Supporting surfaces require every applicable functional/accessibility check. Any missing content, broken action, misleading financial/evidence claim, inaccessible essential control or scope leak fails regardless of score. This is documented design conformance, not a pixel-similarity measurement or proof of usability. Two critique passes are a minimum, not a stopping rule; unresolved failures remain open.

## Assembled-app acceptance — V2-R2

Phase 5 Tasks 1–3 must execute the actual Next.js application, real route/layout composition, Better Auth sessions, scoped database readers, server actions and normal settlement against an isolated disposable test database. Browser tests must not replace route HTML, RSC/Server Action responses, sessions or application modules with fixture implementations. Deterministic external-provider responses are permitted only at the external transport boundary and must be labelled; real Stripe/provider spending is not required or authorized. Fixtures and mocked page calls remain necessary lower-level evidence, but cannot satisfy this gate.

The required journeys cover sign-in/session expiry and redirects; complete setup/explicit Brain approval; Studio start→brief→generation→checks→scene→export→parent-linked revision; reference entry→existing analysed reference→Spin; profile switching with pending/stale work; Frameworks navigation and allowed/refused forms; manual Results and unavailable comparisons; and read-only Billing/Usage/Account. Exercise Free/paid/viewer/paused fixtures, accurate costs and withholding. Assert actual test-database generation lineage and debit counts, zero writes/spend on theme/tab/scene navigation, correct form field submission and no hydration/browser errors. Do not click external checkout, delete real accounts or use a shared user database. An existing analysed reference is sufficient for this visual integration test; it does not certify ingestion or an autopsy-worker run.

Phase 1 records prerequisites and preserves the current UI baseline before editing; phase 5 supplies the bounded app runner and journey specification. Missing database/browser/auth/provider-boundary capability leaves V2-R2 **unverified and blocks whole-redesign Ready**. It is not an optional read-only route probe. Phase-local fixture evidence does not discharge final integration.

## Comparative experience acceptance — V2-R6

Before editing, phase 1 Task 5 preserves a reproducible current-UI baseline (revision plus dirty-diff identity, fixture data, captures and task script) in its phase evidence. Phase 5 Task 3 compares baseline and v2 with the same synthetic content, prices, access states and device sizes. Do not retain private creator content. Include five consenting representative creators as a small formative check, counterbalance which version they see first, and record per-participant completion, wrong turns, active interaction time excluding provider wait, assistance and cost/check comprehension. Contacting or recruiting people is not authorized by this plan; unavailable participants leave this acceptance pending.

Shared tasks: choose the appropriate available task and identify its cost; prepare/edit a brief; locate an unresolved finding and its affected content; identify the next beat and all its shots; request the intended parent-linked revision and identify its charge; distinguish active Brain context from a proposal. Export is additionally checked as a new capability; baseline absence is recorded as unavailable, never zero time or a successful baseline task.

Acceptance: no shared task has a lower completion count, more median wrong turns or a higher median active time; at least two shared tasks improve in median wrong turns or active time; every participant correctly understands charges, unresolved checks and explicit Brain approval after completing the tasks. Any unintended submission, lost work within the promised lifetime, inaccessible essential step or misidentified charge is a failure even if averages improve. Report the observed small-sample comparison only; no population-level improvement or bug-free claim. Five participants and the two-task improvement rule are proposed formative acceptance budgets, not empirical/statistical thresholds.

Assistance rule, frozen before trials: reading the same task prompt and administering the session are neutral; hints, demonstrations or navigation help count as assistance. Primary completion counts only unassisted completions out of all five participants per shared task/version; assisted completion and non-completion remain separately visible in that same denominator. Compare time and wrong-turn medians only over the same paired participants who completed that task unassisted in both versions, recording their identities and paired denominator alongside all raw observations. Assisted trials cannot establish either of the two required improvements. No eligible pairs leave that task's comparison pending, never zero or a pass. Collect charge/check/approval comprehension before corrective help; a misunderstanding remains a failure even if later assistance resolves it. These are formative comparison rules, not inferred statistical guarantees.

## Browser and assistive-technology acceptance — V2-R7

The visual config defines Chromium, Firefox and WebKit projects. Run the full defining theme/width/state matrix in all three; missing engines are explicit failures to obtain evidence, not skipped projects. Check 200% text enlargement under [WCAG 2.2 SC 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) and 320-CSS-pixel reflow under [SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), retaining each criterion's applicability and exceptions. The 799/800/801 cases bracket this design's 800px navigation breakpoint; also check forced colors and reduced motion where supported. Pin installed browser versions in evidence; WebKit automation does not certify Safari/iOS hardware.

**Demoted by decisions.md R-133 (2026-09-21).** Manual screen-reader verification (NVDA + Firefox on Windows, or an equivalent desktop screen-reader/browser pair) is the programme's lowest-priority item and is **never a blocker**: its absence never makes a phase, an acceptance criterion or a gate verdict Not yet. It lives in `todos.md` T-22 and is performed only if time allows. If it is ever performed, it covers landmarks/headings, labels, tab/scene selected state and panel relationships, pending/result/refusal announcements, keyboard order, modal focus containment/Escape/return, warning navigation and absence of duplicate/hidden announcements, and records the operator, versions, steps and observed announcements. The honesty duty survives the demotion: announcement behaviour is recorded as **not obtained**, never as passing, and no accessibility-certification or conformance claim is made on any surface. The three-engine browser matrix above is unaffected and remains mandatory.

## Dependencies and risk

Proof: codebase review's caller/authority table and exact existing source files, plus existing test suites. Product implementations are reused. Test-environment, browser-engine and human-evaluation prerequisites above are explicit and must be established; they are not claimed available. Risks/negative witnesses retain the eight stable IDs in the codebase review; V2-R1–V2-R7 add acceptance obligations without renaming them. Unrelated dirty changes are retained. No review of this redesign can certify those unrelated programs.

## Phase plans

| Phase | Description | Depends on | Primary owner | Plan |
|---|---|---|---|---|
| 1 | Tokens, theme controller, modular styles and shared shell | none | Main, `respin-engineer` role contract | `respin-visual-v2-phase-1.md` |
| 2 | Server-described task cards and focused Studio/result/filming workspace | 1 | Main, `respin-engineer` role contract | `respin-visual-v2-phase-2.md` |
| 3 | Brain/complete setup treatment and scope/source-version boundaries | 2 | Main, `respin-engineer` role contract | `respin-visual-v2-phase-3.md` |
| 4 | References/Results/marketing, remaining scope boundaries and full fixture matrix | 3 | Main, `respin-engineer` role contract | `respin-visual-v2-phase-4.md` |
| 5 | Isolated actual-app integration, assembled-app AT, comparative UX and final acceptance | 4 | Main; high-risk delegation uses Sol/high | `respin-visual-v2-phase-5.md` |

## Derived budgets and deferrals

Five phases separate shared foundation, stateful output UI, Brain/setup, remaining UI surfaces and final integration/acceptance. Current file-row counts are 25/25/19/24/7, within the 25-row authoring target. The user's 2026-09-20 instruction authorizes splitting Phase 4 when it lowers risk: its five new integration-harness files now belong to Phase 5, whose seven-row manifest also includes final DESIGN/map updates. Phase 4 retains all UI files and F1–F3; Phase 5 receives unchanged F4–F6 and the existing harness contract. This separates disposable-resource and external-transport risks from presentation changes without reducing whole-goal acceptance. The changed dependency/acceptance boundaries require a final generalist recheck; the sixteen prior evaluations remain consumed. Browser widths 390/768/1024/1440 and two themes come from handoff §9; 90% is the user's requested conformance threshold. Accessibility numbers derive from the cited WCAG criteria above. The scoring weights and formative-comparison rules above are explicit acceptance choices frozen before implementation, not product or statistical claims. Component size targets derive from the user's request to avoid oversized files. Browser engines, synthetic local test runs and existing adapters require no new recurring service; participant availability and any incidental test-environment cost must be reported before execution, never assumed paid authorization.

| Pending obligation | Receiving phase/task | Closure proof |
|---|---|---|
| Phase-1 tokens/art/components/harness | Phase 2 Task 2; phase 3 Tasks 1/2; phase 4 Tasks 1–4; phase 5 Tasks 1–3 | Real-component consumers and same-phase checks |
| Baseline capture, scored references and browser/AT setup established in phase 1 | Phases 2 Task 6, 3 Task 4, 4 Task 4, 5 Tasks 1–3 | Surface scorecards, full matrix and assistive-technology observations |
| Phase-1 false no-results/feedback-consumer baseline | Phase 2 Tasks 3/6 | Direct/shared copy guards and negative witnesses |
| Reference card uses shipped analysis/Spin flow; missing pre-submit Spin quote | Phase 2 Tasks 1/2/6; phase 4 Tasks 1/4; phase 5 Task 2 | Exhaustive routing, independent analysis/Spin price projection tests, then actual route/Spin journey with visible quote before submission |
| Scope-state coverage | Phase 2 Task 2; phase 3 Task 3; phase 4 Task 2 | Exact page-key, native-input and late-response witnesses including Frameworks |
| Phase-3 product stylesheet/fixtures extended to secondary surfaces | Phase 4 Tasks 1–4 | F1–F3 matrix and state-transition proof |
| Marketing qualification V2-R5 / V2-MKT-01 | Phase 4 Tasks 3/4 | Main and every audience hero/metadata/demo, shared sections, fixture and real-preview branch assertions |
| Mandatory assembled-app, comparative UX and final conformance proof | Phase 5 Tasks 1–3 | V2-R2/R3/R6/R7 evidence; no whole-goal Ready while missing |
| Final DESIGN/source-map and whole-goal documentation | Phase 5 Tasks 1–3 | Verified documents, all phase proof and final report |

## Progress tracking

| Phase | Implementation | Validation | Independent code gate |
|---|---|---|---|
| 1 | In progress | Theme/shell/CSS and fixture implementation; required evidence pending | Not yet |
| 2 | Not started | Pending | Not assessed |
| 3 | Not started | Pending | Not assessed |
| 4 | Not started | Pending | Not assessed |
| 5 | Not started | Pending | Not assessed |

## Plan Review Log

New continuing gate `respin-visual-v2-plan`, batch 0; no prior evaluations dispatched. History established by creation in this session. Reservation not yet dispatched; frozen inputs are this master, all three phase plans, codebase review and audit. Slots reserved: billing (separate), tenancy (separate), compliance+learning (lean combined, separate verdicts), final plan generalist (separate, after all specialists). Planned requests: `gpt-6-astra`, `ultra`; named-role checklists loaded into general-purpose independent contexts to honor this runtime request. All slots pending launch, verdicts not assessed. Retry allowance: batches 1–2 only. `plan gate ran lean (consolidated)` applies to the compliance/learning slot only. Optional nested Codex review is not independent in this host and will not be claimed.

Dispatch update (same frozen contract): batch-0 billing `/root/plan_billing`, tenancy `/root/plan_tenancy`, and combined `/root/plan_honesty` started with explicit `gpt-6-astra` / `ultra` requests. Three evaluations consumed, terminal verdicts pending. Final generalist slot remains reserved/pending launch after those reports. Runtime model resolution is not independently exposed. Before-code focused baseline: `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/shell-rail.test.tsx tests/brain-ui.test.tsx tests/landing-pricing.test.ts` passed 4 files / 324 tests. This is not a full entry-gate result. Local app probe at `http://localhost:8000/` returned ECONNREFUSED; no live route evidence claimed.

## Exit demonstration

Handoff §10: “a creator identifies a starting point, prepares a brief, understands the cost, reads a draft, finds what needs checking, knows what to film, and exports the intended result without losing context.” Execute in both themes. No feature-specific phase exit-gate document exists for this new visual goal; the quoted supplied handoff plus CLAUDE.md Definition of Done governs.

Whole-redesign Ready additionally requires all V2-R1–V2-R7 acceptance evidence, including ≥90% conformance per core surface/theme, actual-app integration, comparative creator observations and the three-engine/assistive-technology checks. A plan amendment alone proves none of these execution outcomes.

Plan readiness is pending independent review. Implementation is authorized to continue after its required current plan gate and checkpoint.

### Batch 0 completion and batch 1 reservation

Batch 0 consumed four terminal evaluations: billing PASS (one Low), tenancy NEEDS CHANGES (one High), combined compliance PASS / learning NEEDS CHANGES (one Medium, one duplicate Low), final generalist NOT READY (one High, three Medium, one Low after deduplication). Original reports and individual dispositions are retained in `docs/progress/respin-visual-v2-plan-review.md`. No plan-size finding; 25/25/23 implementation rows.

Material amendments now fix scope lifetime, stale disclosure assertions, both explicit scanner populations and full visual surface/state parity. Asset files were consolidated to make room for the three added test/copy manifest rows; no task was dropped. Batch 1 freezes this amended master, all three phases, codebase review and audit. Reserve three slots: tenancy (separate, pending launch), compliance+learning (lean combined, pending launch), final plan generalist (separate and last, pending launch after specialists). Each request is `gpt-6-astra` / `ultra`, fresh context, read-only. Billing's unchanged authority contract retains its batch-0 PASS; caller correction is editorial only. Four evaluations consumed before this reservation; no batch-1 evaluation dispatched yet. Only retry batch 2 remains after batch 1. Final explicit saved-reservation readback is required before each invocation. Plan gate ran lean (consolidated) for compliance/learning only.

Batch-1 completion: two specialist evaluations actually ran (`plan_tenancy_retry`, `plan_honesty_retry`), total six consumed. Tenancy NEEDS CHANGES (same High state-lifetime population), compliance PASS / learning NEEDS CHANGES (same Medium shared-assertion population). Bounded diagnostic exchanges completed; no extra verdicts. The unlaunched batch-1 final-generalist slot is retired because material repairs precede the next frozen contract. No current final approval. Batch 2 is the final ordinary retry; details and original evidence remain in the plan-review report.

### Batch 2 reservation — final ordinary retry

Frozen contract: this amended master, all FOUR phase plans, codebase review and audit. Diagnostic class repairs now enumerate all seven scope-bearing pages and their sibling state owners, Brain source-version identity, and the complete shared/direct stale-copy assertion population. Former phase 3 is split into Brain/setup (3) and references/Results/marketing (4); no promised behavior or validation removed. Manifests: 25/25/19/17; all modified dependencies and check paths verified present or predecessor-created. Six actual plan evaluations consumed; none in batch 2 dispatched yet.

Reserve: tenancy (separate, pending launch); compliance+learning (lean combined with two verdicts, pending launch); final plan generalist (separate, pending launch after both specialists). Fresh contexts explicitly requested `gpt-6-astra` / `ultra`; runtime unexposed. Billing's batch-0 PASS retains only unchanged economic authority obligations: no price/gate/ledger/action mutation or validation reduction was introduced by these plan repairs. The final generalist must assess the current four-phase integration and this reuse. No ordinary retry remains after this batch; no additional approval inferred. Read back this saved reservation before each invocation. Plan gate ran lean (consolidated) only for compliance/learning.

Batch-2 specialist results: tenancy `/root/plan_tenancy_final` PASS, T-V2-01 closed at plan level, one Low T-V2-02 editorial ambiguity; combined `/root/plan_honesty_final` compliance NEEDS CHANGES / learning NEEDS CHANGES, LH-1 closed and one new Medium V2-MKT-01. Both actual requests Astra/ultra; eight evaluations consumed overall. Separate final plan generalist is now pending launch on this unchanged four-phase contract, with those original reports attached. No semantic repairs before its assessment. The required implementation checkpoint independently failed on .git/index.lock permission; code remains unedited and implementation held. No extra review batch or checkpoint exception is authorized.

Final batch-2 completion: `/root/plan_generalist_final`, actual request `gpt-6-astra` / `ultra`, returned NOT READY / Not yet / Grade D. Nine evaluations consumed overall; ordinary batches 0–2 exhausted. Five original findings closed at plan level; current residuals V2-MKT-01 Medium and T-V2-02/G-V2-03/G-V2-04/G-V2-05 Low. Full per-item accounting, actual checks and original judgments are in the plan-review report. The separate proposed-amendment draft is not applied or approved. One extra affected plan-review batch and an explicit exception to Git checkpoints for this redesign require the user's decision; neither is inferred. All four implementation phases remain not started.

### User-authorized seven-finding amendment

The subsequent review identified V2-R1 reference routing, V2-R2 assembled-app testing, V2-R3 scored design conformance, V2-R4 Frameworks coverage, V2-R5 marketing qualification, V2-R6 comparative usability and V2-R7 browser/assistive-technology coverage. The user's “address them in the plans” instruction authorizes these document repairs. The earlier batch-2 paragraphs describe the then-frozen contract; the current contract is the amended master and all four phases. Historical verdicts are not approval of these changes. Review consumption stays at nine formal evaluations; no additional reviewer batch, checkpoint exception, application change or deployment is inferred. Current independent plan readiness remains Not yet; an eventual authorized review must cover the affected billing, tenancy, compliance and learning obligations, with the final generalist last.

### Checkpoint waiver — 2026-09-19

The user explicitly instructed “continue without check point”. Git checkpoints are waived for all remaining phases of this redesign; the project-wide checkpoint policy is unchanged. The preceding attempt, `git stash push --include-untracked -m "claude-jig checkpoint: respin-visual-v2 phase 1"`, failed with `.git/index.lock: Permission denied` and `could not write index`; no snapshot was saved. Do not retry checkpoints for this goal. The separate request for one additional plan-review batch (billing, tenancy, combined compliance/learning, then final generalist: four evaluations) remains awaiting explicit approval. Nine evaluations remain consumed; no new review or application edit has started.

### Batch 3 — user-authorized additional plan review, 2026-09-19

The user's subsequent “yes” explicitly approves the requested ONE additional batch with four evaluations. Same gate: `respin-visual-v2-plan`; batches 0–2 and nine consumed evaluations are retained. No further batch is authorized. Git checkpoints remain waived for this redesign.

Frozen assessment inputs: this master, `respin-visual-v2-phase-1.md` through `respin-visual-v2-phase-4.md`, `docs/progress/respin-visual-v2-codebase-review.md`, and `docs/progress/respin-visual-v2-audit.md`. Assess the current V2-R1–V2-R7 amendment and preserve the original historical judgments. No implementation change is included. Evidence/log updates do not change the assessed implementation contract.

| Reserved slot | Scope | Dispatch request | Status |
|---|---|---|---|
| billing | Separate billing/credits checklist | `gpt-6-astra` / `max`, fresh context, read-only | `/root/v2_plan_billing_b3`: NEEDS CHANGES; one Medium B-V2-02 |
| tenancy | Separate brain-tenancy checklist | `gpt-6-astra` / `max`, fresh context, read-only | `/root/v2_plan_tenancy_b3`: PASS; no findings |
| honesty | Lean combined compliance and learning; separate verdicts | `gpt-6-astra` / `max`, fresh context, read-only | `/root/v2_plan_honesty_b3`: compliance PASS, learning PASS; one Low assistance-comparison note |
| generalist | Separate final plan simulation/consolidation, after all three specialist reports | `gpt-6-astra` / `max`, fresh context, read-only | `/root/v2_plan_generalist_b3`: NOT READY / Grade D; two Medium, two Low after consolidation |

Dispatch requests follow the current AGENTS.md reviewer routing; actual resolved runtime settings are unexposed. General-purpose contexts load the named reviewer contracts to preserve the requested model tier. Plan gate ran lean (consolidated) only for compliance/learning. Before each invocation, read back this saved reservation. Current focused baseline: `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/shell-rail.test.tsx tests/brain-ui.test.tsx tests/landing-pricing.test.ts` passed 4 files / 324 tests. This is not full entry-gate or browser evidence. No batch-3 evaluation dispatched at reservation time; readiness remains Not yet pending results.

Dispatch update: all three specialist slots started with the recorded explicit Astra/max requests after individual reservation readbacks. Total actual evaluations consumed is now twelve (nine prior plus three started); final generalist remains reserved and unlaunched. No assessed implementation contract changed.

Specialist completion: all three terminal reports are preserved in `docs/progress/respin-visual-v2-plan-review.md`. Billing B-V2-02 identifies the absent pre-submit Spin quote at the existing reference destination; learning notes unspecified treatment of assisted comparative trials (Low). Tenancy and compliance have no findings. Final generalist is pending launch on the same unchanged implementation contract, with all original reports attached. No semantic repair has been applied before consolidation. Twelve evaluations consumed; only the reserved generalist remains authorized.

Final dispatch: `/root/v2_plan_generalist_b3` started with explicit `gpt-6-astra` / `max` after saved-reservation readback and all three terminal specialist reports. Thirteen actual evaluations are consumed overall; all four batch-3 slots have now launched. Generalist result is pending. No additional evaluation is authorized and no assessed implementation contract has changed.

Batch-3 completion: all four evaluations are terminal, thirteen consumed overall. The final generalist returned NOT READY / Grade D: B-V2-02 and reopened V2-MKT-01 are Medium; the assistance-comparison note and G-V2-06 numeric provenance are Low. Original specialist judgments and the full final report are preserved in the plan-review report. No further evaluation is authorized.

Post-batch construction repairs: phase 2 now names phase 4's missing pre-submit Spin quote dependency; phase 4 explicitly owns both quote projections, the Spin control, independent price/failure witnesses, and the audience hero/metadata producer. This master defines assisted-trial treatment and cites the applicable accessibility standards. These are author repairs, not independent closure. Current plan readiness remains Not yet; affected billing, combined compliance/learning and final generalist review require a new explicit finite approval. Tenancy's unchanged checklist retains its original PASS for reuse assessment. Git checkpoints remain waived; all application phases remain not started.

### Batch 4 reservation — user-approved three-evaluation recheck

The user explicitly instructed “approve and continue” in response to the three-evaluation request. Reserve exactly three evaluations for continuing gate `respin-visual-v2-plan`: separate billing; combined compliance/learning with separate verdicts; separate final generalist last. Thirteen prior evaluations remain consumed. No further retry is authorized. Checkpoints remain waived.

Frozen assessment inputs: this amended master, all four `respin-visual-v2-phase-N.md` plans, `docs/progress/respin-visual-v2-codebase-review.md`, `docs/progress/respin-visual-v2-audit.md`, and the complete original reports and post-batch repairs in `docs/progress/respin-visual-v2-plan-review.md`. Do not change the implementation contract before final consolidation. Reuse unchanged batch-3 tenancy coverage subject to final assessment. Requests use fresh read-only general-purpose contexts, `gpt-6-astra` / `max`, with named reviewer checklists; resolved runtime settings are unexposed. Plan gate ran lean (consolidated) for compliance/learning only.

| Slot | Status | Scope |
|---|---|---|
| billing | `/root/v2_plan_billing_b4`: PASS / Ready / A; no findings | Full billing checklist, B-V2-02 repair and independent quote witnesses |
| honesty | `/root/v2_plan_honesty_b4`: compliance PASS, learning PASS / Ready / A; no findings | Full compliance/learning checklists, audience claim population and assistance rules |
| generalist | `/root/v2_plan_generalist_b4`: READY execution integrity / Ready / B; Low G-V2-07 size-risk disposition pending | Final execution simulation, G-V2-06, 29-row phase size, coverage reuse and complete current contract |

No batch-4 evaluation has been dispatched at reservation time. Explicit saved-reservation readback precedes every dispatch. This remains the manual evidence bridge; no helper history is invented or reset.

Batch-4 dispatch update: billing and combined honesty started after individual saved-reservation readbacks, each explicitly requested Astra/max in fresh read-only contexts. Fifteen evaluations consumed including these two started attempts. Final generalist remains reserved and unlaunched. Assessment contract unchanged; no additional attempt authorized.

Batch-4 specialist completion: billing, compliance and learning each returned PASS / Ready / A with no findings. Complete originals are saved in the plan-review report. Fifteen evaluations are terminal; the only remaining authorized slot is final generalist, now pending launch on the unchanged contract after saved-reservation readback. Batch-3 tenancy PASS is offered for reuse, not rewritten. Forty-eight prototype reference captures are preparatory artifacts only; no application source or assessed contract changed.

Final dispatch: `/root/v2_plan_generalist_b4` started after saved-reservation readback with both complete specialist reports and the retained tenancy report available. Explicit request Astra/max, fresh read-only context. Sixteen actual evaluations are consumed including this running attempt. All three batch-4 slots have launched; no further evaluation is authorized. Implementation contract unchanged and final readiness pending.

Batch-4 completion: sixteen actual evaluations are terminal. Final generalist returned READY for execution integrity / Ready / B, with zero Medium/High/BLOCK findings and one Low G-V2-07: phase 4's 29 rows require the user's size-risk disposition under gate canon §11. All 19 tasks and 98 rows are executable; all prior findings are closed at plan level; batch-3 tenancy PASS is reusable. The original report preserves workflow closure as pending that actual decision. The user has been asked whether to keep 29 entries and accept the risk of exhausting review retries or split phase 4; no answer or additional review authorization is inferred. No application implementation has started.

Preparatory baseline artifacts: `.tmp/respin-v2-reference/manifest.json` retains 48 prototype captures and source identity. `.tmp/respin-v2-baseline/manifest.json` retains source hashes, revision/dirty-diff identity, synthetic data/task script, 16 Studio captures and eight Brain captures. Studio generation/revision exercised actual hydrated presentation components with finite fixture actions; Brain preserves server-rendered production markup/native disclosures for the active-versus-proposed recognition task only, with submissions prevented and client islands unhydrated. These are comparison stimuli, not participant observations or authenticated application acceptance. Browser checks observed no errors; full entry/three-engine/AT/integration/human evidence remains pending.

### Phase 4 split — 2026-09-20

The user's request to continue implementation and split Phase 4 if easier/lower risk is applied as a structural split: Phase 4 has 24 UI/fixture rows; Phase 5 has seven integration/final-evidence rows, including the five moved infrastructure files. All original production files, F1–F6, V2-R1–V2-R7, eight invariants and human/browser requirements remain owed. G-V2-07's size disposition is split, not accepted risk. Original reviewer reports remain unchanged.

Execution plan: (1) validate split ownership, dependencies and acceptance continuity; (2) obtain the required final plan-generalist recheck; (3) start Phase 1 under the retained checkpoint waiver, then advance only on current phase Ready evidence. No application phase has started.

Same gate `respin-visual-v2-plan`: sixteen terminal evaluations through batch 4; no new evaluation dispatched. Request exactly one additional batch-5 final generalist evaluation, Astra/max in a fresh read-only context, to assess the split and reuse of unchanged specialist contracts. No budget extension is inferred from the generic continuation/split instruction. Specialist requirements and harness safety contract are unchanged; any finding needing additional specialist evaluation must be reported within the retained budget rules. Planned scope: master, phases 1–5, prior complete plan-review report, and the current split diff. Slot is awaiting explicit approval, not reserved or launched.

### Batch 5 reservation — approved 2026-09-20

The user answered “approve” to exactly one additional Astra/max plan-generalist review followed by implementation if cleared. Same continuing gate, sixteen terminal evaluations retained; no additional retries authorized. Reserve one final generalist slot, **pending launch**, fresh read-only general-purpose context requested `gpt-6-astra` / `max`. Frozen inputs: current master, phases 1–5, codebase-review and audit contracts, complete retained plan-review reports, and split changes. Assess execution integrity, split ownership/dependencies/acceptance continuity and reuse of batch-4 billing/compliance/learning plus batch-3 tenancy coverage. No specialist contract changed; no additional specialist run is reserved. Prior document checks passed (82 unique paths, rows 25/25/19/24/7, pinned-rule and moved-harness/F4–F6 equality, `git diff --check`); no application test is claimed. Read this saved reservation before invocation. Checkpoints remain waived. Plan gate ran lean (consolidated) only for the retained compliance/learning specialist coverage; this final generalist remains separate and last.

Batch-5 dispatch: `/root/v2_plan_generalist_b5` launched after saved-reservation readback, explicitly requested `gpt-6-astra` / `max`, fresh read-only context. Seventeen evaluations now consumed including this running attempt. No other slot or retry is authorized. Contract inputs remain frozen; result pending.

Batch-5 completion: evaluation 17 returned **Ready / Grade B / READY — plan gate only**. All 22 tasks, 100 rows (25/25/19/24/7), 82 unique paths, 42 requirement IDs and eight invariants reconcile. Batch-4 billing/compliance/learning and batch-3 tenancy PASS remain reusable. G-V2-07 is closed by the split. G-V2-08 Low identifies five editorial pointers in the supporting codebase review; all five are corrected without changing the assessed contract. Seventeen evaluations are terminal; no further plan evaluation is authorized. The administrative resend of the unchanged report is not another evaluation. Phase 1 implementation has started under the existing checkpoint waiver; its separate code gate and mandatory browser/AT evidence remain pending. Evidence continues in `docs/progress/respin-visual-v2/ledger.md`.
