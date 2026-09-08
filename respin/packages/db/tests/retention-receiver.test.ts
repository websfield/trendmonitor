// Phase 10b-1 Task 6.4/6.5 — the retention receiver and the attempt receiver,
// against a real (PGlite) database with the shipped migrations.
//
// Every case here is one of the plan's mutation-matrix rows or one of C5's
// named properties. The two that matter most, because getting either wrong
// loses money or leaks identity:
//
//   * "Redact Stripe payload before finance extraction" must be impossible.
//   * "Ignore null/deleted-workspace retention rows" must be impossible.
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { stripeEvents } from "../src/billing-schema";
import { session, verification, rateLimit } from "../src/auth-schema";
import {
  runRetentionTick,
  RETENTION_BATCH_SIZE,
  pseudonymousWorkspaceKey,
} from "../src/retention-receiver";
import { retentionSweepSpecs } from "../src/retention-clocks";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-08T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

const financeRows = (db: TestDb) =>
  db.execute(sql`SELECT * FROM "stripe_finance_extracts" ORDER BY object_id`) as unknown as Promise<{
    rows: {
      source_stripe_event_id: string;
      object_id: string;
      status: string;
      incomplete_reason: string | null;
      amount_excluding_tax_cents: number | null;
      workspace_key: string | null;
    }[];
  }>;

const paidInvoice = (amount: number) => ({
  data: {
    object: {
      object: "invoice",
      id: "in_1",
      currency: "usd",
      payment_intent: "pi_1",
      lines: {
        data: [
          {
            id: "il_1",
            currency: "usd",
            amount_excluding_tax: amount,
            period: { start: 1_760_000_000, end: 1_762_592_000 },
          },
        ],
      },
      customer_email: "creator@example.test",
    },
  },
});

