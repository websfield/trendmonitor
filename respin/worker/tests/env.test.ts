import { describe, expect, it } from "vitest";

import { envInteger, requiredEnv } from "../env";
import { resolveConcurrencyLimit, resolveQueueLimit } from "../pool";

describe("worker environment parsing", () => {
  it("falls back when unset or blank and refuses non-integers", () => {
    expect(envInteger({}, "X", 7)).toBe(7);
    expect(envInteger({ X: "  " }, "X", 7)).toBe(7);
    expect(envInteger({ X: "12" }, "X", 7)).toBe(12);
    expect(() => envInteger({ X: "1.5" }, "X", 7)).toThrow(/safe integer/);
    expect(() => envInteger({ X: "abc" }, "X", 7)).toThrow(/safe integer/);
    expect(() => envInteger({ X: "-1" }, "X", 7)).toThrow(/at least 1/);
  });

  it("agrees with the code floors: 0 is refused where code refuses it and accepted where code accepts it", () => {
    // Concurrency: code floor 1 (`resolveConcurrencyLimit` throws on 0) — env refuses 0 too.
    expect(() => resolveConcurrencyLimit(0)).toThrow();
    expect(() => envInteger({ X: "0" }, "X", 4)).toThrow(/at least 1/);
    // Local wait queue: code floor 0 (`resolveQueueLimit(0)` = no waiting) — env accepts 0.
    expect(resolveQueueLimit(0)).toBe(0);
    expect(envInteger({ X: "0" }, "X", 16, { minimum: 0 })).toBe(0);
    expect(resolveQueueLimit(envInteger({ X: "0" }, "X", 16, { minimum: 0 }))).toBe(0);
    expect(() => envInteger({ X: "-1" }, "X", 16, { minimum: 0 })).toThrow(/at least 0/);
  });

  it("requires a non-blank value for required variables", () => {
    expect(requiredEnv({ DATABASE_URL: " postgres://x " }, "DATABASE_URL")).toBe("postgres://x");
    expect(() => requiredEnv({}, "DATABASE_URL")).toThrow(/DATABASE_URL is required/);
    expect(() => requiredEnv({ DATABASE_URL: "  " }, "DATABASE_URL")).toThrow(/is required/);
  });
});
