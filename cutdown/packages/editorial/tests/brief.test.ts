import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { resolveJobBrief } from '../src/brief.js';
import { makeJobBrief } from './fixtures.js';

describe('resolveJobBrief', () => {
  test('a complete, consistent brief resolves ok', () => {
    const result = resolveJobBrief(makeJobBrief());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.brief.objective, 'education_utility');
  });

  test('every missing required field is reported at once, not one per round-trip', () => {
    const result = resolveJobBrief({ briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.missingFields.includes('audience'));
      assert.ok(result.missingFields.includes('objective'));
      assert.ok(result.missingFields.length > 3, 'reports all of them together');
    }
  });

  test('an inverted duration range is a cross-field failure the schema cannot catch', () => {
    const result = resolveJobBrief(makeJobBrief({ durationRange: { minSeconds: 45, maxSeconds: 20 } }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.missingFields.length, 0);
      assert.match(result.crossFieldErrors[0] ?? '', /maxSeconds .* less than minSeconds/);
    }
  });

  test('an unsupported platform is a warning (D-3), not a block', () => {
    const result = resolveJobBrief(makeJobBrief({ platforms: ['tiktok', 'youtube_shorts'] }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.warnings.some((w) => w.includes('youtube_shorts')));
      assert.ok(result.warnings.some((w) => w.includes('one PlatformEDL per platform')));
    }
  });

  test('a no-CTA brief is surfaced as an explicit choice', () => {
    const result = resolveJobBrief(makeJobBrief({ cta: { kind: 'none' } }));
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.warnings.some((w) => w.includes('no CTA')));
  });
});
