import assert from 'node:assert/strict';
import { test, describe, after } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CutdownError } from '../src/errors.js';
import { listSkillNames, parseStructuredError, readJson, readSkill, writeJsonAtomic } from '../src/skills.js';

/**
 * Skill discovery, the stderr-recovery path, and atomic writes (tech-spec §6).
 *
 * `parseStructuredError` gets the most attention here because it sits on the
 * failure path, where mistakes hide: it runs only when a skill has ALREADY
 * failed, so a bug in it turns a precise diagnosis into a shrug — and worse,
 * "it invented an error object" and "it correctly reported the skill's error"
 * look identical from the outside. The contract is that it never guesses: an
 * unparseable stream returns null so the caller surfaces the raw text.
 */

const scratch = mkdtempSync(join(tmpdir(), 'cutdown-cli-skills-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('parseStructuredError — recovers the contract, never invents it', () => {
  const valid = { code: 'BRIEF_MISSING_REQUIRED_FIELDS', message: 'Missing accountId.', skill: 'brief', skillVersion: '1.0.0' };

  test('a clean structured error round-trips with every field intact', () => {
    const parsed = parseStructuredError(`${JSON.stringify(valid, null, 2)}\n`);
    assert.deepEqual(parsed, valid);
  });

  test('details survive, since that is where field names and paths live', () => {
    const withDetails = { ...valid, details: { missingFields: ['accountId', 'audience'] } };
    const parsed = parseStructuredError(JSON.stringify(withDetails));
    assert.deepEqual(parsed?.details, { missingFields: ['accountId', 'audience'] });
  });

  test('leading NON-JSON noise is tolerated', () => {
    // The documented reason this scans rather than parsing the whole stream: a
    // dependency deprecation warning ahead of the error must not hide it.
    const parsed = parseStructuredError(
      `(node:123) ExperimentalWarning: something\n${JSON.stringify(valid)}\n`,
    );
    assert.deepEqual(parsed, valid);
  });

  test('an empty or brace-free stream yields null, not a fabricated error', () => {
    for (const stderr of ['', '   ', 'Segmentation fault\n', 'no json here']) {
      assert.equal(parseStructuredError(stderr), null, `must not invent an error from ${JSON.stringify(stderr)}`);
    }
  });

  test('malformed JSON yields null rather than throwing', () => {
    // This runs inside the failure path. If it threw, a skill crash would be
    // replaced by a CLI crash and the original diagnosis would be lost.
    for (const stderr of ['{', '{"code": }', '{"code": "X",}', '{unquoted: 1}']) {
      assert.equal(parseStructuredError(stderr), null, `must tolerate ${JSON.stringify(stderr)}`);
    }
  });

  test('a JSON object missing `code` or `message` is REJECTED', () => {
    // Both fields are mandatory in the contract. Accepting a partial object
    // would let `invokeSkill` rethrow a CutdownError with `code: undefined`,
    // which serialises to an error nobody can grep for.
    assert.equal(parseStructuredError('{"message": "no code"}'), null);
    assert.equal(parseStructuredError('{"code": "NO_MESSAGE"}'), null);
    assert.equal(parseStructuredError('{"code": 42, "message": "wrong type"}'), null);
    assert.equal(parseStructuredError('{"code": "X", "message": 42}'), null);
    assert.equal(parseStructuredError('[]'), null, 'an array is not the contract object');
  });

  test('a non-object JSON value is rejected', () => {
    assert.equal(parseStructuredError('null'), null);
    assert.equal(parseStructuredError('"a string"'), null);
  });

  test('KNOWN LIMIT: noise containing a brace defeats recovery — but fails to null, never to a wrong error', () => {
    // Documenting real behaviour, not aspiration. The doc comment on
    // `parseStructuredError` says it scans for "the last JSON object", but the
    // implementation slices from the FIRST `{` to end-of-stream, so a `{` in the
    // preamble makes the slice unparseable. That is a doc/code mismatch worth
    // knowing about; it is not a safety hole, because the fallback is null and
    // `invokeSkill` then surfaces the raw stderr instead of a wrong diagnosis.
    const parsed = parseStructuredError(`warning {code: 1}\n${JSON.stringify(valid)}\n`);
    assert.equal(parsed, null, 'degrades to null — the caller falls back to raw stderr');
  });
});

