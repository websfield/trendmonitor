// The Signal landing (design/Respin Landing mockup). Marketing surface only:
// the BILLING page keeps its price-honesty rule and prints nothing it cannot
// verify. The markup is `./landing-view.tsx`; the pricing/marquee copy lives in
// ./pricing-copy.ts, where every line is pinned to its authority by
// `tests/landing-pricing.test.ts`.
import { LandingView } from "./landing-view";
import { landingPricing } from "./pricing-load";

// THE PRICING CARDS ARE READ PER REQUEST from the active config (audit P6-A3,
// R-175): an admin's config version changes what a customer gets, so the page
// that states it cannot be a build-time snapshot of the seed.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  return <LandingView pricing={await landingPricing()} />;
}
