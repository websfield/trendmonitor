import { appendFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { ulid } from 'ulid';

import { assertSafeJobId, jobPaths } from '../paths.js';
import { readSkill, readJson, runSkill, writeJsonAtomic, type Skill } from '../skills.js';
import { currentTraceparent, initTracing, withSpan } from '../otel.js';
import { CutdownError, runtimeFailure } from '../errors.js';

/**
 * The one path from "a caller wants a skill to run" to "a result exists on disk".
 *
 * Every public surface funnels through here — `cutdown brief`, `cutdown ingest`,
 * `cutdown skills run`, and (from Phase 5) the generated `.claude` mirror. That
 * matters more than it looks: the mirror's four-step body (build a request →
 * write it to `requests/` → run the skill → report or surface the structured
 * error) is not a separate implementation of this flow, it is a description of
 * THIS function. One path means one place where run-logging, tracing, atomic
 * writes, and structured-error surfacing are either right or wrong.
 */

export interface InvokeOptions {
  skillName: string;
  jobId: string;
  request: unknown;
  /** Supplied by `skills run`, which is handed explicit paths. */
  inputPath?: string;
  outputPath?: string;
}

export interface InvokeResult {
  invocationId: string;
  inputPath: string;
  outputPath: string;
  result: unknown;
  durationMs: number;
}

/**
 * Append one line to the job's `run-log.jsonl` — the AUTHORITATIVE, append-only
 * record (tech-spec §5, §8).
 *
 * `index.db` is a projection of this file and is rebuildable from it; on any
 * divergence the run log wins. Deleting `index.db` must never lose job state,
 * which is only true because this write happens here and not there.
 */
export function appendRunLog(jobId: string, entry: Record<string, unknown>): void {
  const paths = jobPaths(jobId);
  mkdirSync(paths.root, { recursive: true });
  appendFileSync(
    paths.runLog,
    `${JSON.stringify({ ...entry, loggedAt: new Date().toISOString() })}\n`,
    'utf8',
  );
}

export async function invokeSkill(options: InvokeOptions): Promise<InvokeResult> {
  assertSafeJobId(options.jobId);

  const skill: Skill = readSkill(options.skillName);
  const paths = jobPaths(options.jobId);
  const invocationId = ulid();

  const inputPath = options.inputPath ?? join(paths.requests, `${invocationId}.json`);
  // artefact-path-lint: not-an-artefact — `options.outputPath` is a CLI `--output`
  // argument, not a field read from a stored artefact, and the joined value is the
  // FALLBACK, never the option itself.
  const outputPath = options.outputPath ?? join(paths.results, `${invocationId}.json`);

  mkdirSync(paths.requests, { recursive: true });
  mkdirSync(paths.results, { recursive: true });

  if (!options.inputPath) {
    writeJsonAtomic(inputPath, options.request);
  }

  const tracer = initTracing(options.jobId);

  return withSpan(
    tracer,
    `skill.${skill.frontmatter.name}`,
    {
      'cutdown.job_id': options.jobId,
      'cutdown.skill': skill.frontmatter.name,
      'cutdown.skill_version': skill.frontmatter.skillVersion,
      'cutdown.invocation_id': invocationId,
    },
    async (span) => {
      const run = runSkill(skill, {
        inputPath,
        outputPath,
        traceparent: currentTraceparent(span),
      });

      appendRunLog(options.jobId, {
        event: 'skill-invocation',
        invocationId,
        skill: skill.frontmatter.name,
        skillVersion: skill.frontmatter.skillVersion,
        inputPath,
        outputPath,
        exitCode: run.exitCode,
        durationMs: run.durationMs,
        status: run.exitCode === 0 ? 'completed' : 'failed',
        error: run.structuredError,
      });

      if (run.exitCode !== 0) {
        // Surface the skill's OWN structured error rather than wrapping it in a
        // generic failure — the caller (including a human reading a Claude Code
        // transcript) needs the skill's code and message, not ours.
        if (run.structuredError) {
          throw new CutdownError({
            ...run.structuredError,
            exitCode: run.exitCode,
          });
        }
        throw runtimeFailure({
          code: 'SKILL_FAILED_WITHOUT_STRUCTURED_ERROR',
          message:
            `${skill.frontmatter.name} exited ${run.exitCode} without writing a structured error to stderr. ` +
            `Every skill owes one (tech-spec §6.2); this is a defect in the skill, not in the caller.`,
          skill: skill.frontmatter.name,
          skillVersion: skill.frontmatter.skillVersion,
          details: { stderr: run.stderr.slice(0, 4000), stdout: run.stdout.slice(0, 2000) },
        });
      }

      let result: unknown;
      try {
        result = readJson(outputPath);
      } catch (err) {
        throw runtimeFailure({
          code: 'SKILL_OUTPUT_MISSING',
          message:
            `${skill.frontmatter.name} exited 0 but no readable result exists at ${outputPath}. ` +
            `Exit 0 is a claim that the output was written atomically (tech-spec §6.2).`,
          skill: skill.frontmatter.name,
          skillVersion: skill.frontmatter.skillVersion,
          details: { error: (err as Error).message },
        });
      }

      return { invocationId, inputPath, outputPath, result, durationMs: run.durationMs };
    },
  );
}

/** Resolve a user-supplied path to absolute, rejecting option-shaped input. */
export function resolveUserPath(input: string, label: string): string {
  if (input.startsWith('-')) {
    throw runtimeFailure({
      code: 'PATH_OPTION_SHAPED',
      message: `${label} ${JSON.stringify(input)} looks like a command-line option. Option-shaped paths are rejected (tech-spec §11).`,
      skill: 'cli',
      skillVersion: '1.0.0',
    });
  }
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}
