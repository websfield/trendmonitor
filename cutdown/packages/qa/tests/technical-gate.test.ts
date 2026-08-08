import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeGateStatus, assembleTechnicalQaReport, qaAllowsAdvance, QaWaiverRejected, type QaWaiver } from '../src/technical/gate.js';
import type { TechnicalQaFinding } from '../src/technical/model.js';
import { SHIPPED_RULESET } from './technical-fixtures.js';

/** D-35 in executable form. */

/** The plan every in-scope waiver and report in this suite refers to. */
const PLAN_HASH = { algorithm: 'sha256' as const, value: 'c'.repeat(64) };

const warning = (id: string, checkId: TechnicalQaFinding['checkId'] = 'true_peak'): TechnicalQaFinding => ({
  findingId: id,
  checkId,
  severity: 'warning',
  waivable: true,
  object: 'audio',
  message: 'a warning',
  fix: 'do the thing',
  timeRange: null,
});

const blocker = (id: string, checkId: TechnicalQaFinding['checkId'] = 'missing_media'): TechnicalQaFinding => ({
  findingId: id,
  checkId,
  severity: 'blocker',
  waivable: false,
  object: 'output',
  message: 'a blocker',
  fix: 'fix the render',
  timeRange: null,
});

const info = (id: string): TechnicalQaFinding => ({
  findingId: id,
  checkId: 'non_speech_cue_review',
  severity: 'info',
  waivable: true,
  object: 'audio',
  message: 'fyi',
  fix: 'consider a cue',
  timeRange: null,
});

const waiver = (id: string, findingIds: [string, ...string[]]): QaWaiver => ({
  waiverId: id,
  envelope: {
    schemaVersion: '1.0.0',
    createdAt: '2026-07-29T00:00:00Z',
    createdBy: { kind: 'human', name: 'Test operator' },
  },
  jobId: 'job-1',
  renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
  findingIds,
  approvedBy: 'Test operator',
  reason: 'accepted for review',
  waivedAt: '2026-07-29T00:00:00Z',
  planHash: PLAN_HASH,
});

describe('D-35 gate status', () => {
  it('passes clean', () => {
    strictEqual(computeGateStatus([], []).gateStatus, 'pass');
  });

  it('treats info findings as not affecting the gate', () => {
    strictEqual(computeGateStatus([info('i1')], []).gateStatus, 'pass');
  });

  it('fails on an unwaived warning', () => {
    const result = computeGateStatus([warning('w1')], []);
    strictEqual(result.gateStatus, 'fail');
    strictEqual(result.uncoveredWarnings.length, 1);
  });

  it('passes with waivers once every warning is covered', () => {
    const result = computeGateStatus([warning('w1'), warning('w2', 'black_frames')], [waiver('wv1', ['w1', 'w2'])]);
    strictEqual(result.gateStatus, 'pass_with_waivers');
    strictEqual(result.uncoveredWarnings.length, 0);
  });

  it('still fails when only SOME warnings are waived', () => {
    strictEqual(
      computeGateStatus([warning('w1'), warning('w2', 'black_frames')], [waiver('wv1', ['w1'])]).gateStatus,
      'fail',
    );
  });
});

describe('D-35 waivers are rejected, never ignored', () => {
  it('REJECTS a waiver naming a blocker', () => {
    throws(() => computeGateStatus([blocker('b1')], [waiver('wv1', ['b1'])]), (error: unknown) => {
      ok(error instanceof QaWaiverRejected);
      strictEqual(error.code, 'WAIVER_NAMES_BLOCKER');
      ok(error.message.includes('REJECTED rather than ignored'));
      return true;
    });
  });

  it('REJECTS a waiver naming a finding this report does not contain', () => {
    throws(() => computeGateStatus([warning('w1')], [waiver('wv1', ['stale-id'])]), (error: unknown) => {
      ok(error instanceof QaWaiverRejected);
      strictEqual(error.code, 'WAIVER_NAMES_UNKNOWN_FINDING');
      return true;
    });
  });

  it('REJECTS a finding whose waivable flag contradicts its severity', () => {
    const contradictory: TechnicalQaFinding = { ...warning('w1'), waivable: false };
    throws(() => computeGateStatus([contradictory], [waiver('wv1', ['w1'])]), (error: unknown) => {
      ok(error instanceof QaWaiverRejected);
      strictEqual(error.code, 'FINDING_SELF_INCONSISTENT');
      return true;
    });
  });

  it('REJECTS a waiver written against a DIFFERENT plan', () => {
    // The scope check is what stops a waiver from becoming permanent. Most
    // warning findings carry no time range, so `true_peak:audio` is byte-
    // identical across every render of every job — one waiver file re-supplied
    // on the command line would otherwise waive that warning forever. Scoping on
    // the PLAN rather than the render is what makes the check both effective and
    // usable: applying a waiver means re-rendering, which mints a new render id.
    const other = { ...waiver('wv1', ['w1']), planHash: { algorithm: 'sha256' as const, value: 'd'.repeat(64) } };
    throws(
      () => computeGateStatus([warning('w1')], [other], { jobId: 'job-1', planHash: PLAN_HASH.value }),
      (error: unknown) => {
        ok(error instanceof QaWaiverRejected);
        strictEqual(error.code, 'WAIVER_OUT_OF_SCOPE');
        return true;
      },
    );
  });

  it('REJECTS a waiver belonging to a different job', () => {
    const other = { ...waiver('wv1', ['w1']), jobId: 'some-other-job' };
    throws(
      () => computeGateStatus([warning('w1')], [other], { jobId: 'job-1', planHash: PLAN_HASH.value }),
      (error: unknown) => {
        ok(error instanceof QaWaiverRejected);
        strictEqual(error.code, 'WAIVER_OUT_OF_SCOPE');
        return true;
      },
    );
  });

  it('accepts an in-scope waiver', () => {
    const result = computeGateStatus([warning('w1')], [waiver('wv1', ['w1'])], {
      jobId: 'job-1',
      planHash: PLAN_HASH.value,
    });
    strictEqual(result.gateStatus, 'pass_with_waivers');
    strictEqual(result.waivedFindingIds.join(','), 'w1');
  });

  it('a waiver SURVIVES a re-render of the same plan — the case that makes it usable', () => {
    // The operator flow: render, read the failing report, write a waiver, then
    // RE-render with --waiver. The second render has a different renderId and a
    // different reportId, but the same plan — so the waiver must still apply.
    // Scoping on renderId made this exact flow impossible.
    const reRendered = computeGateStatus([warning('w1')], [waiver('wv1', ['w1'])], {
      jobId: 'job-1',
      planHash: PLAN_HASH.value,
    });
    strictEqual(reRendered.gateStatus, 'pass_with_waivers');
  });

  it('no waiver can move a report containing a blocker out of fail', () => {
    // The blocker is not named (naming it would be rejected outright); the
    // warning beside it is fully waived. The gate must still fail.
    const result = computeGateStatus([blocker('b1'), warning('w1')], [waiver('wv1', ['w1'])]);
    strictEqual(result.gateStatus, 'fail');
    strictEqual(result.blockers.length, 1);
  });
});

