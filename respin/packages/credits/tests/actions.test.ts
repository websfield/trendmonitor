// Billing actions — keyless coverage: every guard fires BEFORE any Stripe
// call, so the matrix runs with no STRIPE_* env (AC-6) — reaching Stripe
// without a key would throw StripeNotConfiguredError, which none of these do.
import { describe, expect, it, vi } from "vitest";

// The ONLY mock in this suite, and it exists to reach the one branch a keyless
// test cannot: maybeAutoTopup's SUCCESS path (code-review CHANGE — the trigger
// path, the idempotency key the plan says "the Docker race case asserts", and
// the cap's ALLOW direction all shipped with no test at all).
const piCreate = vi.fn(async () => ({ id: "pi_created" }));
// Round-5 additions: the tier-checkout idempotency key and the pause resume
// date are both arguments this package hands to Stripe and never stores, so
// they are only observable through the client (billing review findings 3 + 4).
const sessionCreate = vi.fn(async () => ({
  id: "cs_created",
  url: "https://checkout.stripe.test/cs_created",
}));
const subUpdate = vi.fn(async () => ({ id: "sub_updated" }));
vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    paymentIntents: { create: piCreate },
    checkout: { sessions: { create: sessionCreate } },
    subscriptions: { update: subUpdate },
  }),
}));
import { eq } from "drizzle-orm";
import {
  createTestDb,
  schema,
  seedAuthUser,
  seedDb,
  subscriptions,
  trustWorkspaceId,
  type TestDb,
  type WorkspaceScope,
} from "@respin/db";
import {
  AlreadySubscribedError,
  BillingRoleError,
  CheckoutInFlightError,
  createPackCheckoutUrl,
  createPortalUrl,
  createTierCheckoutUrl,
  NoLiveSubscriptionError,
  pauseSubscription,
  resumeSubscription,
  setAutoTopup,
  UnknownTierPriceError,
} from "../src/stripe/actions";
import { maybeAutoTopup } from "../src/stripe/auto-topup";
import { creditLedger, CONFIG_V1_SEED } from "@respin/db";
import { appendConfigVersion } from "@respin/config";

const URLS = { successUrl: "http://x/s", cancelUrl: "http://x/c" };

async function setup(db: TestDb) {
  await seedAuthUser(db, "actions_user");
  await seedDb(db);
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name: "A" })
    .returning();
  const wsId = trustWorkspaceId(w.id);
  const scopeOf = (role: "owner" | "editor" | "viewer"): WorkspaceScope => ({
    workspaceId: wsId,
    role,
    // The accessor map is not exercised by these actions (they take `db`
    // directly); the empty stubs exist only to satisfy the scope type.
    accessors: {
      workspace: async () => [],
      members: async () => [],
      subscription: async () => [],
      ledger: async () => [],
    },
  });
  return { wsId, scopeOf };
}

