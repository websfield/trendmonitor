import { openGate, type TransitionGate } from '../src/gates.js';
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
  const runner = new Runner(db, h.env, scriptedInvoker(h, script, calls), openGate);

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
  await new Runner(db1, h.env, scriptedInvoker(h, script, calls1), openGate).advance('job-b');
  db1.close();

  // Second process: brand-new Runner + DB handle over the same run log.
  const db2 = new ProjectionDb(h.dbPath);
  const calls2: string[] = [];
  const result = await new Runner(db2, h.env, scriptedInvoker(h, script, calls2), openGate).advance('job-b');

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
  await new Runner(db1, h.env, scriptedInvoker(h, script, []), openGate).advance('job-c');
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
  const runner2 = new Runner(db2, h.env, scriptedInvoker(h, script, []), openGate);
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
  const resumed = await new Runner(db2, h.env, scriptedInvoker(h, script, calls), openGate).advance('job-c');
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
  const result = await new Runner(db, h.env, scriptedInvoker(h, failing, []), openGate).advance('job-d');

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
  const recovered = await new Runner(db, h.env, scriptedInvoker(h, recovering, calls), openGate).advance('job-d');

  // The runner retried plan (the blocked step), then validate, then paused at render.
  assert.deepEqual(calls, ['plan', 'validate', 'render']);
  assert.equal(recovered.state, 'draft-rendering');
  assert.equal(recovered.stopReason, 'awaiting');
  const recoveredRow = db.getJob('job-d');
  assert.equal(recoveredRow?.status, 'pending');
  assert.equal(recoveredRow?.blockedError, null);
  db.close();
});

// (e) The GATE-REFUSAL branch — Phase 4 residual 2. All of (a)–(d) pass
// `openGate`, so `stopReason === 'gate-blocked'` had no test at all. That is the
// same failure class as the Phase 4 round-1 finding: the gate was built,
// unit-tested in isolation, and never exercised through the thing that uses it.
test('a refusing gate stops the job WITHOUT running the step or touching the run log', async () => {
  const h = makeHarness();
  const db = new ProjectionDb(h.dbPath);
  const calls: string[] = [];

  // Everything through the draft render succeeds, then the QA gate refuses entry
  // to `approve` — the real Phase 4 shape (a draft rendered, QA said no).
  const script: Record<string, Behavior> = {
    ingest: 'completed',
    index: 'completed',
    propose: 'completed',
    plan: 'completed',
    validate: 'completed',
    render: 'completed',
    approve: 'completed',
  };
  const refusing: TransitionGate = (step) =>
    Promise.resolve(
      step.skill === 'approve'
        ? { allowed: false, code: 'QA_BLOCKERS', reason: 'the draft render has 1 non-waivable blocker: caption_safe_zone' }
        : { allowed: true, reason: 'ungated' },
    );

  const result = await new Runner(db, h.env, scriptedInvoker(h, script, calls), refusing).advance('job-e');

  assert.equal(result.stopReason, 'gate-blocked');
  assert.equal(result.gateCode, 'QA_BLOCKERS');
  assert.ok(result.reason?.includes('caption_safe_zone'), 'the refusal names the check, so the operator knows what to fix');
  assert.equal(result.state, 'review', 'the job parks in the state it could not leave');
  assert.equal(result.advanced, 6, 'the six steps before the gate did run');

  // The load-bearing half: `approve` was NEVER invoked, so nothing was logged
  // for it. `gate-blocked` must not put a failure in the authoritative log for a
  // skill that never ran.
  assert.ok(!calls.includes('approve'), 'a refused step must not be invoked at all');
  const logged = h.env.readRunLog('job-e').map((e) => e.skill);
  assert.ok(!logged.includes('approve'), 'the run log records only what actually ran');

  // Recoverable with no log surgery: the same log plus a permitting gate advances.
  const calls2: string[] = [];
  const recovered = await new Runner(db, h.env, scriptedInvoker(h, script, calls2), openGate).advance('job-e');
  assert.equal(calls2[0], 'approve', 'the previously refused step is retried first');
  assert.notEqual(recovered.stopReason, 'gate-blocked');
  db.close();
});

// A refusal on the FIRST step must report zero advanced steps — the boundary
// case where `advanced` could plausibly be off by one.
test('a gate refusing the very first step advances nothing', async () => {
  const h = makeHarness();
  const db = new ProjectionDb(h.dbPath);
  const calls: string[] = [];
  const closedGate: TransitionGate = () =>
    Promise.resolve({ allowed: false, code: 'QA_REPORT_MISSING', reason: 'no evidence' });

  const result = await new Runner(db, h.env, scriptedInvoker(h, { ingest: 'completed' }, calls), closedGate).advance('job-f');

  assert.equal(result.stopReason, 'gate-blocked');
  assert.equal(result.advanced, 0);
  assert.equal(result.state, 'uploaded');
  assert.deepEqual(calls, [], 'nothing ran');
  assert.equal(db.getJob('job-f')?.status, 'pending', 'a gate refusal is not a failure — the job stays pending');
  db.close();
});

