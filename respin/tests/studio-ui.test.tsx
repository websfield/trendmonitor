// `/studio` — the generation surface (slice 6, stage D).
//
// THE SCREEN THIS SUITE GUARDS IS THE FIRST ONE THAT HANDS A CREATOR SOMETHING
// TO PUBLISH, and it takes a credit every time. Three of its requirements are
// honesty requirements with no natural failure mode — nothing crashes if the
// screen quietly stops saying what it cannot know — so most of what follows is
// written to fail when a sentence goes missing rather than when code throws.
//
// FOUR MECHANISMS, in the order they matter:
//
//  1. THE REFUSAL-CODE SET IS DERIVED FROM THE SPEND PATH, not remembered. The
//     population is a LIST (`STUDIO_SPEND_PATH_SOURCES`) and adding a file to
//     it is what a new spend path costs — CLAUDE.md, 2026-08-29, whose defect
//     shipped three times because a population written as one path narrowed
//     silently the day a second appeared.
//  2. THE HONESTY SCAN RUNS OVER THIS SCREEN'S REAL COPY — every rendered
//     state AND every refusal code it can emit — against the shared canon plus
//     `PERFORMANCE_CLAIMS`, which slice 6 added because nothing in the canon
//     stopped a screen from promising an audience.
//  3. `/studio` LEFT `NOT_BUILT_YET`, and the removal is PAID FOR. A word
//     leaving a ban is indistinguishable from a weakened guard (R-38), so the
//     three bans are replaced by `STUDIO_POSITIVE_ASSERTIONS` — markers the
//     screen must render, with patterns their text must match. The card names
//     this as a hazard no mutation can reach; these are the assertions.
//  4. THE TIER→MODE MAP IS NOT COPIED HERE. R18's authority is
//     `packages/credits/src/mode-access.ts`, and a source scan asserts this
//     directory does not enumerate the other six modes.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  NOT_BUILT_YET,
  PERFORMANCE_CLAIMS,
  STUDIO_POSITIVE_ASSERTIONS,
} from "./support/forbidden-claims";
import {
  GENERATION_SCREEN_DIRS,
  STREAM_SHAPES,
  STREAM_SPECIMEN,
  generationOutcomeImporters,
  generationScreenFileCounts,
  generationScreenFiles,
  shapesMatchingSpecimen,
  streamingViolations,
  unlistedGenerationScreenFiles,
} from "./support/no-streaming";
import {
  BILLING_ERROR_COPY,
  CODE_FOR_ERROR_CLASS,
  ERROR_CLASS_COVERED_BY_BASE,
  INSTANCE_BRANCH_CODES,
} from "../app/(product)/billing-errors";
import {
  STUDIO_ERROR_CODES,
  generateBlock,
  studioErrorFor,
  studioRefusalCopy,
} from "../app/(product)/studio/copy";
import {
  NO_RESULTS_BASIS,
  NO_STREAM_NOTE,
  PLATFORM_OPTIONS,
  PREPARING_LABEL,
  FEEDBACK_HEADING,
  FEEDBACK_TODAY,
  LINEAGE_SCOPE_NOTE,
  REVISION_NOTE_HELP,
  REVISION_SAME_MODE_NOTE,
  checkOffer,
  claimFamilyNote,
  feedbackNoteLimit,
  feedbackRecordedSentence,
  frameworksNotUsedSentence,
  lineageChoiceLabel,
  reactionLabel,
  claimsHeading,
  creatorRulesSentence,
  generateChargeSentence,
  generateCostSentence,
  killTestSentence,
  lineageLineFor,
  priceLineFor,
  modeAvailabilityNote,
  replayChargeSentence,
  revisionCostSentence,
  traceabilityFlagNote,
  traceabilityHeading,
  whyThisPerformsView,
  type ModeChoiceView,
} from "../app/(product)/studio/run-copy";
import {
  LINEAGE_VIEW_MAX,
  studioActionStateFor,
  studioStateFor,
} from "../app/(product)/studio/projection";
import { GenerationOutcome } from "../app/(product)/studio/generation-outcome";
import { LineageList } from "../app/(product)/studio/lineage-view";
import { FeedbackBlock } from "../app/(product)/studio/feedback-block";
import { StudioView, type StudioViewProps } from "../app/(product)/studio/studio-view";
import { GENERATION_FEEDBACK_REACTIONS, FEEDBACK_NOTE_MAX } from "@respin/db";
import type {
  ClaimFlag,
  FeedbackState,
  KillTestSummary,
  LineageEntry,
  ScriptDocument,
  StudioActionState,
  StudioRunState,
} from "../app/(product)/studio/run-state";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO_DIR = join(ROOT, "app", "(product)", "studio");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Every TypeScript file under a package's own `src`, walked rather than listed.
 *
 * Package `src` only, and never `node_modules`: a pnpm workspace symlinks its
 * dependencies into each package, and following those would walk the whole
 * store. The one property this population has to have is that a NEW package
 * joins it without anyone remembering to add it, which a directory read gives
 * and a literal list does not (CLAUDE.md 2026-08-29).
 */
function packageSrcFiles(): string[] {
  const base = join(ROOT, "packages");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push(full);
    }
  };
  for (const pkg of readdirSync(base)) {
    const src = join(base, pkg, "src");
    try {
      if (statSync(src).isDirectory()) walk(src);
    } catch {
      // a package with no `src` is not an error, it is a package with no src.
    }
  }
  return out;
}

/**
 * Source with `//` and block comments blanked, so a scan for CALLS is not
 * satisfied by prose ABOUT the call. Blanked rather than removed, so nothing
 * downstream depends on offsets staying put.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function studioSourceFiles(dir: string = STUDIO_DIR, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) studioSourceFiles(full, acc);
    else if (/\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

/**
 * The rendered COPY, with React's own machinery removed.
 *
 * React injects an inline `<script>` bootstrap for any `<form>` with a function
 * action, and this screen has one. It is STRIPPED, NOT EXCUSED: the scan exists
 * to read what a CREATOR reads, and a creator does not read React's bootstrap.
 * Two probes below prove the strip is that narrow.
 */
