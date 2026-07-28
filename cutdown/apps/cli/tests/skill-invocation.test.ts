import assert from 'node:assert/strict';
import { test, describe, after } from 'node:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { appendRunLog, resolveUserPath } from '../src/commands/skill-invocation.js';
import { CutdownError, EXIT_RUNTIME_FAILURE } from '../src/errors.js';
import { jobPaths } from '../src/paths.js';

/**
 * The two pieces of the invocation path that can be exercised without spawning:
 * user-path resolution and the run log.
 *
 * (The spawn-and-collect half is covered end-to-end by the ingest integration
 * suite, which drives the real CLI against the real fixture corpus.)
 */

const JOB = `clitest-runlog-${process.pid}`;
after(() => rmSync(jobPaths(JOB).root, { recursive: true, force: true }));

describe('resolveUserPath — option-shaped input is rejected', () => {
  test('a leading dash is refused, naming the offending value', () => {
    // The trap this closes: `cutdown ingest --job x` with the path omitted would
    // otherwise make `--job` itself the ingest path. Because argv is spawned
    // shell-free, a dash-leading path would ALSO be re-read as a flag by the
    // child process — so an accepted one is an argument-injection vector, not
    // merely a confusing error.
    assert.throws(
      () => resolveUserPath('--job', 'Ingest path'),
      (err: unknown) => {
        assert.ok(err instanceof CutdownError);
        assert.equal(err.code, 'PATH_OPTION_SHAPED');
        assert.equal(err.exitCode, EXIT_RUNTIME_FAILURE);
        assert.match(err.message, /Ingest path/, 'the label tells the operator WHICH argument was wrong');
        assert.match(err.message, /"--job"/, 'the offending value must be quoted back');
        return true;
      },
    );
  });

  test('every dash-leading form is rejected, long, short, and bare', () => {
    for (const bad of ['-', '--', '-f', '--file', '--', '-rf', '--output=x', '-.']) {
      assert.throws(
        () => resolveUserPath(bad, 'Input'),
        (err: unknown) => {
          assert.ok(err instanceof CutdownError);
          assert.equal(err.code, 'PATH_OPTION_SHAPED');
          return true;
        },
        `must reject ${JSON.stringify(bad)}`,
      );
    }
  });

  test('a dash INSIDE the path is fine — only the first character matters', () => {
    // Rejecting these too would break ordinary filenames like `my-brief.yaml`.
    for (const good of ['my-brief.yaml', 'a/-weird/name.json', './-odd.txt']) {
      assert.doesNotThrow(() => resolveUserPath(good, 'Input'), `must accept ${JSON.stringify(good)}`);
    }
  });

  test('a relative path resolves against cwd and comes back absolute', () => {
    const resolved = resolveUserPath('brief.yaml', 'Brief file');
    assert.ok(isAbsolute(resolved), 'downstream code joins this into spawn argv; it must not stay relative');
    assert.equal(resolved, resolve(process.cwd(), 'brief.yaml'));
  });

  test('an already-absolute path is returned unchanged', () => {
    // Re-resolving an absolute path against cwd would be a no-op on POSIX but
    // can rewrite a drive-relative path on Windows.
    const absolute = resolve(process.cwd(), 'anything.json');
    assert.equal(resolveUserPath(absolute, 'Input'), absolute);
  });

  test('a traversing path is resolved, NOT rejected — this guard is about argv, not containment', () => {
    // Stating the boundary honestly so nobody mistakes this for a sandbox:
    // `--file ../../x.yaml` is a legitimate way to point at a brief outside the
    // workspace. Containment is `assertSafeJobId`'s job, and it applies to the
    // job id, which is the value that becomes a directory name.
    const resolved = resolveUserPath('../outside.yaml', 'Brief file');
    assert.equal(resolved, resolve(process.cwd(), '../outside.yaml'));
    assert.ok(isAbsolute(resolved));
  });
});

describe('appendRunLog — the authoritative append-only record (§5, §8)', () => {
  test('it creates the job root and writes one parseable JSON line', () => {
    appendRunLog(JOB, { event: 'skill-invocation', invocationId: 'A', exitCode: 0 });

    const logPath = jobPaths(JOB).runLog;
    assert.equal(existsSync(logPath), true);
    const lines = readFileSync(logPath, 'utf8').trimEnd().split('\n');
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(entry['event'], 'skill-invocation');
    assert.equal(entry['invocationId'], 'A');
    assert.equal(entry['exitCode'], 0);
  });

  test('it APPENDS — an entry never overwrites the one before it', () => {
    // index.db is a projection of this file and is rebuildable from it; on any
    // divergence the run log wins. That is only true if history accumulates,
    // so a truncating write here would silently destroy job state.
    appendRunLog(JOB, { event: 'skill-invocation', invocationId: 'B' });
    appendRunLog(JOB, { event: 'skill-invocation', invocationId: 'C' });

    const lines = readFileSync(jobPaths(JOB).runLog, 'utf8').trimEnd().split('\n');
    assert.equal(lines.length, 3, 'all three entries must survive');
    const ids = lines.map((l) => (JSON.parse(l) as { invocationId: string }).invocationId);
    assert.deepEqual(ids, ['A', 'B', 'C'], 'in write order');
  });

  test('every line is independently parseable — it is JSONL, not a JSON array', () => {
    // A reader tails this file line by line while a job is still running; a
    // pretty-printed entry spanning several lines would break every one of them.
    const raw = readFileSync(jobPaths(JOB).runLog, 'utf8');
    assert.ok(raw.endsWith('\n'), 'each record must be newline-terminated');
    for (const line of raw.trimEnd().split('\n')) {
      assert.doesNotThrow(() => JSON.parse(line), `not standalone JSON: ${line}`);
    }
  });

  test('loggedAt is stamped on every entry as a parseable ISO instant', () => {
    // The caller supplies no timestamp; without this the log has no ordering
    // information beyond file position.
    for (const line of readFileSync(jobPaths(JOB).runLog, 'utf8').trimEnd().split('\n')) {
      const entry = JSON.parse(line) as { loggedAt: string };
      assert.equal(typeof entry['loggedAt'], 'string');
      assert.ok(!Number.isNaN(Date.parse(entry['loggedAt'])), `unparseable loggedAt: ${entry['loggedAt']}`);
      assert.match(entry['loggedAt'], /Z$/, 'must be UTC — job traces are compared across machines');
    }
  });

  test('a caller-supplied field is not clobbered by the stamp, and vice versa', () => {
    appendRunLog(JOB, { event: 'test', error: null, status: 'completed' });
    const lines = readFileSync(jobPaths(JOB).runLog, 'utf8').trimEnd().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
    assert.equal(entry['status'], 'completed');
    assert.equal(entry['error'], null, 'an explicit null must survive as null');
    assert.ok('loggedAt' in entry);
  });
});
