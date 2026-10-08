// Checked-in Stripe setup script (build-plan M1): idempotently creates the
// product + 3 recurring tier prices + 1 one-off pack price, looked up by
// lookup_key so re-runs create nothing. It PRINTS the price ids and the exact
// next step — it never writes config itself (config changes go through the
// versioned append API via /admin/config).
// Run: pnpm stripe:setup   (requires STRIPE_SECRET_KEY and DATABASE_URL)
//
// It is also the DIVERGENCE CHECK for the one price that has two authorities:
// the pack. Re-running it refuses if the Stripe pack price and the active
// config's `pack.priceUsd` disagree (billing round-7 CHANGE 4).
import type { DbLike } from "@respin/db";
import { getActiveConfig } from "@respin/config";
import { getStripe } from "./adapter";
import { packCheckoutV1PriceKey } from "./pack-price";
import { TIER_AMOUNTS_CENTS } from "./tier-prices";
import { tierPriceDefect } from "./tier-price";
import { PINNED_CURRENCY, priceDefect } from "./price-allowlist";

const LOOKUP = {
  creator: "respin_creator_monthly",
  pro: "respin_pro_monthly",
  studio: "respin_studio_monthly",
  pack: "respin_pack_1000",
} as const;

// The three SUBSCRIPTION prices live in `./tier-prices.ts` (audit P6-A3,
// R-175), so the marketing page states the same numbers this script creates
// in Stripe instead of a literal of its own.
//
// The PACK is different and is deliberately NOT here: config's `pack.priceUsd`
// is charged directly by `maybeAutoTopup` (an off-session PaymentIntent it
// builds itself), while the manual pack Checkout charges the Stripe price
// object. Two authorities for one price agreed only by coincidence — raise
// `pack.priceUsd` to 15 in /admin/config (the sanctioned deploy-free path) and
// manual checkout still charges $10 while auto-top-up silently charges $15
// off-session for the same credits, a price the user was never shown. The pack
// amount now comes from config below, and a disagreement is a refusal.

