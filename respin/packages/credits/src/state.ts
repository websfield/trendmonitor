// Tier/state machine (D-M1-4 lazy grace). Tier is derived AT READ TIME from
// subscriptions.stripePriceId × the active config's stripePriceMap — a config
// fix self-heals without event replay; an unmapped price fails closed to free
// entitlements with a named reason the UI can turn into a remedy.
import { eq } from "drizzle-orm";
import type { DbLike, TxLike, VerifiedWorkspaceId } from "@respin/db";
import { subscriptions } from "@respin/db";
import { getActiveConfig, type SubscriptionTier } from "@respin/config";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * The statuses a Stripe subscription can never come back from. Everything else
 * — including `unpaid` and `incomplete`, which a customer can still pay out of
 * — leaves a subscription that EXISTS in Stripe and will keep emitting events.
 */
export const IRREVERSIBLE_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * End states for the purpose of MONEY. Superset of IRREVERSIBLE_STATUSES, and
 * the distinction is the whole point (audit 2026-08-17 #6):
 *
 *  - `IRREVERSIBLE_STATUSES` answers "does this subscription still EXIST in
 *    Stripe?" — `unpaid` is deliberately excluded, because the installed SDK
 *    says of it "After receiving updated payment information from a customer,
 *    you may choose to reopen and pay their closed invoices" (stripe@22.5.0
 *    Subscriptions.d.ts). Treating `unpaid` as irreversible made a dunning
 *    workspace unrecoverable by ANY event (billing round-5 CHANGE).
 *  - `TERMINAL_STATUSES` answers "may we CHARGE this customer off-session?" —
 *    and there `unpaid` belongs, because it means Stripe has already given up
 *    collecting. Charging a $10 pack off-session to a customer whose
 *    subscription is in collections is exactly the surprise charge R-12 exists
 *    to prevent.
 *
 * This lived in `stripe/webhooks.ts` as a private constant while `state.ts`
 * owned its sibling — two files, two half-definitions of "dead". It is here
 * now, with `IRREVERSIBLE_STATUSES`, because the round-6 findings were both
 * caused by two readers of one mirror disagreeing.
 */
export const TERMINAL_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
  "unpaid",
]);

/**
 * May we initiate an OFF-SESSION charge (auto-top-up's PaymentIntent) for this
 * workspace right now? — the ONE definition, for the same reason
 * `hasLiveStripeSubscription` is the one definition of liveness.
 *
 * Liveness is NOT chargeability, and conflating them is audit finding #6:
 * `maybeAutoTopup` read `unpaid` as live and would have attempted an
 * off-session charge for a workspace `getWorkspaceBillingState` already
 * renders as `free`. Three independent conditions, all required:
 *
 *  1. a subscription that still exists in Stripe (there is a saved payment
 *     method to charge, and a subscriber relationship to charge it under);
 *  2. a status Stripe has not given up on (see TERMINAL_STATUSES);
 *  3. no open pause — REQ-G08 / R-12, "no charges while paused".
 *
 * Not exploitable at M1 (nothing calls `maybeAutoTopup` yet — R-21/D-M1-4
 * puts the debit call site in M3), which is precisely why it is worth fixing
 * now: it is a landmine armed for the milestone that adds the caller.
 */
export function mayChargeOffSession(row: {
  stripeSubscriptionId: string | null;
  status: string;
  pausedAt: Date | null;
}): boolean {
  return (
    hasLiveStripeSubscription(row) &&
    !TERMINAL_STATUSES.has(row.status) &&
    row.pausedAt === null
  );
}

/**
 * "Does a Stripe subscription exist for this workspace right now?" — the ONE
 * definition, because two readers of one mirror row disagreeing is how both
 * round-6 gate findings happened (billing round-6 BLOCK + CHANGE):
 *
 *  - `actions.ts` used to answer this with a LIVE_STATUSES allowlist that also
 *    counted `cancelAtPeriodEnd` as liveness. Nothing ever resets that flag, so
 *    after the ordinary REQ-G01 self-serve "cancel at period end" the mirror
 *    read {canceled, cancelAtPeriodEnd: true} — free everywhere else, but
 *    "already subscribed" here, refusing the owner a re-subscribe FOREVER and
 *    pointing them at a Customer Portal with nothing left to manage.
 *  - The same allowlist omitted `unpaid`, so the F1 double-billing guard waved
 *    a second Checkout through for a subscription that is still alive in
 *    Stripe — the two-subscriptions-one-workspace end state the single-row
 *    mirror cannot even represent.
 *
 * Both disappear when liveness is derived from irreversibility rather than
 * from a hand-maintained list: a subscription is live iff we have its id and
 * its last known status is not one of the two it cannot return from.
 */
export function hasLiveStripeSubscription(row: {
  stripeSubscriptionId: string | null;
  status: string;
}): boolean {
  return (
    row.stripeSubscriptionId !== null && !IRREVERSIBLE_STATUSES.has(row.status)
  );
}

