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
//
// ---------------------------------------------------------------------------
// M2a (2026-08-21): THE SCOPES ARE CLASSES, AND WHY EACH GUARD IS HERE
//
// The M2 plan gate ran five rounds against this design. Every guard below is
// here because a reviewer COMPILED or RAN the thing it stops — none of them is
// defence-in-depth reasoning, and the list of what does NOT work is as
// load-bearing as the list of what does:
//
//   `readonly #cage` + all-`readonly` fields  kill the two COMPILE-time forges:
//       `{...scope, profileId: other}`   TS2741 (private field missing)
//       `scope.profileId = other`        TS2540 (readonly)
//     A `declare const … : unique symbol` BRAND does neither: it has no runtime
//     existence, and object spread copies symbol keys — three cast-free forges
//     compiled at exit 0 against the branded version.
//
//   `private constructor` + `static mint`     kill `extends` (TS2675) and
//     `new ProfileScope(...)` (TS2673). BOTH ERASE AT RUNTIME, which is why
//     they are not the real check.
//
//   The module-private MINT TOKEN is THE check. `Reflect.construct(P, args)`
//     defaults newTarget to the target, so `new.target === ProfileScope` and a
//     `new.target`-only guard PASSES it — measured, in the round that labelled
//     that mutation and watched it stay green. `Reflect.construct`,
//     `new (P as any)(...)` and a runtime subclass all reach the constructor
//     and all REGISTER in the cage, so neither the WeakSet nor `#cage in x`
//     sees them. Only a token they cannot obtain does.
//     It is a module-level `const`, NOT a `private static` field: `private`
//     erases, so `(ProfileScope as any).TOKEN` would hand a forger the token.
//
//   The WeakSet catches what has no constructor call at all — `Object.assign`
//     (whose declared return type is an intersection satisfying `#cage` while
//     the runtime value has no private field), `{} as ProfileScope`, and a
//     `Proxy` (a different object identity). `instanceof` accepts both the
//     subclass and the Proxy; `#cage in x` accepts the subclass. Measured.
//
//   `new.target` stays as a second line, cheap and honest about its limits.
//
//   The cage lives on `globalThis[Symbol.for("respin.scope.cage")]` so a
//   duplicated module graph — `vi.resetModules()`, or a second Next server
//   bundle — does not silently produce two WeakSets and reject real scopes.
// ---------------------------------------------------------------------------
import { z } from "zod";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import { memberships, workspaces } from "./schema";
import type { Membership, MembershipRole, Workspace } from "./schema";
import { creditLedger, subscriptions } from "./billing-schema";
import type { CreditLedgerRow, Subscription } from "./billing-schema";
import { brainDocs, creatorProfiles } from "./brain-schema";
import type { BrainDoc, BrainKind, CreatorProfile } from "./brain-schema";
import { modelUsage, onboardingInputs } from "./onboarding-schema";
import type {
  CostState,
  InputClass,
  ModelUsageRow,
  OnboardingInput,
  ResolvedTier,
} from "./onboarding-schema";
import { hasOpenPause } from "./pause";
import {
  CHECK,
  enumerateClaimFields,
  parseBrainContent,
  readPointer,
} from "./brain-content";
import {
  assertNoReferenceEcho,
  assertReferenceQuoteBudget,
  type ReferenceInput,
  type ReferenceQuoteSpan,
} from "./echo";
import {
  renderBrainReason,
  type BrainDocReason,
  type BrainReasonFacts,
} from "./brain-reason";
import {
  BrainRoleError,
  ProfileAccessError,
  ProvenanceError,
  ScopeForgeryError,
  UsageRawError,
  WorkspacePausedError,
} from "./errors";

export {
  BrainRoleError,
  ProfileAccessError,
  ProvenanceError,
  ScopeForgeryError,
  UsageRawError,
  WorkspacePausedError,
} from "./errors";

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

declare const verifiedProfileIdBrand: unique symbol;
/**
 * A creator-profile id that has been verified to belong to a scope's workspace.
 *
 * There is NO `trustProfileId`, under any name, and there never will be: the
 * workspace brand needed an escape hatch because a Stripe webhook arrives with
 * no session, and nothing analogous exists for a profile. A mint importable
 * from any `packages/<name>/src` would be that hatch under another name, so
 * `tests/import-boundary.test.ts` scans for one.
 *
 * The brand alone is NOT the guard — `raw as VerifiedProfileId` compiles at
 * exit 0, which is why the ids only ever leave `ProfileScope.mint`, the write
 * capabilities never accept an id at all, and the cast is caught by the lint
 * scan rather than by the type system.
 */
export type VerifiedProfileId = string & {
  readonly [verifiedProfileIdBrand]: true;
};

declare const verifiedUserIdBrand: unique symbol;
/**
 * The id of the user whose SESSION this scope was minted from (C-13).
 *
 * It exists so that `confirmed_by` can be SERVER-DERIVED. Round 1 found it
 * forgeable as a parameter: a capability taking `confirmedBy` lets any caller
 * name anyone as the person who confirmed a brain document, and a confirmation
 * is the record that a human saw a claim about themselves — an attributable
 * act, so an attributable id. The brand carries no authority of its own; what
 * makes it trustworthy is that the only value ever branded is the `users.id`
 * `withWorkspace` read off the verified membership row.
 */
