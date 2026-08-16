// The T1 breach-attempting suite (tenancy skill checklist item 1): every scoped
// accessor is ATTEMPTED against the other workspace and must refuse or return
// nothing foreign. Enumeration is programmatic over the accessor map (AC-1),
// with a completeness assertion so a new accessor without a validator fails
// loudly (AC-7), instead of escaping to reviewer memory.
import { beforeEach, describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { creditLedger, subscriptions } from "../src/billing-schema";
import {
  LEDGER_PAGE_MAX,
  WorkspaceAccessError,
  withWorkspace,
  type WorkspaceScope,
} from "../src/with-workspace";

const HOUR = 3_600_000;

describe("withWorkspace tenancy scope", () => {
  let db: TestDb;
  let aWorkspaceId: string;
  let bWorkspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedAuthUser(db, "user_b");
    aWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "user_a", name: "A" })
    ).workspace.id;
    bWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "user_b", name: "B" })
    ).workspace.id;
    // Billing rows for BOTH workspaces: the accessor loop below asserts each
    // accessor returns at least one row, so an empty table would make the
    // breach validators vacuous — a suite that proves isolation by returning
    // nothing proves nothing (the phase-2 lesson, applied here).
    await db.insert(subscriptions).values([
      { workspaceId: aWorkspaceId, stripeCustomerId: "cus_a", status: "active" },
      { workspaceId: bWorkspaceId, stripeCustomerId: "cus_b", status: "active" },
    ]);
    await db.insert(creditLedger).values([
      {
        workspaceId: aWorkspaceId,
        delta: 250,
        kind: "grant",
        refType: "invoice",
        refId: "in_a",
        expiresAt: new Date(Date.now() + 24 * HOUR),
      },
      {
        workspaceId: bWorkspaceId,
        delta: 999,
        kind: "grant",
        refType: "invoice",
        refId: "in_b",
        expiresAt: new Date(Date.now() + 24 * HOUR),
      },
    ]);
  });

  /**
   * One breach validator per accessor, keyed by accessor name. The rows an
   * accessor returns must never reference the foreign workspace.
   */
  const breachValidators: Record<
    keyof WorkspaceScope["accessors"],
    (rows: unknown[], own: string, foreign: string) => void
  > = {
    workspace: (rows, own, foreign) => {
      for (const row of rows as { id: string }[]) {
        expect(row.id).toBe(own);
        expect(row.id).not.toBe(foreign);
      }
    },
    members: (rows, own, foreign) => {
      for (const row of rows as { workspaceId: string }[]) {
        expect(row.workspaceId).toBe(own);
        expect(row.workspaceId).not.toBe(foreign);
      }
    },
    subscription: (rows, own, foreign) => {
      for (const row of rows as { workspaceId: string }[]) {
        expect(row.workspaceId).toBe(own);
        expect(row.workspaceId).not.toBe(foreign);
      }
    },
    ledger: (rows, own, foreign) => {
      for (const row of rows as { workspaceId: string }[]) {
        expect(row.workspaceId).toBe(own);
        expect(row.workspaceId).not.toBe(foreign);
      }
    },
  };

  /**
   * The arguments each accessor needs, typed against the accessor map itself —
   * so an accessor that GAINS a parameter fails to compile here rather than
   * being silently invoked with `undefined` (the round-1 shape of "the loop
   * exercised something, just not what the name said").
   */
  const accessorArgs: {
    [K in keyof WorkspaceScope["accessors"]]: Parameters<
      WorkspaceScope["accessors"][K]
    >;
  } = {
    workspace: [],
    members: [],
    subscription: [],
    ledger: [{ limit: 50 }],
  };

  const invoke = (
    scope: WorkspaceScope,
    name: keyof WorkspaceScope["accessors"]
  ): Promise<unknown[]> =>
    (
      scope.accessors[name] as (...args: unknown[]) => Promise<unknown[]>
    )(...(accessorArgs[name] as unknown[]));

  it("covers every scoped accessor (AC-7 completeness assertion)", async () => {
    const scope = await withWorkspace(db, { authUserId: "user_a" });
    expect(Object.keys(breachValidators).sort()).toEqual(
      Object.keys(scope.accessors).sort()
    );
    // ...and the ARGS map covers the same set, so a new accessor cannot join
    // the loop below without someone deciding how it is called.
    expect(Object.keys(accessorArgs).sort()).toEqual(
      Object.keys(scope.accessors).sort()
    );
  });

  it("every accessor returns only the scope's own workspace rows (AC-1)", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const accessorNames = Object.keys(
      scopeA.accessors
    ) as (keyof WorkspaceScope["accessors"])[];
    expect(accessorNames.length).toBeGreaterThan(0);
    for (const name of accessorNames) {
      const rows = await invoke(scopeA, name);
      expect(rows.length, `${name} returned no rows — validator would be vacuous`).toBeGreaterThan(0);
      breachValidators[name](rows, aWorkspaceId, bWorkspaceId);
    }
  });

  it("and the SAME loop run as workspace B sees only B (the breach is attempted from both sides)", async () => {
    const scopeB = await withWorkspace(db, { authUserId: "user_b" });
    for (const name of Object.keys(
      scopeB.accessors
    ) as (keyof WorkspaceScope["accessors"])[]) {
      const rows = await invoke(scopeB, name);
      expect(rows.length).toBeGreaterThan(0);
      breachValidators[name](rows, bWorkspaceId, aWorkspaceId);
    }
  });

  it("ledger() CLAMPS the page size — an unbounded caller cannot read the whole table", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const extra = Array.from({ length: 9 }, (_, i) => ({
      workspaceId: aWorkspaceId,
      delta: 1,
      kind: "grant" as const,
      refType: "invoice",
      refId: `in_a_${i}`,
      expiresAt: new Date(Date.now() + 24 * HOUR),
    }));
    await db.insert(creditLedger).values(extra);
    expect(await scopeA.accessors.ledger({ limit: 3 })).toHaveLength(3);
    // A caller asking for more than the ceiling gets the ceiling, not the table.
    expect(LEDGER_PAGE_MAX).toBeLessThan(10_000);
    expect(
      (await scopeA.accessors.ledger({ limit: 10_000 })).length
    ).toBeLessThanOrEqual(LEDGER_PAGE_MAX);
    // ...and a nonsense page size still returns a bounded, non-negative page.
    expect(await scopeA.accessors.ledger({ limit: 0 })).toHaveLength(1);
    expect(
      await scopeA.accessors.ledger({ limit: 5, offset: -3 })
    ).toHaveLength(5);
  });

  it("ledger() clamps NaN and Infinity — the shapes a URL actually produces (round-2 CHANGE 4)", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const extra = Array.from({ length: 9 }, (_, i) => ({
      workspaceId: aWorkspaceId,
      delta: 1,
      kind: "grant" as const,
      refType: "invoice",
      refId: `in_nan_${i}`,
      expiresAt: new Date(Date.now() + 24 * HOUR),
    }));
    await db.insert(creditLedger).values(extra);
    const total = (await scopeA.accessors.ledger({ limit: LEDGER_PAGE_MAX }))
      .length;
    // The premise: there is more than one row, so "the whole table" and "one
    // clamped row" are distinguishable answers.
    expect(total).toBeGreaterThan(1);

    // `Number(searchParams.rows)` on absent or garbage input is NaN, and
    // `Math.min(Math.max(1, NaN), 200)` is NaN — drizzle then drops the LIMIT
    // from the SQL entirely and the accessor served the ENTIRE table while the
    // doc-comment said the limit "is CLAMPED rather than trusted".
    for (const bad of [Number("abc"), NaN, Infinity, -Infinity]) {
      const rows = await scopeA.accessors.ledger({ limit: bad });
      expect(rows.length, `limit ${bad} must stay bounded`).toBeLessThanOrEqual(
        LEDGER_PAGE_MAX
      );
      expect(
        rows.length,
        `limit ${bad} must not serve the whole table`
      ).toBeLessThan(total);
    }
    // A non-finite OFFSET must not become a NaN OFFSET either (which Postgres
    // rejects outright) — it degrades to 0, i.e. the newest page.
    const offsetNaN = await scopeA.accessors.ledger({
      limit: 3,
      offset: Number("nope"),
    });
    expect(offsetNaN).toHaveLength(3);
    expect(offsetNaN.map((r) => r.id)).toEqual(
      (await scopeA.accessors.ledger({ limit: 3, offset: 0 })).map((r) => r.id)
    );
  });

  it("ledger() pages newest-first and the offset does not re-serve the same row", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const base = Date.now();
    await db.insert(creditLedger).values([
      {
        workspaceId: aWorkspaceId, delta: 1, kind: "grant",
        refType: "invoice", refId: "in_older",
        createdAt: new Date(base - 2 * HOUR),
        expiresAt: new Date(base + 24 * HOUR),
      },
      {
        workspaceId: aWorkspaceId, delta: 2, kind: "grant",
        refType: "invoice", refId: "in_newer",
        createdAt: new Date(base + 2 * HOUR),
        expiresAt: new Date(base + 24 * HOUR),
      },
    ]);
    const firstPage = await scopeA.accessors.ledger({ limit: 1 });
    expect(firstPage[0].refId).toBe("in_newer");
    const secondPage = await scopeA.accessors.ledger({ limit: 1, offset: 1 });
    expect(secondPage[0].refId).not.toBe("in_newer");
  });

  it("refuses an explicit request for a workspace the user is not a member of (AC-1 breach attempt)", async () => {
    await expect(
      withWorkspace(db, { authUserId: "user_b", workspaceId: aWorkspaceId })
    ).rejects.toThrow(WorkspaceAccessError);
  });

  it("honors an explicit request for the user's own workspace (verify-then-scope)", async () => {
    const scope = await withWorkspace(db, {
      authUserId: "user_b",
      workspaceId: bWorkspaceId,
    });
    expect(scope.workspaceId).toBe(bWorkspaceId);
    expect(scope.role).toBe("owner");
  });

  it("refuses an unknown user", async () => {
    await expect(
      withWorkspace(db, { authUserId: "user_never_bootstrapped" })
    ).rejects.toThrow(/unknown user/);
  });

  it("refuses a user with no workspace (bootstrap-first)", async () => {
    await seedAuthUser(db, "user_no_ws");
    await db.insert((await import("../src/schema")).users).values({
      authUserId: "user_no_ws",
    });
    await expect(
      withWorkspace(db, { authUserId: "user_no_ws" })
    ).rejects.toThrow(/no workspace/);
  });

  it("requires explicit selection when the user belongs to multiple workspaces", async () => {
    const schema = await import("../src/schema");
    const [userA] = await db
      .select()
      .from(schema.users)
      .where(
        (await import("drizzle-orm")).eq(schema.users.authUserId, "user_a")
      );
    // Give A a second membership (B's workspace) to simulate M2+/Studio shape.
    await db.insert(schema.memberships).values({
      userId: userA.id,
      workspaceId: bWorkspaceId,
      role: "viewer",
    });
    await expect(
      withWorkspace(db, { authUserId: "user_a" })
    ).rejects.toThrow(/explicit workspaceId is required/);
    // ...and the explicit path still verifies membership before scoping.
    const scope = await withWorkspace(db, {
      authUserId: "user_a",
      workspaceId: bWorkspaceId,
    });
    expect(scope.role).toBe("viewer");
  });
});
