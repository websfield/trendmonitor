/**
 * Angle-generator core — the deterministic scaffolding the `propose` skill uses
 * (Cutdown Phase 3, PRD REQ-030/031/034/036). The skill itself is built later;
 * this module owns the PURE parts, so the model-facing skill stays a thin shell
 * over decisions that are all made in verifiable code (decisions.md D-37).
 *
 * What lives here:
 *  - `buildProposePrompt` — assemble the gateway prompt inputs from a JobBrief +
 *    ranked Moments (deterministic, stable ordering).
 *  - `validateProposedCreativeBriefs` — validate model-proposed CreativeBriefs
 *    against `creative-brief-v1` AND assert every referenced Moment ID is one the
 *    input offered (REQ-034 evidence links have teeth; a hallucinated Moment ID is
 *    a hard reject, never a silent pass).
 *  - `computeDistinctness` — REQ-031 distinctness, computed IN CODE across the
 *    returned set (shared-moment fraction + angle labels), never taken from the
 *    model. Unit-tested.
 *  - `assessFootageSufficiency` — the REQ-036 weak-footage refusal DECISION as a
 *    deterministic pre-check the skill uses to choose refuse-vs-generate. (The
 *    refusal OUTPUT object shape belongs to the propose skill's schema, later.)
 */

import type { ContentBlock } from './gateway.js';
import type { RankedMoment } from './retrieval.js';
import { CREATIVE_BRIEF_ID, validateAgainstSchema } from './schema.js';

import type { CreativeBriefV1, JobBriefV1, StyleProfileV1 } from '@cutdown/contracts/generated';

type CreativeBrief = CreativeBriefV1.CreativeBrief;
type Distinctness = CreativeBriefV1.Distinctness;
type JobBrief = JobBriefV1.JobBrief;
type StyleProfile = StyleProfileV1.StyleProfile;

// --- prompt assembly --------------------------------------------------------

export interface ProposePromptInputs {
  brief: JobBrief;
  rankedMoments: readonly RankedMoment[];
  /** Brand invariants injected into the prompt when a profile is selected (REQ-060). */
  styleProfile?: StyleProfile;
  /** Cap on how many candidate Moments to place in the prompt (rankable ones first). */
  maxMoments?: number;
}

export interface ProposePrompt {
  system: string;
  content: ContentBlock[];
}

/**
 * Assemble the deterministic inputs for a `propose` model call. The system turn
 * states the constraints the deterministic validators will ENFORCE afterwards
 * (so the model is told the rules it cannot break), and the content turn carries
 * a stable JSON snapshot of the brief and the candidate Moments. Distinctness is
 * explicitly NOT asked of the model — the system computes it (REQ-031).
 */