export type VerifiedUserId = string & {
  readonly [verifiedUserIdBrand]: true;
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

// ---------------------------------------------------------------- the cage

const PROFILE_CAGE_KEY = Symbol.for("respin.scope.cage.profile");
const WORKSPACE_CAGE_KEY = Symbol.for("respin.scope.cage.workspace");

/**
 * The registries of scopes THIS module minted, keyed off `globalThis` so a
 * duplicated module graph shares them (AC-19). A module-local `new WeakSet()`
 * would make every scope minted before a `vi.resetModules()` — or by the other
 * copy of a doubly-bundled server — fail `assertScoped` for no reason a reader
 * could diagnose.
 *
 * TWO SETS, not one plus an `instanceof`. The obvious way to ask "is this a
 * ProfileScope specifically?" inside `writeCapabilities` is
 * `scope instanceof ProfileScope`, and it is wrong twice over: it accepts a
 * Proxy and a subclass (both measured), and — the reason it was caught — it
 * compares against THIS module copy's class object, so under the very module
 * duplication the globalThis key exists to survive, a genuinely minted scope is
 * refused. The AC-19 case found that one line after the key was introduced.
 * Set MEMBERSHIP answers the same question with none of those properties.
 */
function sharedCage(key: symbol): WeakSet<object> {
  const g = globalThis as unknown as Record<symbol, WeakSet<object> | undefined>;
  return (g[key] ??= new WeakSet<object>());
}
const profileCage = sharedCage(PROFILE_CAGE_KEY);
const workspaceCage = sharedCage(WORKSPACE_CAGE_KEY);

/**
 * A profile scope's database handle, held OUTSIDE the instance for the same
 * reason the cages are: a `#private` field is scoped to one class DECLARATION,
 * so under module duplication `writeCapabilities` from the second copy cannot
 * read a field the first copy wrote — it throws `TypeError: Cannot read
 * private member`, which the AC-19 case caught. A shared WeakMap has the same
 * "unreachable from outside this module" property without that failure mode.
 *
 * SAY WHAT THIS DOES NOT DEFEND AGAINST, since a cage's comment is worth
 * exactly what it enumerates.
 *
 * A WeakSet published on `globalThis` has a PUBLIC `add`, so any module in this
 * process can register a forgery. The tenancy gate proved the consequence by
 * running it (2026-08-23): a plain `{workspaceId, role: "owner", accessors: {}}`
 * added to the workspace registry passed `assertScoped` and reached
 * `assertOwner` AS AN OWNER. It needs no import, so every rule in
 * `eslint.config.mjs` is blind to it.
 *
 * AN EARLIER VERSION OF THIS COMMENT CALLED THAT ACCEPTABLE BECAUSE "app code
 * cannot run module-scope code". THAT WAS FALSE: a Next.js server action or
 * route module body is module-scope code in the same process. The correct
 * statement is narrower and is checkable:
 *
 *   Nothing can defend against arbitrary in-process module-scope execution — a
 *   registry two module copies can both reach is a registry anything else in
 *   the process can reach, by construction. That is the price of surviving
 *   module duplication, and there is no design that pays less.
 *
 *   So the threat model here is CODE IN THIS REPOSITORY, and repo code is
 *   gated: imports by eslint, and this shape — which needs no import — by the
 *   source scan in `respin/tests/import-boundary.test.ts` ("the cage registries
 *   are unreachable from product code"), which is red against a planted
 *   registration in both `app/**` and `packages/**`.
 *
 * What the cage itself stops, without help, is the reachable class of
 * forgeries: a spread, a cast, an Object.assign, a Proxy, a subclass, a
 * Reflect.construct.
 */
const SCOPE_DB_KEY = Symbol.for("respin.scope.db");
const scopeDb: WeakMap<object, DbLike | TxLike> = (() => {
  const g = globalThis as unknown as Record<
    symbol,
    WeakMap<object, DbLike | TxLike> | undefined
  >;
  return (g[SCOPE_DB_KEY] ??= new WeakMap<object, DbLike | TxLike>());
})();

/**
 * The mint token. A module-level const, so it is unreachable from outside this
 * file by any means: it is not a static field (`private` erases), it is never
 * stored on an instance, and it is never exported.
 */
const MINT: unique symbol = Symbol("respin.scope.mint");

/**
 * Assert that a value is a scope THIS module minted.
 *
 * Exported because the cage asserted only inside `writeCapabilities` leaves the
 * scope's EXISTING consumers structural: `Object.assign({}, viewerScope,
 * {role: "owner"})` compiles at exit 0 and reaches `assertOwner` in
 * @respin/credits — a viewer→owner escalation (REQ-A02) that packages/credits
 * could not have checked, because no assertion was exported.
 */
export function assertScoped(
  s: unknown
): asserts s is ProfileScope | WorkspaceScope {
  if (
    typeof s !== "object" ||
    s === null ||
    !(profileCage.has(s) || workspaceCage.has(s))
  ) {
    throw new ScopeForgeryError("This value");
  }
}

// ------------------------------------------------------------- the scopes

/**
 * The scoped accessor map. The cross-workspace suite enumerates it
 * programmatically: an accessor added here without a breach validator fails the
 * completeness assertion.
 *
 * `subscription` and `ledger` are READ paths only. They deliberately derive
 * nothing: balance has ONE authority (`deriveBalance` in @respin/credits,
 * non-negotiable 2) and billing state has one (`getWorkspaceBillingState`). The
 * usage page renders rows from here and the balance from there — it never adds
 * up the deltas itself. (This note lived on the old object-literal map and was
 * dropped when the accessors moved into the constructor; the invariant is
 * enforced by `packages/credits/tests/isolation.test.ts`, but losing the
 * statement of it was a real loss — billing gate 2026-08-23.)
 */
export type WorkspaceAccessors = {
  workspace: () => Promise<Workspace[]>;
  members: () => Promise<Membership[]>;
  subscription: () => Promise<Subscription[]>;
  ledger: (page: LedgerPage) => Promise<CreditLedgerRow[]>;
};

export class WorkspaceScope {
  // NOT `readonly #cage: true;` — that form is TS2564 (no initialiser under
  // strictPropertyInitialization). The field exists purely so that a spread of
  // an instance is TS2741 where a WorkspaceScope is required.
  readonly #cage = true;
  readonly workspaceId: VerifiedWorkspaceId;
  /** The REQ-A02 authority. `readonly`, so `scope.role = "owner"` is TS2540. */
  readonly role: MembershipRole;
  /** Whose session this is (C-13) — the only source `confirmed_by` may use. */
  readonly userId: VerifiedUserId;
  readonly accessors: WorkspaceAccessors;

  private constructor(
    token: symbol,
    db: DbLike,
    workspaceId: VerifiedWorkspaceId,
    role: MembershipRole,
    userId: VerifiedUserId
  ) {
    // THE check (see the header): a token nothing outside this module holds.
    if (token !== MINT) throw new ScopeForgeryError("A WorkspaceScope");
    // Defence in depth, and honest about its reach: Reflect.construct passes
    // this, a runtime subclass does not.
    if (new.target !== WorkspaceScope) {
      throw new ScopeForgeryError("A WorkspaceScope subclass");
    }
    this.workspaceId = workspaceId;
    this.role = role;
    this.userId = userId;
    this.accessors = {
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
          .offset(clampPageNumber(page.offset, 0, Number.MAX_SAFE_INTEGER, 0)),
    };
    workspaceCage.add(this);
  }

  /** The ONE session-side mint. Membership is verified by `withWorkspace`. */
  static mintVerified(
    db: DbLike,
    workspaceId: VerifiedWorkspaceId,
    role: MembershipRole,
    userId: VerifiedUserId
  ): WorkspaceScope {
    return new WorkspaceScope(MINT, db, workspaceId, role, userId);
  }

  /** Silences "declared but never read" for the cage field without exposing it. */
  toString(): string {
    return `WorkspaceScope(${this.workspaceId})${this.#cage ? "" : ""}`;
  }
}

export type ProfileAccessors = {
  profile: () => Promise<CreatorProfile[]>;
  brainDocs: () => Promise<BrainDoc[]>;
  activeBrainDocs: () => Promise<BrainDoc[]>;
  onboardingInputs: () => Promise<OnboardingInput[]>;
  modelUsage: () => Promise<ModelUsageRow[]>;
  /**
   * THE ONE REFERENCE CORPUS (C-29). Both R-3 bars take it; neither builds one.
   *
   * `ids` absent  → every `reference` input this profile has RIGHT NOW, and the
   *                 set of ids is returned so the caller can record it.
   * `ids` present → exactly those inputs, re-read. This is the activation
   *                 shape: activation judges a version against the corpus the
   *                 WRITE was judged against, not against a corpus rebuilt at
   *                 activation time.
   *
   * A corpus passed around as an array is a caller obligation; an accessor
   * makes it structural — the same reasoning C-19 used for `frameworks`. Two
   * builders of "which posts are somebody else's" is two answers to the
   * question the whole R-3 bar rests on.
   */
  referenceCorpusAsOf: (
    ids?: readonly string[],
    conn?: TxLike
  ) => Promise<{ ids: string[]; inputs: ReferenceInput[] }>;
};

/** Postgres would raise 22P02 on a non-uuid, which is an enumeration oracle. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProfileScope {
  readonly #cage = true;
  readonly workspaceId: VerifiedWorkspaceId;
  readonly profileId: VerifiedProfileId;
  /**
   * COPIED FROM THE WORKSPACE SCOPE AT MINT, never taken as a parameter (C-12).
   *
   * Round 2 found that `ProfileScope` carried no role at all, so a VIEWER could
   * confirm and activate a brain document — the two acts that decide what the
   * product believes about a creator. Deriving both here means there is no
   * argument for a caller to supply and therefore none to forge: the values
   * come off the membership row `withWorkspace` already verified.
   */
  readonly role: MembershipRole;
  readonly userId: VerifiedUserId;
  readonly accessors: ProfileAccessors;

  private constructor(
    token: symbol,
    db: DbLike | TxLike,
    workspaceId: VerifiedWorkspaceId,
    profileId: VerifiedProfileId,
    role: MembershipRole,
    userId: VerifiedUserId
  ) {
    if (token !== MINT) throw new ScopeForgeryError("A ProfileScope");
    if (new.target !== ProfileScope) {
      throw new ScopeForgeryError("A ProfileScope subclass");
    }
    this.workspaceId = workspaceId;
    this.profileId = profileId;
    this.role = role;
    this.userId = userId;
    scopeDb.set(this, db);
    // EVERY accessor filters on BOTH columns. The profile predicate alone is
    // wrong for a re-parented row; the workspace predicate alone is wrong for
    // a sibling profile. Both axes are asserted, per accessor, in
    // packages/db/tests/profile-scope.test.ts.
    const both = (t: { profileId: unknown; workspaceId: unknown }) =>
      and(
        eq(t.profileId as never, profileId),
        eq(t.workspaceId as never, workspaceId)
      );
    this.accessors = {
      profile: () =>
        db
          .select()
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              eq(creatorProfiles.workspaceId, workspaceId)
            )
          ),
      brainDocs: () => db.select().from(brainDocs).where(both(brainDocs)),
      activeBrainDocs: () =>
        db
          .select()
          .from(brainDocs)
          .where(and(both(brainDocs), eq(brainDocs.status, "active"))),
      onboardingInputs: () =>
        db.select().from(onboardingInputs).where(both(onboardingInputs)),
      modelUsage: () => db.select().from(modelUsage).where(both(modelUsage)),
      // `conn` EXISTS BECAUSE THE CALLER IS USUALLY INSIDE A TRANSACTION, and
      // that is not a detail: the scope closes over the pool, so reading the
      // corpus on the pool from inside an open transaction deadlocks outright
      // on a single-connection driver (measured on PGlite — every write test
      // hung for 30s). Passing the transaction in keeps C-29's "one accessor,
      // no second builder" intact; building a second query inside
      // `writeBrainDoc` to dodge the deadlock is exactly the two-corpora shape
      // C-29 removed.
      referenceCorpusAsOf: async (ids, conn) => {
        if (ids !== undefined && ids.length === 0) return { ids: [], inputs: [] };
        const rows = await (conn ?? db)
          .select({
            id: onboardingInputs.id,
            content: onboardingInputs.content,
          })
          .from(onboardingInputs)
          .where(
            and(
              both(onboardingInputs),
              eq(onboardingInputs.inputClass, "reference"),
              // `inArray` with an EMPTY array is the case to get right: it must
              // mean "no inputs", never "no predicate". Drizzle emits
              // `false` for an empty `inArray`, but relying on that silently is
              // how a corpus filter becomes a no-op, so the empty case returns
              // without a query at all.
              ...(ids === undefined
                ? []
                : [inArray(onboardingInputs.id, ids as string[])])
            )
          );
        // Sorted, so the recorded set is byte-stable for a given membership and
        // two writes with the same corpus record the same value.
        const found = rows.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
        return {
          ids: found.map((r) => r.id),
          inputs: found.map((r) => ({ id: r.id, content: r.content })),
        };
      },
    };
    profileCage.add(this);
  }

  /**
   * The ONLY route to a ProfileScope. Verifies the profile belongs to the
   * WORKSPACE the caller already holds a verified scope for — so the profile
   * id never has to be trusted, and there is no non-session variant.
   *
   * Every refusal raises the same `ProfileAccessError` with the same message:
   * foreign, nonexistent and malformed alike (P2). A malformed id is checked
   * HERE rather than left to Postgres, because a 22P02 "invalid input syntax
   * for type uuid" is a different observable from a clean refusal, and a
   * different observable is an oracle.
   */
  static async mint(
    db: DbLike | TxLike,
    scope: WorkspaceScope,
    profileId: string
  ): Promise<ProfileScope> {
    assertScoped(scope);
    if (!UUID_RE.test(profileId)) throw new ProfileAccessError();
    const [row] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.id, profileId),
          // THE WORKSPACE PREDICATE. Drop it and P1 goes red: a profile id
          // from any other workspace mints cleanly and every accessor below
          // then serves that workspace's rows.
          eq(creatorProfiles.workspaceId, scope.workspaceId)
        )
      )
      .limit(1);
    if (!row) throw new ProfileAccessError();
    return new ProfileScope(
      MINT,
      db,
      scope.workspaceId,
      profileId as VerifiedProfileId,
      // Off the WorkspaceScope, which got them off the verified membership row.
      scope.role,
      scope.userId
    );
  }

  toString(): string {
    return `ProfileScope(${this.profileId})${this.#cage ? "" : ""}`;
  }
}

