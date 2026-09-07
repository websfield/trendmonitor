// R-98 ON REAL POSTGRES — the two properties PGlite cannot prove about the
// pasted reference's money: that ONE claim is debited ONCE and refunded ONCE
// under TRUE concurrency.
//
// Both "once per claim" rules are enforced TWICE: at the WRITER, under the
// workspace advisory lock, and under it by the partial unique indexes
// migration 0027 adds (`credit_ledger_autopsy_claim_uq`,
// `credit_ledger_autopsy_refund_uq`). A read-then-write behind a lock is
// exactly the shape a single-session driver cannot tell from a lock that was
// never taken: with `takeWorkspaceLock` deleted, the PGlite suite stays green.
// So this suite races N connections at each writer and counts rows — and then
// names each index BY NAME, because "it threw" would pass for a typo in the
// INSERT and for a missing index alike (`free-mint.docker.test.ts`'s
// precedent).
//
// Without TEST_DATABASE_URL this suite SKIPS LOUDLY, naming what went
// unproven. Its database name is unique per suite (the harness requires it:
// vitest runs FILES in parallel and each suite starts by dropping schema
// public).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  autopsyCacheClaims,
  createDockerTestDb,
  creatorProfiles,
  creditLedger,
  ensureUserWorkspace,
  seedAuthUser,
  seedDb,
  subscriptions,
  withWorkspace,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { deriveBalance } from "../src/balance";
import { grantCredits } from "../src/ledger";
import {
  PASTED_REFERENCE_CREDIT_COST_KEY,
  PASTED_REFERENCE_DEBIT_REF_TYPE,
  PASTED_REFERENCE_REFUND_REF_TYPE,
  settleParkedAutopsies,
  submitPastedReference,
} from "../src/pasted-reference";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
const RACERS = 8;
const PASTE = { sourceUrl: "https://www.youtube.com/watch?v=race123", transcript: "Open on the tradeoff.\nShow the pan." };

