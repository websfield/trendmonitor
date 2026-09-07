// THE TWO APP-REACHABLE RESULT OPERATIONS (slice 9a, R5-R9).
//
// A MODULE RATHER THAN METHODS ON `respinDb` DIRECTLY, the `feedback-ops.ts`
// reason verbatim: both compose `ProfileScope.mint` with something else, and
// both need a `db` handle a test can supply. Written inline in
// `app-server.ts` they would be reachable only through `getServerDb()`, so
// every assertion about them would have to run in a Docker suite.
//
// WHAT THIS FILE MAY NEVER GROW, stated here because this is where the
// temptation arrives and because it is a NARROWER rule than its sibling's: a
// comparison, a cohort, a median, a per-1k, an effect, a minimum-n. Capture
// and construction are different acts — storing "this post got 4,000 views in
// this window" is a fact; deriving "this treatment beats your baseline" is a
// comparison, and contract C5 makes `@respin/brain`'s `buildLeverComparisons`
// the ONE builder of one, shared by 9a's screen and 9b's proposal
// construction. A second comparison site is a second answer to the question
// the whole slice rests on, and the reason it must be one function is that the
// baseline's two exclusions (the cohort's ids AND every row carrying the
// treatment key) are exactly what a second implementation gets half right.
import type { DbLike } from "./db-like";
import {
  ProfileScope,
  writeCapabilities,
  type LedgerPage,
  type RecordResultParams,
  type PerformanceLearningEntitlement,
  type WorkspaceScope,
} from "./with-workspace";
import { declaredMetricOf, type DeclaredMetric, type ResultRow } from "./results-schema";
import type { Generation } from "./generation-schema";

/**
 * Log one result against this creator's own record (REQ-F01/F02).
 *
 * ITS OWN TRANSACTION, the `recordFeedback` argument: the capability requires
 * a `tx` and this is the whole unit of work — one row, or nothing. It shares
 * fate with no other write, because logging a result is not part of any
 * settlement and must not be able to fail one.
 *
 * VALIDATION IS THE CAPABILITY'S, not this function's: the closed
 * vocabularies, the lever pairs, the window, the note's blank/length rules and
 * the R8 declared-metric refusal all live in `recordResult`, which is also
 * where the five server-derived columns are built. A second validation layer
 * here would be a second opinion about what a storable observation is.
 */
export async function recordResult(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  params: RecordResultParams,
  entitlement: PerformanceLearningEntitlement
): Promise<ResultRow> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction((tx) => caps.recordResult(params, entitlement, tx));
}

/**
 * The creator's own logged results, RAW.
 *
 * IT RETURNS THE STORED ROWS AND NOTHING ELSE — no count, no cohort, no
 * median, no "your best post". That is contract C5's division rather than a
 * simplification: the comparison takes an already-profile-scoped array, so
 * this is where the tenancy happens and the arithmetic does not.
 *
 * NO ROLE GATE — a viewer may read, like every other profile read in this
 * package (`readVoiceBrain`'s precedent). Writing is gated; reading is not.
 */
export async function listResults(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  page?: LedgerPage
): Promise<ResultRow[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return profileScope.accessors.results(page);
}

/**
 * THE PROFILE'S DECLARED NORTH-STAR METRIC, or `null` if it has not declared a
 * usable one (R8, C3).
 *
 * ONE READER, SHARED WITH THE WRITER. `recordResult` resolves the same fact the
 * same way (its active strategy version, through `declaredMetricOf`), so the
 * screen that decides whether to render a log form and the capability that
 * decides whether to store a row cannot disagree about whether a metric exists
 * — which is the failure a screen offering a form the writer then refuses
 * produces.
 *
 * `null` RATHER THAN A THROW, because "you have not declared one yet" is a
 * legitimate state of a new creator and a screen renders a named absence for
 * it. A THROW is what the WRITE path does with the same answer, and the
 * asymmetry is deliberate: an absence is a page state and a refused write.
 *
 * NO ROLE GATE — a viewer may read.
 */
export async function declaredMetricForProfile(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<DeclaredMetric | null> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  // THE NARROW READ (billing CHANGE 1). `brainDocsByKind` is a bare `.select()`
  // with no limit — up to 200 whole brain documents, each `content` bounded
  // only by `BRAIN_DOCUMENT_TEXT_MAX` — in the same render as the comparison.
  // Four scalars per version cross instead; see `strategyMetricVersions`.
  const versions = await profileScope.accessors.strategyMetricVersions();
  const active = versions.find((doc) => doc.status === "active");
  if (!active) return null;
  return declaredMetricOf({ metric: active.metric });
}

/**
 * The creator's own generations, for the result log's output picker (R5).
 *
 * WHOLE ROWS, SCOPED. What the picker shows is the screen's decision — the id,
 * the mode and the date are enough to recognise a draft, and the output text is
 * deliberately not part of picking one. This function's job is that every row
 * it returns is this profile's, which the accessor's two-column predicate is.
 */
export async function generationsForResultLog(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  page?: LedgerPage
): Promise<Generation[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return profileScope.accessors.generationsNewest(page);
}
