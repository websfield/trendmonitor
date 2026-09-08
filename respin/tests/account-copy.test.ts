// Phase 10b-1 Task 8 — the account page's copy describes only shipped behaviour.
// Each sentence is pinned to the code that makes it true, so a claim cannot
// outlive its implementation (plan 10b-1 "Done when").
import { describe, expect, it } from "vitest";
import {
  DELETION_GRACE_MS,
  JOURNAL_UNAVAILABLE_CODE,
  LIFECYCLE_REGISTRY,
  RETENTION_CLOCKS,
} from "@respin/db";
import * as copy from "../app/(product)/settings/account/copy";
import { DELETION_GRACE_DAYS } from "../app/(product)/settings/account/grace";

describe("account copy is pinned to shipped behaviour", () => {
  it("quotes the executor's grace period, not a typed number", () => {
    expect(DELETION_GRACE_DAYS).toBe(Math.round(DELETION_GRACE_MS / 86_400_000));
    expect(copy.WORKSPACE_DELETE_COPY).toContain(`${DELETION_GRACE_DAYS}-day`);
    expect(copy.IDENTITY_DELETE_COPY).toContain(`${DELETION_GRACE_DAYS} days`);
  });

  it("the seven-year and one-year figures are the registry's clocks", () => {
    const financial = LIFECYCLE_REGISTRY.filter((e) => e.retention === "financial_chain_seven_years");
    expect(financial.map((e) => e.table)).toEqual(expect.arrayContaining(["credit_ledger", "subscriptions", "pause_periods", "model_usage"]));
    expect(copy.RETAINED_COPY).toContain("seven years");
    expect(RETENTION_CLOCKS.deletion_receipt_one_year).toMatchObject({ kind: "scheduled", durationMs: 365 * 86_400_000 });
    expect(copy.RETAINED_COPY).toContain("one year");
  });

  it("names the journal refusal the request path actually returns", () => {
    expect(JOURNAL_UNAVAILABLE_CODE).toBe("journal_store_not_configured");
    expect(copy.JOURNAL_UNAVAILABLE_COPY).toMatch(/journal pending/);
  });

  it("promises no refund, no provider erasure, and no erasure of downloaded copies", () => {
    expect(copy.NO_REFUND_COPY).toMatch(/no refund/);
    expect(copy.RETAINED_COPY).toMatch(/Stripe/);
    expect(copy.RETAINED_COPY).toMatch(/downloaded/);
  });

  it("never claims something the code does not do", () => {
    const all = Object.values(copy).filter((v): v is string => typeof v === "string").join(" ");
    for (const forbidden of ["immediately erased", "permanently deleted at once", "guarantee", "instantly"]) {
      expect(all.toLowerCase()).not.toContain(forbidden);
    }
  });
});
