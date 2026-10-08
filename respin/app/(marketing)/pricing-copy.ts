// The landing page's marketing copy, in a module a test can import.
//
// EVERY NUMBER HERE TRACES TO AN AUTHORITY, and since audit P6-A3 (decisions
// R-175, plan label R-158) the authority is the one a customer is actually
// held to: the ACTIVE config version for every allowance, cap, niche count and
// concurrency limit, and `tierPricesCents` (the table `stripe:setup` creates
// the Stripe prices from) for every price. This module holds no number of its
// own: `pricingFor` builds the cards from the numbers it is handed, and the
// page hands it what the server read at request time (`./pricing-load.ts`).
// Until 2026-10-07 the cards were a constant pinned to `CONFIG_V1_SEED`, so an
// admin's `appendConfigVersion` changed what a customer got while the page kept
// the seed's numbers.
//
// FAILS CLOSED TO NUMBER-FREE COPY. When the config read fails `pricingFor`
// receives `null` and every config-derived line says what the plan sets
// without a number and the page asks for a reload; it never falls back to the
// seed's numbers, which would be the stale claim R-175 exists to remove.
//
// EVERY LINE, NOT EVERY NUMBER (audit 2026-09-19 item 28; remediation P6-R2,
// applied 2026-09-20). `tests/landing-pricing.test.ts` pins each line to a
// config key, a shipped symbol or a fenced capability, both ways: a line with
// no pin and a pin with no line both fail. Three lines had neither and were
// removed in that pass:
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

/** The per-plan meters a card states, as the active config holds them. */
type TierNumbers = Readonly<Record<PlanKey, number>>;
export type PricingMeters = Readonly<{
  allowances: TierNumbers;
  profileCaps: TierNumbers;
  trackedNiches: TierNumbers;
  concurrencyLimits: TierNumbers;
}>;

/** The subscription prices in cents, from `tierPricesCents` (R-175). */
export type TierPricesCents = Readonly<Record<Exclude<PlanKey, "free">, number>>;

/**
 * The config fields the cards read, structurally: the active document carries
 * more, and this module imports nothing, so it names only what it uses.
 */
type ConfigNumbers = Readonly<{
  allowances: TierNumbers;
  profileCaps: TierNumbers;
  trackedNiches: TierNumbers;
  concurrencyLimits: TierNumbers;
  pauseMonths: Readonly<{ min: number; max: number }>;
  pack: Readonly<{ validityMonths: number }>;
  onboarding: Readonly<{ minOwnPostsForVoice: number; voiceCorpusMaxPosts: number }>;
}>;

/** The card meters of one config document (R-175): the ONE mapping, used by the loader and the tests. */
export function pricingMetersOf(c: ConfigNumbers): PricingMeters {
  return {
    allowances: c.allowances,
    profileCaps: c.profileCaps,
    trackedNiches: c.trackedNiches,
    concurrencyLimits: c.concurrencyLimits,
  };
}

/** The fine-print and step-01 numbers of one config document (R-175). */
export function landingTermsOf(c: ConfigNumbers): LandingTerms {
  return {
    pauseMinMonths: c.pauseMonths.min,
    pauseMaxMonths: c.pauseMonths.max,
    packValidityMonths: c.pack.validityMonths,
    minOwnPosts: c.onboarding.minOwnPostsForVoice,
    maxOwnPosts: c.onboarding.voiceCorpusMaxPosts,
  };
}

/**
 * The note shown when the plan numbers could not be read. No digit in it, and
 * the cards beside it carry none either, so nothing a visitor reads is a
 * number nobody checked against the live config. It asks for a reload rather
 * than pointing anywhere (Phase 6 billing gate, LOW): the billing page states
 * neither the allowances nor the pack period, so sending a visitor there to
 * read them would be a promise no page keeps.
 */
export const PRICING_NUMBERS_UNAVAILABLE =
  "The plan numbers could not be loaded just now, so the cards above and the terms below name what each plan sets without its numbers. Reload this page to see them.";

