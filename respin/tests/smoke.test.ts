import { describe, expect, it } from "vitest";

describe("workspace smoke", () => {
  it("runs tests under respin's own vitest config", () => {
    expect(1 + 1).toBe(2);
  });
});
