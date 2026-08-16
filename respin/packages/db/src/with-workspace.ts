// T1 (respin-brain-tenancy): every query is workspace-scoped through THIS single
// helper; no raw table access from route handlers. THREE mechanisms, together —
// each named because it is asserted by a fixture in
// respin/tests/import-boundary.test.ts, and a cage's comment is worth exactly
// what enumerates it:
//   1. `no-restricted-imports` denies STATIC imports of the connection from
//      app/** — by package name AND by path spelling;
//   2. the dynamic-import source scan covers `await import(...)`, which
//      no-restricted-imports registers no handler for;
//   3. `@typescript-eslint/no-require-imports` (from the recommended config)
//      denies `require("@respin/db")`, which neither of the other two sees.
//      That third one was incidental and UNNAMED here until round 3 — the
//      comment claimed two mechanisms while a third was silently load-bearing.
// None alone makes the connection unreachable — say so rather than claim a
// property one rule lacks.
// Signature is verify-membership-
// then-scope, not derivation-only, so M2 multi-profile / M6 seats don't re-plumb
// every consumer (plan-review note).
import { desc, eq } from "drizzle-orm";
import type { DbLike } from "./db-like";
import { memberships, workspaces } from "./schema";
import type { Membership, MembershipRole, Workspace } from "./schema";
import { creditLedger, subscriptions } from "./billing-schema";
import type { CreditLedgerRow, Subscription } from "./billing-schema";

export class WorkspaceAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

declare const verifiedWorkspaceIdBrand: unique symbol;
/**
 * A workspace id that has passed membership verification (withWorkspace) or
 * the ONE sanctioned non-session resolution (the Stripe webhook's stored
 * customer→workspace mapping, via trustWorkspaceId). packages/credits' public
 * API accepts only this brand, so app code cannot hand it an arbitrary id.
 */
export type VerifiedWorkspaceId = string & {
  readonly [verifiedWorkspaceIdBrand]: true;
};

/**
 * Mint a VerifiedWorkspaceId WITHOUT session verification. Import-restricted
 * by the eslint allowlist to the Stripe webhook resolution files and tests —
 * everywhere else must go through withWorkspace.
 */
export function trustWorkspaceId(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

export type WorkspaceCtx = {
  authUserId: string;
  /** Explicit workspace selection; defaults to the user's sole workspace at M0. */
  workspaceId?: string;
};

/**
 * Ledger paging for the usage page (M1 phase 4). `limit` is CLAMPED rather
 * than trusted: the accessor is reachable from a server component whose caller
 * may pass a URL-derived page size, and an unbounded read of an append-only
 * table is a slow-loris waiting to happen.
 */
export type LedgerPage = { limit: number; offset?: number };
export const LEDGER_PAGE_MAX = 200;

/**
 * Clamp a caller-supplied page number into `[lo, hi]`, treating anything that
 * is not a finite number as absent.
 *
 * `Number.isFinite` FIRST, and that is the whole point: `Math.min(Math.max(1,
 * NaN), 200)` is `NaN`, drizzle drops a `NaN` LIMIT from the SQL entirely, and
 * the "clamped rather than trusted" comment above was therefore false for the
 * one input a URL produces most easily — `Number(searchParams.rows)` on absent
 * or garbage input is NaN, not a big number. Executed against 250 rows with a
 * 200 ceiling, `Number("abc")` returned the ENTIRE TABLE and raised nothing
 * (round-2 CHANGE 4). `Infinity` had the same shape and only survived because
 * `Math.min` happens to answer for it.
 */
function clampPageNumber(
  value: number | undefined,
  lo: number,
  hi: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(lo, Math.trunc(value)), hi);
}

export type WorkspaceScope = {
  workspaceId: VerifiedWorkspaceId;
  role: MembershipRole;
  /**
   * The scoped accessor map. The cross-workspace suite enumerates this object
   * programmatically (AC-7): an accessor added here without a breach validator
   * in the suite fails its completeness assertion.
   *
   * `subscription` and `ledger` are READ paths only. They deliberately do not
   * derive anything: balance has ONE authority (`deriveBalance` in
   * @respin/credits, non-negotiable 2) and billing state has one
   * (`getWorkspaceBillingState`). The usage page renders rows from here and the
   * balance from there — it never adds up the deltas itself.
   */
  accessors: {
    workspace: () => Promise<Workspace[]>;
    members: () => Promise<Membership[]>;
    subscription: () => Promise<Subscription[]>;
    ledger: (page: LedgerPage) => Promise<CreditLedgerRow[]>;
  };
};

export async function withWorkspace(
  db: DbLike,
  ctx: WorkspaceCtx
): Promise<WorkspaceScope> {
  const user = await db.query.users.findFirst({
    where: (u, { eq: eqOp }) => eqOp(u.authUserId, ctx.authUserId),
  });
  if (!user) {
    throw new WorkspaceAccessError(
      "withWorkspace: unknown user — bootstrap has not run for this identity"
    );
  }

  const userMemberships = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id));

  let membership: Membership | undefined;
  if (ctx.workspaceId !== undefined) {
    // Verify-then-scope: an explicit workspace id is honored ONLY via membership.
    membership = userMemberships.find((m) => m.workspaceId === ctx.workspaceId);
    if (!membership) {
      throw new WorkspaceAccessError(
        "withWorkspace: not a member of the requested workspace"
      );
    }
  } else if (userMemberships.length === 1) {
    membership = userMemberships[0];
  } else if (userMemberships.length === 0) {
    throw new WorkspaceAccessError(
      "withWorkspace: user has no workspace — run ensureUserWorkspace first"
    );
  } else {
    throw new WorkspaceAccessError(
      "withWorkspace: user belongs to multiple workspaces — an explicit workspaceId is required"
    );
  }

  // Membership verified above — this is the sanctioned session-side mint.
  const workspaceId = membership.workspaceId as VerifiedWorkspaceId;
  return {
    workspaceId,
    role: membership.role,
    accessors: {
      workspace: () =>
        db.select().from(workspaces).where(eq(workspaces.id, workspaceId)),
      members: () =>
        db
          .select()
          .from(memberships)
          .where(eq(memberships.workspaceId, workspaceId)),
      subscription: () =>
        db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.workspaceId, workspaceId))
          .limit(1),
      // Newest first, `id` as the tie-break so a page boundary is stable when
      // two rows share a microsecond (the same shape foldLedger sorts by,
      // reversed — this is DISPLAY order, never allocation order).
      ledger: (page: LedgerPage) =>
        db
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.workspaceId, workspaceId))
          .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
          .limit(clampPageNumber(page.limit, 1, LEDGER_PAGE_MAX, 1))
          .offset(
            clampPageNumber(page.offset, 0, Number.MAX_SAFE_INTEGER, 0)
          ),
    },
  };
}
