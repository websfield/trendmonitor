// Phase 10b-1 Task 6.3 / C5 — the pre-redaction Stripe finance extractor.
//
// `stripe_events.payload` is redacted 90 days after receipt. Everything 10b-2's
// revenue projector will need has to be lifted out of the payload BEFORE that,
// in the SAME transaction, or the fact is gone for good. This module is that
// lift, and it holds three rules that are easy to get wrong:
//
//   1. An unparseable or historically absent field becomes an INCOMPLETE row
//      with a reason, never a zero. C5: the incomplete row "is the permanent
//      authority for withholding that period".
//   2. Nothing here may delay the 90-day redaction. Extraction that produces
//      no usable fact still writes a row, so the redaction proceeds and the
//      withholding is recorded.
//   3. Content-free by construction. The projector reads ids, amounts,
//      currency, periods and states — never email, name, address, or payload.
//
// The extractor is PURE. It takes a parsed Stripe event object and returns
// rows; the transaction ordering that guarantees rule 1 lives in the receiver.
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { TxLike } from "./db-like";

/**
 * Bumped when the extraction RULES change, not when a caller changes. It is
 * stored on every row so 10b-2 can tell a row extracted under old rules from a
 * re-extraction, and so a rule fix does not silently reinterpret old rows.
 */
export const FINANCE_EXTRACTION_VERSION = 1;

/**
 * The object types this version knows how to read. A closed list (CLAUDE.md
 * Respin rule 7): an event carrying an unlisted object type produces an
 * `incomplete` row naming it, never a silent skip.
 */
export const EXTRACTABLE_OBJECT_TYPES = [
  "invoice",
  "payment_intent",
  "charge",
  "refund",
  "credit_note",
  "dispute",
] as const;
export type ExtractableObjectType = (typeof EXTRACTABLE_OBJECT_TYPES)[number];

/**
 * Why a row is incomplete. Closed, because these codes are what a 10b-2 margin
 * dashboard shows in place of a number, and a free-text reason there would be
 * an unreviewable label on a money surface.
 */
export type IncompleteReason =
  | "unknown_object_type"
  | "unparsable_object"
  | "missing_object_id"
  | "missing_amount"
  | "missing_currency"
  | "non_usd_currency"
  | "missing_service_period"
  | "missing_charge_link"
  | "legacy_dispute_link_absent"
  | "legacy_dispute_status_absent"
  | "missing_dispute_effective_at";

export type FinanceExtractRow = Readonly<{
  sourceStripeEventId: string;
  objectType: string;
  objectId: string;
  invoiceLineId: string | null;
  paymentIntentId: string | null;
  refundId: string | null;
  creditNoteId: string | null;
  disputeId: string | null;
  chargeId: string | null;
  workspaceKey: string | null;
  /**
   * The currency Stripe reported, or null when none was readable. NEVER a
   * constant: a row withheld for `non_usd_currency` that stored 'USD' anyway
   * stated a fact its own reason code contradicted.
   */
  currency: string | null;
  /** Excluding tax. SIGNED — a proration credit line is legitimately negative. */
  amountExcludingTaxCents: number | null;
  /**
   * Tax-INCLUSIVE, for the three object types (`charge`, `payment_intent`,
   * `refund`) whose Stripe amount has no tax-excluding sibling. Never populated
   * together with the column above; the CHECK enforces that.
   */
  amountIncludingTaxCents: number | null;
  disputedAmountCents: number | null;
  servicePeriodStart: Date | null;
  servicePeriodEnd: Date | null;
  disputeStatus: string | null;
  disputeEffectiveAt: Date | null;
  extractionVersion: number;
  status: "complete" | "incomplete";
  incompleteReason: IncompleteReason | null;
}>;

export type FinanceExtractInput = Readonly<{
  /** The Stripe event id — the row's provenance and half its uniqueness key. */
  eventId: string;
  /** The event's `type`, e.g. `invoice.paid`. Used only to pick the reader. */
  eventType: string;
  /** `event.data.object`, already JSON-parsed. Unknown shape by design. */
  object: unknown;
  /**
   * The pseudonymous financial-chain key for the workspace this event belongs
   * to, or null when the event is customer-attributed or unattributed. NEVER a
   * `workspaces.id` — that link is what erasure destroys.
   */
  workspaceKey: string | null;
}>;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Currency codes are ISO 4217 and stored UPPERCASE; Stripe reports them
 * lowercase (`"usd"`). Normalising here rather than at each call site keeps the
 * stored value comparable with the `= 'USD'` CHECK on a complete row, and keeps
 * a withheld row's currency (`"EUR"`) readable next to its reason code.
 */