function visibleCopy(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

/**
 * The rendered markup with React's HTML entities decoded back to text.
 *
 * WHY IT IS NEEDED AND WHY IT IS NARROW. `renderToStaticMarkup` escapes `'` to
 * `&#x27;`, so `expect(html).toContain(killTestSentence(...))` fails on every
 * sentence with an apostrophe in it — which is most of this screen's. Asserting
 * against the escaped form instead would pin the ESCAPING rather than the
 * sentence, so the five entities React actually emits are decoded and nothing
 * else is: this is not an HTML parser and must not become one.
 */
function decoded(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------- fixtures

const REFUSAL_COPY = studioRefusalCopy();

const KILL_TEST: KillTestSummary = {
  outcome: "passed",
  attempts: 1,
  rewritten: false,
  creatorRulesScored: true,
  verdicts: [{ ruleId: "r1", passed: true, note: "It opens on a thing, not an adjective." }],
  limitNote:
    "Every number, date and name in this draft was checked against your brain and against what you gave this generation. That check is about where a specific came from — it is not about whether it is true. An ordinary word or a common name can be flagged even when nothing is wrong with it, which is why the product offers a [check] marker instead of changing your words.",
  traceability: [
    {
      kind: "number",
      enforcement: "hard",
      token: "412",
      field: "/hooks/0/text",
      unit: "It took 412 takes to get this right",
    },
    {
      kind: "proper_noun",
      enforcement: "flag",
      token: "Dorset",
      field: "/hooks/1/text",
      unit: "Filmed in Dorset on a Tuesday",
    },
  ],
  // EMPTY ON THE SHARED FIXTURE, DELIBERATELY — AND THE REASON IS NARROWER
  // THAN IT WAS (learning honesty gate round 2, 2026-09-01). A `performance` or
  // `certainty` finding's `token` IS a banned word by construction, so a shared
  // fixture carrying one would put "views" into the very render the honesty
  // scan reads and turn a correct report into a false positive. That does NOT
  // hold for `concealment`, whose tokens are disclosure advice ("skip the
  // label") and match nothing in the canon — and `concealment` is the family
  // the claims block was added to make reachable at all. So the exemption is
  // measured rather than blanket: `CONCEALMENT` below is a real fixture, and
  // the R20/R21 outcome scan renders it and scans it like any other state.
  claims: [],
};

/**
 * THE HOOK-SET DOCUMENT, as slice 7 projects it.
 *
 * Slice 6's fixture spread the sections onto the state itself; slice 7 moved
 * them under `document`, because one renderer now serves six modes and a
 * per-mode shape on the state is a per-mode renderer waiting to happen.
 */
const HOOKS_DOCUMENT: ScriptDocument = {
  hooks: [
    { text: "It took 412 takes to get this right.", mechanic: "confession" },
    { text: "Filmed in Dorset on a Tuesday.", mechanic: "place-anchor" },
    { text: "The thing nobody says out loud about this.", mechanic: "withheld" },
  ],
  whyThisPerforms: {
    reasoning: "Each hook opens on something a viewer can picture in the first second.",
    weakestPoint:
      "The third hook promises a secret and the body has to deliver one; if it does not, the opening is a bait.",
  },
  disclosure: {
    platform: "TikTok",
    guidance: "Mark this as a paid partnership in the app before you post it.",
  },
};

const USABLE: StudioRunState = {
  status: "usable",
  generationId: "gen-1",
  modeId: "hooks",
  modeLabel: "Hooks",
  document: HOOKS_DOCUMENT,
  killTest: KILL_TEST,
  charge: { creditsChargedNow: 5, balanceAfter: 20 },
  // ZERO, NOT `null`: this run built an offer and everything fitted. The
  // drop case has its own fixture beside the R17 cases below.
  privateFrameworksNotUsed: 0,
};

/** A usable state carrying a different document — one helper, six modes. */
const usableWith = (document: ScriptDocument, modeLabel = "Hooks"): StudioRunState => ({
  ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
  modeLabel,
  document,
});

/** The universal half every mode's document carries (R18). */
const UNIVERSAL: Pick<ScriptDocument, "whyThisPerforms" | "disclosure"> = {
  whyThisPerforms: HOOKS_DOCUMENT.whyThisPerforms,
  disclosure: HOOKS_DOCUMENT.disclosure,
};

/**
 * A FLAG-LEVEL CONCEALMENT FINDING — module-scope so BOTH the block's own
 * render test and the R20/R21 honesty scan can use the same one.
 *
 * `/disclosure/guidance` is the field that made this family matter: `runKillTest`
 * scans the product's own disclosure advice, and a sentence telling a creator to
 * leave the label off is the one finding that must reach them. Its `token` and
 * `unit` are ordinary English rather than a banned word, which is what lets the
 * honesty scan read this state's render (see `KILL_TEST.claims`).
 */
const CONCEALMENT: ClaimFlag = {
  family: "concealment",
  enforcement: "flag",
  token: "skip the label",
  field: "/disclosure/guidance",
  unit: "Most people skip the label on a short like this.",
};

/**
 * Claim findings with the given FIELDS, per enforcement.
 *
 * Fields rather than counts, because that is what `claimsHeading` counts: two
 * findings on ONE field are one line to the creator, and passing counts is the
 * arithmetic the fix removed from the call site.
 */
const claimsOn = (hardFields: string[], flagFields: string[]): ClaimFlag[] => [
  ...hardFields.map((field) => ({
    family: "certainty",
    enforcement: "hard" as const,
    token: "t",
    field,
    unit: "u",
  })),
  ...flagFields.map((field) => ({
    family: "concealment",
    enforcement: "flag" as const,
    token: "t",
    field,
    unit: "u",
  })),
];

const HONEST_REFUSAL: StudioRunState = {
  status: "honest_refusal",
  generationId: "gen-2",
  modeId: "hooks",
  modeLabel: "Hooks",
  headline: "Everything died on the hard rules.",
  why: [
    "Three fragments in a row, twice.",
    "A number that is in neither your brain nor what you typed in.",
  ],
  sharperAngle:
    "Try the angle your own material already supports — a smaller claim you can show.",
  killTest: { ...KILL_TEST, outcome: "failed", attempts: 2, rewritten: true },
  charge: { creditsChargedNow: 5, balanceAfter: 15 },
  privateFrameworksNotUsed: 0,
};

/**
 * THE MODE PICKER'S DATA, as the SERVER produces it.
 *
 * All seven available — the paid-tier shape `modeOffers(tier)` produces after
 * Slice 8 made Spin reachable. It is written out here
 * rather than imported from `@respin/credits` because these are VIEW fixtures:
 * the agreement between `modeOffers` and `assertModeAllowed` is asserted in
 * `packages/credits/tests/mode-access.test.ts`, against the real map.
 */
const MODES: ModeChoiceView[] = [
  { id: "m-a", label: "Footage to thesis", status: "available", cost: 12 },
  { id: "m-b", label: "Idea to script", status: "available", cost: 12 },
  { id: "m-c", label: "Source to reel", status: "available", cost: 12 },
  { id: "m-d", label: "Analyse and spin", status: "available", cost: 12 },
  { id: "m-e", label: "Hooks", status: "available", cost: 5 },
  { id: "m-f", label: "Caption", status: "available", cost: 2 },
  { id: "m-g", label: "Ideation", status: "available", cost: 4 },
];

/** Free's shape: three modes and four outside the plan. */
const FREE_MODES: ModeChoiceView[] = [
  { id: "m-a", label: "Footage to thesis", status: "not_in_plan", cost: null },
  { id: "m-b", label: "Idea to script", status: "not_in_plan", cost: null },
  { id: "m-c", label: "Source to reel", status: "not_in_plan", cost: null },
  { id: "m-d", label: "Analyse and spin", status: "not_in_plan", cost: null },
  { id: "m-e", label: "Hooks", status: "available", cost: 5 },
  { id: "m-f", label: "Caption", status: "available", cost: 2 },
  { id: "m-g", label: "Ideation", status: "available", cost: 4 },
];

const baseView: StudioViewProps = {
  profileName: "Anna",
  run: {
    action: async () => IDLE_ACTION_STATE,
    feedbackAction: async () => ({ status: "idle" }) as const,
    modes: MODES,
    costSentence: generateCostSentence(MODES, 25),
    revisionCostSentence: revisionCostSentence(2),
    revisionCost: 2,
    reactions: GENERATION_FEEDBACK_REACTIONS,
    noteMax: FEEDBACK_NOTE_MAX,
    block: null,
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
  },
  error: null,
  onboardingHref: "/onboarding",
  brainHref: "/brain",
  usageHref: "/usage",
  frameworksHref: "/studio/frameworks",
};

const IDLE_ACTION_STATE: StudioActionState = {
  lineage: [],
  latest: { status: "idle" },
};

const renderView = (p: Partial<StudioViewProps> = {}) =>
  renderToStaticMarkup(<StudioView {...baseView} {...p} />);

const renderOutcome = (state: StudioRunState) =>
  renderToStaticMarkup(
    <GenerationOutcome
      state={state}
      refusalCopy={REFUSAL_COPY}
      fallbackCopy={REFUSAL_COPY.unknown}
    />
  );

// ------------------------------------------------------ the pure decisions

describe("the pure decisions", () => {
  it("generateCostSentence states EVERY offered mode's price and never invents one", () => {
    const one: ModeChoiceView[] = [
      { id: "m-e", label: "Hooks", status: "available", cost: 5 },
    ];
    expect(generateCostSentence(one, 25)).toBe(
      "Hooks costs 5 credits, every time — there is no included draft. You have 25 credits."
    );
    // SLICE 7's REAL CHANGE: the selection lives in the browser and this
    // sentence is rendered on the server, so a control that showed ONE price
    // would show the wrong one most of the time.
    const many = generateCostSentence(MODES, 25);
    for (const mode of MODES.filter((m) => m.status === "available")) {
      expect(many, mode.label).toContain(`${mode.label} costs`);
    }
    // ...and a mode the plan excludes gets no price tag on this screen: a
    // refusal is not a sales surface (R15).
    expect(generateCostSentence(FREE_MODES, 25)).not.toContain("Idea to script");
    expect(
      generateCostSentence(
        [{ id: "m-e", label: "Hooks", status: "available", cost: 1 }],
        1
      )
    ).toContain("1 credit, every time");
    // A FAILED READ SAYS SO. Non-negotiable 6: no number is invented, and the
    // sentence still tells the reader the server prices it before spending.
    const unread: ModeChoiceView[] = [
      { id: "m-e", label: "Hooks", status: "available", cost: null },
    ];
    expect(generateCostSentence(unread, 25)).toMatch(/could not be read/);
    expect(generateCostSentence(unread, 25)).not.toMatch(/costs \d+/);
    // A balance that could not be read simply is not claimed.
    expect(generateCostSentence(one, null)).not.toMatch(/You have/);
    // NO OFFERED MODE AT ALL is a named answer, never an empty sentence.
    expect(generateCostSentence(FREE_MODES.map((m) => ({ ...m, status: "not_in_plan" as const })), 3)).toMatch(
      /no mode available/i
    );
  });

  it("revisionCostSentence prices a revision AS a revision (R8)", () => {
    // R8's whole content: `creditCosts.revision`, never the parent mode's key.
    // The screen states that rule in words as well as printing the number, so a
    // creator revising a 12-credit script knows the press is priced at 2.
    expect(revisionCostSentence(2)).toContain("2 credits");
    expect(revisionCostSentence(2)).toMatch(/whichever mode it revises/i);
    expect(revisionCostSentence(2)).toMatch(
      /not at the price of the draft it came from/i
    );
    expect(revisionCostSentence(1)).toContain("1 credit,");
    expect(revisionCostSentence(0)).toContain("nothing");
    // Non-negotiable 6 again: an unread price is said, never guessed.
    expect(revisionCostSentence(null)).toMatch(/could not be read/);
    expect(revisionCostSentence(null)).not.toMatch(/\d+ credit/);
  });

  it("modeAvailabilityNote reports all paid modes and Free's plan exclusions without a sale", () => {
    const note = modeAvailabilityNote(MODES);
    expect(note).toMatch(/Every mode this product has is one of them/);
    expect(note).not.toMatch(/not built|not part of/i);

    const free = modeAvailabilityNote(FREE_MODES);
    expect(free).toMatch(/not part of this workspace's plan/i);
    expect(free).toContain("Idea to script");
    // R15: no sale, on either sentence.
    for (const text of [note, free]) {
      for (const inducement of ["upgrade", "subscribe", "a plan that includes"]) {
        expect(text.toLowerCase(), inducement).not.toContain(inducement);
      }
    }
    // EVERYTHING OFFERED is its own honest sentence rather than an awkward tail.
    const all = modeAvailabilityNote(
      MODES.map((m) => ({ ...m, status: "available" as const }))
    );
    expect(all).toMatch(/Every mode this product has is one of them/);
    expect(all).not.toMatch(/not built|not part of/i);
  });

  it("generateCostSentence NEVER repeats the voice screen's 'first one is included' rule", () => {
    // `priceOf` prices a generation by its mode EVERY time — D-M2-2's free
    // build is a property of the onboarding brain, not of the product's
    // output. The onboarding sentence copied here would promise a free draft.
    for (const s of [
      generateCostSentence(MODES, 25),
      generateCostSentence(
        MODES.map((m) => ({ ...m, cost: m.cost === null ? null : 0 })),
        25
      ),
      generateCostSentence(MODES.map((m) => ({ ...m, cost: null })), null),
      revisionCostSentence(2),
      revisionCostSentence(null),
    ]) {
      expect(s.toLowerCase()).not.toMatch(/first (run|draft) .{0,20}is included/);
      expect(s.toLowerCase()).not.toMatch(/included build/);
    }
  });

  it("generateChargeSentence reports the real charge; zero is an answer, not an absence", () => {
    expect(generateChargeSentence(5, 20)).toContain("That cost 5 credits.");
    expect(generateChargeSentence(5, 20)).toContain("Your balance is now 20 credits.");
    expect(generateChargeSentence(0, 20)).toContain(
      "Nothing was taken from your credit balance"
    );
    expect(generateChargeSentence(1, 1)).toContain("1 credit.");
  });

  it("replayChargeSentence says nothing extra was spent", () => {
    expect(replayChargeSentence(12)).toMatch(/nothing extra was spent/i);
    expect(replayChargeSentence(12)).toContain("12 credits");
  });

  it("killTestSentence tells the three outcomes apart, and names the ONE rewrite", () => {
    expect(killTestSentence("passed", 1)).toMatch(/passed .*first attempt/i);
    const rewritten = killTestSentence("passed_after_rewrite", 2);
    expect(rewritten).toMatch(/rewritten once/i);
    // R6's bound, said to the reader: there is no second rewrite.
    expect(rewritten).toMatch(/only one|no second/i);
    expect(killTestSentence("failed", 2)).toMatch(/no draft to show/i);
    // The three are genuinely different sentences.
    expect(new Set([
      killTestSentence("passed", 1),
      killTestSentence("passed_after_rewrite", 2),
      killTestSentence("failed", 2),
    ]).size).toBe(3);
  });

  it("creatorRulesSentence never lets 'not scored' read as 'passed'", () => {
    const unscored = creatorRulesSentence(false, 0);
    expect(unscored).toMatch(/not the same as saying they passed/i);
    expect(unscored.toLowerCase()).not.toMatch(/all passed|every criterion passed/);
    expect(creatorRulesSentence(true, 0)).toMatch(/nothing to report/i);
    // A scored verdict is labelled ADVISORY — it is a model's opinion of the
    // creator's own criteria, not a check the product enforces (R5).
    expect(creatorRulesSentence(true, 3)).toMatch(/advisory/i);
    // THE SINGULAR CASE AGREES WITH ITSELF. "1 kill-test criterion were scored"
    // is what a switched noun beside a fixed verb produces, and it shipped —
    // nothing failed, because no assertion had ever read the sentence for n = 1
    // (found by rendering it, 2026-09-01).
    expect(creatorRulesSentence(true, 1)).toContain("1 kill-test criterion was scored");
    expect(creatorRulesSentence(true, 2)).toContain("2 kill-test criteria were scored");
    expect(creatorRulesSentence(true, 1)).not.toMatch(/criterion were/);
  });

  it("traceabilityHeading splits by ENFORCEMENT, and no longer by kind", () => {
    expect(traceabilityHeading(0, 0)).toMatch(/found in your brain or in what you typed/i);
    const hardOnly = traceabilityHeading(2, 0);
    // THE HARD BUCKET IS THE MARKED QUANTITIES — `currency`, `percent`,
    // `multiplier`, `iso-date`, `month-date` — and nothing else.
    expect(hardOnly).toMatch(/amounts or dates/i);
    expect(hardOnly).toMatch(/price, a percentage, a multiplier or a calendar date/i);
    const flagOnly = traceabilityHeading(0, 1);
    // The flag branch must say it is a prompt to look, never a fault.
    expect(flagOnly).toMatch(/never a fault/i);
    // THE REGRESSION THIS TEST EXISTS FOR. `traceability.ts` demoted
    // `plain-number` to `flag` and made `/disclosure/` flag-only whatever the
    // shape, so the flag bucket is no longer "names". The old copy said
    // "1 name was not found" about the number `5`.
    expect(flagOnly).not.toMatch(/\bnames? (was|were)\b/i);
    expect(flagOnly).toMatch(/a plain number, a name, or something in the disclosure guidance/i);
    // The hard branch never borrows the soft bucket's excuse.
    expect(hardOnly).not.toMatch(/prompt to look/i);
    // BOTH branches promise the draft was not changed (R19, mutation M9's UI
    // half).
    for (const s of [hardOnly, flagOnly, traceabilityHeading(1, 1)]) {
      expect(s).toMatch(/Nothing was changed in your draft/);
      expect(s).toContain("[check]");
    }
    // Singular and plural are real branches, not one sentence with an `s`.
    expect(traceabilityHeading(1, 0)).toMatch(/1 amount or date is/);
    expect(traceabilityHeading(0, 1)).toMatch(/1 other specific was/);
    expect(traceabilityHeading(0, 2)).toMatch(/2 other specifics were/);
  });

  it("traceabilityFlagNote says what the finding ACTUALLY is — all four branches", () => {
    // `enforcementFor` in `@respin/modes` flags for exactly two reasons: a soft
    // SHAPE, or a flag-only FIELD prefix. The field wins, because it overrides
    // the shape — so it is tested first and with a `kind` that would otherwise
    // take a different branch.
    const disclosure = traceabilityFlagNote("date", "/disclosure/guidance");
    expect(disclosure).toMatch(/disclosure guidance, which the product wrote/i);
    expect(traceabilityFlagNote("proper_noun", "/disclosure/guidance")).toBe(disclosure);
    // A NAME outside disclosure keeps the sentence that was always right.
    expect(traceabilityFlagNote("proper_noun", "/hooks/0/text")).toMatch(
      /a name, not a rule violation/i
    );
    // A PLAIN NUMBER is not a name, and this is the sentence the screen used to
    // get wrong: it printed "(a name…)" beside the number `5`.
    const number = traceabilityFlagNote("number", "/hooks/0/text");
    expect(number).toMatch(/a plain number/i);
    expect(number).not.toMatch(/\ba name\b/i);
    // AN UNKNOWN KIND falls back to the neutral sentence rather than a guess.
    const unknown = traceabilityFlagNote("something-new", "/hooks/0/text");
    expect(unknown).toMatch(/not a rule violation/i);
    expect(unknown).not.toMatch(/\ba name\b|plain number|disclosure/i);
    // Every branch says the same thing about fault, which is the property the
    // split exists to preserve.
    for (const note of [disclosure, number, unknown, traceabilityFlagNote("proper_noun", "/x")]) {
      expect(note).toMatch(/not a rule violation|never a rule violation|only asks you to look/i);
    }
  });

  it("generateBlock refuses in priority order and never claims to be the enforcement", () => {
    expect(
      generateBlock({ isViewer: false, paused: false, brainActivated: true })
    ).toBeNull();
    expect(
      generateBlock({ isViewer: true, paused: true, brainActivated: false })!.reason
    ).toMatch(/viewer access/i);
    expect(
      generateBlock({ isViewer: false, paused: true, brainActivated: false })!.reason
    ).toMatch(/paused/i);
    expect(
      generateBlock({ isViewer: false, paused: false, brainActivated: false })!.reason
    ).toMatch(/activated brain/i);
  });
});

// ------------------------------------------------- R20: the weakest point

describe("R20/REQ-I04: 'why this performs' always names its weakest point", () => {
  it("whyThisPerformsView returns the pair when the weakest point is stated", () => {
    const v = whyThisPerformsView({ reasoning: "R", weakestPoint: "W" });
    expect(v).toEqual({ ok: true, reasoning: "R", weakestPoint: "W" });
  });

  it("...and WITHHOLDS the reasoning when it is not — the false branch, DRIVEN", () => {
    // CLAUDE.md, 2026-08-26: a required field reads exactly like a guard and is
    // not one until a test drives its false branch. Blank AND whitespace-only,
    // because `.min(1)` upstream would pass a single space.
    for (const weakestPoint of ["", "   ", "\n\t"]) {
      const v = whyThisPerformsView({ reasoning: "R", weakestPoint });
      expect(v.ok, JSON.stringify(weakestPoint)).toBe(false);
      expect(JSON.stringify(v)).not.toContain("R");
    }
  });

  it("the SCREEN withholds it too — the reasoning never renders alone", () => {
    const html = renderOutcome(
      usableWith({
        ...HOOKS_DOCUMENT,
        whyThisPerforms: { reasoning: "SECRET_REASONING", weakestPoint: " " },
      })
    );
    expect(html).toContain('data-testid="studio-why-withheld"');
    expect(html).not.toContain("SECRET_REASONING");
    expect(html).not.toContain('data-testid="studio-weakest-point"');
    // ...and with a real weakest point, BOTH halves render.
    const good = renderOutcome(USABLE);
    expect(good).toContain('data-testid="studio-weakest-point"');
    expect(good).toContain("the body has to deliver one");
  });
});

// --------------------------------------------- R19: traceability, not edits

describe("R19/REQ-I03: the traceability scan flags and offers [check], never edits", () => {
  it("the flagged token still appears in the draft, byte for byte", () => {
    const html = renderOutcome(USABLE);
    // Mutation M9's UI half: a screen that 'helpfully' stripped or rewrote the
    // flagged specific would corrupt the creator's draft on a false positive.
    expect(html).toContain("It took 412 takes to get this right.");
    expect(html).toContain("Filmed in Dorset on a Tuesday.");
  });

  it("the [check] offer is ADDITIVE and sits beside the token, not in it", () => {
    expect(checkOffer("412")).toBe("412 [check]");
    const html = renderOutcome(USABLE);
    expect(html).toContain('data-testid="studio-check-offer"');
    expect(html).toContain("412 [check]");
    // The hook text itself carries no marker.
    expect(html).not.toContain("It took 412 [check] takes");
  });

  it("a flag-only finding is not presented as a rule violation", () => {
    const html = renderOutcome(USABLE);
    expect(html).toMatch(/a name, not a rule violation/);
  });

  it("the RENDERED note matches the finding — a number is not called a name", () => {
    // THE MUTATION THAT SURVIVED WITHOUT THIS TEST (measured, 2026-09-01):
    // replacing `{traceabilityFlagNote(f.kind, f.field)}` with the old fixed
    // sentence left 94 tests green, because the only flagged finding in the
    // shared fixture is a PROPER NOUN — for which the wrong sentence happens to
    // be right. The pure function had all four branches driven and the SCREEN
    // had one, which is the gap the hand-off named.
    const html = decoded(
      renderOutcome({
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        killTest: {
          ...KILL_TEST,
          traceability: [
            {
              kind: "number",
              enforcement: "flag",
              token: "5",
              field: "/hooks/0/text",
              unit: "The 5 mistakes that make batch cooking taste like leftovers",
            },
            {
              kind: "date",
              enforcement: "flag",
              token: "2026-01-01",
              field: "/disclosure/guidance",
              unit: "Rules changed on 2026-01-01.",
            },
            {
              kind: "proper_noun",
              enforcement: "flag",
              token: "Dorset",
              field: "/hooks/1/text",
              unit: "Filmed in Dorset on a Tuesday",
            },
          ],
        },
      })
    );
    // Each finding gets ITS OWN sentence, and all three are on the page.
    expect(html).toContain(traceabilityFlagNote("number", "/hooks/0/text"));
    expect(html).toContain(traceabilityFlagNote("date", "/disclosure/guidance"));
    expect(html).toContain(traceabilityFlagNote("proper_noun", "/hooks/1/text"));
    // THE REGRESSION, ASSERTED AS A COUNT rather than as an absence: the "name"
    // sentence appears exactly ONCE, beside the one finding that is a name. A
    // fixed sentence prints it three times.
    const names = html.split("a name, not a rule violation").length - 1;
    expect(names, "the name sentence is printed for a non-name finding").toBe(1);
  });

  it("the LIMIT sentence comes from the operation, and app/** holds no copy of it", () => {
    const html = renderOutcome(USABLE);
    expect(html).toContain('data-testid="studio-traceability-note"');
    expect(html).toContain("it is not about whether it is true");
    // THE HALF THAT MATTERS: the sentence is `TRACEABILITY_LIMIT_NOTE`, owned by
    // `@respin/modes` beside the scan it describes and stored on every
    // generation. A copy of it in `app/**` would be a description of a control
    // maintained apart from the control, free to go stale the day the scan
    // changes — so no studio source file may contain it.
    const distinctive = "it is not about whether it is true";
    for (const file of studioSourceFiles()) {
      expect(readFileSync(file, "utf8"), file).not.toContain(distinctive);
    }
    // NON-VACUITY: the phrase really is what the fixture carries, so the loop
    // above is scanning for a string that would actually be found if copied.
    expect(KILL_TEST.limitNote).toContain(distinctive);
  });

  it("with no findings at all, the screen says the specifics were traced", () => {
    const html = renderOutcome({
      ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
      killTest: { ...KILL_TEST, traceability: [] },
    } as StudioRunState);
    expect(html).toMatch(/found in your brain or in what you typed in/i);
    expect(html).not.toContain('data-testid="studio-check-offer"');
  });
});

// --------------------------------------- REQ-C03: the honest refusal renders

describe("REQ-C03: an honest refusal is an outcome, not an error", () => {
  it("it shows why, a sharper angle, the charge — and NOT the draft that died", () => {
    const html = renderOutcome(HONEST_REFUSAL);
    expect(html).toContain('data-testid="studio-honest-refusal"');
    expect(html).toContain("Everything died on the hard rules.");
    expect(html).toContain('data-testid="studio-sharper-angle"');
    expect(html).toContain("Three fragments in a row, twice.");
    // It WAS charged (the slice card's question-4 table) and says so.
    expect(html).toContain("That cost 5 credits.");
    expect(html).toMatch(/An honest refusal is the product working/);
    // No draft. `GenerationRun`'s refused branch carries no output at all.
    expect(html).not.toContain('data-testid="studio-hooks"');
  });

  it("it is a status region, not an alert — a refusal code is the alert", () => {
    expect(renderOutcome(HONEST_REFUSAL)).toContain('role="status"');
    expect(renderOutcome({ status: "refused", code: "insufficient_credits" })).toContain(
      'role="alert"'
    );
  });
});

// ------------------- REQ-I04/REQ-I05: the claim findings, MADE REACHABLE

describe("REQ-I04/REQ-I05: what the draft says about itself reaches the creator", () => {
  /**
   * THE HALF THAT WAS STORED AND UNREACHABLE.
   *
   * `runKillTest` scans the model's OWN text for performance forecasts,
   * certainty promises and concealment advice, and writes every finding to
   * `generations.kill_test`. The hard-enforced ones reach a creator through the
   * refusal's `why`; the flag-level ones reached nobody — including a
   * concealment sentence sitting in the disclosure guidance this screen renders
   * as the product's advice. A capability nothing can reach is not done.
   */
  const withClaims = (claims: ClaimFlag[]) =>
    renderOutcome({
      ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
      killTest: { ...KILL_TEST, claims },
    });

  it("a flag-level concealment finding is RENDERED, phrase and all", () => {
    const html = decoded(withClaims([CONCEALMENT]));
    expect(html).toContain('data-testid="studio-claims"');
    expect(html).toContain("skip the label");
    // The LINE, not just the matched words — a creator has to be able to find
    // it in the draft above.
    expect(html).toContain("Most people skip the label on a short like this.");
    expect(html).toContain(claimFamilyNote("concealment"));
    // ...AND IT SURVIVES `visibleCopy`, which is the form the R20/R21 outcome
    // scan reads. Without this line the new scan row could be scanning markup
    // the strip had already emptied — a green scan over nothing.
    expect(visibleCopy(withClaims([CONCEALMENT])).toLowerCase()).toContain(
      "skip the label"
    );
  });

  it("...and the block is ABSENT rather than empty when nothing was found", () => {
    // The false branch, driven: an empty findings list must not render a
    // heading promising findings.
    const html = withClaims([]);
    expect(html).not.toContain('data-testid="studio-claims"');
    expect(html).not.toContain("What the draft says about itself");
    expect(claimsHeading([])).toBe("");
  });

  it("every family `@respin/modes` can emit has its own sentence", () => {
    // THE POPULATION IS `ClaimFamily`, and this is what makes a family added
    // there a visible gap here instead of a silent fallback. The three are
    // genuinely different sentences, not one with a word swapped.
    const notes = ["performance", "certainty", "concealment"].map(claimFamilyNote);
    expect(new Set(notes).size).toBe(3);
    expect(claimFamilyNote("performance")).toMatch(/no result of yours has been logged/i);
    expect(claimFamilyNote("certainty")).toMatch(/does not make about anything/i);
    expect(claimFamilyNote("concealment")).toMatch(/does not tell you to leave that out/i);
    // An unknown family gets the neutral sentence, never one of the three.
    const unknown = claimFamilyNote("a-family-from-a-later-slice");
    expect(notes).not.toContain(unknown);
    expect(unknown).toMatch(/cannot stand behind/i);
  });

  it("the hard and flag counts say DIFFERENT things about the draft", () => {
    // A hard claim is why a draft was stopped; a flag is a line the creator may
    // keep. Printing one sentence for both would tell someone reading a usable
    // draft that it had been refused.
    const hard = claimsHeading(claimsOn(["/whyThisPerforms/reasoning"], []));
    const flag = claimsHeading(claimsOn([], ["/hooks/0/text"]));
    expect(hard).toMatch(/what the draft was stopped over/i);
    expect(flag).not.toMatch(/stopped/i);
    expect(flag).toMatch(/cannot stand behind/i);
    // Both promise the draft was unchanged — the same R19 rule the traceability
    // heading carries, because neither scan ever edits.
    const mixed = claimsHeading(
      claimsOn(
        ["/whyThisPerforms/reasoning", "/whyThisPerforms/weakestPoint"],
        ["/hooks/0/text", "/hooks/1/text", "/disclosure/guidance"]
      )
    );
    for (const h of [hard, flag, mixed]) {
      expect(h).toMatch(/Nothing was changed in your draft/);
    }
    expect(mixed).toMatch(/2 lines/);
    expect(mixed).toMatch(/3 lines/);
  });

  it("LINES ARE FIELDS: one sentence matching two shapes reads as ONE line", () => {
    // THE DEFECT, BOTH DIRECTIONS (gate round 2, 2026-09-01). The counts used to
    // be `claims.filter(...).length` at the call site, so a single concealment
    // sentence carrying two banned shapes told the creator there were "2 lines"
    // and sent them looking for a second one that does not exist. The same
    // wrong-count shape `honestRefusal` fixed for its "N places" one level down,
    // and `@respin/modes` adding shapes to a family is what makes it ordinary
    // rather than exotic.
    const oneLineTwoShapes = claimsOn([], [
      "/disclosure/guidance",
      "/disclosure/guidance",
    ]);
    expect(claimsHeading(oneLineTwoShapes)).toMatch(/\b1 line\b/);
    expect(claimsHeading(oneLineTwoShapes)).not.toMatch(/2 lines/);
    // ...and the sentence agrees with itself: one line "makes" a claim.
    expect(claimsHeading(oneLineTwoShapes)).toMatch(/makes a claim/);

    // THE OTHER DIRECTION, which is what stops "always say one" passing: two
    // genuinely separate sentences still read as two.
    const twoLines = claimsOn([], ["/disclosure/guidance", "/hooks/0/text"]);
    expect(claimsHeading(twoLines)).toMatch(/2 lines/);
    expect(claimsHeading(twoLines)).toMatch(/make a claim/);

    // ...and the hard bucket counts the same way, on its own axis: two findings
    // in one explanation field are one line, and the two buckets do not pool.
    const hardSameField = claimsOn(
      ["/whyThisPerforms/reasoning", "/whyThisPerforms/reasoning"],
      ["/whyThisPerforms/reasoning"]
    );
    expect(claimsHeading(hardSameField)).toMatch(/\b1 line in the explanation\b/);
    expect(claimsHeading(hardSameField)).toMatch(/\b1 line in this draft\b/);
    expect(claimsHeading(hardSameField)).not.toMatch(/2 lines/);
  });

  it("the block's OWN copy is canon-clean, scanned as strings", () => {
    // THE PRODUCT'S OWN WORDS, scanned as strings because the render scan
    // cannot reach them all: for a `performance` or `certainty` finding the
    // `token` IS a banned word by construction, so a fixture carrying one would
    // put "views" into the render the honesty scan reads and turn a correct
    // report into a false positive. That structural impossibility is what this
    // string scan pays for, and it covers exactly two of the three families.
    //
    // IT DOES NOT COVER `concealment`, AND THAT FAMILY IS RENDER-SCANNED
    // INSTEAD (learning honesty gate round 2, 2026-09-01). Executed against
    // `FORBIDDEN_CLAIMS ∪ PERFORMANCE_CLAIMS`, neither "skip the label" nor
    // "Most people skip the label on a short like this." matches anything — so
    // the blanket exemption was wider than its own justification, on the one
    // family this whole block exists to make reachable. `CONCEALMENT` is now a
    // state in the R20/R21 outcome scan below, which renders it and scans the
    // markup. What is scanned HERE is the heading and the four family
    // sentences, which is precisely the population the canon governs; a quoted
    // phrase is evidence being reported, not a claim being made.
    const ours = [
      claimsHeading(claimsOn(["/whyThisPerforms/reasoning"], [])),
      claimsHeading(claimsOn([], ["/hooks/0/text"])),
      claimsHeading(
        claimsOn(
          ["/whyThisPerforms/reasoning", "/whyThisPerforms/weakestPoint"],
          ["/hooks/0/text", "/hooks/1/text", "/disclosure/guidance"]
        )
      ),
      claimFamilyNote("performance"),
      claimFamilyNote("certainty"),
      claimFamilyNote("concealment"),
      claimFamilyNote("unknown"),
      "What the draft says about itself",
    ];
    for (const text of ours) {
      for (const [label, re] of [...FORBIDDEN_CLAIMS, ...PERFORMANCE_CLAIMS]) {
        expect(text.toLowerCase(), `"${label}" in /studio's own claims copy`).not.toMatch(re);
      }
    }
    // NON-VACUITY: the same loop catches a planted sentence, so a scan over an
    // accidentally-empty list would be visible.
    expect(
      [...FORBIDDEN_CLAIMS, ...PERFORMANCE_CLAIMS].some(([, re]) =>
        re.test("this one will get more views, guaranteed")
      )
    ).toBe(true);
  });

});

// ------------------------------ REQ-C03/R7: the kill test's verdict, RENDERED

describe("the kill test's own verdict reaches the screen", () => {
  /**
   * THE AXIS THE POSITIVE ASSERTIONS HAD NO CONTENT WITNESS FOR (learning
   * honesty gate, 2026-09-01).
   *
   * `killTestSentence`'s three outcomes were asserted as a PURE FUNCTION and
   * nowhere else, and the marker assertion that was supposed to cover the
   * rendered half was pointed at the block's static heading. So the whole of
   * "the screen shows what the kill test decided" — the one thing R7 says a
   * creator must be able to inspect — rested on a `<h3>`. This drives the
   * sentence through the real component, per outcome.
   */
  const summaryFor = (outcome: string, attempts: number): KillTestSummary => ({
    ...KILL_TEST,
    outcome,
    attempts,
    rewritten: outcome === "passed_after_rewrite",
  });

  it.each([
    ["passed", 1],
    ["passed_after_rewrite", 2],
  ] as const)("a usable draft renders killTestSentence(%s) verbatim", (outcome, n) => {
    const html = renderOutcome({
      ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
      killTest: summaryFor(outcome, n),
    });
    // VERBATIM, not paraphrased: the screen renders the function's output, so
    // deleting the line or swapping in a static string fails here.
    expect(decoded(html)).toContain(killTestSentence(outcome, n));
    expect(html).toContain('data-testid="studio-kill-test-outcome"');
  });

  it("an honest refusal renders the FAILED sentence, which the other two never say", () => {
    const html = renderOutcome({
      ...(HONEST_REFUSAL as Extract<StudioRunState, { status: "honest_refusal" }>),
      killTest: summaryFor("failed", 2),
    });
    expect(decoded(html)).toContain(killTestSentence("failed", 2));
    // The three are genuinely distinguishable ON SCREEN, not only as strings:
    // neither of the passing sentences appears on a refusal.
    expect(decoded(html)).not.toContain(killTestSentence("passed", 1));
    expect(decoded(html)).not.toContain(killTestSentence("passed_after_rewrite", 2));
  });

  it("the creator's own verdicts and the advisory label render beside it", () => {
    // R5's split, on screen: the product's hard rules are a verdict, the
    // creator's own criteria are a model's ADVISORY opinion, and the screen may
    // not let a reader mistake one for the other.
    const html = renderOutcome(USABLE);
    expect(decoded(html)).toContain(
      creatorRulesSentence(true, KILL_TEST.verdicts.length)
    );
    expect(html).toMatch(/advisory/i);
    expect(html).toContain("It opens on a thing, not an adjective.");
  });
});

// ------------------------------------------------------ R14c: the replay

describe("R14c: a replayed attempt says nothing was called and nothing charged", () => {
  const replayed: StudioRunState = {
    status: "replayed",
    generationId: "gen-3",
    modeId: "hooks",
    modeLabel: "Hooks",
    outcome: "usable",
    weakestPoint: "The claim in hook two needs a source.",
    refusalReason: null,
    balanceAfter: 20,
  };

  it("renders the charge line, the stored weakest point, and no re-parsed draft", () => {
    const html = renderOutcome(replayed);
    expect(html).toContain('data-testid="studio-replayed"');
    expect(html).toMatch(/nothing was called and nothing extra was spent/i);
    expect(html).toContain("The claim in hook two needs a source.");
    expect(html).toContain('data-testid="studio-charge"');
    // The document is NOT re-rendered from jsonb, and the screen says so
    // instead of leaving a blank where a draft would be.
    expect(html).toMatch(/not shown again here/i);
  });

  it("a BLANK stored weakest point is withheld, label and all — the false branch, DRIVEN", () => {
    // CLAUDE.md, 2026-08-26. The gate on this branch was `state.weakestPoint ?`
    // — truthiness — and `weakestPoint` is `string | null` read back from a
    // stored `generations` row, so a single space rendered
    // `<strong>The weakest point of that draft:</strong>` above nothing at all.
    // That is a label promising the reader a weakest point they cannot read, on
    // the replay path, where the fresh path (`whyThisPerformsView`) withholds
    // the pair outright. Deleting the `.trim()` left 84 tests green until this
    // one existed.
    for (const weakestPoint of ["", " ", "\n\t", null]) {
      const html = renderOutcome({ ...replayed, weakestPoint } as StudioRunState);
      expect(html, JSON.stringify(weakestPoint)).not.toContain(
        'data-testid="studio-weakest-point"'
      );
      expect(html, JSON.stringify(weakestPoint)).not.toContain(
        "The weakest point of that draft:"
      );
    }
    // ...and a real one still renders, so the guard is not simply an absence.
    expect(renderOutcome(replayed)).toContain("The claim in hook two needs a source.");
  });
});

// --------------------------------------------- the projection off the facade

describe("R17: the creator is told when their OWN frameworks did not fit", () => {
  // THE GAP THIS CLOSES (slice 7 cross-boundary pass, 2026-09-01).
  // `frameworksForContext` bounds how much of one prompt the framework library
  // may occupy and returns `{kept, dropped}`. The eviction of CURATED rows is
  // impossible (the offer sorts shared-first) and a drop is counted by the
  // server metric `respin.credits.framework_offer.dropped` — but when a
  // creator's OWN private frameworks were dropped, no screen said so: they
  // simply did not get the frameworks they wrote, at full price.

  it("the sentence appears only when frameworks of the creator's really were dropped", () => {
    // THE THREE ANSWERS ARE NOT TWO. `null` is "this press built no offer" (a
    // replay settles a stored candidate and assembles no prompt) and `0` is
    // "it built one and everything fitted". Neither is a line on the screen,
    // and collapsing them in the STATE would lose a fact a later surface needs.
    expect(frameworksNotUsedSentence(null)).toBeNull();
    expect(frameworksNotUsedSentence(0)).toBeNull();
    expect(frameworksNotUsedSentence(-1)).toBeNull();
    const one = frameworksNotUsedSentence(1)!;
    expect(one).toContain("1 of your own framework was not put in");
    const many = frameworksNotUsedSentence(3)!;
    expect(many).toContain("3 of your own frameworks were not put in");
  });

  it("...and it neither promises anything nor sells an upgrade", () => {
    // R15's rule where it would be easiest to break: "your frameworks did not
    // fit" reads like a paywall and is not one — the budget is ONE number in
    // the versioned config for the whole install, the same on Free and on
    // Studio. And the sentence may not claim the draft would have been better.
    const sentence = frameworksNotUsedSentence(4)!;
    const text = sentence.toLowerCase();
    for (const word of ["upgrade", "plan", "pro ", "studio ", "more credits", "pay"]) {
      expect(text, `the sentence sells: ${word}`).not.toContain(word);
    }
    expect(text).not.toMatch(/would have|better|stronger|improve/);
    // It names the ONE thing the creator can actually do, and says it is
    // lossless — the same remedy `framework_limit` gives.
    expect(text).toContain("retire");
    // IT STATES THE ORDERING, NOT AN OUTCOME. "the shared library was
    // unaffected" would be a claim about what happened, and this sentence is
    // rendered off `droppedPrivate` alone — it cannot know whether a single
    // curated row larger than the whole budget was also dropped. "curated
    // first, so none of it was displaced by yours" is true in every case,
    // because the offer sorts shared rows ahead of private ones.
    expect(text).toContain("curated library is offered first");
    expect(text).not.toContain("shared library was unaffected");
    // The whole canon, on a sentence that ships to a creator.
    for (const [label, re] of FORBIDDEN_CLAIMS) {
      expect(text, `"${label}" appears`).not.toMatch(re);
    }
    for (const [label, re] of PERFORMANCE_CLAIMS) {
      expect(text, `"${label}" appears`).not.toMatch(re);
    }
  });

  it("the RESULT screen renders it, and only when there is something to say", () => {
    const dropped = renderOutcome({ ...USABLE, privateFrameworksNotUsed: 2 });
    expect(dropped).toContain('data-testid="studio-frameworks-not-used"');
    expect(decoded(dropped)).toContain("2 of your own frameworks were not put in");
    // A press that dropped nothing renders no line at all — the difference
    // between telling somebody something and decorating the page.
    for (const count of [0, null] as const) {
      expect(
        renderOutcome({ ...USABLE, privateFrameworksNotUsed: count }),
        `count=${String(count)}`
      ).not.toContain('data-testid="studio-frameworks-not-used"');
    }
  });

  it("an HONEST REFUSAL says it too, because a refusal is charged", () => {
    // The asymmetry that would otherwise ship: surfacing the fact only when
    // the draft came out well. An honest refusal ran the same prompt and took
    // the same debit.
    const html = renderOutcome({ ...HONEST_REFUSAL, privateFrameworksNotUsed: 5 });
    expect(html).toContain('data-testid="studio-frameworks-not-used"');
    expect(decoded(html)).toContain("5 of your own frameworks were not put in");
  });

});

describe("studioStateFor projects what the operation returned", () => {
  const generation = {
    id: "gen-9",
    mode: "hooks",
    outcome: "usable",
    weakestPoint: "W",
    refusalReason: null,
    promptBundleVersion: "hooks@abc",
    rewriteCount: 0,
  };
  const killTest = {
    outcome: "passed",
    attempts: 1,
    rewritten: false,
    creatorRulesScored: false,
    creatorRuleVerdicts: [],
    traceabilityLimitNote: "LIMIT",
    firstAttempt: {
      hardRules: [],
      traceability: [{ kind: "number", enforcement: "hard", token: "1", field: "/a", unit: "u", shape: "plain-number", startUtf16: 0, endUtf16: 1 }],
      // The FIRST attempt's claim, which must never reach the screen: the draft
      // the creator is reading is the final one.
      claims: [{ shape: "views", family: "performance", enforcement: "flag", token: "FIRST_ATTEMPT_CLAIM", field: "/hooks/0/text", unit: "u" }],
    },
    finalAttempt: {
      hardRules: [],
      traceability: [{ kind: "date", enforcement: "hard", token: "2026-01-01", field: "/b", unit: "v", shape: "iso-date", startUtf16: 0, endUtf16: 10 }],
      claims: [{ shape: "skip the label", family: "concealment", enforcement: "flag", token: "skip the label", field: "/disclosure/guidance", unit: "Most people skip the label on a short like this." }],
    },
    refusal: null,
  };
  const result = (over: Record<string, unknown>) =>
    ({
      attemptId: "a1",
      replayed: false,
      generation,
      creditsChargedNow: 5,
      balanceAfter: 20,
      configVersion: 3,
      resolvedTier: "free",
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it("the count comes from the OPERATION, and a replay has no answer", () => {
    // The projection half: the number on the screen is the one `generate`
    // returned, and a press that built no offer is `null` rather than a zero
    // that would read as "nothing was dropped".
    const withOffer = studioStateFor(
      result({
        run: {
          status: "usable",
          drafts: 1,
          promptBundleVersion: "hooks@abc",
          killTest,
          output: {
            hooks: [{ text: "H", mechanic: "M" }],
            whyThisPerforms: { reasoning: "R", weakestPoint: "W" },
            disclosure: { platform: "TikTok", guidance: "G" },
          },
        },
        frameworkOffer: {
          eligible: 12,
          offered: 9,
          droppedShared: 0,
          droppedPrivate: 3,
        },
      }),
      "Hooks"
    );
    expect(withOffer.status).toBe("usable");
    if (withOffer.status !== "usable") return;
    expect(withOffer.privateFrameworksNotUsed).toBe(3);

    const noOffer = studioStateFor(
      result({ run: null, replayed: true, frameworkOffer: null }),
      "Hooks"
    );
    expect(noOffer.status).toBe("replayed");

    // AND AN ABSENT FIELD FAILS CLOSED TO "no answer", not to a zero. A
    // rolling deploy runs two builds at once and this value crosses a package
    // boundary, so `undefined` is reachable however the type reads.
    const smuggled = studioStateFor(
      result({
        run: {
          status: "usable",
          drafts: 1,
          promptBundleVersion: "hooks@abc",
          killTest,
          output: {
            hooks: [{ text: "H", mechanic: "M" }],
            whyThisPerforms: { reasoning: "R", weakestPoint: "W" },
            disclosure: { platform: "TikTok", guidance: "G" },
          },
        },
        frameworkOffer: undefined,
      }),
      "Hooks"
    );
    if (smuggled.status !== "usable") throw new Error("expected a usable state");
    expect(smuggled.privateFrameworksNotUsed).toBeNull();
  });

  it("a usable run becomes the draft, the pair, the disclosure and the charge", () => {
    const state = studioStateFor(
      result({
        run: {
          status: "usable",
          drafts: 1,
          promptBundleVersion: "hooks@abc",
          killTest,
          output: {
            hooks: [{ text: "H", mechanic: "M" }],
            whyThisPerforms: { reasoning: "R", weakestPoint: "W" },
            disclosure: { platform: "TikTok", guidance: "G" },
          },
        },
      }),
      "Hooks"
    );
    expect(state.status).toBe("usable");
    if (state.status !== "usable") throw new Error("unreachable");
    expect(state.document.hooks).toEqual([{ text: "H", mechanic: "M" }]);
    // THE LABEL IS THE CALLER'S and comes from the STORED row's mode, never
    // from the string the browser posted — see `studioStateFor`'s docblock.
    expect(state.modeLabel).toBe("Hooks");
    expect(state.modeId).toBe("hooks");
    expect(state.charge).toEqual({ creditsChargedNow: 5, balanceAfter: 20 });
    expect(state.killTest.limitNote).toBe("LIMIT");
    // THE FINAL ATTEMPT'S findings, never the first: the draft on screen is the
    // final one, and a flag from a rewritten-away draft points at text that is
    // not there.
    expect(state.killTest.traceability.map((f) => f.token)).toEqual(["2026-01-01"]);
    // THE SAME RULE FOR THE CLAIM FINDINGS, which were not projected at all
    // until this slice's honesty pass — stored on the generation and reachable
    // by nobody. The whole finding travels, because the screen needs the family
    // (what kind of claim), the enforcement (whether it stopped the draft) and
    // the unit (where to find it), not just the matched words.
    expect(state.killTest.claims).toEqual([
      {
        family: "concealment",
        enforcement: "flag",
        token: "skip the label",
        field: "/disclosure/guidance",
        unit: "Most people skip the label on a short like this.",
      },
    ]);
    expect(JSON.stringify(state)).not.toContain("FIRST_ATTEMPT_CLAIM");
  });

  it("a refused run becomes the honest refusal, still carrying the charge", () => {
    const state = studioStateFor(
      result({
        generation: { ...generation, outcome: "honest_refusal" },
        run: {
          status: "refused",
          drafts: 2,
          promptBundleVersion: "hooks@abc",
          killTest,
          refusal: { headline: "H", why: ["a", "b"], sharperAngle: "S" },
        },
      }),
      "Hooks"
    );
    expect(state.status).toBe("honest_refusal");
    if (state.status !== "honest_refusal") throw new Error("unreachable");
    expect(state.why).toEqual(["a", "b"]);
    expect(state.charge.creditsChargedNow).toBe(5);
  });

  it("a replay is its own state — BOTH `replayed` and a null run are checked", () => {
    for (const over of [
      { replayed: true, run: null },
      // A shape where the two disagree must still not render a stored draft as
      // a fresh one that was just paid for.
      { replayed: true, run: { status: "usable" } },
    ]) {
      expect(studioStateFor(result(over), "Hooks").status).toBe("replayed");
    }
  });
});

// ------------------------------- R18: the tier gate's copy, and NO second map

describe("R18: the tier→mode gate's creator-facing copy", () => {
  it("the refusal states what happened and that nothing was spent", () => {
    const copy = studioErrorFor("mode_not_in_plan")!;
    expect(copy.detail).toMatch(/Nothing was spent/);
    expect(copy.detail).toMatch(/no model was called/);
  });

  it("...and it does NOT name an upgrade as the remedy", () => {
    // `billing-errors.ts` already bans this shape twice (`profile_cap`,
    // `run_slot_busy`), for two reasons that both hold here: a refusal is not a
    // sales surface, and a sentence naming another plan's contents is a second
    // copy of the tier map that goes stale silently.
    const copy = studioErrorFor("mode_not_in_plan")!;
    const text = `${copy.title} ${copy.detail}`.toLowerCase();
    for (const inducement of [
      "upgrade",
      "move to a plan",
      "higher plan",
      "a plan that includes",
      "paid plan",
      "subscribe",
    ]) {
      expect(text, inducement).not.toContain(inducement);
    }
  });

  it("the screen builds NO second tier→mode derivation, and names NO mode at all (source scan)", () => {
    // R18: "the tier authority stays `getWorkspaceBillingState` — no second
    // derivation". `MODE_TIERS` and `IMPLEMENTED_MODES` live in
    // `packages/credits/src/mode-access.ts` and `@respin/modes`; a screen-side
    // copy of either would go stale the day one of them changes.
    //
    // SLICE 7 MADE THIS SCAN STRICTLY WIDER, and that is the interesting part.
    // Slice 6's version exempted `hooks`, because the screen submitted that one
    // id as a hidden field. The picker is now built from `modeOffers(tier)`,
    // which the SERVER resolves — so this directory names NO mode id at all,
    // and the scan says so. A widened ban is the opposite of the usual
    // direction and is only honest because the non-vacuity below drives the
    // matcher against a planted violation of every id.
    const ALL_MODE_IDS = [
      "footageToThesis",
      "ideaToScript",
      "sourceToReel",
      "analyseAndSpin",
      "hooks",
      "caption",
      "ideation",
    ];
    // COMMENTS STRIPPED, because this scan is about CODE. A docblock naming
    // `MODE_TIERS` to say "the authority is over there, and this file does not
    // copy it" is the note a reader needs; banning the mention would delete the
    // explanation and keep the rule.
    const codeOnly = (src: string) =>
      src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    /** Every mode id NAMED as a string literal in this source. */
    const namedModeIds = (src: string): string[] =>
      ALL_MODE_IDS.filter((id) => codeOnly(src).includes(`"${id}"`));

    // NON-VACUITY FIRST, AND IT IS A PLANTED VIOLATION OF EVERY ID rather than
    // a sample of one (CLAUDE.md 2026-08-21: a scan that reports zero findings
    // is indistinguishable from a scan that is broken). It is planted as a
    // STRING and never as a file: `studioSourceFiles` walks a real app
    // directory, and a probe written there is visible to every other scan
    // running concurrently — the defect the probe-artifact incident records.
    for (const id of ALL_MODE_IDS) {
      expect(namedModeIds(`const m = "${id}";`), id).toEqual([id]);
    }
    // ...and the strip removes comments and nothing else, so a mode id in a
    // docblock is permitted while one in code is not.
    expect(namedModeIds('/* "caption" */ const m = 1;')).toEqual([]);
    expect(namedModeIds('/* "caption" */ const m = "caption";')).toEqual(["caption"]);

    const files = studioSourceFiles();
    // The population is real and includes the sub-directory slice 7 added, so
    // a walker that stopped at the top level would be visible here.
    expect(files.length).toBeGreaterThan(8);
    expect(
      files.some((f) => f.split(sep).includes("frameworks")),
      "the walker does not reach app/(product)/studio/frameworks"
    ).toBe(true);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(namedModeIds(src), `${file} names a mode id`).toEqual([]);
      // ...and no tier keyed to a mode list.
      expect(codeOnly(src), file).not.toMatch(/MODE_TIERS|TIER_MODES|planIncludesMode/);
    }
  });
});

// ------------------------- the refusal-code set is DERIVED from the spend path

describe("the screen's code set is DERIVED from what `generate` throws", () => {
  /**
   * THE POPULATION, STATED AS A LIST (CLAUDE.md, 2026-08-29).
   *
   * Every source file `respinCredits.generate` can throw from. Adding a file
   * here is what a new spend path costs — the alternative, a scan pointed at
   * one file, is the shape that shipped the same defect three times on
   * `/onboarding`.
   *
   * TWO FILES ARE DELIBERATELY ABSENT and the reasons differ:
   *
   *  - `packages/db/src/with-workspace.ts` — shared by every capability in the
   *    product. A file-level scan over it pulls in refusals genuinely
   *    unreachable from this path (the `/brain` role gate, the interview
   *    writes), exactly as the onboarding scan found. The ONE class it
   *    contributes here — `GenerationAttemptStateError` — is named in
   *    `ALSO_REACHABLE` below instead.
   *  - `packages/credits/src/ledger.ts` — `debitCredits` lives there and so
   *    does `refundCredits`, whose `RefundSourceNeverExpiresError` is not
   *    reachable from a debit and is not on any facade. The classes
   *    `debitCredits` can raise (`InsufficientCreditsError`,
   *    `WorkspacePausedError`) are constructed in `generate.ts` too, and
   *    `LedgerIntegrityError` is caught through `fold.ts`, which IS scanned.
   */
  const STUDIO_SPEND_PATH_SOURCES = [
    "packages/credits/src/generate.ts",
    "packages/credits/src/inference.ts",
    "packages/credits/src/fold.ts",
    "packages/credits/src/clock.ts",
    "packages/credits/src/stripe/auto-topup.ts",
    "packages/config/src/index.ts",
    "packages/modes/src/assemble.ts",
    "packages/modes/src/kill-test.ts",
    "packages/modes/src/output.ts",
    "packages/modes/src/modes.ts",
  ];

  // `mode-access.ts` now also owns Performance Learning's configuration
  // resolver. That resolver is not called by `generate`, so scanning its
  // whole file would turn a Results-only operational refusal into Studio copy.
  // Keep the exact exported call chain `generate` reaches instead.
  const modeAccess = read("packages/credits/src/mode-access.ts");
  const functionBody = (name: string): string => {
    const declaration = `export function ${name}(`;
    const start = modeAccess.indexOf(declaration);
    if (start < 0) throw new Error(`mode-access no longer exports ${name}`);
    const open = modeAccess.indexOf("{", start);
    let depth = 0;
    for (let index = open; index < modeAccess.length; index += 1) {
      if (modeAccess[index] === "{") depth += 1;
      if (modeAccess[index] === "}" && --depth === 0) {
        return modeAccess.slice(start, index + 1);
      }
    }
    throw new Error(`mode-access ${name} has no closing body`);
  };
  const MODE_GATE_CALL_CHAIN = [
    "assertModeAllowed",
    "planIncludesMode",
    "modeTiers",
    "modesIncludedIn",
  ] as const;

  /**
   * Classes reachable from this screen that no scanned file constructs, each
   * with the reason it is named rather than derived.
   *
   * A list of three is small enough to be honest and is NOT a licence to
   * hand-maintain the derivation: everything the scan finds is still demanded.
   */
  const ALSO_REACHABLE: Record<string, string> = {
    // `caps.claimGenerationAttempt` / `advanceGenerationAttempt` /
    // `settleGeneration`, in with-workspace.ts (see above).
    GenerationAttemptStateError: "the attempt claim's state machine",
    // `mintProfileScope`, same file: a foreign or absent profile id.
    ProfileAccessError: "the profile cage",
    // `assertScoped`, same file.
    ScopeForgeryError: "the workspace cage",
    // `withWorkspace`, reached by this PAGE's own `scopeForUser` call.
    WorkspaceAccessError: "the page's own scope read",
  };

  const spendPathSrc = [
    ...STUDIO_SPEND_PATH_SOURCES.map(read),
    ...MODE_GATE_CALL_CHAIN.map(functionBody),
  ].join("\n");

  /** Every `new XError(` CONSTRUCTED — from a RegExp LITERAL, never assembled. */
  const thrownClassNames = (text: string): string[] => [
    ...new Set([...text.matchAll(/new (\w+Error)\(/g)].map((m) => m[1])),
  ];

  it("NON-VACUITY: the scan finds the classes it is supposed to find", () => {
    const names = thrownClassNames(spendPathSrc);
    expect(names.length).toBeGreaterThanOrEqual(10);
    for (const expected of [
      // the generation path's own
      "BrainNotActivatedError",
      "GenerationInFlightError",
      "GenerationRecoveryRequiredError",
      "GenerationUnchargedAttemptCapError",
      // the tier gate (R18)
      "ModeNotInPlanError",
      // the pipeline's, from a package app/** may not import
      "GenerationAssemblyError",
      "ScriptOutputError",
      "KillTestError",
      "UnknownModeError",
      // the money spine it shares with runInference
      "InsufficientCreditsError",
      "PostCallDebitError",
      "UnpricedOperationError",
    ]) {
      expect(names, `${expected} is thrown on this screen's spend path`).toContain(
        expected
      );
    }
    // ...it finds nothing in text that merely MENTIONS a class...
    expect(thrownClassNames("// throws RunSlotBusyError sometimes")).toEqual([]);
    // ...and it DOES find the ternary form a `throw new X(` scan would miss.
    expect(
      thrownClassNames("throw t ? new TopupInFlightError(1, 2) : new OtherError();")
    ).toEqual(["TopupInFlightError", "OtherError"]);
  });

  it("takes only generate's actual mode-gate call chain from the shared access module", () => {
    const generate = read("packages/credits/src/generate.ts");
    expect(generate).toContain('import { assertModeAllowed, type EntitlementTier } from "./mode-access"');
    expect(generate).toContain("assertModeAllowed(billing.tier, params.mode)");
    expect(functionBody("assertModeAllowed")).toContain("planIncludesMode(tier, mode)");
    expect(functionBody("planIncludesMode")).toContain("modeTiers(mode)");
    expect(functionBody("assertModeAllowed")).toContain("modesIncludedIn(tier)");
    expect(spendPathSrc).not.toContain("PerformanceLearningConfigUnavailableError");
  });

  const codeForClassName = (name: string): string | undefined =>
    CODE_FOR_ERROR_CLASS[name] ??
    CODE_FOR_ERROR_CLASS[ERROR_CLASS_COVERED_BY_BASE[name] ?? ""];

  it("every class the spend path throws maps to a code this screen has copy for", () => {
    const codes = new Set<string>();
    const names = [...thrownClassNames(spendPathSrc), ...Object.keys(ALSO_REACHABLE)];
    for (const name of names) {
      const code = codeForClassName(name);
      expect(
        code,
        `${name} is thrown on the studio spend path but resolves to no billing error code`
      ).toBeDefined();
      codes.add(code as string);
      for (const c of INSTANCE_BRANCH_CODES[name] ?? []) codes.add(c);
    }
    const missing = [...codes].filter(
      (c) => !(STUDIO_ERROR_CODES as readonly string[]).includes(c)
    );
    expect(
      missing,
      "a refusal `generate` can raise would render the neutral fallback on the screen that spends the credit"
    ).toEqual([]);
  });

  it("every named ALSO_REACHABLE class really exists on the facade surface", () => {
    // The named half must not rot: a class here that nothing exports would make
    // its entry look like coverage while covering nothing.
    for (const name of Object.keys(ALSO_REACHABLE)) {
      expect(codeForClassName(name), name).toBeDefined();
    }
    expect(Object.keys(ALSO_REACHABLE).length).toBeGreaterThan(0);
  });

  it("every code in the closed set resolves to real words, not to nothing", () => {
    expect(STUDIO_ERROR_CODES.length).toBeGreaterThan(20);
    for (const code of STUDIO_ERROR_CODES) {
      const copy = studioErrorFor(code);
      expect(copy, code).not.toBeNull();
      expect(copy!.title.length, code).toBeGreaterThan(5);
      expect(copy!.detail.length, code).toBeGreaterThan(40);
    }
  });

  it("a code this screen cannot emit falls back to neutral words, never a stranger's copy", () => {
    // `/studio?e=not_enough_posts` must not render the onboarding screen's
    // sentence about pasting posts.
    const foreign = studioErrorFor("not_enough_posts")!;
    expect(foreign.title).toBe("Something went wrong");
    expect(studioErrorFor(undefined)).toBeNull();
    expect(studioErrorFor("totally-made-up")!.title).toBe("Something went wrong");
  });

  /**
   * Clauses that are TRUE in the shared copy's original home and FALSE here.
   *
   * THE POPULATION IS `STUDIO_ERROR_CODES`, NOT A REMEMBERED LIST. Both of
   * these were first written as hand-written lists of six and two codes, and
   * the six-code one was short by two: `run_slot_busy` and `server_at_capacity`
   * are in the closed set, are raised by `generate.ts`, and both said "your
   * included build was not used" — the exact false free-draft promise the
   * override block exists to remove. The list could not see them, which is
   * CLAUDE.md's 2026-08-29 population lesson recurring inside its own fix.
   * Deriving from the closed set means adding a code is what forces the audit.
   */
  const FALSE_ON_THIS_SCREEN: readonly [string, RegExp, string][] = [
    [
      "the onboarding entitlement",
      // `included build` / `included run` are the ONBOARDING entitlement
      // (D-M2-2, one free brain build per profile). `priceOf` prices a
      // GENERATION every time, so either phrase here promises a free draft that
      // does not exist. "there is no included draft" — a DENIAL — is what the
      // studio copy says instead, and banning that phrase too would ban the
      // correction along with the error, so the pattern names the two nouns.
      //
      // AND `first run for this creator` IS THE SAME CLAIM IN THE WORDING THE
      // SHARED COPY ADOPTED (billing gate round 2, 2026-09-02). Eight shared
      // strings moved off "your included build" — a price claim a static map
      // cannot make — and onto "your first run for this creator", which is
      // true on `/onboarding` and just as false here: `/studio` has no
      // per-creator first run at all. Adding the new wording without adding
      // it HERE would have narrowed this scan silently while the copy it was
      // written for walked out from under it.
      /included (build|run)\b|first run for this creator/,
      "promises a free draft this screen does not have",
    ],
    [
      "the fixed-ping privacy claim",
      // Written for slice 2a's fixed connectivity ping, where it is TRUE. Here
      // the request carries the creator's own input and their activated brain,
      // so this would tell someone whose writing had just been sent to a model
      // provider that nothing of theirs had been sent at all.
      /fixed message of ours|never anything you wrote|nothing you wrote/,
      "denies sending creator content on the screen that just sent it",
    ],
    [
      "an upgrade as the remedy",
      // `billing-errors.ts` bans this shape on `profile_cap` and
      // `run_slot_busy`, and the slice-6 block carries it as rule 3. A refusal
      // is not a sales surface, and a sentence naming another plan's contents
      // is a second copy of the tier map that goes stale silently.
      /\bupgrad|move to a (higher |paid )?plan|a plan that includes|\bsubscribe\b/,
      "sells a plan from inside a refusal",
    ],
  ];

  it.each(FALSE_ON_THIS_SCREEN)(
    "NO code in the closed set carries %s",
    (_label, pattern, why) => {
      // EVERY code, derived — never a subset. `studioErrorFor` resolves the
      // override if there is one, so this reads exactly what a creator reads.
      const offenders = (STUDIO_ERROR_CODES as readonly string[]).filter((code) => {
        const copy = studioErrorFor(code)!;
        return pattern.test(`${copy.title} ${copy.detail}`.toLowerCase());
      });
      expect(offenders, why).toEqual([]);
    }
  );

  it("NON-VACUITY: each false-copy pattern catches a PLANTED violation", () => {
    // CLAUDE.md, 2026-08-21: a scan that reports zero violations is otherwise
    // indistinguishable from a scan that is working. One specimen per clause,
    // in the wording the real shared copy actually used.
    const planted: Record<string, string> = {
      "the onboarding entitlement":
        "nothing was spent and your included build was not used",
      "the fixed-ping privacy claim":
        "this attempt sends a fixed message of ours, never anything you wrote",
      "an upgrade as the remedy": "upgrading raises the number",
    };
    for (const [label, pattern] of FALSE_ON_THIS_SCREEN) {
      expect(planted[label], label).toBeDefined();
      expect(pattern.test(planted[label]), label).toBe(true);
    }
    // ...and the scan reads a population big enough to be worth deriving.
    expect(STUDIO_ERROR_CODES.length).toBeGreaterThan(20);
  });

  it("the two codes the hand-written list missed are OVERRIDDEN, not merely clean", () => {
    // A REGRESSION WITNESS FOR THE INSTANCE, beside the derived scan for the
    // class: if `run_slot_busy` and `server_at_capacity` were quietly dropped
    // from `STUDIO_ERROR_CODES` the derived scan above would go green by
    // shrinking its population, and the screen would render the shared copy
    // through the neutral fallback instead.
    for (const code of ["run_slot_busy", "server_at_capacity"] as const) {
      expect(STUDIO_ERROR_CODES as readonly string[], code).toContain(code);
      const studio = studioErrorFor(code)!;
      const shared = BILLING_ERROR_COPY[code];
      expect(studio.detail, code).not.toBe(shared.detail);
      // THE SHARED COPY STILL CARRIES THE CLAIM THIS SCREEN DOES NOT HAVE —
      // in the wording it moved to on 2026-09-02. It said "included build"
      // until the billing gate found that a static map cannot state a price;
      // it now says "your first run for this creator", which is true on
      // `/onboarding` and false here, so the override is still load-bearing
      // and this witness still witnesses something.
      expect(shared.detail.toLowerCase(), `${code}'s SHARED copy`).toContain(
        "first run for this creator"
      );
      // The remedy that is true for every tier survives the rewrite.
      expect(studio.detail.toLowerCase(), code).toMatch(/try again|wait for/);
    }
  });
});

// ----------------------------------- R20/R21: the honesty scan on real copy

describe("R20/R21: what /studio may and may not claim", () => {
  /**
   * THE CANON PLUS PERFORMANCE CLAIMS — AND NOT `NOT_BUILT_YET`.
   *
   * `/studio` genuinely generates now, so `generat`, `script` and `hook` are
   * the only honest labels for its controls. The three bans leaving is paid for
   * by `STUDIO_POSITIVE_ASSERTIONS`, driven in the next describe block.
   */
  const FORBIDDEN: [string, RegExp][] = [
    ...FORBIDDEN_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
    ...PERFORMANCE_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
  ];

  const STATES: [string, StudioViewProps][] = [
    ["the form, ready to press", baseView],
    ["no creator profile yet", { ...baseView, profileName: null, run: null }],
    [
      "price unknown",
      {
        ...baseView,
        run: {
          ...baseView.run!,
          costSentence: generateCostSentence(
            MODES.map((m) => ({ ...m, cost: null })),
            null
          ),
          revisionCostSentence: revisionCostSentence(null),
        },
      },
    ],
    [
      "viewer",
      {
        ...baseView,
        run: {
          ...baseView.run!,
          block: generateBlock({ isViewer: true, paused: false, brainActivated: true }),
        },
      },
    ],
    [
      "paused",
      {
        ...baseView,
        run: {
          ...baseView.run!,
          block: generateBlock({ isViewer: false, paused: true, brainActivated: true }),
        },
      },
    ],
    [
      "no activated brain",
      {
        ...baseView,
        run: {
          ...baseView.run!,
          block: generateBlock({
            isViewer: false,
            paused: false,
            brainActivated: false,
          }),
        },
      },
    ],
    [
      "a refusal code came back on the URL",
      { ...baseView, error: studioErrorFor("mode_not_in_plan") },
    ],
  ];

  it.each(STATES)("%s claims nothing this product cannot support", (_label, props) => {
    const html = visibleCopy(renderView(props)).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears on /studio`).not.toMatch(re);
    }
  });

  it.each([
    ["a usable draft", USABLE],
    ["an honest refusal", HONEST_REFUSAL],
    [
      // R17's LINE, IN THE SCAN. Every shared fixture carries
      // `privateFrameworksNotUsed: 0`, so before this row the sentence existed
      // and no honesty scan had ever rendered it — the exact shape of the
      // 2026-08-29 lesson, where a guard's population silently excludes the
      // new thing. Both charged states are covered: the refusal one is below.
      "a usable draft whose own frameworks did not all fit",
      {
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        privateFrameworksNotUsed: 3,
      } as StudioRunState,
    ],
    [
      "an honest refusal whose own frameworks did not all fit",
      {
        ...(HONEST_REFUSAL as Extract<
          StudioRunState,
          { status: "honest_refusal" }
        >),
        privateFrameworksNotUsed: 1,
      } as StudioRunState,
    ],
    [
      // THE CLAIMS BLOCK, RENDERED AND SCANNED (learning honesty gate round 2,
      // 2026-09-01). The shared `KILL_TEST` fixture pins `claims: []`, so
      // before this row the block's markup never entered the honesty scan in
      // ANY state — the one exempted family was the only one that could have
      // been scanned. If a later fixture puts a canon word into a concealment
      // token, this row goes red, which is the honest failure: the exemption is
      // then real and has to be argued for again rather than assumed.
      "a usable draft carrying a flag-level concealment finding",
      {
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        killTest: { ...KILL_TEST, claims: [CONCEALMENT] },
      } as StudioRunState,
    ],
    [
      "a replay",
      {
        status: "replayed",
        generationId: "g",
        modeId: "hooks",
        modeLabel: "Hooks",
        outcome: "usable",
        weakestPoint: "W",
        refusalReason: null,
        balanceAfter: 3,
      } as StudioRunState,
    ],
  ] as [string, StudioRunState][])(
    "the OUTCOME state %s claims nothing this product cannot support",
    (_label, state) => {
      const html = visibleCopy(renderOutcome(state)).toLowerCase();
      for (const [label, re] of FORBIDDEN) {
        expect(html, `"${label}" appears in the outcome`).not.toMatch(re);
      }
    }
  );

  it("EVERY refusal code this screen can emit is scanned — not a fixture", () => {
    // The compliance gate's central finding, applied before it can happen here:
    // the scan above drives fixtures, so the copy a creator actually reads
    // would never be scanned at all.
    for (const code of STUDIO_ERROR_CODES) {
      const copy = studioErrorFor(code)!;
      const text = `${copy.title} ${copy.detail}`.toLowerCase();
      for (const [label, re] of FORBIDDEN) {
        expect(text, `"${label}" appears in /studio's copy for ${code}`).not.toMatch(re);
      }
    }
  });

  it.each(FORBIDDEN)(
    "NON-VACUITY: the scan catches %s specifically, not just 'something'",
    (label, re) => {
      // PER WORD. A single injected string satisfied by two patterns leaves a
      // typo in a third invisible (the compliance gate's 2026-08-27 finding).
      expect(CLAIM_SPECIMENS[label], label).toBeDefined();
      expect(CLAIM_SPECIMENS[label].toLowerCase(), label).toMatch(re);
    }
  );

  it("NON-VACUITY, end to end: a planted promise in a RENDERED state is caught", () => {
    const planted = visibleCopy(
      renderView({ profileName: "We guarantee more views and it improves over time." })
    ).toLowerCase();
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["guarantee", "views", "improve"])
    );
  });

  it("the script strip is NARROW: a promise outside a script tag is still caught", () => {
    const planted = visibleCopy(
      '<p>this will go viral</p><script>var x = "this will go viral";</script>'
    ).toLowerCase();
    expect(planted).toContain("<p>this will go viral</p>");
    expect(planted).not.toContain("var x");
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["viral"])
    );
  });

  it("NON-VACUITY: without the strip, React's form bootstrap alone would be scanned", () => {
    const raw = renderView().toLowerCase();
    expect(raw).toMatch(/<script\b/);
    expect(visibleCopy(raw)).not.toMatch(/<script\b/);
  });
});

