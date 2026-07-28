/**
 * The deterministic editorial gate ORCHESTRATOR (Cutdown Phase 3, Task 7; D-35/D-37).
 *
 * `runDeterministicGates` runs every deterministic check in `editorial-checks.ts`
 * and returns a result with the deterministic findings partitioned into `blockers`
 * (non-waivable; any one fails the gate) and `advisories` (deterministic
 * observations that NEVER change gate status). It reads no model and calls nothing
 * that could — every blocking decision here is versioned, deterministic code.
 *
 * The LLM critic's advisories are NOT produced here. They are assembled onto the
 * final result by `assembleGateResult`, which takes them as input and — the D-37
 * invariant — cannot let one change `gateStatus`. Each advisory carries an explicit
 * `source` (`'deterministic'` | `'critic'`) so a caller can never reclassify a
 * critic finding as a deterministic blocker, or vice versa.
 */

import type { AssetBounds } from '@cutdown/contracts';
import type { PlatformCapability } from '@cutdown/editorial';
import type {
  PlatformEdlV1,
  MomentV1,
  JobBriefV1,
  StyleProfileV1,
  CreativeBriefV1,
} from '@cutdown/contracts/generated';

import {
  checkCapabilityAndRanges,
  checkDisclosures,
  checkProhibitedClaims,
  checkQuoteFidelity,
  checkRequiredEvidence,
  checkRights,
  type EditorialFinding,
} from './editorial-checks.js';

type PlatformEDL = PlatformEdlV1.PlatformEDL;
type Moment = MomentV1.Moment;
type JobBrief = JobBriefV1.JobBrief;
type StyleProfile = StyleProfileV1.StyleProfile;
type CreativeBrief = CreativeBriefV1.CreativeBrief;

export type GateStatus = 'pass' | 'fail';

/**
 * A finding from the LLM critic — advisory evidence ONLY (D-37). It is a distinct
 * type from `EditorialFinding` and always carries `source: 'critic'`, so it can
 * never be confused with, or promoted to, a deterministic blocker.
 */
export interface CriticFinding {
  source: 'critic';
  /** The lens the critic looked through (coherence, first_frame, redundancy, …). */
  lens: string;
  /** The critic's own severity label — informational; it NEVER affects gateStatus. */
  severity: string;
  note: string;
  /** Optional citation the critic offered (a clip id, a field). Free-form. */
  cite?: string;
}

/** Counters proving each deterministic check actually ran (not merely found nothing). */
export interface GateCheckedCounts {
  clips: number;
  quoteCaptions: number;
  viewerVisibleTextFields: number;
  proofRequirements: number;
  proofPoints: number;
  schemaBlocked: boolean;
}

export interface DeterministicGateResult {
  gateStatus: GateStatus;
  /** Non-waivable deterministic blockers. Any one makes gateStatus 'fail' (D-35). */
  blockers: EditorialFinding[];
  /** Deterministic advisories (e.g. unverified speaker). NEVER change gateStatus. */
  advisories: EditorialFinding[];
  checked: GateCheckedCounts;
}

export interface RunDeterministicGatesInput {
  /** Every Moment the EDL's clips reference (and any they depend on). */
  moments: readonly Moment[];
  jobBrief: JobBrief;
  styleProfile?: StyleProfile;
  /** Optional — enables the proofPoint→clip evidence cross-check (REQ-034). */
  creativeBrief?: CreativeBrief;
  capability: PlatformCapability;
  /** Asset id → preflighted bounds, for the single range validator. */
  boundsByAsset: ReadonlyMap<string, AssetBounds>;
  /** Moment id → owning asset id. Derived from `moments` when omitted. */
  momentAssetById?: ReadonlyMap<string, string>;
  /** Pipeline signal that media was materially altered (AI-media disclosure). */
  materialAlteration?: boolean;
  /** Recorded audio-rights evidence exists (admits a cleared/BYO audioMode). */
  audioRightsEvidencePresent?: boolean;
}

function indexMoments(moments: readonly Moment[]): {
  momentById: Map<string, Moment>;
  momentAssetById: Map<string, string>;
} {
  const momentById = new Map<string, Moment>();
  const momentAssetById = new Map<string, string>();
  for (const moment of moments) {
    momentById.set(moment.momentId, moment);
    momentAssetById.set(moment.momentId, moment.assetId);
  }
  return { momentById, momentAssetById };
}

