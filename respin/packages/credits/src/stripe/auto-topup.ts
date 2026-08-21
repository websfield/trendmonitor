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
import {
  hasLiveStripeSubscription,
  mayChargeOffSession,
  TERMINAL_STATUSES,
} from "../state";
import { getStripe } from "./adapter";
import { resolvePackPrice } from "./pack-price";

export type AutoTopupResult =
  | { triggered: true; paymentIntentId: string }
  | {
      triggered: false;
      reason:
        | "disabled"
        | "paused"
        | "cap_reached"
        | "no_customer"
        | "not_subscribed"
        /**
         * The subscription EXISTS but Stripe has stopped collecting on it
         * (`unpaid`) — audit 2026-08-17 #6. Distinct from `not_subscribed`
         * because the states differ in what happens next: `not_subscribed` is
         * terminal for auto-top-up (subscribe again), `not_chargeable` clears
         * itself the moment the customer settles the outstanding invoice.
         */
        | "not_chargeable";
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
  //
  // THROUGH `mayChargeOffSession`, the shared predicate (billing gate,
  // 2026-08-18). This site used to inline the same three conditions, which left
  // `mayChargeOffSession` with ZERO callers while two comments claimed it was
  // the mechanism here — a comment asserting a property the code did not have
  // (CLAUDE.md 2026-07-30). The predicate is now the GATE, so "may we charge
  // off-session?" has exactly one definition and this site cannot drift from
  // it; the three checks below run only to name WHICH condition bit, for
  // `AutoTopupResult.reason`. They are ordered to match the predicate's own
  // clauses, and they are unreachable unless it has already refused.
  //
  // CHARGEABILITY is the clause worth restating here (audit 2026-08-17 #6).
  // `hasLiveStripeSubscription` answers "does a subscription exist?" and says
  // YES to `unpaid` on purpose — round 5 kept `unpaid` out of
  // IRREVERSIBLE_STATUSES because a customer can pay their way out of dunning,
  // and treating it as irreversible made such a workspace unrecoverable by ANY
  // event. But `unpaid` means Stripe has STOPPED COLLECTING, and this is the
  // off-session charge site: a $10 PaymentIntent against a customer already in
  // collections — for a workspace `getWorkspaceBillingState` renders as `free`
  // — is the surprise charge R-12 exists to prevent. That is why chargeability
  // is a separate question from liveness, and why the predicate asks both.
  if (!mayChargeOffSession(sub)) {
    if (!hasLiveStripeSubscription(sub)) {
      return { triggered: false, reason: "not_subscribed" };
    }
    if (TERMINAL_STATUSES.has(sub.status)) {
      return { triggered: false, reason: "not_chargeable" };
    }
    // R-12 "no charges" while paused — checked EXPLICITLY, not as a
    // fall-through (billing gate, 2026-08-18). "The only clause left" is true
    // today and silently wrong the day `mayChargeOffSession` grows a fourth
    // clause: a new refusal would reach M3 mislabelled as `paused`. A wrong
    // reason on a money path is worse than a loud one, so an unrecognised
    // refusal throws instead of guessing.
    if (sub.pausedAt !== null) return { triggered: false, reason: "paused" };
    throw new Error(
      `maybeAutoTopup: mayChargeOffSession refused a charge for a reason this function cannot name (status=${sub.status}, live=${hasLiveStripeSubscription(sub)}, paused=${sub.pausedAt !== null}). A new clause was added to the predicate without giving it an AutoTopupResult.reason.`
    );
  }
  if (!sub.autoTopupEnabled || sub.autoTopupMonthlyCapCents === null) {
    return { triggered: false, reason: "disabled" };
  }

  // AUDIT #7, the half that was missing (billing gate, 2026-08-18). This site
  // used to compute `Math.round(content.pack.priceUsd * 100)` and charge it as
  // a raw off-session amount — touching no Stripe `Price` and running no
  // divergence check — while `pack-price.ts` and `actions.ts` both claimed
  // "both paths now come through resolvePackPrice". One caller is not both, and
  // a comment claiming a property is not the property (CLAUDE.md 2026-07-30).
  //
  // The hazard had CHANGED SHAPE rather than closed: after the manual path was
  // fixed, an `/admin/config` edit to `pack.priceUsd` made manual Checkout
  // REFUSE (mismatch) while this path silently charged the new, un-validated
  // number. Same class as #6 — "a landmine armed for the milestone that adds
  // the caller" — and M3 is that caller.
  //
  // Now: Stripe's Price is the charge authority here too, and a config/Stripe
  // divergence refuses BEFORE any PaymentIntent is created.
  // Cap headroom in REAL CENTS from this-calendar-month auto-top-up rows'
  // amountCents (never reconstructed from credits — billing round-1 finding 6).
  //
  // READ FIRST, ahead of the price resolution below, so the no-headroom-at-all
  // case can refuse without touching Stripe. That ordering is what keeps this
  // function's refusals keyless (the isolation suite's whole contract), and it
  // is a pure win: a workspace that has already spent its cap cannot be
  // un-capped by any price Stripe might return.
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

  // NO-HEADROOM SHORT-CIRCUIT, decided without a price and therefore without
  // Stripe. It is EXACT, not an approximation: a pack costs a positive number
  // of cents, so once this month's spend has reached the cap, `spent + pack`
  // exceeds it for every possible price — no Stripe read could change the
  // answer. This is deliberately NOT a second price authority (audit #7); it
  // reads no price at all.
  if (spentCents >= sub.autoTopupMonthlyCapCents) {
    return { triggered: false, reason: "cap_reached" };
  }

  // THE CHARGE AUTHORITY (audit #7). Stripe's own Price, validated against the
  // active config — the same resolver the manual Checkout path uses, so an
  // /admin/config edit can no longer make the two paths charge different
  // amounts. Reached only once the cheap refusals above have passed.
  const packPrice = await resolvePackPrice(db);
  const packCents = packPrice.amountCents;

  // The exact cap test, now against the amount Stripe will really charge.
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
      // From the resolved Stripe Price, not a second literal: the resolver
      // already refused anything that is not usd, so these cannot disagree.
      currency: packPrice.currency,
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