// ------------------------------------------------------ write capabilities

/**
 * Columns a caller may NEVER supply, named ONCE.
 *
 * A DENYLIST failed twice for the same reason, which is why this list is the
 * complement of a hand-written allowlist rather than the guard itself: round 2
 * guarded the ids and missed `status` (so a non-literal carrying
 * `status: "active"` compiled — a SILENT brain activation, worse than the leak
 * the guard was written for), and round 3's named constant was still one field
 * short of `version`, which `tech-spec.md:66` makes load-bearing.
 *
 * Both halves are real: the input TYPES name only what a caller may supply,
 * and this list strips anything that arrives anyway at runtime.
 */
export const GUARDED_WRITE_FIELDS = [
  "id",
  "workspaceId",
  "profileId",
  "status",
  "version",
  "activatedAt",
  "supersededAt",
  "contentSha256",
  "createdAt",
  "updatedAt",
  // ---- migration 0012 (M2b-1). Five server-derived columns at once, which is
  // exactly the situation C-32's own rationale predicted a miss in.
  //
  // `referenceCorpusIds` IS THE ONE THE PLAN PREDICTED IT WOULD MISS, and did:
  // C-32's rationale reads that this hand-list "has missed exactly one field in
  // three consecutive rounds... the fourth miss is the likely one", and the
  // corpus id set was then introduced one decision over with no column, no
  // guard and no criterion. It decides WHICH corpus the R-3 echo bar runs
  // over, so a caller-suppliable value is a caller-suppliable bar — a caller
  // passing `[]` would turn the whole bar off for that version while every
  // test stayed green.
  //
  // The completeness test in `profile-scope.test.ts` is what makes this list
  // stop depending on somebody remembering: it enumerates the drizzle table's
  // own property space and fails on any column that is neither classified
  // caller-suppliable nor named here.
  "referenceCorpusIds",
  "confirmedAt",
  "confirmedBy",
  "confirmedContentSha256",
  "confirmedFields",
  "evidenceCounts",
] as const;

/**
 * Columns of `brain_docs` a caller legitimately supplies, named so that the
 * completeness test has a CLOSED classification rather than a denylist.
 *
 * Round 4 measured why this is in DRIZZLE PROPERTY SPACE and not snake_case:
 * `stripGuarded` deletes keys from the object handed to `.values()`, and
 * drizzle reads `evidenceCounts`, never `evidence_counts` — so a snake_case
 * entry guards a key drizzle never looks at while the camelCase one sails
 * through. Both the guard and its mutation would have been vacuous.
 */
export const CALLER_SUPPLIABLE_BRAIN_FIELDS = [
  "kind",
  "content",
  "sourceEvidence",
  "reason",
] as const;

/**
 * Applied to every capability input. Plain `Omit` does NOT prevent a foreign
 * id: excess-property checking fires only on fresh object literals, so
 * `declare const full: NewBrainDoc; caps.writeBrainDoc(full, tx)` compiled at
 * exit 0 against the Omit version. `?: never` rejects the non-literal while
 * every legitimate literal call still compiles.
 */
type NoServerFields = {
  [K in (typeof GUARDED_WRITE_FIELDS)[number]]?: never;
};

/**
 * One `source_evidence` entry (A-8), with a CLOSED key space.
 *
 * The tenancy gate stored an entry carrying `{"smuggled":"her home address is
 * 12 Acacia Ave"}` alongside a free-text `confidence` holding an invented
 * personal specific — because this object was written to jsonb verbatim and
 * `validateSourceEvidence` checked only `inputId`, the offsets and the quote.
 * `brain_docs` is export-included and feeds M3's prompt bundle, so an open key
 * space here is C-42's channel one column over, in the same row.
 *
 * `field` is C-28's half: an RFC-6901 pointer naming WHICH claim position this
 * entry is evidence FOR. Without it "per-field provenance (REQ-B02)" is
 * per-DOCUMENT provenance, and the cited-or-`[check]` rule is not expressible.
 *
 * `confidence` is GONE (C-15). It was a caller-supplied unvalidated string on
 * the row that carries provenance, and REQ-B02's "and a confidence level" is
 * withdrawn in `PRD.md` — a number that can exceed its evidence is the
 * authority-borrowing R-29 forbids.
 */
