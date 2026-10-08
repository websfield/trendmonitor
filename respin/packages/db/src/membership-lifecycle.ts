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

/**
 * THE TWO FORMS OF THE MEMBERSHIP-GRAPH LOCK (audit Phase 8, P8-A3, R-177).
 *
 * `exclusive` is `pg_advisory_xact_lock`: the form a WRITER takes — invite
 * acceptance, workspace minting, role changes, deletion — because it changes
 * the membership graph and must exclude every reader of it. `shared` is
 * `pg_advisory_xact_lock_shared`: the form a READER takes — the lifecycle
 * fences behind every guarded accessor, bootstrap's no-mint path, the money
 * paths' membership half. Two shared holders proceed together; a shared holder
 * still excludes, and is excluded by, an exclusive writer, so a deletion
 * remains one serialised decision with every reader.
 *
 * Before Phase 8 every caller took the exclusive form, so the money paths that
 * hold this lock across Stripe HTTP (the webhook dispatcher, auto-top-up)
 * blocked every page render of the same workspace for the whole call.
 */
export type MembershipLockMode = "shared" | "exclusive";

/**
 * THE TRANSACTION-LOCAL LOCK LEDGER (P8-A1, R-177). Postgres knows which
 * advisory keys a backend holds, but not which of them are BILLING keys nor in
 * which order they were taken, so the order is recorded here, in two
 * `set_config(…, true)` settings that die with the transaction:
 *
 *  - `respin.membership_keys`: a JSON object, membership key → the strongest
 *    form this transaction holds it in; written by every membership-lock
 *    function in this file, read back by each.
 *  - `respin.billing_lock_held`: `on` once `takeWorkspaceLock` (or a successful
 *    `tryWorkspaceLock`) has run in this transaction (`@respin/credits`'
 *    `clock.ts`).
 *
 * `LOCAL` (the `true`), so a pooled connection's next transaction starts with
 * neither — the same discipline `withRenderTransaction`'s `lock_timeout` keeps.
 */
export const MEMBERSHIP_KEYS_SETTING = "respin.membership_keys";
export const BILLING_LOCK_HELD_SETTING = "respin.billing_lock_held";

/**
 * A membership-lock request that would break the one global lock order
 * (identity → workspace membership → billing; R-177). Thrown BEFORE the lock
 * statement runs, so a refused request never waits and never deadlocks: an
 * inversion is a loud error on the first test that drives it, not a `40P01`
 * under production load.
 *
 *  - `after_billing`: a membership key this transaction does not yet hold was
 *    requested after the billing lock. Take it before the billing lock (the
 *    ordered helper `takeWorkspaceLockInOrder` in `@respin/credits`).
 *  - `upgrade`: the exclusive form was requested on a key this transaction
 *    holds only shared. Two shared holders that both upgrade deadlock, so a
 *    writer takes the exclusive form from the start.
 */
export class LockOrderError extends Error {
  constructor(
    readonly key: string,
    readonly reason: "after_billing" | "upgrade"
  ) {
    super(
      reason === "after_billing"
        ? `lock order: the membership lock ${key} was requested after the billing lock; take it before takeWorkspaceLock (identity, then workspace membership, then billing)`
        : `lock order: the exclusive membership lock ${key} was requested while this transaction holds it shared; a writer takes the exclusive form from the start`
    );
    this.name = "LockOrderError";
  }
}

type HeldKeys = Record<string, MembershipLockMode>;

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  // node-postgres and PGlite surface `{ rows }`; a test double may return [].
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function parseHeldKeys(raw: unknown): HeldKeys {
  if (typeof raw !== "string" || raw === "") return {};
  const parsed = JSON.parse(raw) as unknown;
  const held: HeldKeys = {};
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, mode] of Object.entries(parsed as Record<string, unknown>)) {
      if (mode === "shared" || mode === "exclusive") held[key] = mode;
    }
  }
  return held;
}

/**
 * THE ONE ACQUISITION PATH for both membership-lock families. `keys` are taken
 * in the order given (the caller's order IS the protocol's order: identity,
 * then sorted workspaces). For each key:
 *
 *  - held in the same or a stronger form → no statement (re-entry; an xact
 *    advisory lock re-acquired by its own transaction is a no-op anyway);
 *  - held shared, exclusive requested → `LockOrderError("upgrade")`;
 *  - not held, billing already held → `LockOrderError("after_billing")`;
 *  - otherwise the lock statement, which records the key in the same
 *    statement.
 *
 * An exclusive request on a DIFFERENT key than a shared one held is not an
 * upgrade and, with billing not held, passes.
 */
