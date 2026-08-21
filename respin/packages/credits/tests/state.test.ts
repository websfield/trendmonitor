// Tier/state machine (D-M1-4): lazy grace, read-time tier derivation,
// fail-closed unmapped price with a named reason.
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  createTestDb,
  schema,
  seedAuthUser,
  seedDb,
  trustWorkspaceId,
  type TestDb,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import { getWorkspaceBillingState, scheduledCancelAt } from "../src/state";

const HOUR = 3_600_000;

async function setup(db: TestDb): Promise<VerifiedWorkspaceId> {
  await seedAuthUser(db, "state_user");
  await seedDb(db); // config v1 (empty stripePriceMap)
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name: "S" })
    .returning();
  return trustWorkspaceId(w.id);
}

describe("getWorkspaceBillingState", () => {
  it("no subscriptions row → free/free (B6: Free is absence)", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });

  it("active with a MAPPED price → tier from config at read time; a config fix self-heals with no event replay", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1", stripePriceId: "price_creator",
      status: "active",
    });
    // unmapped at first → fail closed with named reason
    const before = await getWorkspaceBillingState(db, ws, new Date());
    expect(before.tier).toBe("free");
    expect(before.state).toBe("active");
    expect(before.reason).toBe("unmapped_price");
    // admin maps the price → same row now resolves, nothing replayed
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
      "test-admin"
    );
    const after = await getWorkspaceBillingState(db, ws, new Date());
    expect(after.tier).toBe("creator");
    expect(after.reason).toBeUndefined();
  });

  it("past_due inside grace → grace with deadline; past the deadline → free (lazy, no cron)", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    const deadline = new Date(Date.now() + 24 * HOUR);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_2", stripePriceId: "p",
      status: "past_due", graceExpiresAt: deadline,
    });
    const inGrace = await getWorkspaceBillingState(db, ws, new Date());
    expect(inGrace.state).toBe("grace");
    expect(inGrace.graceExpiresAt?.getTime()).toBe(deadline.getTime());
    const after = await getWorkspaceBillingState(
      db, ws, new Date(deadline.getTime() + 1000)
    );
    expect(after).toEqual({ tier: "free", state: "free" });
  });

  it("paused mirror → state paused with resumesAt", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    const resume = new Date(Date.now() + 30 * 24 * HOUR);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_3", stripePriceId: "p",
      // A LIVE subscription id, because you cannot pause a subscription that
      // does not exist — this fixture carried no `stripeSubscriptionId` until
      // the audit-remediation change, which made it (unintentionally) the
      // drift shape rather than the ordinary paused shape. The genuine drift
      // case is pinned separately below.
      stripeSubscriptionId: "sub_paused",
      status: "active", pausedAt: new Date(), resumesAt: resume,
    });
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("paused");
    expect(s.resumesAt?.getTime()).toBe(resume.getTime());
  });

  // AUDIT 2026-08-17 #5 — the drift state `state.test.ts` had no case for: a
  // subscription that reached "paused with no open pause period" and then
  // CANCELED. `pause.ts`'s own docblock concedes the state is reachable, and
  // this branch used to trust `pausedAt` unconditionally, AHEAD of any liveness
  // check — so it rendered a dead subscription as a live paid tier forever,
  // with a resume date that would never arrive and no event coming to fix it.
  it("AUDIT #5: canceled + a stale pausedAt derives to FREE, never to a paid paused tier", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    const staleResume = new Date(Date.now() + 30 * 24 * HOUR);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_drift",
      stripeSubscriptionId: "sub_dead",
      // The whole point: a stale PAID price plus a stale pause, on a DEAD
      // subscription. Before the fix this returned
      // {tier: "creator", state: "paused", resumesAt: <stale>}.
      stripePriceId: "p",
      status: "canceled",
      pausedAt: new Date(), resumesAt: staleResume,
    });
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s).toEqual({ tier: "free", state: "free" });
  });

  it("AUDIT #5: incomplete_expired + a stale pausedAt is free too (the guard is on liveness, not on one status)", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_drift2",
      stripeSubscriptionId: "sub_dead2", stripePriceId: "p",
      status: "incomplete_expired",
      pausedAt: new Date(), resumesAt: new Date(Date.now() + 30 * 24 * HOUR),
    });
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("free");
    expect(s.tier).toBe("free");
  });

  // NON-VACUITY for the pair above: the guard must refuse only DEAD
  // subscriptions. A paused subscription in DUNNING is still live and still
  // paused — if this went free, the fix would have taken the pause feature out
  // for every customer who paused after a failed payment.
  it("AUDIT #5 (the direction that must NOT change): a paused past_due subscription is still paused", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    const resume = new Date(Date.now() + 30 * 24 * HOUR);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_live_paused",
      stripeSubscriptionId: "sub_live_paused", stripePriceId: "p",
      status: "past_due", pausedAt: new Date(), resumesAt: resume,
    });
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("paused");
    expect(s.resumesAt?.getTime()).toBe(resume.getTime());
  });

  it("canceled → free", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_4", status: "canceled",
    });
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });
});