export type SourceEvidenceEntry = {
  /** RFC-6901 pointer to the claim position this evidence supports. */
  field: string;
  quote: string;
  inputId: string;
  startUtf16: number;
  endUtf16: number;
};

/**
 * The entry shape as a SCHEMA, so it goes through a closed funnel exactly as
 * `content` does. `strictObject` is the whole point: an unknown key is refused,
 * not stripped and not stored.
 */
const sourceEvidenceEntrySchema = z.strictObject({
  field: z.string(),
  quote: z.string(),
  inputId: z.string(),
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().nonnegative(),
});

/**
 * One confirmation record, through the same closed funnel — and it is here,
 * beside its sibling, so the pair is visible at once.
 *
 * THE FIELD WAS FIXED AND THE CLASS WAS LEFT OPEN, twelve lines apart, in one
 * pass. `source_evidence` was given a strict schema and a server-rebuilt array
 * because a getter on an entry swapped a 10-character quote for a 900-character
 * one after validation; `confirmed_fields` — added by the same migration,
 * validated in the same function, stored two statements later — kept taking the
 * caller's objects. The tenancy gate put a getter on the ARRAY (validation saw
 * `[]` and the loop passed trivially; the stored value was the full claim set
 * with every flag inverted) and on an ELEMENT (validation reads `pointer`
 * twice, so the third read won), then activated the document. Its key space was
 * open too: `{"smuggled":"her home address is 12 Acacia Ave"}` stored verbatim
 * on an export-included column.
 *
 * That is CLAUDE.md's 2026-07-30 lesson — fix the class, not the field — on the
 * fix for a finding that was itself that shape.
 */
const confirmedFieldEntrySchema = z.strictObject({
  pointer: z.string(),
  asPlaceholder: z.boolean(),
});

export type AppendOnboardingInputParams = {
  inputClass: InputClass;
  content: string;
  sourceUrl?: string;
} & NoServerFields;

export type RecordModelUsageParams = {
  attemptId: string;
  purpose: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usageRaw?: unknown;
  costMicroUsd?: bigint | null;
  costState: CostState;
  resolvedTier: ResolvedTier;
  stripePriceId?: string;
  promptBundleVersion: string;
  configVersion: number;
  outcome: ModelUsageRow["outcome"];
} & NoServerFields;

export type WriteBrainDocParams = {
  kind: BrainKind;
  content: unknown;
  // NO `| null`, and no empty array either — migration 0012 made the column
  // NOT NULL with a non-empty CHECK. `writeBrainDoc` refuses both by NAME
  // rather than letting the constraint surface as a raw 23502/23514, because a
  // constraint violation is not a refusal anyone can act on.
  sourceEvidence: SourceEvidenceEntry[];
  // A CODE, NOT A SENTENCE (C-42). `brain_docs.reason` is exported whole and
  // REQ-I03 binds "any output", so the stored text is rendered by the server
  // from this code plus facts it derived itself — see `brain-reason.ts` for
  // why the channel is removed rather than filtered.
  reason: BrainDocReason;
} & NoServerFields;

export type ConfirmBrainDocParams = {
  brainDocId: string;
  /** RFC-6901 pointers the human confirmed, and how (C-18). */
  confirmedFields: { pointer: string; asPlaceholder: boolean }[];
};

export type ActivateBrainDocParams = {
  brainDocId: string;
};

export type ProfileWriteCapabilities = {
  appendOnboardingInput: (
    input: AppendOnboardingInputParams
  ) => Promise<OnboardingInput>;
  recordModelUsage: (
    usage: RecordModelUsageParams,
    tx?: TxLike
  ) => Promise<ModelUsageRow>;
  writeBrainDoc: (doc: WriteBrainDocParams, tx: TxLike) => Promise<BrainDoc>;
  confirmBrainDocFields: (
    params: ConfirmBrainDocParams,
    tx: TxLike
  ) => Promise<BrainDoc>;
  activateBrainDoc: (
    params: ActivateBrainDocParams,
    tx: TxLike
  ) => Promise<BrainDoc>;
};

/**
 * Confirmation and activation are the two acts that decide what the product
 * BELIEVES about a creator, so they are owner/editor only (C-12).
 *
 * Round 2 found `ProfileScope` carried no role at all, which made a viewer able
 * to do both. The check is here rather than in each capability so that adding a
 * third such act cannot forget it.
 */
function assertMayDecide(role: MembershipRole, act: string): void {
  if (role === "viewer") throw new BrainRoleError(act, role);
}

/** Strip every server-derived field, whatever a cast smuggled in. */
function stripGuarded<T extends object>(input: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const key of GUARDED_WRITE_FIELDS) delete out[key];
  return out;
}

/**
 * Unicode NFC + CRLF→LF, applied at the ONE place content is stored (A-8).
 *
 * Offsets recorded in `brain_docs.source_evidence` are UTF-16 code units into
 * THIS value. Without a fixed unit and a fixed normalisation the offsets differ
 * on every emoji and shift on every textarea submission — green under ASCII
 * fixtures, wrong in production.
 */
function normaliseContent(raw: string): string {
  return raw.normalize("NFC").replace(/\r\n/g, "\n");
}

/**
 * The write surface. Deliberately NOT a property of the scope: a scope is
 * handed to `app/**` (as a type) and to @respin/credits, and a write method
 * living on the instance would travel with it. This function is denied to
 * `app/**` by the eslint allowlist, so holding a scope grants reads only.
 */
