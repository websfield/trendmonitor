import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test, describe, after } from 'node:test';

import { evaluateDates, resolveRights } from '../src/rights.js';

/**
 * End-to-end tests for the `ingest` skill's ATOMICITY and rights guarantees.
 *
 * The unit tests next door cover `classifyAsset` and `resolveRights` as pure
 * functions. These drive the real skill through the real CLI against the real
 * fixture corpus, because the properties that matter most — "no partial job
 * inventory lands", "a proxy path resolves after promotion" — are properties of
 * the orchestration, and every one of the defects found in review lived there
 * rather than in the pure functions.
 */

const here = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(here, '..', '..', '..', '..');
const CLI = join(WORKSPACE, 'apps', 'cli', 'dist', 'src', 'main.js');
const FIXTURES = join(WORKSPACE, 'data', 'golden-sets', 'ingest');
const JOBS = join(WORKSPACE, 'project-data', 'jobs');

const created: string[] = [];

function jobName(suffix: string): string {
  const name = `itest-${suffix}-${process.pid}`;
  created.push(name);
  return name;
}

interface RunOutcome {
  status: number;
  stdout: string;
  stderr: string;
}

function runIngest(args: string[]): RunOutcome {
  try {
    const stdout = execFileSync(process.execPath, [CLI, 'ingest', ...args], {
      encoding: 'utf8',
      cwd: WORKSPACE,
      timeout: 300_000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function assetArtefacts(job: string): Array<Record<string, unknown>> {
  const dir = join(JOBS, job, 'assets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>);
}

after(() => {
  for (const job of created) rmSync(join(JOBS, job), { recursive: true, force: true });
});

describe('ingest — atomicity (the plan\'s headline guarantee)', () => {
  test('an unsupported member fails the WHOLE ingest and commits nothing', () => {
    const job = jobName('rollback');
    const outcome = runIngest([join(FIXTURES, 'mixed-job-unsupported'), '--job', job]);

    assert.equal(outcome.status, 2, 'An unclassifiable member is bad INPUT, so exit 2.');
    assert.match(outcome.stderr, /INGEST_UNSUPPORTED_ASSET/);
    assert.match(outcome.stderr, /notes\.xyz/, 'The offending relative path must be named.');

    // The guarantee: nothing committed. Note that the sibling directory
    // contains six PERFECTLY VALID assets — five of which were fully hashed,
    // preflighted and proxied before the sixth failed. If staging were not
    // working, they would be sitting in the job right now.
    assert.deepEqual(assetArtefacts(job), [], 'No SourceAsset artefact may be committed.');
    assert.equal(existsSync(join(JOBS, job, 'source')), false, 'No source/ directory may be committed.');
    assert.equal(existsSync(join(JOBS, job, 'proxy')), false, 'No proxy/ directory may be committed.');
  });

  test('no staging directory is left behind after a failure', () => {
    const job = jobName('nostage');
    runIngest([join(FIXTURES, 'mixed-job-unsupported'), '--job', job]);
    const jobRoot = join(JOBS, job);
    const leftovers = existsSync(jobRoot)
      ? readdirSync(jobRoot).filter((e) => e.startsWith('.staging-'))
      : [];
    assert.deepEqual(leftovers, [], 'Staging must be removed on the failure path.');
  });

  test('a successful ingest commits every asset AND an inventory', () => {
    const job = jobName('commit');
    const outcome = runIngest([join(FIXTURES, 'mixed-job-valid'), '--job', job]);
    assert.equal(outcome.status, 0, outcome.stderr);

    const assets = assetArtefacts(job);
    assert.equal(assets.length, 6, 'All six REQ-001 asset classes must land.');

    // The inventory is promoted alongside the assets it indexes, so committed
    // assets can never exist without one.
    const inventories = readdirSync(join(JOBS, job, 'source')).filter((f) => f.startsWith('inventory-'));
    assert.equal(inventories.length, 1);
    const inventory = JSON.parse(
      readFileSync(join(JOBS, job, 'source', inventories[0]!), 'utf8'),
    ) as { assetIds: string[] };
    assert.equal(inventory.assetIds.length, 6, 'The inventory must reference every committed asset.');
  });
});

describe('ingest — committed artefacts are well-formed', () => {
  test('every proxy storedPath is job-relative and actually resolves', () => {
    // Regression for the defect where `generateProxy` returned its absolute
    // staging path, which `promote()` then deleted — leaving a dangling,
    // machine-specific, per-run-unique path in a committed artefact.
    const job = jobName('proxypath');
    const outcome = runIngest([join(FIXTURES, 'mixed-job-valid'), '--job', job]);
    assert.equal(outcome.status, 0, outcome.stderr);

    const withProxy = assetArtefacts(job).filter((a) => a['proxy'] !== null);
    assert.ok(withProxy.length >= 1, 'At least one video asset should carry a proxy.');

    for (const asset of withProxy) {
      const proxy = asset['proxy'] as { storedPath: string };
      assert.ok(!proxy.storedPath.includes('.staging-'), `Proxy path leaks staging: ${proxy.storedPath}`);
      assert.ok(!/^[A-Za-z]:[\\/]/.test(proxy.storedPath), `Proxy path is machine-absolute: ${proxy.storedPath}`);
      assert.match(proxy.storedPath, /^proxy\//, 'Proxy path must be job-relative, matching storedPath.');
      assert.ok(
        existsSync(join(JOBS, job, proxy.storedPath)),
        `Proxy path does not resolve after promotion: ${proxy.storedPath}`,
      );
    }
  });

  test('an asset with no rights sidecar lands `unknown`, never `cleared`', () => {
    const job = jobName('rights');
    const outcome = runIngest([join(FIXTURES, 'mixed-job-valid'), '--job', job]);
    assert.equal(outcome.status, 0, outcome.stderr);

    const heroStill = assetArtefacts(job).find((a) => a['relativePath'] === 'hero-still.jpg');
    assert.ok(heroStill, 'The deliberately un-sidecarred fixture must be present.');
    assert.equal((heroStill['rights'] as { state: string }).state, 'unknown');
  });

  test('re-ingesting the same corpus is a full cache hit (REQ-005)', () => {
    const job = jobName('cache');
    assert.equal(runIngest([join(FIXTURES, 'mixed-job-valid'), '--job', job]).status, 0);
    const second = runIngest([join(FIXTURES, 'mixed-job-valid'), '--job', job]);
    assert.equal(second.status, 0, second.stderr);
    const result = JSON.parse(second.stdout) as { cacheHits: number; assetCount: number };
    assert.equal(result.cacheHits, result.assetCount, 'Reusing footage must repeat no work.');
  });
});

describe('ingest — malformed input is reported as input error, not a skill defect', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'cutdown-ingest-'));
  after(() => rmSync(scratch, { recursive: true, force: true }));

  test('a corrupt YAML sidecar exits 2, not 1, and carries no stack trace', () => {
    // Regression: an unwrapped YAMLParseError escaped as UNEXPECTED_ERROR with
    // exit 1 and a full stack — three §6.2 breaches at once, and it blamed the
    // skill for what was a user-input problem.
    const dir = join(scratch, 'bad-sidecar');
    const job = jobName('badyaml');
    execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(dir)},{recursive:true})`]);
    writeFileSync(join(dir, 'clip.mp4'), readFileSync(join(FIXTURES, 'clean.mp4')));
    writeFileSync(join(dir, 'clip.mp4.rights.yaml'), 'state: cleared\n\tbroken: [unclosed\n', 'utf8');

    const outcome = runIngest([dir, '--job', job]);
    // Asserting the exact code, not merely "not 0 and not 1". The earlier
    // version was named "exits 2" while accepting 3 as well — a test name that
    // claims more than its assertion checks is the same honesty failure it
    // exists to guard against.
    assert.equal(
      outcome.status,
      2,
      `A malformed sidecar is USER input, so exit 2 — the same code a malformed job-level manifest gets.\n${outcome.stderr.slice(0, 400)}`,
    );
    assert.match(outcome.stderr, /RIGHTS_SIDECAR_INVALID/);
    assert.ok(
      !outcome.stderr.includes('    at '),
      `Stack trace leaked to stderr — callers parse this stream:\n${outcome.stderr.slice(0, 400)}`,
    );
  });
});

describe('rights — date handling fails closed', () => {
  const NOW = new Date('2026-07-21T00:00:00Z');

  test('a datetime-shaped expiry is NOT silently treated as unexpired', () => {
    // Regression for the reproduced fail-open: `Date.parse(d + 'T23:59:59Z')`
    // returned NaN for any non-bare date, which read as "not expired", so a
    // licence two years dead resolved to `cleared`.
    for (const value of ['2024-01-01T00:00:00Z', '2024-01-01T00:00:00+10:00', 'not-a-date', '2024-13-45']) {
      const resolved = resolveRights(
        { state: 'cleared', owner: 'X', expiryDate: value, evidenceUri: 'file:./x' },
        'sidecar',
        'x.mp4',
        NOW,
      );
      assert.notEqual(
        resolved.record.state,
        'cleared',
        `expiryDate ${JSON.stringify(value)} resolved to \`cleared\` — rights must fail closed.`,
      );
      assert.ok(resolved.warnings.length > 0, 'The reason must be surfaced, not swallowed.');
    }
  });

  test('a non-STRING date is reported, not silently dropped', () => {
    // `expiryDate: 20240101` unquoted is a YAML integer, and an earlier
    // string-or-null coercion turned it into `null` — indistinguishable from
    // "no expiry declared", so a `cleared` record kept its clearance. Same
    // fail-open class as the format defect, narrower trigger.
    for (const value of [20240101, new Date('2024-01-01'), ['2024-01-01']]) {
      const resolved = resolveRights(
        { state: 'cleared', owner: 'X', expiryDate: value as never, evidenceUri: 'file:./x' },
        'sidecar',
        'x.mp4',
        NOW,
      );
      assert.equal(
        resolved.record.state,
        'unknown',
        `A non-string expiryDate (${typeof value}) must not leave the record \`cleared\`.`,
      );
    }
  });

  test('an unreadable date is committed as null, not written back verbatim', () => {
    // The committed record must satisfy `format: date` in rights-record-v1.
    // Writing the raw value back made the artefact fail its own contract, which
    // meant this `unknown` resolution could never actually be observed.
    const resolved = resolveRights(
      { state: 'cleared', owner: 'X', expiryDate: '2024-01-01T00:00:00Z', evidenceUri: 'file:./x' },
      'sidecar',
      'x.mp4',
      NOW,
    );
    assert.equal(resolved.record.state, 'unknown');
    assert.equal(resolved.record.expiryDate, null, 'The unreadable value must not reach the artefact.');
    assert.match(resolved.warnings.join(' '), /2024-01-01T00:00:00Z/, 'but it must be preserved in the warning.');
  });

  test('evaluateDates reports unparseable values instead of ignoring them', () => {
    const evaluated = evaluateDates(['2024-01-01T00:00:00Z', '2030-01-01'], NOW);
    assert.deepEqual(evaluated.unparseable, ['2024-01-01T00:00:00Z']);
    assert.equal(evaluated.expiredOn, null);
  });

  test('a bare past date still expires normally', () => {
    assert.equal(evaluateDates(['2024-01-01'], NOW).expiredOn, '2024-01-01');
  });
});