describe("owner-only billing actions (REQ-A02, AC-6 matrix)", () => {
  it("all six actions throw BillingRoleError for editor and viewer", async () => {
    const db = await createTestDb();
    const { scopeOf } = await setup(db);
    for (const role of ["editor", "viewer"] as const) {
      const scope = scopeOf(role);
      const calls: [string, () => Promise<unknown>][] = [
        ["tierCheckout", () => createTierCheckoutUrl(db, scope, "creator", "a@b.c", URLS)],
        ["packCheckout", () => createPackCheckoutUrl(db, scope, "a@b.c", URLS)],
        ["portal", () => createPortalUrl(db, scope, "http://x")],
        ["pause", () => pauseSubscription(db, scope, 1, new Date())],
        ["resume", () => resumeSubscription(db, scope)],
        ["autoTopup", () => setAutoTopup(db, scope, { enabled: false })],
      ];
      for (const [name, call] of calls) {
        await expect(call(), `${name} as ${role}`).rejects.toThrow(BillingRoleError);
      }
    }
  });

  it("round-2 NOTE 4: resume CONVERGES a mirror that says paused with no open pause period", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    // The drifted state: the reconciling webhook closed the period, the mirror
    // still says paused. `ensurePauseEnded` returns false there, and resume
    // used to redirect with no error at all — the button appeared to do
    // nothing while the page kept saying "Paused", with no event coming.
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_drift_action",
      stripeSubscriptionId: "sub_drift",
      status: "active",
      pausedAt: new Date(Date.now() - 3_600_000),
      resumesAt: new Date(Date.now() + 30 * 24 * 3_600_000),
    });
    await resumeSubscription(db, scopeOf("owner"));
    // Stripe was told to un-pause (so the local state must follow) ...
    expect(subUpdate).toHaveBeenCalledWith("sub_drift", { pause_collection: "" });
    const [sub] = await db.select().from(subscriptions);
    expect(sub.pausedAt, "the mirror must converge on not-paused").toBeNull();
    expect(sub.resumesAt).toBeNull();
  });

  it("second tier checkout while a live subscription exists → AlreadySubscribedError, no Stripe call (plan-review F1)", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_live",
      stripeSubscriptionId: "sub_live", status: "active",
    });
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(AlreadySubscribedError);
  });

  it("unmapped tier price → UnknownTierPriceError naming the remedy", async () => {
    const db = await createTestDb();
    const { scopeOf } = await setup(db);
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(UnknownTierPriceError);
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(/stripe:setup/);
  });

  it("pause bounds come from CONFIG (never a type-level 1|2|3)", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_p",
      stripeSubscriptionId: "sub_p", status: "active",
    });
    for (const months of [0, 4, 2.5]) {
      await expect(
        pauseSubscription(db, scopeOf("owner"), months, new Date())
      ).rejects.toThrow(/pauseMonths/);
    }
  });

  it("auto-top-up opt-in requires a positive integer cap; disable clears it", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    // A LIVE subscription. The fixture used to omit `stripeSubscriptionId`,
    // i.e. it modelled a workspace that had NEVER subscribed — and letting a
    // fixture define the contract is how `setAutoTopup` came to arm an
    // off-session charging authority on a dead mirror (round-10 CHANGE 4).
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_t",
      stripeSubscriptionId: "sub_t", status: "active",
    });
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: true })
    ).rejects.toThrow(/monthly cap/);
    await setAutoTopup(db, scopeOf("owner"), { enabled: true, monthlyCapCents: 3000 });
    let [row] = await db.select().from(subscriptions);
    expect(row.autoTopupEnabled).toBe(true);
    expect(row.autoTopupMonthlyCapCents).toBe(3000);
    await setAutoTopup(db, scopeOf("owner"), { enabled: false });
    [row] = await db.select().from(subscriptions);
    expect(row.autoTopupEnabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });
});

