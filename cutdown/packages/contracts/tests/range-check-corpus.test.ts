import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';

import { checkSourceRange } from '../src/range-check.js';
import type { AssetBounds, RangeViolationCode, SourceRange } from '../src/range-check.js';
import { FIXTURES_DIR } from '../src/paths.js';

/**
 * The committed source-bounds corpus, driven from the TypeScript side.
 *
 * The SAME `cases.json` is driven from the Python indexer suite through the
 * `cutdown range-check` CLI. Two suites, one implementation — so a disagreement
 * between them is a wiring bug rather than a rounding difference between two
 * languages' floating point. That is the entire argument for refusing a second
 * implementation in Python (Phase 2 task 10).
 */

interface Corpus {
  asset: AssetBounds;
  cases: {
    name: string;
    why: string;
    range: SourceRange;
    expect: { ok: boolean; codes: RangeViolationCode[] };
  }[];
  unknownDurationCase: Corpus['cases'][number];
}

const corpus = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'range-check', 'cases.json'), 'utf8'),
) as Corpus;

describe('range-check corpus', () => {
  test('the corpus is non-trivial and covers both verdicts', () => {
    // A corpus of only-passing cases would go green against a validator that
    // returned `ok: true` unconditionally.
    assert.ok(corpus.cases.length >= 12, 'corpus should be substantive');
    assert.ok(corpus.cases.some((c) => c.expect.ok), 'needs passing cases');
    assert.ok(corpus.cases.some((c) => !c.expect.ok), 'needs failing cases');
  });

  test('every distinct violation code is exercised at least once', () => {
    // Declared as an exhaustive Record, not an array: the compiler now refuses
    // to build if a new RangeViolationCode is added without a corpus case. A
    // plain array silently omitted MALFORMED_RANGE — the code covering
    // model-generated garbage, which is the untrusted path this module exists
    // for — and the test still passed.
    const required: Record<RangeViolationCode, true> = {
      MALFORMED_RANGE: true,
      ASSET_ID_MISMATCH: true,
      NON_INTEGER_TICKS: true,
      NEGATIVE_TICKS: true,
      INVALID_TIMEBASE: true,
      EMPTY_OR_INVERTED_RANGE: true,
      EXCEEDS_SOURCE_DURATION: true,
      UNKNOWN_SOURCE_DURATION: true,
    };
    const covered = new Set<string>([
      ...corpus.cases.flatMap((c) => c.expect.codes),
      ...corpus.unknownDurationCase.expect.codes,
    ]);
    for (const code of Object.keys(required)) {
      assert.ok(covered.has(code), `corpus does not exercise ${code}`);
    }
  });

  for (const testCase of corpus.cases) {
    test(`${testCase.name} — ${testCase.why}`, () => {
      const result = checkSourceRange(testCase.range, corpus.asset);
      assert.equal(result.ok, testCase.expect.ok);
      assert.deepEqual(result.violations.map((v) => v.code), testCase.expect.codes);
    });
  }

  test(`${corpus.unknownDurationCase.name} — ${corpus.unknownDurationCase.why}`, () => {
    const result = checkSourceRange(corpus.unknownDurationCase.range, {
      assetId: corpus.asset.assetId,
      duration: null,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.violations.map((v) => v.code),
      corpus.unknownDurationCase.expect.codes,
    );
  });
});
