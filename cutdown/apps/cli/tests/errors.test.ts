import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import {
  CutdownError,
  EXIT_INPUT_INVALID,
  EXIT_OK,
  EXIT_RUNTIME_FAILURE,
  EXIT_UNEXPECTED,
  inputInvalid,
  reportError,
  runtimeFailure,
  type StructuredError,
} from '../src/errors.js';

/**
 * The tech-spec §6.2 structured-error contract.
 *
 * Four callers (CLI, local runner, Temporal activity, HTTP shim) parse this
 * shape, and a human reading a Claude Code transcript reads it too. That makes
 * both halves — the JSON object AND the exit code — a published interface, not
 * an implementation detail: the 2-vs-3 distinction is how a caller decides
 * whether to fix its request or retry the work, so getting it backwards sends a
 * caller into an infinite retry of a request that will never succeed.
 */

/** Run `fn` with stderr captured, so a passing test prints nothing. */
function captureStderr(fn: () => number): { code: number; stderr: string } {
  const original = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;
  try {
    return { code: fn(), stderr: captured };
  } finally {
    process.stderr.write = original;
  }
}

describe('exit codes are part of the contract', () => {
  test('the four codes are distinct and hold their documented values', () => {
    // Asserting the literals, not merely their distinctness: these numbers are
    // written into the tech spec and into every caller's branching, so a
    // renumbering must break here rather than in production.
    assert.equal(EXIT_OK, 0);
    assert.equal(EXIT_UNEXPECTED, 1);
    assert.equal(EXIT_INPUT_INVALID, 2);
    assert.equal(EXIT_RUNTIME_FAILURE, 3);
    assert.equal(new Set([EXIT_OK, EXIT_UNEXPECTED, EXIT_INPUT_INVALID, EXIT_RUNTIME_FAILURE]).size, 4);
  });
});

describe('CutdownError', () => {
  const init = {
    code: 'THING_BROKE',
    message: 'The thing broke.',
    skill: 'brief',
    skillVersion: '1.0.0',
    exitCode: EXIT_RUNTIME_FAILURE,
  };

  test('it is a real Error, so `throw` and `instanceof` both behave', () => {
    const err = new CutdownError(init);
    assert.ok(err instanceof Error, 'must extend Error or stack capture and catch-blocks misbehave');
    assert.ok(err instanceof CutdownError);
    assert.equal(err.name, 'CutdownError');
    assert.equal(err.message, 'The thing broke.', 'Error.message must carry the human sentence');
  });

  test('every contract field is preserved verbatim', () => {
    const err = new CutdownError({ ...init, details: { field: 'accountId' } });
    assert.equal(err.code, 'THING_BROKE');
    assert.equal(err.skill, 'brief');
    assert.equal(err.skillVersion, '1.0.0');
    assert.equal(err.exitCode, EXIT_RUNTIME_FAILURE);
    assert.deepEqual(err.details, { field: 'accountId' });
  });

  test('toStructured OMITS `details` entirely when there is none', () => {
    // `details` is optional in the schema. Emitting `"details": null` would make
    // a consumer that checks `'details' in error` see a detail object that is
    // not there — the difference between "no detail" and "detail is null".
    const structured = new CutdownError(init).toStructured();
    assert.deepEqual(structured, {
      code: 'THING_BROKE',
      message: 'The thing broke.',
      skill: 'brief',
      skillVersion: '1.0.0',
    });
    assert.ok(!('details' in structured), '`details` must be absent, not present-and-undefined');
  });

  test('toStructured includes `details` when present, and drops nothing else', () => {
    const structured = new CutdownError({ ...init, details: { missingFields: ['accountId'] } }).toStructured();
    assert.deepEqual(structured, {
      code: 'THING_BROKE',
      message: 'The thing broke.',
      skill: 'brief',
      skillVersion: '1.0.0',
      details: { missingFields: ['accountId'] },
    });
  });

  test('toStructured output survives a JSON round-trip unchanged', () => {
    // It is written to stderr with JSON.stringify and read back with JSON.parse
    // by four callers; anything non-serialisable here is a silent data loss.
    const structured = new CutdownError({ ...init, details: { n: 1, s: 'x', a: [1, 2] } }).toStructured();
    assert.deepEqual(JSON.parse(JSON.stringify(structured)) as StructuredError, structured);
  });
});

