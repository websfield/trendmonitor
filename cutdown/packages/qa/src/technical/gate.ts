import { ulid } from 'ulid';
import type { QaWaiverV1 } from '@cutdown/contracts/generated';
import type {
  QaCheckRecord,
  QaGateStatus,
  QaRuleset,
  TechnicalQaFinding,
  TechnicalQaReport,
} from './model.js';

/**
 * `gateStatus` computation and the D-35 waiver policy.
 *
 * D-35 in force: waivers cover **warnings only**, are **named**, and are
 * **immutable**. Three properties follow, and each is enforced by rejecting
 * rather than ignoring:
 *
 *   1. A waiver naming a **blocker** is REJECTED. Ignoring it would leave the
 *      operator believing a finding had been accepted while the gate still
 *      failed on it — a disagreement between what the system did and what the
 *      person thinks it did, which is the worst kind of silent behaviour.
 *   2. A waiver naming an **unknown finding** is REJECTED. Finding ids are
 *      derived from (check, object, time range), so an unknown id means the
 *      render changed since the waiver was written and the waiver no longer
 *      describes anything a human looked at.
 *   3. A waiver accepting a **different plan** is REJECTED. Finding ids are
 *      derived from (check, object, time range), and most warnings carry no time
 *      range — so `true_peak:audio` is byte-identical across every render of
 *      every job. Without a scope check, one waiver file re-supplied on the
 *      command line would waive that warning everywhere, permanently. The scope
 *      is the PLAN hash rather than the render id: a waiver is written against a
 *      failing render and applied by RE-rendering, so a render-scoped waiver
 *      would reject itself on the very run that used it.
 *   4. `gateStatus` is COMPUTED here, never authored. Downstream readers do not
 *      have to trust it either: `qaAllowsAdvance` re-derives the blocker half
 *      from `findings` and refuses on any blocker regardless of what the stored
 *      status claims.
 */

export type QaWaiver = QaWaiverV1.QaWaiver;

export class QaWaiverRejected extends Error {
  readonly code: string;
  readonly waiverId: string;
  readonly findingIds: readonly string[];
  constructor(code: string, message: string, waiverId: string, findingIds: readonly string[]) {
    super(message);
    this.name = 'QaWaiverRejected';
    this.code = code;
    this.waiverId = waiverId;
    this.findingIds = findingIds;
  }
}

export interface GateResult {
  readonly gateStatus: QaGateStatus;
  readonly waiverIds: readonly string[];
  /**
   * The FINDING ids a valid waiver covers — distinct from `waiverIds`, and
   * recorded because the two were conflated once already: a `waiverIds.includes(findingId)`
   * test compares a waiver's identity against a finding's and is therefore
   * always false, which silently reported every warning as unwaived.
   */
  readonly waivedFindingIds: readonly string[];
  /** Warning findings with no covering waiver — the reason a `fail` is a fail. */
  readonly uncoveredWarnings: readonly TechnicalQaFinding[];
  readonly blockers: readonly TechnicalQaFinding[];
}

/**
 * The scope a waiver must match.
 *
 * `planHash`, NOT `renderId`. A waiver is written against a failing render and
 * applied by RE-rendering — which mints a new renderId, so scoping on the render
 * rejected every waiver that was actually used. The plan hash is stable across
 * re-renders of the same plan and changes the instant any editorial or encode
 * input changes, which is precisely the extent of what a human accepted.
 */
export interface WaiverScope {
  readonly jobId: string;
  readonly planHash: string;
}

export function computeGateStatus(
  findings: readonly TechnicalQaFinding[],
  waivers: readonly QaWaiver[],
  scope?: WaiverScope,
): GateResult {
  const byId = new Map(findings.map((f) => [f.findingId, f]));

  for (const waiver of waivers) {
    // Scoped to ONE PLAN. Without a scope the check is decorative — most warning
    // findings carry no time range, so ids like `true_peak:audio` are identical
    // across every render of every job. Scoped to the render instead, it would be
    // unusable, because applying a waiver means re-rendering.
    if (scope !== undefined && waiver.planHash.value !== scope.planHash) {
      throw new QaWaiverRejected(
        'WAIVER_OUT_OF_SCOPE',
        `Waiver ${waiver.waiverId} accepts plan ${waiver.planHash.value.slice(0, 12)}, but this report judges plan ${scope.planHash.slice(0, 12)}. ` +
          `The plan changed after the waiver was written, so the findings the human reviewed are not these findings.`,
        waiver.waiverId,
        waiver.findingIds,
      );
    }
    if (scope !== undefined && waiver.jobId !== scope.jobId) {
      throw new QaWaiverRejected(
        'WAIVER_OUT_OF_SCOPE',
        `Waiver ${waiver.waiverId} belongs to job ${waiver.jobId}, not ${scope.jobId}.`,
        waiver.waiverId,
        waiver.findingIds,
      );
    }
    for (const findingId of waiver.findingIds) {
      const target = byId.get(findingId);
      if (target === undefined) {
        throw new QaWaiverRejected(
          'WAIVER_NAMES_UNKNOWN_FINDING',
          `Waiver ${waiver.waiverId} names finding "${findingId}", which this QA report does not contain. ` +
            `Finding ids are derived from the check, the object, and the time range, so an unknown id means the render changed after the waiver was written — the waiver no longer describes anything a human reviewed.`,
          waiver.waiverId,
          [findingId],
        );
      }
      if (target.severity === 'blocker') {
        throw new QaWaiverRejected(
          'WAIVER_NAMES_BLOCKER',
          `Waiver ${waiver.waiverId} attempts to waive blocker "${findingId}" (${target.checkId}). ` +
            `Blockers are non-waivable (decisions.md D-35): source/timebase faults, corrupt or missing media, rights failures, missing required captions or disclosures, and invalid output cannot be accepted by anyone. ` +
            `The waiver is REJECTED rather than ignored, so nobody proceeds believing it was accepted.`,
          waiver.waiverId,
          [findingId],
        );
      }
      // A finding whose `waivable` flag disagrees with its own severity is
      // internally inconsistent; resolving it either way would be guessing which
      // half is right.
      if (!target.waivable) {
        throw new QaWaiverRejected(
          'FINDING_SELF_INCONSISTENT',
          `Finding "${findingId}" is severity "${target.severity}" but marked waivable: false. The report contradicts itself and is rejected rather than resolved in either direction.`,
          waiver.waiverId,
          [findingId],
        );
      }
    }
  }

  const covered = new Set(waivers.flatMap((w) => w.findingIds));
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const uncoveredWarnings = warnings.filter((f) => !covered.has(f.findingId));

  let gateStatus: QaGateStatus;
  if (blockers.length > 0 || uncoveredWarnings.length > 0) {
    gateStatus = 'fail';
  } else if (warnings.length > 0) {
    gateStatus = 'pass_with_waivers';
  } else {
    gateStatus = 'pass';
  }

  return {
    gateStatus,
    waiverIds: waivers.map((w) => w.waiverId),
    waivedFindingIds: [...covered],
    uncoveredWarnings,
    blockers,
  };
}

