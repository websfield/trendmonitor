// Webhook dispatch (D-M1-1 single transaction, D-M1-6 sole-authority identity).
// One tx = handler writes + the stripe_events row + processed-mark; a failed
// handler rolls EVERYTHING back (non-2xx → Stripe redelivers; no stale
// in-flight row can exist). A concurrent duplicate blocks on the PK, then
// conflicts after the winner commits → DuplicateStripeEvent (→ 200).
// Refusal log lines carry event id + outcome only — NEVER payloads.
// This file is a sanctioned trustWorkspaceId import site (webhook resolution).
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  creditLedger,
  stripeEvents,
  subscriptions,
  workspaces,
  type DbLike,
  type TxLike,
  type VerifiedWorkspaceId,
  AUTO_TOPUP_DISARMED_FIELDS,
  erasedWorkspaceOperationIdInTx,
  stripeMoneyAmount,
  trustWorkspaceId,
  type HeldMoneyReplaySummary,
} from "@respin/db";
import { getActiveConfig } from "@respin/config";
import type Stripe from "stripe";
import { CLOCK_SKEW_MS, getDbNow, takeWorkspaceLockInOrder } from "../clock";
import { addMonthsUtc } from "../months";
import {
  hasLiveStripeSubscription,
  IRREVERSIBLE_STATUSES,
  TERMINAL_STATUSES,
} from "../state";
import { grantCredits, purchasePackCredits } from "../ledger";
import {
  clearPauseMirror,
  ensurePauseEnded,
  ensurePauseStarted,
  openPauseStartedKnownAt,
} from "../pause";
import { workspaceForCustomer } from "./customers";
import {
  assertTierCheckoutProtocolRecoveryReady,
  getTierCheckoutProtocolState,
} from "./tier-checkout-rollout";
import {
  AutoTopupAttemptIntegrityError,
  bindPendingAutoTopupPaymentIntent,
  clearPendingAutoTopupAttempt,
  pendingAutoTopupAttempt,
} from "./auto-topup";
import { verifyAutoTopupAuthority } from "./auto-topup-authority";
import { assertAutoTopupProtocolRecoveryReady } from "./auto-topup-rollout";
import {
  getAuthenticatedStripeAccountIdentity,
  getStripe,
  STRIPE_MAX_CALL_WINDOW_MS,
} from "./adapter";
import { verifyPackCheckoutAuthority } from "./pack-checkout-authority";
import {
  verifyTierCheckoutAuthority,
} from "./tier-checkout-authority";
import {
  hasTierInvoiceAuthorityMetadata,
  tierInvoiceAuthorityMetadata,
  tierInvoiceAuthorityMetadataFromProvider,
  verifyTierInvoiceAuthority,
  type TierInvoiceAuthority,
} from "./tier-invoice-authority";

/** The stored vocabulary — matches the stripe_events_outcome CHECK exactly. */
export type StripeEventOutcome =
  | "processed"
  | "refused_unknown_customer"
  | "refused_identity_mismatch"
  | "ignored"
  // R-165 (migration 0064): money on a tombstoned workspace, held for replay.
  // The ONE non-final outcome; `replayHeldStripeEvents` is its only settler.
  | "held_tombstoned"
  // R-165 (0065): a held receipt whose workspace was ERASED — the durable
  // refund-owed record, written only by the erasure transaction.
  | "refund_owed";

/**
 * THE MONEY-BEARING EVENTS (R-165) — the types whose handlers below reach a
 * mint, as a LIST (Respin rule 7), with the predicate each one's handler uses
 * to decide that THIS event carries money. A sixth mint site is an edit here
 * (and in audit Phase 4's pause gate on the same five sites, when it lands),
 * never an automatic inclusion:
 *   - `checkout.session.completed` / `checkout.session.async_payment_succeeded`
 *     — the pack branch (`mode === "payment"`, `respin_kind === "pack"`,
 *     `payment_status === "paid"`); both settle the same session;
 *   - `invoice.paid` — the allowance grant (renewal, first invoice);
 *   - `payment_intent.succeeded` — auto-top-up (`respin_kind === "auto_topup"`).
 */
export const HELD_MONEY_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "payment_intent.succeeded",
] as const;

export function isHeldMoneyEvent(event: Stripe.Event): boolean {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      return (
        session.mode === "payment" &&
        session.metadata?.respin_kind === "pack" &&
        session.payment_status === "paid"
      );
    }
    case "invoice.paid":
      return true;
    case "payment_intent.succeeded":
      return (event.data.object as Stripe.PaymentIntent).metadata?.respin_kind === "auto_topup";
    default:
      return false;
  }
}

export type StripeEventHandlingOptions = Readonly<{ recovery?: boolean }>;

type StripeReceiptContext = {
  tierInvoiceAuthority: Record<string, string> | null;
};

function stringRecordOrNull(value: unknown): Record<string, string> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
    ? (value as Record<string, string>)
    : null;
}

export class DuplicateStripeEvent extends Error {
  constructor(
    public readonly eventId: string,
    public readonly tierInvoiceAuthority: Record<string, string> | null = null,
    public readonly receiptOutcome: StripeEventOutcome | null = null,
    public readonly receiptWorkspaceId: string | null = null,
    public readonly storedTierInvoiceAuthority: Record<string, string> | null = null
  ) {
    super(`Stripe event ${eventId} already has a final outcome`);
    this.name = "DuplicateStripeEvent";
  }
}

// Only these two constraints mean "already processed". ANY other unique
// violation is a real error that must reach the route as a 500 so Stripe
// redelivers — collapsing them all into a 200 silently discards events
// (code-review BLOCK: pause_periods_open_uq / subscriptions_subscription_uq /
// credit_ledger_expiry_lot_uq are all reachable 23505s).
const IDEMPOTENCY_CONSTRAINTS = ["stripe_events_pkey", "credit_ledger_stripe_event_uq"];

// Invoices that carry a service period and therefore a monthly allowance.
const GRANT_BILLING_REASONS = new Set(["subscription_create", "subscription_cycle"]);
// Subscription statuses whose arrival should clear nothing but stale grace.
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const CLEAR_TIER_CHECKOUT_ATTEMPT = {
  tierCheckoutAttemptId: null,
  tierCheckoutAttemptTier: null,
  tierCheckoutAttemptPriceId: null,
  tierCheckoutAttemptCustomerId: null,
  tierCheckoutAttemptSubscriptionGeneration: null,
  tierCheckoutAttemptIdempotencyKey: null,
  tierCheckoutAttemptSessionId: null,
  tierCheckoutAttemptSubscriptionId: null,
  tierCheckoutAttemptStripeAccountId: null,
  tierCheckoutAttemptStripeLivemode: null,
  tierCheckoutAttemptAuthority: null,
  tierCheckoutAttemptReservedAt: null,
} as const;
const CLEAR_TIER_CHECKOUT_FENCE = {
  tierCheckoutFenceAt: null,
  tierCheckoutFenceSubscriptionId: null,
  tierCheckoutFenceStatus: null,
  tierCheckoutFenceObservedSubscriptionId: null,
} as const;
// End states. A subscription in one of these is DEAD: no invoice, however
// late, may lift it back to a paid tier (code-review BLOCK — resurrection).
// MOVED to state.ts (audit 2026-08-17 #6): it was defined here while its
// sibling IRREVERSIBLE_STATUSES lived in state.ts, so "dead" had two
// half-definitions in two files and `auto-topup.ts` — which needed THIS one —
// imported the other. Both now come from state.ts, the one place that owns the
// mirror's vocabulary.
// IRREVERSIBLE_STATUSES (imported from state.ts, the ONE definition) is the
// subset used by the subscription-mirror guard. `unpaid` belongs in
// TERMINAL_STATUSES above — no invoice may lift it back to a paid tier — but it
// is NOT irreversible on the subscription itself: the installed SDK says of it
// "After receiving updated payment information from a customer, you may choose
// to reopen and pay their closed invoices" (stripe@22.5.0 Subscriptions.d.ts).
// Using the full terminal set on the mirror writer made an `unpaid` workspace
// unrecoverable by ANY event, which is a worse failure than the resurrection
// the guard exists to stop (billing round-5 CHANGE). Cancellation and expiry
// really are one-way; dunning is not.

/**
 * Resolve the Stripe customer id for ANY event class. For `customer.*` events
 * the object IS the customer (it has no `customer` field) — missing that made
 * those events unattributable, dropping resolvable creator PII out of the
 * REQ-A04 deletion cascade (code-review BLOCK).
 */
function customerIdOf(event: Stripe.Event): string | null {
  const obj = event.data.object as {
    object?: string;
    id?: string;
    customer?: unknown;
  };
  if (obj.object === "customer") {
    return typeof obj.id === "string" ? obj.id : null;
  }
  if (typeof obj.customer === "string") return obj.customer;
  // An expanded customer object on a non-customer event.
  const expanded = obj.customer as { id?: string } | null | undefined;
  return typeof expanded?.id === "string" ? expanded.id : null;
}

