// @respin/credits public surface (M1 phase 2). Sole writer of credit_ledger /
// pause_periods / (with Phase 3) subscriptions + stripe_events. All ops are
// TxLike-composable; balance has ONE authority (deriveBalance/deriveBalanceInTx).
export {
  InsufficientCreditsError,
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
