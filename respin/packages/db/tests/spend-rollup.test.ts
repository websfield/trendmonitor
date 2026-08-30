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
  applyReconciliationDelta,
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
    const result = await reconcileSpend(db);
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

    const result = await reconcileSpend(db);
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

    const result = await reconcileSpend(db);
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

    const result = await reconcileSpend(db);
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

    const result = await reconcileSpend(db);
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

    const result = await reconcileSpend(db);
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
    // free slot. `countBillableAttempts` (with-workspace.ts) counts this
    // row (`outcome IN BILLABLE_USAGE_OUTCOMES AND consumedIncludedBuild =
    // true`), so the real pricing logic prices the NEXT (successful)
    // attempt — even though it is the first to succeed. The rank query must
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

    const result = await reconcileSpend(db);
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
    // SCHEMA was built to allow, matching `countBillableAttempts`'s own
    // `countDistinct(attemptId)` grain, not merely today's callers.
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

    const result = await reconcileSpend(db);
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
    const result = await reconcileSpend(db);
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

    const result = await reconcileSpend(db);
    const ids = result.unbilledAttempts.map((a) => a.attemptId);
    expect(ids).toContain("att_a_second");
    expect(ids).not.toContain("att_a_first");
    expect(ids).not.toContain("att_b_first");
  });
});

