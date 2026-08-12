import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import {
  assessFootageSufficiency,
  buildProposePrompt,
  computeDistinctness,
  validateProposedCreativeBriefs,
} from '../src/angles.js';
import type { RankedMoment } from '../src/retrieval.js';
import { makeCreativeBrief, makeJobBrief, makeMoment, ulid } from './fixtures.js';

function ranked(count: number, scored: boolean): RankedMoment[] {
  return Array.from({ length: count }, (_, i) => ({
    moment: makeMoment({ momentId: ulid(1) }),
    score: scored ? 0.5 : null,
    rank: i + 1,
  }));
}

describe('buildProposePrompt', () => {
  test('assembles a system turn and a content turn carrying the candidate momentIds', () => {
    const prompt = buildProposePrompt({ brief: makeJobBrief(), rankedMoments: [{ moment: makeMoment({ momentId: ulid(1) }), score: 0.9, rank: 1 }] });
    // The system turn must state BOTH the moment-id rule and the enforced JSON
    // shape — the first live run failed because the shape was never spelled out.
    assert.match(prompt.system, /every momentId is one provided in candidateMoments/);
    assert.match(prompt.system, /"basis": \{"kind": "observed_fact", "observed": string\}/);
    assert.equal(prompt.content[0]?.type, 'text');
    assert.ok(String(prompt.content[0]?.['text']).includes(ulid(1)));
  });
});

describe('computeDistinctness (REQ-031, computed in code)', () => {
  test('shared-moment fraction and peer labels are computed across the set', () => {
    const results = computeDistinctness([
      { label: 'angle-1', selectedMomentIds: [ulid(1), ulid(2)], semanticAngleLabel: 'transparency' },
      { label: 'angle-2', selectedMomentIds: [ulid(2), ulid(3)], semanticAngleLabel: 'speed' },
    ]);
    assert.equal(results[0]?.distinctness.sharedMomentFraction, 0.5);
    assert.deepEqual(results[0]?.distinctness.peerBriefLabels, ['angle-2']);
    assert.equal(results[1]?.distinctness.sharedMomentFraction, 0.5);
  });

  test('fully disjoint angles have zero overlap', () => {
    const results = computeDistinctness([
      { label: 'a', selectedMomentIds: [ulid(1)], semanticAngleLabel: 'x' },
      { label: 'b', selectedMomentIds: [ulid(2)], semanticAngleLabel: 'y' },
    ]);
    assert.equal(results[0]?.distinctness.sharedMomentFraction, 0);
    assert.equal(results[1]?.distinctness.sharedMomentFraction, 0);
  });
});

describe('validateProposedCreativeBriefs', () => {
  test('a schema-valid brief referencing only offered Moments passes', () => {
    const result = validateProposedCreativeBriefs([makeCreativeBrief()], new Set([ulid(1)]));
    assert.equal(result.ok, true);
  });

  test('a brief citing a Moment not in the input is a hard reject (REQ-034)', () => {
    const brief = makeCreativeBrief({ selectedMoments: [{ momentId: ulid(6), candidateFunction: 'proof', rationale: 'r' }] });
    const result = validateProposedCreativeBriefs([brief], new Set([ulid(1)]));
    assert.equal(result.ok, false);
    assert.equal(result.violations[0]?.code, 'MOMENT_NOT_IN_INPUT');
    assert.ok(result.violations[0]?.message.includes(ulid(6)));
  });

  test('a schema-invalid brief is reported as SCHEMA_INVALID', () => {
    const result = validateProposedCreativeBriefs([{ not: 'a brief' }], new Set([ulid(1)]));
    assert.equal(result.ok, false);
    assert.equal(result.violations[0]?.code, 'SCHEMA_INVALID');
  });
});

describe('assessFootageSufficiency (REQ-036)', () => {
  test('enough rankable Moments is sufficient', () => {
    const decision = assessFootageSufficiency(makeJobBrief({ variantCount: 2 }), ranked(4, true));
    assert.equal(decision.sufficient, true);
  });

  test('too few rankable Moments refuses with a narrower suggestion, never padding', () => {
    const decision = assessFootageSufficiency(makeJobBrief({ variantCount: 2 }), ranked(1, true));
    assert.equal(decision.sufficient, false);
    if (!decision.sufficient) {
      assert.ok(decision.missing.length > 0);
      assert.match(decision.narrowerSuggestion, /fewer variants|narrower/);
    }
  });

  test('null-embedding Moments do not count toward sufficiency', () => {
    const decision = assessFootageSufficiency(makeJobBrief({ variantCount: 1 }), ranked(5, false));
    assert.equal(decision.sufficient, false, 'unrankable moments cannot carry an angle');
  });
});
