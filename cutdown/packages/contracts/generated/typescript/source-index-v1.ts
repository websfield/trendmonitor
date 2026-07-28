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
 * Variable-frame-rate behaviour observed at preflight (PRD REQ-004/REQ-019). `vfr` obliges the SourceIndex to carry an explicit timebase mapping; `unknown` is fail-closed and is treated as `vfr` by range validation, because REQ-019 forbids relying on a transcript timestamp without a validated media timebase.
 */
export type FrameRateMode = "cfr" | "vfr" | "unknown";
/**
 * How one shot gives way to the next (PRD REQ-012: 'hard cuts, fades, camera changes'). `camera_change` covers a continuous take whose framing moves enough to read as a new shot; it is detected separately from a hard cut so a Phase 2 fixture can prove the two do not collapse into one unbounded scene.
 */
export type ShotTransitionKind = "hard_cut" | "fade" | "camera_change" | "unknown";
/**
 * Editorial audio events (PRD REQ-015), verbatim: speech, music, applause, laughter, crowd reactions, impacts, silence, and material energy changes. REQ-015 forbids treating volume alone as emotional importance — `energy_change` is therefore always produced by the classifier track (decisions.md D-20: PANNs CNN14), never by the RMS track on its own, and carries the producing detector in `detector`.
 */
export type AudioEventKind =
  "speech" | "music" | "applause" | "laughter" | "crowd_reaction" | "impact" | "silence" | "energy_change";
/**
 * The twelve technical-quality signals of PRD REQ-014, one enum member per listed item: blur, shake, under/overexposure, black or frozen frames, occlusion, poor crop, low resolution, duplicate frames, audio clipping, noise, speech intelligibility, silence. The Phase 2 coverage matrix asserts every member has an implementation plus a positive and a negative fixture — keeping the member count equal to REQ-014's item count is what makes 'all named quality fields, not a sample' countable.
 */
export type QualityFlagKind =
  | "blur"
  | "shake"
  | "exposure"
  | "black_or_frozen_frame"
  | "occlusion"
  | "poor_crop"
  | "low_resolution"
  | "duplicate_frames"
  | "audio_clipping"
  | "audio_noise"
  | "speech_intelligibility"
  | "silence";

/**
 * The multimodal index of ONE source asset (PRD §5 object table; REQ-010 through REQ-015 and REQ-019). Immutable per asset hash + indexer version. Authored in Phase 1 so the shape is fixed before Phase 2 fills it in sub-stage by sub-stage — every sub-stage's output has a home here from the start, which is what keeps the 'last ten outputs need no breaking contract change' exit criterion reachable. Every collection is REQUIRED and may be empty; emptiness is a finding (this asset has no OCR text), and the reason a collection is empty lives in the matching `subStages` entry, never in an absent property.
 */
