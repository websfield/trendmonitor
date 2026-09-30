// The landing page's marketing claims, pinned to their authorities.
//
// WHY THIS EXISTS: the first mockup import shipped Pro at "1,800 credits /
// 3 creator profiles" and Studio at "7,000 / 10" plus a "priority generation
// queue" no config grants — public entitlement claims `createProfile` and the
// allowance grant would refuse (billing gate BLOCK, 2026-08-29). The design
// brief sanctions hardcoding marketing PRICES on the landing; it does not
// sanction figures that contradict the shipped config.
//
// EVERY FEATURE LINE, NOT EVERY NUMBER (audit 2026-09-19 item 28; remediation
// P6-R2). The version of this file that shipped until 2026-09-20 pinned three
// lines per tier — price, allowance, profile count — and read nothing else.
// The other nine lines were prose no test had an opinion about, and the audit
// found three capabilities sold there that this branch does not have: a weekly
// digest whose loader throws, a trends feed whose only producer is a blocker,
// and a results-driven learning loop R-115 makes unreachable. A scan that
// reads three lines and a page that sells twelve are indistinguishable from
// the outside, which is this repo's 2026-08-26 lesson.
//
// SO THE POPULATION IS `PRICING[].lines[]` ITSELF, compared BOTH WAYS against
// the pin table below: a line with no pin is a claim with no authority, and a
// pin naming no line is a pin left behind by a rewrite. The numeric pins are
// keyed by a string BUILT FROM the authority, so a copy edit that changes
// "2,000 credits" to "1,800 credits" does not fail an equality check — it
// leaves a line unpinned and a pin unclaimed, and both halves say so.
//
// WHAT A PIN IS AND IS NOT. `holds()` is evaluated against the shipped tree,
// never against the copy: it reads a config key, a tier table, a schema column
// or a file on disk. It cannot tell a well-written sentence from a true one —
// it answers only "does the thing this line depends on exist here today". A
// line whose `holds()` is false is not a typo, it is a sale of something the
// branch cannot deliver (P6-R2: "a line that can be pinned to neither is a
// line that should not ship").
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONFIG_V1_SEED, subscriptions } from "@respin/db";
import { modesIncludedIn, PASTED_REFERENCE_TIERS } from "@respin/credits";
import { CONNECTOR_NOT_OFFERED } from "../app/(product)/results/copy";
import { MECHANIC_TAGS, PRICING } from "../app/(marketing)/pricing-copy";

const TIER_KEYS = ["free", "creator", "pro", "studio"] as const;
type TierKey = (typeof TIER_KEYS)[number];

/** REQ-G01: Free, Creator $10, Pro $60, Studio $200. */
const REQ_G01_PRICES: Record<TierKey, string> = {
  free: "$0",
  creator: "$10",
  pro: "$60",
  studio: "$200",
};

const repoPath = (rel: string): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "..", rel);

const repoFile = (rel: string): string => readFileSync(repoPath(rel), "utf8");

/**
 * A repo file with its comments removed.
 *
 * WHY EVERY SOURCE-READING PIN USES THIS. A pin whose predicate is a bare
 * substring search over source text is satisfied by the symbol appearing in a
 * comment, in dead code, or on an import line — which is the vacuous-scan
 * shape this whole phase exists to delete, one layer up (batch-5 billing and
 * learning gates both raised it against the Creator pin). Stripping comments
 * does not make a text search into an executed binding; it removes the one
 * false-positive class a reader would never expect.
 */
const stripComments = (text: string): string =>
  // ONE ALTERNATION, leftmost-first, NOT two passes. Stripping block comments
  // first makes a `` `app/**` `` inside a LINE comment open a phantom block
  // that runs to the next real `*/` — measured on 2026-09-21 against
  // `tests/framework-ui.test.tsx`, where it deleted 800 lines including the
  // code the scan was looking for and reported a clean read.
  text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (_m, before?: string) =>
    before === undefined ? " " : `${before} `
  );

