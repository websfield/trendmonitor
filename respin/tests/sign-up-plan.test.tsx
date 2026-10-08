// THE PLAN A PRICING CTA CARRIES SURVIVES THE TRIP TO `/sign-up`.
//
// WHY (audit 2026-09-19 D5, remediation P6-R4). "Start Creator", "Start Pro"
// and "Start Studio" rendered `href="/sign-up"` with no plan, and
// `app/(auth)/sign-up/page.tsx` read no search params — so a button labelled
// with a purchase performed a free signup and the choice vanished with no
// message. The defect is the SILENCE, not the missing subscription: signup
// still creates a Free workspace, and this suite pins that the person is told
// so instead of being left to infer it.
//
// BOTH ENDS, IN ONE FILE. A test that only asserted the page reads the param
// would pass while every card still linked to a bare `/sign-up`, and a test
// that only read the hrefs would pass while the page ignored them. So the
// href set is derived from `PRICING` itself and the page is driven with the
// value each href carries.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CONFIG_V1_SEED } from "@respin/db";
import { tierPricesCents } from "@respin/credits/app-server";
import { PLAN_KEYS, isPlanKey, pricingFor } from "../app/(marketing)/pricing-copy";

// The cards the page renders under a config (R-175 builds them per request
// from the ACTIVE version; the seed stands in for it here), and the
// number-free set the page falls back to when that read fails. Both carry
// the tier through the CTA.
const PRICING = pricingFor(CONFIG_V1_SEED, tierPricesCents());
const NUMBER_FREE = pricingFor(null, tierPricesCents());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@respin/auth/client", () => ({
  authClient: {
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));
vi.mock("@respin/auth", () => ({ isGoogleConfigured: () => false }));

const { default: SignUpPage } = await import("../app/(auth)/sign-up/page");
const { planNoteFor } = await import("../app/(auth)/auth-form");
const { PricingSection } = await import("../app/(marketing)/landing-sections");

const render = async (
  params: Record<string, string | string[] | undefined> | undefined
): Promise<string> =>
  renderToStaticMarkup(
    await SignUpPage({ searchParams: params ? Promise.resolve(params) : undefined })
  );

describe("a pricing CTA's tier reaches the signup form", () => {
  it("every card links to /sign-up carrying its own plan key — with the numbers, and on the number-free fallback", () => {
    for (const [tiers, configVersion] of [
      [PRICING, 1],
      [NUMBER_FREE, null],
    ] as const) {
      const html = renderToStaticMarkup(
        <PricingSection pricing={{ tiers, terms: null, configVersion }} />
      );
      // Derived from the cards, so a fifth card is covered with no edit here.
      expect(tiers.length).toBeGreaterThan(0);
      for (const tier of tiers) {
        expect(isPlanKey(tier.plan), `${tier.name} carries a plan key`).toBe(true);
        expect(html, `${tier.name}'s CTA drops its plan`).toContain(
          `href="/sign-up?plan=${tier.plan}"`
        );
      }
      // NON-VACUOUS FROM THE OTHER SIDE: the bare link is the defect, so its
      // absence is asserted rather than inferred from the presence above.
      expect(html).not.toContain('href="/sign-up"');
    }
  });

  it.each(PLAN_KEYS.filter((plan) => plan !== "free"))(
    "%s: the form names the plan and says the account is still free",
    async (plan) => {
      const html = await render({ plan });
      expect(html).toContain(planNoteFor(plan as "creator" | "pro" | "studio"));
      // The honesty half: a paid label must not imply a charge is starting.
      expect(html).toContain("Creating the account is free");
    }
  );

  it("free, absent and junk plans render no note at all", async () => {
    // `free` is a real key and deliberately silent — there is nothing to tell
    // someone who picked the plan they are about to get.
    for (const params of [
      { plan: "free" },
      undefined,
      {},
      { plan: "enterprise" },
      { plan: ["creator", "pro"] as string[] },
      { plan: "<script>alert(1)</script>" },
    ]) {
      const html = await render(params);
      expect(html, JSON.stringify(params)).not.toContain("auth-plan-note");
      expect(html, JSON.stringify(params)).toContain("Create your account");
    }
  });

  it("an unknown plan is never echoed into the page", async () => {
    // The value reaches a rendered sentence, so validation is what keeps it
    // from being reflected content. An array is included because Next hands
    // repeated params through as one.
    const html = await render({ plan: "creator-but-not-really" });
    expect(html).not.toContain("creator-but-not-really");
  });
});
