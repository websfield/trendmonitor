/**
 * EDL range resolution — the deterministic bounds/order/asset gate over a
 * proposed PlatformEDL (Cutdown Phase 3, PRD REQ-019, decisions.md D-35/D-37).
 *
 * This module owns ONLY: schema validity, source-range/timebase validity, clip
 * `order` contiguity, and asset-id consistency (clip.assetId === sourceRange
 * .assetId === Moment.assetId). Range validation reuses `checkSourceRange` from
 * `@cutdown/contracts` — the SINGLE bounds validator, the same code `cutdown
 * index` runs over Moments — so the "zero invalid source ranges" exit criterion
 * measures one implementation, not two. An out-of-bounds range is a NON-WAIVABLE
 * block, never clamped.
 *
 * The quote-fidelity, prohibited-claim, disclosure, and rights BLOCKING gates
 * live in `packages/qa` (built later) — they are deliberately NOT here.
 */

import { checkSourceRange } from '@cutdown/contracts';
import type { AssetBounds } from '@cutdown/contracts';
import type { PlatformEdlV1 } from '@cutdown/contracts/generated';

import { PLATFORM_EDL_ID, validateAgainstSchema } from './schema.js';
import { contiguousPermutation } from './util.js';

type PlatformEDL = PlatformEdlV1.PlatformEDL;

export interface EdlViolation {
  /** Timeline-local clip id when the violation is clip-scoped; absent for whole-EDL faults. */
  clipId?: string;
  code:
    | 'RANGE_INVALID'
    | 'ORDER_NOT_CONTIGUOUS'
    | 'CLIP_ASSET_MISMATCH'
    | 'MOMENT_ASSET_MISMATCH'
    | 'BOUNDS_MISSING'
    | 'MOMENT_UNKNOWN';
  message: string;
}

export interface EdlRangeResult {
  ok: boolean;
  /** How many clips were examined — evidence the check ran, not just that it found nothing. */
  checked: number;
  violations: EdlViolation[];
}

export interface ResolveEdlRangesOptions {
  /**
   * Moment id -> the asset that Moment belongs to. When provided, the three-way
   * asset-consistency check runs (clip.assetId === sourceRange.assetId ===
   * Moment.assetId). Without it, only the clip/sourceRange agreement is checked
   * and a MOMENT_UNKNOWN is raised so the gap is never silent.
   */
  momentAssetById?: ReadonlyMap<string, string>;
}

/**
 * Deterministic range/order/asset validation over every clip of a PlatformEDL.
 *
 * `boundsByAsset` maps each asset id to its preflighted bounds. A clip whose
 * asset is absent from the map yields BOUNDS_MISSING and fails closed — an
 * in-bounds range cannot be proven against a duration we do not have. Every clip
 * is checked (no short-circuit) so one pass names every bad clip.
 */
export function resolveEdlRanges(
  edl: PlatformEDL,
  boundsByAsset: ReadonlyMap<string, AssetBounds>,
  opts: ResolveEdlRangesOptions = {},
): EdlRangeResult {
  const violations: EdlViolation[] = [];

  for (const clip of edl.clips) {
    // Asset-id consistency: clip.assetId === sourceRange.assetId (always), and
    // === Moment.assetId when the Moment lookup is provided.
    if (clip.assetId !== clip.sourceRange.assetId) {
      violations.push({
        clipId: clip.clipId,
        code: 'CLIP_ASSET_MISMATCH',
        message: `Clip ${clip.clipId} names asset ${clip.assetId} but its sourceRange indexes ${clip.sourceRange.assetId}; a range is only meaningful against its own asset.`,
      });
    }
    if (opts.momentAssetById) {
      const momentAsset = opts.momentAssetById.get(clip.momentId);
      if (momentAsset === undefined) {
        violations.push({ clipId: clip.clipId, code: 'MOMENT_UNKNOWN', message: `Clip ${clip.clipId} references Moment ${clip.momentId}, which is not in the provided Moment set.` });
      } else if (momentAsset !== clip.assetId) {
        violations.push({
          clipId: clip.clipId,
          code: 'MOMENT_ASSET_MISMATCH',
          message: `Clip ${clip.clipId} names asset ${clip.assetId} but its Moment ${clip.momentId} belongs to asset ${momentAsset}.`,
        });
      }
    }

    // Range validity against the asset's preflighted bounds — the single validator.
    const bounds = boundsByAsset.get(clip.sourceRange.assetId);
    if (bounds === undefined) {
      violations.push({
        clipId: clip.clipId,
        code: 'BOUNDS_MISSING',
        message: `No preflighted bounds provided for asset ${clip.sourceRange.assetId}; the range cannot be proven in bounds. Failing closed (D-37).`,
      });
    } else {
      const result = checkSourceRange(clip.sourceRange, bounds);
      for (const v of result.violations) {
        violations.push({ clipId: clip.clipId, code: 'RANGE_INVALID', message: `[${v.code}] ${v.message}` });
      }
    }
  }

  // Clip play order must be a contiguous permutation.
  const orderCheck = contiguousPermutation(edl.clips.map((c) => c.order));
  if (!orderCheck.ok) {
    violations.push({ code: 'ORDER_NOT_CONTIGUOUS', message: `Clip ${orderCheck.message}` });
  }

  return { ok: violations.length === 0, checked: edl.clips.length, violations };
}

/** Validate a proposed PlatformEDL against `platform-edl-v1`. */
export function validateEdlSchema(edl: unknown): string[] {
  return validateAgainstSchema(PLATFORM_EDL_ID, edl);
}

export interface ResolveEdlResult {
  ok: boolean;
  /** Schema violations (one readable line each). */
  schemaErrors: string[];
  /** Structural range/order/asset violations. */
  violations: EdlViolation[];
  checked: number;
}

/**
 * Full deterministic resolution: schema validity first, then the structural
 * range/order/asset checks. Schema-invalid input skips the structural pass —
 * running range checks over a malformed EDL would bury the real cause.
 */
export function resolveEdl(
  edl: unknown,
  boundsByAsset: ReadonlyMap<string, AssetBounds>,
  opts: ResolveEdlRangesOptions = {},
): ResolveEdlResult {
  const schemaErrors = validateEdlSchema(edl);
  if (schemaErrors.length > 0) {
    return { ok: false, schemaErrors, violations: [], checked: 0 };
  }
  const ranges = resolveEdlRanges(edl as PlatformEDL, boundsByAsset, opts);
  return { ok: ranges.ok, schemaErrors: [], violations: ranges.violations, checked: ranges.checked };
}