// EVIDENCE-RUN FINDING 1. Every case here is written against the payload shape
// the live Customer Portal actually produced on 2026-08-17, which the fixtures
// did not have: `cancel_at` set, `cancel_at_period_end` FALSE, status active.
describe("scheduledCancelAt (the ONE reader of Stripe's two cancellation fields)", () => {
  const END = new Date("2026-09-16T23:36:44.000Z");
  const PERIOD_END = new Date("2026-10-01T00:00:00.000Z");
  const live = {
    stripeSubscriptionId: "sub_live",
    status: "active",
    cancelAt: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: PERIOD_END,
  };

  it("THE LIVE SHAPE: cancel_at set with the legacy boolean FALSE still schedules an end", () => {
    // Against the pre-fix code this row read as "not cancelling" and the page
    // said nothing — the whole finding, in one assertion.
    expect(scheduledCancelAt({ ...live, cancelAt: END })).toEqual(END);
  });

  it("the LEGACY shape still resolves — to the period end, which is what the boolean means", () => {
    expect(
      scheduledCancelAt({ ...live, cancelAtPeriodEnd: true })
    ).toEqual(PERIOD_END);
  });

  it("cancel_at WINS over the boolean: it is the date Stripe will actually act on", () => {
    expect(
      scheduledCancelAt({ ...live, cancelAt: END, cancelAtPeriodEnd: true })
    ).toEqual(END);
  });

  it("an ordinary live subscription is not scheduled to end (the check is not vacuous)", () => {
    expect(scheduledCancelAt(live)).toBeNull();
  });

  it("a DEAD subscription is never 'scheduled to end' — it already has", () => {
    // Even if a stale value survived DEAD_SUBSCRIPTION_FIELDS, liveness is the
    // gate, so a canceled row cannot render a future end date.
    expect(
      scheduledCancelAt({ ...live, status: "canceled", cancelAt: END })
    ).toBeNull();
    expect(
      scheduledCancelAt({ ...live, stripeSubscriptionId: null, cancelAt: END })
    ).toBeNull();
  });

  it("getWorkspaceBillingState surfaces it on every LIVE state (active, paused, grace)", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_end", stripeSubscriptionId: "sub_end",
      stripePriceId: "p", status: "active", cancelAt: END,
    });
    const active = await getWorkspaceBillingState(db, ws, new Date());
    expect(active.state).toBe("active");
    expect(active.cancelAt).toEqual(END);

    await db
      .update(schema.subscriptions)
      .set({ pausedAt: new Date(), resumesAt: new Date(Date.now() + 24 * HOUR) })
      .where(eq(schema.subscriptions.workspaceId, ws));
    const paused = await getWorkspaceBillingState(db, ws, new Date());
    expect(paused.state).toBe("paused");
    expect(paused.cancelAt).toEqual(END);

    await db
      .update(schema.subscriptions)
      .set({
        pausedAt: null,
        resumesAt: null,
        status: "past_due",
        graceExpiresAt: new Date(Date.now() + 24 * HOUR),
      })
      .where(eq(schema.subscriptions.workspaceId, ws));
    const grace = await getWorkspaceBillingState(db, ws, new Date());
    expect(grace.state).toBe("grace");
    expect(grace.cancelAt).toEqual(END);
  });
});

describe("audit #8: the INCOMPLETE branch of the billing-state authority", () => {
  it("derives {tier: free, state: incomplete, pendingTier} — Free ENTITLEMENT, named pending plan", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    // `setup` seeds an EMPTY stripePriceMap, so the price has to be mapped here
    // or the branch resolves `unmapped_price` and this case would pass for the
    // wrong reason — proving only that an unknown price yields no pending tier.
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
      "state-test"
    );
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_inc",
      stripeSubscriptionId: "sub_inc",
      // A MAPPED paid price. The trap is exactly here: the workspace is trying
      // to buy Creator, and nothing has been collected. Returning `t.tier` from
      // this branch would hand a paid entitlement to a subscription that has
      // never taken a cent — the thing the docblock says must not happen, and
      // which no test caught until this one.
      stripePriceId: "price_creator",
      status: "incomplete",
    });
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s).toEqual({
      tier: "free",
      state: "incomplete",
      reason: undefined,
      pendingTier: "creator",
      cancelAt: undefined,
    });
    // Spelled out separately so the intent survives a future object reshape:
    // ENTITLEMENT is free, and the paid tier appears only as "pending".
    expect(s.tier).toBe("free");
    expect(s.pendingTier).toBe("creator");
  });

  it("an UNMAPPED price on an incomplete subscription names no pending tier and says why", async () => {
    const db = await createTestDb();
    const ws = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_inc2",
      stripeSubscriptionId: "sub_inc2",
      stripePriceId: "price_not_in_the_map",
      status: "incomplete",
    });
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("incomplete");
    expect(s.tier).toBe("free");
    // No invented plan name: we cannot say what they are buying, so we do not.
    expect(s.pendingTier).toBeUndefined();
    expect(s.reason).toBe("unmapped_price");
  });

  it("NON-VACUITY: incomplete_EXPIRED is not incomplete — it is dead, and derives to free", async () => {
    // The two statuses differ by one word and by everything that matters:
    // `incomplete` is recoverable (the customer can still pay), while
    // `incomplete_expired` is in IRREVERSIBLE_STATUSES. A branch keyed on a
    // prefix rather than the exact status would collapse them and offer a
    // "pay the invoice" remedy for a subscription Stripe has already closed.
    const db = await createTestDb();
    const ws = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_inc3",
      stripeSubscriptionId: "sub_inc3",
      stripePriceId: "price_creator",
      status: "incomplete_expired",
    });
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });

  it("a PAUSED incomplete subscription is still reported as paused — branch order is preserved", async () => {
    // `incomplete` is LIVE by `hasLiveStripeSubscription`, so the liveness-gated
    // pause branch above it wins. Asserted rather than assumed, because moving
    // the incomplete branch up would silently change which state a paused
    // workspace sees.
    const db = await createTestDb();
    const ws = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_inc4",
      stripeSubscriptionId: "sub_inc4",
      stripePriceId: "price_creator",
      status: "incomplete",
      pausedAt: new Date(),
    });
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("paused");
  });
});
