// THE TWO APP-REACHABLE FEEDBACK OPERATIONS (slice 7, R10/R11).
//
// WHY A MODULE RATHER THAN METHODS ON `respinDb` DIRECTLY — the same reason
// `onboarding-ops.ts`, `interview-ops.ts` and `frameworks.ts` give: both
// compose `ProfileScope.mint` with something else, and both need a `db` handle
// a test can supply. Written inline in `app-server.ts` they would be reachable
// only through `getServerDb()`, so every assertion about them would have to run
// in a Docker suite.
//
// WHAT THIS FILE MAY NEVER GROW (R11), stated here because this is where the
// temptation will arrive: a count, a rollup, a "you have said this three times"
// banner, a rule, a proposal. Capture and construction are different acts —
// storing "the creator said this was too cringe" is a fact; deriving "your
// voice profile should ban X" is a proposal, and R-10/R-44 make
// `packages/brain` the SOLE construction site for one. `packages/brain` does
// not exist yet; `tests/feedback-readers.test.ts` is pre-registered against it
// the way `tests/import-boundary.test.ts` was pre-registered against
// `@respin/trends`, and it fails on an aggregate or a proposal constructor
// appearing anywhere else — including here.
import type { DbLike } from "./db-like";
import {
  ProfileScope,
  writeCapabilities,
  type LedgerPage,
  type RecordGenerationFeedbackParams,
  type WorkspaceScope,
} from "./with-workspace";
import type { GenerationFeedbackRow } from "./generation-schema";

/**
 * Record one structured reaction to one of this creator's outputs (REQ-C05).
 *
 * ITS OWN TRANSACTION, because the capability requires a `tx` and this is the
 * whole unit of work: one row, or nothing. It shares fate with no other write
 * — feedback is not part of a generation's settlement and must not be able to
 * fail one, which is what an optional `tx` on the capability would have made
 * possible to get wrong silently.
 */
export async function recordFeedback(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  params: RecordGenerationFeedbackParams
): Promise<GenerationFeedbackRow> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction((tx) => caps.recordGenerationFeedback(params, tx));
}

/**
 * The creator's own feedback events, RAW (R11).
 *
 * IT RETURNS THE STORED ROWS AND NOTHING ELSE — no count, no grouping, no
 * "most common reaction", no derived label. That is the requirement, not a
 * simplification: this slice must be structurally unable to derive from
 * feedback, and a function that returned a summary would be the first
 * derivation, in the module whose header says it may never grow one.
 * `packages/db/tests/lineage-feedback.test.ts` asserts the returned
 * objects are the stored rows column for column.
 *
 * NO ROLE GATE — a viewer may read, like every other profile read in this
 * package (`readVoiceBrain`'s precedent). Writing is gated; reading is not.
 */
export async function listFeedback(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  page?: LedgerPage
): Promise<GenerationFeedbackRow[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return profileScope.accessors.generationFeedback(page);
}
