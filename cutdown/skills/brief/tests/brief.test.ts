import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAjv, hashContent } from '@cutdown/contracts';

/**
 * The `brief` skill's non-interactive intake contract.
 *
 * The headline behaviour — PRD REQ-002, restated in SKILL.md — is that a brief
 * missing a required field FAILS and NAMES every missing field at once. Both
 * halves matter and both are load-bearing:
 *
 *  - Failing (rather than inferring) is the requirement. An inferred audience or
 *    objective silently changes what the whole downstream pipeline optimises
 *    for, and it does so invisibly, because every later stage treats the guess
 *    as a stated requirement. A test that only checks "exit 2" would still pass
 *    if the skill started guessing and then rejected for some other reason.
 *  - Naming ALL of them at once is what makes the contract usable unattended.
 *    Failing on the first missing field is still "correct" by a loose reading,
 *    and would make an agent discover REQ-002 one round-trip at a time.
 *
 * These drive the real skill as a process, because exit code and stderr ARE the
 * contract; `main.ts` is a top-level-await entrypoint with no exported surface.
 */

const here = dirname(fileURLToPath(import.meta.url));
// tests run from dist/tests/, so climb to the skill root.
const SKILL_DIR = resolve(here, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');

let workspace: string;
let scratch: string;

/** A brief with every REQ-002 required field present and valid. */
function validBrief(): Record<string, unknown> {
  return {
    accountId: 'acct-test-001',
    audience: 'Australian small-business owners aged 28-45',
    objective: 'education_utility',
    platforms: ['tiktok'],
    distributionMode: 'organic',
    durationRange: { minSeconds: 20, maxSeconds: 45 },
    locale: 'en-AU',
    brandOrCampaign: 'Test campaign',
    contentPromise: 'Show how a multi-camera shoot becomes one vertical cut',
    cta: { kind: 'cta', text: 'Follow for more' },
    variantCount: 3,
  };
}

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

interface BriefResult {
  briefId: string;
  jobId: string;
  briefPath: string;
  contentHash: { algorithm: string; value: string };
  warnings: string[];
}

interface StructuredError {
  code: string;
  message: string;
  skill: string;
  skillVersion: string;
  details?: { missingFields?: string[]; formatted?: unknown };
}

let counter = 0;

/** Run the skill against one brief document; returns the outcome and its paths. */
function runBrief(
  brief: unknown,
  options: { jobId?: string } = {},
): Outcome & { jobId: string; outputPath: string } {
  const id = `brieftest-${process.pid}-${counter++}`;
  const jobId = options.jobId ?? id;
  const inputPath = join(scratch, `${id}.in.json`);
  const outputPath = join(scratch, `${id}.out.json`);
  writeFileSync(inputPath, JSON.stringify({ jobId, sourcePath: null, brief }), 'utf8');

  const args = [ENTRY, '--input', inputPath, '--output', outputPath];
  const env = { ...process.env, CUTDOWN_WORKSPACE_ROOT: workspace };
  try {
    const stdout = execFileSync(process.execPath, args, {
      encoding: 'utf8',
      cwd: SKILL_DIR,
      env,
      timeout: 60_000,
    });
    return { status: 0, stdout, stderr: '', jobId, outputPath };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '', jobId, outputPath };
  }
}

function result(outcome: Outcome & { outputPath: string }): BriefResult {
  assert.equal(outcome.status, 0, `expected success but got ${outcome.status}:\n${outcome.stderr}`);
  return JSON.parse(readFileSync(outcome.outputPath, 'utf8')) as BriefResult;
}

function structuredError(outcome: Outcome): StructuredError {
  const start = outcome.stderr.indexOf('{');
  assert.notEqual(start, -1, `no structured error on stderr:\n${outcome.stderr}`);
  return JSON.parse(outcome.stderr.slice(start)) as StructuredError;
}

