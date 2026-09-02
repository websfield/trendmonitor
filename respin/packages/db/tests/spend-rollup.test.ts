// Slice 2b: the rollup upsert (R1-R4), monthly spend (R7), pseudonymisation
// (R-30.5/R-54) and reconciliation (R11-R13, R-41). PGlite is single-connection
// and cannot express the true concurrency case — that is
// `spend-rollup.docker.test.ts`'s job (R6's shared-fate atomicity). Everything
// expressible on one connection is here.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { creditLedger } from "../src/billing-schema";
import { creatorProfiles } from "../src/brain-schema";
import { modelUsage, workspaceSpendMonthly } from "../src/onboarding-schema";
import {
  ProfileScope,
  monthlySpend,
  withWorkspace,
  writeCapabilities,
  type RecordModelUsageParams,
} from "../src/with-workspace";
import {
  periodMonthUtc,
  pseudonymiseWorkspaceSpend,
  reconcileSpend,
} from "../src/spend-rollup";

/**
 * `recordModelUsage` now REQUIRES `tx: TxLike` (billing + tenancy gate
 * finding, 2026-08-29 — see with-workspace.ts's docblock on the capability):
 * this suite's own first draft called it bare, which is exactly the shape
 * that let a poisoned-rollup write commit its model_usage row uncommitted-
 * transactionally in spend-rollup.docker.test.ts's first draft. Every call
 * site below goes through this helper so the requirement cannot regress.
 */
function record(
  db: TestDb,
  caps: ReturnType<typeof writeCapabilities>,
  usage: RecordModelUsageParams
) {
  return db.transaction((tx) => caps.recordModelUsage(usage, tx));
}

describe("periodMonthUtc (R2): truncates to the row's own UTC month, no caller clock", () => {
  it("mid-month", () => {
    expect(periodMonthUtc(new Date(Date.UTC(2026, 5, 15, 10, 30)))).toBe(
      "2026-06-01"
    );
  });

  it("the last instant of a UTC month stays in that month", () => {
    expect(
      periodMonthUtc(new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)))
    ).toBe("2026-12-01");
  });

  it("the first instant of a UTC month, crossing a year boundary", () => {
    expect(periodMonthUtc(new Date(Date.UTC(2027, 0, 1, 0, 0, 0, 0)))).toBe(
      "2027-01-01"
    );
  });

  it("a Date constructed from a LOCAL offset still truncates by its UTC fields, not the local ones", () => {
    // 2026-03-01T00:30:00 in UTC+02:00 is still 2026-02-28T22:30:00 UTC — the
    // instant this function must bucket into February, not March. Expressed
    // via an explicit offset string so the assertion does not depend on the
    // test runner's own local timezone.
    const d = new Date("2026-03-01T00:30:00+02:00");
    expect(periodMonthUtc(d)).toBe("2026-02-01");
  });
});

