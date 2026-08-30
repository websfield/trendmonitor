// URL topology (master-plan "Decisions baked in"): route groups are URL-invisible,
// so the auth boundary is defined in URL-prefix terms. Single source of truth —
// middleware.ts deploys isProtectedPath directly, and the gate-completeness test
// derives its protected-file set from PROTECTED_PREFIXES.
// (Admin allowlist logic moved to @respin/auth in the Better Auth swap — it is
// server-layer auth logic now, not middleware logic.)
// M1 phase 4 adds /usage and /settings (billing). Adding a prefix here is what
// makes the gate-completeness suite DEMAND requireUser() on the pages beneath
// it — the fixture entries in that suite name these three URLs explicitly, so
// deleting a prefix cannot quietly un-gate a page (AC-1).
export const PROTECTED_PREFIXES = [
  // Slice 1. Adding it HERE is what makes the gate-completeness suite demand
  // requireUser() on the page AND on the server-action module beneath it — the
  // suite's default-deny half failed on `onboarding/actions.ts` the moment the
  // file existed and before this line did, which is the direction that matters.
  "/onboarding",
  // Slice 3. The confirm-and-activate surface for an inferred brain: it renders
  // the creator's own posts quoted back at them and it is the door to the two
  // acts that decide what the product believes about a person. Listing it here
  // is what makes the gate-completeness suite DEMAND `requireUser()` on the
  // page and on the action module beneath it.
  "/brain",
  "/studio",
  "/usage",
  "/settings",
  "/admin",
] as const;
export const ADMIN_PREFIX = "/admin";

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => underPrefix(pathname, p));
}

export function isAdminPath(pathname: string): boolean {
  return underPrefix(pathname, ADMIN_PREFIX);
}
