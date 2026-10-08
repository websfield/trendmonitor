// Request-time auto-top-up trigger (D-M1-4; REQ-G03). Exactly one standard
// pack is reserved per trigger. Credits land only through the verified Stripe
// webhook; this path owns the durable, replayable charge attempt.
import { randomUUID } from "node:crypto";
import { AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING, getActiveConfig } from "@respin/config";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  assertWorkspaceAcceptsMembership,
  creditLedger,
  subscriptions,
  workspaceAcceptsMembership,
  type DbLike,
  type Subscription,
  type TxLike,
  type VerifiedWorkspaceId,
} from "@respin/db";
import {
  hasLiveStripeSubscription,
  mayChargeOffSession,
} from "../state";
import { assertWriteClock, getDbNow, takeWorkspaceLockInOrder } from "../clock";
import { emitAutoTopupReconciliationMetric } from "../metrics";
import { getAutoTopupAuthorityKey, getStripe } from "./adapter";
import { resolvePackPrice } from "./pack-price";
import { PINNED_CURRENCY } from "./price-allowlist";
import { isAutoTopupProtocolActive } from "./auto-topup-rollout";
import {
  autoTopupAuthorityMetadata,
  verifyAutoTopupAuthority,
} from "./auto-topup-authority";
import type Stripe from "stripe";

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
        | "not_chargeable"
        | "rollout_pending"
        | "payment_failed";
    }
  | {
      triggered: false;
      reason: "reconciliation_required";
      /** Safe operator correlation id. Never contains customer or payment data. */
      attemptId: string;
    };

type AutoTopupReconciliationSource =
  | "protocol_validation"
  | "provider_lookup"
  | "provider_create"
  | "provider_cancel"
  | "post_dispatch_persistence"
  | "idempotency_window";

function reconciliationRequired(
  attemptId: string,
  source: AutoTopupReconciliationSource
): AutoTopupResult {
  // Do not log the provider exception: Stripe errors can contain request and
  // payment details. The signed random attempt id is sufficient for an operator
  // to run the v1 reconciler without exposing customer or card data. Through
  // the sink indirection (audit P3-R7), never a bare console call here.
  emitAutoTopupReconciliationMetric({ source, attemptId });
  return { triggered: false, reason: "reconciliation_required", attemptId };
}

/**
 * THE COMPILED CEILING on auto-top-up attempts per workspace per UTC month
 * (audit P3-R7) — `@respin/config`'s `AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING`,
 * the one copy. The bound applied is `min(pack.autoTopupMaxAttemptsPerMonth,
 * this)`, refused as `cap_reached` before any reservation.
 */
export const AUTO_TOPUP_MAX_ATTEMPTS_PER_MONTH = AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING;

export class AutoTopupUnnamedRefusalError extends Error {
  constructor(
    public readonly status: string,
    public readonly live: boolean,
    public readonly paused: boolean
  ) {
    super(
      `maybeAutoTopup: mayChargeOffSession refused a charge for a reason this function cannot name (status=${status}, live=${live}, paused=${paused}). A new clause was added without a matching AutoTopupResult.reason.`
    );
    this.name = "AutoTopupUnnamedRefusalError";
  }
}

export class AutoTopupShortfallError extends Error {
  constructor(public readonly shortfall: number) {
    super(
      `maybeAutoTopup: shortfall must be a positive integer number of credits (got ${shortfall}) — it is the amount the refused debit was short by.`
    );
    this.name = "AutoTopupShortfallError";
  }
}

export class AutoTopupAttemptIntegrityError extends Error {
  constructor(detail: string) {
    super(`maybeAutoTopup: durable attempt authority is inconsistent (${detail})`);
    this.name = "AutoTopupAttemptIntegrityError";
  }
}

export type PendingAutoTopupAttempt = {
  id: string;
  periodMonthUtc: string;
  ordinal: number;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  priceId: string;
  credits: number;
  validityMonths: number;
  configVersion: number;
  customerId: string;
  paymentIntentId: string | null;
  paymentIntentStatus: string | null;
  claimId: string;
  claimedAt: Date;
  dispatchedAt: Date;
  reservedAt: Date;
};