function objectId(value: { id: string } | string | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export type StripeReceiptAttribution =
  | "workspace_attributed"
  | "customer_attributed"
  | "unattributed";

/** Classify only receipt-time facts; later FK detachment never reclassifies. */
export function classifyStripeReceiptAttribution(
  workspaceId: string | null,
  customerId: string | null,
): StripeReceiptAttribution {
  if (workspaceId !== null) {
    if (customerId === null) {
      throw new Error("a workspace-attributed Stripe receipt must name its customer");
    }
    return "workspace_attributed";
  }
  return customerId === null ? "unattributed" : "customer_attributed";
}

/**
 * The RECURRING subscription line items — the authority for BOTH service
 * period and price. Never `lines.data[0]`, and never merely "the first
 * subscription line".
 *
 * This selector has been wrong twice, the same way each time, so the reasoning
 * is written down. `invoice.period_end` is not the service period (SDK: "the
 * latest timestamp at which invoice items can be associated with this
 * invoice"). Position is not the discriminator either — the SDK documents
 * `lines` as sorted with pending invoice items INCLUDING PRORATIONS first. And
 * `parent.type === "subscription_item_details"` is STILL not enough, because a
 * subscription proration is exactly that shape: the installed SDK gives
 * `Parent.SubscriptionItemDetails` its own `proration: boolean`, and
 * Invoices.d.ts says the recommended way to find prorations is to look for
 * line items where `parent.subscription_item_details.proration` is true. So on
 * the renewal after any portal plan switch, a proration-blind selector still
 * priced the allowance and the expiry off the wrong line (code-review BLOCK,
 * three rounds running).
 *
 * Returns ALL matches so the caller can fail closed on an ambiguous invoice
 * rather than silently picking one — an M1 subscription has exactly one item.
 */
function subscriptionLinesOf(invoice: Stripe.Invoice): Stripe.InvoiceLineItem[] {
  return (invoice.lines?.data ?? []).filter(
    (l) =>
      l.parent?.type === "subscription_item_details" &&
      l.parent.subscription_item_details?.proration !== true
  );
}

/**
 * The fields a DEAD subscription must leave behind — applied by EVERY writer
 * that lands an irreversible status, not just by `customer.subscription.deleted`
 * (billing round-7 CHANGE 1 + NOTE 1; CLAUDE.md 2026-07-30 "fix the class, not
 * the field"). A dead subscription emits no further events, so whatever this
 * row says after it dies is what every later reader inherits forever:
 *
 *  - `cancelAtPeriodEnd`: the installed SDK documents this as "whether this
 *    subscription will (if status=active) or DID (if status=canceled) cancel at
 *    the end of the current billing period" (stripe@22.5.0
 *    resources/Subscriptions.d.ts) — so a trailing `customer.subscription.
 *    updated` carrying `{status: canceled, cancel_at_period_end: true}` is a
 *    REAL payload shape, and mirroring it verbatim re-wrote the flag the
 *    `deleted` branch had just cleared, seconds later. Phase 4's billing UI is
 *    the next reader.
 *  - `graceExpiresAt`: a stale dunning deadline on a dead subscription was the
 *    trigger a late `invoice.paid` used to revive on.
 *  - `autoTopupV1Enabled` / `autoTopupMonthlyCapCents`: an off-session charging
 *    authority. Left armed, a workspace that cancelled still had M3's debit
 *    site able to charge it a $10 pack. Stated consequence, deliberately the
 *    safe direction: the opt-in does not survive a cancellation — a
 *    re-subscribing owner opts in again.
 */
const DEAD_SUBSCRIPTION_FIELDS = {
  cancelAtPeriodEnd: false,
  // Same reasoning as the boolean, for the field the PORTAL actually sets
  // (evidence-run finding 1): a dead subscription has no future cancellation
  // date, and whatever this row says after it dies is inherited forever.
  cancelAt: null,
  graceExpiresAt: null,
  // THE EPISODE ENDS WITH THE SUBSCRIPTION (audit P3-R4, R-159): a dead
  // subscription has no unpaid episode, and a marker left behind would make a
  // re-subscribed workspace's first failure look like a continuation.
  dunningStartedAt: null,
  // The auto-top-up charge authority, shared with the deletion executor's
  // fence (Phase 10b-1 Task 4, round-1 billing BLOCK): one set, two sites.
  ...AUTO_TOPUP_DISARMED_FIELDS,
  // The stale PAID TIER (audit 2026-08-17 #5). Tier is derived at READ time
  // from this column × the active config's `stripePriceMap` (state.ts), so a
  // dead subscription that keeps its price id keeps answering "creator" to
  // every later reader. It is cleared for the same reason as every field above
  // it: a dead subscription emits no further events, so whatever this row says
  // at death is what every reader inherits forever. `getWorkspaceBillingState`
  // already returns free for a dead status, so this changes no rendered state
  // today — it removes the stale VALUE that the #5 drift path was reading
  // around that status check.
  stripePriceId: null,
} as const;
//
// NOT in the object above, deliberately, and this is the interesting half of
// audit #5: `pausedAt` / `resumesAt` are ALSO stale-on-death, but they are the
// two columns `pause.ts` declares itself the sole writer of ("Phase 3 must
// NEVER write subscriptions.pausedAt directly; always go through here" — the
// DUAL-TRUTH rule, because pause truth lives in `pause_periods` AND this
// mirror and they stay consistent only because one module writes both). Adding
// them here would have satisfied the audit's literal wording by breaking the
// invariant that keeps the two truths in sync.
//
// So the death writers below call `ensurePauseEnded` (which closes an open
// period and clears the mirror through `recordPauseEnd`) and then
// `clearPauseMirror`, which converges the mirror when NO period is open — the
// exact drift state #5 describes, and a function that already existed for the
// owner's resume path. `clearPauseMirror` refuses while a pause is genuinely
// open, so the pair cannot desynchronise the two truths in either direction.

// The deadline-LIVENESS predicates billing rounds 6 and 7 added were RETIRED by
// audit P3-R4 (R-159). Their only two callers were the deadline writers below,
// and both now gate on the episode marker instead: a deadline's liveness cannot
// tell "a second failure in the same unpaid episode" from "a new episode",
// which is how a lapsed deadline re-opened grace (REG-3). Round 7's case — a
// recovery seen only as `subscription.updated -> active` leaving a stale
// deadline behind for the next episode — is now `dunningEndedBy`'s clear.

/**
 * THE EPISODE RULE (audit P3-R4, decisions R-159): an open episode never
 * receives a new deadline; a NULL marker opens one.
 *
 * Deadline liveness was REG-3's defect: a second `invoice.payment_failed`
 * inside one unpaid episode, arriving after the first deadline lapsed, read
 * the lapsed deadline as "no episode" and opened a fresh window — so a
 * non-payer stayed on the paid tier for as long as failures kept arriving. The
 * marker (`subscriptions.dunning_started_at`) is the episode's identity.
 *
 * THE POPULATION, by list (CLAUDE.md rule 7) — every site in this file that
 * writes or clears the marker:
 *   (1) `customer.subscription.updated` — opens on `past_due` with a NULL
 *       marker; clears on `active` only when the event is NEWER than the
 *       marker (`dunningEndedBy`);
 *   (2) `invoice.payment_failed` — opens on a NULL marker, otherwise writes
 *       `past_due` alone;
 *   (3) `invoice.paid` — clears it with the deadline;
 *   (4) `DEAD_SUBSCRIPTION_FIELDS` — every death writer clears it.
 */
function opensDunningEpisode(
  mirror: { dunningStartedAt: Date | null } | undefined
): boolean {
  return (mirror?.dunningStartedAt ?? null) === null;
}

/**
 * Does this `active` snapshot end the open episode? Only when it is NEWER than
 * the episode's own start (Stripe's clock on both sides). An OLDER `active`
 * snapshot — the round-6 hazard — fails the comparison and leaves the marker
 * and the deadline standing.
 */
function dunningEndedBy(
  status: string,
  eventAt: Date,
  mirror: { dunningStartedAt: Date | null } | undefined
): boolean {
  const started = mirror?.dunningStartedAt ?? null;
  return (
    status === "active" &&
    started !== null &&
    eventAt.getTime() > started.getTime()
  );
}

/** Did a SUBSCRIPTION generate this invoice? One-off invoices never touch the mirror. */
function isSubscriptionInvoice(invoice: Stripe.Invoice): boolean {
  return invoice.parent?.subscription_details != null;
}

/**
 * WHICH subscription generated this invoice (audit 2026-08-17 #4).
 *
 * Verified against the installed SDK rather than recalled (golden rule 9):
 * `stripe@22.5.0` types `Invoice.Parent.SubscriptionDetails.subscription` as
 * `string | Subscription` — "The subscription that generated this invoice" —
 * so both the id and the expanded-object shapes are real and both are handled,
 * exactly as `customerIdOf` and the checkout branch already do for their own
 * dual-shape fields.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (typeof sub === "string") return sub;
  return typeof sub === "object" && sub !== null && typeof sub.id === "string"
    ? sub.id
    : null;
}

/**
 * May an invoice event write to the mirror it resolved to? — the SUBSCRIPTION
 * IDENTITY check, which is not the same question as `invoiceMayWriteStatus`'s
 * TERMINAL/ORDER check and was missing entirely (audit 2026-08-17 #4).
 *
 * Both invoice handlers resolved their mirror by `eq(subscriptions.workspaceId,
 * workspaceId)` alone — the workspace is right, but nothing asked whether the
 * invoice came from the subscription the mirror is currently BOUND to. A
 * workspace that cancels and re-subscribes has one mirror row pointing at the
 * NEW subscription; a late-arriving invoice event belonging to the OLD, dead one
 * had no id check stopping it from granting that new subscription's allowance
 * or pushing it into dunning.
 *
 * This is the same defect CLASS the M1 review already found and fixed once, for
 * checkout events ("a resurrection hazard where a re-subscribe checkout event
 * could permanently orphan the mirror onto a dead subscription id", round 5b) —
 * the fix simply never extended to the invoice handlers. CLAUDE.md's 2026-07-30
 * lesson is exactly this shape: fix the class, not the field.
 *
 * ONE case is deliberately allowed through, and it is not a weakening: a mirror
 * with `stripeSubscriptionId === null` has nothing to compare against. That is
 * the legitimate first-invoice-before-the-snapshot ordering, which the evidence
 * run OBSERVED live (`invoice.paid` at 23:36:48.738 arriving BEFORE
 * `customer.subscription.created` at 23:36:49.106 — ledger.md). Refusing it
 * would break the ordinary subscribe flow on real Stripe delivery order.
 */
function invoiceMatchesMirror(
  invoiceSubId: string,
  mirrorSubId: string | null
): boolean {
  if (mirrorSubId === null) return true;
  return invoiceSubId === mirrorSubId;
}

/**
 * D-AUDIT-1 (audit 2026-08-17 #2) — may a grant-bearing `invoice.paid` mint the
 * monthly allowance given the workspace's pause state?
 *
 * REQ-G08 (PRD §4G, "Must"): "While paused: no charges, no monthly grants."
 * This handler had NO pause check, and `stripe.test.ts` carried a test titled
 * "invoice.paid arriving while mirror-paused is PROCESSED… never dropped" that
 * asserted the grant lands — so the requirement was not merely unenforced, a
 * test actively pinned its violation.
 *
 * The code's implicit rationale ("a paid invoice is a fact; don't drop the
 * customer's money") is sound for a genuine delivery race and unsound as a
 * blanket rule. R-25/D-AUDIT-1 settles it by TIMESTAMP rather than by vibes:
 *
 *  - the event was created at or before the pause became known (plus the
 *    tolerance below) → a PRE-PAUSE invoice delivered late. Grant. The customer
 *    paid for that service period before pausing, and dropping it would take
 *    money without delivering credits.
 *  - otherwise → a genuine DURING-PAUSE invoice. Refuse, mint nothing.
 *    `pause_collection: {behavior: "void"}` means such an invoice should not
 *    exist; if one does it is a reconciliation question for a human.
 *
 * The tolerance WIDENS the grant window, so an ambiguous ordering at the pause
 * boundary resolves in the customer's favour — the same direction and the same
 * constant the two existing bounds in `pause.ts` use (both refuse only when the
 * disagreement EXCEEDS it). One idiom, not a second one. Stated consequence:
 * an invoice created up to 60s after a pause begins still grants.
 *
 * Returns null when the workspace is not paused (the ordinary case).
 */
function prePauseGrantDecision(
  pauseKnownAt: Date | null,
  event: Stripe.Event
): { paused: false } | { paused: true; allowed: boolean; lagMs: number } {
  if (pauseKnownAt === null) return { paused: false };
  const eventAt = new Date(event.created * 1000);
  const lagMs = eventAt.getTime() - pauseKnownAt.getTime();
  return { paused: true, allowed: lagMs <= CLOCK_SKEW_MS, lagMs };
}

/**
 * May an INVOICE event write subscription status?
 *
 * Two guards, both learned the hard way, and they belong together because
 * every invoice-driven status write needs both:
 *
 *  - TERMINAL: a canceled / incomplete_expired / unpaid subscription is dead.
 *    Round 3 applied this to `invoice.paid` only, which left a two-event path
 *    open: Stripe emits `invoice.payment_failed` and
 *    `customer.subscription.deleted` together at the end of dunning with no
 *    ordering guarantee, so a late `payment_failed` wrote `past_due` + a fresh
 *    grace deadline onto a canceled workspace — handing back the paid tier AND
 *    making the mirror non-terminal, so the next late `invoice.paid` then
 *    revived it permanently (code-review BLOCK).
 *  - ORDER: an invoice event older than the mirror's last subscription
 *    snapshot has a stale opinion about status.
 *
 * Note what this does NOT do: stamp `mirrorEventAt`. That watermark means
 * "the mirror reflects the subscription as of this moment", and an invoice
 * event is not a subscription snapshot — stamping it from a partial write is
 * exactly the regression BLOCK 4 records.
 */
function invoiceMayWriteStatus(
  mirror: { status: string; mirrorEventAt: Date | null } | undefined,
  event: Stripe.Event
): boolean {
  if (!mirror) return false;
  if (TERMINAL_STATUSES.has(mirror.status)) return false;
  return !invoiceIsStale(mirror, event);
}

/**
 * The ORDER half of `invoiceMayWriteStatus`, on its own — because the two
 * halves have OPPOSITE answers for one write, and collapsing them hid a defect
 * (audit 2026-08-17 #3's one independently-confirmed concrete instance).
 *
 * `invoice.paid`'s grace-clear used no guard at all: it nulled `graceExpiresAt`
 * whenever a deadline existed, while its own status-lift half beside it was
 * order-guarded. So a STALE `invoice.paid` — one whose `created` predates the
 * subscription snapshot that opened the current dunning window — ended a LIVE
 * grace period early, and `past_due` with a null deadline derives to `free`
 * (state.ts): a customer inside the window they were promised was downgraded by
 * a late delivery, with nothing left to correct it, because the deadline is
 * gone and no future event re-opens it.
 *
 * Why this is NOT just `!invoiceMayWriteStatus`: that predicate also refuses on
 * TERMINAL, and for a terminal mirror clearing the deadline is still RIGHT —
 * `canceled` already derives to free, so the clear is tidy-up, not a downgrade
 * (see the note at the clear site). Only the ORDER reason must veto the clear.
 *
 * Note the lock (see `handleStripeEvent`) does not close this and was never
 * going to: serializing two writers fixes the interleaving, not a stale
 * writer's opinion. The lock is why the surviving mirror is a whole snapshot
 * rather than a mix; this is why the surviving snapshot is the NEWEST one.
 */
function invoiceIsStale(
  mirror: { mirrorEventAt: Date | null } | undefined,
  event: Stripe.Event
): boolean {
  if (!mirror?.mirrorEventAt) return false;
  return (
    mirror.mirrorEventAt.getTime() > new Date(event.created * 1000).getTime()
  );
}

function priceIdOfLine(line: Stripe.InvoiceLineItem | undefined): string | null {
  const price = line?.pricing?.price_details?.price;
  if (typeof price === "string") return price;
  return typeof price === "object" && price !== null && "id" in price
    ? (price as { id: string }).id
    : null;
}

/**
 * The money figure recorded on a pack ledger row.
 *
 * The fallback is NOT a second price authority, but it is not an identity
 * either: `resolvePackPrice` validates config against Stripe at
 * SESSION-CREATION, and this runs at SETTLEMENT, so an `/admin/config` price
 * edit in between makes the two differ. See the call site for why the branch is
 * unreachable and why substituting still beats failing closed.
 */
function packAmountCents(
  session: Stripe.Checkout.Session,
  content: { pack: { priceUsd: number } },
  eventId: string
): number {
  if (typeof session.amount_total === "number") return session.amount_total;
  const substituted = Math.round(content.pack.priceUsd * 100);
  console.warn(
    `[stripe-webhook] ${eventId} pack session ${session.id} settled with payment_status=paid but NO amount_total; recording the configured pack price (${substituted}c) instead. This figure is equal to what Stripe charged UNLESS the configured pack price changed after this session was created — before trusting it, compare the session's amount_total in Stripe against the config version recorded on this ledger row. The branch should be unreachable, so also check the Stripe API version if it fires.`
  );
  return substituted;
}

type TierInvoiceCore = Readonly<{
  invoiceId: string;
  subscriptionId: string;
  customerId: string;
  priceId: string;
  periodStart: number;
  periodEnd: number;
}>;

const INVOICE_LINE_PAGE_SIZE = 100;
const MAX_INVOICE_LINE_PAGES = 10;
const MAX_INVOICE_LINES = INVOICE_LINE_PAGE_SIZE * MAX_INVOICE_LINE_PAGES;

async function withCompleteInvoiceLines(
  invoice: Stripe.Invoice,
  eventId: string
): Promise<Stripe.Invoice> {
  if (invoice.lines?.has_more !== true) return invoice;
  if (!invoice.id) {
    throw new Error(
      `invoice.paid ${eventId}: paginated invoice has no id, so its complete provider line set cannot be retrieved`
    );
  }

  const data: Stripe.InvoiceLineItem[] = [];
  const seenCursors = new Set<string>();
  let startingAfter: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_INVOICE_LINE_PAGES; pageNumber += 1) {
    const page = await getStripe().invoices.listLineItems(invoice.id, {
      limit: INVOICE_LINE_PAGE_SIZE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    data.push(...page.data);
    if (data.length > MAX_INVOICE_LINES) {
      throw new Error(
        `invoice.paid ${eventId}: invoice ${invoice.id} exceeds the bounded ${MAX_INVOICE_LINES}-line reconciliation limit`
      );
    }
    if (!page.has_more) {
      return {
        ...invoice,
        lines: { ...invoice.lines, data, has_more: false },
      };
    }
    const cursor = page.data.at(-1)?.id;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error(
        `invoice.paid ${eventId}: invoice ${invoice.id} line pagination did not advance`
      );
    }
    seenCursors.add(cursor);
    startingAfter = cursor;
  }
  throw new Error(
    `invoice.paid ${eventId}: invoice ${invoice.id} line pagination exceeded ${MAX_INVOICE_LINE_PAGES} pages`
  );
}

function tierInvoiceCore(invoice: Stripe.Invoice, eventId: string): TierInvoiceCore {
  const invoiceId = invoice.id;
  const subscriptionId = invoiceSubscriptionId(invoice);
  const customerId = objectId(invoice.customer);
  const lines = subscriptionLinesOf(invoice);
  const line = lines.length === 1 ? lines[0] : undefined;
  const priceId = priceIdOfLine(line);
  const periodStart = line?.period?.start;
  const periodEnd = line?.period?.end;
  if (
    invoice.lines?.has_more === true ||
    !invoiceId ||
    !subscriptionId ||
    !customerId ||
    lines.length !== 1 ||
    !priceId ||
    typeof periodStart !== "number" ||
    typeof periodEnd !== "number"
  ) {
    throw new Error(
      `invoice.paid ${eventId}: invoice ${invoiceId || "(no id)"} lacks the exact single-line invoice/subscription/customer/price/period identity required for signed invoice authority`
    );
  }
  return {
    invoiceId,
    subscriptionId,
    customerId,
    priceId,
    periodStart,
    periodEnd,
  };
}

async function resolveTierInvoiceAuthority(
  tx: TxLike,
  event: Stripe.Event,
  eventInvoice: Stripe.Invoice,
  workspaceId: VerifiedWorkspaceId,
  checkoutAttemptId: string,
  options: StripeEventHandlingOptions
): Promise<{
  authority: TierInvoiceAuthority;
  metadata: Record<string, string>;
}> {
  await assertAutoTopupProtocolRecoveryReady(tx);
  const rollout = await assertTierCheckoutProtocolRecoveryReady(tx);
  const provider = {
    accountId: rollout.stripeAccountId!,
    livemode: rollout.stripeLivemode!,
  };
  const eventCore = tierInvoiceCore(eventInvoice, event.id);
  if (
    eventInvoice.livemode !== provider.livemode ||
    event.livemode !== provider.livemode ||
    (event.account !== undefined && event.account !== provider.accountId)
  ) {
    throw new Error(
      `invoice.paid ${event.id}: event core differs from the provider-bound rollout`
    );
  }

  const verifyCurrent = async (
    current: Stripe.Invoice
  ): Promise<{ authority: TierInvoiceAuthority; metadata: Record<string, string> }> => {
    const completeCurrent = await withCompleteInvoiceLines(current, event.id);
    const currentCore = tierInvoiceCore(completeCurrent, event.id);
    if (completeCurrent.livemode !== provider.livemode) {
      throw new Error(
        `invoice.paid ${event.id}: provider Invoice livemode differs from rollout authority`
      );
    }
    const metadata = tierInvoiceAuthorityMetadataFromProvider(completeCurrent.metadata);
    const authority = verifyTierInvoiceAuthority(
      metadata,
      { ...currentCore, workspaceId },
      provider
    );
    // The historical Event is immutable and may not carry the metadata update,
    // but every economic identity field in that Event must be exactly the one
    // the provider Invoice authority signed.
    verifyTierInvoiceAuthority(
      metadata,
      { ...eventCore, workspaceId },
      provider
    );
    const eventAttempt =
      eventInvoice.parent?.subscription_details?.metadata
        ?.respin_checkout_attempt_id ?? null;
    const currentAttempt =
      completeCurrent.parent?.subscription_details?.metadata
        ?.respin_checkout_attempt_id ?? null;
    if (
      authority.checkoutAttemptId !== checkoutAttemptId ||
      eventAttempt !== checkoutAttemptId ||
      currentAttempt !== checkoutAttemptId
    ) {
      throw new Error(
        `invoice.paid ${event.id}: signed invoice authority differs from immutable Checkout generation metadata`
      );
    }
    return { authority, metadata };
  };

  let current = await getStripe().invoices.retrieve(eventCore.invoiceId);
  if (hasTierInvoiceAuthorityMetadata(current.metadata)) {
    return await verifyCurrent(current);
  }
  if (options.recovery) {
    throw new Error(
      `invoice.paid ${event.id}: PITR recovery requires pre-existing signed authority on provider Invoice ${eventCore.invoiceId}`
    );
  }

  const { version, content } = await getActiveConfig(tx);
  const tier = content.stripePriceMap[eventCore.priceId];
  if (tier !== "creator" && tier !== "pro" && tier !== "studio") {
    throw new Error(
      `invoice.paid ${event.id}: price ${eventCore.priceId} is not mapped to a paid tier in active config version ${version}`
    );
  }
  const metadata = tierInvoiceAuthorityMetadata({
    ...eventCore,
    workspaceId,
    checkoutAttemptId,
    tier,
    allowance: content.allowances[tier],
    configVersion: version,
    monthlyPeriodDays: content.monthlyPeriodDays,
    stripeAccountId: provider.accountId,
    stripeLivemode: provider.livemode,
  });

  let updateError: unknown = null;
  try {
    await getStripe().invoices.update(
      eventCore.invoiceId,
      { metadata },
      { idempotencyKey: `tier-invoice-authority:v1:${eventCore.invoiceId}` }
    );
  } catch (error) {
    // A transport failure can happen after Stripe committed the metadata.
    // Retrieve-and-verify is the only authority for that unknown outcome.
    updateError = error;
  }
  try {
    current = await getStripe().invoices.retrieve(eventCore.invoiceId);
    return await verifyCurrent(current);
  } catch (verificationError) {
    if (updateError) throw updateError;
    throw verificationError;
  }
}

function subscriptionSnapshotKey(sub: Stripe.Subscription): string {
  const items = sub.items?.data ?? [];
  const item = items.length === 1 ? items[0] : null;
  return JSON.stringify([
    sub.id,
    objectId(sub.customer),
    sub.status,
    item ? objectId(item.price) : null,
    item?.current_period_start ?? null,
    item?.current_period_end ?? null,
    sub.cancel_at_period_end,
    sub.cancel_at ?? null,
    sub.pause_collection !== null,
    sub.pause_collection?.resumes_at ?? null,
    sub.livemode,
  ]);
}

function mirrorMatchesSubscriptionSnapshot(
  mirror: typeof subscriptions.$inferSelect,
  sub: Stripe.Subscription
): boolean {
  const items = sub.items?.data ?? [];
  const item = items.length === 1 ? items[0] : null;
  return Boolean(
    item &&
      mirror.stripeSubscriptionId === sub.id &&
      mirror.status === sub.status &&
      mirror.stripePriceId === objectId(item.price) &&
      mirror.currentPeriodStart?.getTime() === item.current_period_start * 1000 &&
      mirror.currentPeriodEnd?.getTime() === item.current_period_end * 1000 &&
      mirror.cancelAtPeriodEnd === sub.cancel_at_period_end &&
      (mirror.cancelAt?.getTime() ?? null) ===
        (sub.cancel_at ? sub.cancel_at * 1000 : null) &&
      (mirror.pausedAt !== null) === (sub.pause_collection !== null) &&
      (mirror.resumesAt?.getTime() ?? null) ===
        (sub.pause_collection?.resumes_at
          ? sub.pause_collection.resumes_at * 1000
          : null)
  );
}

async function providerConfirmsSubscriptionSnapshot(
  sub: Stripe.Subscription
): Promise<boolean> {
  const current = await getStripe().subscriptions.retrieve(sub.id);
  return subscriptionSnapshotKey(current) === subscriptionSnapshotKey(sub);
}

/**
 * Credit validity starts when Stripe authenticated the settlement, never when
 * a delayed webhook or PITR recovery happened to reach this database.
 */
async function settlementAt(tx: TxLike, event: Stripe.Event): Promise<Date> {
  if (!Number.isSafeInteger(event.created) || event.created <= 0) {
    throw new Error(
      `${event.type} ${event.id}: Stripe event created is not a positive integer second`
    );
  }
  const settledAt = new Date(event.created * 1000);
  const now = await getDbNow(tx);
  if (settledAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw new Error(
      `${event.type} ${event.id}: Stripe settlement time is more than ${CLOCK_SKEW_MS / 1000}s ahead of the database clock`
    );
  }
  return settledAt;
}

async function assertTierCheckoutEventProviderAuthority(
  tx: TxLike,
  event: Stripe.Event,
  object: { livemode?: boolean },
  attempt: {
    tierCheckoutAttemptId: string | null;
    tierCheckoutAttemptTier: string | null;
    tierCheckoutAttemptPriceId: string | null;
    tierCheckoutAttemptCustomerId: string | null;
    tierCheckoutAttemptSessionId: string | null;
    tierCheckoutAttemptSubscriptionId: string | null;
    tierCheckoutAttemptStripeAccountId: string | null;
    tierCheckoutAttemptStripeLivemode: boolean | null;
    tierCheckoutAttemptAuthority: unknown;
  }
): Promise<void> {
  await assertAutoTopupProtocolRecoveryReady(tx);
  const rollout = await assertTierCheckoutProtocolRecoveryReady(tx);
  if (
    !attempt.tierCheckoutAttemptId ||
    !attempt.tierCheckoutAttemptStripeAccountId ||
    attempt.tierCheckoutAttemptStripeLivemode === null ||
    attempt.tierCheckoutAttemptStripeAccountId !== rollout.stripeAccountId ||
    attempt.tierCheckoutAttemptStripeLivemode !== rollout.stripeLivemode ||
    event.livemode !== rollout.stripeLivemode ||
    object.livemode !== rollout.stripeLivemode ||
    (event.account !== undefined && event.account !== rollout.stripeAccountId)
  ) {
    throw new Error(
      `${event.type} ${event.id}: durable tier Checkout attempt does not match the active Stripe account/livemode authority`
    );
  }

  const attemptId = attempt.tierCheckoutAttemptId;
  const tier = attempt.tierCheckoutAttemptTier;
  const priceId = attempt.tierCheckoutAttemptPriceId;
  const customerId = attempt.tierCheckoutAttemptCustomerId;
  if (!attemptId || !tier || !priceId || !customerId) {
    throw new Error(
      `${event.type} ${event.id}: durable tier Checkout generation record is incomplete`
    );
  }
  const storedAuthority = attempt.tierCheckoutAttemptAuthority;
  if (
    !storedAuthority ||
    typeof storedAuthority !== "object" ||
    Array.isArray(storedAuthority) ||
    !Object.values(storedAuthority).every((value) => typeof value === "string")
  ) {
    throw new Error(
      `${event.type} ${event.id}: durable tier Checkout signed authority is missing or malformed`
    );
  }
  const candidate = event.data.object;
  const candidateMetadata =
    candidate.object === "invoice"
      ? (candidate as Stripe.Invoice).parent?.subscription_details?.metadata
      : (candidate as Stripe.Checkout.Session | Stripe.Subscription).metadata;
  for (const [key, value] of Object.entries(
    storedAuthority as Record<string, string>
  )) {
    if (candidateMetadata?.[key] !== value) {
      throw new Error(
        `${event.type} ${event.id}: provider tier authority differs from the durable attempt`
      );
    }
  }
  verifyTierCheckoutAuthority(
    candidateMetadata,
    { attemptId, workspaceId: candidateMetadata?.workspace_id ?? "", customerId },
    {
      accountId: rollout.stripeAccountId!,
      livemode: rollout.stripeLivemode!,
    }
  );
  if (candidate.object === "checkout.session") {
    const supplied = candidate as Stripe.Checkout.Session;
    const session = supplied.line_items
      ? supplied
      : await getStripe().checkout.sessions.retrieve(candidate.id, {
          expand: ["line_items.data.price"],
        });
    const lines = session.line_items?.data ?? [];
    const linePrice = lines.length === 1 ? objectId(lines[0]?.price) : null;
    if (
      session.mode !== "subscription" ||
      objectId(session.customer) !== customerId ||
      session.metadata?.respin_checkout_attempt_id !== attemptId ||
      session.metadata?.tier !== tier ||
      session.metadata?.price_id !== priceId ||
      linePrice !== priceId ||
      (attempt.tierCheckoutAttemptSessionId !== null &&
        session.id !== attempt.tierCheckoutAttemptSessionId) ||
      (attempt.tierCheckoutAttemptSubscriptionId !== null &&
        objectId(session.subscription) !== attempt.tierCheckoutAttemptSubscriptionId)
    ) {
      throw new Error(
        `${event.type} ${event.id}: Checkout Session differs from the durable tier attempt`
      );
    }
  } else if (candidate.object === "subscription") {
    const sub = candidate as Stripe.Subscription;
    const lines = sub.items?.data ?? [];
    const linePrice = lines.length === 1 ? objectId(lines[0]?.price) : null;
    if (
      objectId(sub.customer) !== customerId ||
      sub.metadata?.respin_checkout_attempt_id !== attemptId ||
      sub.metadata?.tier !== tier ||
      sub.metadata?.price_id !== priceId ||
      linePrice !== priceId ||
      (attempt.tierCheckoutAttemptSubscriptionId !== null &&
        sub.id !== attempt.tierCheckoutAttemptSubscriptionId)
    ) {
      throw new Error(
        `${event.type} ${event.id}: Subscription differs from the durable tier attempt`
      );
    }
  } else if (candidate.object === "invoice") {
    const invoice = candidate as Stripe.Invoice;
    const metadata = invoice.parent?.subscription_details?.metadata;
    if (
      objectId(invoice.customer) !== customerId ||
      metadata?.respin_checkout_attempt_id !== attemptId ||
      (attempt.tierCheckoutAttemptSubscriptionId !== null &&
        invoiceSubscriptionId(invoice) !== attempt.tierCheckoutAttemptSubscriptionId)
    ) {
      throw new Error(
        `${event.type} ${event.id}: Invoice differs from the durable tier attempt`
      );
    }
  }
}

/**
 * Handle one verified Stripe event. Returns the recorded outcome; throws on
 * handler failure (the route turns that into a non-2xx so Stripe retries) and
 * DuplicateStripeEvent when the event already has a final outcome (→ 200).
 */
export async function handleStripeEventInTransaction(
  tx: TxLike,
  event: Stripe.Event,
  options: StripeEventHandlingOptions = {}
): Promise<StripeEventOutcome> {
      const [existing] = await tx
        .select({
          outcome: stripeEvents.outcome,
          workspaceId: stripeEvents.workspaceId,
          tierInvoiceAuthority: stripeEvents.tierInvoiceAuthority,
        })
        .from(stripeEvents)
        .where(eq(stripeEvents.id, event.id))
        .limit(1);
      if (existing && !options.recovery) {
        throw new DuplicateStripeEvent(
          event.id,
          null,
          existing.outcome as StripeEventOutcome,
          existing.workspaceId,
          stringRecordOrNull(existing.tierInvoiceAuthority)
        );
      }

      const customerId = customerIdOf(event);
      const workspaceId = customerId
        ? await workspaceForCustomer(tx, customerId)
        : null;
      const receiptAttribution = classifyStripeReceiptAttribution(
        workspaceId,
        customerId,
      );

      // THE WORKSPACE LOCKS — audit 2026-08-17 #3, the audit's most
      // cross-confirmed finding (a Claude depth read, the correctness critic,
      // and Codex independently landed on the same lines).
      //
      // Every one of the five `subscriptions`-mirror writers below was an
      // unlocked READ-THEN-WRITE: each read the mirror, checked staleness
      // against THAT snapshot, then issued a plain `.update()`. Two concurrent
      // or out-of-order Stripe deliveries could therefore both pass their own
      // staleness check and the loser's write would silently revert newer
      // billing state to stale. The credit ledger was already proven unsafe
      // under exactly this shape and fixed with `takeWorkspaceLock` ("11 of 20
      // concurrent debits succeeded against a 100 balance", clock.ts) — the fix
      // was simply never carried across to this file.
      //
      // It is taken ONCE, HERE, rather than five times in the writers, for the
      // reason CLAUDE.md's 2026-07-30 lesson gives: guard where the path is
      // BUILT, so a sixth writer added later inherits the guard instead of
      // needing to remember it. Consequences worth stating:
      //
      //  - The lifecycle graph lock is first and the billing lock is second,
      //    through the ONE ordered helper (`takeWorkspaceLockInOrder`, R-177),
      //    matching deletion, restore, and request-time charge creation. The
      //    graph lock is the SHARED form (audit Phase 8, P8-A3): this path reads
      //    the lifecycle and changes no membership, so a page reader's shared
      //    request is granted beside it and is not queued behind the Stripe
      //    calls below, while a deletion writer (the exclusive form) is. ONE
      //    EXCEPTION, which Postgres's lock queue creates: once a deletion
      //    writer is WAITING behind this hold, a new shared request queues
      //    behind that writer — so a page would wait for these Stripe calls
      //    after all. The page path's reads are therefore bounded (gate M2:
      //    READ ONLY, `lock_timeout = 5000`, `@respin/db` `render-transaction.ts`)
      //    and refuse with a named state instead; this transaction is never
      //    under that bound. The
      //    lifecycle row and customer mapping are then re-read under both
      //    locks. A tombstoned/detached workspace still receives an immutable
      //    financial receipt, but no billing mirror, allowance, pack, or
      //    auto-top-up mutation can recreate capability after deletion.
      //  - `deriveBalance` / `debitCredits` re-acquire the billing xact lock as
      //    a no-op (D-M1-7), so the ordering cannot deadlock against the ledger
      //    paths.
      //  - It also closes #28 without widening the idempotency list. Two events
      //    carrying the SAME business object (one checkout session, one invoice,
      //    one PaymentIntent) necessarily resolve to the same workspace, so they
      //    now SERIALIZE here: the loser waits, its pre-check then sees the
      //    winner's committed row, and it converges to `ignored` — instead of
      //    losing a unique-index race and returning a false 500. Adding those
      //    business-object constraints to IDEMPOTENCY_CONSTRAINTS was the other
      //    candidate fix and is deliberately NOT taken: that list turns a 23505
      //    into a silent 200, which is precisely the "collapsing them all into a
      //    200 silently discards events" hazard the round-2 BLOCK closed.
      //  - Unattributed events (`workspaceId === null`) take no lock. They also
      //    write nothing — they can only refuse — so there is nothing to
      //    serialize.
      let lifecycleAllowsDispatch = true;
      // Held, not ignored (R-165): the workspace exists, is tombstoned, and
      // the customer still maps to it — so the money is that workspace's and
      // its deletion may yet be cancelled.
      let lifecycleHoldsMoney = false;
      if (workspaceId) {
        await takeWorkspaceLockInOrder(tx, { workspaceId });
        const [workspace] = await tx
          .select({ state: workspaces.lifecycleState })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);
        const reboundWorkspace = customerId
          ? await workspaceForCustomer(tx, customerId)
          : null;
        lifecycleAllowsDispatch =
          workspace?.state === "active" && reboundWorkspace === workspaceId;
        lifecycleHoldsMoney =
          workspace?.state === "tombstoned" && reboundWorkspace === workspaceId;
      }

      if (existing) {
        let verifiedInvoiceAuthority: Record<string, string> | null = null;
        if (
          event.type === "invoice.paid" &&
          workspaceId &&
          GRANT_BILLING_REASONS.has(
            (event.data.object as Stripe.Invoice).billing_reason ?? ""
          )
        ) {
          const invoice = event.data.object as Stripe.Invoice;
          const attemptId =
            invoice.parent?.subscription_details?.metadata
              ?.respin_checkout_attempt_id;
          if (attemptId) {
            verifiedInvoiceAuthority = (
              await resolveTierInvoiceAuthority(
                tx,
                event,
                invoice,
                workspaceId,
                attemptId,
                { recovery: true }
              )
            ).metadata;
          }
        }
        throw new DuplicateStripeEvent(
          event.id,
          verifiedInvoiceAuthority,
          existing.outcome as StripeEventOutcome,
          existing.workspaceId,
          stringRecordOrNull(existing.tierInvoiceAuthority)
        );
      }

      const receiptContext: StripeReceiptContext = {
        tierInvoiceAuthority: null,
      };
      const money = isHeldMoneyEvent(event);
      // LATE MONEY (R-166, billing follow-up): after an erasure the workspace
      // survives under its pseudonymous id, tombstoned, and the retained
      // subscription still maps the customer to it — so money that settles
      // after the erasure lands here. Holding it would hold it forever (no
      // cancellation can come), silently: it is refund owed, against the
      // erasure that completed.
      const erasedBy =
        lifecycleHoldsMoney && money && workspaceId
          ? await erasedWorkspaceOperationIdInTx(tx, workspaceId)
          : null;
      const outcome: StripeEventOutcome = lifecycleAllowsDispatch
        ? await dispatch(tx, event, workspaceId, options, receiptContext)
        : erasedBy !== null
          ? "refund_owed"
          : lifecycleHoldsMoney && money
            ? "held_tombstoned"
            : // A detached or unattributable workspace cannot gain credits or
              // mutate billing authority; its immutable receipt is still written.
              "ignored";
      // MONEY NO WORKSPACE TOOK needs an operator (R-166): a late refund
      // owed, money for an unknown or mismatched customer, or money for a
      // detached workspace. Flagged here, paged once by the money sweep
      // (`pageStripeMoneyNeedingOperator`), listed by
      // `listStripeMoneyNeedingOperator`. `ignored` from `dispatch` itself is
      // its own converge-to-ignored rule, not lost money, and is not flagged.
      const moneyNeedsOperator =
        money &&
        (outcome === "refund_owed" ||
          outcome === "refused_unknown_customer" ||
          outcome === "refused_identity_mismatch" ||
          (!lifecycleAllowsDispatch && outcome === "ignored"));
      if (outcome !== "processed") {
        // Payload-free refusal log (D-M1-6): ids + type + outcome only, never
        // payload fields. `event.type` joins it per audit 2026-08-17 #27 —
        // without it, telling an EXPECTED ignore (an unhandled event type) from
        // a refusal that matters required a database lookup mid-incident, which
        // is the wrong time to need one.
        console.warn(
          `[stripe-webhook] ${event.id} type=${event.type} → ${outcome}`
        );
      }
      const now = await getDbNow(tx);
      await tx.insert(stripeEvents).values({
        id: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
        tierInvoiceAuthority: receiptContext.tierInvoiceAuthority,
        // Receipt-time attribution regardless of outcome. It remains immutable
        // after workspace FK detachment, so a retained financial receipt never
        // becomes indistinguishable from a genuinely unattributed event.
        workspaceId,
        stripeCustomerId: customerId,
        receiptAttribution,
        outcome,
        processedAt: now,
        moneyNeedsOperator,
        ...(outcome === "refund_owed"
          ? { refundOwedOperationId: erasedBy, ...refundOwedAmountColumns(event) }
          : {}),
      });
      return outcome;
}

