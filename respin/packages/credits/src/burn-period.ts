// Slice 2b, R7 / slice 6, R17a: the period "credit burn" is measured over on
// /usage — the ONE derivation both the total and the by-mode split read.
//
// FROM THE SAME AUTHORITY BILLING USES: a paid workspace's own
// `current_period_start` is the anchor the grant it is spending is keyed to
// (REQ-G02's rollover is period-end-based, not calendar-based), and a Free
// workspace's is the UTC calendar month, because Free has no billing
// anniversary and `freeAllowancePeriodKey` mints on exactly that key.
//
// THE ANCHOR IS CHOSEN BY THE RESOLVED TIER, NEVER BY THE PRESENCE OF A ROW,
// and that is the 2026-09-01 billing-gate finding rather than a preference.
// `DEAD_SUBSCRIPTION_FIELDS` (`stripe/webhooks.ts`) deliberately does NOT clear
// `currentPeriodStart` — a dead subscription keeps the last window it ever had
// — so a former subscriber's row still answers "the period started on 23 July"
// forever, and the window never advances again. That cost nothing while
// `allowances.free` had no reader: this file's own header used to say so, in
// as many words ("Free mints no credits today (DL-2/R-21 is slice 6's job), so
// nothing is being measured against the wrong anchor in the meantime"). Slice 6
// landed the mint. A former subscriber now mints Free credits keyed on the UTC
// calendar month, spends them, and the page summed EVERY month since the
// cancellation under one month's label, against a balance holding one month's
// grant.
//
// SO THE RULE IS: whenever the tier resolves to `free`, the period is the UTC
// calendar month — which is the same statement as "the period is the one the
// creator's credits are granted on", and covers every way a subscription row
// can outlive its entitlement at once (canceled, incomplete, an expired grace,
// and an unmapped price, all of which `getWorkspaceBillingState` resolves to
// `free`). It needs no second liveness test, because a paid tier can only be
// returned from a branch that already passed one — that implication is what
// `burn-period.test.ts`'s state fixtures pin, so it cannot quietly stop being
// true.
import type { Subscription } from "@respin/db";
import type { BillingState } from "./state";

/**
 * Which period this workspace's burn is measured over.
 *
 * `unknown` is NOT a tier — it is the page saying "the billing-state read
 * failed". It resolves to the calendar month for the same reason every other
 * degradation on that page does: a shorter window that is honestly labelled is
 * safe, a stale window labelled "this month" is the defect above.
 */
export type BurnPeriodTier = BillingState["tier"] | "unknown";

export type BurnPeriodKind = "billing_cycle" | "calendar_month";

export type BurnPeriod = {
  start: Date;
  kind: BurnPeriodKind;
};

/**
 * What the creator may be told the period IS (R17a: "the creator must know
 * which they are reading").
 *
 * A TOTAL `Record` over the kinds rather than two `if`s, the shape R-64 used
 * for the section list: a third period kind is a compile error here instead of
 * a screen that silently keeps calling it "this month".
 *
 * IT LIVES HERE AND NOT IN `usage-view.tsx` for the reason R-66 recorded for
 * `modeLabel`: the vocabulary belongs to the derivation, and a screen-side copy
 * is a second answer that goes stale the day the derivation changes.
 *
 * `noun` is the phrase the burn TOTAL uses in-sentence; `phrase` is the fuller
 * one the period line names beside the date. Two strings rather than one
 * because "N credits spent your current billing period" is not English.
 */
export const BURN_PERIOD_COPY: Record<
  BurnPeriodKind,
  { noun: string; phrase: string }
> = {
  calendar_month: { noun: "this month", phrase: "this calendar month" },
  billing_cycle: {
    noun: "this billing period",
    phrase: "your current billing period",
  },
};

function calendarMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * @param tier the RESOLVED entitlement tier from `getWorkspaceBillingState`,
 * which is the sole tier authority (R-30 constraint 2). Required with no
 * default, and driven on both sides in `burn-period.test.ts` — a required
 * parameter every caller happens to pass correctly reads exactly like a guard
 * and is not one until a test drives its false branch (CLAUDE.md 2026-08-26).
 */
export function burnPeriod(args: {
  subscription: Pick<Subscription, "currentPeriodStart"> | undefined;
  tier: BurnPeriodTier;
  now: Date;
}): BurnPeriod {
  const { subscription, tier, now } = args;
  // THE ONLY BRANCH THAT MAY READ THE ROW. A `free` (or unknown) tier is not
  // entitled to a billing anniversary even when a row still carries one.
  if (tier !== "free" && tier !== "unknown" && subscription?.currentPeriodStart) {
    return { start: subscription.currentPeriodStart, kind: "billing_cycle" };
  }
  return { start: calendarMonthStart(now), kind: "calendar_month" };
}