export function writeCapabilities(
  scope: ProfileScope
): ProfileWriteCapabilities {
  // Cage assertion FIRST — before any field of `scope` is read. Membership in
  // the PROFILE cage specifically, so a WorkspaceScope (genuinely minted, but
  // not a profile grain) cannot reach a profile write either.
  assertScoped(scope);
  if (!profileCage.has(scope)) {
    throw new ScopeForgeryError("A write-capability holder");
  }
  const db = scopeDb.get(scope);
  if (!db) throw new ScopeForgeryError("A write-capability holder");
  const ids = {
    profileId: scope.profileId as string,
    workspaceId: scope.workspaceId as string,
  };

  return {
    appendOnboardingInput: async (input) => {
      const content = normaliseContent(input.content);
      const [row] = await db
        .insert(onboardingInputs)
        // The strip runs FIRST and the ids spread LAST. Either alone would
        // hold; both are here because the P4 write-side mutation reverses the
        // spread order precisely to make the strip load-bearing — without that
        // mutation the strip is inert and untested.
        .values({
          ...(stripGuarded(input) as { inputClass: InputClass }),
          content,
          contentSha256: createHash("sha256")
            .update(Buffer.from(content, "utf8"))
            .digest("hex"),
          ...ids,
        })
        .returning();
      return row;
    },

    recordModelUsage: async (usage, tx) => {
      assertMeteringOnly(usage.usageRaw);
      const conn = tx ?? db;
      const [row] = await conn
        .insert(modelUsage)
        .values({
          ...(stripGuarded(usage) as { attemptId: string }),
          ...ids,
        } as never)
        .returning();
      return row;
    },

    writeBrainDoc: async (doc, tx) => {
      // REQ-G08: a brain write is an ENTITLEMENT, so it is refused while the
      // workspace is paused. `appendOnboardingInput` and `recordModelUsage`
      // deliberately are not (A-7): storing the creator's own submitted text
      // is not an entitlement and refusing it would silently discard their
      // work, and recording spend already incurred is the settlement tail.
      if (await hasOpenPause(tx, scope.workspaceId)) {
        throw new WorkspacePausedError();
      }
      // EVERY FIELD OF `doc` IS READ EXACTLY ONCE, HERE, INTO A LOCAL (C-40).
      //
      // `WriteBrainDocParams` is a plain object type, so a caller may hand in
      // one whose properties are GETTERS. Read a field twice — once to validate
      // and once to store — and the two reads can return different values, so
      // every guard below would pass on the first value while the second is
      // what lands in the table. That is not a hypothetical shape: the same
      // TOCTOU is why `parseBrainContent`'s return value is stored rather than
      // its input.
      const kind = doc.kind;
      const rawContent = doc.content;
      const sourceEvidence = doc.sourceEvidence;
      const reason = doc.reason;
      // THE SINGLE FUNNEL, ON THE ONLY LIVE BRAIN-WRITE SURFACE.
      //
      // Round 6 closed the `serverOwned` strip INSIDE `parseBrainContent` and
      // the mutation reddened — but `writeBrainDoc` never called
      // `parseBrainContent`, so on the one path that actually writes a brain
      // document a model-supplied value at a server-owned position was stored
      // unstripped and unvalidated. The same gap disarmed three further
      // controls on this path: content-schema validation, the claim
      // enumeration, and `WRITABLE_BRAIN_KINDS` — so R-10's "no performance
      // claim at n = 0" was not enforced where writes happen. A control that
      // runs only where nothing calls it is a test, not a guard.
      //
      // THE PARSE OUTPUT IS WHAT IS STORED, never `rawContent`: the strip
      // happens inside the parse, so storing the input would discard it.
      // REQ-B02 IS PER-FIELD PROVENANCE, so a version citing nothing records
      // nothing about where its claims came from — and the DB enforces that
      // with a non-empty CHECK. Refusing here means the creator reads a rule
      // instead of `violates check constraint
      // "brain_docs_source_evidence_non_empty"`.
      //
      // The interaction with C-28 is deliberate and is stated where a reader
      // will hit it: C-28 allows a claim position to be either cited or hold
      // `[check]`, so an ALL-PLACEHOLDER version has zero entries and lands
      // here. That version is not storable, on purpose — a row asserting
      // nothing still consumes a version number in an append-only history.
      if (!Array.isArray(sourceEvidence) || sourceEvidence.length === 0) {
        throw new ProvenanceError(
          "a brain version must cite at least one onboarding input. Every claim position is either cited or marked '[check]', and a version in which nothing at all is cited records no provenance to confirm (REQ-B02)"
        );
      }
      // SERIALISE PER PROFILE, BEFORE THE BUDGET'S READ-THEN-WRITE.
      //
      // NOT the first statement that touches data — `hasOpenPause` reads sixty
      // lines up, and an earlier version of this comment said otherwise. What
      // matters is that everything the budget decision depends on happens
      // INSIDE the lock: `validateSourceEvidence`, `referenceCorpusAsOf`,
      // `retainedReferenceSpans` and the `max(version)` read all follow it.
      //
      // The budget below is a read-then-write with no natural serialisation:
      // it reads every retained span and decides whether this write adds new
      // material. Two concurrent writes of DIFFERENT KINDS conflict on no
      // unique index — `(profile_id, kind, version)` is per-kind — so both
      // committed, the "retained union <= ceiling" invariant broke, and the
      // profile was refused thereafter with nothing the creator could do about
      // it. Reproduced on real Postgres on the first trial by the billing gate.
      //
      // A transaction-scoped advisory lock, the same shape `packages/config`
      // uses for its compare-and-set. It is taken on `(workspace, profile)`
      // rather than on the row, because the invariant spans kinds and the rows
      // being compared do not all exist yet.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${scope.workspaceId}:${scope.profileId}`}, 0))`
      );
      const content = parseBrainContent(kind, rawContent);
      const { clean, referenceSpans } = await validateSourceEvidence(
        tx,
        scope,
        kind,
        sourceEvidence
      );
      // C-28: EVERY ENUMERATED CLAIM POSITION IS CITED OR VISIBLY MARKED
      // UNKNOWN. This is the rule three documents recorded as closed while its
      // task was TODO — and the reviewers duly stored, confirmed and ACTIVATED
      // "a devout Catholic mother in Leeds, 42000 followers" with none of its
      // claim positions cited by anything.
      //
      // The direction matters: this is claim-position -> evidence, the reverse
      // of validating each entry's pointer. Both run. Without this one the
      // model still decides which of its claims are placeholders, which is
      // C-1's exact thesis left open.
      const claimPositions = enumerateClaimFields(kind, content);
      // ENTRY VALIDITY FIRST, THEN COVERAGE. Both directions run, and the order
      // is chosen so the message names the caller's actual mistake: an entry
      // pointing at nothing also leaves its intended position uncited, and
      // reporting the coverage failure would send the reader to the wrong end
      // of the problem.
      for (const e of clean) {
        if (!claimPositions.includes(e.field)) {
          throw new ProvenanceError(
            `an evidence entry names the claim position '${e.field}', which this document does not declare. Provenance has to attach to a position the creator can actually confirm (REQ-B02)`
          );
        }
      }
      // C-28: EVERY ENUMERATED CLAIM POSITION IS CITED OR VISIBLY MARKED
      // UNKNOWN. This is the rule three documents recorded as closed while its
      // task was TODO — and the reviewers duly stored, confirmed and ACTIVATED
      // "a devout Catholic mother in Leeds, 42000 followers" with none of its
      // claim positions cited by anything.
      //
      // The direction matters: this is claim-position -> evidence, the reverse
      // of the entry check above. Without it the model still decides which of
      // its claims are placeholders, which is C-1's exact thesis left open.
      const citedPositions = new Set(clean.map((e) => e.field));
      const uncited = claimPositions.filter(
        (pointer) =>
          !citedPositions.has(pointer) && readPointer(content, pointer) !== CHECK
      );
      if (uncited.length > 0) {
        throw new ProvenanceError(
          `${uncited.length === 1 ? "the claim at" : "the claims at"} ${uncited.join(", ")} ${uncited.length === 1 ? "is" : "are"} stated as fact with nothing cited for ${uncited.length === 1 ? "it" : "them"}. Every position the schema declares is either backed by a quote from your own material or written as '${CHECK}' so you can see it is unknown — a claim about you that nobody can trace is an invented specific (REQ-I03, REQ-B02)`
        );
      }
      // THE ONE CORPUS (C-29), read HERE and RECORDED on the row.
      //
      // Recording the id set is what lets activation judge this version against
      // the corpus the WRITE was judged against. A `created_at` comparison
      // cannot: `defaultNow()` is transaction-START time, so an input whose
      // transaction starts before this write and commits after it is invisible
      // now AND inside any timestamp-bounded corpus rebuilt at activation —
      // which would brick the version permanently, with a priced rebuild as the
      // only remedy. The set is the fix, not a tighter timestamp.
      const corpus = await scope.accessors.referenceCorpusAsOf(undefined, tx);
      assertNoReferenceEcho(content, corpus.inputs);
      // The quote budget's unit is `(profile, reference inputId)` across every
      // retained version and kind (C-41), so the spans this write adds are
      // measured together with every span already on the profile. The measure
      // is the UNION of covered ranges, which is what keeps a rebuild citing
      // the same spans free — see `assertReferenceQuoteBudget`.
      // NEW spans and RETAINED spans are passed separately, which is what lets
      // the ceiling refuse only on material this write actually adds. See
      // `assertReferenceQuoteBudget` — a union that already exceeds the
      // ceiling must never make a re-citing rebuild impossible.
      assertReferenceQuoteBudget(
        referenceSpans,
        await retainedReferenceSpans(tx, scope)
      );
      // version = max+1 for the (profile, kind) pair, computed HERE and never
      // accepted from a caller. The unique index on (profile_id, kind, version)
      // is what makes a lost race a refusal rather than a duplicate.
      const [{ maxVersion }] = await tx
        .select({
          maxVersion: sql<number | null>`max(${brainDocs.version})`,
        })
        .from(brainDocs)
        .where(
          and(
            eq(brainDocs.profileId, scope.profileId),
            eq(brainDocs.workspaceId, scope.workspaceId),
            eq(brainDocs.kind, doc.kind)
          )
        );
      const version = Number(maxVersion ?? 0) + 1;
      // Every number in the stored sentence is derived HERE, from facts this
      // function has already proved: the distinct inputs are counted off the
      // evidence `validateSourceEvidence` verified verbatim, and the version is
      // the one computed above. No caller value reaches the column.
      const facts: BrainReasonFacts = {
        citedInputCount: new Set(clean.map((e) => e.inputId)).size,
        version,
      };
      const [row] = await tx
        .insert(brainDocs)
        .values({
          ...(stripGuarded({ kind }) as { kind: BrainKind }),
          content,
          reason: renderBrainReason(reason, facts),
          // THE SERVER-REBUILT ARRAY, never the caller's objects — that is what
          // closes the getter TOCTOU on the entries.
          sourceEvidence: clean,
          // Server-derived, and in GUARDED_WRITE_FIELDS so a caller cannot
          // supply it: it decides which corpus the R-3 bar runs over.
          referenceCorpusIds: corpus.ids,
          // A-10: M2a writes 'proposed' ONLY. Activation, supersession and the
          // confirmation columns land together in M2b's migration.
          //
          // THIS LINE IS REDUNDANT TODAY AND IS KEPT DELIBERATELY. Measured:
          // removing it alone leaves the suite green, because the column's
          // schema default is also 'proposed'. It stays because it states the
          // intent at the write site, and because a later migration that
          // changed the column default would otherwise change what this
          // function writes without touching this function.
          //
          // THE LOAD-BEARING GUARD HERE IS THE EXPLICIT COLUMN LIST, not the
          // `stripGuarded` call above — corrected after the tenancy gate raised
          // it twice. `stripGuarded({ kind })` runs over a fresh one-key
          // literal this function built, and `doc` is never spread into
          // `.values()`, so the strip is vacuous at THIS insert. It is real for
          // `appendOnboardingInput` and `recordModelUsage`, which do spread the
          // caller's object. `GUARDED_WRITE_FIELDS` still earns its place here
          // through the TYPE (`NoServerFields`) and through the C-32
          // completeness instrument.
          status: "proposed",
          version,
          ...ids,
        })
        .returning();
      return row;
    },

    confirmBrainDocFields: async (params, tx) => {
      assertMayDecide(scope.role, "confirm");
      if (await hasOpenPause(tx, scope.workspaceId)) {
        throw new WorkspacePausedError();
      }
      const doc = await readOwnBrainDoc(tx, scope, params.brainDocId);
      if (doc.status !== "proposed") {
        throw new ProvenanceError(
          `only a proposed version can be confirmed; this one is '${doc.status}'`
        );
      }
      // EVERY CONFIRMED POINTER NAMES A REAL CLAIM POSITION, AND ITS
      // PLACEHOLDER FLAG MATCHES THE STORED VALUE.
      //
      // Both were unvalidated. The gates confirmed `/not/a/real/position` and
      // activated the document; and marked `/audience` — holding the real value
      // "solo founders" — as `asPlaceholder: true`. The moment C-21's label
      // ("quoted from N of your M posts") reads `confirmed_fields`, the first
      // launders a placeholder confirmation into evidence of a confirmed claim
      // and the second launders a real claim into "unknown".
      // READ ONCE, PARSE, THEN VALIDATE AND STORE THE **PARSE OUTPUT**. The
      // array property is read exactly once here and never again; every entry
      // below is a fresh plain object built from values read once by `parse`,
      // so what is checked and what is stored are the same bytes.
      const submitted = params.confirmedFields;
      if (!Array.isArray(submitted)) {
        throw new ProvenanceError(
          "a confirmation must be a list of the fields the creator reviewed (REQ-B02)"
        );
      }
      const confirmedFields = submitted.map((raw) => {
        const parsed = confirmedFieldEntrySchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          throw new ProvenanceError(
            `a confirmation entry is not the shape a confirmation takes: ${first.path.length ? `/${first.path.join("/")} ` : ""}${first.message}. An entry names the position reviewed and whether it was still unknown — nothing else is recorded (REQ-B02)`
          );
        }
        return parsed.data;
      });
      // ...and no position may be confirmed twice, since a duplicate would let
      // one pointer stand for two different decisions about the same field.
      const seen = new Set<string>();
      for (const f of confirmedFields) {
        if (seen.has(f.pointer)) {
          throw new ProvenanceError(
            `'${f.pointer}' is confirmed twice in one submission, so what the creator decided about it is ambiguous (REQ-B02)`
          );
        }
        seen.add(f.pointer);
      }
      const positions = enumerateClaimFields(doc.kind, doc.content);
      for (const f of confirmedFields) {
        if (!positions.includes(f.pointer)) {
          throw new ProvenanceError(
            `'${f.pointer}' is not a position this document declares, so confirming it would record a decision about nothing (REQ-B02)`
          );
        }
        const isPlaceholder = readPointer(doc.content, f.pointer) === CHECK;
        if (f.asPlaceholder !== isPlaceholder) {
          throw new ProvenanceError(
            `'${f.pointer}' ${isPlaceholder ? "holds '" + CHECK + "', so it can only be confirmed as still unknown" : "holds a stated value, so it cannot be confirmed as a placeholder"}. What the creator saw and what is recorded about what they saw have to agree (REQ-B02)`
          );
        }
      }
      // THE SHA IS OVER WHAT THE HUMAN SAW. Activation re-computes it and
      // refuses on a mismatch, which is what stops a version being confirmed in
      // one shape and activated in another (round-2 V3).
      const [row] = await tx
        .update(brainDocs)
        .set({
          confirmedAt: new Date(),
          // SERVER-DERIVED from the session (C-13). Round 1 found this
          // forgeable as a parameter: a confirmation is an attributable act, so
          // it takes an id nobody can pass in.
          confirmedBy: scope.userId,
          confirmedContentSha256: contentSha256(doc.content),
          // THE SERVER-REBUILT ARRAY, never the caller's objects — the same
          // reason `sourceEvidence: clean` is above, and the reason this line
          // is not `params.confirmedFields`.
          confirmedFields,
        })
        .where(
          and(
            eq(brainDocs.id, doc.id),
            eq(brainDocs.profileId, scope.profileId),
            eq(brainDocs.workspaceId, scope.workspaceId)
          )
        )
        .returning();
      return row;
    },

    activateBrainDoc: async (params, tx) => {
      assertMayDecide(scope.role, "activate");
      if (await hasOpenPause(tx, scope.workspaceId)) {
        throw new WorkspacePausedError();
      }
      const doc = await readOwnBrainDoc(tx, scope, params.brainDocId);
      // ONLY A PROPOSED VERSION IS ACTIVATED, and the two rejected cases are
      // rejected for different reasons worth separating.
      //
      // Re-activating an ALREADY-ACTIVE version would run the supersede step
      // over the row itself, stamping `superseded_at` on the version that then
      // gets re-activated — a row that is active and carries a supersession
      // date, which no reader can interpret.
      //
      // Activating a SUPERSEDED one is a ROLLBACK, and rollback is a capability
      // this milestone has not specified: it would resurrect content on a
      // confirmation the creator gave before whatever replaced it, and the
      // brain has to be able to say what was active when. Refused rather than
      // allowed-by-omission — an unreviewed capability that works is harder to
      // notice than one that refuses.
      if (doc.status !== "proposed") {
        throw new ProvenanceError(
          `only a proposed version can be activated; this one is '${doc.status}'. To go back to an earlier version, write a new version from it — the history stays readable that way`
        );
      }
      if (doc.confirmedAt === null || doc.confirmedContentSha256 === null) {
        throw new ProvenanceError(
          "this version has not been confirmed, and an unconfirmed version is never activated — activation is what makes the product act on a claim about you (REQ-B02)"
        );
      }
      if (contentSha256(doc.content) !== doc.confirmedContentSha256) {
        throw new ProvenanceError(
          "this version's content has changed since it was confirmed, so the confirmation no longer describes what would be activated. Re-confirm the current version"
        );
      }
      // AC-26: ACTIVATION REFUSES WHILE ANY CLAIM POSITION IS UNCONFIRMED.
      //
      // This gate was vacuous. `activateBrainDoc` checked only that
      // `confirmed_at` was set and the sha matched — it never compared
      // `confirmed_fields` against the claim set, so a version activated with
      // ZERO of its positions confirmed, and every shipped fixture passed
      // `confirmedFields: []` so nothing could see it. `enumerateClaimFields`
      // was built, exported and unit-tested with no production caller at all:
      // the milestone's own recurring shape, on the act that decides what the
      // product believes about a creator.
      //
      // REQ-B02 is "the creator confirms or edits EACH before the brain
      // activates". Each means each.
      const positions = enumerateClaimFields(doc.kind, doc.content);
      const confirmed = new Set(
        (Array.isArray(doc.confirmedFields) ? doc.confirmedFields : [])
          .map((f) => (f as { pointer?: unknown }).pointer)
          .filter((x): x is string => typeof x === "string")
      );
      const unconfirmed = positions.filter((p) => !confirmed.has(p));
      if (unconfirmed.length > 0) {
        throw new ProvenanceError(
          `${unconfirmed.length} of this version's ${positions.length} inferred ${positions.length === 1 ? "field has" : "fields have"} not been confirmed yet (${unconfirmed.join(", ")}). A brain version becomes what the product believes about you, so every inferred field is confirmed or edited before it activates (REQ-B02)`
        );
      }
      // THE ECHO BAR RE-RUNS AT ACTIVATION, over the corpus RECORDED ON THE ROW
      // (C-29) — never over one rebuilt now. Rebuilding it here is precisely
      // the defect: a `reference` input appended between write and activation
      // would refuse a version the write had cleared, permanently, and
      // `onboarding_inputs` has no delete path, so nothing the creator could do
      // would clear it. Re-reading the recorded set means activation asks the
      // same question the write answered.
      const recordedCorpus = (
        Array.isArray(doc.referenceCorpusIds) ? doc.referenceCorpusIds : []
      ) as string[];
      const corpus = await scope.accessors.referenceCorpusAsOf(
        recordedCorpus,
        tx
      );
      // THE CORPUS MUST COME BACK WHOLE. If a recorded id no longer resolves,
      // the bar would silently run over a smaller corpus than the write was
      // judged against — the same fail-open `assertNoReferenceEcho` refuses one
      // function up ("an absent corpus is a refusal, not a no-op"). A partial
      // corpus is an absent corpus for that input.
      if (corpus.ids.length !== recordedCorpus.length) {
        throw new ProvenanceError(
          `this version recorded ${recordedCorpus.length} reference posts to check against and only ${corpus.ids.length} could be read back, so the check cannot be repeated as it was performed. Activation refuses rather than checking against part of the corpus (R-3)`
        );
      }
      assertNoReferenceEcho(doc.content, corpus.inputs);
      const now = new Date();
      // Supersede the incumbent FIRST: the partial unique index allows exactly
      // one active row per (profile, kind), so activating before superseding
      // would refuse itself.
      await tx
        .update(brainDocs)
        .set({ status: "superseded", supersededAt: now })
        .where(
          and(
            eq(brainDocs.profileId, scope.profileId),
            eq(brainDocs.workspaceId, scope.workspaceId),
            eq(brainDocs.kind, doc.kind),
            eq(brainDocs.status, "active")
          )
        );
      const [row] = await tx
        .update(brainDocs)
        .set({ status: "active", activatedAt: now })
        .where(
          and(
            eq(brainDocs.id, doc.id),
            eq(brainDocs.profileId, scope.profileId),
            eq(brainDocs.workspaceId, scope.workspaceId)
          )
        )
        .returning();
      return row;
    },
  };
}

