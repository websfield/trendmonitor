// Staged protocol-0 -> durable-attempt rollout authority.
//
// Expansion is deliberately harmless to the old binary. Activation is a
// separate operator step: the old fleet must be stopped, its maximum Stripe
// call window must have elapsed, and every legacy PaymentIntent must be
// enumerated to a terminal/reconciled state. The durable row makes those facts
// reviewable and prevents an application deploy from silently skipping them.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  autoTopupProtocolRollouts,
  creditLedger,
  pausePeriods,
  subscriptions,
  type AutoTopupProtocolRollout,
  type DbLike,
  type TxLike,
} from "@respin/db";
import { getDbNow } from "../clock";
import {
  getAutoTopupAuthorityKeyMaterial,
  getAuthenticatedStripeAccountIdentity,
  getStripe,
  STRIPE_MAX_CALL_WINDOW_MS,
  type StripeAccountIdentity,
} from "./adapter";
import { verifyAutoTopupAuthority } from "./auto-topup-authority";

export const AUTO_TOPUP_PROTOCOL = "v1";
export type AutoTopupProtocolState = "expanded" | "draining" | "active";
// The pre-0048 client used Stripe's SDK defaults and performed the provider
// call outside a DB transaction. Five minutes is the reviewed fleet barrier.
// It starts at the database-authored drain fence, never at a caller-supplied
// timestamp, so a stale or mistyped operator timestamp cannot shorten it.
export const LEGACY_AUTO_TOPUP_QUIESCENCE_SAFETY_MS = 50_000;
export const LEGACY_AUTO_TOPUP_QUIESCENCE_MS =
  STRIPE_MAX_CALL_WINDOW_MS + LEGACY_AUTO_TOPUP_QUIESCENCE_SAFETY_MS;

export class AutoTopupRolloutError extends Error {
  constructor(detail: string) {
    super(`Auto-top-up protocol rollout refused: ${detail}`);
    this.name = "AutoTopupRolloutError";
  }
}

export type AutoTopupLegacyDrainBlocker = Readonly<{
  paymentIntentId: string;
  workspaceId: string | null;
  reason:
    | "identity_mismatch"
    | "orphaned_customer_mapping"
    | "post_drain_legacy_intent"
    | "succeeded_without_ledger"
    | "succeeded_in_other_workspace"
    | "provider_not_terminal"
    | "v1_succeeded_without_ledger"
    | "v1_settlement_mismatch"
    | "v1_provider_not_terminal";
  status: string;
}>;

export type AutoTopupLegacyDrainReport = Readonly<{
  clear: boolean;
  rolloutRevision: number;
  customers: number;
  paymentIntents: number;
  blockers: readonly AutoTopupLegacyDrainBlocker[];
  reconciledSucceeded: readonly Readonly<{
    paymentIntentId: string;
    workspaceId: string;
  }>[];
}>;

function assertRolloutKeyBinding(
  rollout: AutoTopupProtocolRollout,
  key: ReturnType<typeof getAutoTopupAuthorityKeyMaterial>
): void {
  if (
    rollout.authorityKeyId !== key.id ||
    rollout.authorityKeyFingerprint !== key.fingerprint
  ) {
    throw new AutoTopupRolloutError(
      "configured authority key does not match the immutable rollout binding"
    );
  }
}

function assertRolloutProviderBinding(
  rollout: AutoTopupProtocolRollout,
  identity: StripeAccountIdentity
): void {
  if (
    rollout.stripeAccountId !== identity.accountId ||
    rollout.stripeLivemode !== identity.livemode
  ) {
    throw new AutoTopupRolloutError(
      "authenticated Stripe account or livemode does not match the immutable rollout binding"
    );
  }
}

export async function getAutoTopupProtocolRollout(
  tx: DbLike | TxLike
): Promise<AutoTopupProtocolRollout> {
  const [row] = await tx
    .select()
    .from(autoTopupProtocolRollouts)
    .where(eq(autoTopupProtocolRollouts.protocol, AUTO_TOPUP_PROTOCOL))
    .limit(1);
  if (!row) {
    throw new AutoTopupRolloutError(
      "the v1 rollout authority row is missing (apply migration 0048)"
    );
  }
  return row;
}

