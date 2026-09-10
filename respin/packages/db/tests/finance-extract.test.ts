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

  it("reads a credit note's amount from `total_excluding_tax` — never `total`, which includes tax", () => {
    const rows = extractFinanceFacts(
      input({
        object: "credit_note", id: "cn_1", currency: "usd",
        total_excluding_tax: 700, total: 770, amount: 999_999, charge: "ch_1",
      }),
    );
    expect(rows[0]).toMatchObject({ status: "complete", amountExcludingTaxCents: 700, creditNoteId: "cn_1" });
  });

  it("refuses a credit note with no `total_excluding_tax` rather than mixing tax into revenue", () => {
    const rows = extractFinanceFacts(
      input({ object: "credit_note", id: "cn_2", currency: "usd", total: 770, charge: "ch_1" }),
    );
    // The tax-inclusive `total` is RIGHT THERE and must not be used.
    expect(rows[0]).toMatchObject({ status: "incomplete", amountExcludingTaxCents: null });
    expect(rows[0]!.incompleteReason).toBe("missing_amount");
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

// ---------------------------------------------------------------------------
// Round-3 regression pins. Each of these red-drives a defect that shipped and
// was invisible to the 16 tests above, which is the point worth keeping: the
// suite was green while a plan downgrade could wedge the receiver forever.
// ---------------------------------------------------------------------------
describe("finance extract — signed amounts and the tax basis", () => {
  it("BLOCK: a proration CREDIT line is a complete, NEGATIVE fact, not a refusal", () => {
    // A mid-cycle plan downgrade. Stripe emits the unused-time credit as a
    // negative `amount_excluding_tax`. The column CHECK used to be `>= 0`, so
    // this row raised 23514, rolled back the whole redaction batch, and the
    // next tick re-claimed the identical `ORDER BY ctid LIMIT 500` set and
    // failed identically — forever, with the backlog alarm reading null.
    const rows = extractFinanceFacts(
      input(
        invoice({}, { id: "il_proration", amount_excluding_tax: -1900 }),
        { eventType: "invoice.created" },
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "complete",
      incompleteReason: null,
      amountExcludingTaxCents: -1900,
      invoiceLineId: "il_proration",
    });
  });

  it("T69-R14: charge / payment_intent / refund amounts are tax-INCLUSIVE and never book to the excluding-tax column", () => {
    // Stripe exposes no tax-excluding sibling on these three objects. Booking
    // `amount` into `amount_excluding_tax_cents` mixed tax into revenue in the
    // one module that refuses exactly that substitution for invoice lines and
    // credit notes. Nothing asserted the column, so the defect was invisible.
    for (const object of [
      { object: "charge", id: "ch_1", currency: "usd", amount: 2280 },
      { object: "payment_intent", id: "pi_9", currency: "usd", amount: 2280 },
      { object: "refund", id: "re_1", currency: "usd", amount: 2280, charge: "ch_1" },
    ]) {
      const row = extractFinanceFacts(input(object))[0]!;
      expect(row.status).toBe("complete");
      expect(row.amountIncludingTaxCents).toBe(2280);
      expect(row.amountExcludingTaxCents).toBeNull();
    }
  });

  it("an invoice line and a credit note still book to the EXCLUDING-tax column", () => {
    expect(extractFinanceFacts(input(invoice()))[0]).toMatchObject({
      amountExcludingTaxCents: 1900,
      amountIncludingTaxCents: null,
    });
    expect(
      extractFinanceFacts(
        input({ object: "credit_note", id: "cn_3", currency: "usd", total_excluding_tax: 700, total: 770, charge: "ch_1" }),
      )[0],
    ).toMatchObject({ amountExcludingTaxCents: 700, amountIncludingTaxCents: null });
  });

  it("no row ever carries BOTH amount columns — the CHECK that stops a projector double-booking", () => {
    const every = [
      ...extractFinanceFacts(input(invoice())),
      ...extractFinanceFacts(input({ object: "charge", id: "ch_2", currency: "usd", amount: 10 })),
      ...extractFinanceFacts(input({ object: "credit_note", id: "cn_4", currency: "usd", total_excluding_tax: 5, charge: "ch_1" })),
      ...extractFinanceFacts(input({ object: "dispute", id: "dp_9", currency: "usd", amount: 1, charge: "ch_1", status: "lost", created: 1_760_000_000 })),
    ];
    expect(every.length).toBeGreaterThan(0);
    for (const row of every) {
      expect(row.amountExcludingTaxCents === null || row.amountIncludingTaxCents === null).toBe(true);
    }
  });
});

describe("finance extract — a withheld row states the currency it actually saw", () => {
  it("a non-USD refusal stores the OBSERVED currency, not the literal 'USD'", () => {
    // The row is C5's permanent authority for withholding that period. Storing
    // 'USD' on it made the row contradict its own `non_usd_currency` reason.
    const row = extractFinanceFacts(input({ object: "payment_intent", id: "pi_eur", currency: "eur", amount: 1000 }))[0]!;
    expect(row).toMatchObject({
      status: "incomplete",
      incompleteReason: "non_usd_currency",
      currency: "EUR",
      amountExcludingTaxCents: null,
      amountIncludingTaxCents: null,
    });
  });

  it("a complete row carries USD, and a currency that was never readable stays null", () => {
    expect(extractFinanceFacts(input(invoice()))[0]!.currency).toBe("USD");
    const row = extractFinanceFacts(input({ object: "charge", id: "ch_nocur", amount: 10 }))[0]!;
    expect(row).toMatchObject({ status: "incomplete", incompleteReason: "missing_currency", currency: null });
  });
});

describe("finance extract — the dispute effective timestamp", () => {
  it("a dispute with no `created` is INCOMPLETE, not a complete row with a null timestamp", () => {
    // C5 names the dispute's effective timestamp among the facts that must
    // survive. Every other absent field on this path became `incomplete`; this
    // one produced `complete`, telling 10b-2 the timestamp was trustworthy.
    const row = extractFinanceFacts(
      input({ object: "dispute", id: "dp_nocreated", currency: "usd", amount: 2500, charge: "ch_1", status: "lost" }),
    )[0]!;
    expect(row).toMatchObject({
      status: "incomplete",
      incompleteReason: "missing_dispute_effective_at",
      disputedAmountCents: 2500,
      disputeStatus: "lost",
    });
    expect(row.disputeEffectiveAt).toBeNull();
  });

  it("a dispute WITH `created` is complete and carries the timestamp", () => {
    const row = extractFinanceFacts(
      input({ object: "dispute", id: "dp_ok", currency: "usd", amount: 2500, charge: "ch_1", status: "lost", created: 1_760_000_000 }),
    )[0]!;
    expect(row.status).toBe("complete");
    expect(row.disputeEffectiveAt).toEqual(new Date(1_760_000_000 * 1000));
  });
});
