// THE READ GRADE'S LIFECYCLE FENCES (R-163, P5-R3) — the read siblings of
// `membership-lifecycle.ts`'s write fences. Nothing here changes a write
// fence: those stay in `membership-lifecycle.ts`, byte-identical.
//
// WHY `deletion_operations` IS READ AS NAMED SQL HERE, not through the drizzle
// table object: this module is reachable from `schema.ts` (schema ->
// system-spend -> trends-storage -> with-workspace -> here), and
// `lifecycle-schema.ts` calls `schema.ts`'s enums at load, so importing it
// closes a cycle drizzle-kit's loader hits before `schema.ts` has run
// ("Cannot access 'membershipRole' before initialization", measured
// 2026-10-06). The column names are pinned by `with-workspace.test.ts`'s read-grade suite, which
// runs this query against the migrated schema.
import { and, eq, inArray, sql } from "drizzle-orm";
import { creatorProfiles } from "./brain-schema";
import type { DbLike, TxLike } from "./db-like";
import {
  withMembershipGraphLocks,
  type ActiveMembershipAuthority,
  type ActiveProfileAuthority,
} from "./membership-lifecycle";
import { memberships, users, workspaces } from "./schema";

function refuse(code: string): never {
  throw new Error(`lifecycle_refused:${code}`);
}

/**
 * THE READ GRADE'S WINDOW (R-163, P5-R3): the states of a WORKSPACE deletion in
 * which its owner may still read and export the workspace's data. Everything
 * before irreversible work, `blocked` included; never `erasing`, `verifying`,
 * `complete`, and never `requested` (the workspace is not tombstoned yet, so
 * the write grade still holds). A list, not a producer (Respin rule 7): a new
 * pre-erasure state is an edit here and in the read-grade tests.
 *
 * `blocked` is admitted ONLY when its resume state is before irreversible work
 * (R-166, gate M2): a `blocked` operation resuming into `erasing` or
 * `verifying` is an erasure that already started — its rows may be gone —
 * and `cancelScopedDeletion` refuses it as `erasure_started` for the same
 * reason. `READ_GRADE_BLOCKED_EXCLUDED_RESUME_STATES` is that list.
 */
export const READ_GRADE_DELETION_STATES = [
  "journal_pending",
  "tombstoned",
  "external_actions_pending",
  "grace",
  "blocked",
] as const;

/** R-166 (gate M2): a `blocked` deletion resuming into one of these is outside the window. */
export const READ_GRADE_BLOCKED_EXCLUDED_RESUME_STATES = ["erasing", "verifying"] as const;

/**
 * Is the NEWEST workspace-scoped deletion of this workspace still in the read
 * grade's window? Re-read on EVERY read-grade call, not only at mint, so a
 * scope minted in `grace` stops reading the moment the operation reaches
 * `erasing` — or `blocked` on the way to it. The one authority for the
 * window: the read fences and `workspaceAdmitsMembershipRestoreInTx` both ask
 * it.
 */
export async function newestWorkspaceDeletionAdmitsRead(
  db: DbLike | TxLike,
  workspaceId: string
): Promise<boolean> {
  const result = (await db.execute(
    sql`SELECT "state", "blocked_resume_state" FROM "deletion_operations"
        WHERE "scope" = 'workspace' AND "workspace_id" = ${workspaceId}
        ORDER BY "requested_at" DESC, "id" DESC
        LIMIT 1`
  )) as unknown as { rows: { state: string; blocked_resume_state: string | null }[] };
  const newest = result.rows[0];
  return (
    newest !== undefined &&
    (READ_GRADE_DELETION_STATES as readonly string[]).includes(newest.state) &&
    !(
      newest.state === "blocked" &&
      (READ_GRADE_BLOCKED_EXCLUDED_RESUME_STATES as readonly (string | null)[]).includes(
        newest.blocked_resume_state
      )
    )
  );
}

/**
 * The READ sibling of `assertWorkspaceLifecycleAccess` (R-163, fence 3). The
 * same query with exactly one predicate relaxed — the workspace may be
 * `tombstoned` — plus one predicate added and re-read on every call: a
 * tombstoned workspace is admitted only while its newest deletion is in
 * `READ_GRADE_DELETION_STATES`. The `users` and `memberships` joins are
 * byte-identical to the write fence, so the read grade is a WORKSPACE-deletion
 * grace only: under an identity deletion the user row is tombstoned and this
 * refuses exactly as the write fence does. Reachable only from a read-grade
 * scope's guards (fences 4–7); the write fence above does not change.
 */
export async function assertWorkspaceReadAccess(
  db: DbLike | TxLike,
  userId: string,
  workspaceId: string
): Promise<ActiveMembershipAuthority> {
  const [row] = await db
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      version: memberships.version,
      workspaceLifecycleVersion: workspaces.lifecycleVersion,
      workspaceLifecycleState: workspaces.lifecycleState,
    })
    .from(memberships)
    .innerJoin(
      users,
      and(eq(users.id, memberships.userId), eq(users.lifecycleState, "active"))
    )
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.id, memberships.workspaceId),
        inArray(workspaces.lifecycleState, ["active", "tombstoned"])
      )
    )
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.lifecycleState, "active")
      )
    )
    .limit(1);
  if (!row) refuse("workspace_access_tombstoned_or_suspended");
  if (
    row.workspaceLifecycleState !== "active" &&
    !(await newestWorkspaceDeletionAdmitsRead(db, workspaceId))
  ) {
    refuse("workspace_access_tombstoned_or_suspended");
  }
  return {
    membershipId: row.membershipId,
    role: row.role,
    version: row.version,
    workspaceLifecycleVersion: row.workspaceLifecycleVersion,
  };
}

/** The read sibling of `assertProfileLifecycleAccess`: the profile predicate is unchanged. */
export async function assertProfileReadAccess(
  db: DbLike | TxLike,
  userId: string,
  workspaceId: string,
  profileId: string
): Promise<ActiveProfileAuthority> {
  const authority = await assertWorkspaceReadAccess(db, userId, workspaceId);
  const [row] = await db
    .select({ lifecycleVersion: creatorProfiles.lifecycleVersion })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.id, profileId),
        eq(creatorProfiles.workspaceId, workspaceId),
        inArray(creatorProfiles.state, ["active", "archived"])
      )
    )
    .limit(1);
  if (!row) refuse("profile_tombstoned");
  return { ...authority, profileLifecycleVersion: row.lifecycleVersion };
}

/**
 * The read sibling of `assertWorkspaceLifecycleTransactionAccess` (fence 4):
 * the same graph locks in the same SHARED form (audit Phase 8, P8-A3), the
 * read predicate in place of the write one.
 */
export async function assertWorkspaceReadTransactionAccess(
  tx: TxLike,
  userId: string,
  workspaceId: string
): Promise<ActiveMembershipAuthority> {
  return withMembershipGraphLocks(
    tx,
    userId,
    [workspaceId],
    () => assertWorkspaceReadAccess(tx, userId, workspaceId),
    "shared"
  );
}

/** The read sibling of `assertProfileLifecycleTransactionAccess` (fence 5). */
export async function assertProfileReadTransactionAccess(
  tx: TxLike,
  userId: string,
  workspaceId: string,
  profileId: string
): Promise<ActiveProfileAuthority> {
  return withMembershipGraphLocks(
    tx,
    userId,
    [workspaceId],
    () => assertProfileReadAccess(tx, userId, workspaceId, profileId),
    "shared"
  );
}
