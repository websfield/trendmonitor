import { describe, expect, it, vi } from "vitest";

const sessionList = vi.fn();
const subscriptionRetrieve = vi.fn();
let providerIdentity = { accountId: "acct_tierrollout", livemode: false };
vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    checkout: { sessions: { list: sessionList } },
    subscriptions: { retrieve: subscriptionRetrieve },
  }),
  getAuthenticatedStripeAccountIdentity: async () => providerIdentity,
}));

import { eq } from "drizzle-orm";
import {
  createTestDb,
  CONFIG_V1_SEED,
  schema,
  seedDb,
  subscriptions,
  tierCheckoutProtocolRollouts,
  type TestDb,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import {
  activateTierCheckoutAttemptProtocol,
  auditTierCheckoutLegacyDrain,
  beginTierCheckoutProtocolDrain,
  LEGACY_TIER_CHECKOUT_QUIESCENCE_MS,
  restartTierCheckoutProtocolDrain,
} from "../src/stripe/tier-checkout-rollout";
import { STRIPE_MAX_CALL_WINDOW_MS } from "../src/stripe/adapter";

async function insertWorkspace(db: TestDb, name: string): Promise<string> {
  const [row] = await db
    .insert(schema.workspaces)
    .values({ name })
    .returning({ id: schema.workspaces.id });
  return row.id;
}

async function installPackWriterFence(db: TestDb): Promise<void> {
  await seedDb(db);
  await appendConfigVersion(
    db,
    {
      ...CONFIG_V1_SEED,
      stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
    },
    "tier-rollout-test"
  );
}

async function ageDrain(db: TestDb): Promise<void> {
  const old = new Date(Date.now() - LEGACY_TIER_CHECKOUT_QUIESCENCE_MS - 1_000);
  await db
    .update(tierCheckoutProtocolRollouts)
    .set({ fleetQuiescedAt: old, drainStartedAt: old })
    .where(eq(tierCheckoutProtocolRollouts.protocol, "v1"));
}

function checkoutSession(
  values: Partial<{
    id: string;
    customer: string | null;
    workspaceId: string | null;
    status: "open" | "complete" | "expired" | null;
    paymentStatus: "paid" | "unpaid" | "no_payment_required";
    subscription: string | null;
    created: number;
    attemptId: string | null;
  }>
) {
  return {
    id: values.id ?? "cs_rollout",
    mode: "subscription",
    customer: values.customer ?? "cus_rollout",
    metadata:
      values.workspaceId === null
        ? {}
        : {
            workspace_id: values.workspaceId ?? "workspace_missing",
            ...(values.attemptId
              ? { respin_checkout_attempt_id: values.attemptId }
              : {}),
          },
    status: values.status === undefined ? "expired" : values.status,
    payment_status: values.paymentStatus ?? "unpaid",
    subscription: values.subscription ?? null,
    created: values.created ?? 1,
  };
}

function packSession(
  values: Partial<{
    id: string;
    customer: string;
    workspaceId: string | null;
    status: "open" | "complete" | "expired";
    paymentStatus: "paid" | "unpaid" | "no_payment_required";
    created: number;
  }>
) {
  return {
    ...checkoutSession({
      id: values.id,
      customer: values.customer,
      workspaceId: values.workspaceId,
      status: values.status,
      paymentStatus: values.paymentStatus,
      subscription: null,
      created: values.created,
    }),
    mode: "payment",
    metadata: {
      respin_kind: "pack",
      ...(values.workspaceId === null
        ? {}
        : { workspace_id: values.workspaceId ?? "workspace_missing" }),
    },
  };
}

describe("tier Checkout staged rollout", () => {
  it("keeps expansion legacy-compatible, fences atomically at drain, and activates only after proof", async () => {
    const db = await createTestDb();
    await installPackWriterFence(db);
    providerIdentity = { accountId: "acct_tierrollout", livemode: false };
    const deadWorkspace = await insertWorkspace(db, "tier-rollout-dead");
    const liveWorkspace = await insertWorkspace(db, "tier-rollout-live");
    await db.insert(subscriptions).values({
      workspaceId: deadWorkspace,
      stripeCustomerId: "cus_tier_dead",
      stripeSubscriptionId: null,
      status: "none",
    });
    await db.insert(subscriptions).values({
      workspaceId: liveWorkspace,
      stripeCustomerId: "cus_tier_live",
      stripeSubscriptionId: "sub_tier_live",
      status: "active",
    });
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, deadWorkspace)))[0]
        ?.tierCheckoutFenceAt
    ).toBeNull();

    const draining = await beginTierCheckoutProtocolDrain(db, new Date());
    expect(draining.state).toBe("draining");
    const afterDrain = await db.select().from(subscriptions);
    const byWorkspace = new Map(afterDrain.map((row) => [row.workspaceId, row]));
    expect(byWorkspace.get(deadWorkspace)).toMatchObject({
      stripeSubscriptionId: `checkout_fence:${deadWorkspace}`,
      status: "incomplete",
      tierCheckoutFenceSubscriptionId: null,
      tierCheckoutFenceStatus: "none",
    });
    expect(byWorkspace.get(deadWorkspace)?.tierCheckoutFenceAt).toBeInstanceOf(Date);
    expect(byWorkspace.get(liveWorkspace)).toMatchObject({
      stripeSubscriptionId: "sub_tier_live",
      status: "active",
      tierCheckoutFenceAt: null,
    });

    const insertedDuringDrain = await insertWorkspace(db, "tier-rollout-new");
    await expect(
      db.insert(subscriptions).values({
        workspaceId: insertedDuringDrain,
        stripeCustomerId: "cus_tier_new",
        stripeSubscriptionId: null,
        status: "none",
      })
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, insertedDuringDrain))
    ).toHaveLength(0);
    await expect(auditTierCheckoutLegacyDrain(db)).rejects.toThrow(
      /database-authored drain fence/
    );

    await ageDrain(db);
    sessionList.mockReset();
    subscriptionRetrieve.mockReset();
    subscriptionRetrieve.mockResolvedValue({ id: "sub_tier_live", status: "active" });
    sessionList.mockResolvedValue({
      data: [
        checkoutSession({
          id: "cs_tier_live",
          customer: "cus_tier_live",
          workspaceId: liveWorkspace,
          status: "complete",
          paymentStatus: "paid",
          subscription: "sub_tier_live",
        }),
      ],
      has_more: false,
    });
    const active = await activateTierCheckoutAttemptProtocol(db);
    expect(active).toMatchObject({
      state: "active",
      reconciledCustomers: 2,
      reconciledSessions: 1,
      stripeAccountId: "acct_tierrollout",
      stripeLivemode: false,
    });
    await expect(
      db.insert(subscriptions).values({
        workspaceId: insertedDuringDrain,
        stripeCustomerId: "cus_tier_old_binary",
        stripeSubscriptionId: null,
        status: "none",
      })
    ).rejects.toThrow();
    await expect(
      db.insert(subscriptions).values({
        workspaceId: insertedDuringDrain,
        stripeCustomerId: "cus_tier_v1",
        stripeSubscriptionId: `checkout_fence:${insertedDuringDrain}`,
        status: "incomplete",
        tierCheckoutFenceAt: new Date(),
        tierCheckoutFenceSubscriptionId: null,
        tierCheckoutFenceStatus: "none",
        tierCheckoutFenceObservedSubscriptionId: null,
      })
    ).resolves.toBeDefined();
  });

  it("paginates and blocks mapped-customer sessions with missing identity or unresolved no-subscription state", async () => {
    const db = await createTestDb();
    await installPackWriterFence(db);
    providerIdentity = { accountId: "acct_tierrollout", livemode: false };
    const workspaceId = await insertWorkspace(db, "tier-rollout-audit");
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_rollout",
      stripeSubscriptionId: "sub_rollout",
      status: "active",
    });
    await beginTierCheckoutProtocolDrain(db, new Date());
    await ageDrain(db);
    sessionList.mockReset();
    sessionList
      .mockResolvedValueOnce({
        data: [
          checkoutSession({ id: "cs_missing_metadata", workspaceId: null }),
          checkoutSession({
            id: "cs_expired_unpaid",
            workspaceId,
            status: "expired",
            paymentStatus: "unpaid",
          }),
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          checkoutSession({
            id: "cs_unknown",
            workspaceId,
            status: null,
          }),
          checkoutSession({
            id: "cs_expired_paid",
            workspaceId,
            status: "expired",
            paymentStatus: "paid",
          }),
          checkoutSession({
            id: "cs_local_live",
            workspaceId,
            status: "complete",
            paymentStatus: "paid",
            subscription: "sub_rollout",
          }),
        ],
        has_more: false,
      });
    subscriptionRetrieve.mockReset();
    subscriptionRetrieve.mockResolvedValue({ id: "sub_rollout", status: "active" });

    const report = await auditTierCheckoutLegacyDrain(db);
    expect(report.clear).toBe(false);
    expect(report.blockers.map((blocker) => blocker.reason)).toEqual([
      "missing_workspace_metadata",
      "unresolved_session_state",
      "unresolved_session_state",
    ]);
    expect(sessionList.mock.calls[1]?.[0]).toMatchObject({
      starting_after: "cs_expired_unpaid",
    });
  });

  it("audits every Respin pack Session and blocks paid-unminted or unresolved legacy money", async () => {
    const db = await createTestDb();
    await installPackWriterFence(db);
    providerIdentity = { accountId: "acct_tierrollout", livemode: false };
    const workspaceId = await insertWorkspace(db, "pack-rollout-audit");
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_pack_rollout",
      status: "none",
    });
    await beginTierCheckoutProtocolDrain(db, new Date());
    await ageDrain(db);
    const [rollout] = await db.select().from(tierCheckoutProtocolRollouts);
    sessionList.mockReset();
    sessionList.mockResolvedValue({
      data: [
        packSession({
          id: "cs_pack_paid_unminted",
          customer: "cus_pack_rollout",
          workspaceId,
          status: "complete",
          paymentStatus: "paid",
        }),
        packSession({
          id: "cs_pack_async_pending",
          customer: "cus_pack_rollout",
          workspaceId,
          status: "complete",
          paymentStatus: "unpaid",
        }),
        packSession({
          id: "cs_pack_expired_unpaid",
          customer: "cus_pack_rollout",
          workspaceId: null,
          status: "expired",
          paymentStatus: "unpaid",
        }),
        packSession({
          id: "cs_pack_late_old_writer",
          customer: "cus_pack_rollout",
          workspaceId,
          status: "expired",
          paymentStatus: "unpaid",
          created: Math.floor(
            (rollout.drainStartedAt!.getTime() +
              STRIPE_MAX_CALL_WINDOW_MS +
              2_000) /
              1_000
          ),
        }),
      ],
      has_more: false,
    });

    expect((await auditTierCheckoutLegacyDrain(db)).blockers).toEqual([
      expect.objectContaining({
        sessionId: "cs_pack_paid_unminted",
        reason: "paid_pack_not_minted",
      }),
      expect.objectContaining({
        sessionId: "cs_pack_async_pending",
        reason: "unresolved_pack_payment",
      }),
      expect.objectContaining({
        sessionId: "cs_pack_late_old_writer",
        reason: "post_drain_legacy_session",
      }),
    ]);
  });

  it("accepts one mirrored live subscription and rejects an account or late-legacy drift", async () => {
    const db = await createTestDb();
    await installPackWriterFence(db);
    providerIdentity = { accountId: "acct_tierrollout", livemode: false };
    const workspaceId = await insertWorkspace(db, "tier-rollout-binding");
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_binding",
      stripeSubscriptionId: "sub_binding",
      status: "active",
    });
    await beginTierCheckoutProtocolDrain(db, new Date());
    await ageDrain(db);
    const [rollout] = await db.select().from(tierCheckoutProtocolRollouts);
    sessionList.mockReset();
    subscriptionRetrieve.mockReset();
    subscriptionRetrieve.mockResolvedValue({ id: "sub_binding", status: "active" });
    sessionList.mockResolvedValue({
      data: [
        checkoutSession({
          id: "cs_binding",
          customer: "cus_binding",
          workspaceId,
          status: "complete",
          paymentStatus: "paid",
          subscription: "sub_binding",
        }),
        checkoutSession({
          id: "cs_late_legacy",
          customer: "cus_binding",
          workspaceId,
          status: "expired",
          paymentStatus: "unpaid",
          created: Math.ceil(
            (rollout.drainStartedAt!.getTime() +
              STRIPE_MAX_CALL_WINDOW_MS +
              2_000) /
              1_000
          ),
          attemptId: crypto.randomUUID(),
        }),
      ],
      has_more: false,
    });
    expect((await auditTierCheckoutLegacyDrain(db)).blockers).toEqual([
      expect.objectContaining({
        sessionId: "cs_late_legacy",
        reason: "post_drain_legacy_session",
      }),
    ]);

    await restartTierCheckoutProtocolDrain(db, new Date());
    await ageDrain(db);
    sessionList.mockResolvedValue({
      data: [
        checkoutSession({
          id: "cs_binding",
          customer: "cus_binding",
          workspaceId,
          status: "complete",
          paymentStatus: "paid",
          subscription: "sub_binding",
        }),
      ],
      has_more: false,
    });
    expect((await auditTierCheckoutLegacyDrain(db)).clear).toBe(true);
    providerIdentity = { accountId: "acct_other", livemode: false };
    await expect(activateTierCheckoutAttemptProtocol(db)).rejects.toThrow(
      /account or livemode/
    );
  });

  it("requires bidirectional provider/mirror agreement and terminates on a repeated page cursor", async () => {
    const db = await createTestDb();
    await installPackWriterFence(db);
    providerIdentity = { accountId: "acct_tierrollout", livemode: false };
    const workspaceId = await insertWorkspace(db, "tier-rollout-bidirectional");
    await db.insert(subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_bidirectional",
      stripeSubscriptionId: "sub_bidirectional",
      status: "active",
    });
    await beginTierCheckoutProtocolDrain(db, new Date());
    await ageDrain(db);
    sessionList.mockReset();
    subscriptionRetrieve.mockReset();
    sessionList.mockResolvedValue({
      data: [
        checkoutSession({
          id: "cs_terminal_provider",
          customer: "cus_bidirectional",
          workspaceId,
          status: "complete",
          paymentStatus: "paid",
          subscription: "sub_bidirectional",
        }),
      ],
      has_more: false,
    });
    subscriptionRetrieve.mockResolvedValue({
      id: "sub_bidirectional",
      status: "canceled",
    });
    expect((await auditTierCheckoutLegacyDrain(db)).blockers).toEqual([
      expect.objectContaining({ reason: "terminal_subscription_mirrored_live" }),
      expect.objectContaining({ reason: "local_live_subscription_not_found" }),
    ]);

    const repeating = {
      data: [
        checkoutSession({
          id: "cs_repeated_cursor",
          customer: "cus_bidirectional",
          workspaceId,
          status: "expired",
          paymentStatus: "unpaid",
        }),
      ],
      has_more: true,
    };
    sessionList.mockReset();
    sessionList.mockResolvedValue(repeating);
    await expect(auditTierCheckoutLegacyDrain(db)).rejects.toThrow(
      /repeated Checkout Session page cursor/
    );
    expect(sessionList).toHaveBeenCalledTimes(2);
  });
});