/** sha256 over the canonical JSON of stored content. */
function contentSha256(content: unknown): string {
  return createHash("sha256")
    .update(Buffer.from(JSON.stringify(content), "utf8"))
    .digest("hex");
}

/**
 * Read one brain doc THROUGH BOTH CAGE PREDICATES.
 *
 * Both, always: the profile predicate alone is wrong for a re-parented row and
 * the workspace predicate alone is wrong for a sibling profile. A foreign id
 * and a nonexistent id raise the same `ProfileAccessError` — a different
 * observable would be an enumeration oracle (P2).
 */
async function readOwnBrainDoc(
  tx: TxLike,
  scope: ProfileScope,
  brainDocId: string
): Promise<BrainDoc> {
  if (!UUID_RE.test(brainDocId)) throw new ProfileAccessError();
  const [row] = await tx
    .select()
    .from(brainDocs)
    .where(
      and(
        eq(brainDocs.id, brainDocId),
        eq(brainDocs.profileId, scope.profileId),
        eq(brainDocs.workspaceId, scope.workspaceId)
      )
    )
    .limit(1);
  if (!row) throw new ProfileAccessError();
  return row;
}

/**
 * `usage_raw` holds METERING FIELDS ONLY, never prompt or completion text —
 * and this function is what makes that structural instead of a comment.
 *
 * The tenancy gate found the claim resting on nothing: `usageRaw` is typed
 * `unknown`, the column is bare `jsonb`, and the value went straight through.
 * That matters beyond the column, because `creator-data-registry.ts` EXCLUDES
 * `model_usage` from the REQ-A04 export on exactly this ground — an export
 * exclusion resting on an unenforced comment is the gap the registry exists to
 * prevent.
 *
 * NUMBERS, BOOLEANS AND NULL ONLY, deliberately, and it fails CLOSED. A length
 * cap on strings would not be structural: text can be split across keys, so a
 * cap only raises the cost of exfiltration rather than removing the channel.
 * If a provider ever returns a usage field this refuses — a `service_tier`
 * string, say — that is a deliberate schema decision to take then, with a
 * named column, rather than a hole left open now in case it is wanted later.
 */
