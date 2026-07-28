/**
 * The durable local workflow runner (tech-spec §8, REQ-151/REQ-152).
 *
 * The runner ORCHESTRATES; it never writes the authoritative record itself. The
 * injected `invoker` runs a skill and appends the `skill-invocation` line to
 * `run-log.jsonl` (in production via `invokeSkill`, which already does exactly
 * that). After every step the runner RE-READS the run log and re-projects it
 * into `index.db`. That ordering is the invariant: the log is written first and
 * the projection is derived from it, so the projection can never claim state the
 * log does not back.
 *
 * The runner is deliberately skill- and path-agnostic — the caller injects how
 * to read a job's run log, how to enumerate jobs, and how to invoke a step — so
 * `workflows/local` has no dependency on the CLI package and the same core can
 * be re-instantiated in a test to simulate process death.
 */

import { ProjectionDb, type JobRow, type JobStatus } from './db.js';
import { analyze, type SkillInvocationEntry } from './runlog.js';
import type { JobState, PipelineStep } from './pipeline.js';

/**
 * The result of asking the invoker to execute one step.
 *
 * The invoker OWNS appending the authoritative run-log entry for `completed`
 * and `blocked` (a real skill invocation logs its own outcome). `awaiting`
 * writes nothing — the skill never ran — so the step simply stays pending.
 */
export type StepOutcome =
  | { kind: 'completed' }
  | { kind: 'blocked'; error: unknown }
  | { kind: 'awaiting'; reason: string };

export interface StepInvoker {
  (step: PipelineStep, jobId: string, priorEntries: SkillInvocationEntry[]): Promise<StepOutcome>;
}

export interface RunnerEnv {
  /** Read and parse a job's run-log.jsonl into skill-invocation entries, in log order. */
  readRunLog(jobId: string): SkillInvocationEntry[];
  /** Enumerate every job that has a run log (for resume scans and full rebuilds). */
  listJobIds(): string[];
}

export type StopReason = 'completed' | 'blocked' | 'awaiting';

export interface RunResult {
  jobId: string;
  state: JobState;
  status: JobStatus;
  stopReason: StopReason;
  /** Present when stopReason is 'blocked'. */
  error?: unknown;
  /** Present when stopReason is 'awaiting'. */
  reason?: string;
  /** How many steps this advance call drove to completion. */
  advanced: number;
}

export class Runner {
  constructor(
    private readonly db: ProjectionDb,
    private readonly env: RunnerEnv,
    private readonly invoker: StepInvoker,
  ) {}

  /**
   * Project one job's run log into the database WITHOUT running anything — the
   * pure derivation used by resume, rebuild, and after every step. `index.db`
   * after this call is exactly `analyze(run-log)`; nothing else can set a job's
   * state.
   */
  project(jobId: string): JobRow {
    const entries = this.env.readRunLog(jobId);
    for (const entry of entries) this.db.upsertInvocation(jobId, entry);

    const a = analyze(entries);
    const row: JobRow = {
      jobId,
      currentState: a.state,
      status: statusFor(a.kind),
      blockedError: a.kind === 'blocked' ? JSON.stringify(a.blockedError ?? null) : null,
      updatedAt: new Date().toISOString(),
    };
    this.db.upsertJob(row);
    return row;
  }

  /**
   * Drive a job forward through the pipeline until it completes, blocks, or
   * reaches a step the runner cannot originate (an unimplemented or
   * external-input skill → `awaiting`). Each completed step loops; the loop is
   * re-derived from the run log every iteration, so a step is chosen by what the
   * authoritative log records, never by in-memory bookkeeping.
   */
  async advance(jobId: string): Promise<RunResult> {
    let advanced = 0;
    for (;;) {
      const entries = this.env.readRunLog(jobId);
      const a = analyze(entries);
      this.project(jobId);

      if (a.kind === 'completed') {
        return {
          jobId,
          state: 'completed',
          status: 'completed',
          stopReason: 'completed',
          advanced,
        };
      }

      // a.kind is 'pending' or 'blocked'; both mean "a.step is next to run".
      // Running a blocked step is the recovery path (tech-spec §8): a re-run
      // retries it, and only a fresh failure stops the loop.
      const outcome = await this.invoker(a.step, jobId, entries);

      if (outcome.kind === 'completed') {
        advanced += 1;
        continue;
      }

      if (outcome.kind === 'blocked') {
        // The invoker has appended the failed entry; re-project so the row
        // reflects `blocked` derived from the log, not from this return value.
        const row = this.project(jobId);
        return {
          jobId,
          state: a.step.fromState,
          status: row.status,
          stopReason: 'blocked',
          error: outcome.error,
          advanced,
        };
      }

      // awaiting: nothing ran, nothing was logged. The job stays pending at this
      // step — a clean pause at a boundary, never a failure.
      return {
        jobId,
        state: a.step.fromState,
        status: 'pending',
        stopReason: 'awaiting',
        reason: outcome.reason,
        advanced,
      };
    }
  }

  /**
   * Rebuild the projection from the authoritative run logs — the mechanism that
   * proves "deleting index.db never loses job state" (tech-spec §5).
   *
   * With no jobId: reset BOTH tables and replay every job's log. With a jobId:
   * reset just that job's rows and replay its log, leaving other jobs untouched.
   */
  rebuild(jobId?: string): string[] {
    if (jobId === undefined) {
      this.db.resetAll();
      const jobs = this.env.listJobIds();
      for (const id of jobs) this.project(id);
      return jobs;
    }
    this.db.resetJob(jobId);
    this.project(jobId);
    return [jobId];
  }
}

function statusFor(kind: 'completed' | 'pending' | 'blocked'): JobStatus {
  switch (kind) {
    case 'completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'pending':
      return 'pending';
  }
}
