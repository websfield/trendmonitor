// The single, direct read of breaker state that governs every number a breaker owns.
// This is Rule 4 (fail closed) and Contract C's "REQ-038 client behaviour is a
// direct read of this state, not a second decision".
//
// `undefined` models "breaker state unknown" (C3 down / stale cache). Unknown is
// treated as NOT ARMED — fail closed. There is no third option and no override.
import type { BreakerState } from '../types/generated/events';

export type MaybeBreakerState = BreakerState | 'unknown';

/**
 * The ONLY predicate any component may consult before rendering a VPS/AWS number.
 * Returns true iff the breaker is explicitly `armed`. Everything else — tripped,
 * cold, shadow, unknown — is false. There is no path that returns true otherwise.
 */
export function mayRenderGovernedNumber(state: MaybeBreakerState): boolean {
  return state === 'armed';
}

/** Human-facing reason a number is withheld. Never returns empty for a non-armed state. */
export function breakerReason(state: MaybeBreakerState, detail?: string): string {
  switch (state) {
    case 'armed':
      return detail ?? 'Calibration armed for this cohort.';
    case 'tripped':
      return (
        detail ??
        'Calibration breaker is TRIPPED for this cohort: the rolling rank correlation fell below the arming threshold. The score is stored but not shown.'
      );
    case 'cold':
      return (
        detail ??
        'Calibration breaker is COLD for this cohort: not enough held-out evidence (n < 60), no library, or a version-triple mismatch. No score is shown.'
      );
    case 'shadow':
      return detail ?? 'A champion/challenger evaluation is in progress; the challenger score is stored, never surfaced.';
    case 'unknown':
      return (
        detail ??
        'Calibration state is UNKNOWN (the monitor is unreachable). Treated as not armed — no score is shown.'
      );
  }
}

/** A short, non-colour token for the breaker state (colour is never the sole signal). */
export function breakerBadge(state: MaybeBreakerState): { label: string; symbol: string } {
  switch (state) {
    case 'armed':
      return { label: 'Armed', symbol: '✓' }; // check
    case 'tripped':
      return { label: 'Tripped', symbol: '⚠' }; // warning
    case 'cold':
      return { label: 'Cold', symbol: '✗' }; // cross
    case 'shadow':
      return { label: 'Shadow', symbol: '◐' }; // half circle
    case 'unknown':
      return { label: 'Unknown', symbol: '?' };
  }
}
