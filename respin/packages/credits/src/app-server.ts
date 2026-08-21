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
import { ClockSkewError } from "./errors";
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
};
export type { BalanceView, BillingState, CheckoutUrls };

export const respinCredits = {
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
