// The D-M1-7 chronological lot-allocation fold — PURE (no I/O), so the
// table-driven suite can drive it with fixed dates. Semantics (R-20):
// - grant/pack/refund and positive adjust rows are consumable LOTS;
// - debit and negative adjust ALLOCATE against live lots in D-M1-8 order
//   (soonest effective expiry first; equal → older first; then grants before
//   packs; never-expiring lots last);
// - expiry rows are REPLAYED as history, never recomputed;
// - pause periods suspend expiry clocks: effective expiry = expires_at shifted
//   by the chronological pause-overlap fold; an open pause freezes the clock.
import type { CreditLedgerRow, PausePeriod } from "@respin/db";

export class LedgerIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerIntegrityError";
  }
}

export type LotView = {
  id: string;
  kind: CreditLedgerRow["kind"];
  createdAt: Date;
  /** Stored expiry (null = never-expiring adjust lot). */
  expiresAt: Date | null;
  /** Pause-shifted expiry; null = never expires; Infinity ⇒ frozen by an open pause (represented as null too, with frozen=true). */
  effectiveExpiresAt: Date | null;
  frozen: boolean;
  initial: number;
  remaining: number;
  /** True when an expiry row already materialized this lot's remainder. */
  expiredByRow: boolean;
};

export type FoldResult = {
  balance: number;
  lots: LotView[];
  /** Lots whose remainder should be materialized as expiry rows (vs asOf). */
  expiryCandidates: { lotId: string; remaining: number }[];
  /** Allocation trace: debit/negative-adjust row id → consumed lot portions. */
  allocations: Map<string, { lotId: string; amount: number }[]>;
};

const KIND_RANK: Record<string, number> = {
  grant: 0,
  pack: 1,
  refund: 2,
  adjust: 3,
};

/**
 * Pause-shifted effective expiry. Chronological fold per D-M1-3/D-M1-7 —
 * counting ONLY the pause time that overlaps the lot's own lifetime
 * [lotCreatedAt, shifted expiry): a clock that wasn't running yet cannot be
 * suspended, so a pause that ended before the lot existed shifts nothing and
 * a pause straddling the lot's creation counts only its post-creation portion
 * (tenancy code-review BLOCK 2).
 */
export function effectiveExpiry(
  expiresAt: Date | null,
  pauses: PausePeriod[],
  lotCreatedAt: Date
): { at: Date | null; frozen: boolean } {
  if (expiresAt === null) return { at: null, frozen: false };
  let eff = expiresAt.getTime();
  const born = lotCreatedAt.getTime();
  // Merge overlapping periods first (billing round-2 NOTE): the writer refuses
  // a second open pause, but a ≤60s-skew overlap between adjacent periods
  // would otherwise double-count the shared seconds.
  const sorted = mergePauses(pauses);
  for (const p of sorted) {
    const overlapStart = Math.max(p.startedAt.getTime(), born);
    if (overlapStart >= eff) continue; // no overlap with the lot's clock
    if (p.endedAt === null) {
      // Open pause overlapping the lot's lifetime before its (shifted)
      // expiry: the clock is frozen — the lot cannot expire while paused.
      return { at: null, frozen: true };
    }
    if (p.endedAt.getTime() <= born) continue; // ended before the lot existed
    eff += p.endedAt.getTime() - overlapStart;
  }
  return { at: new Date(eff), frozen: false };
}

/** Coalesce overlapping/touching pause intervals (open pause swallows the tail). */
function mergePauses(pauses: PausePeriod[]): PausePeriod[] {
  const sorted = [...pauses].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
  );
  const merged: PausePeriod[] = [];
  for (const p of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      (last.endedAt === null ||
        last.endedAt.getTime() >= p.startedAt.getTime())
    ) {
      if (last.endedAt !== null) {
        const end =
          p.endedAt === null
            ? null
            : new Date(Math.max(last.endedAt.getTime(), p.endedAt.getTime()));
        merged[merged.length - 1] = { ...last, endedAt: end };
      }
      // last is open: it already swallows p entirely.
      continue;
    }
    merged.push(p);
  }
  return merged;
}

function isLive(lot: LotView, t: Date): boolean {
  if (lot.remaining <= 0 || lot.expiredByRow) return false;
  if (lot.effectiveExpiresAt === null) return true; // never / frozen
  return lot.effectiveExpiresAt.getTime() > t.getTime();
}

function allocationOrder(a: LotView, b: LotView): number {
  const aNever = a.effectiveExpiresAt === null;
  const bNever = b.effectiveExpiresAt === null;
  if (aNever !== bNever) return aNever ? 1 : -1; // never-expiring last
  if (!aNever && !bNever) {
    const d =
      (a.effectiveExpiresAt as Date).getTime() -
      (b.effectiveExpiresAt as Date).getTime();
    if (d !== 0) return d; // soonest effective expiry first
  }
  const c = a.createdAt.getTime() - b.createdAt.getTime();
  if (c !== 0) return c; // older first
  return (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9); // grants before packs
}

