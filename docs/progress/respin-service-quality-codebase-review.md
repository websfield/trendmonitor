# respin-service-quality — codebase review (2026-09-15)

Workflow type: **hardening**. Audit: [`respin-journey-fixes-audit.md`](respin-journey-fixes-audit.md) (the 2026-09-15 journey run; this goal takes its service rows). Brief: [`../plans/respin-service-quality-brief.md`](../plans/respin-service-quality-brief.md). Baseline `3273f36` plus the two uncommitted test-only journey edits. Facts shared with the parked goal are cited from [`respin-journey-fixes-codebase-review.md`](respin-journey-fixes-codebase-review.md) where they were verified; everything new below was opened this session.

## Requirement IDs satisfied

| ID | Statement (PRD) | Findings served |
|---|---|---|
| REQ-B01 / B02 / B04 | Guided onboarding under 20 min; every inferred field confirmed before activation; onboarding ends with first ideas | F-02 (service half: the voice build must succeed or say why), F-07, F-08, F-09, F-10, F-11 |
| REQ-A01 | Sign up and land in a personal workspace, create a profile | F-07 |
| REQ-C01 / C02 | Modes produce output in the creator's voice | F-04 |
| REQ-I03 / I05 | `[check]` for unknown specifics; disclosure guidance provided | F-03 |
| REQ-E05 | Free is digest only | F-05 (UI: do not offer a form that always refuses) |
| REQ-H01 | Public site | F-18 (capture only) |
| REQ-A02 | Editor can generate | F-19 (proof) |

## What must already be shipped

| Dependency | Proof |
|---|---|
| Voice inference and assembly | `respin/packages/credits/src/infer-voice.ts:236` calls `parseVoiceReply`; `respin/packages/llm/src/assemble.ts:284-345` — the checks, in order: JSON parse; zod shape; unknown field; duplicate field; empty values; single-vs-list arity; list max; a `[check]` value carrying a citation; (further quote/evidence checks below `:345`, read in Phase 1 T1) |
| Refusal logging | `respin/app/(product)/onboarding/actions.ts:289-296` logs `code: 'inference_unusable', errorName: 'AssemblyError'` and nothing else — the failure **kind** is not recorded |
| Studio reads the three document histories | `respin/app/(product)/studio/page.tsx:131-140` |
| Flag-only demotion of disclosure specifics | `respin/packages/modes/src/traceability.ts:297` (`FLAG_ONLY_FIELD_PREFIXES = ["/disclosure/"]`), `respin/packages/modes/src/claims.ts:22-30` (hard concealment scan on `/disclosure/`) |
| Rendering of traceability | `respin/app/(product)/studio/generation-outcome.tsx:91-92` (unfiltered counts), `:510`/`:543` (`KillTestBlock` in both states), `run-copy.ts:558-566`, `:587-589` |
| Static-render harness limit | `respin/app/(product)/studio/studio-panel.tsx:404-410` (`useActionState` yields its initial state under static render); `tests/studio-ui.test.tsx:2787-2790` |
| Pre-form paragraphs | `studio-panel.tsx:183-222` (`studio-mode-note`, `studio-cost`, `studio-revision-cost`, `studio-no-results-basis`, `studio-no-stream`, `studio-status`); `studio-view.tsx:79-86` (intro, no testid); `first-ideas-panel.tsx:65-91` |
| Interview and asset reads | `respinDb.getInterviewDraft(...).submittedAt`; `BrainAssetSummary` has **no** generation count (`with-workspace.ts:1152-1157`) |
| Niche allowance | facade `respinCredits.trackedNicheEntitlementFor(workspaceId, at)` (`packages/credits/src/app-server.ts:642-650`) wrapping `trackedNicheEntitlement` (`mode-access.ts:310-318`); the only caller today is `trends/actions.ts:99` |
| Journeys and helpers | `respin/e2e/**`; `playwright.config.ts`; `db-shortcut.ts` shells `docker exec respin-postgres`; `platform-admin.spec.ts:41-56` bootstrap `test.skip` |
| CI | `.github/workflows/respin.yml` gate job with a Postgres **service** container; no Playwright job |

Nothing needed is unshipped.

## Modules touched and ownership