async function acquireMembershipKeys(
  tx: TxLike,
  keys: readonly string[],
  mode: MembershipLockMode
): Promise<void> {
  const [state] = rowsOf(
    await tx.execute(
      sql`SELECT current_setting(${MEMBERSHIP_KEYS_SETTING}, true) AS keys, current_setting(${BILLING_LOCK_HELD_SETTING}, true) AS billing`
    )
  );
  const held = parseHeldKeys(state?.keys);
  const billingHeld = state?.billing === "on";
  for (const key of keys) {
    const current = held[key];
    if (current === "exclusive" || (current === "shared" && mode === "shared")) {
      continue;
    }
    if (current === "shared") throw new LockOrderError(key, "upgrade");
    if (billingHeld) throw new LockOrderError(key, "after_billing");
    held[key] = mode;
    const recorded = JSON.stringify(held);
    await tx.execute(
      mode === "shared"
        ? sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0)), set_config(${MEMBERSHIP_KEYS_SETTING}, ${recorded}, true)`
        : sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)), set_config(${MEMBERSHIP_KEYS_SETTING}, ${recorded}, true)`
    );
  }
}

const identityKey = (userId: string): string => `identity-membership:${userId}`;
const workspaceKey = (workspaceId: string): string =>
  `workspace-membership:${workspaceId}`;

/**
 * The sole identity-side transaction lock in the membership protocol.
 * `mode` defaults to `exclusive` (a writer); a reader passes `"shared"`.
 */
export async function lockIdentityMembershipGraph(
  tx: TxLike,
  userId: string,
  mode: MembershipLockMode = "exclusive"
): Promise<void> {
  await acquireMembershipKeys(tx, [identityKey(userId)], mode);
}

/**
 * The sole workspace-side transaction lock in the membership protocol.
 * `mode` defaults to `exclusive` (a writer); a reader passes `"shared"`.
 */
export async function lockWorkspaceMembershipGraph(
  tx: TxLike,
  workspaceId: string,
  mode: MembershipLockMode = "exclusive"
): Promise<void> {
  await acquireMembershipKeys(tx, [workspaceKey(workspaceId)], mode);
}

export function sortedWorkspaceIds(workspaceIds: readonly string[]): readonly string[] {
  return [...new Set(workspaceIds)].sort((left, right) => left.localeCompare(right));
}

/**
 * Authority seam for invite acceptance, workspace creation, role mutation,
 * leave/remove/transfer, and deletion (the `exclusive` default), and for the
 * lifecycle fences that only READ the graph (`"shared"`). The callback executes
 * only after the identity lock and every sorted workspace lock are held in
 * this transaction, in the form the caller asked for.
 */
export async function withMembershipGraphLocks<T>(
  tx: TxLike,
  userId: string,
  workspaceIds: readonly string[],
  mutate: () => Promise<T>,
  mode: MembershipLockMode = "exclusive"
): Promise<T> {
  await lockIdentityMembershipGraph(tx, userId, mode);
  for (const workspaceId of sortedWorkspaceIds(workspaceIds)) {
    await lockWorkspaceMembershipGraph(tx, workspaceId, mode);
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
 * Transactional LIFECYCLE fence — a READER of the membership graph, in front
 * of both guarded reads and guarded writes (the writes it fronts change
 * content, never membership). It takes the SHARED form (P8-A3: before Phase 8
 * this comment said "shared" above two exclusive locks), which makes the
 * lifecycle check and the caller's later work one serialised decision with
 * deletion, because deletion takes the exclusive form.
 *
 * WHAT CHANGED, SAID PLAINLY: two fences on one workspace no longer serialise
 * against each other. What a fence decides — "no deletion has won" — the
 * shared form still guarantees. A guarded write that ALSO needs mutual
 * exclusion with another guarded write takes its own lock or relies on a
 * unique index (`writeBrainDoc`: its per-profile advisory lock and the
 * `(profile_id, kind, version)` index). The Phase 8 tenancy gate (2026-10-07)
 * audited the guarded writes and reported none relying on the old exclusive
 * form — each has its own serialisation; the unit and Docker race suites run
 * green on the shared form.
 */
export async function assertWorkspaceLifecycleTransactionAccess(
  tx: TxLike,
  userId: string,
  workspaceId: string
): Promise<ActiveMembershipAuthority> {
  return withMembershipGraphLocks(
    tx,
    userId,
    [workspaceId],
    () => assertWorkspaceLifecycleAccess(tx, userId, workspaceId),
    "shared"
  );
}

/** Profile-grained form of the transactional write fence above. */
export async function assertProfileLifecycleTransactionAccess(
  tx: TxLike,
  userId: string,
  workspaceId: string,
  profileId: string
): Promise<ActiveProfileAuthority> {
  return withMembershipGraphLocks(
    tx,
    userId,
    [workspaceId],
    () => assertProfileLifecycleAccess(tx, userId, workspaceId, profileId),
    "shared"
  );
}

/**
 * Sessionless worker fence for private profile work. It deliberately grants no
 * tenant authority: callers receive only an active/inactive answer after taking
 * the workspace lock in the shared form, which still waits for (and excludes)
 * the exclusive form profile/workspace deletion takes.
 */
export async function isActiveProfileLifecycleForSystemInTx(
  tx: TxLike,
  workspaceId: string,
  profileId: string
): Promise<boolean> {
  await lockWorkspaceMembershipGraph(tx, workspaceId, "shared");
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
