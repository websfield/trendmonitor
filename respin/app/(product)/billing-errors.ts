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
import {
  BrainReasonError,
  BrainRoleError,
  ClaimWalkError,
  ContentSchemaError,
  ContentWalkError,
  KindNotYetWritableError,
  SchemaShapeError,
  SegmenterUnavailableError,
  ProfileAccessError,
  ProvenanceError,
  ScopeForgeryError,
  UsageRawError,
  WorkspaceAccessError,
  WorkspacePausedError,
} from "@respin/db";

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
  // M2a. `WorkspacePausedError` MOVED from @respin/credits to @respin/db, and
  // moving it deleted its last mention in any suite — `facade-errors.test.ts`
  // follows relative imports only, and @respin/db's errors were enumerated by
  // nobody. Without this entry the pause refusal renders as "Something went
  // wrong", which is the exact outcome the move was justified by avoiding.
  // The completeness test now enumerates @respin/db too, so this cannot
  // silently regress again.
  "workspace_paused",
  "profile_access",
  "provenance",
  "scope_forgery",
  "usage_raw",
  // M2b-1. `brain-content.ts` and `echo.ts` reached a deployed process for the
  // first time when @respin/db's index exported them, and the completeness
  // test above is what turned that into a demand for copy — which is the whole
  // reason it enumerates the WHOLE root export rather than the eslint
  // allowlist. Until then these seven refusals would have rendered as
  // "Something went wrong".
  "brain_content_schema",
  "brain_kind_not_writable",
  "brain_schema_shape",
  "brain_claim_walk",
  "brain_content_walk",
  "brain_reason",
  "brain_role",
  "segmenter_unavailable",
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
  { cls: WorkspacePausedError, code: "workspace_paused" },
  { cls: ProfileAccessError, code: "profile_access" },
  { cls: ProvenanceError, code: "provenance" },
  { cls: ScopeForgeryError, code: "scope_forgery" },
  { cls: UsageRawError, code: "usage_raw" },
  { cls: ContentSchemaError, code: "brain_content_schema" },
  { cls: KindNotYetWritableError, code: "brain_kind_not_writable" },
  { cls: SchemaShapeError, code: "brain_schema_shape" },
  { cls: ClaimWalkError, code: "brain_claim_walk" },
  { cls: ContentWalkError, code: "brain_content_walk" },
  { cls: BrainReasonError, code: "brain_reason" },
  { cls: BrainRoleError, code: "brain_role" },
  { cls: SegmenterUnavailableError, code: "segmenter_unavailable" },
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
  // M2a — the four typed refusals @respin/db owns.
  workspace_paused: {
    title: "This workspace is paused",
    detail:
      "While a pause is on, credits are frozen and nothing that would spend them runs — including building or updating a creator brain. Nothing was charged and nothing was lost: your credits and your existing brain are exactly where you left them. Resume from the billing page and this becomes available again.",
  },
  profile_access: {
    title: "That creator profile is not available here",
    detail:
      "It either does not exist or belongs to a different workspace, and this page will not say which — that distinction would let anyone probe for other people's profiles. Nothing was changed. If it should be here, ask the workspace owner to check the profile list.",
  },
  provenance: {
    title: "A quoted line did not match your own words",
    detail:
      "Every claim in a brain has to point at something you actually wrote, and one of the quotes did not appear where it said it did — so it was refused rather than stored. Nothing was saved and no credits were spent. Try the build again; if it keeps happening, the details are in the server log.",
  },
  scope_forgery: {
    title: "The action was refused before it touched any data",
    detail:
      "A safety check that guards which workspace and which profile an action may reach did not pass. That is never something you can cause by using the product normally, so it means a bug rather than a mistake on your part. Nothing was read and nothing was written; the details are in the server log. Please contact support.",
  },
  usage_raw: {
    title: "The action was refused before anything was recorded",
    detail:
      "A safety check on what may be stored alongside a usage record did not pass, so nothing was written. Nothing you typed was lost and no credits were spent. This is never something you can cause by using the product normally, so it means a bug rather than a mistake on your part; the details are in the server log. Please contact support.",
  },
  brain_content_schema: {
    title: "That brain document did not match its shape",
    detail:
      "A brain document has a fixed set of fields so that every claim about you is one you can confirm or correct individually, and this one carried a field outside that set — so it was refused rather than stored. Nothing was saved and no credits were spent. Try building the document again; if it keeps happening the shape needs widening, which is a code change, and the details are in the server log.",
  },
  brain_kind_not_writable: {
    title: "This part of your brain is not written from onboarding",
    detail:
      "Your performance notes are written from results you have actually logged and verified, never inferred from the material you uploaded — inferring them now would be a claim about how your content performs with no result behind it. Nothing was saved. Log some results first and this document gets written from them.",
  },
  brain_schema_shape: {
    title: "The brain document shapes are misconfigured",
    detail:
      "A safety check that runs when the server starts found a brain-document shape that would let a claim be stored without a way for you to confirm it. This is never something you can cause by using the product; it means a bug. An operator needs to look at the server log, which names the exact field.",
  },
  brain_claim_walk: {
    title: "The action was refused before anything was stored",
    detail:
      "The server could not agree with itself about which parts of a brain document are claims you would need to confirm, so it refused rather than storing a document you could not fully review. Nothing was saved and no credits were spent. The details are in the server log; please contact support if it keeps happening.",
  },
  brain_content_walk: {
    title: "That document was too deeply nested to check",
    detail:
      "Before a brain document is stored it is checked line by line against the reference posts you have uploaded, and this one was structured too deeply for that check to finish — so it was refused rather than stored unchecked. Nothing was saved. Try again with a simpler structure; the details are in the server log.",
  },
  brain_reason: {
    title: "The action was refused before anything was stored",
    detail:
      "Every version of your brain records why it exists, and the reason is chosen from a fixed set rather than written as free text, so that a stored reason can never contain a detail nobody verified. This request carried something outside that set. Nothing was saved and no credits were spent; the details are in the server log.",
  },
  brain_role: {
    title: "Your role cannot confirm or activate this",
    detail:
      "Confirming a brain document, and activating a version of it, are the two acts that decide what the product believes about this creator and then acts on — so they need at least editor access, and you are a viewer. Nothing was changed. Ask a workspace owner to make the change, or to raise your role in workspace settings.",
  },
  segmenter_unavailable: {
    title: "This server cannot run the reference check",
    detail:
      "The check that stops your brain from repeating somebody else's post needs full language support in the server runtime, and it is not available here — so rather than run a weakened version of that check, the action stopped. Nothing was saved. An operator needs to run the app on a Node build with full ICU (full-icu) and restart it.",
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
