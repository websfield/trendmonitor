// @respin/credits public surface (M1 phase 2). Sole writer of credit_ledger /
// pause_periods / (with Phase 3) subscriptions + stripe_events. All ops are
// TxLike-composable; balance has ONE authority (deriveBalance/deriveBalanceInTx).
export {
  BrainPointerDivergenceError,
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
  UnpricedOperationError,
  // Billing gate round 2: the one sentence a WINDOWED cap owes its reader,
  // shared with `app/(product)/billing-errors.ts` through app-server.ts so the
  // package message and the creator-facing copy cannot say different things
  // about whether the refusal clears itself.
  UNCHARGED_CAP_WINDOW_CLAUSE,
} from "./errors";
export { LedgerIntegrityError, foldLedger, effectiveExpiry } from "./fold";
export type { FoldResult, LotView } from "./fold";
export { deriveBalance, deriveBalanceInTx, type BalanceView } from "./balance";
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
// Slice 6, R17: the Free mint's two period functions. Exported so the period
// key and the no-rollover expiry can be asserted directly rather than inferred
// from a stored row — the mint itself has no export, because `deriveBalance`
// is the only thing that may run it.
export { freeAllowanceExpiry, freeAllowancePeriodKey } from "./balance";
// Slice 6, R18: the first tier->feature gate. `TIER_MODES` is exported so a
// test can drive the map against ALL SEVEN mode ids rather than the one that
// is built — with one implemented mode a map and an `if` are behaviourally
// identical, and slice 7 is where the difference shows.
export {
  TIER_MODES,
  ModeNotBuiltYetError,
  ModeNotInPlanError,
  assertModeAllowed,
  planIncludesMode,
  type EntitlementTier,
} from "./mode-access";
// Slice 6: the composed generation.
export {
  generate,
  hashRequest,
  GENERATION_REFUSAL_CODES,
  UNIVERSAL_LAWS,
  type GenerateParams,
  type GenerateResult,
  type GenerationRefusalCode,
} from "./generate";
