/**
 * Reading the AUTHORITATIVE record and deriving job state from it (tech-spec §5, §8).
 *
 * `run-log.jsonl` is the source of truth; `index.db` is a projection. Every
 * function here takes run-log entries as input and never touches the database —
 * that separation is what makes `rebuild-index` lossless: the projection is a
 * pure function of the log, so replaying the log reconstructs it exactly.
 */

import { PIPELINE, type JobState, type PipelineStep } from './pipeline.js';

/**
 * A `skill-invocation` line as written by `appendRunLog` (skill-invocation.ts).
 * Only the fields the projection needs are typed; the log may carry more.
 */
export interface SkillInvocationEntry {
  event: 'skill-invocation';
  invocationId: string;
  skill: string;
  skillVersion: string;
  status: 'completed' | 'failed';
  exitCode?: number | null;
  inputPath?: string;
  outputPath?: string;
  error?: unknown;
  loggedAt: string;
}

/**
 * Parse the `skill-invocation` events out of a run-log body, in log order.
 *
 * The run log interleaves other events (index sub-stages, index-complete); the
 * state machine only advances on skill invocations, so everything else is
 * skipped. A malformed line is skipped rather than throwing — a single corrupt
 * append must not make an entire job unreadable.
 */
export function parseRunLog(body: string): SkillInvocationEntry[] {
  const out: SkillInvocationEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isSkillInvocation(parsed)) continue;
    out.push(parsed);
  }
  return out;
}

function isSkillInvocation(value: unknown): value is SkillInvocationEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['event'] === 'skill-invocation' &&
    typeof v['invocationId'] === 'string' &&
    typeof v['skill'] === 'string' &&
    (v['status'] === 'completed' || v['status'] === 'failed') &&
    typeof v['loggedAt'] === 'string'
  );
}

export type Analysis =
  | { kind: 'completed'; state: JobState }
  | { kind: 'pending'; state: JobState; step: PipelineStep }
  | { kind: 'blocked'; state: JobState; step: PipelineStep; blockedError: unknown };

/**
 * Re-derive a job's position in the pipeline PURELY from its run-log entries —
 * the "re-derive the next pending step from the recorded output IDs" of
 * tech-spec §8, and the whole basis for resume-on-restart.
 *
 * Walk the pipeline in order against the invocations in log order, holding a
 * cursor into the invocation list:
 *   - A step is SATISFIED by the first `completed` invocation of its skill at or
 *     after the cursor. A completed stage is therefore never re-run, and a
 *     failed attempt that a later re-run recovered is skipped (the search looks
 *     past it to the completed entry) — `blocked` is recoverable.
 *   - If a step has no completed invocation but was ATTEMPTED and failed, the
 *     job is `blocked` at that step (recorded error surfaced).
 *   - If a step was never attempted, the job is `pending` there — that step is
 *     the next one to run.
 */
export function analyze(entries: SkillInvocationEntry[]): Analysis {
  let cursor = 0;
  for (const step of PIPELINE) {
    let completedIdx = -1;
    let failedIdx = -1;
    for (let i = cursor; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry || entry.skill !== step.skill) continue;
      if (entry.status === 'completed') {
        completedIdx = i;
        break;
      }
      if (failedIdx === -1) failedIdx = i;
    }

    if (completedIdx !== -1) {
      cursor = completedIdx + 1;
      continue;
    }
    if (failedIdx !== -1) {
      return {
        kind: 'blocked',
        state: step.fromState,
        step,
        blockedError: entries[failedIdx]?.error ?? null,
      };
    }
    return { kind: 'pending', state: step.fromState, step };
  }
  return { kind: 'completed', state: 'completed' };
}
