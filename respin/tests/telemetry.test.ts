// Phase 10a plan C5: the collector receives an allowlisted payload and
// nothing else. The canary is a REAL driver error whose message carries a
// secret and a content marker — proven present in the error first, then
// proven absent from every byte that would leave the process.
import { describe, expect, it } from "vitest";
import { createTestDb, schema } from "@respin/db";
import { createTelemetry } from "../lib/telemetry";

const SECRET = "MY UNPUBLISHED POST: a caption about something private";
const CANARY_COOKIE = "session=canary-cookie-value";
const DSN = "https://publickey123@o1.ingest.sentry.io/4509";

function capture() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 200 });
  };
  return { calls, fetchImpl };
}

describe("createTelemetry — the envelope is built from safe-log's allowlist only", () => {
  it("a real DrizzleQueryError carrying a secret is forwarded as a code, a class and a SQLSTATE — never its message", async () => {
    const db = await createTestDb();
    let caught: unknown;
    try {
      await db.insert(schema.onboardingInputs).values({
        profileId: "00000000-0000-7000-8000-000000000000",
        workspaceId: "00000000-0000-7000-8000-000000000001",
        inputClass: "own_post",
        content: SECRET,
        contentSha256: "0".repeat(64),
      });
    } catch (err) {
      caught = err;
    }
    expect(String((caught as Error).message), "non-vacuity: the driver must embed the payload").toContain(SECRET);

    const { calls, fetchImpl } = capture();
    const telemetry = createTelemetry({ SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: "staging" }, { fetchImpl, now: () => new Date("2026-09-09T00:00:00Z"), random: () => 0 });
    expect(telemetry.enabled).toBe(true);
    // The route pattern is a pattern; a concrete URL with a query string is refused as context.
    await expect(telemetry.captureError(caught, { route: "/api/demo" })).resolves.toBe("sent");
    expect(calls).toHaveLength(1);
    const body = String(calls[0]!.init.body);
    expect(calls[0]!.url).toBe("https://o1.ingest.sentry.io/api/4509/envelope/");
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("UNPUBLISHED");
    expect(body).toContain('"error_name":"DrizzleQueryError"');
    expect(body).toContain('"driver_code":"23503"');
    expect(body).toContain('"route":"/api/demo"');
    expect(body).toContain('"code":"unknown"');
    expect(body).toContain('"environment":"staging"');
    // No request, user, breadcrumbs, extra or contexts sections exist at all.
    for (const forbidden of ['"request"', '"user"', '"breadcrumbs"', '"extra"', '"contexts"', '"exception"']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    const auth = (calls[0]!.init.headers as Record<string, string>)["X-Sentry-Auth"];
    expect(auth).toContain("sentry_key=publickey123");
  });

  it("a plain Error's message, a cookie-shaped context and a concrete URL never reach the payload", async () => {
    const { calls, fetchImpl } = capture();
    const telemetry = createTelemetry({ SENTRY_DSN: DSN }, { fetchImpl, random: () => 0 });
    const err = new Error(`handler failed with ${CANARY_COOKIE} for ${SECRET}`);
    const event = telemetry.eventFor(err, { route: "/settings/account?token=abc&email=x@y.z" });
    expect(event).toEqual({ code: "unknown", errorName: "Error", origin: "app" });
    await telemetry.captureError(err, { route: "/settings/account?token=abc" });
    expect(String(calls[0]!.init.body)).not.toContain("canary");
    expect(String(calls[0]!.init.body)).not.toContain("token=");
    expect(String(calls[0]!.init.body)).not.toContain(SECRET);
  });

  it("is disabled without a DSN, samples out under the tighten-only rate, and stops at the monthly budget", async () => {
    const { calls, fetchImpl } = capture();
    expect(createTelemetry({}, { fetchImpl }).enabled).toBe(false);
    await expect(createTelemetry({}, { fetchImpl }).captureError(new Error("x"), {})).resolves.toBe("disabled");
    const sampled = createTelemetry({ SENTRY_DSN: DSN, RESPIN_SENTRY_SAMPLE_RATE: "0.25" }, { fetchImpl, random: () => 0.5 });
    await expect(sampled.captureError(new Error("x"), {})).resolves.toBe("sampled_out");
    expect(() => createTelemetry({ SENTRY_DSN: DSN, RESPIN_SENTRY_SAMPLE_RATE: "1.5" }, { fetchImpl })).toThrow(/0 to 1/);
    expect(calls).toHaveLength(0);
  });

  it("a collector failure is never an application failure, and neither is a malformed environment tag", async () => {
    const failing: typeof fetch = async () => {
      throw new Error("network down");
    };
    const telemetry = createTelemetry({ SENTRY_DSN: DSN }, { fetchImpl: failing, random: () => 0 });
    await expect(telemetry.captureError(new Error("x"), {})).resolves.toBe("failed");
    // A malformed tag refuses when the telemetry is BUILT, never per event
    // (lean gate round 2: refused per event, a deployment would ship zero
    // events with no symptom).
    expect(() => createTelemetry({ SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: "not a token!" }, { fetchImpl: failing, random: () => 0 })).toThrow(/SENTRY_ENVIRONMENT/);
  });
});
