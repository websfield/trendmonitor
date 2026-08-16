// OPTIMISTIC redirect only — NOT the gate (auth-swap plan, gate-location
// decision): Better Auth has no stateless edge verification, so middleware
// checks cookie EXISTENCE for UX and the real gate is requireUser()/
// requireAdmin() at the server layer, on every protected page/layout
// (enforced mechanically by tests/gate-completeness.test.ts). A forged or
// stale cookie passes here and is refused there — by design.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isProtectedPath } from "./lib/routes";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (isProtectedPath(path) && !getSessionCookie(req)) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Next requires a static literal here — it cannot be derived from
  // PROTECTED_PREFIXES. Drift is not a security hole (the real gate is
  // requireUser() on every page, and the decision logic above IS
  // isProtectedPath) but it IS a UX hole: a protected prefix missing here
  // never runs the optimistic redirect, so a signed-out visitor waits for a
  // server render before being sent to sign-in. `tests/routes.test.ts` now
  // parses this literal and asserts it covers every PROTECTED_PREFIX, so the
  // "keep in sync" comment is an assertion rather than a hope.
  matcher: [
    "/studio/:path*",
    "/usage/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
