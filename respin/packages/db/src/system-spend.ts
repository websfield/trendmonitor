// The only writer for the non-tenant system budget (R21/R21a). The worker owns
// scheduling and vendor calls; this module owns atomic pre-call reservation,
// append-only attribution, and cache completion/failure transitions.
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import {
  AUTOPSY_ATTEMPT_CODE_CEILING,
  AUTOPSY_CLAIM_LEASE_MS,
  AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
} from "./autopsy-policy";
import {
  systemModelUsage,
  systemModelUsageReconciliations,
  systemSpendClaims,
  systemSpendDaily,
  systemWorkerHealth,
  type SystemModelUsage,
} from "./system-spend-schema";
import { autopsies, autopsyCacheClaims, trendItems, trendTranscripts } from "./trends-schema";
import {
  parseCanonicalAutopsyAnalysis,
  type CanonicalAutopsyAnalysis,
} from "./trends-storage";
import { resolveAutopsyFramework } from "./frameworks";
import { isActiveProfileLifecycleForSystemInTx } from "./membership-lifecycle";

export type SystemSpendAttribution = {
  jobId: string;
  trendItemId: string;
  autopsyCacheClaimId: string;
  purpose: "trend_autopsy";
  model: string;
};

export type SystemSpendClaim = {
  jobAttemptId: string;
  businessDate: string;
  capMicroUsd: bigint;
  reserveMicroUsd: bigint;
  attribution: SystemSpendAttribution;
};

export type SystemSpendClaimResult =
  | { status: "claimed" }
  | { status: "duplicate" }
  | { status: "cap_exhausted" };

/**
 * R21a's non-configurable release ceiling: $100/day in micro-USD. This is an
 * unmeasured launch circuit breaker for a new sessionless vendor path, not a
 * claim about expected spend; runtime config may only reduce it.
 */
export const SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD = 100_000_000n;
/**
 * How many pending cache claims one dispatcher tick may pick up (R21a's
 * "bounded worker concurrency" at the queue-admission grain).
 *
 * AN UNMEASURED LAUNCH BOUND, not a derived number (billing gate CHANGE 4,
 * 2026-09-03 — this literal shaped money with no citation). It bounds how many
 * per-attempt reservations a single tick can place against the R-89 daily cap
 * before the next tick re-reads operational state; it is neither a throughput
 * target nor a measured queue depth. Revisit trigger: the first T-15 refresh
 * that produces real autopsy candidates, or the first observed tick where the
 * dispatcher reaches this ceiling — whichever comes first.
 */
export const SYSTEM_AUTOPSY_DISPATCH_BATCH_CODE_CEILING = 32;

export type SystemAutopsyQueueCandidate = {
  cacheClaimId: string;
  itemId: string;
  attemptNumber: number;
};

export type SystemWorkerOperationalState = {
  parkedJobs: number;
  budgetSpentMicroUsd: number;
  budgetCapMicroUsd: number;
  lastSuccessfulScheduleAt: Date | null;
  lastSuccessfulRunAt: Date | null;
};

function boundedBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("system autopsy dispatch batch size must be a positive safe integer");
  }
  return Math.min(value, SYSTEM_AUTOPSY_DISPATCH_BATCH_CODE_CEILING);
}

/**
 * Content-free scheduler read. Owner ids, rights scope, transcript bytes and
 * creator data remain inside the DB adapter; pg-boss receives only the two
 * opaque ids the system-attempt authority already requires.
 */
export async function systemAutopsyQueueCandidates(
  db: DbLike,
  limit = SYSTEM_AUTOPSY_DISPATCH_BATCH_CODE_CEILING,
): Promise<SystemAutopsyQueueCandidate[]> {
  const rows = await db
    .select({
      cacheClaimId: autopsyCacheClaims.id,
      itemId: autopsyCacheClaims.trendItemId,
      attemptNumber: autopsyCacheClaims.attemptCount,
    })
    .from(autopsyCacheClaims)
    .where(and(
      inArray(autopsyCacheClaims.status, ["pending", "failed"]),
      isNull(autopsyCacheClaims.activeSystemAttemptId),
      lt(autopsyCacheClaims.attemptCount, AUTOPSY_ATTEMPT_CODE_CEILING + 1),
    ))
    .orderBy(asc(autopsyCacheClaims.updatedAt), asc(autopsyCacheClaims.id))
    .limit(boundedBatchSize(limit));
  return rows;
}

/**
 * Reclaim worker attempts whose process died after reserving the system
 * budget. The reservation is deliberately not refunded: an external call may
 * have happened before the crash. Instead the attempt is finalized with the
 * fixed pipeline's conservative unknown-call upper bound, then the cache is
 * made retryable or parked under the same attempt ceiling as an observed
 * failure.
 */
