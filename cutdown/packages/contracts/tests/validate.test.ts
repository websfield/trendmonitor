import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    // manufactured and the detector is required to see it.
    //
    // The probe goes into a TEMP COPY of the tree, never the committed one. Writing
    // it into `generated/typescript/` was measured breaking this very suite:
    // `node:test` runs the two async tests of a `describe` concurrently, so the probe
    // was on disk while the sibling test above asserted the trees were current, and a
    // full `pnpm -r --no-bail run test` returned `fail 1` with
    // `removed: ["generated/typescript/__drift-probe.ts"]`. The window is visible
    // across packages too — `apps/cli`'s doctor suite calls `checkGenerated` and runs
    // in parallel under `pnpm -r` — and a crashed run left a committed tree dirty for
    // CI's "the gate did not modify the working tree" step (D-57). A test that mutates
    // a committed artefact to prove a point about it is not a safe test.
    const scratch = mkdtempSync(join(tmpdir(), 'cutdown-drift-probe-'));
    try {
      const tsCopy = join(scratch, 'typescript');
      cpSync(GENERATED_TS_DIR, tsCopy, { recursive: true });
      writeFileSync(join(tsCopy, '__drift-probe.ts'), 'export const drift = true;\n', 'utf8');
      const drift = await checkGenerated({ ts: tsCopy });
      assert.equal(isClean(drift), false, '--check must not report a dirty tree as clean.');
      assert.ok(
        drift.removed.some((p) => p.endsWith('__drift-probe.ts')),
        `Expected the stray file to be reported. Got ${JSON.stringify(drift)}`,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    // And the committed tree is untouched by the whole exercise — asserted, because
    // "the probe went to a copy" is exactly the kind of claim that rots silently.
    assert.ok(isClean(await checkGenerated()), 'the committed trees must be untouched by this test');
  });
});