/**
 * Is this workspace paused, *as the subscription mirror sees it*? — the READ
 * side's definition, used to render `BillingState`.
 *
 * A pause is a state OF a subscription, so a row with no live subscription is
 * not paused however stale its `pausedAt` reads. That is audit #5's rule, and
 * it is why the #5 drift state (`{status: canceled, pausedAt: <stale>}`) renders
 * as `free` rather than as a paused paid tier forever.
 *
 * NOT the authority, and deliberately not used to gate money. The authority is
 * `hasOpenPause` (pause.ts) — the `pause_periods` table — which is what
 * `debitCredits` refuses on, what `adjustCredits` refuses on, what D-AUDIT-1's
 * grant refusal keys on, and, since the 2026-08-18 billing gate, what
 * `createPackCheckoutUrl` refuses on. This predicate reads the MIRROR, and the
 * mirror can lag the authority in both directions.
 *
 * Stated consequence, because it is the honest residual rather than a closed
 * issue: in the rare `{open pause_periods, mirror canceled}` state the billing
 * page derives `free` and renders the Buy-pack control live, while the charge
 * refuses on the click. That is the same cosmetic asymmetry the audit's own
 * NOTE described, now confined to a much rarer row — and it now fails in the
 * SAFE direction, refusing a purchase whose credits could never be spent. The
 * fix (deriving `BillingState` from the authority) threads a query into the
 * read path and belongs with its own test, not appended here.
 */
export function isPausedSubscription(row: {
  stripeSubscriptionId: string | null;
  status: string;
  pausedAt: Date | null;
}): boolean {
  return row.pausedAt !== null && hasLiveStripeSubscription(row);
}

/**
 * When is this subscription scheduled to END? — the ONE reader of the pair of
 * columns Stripe uses for one fact, for the same reason `hasLiveStripeSubscription`
 * is the one reader of liveness: two callers answering it differently is how
 * both round-6 findings happened.
 *
 * The evidence run (2026-08-17) cancelled through the Customer Portal on
 * api_version 2026-05-27.dahlia and the payload carried `cancel_at: <ts>` with
 * `cancel_at_period_end: FALSE` and `status: active`. A mirror reading only the
 * boolean therefore stored "not cancelling" for a subscription Stripe had
 * already scheduled to end, and the billing page told a paying creator nothing.
 * The installed SDK documents them as different questions — `cancel_at` is "a
 * date in the future at which the subscription will automatically get canceled",
 * the boolean is "will (if status=active) or DID (if status=canceled) cancel at
 * the end of the current billing period" (stripe@22.5.0
 * resources/Subscriptions.d.ts:128-134) — so both are mirrored and read here:
 *
 *  - an explicit `cancelAt` wins, because it is the date Stripe will act on;
 *  - the legacy boolean still resolves to the period end, so a subscription
 *    cancelled through the older shape (or an older API version) is not lost;
 *  - a DEAD subscription is never "scheduled to end" — it already has, and
 *    DEAD_SUBSCRIPTION_FIELDS clears both columns anyway; keying on liveness
 *    means a stale value cannot outlive the subscription even if it did.
 */
export function scheduledCancelAt(row: {
  stripeSubscriptionId: string | null;
  status: string;
  cancelAt: Date | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}): Date | null {
  if (!hasLiveStripeSubscription(row)) return null;
  if (row.cancelAt) return row.cancelAt;
  return row.cancelAtPeriodEnd ? row.currentPeriodEnd : null;
}

/**
 * The Stripe statuses that mean "this subscription exists but has never
 * successfully collected its first payment" (audit 2026-08-17 #8).
 *
 * `incomplete` is the SCA-required / card-declined first invoice. The SDK: "the
 * initial payment attempt fails… the subscription moves to `incomplete`… If the
 * first invoice is not paid within 23 hours the subscription transitions to
 * `incomplete_expired`" (stripe@22.5.0 resources/Subscriptions.d.ts).
 *
 * It is deliberately NOT in `IRREVERSIBLE_STATUSES` — the customer can still
 * pay that invoice — which is exactly what made it a trap: it counted as LIVE
 * for the F1 duplicate-checkout guard (correctly, a second checkout would
 * double-bill) while `getWorkspaceBillingState` had no branch for it and fell
 * through to Free. The UI therefore hid Subscribe AND offered only the Customer
 * Portal, which cannot resolve a subscription that never activated. A declined
 * or SCA-required first payment left the customer with no way forward at all.
 */
export const INCOMPLETE_STATUSES = new Set(["incomplete"]);

