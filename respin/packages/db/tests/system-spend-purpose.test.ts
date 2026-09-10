// Phase 10a plan C3 (R-117): one system-spend authority, two CHECKed
// purposes. The purpose sub-cap lives inside the global cap and is derived
// from the claims; the in-flight count and the stale recovery are the
// concurrency and crash halves of the same authority.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS,
  PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD,
  PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS,
  PUBLIC_SAMPLE_SPIN_FINALISE_MARGIN_MS,
  SYSTEM_SPEND_PURPOSES,
  claimSystemSpend,
  publicSampleSpinInFlightCount,
  recordSystemModelUsage,
  recoverStalePublicSampleSpinAttempts,
  type SystemSpendClaim,
} from "../src/system-spend";
import { systemModelUsage, systemSpendClaims, systemSpendDaily, systemSpendPurpose } from "../src/system-spend-schema";
import { createTestDb } from "../src/testing";

// The claims' `created_at` is the DATABASE clock, so the in-flight and stale
// checks run on the real clock rather than a fixed instant.
const NOW = new Date();
const DATE = NOW.toISOString().slice(0, 10);

/** The driver's SQLSTATE and constraint, from the wrapped cause a drizzle failure carries. */
async function refusal(run: () => Promise<unknown>): Promise<{ code?: string; constraint?: string } | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
    return { code: cause.code, constraint: cause.constraint };
  }
}

function publicClaim(id: string, reserve = 618_560n, purposeCap = PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD): SystemSpendClaim {
  return {
    jobAttemptId: `sample:${id}`,
    businessDate: DATE,
    capMicroUsd: 100_000_000n,
    reserveMicroUsd: reserve,
    attribution: { purpose: "public_sample_spin", jobId: id, model: "claude-sonnet-5" },
    purposeCapMicroUsd: purposeCap,
  };
}

function usageFor(id: string, overrides: Partial<Parameters<typeof recordSystemModelUsage>[1]> = {}) {
  return {
    jobAttemptId: `sample:${id}`,
    jobId: id,
    trendItemId: null,
    purpose: "public_sample_spin" as const,
    model: "claude-sonnet-5",
    tokensIn: 10,
    tokensOut: 5,
    costMicroUsd: 100n,
    costState: "measured" as const,
    outcome: "succeeded" as const,
    callCount: 2,
    unknownCallCount: 0,
    errorCode: null,
    businessDate: DATE,
    ...overrides,
  };
}

describe("the purpose union", () => {
  it("is the same closed list in code and in the schema enum", () => {
    expect([...SYSTEM_SPEND_PURPOSES].sort()).toEqual([...systemSpendPurpose.enumValues].sort());
  });
});

describe("the purpose sub-cap inside the global cap", () => {
  it("admits sixteen worst-case attempts at $10/day and refuses the seventeenth as cap_exhausted while the global cap still has room", async () => {
    const db = await createTestDb();
    for (let i = 0; i < 16; i += 1) {
      await expect(claimSystemSpend(db, publicClaim(`r${i}`))).resolves.toEqual({ status: "claimed" });
    }
    await expect(claimSystemSpend(db, publicClaim("r16"))).resolves.toEqual({ status: "cap_exhausted" });
    const [daily] = await db.select().from(systemSpendDaily);
    expect(daily!.reservedMicroUsd).toBe(16n * 618_560n);
    expect(daily!.capMicroUsd).toBe(100_000_000n);
    const [refused] = await db.select().from(systemSpendClaims).where(eq(systemSpendClaims.jobAttemptId, "sample:r16"));
    expect(refused).toMatchObject({ status: "cap_exhausted", purpose: "public_sample_spin", reservedMicroUsd: 0n, requestedMicroUsd: 618_560n, trendItemId: null, autopsyCacheClaimId: null });
  });

  it("config can only TIGHTEN the purpose cap: a lower stored cap refuses sooner, a higher one is clamped to the code ceiling", async () => {
    const db = await createTestDb();
    await expect(claimSystemSpend(db, publicClaim("a", 618_560n, 618_560n))).resolves.toEqual({ status: "claimed" });
    await expect(claimSystemSpend(db, publicClaim("b", 618_560n, 618_560n))).resolves.toEqual({ status: "cap_exhausted" });
    const generous = await createTestDb();
    for (let i = 0; i < 16; i += 1) await claimSystemSpend(generous, publicClaim(`g${i}`, 618_560n, 1_000_000_000n));
    await expect(claimSystemSpend(generous, publicClaim("g16", 618_560n, 1_000_000_000n))).resolves.toEqual({ status: "cap_exhausted" });
  });

  it("a public claim without its purpose cap, or an autopsy claim with one, is refused before any row", async () => {
    const db = await createTestDb();
    await expect(claimSystemSpend(db, { ...publicClaim("x"), purposeCapMicroUsd: undefined })).rejects.toThrow(/purpose cap/);
    await expect(claimSystemSpend(db, {
      jobAttemptId: "autopsy:1",
      businessDate: DATE,
      capMicroUsd: 100_000_000n,
      reserveMicroUsd: 100n,
      attribution: { purpose: "trend_autopsy", jobId: "j", trendItemId: "00000000-0000-7000-8000-000000000001", autopsyCacheClaimId: "00000000-0000-7000-8000-000000000002", model: "m" },
      purposeCapMicroUsd: 1n,
    })).rejects.toThrow(/only the public sample spin purpose/);
  });
});