export interface AssembleReportInput {
  readonly jobId: string;
  readonly renderId: string;
  readonly renderManifestId: string;
  readonly tier: 'draft' | 'final';
  readonly ruleset: QaRuleset;
  readonly checksRun: readonly QaCheckRecord[];
  readonly findings: readonly TechnicalQaFinding[];
  readonly waivers: readonly QaWaiver[];
  /** The plan these findings were produced against — the waiver scope. */
  readonly planHash: { readonly algorithm: 'sha256'; readonly value: string };
  readonly qaReportId?: string;
  readonly createdAt?: string;
}

export function assembleTechnicalQaReport(input: AssembleReportInput): TechnicalQaReport {
  const gate = computeGateStatus(input.findings, input.waivers, {
    jobId: input.jobId,
    planHash: input.planHash.value,
  });
  const [firstCheck, ...restChecks] = input.checksRun;
  if (firstCheck === undefined) {
    throw new Error('A QA report must record at least one check; an empty ledger cannot distinguish "clean" from "never ran".');
  }
  return {
    qaReportId: input.qaReportId ?? ulid(),
    envelope: {
      schemaVersion: '1.0.0',
      createdAt: input.createdAt ?? new Date().toISOString(),
      createdBy: { kind: 'skill', skill: 'render', skillVersion: '1.0.0' },
    },
    jobId: input.jobId,
    renderId: input.renderId,
    renderManifestId: input.renderManifestId,
    tier: input.tier,
    rulesetVersion: input.ruleset.rulesetVersion,
    gateStatus: gate.gateStatus,
    checksRun: [firstCheck, ...restChecks],
    findings: [...input.findings],
    planHash: input.planHash,
    waiverIds: [...gate.waiverIds],
    waivedFindingIds: [...gate.waivedFindingIds],
  };
}

/**
 * The gate the runner consults before advancing a job.
 *
 * Fails closed on a missing or malformed report: `null` in means "no evidence",
 * and no evidence is never a pass. This is the function that makes "no render
 * reaches review without a QA report" (tech-spec §15 step 7) enforceable rather
 * than procedural.
 */
export function qaAllowsAdvance(report: TechnicalQaReport | null): { allowed: boolean; reason: string } {
  if (report === null) {
    return {
      allowed: false,
      reason: 'No technical QA report exists for this render. A render without a QA report never advances (tech-spec §15 step 7); absence of evidence is not a pass.',
    };
  }
  // Re-derived from `findings`, NOT read off `gateStatus`. A report is a file on
  // disk; trusting its own verdict would mean a hand-edited `"gateStatus":"pass"`
  // beside a blocker finding advanced the job. The stored status is a summary,
  // and the findings are the evidence — so the evidence decides.
  const blockers = report.findings.filter((f) => f.severity === 'blocker');
  if (blockers.length > 0) {
    return {
      allowed: false,
      reason: `QA found ${String(blockers.length)} non-waivable blocker(s): ${blockers.map((f) => f.checkId).join(', ')}. Blockers are non-waivable (D-35), and this is re-derived from the findings rather than read off the stored gateStatus.`,
    };
  }

  const waived = new Set(report.waivedFindingIds);
  const uncovered = report.findings.filter((f) => f.severity === 'warning' && !waived.has(f.findingId));
  if (uncovered.length > 0) {
    return {
      allowed: false,
      reason: `QA found ${String(uncovered.length)} unwaived warning(s): ${uncovered.map((f) => f.checkId).join(', ')}.`,
    };
  }

  if (report.gateStatus === 'fail') {
    return {
      allowed: false,
      reason:
        'The report records gateStatus "fail" but carries no blocker and no uncovered warning. The report contradicts itself and is refused rather than resolved in either direction.',
    };
  }

  return {
    allowed: true,
    reason:
      report.gateStatus === 'pass'
        ? 'QA passed with no findings above info.'
        : `QA passed with waivers (${String(report.waiverIds.length)} recorded).`,
  };
}
