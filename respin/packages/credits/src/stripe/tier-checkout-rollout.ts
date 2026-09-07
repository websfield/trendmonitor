// Staged legacy -> durable tier-Checkout rollout authority.
//
// Migration 0049 is expansion-only: old webhook binaries keep seeing ordinary
// rows. An operator stops ingress/the legacy fleet, begins the DB-authored
// drain (which atomically fences every eligible generation), waits the pinned
// maximum provider-call window, audits every subscription Checkout Session in
// the bound Stripe account, and only then activates v1 Session creation.
import { and, eq, sql } from "drizzle-orm";
import {
  configVersions,
  creditLedger,
  stripeEvents,
  subscriptions,
  tierCheckoutProtocolRollouts,
  type DbLike,
  type TierCheckoutProtocolRollout,
  type TxLike,
} from "@respin/db";
import { getDbNow } from "../clock";
import { getActiveConfig } from "@respin/config";
import { IRREVERSIBLE_STATUSES } from "../state";
import {
  getAuthenticatedStripeAccountIdentity,
  getStripe,
  STRIPE_MAX_CALL_WINDOW_MS,
  type Stripe,
  type StripeAccountIdentity,
} from "./adapter";
import { assertPackCheckoutV1WriterFence } from "./pack-price";

export const TIER_CHECKOUT_PROTOCOL = "v1";
export type TierCheckoutProtocolState = "expanded" | "draining" | "active";
export const LEGACY_TIER_CHECKOUT_QUIESCENCE_SAFETY_MS = 50_000;
export const LEGACY_TIER_CHECKOUT_QUIESCENCE_MS =
  STRIPE_MAX_CALL_WINDOW_MS + LEGACY_TIER_CHECKOUT_QUIESCENCE_SAFETY_MS;

export class TierCheckoutRolloutError extends Error {
  constructor(detail: string) {
    super(`Tier Checkout protocol rollout refused: ${detail}`);
    this.name = "TierCheckoutRolloutError";
  }
}

export type TierCheckoutDrainBlocker = Readonly<{
  sessionId: string;
  workspaceId: string | null;
  reason:
    | "identity_mismatch"
    | "missing_workspace_metadata"
    | "orphaned_customer_mapping"
    | "post_drain_legacy_session"
    | "open_session"
    | "completed_without_subscription"
    | "unresolved_session_state"
    | "paid_pack_not_minted"
    | "unresolved_pack_payment"
    | "live_subscription_not_mirrored"
    | "local_live_subscription_not_found"
    | "terminal_subscription_mirrored_live"
    | "multiple_live_subscriptions";
  status: string;
}>;

export type TierCheckoutDrainReport = Readonly<{
  clear: boolean;
  rolloutRevision: number;
  customers: number;
  sessions: number;
  blockers: readonly TierCheckoutDrainBlocker[];
}>;

function customerIdOf(session: Stripe.Checkout.Session): string | null {
  return typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? null;
}

function subscriptionIdOf(session: Stripe.Checkout.Session): string | null {
  return typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
}

function assertProviderBinding(
  rollout: TierCheckoutProtocolRollout,
  identity: StripeAccountIdentity
): void {
  if (
    rollout.stripeAccountId !== identity.accountId ||
    rollout.stripeLivemode !== identity.livemode
  ) {
    throw new TierCheckoutRolloutError(
      "authenticated Stripe account or livemode does not match the immutable rollout binding"
    );
  }
}

