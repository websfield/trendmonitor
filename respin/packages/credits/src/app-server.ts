// App-facing facade (tenancy plan-gate finding 5; the respinDb precedent):
// app/** imports ONLY this entrypoint — the sanctioned surface, already bound
// to the server db handle. getServerDb/createDb stay off the app allowlist
// forever; raw ledger tables are denied from here by the lint (static imports)
// plus the dynamic-import source scan in tests/import-boundary.test.ts.
// handleStripeEvent is deliberately NOT here: dispatching a Stripe event is
// reachable only from @respin/credits/webhook-server, allowlisted to
// app/api/stripe/WEBHOOK/** — not app/api/stripe/**, which would hand the
// dispatcher to the sibling checkout and portal routes that verify no
// signature (this facade is importable by ALL of app/**, so a server action
// could otherwise drive the dispatcher past the signature layer).
import {
  getServerDb,
  getServerRunSlots,
  type ReadGradeWorkspaceScope,
  type ReauthenticatedSessionRef,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import {
  deriveBalance,
  getDisplayBalance,
  type BalanceView,
  type DisplayBalanceView,
} from "./balance";
import {
  getWorkspaceBillingState,
  hasLiveStripeSubscription,
  mayChargeOffSession,
  type BillingState,
} from "./state";
// THE AUTHORITY, not the mirror on `BillingState` (see `hasOpenPause` below).
import { hasOpenPause } from "./pause";
import { LedgerIntegrityError } from "./fold";
import {
  BalanceIsolationError,
  ClockSkewError,
  AutoTopupReconciliationRequiredError,
  InsufficientCreditsError,
  PostCallDebitError,
  UnchargedAttemptCapError,
} from "./errors";
import {
  AutoTopupAttemptIntegrityError,
  AutoTopupShortfallError,
  AutoTopupUnnamedRefusalError,
} from "./stripe/auto-topup";
import {
  createInvoiceRecoveryUrl,
  createPackCheckoutUrl,
  createPortalUrl,
  createTierCheckoutUrl,
  pauseSubscription,
  resumeSubscription,
  setAutoTopup,
  AlreadySubscribedError,
  AutoTopupCapError,
  BillingReauthenticationError,
  BillingRoleError,
  CheckoutInFlightError,
  CheckoutReconciliationRequiredError,
  InvoiceRecoveryUnavailableError,
  NoLiveSubscriptionError,
  NoStripeCustomerError,
  NotChargeableError,
  NotPausedError,
  NotRecoverableError,
  PauseLengthError,
  StripeSessionUrlMissingError,
  SubscriptionPausedError,
  UnknownTierPriceError,
  type CheckoutUrls,
} from "./stripe/actions";
import {
  acceptBillingContact,
  billingContactStatus,
  BillingContactProviderError,
  type BillingContactStatus,
} from "./stripe/billing-contact";
import {
  PackPriceMismatchError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
} from "./stripe/pack-price";
// Phase 6 billing gate (R-175): the tier price checked at Checkout against the
// price the public page states. Reachable from `respinCredits.createTierCheckoutUrl`.
import {
  TierPriceChangedError,
  TierPriceMismatchError,
  TierPriceUnavailableError,
} from "./stripe/tier-price";
import {
  AutoTopupAuthorityKeyError,
  isStripeConfigured,
  StripeAccountBindingError,
  StripeNotConfiguredError,
} from "./stripe/adapter";
import { AutoTopupAuthoritySignatureError } from "./stripe/auto-topup-authority";
import {
  AutoTopupRolloutError,
  getAutoTopupProtocolState,
  type AutoTopupProtocolState,
} from "./stripe/auto-topup-rollout";
import {
  getTierCheckoutProtocolState,
  TierCheckoutRolloutError,
  type TierCheckoutProtocolState,
} from "./stripe/tier-checkout-rollout";
import { TierCheckoutAuthorityError } from "./stripe/tier-checkout-authority";
import { CustomerMappingLostError } from "./stripe/customers";
import { createProfile } from "./profiles";
import {
  InferenceRoleError,
  ProfileArchivedError,
  RunSlotBusyError,
  TopupInFlightError,
  type RunInferenceResult,
} from "./inference";
import {
  createAnthropicProvider,
  ASSEMBLY_KINDS,
  ASSEMBLY_KINDS_PRE_VENDOR,
  AssemblyError,
  LlmError,
  LlmInputTooLargeError,
  NotEnoughPostsError,
  type AssemblyKind,
} from "@respin/llm";
import { inferVoice, type InferVoiceResult } from "./infer-voice";
// Audit P3-A4 / P3-R1(b) (R-157): the held-draft list, "Finish this draft"
// and the operator's settle command — one settlement path behind all three.
// The operator's command reaches the same path through
// `@respin/credits/operator-server`, never through this app facade.
import { heldDrafts, type HeldDraft } from "./held-drafts";
import { settleHeldAttempt } from "./generate";
export type { HeldDraft } from "./held-drafts";
import {
  PublicSampleSpinEnablementError,
  PublicSampleSpinNotConfiguredError,
  resolvePublicSampleSpinEnablement,
  runPublicSampleSpin,
  type PublicSampleSpinEnablement,
  type SampleSpinResponse,
} from "./sample-spin";
export { PublicSampleSpinEnablementError, PublicSampleSpinNotConfiguredError };
import { parsePublicSampleSpinKeyring, PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV } from "@respin/db";
// Display-only values the landing page renders beside the live panel: the
// synthetic original and the idea ceiling. No behaviour rides on them.
export { SAMPLE_ORIGINAL, SAMPLE_SPIN_IDEA_MAX_CODE_POINTS, SAMPLE_SPIN_NEXT_ACTION } from "./sample-spin";
import { getActiveConfigRequiringStored } from "@respin/config";
import {
  BrainNotActivatedError,
  BrainPointerDivergenceError,
  ConceptContextInsufficientError,
  GenerationAlreadyRefusedError,
  GenerationHeldError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationQuoteChangedError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  GenerationUnchargedCostCapError,
  GenerationWindowCostCapError,
  HeldDraftUnavailableError,
  PerformanceLearningConfigUnavailableError,
  RevisionParentError,
  RevisionPresetError,
  UnpricedOperationError,
} from "./errors";
import {
  cancelCreativeWork,
  conceptContextReady,
  creativePieceView,
  renewCreativeOperation,
  selectConcept,
  startOwnIdea,
  type CreativePieceView,
} from "./creative-work";
export type { CreativePieceView } from "./creative-work";
// Launch L4 (R-153): the saved recording pack — read, "use this version", the
// three fixed revisions and the recent list. The read takes no provider.
import {
  REVISION_PRESETS,
  readSavedGeneration,
  recentSavedGenerations,
  reviseSaved,
  selectSavedVersion,
  type RecentSavedGeneration,
  type SavedGenerationRead,
} from "./saved-generation";
export type {
  RecentSavedGeneration,
  SavedGenerationRead,
  SavedGenerationView,
  SavedKillTest,
  SavedPieceVersion,
  SavedReference,
  SavedRevisionBlock,
  SavedRevisionLine,
  SavedRuleVerdict,
} from "./saved-generation";
/**
 * The three revisions the saved page offers — ids and labels only. The note
 * each one sends is the package's (`REVISION_PRESETS`), never the screen's.
 */
export const SAVED_REVISION_OPTIONS: readonly { id: string; label: string }[] =
  REVISION_PRESETS.map((p) => ({ id: p.id, label: p.label }));
import {
  LLM_TRANSPORT_FAKE_SELECTOR,
  selectedLlmUnderlyingFetch,
} from "@respin/db";
import {
  generate,
  type GenerateParams,
  type GenerateResult,
} from "./generate";
import {
  FIND_CONCEPT_MODE,
  ModeNotInPlanError,
  UnknownEntitlementTierError,
  performanceLearningEntitlementFor,
  trackedNicheEntitlement,
  type PerformanceLearningEntitlement,
} from "./mode-access";
import { GenerationAttemptStateError } from "@respin/db";
// THE PIPELINE'S OWN REFUSALS, RE-EXPORTED AS VALUES (the `LlmError`
// precedent, four imports up). `@respin/modes` is denied from `app/**`, so a
// class it throws is a class the studio screen could not `instanceof` — and a
// typed refusal `app/**` cannot match degrades to "Something went wrong" on
// the one screen that spends a creator's credits. The facade-error walk cannot
// demand these (it follows RELATIVE imports only), which is exactly why they
// are named here deliberately rather than left to it.
import {
  CONSTRAINT_ITEM_MAX_CODE_POINTS,
  CONSTRAINT_LIST_MAX,
  CreativeRequestError,
  EVENT_CONFIRMATION_ITEM,
  FILMING_MINUTES_MAX,
  FILMING_MINUTES_MIN,
  FILMING_PEOPLE,
  FOOTAGE_MAX_CODE_POINTS,
  FORM_CHOICE_LABELS,
  FORM_CHOICE_ORDER,
  GenerationAssemblyError,
  KillTestError,
  NoCreatorRulesError,
  ScriptOutputError,
  SpinSimilarityError,
  UnknownModeError,
  type FormChoice,
} from "@respin/modes";

/**
 * R-148 (launch L1) — THE CREATIVE FORM CONTROL'S DATA, for `/studio`.
 *
 * Here for the reason `modeLabel` and `modeOffers` are: `@respin/modes` is
 * denied to `app/**` (R-64), so the closed set of choices, their labels and the
 * bounds the parse enforces reach the screen through this facade rather than as
 * a second vocabulary typed into a view. The screen offers exactly these; the
 * operation's `parseCreativeRequest` refuses anything else, before any spend.
 * Plain values — no query, no workspace data.
 */
export const CREATIVE_FORM_OPTIONS: readonly { id: FormChoice; label: string }[] =
  FORM_CHOICE_ORDER.map((id) => ({ id, label: FORM_CHOICE_LABELS[id] }));

/**
 * Who films — the two closed values of `FILMING_PEOPLE`, with the words the
 * form shows. A `Record` over the package's own type, so a third value with no
 * label is a compile error here rather than an option the screen invents.
 */
const PEOPLE_OPTION_LABELS: Readonly<Record<(typeof FILMING_PEOPLE)[number], string>> = {
  solo: "Just me",
  with_help: "I will have help",
};
export const CREATIVE_PEOPLE_OPTIONS: readonly { id: string; label: string }[] =
  FILMING_PEOPLE.map((id) => ({ id, label: PEOPLE_OPTION_LABELS[id] }));

export const CREATIVE_CONSTRAINT_BOUNDS = {
  itemMaxCodePoints: CONSTRAINT_ITEM_MAX_CODE_POINTS,
  listMax: CONSTRAINT_LIST_MAX,
  footageMaxCodePoints: FOOTAGE_MAX_CODE_POINTS,
  minutesMin: FILMING_MINUTES_MIN,
  minutesMax: FILMING_MINUTES_MAX,
} as const;
export type { FormChoice };

/**
 * R-150 point 3: the server-authored confirmation item, as a constant — so a
 * test of a surface can assert the exact sentence; the L4 saved pack and its
 * export render the same words Studio does, through the same projection. `presentedEventConfirmation` returns it
 * for EVERY version-2 output. A plain value — no query, no workspace data.
 */
export { EVENT_CONFIRMATION_ITEM };
import { ConfigNotMigratedError, getActiveConfig } from "@respin/config";
// Slice 8c (R-98): the pasted reference's money, and its two refusals.
import {
  pastedReferenceInPlan,
  pastedReferenceQuote,
  settleParkedAutopsies,
  submitPastedReference,
  type PastedReferenceQuote,
  type SettleParkedAutopsiesResult,
  type SubmitPastedReferenceResult,
} from "./pasted-reference";
import { PastedReferenceInputError, PastedReferenceTierError } from "./errors";
import { RefundSourceNeverExpiresError } from "./ledger";
import type { PastedReferenceIntakeInput } from "@respin/db";
import {
  assertUsageRunwayScope,
  usageRunwayFor,
  type UsageRunwayResult,
} from "./days-to-empty";

/**
 * Two PURE reads app/** needs to render honestly, deliberately re-exported as
 * plain functions rather than duplicated as UI-side notions (phase-4):
 *
 * - `hasLiveStripeSubscription` is THE definition of "a Stripe subscription
 *   exists for this workspace right now" (state.ts). It already had three
 *   readers inside the package — the F1 double-billing guard, auto-top-up
 *   arming, and `maybeAutoTopup` — and the billing page is the fourth: subscribe
 *   buttons render only where no live subscription exists, which is the UI face
 *   of `AlreadySubscribedError`. A page-local "looks subscribed to me" test
 *   would be a FIFTH definition, and two readers of this mirror disagreeing is
 *   precisely what produced the round-6 BLOCK.
 * - `isStripeConfigured` answers the keyless question the same way the adapter
 *   does, so the page's disabled state and the action's refusal cannot drift.
 */
export { hasLiveStripeSubscription, isStripeConfigured, mayChargeOffSession };
// Slice 2b, R7 / slice 6, R17a: the burn-period authority AND the vocabulary
// for naming it to the creator — pure, no DB call, so plain re-exports like the
// two above rather than `respinCredits` methods. `BURN_PERIOD_COPY` travels
// with `burnPeriod` deliberately: the page that chooses the window is the page
// that must name it, and a screen-side copy of the names would be the second
// answer R-66 already refused for `modeLabel`.
export { burnPeriod, BURN_PERIOD_COPY } from "./burn-period";
// Audit P6-A3 (R-175): the subscription prices a public page states, read from
// the one table `stripe:setup` creates them from. Pure, no DB call.
export { tierPricesCents, type PaidTier } from "./stripe/tier-prices";
// Slice 6, billing gate round 2: the sentence a WINDOWED uncharged-billable
// cap owes its reader. Re-exported for exactly the `BURN_PERIOD_COPY` reason —
// `billing-errors.ts` writes the words a creator reads, and an independent
// literal there is how that copy came to say "there is nothing for you to
// change" about a refusal that clears itself inside an hour. A plain string
// constant: no query, no workspace data, nothing to isolate.
export { UNCHARGED_CAP_WINDOW_CLAUSE } from "./errors";
export type { BurnPeriod, BurnPeriodKind, BurnPeriodTier } from "./burn-period";
// Slice 6, R17a: the creator-facing name for a stored `generations.mode`.
// Pure, and the ONLY route from `app/**` to `MODE_SPECS[…].label` — see
// `mode-label.ts` for why the label does not live in the view.
export { modeLabel } from "./mode-label";
// P1-R1 (audit R3-1) — THE DISCLOSURE SUBSTITUTION, here for the same reason
// `modeLabel` one line up is: `@respin/modes` is denied to `app/**`, so a
// screen cannot reach a generation's output units or its disclosure directly.
// Pure, no query. `PresentedDisclosure` is the facade's OWN type (kind only, no
// text member), not a re-export of a modes type, so a screen can name it
// without crossing the boundary the eslint rule draws.
export { presentedDisclosure, presentedTextUnits } from "./presented-output";
export type { PresentedDisclosure } from "./presented-output";
// R-148 point 3, R-150 points 2 and 3: the ONE reading of the server's stored
// decisions — which filming resources and shot-map lines the creator has not
// declared — and the confirmation item every v2 output carries. Studio reads
// them, and so does the L4 saved pack (through the same projection). Pure, no query.
export {
  presentedEventConfirmation,
  presentedFilming,
  presentedShotMap,
} from "./presented-output";
export type { PresentedFilmingItem } from "./presented-output";
// Slice 7, R1/R13/R14 (stage D) — THE MODE PICKER'S DATA, and it is here for
// the reason `modeLabel` one line up is: `@respin/modes` is denied to `app/**`
// (R-64), so a screen cannot read `IMPLEMENTED_MODES`, and `mode-access.ts`
// records why it must not re-derive the plan map either. `modeOffers` is
// `assertModeAllowed` read forwards — same two authorities, same order — so
// the control a creator is offered and the gate that refuses them cannot
// disagree. Pure: a resolved tier in, three fields out, no query.
export { modeOffers } from "./mode-access";
// Phase 6 compliance gate: Studio's picker is `modeOffers` minus the modes that
// run only from `/trends` (the Spin similarity gate's), derived from the spec.
export { offeredInStudio, studioModeOffers } from "./mode-access";
// ...and PRD B04's mode, as a NAMED `ModeId` rather than a string typed into
// `app/**`. See its docblock: a literal there is invisible to a rename in
// `MODE_IDS`, and `@respin/modes` is denied to `app/**` so a screen cannot
// check one. Whether a workspace may RUN it is still `modeOffers`' answer.
export { ONBOARDING_FIRST_IDEAS_MODE } from "./mode-access";
// ...and launch L2's "Find my next concept" mode, named for the same reason:
// `/studio` reads that mode's offer to state its price beside the press.
export { FIND_CONCEPT_MODE } from "./mode-access";
export type { ModeOffer } from "./mode-access";
// ...and R5c's ONE producer of the `entitlement` argument every
// private-framework write in `@respin/db` requires with no default. A screen
// must never pass a literal here: `privateFrameworkEntitlement` is the only
// place in the product that maps a resolved tier onto that answer (PRD §4G,
// Pro and Studio only), and `UnknownEntitlementTierError` above is what it
// raises rather than returning `undefined`, which `assertEntitled` would treat
// as "not included" by accident rather than by decision.
export {
  performanceLearningEntitlementFor,
  privateFrameworkEntitlement,
  trackedNicheEntitlement,
} from "./mode-access";
// Slice 7, R8 — WHAT A PRESS WILL COST, BEFORE THE PRESS, for a screen that
// now offers six modes and a revision instead of one fixed price.
//
// These are the OPERATION'S OWN price functions, not a screen-side copy of the
// pricing rule: `generationOp` is the one place a revision's `creditCosts.
// revision` key is chosen over the mode's own (M3 is a one-line edit in it),
// and `priceOf` is the same lookup `generate` takes the debit from. A screen
// that indexed `creditCosts` itself would need a second mode->key map, which
// is exactly the shape `copy.ts` refuses for the tier map. Both are pure and
// take an ALREADY-READ config document — no query, no second config read that
// could disagree with the one the page rendered.
export { generationOp } from "./generate";
export { priceOf } from "./inference";

// R-81/R-82/R-85: the same pricing fact, in the shape `reconcileSpend` needs it
// — and it is a FUNCTION OF A CONFIG DOCUMENT, not a frozen list. R-81 shipped
// the constant `INCLUDED_BUILD_PURPOSES` here, which was a static answer to a
// fact `/admin/config` can change: with a non-zero
// `creditCosts.onboardingBrainBuild` the claim holder owes a debit and must
// stop being exempted from the unbilled report. Pure — it takes an
// ALREADY-READ document, like `priceOf` and `generationOp` above.
//
// ONE CALL PER STORED VERSION, NOT ONE PER REPORT (R-85). `reconcileSpend`
// takes a RESOLVER and asks which `config_version`s its own rows carry;
// `/admin/model-spend` reads those documents (`configVersionContentsServer`)
// and runs this function over each. Handing over the ACTIVE document's answer
// alone let a price cut hide every lost debit incurred before it. It is here
// rather than in `@respin/db` because `priceOf` is what decides it and
// `@respin/db` may not import this package.
export { includedBuildPurposes } from "./included-build";

// THE TWO PRICES `/onboarding`'s RUN CONTROL STATES (billing gate,
// 2026-09-02). Pure, and from `priceOf` rather than from a `creditCosts`
// index: the screen said "your first run is included" unconditionally while
// reading only the REBUILD price, which is false under any document that
// prices `onboardingBrainBuild` above zero — the very document R-82's own
// test appends. A screen that states a price RULE has to read that rule.
export { onboardingBrainPrices } from "./included-build";

// Every error class a facade method can throw must be re-exported here, or
// `app/**` — which may import ONLY this entrypoint — cannot `instanceof` it
// and a typed refusal degrades to an opaque failure. `CheckoutInFlightError`
// was added to actions.ts and missed here (tenancy round-6 CHANGE).
//
// This set is ENFORCED, not curated: `tests/facade-errors.test.ts` walks the
// call graph from each method below through the package's relative imports and
// fails if any Error subclass it can construct is missing here. The comment
// that used to sit in this spot claimed the isolation suite asserted it; no
// such assertion existed, and the claim was false — `getBalance` →
// `deriveBalance` → `foldLedger` throws `LedgerIntegrityError`, and
// `pauseSubscription` → `recordPauseStart` → `assertWriteClock` throws
// `ClockSkewError`; neither was exported (billing + tenancy round-7 CHANGE 2).
// A ledger-integrity failure in particular is one a usage page must be able to
// tell apart: it will not fix itself on a retry.
//
// The walk's one documented blind spot is plain `throw new Error`, which has no
// class to re-export. Round 10 did not merely disclose that limit on this
// facade — it EMPTIED it: the eight anonymous throws in actions.ts and the one
// in customers.ts are typed classes now, and facade-errors.test.ts asserts that
// the set of files reachable from a `respinCredits` method still constructing a
// bare Error is empty. (The webhook facade keeps its bare throws deliberately:
// they exist to become a 500 so Stripe redelivers, and that suite pins them to
// stripe/webhooks.ts alone.)
export {
  AlreadySubscribedError,
  AutoTopupCapError,
  BillingReauthenticationError,
  BillingRoleError,
  CheckoutInFlightError,
  CheckoutReconciliationRequiredError,
  ClockSkewError,
  AutoTopupReconciliationRequiredError,
  AutoTopupAuthorityKeyError,
  AutoTopupAuthoritySignatureError,
  AutoTopupRolloutError,
  TierCheckoutRolloutError,
  TierCheckoutAuthorityError,
  CustomerMappingLostError,
  LedgerIntegrityError,
  NoLiveSubscriptionError,
  NoStripeCustomerError,
  NotPausedError,
  PauseLengthError,
  StripeNotConfiguredError,
  StripeAccountBindingError,
  StripeSessionUrlMissingError,
  UnknownTierPriceError,
  // Phase 10b-1 C3: reachable from `respinCredits.acceptBillingContact`.
  BillingContactProviderError,
  // Audit 2026-08-17 remediation (R1). Each is reachable from a facade method,
  // so the walk in facade-errors.test.ts demands them here — and each has a
  // rendered `?e=` code in app/(product)/billing-errors.ts, because a typed
  // refusal app/** cannot instanceof degrades to "Something went wrong".
  SubscriptionPausedError,
  NotChargeableError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
  PackPriceMismatchError,
  // Phase 6 billing gate (R-175): the tier Checkout's price check.
  TierPriceUnavailableError,
  TierPriceMismatchError,
  TierPriceChangedError,
  // Audit 2026-08-17 remediation (R2) — the `incomplete` remedy's refusals.
  InvoiceRecoveryUnavailableError,
  NotRecoverableError,
  // Slice 2a — the metered model call. Every one of these is reachable from
  // `respinCredits.inferVoice` (which composes the internal `runInference`;
  // the direct facade method was deleted at the slice-3 close, 2026-08-29),
  // so the call-graph walk in `facade-errors.test.ts` demands them here:
  // `app/**` may import ONLY this entrypoint, so a class it cannot
  // `instanceof` degrades a typed refusal to "Something went wrong" on the one
  // screen that spends money.
  //
  // `LlmError` is the BASE class of every provider failure, and re-exporting
  // the base rather than the six subclasses is deliberate: the page renders
  // one sentence for "the model provider did not answer", and enumerating
  // subclasses in `app/**` would put a second classification of vendor
  // failures beside the one that already travels on the error itself.
  InferenceRoleError,
  ProfileArchivedError,
  RunSlotBusyError,
  TopupInFlightError,
  ConfigNotMigratedError,
  // The post-call debit refusal. It exists so `app/**` can tell the two
  // insufficient-credit paths apart: refused BEFORE the vendor (nothing
  // happened) vs refused AFTER it (the model answered, the spend is
  // recorded, the included run is consumed). One code for both told
  // creators on the second path three things that were false.
  PostCallDebitError,
  LlmError,
  // NEWLY APP-REACHABLE IN SLICE 2a, both of them, and neither was reachable
  // before. `InsufficientCreditsError` had been the canonical example of a
  // class this facade deliberately does NOT export, because until now nothing
  // `app/**` could call ever spent a credit; `runInference` is the first, and
  // `facade-errors.test.ts` demanded it the moment the path opened.
  // `AutoTopupShortfallError` is the anonymous `new Error` the same rule
  // forced into a class, one file over.
  InsufficientCreditsError,
  AutoTopupAttemptIntegrityError,
  AutoTopupShortfallError,
  AutoTopupUnnamedRefusalError,
  // Slice 3 — the composed voice inference. Both are reachable from
  // `respinCredits.inferVoice`, so the same call-graph walk demands them.
  // `NotEnoughPostsError` is the ONLY refusal on this path that names an
  // action the creator can take ("paste N more"), which is why it is a class
  // of its own rather than a member of `AssemblyError`.
  AssemblyError,
  ASSEMBLY_KINDS,
  ASSEMBLY_KINDS_PRE_VENDOR,
  type AssemblyKind,
  NotEnoughPostsError,
  UnchargedAttemptCapError,
  // The convention-divergence refusal. Not a creator's fault and not a
  // creator's remedy — it is here because the facade-error walk requires every
  // class reachable from a facade method, and because a bare throw would render
  // as "Something went wrong" on a screen that just spent a creator's run.
  BrainPointerDivergenceError,
  // Slice 6 — every refusal `respinCredits.generate` can raise. The four
  // groups say different things and the studio screen has to tell them apart:
  // what the plan includes (`ModeNotInPlanError`); what the creator must do
  // first (`BrainNotActivatedError`); what a repeated submission means
  // (`GenerationInFlightError`, `GenerationAlreadyRefusedError`,
  // `GenerationPayloadMismatchError`); and the two that mean money moved or
  // may have (`GenerationRecoveryRequiredError`, `PostCallDebitError` above).
  BrainNotActivatedError,
  GenerationAlreadyRefusedError,
  GenerationAttemptStateError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  GenerationUnchargedCostCapError,
  // Audit P3-R3 (R-158): the per-window TOTAL, successes included — its own
  // class because "you were being charged and hit the runaway bound" is not
  // the uncharged copy's "this is a fault on our side".
  GenerationWindowCostCapError,
  // Audit P3-A4 (R-157): a settlement that met a pause, a short balance or a
  // transient error HOLDS the draft rather than destroying it; and "Finish
  // this draft" naming an attempt this creator cannot finish.
  GenerationHeldError,
  HeldDraftUnavailableError,
  // Audit P3-R2 (R-158): the assembled prompt is over `llm.maxInputTokens`.
  // A VALUE re-export, because `app/**` may not import `@respin/llm` and
  // `billing-errors.ts` matches by `instanceof`; the facade-error walk follows
  // relative imports only and cannot demand this one, so it is named here
  // deliberately and `tests/billing-ui.test.tsx` constructs the error through
  // THIS export.
  LlmInputTooLargeError,
  ModeNotInPlanError,
  UnpricedOperationError,
  // Launch L2 (R-151) — the confirmed commission's price moved since it was
  // shown, and "find my next concept" with nothing confirmed to start from.
  // Both are raised before any claim, debit or provider call.
  GenerationQuoteChangedError,
  ConceptContextInsufficientError,
  // Launch L4 (R-153): a saved-page revision the page never offered, refused
  // before any claim, debit or provider call.
  RevisionPresetError,
  // Slice 7 (R5c/REQ-D05) — no tier→entitlement answer for this plan. Not a
  // creator's fault and not a creator's remedy, which is exactly why it needs
  // copy: `privateFrameworkEntitlement` is the ONE producer of the argument
  // every private-framework write requires, and a bare throw on that path would
  // render as "Something went wrong" on a screen that changed nothing.
  UnknownEntitlementTierError,
  // Slice 7 (R6/R8) — a revision whose parent this creator cannot revise from.
  // Raised BEFORE the vendor call, so the copy's job is to say that nothing was
  // spent and which output to reopen, never to sell anything.
  RevisionParentError,
  // Slice 8c (R-98) — `respinCredits.submitPastedReference`'s two refusals of
  // its own (the rest it raises are already above: `InsufficientCreditsError`,
  // `WorkspacePausedError` via @respin/db, `ClockSkewError`,
  // `LedgerIntegrityError`; `ProfileRoleError` and `PostContentError` are
  // @respin/db's and reach `billing-errors.ts` through that facade). The tier
  // refusal names the plan and does not sell; the input refusal names the
  // FIELD so the panel can point at the control.
  PastedReferenceTierError,
  PastedReferenceInputError,
  PerformanceLearningConfigUnavailableError,
  // ...and `settleParkedAutopsies` -> `refundCredits`' one typed refusal: the
  // original debit consumed only never-expiring credits (an admin goodwill
  // adjust), so no refund expiry can be computed (D-M1-7). An operator's case,
  // reachable from a page load, so it needs copy rather than a 500.
  RefundSourceNeverExpiresError,
  // ...and the pipeline's, from `@respin/modes`.
  GenerationAssemblyError,
  KillTestError,
  NoCreatorRulesError,
  ScriptOutputError,
  // RE-EXPORTED 2026-09-04 so `billing-errors.ts` can map it. Both money and
  // compliance reviewers found independently that a `SpinSimilarityError`
  // rendered "Something went wrong": `app/**` may not import `@respin/modes`
  // (R-64), so without this line the class is unreachable to the copy table
  // and `billingErrorCode` falls through to `unknown`.
  SpinSimilarityError,
  UnknownModeError,
  // R-148 (launch L1): `respinCredits.generate` raises it for a form or a
  // filming limit it will not act on, BEFORE any claim or provider call. A
  // class `app/**` cannot `instanceof` renders "Something went wrong" on the
  // screen that spends credits, so it is named here deliberately — the
  // facade-error walk follows relative imports only and cannot demand it.
  CreativeRequestError,
  // Audit Phase 8 (P8-A2): `getBalance`/`getDisplayBalance` → `deriveBalanceInTx`
  // refuses a non-READ-COMMITTED transaction. Unreachable from a page today
  // (both open their own READ COMMITTED transaction), and named here because
  // the facade-error walk demands every class it can reach.
  BalanceIsolationError,
};
export type {
  BalanceView,
  BillingState,
  DisplayBalanceView,
  CheckoutUrls,
  GenerateParams,
  GenerateResult,
  InferVoiceResult,
  PastedReferenceIntakeInput,
  PastedReferenceQuote,
  PerformanceLearningEntitlement,
  SettleParkedAutopsiesResult,
  SubmitPastedReferenceResult,
  UsageRunwayResult,
  // Still exported although the facade method that took it is gone:
  // `InferVoiceResult.run` IS a `RunInferenceResult`, so app/** needs the type
  // to name the metering facts it renders. `RunInferenceParams` left with the
  // method — a params type for a call app/** can no longer make.
  RunInferenceResult,
  AutoTopupProtocolState,
  TierCheckoutProtocolState,
};

/**
 * THE ONE PLACE THIS FACADE BUILDS ITS LLM PROVIDER (launch L2, E-30).
 *
 * Every door that reaches the vendor — `inferVoice`, `generate` and the public
 * Sample Spin — builds through here, so the transport-selection rule
 * (`selectedLlmUnderlyingFetch` in `@respin/db`) runs on each of them: no
 * selector is the real transport; the e2e fake is used ONLY when selected by
 * its exact name, outside a production build, against a database carrying the
 * test marker, AND preloaded by the harness — every other shape REFUSES rather
 * than quietly reaching a paid provider. The fake is injected as
 * `underlyingFetch`, BELOW `pinnedFetch`, so metering, cost and the REQ-E01
 * origin pin still run on each faked call. Under the fake no vendor key is
 * sent anywhere: a placeholder satisfies the adapter's construction check.
 */
function llmProvider(opts: { timeoutMs: number; maxRetries: number }) {
  const underlyingFetch = selectedLlmUnderlyingFetch({
    selector: process.env.RESPIN_LLM_TRANSPORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });
  return createAnthropicProvider({
    apiKey:
      underlyingFetch === undefined
        ? process.env.ANTHROPIC_API_KEY
        : `placeholder-for-${LLM_TRANSPORT_FAKE_SELECTOR}`,
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    ...(underlyingFetch === undefined ? {} : { underlyingFetch }),
  });
}

export const respinCredits = {
  /** Read-only projection used to distinguish an active v1 opt-in from a
   * preference staged during expansion/drain. */
  getAutoTopupProtocolState: (): Promise<AutoTopupProtocolState> =>
    getAutoTopupProtocolState(getServerDb()),
  /**
   * The v1 tier-checkout rollout state.
   *
   * A SECOND FENCE, AND A SEPARATE ONE (batch-5 billing gate). Both
   * `createTierCheckoutUrl` and `createPackCheckoutUrl` call
   * `assertTierCheckoutProtocolActive` BEFORE they consult the auto-top-up
   * rollout, and the two rollouts live in different tables with different
   * revisions. They are both seeded `expanded` today, which is exactly why
   * a screen must not read one as a proxy for the other: the day an
   * operator activates one, the proxy silently starts lying.
   */
  getTierCheckoutProtocolState: (): Promise<TierCheckoutProtocolState> =>
    getTierCheckoutProtocolState(getServerDb()),
  /**
   * Slice 1's profile creation. On THIS facade rather than on `respinDb`, and
   * the reason is the layering R-30 constraint 2 fixes: the cap is priced off
   * the resolved tier, `@respin/db` cannot see the tier authority, and
   * `@respin/db` cannot import `@respin/credits` because the dependency edge
   * already runs the other way. So the door for the WRITE is here, while the
   * profile LIST stays on `respinDb` (a pure scoped read that needs neither).
   *
   * `new Date()` is read HERE rather than inside `createProfile`, matching
   * `pauseSubscription` one screen down: the operation takes its instant so a
   * test can put it at a boundary, and the facade is where the real clock
   * enters.
   */
  createProfile: (scope: WorkspaceScope, displayName: string) =>
    createProfile(getServerDb(), scope, displayName, new Date()),
  // SLICE 2a's `runInference` FACADE METHOD WAS DELETED HERE (slice 3 close,
  // 2026-08-29). R-46 retired the connectivity ping that was its only rendered
  // caller, which left it a caller-less door — and the one door through which
  // `app/**` could reach the model with an ARBITRARY prompt, outside the
  // `own_post` cage `inferVoice` enforces (the tenancy residual that asked for
  // this). The internal `runInference` is unchanged: it is the spend spine
  // `inferVoice` composes, and every gate slice 2a proved still runs inside
  // that call. A future operation that needs a direct metered call adds its
  // own composed facade method, cage included, the way `inferVoice` did.
  /**
   * Slice 3's composed voice inference: infer from the creator's own posts and
   * store the result as a PROPOSED brain version.
   *
   * The provider, the slots and the clock enter here for the same reason they
   * do in `runInference` above — this facade is where the real world enters,
   * and `inferVoice` stays a function of injected ports so a test can hand it a
   * stub whose refusal to be called is the proof.
   *
   * `minOwnPostsForVoice` is read from the ACTIVE CONFIG rather than from a
   * constant, and it is read with `getActiveConfig` (not the
   * requiring-stored variant `runInference` uses for prices): a defaulted
   * threshold only decides whether we ask for more posts, so failing closed on
   * a missing key would refuse a creator for an operator's omission. A
   * defaulted PRICE is a different thing and is still a refusal.
   *
   * IT DOES NOT ACTIVATE. The document comes back `proposed`; confirming and
   * activating are the creator's acts, on their own screens (REQ-B02, R-8).
   */
  inferVoice: async (
    scope: WorkspaceScope,
    profileId: string,
    attemptId: string
  ): Promise<InferVoiceResult> => {
    const db = getServerDb();
    const { content } = await getActiveConfig(db);
    const provider = llmProvider({
      timeoutMs: content.llm.timeoutMs,
      maxRetries: content.llm.maxRetries,
    });
    return inferVoice(
      db,
      scope,
      profileId,
      provider,
      getServerRunSlots(),
      attemptId,
      content.onboarding.minOwnPostsForVoice,
      // FROM CONFIG, not a module constant: it bounds what we send and pay for
      // (billing gate round 2).
      content.onboarding.voiceCorpusMaxPosts,
      new Date()
    );
  },
  /**
   * Slice 6's composed generation: gate, claim, call, settle (R14-R18).
   *
   * THE ONE DOOR. `@respin/modes` and `@respin/llm` are both denied to
   * `app/**`, so a server action cannot assemble a generation prompt or reach a
   * vendor — it hands a mode, an attempt id, the creator's input and a
   * platform, and everything from the cage to the debit happens behind this
   * method. That is the `inferVoice` shape, deliberately: slice 3 deleted the
   * general `runInference` door precisely so a new operation would have to
   * bring its own cage.
   *
   * The provider, the slots and the clock enter here because this facade is
   * where the real world enters; `generate` itself stays a function of injected
   * ports so a test can hand it a stub whose refusal to be called is the proof.
   *
   * `attemptId` IS THE CALLER'S, with no default. It is the idempotency key
   * three tables join on, so a defaulted one would silently make every press a
   * new attempt and turn a double-click into two debits.
   */
  generate: async (
    scope: WorkspaceScope,
    profileId: string,
    params: GenerateParams
  ): Promise<GenerateResult> => {
    const db = getServerDb();
    const { content } = await getActiveConfig(db);
    const provider = llmProvider({
      timeoutMs: content.llm.timeoutMs,
      maxRetries: content.llm.maxRetries,
    });
    return generate(
      db,
      scope,
      profileId,
      provider,
      getServerRunSlots(),
      params,
      new Date()
    );
  },
  /**
   * Audit P3-A4 (R-157) — THIS CREATOR'S HELD DRAFTS: ids, modes and the time
   * each is cleared, never candidate bytes. A read; no provider, no money.
   */
  heldDrafts: (scope: WorkspaceScope, profileId: string): Promise<HeldDraft[]> =>
    heldDrafts(getServerDb(), scope, profileId),
  /**
   * Audit P3-A4 (R-157) — "FINISH THIS DRAFT": settle one held draft by its
   * attempt id through the same settlement a same-id resubmission takes. No
   * provider enters here, because settling a stored candidate calls none.
   */
  settleHeldAttempt: (
    scope: WorkspaceScope,
    profileId: string,
    attemptId: string
  ): Promise<GenerateResult> =>
    settleHeldAttempt(getServerDb(), scope, profileId, attemptId, new Date()),
  /**
   * Launch L2 — "FIND MY NEXT CONCEPT": `generate` as an ideation with no
   * starting concept. The MODE IS SET HERE, never by `app/**` (which names no
   * mode id), and every gate `generate` runs still runs.
   */
  findConcept: async (
    scope: WorkspaceScope,
    profileId: string,
    params: Pick<GenerateParams, "attemptId" | "platform" | "creative" | "sequel"> & {
      hint: string;
    }
  ): Promise<GenerateResult> =>
    respinCredits.generate(scope, profileId, {
      mode: FIND_CONCEPT_MODE,
      attemptId: params.attemptId,
      input: params.hint,
      platform: params.platform,
      findConcept: true,
      ...(params.creative === undefined ? {} : { creative: params.creative }),
      ...(params.sequel === undefined ? {} : { sequel: params.sequel }),
    }),
  /**
   * Launch L2 — COMMISSION A PIECE'S SCRIPT: `generate` as an original
   * `ideaToScript` of the stored concept or own idea. The mode is set here;
   * `attemptId` is the operation id the confirmation displayed.
   */
  commissionPiece: async (
    scope: WorkspaceScope,
    profileId: string,
    params: Pick<GenerateParams, "attemptId" | "platform" | "creative" | "sequel"> & {
      pieceId: string;
      note: string;
    }
  ): Promise<GenerateResult> =>
    respinCredits.generate(scope, profileId, {
      mode: "ideaToScript",
      attemptId: params.attemptId,
      input: params.note,
      platform: params.platform,
      pieceId: params.pieceId,
      ...(params.creative === undefined ? {} : { creative: params.creative }),
      ...(params.sequel === undefined ? {} : { sequel: params.sequel }),
    }),
  /**
   * Launch L2 (R-151) — THE CREATIVE PIECE. Choosing a concept, stating an
   * idea, "New generation" and cancelling each cost NOTHING: no ledger row, no
   * provider call, no claim. The commission is `generate` with `pieceId`.
   * `new Date()` enters here, as it does for `createProfile`.
   */
  selectConcept: (
    scope: WorkspaceScope,
    profileId: string,
    params: { sourceAttemptId: string; ideaIndex: number }
  ): Promise<CreativePieceView> =>
    selectConcept(getServerDb(), scope, profileId, params, new Date()),
  startOwnIdea: (
    scope: WorkspaceScope,
    profileId: string,
    params: { idea: string }
  ): Promise<CreativePieceView> =>
    startOwnIdea(getServerDb(), scope, profileId, params, new Date()),
  renewCreativeOperation: (
    scope: WorkspaceScope,
    profileId: string,
    params: { pieceId: string; expectedVersion: number }
  ): Promise<CreativePieceView> =>
    renewCreativeOperation(getServerDb(), scope, profileId, params, new Date()),
  cancelCreativeWork: (
    scope: WorkspaceScope,
    profileId: string,
    params: { pieceId: string; expectedVersion: number }
  ): Promise<CreativePieceView> =>
    cancelCreativeWork(getServerDb(), scope, profileId, params, new Date()),
  /** The confirmation's read — scoped; a courtesy, never the gate. */
  creativePieceView: (
    scope: WorkspaceScope,
    profileId: string,
    pieceId: string
  ): Promise<CreativePieceView> =>
    creativePieceView(getServerDb(), scope, profileId, pieceId, new Date()),
  /**
   * Launch L4 (R-153) — REOPEN A SAVED GENERATION by its attempt id. A READ:
   * no provider is built here, no claim, no ledger row, no money lock. A
   * zero balance or an open pause changes nothing it returns; scoping still
   * refuses a foreign profile, a tombstone or a lost membership.
   */
  savedGeneration: (
    scope: WorkspaceScope,
    profileId: string,
    attemptId: string
  ): Promise<SavedGenerationRead> =>
    readSavedGeneration(getServerDb(), scope, profileId, attemptId, new Date()),
  /** Launch L4 — "Use this version": zero cost, version-guarded. */
  selectSavedVersion: (
    scope: WorkspaceScope,
    profileId: string,
    params: { attemptId: string; pieceId: string; expectedVersion: number }
  ): Promise<{ pieceId: string; version: number }> =>
    selectSavedVersion(getServerDb(), scope, profileId, params),
  /**
   * Launch L4 — ONE OF THE THREE FIXED REVISIONS of a saved version: a
   * same-mode revision through `generate` (every gate, one debit at the
   * configured revision price). The provider is built here, as for
   * `generate`; `attemptId` is the caller's per-press id, and
   * `quotedConfigVersion` the version the page's price was read under (a
   * different price under the active version refuses before anything runs).
   */
  reviseSaved: async (
    scope: WorkspaceScope,
    profileId: string,
    params: {
      attemptId: string;
      parentAttemptId: string;
      preset: string;
      quotedConfigVersion: number;
    }
  ): Promise<GenerateResult> => {
    const db = getServerDb();
    const { content } = await getActiveConfig(db);
    const provider = llmProvider({
      timeoutMs: content.llm.timeoutMs,
      maxRetries: content.llm.maxRetries,
    });
    return reviseSaved(db, scope, profileId, provider, getServerRunSlots(), params, new Date());
  },
  /** Launch L4 — this profile's recent stored generations, for `/studio`. A read. */
  recentSavedGenerations: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<RecentSavedGeneration[]> =>
    recentSavedGenerations(getServerDb(), scope, profileId),
  /** Whether "find my next concept" can start without a hint (no model call). */
  conceptContextReady: (scope: WorkspaceScope, profileId: string): Promise<boolean> =>
    conceptContextReady(getServerDb(), scope, profileId),
  /**
   * Slice 8c (R-98) — WHAT A PASTE WILL COST, for the `/trends` panel: the
   * active document's `creditCosts.autopsy`, the derived balance, the tier and
   * whether the writer would refuse on tier or pause. A QUOTE, not a decision
   * — the writer below is the authority at the moment of the press.
   */
  pastedReferenceQuote: (workspaceId: VerifiedWorkspaceId, at: Date): Promise<PastedReferenceQuote> =>
    pastedReferenceQuote(getServerDb(), workspaceId, at),
  /**
   * Launch L2 — whether `/studio` offers the standalone reference breakdown:
   * the tier against the pasted-reference tier list and nothing else, so the
   * render takes no workspace money lock (`pastedReferenceQuote` does, through
   * its balance read).
   */
  pastedReferenceInPlan: (workspaceId: VerifiedWorkspaceId, at: Date): Promise<boolean> =>
    pastedReferenceInPlan(getServerDb(), workspaceId, at),
  /**
   * Slice 8c (R-98) — THE PASTE, AND ITS DEBIT, IN ONE TRANSACTION. On this
   * facade and not on `respinDb` for the reason `createProfile` is: the tier
   * gate, the price and the ledger are this package's. `new Date()` enters
   * here, as it does for `createProfile`, so the operation can be tested at a
   * clock boundary. The stage-A intake it composes has NO bind of its own on
   * `respinDb` any more — a screen that reached it would paste for free.
   */
  submitPastedReference: (
    scope: WorkspaceScope,
    profileId: string,
    input: PastedReferenceIntakeInput
  ): Promise<SubmitPastedReferenceResult> =>
    submitPastedReference(getServerDb(), scope, profileId, input, new Date()),
  /**
   * Slice 8c (R-98) — THE ONE WRITE `/trends` MAKES ON LOAD: return the price
   * of every parked pasted-reference claim not yet refunded, once per claim.
   * Idempotent, creator-scoped, deferred (not refused) during an open pause.
   */
  settleParkedAutopsies: (scope: WorkspaceScope, profileId: string): Promise<SettleParkedAutopsiesResult> =>
    settleParkedAutopsies(getServerDb(), scope, profileId),
  getBalance: (workspaceId: VerifiedWorkspaceId): Promise<BalanceView> =>
    deriveBalance(getServerDb(), workspaceId),
  /**
   * THE PRODUCT PAGES' BALANCE READ (audit Phase 8, P8-R1, R-177): never waits
   * on the money lock. The locked derive when the billing lock is free
   * (`settling: false`); the committed fold when another transaction holds it
   * (a money path, or another request's display read), or when
   * the derive meets the 5 000 ms render budget (`settling: true` — render it
   * as settling, never as final, and decide nothing from it). The same brand as
   * `getBalance`. Every `app/(product)/**` balance read goes through this one,
   * once per request, via `app/(product)/display-balance.ts`'s React `cache`
   * (`balance-contention.docker.test.ts` scans both).
   */
  getDisplayBalance: (workspaceId: VerifiedWorkspaceId): Promise<DisplayBalanceView> =>
    getDisplayBalance(getServerDb(), workspaceId),
  /** C8's one-snapshot balance/runway read for the usage surface. */
  usageRunwayFor: (scope: WorkspaceScope): Promise<UsageRunwayResult> => {
    assertUsageRunwayScope(scope);
    return usageRunwayFor(getServerDb(), scope);
  },
  getBillingState: (
    workspaceId: VerifiedWorkspaceId,
    at: Date
  ): Promise<BillingState> =>
    getWorkspaceBillingState(getServerDb(), workspaceId, at),
  /**
   * C2 / R-112: the sole server facade for performance-learning access.
   * The caller supplies only workspace identity and time; tier and config are
   * resolved behind this boundary from their authorities.
   */
  performanceLearningEntitlementFor: (
    workspaceId: VerifiedWorkspaceId,
    at: Date
  ): Promise<PerformanceLearningEntitlement> =>
    performanceLearningEntitlementFor(getServerDb(), workspaceId, at),
  /**
   * THE TRACKED-NICHE ALLOWANCE for this workspace's resolved tier, read from
   * the ACTIVE CONFIG DOCUMENT (R-95: config, not a code map) — the only place
   * a screen may obtain the `entitlement` that `respinDb.trackNiche` requires
   * with no default. `app/**` cannot read `@respin/config`, so the read lives
   * here, beside the tier authority it is keyed on.
   */
  trackedNicheEntitlementFor: async (
    workspaceId: VerifiedWorkspaceId,
    at: Date
  ): Promise<ReturnType<typeof trackedNicheEntitlement>> => {
    const db = getServerDb();
    const billing = await getWorkspaceBillingState(db, workspaceId, at);
    const { content } = await getActiveConfig(db);
    return trackedNicheEntitlement(billing.tier, content.trackedNiches);
  },
  /**
   * IS THIS WORKSPACE PAUSED — the AUTHORITY, for screens that offer a control
   * a paused server will refuse.
   *
   * WHY IT IS ON THE FACADE AT ALL (tenancy gate round 2, 2026-09-01). Two
   * screens derived "paused" from `BillingState.state === "paused"`, which is
   * `isPausedSubscription` — the `subscriptions.pausedAt` MIRROR, whose own
   * docblock says it is "not the authority, and deliberately not used to gate
   * money", and whose sibling in `@respin/db` names mirror-reading as "the
   * drift bug this function exists to make impossible". Every server gate those
   * screens front (`writeBrainDoc`, `activateBrainDocCoherent`, the framework
   * CRUD) refuses on `hasOpenPause` — `pause_periods`. Where the two disagree
   * the screen offered a form the server refuses AFTER the creator had written
   * something, which is the over-offering the pause courtesy exists to prevent.
   *
   * IT IS STILL A COURTESY AND NEVER THE GATE: the same `hasOpenPause` runs
   * inside every one of those operations, at operation time. This just makes
   * the screen ask the same question the server will.
   *
   * NO CLOCK, unlike `getBillingState`: an open pause period is open now.
   */
  hasOpenPause: (workspaceId: VerifiedWorkspaceId): Promise<boolean> =>
    hasOpenPause(getServerDb(), workspaceId),
  createTierCheckoutUrl: (
    scope: WorkspaceScope,
    tier: "creator" | "pro" | "studio",
    email: string,
    urls: CheckoutUrls,
    authority: ReauthenticatedSessionRef
  ) => createTierCheckoutUrl(getServerDb(), scope, tier, email, urls, authority),
  createPackCheckoutUrl: (
    scope: WorkspaceScope,
    email: string,
    urls: CheckoutUrls,
    authority: ReauthenticatedSessionRef
  ) => createPackCheckoutUrl(getServerDb(), scope, email, urls, authority),
  createPortalUrl: (
    scope: WorkspaceScope,
    returnUrl: string,
    authority: ReauthenticatedSessionRef
  ) => createPortalUrl(getServerDb(), scope, returnUrl, authority),
  createInvoiceRecoveryUrl: (
    scope: WorkspaceScope,
    authority: ReauthenticatedSessionRef
  ) => createInvoiceRecoveryUrl(getServerDb(), scope, authority),
  pauseSubscription: (
    scope: WorkspaceScope,
    months: number,
    authority: ReauthenticatedSessionRef
  ) => pauseSubscription(getServerDb(), scope, months, new Date(), authority),
  resumeSubscription: (
    scope: WorkspaceScope,
    authority: ReauthenticatedSessionRef
  ) => resumeSubscription(getServerDb(), scope, authority),
  setAutoTopup: (
    scope: WorkspaceScope,
    opts: { enabled: boolean; monthlyCapCents?: number },
    authority: ReauthenticatedSessionRef
  ) => setAutoTopup(getServerDb(), scope, opts, authority),
  // Plan C3 (Phase 10b-1): the billing-contact handover that lifts identity
  // deletion's `billing_contact_*` refusals. Provider write first, then the
  // binding (billing-contact.ts).
  billingContactStatus: (
    scope: WorkspaceScope | ReadGradeWorkspaceScope
  ): Promise<BillingContactStatus> => billingContactStatus(getServerDb(), scope),
  acceptBillingContact: (
    scope: WorkspaceScope,
    email: string,
    authority: ReauthenticatedSessionRef
  ): Promise<BillingContactStatus> => acceptBillingContact(getServerDb(), scope, email, authority),
  /**
   * Phase 10a: is the public Sample Spin reachable on this deployment? Read at
   * request time, never at import (keyless build). An unknown value throws —
   * the landing page and the route both fail closed on it.
   */
  publicSampleSpinEnablement: (): PublicSampleSpinEnablement =>
    resolvePublicSampleSpinEnablement(process.env),
  /**
   * Phase 10a plan C2: the sessionless public Sample Spin. THE ONLY DOOR from
   * app/** to a vendor call without a session, and it mints none: no
   * WorkspaceScope, no ProfileScope, no ledger row. The provider is built with
   * `maxRetries: 0` HERE, deliberately — a retry inside the SDK is an HTTP
   * attempt the orchestrator could not count, and R-123 makes a hidden retry an
   * invariant failure. `sample-spin-facade.test.ts` pins that construction.
   *
   * `canonicalIp` is resolved by the route through `@respin/auth`'s one
   * trusted-proxy authority; this facade never reads a header.
   */
  publicSampleSpin: async (input: {
    requestId: string;
    canonicalIp: string | null;
    body: unknown;
  }): Promise<SampleSpinResponse> => {
    const db = getServerDb();
    const { content, version } = await getActiveConfigRequiringStored(db, [
      "publicSampleSpin.dailyCapMicroUsd",
      "systemAutopsy.dailyCapMicroUsd",
      "similarity.strictness",
      "llm.models.generation",
      "llm.models.classification",
      "llm.maxOutputTokens",
      "llm.timeoutMs",
      "llm.overallDeadlineMs",
    ]);
    const keyring = parsePublicSampleSpinKeyring(process.env[PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV]);
    if (keyring === null) throw new PublicSampleSpinNotConfiguredError();
    const provider = llmProvider({
      timeoutMs: content.llm.timeoutMs,
      maxRetries: 0,
    });
    return runPublicSampleSpin(
      { db, provider, content, configVersion: version, keyring, now: () => new Date() },
      input
    );
  },
};
