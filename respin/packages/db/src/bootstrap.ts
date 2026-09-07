// Workspace bootstrap on first login (REQ-A01 M0 slice, R-16b: lazy + idempotent).
// STRUCTURAL REQUIREMENT (plan-review finding 4): on auth_user_id conflict the
// transaction resolves and returns the EXISTING user's membership + workspace —
// it never proceeds to workspace creation. The unique constraint alone does not
// prevent a second workspace; this branch does.
import { asc, and, eq } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import {
  assertIdentityAcceptsMembership,
  assertWorkspaceAcceptsMembership,
  lockIdentityMembershipGraph,
  lockWorkspaceMembershipGraph,
  sortedWorkspaceIds,
} from "./membership-lifecycle";
import { memberships, users, workspaces } from "./schema";
import type { Membership, User, Workspace } from "./schema";

// D-M1-5: no email param — the domain users table stores no email; Better Auth
// user.email is the sole truth and is read from the session where needed.
export type BootstrapParams = {
  authUserId: string;
  name?: string;
};

export type BootstrapResult = {
  user: User;
  workspace: Workspace;
  membership: Membership;
  created: boolean;
};

/** Inner body, exported so tests can prove transactional atomicity (forced-failure rollback). */
export async function bootstrapInTx(
  tx: TxLike,
  params: BootstrapParams
): Promise<BootstrapResult> {
  const inserted = await tx
    .insert(users)
    .values({ authUserId: params.authUserId })
    .onConflictDoNothing()
    .returning();

  let user = inserted[0];
  if (!user) {
    // Resolve-existing branch: the insert conflicted (row already present or a
    // concurrent bootstrap won). Fetch the winner; do NOT create anything yet.
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.authUserId, params.authUserId));
    if (!existing) {
      throw new Error(
        "bootstrap: user insert conflicted but no existing row is visible — aborting rather than creating a duplicate workspace"
      );
    }
    user = existing;
  }

  // R-118 global ordering: every membership creator locks the identity first.
  // A first-ever identity cannot concurrently be deleted before its row
  // exists; once the row exists, bootstrap and deletion meet on this lock.
  await lockIdentityMembershipGraph(tx, user.id);
  await assertIdentityAcceptsMembership(tx, user.id);

  const candidateWorkspaces = await tx
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.lifecycleState, "active"),
        eq(workspaces.lifecycleState, "active")
      )
    );

  // Lock every initially eligible workspace in the global lexical order, then
  // choose again. A deletion that won before a workspace lock is therefore
  // observed rather than turning the oldest tombstoned membership into a
  // bootstrap failure or an accidental resurrection.
  for (const workspaceId of sortedWorkspaceIds(
    candidateWorkspaces.map((candidate) => candidate.workspaceId)
  )) {
    await lockWorkspaceMembershipGraph(tx, workspaceId);
  }

  const [existingAuthority] = await tx
    .select({ membership: memberships, workspace: workspaces })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.lifecycleState, "active"),
        eq(workspaces.lifecycleState, "active")
      )
    )
    .orderBy(asc(memberships.createdAt), asc(memberships.id))
    .limit(1);

  if (existingAuthority) {
    const { membership, workspace } = existingAuthority;
    // The identity lock prevents another membership creator for this user;
    // the sorted workspace locks make these re-read rows authoritative.
    const [currentMembership] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, membership.id),
          eq(memberships.lifecycleState, "active")
        )
      )
      .limit(1);
    if (!currentMembership) {
      throw new Error("bootstrap: active membership changed while graph locks were held");
    }
    return { user, workspace, membership, created: false };
  }

  const workspaceName = params.name
    ? `${params.name}'s workspace`
    : "My workspace";
  const [workspace] = await tx
    .insert(workspaces)
    .values({ name: workspaceName })
    .returning();
  await lockWorkspaceMembershipGraph(tx, workspace.id);
  await assertIdentityAcceptsMembership(tx, user.id);
  await assertWorkspaceAcceptsMembership(tx, workspace.id);
  const [newMembership] = await tx
    .insert(memberships)
    .values({ userId: user.id, workspaceId: workspace.id, role: "owner" })
    .returning();
  return { user, workspace, membership: newMembership, created: true };
}

/** Idempotent: any number of calls yields exactly one personal workspace. */
export async function ensureUserWorkspace(
  db: DbLike,
  params: BootstrapParams
): Promise<BootstrapResult> {
  return db.transaction((tx) => bootstrapInTx(tx, params));
}
