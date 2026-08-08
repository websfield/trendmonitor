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
 * The single target platform (REQ-050). At Phase 0 only `tiktok` resolves to a capability fixture (D-3); `plan` fails explicitly on any other.
 */
export type Platform = "tiktok" | "instagram_reels" | "youtube_shorts" | "linkedin";
/**
 * The declared job objective. Members are the seven rows of PRD §12.2 'Objective scorecards' verbatim — that table is what makes an objective meaningful (it names the primary metric candidates and guardrails), so the enum tracks it rather than inventing a parallel vocabulary. PRD REQ-002 requires exactly one per job; REQ-123 requires it declared before generation.
 */
export type Objective =
  | "discovery"
  | "education_utility"
  | "community"
  | "authority_trust"
  | "organic_conversion"
  | "paid_acquisition"
  | "retention_loyalty";
/**
 * Organic or paid mode (PRD REQ-002). Kept separate from `objective` because REQ-122 forbids comparing paid and organic posts as equivalent — a single blended enum would make that error unrepresentable-as-wrong.
 */
export type DistributionMode = "organic" | "paid";
/**
 * How a PlatformEDL fills the target canvas when source and target aspect ratios differ (PRD REQ-052). REQ-052 forbids blind centre-cropping, so `centre_crop` is deliberately NOT a member — the vocabulary makes the prohibited treatment unrepresentable rather than merely discouraged. `subject_reframe` is subject-aware reframing; `letterbox` is intentional bars; `blurred_background`/`branded_background` fill the margins; `split_screen` composes multiple sources.
 */
export type AspectTreatment =
  "subject_reframe" | "letterbox" | "blurred_background" | "branded_background" | "split_screen";
/**
 * Which hook hypothesis this cut opens with (carried down from the CreativeBrief/plan for A/B provenance).
 */
export type HookFamily =
  "outcome_first" | "problem_first" | "proof_first" | "personality_first" | "utility_first" | "curiosity_first";
/**
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid2 = string;
/**
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid3 = string;
/**
 * Ordered narrative roles a MasterStoryPlan composes, and the candidate roles a Moment may serve (PRD REQ-033, REQ-018). Members are REQ-033's list verbatim — 'promise, context, proof, escalation, demonstration, objection, payoff, invitation, or CTA'. REQ-033 explicitly refuses to force every format into a fixed five-role arc, so this is an unordered vocabulary, not a sequence.
 */
export type NarrativeFunction =
  "promise" | "context" | "proof" | "escalation" | "demonstration" | "objection" | "payoff" | "invitation" | "cta";
/**
 * The editorial caption decision for this clip (the render is Phase 4; the DECISION and its quote provenance live here). A tagged union so a clip with no caption, a text-led caption, and a spoken-quote caption are distinct — the quote variant always carries the verbatim source text + speaker the D-37 gate checks against.
 */
export type ClipCaption = NoCaption | TextCaption | QuoteCaption;
/**
 * REQ-056 audio-rights mode. A `cross_platform_cleared` or `byo_licensed` mode requires the rights gate to find recorded evidence; `native_audio_plan` defers the track to native publishing.
 */
export type AudioMode = "cross_platform_cleared" | "byo_licensed" | "native_audio_plan";
/**
 * The chosen cover / validated first frame (REQ-055), or an explicit none. Tagged union so 'no cover chosen yet' and 'this Moment at this instant' are distinct.
 */
export type CoverFrame = NoCover | MomentCover;

/**
 * The frame-accurate child timeline for ONE platform, objective, duration, locale, and aspect treatment (PRD REQ-050). Derived from a MasterStoryPlan; a distinct EDL per requested platform (REQ-050). Every clip carries an exact `SourceRange` validated by range-check.ts (the 'zero invalid source ranges' exit-criterion mechanism), the Moment it came from, its narrative role, and — where it captions speech — the quote provenance the D-37 quotation gate needs. Retains domain metadata OTIO cannot express: narrative role, hook hypothesis, platform objective, caption treatment, rationale (PRD §5.190). Immutable revision. The model PROPOSES ranges; deterministic `validate` code owns every blocking decision (D-37).
 */
