import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { listFixtures, validateContracts, validateWithAjv, reportIsClean } from '../src/validate.js';
import { checkGenerated, isClean } from '../src/check-generated.js';
import { GENERATED_TS_DIR } from '../src/paths.js';

describe('validate:contracts', () => {
  test('every fixture matches its declared expectation under BOTH validators', () => {
    const report = validateContracts();
    assert.equal(report.lintViolations, 0, report.lintDetail);
    assert.deepEqual(report.failures, []);
    assert.equal(
      report.pythonUnavailable,
      false,
      `The Python validator must run — without it, Ajv/Pydantic agreement is unchecked. ${report.pythonError ?? ''}`,
    );
    assert.deepEqual(
      report.disagreements,
      [],
      'Ajv and Pydantic must agree on every fixture; agreement is itself part of the contract (tech-spec §3).',
    );
    assert.ok(reportIsClean(report));
  });

  test('invalid fixtures are genuinely REJECTED, not merely present', () => {
    // Guards against the failure where a schema stops constraining anything and
    // every fixture — including the ones written to be rejected — passes.
    const invalid = listFixtures().filter((f) => f.expected === 'invalid');
    assert.ok(invalid.length >= 4, 'Expected invalid fixtures across the contract set.');

    const outcomes = validateWithAjv(invalid);
    const wronglyAccepted = outcomes.filter((o) => o.accepted).map((o) => `${o.contract}/${o.case}`);
    assert.deepEqual(wronglyAccepted, [], 'These fixtures were written to be rejected but Ajv accepted them.');
  });

  test('every contract owns at least one valid and one invalid fixture', () => {
    const byContract = new Map<string, Set<string>>();
    for (const f of listFixtures()) {
      if (!byContract.has(f.contract)) byContract.set(f.contract, new Set());
      byContract.get(f.contract)!.add(f.expected);
    }
    for (const [contract, kinds] of byContract) {
      assert.ok(kinds.has('valid'), `${contract} has no valid fixture.`);
      assert.ok(kinds.has('invalid'), `${contract} has no invalid fixture.`);
    }
  });
});

describe('build:contracts --check', () => {
  test('reports the committed generated trees as current', async () => {
    const drift = await checkGenerated();
    assert.ok(
      isClean(drift),
      `Generated trees are stale — run \`cutdown build:contracts\`.\n${JSON.stringify(drift, null, 2)}`,
    );
  });

  test('DETECTS a stale generated tree', async () => {
    // The acceptance criterion is that --check catches drift, so drift is
    // manufactured and the detector is required to see it. A stray committed
    // file is the safest kind to inject: cleanup is a single unlink, and a
    // crashed test cannot corrupt a real generated file.
    const stray = join(GENERATED_TS_DIR, '__drift-probe.ts');
    writeFileSync(stray, 'export const drift = true;\n', 'utf8');
    try {
      const drift = await checkGenerated();
      assert.equal(isClean(drift), false, '--check must not report a dirty tree as clean.');
      assert.ok(
        drift.removed.some((p) => p.endsWith('__drift-probe.ts')),
        `Expected the stray file to be reported. Got ${JSON.stringify(drift)}`,
      );
    } finally {
      rmSync(stray, { force: true });
    }
  });
});