/** `1 month`, `3 months`: every count this page states is worded by its number. */
function counted(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/**
 * THE OTHER CONFIG NUMBERS THE LANDING STATES (R-175: every number a public
 * page states comes from the active version): the pause window and pack
 * validity in the pricing fine print, and the post counts in step 01. `null`
 * when the config read failed; the sentences then name no number.
 */
export type LandingTerms = Readonly<{
  pauseMinMonths: number;
  pauseMaxMonths: number;
  packValidityMonths: number;
  minOwnPosts: number;
  maxOwnPosts: number;
}>;

/** The pricing fine print, from the active config's pause and pack terms. */
export function pricingFinePrint(terms: LandingTerms | null): string {
  const pause =
    terms === null
      ? "Cancelling here offers a pause first: no charges, everything frozen and readable."
      : `Cancelling here offers a pause first: ${
          terms.pauseMinMonths === terms.pauseMaxMonths
            ? counted(terms.pauseMinMonths, "month", "months")
            : `${terms.pauseMinMonths} to ${counted(terms.pauseMaxMonths, "month", "months")}`
        }, no charges, everything frozen and readable.`;
  const packs =
    terms === null
      ? "packs last for a fixed number of months."
      : `packs last ${counted(terms.packValidityMonths, "month", "months")}.`;
  return `${pause} Stripe’s own billing portal stays open and has no pause, so a cancellation started there is just a cancellation. On a paid plan, unused monthly credits stay spendable for one more month, then expire; on Free they expire at the end of the calendar month; ${packs} No plan promises reach, and none of them ever will.`;
}

/** Step 01's sentence, from the active config's onboarding post counts. */
export function brainStepSentence(terms: LandingTerms | null): string {
  const posts =
    terms === null
      ? "A short interview plus a few of your own posts."
      : `A short interview plus at least ${counted(terms.minOwnPosts, "of your own posts", "of your own posts")}, up to ${terms.maxOwnPosts}.`;
  return `${posts} You confirm every inferred field before it activates; nothing is assumed silently.`;
}

/** `$10`, `$60`, `$200`; a non-whole amount keeps its cents. */
export function formatUsd(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

const creditsLine = (m: PricingMeters | null, plan: PlanKey): string =>
  m === null
    ? "Monthly credits, set by the plan"
    : `${counted(m.allowances[plan], "credit", "credits")} each month`;

const profilesLine = (m: PricingMeters | null, plan: PlanKey): string => {
  if (m === null) return "Creator profiles, set by the plan";
  return counted(m.profileCaps[plan], "creator profile", "creator profiles");
};

const nichesLine = (m: PricingMeters | null, plan: PlanKey): string =>
  m === null
    ? "Tracked niches, once a source connects"
    : `${counted(m.trackedNiches[plan], "tracked niche", "tracked niches")}, once a source connects`;

const concurrencyLine = (m: PricingMeters | null, plan: PlanKey): string =>
  m === null
    ? "Generations in flight at once, set by the plan"
    : `${counted(m.concurrencyLimits[plan], "generation", "generations")} in flight at once`;

/**
 * THE FOUR CARDS, built from the numbers the server read (R-175).
 *
 * `meters` is the ACTIVE config's, or `null` when that read failed — then the
 * config-derived lines are number-free and `PRICING_NUMBERS_UNAVAILABLE` is
 * shown beside them. `prices` is `tierPricesCents()`; Free has no subscription
 * and its card says `$0` because there is nothing to charge (B6).
 */
export function pricingFor(
  meters: PricingMeters | null,
  prices: TierPricesCents
): PricingTier[] {
  return [
    {
      name: "Free",
      plan: "free",
      amount: "$0",
      period: null,
      featured: false,
      lines: [
        creditsLine(meters, "free"),
        profilesLine(meters, "free"),
        "Hooks, captions and ideas",
        "Your data stays readable",
      ],
      cta: "Start free",
    },
    {
      name: "Creator",
      plan: "creator",
      amount: formatUsd(prices.creator),
      period: " /mo",
      featured: true,
      lines: [
        creditsLine(meters, "creator"),
        profilesLine(meters, "creator"),
        "Spin from any reference you paste",
        "Brain proposals from your feedback, approval-gated",
      ],
      cta: "Start Creator",
    },
    {
      name: "Pro",
      plan: "pro",
      amount: formatUsd(prices.pro),
      period: " /mo",
      featured: false,
      lines: [
        creditsLine(meters, "pro"),
        profilesLine(meters, "pro"),
        nichesLine(meters, "pro"),
        "Auto-top-up with a spend cap, once activation completes",
      ],
      cta: "Start Pro",
    },
    {
      name: "Studio",
      plan: "studio",
      amount: formatUsd(prices.studio),
      period: " /mo",
      featured: false,
      lines: [
        creditsLine(meters, "studio"),
        profilesLine(meters, "studio"),
        nichesLine(meters, "studio"),
        concurrencyLine(meters, "studio"),
      ],
      cta: "Start Studio",
    },
  ];
}

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