const USAGE_RAW_MAX_KEYS = 64;
const USAGE_RAW_MAX_DEPTH = 4;

export function assertMeteringOnly(value: unknown, depth = 0): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number" || typeof value === "boolean") return;
  if (depth >= USAGE_RAW_MAX_DEPTH) {
    throw new UsageRawError(`nesting deeper than ${USAGE_RAW_MAX_DEPTH} levels`);
  }
  if (Array.isArray(value)) {
    if (value.length > USAGE_RAW_MAX_KEYS) {
      throw new UsageRawError(`an array of more than ${USAGE_RAW_MAX_KEYS} entries`);
    }
    for (const v of value) assertMeteringOnly(v, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length > USAGE_RAW_MAX_KEYS) {
      throw new UsageRawError(`an object of more than ${USAGE_RAW_MAX_KEYS} keys`);
    }
    for (const k of keys) {
      assertMeteringOnly((value as Record<string, unknown>)[k], depth + 1);
    }
    return;
  }
  // Strings, symbols, functions, bigints — anything that can carry text.
  throw new UsageRawError(
    `a ${typeof value} value (metering fields are numbers, booleans or null)`
  );
}

/**
 * `source_evidence.inputId` is a foreign id living INSIDE jsonb, which the
 * composite FK cannot see. Three plan-gate reviewers independently found that
 * without this check the reference was danglable and the offsets indexed text
 * the product did not retain — so a model-fabricated quote was storable and
 * renderable as evidence. An invented quote is worse than an invented field,
 * because it carries a fabricated warrant.
 */
/**
 * Brain kinds a `reference` input may never be provenance for (D-M2-10).
 *
 * `voice` is the one M2a can name with certainty: it is the document that
 * decides how the creator SOUNDS, so a third party's sentence in it is the
 * leak. The other three are carried as an M2b question in R-30 rather than
 * guessed at here — a set that is wrong in the permissive direction is worse
 * than one that is deliberately small.
 */
const REFERENCE_BARRED_KINDS: ReadonlySet<BrainKind> = new Set(["voice"]);

/**
 * Validate every evidence entry, and RETURN the `reference`-classed spans.
 *
 * The return value exists so the quote budget cannot build a corpus of its own:
 * this function is the only place an input's `input_class` is read, so a second
 * reader would be a second source of truth for "is this a reference post" — the
 * shape C-29 removed for the echo corpus one decision over.
 */
