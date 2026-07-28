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
 * Ordered narrative roles a MasterStoryPlan composes, and the candidate roles a Moment may serve (PRD REQ-033, REQ-018). Members are REQ-033's list verbatim — 'promise, context, proof, escalation, demonstration, objection, payoff, invitation, or CTA'. REQ-033 explicitly refuses to force every format into a fixed five-role arc, so this is an unordered vocabulary, not a sequence.
 */
export type NarrativeFunction =
  "promise" | "context" | "proof" | "escalation" | "demonstration" | "objection" | "payoff" | "invitation" | "cta";
/**
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid2 = string;
/**
 * REQ-034: distinguish observed fact from model judgement for each structural decision.
 */
export type BeatBasis = ObservedFact | ModelJudgement;
/**
 * The editorial axis a proposed opening tests (PRD REQ-030/REQ-031). Members are the six variant axes named in the research memo's Hook Lab section — outcome-first vs problem-first, proof-first vs personality-first, utility-first vs curiosity-first. REQ-031 requires variants to differ by *hypothesis*, not by clip order; this enum is what makes 'distinct' checkable rather than asserted. Consumed from Phase 3 (`creative-brief-v1`); registered here so the enum registry has one home.
 */
export type HookFamily =
  "outcome_first" | "problem_first" | "proof_first" | "personality_first" | "utility_first" | "curiosity_first";

/**
 * The platform-neutral narrative graph for one CreativeBrief (PRD REQ-033): an ordered sequence of narrative-function beats, the dependencies between them, optional beats, and alternate hook hypotheses. Platform-neutral by construction — crop, caption, and duration decisions belong to the PlatformEDL, not here. REQ-033 refuses to force every format into a fixed five-role arc, so `beats` is a free-length ordered list over the narrative-function vocabulary, not a fixed set of slots. Immutable revision (PRD §5). The model proposes the plan; D-37 keeps it advisory — the deterministic 'required context' gate later checks that a payoff beat is not cut loose from the setup it depends on.
 */
export interface MasterStoryPlan {
  storyPlanId: Ulid;
  envelope: Envelope;
  jobId: string;
  creativeBriefId: Ulid1;
  /**
   * The revision this supersedes, or null for the first (REQ-039).
   */
  parentStoryPlanId: Ulid | null;
  /**
   * The ordered narrative sequence (REQ-033). Each beat names a narrative function, the Moment that fills it, and — per REQ-034 — evidence-linked rationale. `optional` marks a beat the edit can drop under a duration constraint; `alternateMomentIds` exposes REQ-040 alternatives for pivotal beats.
   *
   * @minItems 1
   */
  beats: [StoryBeat, ...StoryBeat[]];
  /**
   * Which beats need which other beats to make sense (REQ-033 dependencies; REQ-018 source dependencies carried up to the story level). The deterministic 'required context' editorial gate (D-37) uses these to refuse an EDL that keeps a payoff but drops its `requires_setup`.
   */
  dependencies: BeatDependency[];
  /**
   * REQ-032 Hook Lab: alternate opening hypotheses over a shared body, each a different `hook-family` bet anchored to a candidate opening beat. Lets the reviewer A/B the opening without re-planning the whole story.
   */
  alternateHooks: AlternateHook[];
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
export interface StoryBeat {
  /**
   * Stable within-plan beat identifier (e.g. `beat-1`), referenced by `dependencies` and `alternateHooks`. Not a ULID: beats are plan-local, not addressable artefacts.
   */
  beatId: string;
  /**
   * Intended sequence position. Explicit (not just array index) so a reorder is a visible field diff; the plan resolver asserts order values are a contiguous permutation.
   */
  order: number;
  function: NarrativeFunction;
  momentId: Ulid2;
  rationale: string;
  basis: BeatBasis;
  /**
   * REQ-033 'optional beats': true if the edit may drop this beat to meet a duration bound without breaking the story.
   */
  optional: boolean;
  /**
   * REQ-040: plausible source alternatives for this beat, especially for hook/proof/payoff/closing. May be empty when none exist.
   */
  alternateMomentIds: Ulid[];
}
export interface ObservedFact {
  kind: "observed_fact";
  observed: string;
}
export interface ModelJudgement {
  kind: "model_judgement";
  inference: string;
}
export interface BeatDependency {
  /**
   * The dependent beat.
   */
  fromBeatId: string;
  /**
   * The beat it depends on.
   */
  toBeatId: string;
  /**
   * Same vocabulary as Moment.sourceDependencies.relation, so story-level and source-level dependencies read alike.
   */
  relation: "requires_setup" | "answers" | "proves" | "continues" | "contradicts";
}
export interface AlternateHook {
  hookFamily: HookFamily;
  /**
   * The beat that would open under this hook hypothesis.
   */
  openingBeatId: string;
  rationale: string;
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
