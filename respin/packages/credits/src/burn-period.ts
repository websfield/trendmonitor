// Slice 2b, R7: the start of "this month" for the creator's credit-burn
// total on /usage.
//
// FROM THE SAME AUTHORITY BILLING USES, never a calendar month: a live
// subscription's own `current_period_start` is the anchor the credit grant
// it is spending is keyed to (REQ-G02's rollover is period-end-based, not
// calendar-based). A workspace with no live subscription — Free tier, or one
// that never activated — has no billing-cycle anchor at all, so the calendar
// month is the only well-defined fallback. That fallback never has to agree
// with a grant that does not exist: Free mints no credits today
// (DL-2/R-21 is slice 6's job), so nothing is being measured against the
// wrong anchor in the meantime.
import type { Subscription } from "@respin/db";

export function burnPeriodStart(
  subscription: Pick<Subscription, "currentPeriodStart"> | undefined,
  now: Date
): Date {
  if (subscription?.currentPeriodStart) return subscription.currentPeriodStart;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
