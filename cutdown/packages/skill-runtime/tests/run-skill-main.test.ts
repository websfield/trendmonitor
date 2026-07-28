import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { StructuredError } from '../src/index.js';

/**
 * The tech-spec §6.2 execution contract, driven end-to-end.
 *
 * `runSkillMain` cannot be meaningfully unit-tested: its whole contract is
 * expressed in process behaviour — the exit code, what lands on stderr, and
 * whether a file exists on disk afterwards. It also sets `process.exitCode` and
 * reads `process.cwd()`, so calling it in-process would both pollute the test
 * runner's own exit status and test a lie about the cwd.
 *
 * So these spawn a real fixture skill, built in a temp directory against the
 * real runtime. Every clause of the contract gets an assertion, and the two that
 * matter most are the ones a hand-rolled `main()` gets wrong first:
 *
 *   1. A validation failure must leave NO output file. A partial or stale result
 *      alongside a non-zero exit is worse than no result — a caller that checks
 *      for the file before the exit code proceeds on garbage.
 *   2. Stderr must never carry a stack trace. Four callers parse this stream and
 *      a human reads it in a transcript.
 */

const here = dirname(fileURLToPath(import.meta.url));
// tests run from dist/tests/, so climb to the package root to find dist/src/.
const RUNTIME_ENTRY = resolve(here, '..', 'src', 'index.js');

let skillDir: string;
let scratch: string;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'FixtureRequest',
  type: 'object',
  additionalProperties: false,
  required: ['value'],
  properties: { value: { type: 'string', minLength: 1 } },
};

const OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'FixtureResult',
  type: 'object',
  additionalProperties: false,
  required: ['echoed'],
  properties: {
    echoed: { type: 'string' },
    workspaceRoot: { type: 'string' },
    traceparent: { type: 'string' },
  },
};

/**
 * A fixture skill whose behaviour is chosen by the CASE environment variable —
 * one skill covering every branch, rather than several near-identical ones.
 */
