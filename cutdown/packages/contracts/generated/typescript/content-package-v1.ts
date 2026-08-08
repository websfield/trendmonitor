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
 * REQ-105. Phase 0 emits `editorially_approved` or `rights_approved` only; the skill refuses to write `publish_ready` or `published`, which it cannot substantiate, and `draft` is not a state a completed package can hold.
 */
export type PackageReleaseState = "draft" | "editorially_approved" | "rights_approved" | "publish_ready" | "published";
/**
 * `real` ONLY when every source asset in the lineage is `real` (D-36). One fixture asset makes the whole package a fixture — the alternative would let a mixed job contribute to Phase 0 exit evidence on the strength of its real half. This single field is what keeps fixture runs out of `PHASE_0_EXIT_EARNED`.
 */
export type SourceClassification = "real" | "fixture";
/**
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid1 = string;
/**
 * WHERE the cover came from — a tagged union, because a cover defaulted to the first frame must never be presentable as a chosen one. REQ-055 is about a validated, deliberate first frame; a silent default would be the opposite of that while looking identical on disk.
 */
export type CoverSource = DeclaredCover | DefaultedCover;
/**
 * Whether an asset is real client footage or a permissioned fixture (decisions.md D-36). `cutdown status --phase0` counts only packages whose every source asset is `real`; this field is the sole mechanism preventing fixture runs from being reported as Phase 0 exit evidence (D-27/D-38).
 */
export type SourceClassification1 = "real" | "fixture";
/**
 * Resolved posture. Derived by the ingest skill from the declared fields plus the ingest-time clock (an asset past `expiryDate` resolves to `expired` regardless of what the sidecar declared) — never copied blindly from the sidecar.
 */
export type RightsState = "cleared" | "unknown" | "restricted" | "expired";
/**
 * Target publishing platforms (PRD REQ-050). Phase 0 resolves capabilities for `tiktok` only, from the D-3 hard-coded fixture; the remaining members exist so a Phase 1 PlatformCapability registry is an additive change, not a schema bump.
 */
export type Platform = "tiktok" | "instagram_reels" | "youtube_shorts" | "linkedin";
/**
 * Talent- and location-release status on a rights record (PRD REQ-003). `not_required` is a positive assertion by the supplier; `unknown` is the fail-closed default when no record exists — the two are never collapsed.
 */
export type ReleaseStatus = "obtained" | "not_required" | "missing" | "unknown";
/**
 * Music rights posture for one asset (PRD REQ-003). Recorded at Phase 0 even though decisions.md D-2 forbids *adding* a music track — source footage can still contain music, and that is a rights fact the package must carry.
 */
export type MusicStatus = "none" | "licensed" | "platform_native" | "unlicensed" | "unknown";
/**
 * The weakest state across `assets`. Always `cleared` in a committed package, by refusal rather than by construction.
 */
export type RightsState1 = "cleared" | "unknown" | "restricted" | "expired";
/**
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid2 = string;

/**
 * The delivered output and every piece of evidence that entitles it to exist (PRD REQ-088 Phase-0 subset, decisions.md D-36, tech-spec §15 step 8). This object is where two of the four Phase 0 exit criteria become measurable — 'at least 20 approved real outputs across 3 accounts' and 'rights records and QA reports accompany every delivered package' — so every field it carries is an evidence field, and `cutdown status --phase0` reads NOTHING else. Three design rules follow. (1) Evidence is recorded by ID, not by copy: the approval, the QA report and the render are named so a reader can go and check, and a package cannot assert a verdict its source artefact does not. (2) The Phase-0 subset is explicit — REQ-088's post copy, hashtags, alt text, first comment, platform derivatives, clean/stem audio and OpenTimelineIO export are product Phase 1 (REQ-054) and are ABSENT from this schema rather than present-and-null, so a Phase 1 addition is a compatible change and nobody can read an empty field as 'none needed'. (3) `additionalProperties: false` throughout: a package that grew a field is a contract change with a changelog entry, never a convention.
 */
