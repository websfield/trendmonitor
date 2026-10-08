// Operator-only recovery for a v1 subscription Checkout that exists in Stripe
// but was lost from a point-in-time database restore. Authority is rebuilt only
// from the exact provider Session, and convergence uses only real Stripe events
// through handleStripeEvent. This module never fabricates a receipt or writes
// credits directly.
import { and, eq } from "drizzle-orm";
import {
  creditLedger,
  pausePeriods,
  subscriptions,
  workspaces,
  type DbLike,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { CLOCK_SKEW_MS, takeWorkspaceLockInOrder } from "../clock";
import { IRREVERSIBLE_STATUSES } from "../state";
import {
  getAuthenticatedStripeAccountIdentity,
  getStripe,
  type Stripe,
} from "./adapter";
import { workspaceForCustomer } from "./customers";
import { assertTierCheckoutProtocolRecoveryReady } from "./tier-checkout-rollout";
import { assertAutoTopupProtocolRecoveryReady } from "./auto-topup-rollout";
import {
  DuplicateStripeEvent,
  handleStripeEventInTransaction,
} from "./webhooks";
import {
  tierCheckoutAuthorityMetadataFromProvider,
  verifyTierCheckoutAuthority,
} from "./tier-checkout-authority";

export class TierCheckoutV1ReconcileError extends Error {
  constructor(detail: string) {
    super(`Tier Checkout v1 reconciliation refused: ${detail}`);
    this.name = "TierCheckoutV1ReconcileError";
  }
}

export type TierCheckoutV1ReconcileReport = Readonly<{
  sessionId: string;
  subscriptionId: string | null;
  workspaceId: string;
  outcome: "bound_open" | "replayed" | "already_converged" | "expired_unpaid";
  replayedEventIds: readonly string[];
  duplicateEventIds: readonly string[];
}>;

const EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;
const GRANT_BILLING_REASONS = new Set([
  "subscription_create",
  "subscription_cycle",
]);

function objectId(value: { id: string } | string | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function exactStringRecordMatches(
  value: unknown,
  expected: Readonly<Record<string, string>>
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => actual[key] === expected[key])
  );
}

function tierOf(session: Stripe.Checkout.Session): "creator" | "pro" | "studio" {
  const tier = session.metadata?.tier;
  if (tier !== "creator" && tier !== "pro" && tier !== "studio") {
    throw new TierCheckoutV1ReconcileError(
      `Session ${session.id} has no valid immutable tier metadata`
    );
  }
  return tier;
}

function attemptIdOf(session: Stripe.Checkout.Session): string {
  const attemptId = session.metadata?.respin_checkout_attempt_id;
  if (!attemptId) {
    throw new TierCheckoutV1ReconcileError(
      `Session ${session.id} has no durable Checkout attempt metadata`
    );
  }
  return attemptId;
}