export function buildProposePrompt(inputs: ProposePromptInputs): ProposePrompt {
  const { brief, rankedMoments } = inputs;
  const cap = inputs.maxMoments ?? rankedMoments.length;
  const candidates = rankedMoments.slice(0, Math.max(0, cap)).map((ranked) => ({
    momentId: ranked.moment.momentId,
    rank: ranked.rank,
    score: ranked.score,
    durationSeconds: ranked.moment.durationSeconds,
    transcript: ranked.moment.transcript.displayText,
    candidateFunctions: ranked.moment.candidateNarrativeFunctions.map((c) => c.function),
    speakers: ranked.moment.speakers.map((s) => ({ label: s.label, isCorrected: s.isCorrected })),
    rightsState: ranked.moment.rights.state,
  }));

  // The shape below is creative-brief-v1's model-supplied subset, spelled out
  // field by field. The first live run proved a shapeless "editorial content of
  // each angle" ask fails validation twice: the model invented its own keys
  // (`observed_fact`/`model_judgement` as properties instead of `basis.kind`
  // values) because nothing told it the enforced names. Recorded fixtures are
  // hand-authored in the right shape, so only a live call can catch drift here —
  // keep this block in sync with creative-brief-v1.json.
  const system =
    'You are an editorial strategist proposing distinct short-video angles for a client brief. ' +
    'Return ONLY a JSON object of EXACTLY this shape — no prose, no markdown fence: ' +
    '{"angles": [{' +
    '"audiencePromise": string, ' +
    '"creativeThesis": string, ' +
    '"hookFamily": one of "outcome_first"|"problem_first"|"proof_first"|"personality_first"|"utility_first"|"curiosity_first", ' +
    '"narrativeArchetype": string, ' +
    '"value": string (the emotional or practical value delivered), ' +
    '"semanticAngleLabel": string (a short label naming this angle), ' +
    '"proofPoints": [{"claim": string, "evidenceMomentIds": [string, ...], "basis": {"kind": "observed_fact", "observed": string} OR {"kind": "model_judgement", "inference": string}}, ...], ' +
    '"selectedMoments": [{"momentId": string, "candidateFunction": one of "promise"|"context"|"proof"|"escalation"|"demonstration"|"objection"|"payoff"|"invitation"|"cta", "rationale": string}, ...], ' +
    '"cta": {"kind": "none"} OR {"kind": "cta", "text": string}, ' +
    '"knownLimitations": [string, ...]' +
    '}, ...]}. ' +
    'Hard rules enforced deterministically after you answer (breaking them rejects your output): ' +
    'return EXACTLY brief.variantCount angles; every momentId is one provided in candidateMoments; ' +
    'each proofPoint links >=1 evidence momentId, and every evidenceMomentId MUST also appear in that same angle\'s selectedMoments ' +
    '(the downstream edit can only cut selected Moments, and the editorial gate blocks any EDL missing a cited evidence Moment); ' +
    'a basis of kind "observed_fact" names what is literally on screen, "model_judgement" names your inference; ' +
    'angles must differ by creative thesis or audience promise, not by clip order (REQ-031). ' +
    'Do NOT compute distinctness or invent Moment IDs — the system does the former and forbids the latter.';

  const payload = {
    brief: {
      audience: brief.audience,
      objective: brief.objective,
      contentPromise: brief.contentPromise,
      brandOrCampaign: brief.brandOrCampaign,
      cta: brief.cta,
      variantCount: brief.variantCount,
      durationRange: brief.durationRange,
      proofRequirements: brief.proofRequirements ?? [],
      prohibitedClaims: brief.prohibitedClaims ?? [],
    },
    styleProfile: inputs.styleProfile
      ? {
          toneDescriptors: inputs.styleProfile.toneOfVoice.descriptors,
          prohibitedClaims: inputs.styleProfile.prohibitedClaims,
          prohibitedTreatments: inputs.styleProfile.prohibitedTreatments,
        }
      : null,
    candidateMoments: candidates,
  };

  return { system, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

// --- Moment-ID integrity ----------------------------------------------------

/** Every Moment ID a CreativeBrief references — selected Moments plus proof-point evidence. */
export function referencedMomentIds(brief: CreativeBrief): Set<string> {
  const ids = new Set<string>();
  for (const m of brief.selectedMoments) ids.add(m.momentId);
  for (const p of brief.proofPoints) for (const e of p.evidenceMomentIds) ids.add(e);
  return ids;
}

/** Referenced-but-not-offered Moment IDs, per brief. Empty means all references resolve. */
export function momentsNotInInput(brief: CreativeBrief, inputMomentIds: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const id of referencedMomentIds(brief)) {
    if (!inputMomentIds.has(id)) missing.push(id);
  }
  return missing.sort();
}

export interface CreativeBriefViolation {
  /** Position in the proposed set, so a failure names WHICH angle. */
  index: number;
  code: 'SCHEMA_INVALID' | 'MOMENT_NOT_IN_INPUT';
  message: string;
}

export interface ProposedBriefsResult {
  ok: boolean;
  violations: CreativeBriefViolation[];
}

/**
 * Validate model-proposed CreativeBriefs against `creative-brief-v1` and assert
 * every referenced Moment ID was offered in the input. Both checks are hard: a
 * schema-invalid brief and a brief citing a Moment that does not exist are each a
 * reject, never a silent pass. Returns all violations (no short-circuit), so a
 * reviewer sees every problem at once.
 */
export function validateProposedCreativeBriefs(briefs: readonly unknown[], inputMomentIds: ReadonlySet<string>): ProposedBriefsResult {
  const violations: CreativeBriefViolation[] = [];
  briefs.forEach((candidate, index) => {
    const schemaErrors = validateAgainstSchema(CREATIVE_BRIEF_ID, candidate);
    if (schemaErrors.length > 0) {
      violations.push({ index, code: 'SCHEMA_INVALID', message: schemaErrors.join('; ') });
      return; // Moment-ID checks below assume a structurally valid brief.
    }
    const missing = momentsNotInInput(candidate as CreativeBrief, inputMomentIds);
    if (missing.length > 0) {
      violations.push({
        index,
        code: 'MOMENT_NOT_IN_INPUT',
        message: `Angle references Moment ID(s) not offered in the input: ${missing.join(', ')}. A hallucinated Moment reference is a hard reject (REQ-034).`,
      });
    }
  });
  return { ok: violations.length === 0, violations };
}

// --- distinctness (REQ-031) -------------------------------------------------

export interface DistinctnessInput {
  /** Stable within-run label (e.g. `angle-1`), assigned by the system, not the model. */
  label: string;
  selectedMomentIds: readonly string[];
  semanticAngleLabel: string;
}

export interface DistinctnessResult {
  label: string;
  distinctness: Distinctness;
}

/**
 * Compute REQ-031 distinctness across a proposed set. For each brief: the peer
 * labels it was compared against, and the fraction of ITS selected Moments that
 * also appear in at least one peer. High overlap with a distinct thesis is fine;
 * high overlap with a similar thesis is the smell the critic surfaces. Computed
 * in code so "deliberately distinct" is data, never a model claim.
 */
export function computeDistinctness(briefs: readonly DistinctnessInput[]): DistinctnessResult[] {
  return briefs.map((brief, i) => {
    const peers = briefs.filter((_, j) => j !== i);
    const peerBriefLabels = peers.map((p) => p.label);
    const own = new Set(brief.selectedMomentIds);
    const peerUnion = new Set<string>();
    for (const peer of peers) for (const id of peer.selectedMomentIds) peerUnion.add(id);

    let shared = 0;
    for (const id of own) if (peerUnion.has(id)) shared += 1;
    const sharedMomentFraction = own.size === 0 ? 0 : shared / own.size;

    return {
      label: brief.label,
      distinctness: { peerBriefLabels, sharedMomentFraction, semanticAngleLabel: brief.semanticAngleLabel },
    };
  });
}

/** Build a `DistinctnessInput` from a CreativeBrief-shaped object. */
export function distinctnessInputFrom(brief: CreativeBrief, label: string): DistinctnessInput {
  return {
    label,
    selectedMomentIds: brief.selectedMoments.map((m) => m.momentId),
    semanticAngleLabel: brief.distinctness.semanticAngleLabel,
  };
}

// --- weak-footage refusal (REQ-036) -----------------------------------------

export interface FootageSufficiencyOptions {
  /** Minimum rankable Moments before any distinct angle is viable. Default 3. */
  minRankableMoments?: number;
  /** Rankable Moments needed per requested variant. Default 2. */
  minMomentsPerVariant?: number;
}

export type FootageSufficiency =
  | { sufficient: true }
  | { sufficient: false; missing: string[]; narrowerSuggestion: string };

/**
 * The REQ-036 refuse-vs-generate DECISION as a deterministic pre-check. "Fewer
 * with a reason beats a padded weak cut": if the indexed footage cannot support
 * the requested count of genuinely distinct angles, the skill should refuse (or
 * offer fewer) rather than pad. Only Moments with an embedding are counted —
 * a null-embedding Moment cannot be retrieved against the brief, so it cannot
 * carry an angle. The refusal object itself is the skill's; this returns only the
 * decision and the reasons.
 */
export function assessFootageSufficiency(
  brief: JobBrief,
  rankedMoments: readonly RankedMoment[],
  opts: FootageSufficiencyOptions = {},
): FootageSufficiency {
  const minRankable = opts.minRankableMoments ?? 3;
  const minPerVariant = opts.minMomentsPerVariant ?? 2;

  const rankable = rankedMoments.filter((r) => r.score !== null).length;
  const required = Math.max(minRankable, brief.variantCount * minPerVariant);

  if (rankable >= required) return { sufficient: true };

  const feasibleVariants = Math.max(1, Math.floor(rankable / minPerVariant));
  const missing: string[] = [
    `Only ${rankable} usable indexed Moment(s) available; supporting ${brief.variantCount} distinct angle(s) needs at least ${required}.`,
  ];
  if (rankable === 0) {
    missing.push('No Moment with a transcript embedding was retrieved for this brief.');
  }
  const narrowerSuggestion =
    rankable === 0
      ? 'Index more source footage, or narrow the audience/objective so the brief matches the footage you have — do not generate a padded angle from nothing (REQ-036).'
      : `Request fewer variants (up to ${feasibleVariants}) or index more source footage; a narrower audience/objective concentrates the available Moments into one strong angle rather than several weak ones.`;

  return { sufficient: false, missing, narrowerSuggestion };
}