/** Absolute path to the committed brief for a job, or null when nothing landed. */
function committedBriefPath(jobId: string): string | null {
  const dir = join(workspace, 'project-data', 'jobs', jobId, 'brief');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.length === 1 && files[0] ? join(dir, files[0]) : null;
}

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-brief-ws-'));
  scratch = mkdtempSync(join(tmpdir(), 'cutdown-brief-io-'));
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe('a missing required field FAILS and NAMES the field (REQ-002)', () => {
  test('a brief with no accountId exits 2 and names accountId', () => {
    const brief = validBrief();
    delete brief['accountId'];

    const outcome = runBrief(brief);

    assert.equal(outcome.status, 2, 'a missing field is bad INPUT, so exit 2');
    const error = structuredError(outcome);
    assert.equal(error.code, 'BRIEF_MISSING_REQUIRED_FIELDS');
    assert.match(error.message, /accountId/, 'the message a human reads must name the field');
    assert.deepEqual(error.details?.missingFields, ['accountId'], 'and it must be machine-readable too');
    assert.equal(error.skill, 'brief');
    assert.equal(error.skillVersion, '1.0.0');
  });

  test('nothing is committed when the brief is rejected', () => {
    // A brief on disk is a claim the job has been opened with a valid brief.
    const brief = validBrief();
    delete brief['accountId'];

    const outcome = runBrief(brief);
    assert.equal(outcome.status, 2);
    assert.equal(committedBriefPath(outcome.jobId), null, 'no brief artefact may land');
    assert.equal(existsSync(outcome.outputPath), false, 'and no result file either');
  });

  test('EVERY missing field is reported in one pass, not just the first', () => {
    // The behaviour that makes the non-interactive contract usable. Failing on
    // the first field would still exit 2 with a correct-looking error.
    const brief = validBrief();
    for (const field of ['accountId', 'audience', 'objective', 'cta']) delete brief[field];

    const outcome = runBrief(brief);

    assert.equal(outcome.status, 2);
    const error = structuredError(outcome);
    assert.equal(error.code, 'BRIEF_MISSING_REQUIRED_FIELDS');
    assert.deepEqual(
      error.details?.missingFields,
      ['accountId', 'audience', 'cta', 'objective'],
      'all four, sorted — one edit must be able to fix the whole brief',
    );
    for (const field of ['accountId', 'audience', 'objective', 'cta']) {
      assert.match(error.message, new RegExp(field), `${field} must appear in the human message too`);
    }
    assert.match(error.message, /4 required field/, 'the count must match the list');
  });

  test('an empty brief names all eleven fields a human must supply', () => {
    // briefId and envelope are filled in by the skill, so they must NOT appear:
    // asking an operator for machine-generated bookkeeping is a bug in the
    // error, and it would be an easy one to introduce by validating too early.
    const outcome = runBrief({});

    assert.equal(outcome.status, 2);
    const missing = structuredError(outcome).details?.missingFields ?? [];
    assert.deepEqual(missing, [
      'accountId', 'audience', 'brandOrCampaign', 'contentPromise', 'cta',
      'distributionMode', 'durationRange', 'locale', 'objective', 'platforms', 'variantCount',
    ]);
    assert.ok(!missing.includes('briefId'), 'briefId is minted, never demanded');
    assert.ok(!missing.includes('envelope'), 'the envelope is filled, never demanded');
  });

  test('the error explains WHY the field is not simply inferred', () => {
    // The rationale is the reason the skill is allowed to be this strict; an
    // operator who does not understand it will ask for the guess to be added.
    const brief = validBrief();
    delete brief['audience'];

    const error = structuredError(runBrief(brief));
    assert.match(error.message, /REQ-002/, 'the requirement must be cited');
    assert.match(error.message, /never inferred/);
  });

  test('a field present but of the WRONG TYPE fails as a schema error, not a missing-field one', () => {
    // Different code, because "you left it out" and "you got it wrong" call for
    // different fixes — and `missingFields` would be empty and misleading here.
    const outcome = runBrief({ ...validBrief(), variantCount: 'three' });

    assert.equal(outcome.status, 2);
    const error = structuredError(outcome);
    assert.equal(error.code, 'BRIEF_SCHEMA_INVALID');
    assert.deepEqual(error.details?.missingFields, []);
  });

  test('an out-of-range value is rejected', () => {
    // variantCount has maximum 10; the schema is the only thing enforcing it.
    assert.equal(runBrief({ ...validBrief(), variantCount: 99 }).status, 2);
    assert.equal(runBrief({ ...validBrief(), variantCount: 0 }).status, 2);
  });

  test('an unknown field is rejected rather than silently dropped', () => {
    // job-brief-v1 is additionalProperties:false. A typo'd `audiance` must not
    // vanish while `audience` is separately reported missing.
    const outcome = runBrief({ ...validBrief(), audiance: 'typo' });
    assert.equal(outcome.status, 2);
    assert.equal(structuredError(outcome).code, 'BRIEF_SCHEMA_INVALID');
  });

  test('a bogus enum member is rejected — the registry is real, not decorative', () => {
    assert.equal(runBrief({ ...validBrief(), objective: 'going_viral' }).status, 2);
    assert.equal(runBrief({ ...validBrief(), platforms: ['myspace'] }).status, 2);
    assert.equal(runBrief({ ...validBrief(), distributionMode: 'both' }).status, 2);
  });

  test('no failure path leaks a stack trace to stderr', () => {
    for (const brief of [{}, { ...validBrief(), variantCount: 'x' }, { ...validBrief(), objective: 'nope' }]) {
      const outcome = runBrief(brief);
      assert.ok(!outcome.stderr.includes('    at '), `stack leaked:\n${outcome.stderr.slice(0, 300)}`);
      assert.doesNotThrow(() => JSON.parse(outcome.stderr.trim()), 'stderr must be exactly one JSON object');
    }
  });
});

