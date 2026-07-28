import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAjv } from '@cutdown/contracts';

/**
 * The `propose` skill's recorded-model contract (tech-spec §6.6, Task 5/10).
 *
 * These run against a RECORDED provider response replayed over an injected
 * transport — never the network. The property assertions are the same ones
 * `cutdown test:models --live` runs against the real gateway: N briefs returned,
 * every referenced Moment id exists in the input, every artefact records model
 * provenance, and the REQ-036 refusal fires when the footage is too thin.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(here, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');
const FIXTURES = join(SKILL_DIR, 'fixtures', 'briefs');

const RECORDED = join(FIXTURES, 'recorded-model.json');
const QUERY_VECTOR = join(FIXTURES, 'query-vector.json');
const CREATIVE_BRIEF_SCHEMA = 'https://cutdown.local/contracts/schemas/creative-brief-v1.json';

const MOMENT_IDS = ['01HQZX3F5G7K9M2N4P6R8S0T2V', '01HQZX3F5G7K9M2N4P6R8S0T30', '01HQZX3F5G7K9M2N4P6R8S0T31', '01HQZX3F5G7K9M2N4P6R8S0T32'];

let workspace: string;
let scratch: string;
let counter = 0;

interface Outcome { status: number; stdout: string; stderr: string; outputPath: string }

function seedJob(jobId: string, momentsOverride?: unknown): void {
  const root = join(workspace, 'project-data', 'jobs', jobId);
  mkdirSync(join(root, 'brief'), { recursive: true });
  mkdirSync(join(root, 'moments'), { recursive: true });
  const brief = readFileSync(join(FIXTURES, 'job-brief.json'), 'utf8');
  writeFileSync(join(root, 'brief', '01HQZX3F5G7K9M2N4P6R8S0T40.json'), brief, 'utf8');
  const moments = momentsOverride ? JSON.stringify(momentsOverride) : readFileSync(join(FIXTURES, 'moments.json'), 'utf8');
  writeFileSync(join(root, 'moments', 'moments-fixture.json'), moments, 'utf8');
}

function runPropose(request: Record<string, unknown>): Outcome {
  const id = `propose-${process.pid}-${counter++}`;
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

function readOutput(o: Outcome): Record<string, unknown> {
  assert.equal(o.status, 0, `expected exit 0, got ${o.status}:\n${o.stderr}`);
  return JSON.parse(readFileSync(o.outputPath, 'utf8')) as Record<string, unknown>;
}

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-propose-ws-'));
  scratch = mkdtempSync(join(tmpdir(), 'cutdown-propose-io-'));
});
after(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe('recorded-model path produces briefs with the required properties', () => {
  test('N briefs are returned (kind=briefs, count matches variants)', () => {
    const jobId = 'job-briefs';
    seedJob(jobId);
    const out = readOutput(runPropose({ jobId, variants: 2, recordedModelPath: RECORDED, queryVectorPath: QUERY_VECTOR }));
    assert.equal(out['kind'], 'briefs');
    assert.equal(out['count'], 2);
    assert.equal((out['briefs'] as unknown[]).length, 2);
  });

  test('every referenced Moment id exists in the input, and every artefact records model provenance + validates', () => {
    const jobId = 'job-props';
    seedJob(jobId);
    const out = readOutput(runPropose({ jobId, variants: 2, recordedModelPath: RECORDED, queryVectorPath: QUERY_VECTOR }));
    const briefs = out['briefs'] as Array<{ creativeBriefId: string; path: string; semanticAngleLabel: string; sharedMomentFraction: number }>;

    const validate = createAjv().getSchema(CREATIVE_BRIEF_SCHEMA);
    assert.ok(validate, 'creative-brief-v1 must be registered');
    const inputIds = new Set(MOMENT_IDS);
    const root = join(workspace, 'project-data', 'jobs', jobId);

    for (const ref of briefs) {
      const committed = JSON.parse(readFileSync(join(root, ref.path), 'utf8')) as {
        selectedMoments: Array<{ momentId: string }>;
        proofPoints: Array<{ evidenceMomentIds: string[] }>;
        modelProvenance: { provider: string; modelId: string; promptTemplateId: string; promptTemplateVersion: string };
        distinctness: { sharedMomentFraction: number; peerBriefLabels: string[] };
      };
      assert.equal(validate(committed), true, JSON.stringify(validate.errors, null, 2));
      for (const m of committed.selectedMoments) assert.ok(inputIds.has(m.momentId), `selected ${m.momentId} not in input`);
      for (const pp of committed.proofPoints) for (const e of pp.evidenceMomentIds) assert.ok(inputIds.has(e), `evidence ${e} not in input`);
      assert.equal(committed.modelProvenance.provider, 'anthropic');
      assert.equal(committed.modelProvenance.promptTemplateId, 'propose-angles');
      assert.ok(typeof committed.distinctness.sharedMomentFraction === 'number', 'distinctness is computed in code');
    }
  });
});

describe('REQ-036 refusal when footage cannot support the request', () => {
  test('one Moment against three variants refuses with a reason, not a padded set', () => {
    const jobId = 'job-refuse';
    const oneMoment = JSON.parse(readFileSync(join(FIXTURES, 'moments.json'), 'utf8')) as unknown[];
    seedJob(jobId, [oneMoment[0]]);
    const out = readOutput(runPropose({ jobId, variants: 3, recordedModelPath: RECORDED, queryVectorPath: QUERY_VECTOR }));
    assert.equal(out['kind'], 'refusal');
    assert.ok((out['missing'] as string[]).length >= 1);
    assert.match(out['narrowerSuggestion'] as string, /REQ-036|narrow|fewer|index/i);
  });
});

describe('unconfigured gateway is a clean skip, not a failure', () => {
  test('no recordedModelPath and no configured gateway yields kind=skipped MODEL_NOT_CONFIGURED', () => {
    const jobId = 'job-skip';
    seedJob(jobId);
    // Sufficient footage, but no recorded path and the temp workspace has no .env/ceiling.
    const out = readOutput(runPropose({ jobId, variants: 2, queryVectorPath: QUERY_VECTOR }));
    assert.equal(out['kind'], 'skipped');
    assert.equal(out['code'], 'MODEL_NOT_CONFIGURED');
  });
});
