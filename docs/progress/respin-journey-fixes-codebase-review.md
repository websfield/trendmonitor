# respin-journey-fixes — codebase review (2026-09-15)

Workflow type: **hardening** (fix / harden). Audit first: [`respin-journey-fixes-audit.md`](respin-journey-fixes-audit.md) is the findings register every task below binds to. Brief: [`../plans/respin-journey-fixes-brief.md`](../plans/respin-journey-fixes-brief.md). Baseline commit `3273f36`; the working tree also carries the two test-only journey edits the audit names.

## Requirement IDs satisfied

| ID | Statement (PRD) | Findings served |
|---|---|---|
| REQ-G01 | Four tiers billed monthly via Stripe; self-serve upgrade | F-01, F-17 (checkout reachable) |
| REQ-G03 | Overage packs and auto-top-up with a spend cap | F-01 (auto-top-up protocol activation), F-12 (copy) |
| REQ-G02 / G04 | Credits meter generation; ledger append-only, balance derived | F-02 (included build must not be spent by a parse failure) |
| REQ-E05 | Tracked niches per tier; Free is digest only | F-05 |
| REQ-A01 | Users sign up and land in a personal workspace and create a profile | F-07 |
| REQ-B01 / B02 / B04 | Guided onboarding; every inferred field confirmed before activation; onboarding ends with first ideas | F-08, F-09, F-10, F-11 |
| REQ-C01 / C02 | Modes produce output in the creator's voice | F-04 |
| REQ-I03 / I05 | `[check]` for unknown specifics; disclosure guidance provided, never concealment | F-03 |
| REQ-H01 | Public site with a labelled live demo | F-18 (capture only; no product change) |
| REQ-A02 | Editor can generate and log results | F-19 (proof, not product) |

## Where this fits, and what must already be shipped

| Dependency | Proof it shipped |
|---|---|
| Tier-checkout protocol v1 rollout authority and CLI | `respin/packages/credits/src/stripe/tier-checkout-rollout.ts` (exports `beginTierCheckoutProtocolDrain`, `auditTierCheckoutLegacyDrain`, `activateTierCheckoutAttemptProtocol`), `tier-checkout-rollout-cli.ts`, package script `stripe:tier-checkout:rollout`; migration 0049 applied (DB at 62) |
| Auto-top-up protocol v1 rollout CLI and runbook | `respin/packages/credits/package.json:18`; `docs/runbooks/auto-topup-protocol-v1-rollout.md` |
| Step-up password on billing forms | `respin/app/(product)/settings/billing/billing-view.tsx:178-195` (`CurrentPasswordField`, `name="password"`) |
| Metered onboarding inference with the included-build claim | `respin/packages/credits/src/inference.ts:600-640` (claim read), `:857-884` (claim written at 8b), `:796-807` (failure classification) |
| Flag-only demotion of disclosure specifics | `respin/packages/modes/src/claims.ts:41` (`FLAG_ONLY_FIELD_PREFIXES`), `respin/app/(product)/studio/run-copy.ts:586-590` |
| Studio reads the three document histories | `respin/app/(product)/studio/page.tsx:132-138` |
| Interview state | `respinDb.getInterviewDraft(...).submittedAt` (`respin/packages/db/src/index.ts:1005-1008`) |
| Persona journeys and support helpers | `respin/e2e/journeys/*.spec.ts`, `respin/e2e/support/*.ts`, `respin/playwright.config.ts` |
| CI gate job with a Postgres service | `.github/workflows/respin.yml:17-40` |

Nothing this plan needs is unshipped. Stop Condition 2 does not fire.

## Modules touched and ownership of new entities

| Area | Owner today | New entity | Owner |
|---|---|---|---|
| `packages/credits` (inference, infer-voice, errors) | `respin-engineer` | `LlmUnusableReplyError` (billable, does not consume the included build) | `packages/llm/src/errors.ts` |
| `packages/llm` (`assemble.ts`) | `respin-engineer` | none — `parseVoiceReply` is called earlier, not changed | — |
| `app/(product)/settings/billing` | `respin-engineer` | one "Start a plan" form with a tier choice | `billing-view.tsx` |
| `app/(product)/trends` | `respin-engineer` | `niche-disabled-tier` block | `track-niche-panel.tsx` |
| `app/(product)/onboarding`, `app/(product)/nav.tsx`, `app/(auth)/auth-form.tsx`, `app/(product)/brain`, `app/(product)/studio` | `respin-engineer` | onboarding step header; Brain nav item; Studio "no voice document" notice | the named files |
| `packages/modes` rendering contract (`traceability`) | `respin-engineer` | none in the scan; rendering only | `app/(product)/studio/generation-outcome.tsx`, `run-copy.ts` |
| `docs/runbooks` | owner | `tier-checkout-protocol-v1-rollout.md` | docs |
| `respin/package.json` scripts | `respin-engineer` | `dev:activate-billing-protocols` | root package |
| `.github/workflows/respin.yml` | `respin-engineer` | `journeys` job (manual / nightly) | CI |
| `respin/e2e` | `respin-engineer` | `support/brain.ts`, `journeys/README.md` | e2e |