/**
 * Run every deterministic editorial gate over a PlatformEDL. Pure, model-free,
 * fail-closed: a schema-invalid EDL, a missing bound, a missing Moment, or a
 * missing rights record all block rather than default to a pass.
 */
export function runDeterministicGates(
  edl: PlatformEDL,
  input: RunDeterministicGatesInput,
): DeterministicGateResult {
  const { momentById, momentAssetById: derivedAssets } = indexMoments(input.moments);
  const momentAssetById = input.momentAssetById ?? derivedAssets;

  const findings: EditorialFinding[] = [];

  // Capability + range/order/asset first: a schema-invalid EDL short-circuits the
  // content checks, which assume a well-formed shape. This fails closed.
  const capAndRange = checkCapabilityAndRanges(edl, input.capability, input.boundsByAsset, momentAssetById);
  findings.push(...capAndRange.findings);

  // A schema-invalid EDL has no trustworthy shape to count or check: fail closed
  // with only the schema blocks, and never dereference its (possibly absent) fields.
  if (capAndRange.schemaBlocked) {
    return {
      gateStatus: 'fail',
      blockers: findings.filter((f) => f.severity === 'block'),
      advisories: findings.filter((f) => f.severity === 'advisory'),
      checked: { clips: 0, quoteCaptions: 0, viewerVisibleTextFields: 0, proofRequirements: 0, proofPoints: 0, schemaBlocked: true },
    };
  }

  const quoteCaptions = edl.clips.filter((c) => c.caption.kind === 'quote').length;
  const viewerVisibleTextFields =
    edl.clips.filter((c) => c.caption.kind === 'text' || c.caption.kind === 'quote').length +
    1 + // metadata.title
    (edl.metadata.description !== null ? 1 : 0);

  {
    findings.push(...checkQuoteFidelity(edl, momentById));
    findings.push(...checkProhibitedClaims(edl, input.jobBrief, input.styleProfile));
    findings.push(...checkRequiredEvidence(edl, input.jobBrief, momentById, input.creativeBrief));
    const rightsOpts =
      input.audioRightsEvidencePresent !== undefined
        ? { audioRightsEvidencePresent: input.audioRightsEvidencePresent }
        : {};
    findings.push(...checkRights(edl, momentById, rightsOpts));
    const disclosureOpts =
      input.materialAlteration !== undefined ? { materialAlteration: input.materialAlteration } : {};
    findings.push(...checkDisclosures(edl, disclosureOpts));
  }

  const blockers = findings.filter((f) => f.severity === 'block');
  const advisories = findings.filter((f) => f.severity === 'advisory');

  return {
    gateStatus: blockers.length === 0 ? 'pass' : 'fail',
    blockers,
    advisories,
    checked: {
      clips: edl.clips.length,
      quoteCaptions,
      viewerVisibleTextFields,
      proofRequirements: (input.jobBrief.proofRequirements ?? []).length,
      proofPoints: input.creativeBrief?.proofPoints.length ?? 0,
      schemaBlocked: capAndRange.schemaBlocked,
    },
  };
}

/** The full editorial gate result: deterministic verdict + all advisories, clearly separated. */
export interface EditorialGateResult {
  /** Comes ONLY from the deterministic blockers. A critic finding can never change it (D-37). */
  gateStatus: GateStatus;
  /** Deterministic, non-waivable blockers. */
  blockers: EditorialFinding[];
  /** Every advisory, tagged by source. NONE of these affect gateStatus. */
  advisories: Array<EditorialFinding | CriticFinding>;
  checked: GateCheckedCounts;
}

/**
 * Merge the deterministic gate result with the LLM critic's advisories into one
 * structure whose `gateStatus` STILL comes only from the deterministic blockers.
 *
 * This is the single seam where the two result sets meet, and it is deliberately
 * incapable of promoting a critic finding to a blocker: `criticAdvisories` land in
 * `advisories`, never in `blockers`, and `gateStatus` is copied straight from the
 * deterministic result (D-37).
 */
export function assembleGateResult(args: {
  deterministic: DeterministicGateResult;
  criticAdvisories: readonly CriticFinding[];
}): EditorialGateResult {
  const { deterministic, criticAdvisories } = args;
  return {
    gateStatus: deterministic.gateStatus,
    blockers: deterministic.blockers,
    advisories: [...deterministic.advisories, ...criticAdvisories],
    checked: deterministic.checked,
  };
}
