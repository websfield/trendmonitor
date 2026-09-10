// The grace period the copy quotes, taken from the package rather than typed
// into a sentence, so the number on the page is the number the executor uses.
import { COHORT_RETENTION_YEARS, DELETION_GRACE_MS, lastCapableCopyDay } from "@respin/db";

export const DELETION_GRACE_DAYS = Math.round(DELETION_GRACE_MS / (24 * 60 * 60 * 1000));

/**
 * The last day a capable copy of erased data can still exist — grace plus the
 * longest backup retention. The page quoted only the grace period, so a creator
 * reading it inferred day 7 while an encrypted backup could hold their data for
 * 21 more days. That window is the whole reason C4's deadline is day 28.
 */
export const LAST_CAPABLE_COPY_DAY = lastCapableCopyDay(DELETION_GRACE_DAYS);

/**
 * Re-exported so the page and its test read the same constant. The period is
 * derived from the registry clock inside `@respin/db`.
 */
export { COHORT_RETENTION_YEARS };
