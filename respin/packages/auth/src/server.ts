// THE GATE lives here (auth-swap plan, gate-location decision): middleware is
// an optimistic cookie redirect only; every protected page/layout calls
// requireUser()/requireAdmin() — client-nav caches layouts, hence per-page.
// The gate-completeness test (respin/tests/gate-completeness.test.ts) enforces
// this mechanically for every page under PROTECTED_PREFIXES.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createHmac } from "node:crypto";
import { getIp } from "better-auth/api";
import { toNextJsHandler } from "better-auth/next-js";
import {
  beginIdentityCancellationRecoverySession as beginCancellationRecovery,
  createIdentityCancellationProofWithPassword as createCancellationProof,
  getServerDb,
  reauthenticateSessionWithPassword,
  type ReauthenticatedSessionRef,
} from "@respin/db";
import { adminAllowed, parseAdminAllowlist } from "./allowlist";
import { createAuth, resolveTrustedProxies, type Auth } from "./create-auth";
import { resendMailPortFromEnv } from "./resend-mail";

let cached: Auth | undefined;

/** Lazy runtime instance — no env/db access at import time (keyless build). */
export function getAuth(): Auth {
  cached ??= createAuth(getServerDb(), {
    mail: resendMailPortFromEnv(process.env),
  });
  return cached;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name };
}

/** Fresh local-password proof for the exact currently authenticated session. */
export async function reauthenticateCurrentSessionWithPassword(
  password: string
): Promise<ReauthenticatedSessionRef> {
  const requestHeaders = await headers();
  const current = await getAuth().api.getSession({ headers: requestHeaders });
  if (!current) throw new Error("reauthentication_refused");
  return reauthenticateSessionWithPassword(getServerDb(), {
    authUserId: current.user.id,
    sessionId: current.session.id,
    password,
    rateLimitKeyDigest: await authRateLimitKeyDigest(
      "r118_reauthentication",
      requestHeaders
    ),
  });
}

async function authRateLimitKeyDigest(
  purpose: "r118_reauthentication" | "identity_cancellation",
  requestHeaders: Headers
): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("cancellation_recovery_refused");
  const ip = getIp(requestHeaders, {
    advanced: {
      ipAddress: {
        trustedProxies: resolveTrustedProxies(
          process.env.NODE_ENV,
          process.env.RESPIN_TRUSTED_PROXIES
        ),
      },
    },
  });
  return createHmac("sha256", secret)
    .update(`${purpose}\0${ip ?? "no-trusted-ip"}`, "utf8")
    .digest("hex");
}

async function cancellationRateLimitKeyDigest(): Promise<string> {
  return authRateLimitKeyDigest("identity_cancellation", await headers());
}

/** Exchange the delivered recovery credential for one bounded factor session. */
export async function beginIdentityCancellationRecoverySession(
  operationId: string,
  recoverySecret: string
): Promise<{ recoverySession: string; expiresAt: Date }> {
  return beginCancellationRecovery(
    getServerDb(),
    operationId,
    recoverySecret,
    await cancellationRateLimitKeyDigest()
  );
}

/** Cancellation-only factor proof; deliberately does not mint a login session. */
export async function createIdentityCancellationProofWithPassword(
  operationId: string,
  recoverySession: string,
  password: string
): Promise<{ proofId: string; cancellationReceipt: string; expiresAt: Date }> {
  return createCancellationProof(
    getServerDb(),
    operationId,
    recoverySession,
    password,
    await cancellationRateLimitKeyDigest()
  );
}

/** The real /studio gate: no valid session → redirect to sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** The real /admin gate: fail closed — empty/unset ADMIN_USER_IDS denies everyone. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!adminAllowed(user?.id, parseAdminAllowlist(process.env.ADMIN_USER_IDS))) {
    notFound();
  }
  return user as SessionUser;
}

// Pre-built route handlers so the auth instance never leaves this package
// (plan-review CHANGE 2). Lazy: nothing constructs at module import, so a
// keyless `next build` importing the route file stays green.
let handlers: ReturnType<typeof toNextJsHandler> | undefined;
function h() {
  handlers ??= toNextJsHandler(getAuth());
  return handlers;
}

export const authHandlers = {
  GET: (req: Request) => h().GET(req),
  POST: (req: Request) => h().POST(req),
};
