import assert from 'node:assert/strict';
import { test, describe, after } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import {
  EXIT_INPUT_INVALID,
  EXIT_OK,
  EXIT_RUNTIME_FAILURE,
  EXIT_UNEXPECTED,
  SkillError,
  contractValidator,
  fail,
  jobDir,
  reject,
  skillEnvelope,
  writeJsonAtomic,
} from '../src/index.js';

/**
 * The pieces of the runtime every skill calls directly.
 *
 * `fail` vs `reject` gets the most weight here for the same reason the exit
 * codes do: the 3-vs-2 distinction is how a caller decides whether to fix its
 * request or retry the work. A skill that calls `fail` where it means `reject`
 * sends an unattended agent into retrying a request that can never succeed —
 * and the two functions are a copy-paste apart in the source.
 */

const scratch = mkdtempSync(join(tmpdir(), 'cutdown-runtime-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('exit codes', () => {
  test('the four §6.2 codes hold their documented values and are distinct', () => {
    assert.equal(EXIT_OK, 0);
    assert.equal(EXIT_UNEXPECTED, 1);
    assert.equal(EXIT_INPUT_INVALID, 2);
    assert.equal(EXIT_RUNTIME_FAILURE, 3);
    assert.equal(new Set([EXIT_OK, EXIT_UNEXPECTED, EXIT_INPUT_INVALID, EXIT_RUNTIME_FAILURE]).size, 4);
  });
});

describe('fail vs reject', () => {
  test('reject means "the caller sent something wrong" — exit 2', () => {
    const err = reject('BRIEF_MISSING_REQUIRED_FIELDS', 'Missing accountId.');
    assert.ok(err instanceof SkillError);
    assert.ok(err instanceof Error, 'must be throwable and catchable as an Error');
    assert.equal(err.exitCode, EXIT_INPUT_INVALID);
    assert.equal(err.code, 'BRIEF_MISSING_REQUIRED_FIELDS');
    assert.equal(err.message, 'Missing accountId.');
    assert.equal(err.name, 'SkillError');
  });

  test('fail means "input was fine, the work was not possible" — exit 3', () => {
    const err = fail('CONTRACT_UNAVAILABLE', 'Could not load job-brief-v1.');
    assert.equal(err.exitCode, EXIT_RUNTIME_FAILURE);
    assert.equal(err.code, 'CONTRACT_UNAVAILABLE');
  });

  test('the two do NOT produce the same exit code', () => {
    assert.notEqual(fail('A', 'x').exitCode, reject('B', 'x').exitCode);
  });

  test('details are carried through, including falsy and empty values', () => {
    // Field-name lists arrive here; an empty array must stay an empty array
    // rather than being coerced to "no details".
    assert.deepEqual(reject('X', 'y', { missingFields: [] }).details, { missingFields: [] });
    assert.deepEqual(fail('X', 'y', { count: 0 }).details, { count: 0 });
    assert.equal(fail('X', 'y').details, undefined, 'omitted details stay undefined');
  });
});

describe('skillEnvelope', () => {
  test('it stamps the skill as the author, at the current version', () => {
    const envelope = skillEnvelope('brief', '1.0.0');
    assert.equal(envelope.schemaVersion, '1.0.0');
    assert.deepEqual(envelope.createdBy, { kind: 'skill', skill: 'brief', skillVersion: '1.0.0' });
  });

  test('createdAt is a parseable UTC ISO instant', () => {
    // It lands in a committed artefact and is compared across machines, so a
    // local-time or unparseable stamp is a cross-machine correctness problem.
    const { createdAt } = skillEnvelope('brief', '1.0.0');
    assert.ok(!Number.isNaN(Date.parse(createdAt)), `unparseable: ${createdAt}`);
    assert.match(createdAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/, 'must be UTC');
  });

  test('the envelope validates against the contract envelope schema', () => {
    // The point of the helper is that a skill cannot hand-roll a malformed one.
    const ajv = contractValidator();
    const validate = ajv.getSchema('https://cutdown.local/contracts/schemas/common/envelope-v1.json');
    assert.ok(validate, 'envelope-v1 must be registered on the shared validator');
    assert.equal(validate(skillEnvelope('brief', '1.0.0')), true, JSON.stringify(validate.errors));
  });
});

describe('contractValidator', () => {
  test('it knows the contract schemas by $id, so skills can validate what they emit', () => {
    const ajv = contractValidator();
    assert.ok(ajv.getSchema('https://cutdown.local/contracts/schemas/job-brief-v1.json'), 'job-brief-v1 must resolve');
  });

  test('a $ref into a shared enum actually RESOLVES rather than silently passing', () => {
    // The failure this catches is the quiet one: if the enum registry were not
    // registered, Ajv would either throw at compile time or (worse, in some
    // configurations) treat the $ref as unconstrained — and every invalid
    // objective would validate.
    const validate = contractValidator().getSchema('https://cutdown.local/contracts/schemas/job-brief-v1.json');
    assert.ok(validate);
    const brief = {
      briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V',
      envelope: skillEnvelope('brief', '1.0.0'),
      accountId: 'acct-1',
      audience: 'someone',
      objective: 'education_utility',
      platforms: ['tiktok'],
      distributionMode: 'organic',
      durationRange: { minSeconds: 20, maxSeconds: 45 },
      locale: 'en-AU',
      brandOrCampaign: 'campaign',
      contentPromise: 'a promise',
      cta: { kind: 'none' },
      variantCount: 1,
    };
    assert.equal(validate(brief), true, JSON.stringify(validate.errors));
    // Same brief, one enum member that does not exist.
    assert.equal(validate({ ...brief, objective: 'not_an_objective' }), false, 'a bogus enum member must be rejected');
  });
});

describe('jobDir', () => {
  test('it lands under project-data/jobs/<jobId>', () => {
    assert.equal(jobDir('/root', 'job-001'), join('/root', 'project-data', 'jobs', 'job-001'));
    assert.ok(jobDir('/root', 'job-001').endsWith(`jobs${sep}job-001`));
  });
});

describe('writeJsonAtomic', () => {
  test('it creates missing parent directories', () => {
    const target = join(scratch, 'a', 'b', 'c', 'out.json');
    writeJsonAtomic(target, { ok: true });
    assert.equal(existsSync(target), true);
  });

  test('it leaves NO temp file behind', () => {
    // Skills write into `results/`, which later stages enumerate. A leftover
    // `.tmp` is indistinguishable from a real artefact to anything globbing.
    const dir = join(scratch, 'notmp');
    writeJsonAtomic(join(dir, 'r.json'), { a: 1 });
    assert.deepEqual(readdirSync(dir), ['r.json']);
  });

  test('the published file is complete, indented, and newline-terminated', () => {
    const target = join(scratch, 'complete.json');
    writeJsonAtomic(target, { nested: { value: 1 } });
    const raw = readFileSync(target, 'utf8');
    assert.ok(raw.endsWith('\n'));
    assert.ok(raw.includes('\n  '), 'written with indent 2, so a committed artefact is diffable');
    assert.deepEqual(JSON.parse(raw), { nested: { value: 1 } });
  });

  test('an overwrite fully replaces the previous content', () => {
    const target = join(scratch, 'over.json');
    writeJsonAtomic(target, { long: 'x'.repeat(400) });
    writeJsonAtomic(target, { short: 1 });
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { short: 1 });
  });
});