describe("round-5 regression pins (billing review findings 3 + 4)", () => {
  const mapPrice = async (db: TestDb) =>
    appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
      "test-admin"
    );

  it("FINDING 3: two checkouts racing the same mirror state send the SAME Stripe idempotency key — so Stripe can only ever return ONE session", async () => {
    sessionCreate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_race",
      status: "none",
    });
    // Both callers read the mirror BEFORE any webhook lands — the window in
    // which the F1 guard is blind and two completed Checkouts would become
    // two Stripe subscriptions on one workspace.
    const [urlA, urlB] = await Promise.all([
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS),
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS),
    ]);
    expect(urlA).toBe(urlB);
    expect(sessionCreate).toHaveBeenCalledTimes(2);
    const keyOf = (i: number) =>
      (sessionCreate.mock.calls[i] as unknown as [unknown, { idempotencyKey: string }])[1]
        .idempotencyKey;
    expect(keyOf(0)).toBe(keyOf(1));
    // Built from durable state ONLY — not a clock, not a random, and (round-5
    // gate) not the tier or the caller's URLs either, both of which would
    // narrow the guarantee to "one session per price" or hand its scope to an
    // argument this package cannot control.
    expect(keyOf(0)).toBe(`checkout:${wsId}:none`);
  });

  it("FINDING 3: two racers picking DIFFERENT tiers ALSO collapse to one key — the cross-tier race is the one the single-row mirror cannot even represent", async () => {
    sessionCreate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { price_creator: "creator", price_pro: "pro" },
      },
      "test-admin"
    );
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_xtier",
      status: "none",
    });
    await Promise.all([
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS),
      createTierCheckoutUrl(db, scopeOf("owner"), "pro", "a@b.c", URLS),
    ]);
    const keyOf = (i: number) =>
      (sessionCreate.mock.calls[i] as unknown as [unknown, { idempotencyKey: string }])[1]
        .idempotencyKey;
    // With the tier in the key these were two keys, two sessions and two
    // Stripe subscriptions on one workspace — and `subscriptions` is one row
    // per workspace, so the second would bill forever with nothing in our
    // database pointing at it.
    expect(keyOf(0)).toBe(keyOf(1));
    expect(keyOf(0)).not.toContain("price_");
  });

  it("FINDING 3: a checkout on different terms while one is open is a TYPED refusal, not a raw Stripe 400", async () => {
    sessionCreate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_mismatch",
      status: "none",
    });
    // What Stripe returns when a key is replayed with different parameters.
    sessionCreate.mockRejectedValueOnce(
      Object.assign(new Error("Keys for idempotent requests..."), {
        type: "StripeIdempotencyError",
      })
    );
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(CheckoutInFlightError);
    // The refusal explains itself: the owner is told what to do, not shown a
    // Stripe error code.
    await expect(
      (async () => {
        sessionCreate.mockRejectedValueOnce(
          Object.assign(new Error("x"), { type: "StripeIdempotencyError" })
        );
        return createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS);
      })()
    ).rejects.toThrow(/Finish or abandon the open Checkout/);
    // ...and an UNRELATED Stripe failure is never disguised as this one.
    sessionCreate.mockRejectedValueOnce(
      Object.assign(new Error("card_declined"), { type: "StripeCardError" })
    );
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(/card_declined/);
  });

  it("FINDING 3: the key CHANGES once a subscription id exists, so subscribe → cancel → re-subscribe is not stuck replaying the completed session", async () => {
    sessionCreate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_again",
      status: "none",
    });
    await createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS);
    // The webhook lands, then the customer cancels: the mirror keeps the DEAD
    // subscription id, which is exactly what makes the next key different.
    await db
      .update(subscriptions)
      .set({ stripeSubscriptionId: "sub_dead", status: "canceled" })
      .where(eq(subscriptions.workspaceId, wsId));
    await createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS);
    const keyOf = (i: number) =>
      (sessionCreate.mock.calls[i] as unknown as [unknown, { idempotencyKey: string }])[1]
        .idempotencyKey;
    expect(keyOf(1)).not.toBe(keyOf(0));
    expect(keyOf(1)).toBe(`checkout:${wsId}:sub_dead`);
  });

  it("FINDING 4: a pause started on 31 January resumes on 28 February — never 3 March, which would outrun pauseMonths.max", async () => {
    subUpdate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_pause",
      stripeSubscriptionId: "sub_pause",
      status: "active",
    });
    await pauseSubscription(
      db,
      scopeOf("owner"),
      1,
      new Date("2027-01-31T00:00:00.000Z")
    );
    const [, params] = subUpdate.mock.calls[0] as unknown as [
      string,
      { pause_collection: { resumes_at: number } },
    ];
    expect(new Date(params.pause_collection.resumes_at * 1000).toISOString()).toBe(
      "2027-02-28T00:00:00.000Z"
    );
    // ...and the local mirror agrees with what Stripe was told.
    const [row] = await db.select().from(subscriptions);
    expect(row.resumesAt?.toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });
});

