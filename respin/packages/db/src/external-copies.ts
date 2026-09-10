import { RETENTION_CLOCKS } from "./retention-clocks";

// Plan C4's external-copy registry — the copies of a subject's data that live
// OUTSIDE this database, and therefore outside what an erasure can reach.
//
// WHY THIS EXISTS. `RETAINED_COPY` on /settings/account presented a CLOSED list
// of what survives erasure and named exactly one external holder (Stripe). By
// naming one and only one, it implied provider erasure everywhere else — the
// single thing C4 says public copy must never do. Absent from that list were
// the LLM processor holding brain and script text, the mail provider holding
// the recipient address of every verification and recovery mail, and — the one
// that changes the promise most — encrypted database backups, which is the
// entire reason C4's deadline is day 28 rather than day 7.
//
// A LIST, not a producer (CLAUDE.md Respin rule 7). Nothing derives this by
// scanning for outbound HTTP calls: adding a processor is an edit here, and
// `tests/account-copy.test.ts` asserts the page names every entry, so a new
// processor cannot be added without the public copy changing in the same
// change.
export type ExternalCopyClass =
  /** The subject can delete it themselves; we cannot. */
  | "user_controlled"
  /** The holder stores no subject content, only metadata we cannot erase. */
  | "content_incapable"
  /** The holder retains it under its own legal or contractual clock. */
  | "legal_retention"
  /** Our own infrastructure, erased on a stated clock rather than on request. */
  | "operator_clock";

export type ExternalCopy = Readonly<{
  /** How the page refers to it. Must appear verbatim in `RETAINED_COPY`. */
  holder: string;
  copyClass: ExternalCopyClass;
  /** What of the subject's data it holds. Content-free description. */
  holds: string;
  /**
   * The longest a copy can outlive the erasure, in days, or null when the
   * holder's clock is its own and we do not control or observe it.
   */
  maxDaysAfterErasure: number | null;
}>;

/**
 * Days a database backup taken the instant before erasure can still exist.
 * Mirrors `BACKUP_MAX_RETENTION_DAYS=21` in `scripts/backup.sh`; the drill's
 * prune enforces it. Stated here so the page can quote it.
 */
export const BACKUP_MAX_RETENTION_DAYS = 21;

export const EXTERNAL_COPIES: readonly ExternalCopy[] = [
  {
    holder: "Stripe",
    copyClass: "legal_retention",
    holds: "billing contact details and payment records",
    maxDaysAfterErasure: null,
  },
  {
    holder: "the model provider",
    copyClass: "legal_retention",
    holds: "prompts and generated text sent for a generation",
    maxDaysAfterErasure: null,
  },
  {
    holder: "the mail provider",
    copyClass: "legal_retention",
    holds: "the recipient address and delivery logs of account emails",
    maxDaysAfterErasure: null,
  },
  {
    holder: "encrypted database backups",
    copyClass: "operator_clock",
    holds: "everything the database held when the backup was taken",
    maxDaysAfterErasure: BACKUP_MAX_RETENTION_DAYS,
  },
  {
    holder: "copies you downloaded",
    copyClass: "user_controlled",
    holds: "whatever you exported",
    maxDaysAfterErasure: null,
  },
] as const;

/**
 * The last day on which ANY capable copy of an erased subject can still exist:
 * the grace period plus the longest operator-clock retention. REQ-A04 allows
 * 30; this is the number the page must quote rather than implying day 7.
 */
export function lastCapableCopyDay(graceDays: number): number {
  const operatorClocks = EXTERNAL_COPIES.map((copy) => copy.maxDaysAfterErasure).filter(
    (days): days is number => days !== null
  );
  // Non-vacuity: an empty list here would silently return the grace day and
  // make the page understate the window, which is the failure this closes.
  if (operatorClocks.length === 0) {
    throw new Error("EXTERNAL_COPIES names no operator-clock copy; lastCapableCopyDay would understate the window");
  }
  return graceDays + Math.max(...operatorClocks);
}

/**
 * Years the anonymous signup-day cohort counts are retained, read from the
 * registry clock rather than typed into a sentence. The account page named this
 * class with no period at all, so it could be re-clocked without the page
 * noticing. Derived HERE rather than in `app/` so the page never has to import
 * `RETENTION_CLOCKS`, which is not on the sanctioned app-facing surface.
 */
export const COHORT_RETENTION_YEARS = Math.round(
  RETENTION_CLOCKS.cohort_two_years.durationMs / (365 * 24 * 60 * 60 * 1000)
);