describe("the rollup upsert, composed inside recordModelUsage (R1, R3, R4, R5's onConflictDoUpdate)", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "roll_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "roll_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "A" })
      .returning();
    profileId = p.id;
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "roll_user" }),
      profileId
    );

  const baseUsage = (
    overrides: Partial<RecordModelUsageParams>
  ): RecordModelUsageParams => ({
    attemptId: "att_default",
    purpose: "onboarding_brain_build",
    model: "claude-test",
    tokensIn: 100,
    tokensOut: 50,
    costMicroUsd: 1_000n,
    costState: "estimated",
    resolvedTier: "creator",
    promptBundleVersion: "v1",
    configVersion: 1,
    outcome: "succeeded",
    consumedIncludedBuild: false,
    ...overrides,
  });

  it("a single billed attempt creates the grain row with call_count 1 and its own cost", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, baseUsage({ attemptId: "att_1" }));
    const [row] = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    expect(row.callCount).toBe(1);
    expect(row.costMicroUsd).toBe(1_000n);
  });

  it("two attempts in the same grain — TWO rows in model_usage, and the rollup increments TWICE (question 1's whole point; M2's onConflictDoNothing mutation target)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, baseUsage({ attemptId: "att_a", costMicroUsd: 1_000n }));
    await record(db, caps, baseUsage({ attemptId: "att_b", costMicroUsd: 2_000n }));

    const usageRows = await db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.workspaceId, workspaceId));
    expect(usageRows).toHaveLength(2);

    const [row] = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    expect(row.callCount).toBe(2);
    expect(row.costMicroUsd).toBe(3_000n);
  });

  it("an unknown-cost attempt increments call_count and NOT cost_micro_usd, and does not corrupt a prior known cost (R4; M3's mutation target)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(
      db,
      caps,
      baseUsage({ attemptId: "att_known", costMicroUsd: 5_000n, costState: "estimated" })
    );
    await record(
      db,
      caps,
      baseUsage({
        attemptId: "att_unknown",
        costMicroUsd: null,
        costState: "unknown",
        outcome: "unavailable",
      })
    );
    const [row] = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    expect(row.callCount).toBe(2);
    expect(row.costMicroUsd).toBe(5_000n);
    // R4: the retained denominator increments on the unknown row, and stays
    // at 0 for the known one — call_count moved for both, unknown_call_count
    // moved for only the unknown row.
    expect(row.unknownCallCount).toBe(1);
  });

  it("R4: the unknown share is the ROLLUP's own column and stays correct after the model_usage detail it summarised is deleted (M3's mutation target — deriving it from surviving detail would read 0 here)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(
      db,
      caps,
      baseUsage({
        attemptId: "att_unknown_only",
        costMicroUsd: null,
        costState: "unknown",
        outcome: "unavailable",
      })
    );
    // The cascade this table is built to outlive (onboarding-schema.ts's own
    // docblock: model_usage cascades from creator_profiles; workspace_spend_
    // monthly has no FK and does not).
    await db
      .delete(modelUsage)
      .where(eq(modelUsage.workspaceId, workspaceId));
    const remainingUsage = await db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.workspaceId, workspaceId));
    expect(remainingUsage).toHaveLength(0);

    const [row] = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    expect(row.unknownCallCount).toBe(1);
    expect(row.callCount).toBe(1);
  });

  it("different tiers on the same workspace/month are DIFFERENT grains (the unique index's third column)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(
      db,
      caps,
      baseUsage({ attemptId: "att_creator", resolvedTier: "creator", costMicroUsd: 1_000n })
    );
    await record(
      db,
      caps,
      baseUsage({ attemptId: "att_pro", resolvedTier: "pro", costMicroUsd: 4_000n })
    );
    const rows = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.callCount)).toEqual([1, 1]);
  });
});

