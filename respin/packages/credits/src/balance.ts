// The SOLE balance authority (B1, D-M1-7). Balance is the fold's answer;
// lazy expiry materialization keeps sum(delta) of ALL rows literally equal to
// it. Lock composition: given a caller tx (debit path — lock already held) the
// materialization JOINS that tx; given a bare db it opens its own tx under the
// per-workspace advisory lock (usage-page path).
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
import { asc, eq } from "drizzle-orm";
import type { DbLike, TxLike, VerifiedWorkspaceId } from "@respin/db";
import { creditLedger, hasOpenPause, pausePeriods } from "@respin/db";
import { ConfigUnavailableError, getActiveConfig } from "@respin/config";
import { foldLedger, type FoldResult, type LotView } from "./fold";
import { getDbNow, takeWorkspaceLock } from "./clock";
import { emitFoldMetric } from "./metrics";
import { getWorkspaceBillingState } from "./state";

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
