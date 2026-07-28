import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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

/** `project-data/jobs/<job-id>/` — gitignored; holds real, rights-sensitive state. */
export function jobDir(jobId: string): string {
  return join(JOBS_ROOT, jobId);
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
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(jobId) || jobId.includes('..')) {
    throw new Error(
      `Invalid job id ${JSON.stringify(jobId)}. Use letters, digits, dot, dash, or underscore (max 64 chars); it becomes a directory name.`,
    );
  }
}
