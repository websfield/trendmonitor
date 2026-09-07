import { describe, expect, it, vi } from "vitest";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000071";
const SESSION_ID = "cs_restore_provider_only";
const SUBSCRIPTION_ID = "sub_restore_provider_only";
let workspaceId = "";
let currentProviderPriceId = "price_creator";
let signedMetadata: Record<string, string> = {};
let signedInvoiceMetadata: Record<string, string> = {};

const sessionOf = () => ({
  id: SESSION_ID,
  object: "checkout.session",
  livemode: false,
  mode: "subscription",
  customer: "cus_restore_provider_only",
  subscription: SUBSCRIPTION_ID,
  created: 100,
  status: "complete",
  payment_status: "paid",
  metadata: {
    workspace_id: workspaceId,
    respin_kind: "tier_checkout",
    respin_checkout_attempt_id: ATTEMPT_ID,
    tier: "creator",
    price_id: "price_creator",
    ...signedMetadata,
  },
  line_items: {
    object: "list",
    data: [
      {
        id: "li_restore_provider_only",
        object: "item",
        price: { id: "price_creator", object: "price" },
        quantity: 1,
      },
    ],
    has_more: false,
    url: "",
  },
});

const subscriptionOf = (priceId = currentProviderPriceId) => ({
  id: SUBSCRIPTION_ID,
  object: "subscription",
  livemode: false,
  customer: "cus_restore_provider_only",
  status: "active",
  metadata: sessionOf().metadata,
  cancel_at_period_end: false,
  cancel_at: null,
  pause_collection: null,
  items: {
    object: "list",
    data: [
      {
        id: "si_restore_provider_only",
        object: "subscription_item",
        price: { id: priceId, object: "price" },
        current_period_start: 100,
        current_period_end: 2_692_100,
      },
    ],
    has_more: false,
    url: "",
  },
});

const invoiceOf = () => ({
  id: "in_restore_cycle",
  object: "invoice",
  livemode: false,
  customer: "cus_restore_provider_only",
  billing_reason: "subscription_cycle",
  metadata: signedInvoiceMetadata,
  lines: {
    object: "list",
    data: [
      {
        id: "il_restore_cycle",
        object: "line_item",
        period: { start: 100, end: 2_592_100 },
        pricing: { price_details: { price: "price_creator" } },
        parent: {
          type: "subscription_item_details",
          subscription_item_details: {
            subscription: SUBSCRIPTION_ID,
            subscription_item: "si_restore_provider_only",
            proration: false,
          },
        },
      },
    ],
  },
  parent: {
    subscription_details: {
      subscription: SUBSCRIPTION_ID,
      metadata: sessionOf().metadata,
    },
  },
});

const sessionRetrieve = vi.fn(async () => sessionOf());
const sessionList = vi.fn(async () => ({ data: [sessionOf()], has_more: false }));
const subscriptionRetrieve = vi.fn(async () => subscriptionOf());
const eventList = vi.fn(async (params: { type: string }) => {
  if (params.type === "checkout.session.completed") {
    return {
      data: [
        {
          id: "evt_restore_checkout",
          object: "event",
          api_version: "2025-12-15.clover",
          created: 100,
          data: { object: sessionOf() },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: "checkout.session.completed",
        },
      ],
      has_more: false,
    };
  }
  if (params.type === "customer.subscription.created") {
    return {
      data: [
        {
          id: "evt_restore_subscription",
          object: "event",
          api_version: "2025-12-15.clover",
          created: 101,
          data: { object: subscriptionOf("price_creator") },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: "customer.subscription.created",
        },
      ],
      has_more: false,
    };
  }
  if (
    params.type === "customer.subscription.updated" &&
    currentProviderPriceId !== "price_creator"
  ) {
    return {
      data: [
        {
          id: "evt_restore_portal_change",
          object: "event",
          api_version: "2025-12-15.clover",
          created: 102,
          data: { object: subscriptionOf() },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: "customer.subscription.updated",
        },
      ],
      has_more: false,
    };
  }
  if (params.type === "invoice.paid") {
    return {
      data: [
        {
          id: "evt_restore_invoice_primary",
          object: "event",
          api_version: "2025-12-15.clover",
          created: 102,
          data: { object: invoiceOf() },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: "invoice.paid",
        },
        {
          id: "evt_restore_invoice_duplicate",
          object: "event",
          api_version: "2025-12-15.clover",
          created: 103,
          data: { object: invoiceOf() },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: "invoice.paid",
        },
      ],
      has_more: false,
    };
  }
  return { data: [], has_more: false };
});

vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    checkout: {
      sessions: { retrieve: sessionRetrieve, list: sessionList },
    },
    subscriptions: { retrieve: subscriptionRetrieve },
    invoices: { retrieve: async () => invoiceOf() },
    events: { list: eventList },
  }),
  getAuthenticatedStripeAccountIdentity: async () => ({
    accountId: "acct_tierrestore",
    livemode: false,
  }),
  getAutoTopupAuthorityKey: () =>
    "stripe-test-pack-authority-key-at-least-32-bytes",
  getAutoTopupAuthorityKeyMaterial: () => ({
    id: "v1",
    key: "stripe-test-pack-authority-key-at-least-32-bytes",
    fingerprint:
      "sha256:fe3b3de1339e7ec571414d65c6f3091e4c11ebbae40b7b09031308abf4a734ab",
  }),
}));

import { eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  autoTopupProtocolRollouts,
  creditLedger,
  createTestDb,
  schema,
  seedAuthUser,
  seedDb,
  stripeEvents,
  subscriptions,
  tierCheckoutProtocolRollouts,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import { reconcileTierCheckoutV1Session } from "../src/stripe/tier-checkout-v1-reconcile";
import { tierCheckoutAuthorityMetadata } from "../src/stripe/tier-checkout-authority";
import { tierInvoiceAuthorityMetadata } from "../src/stripe/tier-invoice-authority";

describe("active tier Checkout restore reconciliation", () => {
  it("rebuilds missing attempt authority through the durable customer map and replays only real Stripe events", async () => {
    currentProviderPriceId = "price_creator";
    const db = await createTestDb();
    await seedAuthUser(db, "tier-restore-user");
    await seedDb(db);
    const configContent = {
      ...CONFIG_V1_SEED,
      stripePriceMap: { price_creator: "creator" as const, price_pro: "pro" as const },
    };
    const configVersion = await appendConfigVersion(
      db,
      configContent,
      "tier-restore-admin"
    );
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: "Tier restore" })
      .returning({ id: schema.workspaces.id });
    workspaceId = workspace.id;
    signedMetadata = tierCheckoutAuthorityMetadata(
      ATTEMPT_ID,
      workspace.id,
      "cus_restore_provider_only",
      configVersion,
      configContent,
      { accountId: "acct_tierrestore", livemode: false }
    );
    signedInvoiceMetadata = tierInvoiceAuthorityMetadata({
      invoiceId: "in_restore_cycle",
      subscriptionId: SUBSCRIPTION_ID,
      workspaceId: workspace.id,
      customerId: "cus_restore_provider_only",
      checkoutAttemptId: ATTEMPT_ID,
      priceId: "price_creator",
      periodStart: 100,
      periodEnd: 2_592_100,
      tier: "creator",
      allowance: configContent.allowances.creator,
      configVersion,
      monthlyPeriodDays: configContent.monthlyPeriodDays,
      stripeAccountId: "acct_tierrestore",
      stripeLivemode: false,
    });
    const rolloutAt = new Date();
    await db
      .update(autoTopupProtocolRollouts)
      .set({
        state: "active",
        revision: 1,
        fleetQuiescedAt: rolloutAt,
        drainStartedAt: rolloutAt,
        providerReconciledAt: rolloutAt,
        reconciledCustomers: 0,
        reconciledPaymentIntents: 0,
        authorityKeyId: "v1",
        authorityKeyFingerprint:
          "sha256:fe3b3de1339e7ec571414d65c6f3091e4c11ebbae40b7b09031308abf4a734ab",
        stripeAccountId: "acct_tierrestore",
        stripeLivemode: false,
        activatedAt: rolloutAt,
      });
    await db
      .update(tierCheckoutProtocolRollouts)
      .set({
        state: "active",
        revision: 1,
        fleetQuiescedAt: rolloutAt,
        drainStartedAt: rolloutAt,
        providerReconciledAt: rolloutAt,
        reconciledCustomers: 0,
        reconciledSessions: 0,
        stripeAccountId: "acct_tierrestore",
        stripeLivemode: false,
        activatedAt: rolloutAt,
      });
    await db.insert(subscriptions).values({
      workspaceId: workspace.id,
      stripeCustomerId: "cus_restore_provider_only",
      stripeSubscriptionId: `checkout_fence:${workspace.id}`,
      status: "incomplete",
      tierCheckoutFenceAt: rolloutAt,
      tierCheckoutFenceSubscriptionId: null,
      tierCheckoutFenceStatus: "none",
      tierCheckoutFenceObservedSubscriptionId: null,
    });
    sessionRetrieve.mockClear();
    sessionList.mockClear();
    subscriptionRetrieve.mockClear();
    eventList.mockClear();

    await expect(reconcileTierCheckoutV1Session(db, SESSION_ID)).resolves.toEqual({
      sessionId: SESSION_ID,
      subscriptionId: SUBSCRIPTION_ID,
      workspaceId: workspace.id,
      outcome: "replayed",
      replayedEventIds: [
        "evt_restore_checkout",
        "evt_restore_subscription",
        "evt_restore_invoice_primary",
        "evt_restore_invoice_duplicate",
      ],
      duplicateEventIds: [],
    });
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspace.id));
    expect(row).toMatchObject({
      stripeSubscriptionId: SUBSCRIPTION_ID,
      status: "active",
      tierCheckoutFenceAt: null,
      tierCheckoutAttemptId: null,
    });
    const receipts = await db.select().from(stripeEvents);
    expect(receipts.map((event) => event.id).sort()).toEqual([
      "evt_restore_checkout",
      "evt_restore_invoice_duplicate",
      "evt_restore_invoice_primary",
      "evt_restore_subscription",
    ]);
    expect(
      receipts
        .filter((event) => event.type === "invoice.paid")
        .map((event) => [event.id, event.outcome, event.tierInvoiceAuthority !== null])
    ).toEqual([
      ["evt_restore_invoice_primary", "processed", true],
      ["evt_restore_invoice_duplicate", "ignored", true],
    ]);
    const grants = (await db.select().from(creditLedger)).filter(
      (entry) => entry.refType === "invoice" && entry.refId === "in_restore_cycle"
    );
    expect(grants).toHaveLength(1);
    expect(grants[0].tierCheckoutAttemptId).toBe(ATTEMPT_ID);

    await expect(reconcileTierCheckoutV1Session(db, SESSION_ID)).resolves.toMatchObject({
      outcome: "already_converged",
      replayedEventIds: [],
      duplicateEventIds: [
        "evt_restore_checkout",
        "evt_restore_subscription",
        "evt_restore_invoice_primary",
        "evt_restore_invoice_duplicate",
      ],
    });
    expect(await db.select().from(stripeEvents)).toHaveLength(4);

    // A Customer Portal upgrade mutates the live Subscription item but does
    // not rewrite the original Checkout Session or its creation metadata.
    // Recovery must authenticate the Session->Subscription generation while
    // treating the provider's current sole mapped price as current truth.
    currentProviderPriceId = "price_pro";
    await expect(reconcileTierCheckoutV1Session(db, SESSION_ID)).resolves.toMatchObject({
      outcome: "replayed",
      replayedEventIds: ["evt_restore_portal_change"],
    });
    const [upgraded] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspace.id));
    expect(upgraded.stripeSubscriptionId).toBe(SUBSCRIPTION_ID);
    expect(upgraded.stripePriceId).toBe("price_pro");
  });
});