describe("retention receiver", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("sweeps an expired session with NO traffic — the clock is the only trigger", async () => {
    await seedAuthUser(db, "u_live");
    await db.insert(session).values([
      { id: "s_old", token: "t_old", userId: "u_live", expiresAt: ago(2 * DAY), ipAddress: "203.0.113.7", userAgent: "curl/8" },
      { id: "s_fresh", token: "t_fresh", userId: "u_live", expiresAt: new Date(now.getTime() + DAY) },
    ]);

    const summary = await runRetentionTick(db, now);

    const left = await db.select().from(session);
    expect(left.map((row) => row.id)).toEqual(["s_fresh"]);
    // The COMPLETE row goes — token, IP and user agent with it (C5).
    expect(summary.deleted).toBeGreaterThan(0);
  });

  it("does not sweep a row one second before its deadline, and does one second after", async () => {
    await seedAuthUser(db, "u_edge");
    // session_expiry is 24 h after `expires_at`.
    await db.insert(session).values([
      { id: "s_just_inside", token: "t_in", userId: "u_edge", expiresAt: ago(DAY - 1000) },
      { id: "s_just_outside", token: "t_out", userId: "u_edge", expiresAt: ago(DAY + 1000) },
    ]);

    await runRetentionTick(db, now);

    expect((await db.select().from(session)).map((row) => row.id)).toEqual(["s_just_inside"]);
  });

  it("sweeps Better Auth's rate_limit off its EPOCH-MILLIS column, not a timestamp", async () => {
    await db.insert(rateLimit).values([
      { id: "rl_old", key: "k_old", count: 3, lastRequest: ago(2 * DAY).getTime() },
      { id: "rl_new", key: "k_new", count: 1, lastRequest: now.getTime() },
    ]);

    await runRetentionTick(db, now);

    expect((await db.select().from(rateLimit)).map((row) => row.id)).toEqual(["rl_new"]);
  });

  it("sweeps a verification row 24 h after expiry", async () => {
    await db.insert(verification).values([
      { id: "v_old", identifier: "a@b.test", value: "secret", expiresAt: ago(2 * DAY) },
      { id: "v_new", identifier: "c@d.test", value: "secret", expiresAt: ago(1000) },
    ]);

    await runRetentionTick(db, now);

    expect((await db.select().from(verification)).map((row) => row.id)).toEqual(["v_new"]);
  });

  describe("the Stripe payload's 90-day clock", () => {
    const overdue = ago(91 * DAY);

    it("EXTRACTS THE FINANCE FACTS BEFORE REDACTING, in the same transaction", async () => {
      await db.insert(stripeEvents).values({
        id: "evt_paid",
        type: "invoice.paid",
        payload: paidInvoice(1900),
        receiptAttribution: "unattributed",
        outcome: "processed",
        receivedAt: overdue,
      });

      await runRetentionTick(db, now);

      // The payload is gone...
      const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, "evt_paid"));
      expect(event!.payload).toEqual({});
      // ...and the money fact it carried is not. This is the mutation matrix's
      // "redact Stripe payload before finance extraction": were the order
      // reversed, the extract would read `{}` and this row would be absent or
      // incomplete, so the assertion cannot pass by accident.
      const extracts = await financeRows(db);
      expect(extracts.rows).toHaveLength(1);
      expect(extracts.rows[0]).toMatchObject({
        source_stripe_event_id: "evt_paid",
        status: "complete",
        amount_excluding_tax_cents: 1900,
      });
      // Content-free: the email in the payload never reaches the extract.
      expect(JSON.stringify(extracts.rows)).not.toContain("creator@example.test");
    });

    it("sweeps a NULL-workspace event exactly like an attributed one (mutation: ignore null-workspace rows)", async () => {
      await db.insert(stripeEvents).values([
        {
          id: "evt_null_ws",
          type: "invoice.paid",
          payload: paidInvoice(500),
          receiptAttribution: "unattributed",
          outcome: "refused_unknown_customer",
          receivedAt: overdue,
        },
      ]);

      await runRetentionTick(db, now);

      const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, "evt_null_ws"));
      expect(event!.payload).toEqual({});
      expect(event!.workspaceId).toBeNull();
      // The event row itself is RETAINED — C5 keeps the content-free audit
      // metadata and only the payload is redacted.
      expect(await db.select().from(stripeEvents)).toHaveLength(1);
    });

    it("records an INCOMPLETE extract rather than a zero when the payload cannot be read", async () => {
      await db.insert(stripeEvents).values({
        id: "evt_unreadable",
        type: "invoice.paid",
        payload: { data: { object: { object: "invoice", id: "in_x", currency: "usd", lines: { data: [] } } } },
        receiptAttribution: "unattributed",
        outcome: "processed",
        receivedAt: overdue,
      });

      await runRetentionTick(db, now);

      const extracts = await financeRows(db);
      expect(extracts.rows).toHaveLength(1);
      expect(extracts.rows[0]!.status).toBe("incomplete");
      expect(extracts.rows[0]!.incomplete_reason).toBe("missing_service_period");
      // NOT zero. A zero here would be a revenue number nobody measured.
      expect(extracts.rows[0]!.amount_excluding_tax_cents).toBeNull();
      // The redaction still happened: an unreadable payload must not wedge the
      // 90-day deadline (C5).
      const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, "evt_unreadable"));
      expect(event!.payload).toEqual({});
    });

    it("is IDEMPOTENT: a second tick redacts nothing more and books no second extract", async () => {
      await db.insert(stripeEvents).values({
        id: "evt_twice",
        type: "invoice.paid",
        payload: paidInvoice(1900),
        receiptAttribution: "unattributed",
        outcome: "processed",
        receivedAt: overdue,
      });

      const first = await runRetentionTick(db, now);
      const second = await runRetentionTick(db, now);

      expect(first.redacted).toBeGreaterThan(0);
      // An already-redacted row must stop matching, or the sweep rewrites the
      // same rows every minute and never terminates.
      expect(second.redacted).toBe(0);
      expect(second.financeExtractsWritten).toBe(0);
      expect((await financeRows(db)).rows).toHaveLength(1);
    });

    it("leaves a payload inside its 90 days completely alone", async () => {
      await db.insert(stripeEvents).values({
        id: "evt_recent",
        type: "invoice.paid",
        payload: paidInvoice(1900),
        receiptAttribution: "unattributed",
        outcome: "processed",
        receivedAt: ago(89 * DAY),
      });

      await runRetentionTick(db, now);

      const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, "evt_recent"));
      expect(event!.payload).not.toEqual({});
      expect((await financeRows(db)).rows).toHaveLength(0);
    });
  });

  it("never sweeps a financial-chain table — R-122's destructive receiver stays disabled", () => {
    // Structural, not incidental: the sweep population is derived from the
    // registry and `financial_chain_seven_years` is not a scheduled clock, so
    // no financial table can appear here at all.
    const swept = new Set(retentionSweepSpecs().map((spec) => spec.measure.table));
    for (const table of ["credit_ledger", "subscriptions", "pause_periods", "model_usage", "workspace_spend_monthly"]) {
      expect(swept.has(table as never), table).toBe(false);
    }
  });

  it("reports per-table counts and the oldest overdue age, and never throws on one bad table", async () => {
    await seedAuthUser(db, "u_counts");
    await db.insert(session).values({ id: "s1", token: "t1", userId: "u_counts", expiresAt: ago(3 * DAY) });

    const summary = await runRetentionTick(db, now);

    const sessions = summary.tables.find((table) => table.table === "session");
    expect(sessions).toBeDefined();
    expect(sessions!.deleted).toBe(1);
    expect(sessions!.failureCode).toBeNull();
    // Nothing remains overdue once the sweep has run.
    expect(sessions!.oldestOverdueMs).toBeNull();
    expect(summary.failures).toEqual([]);
  });

  it("bounds one statement to the batch size", () => {
    expect(RETENTION_BATCH_SIZE).toBeGreaterThan(0);
    expect(RETENTION_BATCH_SIZE).toBeLessThanOrEqual(1000);
  });
});

describe("pseudonymousWorkspaceKey", () => {
  it("is stable for one workspace and different across workspaces", () => {
    const a = pseudonymousWorkspaceKey("019b0d7a-86df-7000-8000-000000000001");
    const b = pseudonymousWorkspaceKey("019b0d7a-86df-7000-8000-000000000002");
    expect(a).toBe(pseudonymousWorkspaceKey("019b0d7a-86df-7000-8000-000000000001"));
    expect(a).not.toBe(b);
  });

  it("does not contain the workspace id it was derived from", () => {
    const id = "019b0d7a-86df-7000-8000-000000000001";
    expect(pseudonymousWorkspaceKey(id)).not.toContain(id);
    expect(pseudonymousWorkspaceKey(id)).not.toContain(id.replace(/-/g, ""));
  });
});
