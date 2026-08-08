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
 * The closed set of technical QA checks (PRD REQ-100 / REQ-084 / REQ-104, tech-spec §15 step 7). Enumerated as a contract rather than left as free-form strings for one reason: the Phase 4 acceptance criterion is that EVERY promised check has a positive and a negative fixture, and that is only countable against a closed list. A check that exists in code but not here cannot be reported; a check listed here with no implementation fails the coverage test.
 */
export type QaCheckId =
  | "missing_media"
  | "container_corruption"
  | "source_range_validity"
  | "output_dimensions"
  | "output_duration"
  | "codec_profile"
  | "black_frames"
  | "frozen_frames"
  | "duplicate_frames"
  | "crop_failure"
  | "unexpected_silence"
  | "audio_clipping"
  | "loudness_target"
  | "true_peak"
  | "av_sync_drift"
  | "caption_file_present"
  | "caption_overflow"
  | "caption_readability"
  | "caption_timing"
  | "caption_safe_zone"
  | "caption_spelling"
  | "caption_name_flag"
  | "non_speech_cue_review";

/**
 * The technical QA verdict on one Render (PRD REQ-100/084/104/106, tech-spec §15 step 7). Wired as a HARD GATE: no render reaches review or packaging without one, and a missing or malformed report fails closed. Two structural commitments carry the honesty: (1) `checksRun` is a ledger of EVERY check in the closed enum with its status and, for anything not run, a required reason — so 'nothing was found' can never be confused with 'nothing was looked at'; (2) `gateStatus` is COMPUTED from findings and waivers by deterministic code, never authored — a report claiming `pass` beside an unwaived blocker is a contradiction the resolver rejects.
 */
export interface TechnicalQaReport {
  qaReportId: Ulid;
  envelope: Envelope;
  jobId: string;
  renderId: Ulid;
  renderManifestId: Ulid;
  tier: "draft" | "final";
  /**
   * The `technical-qa-v1.yaml` ruleset version these thresholds came from (tech-spec §12.1). Thresholds are DATA: changing a number changes behaviour with no code change, and this field is what makes a past verdict re-interpretable against the numbers that actually produced it.
   */
  rulesetVersion: string;
  /**
   * D-35. `pass` = no findings above info. `pass_with_waivers` = every warning is covered by a valid waiver and there are no blockers. `fail` = at least one blocker, or an uncovered warning. Blockers are NON-WAIVABLE, so no waiver can move a report out of `fail`.
   */
  gateStatus: "pass" | "pass_with_waivers" | "fail";
  /**
   * One entry per check in the closed enum — including the ones that did not run. The Phase 2 lesson this encodes: a sub-stage that omitted a whole modality without recording it made an honest pipeline dishonest one layer up.
   *
   * @minItems 1
   */
  checksRun: [QaCheckRecord, ...QaCheckRecord[]];
  /**
   * Every problem found, most severe first. Empty is a legitimate result — and is distinguishable from 'not checked' only because `checksRun` exists.
   */
  findings: TechnicalQaFinding[];
  /**
   * The QaWaiver records consulted when computing `gateStatus`. Recorded even when empty, so 'this passed cleanly' and 'this passed because someone waived two warnings' are distinguishable from the report alone.
   */
  waiverIds: Ulid[];
  /**
   * The FINDING ids those waivers cover — deliberately separate from `waiverIds`, which are the waivers' own identities. Without this a reader of the report cannot tell WHICH warnings were accepted, and any attempt to re-derive `gateStatus` from the report alone has to compare a finding id against a waiver id, which is always false. Recorded so a downstream gate can verify `pass_with_waivers` rather than trust it.
   */
  waivedFindingIds: string[];
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
export interface QaCheckRecord {
  checkId: QaCheckId;
  /**
   * `skipped` is a deliberate non-applicability (a silence check on an audio-less render); `errored` is a check that tried and failed. Collapsing them would let a broken detector present as an inapplicable one.
   */
  status: "ran" | "skipped" | "errored";
  /**
   * Null ONLY when status is `ran`. Anything else requires a reason; the resolver enforces it (tech-spec §3 forbids if/then/else).
   */
  reason: string | null;
}
export interface TechnicalQaFinding {
  /**
   * Deterministically derived from (checkId, object, time range) so re-running QA over the SAME render yields the SAME ids — which is what makes a waiver referencing them meaningful.
   */
  findingId: string;
  checkId: QaCheckId;
  /**
   * `blocker` is non-waivable by construction (D-35); `warning` may be waived by a named human; `info` never affects the gate.
   */
  severity: "blocker" | "warning" | "info";
  /**
   * Restated alongside severity so a waiver validator never has to re-derive the policy. The gate asserts `waivable === (severity !== 'blocker')`; a finding that disagrees with itself is rejected rather than resolved in either direction.
   */
  waivable: boolean;
  /**
   * What the finding is about — REQ-106's 'object': a clip id, a caption cue index, `output`, or an audio track.
   */
  object: string;
  /**
   * What is wrong, stated as an observation with the measured value and the threshold it breached.
   */
  message: string;
  /**
   * REQ-106: what to do about it. Required — an unactionable finding trains people to skim the report.
   */
  fix: string;
  /**
   * Where in the OUTPUT timeline (REQ-106 'time range'), or null for a whole-file finding such as wrong dimensions. Exact ticks, never float seconds (tech-spec §3).
   */
  timeRange: QaTimeRange | null;
}
export interface QaTimeRange {
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
}
/**
 * Seconds per tick, as an exact rational: `seconds = ticks * num / den`. Matches FFmpeg's `time_base` convention. Example: 30000/1001 fps video has `{num: 1001, den: 30000}`.
 */
export interface Timebase {
  num: number;
  den: number;
}
/**
 * The render plan these findings were produced against. A QaWaiver names the same value; the gate accepts a waiver only when the two agree, which is what stops an acceptance from carrying across an edited plan.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
