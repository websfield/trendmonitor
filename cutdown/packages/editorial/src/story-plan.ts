/**
 * Story-plan core — the deterministic scaffolding the `plan` skill uses to turn a
 * CreativeBrief into a MasterStoryPlan (Cutdown Phase 3, PRD REQ-033/034/040).
 *
 * The model PROPOSES the narrative graph; D-37 keeps it advisory. This module
 * assembles the prompt and owns the structural checks the schema cannot express:
 * a beat may only fill itself with a Moment the CreativeBrief selected; `order`
 * values must be a contiguous permutation; and every dependency must reference a
 * beat that exists — a dependency on a phantom beat is exactly how the later
 * "required context" gate would be silently defeated.
 */

import type { ContentBlock } from './gateway.js';
import { MASTER_STORY_PLAN_ID, validateAgainstSchema } from './schema.js';
import { contiguousPermutation } from './util.js';

import type { CreativeBriefV1, MasterStoryPlanV1 } from '@cutdown/contracts/generated';

type CreativeBrief = CreativeBriefV1.CreativeBrief;
type MasterStoryPlan = MasterStoryPlanV1.MasterStoryPlan;

export interface StoryPlanViolation {
  code:
    | 'BEAT_MOMENT_NOT_SELECTED'
    | 'ORDER_NOT_CONTIGUOUS'
    | 'DUPLICATE_BEAT_ID'
    | 'DEPENDENCY_UNKNOWN_BEAT'
    | 'ALTERNATE_HOOK_UNKNOWN_BEAT';
  message: string;
}

export interface StoryPlanPromptInputs {
  creativeBrief: CreativeBrief;
}

export interface StoryPlanPrompt {
  system: string;
  content: ContentBlock[];
}

/** Assemble the deterministic `plan` prompt from a CreativeBrief. */
export function buildStoryPlanPrompt(inputs: StoryPlanPromptInputs): StoryPlanPrompt {
  const { creativeBrief } = inputs;
  // The shape is master-story-plan-v1's model-supplied subset, spelled out field
  // by field — a shapeless ask fails schema validation live (the propose prompt
  // proved this class of defect); recorded fixtures are hand-authored in the
  // right shape and cannot catch it. Keep in sync with master-story-plan-v1.json.
  const system =
    'You are a story editor composing a platform-neutral narrative graph for one approved angle. ' +
    'Return ONLY a JSON object of EXACTLY this shape — no prose, no markdown fence: ' +
    '{"beats": [{' +
    '"beatId": string (plan-local, e.g. "beat-1"), ' +
    '"order": integer (0-based, contiguous, no gaps or duplicates), ' +
    '"function": one of "promise"|"context"|"proof"|"escalation"|"demonstration"|"objection"|"payoff"|"invitation"|"cta", ' +
    '"momentId": string, ' +
    '"rationale": string, ' +
    '"basis": {"kind": "observed_fact", "observed": string} OR {"kind": "model_judgement", "inference": string}, ' +
    '"optional": boolean (true if the edit may drop this beat under a duration bound), ' +
    '"alternateMomentIds": [string, ...] (may be [])' +
    '}, ...], ' +
    '"dependencies": [{"fromBeatId": string, "toBeatId": string, "relation": one of "requires_setup"|"answers"|"proves"|"continues"|"contradicts"}, ...], ' +
    '"alternateHooks": [{"hookFamily": one of "outcome_first"|"problem_first"|"proof_first"|"personality_first"|"utility_first"|"curiosity_first", "openingBeatId": string, "rationale": string}, ...]}. ' +
    'Rules enforced deterministically after you answer: every beat.momentId and every alternateMomentId MUST be one of the ' +
    'selected Moment IDs below; order values MUST be a contiguous run with no gaps or duplicates; ' +
    'every dependency and alternateHook MUST reference beat IDs you define; ' +
    'every Moment cited in proofPoints[].evidenceMomentIds MUST fill at least one beat — the downstream editorial gate ' +
    'blocks an edit that drops a claim\'s evidence (REQ-034). Crop, caption and duration decisions do ' +
    'NOT belong here — they are the PlatformEDL (REQ-033).';

  const payload = {
    creativeThesis: creativeBrief.creativeThesis,
    audiencePromise: creativeBrief.audiencePromise,
    narrativeArchetype: creativeBrief.narrativeArchetype,
    hookFamily: creativeBrief.hookFamily,
    selectedMoments: creativeBrief.selectedMoments.map((m) => ({
      momentId: m.momentId,
      candidateFunction: m.candidateFunction,
      rationale: m.rationale,
    })),
    // The gate's required-evidence check is per evidenceMomentId — the planner
    // cannot honour a rule it was never shown (a live run failed exactly here).
    proofPoints: creativeBrief.proofPoints.map((p) => ({ claim: p.claim, evidenceMomentIds: p.evidenceMomentIds })),
  };

  return { system, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Structural validation of a MasterStoryPlan against the CreativeBrief it derives
 * from. Assumes the plan is already schema-valid (validate against
 * `master-story-plan-v1` first, via `validateStoryPlanSchema`); this checks the
 * cross-object rules the JSON Schema subset cannot express. Every violation is
 * collected (no short-circuit).
 */
export function validateStoryPlanStructure(plan: MasterStoryPlan, creativeBrief: CreativeBrief): StoryPlanViolation[] {
  const violations: StoryPlanViolation[] = [];

  const selectedMomentIds = new Set(creativeBrief.selectedMoments.map((m) => m.momentId));
  const beatIds = new Set<string>();

  for (const beat of plan.beats) {
    if (beatIds.has(beat.beatId)) {
      violations.push({ code: 'DUPLICATE_BEAT_ID', message: `Beat id ${beat.beatId} appears more than once; beat ids must be unique within a plan.` });
    }
    beatIds.add(beat.beatId);
    if (!selectedMomentIds.has(beat.momentId)) {
      violations.push({
        code: 'BEAT_MOMENT_NOT_SELECTED',
        message: `Beat ${beat.beatId} fills itself with Moment ${beat.momentId}, which the CreativeBrief did not select. A plan may only use the angle's selected Moments (REQ-033).`,
      });
    }
  }

  const orderCheck = contiguousPermutation(plan.beats.map((b) => b.order));
  if (!orderCheck.ok) {
    violations.push({ code: 'ORDER_NOT_CONTIGUOUS', message: `Beat ${orderCheck.message}` });
  }

  for (const dep of plan.dependencies) {
    if (!beatIds.has(dep.fromBeatId)) {
      violations.push({ code: 'DEPENDENCY_UNKNOWN_BEAT', message: `Dependency references unknown fromBeatId ${dep.fromBeatId}.` });
    }
    if (!beatIds.has(dep.toBeatId)) {
      violations.push({ code: 'DEPENDENCY_UNKNOWN_BEAT', message: `Dependency references unknown toBeatId ${dep.toBeatId}.` });
    }
  }

  for (const hook of plan.alternateHooks) {
    if (!beatIds.has(hook.openingBeatId)) {
      violations.push({ code: 'ALTERNATE_HOOK_UNKNOWN_BEAT', message: `Alternate hook references unknown openingBeatId ${hook.openingBeatId}.` });
    }
  }

  return violations;
}

/** Validate a proposed MasterStoryPlan against `master-story-plan-v1`. */
export function validateStoryPlanSchema(plan: unknown): string[] {
  return validateAgainstSchema(MASTER_STORY_PLAN_ID, plan);
}
