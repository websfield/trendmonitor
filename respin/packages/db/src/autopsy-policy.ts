/**
 * Retry/lease authority for the sessionless autopsy worker. Config may tighten
 * the attempt count; no caller may raise it above this release ceiling (R-93).
 */
export const AUTOPSY_ATTEMPT_CODE_CEILING = 5;
/** Fixed R8 pipeline: hook mechanic, beats, ending, follow trigger. */
export const AUTOPSY_VENDOR_CALLS_PER_ATTEMPT = 4;

/**
 * THE ONE WALL-CLOCK BOUND ON AN ATTEMPT. Three bounds share this family and
 * must agree or a HEALTHY attempt is treated as dead: the cache-claim lease
 * (`system-spend.ts`, `leaseExpiresAt`), the per-stage vendor deadline
 * (config `llm.overallDeadlineMs`, which an attempt spends up to
 * `AUTOPSY_VENDOR_CALLS_PER_ATTEMPT` times in sequence), and the pg-boss job
 * expiry on the autopsy queue. A lease shorter than four deadlines lets
 * `recoverStaleSystemAutopsyAttempts` finalize an in-flight attempt as four
 * unknown calls while it is still calling the vendor, and the next tick then
 * pays a second time — the case R-93 rules out. Everything in the family is
 * derived from this constant; nothing else in the family is a literal.
 *
 * UNMEASURED LAUNCH BOUND, AND ITS ORIGINAL DERIVATION NO LONGER HOLDS
 * (billing and code review, 2026-09-04). It read "ten minutes is four
 * seed-default 40 s deadlines (160 s) with generous room for claim, parse and
 * finalize" — true when the seed deadline was 40 s. R-100 raised it to 120 s
 * from a real measurement, so four sequential stages is now 480 s inside a
 * 600 s lease, leaving **120 s** for claim, parse and finalize — down from
 * 440 s at the old 40 s deadline. (The 60 s
 * `AUTOPSY_LEASE_NON_VENDOR_MARGIN_MS` below is the room at the CEILING, where
 * four stages take 540 s; the two are different numbers and an earlier draft of
 * this paragraph conflated them — billing gate, round 2.)
 *
 * On one denominator, stage total against the lease: the original derivation
 * assumed 160/600 = **27%** and the shipped deadline is 480/600 = **80%**.
 *
 * The guard still HOLDS — `llm-deadline-coherence.test.ts` proves
 * 120,000 <= 135,000 for both shipped documents — but the margin that made ten
 * minutes feel safe is gone, and `recoverStaleSystemAutopsyAttempts`
 * finalizing a healthy in-flight attempt is the R-93 double-pay case this
 * constant exists to prevent. Revisit trigger, unchanged and now urgent: the
 * first 200 finalized autopsies' measured claim-to-finalize duration — set
 * this to their p99 with headroom, or lower `llm.overallDeadlineMs` toward the
 * measured 53.2 s with a smaller multiplier.
 */
export const AUTOPSY_ATTEMPT_WALL_CLOCK_CODE_CEILING_MS = 10 * 60_000;

/** The cache-claim lease IS the attempt's wall-clock ceiling. */
export const AUTOPSY_CLAIM_LEASE_MS = AUTOPSY_ATTEMPT_WALL_CLOCK_CODE_CEILING_MS;

/**
 * Time the pipeline may spend OUTSIDE vendor calls under the same lease
 * (claim lock, JSON parse, four-stage aggregation, the finalize transaction)
 * plus clock slack between the worker and the database. Unmeasured; the same
 * revisit trigger as the ceiling above.
 */
export const AUTOPSY_LEASE_NON_VENDOR_MARGIN_MS = 60_000;

/**
 * The largest per-stage vendor deadline that fits the lease: four sequential
 * stages at this deadline plus the non-vendor margin never outrun the lease.
 * Config `llm.overallDeadlineMs` above this must be REFUSED before any vendor
 * call, never clamped silently (a clamped deadline would bill differently
 * from what the operator configured).
 */
export const AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS = Math.floor(
  (AUTOPSY_CLAIM_LEASE_MS - AUTOPSY_LEASE_NON_VENDOR_MARGIN_MS)
    / AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
);

export class AutopsyDeadlineOutrunsLeaseError extends Error {
  constructor(overallDeadlineMs: number) {
    super(
      `llm.overallDeadlineMs ${overallDeadlineMs} × ${AUTOPSY_VENDOR_CALLS_PER_ATTEMPT} stages `
        + `+ ${AUTOPSY_LEASE_NON_VENDOR_MARGIN_MS} ms margin outruns the `
        + `${AUTOPSY_CLAIM_LEASE_MS} ms claim lease; the ceiling is `
        + `${AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS} ms per stage`,
    );
    this.name = "AutopsyDeadlineOutrunsLeaseError";
  }
}

/**
 * Refuse a configured per-stage deadline that a healthy attempt could not
 * finish inside its lease. Call it wherever the worker resolves
 * `llm.overallDeadlineMs` — before the vendor adapter is built.
 */
export function assertAutopsyDeadlineWithinLease(overallDeadlineMs: number): void {
  if (!Number.isSafeInteger(overallDeadlineMs) || overallDeadlineMs <= 0) {
    throw new Error("llm.overallDeadlineMs must be a positive safe integer");
  }
  if (overallDeadlineMs > AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS) {
    throw new AutopsyDeadlineOutrunsLeaseError(overallDeadlineMs);
  }
}