async function validateSourceEvidence(
  tx: TxLike,
  scope: ProfileScope,
  kind: BrainKind,
  entries: SourceEvidenceEntry[]
): Promise<{ clean: SourceEvidenceEntry[]; referenceSpans: ReferenceQuoteSpan[] }> {
  const referenceSpans: ReferenceQuoteSpan[] = [];
  const clean: SourceEvidenceEntry[] = [];
  // NOT a no-op any more — the caller has already refused an empty list by
  // name. Kept as a guard because this function is reachable from activation
  // and export too, and a silent empty walk there would be the fail-open shape
  // `assertNoReferenceEcho` was hardened against.
  if (!entries || entries.length === 0) return { clean, referenceSpans };
  for (const raw of entries) {
    // PARSE EACH ENTRY THROUGH THE CLOSED SCHEMA, AND USE THE PARSE OUTPUT.
    //
    // Two defects in one, both measured by reviewers. (1) The key space was
    // open, so an entry could carry arbitrary extra keys into an
    // export-included jsonb column. (2) THE TOCTOU: reading `doc.sourceEvidence`
    // once into a local guards the ARRAY, not its ELEMENTS — drizzle's
    // serialiser re-reads every property when it stringifies, so a getter on
    // an entry validated as a 10-character quote and stored a 900-character
    // one, leaving a recorded range that under-counts the row forever.
    // Measured read counts on one write: quote x3, startUtf16 x6, endUtf16 x6,
    // inputId x5 — the last read of each was the serialiser.
    //
    // `parse` returns a FRESH plain object built from the values read once
    // here, so what is validated below and what is stored are the same bytes.
    const parsed = sourceEvidenceEntrySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ProvenanceError(
        `an evidence entry is not the shape provenance takes: ${first.path.length ? `/${first.path.join("/")} ` : ""}${first.message}. Every entry names the claim position it supports, the input it came from, and the exact range it was taken from — nothing else is stored (REQ-B02)`
      );
    }
    const entry = parsed.data;
    if (!UUID_RE.test(entry.inputId)) throw new ProfileAccessError();
    const [input] = await tx
      .select({
        content: onboardingInputs.content,
        inputClass: onboardingInputs.inputClass,
        contentSha256: onboardingInputs.contentSha256,
      })
      .from(onboardingInputs)
      .where(
        and(
          eq(onboardingInputs.id, entry.inputId),
          eq(onboardingInputs.profileId, scope.profileId),
          eq(onboardingInputs.workspaceId, scope.workspaceId)
        )
      )
      .limit(1);
    // Same refusal as a foreign profile, same message: an input belonging to
    // another profile and an input that does not exist are indistinguishable.
    if (!input) throw new ProfileAccessError();
    // D-M2-10, ENFORCED rather than asserted (tenancy gate 2026-08-23). A
    // `reference` input is somebody ELSE's post, submitted so the product can
    // learn a mechanism from it. Letting one be the provenance for a `voice`
    // rule is how a third party's sentence becomes the creator's voice — the
    // T2 route, and the similarity gate does not cover it because that gate is
    // spin-only (tech-spec §3 step 4). `onboarding_inputs`' own comment claimed
    // this rule while `input_class` had no reader anywhere in the repo.
    if (input.inputClass === "reference" && REFERENCE_BARRED_KINDS.has(kind)) {
      throw new ProvenanceError(
        `a 'reference' input cannot be provenance for a '${kind}' brain document`
      );
    }
    // From HERE ON the input is known to belong to this profile, so the
    // refusals may name what is wrong: they leak nothing about what exists.
    if (
      !Number.isInteger(entry.startUtf16) ||
      !Number.isInteger(entry.endUtf16) ||
      entry.startUtf16 < 0 ||
      entry.endUtf16 < entry.startUtf16 ||
      entry.endUtf16 > input.content.length
    ) {
      throw new ProvenanceError(
        `offsets [${entry.startUtf16}, ${entry.endUtf16}) are not a valid range into an input of ${input.content.length} UTF-16 code units`
      );
    }
    // UTF-16 code units, into the NORMALISED stored content. `String.slice` is
    // UTF-16 by definition, which is why the unit is stated rather than left to
    // whichever iteration the next implementer reaches for.
    if (input.content.slice(entry.startUtf16, entry.endUtf16) !== entry.quote) {
      throw new ProvenanceError(
        `the quote is not verbatim at offsets [${entry.startUtf16}, ${entry.endUtf16})`
      );
    }
    clean.push(entry);
    // Collected only AFTER the range is proved in-bounds and the quote proved
    // verbatim — which is what makes the recorded range, rather than the quote
    // string, a measure the budget can trust.
    if (input.inputClass === "reference") {
      referenceSpans.push({
        // THE POST, not the row. Two `onboarding_inputs` rows holding the same
        // post are one post for R-3's purposes, and keying on `inputId` let a
        // duplicate paste buy a second 600-character budget — measured
        // reassembling a 989-character post exactly.
        postSha: input.contentSha256,
        inputId: entry.inputId,
        startUtf16: entry.startUtf16,
        endUtf16: entry.endUtf16,
        quote: entry.quote,
      });
    }
  }
  return { clean, referenceSpans };
}

/**
 * Every `reference`-classed span already cited by this profile, across every
 * retained brain version and kind (C-41).
 *
 * Read from the rows rather than from a counter column, deliberately: a stored
 * running total would be the monotone counter this decision exists to remove,
 * and would need a migration to hold it. The ranges are already on the rows.
 */
async function retainedReferenceSpans(
  tx: TxLike,
  scope: ProfileScope
): Promise<ReferenceQuoteSpan[]> {
  const referenceIds = await tx
    .select({ id: onboardingInputs.id, sha: onboardingInputs.contentSha256 })
    .from(onboardingInputs)
    .where(
      and(
        eq(onboardingInputs.profileId, scope.profileId),
        eq(onboardingInputs.workspaceId, scope.workspaceId),
        eq(onboardingInputs.inputClass, "reference")
      )
    );
  if (referenceIds.length === 0) return [];
  // id -> sha, so a stored entry can be keyed on the POST it came from rather
  // than on the row. Two rows holding the same post map to one sha, which is
  // what closes the duplicate-paste route to a second budget.
  const shaOf = new Map(referenceIds.map((r) => [r.id, r.sha]));
  const rows = await tx
    .select({ sourceEvidence: brainDocs.sourceEvidence })
    .from(brainDocs)
    .where(
      and(
        eq(brainDocs.profileId, scope.profileId),
        eq(brainDocs.workspaceId, scope.workspaceId)
      )
    );
  const spans: ReferenceQuoteSpan[] = [];
  for (const row of rows) {
    // `source_evidence` is jsonb, so it is `unknown` however it is typed here.
    // Anything that is not a well-formed entry is SKIPPED rather than thrown
    // on: these rows were validated by this same function when they were
    // written, and a malformed one must not make the profile unable to write
    // again — that is the permanent-refusal shape C-9 and C-41 both remove.
    const entries = Array.isArray(row.sourceEvidence) ? row.sourceEvidence : [];
    for (const e of entries as unknown[]) {
      if (typeof e !== "object" || e === null) continue;
      const { inputId, startUtf16, endUtf16, quote } = e as Record<
        string,
        unknown
      >;
      const sha = typeof inputId === "string" ? shaOf.get(inputId) : undefined;
      if (sha === undefined) continue;
      if (
        !Number.isInteger(startUtf16) ||
        !Number.isInteger(endUtf16) ||
        typeof quote !== "string"
      ) {
        continue;
      }
      spans.push({
        postSha: sha,
        inputId: inputId as string,
        startUtf16: startUtf16 as number,
        endUtf16: endUtf16 as number,
        // The per-quote cap was already applied when this row was written, and
        // re-applying it to a stored row would let a cap CHANGE brick every
        // profile that wrote under the old one. The empty string carries the
        // range without re-asserting the cap.
        quote: "",
      });
    }
  }
  return spans;
}

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
  return WorkspaceScope.mintVerified(
    db,
    membership.workspaceId as VerifiedWorkspaceId,
    membership.role,
    // `user.id` is the DOMAIN user resolved from the auth identity above, not
    // the auth id itself — `confirmed_by` is a FK into `users`.
    user.id as VerifiedUserId
  );
}
