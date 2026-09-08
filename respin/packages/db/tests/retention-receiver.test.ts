// Phase 10b-1 Task 6.4/6.5 — the retention receiver and the attempt receiver,
// against a real (PGlite) database with the shipped migrations.
//
// Every case here is one of the plan's mutation-matrix rows or one of C5's
// named properties. The two that matter most, because getting either wrong
// loses money or leaks identity:
//
//   * "Redact Stripe payload before finance extraction" must be impossible.
//   * "Ignore null/deleted-workspace retention rows" must be impossible.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { stripeEvents } from "../src/billing-schema";
import { workspaces } from "../src/schema";
import { ensureUserWorkspace } from "../src/bootstrap";
import { creatorProfiles } from "../src/brain-schema";
import { generationAttempts } from "../src/generation-schema";
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

  describe("the row class is part of the predicate, not just part of the key", () => {
    // Round 1 of the Tasks 6-9 gate: `overduePredicate` built only
    // "precondition AND clock". A measure registered for ONE row class of a
    // mixed table therefore swept ALL of them -- so the 90-day
    // `customer_attributed` sweep stripped `workspace_id` and
    // `tier_invoice_authority` off `workspace_attributed` rows that R-122
    // retains for seven years, on LIVE workspaces, reporting no failure.
    const overdue = ago(91 * DAY);

    it("KEEPS the workspace link and the tier authority on a workspace-attributed event", async () => {
      const [ws] = await db.insert(workspaces).values({ name: "Live workspace" }).returning();
      await db.insert(stripeEvents).values({
        id: "evt_ws",
        type: "invoice.paid",
        payload: paidInvoice(2500),
        receiptAttribution: "workspace_attributed",
        workspaceId: ws!.id,
        stripeCustomerId: "cus_live",
        tierInvoiceAuthority: { tier: "pro" },
        outcome: "processed",
        receivedAt: overdue,
      });

      const summary = await runRetentionTick(db, now);
      expect(summary.tables.filter((t) => t.failureCode !== null)).toEqual([]);

      const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, "evt_ws"));
      // The 90-day PAYLOAD clock still applies to every class...
      expect(event!.payload).toEqual({});
      // ...but the seven-year financial-chain columns are NOT the payload.
      expect(event!.workspaceId).toBe(ws!.id);
      expect(event!.tierInvoiceAuthority).toEqual({ tier: "pro" });
      expect(event!.stripeCustomerId).toBe("cus_live");
    });

    it("gives that event's finance extract a REAL pseudonymous chain key", async () => {
      const [ws] = await db.insert(workspaces).values({ name: "Live workspace" }).returning();
      await db.insert(stripeEvents).values({
        id: "evt_ws_key",
        type: "invoice.paid",
        payload: paidInvoice(2500),
        receiptAttribution: "workspace_attributed",
        workspaceId: ws!.id,
        stripeCustomerId: "cus_live",
        outcome: "processed",
        receivedAt: overdue,
      });

      await runRetentionTick(db, now);

      // C5's "linked pseudonymous financial chain". A null here is what the
      // link sweep produced when it ran first and nulled workspace_id: every
      // extract unattributed, and 10b-2 unable to group a workspace's periods.
      const extracts = await financeRows(db);
      expect(extracts.rows).toHaveLength(1);
      expect(extracts.rows[0]!.workspace_key).toBe(pseudonymousWorkspaceKey(ws!.id));
      // Pseudonymous, not the id itself.
      expect(extracts.rows[0]!.workspace_key).not.toBe(ws!.id);
    });

    it("still redacts the customer-attributed class its measure DOES name", async () => {
      await db.insert(stripeEvents).values({
        id: "evt_cus",
        type: "invoice.paid",
        payload: paidInvoice(700),
        receiptAttribution: "customer_attributed",
        stripeCustomerId: "cus_person",
        outcome: "processed",
        receivedAt: overdue,
      });

      await runRetentionTick(db, now);

      const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, "evt_cus"));
      // The narrowing must not turn the sweep off for the class it governs.
      expect(event!.stripeCustomerId).toMatch(/^redacted_/);
      expect(event!.payload).toEqual({});
    });

    it("gives each row in ONE batch its OWN redaction token", async () => {
      await db.insert(stripeEvents).values([
        { id: "evt_a", type: "invoice.paid", payload: paidInvoice(100), receiptAttribution: "customer_attributed", stripeCustomerId: "cus_a", outcome: "processed", receivedAt: overdue },
        { id: "evt_b", type: "invoice.paid", payload: paidInvoice(100), receiptAttribution: "customer_attributed", stripeCustomerId: "cus_b", outcome: "processed", receivedAt: overdue },
      ]);

      await runRetentionTick(db, now);

      const rows = await db.select().from(stripeEvents);
      const tokens = rows.map((row) => row.stripeCustomerId);
      expect(tokens.every((token) => token?.startsWith("redacted_"))).toBe(true);
      // Minting one uuid per STATEMENT makes two formerly-distinct customers
      // joinable by their placeholder -- the property the code claims to hold.
      expect(new Set(tokens).size).toBe(2);
    });
  });

  describe("terminal generation attempts — C5 splits settled from the rest", () => {
    // Round 1: this table's retention rule was `generation_recovery_24_hours`,
    // the RECOVERY receiver's hard-clear boundary borrowed as a retention
    // clock. A settled generation was therefore deleted 24 h after it
    // succeeded, and `generations_attempt_fk` cascaded the generation, its
    // feedback and its results with it -- leaving the credit_ledger debit
    // pointing at nothing. The measure's own `why` said "one year".
    const YEAR = 365 * DAY;

    const seed = async () => {
      await seedAuthUser(db, "ga_user");
      const workspaceId = (await ensureUserWorkspace(db, { authUserId: "ga_user", name: "GA" })).workspace.id;
      const profileId = (
        await db.insert(creatorProfiles).values({ workspaceId, displayName: "P" }).returning()
      )[0]!.id;
      return { workspaceId, profileId };
    };

    const attempt = async (over: Partial<typeof generationAttempts.$inferInsert>) => {
      const { workspaceId, profileId } = await seed();
      return (
        await db.insert(generationAttempts).values({
          profileId, workspaceId,
          attemptId: `att_${Math.random().toString(36).slice(2)}`,
          purpose: "generation", mode: "hook", payloadSha256: "a".repeat(64),
          ...over,
        }).returning()
      )[0]!;
    };

    it("KEEPS a settled attempt long past 24 hours — it follows its financial chain", async () => {
      const settled = await attempt({
        state: "settled",
        claimedAt: ago(2 * DAY),
        vendorStartedAt: ago(2 * DAY),
        vendorCompletedAt: ago(2 * DAY),
        terminalAt: ago(2 * DAY),
        generationId: randomUUID(),
      });

      await runRetentionTick(db, now);

      const left = await db.select().from(generationAttempts).where(eq(generationAttempts.id, settled.id));
      expect(left).toHaveLength(1);
    });

    it("KEEPS a settled attempt even past a year — the one-year clock is for the OTHERS", async () => {
      const settled = await attempt({
        state: "settled",
        claimedAt: ago(2 * YEAR),
        vendorStartedAt: ago(2 * YEAR),
        vendorCompletedAt: ago(2 * YEAR),
        terminalAt: ago(2 * YEAR),
        generationId: randomUUID(),
      });

      await runRetentionTick(db, now);

      expect(await db.select().from(generationAttempts).where(eq(generationAttempts.id, settled.id))).toHaveLength(1);
    });

    it("sweeps a REFUSED attempt one year after its terminal time, and not before", async () => {
      const old = await attempt({ state: "refused", refusalCode: "abandoned_before_vendor", claimedAt: ago(YEAR + DAY), terminalAt: ago(YEAR + DAY) });
      const young = await attempt({ state: "refused", refusalCode: "abandoned_before_vendor", claimedAt: ago(YEAR - DAY), terminalAt: ago(YEAR - DAY) });

      await runRetentionTick(db, now);

      const ids = (await db.select().from(generationAttempts)).map((row) => row.id);
      expect(ids).toContain(young.id);
      expect(ids).not.toContain(old.id);
    });
  });

  it("EXTRACTS EVERY ROW IT REDACTS, past the batch boundary (round 1: two different 500-row sets)", async () => {
    // The extract selected `ORDER BY received_at LIMIT 500`; the redaction
    // selected `ORDER BY ctid LIMIT 500`. Above 500 overdue rows those are
    // different sets, so a row in the second and not the first was redacted
    // with its finance facts never extracted -- and `extractBeforeRedaction`
    // skips `payload = '{}'`, so the fact is unrecoverable. The physical order
    // here is deliberately the REVERSE of `received_at` -- row 1 is inserted
    // first and is the NEWEST -- which is what makes the two orderings
    // disagree. With them in agreement this test passes either way.
    const total = RETENTION_BATCH_SIZE + 100;
    await db.execute(sql`
      INSERT INTO "stripe_events" (id, type, payload, receipt_attribution, outcome, received_at)
      SELECT
        'evt_bulk_' || g,
        'invoice.paid',
        jsonb_build_object('data', jsonb_build_object('object', jsonb_build_object(
          'object', 'invoice', 'id', 'in_' || g, 'currency', 'usd',
          'lines', jsonb_build_object('data', jsonb_build_array(jsonb_build_object(
            'id', 'il_' || g, 'currency', 'usd', 'amount_excluding_tax', 1900,
            'period', jsonb_build_object('start', 1760000000, 'end', 1762592000))))))),
        'unattributed', 'processed',
        ${ago(91 * DAY)}::timestamptz - g * interval '1 second'
      FROM generate_series(1, ${total}) AS g
    `);

    await runRetentionTick(db, now);

    const redacted = (await db.execute(sql`
      SELECT count(*)::int AS n FROM "stripe_events" WHERE payload::text = '{}'
    `)) as unknown as { rows: { n: number }[] };
    const extracted = (await db.execute(sql`
      SELECT count(DISTINCT source_stripe_event_id)::int AS n FROM "stripe_finance_extracts"
    `)) as unknown as { rows: { n: number }[] };

    expect(redacted.rows[0]!.n).toBe(total);
    // The property: NOT "some were extracted", but "every redacted row was".
    expect(extracted.rows[0]!.n).toBe(redacted.rows[0]!.n);
  });

  it("REPORTS NO BACKLOG once a REDACTION sweep is done — the alarm must not be permanently critical", async () => {
    // Round 2. `oldestOverdueMs` and `countOverdue` used the sweep's clock
    // predicate WITHOUT `NOT (redactionDonePredicate)`. Redaction blanks columns;
    // it does not move `received_at` -- so a correctly redacted row stayed
    // "overdue" forever and the age grew daily. `OVERDUE_BACKLOG_MS` is 24 h at
    // `critical`, so 25 hours after the first Stripe payload was redacted a
    // fully caught-up receiver would page forever, and the one signal that
    // separates "keeping up" from "losing the race" is the first thing muted.
    // The existing health test seeds a `session` row -- a DELETE measure, where
    // the row is gone and the assertion cannot fail. This one uses a REDACTION.
    await db.insert(stripeEvents).values({
      id: "evt_backlog",
      type: "invoice.paid",
      payload: paidInvoice(1900),
      receiptAttribution: "unattributed",
      outcome: "processed",
      receivedAt: ago(200 * DAY),
    });

    const first = await runRetentionTick(db, now);
    expect(first.redacted).toBeGreaterThan(0);
    const second = await runRetentionTick(db, now);

    expect(second.redacted).toBe(0);
    const payloadSpecs = second.tables.filter((table) => table.key.endsWith("::provider_payload"));
    expect(payloadSpecs.length).toBeGreaterThan(0);
    for (const table of payloadSpecs) {
      expect(table.scanned).toBe(0);
      expect(table.oldestOverdueMs).toBeNull();
    }
    expect(second.oldestOverdueMs).toBeNull();
  });

  it("KEEPS an INCOMPLETE finance extract past the 30-day complete-row clock", async () => {
    // The third face of the row-class defect, and the one with no witness until
    // now: `finance_extract_complete` carries a 30-day clock,
    // `finance_extract_incomplete` carries financial_chain_seven_years, and the
    // discriminator is `status`. A reviewer exempted just this table from the
    // class filter and the whole suite stayed green while the incomplete row --
    // C5's "permanent authority for withholding that period" -- was deleted.
    const ingested = ago(31 * DAY);
    await db.execute(sql`
      INSERT INTO "stripe_events" (id, type, payload, receipt_attribution, outcome, received_at)
      VALUES ('evt_src', 'invoice.paid', '{}'::jsonb, 'unattributed', 'processed', ${ago(200 * DAY)})
    `);
    await db.execute(sql`
      INSERT INTO "stripe_finance_extracts"
        (id, source_stripe_event_id, object_type, object_id, status, incomplete_reason,
         currency, amount_excluding_tax_cents, extraction_version, ingested_at)
      VALUES
        (gen_random_uuid(), 'evt_src', 'invoice_line', 'il_done', 'complete', NULL,
         'USD', 1900, 1, ${ingested}),
        (gen_random_uuid(), 'evt_src', 'invoice_line', 'il_open', 'incomplete', 'missing_amount',
         'USD', NULL, 1, ${ingested})
    `);

    await runRetentionTick(db, now);

    const left = (await db.execute(sql`
      SELECT object_id, status FROM "stripe_finance_extracts" ORDER BY object_id
    `)) as unknown as { rows: { object_id: string; status: string }[] };
    // The complete row is spent once the projector has ingested it; the
    // incomplete row is the seven-year authority and must survive.
    expect(left.rows.map((row) => row.object_id)).toEqual(["il_open"]);
    expect(left.rows[0]!.status).toBe("incomplete");
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
