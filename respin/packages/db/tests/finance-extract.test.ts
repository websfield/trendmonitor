// Phase 10b-1 Task 6.3 — the pre-redaction Stripe finance extractor.
//
// The extractor is pure, so these are exact assertions about exact inputs. The
// property under test throughout is C5's: an absent or unreadable field becomes
// an `incomplete` row with a reason — never a zero, never a silent skip, and
// never a delay to the 90-day redaction.
import { describe, expect, it } from "vitest";

import {
  extractFinanceFacts,
  FINANCE_EXTRACTION_VERSION,
  type FinanceExtractInput,
} from "../src/finance-extract";

const input = (object: unknown, over: Partial<FinanceExtractInput> = {}): FinanceExtractInput => ({
  eventId: "evt_1",
  eventType: "invoice.paid",
  object,
  workspaceKey: "wk_abc",
  ...over,
});

const invoice = (over: Record<string, unknown> = {}, line: Record<string, unknown> = {}) => ({
  object: "invoice",
  id: "in_1",
  currency: "usd",
  payment_intent: "pi_1",
  lines: {
    data: [
      {
        id: "il_1",
        currency: "usd",
        amount_excluding_tax: 1900,
        period: { start: 1_760_000_000, end: 1_762_592_000 },
        ...line,
      },
    ],
  },
  ...over,
});