export async function stripeSetup(db: DbLike): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(
      "STRIPE_SECRET_KEY is not set. Get a test-mode secret key from the Stripe dashboard and run:\n  STRIPE_SECRET_KEY=sk_test_... pnpm stripe:setup"
    );
    process.exitCode = 1;
    return;
  }
  // Through the ONE factory, so AC-9 — which requires the Stripe client to be
  // constructed only inside getStripe — is literally true rather than
  // true-in-spirit. This script building its own client was a second
  // construction site that the acceptance rule's own scan finds every time
  // (billing review evidence gap 4), and it is now enforced by a test rather
  // than by remembering to grep. The env check above still runs first so the
  // operator gets this script's own remedy — the exact command to re-run —
  // instead of the generic adapter error; getStripe would refuse identically
  // a line later.
  const stripe = getStripe();

  // The pack price comes from the ACTIVE CONFIG, which is the same authority
  // `maybeAutoTopup` charges from. Read before any Stripe write, so a missing
  // or invalid config refuses before this script creates anything.
  const { version, content } = await getActiveConfig(db);
  const packCents = Math.round(content.pack.priceUsd * 100);

  // EVERY EXISTING PRICE IS CHECKED BEFORE ANYTHING IS WRITTEN TO STRIPE
  // (Phase 6 billing re-run). The refusals below say "Nothing was changed in
  // Stripe by this run", and that was false when they ran after the product
  // and the missing prices had been created. Listing is a read; the checks
  // run on what it returns; only then does this script create anything.
  const existing = await stripe.prices.list({
    lookup_keys: Object.values(LOOKUP) as string[],
    limit: 10,
  });
  const byLookup = new Map(existing.data.map((p) => [p.lookup_key, p]));

  for (const tier of ["creator", "pro", "studio"] as const) {
    const price = byLookup.get(LOOKUP[tier]);
    if (!price) continue;
    // THE ONE PREDICATE Checkout also uses (`tierPriceDefect`): the
    // allowlist over every payment-affecting field of `Price`
    // (`./price-allowlist.ts`), at exactly `TIER_AMOUNTS_CENTS[tier]`. A refusal, like the pack's: the public page
    // states these prices (R-175), and a Stripe price cannot be updated.
    const defect = tierPriceDefect(price, tier);
    if (defect !== null) {
      throw new Error(
        `TIER PRICE DIVERGENCE (${defect.kind}): Stripe ${tier} price ${price.id} (lookup_key ${LOOKUP[tier]}): ${defect.detail}. The ${tier} plan is stated at ${TIER_AMOUNTS_CENTS[tier]}c usd per month (TIER_AMOUNTS_CENTS, packages/credits/src/stripe/tier-prices.ts; R-175). REMEDY, pick one: (a) create a NEW Stripe price at ${TIER_AMOUNTS_CENTS[tier]}c usd, recurring every 1 month, per-unit and licensed (\`transfer_lookup_key: true\` moves ${LOOKUP[tier]} onto it), and re-run this script; or (b) if the existing price is the one you mean to sell, change TIER_AMOUNTS_CENTS and deploy, so the page and the charge move together. Nothing was changed in Stripe by this run`
      );
    }
  }
  const existingPack = byLookup.get(LOOKUP.pack);
  // THE SAME ALLOWLIST AS CHECKOUT'S (`priceDefect`, `./price-allowlist.ts`)
  // for the one-time pack price: any payment-affecting field outside its
  // allowed values is a refusal; a wrong amount keeps its own message below.
  const packDefect =
    existingPack === undefined
      ? null
      : priceDefect(existingPack, {
          type: "one_time",
          amountCents: packCents,
          amountAuthority: `the active config v${version}'s pack.priceUsd`,
        });
  if (existingPack && packDefect !== null && packDefect.kind !== "amount") {
    throw new Error(
      `PACK PRICE REFUSED (${packDefect.kind}): Stripe pack price ${existingPack.id} (lookup_key ${LOOKUP.pack}): ${packDefect.detail}. REMEDY: create a NEW one-time Stripe price at ${packCents}c usd, per-unit, with no currency options, quantity transform, custom amount or exclusive tax (\`transfer_lookup_key: true\` moves ${LOOKUP.pack} onto it), and re-run this script. Nothing was changed in Stripe by this run`
    );
  }
  if (existingPack && packDefect?.kind === "amount") {
    // THE DIVERGENCE CHECK, and the reason this script is worth re-running: a
    // Stripe price's amount is IMMUTABLE (verified against the installed SDK —
    // `PriceUpdateParams` has no `unit_amount`), so config drifting away from
    // it cannot be repaired by an update, and the two charging paths would
    // quietly disagree until a customer noticed. Refuse, and name both numbers.
    throw new Error(
      `PRICE DIVERGENCE: Stripe pack price ${existingPack.id} (lookup_key ${LOOKUP.pack}) charges ${existingPack.unit_amount ?? "null"}c, but the active config v${version} says pack.priceUsd=${content.pack.priceUsd} (${packCents}c). The manual pack Checkout charges the Stripe price; auto-top-up charges the config amount off-session — so right now the same 1,000 credits cost two different prices depending on how they are bought. A Stripe price amount cannot be updated. REMEDY, pick one: (a) set pack.priceUsd back to ${(existingPack.unit_amount ?? 0) / 100} in /admin/config; or (b) create a NEW Stripe price at ${packCents}c (\`transfer_lookup_key: true\` moves ${LOOKUP.pack} onto it) and then map the NEW price id as "pack" in stripePriceMap — the map is keyed by price id, so leaving the old id mapped keeps charging the old amount. Nothing was changed in Stripe by this run`
    );
  }

  const products = await stripe.products.list({ limit: 100 });
  let product = products.data.find((p) => p.name === "Respin");
  if (!product) {
    product = await stripe.products.create({ name: "Respin" });
    console.log(`created product ${product.id}`);
  } else {
    console.log(`product exists: ${product.id}`);
  }

  const results: Record<string, string> = {};
  const amounts: Record<string, number | null> = {};
  for (const tier of ["creator", "pro", "studio"] as const) {
    let price = byLookup.get(LOOKUP[tier]);
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        lookup_key: LOOKUP[tier],
        currency: PINNED_CURRENCY,
        unit_amount: TIER_AMOUNTS_CENTS[tier],
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        billing_scheme: "per_unit",
        nickname: `Respin ${tier} (monthly)`,
      });
      console.log(`created ${tier} price ${price.id} at ${TIER_AMOUNTS_CENTS[tier]}c`);
    }
    results[price.id] = tier;
    amounts[price.id] = price.unit_amount ?? null;
  }
  let packPrice = existingPack;
  if (!packPrice) {
    packPrice = await stripe.prices.create({
      product: product.id,
      lookup_key: LOOKUP.pack,
      currency: PINNED_CURRENCY,
      // From config, never a literal — the manual pack Checkout charges THIS
      // object while auto-top-up charges config directly, so they must be one
      // number by construction.
      unit_amount: packCents,
      nickname: `Respin ${content.pack.credits.toLocaleString("en-US")}-credit pack`,
    });
    console.log(
      `created pack price ${packPrice.id} at ${packCents}c (config v${version} pack.priceUsd=${content.pack.priceUsd})`
    );
  } else {
    console.log(
      `pack price ${packPrice.id} agrees with config v${version} (${packCents}c)`
    );
  }
  const packConfigKey = packCheckoutV1PriceKey(packPrice.id);
  results[packConfigKey] = "pack";
  amounts[packConfigKey] = packPrice.unit_amount ?? null;

  console.log("\nNEXT STEP — paste this into /admin/config as `stripePriceMap`:");
  console.log(JSON.stringify(results, null, 2));
  // The amounts are printed BESIDE the map, never inside it: `stripePriceMap`
  // is price-id → tier by design (B5/R-7), and adding a number to it would
  // create the second price authority this file argues against. They are here
  // so the operator can SEE what each id charges before pasting.
  console.log("\nfor reference — what each of those price ids charges today:");
  for (const [id, tier] of Object.entries(results)) {
    console.log(`  ${id}  ${tier}  ${amounts[id] ?? "null"}c`);
  }
  console.log(
    "\nRe-run this script after any change to pack.priceUsd: it is the check that the Stripe pack price and the config price still agree."
  );
}
