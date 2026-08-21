// THE ONE PLACE app/** turns a typed package refusal into words on a page.
//
// Why a code map and not `err.message`:
//  - The package messages are written for the person debugging the system, and
//    several of them carry identifiers — `LedgerIntegrityError` names ledger
//    row uuids, `ClockSkewError` names two ISO instants. Those belong in the
//    server log, not in a creator's browser (billing/tenancy round-11 NOTE on
//    `customers.ts`, generalised: ids in the log, remedy in the message).
//  - Server actions redirect on failure, so the only channel back to the page
//    is the URL. Putting a MESSAGE there would let anyone hand a creator a link
//    that renders arbitrary text as if the product said it; a code cannot.
//
// The completeness of this map is ASSERTED, not promised: `tests/billing-ui.test.tsx`
// compares HANDLED_ERROR_CLASS_NAMES against every Error subclass exported by
// the two app-facing facades, so a class added to a facade without copy here
// fails the suite instead of degrading to "Something went wrong".
import {
  AlreadySubscribedError,
  AutoTopupCapError,
  BillingRoleError,
  CheckoutInFlightError,
  ClockSkewError,
  CustomerMappingLostError,
  InvoiceRecoveryUnavailableError,
  LedgerIntegrityError,
  NoLiveSubscriptionError,
  NoStripeCustomerError,
  NotChargeableError,
  NotPausedError,
  NotRecoverableError,
  PackPriceMismatchError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
  PauseLengthError,
  StripeNotConfiguredError,
  StripeSessionUrlMissingError,
  SubscriptionPausedError,
  UnknownTierPriceError,
} from "@respin/credits/app-server";
import { ConfigUnavailableError } from "@respin/config/app-server";
import { WorkspaceAccessError } from "@respin/db";

/**
 * The one refusal this layer OWNS rather than relays: Stripe Checkout needs
 * absolute return URLs, and guessing a host would send a paying customer to a
 * page that does not exist. Declared here (not in the actions file) because a
 * `"use server"` module may export only async functions.
 */
export class AppBaseUrlMissingError extends Error {
  constructor() {
    super("BETTER_AUTH_URL is not set; checkout return URLs cannot be built.");
    this.name = "AppBaseUrlMissingError";
  }
}

/**
 * Error classes defined in `app/**` rather than relayed from a package. The
 * completeness test allows exactly these beyond the facade surfaces.
 */
export const APP_LOCAL_ERROR_CLASS_NAMES = ["AppBaseUrlMissingError"];

export const BILLING_ERROR_CODES = [
  "app_base_url_missing",
  "already_subscribed",
  "checkout_in_flight",
  "not_owner",
  "no_stripe_customer",
  "no_live_subscription",
  "not_paused",
  "pause_length",
  "auto_topup_cap",
  "stripe_not_configured",
  "stripe_session_url_missing",
  "unknown_tier_price",
  "customer_mapping_lost",
  "ledger_integrity",
  "clock_skew",
  "config_unavailable",
  "workspace_access",
  // Audit 2026-08-17 remediation (R1).
  "subscription_paused",
  "not_chargeable",
  "pack_price_not_mapped",
  "pack_price_unavailable",
  "pack_price_mismatch",
  // Audit 2026-08-17 remediation (R2) — the `incomplete` remedy.
  "invoice_recovery_unavailable",
  "not_recoverable",
  "unknown",
] as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

type ErrorClass = { new (...args: never[]): Error; readonly name: string };

/** instanceof order matters only if classes ever subclass each other; none do. */
const HANDLERS: { cls: ErrorClass; code: BillingErrorCode }[] = [
  { cls: AppBaseUrlMissingError, code: "app_base_url_missing" },
  { cls: AlreadySubscribedError, code: "already_subscribed" },
  { cls: CheckoutInFlightError, code: "checkout_in_flight" },
  { cls: BillingRoleError, code: "not_owner" },
  { cls: NoStripeCustomerError, code: "no_stripe_customer" },
  { cls: NoLiveSubscriptionError, code: "no_live_subscription" },
  { cls: NotPausedError, code: "not_paused" },
  { cls: PauseLengthError, code: "pause_length" },
  { cls: AutoTopupCapError, code: "auto_topup_cap" },
  { cls: StripeNotConfiguredError, code: "stripe_not_configured" },
  { cls: StripeSessionUrlMissingError, code: "stripe_session_url_missing" },
  { cls: UnknownTierPriceError, code: "unknown_tier_price" },
  { cls: CustomerMappingLostError, code: "customer_mapping_lost" },
  { cls: LedgerIntegrityError, code: "ledger_integrity" },
  { cls: ClockSkewError, code: "clock_skew" },
  { cls: ConfigUnavailableError, code: "config_unavailable" },
  { cls: WorkspaceAccessError, code: "workspace_access" },
  { cls: SubscriptionPausedError, code: "subscription_paused" },
  { cls: NotChargeableError, code: "not_chargeable" },
  { cls: PackPriceNotMappedError, code: "pack_price_not_mapped" },
  { cls: PackPriceUnavailableError, code: "pack_price_unavailable" },
  { cls: PackPriceMismatchError, code: "pack_price_mismatch" },
  { cls: InvoiceRecoveryUnavailableError, code: "invoice_recovery_unavailable" },
  { cls: NotRecoverableError, code: "not_recoverable" },
];