const DRIVER = `
import { runSkillMain, fail, reject } from ${JSON.stringify(pathToFileURL(RUNTIME_ENTRY).href)};

await runSkillMain({
  name: 'fixture',
  version: '9.9.9',
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  async run(request, ctx) {
    switch (process.env.CASE) {
      case 'reject': throw reject('FIXTURE_REJECTED', 'The caller sent something wrong.', { field: 'value' });
      case 'fail': throw fail('FIXTURE_FAILED', 'The work was not possible.');
      case 'throw': throw new TypeError('an unwrapped dependency error');
      case 'throw-string': throw 'a bare string';
      case 'bad-output': return { notInTheSchema: true };
      case 'ctx': return {
        echoed: request.value,
        workspaceRoot: ctx.workspaceRoot,
        ...(ctx.traceparent ? { traceparent: ctx.traceparent } : {}),
      };
      default: return { echoed: request.value };
    }
  },
});
`;

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function runFixture(args: string[], env: Record<string, string> = {}): Outcome {
  try {
    const stdout = execFileSync(process.execPath, [join(skillDir, 'main.mjs'), ...args], {
      encoding: 'utf8',
      cwd: skillDir,
      env: { ...process.env, ...env },
      timeout: 60_000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** Write a request file and return the input/output path pair for one case. */
function paths(name: string): { input: string; output: string } {
  return { input: join(scratch, `${name}.in.json`), output: join(scratch, `${name}.out.json`) };
}

function writeRequest(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value), 'utf8');
}

function structuredError(stderr: string): StructuredError {
  const start = stderr.indexOf('{');
  assert.notEqual(start, -1, `no structured error on stderr:\n${stderr}`);
  return JSON.parse(stderr.slice(start)) as StructuredError;
}

before(() => {
  skillDir = mkdtempSync(join(tmpdir(), 'cutdown-fixture-skill-'));
  scratch = mkdtempSync(join(tmpdir(), 'cutdown-fixture-io-'));
  mkdirSync(join(skillDir, 'schema'), { recursive: true });
  writeFileSync(join(skillDir, 'schema', 'input.json'), JSON.stringify(INPUT_SCHEMA), 'utf8');
  writeFileSync(join(skillDir, 'schema', 'output.json'), JSON.stringify(OUTPUT_SCHEMA), 'utf8');
  writeFileSync(join(skillDir, 'main.mjs'), DRIVER, 'utf8');
});

after(() => {
  rmSync(skillDir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe('the success path', () => {
  test('a valid request exits 0, writes the result, and says nothing on stderr', () => {
    const { input, output } = paths('ok');
    writeRequest(input, { value: 'hello' });

    const outcome = runFixture(['--input', input, '--output', output]);

    assert.equal(outcome.status, 0, outcome.stderr);
    assert.equal(outcome.stderr, '', 'a successful run must not write to stderr at all');
    assert.equal(existsSync(output), true, 'exit 0 is a claim the output was written');
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { echoed: 'hello' });
  });

  test('the result is written atomically — no temp file survives', () => {
    // The output directory is enumerated by the caller; a stray
    // `<name>.out.json.<pid>.<ts>.tmp` reads as a second, malformed artefact.
    const dir = join(scratch, 'atomic');
    mkdirSync(dir, { recursive: true });
    const input = join(dir, 'in.json');
    const output = join(dir, 'out.json');
    writeRequest(input, { value: 'x' });

    assert.equal(runFixture(['--input', input, '--output', output]).status, 0);
    assert.deepEqual(readdirSync(dir).sort(), ['in.json', 'out.json']);
  });

  test('the output directory is created if it does not exist', () => {
    const { input } = paths('mkdir');
    const output = join(scratch, 'made', 'up', 'path', 'out.json');
    writeRequest(input, { value: 'x' });

    assert.equal(runFixture(['--input', input, '--output', output]).status, 0);
    assert.equal(existsSync(output), true);
  });

  test('the context carries the workspace root and the inherited traceparent', () => {
    // Both come from the environment (§6.2, §13). There is no automatic
    // propagation across spawn, so an unset TRACEPARENT must stay undefined
    // rather than becoming a fabricated one.
    const { input, output } = paths('ctx');
    writeRequest(input, { value: 'x' });
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

    const outcome = runFixture(['--input', input, '--output', output], {
      CASE: 'ctx',
      CUTDOWN_WORKSPACE_ROOT: scratch,
      TRACEPARENT: traceparent,
    });

    assert.equal(outcome.status, 0, outcome.stderr);
    const result = JSON.parse(readFileSync(output, 'utf8')) as Record<string, string>;
    assert.equal(result['workspaceRoot'], scratch, 'CUTDOWN_WORKSPACE_ROOT must win over the cwd-derived guess');
    assert.equal(result['traceparent'], traceparent);
  });
});

describe('argument handling — exit 2 before anything is touched', () => {
  test('a missing --output exits 2 with SKILL_ARGS_INVALID', () => {
    const { input } = paths('noout');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input]);

    assert.equal(outcome.status, 2, 'bad invocation is bad INPUT');
    const error = structuredError(outcome.stderr);
    assert.equal(error.code, 'SKILL_ARGS_INVALID');
    assert.match(error.message, /--input <path> --output <path>/, 'the error must state the correct usage');
    assert.equal(error.skill, 'fixture');
    assert.equal(error.skillVersion, '9.9.9');
  });

  test('a missing --input exits 2', () => {
    const { output } = paths('noin');
    assert.equal(runFixture(['--output', output]).status, 2);
  });

  test('no arguments at all exits 2, not 0', () => {
    const outcome = runFixture([]);
    assert.equal(outcome.status, 2);
    assert.equal(structuredError(outcome.stderr).code, 'SKILL_ARGS_INVALID');
  });

  test('an unknown flag is refused rather than ignored', () => {
    // `strict: true` in the runtime's own parseArgs. Silently ignoring
    // `--outut` would make the skill write nowhere while claiming success.
    const { input, output } = paths('unknownflag');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output, '--verbose']);
    assert.equal(outcome.status, 2);
    assert.equal(structuredError(outcome.stderr).code, 'SKILL_ARGS_INVALID');
  });

  test('a positional argument is refused — this contract is flags-only', () => {
    const { input, output } = paths('positional');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output, 'extra']);
    assert.equal(outcome.status, 2);
    assert.equal(structuredError(outcome.stderr).code, 'SKILL_ARGS_INVALID');
  });
});

