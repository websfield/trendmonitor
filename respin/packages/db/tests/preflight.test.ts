// Phase 10a closes G-15: the brain-content registry guard runs as an explicit
// startup preflight with a stable refusal, not at module load.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BRAIN_CONTENT_SCHEMAS, claim } from "../src/brain-content";
import { PREFLIGHT_CHECKS, PreflightRefusedError, runStartupPreflight } from "../src/preflight";

describe("runStartupPreflight", () => {
  it("passes on the shipped registry and names every check it ran", () => {
    expect(runStartupPreflight()).toEqual({ checks: PREFLIGHT_CHECKS, ok: true });
    expect(PREFLIGHT_CHECKS).toContain("brain_content_registry");
  });

  it("refuses a PLANTED bad kind with a stable code, carrying the guard's reason as the cause", () => {
    const planted = { ...BRAIN_CONTENT_SCHEMAS, planted: z.strictObject({ bad: z.string() }) };
    let caught: unknown;
    try {
      runStartupPreflight({ brainRegistry: planted });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PreflightRefusedError);
    const refusal = caught as PreflightRefusedError;
    expect(refusal.code).toBe("preflight_refused:brain_content_registry");
    expect(refusal.check).toBe("brain_content_registry");
    expect(refusal.message).toBe("preflight_refused:brain_content_registry");
    expect(String((refusal.cause as Error).message)).toContain("planted");
  });

  it("NON-VACUITY: the same planted registry with the leaf marked passes, so the refusal is about the shape", () => {
    const marked = { ...BRAIN_CONTENT_SCHEMAS, planted: z.strictObject({ fine: claim(z.string()) }) };
    expect(runStartupPreflight({ brainRegistry: marked }).ok).toBe(true);
  });

  it("has no environment escape hatch", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../src/preflight.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/process\.env/);
  });
});