/** The class names this module claims to handle (read by the completeness test). */
export const HANDLED_ERROR_CLASS_NAMES: string[] = HANDLERS.map(
  (h) => h.cls.name
);

export type BillingErrorCopy = { title: string; detail: string };

/**
 * Every message names what happened and what the reader can DO. Where the
 * remedy belongs to an operator rather than a creator (a missing key, a broken
 * ledger), it says so plainly instead of offering a button that cannot help —
 * a refusal whose printed remedy is not an action the reader may take is the
 * failure mode CLAUDE.md's 2026-07-30 lesson is about.
 */
export const BILLING_ERROR_COPY: Record<BillingErrorCode, BillingErrorCopy> = {
  app_base_url_missing: {
    title: "This server does not know its own address",
    detail:
      "Checkout needs an absolute address to send you back to, and rather than guess one the action stopped. Nothing was charged. An operator needs to set BETTER_AUTH_URL in respin/.env.local (for local development that is http://localhost:3000) and restart the app.",
  },
  already_subscribed: {
    title: "This workspace already has a subscription",
    detail:
      "Starting a second checkout would create a second Stripe subscription and bill you twice, so it was refused. Change or cancel your plan in the Customer Portal instead. If your first payment never completed, Stripe emailed an invoice you can still pay — or wait about a day for that attempt to expire and start again.",
  },
  checkout_in_flight: {
    title: "A checkout is already open for this workspace",
    detail:
      "Finish the checkout you already started, or leave it — an abandoned checkout lapses within 24 hours and you can pick a different plan then. Nothing has been charged.",
  },
  not_owner: {
    title: "Only the workspace owner can change billing",
    detail:
      "Ask the owner of this workspace to make the change. Nothing was modified.",
  },
  no_stripe_customer: {
    title: "This workspace has no billing account yet",
    detail:
      "A billing account is created the first time you subscribe or buy a credit pack. Start there, then the Customer Portal becomes available.",
  },
  no_live_subscription: {
    title: "No live subscription",
    detail:
      "This action needs a subscription that still exists in Stripe. A cancelled subscription cannot be reused — subscribe again to continue.",
  },
  not_paused: {
    title: "Nothing to resume",
    detail:
      "This workspace has no paused subscription. If you paused moments ago, the pause is recorded when Stripe confirms it — reload and try again.",
  },
  pause_length: {
    title: "That pause length is not allowed",
    detail:
      "Choose a whole number of months inside the range shown on the pause form.",
  },
  auto_topup_cap: {
    title: "Auto-top-up needs a monthly cap",
    detail:
      "Enter the most you are willing to be charged in a calendar month, as a positive amount. Auto-top-up stays off until a cap is set.",
  },
  stripe_not_configured: {
    title: "Billing is not configured on this server",
    detail:
      "No Stripe key is set, so no billing action can run. An operator needs to put STRIPE_SECRET_KEY in respin/.env.local (see respin/env.example), run `pnpm stripe:setup`, and paste the printed price ids into /admin/config.",
  },
  stripe_session_url_missing: {
    title: "Stripe returned something we did not expect",
    detail:
      "Nothing was charged. Try again; if it keeps happening, an operator should compare the checkout session in the Stripe dashboard against the API version this app is pinned to.",
  },
  unknown_tier_price: {
    title: "No Stripe price is mapped for that plan",
    detail:
      "This install has not been finished. An operator needs to run `pnpm stripe:setup` and paste the printed price ids into /admin/config as `stripePriceMap`.",
  },
  customer_mapping_lost: {
    title: "This workspace's billing record is no longer there",
    detail:
      "Nothing was charged. This usually means the workspace was deleted while the page was open. Reload; if the workspace still exists, try again. The ids an operator needs to tidy up in Stripe are in the server log.",
  },
  ledger_integrity: {
    title: "Your credit history could not be read",
    detail:
      "This will not fix itself on a retry, and it is not something you can correct from here — the details are in the server log. Nothing was charged and no credits were spent. Please contact support.",
  },
  clock_skew: {
    title: "The server clock and the database clock disagree",
    detail:
      "The action was refused rather than recorded at the wrong time. Nothing was charged. This is an operator problem — the details are in the server log.",
  },
  config_unavailable: {
    title: "Runtime configuration is missing or invalid",
    detail:
      "Prices, allowances and credit costs all come from a versioned config row, and this server has none it can read — so nothing is being guessed. An operator needs to seed the database (`pnpm db:seed`) or append a valid version at /admin/config.",
  },
  workspace_access: {
    title: "You do not have access to this workspace",
    detail:
      "Sign in with the account that owns it, or ask its owner for access. Nothing was modified.",
  },
  // Audit 2026-08-17 remediation (R1). Each names what happened AND what the
  // reader can do — and where the remedy belongs to an operator rather than a
  // creator, it says so instead of offering a button that cannot help.
  subscription_paused: {
    title: "Your subscription is paused",
    detail:
      "A pause means no charges, so this was refused before anything reached Stripe — nothing was charged. Resume your subscription from this page and then try again. Your existing credits are frozen, not lost.",
  },
  not_chargeable: {
    title: "There is an unpaid invoice on this subscription",
    detail:
      "Stripe has stopped collecting on this subscription, so we will not attempt an automatic charge against it. Nothing was charged. Open the Customer Portal and settle the outstanding invoice — the subscription can still be recovered — and this becomes available again.",
  },
  pack_price_not_mapped: {
    title: "Credit packs are not set up on this server",
    detail:
      "No Stripe price is mapped for the credit pack, so there is nothing to charge. Nothing was charged. An operator needs to run `pnpm stripe:setup` and paste the printed price ids into /admin/config as `stripePriceMap`.",
  },
  pack_price_unavailable: {
    title: "The credit-pack price cannot be charged",
    detail:
      "Stripe has the pack price in a state a charge cannot be built from — archived, or with no fixed amount, or in the wrong currency. Nothing was charged. An operator needs to check the pack price in the Stripe dashboard; the details are in the server log.",
  },
  pack_price_mismatch: {
    title: "The credit-pack price does not match this server's configuration",
    detail:
      "Stripe and the app disagree about what a pack costs, so the charge was refused rather than guessing which price is right — nothing was charged, and you have not been billed twice. This is an operator problem: both amounts are named in the server log, and /admin/config is where the app's figure is corrected.",
  },
  // Audit 2026-08-17 remediation (R2) — the `incomplete` remedy's two refusals.
  invoice_recovery_unavailable: {
    title: "There is no invoice left to pay",
    detail:
      "Nothing was charged. Reload this page: if your payment has since gone through your plan is already active, and if the attempt has lapsed (Stripe expires an unpaid first invoice after about a day) you can start a new plan from here.",
  },
  not_recoverable: {
    title: "That is not the right fix for this subscription",
    detail:
      "Paying a one-off invoice only helps a subscription whose FIRST payment never completed. Nothing was charged. Update your card in the Customer Portal instead — that is what recovers a subscription whose renewal failed.",
  },
  unknown: {
    title: "Something went wrong",
    detail:
      "The action did not complete and nothing was charged. Try again; if it keeps happening, the details are in the server log.",
  },
};

export function billingErrorCode(err: unknown): BillingErrorCode {
  for (const h of HANDLERS) {
    if (err instanceof h.cls) return h.code;
  }
  return "unknown";
}

export function isBillingErrorCode(
  value: string | undefined | null
): value is BillingErrorCode {
  return (
    typeof value === "string" &&
    (BILLING_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Copy for a caught error — never the error's own message (see the header). */
export function billingErrorDisplay(err: unknown): BillingErrorCopy & {
  code: BillingErrorCode;
} {
  const code = billingErrorCode(err);
  return { code, ...BILLING_ERROR_COPY[code] };
}

/** Copy for a `?e=` code carried back from a server action's redirect. */
export function billingErrorFromCode(
  value: string | undefined | null
): (BillingErrorCopy & { code: BillingErrorCode }) | null {
  if (value === undefined || value === null || value === "") return null;
  const code: BillingErrorCode = isBillingErrorCode(value) ? value : "unknown";
  return { code, ...BILLING_ERROR_COPY[code] };
}
