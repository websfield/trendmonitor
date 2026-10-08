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
import { priceDefect } from "./price-allowlist";

// The key, rather than the value, carries the cutover marker deliberately.
// A pre-v1 binary still finds the `"pack"` value but hands the prefixed key to
// Stripe as though it were a Price id; Stripe refuses it before a Checkout
// Session can exist. New binaries strip the prefix. Together with migration
// 0049's config trigger, this is a durable old-writer fence across rollback.
export const PACK_CHECKOUT_V1_PRICE_KEY_PREFIX =
  "respin_pack_checkout_v1:";

export function packCheckoutV1PriceKey(priceId: string): string {
  return `${PACK_CHECKOUT_V1_PRICE_KEY_PREFIX}${priceId}`;
}

export type PackPriceProtocol = "compatible" | "v1";

export function assertPackCheckoutV1WriterFence(
  stripePriceMap: Readonly<Record<string, string>>
): void {
  const mappings = Object.entries(stripePriceMap).filter(([, tier]) => tier === "pack");
  const v1 = mappings.filter(([key]) =>
    key.startsWith(PACK_CHECKOUT_V1_PRICE_KEY_PREFIX)
  );
  const legacy = mappings.filter(
    ([key]) => !key.startsWith(PACK_CHECKOUT_V1_PRICE_KEY_PREFIX)
  );
  // Zero disables pack sales and is fail-closed for both generations. One v1
  // mapping enables the new writer. More than one is ambiguous.
  if (legacy.length !== 0 || v1.length > 1) {
    throw new PackPriceNotMappedError("v1");
  }
}

export function mappedPackPriceId(
  stripePriceMap: Readonly<Record<string, string>>,
  protocol: PackPriceProtocol = "compatible"
): string {
  const mappings = Object.entries(stripePriceMap).filter(([, tier]) => tier === "pack");
  const v1 = mappings.filter(([key]) =>
    key.startsWith(PACK_CHECKOUT_V1_PRICE_KEY_PREFIX)
  );
  if (protocol === "v1") assertPackCheckoutV1WriterFence(stripePriceMap);
  if (
    mappings.length !== 1 ||
    (protocol === "v1" && v1.length !== 1)
  ) {
    throw new PackPriceNotMappedError(protocol);
  }
  const key = mappings[0]![0];
  const priceId = key.startsWith(PACK_CHECKOUT_V1_PRICE_KEY_PREFIX)
    ? key.slice(PACK_CHECKOUT_V1_PRICE_KEY_PREFIX.length)
    : key;
  if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) {
    throw new PackPriceNotMappedError(protocol);
  }
  return priceId;
}

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
  constructor(protocol: PackPriceProtocol = "compatible") {
    super(
      protocol === "v1"
        ? `The active config must contain exactly one rollback-safe pack mapping keyed as ${PACK_CHECKOUT_V1_PRICE_KEY_PREFIX}<price_id>, with no legacy pack mapping. Nothing was charged.`
        : 'Exactly one Stripe price must be mapped to "pack" in the active config. An operator needs to run `pnpm stripe:setup` and paste the printed price mapping into /admin/config as `stripePriceMap`.'
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
 * Validated by `priceDefect` (`./price-allowlist.ts`), the allowlist over
 * every payment-affecting field of the installed SDK's `Price`
 * (`stripe@22.5.0`). The three cases this docblock first named are among them:
 *
 *  - `active: false` — Stripe refuses to charge an archived price, and finding
 *    that out from a Checkout 400 is worse than finding it out here;
 *  - `unit_amount: null` — real for tiered/metered prices, and `PaymentIntent`
 *    needs a concrete integer amount, so there is nothing to charge;
 *  - currency mismatch — auto-top-up hard-codes `currency: "usd"` on its
 *    PaymentIntent, so a pack Price in another currency would charge the right
 *    NUMBER in the wrong MONEY.
 */
export async function resolvePackPrice(
  db: DbLike,
  protocol: PackPriceProtocol = "compatible"
): Promise<PackPrice> {
  const { version, content } = await getActiveConfig(db);
  const priceId = mappedPackPriceId(content.stripePriceMap, protocol);

  const price = await getStripe().prices.retrieve(priceId);
  // THE SAME ALLOWLIST AS A PLAN PRICE (Phase 6 final billing check), for a
  // one-time price: every payment-affecting field of `Price` must hold an
  // allowed value (`./price-allowlist.ts`), so a pack price with
  // `currency_options`, `transform_quantity`, a custom amount, tiers or an
  // exclusive tax behaviour is refused like an archived one.
  const configCents = Math.round(content.pack.priceUsd * 100);
  const defect = priceDefect(price, {
    type: "one_time",
    amountCents: configCents,
    amountAuthority: `the active config v${version}'s pack.priceUsd`,
  });
  if (defect?.kind === "amount") {
    throw new PackPriceMismatchError(priceId, price.unit_amount as number, configCents, version);
  }
  if (defect !== null) throw new PackPriceUnavailableError(priceId, defect.detail);

  return {
    priceId,
    amountCents: price.unit_amount as number,
    currency: price.currency,
    credits: content.pack.credits,
    validityMonths: content.pack.validityMonths,
    configVersion: version,
  };
}