export interface ContentPackage {
  contentPackageId: Ulid;
  envelope: Envelope;
  jobId: string;
  /**
   * The STABLE owner-issued account id, copied from the JobBrief (decisions.md D-36). Copied rather than referenced because exit criterion 1 groups outputs by account, and a grouping that had to resolve a reference through a revisable brief could be changed after the fact. The display name is deliberately NOT here: renaming an account must never split its count.
   */
  accountId: string;
  releaseState: PackageReleaseState;
  sourceClassification: SourceClassification;
  approval: PackageApproval;
  lineage: PackageLineage;
  master: PackageMaster;
  captions: PackageCaptions;
  cover: PackageCover;
  rightsManifest: PackageRightsManifest;
  disclosures: PackageDisclosures;
  aiAlterationRecord: AiAlterationRecord;
  qa: PackageQa;
  rangeValidation: PackageRangeValidation;
  /**
   * The exact contract schemas as committed AT PACKAGING TIME (D-36), ordered by `schemaId` so two packages are directly comparable. Packaging time, not per-artefact authoring time: an EDL written last week and packaged today records today's schemas. That is the right input for criterion 3, which asks whether the contracts moved BETWEEN delivered outputs — but it is not a claim about which schema version each individual parent artefact was written against. This is what makes exit criterion 3 — 'the last 10 outputs require no breaking contract change' — computable from the packages themselves: tech-spec §3 fixes a semantic change as a major-version bump, so a `majorVersion` that moved between two packages IS a breaking change, and a `contentHash` that moved under an unchanged major is a compatible or editorial one.
   *
   * @minItems 1
   */
  contractSet: [ContractSetEntry, ...ContractSetEntry[]];
  provenance: PackageProvenance;
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
 * The ReviewDecision that authorised this package's final render. The package references the approval; the approval never references the package (review-decision-v1 has no field for one) — that asymmetry is the lineage direction the exit criteria are computed along.
 */
export interface PackageApproval {
  reviewDecisionId: Ulid;
  /**
   * The named human, copied so a delivered package travels with the name on it (D-9).
   */
  decidedBy: string;
  decidedAt: string;
  subjectDraftRenderId: Ulid;
  subjectRenderManifestId: Ulid1;
}
/**
 * The chain this package descends from, resolvable in both directions without a cycle (each object names its parents; none names its children).
 */
export interface PackageLineage {
  briefId: Ulid;
  creativeBriefId: Ulid;
  storyPlanId: Ulid;
  edlId: Ulid;
  finalRenderId: Ulid;
  finalRenderManifestId: Ulid;
  approvedDraftManifestId: Ulid;
  editorialPlanHash: ContentHash;
  planHash: ContentHash1;
}
/**
 * Computed from the EDL, so any editorial change at all moves it. The draft and final manifests must carry the SAME value — that equality is what 'the delivered cut is the cut that was approved' reduces to, and the package records it so the claim survives without re-reading both manifests.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
/**
 * The FINAL render's plan hash. Differs from the draft's by design (tier, media and encode settings differ); recorded because it is the scope any QA waiver on this render was granted against.
 */
export interface ContentHash1 {
  algorithm: "sha256";
  value: string;
}
/**
 * The final-tier video master (REQ-088 first item). Phase 0 delivers ONE master; REQ-088's 'requested platform derivatives' is Phase 1 and is absent rather than an empty list.
 */
export interface PackageMaster {
  /**
   * Package-relative path, e.g. `master.mp4`. Package-relative rather than job-relative so the directory is deliverable by copying it.
   */
  path: string;
  contentHash: ContentHash2;
  byteSize: number;
  container: string;
  durationMs: number;
  dimensions: PackageDimensions;
  /**
   * Whether captions are burned into the master. REQ-104 requires a caption FILE even when open captions are used, which is why `captions` below is required regardless of this flag.
   */
  burnedInCaptions: boolean;
}
/**
 * sha256 of the FILE BYTES, copied from the Render record. A reader can verify the delivered file is the render that was gated.
 */
export interface ContentHash2 {
  algorithm: "sha256";
  value: string;
}
export interface PackageDimensions {
  width: number;
  height: number;
}
/**
 * The sidecar caption pair (REQ-088, REQ-104). Required even for a burned-in master: REQ-104's rule is that a caption file exists even when open captions are used, and an accessibility affordance that depends on a boolean elsewhere in the object is one refactor away from vanishing.
 */
export interface PackageCaptions {
  srtPath: string;
  vttPath: string;
  /**
   * How many cues the sidecars carry. Zero is legitimate (a cut with no speech) and is distinguishable from a missing file only because the paths above are required.
   */
  cueCount: number;
}
/**
 * Cover image and first-frame preview (REQ-088, REQ-055).
 */
export interface PackageCover {
  coverImagePath: string;
  firstFramePath: string;
  coverSource: CoverSource;
}
export interface DeclaredCover {
  kind: "declared";
  momentId: Ulid;
  /**
   * Where in the OUTPUT timeline the declared cover instant landed.
   */
  atOutputMs: number;
}
export interface DefaultedCover {
  kind: "defaulted_to_first_frame";
  reason: string;
}
/**
 * The rights and originality record for every asset the cut uses (REQ-088, REQ-103, D-36). Packaging refuses `unknown`, `restricted` and `expired` outright (non-waivable, D-35) — so a committed package's `weakestState` is always `cleared`. It is recorded anyway: the exit criterion is 'rights records accompany every delivered package', and a field only present when it would be bad news is a field nobody can audit.
 */
export interface PackageRightsManifest {
  rightsManifestId: Ulid;
  /**
   * One entry per source asset in the cut. `minItems: 1` because a package with no source assets is not a package.
   *
   * @minItems 1
   */
  assets: [PackageRightsEntry, ...PackageRightsEntry[]];
  weakestState: RightsState1;
  /**
   * Whether every asset's record carries an `evidenceUri`. A `cleared` claim with no evidence pointer is recorded as-declared but flagged here — 'a grant without evidence is not a grant' is the rule, and Phase 0's honest position is to surface the gap rather than either silently accept it or block a permissioned fixture corpus that has no signed releases to point at.
   */
  allEvidenced: boolean;
}
export interface PackageRightsEntry {
  assetId: Ulid;
  relativePath: string;
  sourceClassification: SourceClassification1;
  contentHash: ContentHash3;
  rights: RightsRecord;
}
/**
 * Content address for an artefact or media file (PRD REQ-005). sha256 is the only algorithm at Phase 0; the field is present so a future algorithm is an additive change.
 */
export interface ContentHash3 {
  algorithm: "sha256";
  value: string;
}
/**
 * The FULL record, copied. A reference would let the delivered package's rights basis change after delivery; REQ-113 requires a previously approved version to stay reproducible, and that has to include what it was cleared on.
 */
export interface RightsRecord {
  state: RightsState;
  /**
   * Who owns the material. Null only when state is `unknown`.
   */
  owner: string | null;
  /**
   * Who supplied it, when different from the owner.
   */
  supplier: string | null;
  /**
   * Platforms this asset may be published to. An empty array means 'explicitly none' and is NOT the same as null ('not recorded').
   */
  permittedPlatforms: Platform[] | null;
  /**
   * ISO 3166-1 alpha-2 territory codes where use is permitted.
   */
  territories: string[] | null;
  campaignStart: string | null;
  campaignEnd: string | null;
  /**
   * After this date the asset resolves to `expired`. Rights expiry is a NON-WAIVABLE packaging blocker (decisions.md D-35).
   */
  expiryDate: string | null;
  talentReleaseStatus: ReleaseStatus;
  locationReleaseStatus: ReleaseStatus;
  musicStatus: MusicStatus;
  /**
   * Whether the supplier permits editing. Null (not recorded) is treated as 'no' by the packaging gate — Cutdown's entire output is edited material, so an unrecorded editing right cannot be assumed.
   */
  editingPermitted: boolean | null;
  /**
   * Whether paid amplification is permitted. Deliberately separate from `editingPermitted` and from `permittedPlatforms`: a grant to publish organically never implies a grant to run paid media against the same asset.
   */
  paidAmplificationPermitted: boolean | null;
  /**
   * Pointer to the underlying evidence (signed release, licence, contract). A claim of `cleared` with a null evidenceUri is recorded as-declared but is surfaced by the packaging gate as unevidenced.
   */
  evidenceUri: string | null;
  notes: string | null;
}
/**
 * REQ-163 commercial disclosure, record-level. The first three are copied from the EDL (which the deterministic disclosure gate already enforced); the last three are the REQ-163 categories the EDL does not model at Phase 0 and are recorded as explicit `false`-with-no-mechanism rather than omitted — an absent field would read as 'not applicable' when the truth is 'not captured yet'.
 */
export interface PackageDisclosures {
  paidPartnership: boolean;
  aiGeneratedOrAltered: boolean;
  ownedBusinessPromotion: boolean;
  /**
   * REQ-163. Phase 0 has no intake field for this, so `package` writes `false` and `capturedAtIntake` below says it was not asked. Do not read a `false` here as a supplier's assertion.
   */
  thirdPartyPromotion: boolean;
  /**
   * REQ-163; see `thirdPartyPromotion`.
   */
  affiliateRelationship: boolean;
  /**
   * REQ-163's regulated-category flag. Null means not captured, not 'none' — the JobBrief has no field for it at Phase 0.
   */
  regulatedCategory: string | null;
}
/**
 * REQ-164, record-level: what the pipeline did to the material, kept apart from what a platform is told. REQ-164's own distinction is load-bearing — selection, reframing, captioning and colour correction are NOT realistic synthetic alteration — and Phase 0 performs only the first kind, so `materialAlteration` is computed rather than declared.
 */
export interface AiAlterationRecord {
  /**
   * The alteration classes this render actually performed, from a closed set. Every one is a REQ-164 'simple' operation at Phase 0; the enum is inline rather than a shared registry because it describes what THIS pipeline does, not a cross-object vocabulary.
   *
   * @minItems 1
   */
  operations: [
    (
      | "selection"
      | "reframing"
      | "captioning"
      | "colour_correction"
      | "loudness_normalisation"
      | "synthetic_generation"
      | "voice_translation"
    ),
    ...(
      | "selection"
      | "reframing"
      | "captioning"
      | "colour_correction"
      | "loudness_normalisation"
      | "synthetic_generation"
      | "voice_translation"
    )[]
  ];
  /**
   * True only when `operations` contains an alteration REQ-164 calls realistic synthetic alteration (`synthetic_generation`, `voice_translation`). Phase 0 performs neither, so this is `false` — and it is computed from `operations` rather than set, so it cannot drift from what happened.
   */
  materialAlteration: boolean;
  /**
   * Whether the disclosure categories above were asked of the supplier at intake. `false` at Phase 0 for the categories the JobBrief does not model — which is exactly the fact a compliance reviewer needs, and the reason the fields are not simply omitted.
   */
  capturedAtIntake: boolean;
}
/**
 * The FINAL render's technical QA verdict (REQ-088, D-35). Packaging accepts `pass` or `pass_with_waivers` and refuses `fail`; a waiver naming a blocker was already rejected upstream, so a committed package can never carry a waived blocker.
 */
export interface PackageQa {
  qaReportId: Ulid;
  /**
   * `fail` is deliberately NOT a member. A failed gate cannot be packaged, so the schema does not admit the value — which is stronger than a code check, because it makes the state unrepresentable.
   */
  gateStatus: "pass" | "pass_with_waivers";
  rulesetVersion: string;
  /**
   * Fixed at zero by the contract. Blockers are non-waivable (D-35), so a package carrying one is not a thing that can exist.
   */
  blockerCount: 0;
  warningCount: number;
  /**
   * Warning waivers applied, in full. `status --phase0` counts waived packages separately (D-35), so the record has to travel with the package rather than being resolvable only from the job directory.
   */
  waivers: PackageWaiver[];
}
export interface PackageWaiver {
  waiverId: Ulid;
  approvedBy: string;
  reason: string;
  waivedAt: string;
  /**
   * @minItems 1
   */
  findingIds: [string, ...string[]];
}
/**
 * Exit criterion 2 — 'zero invalid source ranges in final renders' — made per-package and addressable (D-36's 'final-render range-validation ID'). It is recorded by reference to the QA check record that produced it rather than as a fresh artefact: `checkSourceRange` is the single implementation (tech-spec §12), the final render's `plan()` refuses an out-of-bounds range before any encode, and the QA report's `source_range_validity` row is that refusal's receipt. A second artefact restating it would be a second place for the criterion to disagree with itself.
 */
export interface PackageRangeValidation {
  qaReportId: Ulid2;
  checkId: "source_range_validity";
  /**
   * Fixed at `ran`. A skipped or errored range check is not evidence, and packaging refuses it — so `skipped` and `errored` are unrepresentable here rather than merely unexpected.
   */
  status: "ran";
  /**
   * How many source ranges were validated — one per EDL clip. Recorded because 'zero violations' over zero ranges is not the claim the exit criterion makes, and a count is the only thing that tells them apart.
   */
  rangeCount: number;
  violationCount: 0;
}
export interface ContractSetEntry {
  /**
   * The schema's `$id`, e.g. `https://cutdown.local/contracts/schemas/platform-edl-v1.json`.
   */
  schemaId: string;
  majorVersion: number;
  schemaVersion: string;
  contentHash: ContentHash4;
}
/**
 * Content address for an artefact or media file (PRD REQ-005). sha256 is the only algorithm at Phase 0; the field is present so a future algorithm is an additive change.
 */
export interface ContentHash4 {
  algorithm: "sha256";
  value: string;
}
/**
 * REQ-088's final item: version, model, renderer, rules, style and capability provenance. Restated in full rather than referenced (PRD §10.6) — a delivered package travels away from the job directory, and provenance that only resolves inside it is provenance that stops existing at the moment somebody asks.
 */
export interface PackageProvenance {
  renderer: PackageRenderer;
  ffmpegVersion: string;
  /**
   * tech-spec §12: Phase 0 claims tier 1 only — byte-identical on the pinned local environment (D-33). Cross-machine identity is not claimed.
   */
  determinismTier: 1;
  qaRulesetVersion: string;
  modelProvenance: ModelProvenance;
  /**
   * Tagged union so 'no brand style was applied' carries its reason instead of looking like an omission.
   */
  styleProfile: AppliedStyleProfile | NoStyleProfile;
  platformCapability: PackagePlatformCapability;
  /**
   * Every font the render burned in, by sha256 (decisions.md D-29). The hash is the licence basis as much as the pixel basis: a substituted font would change both, which is why the renderer refuses a mismatch rather than substituting.
   *
   * @minItems 1
   */
  fonts: [PackageFont, ...PackageFont[]];
}
export interface PackageRenderer {
  name: string;
  version: string;
}
/**
 * The editorial model that produced the EDL, copied from it. A package whose cut was model-proposed says so.
 */
export interface ModelProvenance {
  /**
   * Provider key (Phase 0 default `anthropic`, decisions.md D-21). Provider swap is config, never a schema change — the field is a string, not an enum, so a new provider is data.
   */
  provider: string;
  /**
   * Exact model identifier the gateway called (e.g. `claude-sonnet-5`). Recorded verbatim so an artefact is reproducible against the model that made it.
   */
  modelId: string;
  /**
   * Stable identifier of the prompt template used (e.g. `propose-angles`). Which template, separate from which version, so a template rename is visible.
   */
  promptTemplateId: string;
  /**
   * Semantic version of the prompt template. A prompt change that alters output shape or meaning bumps this, so a regression is traceable to a template revision.
   */
  promptTemplateVersion: string;
}
export interface AppliedStyleProfile {
  kind: "applied";
  styleProfileId: string;
  accountId: string;
}
export interface NoStyleProfile {
  kind: "none";
  reason: string;
}
/**
 * Which capability fixture and safe-zone overlay version the cut was validated against (decisions.md D-3 fixes one at Phase 0). A caption judged safe against a July overlay is not judged safe against a December one, and the package has to say which.
 */
export interface PackagePlatformCapability {
  platform: Platform;
  surface: string;
  overlayVersion: string;
}
export interface PackageFont {
  family: string;
  role: "heading" | "body" | "caption";
  contentHash: ContentHash3;
  licenceNote: string;
}
