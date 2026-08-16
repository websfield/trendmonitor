// Request-time auto-top-up trigger (D-M1-4; REQ-G03). Purchases EXACTLY ONE
// standard pack per trigger (plan-review F4; if one pack doesn't cover the
// shortfall the debit still refuses and the user buys manually). M1 ships and
// tests this function directly; NO M1 code calls it — the debit-refusal call
// site is M3's generation pipeline (master-plan Deferral Ledger).
import { and, eq, gte, sql } from "drizzle-orm";
import {
  creditLedger,
  subscriptions,
  type DbLike,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { getActiveConfig } from "@respin/config";
import { hasLiveStripeSubscription } from "../state";
import { getStripe } from "./adapter";

export type AutoTopupResult =
  | { triggered: true; paymentIntentId: string }
  | {
      triggered: false;
      reason:
        | "disabled"
        | "paused"
        | "cap_reached"
        | "no_customer"
        | "not_subscribed";
    };

/**
 * @param shortfall credits the refused debit was short by — the Phase-3
 * handoff contract's third argument, restored here (billing review finding 7:
 * the plan pins `maybeAutoTopup(db, workspaceId, shortfall, at)` and the code
 * had drifted to a 3-arg form, so M3's debit-refusal call site — the only
 * caller there will ever be, and one nobody has written yet — would have been
 * coded against a signature that does not exist).
 *
 * It is VALIDATED, not scaled on: plan-review F4 decided one standard pack per
 * trigger, so a shortfall larger than `pack.credits` still buys exactly one
 * pack and the debit still refuses (the user buys the rest manually). Taking
 * the argument without acting on its magnitude is deliberate — the alternative
 * reading, "buy as many packs as it takes", is the one F4 rejected.
 */
export async function maybeAutoTopup(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  shortfall: number,
  at: Date
): Promise<AutoTopupResult> {
  if (!Number.isInteger(shortfall) || shortfall <= 0) {
    throw new Error(
      `maybeAutoTopup: shortfall must be a positive integer number of credits (got ${shortfall}) — it is the amount the refused debit was short by.`
    );
  }
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  if (!sub) return { triggered: false, reason: "no_customer" };
  // LIVENESS, through the ONE definition (billing round-7 CHANGE 1). Charging
  // off-session needs a subscription that still exists in Stripe. Cancellation
  // is the stronger form of the R-12 "no charges" rule the pause guard below
  // already states, and it had no guard at all: an owner who enabled
  // auto-top-up at a $50 cap and then self-serve cancelled left
  // {status: canceled, autoTopupEnabled: true} on the mirror — free everywhere
  // else in the product, but still armed here, so M3's debit site would charge
  // a $10 off-session PaymentIntent to a customer who cancelled. Clearing the
  // flag on `customer.subscription.deleted` (webhooks.ts) is the other half;
  // this guard is the one that also covers a mirror that never had a
  // subscription (a pack-only customer has no saved payment method to charge)
  // and one whose cancellation we learned about some other way.
  //
  // Stated consequence: auto-top-up is a subscriber feature. A workspace with
  // no live subscription buys packs through the manual Checkout, which is also
  // what `setAutoTopup`'s own "subscribe first" refusal already says.
  if (!hasLiveStripeSubscription(sub)) {
    return { triggered: false, reason: "not_subscribed" };
  }
  // R-12 "no charges" while paused — guard in the function, not the caller.
  if (sub.pausedAt !== null) return { triggered: false, reason: "paused" };
  if (!sub.autoTopupEnabled || sub.autoTopupMonthlyCapCents === null) {
    return { triggered: false, reason: "disabled" };
  }

  const { content } = await getActiveConfig(db);
  const packCents = Math.round(content.pack.priceUsd * 100);

  // Cap headroom in REAL CENTS from this-calendar-month auto-top-up rows'
  // amountCents (never reconstructed from credits — billing round-1 finding 6).
  const monthStart = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)
  );
  const rows = await db
    .select({
      cents: sql<number>`coalesce(sum(${creditLedger.amountCents}), 0)`,
      n: sql<number>`count(*)`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.workspaceId, workspaceId),
        eq(creditLedger.refType, "auto_topup"),
        gte(creditLedger.createdAt, monthStart)
      )
    );
  const spentCents = Number(rows[0]?.cents ?? 0);
  const n = Number(rows[0]?.n ?? 0);
  if (spentCents + packCents > sub.autoTopupMonthlyCapCents) {
    return { triggered: false, reason: "cap_reached" };
  }

  // Idempotency key dedupes concurrent duplicate triggers to ONE PaymentIntent
  // (same n → same key → Stripe returns the same PI). Stated consequence: a
  // DECLINED off-session PI replays its decline under the same key until the
  // month's row count changes — fail-safe; manual pack checkout is the
  // recovery path (billing plan-gate round-2 note).
  const yyyyMm = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  const idempotencyKey = `autotopup:${workspaceId}:${yyyyMm}:${n + 1}`;
  const pi = await getStripe().paymentIntents.create(
    {
      amount: packCents,
      currency: "usd",
      customer: sub.stripeCustomerId,
      off_session: true,
      confirm: true,
      metadata: { respin_kind: "auto_topup", workspace_id: workspaceId },
    },
    { idempotencyKey }
  );
  // Credits land via the payment_intent.succeeded webhook (single-tx, event-id
  // idempotent) — never here.
  return { triggered: true, paymentIntentId: pi.id };
}
