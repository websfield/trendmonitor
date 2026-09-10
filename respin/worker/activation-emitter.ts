// Phase 10a plan C5 / R-121: the daily aggregate activation emitter.
//
// Consumes `deriveActivationCohorts` — the ONE activation authority in
// `@respin/db` — and forwards each MATURED cohort to the external sink as
// counts only: cohort date, metric version, numerator, denominator,
// exclusions. Nothing else leaves the database. A cohort whose denominator is
// below the small-cell floor is SUPPRESSED externally and counted here as
// such, never treated as zero; a cohort past its aggregate's own retention
// is withheld (survivorship bias) and counted as such too.
//
// Idempotent by construction: the event id is a function of the cohort and
// its counts, so a daily re-run of the same matured cohort is a duplicate
// the sink discards, and a cohort whose counts changed (a late deletion's
// retained contribution) is a new fact.
import {
  ACTIVATION_SMALL_CELL_DENOMINATOR,
  MonthlyEventBudget,
  POSTHOG_MONTHLY_EVENT_BUDGET,
  deriveActivationCohorts,
  parsePosthogSink,
  posthogActivationCapture,
  sendOutbound,
  type ActivationCohort,
  type ActivationExclusions,
  type DbLike,
  type PosthogSink,
} from "@respin/db";

export type ActivationEmitSummary = Readonly<{
  /** Cohorts whose 24-hour window has fully matured as of this run. */
  matured: number;
  emitted: number;
  /** Denominator below the floor: shown internally, never sent (R-121). */
  suppressedSmallCell: number;
  /** Older than the aggregate's own retention: withheld, never sent. */
  withheldExpired: number;
  /** The sink is not configured, or the monthly budget is spent. */
  notSent: number;
  failed: number;
}>;

export type ActivationEmitterPorts = Readonly<{
  /** The ONE activation seam, as a port: production binds `deriveActivationCohorts`; a test hands rows. */
  cohorts: (now: Date) => Promise<readonly ActivationCohort[]>;
  sink: PosthogSink | null;
  budget: MonthlyEventBudget;
  fetchImpl: typeof fetch;
}>;

export async function emitMaturedActivationCohorts(ports: ActivationEmitterPorts, now: Date): Promise<ActivationEmitSummary> {
  // `matured` is the ONE authority (`deriveActivationCohorts`), shared with
  // the internal page; this emitter no longer computes its own copy.
  const cohorts = (await ports.cohorts(now)).filter((c) => c.matured);
  let emitted = 0;
  let suppressedSmallCell = 0;
  let withheldExpired = 0;
  let notSent = 0;
  let failed = 0;
  for (const cohort of cohorts) {
    if (cohort.aggregateExpired) { withheldExpired += 1; continue; }
    if (cohort.smallCell || cohort.signups < ACTIVATION_SMALL_CELL_DENOMINATOR) { suppressedSmallCell += 1; continue; }
    if (ports.sink === null || !ports.budget.admit(now)) { notSent += 1; continue; }
    const outcome = await sendOutbound(ports.fetchImpl, posthogActivationCapture(ports.sink, {
      cohortDate: cohort.cohortDate,
      metricVersion: cohort.metricVersion,
      signups: cohort.signups,
      activated: cohort.activated,
      excluded: cohort.excluded,
    }, now));
    if (outcome === "sent") emitted += 1;
    else failed += 1;
  }
  return { matured: cohorts.length, emitted, suppressedSmallCell, withheldExpired, notSent, failed };
}

/** The production ports: sink and budget from the environment, once per process. */
export function activationEmitterPorts(
  db: DbLike,
  exclusions: ActivationExclusions,
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch = fetch,
): ActivationEmitterPorts {
  return {
    cohorts: (now) => deriveActivationCohorts(db, exclusions, now),
    sink: parsePosthogSink(env),
    budget: new MonthlyEventBudget(POSTHOG_MONTHLY_EVENT_BUDGET),
    fetchImpl,
  };
}
