import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { makeQaGateEnv } from '../src/commands/run.js';

/**
 * `makeQaGateEnv` — the CLI half of the Phase 4 QA gate, and Phase 4's residual 2.
 *
 * It shipped with no test, which is exactly why its first two versions were both
 * wrong in the same direction: the original walked BACKWARDS through render
 * directories until it found any report, so a brand-new unjudged render was
 * authorised by an older render's verdict — the gate failing open in precisely
 * the situation it exists for.
 *
 * Three behaviours are load-bearing and all three are asserted here:
 *   1. LATEST directory only, ordered by ULID (lexicographic = chronological).
 *   2. A latest directory with no report THROWS — the gate reads a throw as
 *      QA_REPORT_UNREADABLE and blocks, which is different from "no report
 *      exists" and must not be collapsed into it.
 *   3. No render directory at all returns `null` — nothing has been rendered yet.
 */

let root: string;

const JOB = 'qa-gate-env-test';

const reportFor = (tier: 'draft' | 'final', label: string) => ({
  gateStatus: 'pass' as const,
  tier,
  findings: [],
  waiverIds: [],
  waivedFindingIds: [label],
});

/** Write a render directory, optionally with a report beside it. */
function render(tier: 'draft' | 'final', manifestId: string, label: string | null): void {
  const dir = join(root, JOB, 'renders', tier, manifestId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'output.mp4'), 'not really a video');
  if (label !== null) {
    writeFileSync(join(dir, 'qa-report.json'), JSON.stringify(reportFor(tier, label)));
  }
}

const env = () => makeQaGateEnv((jobId) => join(root, jobId));

before(() => {
  root = mkdtempSync(join(tmpdir(), 'cutdown-qa-gate-env-'));
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('makeQaGateEnv reads the LATEST render only', () => {
  it('returns null when the job has no renders at all', () => {
    strictEqual(env().latestQaReport('never-rendered', 'draft'), null);
  });

  it('returns the report of the only render', () => {
    render('draft', '01J9RM2B3C4D5E6F7G8H9K0AAA', 'first');
    const report = env().latestQaReport(JOB, 'draft');
    ok(report !== null);
    strictEqual(report.waivedFindingIds[0], 'first');
  });

  it('prefers the ULID-latest render, not the first or the alphabetically odd one', () => {
    // Deliberately created out of order: the newest ULID is written FIRST, so a
    // lookup that returned "the last one created on disk" would pick the wrong
    // directory and pass this test only by accident.
    render('draft', '01J9RM2B3C4D5E6F7G8H9K0ZZZ', 'newest');
    render('draft', '01J9RM2B3C4D5E6F7G8H9K0BBB', 'middle');
    const report = env().latestQaReport(JOB, 'draft');
    ok(report !== null);
    strictEqual(report.waivedFindingIds[0], 'newest');
  });

  it('THROWS when the latest render has no report, rather than falling back to an older verdict', () => {
    // The fail-open bug, encoded as a test: an unjudged render newer than a
    // judged one must never inherit the older one's pass.
    render('draft', '01J9RM2B3C4D5E6F7G8H9K0ZZZZ', null);
    throws(
      () => env().latestQaReport(JOB, 'draft'),
      (error: Error) => {
        ok(
          error.message.includes('01J9RM2B3C4D5E6F7G8H9K0ZZZZ'),
          'the error names the render that was never judged',
        );
        ok(error.message.includes('no qa-report.json'));
        return true;
      },
    );
  });

  it('keeps the tiers separate — a draft render is invisible at the final gate', () => {
    strictEqual(
      env().latestQaReport(JOB, 'final'),
      null,
      'the job has draft renders only, so the final tier has no evidence — and null blocks',
    );
    render('final', '01J9RM2B3C4D5E6F7G8H9K0FFF', 'the final');
    const report = env().latestQaReport(JOB, 'final');
    ok(report !== null);
    strictEqual(report.tier, 'final');
  });

  it('ignores files that are not directories in the tier root', () => {
    const tierRoot = join(root, 'stray-files-job', 'renders', 'final');
    mkdirSync(tierRoot, { recursive: true });
    writeFileSync(join(tierRoot, 'notes.txt'), 'an operator left this here');
    // A stray file sorting after every ULID would otherwise be selected as the
    // "latest render" and then throw for having no report — a phantom blockage.
    strictEqual(env().latestQaReport('stray-files-job', 'final'), null);
  });
});

describe('a malformed report is a throw, not a null', () => {
  it('lets a JSON parse error propagate so the gate can report it as UNREADABLE', () => {
    const dir = join(root, 'malformed-job', 'renders', 'draft', '01J9RM2B3C4D5E6F7G8H9K0MAK');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'qa-report.json'), '{ this is not json');
    throws(() => env().latestQaReport('malformed-job', 'draft'));
  });
});

/**
 * `reviewDecisionInForce` — the PRODUCTION half of the Phase 5 approval gate.
 *
 * Only the stub in `workflows/local/tests/gates.test.ts` was tested, and this file
 * covered `latestQaReport` only. The gate's own docstring records the Phase 4 lesson
 * that production wiring is exactly where the last gate went missing.
 */
