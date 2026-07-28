import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { validateStoryPlanSchema, validateStoryPlanStructure } from '../src/story-plan.js';
import { makeCreativeBrief, makeStoryPlan, ulid } from './fixtures.js';

describe('validateStoryPlanSchema', () => {
  test('a well-formed plan satisfies master-story-plan-v1', () => {
    assert.deepEqual(validateStoryPlanSchema(makeStoryPlan()), []);
  });
  test('a malformed plan produces schema errors', () => {
    assert.ok(validateStoryPlanSchema({ storyPlanId: 'x' }).length > 0);
  });
});

describe('validateStoryPlanStructure', () => {
  const brief = makeCreativeBrief(); // selects ulid(1) only

  test('a plan whose beats use only selected Moments and contiguous order is clean', () => {
    assert.deepEqual(validateStoryPlanStructure(makeStoryPlan(), brief), []);
  });

  test('a beat filled with an unselected Moment is a violation', () => {
    const plan = makeStoryPlan({
      beats: [
        { beatId: 'beat-1', order: 0, function: 'proof', momentId: ulid(6), rationale: 'r', basis: { kind: 'model_judgement', inference: 'i' }, optional: false, alternateMomentIds: [] },
      ],
    });
    const violations = validateStoryPlanStructure(plan, brief);
    assert.equal(violations[0]?.code, 'BEAT_MOMENT_NOT_SELECTED');
  });

  test('non-contiguous beat order is a violation', () => {
    const plan = makeStoryPlan({
      beats: [
        { beatId: 'beat-1', order: 0, function: 'proof', momentId: ulid(1), rationale: 'r', basis: { kind: 'observed_fact', observed: 'o' }, optional: false, alternateMomentIds: [] },
        { beatId: 'beat-2', order: 2, function: 'payoff', momentId: ulid(1), rationale: 'r', basis: { kind: 'observed_fact', observed: 'o' }, optional: false, alternateMomentIds: [] },
      ],
    });
    const violations = validateStoryPlanStructure(plan, brief);
    assert.ok(violations.some((v) => v.code === 'ORDER_NOT_CONTIGUOUS'));
  });

  test('a dependency on a non-existent beat is a violation', () => {
    const plan = makeStoryPlan({ dependencies: [{ fromBeatId: 'beat-1', toBeatId: 'beat-ghost', relation: 'requires_setup' }] });
    const violations = validateStoryPlanStructure(plan, brief);
    assert.ok(violations.some((v) => v.code === 'DEPENDENCY_UNKNOWN_BEAT' && v.message.includes('beat-ghost')));
  });
});
