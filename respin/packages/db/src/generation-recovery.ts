// Phase 10b-1 Task 6.5 / C5 — the one-minute generation-attempt receiver.
//
// Five boundaries, all of them about money that may or may not have been spent:
//
//   claimed        > 15 m           -> refused/abandoned_before_vendor
//   vendor_started > deadline + 5 m -> recovery_required, NO new provider call
//   vendor_complete> 5 m            -> COUNTED as settleable; nothing here settles
//   vendor_complete> 18 h (oldest)  -> the worker pages (`generation_unsettled_aging`)
//   vendor_complete> 24 h           -> recovery_required, candidate cleared
//   terminal       > 1 year         -> swept by the retention receiver's clock
//
// The rule that makes this safe is negative: NO AMBIGUOUS OUTBOUND CALL IS EVER
// RETRIED. A `vendor_started` attempt may or may not have reached the provider,
// so it is never re-dispatched — it becomes `recovery_required` and a human
// reconciles it.
//
// WHO SETTLES A STORED CANDIDATE (audit P3-R1, decisions R-157): NOT THIS
// RECEIVER. Settlement is the generation pipeline's own transaction, and it is
// re-entered by exactly three callers — a same-id resubmission of the attempt,
// the creator's "Finish this draft" (`settleHeldAttempt`), and the operator's
// `scripts/settle-candidate.ts`, which calls the same entry. This receiver
// counts what is waiting, reports the age of the oldest, and clears at 24 h.
import { sql } from "drizzle-orm";

import type { DbLike, TxLike } from "./db-like";

export const CLAIMED_ABANDON_MS = 15 * 60_000;
export const VENDOR_COMPLETE_SETTLE_MS = 5 * 60_000;
export const VENDOR_COMPLETE_HARD_CLEAR_MS = 24 * 60 * 60_000;
/**
 * THE 24-HOUR PREDICATE, as one function both enforcers share (launch L2,
 * P3-R1): a `vendor_complete` candidate is settleable only while
 * `vendor_completed_at >= now − VENDOR_COMPLETE_HARD_CLEAR_MS`. The worker's
 * `hardClearUnsettled` clears what this calls past; the same-id settle path in
 * `packages/credits/src/generate.ts` refuses it under the claim row's lock, so
 * a resume past the window gets the typed terminal rather than a late settle.
 */
export function isPastVendorCompleteHardClear(
  vendorCompletedAt: Date,
  now: Date
): boolean {
  return vendorCompletedAt.getTime() < now.getTime() - VENDOR_COMPLETE_HARD_CLEAR_MS;
}

/**
 * THE PAGE BEFORE THE CLEAR (audit P3-R1(a)). The only alert this receiver
 * raised on an unsettled candidate used to fire at the 24-hour clear — the
 * instant the paid output was destroyed. Six hours before it, the oldest
 * still-settleable candidate pages instead, while the creator's "Finish this
 * draft" and the operator's settle command can still reach it. CHOSEN, not
 * measured (R-157): long enough that a creator who stepped away is not an
 * incident, short enough to leave an operator a working shift.
 */
export const UNSETTLED_CANDIDATE_ALERT_MS = 18 * 60 * 60_000;

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
  /**
   * `vendor_complete` candidates past the 5-minute mark and under the 24-hour
   * clear — COUNTED, never settled here (renamed by audit P3-R1(c) from a
   * name that claimed an attempt: nothing on this path attempts a settlement).
   */
  settleableCandidates: number;
  /**
   * How long the OLDEST still-unsettled candidate has waited since
   * `vendor_completed_at`, or `null` when none is waiting. Read AFTER the
   * hard clear, so it is always under `VENDOR_COMPLETE_HARD_CLEAR_MS`.
   */
  oldestUnsettledMs: number | null;
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
  // The SQL form of `isPastVendorCompleteHardClear` (`<` the same cutoff).
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
 * the 24-hour clear — and the age of the oldest still-unsettled one. This
 * receiver only REPORTS them; the settlement itself is the generation
 * pipeline's own transaction (it writes the generation, the debit and the
 * attempt's terminal state together), and duplicating that write here would
 * put a second author on the money path.
 */
