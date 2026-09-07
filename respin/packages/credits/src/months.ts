// Calendar-month arithmetic, in ONE place because every money deadline in this
// package is expressed in months: credit-lot expiry (REQ-G02 rollover =
// service period end + 1 month), pack validity (config `pack.validityMonths`),
// auto-top-up pack validity, and the pause resume date (config `pauseMonths`).
//
// `Date.prototype.setUTCMonth` OVERFLOWS rather than clamping: 31 Jan + 1 month
// is "31 Feb", which the Date object normalises to 3 March. Every call site
// above used it directly, so a month-end anchor silently bought 2-3 extra days
// of credit life and a month-end pause ran past the bound `pauseMonths.max`
// validates (billing review finding 4). Clamping to the target month's last day
// is what "+1 month" means everywhere it is written down — and it is what
// Stripe itself does with billing anniversaries, so the expiry we compute stays
// aligned with the period end the invoice reports.
//
// Guarded as a CLASS, not per call site (CLAUDE.md lesson 2026-07-30): the four
// call sites import this, and `addMonthsUtc` is the only month arithmetic in
// the package.

/** Last day-of-month (1-31) for a UTC year/month, month being 0-indexed. */
function lastDayOfUtcMonth(year: number, month: number): number {
  // Day 0 of month+1 is the last day of `month` — and Date.UTC normalises an
  // out-of-range month, so December (11) rolls to the next January correctly.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * `from` + `months` calendar months, CLAMPED to the target month's last day,
 * preserving the time of day. 31 Jan + 1 → 28/29 Feb (never 3 March);
 * 31 Aug + 6 → 28/29 Feb; 29 Feb + 12 → 28 Feb.
 */
export function addMonthsUtc(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const d = new Date(from.getTime());
  // Move to the 1st FIRST so the month shift itself cannot overflow, then put
  // the day back, clamped. Setting the month while the date is (say) the 31st
  // is exactly the overflow this helper exists to prevent.
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, lastDayOfUtcMonth(d.getUTCFullYear(), d.getUTCMonth())));
  return d;
}