const asCurrency = (value: unknown): string | null => asString(value)?.toUpperCase() ?? null;

/**
 * Stripe expresses a linked object either as an id string or as an expanded
 * object with an `id`. Reading only one of the two is the classic way to lose
 * a relation on an event that happened to be expanded.
 */
const asLinkId = (value: unknown): string | null => {
  const direct = asString(value);
  if (direct) return direct;
  const expanded = asRecord(value);
  return expanded ? asString(expanded.id) : null;
};

const asInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

/** Stripe timestamps are epoch SECONDS. Reading them as millis is a 1970 date. */
const asEpochSeconds = (value: unknown): Date | null => {
  const seconds = asInteger(value);
  if (seconds === null || seconds <= 0) return null;
  return new Date(seconds * 1000);
};

const incomplete = (
  input: FinanceExtractInput,
  objectType: string,
  objectId: string,
  reason: IncompleteReason,
  partial: Partial<FinanceExtractRow> = {},
): FinanceExtractRow => ({
  sourceStripeEventId: input.eventId,
  objectType,
  objectId,
  invoiceLineId: null,
  paymentIntentId: null,
  refundId: null,
  creditNoteId: null,
  disputeId: null,
  chargeId: null,
  workspaceKey: input.workspaceKey,
  currency: null,
  amountExcludingTaxCents: null,
  amountIncludingTaxCents: null,
  disputedAmountCents: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  disputeStatus: null,
  disputeEffectiveAt: null,
  extractionVersion: FINANCE_EXTRACTION_VERSION,
  ...partial,
  status: "incomplete",
  incompleteReason: reason,
});

const complete = (
  input: FinanceExtractInput,
  objectType: string,
  objectId: string,
  fields: Partial<FinanceExtractRow>,
): FinanceExtractRow => ({
  sourceStripeEventId: input.eventId,
  objectType,
  objectId,
  invoiceLineId: null,
  paymentIntentId: null,
  refundId: null,
  creditNoteId: null,
  disputeId: null,
  chargeId: null,
  workspaceKey: input.workspaceKey,
  currency: null,
  amountExcludingTaxCents: null,
  amountIncludingTaxCents: null,
  disputedAmountCents: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  disputeStatus: null,
  disputeEffectiveAt: null,
  extractionVersion: FINANCE_EXTRACTION_VERSION,
  ...fields,
  status: "complete",
  incompleteReason: null,
});

/** The object type an event names, from its own `object` field. */
function objectTypeOf(object: Readonly<Record<string, unknown>>): string | null {
  return asString(object.object);
}

/**
 * One event in, zero or more rows out. An invoice fans out to one row per line
 * (each with its own service period); every other type yields exactly one row.
 *
 * Returning MORE than one row is why the unique key is (event, object id)
 * rather than (event): two invoice lines are two distinct economic facts.
 */
export function extractFinanceFacts(input: FinanceExtractInput): readonly FinanceExtractRow[] {
  const object = asRecord(input.object);
  if (!object) {
    return [incomplete(input, input.eventType, input.eventId, "unparsable_object")];
  }
  const objectType = objectTypeOf(object);
  const objectId = asString(object.id);
  if (!objectId) {
    return [incomplete(input, objectType ?? input.eventType, input.eventId, "missing_object_id")];
  }
  if (!objectType || !(EXTRACTABLE_OBJECT_TYPES as readonly string[]).includes(objectType)) {
    return [incomplete(input, objectType ?? input.eventType, objectId, "unknown_object_type")];
  }

  const currency = asCurrency(object.currency);
  // A dispute's currency lives on the dispute itself; an invoice's on the
  // invoice. Either way an absent or non-USD currency is a withheld period,
  // never a converted number.
  if (objectType !== "invoice" && currency === null) {
    return [incomplete(input, objectType, objectId, "missing_currency")];
  }
  if (currency !== null && currency.toLowerCase() !== "usd") {
    // The withheld row stores the currency it actually saw, so the reason code
    // and the stored fact agree.
    return [incomplete(input, objectType, objectId, "non_usd_currency", { currency })];
  }

  switch (objectType) {
    case "invoice":
      return extractInvoice(input, object, objectId);
    // `payment_intent.amount`, `charge.amount` and `refund.amount` are all
    // tax-INCLUSIVE and Stripe exposes no tax-excluding sibling on these
    // objects, so they book to `amountIncludingTaxCents`. Putting them in the
    // excluding-tax column was T69-R14: it mixed tax into revenue in the very
    // module that refuses that substitution for invoice lines and credit notes.
    case "payment_intent":
      return [
        extractSimpleAmount(input, object, objectType, objectId, { paymentIntentId: objectId }, undefined, "including"),
      ];
    case "charge":
      return [
        extractSimpleAmount(input, object, objectType, objectId, {
          chargeId: objectId,
          paymentIntentId: asLinkId(object.payment_intent),
        }, undefined, "including"),
      ];
    case "refund":
      return [
        extractSimpleAmount(input, object, objectType, objectId, {
          refundId: objectId,
          chargeId: asLinkId(object.charge),
          paymentIntentId: asLinkId(object.payment_intent),
        }, undefined, "including"),
      ];
    case "credit_note":
      return [
        extractSimpleAmount(input, object, objectType, objectId, {
          creditNoteId: objectId,
          chargeId: asLinkId(object.charge),
          // `total_excluding_tax`, NOT `total`: the column this lands in is
          // `amount_excluding_tax_cents`, and Stripe's `total` INCLUDES tax.
          // The invoice-line branch refuses exactly this substitution ("falling
          // back to it silently would mix tax into revenue"); a credit note is
          // the same quantity on the other side of the ledger. Absent -> an
          // `incomplete` row with a reason, never a tax-inflated number.
        }, asInteger(object.total_excluding_tax), "excluding"),
      ];
    case "dispute":
      return [extractDispute(input, object, objectId)];
    default:
      // Unreachable: the membership test above is over the same closed list.
      // Present because an added type must fail HERE, loudly, rather than
      // fall out of the switch as an empty extraction that redacts a payload
      // and books nothing.
      return [incomplete(input, objectType, objectId, "unknown_object_type")];
  }
}

