// Phase 10b-1 Task 4.2 — Better Auth's reset and verification hooks go through
// the closed auth-delivery authority when a mail port is configured, and stay
// on the console line (id only outside development) when it is not.
//
// REAL Better Auth routes on PGlite; only the mail port is a fake. This
// package does not depend on drizzle-orm, so rows are read whole through the
// sanctioned @respin/db surface and filtered here.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authMailOutbox,
  createTestDb,
  schema,
  type AuthMailPort,
  type AuthMailSendResult,
} from "@respin/db";
import {
  createAuth,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  emailVerificationLogLine,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
} from "../src/create-auth";

const EMAIL = "creator@example.test";
const PASSWORD = "correct-horse-battery";

function fakeMailer(results: AuthMailSendResult[] = []) {
  const sent: Parameters<AuthMailPort["send"]>[0][] = [];
  const port: AuthMailPort = {
    send: vi.fn(async (message) => {
      sent.push(message);
      return results.shift() ?? { outcome: "accepted" as const, providerMessageId: `re_${sent.length}` };
    }),
  };
  return { port, sent };
}

describe("auth-mail wiring", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("pins the token lifetimes to the authority's TTLs", () => {
    expect(PASSWORD_RESET_TOKEN_TTL_SECONDS).toBe(15 * 60);
    expect(EMAIL_VERIFICATION_TOKEN_TTL_SECONDS).toBe(24 * 60 * 60);
  });

  it("sends the verification mail at signup and the reset mail on request, each as an admitted outbox row", async () => {
    const { port, sent } = fakeMailer();
    const auth = createAuth(db, {
      secret: "test-secret-not-a-real-one",
      baseURL: "http://localhost:3000",
      nodeEnv: "test",
      mail: port,
    });
    const signup = await auth.api.signUpEmail({
      body: { name: "Creator Person", email: EMAIL, password: PASSWORD },
      asResponse: true,
    });
    expect(signup.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(EMAIL);
    expect(sent[0]!.subject).toBe("Verify your email address");
    expect(sent[0]!.text).toContain("http://localhost:3000/api/auth/verify-email?token=");
    expect(sent[0]!.text).not.toContain("Creator Person");

    const reset = await auth.api.requestPasswordReset({
      body: { email: EMAIL, redirectTo: "/reset" },
    });
    expect(reset.status).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.subject).toBe("Reset your password");
    expect(sent[1]!.text).toContain("http://localhost:3000/api/auth/reset-password/");
    expect(sent[1]!.text).not.toContain("Creator Person");

    const rows = (await db.select().from(authMailOutbox)).sort(
      (a, b) => a.admittedAt.getTime() - b.admittedAt.getTime()
    );
    expect(rows.map((row) => [row.purpose, row.status])).toEqual([
      ["email_verification", "accepted"],
      ["password_reset", "accepted"],
    ]);
    expect(rows.map((row) => row.id)).toEqual(sent.map((message) => message.idempotencyKey));
    const user = (await db.select().from(schema.user)).find((row) => row.email === EMAIL);
    expect(user).toBeDefined();
    expect(rows.every((row) => row.authUserId === user!.id)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(EMAIL);

    // The reset token row Better Auth stores carries the 15-minute TTL.
    const verification = (await db.select().from(schema.verification)).find(
      (row) => row.identifier.startsWith("reset-password:") && row.value === user!.id
    );
    expect(verification).toBeDefined();
    const ttlSeconds = (verification!.expiresAt.getTime() - verification!.createdAt.getTime()) / 1_000;
    expect(Math.abs(ttlSeconds - PASSWORD_RESET_TOKEN_TTL_SECONDS)).toBeLessThan(5);
    expect(rows[1]!.actionExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(rows[1]!.actionExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1_000 + 5_000);
  });

  it("records a non-accepted reset send as failed; the route's generic reply is Better Auth's enumeration guard, not a delivery claim", async () => {
    // STATED LIMITATION (10b1-task4-contract.md): the installed Better Auth
    // runs `sendResetPassword` through its background-task helper and answers
    // "If this email exists…" regardless of the hook's outcome — deliberately,
    // so a delivery failure cannot reveal whether the address exists. The
    // hook still throws (visible in Better Auth's error log with the code),
    // and the OUTBOX ROW is the durable truth: `failed`, never `accepted`.
    const { port } = fakeMailer([
      { outcome: "accepted", providerMessageId: "re_signup" },
      { outcome: "failed", failureCode: "provider_rate_limited" },
    ]);
    const auth = createAuth(db, {
      secret: "test-secret-not-a-real-one",
      baseURL: "http://localhost:3000",
      nodeEnv: "test",
      mail: port,
    });
    await auth.api.signUpEmail({ body: { name: "C", email: EMAIL, password: PASSWORD } });
    const reply = await auth.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: "/reset" } });
    expect(reply.status).toBe(true);
    const rows = (await db.select().from(authMailOutbox)).filter((row) => row.purpose === "password_reset");
    expect(rows.map((row) => [row.status, row.failureCode])).toEqual([["failed", "provider_rate_limited"]]);
    expect(port.send).toHaveBeenCalledTimes(2);
  });

  it("does not fail signup when the verification mail is refused, and logs a code without the address", async () => {
    const { port } = fakeMailer([{ outcome: "unknown", failureCode: "request_failed" }]);
    const auth = createAuth(db, {
      secret: "test-secret-not-a-real-one",
      baseURL: "http://localhost:3000",
      nodeEnv: "test",
      mail: port,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const signup = await auth.api.signUpEmail({
        body: { name: "C", email: EMAIL, password: PASSWORD },
        asResponse: true,
      });
      expect(signup.ok).toBe(true);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = String(errorSpy.mock.calls[0]![0]);
      expect(line).toContain("email verification not sent");
      expect(line).toContain("unknown:request_failed");
      expect(line).not.toContain(EMAIL);
      expect(line).not.toContain("verify-email?token=");
    } finally {
      errorSpy.mockRestore();
    }
    const rows = await db.select().from(authMailOutbox);
    expect(rows.map((row) => [row.purpose, row.status])).toEqual([["email_verification", "unknown"]]);
  });

  it("without a mail port, signup and reset log an id-only line outside development and no outbox row", async () => {
    const auth = createAuth(db, {
      secret: "test-secret-not-a-real-one",
      baseURL: "http://localhost:3000",
      nodeEnv: "test",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await auth.api.signUpEmail({ body: { name: "C", email: EMAIL, password: PASSWORD } });
      await auth.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: "/reset" } });
      const lines = logSpy.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.startsWith("email verification requested (user "))).toBe(true);
      expect(lines.some((line) => line.startsWith("password reset requested (user "))).toBe(true);
      expect(lines.join("\n")).not.toContain(EMAIL);
      expect(lines.join("\n")).not.toContain("token=");
    } finally {
      logSpy.mockRestore();
    }
    expect(await db.select().from(authMailOutbox)).toHaveLength(0);
    expect(emailVerificationLogLine("production", { id: "u", email: EMAIL }, "https://x/verify?token=t")).toBe(
      "email verification requested (user u)"
    );
    expect(emailVerificationLogLine("development", { id: "u", email: EMAIL }, "https://x/verify?token=t")).toContain(
      "https://x/verify?token=t"
    );
  });
});
