import { and, eq, sql } from "drizzle-orm";
import { ProfileAccessError } from "./errors";
import {
  creatorProfiles,
  membershipProfileSelections,
  type CreatorProfile,
} from "./brain-schema";
import { memberships } from "./schema";
import {
  assertFreshWorkspaceAuthority,
  assertProfileLifecycleTransactionAccess,
  assertWorkspaceLifecycleTransactionAccess,
} from "./membership-lifecycle";
import { assertWorkspaceReadTransactionAccess } from "./read-grade-lifecycle";
import { boundedReadOrJoin } from "./render-transaction";
import {
  assertReadScoped,
  assertScoped,
  isReadGradeScope,
  type ReadGradeWorkspaceScope,
  type WorkspaceScope,
} from "./with-workspace";
import type { DbLike, TxLike } from "./db-like";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const profileProjection = {
  id: creatorProfiles.id,
  workspaceId: creatorProfiles.workspaceId,
  displayName: creatorProfiles.displayName,
  state: creatorProfiles.state,
  createdAt: creatorProfiles.createdAt,
  updatedAt: creatorProfiles.updatedAt,
  lifecycleVersion: creatorProfiles.lifecycleVersion,
};

/**
 * Read this member's selected ACTIVE profile.
 *
 * No row, a deleted row, or a now-archived profile all mean `null`. There is
 * deliberately no `creatorProfiles[0]` fallback: a multi-profile membership
 * without an explicit selection is ambiguous and must stay so.
 */
export async function selectedProfileForMember(
  db: DbLike | TxLike,
  scope: WorkspaceScope | ReadGradeWorkspaceScope
): Promise<CreatorProfile | null> {
  // A READER, so it takes either grade (R-163, fence 7): under a read-grade
  // scope the direct lifecycle check is the read sibling — same locks, same
  // epoch check, the tombstoned-but-readable workspace admitted.
  assertReadScoped(scope);
  const lifecycleCheck = isReadGradeScope(scope)
    ? assertWorkspaceReadTransactionAccess
    : assertWorkspaceLifecycleTransactionAccess;
  const read = async (tx: TxLike): Promise<CreatorProfile | null> => {
    const authority = await lifecycleCheck(
      tx,
      scope.userId as string,
      scope.workspaceId as string
    );
    assertFreshWorkspaceAuthority(authority, scope);
    const [profile] = await tx
      .select(profileProjection)
      .from(membershipProfileSelections)
      .innerJoin(
        creatorProfiles,
        and(
          eq(creatorProfiles.id, membershipProfileSelections.profileId),
          eq(
            creatorProfiles.workspaceId,
            membershipProfileSelections.workspaceId
          ),
          eq(creatorProfiles.state, "active")
        )
      )
      .where(
        and(
          eq(membershipProfileSelections.userId, scope.userId),
          eq(membershipProfileSelections.workspaceId, scope.workspaceId)
        )
      )
      .limit(1);
    return profile ?? null;
  };
  // BOUNDED on the pool (gate M2): READ ONLY, `lock_timeout = 5000`; joined
  // unbounded when handed the caller's transaction.
  return boundedReadOrJoin(db, read);
}

/**
 * Transaction-composable selection authority.
 *
 * The eligibility query starts from the acting member and joins the requested
 * ACTIVE profile through the same workspace. Its profile row lock prevents a
 * concurrent archive from committing between that proof and the upsert. The
 * selection id is the membership's uuid-v7 id: stable across changes, and it
 * lets migration backfill preserve the project's uuid-v7 table-id convention
 * without requiring a database UUID generator.
 */
export async function selectActiveProfileInTx(
  tx: TxLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<CreatorProfile> {
  assertScoped(scope);
  if (!UUID_RE.test(profileId)) throw new ProfileAccessError();
  const authority = await assertProfileLifecycleTransactionAccess(
    tx,
    scope.userId as string,
    scope.workspaceId as string,
    profileId
  ).catch(() => {
    throw new ProfileAccessError();
  });
  assertFreshWorkspaceAuthority(authority, scope);

  const [eligible] = await tx
    .select({ membershipId: memberships.id, ...profileProjection })
    .from(memberships)
    .innerJoin(
      creatorProfiles,
      and(
        eq(creatorProfiles.id, profileId),
        eq(creatorProfiles.workspaceId, memberships.workspaceId),
        eq(creatorProfiles.state, "active")
      )
    )
    .where(
      and(
        eq(memberships.userId, scope.userId),
        eq(memberships.workspaceId, scope.workspaceId),
        eq(memberships.lifecycleState, "active")
      )
    )
    .limit(1)
    .for("update", { of: creatorProfiles });

  if (!eligible) throw new ProfileAccessError();

  await tx
    .insert(membershipProfileSelections)
    .values({
      id: eligible.membershipId,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      profileId: eligible.id,
    })
    .onConflictDoUpdate({
      target: [
        membershipProfileSelections.userId,
        membershipProfileSelections.workspaceId,
      ],
      set: {
        profileId: eligible.id,
        updatedAt: sql`clock_timestamp()`,
      },
    });

  return {
    id: eligible.id,
    workspaceId: eligible.workspaceId,
    displayName: eligible.displayName,
    state: eligible.state,
    createdAt: eligible.createdAt,
    updatedAt: eligible.updatedAt,
    lifecycleVersion: eligible.lifecycleVersion,
  };
}

/** Select an existing active profile in one transaction. */
export async function selectActiveProfile(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<CreatorProfile> {
  assertScoped(scope);
  return db.transaction((tx) => selectActiveProfileInTx(tx, scope, profileId));
}