const repoCode = (rel: string): string => stripComments(repoFile(rel));

/**
 * One feature line's dependency.
 *
 * `authority` is the citation a reader checks — a config key, an exported
 * table, a schema column, a path. It appears in the failure message, because a
 * red line whose reason is "the pin says so" teaches nobody anything.
 */
type LinePin = {
  readonly authority: string;
  readonly holds: () => boolean;
};

/**
 * The two lines every tier carries, keyed by a string DERIVED from config.
 *
 * `${allowance} credits each month` and `${caps} creator profile(s)` are not
 * compared to the copy here — they ARE the copy, computed. The comparison
 * happens once, in the population assertion, which is the only place it can
 * fail in both directions at once.
 */
function numericPins(tier: TierKey): Record<string, LinePin> {
  const allowance = CONFIG_V1_SEED.allowances[tier];
  const caps = CONFIG_V1_SEED.profileCaps[tier];
  return {
    [`${allowance.toLocaleString("en-US")} credits each month`]: {
      authority: `CONFIG_V1_SEED.allowances.${tier}`,
      holds: () => allowance > 0,
    },
    [`${caps} creator profile${caps === 1 ? "" : "s"}`]: {
      authority: `CONFIG_V1_SEED.profileCaps.${tier}`,
      holds: () => caps > 0,
    },
  };
}

/** The Free plan's modes, from the one table that decides them. */
const freeModes = (): string => [...modesIncludedIn("free")].sort().join(",");

// A CAPABILITY CAN SHIP AND STILL REFUSE ON EVERY CALL. That is a third thing
// a line can depend on, beside a config key and a path on disk, and until the
// batch-5 billing gate it had no pin kind (BLOCK, 2026-09-21).
//
// The shape: `"Auto-top-up with a spend cap"` was pinned by
// `"autoTopupMonthlyCapCents" in subscriptions` — a COLUMN-EXISTENCE check
// that went true the moment migration 0048 landed and stays true no matter
// what. But 0048 seeds the charge-authority rollout as `'expanded'`, and
// `isAutoTopupProtocolActive` returns false for anything but `'active'`, so
// `maybeAutoTopup` returns `rollout_pending` BEFORE it can reach the
// `cap_reached` branch the pin's own authority string cited. On any freshly
// migrated database the Pro card sold a capability that refuses every time.
//
// The two `tracked niches` lines had the identical property — `worker/
// production.ts` wires `unavailableYouTubeDiscovery`, which returns a blocker
// unconditionally — and they DID carry a hedge, "once a source connects". The
// convention existed; it was applied to two lines and withheld from the third,
// with the reason filed in a progress document instead of the copy.
//
// So the rule is the pin, for all three at once: a line whose capability sits
// behind a fence that is CLOSED BY DEFAULT must say so in the line. Open the
// fence and the hedge becomes optional; leave it closed and dropping the hedge
// is red. `holds()` reads the fence from the tree — the migration's seeded
// state, the port the production worker actually wires — never from the copy.

/** The v1 charge-authority rollout state migration 0048 seeds. */
function seededAutoTopupRolloutState(): string {
  const sql = repoFile("packages/db/migrations/0048_auto_topup_attempt_authority.sql");
  const seed = /INSERT INTO "auto_topup_protocol_rollouts"[\s\S]*?VALUES \('v1', '([a-z_]+)'\)/.exec(sql);
  if (seed === null) {
    throw new Error(
      "the v1 rollout seed is no longer where this pin reads it — re-derive the fence before trusting the Pro card"
    );
  }
  return seed[1]!;
}

/** The discovery port the production worker actually wires. */
const productionDiscoveryPort = (): string =>
  /discovery:\s*([A-Za-z]+)/.exec(repoFile("worker/production.ts"))?.[1] ?? "";

/**
 * A pin for a capability that ships but refuses until an operator opens a
 * fence: it holds only when the thing exists AND (the fence is open OR the
 * line itself carries the hedge).
 */