export function pendingAutoTopupAttempt(
  sub: Subscription
): PendingAutoTopupAttempt | null {
  if (sub.autoTopupAttemptId === null) return null;
  const required = [
    sub.autoTopupAttemptPeriodMonthUtc,
    sub.autoTopupAttemptOrdinal,
    sub.autoTopupAttemptIdempotencyKey,
    sub.autoTopupAttemptAmountCents,
    sub.autoTopupAttemptCurrency,
    sub.autoTopupAttemptPriceId,
    sub.autoTopupAttemptCredits,
    sub.autoTopupAttemptValidityMonths,
    sub.autoTopupAttemptConfigVersion,
    sub.autoTopupAttemptCustomerId,
    sub.autoTopupAttemptReservedAt,
  ];
  if (required.some((value) => value === null)) {
    throw new AutoTopupAttemptIntegrityError("an attempt has missing authority fields");
  }
  if (
    sub.autoTopupAttemptDispatchedAt === null ||
    sub.autoTopupAttemptClaimId === null ||
    sub.autoTopupAttemptClaimedAt === null
  ) {
    throw new AutoTopupAttemptIntegrityError(
      "a persisted attempt lacks its atomic dispatch intent or dispatcher claim"
    );
  }
  return {
    id: sub.autoTopupAttemptId,
    periodMonthUtc: sub.autoTopupAttemptPeriodMonthUtc!,
    ordinal: sub.autoTopupAttemptOrdinal!,
    idempotencyKey: sub.autoTopupAttemptIdempotencyKey!,
    amountCents: sub.autoTopupAttemptAmountCents!,
    currency: sub.autoTopupAttemptCurrency!,
    priceId: sub.autoTopupAttemptPriceId!,
    credits: sub.autoTopupAttemptCredits!,
    validityMonths: sub.autoTopupAttemptValidityMonths!,
    configVersion: sub.autoTopupAttemptConfigVersion!,
    customerId: sub.autoTopupAttemptCustomerId!,
    paymentIntentId: sub.autoTopupAttemptPaymentIntentId,
    paymentIntentStatus: sub.autoTopupAttemptPaymentIntentStatus,
    claimId: sub.autoTopupAttemptClaimId,
    claimedAt: sub.autoTopupAttemptClaimedAt,
    dispatchedAt: sub.autoTopupAttemptDispatchedAt,
    reservedAt: sub.autoTopupAttemptReservedAt!,
  };
}

/**
 * Move one subscription onto the durable protocol while the caller holds the
 * lifecycle and billing locks. Historical ledger rows stay byte-for-byte
 * immutable; spendForPeriod derives their UTC month from created_at. The legacy
 * enable bit remains permanently false.
 */
export async function ensureAutoTopupAttemptProtocol(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  sub: Subscription,
  cutoverAt: Date
): Promise<Subscription> {
  if (sub.autoTopupProtocolVersion === 1) return sub;
  const [updated] = await tx
    .update(subscriptions)
    .set({
      autoTopupEnabled: false,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: cutoverAt,
    })
    .where(eq(subscriptions.workspaceId, workspaceId))
    .returning();
  if (!updated) {
    throw new AutoTopupAttemptIntegrityError(
      "the protocol-cutover update matched no subscription"
    );
  }
  return updated;
}

export async function clearPendingAutoTopupAttempt(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  attemptId: string
): Promise<boolean> {
  const [cleared] = await tx
    .update(subscriptions)
    .set({
      autoTopupAttemptId: null,
      autoTopupAttemptPeriodMonthUtc: null,
      autoTopupAttemptOrdinal: null,
      autoTopupAttemptIdempotencyKey: null,
      autoTopupAttemptAmountCents: null,
      autoTopupAttemptCurrency: null,
      autoTopupAttemptPriceId: null,
      autoTopupAttemptCredits: null,
      autoTopupAttemptValidityMonths: null,
      autoTopupAttemptConfigVersion: null,
      autoTopupAttemptCustomerId: null,
      autoTopupAttemptPaymentIntentId: null,
      autoTopupAttemptPaymentIntentStatus: null,
      autoTopupAttemptClaimId: null,
      autoTopupAttemptClaimedAt: null,
      autoTopupAttemptDispatchedAt: null,
      autoTopupAttemptReservedAt: null,
    })
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.autoTopupAttemptId, attemptId)
      )
    )
    .returning({ id: subscriptions.id });
  return cleared !== undefined;
}