describe("applyReconciliationDelta (R4a): model_usage's one sanctioned UPDATE, and its exactly-once rollup delta", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "delta_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "delta_user", name: "A" })
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
      await withWorkspace(db, { authUserId: "delta_user" }),
      profileId
    );

  const rollupRow = async () => {
    const [row] = await db
      .select()
      .from(workspaceSpendMonthly)
      .where(eq(workspaceSpendMonthly.workspaceId, workspaceId));
    return row;
  };

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

  it("reconciling an ESTIMATED row applies only the (reconciled - estimated) cost delta; call_count and unknown_call_count are untouched", async () => {
    const caps = writeCapabilities(await scopeFor());
    const usage = await record(
      db,
      caps,
      baseUsage({ attemptId: "att_est", costMicroUsd: 1_000n, costState: "estimated" })
    );
    const before = await rollupRow();
    expect(before.costMicroUsd).toBe(1_000n);
    expect(before.callCount).toBe(1);

    const result = await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usage.id,
        reconciledCostMicroUsd: 1_500n,
      })
    );
    expect(result.applied).toBe(true);

    const after = await rollupRow();
    // 1_000 (estimated, already in the total) -> 1_500 (reconciled): +500 delta.
    expect(after.costMicroUsd).toBe(1_500n);
    expect(after.callCount).toBe(1);
    expect(after.unknownCallCount).toBe(0);

    const [usageRow] = await db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.id, usage.id));
    expect(usageRow.costState).toBe("reconciled");
    expect(usageRow.costMicroUsd).toBe(1_500n);
  });

  it("reconciling an UNKNOWN row applies the full reconciled cost AND decrements unknown_call_count by exactly 1 (R4a's other branch)", async () => {
    const caps = writeCapabilities(await scopeFor());
    const usage = await record(
      db,
      caps,
      baseUsage({
        attemptId: "att_unk",
        costMicroUsd: null,
        costState: "unknown",
        outcome: "unavailable",
      })
    );
    const before = await rollupRow();
    expect(before.costMicroUsd).toBe(0n);
    expect(before.unknownCallCount).toBe(1);

    await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usage.id,
        reconciledCostMicroUsd: 2_000n,
      })
    );

    const after = await rollupRow();
    expect(after.costMicroUsd).toBe(2_000n);
    expect(after.unknownCallCount).toBe(0);
    expect(after.callCount).toBe(1);
  });

  it("R4a / M9: a duplicate reconciliation call is a NO-OP — one exact cost delta, unknown_call_count decremented once, never double-counted", async () => {
    const caps = writeCapabilities(await scopeFor());
    const usage = await record(
      db,
      caps,
      baseUsage({
        attemptId: "att_dup",
        costMicroUsd: null,
        costState: "unknown",
        outcome: "unavailable",
      })
    );

    const first = await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usage.id,
        reconciledCostMicroUsd: 3_000n,
      })
    );
    expect(first.applied).toBe(true);

    // THE RETRY — same usageId, same (in this case, even different) reconciled
    // figure, inside its own transaction, exactly the shape a duplicate
    // webhook/job delivery produces.
    const second = await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usage.id,
        reconciledCostMicroUsd: 3_000n,
      })
    );
    expect(second.applied).toBe(false);
    // billing gate round 1 (2026-08-30): the no-op branch reports the row's
    // ALREADY-RECORDED cost, so a future caller can diff it against the
    // reconciled figure it was about to apply and detect a genuine second
    // reconciliation (a corrected price) rather than lose it the way a bare
    // `{ applied: false }` would. Here the retry replays the SAME figure
    // (3_000n), so `priorCostMicroUsd` equals it — the mismatch case is
    // covered next.
    expect(second).toEqual({ applied: false, priorCostMicroUsd: 3_000n });

    const after = await rollupRow();
    // If the mutation under test (M9: the retry applies its delta twice)
    // were present, this would read 6_000n and unknownCallCount -2 (i.e. -1
    // net, clamped or not depending on the mutation's shape) — either way,
    // NOT this exact, once-applied figure.
    expect(after.costMicroUsd).toBe(3_000n);
    expect(after.unknownCallCount).toBe(0);
    expect(after.callCount).toBe(1);
  });

  it("billing gate round 1 (2026-08-30): a SECOND reconciliation carrying a CORRECTED price is still a no-op on the rollup, but reports the mismatch a caller can now detect", async () => {
    const caps = writeCapabilities(await scopeFor());
    const usage = await record(
      db,
      caps,
      baseUsage({ attemptId: "att_corrected", costMicroUsd: 1_000n, costState: "estimated" })
    );

    const first = await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usage.id,
        reconciledCostMicroUsd: 1_500n,
      })
    );
    expect(first).toEqual({ applied: true });

    // A SECOND reconciliation for the SAME row, carrying a DIFFERENT figure —
    // the shape a genuine correction (not a duplicate delivery) produces.
    // This function still applies NO delta (the row is already `reconciled`;
    // there is no reconciliation webhook yet to call this a second time on
    // its own initiative — see this function's docblock), but the no-op
    // result now carries enough for a FUTURE caller to tell the two cases
    // apart: `priorCostMicroUsd` (1_500n, what actually landed) disagrees
    // with the 1_800n this call was about to apply, which a bare
    // `{ applied: false }` could never surface.
    const second = await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usage.id,
        reconciledCostMicroUsd: 1_800n,
      })
    );
    expect(second).toEqual({ applied: false, priorCostMicroUsd: 1_500n });

    const after = await rollupRow();
    // The rollup is UNCHANGED by the second call — still 1_500n, never
    // bumped to 1_800n. The mismatch is reported, not silently applied.
    expect(after.costMicroUsd).toBe(1_500n);
    expect(after.callCount).toBe(1);

    const [usageRow] = await db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.id, usage.id));
    expect(usageRow.costMicroUsd).toBe(1_500n);
  });

  it("a SECOND distinct model_usage row in the same grain is unaffected by the first row's reconciliation (the delta targets its own row, never the grain in bulk)", async () => {
    const caps = writeCapabilities(await scopeFor());
    const usageA = await record(
      db,
      caps,
      baseUsage({ attemptId: "att_a", costMicroUsd: 1_000n, costState: "estimated" })
    );
    await record(
      db,
      caps,
      baseUsage({ attemptId: "att_b", costMicroUsd: 2_000n, costState: "estimated" })
    );

    await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usageA.id,
        reconciledCostMicroUsd: 1_100n,
      })
    );

    const [rowB] = await db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.attemptId, "att_b"));
    expect(rowB.costState).toBe("estimated");
    expect(rowB.costMicroUsd).toBe(2_000n);

    const after = await rollupRow();
    // 1_000 (A, now reconciled to 1_100) + 2_000 (B, unchanged) = 3_100.
    expect(after.costMicroUsd).toBe(3_100n);
    expect(after.callCount).toBe(2);
  });

  it("no model_usage row for the given id throws rather than silently no-op'ing", async () => {
    await expect(
      db.transaction((tx) =>
        applyReconciliationDelta(tx, {
          usageId: "00000000-0000-0000-0000-000000000000",
          reconciledCostMicroUsd: 1n,
        })
      )
    ).rejects.toThrow();
  });

  // INTEGRATION WITH reconcileSpend (R11-R13): applyReconciliationDelta and
  // reconcileSpend are tested independently everywhere else in this file —
  // this is the one case that runs BOTH against the same grain, because a
  // rollup row and a model_usage row that have each been touched by the
  // reconciliation path could disagree in a way neither function's own
  // tests would catch alone.
  it("a RECONCILED row reads as RECONCILED to reconcileSpend, never drift — the two functions' totals agree after the transition", async () => {
    const caps = writeCapabilities(await scopeFor());
    const usage = await record(
      db,
      caps,
      baseUsage({
        attemptId: "att_recon_integration",
        costMicroUsd: 800n,
        costState: "estimated",
      })
    );

    await db.transaction((tx) =>
      applyReconciliationDelta(tx, {
        usageId: usage.id,
        reconciledCostMicroUsd: 1_250n,
      })
    );

    const result = await reconcileSpend(db);
    const row = result.rows.find((r) => r.workspaceId === workspaceId);
    expect(
      row?.class,
      "reconcileSpend's own sum (excluding cost_state='unknown') must agree with the rollup's post-delta total, or the reconciliation transition itself introduced drift"
    ).toBe("reconciled");
    expect(row?.rollupCostMicroUsd).toBe(1_250n);
    expect(row?.usageCostMicroUsd).toBe(1_250n);
  });
});
