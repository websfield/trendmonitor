// R6: the shared fate, proven on REAL Postgres. PGlite is single-connection
// and its `db.transaction()` is a JS-level simulation — a forced constraint
// violation still rolls back correctly there, but "does a real Postgres
// transaction actually roll BOTH writes back together" is a claim about the
// database, not about drizzle's callback shape, and this is the only suite
// that can prove it (the same reasoning `activate.docker.test.ts` and
// `brain-concurrency.docker.test.ts` give for why they exist).
//
// THE MECHANISM: `recordModelUsage`'s two writes (`model_usage` insert, then
// `upsertSpendRollup`) run inside ONE transaction (R1) — but ONLY when the
// caller supplies one; `tx` is an OPTIONAL parameter, and calling this
// function bare runs each write as its own auto-committing statement. This
// suite's first draft did exactly that and its poisoned-rollup case "passed"
// its own `rejects.toThrow()` while the model_usage row it expected to see
// rolled back sat there committed — so every call below wraps
// `recordModelUsage` in `db.transaction(...)`, mirroring the real call site
// (`packages/credits/src/inference.ts:725`) exactly. The transaction is the
// thing under test; a call shaped to skip it proves nothing about R1.
//
// To prove atomicity in EACH direction, this suite POISONS one table with an
// always-false CHECK constraint, attempts the write, and asserts the OTHER
// table was not touched either — then drops the poison so later cases are
// unaffected. `NOT VALID` is required (not merely tidy): this suite reuses
// one throwaway database across both cases, so by the second poison a real
// row already exists — an ordinary `ADD CONSTRAINT` validates the WHOLE
// existing table at ALTER time and fails on THAT row before any new write is
// even attempted. `NOT VALID` skips validating existing rows while still
// rejecting every future insert/update, which is the only half this test needs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import { creatorProfiles } from "../src/brain-schema";
import { modelUsage, workspaceSpendMonthly } from "../src/onboarding-schema";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type RecordModelUsageParams,
} from "../src/with-workspace";
import { applyReconciliationDelta } from "../src/spend-rollup";
import type { TxLike } from "../src/db-like";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.error(
    "[spend-rollup.docker.test] SKIPPED — TEST_DATABASE_URL is not set. NOT PROVEN in this run: R6, that recordModelUsage's model_usage insert and workspace_spend_monthly upsert share a fate on REAL Postgres. Start the docker-compose DB and set TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const describeIfDocker = MAINTENANCE_URL ? describe : describe.skip;

describeIfDocker("R6: recordModelUsage's two writes share a fate, on real Postgres", () => {
  let db: Awaited<ReturnType<typeof createDockerTestDb>>["db"];
  let pool: Awaited<ReturnType<typeof createDockerTestDb>>["pool"];
  let workspaceId: string;
  let profileId: string;

  beforeAll(async () => {
    ({ db, pool } = await createDockerTestDb(
      MAINTENANCE_URL!,
      "respin_test_spendrollup"
    ));
    await seedAuthUser(db, "spend_docker_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "spend_docker_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "A" })
      .returning();
    profileId = p.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "spend_docker_user" }),
      profileId
    );

  const usage = (attemptId: string): RecordModelUsageParams => ({
    attemptId,
    purpose: "onboarding_brain_build",
    model: "claude-test",
    tokensIn: 10,
    tokensOut: 10,
    costMicroUsd: 1_000n,
    costState: "estimated",
    resolvedTier: "creator",
    promptBundleVersion: "v1",
    configVersion: 1,
    outcome: "succeeded",
    consumedIncludedBuild: false,
  });

  it("forced ROLLUP failure -> the model_usage row does NOT survive either (R1/R6)", async () => {
    await pool.query(
      `ALTER TABLE workspace_spend_monthly ADD CONSTRAINT zz_rollup_poison CHECK (1 = 0) NOT VALID`
    );
    try {
      const scope = await scopeFor();
      const caps = writeCapabilities(scope);
      await expect(
        db.transaction((tx) => caps.recordModelUsage(usage("att_poison_rollup"), tx))
      ).rejects.toThrow();

      const rows = await db
        .select()
        .from(modelUsage)
        .where(eq(modelUsage.attemptId, "att_poison_rollup"));
      expect(
        rows,
        "the model_usage insert committed even though the rollup upsert in the SAME transaction failed — R1's atomicity is broken"
      ).toHaveLength(0);
    } finally {
      await pool.query(
        `ALTER TABLE workspace_spend_monthly DROP CONSTRAINT zz_rollup_poison`
      );
    }
  });

  it("forced USAGE-INSERT failure -> the rollup is NOT incremented (R6, the other direction)", async () => {
    // Baseline: one real successful call, so there is a rollup row whose
    // call_count a failed SECOND attempt must not move.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    await db.transaction((tx) => caps.recordModelUsage(usage("att_baseline"), tx));
    const [before] = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    expect(before.callCount).toBe(1);

    await pool.query(
      `ALTER TABLE model_usage ADD CONSTRAINT zz_usage_poison CHECK (1 = 0) NOT VALID`
    );
    try {
      await expect(
        db.transaction((tx) => caps.recordModelUsage(usage("att_poison_usage"), tx))
      ).rejects.toThrow();

      const [after] = await db
        .select()
        .from(workspaceSpendMonthly)
        .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
      expect(
        after.callCount,
        "the rollup incremented even though the model_usage insert in the SAME transaction failed — the write order assumed in R1's comment is broken"
      ).toBe(1);

      const rows = await db
        .select()
        .from(modelUsage)
        .where(eq(modelUsage.attemptId, "att_poison_usage"));
      expect(rows).toHaveLength(0);
    } finally {
      await pool.query(`ALTER TABLE model_usage DROP CONSTRAINT zz_usage_poison`);
    }
  });
});

