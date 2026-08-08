import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createQaTransitionGate,
  gatingTierFor,
  requiresApproval,
  type QaGateReport,
  type ReviewDecisionState,
} from '../src/gates.js';
import { PIPELINE, type PipelineStep } from '../src/pipeline.js';

/**
 * Task 9's rule, executed: draft QA gates entry to `review`, final QA gates entry
 * to `packaging`, and both fail closed.
 */

const step = (skill: string, fromState: string): PipelineStep =>
  PIPELINE.find((s) => s.skill === skill && s.fromState === fromState) as PipelineStep;

const report = (overrides: Partial<QaGateReport> = {}): QaGateReport => ({
  gateStatus: 'pass',
  tier: 'draft',
  findings: [],
  waiverIds: [],
  waivedFindingIds: [],
  ...overrides,
});

/**
 * `reviewDecisionInForce` is a REQUIRED env member, so every gate built here has
 * to state one. The default is `none` — the fail-closed value — so a test that
 * forgets to set it cannot accidentally assert that an unapproved job advances.
 */
const gateWith = (
  map: Partial<Record<'draft' | 'final', QaGateReport | null>>,
  decision: ReviewDecisionState = { kind: 'none' },
) =>
  createQaTransitionGate({
    latestQaReport: (_job, tier) => map[tier] ?? null,
    reviewDecisionInForce: () => decision,
  });

describe('which steps are gated', () => {
  it('gates entry to review on the DRAFT render', () => {
    strictEqual(gatingTierFor(step('approve', 'review')), 'draft');
  });

  it('gates entry to packaging on the FINAL render', () => {
    strictEqual(gatingTierFor(step('package', 'packaging')), 'final');
  });

  it('leaves the editorial steps ungated — QA is about renders', () => {
    for (const skill of ['ingest', 'index', 'propose', 'plan', 'validate']) {
      const target = PIPELINE.find((s) => s.skill === skill) as PipelineStep;
      strictEqual(gatingTierFor(target), null, `${skill} must not be QA-gated`);
    }
  });

  it('does not gate the render steps themselves — a render produces the evidence', () => {
    for (const target of PIPELINE.filter((s) => s.skill === 'render')) {
      strictEqual(gatingTierFor(target), null);
    }
  });
});

describe('the gate fails closed', () => {
  it('refuses when no report exists', async () => {
    const decision = await gateWith({})(step('approve', 'review'), 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) strictEqual(decision.code, 'QA_REPORT_MISSING');
  });

  it('refuses on blockers, naming them', async () => {
    const decision = await gateWith({
      draft: report({
        gateStatus: 'fail',
        findings: [{ checkId: 'missing_media', severity: 'blocker', findingId: 'missing_media:output' }],
      }),
    })(step('approve', 'review'), 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) {
      strictEqual(decision.code, 'QA_BLOCKERS');
      ok(decision.reason.includes('missing_media'));
      ok(decision.reason.includes('cannot be waived'));
    }
  });

  it('refuses on unwaived warnings', async () => {
    const decision = await gateWith({
      draft: report({
        gateStatus: 'fail',
        findings: [{ checkId: 'true_peak', severity: 'warning', findingId: 'true_peak:audio' }],
      }),
    })(step('approve', 'review'), 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) strictEqual(decision.code, 'QA_UNWAIVED_WARNINGS');
  });

  it('refuses an unreadable report rather than treating it as absent', async () => {
    const gate = createQaTransitionGate({
      latestQaReport: () => {
        throw new Error('unexpected token }');
      },
      reviewDecisionInForce: () => ({ kind: 'none' }),
    });
    const decision = await gate(step('approve', 'review'), 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) strictEqual(decision.code, 'QA_REPORT_UNREADABLE');
  });

  it("refuses a draft report offered at the FINAL gate — one tier's QA never authorises the other", async () => {
    const gate = createQaTransitionGate({
      latestQaReport: () => report({ tier: 'draft' }),
      reviewDecisionInForce: () => ({ kind: 'none' }),
    });
    const decision = await gate(step('package', 'packaging'), 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) strictEqual(decision.code, 'QA_REPORT_WRONG_TIER');
  });
});

