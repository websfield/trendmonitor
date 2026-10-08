// THE LANDING PRICING, READ AT REQUEST TIME (audit P6-A3; decisions R-175,
// plan label R-158).
//
// SERVER-ONLY: it reads the active config through `@respin/config/app-server`'s
// `getActiveConfigForPublicPage`, on the public pages' own two-connection pool
// with a statement timeout, so landing traffic cannot starve the money paths'
// pool; and the prices through `@respin/credits/app-server`. The
// cards themselves are `pricingFor` in `./pricing-copy.ts`, a pure function
// of what this module hands it; the pages that render `PricingSection`
// (`./page.tsx`, `./for/[audience]/page.tsx`) are `force-dynamic` so the read
// happens per request rather than once at build time.
import { getActiveConfigForPublicPage, type ActiveConfig } from "@respin/config/app-server";
import { tierPricesCents } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../lib/next-control-flow";
import { logRefusal } from "../(product)/safe-log";
import {
  landingTermsOf,
  pricingFor,
  pricingMetersOf,
  type LandingTerms,
  type PricingTier,
} from "./pricing-copy";

export type LandingPricing = Readonly<{
  tiers: PricingTier[];
  /** The fine-print and step-01 numbers, or `null` on the number-free fallback. */
  terms: LandingTerms | null;
  /** The config version the numbers came from, or `null` on the number-free fallback. */
  configVersion: number | null;
}>;

/**
 * The landing's four cards from the ACTIVE config and `tierPricesCents`.
 *
 * FAILS CLOSED: any failure to read the config (no version, an invalid
 * document, no database) yields the number-free cards with
 * `configVersion: null` — never the seed's numbers, never a stale cache.
 * `read` is a parameter so a test can drive the real `getActiveConfig` over a
 * test database, and a failing read, without the server pool.
 */
export async function landingPricing(
  read: () => Promise<ActiveConfig> = getActiveConfigForPublicPage
): Promise<LandingPricing> {
  let active: ActiveConfig;
  try {
    active = await read();
  } catch (err) {
    rethrowNextControlFlow(err);
    // LOUD, NOT SILENT (CLAUDE.md 2026-09-09): the visitor gets the
    // number-free cards, and the operator gets the refusal line.
    logRefusal("[landing] pricing config unavailable", err);
    return { tiers: pricingFor(null, tierPricesCents()), terms: null, configVersion: null };
  }
  // NO CACHE, ON PURPOSE (Phase 6 billing gate). The read above is the
  // authority and happens per request; building the cards from it is a pure
  // function costing microseconds. A memo keyed by the version number alone
  // served one database's cards to another with the same version number
  // (two test databases each at v2), which is the stale-numbers failure R-175
  // exists to remove.
  return {
    tiers: pricingFor(pricingMetersOf(active.content), tierPricesCents()),
    terms: landingTermsOf(active.content),
    configVersion: active.version,
  };
}
