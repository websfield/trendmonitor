// `pastedReferenceInPlan` TAKES NO WORKSPACE MONEY LOCK (launch L2 code gate,
// billing B-2 / audit P8-R1).
//
// THE INSTRUMENT: a database that REFUSES every transaction and every raw
// statement. The workspace money lock is `takeWorkspaceLock`'s
// `execute(pg_advisory_xact_lock(...))` (`clock.ts`), and `deriveBalance`
// opens a transaction to take it — so a read that completes against this
// database cannot have taken the lock. NON-VACUITY: `pastedReferenceQuote`,
// which derives the balance, is refused by the same database.
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  ensureUserWorkspace,
  seedAuthUser,
  seedDb,
  subscriptions,
  withWorkspace,
  type DbLike,
  type TestDb,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { pastedReferenceInPlan, pastedReferenceQuote } from "../src/pasted-reference";

class LockPathTakenError extends Error {}

/** `db` with `transaction` and `execute` refused — reads through `select` only. */
function lockRefusing(db: TestDb): DbLike {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "transaction" || prop === "execute") {
        return () => {
          throw new LockPathTakenError(`db.${String(prop)} was called`);
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as DbLike;
}

describe("pastedReferenceInPlan", () => {
  let db: TestDb;
  let ws: VerifiedWorkspaceId;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" });
    ws = (await withWorkspace(db, { authUserId: "user_a" })).workspaceId;
  });

  it("answers from the tier alone, with no transaction and no raw statement — so no money lock", async () => {
    expect(await pastedReferenceInPlan(lockRefusing(db), ws, new Date())).toBe(false);
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(db, { ...content, stripePriceMap: { price_creator: "creator" } }, "test-admin");
    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_t",
      stripeSubscriptionId: "sub_t",
      stripePriceId: "price_creator",
      status: "active",
    });
    expect(await pastedReferenceInPlan(lockRefusing(db), ws, new Date())).toBe(true);
    // NON-VACUITY: the quote derives the balance, and that path is refused.
    await expect(pastedReferenceQuote(lockRefusing(db), ws, new Date())).rejects.toBeInstanceOf(
      LockPathTakenError
    );
  });
});
