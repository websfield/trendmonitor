// The landing page's marketing copy, in a module a test can import.
//
// EVERY NUMBER HERE TRACES TO AN AUTHORITY, and the trace is enforced:
// `tests/landing-pricing.test.ts` pins the credit allowances and profile
// counts to `CONFIG_V1_SEED` (packages/db/src/seed.ts — the PRD §4G table as
// shipped) and the prices to REQ-G01's $0/$10/$60/$200. The first mockup
// import shipped Pro at "1,800 credits / 3 creator profiles" and Studio at
// "7,000 / 10" plus a "priority generation queue" that exists nowhere — sold
// allowances `createProfile` would refuse (billing gate BLOCK, 2026-08-29).
// Niche counts come from REQ-E05 (Free: digest only; Creator 1; Pro 3), seats
// from REQ-A02 (Studio: 3 seats).

export type PricingTier = {
  name: string;
  amount: string;
  period: string | null;
  featured: boolean;
  lines: string[];
  cta: string;
};

export const PRICING: PricingTier[] = [
  {
    name: "Free",
    amount: "$0",
    period: null,
    featured: false,
    lines: [
      "25 credits each month",
      "1 creator profile",
      "Weekly trend digest",
      "Your data stays readable, always",
    ],
    cta: "Start free",
  },
  {
    name: "Creator",
    amount: "$10",
    period: " /mo",
    featured: true,
    lines: [
      "250 credits each month",
      "1 creator profile",
      "Spin from the Trends feed",
      "Results loop and brain proposals",
    ],
    cta: "Start Creator",
  },
  {
    name: "Pro",
    amount: "$60",
    period: " /mo",
    featured: false,
    lines: [
      "2,000 credits each month",
      "1 creator profile",
      "3 tracked trend niches",
      "Auto-top-up with a spend cap",
    ],
    cta: "Start Pro",
  },
  {
    name: "Studio",
    amount: "$200",
    period: " /mo",
    featured: false,
    lines: [
      "8,000 credits each month",
      "5 creator profiles",
      "3 seats with roles",
      "For teams running several accounts",
    ],
    cta: "Start Studio",
  },
];

/**
 * The mechanic-tag marquee. QUALITATIVE ONLY: the mockup's tags carried
 * invented performance figures ("2.4x watch-through", "7.2x baseline") on the
 * same page whose refuses panel says "It never fakes a number" — REQ-I03 and
 * non-negotiable 6 outrank the mockup, so the tags name mechanisms, never
 * metrics.
 */
export const MECHANIC_TAGS: { text: string; hot: boolean }[] = [
  { text: "[consensus break] cold-open hook", hot: true },
  { text: "[receipt flash] proof on screen", hot: false },
  { text: "[dead-start contradiction] thesis first", hot: true },
  { text: "[hard cut ending] rewatch trigger", hot: false },
  { text: "[comment keyword] follow gate", hot: true },
  { text: "[part-two tease] series pull", hot: false },
];