// R4a's idempotency claim ("row-locked state, not a separate dedup table")
// is a claim about REAL Postgres row-lock semantics — PGlite's single
// connection cannot express two transactions genuinely overlapping in time,
// so `spend-rollup.test.ts`'s M9 case proves the SEQUENTIAL shape
// (retry-after-commit) and this suite proves the CONCURRENT one
// (retry-during-the-first-transaction), which is the shape a real duplicate
// webhook/job delivery racing the first one produces.
describeIfDocker(
  "R4a, real Postgres: two CONCURRENT reconciliations of the SAME model_usage row serialize on the row lock, and exactly one applies",
  () => {
    let db: Awaited<ReturnType<typeof createDockerTestDb>>["db"];
    let pool: Awaited<ReturnType<typeof createDockerTestDb>>["pool"];
    let workspaceId: string;
    let profileId: string;

    beforeAll(async () => {
      ({ db, pool } = await createDockerTestDb(
        MAINTENANCE_URL!,
        "respin_test_spendrolluprecon"
      ));
      await seedAuthUser(db, "spend_docker_recon_user");
      workspaceId = (
        await ensureUserWorkspace(db, {
          authUserId: "spend_docker_recon_user",
          name: "A",
        })
      ).workspace.id;
      const [p] = await db
        .insert(creatorProfiles)
        .values({ workspaceId, displayName: "A" })
        .returning();
      profileId = p.id;
    });

    afterAll(async () => {
      await pool.end();
    });

    it("A wins the lock, applies its delta and commits; B blocks until then, sees 'reconciled', and applies nothing", async () => {
      const scope = await ProfileScope.mint(
        db,
        await withWorkspace(db, { authUserId: "spend_docker_recon_user" }),
        profileId
      );
      const caps = writeCapabilities(scope);
      const row = await db.transaction((tx) =>
        caps.recordModelUsage(
          {
            attemptId: "att_concurrent_recon",
            purpose: "onboarding_brain_build",
            model: "claude-test",
            tokensIn: 10,
            tokensOut: 10,
            costMicroUsd: 1_000n,
            costState: "estimated",
            resolvedTier: "creator",
            promptBundleVersion: "v1",
            configVersion: 1,
            outcome: "succeeded",
            consumedIncludedBuild: false,
          },
          tx
        )
      );

      /**
       * Postgres's own answer to "is a backend genuinely waiting on
       * `model_usage`'s row lock?" — mirroring `activate.docker.test.ts`'s
       * `pg_locks`-based advisory-lock witnesses (tenancy gate round 3
       * precedent, CLAUDE.md's 2026-08-30 lesson), but reading
       * `pg_stat_activity` rather than `pg_locks` directly: a row-lock
       * WAITER (`SELECT ... FOR UPDATE` blocked on an uncommitted
       * `UPDATE`/`SELECT ... FOR UPDATE` of the same row) blocks on the
       * HOLDING TRANSACTION's `transactionid`, not on a `tuple` lock, which
       * a first version of this witness got wrong and reported "never
       * blocked" every time (`locktype = 'tuple'` never matches this
       * scenario). `pg_stat_activity.wait_event_type = 'Lock'` is Postgres's
       * OWN generic answer to "is this backend blocked on ANY lock" and does
       * not require picking the right `locktype`; the query-text filter
       * scopes it to a backend actually contending `model_usage` (this
       * suite's throwaway database has exactly one contended table at a
       * time, so that is enough to make the match specific).
       *
       * WHY THIS REPLACED A JS-FLAG-PLUS-FIXED-SLEEP HANDSHAKE (billing gate
       * round 1, 2026-08-30): the prior version set a JS boolean AFTER
       * `applyReconciliationDelta` fully resolved and then held the winner
       * open for a flat 300ms, which is causally sound on paper (JS is
       * single-threaded; the flag cannot be read before it is set) but
       * proves nothing about the DATABASE actually having produced a
       * blocked waiter — it proves only that some time passed. It failed 1
       * run in 7 under real load. This witness instead asks Postgres
       * directly, so the test can never assert non-vacuity (`blocked ===
       * true`, below) on a coincidence of timing.
       */
      const waitingOnRowLock = async (timeoutMs: number): Promise<boolean> => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const res = await pool.query(
            `SELECT count(*)::int AS n
               FROM pg_stat_activity
              WHERE datname = current_database()
                AND wait_event_type = 'Lock'
                AND query ILIKE '%model_usage%'`
          );
          if ((res.rows[0] as { n: number }).n > 0) return true;
          await new Promise((r) => setTimeout(r, 10));
        }
        return false;
      };

      // BOTH calls run the SAME gated callback: whichever of the two wins
      // the row lock first (Postgres decides, not this test) runs
      // `applyReconciliationDelta` to completion and then PARKS on `holdA`
      // before its transaction can commit — so its lock stays held. The
      // LOSER blocks genuinely, at the database level, inside its own
      // `applyReconciliationDelta` call (before it has anything to park
      // on), which is exactly the blocked tuple-lock request
      // `waitingOnRowLock` polls for below.
      let releaseA: () => void = () => {};
      const holdA = new Promise<void>((resolve) => {
        releaseA = resolve;
      });
      const gatedReconcile = async (tx: TxLike) => {
        const r = await applyReconciliationDelta(tx, {
          usageId: row.id,
          reconciledCostMicroUsd: 5_000n,
        });
        await holdA;
        return r;
      };

      const txA = db.transaction(gatedReconcile);
      const txB = db.transaction(gatedReconcile);

      const blocked = await waitingOnRowLock(5_000);
      releaseA();
      const [resultA, resultB] = await Promise.all([txA, txB]);

      expect(
        blocked,
        "neither call ever blocked on the other's row lock — the two calls did not genuinely race, so the assertion below is vacuous"
      ).toBe(true);

      const appliedFlags = [resultA.applied, resultB.applied];
      expect(
        appliedFlags.filter(Boolean),
        `expected exactly one of the two concurrent calls to apply — got ${JSON.stringify(appliedFlags)}`
      ).toHaveLength(1);

      const [rollup] = await db
        .select()
        .from(workspaceSpendMonthly)
        .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
      // Baseline cost 1_000n (estimated) -> reconciled to 5_000n: a delta of
      // +4_000n, applied EXACTLY ONCE despite two concurrent callers.
      expect(rollup.costMicroUsd).toBe(5_000n);

      const [usageRow] = await db
        .select()
        .from(modelUsage)
        .where(eq(modelUsage.id, row.id));
      expect(usageRow.costState).toBe("reconciled");
      expect(usageRow.costMicroUsd).toBe(5_000n);
    });
  }
);
