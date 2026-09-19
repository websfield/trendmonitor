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
import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, sum } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import { memberships, workspaces } from "./schema";
import type { Membership, MembershipRole, Workspace } from "./schema";
import {
  assertProfileLifecycleAccess,
  assertProfileLifecycleTransactionAccess,
  assertFreshProfileAuthority,
  assertFreshWorkspaceAuthority,
  assertWorkspaceLifecycleTransactionAccess,
} from "./membership-lifecycle";
import { creditLedger, subscriptions } from "./billing-schema";
import type { CreditLedgerRow, Subscription } from "./billing-schema";
import { brainDocs, creatorProfiles, frameworks } from "./brain-schema";
import type {
  BrainDoc,
  BrainKind,
  CreatorProfile,
  Framework,
} from "./brain-schema";
import {
  BILLABLE_USAGE_OUTCOMES,
  USAGE_OUTCOME_BILLABLE,
  brainActivationSnapshots,
  firstBillableAttempts,
  modelUsage,
  onboardingInterviewDrafts,
  onboardingInputs,
  PUBLIC_INPUT_CLASSES,
} from "./onboarding-schema";
import type {
  BrainActivationSnapshot,
  CostState,
  FirstBillableAttempt,
  InputClass,
  ModelUsageRow,
  OnboardingInput,
  ResolvedTier,
} from "./onboarding-schema";
import {
  GENERATION_FEEDBACK_REACTIONS,
  generationAttempts,
  generationFeedback,
  generations,
  type Generation,
  type GenerationAttempt,
  type GenerationAttemptState,
  type GenerationFeedbackReaction,
  type GenerationFeedbackRow,
  type GenerationOutcome,
} from "./generation-schema";
import {
  RESULT_AUDIENCE_CLASSES,
  RESULT_CONFOUNDER_CODES,
  // `RESULT_EVIDENCE_STATES` is deliberately NOT imported here, and the
  // absence is the property: `evidence_state` has no caller parameter to
  // validate against it — `recordResult` DERIVES the state from whether
  // numbers were supplied (R6). A runtime check against the vocabulary would
  // imply a value arrives from outside, which is the thing that must not be
  // true. The TYPE is imported below, for the derived local.
  comparableResultProjection,
  declaredMetricOf,
  results,
  treatmentKeyFor,
  type ComparableResults,
  type ComparableResultRow,
  type ComparableResultsStratum,
  type ResultAudienceClass,
  type ResultConfounderCode,
  type ResultEvidenceState,
  type ResultRow,
} from "./results-schema";
import { autopsies, autopsyCacheClaims, trackedNiches, trendItems, trendSources, trendTranscripts } from "./trends-schema";
import { upsertSpendRollup } from "./spend-rollup";
import { hasOpenPause } from "./pause";
import {
  promotionProposals,
  proposalEvidenceFeedback,
  proposalEvidenceResults,
  type PromotionProposal,
  type ProposalEvidenceResultRole,
} from "./promotion-schema";
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
  appendPromotionSummaryForProposalInScope,
  decidePromotionProposalInScope,
  refreshPromotionProposalsInScope,
  type DecidePromotionProposalParams,
  type PromotionDecisionResult,
} from "./promotion-ops";
import {
  BrainDocumentLimitError,
  BrainVersionLimitError,
  FeedbackDuplicateError,
  FeedbackNoteError,
  FeedbackReactionError,
  FeedbackTargetError,
  GenerationLineageError,
  OnboardingInputLimitError,
  OnboardingInputFieldKeyError,
  PerformanceLearningEntitlementError,
  ProfileAccessError,
  ProfileNameError,
  ProfileRoleError,
  ComparisonStratumError,
  ProvenanceError,
  ResultDuplicateError,
  ResultInputError,
  ResultTargetError,
  ScopeForgeryError,
  UsageRawError,
  WorkspacePausedError,
} from "./errors";
import {
  BRAIN_CLAIM_POSITION_MAX,
  BRAIN_DOCUMENT_TEXT_MAX,
  BRAIN_EVIDENCE_ENTRY_MAX,
  BRAIN_VERSION_MAX,
  FEEDBACK_NOTE_MAX,
  ONBOARDING_FIELD_KEY_MAX,
  ONBOARDING_SOURCE_URL_MAX,
  POST_CONTENT_MAX,
  POST_COUNT_MAX,
  RESULT_NOTE_MAX,
  RESULT_PLATFORM_MAX,
} from "./storage-limits";

export {
  BrainRoleError,
  // Slice 9a: raised by the `comparableResults` accessor, so it is re-exported
  // beside the write-path refusals for the same reason they are - this module
  // is the door every consumer of the cage already imports from.
  ComparisonStratumError,
  FeedbackDuplicateError,
  FeedbackNoteError,
  FeedbackReactionError,
  FeedbackTargetError,
  GenerationLineageError,
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

/**
 * THE COMPARISON POPULATION'S BOUND (slice 9a).
 *
 * ITS OWN CONSTANT rather than a reuse of `LEDGER_PAGE_MAX`, the
 * `ONBOARDING_PAGE_MAX` reason verbatim: a shared number ties two limits that
 * move for different reasons. This one bounds how many of a creator's OWN
 * results one comparison may be computed over; that one bounds a ledger page.
 *
 * IT WAS 200 UNTIL 2026-09-04, AND 200 WAS THE WRONG KIND OF NUMBER — not
 * merely too small. It was `LEDGER_PAGE_MAX`'s value, inherited by proximity:
 * a DISPLAY PAGE SIZE, sized for how many rows fit on a usage screen. A
 * comparison population is not a page. It is a creator's eligible HISTORY, and
 * the right question for it is "more than any real creator will have", which
 * has a different answer. Builder B's grouper then showed what the mismatch
 * costs: `truncated` is decided before the emptiness check, so one creator past
 * the bound gets EVERY population of EVERY group marked truncated and no
 * comparison anywhere on the screen. That is the honest answer to a bound that
 * has genuinely been exceeded — and the first person to meet it would have
 * read it as a total regression and been under pressure to move the line down,
 * which is how a control with a short life dies.
 *
 * SO THE NUMBER IS DERIVED, AND THE ARITHMETIC IS HERE TO BE CHECKED rather
 * than taken on taste:
 *
 *   5 posts/day        the top of what a sustained short-form creator does;
 *                      this product's modes are per-post, so posts bound rows
 *   x 365 x 5 years  = 9,125 posts
 *   x 4 observations   day 1, day 7, day 30, day 90. `results_generation_
 *                      metric_window_uq` DELIBERATELY permits several windows
 *                      per (output, metric, class), so this factor is a
 *                      property of the schema, not a guess about behaviour
 *                    = 36,500 rows
 *   + the paid split   a post logged organic AND paid is two rows; on a
 *                      generous quarter of posts that is +9,125
 *                    = 45,625
 *
 * 50,000 is the round number above that. A creator who exceeds it is a genuine
 * outlier, and for them truncation still fires and is still reported — the
 * control is not weakened, it stops firing on ordinary creators. Every other
 * property is unchanged: the `limit + 1` probe, the measured `truncated`, and
 * the newest-observations-first clip.
 *
 * IT GOVERNS BYTES AS WELL AS ROWS, AND THAT HALF IS NOW CLOSED. A row bound
 * bounds nothing if a row can be arbitrarily large, and this read used to
 * `SELECT *`: a typical row is ~300 bytes (50,000 of them ~15 MB), but a row
 * carrying the `RESULT_NOTE_MAX` cap is ~2.4 KB, so a population of 50,000 of
 * THOSE was ~120 MB in one server render. `comparableResults` now selects
 * `comparableResultProjection` instead, which drops `note` — the only column
 * on the table that can hold unbounded creator text, and one no comparison
 * reads. Every remaining column is bounded by a writer limit, a closed set or
 * its own construction, so the worst case is now ~500 bytes a row and ~25 MB a
 * page, and that ceiling is structural rather than a number somebody watches.
 * `tests/results-comparison-contract.test.ts` fails if `note` is selected
 * again.
 *
 * IT IS NOT A SILENT CEILING, which is the whole point of it having a name and
 * a companion flag. `comparableResults` reports whether it clipped, because a
 * clipped population is not a smaller claim but a different one — see
 * `ComparableResults`. Refusing above it was rejected for CLAUDE.md's
 * 2026-07-30 reason — a creator over the bound could do nothing about it, so
 * the control would be the outage.
 */
export const COMPARISON_POPULATION_MAX = 50_000;

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
  // Slice 7 (R10/R11). The creator's own reactions to their own outputs, plus
  // whatever they typed beside them — theirs to take, and its registry entry
  // says why. Its export reader is the SAME query the one sanctioned raw
  // accessor uses (`feedbackPage` below), not a second one:
  // `tests/feedback-readers.test.ts` permits exactly one `.from(
  // generationFeedback)` in the repo, and two branches sharing one helper is
  // how this table gets an export without spending that permit.
  "generation_feedback",
  // Slice 8 fix pass (tenancy gate CHANGE 5, 2026-09-03). The SUBMITTED
  // sources a creator handed the product; `both()` excludes the ownerless
  // youtube rows exactly as `ownPrivateFramework()` excludes library rows.
  "trend_sources",
  "tracked_niches",
  "trend_items",
  "trend_transcripts",
  "autopsies",
  "autopsy_cache_claims",
  // Slice 9a (R5). The results a creator logged about their own posts: the
  // numbers they typed, the window they typed them for, the confounders they
  // named and the treatment key we derived. Exported as RAW ROWS, the
  // `generation_feedback` rule — nothing is aggregated, scored or summarised on
  // the way out, so what the file returns is what was stored, and a creator can
  // check our comparison arithmetic against it rather than take it on trust.
  "results",
  // Slice 9b. Raw proposal history plus immutable relational membership.
  // Export never derives a comparison or a stronger claim from these rows.
  "promotion_proposals",
  "proposal_evidence_results",
  "proposal_evidence_feedback",
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

function lifecycleGuardedMethods<T extends object>(
  db: DbLike | TxLike,
  methods: T,
  transactionArgumentByMethod: Readonly<Record<keyof T, number>>,
  guard: (tx: TxLike) => Promise<void>
): T {
  return new Proxy(methods, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        if (typeof property !== "string" || !(property in transactionArgumentByMethod)) {
          throw new ScopeForgeryError("A lifecycle-guarded accessor");
        }
        const index = transactionArgumentByMethod[property as keyof T];
        const supplied = args[index];
        if (supplied !== undefined) {
          if (
            !supplied ||
            typeof supplied !== "object" ||
            typeof (supplied as TxLike).select !== "function" ||
            typeof (supplied as TxLike).execute !== "function"
          ) {
            throw new ScopeForgeryError("A lifecycle-guarded transaction");
          }
          await guard(supplied as TxLike);
          return Reflect.apply(value, target, args);
        }
        const invokeIn = async (tx: TxLike) => {
          await guard(tx);
          const transactionArgs = [...args];
          while (transactionArgs.length <= index) transactionArgs.push(undefined);
          transactionArgs[index] = tx;
          return Reflect.apply(value, target, transactionArgs);
        };
        const transaction = (db as DbLike).transaction;
        return typeof transaction === "function"
          ? transaction.call(db, invokeIn)
          : invokeIn(db as TxLike);
      };
    },
  });
}

function transactionallyLifecycleGuardedMethods<T extends object>(
  methods: T,
  transactionFor: (property: PropertyKey, args: readonly unknown[]) => TxLike | undefined,
  guard: (
    tx: TxLike,
    property: PropertyKey,
    args: readonly unknown[]
  ) => Promise<void>
): T {
  return new Proxy(methods, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const tx = transactionFor(property, args);
        if (tx) await guard(tx, property, args);
        return Reflect.apply(value, target, args);
      };
    },
  });
}

export class WorkspaceScope {
  // NOT `readonly #cage: true;` — that form is TS2564 (no initialiser under
  // strictPropertyInitialization). The field exists purely so that a spread of
  // an instance is TS2741 where a WorkspaceScope is required.
  readonly #cage = true;
  readonly workspaceId: VerifiedWorkspaceId;
  /** The REQ-A02 authority. `readonly`, so `scope.role = "owner"` is TS2540. */
  readonly role: MembershipRole;
  /** Scope epoch: any membership or workspace lifecycle transition retires it. */
  readonly membershipVersion: number;
  readonly workspaceLifecycleVersion: number;
  /** Whose session this is (C-13) — the only source `confirmed_by` may use. */
  readonly userId: VerifiedUserId;
  readonly accessors: WorkspaceAccessors;