describe('a valid brief validates and LANDS', () => {
  test('it exits 0 and commits the brief where the result says it did', () => {
    const outcome = runBrief(validBrief());
    const res = result(outcome);

    assert.equal(res.jobId, outcome.jobId);
    assert.match(res.briefId, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'a ULID must be minted');
    assert.equal(res.briefPath, `brief/${res.briefId}.json`);
    assert.deepEqual(res.warnings, [], 'a clean tiktok brief warns about nothing');

    // The path in the result must actually resolve — a result naming a file
    // that is not there is worse than a failure.
    const committed = join(workspace, 'project-data', 'jobs', outcome.jobId, res.briefPath);
    assert.equal(existsSync(committed), true, `briefPath does not resolve: ${res.briefPath}`);
  });

  test('briefPath is job-relative with forward slashes, on every platform', () => {
    // It goes into an artefact that is read on another machine. A Windows
    // backslash path, or a machine-absolute one, does not travel.
    const res = result(runBrief(validBrief()));
    assert.ok(!res.briefPath.includes('\\'), `backslash leaked: ${res.briefPath}`);
    assert.ok(!/^[A-Za-z]:/.test(res.briefPath), `machine-absolute: ${res.briefPath}`);
    assert.ok(!res.briefPath.startsWith('/'), `not job-relative: ${res.briefPath}`);
    assert.match(res.briefPath, /^brief\/[0-9A-HJKMNP-TV-Z]{26}\.json$/);
  });

  test('the committed artefact satisfies job-brief-v1 in full', () => {
    // The skill validated a candidate in memory; this asserts that what reached
    // the disk is the thing that was validated.
    const outcome = runBrief(validBrief());
    const res = result(outcome);
    const committed = JSON.parse(
      readFileSync(join(workspace, 'project-data', 'jobs', outcome.jobId, res.briefPath), 'utf8'),
    ) as Record<string, unknown>;

    const validate = createAjv().getSchema('https://cutdown.local/contracts/schemas/job-brief-v1.json');
    assert.ok(validate, 'job-brief-v1 must be registered');
    assert.equal(validate(committed), true, JSON.stringify(validate.errors, null, 2));
    assert.equal(committed['briefId'], res.briefId, 'the committed briefId must match the reported one');
  });

  test('the envelope is filled in, crediting the skill and version', () => {
    const outcome = runBrief(validBrief());
    const res = result(outcome);
    const committed = JSON.parse(
      readFileSync(join(workspace, 'project-data', 'jobs', outcome.jobId, res.briefPath), 'utf8'),
    ) as { envelope: { schemaVersion: string; createdAt: string; createdBy: Record<string, string> } };

    assert.equal(committed.envelope.schemaVersion, '1.0.0');
    assert.deepEqual(committed.envelope.createdBy, { kind: 'skill', skill: 'brief', skillVersion: '1.0.0' });
    assert.ok(!Number.isNaN(Date.parse(committed.envelope.createdAt)));
  });

  test('a caller-supplied briefId and envelope are PRESERVED, not overwritten', () => {
    // A revision carries its own identity (PRD §5: a revision is a new object
    // with a parent link). Minting a fresh id over the supplied one would break
    // the lineage silently.
    const brief = {
      ...validBrief(),
      briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V',
      parentBriefId: '01HQZX3F5G7K9M2N4P6R8S0T3W',
      envelope: {
        schemaVersion: '1.0.0',
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: { kind: 'human', name: 'Fred Wang' },
      },
    };

    const outcome = runBrief(brief);
    const res = result(outcome);
    assert.equal(res.briefId, '01HQZX3F5G7K9M2N4P6R8S0T2V');

    const committed = JSON.parse(
      readFileSync(join(workspace, 'project-data', 'jobs', outcome.jobId, res.briefPath), 'utf8'),
    ) as { envelope: { createdBy: Record<string, string>; createdAt: string }; parentBriefId: string };
    assert.deepEqual(committed.envelope.createdBy, { kind: 'human', name: 'Fred Wang' }, 'human authorship must survive');
    assert.equal(committed.envelope.createdAt, '2026-01-01T00:00:00Z');
    assert.equal(committed.parentBriefId, '01HQZX3F5G7K9M2N4P6R8S0T3W');
  });

  test('two briefs in one job land as two files, not one overwriting the other', () => {
    const jobId = `brieftest-multi-${process.pid}`;
    const first = result(runBrief(validBrief(), { jobId }));
    const second = result(runBrief({ ...validBrief(), audience: 'a different audience' }, { jobId }));

    assert.notEqual(first.briefId, second.briefId, 'each intake mints its own id');
    const dir = join(workspace, 'project-data', 'jobs', jobId, 'brief');
    assert.equal(readdirSync(dir).length, 2, 'both must survive — briefs are versioned, never edited in place');
  });
});