describe("round-7 pins (billing round-7 CHANGE 1 + CHANGE 7)", () => {
  it("CHANGE 1: a CANCELED workspace never gets an off-session charge, however armed the flags are", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    // The exact end state of the ordinary REQ-G01 self-serve cancel: the
    // mirror is canceled and free everywhere else in the product, but the
    // auto-top-up opt-in is still on the row (a workspace that cancelled
    // before round 7's webhook fix, or any path that leaves it set).
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_gone",
      stripeSubscriptionId: "sub_gone",
      status: "canceled",
      autoTopupEnabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false,
      reason: "not_subscribed",
    });
    expect(piCreate).not.toHaveBeenCalled();
  });

  it("CHANGE 1: a workspace that never subscribed (pack-only customer) is refused too — there is no saved payment method to charge", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_packs_only",
      status: "none",
      autoTopupEnabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false,
      reason: "not_subscribed",
    });
    expect(piCreate).not.toHaveBeenCalled();
  });

  it("CHANGE 1 (not a blanket ban): dunning and cancel-at-period-end subscriptions STILL top up", async () => {
    for (const row of [
      { status: "past_due" as const, cancelAtPeriodEnd: false },
      { status: "active" as const, cancelAtPeriodEnd: true },
    ]) {
      piCreate.mockClear();
      const db = await createTestDb();
      const { wsId } = await setup(db);
      await db.insert(subscriptions).values({
        workspaceId: wsId,
        stripeCustomerId: "cus_live",
        stripeSubscriptionId: "sub_live",
        status: row.status,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        autoTopupEnabled: true,
        autoTopupMonthlyCapCents: 5000,
      });
      // A subscription in dunning, or one cancelling at period end, is still a
      // subscription: it exists in Stripe and the customer is still served.
      expect(
        (await maybeAutoTopup(db, wsId, 100, new Date())).triggered,
        `${row.status} cancelAtPeriodEnd=${row.cancelAtPeriodEnd}`
      ).toBe(true);
      expect(piCreate).toHaveBeenCalledTimes(1);
    }
  });

  it("CHANGE 7: an INCOMPLETE subscription is refused with the remedy that state actually permits — never 'manage it in the Portal'", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    // Card needed SCA or was declined at the payment step, so Stripe left the
    // subscription `incomplete` and holds it for ~23 hours. It counts as live
    // (a second Checkout really would double-bill), but the Portal has nothing
    // to manage for it — the old message sent the creator to a dead end with
    // money on the table.
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_sca",
      stripeSubscriptionId: "sub_sca",
      status: "incomplete",
    });
    const call = () =>
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS);
    await expect(call()).rejects.toThrow(AlreadySubscribedError);
    await expect(call()).rejects.toThrow(/FIRST PAYMENT has not completed/);
    await expect(call()).rejects.toThrow(/23 hours/);
    await expect(call()).rejects.not.toThrow(
      /Manage or change the plan in the Customer Portal instead/
    );
  });

  it("CHANGE 7: an ACTIVE subscription still gets the portal message (the branch is on STATE, not a rewrite)", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_ok",
      stripeSubscriptionId: "sub_ok",
      status: "active",
    });
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(/Customer Portal/);
  });
});

