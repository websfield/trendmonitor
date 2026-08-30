// Creator-profile creation — the ENTITLEMENT decision (slice 1, R-30.2).
//
// WHY THIS IS IN `packages/credits` AND NOT IN `packages/db`, stated where the
// next person will look for it (R-30 binding constraint 2):
//
//   The cap is the active config document's `profileCaps` for the workspace's
//   RESOLVED TIER. Config lives in `@respin/config`; the tier has exactly one
//   authority, `getWorkspaceBillingState` in this package. `@respin/db` depends
//   on neither and cannot be made to: `@respin/credits` already depends on
//   `@respin/db`, so the edge only runs one way. Re-deriving the tier inside
//   `packages/db` would create a SECOND tier authority — the defect class
//   behind two M1 round-6 findings — and the cheap version of that mistake
//   ("a subscriptions row exists, so they're paid") would hand Studio's five
//   profiles to an `incomplete` subscription that has never collected a cent.
//
// So the split is: `@respin/db` owns the INSERT and the COUNT (both scope-caged
// write capabilities, both denied to `app/**`); this file owns the decision.
// `respin/tests/profile-cage.test.ts` asserts this function is the capability's
// only call site, so the decision cannot be routed around. (The path was wrong
// here until the 2026-08-27 tenancy gate followed it: there is no
// `packages/db/tests/profile-cage.test.ts`, and a reader chasing the cap's own
// guarantee found nothing.)
//
// The package is "credits" rather than "billing" only by name. A per-tier
// profile allowance IS a billing entitlement — the same kind of thing as a
// monthly credit allowance — so it belongs beside the tier that grants it.
import type { DbLike } from "@respin/db";
import {
  ProfileCapError,
  ProfileRoleError,
  WorkspacePausedError,
  hasOpenPause,
  workspaceWriteCapabilities,
  assertScoped,
  type CreatorProfile,
  type WorkspaceScope,
} from "@respin/db";
import { getActiveConfig } from "@respin/config";
import { getWorkspaceBillingState } from "./state";
import { assertWriteClock, takeWorkspaceLock } from "./clock";

/**
 * Create a creator profile, or refuse by name.
 *
 * THE ORDER IS THE REQUIREMENT, and each step is here because skipping it
 * fails differently:
 *
 *  1. `assertScoped` FIRST, before any field of `scope` is read. The scope is
 *     the only thing standing between a caller and a workspace id, and
 *     `Object.assign({}, viewerScope, {role: "owner"})` compiles at exit 0 —
 *     that exact forgery reached `assertOwner` as an owner before the cage was
 *     exported (see `assertScoped`'s docblock).
 *  2. The ROLE gate, before touching the database. A `viewer` may read a
 *     workspace; spending a slice of its paid allowance is not a read.
 *  3. The workspace ADVISORY LOCK, before anything the decision depends on.
 *     The cap is a read-then-write with no unique index to fall back on:
 *     `creator_profiles` has no constraint expressing "at most N per
 *     workspace", and one cannot be written, because N lives in a config
 *     document and moves. Two connections at the cap boundary would otherwise
 *     both count `cap - 1` and both insert.
 *
 *     REUSING `takeWorkspaceLock` RATHER THAN A SECOND KEY IS DELIBERATE. It is
 *     the same workspace grain the ledger serialises on, so profile creation and
 *     a concurrent debit take ONE lock in ONE order. A second key over the same
 *     grain would be a second lock order, which is how a deadlock is written —
 *     and slice 2a's G-17 has to record a lock ordering (workspace before
 *     brain) that only exists if the workspace key is singular.
 *  4. The PAUSE gate, inside the lock. See below for why it refuses.
 *  5. Tier, cap, count, insert — all inside the same lock and the same
 *     transaction, so the count the decision used is the count the insert lands
 *     against.
 *
 * `at` is a parameter rather than a `new Date()` inside, for the reason every
 * other dated operation in this package takes one: a function that reads the
 * clock itself cannot be tested at a boundary.
 */
export async function createProfile(
  db: DbLike,
  scope: WorkspaceScope,
  displayName: string,
  at: Date
): Promise<CreatorProfile> {
  assertScoped(scope);
  if (scope.role === "viewer") throw new ProfileRoleError("create a creator profile", scope.role);

  return db.transaction(async (tx) => {
    await takeWorkspaceLock(tx, scope.workspaceId);
    // THE WRITE CLOCK, for the reason every sibling allocating write in this
    // package takes it (`ledger.ts`, `pause.ts`) — and this one needs it more
    // than the comment above once implied. `at` DECIDES THE TIER:
    // `getWorkspaceBillingState` compares `graceExpiresAt > at`, so a stale
    // past `at` resolves an EXPIRED grace period back to the paid tier and
    // hands out its higher `profileCaps`. Not reachable from the app today —
    // the facade passes `new Date()` — but `createProfile` is exported to every
    // in-repo caller, which is exactly the landmine-armed-for-the-next-caller
    // shape `mayChargeOffSession` was fixed for (billing gate, 2026-08-27).
    await assertWriteClock(tx, scope.workspaceId, at);

    // AN OPEN PAUSE REFUSES (R4, decided and recorded — `decisions.md` R-35).
    //
    // The question the plan asks is whether creating a profile is an
    // entitlement spend, and the answer follows from what the cap IS: the
    // per-tier profile allowance is an entitlement, exactly like the monthly
    // credit allowance, and REQ-G08 freezes entitlements for the duration of a
    // pause. Refusing here loses the creator nothing — no work is discarded and
    // the profile can be created the moment they resume — which is precisely
    // the test `writeBrainDoc` and `appendOnboardingInput` are split on: that
    // one refuses because a brain write is an entitlement, this one refuses for
    // the same reason, and pasting one's own text still does not, because
    // refusing THAT would throw away something the person typed.
    if (await hasOpenPause(tx, scope.workspaceId)) {
      throw new WorkspacePausedError();
    }

    // THE ONE TIER AUTHORITY. `state.ts` resolves it from the subscription
    // mirror × the active config's `stripePriceMap`, and answers `free` for an
    // `incomplete` subscription that has never collected a payment.
    const billing = await getWorkspaceBillingState(tx, scope.workspaceId, at);
    // The STORED config document, read in the same transaction as the count it
    // prices, so a config append committing mid-decision cannot move the cap
    // between the read and the insert.
    const { content } = await getActiveConfig(tx);
    const cap = content.profileCaps[billing.tier];

    const caps = workspaceWriteCapabilities(scope);
    const existing = await caps.countActiveProfiles(tx);
    if (existing >= cap) {
      throw new ProfileCapError(billing.tier, cap, existing);
    }
    return caps.createProfile({ displayName }, tx);
  });
}
