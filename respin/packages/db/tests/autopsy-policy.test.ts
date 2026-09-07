// The one wall-clock family (slice 8 fix pass, 2026-09-03 — billing gate
// round 1 CHANGE 2 and the code review's qualification): the cache-claim lease,
// the per-stage vendor deadline ceiling, and the pg-boss job expiry must agree,
// or a HEALTHY attempt is finalized as four unknown calls while it is still
// calling the vendor and the next tick pays a second time (the case R-93 rules
// out). These cases pin the derivation and the refusal, not the value.
import { describe, expect, it } from "vitest";
import {
  AUTOPSY_ATTEMPT_WALL_CLOCK_CODE_CEILING_MS,
  AUTOPSY_CLAIM_LEASE_MS,
  AUTOPSY_LEASE_NON_VENDOR_MARGIN_MS,
  AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS,
  AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
  AutopsyDeadlineOutrunsLeaseError,
  assertAutopsyDeadlineWithinLease,
} from "../src/autopsy-policy";

describe("the autopsy wall-clock family is one constant, derived, never three literals", () => {
  it("derives the lease from the ceiling and the stage deadline from the lease minus the margin", () => {
    expect(AUTOPSY_CLAIM_LEASE_MS).toBe(AUTOPSY_ATTEMPT_WALL_CLOCK_CODE_CEILING_MS);
    expect(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS).toBe(
      Math.floor((AUTOPSY_CLAIM_LEASE_MS - AUTOPSY_LEASE_NON_VENDOR_MARGIN_MS) / AUTOPSY_VENDOR_CALLS_PER_ATTEMPT),
    );
    // The property the family exists for: four stages at the ceiling plus the
    // margin never outrun the lease.
    expect(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS * AUTOPSY_VENDOR_CALLS_PER_ATTEMPT + AUTOPSY_LEASE_NON_VENDOR_MARGIN_MS)
      .toBeLessThanOrEqual(AUTOPSY_CLAIM_LEASE_MS);
  });

  it("accepts a deadline at the ceiling and refuses one millisecond above it, by name", () => {
    expect(() => assertAutopsyDeadlineWithinLease(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS)).not.toThrow();
    expect(() => assertAutopsyDeadlineWithinLease(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS + 1))
      .toThrow(AutopsyDeadlineOutrunsLeaseError);
    // The seed default (40 s per stage) sits inside the ceiling — a fresh
    // install must not refuse its own configuration.
    expect(() => assertAutopsyDeadlineWithinLease(40_000)).not.toThrow();
  });

  it("refuses a deadline that is not a positive safe integer before comparing it", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertAutopsyDeadlineWithinLease(bad), String(bad)).toThrow(/positive safe integer/);
    }
  });
});