function priceIdOf(session: Stripe.Checkout.Session): string {
  const lines = session.line_items?.data ?? [];
  if (lines.length !== 1) {
    throw new TierCheckoutV1ReconcileError(
      `Session ${session.id} must have exactly one expanded line item`
    );
  }
  const price = lines[0]?.price;
  const priceId =
    typeof price === "string"
      ? price
      : price && typeof price === "object" && "id" in price
        ? String(price.id)
        : null;
  if (!priceId?.startsWith("price_")) {
    throw new TierCheckoutV1ReconcileError(
      `Session ${session.id} has no valid expanded Stripe Price`
    );
  }
  return priceId;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return objectId(invoice.parent?.subscription_details?.subscription);
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

function assertProviderSubscriptionAuthority(
  sub: Stripe.Subscription,
  session: Stripe.Checkout.Session,
  attemptId: string,
  customerId: string,
  livemode: boolean
): void {
  const items = sub.items?.data ?? [];
  const currentPriceId = items.length === 1 ? objectId(items[0]?.price) : null;
  if (
    items.length !== 1 ||
    !currentPriceId ||
    objectId(sub.customer) !== customerId ||
    sub.metadata?.respin_kind !== "tier_checkout" ||
    sub.metadata?.respin_checkout_attempt_id !== attemptId ||
    sub.livemode !== livemode ||
    objectId(session.subscription) !== sub.id
  ) {
    throw new TierCheckoutV1ReconcileError(
      `provider Subscription ${sub.id} differs from Session ${session.id}'s durable generation authority or has no sole current price`
    );
  }
}

function localMatchesProvider(
  row: typeof subscriptions.$inferSelect,
  provider: Stripe.Subscription,
  attemptId: string
): boolean {
  if (IRREVERSIBLE_STATUSES.has(provider.status)) {
    return (
      row.tierCheckoutAttemptId === null &&
      row.tierCheckoutGenerationAttemptId === attemptId &&
      row.tierCheckoutFenceAt !== null &&
      row.tierCheckoutFenceSubscriptionId === provider.id &&
      row.tierCheckoutFenceStatus === provider.status &&
      row.tierCheckoutFenceObservedSubscriptionId === null &&
      row.status === "incomplete" &&
      row.stripeSubscriptionId === `checkout_fence:${row.workspaceId}`
    );
  }
  const items = provider.items?.data ?? [];
  const item = items.length === 1 ? items[0] : null;
  return Boolean(
    item &&
      row.tierCheckoutAttemptId === null &&
      row.tierCheckoutGenerationAttemptId === attemptId &&
      row.tierCheckoutFenceAt === null &&
      row.stripeSubscriptionId === provider.id &&
      row.status === provider.status &&
      row.stripePriceId === objectId(item.price) &&
      row.currentPeriodStart?.getTime() === item.current_period_start * 1000 &&
      row.currentPeriodEnd?.getTime() === item.current_period_end * 1000 &&
      row.cancelAtPeriodEnd === provider.cancel_at_period_end &&
      (row.cancelAt?.getTime() ?? null) ===
        (provider.cancel_at ? provider.cancel_at * 1000 : null) &&
      (row.pausedAt !== null) === (provider.pause_collection !== null) &&
      (row.resumesAt?.getTime() ?? null) ===
        (provider.pause_collection?.resumes_at
          ? provider.pause_collection.resumes_at * 1000
          : null)
  );
}

async function listCustomerSubscriptionSessions(
  customerId: string
): Promise<Stripe.Checkout.Session[]> {
  const sessions: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;
  const seenPageEnds = new Set<string>();
  for (;;) {
    const page = await getStripe().checkout.sessions.list({
      customer: customerId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.has_more && page.data.length === 0) {
      throw new TierCheckoutV1ReconcileError(
        `Stripe returned an empty nonterminal Checkout Session page for ${customerId}`
      );
    }
    sessions.push(...page.data.filter((session) => session.mode === "subscription"));
    if (!page.has_more) return sessions;
    const pageEnd = page.data.at(-1)!.id;
    if (seenPageEnds.has(pageEnd)) {
      throw new TierCheckoutV1ReconcileError(
        `Stripe repeated Checkout Session page cursor ${pageEnd}`
      );
    }
    seenPageEnds.add(pageEnd);
    startingAfter = pageEnd;
  }
}

async function sessionIsIrreversiblyHarmless(
  session: Stripe.Checkout.Session
): Promise<boolean> {
  if (
    session.status === "expired" &&
    session.payment_status === "unpaid" &&
    !session.subscription
  ) {
    return true;
  }
  const subscriptionId = objectId(session.subscription);
  if (!subscriptionId) return false;
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return IRREVERSIBLE_STATUSES.has(subscription.status);
}

async function assertSoleActionableSession(
  target: Stripe.Checkout.Session,
  customerId: string,
  workspaceId: VerifiedWorkspaceId,
  attemptId: string
): Promise<void> {
  const sessions = await listCustomerSubscriptionSessions(customerId);
  if (!sessions.some((session) => session.id === target.id)) {
    throw new TierCheckoutV1ReconcileError(
      `account-wide customer scan did not contain retrieved Session ${target.id}`
    );
  }
  for (const session of sessions) {
    if (session.id === target.id) continue;
    if (session.metadata?.respin_checkout_attempt_id === attemptId) {
      throw new TierCheckoutV1ReconcileError(
        `customer ${customerId} has multiple Sessions for Checkout attempt ${attemptId}`
      );
    }
    if (await sessionIsIrreversiblyHarmless(session)) continue;
    const claimedWorkspace = session.metadata?.workspace_id ?? "(missing)";
    throw new TierCheckoutV1ReconcileError(
      `customer ${customerId} has another actionable subscription Session ${session.id} for workspace ${claimedWorkspace}; expected only ${workspaceId}`
    );
  }
}

function eventMatchesTarget(
  event: Stripe.Event,
  sessionId: string,
  subscriptionId: string,
  customerId: string,
  workspaceId: VerifiedWorkspaceId,
  attemptId: string
): boolean {
  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
    const session = object as Stripe.Checkout.Session;
    if (session.id !== sessionId) return false;
    if (
      objectId(session.customer) !== customerId ||
      session.metadata?.workspace_id !== workspaceId ||
      session.metadata?.respin_kind !== "tier_checkout" ||
      session.metadata?.respin_checkout_attempt_id !== attemptId ||
      objectId(session.subscription) !== subscriptionId
    ) {
      throw new TierCheckoutV1ReconcileError(
        `real Checkout event ${event.id} does not match Session ${sessionId}`
      );
    }
    return true;
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = object as Stripe.Subscription;
    if (subscription.id !== subscriptionId) return false;
    if (
      objectId(subscription.customer) !== customerId ||
      subscription.metadata?.workspace_id !== workspaceId ||
      subscription.metadata?.respin_kind !== "tier_checkout" ||
      subscription.metadata?.respin_checkout_attempt_id !== attemptId
    ) {
      throw new TierCheckoutV1ReconcileError(
        `real subscription event ${event.id} does not match recovered attempt ${attemptId}`
      );
    }
    return true;
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = object as Stripe.Invoice;
    if (invoiceSubscriptionId(invoice) !== subscriptionId) return false;
    const metadata = invoice.parent?.subscription_details?.metadata;
    if (
      objectId(invoice.customer) !== customerId ||
      metadata?.workspace_id !== workspaceId ||
      metadata?.respin_kind !== "tier_checkout" ||
      metadata?.respin_checkout_attempt_id !== attemptId
    ) {
      throw new TierCheckoutV1ReconcileError(
        `real invoice event ${event.id} does not match recovered attempt ${attemptId}`
      );
    }
    return true;
  }
  return false;
}

async function listRealRecoveryEvents(
  session: Stripe.Checkout.Session,
  subscriptionId: string,
  customerId: string,
  workspaceId: VerifiedWorkspaceId,
  attemptId: string,
  livemode: boolean
): Promise<Stripe.Event[]> {
  const matches: Stripe.Event[] = [];
  const seenEventIds = new Set<string>();
  for (const type of EVENT_TYPES) {
    let startingAfter: string | undefined;
    const seenPageEnds = new Set<string>();
    for (;;) {
      const page = await getStripe().events.list({
        type,
        created: { gte: Math.max(0, session.created - 1) },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      if (page.has_more && page.data.length === 0) {
        throw new TierCheckoutV1ReconcileError(
          `Stripe returned an empty nonterminal ${type} event page`
        );
      }
      for (const event of page.data) {
        if (
          eventMatchesTarget(
            event,
            session.id,
            subscriptionId,
            customerId,
            workspaceId,
            attemptId
          )
        ) {
          if (event.livemode !== livemode) {
            throw new TierCheckoutV1ReconcileError(
              `real event ${event.id} livemode differs from the active rollout binding`
            );
          }
          if (!seenEventIds.has(event.id)) {
            seenEventIds.add(event.id);
            matches.push(event);
          }
        }
      }
      if (!page.has_more) break;
      const pageEnd = page.data.at(-1)!.id;
      if (seenPageEnds.has(pageEnd)) {
        throw new TierCheckoutV1ReconcileError(
          `Stripe repeated ${type} event page cursor ${pageEnd}`
        );
      }
      seenPageEnds.add(pageEnd);
      startingAfter = pageEnd;
    }
  }
  return matches;
}

/** Recover one operator-selected provider Session after an active-state restore. */
export async function reconcileTierCheckoutV1Session(
  db: DbLike,
  sessionId: string
): Promise<TierCheckoutV1ReconcileReport> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    throw new TierCheckoutV1ReconcileError("session id is not a Stripe Checkout id");
  }
  const provider = await getAuthenticatedStripeAccountIdentity();
  await assertAutoTopupProtocolRecoveryReady(db);
  const rollout = await assertTierCheckoutProtocolRecoveryReady(db);
  if (
    rollout.stripeAccountId !== provider.accountId ||
    rollout.stripeLivemode !== provider.livemode
  ) {
    throw new TierCheckoutV1ReconcileError(
      "authenticated Stripe identity differs from the provider-bound rollout"
    );
  }
  const session = await getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price"],
  });
  if (session.id !== sessionId || session.mode !== "subscription") {
    throw new TierCheckoutV1ReconcileError(
      `provider object ${session.id} is not the requested subscription Session`
    );
  }
  const customerId = objectId(session.customer);
  if (!customerId) {
    throw new TierCheckoutV1ReconcileError(`Session ${session.id} has no customer`);
  }
  if (session.metadata?.respin_kind !== "tier_checkout") {
    throw new TierCheckoutV1ReconcileError(
      `Session ${session.id} is not marked as a Respin tier Checkout`
    );
  }
  const attemptId = attemptIdOf(session);
  const tier = tierOf(session);
  const priceId = priceIdOf(session);
  const authorityMetadata = tierCheckoutAuthorityMetadataFromProvider(
    session.metadata
  );
  const workspaceId = await workspaceForCustomer(db, customerId);
  if (!workspaceId) {
    throw new TierCheckoutV1ReconcileError(
      `customer ${customerId} has no durable workspace mapping; provider metadata is only a cross-check, so resolve or refund this generation at Stripe`
    );
  }
  verifyTierCheckoutAuthority(
    session.metadata,
    { attemptId, workspaceId, customerId },
    provider
  );
  if (
    session.metadata?.price_id !== priceId ||
    session.metadata?.tier !== tier ||
    session.livemode !== provider.livemode
  ) {
    throw new TierCheckoutV1ReconcileError(
      `Session ${session.id} differs from its provider generation or line-item identity`
    );
  }
  await assertSoleActionableSession(
    session,
    customerId,
    workspaceId,
    attemptId
  );
  const subscriptionId = objectId(session.subscription);
  if (!subscriptionId) {
    if (session.status === "expired" && session.payment_status === "unpaid") {
      return {
        sessionId,
        subscriptionId: null,
        workspaceId,
        outcome: "expired_unpaid",
        replayedEventIds: [],
        duplicateEventIds: [],
      };
    }
    if (session.status !== "open") {
      throw new TierCheckoutV1ReconcileError(
        `Session ${session.id} has status ${session.status ?? "unknown"} without a subscription`
      );
    }
  }


  let providerSubscription: Stripe.Subscription | null = null;
  let replayPlan: Stripe.Event[] = [];
  if (subscriptionId) {
    providerSubscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const providerAuthorityMetadata = tierCheckoutAuthorityMetadataFromProvider(
      providerSubscription.metadata
    );
    if (
      !exactStringRecordMatches(providerAuthorityMetadata, authorityMetadata)
    ) {
      throw new TierCheckoutV1ReconcileError(
        `provider Subscription ${subscriptionId} carries different signed authority from Session ${session.id}`
      );
    }
    verifyTierCheckoutAuthority(
      providerSubscription.metadata,
      { attemptId, workspaceId, customerId },
      provider
    );
    assertProviderSubscriptionAuthority(
      providerSubscription,
      session,
      attemptId,
      customerId,
      provider.livemode
    );
    const events = await listRealRecoveryEvents(
      session,
      subscriptionId,
      customerId,
      workspaceId,
      attemptId,
      provider.livemode
    );
    const providerKey = subscriptionSnapshotKey(providerSubscription);
    const currentSnapshots = events.filter((event) => {
      if (
        event.type !== "customer.subscription.created" &&
        event.type !== "customer.subscription.updated" &&
        event.type !== "customer.subscription.deleted"
      ) {
        return false;
      }
      return (
        subscriptionSnapshotKey(event.data.object as Stripe.Subscription) ===
        providerKey
      );
    });
    const newestCreated =
      currentSnapshots.length > 0
        ? Math.max(...currentSnapshots.map((event) => event.created))
        : null;
    const stateEvent =
      newestCreated === null
        ? null
        : currentSnapshots
            .filter((event) => event.created === newestCreated)
            .sort((left, right) => left.id.localeCompare(right.id))[0]!;
    if (
      stateEvent?.account !== undefined &&
      stateEvent.account !== provider.accountId
    ) {
      throw new TierCheckoutV1ReconcileError(
        `real event ${stateEvent.id} originated from a different Stripe account`
      );
    }
    const stateKeyAt = (event: Stripe.Event): string | null =>
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
        ? subscriptionSnapshotKey(event.data.object as Stripe.Subscription)
        : null;
    for (const created of new Set(events.map((event) => event.created))) {
      const distinctHistoricalStates = new Set(
        events
          .filter((event) => event.created === created)
          .map(stateKeyAt)
          .filter((key): key is string => key !== null)
      );
      if (
        distinctHistoricalStates.size > 1 &&
        !distinctHistoricalStates.has(providerKey)
      ) {
        throw new TierCheckoutV1ReconcileError(
          `Stripe history has multiple different subscription snapshots in second ${created} with no provider-current tie-break authority`
        );
      }
    }
    const rank = (event: Stripe.Event): number => {
      if (event.type === "checkout.session.completed") return 0;
      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        return stateKeyAt(event) === providerKey ? 4 : 1;
      }
      if (event.type === "invoice.payment_failed") return 2;
      return 3;
    };
    // Replay the complete real economic/state chain. Historical subscription
    // snapshots must precede invoices so pause and dunning knowledge exists at
    // the same point it did during live processing. Provider-current truth is
    // the final tie-breaker only within an equal-created-second group.
    replayPlan = [...events].sort(
      (left, right) =>
        left.created - right.created ||
        rank(left) - rank(right) ||
        left.id.localeCompare(right.id)
    );
  }

  return db.transaction(async (tx) => {
    await takeWorkspaceLockInOrder(tx, { workspaceId: workspaceId });
    await assertAutoTopupProtocolRecoveryReady(tx);
    await assertTierCheckoutProtocolRecoveryReady(tx);
    const [workspace] = await tx
      .select({ state: workspaces.lifecycleState })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const reboundWorkspace = await workspaceForCustomer(tx, customerId);
    if (
      workspace?.state !== "active" ||
      reboundWorkspace !== workspaceId
    ) {
      throw new TierCheckoutV1ReconcileError(
        `workspace ${workspaceId} is tombstoned or customer ${customerId} is mapped elsewhere`
      );
    }
    let [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1)
      .for("update");
    if (!row) {
      throw new TierCheckoutV1ReconcileError(
        `workspace ${workspaceId} has no durable Stripe customer mapping row; provider metadata cannot recreate product authority`
      );
    }
    const finalMappedWorkspace = await workspaceForCustomer(tx, customerId);
    if (
      !row ||
      row.stripeCustomerId !== customerId ||
      finalMappedWorkspace !== workspaceId
    ) {
      throw new TierCheckoutV1ReconcileError(
        `workspace ${workspaceId} has a conflicting Stripe customer mapping`
      );
    }
    const mayRepairExistingGeneration =
      !row.tierCheckoutFenceAt &&
      subscriptionId !== null &&
      row.stripeSubscriptionId === subscriptionId &&
      row.tierCheckoutAttemptId === null;
    if (
      mayRepairExistingGeneration &&
      row.tierCheckoutGenerationAttemptId !== null &&
      row.tierCheckoutGenerationAttemptId !== attemptId
    ) {
      throw new TierCheckoutV1ReconcileError(
        `workspace ${workspaceId} already records a different signed tier generation`
      );
    }
    if (
      mayRepairExistingGeneration &&
      row.tierCheckoutGenerationAttemptId === null
    ) {
      const [stamped] = await tx
        .update(subscriptions)
        .set({ tierCheckoutGenerationAttemptId: attemptId })
        .where(eq(subscriptions.workspaceId, workspaceId))
        .returning();
      if (!stamped) {
        throw new TierCheckoutV1ReconcileError(
          `workspace ${workspaceId} disappeared while stamping signed tier generation authority`
        );
      }
      row = stamped;
    }
    const mirrorWasConverged = Boolean(
      providerSubscription &&
        localMatchesProvider(row, providerSubscription, attemptId)
    );
    if (
      providerSubscription &&
      !mirrorWasConverged &&
      !replayPlan.some(
        (event) =>
          event.type === "customer.subscription.created" ||
          event.type === "customer.subscription.updated" ||
          event.type === "customer.subscription.deleted"
      )
    ) {
      throw new TierCheckoutV1ReconcileError(
        `Stripe event retention has no subscription snapshot with which to repair divergent local state for ${subscriptionId}`
      );
    }
    if (!row.tierCheckoutFenceAt && !mayRepairExistingGeneration) {
      throw new TierCheckoutV1ReconcileError(
        `workspace ${workspaceId} has no durable tier Checkout fence`
      );
    }
    if (row.tierCheckoutFenceAt && !mirrorWasConverged) {
      if (row.tierCheckoutAttemptId && row.tierCheckoutAttemptId !== attemptId) {
        throw new TierCheckoutV1ReconcileError(
          `workspace ${workspaceId} already has a different durable Checkout attempt`
        );
      }
      if (row.tierCheckoutAttemptId === attemptId) {
        if (
          row.tierCheckoutAttemptTier !== tier ||
          row.tierCheckoutAttemptPriceId !== priceId ||
          row.tierCheckoutAttemptCustomerId !== customerId ||
          (row.tierCheckoutAttemptSessionId !== null &&
            row.tierCheckoutAttemptSessionId !== session.id) ||
          (row.tierCheckoutAttemptSubscriptionId !== null &&
            row.tierCheckoutAttemptSubscriptionId !== subscriptionId) ||
            row.tierCheckoutAttemptStripeAccountId !== provider.accountId ||
            row.tierCheckoutAttemptStripeLivemode !== provider.livemode ||
            !exactStringRecordMatches(
              row.tierCheckoutAttemptAuthority,
              authorityMetadata
            )
        ) {
          throw new TierCheckoutV1ReconcileError(
            `workspace ${workspaceId} stored attempt ${attemptId} with different generation/provider authority`
          );
        }
      } else {
        await tx
          .update(subscriptions)
          .set({
            tierCheckoutAttemptId: attemptId,
            tierCheckoutAttemptTier: tier,
            tierCheckoutAttemptPriceId: priceId,
            tierCheckoutAttemptCustomerId: customerId,
            tierCheckoutAttemptSubscriptionGeneration:
              row.tierCheckoutFenceSubscriptionId,
            tierCheckoutAttemptIdempotencyKey: `checkout:v1:${workspaceId}:${attemptId}`,
            tierCheckoutAttemptSessionId: session.id,
            tierCheckoutAttemptSubscriptionId: subscriptionId,
            tierCheckoutAttemptStripeAccountId: provider.accountId,
            tierCheckoutAttemptStripeLivemode: provider.livemode,
            tierCheckoutAttemptAuthority: authorityMetadata,
            tierCheckoutAttemptReservedAt: new Date(session.created * 1000),
          })
          .where(eq(subscriptions.workspaceId, workspaceId));
      }
    }

    if (!subscriptionId) {
      return {
        sessionId,
        subscriptionId: null,
        workspaceId,
        outcome: "bound_open",
        replayedEventIds: [],
        duplicateEventIds: [],
      };
    }

    const replayedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];
    for (const event of replayPlan) {
      try {
        await handleStripeEventInTransaction(tx, event, { recovery: true });
        replayedEventIds.push(event.id);
      } catch (error) {
        if (!(error instanceof DuplicateStripeEvent)) throw error;
        if (event.type === "invoice.paid") {
          const invoice = event.data.object as Stripe.Invoice;
          if (!invoice.id) {
            throw new TierCheckoutV1ReconcileError(
              `duplicate financial event ${event.id} has no invoice identity`
            );
          }
          const grantBearing = GRANT_BILLING_REASONS.has(
            invoice.billing_reason ?? ""
          );
          const [grant] = await tx
            .select({
              id: creditLedger.id,
              eventId: creditLedger.stripeEventId,
              attemptId: creditLedger.tierCheckoutAttemptId,
            })
            .from(creditLedger)
            .where(
              and(
                eq(creditLedger.workspaceId, workspaceId),
                eq(creditLedger.refType, "invoice"),
                eq(creditLedger.refId, invoice.id)
              )
            )
            .limit(1);
          const exactProcessedGrant =
            error.receiptWorkspaceId === workspaceId &&
            error.receiptOutcome === "processed" &&
            grant?.eventId === event.id &&
            grant.attemptId === attemptId;
          const exactIgnoredExistingGrant =
            error.receiptWorkspaceId === workspaceId &&
            error.receiptOutcome === "ignored" &&
            grant?.attemptId === attemptId;
          const exactIgnoredWithoutGrant =
            error.receiptWorkspaceId === workspaceId &&
            error.receiptOutcome === "ignored" &&
            !grant;
          const exactProviderAuthority =
            error.tierInvoiceAuthority !== null &&
            exactStringRecordMatches(
              error.storedTierInvoiceAuthority,
              error.tierInvoiceAuthority
            );
          let exactPausedNoGrant = false;
          if (grantBearing && exactIgnoredWithoutGrant) {
            const pauses = await tx
              .select({
                startedAt: pausePeriods.startedAt,
                startedKnownAt: pausePeriods.startedKnownAt,
                endedKnownAt: pausePeriods.endedKnownAt,
              })
              .from(pausePeriods)
              .where(eq(pausePeriods.workspaceId, workspaceId));
            const eventAt = event.created * 1000;
            exactPausedNoGrant = pauses.some((pause) => {
              const startedKnownAt =
                pause.startedKnownAt?.getTime() ?? pause.startedAt.getTime();
              return (
                eventAt > startedKnownAt + CLOCK_SKEW_MS &&
                (pause.endedKnownAt === null ||
                  eventAt <= pause.endedKnownAt.getTime())
              );
            });
          }
          if (
            error.receiptWorkspaceId !== workspaceId ||
            error.receiptOutcome === null ||
            (grantBearing && !exactProviderAuthority) ||
            (grantBearing
              ? !exactProcessedGrant &&
                !exactIgnoredExistingGrant &&
                !exactPausedNoGrant
              : !exactIgnoredWithoutGrant)
          ) {
            throw new TierCheckoutV1ReconcileError(
              `duplicate financial event ${event.id} has no exact finalized ${grantBearing ? "invoice grant" : "non-grant receipt"}`
            );
          }
        }
        duplicateEventIds.push(event.id);
      }
    }

    const finalProviderSubscription = await getStripe().subscriptions.retrieve(
      subscriptionId
    );
    const finalAuthorityMetadata = tierCheckoutAuthorityMetadataFromProvider(
      finalProviderSubscription.metadata
    );
    if (!exactStringRecordMatches(finalAuthorityMetadata, authorityMetadata)) {
      throw new TierCheckoutV1ReconcileError(
        `provider Subscription ${subscriptionId} changed signed authority during replay`
      );
    }
    assertProviderSubscriptionAuthority(
      finalProviderSubscription,
      session,
      attemptId,
      customerId,
      provider.livemode
    );
    const [after] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);
    if (
      !after ||
      !localMatchesProvider(after, finalProviderSubscription, attemptId)
    ) {
      throw new TierCheckoutV1ReconcileError(
        `real event replay did not converge ${subscriptionId} to provider status ${finalProviderSubscription.status}; finalized local receipts remain immutable`
      );
    }

    return {
      sessionId,
      subscriptionId,
      workspaceId,
      outcome:
        mirrorWasConverged && replayedEventIds.length === 0
          ? "already_converged"
          : "replayed",
      replayedEventIds,
      duplicateEventIds,
    };
  });
}
