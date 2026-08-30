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
