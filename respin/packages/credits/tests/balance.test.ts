// Table-driven D-M1-7/D-M1-8 suite. Each `describe`/`it` names the Phase-2
// edge-case bullet it discharges (AC-3's 1:1 enumeration). Pure-read cases
// use fixed historical dates; the AC-2 invariant (post-materialization
// sum(delta) === fold balance) runs across every case.
import { describe, expect, it } from "vitest";
import {
  createTestDb,
  creditLedger,
  pausePeriods,
  schema,
  trustWorkspaceId,
  type TestDb,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { deriveBalance } from "../src/balance";
import { effectiveExpiry, foldLedger } from "../src/fold";

const D = (s: string) => new Date(s);
// Fixed historical timeline (all < real now, so expiries materialize).
const JAN1 = D("2026-01-01T00:00:00Z");
const JAN10 = D("2026-01-10T00:00:00Z");
const JAN15 = D("2026-01-15T00:00:00Z");
const FEB1 = D("2026-02-01T00:00:00Z");
const FEB15 = D("2026-02-15T00:00:00Z");
const MAR1 = D("2026-03-01T00:00:00Z");
// Far future (never materializes in these runs).
const Y2030 = D("2030-01-01T00:00:00Z");
const Y2031 = D("2031-01-01T00:00:00Z");

async function mkWorkspace(db: TestDb): Promise<VerifiedWorkspaceId> {
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name: "T" })
    .returning();
  return trustWorkspaceId(w.id);
}

type RawRow = {
  delta: number;
  kind: "grant" | "pack" | "debit" | "refund" | "adjust" | "expiry";
  createdAt: Date;
  expiresAt?: Date | null;
  refId?: string;
  reasonCode?: string;
};

async function insertRows(
  db: TestDb,
  ws: VerifiedWorkspaceId,
  rows: RawRow[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const r of rows) {
    const [row] = await db
      .insert(creditLedger)
      .values({ workspaceId: ws, ...r })
      .returning();
    ids.push(row.id);
  }
  return ids;
}

/** AC-2 invariant: after materialization, sum(delta) of ALL rows === fold balance. */
async function assertInvariant(db: TestDb, ws: VerifiedWorkspaceId) {
  const view = await deriveBalance(db, ws); // materializes lazily
  const all = await db.select().from(creditLedger);
  const sum = all
    .filter((r) => r.workspaceId === ws)
    .reduce((s, r) => s + r.delta, 0);
  expect(sum, "sum(delta) of ALL rows must equal the fold's balance").toBe(
    view.balance
  );
  return view;
}

