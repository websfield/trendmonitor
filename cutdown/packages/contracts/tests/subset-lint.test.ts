import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { expectedId } from '../src/paths.js';
import { lintAllSchemas, lintSchemaFile, DRAFT_2020_12 } from '../src/subset-lint.js';

/**
 * The style subset (tech-spec §3) is only a guarantee if it actually REJECTS
 * things. A lint that has never failed is indistinguishable from no lint, so
 * each forbidden construct gets its own negative test.
 */

const scratch = mkdtempSync(join(tmpdir(), 'cutdown-lint-'));

/** Write a throwaway schema and lint it. `$id`/`$schema` errors are filtered out
 *  unless the test is about them, so each case asserts one rule. */
function lintFragment(fragment: Record<string, unknown>, rule: string): string[] {
  const path = join(scratch, `case-${Math.abs(hash(rule + JSON.stringify(fragment)))}.json`);
  writeFileSync(
    path,
    JSON.stringify({ $schema: DRAFT_2020_12, title: 'Case', type: 'object', ...fragment }),
    'utf8',
  );
  return lintSchemaFile(path, false)
    .filter((v) => v.rule === rule)
    .map((v) => v.message);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

describe('schema style subset', () => {
  test('the real schemas obey their own subset', () => {
    const violations = lintAllSchemas();
    assert.deepEqual(
      violations.map((v) => `${v.file}${v.pointer} [${v.rule}]`),
      [],
      'Committed schemas must pass the subset lint.',
    );
  });

  test('rejects an object that is not closed', () => {
    const found = lintFragment(
      { properties: { a: { type: 'string' } } },
      'closed-objects',
    );
    assert.equal(found.length, 1, 'An object with properties and no additionalProperties:false must fail.');
  });

  test('rejects if/then/else', () => {
    const found = lintFragment(
      {
        additionalProperties: false,
        properties: { a: { type: 'string' } },
        if: { required: ['a'] },
        then: { required: ['a'] },
      },
      'no-if-then-else',
    );
    assert.ok(found.length >= 1, 'Conditional shape is outside the two-generator subset.');
  });

  test('rejects patternProperties', () => {
    const found = lintFragment(
      { additionalProperties: false, patternProperties: { '^x-': { type: 'string' } } },
      'no-pattern-properties',
    );
    assert.equal(found.length, 1);
  });

  test('rejects a schema-valued additionalProperties (an open map)', () => {
    const found = lintFragment({ additionalProperties: { type: 'string' } }, 'no-schema-valued-additional-properties');
    assert.equal(found.length, 1);
  });

  test('rejects anyOf', () => {
    const found = lintFragment(
      { additionalProperties: false, anyOf: [{ type: 'string' }, { type: 'number' }] },
      'no-any-of',
    );
    assert.equal(found.length, 1);
  });

  test('rejects a union of objects with no const discriminator', () => {
    const found = lintFragment(
      {
        additionalProperties: false,
        properties: {
          u: {
            oneOf: [
              { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } },
              { type: 'object', additionalProperties: false, properties: { b: { type: 'string' } } },
            ],
          },
        },
      },
      'tagged-unions-only',
    );
    assert.equal(found.length, 2, 'Both undiscriminated object branches must be reported.');
  });

  test('ACCEPTS a properly tagged union', () => {
    const found = lintFragment(
      {
        additionalProperties: false,
        properties: {
          u: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: { kind: { const: 'a' }, a: { type: 'string' } },
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: { kind: { const: 'b' }, b: { type: 'string' } },
              },
            ],
          },
        },
      },
      'tagged-unions-only',
    );
    assert.equal(found.length, 0);
  });

  test('ACCEPTS the nullable idiom (X | null) without a discriminator', () => {
    // `oneOf: [<object>, null]` has one non-null alternative, so nothing is
    // ambiguous. Flagging it would force a pointless discriminator onto every
    // optional sub-object in the contract set.
    const found = lintFragment(
      {
        additionalProperties: false,
        properties: {
          maybe: {
            oneOf: [
              { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } },
              { type: 'null' },
            ],
          },
        },
      },
      'tagged-unions-only',
    );
    assert.equal(found.length, 0);
  });

  test('rejects an $id that does not match the file path', () => {
    const path = join(scratch, 'wrong-id.json');
    writeFileSync(
      path,
      JSON.stringify({
        $schema: DRAFT_2020_12,
        $id: 'https://cutdown.local/contracts/schemas/some-other-file.json',
        title: 'X',
        type: 'object',
        additionalProperties: false,
        properties: {},
      }),
      'utf8',
    );
    const found = lintSchemaFile(path, false).filter((v) => v.rule === 'id-matches-path');
    assert.equal(found.length, 1, 'Two files sharing an $id would make every $ref resolve to whichever registered first.');
  });

  test('rejects a contract schema with no changelog', () => {
    const path = join(scratch, 'no-changelog.json');
    writeFileSync(
      path,
      JSON.stringify({
        $schema: DRAFT_2020_12,
        title: 'X',
        schemaVersion: '1.0.0',
        type: 'object',
        additionalProperties: false,
        properties: {},
      }),
      'utf8',
    );
    const found = lintSchemaFile(path, true).filter((v) => v.rule === 'version-lineage');
    assert.ok(
      found.some((v) => v.message.includes('changelog')),
      'The "last ten outputs required no breaking contract change" exit criterion is computed from changelog entries.',
    );
  });

  /**
   * Write a throwaway CONTRACT and lint it as one.
   *
   * The `$id` is computed with `expectedId(path)` rather than written by hand:
   * that function derives the required id from `relative(CONTRACTS_ROOT, path)`,
   * so a hand-written id on a temp file outside the contracts root fails
   * `id-matches-path` and the case never reaches the rule it is about. Writing
   * the fixture INSIDE `schemas/` is not the alternative — it would race the
   * live-tree control above, dirty `build:contracts --check`, and trip CI's
   * "the gate did not modify the working tree" step.
   */
  function lintContract(name: string, body: Record<string, unknown>, rule: string): string[] {
    const path = join(scratch, name);
    writeFileSync(
      path,
      JSON.stringify({
        $schema: DRAFT_2020_12,
        $id: expectedId(path),
        title: 'Case',
        changelog: [{ changedAt: '2026-08-10T00:00:00.000Z', changeKind: 'editorial', reason: 'fixture' }],
        type: 'object',
        additionalProperties: false,
        properties: {},
        ...body,
      }),
      'utf8',
    );
    return lintSchemaFile(path, true)
      .filter((v) => v.rule === rule)
      .map((v) => v.message);
  }

  test('rejects a -vN filename whose declared major is not N', () => {
    // Measured before this rule existed (spike F-D): a `content-package-v2.json`
    // declaring 1.0.0 passed `lintAllSchemas()` with ZERO violations, and
    // `currentContractSet()` recorded it as major 1 — so the file that IS the
    // v1→v2 migration would have read as a schema that never moved.
    const found = lintContract('mislabelled-v2.json', { schemaVersion: '1.0.0' }, 'version-matches-filename');
    assert.equal(found.length, 1, 'a -v2 file declaring 1.0.0 must fail');
    assert.ok(found[0]?.includes('major 2'), 'the message names the major the FILENAME claims');
    assert.ok(found[0]?.includes('major 1'), 'and the major the file DECLARES');
  });

  test('ACCEPTS a -vN filename that agrees with its declared major', () => {
    const found = lintContract('agreeing-v2.json', { schemaVersion: '2.1.0' }, 'version-matches-filename');
    assert.equal(found.length, 0, 'a minor bump under the right major is exactly what the rule must allow');
  });

  test('SKIPS a contract whose filename carries no -vN at all', () => {
    // Skipped, not failed. No such contract exists today, and turning "unversioned
    // filename" into a violation would be a naming rule this lint has no mandate
    // for — while the four `schemas/common/*-v1.json` files, which carry a suffix
    // and no `schemaVersion`, are why the rule is contracts-only in the first
    // place. The live-tree control above is what proves both: 0 false positives.
    const found = lintContract('unsuffixed.json', { schemaVersion: '3.0.0' }, 'version-matches-filename');
    assert.equal(found.length, 0);
  });

  test('rejects a non-2020-12 dialect', () => {
    const path = join(scratch, 'wrong-draft.json');
    writeFileSync(
      path,
      JSON.stringify({
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'X',
        type: 'object',
        additionalProperties: false,
        properties: {},
      }),
      'utf8',
    );
    const found = lintSchemaFile(path, false).filter((v) => v.rule === 'pinned-draft');
    assert.equal(found.length, 1);
  });

  test.after(() => rmSync(scratch, { recursive: true, force: true }));
});
