import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunSlotPool } from "../src/client";

describe("database pool error logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs only a stable class and driver code, never the error message", async () => {
    const pool = createRunSlotPool("postgres://unused:unused@127.0.0.1:1/unused", 1);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(
      new Error("SECRET CREATOR CONTENT FROM A BOUND PARAMETER"),
      { code: "08006" }
    );

    pool.emit("error", error);

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("class=Error code=08006")
    );
    expect(logged.mock.calls.flat().join(" ")).not.toContain("SECRET CREATOR CONTENT");
    await pool.end();
  });
});
