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
 * Resolved rights posture for one asset. PRD REQ-003: 'Unknown material is flagged rather than assumed cleared' — so an absent rights record resolves to `unknown`, never to `cleared`. `unknown`, `restricted`, and `expired` are all non-waivable packaging blockers (decisions.md D-35).
 */
export type RightsState = "cleared" | "unknown" | "restricted" | "expired";
/**
 * Ordered narrative roles a MasterStoryPlan composes, and the candidate roles a Moment may serve (PRD REQ-033, REQ-018). Members are REQ-033's list verbatim — 'promise, context, proof, escalation, demonstration, objection, payoff, invitation, or CTA'. REQ-033 explicitly refuses to force every format into a fixed five-role arc, so this is an unordered vocabulary, not a sequence.
 */
export type NarrativeFunction =
  "promise" | "context" | "proof" | "escalation" | "demonstration" | "objection" | "payoff" | "invitation" | "cta";

/**
 * A selectable, semantically coherent source range with content, quality, rights, and candidate-role features (PRD §5 object table, REQ-018). Immutable per source-index version. The assembled set is the Moment Graph. Every REQ-018 field below is REQUIRED — a field with nothing to say carries an explicit null plus a stated reason rather than being absent, so 'we did not look' and 'we looked and found nothing' stay distinguishable. Produced by DETERMINISTIC segmentation (decisions.md D-31: speaker-turn × shot-boundary intersection, 3–30 s); a model may enrich narrative-function tags only, and never decides the boundaries.
 */
