import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, appendFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  Runner,
  ProjectionDb,
  parseRunLog,
  type RunnerEnv,
  type StepInvoker,
  type StepOutcome,
  type PipelineStep,
} from '../src/index.js';

/**
 * These tests exercise the runner CORE with a real on-disk run log and a
 * scripted fake invoker (never a real skill — safety invariant 5). The fake
 * invoker appends the authoritative `skill-invocation` line exactly as
 * `invokeSkill` does in production, so the run-log-is-authoritative /
 * projection-is-derived flow is genuinely tested, not stubbed around.
 */

interface Harness {
  root: string;
  jobsRoot: string;
  dbPath: string;
  env: RunnerEnv;
  runLogPath(jobId: string): string;
}

function makeHarness(): Harness {
  const root = mkdtempSync(join(tmpdir(), 'cutdown-runner-'));
  const jobsRoot = join(root, 'jobs');
  mkdirSync(jobsRoot, { recursive: true });
  const runLogPath = (jobId: string) => join(jobsRoot, jobId, 'run-log.jsonl');
  const env: RunnerEnv = {
    readRunLog(jobId) {
      const p = runLogPath(jobId);
      return existsSync(p) ? parseRunLog(readFileSync(p, 'utf8')) : [];
    },
    listJobIds() {
      if (!existsSync(jobsRoot)) return [];
      return readdirSync(jobsRoot)
        .filter((n) => existsSync(runLogPath(n)))
        .sort();
    },
  };
  return { root, jobsRoot, dbPath: join(root, 'index.db'), env, runLogPath };
}

let counter = 0;
/** Append a run-log line the way `appendRunLog` does (authoritative record). */
function appendInvocation(
  h: Harness,
  jobId: string,
  skill: string,
  status: 'completed' | 'failed',
  error: unknown = null,
): void {
  const dir = join(h.jobsRoot, jobId);
  mkdirSync(dir, { recursive: true });
  const entry = {
    event: 'skill-invocation',
    invocationId: `${skill}-${Date.now()}-${counter++}`,
    skill,
    skillVersion: '1.0.0',
    status,
    exitCode: status === 'completed' ? 0 : 3,
    inputPath: join(dir, 'requests', 'x.json'),
    outputPath: join(dir, 'results', 'x.json'),
    error,
    loggedAt: new Date().toISOString(),
  };
  appendFileSync(h.runLogPath(jobId), `${JSON.stringify(entry)}\n`, 'utf8');
}

type Behavior = 'completed' | 'blocked' | 'awaiting';

/**
 * A scripted invoker: `script[skill]` decides the outcome. `completed`/`blocked`
 * append the authoritative line (as a real skill would); `awaiting` writes
 * nothing. `calls` records the order the runner asked for steps — the evidence
 * that a completed stage is never re-run.
 */
function scriptedInvoker(
  h: Harness,
  script: Record<string, Behavior>,
  calls: string[],
): StepInvoker {
  return async (step: PipelineStep, jobId: string): Promise<StepOutcome> => {
    calls.push(step.skill);
    const behavior = script[step.skill] ?? 'awaiting';
    if (behavior === 'completed') {
      appendInvocation(h, jobId, step.skill, 'completed');
      return { kind: 'completed' };
    }
    if (behavior === 'blocked') {
      const error = { code: 'PLAN_OUT_OF_BOUNDS', message: 'an EDL clip left the source range', skill: step.skill };
      appendInvocation(h, jobId, step.skill, 'failed', error);
      return { kind: 'blocked', error };
    }
    return { kind: 'awaiting', reason: `skill '${step.skill}' not implemented yet` };
  };
}

// (a) A job advances through the available stages and records to run-log + index.db.
test('advances through available stages, recording run-log and index.db', async () => {
  const h = makeHarness();
  const db = new ProjectionDb(h.dbPath);
  const calls: string[] = [];
  const script: Record<string, Behavior> = {
    ingest: 'completed',
    index: 'completed',
    propose: 'completed',
    plan: 'completed',
    validate: 'completed',
    // render is not implemented in Phase 3 → the runner pauses here.
  };
  const runner = new Runner(db, h.env, scriptedInvoker(h, script, calls));

  const result = await runner.advance('job-a');

  assert.equal(result.stopReason, 'awaiting');
  assert.equal(result.state, 'draft-rendering');
  assert.equal(result.advanced, 5);
  assert.deepEqual(calls, ['ingest', 'index', 'propose', 'plan', 'validate', 'render']);

  // Run log is authoritative: 5 completed invocations on disk.
  const entries = h.env.readRunLog('job-a');
  assert.equal(entries.filter((e) => e.status === 'completed').length, 5);

  // index.db is the derived projection.
  const jobRow = db.getJob('job-a');
  assert.ok(jobRow);
  assert.equal(jobRow.currentState, 'draft-rendering');
  assert.equal(jobRow.status, 'pending');
  assert.equal(db.listInvocations('job-a').length, 5);
  db.close();
});