// ------------------- R21: the bans that left, and what was put in their place

describe("R21: /studio left NOT_BUILT_YET, and the removal is paid for", () => {
  it("the three words really are on the NOT_BUILT_YET list (the ban this screen left)", () => {
    // NON-VACUITY for the claim this whole block is about: if the list were
    // emptied, "the screen may say these words" would be trivially true and the
    // positive assertions below would look like decoration.
    const labels = NOT_BUILT_YET.map(([l]) => l);
    expect(labels).toEqual(expect.arrayContaining(["generate", "script", "hook"]));
  });

  it("...and /studio says them, because it does the thing", () => {
    const html = visibleCopy(renderView()).toLowerCase();
    expect(html).toMatch(/\bgenerat/);
    expect(html).toMatch(/\bhook/);
  });

  it("IT ACTUALLY DOES THE THING: the control is wired to the metered operation", () => {
    // The strongest form of the positive replacement, and the one a render
    // cannot give: `/onboarding` was allowed to say "brain" only once its
    // button reached a model. `/studio` may say "generate" only while this
    // wiring exists — a screen with the words and no operation behind them is
    // precisely the state the ban was protecting against.
    const actionsSrc = read("app/(product)/studio/actions.ts");
    expect(actionsSrc).toMatch(/respinCredits\.generate\(/);
    // The attempt id is minted per press and hoisted so the refusal path names
    // it — it is the key `model_usage`, the claim and the debit share.
    expect(actionsSrc).toMatch(/const attemptId = randomUUID\(\);/);
    // The page binds that action into the panel, so the button posts to it.
    const pageSrc = read("app/(product)/studio/page.tsx");
    expect(pageSrc).toMatch(/generateAction\.bind\(null, profile\.id\)/);
    // ...and the FEEDBACK action too (slice 7, R10): a reaction control with
    // nothing behind it is the same defect one screen over.
    expect(pageSrc).toMatch(/recordFeedbackAction\.bind\(null, profile\.id\)/);
    // ...and the page supplies the price through the OPERATION'S OWN pricing
    // rule rather than by indexing `creditCosts` itself. Slice 6 pinned
    // `creditCosts.hookSet`, which was right when the screen had one mode and
    // is a second mode->key map now that it has six: `generationOp` is the one
    // place a mode's cost key (and a revision's) is chosen, and `priceOf` is
    // the lookup the debit is taken from.
    expect(pageSrc).toMatch(/priceOf\(/);
    expect(pageSrc).toMatch(/generationOp\(/);
    expect(
      pageSrc.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""),
      "the page indexes creditCosts directly again"
    ).not.toMatch(/creditCosts\./);
  });

  it("the courtesy read's SAFETY claim: ONE activation entrypoint, so no app path activates without a snapshot", () => {
    // THE CLAIM THIS ASSERTS IS A COMMENT IN `page.tsx`, and until this test it
    // was only a comment (CLAUDE.md 2026-07-30). The page infers "has a brain"
    // from `readBrainHistory`, while the authority `generate` uses is the
    // presence of a `brain_activation_snapshots` row. The two can only disagree
    // if some activation writes no snapshot — which is exactly what slice 3's
    // single-document `activateVoice` did, and on a profile that had already
    // activated once the consequence was not a wrong signpost but a wrong
    // VOICE: `generate` finds the older snapshot, refuses nothing, and
    // `brainDocsByIds` returns the superseded document it names.
    //
    // So the property is a SURFACE property: `@respin/db` offers `app/**`
    // exactly one activation, and it is the coherent one that writes the
    // snapshot in the same transaction. Both doors are scanned — the facade
    // object `/studio` and `/brain` call through, and the package root's
    // re-export list — because `app/**` can import from either.
    // ANY indent, not exactly two: a nested facade entry is still a door, and
    // pinning the current indentation would make this scan fail OPEN the day
    // somebody wraps the object. `//` before the name blocks a comment from
    // matching, which is what lets the deletion notes above stay in the file.
    const FACADE_ENTRY = /^\s+(activate\w*)\s*:/gm;
    const ROOT_EXPORT = /^\s+(activate\w*),$/gm;
    const names = (src: string, re: RegExp) =>
      [...src.matchAll(re)].map((m) => m[1]);

    expect(names(read("packages/db/src/app-server.ts"), FACADE_ENTRY)).toEqual([
      "activateBrainCoherent",
    ]);
    expect(names(read("packages/db/src/index.ts"), ROOT_EXPORT)).toEqual([
      "activateBrainCoherent",
    ]);

    // NON-VACUITY, per shape (CLAUDE.md 2026-08-21: a scan that matches nothing
    // reports no violations). A planted second door of each shape is found, so
    // the two `toEqual`s above are measurements rather than broken patterns.
    expect(
      names(
        "export const respinDb = {\n  activateVoice: (\n    scope: WorkspaceScope\n  ) => 0,\n  activateBrainCoherent: (s) => 1,\n};\n",
        FACADE_ENTRY
      )
    ).toEqual(["activateVoice", "activateBrainCoherent"]);
    expect(
      names(
        "export {\n  activateVoice,\n  activateBrainCoherent,\n} from './brain-ops';\n",
        ROOT_EXPORT
      )
    ).toEqual(["activateVoice", "activateBrainCoherent"]);

    // THE CAPABILITY ITSELF, one layer below the facade, because the facade is
    // only the `app/**` boundary: `writeCapabilities` is exported from
    // `@respin/db` and `packages/credits` already mints capability objects, so
    // a second `caps.activateBrainDoc(...)` call site in ANY package would
    // re-open the snapshot-less activation this deletion closed — without
    // touching either list above. The population is every `packages/*/src`
    // file, stated as a directory walk rather than a remembered list.
    const CALL = /\bactivateBrainDoc\s*\(/g;
    const callers = packageSrcFiles()
      .filter((f) => CALL.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f).split(sep).join("/"));
    expect(callers).toEqual(["packages/db/src/with-workspace.ts"]);
    // ...and in THAT file the only caller is the coherent wrapper, which is
    // what makes "an activation always writes its snapshot" true rather than
    // usually true.
    const ws = stripComments(read("packages/db/src/with-workspace.ts"));
    const coherentAt = ws.indexOf("activateBrainDocCoherent: async");
    expect(coherentAt).toBeGreaterThan(-1);
    const otherCalls = [...ws.matchAll(/\bcaps\.activateBrainDoc\s*\(/g)].filter(
      (m) => (m.index ?? 0) < coherentAt
    );
    expect(otherCalls, "a caller of activateBrainDoc outside the coherent wrapper").toHaveLength(0);
    // NON-VACUITY for both: the call pattern finds a planted site, and the
    // comment strip does not eat code.
    expect(
      CALL.test(stripComments("await caps.activateBrainDoc({ brainDocId }, tx);"))
    ).toBe(true);
    expect(
      stripComments("// caps.activateBrainDoc(x)\nconst a = 1;")
    ).toContain("const a = 1");
    expect(CALL.test(stripComments("// caps.activateBrainDoc(x)"))).toBe(false);

    // ...and the page still says so, so the comment and the guard cannot drift
    // apart silently: one names the other.
    expect(read("app/(product)/studio/page.tsx")).toContain(
      "activateBrainCoherent"
    );
  });

  /**
   * A marker's OWN region: the marked ELEMENT, opening tag to matching close.
   *
   * THE BOUND MATTERS, AND THE FIRST TWO BOUNDS WERE BOTH WRONG IN OPPOSITE
   * DIRECTIONS. A fixed 4,000-character slice was TOO WIDE — `studio-hooks`'
   * `/<li\b/` could be satisfied by the kill test's verdict list further down
   * the page, so a screen rendering NO hooks passed the assertion that exists
   * to say it renders them. Slicing to the NEXT `data-testid` fixed that and
   * introduced the mirror defect: it is TOO NARROW for any marker on a
   * CONTAINER, because the container's own children carry testids. Measured
   * (learning honesty gate, 2026-09-01): `studio-kill-test`'s region was
   * `<h3>What the checks found</h3>` and nothing else, so `/what the checks
   * found/i` passed with the verdict line deleted.
   *
   * Element bounding is the fix for both at once, and it is a CLASS fix rather
   * than a third hand-tuned window: every region is exactly the subtree the
   * marker names — never a sibling's content, never truncated at a child.
   *
   * THE TAG SCAN IS A REGEXP LITERAL, never assembled from the tag name
   * (CLAUDE.md, 2026-08-21: a guard built from a string literal turns `\s` into
   * `s` when one backslash is lost, and a scanner that matches nothing reports
   * no violations). Names are compared as strings instead. Unbalanced markup
   * returns `null` — "not rendered" — because a region we cannot bound must
   * never be reported as one that passed.
   */
  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  const VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
    "source", "track", "wbr",
  ]);
  const markerRegion = (html: string, testId: string): string | null => {
    const marker = `data-testid="${testId}"`;
    const at = html.indexOf(marker);
    if (at === -1) return null;
    const open = html.lastIndexOf("<", at);
    if (open === -1) return null;
    TAG.lastIndex = open;
    const openTag = TAG.exec(html);
    if (!openTag || openTag.index !== open || openTag[1] === "/") return null;
    const name = openTag[2];
    const openEnd = open + openTag[0].length;
    if (VOID_TAGS.has(name.toLowerCase()) || openTag[0].endsWith("/>")) {
      return html.slice(open, openEnd);
    }
    TAG.lastIndex = openEnd;
    let depth = 1;
    for (let m = TAG.exec(html); m !== null; m = TAG.exec(html)) {
      if (m[2].toLowerCase() !== name.toLowerCase()) continue;
      if (VOID_TAGS.has(m[2].toLowerCase()) || m[0].endsWith("/>")) continue;
      depth += m[1] === "/" ? -1 : 1;
      if (depth === 0) return html.slice(open, m.index + m[0].length);
    }
    return null;
  };

  it("markerRegion is bounded by the ELEMENT — neither a sibling nor a child", () => {
    // NON-VACUITY FOR THE BOUND ITSELF, because both previous bounds looked
    // right and were measured wrong. Three planted shapes, one per direction.
    //
    // 1. IT DOES NOT REACH A SIBLING (the fixed-window defect).
    const siblings = '<ol data-testid="a"></ol><ul data-testid="b"><li>x</li></ul>';
    expect(markerRegion(siblings, "a")).toBe('<ol data-testid="a"></ol>');
    expect(markerRegion(siblings, "a")).not.toMatch(/<li\b/);
    // 2. IT DOES REACH A CHILD THAT CARRIES ITS OWN TESTID (the truncation
    //    defect this round found).
    const nested = '<div data-testid="p"><h3>H</h3><p data-testid="c">REAL</p></div><p>after</p>';
    expect(markerRegion(nested, "p")).toContain("REAL");
    expect(markerRegion(nested, "p")).not.toContain("after");
    expect(markerRegion(nested, "c")).toBe('<p data-testid="c">REAL</p>');
    // 3. NESTING OF THE SAME TAG does not close early.
    const same = '<div data-testid="o">A<div>B</div>C</div>D';
    expect(markerRegion(same, "o")).toBe('<div data-testid="o">A<div>B</div>C</div>');
    // An absent marker is null, and so is markup we cannot bound.
    expect(markerRegion(siblings, "missing")).toBeNull();
    expect(markerRegion('<div data-testid="u">unclosed', "u")).toBeNull();
    // A void element is its own region rather than swallowing the document.
    expect(markerRegion('<input data-testid="v" name="x"/><p>after</p>', "v")).toBe(
      '<input data-testid="v" name="x"/>'
    );
  });

  /** The whole harness, as a function, so a broken render can be run through it. */
  const positiveFailures = (rendered: { form: string; result: string }): string[] => {
    const failures: string[] = [];
    for (const a of STUDIO_POSITIVE_ASSERTIONS) {
      const region = markerRegion(rendered[a.where], a.testId);
      if (region === null) failures.push(`${a.testId}: not rendered`);
      else if (!a.must.test(region)) failures.push(`${a.testId}: says nothing`);
    }
    return failures;
  };

  it("EVERY positive assertion that replaced the bans holds", () => {
    // THE HAZARD THE CARD NAMES: nothing fails if these are weak, because a
    // removal has no natural failure mode. So each entry is a marker the screen
    // must render AND a pattern its own region must match — the list lives in
    // `tests/support/forbidden-claims.ts`, beside the ban it replaced.
    expect(STUDIO_POSITIVE_ASSERTIONS.length).toBeGreaterThanOrEqual(8);
    expect(
      positiveFailures({ form: renderView(), result: renderOutcome(USABLE) })
    ).toEqual([]);
  });

  /**
   * THE LYING SCREEN — every marker, nothing real.
   *
   * This is the fixture the learning-honesty gate built to measure the harness
   * that replaced the bans, and it is kept because the measurement is the whole
   * point: run against the SHIPPED patterns it passed SEVEN OF EIGHT. Empty
   * `<li>`s satisfied "renders the hooks", a `Weakest point:` label above a
   * blank satisfied "names the weakest point", `<h3>What the checks found</h3>`
   * satisfied "shows the kill test's verdict" with the verdict line deleted,
   * and "Your balance was updated." satisfied "reports the actual charge and
   * the resulting balance" on the screen that spends a credit.
   *
   * IT IS DELIBERATELY PLAUSIBLE. Each string is what a screen would look like
   * if the data behind it went away and the markup stayed — which is exactly
   * the shape a regression takes — and it copies the real screen's wording and
   * CAPITALISATION so that no assertion is rejecting it by accident of case.
   */
  const LYING_FORM = [
    '<p class="muted" data-testid="studio-cost">This costs credits.</p>',
    '<p class="muted" data-testid="studio-no-results-basis">No results yet.</p>',
    '<p class="muted" data-testid="studio-no-stream">Nothing appears until it is ready.</p>',
    '<p role="status" data-testid="studio-status"></p>',
  ].join("");

  const LYING_RESULT = [
    '<div role="status" data-testid="studio-result" class="panel">',
    '<h2>Your hooks</h2>',
    '<ol data-testid="studio-hooks"><li></li><li></li><li></li></ol>',
    '<h3>Why this performs</h3>',
    '<p data-testid="studio-why-reasoning">Each hook opens on something concrete.</p>',
    '<p data-testid="studio-weakest-point"><strong>Weakest point:</strong></p>',
    '<div data-testid="studio-kill-test"><h3>What the checks found</h3>',
    // A STATIC HEADING CARRYING THE VERDICT'S OWN VOCABULARY. This is what
    // makes the marker's LOCATION load-bearing rather than only its pattern:
    // pointed at the block CONTAINER, `/hard rules/i` is satisfied by this
    // heading with the verdict line empty — which is the shipped defect in its
    // second form. Pointed at `studio-kill-test-outcome`, it is not.
    '<h4>How the hard rules are applied</h4>',
    '<p data-testid="studio-kill-test-outcome"></p>',
    '<p class="muted" data-testid="studio-traceability-note"></p></div>',
    '<p data-testid="studio-charge">Your balance was updated.</p>',
    "</div>",
  ].join("");

  it("THE LYING SCREEN: every one of the eight assertions rejects it", () => {
    // THE CLASS, NOT THE THREE INSTANCES. A pattern that passes a screen
    // rendering the marker and nothing real is not paying for a ban removal —
    // it is a keyword search. So all eight are driven against the same fake at
    // once, and the assertion is on the WHOLE list rather than on a subset:
    // `arrayContaining` here would let a future entry be added weak.
    const failures = positiveFailures({ form: LYING_FORM, result: LYING_RESULT });
    expect(failures.map((f) => f.split(":")[0]).sort()).toEqual(
      STUDIO_POSITIVE_ASSERTIONS.map((a) => a.testId).sort()
    );
    // ...and every one of them fails on its CONTENT, never because the marker
    // is missing — the lying screen renders all eight markers, which is the
    // property that made it able to pass seven of them.
    expect(failures.filter((f) => f.endsWith("not rendered"))).toEqual([]);
  });

  it("NON-VACUITY: the harness FAILS on a screen that stopped doing the thing", () => {
    // A harness that passes on anything is the failure mode this block exists
    // to avoid, so every entry is driven against a render that broke it.
    //
    // THE RESULT SIDE: a draft with no hooks, no weakest point, no limit note,
    // no charge line and no kill test — i.e. the screen quietly stopping.
    const gutted = renderOutcome({
      status: "usable",
      generationId: "g",
      modeId: "hooks",
      modeLabel: "Hooks",
      document: {
        hooks: [],
        whyThisPerforms: { reasoning: "R", weakestPoint: " " },
        disclosure: { platform: "TikTok", guidance: "G" },
      },
      killTest: {
        ...KILL_TEST,
        limitNote: "nothing to say",
        verdicts: [],
        traceability: [],
      },
      charge: { creditsChargedNow: 0, balanceAfter: 0 },
      privateFrameworksNotUsed: null,
    });
    const resultFailures = positiveFailures({ form: renderView(), result: gutted });
    expect(resultFailures.map((f) => f.split(":")[0])).toEqual(
      expect.arrayContaining([
        "studio-hooks",
        "studio-weakest-point",
        "studio-traceability-note",
      ])
    );

    // THE FORM SIDE: strip the panel entirely (the shape a screen takes if the
    // control is deleted or the props stop being passed).
    const formFailures = positiveFailures({
      form: renderView({ run: null }),
      result: renderOutcome(USABLE),
    });
    expect(formFailures.map((f) => f.split(":")[0])).toEqual(
      expect.arrayContaining([
        "studio-cost",
        "studio-no-stream",
        "studio-no-results-basis",
      ])
    );

    // ...and the charge line, which is the one that would be missed by a scan
    // over words alone: it renders, but with no balance in it.
    const noBalance = renderOutcome(USABLE).replace(/Your balance is now [^<]*/, "");
    expect(
      positiveFailures({ form: renderView(), result: noBalance }).map(
        (f) => f.split(":")[0]
      )
    ).toContain("studio-charge");
  });

  it("the form's spend control is absent when the screen may not offer it", () => {
    const blocked = renderView({
      run: { ...baseView.run!, block: { reason: "You have viewer access." } },
    });
    expect(blocked).not.toContain('name="input"');
    expect(renderView()).toContain('name="input"');
  });

  it("the n = 0 statement is unconditional and denies holding evidence about the creator", () => {
    // R21 in one assertion: the results loop is slice 9, so the product has
    // logged nothing about this person and must not imply otherwise.
    expect(NO_RESULTS_BASIS).toMatch(/no results of yours have been logged/i);
    expect(NO_RESULTS_BASIS).toMatch(/not measuring you/i);
    expect(NO_RESULTS_BASIS).toMatch(/built from the brain you confirmed/i);
    // It renders on the FORM, before the press — the claim it forecloses is one
    // a reader forms while deciding to spend, not after.
    expect(renderView()).toContain('data-testid="studio-no-results-basis"');
    // ...in every offered state, including the blocked ones.
    for (const block of [null, { reason: "viewer" }]) {
      expect(renderView({ run: { ...baseView.run!, block } })).toContain(
        NO_RESULTS_BASIS.slice(0, 40)
      );
    }
  });

  it("no rendered state predicts how a draft will do", () => {
    // The sharpest single probe for R20/R21's shared claim, kept separate from
    // the word scan because it is about SHAPE: nothing here forecasts.
    for (const html of [renderView(), renderOutcome(USABLE), renderOutcome(HONEST_REFUSAL)]) {
      const text = visibleCopy(html).toLowerCase();
      expect(text).not.toMatch(/\bwill (get|do|land|hit|work)\b/);
      expect(text).not.toMatch(/\bbest[- ]performing\b/);
      expect(text).not.toMatch(/\bproven to\b/);
    }
  });
});

// ------------------------------------------ streaming: deferred, and it says so

describe("streaming is deferred, and the screen says so rather than implying it", () => {
  it("the note names what does not happen, and the control claims no vendor call", () => {
    expect(NO_STREAM_NOTE).toMatch(/nothing appears until/i);
    expect(NO_STREAM_NOTE).toMatch(/part-written draft is never shown/i);
    const html = renderView();
    expect(html).toContain('data-testid="studio-no-stream"');
    // The idle label is what a reader sees before pressing.
    expect(html).toContain("Make a draft");
    // THE PENDING LABEL IS A SOURCE ASSERTION, and it has to be: `useFormStatus`
    // reports `pending: false` under `renderToStaticMarkup`, so the busy label
    // is a string no static render can produce. Asserting it here is weaker
    // than rendering it and stronger than not checking it at all — and the
    // property it protects is real: "Running the model…" would be FALSE on the
    // dozen refusal paths that never contact a vendor (the onboarding control
    // shipped that exact sentence and a gate removed it).
    const panelSrc = read("app/(product)/studio/studio-panel.tsx");
    // SLICE 7 REPLACED THE LITERAL WITH `PREPARING_LABEL`, and the property is
    // unchanged and stronger: the busy label is a constant a test can read and
    // scan for the vocabulary of live generation (R16), rather than a string
    // typed into the component.
    expect(panelSrc).toContain("pendingLabel={PREPARING_LABEL}");
    expect(PREPARING_LABEL).toMatch(/prepar/i);
    expect(panelSrc).not.toContain("Running the model");
    expect(panelSrc).not.toContain('pendingLabel="Saving');
  });

  it("the live region is present at load and starts EMPTY", () => {
    const html = renderView();
    expect(html).toContain('data-testid="studio-status"');
    // A region that MOUNTS already populated is announced inconsistently; one
    // present at load that then CHANGES is the reliable half of the pattern.
    expect(html).toMatch(/data-testid="studio-status"[^>]*><\/p>/);
  });
});

// ------------------------------------------------------------ the shell itself

describe("the screen's shape", () => {
  it("offers exactly the modes the SERVER said are available, and no others", () => {
    const html = renderView();
    expect(html).toContain('name="mode"');
    for (const mode of MODES) {
      const offered = mode.status === "available";
      expect(
        html.includes(`value="${mode.id}"`),
        `${mode.label} (${mode.status}) is ${offered ? "missing from" : "offered by"} the picker`
      ).toBe(offered);
    }
    // THE LABELS OF THE REFUSED ONES ARE STILL SAID, in the note above the
    // control, with WHICH refusal applies — a picker that simply omitted them
    // would leave a creator unable to tell "not in my plan" from "does not
    // exist".
    expect(decoded(html)).toContain(modeAvailabilityNote(MODES));
    for (const p of PLATFORM_OPTIONS) expect(html).toContain(p);
  });

  it("a plan with NO available mode is a named state, not an empty picker", () => {
    const none = FREE_MODES.map((m) => ({ ...m, status: "not_in_plan" as const }));
    const html = renderView({
      run: {
        ...baseView.run!,
        modes: none,
        costSentence: generateCostSentence(none, 3),
      },
    });
    expect(html).toContain('data-testid="studio-no-modes"');
    expect(html).not.toContain('name="mode"');
    // ...and the note still lists every mode and why each is not offered.
    expect(decoded(html)).toContain(modeAvailabilityNote(none));
  });

  it("names where the charge appears and where the brain comes from", () => {
    const html = renderView();
    expect(html).toContain('href="/usage"');
    expect(html).toContain('href="/brain"');
  });

  it("a workspace with no profile is told where to start, not shown a spend control", () => {
    const html = renderView({ profileName: null, run: null });
    expect(html).toContain('data-testid="studio-no-profile"');
    expect(html).toContain('href="/onboarding"');
    expect(html).not.toContain('name="input"');
  });

  it("a `?e=` code renders as an alert with the studio's own words", () => {
    const html = renderView({ error: studioErrorFor("brain_not_activated") });
    expect(html).toContain('data-testid="studio-action-error"');
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/no activated brain/i);
  });
});

