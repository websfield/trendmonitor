// THE RENDER BUDGET (audit Phase 8, P8-R1, R-177).
//
// A product page that waits on a lock waits holding one of the server pool's
// connections, and before this file nothing bounded the wait: `lock_timeout`
// appeared nowhere in the tree, and the money paths hold the workspace locks
// across Stripe HTTP (up to `STRIPE_MAX_CALL_WINDOW_MS` per call). This helper
// is the one place a render transaction gets a bound.
//
// NOT `client.ts`: that file builds pools and has no transaction helper; this
// is a transaction policy, and it lives beside nothing it could be confused
// with.
import { sql } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
import type { DbLike, TxLike } from "./db-like";

/**
 * 5 000 ms — OWNER-CHOSEN, NOT MEASURED. It is the same number as the outbox
 * trigger in R-144's deferral ("the first measured lock wait above 5 s on a
 * render path"; recorded as R-177), so the bound a page lives under and the
 * wait that reopens the outbox decision cannot drift apart. No lock-wait
 * metric exists today to derive it from.
 */
export const RENDER_LOCK_TIMEOUT_MS = 5_000;

/** Postgres' SQLSTATE for "lock not available" — what `lock_timeout` raises. */
export const LOCK_NOT_AVAILABLE_SQLSTATE = "55P03";

/**
 * A render transaction hit its `lock_timeout`. The named refusal — never a
 * hang, never a raw `55P03` — that a render path maps to its own fallback
 * (`getDisplayBalance` renders the committed fold, settling).
 */
export class RenderLockTimeoutError extends Error {
  readonly code = "render_lock_timeout" as const;
  constructor(readonly timeoutMs: number = RENDER_LOCK_TIMEOUT_MS) {
    super(
      `A page read waited ${timeoutMs} ms for a lock another operation holds, and stopped rather than hang. Reload in a moment.`
    );
    this.name = "RenderLockTimeoutError";
  }
}

/**
 * A bounded transaction was asked to open INSIDE an already-open one. Drizzle
 * would open a SAVEPOINT, and a `SET LOCAL` inside a savepoint that is later
 * released survives into the ENCLOSING transaction — which may be a money
 * path that was never designed to receive a lock error. Refused before any
 * statement runs.
 */
export class RenderTransactionNestingError extends Error {
  constructor() {
    super(
      "a bounded render/read transaction must be opened on the pool, never inside an open transaction"
    );
    this.name = "RenderTransactionNestingError";
  }
}

/** True for a drizzle transaction handle (`PgTransaction`), false for the pool. */
export function isOpenTransaction(db: DbLike | TxLike): boolean {
  return db instanceof PgTransaction;
}

/** The SQLSTATE of a driver error, directly or under drizzle's query wrapper. */
export function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Run `fn` in a transaction whose FIRST statement is
 * `SET LOCAL lock_timeout = 5000`.
 *
 * `LOCAL`, and that word is the whole safety argument: the setting dies with
 * this transaction, so the pooled connection's next transaction — a webhook, a
 * debit, a settlement that was never designed to receive a lock error — reads
 * the server default again. A bare `SET` would persist on the connection and
 * arm a 5-second failure inside the money path. `balance-contention.docker.
 * test.ts` reads the next transaction's `lock_timeout` on the same connection,
 * and plants the bare `SET` to watch that test go red.
 *
 * A lock wait that reaches the bound surfaces as `RenderLockTimeoutError`;
 * every other error propagates unchanged.
 *
 * WHICH TRANSACTIONS ARE RENDER TRANSACTIONS is a list, not a guess:
 * `getDisplayBalance` (`@respin/credits` `balance.ts`) is the only caller in
 * `packages/credits`, asserted by the same docker suite's source scan. The money
 * path's own transactions — `settle`, the webhook dispatcher, a locked
 * `deriveBalanceInTx` — never go through it.
 */
export async function withRenderTransaction<T>(
  db: DbLike,
  fn: (tx: TxLike) => Promise<T>
): Promise<T> {
  if (isOpenTransaction(db)) throw new RenderTransactionNestingError();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(`SET LOCAL lock_timeout = ${RENDER_LOCK_TIMEOUT_MS}`)
      );
      return fn(tx);
    });
  } catch (error) {
    if (sqlStateOf(error) === LOCK_NOT_AVAILABLE_SQLSTATE) {
      throw new RenderLockTimeoutError();
    }
    throw error;
  }
}

/**
 * THE PAGE PATH'S BOUNDED READ (audit Phase 8, P8-A3 "the bound"; gate M2).
 *
 * A SHARED membership-lock request queues behind an EXCLUSIVE one that is
 * already waiting, so a page reader can wait behind a deletion writer that is
 * itself waiting behind a webhook holding the shared form across Stripe. This
 * helper bounds that wait: `READ ONLY` (Postgres itself refuses any write in
 * it, SQLSTATE 25006 — so no money path, webhook, deletion or other write can
 * ever run under this timeout), then `SET LOCAL lock_timeout = 5000`, and a
 * `55P03` surfaces as `RenderLockTimeoutError`. Refused inside an open
 * transaction (`RenderTransactionNestingError`).
 *
 * ITS CALLERS ARE A LIST, not a category: `packages/db/tests/render-bound-scope.test.ts`
 * compares every call of this helper and of `boundedReadOrJoin` against a
 * written list, two-way.
 */
export async function withBoundedReadTransaction<T>(
  db: DbLike,
  fn: (tx: TxLike) => Promise<T>
): Promise<T> {
  if (isOpenTransaction(db)) throw new RenderTransactionNestingError();
  try {
    return await db.transaction(
      async (tx) => {
        await tx.execute(
          sql.raw(`SET LOCAL lock_timeout = ${RENDER_LOCK_TIMEOUT_MS}`)
        );
        return fn(tx);
      },
      { accessMode: "read only" }
    );
  } catch (error) {
    if (sqlStateOf(error) === LOCK_NOT_AVAILABLE_SQLSTATE) {
      throw new RenderLockTimeoutError();
    }
    throw error;
  }
}

/**
 * For a reader that takes `DbLike | TxLike`: handed the POOL, it runs in
 * `withBoundedReadTransaction`; handed the caller's open TRANSACTION, it joins
 * it exactly as before (drizzle's savepoint) and is NOT bounded — the caller's
 * transaction (possibly a money path) decides its own waits. A handle with no
 * `transaction` method (a test double) runs `fn` on it directly, as before.
 */
export function boundedReadOrJoin<T>(
  db: DbLike | TxLike,
  fn: (tx: TxLike) => Promise<T>
): Promise<T> {
  const transaction = (db as DbLike).transaction;
  if (typeof transaction !== "function") return fn(db as TxLike);
  if (isOpenTransaction(db)) return (db as DbLike).transaction(fn);
  return withBoundedReadTransaction(db as DbLike, fn);
}