// (b) Resume: after re-instantiating the runner (simulated process death), a
//     completed stage is NOT re-run and the next pending step is derived from the log.
test('resume: completed stages are not re-run after restart', async () => {
  const h = makeHarness();
  const script: Record<string, Behavior> = {
    ingest: 'completed',
    index: 'completed',
    propose: 'completed',
    plan: 'completed',
    validate: 'completed',
  };

  // First process: advance to the render boundary.
  const db1 = new ProjectionDb(h.dbPath);
  const calls1: string[] = [];
  await new Runner(db1, h.env, scriptedInvoker(h, script, calls1)).advance('job-b');
  db1.close();

  // Second process: brand-new Runner + DB handle over the same run log.
  const db2 = new ProjectionDb(h.dbPath);
  const calls2: string[] = [];
  const result = await new Runner(db2, h.env, scriptedInvoker(h, script, calls2)).advance('job-b');

  // The only step the runner asked for is the pending one (render); the five
  // completed stages were derived from the log and skipped.
  assert.deepEqual(calls2, ['render']);
  assert.equal(result.advanced, 0);
  assert.equal(result.state, 'draft-rendering');
  assert.equal(result.stopReason, 'awaiting');
  db2.close();
});

// (c) Delete index.db, then rebuild-index → job state reconstructed identically,
//     resume still correct. Zero state loss (the run log is the only source of truth).
test('rebuild-index reconstructs job state losslessly after index.db is deleted', async () => {
  const h = makeHarness();
  const script: Record<string, Behavior> = {
    ingest: 'completed',
    index: 'completed',
    propose: 'completed',
    plan: 'completed',
    validate: 'completed',
  };

  const db1 = new ProjectionDb(h.dbPath);
  await new Runner(db1, h.env, scriptedInvoker(h, script, [])).advance('job-c');
  const before = db1.getJob('job-c');
  const invocationsBefore = db1.listInvocations('job-c').map((r) => r.invocationId).sort();
  db1.close();

  // Delete the projection entirely (and its WAL sidecars).
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${h.dbPath}${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
  assert.equal(existsSync(h.dbPath), false);

  // Rebuild from the run logs alone.
  const db2 = new ProjectionDb(h.dbPath);
  const runner2 = new Runner(db2, h.env, scriptedInvoker(h, script, []));
  const rebuilt = runner2.rebuild();
  assert.ok(rebuilt.includes('job-c'));

  const after = db2.getJob('job-c');
  assert.ok(before && after);
  // Identical projection (updatedAt is a projection timestamp, not job state).
  assert.equal(after.currentState, before.currentState);
  assert.equal(after.status, before.status);
  assert.equal(after.blockedError, before.blockedError);
  assert.deepEqual(
    db2.listInvocations('job-c').map((r) => r.invocationId).sort(),
    invocationsBefore,
  );

  // Resume is still correct after the rebuild.
  const calls: string[] = [];
  const resumed = await new Runner(db2, h.env, scriptedInvoker(h, script, calls)).advance('job-c');
  assert.deepEqual(calls, ['render']);
  assert.equal(resumed.state, 'draft-rendering');
  db2.close();
});

// (d) A structured-error skill exit → job `blocked`, error recorded, and recoverable.
test('structured-error exit blocks the job, records the error, and is recoverable', async () => {
  const h = makeHarness();
  const db = new ProjectionDb(h.dbPath);

  // plan fails with a structured error.
  const failing: Record<string, Behavior> = {
    ingest: 'completed',
    index: 'completed',
    propose: 'completed',
    plan: 'blocked',
  };
  const result = await new Runner(db, h.env, scriptedInvoker(h, failing, [])).advance('job-d');

  assert.equal(result.stopReason, 'blocked');
  assert.equal(result.state, 'edl-generation');
  const row = db.getJob('job-d');
  assert.ok(row);
  assert.equal(row.status, 'blocked');
  assert.ok(row.blockedError && row.blockedError.includes('PLAN_OUT_OF_BOUNDS'));

  // Recoverable: a later run where plan now succeeds retries the blocked step
  // and advances past it (blocked is not terminal).
  const recovering: Record<string, Behavior> = {
    ingest: 'completed',
    index: 'completed',
    propose: 'completed',
    plan: 'completed',
    validate: 'completed',
  };
  const calls: string[] = [];
  const recovered = await new Runner(db, h.env, scriptedInvoker(h, recovering, calls)).advance('job-d');

  // The runner retried plan (the blocked step), then validate, then paused at render.
  assert.deepEqual(calls, ['plan', 'validate', 'render']);
  assert.equal(recovered.state, 'draft-rendering');
  assert.equal(recovered.stopReason, 'awaiting');
  const recoveredRow = db.getJob('job-d');
  assert.equal(recoveredRow?.status, 'pending');
  assert.equal(recoveredRow?.blockedError, null);
  db.close();
});
