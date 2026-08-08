import type { PipelineStep } from './pipeline.js';

/**
 * Transition gates — the conditions a job must satisfy to ENTER a step
 * (tech-spec §15 step 7, decisions.md D-35).
 *
 * Gating entry to the *next* step rather than exit from the previous one is a
 * deliberate choice about honesty. The run log is authoritative: a render that
 * produced a file and a failing QA report genuinely *ran*, and rewriting that
 * invocation as a failure to stop the pipeline would make the log disagree with
 * what happened. Instead the render stays completed, and the job simply does not
 * advance — which is also the resumable shape, because adding a waiver or
 * re-rendering changes the answer on the next `advance` with no log surgery.
 *
 * The gates:
 *
 *   - `approve` (from `review`) ← the DRAFT render's QA must be `pass` or
 *     `pass_with_waivers` (Phase 4).
 *   - `render` (from `final-rendering`) ← a review decision must be IN FORCE and
 *     must be an approval (Phase 5).
 *   - `package` (from `packaging`) ← the FINAL render's QA, same rule as the draft.
 *
 * The middle one exists because of an asymmetry that is easy to miss. `analyze()`
 * advances a job on a *completed invocation*, matched by skill name — and a
 * rejection is a perfectly successful `approve` invocation. So the run log
 * legitimately carries "approve completed" and the job legitimately enters
 * `final-rendering`, even though what the human said was **no**. Without this
 * gate the runner would then drive a final render, which the `render` skill would
 * refuse — a correct outcome reached by the expensive route, reported as a
 * blocked job rather than as "the reviewer rejected this; run `cutdown revise`".
 *
 * Every gate fails closed. A missing report, an unreadable report, a report for
 * the wrong TIER, an absent decision and an unreadable decision all block: "no
 * evidence" is never "no problem". (Render-level waiver scope is enforced where
 * waivers are applied, not here — this gate reads the latest report for a tier
 * and judges it.)
 */

export type GateDecision =
  | { readonly allowed: true; readonly reason: string }
  | { readonly allowed: false; readonly code: string; readonly reason: string };

export interface TransitionGate {
  (step: PipelineStep, jobId: string): Promise<GateDecision>;
}

/** What the gate needs to know about a QA report, without importing the runner into `@cutdown/qa`. */
export interface QaGateReport {
  readonly gateStatus: 'pass' | 'pass_with_waivers' | 'fail';
  readonly tier: 'draft' | 'final';
  readonly findings: readonly {
    readonly checkId: string;
    readonly severity: 'blocker' | 'warning' | 'info';
    readonly findingId: string;
  }[];
  readonly waiverIds: readonly string[];
  /**
   * The FINDING ids the waivers cover. Distinct from `waiverIds` — comparing a
   * finding id against a list of waiver ids is a predicate that is always false,
   * which is exactly the bug this field exists to make impossible.
   */
  readonly waivedFindingIds: readonly string[];
}

/**
 * The review decision in force for the draft the job is proceeding from, as the
 * gate needs to see it — without importing `@cutdown/contracts` into the runner.
 *
 * The three arms are never collapsed: `rejected` means a human looked and said
 * no (next step: `cutdown revise`), `none` means nobody has decided, and
 * `unreadable` means a decision file exists and is broken. All three block, and
 * all three have different fixes.
 */
export type ReviewDecisionState =
  | { readonly kind: 'approved'; readonly decidedBy: string; readonly renderManifestId: string }
  | { readonly kind: 'rejected'; readonly decidedBy: string; readonly reason: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'unreadable'; readonly detail: string };

export interface QaGateEnv {
  /**
   * The most recent QA report for a tier, or `null` if none exists.
   *
   * `null` and "a report that says fail" are handled identically by the gate —
   * both block — but they are reported differently, because an operator chasing
   * a blocked job needs to know whether QA ran and refused or never ran at all.
   */
  latestQaReport(jobId: string, tier: 'draft' | 'final'): QaGateReport | null;

  /**
   * The review decision in force for the job's latest draft render.
   *
   * **Required, not optional**, for the same reason the gate itself is a required
   * Runner argument: Phase 4 shipped an optional gate and the production runner
   * silently ran without one. An env member a caller can leave off is a check a
   * caller can forget.
   */
  reviewDecisionInForce(jobId: string): ReviewDecisionState;
}

/** Which tier's QA a step's entry depends on. `null` = not QA-gated. */
export function gatingTierFor(step: PipelineStep): 'draft' | 'final' | null {
  if (step.skill === 'approve' && step.fromState === 'review') return 'draft';
  if (step.skill === 'package' && step.fromState === 'packaging') return 'final';
  return null;
}

/** Does this step's entry require an approval to be in force? (tech-spec §15 step 8) */
export function requiresApproval(step: PipelineStep): boolean {
  return step.skill === 'render' && step.fromState === 'final-rendering';
}

export function createQaTransitionGate(env: QaGateEnv): TransitionGate {
  return (step, jobId) => Promise.resolve(decide(env, step, jobId));
}

/**
 * A gate that permits everything — for `rebuild`, which runs no steps, and for
 * tests that are not exercising the gate.
 *
 * It exists so that "no gate" has to be written down at the call site rather
 * than achieved by leaving an argument off. The distinction matters: the first
 * cut made the gate optional, and the production runner silently ran without one.
 */
