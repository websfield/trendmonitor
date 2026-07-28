/**
 * Platform adaptation core — turns a MasterStoryPlan into the platform directives
 * a PlatformEDL must satisfy, and checks a proposed EDL against the platform's
 * capability fixture (Cutdown Phase 3, PRD REQ-050/052, decisions.md D-3).
 *
 * At Phase 0 only TikTok resolves to a capability fixture (D-3): TikTok organic
 * 9:16 AU, with the offline duration pin 5–180 s standing in for the connector-
 * backed lookup that does not exist yet. `plan` must fail explicitly on any other
 * platform rather than fall back to a generic profile — `assertPhase0Platform`
 * and `checkCapability` are how that failure is made deterministic.
 *
 * The capability fixture (YAML on disk) is loaded by the `plan` skill; here it is
 * accepted as a typed argument so this module never reads a file.
 */

import type { PlatformEdlV1 } from '@cutdown/contracts/generated';

type AspectTreatment = PlatformEdlV1.AspectTreatment;

/** The platform capability fixture (the hard half the resolver checks against). */
export interface PlatformCapability {
  /** Platform key, e.g. `tiktok`. */
  platform: string;
  /** Allowed output-duration window in seconds (D-3 pin: 5–180 for TikTok organic AU). */
  duration: { minSeconds: number; maxSeconds: number };
  /** The output canvas (9:16 720x1280 for TikTok organic AU). */
  canvas: { width: number; height: number; aspectRatio: string };
  /** Aspect ratios the platform prefers; the EDL's canvas ratio must be one of these. */
  preferredAspectRatios: string[];
  /** Aspect treatments permitted on this platform (REQ-052; never includes centre_crop). */
  aspectTreatmentOptions: AspectTreatment[];
}

/** The directives a PlatformEDL for this platform must respect, derived from the capability. */
export interface PlatformDirectives {
  platform: string;
  durationBounds: { minSeconds: number; maxSeconds: number };
  canvas: { width: number; height: number; aspectRatio: string };
  preferredAspectRatios: string[];
  aspectTreatmentOptions: AspectTreatment[];
}

export const PHASE_0_PLATFORM = 'tiktok';

/**
 * Refuse any platform without a Phase 0 capability fixture (D-3). Throws rather
 * than warns: `plan` producing an EDL for an unsupported platform would be a cut
 * against capabilities nobody has verified.
 */
export function assertPhase0Platform(platform: string): void {
  if (platform !== PHASE_0_PLATFORM) {
    throw new Error(
      `Platform ${JSON.stringify(platform)} has no Phase 0 capability fixture — only ${PHASE_0_PLATFORM} does (decisions.md D-3). ` +
        'plan fails explicitly rather than falling back to a generic profile.',
    );
  }
}

/**
 * Derive the platform directives from a capability fixture. The MasterStoryPlan
 * is accepted for symmetry and future narrowing (e.g. a plan whose beats cannot
 * fit the minimum duration), but the Phase 0 directives come straight from the
 * capability — the single source of the platform's hard bounds.
 */
export function buildPlatformDirectives(capability: PlatformCapability): PlatformDirectives {
  return {
    platform: capability.platform,
    durationBounds: { ...capability.duration },
    canvas: { ...capability.canvas },
    preferredAspectRatios: [...capability.preferredAspectRatios],
    aspectTreatmentOptions: [...capability.aspectTreatmentOptions],
  };
}

/** The subset of a PlatformEDL the capability check reads. */
export interface CapabilityCheckInput {
  platform: string;
  targetDurationRange: { minSeconds: number; maxSeconds: number };
  canvas: { aspectRatio: string };
  aspectTreatment: { mode: AspectTreatment };
}

export interface CapabilityViolation {
  code:
    | 'PLATFORM_MISMATCH'
    | 'DURATION_BELOW_MIN'
    | 'DURATION_ABOVE_MAX'
    | 'DURATION_RANGE_INVERTED'
    | 'ASPECT_RATIO_UNSUPPORTED'
    | 'ASPECT_TREATMENT_UNSUPPORTED';
  message: string;
}

/**
 * Deterministic capability checks for a proposed EDL against a platform fixture
 * (REQ-050/052). Target duration must sit within the fixture's pinned window
 * (D-3 5–180 s for TikTok), the canvas aspect ratio must be a preferred ratio,
 * and the aspect treatment must be a permitted option — blind centre-cropping is
 * already unrepresentable in the enum, so a bad treatment here is a different
 * mistake. Every violation is collected.
 */
export function checkCapability(edl: CapabilityCheckInput, capability: PlatformCapability): CapabilityViolation[] {
  const violations: CapabilityViolation[] = [];

  if (edl.platform !== capability.platform) {
    violations.push({
      code: 'PLATFORM_MISMATCH',
      message: `EDL platform ${JSON.stringify(edl.platform)} does not match the capability fixture for ${JSON.stringify(capability.platform)}.`,
    });
  }

  const { minSeconds, maxSeconds } = edl.targetDurationRange;
  if (maxSeconds < minSeconds) {
    violations.push({ code: 'DURATION_RANGE_INVERTED', message: `targetDurationRange.maxSeconds (${maxSeconds}) is less than minSeconds (${minSeconds}).` });
  }
  if (minSeconds < capability.duration.minSeconds) {
    violations.push({
      code: 'DURATION_BELOW_MIN',
      message: `targetDurationRange.minSeconds (${minSeconds}) is below the platform minimum of ${capability.duration.minSeconds}s (D-3).`,
    });
  }
  if (maxSeconds > capability.duration.maxSeconds) {
    violations.push({
      code: 'DURATION_ABOVE_MAX',
      message: `targetDurationRange.maxSeconds (${maxSeconds}) exceeds the platform maximum of ${capability.duration.maxSeconds}s (D-3).`,
    });
  }

  if (!capability.preferredAspectRatios.includes(edl.canvas.aspectRatio)) {
    violations.push({
      code: 'ASPECT_RATIO_UNSUPPORTED',
      message: `Canvas aspect ratio ${JSON.stringify(edl.canvas.aspectRatio)} is not among the platform's preferred ratios [${capability.preferredAspectRatios.join(', ')}] (REQ-052).`,
    });
  }

  if (!capability.aspectTreatmentOptions.includes(edl.aspectTreatment.mode)) {
    violations.push({
      code: 'ASPECT_TREATMENT_UNSUPPORTED',
      message: `Aspect treatment ${JSON.stringify(edl.aspectTreatment.mode)} is not a permitted option for ${capability.platform} [${capability.aspectTreatmentOptions.join(', ')}].`,
    });
  }

  return violations;
}
