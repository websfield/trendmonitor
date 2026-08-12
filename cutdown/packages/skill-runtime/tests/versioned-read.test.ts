import assert from 'node:assert/strict';
import { test, describe, after } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SkillError, contractSchemaId, readVersionedContractJson, validateContract } from '../src/index.js';

/**
 * `readVersionedContractJson` — the one dispatch implementation for contract
 * families spanning more than one major (first family: render, Stage 0B-3 / D-62).
 *
 * The load-bearing property is the LAST test: a v2 instance also satisfies v1's
 * shape (v2 only narrows), so a try-in-order reader would silently mask a
 * mislabelled or invalid instance. Dispatch keys on the DECLARED major, and a
 * declared-v2 record that fails v2 is invalid — never retried against v1. That
 * premise is asserted here rather than claimed in a comment (2026-07-30 lesson).
 */

const here = dirname(fileURLToPath(import.meta.url));
// Compiled tests run from dist/tests/, so the contracts package sits three up.
const FIXTURES = join(here, '..', '..', '..', 'contracts', 'fixtures');

const v1Render = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, 'render-v1', 'valid', 'draft.json'), 'utf8')) as Record<string, unknown>;

/** A v2 instance hand-authored from the v1 fixture: same shape, envelope declares 2.0.0. */
const v2Render = (): Record<string, unknown> => {
  const base = v1Render();
  return { ...base, envelope: { ...(base.envelope as Record<string, unknown>), schemaVersion: '2.0.0' } };
};

const RENDER_CONTRACTS = ['render-v1', 'render-v2'];

describe('readVersionedContractJson dispatches on the DECLARED major', () => {
  const dir = mkdtempSync(join(tmpdir(), 'versioned-read-'));
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeCandidate = (name: string, value: unknown): string => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };

  test('a v1 instance validates against render-v1', () => {
    const path = writeCandidate('v1.json', v1Render());
    const record = readVersionedContractJson<{ envelope: { schemaVersion: string } }>(
      path,
      RENDER_CONTRACTS,
      'RENDER_ARTEFACT_UNREADABLE',
      'The render record',
    );
    assert.strictEqual(record.envelope.schemaVersion, '1.0.0');
  });

  test('a v2 instance validates against render-v2', () => {
    const path = writeCandidate('v2.json', v2Render());
    const record = readVersionedContractJson<{ envelope: { schemaVersion: string } }>(
      path,
      RENDER_CONTRACTS,
      'RENDER_ARTEFACT_UNREADABLE',
      'The render record',
    );
    assert.strictEqual(record.envelope.schemaVersion, '2.0.0');
  });

  test('an unknown major is refused naming the accepted majors, non-destructively', () => {
    const base = v1Render();
    const path = writeCandidate('v3.json', {
      ...base,
      envelope: { ...(base.envelope as Record<string, unknown>), schemaVersion: '3.0.0' },
    });
    assert.throws(
      () => readVersionedContractJson(path, RENDER_CONTRACTS, 'RENDER_ARTEFACT_UNREADABLE', 'The render record'),
      (error: unknown) => {
        assert.ok(error instanceof SkillError);
        assert.strictEqual(error.code, 'RENDER_ARTEFACT_UNREADABLE');
        // The refusal names what IS accepted and a way forward that never
        // instructs deleting evidence (the reviews.ts posture).
        assert.match(error.message, /accepted: 1, 2/);
        assert.match(error.message, /move the file aside/);
        assert.doesNotMatch(error.message, /delete the file/i);
        return true;
      },
    );
  });

  test('a declared-v2 instance with a traversing path is INVALID — not retried against v1', () => {
    const bad = v2Render();
    (bad as { outputPath: string }).outputPath = '../escape.mp4';
    const path = writeCandidate('v2-bad-path.json', bad);
    // Under v1 this instance would validate (v1 has no pattern) — so if this
    // throws, the reader provably did NOT fall back across majors.
    assert.throws(
      () => readVersionedContractJson(path, RENDER_CONTRACTS, 'RENDER_ARTEFACT_UNREADABLE', 'The render record'),
      (error: unknown) => {
        assert.ok(error instanceof SkillError);
        assert.match(error.message, /render-v2/);
        return true;
      },
    );
  });

  test('a file containing literal `null` is the named refusal, never a TypeError', () => {
    // `JSON.parse('null')` succeeds, and reading `.envelope` off `null` would be
    // the unnamed-TypeError-three-frames-later failure the helpers exist to stop.
    const path = writeCandidate('null.json', null);
    assert.throws(
      () => readVersionedContractJson(path, RENDER_CONTRACTS, 'RENDER_ARTEFACT_UNREADABLE', 'The render record'),
      (error: unknown) => {
        assert.ok(error instanceof SkillError);
        assert.strictEqual(error.code, 'RENDER_ARTEFACT_UNREADABLE');
        assert.match(error.message, /envelope\.schemaVersion/);
        return true;
      },
    );
  });

  test('two basenames claiming one major are refused loudly, not last-wins', () => {
    const path = writeCandidate('dup.json', v1Render());
    assert.throws(
      () => readVersionedContractJson(path, ['render-v1', 'moment-v1'], 'RENDER_ARTEFACT_UNREADABLE', 'The render record'),
      (error: unknown) => {
        assert.ok(error instanceof SkillError);
        assert.strictEqual(error.code, 'CONTRACT_SCHEMA_MISSING');
        assert.match(error.message, /one schema per major/);
        return true;
      },
    );
  });

  test('a missing envelope version is the standard unreadable refusal', () => {
    const base = v1Render();
    delete (base as { envelope?: unknown }).envelope;
    const path = writeCandidate('no-envelope.json', base);
    assert.throws(
      () => readVersionedContractJson(path, RENDER_CONTRACTS, 'RENDER_ARTEFACT_UNREADABLE', 'The render record'),
      (error: unknown) => {
        assert.ok(error instanceof SkillError);
        assert.strictEqual(error.code, 'RENDER_ARTEFACT_UNREADABLE');
        assert.match(error.message, /envelope\.schemaVersion/);
        return true;
      },
    );
  });

  test('THE PREMISE: a valid v2 instance also passes the v1 validator — dispatch is a choice, not a necessity', () => {
    // This is what makes "no cross-major retry" load-bearing: because v2 only
    // narrows, v1 accepts every v2 instance, so a try-in-order reader would
    // never surface a v2 violation. If this test ever fails, the dispatch
    // design's premise has changed and the no-retry rule must be re-argued.
    // Validated directly (not through dispatch — dispatch would correctly refuse
    // a declared-2 instance offered only v1): the premise is about the SCHEMAS.
    const record = validateContract<{ envelope: { schemaVersion: string } }>(
      v2Render(),
      contractSchemaId('render-v1'),
      'RENDER_ARTEFACT_UNREADABLE',
      'The v2 instance under the v1 schema',
    );
    assert.strictEqual(record.envelope.schemaVersion, '2.0.0');
  });
});