| Area | New entity | Owner |
|---|---|---|
| `packages/llm` (`assemble.ts` — `AssemblyError` lives at `:107-112`, not in `errors.ts`) | `AssemblyError.kind` — a closed literal union naming which of the 16 checks failed; typographic/whitespace-tolerant location of the evidence quote with the **original slice stored** (the `validateSourceEvidence` verbatim check at `with-workspace.ts:5737` is untouched) | `respin-engineer` |
| `app/(product)/onboarding` | step header; reordered panels; content-free `assemblyKind` in the refusal log | `respin-engineer` |
| `app/(auth)/auth-form.tsx`, `app/(product)/nav.tsx` | sign-up landing; Brain nav item | `respin-engineer` |
| `app/(product)/brain/brain-view.tsx` | `<details>` per document | `respin-engineer` |
| `app/(product)/studio/*`, `onboarding/first-ideas/*` | voice notice; disclosure-offer filter in `KillTestBlock`; `studio-intro`; injected-state test prop | `respin-engineer` |
| `app/(product)/trends/track-niche-panel.tsx`, `page.tsx` | `niche-disabled-tier` block when allowance is 0 | `respin-engineer` |
| `packages/db` (`with-workspace.ts`, `index.ts`) | `hasGenerationForProfile(scope, profileId)` through `withWorkspace` | `respin-engineer` |
| `respin/e2e/**`, `.github/workflows/respin.yml` | `support/brain.ts`, README, `journeys` job on the Free path, `scripts/scan-journey-notes.ts` | `respin-engineer` |

## Cross-boundary reach

- **Voice-build robustness stays inside `packages/llm`.** No metering change: the parse still runs where it runs today (`infer-voice.ts:236`); what changes is *what* the parser tolerates and *what* it reports. No new vendor call. (An automatic re-ask on assembly failure is a second metered call and is parked with the money work.)
- **Step header** reads: posts (`listOnboardingInputs`), voice (`readBrainHistory(scope, id, "voice")`), interview (`getInterviewDraft`), first ideas (new `hasGenerationForProfile`, `withWorkspace`-scoped, modelled on `brainAssetSummary` at `with-workspace.ts:2780-2787`).
- **Disclosure offers**: filter lives in `KillTestBlock`; `projection.ts:61` untouched; `summary.claims` never filtered.
- **Niche panel**: reads the existing entitlement; no write, no allowance change.

## Entry-point trace

| Capability | Entry point (Phase) |
|---|---|
| Voice build refusal names which check failed; near-miss quotes assemble | `/onboarding` → Build my voice brain (1) |
| New account lands on onboarding; Brain in the rail; ordered onboarding with step header; collapsed brain page; Studio voice notice; disclosure offers gone; folded prose | `/sign-up`, rail, `/onboarding`, `/brain`, `/studio`, `/onboarding/first-ideas` (1) |
| Free `/trends` shows the tier block instead of a form that refuses | `/trends` (1) |
| Journeys prove the Free path nightly | `pnpm -C respin test:e2e`; workflow `journeys` (2) |

No `deferred-findings.md` exists under `docs/progress`.

## Critical-Path triggers

