import * as dbSurface from "@respin/db";
import { describe, expect, it } from "vitest";

describe("reconciliation reachability", () => {
  it("does not publish a cost-delta mutation before a real integration owns it", () => {
    expect(dbSurface).not.toHaveProperty("applyReconciliationDelta");
  });
});