function extractInvoice(
  input: FinanceExtractInput,
  invoice: Readonly<Record<string, unknown>>,
  invoiceId: string,
): readonly FinanceExtractRow[] {
  const linesContainer = asRecord(invoice.lines);
  const lines = linesContainer && Array.isArray(linesContainer.data) ? linesContainer.data : null;
  if (!lines || lines.length === 0) {
    // No lines is not zero revenue — it is an invoice we cannot attribute to a
    // service period, which is exactly the withholding case.
    return [incomplete(input, "invoice", invoiceId, "missing_service_period", { invoiceLineId: null })];
  }
  return lines.map((rawLine, index) => {
    const line = asRecord(rawLine);
    if (!line) {
      return incomplete(input, "invoice", `${invoiceId}:${index}`, "unparsable_object");
    }
    const lineId = asString(line.id) ?? `${invoiceId}:${index}`;
    const rowId = lineId;
    const currency = asCurrency(line.currency) ?? asCurrency(invoice.currency);
    if (currency === null) {
      return incomplete(input, "invoice", rowId, "missing_currency", { invoiceLineId: lineId });
    }
    if (currency.toLowerCase() !== "usd") {
      return incomplete(input, "invoice", rowId, "non_usd_currency", { invoiceLineId: lineId, currency });
    }
    // `amount_excluding_tax` is the field C5 names. Older API versions emit
    // only `amount`; falling back to it silently would mix tax into revenue,
    // so its absence is recorded rather than papered over.
    const amount = asInteger(line.amount_excluding_tax);
    if (amount === null) {
      return incomplete(input, "invoice", rowId, "missing_amount", { invoiceLineId: lineId, currency });
    }
    const period = asRecord(line.period);
    const start = period ? asEpochSeconds(period.start) : null;
    const end = period ? asEpochSeconds(period.end) : null;
    if (start === null || end === null) {
      return incomplete(input, "invoice", rowId, "missing_service_period", {
        invoiceLineId: lineId,
        currency,
        amountExcludingTaxCents: amount,
      });
    }
    return complete(input, "invoice", rowId, {
      invoiceLineId: lineId,
      currency,
      paymentIntentId: asLinkId(invoice.payment_intent),
      chargeId: asLinkId(invoice.charge),
      // Signed: a proration credit on a mid-cycle downgrade is negative here.
      amountExcludingTaxCents: amount,
      servicePeriodStart: start,
      servicePeriodEnd: end,
    });
  });
}

function extractSimpleAmount(
  input: FinanceExtractInput,
  object: Readonly<Record<string, unknown>>,
  objectType: string,
  objectId: string,
  links: Partial<FinanceExtractRow>,
  amountOverride: number | null | undefined,
  /**
   * Which column the amount is TRUE of. Required and un-defaulted on purpose: a
   * default here would let a future object type inherit "excluding tax" by
   * omission, which is the exact silent mislabelling T69-R14 recorded.
   */
  taxBasis: "excluding" | "including",
): FinanceExtractRow {
  const currency = asCurrency(object.currency);
  const amount = amountOverride === undefined ? asInteger(object.amount) : amountOverride;
  if (amount === null) {
    return incomplete(input, objectType, objectId, "missing_amount", { ...links, currency });
  }
  return complete(input, objectType, objectId, {
    ...links,
    currency,
    ...(taxBasis === "excluding"
      ? { amountExcludingTaxCents: amount }
      : { amountIncludingTaxCents: amount }),
  });
}

