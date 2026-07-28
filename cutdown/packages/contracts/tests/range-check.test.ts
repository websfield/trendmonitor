import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { checkSourceRange, checkSourceRanges } from '../src/range-check.js';
import type { RangeViolationCode } from '../src/range-check.js';

/**
 * The load-bearing property (tech-spec §12, PRD REQ-019): **no generated Moment
 * or EDL range may exceed source bounds under the normalized timebase.** This is
 * the mechanism behind the Phase 0 exit criterion "zero invalid source ranges in
 * final renders", so these tests are the criterion's teeth.
 *
 * Two rules under test that JSON Schema provably cannot express (draft 2020-12
 * has no cross-property inequality, and tech-spec §3 forbids if/then/else):
 *   1. `endTicks > startTicks` — a range must be non-empty.
 *   2. `end <= duration` under *rational* conversion — the range's timebase and
 *      the asset's duration timebase need not match.
 */

const ASSET = '01HQZX3F5G7K9M2N4P6R8S0T2V';
const OTHER_ASSET = '01HQZX3F5G7K9M2N4P6R8S0T3W';

/** 30 fps: one tick = 1/30 s. */
const TB_30 = { num: 1, den: 30 };
/** 30000/1001 ("29.97") fps — the case that punishes float arithmetic. */
const TB_2997 = { num: 1001, den: 30000 };
/** 48 kHz audio: ticks ARE sample counts (timecode-v1). */
const TB_48K = { num: 1, den: 48000 };

const range = (over: Partial<Record<string, unknown>> = {}) => ({
  assetId: ASSET,
  startTicks: 0,
  endTicks: 90,
  timebase: TB_30,
  ...over,
});

/** A 10-second asset at 30 fps. */
const asset = { assetId: ASSET, duration: { ticks: 300, timebase: TB_30 } };

const codes = (r: { violations: { code: RangeViolationCode }[] }) => r.violations.map((v) => v.code);