describe('input validation — exit 2, and NOTHING written', () => {
  test('a request violating the input schema exits 2 and writes no output file', () => {
    const { input, output } = paths('schemabad');
    writeRequest(input, { value: 123 });

    const outcome = runFixture(['--input', input, '--output', output]);

    assert.equal(outcome.status, 2);
    assert.equal(structuredError(outcome.stderr).code, 'REQUEST_SCHEMA_INVALID');
    assert.equal(existsSync(output), false, 'a rejected request must leave no artefact behind');
  });

  test('the validation error NAMES the offending field', () => {
    // An unattended agent has to be able to fix the request from this message
    // alone; "invalid request" costs a round trip per field.
    const { input, output } = paths('named');
    writeRequest(input, {});

    const error = structuredError(runFixture(['--input', input, '--output', output]).stderr);
    assert.equal(error.code, 'REQUEST_SCHEMA_INVALID');
    const details = error.details as { formatted?: unknown; errors?: unknown[] };
    assert.ok(Array.isArray(details.errors) && details.errors.length > 0, 'raw validator errors must be included');
    assert.match(JSON.stringify(details), /value/, 'the missing property must appear in the details');
  });

  test('an extra property is rejected — additionalProperties: false has teeth', () => {
    const { input, output } = paths('extraprop');
    writeRequest(input, { value: 'x', surprise: true });

    assert.equal(runFixture(['--input', input, '--output', output]).status, 2);
    assert.equal(existsSync(output), false);
  });

  test('a PRE-EXISTING output file is left untouched when the request is rejected', () => {
    // The sharper form of "no partial write": a caller reusing an output path
    // must not be able to read a stale result and mistake it for this run's.
    const { input, output } = paths('stale');
    writeRequest(input, { value: 123 });
    writeFileSync(output, '{"echoed":"from an earlier run"}\n', 'utf8');

    assert.equal(runFixture(['--input', input, '--output', output]).status, 2);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { echoed: 'from an earlier run' });
  });

  test('an unreadable request path exits 2, naming the path', () => {
    const { output } = paths('missingfile');
    const input = join(scratch, 'does-not-exist.json');

    const outcome = runFixture(['--input', input, '--output', output]);
    assert.equal(outcome.status, 2, 'a path the caller got wrong is the caller\'s error');
    const error = structuredError(outcome.stderr);
    assert.equal(error.code, 'REQUEST_UNREADABLE');
    assert.match(error.message, /does-not-exist\.json/);
  });

  test('a malformed JSON request exits 2 as REQUEST_UNREADABLE, not as a crash', () => {
    const { input, output } = paths('badjson');
    writeFileSync(input, '{"value": "unclosed', 'utf8');

    const outcome = runFixture(['--input', input, '--output', output]);
    assert.equal(outcome.status, 2);
    assert.equal(structuredError(outcome.stderr).code, 'REQUEST_UNREADABLE');
    assert.equal(existsSync(output), false);
  });
});

describe('skill-raised errors keep their own code and exit status', () => {
  test('reject() from inside run() surfaces as exit 2 with the skill\'s code and details', () => {
    const { input, output } = paths('rejected');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output], { CASE: 'reject' });

    assert.equal(outcome.status, 2);
    const error = structuredError(outcome.stderr);
    assert.equal(error.code, 'FIXTURE_REJECTED', 'the skill\'s own code must not be replaced by a generic one');
    assert.equal(error.message, 'The caller sent something wrong.');
    assert.deepEqual(error.details, { field: 'value' });
    assert.equal(existsSync(output), false);
  });

  test('fail() from inside run() surfaces as exit 3', () => {
    const { input, output } = paths('failed');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output], { CASE: 'fail' });

    assert.equal(outcome.status, 3, 'the input was fine; the work was not possible');
    assert.equal(structuredError(outcome.stderr).code, 'FIXTURE_FAILED');
    assert.equal(existsSync(output), false);
  });
});

describe('output validation — the skill is held to its OWN contract', () => {
  test('a result the output schema rejects exits 3, not 2', () => {
    // Deliberately a RUNTIME failure: the caller did nothing wrong, so telling
    // it "your input was invalid" would send it off fixing a correct request.
    const { input, output } = paths('badout');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output], { CASE: 'bad-output' });

    assert.equal(outcome.status, 3);
    const error = structuredError(outcome.stderr);
    assert.equal(error.code, 'RESULT_SCHEMA_INVALID');
    assert.match(error.message, /defect in the skill/, 'the message must place the blame accurately');
  });

  test('an invalid result is NEVER written — the malformed artefact must not exist', () => {
    // This is the whole reason output is validated before the write rather than
    // after: otherwise the failure surfaces three stages later, when something
    // tries to read an artefact that has been on disk for an hour.
    const { input, output } = paths('badout2');
    writeRequest(input, { value: 'x' });

    runFixture(['--input', input, '--output', output], { CASE: 'bad-output' });
    assert.equal(existsSync(output), false);
  });
});