describe('readSkill', () => {
  test('a real skill parses, and its entrypoint is an argv ARRAY', () => {
    // Not cosmetic: a string entrypoint would have to be shell-split, and
    // shell-free spawning is what removes an entire injection class (§6.2).
    const skill = readSkill('brief');
    assert.equal(skill.frontmatter.name, 'brief');
    assert.equal(typeof skill.frontmatter.skillVersion, 'string');
    assert.ok(Array.isArray(skill.frontmatter.entrypoint), 'entrypoint must be an array');
    assert.ok(skill.frontmatter.entrypoint.length > 0);
    assert.equal(skill.frontmatter.entrypoint[0], 'node');
    assert.ok(skill.dir.endsWith('brief'), 'dir is the cwd every entrypoint runs in');
    assert.ok(existsSync(join(skill.dir, 'SKILL.md')));
  });

  test('an unknown skill fails with SKILL_NOT_FOUND and LISTS what does exist', () => {
    // A typo is the common case, so the available list is the whole value of
    // this error — without it the operator has to go read the directory.
    assert.throws(
      () => readSkill('breif'),
      (err: unknown) => {
        assert.ok(err instanceof CutdownError);
        assert.equal(err.code, 'SKILL_NOT_FOUND');
        const available = (err.details as { available: string[] }).available;
        assert.ok(Array.isArray(available));
        assert.ok(available.includes('brief'), 'the near-miss the operator meant must be listed');
        return true;
      },
    );
  });

  test('a traversing skill name cannot reach outside the skills root', () => {
    // `readSkill` joins the name into a path. It has no allowlist of its own,
    // so this asserts the outcome that matters: it fails, rather than loading
    // an arbitrary SKILL.md from elsewhere on disk.
    assert.throws(() => readSkill('../../etc'), (err: unknown) => {
      assert.ok(err instanceof CutdownError);
      assert.equal(err.code, 'SKILL_NOT_FOUND');
      return true;
    });
  });
});

describe('listSkillNames', () => {
  test('lists the real skills, sorted, and only directories holding a SKILL.md', () => {
    const names = listSkillNames();
    assert.ok(names.includes('brief'), 'brief must be discoverable');
    assert.ok(names.includes('ingest'), 'ingest must be discoverable');
    assert.deepEqual(names, [...names].sort(), 'order must be stable, so `skills list` output is diffable');
    assert.equal(new Set(names).size, names.length, 'no duplicates');
    for (const name of names) {
      assert.ok(existsSync(join(readSkill(name).dir, 'SKILL.md')));
    }
  });
});

describe('writeJsonAtomic', () => {
  test('it creates missing parent directories', () => {
    const target = join(scratch, 'deep', 'nested', 'result.json');
    writeJsonAtomic(target, { ok: true });
    assert.equal(existsSync(target), true);
  });

  test('it leaves NO temp file behind — a stray .tmp would be read as a result', () => {
    // The results directory is enumerated by later stages; an orphan
    // `<id>.json.<pid>.<ts>.tmp` is indistinguishable from a real artefact to
    // anything globbing for JSON.
    const dir = join(scratch, 'notmp');
    writeJsonAtomic(join(dir, 'a.json'), { a: 1 });
    assert.deepEqual(readdirSync(dir), ['a.json']);
  });

  test('the file is complete and newline-terminated the instant it appears', () => {
    // This is what "atomic" buys: a reader never sees a half-written file,
    // because the rename publishes it whole.
    const target = join(scratch, 'complete.json');
    writeJsonAtomic(target, { nested: { value: 1 }, list: [1, 2] });
    const raw = readFileSync(target, 'utf8');
    assert.ok(raw.endsWith('\n'));
    assert.deepEqual(JSON.parse(raw), { nested: { value: 1 }, list: [1, 2] });
  });

  test('an overwrite fully replaces the previous content', () => {
    // Rename-over, not truncate-and-write: a shorter document must not leave
    // the tail of the longer one behind.
    const target = join(scratch, 'overwrite.json');
    writeJsonAtomic(target, { long: 'x'.repeat(500), extra: true });
    writeJsonAtomic(target, { short: 1 });
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { short: 1 });
  });
});

describe('readJson', () => {
  test('it round-trips what writeJsonAtomic wrote', () => {
    const target = join(scratch, 'roundtrip.json');
    const value = { briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V', warnings: [], nested: { n: 1 } };
    writeJsonAtomic(target, value);
    assert.deepEqual(readJson(target), value);
  });

  test('a missing file THROWS rather than returning undefined', () => {
    // `invokeSkill` relies on this throw to raise SKILL_OUTPUT_MISSING. A silent
    // undefined would let "exit 0 but nothing written" pass as success.
    assert.throws(() => readJson(join(scratch, 'nope.json')));
  });

  test('a malformed file throws rather than yielding a partial object', () => {
    const target = join(scratch, 'broken.json');
    writeFileSync(target, '{"truncated": ', 'utf8');
    assert.throws(() => readJson(target));
  });
});