export async function recoverStaleSystemAutopsyAttempts(
  db: DbLike,
  now = new Date(),
  limit = SYSTEM_AUTOPSY_DISPATCH_BATCH_CODE_CEILING,
): Promise<{ recovered: number }> {
  if (!Number.isFinite(now.getTime())) throw new Error("stale-attempt recovery time is invalid");
  const stale = await db
    .select({ id: autopsyCacheClaims.id })
    .from(autopsyCacheClaims)
    .where(and(
      eq(autopsyCacheClaims.status, "pending"),
      isNotNull(autopsyCacheClaims.activeSystemAttemptId),
      isNotNull(autopsyCacheClaims.leaseExpiresAt),
      lt(autopsyCacheClaims.leaseExpiresAt, now),
    ))
    .orderBy(asc(autopsyCacheClaims.leaseExpiresAt), asc(autopsyCacheClaims.id))
    .limit(boundedBatchSize(limit));

  let recovered = 0;
  for (const candidate of stale) {
    const didRecover = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select 1 from ${autopsyCacheClaims} where ${autopsyCacheClaims.id} = ${candidate.id} for update`,
      );
      const [cacheClaim] = await tx
        .select()
        .from(autopsyCacheClaims)
        .where(eq(autopsyCacheClaims.id, candidate.id))
        .limit(1);
      if (
        !cacheClaim
        || cacheClaim.status !== "pending"
        || cacheClaim.activeSystemAttemptId === null
        || cacheClaim.leaseExpiresAt === null
        || cacheClaim.leaseExpiresAt.getTime() >= now.getTime()
      ) {
        return false;
      }

      const [claim] = await tx
        .select()
        .from(systemSpendClaims)
        .where(eq(systemSpendClaims.jobAttemptId, cacheClaim.activeSystemAttemptId))
        .limit(1);
      if (
        !claim
        || claim.status !== "reserved"
        || claim.autopsyCacheClaimId !== cacheClaim.id
        || claim.trendItemId !== cacheClaim.trendItemId
      ) {
        throw new Error("stale system autopsy attempt has no matching reserved spend claim");
      }

      await recordSystemModelUsageInTx(tx, {
        jobAttemptId: claim.jobAttemptId,
        jobId: claim.jobId,
        trendItemId: claim.trendItemId,
        purpose: "trend_autopsy",
        model: claim.model,
        tokensIn: null,
        tokensOut: null,
        costMicroUsd: null,
        costState: "unknown",
        outcome: "vendor_failed",
        callCount: AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
        unknownCallCount: AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
        errorCode: "worker_lease_expired",
        businessDate: claim.businessDate,
        reservedCostMicroUsd: claim.reservedMicroUsd,
        reservationOverrunMicroUsd: null,
      });
      await tx
        .update(autopsyCacheClaims)
        .set({
          status: cacheClaim.attemptCount >= AUTOPSY_ATTEMPT_CODE_CEILING
            ? "parked"
            : "failed",
          activeSystemAttemptId: null,
          leaseExpiresAt: null,
          lastFailureCode: "worker_lease_expired",
        })
        .where(eq(autopsyCacheClaims.id, cacheClaim.id));
      return true;
    });
    if (didRecover) recovered += 1;
  }
  return { recovered };
}

/** Read only aggregate operational facts; no tenant/content column crosses. */
export async function systemWorkerOperationalState(
  db: DbLike,
  workerName: string,
  businessDate: string,
): Promise<SystemWorkerOperationalState> {
  const cleanWorkerName = requiredText(workerName, "workerName");
  const cleanBusinessDate = requiredText(businessDate, "businessDate");
  const [parked] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopsyCacheClaims)
    .where(eq(autopsyCacheClaims.status, "parked"));
  const [daily] = await db
    .select({
      reservedMicroUsd: systemSpendDaily.reservedMicroUsd,
      capMicroUsd: systemSpendDaily.capMicroUsd,
    })
    .from(systemSpendDaily)
    .where(eq(systemSpendDaily.businessDate, cleanBusinessDate))
    .limit(1);
  const [health] = await db
    .select({
      lastSuccessfulScheduleAt: systemWorkerHealth.lastSuccessfulScheduleAt,
      lastSuccessfulRunAt: systemWorkerHealth.lastSuccessfulRunAt,
    })
    .from(systemWorkerHealth)
    .where(eq(systemWorkerHealth.workerName, cleanWorkerName))
    .limit(1);
  return {
    parkedJobs: parked?.count ?? 0,
    budgetSpentMicroUsd: daily
      ? safeNumber(daily.reservedMicroUsd, "daily reserved spend")
      : 0,
    budgetCapMicroUsd: daily
      ? safeNumber(daily.capMicroUsd, "daily cap")
      : 0,
    lastSuccessfulScheduleAt: health?.lastSuccessfulScheduleAt ?? null,
    lastSuccessfulRunAt: health?.lastSuccessfulRunAt ?? null,
  };
}

class DuplicateSystemSpendClaim extends Error {}

function requiredText(value: string, field: string): string {
  const clean = value.trim();
  if (clean.length === 0) throw new Error(`${field} is required`);
  return clean;
}

const SAFE_OPERATIONAL_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function claimValues(claim: SystemSpendClaim, status: "reserved" | "cap_exhausted") {
  const attribution = claim.attribution;
  return {
    jobAttemptId: requiredText(claim.jobAttemptId, "jobAttemptId"),
    businessDate: requiredText(claim.businessDate, "businessDate"),
    reservedMicroUsd: status === "reserved" ? claim.reserveMicroUsd : 0n,
    requestedMicroUsd: claim.reserveMicroUsd,
    status,
    jobId: requiredText(attribution.jobId, "jobId"),
    trendItemId: requiredText(attribution.trendItemId, "trendItemId"),
    autopsyCacheClaimId: requiredText(
      attribution.autopsyCacheClaimId,
      "autopsyCacheClaimId",
    ),
    purpose: attribution.purpose,
    model: requiredText(attribution.model, "model"),
  };
}

function assertStoredClaimMatches(
  stored: typeof systemSpendClaims.$inferSelect,
  claim: SystemSpendClaim,
): void {
  const expected = claimValues(claim, stored.status);
  if (
    stored.businessDate !== expected.businessDate
    || stored.requestedMicroUsd !== expected.requestedMicroUsd
    || stored.jobId !== expected.jobId
    || stored.trendItemId !== expected.trendItemId
    || stored.autopsyCacheClaimId !== expected.autopsyCacheClaimId
    || stored.purpose !== expected.purpose
    || stored.model !== expected.model
  ) {
    throw new Error("system spend attempt id is already bound to different work");
  }
}

/** Atomically reserve a code-ceiling amount before the vendor call. */
export async function claimSystemSpend(
  db: DbLike,
  claim: SystemSpendClaim,
): Promise<SystemSpendClaimResult> {
  if (claim.capMicroUsd < 0n || claim.reserveMicroUsd <= 0n) {
    throw new Error("system spend cap must be nonnegative and reservation positive");
  }
  try {
    return await db.transaction(async (tx) => claimInTx(tx, claim));
  } catch (error) {
    if (error instanceof DuplicateSystemSpendClaim) {
      const [stored] = await db.select().from(systemSpendClaims)
        .where(eq(systemSpendClaims.jobAttemptId, claim.jobAttemptId)).limit(1);
      if (!stored) throw new Error("duplicate system spend claim has no durable row");
      assertStoredClaimMatches(stored, claim);
      return { status: "duplicate" };
    }
    throw error;
  }
}

async function claimInTx(
  tx: TxLike,
  claim: SystemSpendClaim,
): Promise<SystemSpendClaimResult> {
  const [existing] = await tx
    .select()
    .from(systemSpendClaims)
    .where(eq(systemSpendClaims.jobAttemptId, claim.jobAttemptId))
    .limit(1);
  if (existing) {
    assertStoredClaimMatches(existing, claim);
    return { status: "duplicate" };
  }

  const effectiveCap =
    claim.capMicroUsd < SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD
      ? claim.capMicroUsd
      : SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD;
  await tx
    .insert(systemSpendDaily)
    .values({ businessDate: claim.businessDate, capMicroUsd: effectiveCap })
    .onConflictDoNothing();
  // A config change may tighten today's cap but never reopen it.
  await tx
    .update(systemSpendDaily)
    // A newly tighter document cannot make already-reserved spend disappear.
    // Clamp the retained cap at that irreversible reservation, which closes
    // further admission without violating reserved <= cap.
    .set({
      capMicroUsd: sql`GREATEST(${systemSpendDaily.reservedMicroUsd}, LEAST(${systemSpendDaily.capMicroUsd}, ${effectiveCap}))`,
    })
    .where(eq(systemSpendDaily.businessDate, claim.businessDate));
  const reserved = await tx
    .update(systemSpendDaily)
    .set({
      reservedMicroUsd: sql`${systemSpendDaily.reservedMicroUsd} + ${claim.reserveMicroUsd}`,
    })
    .where(
      and(
        eq(systemSpendDaily.businessDate, claim.businessDate),
        sql`${systemSpendDaily.reservedMicroUsd} + ${claim.reserveMicroUsd} <= ${systemSpendDaily.capMicroUsd}`,
      ),
    )
    .returning({ businessDate: systemSpendDaily.businessDate });

  if (reserved.length === 0) {
    const refused = await tx
      .insert(systemSpendClaims)
      .values(claimValues(claim, "cap_exhausted"))
      .onConflictDoNothing()
      .returning({ id: systemSpendClaims.id });
    if (refused.length === 0) throw new DuplicateSystemSpendClaim();
    return { status: "cap_exhausted" };
  }

  const inserted = await tx
    .insert(systemSpendClaims)
    .values(claimValues(claim, "reserved"))
    .onConflictDoNothing()
    .returning({ id: systemSpendClaims.id });
  // A racing duplicate must roll back the guarded daily reservation.
  if (inserted.length === 0) throw new DuplicateSystemSpendClaim();
  return { status: "claimed" };
}

export type RecordSystemModelUsage = Omit<
  SystemModelUsage,
  | "id"
  | "createdAt"
  | "reservedCostMicroUsd"
  | "reservationOverrunMicroUsd"
  | "errorCode"
  | "purpose"
> & {
  purpose: "trend_autopsy";
  reservedCostMicroUsd?: bigint;
  reservationOverrunMicroUsd?: bigint | null;
  errorCode?: string | null;
};

export type SystemWorkerHealthSnapshot = {
  workerName: string;
  lastHeartbeatAt: Date;
  lastSuccessfulScheduleAt?: Date | null;
  lastSuccessfulRunAt?: Date | null;
  scheduleLagSeconds: number;
  activeCount: number;
  parkedCount: number;
  deadLetterCount: number;
  poolInUse: number;
  poolCapacity: number;
  budgetExhausted: boolean;
};

/** Upsert worker-owned operational facts without touching scheduler tables. */
export async function recordSystemWorkerHealth(
  db: DbLike,
  snapshot: SystemWorkerHealthSnapshot,
) {
  const values = {
    ...snapshot,
    budgetExhausted: snapshot.budgetExhausted ? 1 : 0,
    updatedAt: new Date(),
  };
  return db
    .insert(systemWorkerHealth)
    .values(values)
    .onConflictDoUpdate({ target: systemWorkerHealth.workerName, set: values })
    .returning();
}

function assertUsageShape(usage: RecordSystemModelUsage): void {
  const errorCode = usage.errorCode ?? null;
  if (errorCode !== null && !SAFE_OPERATIONAL_CODE.test(errorCode)) {
    throw new Error("system model usage errorCode must be a bounded content-safe token");
  }
  if ((usage.outcome === "succeeded") !== (errorCode === null)) {
    throw new Error("only a successful system usage fact may omit its error code");
  }
  for (const [field, value] of [
    ["tokensIn", usage.tokensIn],
    ["tokensOut", usage.tokensOut],
  ] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`system model usage ${field} must be null or a nonnegative safe integer`);
    }
  }
  if (usage.costMicroUsd !== null && usage.costMicroUsd < 0n) {
    throw new Error("system model usage cost must be null or nonnegative");
  }
  if (usage.reservedCostMicroUsd !== undefined && usage.reservedCostMicroUsd < 0n) {
    throw new Error("system model usage reservation must be nonnegative");
  }
  if (usage.reservationOverrunMicroUsd !== undefined
    && usage.reservationOverrunMicroUsd !== null
    && usage.reservationOverrunMicroUsd < 0n) {
    throw new Error("system model usage reservation overrun must be null or nonnegative");
  }
  if (!Number.isSafeInteger(usage.callCount)
    || usage.callCount < 0
    || usage.callCount > AUTOPSY_VENDOR_CALLS_PER_ATTEMPT) {
    throw new Error("system model usage callCount is outside the fixed autopsy pipeline");
  }
  if (!Number.isSafeInteger(usage.unknownCallCount) || usage.unknownCallCount < 0) {
    throw new Error("system model usage unknownCallCount must be a nonnegative integer");
  }
  if (usage.unknownCallCount > usage.callCount) {
    throw new Error("unknown system calls cannot exceed all calls");
  }
  if ((usage.outcome === "budget_exhausted") !== (usage.callCount === 0)) {
    throw new Error("only a budget refusal may record zero vendor calls");
  }
  if (usage.outcome === "succeeded"
    && usage.callCount !== AUTOPSY_VENDOR_CALLS_PER_ATTEMPT) {
    throw new Error("a successful autopsy must record every fixed-order stage call");
  }
  if (usage.outcome === "succeeded" && usage.costState !== "measured") {
    throw new Error("a successful autopsy must retain measured cost");
  }
  if ((usage.costState === "unknown") !== (usage.unknownCallCount > 0)) {
    throw new Error("unknown cost state must retain at least one unknown call");
  }
  if ((usage.costState === "unknown") !== (usage.costMicroUsd === null)) {
    throw new Error("unknown system cost must be null and measured cost must be known");
  }
  if (usage.outcome === "budget_exhausted" && (
    usage.tokensIn !== 0
    || usage.tokensOut !== 0
    || usage.costMicroUsd !== 0n
    || usage.costState !== "measured"
    || usage.unknownCallCount !== 0
  )) {
    throw new Error("a system budget refusal must retain zero usage and measured zero cost");
  }
}

function expectedReservationOverrun(
  usage: RecordSystemModelUsage,
  reservedMicroUsd: bigint,
): bigint | null {
  return usage.costMicroUsd === null
    ? null
    : usage.costMicroUsd > reservedMicroUsd
      ? usage.costMicroUsd - reservedMicroUsd
      : 0n;
}

function assertStoredUsageMatches(
  stored: SystemModelUsage,
  usage: RecordSystemModelUsage,
  reservedMicroUsd: bigint,
  reservationOverrunMicroUsd: bigint | null,
): void {
  if (
    stored.jobAttemptId !== usage.jobAttemptId
    || stored.jobId !== usage.jobId
    || stored.trendItemId !== usage.trendItemId
    || stored.purpose !== usage.purpose
    || stored.model !== usage.model
    || stored.tokensIn !== usage.tokensIn
    || stored.tokensOut !== usage.tokensOut
    || stored.costMicroUsd !== usage.costMicroUsd
    || stored.reservedCostMicroUsd !== reservedMicroUsd
    || stored.reservationOverrunMicroUsd !== reservationOverrunMicroUsd
    || stored.costState !== usage.costState
    || stored.outcome !== usage.outcome
    || stored.callCount !== usage.callCount
    || stored.unknownCallCount !== usage.unknownCallCount
    || stored.errorCode !== (usage.errorCode ?? null)
    || stored.businessDate !== usage.businessDate
  ) {
    throw new Error("system usage attempt id is already bound to a different fact");
  }
}

async function recordSystemModelUsageInTx(
  tx: TxLike,
  usage: RecordSystemModelUsage,
): Promise<{ inserted: boolean }> {
  assertUsageShape(usage);
  const [claim] = await tx
    .select({
      businessDate: systemSpendClaims.businessDate,
      reservedMicroUsd: systemSpendClaims.reservedMicroUsd,
      status: systemSpendClaims.status,
      jobId: systemSpendClaims.jobId,
      trendItemId: systemSpendClaims.trendItemId,
      purpose: systemSpendClaims.purpose,
      model: systemSpendClaims.model,
    })
    .from(systemSpendClaims)
    .where(eq(systemSpendClaims.jobAttemptId, usage.jobAttemptId))
    .limit(1);
  if (!claim || claim.businessDate !== usage.businessDate) {
    throw new Error("system model usage requires a prior matching budget claim");
  }
  if (
    claim.jobId !== usage.jobId
    || claim.trendItemId !== usage.trendItemId
    || claim.purpose !== usage.purpose
    || claim.model !== usage.model
  ) {
    throw new Error("system model usage attribution does not match its budget claim");
  }
  if ((claim.status === "cap_exhausted") !== (usage.outcome === "budget_exhausted")) {
    throw new Error("system usage outcome must match its durable budget claim");
  }
  if (
    usage.reservedCostMicroUsd !== undefined &&
    usage.reservedCostMicroUsd !== claim.reservedMicroUsd
  ) {
    throw new Error("system model usage must retain its claimed reservation");
  }
  const expectedOverrun = expectedReservationOverrun(usage, claim.reservedMicroUsd);
  if (
    usage.reservationOverrunMicroUsd !== undefined &&
    usage.reservationOverrunMicroUsd !== expectedOverrun
  ) {
    throw new Error("system model usage overrun does not match actual cost and reservation");
  }
  const inserted = await tx
    .insert(systemModelUsage)
    .values({
      ...usage,
      reservedCostMicroUsd: claim.reservedMicroUsd,
      reservationOverrunMicroUsd: expectedOverrun,
    })
    .onConflictDoNothing()
    .returning({ id: systemModelUsage.id });
  if (inserted.length === 0) {
    const [stored] = await tx
      .select()
      .from(systemModelUsage)
      .where(eq(systemModelUsage.jobAttemptId, usage.jobAttemptId))
      .limit(1);
    if (!stored) throw new Error("duplicate system usage has no durable row");
    assertStoredUsageMatches(stored, usage, claim.reservedMicroUsd, expectedOverrun);
    return { inserted: false };
  }

  const knownCost = usage.costMicroUsd ?? 0n;
  const overrun = expectedOverrun ?? 0n;
  await tx
    .update(systemSpendDaily)
    .set({
      knownCostMicroUsd: sql`${systemSpendDaily.knownCostMicroUsd} + ${knownCost}`,
      callCount: sql`${systemSpendDaily.callCount} + ${usage.callCount}`,
      unknownCallCount: sql`${systemSpendDaily.unknownCallCount} + ${usage.unknownCallCount}`,
      overrunCallCount: sql`${systemSpendDaily.overrunCallCount} + ${overrun > 0n ? 1 : 0}`,
      overrunMicroUsd: sql`${systemSpendDaily.overrunMicroUsd} + ${overrun}`,
    })
    .where(eq(systemSpendDaily.businessDate, usage.businessDate));
  return { inserted: true };
}

/** Append and roll up one attempt exactly once. */
export async function recordSystemModelUsage(
  db: DbLike,
  usage: RecordSystemModelUsage,
): Promise<{ inserted: boolean }> {
  return db.transaction(async (tx) => recordSystemModelUsageInTx(tx, usage));
}

/** Append one actual-cost correction and apply its daily delta exactly once. */
export async function reconcileSystemModelUsage(
  db: DbLike,
  input: { jobAttemptId: string; businessDate: string; actualCostMicroUsd: bigint },
): Promise<{ inserted: boolean }> {
  if (input.actualCostMicroUsd < 0n) {
    throw new Error("reconciled system cost must be nonnegative");
  }
  return db.transaction(async (tx) => {
    const [claim] = await tx
      .select({ reservedMicroUsd: systemSpendClaims.reservedMicroUsd })
      .from(systemSpendClaims)
      .where(eq(systemSpendClaims.jobAttemptId, input.jobAttemptId))
      .limit(1);
    const [usage] = await tx
      .select()
      .from(systemModelUsage)
      .where(
        and(
          eq(systemModelUsage.jobAttemptId, input.jobAttemptId),
          eq(systemModelUsage.businessDate, input.businessDate),
        ),
      )
      .limit(1);
    if (!claim || !usage) {
      throw new Error("reconciliation requires a matching recorded system usage and claim");
    }
    if (usage.costState !== "unknown") {
      throw new Error("only an unknown system cost can be reconciled");
    }
    const inserted = await tx
      .insert(systemModelUsageReconciliations)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: systemModelUsageReconciliations.id });
    if (inserted.length === 0) {
      const [stored] = await tx
        .select()
        .from(systemModelUsageReconciliations)
        .where(eq(systemModelUsageReconciliations.jobAttemptId, input.jobAttemptId))
        .limit(1);
      if (!stored) throw new Error("duplicate system usage reconciliation has no durable row");
      if (
        stored.businessDate !== input.businessDate
        || stored.actualCostMicroUsd !== input.actualCostMicroUsd
      ) {
        throw new Error("system usage reconciliation is already bound to a different actual cost");
      }
      return { inserted: false };
    }
    const overrun =
      input.actualCostMicroUsd > claim.reservedMicroUsd
        ? input.actualCostMicroUsd - claim.reservedMicroUsd
        : 0n;
    await tx
      .update(systemSpendDaily)
      .set({
        knownCostMicroUsd: sql`${systemSpendDaily.knownCostMicroUsd} + ${input.actualCostMicroUsd}`,
        unknownCallCount: sql`${systemSpendDaily.unknownCallCount} - ${usage.unknownCallCount}`,
        overrunCallCount: sql`${systemSpendDaily.overrunCallCount} + ${overrun > 0n ? 1 : 0}`,
        overrunMicroUsd: sql`${systemSpendDaily.overrunMicroUsd} + ${overrun}`,
      })
      .where(eq(systemSpendDaily.businessDate, input.businessDate));
    return { inserted: true };
  });
}

/**
 * R-99's ONE QUESTION, ASKED IN ONE PLACE: does this claim's analysis go to the
 * shared framework library?
 *
 * IT IS A FUNCTION BECAUSE THERE ARE TWO ASKERS (tenancy + compliance round 2,
 * CHANGE B). `finalizeAttempt` asks it to decide whether to call
 * `resolveAutopsyFramework`, and `startAttempt` asks it to tell the worker
 * whether the shared-library preflight applies to this attempt at all. Round 1
 * gated only the first, which left the worker enforcing library candidacy on
 * pastes the gate had just exempted — two places deciding one question, and
 * only one of them knowing the scope. Written twice as an inline comparison
 * they would drift on the first day the rule gains a second condition; written
 * here they cannot.
 *
 * IT TAKES THE CLAIM ROW, not a rights scope string, so a caller cannot pass
 * the item's scope or the transcript's by mistake — the decision belongs to the
 * claim the money was taken under.
 */
function proposesSharedFramework(claim: {
  rightsScope: "profile_private" | "shared_analysis";
  rightsBasis: "profile_private" | "creator_consent" | "independently_licensed" | "product_seed";
}): boolean {
  return claim.rightsScope === "shared_analysis"
    && (claim.rightsBasis === "creator_consent"
      || claim.rightsBasis === "independently_licensed");
}

export type SystemAutopsyAttemptRecord = {
  jobId: string;
  itemId: string;
  attemptId: string;
  purpose: "trend_autopsy";
  modelCode: string;
  businessDate: string;
  outcome:
    | "succeeded"
    | "vendor_failed"
    | "budget_exhausted"
    | "reservation_overrun"
    | "vendor_limit_overrun"
    | "analysis_invalid";
  inputTokens: number | null;
  outputTokens: number | null;
  costMicroUsd: number | null;
  reservedCostMicroUsd: number;
  reservationOverrunMicroUsd: number | null;
  costState: "measured" | "unknown";
  callCount: number;
  unknownCallCount: number;
  errorCode?: string;
};

export type SystemAutopsyAttemptClaim =
  | {
      status: "granted";
      dailySpentMicroUsd: number;
      dailyCapMicroUsd: number;
      reservedCostMicroUsd: number;
      transcript: string;
      contentDigest: string;
      /**
       * DOES THE SHARED-LIBRARY PREFLIGHT APPLY TO THIS ATTEMPT? (R-99; tenancy
       * + compliance round 2, CHANGE B.)
       *
       * A DERIVED BOOLEAN, NOT THE RIGHTS SCOPE and not an owner: the worker is
       * sessionless and holds no tenant identity, and this answers the one
       * question it has to ask without telling it whose claim this is. It is
       * `proposesSharedFramework(cacheClaim)` — the SAME function
       * `finalizeAttempt` uses to decide whether the analysis reaches
       * `resolveAutopsyFramework` — so the preflight and the write cannot
       * disagree about the population.
       *
       * It is not stored, so R21's "no tenant identity column on any retained
       * system table" scan has nothing to see.
       */
      proposesSharedFramework: boolean;
    }
  | {
      status: "budget_exhausted";
      dailySpentMicroUsd: number;
      dailyCapMicroUsd: number;
      reservedCostMicroUsd: 0;
    }
  | { status: "already_finalized"; record: SystemAutopsyAttemptRecord }
  | { status: "already_in_flight" };

export type SystemAutopsyAttemptStore = {
  startAttempt(input: {
    jobId: string;
    itemId: string;
    attemptId: string;
    autopsyCacheClaimId: string;
    purpose: "trend_autopsy";
    businessDate: string;
    modelCode: string;
    reserveCostMicroUsd: number;
    dailyCapMicroUsd: number;
  }): Promise<SystemAutopsyAttemptClaim>;
  finalizeAttempt(input: {
    record: SystemAutopsyAttemptRecord;
    autopsy?: { cacheClaimId: string; analysis: CanonicalAutopsyAnalysis };
  }): Promise<"recorded" | "already_recorded">;
};

function micro(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative safe integer micro-USD`);
  }
  return BigInt(value);
}

