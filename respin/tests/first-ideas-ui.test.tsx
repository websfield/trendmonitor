// `/onboarding/first-ideas` — PRD B04 (slice 7, R5).
//
// "Onboarding ends by generating the creator's first three ideas through their
// new brain, so the aha moment happens inside the first session." Slice 3b
// shipped the honest ABSENCE of this — a paragraph on the interview review
// screen saying the step was not part of the product yet — and this suite
// guards what replaced it.
//
// THE THREE PROPERTIES THAT MATTER, and none of them is "it renders":
//
//  1. IT IS THE REAL PIPELINE, priced and debited like anything else. A
//     first-session screen is exactly where "your first one is on us" gets
//     written, and it would be false: D-M2-2's included run is the BRAIN
//     BUILD, not what the brain writes.
//  2. IT REUSES `/studio`'s RENDERER AND `/studio`'s REFUSAL SET. One renderer
//     is what makes R18 hold here without a second assertion, and one derived
//     code set is what stops this screen's population narrowing the day
//     `generate` grows a refusal (CLAUDE.md, 2026-08-29).
//  3. IT COUNTS WHAT CAME BACK. Ideation returns three to FIVE ideas, so
//     "your first three ideas" printed above five of them would be miscounting
//     the thing in front of the reader — and hiding two to make the number
//     match would hide output a creator paid for.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// `@respin/modes` IS NOT IMPORTED, and cannot be: it is not a dependency of the
// root `respin` package, which is the same boundary that denies it to `app/**`
// (R-64). Everything this suite needs about the mode registry arrives through
// `modeOffers`, which is the facade's own answer — so the test reads the modes
// the way the screen does rather than through a door the screen has not got.
// `packages/modes/tests/output.test.ts` and `mode-checks.test.ts` are where the
// SPEC (its required sections, its 3-5 idea count) is pinned.
import {
  ENTITLEMENT_TIERS,
  ONBOARDING_FIRST_IDEAS_MODE,
  modeOffers,
} from "@respin/credits";

/**
 * The B04 mode as the FACADE describes it — id, label and availability.
 *
 * Read once, at module scope, because every case below needs some part of it
 * and because reading it here is what makes the label in the fixture the
 * product's own rather than a string this file typed.
 */
