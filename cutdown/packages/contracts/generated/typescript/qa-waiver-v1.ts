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
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid = string;
/**
 * Excluded from the content hash.
 */
export type Creator = SkillCreator | HumanCreator;
/**
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid1 = string;

/**
 * A named human's immutable decision to accept specific WARNING-severity QA findings (decisions.md D-35). Three properties make this a control rather than a formality: (1) it names the findings it covers by id, so it cannot be a blanket 'proceed'; (2) it names a human approver, so a waiver is always attributable; (3) it can never cover a blocker — source/timebase faults, corrupt or missing media, rights failures, missing required captions or disclosures, and invalid output are non-waivable, and the gate REJECTS a waiver that names one rather than ignoring it. Rejecting rather than ignoring is deliberate: an ignored waiver leaves the operator believing the finding was accepted.
 */
export interface QaWaiver {
  waiverId: Ulid;
  envelope: Envelope;
  jobId: string;
  renderId: Ulid1;
  /**
   * The specific `TechnicalQaFinding.findingId` values accepted. Finding ids are derived from (checkId, object, time range), so they are stable across a re-run of QA over the SAME render and unstable across a different render — which is exactly the scope a waiver should have.
   *
   * @minItems 1
   */
  findingIds: [string, ...string[]];
  /**
   * The named human accepting the findings (decisions.md D-9: acceptance is a human act recorded with a name). Not a role, not a system identity.
   */
  approvedBy: string;
  /**
   * Why the warnings are acceptable for this render. Required — an unexplained waiver is indistinguishable from a rubber stamp six months later.
   */
  reason: string;
  waivedAt: string;
  planHash: ContentHash;
}
/**
 * Metadata every generated object instance carries (tech-spec §3, PRD §5.1). IMPORTANT: `createdAt` and `createdBy` are envelope metadata EXCLUDED from the content hash that keys caching and identity — otherwise two identical re-runs would hash differently and the REQ-005 cache would never hit. `schemaVersion` IS inside the hash, because it is semantic. `contentHash` on the enclosing object is computed by `hashContent()` in this package, which is the single implementation of that exclusion rule.
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
 * The render PLAN this waiver accepts — sha256 over the resolved manifest, clip ranges and caption files, excluding absolute paths. This, not `renderId`, is what the gate scopes on: `renderId` is minted fresh by every execution, so scoping on it made a waiver unusable (write a waiver naming the failing render, re-render to apply it, and the new render has a new id). `planHash` is stable across re-renders of the SAME plan and changes the moment any editorial or encode input changes — which is exactly the scope a human acceptance has.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
