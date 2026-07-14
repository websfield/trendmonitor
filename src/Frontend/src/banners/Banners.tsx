// P9-T4 — degraded, advisory, and stale-data banners.
// All are announced to assistive tech. Colour is never the sole signal: each
// carries a text label and an icon glyph.
import { breakerBadge, breakerReason, mayRenderGovernedNumber } from '../lib/breaker';
import type { MaybeBreakerState } from '../lib/breaker';

// REQ-018 — degraded scoring. Names WHICH criteria were scored without audio.
export function DegradedBanner({
  audioPresent,
  degradedCriteria,
}: {
  audioPresent: boolean;
  degradedCriteria: string[];
}): JSX.Element | null {
  if (audioPresent || degradedCriteria.length === 0) return null;
  return (
    <div className="banner banner--degraded" role="status" aria-live="polite" data-testid="degraded-banner">
      <p>
        <span aria-hidden="true">⚠ </span>
        <strong>Degraded scoring: audio was absent.</strong> These audio-dependent criteria were scored from
        frames alone and their scores are less certain:{' '}
        <span data-testid="degraded-criteria">{degradedCriteria.join(', ')}</span>. The hook-strength hard gate
        still applies.
      </p>
    </div>
  );
}

// REQ-038 / REQ-052 — advisory banner. Shown whenever the breaker is NOT armed.
// It NEVER shows a VPS number; it shows the state and the reason.
export function AdvisoryBanner({
  state,
  reasonDetail,
}: {
  state: MaybeBreakerState;
  reasonDetail?: string;
}): JSX.Element | null {
  if (mayRenderGovernedNumber(state)) return null; // armed → no advisory needed
  const badge = breakerBadge(state);
  return (
    <div
      className={`banner banner--advisory banner--breaker-${state}`}
      role="status"
      aria-live="polite"
      data-testid="advisory-banner"
      data-breaker-state={state}
    >
      <p>
        <span aria-hidden="true">{badge.symbol} </span>
        <strong>Calibration {badge.label}.</strong> No score is shown for this cohort.{' '}
        <span data-testid="advisory-reason">{breakerReason(state, reasonDetail)}</span>
      </p>
    </div>
  );
}

// C2 API down — a stale-data banner with as_of. No verdict may be submitted while shown.
export function StaleDataBanner({
  asOf,
  message,
}: {
  asOf: string | null;
  message: string;
}): JSX.Element {
  return (
    <div className="banner banner--stale" role="alert" aria-live="assertive" data-testid="stale-banner">
      <p>
        <span aria-hidden="true">⚠ </span>
        <strong>Live data unavailable.</strong> {message}{' '}
        {asOf ? (
          <>
            Showing last-known data as of <time dateTime={asOf}>{asOf.slice(0, 10)}</time>.
          </>
        ) : (
          <>No cached data is available.</>
        )}{' '}
        Actions that submit a verdict are disabled until the connection is restored.
      </p>
    </div>
  );
}
