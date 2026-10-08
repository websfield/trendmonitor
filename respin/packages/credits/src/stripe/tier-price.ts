// THE TIER PRICE CHECK AT CHECKOUT (audit Phase 6 billing gate, HIGH; R-175).
//
// R-175 made `TIER_AMOUNTS_CENTS` the authority for every price a public page
// states. A tier Checkout charges whatever Stripe price `stripePriceMap` maps
// to the tier, and until this module nothing compared that price's amount
// with the table: a dashboard edit, or a price id mapped onto the wrong tier,
// would charge a customer an amount the landing page never showed them. So
// the price is read from Stripe BEFORE a Checkout Session is created, and a
// price that is not the plan the page states is refused. Nothing is reserved
// and nothing is charged when it is.
//
// ONE PREDICATE DECIDES IT (Phase 6 billing re-run): `tierPriceDefect`, used
// by Checkout here and by `stripe:setup` before it writes anything. The first
// version checked amount, currency and archived state here and the interval in
// a separate list in `setup.ts`, so a $10 WEEKLY price passed Checkout under a
// page that says "/mo". Since the final billing check the predicate is an
// ALLOWLIST over every payment-affecting field of the SDK's `Price`
// (`./price-allowlist.ts`, which names the SDK file it was read from).
import { getActiveConfig } from "@respin/config";
import type { DbLike } from "@respin/db";
import { getStripe } from "./adapter";
import { tierPricesCents, type PaidTier } from "./tier-prices";
import {
  PRICE_DEFECT_KINDS,
  priceDefect,
  type PriceDefect,
  type PriceDefectKind,
  type PriceFacts,
} from "./price-allowlist";

/**
 * The mapped tier price cannot back a subscription charge: archived, no fixed
 * amount, or not in usd. Operator-fixable in the Stripe dashboard.
 */
/**
 * The price mapped to the tier changed between the check above and the
 * reservation inside the workspace lock (a config version appended in
 * between). Nothing is reserved; pressing again checks the new price.
 */
export class TierPriceChangedError extends Error {
  constructor(tier: PaidTier) {
    super(
      `The Stripe price mapped to the ${tier} plan changed while this Checkout was being prepared, so nothing was reserved, opened or charged. Press again: the new price is checked first.`
    );
    this.name = "TierPriceChangedError";
  }
}

export class TierPriceUnavailableError extends Error {
  constructor(tier: PaidTier, priceId: string, detail: string) {
    super(
      `The Stripe price mapped to the ${tier} plan (${priceId}) cannot be charged: ${detail}. Nothing was charged and no Checkout was opened. REMEDY: check that price in the Stripe dashboard, or run \`pnpm stripe:setup\` and map the price it prints for ${tier} in /admin/config's stripePriceMap.`
    );
    this.name = "TierPriceUnavailableError";
  }
}

/**
 * The mapped tier price charges a different amount from the one the public
 * page states (`TIER_AMOUNTS_CENTS`, R-175). Nothing is charged.
 */
export class TierPriceMismatchError extends Error {
  constructor(tier: PaidTier, priceId: string, stripeCents: number, statedCents: number) {
    super(
      `TIER PRICE DIVERGENCE: Stripe price ${priceId}, mapped to the ${tier} plan, charges ${stripeCents}c, but the price this product states for ${tier} is ${statedCents}c (TIER_AMOUNTS_CENTS, R-175). Nothing was charged and no Checkout was opened. A Stripe price amount cannot be updated. REMEDY, pick one: (a) create a NEW Stripe price at ${statedCents}c (\`pnpm stripe:setup\` refuses until the lookup key charges it) and map the NEW id to ${tier} in /admin/config's stripePriceMap; or (b) if ${stripeCents}c is the price you mean to sell, change TIER_AMOUNTS_CENTS in packages/credits/src/stripe/tier-prices.ts and deploy, so the page and the charge move together.`
    );
    this.name = "TierPriceMismatchError";
  }
}

export type VerifiedTierPrice = Readonly<{
  tier: PaidTier;
  priceId: string;
  amountCents: number;
  configVersion: number;
}>;

/** The `Price` fields the check reads: the allowlist's (`./price-allowlist.ts`). */
export type TierPriceFacts = PriceFacts;

/** Every defect a PLAN price can have: the allowlist's, minus the one-time-only kind. */
export const TIER_PRICE_DEFECT_KINDS = PRICE_DEFECT_KINDS.filter(
  (kind): kind is Exclude<PriceDefectKind, "not_one_time"> => kind !== "not_one_time"
);
export type TierPriceDefectKind = (typeof TIER_PRICE_DEFECT_KINDS)[number];
export type TierPriceDefect = PriceDefect;

/**
 * THE ONE TIER-PRICE PREDICATE: the first reason a Stripe price cannot be the
 * plan the public page states, or `null`. It is `PRICE_ALLOWLIST` evaluated
 * for a recurring monthly price at `tierPricesCents()[tier]`. Since the final
 * billing check it ALLOWLISTS every payment-affecting field of `Price` rather
 * than naming the defects someone thought of (see `./price-allowlist.ts`).
 * Both consumers call it and nothing else decides it: `resolveTierPrice` at
 * Checkout and `stripeSetup` before it writes anything.
 * `packages/credits/tests/tier-price-defects.test.ts` drives every kind
 * through both, and scans this directory for a second hand-written check.
 */
export function tierPriceDefect(price: TierPriceFacts, tier: PaidTier): TierPriceDefect | null {
  return priceDefect(price, {
    type: "recurring_monthly",
    amountCents: tierPricesCents()[tier],
    amountAuthority: `the price stated for the ${tier} plan (TIER_AMOUNTS_CENTS, R-175)`,
  });
}

/**
 * The price id `stripePriceMap` maps to `tier`, verified against Stripe and
 * against `tierPricesCents()`, or `null` when nothing is mapped (the caller
 * raises its own `UnknownTierPriceError`, which lives in `./actions.ts`).
 * Throws `TierPriceMismatchError` when `tierPriceDefect` reports `amount` and
 * `TierPriceUnavailableError` for every other defect kind.
 *
 * CALLED OUTSIDE ANY TRANSACTION AND BEFORE ANY RESERVATION, so a refusal
 * leaves no attempt behind and no provider call runs under a workspace lock.
 */
export async function resolveTierPrice(
  db: DbLike,
  tier: PaidTier
): Promise<VerifiedTierPrice | null> {
  const { version, content } = await getActiveConfig(db);
  const priceId = Object.entries(content.stripePriceMap).find(
    ([, configuredTier]) => configuredTier === tier
  )?.[0];
  if (!priceId) return null;
  const price = await getStripe().prices.retrieve(priceId);
  const defect = tierPriceDefect(price, tier);
  if (defect?.kind === "amount") {
    throw new TierPriceMismatchError(tier, priceId, price.unit_amount as number, tierPricesCents()[tier]);
  }
  if (defect !== null) throw new TierPriceUnavailableError(tier, priceId, defect.detail);
  return { tier, priceId, amountCents: price.unit_amount as number, configVersion: version };
}
