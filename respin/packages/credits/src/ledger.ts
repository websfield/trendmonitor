// Ledger operations — the SOLE writers of credit_ledger (Phase 3 lint fences
// this package as the only importer of these tables outside packages/db).
// Every op is TxLike-composable (B3: M3's generation pipeline composes
// debitCredits into the same transaction that persists the generation).
//
// THE WRITE CLOCK (round-10 BLOCK, and the other half of round 7's read-clock
// fix). Every insert below stamps `created_at` EXPLICITLY; none of them may
// take the column default. The default is `now()` = `transaction_timestamp()`,
// fixed when the transaction BEGAN — up to a whole lock-wait earlier than the
// state the write was validated against. Round 7 moved the fold's `asOf` to
// `clock_timestamp()` and left this behind, and the two clocks disagreeing is
// not a cosmetic drift:
//
//   A debit transaction BEGINs at t0 and blocks on `takeWorkspaceLock`. An
//   `invoice.paid` grant commits at t1 > t0. The debit acquires the lock at t2,
//   folds at t2, SEES the grant, and is correctly allowed — and then writes its
//   row at `created_at = t0`. Every later fold sorts that debit BEFORE the
//   grant that funded it, finds no live lot, and throws
//   `LedgerIntegrityError: … over-consumes` — PERMANENTLY, because the ledger
//   is append-only and the row cannot be removed. `deriveBalance` then throws
//   forever for that workspace: no usage page, no debit, no refund, while
//   webhook grants keep landing and the customer keeps paying.
//
// The rule, stated once for the whole class rather than per call site:
//
//  - ALLOCATING writes (debit, negative adjust) stamp the fold's OWN `asOf` —
//    the exact instant their balance was validated at. Every row that fold saw
//    is <= it by construction, so the row can never sort before a lot it
//    consumed. (Expiry rows materialized by that same fold carry the same
//    instant and a smaller uuidv7, so they replay first — which is the order
//    the remainder they recorded was computed in.)
//  - LOT writes (grant, pack, positive adjust, refund) stamp a
//    `clock_timestamp()` read taken in the same statement sequence. They do not
//    allocate, so an early stamp could not over-consume — but `effectiveExpiry`
//    compares a lot's `created_at` against `pause_periods.started_at`, which IS
//    the DB clock, so a transaction-start stamp could make a lot look BORN
//    BEFORE a pause it did not exist for and inflate its expiry (the
//    pre-creation inflation class the tenancy round-1 BLOCK closed).
//    `latestEventAt` reads the same column to bound retroactive writes. One
//    rule beats an exception list nobody re-derives.
//
// `tests/ledger.test.ts` pins BOTH halves: a behavioural case that sleeps
// inside a transaction and asserts every writer's row postdates
// `transaction_timestamp()`, and a source scan asserting every
// `.insert(creditLedger)` in `src/**` sets `createdAt` — so a NEW mint path
// cannot quietly rejoin the default.
import { asc, eq } from "drizzle-orm";
import type { CreditLedgerRow, TxLike, VerifiedWorkspaceId } from "@respin/db";
import { creditLedger, pausePeriods } from "@respin/db";
import { deriveBalanceInTx } from "./balance";
import { assertWriteClock, getDbNow, takeWorkspaceLock } from "./clock";
import {
  InsufficientCreditsError,
  WorkspacePausedError,
} from "./errors";
import { foldLedger, LedgerIntegrityError } from "./fold";
import { hasOpenPause } from "./pause";

export type GrantParams = {
  workspaceId: VerifiedWorkspaceId;
  amount: number;
  expiresAt: Date;
  stripeEventId?: string;
  refType: string;
  refId: string;
  configVersion: number;
};

export async function grantCredits(
  tx: TxLike,
  p: GrantParams
): Promise<CreditLedgerRow> {
  assertPositiveInt(p.amount, "grant amount");
  const createdAt = await getDbNow(tx);
  const [row] = await tx
    .insert(creditLedger)
    .values({
      workspaceId: p.workspaceId,
      delta: p.amount,
      kind: "grant",
      expiresAt: p.expiresAt,
      stripeEventId: p.stripeEventId,
      refType: p.refType,
      refId: p.refId,
      configVersion: p.configVersion,
      createdAt,
    })
    .returning();
  return row;
}

export type PackParams = {
  workspaceId: VerifiedWorkspaceId;
  amount: number;
  expiresAt: Date;
  amountCents: number;
  stripeEventId?: string;
  refType: string;
  refId: string;
  /**
   * REQUIRED, like the identical field on `DebitParams` and `GrantParams`
   * (audit 2026-08-17 #24). It was optional here alone, which meant a pack —
   * the one ledger row that carries REAL MONEY (`amountCents`) — could be
   * written with no record of which config version priced it, while a debit
   * costing zero dollars could not. Both production callers already passed it;
   * the type simply did not make them.
   *
   * This is the same hardening the project already did once for `DebitParams`,
   * for the same reason: "which config priced this?" is unanswerable after the
   * fact, because the config table is append-only and the ACTIVE version moves.
   */
  configVersion: number;
};

