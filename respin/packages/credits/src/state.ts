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

export type BillingState = {
  tier: SubscriptionTier | "free";
  state: "free" | "active" | "grace" | "paused";
  reason?: "unmapped_price";
  graceExpiresAt?: Date;
  resumesAt?: Date;
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

  if (sub.pausedAt !== null) {
    const t = await resolveTier();
    return {
      tier: t.tier,
      state: "paused",
      reason: t.reason,
      resumesAt: sub.resumesAt ?? undefined,
    };
  }
  if (ACTIVE_STATUSES.has(sub.status)) {
    const t = await resolveTier();
    return { tier: t.tier, state: "active", reason: t.reason };
  }
  if (sub.status === "past_due") {
    if (sub.graceExpiresAt && sub.graceExpiresAt.getTime() > at.getTime()) {
      const t = await resolveTier();
      return {
        tier: t.tier,
        state: "grace",
        reason: t.reason,
        graceExpiresAt: sub.graceExpiresAt,
      };
    }
    return { tier: "free", state: "free" };
  }
  // canceled / none / incomplete / anything else → free.
  return { tier: "free", state: "free" };
}