describe("D-M1-8 consumption order", () => {
  it("bullet: January pack (12-mo) + February grant (1-mo) → the GRANT is consumed first despite being newer (the REQ-G03 case)", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    const [packId, grantId] = await insertRows(db, ws, [
      { delta: 1000, kind: "pack", createdAt: JAN1, expiresAt: Y2031 },
      { delta: 100, kind: "grant", createdAt: FEB1, expiresAt: Y2030 },
      { delta: -50, kind: "debit", createdAt: FEB15 },
    ]);
    const rows = await db.select().from(creditLedger);
    const fold = foldLedger(rows, [], new Date());
    const grantLot = fold.lots.find((l) => l.id === grantId);
    const packLot = fold.lots.find((l) => l.id === packId);
    expect(grantLot?.remaining).toBe(50); // grant consumed (soonest expiry)
    expect(packLot?.remaining).toBe(1000); // pack untouched
    await assertInvariant(db, ws);
  });

  it("bullet: equal expiry → older first; then grants before packs", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    const [oldId, newId] = await insertRows(db, ws, [
      { delta: 10, kind: "pack", createdAt: JAN1, expiresAt: Y2030 },
      { delta: 10, kind: "pack", createdAt: FEB1, expiresAt: Y2030 },
      { delta: -5, kind: "debit", createdAt: FEB15 },
    ]);
    let rows = await db.select().from(creditLedger);
    let fold = foldLedger(rows, [], new Date());
    expect(fold.lots.find((l) => l.id === oldId)?.remaining).toBe(5); // older first
    expect(fold.lots.find((l) => l.id === newId)?.remaining).toBe(10);

    // same createdAt AND same expiry → grant outranks pack
    const db2 = await createTestDb();
    const ws2 = await mkWorkspace(db2);
    const [gId, pId] = await insertRows(db2, ws2, [
      { delta: 10, kind: "grant", createdAt: JAN1, expiresAt: Y2030 },
      { delta: 10, kind: "pack", createdAt: JAN1, expiresAt: Y2030 },
      { delta: -5, kind: "debit", createdAt: FEB1 },
    ]);
    rows = await db2.select().from(creditLedger);
    fold = foldLedger(rows, [], new Date());
    expect(fold.lots.find((l) => l.id === gId)?.remaining).toBe(5);
    expect(fold.lots.find((l) => l.id === pId)?.remaining).toBe(10);
  });

  it("bullet: never-expiring adjust lots are consumed LAST", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    const [adjId, packId] = await insertRows(db, ws, [
      { delta: 10, kind: "adjust", createdAt: JAN1, expiresAt: null, reasonCode: "goodwill" },
      { delta: 10, kind: "pack", createdAt: FEB1, expiresAt: Y2030 },
      { delta: -8, kind: "debit", createdAt: FEB15 },
    ]);
    const rows = await db.select().from(creditLedger);
    const fold = foldLedger(rows, [], new Date());
    expect(fold.lots.find((l) => l.id === packId)?.remaining).toBe(2);
    expect(fold.lots.find((l) => l.id === adjId)?.remaining).toBe(10);
  });
});

describe("lazy expiry materialization (D-M1-7)", () => {
  it("bullet: lot expires with remainder → ONE expiry row materialized; fully-consumed lot gets none", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    const [g1] = await insertRows(db, ws, [
      // g1: 100, partially consumed (40), expires Feb-01 → expiry row -60
      { delta: 100, kind: "grant", createdAt: JAN1, expiresAt: FEB1 },
      { delta: -40, kind: "debit", createdAt: JAN15 },
      // g2: 20, fully consumed before expiry → NO expiry row
      { delta: 20, kind: "grant", createdAt: FEB15, expiresAt: MAR1 },
      { delta: -20, kind: "debit", createdAt: D("2026-02-20T00:00:00Z") },
    ]);
    const view = await assertInvariant(db, ws);
    expect(view.balance).toBe(0);
    const expiries = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "expiry"
    );
    expect(expiries).toHaveLength(1);
    expect(expiries[0].refId).toBe(g1);
    expect(expiries[0].delta).toBe(-60);
    // idempotent: a second derivation adds nothing
    await deriveBalance(db, ws);
    const again = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "expiry"
    );
    expect(again).toHaveLength(1);
  });

  it("bullet: fold REPLAYS existing expiry rows — refund after materialization keeps the invariant", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    const [, debitId] = await insertRows(db, ws, [
      { delta: 100, kind: "grant", createdAt: JAN1, expiresAt: FEB1 },
      { delta: -40, kind: "debit", createdAt: JAN15 },
    ]);
    await deriveBalance(db, ws); // materializes -60
    // refund +40 referencing the debit, expiry = the consumed lot's (FEB1 — born expired)
    await insertRows(db, ws, [
      { delta: 40, kind: "refund", createdAt: FEB15, expiresAt: FEB1, refId: debitId },
    ]);
    const view = await assertInvariant(db, ws);
    // the refund lot was born expired → materialized away; balance stays 0
    expect(view.balance).toBe(0);
    const expiries = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "expiry"
    );
    expect(expiries).toHaveLength(2); // one per lot
  });
});