export async function purchasePackCredits(
  tx: TxLike,
  p: PackParams
): Promise<CreditLedgerRow> {
  assertPositiveInt(p.amount, "pack amount");
  assertPositiveInt(p.amountCents, "pack amountCents");
  const createdAt = await getDbNow(tx);
  const [row] = await tx
    .insert(creditLedger)
    .values({
      workspaceId: p.workspaceId,
      delta: p.amount,
      kind: "pack",
      expiresAt: p.expiresAt,
      amountCents: p.amountCents,
      stripeEventId: p.stripeEventId,
      refType: p.refType,
      refId: p.refId,
      configVersion: p.configVersion,
      createdAt,
    })
    .returning();
  return row;
}

export type AdjustParams = {
  workspaceId: VerifiedWorkspaceId;
  delta: number;
  reasonCode: string;
  /** Positive adjust = lot; may be null (never-expiring, admin goodwill). */
  expiresAt?: Date | null;
  refType?: string;
  refId?: string;
  /** Required for NEGATIVE adjusts (they allocate like debits). */
  at?: Date;
};

export async function adjustCredits(
  tx: TxLike,
  p: AdjustParams
): Promise<CreditLedgerRow> {
  if (!Number.isInteger(p.delta) || p.delta === 0) {
    throw new LedgerIntegrityError("adjust delta must be a non-zero integer");
  }
  // See the write-clock note at the top of this file: an allocating adjust is
  // dated at the instant its balance was validated, a lot-producing one at the
  // instant it is written. Never the transaction's start.
  let createdAt: Date;
  if (p.delta < 0) {
    // Negative adjust allocates like a debit: same clock + pause + balance guards.
    const at = p.at;
    if (!at) {
      throw new LedgerIntegrityError(
        "negative adjust requires an explicit `at` (it allocates like a debit)"
      );
    }
    await takeWorkspaceLock(tx, p.workspaceId);
    await assertWriteClock(tx, p.workspaceId, at);
    if (await hasOpenPause(tx, p.workspaceId)) {
      throw new WorkspacePausedError();
    }
    const view = await deriveBalanceInTx(tx, p.workspaceId);
    if (view.balance < -p.delta) {
      throw new InsufficientCreditsError(view.balance, -p.delta);
    }
    createdAt = view.asOf;
  } else {
    createdAt = await getDbNow(tx);
  }
  const [row] = await tx
    .insert(creditLedger)
    .values({
      workspaceId: p.workspaceId,
      delta: p.delta,
      kind: "adjust",
      reasonCode: p.reasonCode,
      expiresAt: p.delta > 0 ? (p.expiresAt ?? null) : null,
      refType: p.refType,
      refId: p.refId,
      createdAt,
    })
    .returning();
  return row;
}

export class RefundSourceNeverExpiresError extends Error {
  constructor() {
    super(
      "refundCredits: the original debit consumed only never-expiring lots, so a refund expiry cannot be computed (D-M1-7). Use adjustCredits with an explicit expiry for goodwill credit."
    );
    this.name = "RefundSourceNeverExpiresError";
  }
}

export type RefundParams = {
  workspaceId: VerifiedWorkspaceId;
  amount: number;
  originalDebitId: string;
  stripeEventId?: string;
};

/**
 * Refund against a specific debit. expires_at is computed per D-M1-7: the
 * latest effective expiry of the lots the original debit consumed — a refund
 * of expiring credits must not mint never-expiring ones; a refund of a debit
 * whose lots have since expired is born expired (fail-safe, stated policy).
 * NO M1 caller — ships package-tested for the M6 admin surface.
 */