  private constructor(
    token: symbol,
    db: DbLike,
    workspaceId: VerifiedWorkspaceId,
    role: MembershipRole,
    userId: VerifiedUserId,
    membershipVersion: number,
    workspaceLifecycleVersion: number
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
    this.membershipVersion = membershipVersion;
    this.workspaceLifecycleVersion = workspaceLifecycleVersion;
    const accessors: WorkspaceAccessors = {
      workspace: (tx?: TxLike) =>
        (tx ?? db).select().from(workspaces).where(eq(workspaces.id, workspaceId)),
      members: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(memberships)
          .where(eq(memberships.workspaceId, workspaceId)),
      subscription: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.workspaceId, workspaceId))
          .limit(1),
      // Newest first, `id` as the tie-break so a page boundary is stable when
      // two rows share a microsecond (the same shape foldLedger sorts by,
      // reversed — this is DISPLAY order, never allocation order).
      ledger: (page: LedgerPage, tx?: TxLike) =>
        (tx ?? db)
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
      creatorProfiles: (tx?: TxLike) =>
        (tx ?? db)
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
    this.accessors = lifecycleGuardedMethods(
      db,
      accessors,
      {
        workspace: 0,
        members: 0,
        subscription: 0,
        ledger: 1,
        creatorProfiles: 0,
      },
      async (tx) => {
        const authority = await assertWorkspaceLifecycleTransactionAccess(
          tx,
          userId as string,
          workspaceId
        );
        assertFreshWorkspaceAuthority(authority, {
          membershipVersion,
          workspaceLifecycleVersion,
        });
      }
    );
    scopeDb.set(this, db);
    workspaceCage.add(this);
  }

  /** The ONE session-side mint. Membership is verified by `withWorkspace`. */
  static mintVerified(
    db: DbLike,
    workspaceId: VerifiedWorkspaceId,
    role: MembershipRole,
    userId: VerifiedUserId,
    membershipVersion: number,
    workspaceLifecycleVersion: number
  ): WorkspaceScope {
    return new WorkspaceScope(
      MINT,
      db,
      workspaceId,
      role,
      userId,
      membershipVersion,
      workspaceLifecycleVersion
    );
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

async function withFreshWorkspaceRead<T>(
  dbOrTx: DbLike | TxLike,
  scope: WorkspaceScope,
  read: (tx: TxLike) => Promise<T>
): Promise<T> {
  assertScoped(scope);
  if (!workspaceCage.has(scope)) throw new ScopeForgeryError("A WorkspaceScope");
  const invoke = async (tx: TxLike) => {
    await assertFreshWorkspaceScopeInTx(tx, scope);
    return read(tx);
  };
  const transaction = (dbOrTx as DbLike).transaction;
  if (typeof transaction === "function") {
    return (await transaction.call(dbOrTx, invoke)) as T;
  }
  return invoke(dbOrTx as TxLike);
}

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
  return withFreshWorkspaceRead(db, scope, async (tx) => {
  // `kind = 'debit'` EXPLICITLY, not merely `delta < 0` (billing gate finding
  // 1, 2026-08-29). `delta < 0` also matches `expiry` rows and a negative
  // `adjust` — and `deriveBalanceInTx` (`balance.ts`) can materialize an
  // expiry row LAZILY, on the very `getBalance` call this page already makes
  // one statement earlier (`usage/page.tsx`), so a page load that crosses a
  // lot's expiry boundary would have counted a lapsed credit as "spent" in
  // the same render. Credits lapsing is not the creator having spent them.
  const [row] = await tx
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
  });
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
  return withFreshWorkspaceRead(db, scope, async (tx) => {
  // The claim's presence, as a grouping key. `attempt_id` rather than `id`
  // because it is the column the join matched on.
  const claimed = sql<boolean>`(${generationAttempts.attemptId} IS NOT NULL)`;
  const rows = await tx
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
  });
}

export type UsageRunwayDebits = {
  totalDebit: number;
  distinctDebitDays: number;
  windowStart: Date;
  asOf: Date;
};

/** Ledger-only runway population in the exact `(windowStart, asOf]` interval. */
export async function usageRunwayDebits(
  dbOrTx: DbLike | TxLike,
  scope: WorkspaceScope,
  asOf: Date,
  trailingWindowDays: number
): Promise<UsageRunwayDebits> {
  assertScoped(scope);
  if (!workspaceCage.has(scope)) throw new ScopeForgeryError("A WorkspaceScope");
  if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
    throw new RangeError("usageRunwayDebits: asOf must be a valid Date");
  }
  if (!Number.isInteger(trailingWindowDays) || trailingWindowDays <= 0) {
    throw new RangeError(
      "usageRunwayDebits: trailingWindowDays must be a positive integer"
    );
  }
  const windowStart = new Date(
    asOf.getTime() - trailingWindowDays * 24 * 60 * 60 * 1000
  );
  return withFreshWorkspaceRead(dbOrTx, scope, async (tx) => {
  const [row] = await tx
    .select({
      totalDebit: sql<string | null>`sum(-${creditLedger.delta})`,
      distinctDebitDays: sql<number>`count(distinct date(${creditLedger.createdAt} at time zone 'UTC'))`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.workspaceId, scope.workspaceId),
        eq(creditLedger.kind, "debit"),
        sql`${creditLedger.createdAt} > ${windowStart}`,
        lte(creditLedger.createdAt, asOf)
      )
    );
  return {
    totalDebit: row?.totalDebit == null ? 0 : Number(row.totalDebit),
    distinctDebitDays: Number(row?.distinctDebitDays ?? 0),
    windowStart,
    asOf,
  };
  });
}

export type PromotionStrategyMetricVersion = {
  id: string;
  profileId: string;
  workspaceId: string;
  status: BrainDoc["status"];
  metric: { label: unknown; unit: unknown; direction: unknown };
};

export type PromotionResultInputs = {
  strategyMetricVersions: PromotionStrategyMetricVersion[];
  population: ComparableResults;
};

export type PromotionFeedbackInputRow = {
  feedbackId: string;
  generationId: string;
  profileId: string;
  workspaceId: string;
  reaction: GenerationFeedbackReaction;
  basisBrainDocId: string | null;
};

export type PromotionResultEvidenceRow = ComparableResultRow & {
  role: ProposalEvidenceResultRole;
};

export type PromotionProposalStoredReview = {
  proposal: PromotionProposal;
  resultEvidence: PromotionResultEvidenceRow[];
  feedbackEvidence: PromotionFeedbackInputRow[];
};

export type BrainAssetSummary = {
  brainVersions: number;
  testedRules: number;
  loggedResults: number;
  feedback: number;
};

