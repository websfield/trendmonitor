import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import {
  assertPhase0Platform,
  buildPlatformDirectives,
  checkCapability,
  type CapabilityCheckInput,
  type PlatformCapability,
} from '../src/platform-adapt.js';

const TIKTOK: PlatformCapability = {
  platform: 'tiktok',
  duration: { minSeconds: 5, maxSeconds: 180 },
  canvas: { width: 720, height: 1280, aspectRatio: '9:16' },
  preferredAspectRatios: ['9:16'],
  aspectTreatmentOptions: ['subject_reframe', 'blurred_background', 'letterbox'],
};

function validInput(overrides: Partial<CapabilityCheckInput> = {}): CapabilityCheckInput {
  return {
    platform: 'tiktok',
    targetDurationRange: { minSeconds: 10, maxSeconds: 60 },
    canvas: { aspectRatio: '9:16' },
    aspectTreatment: { mode: 'subject_reframe' },
    ...overrides,
  };
}

describe('assertPhase0Platform (D-3)', () => {
  test('tiktok passes; anything else fails explicitly', () => {
    assert.doesNotThrow(() => assertPhase0Platform('tiktok'));
    assert.throws(() => assertPhase0Platform('instagram_reels'), /no Phase 0 capability fixture/);
  });
});

describe('buildPlatformDirectives', () => {
  test('copies the capability bounds into directives', () => {
    const directives = buildPlatformDirectives(TIKTOK);
    assert.deepEqual(directives.durationBounds, { minSeconds: 5, maxSeconds: 180 });
    assert.deepEqual(directives.preferredAspectRatios, ['9:16']);
  });
});

describe('checkCapability', () => {
  test('a valid EDL against the fixture has no violations', () => {
    assert.deepEqual(checkCapability(validInput(), TIKTOK), []);
  });

  test('duration below the pin (D-3 5s) is flagged', () => {
    const v = checkCapability(validInput({ targetDurationRange: { minSeconds: 2, maxSeconds: 60 } }), TIKTOK);
    assert.ok(v.some((x) => x.code === 'DURATION_BELOW_MIN'));
  });

  test('duration above the pin (D-3 180s) is flagged', () => {
    const v = checkCapability(validInput({ targetDurationRange: { minSeconds: 10, maxSeconds: 200 } }), TIKTOK);
    assert.ok(v.some((x) => x.code === 'DURATION_ABOVE_MAX'));
  });

  test('an unsupported aspect ratio is flagged (REQ-052)', () => {
    const v = checkCapability(validInput({ canvas: { aspectRatio: '1:1' } }), TIKTOK);
    assert.ok(v.some((x) => x.code === 'ASPECT_RATIO_UNSUPPORTED'));
  });

  test('an aspect treatment outside the fixture options is flagged', () => {
    const v = checkCapability(validInput({ aspectTreatment: { mode: 'split_screen' } }), TIKTOK);
    assert.ok(v.some((x) => x.code === 'ASPECT_TREATMENT_UNSUPPORTED'));
  });

  test('a platform mismatch is flagged', () => {
    const v = checkCapability(validInput({ platform: 'linkedin' }), TIKTOK);
    assert.ok(v.some((x) => x.code === 'PLATFORM_MISMATCH'));
  });
});