export interface Moment {
  momentId: Ulid;
  envelope: Envelope;
  jobId: string;
  assetId: Ulid;
  sourceIndexId: Ulid1;
  sourceRange: SourceRange;
  /**
   * Convenience projection of sourceRange for human reading and for the D-31 3–30 s granularity assertion. NOT authoritative — sourceRange's integer ticks are. Never used for arithmetic that feeds a render.
   */
  durationSeconds: number;
  segmentation: SegmentationProvenance;
  transcript: MomentTranscript;
  visualSummary: NullableText;
  speakers: MomentSpeaker[];
  entities: MomentEntity[];
  keywords: string[];
  /**
   * REQ-018's 'emotion or energy cues'. Sourced from the REQ-015 audio-event track, so REQ-015's rule rides along: volume alone is never emotional importance, and `audioEventIds` names the classifier events that justified the cue.
   */
  energyCues: EnergyCue[];
  technicalQuality: MomentQuality;
  rights: MomentRights;
  /**
   * REQ-018's 'possible narrative functions' — CANDIDATES, plural and non-exclusive. The story planner chooses; this list only says what the Moment could serve. Optional LLM enrichment (D-31) may populate it, which is the one model contribution to a Moment and never touches its boundaries.
   */
  candidateNarrativeFunctions: CandidateNarrativeFunction[];
  /**
   * REQ-018's 'source dependencies': other Moments this one needs in order to make sense — a payoff that is meaningless without its setup, an answer without its question. The story planner uses these to avoid cutting a Moment loose from the context that makes it true, which is also what the deterministic 'required context' editorial gate (D-37) checks.
   */
  sourceDependencies: MomentDependency[];
  embedding: MomentEmbedding | null;
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
 * REQ-018's 'exact source range'. Validated against the asset's preflighted duration by `range-check.ts` — the single implementation, run by `cutdown index` over every generated Moment. This is the mechanism behind the 'zero invalid source ranges' Phase 0 exit criterion.
 */
export interface SourceRange {
  /**
   * ULID of the SourceAsset this range indexes into.
   */
  assetId: string;
  startTicks: number;
  /**
   * Exclusive end. `endTicks > startTicks` is enforced by range-check.ts, not by JSON Schema — draft 2020-12 cannot express a cross-property inequality, and tech-spec §3 forbids `if/then/else`.
   */
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
 * How this Moment's boundaries were chosen. decisions.md D-31 fixes deterministic segmentation and forbids model-driven boundaries; recording the method and the contributing boundary IDs is what makes that rule checkable against a produced artefact rather than only against the code.
 */
export interface SegmentationProvenance {
  /**
   * A `const`, not an enum: at Phase 0 there is exactly one sanctioned method, and adding a second is a deliberate schema change reviewed against D-31.
   */
  method: "speaker_turn_x_shot_boundary";
  speakerTurnIds: string[];
  shotIds: string[];
  indexerVersion: string;
  granularityBounds: GranularityBounds;
}
/**
 * The 3–30 s target window in force when this Moment was cut (D-31). Recorded per Moment so retuning granularity against real footage is visible in the data.
 */
export interface GranularityBounds {
  minSeconds: number;
  maxSeconds: number;
}
/**
 * REQ-018's 'transcript' for this range. Verbatim and display text are kept apart for the same reason as in SourceIndex: the deterministic quotation gate (D-37 — quote token order and speaker identity) tokenises the VERBATIM side, so a cleaned caption can never launder a misquote past it.
 */
export interface MomentTranscript {
  verbatimText: string;
  displayText: string;
  wordCount: number;
  segmentIds: string[];
  /**
   * How many words fell below the D-28 confidence threshold. A Moment full of low-confidence words is a poor quotation candidate, and the critic surfaces that.
   */
  lowConfidenceWordCount: number;
}
/**
 * REQ-018's 'visual summary'. Null-with-reason when the VLM sub-stage was skipped (e.g. `--no-vlm` before the D-21 spend ceiling is set) — NEVER a fabricated description.
 */
export interface NullableText {
  value: string | null;
  /**
   * Non-null exactly when `value` is null. Enforced by the assembler (the subset forbids if/then/else) and asserted by fixture.
   */
  absentReason: string | null;
}
export interface MomentSpeaker {
  turnId: string;
  /**
   * The corrected name if one exists, otherwise the inferred positional label.
   */
  label: string;
  /**
   * Whether `label` came from a human correction. The editorial gate treats an UNCORRECTED label as an unverified speaker identity.
   */
  isCorrected: boolean;
  lowConfidence: boolean;
}
export interface MomentEntity {
  text: string;
  kind: "person" | "organisation" | "product" | "place" | "claim" | "metric" | "other";
  confidence: number;
  /**
   * Which modality asserted it — an on-screen price read by OCR and a spoken price are different evidence.
   */
  source: "transcript" | "ocr" | "visual";
}
export interface EnergyCue {
  kind: AudioEventKind;
  intensity: number;
  /**
   * @minItems 1
   */
  audioEventIds: [string, ...string[]];
}
/**
 * REQ-018's 'technical quality' rollup for this range, projected from the SourceIndex's REQ-014 flags. `usable` is advisory only — an unusable-looking Moment is still offered to the editorial stage with its reasons attached, because the human, not the score, decides.
 */
export interface MomentQuality {
  flagKinds: QualityFlagKind[];
  worstSeverity: "none" | "info" | "warning" | "severe";
  usable: boolean;
}
/**
 * REQ-018's 'rights flags', inherited from the owning SourceAsset. Inherited rather than restated: a Moment cannot be more permissively licensed than the footage it is cut from, and duplicating the full record would let the two drift.
 */
export interface MomentRights {
  state: RightsState;
  concerns: string[];
}
export interface CandidateNarrativeFunction {
  function: NarrativeFunction;
  confidence: number;
  rationale: string;
  /**
   * `model` entries are advisory evidence (D-37) and can never become a blocking signal.
   */
  source: "heuristic" | "model";
}
export interface MomentDependency {
  momentId: Ulid;
  relation: "requires_setup" | "answers" | "proves" | "continues" | "contradicts";
}
/**
 * Transcript-text embedding computed during Phase 2 Moment extraction (decisions.md D-22: bge-small-en-v1.5, 384 dims, local). Stored ON the Moment so Phase 3's retrieval does brute-force cosine in pure TypeScript over vectors already on disk — the Stage B move to pgvector is then a re-embed, not a redesign. REQ-017's frame/clip embeddings are deliberately out of Phase 0 scope.
 */
export interface MomentEmbedding {
  model: string;
  modelVersion: string;
  /**
   * Capped at 2000: tech-spec §9.2 notes pgvector index types cap around that, so an embedding model chosen now cannot make the Stage B migration impossible.
   */
  dimensions: number;
  vector: number[];
}
