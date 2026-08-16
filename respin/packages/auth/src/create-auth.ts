import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { DbLike } from "@respin/db";

export type CreateAuthOptions = {
  baseURL?: string;
  secret?: string;
};

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

/**
 * The password-reset URL is a BEARER CREDENTIAL (account takeover if leaked).
 * Outside development it must never enter logs — and neither does the email
 * (T6: keep PII out of aggregatable logs; the user id suffices for support).
 * Exported for the guard test.
 */
export function resetPasswordLogLine(
  nodeEnv: string | undefined,
  user: { id: string; email: string },
  url: string
): string {
  if (nodeEnv === "development") {
    return `[dev-only] password reset link for ${user.email}: ${url}`;
  }
  return `password reset requested (user ${user.id})`;
}

/**
 * Factory (testability: tests inject a PGlite db and run REAL sign-up flows).
 * The runtime instance is built lazily in server.ts — no env read at import.
 */
export function createAuth(db: DbLike, opts: CreateAuthOptions = {}) {
  return betterAuth({
    // The db's schema map already contains the generated auth tables —
    // packages/db/src/schema.ts re-exports auth-schema.ts (adapter-wiring pin).
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: opts.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL: opts.baseURL ?? process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      // SHORTCUT: no email provider until M6 (digests land there — auth-swap
      // plan, Deferral Ledger). Ceiling: users cannot actually receive reset
      // email; dev reads the link from the dev console. Guard: outside
      // development the URL is never logged (resetPasswordLogLine).
      // Upgrade trigger: M6 email provider — replace this stub with real send.
      sendResetPassword: async ({ user, url }) => {
        console.log(resetPasswordLogLine(process.env.NODE_ENV, user, url));
      },
    },
    ...(isGoogleConfigured()
      ? {
          socialProviders: {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID as string,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
          },
        }
      : {}),
  });
}

export type Auth = ReturnType<typeof createAuth>;
