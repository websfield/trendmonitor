// Workspace bootstrap on first login (REQ-A01 M0 slice, R-16b: lazy + idempotent).
// STRUCTURAL REQUIREMENT (plan-review finding 4): on auth_user_id conflict the
// transaction resolves and returns the EXISTING user's membership + workspace —
// it never proceeds to workspace creation. The unique constraint alone does not
// prevent a second workspace; this branch does.
import { asc, and, eq, or, sql } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import { deletionOperations } from "./lifecycle-schema";
import {
  assertIdentityAcceptsMembership,
  assertWorkspaceAcceptsMembership,
  lockIdentityMembershipGraph,
  lockWorkspaceMembershipGraph,
  sortedWorkspaceIds,
  type MembershipLockMode,
} from "./membership-lifecycle";
import { boundedReadOrJoin } from "./render-transaction";
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

/**
 * Which workspaces count as the identity's EXISTING authority (R-161, P5-R2):
 * an active one, or a tombstoned one whose workspace deletion is still
 * non-terminal. Before R-161 this was `lifecycleState = 'active'` alone, so a
 * sole owner who requested their workspace's deletion was handed a brand-new
 * replacement on the next render — and that replacement hid the pending
 * deletion from the only page that can cancel it, then made cancelling throw
 * "user belongs to multiple workspaces" on every product page. Now no
 * replacement is minted while a deletion is undecided; the tombstoned
 * workspace is returned, and `withWorkspace`'s read grade is what the pages
 * hold. Once the deletion completes (the workspace row is erased) or is
 * cancelled (it is active again), this predicate needs nothing further.
 */
const existingAuthorityWorkspace = or(
  eq(workspaces.lifecycleState, "active"),
  and(
    eq(workspaces.lifecycleState, "tombstoned"),
    sql`EXISTS (
      SELECT 1 FROM ${deletionOperations}
      WHERE ${deletionOperations.scope} = 'workspace'
        AND ${deletionOperations.workspaceId} = ${workspaces.id}
        AND ${deletionOperations.state} NOT IN ('complete', 'cancelled')
    )`
  )
);

/**
 * The shared-form attempt found no identity row or no existing authority, so a
 * user row and/or a workspace must be minted — writes, which need the exclusive
 * form and a transaction that is not READ ONLY. Thrown to
 * roll the shared transaction back; `ensureUserWorkspace` retries in a fresh
 * one. Never escapes this module.
 */
class BootstrapNeedsMintSignal extends Error {
  constructor() {
    super("bootstrap: no existing authority under the shared lock; mint in a fresh exclusive transaction");
    this.name = "BootstrapNeedsMintSignal";
  }
}

/**
 * Inner body, exported so tests can prove transactional atomicity (forced-failure rollback).
 *
 * `lockMode` (audit Phase 8, P8-A3, R-177): `"exclusive"` — the default, and
 * the only form that may MINT — is the whole bootstrap as before. `"shared"` is
 * the NO-MINT path every product page runs (`app/(product)/layout.tsx`): it
 * takes the identity and workspace graph locks in the shared form, so a page
 * render no longer queues behind a money path that holds the workspace lock
 * across Stripe HTTP. It WRITES NOTHING (it looks the identity up rather than
 * inserting it), so `ensureUserWorkspace` runs it READ ONLY under the render
 * budget; with no identity row or no existing authority it throws
 * `BootstrapNeedsMintSignal` instead of minting. It NEVER upgrades in place:
 * holding the shared form and then asking for the exclusive one is the
 * deadlock P8-A1's guard refuses (`LockOrderError`, reason "upgrade"), so the
 * mint runs in a fresh transaction that takes the exclusive form from the start.
 */
export async function bootstrapInTx(
  tx: TxLike,
  params: BootstrapParams,
  lockMode: MembershipLockMode = "exclusive"
): Promise<BootstrapResult> {
  // THE SHARED ATTEMPT WRITES NOTHING (gate M2): it runs READ ONLY under the
  // render budget, so it LOOKS the identity up instead of inserting it. No row
  // means a first login, which is a mint: signal, and the fresh exclusive
  // transaction inserts it.
  if (lockMode === "shared") {
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.authUserId, params.authUserId));
    if (!existing) throw new BootstrapNeedsMintSignal();
  }
  const inserted =
    lockMode === "shared"
      ? []
      : await tx
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
  await lockIdentityMembershipGraph(tx, user.id, lockMode);
  await assertIdentityAcceptsMembership(tx, user.id);

  const candidateWorkspaces = await tx
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.lifecycleState, "active"),
        existingAuthorityWorkspace
      )
    );

  // Lock every initially eligible workspace in the global lexical order, then
  // choose again. A deletion that won before a workspace lock is therefore
  // observed rather than turning the oldest tombstoned membership into a
  // bootstrap failure or an accidental resurrection.
  for (const workspaceId of sortedWorkspaceIds(
    candidateWorkspaces.map((candidate) => candidate.workspaceId)
  )) {
    await lockWorkspaceMembershipGraph(tx, workspaceId, lockMode);
  }

  const [existingAuthority] = await tx
    .select({ membership: memberships, workspace: workspaces })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.lifecycleState, "active"),
        existingAuthorityWorkspace
      )
    )
    // An ACTIVE workspace first, then the oldest membership: an identity that
    // holds one active and one pending-deletion workspace is shown the active
    // one, matching `withWorkspace`'s read grade.
    .orderBy(
      sql`CASE WHEN ${workspaces.lifecycleState} = 'active' THEN 0 ELSE 1 END`,
      asc(memberships.createdAt),
      asc(memberships.id)
    )
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

  if (lockMode === "shared") throw new BootstrapNeedsMintSignal();

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

/**
 * Idempotent: any number of calls yields exactly one personal workspace.
 *
 * Two transactions at most (P8-A3): the shared-form no-mint read — READ ONLY
 * and bounded at `RENDER_LOCK_TIMEOUT_MS` (gate M2) — which is every call
 * after the first; and, only when it found no identity row or no authority, a
 * fresh exclusive, unbounded transaction that re-decides from scratch and
 * mints. The retry
 * re-runs every check, so a concurrent first login or a deletion that won in
 * between is observed rather than assumed.
 */
export async function ensureUserWorkspace(
  db: DbLike,
  params: BootstrapParams
): Promise<BootstrapResult> {
  try {
    // BOUNDED (gate M2): READ ONLY with `lock_timeout = 5000` when handed the
    // pool, so a page's first lock cannot queue without limit behind a
    // deletion writer that is itself queued behind a webhook's shared hold —
    // it refuses with `RenderLockTimeoutError` instead. The mint below is a
    // write and is NEVER bounded.
    return await boundedReadOrJoin(db, (tx) => bootstrapInTx(tx, params, "shared"));
  } catch (error) {
    if (!(error instanceof BootstrapNeedsMintSignal)) throw error;
  }
  return db.transaction((tx) => bootstrapInTx(tx, params, "exclusive"));
}