async function countSettlementCandidates(
  tx: TxLike,
  now: Date,
): Promise<{ count: number; oldestUnsettledMs: number | null }> {
  const settleAfter = new Date(now.getTime() - VENDOR_COMPLETE_SETTLE_MS);
  const clearAfter = new Date(now.getTime() - VENDOR_COMPLETE_HARD_CLEAR_MS);
  const result = (await tx.execute(sql`
    SELECT
      count(*) FILTER (WHERE vendor_completed_at < ${settleAfter})::bigint AS count,
      min(vendor_completed_at) AS oldest
    FROM "generation_attempts"
    WHERE state = 'vendor_complete'
      AND vendor_completed_at >= ${clearAfter}
  `)) as unknown as {
    rows: { count: string | number; oldest: string | Date | null }[];
  };
  const row = result.rows[0];
  const oldest = row?.oldest == null ? null : new Date(row.oldest);
  return {
    count: Number(row?.count ?? 0),
    oldestUnsettledMs:
      oldest === null ? null : Math.max(0, now.getTime() - oldest.getTime()),
  };
}

/** Where one attempt lives, for the operator's settle command — ids and state only. */
export type OperatorAttemptLocation = Readonly<{
  attemptId: string;
  workspaceId: string;
  profileId: string;
  state: string;
  /**
   * The auth identity of the workspace's longest-standing ACTIVE owner, or
   * `null` when it has none. The command acts AS that owner, through
   * `withWorkspace` — so it meets the workspace lifecycle fence (a tombstoned
   * or erasing workspace mints no scope) exactly as the owner would.
   */
  ownerAuthUserId: string | null;
}>;

/**
 * LOCATE ONE ATTEMPT FOR THE OPERATOR (audit P3-R1(b)): the ids and the state
 * an operator needs to settle a stranded candidate by attempt id, and NOTHING
 * else — the candidate column is not read. A system read, like the rest of
 * this receiver, used by `scripts/settle-candidate.ts` through the credits
 * facade's `operatorSettleCandidate`; every write after it goes through the
 * workspace-scoped settlement path.
 */
export async function locateGenerationAttemptForOperator(
  db: DbLike,
  attemptId: string,
): Promise<OperatorAttemptLocation | null> {
  const result = (await db.execute(sql`
    SELECT
      a.attempt_id AS "attemptId",
      a.workspace_id AS "workspaceId",
      a.profile_id AS "profileId",
      a.state AS "state",
      (
        SELECT u.auth_user_id
        FROM "memberships" m
        JOIN "users" u ON u.id = m.user_id AND u.lifecycle_state = 'active'
        WHERE m.workspace_id = a.workspace_id
          AND m.role = 'owner'
          AND m.lifecycle_state = 'active'
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT 1
      ) AS "ownerAuthUserId"
    FROM "generation_attempts" a
    WHERE a.attempt_id = ${attemptId}
    LIMIT 1
  `)) as unknown as { rows: Array<Record<string, string | null>> };
  const row = result.rows[0];
  if (!row) return null;
  return {
    attemptId: String(row.attemptId),
    workspaceId: String(row.workspaceId),
    profileId: String(row.profileId),
    state: String(row.state),
    ownerAuthUserId: row.ownerAuthUserId ?? null,
  };
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
      const waiting = await countSettlementCandidates(tx, now);
      return {
        abandonedBeforeVendor,
        startedPastDeadline,
        settleableCandidates: waiting.count,
        oldestUnsettledMs: waiting.oldestUnsettledMs,
        hardCleared,
        failureCode: null,
      };
    });
  } catch (error) {
    return {
      abandonedBeforeVendor: 0,
      startedPastDeadline: 0,
      settleableCandidates: 0,
      oldestUnsettledMs: null,
      hardCleared: 0,
      failureCode: failureCodeOf(error),
    };
  }
}