/** True for rows the fold treats as consumable lots (D-M1-7's six kinds). */
function isLotRow(r: CreditLedgerRow): boolean {
  return (
    r.kind === "grant" ||
    r.kind === "pack" ||
    r.kind === "refund" ||
    (r.kind === "adjust" && r.delta > 0)
  );
}

/**
 * Replay rank for rows sharing a `created_at` to the microsecond
 * (billing round-11 NOTE, `fold.ts:145-148`). The write-clock rule
 * (ledger.ts) makes ties REAL, not hypothetical: expiry rows materialized by a
 * fold and the debit stamped with that same fold's `asOf` carry the identical
 * instant by construction. Until now the tie-break was `id.localeCompare`, i.e.
 * uuidv7 order — true today because one process inserts the expiry rows first,
 * and an assumption the moment a second backend writes in the same microsecond
 * with a skewed clock. That assumption is worth removing because the failure is
 * PERMANENT: replaying a debit before the lot that funded it throws
 * `over-consumes`, and replaying it before its own expiry row throws
 * `materialization drifted`, on a table that can never be edited to fix it.
 *
 * The order is the causal one, and it is the order the writers already intend:
 *   0 lots (a lot must exist before anything allocates against it)
 *   1 expiry (materialization claims a lot's remainder as the fold measured it)
 *   2 allocating rows (debit / negative adjust)
 * `id` remains the final tie-break, so ordering stays total and deterministic.
 */
function replayRank(r: CreditLedgerRow): number {
  if (isLotRow(r)) return 0;
  if (r.kind === "expiry") return 1;
  return 2;
}

/**
 * Replay the ledger up to `asOf` (events with createdAt <= asOf) against the
 * pause history. Deterministic; throws LedgerIntegrityError on history the
 * schema CHECKs should have made impossible.
 */
export function foldLedger(
  rows: CreditLedgerRow[],
  pauses: PausePeriod[],
  asOf: Date
): FoldResult {
  const events = rows
    .filter((r) => r.createdAt.getTime() <= asOf.getTime())
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        replayRank(a) - replayRank(b) ||
        a.id.localeCompare(b.id)
    );

  const lots = new Map<string, LotView>();
  const allocations: FoldResult["allocations"] = new Map();

  for (const ev of events) {
    if (isLotRow(ev)) {
      const eff = effectiveExpiry(ev.expiresAt, pauses, ev.createdAt);
      lots.set(ev.id, {
        id: ev.id,
        kind: ev.kind,
        createdAt: ev.createdAt,
        expiresAt: ev.expiresAt,
        effectiveExpiresAt: eff.at,
        frozen: eff.frozen,
        initial: ev.delta,
        remaining: ev.delta,
        expiredByRow: false,
      });
      continue;
    }
    if (ev.kind === "expiry") {
      if (!ev.refId) {
        throw new LedgerIntegrityError(
          `expiry row ${ev.id} names no lot (schema CHECK should forbid this)`
        );
      }
      const lot = lots.get(ev.refId);
      if (!lot) {
        throw new LedgerIntegrityError(
          `expiry row ${ev.id} references unknown lot ${ev.refId}`
        );
      }
      if (-ev.delta !== lot.remaining) {
        throw new LedgerIntegrityError(
          `expiry row ${ev.id} expires ${-ev.delta} but lot ${lot.id} has ${lot.remaining} remaining — materialization drifted`
        );
      }
      lot.remaining = 0;
      lot.expiredByRow = true;
      continue;
    }
    // debit, or negative adjust: allocate per D-M1-8.
    const amount = -ev.delta;
    if (amount <= 0) {
      throw new LedgerIntegrityError(
        `row ${ev.id} kind ${ev.kind} has non-negative delta ${ev.delta} in the allocating branch`
      );
    }
    const live = [...lots.values()]
      .filter((l) => isLive(l, ev.createdAt))
      .sort(allocationOrder);
    let toConsume = amount;
    const trace: { lotId: string; amount: number }[] = [];
    for (const lot of live) {
      if (toConsume === 0) break;
      const take = Math.min(lot.remaining, toConsume);
      lot.remaining -= take;
      toConsume -= take;
      trace.push({ lotId: lot.id, amount: take });
    }
    if (toConsume > 0) {
      throw new LedgerIntegrityError(
        `row ${ev.id} over-consumes: ${toConsume} of ${amount} could not be allocated — a debit was written past the available balance`
      );
    }
    allocations.set(ev.id, trace);
  }

  const lotViews = [...lots.values()];
  const balance = lotViews
    .filter((l) => isLive(l, asOf))
    .reduce((sum, l) => sum + l.remaining, 0);
  const expiryCandidates = lotViews
    .filter(
      (l) =>
        l.remaining > 0 &&
        !l.expiredByRow &&
        !l.frozen &&
        l.effectiveExpiresAt !== null &&
        l.effectiveExpiresAt.getTime() <= asOf.getTime()
    )
    .map((l) => ({ lotId: l.id, remaining: l.remaining }));

  return { balance, lots: lotViews, expiryCandidates, allocations };
}
