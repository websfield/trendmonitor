// Phase 10b-1 Task 6.5 / C5 — the one-minute generation-attempt receiver.
//
// Five boundaries, all of them about money that may or may not have been spent:
//
//   claimed        > 15 m           -> refused/abandoned_before_vendor
//   vendor_started > deadline + 5 m -> recovery_required, NO new provider call
//   vendor_complete> 5 m            -> settle from the STORED candidate only
//   vendor_complete> 24 h           -> recovery_required, candidate cleared
//   terminal       > 1 year         -> swept by the retention receiver's clock
//
// The rule that makes this safe is negative: NO AMBIGUOUS OUTBOUND CALL IS EVER
// RETRIED. A `vendor_started` attempt may or may not have reached the provider,
// so it is never re-dispatched — it becomes `recovery_required` and a human
// reconciles it. Settlement is allowed to retry precisely because it performs
// no provider work: it reads the candidate this attempt already stored.
import { sql } from "drizzle-orm";

import type { DbLike, TxLike } from "./db-like";

export const CLAIMED_ABANDON_MS = 15 * 60_000;
export const VENDOR_COMPLETE_SETTLE_MS = 5 * 60_000;
export const VENDOR_COMPLETE_HARD_CLEAR_MS = 24 * 60 * 60_000;
/** Added to the config's `llm.overallDeadlineMs` to bound a started attempt. */
export const VENDOR_STARTED_GRACE_MS = 5 * 60_000;

/**
 * C5 names this refusal exactly: "marks `claimed` older than 15 minutes
 * `refused/abandoned_before_vendor`". It is REQUIRED, not decorative — a
 * `refused` row without a reason violates `generation_attempts_refusal_reason`.
 */
export const ABANDONED_BEFORE_VENDOR = "abandoned_before_vendor";

/** Rows moved per statement, matching the retention receiver's bound. */
export const GENERATION_RECOVERY_BATCH = 200;

export type GenerationRecoveryOutcome = Readonly<{
  abandonedBeforeVendor: number;
  startedPastDeadline: number;
  settlementAttempted: number;
  hardCleared: number;
  failureCode: string | null;
}>;

export type GenerationRecoveryOptions = Readonly<{
  /**
   * The active config's `llm.overallDeadlineMs`. Passed in rather than read
   * here because the attempt row stores no deadline of its own: the value in
   * force at SWEEP time is the only authority available, and naming that in the
   * signature keeps it from looking like the attempt's own recorded deadline.
   */
  overallDeadlineMs: number;
}>;

type ExecResult = { rowCount?: number; affectedRows?: number };
const affected = (result: unknown): number => {
  const value = result as ExecResult;
  return Number(value.rowCount ?? value.affectedRows ?? 0);
};

const failureCodeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0 ? `sqlstate_${code}` : "generation_recovery_error";
};

/**
 * A claim that never reached the provider. `claimed` means the reservation
 * exists and no vendor call was made, so this is the one transition here that
 * can be taken without ambiguity — nothing was spent.
 */
async function abandonStaleClaims(tx: TxLike, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CLAIMED_ABANDON_MS);
  const result = await tx.execute(sql`
    UPDATE "generation_attempts"
    SET state = 'refused', refusal_code = ${ABANDONED_BEFORE_VENDOR}, terminal_at = ${now}, candidate = NULL
    WHERE ctid IN (
      SELECT ctid FROM "generation_attempts"
      WHERE state = 'claimed' AND claimed_at < ${cutoff}
      ORDER BY ctid LIMIT ${GENERATION_RECOVERY_BATCH} FOR UPDATE SKIP LOCKED
    )
  `);
  return affected(result);
}

/**
 * A started attempt past its deadline plus grace. It is moved to
 * `recovery_required` and NOT retried: the provider may have produced (and
 * charged for) a completion this process never saw, so a retry would be a
 * second charge for one logical build.
 */
