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
import { and, count, countDistinct, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import { memberships, workspaces } from "./schema";
import type { Membership, MembershipRole, Workspace } from "./schema";
import { creditLedger, subscriptions } from "./billing-schema";
import type { CreditLedgerRow, Subscription } from "./billing-schema";
import { brainDocs, creatorProfiles, frameworks } from "./brain-schema";
import type { BrainDoc, BrainKind, CreatorProfile } from "./brain-schema";
import {
  BILLABLE_USAGE_OUTCOMES,
  brainActivationSnapshots,
  modelUsage,
  onboardingInterviewDrafts,
  onboardingInputs,
} from "./onboarding-schema";
import type {
  BrainActivationSnapshot,
  CostState,
  InputClass,
  ModelUsageRow,
  OnboardingInput,
  ResolvedTier,
} from "./onboarding-schema";
import {
  generationAttempts,
  generations,
  type Generation,
  type GenerationAttempt,
  type GenerationAttemptState,
  type GenerationOutcome,
} from "./generation-schema";
import { upsertSpendRollup } from "./spend-rollup";
import { hasOpenPause } from "./pause";
import {
  CHECK,
  enumerateClaimFields,
  parseBrainContent,
  readPointer,
} from "./brain-content";
import {
  assertNoReferenceEcho,
  assertReferenceSafety,
  evaluateReferenceSafety,
  groupReferenceInputs,
  isUsableSpanRange,
  type ReferenceInput,
  type ReferenceQuoteSpan,
} from "./echo";
import {
  renderBrainReason,
  type BrainDocReason,
  type BrainReasonFacts,
} from "./brain-reason";
import {
  BrainDocumentLimitError,
  BrainRoleError,
  BrainVersionLimitError,
  OnboardingInputLimitError,
  OnboardingInputFieldKeyError,
  ProfileAccessError,
  ProfileNameError,
  ProfileRoleError,
  ProvenanceError,
  ScopeForgeryError,
  UsageRawError,
  WorkspacePausedError,
} from "./errors";
import {
  BRAIN_CLAIM_POSITION_MAX,
  BRAIN_DOCUMENT_TEXT_MAX,
  BRAIN_EVIDENCE_ENTRY_MAX,
  BRAIN_VERSION_MAX,
  ONBOARDING_FIELD_KEY_MAX,
  ONBOARDING_SOURCE_URL_MAX,
  POST_CONTENT_MAX,
  POST_COUNT_MAX,
} from "./storage-limits";

export {
  BrainRoleError,
  OnboardingInputFieldKeyError,
  ProfileAccessError,
  ProfileCapError,
  ProfileNameError,
  ProfileRoleError,
  PostContentError,
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
 * The most onboarding inputs one read returns.
 *
 * Its own constant rather than reusing `LEDGER_PAGE_MAX`: these rows are up to
 * `POST_CONTENT_MAX` characters each, so 200 of them is a materially different
 * payload from 200 ledger rows, and a shared number would tie two limits that
 * move for different reasons.
 */
export const ONBOARDING_PAGE_MAX = 50;

/** Fixed-size pages used only by the complete creator-data export stream. */
export const EXPORT_PAGE_SIZE = 25;
// One bounded brain document can cite 250 distinct 20k-character inputs. Page
// docs singly so markdown evidence resolution has a ~5 MB raw-text ceiling,
// rather than multiplying that envelope by the ordinary 25-row page size.
const EXPORT_BRAIN_DOC_PAGE_SIZE = 1;
/**
 * THE ONE LIST OF EXPORTABLE TABLES, and the reason it is a value rather than
 * a bare union (tenancy gate round 1, 2026-08-31).
 *
 * `export.ts` used to keep a THIRD hand-maintained `Set<string>` of the same
 * names and cast `entry.table as ProfileExportTable` on the way into
 * `exportPage`. A future table registered `included: true` in
 * `CREATOR_DATA_REGISTRY` and added to that Set but NOT to `exportPage`'s
 * switch would have passed the guard, fallen off the end of the switch,
 * returned `undefined` and thrown inside the page loop — AFTER the route had
 * committed HTTP 200 headers. A truncated download where R11 promises a
 * fail-closed refusal.
 *
 * Deriving the union FROM this array closes the half a compiler can close: the
 * switch below is annotated `Promise<unknown[]>` with no `default`, so adding
 * a member here without adding its `case` is TS2366 ("lacks ending return
 * statement"), not a runtime surprise. The half the compiler cannot close —
 * the registry names arbitrary strings — stays a runtime refusal, raised
 * before any byte is emitted (`exportPlan` in `export.ts`).
 */
export const PROFILE_EXPORT_TABLES = [
  "creator_profiles",
  "brain_docs",
  "onboarding_inputs",
  "onboarding_interview_drafts",
  "brain_activation_snapshots",
  // Slice 6. `generations` is export-included because it holds the scripts,
  // hooks and captions the product wrote FOR the creator — see its
  // `CREATOR_DATA_REGISTRY` entry. `generation_attempts` is deliberately NOT
  // here, and the REASON changed when R14c gave it a `candidate` column: it is
  // no longer "a payload hash and a state, no words". It holds the validated
  // output for exactly the window between the response checkpoint and
  // settlement (an equality CHECK makes that window unextendable), and an
  // in-flight draft the creator has not been shown — and which may still be
  // refused — is not their record; the settled `generations` row that
  // supersedes it is, and it IS exported. Adding a name to this array without
  // a `case` below is TS2366 rather than a runtime surprise.
  "generations",
  "frameworks",
] as const;
export type ProfileExportTable = (typeof PROFILE_EXPORT_TABLES)[number];

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
  /**
   * The workspace's ACTIVE creator profiles, newest first (slice 1).
   *
   * WORKSPACE-GRAINED ON PURPOSE, and it is the one accessor here that has to
   * say so: every OTHER profile-grained read in this file hangs off
   * `ProfileScope`, which cannot be minted until a profile exists. This is the
   * read that answers "does this creator have a profile yet?", which is the
   * question `/onboarding` opens with — so it necessarily precedes the profile
   * grain rather than living inside it.
   *
   * `active` ONLY, and that is not cosmetic: the cap counts active rows
   * (`countActiveProfiles`), so a reader that counted archived ones too would
   * show a creator "using 2 of 1" and claim cap-reached while the server would
   * allow the create. The page's displayed count and the server's enforced
   * count have to be the same question (billing gate, 2026-08-27).
   *
   * NO `conn` PARAMETER. An earlier version took one, justified by
   * "`createProfile` counts against the cap from INSIDE its transaction" — but
   * `createProfile` uses `countActiveProfiles(tx)` and never this accessor, and
   * nothing in the repo passed the argument. A comment claiming a property is
   * not the property; the parameter is gone rather than the comment reworded.
   */
  creatorProfiles: () => Promise<CreatorProfile[]>;
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
      // Newest first with `id` as the tie-break, the same DISPLAY order the
      // ledger accessor uses — `uuidv7` ids are time-ordered, so the tie-break
      // agrees with `created_at` rather than fighting it. Unordered would let
      // Postgres return a different order per call for the same rows, which is
      // a list that reshuffles under the reader for no reason.
      creatorProfiles: () =>
        db
          .select()
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.workspaceId, workspaceId),
              eq(creatorProfiles.state, "active")
            )
          )
          .orderBy(desc(creatorProfiles.createdAt), desc(creatorProfiles.id)),
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

export type MonthlySpendResult = {
  /** Credits debited in the period, as a positive count. */
  totalDebit: number;
  /** False means "no debit visible in this period" — not the same claim as zero (R8). */
  hasAnyDebit: boolean;
  periodStart: Date;
};

/**
 * The creator's credit burn this billing period (R7, slice 2b).
 *
 * A SCOPED QUERY WITH ITS OWN PERIOD PREDICATE — never a sum over
 * `scope.accessors.ledger()`'s page. That page is clamped (`LEDGER_PAGE_MAX`)
 * and `usage-view.tsx` already refuses to do arithmetic on it ("Nothing here
 * adds up the deltas in `rows`"); this is the unclamped answer that refusal
 * was leaving a gap for.
 *
 * A STANDALONE FUNCTION, not a `WorkspaceAccessors` closure entry, for the
 * same reason `appendOwnPost` and `mintProfileScope` are standalone in
 * `onboarding-ops.ts`: it calls `assertScoped` itself rather than joining the
 * accessor map the cross-workspace suite enumerates.
 *
 * `periodStart` is supplied by the caller, not computed here: the authority
 * for "what is this workspace's current billing period" is
 * `getWorkspaceBillingState` / the subscription row, which lives in
 * `@respin/credits` — `packages/credits/src/burn-period.ts` is that
 * authority. This function only trusts the `Date` it is handed.
 */
export async function monthlySpend(
  db: DbLike,
  scope: WorkspaceScope,
  periodStart: Date
): Promise<MonthlySpendResult> {
  assertScoped(scope);
  // `kind = 'debit'` EXPLICITLY, not merely `delta < 0` (billing gate finding
  // 1, 2026-08-29). `delta < 0` also matches `expiry` rows and a negative
  // `adjust` — and `deriveBalanceInTx` (`balance.ts`) can materialize an
  // expiry row LAZILY, on the very `getBalance` call this page already makes
  // one statement earlier (`usage/page.tsx`), so a page load that crosses a
  // lot's expiry boundary would have counted a lapsed credit as "spent" in
  // the same render. Credits lapsing is not the creator having spent them.
  const [row] = await db
    .select({ total: sql<string | null>`sum(-${creditLedger.delta})` })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.workspaceId, scope.workspaceId),
        eq(creditLedger.kind, "debit"),
        sql`${creditLedger.createdAt} >= ${periodStart}`
      )
    );
  const totalDebit = row?.total ? Number(row.total) : 0;
  return { totalDebit, hasAnyDebit: totalDebit > 0, periodStart };
}

/** Credits and the number of debit rows that produced them. */
export type BurnByModeBucket = {
  /** Credits debited, as a positive count. */
  credits: number;
  /** How many `credit_ledger` debit rows are in this bucket. */
  debits: number;
};

export type BurnByModeRow = BurnByModeBucket & {
  /** `generations.mode` — the STORED mode, never a guess. */
  mode: string;
};

export type BurnByModeResult = {
  periodStart: Date;
  /** Debits that reached a terminal settled generation, grouped by its mode. */
  byMode: BurnByModeRow[];
  /**
   * Debits whose `ref_id` names NO generation claim in this workspace. The
   * onboarding voice-brain build is the one that exists today: it debits with
   * the SAME `ref_type = 'inference'` and the same attempt-id grain, so it is
   * not distinguishable from a generation by `ref_type` and is only
   * distinguishable by this join failing to find a claim.
   */
  notAGeneration: BurnByModeBucket;
  /**
   * Debits whose `ref_id` DOES name a generation claim in this workspace, but
   * one that has not reached a terminal `settled` state with a stored
   * generation. Reported, never bucketed into a mode — see the docblock below.
   */
  nonTerminalClaim: BurnByModeBucket;
};

