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
 * Which opening hypothesis this angle tests (REQ-032 Hook Lab). The enum is what makes 'distinct hook' checkable (REQ-031).
 */
export type HookFamily =
  "outcome_first" | "problem_first" | "proof_first" | "personality_first" | "utility_first" | "curiosity_first";
/**
 * REQ-034: rationales must distinguish observed facts from model judgement. A tagged union, not a boolean, so the rationale text is bound to the kind — an 'observed_fact' names what was seen on screen, a 'model_judgement' names the inference.
 */
export type ProofBasis = ObservedFact | ModelJudgement;
/**
 * Ordered narrative roles a MasterStoryPlan composes, and the candidate roles a Moment may serve (PRD REQ-033, REQ-018). Members are REQ-033's list verbatim — 'promise, context, proof, escalation, demonstration, objection, payoff, invitation, or CTA'. REQ-033 explicitly refuses to force every format into a fixed five-role arc, so this is an unordered vocabulary, not a sequence.
 */
export type NarrativeFunction =
  "promise" | "context" | "proof" | "escalation" | "demonstration" | "objection" | "payoff" | "invitation" | "cta";
/**
 * This angle's CTA, or an explicit declaration of none (REQ-030 'CTA logic'). Same tagged-union shape as JobBrief.cta so 'we chose no CTA' and 'nobody decided' stay distinct.
 */
export type CtaLogic = NoCta | PrimaryCta;

/**
 * One proposed angle for a job (PRD REQ-030): an audience promise, a hook family, a narrative archetype, evidence-linked proof points, the value delivered, CTA logic, the selected candidate Moments, and known limitations. `propose` returns N of these; REQ-031 requires them to differ by creative thesis, so each carries `distinctness` metadata recording moment overlap and angle. Immutable revision (PRD §5): a revision is a new object with `parentCreativeBriefId` set, never an in-place edit. The model PROPOSES this brief; nothing here is a blocking decision — D-37 keeps model output advisory. REQ-036 refusals are NOT a CreativeBrief; they are the `propose` skill's separate refusal output variant.
 */
export interface CreativeBrief {
  creativeBriefId: Ulid;
  envelope: Envelope;
  jobId: string;
  sourceBriefId: Ulid1;
  /**
   * The CreativeBrief revision this supersedes, or null for the first (REQ-039 revision-without-reindexing lineage).
   */
  parentCreativeBriefId: Ulid | null;
  /**
   * What THIS angle promises the viewer (REQ-030). REQ-031 lets variants differ on promise OR thesis; the pair below records both so distinctness is auditable.
   */
  audiencePromise: string;
  /**
   * The angle's core argument (REQ-030 'angle'). REQ-031: variants must differ here or in `audiencePromise` — not merely in clip order or caption colour.
   */
  creativeThesis: string;
  hookFamily: HookFamily;
  /**
   * The story shape this angle uses (REQ-030 'narrative archetype'). Free text, not an enum: archetypes are an open vocabulary at Phase 0 and REQ-033 refuses a fixed arc.
   */
  narrativeArchetype: string;
  /**
   * The emotional or practical value delivered (REQ-030 'emotional or practical value / desired feeling').
   */
  value: string;
  /**
   * Claims this angle makes and the on-screen evidence for each (REQ-034 evidence-linked decisions). Every proof point links to the Moments that evidence it; the deterministic editorial gate (D-37) later blocks an EDL whose required-evidence links do not resolve, so this list has teeth.
   */
  proofPoints: ProofPoint[];
  /**
   * The candidate Moments this angle draws on (REQ-030 'selected source moments'). Each names the narrative function it is proposed to serve — a candidate role, not a committed one; the story planner (`plan`) chooses.
   *
   * @minItems 1
   */
  selectedMoments: [SelectedMoment, ...SelectedMoment[]];
  cta: CtaLogic;
  distinctness: Distinctness;
  /**
   * What this angle cannot fully deliver from the available footage (REQ-030 'known limitations'). An honest limitation here is the constructive half of REQ-036: fewer-with-a-reason beats a padded weak cut.
   */
  knownLimitations: string[];
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
export interface ProofPoint {
  claim: string;
  /**
   * Moments that evidence the claim. minItems 1: a proof point with no evidence is not a proof point.
   *
   * @minItems 1
   */
  evidenceMomentIds: [Ulid, ...Ulid[]];
  basis: ProofBasis;
}
export interface ObservedFact {
  kind: "observed_fact";
  /**
   * What is literally present in the footage (spoken words, on-screen text, a shown action).
   */
  observed: string;
}
export interface ModelJudgement {
  kind: "model_judgement";
  /**
   * The model's interpretation — advisory only (D-37), never a blocking signal.
   */
  inference: string;
}
export interface SelectedMoment {
  momentId: Ulid;
  candidateFunction: NarrativeFunction;
  rationale: string;
}
export interface NoCta {
  kind: "none";
}
export interface PrimaryCta {
  kind: "cta";
  text: string;
}
/**
 * REQ-031: the system records overlap in source moments and semantic angle so 'deliberately distinct' is data, not a claim. Computed by `propose` across the returned set; peer references let a reviewer see which briefs are near-duplicates.
 */
export interface Distinctness {
  /**
   * Stable labels of the sibling briefs this one was compared against within the same `propose` run (e.g. `angle-1`, `angle-2`). Labels not IDs, because siblings are all minted in one run and their IDs are not known to each other at generation time.
   */
  peerBriefLabels: string[];
  /**
   * Fraction of this brief's selected Moments that also appear in at least one peer brief. High overlap with a distinct thesis is fine; high overlap with a similar thesis is the REQ-031 smell the critic surfaces.
   */
  sharedMomentFraction: number;
  /**
   * A short human-readable label for this brief's angle, used for quick side-by-side distinctness reading.
   */
  semanticAngleLabel: string;
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