export interface SourceIndex {
  indexId: Ulid;
  envelope: Envelope;
  jobId: string;
  assetId: Ulid;
  sourceContentHash: ContentHash;
  /**
   * Version of the indexer as a whole. decisions.md D-31 requires Moment granularity changes to be recorded as an indexer version bump — this is that field.
   */
  indexerVersion: string;
  timebaseMap: TimebaseMap;
  /**
   * One entry per internal sub-stage (tech-spec §6.5: transcript, shots/scenes, OCR, visual descriptions, audio events, quality flags, Moment extraction). `index` is ONE public skill; this array is where its internal structure becomes inspectable without widening the public surface. A `skipped` or `failed` entry with a stated reason is how the index stays honest about what it does not know — e.g. the `--no-vlm` path records descriptions as skipped-with-reason and NEVER fabricates one.
   */
  subStages: SubStageRecord[];
  /**
   * Null only when the asset has no audio at all. A silent clip that WAS transcribed yields a Transcript with empty segments — not null.
   */
  transcript: Transcript | null;
  speakerTurns: SpeakerTurn[];
  shots: Shot[];
  scenes: Scene[];
  ocr: OcrObservation[];
  visualDescriptions: VisualDescription[];
  audioEvents: AudioEvent[];
  qualityFlags: QualityFlag[];
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
 * The hash of the asset this index describes. Together with `indexerVersion` and each sub-stage's recorded model config, this is the REQ-005 cache key: reusing footage repeats no unchanged work.
 */
export interface ContentHash {
  algorithm: "sha256";
  value: string;
}
/**
 * REQ-019's explicit normalisation record: 'Variable-frame-rate sources are normalised or mapped explicitly.' For a CFR source, `entries` is empty and the linear relation between the two timebases is exact and sufficient. For a VFR source, `entries` carries the observed presentation timestamps so a normalized tick can be resolved back to a real source frame — without this, every downstream range on a VFR clip is a guess.
 */
export interface TimebaseMap {
  mode: FrameRateMode;
  sourceTimebase: Timebase;
  normalizedTimebase: Timebase;
  entries: TimebaseMapEntry[];
}
/**
 * Seconds per tick, as an exact rational: `seconds = ticks * num / den`. Matches FFmpeg's `time_base` convention. Example: 30000/1001 fps video has `{num: 1001, den: 30000}`.
 */
export interface Timebase {
  num: number;
  den: number;
}
export interface TimebaseMapEntry {
  sourceTicks: number;
  normalizedTicks: number;
}
export interface SubStageRecord {
  name:
    | "transcript"
    | "shots"
    | "scenes"
    | "ocr"
    | "visual_descriptions"
    | "audio_events"
    | "quality_flags"
    | "moment_extraction";
  /**
   * `failed` keeps the index resumable: other sub-stages proceed and a later run completes this one (tech-spec §8). It never silently becomes `completed`.
   */
  status: "completed" | "skipped" | "failed";
  /**
   * REQUIRED to be non-null when status is `skipped` or `failed` — enforced by the assembler, not by schema (no if/then/else in the subset). This is the field the `--no-vlm` fixture asserts on.
   */
  reason: string | null;
  engine: EngineRecord | null;
  startedAt: string;
  completedAt: string | null;
}
/**
 * Which engine produced a set of observations, at which version, with which parameters. REQ-012 requires thresholds 'recorded with the index'; REQ-005 requires model configuration in the cache key. Parameters are a key/value ARRAY rather than a free-form object because tech-spec §3's schema subset forbids patternProperties — the array form also generates cleanly in both languages.
 */
export interface EngineRecord {
  name: string;
  version: string;
  parameters: EngineParameter[];
}
export interface EngineParameter {
  key: string;
  /**
   * Stringified so the record is language-neutral and hashable; the engine owns interpretation.
   */
  value: string;
}
/**
 * REQ-010: segment- and word-level timestamps, language, confidence, and a stable mapping to source timecode. The verbatim transcript is preserved SEPARATELY from cleaned caption text throughout — `verbatimText`/`displayText` appear as a pair at every level, because a caption that silently drops a disfluency changes what the speaker said, and the rights/quotation gate (decisions.md D-37, quote token order) checks against the verbatim side.
 */
export interface Transcript {
  language: string;
  languageConfidence: number;
  /**
   * The whole verbatim transcript as one string. Redundant with the segments by design: it is the artefact a human reads and the one a quotation check tokenises.
   */
  verbatimText: string;
  segments: TranscriptSegment[];
}
export interface TranscriptSegment {
  segmentId: string;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  verbatimText: string;
  /**
   * Cleaned caption text. May differ from verbatim only by disfluency removal and punctuation — never by meaning.
   */
  displayText: string;
  confidence: number;
  speakerTurnId: string | null;
  words: TranscriptWord[];
}
export interface TranscriptWord {
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  verbatim: string;
  confidence: number;
  /**
   * True when confidence < the D-28 threshold (0.6). decisions.md D-28 sets no automated caption pass/fail at Phase 0 — every caption is human-reviewed — so this flag exists to DIRECT reviewer attention, not to gate.
   */
  lowConfidence: boolean;
  /**
   * D-28 requires all proper nouns flagged for reviewer attention: a misspelt name is the caption error that most damages an account, and ASR confidence alone does not catch it.
   */
  properNounCandidate: boolean;
}
/**
 * REQ-011 at its Phase-0 subset (decisions.md D-17): segment-level speaker TURNS with optional manual naming, low-confidence marking, and correction lineage. Real diarisation is deferred, so `inferredLabel` is a positional label (`speaker_1`), never an identity claim. A correction NEVER overwrites the inference — both are kept, with author and timestamp, so a wrong correction is traceable.
 */
export interface SpeakerTurn {
  /**
   * STABLE across re-runs of the same asset+indexer version — a `--speaker-map` file keys on this, so an unstable ID would silently reassign names. Phase 2 derives it deterministically from turn ordinal and start tick.
   */
  turnId: string;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  inferredLabel: string;
  inferredConfidence: number;
  /**
   * REQ-011: 'Low-confidence diarisation must be visibly marked.' Carried through to the review payload.
   */
  lowConfidence: boolean;
  correction: SpeakerCorrection | null;
}
export interface SpeakerCorrection {
  name: string;
  author: string;
  correctedAt: string;
}
/**
 * REQ-012 hard cuts, fades, and camera changes. `transitionIn`/`transitionOut` are recorded separately so a fade-to-black between two shots is not misread as one hard cut, and the detector's thresholds ride along in `engine`.
 */
export interface Shot {
  shotId: string;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  transitionIn: ShotTransitionKind;
  transitionOut: ShotTransitionKind;
  /**
   * The representative frame OCR and visual description sample from — recorded so those sub-stages are reproducible.
   */
  keyframeTicks: number;
  confidence: number;
  engine: EngineRecord;
}
/**
 * REQ-012's 'longer semantic scenes': adjacent shots grouped by transcript, visual, and temporal continuity. `groupingSignals` records WHICH continuity signals justified the grouping, so a Phase 2 fixture can prove a fade and a camera change do not collapse into one unbounded scene.
 */
export interface Scene {
  sceneId: string;
  /**
   * @minItems 1
   */
  shotIds: [string, ...string[]];
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  groupingSignals: ("transcript_continuity" | "visual_continuity" | "temporal_proximity" | "speaker_continuity")[];
  engine: EngineRecord;
}
/**
 * REQ-013 on-screen text WITH time ranges. Bounding boxes are normalized 0–1 against DISPLAY dimensions (rotation already applied), so a caption-safe-zone check in Phase 4 can compare them to the platform overlay without knowing the source's rotation.
 */
export interface OcrObservation {
  ocrId: string;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  text: string;
  confidence: number;
  boundingBox: NormalizedRect;
  shotId: string | null;
  engine: EngineRecord;
}
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/**
 * REQ-013's requirement to describe silent or visually important footage at SHOT and MOMENT level, not only isolated sampled frames. `keyframeCount` records how many frames the VLM actually saw — PRD §10.7 minimisation means selective keyframes only, and the count is what makes that claim auditable. Produced by a model, so `engine` records model ID and version (PRD §10.6).
 */
export interface VisualDescription {
  descriptionId: string;
  scope: "shot" | "moment";
  shotId: string | null;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  text: string;
  keyframeCount: number;
  engine: EngineRecord;
}
/**
 * REQ-015 editorial audio events. The requirement's teeth: 'The engine must not treat volume alone as emotional importance.' `engine` therefore records the producing detector, and an `energy_change` event whose engine is the RMS track alone is a Phase 2 test failure — the classifier (decisions.md D-20, PANNs CNN14) must corroborate it.
 */
export interface AudioEvent {
  eventId: string;
  kind: AudioEventKind;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  confidence: number;
  engine: EngineRecord;
}
/**
 * One REQ-014 technical-quality observation over a time range. `threshold` records the exact number that fired, so a threshold change is visible in the artefact rather than buried in a code diff — the same 'numbers are data' discipline as the technical QA ruleset (tech-spec §12.1).
 */
export interface QualityFlag {
  flagId: string;
  kind: QualityFlagKind;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
  severity: "info" | "warning" | "severe";
  /**
   * The measured value, in the detector's own units.
   */
  score: number;
  threshold: QualityThreshold;
  engine: EngineRecord;
}
export interface QualityThreshold {
  name: string;
  value: number;
  comparison: "greater_than" | "less_than";
}
