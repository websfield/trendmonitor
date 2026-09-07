// The landing page's marketing numbers, pinned to their authorities.
//
// WHY THIS EXISTS: the first mockup import shipped Pro at "1,800 credits /
// 3 creator profiles" and Studio at "7,000 / 10" plus a "priority generation
// queue" no config grants — public entitlement claims `createProfile` and the
// allowance grant would refuse (billing gate BLOCK, 2026-08-29). The design
// brief sanctions hardcoding marketing PRICES on the landing; it does not
// sanction figures that contradict the shipped config. So every number in
// `app/(marketing)/pricing-copy.ts` is asserted here against `CONFIG_V1_SEED`
// (the PRD §4G table as shipped) and REQ-G01's price points.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONFIG_V1_SEED } from "@respin/db";
import { MECHANIC_TAGS, PRICING } from "../app/(marketing)/pricing-copy";

const TIER_KEYS = ["free", "creator", "pro", "studio"] as const;

/** REQ-G01: Free, Creator $10, Pro $60, Studio $200. */
const REQ_G01_PRICES: Record<(typeof TIER_KEYS)[number], string> = {
  free: "$0",
  creator: "$10",
  pro: "$60",
  studio: "$200",
};

const repoFile = (rel: string): string =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", rel),
    "utf8"
  );

describe("landing pricing traces to CONFIG_V1_SEED and REQ-G01", () => {
  it("covers exactly the four tiers, in order, with the Creator card featured", () => {
    expect(PRICING.map((t) => t.name)).toEqual([
      "Free",
      "Creator",
      "Pro",
      "Studio",
    ]);
    expect(PRICING.filter((t) => t.featured).map((t) => t.name)).toEqual([
      "Creator",
    ]);
  });

  it.each(TIER_KEYS.map((k, i) => [k, i] as const))(
    "%s: price, credit allowance and profile count match the authorities",
    (key, i) => {
      const tier = PRICING[i];
      expect(tier.amount).toBe(REQ_G01_PRICES[key]);
      const credits = CONFIG_V1_SEED.allowances[key];
      expect(tier.lines).toContain(
        `${credits.toLocaleString("en-US")} credits each month`
      );
      const caps = CONFIG_V1_SEED.profileCaps[key];
      expect(tier.lines).toContain(
        `${caps} creator profile${caps === 1 ? "" : "s"}`
      );
    }
  );

  it("claims no feature line the config cannot ground (the priority-queue class)", () => {
    // The specific overclaim that shipped: a priority queue. Nothing in config
    // is a priority; `concurrencyLimits` is a cap.
    const allLines = PRICING.flatMap((t) => t.lines).join("\n").toLowerCase();
    expect(allLines).not.toContain("priority");
  });

  it("the pack and pause fine print state the seeded values", () => {
    // The sentence lives in the shared PricingSection (rendered by the main
    // landing and every /for/<audience> variant); the numbers live in the
    // seed. Bind them. JSX reflow collapses to single spaces at render;
    // match the same way.
    const src = repoFile("app/(marketing)/landing-sections.tsx").replace(
      /\s+/g,
      " "
    );
    expect(CONFIG_V1_SEED.pack.validityMonths).toBe(12);
    expect(src).toContain("packs last 12 months");
    expect(CONFIG_V1_SEED.pauseMonths).toEqual({ min: 1, max: 3 });
    expect(src).toContain("1 to 3 months");
  });
});

describe("mechanic tags carry no invented metrics (REQ-I03 / non-negotiable 6)", () => {
  /** A digit in a marquee tag is an invented performance figure. */
  const carriesMetric = (text: string): boolean => /\d/.test(text);

  it("every tag is qualitative", () => {
    for (const tag of MECHANIC_TAGS) {
      expect(
        carriesMetric(tag.text),
        `"${tag.text}" carries a figure — the landing may name mechanisms, never fake numbers`
      ).toBe(false);
    }
  });

  it("NON-VACUITY: the predicate catches the tags that actually shipped once", () => {
    expect(carriesMetric("[consensus break] 2.4x watch-through")).toBe(true);
    expect(carriesMetric("[receipt flash] 3.2 follows per 1k")).toBe(true);
    expect(carriesMetric("[hard cut ending] rewatch trigger")).toBe(false);
  });
});