export async function getAutoTopupProtocolState(
  tx: DbLike | TxLike
): Promise<AutoTopupProtocolState> {
  const rollout = await getAutoTopupProtocolRollout(tx);
  const state = rollout.state;
  if (state !== "expanded" && state !== "draining" && state !== "active") {
    throw new AutoTopupRolloutError(`stored protocol state is invalid (${state})`);
  }
  // "active" is a product-visible charge-authority claim, not just a string in
  // PostgreSQL. If its immutable key/provider binding drifted, callers and the
  // billing UI must degrade rather than present auto-top-up as live.
  if (state === "active") {
    assertRolloutKeyBinding(rollout, getAutoTopupAuthorityKeyMaterial());
    assertRolloutProviderBinding(
      rollout,
      await getAuthenticatedStripeAccountIdentity()
    );
  }
  return state;
}

export async function isAutoTopupProtocolActive(tx: TxLike): Promise<boolean> {
  const rollout = await getAutoTopupProtocolRollout(tx);
  if (rollout.state !== "active") return false;
  const key = getAutoTopupAuthorityKeyMaterial();
  assertRolloutKeyBinding(rollout, key);
  assertRolloutProviderBinding(
    rollout,
    await getAuthenticatedStripeAccountIdentity()
  );
  return true;
}

/**
 * Recovery is permitted while the charge-authority fence is still closed.
 * This lets operators converge provider-only v1 attempts before activation
 * without granting request-time permission to create a new charge.
 */
export async function assertAutoTopupProtocolRecoveryReady(
  tx: DbLike | TxLike
): Promise<AutoTopupProtocolRollout> {
  const rollout = await getAutoTopupProtocolRollout(tx);
  if (rollout.state !== "draining" && rollout.state !== "active") {
    throw new AutoTopupRolloutError(
      "v1 recovery requires a provider-bound draining or active rollout"
    );
  }
  assertRolloutKeyBinding(rollout, getAutoTopupAuthorityKeyMaterial());
  assertRolloutProviderBinding(
    rollout,
    await getAuthenticatedStripeAccountIdentity()
  );
  return rollout;
}

/**
 * First operator transition. Call only after ingress and every old application
 * process are stopped; the timestamp proves the full legacy provider-call
 * window elapsed before this transaction fenced the old opt-in.
 */
export async function beginAutoTopupProtocolDrain(
  db: DbLike,
  fleetQuiescedAt: Date
): Promise<AutoTopupProtocolRollout> {
  if (Number.isNaN(fleetQuiescedAt.getTime())) {
    throw new AutoTopupRolloutError("fleetQuiescedAt is not a valid instant");
  }
  const key = getAutoTopupAuthorityKeyMaterial();
  const provider = await getAuthenticatedStripeAccountIdentity();
  return db.transaction(async (tx) => {
    // Table locks close old setters/webhook inserts through commit. They cannot
    // close a provider request that already left the process; that is why the
    // explicit fleet barrier above is a mandatory, separately checked proof.
    await tx.execute(
      sql`LOCK TABLE ${subscriptions}, ${creditLedger}, ${pausePeriods}, ${autoTopupProtocolRollouts} IN SHARE ROW EXCLUSIVE MODE`
    );
    const now = await getDbNow(tx);
    if (fleetQuiescedAt.getTime() > now.getTime()) {
      throw new AutoTopupRolloutError(
        "fleetQuiescedAt cannot be later than the database clock"
      );
    }
    const rollout = await getAutoTopupProtocolRollout(tx);
    if (rollout.state === "active" || rollout.state === "draining") {
      assertRolloutKeyBinding(rollout, key);
      assertRolloutProviderBinding(rollout, provider);
      return rollout;
    }

    await tx
      .update(subscriptions)
      .set({
        autoTopupRearmAfterUpgrade: sql`${subscriptions.autoTopupRearmAfterUpgrade} OR ${subscriptions.autoTopupEnabled}`,
        autoTopupEnabled: false,
        autoTopupV1Enabled: false,
      });
    const [draining] = await tx
      .update(autoTopupProtocolRollouts)
      .set({
        state: "draining",
        revision: 1,
        fleetQuiescedAt,
        drainStartedAt: now,
        providerReconciledAt: null,
        reconciledCustomers: null,
        reconciledPaymentIntents: null,
        authorityKeyId: key.id,
        authorityKeyFingerprint: key.fingerprint,
        stripeAccountId: provider.accountId,
        stripeLivemode: provider.livemode,
        activatedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(autoTopupProtocolRollouts.protocol, AUTO_TOPUP_PROTOCOL),
          eq(autoTopupProtocolRollouts.state, "expanded")
        )
      )
      .returning();
    if (!draining) {
      throw new AutoTopupRolloutError("the expansion-to-draining CAS lost");
    }
    return draining;
  });
}