async function assertPackCheckoutWriterFence(tx: DbLike | TxLike): Promise<void> {
  try {
    const { content } = await getActiveConfig(tx);
    assertPackCheckoutV1WriterFence(content.stripePriceMap);
  } catch (error) {
    throw new TierCheckoutRolloutError(
      `rollback-safe pack writer fence is absent: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function getTierCheckoutProtocolRollout(
  tx: DbLike | TxLike
): Promise<TierCheckoutProtocolRollout> {
  const [row] = await tx
    .select()
    .from(tierCheckoutProtocolRollouts)
    .where(eq(tierCheckoutProtocolRollouts.protocol, TIER_CHECKOUT_PROTOCOL))
    .limit(1);
  if (!row) {
    throw new TierCheckoutRolloutError(
      "the v1 rollout authority row is missing (apply migration 0049)"
    );
  }
  return row;
}

export async function getTierCheckoutProtocolState(
  tx: DbLike | TxLike
): Promise<TierCheckoutProtocolState> {
  const state = (await getTierCheckoutProtocolRollout(tx)).state;
  if (state !== "expanded" && state !== "draining" && state !== "active") {
    throw new TierCheckoutRolloutError(`stored protocol state is invalid (${state})`);
  }
  return state;
}

export async function assertTierCheckoutProtocolActive(
  tx: DbLike | TxLike,
  identity: StripeAccountIdentity
): Promise<TierCheckoutProtocolRollout> {
  const rollout = await getTierCheckoutProtocolRollout(tx);
  if (rollout.state !== "active") {
    throw new TierCheckoutRolloutError(
      "v1 Session creation remains closed until the legacy fleet drain and provider audit are complete"
    );
  }
  assertProviderBinding(rollout, identity);
  await assertPackCheckoutWriterFence(tx);
  return rollout;
}

/**
 * Recovery/webhook authority. Settlement and restore repair stay available while
 * the fleet is draining; only new Session creation requires `active`. This is
 * what lets a pre-drain async payment finish and lets a PITR repair provider
 * state before the provider audit can legitimately activate the protocol.
 */
export async function assertTierCheckoutProtocolRecoveryReady(
  tx: DbLike | TxLike
): Promise<TierCheckoutProtocolRollout> {
  const rollout = await getTierCheckoutProtocolRollout(tx);
  if (rollout.state !== "draining" && rollout.state !== "active") {
    throw new TierCheckoutRolloutError(
      "v1 recovery requires a draining or active provider-bound rollout"
    );
  }
  assertProviderBinding(
    rollout,
    await getAuthenticatedStripeAccountIdentity()
  );
  return rollout;
}

async function fenceEligibleGenerations(tx: TxLike): Promise<void> {
  await tx
    .update(subscriptions)
    .set({
      tierCheckoutFenceAt: sql`clock_timestamp()`,
      tierCheckoutFenceSubscriptionId: subscriptions.stripeSubscriptionId,
      tierCheckoutFenceStatus: subscriptions.status,
      tierCheckoutFenceObservedSubscriptionId: null,
      stripeSubscriptionId: sql`'checkout_fence:' || ${subscriptions.workspaceId}::text`,
      status: "incomplete",
    })
    .where(sql`${subscriptions.tierCheckoutFenceAt} IS NULL AND (
      ${subscriptions.stripeSubscriptionId} IS NULL
      OR ${subscriptions.status} IN ('canceled', 'incomplete_expired')
    )`);
}

/**
 * First operator transition. Call only after ingress and every old application
 * and webhook process are stopped. The table lock waits out in-flight DB writes;
 * the later quiescence window and provider audit cover already-dispatched calls.
 */
export async function beginTierCheckoutProtocolDrain(
  db: DbLike,
  fleetQuiescedAt: Date
): Promise<TierCheckoutProtocolRollout> {
  if (Number.isNaN(fleetQuiescedAt.getTime())) {
    throw new TierCheckoutRolloutError("fleetQuiescedAt is not a valid instant");
  }
  const provider = await getAuthenticatedStripeAccountIdentity();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`LOCK TABLE ${subscriptions}, ${stripeEvents}, ${creditLedger}, ${configVersions}, ${tierCheckoutProtocolRollouts} IN SHARE ROW EXCLUSIVE MODE`
    );
    const now = await getDbNow(tx);
    if (fleetQuiescedAt.getTime() > now.getTime()) {
      throw new TierCheckoutRolloutError(
        "fleetQuiescedAt cannot be later than the database clock"
      );
    }
    const rollout = await getTierCheckoutProtocolRollout(tx);
    await assertPackCheckoutWriterFence(tx);
    if (rollout.state === "active" || rollout.state === "draining") {
      assertProviderBinding(rollout, provider);
      return rollout;
    }
    const [draining] = await tx
      .update(tierCheckoutProtocolRollouts)
      .set({
        state: "draining",
        revision: 1,
        fleetQuiescedAt,
        drainStartedAt: now,
        providerReconciledAt: null,
        reconciledCustomers: null,
        reconciledSessions: null,
        stripeAccountId: provider.accountId,
        stripeLivemode: provider.livemode,
        activatedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(tierCheckoutProtocolRollouts.protocol, TIER_CHECKOUT_PROTOCOL),
          eq(tierCheckoutProtocolRollouts.state, "expanded")
        )
      )
      .returning();
    if (!draining) {
      throw new TierCheckoutRolloutError("the expansion-to-draining CAS lost");
    }
    await fenceEligibleGenerations(tx);
    return draining;
  });
}

export async function restartTierCheckoutProtocolDrain(
  db: DbLike,
  fleetQuiescedAt: Date
): Promise<TierCheckoutProtocolRollout> {
  const provider = await getAuthenticatedStripeAccountIdentity();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`LOCK TABLE ${subscriptions}, ${stripeEvents}, ${creditLedger}, ${configVersions}, ${tierCheckoutProtocolRollouts} IN SHARE ROW EXCLUSIVE MODE`
    );
    const now = await getDbNow(tx);
    if (
      Number.isNaN(fleetQuiescedAt.getTime()) ||
      fleetQuiescedAt.getTime() > now.getTime()
    ) {
      throw new TierCheckoutRolloutError(
        "restart fleetQuiescedAt must be a valid instant no later than the database clock"
      );
    }
    const rollout = await getTierCheckoutProtocolRollout(tx);
    await assertPackCheckoutWriterFence(tx);
    if (rollout.state !== "draining") {
      throw new TierCheckoutRolloutError("restart requires draining state");
    }
    assertProviderBinding(rollout, provider);
    const [restarted] = await tx
      .update(tierCheckoutProtocolRollouts)
      .set({
        revision: sql`${tierCheckoutProtocolRollouts.revision} + 1`,
        fleetQuiescedAt,
        drainStartedAt: now,
        providerReconciledAt: null,
        reconciledCustomers: null,
        reconciledSessions: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(tierCheckoutProtocolRollouts.protocol, TIER_CHECKOUT_PROTOCOL),
          eq(tierCheckoutProtocolRollouts.state, "draining")
        )
      )
      .returning();
    if (!restarted) throw new TierCheckoutRolloutError("drain restart CAS lost");
    await fenceEligibleGenerations(tx);
    return restarted;
  });
}

/** Complete, account-wide, paginated provider proof. No provider writes. */
export async function auditTierCheckoutLegacyDrain(
  db: DbLike
): Promise<TierCheckoutDrainReport> {
  const rollout = await getTierCheckoutProtocolRollout(db);
  if (rollout.state !== "draining" || !rollout.drainStartedAt) {
    throw new TierCheckoutRolloutError("provider reconciliation requires draining state");
  }
  const provider = await getAuthenticatedStripeAccountIdentity();
  assertProviderBinding(rollout, provider);
  const now = await db.transaction((tx) => getDbNow(tx));
  const remainingMs =
    LEGACY_TIER_CHECKOUT_QUIESCENCE_MS -
    (now.getTime() - rollout.drainStartedAt.getTime());
  if (remainingMs > 0) {
    throw new TierCheckoutRolloutError(
      `the database-authored drain fence must remain closed for another ${remainingMs}ms before provider reconciliation`
    );
  }

  const rows = await db
    .select({
      workspaceId: subscriptions.workspaceId,
      customerId: subscriptions.stripeCustomerId,
      subscriptionId: subscriptions.stripeSubscriptionId,
      status: subscriptions.status,
      fenceAt: subscriptions.tierCheckoutFenceAt,
    })
    .from(subscriptions);
  const byCustomer = new Map(rows.map((row) => [row.customerId, row]));
  const blockers: TierCheckoutDrainBlocker[] = [];
  const liveSubscriptionsByWorkspace = new Map<string, Set<string>>();
  let sessions = 0;
  let startingAfter: string | undefined;
  const seenPageEnds = new Set<string>();
  const stripe = getStripe();
  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.has_more && page.data.length === 0) {
      throw new TierCheckoutRolloutError(
        "Stripe returned an empty nonterminal account-wide Checkout Session page"
      );
    }
    for (const session of page.data) {
      const isTierCheckout = session.mode === "subscription";
      const isPackCheckout =
        session.mode === "payment" && session.metadata?.respin_kind === "pack";
      if (!isTierCheckout && !isPackCheckout) continue;
      const metadataWorkspace = session.metadata?.workspace_id ?? null;
      const customerId = customerIdOf(session);
      const mapped = customerId ? byCustomer.get(customerId) ?? null : null;
      // A subscription Session is ours if either its metadata claims a Respin
      // workspace or its customer resolves through the sole local mapping. A
      // legacy/malformed Session on a mapped customer may omit metadata; that
      // is an ambiguity to resolve, not another Stripe tenant's noise.
      if (!metadataWorkspace && !mapped) continue;
      sessions += 1;
      const common = {
        sessionId: session.id,
        workspaceId: metadataWorkspace ?? mapped?.workspaceId ?? null,
        status: session.status ?? "unknown",
      } as const;
      if (!customerId || !mapped) {
        blockers.push({ ...common, reason: "orphaned_customer_mapping" });
        continue;
      }
      if (isTierCheckout && !metadataWorkspace) {
        blockers.push({ ...common, reason: "missing_workspace_metadata" });
        continue;
      }
      if (metadataWorkspace && mapped.workspaceId !== metadataWorkspace) {
        blockers.push({ ...common, reason: "identity_mismatch" });
        continue;
      }
      if (
        session.created * 1000 >
          rollout.drainStartedAt.getTime() + STRIPE_MAX_CALL_WINDOW_MS
      ) {
        blockers.push({ ...common, reason: "post_drain_legacy_session" });
        continue;
      }
      if (isPackCheckout) {
        if (session.status === "open") {
          blockers.push({ ...common, reason: "open_session" });
          continue;
        }
        const [mint] = await db
          .select({ id: creditLedger.id })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.workspaceId, mapped.workspaceId),
              eq(creditLedger.refType, "checkout_session"),
              eq(creditLedger.refId, session.id)
            )
          )
          .limit(1);
        if (session.payment_status === "paid") {
          if (!mint) {
            blockers.push({ ...common, reason: "paid_pack_not_minted" });
          }
          continue;
        }
        if (session.status === "expired" && session.payment_status === "unpaid") {
          continue;
        }
        blockers.push({ ...common, reason: "unresolved_pack_payment" });
        continue;
      }
      if (session.status === "open") {
        blockers.push({ ...common, reason: "open_session" });
        continue;
      }
      const subscriptionId = subscriptionIdOf(session);
      if (session.status === "complete" && !subscriptionId) {
        blockers.push({ ...common, reason: "completed_without_subscription" });
        continue;
      }
      if (!subscriptionId) {
        if (
          session.status === "expired" &&
          session.payment_status === "unpaid"
        ) {
          continue;
        }
        blockers.push({ ...common, reason: "unresolved_session_state" });
        continue;
      }
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (IRREVERSIBLE_STATUSES.has(sub.status)) {
        if (
          mapped.fenceAt === null &&
          mapped.subscriptionId === subscriptionId &&
          !IRREVERSIBLE_STATUSES.has(mapped.status)
        ) {
          blockers.push({
            ...common,
            reason: "terminal_subscription_mirrored_live",
          });
        }
        continue;
      }
      const live =
        liveSubscriptionsByWorkspace.get(mapped.workspaceId) ?? new Set<string>();
      live.add(subscriptionId);
      liveSubscriptionsByWorkspace.set(mapped.workspaceId, live);
      if (
        mapped.fenceAt !== null ||
        mapped.subscriptionId !== subscriptionId ||
        IRREVERSIBLE_STATUSES.has(mapped.status)
      ) {
        blockers.push({ ...common, reason: "live_subscription_not_mirrored" });
      }
    }
    if (!page.has_more) break;
    const pageEnd = page.data.at(-1)!.id;
    if (seenPageEnds.has(pageEnd)) {
      throw new TierCheckoutRolloutError(
        `Stripe repeated Checkout Session page cursor ${pageEnd}`
      );
    }
    seenPageEnds.add(pageEnd);
    startingAfter = pageEnd;
  }

  for (const row of rows) {
    if (
      row.fenceAt !== null ||
      row.subscriptionId === null ||
      IRREVERSIBLE_STATUSES.has(row.status)
    ) {
      continue;
    }
    if (
      !liveSubscriptionsByWorkspace
        .get(row.workspaceId)
        ?.has(row.subscriptionId)
    ) {
      blockers.push({
        sessionId: `local:${row.subscriptionId}`,
        workspaceId: row.workspaceId,
        reason: "local_live_subscription_not_found",
        status: row.status,
      });
    }
  }

  for (const [workspaceId, live] of liveSubscriptionsByWorkspace) {
    if (live.size <= 1) continue;
    for (const subscriptionId of live) {
      blockers.push({
        sessionId: `subscription:${subscriptionId}`,
        workspaceId,
        reason: "multiple_live_subscriptions",
        status: "live",
      });
    }
  }

  const report: TierCheckoutDrainReport = {
    clear: blockers.length === 0,
    rolloutRevision: rollout.revision,
    customers: rows.length,
    sessions,
    blockers,
  };
  if (!report.clear) return report;

  await db.transaction(async (tx) => {
    const current = await getTierCheckoutProtocolRollout(tx);
    if (
      current.state !== "draining" ||
      current.revision !== rollout.revision ||
      current.stripeAccountId !== provider.accountId ||
      current.stripeLivemode !== provider.livemode
    ) {
      throw new TierCheckoutRolloutError(
        "rollout authority changed during provider reconciliation"
      );
    }
    const recordedAt = await getDbNow(tx);
    await tx
      .update(tierCheckoutProtocolRollouts)
      .set({
        providerReconciledAt: recordedAt,
        reconciledCustomers: report.customers,
        reconciledSessions: report.sessions,
        updatedAt: recordedAt,
      })
      .where(
        and(
          eq(tierCheckoutProtocolRollouts.protocol, TIER_CHECKOUT_PROTOCOL),
          eq(tierCheckoutProtocolRollouts.state, "draining"),
          eq(tierCheckoutProtocolRollouts.revision, rollout.revision)
        )
      );
  });
  return report;
}

export async function activateTierCheckoutAttemptProtocol(
  db: DbLike
): Promise<TierCheckoutProtocolRollout> {
  const provider = await getAuthenticatedStripeAccountIdentity();
  const before = await getTierCheckoutProtocolRollout(db);
  if (before.state === "active") {
    assertProviderBinding(before, provider);
    return before;
  }
  const report = await auditTierCheckoutLegacyDrain(db);
  if (!report.clear) {
    throw new TierCheckoutRolloutError(
      `provider reconciliation has ${report.blockers.length} unresolved Checkout Session(s)`
    );
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`LOCK TABLE ${subscriptions}, ${stripeEvents}, ${creditLedger}, ${configVersions}, ${tierCheckoutProtocolRollouts} IN SHARE ROW EXCLUSIVE MODE`
    );
    const rollout = await getTierCheckoutProtocolRollout(tx);
    await assertPackCheckoutWriterFence(tx);
    assertProviderBinding(rollout, provider);
    if (
      rollout.state !== "draining" ||
      rollout.revision !== report.rolloutRevision ||
      !rollout.providerReconciledAt ||
      rollout.reconciledCustomers !== report.customers ||
      rollout.reconciledSessions !== report.sessions
    ) {
      throw new TierCheckoutRolloutError(
        "the recorded provider proof changed before activation"
      );
    }
    await fenceEligibleGenerations(tx);
    const activatedAt = await getDbNow(tx);
    const [active] = await tx
      .update(tierCheckoutProtocolRollouts)
      .set({ state: "active", activatedAt, updatedAt: activatedAt })
      .where(
        and(
          eq(tierCheckoutProtocolRollouts.protocol, TIER_CHECKOUT_PROTOCOL),
          eq(tierCheckoutProtocolRollouts.state, "draining"),
          eq(tierCheckoutProtocolRollouts.revision, report.rolloutRevision)
        )
      )
      .returning();
    if (!active) throw new TierCheckoutRolloutError("activation CAS lost");
    return active;
  });
}