describe("pause-aware effective expiry (D-M1-3)", () => {
  // The two KNOWLEDGE-time columns (round-2 NOTE 3 for the close, round-3
  // CHANGE 1 for the open) exist for the staleness bounds in pause.ts and for
  // nothing else. The fold computes effective expiry from started_at/ended_at
  // ONLY — so rather than mirroring plausible values here (which would let a
  // fold that started reading them stay green), both are pinned to an absurd
  // sentinel a millennium away: any code path that ever folds them produces a
  // wildly different answer and every case in this describe goes red.
  const KNOWLEDGE_SENTINEL = D("3026-01-01T00:00:00Z");
  const mkPause = (id: string, startedAt: Date, endedAt: Date | null) => ({
    id, workspaceId: "w", startedAt, endedAt,
    startedKnownAt: KNOWLEDGE_SENTINEL,
    endedKnownAt: KNOWLEDGE_SENTINEL,
    createdAt: startedAt, updatedAt: startedAt,
  });

  it("bullet: a pause overlapping the expiry shifts it by the pause duration", () => {
    // lot born Jan-01, expires Feb-01; pause Jan-10 → Jan-20 (10 days) → effective Feb-11
    const eff = effectiveExpiry(FEB1, [mkPause("p1", JAN10, D("2026-01-20T00:00:00Z"))], JAN1);
    expect(eff.at?.toISOString()).toBe("2026-02-11T00:00:00.000Z");
    expect(eff.frozen).toBe(false);
  });

  it("bullet: multiple sequential pauses compound chronologically (a later pause that only overlaps the SHIFTED expiry still counts)", () => {
    // lot born Jan-01, expiry Feb-01; pause A Jan-10→Jan-20 shifts to Feb-11;
    // pause B Feb-05→Feb-08 starts before Feb-11 (only because of A) → +3d → Feb-14
    const eff = effectiveExpiry(FEB1, [
      mkPause("a", JAN10, D("2026-01-20T00:00:00Z")),
      mkPause("b", D("2026-02-05T00:00:00Z"), D("2026-02-08T00:00:00Z")),
    ], JAN1);
    expect(eff.at?.toISOString()).toBe("2026-02-14T00:00:00.000Z");
  });

  it("bullet: a pause that begins AFTER the (shifted) expiry has no effect", () => {
    const eff = effectiveExpiry(FEB1, [mkPause("late", MAR1, D("2026-03-10T00:00:00Z"))], JAN1);
    expect(eff.at?.toISOString()).toBe(FEB1.toISOString());
  });


  it("billing round-2 NOTE: OVERLAPPING pause periods count shared time once (interval merge)", () => {
    // lot born Jan-01, expires Feb-01; pauses Jan-10->Jan-20 and Jan-15->Jan-25
    // union = Jan-10->Jan-25 (15d) -> effective Feb-16, NOT Feb-21
    const eff = effectiveExpiry(FEB1, [
      mkPause("a", JAN10, D("2026-01-20T00:00:00Z")),
      mkPause("b", JAN15, D("2026-01-25T00:00:00Z")),
    ], JAN1);
    expect(eff.at?.toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  it("tenancy code-review BLOCK 2: a pause that ENDED BEFORE the lot existed shifts NOTHING (a clock not yet running cannot be suspended)", () => {
    // pause Jan-01→Jan-10; lot born Jan-15, expires Feb-15 → UNSHIFTED
    const eff = effectiveExpiry(FEB15, [mkPause("old", JAN1, JAN10)], JAN15);
    expect(eff.at?.toISOString()).toBe(FEB15.toISOString());
  });

  it("tenancy code-review BLOCK 2: a pause STRADDLING the lot's creation counts only its post-creation portion", () => {
    // pause Jan-10→Jan-20; lot born Jan-15, expires Feb-15 → only Jan-15→Jan-20 (5d) counts → Feb-20
    const eff = effectiveExpiry(FEB15, [mkPause("straddle", JAN10, D("2026-01-20T00:00:00Z"))], JAN15);
    expect(eff.at?.toISOString()).toBe("2026-02-20T00:00:00.000Z");
  });

  it("an OPEN pause that started before the lot existed still freezes it (the lot lives inside the pause)", () => {
    const eff = effectiveExpiry(FEB15, [mkPause("open", JAN1, null)], JAN15);
    expect(eff.frozen).toBe(true);
    expect(eff.at).toBeNull();
  });

  it("bullet: an OPEN pause freezes the clock — the lot cannot expire and is NOT materialized", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await insertRows(db, ws, [
      { delta: 100, kind: "grant", createdAt: JAN1, expiresAt: FEB1 },
    ]);
    await db
      .insert(pausePeriods)
      .values({ workspaceId: ws, startedAt: JAN15 }); // open pause before expiry
    const view = await assertInvariant(db, ws);
    expect(view.balance).toBe(100); // frozen, still spendable-when-resumed... (debits refused while paused by the ops layer)
    const expiries = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "expiry"
    );
    expect(expiries).toHaveLength(0);
  });
});


  it("billing round-1 CHANGE 2: a refund created after a pause is NOT re-shifted by that pause (no double-shift)", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    // grant born JAN1 expires FEB15; pause JAN10->JAN15 (5d) -> grant effective FEB20
    const [grantId] = await insertRows(db, ws, [
      { delta: 100, kind: "grant", createdAt: JAN1, expiresAt: FEB15 },
      { delta: -40, kind: "debit", createdAt: D("2026-01-05T00:00:00Z") },
    ]);
    await db.insert(pausePeriods).values({
      workspaceId: ws, startedAt: JAN10, endedAt: JAN15,
    });
    // refund created MAR1 storing the source lot's EFFECTIVE expiry (FEB20):
    // the JAN pause predates the refund row, so it must NOT shift it again.
    await insertRows(db, ws, [
      { delta: 40, kind: "refund", createdAt: MAR1, expiresAt: D("2026-02-20T00:00:00Z"), refId: "some_debit" },
    ]);
    const rows = await db.select().from(creditLedger);
    const pauses = await db.select().from(pausePeriods);
    const fold = foldLedger(rows, pauses, D("2026-03-02T00:00:00Z"));
    const grantLot = fold.lots.find((l) => l.id === grantId);
    const refundLot = fold.lots.find((l) => l.kind === "refund");
    expect(grantLot?.effectiveExpiresAt?.toISOString()).toBe("2026-02-20T00:00:00.000Z");
    expect(refundLot?.effectiveExpiresAt?.toISOString()).toBe("2026-02-20T00:00:00.000Z"); // EQUAL, not later
    await assertInvariant(db, ws);
  });

  it("AC-3 completion: a positive adjust WITH an expiry participates in the D-M1-8 order by that expiry", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    const [adjId, packId] = await insertRows(db, ws, [
      { delta: 10, kind: "adjust", createdAt: JAN1, expiresAt: FEB1, reasonCode: "goodwill" },
      { delta: 10, kind: "pack", createdAt: JAN1, expiresAt: Y2030 },
      { delta: -5, kind: "debit", createdAt: JAN10 },
    ]);
    const rows = await db.select().from(creditLedger);
    const fold = foldLedger(rows, [], JAN15);
    // the expiring adjust (FEB1) outranks the 2030 pack
    expect(fold.lots.find((l) => l.id === adjId)?.remaining).toBe(5);
    expect(fold.lots.find((l) => l.id === packId)?.remaining).toBe(10);
    await assertInvariant(db, ws);
  });