describe("monthlySpend (R7): a scoped query with its own period predicate", () => {
  let db: TestDb;
  let workspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "burn_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "burn_user", name: "A" })
    ).workspace.id;
  });

  it("T1 — workspace A's burn NEVER includes workspace B's debits, however large (tenancy gate finding, 2026-08-29)", async () => {
    await seedAuthUser(db, "burn_user_b");
    const workspaceIdB = (
      await ensureUserWorkspace(db, { authUserId: "burn_user_b", name: "B" })
    ).workspace.id;
    const periodStart = new Date("2026-06-01T00:00:00Z");
    await db.insert(creditLedger).values([
      {
        workspaceId,
        delta: -10,
        kind: "debit",
        refType: "inference",
        refId: "att_a",
        createdAt: new Date("2026-06-03T00:00:00Z"),
      },
      // B's debit dwarfs A's — if the workspace predicate ever dropped, A's
      // total would read 9010, not 10.
      {
        workspaceId: workspaceIdB,
        delta: -9_000,
        kind: "debit",
        refType: "inference",
        refId: "att_b",
        createdAt: new Date("2026-06-03T00:00:00Z"),
      },
    ]);
    const scopeA = await withWorkspace(db, { authUserId: "burn_user" });
    const scopeB = await withWorkspace(db, { authUserId: "burn_user_b" });
    const resultA = await monthlySpend(db, scopeA, periodStart);
    const resultB = await monthlySpend(db, scopeB, periodStart);
    expect(resultA.totalDebit).toBe(10);
    expect(resultB.totalDebit).toBe(9_000);
  });

  it("a workspace with no debits at all: totalDebit 0, hasAnyDebit false (R8 — the caller renders text, not this number, but the number itself is an honest zero here because the query is unclamped)", async () => {
    const scope = await withWorkspace(db, { authUserId: "burn_user" });
    const result = await monthlySpend(db, scope, new Date(0));
    expect(result.totalDebit).toBe(0);
    expect(result.hasAnyDebit).toBe(false);
  });

  it("debits inside the period are summed as a positive number; a grant is not counted; a debit BEFORE periodStart is excluded", async () => {
    const periodStart = new Date("2026-06-01T00:00:00Z");
    await db.insert(creditLedger).values([
      {
        workspaceId,
        delta: 250,
        kind: "grant",
        refType: "invoice",
        refId: "in_1",
        expiresAt: new Date("2026-08-02T00:00:00Z"),
        createdAt: new Date("2026-06-02T00:00:00Z"),
      },
      {
        workspaceId,
        delta: -50,
        kind: "debit",
        refType: "inference",
        refId: "att_in_period",
        createdAt: new Date("2026-06-03T00:00:00Z"),
      },
      {
        workspaceId,
        delta: -30,
        kind: "debit",
        refType: "inference",
        refId: "att_before_period",
        createdAt: new Date("2026-05-31T23:59:59Z"),
      },
    ]);
    const scope = await withWorkspace(db, { authUserId: "burn_user" });
    const result = await monthlySpend(db, scope, periodStart);
    expect(result.totalDebit).toBe(50);
    expect(result.hasAnyDebit).toBe(true);
  });

  it("an EXPIRY row is never counted as burn (billing gate BLOCK, 2026-08-29): lapsing is not spending", async () => {
    // `deriveBalanceInTx` (balance.ts) can materialize an expiry row lazily
    // on the SAME request that then renders this total (usage/page.tsx calls
    // getBalance before monthlySpend) — the exact shape the finding named. A
    // bare `delta < 0` predicate would have summed this in.
    const periodStart = new Date("2026-06-01T00:00:00Z");
    await db.insert(creditLedger).values({
      workspaceId,
      delta: -200,
      kind: "expiry",
      refType: "lot",
      refId: "lot_1",
      createdAt: new Date("2026-06-05T00:00:00Z"),
    });
    const scope = await withWorkspace(db, { authUserId: "burn_user" });
    const result = await monthlySpend(db, scope, periodStart);
    expect(result.totalDebit).toBe(0);
    expect(result.hasAnyDebit).toBe(false);
  });

  it("a negative ADJUST row is never counted as burn either — only kind='debit' is spend", async () => {
    const periodStart = new Date("2026-06-01T00:00:00Z");
    await db.insert(creditLedger).values({
      workspaceId,
      delta: -75,
      kind: "adjust",
      reasonCode: "operator_correction",
      createdAt: new Date("2026-06-05T00:00:00Z"),
    });
    const scope = await withWorkspace(db, { authUserId: "burn_user" });
    const result = await monthlySpend(db, scope, periodStart);
    expect(result.totalDebit).toBe(0);
    expect(result.hasAnyDebit).toBe(false);
  });
});

describe("pseudonymiseWorkspaceSpend (R-30.5/R-54): one fresh id per workspace, every row of it moves together", () => {
  let db: TestDb;
  let workspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "pseudo_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "pseudo_user", name: "A" })
    ).workspace.id;
    await db.insert(workspaceSpendMonthly).values([
      { workspaceId, periodMonth: "2026-06-01", tier: "creator", costMicroUsd: 1_000n, callCount: 1 },
      { workspaceId, periodMonth: "2026-07-01", tier: "creator", costMicroUsd: 2_000n, callCount: 2 },
    ]);
  });

  it("moves every row of the workspace to the SAME new id, and the old id has none left", async () => {
    const result = await db.transaction((tx) =>
      pseudonymiseWorkspaceSpend(tx, workspaceId)
    );
    expect(result.rowsUpdated).toBe(2);
    expect(result.pseudonymisedId).not.toBe(workspaceId);

    const remaining = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    expect(remaining).toHaveLength(0);

    const moved = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, result.pseudonymisedId));
    expect(moved).toHaveLength(2);
    expect(new Set(moved.map((r) => r.periodMonth))).toEqual(
      new Set(["2026-06-01", "2026-07-01"])
    );
  });
});