function safeNumber(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${field} does not fit a nonnegative safe integer`);
  }
  return result;
}

function mapUsageRecord(row: SystemModelUsage): SystemAutopsyAttemptRecord {
  if (
    !Number.isSafeInteger(row.callCount) ||
    row.callCount < 0 ||
    row.callCount > AUTOPSY_VENDOR_CALLS_PER_ATTEMPT ||
    !Number.isSafeInteger(row.unknownCallCount) ||
    row.unknownCallCount < 0 ||
    row.unknownCallCount > row.callCount ||
    row.purpose !== "trend_autopsy"
  ) {
    throw new Error("persisted system usage is outside the closed worker contract");
  }
  return {
    jobId: row.jobId,
    itemId: row.trendItemId,
    attemptId: row.jobAttemptId,
    purpose: row.purpose,
    modelCode: row.model,
    businessDate: row.businessDate,
    outcome: row.outcome,
    inputTokens: row.tokensIn,
    outputTokens: row.tokensOut,
    costMicroUsd: row.costMicroUsd === null ? null : safeNumber(row.costMicroUsd, "costMicroUsd"),
    reservedCostMicroUsd: safeNumber(row.reservedCostMicroUsd, "reservedCostMicroUsd"),
    reservationOverrunMicroUsd:
      row.reservationOverrunMicroUsd === null
        ? null
        : safeNumber(row.reservationOverrunMicroUsd, "reservationOverrunMicroUsd"),
    costState: row.costState,
    callCount: row.callCount,
    unknownCallCount: row.unknownCallCount,
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
  };
}

type StartInput = Parameters<SystemAutopsyAttemptStore["startAttempt"]>[0];

function assertFinalizedAttemptAttribution(
  usage: SystemModelUsage,
  input: StartInput,
): void {
  if (
    usage.jobAttemptId !== input.attemptId
    || usage.jobId !== input.jobId
    || usage.trendItemId !== input.itemId
    || usage.purpose !== input.purpose
    || usage.model !== input.modelCode
    || usage.businessDate !== input.businessDate
  ) {
    throw new Error("finalized attempt id is already bound to different system work");
  }
}

function assertAttemptAttribution(
  claim: typeof systemSpendClaims.$inferSelect,
  input: StartInput,
): void {
  if (
    claim.jobId !== input.jobId ||
    claim.trendItemId !== input.itemId ||
    claim.autopsyCacheClaimId !== input.autopsyCacheClaimId ||
    claim.purpose !== input.purpose ||
    claim.model !== input.modelCode ||
    claim.businessDate !== input.businessDate ||
    claim.requestedMicroUsd !== micro(input.reserveCostMicroUsd, "reserveCostMicroUsd")
  ) {
    throw new Error("attempt id is already bound to different system work");
  }
}

async function classifyExistingAttempt(
  db: DbLike,
  input: StartInput,
): Promise<SystemAutopsyAttemptClaim> {
  const [usage] = await db
    .select()
    .from(systemModelUsage)
    .where(eq(systemModelUsage.jobAttemptId, input.attemptId))
    .limit(1);
  const [claim] = await db
    .select()
    .from(systemSpendClaims)
    .where(eq(systemSpendClaims.jobAttemptId, input.attemptId))
    .limit(1);
  if (!claim) throw new Error("duplicate system attempt has no durable claim");
  assertAttemptAttribution(claim, input);
  if (usage) {
    assertFinalizedAttemptAttribution(usage, input);
    return { status: "already_finalized", record: mapUsageRecord(usage) };
  }
  const [daily] = await db
    .select()
    .from(systemSpendDaily)
    .where(eq(systemSpendDaily.businessDate, input.businessDate))
    .limit(1);
  if (!daily) throw new Error("system attempt claim has no daily budget row");
  if (claim.status === "cap_exhausted") {
    return {
      status: "budget_exhausted",
      dailySpentMicroUsd: safeNumber(daily.reservedMicroUsd, "daily reserved spend"),
      dailyCapMicroUsd: safeNumber(daily.capMicroUsd, "daily cap"),
      reservedCostMicroUsd: 0,
    };
  }
  return { status: "already_in_flight" };
}

/** Concrete worker adapter, with no WorkspaceScope and no tenant ledger path. */
export function createSystemAutopsyAttemptStore(db: DbLike): SystemAutopsyAttemptStore {
  const store: SystemAutopsyAttemptStore = {
    async startAttempt(input) {
      const clean: StartInput = {
        ...input,
        jobId: requiredText(input.jobId, "jobId"),
        itemId: requiredText(input.itemId, "itemId"),
        attemptId: requiredText(input.attemptId, "attemptId"),
        autopsyCacheClaimId: requiredText(input.autopsyCacheClaimId, "autopsyCacheClaimId"),
        modelCode: requiredText(input.modelCode, "modelCode"),
        businessDate: requiredText(input.businessDate, "businessDate"),
      };
      const reserve = micro(clean.reserveCostMicroUsd, "reserveCostMicroUsd");
      if (reserve <= 0n) throw new Error("reserveCostMicroUsd must be positive");
      const cap = micro(clean.dailyCapMicroUsd, "dailyCapMicroUsd");
      try {
        return await db.transaction(async (tx) => {
          const [finalized] = await tx
            .select()
            .from(systemModelUsage)
            .where(eq(systemModelUsage.jobAttemptId, clean.attemptId))
            .limit(1);
          if (finalized) {
            const [finalizedClaim] = await tx
              .select()
              .from(systemSpendClaims)
              .where(eq(systemSpendClaims.jobAttemptId, clean.attemptId))
              .limit(1);
            if (!finalizedClaim) {
              throw new Error("finalized system attempt has no durable budget claim");
            }
            assertAttemptAttribution(finalizedClaim, clean);
            assertFinalizedAttemptAttribution(finalized, clean);
            return { status: "already_finalized", record: mapUsageRecord(finalized) };
          }
          const [priorClaim] = await tx
            .select()
            .from(systemSpendClaims)
            .where(eq(systemSpendClaims.jobAttemptId, clean.attemptId))
            .limit(1);
          if (priorClaim) {
            assertAttemptAttribution(priorClaim, clean);
            if (priorClaim.status === "reserved") return { status: "already_in_flight" };
            const [daily] = await tx
              .select()
              .from(systemSpendDaily)
              .where(eq(systemSpendDaily.businessDate, clean.businessDate))
              .limit(1);
            if (!daily) throw new Error("system budget refusal has no daily row");
            return {
              status: "budget_exhausted",
              dailySpentMicroUsd: safeNumber(daily.reservedMicroUsd, "daily reserved spend"),
              dailyCapMicroUsd: safeNumber(daily.capMicroUsd, "daily cap"),
              reservedCostMicroUsd: 0 as const,
            };
          }

          const [lifecycleCandidate] = await tx
            .select()
            .from(autopsyCacheClaims)
            .where(eq(autopsyCacheClaims.id, clean.autopsyCacheClaimId))
            .limit(1);
          if (
            lifecycleCandidate?.rightsScope === "profile_private" &&
            lifecycleCandidate.profileId !== null &&
            lifecycleCandidate.workspaceId !== null &&
            !(await isActiveProfileLifecycleForSystemInTx(
              tx,
              lifecycleCandidate.workspaceId,
              lifecycleCandidate.profileId
            ))
          ) {
            throw new Error("system autopsy cache claim owner is tombstoned");
          }
          await tx.execute(
            sql`select 1 from ${autopsyCacheClaims} where ${autopsyCacheClaims.id} = ${clean.autopsyCacheClaimId} for update`,
          );
          const [cacheClaim] = await tx
            .select()
            .from(autopsyCacheClaims)
            .where(eq(autopsyCacheClaims.id, clean.autopsyCacheClaimId))
            .limit(1);
          if (!cacheClaim || cacheClaim.trendItemId !== clean.itemId) {
            throw new Error("system autopsy cache claim is missing or belongs to another item");
          }
          if (cacheClaim.status === "completed" || cacheClaim.status === "parked") {
            throw new Error(`system autopsy cache claim is ${cacheClaim.status}`);
          }
          if (
            cacheClaim.status === "pending" &&
            cacheClaim.activeSystemAttemptId !== null
          ) {
            return { status: "already_in_flight" };
          }
          if (
            cacheClaim.status === "failed" &&
            cacheClaim.attemptCount >= AUTOPSY_ATTEMPT_CODE_CEILING
          ) {
            await tx
              .update(autopsyCacheClaims)
              .set({ status: "parked", activeSystemAttemptId: null, leaseExpiresAt: null })
              .where(eq(autopsyCacheClaims.id, cacheClaim.id));
            throw new Error("system autopsy cache claim exhausted its retry ceiling");
          }

          const sharedClaim = cacheClaim.rightsScope === "shared_analysis"
            && cacheClaim.profileId === null
            && cacheClaim.workspaceId === null
            && (cacheClaim.rightsBasis === "creator_consent"
              || cacheClaim.rightsBasis === "independently_licensed");
          const privateClaim = cacheClaim.rightsScope === "profile_private"
            && cacheClaim.profileId !== null
            && cacheClaim.workspaceId !== null
            && cacheClaim.rightsBasis === "profile_private";
          if (!sharedClaim && !privateClaim) {
            throw new Error("system autopsy cache claim has an invalid rights/owner shape");
          }
          const itemOwnership = sharedClaim
            ? and(isNull(trendItems.profileId), isNull(trendItems.workspaceId))
            : and(
                eq(trendItems.profileId, cacheClaim.profileId!),
                eq(trendItems.workspaceId, cacheClaim.workspaceId!),
              );
          const [item] = await tx
            .select({ id: trendItems.id })
            .from(trendItems)
            .where(and(
              eq(trendItems.id, cacheClaim.trendItemId),
              eq(trendItems.rightsScope, cacheClaim.rightsScope),
              eq(trendItems.transcriptState, "transcript_available"),
              itemOwnership,
            ))
            .limit(1);
          if (!item) {
            throw new Error("system autopsy cache claim does not match a transcript-ready rights owner");
          }
          const transcriptOwnership = sharedClaim
            ? and(isNull(trendTranscripts.profileId), isNull(trendTranscripts.workspaceId))
            : and(
                eq(trendTranscripts.profileId, cacheClaim.profileId!),
                eq(trendTranscripts.workspaceId, cacheClaim.workspaceId!),
              );
          const [transcript] = await tx
            .select({
              content: trendTranscripts.content,
              contentDigest: trendTranscripts.contentDigest,
              rightsBasis: trendTranscripts.rightsBasis,
              rightsSubjectUserId: trendTranscripts.rightsSubjectUserId,
              rightsEvidenceId: trendTranscripts.rightsEvidenceId,
            })
            .from(trendTranscripts)
            .where(and(
              eq(trendTranscripts.trendItemId, cacheClaim.trendItemId),
              eq(trendTranscripts.contentDigest, cacheClaim.contentDigest),
              eq(trendTranscripts.rightsScope, cacheClaim.rightsScope),
              eq(trendTranscripts.rightsBasis, cacheClaim.rightsBasis),
              cacheClaim.rightsSubjectUserId === null
                ? isNull(trendTranscripts.rightsSubjectUserId)
                : eq(trendTranscripts.rightsSubjectUserId, cacheClaim.rightsSubjectUserId),
              cacheClaim.rightsEvidenceId === null
                ? isNull(trendTranscripts.rightsEvidenceId)
                : eq(trendTranscripts.rightsEvidenceId, cacheClaim.rightsEvidenceId),
              transcriptOwnership,
            ))
            .limit(1);
          if (!transcript) {
            throw new Error("system autopsy cache claim has no matching rights-backed transcript");
          }

          const result = await claimInTx(tx, {
            jobAttemptId: clean.attemptId,
            businessDate: clean.businessDate,
            capMicroUsd: cap,
            reserveMicroUsd: reserve,
            attribution: {
              jobId: clean.jobId,
              trendItemId: clean.itemId,
              autopsyCacheClaimId: clean.autopsyCacheClaimId,
              purpose: clean.purpose,
              model: clean.modelCode,
            },
          });
          const [daily] = await tx
            .select()
            .from(systemSpendDaily)
            .where(eq(systemSpendDaily.businessDate, clean.businessDate))
            .limit(1);
          if (!daily) throw new Error("system spend claim has no daily budget row");
          if (result.status === "duplicate") throw new DuplicateSystemSpendClaim();
          if (result.status === "cap_exhausted") {
            return {
              status: "budget_exhausted",
              dailySpentMicroUsd: safeNumber(daily.reservedMicroUsd, "daily reserved spend"),
              dailyCapMicroUsd: safeNumber(daily.capMicroUsd, "daily cap"),
              reservedCostMicroUsd: 0 as const,
            };
          }

          await tx
            .update(autopsyCacheClaims)
            .set({
              status: "pending",
              attemptCount:
                cacheClaim.status === "failed"
                  ? cacheClaim.attemptCount + 1
                  : cacheClaim.attemptCount,
              activeSystemAttemptId: clean.attemptId,
              leaseExpiresAt: new Date(Date.now() + AUTOPSY_CLAIM_LEASE_MS),
              lastFailureCode: null,
            })
            .where(eq(autopsyCacheClaims.id, cacheClaim.id));
          return {
            status: "granted",
            dailySpentMicroUsd: safeNumber(daily.reservedMicroUsd, "daily reserved spend"),
            dailyCapMicroUsd: safeNumber(daily.capMicroUsd, "daily cap"),
            reservedCostMicroUsd: safeNumber(reserve, "reserved cost"),
            transcript: transcript.content,
            contentDigest: transcript.contentDigest,
            // R-99, from the row this transaction locked and checked — the same
            // predicate `finalizeAttempt` applies to the same claim.
            proposesSharedFramework: proposesSharedFramework(cacheClaim),
          };
        });
      } catch (error) {
        if (error instanceof DuplicateSystemSpendClaim) {
          return classifyExistingAttempt(db, clean);
        }
        throw error;
      }
    },

    async finalizeAttempt(input) {
      const record = input.record;
      const normalized = input.autopsy
        ? parseCanonicalAutopsyAnalysis(input.autopsy.analysis)
        : null;
      if (input.autopsy && !normalized) {
        throw new Error("system autopsy completion requires canonical bounded analysis");
      }
      if ((record.outcome === "succeeded") !== Boolean(normalized)) {
        throw new Error("only a successful system attempt may complete an autopsy cache claim");
      }
      const usage: RecordSystemModelUsage = {
        jobAttemptId: requiredText(record.attemptId, "attemptId"),
        jobId: requiredText(record.jobId, "jobId"),
        trendItemId: requiredText(record.itemId, "itemId"),
        purpose: record.purpose,
        model: requiredText(record.modelCode, "modelCode"),
        tokensIn: record.inputTokens,
        tokensOut: record.outputTokens,
        costMicroUsd:
          record.costMicroUsd === null ? null : micro(record.costMicroUsd, "costMicroUsd"),
        costState: record.costState,
        outcome: record.outcome,
        callCount: record.callCount,
        unknownCallCount: record.unknownCallCount,
        errorCode: record.errorCode ?? null,
        businessDate: requiredText(record.businessDate, "businessDate"),
        reservedCostMicroUsd: micro(
          record.reservedCostMicroUsd,
          "reservedCostMicroUsd",
        ),
        reservationOverrunMicroUsd:
          record.reservationOverrunMicroUsd === null
            ? null
            : micro(record.reservationOverrunMicroUsd, "reservationOverrunMicroUsd"),
      };

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select 1 from ${systemSpendClaims} where ${systemSpendClaims.jobAttemptId} = ${record.attemptId} for update`,
        );
        const [claim] = await tx
          .select()
          .from(systemSpendClaims)
          .where(eq(systemSpendClaims.jobAttemptId, record.attemptId))
          .limit(1);
        if (!claim) throw new Error("system attempt finalization requires a budget claim");
        const startShape: StartInput = {
          jobId: record.jobId,
          itemId: record.itemId,
          attemptId: record.attemptId,
          autopsyCacheClaimId: claim.autopsyCacheClaimId ?? "",
          purpose: record.purpose,
          businessDate: record.businessDate,
          modelCode: record.modelCode,
          reserveCostMicroUsd: safeNumber(claim.requestedMicroUsd, "requestedMicroUsd"),
          dailyCapMicroUsd: 0,
        };
        assertAttemptAttribution(claim, startShape);
        const [existing] = await tx
          .select({ id: systemModelUsage.id })
          .from(systemModelUsage)
          .where(eq(systemModelUsage.jobAttemptId, record.attemptId))
          .limit(1);
        if (existing) {
          const replay = await recordSystemModelUsageInTx(tx, usage);
          if (replay.inserted) {
            throw new Error("system attempt replay unexpectedly inserted a second usage fact");
          }
          return "already_recorded" as const;
        }

        if (claim.status === "reserved") {
          if (!claim.autopsyCacheClaimId) {
            throw new Error("reserved system autopsy claim is missing its cache identity");
          }
          const [lifecycleCandidate] = await tx
            .select({
              rightsScope: autopsyCacheClaims.rightsScope,
              profileId: autopsyCacheClaims.profileId,
              workspaceId: autopsyCacheClaims.workspaceId,
            })
            .from(autopsyCacheClaims)
            .where(eq(autopsyCacheClaims.id, claim.autopsyCacheClaimId))
            .limit(1);
          let privateLifecycleActive = true;
          if (
            lifecycleCandidate?.rightsScope === "profile_private" &&
            lifecycleCandidate.profileId !== null &&
            lifecycleCandidate.workspaceId !== null
          ) {
            privateLifecycleActive = await isActiveProfileLifecycleForSystemInTx(
              tx,
              lifecycleCandidate.workspaceId,
              lifecycleCandidate.profileId
            );
          }
          await tx.execute(
            sql`select 1 from ${autopsyCacheClaims} where ${autopsyCacheClaims.id} = ${claim.autopsyCacheClaimId} for update`,
          );
          const [cacheClaim] = await tx
            .select()
            .from(autopsyCacheClaims)
            .where(eq(autopsyCacheClaims.id, claim.autopsyCacheClaimId))
            .limit(1);
          const parkedByDeletion =
            cacheClaim?.status === "parked" &&
            cacheClaim.activeSystemAttemptId === null &&
            (cacheClaim.lastFailureCode === "profile_tombstoned" ||
              cacheClaim.lastFailureCode === "workspace_tombstoned");
          const ownedPending =
            cacheClaim?.status === "pending" &&
            cacheClaim.activeSystemAttemptId === record.attemptId;
          if (
            !cacheClaim ||
            cacheClaim.trendItemId !== record.itemId ||
            (!ownedPending && !(parkedByDeletion && !privateLifecycleActive))
          ) {
            throw new Error("system autopsy cache claim is not owned by this attempt");
          }

          if (!privateLifecycleActive) {
            await tx
              .update(autopsyCacheClaims)
              .set({
                status: "parked",
                activeSystemAttemptId: null,
                leaseExpiresAt: null,
                lastFailureCode:
                  cacheClaim.lastFailureCode === "workspace_tombstoned"
                    ? "workspace_tombstoned"
                    : "profile_tombstoned",
              })
              .where(eq(autopsyCacheClaims.id, cacheClaim.id));
          } else if (normalized && input.autopsy) {
            if (input.autopsy.cacheClaimId !== cacheClaim.id) {
              throw new Error("system autopsy completion named a different cache claim");
            }
            // R-99 (slice 8c fix round 1): ONLY a `shared_analysis` claim may
            // reach the shared framework library. R-94 sanctions every
            // completed autopsy proposing its canonical mechanism into
            // proposed-only curation, and that was written when every
            // autopsied item was an ownerless shared YouTube row; slice 8c
            // made creator-paid `profile_private` claims a production
            // producer, so the population widened with no decision behind it
            // (CLAUDE.md 2026-08-29). A private paste's proposal carries
            // `sourceReferences`/`evidenceEntries` pointing at a
            // `profile_private` `trend_items` row that NO curator outside that
            // one workspace can read — the human authority the whole control
            // rests on would be handed a citation they cannot open. So a
            // creator-initiated private autopsy proposes nothing, and
            // `matched_framework_id` stays NULL for it.
            // The condition is `proposesSharedFramework` (declared above this
            // store) rather than an inline comparison, because the worker's
            // preflight now asks the identical question off the grant.
            const framework =
              proposesSharedFramework(cacheClaim)
                ? await resolveAutopsyFramework(tx, {
                    trendItemId: cacheClaim.trendItemId,
                    analysis: normalized,
                    rights: cacheClaim.rightsBasis === "creator_consent"
                      ? {
                          basis: "creator_consent",
                          subjectUserId: cacheClaim.rightsSubjectUserId!,
                          evidenceId: cacheClaim.rightsEvidenceId!,
                        }
                      : {
                          basis: "independently_licensed",
                          evidenceId: cacheClaim.rightsEvidenceId!,
                        },
                  })
                : null;
            const [autopsy] = await tx
              .insert(autopsies)
              .values({
                trendItemId: cacheClaim.trendItemId,
                contentDigest: cacheClaim.contentDigest,
                analysisVersion: cacheClaim.analysisVersion,
                rightsScope: cacheClaim.rightsScope,
                rightsBasis: cacheClaim.rightsBasis,
                rightsSubjectUserId: cacheClaim.rightsSubjectUserId,
                rightsEvidenceId: cacheClaim.rightsEvidenceId,
                profileId: cacheClaim.profileId,
                workspaceId: cacheClaim.workspaceId,
                status: "completed",
                analysis: normalized,
                matchedFrameworkId:
                  framework?.kind === "matched" ? framework.framework.id : null,
              })
              .returning({ id: autopsies.id });
            await tx
              .update(autopsyCacheClaims)
              .set({
                status: "completed",
                autopsyId: autopsy.id,
                activeSystemAttemptId: null,
                leaseExpiresAt: null,
              })
              .where(eq(autopsyCacheClaims.id, cacheClaim.id));
          } else {
            const status =
              cacheClaim.attemptCount >= AUTOPSY_ATTEMPT_CODE_CEILING
                ? "parked"
                : "failed";
            await tx
              .update(autopsyCacheClaims)
              .set({
                status,
                activeSystemAttemptId: null,
                leaseExpiresAt: null,
                lastFailureCode: record.errorCode ?? record.outcome,
              })
              .where(eq(autopsyCacheClaims.id, cacheClaim.id));
          }
        }

        const result = await recordSystemModelUsageInTx(tx, usage);
        if (!result.inserted) {
          throw new Error("system attempt became finalized outside its locked transaction");
        }
        return "recorded" as const;
      });
    },
  };
  return store;
}

export {
  AUTOPSY_ATTEMPT_CODE_CEILING,
  AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
} from "./autopsy-policy";