| Path | Triggered by | Gate |
|---|---|---|
| Respin spin compliance | Phase 1 T6 (disclosure-offer rendering, REQ-I03/I05), T5 (Studio copy) | `respin-compliance-reviewer` (lean merged run) |
| Respin brain tenancy (**Full**) | Phase 1 T3's new profile-scoped accessor | `respin-tenancy-reviewer`, separate |
| Respin billing & credits (**Full**) | Phase 1 T8 reads a tier allowance to gate a form (the table's "tiers/allowances" trigger); no allowance, price or ledger change | `respin-billing-reviewer`, separate, scoped to T8 |
| Learning honesty | not touched — Phase 1 T7 keeps `NO_RESULTS_BASIS` outside any fold by acceptance criterion | — |

## Inherited stopgaps

`grep -rnE "TODO|FIXME|placeholder|demo|SHORTCUT"` over the touched app files, `packages/llm/src/assemble.ts` and `e2e/support/*.ts`: hits are prose about labels-not-placeholders, the `[check]` placeholder convention and the landing `DemoPanel` — **none found** to retire or keep.

## Files to touch

| Path | New / modified | Phase |
|---|---|---|
| `respin/packages/llm/src/assemble.ts`, `index.ts`; `respin/packages/llm/tests/assemble-kinds.test.ts` (new); `respin/packages/credits/src/app-server.ts` (re-export), `respin/packages/credits/tests/isolation.test.ts`, `voice-build-tolerance.test.ts` (new); `respin/app/(product)/onboarding/run-state.ts`, `run-outcome.tsx`, `run-copy.ts`; `respin/app/(product)/billing-errors.ts` (one sentence); `respin/packages/db/src/app-server.ts`; `docs/initial/decisions.md` (append) | mod / new | 1 |
| `respin/app/(product)/onboarding/actions.ts` (log the kind) | mod | 1 |
| `respin/app/(auth)/auth-form.tsx`, `respin/e2e/support/auth.ts`, `respin/tests/auth-form.test.tsx` | mod | 1 |
| `respin/app/(product)/nav.tsx`, `respin/tests/page-wiring.test.tsx` | mod | 1 |
| `respin/app/(product)/onboarding/page.tsx`, `onboarding-view.tsx`; `respin/packages/db/src/with-workspace.ts`, `index.ts`; `respin/tests/onboarding-ui.test.tsx` | mod | 1 |
| `respin/app/(product)/brain/brain-view.tsx`, `respin/tests/brain-ui.test.tsx` | mod | 1 |
| `respin/app/(product)/studio/page.tsx`, `studio-view.tsx`, `studio-panel.tsx`, `copy.ts`, `generation-outcome.tsx`, `run-copy.ts`; `respin/app/(product)/onboarding/first-ideas/first-ideas-panel.tsx`, `first-ideas-result.tsx`; `respin/app/(product)/results/page.tsx`; `respin/tests/studio-ui.test.tsx`, `first-ideas-ui.test.tsx`, `claims-vocabulary-agreement.test.ts`, `results-page-wiring.test.tsx` | mod | 1 |
| `respin/app/(product)/trends/page.tsx`, `track-niche-panel.tsx`; `respin/tests/trends-niche-ui.test.tsx` (new) | mod / new | 1 |
| `respin/e2e/journeys/*.spec.ts`, `respin/e2e/support/artifacts.ts`, `support/brain.ts` (new), `journeys/README.md` (new); `respin/scripts/scan-journey-notes.ts` (new), `respin/tests/scan-journey-notes.test.ts` (new); `.github/workflows/respin.yml` | mod / new | 2 |

## Existing patterns to follow verbatim

- Closed literal unions on error classes with no free text: `LlmSchemaInvalidError("no_text_block" | "bad_request")` (`packages/llm/src/errors.ts:179-190`); the `no-text.test.ts` guard.
- Content-free refusal logging: `logRefusal("[onboarding-action] voice inference refused", {...code, errorName})` (`onboarding/actions.ts:289-296`).
- Tier-blocked control with named plans and no upsell: `PASTE_DISABLED_COPY.tier` (`trends/paste-panel.tsx:72-77`).
- Pure component for state a static test cannot drive: `lineage-view.tsx` header.
- Native `<details>`; DESIGN.md panel and refusal-banner classes.

## Risks and invariants

| Risk | Invariant (id) | Negative acceptance example |
|---|---|---|
| Tolerant quote matching accepts a quote that is not in the posts | `evidence-quote-still-required` | A quote differing by more than whitespace/quote-style normalisation still fails assembly with kind `quote_not_found` |
| The failure kind leaks post content into logs | `assembly-kind-content-free` | `AssemblyError.kind` is a closed union; `no-text.test.ts` sees no new string parameter; the log line carries `kind` only |
| Step header reports "done" without a read | `step-state-derived-not-assumed` | Read failure renders `unknown`, never `done` |
| New accessor reads across profiles | `generation-read-profile-scoped` | `hasGenerationForProfile` for profile B returns false when only profile A has generations in the same workspace; a cross-workspace id throws the scope error like its siblings |
| `[check]` disappears for creator-material fields | `check-markers-kept-for-creator-fields` | Fixture: creator number `5`, creator proper noun `Dorset`, `/disclosure/platform` `TikTok`, `/disclosure/guidance` `AI` → exactly two offers, `TikTok [check]` and `AI [check]` absent; the zero-count heading never claims every name in the draft was found |
| A concealment claim on the disclosure heading is hidden | `disclosure-claims-never-filtered` | A planted flag-level `/disclosure/guidance` claim still renders |
| An honesty block ends up inside a fold | `honesty-blocks-never-folded` | Whole-panel render with injected state: each listed testid present and outside every `details` |
| Sign-up redirect breaks the journeys | `signup-lands-on-onboarding` | `signUp` helper waits for `**/onboarding` |
| Nightly run passes on a skip | `journeys-no-persona-skips` | Each persona's main-chapter screenshot asserted present; a `BLOCKING` note fails the job; the admin identity is minted per run by a bootstrap sign-up in an earlier step (Phase 2 T4 step 5), and a persona run that nonetheless ends in the bootstrap skip is caught by the main-chapter presence scan (Phase 2 AC5), not asserted unreachable |
