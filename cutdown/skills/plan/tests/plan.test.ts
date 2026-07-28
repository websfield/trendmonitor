import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAjv } from '@cutdown/contracts';

/**
 * The `plan` skill's recorded-model contract (tech-spec §6.6, Task 6/10).
 *
 * Replays a captured MasterStoryPlan + PlatformEDL over an injected transport —
 * never the network. Properties: both artefacts are schema-valid and record model
 * provenance; the EDL's ranges pass the deterministic resolveEdl; a non-TikTok
 * platform is refused explicitly (D-3); an unconfigured gateway skips cleanly.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(here, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');
const FIXTURES = join(SKILL_DIR, 'fixtures', 'plan');
const RECORDED = join(FIXTURES, 'recorded-model.json');
const BOUNDS = join(FIXTURES, 'bounds.json');
const CREATIVE_BRIEF_ID = '01HQZX3F5G7K9M2N4P6R8S0T50';

const STORY_SCHEMA = 'https://cutdown.local/contracts/schemas/master-story-plan-v1.json';
const EDL_SCHEMA = 'https://cutdown.local/contracts/schemas/platform-edl-v1.json';

let workspace: string;
let scratch: string;
let counter = 0;

interface Outcome { status: number; stdout: string; stderr: string; outputPath: string }

const CUTDOWN_ROOT = resolve(SKILL_DIR, '..', '..');

function seedJob(jobId: string): void {
  const root = join(workspace, 'project-data', 'jobs', jobId);
  for (const sub of ['brief', 'creative-briefs', 'moments']) mkdirSync(join(root, sub), { recursive: true });
  writeFileSync(join(root, 'brief', '01HQZX3F5G7K9M2N4P6R8S0T40.json'), readFileSync(join(FIXTURES, 'job-brief.json'), 'utf8'));
  writeFileSync(join(root, 'creative-briefs', `${CREATIVE_BRIEF_ID}.json`), readFileSync(join(FIXTURES, 'creative-brief.json'), 'utf8'));
  writeFileSync(join(root, 'moments', 'moments-fixture.json'), readFileSync(join(FIXTURES, 'moments.json'), 'utf8'));
  // The TikTok capability fixture is a repo asset resolved from the workspace root;
  // copy it into the temp workspace so the skill loads it exactly as in production.
  const capDir = join(workspace, 'data', 'platform-capabilities');
  mkdirSync(capDir, { recursive: true });
  writeFileSync(join(capDir, 'tiktok-organic-au-fixture.yaml'), readFileSync(join(CUTDOWN_ROOT, 'data', 'platform-capabilities', 'tiktok-organic-au-fixture.yaml'), 'utf8'));
}

function runPlan(request: Record<string, unknown>): Outcome {
  const id = `plan-${process.pid}-${counter++}`;
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

function structuredError(o: Outcome): { code: string; message: string } {
  const start = o.stderr.indexOf('{');
  assert.notEqual(start, -1, `no structured error:\n${o.stderr}`);
  return JSON.parse(o.stderr.slice(start)) as { code: string; message: string };
}

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-plan-ws-'));
  scratch = mkdtempSync(join(tmpdir(), 'cutdown-plan-io-'));
});
after(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe('recorded-model path plans a story + EDL that validate', () => {
  test('both artefacts are written, schema-valid, and record provenance; the EDL resolves', () => {
    const jobId = 'job-plan';
    seedJob(jobId);
    const out = readOutput(runPlan({ jobId, creativeBriefId: CREATIVE_BRIEF_ID, platform: 'tiktok', recordedModelPath: RECORDED, boundsPath: BOUNDS }));

    assert.equal(out['kind'], 'planned');
    assert.equal((out['validation'] as { ok: boolean }).ok, true);
    assert.equal((out['validation'] as { clipsChecked: number }).clipsChecked, 2);

    const ajv = createAjv();
    const root = join(workspace, 'project-data', 'jobs', jobId);

    const story = JSON.parse(readFileSync(join(root, out['storyPlanPath'] as string), 'utf8')) as { creativeBriefId: string; modelProvenance: { promptTemplateId: string }; beats: unknown[] };
    const validateStory = ajv.getSchema(STORY_SCHEMA);
    assert.ok(validateStory);
    assert.equal(validateStory(story), true, JSON.stringify(validateStory.errors, null, 2));
    assert.equal(story.creativeBriefId, CREATIVE_BRIEF_ID);
    assert.equal(story.modelProvenance.promptTemplateId, 'plan-story');

    const edl = JSON.parse(readFileSync(join(root, out['edlPath'] as string), 'utf8')) as { platform: string; storyPlanId: string; modelProvenance: { promptTemplateId: string }; clips: unknown[] };
    const validateEdl = ajv.getSchema(EDL_SCHEMA);
    assert.ok(validateEdl);
    assert.equal(validateEdl(edl), true, JSON.stringify(validateEdl.errors, null, 2));
    assert.equal(edl.platform, 'tiktok');
    assert.equal(edl.storyPlanId, out['storyPlanId']);
    assert.equal(edl.modelProvenance.promptTemplateId, 'plan-edl');
    assert.equal(edl.clips.length, 2);
  });
});

describe('platform discipline (D-3)', () => {
  test('a non-TikTok platform is refused explicitly (exit 2), no fallback', () => {
    const jobId = 'job-refuse-platform';
    seedJob(jobId);
    const out = runPlan({ jobId, creativeBriefId: CREATIVE_BRIEF_ID, platform: 'instagram_reels', recordedModelPath: RECORDED, boundsPath: BOUNDS });
    assert.equal(out.status, 2);
    const err = structuredError(out);
    assert.equal(err.code, 'PLATFORM_UNSUPPORTED');
    assert.match(err.message, /D-3/);
  });
});

describe('unconfigured gateway is a clean skip', () => {
  test('no recordedModelPath and no configured gateway yields kind=skipped', () => {
    const jobId = 'job-plan-skip';
    seedJob(jobId);
    const out = readOutput(runPlan({ jobId, creativeBriefId: CREATIVE_BRIEF_ID, platform: 'tiktok', boundsPath: BOUNDS }));
    assert.equal(out['kind'], 'skipped');
    assert.equal(out['code'], 'MODEL_NOT_CONFIGURED');
  });
});