describe("the attribution CHECKs per purpose", () => {
  it("a public claim row with a trend item id is refused by the database; an autopsy row may lose its ids to the 90-day scrub", async () => {
    const db = await createTestDb();
    await db.insert(systemSpendDaily).values({ businessDate: DATE, capMicroUsd: 1_000_000n });
    expect((await refusal(() => db.insert(systemSpendClaims).values({
      jobAttemptId: "bad-public", jobId: "j", trendItemId: "00000000-0000-7000-8000-000000000001", autopsyCacheClaimId: null,
      purpose: "public_sample_spin", model: "m", businessDate: DATE, reservedMicroUsd: 1n, requestedMicroUsd: 1n, status: "reserved",
    })))?.constraint).toBe("system_spend_claims_attribution_shape");
    expect(await refusal(() => db.insert(systemSpendClaims).values({
      jobAttemptId: "scrubbed-autopsy", jobId: "j", trendItemId: null, autopsyCacheClaimId: null,
      purpose: "trend_autopsy", model: "m", businessDate: DATE, reservedMicroUsd: 1n, requestedMicroUsd: 1n, status: "reserved",
    }))).toBeNull();
    // The WRITE path still requires them: the CHECK is not the only guard.
    await expect(claimSystemSpend(db, {
      jobAttemptId: "autopsy:noid", businessDate: DATE, capMicroUsd: 100_000_000n, reserveMicroUsd: 100n,
      attribution: { purpose: "trend_autopsy", jobId: "j", trendItemId: " ", autopsyCacheClaimId: "c", model: "m" },
    })).rejects.toThrow(/trendItemId is required/);
  });

  it("a successful public attempt records two or three calls — one and four are refused in code and in SQL", async () => {
    const db = await createTestDb();
    await claimSystemSpend(db, publicClaim("s"));
    await expect(recordSystemModelUsage(db, usageFor("s", { callCount: 1 }))).rejects.toThrow(/drafts and the scoring call/);
    await expect(recordSystemModelUsage(db, usageFor("s", { callCount: 4 }))).rejects.toThrow(/outside its fixed pipeline/);
    expect((await refusal(() => db.insert(systemModelUsage).values({
      jobAttemptId: "sample:s", jobId: "s", trendItemId: null, purpose: "public_sample_spin", model: "m",
      tokensIn: 1, tokensOut: 1, costMicroUsd: 1n, reservedCostMicroUsd: 618_560n, reservationOverrunMicroUsd: 0n,
      costState: "measured", outcome: "succeeded", callCount: 4, unknownCallCount: 0, errorCode: null, businessDate: DATE,
    })))?.constraint).toBe("system_model_usage_call_shape");
    await expect(recordSystemModelUsage(db, usageFor("s", { callCount: 3 }))).resolves.toEqual({ inserted: true });
  });
});