const B04_OFFER = modeOffers("studio").find(
  (m) => m.id === ONBOARDING_FIRST_IDEAS_MODE
);
import {
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";
import {
  GENERATION_SCREEN_DIRS,
  STREAM_SHAPES,
  generationScreenFileCounts,
  shapesMatchingSpecimen,
  streamingViolations,
} from "./support/no-streaming";
import { STUDIO_ERROR_CODES, studioRefusalCopy } from "../app/(product)/studio/copy";
import { DISCLOSURE_FIELD_PREFIX } from "../app/(product)/studio/run-copy";
import type {
  KillTestSummary,
  ScriptDocument,
  StudioRunState,
} from "../app/(product)/studio/run-state";
import * as firstIdeasCopy from "../app/(product)/onboarding/first-ideas/copy";
import {
  FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE,
  FIRST_IDEAS_BUTTON,
  FIRST_IDEAS_INTRO,
  FIRST_IDEAS_NEEDS_BRAIN,
  FIRST_IDEAS_NEXT,
  FIRST_IDEAS_NOT_IN_PLAN,
  FIRST_IDEAS_NO_RESULTS_BASIS,
  FIRST_IDEAS_PAUSED,
  FIRST_IDEAS_PENDING_LABEL,
  FIRST_IDEAS_VIEWER,
  firstIdeasCostSentence,
  firstIdeasCountNote,
  firstIdeasHeading,
} from "../app/(product)/onboarding/first-ideas/copy";
import { FirstIdeasResult } from "../app/(product)/onboarding/first-ideas/first-ideas-result";
import { FirstIdeasPanel } from "../app/(product)/onboarding/first-ideas/first-ideas-panel";
import {
  FirstIdeasView,
  type FirstIdeasViewProps,
} from "../app/(product)/onboarding/first-ideas/first-ideas-view";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function decoded(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The rendered COPY, with React's own machinery removed.
 *
 * React injects an inline `<script>` bootstrap for any `<form>` with a function
 * action, and this screen has one. It is STRIPPED, NOT EXCUSED: the scan exists
 * to read what a CREATOR reads, and a creator does not read React's bootstrap.
 */
function visibleCopy(html: string): string {
  return decoded(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ");
}

function detailsText(markup: string): string {
  return decoded(markup)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Source with every comment form removed, for scans that are about CODE.
 *
 * These files' own docblocks have to be able to explain the rules they obey —
 * `useActionState`'s initial-state constraint, the result states they do not
 * branch on — and a source scan over the prose bans the explanation along with
 * the thing. Every use below asserts the strip is non-vacuous.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const REFUSAL_COPY = studioRefusalCopy();

const IDEAS_DOCUMENT: ScriptDocument = {
  ideas: [
    {
      hook: "The bit of batch cooking nobody films.",
      thesis: "The reheating step is where it fails, not the cooking.",
      framework: "The Confession Arc",
    },
    {
      hook: "I stopped prepping on Sundays.",
      thesis: "Volume was the wrong lever; timing was the right one.",
      framework: "The Reversal",
    },
    {
      hook: "Nine minutes, one pan, one take.",
      thesis: "The constraint is what makes the edit possible.",
      framework: "The Constraint",
    },
  ],
  whyThisPerforms: {
    reasoning: "Each opens on something a viewer can picture in the first second.",
    weakestPoint:
      "The third promises a single take and the footage has to deliver one; if it does not, the opening is a bait.",
  },
  disclosure: {
    platform: "TikTok",
    guidance: "Say in the caption that a tool helped write this before you post it.",
  },
};

const KILL_TEST: KillTestSummary = {
  outcome: "passed",
  attempts: 1,
  rewritten: false,
  creatorRulesScored: true,
  verdicts: [],
  limitNote:
    "Every number, date and name in this draft was checked against your brain and against what you gave this generation. That check is about where a specific came from — it is not about whether it is true.",
  traceability: [],
  claims: [],
};

const USABLE_RUN = {
  status: "usable",
  generationId: "gen-1",
  modeId: ONBOARDING_FIRST_IDEAS_MODE,
  modeLabel: B04_OFFER!.label,
  document: IDEAS_DOCUMENT,
  killTest: KILL_TEST,
  charge: { creditsChargedNow: 4, balanceAfter: 21 },
  // ZERO, NOT `null`: this run really built an offer and really dropped
  // nothing. `null` is the replay/retry answer and is a different fact.
  privateFrameworksNotUsed: 0,
} as const satisfies StudioRunState;

const USABLE: StudioRunState = USABLE_RUN;

/** Five ideas — the top of `MODE_SPECS.ideation`'s 3-5 range, not B04's three. */
const FIVE_IDEAS: StudioRunState = {
  ...USABLE_RUN,
  document: {
    ...IDEAS_DOCUMENT,
    ideas: [
      ...IDEAS_DOCUMENT.ideas!,
      {
        hook: "The pan is the wrong size and that is the whole video.",
        thesis: "Equipment is a cheaper fix than technique.",
        framework: "The Small Correction",
      },
      {
        hook: "I cooked the same meal for eleven days.",
        thesis: "Repetition is the proof, not the joke.",
        framework: "The Log",
      },
    ],
  },
};

const HONEST_REFUSAL: StudioRunState = {
  status: "honest_refusal",
  generationId: "gen-2",
  modeId: ONBOARDING_FIRST_IDEAS_MODE,
  modeLabel: B04_OFFER!.label,
  headline: "Every angle here died on the same rule.",
  why: ["The brain has no point of view on this topic yet."],
  sharperAngle: "Pick the part of it you have actually done and start there.",
  killTest: KILL_TEST,
  charge: { creditsChargedNow: 4, balanceAfter: 21 },
  privateFrameworksNotUsed: 0,
};

const REPLAYED: StudioRunState = {
  status: "replayed",
  generationId: "gen-1",
  modeId: ONBOARDING_FIRST_IDEAS_MODE,
  modeLabel: B04_OFFER!.label,
  outcome: "usable",
  weakestPoint:
    "The third promises a single take and the footage has to deliver one.",
  refusalReason: null,
  balanceAfter: 21,
};

/**
 * EVERY state the result region can be in, so a scan over "the result" is a
 * scan over all of them rather than over the one a fixture happens to build.
 */
const RESULT_STATES: readonly [string, StudioRunState][] = [
  ["a usable batch of three", USABLE],
  ["a usable batch of five", FIVE_IDEAS],
  ["an honest refusal", HONEST_REFUSAL],
  ["a replay", REPLAYED],
  ["a refusal code", { status: "refused", code: "insufficient_credits" }],
];

const baseProps: FirstIdeasViewProps = {
  profileName: "Anna",
  run: {
    action: async () => ({ status: "idle" }) as StudioRunState,
    costSentence: firstIdeasCostSentence(4, 25),
    block: null,
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
  },
  error: null,
  onboardingHref: "/onboarding",
  brainHref: "/brain",
  studioHref: "/studio",
};

const render = (p: Partial<FirstIdeasViewProps> = {}) =>
  renderToStaticMarkup(<FirstIdeasView {...baseProps} {...p} />);

// -------------------------------------------------------------- the mode

describe("B04 runs the mode the requirement names, resolved rather than typed", () => {
  it("`ONBOARDING_FIRST_IDEAS_MODE` is a real mode, and it is BUILT", () => {
    // REQ-C01 mode 7 returns ideas as hook + thesis + framework rather than as
    // topics, which is what makes B04 an "aha" rather than a brainstorm.
    //
    // `available` is `modeOffers`' server-owned plan answer. Slice 8's registry
    // completeness test separately proves that every registry mode is built.
    expect(B04_OFFER, "the B04 mode is not in the registry at all").toBeDefined();
    expect(B04_OFFER!.status).toBe("available");
    // ...and it has a creator-facing name rather than reading as an id.
    expect(B04_OFFER!.label).not.toBe(ONBOARDING_FIRST_IDEAS_MODE);
    expect(B04_OFFER!.label.length).toBeGreaterThan(2);
  });

  it("EVERY tier includes it, which is what makes B04 reachable in a first session", () => {
    // PRD §4G puts Ideas on Free. A step that ended onboarding and then refused
    // the tier that has not paid yet would be an aha moment for nobody.
    for (const tier of ENTITLEMENT_TIERS) {
      const offer = modeOffers(tier).find((m) => m.id === ONBOARDING_FIRST_IDEAS_MODE);
      expect(offer?.status, tier).toBe("available");
    }
  });

  it("the action names the CONSTANT, never the string", () => {
    // `@respin/modes` is denied to `app/**` (R-64), so a literal here would be
    // a `string` nothing checks — invisible to a rename in `MODE_IDS`, and free
    // to name a mode this build does not have.
    const src = read("app/(product)/onboarding/first-ideas/actions.ts")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).toContain("mode: ONBOARDING_FIRST_IDEAS_MODE");
    // THE POPULATION IS EVERY MODE THE REGISTRY HAS, read through the facade —
    // so a seventh mode joins this scan without anybody remembering.
    const everyModeId = modeOffers("studio").map((m) => m.id);
    expect(everyModeId.length).toBeGreaterThan(5);
    for (const id of everyModeId) {
      expect(src, `the action names the mode id '${id}'`).not.toContain(`"${id}"`);
      // NON-VACUITY, per id: the scan really would find a planted literal.
      expect(`const m = "${id}";`).toContain(`"${id}"`);
    }
  });
});

// --------------------------------------------------------------- the money

describe("B04 is priced like anything else, and the screen never says otherwise", () => {
  it("the cost sentence states the price and never invents one", () => {
    expect(firstIdeasCostSentence(4, 25)).toContain("4 credits");
    expect(firstIdeasCostSentence(4, 25)).toContain("25 credits");
    expect(firstIdeasCostSentence(1, 1)).toContain("1 credit");
    expect(firstIdeasCostSentence(0, 3)).toContain("nothing");
    // Non-negotiable 6: an unread price is said, never guessed.
    expect(firstIdeasCostSentence(null, 25)).toMatch(/could not be read/);
    expect(firstIdeasCostSentence(null, 25)).not.toMatch(/costs \d/);
    // A balance that could not be read simply is not claimed.
    expect(firstIdeasCostSentence(4, null)).not.toMatch(/You have/);
  });

  it("it NEVER promises this one is included", () => {
    // D-M2-2's included run is the onboarding BRAIN BUILD. An onboarding screen
    // is where "your first one is on us" writes itself.
    for (const s of [
      firstIdeasCostSentence(4, 25),
      firstIdeasCostSentence(0, 25),
      firstIdeasCostSentence(null, null),
    ]) {
      // THE SAME PATTERN `/studio`'s OWN SCAN USES, and it names the two nouns
      // rather than the word: `included build` and `included run` are the
      // ONBOARDING entitlement (D-M2-2), while "there is no included draft" is
      // the DENIAL, and banning that too would ban the correction along with
      // the error.
      expect(s.toLowerCase()).not.toMatch(/included (run|build)\b/);
      expect(s.toLowerCase()).not.toMatch(/\bfree\b|on us|no charge/);
    }
    // ...and the priced branch CORRECTS the half-memory "something is free"
    // by naming where the first-run rule lives — WITHOUT asserting that rule's
    // price, which is a number this file cannot read (billing gate,
    // 2026-09-02: the clause used to say the brain build is "given away",
    // which is false under any document that prices `onboardingBrainBuild`
    // above zero — the same frozen assumption `/onboarding` was carrying).
    expect(firstIdeasCostSentence(4, 25)).toMatch(/there is no included draft/i);
    expect(firstIdeasCostSentence(4, 25)).toMatch(
      /only run this product prices as a creator's first is the brain build/i
    );
    for (const s of [
      firstIdeasCostSentence(4, 25),
      firstIdeasCostSentence(1, 1),
    ]) {
      expect(
        s.toLowerCase(),
        "this screen states another screen's price rule as a fact"
      ).not.toMatch(/gives away|included build|included run|is included/);
    }
  });

  it("the page prices through the OPERATION'S own rule, not by indexing config", () => {
    const src = read("app/(product)/onboarding/first-ideas/page.tsx");
    expect(src).toMatch(/priceOf\(/);
    expect(src).toMatch(/generationOp\(ONBOARDING_FIRST_IDEAS_MODE, false\)/);
    expect(
      src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""),
      "the page indexes creditCosts itself"
    ).not.toMatch(/creditCosts\./);
  });
});

// ------------------------------------------------------- one shared renderer

describe("B04 reuses /studio's renderer and /studio's refusal set", () => {
  it("the result region renders `GenerationOutcome`, so R18 holds without a second copy", () => {
    // "Why this performs names the weakest point on every mode" is a property
    // of that component. A B04 screen with its own result markup would be
    // exactly the second place a weakest point goes missing.
    const result = read("app/(product)/onboarding/first-ideas/first-ideas-result.tsx");
    expect(result).toContain('from "../../studio/generation-outcome"');
    expect(result).toContain("<GenerationOutcome");
    // ...and neither file holds result markup of its own.
    for (const rel of [
      "app/(product)/onboarding/first-ideas/first-ideas-result.tsx",
      "app/(product)/onboarding/first-ideas/first-ideas-panel.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(
        /data-testid="first-ideas-(ideas|weakest|charge)"/
      );
    }
  });

  it("the result region is OUTSIDE the client panel, so a test can drive it", () => {
    // THE DEFECT THIS PINS (learning-honesty gate, 2026-09-01). The heading,
    // the count note and `FIRST_IDEAS_NEXT` were rendered INSIDE
    // `FirstIdeasPanel`, which holds `useActionState`; that yields only its
    // INITIAL state under `renderToStaticMarkup`, so the suite's own
    // "the RESULT state" case was rendering the idle form and scanning it
    // twice. `/studio` learned this in the same slice — `LineageList` and
    // `FeedbackBlock` were extracted for exactly this reason (R-72).
    const panel = read("app/(product)/onboarding/first-ideas/first-ideas-panel.tsx");
    expect(panel).toContain("<FirstIdeasResult");
    // The panel holds NO branch on a result state of its own: every such
    // branch is a state nothing can render.
    const panelCode = stripComments(panel);
    expect(panelCode).not.toMatch(/state\.status === "(usable|honest_refusal|replayed)"/);
    // NON-VACUITY: that pattern really does catch the shape that was there.
    expect(
      /state\.status === "(usable|honest_refusal|replayed)"/.test(
        '{state.status === "usable" ? <p>next</p> : null}'
      )
    ).toBe(true);
    // ...and the result component takes its state as a PROP, which is what
    // makes every one of those states reachable from a fixture.
    const result = read("app/(product)/onboarding/first-ideas/first-ideas-result.tsx");
    // COMMENTS STRIPPED: this file's own docblock has to be able to explain
    // the `useActionState` constraint it exists to satisfy, and a source scan
    // over the prose would ban the explanation along with the call.
    const resultCode = stripComments(result);
    expect(resultCode).not.toContain("useActionState");
    // NON-VACUITY: the strip really does leave a live call behind.
    expect(
      stripComments("// useActionState\nconst [s] = useActionState(a, b);")
    ).toContain("useActionState");
    expect(result).toMatch(/state: StudioRunState/);
  });

  it("the page reuses `/studio`'s DERIVED refusal set rather than writing a second one", () => {
    // This screen calls the SAME operation, so the classes it can receive are
    // the same classes — and `tests/studio-ui.test.tsx` derives that set from
    // the spend path's own source. A second closed set here would be a second
    // population, narrower by construction the day `generate` grows a refusal.
    const src = read("app/(product)/onboarding/first-ideas/page.tsx");
    expect(src).toContain('from "../../studio/copy"');
    expect(src).toContain("studioRefusalCopy()");
    expect(src).toContain("studioErrorFor(");
    // ...and there is no rival list in this directory.
    for (const rel of [
      "app/(product)/onboarding/first-ideas/copy.ts",
      "app/(product)/onboarding/first-ideas/page.tsx",
      "app/(product)/onboarding/first-ideas/first-ideas-view.tsx",
      "app/(product)/onboarding/first-ideas/first-ideas-panel.tsx",
      "app/(product)/onboarding/first-ideas/first-ideas-result.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/ERROR_CODES\s*=\s*\[/);
    }
    // NON-VACUITY: the set it borrows is real and substantial.
    expect(STUDIO_ERROR_CODES.length).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------- what it renders

describe("what the screen shows", () => {
  /**
   * THE RESULT REGION, RENDERED DIRECTLY.
   *
   * `useActionState` yields only its INITIAL state under
   * `renderToStaticMarkup`, so a result reached through `FirstIdeasView` would
   * be a state no test could drive — the rule `generation-outcome.tsx` records
   * and `lineage-view.tsx` was extracted for. `FirstIdeasResult` is this
   * screen's half of that rule: it takes the state as a PROP, wraps `/studio`'s
   * `GenerationOutcome` unchanged (which is what makes R18 hold here without a
   * second copy of it) and adds B04's count heading.
   */
  const withRun = (latest: StudioRunState) =>
    decoded(
      renderToStaticMarkup(
        <FirstIdeasResult
          state={latest}
          refusalCopy={REFUSAL_COPY}
          fallbackCopy={REFUSAL_COPY.unknown}
        />
      )
    );

  it("the heading COUNTS what came back, and B04's three is a floor not a promise", () => {
    expect(firstIdeasHeading(3)).toBe("Your first three ideas");
    expect(firstIdeasHeading(5)).toBe("Your first 5 ideas");
    expect(firstIdeasHeading(1)).toBe("Your first idea");
    expect(firstIdeasHeading(0)).toMatch(/No ideas came back/);
    // NOTHING IS HIDDEN TO MAKE THE NUMBER MATCH: five ideas are five ideas,
    // and the note says so rather than the screen dropping two.
    expect(firstIdeasCountNote(3)).toBe("");
    expect(firstIdeasCountNote(5)).toMatch(/All of them are below/);
    expect(firstIdeasCountNote(5)).toMatch(/none is held back/i);
  });

  it("...and that count is ON THE SCREEN, over the ideas it counts", () => {
    // THE DEFECT THIS CLOSES (learning-honesty gate, 2026-09-01). Both
    // functions above were UNREACHABLE: no file in `app/**` imported either,
    // so the honesty control B04 needs — "three is a floor, and none of the
    // five is held back" — existed on no screen while this describe block,
    // titled "what the screen shows", asserted it. Inventory presented as
    // coverage. They are rendered now, so the assertions above are about the
    // product rather than about two exported functions.
    const three = withRun(USABLE);
    expect(three).toContain('data-testid="first-ideas-heading"');
    expect(three).toContain(firstIdeasHeading(3));
    // At B04's three there is no count note, because there is nothing to
    // explain — the empty string is rendered as nothing, not as an empty tag.
    expect(three).not.toContain('data-testid="first-ideas-count-note"');

    const five = withRun(FIVE_IDEAS);
    expect(five).toContain(firstIdeasHeading(5));
    expect(five).toContain('data-testid="first-ideas-count-note"');
    expect(five).toContain(firstIdeasCountNote(5));
    // ...and all five ideas are below it. The number in the heading and the
    // number of ideas on the page are the same number.
    const ideas = FIVE_IDEAS.status === "usable" ? FIVE_IDEAS.document.ideas! : [];
    expect(ideas.length).toBe(5);
    for (const idea of ideas) expect(five).toContain(idea.hook);

    // NO HEADING ON A STATE THAT CARRIES NO IDEAS: an honest refusal has no
    // draft at all, so "No ideas came back" over it would be a count of
    // something that was never counted.
    expect(withRun(HONEST_REFUSAL)).not.toContain(
      'data-testid="first-ideas-heading"'
    );
  });

  it("all THREE fields of every idea render — hook, thesis and framework", () => {
    // REQ-C01 mode 7: never a list of topics. A view that showed the opening
    // line alone would turn the output back into topics on its way to the page.
    const html = withRun(USABLE);
    for (const idea of IDEAS_DOCUMENT.ideas!) {
      expect(html).toContain(idea.hook);
      expect(html).toContain(idea.thesis);
      expect(html).toContain(idea.framework);
    }
    expect(html).toContain('data-testid="studio-ideas"');
  });

  it("the weakest point renders beside the reasoning (R18)", () => {
    const html = withRun(USABLE);
    expect(html).toContain('data-testid="studio-weakest-point"');
    expect(html).toContain(IDEAS_DOCUMENT.whyThisPerforms.weakestPoint);
  });

  it("the charge is reported, because this is a real run", () => {
    const html = withRun(USABLE);
    expect(html).toContain('data-testid="studio-charge"');
    expect(html).toContain("That cost 4 credits.");
  });

  it("uses Studio's exact four-row disclosure fixture without losing creator offers", () => {
    const html = withRun({
      ...USABLE_RUN,
      killTest: {
        ...KILL_TEST,
        traceability: [
          { kind: "number", enforcement: "flag", token: "5", field: "/ideas/0/hook", unit: "Five steps." },
          { kind: "proper_noun", enforcement: "flag", token: "Dorset", field: "/ideas/1/hook", unit: "Filmed in Dorset." },
          { kind: "proper_noun", enforcement: "flag", token: "TikTok", field: "/disclosure/platform", unit: "TikTok policy." },
          { kind: "proper_noun", enforcement: "flag", token: "AI", field: "/disclosure/guidance", unit: "AI guidance." },
        ],
      },
    });
    const traceability = html.match(
      /<ul data-testid="studio-traceability">[\s\S]*?<\/ul>/
    )?.[0] ?? "";
    expect(traceability).not.toBe("");
    expect(traceability.split('data-testid="studio-check-offer"').length - 1).toBe(2);
    expect(traceability).toContain("5 [check]");
    expect(traceability).toContain("Dorset [check]");
    expect(traceability).not.toContain("TikTok [check]");
    expect(traceability).not.toContain("AI [check]");
    expect(html).toContain(
      "2 other specifics were not found either — a plain number or a name, where an ordinary word can land, so these are a prompt to look, never a fault."
    );
    expect(html.match(/Any disclosure guidance is written by the product/g)).toHaveLength(1);
    expect(html).toContain("names, numbers and dates are not listed here");
    expect(html).toContain("recall aid, not a complete check.");
  });

  it("keeps a hard disclosure row and withholds an all-disclosure list", () => {
    const hard = withRun({
      ...USABLE_RUN,
      killTest: {
        ...KILL_TEST,
        traceability: [
          {
            kind: "currency",
            enforcement: "hard",
            token: "$4,000",
            field: `${DISCLOSURE_FIELD_PREFIX}guidance`,
            unit: "Within the first 3 seconds.",
          },
        ],
      },
    });
    expect(hard).toContain("$4,000 [check]");
    expect(hard).toContain("1 amount or date is");
    expect(hard.match(/Any disclosure guidance is written by the product/g)).toHaveLength(1);

    const allDisclosure = withRun({
      ...USABLE_RUN,
      killTest: {
        ...KILL_TEST,
        traceability: [
          {
            kind: "proper_noun",
            enforcement: "flag",
            token: "AI",
            field: `${DISCLOSURE_FIELD_PREFIX}guidance`,
            unit: "AI guidance.",
          },
        ],
      },
    });
    expect(allDisclosure).not.toContain('data-testid="studio-traceability"');
    expect(allDisclosure).toContain(
      "Every number, date and name outside the disclosure guidance in this draft was found in your brain or in what you typed in."
    );
    expect(allDisclosure).not.toContain("Every name in this draft was found");
    expect(allDisclosure.match(/Any disclosure guidance is written by the product/g)).toHaveLength(1);
  });

  it("EVERY gate has its own sentence, and they say different things", () => {
    const reasons = [
      FIRST_IDEAS_VIEWER,
      FIRST_IDEAS_PAUSED,
      FIRST_IDEAS_NOT_IN_PLAN,
      FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE,
      FIRST_IDEAS_NEEDS_BRAIN,
    ];
    expect(new Set(reasons).size, "two gates share one sentence").toBe(reasons.length);
    for (const reason of reasons) {
      const html = render({ run: { ...baseProps.run!, block: { reason } } });
      expect(html).toContain('data-testid="first-ideas-blocked"');
      expect(decoded(html)).toContain(reason);
      // ...and the spend control is genuinely gone, not merely styled away.
      expect(html).not.toContain('name="input"');
    }
    expect(FIRST_IDEAS_NOT_IN_PLAN).toMatch(/plan does not include/i);
    // R15: neither sells anything.
    for (const reason of reasons) {
      expect(reason.toLowerCase()).not.toMatch(/upgrad|subscribe|a plan that includes/);
    }
  });

  it("names a failed brain-state read and gives the same reload remedy", () => {
    const html = render({
      run: {
        ...baseProps.run!,
        block: { reason: FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE },
      },
    });
    expect(html).toContain("brain state could not be read");
    expect(decoded(html)).toContain("Reload this page.");
  });

  it("the gate ORDER matches the operation's — role, pause, plan, brain", () => {
    // The sentence a creator reads before pressing and the refusal they would
    // get for pressing must say the same thing: a viewer on a Free plan is told
    // about their access, not about the plan.
    const src = read("app/(product)/onboarding/first-ideas/page.tsx");
    // SLICED TO THE BLOCK CHAIN ITSELF, because `paused` and `tier` are also
    // READ earlier in the file — an index over the whole source would be
    // measuring the read order, not the refusal order.
    const chain = src.slice(src.indexOf("const block:"));
    expect(chain.length, "the block chain is not where this expects").toBeGreaterThan(
      200
    );
    const order = [
      'scope.role === "viewer"',
      "paused",
      '"not_in_plan"',
      "!brainActivated",
    ].map((needle) => chain.indexOf(needle));
    expect(order.every((i) => i >= 0), "a gate is missing from the block chain").toBe(
      true
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("no creator profile is a NAMED state, not an error", () => {
    const html = render({ profileName: null, run: null });
    expect(html).toContain('data-testid="first-ideas-no-profile"');
    expect(html).toContain('href="/onboarding"');
    expect(html).not.toContain('name="input"');
  });

  it("a `?e=` code renders as an alert with the studio's own words", () => {
    const html = render({
      error: {
        title: REFUSAL_COPY.brain_not_activated.title,
        detail: REFUSAL_COPY.brain_not_activated.detail,
      },
    });
    expect(html).toContain('data-testid="first-ideas-action-error"');
    expect(html).toContain('role="alert"');
  });
});

describe("Phase 1 T7: first-ideas pre-form prose folds without hiding honesty", () => {
  it("uses one native fold and renders an injected honest refusal outside it", () => {
    const killTest = {
      ...KILL_TEST,
      traceability: [
        { kind: "proper_noun", enforcement: "flag" as const, token: "Dorset", field: "/ideas/0/hook", unit: "Filmed in Dorset." },
      ],
      claims: [
        { family: "concealment" as const, enforcement: "flag" as const, token: "skip the label", field: "/disclosure/guidance", unit: "Most people skip the label." },
      ],
    };
    const html = renderToStaticMarkup(
      <FirstIdeasPanel
        {...baseProps.run!}
        initialState={{ ...HONEST_REFUSAL, killTest }}
      />
    );
    const details = html.match(/<details[\s\S]*?<\/details>/g) ?? [];
    expect(details).toHaveLength(1);
    const folded = details[0] ?? "";
    expect(folded).toContain("How this works and what it costs");
    expect(folded).toContain('data-testid="first-ideas-intro"');
    expect(folded).not.toContain(" open=");
    expect(detailsText(folded)).toBe(
      "How this works and what it costs This is the first thing the product makes for this creator. It runs on the brain you confirmed and activated — the same brain every later draft uses — and it comes back as ideas rather than as topics: each one has an opening line, the point it makes, and the framework it is built on."
    );
    expect([...folded.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "first-ideas-intro",
    ]);
    for (const testId of [
      "first-ideas-cost",
      "first-ideas-no-results-basis",
      "first-ideas-no-stream",
      "first-ideas-status",
      "studio-honest-refusal",
      "studio-refusal-why",
      "studio-sharper-angle",
      "studio-kill-test",
      "studio-traceability-heading",
      "studio-traceability",
      "studio-traceability-note",
      "studio-claims",
      "studio-disclosure-provenance",
      "studio-charge",
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
      expect(folded).not.toContain(`data-testid="${testId}"`);
    }
  });

  it("keeps an injected usable result whole outside the fold", () => {
    const html = renderToStaticMarkup(
      <FirstIdeasPanel
        {...baseProps.run!}
        initialState={{
          ...USABLE_RUN,
          killTest: {
            ...KILL_TEST,
            traceability: [
              { kind: "proper_noun", enforcement: "flag", token: "Dorset", field: "/ideas/0/hook", unit: "Filmed in Dorset." },
            ],
            claims: [
              { family: "concealment", enforcement: "flag", token: "skip the label", field: "/disclosure/guidance", unit: "Most people skip the label." },
            ],
          },
        }}
      />
    );
    const folded = html.match(/<details[\s\S]*?<\/details>/)?.[0] ?? "";
    expect((html.match(/<details[\s\S]*?<\/details>/g) ?? [])).toHaveLength(1);
    expect(folded).toContain("How this works and what it costs");
    expect(folded).not.toContain(" open=");
    expect(detailsText(folded)).toBe(
      "How this works and what it costs This is the first thing the product makes for this creator. It runs on the brain you confirmed and activated — the same brain every later draft uses — and it comes back as ideas rather than as topics: each one has an opening line, the point it makes, and the framework it is built on."
    );
    expect([...folded.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "first-ideas-intro",
    ]);
    for (const testId of [
      "studio-ideas",
      "studio-weakest-point",
      "studio-disclosure",
      "studio-kill-test",
      "studio-check-legend",
      "studio-traceability-heading",
      "studio-traceability",
      "studio-traceability-note",
      "studio-claims",
      "studio-disclosure-provenance",
      "studio-charge",
      "first-ideas-next",
      "first-ideas-cost",
      "first-ideas-no-results-basis",
      "first-ideas-no-stream",
      "first-ideas-status",
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
      expect(folded).not.toContain(`data-testid="${testId}"`);
    }
  });
});

// ------------------------------------------------------------ R16 and R21

describe("R16/R21: it does not stream, and it claims no evidence about the creator", () => {
  it("the busy label says PREPARED, and the note says nothing streams", () => {
    const html = decoded(render());
    expect(html).toContain('data-testid="first-ideas-no-stream"');
    expect(html).toMatch(/nothing appears until/i);
    expect(html).toMatch(/part-written draft is never shown/i);
    const src = read("app/(product)/onboarding/first-ideas/first-ideas-panel.tsx");
    expect(src).toContain("pendingLabel={FIRST_IDEAS_PENDING_LABEL}");
  });

  it("NO progress element, NO percentage and NO placeholder — the SHARED six shapes", () => {
    // WHAT THIS SCAN USED TO BE, and why it is worth recording (spin-compliance
    // gate, 2026-09-01). It read ONE of this directory's five files
    // (`first-ideas-panel.tsx`) and covered THREE of the six shapes — no
    // `skeleton`, no `shimmer`, no live-generation vocabulary — with no
    // non-vacuity assertion at all. `/studio`'s scan had all six over its whole
    // directory. Both trees were clean, so nothing was broken; but a `skeleton`
    // class or a "writing your ideas" label added to `first-ideas-view.tsx`
    // would have shipped green, because this screen was NOT IN THE POPULATION
    // of the guard that actually enforces R16 (CLAUDE.md, 2026-08-29).
    //
    // The shapes, the specimen and the population now live in
    // `tests/support/no-streaming.ts` and are shared with `/studio`, so the two
    // screens cannot drift apart again.
    expect(GENERATION_SCREEN_DIRS).toContain(
      "app/(product)/onboarding/first-ideas"
    );
    expect(
      shapesMatchingSpecimen(),
      "a shape's pattern matches nothing, so the scan is broken"
    ).toEqual(STREAM_SHAPES.map(([label]) => label));
    // EVERY file of this screen, not one: five today, and a sixth joins by
    // being written rather than by being remembered.
    expect(
      generationScreenFileCounts(ROOT)["app/(product)/onboarding/first-ideas"]
    ).toBeGreaterThanOrEqual(5);
    expect(streamingViolations(ROOT)).toEqual([]);
  });

  it("the n = 0 statement is unconditional on a creator's FIRST output", () => {
    // This is the moment a creator most naturally assumes the product knows
    // them, and it holds no result of theirs at all.
    const html = decoded(render());
    expect(html).toContain('data-testid="first-ideas-no-results-basis"');
    expect(html).toMatch(/No results of yours have been logged/i);
    expect(html).toMatch(/not measuring you/i);
  });

  it("every rendered state claims nothing this product cannot support", () => {
    const STATES: [string, Partial<FirstIdeasViewProps>][] = [
      ["the form", {}],
      ["no profile", { profileName: null, run: null }],
      [
        "blocked on a brain",
        { run: { ...baseProps.run!, block: { reason: FIRST_IDEAS_NEEDS_BRAIN } } },
      ],
      [
        "brain history unreadable",
        {
          run: {
            ...baseProps.run!,
            block: { reason: FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE },
          },
        },
      ],
      [
        "blocked on a plan",
        { run: { ...baseProps.run!, block: { reason: FIRST_IDEAS_NOT_IN_PLAN } } },
      ],
      [
        "price unknown",
        {
          run: {
            ...baseProps.run!,
            costSentence: firstIdeasCostSentence(null, null),
          },
        },
      ],
      [
        "a refusal code",
        {
          error: {
            title: REFUSAL_COPY.insufficient_credits.title,
            detail: REFUSAL_COPY.insufficient_credits.detail,
          },
        },
      ],
    ];
    for (const [label, props] of STATES) {
      const text = visibleCopy(render(props)).toLowerCase();
      expect(claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), label).toEqual([]);
    }
  });

  /**
   * THE TEST THAT USED TO BE HERE WAS VACUOUS, and this is the third such
   * finding in this slice (learning-honesty gate, 2026-09-01).
   *
   * It was titled "...and the RESULT state does not either" and rendered
   * `FirstIdeasView` with `action: async () => USABLE`. `FirstIdeasPanel` holds
   * `useActionState(action, IDLE)`, which yields only its INITIAL state under
   * `renderToStaticMarkup` — the fact this file's own docblock states one
   * describe up — so it scanned the IDLE FORM, character for character the same
   * text as the case above it, and reported it as the result state. Nothing
   * about a result was ever measured: `FIRST_IDEAS_NEXT`, the heading and the
   * count note were read by no honesty scan in any state.
   *
   * The result region is now a pure component and every state is DRIVEN.
   */
  const renderResult = (state: StudioRunState) =>
    renderToStaticMarkup(
      <FirstIdeasResult
        state={state}
        refusalCopy={REFUSAL_COPY}
        fallbackCopy={REFUSAL_COPY.unknown}
      />
    );

  it("...and every RESULT state does not either — driven, not merely titled", () => {
    for (const [label, state] of RESULT_STATES) {
      const text = visibleCopy(renderResult(state)).toLowerCase();
      // NON-VACUITY PER STATE: an empty render passes every ban trivially, and
      // that is exactly how the previous version of this test passed.
      expect(text.length, `${label}: nothing rendered`).toBeGreaterThan(80);
      expect(claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), label).toEqual([]);
    }
    // ...and the result really does carry the paragraph that only a usable run
    // renders, so this is a scan over the result and not over an empty tag.
    expect(renderResult(USABLE)).toContain('data-testid="first-ideas-next"');
  });

  it("EVERY exported sentence of this screen is scanned, as a VALUE", () => {
    // THE POPULATION IS THE COPY MODULE'S OWN EXPORTS, derived at runtime.
    //
    // A render scan can only read the states a fixture drives, and this suite
    // had one that drove none of them. Reading the module instead means a new
    // sentence cannot be added to this screen without either being scanned or
    // turning this test red — which is `tests/studio-ui.test.tsx`'s treatment
    // of `FEEDBACK_TODAY` applied to the whole module rather than to the one
    // constant somebody remembered.
    const EVERY_SENTENCE: Record<string, string[]> = {
      FIRST_IDEAS_INTRO: [FIRST_IDEAS_INTRO],
      FIRST_IDEAS_BUTTON: [FIRST_IDEAS_BUTTON],
      FIRST_IDEAS_PENDING_LABEL: [FIRST_IDEAS_PENDING_LABEL],
      FIRST_IDEAS_NEXT: [FIRST_IDEAS_NEXT],
      FIRST_IDEAS_NO_RESULTS_BASIS: [FIRST_IDEAS_NO_RESULTS_BASIS],
      FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE: [FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE],
      FIRST_IDEAS_NEEDS_BRAIN: [FIRST_IDEAS_NEEDS_BRAIN],
      FIRST_IDEAS_NOT_IN_PLAN: [FIRST_IDEAS_NOT_IN_PLAN],
      FIRST_IDEAS_VIEWER: [FIRST_IDEAS_VIEWER],
      FIRST_IDEAS_PAUSED: [FIRST_IDEAS_PAUSED],
      // The three functions are scanned over EVERY branch they have, because a
      // branch is a sentence a creator can read.
      firstIdeasCostSentence: [
        firstIdeasCostSentence(4, 25),
        firstIdeasCostSentence(1, 1),
        firstIdeasCostSentence(0, 3),
        firstIdeasCostSentence(null, 25),
        firstIdeasCostSentence(4, null),
        firstIdeasCostSentence(null, null),
      ],
      firstIdeasHeading: [0, 1, 2, 3, 4, 5].map(firstIdeasHeading),
      firstIdeasCountNote: [0, 3, 4, 5].map(firstIdeasCountNote),
    };
    expect(
      Object.keys(EVERY_SENTENCE).sort(),
      "an export of first-ideas/copy.ts is read by no honesty scan"
    ).toEqual(Object.keys(firstIdeasCopy).sort());
    for (const [name, values] of Object.entries(EVERY_SENTENCE)) {
      for (const value of values) {
        expect(claimHits(value, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), name).toEqual([]);
      }
    }
    // NON-VACUITY: the registry holds real sentences, not empty strings.
    expect(
      Object.values(EVERY_SENTENCE)
        .flat()
        .join(" ").length
    ).toBeGreaterThan(2000);
  });

  it("NON-VACUITY: every banned claim's specimen matches its own pattern", () => {
    for (const [label, specimen] of specimensFor(FORBIDDEN_CLAIMS)) {
      expect(claimHits(specimen, FORBIDDEN_CLAIMS), label).toContain(label);
    }
    // ...and the scan reads REAL copy rather than an empty string.
    expect(visibleCopy(render()).length).toBeGreaterThan(300);
  });
});

// ------------------------------------------------- the handoff is reachable

describe("the step is REACHABLE — B04's absence is replaced, not merely built", () => {
  it("the interview review screen links here instead of naming an absence", () => {
    // Slice 3b's paragraph said "creating your first three ideas in Studio is
    // not part of this product yet". It is now, and the `data-testid` is
    // unchanged so the assertion that watched the absence now watches what
    // replaced it rather than going missing with the sentence.
    const src = read("app/(product)/onboarding/interview/interview-view.tsx");
    expect(src).toContain('href="/onboarding/first-ideas"');
    expect(src).toContain('data-testid="interview-b04-absence"');
    expect(src).not.toContain("is not part of this product yet");
  });

  it("the onboarding page links here too", () => {
    const src = read("app/(product)/onboarding/onboarding-view.tsx");
    expect(src).toContain('href="/onboarding/first-ideas"');
    expect(src).toContain('data-testid="first-ideas-link"');
  });

  it("the URL is under a PROTECTED prefix, so the page inherits the gate", () => {
    // `/onboarding` is already a `PROTECTED_PREFIX`, so this page gets the
    // middleware redirect and the gate-completeness suite's demand for
    // `requireUser()` without anybody having to remember to add one — the hole
    // `findUngatedGroupFiles` exists to catch.
    const page = read("app/(product)/onboarding/first-ideas/page.tsx");
    expect(page).toMatch(/import \{ requireUser \} from "@respin\/auth"/);
    expect(page).toMatch(/await requireUser\(\)/);
    const actions = read("app/(product)/onboarding/first-ideas/actions.ts");
    expect(actions).toMatch(/await requireUser\(\)/);
  });
});
