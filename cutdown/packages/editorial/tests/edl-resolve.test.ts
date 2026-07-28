import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import type { AssetBounds } from '@cutdown/contracts';

import { resolveEdl, resolveEdlRanges, validateEdlSchema } from '../src/edl-resolve.js';
import { ASSET_ID, makePlatformEdl, ulid } from './fixtures.js';

const bounds: ReadonlyMap<string, AssetBounds> = new Map([
  [ASSET_ID, { assetId: ASSET_ID, duration: { ticks: 900, timebase: { num: 1, den: 30 } } }],
]);

function clip(overrides: Record<string, unknown>) {
  return {
    clipId: 'clip-1',
    order: 0,
    momentId: ulid(1),
    assetId: ASSET_ID,
    sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 300, timebase: { num: 1, den: 30 } },
    narrativeFunction: 'proof' as const,
    rationale: 'r',
    caption: { kind: 'none' as const },
    ...overrides,
  };
}

describe('resolveEdl (schema + ranges)', () => {
  test('a valid EDL with in-bounds ranges resolves ok', () => {
    const result = resolveEdl(makePlatformEdl(), bounds);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.checked, 1);
  });

  test('a schema-invalid EDL fails on schema and skips the structural pass', () => {
    const result = resolveEdl({ edlId: 'nope' }, bounds);
    assert.equal(result.ok, false);
    assert.ok(result.schemaErrors.length > 0);
    assert.equal(result.violations.length, 0);
  });
});

describe('resolveEdlRanges (the single bounds validator, reused)', () => {
  test('an out-of-bounds range is a NON-WAIVABLE RANGE_INVALID, never clamped', () => {
    const edl = makePlatformEdl({ clips: [clip({ sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 2000, timebase: { num: 1, den: 30 } } })] });
    const result = resolveEdlRanges(edl, bounds);
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((v) => v.code === 'RANGE_INVALID' && v.message.includes('EXCEEDS_SOURCE_DURATION')));
  });

  test('an asset with no provided bounds fails closed (BOUNDS_MISSING)', () => {
    const result = resolveEdlRanges(makePlatformEdl(), new Map());
    assert.ok(result.violations.some((v) => v.code === 'BOUNDS_MISSING'));
  });

  test('clip.assetId disagreeing with sourceRange.assetId is a mismatch', () => {
    const edl = makePlatformEdl({ clips: [clip({ assetId: ulid(6) })] });
    const result = resolveEdlRanges(edl, bounds);
    assert.ok(result.violations.some((v) => v.code === 'CLIP_ASSET_MISMATCH'));
  });

  test('the Moment asset must agree with the clip asset when a Moment map is given', () => {
    const result = resolveEdlRanges(makePlatformEdl(), bounds, { momentAssetById: new Map([[ulid(1), ulid(6)]]) });
    assert.ok(result.violations.some((v) => v.code === 'MOMENT_ASSET_MISMATCH'));
  });

  test('a Moment absent from the provided map is surfaced, not silently ignored', () => {
    const result = resolveEdlRanges(makePlatformEdl(), bounds, { momentAssetById: new Map() });
    assert.ok(result.violations.some((v) => v.code === 'MOMENT_UNKNOWN'));
  });

  test('non-contiguous clip order is flagged', () => {
    const edl = makePlatformEdl({ clips: [clip({ clipId: 'clip-1', order: 0 }), clip({ clipId: 'clip-2', order: 5 })] });
    const result = resolveEdlRanges(edl, bounds);
    assert.ok(result.violations.some((v) => v.code === 'ORDER_NOT_CONTIGUOUS'));
  });
});

describe('validateEdlSchema', () => {
  test('a valid EDL passes; a broken one reports errors', () => {
    assert.deepEqual(validateEdlSchema(makePlatformEdl()), []);
    assert.ok(validateEdlSchema({}).length > 0);
  });
});