describe("in-flight count and stale recovery", () => {
  it("a reserved public claim with no usage row is in flight until it is finalised or its lease passes — on the DATABASE clock", async () => {
    const db = await createTestDb();
    await claimSystemSpend(db, publicClaim("f1"));
    await claimSystemSpend(db, publicClaim("f2"));
    await db.transaction(async (tx) => expect(await publicSampleSpinInFlightCount(tx)).toBe(2));
    await recordSystemModelUsage(db, usageFor("f1"));
    await db.transaction(async (tx) => expect(await publicSampleSpinInFlightCount(tx)).toBe(1));
    // Age the remaining claim past the lease by moving its database timestamp.
    await db.update(systemSpendClaims).set({ createdAt: new Date(Date.now() - PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS - 60_000) }).where(eq(systemSpendClaims.jobAttemptId, "sample:f2"));
    await db.transaction(async (tx) => expect(await publicSampleSpinInFlightCount(tx)).toBe(0));
    // The lease is derived from the compiled deadline ceiling plus the finalise margin, never the reverse.
    expect(PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS).toBe(PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS + PUBLIC_SAMPLE_SPIN_FINALISE_MARGIN_MS);
    expect(PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS).toBe(120_000);
  });

  it("recovers a stale outbound-started attempt as UNKNOWN / recovery_required with the full call count, never refunds, never twice", async () => {
    const db = await createTestDb();
    await claimSystemSpend(db, publicClaim("stale"));
    await claimSystemSpend(db, publicClaim("fresh"));
    // Age the first claim past the lease; the second stays fresh.
    await db.update(systemSpendClaims).set({ createdAt: new Date(Date.now() - PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS - 60_000) }).where(eq(systemSpendClaims.jobAttemptId, "sample:stale"));
    await expect(recoverStalePublicSampleSpinAttempts(db)).resolves.toEqual({ recovered: 1, failed: 0 });
    await expect(recoverStalePublicSampleSpinAttempts(db)).resolves.toEqual({ recovered: 0, failed: 0 });
    const [usage] = await db.select().from(systemModelUsage).where(eq(systemModelUsage.jobAttemptId, "sample:stale"));
    expect(usage).toMatchObject({ outcome: "vendor_failed", errorCode: "recovery_required", costState: "unknown", callCount: 3, unknownCallCount: 3, costMicroUsd: null, reservedCostMicroUsd: 618_560n });
    const [daily] = await db.select().from(systemSpendDaily);
    expect(daily).toMatchObject({ reservedMicroUsd: 2n * 618_560n, unknownCallCount: 3, callCount: 3 });
    // The fresh attempt is untouched and still in flight.
    const fresh = await db.select().from(systemModelUsage).where(eq(systemModelUsage.jobAttemptId, "sample:fresh"));
    expect(fresh).toHaveLength(0);
  });
});

describe("the recovery / finalise race (billing gate, round 1)", () => {
  it("a candidate scanned as stale but finalised before the recovery transaction is left alone — no throw, not recovered", async () => {
    const db = await createTestDb();
    await claimSystemSpend(db, publicClaim("race"));
    await db.update(systemSpendClaims).set({ createdAt: new Date(Date.now() - PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS - 60_000) }).where(eq(systemSpendClaims.jobAttemptId, "sample:race"));
    // The live attempt finalises BETWEEN the scan and the candidate's own
    // transaction (billing round 2: recording it before the scan never reached
    // the in-transaction re-check, so that witness was vacuous). Without the
    // re-check this insert conflicts and the candidate counts as failed.
    let interposed = false;
    const racing = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return async (...args: unknown[]) => {
            if (!interposed) {
              interposed = true;
              await recordSystemModelUsage(db, usageFor("race"));
            }
            return (target.transaction as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as typeof db;
    await expect(recoverStalePublicSampleSpinAttempts(racing)).resolves.toEqual({ recovered: 0, failed: 0 });
    expect(interposed).toBe(true);
    const rows = await db.select().from(systemModelUsage).where(eq(systemModelUsage.jobAttemptId, "sample:race"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: "succeeded", costState: "measured" });
  });
});

describe("per-candidate isolation (lean gate round 1 R-5d; witnessed round 2)", () => {
  it("one candidate's failing transaction is counted, the next candidate still recovers, and the next tick picks the failed one up", async () => {
    const db = await createTestDb();
    await claimSystemSpend(db, publicClaim("first"));
    await claimSystemSpend(db, publicClaim("second"));
    await db.update(systemSpendClaims).set({ createdAt: new Date(Date.now() - PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS - 60_000) });
    let calls = 0;
    const flaky = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return (...args: unknown[]) => {
            calls += 1;
            if (calls === 1) throw new Error("connection reset by peer");
            return (target.transaction as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as typeof db;
    await expect(recoverStalePublicSampleSpinAttempts(flaky)).resolves.toEqual({ recovered: 1, failed: 1 });
    expect(await db.select().from(systemModelUsage)).toHaveLength(1);
    await expect(recoverStalePublicSampleSpinAttempts(db)).resolves.toEqual({ recovered: 1, failed: 0 });
    expect(await db.select().from(systemModelUsage)).toHaveLength(2);
  });
});
