// @respin/credits public surface (M1 phase 2). Sole writer of credit_ledger /
// pause_periods / (with Phase 3) subscriptions + stripe_events. All ops are
// TxLike-composable; balance has ONE authority (deriveBalance/deriveBalanceInTx).
export {
  BrainPointerDivergenceError,
  AutoTopupReconciliationRequiredError,
  UnchargedAttemptCapError,
  InsufficientCreditsError,
  PostCallDebitError,
  WorkspacePausedError,
  ClockSkewError,
  // Slice 6 — the generation refusals.
  BrainNotActivatedError,
  GenerationAlreadyRefusedError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  GenerationUnchargedCostCapError,
  UnpricedOperationError,
  // Slice 7, R6/R8 — the revision's parent could not be built from. Raised
  // BEFORE the vendor is contacted, which is why it is a class here rather than
  // @respin/db's `GenerationLineageError`: that one is the settlement's
  // authority and fires after the model has been paid for.
  REVISION_PARENT_REFUSALS,
  RevisionParentError,
  type RevisionParentRefusal,
  // Billing gate round 2: the one sentence a WINDOWED cap owes its reader,
  // shared with `app/(product)/billing-errors.ts` through app-server.ts so the
  // package message and the creator-facing copy cannot say different things
  // about whether the refusal clears itself.
  UNCHARGED_CAP_WINDOW_CLAUSE,
  // Slice 8c (R-98) — the pasted reference's two refusals of its own. On the
  // public surface for the reason every sibling is: `billing-errors.ts`
  // matches on `instanceof`, and a class reachable from a facade method but
  // absent here renders as "Something went wrong" on the panel that spends.
  PASTED_REFERENCE_INPUT_FIELDS,
  PastedReferenceInputError,
  PastedReferenceTierError,
  PerformanceLearningConfigUnavailableError,
  type PastedReferenceInputField,
} from "./errors";
export { LedgerIntegrityError, foldLedger, effectiveExpiry } from "./fold";
export type { FoldResult, LotView } from "./fold";
export { deriveBalance, deriveBalanceInTx, type BalanceView } from "./balance";
export {
  projectUsageRunway,
  usageRunwayFor,
  type DaysToEmptyConfig,
  type UsageRunwayProjectionInput,
  type UsageRunwayResult,
} from "./days-to-empty";
export {
  grantCredits,
  purchasePackCredits,
  adjustCredits,
  refundCredits,
  debitCredits,
  RefundSourceNeverExpiresError,
  type GrantParams,
  type PackParams,
  type AdjustParams,
  type RefundParams,
  type DebitParams,
} from "./ledger";
export {
  getWorkspaceBillingState,
  type BillingState,
} from "./state";
export {
  recordPauseStart,
  recordPauseEnd,
  hasOpenPause,
  ensurePauseStarted,
  ensurePauseEnded,
} from "./pause";
export { getDbNow, takeWorkspaceLock, assertWriteClock, CLOCK_SKEW_MS } from "./clock";
// Slice 1: the creator-profile entitlement decision. Here rather than in
// `@respin/db` because it needs the resolved tier, whose sole authority is
// `state.ts` in this package — see `profiles.ts` for the full reason.
export { createProfile } from "./profiles";
// Slice 2a: the metered model call. Same layering reason as `createProfile`
// above — it needs the resolved tier, the active config and the ledger, none of
// which `@respin/db` can see.
export {
  runInference,
  ONBOARDING_BRAIN_PURPOSE,
  InferenceRoleError,
  ProfileArchivedError,
  RunSlotBusyError,
  TopupInFlightError,
  type RunInferenceParams,
  type RunInferenceResult,
} from "./inference";
export {
  GENERATION_PURPOSE,
  priceOf,
  requiredConfigPaths,
  unchargedAttemptCap,
  unchargedAttemptWindowStart,
  type PricedOperation,
} from "./inference";
// R-82: the same pricing authority, asked one question — which purposes price
// their first billable attempt at zero UNDER THIS DOCUMENT. Public for the
// reason `priceOf` is: a test drives it across config documents without a
// database, and `/admin/model-spend` carries its answer to `reconcileSpend`,
// which lives in a package that may not import this one.
export { includedBuildPurposes } from "./included-build";
// The same module's screen-facing read: BOTH prices of an onboarding brain run,
// each from `priceOf`'s own branch, so `/onboarding` cannot state a rule it did
// not read (billing gate, 2026-09-02).
export { onboardingBrainPrices } from "./included-build";
// Slice 6, R17: the Free mint's two period functions. Exported so the period
// key and the no-rollover expiry can be asserted directly rather than inferred
// from a stored row — the mint itself has no export, because `deriveBalance`
// is the only thing that may run it.
export { freeAllowanceExpiry, freeAllowancePeriodKey } from "./balance";
// Slice 6, R18: the first tier->feature gate. `TIER_MODES` is exported so a
// test can drive the map against ALL SEVEN mode ids rather than the one that
// is built — with one implemented mode a map and an `if` are behaviourally
// identical, and slice 7 is where the difference shows.
//
// Slice 7, R13/R14: the map is now keyed by MODE, so an unclassified mode is a
// compile error rather than a paid-tier allow — `MODE_TIERS` and `modeTiers`
// are exported because they are what a test can drive an eighth, cast-in mode
// id through. `TIER_PRIVATE_FRAMEWORKS` is the same shape for REQ-D05's Pro+
// right, and `privateFrameworkEntitlement` is the ONE producer of the
// `entitlement` argument every private-framework write in `@respin/db`
// requires with no default.
export {
  ENTITLEMENT_TIERS,
  MODE_TIERS,
  ONBOARDING_FIRST_IDEAS_MODE,
  TIER_MODES,
  TIER_PRIVATE_FRAMEWORKS,
  ModeNotInPlanError,
  UnknownEntitlementTierError,
  assertModeAllowed,
  modeOffers,
  modeTiers,
  modesIncludedIn,
  planIncludesMode,
  privateFrameworkEntitlement,
  performanceLearningEntitlementFor,
  resolvePerformanceLearningEntitlement,
  trackedNicheEntitlement,
  type EntitlementTier,
  type ModeOffer,
  type PerformanceLearningEntitlement,
  type PerformanceLearningEntitlements,
} from "./mode-access";
// Slice 6: the composed generation.
// Slice 8c (R-98): the creator-submitted autopsy's money — priced from the
// active document, debited with the claim, refunded on park. Here rather than
// in `@respin/db` for the reason `createProfile` is: the tier, the price and
// the ledger are this package's, and `@respin/db` can see none of them.
export {
  PASTED_REFERENCE_CREDIT_COST_KEY,
  PASTED_REFERENCE_DEBIT_REF_TYPE,
  PASTED_REFERENCE_REFUND_REF_TYPE,
  PASTED_REFERENCE_TIERS,
  pastedReferenceIntakePort,
  pastedReferenceQuote,
  settleParkedAutopsies,
  submitPastedReference,
  type PastedReferenceQuote,
  type SettleParkedAutopsiesResult,
  type SubmitPastedReferenceResult,
} from "./pasted-reference";
export {
  generate,
  generationOp,
  hashRequest,
  GENERATION_REFUSAL_CODES,
  REVISION_CREDIT_COST_KEY,
  UNIVERSAL_LAWS,
  type GenerateParams,
  type GenerateResult,
  type GenerationRefusalCode,
} from "./generate";

// Phase 10a plan C2: the public Sample Spin (fixture, untrusted-idea boundary,
// metered orchestrator, enablement flag, pre-registered evaluation set).
export * from "./sample-spin";
