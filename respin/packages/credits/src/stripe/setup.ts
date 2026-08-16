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

const LOOKUP = {
  creator: "respin_creator_monthly",
  pro: "respin_pro_monthly",
  studio: "respin_studio_monthly",
  pack: "respin_pack_1000",
} as const;

// Launch defaults (R-7) for the three SUBSCRIPTION prices — indicative, and
// the only authority for them: config maps a Stripe price id to a tier and to
// an allowance, never to a subscription price (Stripe charges the subscription,
// so there is no second number to disagree with).
//
// The PACK is different and is deliberately NOT here: config's `pack.priceUsd`
// is charged directly by `maybeAutoTopup` (an off-session PaymentIntent it
// builds itself), while the manual pack Checkout charges the Stripe price
// object. Two authorities for one price agreed only by coincidence — raise
// `pack.priceUsd` to 15 in /admin/config (the sanctioned deploy-free path) and
// manual checkout still charges $10 while auto-top-up silently charges $15
// off-session for the same credits, a price the user was never shown. The pack
// amount now comes from config below, and a disagreement is a refusal.
const TIER_AMOUNTS_CENTS = { creator: 1000, pro: 6000, studio: 20000 };

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

  const products = await stripe.products.list({ limit: 100 });
  let product = products.data.find((p) => p.name === "Respin");
  if (!product) {
    product = await stripe.products.create({ name: "Respin" });
    console.log(`created product ${product.id}`);
  } else {
    console.log(`product exists: ${product.id}`);
  }

  const existing = await stripe.prices.list({
    lookup_keys: Object.values(LOOKUP) as string[],
    limit: 10,
  });
  const byLookup = new Map(existing.data.map((p) => [p.lookup_key, p]));

  const results: Record<string, string> = {};
  const amounts: Record<string, number | null> = {};
  for (const tier of ["creator", "pro", "studio"] as const) {
    let price = byLookup.get(LOOKUP[tier]);
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        lookup_key: LOOKUP[tier],
        currency: "usd",
        unit_amount: TIER_AMOUNTS_CENTS[tier],
        recurring: { interval: "month" },
        nickname: `Respin ${tier} (monthly)`,
      });
      console.log(`created ${tier} price ${price.id} at ${TIER_AMOUNTS_CENTS[tier]}c`);
    } else if (price.unit_amount !== TIER_AMOUNTS_CENTS[tier]) {
      // NOT a refusal, unlike the pack (billing round-10 NOTE 5). The pack has
      // TWO charging authorities — the Stripe price object for manual
      // checkout and config's `pack.priceUsd` for the off-session
      // auto-top-up PaymentIntent — so a divergence there really does charge
      // two different prices for the same credits, and must stop the run. A
      // TIER price has exactly one charger: Stripe itself. `stripePriceMap`
      // records price-id → tier, never an amount, so nothing in this codebase
      // can disagree with what Stripe charges.
      //
      // What IS worth saying out loud is that the literal below (R-7 launch
      // defaults, and the only authority for the SEEDED amount) no longer
      // describes what this lookup_key charges — someone changed the price in
      // the dashboard, or this script seeded it at a different figure long
      // ago. Until now that was undetectable: the script printed a price id
      // with no amount beside it, so an operator pasting the map into
      // /admin/config could map a $10 tier onto a $60 price and see nothing.
      console.warn(
        `WARNING: Stripe ${tier} price ${price.id} (lookup_key ${LOOKUP[tier]}) charges ${price.unit_amount ?? "null"}c, but this script's R-7 launch default for ${tier} is ${TIER_AMOUNTS_CENTS[tier]}c. Stripe is the only charger for a subscription tier, so this is NOT a two-authority divergence like the pack and nothing is refused — but check that the amount below is the one you mean to sell before pasting the map.`
      );
    }
    results[price.id] = tier;
    amounts[price.id] = price.unit_amount ?? null;
  }
  let packPrice = byLookup.get(LOOKUP.pack);
  if (!packPrice) {
    packPrice = await stripe.prices.create({
      product: product.id,
      lookup_key: LOOKUP.pack,
      currency: "usd",
      // From config, never a literal — the manual pack Checkout charges THIS
      // object while auto-top-up charges config directly, so they must be one
      // number by construction.
      unit_amount: packCents,
      nickname: `Respin ${content.pack.credits.toLocaleString("en-US")}-credit pack`,
    });
    console.log(
      `created pack price ${packPrice.id} at ${packCents}c (config v${version} pack.priceUsd=${content.pack.priceUsd})`
    );
  } else if (packPrice.unit_amount !== packCents) {
    // THE DIVERGENCE CHECK, and the reason this script is worth re-running: a
    // Stripe price's amount is IMMUTABLE (verified against the installed SDK —
    // `PriceUpdateParams` has no `unit_amount`), so config drifting away from
    // it cannot be repaired by an update, and the two charging paths would
    // quietly disagree until a customer noticed. Refuse, and name both numbers.
    throw new Error(
      `PRICE DIVERGENCE: Stripe pack price ${packPrice.id} (lookup_key ${LOOKUP.pack}) charges ${packPrice.unit_amount ?? "null"}c, but the active config v${version} says pack.priceUsd=${content.pack.priceUsd} (${packCents}c). The manual pack Checkout charges the Stripe price; auto-top-up charges the config amount off-session — so right now the same 1,000 credits cost two different prices depending on how they are bought. A Stripe price amount cannot be updated. REMEDY, pick one: (a) set pack.priceUsd back to ${(packPrice.unit_amount ?? 0) / 100} in /admin/config; or (b) create a NEW Stripe price at ${packCents}c (\`transfer_lookup_key: true\` moves ${LOOKUP.pack} onto it) and then map the NEW price id as "pack" in stripePriceMap — the map is keyed by price id, so leaving the old id mapped keeps charging the old amount. Nothing was changed in Stripe by this run`
    );
  } else {
    console.log(
      `pack price ${packPrice.id} agrees with config v${version} (${packCents}c)`
    );
  }
  results[packPrice.id] = "pack";
  amounts[packPrice.id] = packPrice.unit_amount ?? null;

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
