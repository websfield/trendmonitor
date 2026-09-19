# Respin visual v2 implementation plan

## Objective

Apply the supplied Colour Pop / After Hours design to the existing Respin application, including a focused Studio and scene workspace, while preserving production data, pricing, access and evidence semantics.

Accepted source: user request of 2026-09-19; `docs/design/v2/Respin_Visual_Refinement_Handoff.md` v5; `Respin_Visual_Prototype.html`; four supplied mockups. User authorized planning and implementation. New goal created this session; no plan or build reviewer evaluation has been dispatched for this goal.

## Requirements and non-goals

Bindings: REQ-A02–A04, B01–B04, C01–C06, E01–E07, F01–F04, G01/G04/G05/G07/G08, H01–H03, I01–I05. These are presentation changes to existing implementations, not claims to finish every underlying product requirement.

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
- Keep the existing Geist/Geist Mono self-hosted fonts; decorative annotation uses local cursive fallbacks, never essential instructions. Responsive navigation changes at 800px. Controls target 44px, focus is visible, text contrast ≥4.5:1, large/UI ≥3:1; reduced motion is respected.
- Add display grouping to the existing exhaustive mode offer, without changing access or prices. Three entry groups (idea/material/reference) and quick tools. Material retains separate writing/footage-description choices. Every offered mode remains reachable; Free foregrounds available quick tools and names restrictions.
- Keep `StudioPanel` mounted as action/feedback/form-state owner. Start/brief/result presentation may change without resetting input, platform or revision parent. Keep money/pending/refusal semantics and lineage.
- Result tabs derive from present fields. Preserve all document content, weakest-point pair, disclosure, actual charges and persistent finding summary. Refused/replayed states retain existing semantics.
- A filming scene is a beat, joined to all shots whose beatIndex matches. Timed on-screen cues remain a separate full ordered list; do not invent a stored cue-to-scene relation or final duration. Generic planning sketches are labelled, not purported footage.
- A local Markdown export of the current usable document includes all fields and checks, preserves exact generated text/markers, and does not claim to be the complete creator-data export. No result is exported from a withholding/replay state without a document.
- Prototype-only search/recent drafts are omitted. Existing production navigation and complete onboarding remain available.
- Prefer cohesive components under roughly 300 lines and CSS modules/files under roughly 350 lines; these are authoring budgets, not permission to truncate functionality. Existing large touched files are extracted by responsibility, with source scanners expanded to the complete new population.

## Dependencies and risk

Proof: codebase review's caller/authority table and exact existing source files, plus existing test suites. Existing implementations are reused; no new external capability is prerequisite. Risks/negative witnesses are the eight stable IDs in the codebase review and phase acceptance tables. Unrelated dirty changes are retained. No review of this redesign can certify those unrelated programs.

## Phase plans

| Phase | Description | Depends on | Primary owner | Plan |
|---|---|---|---|---|
| 1 | Tokens, theme controller, modular styles and shared shell | none | Main, `respin-engineer` role contract | `respin-visual-v2-phase-1.md` |
| 2 | Server-described task cards and focused Studio/result/filming workspace | 1 | Main, `respin-engineer` role contract | `respin-visual-v2-phase-2.md` |
| 3 | Brain/reference/setup/Results/marketing treatment and final walkthrough | 2 | Main, `respin-engineer` role contract | `respin-visual-v2-phase-3.md` |

## Derived budgets and deferrals

Three phases separate shared foundation, stateful output UI and secondary surfaces. At most 25 implementation file rows per phase, following create-plan size guidance. Browser widths 390/768/1024/1440 and two themes come from handoff §9. Component size targets are derived from the user's request to avoid oversized files. No recurring service or dependency cost is introduced. No in-scope behavior is deferred; the explicit non-goals above are separate product capabilities, not unfinished wiring.

## Progress tracking

| Phase | Implementation | Validation | Independent code gate |
|---|---|---|---|
| 1 | Not started | Pending | Not assessed |
| 2 | Not started | Pending | Not assessed |
| 3 | Not started | Pending | Not assessed |

## Plan Review Log

New continuing gate `respin-visual-v2-plan`, batch 0; no prior evaluations dispatched. History established by creation in this session. Reservation not yet dispatched; frozen inputs are this master, all three phase plans, codebase review and audit. Slots reserved: billing (separate), tenancy (separate), compliance+learning (lean combined, separate verdicts), final plan generalist (separate, after all specialists). Planned requests: `gpt-6-astra`, `ultra`; named-role checklists loaded into general-purpose independent contexts to honor this runtime request. All slots pending launch, verdicts not assessed. Retry allowance: batches 1–2 only. `plan gate ran lean (consolidated)` applies to the compliance/learning slot only. Optional nested Codex review is not independent in this host and will not be claimed.

Dispatch update (same frozen contract): batch-0 billing `/root/plan_billing`, tenancy `/root/plan_tenancy`, and combined `/root/plan_honesty` started with explicit `gpt-6-astra` / `ultra` requests. Three evaluations consumed, terminal verdicts pending. Final generalist slot remains reserved/pending launch after those reports. Runtime model resolution is not independently exposed. Before-code focused baseline: `pnpm -C respin exec vitest run tests/studio-ui.test.tsx tests/shell-rail.test.tsx tests/brain-ui.test.tsx tests/landing-pricing.test.ts` passed 4 files / 324 tests. This is not a full entry-gate result. Local app probe at `http://localhost:8000/` returned ECONNREFUSED; no live route evidence claimed.

## Exit demonstration

Handoff §10: “a creator identifies a starting point, prepares a brief, understands the cost, reads a draft, finds what needs checking, knows what to film, and exports the intended result without losing context.” Execute in both themes. No feature-specific phase exit-gate document exists for this new visual goal; the quoted supplied handoff plus CLAUDE.md Definition of Done governs.

Plan readiness is pending independent review. Implementation is authorized to continue after its required current plan gate and checkpoint.