function paymentIntentFromError(error: unknown): Stripe.PaymentIntent | null {
  if (!error || typeof error !== "object") return null;
  const direct = (error as { payment_intent?: unknown }).payment_intent;
  const nested = (error as { raw?: { payment_intent?: unknown } }).raw
    ?.payment_intent;
  const candidate = direct ?? nested;
  return candidate && typeof candidate === "object" && "id" in candidate
    ? (candidate as Stripe.PaymentIntent)
    : null;
}

const PERSISTABLE_PAYMENT_INTENT_STATUSES = new Set<string>([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
  "succeeded",
]);

// Stripe documents idempotency keys as removable after 24 hours. A retry gets
// a one-hour safety margin so wall-clock and provider retention boundaries can
// never turn the same durable attempt into a second PaymentIntent.
export const AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS = 23 * 60 * 60 * 1_000;

function resultForObservedPaymentIntent(pi: Stripe.PaymentIntent): AutoTopupResult {
  if (paymentIntentNeedsCancellation(pi.status)) {
    // Internal bind callers (webhooks and the operator reconciler) must be able
    // to persist this provider identity. Request-time callers route the result
    // through reconcileObservedPaymentIntent, which cancels it before this
    // manual-purchase refusal is allowed to escape.
    return { triggered: false, reason: "payment_failed" };
  }
  return { triggered: true, paymentIntentId: pi.id };
}

function paymentIntentNeedsCancellation(status: string): boolean {
  return (
    status === "requires_payment_method" ||
    status === "requires_confirmation" ||
    status === "requires_action" ||
    status === "requires_capture"
  );
}

function resultForPersistedPaymentIntent(
  pending: PendingAutoTopupAttempt
): AutoTopupResult {
  if (!pending.paymentIntentId || !pending.paymentIntentStatus) {
    throw new AutoTopupAttemptIntegrityError(
      `attempt ${pending.id} has an incomplete PaymentIntent binding`
    );
  }
  if (paymentIntentNeedsCancellation(pending.paymentIntentStatus)) {
    return reconciliationRequired(pending.id, "provider_cancel");
  }
  return { triggered: true, paymentIntentId: pending.paymentIntentId };
}

/** CAS-bind every provider-observed non-canceled PI before returning. */
export async function bindPendingAutoTopupPaymentIntent(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  pending: PendingAutoTopupAttempt,
  pi: Stripe.PaymentIntent
): Promise<AutoTopupResult> {
  const authority = verifyAutoTopupAuthority(pi, workspaceId);
  if (
    authority.attemptId !== pending.id ||
    authority.periodMonthUtc !== pending.periodMonthUtc ||
    authority.amountCents !== pending.amountCents ||
    authority.currency !== pending.currency ||
    authority.priceId !== pending.priceId ||
    authority.credits !== pending.credits ||
    authority.validityMonths !== pending.validityMonths ||
    authority.configVersion !== pending.configVersion ||
    authority.customerId !== pending.customerId
  ) {
    throw new AutoTopupAttemptIntegrityError(
      `Stripe returned a PaymentIntent whose signed authority does not match attempt ${pending.id}`
    );
  }
  if (pi.status === "canceled") {
    if (!(await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id))) {
      throw new AutoTopupAttemptIntegrityError(
        `canceled attempt ${pending.id} changed before retirement`
      );
    }
    return { triggered: false, reason: "payment_failed" };
  }
  if (!PERSISTABLE_PAYMENT_INTENT_STATUSES.has(pi.status)) {
    throw new AutoTopupAttemptIntegrityError(
      `PaymentIntent ${pi.id} has unsupported status ${pi.status}`
    );
  }
  const [recorded] = await tx
    .update(subscriptions)
    .set({
      autoTopupAttemptPaymentIntentId: pi.id,
      autoTopupAttemptPaymentIntentStatus: pi.status,
    })
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.autoTopupAttemptId, pending.id),
        or(
          isNull(subscriptions.autoTopupAttemptPaymentIntentId),
          eq(subscriptions.autoTopupAttemptPaymentIntentId, pi.id)
        )
      )
    )
    .returning({ id: subscriptions.id });
  if (!recorded) {
    throw new AutoTopupAttemptIntegrityError(
      `attempt ${pending.id} changed before PaymentIntent persistence`
    );
  }
  return resultForObservedPaymentIntent(pi);
}

/**
 * A creator may be offered a manual pack only after the exact automatic
 * PaymentIntent is terminal. Persist a known nonterminal intent even when its
 * cancellation outcome is unknown, so the operator reconciler retains exact
 * authority and the caller receives the no-retry state.
 */
