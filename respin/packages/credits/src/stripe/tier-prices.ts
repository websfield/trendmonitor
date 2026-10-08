// THE SUBSCRIPTION PRICES, IN ONE PLACE (audit P6-A3; decisions R-175, plan
// label R-158).
//
// Launch defaults (R-7) for the three SUBSCRIPTION prices — indicative, and the
// only authority for them: config maps a Stripe price id to a tier and to an
// allowance, never to a subscription price (Stripe charges the subscription,
// so there is no second number to disagree with). `stripe:setup` creates the
// Stripe prices from this table, and R-175 makes it the authority every public
// page states a price from, read through `tierPricesCents` rather than typed
// into copy.
//
// The PACK is deliberately NOT here: its amount has two charging paths and
// comes from config (`pack.priceUsd`), which `setup.ts` checks against Stripe.
// Free has no entry because Free has no subscription (B6): it is the default
// state, not a $0 price.

export type PaidTier = "creator" | "pro" | "studio";

export const TIER_AMOUNTS_CENTS: Readonly<Record<PaidTier, number>> = Object.freeze({
  creator: 1000,
  pro: 6000,
  studio: 20000,
});

/** The exported read a public page states prices from (R-175). */
export function tierPricesCents(): Readonly<Record<PaidTier, number>> {
  return TIER_AMOUNTS_CENTS;
}
