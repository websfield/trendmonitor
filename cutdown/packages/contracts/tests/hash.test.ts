import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { contentHashPayload, hashContent } from '../src/hash.js';

/**
 * The envelope-exclusion rule (tech-spec §3) has one job: make two identical
 * re-runs hash identically, so the REQ-005 cache can hit. These tests are the
 * proof, because the failure mode is silent — a cache that never hits looks
 * exactly like a cache that is merely cold.
 */
describe('content hashing', () => {
  const base = {
    briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V',
    envelope: {
      schemaVersion: '1.0.0',
      createdAt: '2026-07-21T04:00:00Z',
      createdBy: { kind: 'skill', skill: 'brief', skillVersion: '1.0.0' },
    },
    audience: 'anyone',
  };

  test('two runs differing ONLY in createdAt hash identically', () => {
    const later = { ...base, envelope: { ...base.envelope, createdAt: '2027-01-01T00:00:00Z' } };
    assert.equal(hashContent(base).value, hashContent(later).value);
  });

  test('two runs differing ONLY in createdBy hash identically', () => {
    const byHuman = { ...base, envelope: { ...base.envelope, createdBy: { kind: 'human', name: 'Fred' } } };
    assert.equal(hashContent(base).value, hashContent(byHuman).value);
  });

  test('schemaVersion IS inside the hash — it is semantic, not bookkeeping', () => {
    const bumped = { ...base, envelope: { ...base.envelope, schemaVersion: '2.0.0' } };
    assert.notEqual(hashContent(base).value, hashContent(bumped).value);
  });

  test('a real content change changes the hash', () => {
    assert.notEqual(hashContent(base).value, hashContent({ ...base, audience: 'someone else' }).value);
  });

  test('key order does not affect the hash', () => {
    const reordered = {
      audience: 'anyone',
      envelope: {
        createdBy: { skillVersion: '1.0.0', skill: 'brief', kind: 'skill' },
        createdAt: '2026-07-21T04:00:00Z',
        schemaVersion: '1.0.0',
      },
      briefId: '01HQZX3F5G7K9M2N4P6R8S0T2V',
    };
    assert.equal(hashContent(base).value, hashContent(reordered).value);
  });

  test('the hashed payload literally omits the two excluded keys', () => {
    const payload = contentHashPayload(base);
    assert.ok(!payload.includes('createdAt'), 'createdAt must not reach the digest');
    assert.ok(!payload.includes('createdBy'), 'createdBy must not reach the digest');
    assert.ok(payload.includes('schemaVersion'), 'schemaVersion must reach the digest');
  });

  test('hashing does not mutate the input', () => {
    const input = structuredClone(base);
    hashContent(input);
    assert.deepEqual(input, base, 'The exclusion must operate on a copy — callers still need their envelope.');
  });
});
