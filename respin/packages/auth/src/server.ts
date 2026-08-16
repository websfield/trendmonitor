// THE GATE lives here (auth-swap plan, gate-location decision): middleware is
// an optimistic cookie redirect only; every protected page/layout calls
// requireUser()/requireAdmin() — client-nav caches layouts, hence per-page.
// The gate-completeness test (respin/tests/gate-completeness.test.ts) enforces
// this mechanically for every page under PROTECTED_PREFIXES.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { toNextJsHandler } from "better-auth/next-js";
import { getServerDb } from "@respin/db";
import { adminAllowed, parseAdminAllowlist } from "./allowlist";
import { createAuth, type Auth } from "./create-auth";

let cached: Auth | undefined;

/** Lazy runtime instance — no env/db access at import time (keyless build). */
export function getAuth(): Auth {
  cached ??= createAuth(getServerDb());
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