/**
 * The creator's credit burn BY MODE for a period (R17a, slice 6).
 *
 * THE MODE COMES FROM THE JOIN, NEVER FROM `ref_type`, AND NEVER FROM THE COST
 * ROLLUP. Two things spend credits today and BOTH debit with
 * `ref_type = 'inference'` and `ref_id = <attempt id>` (R-63: the generation
 * debit deliberately reuses `credit_ledger_inference_debit_uq` rather than
 * minting a sixth constraint). So a reader that treated every `inference`
 * debit as a generation would file the onboarding voice-brain build under a
 * mode — which is why the discriminator here is whether the debit's `ref_id`
 * resolves to a `generation_attempts` row in THIS workspace, and then to the
 * `generations` row that attempt settled into. The population is a LIST of
 * outcomes, not one path (CLAUDE.md 2026-08-29): a debit lands in exactly one
 * of `byMode`, `notAGeneration` or `nonTerminalClaim`, and adding a third
 * spending purpose costs a decision about which of those it belongs in.
 *
 * AND IT IS NOT `workspace_spend_monthly` (mutation M13). That table is OUR
 * vendor cost in micro-USD, its grain is `(workspace, month, tier)`, and it has
 * no `purpose` and no `mode` column at all — so any "by mode" number derived
 * from it would be an allocation of our spending wearing the label of the
 * creator's. `tests/usage-burn-by-mode.test.ts` reddens on a re-derivation from
 * it, from two directions: this function's own source may not name the rollup,
 * and a fixture holds two modes with different credit totals against a single
 * rollup row that cannot express either.
 *
 * NEITHER JOIN CAN FAN OUT, so `count()` counts debit ROWS and `sum(-delta)`
 * counts each debit once: `generation_attempts_attempt_uq` and
 * `generations_attempt_uq` are both GLOBAL uniques on `attempt_id`
 * (`generation-schema.ts`), so a debit matches at most one claim and a claim at
 * most one generation. That is a property of two indexes, not of today's data.
 *
 * A NON-TERMINAL CLAIM IS REPORTED, NOT BUCKETED. `generation_attempts` carries
 * a `mode` of its own, so bucketing an unsettled claim by it would be one line
 * — and it would show a creator credits spent on a draft that does not exist.
 * R14b settles the generation and its debit in one transaction, so this bucket
 * should be empty in practice; it is a number rather than a silent drop because
 * "should be empty" is a claim, and a claim with no reader is not checked.
 * Likewise a `settled` attempt whose `generations` row is missing —
 * unrepresentable while `generation_attempts_settled_has_generation` holds
 * (it is an EQUALITY, R-63) — lands here rather than in a mode.
 *
 * SCOPED ON BOTH AXES, AND THE TWO HALVES HAVE DIFFERENT WITNESSES — said
 * plainly rather than claimed uniformly. The debit is pinned to
 * `scope.workspaceId`. The CLAIM join's own `workspace_id` predicate is
 * load-bearing and driven: `attempt_id` is globally unique, so a debit whose
 * `ref_id` names another workspace's attempt would otherwise be labelled with
 * that workspace's mode — deleting the predicate left every other test in
 * `burn-by-mode.test.ts` green, which is why that suite has a test that only
 * this predicate passes. The GENERATION join's `workspace_id`/`profile_id`
 * predicates are defence in depth that no fixture can falsify, because
 * `generations_attempt_fk` makes the disagreement unrepresentable; that FK is
 * asserted by running it rather than argued. `periodStart` is the caller's,
 * exactly as `monthlySpend`'s is — `packages/credits/src/burn-period.ts` is the
 * one period authority (paid: the subscription's own `current_period_start`;
 * Free: the UTC calendar month), and a second derivation here is precisely the
 * drift `monthlySpend`'s docblock refuses.
 */
export async function burnByMode(
  db: DbLike,
  scope: WorkspaceScope,
  periodStart: Date
): Promise<BurnByModeResult> {
  assertScoped(scope);
  // The claim's presence, as a grouping key. `attempt_id` rather than `id`
  // because it is the column the join matched on.
  const claimed = sql<boolean>`(${generationAttempts.attemptId} IS NOT NULL)`;
  const rows = await db
    .select({
      mode: generations.mode,
      claimed,
      // `kind = 'debit'` is in the WHERE, so every delta here is negative and
      // `sum(-delta)` is a positive credit count — the same expression, and the
      // same reason for it, as `monthlySpend` one function up.
      credits: sql<string | null>`sum(-${creditLedger.delta})`,
      debits: count(),
    })
    .from(creditLedger)
    // THE FIRST DISCRIMINATOR. No `ref_type` predicate, deliberately: R-63 puts
    // the generation debit on `ref_type = 'inference'` TODAY, and a debit that
    // later arrives under a different `ref_type` while still naming an attempt
    // must still be attributed to its mode rather than silently reported as
    // "not a generation". The join key is the attempt id and the workspace.
    .leftJoin(
      generationAttempts,
      and(
        eq(generationAttempts.attemptId, creditLedger.refId),
        eq(generationAttempts.workspaceId, creditLedger.workspaceId)
      )
    )
    // THE SECOND: terminal or nothing. `state = 'settled'` lives in the ON
    // clause rather than the WHERE, because a WHERE predicate on the right side
    // of a LEFT JOIN silently turns it into an inner join and would DROP every
    // non-terminal claim instead of counting it.
    .leftJoin(
      generations,
      and(
        eq(generations.attemptId, generationAttempts.attemptId),
        eq(generations.workspaceId, generationAttempts.workspaceId),
        eq(generations.profileId, generationAttempts.profileId),
        eq(generationAttempts.state, "settled")
      )
    )
    .where(
      and(
        eq(creditLedger.workspaceId, scope.workspaceId),
        eq(creditLedger.kind, "debit"),
        sql`${creditLedger.createdAt} >= ${periodStart}`
      )
    )
    .groupBy(generations.mode, claimed);

  const byMode: BurnByModeRow[] = [];
  const notAGeneration: BurnByModeBucket = { credits: 0, debits: 0 };
  const nonTerminalClaim: BurnByModeBucket = { credits: 0, debits: 0 };
  for (const r of rows) {
    const credits = r.credits ? Number(r.credits) : 0;
    const debits = Number(r.debits);
    if (r.mode !== null) {
      byMode.push({ mode: r.mode, credits, debits });
    } else if (r.claimed) {
      nonTerminalClaim.credits += credits;
      nonTerminalClaim.debits += debits;
    } else {
      notAGeneration.credits += credits;
      notAGeneration.debits += debits;
    }
  }
  // A STABLE ORDER, so the panel does not reshuffle between two renders of the
  // same data — the same rule the `ledger` accessor's tie-break exists for.
  byMode.sort((a, b) => b.credits - a.credits || a.mode.localeCompare(b.mode));
  return { periodStart, byMode, notAGeneration, nonTerminalClaim };
}