describe('the 2-vs-3 distinction', () => {
  test('inputInvalid means "the caller sent something wrong" — exit 2', () => {
    const err = inputInvalid({ code: 'BAD_REQUEST', message: 'x', skill: 'cli', skillVersion: '1.0.0' });
    assert.equal(err.exitCode, EXIT_INPUT_INVALID);
    assert.equal(err.exitCode, 2);
  });

  test('runtimeFailure means "input was fine, the work was not possible" — exit 3', () => {
    const err = runtimeFailure({ code: 'DISK_FULL', message: 'x', skill: 'cli', skillVersion: '1.0.0' });
    assert.equal(err.exitCode, EXIT_RUNTIME_FAILURE);
    assert.equal(err.exitCode, 3);
  });

  test('the two constructors do not produce the same exit code', () => {
    // The one assertion that catches a copy-paste in the constructor pair —
    // which is exactly how this class of bug is introduced.
    const a = inputInvalid({ code: 'A', message: 'x', skill: 's', skillVersion: '1' });
    const b = runtimeFailure({ code: 'B', message: 'x', skill: 's', skillVersion: '1' });
    assert.notEqual(a.exitCode, b.exitCode);
  });
});

describe('reportError', () => {
  test('a CutdownError is written verbatim and returns ITS exit code', () => {
    const err = inputInvalid({
      code: 'BRIEF_MISSING_REQUIRED_FIELDS',
      message: 'The brief is missing 1 required field(s): accountId.',
      skill: 'brief',
      skillVersion: '1.0.0',
      details: { missingFields: ['accountId'] },
    });

    const { code, stderr } = captureStderr(() => reportError(err, 'ignored', '0.0.0'));

    assert.equal(code, EXIT_INPUT_INVALID, 'the error carries its own exit code; the caller must not override it');
    const parsed = JSON.parse(stderr) as StructuredError;
    assert.equal(parsed.code, 'BRIEF_MISSING_REQUIRED_FIELDS');
    assert.equal(parsed.skill, 'brief', 'the ERROR\'s skill wins over the fallback argument');
    assert.equal(parsed.skillVersion, '1.0.0');
    assert.deepEqual(parsed.details, { missingFields: ['accountId'] });
  });

  test('stderr carries exactly ONE JSON object and a trailing newline', () => {
    // The runner recovers this by parsing from the first `{` to end of stream,
    // so a second object or trailing prose would make it unparseable.
    const { stderr } = captureStderr(() =>
      reportError(inputInvalid({ code: 'X', message: 'y', skill: 's', skillVersion: '1' }), 's', '1'),
    );
    assert.ok(stderr.endsWith('\n'), 'must end with a newline so line-oriented readers see a complete record');
    assert.doesNotThrow(() => JSON.parse(stderr), 'the whole stream must be one parseable object');
    assert.equal(stderr.trimEnd().split('\n').filter((l) => l === '}').length, 1, 'exactly one object');
  });

  test('a plain Error is WRAPPED, never leaked — exit 1 and UNEXPECTED_ERROR', () => {
    // A caller parsing stderr must never have to tell "a skill failed" from
    // "Node threw". Exit 1 is the honest signal that this was not a contract
    // outcome — it is deliberately NOT 2 or 3.
    const { code, stderr } = captureStderr(() => reportError(new Error('boom'), 'cli', '1.0.0'));

    assert.equal(code, EXIT_UNEXPECTED);
    const parsed = JSON.parse(stderr) as StructuredError;
    assert.equal(parsed.code, 'UNEXPECTED_ERROR');
    assert.equal(parsed.message, 'boom', 'the original message must be preserved');
    assert.equal(parsed.skill, 'cli', 'the fallback skill is used when the error carries none');
    assert.equal(parsed.skillVersion, '1.0.0');
  });

  test('a thrown non-Error (string, null) is still valid structured JSON', () => {
    // `throw 'oops'` and `throw null` are legal JavaScript and reach this
    // function from dependency code. Neither may produce "undefined" on stderr.
    for (const thrown of ['oops', null, 42, undefined]) {
      const { code, stderr } = captureStderr(() => reportError(thrown, 'cli', '1.0.0'));
      assert.equal(code, EXIT_UNEXPECTED);
      const parsed = JSON.parse(stderr) as StructuredError;
      assert.equal(parsed.code, 'UNEXPECTED_ERROR');
      assert.equal(parsed.message, String(thrown), `message must be String(${String(thrown)})`);
      assert.equal(typeof parsed.skill, 'string');
    }
  });

  test('a subclass-shaped impostor is not mistaken for a CutdownError', () => {
    // A plain object carrying `code` and `exitCode` must NOT be trusted to set
    // the process exit code — only a real CutdownError may. Otherwise arbitrary
    // thrown data from a dependency could choose the CLI's exit status.
    const impostor = Object.assign(new Error('nope'), { code: 'FAKE', exitCode: 0 });
    const { code, stderr } = captureStderr(() => reportError(impostor, 'cli', '1.0.0'));
    assert.equal(code, EXIT_UNEXPECTED, 'an impostor must not be able to claim exit 0');
    assert.equal((JSON.parse(stderr) as StructuredError).code, 'UNEXPECTED_ERROR');
  });
});
