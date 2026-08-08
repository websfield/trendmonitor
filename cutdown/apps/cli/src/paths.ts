import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

import { inputInvalid } from './errors.js';

/** Identity stamped on this module's structured refusals (tech-spec §6.2). */
const CLI_SKILL = 'cutdown-cli';
const CLI_SKILL_VERSION = '1.0.0';

/**
 * Cutdown workspace layout (tech-spec §2, §9.1), resolved from this module's
 * own location rather than `process.cwd()` — skills are spawned with the SKILL
 * directory as cwd (§6.2), so cwd tells you nothing reliable about where the
 * workspace root is.
 */
const here = dirname(fileURLToPath(import.meta.url));

/** `cutdown/` — up out of `apps/cli/dist/src/`. */
export const WORKSPACE_ROOT = resolve(here, '..', '..', '..', '..');

export const SKILLS_ROOT = join(WORKSPACE_ROOT, 'skills');
export const DATA_ROOT = join(WORKSPACE_ROOT, 'data');
export const PROJECT_DATA_ROOT = join(WORKSPACE_ROOT, 'project-data');
export const JOBS_ROOT = join(PROJECT_DATA_ROOT, 'jobs');

/**
 * `project-data/index.db` — the local runner's SQLite PROJECTION of the run
 * logs (tech-spec §8). Gitignored with the rest of `project-data/`; deleting it
 * loses zero job state because `cutdown rebuild-index` replays the run logs.
 */
export const INDEX_DB = join(PROJECT_DATA_ROOT, 'index.db');

/**
 * `project-data/jobs/<job-id>/` — gitignored; holds real, rights-sensitive state.
 *
 * GUARDED, like its twin in `@cutdown/skill-runtime`. Every current caller happens to
 * call `assertSafeJobId` first, so there was no live exploit — but an unguarded
 * path-builder sitting beside a guarded one is exactly the asymmetry that produced
 * the round-1 bypass, and "every caller happens to" is not an invariant.
 */
export function jobDir(jobId: string): string {
  assertSafeJobId(jobId);
  const dir = join(JOBS_ROOT, jobId);
  const prefix = JOBS_ROOT.endsWith(sep) ? JOBS_ROOT : `${JOBS_ROOT}${sep}`;
  if (!resolve(dir).startsWith(prefix)) {
    throw inputInvalid({
      code: 'PATH_ESCAPES_ROOT',
      message: `Job directory for ${JSON.stringify(jobId)} resolves outside ${JOBS_ROOT}.`,
      skill: CLI_SKILL,
      skillVersion: CLI_SKILL_VERSION,
      details: { value: jobId, what: 'job id' },
    });
  }
  return dir;
}

/** The per-job subdirectories of tech-spec §9.1. */
export function jobPaths(jobId: string) {
  const root = jobDir(jobId);
  return {
    root,
    brief: join(root, 'brief'),
    source: join(root, 'source'),
    proxy: join(root, 'proxy'),
    index: join(root, 'index'),
    moments: join(root, 'moments'),
    creativeBriefs: join(root, 'creative-briefs'),
    storyPlans: join(root, 'story-plans'),
    edl: join(root, 'edl'),
    renders: join(root, 'renders'),
    packages: join(root, 'packages'),
    reviews: join(root, 'reviews'),
    requests: join(root, 'requests'),
    results: join(root, 'results'),
    traces: join(root, 'traces'),
    runLog: join(root, 'run-log.jsonl'),
  } as const;
}

/**
 * Reject a job id that could escape the jobs directory.
 *
 * A job id becomes a directory name, and it arrives from a CLI argument or from
 * free text a conversational agent turned into a request. `../..` would put
 * client footage somewhere nobody is looking for it.
 */
export function assertSafeJobId(jobId: string): void {
  // STRUCTURED refusals, not bare `Error`s. `reportError` classifies anything
  // that is not a `CutdownError` as `UNEXPECTED_ERROR`, exit 1, with
  // `details.stack` — so a rejected job id used to print a stack trace with
  // absolute local paths onto the stream four callers parse, and left them
  // unable to tell "your id was invalid" from "the CLI crashed". The other two
  // mirrors of this guard both refuse with a code and exit 2 (tech-spec §6.2);
  // this one now matches them.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(jobId) || jobId.includes('..')) {
    throw inputInvalid({
      code: 'UNSAFE_ID',
      message: `Invalid job id ${JSON.stringify(jobId)}. Use letters, digits, dot, dash, or underscore (max 64 chars); it becomes a directory name.`,
      skill: CLI_SKILL,
      skillVersion: CLI_SKILL_VERSION,
      details: { value: jobId, what: 'job id' },
    });
  }
  // Windows reserved device names — see the note on `WINDOWS_RESERVED_DEVICE` in
  // `@cutdown/skill-runtime` for the measurements behind this.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(jobId)) {
    throw inputInvalid({
      code: 'UNSAFE_ID',
      message: `Invalid job id ${JSON.stringify(jobId)}: it names a device in the Windows reserved namespace, and it becomes a directory name. \`nul\` is the worst case — the directory appears to be created and then every write inside it fails with "no such file or directory" — and the rest are unreliable across Windows builds and APIs.`,
      skill: CLI_SKILL,
      skillVersion: CLI_SKILL_VERSION,
      details: { value: jobId, what: 'job id' },
    });
  }
}
