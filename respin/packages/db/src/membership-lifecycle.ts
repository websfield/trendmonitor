import { and, eq, inArray, sql } from "drizzle-orm";
import { creatorProfiles } from "./brain-schema";
import type { DbLike, TxLike } from "./db-like";
import { memberships, users, workspaces } from "./schema";
import type { MembershipRole } from "./schema";

export type ActiveMembershipAuthority = Readonly<{
  membershipId: string;
  role: MembershipRole;
  version: number;
  workspaceLifecycleVersion: number;
}>;

export type ActiveProfileAuthority = ActiveMembershipAuthority & Readonly<{
  profileLifecycleVersion: number;
}>;

export function assertFreshWorkspaceAuthority(
  authority: ActiveMembershipAuthority,
  epoch: Readonly<{ membershipVersion: number; workspaceLifecycleVersion: number }>
): void {
  if (
    authority.version !== epoch.membershipVersion ||
    authority.workspaceLifecycleVersion !== epoch.workspaceLifecycleVersion
  ) {
    refuse("scope_stale");
  }
}

export function assertFreshProfileAuthority(
  authority: ActiveProfileAuthority,
  epoch: Readonly<{
    membershipVersion: number;
    workspaceLifecycleVersion: number;
    profileLifecycleVersion: number;
  }>
): void {
  assertFreshWorkspaceAuthority(authority, epoch);
  if (authority.profileLifecycleVersion !== epoch.profileLifecycleVersion) {
    refuse("scope_stale");
  }
}

function refuse(code: string): never {
  throw new Error(`lifecycle_refused:${code}`);
}

/** The sole identity-side transaction lock in the membership protocol. */
export async function lockIdentityMembershipGraph(
  tx: TxLike,
  userId: string
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`identity-membership:${userId}`}, 0))`
  );
}

/** The sole workspace-side transaction lock in the membership protocol. */
export async function lockWorkspaceMembershipGraph(
  tx: TxLike,
  workspaceId: string
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-membership:${workspaceId}`}, 0))`
  );
}

export function sortedWorkspaceIds(workspaceIds: readonly string[]): readonly string[] {
  return [...new Set(workspaceIds)].sort((left, right) => left.localeCompare(right));
}

/**
 * Authority seam for invite acceptance, workspace creation, role mutation,
 * leave/remove/transfer, and deletion. The callback executes only after the
 * identity lock and every sorted workspace lock are held in this transaction.
 */
export async function withMembershipGraphLocks<T>(
  tx: TxLike,
  userId: string,
  workspaceIds: readonly string[],
  mutate: () => Promise<T>
): Promise<T> {
  await lockIdentityMembershipGraph(tx, userId);
  for (const workspaceId of sortedWorkspaceIds(workspaceIds)) {
    await lockWorkspaceMembershipGraph(tx, workspaceId);
  }
  return mutate();
}

export async function assertIdentityAcceptsMembership(
  tx: TxLike,
  userId: string
): Promise<void> {
  const [identity] = await tx
    .select({ state: users.lifecycleState })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!identity || identity.state !== "active") refuse("identity_not_active");
}

export async function assertWorkspaceAcceptsMembership(
  tx: TxLike,
  workspaceId: string
): Promise<void> {
  if (!(await workspaceAcceptsMembership(tx, workspaceId))) {
    refuse("workspace_not_active");
  }
}

/** Non-throwing form for claim owners that must retire safe local work. */
export async function workspaceAcceptsMembership(
  tx: TxLike,
  workspaceId: string
): Promise<boolean> {
  const [workspace] = await tx
    .select({ state: workspaces.lifecycleState })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return workspace?.state === "active";
}

/** Central scope-mint/write fence for all current workspace capabilities. */
export async function assertWorkspaceLifecycleAccess(
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
        eq(workspaces.lifecycleState, "active")
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
  return row;
}

/** Central scope-mint/write fence for every non-tombstoned profile capability. */
export async function assertProfileLifecycleAccess(
  db: DbLike | TxLike,
  userId: string,
  workspaceId: string,
  profileId: string
): Promise<ActiveProfileAuthority> {
  const authority = await assertWorkspaceLifecycleAccess(db, userId, workspaceId);
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
 * Transactional write fence. The shared membership locks make the lifecycle
 * check and the caller's later mutation one serialised decision with deletion.
 */
export async function assertWorkspaceLifecycleTransactionAccess(
  tx: TxLike,
  userId: string,
  workspaceId: string
): Promise<ActiveMembershipAuthority> {
  return withMembershipGraphLocks(tx, userId, [workspaceId], () =>
    assertWorkspaceLifecycleAccess(tx, userId, workspaceId)
  );
}

/** Profile-grained form of the transactional write fence above. */
export async function assertProfileLifecycleTransactionAccess(
  tx: TxLike,
  userId: string,
  workspaceId: string,
  profileId: string
): Promise<ActiveProfileAuthority> {
  return withMembershipGraphLocks(tx, userId, [workspaceId], () =>
    assertProfileLifecycleAccess(tx, userId, workspaceId, profileId)
  );
}

/**
 * Sessionless worker fence for private profile work. It deliberately grants no
 * tenant authority: callers receive only an active/inactive answer after taking
 * the same workspace lock used by profile/workspace deletion.
 */
export async function isActiveProfileLifecycleForSystemInTx(
  tx: TxLike,
  workspaceId: string,
  profileId: string
): Promise<boolean> {
  await lockWorkspaceMembershipGraph(tx, workspaceId);
  const [row] = await tx
    .select({ profileId: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.id, creatorProfiles.workspaceId),
        eq(workspaces.lifecycleState, "active")
      )
    )
    .where(
      and(
        eq(creatorProfiles.id, profileId),
        eq(creatorProfiles.workspaceId, workspaceId),
        eq(creatorProfiles.state, "active")
      )
    )
    .limit(1);
  return row !== undefined;
}