describe("fold integrity", () => {
  it("throws LedgerIntegrityError on an over-consuming history (a debit written past available balance)", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await insertRows(db, ws, [
      { delta: 10, kind: "grant", createdAt: JAN1, expiresAt: Y2030 },
      { delta: -50, kind: "debit", createdAt: JAN15 },
    ]);
    const rows = await db.select().from(creditLedger);
    expect(() => foldLedger(rows, [], new Date())).toThrow(/over-consumes/);
  });

  it("historical `at` is a PURE read: the view at Jan-20 shows the pre-expiry balance, and no extra write happens", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await insertRows(db, ws, [
      { delta: 100, kind: "grant", createdAt: JAN1, expiresAt: FEB1 },
      { delta: -40, kind: "debit", createdAt: JAN15 },
    ]);
    const historical = await deriveBalance(db, ws, D("2026-01-20T00:00:00Z"));
    expect(historical.balance).toBe(60); // pre-expiry view
    const rowCount = (await db.select().from(creditLedger)).length;
    // materialization already happened (keyed to DB now) — exactly one expiry row
    expect(rowCount).toBe(3);
    const nowView = await deriveBalance(db, ws);
    expect(nowView.balance).toBe(0);
  });
});

// ---- M1 phase 4: the equal-`created_at` replay order (billing round-11 NOTE,
// fold.ts:145-148). These drive the PURE fold with hand-written ids, because
// the whole point is what happens when the uuidv7 tie-break disagrees with
// causality — which no real insert in one process can produce today, and a
// second backend writing in the same microsecond can.
describe("replay order at an identical created_at (round-11 NOTE)", () => {
  /** A ledger row shaped exactly as the fold consumes it. */
  const row = (
    over: Partial<{
      id: string;
      delta: number;
      kind: RawRow["kind"];
      createdAt: Date;
      expiresAt: Date | null;
      refId: string | null;
    }>
  ) =>
    ({
      id: "id",
      workspaceId: "ws",
      delta: 0,
      kind: "grant",
      refType: null,
      refId: null,
      reasonCode: null,
      expiresAt: null,
      amountCents: null,
      configVersion: null,
      stripeEventId: null,
      createdAt: JAN1,
      ...over,
    }) as unknown as Parameters<typeof foldLedger>[0][number];

  it("a LOT replays before a debit that shares its microsecond, even when the debit's id sorts first", () => {
    // "a" < "b": the old `id.localeCompare` tie-break put the DEBIT first and
    // the fold threw `over-consumes` on a perfectly fundable history — and on
    // an append-only table that failure is permanent.
    const rows = [
      row({ id: "b-lot", delta: 100, kind: "grant", expiresAt: Y2030 }),
      row({ id: "a-debit", delta: -30, kind: "debit" }),
    ];
    const fold = foldLedger(rows, [], new Date());
    expect(fold.balance).toBe(70);
  });

  it("an EXPIRY row replays before a debit sharing its microsecond (materialization is measured before the spend it precedes)", () => {
    // deriveBalanceInTx stamps materialized expiry rows and the debit it is
    // validating with the SAME `asOf` by construction, so this tie is real
    // rather than hypothetical. Replayed the other way round, the debit
    // consumes the lot the expiry row is about to claim in full, and the fold
    // throws `materialization drifted`.
    const rows = [
      row({ id: "c-lot", delta: 100, kind: "grant", createdAt: JAN1, expiresAt: FEB1 }),
      row({ id: "d-live", delta: 50, kind: "grant", createdAt: JAN1, expiresAt: Y2030 }),
      row({
        id: "z-expiry", delta: -100, kind: "expiry",
        createdAt: FEB15, refId: "c-lot",
      }),
      row({ id: "a-debit", delta: -20, kind: "debit", createdAt: FEB15 }),
    ];
    const fold = foldLedger(rows, [], new Date());
    expect(fold.balance).toBe(30); // 150 - 100 expired - 20 spent
  });

  it("`id` still breaks a tie WITHIN one rank, so the order stays total and deterministic", () => {
    const rows = [
      row({ id: "b", delta: 10, kind: "grant", expiresAt: Y2030 }),
      row({ id: "a", delta: 10, kind: "grant", expiresAt: Y2030 }),
    ];
    const first = foldLedger(rows, [], new Date());
    const second = foldLedger([...rows].reverse(), [], new Date());
    expect(first.lots.map((l) => l.id)).toEqual(["a", "b"]);
    expect(second.lots.map((l) => l.id)).toEqual(["a", "b"]);
  });
});