export type BillingState = {
  /**
   * The ENTITLEMENT tier. `incomplete` resolves to `free` here on purpose: no
   * payment has ever succeeded, so entitlements must not be granted — see
   * `pendingTier` for what the customer is trying to buy.
   */
  tier: SubscriptionTier | "free";
  state: "free" | "active" | "grace" | "paused" | "incomplete";
  reason?: "unmapped_price";
  graceExpiresAt?: Date;
  resumesAt?: Date;
  /** Set when the subscription is live but scheduled to end (REQ-G01). */
  cancelAt?: Date;
  /**
   * ONLY on `state: "incomplete"` — the plan the unpaid first invoice is for,
   * so the page can name it without implying it is active. Separate from
   * `tier` because collapsing them would hand a paid entitlement to a
   * subscription that has never collected a cent.
   */
  pendingTier?: SubscriptionTier;
};

export async function getWorkspaceBillingState(
  db: DbLike | TxLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date
): Promise<BillingState> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  // Free = ABSENCE of a subscriptions row (B6) — or a dead one.
  if (!sub) return { tier: "free", state: "free" };

  const resolveTier = async (): Promise<
    { tier: SubscriptionTier; reason?: undefined } | { tier: "free"; reason: "unmapped_price" }
  > => {
    if (!sub.stripePriceId) return { tier: "free", reason: "unmapped_price" };
    const { content } = await getActiveConfig(db);
    const mapped = content.stripePriceMap[sub.stripePriceId];
    if (mapped === "creator" || mapped === "pro" || mapped === "studio") {
      return { tier: mapped };
    }
    return { tier: "free", reason: "unmapped_price" };
  };

  // One computation, shared by every LIVE state below (active / paused /
  // grace): a scheduled end is a fact about the subscription, not about which
  // of those three it is in.
  const endsAt = scheduledCancelAt(sub) ?? undefined;

  // LIVENESS-GATED, like every other branch in this switch (audit 2026-08-17
  // #5). This was the one branch that trusted a column unconditionally, ahead
  // of any status check — and `pausedAt` is exactly the column that can outlive
  // the subscription it describes:
  //
  //   `customer.subscription.deleted` calls `ensurePauseEnded`, which is a
  //   NO-OP when no open `pause_periods` row exists — a drift state
  //   `pause.ts`'s own docblock concedes is reachable ("the owner's resume path
  //   could reach a state where the two truths disagreed"). Reaching it and
  //   then cancelling left `{status: canceled, pausedAt: <set>, resumesAt:
  //   <stale>, stripePriceId: <stale paid tier>}`, and this branch rendered it
  //   as `{state: "paused", tier: <paid>, resumesAt: <a date that will never
  //   arrive>}` FOREVER — a dead subscription showing a paid tier, with no
  //   further event coming to correct it, because a dead subscription emits
  //   none.
  //
  // The other half of the fix is in `stripe/webhooks.ts`, where the death
  // writers now also clear the pause mirror (through `pause.ts`, the one module
  // allowed to write `pausedAt`). Both halves are needed: this one makes the
  // READ honest even if a drifted row survives from before the fix.
  if (isPausedSubscription(sub)) {
    const t = await resolveTier();
    return {
      tier: t.tier,
      state: "paused",
      reason: t.reason,
      resumesAt: sub.resumesAt ?? undefined,
      cancelAt: endsAt,
    };
  }
  if (ACTIVE_STATUSES.has(sub.status)) {
    const t = await resolveTier();
    return { tier: t.tier, state: "active", reason: t.reason, cancelAt: endsAt };
  }
  // INCOMPLETE — its own state, with its own remedy (audit 2026-08-17 #8).
  // Entitlements stay FREE (nothing has been collected); `pendingTier` carries
  // what the unpaid invoice is for. Placed AFTER the paused and active branches
  // and BEFORE the past_due fall-through, matching the switch's existing order:
  // a status that is simultaneously paused or active is not this state.
  if (INCOMPLETE_STATUSES.has(sub.status)) {
    const t = await resolveTier();
    return {
      tier: "free",
      state: "incomplete",
      // `unmapped_price` is still worth surfacing here: without a mapped price
      // we cannot even name the plan the customer is trying to buy, and the
      // remedy for that belongs to an operator, not to them.
      reason: t.reason,
      pendingTier: t.reason === undefined ? t.tier : undefined,
      cancelAt: endsAt,
    };
  }
  if (sub.status === "past_due") {
    if (sub.graceExpiresAt && sub.graceExpiresAt.getTime() > at.getTime()) {
      const t = await resolveTier();
      return {
        tier: t.tier,
        state: "grace",
        reason: t.reason,
        graceExpiresAt: sub.graceExpiresAt,
        cancelAt: endsAt,
      };
    }
    return { tier: "free", state: "free" };
  }
  // canceled / incomplete_expired / none / anything else → free.
  // (`incomplete` used to be in this list and has its own branch above since
  // audit #8 — the comment is corrected here rather than left describing a
  // routing that no longer happens.)
  return { tier: "free", state: "free" };
}