// ===========================================================================
// SLICE 7 — the rest of the Studio.
// ===========================================================================

// ------------------------------------------- R18: EVERY mode, not the easy two

describe("R18: 'why this performs' names the weakest point on EVERY mode", () => {
  /**
   * ONE DOCUMENT PER SECTION SHAPE the six reachable modes produce.
   *
   * THE POPULATION IS THE SECTIONS, NOT THE MODES, and that is deliberate: the
   * screen has no per-mode branch at all (a mode is "a data entry in the
   * registry, not a branch" — R1), so what could differ between two modes is
   * exactly which sections their document carries. Driving every section shape
   * drives every mode's render, and it keeps driving them if a seventh mode
   * arrives with the same sections.
   */
  const DOCUMENTS: [string, ScriptDocument][] = [
    ["a hook set", HOOKS_DOCUMENT],
    [
      "a caption",
      { ...UNIVERSAL, caption: { text: "Two minutes on why this fails.", hashtags: ["#one"] } },
    ],
    [
      "an idea batch",
      {
        ...UNIVERSAL,
        ideas: [
          { hook: "The bit nobody films.", thesis: "Setup costs more than the shoot.", framework: "The Confession Arc" },
          { hook: "I stopped doing this.", thesis: "Volume was the wrong lever.", framework: "The Reversal" },
          { hook: "Nine minutes, one take.", thesis: "Constraints make the edit.", framework: "The Constraint" },
        ],
      },
    ],
    [
      "a full script",
      {
        ...UNIVERSAL,
        thesis: { statement: "Batch cooking fails on reheating.", why: "It is the step nobody films." },
        framework: { name: "The Confession Arc", why: "It earns the correction." },
        hooks: HOOKS_DOCUMENT.hooks,
        beats: [
          { atSeconds: 0, vo: "Here is the pan.", isTurn: false },
          { atSeconds: 7, vo: "And here is where it went wrong.", isTurn: true },
        ],
        shotMap: [{ beatIndex: 1, shot: "Close on the pan", note: "Handheld, no tripod" }],
        onScreenText: [{ atSeconds: 2, text: "day three" }],
        caption: { text: "The reheating step.", hashtags: ["#batch"] },
      },
    ],
  ];

  it.each(DOCUMENTS)(
    "%s renders its weakest point beside the reasoning",
    (_label, document) => {
      const html = decoded(renderOutcome(usableWith(document)));
      expect(html).toContain('data-testid="studio-weakest-point"');
      expect(html).toContain(document.whyThisPerforms.weakestPoint);
      expect(html).toContain(document.whyThisPerforms.reasoning);
      expect(html).not.toContain('data-testid="studio-why-withheld"');
    }
  );

  it.each(DOCUMENTS)(
    "%s WITHHOLDS the reasoning when the weakest point is blank — the false branch, per mode",
    (_label, document) => {
      // CLAUDE.md, 2026-08-26: a required field reads exactly like a guard and
      // is not one until a test drives its false branch. R18's whole content is
      // that this holds on EVERY mode rather than on the two where it was easy,
      // so the false branch is driven per document shape and not once.
      const html = renderOutcome(
        usableWith({
          ...document,
          whyThisPerforms: { reasoning: "SECRET_REASONING", weakestPoint: "  " },
        })
      );
      expect(html).toContain('data-testid="studio-why-withheld"');
      expect(html).not.toContain("SECRET_REASONING");
      expect(html).not.toContain('data-testid="studio-weakest-point"');
    }
  );

  it("ONE renderer, so a mode cannot acquire a second one that forgets", () => {
    // THE MECHANISM BEHIND THE TWO CASES ABOVE, asserted rather than described.
    // R18 breaks the day a per-mode block renders `reasoning` on its own, so
    // the source may hold exactly one `whyThisPerformsView` call site.
    const src = read("app/(product)/studio/generation-outcome.tsx");
    const calls = [...src.matchAll(/whyThisPerformsView\(/g)].length;
    expect(calls, "a second 'why this performs' renderer has appeared").toBe(1);
    // ...and no per-mode branch: the document decides what renders, not the id.
    expect(src, "the renderer branches on the mode id").not.toMatch(
      /state\.modeId ===|document\.modeId|switch \(.*modeId/
    );
  });

  it("each mode's OWN sections render, and another mode's do not appear", () => {
    // NON-VACUITY for the loop above: if `Document` rendered nothing at all,
    // every weakest-point assertion would still pass on the universal half.
    const caption = decoded(renderOutcome(usableWith(DOCUMENTS[1][1], "Caption")));
    expect(caption).toContain('data-testid="studio-caption"');
    expect(caption).toContain("Two minutes on why this fails.");
    expect(caption).not.toContain('data-testid="studio-hooks"');
    expect(caption).not.toContain('data-testid="studio-beats"');

    const ideas = decoded(renderOutcome(usableWith(DOCUMENTS[2][1], "Ideation")));
    expect(ideas).toContain('data-testid="studio-ideas"');
    // REQ-C01 mode 7: an idea is hook + thesis + framework, NEVER a topic — so
    // all three fields are on the page, not just the opening line.
    expect(ideas).toContain("The bit nobody films.");
    expect(ideas).toContain("Setup costs more than the shoot.");
    expect(ideas).toContain("The Confession Arc");
    expect(ideas).not.toContain('data-testid="studio-caption"');

    const script = decoded(renderOutcome(usableWith(DOCUMENTS[3][1], "Idea to script")));
    for (const id of [
      "studio-thesis",
      "studio-framework",
      "studio-hooks",
      "studio-beats",
      "studio-shot-map",
      "studio-on-screen-text",
      "studio-caption",
    ]) {
      expect(script, id).toContain(`data-testid="${id}"`);
    }
    // PRD §46: the turn is marked IN WORDS, never by styling alone.
    expect(script).toContain('data-testid="studio-beat-turn"');
    expect(script).toMatch(/where the piece changes direction/i);
    expect(script).not.toContain('data-testid="studio-ideas"');
  });

  it("the mode is NAMED on the result, so a creator knows which one they got", () => {
    expect(renderOutcome(usableWith(HOOKS_DOCUMENT, "Caption"))).toContain("Caption");
  });
});

// ---------------------------------------- R16: streaming deferred, HONESTLY

describe("R16: the output is 'being prepared', and nothing implies a stream", () => {
  it("the busy label says PREPARED, and never that text is arriving", () => {
    expect(PREPARING_LABEL).toMatch(/prepar/i);
    // THE VOCABULARY OF LIVE GENERATION, banned on the one label a creator
    // reads while the request is in flight. A label saying the model is
    // "writing" is a claim that a stream exists, and none does.
    for (const claim of ["writing", "typing", "streaming", "so far", "generating now"]) {
      expect(PREPARING_LABEL.toLowerCase(), claim).not.toContain(claim);
    }
    const panelSrc = read("app/(product)/studio/studio-panel.tsx");
    expect(panelSrc).toContain("pendingLabel={PREPARING_LABEL}");
  });

  it("NO progress element, NO percentage and NO placeholder on ANY generation screen", () => {
    // R16's exact words: "an animated placeholder that suggests live generation
    // is a claim". A source scan rather than a render assertion, because the
    // thing being forbidden is markup a styling pass would add, and it must be
    // forbidden in every state rather than in the one a fixture drives.
    //
    // THE SHAPES, THE SPECIMEN AND THE POPULATION MOVED TO
    // `tests/support/no-streaming.ts` (spin-compliance gate, 2026-09-01). They
    // were written here and walked `app/(product)/studio/` alone; slice 7 added
    // a SECOND screen that runs a real generation, and its own scan read one of
    // that directory's five files and covered three of the six shapes. Both
    // trees were clean, so nothing was broken — but a `skeleton` class added to
    // `first-ideas-view.tsx` would have shipped green. The population is now a
    // LIST of directories, and a third generation screen costs an entry.
    expect(
      shapesMatchingSpecimen(),
      "a shape's pattern matches nothing, so the scan is broken"
    ).toEqual(STREAM_SHAPES.map(([label]) => label));
    // ...and the population is not a set of paths that quietly read nothing.
    const counts = generationScreenFileCounts(ROOT);
    expect(Object.keys(counts)).toEqual([...GENERATION_SCREEN_DIRS]);
    for (const [dir, n] of Object.entries(counts)) {
      expect(n, `${dir} contributes no files to the scan`).toBeGreaterThan(0);
    }
    expect(streamingViolations(ROOT)).toEqual([]);
  });

  it("the studio directory is IN that population, and so is the second screen", () => {
    // A REGRESSION WITNESS FOR THE INSTANCE, beside the derived scan for the
    // class: the whole defect was a population that covered one screen, so the
    // two entries that exist today are pinned by name. Deleting either makes
    // `streamingViolations` go green by shrinking what it reads.
    expect(GENERATION_SCREEN_DIRS).toContain("app/(product)/studio");
    expect(GENERATION_SCREEN_DIRS).toContain(
      "app/(product)/onboarding/first-ideas"
    );
    expect(GENERATION_SCREEN_DIRS).toContain("app/(product)/trends");
    // Every file the old studio-only walker read is still read by the new one.
    const covered = new Set(generationScreenFiles(ROOT));
    for (const file of studioSourceFiles()) expect(covered.has(file)).toBe(true);

    // AND THE LIST IS COMPLETE, DERIVED RATHER THAN TRUSTED. A list narrows the
    // day somebody forgets an entry — the same failure one level up — so the
    // completeness is a scan of the WHOLE `app/` tree: R18 puts every mode's
    // result through one renderer, so a file importing `generation-outcome` is
    // on a screen that shows a generation and its directory belongs in the
    // population. A third generation screen turns this red until it is listed.
    expect(
      unlistedGenerationScreenFiles(ROOT),
      "a screen renders a generation and is not in GENERATION_SCREEN_DIRS"
    ).toEqual([]);
    // NON-VACUITY: the scan finds real importers rather than nothing at all.
    expect(generationOutcomeImporters(ROOT)).toBeGreaterThanOrEqual(2);
  });

  it("NON-VACUITY: the completeness scan CATCHES a planted third screen", () => {
    // PLANTED IN A SYNTHETIC ROOT, NEVER IN `app/`. These walkers read a real
    // application directory and a probe written there is visible to every other
    // scan running concurrently — the same reason the six shapes' specimen is a
    // string. `unlistedGenerationScreenFiles` takes its root as a parameter
    // precisely so this can be driven against a tree that is not the product's.
    const fake = mkdtempSync(join(tmpdir(), "respin-screen-scan-"));
    try {
      const dir = join(fake, "app", "(product)", "results", "spin");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "spin-result.tsx"),
        [
          'import { GenerationOutcome } from "../../studio/generation-outcome";',
          "export const X = GenerationOutcome;",
        ].join("\n"),
        "utf8"
      );
      // A second file that does NOT import it stays out of the report, so the
      // scan is measuring the import rather than the directory.
      writeFileSync(
        join(dir, "copy.ts"),
        'export const A = "generation-outcome";',
        "utf8"
      );
      const unlisted = unlistedGenerationScreenFiles(fake);
      expect(unlisted).toHaveLength(1);
      expect(unlisted[0]).toContain("spin-result.tsx");
      expect(generationOutcomeImporters(fake)).toBe(1);
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });

  it("ignores disposable probe directories without narrowing the real screen scan", () => {
    const fake = mkdtempSync(join(tmpdir(), "respin-screen-probe-scan-"));
    try {
      const realDir = join(fake, "app", "(product)", "results", "spin");
      const probeDir = join(fake, "app", "__scan_probe__");
      mkdirSync(realDir, { recursive: true });
      mkdirSync(probeDir, { recursive: true });
      const importer =
        'import { GenerationOutcome } from "../studio/generation-outcome";\n' +
        "export const X = GenerationOutcome;\n";
      writeFileSync(join(realDir, "spin-result.tsx"), importer, "utf8");
      writeFileSync(join(probeDir, "probe.tsx"), importer, "utf8");

      const unlisted = unlistedGenerationScreenFiles(fake);
      expect(unlisted).toHaveLength(1);
      expect(unlisted[0]).toContain("spin-result.tsx");
      expect(generationOutcomeImporters(fake)).toBe(1);
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });

  it("NON-VACUITY: the SHAPE scan catches the specimen planted as a FILE, in EVERY listed directory", () => {
    // A GUARD THAT SCANS SOURCE FAILS OPEN WHEN ITS PATTERN BREAKS, AND THIS
    // ONE HAD NO WITNESS AT ALL AS A SCAN (spin-compliance gate, 2026-09-02).
    // `shapesMatchingSpecimen` tests the six patterns against a STRING; nothing
    // tested the composed walk against a FILE. MEASURED: replacing `codeOnly`'s
    // body with `return ""` left `streamingViolations(ROOT) = []`, all six
    // labels still matching the specimen and every file count unchanged — so
    // all three assertions above stayed green while `skeleton`, `shimmer` and
    // the whole streaming vocabulary were sayable on both screens. That is the
    // 2026-08-21 lesson in the file whose header claims to have closed it.
    //
    // PLANTED AS A FILE, IN A SYNTHETIC ROOT, PER DIRECTORY — the same
    // discipline as the completeness plant above, and per-directory because a
    // walker that silently reads only the first entry would otherwise pass.
    const fake = mkdtempSync(join(tmpdir(), "respin-stream-scan-"));
    try {
      for (const rel of GENERATION_SCREEN_DIRS) {
        const dir = join(fake, rel);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "planted-view.tsx"), STREAM_SPECIMEN, "utf8");
        // ...and a file whose ONLY carrier of the word shapes is a comment.
        // It must NOT appear: the sentences explaining why nothing streams
        // necessarily say "skeleton", "shimmer" and "streaming", and a scan
        // that reported them would delete the explanation and keep the rule.
        // This is also the half that fails if `codeOnly` stops stripping.
        writeFileSync(
          join(dir, "prose-only.tsx"),
          [
            "// No skeleton, no shimmer, and nothing streaming here.",
            "/* A shimmer animation would be a claim. */",
            "export const A = 1;",
          ].join("\n"),
          "utf8"
        );
      }
      const violations = streamingViolations(fake);
      for (const rel of GENERATION_SCREEN_DIRS) {
        const forDir = violations.filter((v) => v.includes("planted-view"));
        const here = forDir.filter((v) => v.replace(/\\/g, "/").includes(rel));
        expect(
          here.map((v) => v.slice(v.indexOf(": ") + 2)).sort(),
          `the scan missed a shape in ${rel}`
        ).toEqual([...STREAM_SHAPES.map(([label, , scope]) => `${label} (${scope})`)].sort());
      }
      expect(
        violations.filter((v) => v.includes("prose-only")),
        "a comment-only file was reported — the stripper is gone and the prose is now unwritable"
      ).toEqual([]);
      // The count is the whole population's, so a walker that read one
      // directory would fail here even if the per-directory filter did not.
      expect(violations).toHaveLength(
        STREAM_SHAPES.length * GENERATION_SCREEN_DIRS.length
      );
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });

  it("the rendered screen says what does NOT happen, in both clauses", () => {
    const html = decoded(renderView());
    expect(html).toContain('data-testid="studio-no-stream"');
    expect(html).toContain(NO_STREAM_NOTE);
    expect(NO_STREAM_NOTE).toMatch(/nothing appears until/i);
    expect(NO_STREAM_NOTE).toMatch(/part-written draft is never shown/i);
  });

  it("a killed check leaves NO draft on screen — the refusal replaces it (question 3)", () => {
    // VERIFICATION 10 / MUTATION M6. A draft that failed the checks is not
    // rendered greyed, collapsed or behind a warning: `GenerationRun`'s refused
    // branch carries no output at all, and the screen shows the refusal, its
    // reasons, a sharper angle — and the SPEND.
    const html = decoded(renderOutcome(HONEST_REFUSAL));
    expect(html).toContain('data-testid="studio-honest-refusal"');
    // NO DRAFT, in any of the six modes' section markers.
    for (const id of [
      "studio-hooks",
      "studio-ideas",
      "studio-beats",
      "studio-shot-map",
      "studio-on-screen-text",
      "studio-caption",
      "studio-thesis",
      "studio-framework",
    ]) {
      expect(html, `${id} is rendered on an honest refusal`).not.toContain(
        `data-testid="${id}"`
      );
    }
    // ...and the refusal NAMES THE SPEND, which is the half a creator who
    // watched a draft not appear would otherwise read as a bug.
    expect(html).toContain('data-testid="studio-charge"');
    expect(html).toContain("That cost 5 credits.");
    expect(html).toMatch(/An honest refusal is the product working/);
  });
});

// ------------------------------------------- R6/R9: revision and its lineage

describe("R6/R9: a revision, and a lineage a creator can read", () => {
  const entry = (over: Partial<StudioActionState["lineage"][number]> = {}) => ({
    generationId: "g1",
    attemptId: "a1",
    modeId: "hooks",
    modeLabel: "Hooks",
    parentGenerationId: null,
    note: "batch cooking, the reheating step",
    outcome: "usable" as const,
    revisable: true,
    ...over,
  });

  /**
   * THE PURE COMPONENT, RENDERED DIRECTLY — and the reason is a defect this
   * suite caught in its own first draft.
   *
   * `useActionState` yields only its INITIAL state under
   * `renderToStaticMarkup`, so a chain rendered inside `StudioPanel` is a state
   * no test can drive: every assertion below failed against an empty render
   * until `LineageList` was extracted. That is the same rule
   * `generation-outcome.tsx` already obeyed, applied to the two blocks slice 7
   * added.
   */
  const withLineage = (lineage: LineageEntry[]) =>
    decoded(renderToStaticMarkup(<LineageList lineage={lineage} />));

  it("lineageLineFor says WHICH output came from which, and WHAT the note said", () => {
    // R9, verbatim. Both halves, from the row's own fields.
    const root = lineageLineFor({
      index: 0,
      modeLabel: "Hooks",
      parentIndex: null,
      note: "batch cooking",
    });
    expect(root).toContain("#1");
    expect(root).toMatch(/a first draft, not a revision/i);
    expect(root).toContain("batch cooking");

    const child = lineageLineFor({
      index: 2,
      modeLabel: "Hooks",
      parentIndex: 0,
      note: "make the second one blunter",
    });
    expect(child).toContain("#3");
    expect(child).toMatch(/revised from #1/);
    expect(child).toContain("make the second one blunter");

    // A REVISION WITH NO NOTE SAYS SO rather than rendering an empty quote.
    expect(
      lineageLineFor({ index: 1, modeLabel: "Hooks", parentIndex: 0, note: "   " })
    ).toMatch(/No note was sent with it/);
  });

  it("the rendered chain resolves a parent by its GENERATION ID, not by position", () => {
    // THE DEFECT THIS RULES OUT: "the one before it" renders a lineage that
    // looks right and is a guess. The middle entry below is an original, so a
    // position-based renderer would call the third a revision of it.
    const html = withLineage([
      entry({ generationId: "g1", attemptId: "a1" }),
      entry({ generationId: "g2", attemptId: "a2", note: "a different idea" }),
      entry({
        generationId: "g3",
        attemptId: "a3",
        parentGenerationId: "g1",
        note: "blunter, please",
      }),
    ]);
    expect(html).toContain('data-testid="studio-lineage"');
    expect(html).toContain(
      lineageLineFor({ index: 2, modeLabel: "Hooks", parentIndex: 0, note: "blunter, please" })
    );
    expect(html).not.toContain(
      lineageLineFor({ index: 2, modeLabel: "Hooks", parentIndex: 1, note: "blunter, please" })
    );
  });

  it("a parent OUTSIDE the view renders as an original's line, never as a wrong number", () => {
    // The chain is bounded and this page's own; a `parent_id` naming a
    // generation that is not in view must not be printed as "#0" or "#NaN".
    const html = withLineage([
      entry({ generationId: "g9", attemptId: "a9", parentGenerationId: "gone" }),
    ]);
    expect(html).not.toMatch(/revised from #(0|NaN|null|undefined)/);
    expect(html).toMatch(/a first draft, not a revision/i);
  });

  it("the honest limit of this view is STATED, and it names where the durable record is", () => {
    // R9's uncomfortable half: `generations.parent_id` is stored, immutable and
    // same-tenant, and there is no scoped reader for it in `@respin/db` — so
    // this list is what the page has run since it loaded. A list that looks
    // like history and empties on reload teaches a creator the product forgot
    // their work.
    const html = withLineage([entry()]);
    expect(html).toContain('data-testid="studio-lineage-scope"');
    expect(html).toMatch(/a reload empties it/i);
    expect(html).toMatch(/stored with each draft and are not lost/i);
    expect(html).toMatch(/export/i);
  });

  it("...and it names WHICH FILE of the export, because an export is two files", () => {
    // MEASURED, NOT ASSUMED (tenancy gate, 2026-09-01). The sentence said "your
    // export carries every draft, which one it was revised from, and the note
    // you sent with it". That is TRUE of the JSON and FALSE of the markdown
    // projection, which carries the brain documents and the quotes behind them
    // and no generation history at all — and the markdown is the file a creator
    // is most likely to open. `/export`'s own header is the only place the
    // split was stated, so the studio screen was describing a file its reader
    // would not find the lineage in.
    const html = withLineage([entry()]);
    expect(html).toMatch(/JSON file in your export/i);
    expect(LINEAGE_SCOPE_NOTE).toMatch(/markdown file/i);
    // AN UNQUALIFIED PROMISE IS THE DEFECT, so that is what is measured: EVERY
    // claim about what the export carries has to name the file it is true of.
    const unqualified = (sentence: string): string[] =>
      [...sentence.matchAll(/(.{0,40})export carries/gi)]
        .map(([, before]) => before)
        .filter((before) => !before.toLowerCase().includes("json"));
    expect(
      unqualified(LINEAGE_SCOPE_NOTE),
      "a claim about the export names no file, so it is false of the markdown"
    ).toEqual([]);
    // NON-VACUITY: the check really does catch the sentence that shipped, and
    // it really does find a claim to check in the sentence that replaced it.
    expect(
      unqualified(
        "The links themselves are stored with each draft and are not lost — your export carries every draft."
      )
    ).toHaveLength(1);
    expect(
      [...LINEAGE_SCOPE_NOTE.matchAll(/export carries/gi)].length
    ).toBeGreaterThan(0);

    // THE OTHER HALF OF THE AGREEMENT, read from the file that owns it: the day
    // the markdown projection grows a generation history, this goes red and the
    // sentence above gets re-read rather than left stale.
    const exportSrc = readFileSync(
      join(ROOT, "packages", "db", "src", "export.ts"),
      "utf8"
    );
    expect(
      exportSrc,
      "EXPORT_MARKDOWN_SCOPE no longer says the generation history is JSON-only"
    ).toMatch(/EXPORT_MARKDOWN_SCOPE =[\s\S]{0,400}?generation history[\s\S]{0,60}?JSON/i);
  });

  it("a refused run STAYS in the chain, labelled — hiding it would hide a charge", () => {
    const html = withLineage([
      entry({ generationId: "g1", attemptId: "a1" }),
      entry({
        generationId: "g2",
        attemptId: "a2",
        outcome: "honest_refusal",
        revisable: false,
        note: "the one that died",
      }),
    ]);
    expect(html).toContain("the one that died");
    expect(html).toMatch(/this one was refused/i);
  });

  it("only a REVISABLE entry is offered as a parent — a refusal is not offered", () => {
    // An honest refusal stored no draft, so `resolveRevisionParent` would
    // certainly refuse it (`not_revisable`). Offering it would be a control
    // whose only outcome is a refusal.
    //
    // THE PICKER IS CLIENT STATE, so the property is asserted where it is
    // decided: `revisable` is server-derived (`lineageEntryFor` sets it from
    // the run's own outcome) and the panel filters on it. Both halves, because
    // either alone is satisfiable while the other is broken.
    const projectionSrc = read("app/(product)/studio/projection.ts");
    expect(projectionSrc).toMatch(/revisable: outcome === "usable"/);
    const panelSrc = read("app/(product)/studio/studio-panel.tsx");
    expect(panelSrc).toContain(".filter(({ entry }) => entry.revisable)");
    expect(panelSrc).toContain("revisable.map(({ entry, index }) =>");
  });

  it("the picker numbers a draft the way the CHAIN numbers it", () => {
    // FOUND BY RE-READING THE DIFF (2026-09-01). The picker mapped over the
    // FILTERED list and passed that index to `lineageChoiceLabel`, while
    // `LineageList` numbers every entry — refusals included. So an output the
    // chain called "#3" was offered as "#2": two numbering systems for one
    // draft, on the control that decides which draft is revised.
    const panelSrc = read("app/(product)/studio/studio-panel.tsx");
    // The filter carries the ORIGINAL index alongside the entry.
    //
    // TWO `toContain` CALLS RATHER THAN ONE MULTILINE REGEX, and that is not
    // style: the first draft of this assertion used a `\s*\n?\s*` bridge and
    // esbuild refused the file — CLAUDE.md's 2026-08-21 lesson, caught by a
    // parse error rather than by a silently-matching-nothing scan, which is the
    // lucky half of that class.
    expect(panelSrc).toContain(".map((entry, index) => ({ entry, index }))");
    expect(panelSrc).toContain(".filter(({ entry }) => entry.revisable)");
    // ...and that index — never the position in the filtered list — is what
    // the label is built from.
    expect(panelSrc).toMatch(/lineageChoiceLabel\(index, entry\.modeLabel, entry\.note\)/);
    expect(panelSrc).not.toMatch(/revisable\.map\(\(entry, i\)/);
    // AND THE TWO LABELLERS AGREE ON WHAT "#n" MEANS: both are 1-based on the
    // same index, which is the property the defect broke.
    expect(lineageChoiceLabel(2, "Hooks", "x")).toContain("#3");
    expect(
      lineageLineFor({ index: 2, modeLabel: "Hooks", parentIndex: null, note: "x" })
    ).toContain("#3");
  });

  it("the chain is KEYED on the attempt id, which is unique per press", () => {
    // `generationId` is NOT unique within a chain: R14c's replay returns the
    // generation a CONCURRENT settlement wrote, so two entries can carry the
    // same one and React would silently reuse a node between two rows.
    const src = read("app/(product)/studio/lineage-view.tsx");
    expect(src).toContain("key={entry.attemptId}");
    expect(src).not.toContain("key={entry.generationId}");
  });

  it("lineageChoiceLabel names the mode and the note, and never a timestamp", () => {
    // The chain is this session's, so "3 minutes ago" would be precision about
    // something the screen is about to admit it does not durably hold.
    const label = lineageChoiceLabel(0, "Hooks", "batch cooking, the reheating step");
    expect(label).toContain("#1");
    expect(label).toContain("Hooks");
    expect(label).toContain("batch cooking");
    expect(label).not.toMatch(/\d{1,2}:\d{2}|ago\b|20\d\d/);
    // A LONG NOTE IS TRUNCATED VISIBLY, never silently: an option element with
    // 2,000 characters in it is unusable, and a cut with no marker reads as the
    // note the creator wrote.
    const long = lineageChoiceLabel(0, "Hooks", "x".repeat(300));
    expect(long.length).toBeLessThan(120);
    expect(long).toContain("…");
    // NO NOTE IS SAID, not left blank.
    expect(lineageChoiceLabel(2, "Caption", "   ")).toContain("no note");
  });

  it("the revise control says the kill test RE-RUNS, and that the mode is fixed", () => {
    // The card's question 2, in the copy a creator reads: their model of
    // "revise" is "edit", and an edit does not get re-checked. Here it does,
    // and a revision can be refused where its parent passed — somebody who did
    // not know that would reasonably call it a bug.
    expect(REVISION_NOTE_HELP).toMatch(/same checks from scratch/i);
    expect(REVISION_NOTE_HELP).toMatch(/can be refused where the first one passed/i);
    expect(REVISION_NOTE_HELP).toMatch(/a refusal is charged for/i);
    expect(REVISION_SAME_MODE_NOTE).toMatch(/stays in the mode/i);
    // ...and the panel really renders them, rather than the constants merely
    // existing (the lying-screen lesson: a constant nobody renders is copy
    // nobody reads).
    const panelSrc = read("app/(product)/studio/studio-panel.tsx");
    expect(panelSrc).toContain("{REVISION_NOTE_HELP}");
    expect(panelSrc).toContain("{REVISION_SAME_MODE_NOTE}");
  });

  it("A DISABLED MODE SELECT SUBMITS NOTHING, so a revision carries a hidden mode", () => {
    // TWO DEFECTS FROM ONE RE-READ OF THIS DIFF, and this is the first.
    //
    // A revision stays in its parent's mode, so the mode `<select>` is
    // `disabled` when a parent is chosen — and HTML bars a disabled control
    // from submission ENTIRELY, so `mode` reached the action as `""` and every
    // revision was refused with `UnknownModeError`. The whole revision path was
    // dead and nothing typed would have said so: `mode` is deliberately cast at
    // the action boundary, because the set of modes lives in a package
    // `app/**` may not import.
    //
    // Asserted at the SOURCE because the pairing is what matters — a `disabled`
    // select and a hidden field carrying the parent's mode have to travel
    // together, and a render of the idle state (which is all a static render
    // gives) has neither.
    const src = read("app/(product)/studio/studio-panel.tsx");
    expect(src).toMatch(/disabled=\{parent !== null\}/);
    expect(src).toMatch(
      /\{parent !== null \? \(\s*<input type="hidden" name="mode" value=\{parent\.modeId\} \/>/
    );
  });

  it("...and the price line shows the REVISION price, not the mode's (R8)", () => {
    // THE SECOND DEFECT FROM THE SAME RE-READ. With a parent chosen, the line
    // beside the picker showed the selected MODE's cost while the press was
    // going to be charged `creditCosts.revision`. On a 12-credit script revised
    // for 2 that is a money lie on the control that spends it.
    const script: ModeChoiceView = {
      id: "m-b",
      label: "Idea to script",
      status: "available",
      cost: 12,
    };
    const revision = priceLineFor({
      isRevision: true,
      revisionCost: 2,
      mode: script,
      parentModeLabel: "Idea to script",
    });
    expect(revision).toContain("2 credits");
    expect(revision, "the mode's own price is shown for a revision").not.toContain(
      "12"
    );
    expect(revision).toMatch(
      /not at the price of the draft it came from/i
    );
    // ...and an ORIGINAL still shows the mode's price.
    const original = priceLineFor({
      isRevision: false,
      revisionCost: 2,
      mode: script,
      parentModeLabel: null,
    });
    expect(original).toContain("Idea to script costs 12 credits");
    // NON-NEGOTIABLE 6 ON BOTH UNREAD BRANCHES: said, never guessed.
    expect(
      priceLineFor({
        isRevision: true,
        revisionCost: null,
        mode: script,
        parentModeLabel: "Idea to script",
      })
    ).toMatch(/could not be read/);
    expect(
      priceLineFor({
        isRevision: true,
        revisionCost: null,
        mode: script,
        parentModeLabel: "Idea to script",
      })
    ).not.toContain("12");
    expect(
      priceLineFor({
        isRevision: false,
        revisionCost: 2,
        mode: { ...script, cost: null },
        parentModeLabel: null,
      })
    ).toMatch(/could not be read/);
    // A zero price is an ANSWER, never an absence.
    expect(
      priceLineFor({
        isRevision: true,
        revisionCost: 0,
        mode: script,
        parentModeLabel: null,
      })
    ).toContain("nothing");
    // No mode chosen at all is its own sentence rather than a blank.
    expect(
      priceLineFor({
        isRevision: false,
        revisionCost: 2,
        mode: null,
        parentModeLabel: null,
      })
    ).toMatch(/Pick a mode/);
    // ...and the panel really renders this function rather than an inline
    // ternary that could drift back.
    const src = read("app/(product)/studio/studio-panel.tsx");
    expect(src).toContain("priceLineFor({");
    expect(src).toContain("{priceLine}");
  });

  it("with nothing to revise, the form still posts a `revisionOf` field", () => {
    // The action reads ONE name whether or not there is a picker; an absent
    // field and an empty one must be the same thing, because `""` is what
    // "not a revision" means to `generateAction`. The idle render is exactly
    // the "nothing to revise" case, because `useActionState` starts empty.
    const html = renderView();
    expect(html).not.toContain('data-testid="studio-revision-picker"');
    expect(html).toContain('name="revisionOf"');
  });

  it("the action turns an EMPTY revisionOf into an omitted parameter, never into an id", () => {
    // A `<select>` and a hidden field both submit `""` for "no parent", and
    // `GenerateParams` uses `undefined`. Passing `""` through would name an
    // attempt id that cannot exist and turn EVERY original into a
    // `RevisionParentError` — a total outage of the ordinary path, produced by
    // a coercion nobody would look at.
    const src = read("app/(product)/studio/actions.ts");
    expect(src).toMatch(/revisionOf === ""\s*\?\s*\{\}\s*:\s*\{ revisionOfAttemptId: revisionOf \}/);
  });

  it("a refused run REPLACES what is on screen — the previous draft does not stay (M6)", () => {
    // VERIFICATION 10 / MUTATION M6, at the level the mutation would live.
    // The card's question 3: "a streamed draft that fails the check must not
    // remain on screen as though it were output". This architecture does not
    // stream, so the shape that defect takes here is the projection KEEPING the
    // previous `latest` when the new run refused — after which a creator whose
    // revision was killed is looking at the parent's draft with a refusal they
    // may not scroll to. The chain is appended to either way, so the two facts
    // are separable and both are asserted.
    const generation = {
      id: "g2",
      mode: "hooks",
      outcome: "honest_refusal",
      weakestPoint: null,
      refusalReason: "broke a hard rule twice",
      promptBundleVersion: "hooks@abc",
      rewriteCount: 1,
      parentId: "g1",
    };
    const refusedResult = {
      attemptId: "a2",
      replayed: false,
      generation,
      run: {
        status: "refused",
        drafts: 2,
        promptBundleVersion: "hooks@abc",
        killTest: {
          outcome: "failed",
          attempts: 2,
          rewritten: true,
          creatorRulesScored: false,
          creatorRuleVerdicts: [],
          traceabilityLimitNote: "LIMIT",
          finalAttempt: { traceability: [], claims: [] },
        },
        refusal: { headline: "H", why: ["a"], sharperAngle: "S" },
      },
      creditsChargedNow: 5,
      balanceAfter: 10,
      configVersion: 3,
      resolvedTier: "free",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const previous: StudioActionState = {
      lineage: [
        {
          generationId: "g1",
          attemptId: "a1",
          modeId: "hooks",
          modeLabel: "Hooks",
          parentGenerationId: null,
          note: "the first one",
          outcome: "usable",
          revisable: true,
        },
      ],
      latest: USABLE,
    };
    const next = studioActionStateFor(previous, refusedResult, "Hooks", "blunter");
    expect(next.latest.status, "the killed run left the old draft on screen").toBe(
      "honest_refusal"
    );
    // ...and the chain still grew, with the refusal in it and its parent named.
    expect(next.lineage).toHaveLength(2);
    expect(next.lineage[1].outcome).toBe("honest_refusal");
    expect(next.lineage[1].parentGenerationId).toBe("g1");
    // R6: a refused run is NOT offered as a parent — there is no draft in it.
    expect(next.lineage[1].revisable).toBe(false);
    // ...and the note the creator sent is what the chain records for it (R9).
    expect(next.lineage[1].note).toBe("blunter");
  });

  it("the chain is BOUNDED, and the oldest is what drops", () => {
    // It is serialised into the client on every press, so an unbounded list
    // grows the payload of a money control without limit.
    let state: StudioActionState = { lineage: [], latest: { status: "idle" } };
    for (let i = 0; i < LINEAGE_VIEW_MAX + 5; i += 1) {
      state = {
        lineage: [
          ...state.lineage,
          {
            generationId: `g${i}`,
            attemptId: `a${i}`,
            modeId: "hooks",
            modeLabel: "Hooks",
            parentGenerationId: null,
            note: `n${i}`,
            outcome: "usable" as const,
            revisable: true,
          },
        ].slice(-LINEAGE_VIEW_MAX),
        latest: state.latest,
      };
    }
    expect(state.lineage).toHaveLength(LINEAGE_VIEW_MAX);
    expect(state.lineage[0].generationId).toBe(`g${5}`);
    // ...and the projection really applies the same bound.
    expect(read("app/(product)/studio/projection.ts")).toContain(
      "lineage.slice(-LINEAGE_VIEW_MAX)"
    );
  });

  it("the lineage survives a REFUSAL — the drafts already made are not lost", () => {
    const src = read("app/(product)/studio/actions.ts");
    // The catch returns `prev.lineage`, not `[]`. A creator whose fourth press
    // was refused for want of credits must not also lose the three drafts on
    // screen.
    expect(src).toMatch(/lineage: prev\.lineage,/);
  });

  it("every revision-parent reason has its OWN words, and none of them sells anything", () => {
    // `RevisionParentError` carries a CLOSED reason and the four say different
    // things: "not yours", "there was no draft", "wrong mode", "we cannot read
    // it". One code for all four would be false three times out of four.
    const codes = [
      "revision_parent_not_yours",
      "revision_parent_not_revisable",
      "revision_parent_different_mode",
      "revision_parent_unreadable",
      "revision_parent",
    ];
    const seen = new Set<string>();
    for (const code of codes) {
      const copy = studioErrorFor(code)!;
      expect(copy, code).not.toBeNull();
      expect(copy.title.length, code).toBeGreaterThan(5);
      expect(copy.detail.length, code).toBeGreaterThan(40);
      seen.add(copy.detail);
      // R15: no sale on a refusal.
      const text = `${copy.title} ${copy.detail}`.toLowerCase();
      for (const inducement of ["upgrade", "subscribe", "a plan that includes"]) {
        expect(text, `${code}/${inducement}`).not.toContain(inducement);
      }
      // ...and each says what happened to the money.
      expect(text, code).toMatch(/nothing was (generated|spent|taken)/);
    }
    expect(seen.size, "two reasons share one sentence").toBe(codes.length);
  });
});

// ------------------------------------------------- R10/R12: feedback capture

describe("R10/R12: feedback is captured, and the screen says what it does NOT do", () => {
  /**
   * THE PURE COMPONENT, RENDERED DIRECTLY — same reason as the lineage list
   * one describe up: `useActionState` yields only its initial state under a
   * static render, so a feedback block inside `StudioPanel` would be a control
   * no test could drive, on the one control whose entire purpose is a promise
   * about what the product does NOT do with what a creator says.
   */
  const withResult = (state: FeedbackState = { status: "idle" }) =>
    decoded(
      renderToStaticMarkup(
        <FeedbackBlock
          generationId="gen-1"
          reactions={GENERATION_FEEDBACK_REACTIONS}
          noteMax={FEEDBACK_NOTE_MAX}
          formAction={() => {}}
          pending={false}
          state={state}
          refusalCopy={REFUSAL_COPY}
          fallbackCopy={REFUSAL_COPY.unknown}
        />
      )
    );

  it("every reaction the DATABASE has is offered, with real words", () => {
    const html = withResult();
    expect(html).toContain('data-testid="studio-feedback-reactions"');
    expect(GENERATION_FEEDBACK_REACTIONS.length).toBeGreaterThan(3);
    for (const code of GENERATION_FEEDBACK_REACTIONS) {
      expect(html, code).toContain(`value="${code}"`);
      const label = reactionLabel(code);
      // A CODE IS NOT A LABEL. `reactionLabel` falls back to the raw code so a
      // reaction added to the enum shows as SOMETHING rather than vanishing —
      // and this asserts the fallback is not the normal path.
      expect(label, code).not.toBe(code);
      expect(html, code).toContain(label);
    }
  });

  it("the note's ceiling is the DATABASE's number, stated and enforced on the control", () => {
    const html = withResult();
    expect(html).toContain(`maxLength="${FEEDBACK_NOTE_MAX}"`);
    expect(html).toContain(String(FEEDBACK_NOTE_MAX));
    expect(html).toContain('data-testid="studio-feedback-note-limit"');
  });

  it("the note copy does NOT claim the words are stored byte for byte", () => {
    // FOUND BY RE-READING THE DIFF AGAINST THE CAPABILITY (2026-09-01). The
    // first draft said "stored exactly as you type it", and
    // `recordGenerationFeedback` runs `normaliseContent` — NFC plus CRLF→LF —
    // before it writes. `/onboarding`'s paste form already words this honestly
    // ("only line endings are normalised"), and a smaller-than-that claim on
    // the screen whose whole subject is what the product does with a creator's
    // words is the wrong place to round up.
    const limit = feedbackNoteLimit(FEEDBACK_NOTE_MAX);
    expect(limit).not.toMatch(/exactly as you type/i);
    expect(limit).toMatch(/only line endings and unicode form are normalised/i);
    expect(feedbackRecordedSentence("off_voice", true)).not.toMatch(
      /word for word/i
    );
  });

  it("R12: it says what feedback DOES and DOES NOT do today", () => {
    const html = withResult();
    expect(html).toContain('data-testid="studio-feedback-today"');
    // The three claims, each asserted: it is stored, nothing reads it, and a
    // later slice may PROPOSE rather than apply.
    expect(html).toMatch(/stored as a record of what you said/i);
    expect(html).toMatch(/Nothing reads it today/i);
    expect(html).toMatch(/it does not change your brain/i);
    expect(html).toMatch(/suggest/i);
    expect(html).toMatch(/approve or reject/i);
    expect(html).toMatch(/never applied to your brain without you|Nothing is ever applied to your brain without you/i);
  });

  it("R12: the feedback screen says NOTHING about learning, improving or training", () => {
    // `tests/support/forbidden-claims.ts` bans `learn`, `improv` and `train` on
    // every creator-facing surface, and THIS is the screen where the ban earns
    // its keep: a reaction button is exactly where a reader forms the belief
    // that the product is adjusting to them.
    //
    // SCANNED OVER THE RENDER *AND* OVER THE COPY MODULE, because a sentence
    // that only appears in a state this fixture does not drive is still a
    // sentence a creator can read.
    // SCANNED OVER THE EXPORTED VALUES, not over the source text: the block's
    // own docblock has to be able to say "this avoids `learn`, `improve` and
    // `train`", and a source scan bans the explanation along with the claim.
    // The values are what a creator reads.
    const surfaces = [
      visibleCopy(withResult()),
      visibleCopy(withResult({ status: "recorded", generationId: "g", reaction: "off_voice", noteKept: true })),
      visibleCopy(withResult({ status: "recorded", generationId: "g", reaction: "used_as_is", noteKept: false })),
      visibleCopy(withResult({ status: "refused", code: "feedback_duplicate" })),
      visibleCopy(withResult({ status: "refused", code: "feedback_note" })),
      FEEDBACK_TODAY,
      FEEDBACK_HEADING,
      feedbackNoteLimit(FEEDBACK_NOTE_MAX),
      ...GENERATION_FEEDBACK_REACTIONS.map(reactionLabel),
      ...GENERATION_FEEDBACK_REACTIONS.flatMap((c) => [
        feedbackRecordedSentence(c, true),
        feedbackRecordedSentence(c, false),
      ]),
    ];
    for (const [label, pattern] of [
      ...FORBIDDEN_CLAIMS,
      ...PERFORMANCE_CLAIMS,
    ] as [string, RegExp][]) {
      for (const surface of surfaces) {
        expect(
          pattern.test(surface.toLowerCase()),
          `${label} in: ${surface.slice(0, 80)}`
        ).toBe(false);
      }
    }
    // NON-VACUITY, per word: the specimen for each banned claim really matches
    // its own pattern, so a typo in one pattern cannot leave a word sayable.
    for (const [label, pattern] of FORBIDDEN_CLAIMS) {
      expect(pattern.test(CLAIM_SPECIMENS[label]), label).toBe(true);
    }
  });

  it("feedbackRecordedSentence reports what was STORED, note included or not", () => {
    // `noteKept` is its own fact and is NOT derivable from "a note was sent":
    // the capability refuses a blank-but-present note outright, so telling
    // somebody their words were kept when the column is NULL is a lie about
    // their own record.
    const kept = feedbackRecordedSentence("off_voice", true);
    expect(kept).toContain(reactionLabel("off_voice"));
    expect(kept).toMatch(/note was stored with it, as you typed it/i);
    const not = feedbackRecordedSentence("off_voice", false);
    expect(not).toMatch(/No note was sent with it/i);
    // AND NEITHER THANKS THE CREATOR FOR TEACHING THE PRODUCT ANYTHING.
    for (const sentence of [kept, not]) {
      expect(sentence).toMatch(/nothing in the product has changed because of it/i);
    }
  });

  it("the control is offered only where there is an output to be about", () => {
    // `generationId` is what the composite foreign key needs; a control with no
    // target would post an empty id and earn `FeedbackTargetError`. The idle
    // screen has no target, so it renders no control at all.
    expect(renderView()).not.toContain('data-testid="studio-feedback"');
    // THE TARGET IS DECIDED IN THE PANEL, from the LATEST outcome — and it
    // includes an HONEST REFUSAL, which is a stored generation a creator paid
    // for and may well have an opinion about.
    const panelSrc = read("app/(product)/studio/studio-panel.tsx");
    expect(panelSrc).toMatch(
      /state\.latest\.status === "usable" \|\| state\.latest\.status === "honest_refusal"/
    );
    expect(panelSrc).toMatch(/feedbackTargetId !== null \? \(/);
  });

  it("a recorded reaction and a refusal each render their own state", () => {
    const recorded = withResult({
      status: "recorded",
      generationId: "gen-1",
      reaction: "off_voice",
      noteKept: true,
    });
    expect(recorded).toContain('data-testid="studio-feedback-recorded"');
    expect(recorded).toContain(feedbackRecordedSentence("off_voice", true));

    const refused = withResult({ status: "refused", code: "feedback_duplicate" });
    expect(refused).toContain('data-testid="studio-feedback-refused"');
    expect(refused).toContain(REFUSAL_COPY.feedback_duplicate.title);
    // ...and it says the NOTE was not kept, which is the fact a creator who
    // typed one needs and which a silent no-op would hide.
    expect(refused).toMatch(/was NOT kept|not kept/i);

    // A CODE WITH NO ENTRY falls back to neutral words, never to nothing.
    const unknownCode = withResult({
      status: "refused",
      code: "app_base_url_missing",
    });
    expect(unknownCode).toContain('data-testid="studio-feedback-refused"');
    expect(unknownCode).toContain(REFUSAL_COPY.unknown.title);
  });

  it("the action derives `noteKept` from the ROW, never from the parameter", () => {
    // The creator is told whether their WORDS were stored, and only the stored
    // value can answer that: a note the capability refused, or one trimmed to
    // nothing, must not be reported as kept.
    const src = read("app/(product)/studio/actions.ts");
    expect(src).toMatch(/noteKept: row\.note !== null/);
    expect(src).not.toMatch(/noteKept: note !== undefined/);
  });

  it("the action does NOT count, group or summarise anything (R11)", () => {
    // R11: this slice captures feedback and must be structurally unable to
    // derive from it — `packages/brain` is the sole construction site for a
    // proposal and does not exist yet. `tests/feedback-readers.test.ts` is the
    // repo-wide scan; this is the app-surface half.
    const src = read("app/(product)/studio/actions.ts")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const shape of [
      /\.reduce\(/,
      /\.filter\(/,
      /listFeedback/,
      /\bcount\b/i,
      /\bproposal\b/i,
      /\baggregate\b/i,
    ]) {
      expect(shape.test(src), `${shape} appears on the feedback action path`).toBe(
        false
      );
    }
  });
});

// -------------------------------- R19: what is OUT of scope, said out loud

describe("R19: REQ-C07 and REQ-C08 are absent, and the screen implies neither", () => {
  it("nothing on this screen offers a series planner or an anti-homogenisation control", () => {
    // REQ-C08's anti-homogenisation is `[Could]` and is explicitly out of
    // scope; REQ-C07's series planner is `[Should]` and Pro+ and is DEFERRED.
    // Both dispositions belong in `decisions.md` — what belongs HERE is that
    // the screen does not imply either exists, because a control that is
    // deferred and a control that is broken look identical to a creator.
    const html = decoded(renderView());
    for (const shape of [/series/i, /\bcarousel\b/i, /homogen/i, /\bvariety\b/i]) {
      expect(shape.test(html), String(shape)).toBe(false);
    }
    for (const file of studioSourceFiles()) {
      const src = readFileSync(file, "utf8")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      expect(/seriesPlanner|SERIES_PLAN/.test(src), file).toBe(false);
    }
  });
});
