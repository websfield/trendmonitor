import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { resolveOutputs } from '@cutdown/contracts';

import { loadAllPackages } from '../src/commands/status.js';

/**
 * `resolveOutputs` driven over the REAL delivered packages on disk.
 *
 * The unit tests for output identity live in
 * `packages/contracts/tests/output-identity.test.ts` and build their packages in
 * memory. This one file exists because a rule is only alive when a test drives it
 * from its real producer's artefact (CLAUDE.md, 2026-08-02): the in-memory fixtures
 * prove the resolver's logic, and only this proves that what
 * `skills/package` actually wrote — through `loadAllPackages`, with contract
 * validation on read — resolves the way the counting policy says it does.
 *
 * It lives in `apps/cli` rather than beside its siblings because `loadAllPackages`
 * does, and `packages/contracts` cannot import from `apps/cli` — the dependency
 * runs one way.
 *
 * ## Why it can skip, and why the skip is loud
 *
 * `project-data/` is gitignored (client footage, rights-sensitive media), so a
 * clean clone and CI have no packages at all. A test that quietly passed on an
 * empty corpus would report "present-and-verified" for something it never ran, so
 * absence SKIPS with the reason named. The expected values below are the ones spike
 * F-J and F-K measured against these exact files.
 */

/** The pair spike F-K measured: two real packages, one CreativeBrief, one job. */
const REAL_CREATIVE_BRIEF_ID = '01KZ8ARV5A260Z7D3VJAY94C3Q';
const REAL_JOB_ID = 'schwarzkopf-w1-showcase';
const SURVIVOR_ID = '01KZ9YK48KBRAX85DJ1P76NYMN';
const SUPERSEDED_ID = '01KZ8B40TENCWQ72F061FXK79S';

describe('resolveOutputs over the real delivered packages', () => {
  test('the two real packages of one CreativeBrief resolve to ONE output', (t) => {
    const loaded = loadAllPackages();
    const real = loaded.packages.filter((pkg) => pkg.sourceClassification === 'real');
    if (real.length === 0) {
      t.skip('no real ContentPackage on disk — project-data/ is gitignored, so this corpus does not exist on a clean clone or in CI');
      return;
    }

    // Stated rather than assumed: if the corpus grows, this test must be re-derived
    // rather than silently asserting yesterday's numbers.
    strictEqual(loaded.unreadable.length, 0, 'the live corpus is fully readable');
    strictEqual(real.length, 2, 'spike F-J measured exactly two real packages; a third means these expectations need re-deriving');
    ok(
      real.every((pkg) => pkg.lineage.creativeBriefId === REAL_CREATIVE_BRIEF_ID && pkg.jobId === REAL_JOB_ID),
      'both real packages carry the CreativeBrief and job F-K measured',
    );

    const result = resolveOutputs(loaded);
    ok(result.kind === 'resolved', `expected a resolved answer, got ${result.kind}`);

    const realOutputs = result.outputs.filter((output) => output.key.sourceClassification === 'real');
    strictEqual(realOutputs.length, 1, 'two packages of one CreativeBrief are ONE delivered output (T-1)');
    strictEqual(realOutputs[0]?.survivor.contentPackageId, SURVIVOR_ID, 'the later package is the one in force');
    deepStrictEqual(
      realOutputs[0]?.superseded.map((pkg) => pkg.contentPackageId),
      [SUPERSEDED_ID],
      'the superseded package is NAMED — a superseded count of 0 is indistinguishable from "supersession was not computed"',
    );

    // D-36's whole job: the fixture package is a separate output of a separate class
    // and takes no part in the real count.
    deepStrictEqual(
      result.outputs.filter((output) => output.key.sourceClassification === 'fixture').length,
      loaded.packages.filter((pkg) => pkg.sourceClassification === 'fixture').length,
      'each fixture package carries its own CreativeBrief, so none of them merge either',
    );
    deepStrictEqual(result.excludedIncomplete, [], 'every delivered package on disk carries complete evidence');
    deepStrictEqual(result.anomalies, [], 'no delivered CreativeBrief spans two jobs or two accounts');
  });
});