export async function refundCredits(
  tx: TxLike,
  p: RefundParams
): Promise<CreditLedgerRow> {
  assertPositiveInt(p.amount, "refund amount");
  await takeWorkspaceLock(tx, p.workspaceId);
  const view = await deriveBalanceInTx(tx, p.workspaceId);
  // Rebuild the allocation trace from the authoritative fold.
  const rows = await tx
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, p.workspaceId))
    .orderBy(asc(creditLedger.createdAt), asc(creditLedger.id));
  const pauses = await tx
    .select()
    .from(pausePeriods)
    .where(eq(pausePeriods.workspaceId, p.workspaceId))
    .orderBy(asc(pausePeriods.startedAt));
  const fold = foldLedger(rows, pauses, view.asOf);

  const debit = rows.find((r) => r.id === p.originalDebitId);
  if (!debit || debit.kind !== "debit") {
    throw new LedgerIntegrityError(
      `refundCredits: ${p.originalDebitId} is not a debit row of this workspace`
    );
  }
  const alreadyRefunded = rows
    .filter((r) => r.kind === "refund" && r.refId === p.originalDebitId)
    .reduce((s, r) => s + r.delta, 0);
  if (p.amount + alreadyRefunded > -debit.delta) {
    throw new LedgerIntegrityError(
      `refundCredits: refunding ${p.amount} would exceed the original debit (${-debit.delta}, already refunded ${alreadyRefunded})`
    );
  }
  const trace = fold.allocations.get(p.originalDebitId) ?? [];
  const lotById = new Map(fold.lots.map((l) => [l.id, l]));
  const expiries = trace
    .map((t) => lotById.get(t.lotId)?.effectiveExpiresAt ?? null)
    .filter((d): d is Date => d !== null);
  const sourceFrozen = trace.some(
    (t) => lotById.get(t.lotId)?.frozen === true
  );
  const sourceNever = trace.some((t) => {
    const lot = lotById.get(t.lotId);
    return lot ? lot.effectiveExpiresAt === null && !lot.frozen : false;
  });
  let expiresAt: Date;
  if (expiries.length > 0) {
    expiresAt = new Date(Math.max(...expiries.map((d) => d.getTime())));
  } else if (sourceFrozen) {
    // Distinct from never-expiring (billing round-1 note): the source lot's
    // clock is frozen by an OPEN pause — refund after resume instead.
    throw new LedgerIntegrityError(
      "refundCredits: the consumed lots' expiry clocks are frozen by an open pause — resume the subscription first, then refund"
    );
  } else if (sourceNever) {
    throw new RefundSourceNeverExpiresError();
  } else {
    throw new LedgerIntegrityError(
      `refundCredits: no allocation trace found for debit ${p.originalDebitId}`
    );
  }

  const [row] = await tx
    .insert(creditLedger)
    .values({
      workspaceId: p.workspaceId,
      delta: p.amount,
      kind: "refund",
      expiresAt,
      refType: "debit",
      refId: p.originalDebitId,
      stripeEventId: p.stripeEventId,
      // A refund is a LOT, and `view.asOf` is the instant this transaction read
      // the ledger it is refunding against — no later row can exist for this
      // workspace (the advisory lock is held), so the two clock rules agree here.
      createdAt: view.asOf,
    })
    .returning();
  return row;
}

export type DebitParams = {
  workspaceId: VerifiedWorkspaceId;
  cost: number;
  refType: string;
  refId: string;
  at: Date;
  /**
   * The config version that PRICED this debit (B5, REQ-G05). Required, and
   * deliberately so: a credit cost is config, `creditCosts.fullScript` can move
   * from 3 to 5 mid-month through the sanctioned deploy-free path (D-M1-2), and
   * a ledger holding 3- and 5-credit debits with nothing saying which config
   * priced which makes the margin rollup and any customer dispute
   * unreconcilable. Grants and packs have carried `configVersion` since Phase 2;
   * the debit — the row the customer argues about — did not.
   *
   * It is REQUIRED rather than deferred to M3's wiring because a compile error
   * at a call site that does not exist yet is the cheapest possible tripwire:
   * the M3 generation pipeline cannot call this function without deciding what
   * priced the generation (billing round-10 CHANGE 3).
   */
  configVersion: number;
};

/**
 * The B3 debit: composes into the caller's transaction (M3 persists the
 * generation in the same tx). Refuses BEFORE writing: paused workspace,
 * skewed/retroactive clock, or insufficient balance — no row on refusal.
 * Cost is caller-resolved from config (this function reads no config) and the
 * config version that resolved it is recorded on the row.
 */
export async function debitCredits(
  tx: TxLike,
  p: DebitParams
): Promise<CreditLedgerRow> {
  assertPositiveInt(p.cost, "debit cost");
  await takeWorkspaceLock(tx, p.workspaceId);
  await assertWriteClock(tx, p.workspaceId, p.at);
  if (await hasOpenPause(tx, p.workspaceId)) {
    throw new WorkspacePausedError();
  }
  const view = await deriveBalanceInTx(tx, p.workspaceId);
  if (view.balance < p.cost) {
    throw new InsufficientCreditsError(view.balance, p.cost);
  }
  const [row] = await tx
    .insert(creditLedger)
    .values({
      workspaceId: p.workspaceId,
      delta: -p.cost,
      kind: "debit",
      refType: p.refType,
      refId: p.refId,
      configVersion: p.configVersion,
      // The fold's own instant — see the write-clock note at the top.
      createdAt: view.asOf,
    })
    .returning();
  return row;
}

function assertPositiveInt(n: number, label: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new LedgerIntegrityError(`${label} must be a positive integer, got ${n}`);
  }
}
