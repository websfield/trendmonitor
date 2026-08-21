// Ledger-op suite (Phase 2 task 8): every op, every typed refusal, refund
// semantics, pause record-keeping. Allocating-write fixtures are built
// RELATIVE TO REAL NOW so the clock guard passes (plan F6); pure-history rows
// use explicit createdAt.
import { describe, expect, it } from "vitest";
import {
  createTestDb,
  creditLedger,
  pausePeriods,
  schema,
  subscriptions,
  trustWorkspaceId,
  type TestDb,
  type VerifiedWorkspaceId,
} from "@respin/db";
import {
  adjustCredits,
  debitCredits,
  grantCredits,
  purchasePackCredits,
  refundCredits,
  RefundSourceNeverExpiresError,
} from "../src/ledger";
import { deriveBalance } from "../src/balance";
import {
  ClockSkewError,
  InsufficientCreditsError,
  WorkspacePausedError,
} from "../src/errors";
import {
  clearPauseMirror,
  ensurePauseEnded,
  recordPauseEnd,
  recordPauseStart,
  hasOpenPause,
  ensurePauseStarted,
} from "../src/pause";

const HOUR = 3_600_000;
const future = (ms: number) => new Date(Date.now() + ms);

async function mkWorkspace(db: TestDb): Promise<VerifiedWorkspaceId> {
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name: "L" })
    .returning();
  return trustWorkspaceId(w.id);
}

const tx = <T>(db: TestDb, fn: (t: Parameters<Parameters<TestDb["transaction"]>[0]>[0]) => Promise<T>) =>
  db.transaction(fn);

