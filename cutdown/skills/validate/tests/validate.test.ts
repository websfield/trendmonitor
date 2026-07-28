import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The `validate` skill's D-37 contract (tech-spec §6.6, Task 7/10).
 *
 * The deterministic gate owns every block; the LLM critic (replayed from a
 * recorded response over an injected transport) is advisory only. These prove:
 * a clean EDL passes with advisory critic findings that never become blockers;
 * each deliberately-broken EDL is BLOCKED with its rule id; and an unconfigured
 * gateway still yields the deterministic verdict with the critic skipped.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(here, '..', '..');
const CUTDOWN_ROOT = resolve(SKILL_DIR, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');
const FIXTURES = join(SKILL_DIR, 'fixtures', 'validate');
const RECORDED = join(FIXTURES, 'recorded-critic.json');
const BOUNDS = join(FIXTURES, 'bounds.json');

let workspace: string;
let scratch: string;
let counter = 0;

interface Outcome { status: number; stdout: string; stderr: string; outputPath: string }

function seedJob(jobId: string): void {
  const root = join(workspace, 'project-data', 'jobs', jobId);
  for (const sub of ['brief', 'moments', 'edl']) mkdirSync(join(root, sub), { recursive: true });
  writeFileSync(join(root, 'brief', '01HQZX3F5G7K9M2N4P6R8S0T40.json'), readFileSync(join(FIXTURES, 'job-brief.json'), 'utf8'));
  writeFileSync(join(root, 'moments', 'moments-fixture.json'), readFileSync(join(FIXTURES, 'moments.json'), 'utf8'));
  const capDir = join(workspace, 'data', 'platform-capabilities');
  mkdirSync(capDir, { recursive: true });
  writeFileSync(join(capDir, 'tiktok-organic-au-fixture.yaml'), readFileSync(join(CUTDOWN_ROOT, 'data', 'platform-capabilities', 'tiktok-organic-au-fixture.yaml'), 'utf8'));
}

/** Write an EDL (mutated from the clean base) under a fresh edlId and return that id. */
function writeEdl(jobId: string, mutate: (edl: Record<string, any>) => void): string {
  const edl = JSON.parse(readFileSync(join(FIXTURES, 'edl-clean.json'), 'utf8')) as Record<string, any>;
  mutate(edl);
  const edlId = edl['edlId'] as string;
  writeFileSync(join(workspace, 'project-data', 'jobs', jobId, 'edl', `${edlId}.json`), JSON.stringify(edl), 'utf8');
  return edlId;
}

function runValidate(request: Record<string, unknown>): Outcome {
  const id = `validate-${process.pid}-${counter++}`;
  const inputPath = join(scratch, `${id}.in.json`);
  const outputPath = join(scratch, `${id}.out.json`);
  writeFileSync(inputPath, JSON.stringify(request), 'utf8');
  const env = { ...process.env, CUTDOWN_WORKSPACE_ROOT: workspace };
  try {
    const stdout = execFileSync(process.execPath, [ENTRY, '--input', inputPath, '--output', outputPath], { encoding: 'utf8', cwd: SKILL_DIR, env, timeout: 60_000 });
    return { status: 0, stdout, stderr: '', outputPath };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '', outputPath };
  }
}

function readOutput(o: Outcome): Record<string, any> {
  assert.equal(o.status, 0, `expected exit 0, got ${o.status}:\n${o.stderr}`);
  return JSON.parse(readFileSync(o.outputPath, 'utf8')) as Record<string, any>;
}

