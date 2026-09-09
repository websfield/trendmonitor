// Phase 10b-1 Task 8 — the account page's copy describes only shipped behaviour.
// Each sentence is pinned to the code that makes it true, so a claim cannot
// outlive its implementation (plan 10b-1 "Done when").
import { describe, expect, it } from "vitest";
import {
  BACKUP_MAX_RETENTION_DAYS,
  DELETION_GRACE_MS,
  EXTERNAL_COPIES,
  JOURNAL_UNAVAILABLE_CODE,
  LIFECYCLE_REGISTRY,
  RETENTION_CLOCKS,
} from "@respin/db";
import * as copy from "../app/(product)/settings/account/copy";
import { ACCOUNT_ERROR_CODES, ACCOUNT_ERROR_COPY, accountErrorCodeOf } from "../app/(product)/settings/account/refusal-code";
import { BillingContactProviderError, BillingRoleError, NoStripeCustomerError } from "@respin/credits/app-server";
import {
  COHORT_RETENTION_YEARS,
  DELETION_GRACE_DAYS,
  LAST_CAPABLE_COPY_DAY,
} from "../app/(product)/settings/account/grace";

describe("account copy is pinned to shipped behaviour", () => {
  it("quotes the executor's grace period, not a typed number", () => {
    expect(DELETION_GRACE_DAYS).toBe(Math.round(DELETION_GRACE_MS / 86_400_000));
    expect(copy.WORKSPACE_DELETE_COPY).toContain(`${DELETION_GRACE_DAYS}-day`);
    expect(copy.IDENTITY_DELETE_COPY).toContain(`${DELETION_GRACE_DAYS} days`);
  });

  it("the seven-year and one-year figures are the registry's clocks — and 'at least' while the seven-year receiver is disabled", () => {
    const financial = LIFECYCLE_REGISTRY.filter((e) => e.retention === "financial_chain_seven_years");
    expect(financial.map((e) => e.table)).toEqual(expect.arrayContaining(["credit_ledger", "subscriptions", "pause_periods", "model_usage"]));
    // R-122: the destructive receiver is disabled, so retention is unbounded
    // today. The sentence must say "at least" for exactly as long as the clock
    // is not `scheduled`; enabling the receiver reddens this until the copy
    // changes (compliance gate, independent round 2; T69-R11).
    expect(RETENTION_CLOCKS.financial_chain_seven_years.kind).toBe("financial_chain");
    expect(copy.RETAINED_COPY).toContain("for at least seven years");
    expect(RETENTION_CLOCKS.deletion_receipt_one_year).toMatchObject({ kind: "scheduled", durationMs: 365 * 86_400_000 });
    expect(copy.RETAINED_COPY).toContain("one year");
  });

  it("names the journal refusal the request path actually returns", () => {
    expect(JOURNAL_UNAVAILABLE_CODE).toBe("journal_store_not_configured");
    expect(copy.JOURNAL_UNAVAILABLE_COPY).toMatch(/journal pending/);
  });

  it("promises no refund, and NAMES EVERY external holder in the registry", () => {
    expect(copy.NO_REFUND_COPY).toMatch(/no refund/);
    // THE POSITIVE POPULATION. The previous version asserted two holders by
    // name (Stripe, downloaded copies) and was satisfied by a sentence that
    // omitted the model provider, the mail provider and database backups —
    // while presenting itself as a CLOSED "what survives" list. Asserting the
    // whole registry means a new processor cannot be added without this page
    // changing in the same commit.
    expect(EXTERNAL_COPIES.length).toBeGreaterThan(0);
    for (const external of EXTERNAL_COPIES) {
      expect(copy.RETAINED_COPY, `RETAINED_COPY omits "${external.holder}"`).toContain(external.holder);
    }
  });

  it("states the day-28 backup window rather than implying erasure ends at grace", () => {
    // A creator reading "erases it after a 7-day grace period" inferred day 7,
    // while an encrypted backup could hold their data for 21 more days. That
    // window is why C4's deadline is day 28.
    expect(LAST_CAPABLE_COPY_DAY).toBe(DELETION_GRACE_DAYS + BACKUP_MAX_RETENTION_DAYS);
    expect(copy.RETAINED_COPY).toContain(`day ${LAST_CAPABLE_COPY_DAY}`);
  });

  it("gives the cohort-count class a period, taken from its registry clock", () => {
    // The class was named with no clock at all, so it could be re-clocked
    // without the page noticing.
    expect(COHORT_RETENTION_YEARS).toBe(
      Math.round(RETENTION_CLOCKS.cohort_two_years.durationMs / (365 * 86_400_000))
    );
    expect(copy.RETAINED_COPY).toContain(`cohort counts for ${COHORT_RETENTION_YEARS} years`);
  });

  it("never claims something the code does not do", () => {
    const all = Object.values(copy).filter((v): v is string => typeof v === "string").join(" ");
    for (const forbidden of ["immediately erased", "permanently deleted at once", "guarantee", "instantly"]) {
      expect(all.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("account refusal codes reach a sentence", () => {
  it("EVERY code has copy, and the lifecycle's message-coded refusals map to their own sentence (last_owner used to land on 'unknown')", () => {
    for (const code of ACCOUNT_ERROR_CODES) {
      expect(ACCOUNT_ERROR_COPY[code], code).toMatch(/\S/);
    }
    expect(accountErrorCodeOf(new Error("deletion_refused:last_owner"))).toBe("last_owner");
    expect(accountErrorCodeOf(new Error("deletion_refused:billing_contact_handover_required"))).toBe("billing_contact_handover_required");
    expect(accountErrorCodeOf(new Error("deletion_refused:billing_contact_unknown"))).toBe("billing_contact_unknown");
    expect(accountErrorCodeOf(new Error("deletion_refused:requests_disabled:identity"))).toBe("requests_closed");
    expect(accountErrorCodeOf(new Error("deletion_refused:typed_name_mismatch"))).toBe("typed_name");
    expect(accountErrorCodeOf(new Error("deletion_refused:journal_store_not_configured"))).toBe("journal_unavailable");
    expect(accountErrorCodeOf(new Error("deletion_refused:erasure_started"))).toBe("not_cancellable");
    expect(accountErrorCodeOf(new BillingRoleError("editor"))).toBe("not_owner");
    expect(accountErrorCodeOf(new NoStripeCustomerError("x"))).toBe("no_customer");
    expect(accountErrorCodeOf(new BillingContactProviderError("provider:boom"))).toBe("provider_refused");
    expect(accountErrorCodeOf(new Error("something else"))).toBe("unknown");
    expect(accountErrorCodeOf(null)).toBe("unknown");
  });

  it("the billing-contact and request-flag sentences describe shipped behaviour", () => {
    // The identity sentence names BOTH release rules the lifecycle asserts
    // together (`assertWorkspacesReleasable`): last owner, billing contact.
    expect(copy.IDENTITY_DELETE_COPY).toMatch(/last owner/);
    expect(copy.IDENTITY_DELETE_COPY).toMatch(/billing contact/);
    // The handover promise is the provider-first order `acceptBillingContact` keeps.
    expect(copy.BILLING_CONTACT_COPY).toMatch(/before anything changes here/);
    expect(copy.REQUESTS_CLOSED_COPY).toMatch(/can still be cancelled/);
    // The unknown-contact rule holds EVERY member; the page must not narrow it
    // to owners (tenancy and compliance gates, independent round 2).
    expect(copy.BILLING_CONTACT_UNKNOWN_COPY).toContain("no member of this workspace");
    expect(copy.BILLING_CONTACT_UNKNOWN_COPY).not.toContain("no owner");
    expect(copy.IDENTITY_DELETE_COPY).toMatch(/any workspace you belong to/);
    // The accepted notice lives in copy.ts so the forbidden-claims scan sees it.
    expect(copy.BILLING_CONTACT_ACCEPTED_NOTICE).toMatch(/billing contact/);
  });
});