## Cross-boundary reach

- **Included-build consumption (F-02):** `inferVoice` (`packages/credits/src/infer-voice.ts:236`) parses after `runInference` has committed the claim. The fix keeps every boundary as is: the parse moves *inside* the metered run as a validation step supplied by the caller, and a failed parse is raised as an `LlmError` subclass so `inference.ts:796-807` classifies it (outcome `schema_invalid`, `billable=true`, `consumesIncludedBuild=false`) and step 8a records the spend. No new table, no ledger write, no claim deletion. The uncharged-attempt cap (`inference.ts:614-640`) already bounds retries of a billable-non-consuming failure.
- **Rollout activation (F-01):** no code path is added that writes `active`. The dev/CI script only sequences the existing CLIs; the DB-authored drain window and the account audit are unchanged.
- **Onboarding step header (F-09):** reads facts the page or its siblings already read through the scoped facade: `listOnboardingInputs` (posts), `readBrainHistory(scope, id, "voice")` (activation), `getInterviewDraft` (submission). "First ideas done" needs a generation-exists read per profile: use `brainAssetSummary` if it counts generations (verify in Phase 2 T3), else add one scoped accessor to `respinDb` through `withWorkspace` — never a raw table read from `app/**` (eslint `no-restricted-imports` guard).
- **Studio voice notice (F-04):** `studio/page.tsx:132-138` already loads the voice history; the notice is derived from `voice.some(v => v.status === "active")` with no new read.

## Entry-point trace

| Capability | Entry point (ships in) |
|---|---|
| Subscribe to Creator/Pro/Studio on a dev or CI database | `/settings/billing` → Subscribe (Phase 1, after `pnpm dev:activate-billing-protocols`) |
| A failed voice parse keeps the included build | `/onboarding` → Build my voice brain (Phase 1) |
| Free sees why niche tracking is unavailable | `/trends` (Phase 1) |
| New account lands on onboarding | `/sign-up`, Google sign-in (Phase 2) |
| Brain reachable from the rail | every product page (Phase 2) |
| Step header, ordered onboarding, collapsed brain page, Studio voice notice, disclosure markers gone | `/onboarding`, `/brain`, `/studio`, `/onboarding/first-ideas` (Phase 2) |
| Journeys prove the paid path, run in CI | `pnpm test:e2e`, workflow `journeys` (Phase 3) |

`docs/progress/**/deferred-findings.md`: none exist (`find docs/progress -name deferred-findings.md` → empty), so no deferred finding re-enters.

## Critical-Path triggers

| Path | Triggered by | Gate |
|---|---|---|
| Respin billing & credits (**Full gates: yes**) | Phase 1: rollout runbook/script (Stripe, `packages/credits`), included-build consumption (`packages/credits`, `packages/llm` errors), billing page, tier gate on niches | `respin-billing-reviewer`, separate |
| Respin spin compliance | Phase 2 T6: rendering of `[check]` for flag-only disclosure findings (REQ-I03/I05) | `respin-compliance-reviewer` (lean: single non-full path, so the merged run is this reviewer) |
| Respin brain tenancy | not touched — no scoping, no brain writes, no new table; Phase 2's optional accessor goes through `withWorkspace` like every sibling | — |
| Respin learning honesty | not touched | — |

## Inherited stopgaps

`grep -rnE "TODO|FIXME|placeholder|demo|SHORTCUT"` over the nine touched app files and `e2e/support/*.ts`: every hit is prose about labels-not-placeholders, the `[check]` placeholder convention, or the landing `DemoPanel` — **none found** that this plan retires or must keep. The journeys' stale bug notes (F-21) were retired in the working tree today.

## Files to touch

| Path | New / modified | Phase |
|---|---|---|
| `docs/runbooks/tier-checkout-protocol-v1-rollout.md` | new | 1 |
| `respin/scripts/activate-billing-protocols.ts` (via `tsx`) | new | 1 |
| `respin/package.json` (script `dev:activate-billing-protocols`) | modified | 1 |
| `respin/packages/llm/src/errors.ts`, `respin/packages/llm/src/index.ts` | modified | 1 |
| `respin/packages/credits/src/inference.ts`, `infer-voice.ts` | modified | 1 |
| `respin/app/(product)/billing-errors.ts` (`llm_attempt_not_consuming`, `unknown_tier`) | modified | 1 |
| `respin/app/(product)/settings/billing/billing-view.tsx`, `page.tsx`, `actions.ts` | modified | 1 |
| `respin/app/(product)/trends/track-niche-panel.tsx`, `track-state.ts`, `actions.ts`, `page.tsx`; `respin/packages/db/src/trends-storage.ts` (typed refusal, conditional) | modified | 1 |
| `respin/tests/billing-ui.test.tsx`, `respin/packages/credits/tests/inference-unusable-reply.test.ts` (new), `tier-checkout-runbook-reasons.test.ts` (new), `respin/tests/activate-billing-protocols.test.ts` (new), `respin/tests/trends-niche-ui.test.tsx` (new); the existing `respin/tests/table-writers.test.ts` is the single-producer guard (no new scanner) | modified / new | 1 |
| `respin/app/(auth)/auth-form.tsx`, `respin/e2e/support/auth.ts` | modified | 2 |
| `respin/app/(product)/nav.tsx` | modified | 2 |
| `respin/app/(product)/onboarding/onboarding-view.tsx`, `page.tsx` | modified | 2 |
| `respin/app/(product)/brain/brain-view.tsx` | modified | 2 |
| `respin/app/(product)/studio/page.tsx`, `studio-view.tsx`, `studio-panel.tsx`, `copy.ts` | modified | 2 |
| `respin/app/(product)/studio/generation-outcome.tsx`, `run-copy.ts` | modified | 2 |
| `respin/app/(product)/results/*` (duplicate sentence) | modified | 2 |
| `respin/tests/onboarding-ui.test.tsx`, `brain-ui.test.tsx`, `first-ideas-ui.test.tsx`, `auth-form.test.tsx`, `page-wiring.test.tsx` | modified | 2 |
| `respin/e2e/journeys/*.spec.ts`, `respin/e2e/support/brain.ts` (new), `respin/e2e/journeys/README.md` (new) | modified / new | 3 |
| `.github/workflows/respin.yml` | modified | 3 |

