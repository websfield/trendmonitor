// The SOLE balance authority (B1, D-M1-7). Balance is the fold's answer;
// lazy expiry materialization keeps sum(delta) of ALL rows literally equal to
// it. Lock composition: given a caller tx (debit path — lock already held) the
// materialization JOINS that tx; given a bare db it opens its own tx under the
// per-workspace advisory lock (the money path's pre-call reads). Product pages
// read through `getDisplayBalance` instead (audit Phase 8, P8-R1), which never
// waits on the lock.
//
// SLICE 6, R17 — THIS FILE NOW MINTS AS WELL AS EXPIRES, WHICH IS THE SAME
// MECHANISM POINTING THE OTHER WAY. `allowances.free = 25` has been in the
// schema and the seed since M1 and was read by NOTHING: the only `grantCredits`
// call site is the Stripe webhook, guarded to throw for any tier that is not
// creator/pro/studio, so a Free workspace had a permanent balance of zero. The
// mint is LAZY, at balance-derivation time, exactly the way expiry already
// works — no runner, no signup grant, no job — because this path already takes
// the workspace advisory lock, already writes idempotently through a partial
// unique index, and is already the mechanism R-20 chose so that "the ledger is
// the balance" stays literally true with no cron.
import { asc, eq, getTableColumns, sql, type Column } from "drizzle-orm";
import type { DbLike, TxLike, VerifiedWorkspaceId } from "@respin/db";
import {
  creditLedger,
  hasOpenPause,
  pausePeriods,
  RenderLockTimeoutError,
  withRenderTransaction,
} from "@respin/db";
import { ConfigUnavailableError, getActiveConfig } from "@respin/config";
import { foldLedger, type FoldResult, type LotView } from "./fold";
import { takeWorkspaceLock, tryWorkspaceLock } from "./clock";
import { BalanceIsolationError } from "./errors";
import { emitFoldMetric } from "./metrics";
import { getWorkspaceBillingState } from "./state";

export type BalanceView = {
  balance: number;
  lots: LotView[];
  asOf: Date;
};

/**
 * What a product page renders (audit Phase 8, P8-R1). `settling: false` is the
 * locked derive's number — minted, materialised, final as of `asOf`.
 * `settling: true` is the COMMITTED FOLD: the same `foldLedger` over the rows
 * already committed, with the under-lock writes skipped, so a due-but-unminted
 * Free allowance is not in it yet, and neither is anything the lock holder (a
 * money path, or another request's display read) may be writing. (A lot past its effective expiry is already
 * out of the number either way: `foldLedger` counts only live lots, so a
 * skipped expiry row changes the stored history, not the balance.) A page renders it
 * with a settling indication, never as final, and never decides
 * "insufficient" from it (that is decided only inside `generate.ts`, on the
 * money path's own locked read).
 */
export type DisplayBalanceView = BalanceView & { settling: boolean };

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
 *
 * READ COMMITTED ONLY (audit Phase 8, P8-A2; register 2026-10-05 item 11). The
 * clock guarantee this function rests on (`getDbNow`, clock.ts) is that every
 * row committed before the lock was granted is visible to the reads after it —
 * true under READ COMMITTED, where each statement takes a fresh snapshot, and
 * FALSE under REPEATABLE READ or SERIALIZABLE, where the snapshot was fixed at
 * the transaction's first statement, before the lock. The usage-page runway
 * ran this under REPEATABLE READ: a debit committed while it waited was
 * invisible to the fold, the expiry row it then wrote claimed a remainder that
 * no longer existed, and every later fold threw `materialization drifted` on
 * an append-only ledger nothing can repair. So the isolation is read in the
 * same statement as the clock and anything else is refused BEFORE either
 * write (`BalanceIsolationError`). A read-only caller that wants one snapshot
 * uses `committedFoldInTx`, which writes nothing.
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
  const dbNow = await readClockRequiringReadCommitted(tx);

  // R17 — THE FREE-TIER MINT, BEFORE THE FOLD THAT HAS TO COUNT IT. Placed
  // after the lock and after `dbNow` for both of the reasons those two lines
  // exist: the lock is what makes "insert if absent" safe against a concurrent
  // reader, and `dbNow` is the instant the row is stamped with and the instant
  // the fold below filters against.
  await mintFreeAllowanceIfDue(tx, workspaceId, dbNow);

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
  // go uncounted (the committed fold below is the same `foldLedger`, emitting
  // through this same function with `settling: true`). `rows` is
  // post-materialization, i.e. the history a subsequent fold will actually
  // replay.
  emitFoldMetric({
    workspaceId,
    rowCount: rows.length,
    durationMs: Date.now() - startedAt,
  });
  return { balance: view.balance, lots: view.lots, asOf: viewAt };
}