export type ProfileAccessors = {
  profile: () => Promise<CreatorProfile[]>;
  brainDocs: () => Promise<BrainDoc[]>;
  /**
   * Exact database counts for the read-only brain-as-an-asset summary.
   *
   * `testedRules` is the largest persisted Performance Meta `rules`
   * membership across current and historical versions. Promotion carries the
   * complete prior membership into every new version, so summing version
   * lengths would count the same tested rule repeatedly; the maximum is the
   * accumulated membership while preserving history if a later version is no
   * longer active. Every subquery predicates both profile and workspace.
   */
  brainAssetSummary: (tx?: TxLike) => Promise<BrainAssetSummary>;
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
  /**
   * EVERY STRATEGY VERSION'S DECLARED METRIC, AND NOTHING ELSE (slice 9a fix
   * pass, billing CHANGE 1).
   *
   * WHY IT EXISTS RATHER THAN A CALL TO `brainDocsByKind`. That accessor is a
   * bare `.select()` with no `.limit()`: every column of up to
   * `BRAIN_VERSION_MAX` (200) rows, including the `content` jsonb bounded only
   * by `BRAIN_DOCUMENT_TEXT_MAX` (500,000) and the `source_evidence` beside it.
   * Worst case ~100 MB — in the SAME server render whose sibling read
   * (`comparableResults`) was just cut from ~120 MB to ~25 MB by projecting
   * `note` away. The sentence written for that read is true of this one:
   * A ROW BOUND BOUNDS NOTHING IF A ROW CAN BE ARBITRARILY LARGE. This
   * codebase already treats brain-doc size as a memory hazard —
   * `EXPORT_BRAIN_DOC_PAGE_SIZE` is 1, pages of a single document.
   *
   * `brainDocsByKind` IS NOT NARROWED, deliberately: its other callers
   * (`brain-ops.ts`'s read, edit and version paths) render and hash the whole
   * document and would break. The fix is that the RESULTS paths stop using the
   * wide read, not that the wide read stops being wide.
   *
   * FOUR SCALARS PER VERSION, extracted in SQL. The metric's three fields are
   * what `declaredMetricOf` reads; `id` is what a result stores as
   * `metric_declared_by_doc_id` and what the comparison keys its map on;
   * `status` is what picks the active one. `content` never crosses.
   *
   * EVERY VERSION, not just the active one, because the two readers differ:
   * the WRITE path needs the active declaration (R8) and the COMPARISON needs
   * every version a stored result may cite, since `metric_declared_by_doc_id`
   * is a comparability predicate and old results legitimately name superseded
   * versions. One accessor, two readers, one query shape.
   */
  strategyMetricVersions: (
    tx?: TxLike
  ) => Promise<
    {
      id: string;
      profileId: string;
      workspaceId: string;
      status: BrainDoc["status"];
      metric: { label: unknown; unit: unknown; direction: unknown };
    }[]
  >;
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
   * The same population, in MONEY (billing gate, 2026-09-04). See the
   * implementation for why a count and a sum are two bounds rather than one,
   * and for what an `unknown` cost row does to this number.
   */
  sumUnchargedBillableCostMicroUsd: (params: {
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
   * WHICH ATTEMPT HOLDS this profile's first billable attempt of a purpose —
   * the row `first_billable_attempts` decided, never a count (R-80).
   *
   * WHAT IT REPLACED, AND WHY THE OLD SHAPE COULD NOT WORK.
   * `countBillableAttempts` lived here and answered "how many billable
   * attempts came before me", ranking on `(created_at, attempt_id)`. The
   * docblock claimed that was "a total order, so exactly one attempt in any
   * set has zero predecessors, whatever the interleaving". THE VALUES ARE A
   * TOTAL ORDER; THE READER'S SNAPSHOT IS NOT. `created_at` is
   * `clock_timestamp()` at INSERT and a row becomes visible at COMMIT, so an
   * attempt that inserted first and committed second is invisible to the one
   * that committed before it — and then finds that one LATER by the key. Both
   * counted zero predecessors, both took the included build, and one debit was
   * never written. Reproduced deterministically on real Postgres in
   * `packages/credits/tests/inference-race.docker.test.ts` ("INSERTED FIRST,
   * COMMITTED SECOND"), which is what the old claim never was.
   *
   * SO THE ANSWER IS READ, NOT DERIVED. `recordModelUsage` claims the row in
   * the SAME transaction as the billable `model_usage` row (see there), under
   * a unique index — enforced against committed state, so exactly one claim
   * can exist per (profile, purpose) whatever the interleaving. This accessor
   * only reports what the database decided.
   *
   * ONE ROW OR ZERO, returned as an ARRAY like `profile()` and
   * `latestBrainActivation()`: empty means nothing billable has been recorded
   * for this purpose yet, which is a fact the caller owns rather than a null
   * this accessor guesses about — EXCEPT in the `settled` case below.
   *
   * `settlement` IS REQUIRED AND IS NOT A BOOLEAN FLAG, because the two
   * callers mean genuinely different things by an absent claim:
   *
   *   - `"unsettled"` — the caller has NOT written its `model_usage` row yet
   *     (the pre-call price, step 6 of `runInference`). No claim means the
   *     included build is genuinely unclaimed, and the caller prices
   *     optimistically; the authoritative price is taken again after the row
   *     exists.
   *   - `"settled"` — the caller's own billable row HAS committed (R11, the
   *     A-7 settlement tail; the debit at step 9). A claim therefore MUST
   *     exist, and its absence means the claim writer did not run. It is
   *     REFUSED rather than answered, for the reason the old code refused the
   *     same shape: answering "unclaimed" would hand out a free build on the
   *     strength of a missing record — absence read as an entitlement — and
   *     answering "somebody else's" would charge a creator for the build they
   *     were promised. Both branches are driven by tests; a required
   *     parameter no test drives the false side of is not a guard (CLAUDE.md,
   *     2026-08-29).
   *
   * `conn` for the same reason `referenceCorpusAsOf` takes one: the scope
   * closes over the POOL, and reading the pool from inside an open transaction
   * deadlocks on a single-connection driver. The debit transaction is exactly
   * that caller.
   */
  firstBillableAttempt: (
    params: {
      purpose: string;
      settlement: "unsettled" | "settled";
    },
    conn?: TxLike
  ) => Promise<FirstBillableAttempt[]>;
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
  /**
   * THE ONE RAW READER OF `generation_feedback` (slice 7, R11).
   *
   * "One" is a MEASURED property, not a convention:
   * `tests/feedback-readers.test.ts` scans every product source in
   * `packages/**` and `app/**` for a read of that table — through a table
   * object, an alias, an import rename, a cast, a computed member or raw SQL —
   * and permits exactly one FILE. `exportPage`'s `generation_feedback` branch
   * shares this accessor's query helper rather than writing a second one, so
   * the export costs no second permit.
   *
   * WHAT IT RETURNS IS RAW, and that is the requirement rather than laziness:
   * R11 says nothing in this slice derives a rule, proposal or aggregate from
   * feedback. There is no count here, no grouping, no "top reaction", no
   * scoring. UI and export get the stored events; `packages/brain` (slice 9,
   * which does not exist) is the only place a proposal may be constructed
   * from them, and the same test file pre-registers that boundary the way
   * `tests/import-boundary.test.ts` pre-registered `@respin/trends`.
   *
   * ITS HONEST LIMIT, stated: a source scan cannot infer semantic intent. It
   * can enforce raw-access ownership and constructor location, and that is
   * all it claims. The tests that prove UI and export return raw scoped events
   * are separate, and they are behavioural.
   *
   * CLAMPED, like `ledger` and `onboardingInputs`, and for the same reason:
   * an append-only table that only grows, read by a server component whose
   * caller may pass a URL-derived page size.
   */
  generationFeedback: (
    page?: LedgerPage,
    tx?: TxLike
  ) => Promise<GenerationFeedbackRow[]>;
  /**
   * THE RESULTS THIS CREATOR LOGGED (slice 9a, R5), newest first.
   *
   * RAW ROWS, and that is the requirement rather than laziness. The comparison
   * — cohort, baseline, median, per-1k, absence states — is
   * `@respin/brain`'s `buildLeverComparisons` (contract C5), which takes an
   * ALREADY PROFILE-SCOPED array. So this accessor is where the tenancy
   * happens and the arithmetic does not: no count, no grouping, no median, no
   * "your best post". A second place that decided which results are comparable
   * would be a second answer to the question the whole slice rests on.
   *
   * CLAMPED, like `ledger`, `onboardingInputs` and `generationFeedback`, for
   * the reason recorded there: an append-only table that only grows, read by a
   * server component whose caller may pass a URL-derived page size.
   *
   * THE CLAMP COSTS THE COMPARISON NOTHING, AND THAT IS A CHANGE. This
   * docblock used to say a cohort was drawn from this page, so a creator past
   * `LEDGER_PAGE_MAX` got a comparison over their most recent page — true
   * when written and false since `comparableResults` landed beside it. NO
   * COMPARISON READS THIS ACCESSOR. This one pages a LIST for a screen, which
   * is what `LEDGER_PAGE_MAX` is for; the comparison reads
   * `comparableResults`, which has its own domain-derived bound and reports
   * whether it clipped. The two jobs are separated so that neither number
   * moves for the other's reason.
   */
  results: (page?: LedgerPage, tx?: TxLike) => Promise<ResultRow[]>;
  /**
   * THE COMPARISON POPULATION (slice 9a, C5) — the creator's own results, read
   * under an explicit bound that REPORTS whether it clipped, optionally
   * narrowed to one stratum in SQL.
   *
   * WHY IT IS NOT `results()` WITH A FILTER ON TOP, and this is the defect it
   * closes rather than a preference. `results()` returns the newest
   * `LEDGER_PAGE_MAX` rows and says nothing about what it left behind, so a
   * comparison built from it silently inherits that clamp: a creator past the
   * bound got a median over their most recent page while the screen called it
   * their history. A comparison over a silently truncated population is not a
   * weaker claim, it is a false one, on the screen R20 governs. This accessor
   * exists so that "there are more results than this comparison saw" is a fact
   * the caller HOLDS rather than one nobody measured.
   *
   * TWO BRANCHES, AND 9A WALKS THE SECOND ONE.
   *
   *   `stratum` GIVEN — the five comparability predicates are applied IN SQL,
   *     so only eligible rows cross the boundary and truncation becomes rare.
   *     This is 9b's tool: fetching ONE treatment cohort to build a proposal
   *     from. It has no caller on 9a's screen, deliberately (see below).
   *
   *   `stratum` OMITTED — the profile's whole result population, same bound,
   *     same measured `truncated`, same clip. This is what `resultComparisons`
   *     calls, because PARTITIONING RESULTS INTO COMPARABLE STRATA IS
   *     COMPARABILITY LOGIC AND BELONGS TO `@respin/brain`, beside `inStratum`
   *     and `buildLeverComparisons`. A caller cannot know the strata before it
   *     has the rows — the strata are DERIVED from them — so an accessor that
   *     demanded one would force the app to invent a partition, which is the
   *     second comparability site contract C5 exists to prevent.
   *
   * WHAT THE UNUSED-ON-9A BRANCH IS FOR, stated rather than left as inventory
   * (the master plan's "nothing ships without a caller in the same slice"):
   * its six planted-predicate cases are the CONTROL that keeps this SQL and
   * `@respin/brain`'s `inStratum` reading the stratum the same way. That
   * agreement is what slice 8c's most expensive defect was the absence of, and
   * it is cheaper to keep one optional parameter tested than to re-derive the
   * agreement when 9b adds the first per-cohort fetch. The honest limit: on
   * 9a's live path those predicates are not exercised at all — `inStratum`
   * does the whole job — so the control protects 9b's path, not this one.
   *
   * AND WHEN IT TRUNCATES, IT SAYS SO. `truncated` is measured by asking for
   * `limit + 1` rows and seeing whether the extra one exists — exact, one
   * query, no count. `@respin/brain` turns that into a named population state,
   * so an incomplete population is never rendered as a complete one.
   *
   * WHICH ROWS SURVIVE THE CLIP, stated because it biases any median computed
   * from them: the NEWEST OBSERVATIONS, ordered by `observed_to` (then `id`).
   * That is a deliberate departure from this file's one display order
   * (`created_at`), and the reason is that the population is about when a post
   * was OBSERVED, not when the creator got round to logging it — a creator
   * back-filling last year's results must not evict this month's. The bias
   * toward recent observations is real and is why the flag exists.
   *
   * IT DOES NOT FILTER `unquantified` ROWS OUT, deliberately, and the
   * consequence is stated rather than discovered: they are ELIGIBLE for the
   * population (they are results) and merely not NUMERICAL, and R16 —
   * "unquantified never enters a numerical cohort" — is the comparison's rule,
   * applied by `@respin/brain` after this returns. Filtering here would measure
   * `truncated` over a DIFFERENT population from the one the builder sees,
   * which is two answers to "how big is this population". What it costs is real
   * and is the reason the flag exists: unquantified rows consume the bound like
   * any other, so a creator with a bound's worth of them gets `truncated: true`
   * and an empty numerical cohort — an honest pair of facts, and both are
   * reported.
   *
   * THE STRATUM BRANCH RE-APPLIES NOTHING BY ACCIDENT: its window predicate is
   * CONTAINMENT (`observed_from >= from AND observed_to <= to`), byte-for-byte
   * the rule `@respin/brain`'s `inStratum` uses, and
   * `ComparableResultsStratum`'s docblock is where that pinning is recorded.
   */
  comparableResults: (
    stratum?: ComparableResultsStratum,
    tx?: TxLike
  ) => Promise<ComparableResults>;
  /**
   * This creator's own generations, newest first (slice 9a, R5).
   *
   * ADDED FOR THE RESULTS LOG'S OUTPUT PICKER, and it is the first scoped
   * reader of `generations` that is not `exportPage`. It is a separate
   * accessor rather than a reuse of that branch for two reasons worth stating:
   * the export's page size is a property of the export stream (25, fixed, and
   * it advances until empty), and `exportPage` returns `unknown[]` because it
   * spans every included table — a picker needs typed rows.
   *
   * IT RETURNS WHOLE ROWS and the CALLER decides what to show. What a result
   * log needs is the id, the mode and the date; what it must NOT show is the
   * output text, because a picker is a list of a creator's own drafts and not
   * a place to re-render one. That is a projection decision and it belongs to
   * the screen, not here — this accessor's job is the tenancy.
   *
   * CLAMPED like every other growing list, and for the same reason.
   */
  generationsNewest: (page?: LedgerPage, tx?: TxLike) => Promise<Generation[]>;
  promotionResultInputs: (tx?: TxLike) => Promise<PromotionResultInputs>;
  promotionFeedbackInputs: (tx?: TxLike) => Promise<PromotionFeedbackInputRow[]>;
  promotionProposalReview: (
    proposalId: string,
    tx?: TxLike
  ) => Promise<PromotionProposalStoredReview | null>;
  promotionProposalHistory: (tx?: TxLike) => Promise<PromotionProposal[]>;
  /**
   * This profile's LIVE private frameworks (slice 7, R5c).
   *
   * `visibility = 'private'` PLUS both scope columns — the same three-part
   * predicate `exportPage`'s `frameworks` branch has carried since slice 5,
   * and for the reason recorded there: a shared library row has NULL owner
   * columns, so the private predicate is what makes "the creator's own" mean
   * something rather than "everything with no owner".
   *
   * SUPERSEDED AND RETIRED VERSIONS ARE EXCLUDED, and that is the difference
   * between this and the export branch: the export returns every version
   * because history is the creator's too, and this returns what they can act
   * on now.
   */
  privateFrameworks: () => Promise<Framework[]>;
  /**
   * Every framework this profile may GENERATE from (slice 7, R5b + R5c).
   *
   * ONE QUERY over both halves, not two reads merged afterwards, so the
   * recommendability predicate — approved, not retired, not superseded — is
   * applied to the shared library and to the creator's own rows by the same
   * expression. Two copies of that predicate is two places for M8 to hide.
   *
   * THE SHARED HALF IS DELIBERATELY UNSCOPED, because a shared framework has
   * both owner columns NULL by CHECK: it belongs to nobody and is the same
   * set for every workspace. The PRIVATE half carries both scope columns, so
   * no other creator's framework can enter this list — which
   * `packages/db/tests/profile-scope.test.ts` drives from both sides.
   *
   * THE ORDER IS PART OF THE CONTRACT, not a detail (billing gate,
   * 2026-09-01): every SHARED row precedes every private one, because the
   * consumer fills a bounded prompt budget in the order it receives and drops
   * whole rows once it is spent. See the `orderBy` for the measurement.
   */
  eligibleFrameworks: () => Promise<Framework[]>;
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
  readonly membershipVersion: number;
  readonly workspaceLifecycleVersion: number;
  readonly profileLifecycleVersion: number;
  readonly accessors: ProfileAccessors;

  private constructor(
    token: symbol,
    db: DbLike | TxLike,
    workspaceId: VerifiedWorkspaceId,
    profileId: VerifiedProfileId,
    role: MembershipRole,
    userId: VerifiedUserId,
    membershipVersion: number,
    workspaceLifecycleVersion: number,
    profileLifecycleVersion: number
  ) {
    if (token !== MINT) throw new ScopeForgeryError("A ProfileScope");
    if (new.target !== ProfileScope) {
      throw new ScopeForgeryError("A ProfileScope subclass");
    }
    this.workspaceId = workspaceId;
    this.profileId = profileId;
    this.role = role;
    this.userId = userId;
    this.membershipVersion = membershipVersion;
    this.workspaceLifecycleVersion = workspaceLifecycleVersion;
    this.profileLifecycleVersion = profileLifecycleVersion;
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
    /**
     * THE ONLY QUERY IN THIS REPO THAT READS `generation_feedback` (R11).
     *
     * A local helper rather than two similar queries, because the accessor and
     * `exportPage`'s branch need the same rows in the same order with a
     * different page size — and `tests/feedback-readers.test.ts` permits ONE
     * raw reader. Two copies would spend a permit on a duplicate; one helper
     * with a page-size parameter spends none, and it means the export and the
     * screen cannot drift into different orderings of the same table.
     *
     * NO AGGREGATION, DELIBERATELY. See the accessor's docblock: this slice
     * captures feedback and must be structurally unable to derive from it.
     */
    const feedbackPage = (
      conn: DbLike | TxLike,
      limit: number,
      offset: number
    ) =>
      conn
        .select()
        .from(generationFeedback)
        .where(both(generationFeedback))
        .orderBy(desc(generationFeedback.createdAt), desc(generationFeedback.id))
        .limit(limit)
        .offset(offset);
    /**
     * THE ONE `results` QUERY (slice 9a, R5), shared by the accessor and
     * `exportPage`'s branch exactly as `feedbackPage` is — same rows, same
     * order, different page size. Two copies would let the export and the
     * screen drift into different orderings of the same table, which for a
     * table whose whole purpose is "these three results are the cohort" is a
     * difference a creator could see and nobody could explain.
     *
     * NO AGGREGATION HERE EITHER. See the accessor's docblock: the comparison
     * belongs to `@respin/brain`, which receives rows.
     */
    const resultsPage = (
      conn: DbLike | TxLike,
      limit: number,
      offset: number
    ) =>
      conn
        .select()
        .from(results)
        .where(both(results))
        .orderBy(desc(results.createdAt), desc(results.id))
        .limit(limit)
        .offset(offset);
    /**
     * WHAT MAKES A FRAMEWORK RECOMMENDABLE (R5b), as ONE expression.
     *
     * Duplicated from `frameworks.ts`'s `recommendable()` is exactly what this
     * is NOT: that file's readers call these accessors. The predicate lives
     * here because both branches below need it and neither may have its own
     * version — M8 ("a reader that returns proposed or retired frameworks") is
     * a one-line edit in whichever copy a reviewer is not looking at.
     */
    const frameworkIsRecommendable = () =>
      and(
        eq(frameworks.curatorStatus, "approved"),
        isNull(frameworks.retiredAt),
        isNull(frameworks.supersededAt)
      );
    const ownPrivateFramework = () =>
      and(
        eq(frameworks.ownerProfileId, profileId),
        eq(frameworks.workspaceId, workspaceId),
        eq(frameworks.visibility, "private")
      );
    const accessors: ProfileAccessors = {
      profile: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              eq(creatorProfiles.workspaceId, workspaceId)
            )
          ),
      brainDocs: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(brainDocs)
          .where(both(brainDocs))
          .orderBy(desc(brainDocs.createdAt), desc(brainDocs.id)),
      brainAssetSummary: async (tx?: TxLike) => {
        const conn = tx ?? db;
        // ONE statement gives the page one coherent database snapshot. The
        // four populations deliberately do not reuse any bounded list reader.
        const [row] = await conn.select({
          brainVersions: sql<number>`(
            select count(*)::integer from ${brainDocs}
            where ${brainDocs.profileId} = ${profileId}
              and ${brainDocs.workspaceId} = ${workspaceId}
          )`,
          testedRules: sql<number>`coalesce((
            select max(jsonb_array_length(${brainDocs.content} -> 'rules'))::integer
            from ${brainDocs}
            where ${brainDocs.profileId} = ${profileId}
              and ${brainDocs.workspaceId} = ${workspaceId}
              and ${brainDocs.kind} = 'performance_meta'
          ), 0)`,
          loggedResults: sql<number>`(
            select count(*)::integer from ${results}
            where ${results.profileId} = ${profileId}
              and ${results.workspaceId} = ${workspaceId}
          )`,
          feedback: sql<number>`(
            select count(*)::integer from ${generationFeedback}
            where ${generationFeedback.profileId} = ${profileId}
              and ${generationFeedback.workspaceId} = ${workspaceId}
          )`,
        }).from(sql`(select 1) as brain_asset_summary_anchor`);
        return {
          brainVersions: row?.brainVersions ?? 0,
          testedRules: row?.testedRules ?? 0,
          loggedResults: row?.loggedResults ?? 0,
          feedback: row?.feedback ?? 0,
        };
      },
      brainDocsByKind: (kind: BrainKind, tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(brainDocs)
          .where(and(both(brainDocs), eq(brainDocs.kind, kind)))
          .orderBy(desc(brainDocs.version), desc(brainDocs.id)),
      // Slice 9a fix pass. FOUR SCALARS, never `content` — see the type.
      strategyMetricVersions: async (tx?: TxLike) => {
        const rows = await (tx ?? db)
          .select({
            id: brainDocs.id,
            // BOTH SCOPE COLUMNS, even though the caller filters by scope
            // already: the cage's own completeness machinery asserts them on
            // every row a scoped accessor returns, and a projection that
            // dropped them would make this the one read whose tenancy nobody
            // checks. Two uuids on at most 200 rows is not a saving worth that.
            profileId: brainDocs.profileId,
            workspaceId: brainDocs.workspaceId,
            status: brainDocs.status,
            label: sql<
              string | null
            >`${brainDocs.content} -> 'metric' ->> 'label'`,
            unit: sql<string | null>`${brainDocs.content} -> 'metric' ->> 'unit'`,
            direction: sql<
              string | null
            >`${brainDocs.content} -> 'metric' ->> 'direction'`,
            hasMetric: sql<
              boolean
            >`jsonb_typeof(${brainDocs.content} -> 'metric') = 'object'`,
          })
          .from(brainDocs)
          .where(and(both(brainDocs), eq(brainDocs.kind, "strategy")))
          .orderBy(desc(brainDocs.version), desc(brainDocs.id))
          // SELF-BOUNDING, even though `BRAIN_VERSION_MAX` already caps the
          // write side: a read whose size depends on a limit enforced
          // somewhere else is a read nobody can reason about locally.
          .limit(BRAIN_VERSION_MAX);
        return rows.map((row) => ({
          id: row.id,
          profileId: row.profileId,
          workspaceId: row.workspaceId,
          status: row.status,
          // `->>` yields NULL both for "no metric object" and for "metric with
          // no label", and `declaredMetricOf` treats a non-string as absent —
          // so the two collapse safely. `hasMetric` keeps the distinction
          // available rather than inferring it from three NULLs.
          metric: row.hasMetric
            ? { label: row.label, unit: row.unit, direction: row.direction }
            : { label: null, unit: null, direction: null },
        }));
      },
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
              // EVERY VERSION, INCLUDING SUPERSEDED AND RETIRED ONES, and that
              // is the deliberate difference from `privateFrameworks()` below.
              // Slice 7 made framework versioning append a row, so the earlier
              // versions of a creator's own framework are their history — an
              // export that returned only the live one would hand back less
              // than the creator holds, which is the truncation R11 calls a
              // fail-closed refusal everywhere else.
              .where(ownPrivateFramework())
              .orderBy(desc(frameworks.createdAt), desc(frameworks.id))
              .limit(EXPORT_PAGE_SIZE)
              .offset(offset);
          // Slice 7 (R10/R11). THE SAME QUERY the one sanctioned raw accessor
          // uses — see `feedbackPage` above — at the export page size. Sharing
          // it is what keeps "exactly one raw reader of this table" true while
          // still exporting it.
          case "generation_feedback":
            return feedbackPage(conn, EXPORT_PAGE_SIZE, offset);
          // Slice 8 private/shared-content rows. All three branches use the
          // composite scope predicate: a profile-private row must never reach
          // a sibling profile merely because the item id or digest matches.
          // Shared rows have NULL ownership and consequently do not match.
          case "trend_sources":
            return conn.select().from(trendSources).where(both(trendSources))
              .orderBy(desc(trendSources.createdAt), desc(trendSources.id))
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          case "trend_items":
            return conn.select().from(trendItems).where(both(trendItems))
              .orderBy(desc(trendItems.createdAt), desc(trendItems.id))
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          case "tracked_niches":
            return conn.select().from(trackedNiches).where(both(trackedNiches))
              .orderBy(desc(trackedNiches.createdAt), desc(trackedNiches.id))
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          case "trend_transcripts":
            return conn.select().from(trendTranscripts).where(both(trendTranscripts))
              .orderBy(desc(trendTranscripts.createdAt), desc(trendTranscripts.id))
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          case "autopsies":
            return conn.select().from(autopsies).where(both(autopsies))
              .orderBy(desc(autopsies.createdAt), desc(autopsies.id))
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          case "autopsy_cache_claims":
            return conn.select().from(autopsyCacheClaims).where(both(autopsyCacheClaims))
              .orderBy(desc(autopsyCacheClaims.createdAt), desc(autopsyCacheClaims.id))
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          // Slice 9a (R5). THE SAME QUERY the accessor uses — see
          // `resultsPage` above — at the export page size, the
          // `generation_feedback` arrangement one branch up.
          case "results":
            return resultsPage(conn, EXPORT_PAGE_SIZE, offset);
          case "promotion_proposals":
            return conn.select().from(promotionProposals)
              .where(both(promotionProposals))
              .orderBy(desc(promotionProposals.createdAt), desc(promotionProposals.id))
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          case "proposal_evidence_results":
            return conn.select().from(proposalEvidenceResults)
              .where(both(proposalEvidenceResults))
              .orderBy(
                asc(proposalEvidenceResults.proposalId),
                asc(proposalEvidenceResults.resultId)
              )
              .limit(EXPORT_PAGE_SIZE).offset(offset);
          case "proposal_evidence_feedback":
            return conn.select().from(proposalEvidenceFeedback)
              .where(both(proposalEvidenceFeedback))
              .orderBy(
                asc(proposalEvidenceFeedback.proposalId),
                asc(proposalEvidenceFeedback.feedbackId)
              )
              .limit(EXPORT_PAGE_SIZE).offset(offset);
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
        inputClass?: InputClass,
        tx?: TxLike
      ) =>
        (tx ?? db)
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
      ownPostsNewest: (limit: number, tx?: TxLike) =>
        (tx ?? db)
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
      countUnchargedBillableAttempts: async ({ purpose, since }, tx?: TxLike) => {
        // DISTINCT ATTEMPTS, never rows: a bounded retry inside one attempt
        // is one attempt. (The accessor that used to state this rule one
        // position up, `countBillableAttempts`, is gone — R-80 replaced the
        // derived ranking it computed with the `first_billable_attempts`
        // claim. The rule survives it, and this is now its only statement.)
        //
        // AND WITHIN A WINDOW. `model_usage` is append-only and only grows, so
        // an unbounded count is a LIFETIME count: N deterministic failures ever
        // refuse this profile's purpose permanently, and the only remedy is an
        // operator raising a GLOBAL config key with no surface telling them who
        // is stuck. `created_at` is server-stamped on this table, so the window
        // is measured against the database's own clock.
        const [row] = await (tx ?? db)
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
      /**
       * The MONEY the uncharged-billable attempts in this window cost us.
       *
       * WHY A SECOND ACCESSOR RATHER THAN A WIDER FIRST ONE (billing gate,
       * 2026-09-04). `countUnchargedBillableAttempts` bounds a COUNT while what
       * it protects is SPEND, and the 2026-09-04 ceiling change proved the gap:
       * `llm.maxOutputTokens` moved 4,000 -> 12,000, the worst-case cost of one
       * uncharged attempt went 0.14 -> 0.42 USD, and not one control noticed
       * because no control was denominated in money. On Free — which requires
       * no card — that is a floor of 100.80 USD per profile per day.
       *
       * EXACTLY THE SAME PREDICATE as the count above, deliberately: same
       * purpose, same billable outcomes, same `consumedIncludedBuild = false`,
       * same window. Two bounds over one population, so a reader comparing them
       * is comparing two numbers about the same rows.
       *
       * `cost_micro_usd` IS NULL WHEN `cost_state` IS 'unknown', and those rows
       * contribute ZERO here. That understates, which is the dangerous
       * direction, and it is why this cap REPLACES NOTHING: the attempt cap
       * still bounds the count of rows whose cost we could not compute. Stated
       * rather than papered over with an invented price — see
       * `AUTOPSY_VENDOR_CALLS_PER_ATTEMPT`'s sibling problem, which the autopsy
       * worker solves by reserving against a ceiling BEFORE the call.
       */
      sumUnchargedBillableCostMicroUsd: async ({ purpose, since }, tx?: TxLike) => {
        const [row] = await (tx ?? db)
          .select({ total: sum(modelUsage.costMicroUsd) })
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
        // `sum` returns a string (bigint) or null on an empty set.
        return row?.total == null ? 0 : Number(row.total);
      },
      countOwnPosts: async (tx?: TxLike) => {
        const [row] = await (tx ?? db)
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
      countReferencePosts: async (tx?: TxLike) => {
        const [row] = await (tx ?? db)
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
      // `tx` for the same reason `firstBillableAttempt` takes a `conn`: the
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
      countOnboardingInputs: async (tx?: TxLike) => {
        const [row] = await (tx ?? db)
          .select({ n: count() })
          .from(onboardingInputs)
          .where(both(onboardingInputs));
        return row?.n ?? 0;
      },
      modelUsage: (tx?: TxLike) =>
        (tx ?? db).select().from(modelUsage).where(both(modelUsage)),
      // ONE QUERY, ONE POPULATION (R-80). The claim row is written by
      // `recordModelUsage`; nothing here re-derives it, which is the point —
      // three readers of one "which attempt is first" rule is how the rule
      // came to disagree with itself.
      firstBillableAttempt: async ({ purpose, settlement }, conn) => {
        const rows = await (conn ?? db)
          .select()
          .from(firstBillableAttempts)
          // `both()` is the workspace+profile predicate every accessor here
          // shares. Dropping it would let a sibling profile's claim price this
          // creator's build.
          .where(
            and(
              both(firstBillableAttempts),
              eq(firstBillableAttempts.purpose, purpose)
            )
          )
          // `limit(1)` WITH NO ORDER BY IS EXACT HERE, AND ONLY HERE: the
          // unique index makes at most one row satisfy this predicate, so
          // there is no second row for an order to choose between. If that
          // index were ever lost, this would become an arbitrary pick — which
          // is why the index is asserted structurally in
          // `packages/db/tests/migration-shape.test.ts` rather than assumed.
          .limit(1);
        if (rows.length === 0 && settlement === "settled") {
          throw new WorkspaceAccessError(
            "firstBillableAttempt: this attempt's billable usage row has committed (R11) but no first-billable claim exists for it — refusing to price from a missing record"
          );
        }
        return rows;
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
      // Slice 7 (R10/R11). Clamped like every other growing list, and reading
      // through the ONE helper — see `feedbackPage`.
      generationFeedback: (
        page: LedgerPage = { limit: LEDGER_PAGE_MAX },
        tx?: TxLike
      ) =>
        feedbackPage(
          tx ?? db,
          clampPageNumber(page.limit, 1, LEDGER_PAGE_MAX, 1),
          clampPageNumber(page.offset, 0, Number.MAX_SAFE_INTEGER, 0)
        ),
      // Slice 9a (R5). Clamped like every other growing list, and reading
      // through the ONE helper — see `resultsPage`.
      results: (
        page: LedgerPage = { limit: LEDGER_PAGE_MAX },
        tx?: TxLike
      ) =>
        resultsPage(
          tx ?? db,
          clampPageNumber(page.limit, 1, LEDGER_PAGE_MAX, 1),
          clampPageNumber(page.offset, 0, Number.MAX_SAFE_INTEGER, 0)
        ),
      // Slice 9a (C5). THE COMPARISON POPULATION — see the type's docblock for
      // why this is a query and not a filter over `results()`'s page, and for
      // why the stratum is optional.
      comparableResults: async (
        stratum?: ComparableResultsStratum,
        tx?: TxLike
      ): Promise<ComparableResults> => {
        // BOTH SCOPE COLUMNS ALWAYS, whichever branch this is. The stratum is
        // optional; the cage is not.
        const predicates = [both(results)];
        if (stratum !== undefined) {
          // THE ARGUMENTS ARE CHECKED, like `exportPage`'s offset one branch up
          // and for the same reason: an `Invalid Date` reaches the driver as
          // `NaN` and an unknown audience class reaches the pgEnum as a 22P02,
          // and neither is a refusal a caller can act on.
          //
          // `ComparisonStratumError`, NOT `WorkspaceAccessError`, and the
          // difference was measured rather than assumed (2026-09-04, builder
          // C's check). `WorkspaceAccessError` IS covered in
          // `billing-errors.ts` — so this would not have rendered as "Something
          // went wrong". It would have rendered as its copy, which tells the
          // reader to "sign in with the account that owns it": a confident,
          // WRONG instruction for what is our own malformed argument. See the
          // class for why one class serving two causes is how that copy came to
          // be wrong. It is also not `ResultInputError`: nothing here is a
          // creator's form input — 9a passes no stratum at all and 9b composes
          // one from stored rows — so the remedy is ours, and the message says
          // so instead of asking a creator to fix something they did not do.
          const metricDeclaredByDocIds = stratum.metricDeclaredByDocIds;
          if (
            !Array.isArray(metricDeclaredByDocIds) ||
            metricDeclaredByDocIds.length === 0
          ) {
            throw new ComparisonStratumError(
              "it did not name any metric-declaring Strategy version"
            );
          }
          if (
            metricDeclaredByDocIds.some(
              (id) => typeof id !== "string" || !UUID_RE.test(id)
            ) ||
            new Set(metricDeclaredByDocIds).size !== metricDeclaredByDocIds.length
          ) {
            throw new ComparisonStratumError(
              "its metric-declaring Strategy version set is malformed"
            );
          }
          for (const [what, when] of [
            ["observedFrom", stratum.observedFrom],
            ["observedTo", stratum.observedTo],
          ] as const) {
            if (!(when instanceof Date) || Number.isNaN(when.getTime())) {
              throw new ComparisonStratumError(
                `its observation window's ${what === "observedFrom" ? "start" : "end"} is not a usable date`
              );
            }
          }
          if (stratum.observedTo.getTime() <= stratum.observedFrom.getTime()) {
            throw new ComparisonStratumError(
              "its observation window ends before it starts, so there is no period to compare over"
            );
          }
          if (
            typeof stratum.audienceClass !== "string" ||
            !(RESULT_AUDIENCE_CLASSES as readonly string[]).includes(
              stratum.audienceClass
            )
          ) {
            throw new ComparisonStratumError(
              "it named an audience class this product does not have. Paid and organic are never pooled, so there is no third population to compare over"
            );
          }
          predicates.push(
            eq(results.platform, stratum.platform),
            eq(results.audienceClass, stratum.audienceClass),
            eq(results.metricKey, stratum.metricKey),
            inArray(results.metricDeclaredByDocId, metricDeclaredByDocIds),
            // CONTAINMENT, pinned to `@respin/brain`'s `inStratum`.
            gte(results.observedFrom, stratum.observedFrom),
            lte(results.observedTo, stratum.observedTo)
          );
        }
        // ONE MORE ROW THAN THE BOUND, so "there are more" is MEASURED rather
        // than inferred from a full page (which is indistinguishable from a
        // population that happens to be exactly the bound). The extra row is
        // dropped below and never reaches a caller. IDENTICAL ON BOTH BRANCHES,
        // which is the property the no-stratum path needs most: the whole
        // population is exactly where truncation is likeliest, so the branch
        // 9a actually walks must not be the one with the weaker accounting.
        const page = await (tx ?? db)
          // THE PROJECTION, NOT `select()` — see `comparableResultProjection`.
          // This is the one read in the package whose row count is bounded by a
          // DOMAIN figure rather than by a page size, so it is the one read
          // where an unbounded text column turns a row bound into no bound at
          // all. `note` is the only large column and no comparison reads it.
          .select(comparableResultProjection)
          .from(results)
          .where(and(...predicates))
          .orderBy(desc(results.observedTo), desc(results.id))
          .limit(COMPARISON_POPULATION_MAX + 1);
        const truncated = page.length > COMPARISON_POPULATION_MAX;
        return {
          rows: truncated ? page.slice(0, COMPARISON_POPULATION_MAX) : page,
          truncated,
          limit: COMPARISON_POPULATION_MAX,
        };
      },
      // Slice 9a. The creator's own outputs, newest first with `id` as the
      // tie-break — the ONE display order this file uses everywhere.
      generationsNewest: (
        page: LedgerPage = { limit: LEDGER_PAGE_MAX },
        tx?: TxLike
      ) =>
        (tx ?? db)
          .select()
          .from(generations)
          .where(both(generations))
          .orderBy(desc(generations.createdAt), desc(generations.id))
          .limit(clampPageNumber(page.limit, 1, LEDGER_PAGE_MAX, 1))
          .offset(clampPageNumber(page.offset, 0, Number.MAX_SAFE_INTEGER, 0)),
      promotionResultInputs: async (tx?: TxLike) => ({
        strategyMetricVersions: await this.accessors.strategyMetricVersions(tx),
        population: await this.accessors.comparableResults(undefined, tx),
      }),
      promotionFeedbackInputs: async (tx?: TxLike) => {
        const rows = await (tx ?? db)
          .select({
            feedbackId: generationFeedback.id,
            generationId: generationFeedback.generationId,
            profileId: generationFeedback.profileId,
            workspaceId: generationFeedback.workspaceId,
            reaction: generationFeedback.reaction,
            voiceDocId: brainActivationSnapshots.voiceDocId,
            killtestDocId: brainActivationSnapshots.killtestDocId,
          })
          .from(generationFeedback)
          .innerJoin(
            generations,
            and(
              eq(generations.id, generationFeedback.generationId),
              both(generations)
            )
          )
          .innerJoin(
            brainActivationSnapshots,
            and(
              eq(brainActivationSnapshots.id, generations.brainActivationId),
              both(brainActivationSnapshots)
            )
          )
          .where(both(generationFeedback));
        return rows.map((row) => ({
          feedbackId: row.feedbackId,
          generationId: row.generationId,
          profileId: row.profileId,
          workspaceId: row.workspaceId,
          reaction: row.reaction,
          basisBrainDocId:
            row.reaction === "off_voice"
              ? row.voiceDocId
              : row.reaction === "too_generic" ||
                  row.reaction === "wrong_angle" ||
                  row.reaction === "not_filmable"
                ? row.killtestDocId
                : null,
        }));
      },
      promotionProposalReview: async (proposalId: string, tx?: TxLike) => {
        if (typeof proposalId !== "string" || !UUID_RE.test(proposalId)) return null;
        const conn = tx ?? db;
        const [proposal] = await conn
          .select()
          .from(promotionProposals)
          .where(and(both(promotionProposals), eq(promotionProposals.id, proposalId)))
          .limit(1);
        if (!proposal) return null;
        // Read BOTH join tables. Source exclusivity is an operation invariant,
        // and hiding the opposite table here would make a mixed row set look
        // valid to the only review/Accept revalidator.
        const resultEvidence = await conn
              .select({ ...comparableResultProjection, role: proposalEvidenceResults.role })
              .from(proposalEvidenceResults)
              .innerJoin(
                results,
                and(
                  eq(results.id, proposalEvidenceResults.resultId),
                  both(results)
                )
              )
              .where(
                and(
                  both(proposalEvidenceResults),
                  eq(proposalEvidenceResults.proposalId, proposal.id)
                )
              );
        const feedbackRows = await conn
              .select({
                feedbackId: generationFeedback.id,
                generationId: generationFeedback.generationId,
                profileId: generationFeedback.profileId,
                workspaceId: generationFeedback.workspaceId,
                reaction: generationFeedback.reaction,
                voiceDocId: brainActivationSnapshots.voiceDocId,
                killtestDocId: brainActivationSnapshots.killtestDocId,
              })
              .from(proposalEvidenceFeedback)
              .innerJoin(
                generationFeedback,
                and(
                  eq(generationFeedback.id, proposalEvidenceFeedback.feedbackId),
                  both(generationFeedback)
                )
              )
              .innerJoin(
                generations,
                and(
                  eq(generations.id, generationFeedback.generationId),
                  both(generations)
                )
              )
              .innerJoin(
                brainActivationSnapshots,
                and(
                  eq(brainActivationSnapshots.id, generations.brainActivationId),
                  both(brainActivationSnapshots)
                )
              )
              .where(
                and(
                  both(proposalEvidenceFeedback),
                  eq(proposalEvidenceFeedback.proposalId, proposal.id)
                )
              );
        const feedbackEvidence = feedbackRows.map((row) => ({
          feedbackId: row.feedbackId,
          generationId: row.generationId,
          profileId: row.profileId,
          workspaceId: row.workspaceId,
          reaction: row.reaction,
          basisBrainDocId:
            row.reaction === "off_voice"
              ? row.voiceDocId
              : row.reaction === "too_generic" ||
                  row.reaction === "wrong_angle" ||
                  row.reaction === "not_filmable"
                ? row.killtestDocId
                : null,
        }));
        return { proposal, resultEvidence, feedbackEvidence };
      },
      promotionProposalHistory: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(promotionProposals)
          .where(both(promotionProposals))
          .orderBy(desc(promotionProposals.createdAt), desc(promotionProposals.id)),
      privateFrameworks: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(frameworks)
          .where(
            and(
              ownPrivateFramework(),
              isNull(frameworks.supersededAt),
              isNull(frameworks.retiredAt)
            )
          )
          .orderBy(desc(frameworks.createdAt), desc(frameworks.id)),
      eligibleFrameworks: (tx?: TxLike) =>
        (tx ?? db)
          .select()
          .from(frameworks)
          .where(
            and(
              frameworkIsRecommendable(),
              // SHARED (owned by nobody) OR THIS PROFILE'S PRIVATE ROWS. The
              // `or` is the whole R5c reader: without the second arm a Pro
              // creator's own framework never reaches generation, and without
              // the first arm the library does not either.
              or(eq(frameworks.visibility, "shared"), ownPrivateFramework())
            )
          )
          // CURATED LIBRARY FIRST, THEN THE CREATOR'S OWN (billing gate,
          // 2026-09-01, MEASURED). The order used to be `slug ASC, version
          // DESC` alone, and the consumer of this list — `frameworksForContext`
          // in `@respin/credits` — fills a character budget in the order it
          // receives, dropping whole rows once the budget is spent. EVERY ONE
          // of the nine seeded slugs begins `the-`, so a creator's private
          // frameworks sort ahead of most of the library: at 25 private rows
          // one curated framework was evicted, and at 40 all nine were. A
          // creator can silently lose the entire product's curated library from
          // their own prompts by writing enough frameworks — and nothing tells
          // them, because a dropped framework is simply not offered.
          //
          // A CASE EXPRESSION, NOT `asc(visibility)`. The enum happens to
          // declare `shared` before `private`, so ordering by the column would
          // work TODAY and would silently invert the day somebody re-orders the
          // enum for an unrelated reason — a correctness property resting on a
          // declaration order nobody would think to check.
          //
          // The remaining order is unchanged and still arbitrary-but-
          // deterministic within each half, which is what `frameworksForContext`
          // says about it. What is no longer arbitrary is WHICH HALF pays: the
          // budget can only ration the part a creator can grow.
          .orderBy(
            sql`case when ${frameworks.visibility} = 'shared' then 0 else 1 end`,
            asc(frameworks.slug),
            desc(frameworks.version)
          ),
    };
    this.accessors = lifecycleGuardedMethods(
      db,
      accessors,
      {
        profile: 0,
        brainDocs: 0,
        brainAssetSummary: 0,
        brainDocsByKind: 1,
        brainDocsByIds: 1,
        strategyMetricVersions: 0,
        exportPage: 2,
        onboardingInputs: 2,
        onboardingInputsByIds: 1,
        ownPostsNewest: 1,
        countOwnPosts: 0,
        countReferencePosts: 0,
        countUnchargedBillableAttempts: 1,
        sumUnchargedBillableCostMicroUsd: 1,
        latestBrainActivation: 0,
        countOnboardingInputs: 0,
        modelUsage: 0,
        firstBillableAttempt: 1,
        referenceCorpusAsOf: 1,
        generationFeedback: 1,
        results: 1,
        comparableResults: 1,
        generationsNewest: 1,
        promotionResultInputs: 0,
        promotionFeedbackInputs: 0,
        promotionProposalReview: 1,
        promotionProposalHistory: 0,
        privateFrameworks: 0,
        eligibleFrameworks: 0,
      },
      async (tx) => {
        const authority = await assertProfileLifecycleTransactionAccess(
          tx,
          userId as string,
          workspaceId,
          profileId
        );
        assertFreshProfileAuthority(authority, {
          membershipVersion,
          workspaceLifecycleVersion,
          profileLifecycleVersion,
        });
      }
    );
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
    const authority = await assertProfileLifecycleAccess(
      db,
      scope.userId as string,
      scope.workspaceId as string,
      profileId
    ).catch(() => {
      throw new ProfileAccessError();
    });
    assertFreshWorkspaceAuthority(authority, scope);
    return new ProfileScope(
      MINT,
      db,
      scope.workspaceId,
      profileId as VerifiedProfileId,
      // Use the LIVE authority, not the cached workspace role. A demotion that
      // races minting must never create an owner-capable profile scope.
      authority.role,
      scope.userId,
      authority.version,
      authority.workspaceLifecycleVersion,
      authority.profileLifecycleVersion
    );
  }

  toString(): string {
    return `ProfileScope(${this.profileId})${this.#cage ? "" : ""}`;
  }
}

/** Duplication-safe scope grain; class identity is not a security boundary. */
export function scopeGrain(s: unknown): "profile" | "workspace" {
  assertScoped(s);
  return profileCage.has(s) ? "profile" : "workspace";
}

export function isProfileScope(s: unknown): s is ProfileScope {
  return scopeGrain(s) === "profile";
}

export function isWorkspaceScope(s: unknown): s is WorkspaceScope {
  return scopeGrain(s) === "workspace";
}

/** App/test seam for the exact scoped brain-as-an-asset aggregate. */
export async function brainAssetSummary(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<BrainAssetSummary> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return profileScope.accessors.brainAssetSummary();
}

/** App/test seam for whether this profile has produced any generation row. */
export async function hasGenerationForProfile(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<boolean> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return (await profileScope.accessors.generationsNewest({ limit: 1 })).length > 0;
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
  // Phase 10b-1 advances this epoch only inside lifecycle authorities. A caller
  // must never choose the value used to invalidate already-minted scopes.
  "lifecycleVersion",
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
  /**
   * RECORD ONE STRUCTURED REACTION to one of this creator's outputs (slice 7,
   * R10 / REQ-C05).
   *
   * EVERY COLUMN IS BUILT HERE FROM THE SCOPE OR FROM A VALIDATED PARAMETER —
   * the same "never build a spread to strip" property the four slice-6
   * capabilities have. `profile_id` and `workspace_id` come off the scope, so
   * a caller cannot record feedback into another creator's record even by
   * casting; `generation_id` is caller-supplied and is proved to belong to
   * this scope by the composite FK, which is why that FK carries all three
   * columns rather than one.
   *
   * IT DERIVES NOTHING (R11). It writes a row and returns it. There is no
   * counter, no rollup, no "this is the third time you said that" — those are
   * `packages/brain`'s to build in slice 9, and the scan that keeps them out
   * of everywhere else is `tests/feedback-readers.test.ts`.
   *
   * `tx` IS REQUIRED, not optional, for the reason `recordModelUsage`'s
   * docblock gives: an optional `tx` made a shared-fate claim false with no
   * compiler signal. The caller decides what this shares fate with.
   */
  recordGenerationFeedback: (
    params: RecordGenerationFeedbackParams,
    tx: TxLike
  ) => Promise<GenerationFeedbackRow>;
  /**
   * LOG ONE RESULT against this creator's own record (slice 9a, R5-R9).
   *
   * FIVE OF THE ROW'S COLUMNS ARE SERVER-DERIVED AND HAVE NO PARAMETER AT ALL,
   * which is a stronger property than validating them and is where most of
   * this capability's value is:
   *
   *   `evidence_state`  — DERIVED from whether numbers were supplied. Manual
   *       numbers are `quantified_self_reported`; no numbers is
   *       `unquantified`. R6 says numbers a creator typed are not verified,
   *       and there is no parameter through which a caller could say otherwise.
   *   `connector_*`     — the three columns that gate `connector_verified`
   *       (R6). v1 has no connector, so this capability writes NULL into all
   *       three and offers no parameter for them; the database's equality
   *       CHECK then makes `connector_verified` UNREACHABLE rather than merely
   *       unwritten. Nothing needs lifting by migration when a connector lands
   *       — a writer that can produce the provenance can assign the state.
   *   `metric_key` / `metric_declared_by_doc_id` — READ from the profile's own
   *       ACTIVE strategy document (R8/REQ-B03). A caller-supplied metric key
   *       would be a second metric path beside slice 3b's declaration, which
   *       R8 forbids in as many words; a caller-supplied doc id would let a
   *       result cite a version that never declared the metric it names.
   *   `treatment_key`   — COMPUTED by `treatmentKeyFor` from the generation
   *       this capability re-read through the profile's own scope (C4). Never
   *       creator-typed and never free text: it is the predicate that decides
   *       whether three results are three runs of ONE thing.
   *
   * `profile_id` and `workspace_id` come off the scope and `generation_id` is
   * proved to belong to it by BOTH a scoped re-read (so the refusal is
   * sayable) and the composite FK (so a cross-tenant row is unrepresentable) —
   * the `recordGenerationFeedback` arrangement, and the reason that FK carries
   * all three columns rather than one.
   *
   * IT DERIVES NO COMPARISON. It writes a row and returns it. The cohort, the
   * baseline, the median and the effect are `@respin/brain`'s (contract C5);
   * this capability has no count, no grouping and no minimum-n in it.
   *
   * `tx` IS REQUIRED, not optional, for the reason `recordModelUsage`'s
   * docblock gives: an optional `tx` made a shared-fate claim false with no
   * compiler signal. The caller decides what this shares fate with.
   */
  recordResult: (
    params: RecordResultParams,
    entitlement: PerformanceLearningEntitlement,
    tx: TxLike
  ) => Promise<ResultRow>;
  refreshPromotionProposals: (
    entitlement: PerformanceLearningEntitlement,
    tx: TxLike
  ) => Promise<PromotionProposal[]>;
  appendPromotionSummaryForProposal: (
    proposalId: string,
    tx: TxLike
  ) => Promise<OnboardingInput>;
  decidePromotionProposal: (
    params: DecidePromotionProposalParams,
    entitlement: PerformanceLearningEntitlement,
    tx: TxLike
  ) => Promise<PromotionDecisionResult>;
};

export type PerformanceLearningEntitlement = "view_only" | "full";

export function assertFullPerformanceLearning(
  entitlement: PerformanceLearningEntitlement
): void {
  if (entitlement !== "full") throw new PerformanceLearningEntitlementError();
}

/**
 * The caller-suppliable half of one logged result (slice 9a, R5-R9).
 *
 * WHAT IS NOT HERE IS THE POINT — see `recordResult`'s docblock for the five
 * server-derived columns that have no parameter. Every column this capability
 * writes is built FIELD BY FIELD from a validated local or from the scope;
 * this object is never spread into `.values()`, which is the
 * `ClaimGenerationAttemptParams` property: "a value smuggled in through
 * `as unknown as` cannot be stripped incorrectly because it is never copied at
 * all", and `results-schema-write.test.ts` drives that with casts rather than
 * only with `@ts-expect-error`.
 *
 * THE TWO LEVERS ARE TWO OPTIONAL PAIRS, not four optional scalars, so "a
 * value without its denominator" is not expressible in the type either —
 * `results_lever_pairs_complete` refuses it at the database, this shape
 * refuses it at the compiler, and neither is trusted alone.
 */
export type RecordResultParams = {
  /**
   * The output this result is about — OPTIONAL (R5, C4).
   *
   * Absent means "a post this product did not write". Such a result is stored,
   * carries NO treatment key (there is nothing to derive one from), and is
   * therefore eligible for the BASELINE and never for a treatment cohort.
   * That consequence is a database property here
   * (`results_treatment_key_iff_generation`), not a convention.
   */
  generationId?: string;
  platform: string;
  /**
   * `string`, NOT `ResultAudienceClass` — WIDENED DELIBERATELY (2026-09-04).
   *
   * It arrives from a form post, where anything can be typed, and builder C
   * REFUSED to cast it at the call site. That refusal is the correct one and
   * this widening is its other half: a cast would have made the closed set a
   * claim the TYPE makes about a value the WIRE controls — the 2026-08-26
   * trusted-`input_class` finding exactly — leaving the database's enum as the
   * only thing between a form post and a 22P02 rendered as "Something went
   * wrong". Narrowing happens HERE, once, with a refusal that names what
   * arrived, which is the only place that can both see the closed set and
   * produce a creator-readable sentence.
   */
  audienceClass: string;
  observedFrom: Date;
  observedTo: Date;
  /**
   * The two levers, each all-or-nothing. Supplying NEITHER is the
   * `unquantified` result R6 keeps: stored, visible, and structurally excluded
   * from every numerical cohort because the row then carries no number at all.
   *
   * Decimal STRINGS, not numbers: the column is `numeric` and drizzle reads it
   * back as a string, so taking a JS `number` here would put a binary float in
   * the one place a creator's typed figure has to survive exactly.
   */
  reach?: { value: string; denominator: string };
  conversion?: { value: string; denominator: string };
  /**
   * Codes from `RESULT_CONFOUNDER_CODES`, deduplicated and ordered by the
   * server. `readonly string[]` for the same reason `audienceClass` is
   * `string`: checkbox names off a form are wire input, not a vocabulary.
   */
  confounders?: readonly string[];
  /** Optional creator words. `undefined` and a blank string are not the same. */
  note?: string;
} & NoServerFields;

/**
 * The caller-suppliable half of one feedback event (slice 7, R10).
 *
 * THREE FIELDS, and two of them are validated before anything is written:
 * `reaction` against the closed set (so an unknown code is
 * `FeedbackReactionError` rather than a raw enum 22P02), and `note` against
 * its blank/length rules (so an oversized paste is `FeedbackNoteError` rather
 * than an unbounded column). `generationId` is validated by the DATABASE — the
 * composite FK is the thing that can actually prove it is this creator's.
 */
export type RecordGenerationFeedbackParams = {
  generationId: string;
  reaction: GenerationFeedbackReaction;
  /** Optional creator words. `undefined` and a blank string are not the same. */
  note?: string;
} & NoServerFields;

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
  /**
   * THE OUTPUT THIS ONE REVISES (slice 7, R6), or absent for an original.
   *
   * A PLAIN STRING, like `profileId` at every other boundary in this package,
   * and for the same reason: there is no `trustGenerationId` and there never
   * will be. `settleGeneration` re-reads the id through the scope's own
   * predicate before it writes, so a foreign, nonexistent, or not-yet-earlier
   * parent produces `GenerationLineageError` — one message for all three (the
   * enumeration rule `ProfileAccessError` states, sharpened here because a
   * uuidv7 leaks creation time as well as existence).
   *
   * `undefined` MEANS ORIGINAL. There is deliberately no `null` in the type:
   * two spellings of "no parent" is two things a caller can mean by accident,
   * and the column's own default handles the absent case.
   */
  parentId?: string;
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
function assertOwner(role: MembershipRole, act: string): void {
  if (role !== "owner") throw new ProfileRoleError(act, role, "owner");
}

/**
 * The role gate on the profile-grained WRITES, as opposed to the two acts that
 * decide what the product believes (`assertOwner` above).
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
function assertOwnerOrEditor(role: MembershipRole, act: string): void {
  if (role === "viewer") throw new ProfileRoleError(act, role);
}

/**
 * Transaction-local authority for profile operations implemented outside the
 * main capability object. It binds the write/read to the minted scope epoch,
 * so demotion or tombstone/cancel cannot revive an older capability.
 */
export async function assertFreshProfileScopeInTx(
  tx: TxLike,
  scope: ProfileScope,
  allowedRoles?: readonly MembershipRole[],
  act = "use this creator profile"
): Promise<MembershipRole> {
  assertScoped(scope);
  if (!profileCage.has(scope)) throw new ScopeForgeryError("A profile scope");
  const authority = await assertProfileLifecycleTransactionAccess(
    tx,
    scope.userId as string,
    scope.workspaceId as string,
    scope.profileId as string
  );
  assertFreshProfileAuthority(authority, scope);
  if (allowedRoles && !allowedRoles.includes(authority.role)) {
    throw new ProfileRoleError(act, authority.role);
  }
  return authority.role;
}

/** Transaction-local freshness check for workspace-level operations. */
export async function assertFreshWorkspaceScopeInTx(
  tx: TxLike,
  scope: WorkspaceScope
): Promise<MembershipRole> {
  assertScoped(scope);
  if (!workspaceCage.has(scope)) throw new ScopeForgeryError("A workspace scope");
  const authority = await assertWorkspaceLifecycleTransactionAccess(
    tx,
    scope.userId as string,
    scope.workspaceId as string
  );
  assertFreshWorkspaceAuthority(authority, scope);
  return authority.role;
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
 *
 * EXPORTED (slice 8c, R4) for ONE reader: `intakePastedReference` computes the
 * transcript digest it looks up for idempotency BEFORE `appendOnboardingInput`
 * stores the text, and a second normaliser there would be a second definition
 * of the stored bytes. It is pure and idempotent; the value that lands in the
 * column still comes from here.
 */
export function normaliseContent(raw: string): string {
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
      const authority = await assertWorkspaceLifecycleTransactionAccess(
        tx,
        scope.userId as string,
        workspaceId
      );
      assertFreshWorkspaceAuthority(authority, scope);
      assertOwner(authority.role, "count profiles for profile creation");
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
      assertOwner(scope.role, "create a creator profile");
      const authority = await assertWorkspaceLifecycleTransactionAccess(
        tx,
        scope.userId as string,
        workspaceId
      );
      assertFreshWorkspaceAuthority(authority, scope);
      assertOwner(authority.role, "create a creator profile");
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
 * REQ-G08: WHICH CAPABILITY IS REFUSED WHILE THE WORKSPACE IS PAUSED — as a
 * RECORD a new write cannot escape, rather than a sentence in one comment.
 *
 * WHY IT EXISTS (billing gate, 2026-09-02). `writeBrainDoc`'s docblock was the
 * only place A-7's exemptions were written down, it named two
 * (`appendOnboardingInput`, `recordModelUsage`), and slice 7 added a THIRD
 * unpaused write — `recordGenerationFeedback`, measured ACCEPTED under an open
 * pause — without touching that sentence. The behaviour is defensible;
 * "defensible" and "decided" are different, and only one of them is written
 * down. A hand-maintained list in prose is exactly what failed, so this is a
 * MAP KEYED BY CAPABILITY NAME and `packages/db/tests/with-workspace.test.ts`
 * derives its population from the source of `writeCapabilities` and
 * `workspaceWriteCapabilities` themselves: a member that writes, is not gated,
 * and is not named here is a RED TEST, not a discovery for the next reviewer.
 *
 * THREE ANSWERS, and only one of them is free:
 *   `"gated"`  — refuses with `WorkspacePausedError` (directly, or by calling
 *                a capability that does; `activateBrainDocCoherent` is the
 *                second shape and delegates to `activateBrainDoc`).
 *   `"read"`   — writes nothing. REQ-G08 is "frozen and READ-ONLY", so reads
 *                are deliberately never gated.
 *   `{exempt}` — writes, deliberately ungated, WITH ITS WARRANT. The warrant
 *                is the thing being recorded; an entry without one is a
 *                decision nobody made.
 */
export type CapabilityPausePolicy = "gated" | "read" | { exempt: string };

export const WRITE_PAUSE_POLICY: Readonly<
  Record<string, CapabilityPausePolicy>
> = {
  // --- the workspace grain (`workspaceWriteCapabilities`)
  countActiveProfiles: "read",
  createProfile: {
    exempt:
      "Gated ONE LAYER UP, where the tier lives: `createProfile` in packages/credits/src/profiles.ts throws WorkspacePausedError before it reaches this capability. This half stays ungated for the R-30 constraint-2 reason its own docblock gives — @respin/db cannot resolve a tier — and the belt-and-braces guard it DOES carry is the role gate.",
  },
  // --- the profile grain (`writeCapabilities`)
  appendOnboardingInput: {
    exempt:
      "A-7 exemption 1: storing input the creator SUBMITTED. Refusing it would silently discard their own work, which is a worse outcome than letting a paused workspace keep its own text.",
  },
  recordModelUsage: {
    exempt:
      "A-7 exemption 2: the settlement tail. It records spend ALREADY INCURRED; refusing it would lose the record of money we have spent, and the act to gate is the generation, not its receipt.",
  },
  writeBrainDoc: "gated",
  confirmBrainDocFields: "gated",
  activateBrainDoc: "gated",
  activateBrainDocCoherent: "gated",
  claimGenerationAttempt: {
    exempt:
      "The generation itself is refused BEFORE this runs: `generate` in packages/credits/src/generate.ts takes the pause gate at step 4, before it claims an attempt, and `debitCredits` refuses again at the debit. Gating here as well would refuse nothing new.",
  },
  advanceGenerationAttempt: {
    exempt:
      "The SETTLEMENT TAIL of a generation that was already permitted — including the refusal path that records `paused` when a pause opens mid-flight. A pause gate here would refuse the recording of the refusal it caused.",
  },
  settleGeneration: {
    exempt:
      "Same tail as `advanceGenerationAttempt`: the vendor has answered and the debit is in this transaction. Refusing here would take the money and drop the draft.",
  },
  recordGenerationFeedback: {
    exempt:
      "A-7 exemption 1 again, and NAMED HERE because slice 7 added it without touching the list (billing gate, 2026-09-02): a closed reaction code plus the creator's own words about their own output is input they submitted, not an entitlement they spend. It derives nothing (R11), so a paused workspace gains no capability by writing one.",
  },
  readGenerationForAttempt: "read",
  readGenerationAttempt: "read",
  recordResult: {
    exempt:
      "A-7 exemption 1, and the difference from `recordGenerationFeedback` is stated rather than inherited: a comparison IS derived from these rows (contract C5), which feedback's warrant could lean on and this one cannot. It is still input the creator submitted — numbers they observed about their own post, in a window that has already passed and cannot be re-observed later — so refusing it under a pause would silently destroy an observation rather than defer it, which is A-7's exemption exactly. What a paused workspace gains by logging one is nothing an entitlement can price: the comparison is a read of the creator's own rows, it spends no credits, calls no vendor and writes no brain. REVISIT TRIGGER: the first path on which logging a result causes a priced action (9b's proposal construction, if it is ever made automatic rather than requested).",
  },
  refreshPromotionProposals: "gated",
  appendPromotionSummaryForProposal: "gated",
  decidePromotionProposal: "gated",
};

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
      // REQ-A02 / G-13. See `assertOwner` — this is the write slice 1 made
      // browser-reachable, into an immutable table with no delete path.
      assertOwner(scope.role, "add a post to this creator's record");
      // MIRRORS `onboarding_inputs_field_key_iff_creator_authored` IN
      // APPLICATION CODE, before the insert reaches it — the same reason
      // `writeBrainDoc` names its own non-empty-`sourceEvidence` refusal
      // rather than letting a caller see a raw 23514/23502. Read ONCE into
      // locals for the same TOCTOU reason `writeBrainDoc`'s C-40 comment
      // gives: `input` is a plain object type, so a getter could disagree
      // between this check and the `.values()` spread below.
      const inputClass = input.inputClass;
      if (
        typeof inputClass !== "string" ||
        !(PUBLIC_INPUT_CLASSES as readonly string[]).includes(inputClass)
      ) {
        throw new OnboardingInputLimitError(
          "input_class is not a public onboarding input class"
        );
      }
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
        const authority = await assertProfileLifecycleTransactionAccess(
          conn,
          scope.userId as string,
          ids.workspaceId,
          ids.profileId
        );
        assertFreshProfileAuthority(authority, scope);
        assertOwner(authority.role, "add a post to this creator's record");
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
      // the shared role gate to every previously ungated capability, which was the
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
      // R-80: THE INCLUDED BUILD IS CLAIMED HERE, IN THIS TRANSACTION, AND THE
      // DATABASE DECIDES THE WINNER.
      //
      // WHY HERE AND NOT AT THE DEBIT. Three reasons, and each one is a
      // behaviour that would change if this moved:
      //   - COMMIT TIME IS THE ONLY HONEST TIE-BREAK. The rule this replaces
      //     ranked attempts on `(created_at, attempt_id)` read from a READ
      //     COMMITTED snapshot, and an attempt that inserted first and
      //     committed second was invisible to the one that committed before
      //     it — so two attempts each saw zero predecessors and each took the
      //     included build. A unique index is evaluated against committed
      //     state: the second writer BLOCKS until the first commits, then
      //     conflicts. There is no interleaving with two winners.
      //   - THE CLAIM RIDES WITH THE SPEND RECORD (R11). The usage row commits
      //     before the debit is attempted, so a claim written at the debit
      //     would not exist for the attempts that never reach one.
      //   - A BILLABLE FAILURE THAT CONSUMES THE ENTITLEMENT NEVER REACHES THE
      //     DEBIT. A policy `refused` is billable and consuming
      //     (`USAGE_OUTCOME_BILLABLE`, `LlmError.consumesIncludedBuild`) and
      //     `inference.ts` throws before step 9 — claiming at the debit would
      //     silently hand that profile's free build to the next attempt.
      //
      // THE CONDITION IS THE SAME PAIR THE OLD RANKING FILTERED ON — billable
      // outcome AND `consumed_included_build` — read from the RETURNED ROW,
      // never from `usage`, so what is claimed is what was actually stored.
      // A truncated reply (`schema_invalid`, non-consuming: our own reply
      // ceiling, not the creator's doing) writes a usage row and claims
      // nothing, which is the property the 2026-08-29 billing gate closed.
      //
      // `onConflictDoNothing` rather than an upsert: the claim is decided
      // ONCE. A second row for the same attempt (a bounded retry writes two
      // usage rows for one attempt) conflicts onto its own claim and stays
      // free, which is exactly what the old `min(created_at)` grouping meant.
      if (USAGE_OUTCOME_BILLABLE[row.outcome] && row.consumedIncludedBuild) {
        await tx
          .insert(firstBillableAttempts)
          .values({
            workspaceId: row.workspaceId,
            profileId: row.profileId,
            purpose: row.purpose,
            attemptId: row.attemptId,
          })
          .onConflictDoNothing({
            target: [firstBillableAttempts.profileId, firstBillableAttempts.purpose],
          });
      }
      return row;
    },

    writeBrainDoc: async (doc, tx, expectedEditableBaseId) => {
      // REQ-G08: a brain write is an ENTITLEMENT, so it is refused while the
      // workspace is paused. WHICH WRITES ARE NOT, AND WHY, IS NO LONGER A
      // SENTENCE HERE: it is `WRITE_PAUSE_POLICY` above, one entry per
      // capability with its warrant, because this sentence named two
      // exemptions and slice 7 added a third (`recordGenerationFeedback`,
      // measured accepted under an open pause) without touching it. The
      // population is now derived from this object's own members in
      // `packages/db/tests/with-workspace.test.ts`, so a new ungated write
      // cannot escape the list by nobody remembering this paragraph.
      assertOwner(scope.role, "write a brain document for this creator");
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
      assertOwner(scope.role, "confirm");
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
      assertOwner(scope.role, "activate");
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
      assertOwnerOrEditor(scope.role, "start a generation for this creator");
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
      assertOwnerOrEditor(scope.role, "advance a generation for this creator");
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
      assertOwnerOrEditor(scope.role, "settle a generation for this creator");
      const attemptId = params.attemptId;
      const outcome = params.outcome;
      // READ ONCE INTO A LOCAL (C-40) and then RESOLVE IT AGAINST THE SCOPE.
      // `params` is a plain object type, so a getter could hand one id to the
      // check and another to the insert — which on THIS field would mean the
      // stored lineage naming a row the check never saw.
      const parentId = params.parentId;
      if (parentId !== undefined) {
        if (!UUID_RE.test(parentId)) throw new GenerationLineageError();
        const [parent] = await tx
          .select({ id: generations.id })
          .from(generations)
          .where(
            and(
              // BOTH SCOPE COLUMNS. The composite FK below refuses a
              // cross-tenant parent anyway; this is what turns that refusal
              // into a NAMED one — a 23503 reaching a creator is the
              // "Something went wrong" every typed refusal here exists to
              // prevent.
              both(generations),
              eq(generations.id, parentId),
              // ...AND STRICTLY EARLIER THAN THIS TRANSACTION (R6's "an
              // earlier same-scope parent"). `generations.created_at` is
              // `now()`, i.e. TRANSACTION START, so a transaction that began
              // before a sibling committed can otherwise insert a row whose
              // stamp PRECEDES the parent it names — lineage that reads
              // backwards on every screen that renders it. Postgres cannot
              // compare two rows in a CHECK, so this is the half application
              // code owns, and `lineage-feedback.test.ts` drives its
              // false branch with a future-stamped parent rather than
              // trusting that a required parameter is a guard.
              lt(generations.createdAt, sql`now()`)
            )
          )
          .limit(1);
        if (!parent) throw new GenerationLineageError();
      }
      const [generation] = await tx
        .insert(generations)
        .values({
          attemptId,
          // Written EXPLICITLY, from the local checked above — not spread, and
          // not defaulted. M5 ("parent_id written as null on revision") is a
          // one-word edit here, and `lineage-feedback.test.ts` asserts
          // the stored value equals the requested one.
          parentId: parentId ?? null,
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

    // ------------------------------------------------------ slice 7, R10
    recordGenerationFeedback: async (params, tx) => {
      // A VIEWER MAY NOT. Feedback is an assertion about a creator's output
      // that slice 9 may build a promotion proposal from — the same class of
      // act as confirming a brain document, whose role gate already
      // refuses a viewer. The owner-or-editor gate rather than `assertOwner`
      // because nothing here decides what the product BELIEVES yet; it lands
      // permanently in an append-only record, which is what that gate's own
      // docblock names.
      assertOwnerOrEditor(scope.role, "record feedback on this creator's output");
      // READ ONCE INTO LOCALS (C-40): a getter could pass validation with one
      // value and store another — on `reaction` that would defeat the closed
      // set entirely.
      const generationId = params.generationId;
      const reaction = params.reaction;
      const rawNote = params.note;
      // THE CLOSED SET, CHECKED AT RUNTIME AND NOT ONLY IN THE TYPE
      // (CLAUDE.md 2026-08-21: proving a field cannot be TYPED is not proving
      // it cannot be CAST). Without this a cast reaches the pgEnum and the
      // creator sees a driver error.
      if (
        typeof reaction !== "string" ||
        !(GENERATION_FEEDBACK_REACTIONS as readonly string[]).includes(reaction)
      ) {
        throw new FeedbackReactionError(reaction);
      }
      // THE TARGET IS RESOLVED THROUGH THE SCOPE BEFORE THE INSERT, and this
      // is a defect the author's own adversarial re-read found rather than a
      // precaution. Two halves were live: a malformed id raised
      // `FeedbackReactionError`, whose copy tells the reader the page named a
      // reaction that does not exist (a refusal about the wrong event), and a
      // well-formed id belonging to another profile reached the composite FK
      // and came back as a raw 23503 — which `billing-errors.ts` has no case
      // for and which therefore renders as "Something went wrong".
      //
      // The FK is still what makes a cross-tenant row UNREPRESENTABLE; this
      // read is what makes the refusal SAYABLE. Foreign, nonexistent and
      // malformed all raise the one byte-identical `FeedbackTargetError`.
      if (typeof generationId !== "string" || !UUID_RE.test(generationId)) {
        throw new FeedbackTargetError();
      }
      const [target] = await tx
        .select({ id: generations.id })
        .from(generations)
        .where(and(both(generations), eq(generations.id, generationId)))
        .limit(1);
      if (!target) throw new FeedbackTargetError();
      let note: string | null = null;
      if (rawNote !== undefined) {
        if (typeof rawNote !== "string") {
          throw new FeedbackNoteError("the note was not text");
        }
        // NFC + CRLF->LF, the one normalisation this package stores text
        // under (`normaliseContent`, A-8), so two notes a person cannot tell
        // apart are one note here too.
        const normalised = normaliseContent(rawNote);
        if (normalised.trim().length === 0) {
          // A BLANK NOTE IS NOT A NOTE. Refusing rather than silently storing
          // NULL, because a creator who typed only whitespace and pressed
          // send has not been told their words were dropped — and the CHECK
          // would refuse the row anyway.
          throw new FeedbackNoteError("the note was blank");
        }
        const points = [...normalised].length;
        if (points > FEEDBACK_NOTE_MAX) {
          throw new FeedbackNoteError(
            `the note is ${points} characters and the limit is ${FEEDBACK_NOTE_MAX}`
          );
        }
        note = normalised;
      }
      const [row] = await tx
        .insert(generationFeedback)
        .values({
          generationId,
          reaction,
          note,
          // LAST, from the scope — never from the caller's object.
          ...ids,
        })
        // INSERT-OR-REFUSE, not insert-or-swallow. The unique index on
        // (generation_id, reaction) is what decides; a `.returning()` that
        // yields nothing means the pair already exists, and
        // `FeedbackDuplicateError` says so rather than reporting success on a
        // note that was not kept. The alternative — reading first and then
        // inserting — is the read-then-write with no constraint behind it
        // that `credit_ledger`'s partial uniques exist to refuse.
        .onConflictDoNothing()
        .returning();
      if (!row) throw new FeedbackDuplicateError();
      return row;
    },

    // ------------------------------------------------------ slice 9a, R5-R9
    recordResult: async (params, entitlement, tx) => {
      // A VIEWER MAY NOT. The owner-or-editor gate rather than `assertOwner`, the
      // `recordGenerationFeedback` line: nothing here decides what the product
      // BELIEVES — 9b's proposal does, and that is where the stronger gate
      // belongs — but it lands permanently in an append-only record that a
      // promotion proposal will later be built from.
      assertOwnerOrEditor(scope.role, "log a result on this creator's record");
      assertFullPerformanceLearning(entitlement);
      // READ ONCE INTO LOCALS (C-40): every field below is validated and then
      // used, and a getter could disagree between the two.
      const rawGenerationId = params.generationId;
      const rawPlatform = params.platform;
      const audienceClass = params.audienceClass;
      const observedFrom = params.observedFrom;
      const observedTo = params.observedTo;
      const rawReach = params.reach;
      const rawConversion = params.conversion;
      const rawConfounders = params.confounders;
      const rawNote = params.note;

      // THE CLOSED SET, CHECKED AT RUNTIME AND NOT ONLY IN THE TYPE (CLAUDE.md
      // 2026-08-21). Without this a cast reaches the pgEnum and the creator
      // sees a raw 22P02 rendered as "Something went wrong".
      if (typeof audienceClass !== "string") {
        throw new ResultInputError("the audience class was not text");
      }
      if (!(RESULT_AUDIENCE_CLASSES as readonly string[]).includes(audienceClass)) {
        throw new ResultInputError(
          `it named an audience class this product does not have (${echoReceived(audienceClass)}). It is organic or paid, and the two are never pooled`
        );
      }
      const platform = requireBoundedText(
        rawPlatform,
        "platform",
        RESULT_PLATFORM_MAX
      );
      // A WINDOW, not two loose timestamps. `results_window_forward` refuses a
      // zero-width or reversed window at the database; this refuses it by name
      // — and it also refuses an INVALID Date, which the database cannot see
      // because drizzle would send it as `Invalid Date` and fail at the driver.
      // AN `Invalid Date` IS THE CASE WORTH SPELLING OUT (2026-09-04, builder
      // C's report). `new Date("last tuesday")` is a real Date object whose
      // time is NaN, and `observed_to > observed_from` DOES NOT CATCH IT: every
      // comparison against NaN is false, so Postgres refuses the row with a
      // constraint violation — a 23514 with no case in `billing-errors.ts`,
      // rendered as "Something went wrong" — instead of this sentence. The two
      // halves are separated so the refusal names which one happened.
      for (const [what, when] of [
        ["start", observedFrom],
        ["end", observedTo],
      ] as const) {
        if (!(when instanceof Date)) {
          throw new ResultInputError(
            `the ${what} of the observation window is not a date`
          );
        }
        if (Number.isNaN(when.getTime())) {
          throw new ResultInputError(
            `the ${what} of the observation window is not a date this product can read`
          );
        }
      }
      if (observedTo.getTime() <= observedFrom.getTime()) {
        throw new ResultInputError(
          "its observation window ends before it starts. A ratio with no period is an undefined denominator"
        );
      }
      const reach = parseLever(rawReach, "reach");
      const conversion = parseLever(rawConversion, "conversion");
      const confounders = parseConfounders(rawConfounders);
      let note: string | null = null;
      if (rawNote !== undefined) {
        if (typeof rawNote !== "string") {
          throw new ResultInputError("the note was not text");
        }
        // NFC + CRLF->LF, the one normalisation this package stores text under
        // (`normaliseContent`, A-8).
        const normalised = normaliseContent(rawNote);
        if (normalised.trim().length === 0) {
          // A BLANK NOTE IS NOT A NOTE — `recordGenerationFeedback`'s rule, and
          // `results_note_says_something` would refuse the row anyway.
          throw new ResultInputError(
            "the note was blank. It is optional — leave it empty, or write something in it"
          );
        }
        const points = [...normalised].length;
        if (points > RESULT_NOTE_MAX) {
          throw new ResultInputError(
            `the note is ${points} characters and the limit is ${RESULT_NOTE_MAX}`
          );
        }
        note = normalised;
      }

      // THE DECLARED METRIC (R8/REQ-B03), READ RATHER THAN TAKEN. Through the
      // profile's OWN accessor inside the caller's transaction, so there is no
      // second query and no second answer to "which strategy version is live".
      // `brain_docs_one_active_uq` is a partial unique index, so at most one
      // row can match — the `find` is a projection of a database property, not
      // an arbitrary pick.
      // THE NARROW READ (billing CHANGE 1): four scalars per version, never
      // the `content` jsonb. See `strategyMetricVersions`.
      const strategyVersions = await scope.accessors.strategyMetricVersions(tx);
      const activeStrategy = strategyVersions.find(
        (doc) => doc.status === "active"
      );
      if (!activeStrategy) {
        throw new ResultInputError(
          "you have not activated a Strategy document yet, so there is no declared north-star metric to measure this against. Nothing here guesses one for you"
        );
      }
      const metric = declaredMetricOf({ metric: activeStrategy.metric });
      if (!metric) {
        throw new ResultInputError(
          "your active Strategy does not declare a north-star metric with a unit and a direction yet. Declare those first — a number with no unit has no meaning, and 'better' cannot be inferred without a direction"
        );
      }

      // THE OUTPUT THIS IS ABOUT, and the treatment key derived from it (C4).
      // TWO MECHANISMS, the `recordGenerationFeedback` division: the scoped
      // re-read is what makes the refusal SAYABLE (a foreign id would
      // otherwise reach the composite FK and come back as a raw 23503, which
      // `billing-errors.ts` has no case for), and the FK is what makes the
      // cross-tenant row UNREPRESENTABLE. Foreign, nonexistent and malformed
      // all raise the one byte-identical `ResultTargetError`.
      let generationId: string | null = null;
      let treatmentKey: string | null = null;
      if (rawGenerationId !== undefined) {
        if (typeof rawGenerationId !== "string" || !UUID_RE.test(rawGenerationId)) {
          throw new ResultTargetError();
        }
        const [generation] = await tx
          .select()
          .from(generations)
          .where(and(both(generations), eq(generations.id, rawGenerationId)))
          .limit(1);
        if (!generation) throw new ResultTargetError();
        generationId = generation.id;
        treatmentKey = treatmentKeyFor({ generation, metricKey: metric.key });
      }

      // R6, AS A DERIVATION RATHER THAN A PARAMETER. Numbers a creator typed
      // are `quantified_self_reported`; no numbers is `unquantified`. There is
      // no branch here that can reach `connector_verified`, and no parameter a
      // caller could cast to get one — the three connector columns are written
      // NULL below and the database's equality does the rest.
      const evidenceState: ResultEvidenceState =
        reach || conversion ? "quantified_self_reported" : "unquantified";

      const [row] = await tx
        .insert(results)
        .values({
          // FIELD BY FIELD, NEVER A SPREAD OF `params` — see the params type.
          generationId,
          platform,
          // NARROWED ABOVE, and stored as the narrowed value — the parameter's
          // type is `string`, the column's is the closed enum, and this line is
          // where the two meet after the check rather than before it.
          audienceClass: audienceClass as ResultAudienceClass,
          metricKey: metric.key,
          metricDeclaredByDocId: activeStrategy.id,
          observedFrom,
          observedTo,
          treatmentKey,
          evidenceState,
          reachValue: reach?.value ?? null,
          reachDenominator: reach?.denominator ?? null,
          conversionValue: conversion?.value ?? null,
          conversionDenominator: conversion?.denominator ?? null,
          confounders,
          note,
          // v1 HAS NO CONNECTOR, written explicitly rather than omitted: an
          // omitted column is a default somebody could change, and these three
          // are what the `connector_verified` equality keys on.
          connectorSource: null,
          connectorEventId: null,
          connectorObservedAt: null,
          // LAST, from the scope — never from the caller's object.
          ...ids,
        })
        // INSERT-OR-REFUSE, not insert-or-swallow — `recordGenerationFeedback`'s
        // rule, and it matters more here: `results_generation_metric_window_uq`
        // is what stops a cohort minimum being reached by pressing submit three
        // times, and a swallowed duplicate would report success on numbers that
        // were not kept.
        .onConflictDoNothing()
        .returning();
      if (!row) throw new ResultDuplicateError();
      return row;
    },
    refreshPromotionProposals: async (entitlement, tx) => {
      assertOwner(scope.role, "refresh promotion proposals");
      assertFullPerformanceLearning(entitlement);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${scope.workspaceId}:${scope.profileId}`}, 0))`
      );
      if (await hasOpenPause(tx, scope.workspaceId)) throw new WorkspacePausedError();
      return refreshPromotionProposalsInScope(scope, entitlement, tx);
    },
    appendPromotionSummaryForProposal: async (proposalId, tx) => {
      assertOwner(scope.role, "write promotion evidence");
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${scope.workspaceId}:${scope.profileId}`}, 0))`
      );
      if (await hasOpenPause(tx, scope.workspaceId)) throw new WorkspacePausedError();
      return appendPromotionSummaryForProposalInScope(scope, proposalId, tx);
    },
    decidePromotionProposal: async (params, entitlement, tx) => {
      assertOwner(scope.role, "decide a promotion proposal");
      assertFullPerformanceLearning(entitlement);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${scope.workspaceId}:${scope.profileId}`}, 0))`
      );
      if (await hasOpenPause(tx, scope.workspaceId)) throw new WorkspacePausedError();
      return decidePromotionProposalInScope(scope, caps, params, entitlement, tx);
    },
  };
  const txArgumentByCapability = {
    appendOnboardingInput: 1,
    recordModelUsage: 1,
    writeBrainDoc: 1,
    confirmBrainDocFields: 1,
    activateBrainDoc: 1,
    activateBrainDocCoherent: 1,
    claimGenerationAttempt: 1,
    advanceGenerationAttempt: 1,
    settleGeneration: 1,
    readGenerationForAttempt: 1,
    readGenerationAttempt: 1,
    recordGenerationFeedback: 1,
    recordResult: 2,
    refreshPromotionProposals: 1,
    appendPromotionSummaryForProposal: 1,
    decidePromotionProposal: 2,
  } as const satisfies Record<keyof ProfileWriteCapabilities, number>;
  const rolesByCapability = {
    appendOnboardingInput: ["owner"],
    recordModelUsage: ["owner", "editor", "viewer"],
    writeBrainDoc: ["owner"],
    confirmBrainDocFields: ["owner"],
    activateBrainDoc: ["owner"],
    activateBrainDocCoherent: ["owner"],
    claimGenerationAttempt: ["owner", "editor"],
    advanceGenerationAttempt: ["owner", "editor"],
    settleGeneration: ["owner", "editor"],
    readGenerationForAttempt: ["owner", "editor", "viewer"],
    readGenerationAttempt: ["owner", "editor", "viewer"],
    recordGenerationFeedback: ["owner", "editor"],
    recordResult: ["owner", "editor"],
    refreshPromotionProposals: ["owner"],
    appendPromotionSummaryForProposal: ["owner"],
    decidePromotionProposal: ["owner"],
  } as const satisfies Record<
    keyof ProfileWriteCapabilities,
    readonly MembershipRole[]
  >;

  return transactionallyLifecycleGuardedMethods(
    caps,
    (property, args) => {
      // This capability opens its own transaction when one is not supplied and
      // performs the lifecycle fence inside that transaction above.
      if (property === "appendOnboardingInput") return undefined;
      if (typeof property !== "string" || !(property in txArgumentByCapability)) {
        throw new ScopeForgeryError("A profile write capability");
      }
      const tx = args[
        txArgumentByCapability[property as keyof ProfileWriteCapabilities]
      ];
      if (!tx || typeof tx !== "object") {
        throw new ScopeForgeryError("A profile write transaction");
      }
      return tx as TxLike;
    },
    async (tx, property) => {
      if (typeof property !== "string" || !(property in rolesByCapability)) {
        throw new ScopeForgeryError("A profile write capability");
      }
      const authority = await assertProfileLifecycleTransactionAccess(
        tx,
        scope.userId as string,
        ids.workspaceId,
        ids.profileId
      );
      assertFreshProfileAuthority(authority, scope);
      const allowed = rolesByCapability[property as keyof ProfileWriteCapabilities];
      if (!(allowed as readonly MembershipRole[]).includes(authority.role)) {
        throw new ProfileRoleError(
          property,
          authority.role,
          allowed.length === 1 && allowed[0] === "owner" ? "owner" : "editor"
        );
      }
    }
  );
}

/**
 * ONE LEVER'S value/denominator pair, validated as a pair (slice 9a, R9).
 *
 * DECIMAL STRINGS, BOUNDED TO THE COLUMN'S OWN `numeric(24, 8)`: an
 * out-of-range figure would otherwise surface as a raw 22003 from the driver,
 * which is the "Something went wrong" every typed refusal here exists to
 * prevent. The value MAY be negative (a declared metric can legitimately be a
 * net change) and the denominator may NOT be zero or negative — that is
 * `results_denominators_positive`'s rule, refused here by name: "a per-1k over
 * a zero denominator is not a small number, it is undefined".
 *
 * `DECIMAL_RE` IS ALSO WHAT REFUSES `NaN`, and until 2026-09-04 it was the ONLY
 * thing that did — on a table whose contract says the database enforces this.
 * `numeric` has a NaN, `'NaN'::numeric > 0` is TRUE and `NaN IS NULL` is FALSE,
 * so a NaN denominator satisfied every constraint on the row and reached the
 * column. Migration 0031's `results_lever_figures_are_numbers` is the missing
 * layer; this regex is now the one that makes the refusal SAYABLE rather than
 * the one that makes the row unstorable — the same division
 * `FeedbackTargetError` records for a foreign id. Both halves are driven:
 * `results-schema-write.test.ts` for the named refusal here,
 * `results-schema.test.ts` for the database's.
 */
function parseLever(
  lever: { value: string; denominator: string } | undefined,
  which: string
): { value: string; denominator: string } | null {
  if (lever === undefined) return null;
  if (typeof lever !== "object" || lever === null) {
    throw new ResultInputError(`the ${which} figures were not a value and a denominator`);
  }
  const value = decimalOrThrow(lever.value, `${which} value`, true);
  const denominator = decimalOrThrow(lever.denominator, `${which} denominator`, false);
  if (!(Number(denominator) > 0)) {
    throw new ResultInputError(
      `the ${which} denominator is not greater than zero. A per-1k over a zero denominator is not a small number, it is undefined`
    );
  }
  return { value, denominator };
}

/** `numeric(24, 8)`: up to 16 integer digits and 8 decimal places. */
const DECIMAL_RE = /^-?\d{1,16}(\.\d{1,8})?$/;

function decimalOrThrow(value: unknown, what: string, signed: boolean): string {
  if (typeof value !== "string") {
    throw new ResultInputError(`the ${what} was not a number`);
  }
  const trimmed = value.trim();
  if (!DECIMAL_RE.test(trimmed)) {
    throw new ResultInputError(
      `the ${what} is not a plain figure this product can store (up to 16 digits and 8 decimal places${signed ? "" : ", and not negative"})`
    );
  }
  if (!signed && trimmed.startsWith("-")) {
    throw new ResultInputError(`the ${what} cannot be negative`);
  }
  return trimmed;
}

/**
 * The confounder flags (R7) — CLOSED, DEDUPLICATED and in the vocabulary's own
 * order.
 *
 * DEDUPLICATED because the same confounder named twice is one fact and the
 * screen counts what is stored; ORDERED by `RESULT_CONFOUNDER_CODES` rather
 * than by the caller's array so that two identical sets of flags are the same
 * stored bytes, which is what lets a reader compare two results' confounders
 * without sorting first. The database refuses an unknown code
 * (`results_confounders_closed_set`); this refuses it by NAME.
 */
function parseConfounders(
  codes: readonly string[] | undefined
): ResultConfounderCode[] {
  if (codes === undefined) return [];
  if (!Array.isArray(codes)) {
    throw new ResultInputError("the confounders were not a list");
  }
  for (const code of codes) {
    if (typeof code !== "string") {
      throw new ResultInputError("it named a confounder that is not text");
    }
    if (!(RESULT_CONFOUNDER_CODES as readonly string[]).includes(code)) {
      throw new ResultInputError(
        `it named a confounder this product does not have (${echoReceived(code)}). They are a fixed list the page renders — reload the page and choose from it`
      );
    }
  }
  const chosen = new Set<string>(codes);
  return RESULT_CONFOUNDER_CODES.filter((code) => chosen.has(code));
}

/**
 * A caller-supplied value, made safe to put in a refusal a creator will read.
 *
 * NAMING WHAT ARRIVED IS THE POINT: "that is not a confounder we have" is
 * unactionable when a form posted six checkboxes and one of them is stale.
 *
 * BOUNDED AND FLATTENED, because the value came off the wire: an unbounded
 * echo turns a paste-bomb into a paste-bomb in an error message (and into a
 * log line), and newlines in a refusal break the one-sentence shape every
 * other error in this file keeps. Whitespace is collapsed, the text is
 * NFC-normalised like everything else this package stores or shows, and it is
 * clipped to `REFUSAL_ECHO_MAX` code points.
 *
 * IT IS NOT AN ESCAPE HATCH FOR PROSE. It is only ever reached on a value that
 * FAILED a closed-set check, so nothing it echoes is ever stored, counted or
 * derived from — the C-42 channel stays shut.
 */
const REFUSAL_ECHO_MAX = 40;

function echoReceived(value: string): string {
  const flat = normaliseContent(value).replace(/\s+/g, " ").trim();
  const points = [...flat];
  return points.length > REFUSAL_ECHO_MAX
    ? `"${points.slice(0, REFUSAL_ECHO_MAX).join("")}…"`
    : `"${flat}"`;
}

/** NFC-normalised, non-blank, bounded — the shape every short label here takes. */
function requireBoundedText(value: unknown, what: string, max: number): string {
  if (typeof value !== "string") {
    throw new ResultInputError(`the ${what} was not text`);
  }
  const normalised = normaliseContent(value).trim();
  if (normalised.length === 0) {
    throw new ResultInputError(`the ${what} is blank`);
  }
  const points = [...normalised].length;
  if (points > max) {
    throw new ResultInputError(
      `the ${what} is ${points} characters and the limit is ${max}`
    );
  }
  return normalised;
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
  if (user.lifecycleState !== "active") {
    throw new WorkspaceAccessError("withWorkspace: identity is tombstoned");
  }

  const userMembershipRows = await db
    .select({
      membership: memberships,
      workspaceLifecycleVersion: workspaces.lifecycleVersion,
    })
    .from(memberships)
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.id, memberships.workspaceId),
        eq(workspaces.lifecycleState, "active")
      )
    )
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.lifecycleState, "active")
      )
    );
  const userMemberships = userMembershipRows.map((row) => row.membership);

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
    user.id as VerifiedUserId,
    membership.version,
    userMembershipRows.find((row) => row.membership.id === membership.id)!
      .workspaceLifecycleVersion
  );
}
