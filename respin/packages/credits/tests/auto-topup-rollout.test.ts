import { describe, expect, it, vi } from "vitest";

const paymentIntentList = vi.fn();
const paymentIntentRetrieve = vi.fn();
const paymentIntentCancel = vi.fn();
const eventList = vi.fn();
let providerIdentity = { accountId: "acct_rollouttest", livemode: false };
vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    paymentIntents: {
      list: paymentIntentList,
      retrieve: paymentIntentRetrieve,
      cancel: paymentIntentCancel,
    },
    events: { list: eventList },
  }),
  getAutoTopupAuthorityKeyMaterial: () => ({
    id: "v1",
    key: "test-auto-topup-authority-key-32chars",
    fingerprint:
      "sha256:fe3b3de1339e7ec571414d65c6f3091e4c11ebbae40b7b09031308abf4a734ab",
  }),
  getAutoTopupAuthorityKey: () => "test-auto-topup-authority-key-32chars",
  getAuthenticatedStripeAccountIdentity: async () => providerIdentity,
}));

import { eq } from "drizzle-orm";
import {
  autoTopupProtocolRollouts,
  createTestDb,
  creditLedger,
  schema,
  seedAuthUser,
  seedDb,
  stripeEvents,
  subscriptions,
} from "@respin/db";
import {
  activateAutoTopupAttemptProtocol,
  auditAutoTopupLegacyDrain,
  beginAutoTopupProtocolDrain,
  getAutoTopupProtocolState,
  LEGACY_AUTO_TOPUP_QUIESCENCE_MS,
  restartAutoTopupProtocolDrain,
} from "../src/stripe/auto-topup-rollout";
import { STRIPE_MAX_CALL_WINDOW_MS } from "../src/stripe/adapter";
import { reconcileMissingLegacyAutoTopups } from "../src/stripe/auto-topup-rollout-reconcile";
import { reconcileBoundAutoTopupAttempts } from "../src/stripe/auto-topup-v1-reconcile";
import { autoTopupAuthorityMetadata } from "../src/stripe/auto-topup-authority";
import { AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS } from "../src/stripe/auto-topup";
import { handleStripeEvent, replayHeldStripeEvents } from "../src/stripe/webhooks";

const KEY_FINGERPRINT =
  "sha256:fe3b3de1339e7ec571414d65c6f3091e4c11ebbae40b7b09031308abf4a734ab";

async function insertWorkspace(db: Awaited<ReturnType<typeof createTestDb>>, name: string) {
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ name })
    .returning({ id: schema.workspaces.id });
  return workspace.id;
}

async function ageDrain(db: Awaited<ReturnType<typeof createTestDb>>) {
  const old = new Date(Date.now() - LEGACY_AUTO_TOPUP_QUIESCENCE_MS - 1_000);
  await db
    .update(autoTopupProtocolRollouts)
    .set({ fleetQuiescedAt: old, drainStartedAt: old })
    .where(eq(autoTopupProtocolRollouts.protocol, "v1"));
}

async function activateEmptyProtocol(
  db: Awaited<ReturnType<typeof createTestDb>>
) {
  providerIdentity = { accountId: "acct_rollouttest", livemode: false };
  await beginAutoTopupProtocolDrain(db, new Date());
  await ageDrain(db);
  paymentIntentList.mockReset();
  paymentIntentList.mockResolvedValue({ data: [], has_more: false });
  await activateAutoTopupAttemptProtocol(db);
}

async function insertBoundV1Attempt(
  db: Awaited<ReturnType<typeof createTestDb>>,
  suffix: string
) {
  const workspaceId = await insertWorkspace(db, `v1-${suffix}`);
  const customerId = `cus_v1_${suffix}`;
  const attemptId = crypto.randomUUID();
  const now = new Date();
  await db.insert(subscriptions).values({
    workspaceId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: `sub_v1_${suffix}`,
    status: "active",
  });
  const authority = {
    id: attemptId,
    periodMonthUtc: "2026-09",
    ordinal: 1,
    idempotencyKey: `autotopup:v1:${workspaceId}:2026-09:1:${attemptId}`,
    amountCents: 1000,
    currency: "usd",
    priceId: "price_pack",
    credits: 500,
    validityMonths: 12,
    configVersion: 1,
    customerId,
    paymentIntentId: `pi_v1_${suffix}`,
    paymentIntentStatus: "processing",
    claimId: crypto.randomUUID(),
    claimedAt: now,
    dispatchedAt: now,
    reservedAt: now,
  };
  await db
    .update(subscriptions)
    .set({
      autoTopupAttemptId: authority.id,
      autoTopupAttemptPeriodMonthUtc: authority.periodMonthUtc,
      autoTopupAttemptOrdinal: authority.ordinal,
      autoTopupAttemptIdempotencyKey: authority.idempotencyKey,
      autoTopupAttemptAmountCents: authority.amountCents,
      autoTopupAttemptCurrency: authority.currency,
      autoTopupAttemptPriceId: authority.priceId,
      autoTopupAttemptCredits: authority.credits,
      autoTopupAttemptValidityMonths: authority.validityMonths,
      autoTopupAttemptConfigVersion: authority.configVersion,
      autoTopupAttemptCustomerId: authority.customerId,
      autoTopupAttemptPaymentIntentId: authority.paymentIntentId,
      autoTopupAttemptPaymentIntentStatus: authority.paymentIntentStatus,
      autoTopupAttemptClaimId: authority.claimId,
      autoTopupAttemptClaimedAt: authority.claimedAt,
      autoTopupAttemptDispatchedAt: authority.dispatchedAt,
      autoTopupAttemptReservedAt: authority.reservedAt,
    })
    .where(eq(subscriptions.workspaceId, workspaceId));
  return { workspaceId, authority };
}