describe("reconcileSpend (R11-R13, R-41): three classes plus unbilled, while model_usage still exists (R12)", () => {
  /**
   * What `/admin/model-spend` passes: the purposes whose first billable
   * attempt is free (R-81).
   *
   * A LITERAL, not an import. `@respin/db` does not depend on
   * `@respin/credits` and must not start — the edge runs one way. That this
   * literal is the value `@respin/credits` actually exports, and that the
   * value is derived from `priceOf` rather than asserted, is checked from the
   * other side in `packages/credits/tests/included-build-purposes.test.ts` —
   * which reads this declaration out of this file.
   */
  const INCLUDED_BUILD_PURPOSES: readonly string[] = ["onboarding_brain"];

  /**
   * The resolver `reconcileSpend` now takes (R-85), for a suite whose rows are
   * all written under `configVersion: 1`.
   *
   * A FUNCTION OF THE VERSIONS IT IS HANDED, never a constant map: it answers
   * for exactly the versions the query found, so a case that writes rows under
   * two versions gets two answers without touching this helper — and a query
   * that stopped asking about versions at all would hand it an empty list and
   * fail the assertions below rather than quietly exempting everything.
   */
  const includedFor =
    (purposes: readonly string[]) =>
    async (versions: readonly number[]) =>
      new Map(versions.map((v) => [v, purposes] as const));

  /** Per-version answers, for the cases that write rows under two documents. */
  const includedPerVersion =
    (byVersion: Readonly<Record<number, readonly string[]>>) =>
    async (versions: readonly number[]) =>
      new Map(versions.map((v) => [v, byVersion[v] ?? []] as const));

  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "recon_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "recon_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "A" })
      .returning();
    profileId = p.id;
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "recon_user" }),
      profileId
    );

  it("a grain the rollup and model_usage agree on is RECONCILED (M1/M8's own-work target)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, {
      attemptId: "att_recon",
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
    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const row = result.rows.find((r) => r.workspaceId === workspaceId);
    expect(row?.class).toBe("reconciled");
    expect(result.counts.reconciled).toBeGreaterThanOrEqual(1);
  });

  it("a rollup row surviving a deleted profile tree is ORPHANED, never DRIFT (question 3 — an alarm that fires on correctness is not a defect; M7's target)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, {
      attemptId: "att_orphan",
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
    // model_usage cascades from creator_profiles (onboarding-schema.ts's own
    // docblock); deleting the profile is what produces the orphaned shape —
    // the rollup row has no FK and survives untouched.
    await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profileId));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const row = result.rows.find((r) => r.workspaceId === workspaceId);
    expect(row?.class).toBe("orphaned");
    expect(result.counts.drift).toBe(0);
  });

  it("KNOWN LIMITATION (tenancy gate, 2026-08-29, documented in reconcileSpend's own docblock): deleting ONE profile of a MULTI-profile workspace false-positives as DRIFT, not orphaned — not reachable today (profiles are archived, never individually deleted; see the limitation note), but proven here so the shape is on record rather than rediscovered", async () => {
    const caps = writeCapabilities(await scopeFor());
    // A second, SURVIVING profile in the same workspace.
    const [secondProfile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "Survivor" })
      .returning();
    const scopeSurvivor = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "recon_user" }),
      secondProfile.id
    );
    const capsSurvivor = writeCapabilities(scopeSurvivor);

    // Both profiles bill into the SAME grain (same tier, same month).
    await record(db, caps, {
      attemptId: "att_deleted_profile",
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
    await record(db, capsSurvivor, {
      attemptId: "att_survivor",
      purpose: "onboarding_brain_build",
      model: "claude-test",
      tokensIn: 10,
      tokensOut: 10,
      costMicroUsd: 500n,
      costState: "estimated",
      resolvedTier: "creator",
      promptBundleVersion: "v1",
      configVersion: 1,
      outcome: "succeeded",
      consumedIncludedBuild: false,
    });

    // Simulate a HYPOTHETICAL per-profile deletion (no such path exists in
    // this product today — see the limitation note): only ONE profile's row
    // is removed, cascading only its own model_usage.
    await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profileId));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const row = result.rows.find((r) => r.workspaceId === workspaceId);
    // THE DOCUMENTED LIMITATION, PINNED: the survivor keeps hasProfiles
    // true, so this reads DRIFT (rollup 1500 vs surviving usage 500) rather
    // than the true state (one profile legitimately gone, one still
    // spending). If this assertion ever flips to "reconciled" or
    // "orphaned", the limitation note is stale and should be corrected
    // alongside whatever fixed the underlying grain.
    expect(row?.class).toBe("drift");
  });

  it("the rollup disagreeing with model_usage while the profile still exists is DRIFT — the only class that is a defect", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, {
      attemptId: "att_drift",
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
    // Corrupt the rollup directly — the shape a bug elsewhere would produce,
    // never something this codebase's own write path can do (R6 proves that
    // path atomic on real Postgres).
    await db
      .update(workspaceSpendMonthly)
      .set({ costMicroUsd: 999_999n })
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const row = result.rows.find((r) => r.workspaceId === workspaceId);
    expect(row?.class).toBe("drift");
    expect(result.counts.drift).toBe(1);
  });

  // R-41's real shape, corrected after the billing gate found the first draft
  // backwards (2026-08-29): `consumedIncludedBuild` is `true` on EVERY
  // successful attempt (`inference.ts:546`), never a "this was priced"
  // marker — so a "crashed" fixture cannot be built by setting it `false` on
  // a `succeeded` row; the real write path never produces that shape at all.
  // The real discriminator is RANK: the profile's first successful,
  // purpose-matched attempt is free (no debit expected, ever); every LATER
  // one is priced and should have a matching debit.
  const succeed = (attemptId: string) => ({
    attemptId,
    purpose: "onboarding_brain",
    model: "claude-test",
    tokensIn: 10,
    tokensOut: 10,
    costMicroUsd: 1_000n,
    costState: "estimated" as const,
    resolvedTier: "creator" as const,
    promptBundleVersion: "v1",
    configVersion: 1,
    outcome: "succeeded" as const,
    consumedIncludedBuild: true,
  });

  it("the FIRST successful attempt for a profile+purpose is never unbilled, even with no debit (it is the free included build)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, succeed("att_first"));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    expect(result.unbilledAttempts.map((a) => a.attemptId)).not.toContain(
      "att_first"
    );
  });

  it("a SECOND successful attempt for the same profile+purpose with no matching debit IS unbilled (R-41's real crash shape)", async () => {
    const caps = writeCapabilities(await scopeFor());
    // Both writes go through the real recordModelUsage path in sequence, on
    // one PGlite connection — created_at is clock_timestamp()-stamped per
    // insert (onboarding-schema.ts) and attempt_id is the tiebreaker in the
    // rank query's ORDER BY, so "att_first" sorts before "att_second"
    // regardless of clock resolution, exactly as two real presses would.
    await record(db, caps, succeed("att_first"));
    // The second attempt's debit is simply never written — the shape a crash
    // between the model_usage commit and the credit_ledger commit leaves
    // behind (R-41), reproduced here by writing model_usage directly rather
    // than through the whole debit path.
    await record(db, caps, succeed("att_second"));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const ids = result.unbilledAttempts.map((a) => a.attemptId);
    expect(ids).not.toContain("att_first");
    expect(ids).toContain("att_second");
  });

  it("a REFUSED first attempt consumes the free slot (billing gate round 2, 2026-08-29): the SUCCEEDED second attempt is priced, and if its debit is missing it IS unbilled", async () => {
    const caps = writeCapabilities(await scopeFor());
    // `LlmRefusedError` is billable AND consumes the included build
    // (packages/llm/src/errors.ts: `consumesIncludedBuild` defaults to
    // `billable`, and a refusal is `billable: true`) — so a profile whose
    // FIRST attempt for a purpose is a policy refusal has ALREADY spent its
    // free slot. `recordModelUsage` (with-workspace.ts) writes the claim for
    // this row (`outcome IN BILLABLE_USAGE_OUTCOMES AND consumedIncludedBuild
    // = true`), so the real pricing logic prices the NEXT (successful)
    // attempt — even though it is the first to succeed. This query must
    // agree, or a lost debit on exactly this attempt is invisible (the
    // billing gate's round-2 finding: ranking `succeeded` rows alone put
    // this attempt at rank 1 and skipped it).
    await record(db, caps, {
      attemptId: "att_refused",
      purpose: "onboarding_brain",
      model: "claude-test",
      tokensIn: 10,
      tokensOut: 0,
      costMicroUsd: 1_000n,
      costState: "estimated",
      resolvedTier: "creator",
      promptBundleVersion: "v1",
      configVersion: 1,
      outcome: "refused",
      consumedIncludedBuild: true,
    });
    // The debit for THIS attempt is never written — the crash R-41 exists
    // to catch, on the one attempt the bug would have hidden it on.
    await record(db, caps, succeed("att_after_refusal"));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const ids = result.unbilledAttempts.map((a) => a.attemptId);
    expect(
      ids,
      "the succeeded attempt AFTER a consuming refusal must be flagged unbilled"
    ).toContain("att_after_refusal");
    expect(
      ids,
      "a refused attempt is never itself unbilled — refusals never reach the debit step"
    ).not.toContain("att_refused");
  });

  it("a bounded RETRY writing TWO ROWS for ONE attempt_id ranks as ONE attempt, not two (billing gate round 3, 2026-08-29)", async () => {
    // `onboarding-schema.ts`'s own docblock plans for this: "a bounded retry
    // writes two rows" for one logical attempt, and `model_usage` has NO
    // unique constraint on `attempt_id` for exactly that reason. NOT reachable
    // through any caller today (every server action mints one fresh
    // `attemptId` per press) — this proves the QUERY honours the shape the
    // SCHEMA was built to allow, matching the claim's own `attempt_id` grain,
    // not merely today's callers.
    const caps = writeCapabilities(await scopeFor());
    const retried = {
      attemptId: "att_retried",
      purpose: "onboarding_brain",
      model: "claude-test",
      tokensIn: 10,
      tokensOut: 0,
      costMicroUsd: 1_000n,
      costState: "estimated" as const,
      resolvedTier: "creator" as const,
      promptBundleVersion: "v1",
      configVersion: 1,
      consumedIncludedBuild: true,
    };
    // Row 1: the bounded retry's first, non-terminal outcome.
    await record(db, caps, { ...retried, outcome: "schema_invalid" });
    // Row 2: the SAME attempt_id, now succeeded — this row alone is the
    // profile's free build (rank 1 at ATTEMPT grain). A row-grain query
    // would see TWO distinct rows for this partition before any second
    // attempt exists, wrongly bumping this succeeded row to rank 2 and
    // reporting it unbilled despite owing no debit.
    await record(db, caps, { ...retried, outcome: "succeeded" });

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    expect(
      result.unbilledAttempts.map((a) => a.attemptId),
      "two rows sharing one attempt_id must not inflate that attempt's rank — it is still the free first build"
    ).not.toContain("att_retried");
  });

  it("a second attempt WITH a matching debit is not unbilled", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, succeed("att_first"));
    await record(db, caps, succeed("att_paid"));
    await db.insert(creditLedger).values({
      workspaceId,
      delta: -50,
      kind: "debit",
      refType: "inference",
      refId: "att_paid",
    });
    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    expect(result.unbilledAttempts.map((a) => a.attemptId)).not.toContain(
      "att_paid"
    );
  });

  it("a DIFFERENT profile's first attempt is ALSO free — rank is per (profile, purpose), not global", async () => {
    const capsA = writeCapabilities(await scopeFor());
    await record(db, capsA, succeed("att_a_first"));
    await record(db, capsA, succeed("att_a_second"));

    const [secondProfile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "B" })
      .returning();
    const scopeB = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "recon_user" }),
      secondProfile.id
    );
    const capsB = writeCapabilities(scopeB);
    // A's SECOND attempt (unbilled), then B's FIRST (free) — global order
    // would rank this fourth overall and wrongly call it unbilled if the
    // partition were missing.
    await record(db, capsB, succeed("att_b_first"));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const ids = result.unbilledAttempts.map((a) => a.attemptId);
    expect(ids).toContain("att_a_second");
    expect(ids).not.toContain("att_a_first");
    expect(ids).not.toContain("att_b_first");
  });

  // ------------------------------------------------------------------ R-81
  //
  // THE PURPOSE THAT HAS NO INCLUDED BUILD. `recordModelUsage` writes a claim
  // for EVERY purpose (`firstBillableAttempts`' own docblock: the table is
  // purpose-neutral, because @respin/db does not own the purpose list), and
  // `priceOf`'s generation branch charges EVERY generation. So exempting "the
  // attempt that holds the claim" unconditionally hid one lost debit per
  // profile — the creator's FIRST generation, which is the press most likely
  // to hit R-41's crash window on a fresh workspace.
  const generate = (attemptId: string) => ({
    ...succeed(attemptId),
    purpose: "generation",
  });

  it("a FIRST successful GENERATION with no debit IS unbilled — no generation is ever free, so holding the claim exempts nothing (R-81)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, generate("att_gen_first"));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    expect(
      result.unbilledAttempts.map((a) => a.attemptId),
      "the first generation holds the (profile,'generation') claim, but generation has no included build — a lost debit here must be reported"
    ).toContain("att_gen_first");
  });

  it("...and it is the CLAIM HOLDER that was hidden: the second generation was always reported (R-81 is one lost debit per profile, not all of them)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, generate("att_gen_first"));
    await record(db, caps, generate("att_gen_second"));

    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    const ids = result.unbilledAttempts.map((a) => a.attemptId);
    expect(ids).toContain("att_gen_first");
    expect(ids).toContain("att_gen_second");
  });

  it("a generation WITH its debit is not unbilled — the wider population still reports only real losses", async () => {
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, generate("att_gen_paid"));
    await db.insert(creditLedger).values({
      workspaceId,
      delta: -2,
      kind: "debit",
      refType: "inference",
      refId: "att_gen_paid",
    });
    const result = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    expect(result.unbilledAttempts.map((a) => a.attemptId)).not.toContain(
      "att_gen_paid"
    );
  });

  // ------------------------------------------------------------------ R-85
  //
  // TODAY'S CONFIG MUST NOT JUDGE YESTERDAY'S ATTEMPTS. `model_usage.
  // config_version` is NOT NULL and records the document each attempt was
  // priced under; this query had no `config_version` term at all, so the
  // exemption was whatever the ACTIVE document said. A price CUT (25 -> 0)
  // therefore hid every claim holder's lost debit incurred while it was 25 —
  // the fail-open direction `included-build.ts` names as the one that must
  // never happen.

  it("THE VERSION DECIDES, PER ROW: a claim holder priced under a document that charged it is REPORTED, even when today's document would exempt it", async () => {
    const caps = writeCapabilities(await scopeFor());
    // Profile A's claim holder, priced under version 1 — the document where
    // `onboardingBrainBuild` was 25, so this attempt OWED a debit and never
    // got one.
    await record(db, caps, { ...succeed("att_v1_holder"), configVersion: 1 });

    // Profile B's claim holder, priced under version 2 — the document that
    // prices the included build at 0. It owes nothing.
    const [second] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "B" })
      .returning();
    const capsB = writeCapabilities(
      await ProfileScope.mint(
        db,
        await withWorkspace(db, { authUserId: "recon_user" }),
        second.id
      )
    );
    await record(db, capsB, { ...succeed("att_v2_holder"), configVersion: 2 });

    const result = await reconcileSpend(
      db,
      includedPerVersion({ 1: [], 2: ["onboarding_brain"] })
    );
    const ids = result.unbilledAttempts.map((a) => a.attemptId);
    expect(
      ids,
      "an attempt priced under a document that charged its claim holder must be reported — judging it by today's cheaper document HIDES that lost debit"
    ).toContain("att_v1_holder");
    expect(
      ids,
      "the attempt priced under the free document owes nothing and must stay out of the report"
    ).not.toContain("att_v2_holder");

    // AND THE OTHER DIRECTION, so this is a per-version rule and not a
    // per-attempt accident: answer for BOTH versions and both are exempt.
    const bothFree = await reconcileSpend(
      db,
      includedPerVersion({
        1: ["onboarding_brain"],
        2: ["onboarding_brain"],
      })
    );
    expect(bothFree.unbilledAttempts.map((a) => a.attemptId)).toEqual([]);
  });

  it("AN ATTEMPT STRADDLING A PRICE CHANGE IS JUDGED BY ITS STRICTER HALF — the only case `bool_and` and `bool_or` disagree on", async () => {
    // THE WITNESS THE `bool_and` NEVER HAD (billing gate, 2026-09-02). The
    // operator was chosen for its DIRECTION — "an attempt is exempt only if
    // EVERY one of its rows was priced under a document that exempts it" — and
    // all fourteen `configVersion` call sites in both rollup suites wrote
    // groups that were UNIFORM in `config_version`, including the two-row
    // retry case above. On a uniform group `bool_and` and `bool_or` are the
    // same function, so nothing could tell them apart and a directional choice
    // about MONEY had no test at all.
    //
    // THE SHAPE `model_usage` WAS BUILT TO ALLOW: no unique constraint on
    // `attempt_id`, because "a bounded retry writes two rows" — and a retry
    // that spans an operator's price change writes them under two documents.
    // Row 1 was priced under version 1, which CHARGED the included build; row
    // 2 under version 2, which gives it away. `bool_or` would exempt this
    // attempt on the strength of the cheaper row and HIDE the debit the first
    // row owed, which is the exact fail-open direction R-85 exists to close.
    const caps = writeCapabilities(await scopeFor());
    const straddling = {
      attemptId: "att_straddles_versions",
      purpose: "onboarding_brain",
      model: "claude-test",
      tokensIn: 10,
      tokensOut: 0,
      costMicroUsd: 1_000n,
      costState: "estimated" as const,
      resolvedTier: "creator" as const,
      promptBundleVersion: "v1",
      consumedIncludedBuild: true,
    };
    await record(db, caps, {
      ...straddling,
      configVersion: 1,
      outcome: "schema_invalid",
    });
    await record(db, caps, {
      ...straddling,
      configVersion: 2,
      outcome: "succeeded",
    });

    const result = await reconcileSpend(
      db,
      includedPerVersion({ 1: [], 2: ["onboarding_brain"] })
    );
    expect(
      result.unbilledAttempts.map((a) => a.attemptId),
      "an attempt with a row priced under a document that CHARGED it was exempted anyway — `bool_or` hides that lost debit"
    ).toContain("att_straddles_versions");

    // NON-VACUITY, so this is a statement about the STRADDLE and not about the
    // attempt: with BOTH versions exempting, the same two rows drop out.
    const bothExempt = await reconcileSpend(
      db,
      includedPerVersion({ 1: ["onboarding_brain"], 2: ["onboarding_brain"] })
    );
    expect(
      bothExempt.unbilledAttempts.map((a) => a.attemptId),
      "the attempt is reported even when every one of its rows was priced under an exempting document — this case is not about the straddle at all"
    ).not.toContain("att_straddles_versions");
  });

  it("the resolver is asked about the versions THE DATA carries, and a version it does not answer for is NOT exempt", async () => {
    // The population half. A resolver handed the wrong versions — or a query
    // that stopped asking — cannot be caught by an assertion about the report
    // alone, so the argument itself is captured. And an omitted version fails
    // SAFE: it reports an attempt that may have owed nothing rather than
    // hiding one that did.
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, { ...succeed("att_v9"), configVersion: 9 });

    const asked: number[][] = [];
    const result = await reconcileSpend(db, async (versions) => {
      asked.push([...versions].sort((a, b) => a - b));
      return new Map();
    });
    expect(asked, "the query no longer asks which versions the data was priced under").toEqual([
      [9],
    ]);
    expect(
      result.unbilledAttempts.map((a) => a.attemptId),
      "a version the caller could not answer for must not be exempt"
    ).toContain("att_v9");
  });

  it("THE PARAMETER'S FALSE BRANCH: with an EMPTY included-build list, even the onboarding claim holder is reported — the exemption is the caller's answer, not a constant", async () => {
    // A required parameter with no default reads exactly like a guard and is
    // not one until a test drives its false branch (CLAUDE.md 2026-08-29).
    // Deleting the purpose predicate from the query leaves every case above
    // green if the list is never varied — so it is varied here.
    const caps = writeCapabilities(await scopeFor());
    await record(db, caps, succeed("att_first"));

    const exempted = await reconcileSpend(db, includedFor(INCLUDED_BUILD_PURPOSES));
    expect(exempted.unbilledAttempts.map((a) => a.attemptId)).not.toContain(
      "att_first"
    );

    const notExempted = await reconcileSpend(db, includedFor([]));
    expect(
      notExempted.unbilledAttempts.map((a) => a.attemptId),
      "with no purpose holding an included build, every successful attempt owes a debit"
    ).toContain("att_first");
  });
});