function extractDispute(
  input: FinanceExtractInput,
  dispute: Readonly<Record<string, unknown>>,
  disputeId: string,
): FinanceExtractRow {
  const amount = asInteger(dispute.amount);
  const chargeId = asLinkId(dispute.charge);
  const status = asString(dispute.status);
  const links: Partial<FinanceExtractRow> = {
    disputeId,
    chargeId,
    currency: asCurrency(dispute.currency),
    paymentIntentId: asLinkId(dispute.payment_intent),
  };
  if (amount === null) {
    return incomplete(input, "dispute", disputeId, "missing_amount", links);
  }
  // C5 names the legacy dispute link and status explicitly: a historically
  // absent one becomes an incomplete row, because 10b-2 must withhold that
  // period rather than book a disputed amount it cannot attribute.
  if (chargeId === null) {
    return incomplete(input, "dispute", disputeId, "legacy_dispute_link_absent", {
      ...links,
      disputedAmountCents: amount,
    });
  }
  if (status === null) {
    return incomplete(input, "dispute", disputeId, "legacy_dispute_status_absent", {
      ...links,
      disputedAmountCents: amount,
    });
  }
  // C5 names the dispute's EFFECTIVE TIMESTAMP among the facts that must
  // survive. Every other absent field on this path becomes `incomplete`; this
  // one silently produced a `complete` row with a null effective time, which
  // tells 10b-2 the timestamp is trustworthy when it was never read.
  const effectiveAt = asEpochSeconds(dispute.created);
  if (effectiveAt === null) {
    return incomplete(input, "dispute", disputeId, "missing_dispute_effective_at", {
      ...links,
      disputedAmountCents: amount,
      disputeStatus: status,
    });
  }
  return complete(input, "dispute", disputeId, {
    ...links,
    disputedAmountCents: amount,
    disputeStatus: status,
    disputeEffectiveAt: effectiveAt,
  });
}

/**
 * Persist extracted rows. Idempotent on (source event, object id): re-running
 * the receiver over an already-extracted event changes nothing, which is what
 * lets the receiver resume after a partial failure without double-booking.
 *
 * The id is minted HERE. `stripe_finance_extracts.id` carries drizzle's
 * `$defaultFn`, which is CLIENT-side — it runs for `db.insert()` and not for
 * raw SQL, so a raw insert without it writes NULL and the NOT NULL constraint
 * refuses the whole sweep. That failure is silent from the outside: the
 * receiver catches per table, so the payload simply never redacts.
 *
 * ON CONFLICT DO NOTHING rather than DO UPDATE: the first extraction under a
 * given version is the authority, and quietly rewriting a stored finance fact
 * from a later read of the same event would make the row unreviewable.
 */
export async function persistFinanceExtractsInTx(
  tx: TxLike,
  rows: readonly FinanceExtractRow[],
): Promise<number> {
  let written = 0;
  for (const row of rows) {
    const result = (await tx.execute(sql`
      INSERT INTO "stripe_finance_extracts" (
        id,
        source_stripe_event_id, object_type, object_id, invoice_line_id, payment_intent_id,
        refund_id, credit_note_id, dispute_id, charge_id, workspace_key, currency,
        amount_excluding_tax_cents, amount_including_tax_cents, disputed_amount_cents,
        service_period_start, service_period_end,
        dispute_status, dispute_effective_at, extraction_version, status, incomplete_reason
      ) VALUES (
        ${uuidv7()},
        ${row.sourceStripeEventId}, ${row.objectType}, ${row.objectId}, ${row.invoiceLineId},
        ${row.paymentIntentId}, ${row.refundId}, ${row.creditNoteId}, ${row.disputeId},
        ${row.chargeId}, ${row.workspaceKey}, ${row.currency},
        ${row.amountExcludingTaxCents}, ${row.amountIncludingTaxCents}, ${row.disputedAmountCents},
        ${row.servicePeriodStart}, ${row.servicePeriodEnd},
        ${row.disputeStatus}, ${row.disputeEffectiveAt},
        ${row.extractionVersion}, ${row.status}, ${row.incompleteReason}
      )
      ON CONFLICT (source_stripe_event_id, object_id) DO NOTHING
    `)) as unknown as { rowCount?: number; affectedRows?: number };
    written += Number(result.rowCount ?? result.affectedRows ?? 0);
  }
  return written;
}
