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
  "/trends",
  "/studio",
  // Slice 9a. Where a creator logs what a post of theirs actually did and reads
  // it against their own past. Two reasons it is listed here rather than left
  // to inherit anything: the rows beneath it are a creator's own outcome data
  // (REQ-A03/R-9 — nothing crosses a profile or a workspace), and the action
  // module beside the page is a POST endpoint in its own right, invocable by
  // its stable action id without the page ever rendering. Adding the prefix is
  // what makes `tests/gate-completeness.test.ts` DEMAND `requireUser()` on both.
  "/results",
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

/**
 * The public page the identity-deletion recovery mail links to.
 *
 * ONE authority, because three places have to agree and a disagreement is
 * silent: the mail link (`settings/account/actions.ts`), the redirects out of
 * `POST /api/deletion/recover`, and the page itself. Task 6-9 round 1 shipped
 * with the mail pointing at `/settings/account/recover` — a path with no page,
 * under a PROTECTED prefix, sent to a reader whose sessions were all revoked at
 * acknowledgement. The single control that makes an irreversible deletion
 * survivable 404'd, and the copy promised it worked.
 *
 * It is deliberately NOT under `/settings`: `isProtectedPath` must be false
 * here, which `tests/deletion-recover-route.test.ts` asserts.
 */
export const RECOVER_DELETION_PATH = "/recover-deletion";

/** The recovery link put in the mail. Built here so a test can hold it. */
export function recoverDeletionUrl(base: string, operationId: string, secret: string): string {
  const query = `op=${encodeURIComponent(operationId)}&s=${encodeURIComponent(secret)}`;
  return `${base.replace(/\/+$/, "")}${RECOVER_DELETION_PATH}?${query}`;
}