describe("ledger ops (PGlite)", () => {
  it("grant → debit spanning lots (partial consumption across grant then pack)", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await tx(db, async (t) => {
      await grantCredits(t, {
        workspaceId: ws, amount: 30, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "in_1", configVersion: 1,
      });
      await purchasePackCredits(t, {
        workspaceId: ws, amount: 1000, expiresAt: future(365 * 24 * HOUR),
        amountCents: 1000, refType: "checkout", refId: "cs_1", configVersion: 1,
      });
    });
    await tx(db, (t) =>
      debitCredits(t, { workspaceId: ws, cost: 50, refType: "test", refId: "g1", at: new Date(), configVersion: 1, })
    );
    const view = await deriveBalance(db, ws);
    expect(view.balance).toBe(980);
    // grant (soonest expiry) fully consumed, pack partially
    const grantLot = view.lots.find((l) => l.kind === "grant");
    const packLot = view.lots.find((l) => l.kind === "pack");
    expect(grantLot?.remaining).toBe(0);
    expect(packLot?.remaining).toBe(980);
  });

  it("bullet: debit larger than balance refused, NO row written; debit exactly equal succeeds", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await tx(db, (t) =>
      grantCredits(t, {
        workspaceId: ws, amount: 10, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "in_1", configVersion: 1,
      })
    );
    await expect(
      tx(db, (t) =>
        debitCredits(t, { workspaceId: ws, cost: 11, refType: "t", refId: "x", at: new Date(), configVersion: 1, })
      )
    ).rejects.toThrow(InsufficientCreditsError);
    const rows = await db.select().from(creditLedger);
    expect(rows.filter((r) => r.kind === "debit")).toHaveLength(0); // no row on refusal
    await tx(db, (t) =>
      debitCredits(t, { workspaceId: ws, cost: 10, refType: "t", refId: "y", at: new Date(), configVersion: 1, })
    );
    expect((await deriveBalance(db, ws)).balance).toBe(0);
  });

  it("bullet: zero/negative-cost debit rejected by API validation", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    for (const cost of [0, -5, 1.5]) {
      await expect(
        tx(db, (t) =>
          debitCredits(t, { workspaceId: ws, cost, refType: "t", refId: "z", at: new Date(), configVersion: 1, })
        )
      ).rejects.toThrow(/positive integer/);
    }
  });

  it("bullet: debit while paused → WorkspacePausedError (distinct from insufficient)", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await tx(db, (t) =>
      grantCredits(t, {
        workspaceId: ws, amount: 100, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "in_1", configVersion: 1,
      })
    );
    await tx(db, (t) => recordPauseStart(t, ws, new Date()));
    await expect(
      tx(db, (t) =>
        debitCredits(t, { workspaceId: ws, cost: 5, refType: "t", refId: "p", at: new Date(), configVersion: 1, })
      )
    ).rejects.toThrow(WorkspacePausedError);
  });

  it("bullet: clock discipline — future `at` (beyond 60s skew) and retroactive `at` rejected on allocating writes", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await tx(db, (t) =>
      grantCredits(t, {
        workspaceId: ws, amount: 100, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "in_1", configVersion: 1,
      })
    );
    await expect(
      tx(db, (t) =>
        debitCredits(t, { workspaceId: ws, cost: 5, refType: "t", refId: "f", at: future(10 * HOUR), configVersion: 1, })
      )
    ).rejects.toThrow(ClockSkewError);
    await expect(
      tx(db, (t) =>
        debitCredits(t, {
          workspaceId: ws, cost: 5, refType: "t", refId: "r",
          at: new Date(Date.now() - 24 * HOUR), // before the grant row
          configVersion: 1,
        })
      )
    ).rejects.toThrow(ClockSkewError);
  });

  it("bullet: negative adjust allocates like a debit (guards + balance check); positive adjust may be never-expiring", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await tx(db, (t) =>
      adjustCredits(t, { workspaceId: ws, delta: 50, reasonCode: "goodwill" })
    );
    await expect(
      tx(db, (t) =>
        adjustCredits(t, { workspaceId: ws, delta: -60, reasonCode: "clawback", at: new Date() })
      )
    ).rejects.toThrow(InsufficientCreditsError);
    await tx(db, (t) =>
      adjustCredits(t, { workspaceId: ws, delta: -20, reasonCode: "clawback", at: new Date() })
    );
    expect((await deriveBalance(db, ws)).balance).toBe(30);
  });

  it("refund: expiry inherited from the consumed lot; over-refund refused; never-expiring source → typed error", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    const expiry = future(48 * HOUR);
    await tx(db, (t) =>
      grantCredits(t, {
        workspaceId: ws, amount: 100, expiresAt: expiry,
        refType: "invoice", refId: "in_1", configVersion: 1,
      })
    );
    const debit = await tx(db, (t) =>
      debitCredits(t, { workspaceId: ws, cost: 40, refType: "t", refId: "d", at: new Date(), configVersion: 1, })
    );
    const refund = await tx(db, (t) =>
      refundCredits(t, { workspaceId: ws, amount: 30, originalDebitId: debit.id })
    );
    expect(refund.expiresAt?.getTime()).toBe(expiry.getTime()); // inherited
    await expect(
      tx(db, (t) =>
        refundCredits(t, { workspaceId: ws, amount: 20, originalDebitId: debit.id })
      )
    ).rejects.toThrow(/exceed the original debit/);

    // never-expiring source → RefundSourceNeverExpiresError
    const db2 = await createTestDb();
    const ws2 = await mkWorkspace(db2);
    await tx(db2, (t) =>
      adjustCredits(t, { workspaceId: ws2, delta: 100, reasonCode: "goodwill" })
    );
    const d2 = await tx(db2, (t) =>
      debitCredits(t, { workspaceId: ws2, cost: 10, refType: "t", refId: "d2", at: new Date(), configVersion: 1, })
    );
    await expect(
      tx(db2, (t) =>
        refundCredits(t, { workspaceId: ws2, amount: 10, originalDebitId: d2.id })
      )
    ).rejects.toThrow(RefundSourceNeverExpiresError);
  });

  it("pause ops: start/end write the period + mirror; end validates the interval; double-start refused", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_pause",
      status: "active",
    });
    const startAt = new Date();
    await tx(db, (t) => recordPauseStart(t, ws, startAt));
    expect(await tx(db, (t) => hasOpenPause(t, ws))).toBe(true);
    const [subPaused] = await db.select().from(schema.subscriptions);
    expect(subPaused.pausedAt?.getTime()).toBe(startAt.getTime());
    await expect(
      tx(db, (t) => recordPauseStart(t, ws, new Date()))
    ).rejects.toThrow(/open pause already exists/);
    // A 1s-retroactive end is INSIDE the 60s skew allowance (the clock guard
    // targets stale clocks, not lock-serialization ordering — code-review
    // BLOCK 1), so the INTERVAL check is what refuses it.
    await expect(
      tx(db, (t) => recordPauseEnd(t, ws, new Date(startAt.getTime() - 1000)))
    ).rejects.toThrow(/must be after the pause start/);
    // A BEYOND-skew retroactive end is the clock guard's job.
    await expect(
      tx(db, (t) => recordPauseEnd(t, ws, new Date(startAt.getTime() - 120_000)))
    ).rejects.toThrow(ClockSkewError);
    await tx(db, (t) => recordPauseEnd(t, ws, new Date(Date.now() + 1000)));
    expect(await tx(db, (t) => hasOpenPause(t, ws))).toBe(false);
    const [subResumed] = await db.select().from(schema.subscriptions);
    expect(subResumed.pausedAt).toBeNull();
  });

  it("code-review CHANGE: a re-pause converges WITHOUT losing the new resume date", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_repause", status: "active",
    });
    const first = new Date(Date.now() + 30 * 24 * 3_600_000);
    const second = new Date(Date.now() + 60 * 24 * 3_600_000);
    expect(
      await db.transaction((t) =>
        ensurePauseStarted(t, wsId, new Date(), first)
      )
    ).toBe(true);
    // Owner re-pauses for a different length: Stripe accepted the new
    // resumes_at, so the mirror must follow rather than keep a date that will
    // never happen. Converges (no throw) AND reconciles.
    expect(
      await db.transaction((t) =>
        ensurePauseStarted(t, wsId, new Date(), second)
      )
    ).toBe(false);
    const [row] = await db.select().from(subscriptions);
    expect(row.resumesAt?.getTime()).toBe(second.getTime());
    // still exactly one open pause
    const open = (await db.select().from(pausePeriods)).filter(
      (p) => p.endedAt === null
    );
    expect(open).toHaveLength(1);
  });

  it("round-11 NOTE: a STALE snapshot cannot rewrite the CURRENT pause's resume date (the knownAt bound now precedes the already-open branch)", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_stale_resume", status: "active",
    });
    const marchResume = new Date(Date.now() + 30 * 24 * HOUR);
    const juneResume = new Date(Date.now() + 90 * 24 * HOUR);

    // Pause 1, already CLOSED. Written directly rather than through the
    // record-keepers because the clock guard (rightly) refuses a `at` ten
    // hours in the past — this is pre-existing history, not a write under test.
    const pause1At = new Date(Date.now() - 10 * HOUR);
    const resumedAt = new Date(Date.now() - 5 * HOUR);
    await db.insert(pausePeriods).values({
      workspaceId: wsId,
      startedAt: pause1At,
      endedAt: resumedAt,
    });

    // Pause 2 is the CURRENT pause: it resumes in June.
    await db.transaction((t) =>
      ensurePauseStarted(t, wsId, new Date(), juneResume)
    );
    expect((await db.select().from(subscriptions))[0].resumesAt?.getTime()).toBe(
      juneResume.getTime()
    );

    // Now the DELAYED pause-1-era snapshot lands. Its knowledge predates the
    // resume we already recorded, so it may neither open a pause nor restate
    // the open one's resume date. Before the fix the knownAt bound sat BELOW
    // the already-open early return, and this call rewrote June → March.
    const changed = await db.transaction((t) =>
      ensurePauseStarted(
        t, wsId, new Date(), marchResume,
        new Date(pause1At.getTime() + 1000) // knownAt: during pause 1
      )
    );
    expect(changed).toBe(false);
    expect((await db.select().from(subscriptions))[0].resumesAt?.getTime()).toBe(
      juneResume.getTime()
    );
  });

  it("round-11 NOTE (non-vacuity): a CONTEMPORANEOUS snapshot still reconciles the open pause's resume date", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_fresh_resume", status: "active",
    });
    const first = new Date(Date.now() + 30 * 24 * HOUR);
    const corrected = new Date(Date.now() + 60 * 24 * HOUR);
    await db.transaction((t) => ensurePauseStarted(t, wsId, new Date(), first));
    // knownAt = now, no earlier closed pause at all → the bound does not bite.
    await db.transaction((t) =>
      ensurePauseStarted(t, wsId, new Date(), corrected, new Date())
    );
    expect((await db.select().from(subscriptions))[0].resumesAt?.getTime()).toBe(
      corrected.getTime()
    );
  });

  it("round-2 NOTE 3: a LATE-processed resume does not make a REAL later pause look stale", async () => {
    // The bound compared a caller's knowledge time against `ended_at`, which is
    // our PROCESSING time. Two different clocks: a resume event delivered after
    // Stripe's backoff is written minutes after `event.created`. So a genuine
    // portal/dashboard pause created INSIDE that window was refused — no
    // pause_periods row, expiry clocks running through a pause Stripe applied,
    // and no further event coming to correct it.
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_late_resume", status: "active",
    });

    // A pause that Stripe resumed at T0; our webhook processed it at T0+5min.
    const t0 = new Date(Date.now() - 8 * HOUR);
    const processedAt = new Date(t0.getTime() + 5 * 60_000);
    await db.insert(pausePeriods).values({
      workspaceId: wsId,
      startedAt: new Date(t0.getTime() - 2 * HOUR),
      endedAt: processedAt,
      endedKnownAt: t0, // what the resume EVENT said, not when we wrote it
    });

    // A new pause created at T0+2min — after the resume, inside the lag.
    const opened = await db.transaction((t) =>
      ensurePauseStarted(
        t, wsId, new Date(), undefined,
        new Date(t0.getTime() + 2 * 60_000)
      )
    );
    expect(opened, "a real, current pause must be recorded").toBe(true);
    expect(await db.transaction((t) => hasOpenPause(t, wsId))).toBe(true);
  });

  it("round-2 NOTE 3 (the protection is UNCHANGED): a snapshot older than the resume it precedes is still refused", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_owner_resume", status: "active",
    });
    // The owner's OWN resume: knowledge time == write time, so both columns
    // agree and a genuinely stale snapshot still cannot re-open the pause.
    const startedAt = new Date(Date.now() - 6 * HOUR);
    const resumedAt = new Date(Date.now() - 1 * HOUR);
    await db.insert(pausePeriods).values({
      workspaceId: wsId,
      startedAt,
      endedAt: resumedAt,
      endedKnownAt: resumedAt,
    });
    const opened = await db.transaction((t) =>
      ensurePauseStarted(
        t, wsId, new Date(), undefined,
        new Date(startedAt.getTime() + 1000) // knowledge from DURING the pause
      )
    );
    expect(opened).toBe(false);
    expect(await db.transaction((t) => hasOpenPause(t, wsId))).toBe(false);
  });

  it("round-2 NOTE 3: ensurePauseEnded RECORDS its knownAt, so the next open-side check compares like with like", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_known_at", status: "active",
    });
    await db.transaction((t) => recordPauseStart(t, wsId, new Date()));
    const knownAt = new Date(Date.now() - 30_000); // within CLOCK_SKEW_MS
    const closed = await db.transaction((t) =>
      ensurePauseEnded(t, wsId, new Date(), knownAt)
    );
    expect(closed).toBe(true);
    const [row] = await db.select().from(pausePeriods);
    expect(row.endedKnownAt?.getTime()).toBe(knownAt.getTime());
    // ...and it is NOT the same as the write instant, which is the whole point.
    expect(row.endedKnownAt?.getTime()).not.toBe(row.endedAt?.getTime());
  });

  // ---- round-3 CHANGE 1: the MIRROR IMAGE of round-2 NOTE 3 (migration 0008)
  //
  // 0007 fixed the OPEN side. The CLOSE side stayed on the wrong clock:
  // `ensurePauseEnded` compared the caller's knowledge time against
  // `started_at`, our PROCESSING time. Same two clocks, opposite direction,
  // strictly worse consequence — the pause never closes, so expiry clocks stay
  // frozen, `state.ts` says `paused`, M3's debit would refuse, and no further
  // event is coming.

  it("round-3 CHANGE 1: a LATE-processed PAUSE does not make a REAL later resume look stale", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_late_pause", status: "active",
    });

    // Stripe applied the pause at T0; our webhook processed it at T0+5min
    // (backoff). started_at is the PROCESSING time; started_known_at is T0.
    const t0 = new Date(Date.now() - 8 * HOUR);
    await db.insert(pausePeriods).values({
      workspaceId: wsId,
      startedAt: new Date(t0.getTime() + 5 * 60_000),
      startedKnownAt: t0,
    });

    // Stripe resumed at T0+2min — AFTER the pause it knows about, BEFORE our
    // processing of that pause. Against `started_at` this looks 3 minutes
    // stale; against `started_known_at` it is 2 minutes NEWER.
    const closed = await db.transaction((t) =>
      ensurePauseEnded(t, wsId, new Date(), new Date(t0.getTime() + 2 * 60_000))
    );
    expect(closed, "a real, current resume must close the pause").toBe(true);
    expect(await db.transaction((t) => hasOpenPause(t, wsId))).toBe(false);
    // ...and the workspace is not left frozen: the mirror is cleared too.
    const [sub] = await db.select().from(subscriptions);
    expect(sub.pausedAt).toBeNull();
  });

  it("round-3 CHANGE 1 (non-vacuity twin): the SAME open pause closes for a caller whose knowledge is NOW", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_now_resume", status: "active",
    });
    const t0 = new Date(Date.now() - 8 * HOUR);
    await db.insert(pausePeriods).values({
      workspaceId: wsId,
      startedAt: new Date(t0.getTime() + 5 * 60_000),
      startedKnownAt: t0,
    });
    const closed = await db.transaction((t) =>
      ensurePauseEnded(t, wsId, new Date(), new Date())
    );
    expect(closed).toBe(true);
  });

  it("round-3 CHANGE 1 (the protection is UNCHANGED): a genuinely stale snapshot still cannot close a fresh pause", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_owner_pause", status: "active",
    });
    // The owner's OWN pause: knowledge time == write time, both "now".
    await db.transaction((t) => recordPauseStart(t, wsId, new Date()));
    const closed = await db.transaction((t) =>
      ensurePauseEnded(t, wsId, new Date(), new Date(Date.now() - 5 * 60_000))
    );
    expect(closed, "a snapshot created 5 minutes before the pause knew nothing about it").toBe(false);
    expect(await db.transaction((t) => hasOpenPause(t, wsId))).toBe(true);
  });

  it("round-3 CHANGE 1: recordPauseStart STORES its knownAt, so the close-side check compares like with like", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_start_known", status: "active",
    });
    const knownAt = new Date(Date.now() - 30_000); // within CLOCK_SKEW_MS
    await db.transaction((t) =>
      recordPauseStart(t, wsId, new Date(), undefined, knownAt)
    );
    const [row] = await db.select().from(pausePeriods);
    expect(row.startedKnownAt?.getTime()).toBe(knownAt.getTime());
    // ...and it is NOT the write instant, which is the whole point.
    expect(row.startedKnownAt?.getTime()).not.toBe(row.startedAt.getTime());
  });

  it("round-3 NOTE: lastPauseCloseKnownAt orders on the SAME expression it returns (coalesce)", async () => {
    // Two closed periods whose PROCESSING order disagrees with their
    // KNOWLEDGE order — the shape the old `order by ended_at, return
    // ended_known_at` split could not distinguish. The bound must use the
    // knowledge-newest close (14:00), so a caller knowing about 13:00 is
    // refused, and one knowing about 14:30 is not.
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_close_order", status: "active",
    });
    const base = Date.now() - 20 * HOUR;
    const at = (h: number) => new Date(base + h * HOUR);
    await db.insert(pausePeriods).values([
      // knowledge 14:00, processed 15:00 (the knowledge-newest close)
      { workspaceId: wsId, startedAt: at(1), startedKnownAt: at(1), endedAt: at(15), endedKnownAt: at(14) },
      // knowledge 10:00, processed 16:00 (processing-newest, knowledge-older)
      { workspaceId: wsId, startedAt: at(16.5), startedKnownAt: at(9), endedAt: at(17), endedKnownAt: at(10) },
    ]);
    const stale = await db.transaction((t) =>
      ensurePauseStarted(t, wsId, new Date(), undefined, at(13))
    );
    expect(stale, "knowledge older than the newest close must not open a pause").toBe(false);
    const fresh = await db.transaction((t) =>
      ensurePauseStarted(t, wsId, new Date(), undefined, at(14.5))
    );
    expect(fresh, "knowledge newer than every close must open one").toBe(true);
  });

  it("round-2 NOTE 4: clearPauseMirror converges a mirror that says paused with no open period", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    // The drifted state the Resume button could not escape: mirror paused,
    // no open pause_periods row, ensurePauseEnded returns false, and the page
    // kept saying "Paused" with no event coming to correct it.
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_drift",
      status: "active",
      pausedAt: new Date(Date.now() - HOUR),
      resumesAt: new Date(Date.now() + 30 * 24 * HOUR),
    });
    expect(await db.transaction((t) => ensurePauseEnded(t, wsId, new Date()))).toBe(
      false
    );
    expect(await db.transaction((t) => clearPauseMirror(t, wsId))).toBe(true);
    const [sub] = await db.select().from(subscriptions);
    expect(sub.pausedAt).toBeNull();
    expect(sub.resumesAt).toBeNull();
  });

  it("round-2 NOTE 4 (the direction that must NOT change): clearPauseMirror refuses while a pause is genuinely OPEN", async () => {
    const db = await createTestDb();
    const wsId = await mkWorkspace(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_open_pause", status: "active",
    });
    await db.transaction((t) => recordPauseStart(t, wsId, new Date()));
    expect(await db.transaction((t) => clearPauseMirror(t, wsId))).toBe(false);
    const [sub] = await db.select().from(subscriptions);
    expect(sub.pausedAt, "an OPEN pause must not be cleared").not.toBeNull();
  });

  it("AC-3 completion: negative adjust while paused -> WorkspacePausedError; paused debit refusal writes NO row", async () => {
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    await tx(db, (t) =>
      grantCredits(t, {
        workspaceId: ws, amount: 100, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "in_1", configVersion: 1,
      })
    );
    await tx(db, (t) => recordPauseStart(t, ws, new Date()));
    await expect(
      tx(db, (t) =>
        adjustCredits(t, { workspaceId: ws, delta: -10, reasonCode: "clawback", at: new Date() })
      )
    ).rejects.toThrow(WorkspacePausedError);
    await expect(
      tx(db, (t) =>
        debitCredits(t, { workspaceId: ws, cost: 5, refType: "t", refId: "p2", at: new Date(), configVersion: 1, })
      )
    ).rejects.toThrow(WorkspacePausedError);
    const rows = await db.select().from(creditLedger);
    expect(rows.filter((r) => r.kind === "debit" || (r.kind === "adjust" && r.delta < 0))).toHaveLength(0);
  });
});

