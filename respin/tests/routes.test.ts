// AC-3 (URL-terms matcher) + AC-4 (admin allowlist fail-closed). The middleware
// deploys isProtectedPath directly, so these unit tests exercise the single
// source of truth for the boundary's shape. Allowlist logic moved to
// @respin/auth in the Better Auth swap (server-layer auth logic now).
import { describe, expect, it } from "vitest";
import { PROTECTED_PREFIXES, isAdminPath, isProtectedPath } from "../lib/routes";
import { adminAllowed, parseAdminAllowlist } from "@respin/auth";

// M1 phase 4: middleware.ts cannot derive its matcher from PROTECTED_PREFIXES
// (Next requires a static literal), so "keep them in sync" was a comment.
// It is an assertion now — a new protected prefix that never gets an optimistic
// redirect is a UX hole nobody would notice, because the server-layer gate
// still works.
describe("middleware matcher covers every protected prefix", () => {
  it("every PROTECTED_PREFIX has a matcher entry", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "middleware.ts"),
      "utf8"
    );
    const matcher = source.slice(source.indexOf("matcher:"));
    expect(PROTECTED_PREFIXES.length).toBeGreaterThan(0);
    for (const prefix of PROTECTED_PREFIXES) {
      expect(matcher, `${prefix} is missing from middleware's matcher`).toContain(
        `"${prefix}/:path*"`
      );
    }
    // Non-vacuity: the slice really is the matcher literal, not an empty tail.
    expect(matcher).toContain("/studio/:path*");
  });
});

describe("route protection matcher (AC-3)", () => {
  it("leaves /, /sign-in, /sign-up public", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/sign-in")).toBe(false);
    expect(isProtectedPath("/sign-in/factor-one")).toBe(false);
    expect(isProtectedPath("/sign-up")).toBe(false);
  });

  it("protects /studio and /admin prefixes", () => {
    expect(isProtectedPath("/studio")).toBe(true);
    expect(isProtectedPath("/studio/anything")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/admin/margin")).toBe(true);
  });

  it("does not protect look-alike prefixes", () => {
    expect(isProtectedPath("/studios")).toBe(false);
    expect(isProtectedPath("/administrator")).toBe(false);
  });

  it("identifies admin paths", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/users")).toBe(true);
    expect(isAdminPath("/studio")).toBe(false);
  });
});

describe("admin allowlist (AC-4)", () => {
  it("parses a comma-separated list with whitespace", () => {
    expect(parseAdminAllowlist("user_1, user_2 ,user_3")).toEqual(
      new Set(["user_1", "user_2", "user_3"])
    );
  });

  it("FAIL CLOSED: unset or empty allowlist denies everyone", () => {
    expect(adminAllowed("user_1", parseAdminAllowlist(undefined))).toBe(false);
    expect(adminAllowed("user_1", parseAdminAllowlist(""))).toBe(false);
    expect(adminAllowed("user_1", parseAdminAllowlist("  ,  "))).toBe(false);
  });

  it("denies an authenticated but non-allowlisted user", () => {
    expect(adminAllowed("user_2", parseAdminAllowlist("user_1"))).toBe(false);
  });

  it("denies a missing user id even when the allowlist is populated", () => {
    expect(adminAllowed(null, parseAdminAllowlist("user_1"))).toBe(false);
    expect(adminAllowed(undefined, parseAdminAllowlist("user_1"))).toBe(false);
    expect(adminAllowed("", parseAdminAllowlist("user_1"))).toBe(false);
  });

  it("allows exactly the allowlisted user", () => {
    expect(adminAllowed("user_1", parseAdminAllowlist("user_1"))).toBe(true);
  });
});

// M1 phase 3 AC-8: the Stripe webhook is the ONE non-session entry — outside
// every auth matcher; its authentication is the signature (verified at the
// route edge with the installed SDK's own test-header helper).
import Stripe from "stripe";
import { POST as webhookPost } from "../app/api/stripe/webhook/route";

describe("stripe webhook route (M1 phase 3)", () => {
  it("/api/stripe/webhook matches no auth matcher prefix", async () => {
    const { isProtectedPath, isAdminPath } = await import("../lib/routes");
    expect(isProtectedPath("/api/stripe/webhook")).toBe(false);
    expect(isAdminPath("/api/stripe/webhook")).toBe(false);
  });

  it("missing signature → 400, and no secret is even consulted", async () => {
    const res = await webhookPost(
      new Request("http://x/api/stripe/webhook", { method: "POST", body: "{}" })
    );
    expect(res.status).toBe(400);
  });

  it("INVALID signature → 400 (the event never authenticates; no stripe_events row is possible)", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    try {
      const res = await webhookPost(
        new Request("http://x/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": "t=1,v1=deadbeef" },
          body: JSON.stringify({ id: "evt_x" }),
        })
      );
      expect(res.status).toBe(400);
    } finally {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    }
  });

  it("a VALIDLY signed payload passes verification (proven via the SDK's generateTestHeaderString) and proceeds past the 400 layer", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    try {
      const payload = JSON.stringify({
        id: "evt_sig_test", object: "event", type: "customer.updated",
        data: { object: { id: "cus_x", object: "customer" } },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: "whsec_test_secret",
      });
      const res = await webhookPost(
        new Request("http://x/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": header },
          body: payload,
        })
      );
      // Verification PASSED (not 400); the handler then fails on the missing
      // DATABASE_URL in this keyless test env → 500. That 400→500 boundary is
      // exactly the signature layer working.
      expect(res.status).not.toBe(400);
      expect(res.status).toBe(500);
    } finally {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    }
  });
});
