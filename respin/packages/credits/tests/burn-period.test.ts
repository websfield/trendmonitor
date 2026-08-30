import { describe, expect, it } from "vitest";
import { burnPeriodStart } from "../src/burn-period";

describe("burnPeriodStart (R7): the same authority billing uses, never a bare calendar month", () => {
  it("a live subscription's own current_period_start is the anchor", () => {
    const anchor = new Date("2026-06-15T00:00:00Z");
    const result = burnPeriodStart(
      { currentPeriodStart: anchor },
      new Date("2026-07-01T00:00:00Z")
    );
    expect(result).toBe(anchor);
  });

  it("no subscription at all (Free / never subscribed) falls back to the UTC calendar month", () => {
    const result = burnPeriodStart(undefined, new Date("2026-07-15T12:00:00Z"));
    expect(result.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("a subscription row with a null current_period_start (never activated) also falls back", () => {
    const result = burnPeriodStart(
      { currentPeriodStart: null },
      new Date("2026-07-15T12:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