export const openGate: TransitionGate = () =>
  Promise.resolve({ allowed: true, reason: 'No transition gate is applied to this runner.' });

function decide(env: QaGateEnv, step: PipelineStep, jobId: string): GateDecision {
  if (requiresApproval(step)) return decideApproval(env, jobId);

  const tier = gatingTierFor(step);
  if (tier === null) return { allowed: true, reason: 'This step has no QA precondition.' };

  let report: QaGateReport | null;
  try {
    report = env.latestQaReport(jobId, tier);
  } catch (error) {
    return {
      allowed: false,
      code: 'QA_REPORT_UNREADABLE',
      reason:
        `The ${tier} QA report could not be read: ${(error as Error).message}. ` +
        `A malformed report fails closed — it is not treated as an absent one, and never as a pass.`,
    };
  }

  if (report === null) {
    return {
      allowed: false,
      code: 'QA_REPORT_MISSING',
      reason:
        `No technical QA report exists for the ${tier} render of job ${jobId}. ` +
        `No render reaches ${step.fromState} without one (tech-spec §15 step 7).`,
    };
  }

  if (report.tier !== tier) {
    return {
      allowed: false,
      code: 'QA_REPORT_WRONG_TIER',
      reason: `The report found for the ${tier} gate describes a ${report.tier} render. A draft's QA never authorises a final, or the reverse.`,
    };
  }

  // Re-derived from the findings, not read off `gateStatus`. The report is a
  // file on disk; a hand-edited `"gateStatus": "pass"` beside a blocker must not
  // advance a job.
  const blockers = report.findings.filter((f) => f.severity === 'blocker');
  if (blockers.length > 0) {
    return {
      allowed: false,
      code: 'QA_BLOCKERS',
      reason: `The ${tier} render has ${String(blockers.length)} non-waivable blocker(s): ${blockers.map((f) => f.checkId).join(', ')}. Fix the render; a blocker cannot be waived (D-35).`,
    };
  }

  const waived = new Set(report.waivedFindingIds);
  const unwaived = report.findings.filter((f) => f.severity === 'warning' && !waived.has(f.findingId));
  if (unwaived.length > 0) {
    return {
      allowed: false,
      code: 'QA_UNWAIVED_WARNINGS',
      reason: `The ${tier} render has ${String(unwaived.length)} unwaived warning(s): ${unwaived.map((f) => f.checkId).join(', ')}. Either fix them or record a named waiver.`,
    };
  }

  if (report.gateStatus === 'fail') {
    return {
      allowed: false,
      code: 'QA_REPORT_SELF_CONTRADICTORY',
      reason: `The ${tier} report records gateStatus "fail" but carries no blocker and no uncovered warning. It contradicts itself, so the gate refuses rather than resolving it in either direction.`,
    };
  }

  return {
    allowed: true,
    reason:
      report.gateStatus === 'pass'
        ? `The ${tier} render passed QA with no findings above info.`
        : `The ${tier} render passed QA with ${String(report.waiverIds.length)} recorded waiver(s).`,
  };
}

/**
 * Entry to the FINAL render (tech-spec §15 step 8).
 *
 * A completed `approve` invocation advances the job whatever the human said, so
 * this is the only place the *content* of the decision is consulted before the
 * expensive step. Each refusal names its own fix, because the three ways to lack
 * an approval have three different next actions.
 */
function decideApproval(env: QaGateEnv, jobId: string): GateDecision {
  let state: ReviewDecisionState;
  try {
    state = env.reviewDecisionInForce(jobId);
  } catch (error) {
    return {
      allowed: false,
      code: 'REVIEW_DECISION_UNREADABLE',
      reason:
        `The review decisions for job ${jobId} could not be read: ${(error as Error).message}. ` +
        `A decision that cannot be read is never treated as an approval.`,
    };
  }

  switch (state.kind) {
    case 'approved':
      return {
        allowed: true,
        reason: `${state.decidedBy} approved draft manifest ${state.renderManifestId}.`,
      };
    case 'rejected':
      return {
        allowed: false,
        code: 'REVIEW_REJECTED',
        reason:
          `${state.decidedBy} REJECTED the reviewed draft: "${state.reason}". ` +
          `A rejection advances only to revision — run \`cutdown revise\` and render a new draft. ` +
          `The job is not failed; it is waiting on the revision.`,
      };
    case 'none':
      return {
        allowed: false,
        code: 'REVIEW_DECISION_MISSING',
        reason:
          `No review decision is in force for job ${jobId}, so nothing authorises a final render (decisions.md D-34). ` +
          `Run \`cutdown approve <draft-render-id> --by <name>\`. There is no flag that waives this.`,
      };
    case 'unreadable':
      return {
        allowed: false,
        code: 'REVIEW_DECISION_UNREADABLE',
        reason:
          `A file in job ${jobId}'s decision namespace (reviews/<reviewDecisionId>.json) could not be read as a decision: ${state.detail}. ` +
          `The decision SET is therefore incomplete, and the set is what determines which decision is latest — so an approval on disk cannot be trusted. ` +
          `This blocks rather than reading as "never reviewed": the two are different problems with different fixes. ` +
          `Only files named <ulid>.json are candidates, so the validate skill's gate outputs under reviews/gates/ are out of scope and never cause this.`,
      };
  }
}
