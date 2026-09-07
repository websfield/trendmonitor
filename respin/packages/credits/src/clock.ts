// Clock discipline (D-M1-7, billing plan-gate findings 4 + r2-3): allocating
// writes key to the DB clock; a caller-supplied `at` outside skew, or earlier
// than the workspace's latest recorded event, is rejected — a stale clock must
// never let a debit pass its balance check against since-expired lots.
import { desc, eq, sql } from "drizzle-orm";
import type { TxLike, VerifiedWorkspaceId } from "@respin/db";
import { creditLedger, pausePeriods } from "@respin/db";
import { ClockSkewError } from "./errors";

/**
 * ONE 60-second tolerance, THREE jobs — provenance in **R-24**
 * (`docs/initial/decisions.md`), not in this comment (skill B5: a threshold
 * with no PRD or decision citation is an unowned number, and a comment is not
 * provenance — billing round-3 NOTE).
 *
 * Job 1, the one it was named for: `assertWriteClock` — a caller's `at` more
 * than a minute from the DB clock is a STALE CLOCK, not lock-ordering noise.
 * Jobs 2 and 3, acquired later in `pause.ts`: the open- and close-side pause
 * staleness bounds, where it is really a webhook DELIVERY-LAG / granularity
 * tolerance (Stripe's `event.created` is second-granularity; our instants are
 * the millisecond DB clock).
 *
 * R-24 records that 60s is a GUESS, not a measurement, and sets the tripwire:
 * the owner's `stripe listen` evidence run is the first time real delivery lag
 * is observable — record it, and split this constant (giving the delivery-lag
 * half a config key) if any legitimate event exceeds ~30s.
 */
export const CLOCK_SKEW_MS = 60_000;

/**
 * The database clock, as of THIS STATEMENT — `clock_timestamp()`, never
 * `now()`.
 *
 * This was `SELECT now()`, and that is a MONEY defect, not a style point
 * (found by the round-7 gate runs; deterministic pin in
 * concurrency.docker.test.ts "ROUND 7 (B1/B3)"). In PostgreSQL `now()` is
 * `transaction_timestamp()`, fixed when the calling transaction began — so
 * inside a debit transaction it is a time in the PAST. `foldLedger` drops every
 * row whose `created_at` is later than the `asOf` it is given, and a debit
 * committed by a transaction that BEGAN after mine but COMMITTED before I took
 * the workspace lock carries exactly such a `created_at`. Its spend was
 * therefore invisible to my balance check, and B3's "refuse before writing"
 * passed on money that was already gone: 11 of 20 concurrent debits of 10
 * succeeded against a 100 balance. Round 6 read that symptom as test-suite
 * interference and gave each Docker suite its own database; the symptom
 * survived, because this was the cause.
 *
 * `clock_timestamp()` advances within the transaction, so every row committed
 * before the lock was acquired is necessarily <= it, and the fold sees them
 * all. Nothing else in the package wanted transaction-start semantics: the
 * grace deadline, the pause instants, the expiry materialization key and the
 * write-clock skew guard all mean "now", and all of them were reading a stale
 * clock whose staleness grew with the transaction's own duration.
 */
export async function getDbNow(tx: TxLike): Promise<Date> {
  // Driver-portable: node-postgres and PGlite both surface { rows } here,
  // but the generic PgDatabase type erases it — hence the cast.
  const result = (await tx.execute(
    sql`SELECT clock_timestamp() AS now`
  )) as unknown as {
    rows: { now: Date | string }[];
  };
  const raw = result.rows[0].now;
  return raw instanceof Date ? raw : new Date(raw);
}

export async function takeWorkspaceLock(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<void> {
  // Session-level re-acquire of an xact lock is a no-op, which is what makes
  // deriveBalance safe to JOIN the debit path's transaction (D-M1-7).
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}::text, 0))`
  );
}

/** Latest recorded event instant for the workspace (ledger + pauses). */
export async function latestEventAt(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<Date | null> {
  const [ledgerRow] = await tx
    .select({ at: creditLedger.createdAt })
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(1);
  const [pauseRow] = await tx
    .select({ started: pausePeriods.startedAt, ended: pausePeriods.endedAt })
    .from(pausePeriods)
    .where(eq(pausePeriods.workspaceId, workspaceId))
    .orderBy(desc(pausePeriods.startedAt))
    .limit(1);
  const candidates = [
    ledgerRow?.at,
    pauseRow?.started,
    pauseRow?.ended ?? undefined,
  ].filter((d): d is Date => d instanceof Date);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

/** Guard for allocating writes: at within skew of DB now, never retroactive. */
export async function assertWriteClock(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date
): Promise<Date> {
  const dbNow = await getDbNow(tx);
  // Symmetric skew (plan text: "within 60s of DB now()"): a stale PAST `at`
  // is refused even with no intervening events — billing round-1 note.
  if (Math.abs(at.getTime() - dbNow.getTime()) > CLOCK_SKEW_MS) {
    throw new ClockSkewError(
      `at (${at.toISOString()}) is more than ${CLOCK_SKEW_MS / 1000}s from the database clock (${dbNow.toISOString()})`
    );
  }
  const latest = await latestEventAt(tx, workspaceId);
  // Skew allowance on BOTH sides (tenancy code-review BLOCK 1): concurrent
  // legitimate writes serialize on the advisory lock, so a strict ms-exact
  // comparison would refuse a contemporaneous debit whose `at` was captured
  // before the previous winner committed. The guard targets STALE clocks
  // (minutes/hours), not lock-serialization ordering.
  if (latest && at.getTime() < latest.getTime() - CLOCK_SKEW_MS) {
    throw new ClockSkewError(
      `at (${at.toISOString()}) is more than ${CLOCK_SKEW_MS / 1000}s earlier than the workspace's latest recorded event (${latest.toISOString()}) — retroactive allocating writes are refused`
    );
  }
  return dbNow;
}
