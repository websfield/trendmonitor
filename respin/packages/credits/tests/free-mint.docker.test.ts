// R17's CONCURRENCY HALF, on real Postgres with two connections.
//
// The in-process suite proves the mint is idempotent when the two reads are
// SEQUENTIAL. That is not the property R17 rests on. The mint is a write on a
// read path, so the interesting question is what two connections do when they
// derive a Free workspace's balance for the first time at the same instant —
// and PGlite cannot ask it, because it is single-connection and its race is a
// sequence.
//
// THE ANSWER MUST COME FROM THE SCHEMA, NOT FROM APPLICATION CODE. An
// application-level "have we granted this month?" read is a read-then-write on
// a table with no constraint behind it, and two connections both read no. R-63
// records that doubling being MEASURED with the index dropped inside a
// rolled-back transaction; this file is the other direction — the index in
// place, the race real, and exactly one grant.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  createDockerTestDb,
  creditLedger,
  ensureUserWorkspace,
  seedAuthUser,
  seedDb,
  subscriptions,
  withWorkspace,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { deriveBalance } from "../src/balance";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
const FREE = CONFIG_V1_SEED.allowances.free;

if (!MAINTENANCE_URL) {
  console.warn(
    "[credits free-mint.docker.test] SKIPPED - TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that N CONCURRENT first balance reads of one Free " +
      "workspace mint exactly ONE monthly grant (the property that makes the mint " +
      "safe to put on a read path at all), that the constraint doing it is " +
      "`credit_ledger_free_allowance_uq` BY NAME, and that a paid tier mints " +
      "nothing under the same contention. PGlite is single-connection, so its " +
      "race is a sequence and none of these is expressible there. Start the " +
      "docker-compose DB and set TEST_DATABASE_URL to " +
      "postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

describe.skipIf(!MAINTENANCE_URL)("the Free mint under REAL concurrency", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let ws: VerifiedWorkspaceId;
  let n = 0;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_freemint"
    );
    await seedDb(harness.db);
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  beforeEach(async () => {
    n += 1;
    const user = `freemint_user_${n}`;
    await seedAuthUser(harness.db, user, `${user}@test.dev`);
    await ensureUserWorkspace(harness.db, { authUserId: user, name: `W${n}` });
    ws = (await withWorkspace(harness.db, { authUserId: user })).workspaceId;
  }, 60_000);

  async function prewarmPool(count: number): Promise<void> {
    const clients = await Promise.all(
      Array.from({ length: count }, () => harness.pool.connect())
    );
    for (const c of clients) c.release();
  }

  const mints = () =>
    harness.db
      .select()
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.workspaceId, ws),
          eq(creditLedger.refType, "free_allowance")
        )
      );

  it("EIGHT concurrent first reads mint exactly ONE grant, and every one of them reports the same balance", async () => {
    await prewarmPool(8);
    const views = await Promise.all(
      Array.from({ length: 8 }, () => deriveBalance(harness.db, ws))
    );
    expect(await mints()).toHaveLength(1);
    for (const v of views) expect(v.balance).toBe(FREE);
  });

  it("the constraint that makes it one is `credit_ledger_free_allowance_uq`, BY NAME", async () => {
    const view = await deriveBalance(harness.db, ws);
    const [row] = await mints();
    // A SECOND grant for the same workspace-month, attempted directly, names
    // the index that refuses it. Without this the "idempotent" claim rests on
    // `onConflictDoNothing` swallowing SOME conflict — which is exactly what a
    // wrong or missing index looks like from the application's side.
    //
    // THROUGH THE RAW POOL, not through drizzle: drizzle wraps the driver error
    // and the CONSTRAINT NAME survives only on the pg error object. Asserting
    // "it threw" would pass for any constraint, or for a typo in the INSERT —
    // which is the difference between naming the guarantee and hoping for it.
    const client = await harness.pool.connect();
    let violation: { constraint?: string; code?: string } = {};
    try {
      await client.query(
        // `id` IS SUPPLIED EXPLICITLY: `credit_ledger.id` defaults through
        // drizzle's `$defaultFn(uuidv7)`, which is APPLICATION-side — the
        // column has no database default, so a raw INSERT without it raises
        // 23502 (not-null) and would have made this case assert the wrong
        // failure.
        `INSERT INTO credit_ledger
           (id, workspace_id, delta, kind, expires_at, ref_type, ref_id, config_version)
         VALUES (gen_random_uuid(), $1, $2, 'grant', $3, 'free_allowance', $4, 1)`,
        [ws, FREE, row.expiresAt, row.refId]
      );
    } catch (e) {
      violation = e as { constraint?: string; code?: string };
    } finally {
      client.release();
    }
    expect(violation.code, "the second insert did not raise a unique violation").toBe(
      "23505"
    );
    expect(
      violation.constraint,
      "a second free_allowance row for one workspace-month was refused by the WRONG constraint"
    ).toBe("credit_ledger_free_allowance_uq");
    expect((await deriveBalance(harness.db, ws)).balance).toBe(view.balance);
  });

  it("the index is WORKSPACE-KEYED: another workspace's grant for the SAME month is not blocked", async () => {
    // R-63's second call, driven. Every sibling partial unique on this table
    // keys on `(ref_type, ref_id)`, and `ref_id` here is the period key —
    // which every workspace on the platform shares. The sibling shape would let
    // the first Free workspace to derive a balance in a month take that key and
    // refuse the grant to every other workspace for the rest of it.
    await deriveBalance(harness.db, ws);
    const other = `freemint_other_${n}`;
    await seedAuthUser(harness.db, other, `${other}@test.dev`);
    await ensureUserWorkspace(harness.db, { authUserId: other, name: `O${n}` });
    const otherWs = (await withWorkspace(harness.db, { authUserId: other }))
      .workspaceId;
    expect((await deriveBalance(harness.db, otherWs)).balance).toBe(FREE);
    const rows = await harness.db
      .select()
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.workspaceId, otherWs),
          eq(creditLedger.refType, "free_allowance")
        )
      );
    expect(rows).toHaveLength(1);
    // ...and both workspaces used the SAME period key, which is what makes the
    // case non-vacuous.
    expect(rows[0].refId).toBe((await mints())[0].refId);
  });

  it("M5 under contention: a PAID workspace mints NOTHING however many reads race", async () => {
    const { content } = await getActiveConfig(harness.db);
    await appendConfigVersion(
      harness.db,
      { ...content, stripePriceMap: { ...content.stripePriceMap, price_pro_fm: "pro" } },
      "test-admin"
    );
    await harness.db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: `cus_${n}`,
      stripeSubscriptionId: `sub_${n}`,
      stripePriceId: "price_pro_fm",
      status: "active",
    });
    await prewarmPool(6);
    const views = await Promise.all(
      Array.from({ length: 6 }, () => deriveBalance(harness.db, ws))
    );
    for (const v of views) expect(v.balance).toBe(0);
    expect(await mints()).toHaveLength(0);
  });
});