function refundOwedAmountColumns(event: Stripe.Event) {
  const { amount, currency } = stripeMoneyAmount(event.type, event);
  return { refundOwedAmount: amount, refundOwedCurrency: currency };
}

/** A seam for the replay's dispatch, so a test can plant the outcome it returns. */
export type HeldEventDispatch = (
  tx: TxLike,
  event: Stripe.Event,
  workspaceId: VerifiedWorkspaceId,
  receiptContext: StripeReceiptContext
) => Promise<StripeEventOutcome>;

const DISPATCH_HELD_EVENT: HeldEventDispatch = (tx, event, workspaceId, receiptContext) =>
  dispatch(tx, event, workspaceId, {}, receiptContext);

/**
 * REPLAY THE MONEY HELD WHILE A WORKSPACE WAS TOMBSTONED (R-165, P5-A1).
 *
 * Run by the worker's deletion tick for every active workspace with held rows
 * (`replayHeldStripeEventsForActiveWorkspaces`) — the production replayer —
 * and by `cancelScopedDeletion` when its caller passes the held-money port
 * (the app facade cannot: R-165). Never through `handleStripeEvent`: a held
 * event already HAS its `stripe_events` row, and that handler refuses an event
 * id with a row as `DuplicateStripeEvent`.
 *
 * ONE TRANSACTION PER EVENT, in P8-A1's lock order: the workspace membership
 * graph, then the billing lock — the same two `handleStripeEventInTransaction`
 * takes, so a replay and a new webhook for the same workspace serialise.
 *
 * THE IDEMPOTENCY GATE is the row itself, locked FIRST:
 * `SELECT … WHERE id = $1 AND outcome = 'held_tombstoned' FOR UPDATE`. No row
 * means another replay settled it, and this transaction mints nothing. With
 * the row locked, the workspace's lifecycle and customer mapping are re-read
 * under both locks; then `dispatch` runs, and the row is updated to the
 * outcome `dispatch` RETURNED — `processed`, `ignored` or a `refused_*` code —
 * never a presumed `processed`. The update is conditional on the held outcome
 * too, and 0064's trigger refuses any other outcome change.
 *
 * A failure is caught PER EVENT, so one poisoned row cannot strand the rest,
 * and is COUNTED (`failed`): the worker raises an alert on it (CLAUDE.md
 * 2026-09-09). A failed row stays held and is retried on the next tick.
 */