describe('the content hash', () => {
  test('it is the sha256 of what actually landed on disk', () => {
    // A hash of something other than the committed artefact is worse than no
    // hash: REQ-005 caching would key on it and hit for a different document.
    const outcome = runBrief(validBrief());
    const res = result(outcome);
    const committed = JSON.parse(
      readFileSync(join(workspace, 'project-data', 'jobs', outcome.jobId, res.briefPath), 'utf8'),
    ) as Record<string, unknown>;

    assert.equal(res.contentHash.algorithm, 'sha256');
    assert.match(res.contentHash.value, /^[0-9a-f]{64}$/);
    assert.deepEqual(res.contentHash, hashContent(committed), 'the reported hash must be the hash of the artefact');
  });

  test('two runs of the SAME brief hash identically, despite different timestamps', () => {
    // The REQ-005 cache property, end-to-end. Each run stamps a fresh
    // `createdAt`, and the envelope-exclusion rule is what keeps the hash
    // stable across them — a cache that never hits looks exactly like a cold one.
    const brief = { ...validBrief(), briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V' };
    const first = result(runBrief(brief));
    const second = result(runBrief(brief));

    assert.equal(first.contentHash.value, second.contentHash.value);
  });

  test('a real content change changes the hash', () => {
    // The other half — without this, a hash function returning a constant would
    // pass the stability test above.
    const brief = { ...validBrief(), briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V' };
    const base = result(runBrief(brief));
    const changed = result(runBrief({ ...brief, audience: 'a completely different audience' }));

    assert.notEqual(base.contentHash.value, changed.contentHash.value);
  });
});

describe('cross-field rules the schema subset cannot express', () => {
  test('an inverted durationRange is BLOCKED (tech-spec §3 forbids if/then/else)', () => {
    // JSON Schema cannot relate two fields under the project's style subset, so
    // this rule lives in code — which means only a test keeps it honest.
    const outcome = runBrief({ ...validBrief(), durationRange: { minSeconds: 45, maxSeconds: 20 } });

    assert.equal(outcome.status, 2);
    const error = structuredError(outcome);
    assert.equal(error.code, 'BRIEF_DURATION_RANGE_INVERTED');
    assert.match(error.message, /45/, 'both bounds must be quoted back');
    assert.match(error.message, /20/);
    assert.equal(committedBriefPath(outcome.jobId), null, 'nothing may commit');
  });

  test('an equal min and max is allowed — the rule is `<`, not `<=`', () => {
    // An off-by-one here would reject the legitimate "exactly 30 seconds" brief.
    const res = result(runBrief({ ...validBrief(), durationRange: { minSeconds: 30, maxSeconds: 30 } }));
    assert.deepEqual(res.warnings, []);
  });
});

describe('warnings inform without blocking', () => {
  test('a non-TikTok platform WARNS but still commits (decisions.md D-3)', () => {
    // Deliberately not a block: the brief is legitimate and `propose` can run
    // against it. `plan` is where the missing capability actually bites, and it
    // must fail there explicitly rather than fall back to a generic profile.
    const outcome = runBrief({ ...validBrief(), platforms: ['instagram_reels'] });
    const res = result(outcome);

    assert.equal(res.warnings.length, 1);
    assert.match(res.warnings[0]!, /instagram_reels/, 'the platform must be named');
    assert.match(res.warnings[0]!, /D-3/, 'the decision must be cited so the reader can look it up');
    assert.equal(existsSync(join(workspace, 'project-data', 'jobs', outcome.jobId, res.briefPath)), true);
  });

  test('multiple platforms warn that `plan` runs once per platform (REQ-050)', () => {
    const res = result(runBrief({ ...validBrief(), platforms: ['tiktok', 'youtube_shorts'] }));

    assert.equal(res.warnings.length, 2, 'both the unsupported-platform and the per-platform warnings');
    const joined = res.warnings.join(' ');
    assert.match(joined, /REQ-050/);
    assert.match(joined, /youtube_shorts/);
  });

  test('a single supported platform warns about nothing', () => {
    // The negative control for the two warnings above: neither the
    // unsupported-platform rule nor the multi-platform rule may fire on the
    // one configuration Phase 0 fully supports, or every clean brief would
    // carry noise. (There is no "two supported platforms" case to test —
    // PHASE_0_PLATFORMS contains only `tiktok`, so any second platform is
    // unsupported by construction.)
    const res = result(runBrief({ ...validBrief(), platforms: ['tiktok'], variantCount: 2 }));
    assert.deepEqual(res.warnings, []);
  });

  test('an explicit "no CTA" warns that the choice is carried through', () => {
    // The tagged union makes "we chose none" different from "nobody filled it
    // in"; the warning is what makes the deliberate choice visible downstream.
    const res = result(runBrief({ ...validBrief(), cta: { kind: 'none' } }));

    assert.equal(res.warnings.length, 1);
    assert.match(res.warnings[0]!, /no CTA/i);
  });

  test('a malformed CTA union member is rejected, not warned about', () => {
    // `{ kind: 'cta' }` with no text, and `{ kind: 'none', text: 'x' }`, must
    // both fail the oneOf rather than slipping through as a warning.
    assert.equal(runBrief({ ...validBrief(), cta: { kind: 'cta' } }).status, 2);
    assert.equal(runBrief({ ...validBrief(), cta: { kind: 'none', text: 'x' } }).status, 2);
    assert.equal(runBrief({ ...validBrief(), cta: { kind: 'maybe' } }).status, 2);
  });
});

describe('the request envelope itself', () => {
  test('a request missing `brief` fails against the skill\'s input schema', () => {
    // A different failure from a missing brief FIELD: this one is the caller
    // getting the request shape wrong, caught by the runtime before run().
    const inputPath = join(scratch, `noreq-${process.pid}.json`);
    const outputPath = join(scratch, `noreq-${process.pid}.out.json`);
    writeFileSync(inputPath, JSON.stringify({ jobId: 'x' }), 'utf8');

    let status = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [ENTRY, '--input', inputPath, '--output', outputPath], {
        encoding: 'utf8',
        cwd: SKILL_DIR,
        env: { ...process.env, CUTDOWN_WORKSPACE_ROOT: workspace },
        timeout: 60_000,
      });
    } catch (err) {
      const e = err as { status?: number | null; stderr?: string };
      status = e.status ?? -1;
      stderr = e.stderr ?? '';
    }

    assert.equal(status, 2);
    assert.equal(structuredError({ status, stdout: '', stderr }).code, 'REQUEST_SCHEMA_INVALID');
    assert.equal(existsSync(outputPath), false);
  });
});