describe('the report is assembled, never authored', () => {
  it('computes gateStatus from findings rather than accepting one', () => {
    const report = assembleTechnicalQaReport({
      jobId: 'job-1',
      renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
      renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
      tier: 'draft',
      ruleset: SHIPPED_RULESET,
      planHash: PLAN_HASH,
      checksRun: [{ checkId: 'true_peak', status: 'ran', reason: null }],
      findings: [warning('w1')],
      waivers: [],
    });
    strictEqual(report.gateStatus, 'fail');
    strictEqual(report.rulesetVersion, SHIPPED_RULESET.rulesetVersion);
  });

  it('records the ruleset version so a past verdict stays interpretable', () => {
    const report = assembleTechnicalQaReport({
      jobId: 'job-1',
      renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
      renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
      tier: 'final',
      ruleset: { ...SHIPPED_RULESET, rulesetVersion: '9.9.9' },
      planHash: PLAN_HASH,
      checksRun: [{ checkId: 'true_peak', status: 'ran', reason: null }],
      findings: [],
      waivers: [],
    });
    strictEqual(report.rulesetVersion, '9.9.9');
  });
});

describe('the advance gate re-derives rather than trusting the stored status', () => {
  it('refuses a report claiming `pass` beside a blocker finding', () => {
    // A report is a file on disk. A hand-edited or corrupted `gateStatus` must
    // not advance a job — the findings are the evidence, so the evidence decides.
    const lying = {
      ...assembleTechnicalQaReport({
        jobId: 'job-1',
        renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
        renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
        tier: 'draft' as const,
        ruleset: SHIPPED_RULESET,
        planHash: PLAN_HASH,
        checksRun: [{ checkId: 'missing_media' as const, status: 'ran' as const, reason: null }],
        findings: [blocker('b1')],
        waivers: [],
      }),
      gateStatus: 'pass' as const,
    };
    const decision = qaAllowsAdvance(lying);
    strictEqual(decision.allowed, false);
    ok(decision.reason.includes('re-derived from the findings'));
  });

  it('refuses a report claiming `pass_with_waivers` whose warnings are not actually covered', () => {
    const lying = {
      ...assembleTechnicalQaReport({
        jobId: 'job-1',
        renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
        renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
        tier: 'draft' as const,
        ruleset: SHIPPED_RULESET,
        planHash: PLAN_HASH,
        checksRun: [{ checkId: 'true_peak' as const, status: 'ran' as const, reason: null }],
        findings: [warning('w1')],
        waivers: [],
      }),
      gateStatus: 'pass_with_waivers' as const,
      waiverIds: ['01J9QW2B3C4D5E6F7G8H9K0P1F'],
    };
    strictEqual(qaAllowsAdvance(lying).allowed, false);
  });
});

describe('the advance gate fails closed', () => {
  it('refuses when there is no report at all', () => {
    const decision = qaAllowsAdvance(null);
    strictEqual(decision.allowed, false);
    ok(decision.reason.includes('absence of evidence is not a pass'));
  });

  it('refuses a failing report', () => {
    const report = assembleTechnicalQaReport({
      jobId: 'job-1',
      renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
      renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
      tier: 'draft',
      ruleset: SHIPPED_RULESET,
      planHash: PLAN_HASH,
      checksRun: [{ checkId: 'missing_media', status: 'ran', reason: null }],
      findings: [blocker('b1')],
      waivers: [],
    });
    strictEqual(qaAllowsAdvance(report).allowed, false);
  });

  it('allows pass_with_waivers', () => {
    const report = assembleTechnicalQaReport({
      jobId: 'job-1',
      renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
      renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
      tier: 'draft',
      ruleset: SHIPPED_RULESET,
      planHash: PLAN_HASH,
      checksRun: [{ checkId: 'true_peak', status: 'ran', reason: null }],
      findings: [warning('w1')],
      waivers: [waiver('wv1', ['w1'])],
    });
    strictEqual(report.gateStatus, 'pass_with_waivers');
    strictEqual(qaAllowsAdvance(report).allowed, true);
  });
});
