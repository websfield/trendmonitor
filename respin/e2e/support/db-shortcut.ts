// A deliberate, narrow DB shortcut for test setup only: this repo has no
// invite-a-seat UI yet (checked against the source before writing this - see
// the journey's own header comment), so attaching a second signed-up user to
// the first user's workspace as an editor has no UI path to drive. The task
// brief explicitly sanctions this: "use whatever's realistic - directly via
// DB/API if the invite flow needs the inviter's session".
//
// This shells out to `docker exec` against the compose Postgres container
// rather than importing `@respin/db` - the app's own tenancy default-deny
// rule (eslint's no-restricted-imports) exists to keep `app/**` off raw
// tables, and this is deliberately OUTSIDE `app/**`; going around it with a
// package import here would be the exact "second, ungoverned entrypoint"
// this repo's lessons warn about. A single UPDATE, addressed by email, is
// easier to audit than a new import surface for a one-off test fixture.
import { execFileSync } from "node:child_process";

const EMAIL_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;

function assertSafeEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(`refusing to interpolate an unexpected email shape into SQL: ${email}`);
  }
}

/**
 * Re-points an already-bootstrapped user's OWN membership row at another
 * user's workspace, as 'editor'. Leaves their auto-created personal workspace
 * behind (an orphaned row, not deleted - this repo's dev DB already carries
 * that kind of leftover from earlier manual test sessions, and deleting
 * something the app created as a side effect is not this script's call).
 */
export function attachAsEditor(ownerEmail: string, editorEmail: string): void {
  assertSafeEmail(ownerEmail);
  assertSafeEmail(editorEmail);
  const sql = `
    UPDATE memberships
    SET role = 'editor',
        workspace_id = (
          SELECT m2.workspace_id FROM memberships m2
          JOIN users u2 ON u2.id = m2.user_id
          JOIN "user" au2 ON au2.id = u2.auth_user_id
          WHERE au2.email = '${ownerEmail}'
          LIMIT 1
        )
    WHERE user_id = (
      SELECT u.id FROM users u
      JOIN "user" au ON au.id = u.auth_user_id
      WHERE au.email = '${editorEmail}'
      LIMIT 1
    );
  `;
  execFileSync(
    "docker",
    ["exec", "respin-postgres", "psql", "-U", "respin", "-d", "respin", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: "pipe" }
  );
}

/**
 * The Better Auth user id for an email - the value `ADMIN_USER_IDS` in
 * `.env.local` expects (see the platform-admin journey's own bootstrap step,
 * and the task brief's own instructions for finding it this way).
 */
export function lookupAuthUserId(email: string): string | null {
  assertSafeEmail(email);
  const out = execFileSync(
    "docker",
    [
      "exec",
      "respin-postgres",
      "psql",
      "-U",
      "respin",
      "-d",
      "respin",
      "-t",
      "-A",
      "-c",
      `select id from "user" where email = '${email}' limit 1;`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  )
    .toString("utf8")
    .trim();
  return out.length > 0 ? out : null;
}