if (!MAINTENANCE_URL) {
  console.warn(
    "[credits pasted-reference.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that a pasted reference's claim is debited ONCE and a " +
      "parked claim is refunded ONCE under TRUE concurrency (R-98), and that " +
      "`credit_ledger_autopsy_claim_uq` / `credit_ledger_autopsy_refund_uq` are the " +
      "constraints that refuse a second row. Both rules are read-then-write behind the " +
      "workspace advisory lock, so PGlite (single-session) cannot tell the lock from its " +
      "absence, and PGlite does not exercise a concurrent index violation. Start the " +
      "docker-compose DB and set TEST_DATABASE_URL to " +
      "postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

describe.skipIf(!MAINTENANCE_URL)("pasted reference money under real concurrency (R-98)", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let scope: WorkspaceScope;
  let profileId: string;
  let price: number;

  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_pastedreference");
    const db = harness.db;
    await seedAuthUser(db, "race_paste", "race_paste@test.dev");
    await seedDb(db);
    const { workspace } = await ensureUserWorkspace(db, { authUserId: "race_paste", name: "Race" });
    scope = await withWorkspace(db, { authUserId: "race_paste" });
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(db, { ...content, stripePriceMap: { price_creator: "creator" } }, "test-admin");
    await db.insert(subscriptions).values({
      workspaceId: workspace.id, stripeCustomerId: "cus_race", stripeSubscriptionId: "sub_race",
      stripePriceId: "price_creator", status: "active",
    });
    price = content.creditCosts[PASTED_REFERENCE_CREDIT_COST_KEY];
    expect(price, "the seed must price the autopsy above zero for this suite to prove anything").toBeGreaterThan(0);
    // Enough for ONE paste, not for two: if the lock failed and two racers both
    // debited, the second debit would ALSO have to pass the fold — so the
    // budget is set so that a double debit is refused by the balance rather
    // than silently allowed. The count below is then the sharper witness.
    await db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: scope.workspaceId, amount: price * 2 + 1,
        expiresAt: new Date(Date.now() + 365 * 24 * 3_600_000),
        refType: "test", refId: "race-grant", configVersion: 1,
      })
    );
    const [profile] = await db.insert(creatorProfiles).values({ workspaceId: workspace.id, displayName: "Racer" }).returning();
    profileId = profile.id;
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it(`${RACERS} simultaneous IDENTICAL pastes → one claim, ONE debit, the price charged once`, async () => {
    const db = harness.db;
    const before = (await deriveBalance(db, scope.workspaceId)).balance;
    const results = await Promise.allSettled(
      Array.from({ length: RACERS }, () => submitPastedReference(db, scope, profileId, PASTE, new Date()))
    );
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof submitPastedReference>>> => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Every racer either lands the paste or lands on it — none is refused: the
    // budget covers one price and the replay charges nothing.
    expect(rejected.map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
    const claimIds = new Set(fulfilled.map((r) => r.value.claimId));
    expect(claimIds.size).toBe(1);
    expect(fulfilled.filter((r) => r.value.creditsChargedNow === price)).toHaveLength(1);
    expect(fulfilled.filter((r) => r.value.creditsChargedNow === 0)).toHaveLength(RACERS - 1);

    const claims = await db.select().from(autopsyCacheClaims);
    expect(claims).toHaveLength(1);
    const debits = (await db.select().from(creditLedger)).filter((r) => r.refType === PASTED_REFERENCE_DEBIT_REF_TYPE);
    expect(debits).toHaveLength(1);
    expect(debits[0].refId).toBe([...claimIds][0]);
    expect((await deriveBalance(db, scope.workspaceId)).balance).toBe(before - price);
  }, 60_000);

  it(`${RACERS} simultaneous settlements of one PARKED claim → ONE refund, the balance restored once`, async () => {
    const db = harness.db;
    const [claim] = await db.select().from(autopsyCacheClaims);
    await db.update(autopsyCacheClaims).set({ status: "parked", attemptCount: 5 }).where(eq(autopsyCacheClaims.id, claim.id));
    const before = (await deriveBalance(db, scope.workspaceId)).balance;

    const results = await Promise.all(
      Array.from({ length: RACERS }, () => settleParkedAutopsies(db, scope, profileId))
    );
    const winners = results.filter((r) => r.refundedClaimIds.length > 0);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toEqual({
      refundedClaimIds: [claim.id],
      creditsReturned: price,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [],
    });
    expect(results.filter((r) => r.refundedClaimIds.length === 0)).toHaveLength(RACERS - 1);

    const refunds = (await db.select().from(creditLedger)).filter((r) => r.refType === PASTED_REFERENCE_REFUND_REF_TYPE);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ kind: "refund", delta: price, refId: claim.id });
    expect((await deriveBalance(db, scope.workspaceId)).balance).toBe(before + price);

    // ...and a later settlement, alone, still appends nothing — and reports the
    // claim as already refunded rather than saying nothing about it (round 2).
    expect(await settleParkedAutopsies(db, scope, profileId)).toEqual({
      refundedClaimIds: [],
      creditsReturned: 0,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [claim.id],
    });
    expect((await db.select().from(creditLedger)).filter((r) => r.refType === PASTED_REFERENCE_REFUND_REF_TYPE)).toHaveLength(1);
  }, 60_000);
  it("the constraints under the lock are `credit_ledger_autopsy_claim_uq` and `credit_ledger_autopsy_refund_uq`, BY NAME", async () => {
    // THE LOCK IS THE FIRST CONTROL; THIS IS THE ONE UNDER IT (migration 0027).
    // Both cases above prove the writer serialises. Neither can tell a working
    // index from an absent one, because the writer never reaches the INSERT
    // twice — so a second row of each ref type is attempted HERE, directly,
    // bypassing the writer exactly as a repair script or a lock-less future
    // writer would.
    //
    // THROUGH THE RAW POOL, not through drizzle: drizzle wraps the driver error
    // and the CONSTRAINT NAME survives only on the pg error object. Asserting
    // "it threw" would pass for any constraint, or for a typo in the INSERT.
    const db = harness.db;
    const rows = await db.select().from(creditLedger);
    const debit = rows.find((r) => r.refType === PASTED_REFERENCE_DEBIT_REF_TYPE)!;
    const refund = rows.find((r) => r.refType === PASTED_REFERENCE_REFUND_REF_TYPE)!;
    const before = (await deriveBalance(db, scope.workspaceId)).balance;

    for (const [row, kind, delta, expected] of [
      [debit, "debit", -price, "credit_ledger_autopsy_claim_uq"],
      [refund, "refund", price, "credit_ledger_autopsy_refund_uq"],
    ] as const) {
      const client = await harness.pool.connect();
      let violation: { constraint?: string; code?: string } = {};
      try {
        // `id` IS SUPPLIED EXPLICITLY: `credit_ledger.id` defaults through
        // drizzle's `$defaultFn(uuidv7)`, which is APPLICATION-side, so a raw
        // INSERT without it raises 23502 and would assert the wrong failure.
        // `expires_at` IS COPIED FROM THE REAL ROW, not omitted:
        // `credit_ledger_lot_expiry` requires it on a `refund`, so a NULL here
        // raises 23514 and this case would assert the wrong failure — the same
        // trap the `id` note above records, one constraint over.
        await client.query(
          `INSERT INTO credit_ledger (id, workspace_id, delta, kind, ref_type, ref_id, expires_at, config_version)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1)`,
          [scope.workspaceId, delta, kind, row.refType, row.refId, row.expiresAt]
        );
      } catch (e) {
        violation = e as { constraint?: string; code?: string };
      } finally {
        client.release();
      }
      expect(violation.code, `a second ${row.refType} row for one claim was NOT refused`).toBe("23505");
      expect(
        violation.constraint,
        `a second ${row.refType} row for one claim was refused by the WRONG constraint`
      ).toBe(expected);
    }
    // Nothing was minted or burned by the attempts.
    expect((await deriveBalance(db, scope.workspaceId)).balance).toBe(before);
  }, 60_000);

  it("the indexes are PER CLAIM, not per ref_type: a DIFFERENT claim id is not blocked", async () => {
    // The failure mode the free-allowance index's own paragraph names, in this
    // table's other direction: an index one column short — here `(ref_type)`
    // alone — would let the FIRST autopsy on the platform take the key and
    // refuse every later one. A second claim id must insert cleanly.
    const db = harness.db;
    const before = (await deriveBalance(db, scope.workspaceId)).balance;
    const other = crypto.randomUUID();
    const client = await harness.pool.connect();
    try {
      await client.query(
        `INSERT INTO credit_ledger (id, workspace_id, delta, kind, ref_type, ref_id, config_version)
         VALUES (gen_random_uuid(), $1, $2, 'debit', $3, $4, 1)`,
        [scope.workspaceId, -price, PASTED_REFERENCE_DEBIT_REF_TYPE, other]
      );
    } finally {
      client.release();
    }
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.refType === PASTED_REFERENCE_DEBIT_REF_TYPE)
    ).toHaveLength(2);
    expect((await deriveBalance(db, scope.workspaceId)).balance).toBe(before - price);
  }, 60_000);
  it("a NULL `ref_id` cannot slip past either index: `credit_ledger_autopsy_ref` refuses it", async () => {
    // THE HOLE A PARTIAL UNIQUE ALONE LEAVES. NULLs are DISTINCT in a unique
    // index, so an `autopsy_claim` row with no claim id would be accepted
    // again and again and the index above would never see a duplicate. The
    // CHECK migration 0027 adds is what closes it — the same sentence
    // `credit_ledger_free_allowance_ref` already carries for its own index.
    for (const refType of [PASTED_REFERENCE_DEBIT_REF_TYPE, PASTED_REFERENCE_REFUND_REF_TYPE]) {
      const client = await harness.pool.connect();
      let violation: { constraint?: string; code?: string } = {};
      try {
        await client.query(
          `INSERT INTO credit_ledger (id, workspace_id, delta, kind, ref_type, ref_id, expires_at, config_version)
           VALUES (gen_random_uuid(), $1, -1, 'debit', $2, NULL, NULL, 1)`,
          [scope.workspaceId, refType]
        );
      } catch (e) {
        violation = e as { constraint?: string; code?: string };
      } finally {
        client.release();
      }
      expect(violation.code, `a NULL-ref ${refType} row was NOT refused`).toBe("23514");
      expect(violation.constraint, `a NULL-ref ${refType} row was refused by the WRONG constraint`).toBe(
        "credit_ledger_autopsy_ref"
      );
    }
  }, 60_000);
});
