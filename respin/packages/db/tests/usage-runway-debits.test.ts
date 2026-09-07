import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { creditLedger } from "../src/billing-schema";
import { ensureUserWorkspace } from "../src/bootstrap";
import { creatorProfiles } from "../src/brain-schema";
import { ScopeForgeryError } from "../src/errors";
import { workspaces } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  burnByMode,
  monthlySpend,
  ProfileScope,
  usageRunwayDebits,
  withWorkspace,
} from "../src/with-workspace";

describe("usageRunwayDebits", () => {
  let db: TestDb;
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "runway-a");
    await seedAuthUser(db, "runway-b");
    workspaceA = (await ensureUserWorkspace(db, {
      authUserId: "runway-a",
      name: "Runway A",
    })).workspace.id;
    workspaceB = (await ensureUserWorkspace(db, {
      authUserId: "runway-b",
      name: "Runway B",
    })).workspace.id;
  });

  it("uses debit rows only, the exact open/closed interval, UTC dates, and one workspace", async () => {
    const asOf = new Date("2026-09-05T00:30:00.000Z");
    const windowStart = new Date("2026-09-02T00:30:00.000Z");
    await db.insert(creditLedger).values([
      // Open lower bound: excluded.
      { workspaceId: workspaceA, delta: -100, kind: "debit", createdAt: windowStart },
      { workspaceId: workspaceA, delta: -2, kind: "debit", createdAt: new Date("2026-09-02T23:55:00.000Z") },
      { workspaceId: workspaceA, delta: -3, kind: "debit", createdAt: new Date("2026-09-03T00:05:00.000Z") },
      // A second debit on the same UTC date contributes to spend, not days.
      { workspaceId: workspaceA, delta: -5, kind: "debit", createdAt: new Date("2026-09-03T23:59:00.000Z") },
      // Closed upper bound: included.
      { workspaceId: workspaceA, delta: -7, kind: "debit", createdAt: asOf },
      // Non-debit ledger movements never enter runway burn.
      { workspaceId: workspaceA, delta: 11, kind: "adjust", reasonCode: "fixture", createdAt: new Date("2026-09-04T00:00:00.000Z") },
      // Same dates, foreign workspace: excluded by the minted scope.
      { workspaceId: workspaceB, delta: -1000, kind: "debit", createdAt: new Date("2026-09-04T00:00:00.000Z") },
    ]);
    const scope = await withWorkspace(db, { authUserId: "runway-a" });

    await expect(usageRunwayDebits(db, scope, asOf, 3)).resolves.toEqual({
      totalDebit: 17,
      distinctDebitDays: 3,
      windowStart,
      asOf,
    });
  });

  it("sees writes made in the caller's transaction", async () => {
    const asOf = new Date("2026-09-05T12:00:00.000Z");
    const scope = await withWorkspace(db, { authUserId: "runway-a" });
    await db.transaction(async (tx) => {
      await tx.insert(creditLedger).values({
        workspaceId: workspaceA,
        delta: -9,
        kind: "debit",
        createdAt: new Date("2026-09-05T11:00:00.000Z"),
      });
      await expect(usageRunwayDebits(tx, scope, asOf, 1)).resolves.toMatchObject({
        totalDebit: 9,
        distinctDebitDays: 1,
      });
    });
  });

  it("rejects an already-minted scope after the workspace is tombstoned", async () => {
    const scope = await withWorkspace(db, { authUserId: "runway-a" });
    await db
      .update(workspaces)
      .set({
        lifecycleState: "tombstoned",
        lifecycleVersion: 2,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceA));
    const asOf = new Date("2026-09-05T12:00:00.000Z");

    await expect(monthlySpend(db, scope, new Date(0))).rejects.toThrow(
      "lifecycle_refused:workspace_access_tombstoned_or_suspended"
    );
    await expect(burnByMode(db, scope, new Date(0))).rejects.toThrow(
      "lifecycle_refused:workspace_access_tombstoned_or_suspended"
    );
    await expect(usageRunwayDebits(db, scope, asOf, 1)).rejects.toThrow(
      "lifecycle_refused:workspace_access_tombstoned_or_suspended"
    );
  });

  it("refuses both a forged scope and a genuine scope at the wrong grain", async () => {
    const asOf = new Date("2026-09-05T12:00:00.000Z");
    await expect(usageRunwayDebits(
      db,
      { workspaceId: workspaceA } as never,
      asOf,
      1
    )).rejects.toBeInstanceOf(ScopeForgeryError);

    const workspaceScope = await withWorkspace(db, { authUserId: "runway-a" });
    const [profile] = await db.insert(creatorProfiles).values({
      workspaceId: workspaceA,
      displayName: "Wrong grain",
    }).returning();
    const profileScope = await ProfileScope.mint(db, workspaceScope, profile.id);
    await expect(
      usageRunwayDebits(db, profileScope as never, asOf, 1)
    ).rejects.toBeInstanceOf(ScopeForgeryError);
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses an invalid trailing window: %s", async (days) => {
    const scope = await withWorkspace(db, { authUserId: "runway-a" });
    await expect(
      usageRunwayDebits(db, scope, new Date("2026-09-05T00:00:00.000Z"), days)
    ).rejects.toThrow("positive integer");
  });
});
