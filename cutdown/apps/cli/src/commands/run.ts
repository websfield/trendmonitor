import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  Runner,
  ProjectionDb,
  parseRunLog,
  type RunnerEnv,
  type StepInvoker,
  type StepOutcome,
  type SkillInvocationEntry,
  type PipelineStep,
} from '@cutdown/workflow-local';

import { INDEX_DB, JOBS_ROOT, SKILLS_ROOT, assertSafeJobId, jobPaths } from '../paths.js';
import { invokeSkill } from './skill-invocation.js';
import { CutdownError } from '../errors.js';

/**
 * `cutdown run <job-id>` and `cutdown rebuild-index [<job-id>]` — the local
 * durable workflow runner's operator surface (tech-spec §8).
 *
 * The runner core lives in `@cutdown/workflow-local` and knows nothing about
 * paths or skills. This file supplies the three real dependencies: how to read
 * a job's authoritative run log, how to enumerate jobs, and how to invoke one
 * pipeline step against a real skill (deriving its request from prior recorded
 * outputs). The projection database is a disposable cache under `project-data/`.
 */

/** decisions.md D-3 fixes the Phase 0 platform; the runner never guesses another. */
const PHASE0_PLATFORM = 'tiktok';
/** A sensible Phase 0 default for an unattended `propose`; a human can re-run with more. */
const DEFAULT_VARIANTS = 3;

/** Build the path-aware environment the runner core needs. */
function makeEnv(): RunnerEnv {
  return {
    readRunLog(jobId: string): SkillInvocationEntry[] {
      const path = jobPaths(jobId).runLog;
      if (!existsSync(path)) return [];
      return parseRunLog(readFileSync(path, 'utf8'));
    },
    listJobIds(): string[] {
      if (!existsSync(JOBS_ROOT)) return [];
      return readdirSync(JOBS_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(JOBS_ROOT, e.name, 'run-log.jsonl')))
        .map((e) => e.name)
        .sort();
    },
  };
}

function skillExists(skill: string): boolean {
  return existsSync(join(SKILLS_ROOT, skill, 'SKILL.md'));
}

/** Read the result JSON of the last COMPLETED invocation of a skill, if any. */
function latestSkillOutput(entries: SkillInvocationEntry[], skill: string): unknown | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && e.skill === skill && e.status === 'completed' && e.outputPath) {
      if (!existsSync(e.outputPath)) return null;
      return JSON.parse(readFileSync(e.outputPath, 'utf8')) as unknown;
    }
  }
  return null;
}

type RequestPlan = { request: Record<string, unknown> } | { awaiting: string };

/**
 * Derive one step's skill request from the job's prior recorded outputs.
 *
 * The runner only drives a step whose inputs are unambiguous from the log.
 * `ingest` and `index` carry external / per-asset / spend-gated inputs
 * (decisions.md D-21) the runner must not originate, so they pause as
 * `awaiting` with the command to run by hand. `propose → plan → validate` chain
 * cleanly by artefact id.
 */
function buildRequest(step: PipelineStep, jobId: string, entries: SkillInvocationEntry[]): RequestPlan {
  switch (step.skill) {
    case 'ingest':
      return {
        awaiting:
          'the runner does not originate ingest (it needs an external source path); run `cutdown ingest <path> --job ' +
          `${jobId}\` first.`,
      };
    case 'index':
      return {
        awaiting:
          'indexing is per-asset and spend-gated (decisions.md D-21); run `cutdown index ' +
          `${jobId} --asset <asset-id>\` first.`,
      };
    case 'propose':
      return { request: { jobId, variants: DEFAULT_VARIANTS } };
    case 'plan': {
      const proposed = latestSkillOutput(entries, 'propose') as
        | { kind?: string; briefs?: Array<{ creativeBriefId?: string }> }
        | null;
      if (!proposed || proposed.kind !== 'briefs' || !proposed.briefs?.length) {
        return {
          awaiting:
            'propose produced no briefs to plan from ' +
            `(last result kind: ${proposed?.kind ?? 'none'}); nothing to advance.`,
        };
      }
      const creativeBriefId = proposed.briefs[0]?.creativeBriefId;
      if (!creativeBriefId) return { awaiting: 'the newest propose result carries no creativeBriefId.' };
      return { request: { jobId, creativeBriefId, platform: PHASE0_PLATFORM } };
    }
    case 'validate': {
      const planned = latestSkillOutput(entries, 'plan') as
        | { kind?: string; edlId?: string }
        | null;
      if (!planned || planned.kind !== 'planned' || !planned.edlId) {
        return {
          awaiting:
            'plan produced no PlatformEDL to validate ' +
            `(last result kind: ${planned?.kind ?? 'none'}); nothing to advance.`,
        };
      }
      return { request: { jobId, edlId: planned.edlId } };
    }
    default:
      return { awaiting: `no request builder for skill '${step.skill}'.` };
  }
}

/** The production step invoker: existence check → request → invokeSkill → outcome. */
const realInvoker: StepInvoker = async (step, jobId, priorEntries): Promise<StepOutcome> => {
  if (!skillExists(step.skill)) {
    return {
      kind: 'awaiting',
      reason: `skill '${step.skill}' is not implemented yet (Phase ${step.phase}); stopping at this boundary.`,
    };
  }

  const plan = buildRequest(step, jobId, priorEntries);
  if ('awaiting' in plan) return { kind: 'awaiting', reason: plan.awaiting };

  try {
    // invokeSkill appends the authoritative `skill-invocation` line to the run
    // log itself — the runner re-reads and projects from there.
    await invokeSkill({ skillName: step.skill, jobId, request: plan.request });
    return { kind: 'completed' };
  } catch (err) {
    if (err instanceof CutdownError) {
      // A structured skill failure → the job blocks (recoverable), never a
      // fabricated success and never a silent skip.
      return { kind: 'blocked', error: err.toStructured() };
    }
    // An unexpected fault is a runner bug, not a job outcome — let it surface.
    throw err;
  }
};

export async function runCommand(jobId: string): Promise<number> {
  assertSafeJobId(jobId);
  const db = new ProjectionDb(INDEX_DB);
  try {
    const runner = new Runner(db, makeEnv(), realInvoker);
    const result = await runner.advance(jobId);

    const lines = [
      `job ${result.jobId}`,
      `state: ${result.state}  (status: ${result.status})`,
      `stopped: ${result.stopReason}  — advanced ${result.advanced} step(s) this run`,
    ];
    if (result.stopReason === 'awaiting' && result.reason) lines.push(`awaiting: ${result.reason}`);
    if (result.stopReason === 'blocked') {
      lines.push(`blocked: ${JSON.stringify(result.error)}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    // A blocked job is a real, recoverable outcome — not a runner error — so the
    // command still exits 0; the printed state carries the news.
    return 0;
  } finally {
    db.close();
  }
}

export function rebuildIndexCommand(jobId?: string): number {
  if (jobId !== undefined) assertSafeJobId(jobId);
  const db = new ProjectionDb(INDEX_DB);
  try {
    const runner = new Runner(db, makeEnv(), realInvoker);
    const rebuilt = runner.rebuild(jobId);
    process.stdout.write(
      `rebuilt index.db from run logs: ${rebuilt.length} job(s) [${rebuilt.join(', ')}]\n`,
    );
    return 0;
  } finally {
    db.close();
  }
}