function fencedPin(
  line: string,
  spec: {
    readonly authority: string;
    readonly shipped: () => boolean;
    readonly fenceOpen: () => boolean;
    readonly hedge: string;
  }
): LinePin {
  return {
    authority: `${spec.authority} — FENCED, so the line must carry "${spec.hedge}" until the fence opens`,
    holds: () => spec.shipped() && (spec.fenceOpen() || line.includes(spec.hedge)),
  };
}

/** The niche-count line for a tier, hedged while the discovery port is blocked. */
function trackedNichesPin(tier: "pro" | "studio"): [string, LinePin] {
  const line = `${CONFIG_V1_SEED.trackedNiches[tier]} tracked niches, once a source connects`;
  return [
    line,
    fencedPin(line, {
      authority: `CONFIG_V1_SEED.trackedNiches.${tier}, fenced by worker/production.ts's wired discovery port`,
      shipped: () => CONFIG_V1_SEED.trackedNiches[tier] > 0,
      fenceOpen: () => productionDiscoveryPort() !== "unavailableYouTubeDiscovery",
      hedge: "once a source connects",
    }),
  ];
}

/**
 * The capability lines, each beside the authority that grants it.
 *
 * Read the `authority` strings before the predicates: where one says NONE,
 * that is a measured absence, not an unwritten pin.
 */