export type ProfileAccessors = {
  profile: () => Promise<CreatorProfile[]>;
  brainDocs: () => Promise<BrainDoc[]>;
  /** Every version of one kind, newest version first, with every status retained. */
  brainDocsByKind: (kind: BrainKind, tx?: TxLike) => Promise<BrainDoc[]>;
  /**
   * The brain documents a `brain_activation_snapshots` row NAMES, by id.
   *
   * IT REPLACED `activeBrainDocs` (tenancy gate, 2026-09-01), which is the
   * whole point rather than a rename. The generation path read the latest
   * snapshot and then, in a SECOND statement outside any transaction and
   * outside the per-profile brain lock, read "the documents whose status is
   * active". A coherent activation committing between those two statements made
   * `generations.brain_activation_id` name snapshot N while the prompt had been
   * built from N+1's documents — the stored explanation wrong from birth, which
   * is exactly what R9a exists to prevent, and reachable with two tabs or two
   * members. Two authorities answering "which brain ran" is the defect; there
   * is now one, and it is the one the row records.
   *
   * `brain_activation_snapshots`' doc-id columns carry NO foreign key (that
   * table's own docblock says so and says why), so THIS is where the tenancy
   * property is proved: the ids are caller-supplied and the scope predicate
   * decides what comes back, exactly as `onboardingInputsByIds` does. A
   * snapshot naming another profile's document therefore yields nothing for it
   * rather than that document — fail-closed, never a cross-profile read.
   *
   * An EMPTY id list returns `[]` without a query: `inArray` with no values is
   * not a predicate, and building one would be a scan of the table.
   *
   * WHAT BOUNDS `ids` — asked because `onboardingInputsByIds` below states its
   * bound and this one did not (tenancy gate round 2, 2026-09-01). THE
   * ACCESSOR IMPOSES NONE: the body is one `inArray` with no `limit`, so the
   * page bound is the caller's, exactly as it is for the sibling. The bound
   * that holds today is the SNAPSHOT ROW's shape — `brain_activation_snapshots`
   * has one doc-id column per brain kind, four of them, and the only caller
   * (`snapshotDocIds` in `packages/credits/src/generate.ts`, which is a list of
   * those four columns with nulls dropped) therefore passes at most four ids.
   * A caller passing a set bounded by something else — a history page, a
   * creator-supplied list — is the change that has to bring a bound with it,
   * and this sentence is where it would go.
   *
   * IT IS ALSO UNFILTERED BY `status`, DELIBERATELY, and that is the point
   * rather than an omission: the snapshot is the authority for which versions a
   * generation ran under, so a document that has since been superseded must
   * still come back when the snapshot names it — filtering to `active` here
   * would silently re-introduce the second authority R9a deleted.
   */
  brainDocsByIds: (ids: readonly string[], tx?: TxLike) => Promise<BrainDoc[]>;
  /*
   * FOUR ACCESSORS WERE DELETED HERE (tenancy gate CHANGE, slice 5 round 2):
   * `onboardingInputsForExport`, `interviewDrafts`, `activationSnapshots` and
   * `frameworks`. They were the pre-paging export's readers, and once
   * `exportPage` became the live reader of every included table they had ZERO
   * `accessors.<name>` call sites in `app/**` or `packages/**` — `frameworks`
   * had one, in a test written to witness itself. Two of them additionally
   * carried rule text that had become FALSE: "unpaged because a REQ-A04 export
   * must not silently truncate creator-owned rows" (the REQ-A04 export did not
   * use it; the PAGED reader below is the one that must not truncate) and a
   * duplicate of R-9/T2's private-only `frameworks` rule that `exportPage`'s
   * own `frameworks` branch now owns.
   *
   * This is the same Definition-of-Done reachability rule that deleted the
   * materialising exporter one round earlier: an unreachable scoped read is not
   * tenancy surface, it is inventory whose witnesses drive nothing a user can
   * run. R15/task 21's stated purpose for `frameworks` — "so the export does
   * not build its own framework query" — is satisfied by `exportPage`, which is
   * a scoped accessor in the same cage.
   */
  /** Complete, fixed-size export paging; offset advances until an empty page. */
  exportPage: (
    table: ProfileExportTable,
    offset: number,
    tx?: TxLike
  ) => Promise<unknown[]>;
  /**
   * `inputClass` IS OPTIONAL AND IS A QUERY PREDICATE, NEVER A POST-PAGE FILTER
   * (tenancy gate CHANGE, slice 4 round 2, 2026-08-29). Two onboarding-page
   * display lists ("Your posts" and the reference-post list) used to share
   * this accessor's UNFILTERED page and filter by class in JavaScript AFTER
   * the page was taken — the exact anti-pattern `ownPostsNewest`'s own
   * docblock names and closes for the inference path one accessor up, now
   * reopened on the DISPLAY path the moment `reference` rows exist in
   * production: a creator with more of one class than the page size sees the
   * OTHER class's list wrongly collapse to "none" or an undercounted total.
   * `page.tsx` now passes `inputClass` here for both lists.
   */
  onboardingInputs: (
    page?: LedgerPage,
    inputClass?: InputClass
  ) => Promise<OnboardingInput[]>;
  /**
   * The inputs a set of ids names — the evidence's OWN posts, not a page.
   *
   * ADDED BY THE TENANCY AND COMPLIANCE GATES, 2026-08-29, and the defect it
   * closes is a permanent outage. `readVoiceBrain` resolved a brain document's
   * cited posts out of `onboardingInputs()`, whose default page is the 50
   * NEWEST — against a write ceiling of 2,000. Once a cited post aged out of
   * that window the lookup missed, `claimsFor` threw, and `/brain` refused the
   * WHOLE page, proposed and active alike. `onboarding_inputs` has no delete
   * path and there is no un-activate, so nothing the creator could do would
   * clear it.
   *
   * The set is bounded by the document rather than by a page: one evidence
   * entry per claim position, and `voice` declares at most twelve.
   */
  onboardingInputsByIds: (
    ids: readonly string[],
    tx?: TxLike
  ) => Promise<OnboardingInput[]>;
  /**
   * The creator's OWN posts, newest first, up to an explicit limit.
   *
   * ADDED BY THE COMPLIANCE GATE, 2026-08-29. `inferVoice` read
   * `onboardingInputs()` and filtered `own_post` in JavaScript, which had two
   * defects the filter could not see. The page bound is 50, so a creator with
   * 200 stored posts paid for a voice inferred from a quarter of them while the
   * screen said "the posts you saved above" — and once slice 4 lands
   * `reference` inputs, 50 recent references would starve `own_post` out of the
   * window entirely and produce "not enough posts" for a creator with hundreds.
   *
   * The class filter is in the QUERY for that reason: a filter applied after a
   * page has already been taken filters the wrong set.
   */
  ownPostsNewest: (limit: number) => Promise<OnboardingInput[]>;
  /** How many OWN posts this profile holds — what the corpus bound is stated against. */
  countOwnPosts: () => Promise<number>;
  /**
   * How many REFERENCE posts this profile holds (slice 4, R3).
   *
   * ITS OWN COUNT, not derived from `countOnboardingInputs`. `ownPostsNewest`'s
   * own docblock records the corpus-starvation risk this closes: 50 recent
   * `reference` rows would push a creator's `own_post` rows out of the voice
   * corpus's read window entirely. `appendReferencePost`'s own cap
   * (`REFERENCE_COUNT_MAX`, onboarding-ops.ts) is the write-side control that
   * keeps this count itself bounded.
   */
  countReferencePosts: () => Promise<number>;
  /**
   * Attempts we PAID FOR and did NOT charge for, on this profile.
   *
   * THE BOUND THE ENTITLEMENT SPLIT REMOVED (billing gate round 2,
   * 2026-08-29). Until `consumesIncludedBuild` existed, every non-consuming
   * outcome was also a ZERO-COST one — a 429 or a 5xx produced nothing and was
   * charged nothing — so "does not consume the included build" and "cost us
   * nothing" were the same fact, and nothing needed to count these.
   *
   * `LlmTruncatedError` is the first class that is billable AND
   * non-consuming: the vendor produced a full ceiling of output and charged
   * for it, and the creator is deliberately not billed because the cause is
   * our own misconfigured ceiling. That is right — and it left a real vendor
   * call a creator can fire from a button, forever, at no cost to them and no
   * cap: `priceOf` returns 0, so the balance check is skipped entirely, and
   * truncation is deterministic for a given input size, so it repeats.
   * Round 1's defect bounded this by accident (the second press cost 50
   * credits); fixing that defect reopened it.
   */
  /**
   * @param since the START of the window this count covers — REQUIRED, with no
   * default, because the two purposes answer it differently and a shared
   * default would silently make one of them wrong. A LIFETIME count is spelled
   * `new Date(0)` at the call site, which is a decision somebody wrote down
   * rather than an omission (billing gate, 2026-09-01: an unwindowed count over
   * an append-only table refuses a profile FOREVER once it crosses the cap,
   * with no operator surface listing who is at it).
   */
  countUnchargedBillableAttempts: (params: {
    purpose: string;
    since: Date;
  }) => Promise<number>;
  /**
   * The profile's NEWEST coherent brain activation (slice 6, R9a).
   *
   * `generations.brain_activation_id` is NOT NULL, and its whole purpose is
   * that "a later brain or metric edit cannot change the historical
   * explanation" — the snapshot names the exact Voice/Strategy/Kill-Test
   * versions that were active TOGETHER at one instant, and the row is
   * append-only. So the generation path needs to read one, and it needs to
   * read it through the cage: the snapshot id it stores carries NO foreign
   * key (`generation-schema.ts` records why), so the ONLY thing that keeps a
   * generation from naming another profile's snapshot is that the writer read
   * it from this accessor.
   *
   * NEWEST FIRST, LIMIT 1 rather than "the active one": there is no `active`
   * flag on a snapshot — activation APPENDS one — so "the coherent brain right
   * now" is the last row written. Ordered by `(created_at, id)` desc, the same
   * total order `exportPage` uses, so two snapshots stamped in the same
   * millisecond still have one answer (uuidv7 is time-ordered).
   *
   * Returns an ARRAY, like `profile()`: an empty one means this creator has
   * never activated a coherent brain, which is a refusal the generation path
   * owns rather than a null this accessor guesses about.
   */
  latestBrainActivation: (
    tx?: TxLike
  ) => Promise<BrainActivationSnapshot[]>;
  /** How many inputs this profile holds — the write-side ceiling's reader. */
  countOnboardingInputs: () => Promise<number>;
  modelUsage: () => Promise<ModelUsageRow[]>;
  /**
   * How many DISTINCT `attempt_id`s of one purpose this profile has that the
   * vendor BILLED US FOR (D-M2-2, slice 2a).
   *
   * COUNTED, NOT LISTED, and that is not an optimisation. `modelUsage()` above
   * is an unbounded read of a table that only ever grows, so pricing a rebuild
   * off `modelUsage().length` would load a creator's entire spend history into
   * memory to compute one integer, and would get the integer WRONG twice over:
   * rows are not attempts (a bounded retry may write two rows for one attempt),
   * and a 429 is not a billed attempt.
   *
   * `excludeAttemptId` exists because the authoritative pricing decision
   * happens AFTER `model_usage` for this attempt has already committed — the
   * A-7 settlement-tail order — so "how many came before me" has to be
   * expressible without counting oneself.
   *
   * `earlierThanAttemptId` EXISTS BECAUSE `excludeAttemptId` ALONE IS NOT A
   * TIE-BREAK, AND THE DOCBLOCK HERE USED TO CLAIM IT WAS. The old sentence
   * read "two concurrent first-ever attempts then serialise on the workspace
   * lock and exactly one of them is free, rather than both". They do serialise
   * — and both are charged, because by the time either reaches its debit BOTH
   * usage rows have already committed (R11 commits the spend record before the
   * debit is attempted), so each one excludes itself and counts the other.
   * The creator loses the included build they were promised. Proved by
   * `packages/credits/tests/inference-race.docker.test.ts`, which PGlite could
   * not have caught: it is single-connection, so its "race" is a sequence.
   *
   * The fix is an ORDER, because a symmetric predicate cannot break a tie.
   * Passing `earlierThanAttemptId` counts only attempts that are strictly
   * EARLIER than that attempt by `(first billable row's created_at,
   * attempt_id)` — a total order over attempts, so exactly one attempt in any
   * set has zero predecessors, whatever the interleaving. `created_at` is
   * `clock_timestamp()` per row, and `attempt_id` breaks a same-instant tie.
   *
   * It is monotone over time, which a cheaper-looking rule is not: "the free
   * build belongs to the smallest attempt_id" would hand a SECOND free build
   * to any later attempt that happened to sort below the first.
   */
  countBillableAttempts: (
    params: {
      purpose: string;
      excludeAttemptId?: string;
      earlierThanAttemptId?: string;
    },
    conn?: TxLike
  ) => Promise<number>;
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
      brainDocs: () =>
        db
          .select()
          .from(brainDocs)
          .where(both(brainDocs))
          .orderBy(desc(brainDocs.createdAt), desc(brainDocs.id)),
      brainDocsByKind: (kind: BrainKind, tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(brainDocs)
          .where(and(both(brainDocs), eq(brainDocs.kind, kind)))
          .orderBy(desc(brainDocs.version), desc(brainDocs.id)),
      brainDocsByIds: (ids: readonly string[], tx?: TxLike) =>
        ids.length === 0
          ? Promise.resolve([])
          : (tx ?? db)
              .select()
              .from(brainDocs)
              .where(and(both(brainDocs), inArray(brainDocs.id, [...ids]))),
      exportPage: async (
        table: ProfileExportTable,
        offset: number,
        tx?: TxLike
      ): Promise<unknown[]> => {
        if (!Number.isInteger(offset) || offset < 0) {
          throw new WorkspaceAccessError(
            `exportPage: offset must be a non-negative integer; received ${String(offset)}`
          );
        }
        const conn = tx ?? db;
        switch (table) {
          case "creator_profiles":
            return conn
              .select()
              .from(creatorProfiles)
              .where(
                and(
                  eq(creatorProfiles.id, profileId),
                  eq(creatorProfiles.workspaceId, workspaceId)
                )
              )
              .orderBy(desc(creatorProfiles.createdAt), desc(creatorProfiles.id))
              .limit(EXPORT_PAGE_SIZE)
              .offset(offset);
          case "brain_docs":
            return conn
              .select()
              .from(brainDocs)
              .where(both(brainDocs))
              .orderBy(desc(brainDocs.version), desc(brainDocs.id))
              .limit(EXPORT_BRAIN_DOC_PAGE_SIZE)
              .offset(offset);
          case "onboarding_inputs":
            return conn
              .select()
              .from(onboardingInputs)
              .where(both(onboardingInputs))
              .orderBy(desc(onboardingInputs.createdAt), desc(onboardingInputs.id))
              .limit(EXPORT_PAGE_SIZE)
              .offset(offset);
          case "onboarding_interview_drafts":
            return conn
              .select()
              .from(onboardingInterviewDrafts)
              .where(both(onboardingInterviewDrafts))
              .orderBy(
                desc(onboardingInterviewDrafts.createdAt),
                desc(onboardingInterviewDrafts.id)
              )
              .limit(EXPORT_PAGE_SIZE)
              .offset(offset);
          case "brain_activation_snapshots":
            return conn
              .select()
              .from(brainActivationSnapshots)
              .where(both(brainActivationSnapshots))
              .orderBy(
                desc(brainActivationSnapshots.createdAt),
                desc(brainActivationSnapshots.id)
              )
              .limit(EXPORT_PAGE_SIZE)
              .offset(offset);
          // Slice 6 (stage A). `both()` like every other profile-grained
          // branch — the composite FK makes a cross-parented row
          // unrepresentable in normal operation, and the workspace predicate
          // is what keeps that true when the constraint is not there to help
          // (which is the axis `exportPage cross-workspace axis` drives by
          // dropping it).
          //
          // The ORDINARY page size, not `brain_docs`' page-of-one: a
          // `ScriptOutput` is a bounded document, not a citation graph that
          // multiplies by 250 twenty-thousand-character inputs. Newest first
          // with `id` as the tie-break, the one display order this file uses
          // everywhere.
          case "generations":
            return conn
              .select()
              .from(generations)
              .where(both(generations))
              .orderBy(desc(generations.createdAt), desc(generations.id))
              .limit(EXPORT_PAGE_SIZE)
              .offset(offset);
          case "frameworks":
            return conn
              .select()
              .from(frameworks)
              .where(
                and(
                  eq(frameworks.ownerProfileId, profileId),
                  eq(frameworks.workspaceId, workspaceId),
                  eq(frameworks.visibility, "private")
                )
              )
              .orderBy(desc(frameworks.createdAt), desc(frameworks.id))
              .limit(EXPORT_PAGE_SIZE)
              .offset(offset);
        }
      },
      // NEWEST FIRST, with `id` as the tie-break — the ONE display order for a
      // creator's pasted posts, so the page never re-answers it. Unordered, the
      // planner may return a different order per call for the same rows, and a
      // list that reshuffles under the reader looks like data changing when
      // nothing did. `uuidv7` ids are time-ordered, so the tie-break agrees
      // with `created_at` instead of fighting it.
      // CLAMPED, like `ledger` one grain up and for the same reason: this is a
      // list that only ever grows, read by a server component whose caller may
      // pass a URL-derived page size. An unbounded read of an append-only table
      // is a slow-loris waiting to happen, and departing from the repo's own
      // convention for a growing list silently is how it would arrive
      // (production gate, 2026-08-27).
      onboardingInputs: (
        page: LedgerPage = { limit: ONBOARDING_PAGE_MAX },
        inputClass?: InputClass
      ) =>
        db
          .select()
          .from(onboardingInputs)
          .where(
            // THE CLASS PREDICATE, IN THE QUERY — never applied to the page
            // after it is taken. See the type's docblock (tenancy gate CHANGE,
            // slice 4 round 2): a filter applied after the page is already the
            // wrong page for a creator with more of the OTHER class.
            inputClass === undefined
              ? both(onboardingInputs)
              : and(both(onboardingInputs), eq(onboardingInputs.inputClass, inputClass))
          )
          .orderBy(desc(onboardingInputs.createdAt), desc(onboardingInputs.id))
          .limit(clampPageNumber(page.limit, 1, ONBOARDING_PAGE_MAX, 1))
          .offset(clampPageNumber(page.offset, 0, Number.MAX_SAFE_INTEGER, 0)),
      onboardingInputsByIds: async (ids: readonly string[], tx?: TxLike) => {
        // AN EMPTY SET MEANS "NO INPUTS", NEVER "NO PREDICATE" — the same trap
        // `referenceCorpusAsOf` documents above, and the same handling: return
        // without a query rather than rely on the driver emitting `false`.
        if (ids.length === 0) return [];
        return (tx ?? db)
          .select()
          .from(onboardingInputs)
          .where(
            and(both(onboardingInputs), inArray(onboardingInputs.id, [...ids]))
          );
      },
      ownPostsNewest: (limit: number) =>
        db
          .select()
          .from(onboardingInputs)
          .where(
            and(
              both(onboardingInputs),
              // IN THE QUERY, not after the page — see the type's docblock.
              eq(onboardingInputs.inputClass, "own_post")
            )
          )
          .orderBy(desc(onboardingInputs.createdAt), desc(onboardingInputs.id))
          // REFUSED, NOT CLAMPED (compliance gate round 2, 2026-08-29). This
          // used to clamp an EXPLICIT bound: raise the caller's limit past 50
          // and the read quietly stayed at 50 while the copy stated the new
          // number. That is round 1's own defect — a silent truncation under a
          // comment claiming an explicit bound — one layer down, and the
          // caller-side guard (`toBeLessThanOrEqual`) would stay true through
          // it.
          .limit(assertCorpusLimit(limit)),
      countUnchargedBillableAttempts: async ({ purpose, since }) => {
        // DISTINCT ATTEMPTS, never rows — the same rule `countBillableAttempts`
        // states one accessor up: a bounded retry inside one attempt is one
        // attempt.
        //
        // AND WITHIN A WINDOW. `model_usage` is append-only and only grows, so
        // an unbounded count is a LIFETIME count: N deterministic failures ever
        // refuse this profile's purpose permanently, and the only remedy is an
        // operator raising a GLOBAL config key with no surface telling them who
        // is stuck. `created_at` is server-stamped on this table, so the window
        // is measured against the database's own clock.
        const [row] = await db
          .select({ n: countDistinct(modelUsage.attemptId) })
          .from(modelUsage)
          .where(
            and(
              both(modelUsage),
              eq(modelUsage.purpose, purpose),
              inArray(modelUsage.outcome, [...BILLABLE_USAGE_OUTCOMES]),
              eq(modelUsage.consumedIncludedBuild, false),
              gte(modelUsage.createdAt, since)
            )
          );
        return row?.n ?? 0;
      },
      countOwnPosts: async () => {
        const [row] = await db
          .select({ n: count() })
          .from(onboardingInputs)
          .where(
            and(
              both(onboardingInputs),
              eq(onboardingInputs.inputClass, "own_post")
            )
          );
        return row?.n ?? 0;
      },
      countReferencePosts: async () => {
        const [row] = await db
          .select({ n: count() })
          .from(onboardingInputs)
          .where(
            and(
              both(onboardingInputs),
              eq(onboardingInputs.inputClass, "reference")
            )
          );
        return row?.n ?? 0;
      },
      // `tx` for the same reason `countBillableAttempts` takes a `conn`: the
      // scope closes over the POOL, and reading the pool from inside an open
      // transaction deadlocks on a single-connection driver.
      latestBrainActivation: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(brainActivationSnapshots)
          .where(both(brainActivationSnapshots))
          .orderBy(
            desc(brainActivationSnapshots.createdAt),
            desc(brainActivationSnapshots.id)
          )
          .limit(1),
      countOnboardingInputs: async () => {
        const [row] = await db
          .select({ n: count() })
          .from(onboardingInputs)
          .where(both(onboardingInputs));
        return row?.n ?? 0;
      },
      modelUsage: () => db.select().from(modelUsage).where(both(modelUsage)),
      // `conn` for the same reason `referenceCorpusAsOf` takes one: the scope
      // closes over the POOL, and reading the pool from inside an open
      // transaction deadlocks on a single-connection driver. The debit
      // transaction is exactly that caller.
      countBillableAttempts: async (
        { purpose, excludeAttemptId, earlierThanAttemptId },
        conn
      ) => {
        const on = conn ?? db;
        // The billable rows of this purpose for this profile, in the cage:
        // `both()` is the workspace+profile predicate every accessor here
        // shares, and it is applied to BOTH queries below.
        const scoped = and(
          both(modelUsage),
          eq(modelUsage.purpose, purpose),
          inArray(modelUsage.outcome, [...BILLABLE_USAGE_OUTCOMES]),
          // ...AND IT ACTUALLY CONSUMED THE INCLUDED BUILD (billing gate,
          // 2026-08-29). `outcome` alone counted a truncated reply — an outage
          // caused by this server's own reply ceiling — as the creator's one
          // free build, so their next press cost 50 credits and failed
          // identically. The column defaults to `true`, so this predicate
          // changes nothing for any row written before it existed.
          eq(modelUsage.consumedIncludedBuild, true)
        );

        let earlierThan: ReturnType<typeof sql> | undefined;
        if (earlierThanAttemptId !== undefined) {
          // WHERE THIS ATTEMPT SITS IN THE ORDER: its FIRST billable row. An
          // attempt may write several rows (a bounded retry), and its position
          // is where it started, not where it finished — otherwise a retrying
          // attempt could be overtaken by one that began after it.
          const [me] = await on
            // `string | null`, NOT `Date`: drizzle's node-postgres driver
            // installs string parsers for `timestamptz`, so this arrives with
            // FULL microsecond precision and is re-bound unchanged. Annotating
            // it `Date` was wrong and mattered: two reviewers read the `Date`
            // and concluded the ordering was truncated to milliseconds, which
            // measurement against the real driver refuted. A `.getTime()` here
            // would crash today.
            .select({ firstAt: sql<string | null>`min(${modelUsage.createdAt})` })
            .from(modelUsage)
            .where(and(scoped, eq(modelUsage.attemptId, earlierThanAttemptId)));

          if (me?.firstAt == null) {
            // UNREACHABLE ON THE PRICING PATH and deliberately not silent: R11
            // commits this attempt's `model_usage` row before the debit is
            // attempted, so asking where an attempt sits when it has no row is
            // asking about an attempt that does not exist. Answering 0 would
            // hand out a free build on the strength of a missing record —
            // absence read as an entitlement.
            throw new WorkspaceAccessError(
              "countBillableAttempts: cannot order against an attempt with no billable usage row"
            );
          }
          // STRICTLY earlier by (created_at, attempt_id) — a total order, so
          // exactly one attempt in any set has zero predecessors.
          earlierThan = sql`(${modelUsage.createdAt}, ${modelUsage.attemptId}) < (${me.firstAt}::timestamptz, ${earlierThanAttemptId})`;
        }

        const [row] = await on
          .select({ n: countDistinct(modelUsage.attemptId) })
          .from(modelUsage)
          .where(
            and(
              scoped,
              excludeAttemptId === undefined
                ? undefined
                : ne(modelUsage.attemptId, excludeAttemptId),
              earlierThan
            )
          );
        return row?.n ?? 0;
      },
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
  // ---- migration 0013 (slice 1). `creator_profiles.state` decides whether a
  // profile counts against the per-tier cap, so a caller who can supply it can
  // create straight into `archived` and hold unlimited profiles for free. The
  // column is server-derived at creation and moved only by an operation that
  // re-checks the cap — of which slice 1 ships none.
  "state",
] as const;

/**
 * Columns of `creator_profiles` a caller legitimately supplies.
 *
 * THE SAME CLOSED CLASSIFICATION `CALLER_SUPPLIABLE_BRAIN_FIELDS` gives
 * `brain_docs`, and it exists here for the reason C-32's own rationale gives:
 * that list "has now missed exactly one field in four consecutive rounds", and
 * the instrument that stopped the fifth miss was enumerating the drizzle table's
 * property space rather than trusting the hand-list. Slice 1 makes
 * `creator_profiles` a written table for the first time, so it gets the
 * instrument at the point of becoming writable rather than after its own fourth
 * miss (`packages/db/tests/profile-scope.test.ts`, the creator_profiles half).
 */
export const CALLER_SUPPLIABLE_PROFILE_FIELDS = ["displayName"] as const;

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
  /**
   * WHICH INTERVIEW QUESTION this row answers (slice 3b) — required for, and
   * ONLY for, `inputClass: 'creator_authored'`; see `onboarding_inputs`'
   * `field_key` column and the CHECK it carries. Any other class supplying one
   * is refused (`OnboardingInputFieldKeyError`), same as the class's own
   * schema comment states: it is not a foreign id and belongs to no other row.
   */
  fieldKey?: string;
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
  /**
   * Whether this attempt spent the profile's one included build.
   *
   * CALLER-SUPPLIED because only the operation knows: it comes off
   * `LlmError.consumesIncludedBuild`, which is the class's own answer to a
   * question `outcome` cannot carry (billing gate, 2026-08-29). It is not in
   * `GUARDED_WRITE_FIELDS` for the same reason `outcome` is not — a caller that
   * can already choose the outcome gains nothing by also choosing this, and the
   * one caller is `runInference`.
   */
  consumedIncludedBuild: boolean;
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

/** One source for the early edit-composer check and the locked hard-path check. */
export const STALE_BRAIN_EDIT_DETAIL =
  "only the current editable version can be edited. Edit the newest proposed version when it is newer than the active version; otherwise edit the active version. Superseded and stale versions are read-only history";

/**
 * The one version the current screen may edit.
 *
 * A proposal outranks active only when it is actually a later version. Rows
 * written before the one-proposal invariant may contain `active v2` beside a
 * stale `proposed v1`; choosing "any proposal" there disagrees with the screen
 * and prevents the creator from writing v3, which is the repair path that also
 * retires v1. Compute by version rather than trusting row order so both the
 * early composer check and locked hard-path check share the exact rule.
 */
export function authoritativeEditableBrainDoc(
  versions: readonly BrainDoc[]
): BrainDoc | null {
  let proposed: BrainDoc | null = null;
  let active: BrainDoc | null = null;
  for (const version of versions) {
    if (
      version.status === "proposed" &&
      (proposed === null || version.version > proposed.version)
    ) {
      proposed = version;
    }
    if (
      version.status === "active" &&
      (active === null || version.version > active.version)
    ) {
      active = version;
    }
  }
  if (proposed && (!active || proposed.version > active.version)) return proposed;
  return active ?? proposed;
}

async function assertAuthoritativeBrainTarget(
  scope: ProfileScope,
  kind: BrainKind,
  targetId: string,
  tx: TxLike
): Promise<void> {
  const versions = await scope.accessors.brainDocsByKind(kind, tx);
  if (authoritativeEditableBrainDoc(versions)?.id !== targetId) {
    throw new ProvenanceError(STALE_BRAIN_EDIT_DETAIL);
  }
}

export type ConfirmBrainDocParams = {
  brainDocId: string;
  /** RFC-6901 pointers the human confirmed, and how (C-18). */
  confirmedFields: { pointer: string; asPlaceholder: boolean }[];
};

export type ActivateBrainDocParams = {
  brainDocId: string;
};

/**
 * The result of `activateBrainDocCoherent` (slice 3b, R8): the newly-active
 * document, AND the append-only snapshot row recorded alongside it.
 *
 * A PAIR, not just the doc, because the snapshot is the whole point of the
 * "coherent" half — a caller that discarded it would have no way to name
 * WHICH snapshot a later generation ran under (R9), which is the property
 * this capability exists to make recordable.
 */
export type ActivateBrainDocCoherentResult = {
  doc: BrainDoc;
  snapshot: BrainActivationSnapshot;
};

export type ProfileWriteCapabilities = {
  appendOnboardingInput: (
    input: AppendOnboardingInputParams,
    tx?: TxLike
  ) => Promise<OnboardingInput>;
  recordModelUsage: (
    usage: RecordModelUsageParams,
    tx: TxLike
  ) => Promise<ModelUsageRow>;
  writeBrainDoc: (
    doc: WriteBrainDocParams,
    tx: TxLike,
    expectedEditableBaseId?: string
  ) => Promise<BrainDoc>;
  confirmBrainDocFields: (
    params: ConfirmBrainDocParams,
    tx: TxLike
  ) => Promise<BrainDoc>;
  activateBrainDoc: (
    params: ActivateBrainDocParams,
    tx: TxLike
  ) => Promise<BrainDoc>;
  /**
   * Activate ONE document (exactly `activateBrainDoc`'s own logic — this is
   * not a second implementation, see the definition below) and, in the SAME
   * transaction and under the SAME per-profile lock, record a
   * `brain_activation_snapshots` row naming every kind's current active
   * version: the one just activated, and every OTHER kind's active id
   * UNCHANGED (R8). All-or-nothing — a generation must never observe a
   * half-activated set.
   */
  activateBrainDocCoherent: (
    params: ActivateBrainDocParams,
    tx: TxLike
  ) => Promise<ActivateBrainDocCoherentResult>;
  /**
   * THE DURABLE CLAIM (slice 6, R14), committed BEFORE outbound HTTP.
   *
   * Insert-or-observe: `onConflictDoNothing` then a SCOPED re-read, so two
   * concurrent presses of one attempt id produce exactly one row and exactly
   * one `created: true`. Only that winner may execute the vendor sequence,
   * and the loser is told the claim is already running rather than calling a
   * vendor a second time for the same money.
   *
   * `created` is derived from whether THIS statement's `.returning()` yielded
   * a row — not from a prior "does it exist?" read, which is the read-then-
   * write with no constraint behind it that `credit_ledger`'s partial uniques
   * exist to refuse. `generation_attempts_attempt_uq` is what decides.
   */
  claimGenerationAttempt: (
    params: ClaimGenerationAttemptParams,
    tx: TxLike
  ) => Promise<ClaimGenerationAttemptResult>;
  /**
   * Move a claim forward one step (R14's server-derived state machine).
   *
   * THE FROM-STATE IS IN THE `WHERE`, not in a read-then-update: the update
   * matches only rows already in a state this transition is legal from, so a
   * transition that would skip a step (or replay one) updates ZERO rows and
   * refuses. That is the half of "forward only" application code owns —
   * `generation-schema.ts` records that Postgres cannot compare a row to its
   * own previous value without a trigger.
   *
   * `settled` is deliberately NOT reachable here. It is
   * `settleGeneration`'s alone, because
   * `generation_attempts_settled_has_generation` is an EQUALITY and the only
   * way to satisfy it is to write the generation and the transition together.
   */
  advanceGenerationAttempt: (
    params: AdvanceGenerationAttemptParams,
    tx: TxLike
  ) => Promise<GenerationAttempt>;
  /**
   * THE SETTLEMENT (R14b): the stored generation AND its claim's transition to
   * `settled`, in ONE call so they are in one transaction by construction.
   *
   * The debit is NOT here — it is `debitCredits` in `@respin/credits`, which
   * this package cannot see — but `debitLedgerId` is, so the row records which
   * ledger row paid for it. The caller composes both into a single
   * workspace-locked transaction; `tx` is REQUIRED (never optional) for the
   * reason `recordModelUsage`'s own docblock gives: an optional `tx` made a
   * shared-fate claim false with no compiler signal.
   */
  settleGeneration: (
    params: SettleGenerationParams,
    tx: TxLike
  ) => Promise<SettleGenerationResult>;
  /**
   * The stored generation for an attempt, if one settled (R14c).
   *
   * A READ on the WRITE capability, like `countActiveProfiles` one function
   * over, and for the same reason: its only purpose is to decide a write. A
   * re-submission of an already-settled attempt must return the stored record
   * WITHOUT another vendor call, and this is what it returns.
   */
  readGenerationForAttempt: (
    attemptId: string,
    tx: TxLike
  ) => Promise<Generation | undefined>;
  /**
   * The claim itself, re-read INSIDE the caller's transaction (R14c).
   *
   * A READ on the WRITE capability for the same reason as its neighbour: its
   * only purpose is to decide a write. The settlement takes the workspace
   * lock and then asks THIS what state the claim is in — because a retry and
   * the original press can both be holding a `vendor_complete` row they read
   * before the lock, and only one of them may debit. Deciding that from a
   * value read before the lock is the read-then-write two connections both
   * answer "no" to.
   */
  readGenerationAttempt: (
    attemptId: string,
    tx: TxLike
  ) => Promise<GenerationAttempt | undefined>;
};

/**
 * The attempt-claim's caller-suppliable fields (slice 6, R14).
 *
 * EVERY OTHER COLUMN IS BUILT FIELD BY FIELD IN THE CAPABILITY and never
 * spread from this object — which is a STRONGER guarantee than
 * `stripGuarded` gives the older capabilities, not a weaker one: a value
 * smuggled in through `as unknown as` cannot be stripped incorrectly because
 * it is never copied at all. `state`, the four timestamps and both terminal
 * ids are therefore unreachable from a caller by construction, and
 * `profile-scope.test.ts` drives that with a cast rather than only with
 * `@ts-expect-error` (CLAUDE.md 2026-08-21: proving a field cannot be TYPED is
 * not proving it cannot be CAST).
 */
export type ClaimGenerationAttemptParams = {
  attemptId: string;
  /** R12's per-purpose grain — the same value `model_usage.purpose` carries. */
  purpose: string;
  mode: string;
  /** Lowercase hex sha256 of the assembled request. CHECKed by the table. */
  payloadSha256: string;
};

export type ClaimGenerationAttemptResult = {
  attempt: GenerationAttempt;
  /** True only for the caller whose INSERT landed the row (R14's winner). */
  created: boolean;
};

export type AdvanceGenerationAttemptParams =
  | { attemptId: string; to: "vendor_started" }
  | {
      attemptId: string;
      to: "vendor_complete";
      /**
       * THE DURABLE VALIDATED CANDIDATE (R14c) — the settlement's whole input,
       * stored by the SAME statement that stamps the response checkpoint.
       *
       * REQUIRED, WITH NO DEFAULT, and this package deliberately does not
       * know its shape: `Record<string, unknown>` rather than `unknown`
       * because `unknown` admits `undefined`, drizzle drops an `undefined`
       * from the SET, and the row would then reach `vendor_complete` carrying
       * nothing. The database refuses that anyway
       * (`generation_attempts_candidate_iff_vendor_complete` is an equality),
       * so this type is the first of two closed doors rather than the only
       * one. What the object MEANS is `packages/credits`' — the only caller —
       * and it parses what it reads back fail-closed rather than trusting
       * that it wrote it.
       */
      candidate: Record<string, unknown>;
    }
  | { attemptId: string; to: "refused"; refusalCode: string }
  | { attemptId: string; to: "recovery_required" };

export type SettleGenerationParams = {
  attemptId: string;
  /** Must equal the claim's mode — `generations_attempt_fk` enforces it. */
  mode: string;
  brainActivationId: string;
  frameworkVersions: { id: string; version: number }[];
  contextInputIds: string[];
  request: unknown;
  model: string;
  promptBundleVersion: string;
  configVersion: number;
  outcome: GenerationOutcome;
  /** Non-null exactly when `outcome === "usable"` (table CHECK). */
  output: unknown | null;
  /** Non-blank exactly when `outcome === "usable"` (REQ-I04). */
  weakestPoint: string | null;
  /** Non-blank exactly when `outcome === "honest_refusal"` (REQ-C03). */
  refusalReason: string | null;
  killTest: unknown;
  /** R6's bound, CHECKed at 0..1 by the table. */
  rewriteCount: number;
  /** The ledger row that paid for it, or null for a zero-cost mode. */
  debitLedgerId: string | null;
};

export type SettleGenerationResult = {
  generation: Generation;
  attempt: GenerationAttempt;
};

/**
 * A generation-attempt transition that the claim's CURRENT state does not
 * permit, or an attempt id this profile does not own.
 *
 * ONE CLASS FOR BOTH, and the message is byte-identical, for the enumeration
 * reason `mintProfileScope` states: an attempt id that exists under another
 * workspace and one that does not exist at all must be indistinguishable from
 * the outside.
 */
export class GenerationAttemptStateError extends Error {
  constructor(
    readonly attemptId: string,
    readonly to: string
  ) {
    super(
      `This generation attempt cannot move to '${to}' from where it is. Either it is not this creator's attempt, or it has already moved on. Nothing was changed.`
    );
    this.name = "GenerationAttemptStateError";
  }
}

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

/**
 * The role gate on the profile-grained WRITES, as opposed to the two acts that
 * decide what the product believes (`assertMayDecide` above).
 *
 * ADDED BY THE TENANCY GATE'S BLOCK, 2026-08-27 — register item G-13, whose
 * deferral that same Critical Path withdrew in writing on 2026-08-26. Slice 1
 * gave `createProfile` a role gate and left THIS side of the same question
 * undecided, which is the "by omission" that decision R-35 §4 condemns in its
 * own text. The write that mattered is `appendOnboardingInput`: slice 1's paste
 * form makes it reachable from a browser for every role, `onboarding_inputs` is
 * immutable with no delete path, it is export-included, and its rows are both
 * the reference corpus and the corpus every `source_evidence` offset indexes
 * into — so a viewer's paste is not reversible by the owner.
 *
 * Applied to ALL THREE previously ungated capabilities rather than only the
 * newly reachable one, because "fix the class, not the field" is the repo's
 * 2026-07-30 lesson and a guard added only where today's caller happens to be
 * is the shape that produced this finding.
 */
function assertMayWrite(role: MembershipRole, act: string): void {
  if (role === "viewer") throw new ProfileRoleError(act, role);
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

/** The most a `creator_profiles.display_name` may hold, in code points. */
export const DISPLAY_NAME_MAX = 80;

/**
 * Normalise and validate a creator-profile display name, or refuse by name.
 *
 * NFC + trim, matching `normaliseContent`'s normalisation so that two names a
 * person cannot tell apart are one name here too — an accented character typed
 * as one code point and as a base-plus-combining pair are different bytes and
 * the same name, and only one of the two forms would ever match a later lookup.
 *
 * MEASURED IN CODE POINTS, not `.length`: a single emoji is several UTF-16
 * units, so a UTF-16 ceiling silently spends a creator's budget several times
 * over on one character they typed once. Code points still over-count a ZWJ
 * sequence, which is stated rather than hidden — it is the honest direction (a
 * permissive ceiling refuses no reasonable name), and a grapheme segmenter here
 * would be a second `Intl.Segmenter` dependency for a field nothing measures
 * offsets into.
 *
 * Control characters are refused rather than stripped. Stripping would store a
 * name the person did not type and never tell them; refusing costs one edit.
 */
export function normaliseDisplayName(raw: string): string {
  const name = raw.normalize("NFC").trim();
  if (name.length === 0) throw new ProfileNameError("it is blank");
  const points = [...name].length;
  if (points > DISPLAY_NAME_MAX) {
    throw new ProfileNameError(
      `it is ${points} characters and the limit is ${DISPLAY_NAME_MAX}`
    );
  }
  // C0 and C1 control characters, DEL included. `\p{Cc}` with the `u` flag is
  // the Unicode category, not a hand-listed range that forgets U+0085.
  if (/\p{Cc}/u.test(name)) {
    throw new ProfileNameError(
      "it contains a line break or another control character"
    );
  }
  return name;
}

/**
 * The WORKSPACE-grained write surface (slice 1).
 *
 * A SECOND FUNCTION RATHER THAN A BRANCH INSIDE `writeCapabilities`, because
 * the two grains are not interchangeable: every capability below runs BEFORE
 * any profile exists, so there is no `ProfileScope` to hold and no `profileId`
 * to filter on. Folding them together would mean a function whose scope
 * argument is sometimes one cage and sometimes the other, which is the
 * `instanceof` shape the cage header already explains is wrong.
 *
 * Denied to `app/**` by the same default-deny allowlist that denies
 * `writeCapabilities` — it is simply absent from `allowImportNames`, and
 * `tests/import-boundary.test.ts` carries the deny fixture that proves absence
 * still means denied.
 *
 * IT DOES NOT ENFORCE THE CAP, and that is a layering fact rather than an
 * omission (R-30 constraint 2): the cap is the active config document's
 * `profileCaps` for the workspace's RESOLVED TIER, whose sole authority is
 * `getWorkspaceBillingState` in @respin/credits — a package that depends on
 * this one. `@respin/db` re-deriving the tier would be a second tier authority,
 * which is the defect class behind two M1 round-6 findings. So this file owns
 * the INSERT and the COUNT; `packages/credits/src/profiles.ts` owns the
 * decision, and `tests/table-writers.test.ts` asserts the insert has no other
 * caller.
 */
export type WorkspaceWriteCapabilities = {
  /**
   * How many profiles count against the cap right now.
   *
   * `active` ONLY — see `creatorProfileState` in brain-schema.ts for why
   * capacity is reduced by archiving rather than deleting, and for the debt
   * that choice leaves with whichever slice adds a reactivate operation.
   */
  countActiveProfiles: (tx: TxLike) => Promise<number>;
  createProfile: (
    params: { displayName: string } & NoServerFields,
    tx: TxLike
  ) => Promise<CreatorProfile>;
};

export function workspaceWriteCapabilities(
  scope: WorkspaceScope
): WorkspaceWriteCapabilities {
  // Cage assertion FIRST, before any field of `scope` is read — and membership
  // in the WORKSPACE cage specifically, so a genuinely minted ProfileScope
  // (wrong grain, and one a viewer can hold) cannot reach a workspace write.
  assertScoped(scope);
  if (!workspaceCage.has(scope)) {
    throw new ScopeForgeryError("A workspace write-capability holder");
  }
  const workspaceId = scope.workspaceId as string;

  return {
    countActiveProfiles: async (tx) => {
      const [row] = await tx
        .select({ n: count() })
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.workspaceId, workspaceId),
            eq(creatorProfiles.state, "active")
          )
        );
      return row?.n ?? 0;
    },

    createProfile: async (params, tx) => {
      // BELT AND BRACES with the gate in `packages/credits/src/profiles.ts`.
      // The CAP genuinely cannot move here (R-30 constraint 2 — this package
      // cannot see config or the tier), but the ROLE can: `scope.role` is right
      // there. This function is exported from `@respin/db`'s root, so every
      // package can import it, and a caller-side-only guard on a documented
      // direct entrypoint is a documented bypass (CLAUDE.md 2026-07-30).
      assertMayWrite(scope.role, "create a creator profile");
      // Read ONCE into a local, for the TOCTOU reason `writeBrainDoc`'s C-40
      // comment gives: `params` is a plain object type, so `displayName` may be
      // a getter that returns one value to the validator and another to the
      // insert.
      const displayName = normaliseDisplayName(params.displayName);
      const [row] = await tx
        .insert(creatorProfiles)
        // Strip FIRST, ids LAST — the same order and the same reason as
        // `appendOnboardingInput`: either alone would hold today, and the
        // planted mutation that reverses the spread is what keeps the strip
        // load-bearing rather than inert.
        .values({
          ...(stripGuarded(params) as Record<string, never>),
          displayName,
          workspaceId,
        })
        .returning();
      return row;
    },
  };
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
  // BOTH AXES, for the same reason `ProfileScope`'s own `both()` exists: the
  // profile predicate alone is wrong for a re-parented row and the workspace
  // predicate alone is wrong for a sibling profile. Its own local here rather
  // than the accessors' closure, because `writeCapabilities` is a separate
  // function and reaching into the scope's constructor scope is not possible.
  const both = (t: { profileId: unknown; workspaceId: unknown }) =>
    and(
      eq(t.profileId as never, ids.profileId),
      eq(t.workspaceId as never, ids.workspaceId)
    );

  // A `const` BOUND BEFORE ITS OWN LAST PROPERTY REFERENCES IT, not a bare
  // `return {...}` — `activateBrainDocCoherent` below calls
  // `caps.activateBrainDoc(...)` to run EXACTLY `activateBrainDoc`'s own
  // logic rather than a second copy of it. That is safe (not a
  // use-before-assignment) because `caps` is only ever READ from inside an
  // arrow function that executes LATER, on a call, never while this object
  // literal is being constructed.
  const caps: ProfileWriteCapabilities = {
    appendOnboardingInput: async (input, tx) => {
      // REQ-A02 / G-13. See `assertMayWrite` — this is the write slice 1 made
      // browser-reachable, into an immutable table with no delete path.
      assertMayWrite(scope.role, "add a post to this creator's record");
      // MIRRORS `onboarding_inputs_field_key_iff_creator_authored` IN
      // APPLICATION CODE, before the insert reaches it — the same reason
      // `writeBrainDoc` names its own non-empty-`sourceEvidence` refusal
      // rather than letting a caller see a raw 23514/23502. Read ONCE into
      // locals for the same TOCTOU reason `writeBrainDoc`'s C-40 comment
      // gives: `input` is a plain object type, so a getter could disagree
      // between this check and the `.values()` spread below.
      const inputClass = input.inputClass;
      const rawFieldKey = input.fieldKey;
      const rawSourceUrl = input.sourceUrl;
      const fieldKey =
        typeof rawFieldKey === "string" ? rawFieldKey.normalize("NFC") : rawFieldKey;
      const sourceUrl =
        typeof rawSourceUrl === "string" ? rawSourceUrl.normalize("NFC") : rawSourceUrl;
      if (inputClass === "creator_authored") {
        if (typeof fieldKey !== "string" || fieldKey.trim().length === 0) {
          throw new OnboardingInputFieldKeyError(inputClass, undefined);
        }
      } else if (fieldKey !== undefined) {
        throw new OnboardingInputFieldKeyError(inputClass, fieldKey);
      }
      const content = normaliseContent(input.content);
      const contentLength = [...content].length;
      if (content.trim().length === 0) {
        throw new OnboardingInputLimitError("the normalized content is blank");
      }
      if (contentLength > POST_CONTENT_MAX) {
        throw new OnboardingInputLimitError(
          `the normalized content is ${contentLength} characters and the limit is ${POST_CONTENT_MAX}`
        );
      }
      if (typeof fieldKey === "string" && [...fieldKey].length > ONBOARDING_FIELD_KEY_MAX) {
        throw new OnboardingInputLimitError(
          `field_key is longer than ${ONBOARDING_FIELD_KEY_MAX} characters`
        );
      }
      if (sourceUrl !== undefined && typeof sourceUrl !== "string") {
        throw new OnboardingInputLimitError("source_url must be text when supplied");
      }
      if (typeof sourceUrl === "string" && [...sourceUrl].length > ONBOARDING_SOURCE_URL_MAX) {
        throw new OnboardingInputLimitError(
          `source_url is longer than ${ONBOARDING_SOURCE_URL_MAX} characters`
        );
      }
      const insert = async (conn: TxLike): Promise<OnboardingInput> => {
        await conn.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${scope.workspaceId}:${scope.profileId}`}, 0))`
        );
        const [{ existing }] = await conn
          .select({ existing: count() })
          .from(onboardingInputs)
          .where(
            and(
              eq(onboardingInputs.profileId, scope.profileId),
              eq(onboardingInputs.workspaceId, scope.workspaceId)
            )
          );
        if (existing >= POST_COUNT_MAX) {
          throw new OnboardingInputLimitError(
            `this creator profile already holds ${existing} immutable inputs and the limit is ${POST_COUNT_MAX}`
          );
        }
        const [row] = await conn
          .insert(onboardingInputs)
          .values({
            ...(stripGuarded(input) as { inputClass: InputClass }),
            inputClass,
            fieldKey: fieldKey ?? null,
            sourceUrl: sourceUrl ?? null,
            content,
            contentSha256: createHash("sha256")
              .update(Buffer.from(content, "utf8"))
              .digest("hex"),
            ...ids,
          })
          .returning();
        return row;
      };
      return tx ? insert(tx) : db.transaction(insert);
    },

    recordModelUsage: async (usage, tx) => {
      // NO ROLE GATE, DELIBERATELY — and the round-2 billing gate is why this
      // comment exists rather than the gate. The G-13 fix added
      // `assertMayWrite` to every previously ungated capability, which was the
      // right instinct applied to the one capability that is exempt: this is
      // the A-7 SETTLEMENT TAIL. `model_usage` records a fact the provider has
      // already billed us for, and it takes `tx: TxLike` so it composes into
      // the generation's own transaction — so a refusal here rolls the debit
      // back AFTER the tokens are burnt, and the spend record vanishes. It is
      // the `maybeAutoTopup` shape this package has fixed once already.
      //
      // `tx` IS REQUIRED, not optional (billing + tenancy gate finding,
      // 2026-08-29). Slice 2b composed `upsertSpendRollup` into this same
      // function, whose own docblock claims "this function takes a TxLike,
      // never a bare DbLike, so that composing it outside a transaction is a
      // TYPE error, not a runtime one" — but the parameter here was still
      // optional, so `conn = tx ?? db` and an `as TxLike` cast around it made
      // that claim false: a caller that omitted `tx` ran BOTH writes as
      // separate auto-committing statements, silently breaking R6's shared
      // fate with no compiler signal. The one production caller
      // (`inference.ts`) always supplies `tx`; there is no legitimate reason
      // for this capability to run outside a transaction, so the type now
      // says so.
      //
      // The act to gate is the GENERATION, not its settlement record.
      assertMeteringOnly(usage.usageRaw);
      const [row] = await tx
        .insert(modelUsage)
        .values({
          ...(stripGuarded(usage) as { attemptId: string }),
          ...ids,
        } as never)
        .returning();
      // R1 (slice 2b): the rollup upsert composes into the SAME transaction
      // that just wrote `row` above (no more optional/bare-`db` path — see
      // this function's own doc), so a forced failure of either write rolls
      // the other back with it (R6, proven on real Postgres in
      // spend-rollup.docker.test.ts). Built from the RETURNED row's own
      // fields, never re-reading `usage`: `row.createdAt` is the value
      // Postgres actually stamped (`clock_timestamp()`), which is what R2
      // requires the period bucket to agree with.
      await upsertSpendRollup(tx, {
        workspaceId: row.workspaceId,
        createdAt: row.createdAt,
        resolvedTier: row.resolvedTier,
        costMicroUsd: row.costMicroUsd,
        costState: row.costState,
      });
      return row;
    },

    writeBrainDoc: async (doc, tx, expectedEditableBaseId) => {
      // REQ-G08: a brain write is an ENTITLEMENT, so it is refused while the
      // workspace is paused. `appendOnboardingInput` and `recordModelUsage`
      // deliberately are not (A-7): storing the creator's own submitted text
      // is not an entitlement and refusing it would silently discard their
      // work, and recording spend already incurred is the settlement tail.
      assertMayWrite(scope.role, "write a brain document for this creator");
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
      if (sourceEvidence.length > BRAIN_EVIDENCE_ENTRY_MAX) {
        throw new BrainDocumentLimitError(
          `it carries ${sourceEvidence.length} evidence entries and the limit is ${BRAIN_EVIDENCE_ENTRY_MAX}`
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
      const [{ retainedVersions }] = await tx
        .select({ retainedVersions: count() })
        .from(brainDocs)
        .where(
          and(
            eq(brainDocs.profileId, scope.profileId),
            eq(brainDocs.workspaceId, scope.workspaceId)
          )
        );
      if (retainedVersions >= BRAIN_VERSION_MAX) {
        throw new BrainVersionLimitError(BRAIN_VERSION_MAX);
      }
      // EDIT AUTHORITY IS RE-CHECKED UNDER THE WRITE LOCK. `brain-ops.ts`
      // performs the same check before composing its creator_authored input so
      // an ordinary stale request does no work, but only this check closes the
      // race where two requests both read the same current base before either
      // writes. The first replacement changes the authoritative base; the
      // second then refuses here and its surrounding transaction rolls its
      // input back.
      if (expectedEditableBaseId !== undefined) {
        await assertAuthoritativeBrainTarget(scope, kind, expectedEditableBaseId, tx);
      }
      const content = parseBrainContent(kind, rawContent);
      // THE ONE CORPUS (C-29), read HERE — moved AHEAD of `validateSourceEvidence`
      // in slice 4, because G-11 Layer B's bucket map has to exist before that
      // function can assign a `postSha` to a `reference`-classed span. Recording
      // the id set is what lets activation judge this version against the
      // corpus the WRITE was judged against: `defaultNow()` is
      // transaction-START time, so an input whose transaction starts before
      // this write and commits after it is invisible now AND inside any
      // timestamp-bounded corpus rebuilt at activation — which would brick the
      // version permanently, with a priced rebuild as the only remedy. The set
      // is the fix, not a tighter timestamp.
      const corpus = await scope.accessors.referenceCorpusAsOf(undefined, tx);
      // G-11 LAYER B, computed ONCE for this write and shared by both halves of
      // the budget below — see `groupReferenceInputs`'s docblock (echo.ts) for
      // why a new span and every retained span must agree on bucket membership
      // within one write.
      const bucketOf = groupReferenceInputs(corpus.inputs);
      const { clean, referenceSpans } = await validateSourceEvidence(
        tx,
        scope,
        kind,
        sourceEvidence,
        bucketOf
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
      if (claimPositions.length > BRAIN_CLAIM_POSITION_MAX) {
        throw new BrainDocumentLimitError(
          `it declares ${claimPositions.length} claim positions and the limit is ${BRAIN_CLAIM_POSITION_MAX}`
        );
      }
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
      // G-10, THE THIRD DIRECTION (R7/R8, slice 4): every CITED entry names a
      // position that holds a STATED value, never `[check]`. The two loops
      // beside this one already assert declared<-cited (above) and
      // stated=>cited (below); neither ever checked cited=>stated, so an entry
      // could point at a `[check]` position and store an unbounded quote as
      // "evidence" for a claim the document never actually makes —
      // `source_evidence` becoming a text channel with no claim behind it.
      // Together the three directions make citation and statement a bijection:
      // a position is cited if and only if it is stated.
      for (const e of clean) {
        if (readPointer(content, e.field) === CHECK) {
          throw new ProvenanceError(
            `an evidence entry cites the claim position '${e.field}', which currently holds '${CHECK}' rather than a stated value. Evidence can only support a claim actually being made — state the value first, or drop the entry that cites it (REQ-B02, G-10)`
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
      // The quote budget's unit is `(profile, reference POST BUCKET)` across
      // every retained version and kind (C-41, G-11), so the spans this write
      // adds are measured together with every span already on the profile. The
      // measure is the UNION of covered ranges, which is what keeps a rebuild
      // citing the same spans free — see `assertReferenceQuoteBudget`.
      // NEW spans and RETAINED spans are passed separately, which is what lets
      // the ceiling refuse only on material this write actually adds. See
      // `evaluateReferenceSafety` preserves the budget's never-brick rule — a
      // union already over the ceiling must not block a re-citing rebuild.
      const retainedSpans = await retainedReferenceSpans(tx, scope, bucketOf);
      assertReferenceSafety(
        evaluateReferenceSafety({
          content,
          references: corpus.inputs,
          newSpans: referenceSpans,
          retainedSpans,
        })
      );
      const documentLength = [
        ...JSON.stringify({ content, sourceEvidence: clean }),
      ].length;
      if (documentLength > BRAIN_DOCUMENT_TEXT_MAX) {
        throw new BrainDocumentLimitError(
          `its normalized content and evidence total ${documentLength} characters and the limit is ${BRAIN_DOCUMENT_TEXT_MAX}`
        );
      }
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
      // ONE CURRENT PROPOSAL PER (workspace, profile, kind), enforced inside
      // the SAME transaction and under the SAME profile advisory lock as the
      // version allocation above. A new proposal replaces every older draft;
      // leaving two proposed rows lets the read facade select the older one
      // and offer a creator a rollback disguised as confirmation.
      //
      // ACTIVE IS DELIBERATELY ABSENT FROM THE PREDICATE. Writing a replacement
      // draft must not change what is in force; `activateBrainDoc` remains the
      // sole transition that supersedes an active version.
      //
      // `row.createdAt` is the database-stamped identity of this proposal
      // transition. Older proposals receive that exact timestamp so history's
      // `replacementVersionFor` can name THIS version without guessing the
      // nearest higher number. Content and evidence remain append-only; only
      // lifecycle status/timestamp columns change.
      await tx
        .update(brainDocs)
        .set({ status: "superseded", supersededAt: row.createdAt })
        .where(
          and(
            eq(brainDocs.profileId, scope.profileId),
            eq(brainDocs.workspaceId, scope.workspaceId),
            eq(brainDocs.kind, kind),
            eq(brainDocs.status, "proposed"),
            ne(brainDocs.id, row.id)
          )
        );
      return row;
    },

    confirmBrainDocFields: async (params, tx) => {
      assertMayDecide(scope.role, "confirm");
      // THE SAME LOCK `writeBrainDoc` TAKES, and for a sharper reason (tenancy
      // gate BLOCK, 2026-08-29). Confirmation and activation are both
      // read-then-write: `readOwnBrainDoc` is a plain SELECT, so under READ
      // COMMITTED activation can read `confirmed_fields` holding all ten
      // positions, a concurrent confirm can commit `[]`, and activation's
      // UPDATE — whose predicate tests only ids — proceeds anyway. The row
      // ends `active`, stamped with a real human's `confirmed_by`, with ZERO
      // positions confirmed. `brain_docs_active_is_confirmed` cannot catch it
      // (it tests NOT NULL, not coverage), and AC-26 is application-code only
      // by design — which is exactly why the two acts must serialise.
      //
      // That is a SILENT BRAIN ACTIVATION: the product acting on rules about a
      // person that nobody confirmed, with a record asserting they did (R-8,
      // REQ-B02). Same key as the write, because the invariant spans the
      // (workspace, profile) pair rather than one row.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${scope.workspaceId}:${scope.profileId}`}, 0))`
      );
      if (await hasOpenPause(tx, scope.workspaceId)) {
        throw new WorkspacePausedError();
      }
      const doc = await readOwnBrainDoc(tx, scope, params.brainDocId);
      if (doc.status !== "proposed") {
        throw new ProvenanceError(
          `only a proposed version can be confirmed; this one is '${doc.status}'`
        );
      }
      // Status has the established, more specific refusal contract for an
      // active/superseded row. A stale proposed row still reaches this hard
      // replay gate and cannot be confirmed from history.
      await assertAuthoritativeBrainTarget(scope, doc.kind, doc.id, tx);
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
      // AN EMPTY SUBMISSION IS NOT A CONFIRMATION (tenancy + compliance gates,
      // 2026-08-29). It used to pass every check below vacuously and then stamp
      // `confirmed_at`, `confirmed_by` and `confirmed_content_sha256` — so the
      // row read "a named human confirmed this document" while recording that
      // they confirmed nothing. `brain_schema.ts` makes the NULL-vs-`[]`
      // distinction the thing that answers "did a human decide anything here",
      // and stamping an attributable decision over an empty set destroys it.
      if (confirmedFields.length === 0) {
        throw new ProvenanceError(
          "a confirmation has to name at least one field the creator decided about. Nothing was recorded, and anything already confirmed on this version is untouched (REQ-B02)"
        );
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
      // THE SHA IS OVER WHAT THE HUMAN SAW — the claim AND the quote behind it
      // (B-3). Activation re-computes it and refuses on a mismatch, which is
      // what stops a version being confirmed in one shape and activated in
      // another (round-2 V3). `confirmationSha256`'s docblock carries why the
      // pair, and why this is the only cheap moment to widen it.
      const [row] = await tx
        .update(brainDocs)
        .set({
          confirmedAt: new Date(),
          // SERVER-DERIVED from the session (C-13). Round 1 found this
          // forgeable as a parameter: a confirmation is an attributable act, so
          // it takes an id nobody can pass in.
          confirmedBy: scope.userId,
          confirmedContentSha256: confirmationSha256(
            doc.content,
            doc.sourceEvidence
          ),
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
      // THE SAME LOCK `writeBrainDoc` TAKES, and for a sharper reason (tenancy
      // gate BLOCK, 2026-08-29). Confirmation and activation are both
      // read-then-write: `readOwnBrainDoc` is a plain SELECT, so under READ
      // COMMITTED activation can read `confirmed_fields` holding all ten
      // positions, a concurrent confirm can commit `[]`, and activation's
      // UPDATE — whose predicate tests only ids — proceeds anyway. The row
      // ends `active`, stamped with a real human's `confirmed_by`, with ZERO
      // positions confirmed. `brain_docs_active_is_confirmed` cannot catch it
      // (it tests NOT NULL, not coverage), and AC-26 is application-code only
      // by design — which is exactly why the two acts must serialise.
      //
      // That is a SILENT BRAIN ACTIVATION: the product acting on rules about a
      // person that nobody confirmed, with a record asserting they did (R-8,
      // REQ-B02). Same key as the write, because the invariant spans the
      // (workspace, profile) pair rather than one row.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${scope.workspaceId}:${scope.profileId}`}, 0))`
      );
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
      // Keep the ordinary status-specific refusal above, then apply the hard
      // replay gate to a row that still claims to be proposed. That preserves
      // the existing action contract without reopening legacy stale drafts.
      await assertAuthoritativeBrainTarget(scope, doc.kind, doc.id, tx);
      if (doc.confirmedAt === null || doc.confirmedContentSha256 === null) {
        throw new ProvenanceError(
          "this version has not been confirmed, and an unconfirmed version is never activated — activation is what makes the product act on a claim about you (REQ-B02)"
        );
      }
      // RE-COMPUTED OVER THE PAIR (B-3), so a change to EITHER half refuses.
      // The message names both halves because "content has changed" sent a
      // creator looking at their rules for an edit that had happened to a
      // quote.
      if (
        confirmationSha256(doc.content, doc.sourceEvidence) !==
        doc.confirmedContentSha256
      ) {
        throw new ProvenanceError(
          "this version's content or the quotes behind it have changed since it was confirmed, so the confirmation no longer describes what would be activated. Re-confirm the current version"
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
      // Compatibility repair for rows written before proposal replacement was
      // enforced in `writeBrainDoc`: activating the chosen proposal retires
      // every other proposal of this kind in the SAME transition. Fresh data
      // reaches this as a no-op (the write invariant leaves one proposal), but
      // without it a pre-existing stale proposal becomes "current" as soon as
      // the chosen replacement turns active. The identical `now` lets history
      // attribute those repaired rows to the version activated below.
      await tx
        .update(brainDocs)
        .set({ status: "superseded", supersededAt: now })
        .where(
          and(
            eq(brainDocs.profileId, scope.profileId),
            eq(brainDocs.workspaceId, scope.workspaceId),
            eq(brainDocs.kind, doc.kind),
            eq(brainDocs.status, "proposed"),
            ne(brainDocs.id, doc.id)
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

    activateBrainDocCoherent: async (params, tx) => {
      // EXACTLY `activateBrainDoc`'s OWN LOGIC, not a parallel implementation
      // (slice 3b, R8) — every gate above (the role check, the per-profile
      // lock, the pause gate, AC-26's coverage check, the R-3 echo re-run,
      // the supersede-then-activate pair) runs unchanged, because this calls
      // the SAME closure the `activateBrainDoc` capability calls. The lock it
      // takes as its own FIRST statement is what makes the snapshot insert
      // below share the activation's transaction AND its serialisation: a
      // Postgres advisory xact lock is reentrant WITHIN one session/tx (a
      // second acquire of the same key by the same transaction returns
      // immediately), and the lock is held until this transaction commits —
      // so no concurrent `activateBrainDoc[Coherent]` call on this profile
      // can observe this snapshot half-written or this activation without it.
      const doc = await caps.activateBrainDoc(params, tx);
      // EVERY KIND'S CURRENT ACTIVE ID, read AFTER the activation above, IN
      // THE SAME TRANSACTION — so this SELECT sees the supersede-then-activate
      // pair `activateBrainDoc` just committed within this transaction (own
      // writes are always visible to a later statement in the same
      // transaction), and every OTHER kind's active id is carried forward
      // UNCHANGED rather than guessed or left null.
      const activeIds = await activeDocIdsByKind(
        tx,
        scope.profileId as string,
        scope.workspaceId as string
      );
      const [snapshot] = await tx
        .insert(brainActivationSnapshots)
        .values({
          profileId: scope.profileId as string,
          workspaceId: scope.workspaceId as string,
          voiceDocId: activeIds.voice ?? null,
          strategyDocId: activeIds.strategy ?? null,
          killtestDocId: activeIds.killtest ?? null,
          performanceMetaDocId: activeIds.performance_meta ?? null,
        })
        .returning();
      return { doc, snapshot };
    },

    // ---------------------------------------------------- slice 6, R14/R14b/R14c
    //
    // FOUR CAPABILITIES, ONE ATTEMPT. Every column below that is not a named
    // parameter is written HERE, field by field, from the scope or from the
    // database clock — never spread from the caller's object. The older
    // capabilities strip a spread with `stripGuarded`; these never build one,
    // which is the same property one step earlier.
    claimGenerationAttempt: async (params, tx) => {
      // A generation spends the workspace's credits, so it is not a read.
      assertMayWrite(scope.role, "start a generation for this creator");
      // READ ONCE INTO LOCALS (C-40): `params` is a plain object type, so a
      // getter could return one value to the insert and another to the
      // caller's later hash comparison — which is the whole identity check.
      const attemptId = params.attemptId;
      const purpose = params.purpose;
      const mode = params.mode;
      const payloadSha256 = params.payloadSha256;
      const [inserted] = await tx
        .insert(generationAttempts)
        .values({
          attemptId,
          purpose,
          mode,
          payloadSha256,
          ...ids,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return { attempt: inserted, created: true };
      // The insert conflicted, so a row with this attempt id exists SOMEWHERE.
      // Whether it is THIS creator's is what the scoped read answers, and a
      // miss is refused with the state error's shared message.
      const [existing] = await tx
        .select()
        .from(generationAttempts)
        .where(
          and(both(generationAttempts), eq(generationAttempts.attemptId, attemptId))
        )
        .limit(1);
      if (!existing) throw new GenerationAttemptStateError(attemptId, "claimed");
      return { attempt: existing, created: false };
    },

    advanceGenerationAttempt: async (params, tx) => {
      assertMayWrite(scope.role, "advance a generation for this creator");
      const attemptId = params.attemptId;
      const to = params.to;
      // THE LEGAL PREDECESSORS, as a MAP rather than a chain of `if`s, for the
      // reason the slice card gives the tier gate: the next state added is a
      // key that must be given its predecessors, not a branch someone may
      // forget to write.
      //
      // `refused` is legal from every non-terminal state because a refusal can
      // happen before the vendor call (a zero balance) or after it (an
      // unparseable reply) — `generation-schema.ts` records that it is the one
      // state that says nothing about whether HTTP happened.
      const FROM: Record<typeof to, GenerationAttemptState[]> = {
        vendor_started: ["claimed"],
        vendor_complete: ["vendor_started"],
        refused: ["claimed", "vendor_started", "vendor_complete"],
        // Only after HTTP has actually left: `recovery_required` MEANS the
        // vendor may have been paid and we cannot prove what came back.
        recovery_required: ["vendor_started", "vendor_complete"],
      };
      // THE CANDIDATE MOVES WITH THE STATE, in the SAME statement, in both
      // directions (R14c). Written by the response checkpoint and CLEARED by
      // either non-settled terminal, so no terminal row keeps a copy of the
      // words — which is the retention rule
      // `generation_attempts_candidate_iff_vendor_complete` then refuses to
      // let anyone forget. Read into a local first (C-40): `params` is a plain
      // object type, so a getter could hand the UPDATE one document and the
      // caller's later read another.
      const candidate =
        to === "vendor_complete" ? params.candidate : null;
      const stamps =
        to === "vendor_started"
          ? { vendorStartedAt: sql`clock_timestamp()` }
          : to === "vendor_complete"
            ? { vendorCompletedAt: sql`clock_timestamp()`, candidate }
            : { terminalAt: sql`clock_timestamp()`, candidate };
      const [row] = await tx
        .update(generationAttempts)
        .set({
          state: to,
          ...stamps,
          refusalCode: to === "refused" ? params.refusalCode : undefined,
        })
        .where(
          and(
            both(generationAttempts),
            eq(generationAttempts.attemptId, attemptId),
            inArray(generationAttempts.state, FROM[to])
          )
        )
        .returning();
      if (!row) throw new GenerationAttemptStateError(attemptId, to);
      return row;
    },

    settleGeneration: async (params, tx) => {
      assertMayWrite(scope.role, "settle a generation for this creator");
      const attemptId = params.attemptId;
      const outcome = params.outcome;
      const [generation] = await tx
        .insert(generations)
        .values({
          attemptId,
          mode: params.mode,
          brainActivationId: params.brainActivationId,
          frameworkVersions: params.frameworkVersions,
          contextInputIds: params.contextInputIds,
          request: params.request,
          model: params.model,
          promptBundleVersion: params.promptBundleVersion,
          configVersion: params.configVersion,
          outcome,
          output: params.output ?? null,
          weakestPoint: params.weakestPoint,
          refusalReason: params.refusalReason,
          killTest: params.killTest,
          rewriteCount: params.rewriteCount,
          ...ids,
        })
        .returning();
      // THE TRANSITION IN THE SAME CALL, so `generation_attempts_settled_has_
      // generation` — an EQUALITY — can never see a `settled` row without its
      // record. `vendor_complete` is the only legal predecessor: settling
      // anything the vendor has not finished would be settling nothing.
      const [attempt] = await tx
        .update(generationAttempts)
        .set({
          state: "settled",
          generationId: generation.id,
          debitLedgerId: params.debitLedgerId,
          terminalAt: sql`clock_timestamp()`,
          // THE CANDIDATE IS CONSUMED HERE (R14c). The row above is now the
          // record, so keeping the staging copy would be a second, permanent
          // copy of the same words — and the equality CHECK refuses a
          // `settled` row that still carries one, so this is not a line a
          // later edit can quietly drop.
          candidate: null,
        })
        .where(
          and(
            both(generationAttempts),
            eq(generationAttempts.attemptId, attemptId),
            eq(generationAttempts.state, "vendor_complete")
          )
        )
        .returning();
      if (!attempt) throw new GenerationAttemptStateError(attemptId, "settled");
      return { generation, attempt };
    },

    readGenerationForAttempt: async (attemptId, tx) => {
      const [row] = await tx
        .select()
        .from(generations)
        .where(and(both(generations), eq(generations.attemptId, attemptId)))
        .limit(1);
      return row;
    },

    readGenerationAttempt: async (attemptId, tx) => {
      const [row] = await tx
        .select()
        .from(generationAttempts)
        .where(
          and(both(generationAttempts), eq(generationAttempts.attemptId, attemptId))
        )
        .limit(1);
      return row;
    },
  };
  return caps;
}

/**
 * Every brain kind's CURRENT active document id for one profile, read inside
 * the caller's transaction (slice 3b, R8).
 *
 * PLAIN STRING IDS, not a `ProfileScope`/`WorkspaceScope` parameter —
 * deliberately. This is called only from inside `activateBrainDocCoherent`,
 * which has already asserted and locked the scope it is acting for; a second
 * scope-typed parameter here would be a second place that same assertion
 * would need to happen; a plain-id helper has nothing to assert and nothing
 * for `tests/profile-cage.test.ts`'s completeness scan to have an opinion
 * about.
 */
async function activeDocIdsByKind(
  tx: TxLike,
  profileId: string,
  workspaceId: string
): Promise<Partial<Record<BrainKind, string>>> {
  const rows = await tx
    .select({ kind: brainDocs.kind, id: brainDocs.id })
    .from(brainDocs)
    .where(
      and(
        eq(brainDocs.profileId, profileId),
        eq(brainDocs.workspaceId, workspaceId),
        eq(brainDocs.status, "active")
      )
    );
  const out: Partial<Record<BrainKind, string>> = {};
  for (const r of rows) out[r.kind] = r.id;
  return out;
}

/**
 * The sha a confirmation pins, over the PAIR — content AND its evidence (B-3).
 *
 * IT USED TO COVER CONTENT ALONE, and AC-27 names the pair. That gap was
 * theoretical for exactly as long as nothing could edit `source_evidence` after
 * a write: today `writeBrainDoc` is the only writer of the column and it writes
 * it once. It stops being theoretical in slice 5, which edits fields — and the
 * failure it admits is the worse half of the two. Content is what the creator
 * READ; evidence is the quote that made them believe it. A confirmation whose
 * sha covers only the first says "I confirm this rule" while the sentence that
 * justified it is replaceable afterwards with anything, including a quote from
 * a post the creator never wrote, and activation would still pass.
 *
 * FIXED HERE, WITH ONE WRITER AND ONE READER, because the same fix under a live
 * confirmation is a migration: every already-confirmed row's stored sha is a
 * content-only digest, and widening the input silently invalidates all of them.
 * There are none in production — no product path has ever reached
 * `confirmBrainDocFields`, which is what slice 3 changes — so the column keeps
 * its name and its meaning changes in one edit, at the only moment that is a
 * two-line diff.
 *
 * KEY ORDER IS THE OBJECT LITERAL'S, not the caller's, and both inputs come off
 * a `jsonb` read — Postgres normalises object key order on the way in, so the
 * two sites compare digests of the same normalisation rather than of whatever
 * order a caller happened to build. Array order is preserved by `jsonb`, which
 * is what makes the evidence list's own ordering part of what was confirmed.
 */
function confirmationSha256(content: unknown, sourceEvidence: unknown): string {
  return createHash("sha256")
    .update(
      Buffer.from(JSON.stringify({ content, sourceEvidence }), "utf8")
    )
    .digest("hex");
}

/**
/**
 * A corpus limit a caller STATED, checked rather than clamped.
 *
 * A limit above the page ceiling is a caller bug — the config schema caps
 * `voiceCorpusMaxPosts` at the same number — and silently serving fewer rows
 * than asked is how a screen comes to state a bound the read never honoured.
 */
function assertCorpusLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > ONBOARDING_PAGE_MAX) {
    throw new WorkspaceAccessError(
      `ownPostsNewest: a corpus limit must be an integer between 1 and ${ONBOARDING_PAGE_MAX}; received ${limit}. Refusing rather than silently serving fewer posts than the caller asked for`
    );
  }
  return limit;
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
 * Brain kinds a `reference` input may never be provenance for (D-M2-10,
 * widened by R-30.10 / task 42 in slice 4).
 *
 * `voice` was the one M2a could name with certainty: it is the document that
 * decides how the creator SOUNDS, so a third party's sentence in it is the
 * leak. `killtest` and `performance_meta` join it here for the same reason —
 * neither is a place a reference post's own words belong — and `strategy`
 * stays EXEMPT, deliberately: learning a MECHANISM from someone else's post is
 * what the shared library is for (REQ-D04, R-9), and the operative control on
 * that span is `REFERENCE_QUOTE_MAX_CHARS` in `echo.ts`, not a provenance bar.
 *
 * `performance_meta` is not writable at all today (`WRITABLE_BRAIN_KINDS` in
 * `brain-content.ts` excludes it), so barring it here costs nothing now and
 * closes the hole before slice 9 makes it writable — the cheap moment to do
 * it, per the phase-4 card's question 3.
 */
const REFERENCE_BARRED_KINDS: ReadonlySet<BrainKind> = new Set([
  "voice",
  "killtest",
  "performance_meta",
]);

/**
 * Validate every evidence entry, and RETURN the `reference`-classed spans.
 *
 * The return value exists so the quote budget cannot build a corpus of its own:
 * this function is the only place an input's `input_class` is read, so a second
 * reader would be a second source of truth for "is this a reference post" — the
 * shape C-29 removed for the echo corpus one decision over.
 *
 * `bucketOf` is G-11 LAYER B's bucket map (`groupReferenceInputs`, echo.ts),
 * computed ONCE by the caller from the corpus fetched for THIS write and
 * shared with `retainedReferenceSpans` below — so a new span and every
 * retained span agree on which bucket a reference post belongs to within one
 * write, which is what the union in `assertReferenceQuoteBudget` depends on.
 */
async function validateSourceEvidence(
  tx: TxLike,
  scope: ProfileScope,
  kind: BrainKind,
  entries: SourceEvidenceEntry[],
  bucketOf: ReadonlyMap<string, string>
): Promise<{ clean: SourceEvidenceEntry[]; referenceSpans: ReferenceQuoteSpan[] }> {
  const referenceSpans: ReferenceQuoteSpan[] = [];
  const clean: SourceEvidenceEntry[] = [];
  // NOT a no-op any more — the caller has already refused an empty list by
  // name. Kept as a guard because this function is reachable from activation
  // and export too, and a silent empty walk there would be the fail-open shape
  // `assertNoReferenceEcho` was hardened against.
  if (!entries || entries.length === 0) return { clean, referenceSpans };
  const parsedEntries = entries.map((raw) => {
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
    if (!UUID_RE.test(parsed.data.inputId)) throw new ProfileAccessError();
    return parsed.data;
  });
  const inputIds = [...new Set(parsedEntries.map((entry) => entry.inputId))];
  const inputById = new Map(
    (await scope.accessors.onboardingInputsByIds(inputIds, tx)).map((input) => [
      input.id,
      input,
    ])
  );
  if (inputById.size !== inputIds.length) throw new ProfileAccessError();

  for (const entry of parsedEntries) {
    const input = inputById.get(entry.inputId);
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
      // THE BUCKET, not the row and not the sha (G-11). Two `onboarding_inputs`
      // rows holding the same post — or an excerpt of it, or the same text with
      // a trailing space — are one post for R-3's purposes; see
      // `groupReferenceInputs`'s docblock in echo.ts for both layers.
      const bucket = bucketOf.get(entry.inputId);
      if (bucket === undefined) {
        // UNREACHABLE ON THE WRITE PATH: `bucketOf` is built from every
        // `reference` input this profile holds, read in the SAME transaction,
        // and `input` above was just confirmed `inputClass === "reference"`
        // from that same table. A partial map silently answering "no bucket"
        // would reopen exactly the reassembly gap G-11 exists to close, so
        // this refuses by name rather than falling back to a raw digest.
        throw new WorkspaceAccessError(
          `validateSourceEvidence: no echo bucket was computed for reference input ${entry.inputId}. The bucket map must be built from the profile's full current reference corpus before this function runs`
        );
      }
      referenceSpans.push({
        postSha: bucket,
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
 *
 * `bucketOf` is the SAME map `validateSourceEvidence` used for this write
 * (G-11 Layer B, `groupReferenceInputs` in echo.ts) — passed in rather than
 * rebuilt, so a retained span and a new span agree on bucket membership within
 * one write. It is recomputed by the CALLER on every write from the current
 * corpus, never cached, so a reference post added between writes can merge an
 * old bucket with a new one.
 *
 * G-16, RESOLVED: this function's skip-list and `echo.ts`'s `assertUsableSpan`
 * refuse-list used to check different things — this one only `Number.isInteger`,
 * that one also negative and inverted — so a stored inverted range fell through
 * neither, reached `assertUsableSpan` on every later write, and bricked the
 * profile permanently forever after (the docblock here used to claim it
 * couldn't happen). Both now share `isUsableSpanRange` (echo.ts); the
 * DIRECTION stays as it was — this function SKIPS an unusable stored range (a
 * malformed row must never make the profile unable to write again), and
 * `assertUsableSpan` still REFUSES an unusable NEW span (a write must not
 * introduce one).
 */
async function retainedReferenceSpans(
  tx: TxLike,
  scope: ProfileScope,
  bucketOf: ReadonlyMap<string, string>
): Promise<ReferenceQuoteSpan[]> {
  const referenceIds = await tx
    .select({ id: onboardingInputs.id })
    .from(onboardingInputs)
    .where(
      and(
        eq(onboardingInputs.profileId, scope.profileId),
        eq(onboardingInputs.workspaceId, scope.workspaceId),
        eq(onboardingInputs.inputClass, "reference")
      )
    );
  if (referenceIds.length === 0) return [];
  const referenceIdSet = new Set(referenceIds.map((r) => r.id));
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
      if (typeof inputId !== "string" || !referenceIdSet.has(inputId)) continue;
      const bucket = bucketOf.get(inputId);
      if (bucket === undefined) continue;
      if (
        typeof quote !== "string" ||
        typeof startUtf16 !== "number" ||
        typeof endUtf16 !== "number" ||
        // G-16: the SAME predicate `assertUsableSpan` refuses NEW spans with —
        // a stored inverted or negative range is now skipped here rather than
        // reaching that refusal on every later write.
        !isUsableSpanRange(startUtf16, endUtf16)
      ) {
        continue;
      }
      spans.push({
        postSha: bucket,
        inputId,
        startUtf16,
        endUtf16,
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

export type ReferenceSafetyContext = {
  references: ReferenceInput[];
  retainedSpans: ReferenceQuoteSpan[];
};

/**
 * Load the complete scoped populations consumed by the shared R-3 decision.
 *
 * This is read-only and deliberately returns no capability. The caller must
 * already hold a transaction and a verified ProfileScope, so corpus and
 * retained spans are loaded under both workspace/profile predicates from the
 * server-side profile identity. No caller can supply either population.
 */
export async function loadReferenceSafetyContext(
  scope: ProfileScope,
  tx: TxLike
): Promise<ReferenceSafetyContext> {
  assertScoped(scope);
  if (!profileCage.has(scope)) {
    throw new ScopeForgeryError("A reference-safety context holder");
  }
  const corpus = await scope.accessors.referenceCorpusAsOf(undefined, tx);
  const bucketOf = groupReferenceInputs(corpus.inputs);
  return {
    references: corpus.inputs,
    retainedSpans: await retainedReferenceSpans(tx, scope, bucketOf),
  };
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
