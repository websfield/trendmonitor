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
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { deriveBalance, type BalanceView } from "./balance";
import {
  getWorkspaceBillingState,
  hasLiveStripeSubscription,
  type BillingState,
} from "./state";
import { LedgerIntegrityError } from "./fold";
import {
  ClockSkewError,
  InsufficientCreditsError,
  PostCallDebitError,
  UnchargedAttemptCapError,
} from "./errors";
import {
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
  BillingRoleError,
  CheckoutInFlightError,
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
  PackPriceMismatchError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
} from "./stripe/pack-price";
import {
  isStripeConfigured,
  StripeNotConfiguredError,
} from "./stripe/adapter";
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
  AssemblyError,
  LlmError,
  NotEnoughPostsError,
} from "@respin/llm";
import { inferVoice, type InferVoiceResult } from "./infer-voice";
import {
  BrainNotActivatedError,
  BrainPointerDivergenceError,
  GenerationAlreadyRefusedError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  UnpricedOperationError,
} from "./errors";
import {
  generate,
  type GenerateParams,
  type GenerateResult,
} from "./generate";
import { ModeNotBuiltYetError, ModeNotInPlanError } from "./mode-access";
import { GenerationAttemptStateError } from "@respin/db";
// THE PIPELINE'S OWN REFUSALS, RE-EXPORTED AS VALUES (the `LlmError`
// precedent, four imports up). `@respin/modes` is denied from `app/**`, so a
// class it throws is a class the studio screen could not `instanceof` — and a
// typed refusal `app/**` cannot match degrades to "Something went wrong" on
// the one screen that spends a creator's credits. The facade-error walk cannot
// demand these (it follows RELATIVE imports only), which is exactly why they
// are named here deliberately rather than left to it.
import {
  GenerationAssemblyError,
  KillTestError,
  NoCreatorRulesError,
  ScriptOutputError,
  UnknownModeError,
} from "@respin/modes";
import { ConfigNotMigratedError, getActiveConfig } from "@respin/config";

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
export { hasLiveStripeSubscription, isStripeConfigured };
// Slice 2b, R7 / slice 6, R17a: the burn-period authority AND the vocabulary
// for naming it to the creator — pure, no DB call, so plain re-exports like the
// two above rather than `respinCredits` methods. `BURN_PERIOD_COPY` travels
// with `burnPeriod` deliberately: the page that chooses the window is the page
// that must name it, and a screen-side copy of the names would be the second
// answer R-66 already refused for `modeLabel`.
export { burnPeriod, BURN_PERIOD_COPY } from "./burn-period";
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
  BillingRoleError,
  CheckoutInFlightError,
  ClockSkewError,
  CustomerMappingLostError,
  LedgerIntegrityError,
  NoLiveSubscriptionError,
  NoStripeCustomerError,
  NotPausedError,
  PauseLengthError,
  StripeNotConfiguredError,
  StripeSessionUrlMissingError,
  UnknownTierPriceError,
  // Audit 2026-08-17 remediation (R1). Each is reachable from a facade method,
  // so the walk in facade-errors.test.ts demands them here — and each has a
  // rendered `?e=` code in app/(product)/billing-errors.ts, because a typed
  // refusal app/** cannot instanceof degrades to "Something went wrong".
  SubscriptionPausedError,
  NotChargeableError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
  PackPriceMismatchError,
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
  AutoTopupShortfallError,
  AutoTopupUnnamedRefusalError,
  // Slice 3 — the composed voice inference. Both are reachable from
  // `respinCredits.inferVoice`, so the same call-graph walk demands them.
  // `NotEnoughPostsError` is the ONLY refusal on this path that names an
  // action the creator can take ("paste N more"), which is why it is a class
  // of its own rather than a member of `AssemblyError`.
  AssemblyError,
  NotEnoughPostsError,
  UnchargedAttemptCapError,
  // The convention-divergence refusal. Not a creator's fault and not a
  // creator's remedy — it is here because the facade-error walk requires every
  // class reachable from a facade method, and because a bare throw would render
  // as "Something went wrong" on a screen that just spent a creator's run.
  BrainPointerDivergenceError,
  // Slice 6 — every refusal `respinCredits.generate` can raise. The four
  // groups say different things and the studio screen has to tell them apart:
  // what the plan includes (`ModeNotInPlanError`) vs what we have shipped
  // (`ModeNotBuiltYetError`); what the creator must do first
  // (`BrainNotActivatedError`); what a repeated submission means
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
  ModeNotBuiltYetError,
  ModeNotInPlanError,
  UnpricedOperationError,
  // ...and the pipeline's, from `@respin/modes`.
  GenerationAssemblyError,
  KillTestError,
  NoCreatorRulesError,
  ScriptOutputError,
  UnknownModeError,
};
export type {
  BalanceView,
  BillingState,
  CheckoutUrls,
  GenerateParams,
  GenerateResult,
  InferVoiceResult,
  // Still exported although the facade method that took it is gone:
  // `InferVoiceResult.run` IS a `RunInferenceResult`, so app/** needs the type
  // to name the metering facts it renders. `RunInferenceParams` left with the
  // method — a params type for a call app/** can no longer make.
  RunInferenceResult,
};

export const respinCredits = {
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
    const provider = createAnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
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
    const provider = createAnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
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
  getBalance: (workspaceId: VerifiedWorkspaceId): Promise<BalanceView> =>
    deriveBalance(getServerDb(), workspaceId),
  getBillingState: (
    workspaceId: VerifiedWorkspaceId,
    at: Date
  ): Promise<BillingState> =>
    getWorkspaceBillingState(getServerDb(), workspaceId, at),
  createTierCheckoutUrl: (
    scope: WorkspaceScope,
    tier: "creator" | "pro" | "studio",
    email: string,
    urls: CheckoutUrls
  ) => createTierCheckoutUrl(getServerDb(), scope, tier, email, urls),
  createPackCheckoutUrl: (
    scope: WorkspaceScope,
    email: string,
    urls: CheckoutUrls
  ) => createPackCheckoutUrl(getServerDb(), scope, email, urls),
  createPortalUrl: (scope: WorkspaceScope, returnUrl: string) =>
    createPortalUrl(getServerDb(), scope, returnUrl),
  createInvoiceRecoveryUrl: (scope: WorkspaceScope) =>
    createInvoiceRecoveryUrl(getServerDb(), scope),
  pauseSubscription: (scope: WorkspaceScope, months: number) =>
    pauseSubscription(getServerDb(), scope, months, new Date()),
  resumeSubscription: (scope: WorkspaceScope) =>
    resumeSubscription(getServerDb(), scope),
  setAutoTopup: (
    scope: WorkspaceScope,
    opts: { enabled: boolean; monthlyCapCents?: number }
  ) => setAutoTopup(getServerDb(), scope, opts),
};
