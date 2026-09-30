// The landing page's marketing copy, in a module a test can import.
//
// EVERY NUMBER HERE TRACES TO AN AUTHORITY, and the trace is enforced:
// `tests/landing-pricing.test.ts` pins the credit allowances and profile
// counts to `CONFIG_V1_SEED` (packages/db/src/seed.ts — the PRD §4G table as
// shipped) and the prices to REQ-G01's $0/$10/$60/$200. The first mockup
// import shipped Pro at "1,800 credits / 3 creator profiles" and Studio at
// "7,000 / 10" plus a "priority generation queue" that exists nowhere — sold
// allowances `createProfile` would refuse (billing gate BLOCK, 2026-08-29).
// Niche counts come from REQ-E05 (Free: digest only; Creator 1; Pro 3).
//
// EVERY LINE, NOT EVERY NUMBER (audit 2026-09-19 item 28; remediation P6-R2,
// applied 2026-09-20). `landing-pricing.test.ts` now pins each entry in
// `lines` to a config key or a shipped path, both ways: a line with no pin and
// a pin with no line both fail. Three lines had neither and were removed in
// that pass:
//
//   - Creator's "Results log and approval-gated brain proposals" implied that
//     logged results produce proposals. They cannot: `buildResultProposalDraft`
//     refuses any evidence a platform connector did not verify (R-115,
//     packages/brain/src/proposal.ts:229-232), and no writer in this product can
//     reach that state — `/results` says so to creators in its own words.
//     Proposals from SESSION FEEDBACK do ship, so the line names that source.
//   - Studio's "3 seats with roles" and "For teams running several accounts"
//     sold a capability with NO authority anywhere: no seat key in config, and
//     the only two `insert(memberships)` sites are `bootstrap.ts:132` (the
//     signed-in person) and `seed.ts:237`. There is no invite, so a Studio
//     workspace holds exactly one person. `app-server.ts:35` says as much.
//     They are replaced by two Studio facts that do have authorities —
//     `trackedNiches.studio` (with the same hedge Pro's line carries, because
//     `worker/refresh.ts:72-76`'s discovery port is a blocker) and
//     `concurrencyLimits.studio`. That the tier reads thinner is a product
//     consequence of an unbuilt capability, not a reason to keep selling it.

/**
 * The four plan keys, and the ONE place the marketing surface spells them.
 *
 * They are the entitlement tier keys, lowercase, because `/sign-up` validates
 * the plan it is handed against this list and a second spelling would be a
 * second answer.
 */
export const PLAN_KEYS = ["free", "creator", "pro", "studio"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const isPlanKey = (value: unknown): value is PlanKey =>
  typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);

export type PricingTier = {
  name: string;
  /** The key the card's CTA carries to `/sign-up`. */
  plan: PlanKey;
  amount: string;
  period: string | null;
  featured: boolean;
  lines: string[];
  cta: string;
};

export const PRICING: PricingTier[] = [
  {
    name: "Free",
    plan: "free",
    amount: "$0",
    period: null,
    featured: false,
    lines: [
      "25 credits each month",
      "1 creator profile",
      "Hooks, captions and ideas",
      "Your data stays readable",
    ],
    cta: "Start free",
  },
  {
    name: "Creator",
    plan: "creator",
    amount: "$10",
    period: " /mo",
    featured: true,
    lines: [
      "250 credits each month",
      "1 creator profile",
      "Spin from any reference you paste",
      "Brain proposals from your feedback, approval-gated",
    ],
    cta: "Start Creator",
  },
  {
    name: "Pro",
    plan: "pro",
    amount: "$60",
    period: " /mo",
    featured: false,
    lines: [
      "2,000 credits each month",
      "1 creator profile",
      "3 tracked niches, once a source connects",
      "Auto-top-up with a spend cap, once activation completes",
    ],
    cta: "Start Pro",
  },
  {
    name: "Studio",
    plan: "studio",
    amount: "$200",
    period: " /mo",
    featured: false,
    lines: [
      "8,000 credits each month",
      "5 creator profiles",
      "10 tracked niches, once a source connects",
      "8 generations in flight at once",
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