/** Bare-db entry (the money path's pre-call reads): opens its own locked transaction. */
export async function deriveBalance(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  at?: Date
): Promise<BalanceView> {
  return db.transaction((tx) => deriveBalanceInTx(tx, workspaceId, at));
}

/**
 * `clock_timestamp()` (the same instant `getDbNow` reads) and the
 * transaction's isolation level, in ONE statement; anything but
 * `read committed` is refused. See `deriveBalanceInTx`.
 */
async function readClockRequiringReadCommitted(tx: TxLike): Promise<Date> {
  const result = (await tx.execute(
    sql`SELECT clock_timestamp() AS now, current_setting('transaction_isolation') AS isolation`
  )) as unknown as { rows: { now: Date | string; isolation: string }[] };
  const row = result.rows[0];
  if (row.isolation !== "read committed") {
    throw new BalanceIsolationError(row.isolation);
  }
  return row.now instanceof Date ? row.now : new Date(row.now);
}

type LedgerRow = typeof creditLedger.$inferSelect;
type PauseRow = typeof pausePeriods.$inferSelect;

/**
 * A row `json_agg` produced (snake_case keys, timestamps as ISO strings) back
 * into drizzle's row shape, driven by the table's OWN column list so a column
 * added later is mapped without anyone remembering this function.
 */
function fromJsonRow<T>(columns: Record<string, Column>, json: Record<string, unknown>): T {
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = json[column.name];
    row[key] =
      value === null || value === undefined
        ? null
        : column.dataType === "date"
          ? new Date(value as string)
          : value;
  }
  return row as T;
}

function jsonArray(value: unknown): Record<string, unknown>[] {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
}

/**
 * THE COMMITTED HISTORY IN ONE STATEMENT (P8-R1 (iii)). `loadHistory` above is
 * two statements, so under READ COMMITTED a `pause_periods` row committed
 * between them could shift a lot's `effectiveExpiresAt` against a ledger read
 * an instant earlier. Here the ledger rows, the pause periods and the clock come
 * back from ONE `SELECT` — one snapshot, no isolation change (which a render
 * transaction could not make anyway: its first statement is `SET LOCAL`).
 *
 * `pause_periods` is the PAUSE AUTHORITY (the table `hasOpenPause` reads and
 * `/studio`'s picker reads, `studio/page.tsx`). No mirror
 * (`subscriptions.paused_at`) is read on this path: the only mirror consumer on
 * the fold path is the free-mint gate, which this path skips (P8-R1, AC10 —
 * the choice the "pause's two stored truths" deferral asked its first new
 * consumer to name).
 */