describe("maybeAutoTopup refusal paths (keyless — every refusal precedes Stripe)", () => {
  it("disabled / paused / no_customer refuse without any Stripe call", async () => {
    const db = await createTestDb();
    const { wsId } = await setup(db);
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false, reason: "no_customer",
    });
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_a",
      // A LIVE subscription id: auto-top-up is a subscriber feature, so every
      // fixture that expects to get past the liveness guard must model one
      // (billing round-7 CHANGE 1 — these fixtures all modelled a workspace
      // that had never subscribed, which is why they went red when the guard
      // landed; the guard is right and the fixtures were unrealistic).
      stripeSubscriptionId: "sub_a", status: "active",
    });
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false, reason: "disabled",
    });
    // Always workspace-keyed, even in a single-workspace fixture: an unscoped
    // UPDATE is the exact shape the tenancy lint exists to prevent, and a test
    // that models it teaches the wrong pattern (code-review NOTE).
    await db
      .update(subscriptions)
      .set({ autoTopupEnabled: true, autoTopupMonthlyCapCents: 5000, pausedAt: new Date() })
      .where(eq(subscriptions.workspaceId, wsId));
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false, reason: "paused",
    });
  });

  it("AC-7: the monthly cap is computed in CENTS from this-calendar-month auto-top-up rows and respects the month boundary", async () => {
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_cap",
      stripeSubscriptionId: "sub_cap", status: "active",
      autoTopupEnabled: true, autoTopupMonthlyCapCents: 2500, // 2 packs max ($10 each)
    });
    const at = new Date();
    const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const lastMonth = new Date(monthStart.getTime() - 24 * 3_600_000);
    // LAST month's top-ups never count against THIS month's cap
    await db.insert(creditLedger).values([
      { workspaceId: wsId, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_old", amountCents: 1000, createdAt: lastMonth,
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000) },
      // two top-ups THIS month = 2000c spent; a third pack (1000c) would break the 2500c cap
      { workspaceId: wsId, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_1", amountCents: 1000, createdAt: new Date(monthStart.getTime() + 1000),
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000) },
      { workspaceId: wsId, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_2", amountCents: 1000, createdAt: new Date(monthStart.getTime() + 2000),
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000) },
    ]);
    expect(await maybeAutoTopup(db, wsId, 100, at)).toEqual({
      triggered: false, reason: "cap_reached",
    });
    // ordinary (non-auto-top-up) pack purchases do NOT count against the cap
    const [capRow] = await db.select().from(subscriptions);
    expect(capRow.autoTopupMonthlyCapCents).toBe(2500);
  });
});

describe("maybeAutoTopup SUCCESS path (the branch keyless tests cannot reach)", () => {
  const enable = async (db: TestDb, wsId: ReturnType<typeof trustWorkspaceId>) =>
    db
      .update(subscriptions)
      .set({ autoTopupEnabled: true, autoTopupMonthlyCapCents: 3000 })
      .where(eq(subscriptions.workspaceId, wsId));

  it("triggers ONE PaymentIntent for the pack price, and writes NO ledger row (credits land via the webhook)", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_A",
      stripeSubscriptionId: "sub_A",
      status: "active",
    });
    await enable(db, wsId);

    const at = new Date();
    expect(await maybeAutoTopup(db, wsId, 100, at)).toEqual({
      triggered: true,
      paymentIntentId: "pi_created",
    });
    expect(piCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = piCreate.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect(params.amount).toBe(1000); // config pack price in cents, not a literal
    expect(params.customer).toBe("cus_A");
    expect(params.off_session).toBe(true);
    expect(params.confirm).toBe(true);
    expect(params.metadata).toMatchObject({
      respin_kind: "auto_topup",
      workspace_id: wsId,
    });
    // n = 0 rows this month → the FIRST key. Asserted here because the plan
    // claims the Docker race case asserts it, and no test did.
    const yyyyMm = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(opts.idempotencyKey).toBe(`autotopup:${wsId}:${yyyyMm}:1`);
    // The credit is the WEBHOOK's job (single-tx, event-id idempotent).
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it("the idempotency key advances with the month's row count (n=2 → :3)", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_A",
      stripeSubscriptionId: "sub_A",
      status: "active",
    });
    await enable(db, wsId);
    const at = new Date();
    const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const expiresAt = new Date(at.getTime() + 365 * 24 * 3_600_000);
    await db.insert(creditLedger).values([
      { workspaceId: wsId, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_1", amountCents: 1000,
        createdAt: new Date(monthStart.getTime() + 1000), expiresAt },
      { workspaceId: wsId, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_2", amountCents: 1000,
        createdAt: new Date(monthStart.getTime() + 2000), expiresAt },
    ]);
    expect((await maybeAutoTopup(db, wsId, 100, at)).triggered).toBe(true);
    const [, opts] = piCreate.mock.calls[0] as unknown as [
      unknown,
      { idempotencyKey: string },
    ];
    const yyyyMm = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(opts.idempotencyKey).toBe(`autotopup:${wsId}:${yyyyMm}:3`);
  });

  it("the cap boundary ALLOWS exactly-at-cap and refuses one cent over (the direction no test covered)", async () => {
    for (const [capCents, expected] of [
      [2000, true], // 1000 spent + 1000 pack === cap → allowed
      [1999, false], // one cent short → refused
    ] as const) {
      piCreate.mockClear();
      const db = await createTestDb();
      const { wsId } = await setup(db);
      await db.insert(subscriptions).values({
        workspaceId: wsId,
        stripeCustomerId: "cus_A",
        stripeSubscriptionId: "sub_A",
        status: "active",
        autoTopupEnabled: true,
        autoTopupMonthlyCapCents: capCents,
      });
      const at = new Date();
      const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
      await db.insert(creditLedger).values({
        workspaceId: wsId, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_1", amountCents: 1000,
        createdAt: new Date(monthStart.getTime() + 1000),
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000),
      });
      const result = await maybeAutoTopup(db, wsId, 100, at);
      expect(result.triggered, `cap ${capCents}`).toBe(expected);
      if (!expected) {
        expect(result).toEqual({ triggered: false, reason: "cap_reached" });
        expect(piCreate).not.toHaveBeenCalled();
      }
    }
  });
});

