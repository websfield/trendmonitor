// Admin allowlist (moved here from lib/routes.ts in the auth swap — it is
// auth logic, and middleware can no longer check it: Better Auth has no
// stateless edge verification, so the check lives at the server layer).
export function parseAdminAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * FAIL CLOSED: an unset or empty ADMIN_USER_IDS denies everyone —
 * it never admits everyone.
 */
export function adminAllowed(
  userId: string | null | undefined,
  allowlist: Set<string>
): boolean {
  return (
    typeof userId === "string" && userId.length > 0 && allowlist.has(userId)
  );
}
