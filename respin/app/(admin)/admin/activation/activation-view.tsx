// /admin/activation's presentation (Phase 10a plan C5, R-121). Exact daily
// counts for an authorised operator: numerator, denominator, exclusions and
// the metric-code version per cohort — and, on every row, what the number
// cannot say. A small cell is SHOWN here with the label the external sink
// substitutes for it (`externally_suppressed_small_cell`), never as a zero;
// an expired aggregate is withheld with its reason. The day-90 target is
// printed as a target, never as something achieved.
import type { ActivationCohort } from "@respin/db";

export const ACTIVATION_TARGET_SENTENCE =
  "Target, not evidence: the product target is 40% of a signup-day cohort activated by day 90 of launch. This page reports what the database recorded; it does not say the target was met.";

export const ACTIVATION_DEFINITION =
  "A signup is activated when, within 24 hours of the account's creation, the email is verified, one complete brain is activated and one usable full-script generation settles in any workspace the person can reach. Hooks, captions, ideation, the public Sample Spin, refused and recovery-required attempts and test-only rows never qualify.";

export const SMALL_CELL_LABEL = "externally_suppressed_small_cell";
export const EXPIRED_LABEL = "withheld_aggregate_expired";
/** The cohort's window has not closed: the counts are partial and no rate is a fact yet (R-121). */
export const WINDOW_OPEN_LABEL = "window_open";

export type ActivationViewProps =
  | { ok: true; cohorts: readonly ActivationCohort[]; asOf: string }
  | { ok: false };

function rate(cohort: ActivationCohort): string {
  if (cohort.signups === 0) return "no signups";
  return `${((cohort.activated / cohort.signups) * 100).toFixed(1)}%`;
}

export function AdminActivationView(props: ActivationViewProps) {
  if (!props.ok) {
    return (
      <section>
        <h1>Activation</h1>
        <p role="alert">The activation report could not be loaded. Nothing here is a number.</p>
      </section>
    );
  }
  const limitation = props.cohorts[0]?.limitation ?? null;
  return (
    <section>
      <h1>Activation</h1>
      <p>{ACTIVATION_DEFINITION}</p>
      <p>{ACTIVATION_TARGET_SENTENCE}</p>
      {limitation ? <p data-testid="activation-limitation">Known limitation on every row: {limitation}.</p> : null}
      <p>
        As of {props.asOf}. External analytics receives only cohorts with a denominator of ten or more, as aggregate counts under a system identity; a smaller cohort is reported there as <code>{SMALL_CELL_LABEL}</code> and shown here in full. A cohort whose last signup&rsquo;s twenty-four-hour window has not closed is <code>{WINDOW_OPEN_LABEL}</code>: its counts are partial, it has no rate yet, and nothing external receives it.
      </p>
      {props.cohorts.length === 0 ? (
        <p data-testid="activation-empty">No signup cohorts are recorded yet. That is an absence, not a zero rate.</p>
      ) : (
        <table data-testid="activation-table">
          <thead>
            <tr>
              <th>Cohort (UTC signup day)</th>
              <th>Metric version</th>
              <th>Activated (numerator)</th>
              <th>Signups (denominator)</th>
              <th>Excluded</th>
              <th>Rate</th>
              <th>External sink</th>
            </tr>
          </thead>
          <tbody>
            {props.cohorts.map((cohort) => (
              <tr key={`${cohort.cohortDate}:${cohort.metricVersion}`} data-testid="activation-row">
                <td>{cohort.cohortDate}</td>
                <td>{cohort.metricVersion}</td>
                <td>{cohort.matured ? cohort.activated : `${cohort.activated} (partial)`}</td>
                <td>{cohort.matured ? cohort.signups : `${cohort.signups} (partial)`}</td>
                <td>{cohort.excluded}</td>
                <td>{cohort.aggregateExpired ? EXPIRED_LABEL : !cohort.matured ? WINDOW_OPEN_LABEL : rate(cohort)}</td>
                <td>
                  {cohort.aggregateExpired ? EXPIRED_LABEL : !cohort.matured ? WINDOW_OPEN_LABEL : cohort.smallCell ? SMALL_CELL_LABEL : "aggregate counts only"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
