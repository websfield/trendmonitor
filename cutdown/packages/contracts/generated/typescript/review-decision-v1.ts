/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source of truth: packages/contracts/schemas/. Regenerate with:
 *   pnpm -C cutdown exec cutdown build:contracts
 *
 * This tree is COMMITTED, never gitignored (tech-spec §3): a schema change, its
 * changelog entry, and the regenerated types land in the same commit, and
 * `build:contracts --check` fails when regeneration would dirty it.
 */

/**
 * ULID. Because ULIDs are creation-time ordered, this field is also the tiebreaker that makes latest-decision selection a total order when two decisions share a `decidedAt`.
 */
export type Ulid = string;
/**
 * Excluded from the content hash.
 */
export type Creator = SkillCreator | HumanCreator;
/**
 * The draft RENDER (one execution) the human actually watched. Distinct from the manifest: a manifest can be executed more than once, and the reviewer looked at one of those files.
 */
export type Ulid1 = string;
/**
 * The PlatformEDL revision the reviewed render realised. Recorded so a later revision of the EDL (REQ-113 creates a new one, linked to its parent) cannot inherit this approval.
 */
export type Ulid2 = string;
/**
 * The RenderManifest revision the reviewed render executed. This is the id the final render's `approvedDraftManifestId` must equal, and `assertFinalMatchesApprovedDraft()` compares the two manifests field by field.
 */
export type Ulid3 = string;
/**
 * A tagged union (tech-spec §3: `oneOf` plus a `const` discriminator). Approval may carry optional notes; rejection REQUIRES a reason, because the rejection path leads to `revise` and a revision needs something to interpret.
 */
export type ReviewOutcome = ReviewApproved | ReviewRejected;

/**
 * One named human's immutable decision about one reviewed DRAFT render (decisions.md D-9, PRD REQ-152, tech-spec §15 step 8). Three properties are structural rather than procedural. (1) The subject is the reviewed draft render PLUS the exact EDL and RenderManifest revisions it realised — an approval of one plan never authorises another. (2) There is NO package field, and `additionalProperties: false` makes that unforgeable: a decision cannot reference a package, because at the moment of approval no package exists and pointing at a future one would invert the lineage the exit criteria are computed over. (3) The decision itself is a tagged union, so a rejection cannot exist without a reason — an unexplained rejection sends someone back to `revise` with nothing to act on. Decisions are never mutated or superseded in place: a second thought is a second record, and `selectLatestDecision()` in this package is the single deterministic rule for which one is in force.
 */
export interface ReviewDecision {
  reviewDecisionId: Ulid;
  envelope: Envelope;
  jobId: string;
  subjectDraftRenderId: Ulid1;
  subjectEdlId: Ulid2;
  subjectRenderManifestId: Ulid3;
  subjectPlanHash: ContentHash;
  /**
   * The named human who decided, from `cutdown approve --by <name>`. Not a role, not a system identity, and never defaulted — an approval nobody's name is on is the thing REQ-021-style human-in-the-loop rules exist to prevent.
   */
  decidedBy: string;
  /**
   * RFC 3339 UTC instant the human decided. Primary sort key for latest-decision selection.
   */
  decidedAt: string;
  decision: ReviewOutcome;
}
/**
 * `createdBy` is a HumanCreator, never a SkillCreator. D-9 makes approval a human act recorded with a name, and the envelope's tagged union is what stops the `approve` skill attributing a decision to itself.
 */
export interface Envelope {
  /**
   * Semantic version of the schema this instance was written against.
   */
  schemaVersion: string;
  /**
   * RFC 3339 UTC instant. Excluded from the content hash.
   */
  createdAt: string;
  createdBy: Creator;
}
export interface SkillCreator {
  kind: "skill";
  skill: string;
  skillVersion: string;
}
export interface HumanCreator {
  kind: "human";
  /**
   * The named human. `cutdown approve --by <name>` writes this; decisions.md D-9 requires approval to be a human act recorded with a name.
   */
  name: string;
}
/**
 * The reviewed render's plan hash — sha256 over the resolved manifest, clip ranges and caption files. Recorded because it is the identity that survives a re-render of the same plan, which is what a human's acceptance actually attaches to (the same reasoning that moved the QaWaiver scope onto this field). Packaging compares this against the final render's QA report so a plan edited between approval and final render cannot slip through on id equality alone.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
export interface ReviewApproved {
  /**
   * Advances the job `review → final-rendering`. This is the ONLY value that authorises a final render.
   */
  outcome: "approved";
  /**
   * Optional remarks. An approval needs no justification — the approval IS the judgement — so `null` is a legitimate value rather than a missing one, and it is required-but-nullable so the field can never be silently absent.
   */
  notes: string | null;
}
export interface ReviewRejected {
  /**
   * Advances the job to `revise` and NOWHERE else. A rejection never authorises a final render, and it is not a terminal state — the revision path is the point.
   */
  outcome: "rejected";
  /**
   * Why the draft was rejected. Required by the schema, not by convention: this text is what `revise` interprets into structured constraints, so a rejection without it is a dead end.
   */
  reason: string;
  notes: string | null;
}
