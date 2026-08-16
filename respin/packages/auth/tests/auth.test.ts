// AC-1: REAL sign-up → session → getSessionUser on PGlite — no mocks of Better
// Auth itself; only the Next request plumbing (headers/navigation) and the
// env-wired db handle are substituted, so the auth flow exercised here is the
// one production runs.
import { beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookie: "" as string,
  db: null as unknown,
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(state.cookie ? { cookie: state.cookie } : {}),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@respin/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@respin/db")>();
  return { ...actual, getServerDb: () => state.db };
});

import { createTestDb } from "../../db/src/testing";
import {
  getAuth,
  getSessionUser,
  requireAdmin,
  requireUser,
} from "../src/server";
import { resetPasswordLogLine } from "../src/create-auth";

const EMAIL = "creator@test.dev";
const PASSWORD = "correct-horse-battery";
/** The genuine session cookie captured at sign-up — reused by the middleware tests. */
let capturedCookie = "";

describe("Better Auth on PGlite (the real flow)", () => {
  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-not-a-real-one";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    delete process.env.ADMIN_USER_IDS;
    state.db = await createTestDb();
  });

  it("signs up with email/password and getSessionUser sees the session (AC-1)", async () => {
    const res = await getAuth().api.signUpEmail({
      body: { name: "Creator", email: EMAIL, password: PASSWORD },
      asResponse: true,
    });
    expect(res.ok).toBe(true);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    state.cookie = (setCookie as string).split(";")[0];
    capturedCookie = state.cookie;

    const user = await getSessionUser();
    expect(user).not.toBeNull();
    expect(user?.email).toBe(EMAIL);
    expect(user?.id).toBeTruthy();
  });

  it("requireUser returns the user when a valid session exists", async () => {
    const user = await requireUser();
    expect(user.email).toBe(EMAIL);
  });

  it("requireAdmin FAILS CLOSED: valid session but unset/empty ADMIN_USER_IDS denies (AC-3)", async () => {
    delete process.env.ADMIN_USER_IDS;
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
    process.env.ADMIN_USER_IDS = "  ,  ";
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("requireAdmin admits exactly the allowlisted user (AC-3)", async () => {
    const user = await getSessionUser();
    process.env.ADMIN_USER_IDS = `someone_else, ${user?.id}`;
    const admin = await requireAdmin();
    expect(admin.id).toBe(user?.id);
    process.env.ADMIN_USER_IDS = "someone_else";
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("without a session, requireUser redirects to /sign-in (AC-9 — the real gate) and requireAdmin 404s (AC-3)", async () => {
    state.cookie = "";
    await expect(requireUser()).rejects.toThrow("REDIRECT:/sign-in");
    process.env.ADMIN_USER_IDS = "anyone";
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("rejects a sign-in with the wrong password (the flow is real, not mocked)", async () => {
    const res = await getAuth().api.signInEmail({
      body: { email: EMAIL, password: "wrong-password-123" },
      asResponse: true,
    });
    expect(res.ok).toBe(false);
  });
});

// AC-4 (code-gate CHANGE 2): the DEPLOYED middleware, exercised with the REAL
// cookie — both directions. The pass-through direction guards against the
// availability loop (authenticated users bounced /studio → /sign-in forever)
// that a cookie-name mismatch would cause.
describe("middleware behavior with the real session cookie", () => {
  it("redirects a cookieless request on a protected prefix to /sign-in", async () => {
    const { middleware } = await import("../../../middleware");
    const { NextRequest } = await import("next/server");
    const res = middleware(new NextRequest("http://localhost:3000/studio"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in");
  });

  it("passes through a request carrying the genuine session cookie", async () => {
    const { middleware } = await import("../../../middleware");
    const { NextRequest } = await import("next/server");
    expect(capturedCookie).toBeTruthy();
    const res = middleware(
      new NextRequest("http://localhost:3000/studio", {
        headers: { cookie: capturedCookie },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through the __Secure- prefixed variant (the HTTPS/Lightsail shape)", async () => {
    const { middleware } = await import("../../../middleware");
    const { NextRequest } = await import("next/server");
    const [name, value] = capturedCookie.split("=");
    const res = middleware(
      new NextRequest("http://localhost:3000/studio", {
        headers: { cookie: `__Secure-${name}=${value}` },
      })
    );
    expect(res.status).toBe(200);
  });

  it("leaves public paths alone regardless of cookies", async () => {
    const { middleware } = await import("../../../middleware");
    const { NextRequest } = await import("next/server");
    const res = middleware(new NextRequest("http://localhost:3000/sign-in"));
    expect(res.status).toBe(200);
  });
});

describe("password-reset stub guard (plan-review pre-mortem)", () => {
  const USER = { id: "user_123", email: "a@b.c" };
  it("logs the reset URL in development ONLY", () => {
    expect(
      resetPasswordLogLine("development", USER, "https://x/reset?t=SECRET")
    ).toContain("SECRET");
  });
  it("never logs the URL — or the email (T6) — outside development", () => {
    for (const env of ["production", "test", undefined]) {
      const line = resetPasswordLogLine(env, USER, "https://x/reset?t=SECRET");
      expect(line).not.toContain("SECRET");
      expect(line).not.toContain("https://");
      expect(line).not.toContain("a@b.c");
      expect(line).toContain(USER.id);
    }
  });
});