/** Restart the database-authored barrier after evidence the old fleet was not quiescent. */
export async function restartAutoTopupProtocolDrain(
  db: DbLike,
  fleetQuiescedAt: Date
): Promise<AutoTopupProtocolRollout> {
  const key = getAutoTopupAuthorityKeyMaterial();
  const provider = await getAuthenticatedStripeAccountIdentity();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`LOCK TABLE ${subscriptions}, ${creditLedger}, ${pausePeriods}, ${autoTopupProtocolRollouts} IN SHARE ROW EXCLUSIVE MODE`
    );
    const now = await getDbNow(tx);
    if (
      Number.isNaN(fleetQuiescedAt.getTime()) ||
      fleetQuiescedAt.getTime() > now.getTime()
    ) {
      throw new AutoTopupRolloutError(
        "restart fleetQuiescedAt must be a valid instant no later than the database clock"
      );
    }
    const rollout = await getAutoTopupProtocolRollout(tx);
    if (rollout.state !== "draining") {
      throw new AutoTopupRolloutError("restart requires draining state");
    }
    assertRolloutKeyBinding(rollout, key);
    assertRolloutProviderBinding(rollout, provider);
    const [restarted] = await tx
      .update(autoTopupProtocolRollouts)
      .set({
        revision: sql`${autoTopupProtocolRollouts.revision} + 1`,
        fleetQuiescedAt,
        drainStartedAt: now,
        providerReconciledAt: null,
        reconciledCustomers: null,
        reconciledPaymentIntents: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(autoTopupProtocolRollouts.protocol, AUTO_TOPUP_PROTOCOL),
          eq(autoTopupProtocolRollouts.state, "draining")
        )
      )
      .returning();
    if (!restarted) throw new AutoTopupRolloutError("drain restart CAS lost");
    return restarted;
  });
}