async function reconcileObservedPaymentIntent(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  pending: PendingAutoTopupAttempt,
  pi: Stripe.PaymentIntent
): Promise<AutoTopupResult> {
  if (!paymentIntentNeedsCancellation(pi.status)) {
    return bindPendingAutoTopupPaymentIntent(tx, workspaceId, pending, pi);
  }
  let observed: Stripe.PaymentIntent;
  try {
    observed = await getStripe().paymentIntents.cancel(pi.id);
  } catch (error) {
    const known = paymentIntentFromError(error) ?? pi;
    await bindPendingAutoTopupPaymentIntent(tx, workspaceId, pending, known);
    return reconciliationRequired(pending.id, "provider_cancel");
  }
  const result = await bindPendingAutoTopupPaymentIntent(
    tx,
    workspaceId,
    pending,
    observed
  );
  if (observed.status !== "canceled" && observed.status !== "succeeded") {
    return reconciliationRequired(pending.id, "provider_cancel");
  }
  return result;
}

export async function findPaymentIntentForAttempt(
  workspaceId: string,
  pending: PendingAutoTopupAttempt
): Promise<Stripe.PaymentIntent | null> {
  const matches: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  const seenPageEnds = new Set<string>();
  for (;;) {
    const page = await getStripe().paymentIntents.list({
      customer: pending.customerId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.has_more && page.data.length === 0) {
      throw new AutoTopupAttemptIntegrityError(
        `Stripe returned an empty nonterminal reconciliation page for attempt ${pending.id}`
      );
    }
    for (const pi of page.data) {
      if (pi.metadata?.respin_attempt_id !== pending.id) continue;
      verifyAutoTopupAuthority(pi, workspaceId);
      matches.push(pi);
    }
    if (!page.has_more) break;
    const pageEnd = page.data.at(-1)!.id;
    if (seenPageEnds.has(pageEnd)) {
      throw new AutoTopupAttemptIntegrityError(
        `Stripe repeated reconciliation page cursor ${pageEnd} for attempt ${pending.id}`
      );
    }
    seenPageEnds.add(pageEnd);
    startingAfter = pageEnd;
  }
  if (matches.length > 1) {
    throw new AutoTopupAttemptIntegrityError(
      `provider reconciliation found ${matches.length} PaymentIntents for attempt ${pending.id}`
    );
  }
  return matches[0] ?? null;
}

function refusalFor(sub: Subscription): AutoTopupResult | null {
  if (!mayChargeOffSession(sub)) {
    if (!hasLiveStripeSubscription(sub)) {
      return { triggered: false, reason: "not_subscribed" };
    }
    if (sub.pausedAt !== null) return { triggered: false, reason: "paused" };
    // Liveness is deliberately broader than off-session chargeability:
    // incomplete/paused_collection/unpaid subscriptions can still recover in
    // Stripe, but must never authorize an automatic pack purchase.
    return { triggered: false, reason: "not_chargeable" };
  }
  if (!sub.autoTopupV1Enabled || sub.autoTopupMonthlyCapCents === null) {
    return { triggered: false, reason: "disabled" };
  }
  return null;
}

function periodMonthUtc(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function spendForPeriod(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  period: string
): Promise<{ cents: number; n: number }> {
  const rows = await tx
    .select({
      cents: sql<number>`coalesce(sum(${creditLedger.amountCents}), 0)`,
      n: sql<number>`count(*)`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.workspaceId, workspaceId),
        eq(creditLedger.refType, "auto_topup"),
        sql`coalesce(
          ${creditLedger.autoTopupPeriodMonthUtc},
          to_char(${creditLedger.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')
        ) = ${period}`
      )
    );
  return {
    cents: Number(rows[0]?.cents ?? 0),
    n: Number(rows[0]?.n ?? 0),
  };
}

type Prepared =
  | { result: AutoTopupResult }
  | { attempt: PendingAutoTopupAttempt; freshClaimId: string | null };

type DispatchPlan =
  | { result: AutoTopupResult }
  | { restart: true }
  | { recoverFailed: PendingAutoTopupAttempt }
  | { attempt: PendingAutoTopupAttempt; reconcileFirst: boolean };

/**
 * Reserve, then dispatch, an auto-top-up.
 *
 * Phase A commits the full pack/config/period authority. Phase B commits a
 * dispatch marker before Stripe. Unknown outcomes must reconcile the provider
 * by the signed attempt id before a same-key retry, and after the conservative
 * idempotency window a full provider proof plus claim revocation can retire a
 * crashed no-PI dispatcher without letting the stale process wake and charge.
 */
export async function maybeAutoTopup(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  shortfall: number,
  at: Date
): Promise<AutoTopupResult> {
  if (!Number.isInteger(shortfall) || shortfall <= 0) {
    throw new AutoTopupShortfallError(shortfall);
  }
  const prepared = await db.transaction(async (tx): Promise<Prepared> => {
    await takeWorkspaceLockInOrder(tx, { workspaceId: workspaceId });
    const [selectedSub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);
    if (!selectedSub) {
      return { result: { triggered: false, reason: "no_customer" } };
    }

    const sub = selectedSub;

    // Existing-attempt recovery is still a provider operation. Validate the
    // immutable HMAC binding and the authenticated Stripe account/mode before
    // any list/retrieve/cancel/retire path can observe a different account as
    // an empty result and destroy authority for a real charge.
    const existing = pendingAutoTopupAttempt(sub);
    let protocolActive: boolean;
    try {
      protocolActive = await isAutoTopupProtocolActive(tx);
    } catch (error) {
      if (existing) {
        return {
          result: reconciliationRequired(existing.id, "protocol_validation"),
        };
      }
      throw error;
    }
    if (!protocolActive) {
      return { result: { triggered: false, reason: "rollout_pending" } };
    }
    if (existing) return { attempt: existing, freshClaimId: null };

    await assertWorkspaceAcceptsMembership(tx, workspaceId);
    const dbNow = await assertWriteClock(tx, workspaceId, at);

    const refusal = refusalFor(sub);
    if (refusal) return { result: refusal };

    const period = periodMonthUtc(dbNow);
    const spent = await spendForPeriod(tx, workspaceId, period);
    if (spent.cents >= sub.autoTopupMonthlyCapCents!) {
      return { result: { triggered: false, reason: "cap_reached" } };
    }
    // THE ORDINAL BOUND (audit P3-R7): the next attempt would be ordinal
    // `spent.n + 1`; past the bound it is refused before anything is written.
    // Config may only tighten the compiled ceiling (the R-123 shape).
    const { content } = await getActiveConfig(tx);
    const attemptBound = Math.min(
      content.pack.autoTopupMaxAttemptsPerMonth,
      AUTO_TOPUP_MAX_ATTEMPTS_PER_MONTH
    );
    if (spent.n + 1 > attemptBound) {
      return { result: { triggered: false, reason: "cap_reached" } };
    }

    const packPrice = await resolvePackPrice(tx);
    if (spent.cents + packPrice.amountCents > sub.autoTopupMonthlyCapCents!) {
      return { result: { triggered: false, reason: "cap_reached" } };
    }

    // Validate the restore-recovery prerequisite immediately before the
    // reservation write. Throwing here rolls Phase A back completely.
    getAutoTopupAuthorityKey();
    const attemptId = randomUUID();
    const claimId = randomUUID();
    const ordinal = spent.n + 1;
    // UUID namespacing prevents a pre-cutover protocol-0 idempotency key from
    // aliasing this attempt after a deploy/restore boundary.
    const idempotencyKey = `autotopup:v1:${workspaceId}:${period}:${ordinal}:${attemptId}`;
    const [reserved] = await tx
      .update(subscriptions)
      .set({
        autoTopupAttemptId: attemptId,
        autoTopupAttemptPeriodMonthUtc: period,
        autoTopupAttemptOrdinal: ordinal,
        autoTopupAttemptIdempotencyKey: idempotencyKey,
        autoTopupAttemptAmountCents: packPrice.amountCents,
        autoTopupAttemptCurrency: packPrice.currency,
        autoTopupAttemptPriceId: packPrice.priceId,
        autoTopupAttemptCredits: packPrice.credits,
        autoTopupAttemptValidityMonths: packPrice.validityMonths,
        autoTopupAttemptConfigVersion: packPrice.configVersion,
        autoTopupAttemptCustomerId: sub.stripeCustomerId,
        autoTopupAttemptPaymentIntentId: null,
        autoTopupAttemptPaymentIntentStatus: null,
        // Reservation and dispatch intent are ONE commit. A restored backup can
        // therefore never replay a null marker while an original process has
        // already reached Stripe. `freshClaimId` exists only in this process;
        // every persisted/retried row reconciles the provider first.
        autoTopupAttemptClaimId: claimId,
        autoTopupAttemptClaimedAt: dbNow,
        autoTopupAttemptDispatchedAt: dbNow,
        autoTopupAttemptReservedAt: dbNow,
      })
      .where(eq(subscriptions.workspaceId, workspaceId))
      .returning();
    if (!reserved) {
      throw new AutoTopupAttemptIntegrityError(
        "the reservation update matched no subscription"
      );
    }
    return {
      attempt: pendingAutoTopupAttempt(reserved)!,
      freshClaimId: claimId,
    };
  });

  if ("result" in prepared) return prepared.result;

  const dispatchPlan = await db.transaction(async (tx): Promise<DispatchPlan> => {
    await takeWorkspaceLockInOrder(tx, { workspaceId: workspaceId });
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);
    if (!sub) return { result: { triggered: false, reason: "no_customer" } };
    let protocolActive: boolean;
    try {
      protocolActive = await isAutoTopupProtocolActive(tx);
    } catch (error) {
      if (prepared.attempt.id === sub.autoTopupAttemptId) {
        return {
          result: reconciliationRequired(
            prepared.attempt.id,
            "protocol_validation"
          ),
        };
      }
      throw error;
    }
    if (!protocolActive) {
      return { result: { triggered: false, reason: "rollout_pending" } };
    }

    const pending = pendingAutoTopupAttempt(sub);
    if (!pending || pending.id !== prepared.attempt.id) {
      const [settled] = await tx
        .select({ paymentIntentId: creditLedger.refId })
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, prepared.attempt.id))
        .limit(1);
      if (settled?.paymentIntentId) {
        return {
          result: { triggered: true, paymentIntentId: settled.paymentIntentId },
        };
      }
      throw new AutoTopupAttemptIntegrityError(
        "the reserved attempt disappeared or changed"
      );
    }
    const lifecycleActive = await workspaceAcceptsMembership(tx, workspaceId);
    if (pending.paymentIntentId) {
      if (
        pending.paymentIntentStatus &&
        paymentIntentNeedsCancellation(pending.paymentIntentStatus)
      ) {
        return { recoverFailed: pending };
      }
      return { result: resultForPersistedPaymentIntent(pending) };
    }

    const freshOwner =
      prepared.freshClaimId !== null &&
      pending.claimId === prepared.freshClaimId;
    // Only the process that atomically created this claim may skip provider
    // reconciliation. Every row reconstructed from durable state—including a
    // point-in-time restore between reservation and provider dispatch—must list
    // the signed attempt before any refusal can retire it.
    const reconcileFirst = !freshOwner;
    const refusal = refusalFor(sub);
    if (!reconcileFirst && !lifecycleActive) {
      if (!(await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id))) {
        throw new AutoTopupAttemptIntegrityError(
          `undispatched attempt ${pending.id} changed before lifecycle retirement`
        );
      }
      return { result: { triggered: false, reason: "not_chargeable" } };
    }
    if (!reconcileFirst && refusal) {
      if (!(await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id))) {
        throw new AutoTopupAttemptIntegrityError(
          `undispatched attempt ${pending.id} changed before refusal retirement`
        );
      }
      return { result: refusal };
    }
    if (!reconcileFirst && sub.stripeCustomerId !== pending.customerId) {
      if (!(await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id))) {
        throw new AutoTopupAttemptIntegrityError(
          `undispatched attempt ${pending.id} changed before customer retirement`
        );
      }
      return { restart: true };
    }
    const spent = await spendForPeriod(tx, workspaceId, pending.periodMonthUtc);
    if (
      !reconcileFirst &&
      spent.cents + pending.amountCents > sub.autoTopupMonthlyCapCents!
    ) {
      if (!(await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id))) {
        throw new AutoTopupAttemptIntegrityError(
          `undispatched attempt ${pending.id} changed before cap retirement`
        );
      }
      return { result: { triggered: false, reason: "cap_reached" } };
    }
    let marked = sub;
    if (!freshOwner) {
      const claimedAt = await assertWriteClock(tx, workspaceId, at);
      const claimId = randomUUID();
      const [reclaimed] = await tx
        .update(subscriptions)
        .set({
          autoTopupAttemptClaimId: claimId,
          autoTopupAttemptClaimedAt: claimedAt,
        })
        .where(
          and(
            eq(subscriptions.workspaceId, workspaceId),
            eq(subscriptions.autoTopupAttemptId, pending.id),
            isNull(subscriptions.autoTopupAttemptPaymentIntentId)
          )
        )
        .returning();
      if (!reclaimed) {
        throw new AutoTopupAttemptIntegrityError(
          `attempt ${pending.id} changed before dispatcher reclaim`
        );
      }
      marked = reclaimed;
    }
    return {
      attempt: pendingAutoTopupAttempt(marked)!,
      reconcileFirst,
    };
  });

  if ("result" in dispatchPlan) return dispatchPlan.result;
  if ("restart" in dispatchPlan) {
    return maybeAutoTopup(db, workspaceId, shortfall, at);
  }

  if ("recoverFailed" in dispatchPlan) {
    const failed = dispatchPlan.recoverFailed;
    if (!failed.paymentIntentId) {
      throw new AutoTopupAttemptIntegrityError(
        `failed attempt ${failed.id} has no PaymentIntent id`
      );
    }
    try {
      const observed = await getStripe().paymentIntents.retrieve(
        failed.paymentIntentId
      );
      verifyAutoTopupAuthority(observed, workspaceId);
      return await db.transaction(async (tx) => {
        await takeWorkspaceLockInOrder(tx, { workspaceId: workspaceId });
        const [sub] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.workspaceId, workspaceId))
          .limit(1);
        if (!sub) return { triggered: false, reason: "no_customer" } as const;
        const pending = pendingAutoTopupAttempt(sub);
        if (!pending || pending.id !== failed.id) {
          throw new AutoTopupAttemptIntegrityError(
            `failed attempt ${failed.id} changed during cancellation reconciliation`
          );
        }
        return reconcileObservedPaymentIntent(tx, workspaceId, pending, observed);
      });
    } catch {
      return reconciliationRequired(failed.id, "provider_cancel");
    }
  }

  if (dispatchPlan.reconcileFirst) {
    let found: Stripe.PaymentIntent | null;
    try {
      found = await findPaymentIntentForAttempt(workspaceId, dispatchPlan.attempt);
    } catch (error) {
      if (error instanceof AutoTopupAttemptIntegrityError) throw error;
      return reconciliationRequired(dispatchPlan.attempt.id, "provider_lookup");
    }
    if (found) {
      try {
        return await db.transaction(async (tx) => {
          await takeWorkspaceLockInOrder(tx, { workspaceId: workspaceId });
          const [sub] = await tx
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.workspaceId, workspaceId))
            .limit(1);
          if (!sub) return { triggered: false, reason: "no_customer" } as const;
          const pending = pendingAutoTopupAttempt(sub);
          if (
            !pending ||
            pending.id !== dispatchPlan.attempt.id ||
            pending.claimId !== dispatchPlan.attempt.claimId
          ) {
            throw new AutoTopupAttemptIntegrityError(
              `attempt ${dispatchPlan.attempt.id} changed during provider reconciliation`
            );
          }
          if (pending.paymentIntentId) {
            return resultForPersistedPaymentIntent(pending);
          }
          return reconcileObservedPaymentIntent(tx, workspaceId, pending, found);
        });
      } catch {
        return reconciliationRequired(
          dispatchPlan.attempt.id,
          "post_dispatch_persistence"
        );
      }
    }
    const dbNow = await db.transaction((tx) => getDbNow(tx));
    if (
      dbNow.getTime() - dispatchPlan.attempt.reservedAt.getTime() >
      AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS
    ) {
      const retired = await db.transaction(async (tx) => {
        await takeWorkspaceLockInOrder(tx, { workspaceId: workspaceId });
        const [sub] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.workspaceId, workspaceId))
          .limit(1);
        if (!sub) return false;
        const pending = pendingAutoTopupAttempt(sub);
        if (
          !pending ||
          pending.id !== dispatchPlan.attempt.id ||
          pending.claimId !== dispatchPlan.attempt.claimId
        ) {
          return false;
        }
        return clearPendingAutoTopupAttempt(tx, workspaceId, pending.id);
      });
      if (!retired) {
        throw new AutoTopupAttemptIntegrityError(
          `expired attempt ${dispatchPlan.attempt.id} changed before safe retirement`
        );
      }
      return maybeAutoTopup(db, workspaceId, shortfall, at);
    }
  }

  // Provider mutation happens only after the dispatch marker committed. The
  // locks are reacquired so disable/cap/lifecycle changes that won the gap are
  // revalidated immediately before the call.
  let providerDispatched = false;
  try {
    return await db.transaction(async (tx): Promise<AutoTopupResult> => {
    await takeWorkspaceLockInOrder(tx, { workspaceId: workspaceId });
    const lifecycleActive = await workspaceAcceptsMembership(tx, workspaceId);
    try {
      if (!(await isAutoTopupProtocolActive(tx))) {
        return { triggered: false, reason: "rollout_pending" };
      }
    } catch {
      return reconciliationRequired(
        dispatchPlan.attempt.id,
        "protocol_validation"
      );
    }
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);
    if (!sub) return { triggered: false, reason: "no_customer" };
    const pending = pendingAutoTopupAttempt(sub);
    if (
      !pending ||
      pending.id !== dispatchPlan.attempt.id ||
      pending.claimId !== dispatchPlan.attempt.claimId
    ) {
      const [settled] = await tx
        .select({ paymentIntentId: creditLedger.refId })
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, dispatchPlan.attempt.id))
        .limit(1);
      if (settled?.paymentIntentId) {
        return { triggered: true, paymentIntentId: settled.paymentIntentId };
      }
      throw new AutoTopupAttemptIntegrityError(
        `attempt ${dispatchPlan.attempt.id} disappeared before provider dispatch`
      );
    }
    if (pending.paymentIntentId) return resultForPersistedPaymentIntent(pending);
    if (!lifecycleActive) {
      await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id);
      return { triggered: false, reason: "not_chargeable" };
    }
    const refusal = refusalFor(sub);
    if (refusal) {
      await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id);
      return refusal;
    }
    if (sub.stripeCustomerId !== pending.customerId) {
      await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id);
      return { triggered: false, reason: "no_customer" };
    }
    const spent = await spendForPeriod(tx, workspaceId, pending.periodMonthUtc);
    if (spent.cents + pending.amountCents > sub.autoTopupMonthlyCapCents!) {
      await clearPendingAutoTopupAttempt(tx, workspaceId, pending.id);
      return { triggered: false, reason: "cap_reached" };
    }
    const immediatelyBeforeProvider = await getDbNow(tx);
    if (
      immediatelyBeforeProvider.getTime() - pending.reservedAt.getTime() >
      AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS
    ) {
      return reconciliationRequired(pending.id, "idempotency_window");
    }
    // THE CHARGE CURRENCY IS PINNED, not carried (Phase 6 final billing
    // check). `resolvePackPrice` only reserves a usd price, so a reserved
    // attempt in another currency is a row this product never writes: refuse
    // before the provider is called rather than charge in it.
    if (pending.currency !== PINNED_CURRENCY) {
      throw new AutoTopupAttemptIntegrityError(
        `the reserved auto-top-up attempt is in ${pending.currency}, not ${PINNED_CURRENCY}; nothing was charged`
      );
    }

    let pi: Stripe.PaymentIntent;
    try {
      providerDispatched = true;
      pi = await getStripe().paymentIntents.create(
        {
        amount: pending.amountCents,
        // STATED, NOT CARRIED (Phase 6 final billing check): the charge is in
        // the pinned currency, and a reserved attempt in any other currency
        // was refused above, before this call.
        currency: PINNED_CURRENCY,
        customer: pending.customerId,
        off_session: true,
        confirm: true,
        metadata: autoTopupAuthorityMetadata(workspaceId, pending),
        },
        { idempotencyKey: pending.idempotencyKey }
      );
    } catch (error) {
      const failedPi = paymentIntentFromError(error);
      if (!failedPi) {
        // Unknown provider outcome: retain Phase A and explicitly prevent the
        // creator from buying/retrying until provider reconciliation resolves
        // whether this exact idempotent attempt already charged.
        return reconciliationRequired(pending.id, "provider_create");
      }
      return reconcileObservedPaymentIntent(tx, workspaceId, pending, failedPi);
    }
    return reconcileObservedPaymentIntent(tx, workspaceId, pending, pi);
    });
  } catch (error) {
    if (providerDispatched) {
      return reconciliationRequired(
        dispatchPlan.attempt.id,
        "post_dispatch_persistence"
      );
    }
    throw error;
  }
}