const CAPABILITY_PINS: Record<TierKey, Record<string, LinePin>> = {
  free: {
    "Hooks, captions and ideas": {
      authority:
        "MODE_TIERS via modesIncludedIn('free') — packages/credits/src/mode-access.ts:83",
      holds: () => freeModes() === ["caption", "hooks", "ideation"].join(","),
    },
    // THE WORD THAT WAS THE WHOLE CLAIM. This read "Your data stays readable,
    // ALWAYS" and the pin was `existsSync` — a file on disk, which can never
    // ground a universal quantifier. `/api/export` answers 404 for the entire
    // deletion grace window (`packages/db/src/membership-lifecycle.ts:142-157`,
    // via the route's own `ProfileAccessError` → 404 at `route.ts:82-90`), so
    // "always" was false and nothing could see it. One word removed; the
    // remaining sentence is exactly what the pin proves. The class rule is
    // asserted separately below: a path-on-disk pin may not carry an absolute
    // quantifier (batch-5 billing gate, MEDIUM).
    "Your data stays readable": {
      authority: "app/api/export/route.ts — the streaming brain export",
      holds: () => existsSync(repoPath("app/api/export/route.ts")),
    },
  },
  creator: {
    "Spin from any reference you paste": {
      authority:
        "PASTED_REFERENCE_TIERS — packages/credits/src/pasted-reference.ts:111",
      holds: () => PASTED_REFERENCE_TIERS.includes("creator"),
    },
    // THE LINE NAMES ITS SOURCE, AND THE PIN IS WHY IT HAS TO. The version
    // that shipped until 2026-09-20 read "Results log and approval-gated brain
    // proposals", which beside "Results log" reads as "your results produce
    // them" — and that path is closed: `buildResultProposalDraft` refuses any
    // evidence row that is not `connector_verified`
    // (packages/brain/src/proposal.ts:229-232) and `recordResult` has no
    // branch and no parameter that can reach that state
    // (packages/db/src/with-workspace.ts:5168). Proposals from SESSION
    // FEEDBACK do ship, on this tier, today — so the pin is the feedback
    // reader plus the tier's own entitlement, and the second half is what
    // makes it a CREATOR claim rather than a product one.
    //
    // THE SECOND CONJUNCT WAS A GREP AND IS NOW A BINDING (batch-5 billing and
    // learning gates, both raised it). It read
    // `repoFile("promotion-ops.ts").includes("buildFeedbackProposalDraft")`,
    // which the IMPORT LINE alone satisfies — and so would a commented-out
    // call, or dead code. A pin whose authority says "a shipped code path" and
    // whose predicate is a substring search is the vacuous-scan shape this
    // whole phase exists to delete, one layer up. Importing the symbol is an
    // EXECUTED binding: a rename, a deletion, or un-exporting it all fail at
    // module load rather than passing a text search.
    //
    // AND THAT BINDING IS NOT AVAILABLE HERE, which is stated rather than
    // quietly worked around. `@respin/brain` is deliberately not a dependency
    // of the app workspace — `eslint.config.mjs`'s catch-all denies it from
    // `app/**` and `lib/**` because `buildLeverComparisons` takes rows its own
    // docblock calls "ALREADY profile-scoped by the caller", so granting the
    // root would make a screen responsible for scoping a cohort (REQ-A03,
    // R-9). Adding it to the root manifest so a TEST can name a symbol is
    // exactly what `app/(product)/billing-errors.ts` records as "loosening a
    // tenancy boundary for a convenience" — measured, not assumed: importing
    // it here fails with `Cannot find package '@respin/brain'`.
    //
    // SO THE PIN STAYS A SOURCE READ, and is narrowed to what a source read
    // can honestly claim: the symbol is EXPORTED by the package's own entry
    // point, and there is a real CALL SITE, both with comments stripped so an
    // import line or a mention in prose cannot satisfy either half. That is
    // still weaker than a binding, and the gap is named here rather than
    // covered by a confident authority string.
    "Brain proposals from your feedback, approval-gated": {
      authority:
        "buildFeedbackProposalDraft — exported by packages/brain/src/index.ts and CALLED in packages/db/src/promotion-ops.ts (comments stripped; a source read, not an executed binding — @respin/brain is not reachable from this workspace by design), gated by CONFIG_V1_SEED.performanceLearning.creator",
      holds: () =>
        CONFIG_V1_SEED.performanceLearning.creator === "full" &&
        /\bbuildFeedbackProposalDraft\b/.test(repoCode("packages/brain/src/index.ts")) &&
        /\bbuildFeedbackProposalDraft\s*\(/.test(repoCode("packages/db/src/promotion-ops.ts")),
    },
  },
  pro: {
    ...Object.fromEntries([trackedNichesPin("pro")]),
    "Auto-top-up with a spend cap, once activation completes": fencedPin(
      "Auto-top-up with a spend cap, once activation completes",
      {
        authority:
          "subscriptions.autoTopupMonthlyCapCents (packages/db/src/billing-schema.ts:182), fenced by migration 0048's seeded rollout state via isAutoTopupProtocolActive",
        shipped: () => "autoTopupMonthlyCapCents" in subscriptions,
        fenceOpen: () => seededAutoTopupRolloutState() === "active",
        hedge: "once activation completes",
      }
    ),
  },
  studio: {
    // THE TWO LINES THESE REPLACED SOLD SEATS. Measured 2026-09-20, not
    // assumed: `seats` appears in no config key, and the only two
    // `insert(memberships)` sites in the tree are `bootstrap.ts:132` (the
    // signed-in person, as owner) and `seed.ts:237`. There is no invite, no
    // seat cap and no roster surface, so a Studio subscriber got a workspace
    // exactly one person could ever be in. `app-server.ts:35` says as much:
    // "until 10b-2 introduces seat caps there is no capacity to…". The
    // absence assertion above — "no card sells a seat, and none sells a
    // proposal that results would produce" — keeps them from coming back.
    ...Object.fromEntries([trackedNichesPin("studio")]),
    [`${CONFIG_V1_SEED.concurrencyLimits.studio} generations in flight at once`]:
      {
        authority: "CONFIG_V1_SEED.concurrencyLimits.studio, enforced by pgRunSlots",
        holds: () => CONFIG_V1_SEED.concurrencyLimits.studio > 0,
      },
  },
};

/** Every pin that applies to one tier's card. */
const pinsFor = (tier: TierKey): Record<string, LinePin> => ({
  ...numericPins(tier),
  ...CAPABILITY_PINS[tier],
});

/**
 * The lines `pins` does not support, and why — the one predicate both the real
 * assertion and its non-vacuity probe run, so the probe tests the mechanism
 * rather than a copy of it.
 */
function unsupported(
  lines: readonly string[],
  pins: Record<string, LinePin>
): string[] {
  return lines
    .filter((line) => {
      const pin = pins[line];
      return pin === undefined || !pin.holds();
    })
    .map((line) => {
      const pin = pins[line];
      return pin === undefined
        ? `${line} — NO PIN: no config key and no shipped path was named`
        : `${line} — ${pin.authority}`;
    });
}

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
    "%s: the price is REQ-G01's",
    (key, i) => {
      expect(PRICING[i].amount).toBe(REQ_G01_PRICES[key]);
    }
  );

  it("claims no feature line the config cannot ground (the priority-queue class)", () => {
    // The specific overclaim that shipped: a priority queue. Nothing in config
    // is a priority; `concurrencyLimits` is a cap.
    const allLines = PRICING.flatMap((t) => t.lines).join("\n").toLowerCase();
    expect(allLines).not.toContain("priority");
  });

  it("no card sells a seat, and none sells a proposal that results would produce", () => {
    // THE TWO OVERCLAIMS THE PIN TABLE FOUND ON 2026-09-20, named here as a
    // BACKSTOP. The comment that stood here claimed these two regexes mean "a
    // later rewrite cannot reintroduce them under different words", and that
    // was false (batch-5 billing gate, LOW): they match words, not meanings.
    // `"3 team members with roles"` passes `/\bseats?\b/` — and so, decisively,
    // does one of the two lines this check was written to keep out,
    // `"For teams running several accounts"`, which contains no "seat" at all.
    //
    // WHAT ACTUALLY CLOSES THE CLASS is the both-ways population assertion
    // below: any such rewrite is a line with no pin, and an unpinned line
    // fails. These two regexes catch the exact strings that shipped, which is
    // worth having and is all they are. The reach is also narrower than it
    // looks — the scan reads `PRICING[].lines[]` only, so the same claim in
    // the pricing note, the fine print or a hero is this file's blind spot and
    // the marketing render scan's ground.
    const allLines = PRICING.flatMap((t) => t.lines).join("\n").toLowerCase();
    // No seat: no key, no cap, and no invite path — `insert(memberships)`
    // exists only in `bootstrap.ts` (self, as owner) and `seed.ts`.
    expect("seats" in CONFIG_V1_SEED, "a seat key exists now — the ban below is stale").toBe(false);
    expect(allLines).not.toMatch(/\bseats?\b/);
    // No results→proposal claim while the connector the path requires does
    // not exist. The product states that itself, and this reads the statement
    // rather than a second opinion about it.
    expect(CONNECTOR_NOT_OFFERED).toContain("this product holds no such connection yet");
    expect(allLines).not.toMatch(/results[^\n]*proposal|proposal[^\n]*results/);
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
    // REQ-G02's ROLLOVER, which the sentence used to omit (batch-5 billing
    // gate, LOW). It read "Unused monthly credits expire" flat, with no
    // period — while `webhooks.ts:2173` grants paid allowances an expiry of
    // "service period_end + 1 month", which IS the rollover, and PRD §4G's
    // table gives 1 month to all three paid tiers and none to Free. The
    // omission errs against the product, which is exactly why nothing caught
    // it: no canon pattern and no pin can see a benefit left unstated.
    expect(src).toContain("stay spendable for one more month, then expire");
    // Free's half comes from a different anchor and is stated separately:
    // `burn-period.ts:6-8` — Free has no billing anniversary, so its period is
    // the UTC calendar month.
    expect(src).toContain("on Free they expire at the end of the calendar month");
  });

  it("the meter note names every non-credit meter the config carries (P6-R4)", () => {
    // P6-R4: the sentence that read "CREDITS ARE THE ONLY METER" must either
    // name the non-credit meters or go. It was rewritten to name four of
    // them and shipped UNPINNED — so the one sentence the requirement was
    // about was the one sentence no test had an opinion about, and it omitted
    // `performanceLearning`, a live per-tier gate where Free is `view_only`
    // (batch-5 billing gate, MEDIUM).
    //
    // THE POPULATION IS COMPUTED, NOT TYPED (non-negotiable 7). Every
    // tier-keyed key in `CONFIG_V1_SEED` is a per-plan meter by construction;
    // `allowances` is the credit meter the first sentence already names, and
    // every OTHER one has to appear in the note. A sixth tier-keyed key added
    // later gets no label here and is red until somebody writes one.
    const tiers = TIER_KEYS;
    const tierKeyed = Object.entries(CONFIG_V1_SEED)
      .filter(
        ([, value]) =>
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          tiers.every((tier) => tier in (value as Record<string, unknown>))
      )
      .map(([key]) => key)
      .sort();
    // Non-vacuity from the other side: if this ever came back empty or lost a
    // member, every assertion below would pass on an absent population.
    expect(tierKeyed).toEqual([
      "allowances",
      "concurrencyLimits",
      "performanceLearning",
      "profileCaps",
      "trackedNiches",
    ]);

    /** The words the note uses for each meter. */
    const NOTE_WORDS: Record<string, string> = {
      profileCaps: "creator profiles",
      trackedNiches: "tracked niches",
      concurrencyLimits: "how many runs go at once",
      performanceLearning: "brain proposals are yours to accept or only to read",
    };
    const note = repoFile("app/(marketing)/landing-sections.tsx")
      .replace(/\s+/g, " ")
      .toLowerCase();
    for (const key of tierKeyed) {
      if (key === "allowances") continue; // the credit meter itself
      const words = NOTE_WORDS[key];
      expect(words, `${key} is a per-tier meter with no wording in this table`).toBeDefined();
      expect(note, `the pricing note does not name ${key}`).toContain(words!);
    }
    // Mode access is the one per-tier meter that does NOT live in config — it
    // is `MODE_TIERS` in packages/credits — so it is named from its own
    // authority rather than by the loop above.
    expect(freeModes()).toBe(["caption", "hooks", "ideation"].join(","));
    expect(note).toContain("which modes are open");
  });

  it("the onboarding numbers in step 01 are config's, not a copywriter's", () => {
    // THESE WERE `[UNVERIFIED]` FOR A MONTH (audit item 31, P6-R7). The page
    // said "5 to 10 of your own posts" while `schema.ts:236-259` rejects ten
    // BY NAME — "Three, not one, and not ten… ten is a wall in front of the
    // product's first real screen" — and `voiceCorpusMaxPosts` is 50. It also
    // said "in 20 minutes", which has no source anywhere in `docs/`; that
    // claim is gone rather than re-sourced, and this asserts it stays gone.
    const src = repoFile("app/(marketing)/landing-sections.tsx").replace(
      /\s+/g,
      " "
    );
    const { minOwnPostsForVoice, voiceCorpusMaxPosts } = CONFIG_V1_SEED.onboarding;
    expect(src).toContain(`at least ${minOwnPostsForVoice} of your own posts`);
    expect(src).toContain(`up to ${voiceCorpusMaxPosts}`);
    expect(src).not.toContain("20 minutes");
    // The featured flag was "MOST CREATORS", a population claim with no
    // population. A recommendation is this product's own opinion and needs no
    // denominator; a majority claim does.
    expect(src).not.toContain("MOST CREATORS");
  });
});