describe('range-check — the single source-bounds implementation', () => {
  describe('valid ranges', () => {
    test('a range strictly inside the asset passes', () => {
      const result = checkSourceRange(range(), asset);
      assert.equal(result.ok, true);
      assert.deepEqual(result.violations, []);
    });

    test('a range ending EXACTLY at the duration passes — the range is half-open', () => {
      // [0, 300) over a 300-tick asset consumes the whole asset and reads nothing past it.
      const result = checkSourceRange(range({ endTicks: 300 }), asset);
      assert.equal(result.ok, true, 'end == duration is in bounds for a half-open range');
    });

    test('the minimal one-tick range passes', () => {
      assert.equal(checkSourceRange(range({ startTicks: 5, endTicks: 6 }), asset).ok, true);
    });
  });

  describe('the inequality JSON Schema cannot express', () => {
    test('endTicks == startTicks is an EMPTY range, not a valid one', () => {
      const result = checkSourceRange(range({ startTicks: 90, endTicks: 90 }), asset);
      assert.equal(result.ok, false);
      assert.deepEqual(codes(result), ['EMPTY_OR_INVERTED_RANGE']);
    });

    test('endTicks < startTicks is inverted', () => {
      const result = checkSourceRange(range({ startTicks: 90, endTicks: 30 }), asset);
      assert.equal(result.ok, false);
      assert.deepEqual(codes(result), ['EMPTY_OR_INVERTED_RANGE']);
    });
  });

  describe('source bounds', () => {
    test('one tick past the end is caught', () => {
      const result = checkSourceRange(range({ startTicks: 0, endTicks: 301 }), asset);
      assert.equal(result.ok, false);
      assert.deepEqual(codes(result), ['EXCEEDS_SOURCE_DURATION']);
    });

    test('a range starting at the duration is caught', () => {
      const result = checkSourceRange(range({ startTicks: 300, endTicks: 330 }), asset);
      assert.equal(result.ok, false);
      assert.ok(result.violations.some((v) => v.code === 'EXCEEDS_SOURCE_DURATION'));
    });

    test('the violation reports both bound and actual, so the message is actionable', () => {
      const result = checkSourceRange(range({ endTicks: 301 }), asset);
      const v = result.violations[0]!;
      assert.match(v.message, /301/);
      assert.match(v.message, /300/);
    });
  });

  describe('cross-timebase comparison is exact, never float', () => {
    test('a 48 kHz audio range is compared correctly against a 30 fps duration', () => {
      // 10 s at 48 kHz = 480000 samples. The asset is exactly 10 s (300 ticks @ 30 fps).
      const audio = range({ endTicks: 480000, timebase: TB_48K });
      assert.equal(checkSourceRange(audio, asset).ok, true, '480000 samples == 10 s == the full asset');

      const oneSampleOver = range({ endTicks: 480001, timebase: TB_48K });
      assert.equal(
        checkSourceRange(oneSampleOver, asset).ok,
        false,
        'a single sample past the end must be caught — this is why the comparison is rational',
      );
    });

    test('29.97 fps ranges compare exactly against a 29.97 duration', () => {
      // 1001/30000 s per tick; 300 ticks ≈ 10.01 s.
      const ntsc = { assetId: ASSET, duration: { ticks: 300, timebase: TB_2997 } };
      assert.equal(checkSourceRange(range({ endTicks: 300, timebase: TB_2997 }), ntsc).ok, true);
      assert.equal(checkSourceRange(range({ endTicks: 301, timebase: TB_2997 }), ntsc).ok, false);
    });

    test('an unsafely-large tick count is REJECTED, not silently rounded', () => {
      // Driven through JSON.parse because that is the real path: the CLI reads a
      // request file. A numeric literal here would be rounded by the parser
      // before the test ran, so both sides would land on the same wrong value
      // and the test would pass while proving nothing. (An earlier version of
      // this test did exactly that, and it is what let an out-of-bounds range be
      // reported clean.)
      const big = '{"num":1,"den":1000000000}';
      const parsed = JSON.parse(
        `{"bounds":{"assetId":"${ASSET}","duration":{"ticks":9007199254740992,"timebase":${big}}},` +
          `"range":{"assetId":"${ASSET}","startTicks":0,"endTicks":9007199254740993,"timebase":${big}}}`,
      ) as { bounds: typeof asset; range: ReturnType<typeof range> };

      // Proof the hazard is real: the parser has already destroyed the value.
      assert.equal(parsed.range.endTicks, 9007199254740992, 'JSON.parse rounds past 2^53');
      assert.equal(
        parsed.range.endTicks,
        parsed.bounds.duration!.ticks,
        'the out-of-bounds end now equals the duration — a naive check would call this clean',
      );

      const result = checkSourceRange(parsed.range, parsed.bounds);
      assert.equal(result.ok, false, 'an unrepresentable tick must be refused, never compared');
      assert.deepEqual(codes(result), ['NON_INTEGER_TICKS']);
    });

    test('the largest safe tick count is still accepted', () => {
      // The rejection above must not swallow legitimate large values.
      const big = { num: 1, den: 1_000_000_000 };
      const safeAsset = { assetId: ASSET, duration: { ticks: Number.MAX_SAFE_INTEGER, timebase: big } };
      const atLimit = range({ endTicks: Number.MAX_SAFE_INTEGER, timebase: big });
      assert.equal(checkSourceRange(atLimit, safeAsset).ok, true);
    });
  });

  describe('fail closed', () => {
    test('an unknown (null) duration is a VIOLATION, never a pass', () => {
      const noDuration = { assetId: ASSET, duration: null };
      const result = checkSourceRange(range(), noDuration);
      assert.equal(result.ok, false, 'cannot prove in-bounds against an unknown bound — fail closed');
      assert.deepEqual(codes(result), ['UNKNOWN_SOURCE_DURATION']);
    });

    test('a range pointing at a different asset is a violation', () => {
      const result = checkSourceRange(range({ assetId: OTHER_ASSET }), asset);
      assert.equal(result.ok, false);
      assert.ok(result.violations.some((v) => v.code === 'ASSET_ID_MISMATCH'));
    });

    test('a non-integer tick is a violation — ticks are counts, not measurements', () => {
      const result = checkSourceRange(range({ endTicks: 90.5 }), asset);
      assert.equal(result.ok, false);
      assert.ok(result.violations.some((v) => v.code === 'NON_INTEGER_TICKS'));
    });

    test('a negative start is a violation', () => {
      const result = checkSourceRange(range({ startTicks: -1 }), asset);
      assert.equal(result.ok, false);
      assert.ok(result.violations.some((v) => v.code === 'NEGATIVE_TICKS'));
    });

    test('a zero or negative timebase denominator is a violation, not a divide-by-zero', () => {
      const result = checkSourceRange(range({ timebase: { num: 1, den: 0 } }), asset);
      assert.equal(result.ok, false);
      assert.ok(result.violations.some((v) => v.code === 'INVALID_TIMEBASE'));
    });

    test('a NaN tick is a violation, not a silently-false comparison', () => {
      const result = checkSourceRange(range({ endTicks: Number.NaN }), asset);
      assert.equal(result.ok, false);
      assert.ok(result.violations.some((v) => v.code === 'NON_INTEGER_TICKS'));
    });

    test('a structurally malformed range is reported, never thrown', () => {
      const result = checkSourceRange({ nonsense: true } as never, asset);
      assert.equal(result.ok, false, 'a validator that throws cannot be run over untrusted generated output');
      assert.ok(result.violations.length > 0);
    });

    test('a missing tick is MALFORMED, not NON_INTEGER', () => {
      // `undefined` is a structural defect. Calling it a non-integer sends the
      // reader hunting for float arithmetic that was never involved.
      const result = checkSourceRange({ ...range(), startTicks: undefined } as never, asset);
      assert.deepEqual(codes(result), ['MALFORMED_RANGE']);
    });

    test('null bounds are reported, never thrown', () => {
      // Phase 3 validate and Phase 4 render preflight both resolve an asset from
      // a map; a miss hands this function `undefined`.
      assert.doesNotThrow(() => checkSourceRange(range(), null as never));
      assert.equal(checkSourceRange(range(), null as never).ok, false);
    });

    test('undefined bounds are reported, never thrown', () => {
      assert.doesNotThrow(() => checkSourceRange(range(), undefined as never));
      assert.equal(checkSourceRange(range(), undefined as never).ok, false);
    });

    test('null describes itself as null, not as "object"', () => {
      const result = checkSourceRange(null as never, asset);
      assert.match(result.violations[0]!.message, /null/);
    });
  });

  describe('the batch entry point is equally unthrowable', () => {
    test('a null range list is reported, never thrown', () => {
      assert.doesNotThrow(() => checkSourceRanges(null as never, asset));
      const result = checkSourceRanges(null as never, asset);
      assert.equal(result.ok, false);
      assert.equal(result.checked, 0);
    });

    test('an undefined range list is reported, never thrown', () => {
      assert.equal(checkSourceRanges(undefined as never, asset).ok, false);
    });
  });

  describe('batch checking over a Moment set', () => {
    test('every violation is attributed to its own range index', () => {
      const result = checkSourceRanges(
        [range(), range({ endTicks: 9999 }), range({ startTicks: 10, endTicks: 10 })],
        asset,
      );
      assert.equal(result.ok, false);
      assert.equal(result.violations.length, 2);
      assert.deepEqual(
        result.violations.map((v) => v.index),
        [1, 2],
      );
    });

    test('an all-valid set passes and reports zero violations', () => {
      const result = checkSourceRanges([range(), range({ startTicks: 90, endTicks: 180 })], asset);
      assert.equal(result.ok, true);
      assert.equal(result.violations.length, 0);
      assert.equal(result.checked, 2, 'the count is the evidence that the check actually ran');
    });

    test('an empty set is vacuously ok but records that nothing was checked', () => {
      const result = checkSourceRanges([], asset);
      assert.equal(result.ok, true);
      assert.equal(result.checked, 0);
    });
  });
});