export async function replayHeldStripeEvents(
  db: DbLike,
  workspaceId: string,
  seams: Readonly<{ dispatch?: HeldEventDispatch }> = {}
): Promise<HeldMoneyReplaySummary> {
  const held = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(
      and(
        eq(stripeEvents.workspaceId, workspaceId),
        eq(stripeEvents.outcome, "held_tombstoned")
      )
    )
    .orderBy(asc(stripeEvents.receivedAt), asc(stripeEvents.id));
  let replayed = 0;
  let alreadySettled = 0;
  let failed = 0;
  let stillHeld = 0;
  // THE ATTEMPT MARKER (R-166): stamped before any attempt and in its own
  // statement, so a failed or still-held attempt is recorded too. The sweep
  // takes the least recently tried workspace first.
  if (held.length > 0) {
    await db
      .update(stripeEvents)
      .set({ heldReplayAttemptedAt: sql`clock_timestamp()` })
      .where(and(eq(stripeEvents.workspaceId, workspaceId), eq(stripeEvents.outcome, "held_tombstoned")));
  }
  // The lock key only. The AUTHORITY for this id is re-derived per event under
  // both locks below — the row's stored customer must still map to exactly
  // this workspace (`workspaceForCustomer`, the same stored mapping the live
  // webhook resolves through), or nothing is dispatched.
  const lockKey = trustWorkspaceId(workspaceId);
  for (const { id } of held) {
    try {
      const settled = await db.transaction(async (tx) => {
        await takeWorkspaceLockInOrder(tx, { workspaceId: lockKey });
        const [row] = await tx
          .select()
          .from(stripeEvents)
          .where(and(eq(stripeEvents.id, id), eq(stripeEvents.outcome, "held_tombstoned")))
          .limit(1)
          .for("update");
        if (!row) return "already_settled" as const;
        const [workspace] = await tx
          .select({ state: workspaces.lifecycleState })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);
        const rebound = row.stripeCustomerId
          ? await workspaceForCustomer(tx, row.stripeCustomerId)
          : null;
        if (workspace?.state !== "active" || rebound === null || rebound !== workspaceId) {
          // Still tombstoned (or remapped): it stays held. Not a failure.
          return "still_held" as const;
        }
        const event = row.payload as unknown as Stripe.Event;
        if (!event || typeof event !== "object" || event.id !== id || !event.data?.object) {
          // No payload producer clears a held row (R-165, gate H1:
          // `HELD_PAYLOAD_PRODUCERS`), so this is a payload that is not this
          // event — counted as a failure and paged, never guessed at.
          throw new Error(`held stripe event ${id} has no replayable payload`);
        }
        const receiptContext: StripeReceiptContext = { tierInvoiceAuthority: null };
        const outcome = await (seams.dispatch ?? DISPATCH_HELD_EVENT)(
          tx,
          event,
          rebound,
          receiptContext
        );
        const [updated] = await tx
          .update(stripeEvents)
          .set({
            outcome,
            processedAt: await getDbNow(tx),
            tierInvoiceAuthority: receiptContext.tierInvoiceAuthority,
          })
          .where(and(eq(stripeEvents.id, id), eq(stripeEvents.outcome, "held_tombstoned")))
          .returning({ id: stripeEvents.id });
        if (!updated) throw new Error(`held stripe event ${id} changed under its row lock`);
        if (outcome !== "processed") {
          console.warn(`[stripe-held-replay] ${id} type=${event.type} → ${outcome}`);
        }
        return "replayed" as const;
      });
      if (settled === "replayed") replayed += 1;
      else if (settled === "already_settled") alreadySettled += 1;
      else stillHeld += 1;
    } catch (error) {
      failed += 1;
      // Ids and a class name only — never a payload (D-M1-6).
      console.warn(
        `[stripe-held-replay] ${id} → failed (${error instanceof Error ? error.name : "unknown"})`
      );
    }
  }
  return { replayed, alreadySettled, failed, stillHeld };
}

/**
 * The worker's sweep (R-165): every ACTIVE workspace that still has held
 * rows, NEVER-TRIED FIRST, THEN LEAST RECENTLY TRIED, then oldest money
 * (R-166). Oldest-first alone let `limit` stuck workspaces — failing, or still
 * held — take every tick while a newer one waited forever; the attempt marker
 * (`held_replay_attempted_at`, stamped by every attempt) rotates them instead.
 * A cancellation whose own replay was lost to a crash, or failed, is finished
 * here. `stillHeld` here is a workspace that is active yet whose customer no
 * longer maps to it — the worker pages on it, as it does on
 * `moneyNeedsOperator`, the rows this sweep pages for the first time
 * (`pageStripeMoneyNeedingOperator`).
 */
export async function replayHeldStripeEventsForActiveWorkspaces(
  db: DbLike,
  limit = 20
): Promise<HeldMoneyReplaySummary & Readonly<{ workspaces: number; moneyNeedsOperator: number }>> {
  const rows = await db
    .select({ workspaceId: stripeEvents.workspaceId })
    .from(stripeEvents)
    .innerJoin(workspaces, eq(workspaces.id, stripeEvents.workspaceId))
    .where(
      and(
        eq(stripeEvents.outcome, "held_tombstoned"),
        eq(workspaces.lifecycleState, "active")
      )
    )
    .groupBy(stripeEvents.workspaceId)
    .orderBy(
      sql`max(${stripeEvents.heldReplayAttemptedAt}) ASC NULLS FIRST`,
      sql`min(${stripeEvents.receivedAt})`,
      asc(stripeEvents.workspaceId)
    )
    .limit(limit);
  const total = {
    replayed: 0,
    alreadySettled: 0,
    failed: 0,
    stillHeld: 0,
    workspaces: rows.length,
    moneyNeedsOperator: await pageStripeMoneyNeedingOperator(db),
  };
  for (const { workspaceId } of rows) {
    if (!workspaceId) continue;
    const summary = await replayHeldStripeEvents(db, workspaceId);
    total.replayed += summary.replayed;
    total.alreadySettled += summary.alreadySettled;
    total.failed += summary.failed;
    total.stillHeld += summary.stillHeld;
  }
  return total;
}

/**
 * Pages each money-needs-operator receipt ONCE (R-166): stamps the unpaged
 * ones and returns how many it stamped; the worker raises
 * `deletion_alert_page_money_needs_operator` on a non-zero count. The list
 * itself never empties on its own — `listStripeMoneyNeedingOperator` is the
 * operator's view of all of them.
 */
export async function pageStripeMoneyNeedingOperator(db: DbLike): Promise<number> {
  const paged = await db
    .update(stripeEvents)
    .set({ moneyNeedsOperatorPagedAt: sql`clock_timestamp()` })
    .where(and(eq(stripeEvents.moneyNeedsOperator, true), sql`${stripeEvents.moneyNeedsOperatorPagedAt} IS NULL`))
    .returning({ id: stripeEvents.id });
  return paged.length;
}

/** The operator's unresolved-money list: ids, types, outcomes and amounts only — never a payload. */
export async function listStripeMoneyNeedingOperator(db: DbLike) {
  return db
    .select({
      id: stripeEvents.id,
      type: stripeEvents.type,
      outcome: stripeEvents.outcome,
      refundOwedAmount: stripeEvents.refundOwedAmount,
      refundOwedCurrency: stripeEvents.refundOwedCurrency,
      receivedAt: stripeEvents.receivedAt,
      pagedAt: stripeEvents.moneyNeedsOperatorPagedAt,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.moneyNeedsOperator, true))
    .orderBy(asc(stripeEvents.receivedAt), asc(stripeEvents.id));
}

export async function handleStripeEvent(
  db: DbLike,
  event: Stripe.Event
): Promise<StripeEventOutcome> {
  try {
    return await db.transaction((tx) =>
      handleStripeEventInTransaction(tx, event)
    );
  } catch (err) {
    if (err instanceof DuplicateStripeEvent) throw err;
    // A concurrent duplicate loses the idempotency constraint AFTER the winner
    // commits; its tx rolled back completely.
    if (isIdempotencyViolation(err)) throw new DuplicateStripeEvent(event.id);
    throw err;
  }
}

function isIdempotencyViolation(err: unknown): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const code = e?.code ?? e?.cause?.code;
  if (code !== "23505") return false;
  const constraint = e?.constraint ?? e?.cause?.constraint;
  if (constraint) return IDEMPOTENCY_CONSTRAINTS.includes(constraint);
  // Driver didn't surface the constraint name: fall back to the message, and
  // if that is inconclusive treat it as a REAL error (fail closed → retry).
  const message = err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : "";
  return IDEMPOTENCY_CONSTRAINTS.some((c) => message.includes(c));
}

/**
 * The handler body. Called ONLY for a workspace that is active under both
 * locks — by `handleStripeEventInTransaction`, and by the held-money replay
 * once a cancelled deletion has restored the workspace. A non-active
 * workspace never reaches here: the caller records `held_tombstoned` or
 * `ignored` instead (R-165). Before R-165 this function took a boolean
 * active-workspace flag and returned `ignored` for every event when it was
 * false, so two later checks of the same flag in the invoice branch were
 * dead, and a comment there claimed a deleted workspace "may still settle the
 * exact paid invoice" — it settled nothing.
 */