describe("every feature line binds to a config key or a shipped path (P6-R2)", () => {
  it.each(TIER_KEYS.map((k, i) => [k, i] as const))(
    "%s: every line on the card is supported by the tree",
    (key, i) => {
      expect(
        unsupported(PRICING[i].lines, pinsFor(key)),
        "each entry is a sold capability this branch cannot deliver"
      ).toEqual([]);
    }
  );

  it.each(TIER_KEYS.map((k, i) => [k, i] as const))(
    "%s: no pin outlives the line it was written for",
    (key, i) => {
      // THE OTHER DIRECTION. Without it, a rewrite that deletes a line leaves
      // its pin behind, and the next author reads a table that describes a
      // page that no longer exists — which is how the three-line version of
      // this file stayed plausible while nine lines went unread.
      const pinned = Object.keys(pinsFor(key)).sort();
      expect(pinned).toEqual([...PRICING[i].lines].sort());
    }
  );

  it("NON-VACUITY: an unpinned line and a broken pin both come back named", () => {
    // Drive the REAL predicate, not a restatement of it.
    expect(unsupported(["A line nobody pinned"], pinsFor("free"))).toEqual([
      "A line nobody pinned — NO PIN: no config key and no shipped path was named",
    ]);
    expect(
      unsupported(["Sold", "Shipped"], {
        Sold: { authority: "NONE — measured absent", holds: () => false },
        Shipped: { authority: "a real key", holds: () => true },
      })
    ).toEqual(["Sold — NONE — measured absent"]);
  });

  it("a fenced capability must say so in the line until its fence opens", () => {
    // THE THIRD PIN KIND, and the BLOCK that earned it (batch-5 billing gate).
    // Both fences are read from the tree here, beside the pins that consume
    // them, so this case is also the record of what is closed today: if
    // somebody opens one, this assertion is what goes red and forces the copy
    // and the record to move together.
    expect(
      seededAutoTopupRolloutState(),
      "migration 0048 no longer seeds the v1 rollout closed — the Pro card's hedge can now be dropped, and this case is the place to decide that"
    ).toBe("expanded");
    expect(
      productionDiscoveryPort(),
      "the production worker wires a real discovery port now — the two tracked-niche hedges are removable"
    ).toBe("unavailableYouTubeDiscovery");
    // ...so all three fenced lines must carry their hedge, and the shipped
    // copy is what is checked, not the pin table's keys.
    const lines = PRICING.flatMap((tier) => tier.lines);
    expect(lines.filter((line) => line.includes("Auto-top-up"))).toEqual([
      "Auto-top-up with a spend cap, once activation completes",
    ]);
    for (const line of lines.filter((l) => l.includes("tracked niches"))) {
      expect(line).toContain("once a source connects");
    }
  });

  it("NON-VACUITY: dropping a hedge while the fence is closed reddens the pin", () => {
    // Drive the REAL `fencedPin`, with both fence states, so the case proves
    // the mechanism rather than restating the copy.
    const closed = (line: string) =>
      fencedPin(line, {
        authority: "a fence that is shut",
        shipped: () => true,
        fenceOpen: () => false,
        hedge: "once activation completes",
      }).holds();
    expect(closed("Auto-top-up with a spend cap")).toBe(false);
    expect(closed("Auto-top-up with a spend cap, once activation completes")).toBe(true);
    // An OPEN fence makes the hedge optional — otherwise this pin would
    // permanently cement a hedge that has stopped being true.
    expect(
      fencedPin("Auto-top-up with a spend cap", {
        authority: "a fence that is open",
        shipped: () => true,
        fenceOpen: () => true,
        hedge: "once activation completes",
      }).holds()
    ).toBe(true);
    // ...and an unshipped capability fails whatever the fence says.
    expect(
      fencedPin("Auto-top-up with a spend cap, once activation completes", {
        authority: "not shipped at all",
        shipped: () => false,
        fenceOpen: () => true,
        hedge: "once activation completes",
      }).holds()
    ).toBe(false);
  });

  it("no line grounded only by a file on disk carries an absolute quantifier", () => {
    // THE CLASS BEHIND "Your data stays readable, ALWAYS" (batch-5 billing
    // gate, MEDIUM). `existsSync` proves a file is present; it can never
    // ground a universal, and the word carrying the whole claim was invisible
    // to every check in this file. The rule: a line whose only authority is a
    // path may not say always / never / every / any / all.
    const ABSOLUTES = /\b(always|never|every|any|all)\b/i;
    const pathGrounded = TIER_KEYS.flatMap((tier) =>
      Object.entries(pinsFor(tier))
        .filter(([, pin]) => pin.authority.includes("app/api/") || pin.authority.includes("route.ts"))
        .map(([line]) => line)
    );
    // Non-vacuity: there IS such a line, so the loop is measuring something.
    expect(pathGrounded).toEqual(["Your data stays readable"]);
    for (const line of pathGrounded) {
      expect(ABSOLUTES.test(line), `${line} — a file's existence cannot ground an absolute`).toBe(false);
    }
    // ...and the predicate catches the string that actually shipped.
    expect(ABSOLUTES.test("Your data stays readable, always")).toBe(true);
  });

  it("NON-VACUITY: the pins read the tree, so deleting an authority reddens them", () => {
    // One probe per KIND of authority a pin can name, because "the predicate
    // ran" and "the predicate could have failed" are different facts.
    const goneKey: LinePin = {
      authority: "a config key that does not exist",
      holds: () => "noSuchKey" in CONFIG_V1_SEED,
    };
    const goneColumn: LinePin = {
      authority: "a schema column that does not exist",
      holds: () => "noSuchColumn" in subscriptions,
    };
    const gonePath: LinePin = {
      authority: "a route file that does not exist",
      holds: () => existsSync(repoPath("app/api/no-such-route/route.ts")),
    };
    for (const pin of [goneKey, goneColumn, gonePath]) {
      expect(pin.holds(), pin.authority).toBe(false);
    }
    // ...and the three authority kinds the cards actually use are live, so the
    // probes above are measuring the same mechanism the pins do.
    expect("allowances" in CONFIG_V1_SEED).toBe(true);
    expect("autoTopupMonthlyCapCents" in subscriptions).toBe(true);
    expect(existsSync(repoPath("app/api/export/route.ts"))).toBe(true);
  });

  it("NON-VACUITY: a source-reading pin is not satisfied by a comment", () => {
    // `repoCode` is the fourth authority kind and the weakest, so its one
    // claim — that a mention in prose does not count — is proved here rather
    // than asserted in its docblock. Driven against the real stripper.
    const stripped = stripComments;
    expect(stripped("// calls buildFeedbackProposalDraft() one day\n")).not.toMatch(
      /\bbuildFeedbackProposalDraft\s*\(/
    );
    expect(stripped("/* buildFeedbackProposalDraft({}) */\n")).not.toMatch(
      /\bbuildFeedbackProposalDraft\s*\(/
    );
    expect(stripped("const d = buildFeedbackProposalDraft({});\n")).toMatch(
      /\bbuildFeedbackProposalDraft\s*\(/
    );
    // A URL's `//` must not be mistaken for a line comment, or the stripper
    // would silently eat live code after one.
    expect(stripped('const u = "https://x/y"; call(u);\n')).toContain("call(u)");
    // ...and a `/**` inside a LINE comment must not open a block that eats the
    // rest of the file. Measured defect, not a hypothetical: this exact shape
    // deleted a working plant in `tests/framework-ui.test.tsx` on 2026-09-21.
    expect(
      stripped("// the only tree in `app/**` that matters\nbuildFeedbackProposalDraft({});\n/** doc */\n")
    ).toContain("buildFeedbackProposalDraft({})");
    // ...and the real files it reads still satisfy the pin, so the case above
    // is measuring the same mechanism the Creator card depends on.
    expect(repoCode("packages/brain/src/index.ts")).toMatch(/\bbuildFeedbackProposalDraft\b/);
    expect(repoCode("packages/db/src/promotion-ops.ts")).toMatch(
      /\bbuildFeedbackProposalDraft\s*\(/
    );
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
