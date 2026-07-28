import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { writeFileSync } from 'node:fs';

import { cosineSimilarity, embedQuery, rankMoments, type SpawnFn } from '../src/retrieval.js';
import { makeEmbedding, makeMoment, ulid } from './fixtures.js';

describe('cosineSimilarity', () => {
  test('identical direction is 1, orthogonal is 0, opposite is -1', () => {
    assert.equal(cosineSimilarity([1, 0, 0], [2, 0, 0]), 1);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
    assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  });
  test('a zero vector yields 0 rather than NaN — no direction to compare', () => {
    assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  });
  test('a length mismatch throws — different lengths are not the same space', () => {
    assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /length mismatch/);
  });
});

describe('rankMoments', () => {
  const query = [1, 0, 0, 0];

  test('ranks by score descending, ties keep input order', () => {
    const near = makeMoment({ momentId: ulid(1), embedding: makeEmbedding(4, 0) });
    near.embedding = { model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5', dimensions: 4, vector: [1, 0, 0, 0] };
    const far = makeMoment({ momentId: ulid(2), embedding: { model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5', dimensions: 4, vector: [0, 1, 0, 0] } });
    const ranked = rankMoments(query, [far, near]);
    assert.equal(ranked[0]?.moment.momentId, ulid(1));
    assert.equal(ranked[0]?.rank, 1);
    assert.equal(ranked[1]?.moment.momentId, ulid(2));
  });

  test('a null-embedding Moment is ranked last with a reason, never dropped or scored', () => {
    const scored = makeMoment({ momentId: ulid(1), embedding: { model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5', dimensions: 4, vector: [1, 0, 0, 0] } });
    const broll = makeMoment({ momentId: ulid(2), embedding: null });
    const ranked = rankMoments(query, [broll, scored]);
    assert.equal(ranked.length, 2, 'nothing is dropped');
    const last = ranked[1];
    assert.equal(last?.moment.momentId, ulid(2));
    assert.equal(last?.score, null, 'no fabricated score');
    assert.match(last?.reason ?? '', /no transcript embedding/);
  });

  test('topK caps scored moments but never drops the null-embedding ones', () => {
    const a = makeMoment({ momentId: ulid(1), embedding: { model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5', dimensions: 4, vector: [1, 0, 0, 0] } });
    const b = makeMoment({ momentId: ulid(2), embedding: { model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5', dimensions: 4, vector: [0.9, 0.1, 0, 0] } });
    const broll = makeMoment({ momentId: ulid(3), embedding: null });
    const ranked = rankMoments(query, [a, b, broll], { topK: 1 });
    assert.equal(ranked.length, 2, 'one scored (topK) + the never-dropped null one');
    assert.equal(ranked[0]?.moment.momentId, ulid(1));
    assert.equal(ranked[1]?.score, null);
  });

  test('a dimension mismatch throws — refusing to compare different spaces', () => {
    const wrong = makeMoment({ momentId: ulid(1), embedding: { model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5', dimensions: 3, vector: [1, 0, 0] } });
    assert.throws(() => rankMoments(query, [wrong]), /Refusing to compare mismatched spaces/);
  });

  test('a model/version mismatch throws when the query model is known — vectors are not comparable', () => {
    const other = makeMoment({ momentId: ulid(1), embedding: { model: 'other-model', modelVersion: '9', dimensions: 4, vector: [1, 0, 0, 0] } });
    assert.throws(
      () => rankMoments(query, [other], { queryModel: { model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5' } }),
      /not comparable/,
    );
  });
});

describe('embedQuery', () => {
  test('spawns the Python entrypoint argv-style and returns the parsed vector', () => {
    let capturedArgs: readonly string[] = [];
    const fakeSpawn: SpawnFn = (command, args) => {
      capturedArgs = args;
      const outIdx = args.indexOf('--output');
      const outputPath = args[outIdx + 1] as string;
      writeFileSync(outputPath, JSON.stringify({ model: 'BAAI/bge-small-en-v1.5', modelVersion: '1.5', dimensions: 3, vector: [0.1, 0.2, 0.3] }), 'utf8');
      assert.equal(command, 'uv');
      return { status: 0, stdout: '', stderr: '' };
    };
    const result = embedQuery('a query', { workspaceRoot: '/ws', spawn: fakeSpawn });
    assert.deepEqual(result.vector, [0.1, 0.2, 0.3]);
    assert.equal(result.model, 'BAAI/bge-small-en-v1.5');
    // Matches the CLI's uv argv convention: run --project <ws> python <script> --input --output.
    assert.deepEqual(capturedArgs.slice(0, 4), ['run', '--project', '/ws', 'python']);
    assert.ok(capturedArgs.includes('--input') && capturedArgs.includes('--output'));
  });

  test('a non-zero exit is surfaced, not swallowed', () => {
    const failing: SpawnFn = () => ({ status: 3, stdout: '', stderr: '{"code":"MODEL_UNAVAILABLE"}' });
    assert.throws(() => embedQuery('x', { workspaceRoot: '/ws', spawn: failing }), /exited 3/);
  });

  test('a malformed output vector is refused', () => {
    const bad: SpawnFn = (_c, args) => {
      const outputPath = args[args.indexOf('--output') + 1] as string;
      writeFileSync(outputPath, JSON.stringify({ model: 'm', modelVersion: '1', dimensions: 3, vector: [0.1] }), 'utf8');
      return { status: 0, stdout: '', stderr: '' };
    };
    assert.throws(() => embedQuery('x', { workspaceRoot: '/ws', spawn: bad }), /disagrees with dimensions/);
  });
});
