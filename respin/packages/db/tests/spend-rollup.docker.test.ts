// R6: the shared fate, proven on REAL Postgres. PGlite is single-connection
// and its `db.transaction()` is a JS-level simulation — a forced constraint
// violation still rolls back correctly there, but "does a real Postgres
// transaction actually roll BOTH writes back together" is a claim about the
// database, not about drizzle's callback shape, and this is the only suite
// that can prove it (the same reasoning `activate.docker.test.ts` and
// `brain-concurrency.docker.test.ts` give for why they exist).
//
// THE MECHANISM: `recordModelUsage`'s two writes (`model_usage` insert, then
// `upsertSpendRollup`) run inside ONE transaction (R1). `tx` is required by
// the current contract, so calling this function without a transaction is a
// compile-time error rather than an auto-commit fallback. Every call below
// wraps `recordModelUsage` in `db.transaction(...)`, mirroring the real call
// site (`packages/credits/src/inference.ts`) exactly. The transaction is the
// thing under test; a call shaped to skip it cannot compile.
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
import { reconcileSpend } from "../src/spend-rollup";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type RecordModelUsageParams,
} from "../src/with-workspace";
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

  it("R-85: the per-version exemption is a claim about SQL, so it is proved on real Postgres", async () => {
    // WHY THIS CASE IS IN THE DOCKER SUITE AND NOT ONLY IN THE PGlite ONE.
    // `reconcileSpend`'s exemption is a row-comparison `IN` over
    // `(purpose, config_version)` pairs with explicit casts, built from bound
    // parameters. PGlite and node-postgres are the same engine but NOT the same
    // driver, and parameter binding is exactly where a row-comparison `IN` can
    // differ — so a query whose whole job is deciding which lost debits are
    // reported must run once against the driver production uses. The
    // BEHAVIOUR it proves is the finding itself: an attempt priced under a
    // document that charged its claim holder is reported even when today's
    // document would exempt it.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const holder = (attemptId: string, configVersion: number) => ({
      ...usage(attemptId),
      purpose: "onboarding_brain",
      configVersion,
      consumedIncludedBuild: true,
    });
    await db.transaction((tx) =>
      caps.recordModelUsage(holder("att_docker_v1", 1), tx)
    );

    const [second] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "B" })
      .returning();
    const capsB = writeCapabilities(
      await ProfileScope.mint(
        db,
        await withWorkspace(db, { authUserId: "spend_docker_user" }),
        second.id
      )
    );
    await db.transaction((tx) =>
      capsB.recordModelUsage(holder("att_docker_v2", 2), tx)
    );

    const result = await reconcileSpend(db, async (versions) => {
      // Version 1 charged the included build; version 2 did not.
      const answers: Record<number, readonly string[]> = {
        1: [],
        2: ["onboarding_brain"],
      };
      return new Map(versions.map((v) => [v, answers[v] ?? []] as const));
    });
    const ids = result.unbilledAttempts.map((a) => a.attemptId);
    expect(
      ids,
      "the attempt priced under the charging document is not reported — today's prices are judging history"
    ).toContain("att_docker_v1");
    expect(
      ids,
      "the attempt priced under the free document owes nothing"
    ).not.toContain("att_docker_v2");
  });
});