describe('unexpected errors are wrapped, not leaked', () => {
  test('a plain throw exits 3 with UNEXPECTED_ERROR and the error TYPE preserved', () => {
    // §6.2 defines only 2 and 3, so emitting 1 here would put an undefined code
    // on the contract. `errorType` keeps the diagnostic value the stack would
    // have carried.
    const { input, output } = paths('threw');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output], { CASE: 'throw' });

    assert.equal(outcome.status, 3);
    const error = structuredError(outcome.stderr);
    assert.equal(error.code, 'UNEXPECTED_ERROR');
    assert.equal(error.message, 'an unwrapped dependency error');
    assert.deepEqual(error.details, { errorType: 'TypeError' });
  });

  test('NO stack trace reaches stderr — four callers parse this stream', () => {
    const { input, output } = paths('nostack');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output], { CASE: 'throw' });

    assert.ok(!outcome.stderr.includes('    at '), `stack leaked:\n${outcome.stderr.slice(0, 400)}`);
    assert.ok(!outcome.stderr.includes('node:internal'), 'internal frames must not leak either');
    // And the stream really is just the one contract object.
    assert.doesNotThrow(() => JSON.parse(outcome.stderr.trim()), 'stderr must be exactly one JSON object');
  });

  test('a thrown non-Error still produces a valid structured error', () => {
    // `throw 'a string'` is legal JavaScript and reaches this handler from
    // dependency code; it must not print "undefined".
    const { input, output } = paths('threwstring');
    writeRequest(input, { value: 'x' });

    const outcome = runFixture(['--input', input, '--output', output], { CASE: 'throw-string' });

    assert.equal(outcome.status, 3);
    const error = structuredError(outcome.stderr);
    assert.equal(error.code, 'UNEXPECTED_ERROR');
    assert.equal(error.message, 'a bare string');
    assert.deepEqual(error.details, { errorType: 'string' });
  });
});

describe('every failure path speaks the full contract shape', () => {
  test('code, message, skill, and skillVersion are present on every error', () => {
    // A caller switches on `code` and shows `message`; a missing `skill` makes a
    // multi-skill run log ambiguous about which one failed.
    const cases: Array<{ label: string; args: (p: { input: string; output: string }) => string[]; env: Record<string, string> }> = [
      { label: 'args', args: (p) => ['--input', p.input], env: {} },
      { label: 'schema', args: (p) => ['--input', p.input, '--output', p.output], env: {} },
      { label: 'reject', args: (p) => ['--input', p.input, '--output', p.output], env: { CASE: 'reject' } },
      { label: 'fail', args: (p) => ['--input', p.input, '--output', p.output], env: { CASE: 'fail' } },
      { label: 'badout', args: (p) => ['--input', p.input, '--output', p.output], env: { CASE: 'bad-output' } },
      { label: 'threw', args: (p) => ['--input', p.input, '--output', p.output], env: { CASE: 'throw' } },
    ];

    for (const { label, args, env } of cases) {
      const p = paths(`shape-${label}`);
      // The `schema` case needs an invalid request; every other case needs a
      // valid one so it reaches the branch under test.
      writeRequest(p.input, label === 'schema' ? { value: 123 } : { value: 'x' });

      const outcome = runFixture(args(p), env);
      assert.notEqual(outcome.status, 0, `${label} must not exit 0`);
      assert.ok([2, 3].includes(outcome.status), `${label} exited ${outcome.status}; §6.2 defines only 2 and 3`);

      const error = structuredError(outcome.stderr);
      assert.equal(typeof error.code, 'string', `${label}: code`);
      assert.match(error.code, /^[A-Z][A-Z0-9_]*$/, `${label}: code must be SCREAMING_SNAKE and greppable`);
      assert.ok(error.message.length > 0, `${label}: message`);
      assert.equal(error.skill, 'fixture', `${label}: skill`);
      assert.equal(error.skillVersion, '9.9.9', `${label}: skillVersion`);
      assert.ok(!outcome.stderr.includes('    at '), `${label}: stack leaked`);
    }
  });
});