// (f) The tech-spec §15 steps 8–9 ORDER, driven end to end by the runner.
//
// The acceptance criterion is "draft approval → final render → final QA → package,
// proven in order". Each earlier test covers one boundary; this one covers the
// SEQUENCE, because the ordering bug this pipeline is most exposed to is a step
// running before its predecessor rather than a step running wrongly.
//
// Both gates are real (a QA gate on entering `approve`, an approval gate on
// entering the final render), driven by a small state object the scripted skills
// mutate — the same shape as the production env, which reads artefacts on disk.
test('drives §15 steps 8-9 in order: draft QA -> approval -> final render -> final QA -> package', async () => {
  const h = makeHarness();
  const db = new ProjectionDb(h.dbPath);
  const calls: string[] = [];

  // What the gates consult. `draftQa` starts absent: nothing has been rendered.
  const world = {
    draftQa: null as null | 'pass' | 'fail',
    finalQa: null as null | 'pass',
    decision: 'none' as 'none' | 'approved' | 'rejected',
  };

  const gate: TransitionGate = (step) => {
    if (step.skill === 'approve' && step.fromState === 'review') {
      return Promise.resolve(
        world.draftQa === 'pass'
          ? { allowed: true, reason: 'draft QA passed' }
          : { allowed: false, code: 'QA_REPORT_MISSING', reason: 'no passing draft QA' },
      );
    }
    if (step.skill === 'render' && step.fromState === 'final-rendering') {
      return Promise.resolve(
        world.decision === 'approved'
          ? { allowed: true, reason: 'an approval is in force' }
          : { allowed: false, code: 'REVIEW_DECISION_MISSING', reason: `decision is "${world.decision}"` },
      );
    }
    if (step.skill === 'package' && step.fromState === 'packaging') {
      return Promise.resolve(
        world.finalQa === 'pass'
          ? { allowed: true, reason: 'final QA passed' }
          : { allowed: false, code: 'QA_REPORT_MISSING', reason: 'no passing final QA' },
      );
    }
    return Promise.resolve({ allowed: true, reason: 'ungated' });
  };

  // Each skill records what it produced, exactly as the real ones do on disk.
  const invoker: StepInvoker = async (step, jobId): Promise<StepOutcome> => {
    calls.push(`${step.skill}@${step.fromState}`);
    if (step.skill === 'render') {
      // The tier is decided by the state being left — the pipeline lists `render`
      // twice and the run log is consumed left to right.
      if (step.fromState === 'draft-rendering') world.draftQa = 'pass';
      else world.finalQa = 'pass';
    }
    if (step.skill === 'approve') world.decision = 'approved';
    appendInvocation(h, jobId, step.skill, 'completed');
    return Promise.resolve({ kind: 'completed' });
  };

  const result = await new Runner(db, h.env, invoker, gate).advance('job-order');

  assert.equal(result.stopReason, 'completed');
  assert.equal(result.state, 'completed');
  assert.deepEqual(
    calls,
    [
      'ingest@uploaded',
      'index@indexing',
      'propose@brief-generation',
      'plan@edl-generation',
      'validate@validating',
      'render@draft-rendering',
      'approve@review',
      'render@final-rendering',
      'package@packaging',
    ],
    'the §15 order, and nothing reordered',
  );

  // The load-bearing half: each of the three gated steps was reachable ONLY after
  // its predecessor produced the evidence. Replaying the same run with the world
  // reset proves the gates, not the script, enforced the order.
  const h2 = makeHarness();
  const db2 = new ProjectionDb(h2.dbPath);
  const frozenGate: TransitionGate = (step) =>
    Promise.resolve(
      step.skill === 'approve' && step.fromState === 'review'
        ? { allowed: false, code: 'QA_REPORT_MISSING', reason: 'no passing draft QA' }
        : { allowed: true, reason: 'ungated' },
    );
  const calls2: string[] = [];
  const stalled = await new Runner(
    db2,
    h2.env,
    async (step, jobId) => {
      calls2.push(step.skill);
      appendInvocation(h2, jobId, step.skill, 'completed');
      return Promise.resolve({ kind: 'completed' as const });
    },
    frozenGate,
  ).advance('job-order-2');
  assert.equal(stalled.stopReason, 'gate-blocked');
  assert.equal(stalled.state, 'review', 'without draft QA the job cannot reach approval');
  assert.ok(!calls2.includes('approve'), 'and approve never ran');
  assert.ok(!calls2.includes('package'), 'so packaging was never reachable either');
  db.close();
  db2.close();
});