async function flagStartedPastDeadline(
  tx: TxLike,
  now: Date,
  overallDeadlineMs: number,
): Promise<number> {
  const cutoff = new Date(now.getTime() - (overallDeadlineMs + VENDOR_STARTED_GRACE_MS));
  const result = await tx.execute(sql`
    UPDATE "generation_attempts"
    SET state = 'recovery_required', terminal_at = ${now}, candidate = NULL
    WHERE ctid IN (
      SELECT ctid FROM "generation_attempts"
      WHERE state = 'vendor_started' AND vendor_started_at < ${cutoff}
      ORDER BY ctid LIMIT ${GENERATION_RECOVERY_BATCH} FOR UPDATE SKIP LOCKED
    )
  `);
  return affected(result);
}

/**
 * The 24-hour hard clear. C5: "at 24 hours after `vendor_completed_at` any
 * still-unsettled candidate is cleared atomically by transition to
 * `recovery_required` and alerts". No candidate survives 24 hours.
 *
 * CLEARING THE CANDIDATE IS NOT OPTIONAL, and not only because C5 says so:
 * `generation_attempts_candidate_iff_vendor_complete` is an EQUALITY, so a row
 * that leaves `vendor_complete` while still holding a candidate violates it and
 * the whole sweep aborts — caught per table by the receiver, which means the
 * failure is a payload that silently never expires rather than a loud error.
 * Every transition here clears it, as a class rather than at the one call site
 * that needs it today.
 */
async function hardClearUnsettled(tx: TxLike, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - VENDOR_COMPLETE_HARD_CLEAR_MS);
  const result = await tx.execute(sql`
    UPDATE "generation_attempts"
    SET state = 'recovery_required', terminal_at = ${now}, candidate = NULL
    WHERE ctid IN (
      SELECT ctid FROM "generation_attempts"
      WHERE state = 'vendor_complete' AND vendor_completed_at < ${cutoff}
      ORDER BY ctid LIMIT ${GENERATION_RECOVERY_BATCH} FOR UPDATE SKIP LOCKED
    )
  `);
  return affected(result);
}

/**
 * Candidates eligible for settlement — older than 5 minutes and younger than
 * the 24-hour clear. This receiver only REPORTS them; the settlement itself is
 * the generation pipeline's own transaction (it writes the generation, the
 * debit and the attempt's terminal state together), and duplicating that write
 * here would put a second author on the money path.
 */
async function countSettlementCandidates(tx: TxLike, now: Date): Promise<number> {
  const settleAfter = new Date(now.getTime() - VENDOR_COMPLETE_SETTLE_MS);
  const clearAfter = new Date(now.getTime() - VENDOR_COMPLETE_HARD_CLEAR_MS);
  const result = (await tx.execute(sql`
    SELECT count(*)::bigint AS count FROM "generation_attempts"
    WHERE state = 'vendor_complete'
      AND vendor_completed_at < ${settleAfter}
      AND vendor_completed_at >= ${clearAfter}
  `)) as unknown as { rows: { count: string | number }[] };
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * One tick. Order matters: the hard clear runs BEFORE the settlement count, so
 * a candidate that has just crossed 24 hours is reported as cleared rather than
 * as still settleable.
 */
export async function runGenerationRecoveryTick(
  db: DbLike,
  now: Date,
  options: GenerationRecoveryOptions,
): Promise<GenerationRecoveryOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const abandonedBeforeVendor = await abandonStaleClaims(tx, now);
      const startedPastDeadline = await flagStartedPastDeadline(tx, now, options.overallDeadlineMs);
      const hardCleared = await hardClearUnsettled(tx, now);
      const settlementAttempted = await countSettlementCandidates(tx, now);
      return {
        abandonedBeforeVendor,
        startedPastDeadline,
        settlementAttempted,
        hardCleared,
        failureCode: null,
      };
    });
  } catch (error) {
    return {
      abandonedBeforeVendor: 0,
      startedPastDeadline: 0,
      settlementAttempted: 0,
      hardCleared: 0,
      failureCode: failureCodeOf(error),
    };
  }
}
