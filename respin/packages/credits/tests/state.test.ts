// Tier/state machine (D-M1-4): lazy grace, read-time tier derivation,
// fail-closed unmapped price with a named reason.
import { describe, expect, it } from "vitest";
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
import { getWorkspaceBillingState } from "../src/state";

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
      status: "active", pausedAt: new Date(), resumesAt: resume,
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
