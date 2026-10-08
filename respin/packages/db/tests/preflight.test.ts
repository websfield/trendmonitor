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

  // AUDIT P1-A2: a production server refuses to start without an absolute
  // https: BETTER_AUTH_URL, because Better Auth otherwise derives the base URL
  // of the links it mails from the request's Host header.
  const refusalFor = (authBaseUrl: { nodeEnv: string | undefined; betterAuthUrl: string | undefined }) => {
    try {
      runStartupPreflight({ authBaseUrl });
    } catch (error) {
      return error;
    }
    return null;
  };

  it("P1-A2: production with BETTER_AUTH_URL UNSET refuses to start, naming the variable and the fix", () => {
    const refusal = refusalFor({ nodeEnv: "production", betterAuthUrl: undefined });
    expect(refusal).toBeInstanceOf(PreflightRefusedError);
    expect((refusal as PreflightRefusedError).code).toBe("preflight_refused:auth_base_url");
    const why = String(((refusal as PreflightRefusedError).cause as Error).message);
    expect(why).toContain("BETTER_AUTH_URL");
    expect(why).toContain("https://");
    expect(refusalFor({ nodeEnv: "production", betterAuthUrl: "   " })).toBeInstanceOf(PreflightRefusedError);
  });

  it("P1-A2: production with an http:// or a relative BETTER_AUTH_URL refuses to start", () => {
    for (const betterAuthUrl of ["http://app.example.com", "app.example.com", "/api/auth", "not a url"]) {
      const refusal = refusalFor({ nodeEnv: "production", betterAuthUrl });
      expect(refusal, betterAuthUrl).toBeInstanceOf(PreflightRefusedError);
      expect((refusal as PreflightRefusedError).check).toBe("auth_base_url");
    }
  });

  it("P1-A2 / gate L6: credentials, a query or a fragment in BETTER_AUTH_URL refuse to start", () => {
    for (const betterAuthUrl of [
      "https://user:pass@app.example.com",
      "https://user@app.example.com",
      "https://:pass@app.example.com",
      "https://app.example.com/?next=/studio",
      "https://app.example.com/?",
      "https://app.example.com/#fragment",
      "https://app.example.com#",
    ]) {
      const refusal = refusalFor({ nodeEnv: "production", betterAuthUrl });
      expect(refusal, betterAuthUrl).toBeInstanceOf(PreflightRefusedError);
      expect((refusal as PreflightRefusedError).check).toBe("auth_base_url");
    }
    // ...while a bare address, with or without a path and a port, passes.
    for (const betterAuthUrl of ["https://app.example.com", "https://app.example.com/", "https://app.example.com:8443/respin"]) {
      expect(refusalFor({ nodeEnv: "production", betterAuthUrl }), betterAuthUrl).toBeNull();
    }
  });

  it("P1-A2 NON-VACUITY: an https URL passes in production, and development needs none", () => {
    expect(refusalFor({ nodeEnv: "production", betterAuthUrl: "https://app.example.com" })).toBeNull();
    expect(refusalFor({ nodeEnv: "development", betterAuthUrl: undefined })).toBeNull();
    expect(refusalFor({ nodeEnv: "development", betterAuthUrl: "http://localhost:8000" })).toBeNull();
    expect(refusalFor({ nodeEnv: "test", betterAuthUrl: undefined })).toBeNull();
    expect(PREFLIGHT_CHECKS).toContain("auth_base_url");
  });

  it("P1-A2: the Next.js server hands the rule its environment", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = (await readFile(new URL("../../../instrumentation-node.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    expect(src).toMatch(/authBaseUrl:\s*\{\s*nodeEnv: process\.env\.NODE_ENV,\s*betterAuthUrl: process\.env\.BETTER_AUTH_URL,\s*\}/);
  });

  it("has no environment escape hatch", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../src/preflight.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/process\.env/);
  });
});
