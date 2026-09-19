# Respin visual v2 codebase review

## Contract and traceability

User request: implement the design in `docs/design/v2/Respin_Visual_Refinement_Handoff.md`, its four mockups and `Respin_Visual_Prototype.html`; establish design system/tokens, use focused files and best coding practice. PRD bindings: REQ-C01–C06 (Studio/output/revision), B01–B04 (complete setup and confirmed Brain), E01–E07/I01–I05 (references/checks), F01–F04 (Results), G01/G04/G05/G07/G08 (prices/balance/billing), H01–H03 (marketing), A02–A04 (roles, isolation, export). This advances the current North Star's script-and-shot-list journey.

## Shipped dependency proof and entrypoints

Existing code is the dependency; this plan does not depend on completion of the unrelated service-quality/creator-ready programs. Their uncommitted improvements are preserved.

| Surface | Actual caller and authority | Existing verification |
|---|---|---|
| All themes | `app/layout.tsx` imports `respin-tokens.css` and `globals.css` | Build/typecheck; new browser theme checks |
| Product shell | `(product)/layout.tsx` calls `requireUser`, workspace bootstrap, scoped balance; renders `ProductNav` and `ShellRail` | `shell-rail.test.tsx`, page gate tests |
| Studio | `studio/page.tsx` resolves profile, `modeOffers`, config `priceOf`, bound actions → `StudioView` → `StudioPanel` → `GenerationOutcome` | `studio-ui.test.tsx`, page wiring, credits mode-access/generation/revision suites |
| References | `trends/page.tsx` → `TrendsView`, `PastePanel`, `PastedReferences`, `SpinPanel` | `trends-page.test.tsx`, trends/Spin suites |
| Brain/setup | `brain/page.tsx` → `BrainView`; onboarding intake/interview/first-ideas routes | Brain/onboarding/interview/first-ideas suites |
| Results | `results/page.tsx` → result forms/comparison/proposal views | Results and proposal suites |
| Billing/usage | Existing billing and usage server pages/views | Billing/usage UI and ledger suites |
| Marketing/auth | Landing and audience routes share `landing-sections.tsx`; auth uses `auth-form.tsx` | Landing-pricing and auth suites |

No new API, database table, provider or remote service. Theme preference is the only new persisted browser value. UI receives already-scoped data through existing props. Export of the current accepted draft is a local download of that already-authorized view, separately labelled from the complete account/Brain export.

## Patterns and ownership

- Pure fixture-renderable views plus small client controls; server pages retain gate/scope/read/project responsibilities.
- Server-owned mode enumeration: `packages/credits/src/mode-access.ts`, labels via `mode-label.ts`; new exhaustive presentation metadata lives beside them.
- `StudioRunState` discriminated union controls whether a document exists. No replay reparsing or withheld-candidate projection.
- `buttonClass`, Banner, native forms, pending labels, persistent live regions and linked disabled reasons remain the primitives.
- `ScriptDocument` in `studio/run-state.ts` supplies beats, indexed shots and independently timed text cues. Preserve order, all fields, findings and `[check]` text.
- Exact new/modified file manifests are in the three phase plans. Each phase has one implementation owner; no overlapping write agents.

## Inherited stopgaps

Inspection query run: `rg -n 'TODO|FIXME|demo|placeholder|defaultValue' 'respin/app/(product)/studio' 'respin/app/(product)/brain' 'respin/app/(marketing)'`; targeted source reads of `studio-panel.tsx`, `generation-outcome.tsx`, `landing-sections.tsx`, `brain-view.tsx`. A targeted `rg --files docs/progress -g '*deferred-findings.md' -g '*entry-baseline.md'` returned no files; no deferred-finding document was available to re-enter.

| Existing limitation | Disposition |
|---|---|
| Marketing illustrative example/optional real Sample Spin | Keep its labels and rollout gate; phase 3 only changes presentation. |
| Replayed Studio result has no full document | Keep existing summary and export explanation; phase 2 never manufactures a document. |
| No persistent draft-history or workspace search in this UI | Do not introduce prototype sample cards/search; no new history/search service in this visual contract. |
| Default-uncontrolled brief/platform | Phase 2 owns them in mounted client state so focused navigation retains answers. |
| Large CSS/outcome/Brain view | Phase 1 splits CSS; phases 2/3 extract cohesive presentation sections. |
| Prototype four-step onboarding | Visual reference only; phase 3 preserves every production question, confirmation and activation gate. |

## Material invariants and negative witnesses

| Invariant ID | Must hold | Negative acceptance example |
|---|---|---|
| `theme-preserves-work` | Root attribute changes only; no remount, action, reload or refresh | Theme switch clears brief/platform/revision/tab/scene or spends credits |
| `server-offer-authority` | Existing offers/access/config prices remain authoritative | Prototype 12-credit cost replaces a changed server price; excluded mode runs |
| `scene-links-are-real` | Shots join by beatIndex; text remains timestamped and unassigned | Scene 2 displays array element 2 despite its beatIndex pointing elsewhere |
| `all-output-reachable` | Every existing document field and warning remains inspectable/exportable | Empty filming tab for caption-only output; shot notes or orphan cues disappear |
| `checks-never-cleared-by-view` | Tabs/copy/export never mutate findings or weaken withholding | Opening Checks hides warning or exports an honest-refusal candidate |
| `brain-remains-explicit` | Provenance, proposed/active state and approval controls persist | Overview says active for a proposal or four-step tour drops interview fields |
| `evidence-remains-qualified` | Self-reported/unavailable and reach/conversion distinctions persist | A missing baseline becomes zero or a manual row appears verified |
| `scoped-data-stays-scoped` | No additional unscoped queries or browser content persistence | Brief/Brain content enters localStorage or another creator's data appears |

## Critical Paths

Billing and tenancy receive separate reviewers. Compliance and learning may share one lean reviewer with separate verdicts. Generalist plan review runs last. Shared theme changes affect the readability of all four paths; their review is scoped to changed presentation and preserved authority, not an unrelated backend redesign.