describe("finance extract — the complete path", () => {
  it("lifts one row per invoice LINE, each with its own service period", () => {
    const rows = extractFinanceFacts(
      input(
        invoice({
          lines: {
            data: [
              { id: "il_1", currency: "usd", amount_excluding_tax: 1900, period: { start: 1_760_000_000, end: 1_762_592_000 } },
              { id: "il_2", currency: "usd", amount_excluding_tax: 500, period: { start: 1_762_592_000, end: 1_765_184_000 } },
            ],
          },
        }),
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual(["complete", "complete"]);
    expect(rows.map((row) => row.amountExcludingTaxCents)).toEqual([1900, 500]);
    // Distinct object ids: the unique key is (event, object id), so two lines
    // of one invoice are two rows rather than one overwriting the other.
    expect(new Set(rows.map((row) => row.objectId)).size).toBe(2);
    expect(rows[0]!.servicePeriodStart?.toISOString()).toBe(new Date(1_760_000_000 * 1000).toISOString());
    expect(rows[0]!.extractionVersion).toBe(FINANCE_EXTRACTION_VERSION);
    expect(rows[0]!.workspaceKey).toBe("wk_abc");
  });

  it("reads a linked object whether Stripe sent an id or an expanded object", () => {
    const asId = extractFinanceFacts(input(invoice({ payment_intent: "pi_1" })));
    const expanded = extractFinanceFacts(input(invoice({ payment_intent: { object: "payment_intent", id: "pi_1" } })));
    expect(asId[0]!.paymentIntentId).toBe("pi_1");
    // Reading only the string form is the classic way to lose a relation on an
    // event that happened to arrive expanded.
    expect(expanded[0]!.paymentIntentId).toBe("pi_1");
  });

  it("reads Stripe timestamps as epoch SECONDS, not milliseconds", () => {
    const rows = extractFinanceFacts(input(invoice({}, { period: { start: 1_760_000_000, end: 1_762_592_000 } })));
    // Read as milliseconds this lands in 1970, which is the whole point.
    expect(rows[0]!.servicePeriodStart!.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it("extracts a dispute with its status, amount and charge link", () => {
    const rows = extractFinanceFacts(
      input(
        { object: "dispute", id: "dp_1", currency: "usd", amount: 2500, charge: "ch_1", status: "warning_needs_response", created: 1_760_000_000 },
        { eventType: "charge.dispute.created" },
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "complete",
      objectType: "dispute",
      disputedAmountCents: 2500,
      chargeId: "ch_1",
      disputeStatus: "warning_needs_response",
    });
    // A dispute is NOT revenue: its amount rides the disputed column and the
    // revenue column stays null, so a projector cannot sum the two together.
    expect(rows[0]!.amountExcludingTaxCents).toBeNull();
  });

  it("reads a credit note's amount from `total`, not `amount`", () => {
    const rows = extractFinanceFacts(
      input({ object: "credit_note", id: "cn_1", currency: "usd", total: 700, amount: 999_999, charge: "ch_1" }),
    );
    expect(rows[0]).toMatchObject({ status: "complete", amountExcludingTaxCents: 700, creditNoteId: "cn_1" });
  });
});

describe("finance extract — incomplete is a reason, never a zero", () => {
  const only = (object: unknown, over: Partial<FinanceExtractInput> = {}) => {
    const rows = extractFinanceFacts(input(object, over));
    expect(rows).toHaveLength(1);
    return rows[0]!;
  };

  it("an unparsable object", () => {
    expect(only(null)).toMatchObject({ status: "incomplete", incompleteReason: "unparsable_object" });
  });

  it("an object type this version cannot read", () => {
    expect(only({ object: "tax_rate", id: "txr_1" })).toMatchObject({
      status: "incomplete",
      incompleteReason: "unknown_object_type",
      objectType: "tax_rate",
    });
  });

  it("a missing object id", () => {
    expect(only({ object: "invoice" })).toMatchObject({ status: "incomplete", incompleteReason: "missing_object_id" });
  });

  it("a non-USD currency is WITHHELD, never converted", () => {
    const row = only({ object: "payment_intent", id: "pi_1", currency: "eur", amount: 1000 });
    expect(row).toMatchObject({ status: "incomplete", incompleteReason: "non_usd_currency" });
    expect(row.amountExcludingTaxCents).toBeNull();
  });

  it("an invoice line with no `amount_excluding_tax` — never falling back to `amount`, which includes tax", () => {
    const rows = extractFinanceFacts(input(invoice({}, { amount_excluding_tax: undefined, amount: 2280 })));
    expect(rows[0]).toMatchObject({ status: "incomplete", incompleteReason: "missing_amount" });
    // The tax-inclusive number is NOT quietly promoted into the revenue column.
    expect(rows[0]!.amountExcludingTaxCents).toBeNull();
  });

  it("an invoice line with no service period keeps the amount but withholds the period", () => {
    const rows = extractFinanceFacts(input(invoice({}, { period: undefined })));
    expect(rows[0]).toMatchObject({
      status: "incomplete",
      incompleteReason: "missing_service_period",
      amountExcludingTaxCents: 1900,
    });
    expect(rows[0]!.servicePeriodStart).toBeNull();
  });

  it("an invoice with NO lines is a withheld period, not zero revenue", () => {
    const rows = extractFinanceFacts(input(invoice({ lines: { data: [] } })));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "incomplete", incompleteReason: "missing_service_period" });
    expect(rows[0]!.amountExcludingTaxCents).toBeNull();
  });

  it("C5's named legacy cases: a dispute with no charge link, and one with no status", () => {
    expect(only({ object: "dispute", id: "dp_1", currency: "usd", amount: 2500, status: "lost" })).toMatchObject({
      status: "incomplete",
      incompleteReason: "legacy_dispute_link_absent",
      disputedAmountCents: 2500,
    });
    expect(only({ object: "dispute", id: "dp_2", currency: "usd", amount: 2500, charge: "ch_1" })).toMatchObject({
      status: "incomplete",
      incompleteReason: "legacy_dispute_status_absent",
    });
  });

  it("ALWAYS yields at least one row, so the 90-day redaction is never delayed", () => {
    for (const object of [null, undefined, 42, "nope", [], {}, { object: "invoice" }, { object: "unknown", id: "x" }]) {
      expect(extractFinanceFacts(input(object)).length, JSON.stringify(object)).toBeGreaterThan(0);
    }
  });

  it("carries no content: only ids, amounts, periods and codes reach a row", () => {
    const rows = extractFinanceFacts(
      input(
        invoice({
          customer_email: "creator@example.test",
          customer_name: "A Creator",
          customer_address: { line1: "1 Test Street" },
          description: "a private note",
        }),
      ),
    );
    const serialised = JSON.stringify(rows);
    for (const leak of ["creator@example.test", "A Creator", "1 Test Street", "a private note"]) {
      expect(serialised, leak).not.toContain(leak);
    }
  });
});
