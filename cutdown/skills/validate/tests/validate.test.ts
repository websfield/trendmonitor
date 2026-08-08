import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * The Phase 5 round-2 security HIGH, as a test.
 *
 * `edlId` is caller-supplied and became BOTH a read path (`edl/<id>.json`) and two
 * WRITE paths (`reviews/gates/<id>-gate.json`, `reviews/<id>-critic.json`) — and
 * `writeJsonAtomic` mkdir -p's the parent. Unguarded, `../<other-job>/edl/<x>` read
 * another job's EDL and then wrote a gate result inside that job's directory,
 * creating directories on the way: job isolation broken from a documented surface
 * (the CLI verb AND the `.claude/skills/cutdown-validate` mirror, whose whole job is
 * turning free text into this request).
 *
 * The `jobId` guard landed in round 1 and this sibling field was routed around it —
 * the same "adjacent field" shape as the Phase 4 gate findings.
 */
describe('a traversing edlId is refused before it reads or writes anything', () => {
  const JOB = 'validate-traversal';
  const VICTIM = 'validate-victim';

  before(() => {
    seedJob(JOB);
    seedJob(VICTIM);
  });

  test('refuses a forward-slash traversal', () => {
    const outcome = runValidate({ jobId: JOB, edlId: `../${VICTIM}/edl/01HQZX3F5G7K9M2N4P6R8S0T99` });
    assert.notEqual(outcome.status, 0, 'a traversing id must never be accepted');
    assert.ok(!existsSync(join(workspace, 'project-data', 'jobs', VICTIM, 'edl', '01HQZX3F5G7K9M2N4P6R8S0T99-gate.json')));
  });

  test('refuses a backslash traversal — win32 normalises both separators', () => {
    const outcome = runValidate({ jobId: JOB, edlId: ['..', VICTIM, 'edl', 'x'].join(String.fromCharCode(92)) });
    assert.notEqual(outcome.status, 0);
  });

  test('refuses an id that is not a ULID at all', () => {
    // The schema pattern catches this first (exit 2); the in-code `assertSafeId` is
    // the second line, for the direct-entrypoint caller.
    const outcome = runValidate({ jobId: JOB, edlId: 'not-a-ulid' });
    assert.notEqual(outcome.status, 0);
  });

  test('writes NOTHING into the victim job', () => {
    // The load-bearing assertion: the victim's directories are exactly as seeded.
    assert.deepEqual(readdirSync(join(workspace, 'project-data', 'jobs', VICTIM)).sort(), ['brief', 'edl', 'moments']);
  });

  test('still accepts a legitimate ULID edlId', () => {
    // The guard must not have broken the ordinary path — the Phase 4 round-2 lesson
    // was a fix that made a whole legitimate asset class unprocessable.
    const edlId = writeEdl(JOB, () => undefined);
    const out = readOutput(runValidate({ jobId: JOB, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS }));
    assert.equal(out['edlId'], edlId);
  });

  test('an ABSENT story plan still produces a gate report; a PRESENT-but-invalid one refuses', () => {
    // `loadCreativeBrief`'s docstring claims "best-effort in ABSENCE only" — and until
    // round 4 that claim had no test, which is the shape that let both round-3 BLOCKs
    // through a green gate. Both halves are asserted here because they pull in opposite
    // directions: absence must NOT block (the cross-check is optional), while a file
    // that fails its own contract must, since `creativeBriefId` is read out of it and
    // joined into a path.
    const edlId = writeEdl(JOB, () => undefined);

    // Absence: no story-plans/ directory at all.
    const absent = readOutput(runValidate({ jobId: JOB, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS }));
    assert.ok(['pass', 'fail'].includes(absent['gateStatus'] as string), 'an optional cross-check cannot decide the gate');

    // Present but contract-invalid: a story plan missing every required field.
    const storyPlansDir = join(workspace, 'project-data', 'jobs', JOB, 'story-plans');
    const edl = JSON.parse(
      readFileSync(join(workspace, 'project-data', 'jobs', JOB, 'edl', `${edlId}.json`), 'utf8'),
    ) as { storyPlanId: string };
    mkdirSync(storyPlansDir, { recursive: true });
    writeFileSync(join(storyPlansDir, `${edl.storyPlanId}.json`), JSON.stringify({ storyPlanId: edl.storyPlanId }));

    const invalid = runValidate({ jobId: JOB, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS });
    assert.equal(invalid.status, 3, 'a stored artefact that fails its own contract is a NAMED refusal');
    assert.match(invalid.stderr, /STORY_PLAN_INVALID/);
    assert.match(invalid.stderr, /master-story-plan-v1/, 'and it names which contract it failed');
    rmSync(storyPlansDir, { recursive: true, force: true });
  });

  test('refuses a RECORDED-FIXTURE override path outside the skill directory', () => {
    // Round-3 security MEDIUM, with round-4's correction folded in.
    //
    // `recordedModelPath` and `boundsPath` are recorded-fixture overrides whose only
    // documented home is `skills/validate/fixtures/`, so containment is right for
    // them. `styleProfilePath` is deliberately NOT in this list — see the next test.
    const edlId = writeEdl(JOB, () => undefined);
    // A REAL file with a marker in it, so the "does not quote the content" assertion
    // below can actually fail. Pointing at a non-existent path would make it vacuous.
    const secret = join(workspace, '.env');
    writeFileSync(secret, 'ANTHROPIC_API_KEY=sk-ant-SECRETLEAKCANARY', 'utf8');
    for (const field of ['recordedModelPath', 'boundsPath'] as const) {
      const result = runValidate({ jobId: JOB, edlId, [field]: secret });
      assert.equal(result.status, 2, `${field} must be refused as a CALLER error, not read and then failed on`);
      assert.match(result.stderr, /PATH_ESCAPES_ROOT/, `${field} names the containment failure`);
      assert.doesNotMatch(
        result.stderr,
        /SECRETLEAKCANARY/,
        `${field}: the refusal must not quote the content of the file it was pointed at`,
      );
    }
  });

  test('ACCEPTS a shipped StyleProfile outside the skill directory, and still leaks nothing', () => {
    // Round-4 security MEDIUM: my round-3 fix contained `styleProfilePath` along with
    // the two fixture overrides, but it is not one of them. It is a documented
    // production option (`cutdown validate --style-profile <file>`), its real profiles
    // ship at `cutdown/data/style-profiles/*.yaml`, and its prohibitedClaims feed the
    // BLOCKING prohibited-claim gate — so containing it refused every legitimate
    // profile and the gate then ran with fewer prohibitions than the brand declares.
    // A guard that breaks the ordinary path is the Phase-4 lesson, twice learned.
    const edlId = writeEdl(JOB, () => undefined);
    const shipped = join(CUTDOWN_ROOT, 'data', 'style-profiles', 'acct-social-soup-001.yaml');
    assert.ok(existsSync(shipped), 'the shipped profile this option exists to load');

    const accepted = runValidate({ jobId: JOB, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS, styleProfilePath: shipped });
    assert.doesNotMatch(
      accepted.stderr,
      /PATH_ESCAPES_ROOT/,
      'a shipped YAML profile is a legitimate input, not a traversal attempt',
    );
    assert.equal(accepted.status, 0, `the documented invocation must succeed: ${accepted.stderr.slice(0, 400)}`);

    // The oracle is closed the other way instead: the load goes through
    // `@cutdown/style`, which validates against style-profile-v1 and reports
    // instancePath/params only — never instance values.
    const secret = join(workspace, '.env');
    writeFileSync(secret, 'ANTHROPIC_API_KEY=sk-ant-SECRETLEAKCANARY', 'utf8');
    const refused = runValidate({ jobId: JOB, edlId, recordedModelPath: RECORDED, boundsPath: BOUNDS, styleProfilePath: secret });
    assert.notEqual(refused.status, 0, 'a non-profile file is still refused');
    assert.doesNotMatch(
      refused.stderr,
      /SECRETLEAKCANARY/,
      'and the refusal never quotes the content of the file it was pointed at',
    );
  });
});
