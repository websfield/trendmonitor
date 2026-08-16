// Workspace bootstrap on first login (REQ-A01 M0 slice, R-16b: lazy + idempotent).
// STRUCTURAL REQUIREMENT (plan-review finding 4): on auth_user_id conflict the
// transaction resolves and returns the EXISTING user's membership + workspace —
// it never proceeds to workspace creation. The unique constraint alone does not
// prevent a second workspace; this branch does.
import { eq } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
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

  const [membership] = await tx
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id));

  if (membership) {
    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, membership.workspaceId));
    if (!workspace) {
      throw new Error(
        "bootstrap: membership exists but its workspace is missing — data integrity error"
      );
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