/**
 * THE WRITE CLOCK (round-10 BLOCK). Round 7 moved the fold's READ clock to
 * `clock_timestamp()` and left every insert on the column default — `now()` =
 * `transaction_timestamp()`, the instant the transaction BEGAN. A debit
 * validated against state at t2 was written at t0, so every later fold sorted
 * it before the grant that funded it and threw `over-consumes` forever, on an
 * append-only table that cannot be repaired.
 *
 * Two pins, deliberately of different kinds:
 *  - a BEHAVIOURAL one that forces the gap open inside one transaction and
 *    checks every writer's row against `transaction_timestamp()`, so a writer
 *    that quietly rejoins the default is red;
 *  - a SOURCE SCAN, so a NEW mint path added later (there have been three this
 *    phase) is red the moment it is written, not the first time a lock is
 *    contended in production.
 */
describe("write clock: no credit_ledger row is dated at its transaction's START", () => {
  it("every writer (grant, pack, adjust ±, refund, debit, expiry materialization) postdates transaction_timestamp()", async () => {
    const { sql } = await import("drizzle-orm");
    const db = await createTestDb();
    const ws = await mkWorkspace(db);
    // A lot that is ALREADY expired with a remainder, so the debit's own
    // deriveBalanceInTx has an expiry row to materialize inside the same tx.
    await db.insert(creditLedger).values({
      workspaceId: ws, delta: 40, kind: "grant",
      createdAt: new Date(Date.now() - 48 * HOUR),
      expiresAt: new Date(Date.now() - 24 * HOUR),
      refType: "invoice", refId: "in_expired", configVersion: 1,
    });

    const { txStart, ids } = await tx(db, async (t) => {
      const started = (await t.execute(
        sql`SELECT transaction_timestamp() AS at`
      )) as unknown as { rows: { at: Date | string }[] };
      const raw = started.rows[0].at;
      const txStart = raw instanceof Date ? raw : new Date(raw);
      // Hold the transaction open long enough that "transaction start" and
      // "now" are unmistakably different. 60ms of sleep against a 40ms
      // assertion is the whole discriminator: with the column default every
      // row below lands exactly ON txStart.
      await t.execute(sql`SELECT pg_sleep(0.06)`);

      const ids: Record<string, string> = {};
      ids.grant = (
        await grantCredits(t, {
          workspaceId: ws, amount: 100, expiresAt: future(24 * HOUR),
          refType: "invoice", refId: "in_wc", configVersion: 1,
        })
      ).id;
      ids.pack = (
        await purchasePackCredits(t, {
          workspaceId: ws, amount: 50, expiresAt: future(365 * 24 * HOUR),
          amountCents: 1000, refType: "checkout_session", refId: "cs_wc",
          configVersion: 1,
        })
      ).id;
      ids.adjustPositive = (
        await adjustCredits(t, {
          workspaceId: ws, delta: 10, reasonCode: "goodwill",
          expiresAt: future(24 * HOUR),
        })
      ).id;
      // Allocating writes. The debit's fold materializes the expired lot above.
      const debit = await debitCredits(t, {
        workspaceId: ws, cost: 5, refType: "gen", refId: "g_wc",
        at: new Date(), configVersion: 1,
      });
      ids.debit = debit.id;
      ids.adjustNegative = (
        await adjustCredits(t, {
          workspaceId: ws, delta: -3, reasonCode: "clawback", at: new Date(),
        })
      ).id;
      ids.refund = (
        await refundCredits(t, {
          workspaceId: ws, amount: 2, originalDebitId: debit.id,
        })
      ).id;
      return { txStart, ids };
    });

    const rows = await db.select().from(creditLedger);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const expiry = rows.find((r) => r.kind === "expiry");
    expect(expiry, "the debit's fold must have materialized the expired lot").toBeDefined();
    ids.expiryMaterialization = expiry!.id;

    const stale = Object.entries(ids)
      .map(([label, id]) => ({
        label,
        msAfterTxStart:
          byId.get(id)!.createdAt.getTime() - txStart.getTime(),
      }))
      .filter((r) => r.msAfterTxStart < 40);
    expect(
      stale,
      "these writers took the TRANSACTION-START clock: their rows sort before anything that committed while the transaction waited"
    ).toEqual([]);

    // ...and the ledger the fold produces from those rows is still consistent.
    expect((await deriveBalance(db, ws)).balance).toBe(100 + 50 + 10 - 5 - 3 + 2);
  });

  it("SOURCE SCAN: every `.insert(creditLedger)` in packages/credits/src sets createdAt", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname, relative } = await import("node:path");
    const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(resolve(dir, e.name))
          : e.name.endsWith(".ts")
            ? [resolve(dir, e.name)]
            : []
      );

    // Comments are blanked (length-preserving) before scanning. The AC-9 scan
    // learned this the hard way in round 5 — it first went red on the comment
    // that QUOTED the pattern it was looking for — and the write-clock note at
    // the top of ledger.ts quotes `.insert(creditLedger)` for exactly the same
    // reason. A prose mention of a call is not a call.
    // LINE comments first, then block comments — deliberately, and this order
    // is itself a bug this test already made once: the write-clock note writes
    // the path `src/**`, whose `/**` opens a block comment as far as a regex is
    // concerned, and blanking blocks first swallowed real code up to the next
    // `*/` (the scan then reported 4 sites instead of 6, which the non-vacuity
    // assertion below is what caught).
    const blankComments = (src: string): string =>
      src
        .replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

    const sites: { file: string; hasCreatedAt: boolean }[] = [];
    for (const file of walk(SRC)) {
      const src = blankComments(readFileSync(file, "utf8"));
      let from = 0;
      for (;;) {
        const at = src.indexOf(".insert(creditLedger)", from);
        if (at === -1) break;
        // The statement ends at `.returning()` or the next `;`, whichever comes
        // first — enough to cover the `.values({...})` that belongs to it.
        const endCandidates = [
          src.indexOf(".returning(", at),
          src.indexOf(";", at),
        ].filter((i) => i !== -1);
        const end = Math.min(...endCandidates);
        sites.push({
          file: relative(SRC, file).replace(/\\/g, "/"),
          hasCreatedAt: /createdAt\s*[,:]/.test(src.slice(at, end)),
        });
        from = at + 1;
      }
    }

    // Non-vacuity: the scan must actually be finding the mint paths. Every
    // ledger op plus the expiry materialization.
    expect(sites.length, "the scan found no insert sites — it has gone blind").toBeGreaterThanOrEqual(6);
    expect(sites.map((s) => s.file)).toContain("balance.ts");
    expect(sites.map((s) => s.file)).toContain("ledger.ts");
    expect(
      sites.filter((s) => !s.hasCreatedAt),
      "a credit_ledger insert that takes the column default is dated at its transaction's START — see the write-clock note at the top of ledger.ts"
    ).toEqual([]);
  });
});
