import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { parse, requirePositional, requireString } from '../src/args.js';

/**
 * Argument parsing is where a typo becomes a wrong render.
 *
 * The comment on `parse` names the failure it exists to prevent: silently
 * ignoring `--tier finl` would render a draft while the operator believed they
 * had asked for a final. So `strict: true` is not a preference, it is the
 * behaviour under test — these assertions fail the moment someone relaxes it to
 * quiet a noisy flag.
 */
describe('parse — strictness', () => {
  test('an unknown flag STOPS the command rather than being ignored', () => {
    assert.throws(
      () => parse(['--tier', 'finl'], { file: { type: 'string' } }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'ERR_PARSE_ARGS_UNKNOWN_OPTION');
        return true;
      },
    );
  });

  test('a string flag with no value is an error, not an empty string', () => {
    // Accepting `--file` bare would hand the next stage `undefined` disguised as
    // "the operator supplied a file".
    assert.throws(
      () => parse(['--file'], { file: { type: 'string' } }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE');
        return true;
      },
    );
  });

  test('a value that looks like a flag is refused rather than swallowed', () => {
    // `cutdown brief job --file --job x` is a mistake; consuming `--job` as the
    // filename would produce a baffling "file not found: --job".
    assert.throws(
      () => parse(['--file', '--job'], { file: { type: 'string' }, job: { type: 'string' } }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE');
        return true;
      },
    );
  });

  test('a boolean flag given a value is an error', () => {
    assert.throws(
      () => parse(['--check=false'], { check: { type: 'boolean' } }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE');
        return true;
      },
    );
  });
});

describe('parse — shapes the CLI actually uses', () => {
  test('positionals and flags separate cleanly, in either order', () => {
    const spec = { file: { type: 'string' } } as const;
    const before = parse(['job-001', '--file', 'brief.yaml'], spec);
    assert.deepEqual(before.positionals, ['job-001']);
    assert.equal(before.options['file'], 'brief.yaml');

    // `cutdown brief --file brief.yaml job-001` must mean the same thing.
    const after = parse(['--file', 'brief.yaml', 'job-001'], spec);
    assert.deepEqual(after.positionals, ['job-001']);
    assert.equal(after.options['file'], 'brief.yaml');
  });

  test('--flag=value is equivalent to --flag value, spaces included', () => {
    const eq = parse(['--file=my brief.yaml'], { file: { type: 'string' } });
    assert.equal(eq.options['file'], 'my brief.yaml');
  });

  test('a boolean flag is true when present and absent when not', () => {
    // `build:contracts` branches on `options['check'] === true`, so an absent
    // flag must be undefined rather than false-y-but-present.
    assert.equal(parse(['--check'], { check: { type: 'boolean' } }).options['check'], true);
    assert.equal(parse([], { check: { type: 'boolean' } }).options['check'], undefined);
  });

  test('a repeated flag without `multiple` keeps the LAST value', () => {
    const result = parse(['--job', 'a', '--job', 'b'], { job: { type: 'string' } });
    assert.equal(result.options['job'], 'b');
  });

  test('`multiple` collects every occurrence into an array', () => {
    const result = parse(['--p', 'a', '--p', 'b'], { p: { type: 'string', multiple: true } });
    assert.deepEqual(result.options['p'], ['a', 'b']);
  });

  test('a short alias resolves to the long name', () => {
    const result = parse(['-f', 'brief.yaml'], { file: { type: 'string', short: 'f' } });
    assert.equal(result.options['file'], 'brief.yaml');
  });

  test('everything after `--` is a positional, even if it looks like a flag', () => {
    // The escape hatch for a real filename that begins with a dash.
    const result = parse(['job', '--', '--file', 'x'], { file: { type: 'string' } });
    assert.deepEqual(result.positionals, ['job', '--file', 'x']);
    assert.equal(result.options['file'], undefined, '--file after -- must NOT be parsed as a flag');
  });

  test('an empty argv yields no positionals and no options', () => {
    const result = parse([], { file: { type: 'string' } });
    assert.deepEqual(result.positionals, []);
    // `parseArgs` hands back a null-prototype object, so compare keys rather
    // than deep-equalling against a `{}` literal.
    assert.deepEqual(Object.keys(result.options), []);
    assert.equal(result.options['file'], undefined);
  });
});

describe('requireString', () => {
  test('a present non-empty value is returned unchanged', () => {
    assert.equal(requireString({ file: 'brief.yaml' }, 'file', 'hint'), 'brief.yaml');
  });

  test('an absent option fails NAMING the flag the operator must add', () => {
    // The hint is the whole point: a bare "missing option" makes the operator
    // go read the source to find out what to type.
    assert.throws(
      () => requireString({}, 'file', 'Point it at the JobBrief YAML or JSON.'),
      (err: Error) => {
        assert.match(err.message, /--file/, 'the flag must be named with its dashes');
        assert.match(err.message, /Point it at the JobBrief YAML or JSON\./, 'the hint must survive');
        return true;
      },
    );
  });

  test('an EMPTY string is rejected, not passed through', () => {
    // `--file=` parses to '' and would otherwise sail through as "supplied",
    // failing later as an unreadable path with no clue that the flag was blank.
    assert.throws(() => requireString({ file: '' }, 'file', 'hint'), /Missing required option --file/);
    // and the parser really does produce that empty string:
    assert.equal(parse(['--file='], { file: { type: 'string' } }).options['file'], '');
  });

  test('a boolean value is rejected — a flag is not a value', () => {
    assert.throws(() => requireString({ file: true }, 'file', 'hint'), /Missing required option --file/);
  });

  test('a `multiple` array is rejected rather than silently stringified', () => {
    // Without the typeof check this would become "a,b" and be used as a path.
    assert.throws(() => requireString({ file: ['a', 'b'] }, 'file', 'hint'), /Missing required option --file/);
  });
});

describe('requirePositional', () => {
  test('a present positional is returned by index', () => {
    assert.equal(requirePositional(['job-001', 'extra'], 0, 'job-id'), 'job-001');
    assert.equal(requirePositional(['job-001', 'extra'], 1, 'other'), 'extra');
  });

  test('a missing positional fails naming what it should have been', () => {
    assert.throws(
      () => requirePositional([], 0, 'job-id'),
      (err: Error) => {
        assert.match(err.message, /<job-id>/, 'the argument name must appear in angle brackets');
        return true;
      },
    );
  });

  test('an out-of-range index fails rather than returning undefined', () => {
    // `noUncheckedIndexedAccess` makes the compiler demand this check; the test
    // makes sure the runtime honours it instead of leaking `undefined`.
    assert.throws(() => requirePositional(['a'], 5, 'thing'), /Missing required argument <thing>/);
  });

  test('an empty-string positional is treated as missing', () => {
    assert.throws(() => requirePositional([''], 0, 'job-id'), /Missing required argument <job-id>/);
  });
});