describe("round-10 pins (billing CHANGE 4: one liveness definition, three readers)", () => {
  const mkSub = async (
    db: TestDb,
    wsId: string,
    over: Record<string, unknown> = {}
  ) => {
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_live_x",
      stripeSubscriptionId: "sub_live_x",
      status: "active",
      ...over,
    } as never);
  };

  it("CHANGE 4: setAutoTopup REFUSES to arm on a canceled subscription — the state DEAD_SUBSCRIPTION_FIELDS exists to make impossible", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, { status: "canceled" });
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: true, monthlyCapCents: 5000 })
    ).rejects.toThrow(NoLiveSubscriptionError);
    // ...and the row was NOT armed. The round-8 defence was "the trigger
    // refuses anyway", which is true and beside the point: Phase 4 renders THIS
    // row, and {canceled, autoTopupEnabled: true} is the state the whole
    // DEAD_SUBSCRIPTION_FIELDS mechanism was introduced to prevent.
    const [row] = await db.select().from(subscriptions);
    expect(row.autoTopupEnabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });

  it("CHANGE 4: a workspace that NEVER subscribed (pack-only customer) cannot arm it either", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, { stripeSubscriptionId: null, status: "none" });
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: true, monthlyCapCents: 5000 })
    ).rejects.toThrow(NoLiveSubscriptionError);
  });

  it("CHANGE 4 (the direction that must NOT change): DISABLING is always allowed, even on a dead mirror", async () => {
    // Guarding the disable would trap an owner whose subscription died while
    // the flag was armed with a switch they cannot turn off. Turning it off can
    // only move the row toward the safe state, so it is deliberately ungated —
    // and that choice is pinned here rather than left to be re-derived.
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, {
      status: "canceled",
      autoTopupEnabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    await setAutoTopup(db, scopeOf("owner"), { enabled: false });
    const [row] = await db.select().from(subscriptions);
    expect(row.autoTopupEnabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });

  it("CHANGE 4 (not a blanket ban): a live subscription in dunning or cancel-at-period-end can still arm it", async () => {
    // The same non-vacuity direction the round-7 auto-top-up guard needed: a
    // liveness rule that refused everything would pass the two tests above and
    // be useless.
    for (const over of [
      { status: "past_due" },
      { status: "active", cancelAtPeriodEnd: true },
      { status: "unpaid" },
    ]) {
      const db = await createTestDb();
      const { wsId, scopeOf } = await setup(db);
      await mkSub(db, wsId, over);
      await setAutoTopup(db, scopeOf("owner"), {
        enabled: true,
        monthlyCapCents: 5000,
      });
      const [row] = await db.select().from(subscriptions);
      expect(row.autoTopupEnabled, JSON.stringify(over)).toBe(true);
    }
  });
});
