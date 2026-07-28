/**
 * Shared contract-schema validation for the editorial modules.
 *
 * The MODEL PROPOSES; deterministic code VALIDATES (decisions.md D-37). Every
 * editorial artefact the model produces — CreativeBrief, MasterStoryPlan,
 * PlatformEDL — is checked against its `*-v1` contract before any structural
 * rule runs, using the one shared Ajv the skill runtime builds. The instance is
 * cached because compiling every contract schema on each call would be wasteful
 * across the propose/plan/EDL passes.
 */

import { contractValidator, formatAjvErrors } from '@cutdown/skill-runtime';

export const CREATIVE_BRIEF_ID = 'https://cutdown.local/contracts/schemas/creative-brief-v1.json';
export const MASTER_STORY_PLAN_ID = 'https://cutdown.local/contracts/schemas/master-story-plan-v1.json';
export const PLATFORM_EDL_ID = 'https://cutdown.local/contracts/schemas/platform-edl-v1.json';

let cached: ReturnType<typeof contractValidator> | null = null;

function ajv(): ReturnType<typeof contractValidator> {
  if (cached === null) cached = contractValidator();
  return cached;
}

/**
 * Validate `value` against the contract schema at `schemaId`. Returns one
 * readable violation line per Ajv error, or an empty array when it conforms.
 * Throws only when the schema itself could not be loaded — a build-config fault,
 * not a data fault.
 */
export function validateAgainstSchema(schemaId: string, value: unknown): string[] {
  const validate = ajv().getSchema(schemaId);
  if (!validate) {
    throw new Error(`Could not load ${schemaId} on the contract validator. Run \`cutdown build:contracts\`.`);
  }
  if (validate(value)) return [];
  const formatted = formatAjvErrors(validate.errors);
  return formatted === '(no detail)' ? ['schema validation failed with no detail'] : formatted.split('\n').map((s) => s.trim()).filter(Boolean);
}
