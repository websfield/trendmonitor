// The SOLE balance authority (B1, D-M1-7). Balance is the fold's answer;
// lazy expiry materialization keeps sum(delta) of ALL rows literally equal to
// it. Lock composition: given a caller tx (debit path — lock already held) the
// materialization JOINS that tx; given a bare db it opens its own tx under the
// per-workspace advisory lock (usage-page path).
import { asc, eq } from "drizzle-orm";
import type { DbLike, TxLike, VerifiedWorkspaceId } from "@respin/db";
import { creditLedger, pausePeriods } from "@respin/db";
import { foldLedger, type FoldResult, type LotView } from "./fold";
import { getDbNow, takeWorkspaceLock } from "./clock";
import { emitFoldMetric } from "./metrics";

export type BalanceView = {
  balance: number;
  lots: LotView[];
  asOf: Date;
};

async function loadHistory(tx: TxLike, workspaceId: VerifiedWorkspaceId) {
  const rows = await tx
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))
    .orderBy(asc(creditLedger.createdAt), asc(creditLedger.id));
  const pauses = await tx
    .select()
    .from(pausePeriods)
    .where(eq(pausePeriods.workspaceId, workspaceId))
    .orderBy(asc(pausePeriods.startedAt));
  return { rows, pauses };
}

/**
 * Fold + lazy materialization inside an EXISTING transaction that already
 * holds (or now takes — same-session re-acquire is a no-op) the workspace
 * advisory lock. Writes are keyed to DB now(); `at` shapes the returned view
 * only (a historical `at` is a pure read).
 */
export async function deriveBalanceInTx(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  at?: Date
): Promise<BalanceView> {
  // AUDIT #22 / R-25 D-AUDIT-3: the fold's own cost, measured. Started before
  // the lock deliberately — waiting for the lock IS part of what a caller
  // experiences, and it is the contention D-M1-7 says will bite first once M3
  // puts concurrent generations on one multi-seat workspace.
  const startedAt = Date.now();
  await takeWorkspaceLock(tx, workspaceId);
  const dbNow = await getDbNow(tx);

  let { rows, pauses } = await loadHistory(tx, workspaceId);
  let fold = foldLedger(rows, pauses, dbNow);

  if (fold.expiryCandidates.length > 0) {
    // Materialize each crossed lot's remainder (idempotent per lot via the
    // partial unique; on-conflict-do-nothing then re-read per D-M1-7).
    //
    // `createdAt: dbNow` — never the column default (round-10 BLOCK; the write-
    // clock rule is stated in full at the top of ledger.ts). An expiry row is an
    // ALLOCATING row: it claims a lot's whole remainder as computed by THIS
    // fold. Stamped at `transaction_timestamp()` it would replay earlier than
    // the instant that remainder was measured — before debits this same
    // transaction is about to write, and before rows committed while we waited
    // for the lock — and `foldLedger` throws `materialization drifted` (or
    // over-consumes) on a ledger that can never be edited to fix it. Stamping
    // the fold's own `asOf` also keeps the row visible to the re-read below,
    // which filters on `createdAt <= dbNow`.
    await tx
      .insert(creditLedger)
      .values(
        fold.expiryCandidates.map((c) => ({
          workspaceId,
          delta: -c.remaining,
          kind: "expiry" as const,
          refType: "lot",
          refId: c.lotId,
          createdAt: dbNow,
        }))
      )
      .onConflictDoNothing();
    ({ rows, pauses } = await loadHistory(tx, workspaceId));
    fold = foldLedger(rows, pauses, dbNow);
  }

  const viewAt = at && at.getTime() < dbNow.getTime() ? at : dbNow;
  const view: FoldResult =
    viewAt === dbNow ? fold : foldLedger(rows, pauses, viewAt);
  // Emitted from the ONE balance authority, so every fold in the system is
  // measured by construction — there is no second place a fold can happen and
  // go uncounted. `rows` is post-materialization, i.e. the history a subsequent
  // fold will actually replay.
  emitFoldMetric({
    workspaceId,
    rowCount: rows.length,
    durationMs: Date.now() - startedAt,
  });
  return { balance: view.balance, lots: view.lots, asOf: viewAt };
}

/** Bare-db entry (usage page): opens its own locked transaction. */
export async function deriveBalance(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  at?: Date
): Promise<BalanceView> {
  return db.transaction((tx) => deriveBalanceInTx(tx, workspaceId, at));
}