export interface PlatformEDL {
  edlId: Ulid;
  envelope: Envelope;
  jobId: string;
  storyPlanId: Ulid1;
  /**
   * The revision this supersedes, or null for the first (REQ-039).
   */
  parentEdlId: Ulid | null;
  platform: Platform;
  objective: Objective;
  distributionMode: DistributionMode;
  /**
   * BCP-47 language[-region]; Phase 0 is en-AU (D-4).
   */
  locale: string;
  targetDurationRange: DurationRange;
  canvas: Canvas;
  aspectTreatment: AspectTreatmentChoice;
  hookFamily: HookFamily;
  /**
   * The ordered timeline. Each clip is one Moment-derived source range placed on the child timeline, in intended play order. `sourceRange` is validated against the asset's preflighted duration by range-check.ts — the single bounds validator, reused here exactly as `index` uses it over Moments.
   *
   * @minItems 1
   */
  clips: [EdlClip, ...EdlClip[]];
  audioMode: AudioMode;
  disclosures: Disclosures;
  metadata: EdlMetadata;
  coverFrame: CoverFrame;
  modelProvenance: ModelProvenance;
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
 * The output duration window this EDL targets (REQ-050). The capability gate checks it against the platform fixture's duration pin (D-3: 5–180 s for TikTok organic AU). maxSeconds >= minSeconds enforced in the resolver, not schema (§3 forbids if/then/else).
 */
export interface DurationRange {
  minSeconds: number;
  maxSeconds: number;
}
/**
 * The output frame (REQ-052). 9:16 720x1280 for TikTok organic AU (PRD §11 minResolution).
 */
export interface Canvas {
  width: number;
  height: number;
  /**
   * Human-readable ratio, e.g. `9:16`. The resolver checks it against the platform fixture's preferredAspectRatios.
   */
  aspectRatio: string;
}
/**
 * How the canvas is filled (REQ-052). The enum has no centre_crop member, so blind centre-cropping is unrepresentable; the rationale records why this treatment fits the footage.
 */
export interface AspectTreatmentChoice {
  mode: AspectTreatment;
  rationale: string;
}
export interface EdlClip {
  /**
   * Timeline-local clip identifier (e.g. `clip-1`).
   */
  clipId: string;
  /**
   * Play position; the resolver asserts a contiguous permutation.
   */
  order: number;
  momentId: Ulid2;
  assetId: Ulid3;
  sourceRange: SourceRange;
  narrativeFunction: NarrativeFunction;
  rationale: string;
  caption: ClipCaption;
  /**
   * The editorial transition decision for this clip's boundaries (D-52). Optional and null-safe so every pre-existing EDL remains valid; absent means hard cut. Fades are the only Phase 0 vocabulary - duration-preserving by design, so caption cue times and QA duration math are unaffected. A fade still changes the EDL and its content hashes like any other edit decision; what stays invariant is the draft-to-final plan-hash chain, since both tiers render the same faded EDL.
   */
  transition?: null | ClipTransition;
}
/**
 * The exact half-open range into the source. Validated by range-check.ts against the asset's preflighted duration — an out-of-bounds range is a NON-WAIVABLE block (D-35/D-37), never clamped.
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
export interface NoCaption {
  kind: "none";
}
export interface TextCaption {
  kind: "text";
  /**
   * Author-written on-screen text that does not quote speech (a title, a promise). Checked against JobBrief prohibited claims like any other text.
   */
  displayText: string;
}
export interface QuoteCaption {
  kind: "quote";
  /**
   * The caption as shown, possibly shortened. The D-37 gate requires its quoted tokens to be an in-order subsequence of `verbatimSourceText` — a shortening that reorders or interpolates meaning is blocked (REQ-037).
   */
  displayText: string;
  /**
   * The exact spoken words from the Moment transcript this caption quotes. The resolver checks it matches the referenced Moment's verbatim transcript.
   */
  verbatimSourceText: string;
  /**
   * Who is quoted. The gate checks it against the Moment's speakers[].label; an UNCORRECTED speaker label is an unverified identity the critic flags.
   */
  speakerLabel: string;
}
/**
 * Both fields optional; an empty object is a hard cut. The renderer refuses a pair whose sum exceeds the clip's duration (FADE_LONGER_THAN_CLIP) rather than layering fades over each other.
 */
export interface ClipTransition {
  /**
   * Fade from black (video) and silence (audio) over this many milliseconds at the clip's head. Duration-preserving: the clip occupies exactly the same output frames as a hard cut.
   */
  fadeInMs?: number;
  /**
   * Fade to black/silence over this many milliseconds at the clip's tail. Paired with the next clip's fadeInMs it reads as a dip-to-black join.
   */
  fadeOutMs?: number;
}
/**
 * Platform disclosure flags (REQ-058). The deterministic disclosure gate requires a paid-partnership disclosure when distributionMode is `paid`, and an AI-media disclosure when the edit materially alters media — a missing required disclosure is a NON-WAIVABLE block (D-35).
 */
export interface Disclosures {
  /**
   * Whether this output discloses a paid partnership.
   */
  paidPartnership: boolean;
  /**
   * Whether AI-generated or materially altered media is disclosed (maps to TikTok `is_aigc`, PRD §11).
   */
  aiGeneratedOrAltered: boolean;
  ownedBusinessPromotion: boolean;
}
/**
 * Minimal search/publishing metadata (REQ-050 'metadata'; REQ-054 full package is Phase 1). Title and optional description are checked against JobBrief prohibited claims like any other text.
 */
export interface EdlMetadata {
  title: string;
  description: string | null;
}
export interface NoCover {
  kind: "none";
}
export interface MomentCover {
  kind: "moment_frame";
  momentId: Ulid;
  atTick: MediaTime;
}
/**
 * The instant within the source the cover frame is taken from. Validated against the asset's bounds like any other range endpoint.
 */
export interface MediaTime {
  ticks: number;
  timebase: Timebase;
}
/**
 * Records WHICH model and WHICH prompt template produced a model-touched editorial artefact (PRD §10.6; decisions.md D-21). Every CreativeBrief, MasterStoryPlan, and PlatformEDL carries this because a Phase 3 acceptance criterion is that 'every editorial artefact records model ID + prompt-template version'. A shared $def rather than three inline copies for the same reason envelope/timecode are shared: one definition cannot drift into three. This is provenance metadata, not a decision input — D-37 keeps model output advisory; recording the model here does not make it authoritative.
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