async function dispatch(
  tx: TxLike,
  event: Stripe.Event,
  workspaceId: VerifiedWorkspaceId | null,
  options: StripeEventHandlingOptions,
  receiptContext: StripeReceiptContext
): Promise<StripeEventOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!workspaceId) return "refused_unknown_customer";
      // Metadata is a CROSS-CHECK only (D-M1-6): present-and-mismatched refuses.
      const metaWs = session.metadata?.workspace_id;
      if (metaWs && metaWs !== workspaceId) return "refused_identity_mismatch";

      if (session.mode === "payment" && session.metadata?.respin_kind === "pack") {
        // The session completing is NOT the money arriving: delayed-notification
        // methods complete as `unpaid` and settle later on
        // checkout.session.async_payment_succeeded (code-review BLOCK).
        if (session.payment_status !== "paid") {
          // 'no_payment_required' (a 100%-off or zero-amount session) would
          // also land here and mint nothing forever, so say which it was
          // rather than logging a bare "ignored" (code-review NOTE).
          console.warn(
            `[stripe-webhook] ${event.id} pack session ${session.id} not minted: payment_status=${session.payment_status}`
          );
          return "ignored";
        }
        // ONE pack per SESSION, not per event id (code-review BLOCK): both
        // checkout.session.completed and .async_payment_succeeded can carry
        // the same session under DIFFERENT event ids, which the event-id
        // unique cannot dedupe. Pre-check here so the second one converges to
        // "ignored"; credit_ledger_checkout_session_uq is the guarantee if two
        // land concurrently (that 23505 is not an idempotency constraint, so
        // it propagates and Stripe redelivers).
        const [already] = await tx
          .select({ id: creditLedger.id })
          .from(creditLedger)
          .where(
            and(
              // Workspace-scoped like every other query in this package
              // (tenancy T1) — the resolved workspace is the only one whose
              // rows may answer this question. The index behind it is
              // deliberately global; see billing-schema.ts for why.
              eq(creditLedger.workspaceId, workspaceId),
              eq(creditLedger.refType, "checkout_session"),
              eq(creditLedger.refId, session.id)
            )
          )
          .limit(1);
        if (already) {
          console.warn(
            `[stripe-webhook] ${event.id} pack session ${session.id} already minted — ignoring the second settlement event`
          );
          return "ignored";
        }
        const settledAt = await settlementAt(tx, event);
        const hasV1Authority = Object.keys(session.metadata ?? {}).some((key) =>
          [
            "authority_key_id",
            "respin_pack_attempt_id",
            "customer_id",
            "price_id",
            "amount_cents",
            "currency",
            "credits",
            "validity_months",
            "config_version",
            "stripe_account_id",
            "stripe_livemode",
            "respin_authority_sig",
          ].includes(key)
        );
        let packTerms: {
          attemptId: string | null;
          amountCents: number;
          credits: number;
          validityMonths: number;
          configVersion: number;
        };
        if (hasV1Authority) {
          await assertAutoTopupProtocolRecoveryReady(tx);
          await assertTierCheckoutProtocolRecoveryReady(tx);
          const exactSession = session.line_items
            ? session
            : await getStripe().checkout.sessions.retrieve(session.id, {
                expand: ["line_items.data.price"],
              });
          packTerms = verifyPackCheckoutAuthority(
            exactSession,
            workspaceId,
            event,
            await getAuthenticatedStripeAccountIdentity()
          );
        } else {
          // The tier-Checkout fleet drain is also the durable boundary for the
          // last binary that could create unsigned pack Sessions. The provider
          // audit rejects legacy Sessions created after this timestamp, making
          // this compatibility branch a finite provider set rather than a
          // permanent downgrade from signed purchase authority.
          const rolloutState = await getTierCheckoutProtocolState(tx);
          if (rolloutState !== "expanded") {
            const rollout = await assertTierCheckoutProtocolRecoveryReady(tx);
            if (
              !rollout.drainStartedAt ||
              !Number.isSafeInteger(session.created) ||
              session.created * 1000 >
                rollout.drainStartedAt.getTime() + STRIPE_MAX_CALL_WINDOW_MS ||
              event.livemode !== rollout.stripeLivemode ||
              session.livemode !== rollout.stripeLivemode ||
              (event.account !== undefined && event.account !== rollout.stripeAccountId)
            ) {
              throw new Error(
                `pack session ${session.id}: unsigned legacy authority is outside the provider-bound fleet-drain cutoff`
              );
            }
          }
          const { version, content } = await getActiveConfig(tx);
          packTerms = {
            attemptId: null,
            amountCents: packAmountCents(session, content, event.id),
            credits: content.pack.credits,
            validityMonths: content.pack.validityMonths,
            configVersion: version,
          };
        }
        await purchasePackCredits(tx, {
          workspaceId,
          amount: packTerms.credits,
          expiresAt: addMonthsUtc(settledAt, packTerms.validityMonths),
          amountCents: packTerms.amountCents,
          stripeEventId: event.id,
          refType: "checkout_session",
          refId: session.id,
          packCheckoutAttemptId: packTerms.attemptId ?? undefined,
          configVersion: packTerms.configVersion,
        });
        return "processed";
      }

      if (session.mode === "subscription") {
        // `subscription` is an id or an expanded object depending on the
        // request that produced the session — both shapes are handled and
        // both are now tested (code-review CHANGE: this branch had none).
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);
        if (subId) {
          // Order-guarded (a redelivered older checkout event must not repoint
          // the mirror at a dead subscription, after which pause/resume/portal
          // act on the wrong Stripe object) — but deliberately NOT stamping.
          //
          // Round 3 both guarded AND stamped here, which was a regression
          // (code-review BLOCK): this branch writes only `stripeSubscriptionId`,
          // so stamping the shared watermark from that PARTIAL write let a
          // checkout event with a later `created` second suppress the real
          // `customer.subscription.created` that follows it. The mirror then
          // never records price, status or period — the workspace derives to
          // `free` while paying, and `createTierCheckoutUrl` sees no live
          // subscription, so the F1 double-billing guard silently switches off.
          // The watermark belongs to full subscription snapshots only.
          const eventAt = new Date(event.created * 1000);
          const [mirror] = await tx
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.workspaceId, workspaceId))
            .limit(1);
          if (
            mirror?.mirrorEventAt &&
            mirror.mirrorEventAt.getTime() > eventAt.getTime()
          ) {
            return "ignored";
          }
          // While the mirrored subscription is DEAD, this branch may not
          // repoint it — only a full subscription snapshot may (billing
          // round-5 BLOCK, reproduced by the gate). `stripeSubscriptionId` is
          // what the mirror writer's irreversibility guard identifies the dead
          // subscription BY, and this partial write could overwrite it: on a
          // re-subscribe where `checkout.session.completed` beat
          // `customer.subscription.created`, the mirror became
          // {status: canceled, subscription: sub_NEW}, so the new
          // subscription's own first snapshot looked exactly like a
          // resurrection of the old one and was refused — forever, along with
          // every later update. The workspace paid, was granted its credits by
          // invoice.paid, and derived to `free` with no event that could ever
          // correct it, while `isLive()` reading `canceled` also switched the
          // F1 double-billing guard off. Nothing is lost by skipping: the
          // `customer.subscription.created` that always follows binds the id
          // AND the status together.
          if (mirror && IRREVERSIBLE_STATUSES.has(mirror.status)) {
            console.warn(
              `[stripe-webhook] ${event.id} not repointing a ${mirror.status} mirror at ${subId} from a checkout event; the subscription snapshot will bind it`
            );
            return "ignored";
          }
          const attemptId = session.metadata?.respin_checkout_attempt_id;
          if (
            attemptId &&
            mirror?.tierCheckoutAttemptId &&
            attemptId !== mirror.tierCheckoutAttemptId
          ) {
            // A delayed event from an older attempt must never bind or repoint
            // the workspace while a newer durable attempt is authoritative.
            return "ignored";
          }
          if (mirror?.tierCheckoutFenceAt) {
            // The sentinel is the mixed-version fence: an old action sees an
            // incomplete live subscription and cannot create a legacy Session.
            // A partial checkout event may bind the exact Session but must not
            // remove or overwrite that sentinel. The full subscription snapshot
            // below binds id + status atomically and releases it.
            if (subId === mirror.tierCheckoutFenceSubscriptionId) {
              // This is a delayed Checkout event for the generation whose
              // death established the fence. It is historical evidence, not
              // the new generation the open attempt is waiting for.
              return "ignored";
            }
            if (
              (await getTierCheckoutProtocolState(tx)) === "active" &&
              !mirror.tierCheckoutAttemptId
            ) {
              throw new Error(
                `${event.type} ${event.id}: active tier Checkout protocol has no durable attempt for subscription ${subId}; refusing to advance its fence`
              );
            }
            if (mirror.tierCheckoutAttemptId) {
              await assertTierCheckoutEventProviderAuthority(
                tx,
                event,
                session,
                mirror
              );
            }
            if (
              mirror.tierCheckoutFenceObservedSubscriptionId &&
              mirror.tierCheckoutFenceObservedSubscriptionId !== subId
            ) {
              throw new Error(
                `${event.type} ${event.id}: fenced workspace already observed subscription ${mirror.tierCheckoutFenceObservedSubscriptionId}, but checkout ${session.id} names ${subId}; refusing to hide a possible duplicate subscription`
              );
            }
            if (mirror.tierCheckoutAttemptId && attemptId !== mirror.tierCheckoutAttemptId) {
              throw new Error(
                `${event.type} ${event.id}: subscription ${subId} is not bound to durable Checkout attempt ${mirror.tierCheckoutAttemptId}; refusing to replace its mixed-version fence`
              );
            }
            await tx
              .update(subscriptions)
              .set({
                stripeSubscriptionId: subId,
                tierCheckoutFenceObservedSubscriptionId: subId,
                ...(attemptId && attemptId === mirror.tierCheckoutAttemptId
                  ? {
                      tierCheckoutAttemptSessionId: session.id,
                      tierCheckoutAttemptSubscriptionId: subId,
                    }
                  : {}),
              })
              .where(eq(subscriptions.workspaceId, workspaceId));
            return "processed";
          }
          await tx
            .update(subscriptions)
            .set({
              stripeSubscriptionId: subId,
              ...(attemptId && attemptId === mirror?.tierCheckoutAttemptId
                ? { tierCheckoutAttemptSessionId: session.id }
                : {}),
            })
            .where(eq(subscriptions.workspaceId, workspaceId));
        }
        return "processed";
      }
      return "ignored";
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      if (!workspaceId) return "refused_unknown_customer";
      const eventAt = new Date(event.created * 1000);
      const [mirror] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);
      // Stripe does not guarantee delivery ORDER: a stale event must never
      // overwrite newer state (code-review CHANGE: order-blind mirror writes).
      if (mirror?.mirrorEventAt && mirror.mirrorEventAt.getTime() > eventAt.getTime()) {
        return "ignored";
      }
      if (
        mirror?.tierCheckoutFenceAt &&
        sub.id === mirror.tierCheckoutFenceSubscriptionId
      ) {
        // The fence retains the last dead subscription generation solely so
        // provider reconciliation can distinguish history from a new Checkout.
        // A delayed snapshot for that dead generation must not overwrite the
        // sentinel that keeps rolling old binaries from opening a legacy
        // Session.
        return "ignored";
      }
      if (
        mirror &&
        !mirror.tierCheckoutFenceAt &&
        mirror.stripeSubscriptionId !== sub.id &&
        hasLiveStripeSubscription(mirror)
      ) {
        throw new Error(
          `${event.type} ${event.id}: workspace already mirrors live subscription ${mirror.stripeSubscriptionId}, but the snapshot names ${sub.id}; refusing to hide a possible duplicate subscription. REMEDY: reconcile both provider subscriptions before redelivery`
        );
      }
      const advancesTierCheckoutFence = Boolean(
        mirror?.tierCheckoutFenceAt &&
          sub.id !== mirror.tierCheckoutFenceSubscriptionId
      );
      if (
        advancesTierCheckoutFence &&
        (await getTierCheckoutProtocolState(tx)) === "active" &&
        !mirror?.tierCheckoutAttemptId
      ) {
        throw new Error(
          `${event.type} ${event.id}: active tier Checkout protocol has no durable attempt for subscription ${sub.id}; refusing to release its fence`
        );
      }
      if (advancesTierCheckoutFence && mirror?.tierCheckoutAttemptId) {
        await assertTierCheckoutEventProviderAuthority(tx, event, sub, mirror);
      }
      if (
        advancesTierCheckoutFence &&
        mirror?.tierCheckoutAttemptId &&
        (sub.metadata?.workspace_id !== workspaceId ||
          sub.metadata?.respin_kind !== "tier_checkout" ||
          sub.metadata?.respin_checkout_attempt_id !==
            mirror.tierCheckoutAttemptId)
      ) {
        throw new Error(
          `${event.type} ${event.id}: subscription ${sub.id} would replace a durable Checkout fence but is not bound to attempt ${mirror.tierCheckoutAttemptId}; refusing to discard an open-attempt authority. REMEDY: reconcile both the incoming subscription and the saved Checkout Session in Stripe, then redeliver only after the duplicate-subscription risk is resolved`
        );
      }
      if (
        advancesTierCheckoutFence &&
        mirror?.tierCheckoutFenceObservedSubscriptionId &&
        mirror.tierCheckoutFenceObservedSubscriptionId !== sub.id
      ) {
        throw new Error(
          `${event.type} ${event.id}: fenced workspace already observed subscription ${mirror.tierCheckoutFenceObservedSubscriptionId}, but the full snapshot names ${sub.id}; refusing to hide a possible duplicate subscription`
        );
      }
      if (
        advancesTierCheckoutFence &&
        mirror?.tierCheckoutAttemptSubscriptionId &&
        mirror.tierCheckoutAttemptSubscriptionId !== sub.id
      ) {
        throw new Error(
          `${event.type} ${event.id}: durable Checkout attempt is bound to subscription ${mirror.tierCheckoutAttemptSubscriptionId}, but the full snapshot names ${sub.id}; refusing to release the fence for a different subscription`
        );
      }
      // TERMINAL guard — the resurrection rule the invoice writers already
      // have, which this one lacked (billing review finding 5). The order
      // guard above is STRICT (`>`), so an event whose `created` second EQUALS
      // the mirror's watermark is applied: `deleted` and a still-`active`
      // `updated` are emitted together at the end of a subscription's life and
      // routinely share a second, so whichever arrived second won — and if
      // that was `updated`, a canceled workspace went back to a paid tier with
      // no later event to correct it. Nothing in the payload can order two
      // events inside one second (Stripe exposes no sequence number), so
      // instead of pretending to order them this refuses the one direction
      // that costs money: a DEAD subscription never returns to life.
      //
      // Keyed on the subscription id, so a genuine RE-subscribe — which always
      // creates a new Stripe subscription — is unaffected and still mirrors.
      if (
        mirror &&
        IRREVERSIBLE_STATUSES.has(mirror.status) &&
        mirror.stripeSubscriptionId === sub.id &&
        !IRREVERSIBLE_STATUSES.has(sub.status)
      ) {
        console.warn(
          `[stripe-webhook] ${event.id} would lift subscription ${sub.id} out of terminal status ${mirror.status} → ${sub.status}; refusing (a dead subscription is never revived)`
        );
        return "ignored";
      }
      // Symmetric with invoice.paid's ambiguity refusal (billing review
      // finding 6): the mirror priced the tier off `items.data[0]` while the
      // invoice path refuses to guess between two lines. A multi-item
      // subscription would silently mirror ONE of its prices, and tier is
      // derived from that price at read time — so the workspace could be
      // charged for one plan and entitled to another. M1 sells single-item
      // subscriptions; there is no rule for which item is the plan.
      const items = sub.items?.data ?? [];
      if (items.length > 1) {
        throw new Error(
          `${event.type} ${event.id}: subscription ${sub.id} has ${items.length} items — M1 sells single-item subscriptions, so there is no rule for which item carries the plan price; refusing to mirror a guess. REMEDY: open subscription ${sub.id} in the Stripe dashboard and remove the extra item(s) so exactly one priced item remains, then the redelivery succeeds. Until then EVERY mirror update for this workspace is blocked, including pause/resume sync. Stripe will redeliver`
        );
      }
      // ZERO items fails closed (audit 2026-08-17 #29). The `items.length > 1`
      // refusal above has always existed; zero was accepted, and `item?.price
      // ?.id ?? null` then wrote a LIVE mirror with a null price. The result is
      // a paying workspace that renders as Free (state.ts resolves a null price
      // to `{tier: "free", reason: "unmapped_price"}`) while STILL being blocked
      // from starting a second checkout, because `hasLiveStripeSubscription`
      // reads the id and the status, not the price — so the customer can neither
      // use what they bought nor buy it again. Fail closed and let Stripe
      // redeliver, which is what every other unexpected-shape branch in this
      // file does.
      //
      // The installed SDK types `Subscription.items` as a non-optional list, so
      // for a genuine payload this never fires — same posture as the service
      // period refusal in `invoice.paid`: the types forbid the shape, and the
      // branch that used to fail OPEN on it is the one that cost money.
      if (items.length === 0) {
        throw new Error(
          `${event.type} ${event.id}: subscription ${sub.id} carries ZERO priced items, so there is no price to mirror — refusing to write a live subscription with a null price, which would render this paying workspace as Free while still blocking it from a second checkout. The installed SDK types \`items\` as always present, so an empty list means the API version or the object shape has changed. REMEDY: open subscription ${sub.id} in the Stripe dashboard and confirm it has exactly one priced item; compare the payload against the API version pinned in adapter.ts. Stripe will redeliver`
        );
      }
      const item = items[0];
      if (
        mirror?.mirrorEventAt?.getTime() === eventAt.getTime() &&
        mirror.stripeSubscriptionId === sub.id &&
        !mirrorMatchesSubscriptionSnapshot(mirror, sub) &&
        !(await providerConfirmsSubscriptionSnapshot(sub))
      ) {
        return "ignored";
      }
      const now = await getDbNow(tx);
      // Grace must NOT depend on delivery order (billing review finding 1).
      // `invoice.payment_failed` is what normally opens the 7-day window, but
      // it is order-guarded against this watermark: when Stripe delivers the
      // dunning `subscription.updated` (created one second later) FIRST, the
      // older payment_failed is correctly ignored — and the deadline it would
      // have written is then never written by anyone. `past_due` with a null
      // deadline derives to `free` in state.ts, so the customer lost the whole
      // grace period to a delivery-order coin flip. Opening the window here
      // too makes both orders converge on ONE deadline; payment_failed's own
      // "never EXTEND an existing deadline" rule is what keeps it single.
      //
      // Round 7 narrowed the "already has one" test from "a deadline exists"
      // to "a live deadline on a dunning mirror", so a recovery seen only as
      // `updated → active` could not leave the NEXT episode a short deadline.
      // REG-3 (audit P3-R4, R-159) replaces the liveness test with the episode
      // marker: `past_due` opens grace only when no episode is open, so a
      // lapsed deadline inside one unpaid episode is never renewed here.
      const opensGrace = sub.status === "past_due" && opensDunningEpisode(mirror);
      const endsEpisode = dunningEndedBy(sub.status, eventAt, mirror);
      const graceDays = opensGrace
        ? (await getActiveConfig(tx)).content.graceDays
        : null;
      await tx
        .update(subscriptions)
        .set({
          stripeSubscriptionId: sub.id,
          stripePriceId: item?.price?.id ?? null,
          status: sub.status,
          currentPeriodStart: item ? new Date(item.current_period_start * 1000) : null,
          currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          // BOTH, because Stripe expresses one fact two ways and the evidence
          // run proved the boolean alone is not enough: a Customer Portal
          // cancellation arrived as {cancel_at: <ts>, cancel_at_period_end:
          // FALSE, status: active}. `scheduledCancelAt` (state.ts) is the ONE
          // reader that turns the pair into a date.
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
          mirrorEventAt: eventAt,
          // A full snapshot for a subscription different from the generation
          // that opened the durable Checkout is the only webhook proof that the
          // attempt advanced. Clear all attempt authority atomically with that
          // full mirror write. A stale update for the old generation cannot
          // clear a newer attempt.
          ...(advancesTierCheckoutFence
            ? {
                tierCheckoutGenerationAttemptId:
                  mirror!.tierCheckoutAttemptId,
                ...CLEAR_TIER_CHECKOUT_ATTEMPT,
                ...CLEAR_TIER_CHECKOUT_FENCE,
              }
            : {}),
          // A snapshot that lands an IRREVERSIBLE status is a death notice, and
          // must leave exactly what `customer.subscription.deleted` leaves —
          // including overriding the `cancel_at_period_end: true` the payload
          // itself still carries on a canceled object (see
          // DEAD_SUBSCRIPTION_FIELDS). Spread AFTER the payload fields so the
          // death rule wins.
          ...(IRREVERSIBLE_STATUSES.has(sub.status)
            ? DEAD_SUBSCRIPTION_FIELDS
            : {}),
          // Grace is opened here when `past_due` arrives without a LIVE
          // deadline (the order-independence fix above); it is cleared only by
          // a paid invoice. Round 5 also cleared it on an ACTIVE status, which
          // the round-6 gate reproduced as a hazard: `invoice.payment_failed`
          // deliberately does not stamp `mirrorEventAt`, so the watermark
          // carries no information about a deadline's age and the order guard
          // above cannot protect it — an OLDER `active` snapshot wiped a live
          // deadline and served the paid tier to a non-payer. The stale-across-
          // episodes problem that clear was for is now solved where it belongs,
          // in the never-EXTEND rule itself: an EXPIRED deadline is not a live
          // one, so a later episode opens a fresh window without anyone having
          // to clear anything.
          ...(graceDays !== null
            ? {
                graceExpiresAt: new Date(now.getTime() + graceDays * 86_400_000),
                // The episode's start, on Stripe's clock (R-159).
                dunningStartedAt: eventAt,
              }
            : {}),
          // THE ONE CLEAR ON `active`, WATERMARKED BY THE MARKER (R-159). The
          // round-6 objection recorded above is that `mirrorEventAt` cannot
          // order a deadline. The marker carries the episode's own time, so an
          // `active` snapshot newer than it is a genuine recovery and ends the
          // episode — without this, the next real failure would find a stale
          // marker and get no grace at all — while an older snapshot fails
          // `dunningEndedBy` and leaves both standing.
          ...(endsEpisode
            ? { dunningStartedAt: null, graceExpiresAt: null }
            : {}),
        })
        .where(eq(subscriptions.workspaceId, workspaceId));

      // A snapshot that landed an IRREVERSIBLE status is a DEATH NOTICE, and a
      // dead subscription is never paused (audit 2026-08-17 #5). Handled here,
      // ahead of the ordinary pause sync, because a canceled payload can still
      // carry `pause_collection` — and feeding that to `ensurePauseStarted`
      // would OPEN a pause on a subscription that no longer exists, which is the
      // drift state #5 is about, manufactured by our own writer.
      //
      // Both calls, in this order, and both through pause.ts (the sole writer of
      // `pausedAt` — see the note under DEAD_SUBSCRIPTION_FIELDS):
      //   - `ensurePauseEnded` closes an OPEN period and clears the mirror with
      //     it. It is `eventAt`-bounded, so a snapshot that predates a pause the
      //     owner opened later correctly declines to close it;
      //   - `clearPauseMirror` then converges the mirror when NO period is open
      //     — the exact "paused with no open pause period" drift `pause.ts`'s own
      //     docblock concedes is reachable, and the state that made a canceled
      //     subscription render as a paid paused tier forever.
      // `clearPauseMirror` refuses while a pause is genuinely open, so if the
      // bounded close above declined, this cannot undo it.
      if (IRREVERSIBLE_STATUSES.has(sub.status)) {
        await ensurePauseEnded(tx, workspaceId, now, eventAt);
        await clearPauseMirror(tx, workspaceId);
        return "processed";
      }

      // Pause mirror sync — convergent by construction, through the SAME
      // helpers the owner action uses (pause.ts), so neither writer can throw
      // at the other's ordering and the two paths cannot drift apart.
      const paused = sub.pause_collection != null;
      if (paused) {
        const resumesAt = sub.pause_collection?.resumes_at
          ? new Date(sub.pause_collection.resumes_at * 1000)
          : undefined;
        // `eventAt` bounds what this snapshot can know, SYMMETRICALLY with the
        // ensurePauseEnded call below (billing round-10 NOTE 3): a snapshot
        // created before the owner RESUMED must not re-open the pause it is
        // still reporting, because `resumeSubscription` does not stamp
        // `mirrorEventAt` and the order guard above therefore cannot see it.
        await ensurePauseStarted(tx, workspaceId, now, resumesAt, eventAt);
      } else {
        // `eventAt` bounds what this snapshot can know: a pause that started
        // AFTER this event was created is invisible to it, and closing it would
        // silently undo an owner pause the reconciling webhook has not seen yet
        // (billing round-7 NOTE — the pause writer and this watermark are on
        // different clocks, because `pauseSubscription` deliberately does not
        // stamp `mirrorEventAt`).
        //
        // PAIRED WITH `clearPauseMirror`, like the irreversible branch above
        // and `resumeSubscription` (billing gate, 2026-08-18). This branch was
        // the only one of the three that closed the PERIOD without converging
        // the MIRROR, and `state.ts` reads the mirror. The gap only shows on a
        // row that is already drifted: `{canceled, pausedAt: <stale>}` is inert
        // while the subscription stays dead, but a RE-SUBSCRIBE restores
        // liveness and the stale flag comes back to life — the workspace then
        // renders `paused`, and is refused a pack purchase, on a subscription
        // it has just bought. Safe for the same reason as the sibling call:
        // `clearPauseMirror` refuses while a period is genuinely open, so a
        // bounded decline above makes this a no-op rather than an override.
        if (!(await ensurePauseEnded(tx, workspaceId, now, eventAt))) {
          await clearPauseMirror(tx, workspaceId);
        }
      }
      return "processed";
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      if (!workspaceId) return "refused_unknown_customer";
      const eventAt = new Date(event.created * 1000);
      const [prior] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);
      // This was the one mirror writer that stamped the watermark without
      // reading it (code-review CHANGE). A redelivered OLD `deleted` for a
      // previous subscription would otherwise cancel a workspace that has
      // since re-subscribed — and close its open pause on the way through.
      if (prior?.mirrorEventAt && prior.mirrorEventAt.getTime() > eventAt.getTime()) {
        return "ignored";
      }
      if (
        prior?.mirrorEventAt?.getTime() === eventAt.getTime() &&
        prior.stripeSubscriptionId === sub.id &&
        !IRREVERSIBLE_STATUSES.has(prior.status) &&
        !(await providerConfirmsSubscriptionSnapshot(sub))
      ) {
        return "ignored";
      }
      // The mirror image of the checkout guard above: a `deleted` for an OLD
      // subscription must not cancel the CURRENT one. This branch writes
      // `stripeSubscriptionId: sub.id` unconditionally, so without this a late
      // cancellation of sub_1 — arriving after the workspace re-subscribed on
      // sub_2, which is an ordinary flow when the cancel event is delayed —
      // would both cancel the live subscription and repoint the mirror at the
      // dead one, taking the pause with it.
      const fencedDeletion = Boolean(
        prior?.tierCheckoutFenceAt &&
          sub.id !== prior.tierCheckoutFenceSubscriptionId
      );
      if (
        fencedDeletion &&
        (await getTierCheckoutProtocolState(tx)) === "active" &&
        !prior?.tierCheckoutAttemptId
      ) {
        throw new Error(
          `customer.subscription.deleted ${event.id}: active tier Checkout protocol has no durable attempt for subscription ${sub.id}; refusing to advance its fence`
        );
      }
      if (fencedDeletion && prior?.tierCheckoutAttemptId) {
        await assertTierCheckoutEventProviderAuthority(tx, event, sub, prior);
      }
      if (
        fencedDeletion &&
        prior?.tierCheckoutAttemptId &&
        (sub.metadata?.workspace_id !== workspaceId ||
          sub.metadata?.respin_kind !== "tier_checkout" ||
          sub.metadata?.respin_checkout_attempt_id !==
            prior.tierCheckoutAttemptId)
      ) {
        throw new Error(
          `customer.subscription.deleted ${event.id}: subscription ${sub.id} is not bound to durable Checkout attempt ${prior.tierCheckoutAttemptId}; refusing to discard its authority`
        );
      }
      if (
        fencedDeletion &&
        prior?.tierCheckoutFenceObservedSubscriptionId &&
        prior.tierCheckoutFenceObservedSubscriptionId !== sub.id
      ) {
        throw new Error(
          `customer.subscription.deleted ${event.id}: fenced workspace observed ${prior.tierCheckoutFenceObservedSubscriptionId}, but deletion names ${sub.id}; refusing ambiguous terminal authority`
        );
      }
      if (
        fencedDeletion &&
        prior?.tierCheckoutAttemptSubscriptionId &&
        prior.tierCheckoutAttemptSubscriptionId !== sub.id
      ) {
        throw new Error(
          `customer.subscription.deleted ${event.id}: durable Checkout attempt is bound to subscription ${prior.tierCheckoutAttemptSubscriptionId}, but deletion names ${sub.id}; refusing ambiguous terminal authority`
        );
      }
      if (
        !fencedDeletion &&
        prior?.stripeSubscriptionId &&
        prior.stripeSubscriptionId !== sub.id
      ) {
        console.warn(
          `[stripe-webhook] ${event.id} cancels ${sub.id} but the mirror holds ${prior.stripeSubscriptionId}; refusing to cancel a different subscription`
        );
        return "ignored";
      }
      const now = await getDbNow(tx);
      await ensurePauseEnded(tx, workspaceId, now);
      // `ensurePauseEnded` is a NO-OP when no open `pause_periods` row exists,
      // and that is precisely the audit #5 drift state: a mirror saying
      // `pausedAt` with no open period. The cancellation then left
      // {status: canceled, pausedAt: <set>, resumesAt: <stale>} behind, which
      // `state.ts` rendered as a paid PAUSED tier forever — a dead subscription
      // emits no further events, so nothing was ever coming to correct it.
      // Converging the mirror here closes it at the writer; `state.ts`'s new
      // liveness gate on the paused branch is the read-side half, and both are
      // wanted (this one stops NEW drift, that one makes rows already on disk
      // read honestly). Through pause.ts, the sole writer of `pausedAt`.
      await clearPauseMirror(tx, workspaceId);
      await tx
        .update(subscriptions)
        .set({
          status: fencedDeletion ? "incomplete" : "canceled",
          stripeSubscriptionId: fencedDeletion
            ? `checkout_fence:${workspaceId}`
            : sub.id,
          mirrorEventAt: new Date(event.created * 1000),
          // Nothing reset these fields before round 6, and no further events
          // exist for a dead subscription to reset them later — so whatever
          // they said at death is what every later reader inherited (billing +
          // tenancy round-6 BLOCK for cancelAtPeriodEnd, billing round-7
          // CHANGE 1 for the auto-top-up authority). One definition, shared
          // with the mirror writer above, so the two cannot drift.
          ...DEAD_SUBSCRIPTION_FIELDS,
          ...(fencedDeletion
            ? {
                tierCheckoutGenerationAttemptId:
                  prior!.tierCheckoutAttemptId,
                ...CLEAR_TIER_CHECKOUT_ATTEMPT,
                // A deletion can beat the first full snapshot. Preserve the
                // mixed-version sentinel, but move its historical generation
                // forward to the subscription Stripe has now proven dead. A
                // delayed `created` for this exact id is then history, while a
                // later explicit Checkout attempt can establish a new one.
                tierCheckoutFenceSubscriptionId: sub.id,
                tierCheckoutFenceStatus: sub.status,
                tierCheckoutFenceObservedSubscriptionId: null,
              }
            : {}),
        })
        .where(eq(subscriptions.workspaceId, workspaceId));
      return "processed";
    }

    case "invoice.paid": {
      let invoice = event.data.object as Stripe.Invoice;
      if (!workspaceId) return "refused_unknown_customer";
      // Cycle-only grants (plan-review F2): proration/one-off invoice.paid
      // shapes are IGNORED with zero ledger writes — never a throw on money
      // already taken. Mid-cycle upgrades grant at the next anniversary (R-20).
      if (
        !invoice.billing_reason ||
        !GRANT_BILLING_REASONS.has(invoice.billing_reason)
      ) {
        return "ignored";
      }

      // SERVICE period and price BOTH come from the SUBSCRIPTION line, chosen
      // by discriminator (never by position — see subscriptionLineOf).
      // invoice.period_end is "the latest timestamp at which invoice items can
      // be associated with this invoice" (SDK docs) — creation time on a
      // subscription_create invoice, which destroyed REQ-G02's rollover.
      invoice = await withCompleteInvoiceLines(invoice, event.id);
      const lines = subscriptionLinesOf(invoice);
      const [mirror] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);
      const subscriptionMetadata =
        invoice.parent?.subscription_details?.metadata ?? null;
      let invoiceAuthority: TierInvoiceAuthority | null = null;
      const providerAttemptId = subscriptionMetadata?.respin_checkout_attempt_id;
      if (providerAttemptId) {
        await assertAutoTopupProtocolRecoveryReady(tx);
        const rollout = await assertTierCheckoutProtocolRecoveryReady(tx);
        const invoiceCustomerId = objectId(invoice.customer);
        if (!invoiceCustomerId) {
          throw new Error(
            `invoice.paid ${event.id}: signed tier authority has no customer identity`
          );
        }
        const generationAuthority = verifyTierCheckoutAuthority(
          subscriptionMetadata,
          {
            attemptId: providerAttemptId,
            workspaceId,
            customerId: invoiceCustomerId,
          },
          {
            accountId: rollout.stripeAccountId!,
            livemode: rollout.stripeLivemode!,
          }
        );
        if (
          event.livemode !== generationAuthority.stripeLivemode ||
          invoice.livemode !== generationAuthority.stripeLivemode ||
          (event.account !== undefined &&
            event.account !== generationAuthority.stripeAccountId)
        ) {
          throw new Error(
            `invoice.paid ${event.id}: event or invoice differs from signed tier provider authority`
          );
        }
      }

      // AUDIT #4 — WHICH subscription generated this invoice? Checked BEFORE any
      // grant or status write, and before the shape refusals below, because a
      // mismatched invoice should not be able to throw this workspace into a
      // Stripe retry loop over a shape that was never ours to grant from.
      // `billing_reason` has already established this is a subscription invoice.
      const invoiceSubId = invoiceSubscriptionId(invoice);
      if (invoiceSubId === null) {
        throw new Error(
          `invoice.paid ${event.id}: billing_reason ${invoice.billing_reason} implies a subscription generated this invoice, but no subscription id could be read from \`parent.subscription_details.subscription\` — refusing to grant an allowance that cannot be attributed to a subscription. The installed SDK types that field as \`string | Subscription\` and always present for a subscription invoice, so its absence means the API version or the object shape has changed. REMEDY: compare invoice ${invoice.id ?? "(no id)"} against the API version pinned in adapter.ts. Stripe will redeliver`
        );
      }
      const expectedV1AttemptId =
        mirror?.tierCheckoutGenerationAttemptId &&
        (mirror.stripeSubscriptionId === invoiceSubId ||
          mirror.tierCheckoutFenceSubscriptionId === invoiceSubId)
          ? mirror.tierCheckoutGenerationAttemptId
          : null;
      if (expectedV1AttemptId && providerAttemptId !== expectedV1AttemptId) {
        throw new Error(
          `invoice.paid ${event.id}: subscription ${invoiceSubId} belongs to signed tier generation ${expectedV1AttemptId}, but the invoice omitted or changed that authority`
        );
      }
      let boundMirrorSubId = mirror?.stripeSubscriptionId ?? null;
      const invoiceIsForRetainedDeadGeneration = Boolean(
        mirror?.tierCheckoutFenceAt &&
          mirror.tierCheckoutFenceSubscriptionId === invoiceSubId
      );
      if (mirror?.tierCheckoutFenceAt && !invoiceIsForRetainedDeadGeneration) {
        if (
          (await getTierCheckoutProtocolState(tx)) === "active" &&
          !mirror.tierCheckoutAttemptId
        ) {
          throw new Error(
            `invoice.paid ${event.id}: active tier Checkout protocol has no durable attempt for subscription ${invoiceSubId}; refusing to grant or advance its fence`
          );
        }
        if (mirror.tierCheckoutAttemptId) {
          await assertTierCheckoutEventProviderAuthority(
            tx,
            event,
            invoice,
            mirror
          );
        }
        if (
          mirror.tierCheckoutAttemptId &&
          (subscriptionMetadata?.workspace_id !== workspaceId ||
            subscriptionMetadata?.respin_kind !== "tier_checkout" ||
            subscriptionMetadata?.respin_checkout_attempt_id !==
              mirror.tierCheckoutAttemptId)
        ) {
          throw new Error(
            `invoice.paid ${event.id}: subscription ${invoiceSubId} is not bound to durable Checkout attempt ${mirror.tierCheckoutAttemptId}; refusing to grant or discard the invoice while duplicate-subscription risk is unresolved`
          );
        }
        if (
          mirror.tierCheckoutFenceObservedSubscriptionId &&
          mirror.tierCheckoutFenceObservedSubscriptionId !== invoiceSubId
        ) {
          throw new Error(
            `invoice.paid ${event.id}: fenced workspace already observed subscription ${mirror.tierCheckoutFenceObservedSubscriptionId}, but this paid invoice names ${invoiceSubId}; refusing to hide a possible duplicate subscription`
          );
        }
        if (!mirror.tierCheckoutFenceObservedSubscriptionId) {
          await tx
            .update(subscriptions)
            .set({
              stripeSubscriptionId: invoiceSubId,
              tierCheckoutFenceObservedSubscriptionId: invoiceSubId,
              ...(mirror.tierCheckoutAttemptId
                ? { tierCheckoutAttemptSubscriptionId: invoiceSubId }
                : {}),
            })
            .where(eq(subscriptions.workspaceId, workspaceId));
        }
        boundMirrorSubId = invoiceSubId;
      }
      if (invoiceIsForRetainedDeadGeneration) {
        // Preserve the long-standing policy that a paid invoice for the dead
        // subscription may still receive the allowance it paid for. It is not,
        // however, evidence of the new Checkout generation: use the retained
        // id only for this invoice's identity check and do not bind any fence
        // or attempt field to it.
        boundMirrorSubId = invoiceSubId;
      }
      if (!invoiceMatchesMirror(invoiceSubId, boundMirrorSubId)) {
        if (providerAttemptId) {
          throw new Error(
            `invoice.paid ${event.id}: signed tier generation ${providerAttemptId} names subscription ${invoiceSubId}, but this workspace is bound to ${boundMirrorSubId ?? "(none)"}; refusing to consume a possible duplicate paid subscription without reconciliation`
          );
        }
        // `ignored`, not a throw: this invoice is genuinely not ours to act on,
        // and a throw would make Stripe redeliver it forever. Diagnosable by
        // ids alone (D-M1-6: ids in the log, never payload fields).
        console.warn(
          `[stripe-webhook] ${event.id} invoice ${invoice.id ?? "(no id)"} was generated by subscription ${invoiceSubId}, but this workspace's mirror is bound to ${boundMirrorSubId ?? "(none)"} — ignoring; an allowance is never granted for a subscription the mirror does not hold`
        );
        return "ignored";
      }

      if (providerAttemptId) {
        const resolved = await resolveTierInvoiceAuthority(
          tx,
          event,
          invoice,
          workspaceId,
          providerAttemptId,
          options
        );
        invoiceAuthority = resolved.authority;
        receiptContext.tierInvoiceAuthority = resolved.metadata;
      }

      // D-AUDIT-1 / REQ-G08 — "While paused: no charges, no monthly grants."
      // Placed after the identity check (an invoice for the wrong subscription
      // is not ours to reason about at all) and BEFORE the shape refusals, so a
      // during-pause invoice never turns into a permanent Stripe retry loop over
      // a line-item shape. See `prePauseGrantDecision` for the full reasoning
      // and R-25 for the recorded policy.
      const pauseDecision = prePauseGrantDecision(
        await openPauseStartedKnownAt(tx, workspaceId),
        event
      );
      if (pauseDecision.paused && !pauseDecision.allowed) {
        console.warn(
          `[stripe-webhook] ${event.id} type=${event.type} invoice=${invoice.id ?? "(no id)"} pause=during-pause → ignored: the workspace has an open pause whose knowledge time precedes this event by ${pauseDecision.lagMs}ms (tolerance ${CLOCK_SKEW_MS}ms), so this is a genuine during-pause invoice and REQ-G08 forbids the monthly grant (D-AUDIT-1). NO credits were minted and NO ledger row was written. A paid invoice during a \`behavior: "void"\` pause should not exist — reconcile invoice ${invoice.id ?? "(no id)"} by hand`
        );
        return "ignored";
      }
      if (pauseDecision.paused) {
        console.warn(
          `[stripe-webhook] ${event.id} type=${event.type} invoice=${invoice.id ?? "(no id)"} pause=pre-pause-race → granting: the event predates the open pause's knowledge time by ${-pauseDecision.lagMs}ms (within the ${CLOCK_SKEW_MS}ms tolerance), which is the ONE accepted exception to REQ-G08 recorded in R-25/D-AUDIT-1 — a pre-pause invoice delivered late`
        );
      }
      // A grant-bearing invoice with NO recurring subscription line is not a
      // shape we understand: falling through would price the allowance off the
      // mirror while the customer was charged for something else. Fail closed
      // FIRST, so the diagnosis names the real problem, not its symptom.
      if (lines.length === 0) {
        throw new Error(
          `invoice.paid ${event.id}: billing_reason ${invoice.billing_reason} implies a subscription allowance, but no line item is a non-proration "subscription_item_details" line — refusing to grant from a proration or a non-subscription line; Stripe will redeliver`
        );
      }
      // Two recurring lines means a multi-item subscription, which M1 does not
      // sell. Picking one would be a guess about which price is the allowance.
      if (lines.length > 1) {
        throw new Error(
          `invoice.paid ${event.id}: ${lines.length} recurring subscription lines on one invoice — M1 sells single-item subscriptions, so there is no rule for which line carries the allowance; Stripe will redeliver`
        );
      }
      const line = lines[0]!;

      // The service period is REQUIRED, both ends, with no fallback (billing
      // review finding 8). The installed SDK types it non-nullable
      // (`period: { start: number; end: number }` in InvoiceLineItems.d.ts), so
      // for a genuine payload this refusal never fires — but the two branches
      // it replaces both failed OPEN on the shape the types forbid: a missing
      // `end` silently priced the expiry off `mirror.currentPeriodEnd` (which
      // can belong to a DIFFERENT cycle than the invoice being paid), and a
      // missing `start` skipped the monthly-interval guard entirely, handing an
      // annual subscriber one month of credits — the exact defect BLOCKER 3
      // was raised to close. Guessing an expiry is the thing this handler
      // refuses to do everywhere else; it now refuses here too.
      const periodStart = line.period?.start;
      const periodEnd = line.period?.end;
      if (typeof periodStart !== "number" || typeof periodEnd !== "number") {
        throw new Error(
          `invoice.paid ${event.id}: the subscription line item carries no complete service period (start=${String(periodStart)}, end=${String(periodEnd)}) — refusing to guess a credit expiry or to skip the monthly-interval check. The installed SDK types this field as always present, so a payload without it means the API version or the line shape has changed. REMEDY: inspect invoice ${invoice.id ?? "(no id)"} in the Stripe dashboard and compare its line items against the version pinned in adapter.ts; the allowance cannot be dated until one of the two is corrected. Stripe will redeliver`
        );
      }
      const servicePeriodEnd = new Date(periodEnd * 1000);

      // REQ-G02 assumes a MONTHLY allowance (expiry = period end + 1 month).
      // An annual price would silently hand a year's subscriber one month of
      // credits, and `stripePriceMap` records tier WITHOUT interval, so config
      // can already express what this code cannot honour (code-review BLOCK).
      //
      // The guard measures the SERVICE PERIOD, not the price's `recurring`
      // interval, because the interval is not in the payload: a line item's
      // only route to it is `pricing.price_details.price`, which is a bare
      // price ID string unless the caller expanded it — and webhook payloads
      // are not expanded. The previous attempt read a `price.recurring` that
      // does not exist on `InvoiceLineItem` at all (a cast hid that from the
      // compiler), so it was dead code failing OPEN to the monthly assumption.
      // The service period is always present and is the thing REQ-G02's
      // rollover arithmetic actually depends on.
      //
      // The BAND is config, not a constant (billing round-7 CHANGE 3): it
      // decides whether a PAID invoice grants or throws, and a threshold that
      // can turn real money into a permanent Stripe retry loop must be
      // operator-adjustable without a deploy (B5). The config read moved above
      // this guard so the message can quote the active band and version.
      const legacyConfig = invoiceAuthority ? null : await getActiveConfig(tx);
      const version = invoiceAuthority?.configVersion ?? legacyConfig!.version;
      const band =
        invoiceAuthority?.monthlyPeriodDays ?? legacyConfig!.content.monthlyPeriodDays;
      const periodDays = (periodEnd - periodStart) / 86_400;
      if (periodDays < band.min || periodDays > band.max) {
        throw new Error(
          `invoice.paid ${event.id}: the subscription line covers ${periodDays.toFixed(1)} days of service, which is outside the monthly band config \`monthlyPeriodDays\` = ${band.min}–${band.max} days (active config version ${version}). Allowances are monthly (REQ-G02: expiry = service period end + 1 month), so a non-monthly price would be granted one month of credits. REMEDY, whichever fits: (a) if this IS a legitimate monthly cycle, widen \`monthlyPeriodDays\` in /admin/config — config is versioned and append-only, so the change is live immediately with no deploy; (b) if it is a non-monthly price, remove it from \`stripePriceMap\` so it stops being sold. Either way this invoice SELF-HEALS: nothing was granted and no event row was kept, so Stripe's next redelivery grants once the active config accepts this period. Until then Stripe keeps retrying and this workspace has no allowance for the period it paid for`
        );
      }

      // The allowance follows the price the INVOICE actually charged; the
      // mirror is only a fallback (it may already hold a newer price, and an
      // invoice.paid can arrive before subscription.created).
      const priceId = priceIdOfLine(line) ?? mirror?.stripePriceId ?? null;
      const tier = priceId
        ? invoiceAuthority?.tier ?? legacyConfig?.content.stripePriceMap[priceId]
        : undefined;
      if (tier !== "creator" && tier !== "pro" && tier !== "studio") {
        // Unmapped price on a GRANT-BEARING invoice: fail closed by throwing —
        // the whole tx (incl. the event row) rolls back, Stripe retries, and a
        // config fix self-heals (D-M1 read-time mapping).
        throw new Error(
          `invoice.paid ${event.id}: price ${priceId ?? "(none on invoice or mirror)"} is not mapped to a tier in the active config — map it in /admin/config; Stripe will redeliver`
        );
      }

      // ONE allowance per INVOICE, symmetric with the per-session pack rule
      // (code-review CHANGE): the event-id unique cannot dedupe two event ids
      // carrying the same invoice. Pre-check so the second converges quietly;
      // credit_ledger_invoice_grant_uq is the guarantee under concurrency.
      // The invoice id IS the idempotency key here, so falling back to the
      // event id would silently degrade the per-INVOICE unique to a
      // per-EVENT one — exactly when it matters: two events carrying one
      // idless invoice would mint two allowances, which is the defect
      // credit_ledger_invoice_grant_uq exists to make structurally impossible
      // (billing round-7 NOTE). Refuse instead: Stripe retries, and a shape
      // that genuinely has no id needs a human, not a guess.
      if (!invoice.id) {
        throw new Error(
          `invoice.paid ${event.id}: the invoice carries no id, so the allowance cannot be made idempotent per invoice — refusing to grant against the event id, which would let a second event carrying the same invoice mint a second allowance. The installed SDK types \`Invoice.id\` as always present on a real invoice, so a payload without one means the API version or the object shape has changed. REMEDY: compare this event's payload against the API version pinned in adapter.ts. Stripe will redeliver`
        );
      }
      const invoiceRef = invoice.id;
      const [alreadyGranted] = await tx
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.workspaceId, workspaceId),
            eq(creditLedger.refType, "invoice"),
            eq(creditLedger.refId, invoiceRef)
          )
        )
        .limit(1);
      if (alreadyGranted) {
        console.warn(
          `[stripe-webhook] ${event.id} invoice ${invoiceRef} already granted — ignoring the second event carrying it`
        );
        return "ignored";
      }

      await grantCredits(tx, {
        workspaceId,
        amount:
          invoiceAuthority?.allowance ??
          legacyConfig!.content.allowances[tier],
        // REQ-G02: expiry at service period_end + 1 month IS the rollover.
        expiresAt: addMonthsUtc(servicePeriodEnd, 1),
        stripeEventId: event.id,
        refType: "invoice",
        refId: invoiceRef,
        configVersion: version,
        tierCheckoutAttemptId: invoiceAuthority?.checkoutAttemptId ?? undefined,
      });
      // Payment recovered → clear grace, and lift a dunning status back to
      // active ONLY while the subscription is still alive.
      //
      // A TERMINAL subscription is never revived here (code-review BLOCK):
      // this branch used to set "active" whenever a grace deadline existed, so
      // a late or final invoice.paid after cancellation — the customer paying
      // the still-open invoice from Stripe's emailed link, or an out-of-order
      // delivery — resurrected a canceled workspace to a paid tier
      // permanently, with no later event that would ever correct it. Clearing
      // the stale deadline is still right: `canceled` already derives to free.
      //
      // ORDER-GUARDED as of audit 2026-08-17 #3 (see `invoiceIsStale`). The
      // clear used to be unconditional while the status lift beside it was
      // guarded — the asymmetry the correctness critic reported — so a STALE
      // paid invoice ended a LIVE dunning window early and dropped a paying
      // customer to free.
      //
      // The ORDER reason only, deliberately NOT `!invoiceMayWriteStatus`: that
      // predicate also refuses on TERMINAL, and on a terminal mirror clearing
      // the deadline is still right — `canceled` derives to free regardless, so
      // the clear is tidy-up rather than a downgrade, and the round-4 comment
      // below says so. A stale event on a terminal mirror therefore leaves the
      // deadline standing, and that costs nothing: `state.ts` reads
      // `graceExpiresAt` ONLY inside its `past_due` branch, which a terminal
      // status never reaches. Asserted both ways in stripe.test.ts rather than
      // claimed here.
      if (
        !invoiceIsForRetainedDeadGeneration &&
        (mirror?.graceExpiresAt || mirror?.dunningStartedAt) &&
        !invoiceIsStale(mirror, event)
      ) {
        const revivable =
          invoiceMayWriteStatus(mirror, event) && !ACTIVE_STATUSES.has(mirror.status);
        await tx
          .update(subscriptions)
          .set({
            graceExpiresAt: null,
            // A paid invoice ends the unpaid episode (R-159).
            dunningStartedAt: null,
            ...(revivable ? { status: "active" } : {}),
          })
          .where(eq(subscriptions.workspaceId, workspaceId));
      }
      return "processed";
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (!workspaceId) return "refused_unknown_customer";
      // A failed ONE-OFF invoice on the same customer must not push the
      // SUBSCRIPTION into dunning (code-review CHANGE): invoice.paid tests
      // subscription-relatedness and this branch did not.
      if (!isSubscriptionInvoice(invoice)) return "ignored";
      const { content } = await getActiveConfig(tx);
      const now = await getDbNow(tx);
      const [mirror] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);
      // Terminal + order guarded like every other status write (code-review
      // BLOCK): this was the ONE unguarded status writer of four.
      if (!invoiceMayWriteStatus(mirror, event)) return "ignored";
      // AUDIT #4, the dunning half. `isSubscriptionInvoice` above established
      // that A subscription generated this invoice; this establishes it was
      // THIS one. Without it, a late `invoice.payment_failed` belonging to a
      // superseded subscription could push the workspace's CURRENT, healthy
      // subscription into dunning — opening a grace window and downgrading a
      // paying customer on the strength of an old subscription's failure.
      //
      // `ignored` rather than a throw, unlike the grant path: nothing is minted
      // here, so there is no money to protect by forcing a redelivery, and a
      // throw would have Stripe retry an event that will never become ours.
      const failedSubId = invoiceSubscriptionId(invoice);
      if (
        failedSubId !== null &&
        !invoiceMatchesMirror(failedSubId, mirror?.stripeSubscriptionId ?? null)
      ) {
        console.warn(
          `[stripe-webhook] ${event.id} failed invoice ${invoice.id ?? "(no id)"} belongs to subscription ${failedSubId}, but this workspace's mirror is bound to ${mirror?.stripeSubscriptionId ?? "(none)"} — ignoring; a superseded subscription's failure never puts the current one into dunning`
        );
        return "ignored";
      }
      // ONE DEADLINE PER UNPAID EPISODE (audit P3-R4, R-159). A failure
      // inside an open episode writes `past_due` alone, whether that
      // episode's deadline is live or has LAPSED — gating on liveness was
      // REG-3: a third failure after the first deadline lapsed re-opened grace
      // and kept a non-payer on the paid tier. A NULL marker (the first
      // failure, or one after a recovery cleared it) opens a fresh `graceDays`
      // window stamped with Stripe's event time.
      await tx
        .update(subscriptions)
        .set({
          status: "past_due",
          ...(opensDunningEpisode(mirror)
            ? {
                graceExpiresAt: new Date(
                  now.getTime() + content.graceDays * 86_400_000
                ),
                dunningStartedAt: new Date(event.created * 1000),
              }
            : {}),
        })
        .where(eq(subscriptions.workspaceId, workspaceId));
      return "processed";
    }

    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.respin_kind !== "auto_topup") return "ignored";
      if (!workspaceId) return "refused_unknown_customer";
      if (pi.metadata?.workspace_id !== workspaceId) {
        return "refused_identity_mismatch";
      }
      const attemptId = pi.metadata?.respin_attempt_id;
      if (!attemptId) return "ignored"; // Protocol-0 had no durable attempt.
      const rollout = await assertAutoTopupProtocolRecoveryReady(tx);
      if (
        rollout.stripeLivemode !== event.livemode ||
        rollout.stripeLivemode !== pi.livemode ||
        (event.account !== undefined &&
          event.account !== rollout.stripeAccountId)
      ) {
        throw new AutoTopupAttemptIntegrityError(
          `terminal event ${pi.id} does not match the rollout livemode binding`
        );
      }
      const authority = verifyAutoTopupAuthority(pi, workspaceId);
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);
      if (!sub) return "refused_unknown_customer";
      const pending = pendingAutoTopupAttempt(sub);
      if (!pending || pending.id !== attemptId) return "ignored";
      if (
        authority.attemptId !== pending.id ||
        authority.periodMonthUtc !== pending.periodMonthUtc ||
        authority.amountCents !== pending.amountCents ||
        authority.currency !== pending.currency ||
        authority.priceId !== pending.priceId ||
        authority.credits !== pending.credits ||
        authority.validityMonths !== pending.validityMonths ||
        authority.configVersion !== pending.configVersion ||
        authority.customerId !== pending.customerId ||
        (pending.paymentIntentId !== null && pending.paymentIntentId !== pi.id)
      ) {
        throw new AutoTopupAttemptIntegrityError(
          `terminal event ${pi.id} does not match stored attempt ${attemptId}`
        );
      }
      // A failure event is conclusive provider identity even when the original
      // response was lost. Bind its PI id/status before returning so the
      // request path can never create another PI after idempotency expiry.
      await bindPendingAutoTopupPaymentIntent(tx, workspaceId, pending, pi);
      return "processed";
    }

    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      // The PI that accompanies every pack Checkout has no auto-top-up
      // metadata → ignored with zero ledger writes (the pack lands via
      // checkout.session.completed).
      if (pi.metadata?.respin_kind !== "auto_topup") return "ignored";
      if (!workspaceId) return "refused_unknown_customer";
      const metaWs = pi.metadata?.workspace_id;
      if (metaWs && metaWs !== workspaceId) return "refused_identity_mismatch";
      // ONE pack per PAYMENT INTENT, not per event id — the third mint path,
      // which had neither the pre-check nor the index its two siblings got
      // (billing review finding 2). Sessions learned this rule, invoices
      // learned it, and auto-top-up was left leaning on
      // credit_ledger_stripe_event_uq alone: any second event id carrying this
      // PI mints a second $10 pack. Unlike the session case there is no
      // confirmed second-event path in Stripe today, so this is defence in
      // depth rather than a reproduced double-mint — but it is the same defect
      // CLASS, and the fix belongs on the class, not on the two members that
      // happened to be reported (CLAUDE.md lesson 2026-07-30).
      const [alreadyToppedUp] = await tx
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.workspaceId, workspaceId),
            eq(creditLedger.refType, "auto_topup"),
            eq(creditLedger.refId, pi.id)
          )
        )
        .limit(1);
      if (alreadyToppedUp) {
        console.warn(
          `[stripe-webhook] ${event.id} auto-top-up ${pi.id} already minted — ignoring the second event carrying it`
        );
        return "ignored";
      }

      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);
      if (!sub) return "refused_unknown_customer";

      const attemptId = pi.metadata?.respin_attempt_id;
      if (!attemptId) {
        // Deployment-only compatibility for PIs created by the old protocol.
        // The cutoff is persisted per subscription; it is not a rolling window
        // that could mint a newly created metadata-bypass PI forever.
        const legacyCreatedAt =
          typeof pi.created === "number" ? new Date(pi.created * 1000) : null;
        const legacyAllowed =
          legacyCreatedAt !== null &&
          (sub.autoTopupProtocolVersion === 0 ||
            (sub.autoTopupAttemptCutoverAt !== null &&
              legacyCreatedAt <= sub.autoTopupAttemptCutoverAt));
        if (!legacyAllowed) {
          throw new AutoTopupAttemptIntegrityError(
            `PaymentIntent ${pi.id} has no attempt id after the persisted cutover`
          );
        }
        const { version, content } = await getActiveConfig(tx);
        const settledAt = await settlementAt(tx, event);
        await purchasePackCredits(tx, {
          workspaceId,
          amount: content.pack.credits,
          expiresAt: addMonthsUtc(settledAt, content.pack.validityMonths),
          amountCents: pi.amount,
          stripeEventId: event.id,
          refType: "auto_topup",
          refId: pi.id,
          autoTopupAttemptId: randomUUID(),
          autoTopupPeriodMonthUtc: `${legacyCreatedAt.getUTCFullYear()}-${String(legacyCreatedAt.getUTCMonth() + 1).padStart(2, "0")}`,
          configVersion: version,
        });
        return "processed";
      }

      const rollout = await assertAutoTopupProtocolRecoveryReady(tx);
      if (
        rollout.stripeLivemode !== event.livemode ||
        rollout.stripeLivemode !== pi.livemode ||
        (event.account !== undefined &&
          event.account !== rollout.stripeAccountId)
      ) {
        throw new AutoTopupAttemptIntegrityError(
          `PaymentIntent ${pi.id} does not match the rollout livemode binding`
        );
      }
      const signedAuthority = verifyAutoTopupAuthority(pi, workspaceId);

      const pending = pendingAutoTopupAttempt(sub);
      if (!pending || pending.id !== attemptId) {
        const [settledAttempt] = await tx
          .select({ id: creditLedger.id, refId: creditLedger.refId })
          .from(creditLedger)
          .where(eq(creditLedger.autoTopupAttemptId, attemptId))
          .limit(1);
        if (settledAttempt) {
          if (settledAttempt.refId !== pi.id) {
            throw new AutoTopupAttemptIntegrityError(
              `signed attempt ${attemptId} is already settled by a different PaymentIntent ${settledAttempt.refId}`
            );
          }
          return "ignored";
        }
        if (pending) {
          throw new AutoTopupAttemptIntegrityError(
            `provider-only attempt ${attemptId} conflicts with pending attempt ${pending.id}`
          );
        }
        // Point-in-time restore recovery: the provider-carried authority is
        // HMAC-signed and the verified PI itself binds amount/currency/customer.
        // This can reconstruct a mint even when both the pending row and the
        // config version were created after the restored database snapshot.
        const settledAt = await settlementAt(tx, event);
        await purchasePackCredits(tx, {
          workspaceId,
          amount: signedAuthority.credits,
          expiresAt: addMonthsUtc(settledAt, signedAuthority.validityMonths),
          amountCents: signedAuthority.amountCents,
          stripeEventId: event.id,
          refType: "auto_topup",
          refId: pi.id,
          autoTopupAttemptId: signedAuthority.attemptId,
          autoTopupPeriodMonthUtc: signedAuthority.periodMonthUtc,
          configVersion: signedAuthority.configVersion,
        });
        return "processed";
      }

      const piCustomer =
        typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
      if (
        metaWs !== workspaceId ||
        signedAuthority.attemptId !== pending.id ||
        signedAuthority.periodMonthUtc !== pending.periodMonthUtc ||
        signedAuthority.amountCents !== pending.amountCents ||
        signedAuthority.currency !== pending.currency ||
        signedAuthority.priceId !== pending.priceId ||
        signedAuthority.credits !== pending.credits ||
        signedAuthority.validityMonths !== pending.validityMonths ||
        signedAuthority.configVersion !== pending.configVersion ||
        signedAuthority.customerId !== pending.customerId ||
        pending.customerId !== sub.stripeCustomerId ||
        piCustomer !== pending.customerId ||
        pi.amount !== pending.amountCents ||
        pi.currency !== pending.currency ||
        pi.metadata?.period_month_utc !== pending.periodMonthUtc ||
        pi.metadata?.config_version !== String(pending.configVersion) ||
        (pending.paymentIntentId !== null && pending.paymentIntentId !== pi.id)
      ) {
        throw new AutoTopupAttemptIntegrityError(
          `PaymentIntent ${pi.id} does not match stored attempt ${attemptId}`
        );
      }

      const settledAt = await settlementAt(tx, event);
      await purchasePackCredits(tx, {
        workspaceId,
        amount: pending.credits,
        expiresAt: addMonthsUtc(settledAt, pending.validityMonths),
        amountCents: pending.amountCents,
        stripeEventId: event.id,
        refType: "auto_topup",
        refId: pi.id,
        autoTopupAttemptId: pending.id,
        autoTopupPeriodMonthUtc: pending.periodMonthUtc,
        configVersion: pending.configVersion,
      });
      if (!(await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id))) {
        throw new AutoTopupAttemptIntegrityError(
          `attempt ${pending.id} changed before settlement`
        );
      }
      return "processed";
    }

    default:
      return "ignored";
  }
}
