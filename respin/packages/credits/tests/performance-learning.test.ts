import { describe, expect, it } from "vitest";
import {
  CONFIG_V1_SEED,
  createTestDb,
  schema,
  seedDb,
  trustWorkspaceId,
  type DbLike,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import {
  performanceLearningEntitlementFor,
  resolvePerformanceLearningEntitlement,
  type PerformanceLearningEntitlements,
} from "../src/mode-access";
import { PerformanceLearningConfigUnavailableError } from "../src/errors";
import type { BillingState } from "../src/state";

const AT = new Date("2026-09-05T12:00:00.000Z");
const INVERTED: PerformanceLearningEntitlements = {
  free: "full",
  creator: "view_only",
  pro: "full",
  studio: "view_only",
};

describe("pure performance-learning entitlement matrix (C2 / R-112)", () => {
  it("uses exact config entries even when Free is full and paid tiers are view-only", () => {
    const cases: Array<[BillingState, "full" | "view_only"]> = [
      [{ tier: "free", state: "free" }, "full"],
      [{ tier: "free", state: "incomplete", pendingTier: "creator" }, "full"],
      [{ tier: "creator", state: "active" }, "view_only"],
      [
        {
          tier: "creator",
          state: "grace",
          graceExpiresAt: new Date(AT.getTime() + 1),
        },
        "view_only",
      ],
      [{ tier: "studio", state: "paused" }, "view_only"],
      [{ tier: "pro", state: "active" }, "full"],
    ];
    for (const [state, expected] of cases) {
      expect(resolvePerformanceLearningEntitlement(state, INVERTED)).toBe(
        expected
      );
    }
  });

  it("refuses unmapped prices, absent live tiers, absent map entries, and unknown states", () => {
    expect(() =>
      resolvePerformanceLearningEntitlement(
        { tier: "free", state: "active", reason: "unmapped_price" },
        INVERTED
      )
    ).toThrow(PerformanceLearningConfigUnavailableError);
    expect(() =>
      resolvePerformanceLearningEntitlement(
        { tier: "free", state: "active" },
        INVERTED
      )
    ).toThrow(PerformanceLearningConfigUnavailableError);
    expect(() =>
      resolvePerformanceLearningEntitlement(
        { tier: "studio", state: "active" },
        { ...INVERTED, studio: undefined } as unknown as PerformanceLearningEntitlements
      )
    ).toThrow(PerformanceLearningConfigUnavailableError);
    expect(() =>
      resolvePerformanceLearningEntitlement(
        { tier: "free", state: "unknown" } as unknown as BillingState,
        INVERTED
      )
    ).toThrow(PerformanceLearningConfigUnavailableError);
  });
});

async function setup(
  config: PerformanceLearningEntitlements = INVERTED
): Promise<{ db: DbLike; workspaceId: VerifiedWorkspaceId }> {
  const db = await createTestDb();
  await seedDb(db);
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ name: "Performance learning" })
    .returning();
  const workspaceId = trustWorkspaceId(workspace.id);
  await appendConfigVersion(
    db,
    {
      ...CONFIG_V1_SEED,
      stripePriceMap: {
        price_creator: "creator",
        price_pro: "pro",
        price_studio: "studio",
      },
      performanceLearning: config,
    },
    "test-admin"
  );
  return { db, workspaceId };
}

async function subscription(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  values: Partial<typeof schema.subscriptions.$inferInsert>
) {
  await db.insert(schema.subscriptions).values({
    workspaceId,
    stripeCustomerId: `cus_${values.status ?? "case"}`,
    stripeSubscriptionId: `sub_${values.status ?? "case"}`,
    stripePriceId: "price_creator",
    status: "active",
    ...values,
  });
}

describe("performanceLearningEntitlementFor authoritative billing matrix", () => {
  it("maps active, unexpired grace, and paused paid states to their exact configured tier", async () => {
    const liveCases = [
      { status: "active", stripePriceId: "price_creator" },
      {
        status: "past_due",
        stripePriceId: "price_pro",
        graceExpiresAt: new Date(AT.getTime() + 60_000),
      },
      {
        status: "active",
        stripePriceId: "price_studio",
        pausedAt: AT,
      },
    ];
    const expected = ["view_only", "full", "view_only"];
    for (let i = 0; i < liveCases.length; i += 1) {
      const { db, workspaceId } = await setup();
      await subscription(db, workspaceId, liveCases[i]);
      expect(await performanceLearningEntitlementFor(db, workspaceId, AT)).toBe(
        expected[i]
      );
    }
  });

  it("uses configured Free for absence, dead, expired grace, and incomplete", async () => {
    const absent = await setup();
    expect(
      await performanceLearningEntitlementFor(
        absent.db,
        absent.workspaceId,
        AT
      )
    ).toBe("full");

    const fallbackCases = [
      { status: "canceled" },
      {
        status: "past_due",
        graceExpiresAt: new Date(AT.getTime() - 1),
      },
      { status: "incomplete" },
    ];
    for (const values of fallbackCases) {
      const { db, workspaceId } = await setup();
      await subscription(db, workspaceId, values);
      expect(await performanceLearningEntitlementFor(db, workspaceId, AT)).toBe(
        "full"
      );
    }
  });

  it("turns unmapped, missing, and invalid config into the named operational refusal", async () => {
    const unmapped = await setup();
    await subscription(unmapped.db, unmapped.workspaceId, {
      stripePriceId: "price_unknown",
    });
    await expect(
      performanceLearningEntitlementFor(unmapped.db, unmapped.workspaceId, AT)
    ).rejects.toMatchObject({
      name: "PerformanceLearningConfigUnavailableError",
      reason: "unmapped_price",
    });

    const missingDb = await createTestDb();
    const [missingWorkspace] = await missingDb
      .insert(schema.workspaces)
      .values({ name: "Missing config" })
      .returning();
    await expect(
      performanceLearningEntitlementFor(
        missingDb,
        trustWorkspaceId(missingWorkspace.id),
        AT
      )
    ).rejects.toMatchObject({ reason: "config_unavailable" });

    const invalidDb = await createTestDb();
    const [invalidWorkspace] = await invalidDb
      .insert(schema.workspaces)
      .values({ name: "Invalid config" })
      .returning();
    await invalidDb.insert(schema.configVersions).values({
      content: {},
      createdBy: "test-admin",
    });
    await expect(
      performanceLearningEntitlementFor(
        invalidDb,
        trustWorkspaceId(invalidWorkspace.id),
        AT
      )
    ).rejects.toMatchObject({ reason: "config_unavailable" });
  });
});
