import { count, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapInTx, ensureUserWorkspace } from "../src/bootstrap";
import { memberships, users, workspaces } from "../src/schema";
import { deletionOperations } from "../src/lifecycle-schema";
import { LockOrderError, lockWorkspaceMembershipGraph } from "../src/membership-lifecycle";
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

  // RE-DECIDED (R-161, P5-R2), not deleted: this pin is now the case with NO
  // undecided deletion — a tombstoned workspace whose deletion completed or
  // never existed is not an authority, and a fresh workspace is minted. The
  // case WITH a non-terminal deletion is the next test: no replacement.
  it("repairs a tombstoned-only bootstrap graph with NO undecided deletion with a fresh active workspace", async () => {
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

  it("R-161: a tombstoned workspace whose deletion is NOT terminal is the existing authority — no replacement is minted", async () => {
    const first = await ensureUserWorkspace(db, PARAMS);
    await db
      .update(workspaces)
      .set({ lifecycleState: "tombstoned", lifecycleVersion: first.workspace.lifecycleVersion + 1 })
      .where(eq(workspaces.id, first.workspace.id));
    for (const state of ["journal_pending", "tombstoned", "external_actions_pending", "grace", "blocked", "erasing"] as const) {
      await db.delete(deletionOperations);
      await db.insert(deletionOperations).values({
        scope: "workspace",
        targetKey: `workspace:${first.workspace.id}`,
        workspaceId: first.workspace.id,
        requesterUserId: first.user.id,
        requesterDigest: "a".repeat(64),
        requestSessionDigest: "b".repeat(64),
        requestMembershipVersion: 1,
        requestWorkspaceLifecycleVersion: 1,
        idempotencyKey: `bootstrap-${state}`,
        payloadHash: "c".repeat(64),
        state,
        ...(state === "blocked" ? { blockedResumeState: "external_actions_pending" as const } : {}),
      });
      const result = await ensureUserWorkspace(db, PARAMS);
      expect(result, state).toMatchObject({
        created: false,
        workspace: { id: first.workspace.id, lifecycleState: "tombstoned" },
        membership: { id: first.membership.id },
      });
      expect(await tableCounts(), state).toEqual({ users: 1, workspaces: 1, memberships: 1 });
    }
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

  // AUDIT PHASE 8 (P8-A3, R-177): the no-mint path every product page runs is a
  // READER — it holds the membership-graph locks only in the SHARED form — and
  // the mint path never upgrades in place.
  it("P8-A3: the NO-MINT path's transaction lock ledger records exactly two keys, both shared (the pg_locks modes are asserted on real Postgres)", async () => {
    const first = await ensureUserWorkspace(db, PARAMS);
    const held = await db.transaction(async (tx) => {
      const result = await bootstrapInTx(tx, PARAMS, "shared");
      expect(result.created).toBe(false);
      const r = (await tx.execute(
        sql`SELECT current_setting('respin.membership_keys', true) AS keys`
      )) as unknown as { rows: { keys: string }[] };
      return JSON.parse(r.rows[0].keys) as Record<string, string>;
    });
    expect(held).toEqual({
      [`identity-membership:${first.user.id}`]: "shared",
      [`workspace-membership:${first.workspace.id}`]: "shared",
    });
  });

  // The pg_locks half of gate L6 (the lock MODE Postgres records) is on real
  // Postgres: PGlite's pg_locks lists no advisory locks.
  // `tests/render-under-stripe-lock.docker.test.ts` "gate L6".

  it("P8-A3 (gate L6): ensureUserWorkspace's FIRST transaction is the READ ONLY shared path — its lock statements are the shared form, none exclusive", async () => {
    await ensureUserWorkspace(db, PARAMS);
    // Record every transaction ensureUserWorkspace opens: its config, and the
    // text of every lock statement it executes.
    const opened: { config: unknown; locks: string[] }[] = [];
    const recording = new Proxy(db, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (prop !== "transaction") {
          return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        }
        return (fn: (tx: unknown) => Promise<unknown>, config?: unknown) => {
          const entry = { config, locks: [] as string[] };
          opened.push(entry);
          return target.transaction(
            (tx) =>
              fn(
                new Proxy(tx, {
                  get(t, p, r) {
                    const v = Reflect.get(t, p, r) as unknown;
                    if (p !== "execute") return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
                    return (query: unknown) => {
                      const text = JSON.stringify(query);
                      if (text.includes("pg_advisory")) entry.locks.push(text);
                      return (v as (q: unknown) => unknown).call(t, query);
                    };
                  },
                })
              ),
            config as never
          );
        };
      },
    });
    const result = await ensureUserWorkspace(recording as typeof db, PARAMS);
    expect(result.created).toBe(false);
    // One transaction: the bounded, read-only shared attempt found the authority.
    expect(opened).toHaveLength(1);
    expect(opened[0].config).toEqual({ accessMode: "read only" });
    expect(opened[0].locks.length).toBe(2);
    for (const lock of opened[0].locks) {
      expect(lock).toContain("pg_advisory_xact_lock_shared");
    }
  });

  it("P8-A3: with no authority, the shared attempt MINTS NOTHING and signals; the mint runs in a FRESH exclusive transaction", async () => {
    // The shared attempt alone: it refuses to mint (and rolls back its user row).
    await expect(
      db.transaction((tx) => bootstrapInTx(tx, PARAMS, "shared"))
    ).rejects.toThrow(/mint in a fresh exclusive transaction/);
    expect(await tableCounts()).toEqual({ users: 0, workspaces: 0, memberships: 0 });
    // The public entry retries exclusively and mints exactly once.
    const minted = await ensureUserWorkspace(db, PARAMS);
    expect(minted.created).toBe(true);
    expect(await tableCounts()).toEqual({ users: 1, workspaces: 1, memberships: 1 });
  });

  it("P8-A3: an IN-PLACE upgrade after the shared path is refused by the lock-order guard (why the mint never does it)", async () => {
    const first = await ensureUserWorkspace(db, PARAMS);
    let caught: unknown;
    await db.transaction(async (tx) => {
      await bootstrapInTx(tx, PARAMS, "shared");
      try {
        await lockWorkspaceMembershipGraph(tx, first.workspace.id, "exclusive");
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(LockOrderError);
    expect((caught as LockOrderError).reason).toBe("upgrade");
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