describe('the gate allows what it should', () => {
  it('allows a clean pass', async () => {
    const decision = await gateWith({ draft: report() })(step('approve', 'review'), 'job-1');
    strictEqual(decision.allowed, true);
  });

  it('allows pass_with_waivers, and says so', async () => {
    const decision = await gateWith({
      draft: report({
        gateStatus: 'pass_with_waivers',
        findings: [{ checkId: 'true_peak', severity: 'warning', findingId: 'true_peak:audio' }],
        waiverIds: ['01J9QW2B3C4D5E6F7G8H9K0P1F'],
        // The COVERED FINDING ids, not just the waiver's own id. Setting only
        // waiverIds is what the old gate silently accepted; it now refuses,
        // because a waiver id says nothing about which finding was accepted.
        waivedFindingIds: ['true_peak:audio'],
      }),
    })(step('approve', 'review'), 'job-1');
    strictEqual(decision.allowed, true);
    ok(decision.reason.includes('waiver'));
  });

  it('gates the FINAL tier independently of the draft', async () => {
    const gate = gateWith({
      draft: report({ tier: 'draft' }),
      final: report({ tier: 'final', gateStatus: 'fail', findings: [{ checkId: 'container_corruption', severity: 'blocker', findingId: 'container_corruption:output' }] }),
    });
    strictEqual((await gate(step('approve', 'review'), 'job-1')).allowed, true);
    strictEqual((await gate(step('package', 'packaging'), 'job-1')).allowed, false);
  });
});

/**
 * The Phase 5 gate: entry to the FINAL render requires an approval in force
 * (tech-spec §15 step 8, decisions.md D-34).
 *
 * This gate exists because of an asymmetry the QA gates do not have. A REJECTION
 * is a perfectly successful `approve` invocation, so the run log legitimately
 * records "approve completed" and the job legitimately enters `final-rendering`
 * even though the human said no. Something has to read the *content* of the
 * decision before the most expensive irreversible step in the pipeline.
 */
describe('which step requires an approval', () => {
  it('is the FINAL render, and nothing else', () => {
    strictEqual(requiresApproval(step('render', 'final-rendering')), true);
    strictEqual(requiresApproval(step('render', 'draft-rendering')), false, 'a draft needs no approval — D-34');
    for (const [skill, from] of [
      ['ingest', 'uploaded'],
      ['propose', 'brief-generation'],
      ['validate', 'validating'],
      ['approve', 'review'],
      ['package', 'packaging'],
    ] as const) {
      strictEqual(requiresApproval(step(skill, from)), false, `${skill} must not require an approval to ENTER`);
    }
  });

  it('never confuses the two gate kinds — the final render is approval-gated, not QA-gated', () => {
    // The final render's own QA does not exist yet when this gate runs (it is
    // produced BY this step), so asking for a QA report here would be a gate that
    // can never pass.
    strictEqual(gatingTierFor(step('render', 'final-rendering')), null);
  });
});

describe('the approval gate fails closed', () => {
  const finalRender = step('render', 'final-rendering');

  it('refuses when no decision is in force', async () => {
    const decision = await gateWith({}, { kind: 'none' })(finalRender, 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) {
      strictEqual(decision.code, 'REVIEW_DECISION_MISSING');
      ok(decision.reason.includes('no flag that waives this'));
    }
  });

  it('refuses a REJECTION distinctly, quoting the reason and naming `cutdown revise`', async () => {
    const decision = await gateWith({}, {
      kind: 'rejected',
      decidedBy: 'Bea',
      reason: 'the claim at 3 s is unsupported',
    })(finalRender, 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) {
      strictEqual(decision.code, 'REVIEW_REJECTED', 'a rejection is NOT the same refusal as "nobody decided"');
      ok(decision.reason.includes('the claim at 3 s is unsupported'));
      ok(decision.reason.includes('cutdown revise'));
      ok(decision.reason.includes('not failed'), 'a rejection is a waiting job, not a broken one');
    }
  });

  it('refuses an unreadable decision rather than treating it as absent', async () => {
    const decision = await gateWith({}, {
      kind: 'unreadable',
      detail: '01J9RV2B3C4D5E6F7G8H9K0P1A.json (not valid JSON)',
    })(finalRender, 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) strictEqual(decision.code, 'REVIEW_DECISION_UNREADABLE');
  });

  it('refuses when the env itself throws', async () => {
    const gate = createQaTransitionGate({
      latestQaReport: () => null,
      reviewDecisionInForce: () => {
        throw new Error('reviews/ is a file, not a directory');
      },
    });
    const decision = await gate(finalRender, 'job-1');
    strictEqual(decision.allowed, false);
    if (!decision.allowed) strictEqual(decision.code, 'REVIEW_DECISION_UNREADABLE');
  });

  it('allows a final render when an approval IS in force, naming who approved it', async () => {
    const decision = await gateWith({}, {
      kind: 'approved',
      decidedBy: 'Fred',
      renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
    })(finalRender, 'job-1');
    strictEqual(decision.allowed, true);
    ok(decision.reason.includes('Fred'), 'an allowed transition still records whose authority it rests on');
  });
});