describe("auto-top-up protocol rollout", () => {
  it("enforces the database-authored wait and revalidates remembered opt-ins at activation", async () => {
    const db = await createTestDb();
    const liveId = await insertWorkspace(db, "rollout-live");
    const mixedDisabledId = await insertWorkspace(db, "rollout-mixed-disabled");
    const deadId = await insertWorkspace(db, "rollout-dead");
    for (const workspaceId of [liveId, mixedDisabledId, deadId]) {
      await db.insert(subscriptions).values({
        workspaceId,
        stripeCustomerId: `cus_${workspaceId}`,
        stripeSubscriptionId: `sub_${workspaceId}`,
        status: "active",
        autoTopupEnabled: true,
        autoTopupMonthlyCapCents: 5000,
      });
    }

    const draining = await beginAutoTopupProtocolDrain(db, new Date());
    expect(draining.state).toBe("draining");
    await expect(auditAutoTopupLegacyDrain(db)).rejects.toThrow(
      /database-authored drain fence/
    );

    // Changes made by a mixed old build after drain must not be resurrected.
    await db
      .update(subscriptions)
      .set({ autoTopupEnabled: false, autoTopupMonthlyCapCents: null })
      .where(eq(subscriptions.workspaceId, mixedDisabledId));
    await db
      .update(subscriptions)
      .set({ autoTopupEnabled: false, status: "canceled" })
      .where(eq(subscriptions.workspaceId, deadId));
    await ageDrain(db);
    paymentIntentList.mockReset();
    paymentIntentList.mockResolvedValue({ data: [], has_more: false });

    const active = await activateAutoTopupAttemptProtocol(db);
    expect(active.state).toBe("active");
    const rows = await db.select().from(subscriptions);
    const byWorkspace = new Map(rows.map((row) => [row.workspaceId, row]));
    expect(byWorkspace.get(liveId)?.autoTopupV1Enabled).toBe(true);
    expect(byWorkspace.get(mixedDisabledId)?.autoTopupV1Enabled).toBe(false);
    expect(byWorkspace.get(deadId)?.autoTopupV1Enabled).toBe(false);
    expect(rows.every((row) => !row.autoTopupEnabled)).toBe(true);
    expect(rows.every((row) => !row.autoTopupRearmAfterUpgrade)).toBe(true);
    expect(rows.every((row) => row.autoTopupProtocolVersion === 1)).toBe(true);

    // Restart/idempotency: the completed transition is stable.
    expect((await activateAutoTopupAttemptProtocol(db)).state).toBe("active");
  });

  it("refuses a stale clear audit when the drain is restarted before activation locks", async () => {
    const db = await createTestDb();
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    paymentIntentList.mockReset();
    paymentIntentList.mockImplementationOnce(async () => {
      await restartAutoTopupProtocolDrain(
        db,
        new Date(Date.now() - 1_000)
      );
      return { data: [], has_more: false };
    });

    await expect(activateAutoTopupAttemptProtocol(db)).rejects.toThrow(
      /drain was restarted after provider reconciliation/
    );
    const [rollout] = await db.select().from(autoTopupProtocolRollouts);
    expect(rollout.state).toBe("draining");
    expect(rollout.revision).toBe(2);
    await expect(auditAutoTopupLegacyDrain(db)).rejects.toThrow(
      /database-authored drain fence/
    );
  });

  it("paginates the provider audit and refuses identity, missing-ledger, and nonterminal states", async () => {
    const db = await createTestDb();
    const workspaceId = await insertWorkspace(db, "rollout-audit");
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_rollout_audit",
      stripeSubscriptionId: "sub_rollout_audit",
      status: "active",
    });
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    paymentIntentList.mockReset();
    paymentIntentList
      .mockResolvedValueOnce({
        data: [{
          id: "pi_missing",
          customer: "cus_rollout_audit",
          created: 1,
          status: "succeeded",
          metadata: { respin_kind: "auto_topup", workspace_id: workspaceId },
        }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{
          id: "pi_open",
          customer: "cus_rollout_audit",
          created: 1,
          status: "requires_payment_method",
          metadata: { respin_kind: "auto_topup", workspace_id: workspaceId },
        }],
        has_more: false,
      });

    const report = await auditAutoTopupLegacyDrain(db);
    expect(report.clear).toBe(false);
    expect(report.blockers.map((blocker) => blocker.reason)).toEqual([
      "succeeded_without_ledger",
      "provider_not_terminal",
    ]);
    expect(paymentIntentList.mock.calls[1]?.[0]).toMatchObject({
      starting_after: "pi_missing",
    });
    await expect(activateAutoTopupAttemptProtocol(db)).rejects.toThrow();
  });

  it("accepts bounded pre-fence in-flight work and makes a late-fleet violation restartable", async () => {
    const db = await createTestDb();
    const workspaceId = await insertWorkspace(db, "rollout-window");
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_rollout_window",
      stripeSubscriptionId: "sub_rollout_window",
      status: "active",
    });
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    const [rollout] = await db.select().from(autoTopupProtocolRollouts);
    const drainMs = rollout.drainStartedAt!.getTime();
    paymentIntentList.mockReset();
    paymentIntentList.mockResolvedValue({
      data: [
        {
          id: "pi_bounded_inflight",
          customer: "cus_rollout_window",
          created: Math.floor((drainMs + STRIPE_MAX_CALL_WINDOW_MS - 2_000) / 1000),
          status: "canceled",
          metadata: { respin_kind: "auto_topup", workspace_id: workspaceId },
        },
        {
          id: "pi_late_fleet",
          customer: "cus_rollout_window",
          created: Math.ceil((drainMs + STRIPE_MAX_CALL_WINDOW_MS + 2_000) / 1000),
          status: "canceled",
          metadata: { respin_kind: "auto_topup", workspace_id: workspaceId },
        },
      ],
      has_more: false,
    });
    const report = await auditAutoTopupLegacyDrain(db);
    expect(report.blockers).toEqual([
      expect.objectContaining({
        paymentIntentId: "pi_late_fleet",
        reason: "post_drain_legacy_intent",
      }),
    ]);

    const restarted = await restartAutoTopupProtocolDrain(db, new Date());
    expect(restarted.state).toBe("draining");
    expect(restarted.drainStartedAt!.getTime()).toBeGreaterThan(drainMs);
    await expect(auditAutoTopupLegacyDrain(db)).rejects.toThrow(
      /database-authored drain fence/
    );
  });

  it("blocks an account-wide legacy intent whose local customer mapping was lost", async () => {
    const db = await createTestDb();
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    paymentIntentList.mockReset();
    paymentIntentList.mockResolvedValue({
      data: [{
        id: "pi_orphaned_mapping",
        customer: "cus_missing_after_restore",
        created: 1,
        status: "succeeded",
        metadata: {
          respin_kind: "auto_topup",
          workspace_id: "019b0d7a-86df-7000-8000-000000000099",
        },
      }],
      has_more: false,
    });
    const report = await auditAutoTopupLegacyDrain(db);
    expect(report.clear).toBe(false);
    expect(report.blockers).toEqual([
      expect.objectContaining({
        paymentIntentId: "pi_orphaned_mapping",
        reason: "orphaned_customer_mapping",
      }),
    ]);
    expect(paymentIntentList).toHaveBeenCalledWith({ limit: 100 });
  });

  it("recovers a lost legacy success through the normal idempotent webhook transaction", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "rollout-recovery-user");
    await seedDb(db);
    const [workspace] = await db.select().from(schema.workspaces).limit(1);
    await db.insert(subscriptions).values({
      workspaceId: workspace.id,
      stripeCustomerId: "cus_rollout_recovery",
      stripeSubscriptionId: "sub_rollout_recovery",
      status: "active",
      autoTopupEnabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    const pi = {
      id: "pi_legacy_lost_webhook",
      object: "payment_intent",
      amount: 1000,
      currency: "usd",
      customer: "cus_rollout_recovery",
      created: 1,
      livemode: false,
      status: "succeeded",
      metadata: { respin_kind: "auto_topup", workspace_id: workspace.id },
    };
    paymentIntentList.mockReset();
    paymentIntentRetrieve.mockReset();
    eventList.mockReset();
    paymentIntentList.mockResolvedValue({ data: [pi], has_more: false });
    paymentIntentRetrieve.mockResolvedValue(pi);
    const event = {
      id: "evt_real_legacy_success",
      object: "event",
      api_version: "2025-12-15.clover",
      created: 2,
      data: { object: pi },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    };
    eventList.mockResolvedValue({ data: [event], has_more: false });

    const recovered = await reconcileMissingLegacyAutoTopups(db);
    expect(recovered.replayedPaymentIntents).toEqual([pi.id]);
    expect(recovered.report.clear).toBe(true);
    const rows = await db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.refId, pi.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stripeEventId).toBe(event.id);

    // A delayed delivery of the same real event is receipt-idempotent.
    await expect(handleStripeEvent(db, event as never)).rejects.toMatchObject({
      name: "DuplicateStripeEvent",
    });

    const again = await reconcileMissingLegacyAutoTopups(db);
    expect(again.replayedPaymentIntents).toEqual([]);
    expect(
      await db.select().from(creditLedger).where(eq(creditLedger.refId, pi.id))
    ).toHaveLength(1);
  });

  it("records but never settles a real v1 success for a tombstoned workspace", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "v1-recovery-user");
    await seedDb(db);
    await activateEmptyProtocol(db);
    const { workspaceId, authority } = await insertBoundV1Attempt(db, "success");
    await db
      .update(schema.workspaces)
      .set({ lifecycleState: "tombstoned" })
      .where(eq(schema.workspaces.id, workspaceId));
    // A backup restored from after atomic reservation but before the provider
    // response has no local PI binding even though Stripe may have committed
    // the charge. The operator scan must include this row.
    await db
      .update(subscriptions)
      .set({
        autoTopupAttemptPaymentIntentId: null,
        autoTopupAttemptPaymentIntentStatus: null,
      })
      .where(eq(subscriptions.workspaceId, workspaceId));
    const pi = {
      id: authority.paymentIntentId,
      object: "payment_intent",
      amount: authority.amountCents,
      currency: authority.currency,
      customer: authority.customerId,
      created: 10,
      livemode: false,
      status: "succeeded",
      metadata: autoTopupAuthorityMetadata(workspaceId, authority),
    };
    const event = {
      id: "evt_real_v1_success",
      object: "event",
      api_version: "2025-12-15.clover",
      created: 11,
      data: { object: pi },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    };
    paymentIntentRetrieve.mockReset();
    paymentIntentList.mockReset();
    eventList.mockReset();
    paymentIntentRetrieve.mockResolvedValue(pi);
    paymentIntentList.mockResolvedValue({ data: [pi], has_more: false });
    eventList.mockResolvedValue({ data: [event], has_more: false });

    await expect(reconcileBoundAutoTopupAttempts(db)).rejects.toThrow(
      /did not settle the exact ledger row/
    );
    expect(
      await db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, authority.id))
    ).toHaveLength(0);
    expect((await db.select().from(subscriptions))[0]?.autoTopupAttemptId).toBe(
      authority.id
    );
    await expect(reconcileBoundAutoTopupAttempts(db)).rejects.toThrow(
      /finalized receipt without settlement/
    );
  });

  it("R-166 (billing Low): a v1 auto-top-up success on a TOMBSTONED workspace is HELD, then replays exactly once when the workspace is active again", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "v1-held-user");
    await seedDb(db);
    await activateEmptyProtocol(db);
    const { workspaceId, authority } = await insertBoundV1Attempt(db, "held_replay");
    const setLifecycle = (lifecycleState: "active" | "tombstoned") =>
      db.update(schema.workspaces).set({ lifecycleState }).where(eq(schema.workspaces.id, workspaceId));
    await setLifecycle("tombstoned");
    const pi = {
      id: authority.paymentIntentId,
      object: "payment_intent",
      amount: authority.amountCents,
      currency: authority.currency,
      customer: authority.customerId,
      created: 10,
      livemode: false,
      status: "succeeded",
      metadata: autoTopupAuthorityMetadata(workspaceId, authority),
    };
    const event = {
      id: "evt_v1_held_replay",
      object: "event",
      api_version: "2025-12-15.clover",
      created: 11,
      data: { object: pi },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    };
    const minted = async () =>
      db.select().from(creditLedger).where(eq(creditLedger.autoTopupAttemptId, authority.id));
    expect(await handleStripeEvent(db, event as never)).toBe("held_tombstoned");
    expect(await minted()).toHaveLength(0);

    // The deletion is cancelled: the workspace is active again.
    await setLifecycle("active");
    expect(await replayHeldStripeEvents(db, workspaceId)).toEqual({
      replayed: 1,
      alreadySettled: 0,
      failed: 0,
      stillHeld: 0,
    });
    expect(await minted()).toHaveLength(1);
    const [receipt] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
    expect(receipt?.outcome).toBe("processed");
    // Exactly once: a second replay finds nothing held, and a redelivery is a duplicate.
    expect(await replayHeldStripeEvents(db, workspaceId)).toEqual({
      replayed: 0,
      alreadySettled: 0,
      failed: 0,
      stillHeld: 0,
    });
    await expect(handleStripeEvent(db, event as never)).rejects.toMatchObject({ name: "DuplicateStripeEvent" });
    expect(await minted()).toHaveLength(1);
  });

  it("refuses provider-only success A while a different complete attempt B is pending", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "v1-conflicting-pending-user");
    await seedDb(db);
    await activateEmptyProtocol(db);
    const { workspaceId, authority: pendingB } = await insertBoundV1Attempt(
      db,
      "conflicting_pending"
    );
    const providerA = {
      ...pendingB,
      id: crypto.randomUUID(),
      idempotencyKey: `autotopup:v1:${workspaceId}:2026-09:1:${crypto.randomUUID()}`,
      paymentIntentId: "pi_v1_provider_only_A",
      paymentIntentStatus: "succeeded",
    };
    const paymentIntent = (authority: typeof pendingB, status: string) => ({
      id: authority.paymentIntentId,
      object: "payment_intent",
      amount: authority.amountCents,
      currency: authority.currency,
      customer: authority.customerId,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      status,
      metadata: autoTopupAuthorityMetadata(workspaceId, authority),
    });
    paymentIntentRetrieve.mockReset();
    paymentIntentList.mockReset();
    eventList.mockReset();
    paymentIntentRetrieve.mockResolvedValue(paymentIntent(pendingB, "processing"));
    paymentIntentList.mockResolvedValue({
      data: [paymentIntent(providerA, "succeeded")],
      has_more: false,
    });
    eventList.mockResolvedValue({ data: [], has_more: false });

    await expect(reconcileBoundAutoTopupAttempts(db)).rejects.toThrow(
      new RegExp(`provider-only attempt ${providerA.id} conflicts with concurrent pending attempt ${pendingB.id}`)
    );
    expect(await db.select().from(creditLedger)).toHaveLength(0);
    const [after] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId));
    expect(after.autoTopupAttemptId).toBe(pendingB.id);
  });

  it("fails closed when Stripe repeats a succeeded-event page cursor", async () => {
    const db = await createTestDb();
    await activateEmptyProtocol(db);
    const { workspaceId, authority } = await insertBoundV1Attempt(
      db,
      "repeated_event_cursor"
    );
    const pi = {
      id: authority.paymentIntentId,
      object: "payment_intent",
      amount: authority.amountCents,
      currency: authority.currency,
      customer: authority.customerId,
      created: 10,
      livemode: false,
      status: "succeeded",
      metadata: autoTopupAuthorityMetadata(workspaceId, authority),
    };
    const event = {
      id: "evt_repeated_v1_success",
      object: "event",
      api_version: "2025-12-15.clover",
      created: 11,
      data: { object: pi },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    };
    paymentIntentRetrieve.mockReset();
    eventList.mockReset();
    paymentIntentRetrieve.mockResolvedValue(pi);
    eventList.mockResolvedValue({ data: [event], has_more: true });

    await expect(reconcileBoundAutoTopupAttempts(db)).rejects.toThrow(
      /repeated event page cursor evt_repeated_v1_success/
    );
    expect(eventList).toHaveBeenCalledTimes(2);
  });

  it("fails closed when Stripe repeats an account-wide PaymentIntent page cursor", async () => {
    const db = await createTestDb();
    await activateEmptyProtocol(db);
    const repeated = {
      id: "pi_repeated_v1_cursor",
      object: "payment_intent",
      amount: 1000,
      currency: "usd",
      customer: "cus_repeated_v1_cursor",
      created: 10,
      livemode: false,
      status: "processing",
      metadata: {
        respin_kind: "auto_topup",
        respin_attempt_id: crypto.randomUUID(),
      },
    };
    paymentIntentList.mockReset();
    paymentIntentList.mockResolvedValue({ data: [repeated], has_more: true });

    await expect(reconcileBoundAutoTopupAttempts(db)).rejects.toThrow(
      /repeated account-wide PaymentIntent page cursor pi_repeated_v1_cursor/
    );
    expect(paymentIntentList).toHaveBeenCalledTimes(2);
  });

  it("keeps a restored provider-only v1 attempt fenced through terminal settlement before activation", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "v1-provider-only-user");
    await seedDb(db);
    const { workspaceId, authority } = await insertBoundV1Attempt(
      db,
      "provider_only"
    );
    // Simulate restoring a snapshot from before the durable reservation while
    // retaining the Stripe customer mapping needed to authenticate recovery.
    await db
      .delete(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId));
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: authority.customerId,
      stripeSubscriptionId: "sub_v1_provider_only",
      status: "active",
    });
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);

    let providerStatus = "processing";
    const providerPi = () => ({
      id: authority.paymentIntentId,
      object: "payment_intent",
      amount: authority.amountCents,
      currency: authority.currency,
      customer: authority.customerId,
      // Deliberately newer than the aged drain fence: the legacy late-call
      // rule must never misclassify signed v1 authority after a restore.
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      status: providerStatus,
      metadata: autoTopupAuthorityMetadata(workspaceId, authority),
    });
    paymentIntentList.mockReset();
    eventList.mockReset();
    paymentIntentList.mockImplementation(async () => ({
      data: [providerPi()],
      has_more: false,
    }));

    const blocked = await auditAutoTopupLegacyDrain(db);
    expect(blocked.blockers).toEqual([
      expect.objectContaining({
        paymentIntentId: authority.paymentIntentId,
        reason: "v1_provider_not_terminal",
      }),
    ]);
    await expect(activateAutoTopupAttemptProtocol(db)).rejects.toThrow(
      /not terminal and reconciled/
    );
    expect(await reconcileBoundAutoTopupAttempts(db)).toMatchObject({
      clear: false,
      rolloutRevision: 1,
      attempts: [{
        attemptId: authority.id,
        outcome: "awaiting_provider_terminal",
      }],
    });

    providerStatus = "succeeded";
    eventList.mockImplementation(async () => ({
      data: [{
        id: "evt_real_v1_provider_only_success",
        object: "event",
        api_version: "2025-12-15.clover",
        created: Math.floor(Date.now() / 1000),
        data: { object: providerPi() },
        livemode: false,
        pending_webhooks: 0,
        request: null,
        type: "payment_intent.succeeded",
      }],
      has_more: false,
    }));
    expect(await reconcileBoundAutoTopupAttempts(db)).toMatchObject({
      clear: true,
      rolloutRevision: 1,
      attempts: [{ attemptId: authority.id, outcome: "settled" }],
    });
    expect((await auditAutoTopupLegacyDrain(db)).clear).toBe(true);
    expect((await activateAutoTopupAttemptProtocol(db)).state).toBe("active");
    expect(
      await db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, authority.id))
    ).toHaveLength(1);
  });

  it.each([
    ["expanded rollout", "expanded"],
    ["authority-key drift", "key_drift"],
    ["Stripe-account drift", "account_drift"],
    ["event livemode mismatch", "livemode_mismatch"],
  ] as const)(
    "v1 success refuses %s with receipt rollback, zero mint, and pending authority retained",
    async (_label, mutation) => {
      const db = await createTestDb();
      providerIdentity = { accountId: "acct_rollouttest", livemode: false };
      if (mutation !== "expanded") await activateEmptyProtocol(db);
      const { workspaceId, authority } = await insertBoundV1Attempt(
        db,
        `webhook_${mutation}`
      );
      if (mutation === "key_drift") {
        await db
          .update(autoTopupProtocolRollouts)
          .set({ authorityKeyFingerprint: `sha256:${"0".repeat(64)}` })
          .where(eq(autoTopupProtocolRollouts.protocol, "v1"));
      }
      if (mutation === "account_drift") {
        providerIdentity = { accountId: "acct_other", livemode: false };
      }
      const livemode = mutation === "livemode_mismatch";
      const pi = {
        id: authority.paymentIntentId,
        object: "payment_intent",
        amount: authority.amountCents,
        currency: authority.currency,
        customer: authority.customerId,
        created: 10,
        livemode,
        status: "succeeded",
        metadata: autoTopupAuthorityMetadata(workspaceId, authority),
      };
      const event = {
        id: `evt_webhook_${mutation}`,
        object: "event",
        api_version: "2025-12-15.clover",
        created: 11,
        data: { object: pi },
        livemode,
        pending_webhooks: 0,
        request: null,
        type: "payment_intent.succeeded",
      };

      try {
        await expect(handleStripeEvent(db, event as never)).rejects.toThrow();
        expect(await db.select().from(creditLedger)).toHaveLength(0);
        expect(
          (await db.select().from(subscriptions))[0]?.autoTopupAttemptId
        ).toBe(authority.id);
        const receipts = await db
          .select()
          .from(stripeEvents)
          .where(eq(stripeEvents.id, event.id));
        expect(receipts).toHaveLength(0);
      } finally {
        providerIdentity = { accountId: "acct_rollouttest", livemode: false };
      }
    }
  );

  it("keeps a finalized unknown-customer legacy receipt refused after mapping repair", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "legacy-refused-recovery-user");
    await seedDb(db);
    const workspaceId = await insertWorkspace(db, "legacy-refused-recovery");
    const pi = {
      id: "pi_legacy_refused_unknown_customer",
      object: "payment_intent",
      amount: 1000,
      currency: "usd",
      customer: "cus_legacy_refused_recovery",
      created: 1,
      livemode: false,
      status: "succeeded",
      metadata: { respin_kind: "auto_topup", workspace_id: workspaceId },
    };
    const event = {
      id: "evt_legacy_refused_unknown_customer",
      object: "event",
      api_version: "2025-12-15.clover",
      created: 2,
      data: { object: pi },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    };
    expect(await handleStripeEvent(db, event as never)).toBe(
      "refused_unknown_customer"
    );
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: pi.customer,
      stripeSubscriptionId: "sub_legacy_refused_recovery",
      status: "active",
    });
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    paymentIntentList.mockReset();
    paymentIntentRetrieve.mockReset();
    eventList.mockReset();
    paymentIntentList.mockResolvedValue({ data: [pi], has_more: false });
    paymentIntentRetrieve.mockResolvedValue(pi);
    eventList.mockResolvedValue({ data: [event], has_more: false });

    await expect(reconcileMissingLegacyAutoTopups(db)).rejects.toThrow(
      /finalized receipt without settlement/
    );
    expect(
      await db.select().from(creditLedger).where(eq(creditLedger.refId, pi.id))
    ).toHaveLength(0);
    expect((await auditAutoTopupLegacyDrain(db)).clear).toBe(false);
  });

  it("keeps a finalized unknown-customer signed v1 receipt refused after mapping repair", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "v1-refused-recovery-user");
    await seedDb(db);
    const { workspaceId, authority } = await insertBoundV1Attempt(
      db,
      "refused_recovery"
    );
    await db
      .delete(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId));
    const pi = {
      id: authority.paymentIntentId,
      object: "payment_intent",
      amount: authority.amountCents,
      currency: authority.currency,
      customer: authority.customerId,
      created: 10,
      livemode: false,
      status: "succeeded",
      metadata: autoTopupAuthorityMetadata(workspaceId, authority),
    };
    const event = {
      id: "evt_v1_refused_unknown_customer",
      object: "event",
      api_version: "2025-12-15.clover",
      created: 11,
      data: { object: pi },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    };
    expect(await handleStripeEvent(db, event as never)).toBe(
      "refused_unknown_customer"
    );
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: authority.customerId,
      stripeSubscriptionId: "sub_v1_refused_recovery",
      status: "active",
    });
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    paymentIntentList.mockReset();
    eventList.mockReset();
    paymentIntentList.mockResolvedValue({ data: [pi], has_more: false });
    eventList.mockResolvedValue({ data: [event], has_more: false });

    await expect(reconcileBoundAutoTopupAttempts(db)).rejects.toThrow(
      /finalized receipt without settlement/
    );
    expect(
      await db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, authority.id))
    ).toHaveLength(0);
    expect((await auditAutoTopupLegacyDrain(db)).clear).toBe(false);
  });

  it("cancels and retires a bound failure, while processing remains explicitly unresolved", async () => {
    const failedDb = await createTestDb();
    await activateEmptyProtocol(failedDb);
    const failed = await insertBoundV1Attempt(failedDb, "failed");
    const failedPi = {
      id: failed.authority.paymentIntentId,
      object: "payment_intent",
      amount: failed.authority.amountCents,
      currency: failed.authority.currency,
      customer: failed.authority.customerId,
      created: 20,
      livemode: false,
      status: "requires_payment_method",
      metadata: autoTopupAuthorityMetadata(failed.workspaceId, failed.authority),
    };
    paymentIntentRetrieve.mockReset();
    paymentIntentCancel.mockReset();
    paymentIntentRetrieve.mockResolvedValue(failedPi);
    paymentIntentCancel.mockResolvedValue({ ...failedPi, status: "canceled" });
    expect(await reconcileBoundAutoTopupAttempts(failedDb)).toMatchObject({
      clear: true,
      attempts: [{ outcome: "retired", providerStatus: "canceled" }],
    });
    expect((await failedDb.select().from(subscriptions))[0]?.autoTopupAttemptId).toBeNull();

    const processingDb = await createTestDb();
    await activateEmptyProtocol(processingDb);
    const processing = await insertBoundV1Attempt(processingDb, "processing");
    const processingPi = {
      id: processing.authority.paymentIntentId,
      object: "payment_intent",
      amount: processing.authority.amountCents,
      currency: processing.authority.currency,
      customer: processing.authority.customerId,
      created: 30,
      livemode: false,
      status: "processing",
      metadata: autoTopupAuthorityMetadata(
        processing.workspaceId,
        processing.authority
      ),
    };
    paymentIntentRetrieve.mockReset();
    paymentIntentRetrieve.mockResolvedValue(processingPi);
    expect(await reconcileBoundAutoTopupAttempts(processingDb)).toMatchObject({
      clear: false,
      attempts: [{
        outcome: "awaiting_provider_terminal",
        providerStatus: "processing",
      }],
    });
    expect((await processingDb.select().from(subscriptions))[0]?.autoTopupAttemptId).toBe(
      processing.authority.id
    );
  });

  it("keeps an absent provider attempt inside the safety window, then retires the exact unchanged claim", async () => {
    const db = await createTestDb();
    await activateEmptyProtocol(db);
    const { workspaceId, authority } = await insertBoundV1Attempt(db, "absent");
    await db
      .update(subscriptions)
      .set({
        autoTopupAttemptPaymentIntentId: null,
        autoTopupAttemptPaymentIntentStatus: null,
      })
      .where(eq(subscriptions.workspaceId, workspaceId));
    paymentIntentList.mockReset();
    paymentIntentList.mockResolvedValue({ data: [], has_more: false });

    expect(await reconcileBoundAutoTopupAttempts(db)).toMatchObject({
      clear: false,
      attempts: [{
        attemptId: authority.id,
        paymentIntentId: null,
        providerStatus: "not_found",
        outcome: "awaiting_provider_visibility",
      }],
    });
    const old = new Date(
      Date.now() - AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS - 60_000
    );
    await db
      .update(subscriptions)
      .set({
        autoTopupAttemptReservedAt: old,
        autoTopupAttemptDispatchedAt: old,
        autoTopupAttemptClaimedAt: old,
      })
      .where(eq(subscriptions.workspaceId, workspaceId));
    expect(await reconcileBoundAutoTopupAttempts(db)).toMatchObject({
      clear: true,
      attempts: [{
        attemptId: authority.id,
        providerStatus: "not_found",
        outcome: "retired",
      }],
    });
    expect((await db.select().from(subscriptions))[0]?.autoTopupAttemptId).toBeNull();
  });

  it("re-proves after the operator claim and settles a PI that appears after the first empty proof", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "v1-reproof-user");
    await seedDb(db);
    await activateEmptyProtocol(db);
    const { workspaceId, authority } = await insertBoundV1Attempt(db, "reproof");
    const old = new Date(
      Date.now() - AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS - 60_000
    );
    await db
      .update(subscriptions)
      .set({
        autoTopupAttemptPaymentIntentId: null,
        autoTopupAttemptPaymentIntentStatus: null,
        autoTopupAttemptReservedAt: old,
        autoTopupAttemptDispatchedAt: old,
        autoTopupAttemptClaimedAt: old,
      })
      .where(eq(subscriptions.workspaceId, workspaceId));
    const pi = {
      id: authority.paymentIntentId,
      object: "payment_intent",
      amount: authority.amountCents,
      currency: authority.currency,
      customer: authority.customerId,
      created: 40,
      livemode: false,
      status: "succeeded",
      metadata: autoTopupAuthorityMetadata(workspaceId, authority),
    };
    const event = {
      id: "evt_real_v1_reproof_success",
      object: "event",
      api_version: "2025-12-15.clover",
      created: 41,
      data: { object: pi },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    };
    paymentIntentList.mockReset();
    eventList.mockReset();
    paymentIntentList
      .mockResolvedValueOnce({ data: [], has_more: false })
      .mockResolvedValueOnce({ data: [pi], has_more: false })
      .mockResolvedValue({ data: [pi], has_more: false });
    eventList.mockResolvedValue({ data: [event], has_more: false });

    expect(await reconcileBoundAutoTopupAttempts(db)).toMatchObject({
      clear: true,
      attempts: [{ outcome: "settled", providerStatus: "succeeded" }],
    });
    expect(paymentIntentList).toHaveBeenCalledTimes(3);
    expect(
      await db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, authority.id))
    ).toHaveLength(1);
  });

  it("refuses a changed authority-key binding after drain", async () => {
    const db = await createTestDb();
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    await db
      .update(autoTopupProtocolRollouts)
      .set({ authorityKeyFingerprint: `sha256:${"0".repeat(64)}` })
      .where(eq(autoTopupProtocolRollouts.protocol, "v1"));
    expect(KEY_FINGERPRINT).not.toBe(`sha256:${"0".repeat(64)}`);
    await expect(auditAutoTopupLegacyDrain(db)).rejects.toThrow(
      /immutable rollout binding/
    );
  });

  it("degrades an active product-visible state when its immutable binding drifts", async () => {
    const db = await createTestDb();
    await activateEmptyProtocol(db);
    await db
      .update(autoTopupProtocolRollouts)
      .set({ authorityKeyFingerprint: `sha256:${"0".repeat(64)}` })
      .where(eq(autoTopupProtocolRollouts.protocol, "v1"));

    await expect(getAutoTopupProtocolState(db)).rejects.toThrow(
      /immutable rollout binding/
    );
  });

  it("refuses a changed Stripe account or livemode without activating", async () => {
    const db = await createTestDb();
    providerIdentity = { accountId: "acct_rollouttest", livemode: false };
    await beginAutoTopupProtocolDrain(db, new Date());
    await ageDrain(db);
    providerIdentity = { accountId: "acct_wrongaccount", livemode: true };
    try {
      await expect(auditAutoTopupLegacyDrain(db)).rejects.toThrow(
        /Stripe account or livemode/
      );
      expect((await db.select().from(autoTopupProtocolRollouts))[0]?.state).toBe(
        "draining"
      );
    } finally {
      providerIdentity = { accountId: "acct_rollouttest", livemode: false };
    }
  });
});
