import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapInTx, ensureUserWorkspace } from "../src/bootstrap";
import { memberships, users, workspaces } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";

// The conflict tests here are the SERIALIZED approximation (pre-seeded winner)
// on single-session PGlite; TRUE interleaving is proven by the real-Postgres
// suite in tests/concurrency.docker.test.ts (M1 phase 1 — this retired the
// former SHORTCUT marker and its M0 deferral).

const PARAMS = {
  authUserId: "user_auth_1",
  name: "One",
};

describe("ensureUserWorkspace bootstrap", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    // D-M1-5: the users.auth_user_id FK requires the auth row to exist first —
    // in production a Better Auth session guarantees it.
    await seedAuthUser(db, PARAMS.authUserId);
  });

  const tableCounts = async () => ({
    users: (await db.select({ n: count() }).from(users))[0].n,
    workspaces: (await db.select({ n: count() }).from(workspaces))[0].n,
    memberships: (await db.select({ n: count() }).from(memberships))[0].n,
  });

  it("creates user + personal workspace + owner membership on first call", async () => {
    const result = await ensureUserWorkspace(db, PARAMS);
    expect(result.created).toBe(true);
    expect(result.membership.role).toBe("owner");
    expect(result.workspace.name).toBe("One's workspace");
    expect(await tableCounts()).toEqual({
      users: 1,
      workspaces: 1,
      memberships: 1,
    });
  });

  it("is idempotent: two sequential calls yield exactly one workspace (AC-2)", async () => {
    const first = await ensureUserWorkspace(db, PARAMS);
    const second = await ensureUserWorkspace(db, PARAMS);
    expect(second.created).toBe(false);
    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.membership.id).toBe(first.membership.id);
    expect(await tableCounts()).toEqual({
      users: 1,
      workspaces: 1,
      memberships: 1,
    });
  });

  it("never treats a deletion-suspended membership as the active bootstrap workspace", async () => {
    const first = await ensureUserWorkspace(db, PARAMS);
    await db
      .update(memberships)
      .set({
        lifecycleState: "deletion_suspended",
        suspendedRole: first.membership.role,
        suspendedVersion: first.membership.version,
        suspensionOperationId: "00000000-0000-4000-8000-000000000001",
        version: first.membership.version + 1,
      })
      .where(eq(memberships.id, first.membership.id));

    const repaired = await ensureUserWorkspace(db, PARAMS);
    expect(repaired.created).toBe(true);
    expect(repaired.workspace.id).not.toBe(first.workspace.id);
    expect(repaired.membership).toMatchObject({
      lifecycleState: "active",
      role: "owner",
    });
    expect(await tableCounts()).toEqual({
      users: 1,
      workspaces: 2,
      memberships: 2,
    });
  });

  it("skips a tombstoned oldest workspace and returns the next active membership", async () => {
    const first = await ensureUserWorkspace(db, PARAMS);
    const [secondWorkspace] = await db
      .insert(workspaces)
      .values({ name: "Still active" })
      .returning();
    const [secondMembership] = await db
      .insert(memberships)
      .values({
        userId: first.user.id,
        workspaceId: secondWorkspace.id,
        role: "owner",
      })
      .returning();
    await db
      .update(workspaces)
      .set({
        lifecycleState: "tombstoned",
        lifecycleVersion: first.workspace.lifecycleVersion + 1,
      })
      .where(eq(workspaces.id, first.workspace.id));

    const result = await ensureUserWorkspace(db, PARAMS);
    expect(result).toMatchObject({
      created: false,
      workspace: { id: secondWorkspace.id, lifecycleState: "active" },
      membership: { id: secondMembership.id, lifecycleState: "active" },
    });
    expect(await tableCounts()).toEqual({
      users: 1,
      workspaces: 2,
      memberships: 2,
    });
  });

  it("repairs a tombstoned-only bootstrap graph with a fresh active workspace", async () => {
    const first = await ensureUserWorkspace(db, PARAMS);
    await db
      .update(workspaces)
      .set({
        lifecycleState: "tombstoned",
        lifecycleVersion: first.workspace.lifecycleVersion + 1,
      })
      .where(eq(workspaces.id, first.workspace.id));

    const result = await ensureUserWorkspace(db, PARAMS);
    expect(result.created).toBe(true);
    expect(result.workspace).toMatchObject({ lifecycleState: "active" });
    expect(result.workspace.id).not.toBe(first.workspace.id);
    expect(result.membership).toMatchObject({
      lifecycleState: "active",
      role: "owner",
    });
    expect(await tableCounts()).toEqual({
      users: 1,
      workspaces: 2,
      memberships: 2,
    });
  });

  it("serialized-conflict: a pre-seeded existing user resolves, creates nothing (AC-2)", async () => {
    // Simulate the losing side of a concurrent first login: the "winner"
    // already committed user + workspace + membership.
    const winner = await ensureUserWorkspace(db, PARAMS);
    // The loser's insert conflicts on auth_user_id → resolve-existing branch:
    // it must return the winner's workspace and create NO second workspace.
    const loser = await ensureUserWorkspace(db, {
      ...PARAMS,
      // same identity, possibly different profile details in the race
      name: "One-Race",
    });
    expect(loser.created).toBe(false);
    expect(loser.workspace.id).toBe(winner.workspace.id);
    expect(await tableCounts()).toEqual({
      users: 1,
      workspaces: 1,
      memberships: 1,
    });
  });

  it("conflict with user-but-no-membership repairs within the same transaction", async () => {
    // A user row without membership (e.g. interrupted earlier bootstrap):
    // the resolve-existing branch must repair, not duplicate the user.
    await db.insert(users).values({ authUserId: PARAMS.authUserId });
    const result = await ensureUserWorkspace(db, PARAMS);
    expect(result.created).toBe(true);
    expect(await tableCounts()).toEqual({
      users: 1,
      workspaces: 1,
      memberships: 1,
    });
  });

  it("rolls back cleanly: a forced failure leaves zero partial rows (AC-2)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await bootstrapInTx(tx, PARAMS);
        throw new Error("forced failure after bootstrap writes");
      })
    ).rejects.toThrow("forced failure");
    expect(await tableCounts()).toEqual({
      users: 0,
      workspaces: 0,
      memberships: 0,
    });
  });

  it("stores the auth identity it was given (and nothing else — no email copy, D-M1-5)", async () => {
    await ensureUserWorkspace(db, PARAMS);
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, PARAMS.authUserId));
    expect(u.authUserId).toBe(PARAMS.authUserId);
    expect(Object.keys(u).sort()).toEqual(
      ["id", "authUserId", "lifecycleState", "createdAt", "updatedAt"].sort()
    );
  });
});
