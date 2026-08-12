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
 * MEASURED integrated loudness and true peak (REQ-085), or an explicit statement that they could not be measured and why. A tagged union so 'this render has no audio' can never be read as 'this render measured 0 LUFS'.
 */
export type LoudnessReport = LoudnessMeasured | LoudnessUnavailable;

/**
 * The RESULT of executing one RenderManifest (PRD REQ-080/085/087, §5 object table) — what the manifest planned, this records was actually produced. The split matters: the manifest carries loudness/true-peak TARGETS, this carries the MEASURED values from the encoded file, and conflating them is how an unmeasured render comes to look compliant. `releaseState` (REQ-105) travels on the render so a `draft` can never be mistaken for an approved final. `determinismTier` is a `const 1` because tech-spec §12 permits exactly one determinism claim at Phase 0 (byte-identical, pinned local environment, D-33); tiers 2-3 belong to the Remotion path, which does not exist.
 */
export interface Render {
  renderId: Ulid;
  envelope: Envelope;
  jobId: string;
  edlId: Ulid;
  renderManifestId: Ulid1;
  /**
   * D-34. Exit criterion 2 ('zero invalid source ranges in final renders') binds to `final`; `package` (Phase 5) bundles `final` only.
   */
  tier: "draft" | "final";
  /**
   * REQ-105. Set to `editorially_approved` only by the Phase 5 approval flow, never by the renderer.
   */
  releaseState: "draft" | "editorially_approved";
  /**
   * Job-relative path to the encoded file, e.g. `renders/draft/<manifestId>/output.mp4`. Job-relative rather than absolute so an artefact stays valid when the job directory moves. The v2 pattern rejects absolute, drive-letter, UNC and backslash paths, dot/dot-dot segments and empty segments in BOTH validators; it deliberately does NOT cover Windows reserved device names or post-symlink containment — those remain the job of the code guard (assertJobRelativePath/resolveArtefactPath in @cutdown/contracts) at every join site, enforced by the artefact-path-discipline lint.
   */
  outputPath: string;
  contentHash: ContentHash;
  duration: MediaTime;
  dimensions: RenderDimensions;
  loudness: LoudnessReport;
  captions: RenderedCaptions;
  renderer: RendererIdentity;
  /**
   * tech-spec §12: Phase 0 claims tier 1 only — byte-identical on the pinned local environment (D-33). A `const` so a later renderer cannot quietly assert a stronger claim than the spec allows.
   */
  determinismTier: 1;
  /**
   * D-34: a `draft` render carries a burned-in version identifier so a review copy can never be mistaken for a deliverable; a `final` carries null. The renderer asserts the tier/identifier agreement (JSON Schema cannot express a cross-property rule; tech-spec §3 forbids if/then/else).
   */
  visibleVersionIdentifier: string | null;
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
 * sha256 of the encoded FILE BYTES (not the object). This is the value the tier-1 double-render determinism proof compares.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
/**
 * Measured duration of the produced file, read back from the encoded output rather than summed from the EDL — a sum is the plan, not the result.
 */
export interface MediaTime {
  ticks: number;
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
 * Measured output geometry, read back from the file. QA compares it against the manifest and the platform minResolution.
 */
export interface RenderDimensions {
  width: number;
  height: number;
}
export interface LoudnessMeasured {
  kind: "measured";
  /**
   * EBU R128 integrated loudness of the produced file.
   */
  integratedLufs: number;
  /**
   * True peak in dBTP. The QA ruleset's `maxTruePeakDbtp` (default -1) is checked against THIS value.
   */
  truePeakDbtp: number;
  loudnessRangeLu: number;
}
export interface LoudnessUnavailable {
  kind: "unavailable";
  /**
   * Why no measurement exists — e.g. `source has no audio stream`. Required: an unexplained absence is the failure mode this union exists to prevent.
   */
  reason: string;
}
/**
 * The emitted caption triplet (REQ-083/104), job-relative. A caption FILE is always emitted alongside the burn-in — REQ-104's standing requirement — so these three are required, not optional. In v2 each path carries the same job-relative pattern as outputPath (see its description for what the pattern does and does not cover).
 */
export interface RenderedCaptions {
  assPath: string;
  srtPath: string;
  vttPath: string;
  /**
   * Number of caption cues emitted. Zero is legal (a clip with no speech and no text captions) and is recorded rather than inferred from an empty file.
   */
  cueCount: number;
}
/**
 * Restated from the manifest ON PURPOSE (PRD §10.6): a delivered render travels with its provenance even when separated from its manifest. The resolver asserts the two agree.
 */
export interface RendererIdentity {
  name: "renderer-ffmpeg";
  rendererVersion: string;
  ffmpegVersion: string;
}