/** Complete, paginated provider proof. This function is read-only. */
export async function auditAutoTopupLegacyDrain(
  db: DbLike
): Promise<AutoTopupLegacyDrainReport> {
  const rollout = await getAutoTopupProtocolRollout(db);
  if (rollout.state !== "draining" || !rollout.drainStartedAt) {
    throw new AutoTopupRolloutError("provider reconciliation requires draining state");
  }
  assertRolloutKeyBinding(rollout, getAutoTopupAuthorityKeyMaterial());
  assertRolloutProviderBinding(
    rollout,
    await getAuthenticatedStripeAccountIdentity()
  );
  const now = await db.transaction((tx) => getDbNow(tx));
  const remainingMs =
    LEGACY_AUTO_TOPUP_QUIESCENCE_MS -
    (now.getTime() - rollout.drainStartedAt.getTime());
  if (remainingMs > 0) {
    throw new AutoTopupRolloutError(
      `the database-authored drain fence must remain closed for another ${remainingMs}ms before provider reconciliation`
    );
  }
  const customerRows = await db
    .select({
      workspaceId: subscriptions.workspaceId,
      customerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(isNotNull(subscriptions.stripeCustomerId));
  const workspaceByCustomer = new Map(
    customerRows.map((row) => [row.customerId!, row.workspaceId])
  );
  const ledgerRows = await db
    .select({
      workspaceId: creditLedger.workspaceId,
      refId: creditLedger.refId,
      attemptId: creditLedger.autoTopupAttemptId,
    })
    .from(creditLedger)
    .where(eq(creditLedger.refType, "auto_topup"));
  const ledgerWorkspaceByPi = new Map(
    ledgerRows
      .filter((row): row is typeof row & { refId: string } => row.refId !== null)
      .map((row) => [row.refId, row.workspaceId])
  );
  const ledgerByAttempt = new Map(
    ledgerRows
      .filter(
        (row): row is typeof row & { attemptId: string } =>
          row.attemptId !== null
      )
      .map((row) => [row.attemptId, row])
  );

  const blockers: AutoTopupLegacyDrainBlocker[] = [];
  const reconciledSucceeded: { paymentIntentId: string; workspaceId: string }[] = [];
  let paymentIntents = 0;
  // The provider population is authoritative. Deriving it from current local
  // customer rows misses precisely the restore/lost-mapping cases this drain
  // exists to find, so enumerate the whole Stripe account and filter in code.
  let startingAfter: string | undefined;
  const seenPageEnds = new Set<string>();
  for (;;) {
    const page = await getStripe().paymentIntents.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.has_more && page.data.length === 0) {
      throw new AutoTopupRolloutError(
        "Stripe returned an empty nonterminal account-wide PaymentIntent page"
      );
    }
    for (const pi of page.data) {
      if (pi.metadata?.respin_kind !== "auto_topup") {
        continue;
      }
      paymentIntents += 1;
      const customerId =
        typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
      const metadataWorkspace = pi.metadata?.workspace_id ?? null;
      const mappedWorkspace = customerId
        ? workspaceByCustomer.get(customerId) ?? null
        : null;
      const common = {
        paymentIntentId: pi.id,
        workspaceId: metadataWorkspace ?? mappedWorkspace,
        status: pi.status,
      } as const;
      if (!metadataWorkspace || !customerId || !mappedWorkspace) {
        blockers.push({ ...common, reason: "orphaned_customer_mapping" });
      } else if (metadataWorkspace !== mappedWorkspace) {
        blockers.push({ ...common, reason: "identity_mismatch" });
      } else if (pi.metadata.respin_attempt_id) {
        const authority = verifyAutoTopupAuthority(pi, mappedWorkspace);
        if (pi.status === "succeeded") {
          const ledger = ledgerByAttempt.get(authority.attemptId);
          if (!ledger) {
            blockers.push({ ...common, reason: "v1_succeeded_without_ledger" });
          } else if (
            ledger.workspaceId !== mappedWorkspace ||
            ledger.refId !== pi.id
          ) {
            blockers.push({ ...common, reason: "v1_settlement_mismatch" });
          } else {
            reconciledSucceeded.push({
              paymentIntentId: pi.id,
              workspaceId: mappedWorkspace,
            });
          }
        } else if (pi.status !== "canceled") {
          blockers.push({ ...common, reason: "v1_provider_not_terminal" });
        }
      } else if (
        pi.created * 1000 >
        rollout.drainStartedAt.getTime() + STRIPE_MAX_CALL_WINDOW_MS
      ) {
        blockers.push({ ...common, reason: "post_drain_legacy_intent" });
      } else if (pi.status === "succeeded") {
        const ledgerWorkspace = ledgerWorkspaceByPi.get(pi.id);
        if (!ledgerWorkspace) {
          blockers.push({ ...common, reason: "succeeded_without_ledger" });
        } else if (ledgerWorkspace !== mappedWorkspace) {
          blockers.push({ ...common, reason: "succeeded_in_other_workspace" });
        } else {
          reconciledSucceeded.push({
            paymentIntentId: pi.id,
            workspaceId: mappedWorkspace,
          });
        }
      } else if (pi.status !== "canceled") {
        // requires_payment_method is intentionally NOT terminal: Stripe lets
        // it be retried and it may later succeed. Cancel/reconcile it first.
        blockers.push({ ...common, reason: "provider_not_terminal" });
      }
    }
    if (!page.has_more) break;
    const pageEnd = page.data.at(-1)!.id;
    if (seenPageEnds.has(pageEnd)) {
      throw new AutoTopupRolloutError(
        `Stripe repeated account-wide PaymentIntent page cursor ${pageEnd}`
      );
    }
    seenPageEnds.add(pageEnd);
    startingAfter = pageEnd;
  }
  return {
    clear: blockers.length === 0,
    rolloutRevision: rollout.revision,
    customers: customerRows.length,
    paymentIntents,
    blockers,
    reconciledSucceeded,
  };
}

/**
 * Final operator transition. A fresh provider audit runs immediately before
 * the write; because draining has fenced all charge creation, its terminal
 * result remains valid while the activation transaction acquires table locks.
 */
export async function activateAutoTopupAttemptProtocol(
  db: DbLike
): Promise<AutoTopupProtocolRollout> {
  // Activation would otherwise re-arm existing opt-ins before a single charge
  // can carry recoverable authority. The v1 key is intentionally immutable and
  // backed up outside the database; metadata names this version explicitly.
  const key = getAutoTopupAuthorityKeyMaterial();
  const provider = await getAuthenticatedStripeAccountIdentity();
  const before = await getAutoTopupProtocolRollout(db);
  if (before.state === "active") {
    assertRolloutKeyBinding(before, key);
    assertRolloutProviderBinding(before, provider);
    return before;
  }
  const report = await auditAutoTopupLegacyDrain(db);
  if (!report.clear) {
    throw new AutoTopupRolloutError(
      `${report.blockers.length} auto-top-up PaymentIntent(s) are not terminal and reconciled`
    );
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`LOCK TABLE ${subscriptions}, ${creditLedger}, ${pausePeriods}, ${autoTopupProtocolRollouts} IN SHARE ROW EXCLUSIVE MODE`
    );
    const rollout = await getAutoTopupProtocolRollout(tx);
    if (rollout.state === "active") {
      assertRolloutKeyBinding(rollout, key);
      return rollout;
    }
    if (rollout.state !== "draining" || !rollout.drainStartedAt) {
      throw new AutoTopupRolloutError("activation requires draining state");
    }
    if (rollout.revision !== report.rolloutRevision) {
      throw new AutoTopupRolloutError(
        "the drain was restarted after provider reconciliation; wait for the new fence and audit again"
      );
    }
    assertRolloutKeyBinding(rollout, key);
    assertRolloutProviderBinding(rollout, provider);
    const now = await getDbNow(tx);
    for (const reconciled of report.reconciledSucceeded) {
      const [stillPresent] = await tx
        .select({ workspaceId: creditLedger.workspaceId })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.refType, "auto_topup"),
            eq(creditLedger.refId, reconciled.paymentIntentId)
          )
        )
        .limit(1);
      if (stillPresent?.workspaceId !== reconciled.workspaceId) {
        throw new AutoTopupRolloutError(
          `reconciled PaymentIntent ${reconciled.paymentIntentId} changed before activation`
        );
      }
    }
    await tx
      .update(subscriptions)
      .set({
        autoTopupEnabled: false,
        // A remembered opt-in is desire, not current charge authority. A mixed
        // old build may have disabled it by clearing legacy+cap, or an
        // irreversible event may have killed the subscription without knowing
        // the new rearm column. Revalidate the complete live/chargeable shape
        // under the rollout locks before arming v1.
        autoTopupV1Enabled: sql`${subscriptions.autoTopupRearmAfterUpgrade}
          AND ${subscriptions.autoTopupMonthlyCapCents} IS NOT NULL
          AND ${subscriptions.autoTopupMonthlyCapCents} > 0
          AND ${subscriptions.stripeSubscriptionId} IS NOT NULL
          AND ${subscriptions.status} IN ('active', 'trialing', 'past_due')
          AND ${subscriptions.pausedAt} IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${pausePeriods}
            WHERE ${pausePeriods.workspaceId} = ${subscriptions.workspaceId}
              AND ${pausePeriods.endedAt} IS NULL
          )`,
        autoTopupRearmAfterUpgrade: false,
        autoTopupProtocolVersion: 1,
        autoTopupAttemptCutoverAt: now,
      });
    const [active] = await tx
      .update(autoTopupProtocolRollouts)
      .set({
        state: "active",
        providerReconciledAt: now,
        reconciledCustomers: report.customers,
        reconciledPaymentIntents: report.paymentIntents,
        activatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(autoTopupProtocolRollouts.protocol, AUTO_TOPUP_PROTOCOL),
          eq(autoTopupProtocolRollouts.state, "draining"),
          eq(autoTopupProtocolRollouts.revision, report.rolloutRevision)
        )
      )
      .returning();
    if (!active) throw new AutoTopupRolloutError("the draining-to-active CAS lost");
    return active;
  });
}