describe('reviewDecisionInForce reads the LATEST draft and the decision in force', () => {
  const JOB2 = 'decision-in-force-test';
  const DRAFT_A = '01J9RM2B3C4D5E6F7G8H9K0DA1';
  const DRAFT_B = '01J9RM2B3C4D5E6F7G8H9K0DB2';

  const decision = (id: string, manifestId: string, decidedAt: string, outcome: 'approved' | 'rejected'): void => {
    const dir = join(root, JOB2, 'reviews');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${id}.json`),
      JSON.stringify({
        reviewDecisionId: id,
        envelope: { schemaVersion: '1.0.0', createdAt: decidedAt, createdBy: { kind: 'human', name: 'Fred' } },
        jobId: JOB2,
        subjectDraftRenderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
        subjectEdlId: '01J9ED2B3C4D5E6F7G8H9K0M6T',
        subjectRenderManifestId: manifestId,
        subjectPlanHash: { algorithm: 'sha256', value: 'd'.repeat(64) },
        decidedBy: 'Fred',
        decidedAt,
        decision:
          outcome === 'approved'
            ? { outcome: 'approved', notes: null }
            : { outcome: 'rejected', reason: 'not yet', notes: null },
      }),
    );
  };

  const draft = (manifestId: string): void => {
    const dir = join(root, JOB2, 'renders', 'draft', manifestId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'qa-report.json'), JSON.stringify(reportFor('draft', manifestId)));
  };

  it('reports `none` when the job has no drafts', () => {
    strictEqual(env().reviewDecisionInForce('no-drafts-at-all').kind, 'none');
  });

  it('reports `none` when a draft exists but nobody has decided', () => {
    draft(DRAFT_A);
    strictEqual(env().reviewDecisionInForce(JOB2).kind, 'none');
  });

  it('reports `approved`, naming who approved it', () => {
    decision('01J9RV2B3C4D5E6F7G8H9K0GA1', DRAFT_A, '2026-07-30T01:00:00.000Z', 'approved');
    const state = env().reviewDecisionInForce(JOB2);
    strictEqual(state.kind, 'approved');
    if (state.kind === 'approved') {
      strictEqual(state.decidedBy, 'Fred');
      strictEqual(state.renderManifestId, DRAFT_A);
    }
  });

  it('follows the LATEST draft — an approval of an older draft does not carry over', () => {
    // The same fail-open shape as the QA lookup: a NEWER unapproved draft must not
    // inherit an older draft's approval.
    draft(DRAFT_B);
    strictEqual(
      env().reviewDecisionInForce(JOB2).kind,
      'none',
      'the newest draft (DRAFT_B) has no decision of its own',
    );
  });

  it('reports `rejected` distinctly once the latest draft is rejected', () => {
    decision('01J9RV2B3C4D5E6F7G8H9K0GR1', DRAFT_B, '2026-07-30T02:00:00.000Z', 'rejected');
    const state = env().reviewDecisionInForce(JOB2);
    strictEqual(state.kind, 'rejected');
    if (state.kind === 'rejected') ok(state.reason.includes('not yet'));
  });

  it('reports `unreadable` when a file IN THE DECISION NAMESPACE cannot be read — never `none`', () => {
    // ULID-named, so it is a candidate decision: it might be the rejection that
    // supersedes an approval, and the runner must not read that as "nobody decided".
    const broken = '01J9RV2B3C4D5E6F7G8H9K0GB1.json';
    writeFileSync(join(root, JOB2, 'reviews', broken), '{ not json');
    const state = env().reviewDecisionInForce(JOB2);
    strictEqual(state.kind, 'unreadable', 'an incomplete decision set is not "nobody decided"');
    if (state.kind === 'unreadable') ok(state.detail.includes(broken));
    rmSync(join(root, JOB2, 'reviews', broken), { force: true });
  });

  it('does NOT report `unreadable` for a neighbour file outside the namespace', () => {
    // The round-3 CRITICAL at the runner gate. Every job runs `validate` (step 5 of 9),
    // and while its gate outputs sat directly in `reviews/` this gate blocked EVERY
    // job at step 8 — the previous version of the test above used a `broken.json` that
    // is exactly such a neighbour, so it passed for the wrong reason and proved the
    // opposite of what the pipeline needed.
    // Asserted as "changes NOTHING" rather than "is not unreadable": the resolution
    // for this job depends on decisions earlier tests left on disk, and a bare
    // `!== 'unreadable'` would also pass if the gate started failing some other way.
    const before = env().reviewDecisionInForce(JOB2);
    mkdirSync(join(root, JOB2, 'reviews', 'gates'), { recursive: true });
    writeFileSync(join(root, JOB2, 'reviews', 'gates', 'edl-gate.json'), '{ not json');
    writeFileSync(join(root, JOB2, 'reviews', 'notes.json'), '{ half a thought');
    const after_ = env().reviewDecisionInForce(JOB2);
    deepStrictEqual(after_, before, 'a non-decision file is out of scope, not an irrevocable veto');
    ok(after_.kind !== 'unreadable', 'and specifically it never reads as an incomplete decision set');
  });
});