function gateFile(jobId: string, out: Record<string, any>): { gateStatus: string; blockers: Array<{ rule: string; code: string; source: string }>; advisories: unknown[] } {
  return JSON.parse(readFileSync(join(workspace, 'project-data', 'jobs', jobId, out['gatePath'] as string), 'utf8'));
}

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-validate-ws-'));
  scratch = mkdtempSync(join(tmpdir(), 'cutdown-validate-io-'));
});
after(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe('a clean EDL passes; critic findings are advisory, never blockers (D-37)', () => {
  test('gateStatus pass, two files written, critic ran, and no critic finding is a blocker', () => {
    const jobId = 'job-clean';
    seedJob(jobId);
    const edlId = writeEdl(jobId, (e) => { e['edlId'] = '01HQZX3F5G7K9M2N4P6R8S0T60'; });
    const out = readOutput(runValidate({ jobId, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS }));

    assert.equal(out['gateStatus'], 'pass');
    assert.equal(out['blockerCount'], 0);
    assert.equal(out['critic'].status, 'ran');
    assert.equal(out['critic'].findingCount, 3);

    const gate = gateFile(jobId, out);
    assert.equal(gate.gateStatus, 'pass');
    assert.equal(gate.blockers.length, 0);
    // The persisted critic file carries the critic findings, tagged source 'critic'.
    const critic = JSON.parse(readFileSync(join(workspace, 'project-data', 'jobs', jobId, out['criticPath'] as string), 'utf8')) as { findings: Array<{ source: string; severity: string }> };
    assert.equal(critic.findings.length, 3);
    assert.ok(critic.findings.every((f) => f.source === 'critic'));
    // A high-severity critic finding exists, yet the gate still passed.
    assert.ok(critic.findings.some((f) => f.severity === 'high'));
  });
});

describe('each deliberately-broken EDL is BLOCKED, and the critic stays advisory', () => {
  test('an out-of-bounds range fails the gate (edl-resolution) — exit 0, fail is a valid result', () => {
    const jobId = 'job-range';
    seedJob(jobId);
    const edlId = writeEdl(jobId, (e) => { e['edlId'] = '01HQZX3F5G7K9M2N4P6R8S0T61'; e['clips'][0]['sourceRange']['endTicks'] = 2000; });
    const out = readOutput(runValidate({ jobId, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS }));
    assert.equal(out['gateStatus'], 'fail');
    assert.ok(out['blockerCount'] >= 1);
    assert.equal(out['critic'].status, 'ran');
    const gate = gateFile(jobId, out);
    assert.ok(gate.blockers.some((b) => b.rule === 'edl-resolution' && b.source === 'deterministic'));
  });

  test('a prohibited claim in the title fails the gate (prohibited-claims)', () => {
    const jobId = 'job-prohibited';
    seedJob(jobId);
    const edlId = writeEdl(jobId, (e) => { e['edlId'] = '01HQZX3F5G7K9M2N4P6R8S0T62'; e['metadata']['title'] = 'The one algorithm hack you need'; });
    const out = readOutput(runValidate({ jobId, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS }));
    assert.equal(out['gateStatus'], 'fail');
    assert.ok(gateFile(jobId, out).blockers.some((b) => b.code === 'PROHIBITED_CLAIM_PRESENT'));
  });

  test('a reordered quote caption fails the gate (quote-fidelity)', () => {
    const jobId = 'job-quote';
    seedJob(jobId);
    const edlId = writeEdl(jobId, (e) => {
      e['edlId'] = '01HQZX3F5G7K9M2N4P6R8S0T63';
      e['clips'][1]['caption'] = { kind: 'quote', displayText: 'plan the rebuilt', verbatimSourceText: 'we rebuilt the plan', speakerLabel: 'Founder' };
    });
    const out = readOutput(runValidate({ jobId, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS }));
    assert.equal(out['gateStatus'], 'fail');
    assert.ok(gateFile(jobId, out).blockers.some((b) => b.rule === 'quote-fidelity'));
  });
});

describe('unconfigured gateway: the deterministic gate still runs, the critic is skipped', () => {
  test('no recordedModelPath yields a real gateStatus with critic.status skipped', () => {
    const jobId = 'job-nocritic';
    seedJob(jobId);
    const edlId = writeEdl(jobId, (e) => { e['edlId'] = '01HQZX3F5G7K9M2N4P6R8S0T64'; });
    const out = readOutput(runValidate({ jobId, edlId, boundsPath: BOUNDS }));
    assert.equal(out['gateStatus'], 'pass');
    assert.equal(out['critic'].status, 'skipped');
    assert.match(out['critic'].reason as string, /not configured|spend ceiling|key/i);
  });
});
