// THE ONE PACK PRICE (audit 2026-08-17 #7).
//
// The pack was the single price in this product with TWO charging authorities,
// and they could diverge silently:
//
//  - manual pack Checkout (`createPackCheckoutUrl`) charged Stripe's immutable
//    `Price` object, looked up by id through `stripePriceMap`;
//  - auto-top-up (`maybeAutoTopup`) charged `Math.round(content.pack.priceUsd *
//    100)` as a raw off-session `PaymentIntent` amount, touching no Price at all.
//
// `/admin/config` is append-only and needs no deploy, so an admin raising
// `pack.priceUsd` from 10 to 15 took effect on auto-top-up IMMEDIATELY while
// manual Checkout kept charging whatever `stripe:setup` last synced — the same
// 1,000 credits at two live prices, depending only on how the customer bought
// them, until somebody remembered to re-run a script.
//
// `stripe:setup` already refuses on divergence (setup.ts, round-7 CHANGE 4) —
// but that is a check at SETUP time, and the hazard is a config edit made after
// it. This module is the RUNTIME check, on the charge path itself.
//
// The rule it enforces: **the Stripe Price object is the charge authority, and
// config must agree with it.** Config keeps `pack.priceUsd` (it is what the
// pack costs, and what `stripe:setup` seeds the Price FROM), but a disagreement
// now refuses the charge instead of picking a side.
import type { DbLike } from "@respin/db";
import { getActiveConfig } from "@respin/config";
import { getStripe } from "./adapter";

/**
 * The pack price is mapped in config but Stripe cannot serve it, or serves
 * something a charge must not be built on (inactive, wrong currency, no
 * amount). Typed so the billing page can say "billing is misconfigured" rather
 * than showing a creator a raw Stripe error.
 */
export class PackPriceUnavailableError extends Error {
  constructor(priceId: string, why: string) {
    super(
      `The credit-pack price (${priceId}) cannot be charged: ${why}. Nothing was charged. An operator needs to run \`pnpm stripe:setup\` and confirm the pack price in the Stripe dashboard, then map the id in /admin/config as "pack".`
    );
    this.name = "PackPriceUnavailableError";
  }
}

/**
 * Stripe's Price and the active config disagree about what a pack costs.
 *
 * A Stripe price's amount is IMMUTABLE (verified against the installed SDK:
 * `PriceUpdateParams` carries no `unit_amount`), so this cannot be repaired by
 * an update — which is exactly why it must refuse rather than choose. Both
 * numbers are named so the operator can see which one they meant.
 */
export class PackPriceMismatchError extends Error {
  constructor(
    priceId: string,
    stripeCents: number,
    configCents: number,
    configVersion: number
  ) {
    super(
      `PACK PRICE DIVERGENCE: Stripe price ${priceId} charges ${stripeCents}c, but active config v${configVersion} says pack.priceUsd = ${configCents / 100} (${configCents}c). Nothing was charged. The same credits must not cost two different amounts depending on how they are bought, and a Stripe price amount cannot be updated. REMEDY, pick one: (a) set pack.priceUsd back to ${stripeCents / 100} in /admin/config — append-only, live immediately, no deploy; or (b) create a NEW Stripe price at ${configCents}c and map the NEW id as "pack" in stripePriceMap (the map is keyed by price id, so leaving the old id mapped keeps charging the old amount).`
    );
    this.name = "PackPriceMismatchError";
  }
}

export class PackPriceNotMappedError extends Error {
  constructor() {
    super(
      'No Stripe price is mapped to "pack" in the active config. An operator needs to run `pnpm stripe:setup` and paste the printed price ids into /admin/config as `stripePriceMap`.'
    );
    this.name = "PackPriceNotMappedError";
  }
}

export type PackPrice = {
  /** The Stripe Price id — what manual Checkout puts in `line_items`. */
  priceId: string;
  /** The amount Stripe will charge — what auto-top-up's PaymentIntent uses. */
  amountCents: number;
  currency: string;
  /** How many credits a pack is worth, from the same config read. */
  credits: number;
  /** Pack lifetime in months, from the same config read. */
  validityMonths: number;
  configVersion: number;
};

/**
 * Resolve the pack price ONCE, validated, for whichever path is charging.
 *
 * Every field a charge needs comes from a SINGLE config read plus a SINGLE
 * Stripe read, so the two charge paths cannot observe different values even if
 * a config version is appended between their calls.
 *
 * Validated against the installed SDK's real fields (`stripe@22.5.0`
 * resources/Prices.d.ts: `active: boolean`, `currency: string`,
 * `unit_amount: number | null`) rather than assumed:
 *
 *  - `active: false` — Stripe refuses to charge an archived price, and finding
 *    that out from a Checkout 400 is worse than finding it out here;
 *  - `unit_amount: null` — real for tiered/metered prices, and `PaymentIntent`
 *    needs a concrete integer amount, so there is nothing to charge;
 *  - currency mismatch — auto-top-up hard-codes `currency: "usd"` on its
 *    PaymentIntent, so a pack Price in another currency would charge the right
 *    NUMBER in the wrong MONEY.
 */
export async function resolvePackPrice(db: DbLike): Promise<PackPrice> {
  const { version, content } = await getActiveConfig(db);
  const priceId = Object.entries(content.stripePriceMap).find(
    ([, t]) => t === "pack"
  )?.[0];
  if (!priceId) throw new PackPriceNotMappedError();

  const price = await getStripe().prices.retrieve(priceId);
  if (!price.active) {
    throw new PackPriceUnavailableError(priceId, "the price is archived in Stripe");
  }
  if (typeof price.unit_amount !== "number") {
    throw new PackPriceUnavailableError(
      priceId,
      "the price carries no fixed unit_amount (a tiered or metered price cannot back a one-off pack charge)"
    );
  }
  if (price.currency !== "usd") {
    throw new PackPriceUnavailableError(
      priceId,
      `the price is in ${price.currency} but pack charges are built in usd — the amount would be right and the currency wrong`
    );
  }

  const configCents = Math.round(content.pack.priceUsd * 100);
  if (price.unit_amount !== configCents) {
    throw new PackPriceMismatchError(
      priceId,
      price.unit_amount,
      configCents,
      version
    );
  }

  return {
    priceId,
    amountCents: price.unit_amount,
    currency: price.currency,
    credits: content.pack.credits,
    validityMonths: content.pack.validityMonths,
    configVersion: version,
  };
}
