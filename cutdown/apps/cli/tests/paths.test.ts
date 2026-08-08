import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { JOBS_ROOT, WORKSPACE_ROOT, assertSafeJobId, jobDir, jobPaths } from '../src/paths.js';
import { CutdownError } from '../src/errors.js';

/**
 * `assertSafeJobId` is the only thing standing between a job id and a directory
 * name (tech-spec §9.1). The id arrives from a CLI argument or from free text a
 * conversational agent turned into a request, so it is attacker-adjacent by
 * construction.
 *
 * The failure mode is silent and expensive: a traversing id does not error, it
 * writes client footage somewhere nobody will look for it — and `jobPaths`
 * happily builds ten subdirectories under whatever it is given. So the rejection
 * cases below are asserted individually rather than as a sampled few, and the
 * acceptance cases exist to prove the guard is not simply refusing everything
 * (a guard that rejects all input passes every rejection test ever written).
 */
describe('assertSafeJobId — traversal and escape', () => {
  test('the classic traversal forms are rejected', () => {
    for (const bad of ['..', '../..', '../../etc/passwd', '..\\..\\windows', 'a/../../b']) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('a dot-dot ANYWHERE is rejected, not only as a leading segment', () => {
    // The regex alone would accept `job..1` — dot is a legal character — so the
    // explicit `includes('..')` check is load-bearing. Deleting it leaves a
    // guard that looks right and passes every test that only tries `../`.
    for (const bad of ['job..1', 'a..b', 'x..', 'a.b..c']) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('path separators are rejected on both platforms', () => {
    for (const bad of ['a/b', 'a\\b', '/abs', '\\abs', 'a/', 'a\\']) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('absolute and drive-qualified paths are rejected', () => {
    // A Windows drive letter would make `join(JOBS_ROOT, id)` resolve OUTSIDE
    // the jobs root entirely rather than merely deeper inside it.
    for (const bad of ['C:', 'C:\\tmp', 'C:/tmp', '//server/share', '\\\\server\\share']) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  /**
   * THE SHARED FIXTURE — see the header comment in `safe-id-cases.json`. The
   * same file is driven through `assertSafeId` in `@cutdown/skill-runtime` and
   * through `assert_safe_id` in the Python worker, because these three guards
   * are deliberate duplicates and they had already drifted apart on a trailing
   * newline with nothing to catch it.
   */
  const CASES = JSON.parse(
    readFileSync(
      join(WORKSPACE_ROOT, 'packages', 'skill-runtime', 'tests', 'safe-id-cases.json'),
      'utf8',
    ),
  ) as { accept: string[]; reject: string[] };

  test('agrees with the other two mirrors on every REJECTED id', () => {
    for (const bad of CASES.reject) {
      assert.throws(() => assertSafeJobId(bad), `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('agrees with the other two mirrors on every ACCEPTED id', () => {
    for (const good of CASES.accept) {
      assert.doesNotThrow(() => assertSafeJobId(good), `must accept ${JSON.stringify(good)}`);
    }
  });

  test('a rejected id is a STRUCTURED refusal, not a bare Error with a stack', () => {
    // `reportError` classifies a non-CutdownError as UNEXPECTED_ERROR, exit 1,
    // with `details.stack` — onto the stream four callers parse. A bad job id is
    // a caller error (exit 2), and the other two mirrors already said so.
    try {
      assertSafeJobId('nul');
      throw new Error('expected a rejection');
    } catch (error) {
      assert.ok(error instanceof CutdownError, `expected CutdownError, got ${String(error)}`);
      assert.equal(error.code, 'UNSAFE_ID');
      assert.equal(error.exitCode, 2);
      const details = error.toStructured().details as Record<string, unknown>;
      assert.ok(!('stack' in details), 'a refusal must not leak a stack trace to the parsed stream');
    }
  });

  test('the empty id is rejected', () => {
    // `join(JOBS_ROOT, '')` is JOBS_ROOT itself — an empty id would put job
    // subdirectories directly into the shared jobs root.
    assert.throws(() => assertSafeJobId(''), /Invalid job id/);
  });

  test('an id may not START with a dot, dash, or underscore', () => {
    // A leading dot hides the directory from a plain `ls`; a leading dash makes
    // the id option-shaped for any command that later takes it as an argument.
    for (const bad of ['.hidden', '.', '-lead', '--force', '_lead']) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('whitespace, control characters, and a NUL byte are rejected', () => {
    // A NUL truncates the path at the OS boundary: `job\0../..` would be
    // validated in full by JavaScript and acted on as `job` by some syscalls.
    for (const bad of ['a b', 'a\tb', 'a\nb', 'ab\n', '\na', 'a\0b', 'a\0', 'a\rb']) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('non-ASCII ids are rejected — the charset is an allowlist, not a denylist', () => {
    // Unicode in a directory name is a cross-filesystem normalisation problem
    // (NFC vs NFD on macOS), so two ids that compare unequal in JS can name the
    // same directory. Homoglyphs make that a correctness AND a spoofing issue.
    for (const bad of ['café', 'jobé', '日本語', 'jоb', 'a‮b', '🎬']) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('shell and URL metacharacters are rejected', () => {
    for (const bad of ['a;b', 'a|b', 'a&b', 'a$b', 'a`b', 'a*b', 'a?b', 'a%2e%2e', 'a:b', 'a"b', "a'b"]) {
      assert.throws(() => assertSafeJobId(bad), /Invalid job id/, `must reject ${JSON.stringify(bad)}`);
    }
  });

  test('the length ceiling is 64 characters, inclusive', () => {
    assert.doesNotThrow(() => assertSafeJobId('a'.repeat(64)), '64 is the documented maximum and must pass');
    assert.throws(() => assertSafeJobId('a'.repeat(65)), /Invalid job id/, '65 must fail');
  });

  test('the error names the offending id and the permitted charset', () => {
    // A rejection an operator cannot act on becomes a support ticket. The
    // message must quote what was sent and say what is allowed.
    assert.throws(
      () => assertSafeJobId('../escape'),
      (err: Error) => {
        assert.match(err.message, /"\.\.\/escape"/, 'the rejected id must be quoted back');
        assert.match(err.message, /letters, digits, dot, dash, or underscore/);
        assert.match(err.message, /64/, 'the length limit must be stated');
        return true;
      },
    );
  });

  test('legitimate ids are accepted — the guard must not reject everything', () => {
    for (const good of [
      'a',
      '0',
      'Z9',
      'job-001',
      'job_001',
      'job.001',
      'itest-commit-12345',
      '01HQZX3F5G7K9M2N4P6R8S0T2V',
      'a'.repeat(64),
    ]) {
      assert.doesNotThrow(() => assertSafeJobId(good), `must accept ${JSON.stringify(good)}`);
    }
  });
});

describe('job layout', () => {
  test('every accepted id resolves strictly INSIDE the jobs root', () => {
    // The property that actually matters. `assertSafeJobId` is only useful if
    // the ids it lets through cannot escape; this asserts the two together
    // rather than trusting the regex to imply it.
    for (const good of ['a', 'job-001', 'job.001', 'a'.repeat(64)]) {
      assertSafeJobId(good);
      const rel = relative(JOBS_ROOT, jobDir(good));
      assert.equal(rel, good, `${good} must land directly under the jobs root`);
      assert.ok(!rel.startsWith('..'), 'must not climb out of the jobs root');
      assert.ok(!isAbsolute(rel), 'must not resolve to an unrelated absolute path');
    }
  });

  test('jobPaths exposes the tech-spec §9.1 subdirectories, all under the job root', () => {
    const paths = jobPaths('job-001');
    // Named explicitly: a subdirectory silently dropped from this object means
    // a later stage writes to a path nothing else knows to read or clean up.
    const expected = [
      'brief', 'source', 'proxy', 'index', 'moments', 'creativeBriefs', 'storyPlans',
      'edl', 'renders', 'packages', 'reviews', 'requests', 'results', 'traces',
    ] as const;
    for (const key of expected) {
      const value = paths[key];
      assert.equal(typeof value, 'string');
      assert.ok(value.startsWith(paths.root + sep), `${key} must live under the job root`);
    }
    assert.equal(paths.runLog, `${paths.root}${sep}run-log.jsonl`);
    assert.equal(paths.root, jobDir('job-001'), 'jobPaths and jobDir must agree on the root');
  });

  test('the run log is a FILE at the job root, not inside a subdirectory', () => {
    // §5 makes run-log.jsonl the authoritative append-only record; code that
    // rebuilds index.db looks for it at exactly this path.
    const paths = jobPaths('job-001');
    assert.ok(paths.runLog.endsWith('run-log.jsonl'));
    assert.equal(relative(paths.root, paths.runLog), 'run-log.jsonl');
  });
});
