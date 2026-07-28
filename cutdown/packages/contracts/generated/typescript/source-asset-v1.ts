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
 * The six asset classes a multi-asset job accepts, verbatim from PRD REQ-001: 'multiple video, audio, image, logo, subtitle, and brand-reference files per job'. `ingest` rejects any directory member it cannot classify into one of these, naming the relative path — the closed list is what makes that rejection deterministic.
 */
export type AssetKind = "video" | "audio" | "image" | "logo" | "subtitle" | "brand_reference";
/**
 * Whether an asset is real client footage or a permissioned fixture (decisions.md D-36). `cutdown status --phase0` counts only packages whose every source asset is `real`; this field is the sole mechanism preventing fixture runs from being reported as Phase 0 exit evidence (D-27/D-38).
 */
export type SourceClassification = "real" | "fixture";
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
 * Variable-frame-rate behaviour observed at preflight (PRD REQ-004/REQ-019). `vfr` obliges the SourceIndex to carry an explicit timebase mapping; `unknown` is fail-closed and is treated as `vfr` by range validation, because REQ-019 forbids relying on a transcript timestamp without a validated media timebase.
 */
export type FrameRateMode = "cfr" | "vfr" | "unknown";
/**
 * Media integrity verdict from preflight decode (PRD REQ-004). `suspect` means decode emitted recoverable errors; `corrupt` means the asset failed to decode. Both are non-waivable packaging blockers (decisions.md D-35), and `corrupt` fails the whole atomic ingest so no partial job inventory lands.
 */
export type CorruptionStatus = "clean" | "suspect" | "corrupt";

/**
 * One ingested asset: original media plus hash, technical metadata, ownership, consent, licence (PRD §5 object table). Carries the complete PRD REQ-004 preflight surface — container, codec, frame rate, VFR behaviour, timebase, rotation, colour space, HDR, audio tracks, sample rate, corruption, duration — inspected BEFORE indexing. The original file is never modified: `proxy` records the derived 720p-fit copy (decisions.md D-25) and `contentHash` addresses the untouched original.
 */
export interface SourceAsset {
  assetId: Ulid;
  envelope: Envelope;
  /**
   * The job this asset was ingested into. Human-chosen (e.g. `test-1`), not a ULID — it is the directory name under `project-data/jobs/`.
   */
  jobId: string;
  /**
   * Path relative to the ingest root, in normalized forward-slash form. This is the identity used in error messages and in a job-level rights manifest's keys — REQ-001's discovery order is normalized relative-path order, so this value is also the sort key that makes ingest deterministic.
   */
  relativePath: string;
  assetKind: AssetKind;
  sourceClassification: SourceClassification;
  contentHash: ContentHash;
  byteSize: number;
  /**
   * Hash-named location under `project-data/jobs/<job-id>/source/` (tech-spec §9.1). Originals are immutable once written.
   */
  storedPath: string;
  rights: RightsRecord;
  preflight: PreflightReport;
  /**
   * The derived proxy (decisions.md D-25), or null when the asset kind has no proxy. The original is never destroyed (REQ-004).
   */
  proxy: ProxyRecord | null;
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
 * sha256 of the ORIGINAL bytes (PRD REQ-005). Together with indexer version and model config this keys every expensive index artefact, so re-ingesting the same footage repeats no work.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
/**
 * Rights and consent for one asset (PRD REQ-003), verbatim coverage: who owns or supplied it, permitted platforms, territories, campaign/expiry dates, talent and location release status, music status, and whether editing and paid amplification are permitted. REQ-003's closing rule is load-bearing: 'Unknown material is flagged rather than assumed cleared' — so `unknownRecord()` in this package produces `state: "unknown"` with every detail null, and there is no code path that defaults an absent record to `cleared`. Referenced by SourceAsset now and by the ContentPackage rights manifest from Phase 5.
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
 * The complete REQ-004 inspection. Every sub-object is REQUIRED to be present; a sub-object is null only when genuinely not applicable to the asset kind (a .srt subtitle has no video and no audio), and `inspected` records that preflight actually ran.
 */
export interface PreflightReport {
  /**
   * True once ffprobe (or the text-asset reader) completed. A SourceAsset with `inspected: false` never reaches the job inventory — ingest is atomic.
   */
  inspected: boolean;
  /**
   * Null for non-media assets (subtitle, brand reference).
   */
  container: ContainerInfo | null;
  /**
   * Exact duration in rational ticks. This is the upper bound `range-check.ts` validates every Moment and EDL range against — the mechanism behind the 'zero invalid source ranges' exit criterion. Null for assets with no time dimension.
   */
  duration: MediaTime | null;
  /**
   * Null for audio-only, subtitle, and brand-reference assets. Present for image assets (a still is a one-frame video stream to ffprobe).
   */
  video: VideoStreamInfo | null;
  /**
   * REQ-004 requires audio tracks (plural) and sample rate. An EMPTY array is a positive finding — 'this asset has no audio' — and is what the silent-b-roll fixture asserts. It is never conflated with a null preflight.
   */
  audioTracks: AudioStreamInfo[];
  corruption: CorruptionReport | null;
}
export interface ContainerInfo {
  formatName: string;
  formatLongName: string;
}
/**
 * An exact instant or duration: `ticks` counted in `timebase`.
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
export interface VideoStreamInfo {
  codecName: string;
  profile: string | null;
  pixelFormat: string;
  codedWidth: number;
  codedHeight: number;
  /**
   * Width AFTER applying rotation metadata. Editorial code reads display dimensions only; using coded dimensions on a rotated phone clip silently produces a sideways crop.
   */
  displayWidth: number;
  displayHeight: number;
  /**
   * Rotation to apply when displaying, expressed COUNTER-CLOCKWISE — ffprobe's native convention, read from Display Matrix side data (`side_data_list[].rotation`). Direction settled empirically, not from documentation: a half-red/half-blue clip stamped `-display_rotation:v:0 90` lands its LEFT edge at the BOTTOM after autorotation, which is 90° counter-clockwise. This matters because nothing at Phase 0 can observe the difference — only `displayWidth`/`displayHeight` consume it, and 90 and 270 swap dimensions identically — so a renderer that actually applies rotation would be 180° wrong with no earlier test catching it. The legacy container `rotate` tag is CLOCKWISE-positive and is negated on the fallback path (FFmpeg 8 cannot produce that tag, so that branch is untested).
   */
  rotationDegrees: 0 | 90 | 180 | 270;
  averageFrameRate: Timebase;
  realFrameRate: Timebase1;
  frameRateMode: FrameRateMode;
  timebase: Timebase2;
  /**
   * Null when the container does not declare it and a full decode was not performed.
   */
  frameCount: number | null;
  color: ColorInfo;
  hdr: HdrInfo;
}
/**
 * Seconds per tick, as an exact rational: `seconds = ticks * num / den`. Matches FFmpeg's `time_base` convention. Example: 30000/1001 fps video has `{num: 1001, den: 30000}`.
 */
