/**
 * Deterministic JobBrief resolver — a LIBRARY, not a skill (Cutdown Phase 3).
 *
 * The `skills/brief` intake skill owns writing a brief into a job. This is the
 * read side: the propose/plan editorial stages call `resolveJobBrief` to load and
 * validate a JobBrief before they generate anything, so a generation stage never
 * runs against a brief that is missing a required field or contradicts itself.
 *
 * NO model call. It validates against `job-brief-v1` and applies the same
 * cross-field rules `skills/brief/src/main.ts` applies — the ones the JSON Schema
 * subset cannot express (tech-spec §3 forbids `if/then/else`): `maxSeconds >=
 * minSeconds`, and the D-3 TikTok-only capability warning. Every missing required
 * field is reported at once (Ajv `allErrors`), because an unattended agent should
 * not discover REQ-002's requirements one round-trip at a time.
 */

import { readFileSync } from 'node:fs';

import { contractValidator, formatAjvErrors } from '@cutdown/skill-runtime';
import type { JobBriefV1 } from '@cutdown/contracts/generated';

type JobBrief = JobBriefV1.JobBrief;

const JOB_BRIEF_ID = 'https://cutdown.local/contracts/schemas/job-brief-v1.json';

/** Phase 0 resolves platform capabilities for TikTok only (decisions.md D-3). */
export const PHASE_0_PLATFORMS: ReadonlySet<string> = new Set(['tiktok']);

export interface ResolveOk {
  ok: true;
  brief: JobBrief;
  /** Non-blocking advisories: unsupported platforms (D-3), multi-platform, no-CTA. */
  warnings: string[];
}

export interface ResolveErr {
  ok: false;
  /** Every missing REQUIRED field, dotted and sorted. Empty when the failure is not a missing field. */
  missingFields: string[];
  /** Cross-field rule failures the schema subset cannot express (e.g. inverted duration range). */
  crossFieldErrors: string[];
  /** One readable line per Ajv error, for a human. */
  schemaErrors: string;
}

export type ResolveResult = ResolveOk | ResolveErr;

/**
 * Turn Ajv `required` errors into the list of field names to add — the one thing
 * a non-interactive caller actually needs. Mirrors `skills/brief`'s helper.
 */
export function missingRequiredFields(errors: readonly unknown[]): string[] {
  const names = new Set<string>();
  for (const raw of errors) {
    const err = raw as { keyword?: string; params?: { missingProperty?: string }; instancePath?: string };
    if (err.keyword === 'required' && err.params?.missingProperty) {
      const prefix = err.instancePath ? `${err.instancePath.replace(/^\//, '').replace(/\//g, '.')}.` : '';
      names.add(`${prefix}${err.params.missingProperty}`);
    }
  }
  return [...names].sort();
}

/**
 * Validate and cross-check a JobBrief. The brief is validated AS GIVEN — this is
 * the read side, so envelope/id bookkeeping is expected to be present already
 * (the intake skill wrote it). A schema failure returns the missing-field report;
 * a schema-valid brief that fails a cross-field rule returns those errors.
 */
export function resolveJobBrief(brief: unknown): ResolveResult {
  const ajv = contractValidator();
  const validate = ajv.getSchema(JOB_BRIEF_ID);
  if (!validate) {
    // A build-config failure, not a caller failure — surface it loudly.
    throw new Error(`Could not load ${JOB_BRIEF_ID} on the contract validator. Run \`cutdown build:contracts\`.`);
  }

  if (!validate(brief)) {
    return {
      ok: false,
      missingFields: missingRequiredFields(validate.errors ?? []),
      crossFieldErrors: [],
      schemaErrors: formatAjvErrors(validate.errors),
    };
  }

  // Past this point every field is present and well-typed.
  const valid = brief as JobBrief;
  const crossFieldErrors: string[] = [];

  const { minSeconds, maxSeconds } = valid.durationRange;
  if (maxSeconds < minSeconds) {
    crossFieldErrors.push(`durationRange.maxSeconds (${maxSeconds}) is less than minSeconds (${minSeconds}).`);
  }

  if (crossFieldErrors.length > 0) {
    return { ok: false, missingFields: [], crossFieldErrors, schemaErrors: '(schema valid; cross-field rule failed)' };
  }

  const warnings: string[] = [];
  const unsupported = valid.platforms.filter((p) => !PHASE_0_PLATFORMS.has(p));
  if (unsupported.length > 0) {
    warnings.push(
      `Platform(s) ${unsupported.join(', ')} have no Phase 0 capability fixture — only TikTok does (decisions.md D-3). ` +
        `\`cutdown plan --platform ${unsupported[0]}\` will fail explicitly until the Phase 1 registry (REQ-051) lands.`,
    );
  }
  if (valid.platforms.length > 1) {
    warnings.push(
      `${valid.platforms.length} platforms requested: REQ-050 produces one PlatformEDL per platform, so \`plan\` runs once per platform.`,
    );
  }
  if (valid.cta.kind === 'none') {
    warnings.push('This brief declares no CTA — an explicit editorial choice, carried through to packaging.');
  }

  return { ok: true, brief: valid, warnings };
}

/**
 * Load a brief JSON from disk (e.g. a job dir's `brief/<id>.json`) as an unknown
 * value ready for `resolveJobBrief`. Kept separate from validation so a read
 * error and a validation error stay distinguishable to the caller.
 */
export function readBriefFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
