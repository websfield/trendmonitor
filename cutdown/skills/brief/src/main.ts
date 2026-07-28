import { relative } from 'node:path';
import { join } from 'node:path';

import { ulid } from 'ulid';

import {
  contractValidator,
  fail,
  formatAjvErrors,
  jobDir,
  reject,
  runSkillMain,
  skillEnvelope,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';
import { hashContent } from '@cutdown/contracts';

const SKILL = 'brief';
const VERSION = '1.0.0';

const JOB_BRIEF_ID = 'https://cutdown.local/contracts/schemas/job-brief-v1.json';

/** Phase 0 resolves platform capabilities for TikTok only (decisions.md D-3). */
const PHASE_0_PLATFORMS = new Set(['tiktok']);

interface BriefRequest {
  jobId: string;
  sourcePath?: string | null;
  brief: Record<string, unknown>;
}

interface BriefResult {
  briefId: string;
  jobId: string;
  briefPath: string;
  contentHash: { algorithm: 'sha256'; value: string };
  warnings: string[];
}

/**
 * Report EVERY missing required field at once.
 *
 * Ajv with `allErrors: true` already collects them; the work here is turning
 * validator output into the one thing a non-interactive caller actually needs —
 * the list of field names to add. Failing on the first missing field would make
 * an unattended agent discover REQ-002's requirements one round-trip at a time.
 */
function missingRequiredFields(errors: unknown[]): string[] {
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

async function run(request: BriefRequest, ctx: SkillContext): Promise<BriefResult> {
  const warnings: string[] = [];

  // Fill the envelope and identity before validating, so a hand-written brief
  // does not have to carry machine-generated bookkeeping just to be checked.
  const briefId =
    typeof request.brief['briefId'] === 'string' ? (request.brief['briefId'] as string) : ulid();

  const candidate: Record<string, unknown> = {
    ...request.brief,
    briefId,
    envelope: request.brief['envelope'] ?? skillEnvelope(SKILL, VERSION),
  };

  const ajv = contractValidator();
  const validate = ajv.getSchema(JOB_BRIEF_ID);
  if (!validate) {
    throw fail('CONTRACT_UNAVAILABLE', `Could not load ${JOB_BRIEF_ID}. Run \`cutdown build:contracts\`.`);
  }

  if (!validate(candidate)) {
    const missing = missingRequiredFields(validate.errors ?? []);
    throw reject(
      missing.length > 0 ? 'BRIEF_MISSING_REQUIRED_FIELDS' : 'BRIEF_SCHEMA_INVALID',
      missing.length > 0
        ? `The brief is missing ${missing.length} required field(s): ${missing.join(', ')}. ` +
          `PRD REQ-002 requires an explicit brief — these are never inferred, because an inferred ` +
          `audience or objective silently changes what the whole pipeline optimises for.`
        : `The brief does not satisfy job-brief-v1.`,
      { missingFields: missing, formatted: formatAjvErrors(validate.errors) },
    );
  }

  // --- Cross-field rules the schema subset cannot express -------------------
  // tech-spec §3 forbids `if/then/else`, so anything relating two fields is
  // enforced here. These are contract rules, not preferences.
  const duration = candidate['durationRange'] as { minSeconds: number; maxSeconds: number };
  if (duration.maxSeconds < duration.minSeconds) {
    throw reject(
      'BRIEF_DURATION_RANGE_INVERTED',
      `durationRange.maxSeconds (${duration.maxSeconds}) is less than minSeconds (${duration.minSeconds}).`,
      { durationRange: duration },
    );
  }

  const platforms = candidate['platforms'] as string[];
  const unsupported = platforms.filter((p) => !PHASE_0_PLATFORMS.has(p));
  if (unsupported.length > 0) {
    // A warning, not a block: the brief is legitimate and `propose` can still
    // run against it. `plan` is where the missing capability actually bites, and
    // decisions.md D-3 says it must fail there explicitly rather than fall back
    // to a generic profile. Blocking here would stop work that is still useful.
    warnings.push(
      `Platform(s) ${unsupported.join(', ')} have no Phase 0 capability fixture — only TikTok does (decisions.md D-3). ` +
        `\`cutdown plan --platform ${unsupported[0]}\` will fail explicitly until the Phase 1 registry (REQ-051) lands.`,
    );
  }

  if (platforms.length > 1) {
    warnings.push(
      `${platforms.length} platforms requested: REQ-050 produces one PlatformEDL per platform, so \`plan\` must be run once per platform.`,
    );
  }

  const cta = candidate['cta'] as { kind: string };
  if (cta.kind === 'none') {
    warnings.push('This brief declares no CTA. That is an explicit editorial choice and is carried through to packaging.');
  }

  // --- Commit ---------------------------------------------------------------
  const contentHash = hashContent(candidate);
  const root = jobDir(ctx.workspaceRoot, request.jobId);
  const briefPath = join(root, 'brief', `${briefId}.json`);
  writeJsonAtomic(briefPath, candidate);

  return {
    briefId,
    jobId: request.jobId,
    briefPath: relative(root, briefPath).split('\\').join('/'),
    contentHash,
    warnings,
  };
}

await runSkillMain<BriefRequest, BriefResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