## Existing patterns to follow verbatim

- Tier-blocked control: `respin/app/(product)/trends/paste-panel` `paste-disabled-tier` block (names the plans that include it) — copy this shape for niche tracking.
- Failure classification that does not consume the included build: `LlmTruncatedError` (`packages/llm/src/errors.ts:226`) for the class shape; `inference.ts:796-807` for the catch.
- Disabled-with-reason control: `billing-view.tsx` `Blocked reason` (`aria-describedby`).
- Runbook shape: `docs/runbooks/auto-topup-protocol-v1-rollout.md` (immutable bindings, cutover, rollback).
- Native disclosure element: `<details>` with a `<summary>`; DESIGN.md panel classes; no new dependency.
- Journey helpers: `respin/e2e/support/generation.ts` (poll for a terminal `data-testid`).

## Risks and invariants

| Risk | Invariant (id) | Negative acceptance example |
|---|---|---|
| A parse failure still spends the included build after the refactor | `included-build-survives-unusable-reply` | Plant a reply that is valid vendor text but fails `parseVoiceReply`; assert no `first_billable_attempts` row, `model_usage.outcome = schema_invalid`, `consumed_included_build = false`; a second press is priced as the included build; with a prior claim and balance 500, no ledger row and balance 500 |
| The unusable reply's spend is invisible to the cap and the margin rollup | `unusable-reply-cost-recorded` | The planted-unusable row has `tokens_out > 0` and `cost_micro_usd IS NOT NULL`; moving the validate hook above `inference.ts:782` turns that assertion red |
| Activation attempted on a lineage whose Stripe account holds Sessions from another lineage | `activation-one-ceremony-per-lineage` | `tier-checkout-rollout.ts:354-363` flags every such Session `orphaned_customer_mapping`; the dev lineage binds a dedicated sandbox and the script's second run short-circuits on `active`; CI restores an activated snapshot rather than recreating its DB |
| A concealment claim on the disclosure heading is hidden by the new filter | `disclosure-claims-never-filtered` | A planted flag-level `/disclosure/guidance` claim still renders under "What the draft says about itself" |
| An honesty block ends up inside a collapsed `<details>` | `honesty-blocks-never-folded` | `studio-disclosure`, `studio-weakest-point`, `studio-kill-test`, `studio-check-legend`, `studio-disclosure-provenance`, `first-ideas-next`, `NO_RESULTS_BASIS`, `NO_STREAM_NOTE` are not descendants of any `details` in usable and honest-refusal states |
| The retry path becomes free at the vendor's expense | `uncharged-attempt-cap-counts-unusable` | N+1 planted unusable replies; the (N+1)th press refuses with `uncharged_attempt_cap` before the vendor is called |
| A second producer of `active` appears in dev tooling | `rollout-active-single-producer` | `grep -rn "state: \"active\"\|state = 'active'" respin/scripts respin/packages/db/src/seed*` finds nothing outside `tier-checkout-rollout.ts` and `auto-topup-rollout.ts`; the script only shells the two CLIs |
| One-form plan selection subscribes to the wrong tier | `plan-form-tier-matches-choice` | Choose Pro, submit: the action receives `tier=pro`; a missing choice refuses before Stripe |
| `[check]` disappears for creator-material fields | `check-markers-kept-for-creator-fields` | An idea containing an untraced number still renders `[check]` while the disclosure sentence renders none |
| Sign-up redirect breaks the journeys' `waitForURL` | `signup-lands-on-onboarding` | `signUp` helper waits for `**/onboarding`; the solo journey's chapter 3 no longer navigates first |
| Step header reports "done" from a fact the page did not read | `step-state-derived-not-assumed` | A profile with posts but no active voice renders step 2 as "next", never "done" |
| CI journeys burn real model spend on every push | `journeys-manual-or-nightly-only` | The workflow triggers only `workflow_dispatch` and `schedule`, never `push`/`pull_request` |