export interface Timebase1 {
  num: number;
  den: number;
}
/**
 * Seconds per tick, as an exact rational: `seconds = ticks * num / den`. Matches FFmpeg's `time_base` convention. Example: 30000/1001 fps video has `{num: 1001, den: 30000}`.
 */
export interface Timebase2 {
  num: number;
  den: number;
}
export interface ColorInfo {
  space: string | null;
  primaries: string | null;
  transfer: string | null;
  range: string | null;
}
/**
 * HDR is DETECTED and RECORDED at Phase 0 but not converted — tone-mapping is REQ-089, product Phase 1. Recording it now means the Phase 1 conversion work can find its inputs without a re-ingest.
 */
export interface HdrInfo {
  isHdr: boolean;
  /**
   * e.g. `pq` / `hlg`, inferred from the transfer characteristic.
   */
  detectedFormat: string | null;
}
export interface AudioStreamInfo {
  streamIndex: number;
  codecName: string;
  sampleRate: number;
  channels: number;
  channelLayout: string | null;
  timebase: Timebase3;
  durationTicks: number;
}
/**
 * Seconds per tick, as an exact rational: `seconds = ticks * num / den`. Matches FFmpeg's `time_base` convention. Example: 30000/1001 fps video has `{num: 1001, den: 30000}`.
 */
export interface Timebase3 {
  num: number;
  den: number;
}
export interface CorruptionReport {
  status: CorruptionStatus;
  detail: string | null;
  decodeErrorCount: number;
}
/**
 * The 720p-fit H.264 CRF 23 + AAC 128k constant-frame-rate proxy (decisions.md D-25). Proxy only — there is no mezzanine tier at Phase 0. Draft renders read this; final renders re-read the source-hashed original (D-34).
 */
export interface ProxyRecord {
  storedPath: string;
  contentHash: ContentHash1;
  /**
   * Recorded in the SourceIndex per D-25 so a recipe change invalidates the cache rather than silently mixing proxy generations.
   */
  proxyProfileVersion: string;
  recipe: ProxyRecipe;
  timebase: Timebase4;
}
/**
 * Content address for an artefact or media file (PRD REQ-005). sha256 is the only algorithm at Phase 0; the field is present so a future algorithm is an additive change.
 */
export interface ContentHash1 {
  algorithm: "sha256";
  value: string;
}
export interface ProxyRecipe {
  /**
   * D-25's "720p-fit" bound, applied to the SHORT edge — not to height. Reading it as height ≤ 720 would scale a 1080×1920 portrait source to 405×720, a third of the pixels, for a product whose entire Phase 0 output is 9:16 vertical. Short-edge gives 720×1280 portrait and 1280×720 landscape. The two readings coincide for landscape, which is exactly why the misnomer would have survived unnoticed.
   */
  shortEdgeMaxPixels: number;
  videoCodec: string;
  crf: number;
  audioCodec: string | null;
  audioBitrateKbps: number | null;
  constantFrameRate: Timebase;
}
/**
 * Seconds per tick, as an exact rational: `seconds = ticks * num / den`. Matches FFmpeg's `time_base` convention. Example: 30000/1001 fps video has `{num: 1001, den: 30000}`.
 */
export interface Timebase4 {
  num: number;
  den: number;
}