async function loadCommittedHistory(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<{ rows: LedgerRow[]; pauses: PauseRow[]; asOf: Date }> {
  const result = (await tx.execute(sql`
    SELECT
      clock_timestamp() AS now,
      (SELECT coalesce(json_agg(l ORDER BY l.created_at, l.id), '[]'::json)
         FROM ${creditLedger} AS l
        WHERE l.workspace_id = ${workspaceId}) AS ledger_rows,
      (SELECT coalesce(json_agg(p ORDER BY p.started_at), '[]'::json)
         FROM ${pausePeriods} AS p
        WHERE p.workspace_id = ${workspaceId}) AS pause_rows
  `)) as unknown as {
    rows: { now: Date | string; ledger_rows: unknown; pause_rows: unknown }[];
  };
  const row = result.rows[0];
  const ledgerColumns = getTableColumns(creditLedger) as Record<string, Column>;
  const pauseColumns = getTableColumns(pausePeriods) as Record<string, Column>;
  return {
    asOf: row.now instanceof Date ? row.now : new Date(row.now),
    rows: jsonArray(row.ledger_rows).map((r) => fromJsonRow<LedgerRow>(ledgerColumns, r)),
    pauses: jsonArray(row.pause_rows).map((p) => fromJsonRow<PauseRow>(pauseColumns, p)),
  };
}

/**
 * THE COMMITTED FOLD (audit Phase 8, P8-R1): a pure read of the balance from
 * the rows already committed. Takes NO lock and writes NOTHING, so it can
 * never wait on the money path and can run in any isolation level (the
 * usage-page runway runs it inside its one REPEATABLE READ snapshot, P8-A2).
 *
 * Its four structural claims, each with a witness (AC8):
 *  (i)   it calls `foldLedger` — never a second summation — so the claim below
 *        that there is no second, uncounted fold place stays true;
 *  (ii)  it skips BOTH writes `deriveBalanceInTx` makes under the lock, the
 *        Free mint (`mintFreeAllowanceIfDue`) and the expiry materialisation —
 *        a due allowance is missing from its number, and it was read while
 *        another transaction held the billing lock and may have been writing,
 *        which is why it is SETTLING, never final;
 *  (iii) rows, pauses and the clock come from one statement
 *        (`loadCommittedHistory`);
 *  (iv)  it emits through `emitFoldMetric` with `settling: true`.
 *
 * `at` shapes the view exactly as it does in `deriveBalanceInTx`: an `at`
 * earlier than the statement's clock is folded AS OF `at` (the runway passes
 * its own snapshot instant so its balance and its debit window share one
 * `asOf`); a later or absent one folds as of the clock.
 */
export async function committedFoldInTx(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  at?: Date
): Promise<BalanceView> {
  const startedAt = Date.now();
  const { rows, pauses, asOf } = await loadCommittedHistory(tx, workspaceId);
  const viewAt = at && at.getTime() < asOf.getTime() ? at : asOf;
  const fold = foldLedger(rows, pauses, viewAt);
  emitFoldMetric({
    workspaceId,
    rowCount: rows.length,
    durationMs: Date.now() - startedAt,
    settling: true,
  });
  return { balance: fold.balance, lots: fold.lots, asOf: viewAt };
}

/**
 * THE PRODUCT PAGES' BALANCE READ (audit Phase 8, P8-R1) — a page render never
 * blocks on the money lock.
 *
 * Inside `withRenderTransaction` (`SET LOCAL lock_timeout = 5000`), it TRIES
 * the billing lock (`pg_try_advisory_xact_lock`):
 *  - got it → exactly `getBalance`'s work (mint, materialise, fold, emit),
 *    `settling: false`;
 *  - did not → the committed fold, `settling: true`; nothing waited.
 * And if, having got the lock, a row lock inside the mint or the
 * materialisation reaches the 5 000 ms budget (`55P03` →
 * `RenderLockTimeoutError`), the transaction is gone, so the committed fold
 * runs in a fresh render transaction, `settling: true` — the same outcome as a
 * failed try-lock. Contention is NEVER `null` and never a hang; `null` on
 * the rail stays the refusal render for a genuine failure
 * (`LedgerIntegrityError`, an access refusal), which still propagates.
 *
 * The brand is the one `getBalance` takes: a display read is still a read of
 * one verified workspace's ledger.
 *
 * ONE render-transaction wrap (`read` below), run at most twice: once trying
 * the lock, and — only after a `RenderLockTimeoutError` — once more without
 * trying, which is the committed fold alone. `balance-contention.docker.test.ts`
 * scans `packages/credits` for exactly this one `withRenderTransaction(` call.
 */
export async function getDisplayBalance(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId
): Promise<DisplayBalanceView> {
  const read = (tryLock: boolean): Promise<DisplayBalanceView> =>
    withRenderTransaction(db, async (tx) => {
      if (tryLock && (await tryWorkspaceLock(tx, workspaceId))) {
        return { ...(await deriveBalanceInTx(tx, workspaceId)), settling: false };
      }
      return { ...(await committedFoldInTx(tx, workspaceId)), settling: true };
    });
  try {
    return await read(true);
  } catch (error) {
    if (!(error instanceof RenderLockTimeoutError)) throw error;
  }
  return read(false);
}

/**
 * The UTC calendar-month period key, `yyyy-MM` — the string
 * `stripe/auto-topup.ts` already builds for its per-month idempotency key, and
 * the value `credit_ledger_free_allowance_uq` keys on.
 *
 * UTC CALENDAR MONTH RATHER THAN A BILLING ANNIVERSARY, because Free has no
 * subscription and therefore no anniversary. It is UTC for the same reason
 * every other instant in this package is: a period key that moved with a
 * server's local timezone would mint twice at a month boundary.
 */
export function freeAllowancePeriodKey(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The first instant of the NEXT UTC calendar month — a Free lot's expiry.
 *
 * PRD §4G gives Free **no rollover**, and this is how that falls out of the
 * ordinary lot-allocation fold with no special case: an unconsumed Free lot
 * crosses its expiry and the fold materialises its `expiry` row, which is
 * machinery that already exists and is already tested.
 *
 * THE NEXT MONTH'S START rather than "the last instant of this one", because
 * `foldLedger` treats a lot as expired at `effectiveExpiry <= asOf` — a
 * half-open interval has no last representable instant to guess at. `Date.UTC`
 * normalises month 12 into the next January on its own.
 */
export function freeAllowanceExpiry(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

/**
 * Mint this workspace's Free monthly allowance for the current UTC calendar
 * month, if it is Free and this month has not been minted yet (R17).
 *
 * IT CANNOT CALL `grantCredits`, and that is a real edge rather than a style
 * choice: `ledger.ts` imports `balance.ts` (every allocating write folds), so
 * `balance.ts -> ledger.ts` would be an import cycle. The row is inserted HERE,
 * in exactly the shape this file's expiry materialization already uses — same
 * `onConflictDoNothing`, same explicit `createdAt: dbNow`.
 *
 * `createdAt: dbNow` AND NEVER THE COLUMN DEFAULT. The write-clock rule is
 * stated in full at the top of `ledger.ts`: the default is
 * `transaction_timestamp()`, fixed when the transaction BEGAN, which for a
 * transaction that waited on the workspace lock is a time in the past. A LOT
 * stamped there can look BORN BEFORE a pause it did not exist for and inflate
 * its own expiry, and it would be invisible to the fold below, which filters on
 * `createdAt <= dbNow` — so the very read that minted it would report a balance
 * that does not include it.
 *
 * WHAT IT MUST NOT DO, because every balance read on a Free workspace now
 * reaches this function — including reads inside the Stripe webhook's single
 * transaction, whose failure earns a Stripe redelivery:
 *
 *  - It must not DOUBLE-MINT. Idempotency is settled in the SCHEMA, not here:
 *    `credit_ledger_free_allowance_uq` is `(workspace_id, ref_id) WHERE
 *    ref_type = 'free_allowance'`, and `credit_ledger_free_allowance_ref`
 *    forbids a NULL period key on that ref_type. An application-level "have we
 *    granted this month?" read would be a read-then-write with no constraint
 *    behind it, and two connections both read no (R-63 records that doubling
 *    being MEASURED, with the index dropped inside a rolled-back transaction).
 *  - It must not THROW for anything but a genuine database failure. The two
 *    reachable non-database throws are refused by construction: a non-positive
 *    allowance would violate `credit_ledger_delta_sign`, so a configured 0
 *    SKIPS the mint rather than inserting an illegal row; and a missing period
 *    key would slip the partial unique, so the key is computed here and is
 *    never a parameter.
 *  - It must not mint for a PAID tier. `getWorkspaceBillingState` is the sole
 *    tier authority (R-30 constraint 2) and is asked here rather than a second
 *    derivation being written. For the common case — a Free workspace with no
 *    `subscriptions` row at all — it returns without reading config, so the
 *    tier question costs one indexed single-row select.
 *  - It must not mint on a PAUSED workspace (billing gate, 2026-09-01). R-12
 *    is "no charges, no grants, credits frozen", and this is a GRANT — the one
 *    grant in the system that did not ask. It shipped asking `billing.tier`
 *    and never `billing.state` (on the same object) nor `hasOpenPause`, which
 *    `state.ts` names as THE authority that gates money, and TWO reachable
 *    states resolve `tier: "free"` while paused: a live paused subscription
 *    with an unmapped price (`{tier: "free", state: "paused"}`), and the
 *    `{open pause_periods, mirror canceled}` drift `state.ts` records as
 *    reachable, where the mirror says nothing at all. BOTH are asked, because
 *    neither covers the other: the mirror can lag the authority in both
 *    directions, which is the sentence `isPausedSubscription`'s own docblock
 *    already carries.
 *
 *    IT COMPOUNDS, WHICH IS WHY IT IS A REFUSAL AND NOT A COSMETIC ONE:
 *    `effectiveExpiry` (fold.ts) FREEZES a lot's clock under an open pause, so
 *    a grant minted during a pause has `at: null, frozen: true` and never
 *    expires. Month after paused month it accumulates, defeating exactly the
 *    no-rollover property PRD §4G asks for and the lot expiry above exists to
 *    deliver.
 *
 *    IT SUSPENDS, IT DOES NOT FORFEIT. The skip leaves the period key unused,
 *    so the first balance read after the resume mints that month normally —
 *    "frozen" rather than "forfeited", which is R-12's own word.
 *
 * `getActiveConfig`, NOT `getActiveConfigRequiringStored`: `allowances` has no
 * `.default()` in the schema, so a stored document missing it fails the parse
 * either way, and requiring the stored path here would turn every balance read
 * on every Free workspace into a refusal during the A-9 deploy window. A
 * defaulted ALLOWANCE is not a defaulted price — no debit is stamped against
 * it, and R19's rule is about pricing a spend.
 */
async function mintFreeAllowanceIfDue(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  dbNow: Date
): Promise<void> {
  let version: number;
  let amount: number;
  // THE ONLY CATCH IN THIS FUNCTION, AND IT IS AS NARROW AS THE PROBLEM.
  //
  // `ConfigUnavailableError` means "no config version exists" or "the active
  // one does not parse". Neither is a database failure and neither is
  // something this read can fix — but before R17 a balance read needed no
  // config at all, so letting it escape would make the SOLE BALANCE AUTHORITY
  // newly unavailable on a mis-configured install: no usage page, no debit, no
  // refund, and a Stripe webhook that 500s and gets redelivered forever. That
  // is the control becoming the outage (CLAUDE.md 2026-07-30).
  //
  // SKIPPING IS SELF-HEALING AND HIDES NOTHING THAT IS NOT ALREADY LOUD: the
  // very next balance read after config is fixed mints the month's grant (the
  // period key is the month, not the read), and every other path that needs
  // config — the webhook's five reads, the usage page, every priced operation
  // — still fails by name. A `catch {}` around the INSERT would be the
  // dangerous shape and is deliberately not what this is: a unique violation,
  // a constraint failure or a dropped connection all still propagate.
  try {
    const billing = await getWorkspaceBillingState(tx, workspaceId, dbNow);
    if (billing.tier !== "free") return;
    // THE PAUSE GATE, both halves. `billing.state` is the MIRROR's answer and
    // `hasOpenPause` is the AUTHORITY's; a workspace paused according to
    // either one is frozen, and each catches a state the other misses.
    if (billing.state === "paused") return;
    if (await hasOpenPause(tx, workspaceId)) return;
    const active = await getActiveConfig(tx);
    version = active.version;
    amount = active.content.allowances.free;
  } catch (e) {
    if (e instanceof ConfigUnavailableError) return;
    throw e;
  }
  // A NON-POSITIVE ALLOWANCE IS "NO FREE CREDITS", NOT AN ERROR.
  if (!Number.isInteger(amount) || amount <= 0) return;
  await tx
    .insert(creditLedger)
    .values({
      workspaceId,
      delta: amount,
      // `grant`, because `credit_ledger_delta_sign` allows a positive delta
      // only for grant/pack/refund: this is not a purchase and not a reversal.
      kind: "grant",
      expiresAt: freeAllowanceExpiry(dbNow),
      refType: "free_allowance",
      refId: freeAllowancePeriodKey(dbNow),
      configVersion: version,
      createdAt: dbNow,
    })
    .onConflictDoNothing();
}
