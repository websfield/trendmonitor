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
 * The immutable, deterministic execution spec for one render of one PlatformEDL (PRD REQ-080/087, §5 object table): exact renderer + versions, fonts by content hash, media tier, output settings, the bit-exact determinism knobs (D-33 tier-1), the audio-mix plan (with loudness/true-peak TARGETS), the caption-file triplet by reference, and the platform overlay version. Two tiers (D-34): a `draft` renders from proxy media with a visible version identifier; a `final` renders from source-hashed originals. Both carry the SAME `editorialPlanHash` (they realise one editorial plan); a `final` manifest links its `approvedDraftManifestId` and may differ from the draft only in tier/media/encode fields. Immutable revision. MEASURED loudness/true-peak of the produced render are reported on the render result / QA report, not here — this is the plan, not the measurement.
 */
export interface RenderManifest {
  renderManifestId: Ulid;
  envelope: Envelope;
  jobId: string;
  edlId: Ulid1;
  /**
   * The manifest revision this supersedes, or null for the first (REQ-039).
   */
  parentManifestId: Ulid | null;
  /**
   * D-34: `draft` renders from proxy media with a visible version identifier for review; `final` renders from source-hashed originals for delivery. Exit criterion 2 ('zero invalid source ranges in final renders') binds to `final`.
   */
  tier: "draft" | "final";
  editorialPlanHash: ContentHash;
  /**
   * For a `final` manifest, the draft manifest whose approved ReviewDecision authorises this final render (REQ-152 order). Null for a `draft`. The approval subject must match; the resolver checks it.
   */
  approvedDraftManifestId: Ulid | null;
  /**
   * REQ-105 groundwork. A `draft`-tier render is `draft`; a `final` becomes `editorially_approved` only via the approval flow (Phase 5). Recorded here so the release state travels with the render.
   */
  releaseState: "draft" | "editorially_approved";
  renderer: RendererIdentity;
  media: MediaTier;
  /**
   * Fonts referenced by content hash (PRD §10.6/§10.8.4). A render refuses on a hash mismatch rather than substituting silently — a substituted font is a rights and a determinism break. Inter (OFL, D-29) is the Phase 0 default.
   *
   * @minItems 1
   */
  fonts: [FontReference, ...FontReference[]];
  output: OutputSettings;
  encoderSettings: EncoderSettings;
  audioMix: AudioMixPlan;
  captions: CaptionArtefacts;
  /**
   * The dated safe-zone/overlay fixture version this render was composed against (REQ-055 safe zones), e.g. `2026-07`. Recorded so a later overlay change is a visible re-render, not a silent drift.
   */
  platformOverlayVersion: string;
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
 * sha256 of the editorial plan (the resolved EDL) this render realises. The draft and final manifests for one plan carry the SAME value — that identity is what makes 'the final differs from the approved draft only in media/encode' checkable.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
/**
 * Exact renderer and toolchain versions (PRD §10.6). Phase 0 is `renderer-ffmpeg` (D-16); Remotion is an owner escalation and cannot appear here at Phase 0.
 */
export interface RendererIdentity {
  /**
   * A `const`: Phase 0 has exactly one sanctioned renderer (D-16). A second is a deliberate schema change.
   */
  name: "renderer-ffmpeg";
  rendererVersion: string;
  /**
   * The exact FFmpeg build string the tier-1 determinism proof pins (D-33), e.g. `8.0.1-full_build (gyan.dev)`.
   */
  ffmpegVersion: string;
}
/**
 * Which media this tier renders from. `draft` = proxy (cheap, D-25); `final` = source_original (source-hashed, full quality). The two tiers name the same clips; only this source differs.
 */
export interface MediaTier {
  source: "proxy" | "source_original";
}
export interface FontReference {
  family: string;
  role: "heading" | "body" | "caption";
  hash: ContentHash1;
  /**
   * Recorded licence basis (e.g. `OFL` for Inter; a brand font needs recorded commercial rights).
   */
  licenceNote: string;
}
/**
 * Content address for an artefact or media file (PRD REQ-005). sha256 is the only algorithm at Phase 0; the field is present so a future algorithm is an additive change.
 */
export interface ContentHash1 {
  algorithm: "sha256";
  value: string;
}
/**
 * The output container and frame geometry (PRD REQ-050 canvas; §10.6). Codec/encoder knobs live in `encoderSettings`.
 */
export interface OutputSettings {
  container: "mp4" | "mov";
  width: number;
  height: number;
  frameRate: Timebase;
}
/**
 * Constant output frame rate as an exact rational (e.g. 30000/1001). CFR output (D-25); VFR is normalised upstream.
 */
export interface Timebase {
  num: number;
  den: number;
}
/**
 * The exact knobs the tier-1 byte-identical determinism proof pins (tech-spec §12, D-33): pinned thread count, bit-exact flags, stripped creation_time, pinned pixel format and codecs. Two renders with identical inputs and identical settings on the pinned local environment must be byte-identical — these fields are why that is decidable.
 */
export interface EncoderSettings {
  /**
   * x264 is bit-exact under the pinned constraints (tech-spec §12.1).
   */
  videoCodec: "h264";
  /**
   * e.g. `yuv420p`. Pinned so the decode/encode path is reproducible.
   */
  pixelFormat: string;
  /**
   * Constant Rate Factor. Draft and final may differ here; recorded so the encode is reproducible.
   */
  crf: number;
  /**
   * Fixed thread count — x264 is only bit-exact at a pinned `threads=N` (tech-spec §12.1).
   */
  threads: number;
  /**
   * Whether `-fflags +bitexact -flags +bitexact` were applied. Tier-1 determinism requires true.
   */
  bitexact: boolean;
  /**
   * Whether `creation_time`/`-map_metadata -1` stripped nondeterministic timestamps. Tier-1 requires true.
   */
  stripCreationTime: boolean;
  audioCodec: "aac";
  audioBitrateKbps: number;
}
/**
 * The dialogue-first audio-mix PLAN (REQ-085): normalisation intent and the loudness/true-peak TARGETS the render aims for. No added music (D-2). The MEASURED loudness/true-peak of the produced render are reported on the render result / QA report, not here.
 */
export interface AudioMixPlan {
  /**
   * Whether loudness normalisation is applied (no clipping, REQ-085).
   */
  normalize: boolean;
  /**
   * Integrated-loudness target in LUFS (negative, e.g. -14).
   */
  targetLoudnessLufs: number;
  /**
   * True-peak ceiling in dBTP (negative, e.g. -1).
   */
  maxTruePeakDbtp: number;
  /**
   * False for a source with no audio stream — an explicit state, not an omission (REQ-085 audio-less source is explicit).
   */
  hasAudio: boolean;
}
/**
 * The caption-file triplet by relative path (REQ-083): burned-in ASS plus sidecar SRT and WebVTT. Verbatim vs display text is kept separate upstream (the EDL quote captions); these are the rendered files. `captionPlanHash` binds the caption content to this render.
 */
export interface CaptionArtefacts {
  /**
   * Burn-in subtitle (libass ASS) relative path under the render dir.
   */
  assPath: string;
  srtPath: string;
  vttPath: string;
  captionPlanHash: ContentHash1;
}
