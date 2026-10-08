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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  NOT_BUILT_YET,
  PERFORMANCE_CLAIMS,
  STUDIO_POSITIVE_ASSERTIONS,
} from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";
import { blankComments } from "./support/app-surface";
import { CHECK } from "@respin/db";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";
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
  billingErrorCode,
} from "../app/(product)/billing-errors";
import {
  commissionPieceAction,
  findConceptAction,
  generateAction,
  rememberForFutureDraftsAction,
} from "../app/(product)/studio/actions";
import { reviseSavedAction, selectSavedVersionAction } from "../app/(product)/studio/saved/actions";
import {
  SavedView,
  type SavedPackProps,
  type SavedViewProps,
} from "../app/(product)/studio/saved/saved-view";
import {
  md as md_,
  packChecks,
  packFileName,
  recordingPackMarkdown,
  scriptText,
} from "../app/(product)/studio/saved/recording-pack";
import { announce } from "../app/(product)/studio/saved/pack-actions";
import {
  CHECKS_HEADING,
  CHECKS_UNREADABLE,
  NOTHING_TO_EXPORT,
  NOT_A_PIECE_NOTE,
  NO_SHOOTING_PLAN,
  ORIGINAL_NOTE,
  PIECE_OTHER_SELECTED_SENTENCE,
  REVISE_PLAN_BLOCK,
  REVISE_REFUSED_ONLY,
  SAVED_READ_FREE,
  SAVED_STATE_COPY,
  SCRIPT_HEADING,
  SELECTED_STATUS,
  SHOOTING_PLAN_HEADING,
  USE_THIS_VERSION_HELP,
  PAUSED_BLOCK,
  VIEWER_BLOCK,
  reviseCostSentence,
  reviseDoneSentence,
  savedPressBlocks,
  sourceSentence,
  CHECK_LEGEND,
  COPIED_SCRIPT_STATUS,
  COPY_PACK_FAILED_STATUS,
  COPY_SCRIPT_FAILED_STATUS,
  DISCLOSURE_ADVICE_WITHHELD,
  EXPORT_FOOTER,
  PACK_TEXT_LABEL,
  REFERENCE_UNAVAILABLE,
  REVISE_PRICE_UNREADABLE,
  REVISE_REFERENCE_UNAVAILABLE,
  REVISE_SOURCE_TO_REEL,
  SAVED_QUOTE_CHANGED,
  SCRIPT_TEXT_LABEL,
  SOURCE_ATTRIBUTION,
  SOURCE_CHECKED_REVISED,
  SOURCE_CHECKED_SOURCE,
  SPIN_GATE_PASSED,
  alreadyRevisedSentence,
  versionLinkLabel,
} from "../app/(product)/studio/saved/saved-copy";
import {
  STUDIO_ERROR_CODES,
  generateBlock,
  studioErrorFor,
  studioRefusalCopy,
} from "../app/(product)/studio/copy";
import {
  EXCLUDED_FROM_HISTORY_SENTENCE,
  EXCLUDE_FROM_HISTORY_HELP,
  EXCLUDE_FROM_HISTORY_LABEL,
  FILMING_LIMITS_HELP,
  FORM_CONTROL_HELP,
  historySentence,
  resultsBasisSentence,
  NO_STREAM_NOTE,
  PLATFORM_OPTIONS,
  PREPARING_LABEL,
  FEEDBACK_HEADING,
  FEEDBACK_TODAY,
  LINEAGE_SCOPE_NOTE,
  REMEMBER_HEADING,
  REMEMBER_HELP,
  REMEMBER_LABEL,
  SEQUEL_HELP,
  SEQUEL_LABEL,
  rememberProposedSentence,
  REVISION_NOTE_HELP,
  REVISION_SAME_MODE_NOTE,
  CHECK_MARKER,
  checkOffer,
  claimFamilyNote,
  DISCLOSURE_FIELD_PREFIX,
  DISCLOSURE_LINE,
  feedbackNoteLimit,
  feedbackRecordedSentence,
  frameworksNotUsedSentence,
  lineageChoiceLabel,
  reactionLabel,
  claimsHeading,
  creatorRulesSentence,
  generateChargeSentence,
  generateCostSentence,
  FREE_CLAIM_REFUSAL,
  inForceSentence,
  killTestSentence,
  lineageLineFor,
  priceLineFor,
  modeAvailabilityNote,
  replayChargeSentence,
  revisionCostSentence,
  traceabilityFlagNote,
  traceabilityHeading,
  whyThisPerformsView,
  CUSTOM_STRUCTURE_NOTE,
  FILMING_UNCONFIRMED_NOTE,
  FORM_CONTROL_LEGEND,
  PEOPLE_SENTENCES,
  PIVOT_SENTENCES,
  basisSentence,
  REMEMBER_OWNER_ONLY,
  rememberAlreadyHeldSentence,
  rememberLimitSentence,
  type ModeChoiceView,
} from "../app/(product)/studio/run-copy";
import {
  LINEAGE_VIEW_MAX,
  savedPackFor,
  studioActionStateFor,
  studioStateFor,
} from "../app/(product)/studio/projection";
import { GenerationOutcome } from "../app/(product)/studio/generation-outcome";
import { LineageList } from "../app/(product)/studio/lineage-view";
import {
  FeedbackBlock,
  REMEMBER_TEXT_REFUSAL_CODES,
  RememberBlock,
} from "../app/(product)/studio/feedback-block";
import { StudioView, pieceKey, type StudioViewProps } from "../app/(product)/studio/studio-view";
import { StudioPanel } from "../app/(product)/studio/studio-panel";
import { StudioEntrances, type StudioEntrancesProps } from "../app/(product)/studio/entrances";
import {
  PieceConfirmation,
  type PieceConfirmationProps,
  type PieceView,
} from "../app/(product)/studio/piece-confirmation";
import {
  CHOOSE_CONCEPT_HELP,
  FIND_CONCEPT_DONE_STATUS,
  FIND_CONCEPT_HELP,
  FIND_CONCEPT_HINT_LABEL,
  FIND_CONCEPT_QUESTION,
  OTHER_MODES_HEADING,
  PIECE_CANCELLED_STATUS,
  PIECE_OPERATION_NOTE,
  PIECE_PLAN_BLOCK,
  PIECE_SCRIPT_DONE_STATUS,
  REFERENCE_ENTRANCE_BLOCKED,
  REFERENCE_ENTRANCE_UNKNOWN,
  RECENT_PACKS_EMPTY,
  RECENT_PACKS_UNAVAILABLE,
  REPLAY_SAVED_NOTE,
  SAVED_PACK_LINK_LABEL,
  savedPackHref,
} from "../app/(product)/studio/run-copy";
import {
  BRAIN_EDIT_VALUE_MAX,
  BrainEditUnchangedError,
  CreativePieceError,
  GENERATION_FEEDBACK_REACTIONS,
  FEEDBACK_NOTE_MAX,
  OWN_IDEA_MAX,
  RECENT_DRAFTS_MAX,
  RECENT_NOTES_MAX,
  respinDb,
} from "@respin/db";
import {
  CREATIVE_CONSTRAINT_BOUNDS,
  CREATIVE_FORM_OPTIONS,
  CREATIVE_PEOPLE_OPTIONS,
  CreativeRequestError,
  EVENT_CONFIRMATION_ITEM,
  RevisionPresetError,
  SAVED_REVISION_OPTIONS,
  respinCredits,
  type SavedGenerationView,
} from "@respin/credits/app-server";
// R-148 (launch L1): the generate ACTION is driven below with its session and
// scope stubbed, so "the form control reaches the request" is asserted on the
// params the operation actually receives. Partial mocks: nothing else this
// file imports reaches `@respin/auth` or the scope helper.
const actionMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
}));
vi.mock("@respin/auth", async (importActual) => ({
  ...(await importActual<typeof import("@respin/auth")>()),
  requireUser: actionMocks.requireUser,
}));
vi.mock("../app/(product)/workspace-scope", () => ({
  scopeForUser: actionMocks.scopeForUser,
}));

import type {
  ClaimFlag,
  ExcludeState,
  FeedbackState,
  KillTestSummary,
  LineageEntry,
  RememberState,
  SavedPackView,
  SavedReviseState,
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

function detailsText(markup: string): string {
  return decoded(markup)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
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
  disclosure: { kind: "policy_check_required" },
};

const USABLE: StudioRunState = {
  status: "usable",
  generationId: "gen-1",
  modeId: "hooks",
  modeLabel: "Hooks",
  document: HOOKS_DOCUMENT,
  killTest: KILL_TEST,
  charge: { creditsChargedNow: 5, balanceAfter: 20, freeClaimRefusal: false },
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
 * It sits in the CAPTION, a section the creator reads. It used to sit in
 * `/disclosure/guidance`; since R-121 / audit P1-R1 the model's disclosure
 * section is not shown, so a finding there is not presented either (its
 * `unit` would be the model's disclosure prose) — that case is pinned in
 * `tests/disclosure-presenters.test.ts`. Its `token` and `unit` are ordinary
 * English rather than a banned word, which is what lets the honesty scan read
 * this state's render (see `KILL_TEST.claims`).
 */
const CONCEALMENT: ClaimFlag = {
  family: "concealment",
  enforcement: "flag",
  token: "skip the label",
  field: "/caption/text",
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
  charge: { creditsChargedNow: 5, balanceAfter: 15, freeClaimRefusal: false },
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
  { id: "m-e", label: "Hooks", status: "available", cost: 5 },
  { id: "m-f", label: "Caption", status: "available", cost: 2 },
  { id: "m-g", label: "Ideation", status: "available", cost: 4 },
];

/**
 * Free's shape as Studio receives it: three modes and three outside the plan.
 * Analyse and spin is not in either fixture since the Phase 6 compliance gate:
 * `studioModeOffers` keeps it off Studio's picker on every tier, because it
 * needs an autopsy chosen on /trends (asserted in `mode-access.test.ts`).
 */
const FREE_MODES: ModeChoiceView[] = [
  { id: "m-a", label: "Footage to thesis", status: "not_in_plan", cost: null },
  { id: "m-b", label: "Idea to script", status: "not_in_plan", cost: null },
  { id: "m-c", label: "Source to reel", status: "not_in_plan", cost: null },
  { id: "m-e", label: "Hooks", status: "available", cost: 5 },
  { id: "m-f", label: "Caption", status: "available", cost: 2 },
  { id: "m-g", label: "Ideation", status: "available", cost: 4 },
];

const baseView: StudioViewProps = {
  profileName: "Anna",
  run: {
    action: async () => IDLE_ACTION_STATE,
    feedbackAction: async () => ({ status: "idle" }) as const,
    rememberAction: async () => ({ status: "idle" }) as const,
    rememberValueMax: 2_000,
    rememberAllowed: true,
    modes: MODES,
    costSentence: generateCostSentence(MODES, 25),
    revisionCostSentence: revisionCostSentence(2),
    revisionCost: 2,
    // R-148: the facade's own values, so the view is rendered with the set the
    // server really offers rather than a fixture copy of it.
    formOptions: CREATIVE_FORM_OPTIONS,
    peopleOptions: CREATIVE_PEOPLE_OPTIONS,
    creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
    reactions: GENERATION_FEEDBACK_REACTIONS,
    noteMax: FEEDBACK_NOTE_MAX,
    block: null,
    // Audit P6-R6: the creator's own scoped result count; zero is the
    // fixture's default and every branch is driven in its own case.
    resultCount: 0,
    activeKinds: ["Voice", "Strategy", "Kill test"],
    brainHref: "/brain",
    usageHref: "/usage",
    frameworksHref: "/studio/frameworks",
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
  },
  error: null,
  onboardingHref: "/onboarding",
  brainHref: "/brain",
  usageHref: "/usage",
  frameworksHref: "/studio/frameworks",
  brainActiveWithoutVoice: false,
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

  it("generateCostSentence on a SETTLING balance says so, and decides nothing — even below the cost (audit Phase 8, P8-R1, AC1)", () => {
    const one: ModeChoiceView[] = [
      { id: "m-e", label: "Hooks", status: "available", cost: 5 },
    ];
    const settling = generateCostSentence(one, 2, true);
    expect(settling).toContain("Hooks costs 5 credits");
    expect(settling).toMatch(/2 credits for now/);
    expect(settling).toMatch(/read without waiting for other activity on your workspace, so it may change/);
    // It never claims a write is in progress (gate M1): a held lock proves only that.
    expect(settling).not.toMatch(/being written|still settling|updating/);
    expect(settling).toMatch(/checks it on the server before anything is spent/);
    // NO insufficiency decision on a display number: a balance BELOW the cost
    // gets no refusal, no top-up prompt, no "not enough".
    expect(settling).not.toMatch(/not enough|insufficient|top up|buy/i);
    // ...and a settled balance reads as before.
    expect(generateCostSentence(one, 2, false)).toBe(
      "Hooks costs 5 credits, every time — there is no included draft. You have 2 credits."
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
    expect(note).toMatch(/Every mode offered on this page is one of them/);
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
    expect(all).toMatch(/Every mode offered on this page is one of them/);
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
    expect(generateChargeSentence({ creditsChargedNow: 5, balanceAfter: 20, freeClaimRefusal: false })).toContain("That cost 5 credits.");
    expect(generateChargeSentence({ creditsChargedNow: 5, balanceAfter: 20, freeClaimRefusal: false })).toContain("Your balance is now 20 credits.");
    expect(generateChargeSentence({ creditsChargedNow: 5, balanceAfter: 20, freeClaimRefusal: false })).toContain("The entry is in your credit history");
    expect(generateChargeSentence({ creditsChargedNow: 0, balanceAfter: 20, freeClaimRefusal: false })).toContain(
      "Nothing was taken from your credit balance"
    );
    // AUDIT P3-A2: a zero charge writes no ledger row, so it points at none.
    expect(generateChargeSentence({ creditsChargedNow: 0, balanceAfter: 20, freeClaimRefusal: false })).not.toMatch(/credit history/);
    expect(generateChargeSentence({ creditsChargedNow: 1, balanceAfter: 1, freeClaimRefusal: false })).toContain("1 credit.");
  });

  it("replayChargeSentence says nothing extra was spent", () => {
    expect(replayChargeSentence(12, false)).toMatch(/nothing extra was spent/i);
    expect(replayChargeSentence(12, false)).toContain("12 credits");
  });

  it("R-173: the FREE CLAIM REFUSAL says it in the owner's words; a free flag beside a debit never says free", () => {
    expect(FREE_CLAIM_REFUSAL).toBe("We stopped this draft because it made a claim this product won't make; no credits were used.");
    // Neutral (billing verification): a claim-only refusal can be concealment advice, not only a forecast.
    expect(FREE_CLAIM_REFUSAL).not.toMatch(/promised a result/);
    const free = generateChargeSentence({ creditsChargedNow: 0, balanceAfter: 20, freeClaimRefusal: true });
    expect(free).toBe(`${FREE_CLAIM_REFUSAL} Your balance is 20 credits.`);
    expect(free).not.toMatch(/nothing extra was spent|credit history|That cost/i);
    // The settlement prices a free refusal at zero; a flag beside a debit is
    // the charge, said as a charge.
    const charged = generateChargeSentence({ creditsChargedNow: 5, balanceAfter: 15, freeClaimRefusal: true });
    expect(charged).toContain("That cost 5 credits.");
    expect(charged).not.toContain(FREE_CLAIM_REFUSAL);
    // A REPLAY of a free refusal was never paid for.
    const replay = replayChargeSentence(12, true);
    expect(replay).toContain(FREE_CLAIM_REFUSAL);
    expect(replay).not.toMatch(/already been paid for/);
    expect(replayChargeSentence(12, false)).not.toContain(FREE_CLAIM_REFUSAL);
  });

  it("R-173: the honest-refusal panel's charge copy matches its outcome — free, or charged — and never says 'nothing extra was spent'", () => {
    const free = decoded(renderOutcome({ ...HONEST_REFUSAL, charge: { creditsChargedNow: 0, balanceAfter: 20, freeClaimRefusal: true } }));
    expect(free).toContain(FREE_CLAIM_REFUSAL);
    expect(free).toMatch(/nothing was charged for it/);
    expect(free).not.toMatch(/was charged for\.|That cost|nothing extra was spent/);
    const charged = decoded(renderOutcome(HONEST_REFUSAL));
    expect(charged).toContain("That cost 5 credits.");
    expect(charged).toContain("This ran, and was charged for.");
    expect(charged).not.toContain(FREE_CLAIM_REFUSAL);
    expect(charged).not.toMatch(/nothing extra was spent/);
    // A HELD free refusal finished by a press: the same sentence.
    const held = decoded(renderOutcome({
      status: "settled_held", generationId: "g", attemptId: "att-h", modeId: "hooks", modeLabel: "Hooks",
      outcome: "honest_refusal", weakestPoint: null, refusalReason: "It made a claim.",
      charge: { creditsChargedNow: 0, balanceAfter: 9, freeClaimRefusal: true },
    }));
    expect(held).toContain(FREE_CLAIM_REFUSAL);
    expect(held).not.toMatch(/That cost|nothing extra was spent/);
  });

  it("R-173: the saved page's revision sentence says a free claim refusal was free, and a charged one what it cost", () => {
    expect(reviseDoneSentence({ outcome: "honest_refusal", creditsChargedNow: 0, balanceAfter: 8, freeClaimRefusal: true })).toBe(
      `The new version ended in an honest refusal, which is saved with its reasons. ${FREE_CLAIM_REFUSAL} Your balance is 8.`
    );
    expect(reviseDoneSentence({ outcome: "honest_refusal", creditsChargedNow: 2, balanceAfter: 6, freeClaimRefusal: false })).toMatch(/It cost 2 credits\./);
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
    expect(traceabilityHeading(0, 0)).toMatch(/outside the disclosure guidance/i);
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
    expect(flagOnly).toContain(
      "1 other specific was not found either — a plain number or a name, where an ordinary word can land, so these are a prompt to look, never a fault"
    );
    expect(flagOnly).not.toContain("disclosure guidance");
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
    // A NAME outside disclosure keeps the sentence that was always right.
    expect(traceabilityFlagNote("proper_noun")).toMatch(
      /a name, not a rule violation/i
    );
    // A PLAIN NUMBER is not a name, and this is the sentence the screen used to
    // get wrong: it printed "(a name…)" beside the number `5`.
    const number = traceabilityFlagNote("number");
    expect(number).toMatch(/a plain number/i);
    expect(number).not.toMatch(/\ba name\b/i);
    // AN UNKNOWN KIND falls back to the neutral sentence rather than a guess.
    const unknown = traceabilityFlagNote("something-new");
    expect(unknown).toMatch(/not a rule violation/i);
    expect(unknown).not.toMatch(/\ba name\b|plain number|disclosure/i);
    // Every branch says the same thing about fault, which is the property the
    // split exists to preserve.
    for (const note of [number, unknown, traceabilityFlagNote("proper_noun")]) {
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

  it("states an unreadable brain state rather than calling it inactive", () => {
    expect(
      generateBlock({ isViewer: false, paused: false, brainActivated: null })!.reason
    ).toBe("The brain's state could not be read. Reload this page.");
    expect(inForceSentence(null)).toBe(
      "The documents in force could not be read. Reload this page."
    );
  });
});

describe("Phase 1 T5: voice and active-document preconditions", () => {
  it.each([
    ["Voice is active", ["Voice"], false],
    ["Strategy is active without Voice", ["Strategy"], true],
    ["Kill test is active without Voice", ["Kill test"], true],
    ["no document is active", [], false],
    ["the document histories could not be read", null, false],
  ] as const)("shows the voice remedy iff %s", (_label, activeKinds, needsVoice) => {
    const html = renderView({
      brainActiveWithoutVoice: needsVoice,
      run: { ...baseView.run!, activeKinds },
    });
    expect(html.includes('data-testid="studio-no-voice"')).toBe(needsVoice);
    if (needsVoice) {
      expect(html).toMatch(/voice document/i);
      expect(html).toMatch(/brain page/i);
    }
  });

  it("renders the in-force line inside the panel, including the failed-history remedy", () => {
    const html = renderView({
      run: { ...baseView.run!, activeKinds: ["Voice", "Strategy"] },
    });
    expect(html).toContain('data-testid="studio-in-force"');
    expect(html).toContain("Voice and Strategy are in force.");

    const failed = renderView({
      brainActiveWithoutVoice: false,
      run: {
        ...baseView.run!,
        activeKinds: null,
        block: generateBlock({ isViewer: false, paused: false, brainActivated: null }),
      },
    });
    expect(decoded(failed)).toContain(
      "The documents in force could not be read. Reload this page."
    );
    expect(decoded(failed)).toContain(
      "The brain's state could not be read. Reload this page."
    );
  });
});

describe("Phase 1 T7: Studio pre-form prose folds without hiding honesty", () => {
  it("uses one native fold and renders an injected usable state outside it", () => {
    const state: StudioActionState = {
      lineage: [],
      latest: {
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        killTest: { ...KILL_TEST, claims: [CONCEALMENT] },
      },
    };
    const html = renderToStaticMarkup(
      <StudioPanel
        {...baseView.run!}
        initialState={state}
      />
    );
    const details = html.match(/<details[\s\S]*?<\/details>/g) ?? [];
    expect(details).toHaveLength(1);
    const folded = details[0] ?? "";
    expect(folded).toContain("How this works and what it costs");
    expect(folded).toContain('data-testid="studio-intro"');
    expect(folded).toContain('data-testid="studio-revision-cost"');
    expect(folded).not.toContain(" open=");
    expect(detailsText(folded)).toBe(
      "How this works and what it costs Every draft is written from the brain you confirmed and activated for this creator on the brain page, plus what you type in below, plus the frameworks this creator can draw on — the shared library and any of your own, on the frameworks page. Every charge appears in your credit history on the usage page. A revision costs 2 credits, whichever mode it revises — a revision is priced as a revision, not at the price of the draft it came from."
    );
    expect(folded).not.toContain('data-testid="studio-no-results-basis"');
    expect([...folded.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(
      ["studio-intro", "studio-revision-cost"]
    );
    for (const testId of [
      "studio-disclosure",
      "studio-weakest-point",
      "studio-in-force",
      "studio-mode-note",
      "studio-cost",
      "studio-no-results-basis",
      "studio-no-stream",
      "studio-status",
      "studio-kill-test",
      "studio-traceability-heading",
      "studio-traceability",
      "studio-traceability-note",
      "studio-claims",
      "studio-check-legend",
      "studio-disclosure-provenance",
      "studio-selected-cost",
      "studio-charge",
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
      expect(folded).not.toContain(`data-testid="${testId}"`);
    }
  });

  it("keeps an injected honest refusal whole outside the fold", () => {
    const html = renderToStaticMarkup(
      <StudioPanel
        {...baseView.run!}
        initialState={{
          lineage: [],
          latest: { ...HONEST_REFUSAL, killTest: { ...KILL_TEST, claims: [CONCEALMENT] } },
        }}
      />
    );
    const details = html.match(/<details[\s\S]*?<\/details>/g) ?? [];
    expect(details).toHaveLength(1);
    const folded = details[0] ?? "";
    expect(folded).toContain("How this works and what it costs");
    expect(folded).not.toContain(" open=");
    expect(detailsText(folded)).toBe(
      "How this works and what it costs Every draft is written from the brain you confirmed and activated for this creator on the brain page, plus what you type in below, plus the frameworks this creator can draw on — the shared library and any of your own, on the frameworks page. Every charge appears in your credit history on the usage page. A revision costs 2 credits, whichever mode it revises — a revision is priced as a revision, not at the price of the draft it came from."
    );
    expect([...folded.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(
      ["studio-intro", "studio-revision-cost"]
    );
    for (const testId of [
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
      "studio-no-results-basis",
      "studio-no-stream",
      "studio-mode-note",
      "studio-in-force",
      "studio-cost",
      "studio-selected-cost",
      "studio-status",
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
      expect(folded).not.toContain(`data-testid="${testId}"`);
    }
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
    // THE CONSTANT, not the literal (audit Phase 2, P2-R8): the offer is the
    // marker's one home plus the token, whatever its spelling.
    // The client-safe home equals the server home (audit Phase 2, P2-R8):
    // `run-copy.ts` may not import `@respin/db`, so the agreement is held here.
    expect(CHECK_MARKER).toBe(CHECK);
    expect(checkOffer("412")).toBe(`412 ${CHECK}`);
    const html = renderOutcome(USABLE);
    expect(html).toContain('data-testid="studio-check-offer"');
    expect(html).toContain(`412 ${CHECK}`);
    // The hook text itself carries no marker.
    expect(html).not.toContain(`It took 412 ${CHECK} takes`);
  });

  it("a flag-only finding is not presented as a rule violation", () => {
    const html = renderOutcome(USABLE);
    expect(html).toMatch(/a name, not a rule violation/);
  });

  it("the RENDERED note matches the finding — a number is not called a name", () => {
    // THE MUTATION THAT SURVIVED WITHOUT THIS TEST (measured, 2026-09-01):
    // replacing `{traceabilityFlagNote(f.kind)}` with the old fixed
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
    expect(html).toContain(traceabilityFlagNote("number"));
    expect(html).toContain(traceabilityFlagNote("proper_noun"));
    // THE REGRESSION, ASSERTED AS A COUNT rather than as an absence: the "name"
    // sentence appears exactly ONCE, beside the one finding that is a name. A
    // fixed sentence prints it three times.
    const names = html.split("a name, not a rule violation").length - 1;
    expect(names, "the name sentence is printed for a non-name finding").toBe(1);
  });

  it("offers exactly the two creator specifics from the four-row disclosure fixture", () => {
    const html = decoded(
      renderOutcome({
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        killTest: {
          ...KILL_TEST,
          traceability: [
            { kind: "number", enforcement: "flag", token: "5", field: "/hooks/0/text", unit: "Five steps." },
            { kind: "proper_noun", enforcement: "flag", token: "Dorset", field: "/hooks/1/text", unit: "Filmed in Dorset." },
            { kind: "proper_noun", enforcement: "flag", token: "TikTok", field: `${DISCLOSURE_FIELD_PREFIX}platform`, unit: "TikTok policy." },
            { kind: "proper_noun", enforcement: "flag", token: "AI", field: `${DISCLOSURE_FIELD_PREFIX}guidance`, unit: "AI guidance." },
          ],
        },
      })
    );
    expect(html).toContain("5 [check]");
    expect(html).toContain("Dorset [check]");
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
    expect(html.match(/The disclosure line on this draft is this product's own sentence/g)).toHaveLength(1);
    expect(html).toContain("not the draft's and not from your material, so it has nothing to list here.");
  });

  it("keeps a creator-owned TikTok finding distinct from disclosure guidance", () => {
    const html = decoded(
      renderOutcome({
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        killTest: {
          ...KILL_TEST,
          traceability: [
            {
              kind: "proper_noun",
              enforcement: "flag",
              token: "TikTok",
              field: "/hooks/2/text",
              unit: "A TikTok creator anecdote.",
            },
          ],
        },
      })
    );
    expect(html).toContain("TikTok [check]");
  });

  it("withholds a synthetic HARD disclosure traceability row too (R-121, audit P1-R1)", () => {
    // THE BRANCH THE FILTER USED TO KEEP. A usable run cannot carry a hard
    // traceability finding (`inventedSpecificFindings` turns each into a
    // hard-rule finding, so the draft is rewritten or refused — pinned by
    // `packages/modes/tests/kill-test.test.ts`), so this state is built by
    // hand. Were it reachable, the row's `unit` is the model's disclosure
    // prose, so it is not rendered either way.
    const html = decoded(
      renderOutcome({
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        killTest: {
          ...KILL_TEST,
          traceability: [
            { kind: "currency", enforcement: "hard", token: "$4,000", field: `${DISCLOSURE_FIELD_PREFIX}guidance`, unit: "SENTINEL-UNIT Within the first 3 seconds." },
          ],
        },
      })
    );
    expect(html).not.toContain("$4,000 [check]");
    expect(html).not.toContain("1 amount or date");
    expect(html).not.toContain("SENTINEL-UNIT");
    expect(html).not.toContain('data-testid="studio-traceability"');
    expect(html.match(/The disclosure line on this draft is this product's own sentence/g)).toHaveLength(1);
  });

  it("does not render a traceability list for all-disclosure findings", () => {
    const html = decoded(
      renderOutcome({
        ...(USABLE as Extract<StudioRunState, { status: "usable" }>),
        killTest: {
          ...KILL_TEST,
          traceability: [
            { kind: "proper_noun", enforcement: "flag", token: "AI", field: `${DISCLOSURE_FIELD_PREFIX}guidance`, unit: "AI guidance." },
          ],
        },
      })
    );
    expect(html).not.toContain('data-testid="studio-traceability"');
    expect(html).toContain(
      "Every number, date and name outside the disclosure guidance in this draft was found in your brain or in what you typed in."
    );
    expect(html).not.toContain("Every name in this draft was found");
    expect(html.match(/The disclosure line on this draft is this product's own sentence/g)).toHaveLength(1);
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
   * refusal's `why`; the flag-level ones reached nobody. A capability nothing
   * can reach is not done. (Findings in the model's disclosure section are the
   * exception, and stay unpresented — R-121, audit P1-R1.)
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
    // SITE 2 IS COUNT-INDEPENDENT (audit P6-R6): a per-claim note has no
    // count in reach, so it states the R-115 precondition and never how many
    // results this creator has logged. "No result of yours has been logged"
    // was false for every creator who had used `/results`.
    expect(claimFamilyNote("performance")).toMatch(/until a verified analytics connector exists/i);
    expect(claimFamilyNote("performance")).not.toMatch(/has been logged|have been logged|none logged|no result of yours|no results of yours/i);
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
    // A HARD finding can sit in any presented field since R-173, so the
    // sentence no longer says "in the explanation" (audit P6-A4).
    expect(claimsHeading(hardSameField)).toMatch(/\b1 line in this draft made a claim this product may not make\b/);
    expect(claimsHeading(hardSameField)).not.toMatch(/in the explanation/);
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
      // AUDIT P6-A4: the four rewritten `run-copy.ts` sentences and the
      // lineage note (whose stale docblock was the fifth item), and every
      // branch of the results sentence with its history clause (P6-R6).
      feedbackNoteLimit(500),
      feedbackRecordedSentence("off_voice", true),
      FORM_CONTROL_HELP,
      FILMING_LIMITS_HELP,
      LINEAGE_SCOPE_NOTE,
      resultsBasisSentence(0, ["Ideation", "Idea to script"]),
      resultsBasisSentence(3, ["Ideation", "Idea to script"]),
      resultsBasisSentence(1, []),
      resultsBasisSentence(null, ["Ideation"]),
      EXCLUDE_FROM_HISTORY_LABEL,
      EXCLUDE_FROM_HISTORY_HELP,
      EXCLUDED_FROM_HISTORY_SENTENCE,
      // R-121, audit P1-R1: the disclosure line both product surfaces render
      // in place of the model's disclosure section.
      ...Object.values(DISCLOSURE_LINE),
    ];
    for (const text of ours) {
      expect(
        claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS),
        `/studio's own claims copy: ${text}`
      ).toEqual([]);
    }
    // NON-VACUITY: the same loop catches a planted sentence, so a scan over an
    // accidentally-empty list would be visible.
    expect(
      claimHits("this one will get more views, guaranteed", FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)
    ).toEqual(expect.arrayContaining(["more views", "guarantee"]));
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
    freeClaimRefusal: false,
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
    expect(claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toEqual([]);
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
      claims: [
        { shape: "skip the label", family: "concealment", enforcement: "flag", token: "skip the label", field: "/caption/text", unit: "Most people skip the label on a short like this." },
        // R-121, audit P1-R1 (carrier 7): stored, and dropped by the projection.
        { shape: "skip the label", family: "concealment", enforcement: "flag", token: "skip the label", field: "/disclosure/guidance", unit: "SENTINEL-UNIT the model's own disclosure sentence." },
      ],
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

  it("R-173: `freeClaimRefusal` is carried from the operation onto every charge-bearing state", () => {
    const refused = {
      status: "refused",
      refusal: { headline: "H", why: ["W"], sharperAngle: "S" },
      killTest: { ...killTest, outcome: "failed", attempts: 2, rewritten: true },
    };
    const free = studioStateFor(result({ run: refused, creditsChargedNow: 0, freeClaimRefusal: true, frameworkOffer: null }), "Hooks");
    expect(free.status === "honest_refusal" ? free.charge.freeClaimRefusal : "wrong state").toBe(true);
    const held = studioStateFor(result({ run: null, creditsChargedNow: 0, freeClaimRefusal: true }), "Hooks");
    expect(held.status === "settled_held" ? held.charge.freeClaimRefusal : "wrong state").toBe(true);
    const replay = studioStateFor(result({ run: null, replayed: true, creditsChargedNow: 0, freeClaimRefusal: true }), "Hooks");
    expect(replay.status === "replayed" ? replay.freeClaimRefusal : "wrong state").toBe(true);
  });

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
            disclosure: { platform: "SENTINEL-PLATFORM", guidance: "SENTINEL-GUIDANCE" },
          },
        },
      }),
      "Hooks"
    );
    expect(state.status).toBe("usable");
    if (state.status !== "usable") throw new Error("unreachable");
    expect(state.document.hooks).toEqual([{ text: "H", mechanic: "M" }]);
    // THE DISCLOSURE IS THE FACADE'S KIND, NOT THE MODEL'S SECTION (R-121,
    // audit P1-R1): neither the model's guidance nor its platform crosses.
    expect(state.document.disclosure).toEqual({ kind: "policy_check_required" });
    expect(JSON.stringify(state)).not.toContain("SENTINEL-GUIDANCE");
    expect(JSON.stringify(state)).not.toContain("SENTINEL-PLATFORM");
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
        field: "/caption/text",
        unit: "Most people skip the label on a short like this.",
      },
    ]);
    expect(JSON.stringify(state)).not.toContain("FIRST_ATTEMPT_CLAIM");
    // ...EXCEPT a finding in the model's disclosure section, whose `unit` is
    // that section's prose: stored on the generation, not projected.
    expect(JSON.stringify(state)).not.toContain("SENTINEL-UNIT");
  });

  it("SENTINEL: no sentence of a REFUSED draft is serialised — findings carry token and field, the reasons quote nothing, and a stored reason projects its headline only", async () => {
    const { honestRefusal } = await import("../packages/modes/src/kill-test");
    const DRAFT = "SENTINEL-DRAFT this hook is guaranteed to work";
    const hardRules = [
      { rule: "forbidden_claim", shape: "guarantee", field: "/hooks/0/text", excerpt: DRAFT, remedy: "Say what the idea does." },
    ] as never;
    const refusal = honestRefusal({ hardRules, traceability: [], claims: [] } as never);
    const refusedKillTest = {
      ...killTest,
      outcome: "failed",
      attempts: 2,
      rewritten: true,
      finalAttempt: {
        hardRules,
        traceability: [{ kind: "currency", enforcement: "hard", token: "$4,000", field: "/caption/text", unit: DRAFT, shape: "currency", startUtf16: 0, endUtf16: 6 }],
        claims: [{ shape: "guarantee", family: "certainty", enforcement: "hard", token: "guarantee", field: "/hooks/0/text", unit: DRAFT }],
      },
    };
    const fresh = studioStateFor(
      result({ run: { status: "refused", refusal, killTest: refusedKillTest }, creditsChargedNow: 0, freeClaimRefusal: true, frameworkOffer: null }),
      "Hooks"
    );
    expect(fresh.status).toBe("honest_refusal");
    expect(JSON.stringify(fresh)).not.toContain("SENTINEL-DRAFT");
    // NON-VACUITY: the token and field still travel.
    expect(JSON.stringify(fresh)).toContain('"token":"guarantee"');
    expect(JSON.stringify(fresh)).toContain('"field":"/hooks/0/text"');
    // A STORED reason from before the fix carries the excerpt in its middle lines.
    const stored = ["This one did not survive the kill test, so it is not being shown.", "forbidden_claim at /hooks/0/text: " + DRAFT + " — fix it", "Try a smaller claim."].join("\n");
    for (const over of [{ replayed: true }, { replayed: false }]) {
      const state = studioStateFor(
        result({ ...over, run: null, generation: { ...generation, outcome: "honest_refusal", refusalReason: stored }, creditsChargedNow: 0, freeClaimRefusal: false }),
        "Hooks"
      );
      expect(JSON.stringify(state)).not.toContain("SENTINEL-DRAFT");
      expect(JSON.stringify(state)).toContain("did not survive the kill test");
    }
    // ...and the rendered panel keeps "The draft that failed is not shown" true.
    const html = renderOutcome(fresh);
    expect(html).not.toContain("SENTINEL-DRAFT");
    expect(html).toContain("The draft that failed is not shown");
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

  it("THREE OUTCOMES, decided on `replayed` alone (audit P3-A2): a replay, and a SETTLED HELD DRAFT that charged", () => {
    // A replay is `replayed: true` — whatever `run` says.
    for (const over of [
      { replayed: true, run: null },
      // A shape where the two disagree must still not render a stored draft as
      // a fresh one that was just paid for.
      { replayed: true, run: { status: "usable" } },
    ]) {
      expect(studioStateFor(result(over), "Hooks").status).toBe("replayed");
    }
    // `replayed: false, run: null` is the THIRD outcome — a held draft this
    // press settled and charged. It was mapped to "replayed" until P3-A2,
    // which printed "nothing extra was spent" over a real debit.
    const settledHeld = studioStateFor(result({ replayed: false, run: null, creditsChargedNow: 3 }), "Hooks");
    expect(settledHeld.status).toBe("settled_held");
    if (settledHeld.status !== "settled_held") throw new Error("unreachable");
    expect(settledHeld.charge).toEqual({ creditsChargedNow: 3, balanceAfter: 20 });
    expect(settledHeld.attemptId).toBe("a1");
  });

  it("PLANTED: the pre-P3-A2 inversion (`run === null` read as a replay) is what the case above refuses", () => {
    // The old predicate, written out: it sends the third outcome to "replayed".
    const inverted = (r: { replayed: boolean; run: unknown }) => (r.replayed || r.run === null ? "replayed" : "other");
    expect(inverted({ replayed: false, run: null })).toBe("replayed");
    expect(studioStateFor(result({ replayed: false, run: null }), "Hooks").status).not.toBe(
      inverted({ replayed: false, run: null })
    );
  });

  it("the settled held draft's rendered text never says nothing was spent or that nothing ran; a ZERO-cost settle names no ledger entry", () => {
    const charged = renderOutcome(studioStateFor(result({ replayed: false, run: null, creditsChargedNow: 3 }), "Hooks"));
    expect(charged).toContain('data-testid="studio-settled-held"');
    expect(decoded(charged)).toContain("That cost 3 credits.");
    expect(decoded(charged)).toContain("The entry is in your credit history on the usage page.");
    expect(decoded(charged)).not.toMatch(/nothing extra was spent/i);
    expect(decoded(charged)).not.toMatch(/did not run anything/i);
    expect(decoded(charged)).toContain(savedPackHref("a1"));
    const free = renderOutcome(studioStateFor(result({ replayed: false, run: null, creditsChargedNow: 0 }), "Hooks"));
    expect(decoded(free)).toContain("Nothing was taken from your credit balance");
    expect(decoded(free)).not.toMatch(/credit history/);
    // And a TRUE replay still says what is true for it.
    const replay = renderOutcome(studioStateFor(result({ replayed: true, run: null, creditsChargedNow: 0 }), "Hooks"));
    expect(decoded(replay)).toMatch(/nothing extra was spent/i);
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
    // Audit P3-R2: the assembled-input ceiling `meteredCall` runs first — its
    // refusal class is constructed here, in @respin/llm, not in generate.ts.
    "packages/llm/src/input-ceiling.ts",
    "packages/credits/src/inference.ts",
    "packages/credits/src/fold.ts",
    "packages/credits/src/clock.ts",
    "packages/credits/src/stripe/auto-topup.ts",
    "packages/config/src/index.ts",
    "packages/modes/src/assemble.ts",
    "packages/modes/src/kill-test.ts",
    "packages/modes/src/output.ts",
    "packages/modes/src/modes.ts",
    // Launch L2 (R-151): the creative piece's producers, LISTED — the
    // selection, "New generation" and cancel actions run on this screen, and
    // `generate` reads the piece through the db capability whose writer
    // throws `CreativePieceError` (CLAUDE.md non-negotiable 7: a second
    // producer is a list edit, never an automatic inclusion).
    "packages/credits/src/creative-work.ts",
    "packages/db/src/creative-work-ops.ts",
    "packages/modes/src/creative.ts",
    "packages/db/src/llm-transport-selection.ts",
    // Launch L3 (R-152): two more producers on this screen, LISTED. The
    // generation path now reads recent work (`recent-context.ts`), and the
    // "Remember this for future drafts" action composes the creator-edit path
    // (`feedback-ops.ts` -> `brain-ops.ts`), whose refusals render in the same
    // closed copy set.
    "packages/credits/src/recent-context.ts",
    "packages/db/src/feedback-ops.ts",
    "packages/db/src/brain-ops.ts",
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
    // Launch L3 (R-152): "Remember this for future drafts" reaches
    // `caps.appendOnboardingInput` and `caps.writeBrainDoc` in with-workspace.ts
    // through `editBrainDocument` — their owner gate, the reference-echo bar and
    // the three storage ceilings, listed rather than scanned (the file is the
    // whole capability surface, most of which this screen never reaches).
    ProfileRoleError: "the creator-edit write's owner gate",
    ReferenceEchoError: "the creator-edit write's reference-echo bar",
    BrainVersionLimitError: "the creator-edit write's version ceiling",
    BrainDocumentLimitError: "the creator-edit write's document ceiling",
    OnboardingInputLimitError: "the creator-edit input's ceiling",
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

  /**
   * THROWN ON THE SPEND PATH, AND NOT A REFUSAL A CREATOR CAN RECEIVE — by
   * list, each with its reason (audit P3-R2). `assertInputWithinCeiling`
   * refuses a non-positive ceiling with a `RangeError`; a parsed config
   * document cannot carry one (`llm.maxInputTokens` is `.int().min(1)`,
   * defaulted), so only a cast-in document reaches it, and it is the loud
   * programming-error shape on purpose.
   */
  const NOT_A_CREATOR_REFUSAL: Readonly<Record<string, string>> = {
    RangeError: "the input ceiling's invalid-ceiling invariant — unreachable from a parsed config document",
  };
  /**
   * An instance-branch code this screen's producers cannot reach, by list
   * (audit P3-R2): `input_too_large_posts` needs `largestPart === null`, which
   * only `runInference` (no recorded parts) produces; `meteredCall` always
   * passes the prompt's `partSizes`. Its copy names the onboarding entitlement,
   * which is exactly why it must not be in this screen's set.
   */
  const UNREACHABLE_BRANCH_CODES: Readonly<Record<string, string>> = {
    input_too_large_posts: "the inference caller's no-parts branch; the studio always records parts",
  };

  it("every class the spend path throws maps to a code this screen has copy for", () => {
    const codes = new Set<string>();
    const names = [...thrownClassNames(spendPathSrc), ...Object.keys(ALSO_REACHABLE)].filter(
      (name) => !(name in NOT_A_CREATOR_REFUSAL)
    );
    // The exemptions are real producers, not stale entries.
    for (const name of Object.keys(NOT_A_CREATOR_REFUSAL)) {
      expect(thrownClassNames(spendPathSrc), name).toContain(name);
    }
    for (const name of names) {
      const code = codeForClassName(name);
      expect(
        code,
        `${name} is thrown on the studio spend path but resolves to no billing error code`
      ).toBeDefined();
      codes.add(code as string);
      for (const c of INSTANCE_BRANCH_CODES[name] ?? []) {
        if (!(c in UNREACHABLE_BRANCH_CODES)) codes.add(c);
      }
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
      // THE VOICE NOTICE, IN THE SCAN (Phase 1 T5 / AC8). Every other row
      // inherits `brainActiveWithoutVoice: false`, so before this row the
      // `studio-no-voice` banner and `VOICE_DOCUMENT_NEEDED` never entered the
      // honesty sweep — a planted "Guaranteed success." on that literal passed
      // every scan (batch-2 GEN02).
      "brain active without a Voice document",
      {
        ...baseView,
        brainActiveWithoutVoice: true,
        run: { ...baseView.run!, activeKinds: ["Strategy", "Kill test"] },
      },
    ],
    [
      "brain histories unreadable",
      {
        ...baseView,
        brainActiveWithoutVoice: false,
        run: {
          ...baseView.run!,
          activeKinds: null,
          block: generateBlock({ isViewer: false, paused: false, brainActivated: null }),
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
    expect(claimHits(planted, FORBIDDEN)).toEqual(
      expect.arrayContaining(["guarantee", "views", "improve"])
    );
  });

  it("the script strip is NARROW: a promise outside a script tag is still caught", () => {
    const planted = visibleCopy(
      '<p>this will go viral</p><script>var x = "this will go viral";</script>'
    ).toLowerCase();
    expect(planted).toContain("<p>this will go viral</p>");
    expect(planted).not.toContain("var x");
    expect(claimHits(planted, FORBIDDEN)).toEqual(
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
        disclosure: { kind: "policy_check_required" },
      },
      killTest: {
        ...KILL_TEST,
        limitNote: "nothing to say",
        verdicts: [],
        traceability: [],
      },
      charge: { creditsChargedNow: 0, balanceAfter: 0, freeClaimRefusal: false },
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

  // AUDIT P6-R6 (register item 8, HIGH): THIS CASE USED TO BE "the n = 0
  // statement is unconditional", and it pinned a sentence that was false for
  // every creator who had used `/results`. It now asserts the CONDITIONS — the
  // branch the creator's own scoped count selects, and whether the screen's
  // modes read recent work — so a reworded sentence stays green and a sentence
  // that drops either fact is red.
  describe("the results sentence is CONDITIONAL (P6-R6, R-174)", () => {
    const basis = STUDIO_POSITIVE_ASSERTIONS.find((a) => a.testId === "studio-no-results-basis")!;
    const ZERO = /no results of yours have been logged/i;
    const COUNTED = /you have logged (\d+) results?\./i;
    const HISTORY_MODES: ModeChoiceView[] = [
      { id: "m-b", label: "Idea to script", status: "available", cost: 12, takesCreativeForm: true },
      { id: "m-e", label: "Hooks", status: "available", cost: 5, takesCreativeForm: false },
      { id: "m-g", label: "Ideation", status: "available", cost: 4, takesCreativeForm: true },
    ];
    const region = (run: Partial<NonNullable<StudioViewProps["run"]>>): string => {
      const html = renderView({ run: { ...baseView.run!, ...run } });
      const at = html.indexOf('data-testid="studio-no-results-basis"');
      expect(at, "the marker is not rendered").toBeGreaterThan(-1);
      return visibleCopy(html.slice(at, html.indexOf("</p>", at)));
    };

    it("zero renders the none-logged branch and never a count", () => {
      const text = region({ resultCount: 0 });
      expect(text).toMatch(ZERO);
      expect(text).toMatch(/not measuring you/i);
      expect(text).not.toMatch(COUNTED);
      expect(basis.must.test(text)).toBe(true);
    });

    it("a positive count renders THAT count, none of them, and the verified precondition, and removes the zero sentence", () => {
      for (const n of [1, 3, 41]) {
        const text = region({ resultCount: n });
        expect(text, `n=${n}`).not.toMatch(ZERO);
        expect(COUNTED.exec(text)?.[1], `n=${n}: the count the page passed`).toBe(String(n));
        // Singular for exactly one (Phase 6 gate, LOW): "1 result. It does
        // not change a draft", never "1 results" or "none of them".
        expect(text).toMatch(n === 1 ? /logged 1 result\. It does not change a draft/ : /none of them/i);
        if (n === 1) expect(text).not.toMatch(/1 results|none of them/i);
        expect(text).toMatch(/verified analytics connector/i);
        expect(basis.must.test(text), `n=${n}`).toBe(true);
        // The branch the creator reads is canon-clean (no `learn` stem, no
        // performance claim).
        expect(claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), `n=${n}`).toEqual([]);
      }
    });

    it("a failed count read says so and NEVER falls back to the zero sentence", () => {
      const text = region({ resultCount: null });
      expect(text).not.toMatch(ZERO);
      expect(text).not.toMatch(COUNTED);
      expect(text).toMatch(/could not read how many results/i);
      expect(basis.must.test(text)).toBe(true);
    });

    it("the recent-work channel is named for exactly the modes that read it, and absent where none does", () => {
      const withHistory = region({ resultCount: 0, modes: HISTORY_MODES });
      expect(withHistory).toMatch(/labelled history/);
      expect(withHistory).toContain("Idea to script and Ideation drafts also see");
      expect(withHistory).not.toMatch(/Hooks drafts/);
      expect(withHistory).not.toMatch(/nothing else of yours/);
      expect(withHistory).toMatch(/never counts as evidence/);
      // No mode reads history: "nothing else" is then true, and is what is said.
      const without = region({ resultCount: 0, modes: MODES });
      expect(without).toMatch(/nothing else of yours/);
      expect(without).not.toMatch(/labelled history/);
      expect(basis.must.test(withHistory)).toBe(true);
      expect(basis.must.test(without)).toBe(true);
    });

    it("PLANTS: the harness reddens on a sentence that drops the channel, and stays green on a rewording that keeps the facts", () => {
      const counted = resultsBasisSentence(3, ["Ideation"]);
      const dropped = counted.replace(historySentence(["Ideation"]), "");
      expect(dropped).not.toBe(counted);
      expect(basis.must.test(dropped), "a sentence without the channel passed").toBe(false);
      // The OLD unconditional sentence is red when a count exists: it says
      // none logged and names no channel.
      expect(
        basis.must.test(
          "Nothing here is based on how your posts have done. No results of yours have been logged — this product holds none, and it is not measuring you. A draft is built from the brain you confirmed and from what you type in."
        )
      ).toBe(false);
      // A rewording that keeps every fact stays green: the harness reads the
      // condition, not the words around it.
      expect(
        basis.must.test(
          "You have logged 3 results. None of them alters a draft until a verified connector exists. Ideation drafts also read your recent drafts as labelled history."
        )
      ).toBe(true);
    });

    it("it renders on the FORM in every offered state, the blocked ones included", () => {
      for (const block of [null, { reason: "viewer" }]) {
        expect(region({ block, resultCount: 2 })).toMatch(COUNTED);
      }
    });
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
    expect(REVISION_NOTE_HELP).toMatch(/a refusal is charged like any other run/i);
    // R-173: ...except a refusal caused only by a promised result.
    expect(REVISION_NOTE_HELP).toMatch(/a claim this product won't make: that one uses no credits/i);
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
    // AUDIT P6-A4: it names the normalisation and makes no "as you typed"
    // claim at all, caveated or not.
    expect(limit).toMatch(/line endings and Unicode form made consistent and nothing else changed/);
    expect(limit).not.toMatch(/as you typed/i);
    expect(feedbackRecordedSentence("off_voice", true)).not.toMatch(
      /word for word/i
    );
  });

  it("R12: it says what feedback DOES and DOES NOT do today", () => {
    const html = withResult();
    expect(html).toContain('data-testid="studio-feedback-today"');
    // The claims, each asserted: it is stored, it does not change the brain,
    // it IS shown to the next concept/script drafts as labelled history since
    // launch L3 (R-152) — the old "Nothing reads it today" became false and is
    // asserted ABSENT — and a later slice may PROPOSE rather than apply.
    expect(html).toMatch(/stored as a record of what you said/i);
    expect(html).not.toMatch(/Nothing reads it today/i);
    expect(html).not.toMatch(/does not change the next draft/i);
    expect(html).toMatch(/It does not change your brain/i);
    expect(html).toMatch(/labelled history/i);
    expect(html).toMatch(/never a fact about you/i);
    expect(html).toMatch(/unless you ask for a sequel/i);
    // L3 GATE, LEARNING LOW B-L1: the sentence names BOTH ways a reaction is
    // shown, with the read's OWN bounds — every reaction rides as a label on
    // each of up to RECENT_DRAFTS_MAX drafts, and only RECENT_NOTES_MAX
    // reactions are shown with their notes. It used to say only the second,
    // which under-stated what is sent.
    const words: Record<number, string> = { 3: "three", 5: "five" };
    expect(words[RECENT_DRAFTS_MAX], "add the number word for the new bound").toBeDefined();
    expect(words[RECENT_NOTES_MAX], "add the number word for the new bound").toBeDefined();
    expect(FEEDBACK_TODAY).toContain(
      `up to ${words[RECENT_DRAFTS_MAX]} of your most relevant recent concept batches and scripts, each labelled with every reaction you recorded on it`
    );
    expect(FEEDBACK_TODAY).toContain(
      `up to ${words[RECENT_NOTES_MAX]} of your most relevant recent reactions with the note you wrote`
    );
    expect(FEEDBACK_TODAY).not.toMatch(/Up to three of your most relevant recent reactions to concepts and scripts, with any note/);
    // ...and the note-words filter (A-L2) is stated, not hidden.
    expect(FEEDBACK_TODAY).toMatch(/a date, an amount, a percentage or a multiple/);
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
    for (const surface of surfaces) {
      expect(
        claimHits(surface, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS),
        `in: ${surface.slice(0, 80)}`
      ).toEqual([]);
    }
    // NON-VACUITY, per word: the specimen for each banned claim really matches
    // its own pattern, so a typo in one pattern cannot leave a word sayable.
    for (const [label, specimen] of specimensFor(FORBIDDEN_CLAIMS)) {
      expect(claimHits(specimen, FORBIDDEN_CLAIMS), label).toContain(label);
    }
  });

  it("feedbackRecordedSentence reports what was STORED, note included or not", () => {
    // `noteKept` is its own fact and is NOT derivable from "a note was sent":
    // the capability refuses a blank-but-present note outright, so telling
    // somebody their words were kept when the column is NULL is a lie about
    // their own record.
    const kept = feedbackRecordedSentence("off_voice", true);
    expect(kept).toContain(reactionLabel("off_voice"));
    expect(kept).toMatch(/Your note was stored with it\./);
    // AUDIT P6-A4: no "as you typed it" beside a `normaliseContent` write.
    expect(kept).not.toMatch(/as you typed/i);
    expect(feedbackNoteLimit(500)).not.toMatch(/as you typed/i);
    expect(feedbackNoteLimit(500)).toMatch(/line endings and Unicode form made consistent and nothing else changed/);
    const not = feedbackRecordedSentence("off_voice", false);
    expect(not).toMatch(/No note was sent with it/i);
    // AND NEITHER THANKS THE CREATOR FOR TEACHING THE PRODUCT ANYTHING. Since
    // launch L3 the claim is the BRAIN's, not the whole product's: the next
    // concept or script draft may be shown this reaction as history.
    for (const sentence of [kept, not]) {
      expect(sentence).toMatch(/your brain has not changed because of it/i);
      expect(sentence).not.toMatch(/nothing in the product has changed/i);
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

  // AUDIT P6-A1 (R-174): "LEAVE THIS OUT OF FUTURE DRAFTS" — offered beside a
  // recorded reaction, posting only that row's id, and saying what happened.
  it("P6-A1: the leave-out control targets the stored reaction, and each of its states renders", () => {
    const withExclude = (feedback: FeedbackState, exclude: ExcludeState) =>
      decoded(
        renderToStaticMarkup(
          <FeedbackBlock
            generationId="gen-1"
            reactions={GENERATION_FEEDBACK_REACTIONS}
            noteMax={FEEDBACK_NOTE_MAX}
            formAction={() => {}}
            pending={false}
            state={feedback}
            refusalCopy={REFUSAL_COPY}
            fallbackCopy={REFUSAL_COPY.unknown}
            exclude={{ formAction: () => {}, pending: false, state: exclude }}
          />
        )
      );
    const recorded: FeedbackState = {
      status: "recorded",
      generationId: "gen-1",
      reaction: "off_voice",
      noteKept: true,
      feedbackId: "0196a0b0-0000-7000-8000-000000000001",
    };
    // Nothing recorded yet: no control, because there is nothing to leave out.
    expect(withExclude({ status: "idle" }, { status: "idle" })).not.toContain('data-testid="studio-feedback-exclude"');
    // Recorded: the control posts the STORED ROW's id and nothing else.
    const offered = withExclude(recorded, { status: "idle" });
    expect(offered).toContain('data-testid="studio-feedback-exclude"');
    expect(offered).toContain(`name="feedbackId" value="${recorded.feedbackId}"`);
    expect(offered).toContain(EXCLUDE_FROM_HISTORY_LABEL);
    expect(offered).toContain(EXCLUDE_FROM_HISTORY_HELP);
    // THE PROPOSAL PATH IS NAMED (Phase 6 tenancy and learning gates): leaving a
    // reaction out of the history does not withdraw it from repeated-reaction
    // proposals, and the control says so, with the creator's approval named.
    expect(EXCLUDE_FROM_HISTORY_HELP).toContain(
      "It can still count toward a suggested edit to your brain, which you approve or reject."
    );
    expect(EXCLUDE_FROM_HISTORY_HELP).toContain("Leaving it out cannot be undone.");
    expect(EXCLUDE_FROM_HISTORY_HELP).not.toMatch(/from this page/);
    // A recorded state from before the id existed offers no control.
    const { feedbackId: _omit, ...withoutId } = recorded;
    void _omit;
    expect(withExclude(withoutId, { status: "idle" })).not.toContain('data-testid="studio-feedback-exclude"');
    // Left out: the sentence, inside the persistent status region, and no
    // second press offered for the same row.
    const done = withExclude(recorded, { status: "excluded", feedbackId: recorded.feedbackId! });
    expect(done).toContain(EXCLUDED_FROM_HISTORY_SENTENCE);
    expect(done).not.toContain(`name="feedbackId"`);
    // A stamp for a DIFFERENT row (an earlier reaction) does not read as this one.
    expect(withExclude(recorded, { status: "excluded", feedbackId: "other" })).not.toContain(
      EXCLUDED_FROM_HISTORY_SENTENCE
    );
    // Refused: the refusal's own copy.
    const refused = withExclude(recorded, { status: "refused", code: "feedback_exclusion_target" });
    expect(refused).toContain('data-testid="studio-feedback-exclude-refused"');
    expect(refused).toContain(REFUSAL_COPY.feedback_exclusion_target.title);
  });

  it("D-L1: the recorded sentence renders INSIDE the persistent status region — there is exactly one status region, present from the first render", () => {
    const statusRegion = (html: string) => {
      const start = html.indexOf('data-testid="studio-feedback-status"');
      expect(start, "the persistent region is missing").toBeGreaterThan(-1);
      return html.slice(start, html.indexOf("</p>", start));
    };
    const idle = withResult();
    expect(idle.match(/role="status"/g)).toHaveLength(1);
    expect(statusRegion(idle)).not.toContain("Recorded:");
    const recorded = withResult({ status: "recorded", generationId: "g", reaction: "off_voice", noteKept: true });
    expect(recorded.match(/role="status"/g)).toHaveLength(1);
    expect(statusRegion(recorded)).toContain('data-testid="studio-feedback-recorded"');
    expect(statusRegion(recorded)).toContain(feedbackRecordedSentence("off_voice", true));
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

// ----------------------------------- R-148 (launch L1): the creative form

describe("R-148: the creative form control, the request it builds, and the v2 presenter", () => {
  beforeEach(() => {
    actionMocks.requireUser.mockResolvedValue({ id: "user-1", email: "anna@example.test", name: "Anna" });
    actionMocks.scopeForUser.mockResolvedValue({ workspaceId: "workspace-1", role: "editor" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A plan where the FIRST offered mode takes the form control. */
  const FORM_FIRST: ModeChoiceView[] = [
    { id: "m-g", label: "Ideation", status: "available", cost: 4, takesCreativeForm: true },
    { id: "m-e", label: "Hooks", status: "available", cost: 5, takesCreativeForm: false },
  ];
  const renderPanel = (modes: ModeChoiceView[]) =>
    renderToStaticMarkup(<StudioPanel {...baseView.run!} modes={modes} />);
  /** The `name` of every input inside the rendered form control. */
  const controlNames = (html: string): string[] => {
    const start = html.indexOf('data-testid="studio-form-control"');
    // The control's OWN close: its filming-limits fieldset is its last child,
    // so the two closes are adjacent exactly once, at the end.
    const end = html.indexOf("</fieldset></fieldset>", start);
    expect(start, "no form control rendered").toBeGreaterThan(-1);
    expect(end, "the form control did not close where expected").toBeGreaterThan(start);
    const control = html.slice(start, end);
    return [...new Set([...control.matchAll(/name="([^"]+)"/g)].map((m) => m[1]))];
  };

  it("is offered beside a mode the server marked, with every option the facade lists and 'Choose for me' preselected", () => {
    const html = renderPanel(FORM_FIRST);
    expect(html).toContain('data-testid="studio-form-control"');
    expect(html).toContain(`<legend>${FORM_CONTROL_LEGEND}</legend>`);
    // ATTRIBUTE ORDER IS REACT'S, so each radio is read as a whole tag.
    const radios = [...html.matchAll(/<input[^>]*name="formChoice"[^>]*>/g)].map((m) => m[0]);
    const values = radios.map((tag) => /value="([^"]+)"/.exec(tag)?.[1]);
    expect(values).toEqual(CREATIVE_FORM_OPTIONS.map((o) => o.id));
    for (const option of CREATIVE_FORM_OPTIONS) expect(decoded(html)).toContain(option.label);
    // "Choose for me" is first and is the one checked.
    expect(CREATIVE_FORM_OPTIONS[0].label).toBe("Choose for me");
    expect(radios.filter((tag) => /checked=""/.test(tag))).toHaveLength(1);
    expect(radios.find((tag) => /checked=""/.test(tag))).toContain('value="auto"');
    // Every filming input is LABELLED — a `for` that names its input's id.
    for (const id of ["studio-max-minutes", "studio-locations", "studio-equipment", "studio-footage"]) {
      expect(html, id).toContain(`for="${id}"`);
      expect(html, id).toContain(`id="${id}"`);
    }
    // The advertised bounds are the parse's own, from the facade.
    expect(html).toContain(`max="${CREATIVE_CONSTRAINT_BOUNDS.minutesMax}"`);
    expect(html).toContain(`maxLength="${CREATIVE_CONSTRAINT_BOUNDS.footageMaxCodePoints}"`);
  });

  it("is NOT offered beside a mode that takes none — the form then sends no form choice at all", () => {
    const html = renderPanel(MODES);
    expect(html).not.toContain('data-testid="studio-form-control"');
    expect(html).not.toContain('name="formChoice"');
  });

  it("THE FORM CONTROL REACHES THE REQUEST: every rendered name is read by the action, onto `params.creative`", async () => {
    const names = controlNames(renderPanel(FORM_FIRST));
    expect(names.sort()).toEqual(
      ["equipment", "footage", "formChoice", "locations", "maxMinutes", "people"].sort()
    );
    const generateSpy = vi
      .spyOn(respinCredits, "generate")
      .mockRejectedValue(new CreativeRequestError("unknown_form"));
    const values: Record<string, string> = {
      formChoice: "demonstration_experiment",
      people: "solo",
      maxMinutes: "30",
      locations: "kitchen, garage",
      equipment: "phone, tripod",
      footage: "two clips of the oven",
    };
    const fd = new FormData();
    fd.set("mode", "m-g");
    fd.set("input", "an idea");
    fd.set("platform", "TikTok");
    fd.set("revisionOf", "");
    // KEYED ON THE RENDERED NAMES, so a renamed input is a red test here.
    for (const name of names) fd.set(name, values[name]);
    await generateAction("profile-1", IDLE_ACTION_STATE, fd);
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const params = generateSpy.mock.calls[0][2];
    expect(params.creative).toEqual({
      formChoice: "demonstration_experiment",
      constraints: {
        people: "solo",
        maxMinutes: 30,
        // SPLIT, NOT TRIMMED: normalisation is the operation's parse, in one place.
        locations: ["kitchen", " garage"],
        equipment: ["phone", " tripod"],
        footage: "two clips of the oven",
      },
    });
  });

  it("no form choice on the wire means NO creative request — never a defaulted one", async () => {
    const generateSpy = vi
      .spyOn(respinCredits, "generate")
      .mockRejectedValue(new CreativeRequestError("unknown_form"));
    const fd = new FormData();
    fd.set("mode", "m-e");
    fd.set("input", "an idea");
    fd.set("platform", "TikTok");
    fd.set("revisionOf", "");
    await generateAction("profile-1", IDLE_ACTION_STATE, fd);
    expect("creative" in generateSpy.mock.calls[0][2]).toBe(false);
  });

  it("a minute count that is not plain digits is handed on as NaN, for the operation to REFUSE", async () => {
    const generateSpy = vi
      .spyOn(respinCredits, "generate")
      .mockRejectedValue(new CreativeRequestError("invalid_constraint", "maxMinutes"));
    for (const [raw, expected] of [
      ["0x10", Number.NaN],
      ["1e2", Number.NaN],
      ["12.5", Number.NaN],
      ["12", 12],
      ["", null],
    ] as const) {
      const fd = new FormData();
      fd.set("mode", "m-g");
      fd.set("input", "an idea");
      fd.set("platform", "TikTok");
      fd.set("formChoice", "auto");
      fd.set("maxMinutes", raw);
      await generateAction("profile-1", IDLE_ACTION_STATE, fd);
      const sent = generateSpy.mock.calls.at(-1)![2].creative!.constraints!.maxMinutes;
      if (expected === null) expect(sent, raw).toBeNull();
      else if (Number.isNaN(expected)) expect(Number.isNaN(sent), raw).toBe(true);
      else expect(sent, raw).toBe(expected);
    }
  });

  it("a HOSTILE form choice is refused with copy, and never reaches a log line unclamped", async () => {
    vi.spyOn(respinCredits, "generate").mockRejectedValue(
      new CreativeRequestError("unknown_form")
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const hostile = '<img src=x onerror="alert(1)"> DROP TABLE';
    const fd = new FormData();
    fd.set("mode", "m-g");
    fd.set("input", "an idea");
    fd.set("platform", "TikTok");
    fd.set("formChoice", hostile);
    const state = await generateAction("profile-1", IDLE_ACTION_STATE, fd);
    expect(state.latest).toEqual({ status: "refused", code: "creative_request" });
    const line = JSON.stringify(logged.mock.calls);
    expect(line).not.toContain("onerror");
    expect(line).not.toContain("DROP TABLE");
    // NON-VACUITY: the field IS logged — as the clamp's sentinel.
    expect(line).toContain('"formChoice":"not-a-label"');
  });

  it("both creative refusals have their own copy on this screen, and say nothing was spent", () => {
    for (const code of ["creative_request", "creative_revision_legacy"] as const) {
      expect(STUDIO_ERROR_CODES).toContain(code);
      expect(REFUSAL_COPY[code].detail).toMatch(/nothing was spent and no model was called/i);
    }
    expect(billingErrorCode(new CreativeRequestError("unknown_form"))).toBe("creative_request");
    expect(billingErrorCode(new CreativeRequestError("invalid_constraint", "footage"))).toBe(
      "creative_request"
    );
    expect(billingErrorCode(new CreativeRequestError("revision_keeps_legacy_format"))).toBe(
      "creative_revision_legacy"
    );
    // The copy names NO value — it cannot echo what was refused.
    expect(REFUSAL_COPY.creative_request.detail).not.toContain("silent");
  });

  it("a revision does not offer the control, and says the parent's form is kept", () => {
    // `parent` is client state a static render cannot select, so the branch is
    // asserted where it is decided: the control renders only with no parent,
    // and the note only with one.
    const src = read("app/(product)/studio/studio-panel.tsx");
    expect(src).toContain("effectiveMode?.takesCreativeForm && parent === null ? (");
    expect(src).toContain("effectiveMode?.takesCreativeForm && parent !== null ? (");
    expect(src).toContain("{REVISION_KEEPS_FORM_NOTE}");
  });

  // ---- the presenter

  const killTestV2 = {
    outcome: "passed",
    attempts: 1,
    rewritten: false,
    creatorRulesScored: false,
    creatorRuleVerdicts: [],
    traceabilityLimitNote: "LIMIT",
    firstAttempt: { hardRules: [], traceability: [], claims: [] },
    finalAttempt: { hardRules: [], traceability: [], claims: [] },
    refusal: null,
  };
  const v2Result = (output: Record<string, unknown>) =>
    ({
      attemptId: "a1",
      replayed: false,
      generation: {
        id: "gen-v2",
        mode: "ideation",
        outcome: "usable",
        weakestPoint: "W",
        refusalReason: null,
        promptBundleVersion: "modes/ideation@abc",
        rewriteCount: 0,
      },
      creditsChargedNow: 3,
      balanceAfter: 20,
      configVersion: 1,
      resolvedTier: "free",
      frameworkOffer: null,
      run: { status: "usable", drafts: 1, promptBundleVersion: "x", killTest: killTestV2, output },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  const FILMING_LINE = { location: "kitchen", equipment: ["phone"], people: "solo", minutes: 20 };
  const UNIVERSAL_V2 = {
    whyThisPerforms: { reasoning: "R", weakestPoint: "the opening has not been tried on this audience" },
    disclosure: { platform: "TikTok", guidance: "G" },
  };
  const V2_BATCH = {
    contractVersion: 2,
    requestedForm: "auto",
    ideas: [
      {
        hook: "story hook",
        thesis: "a story thesis that asserts something",
        form: "personal_story_observation",
        framework: "the evidence tutorial",
        frameworkProvenance: "offered",
        premise: {
          whatHappens: "you change the lens again and again",
          interest: "everyone has kept going too long",
          payoff: "the take you keep",
          basis: { kind: "material", excerpt: "shot the same lens change over and over" },
        },
        filming: FILMING_LINE,
      },
      {
        hook: "demo hook",
        thesis: "a demonstration thesis that asserts something",
        form: "demonstration_experiment",
        framework: "the burnt loaf arc",
        frameworkProvenance: "custom",
        premise: {
          whatHappens: "you film it twice",
          interest: "the difference is visible",
          payoff: "the prepared take holds focus [check]",
          basis: { kind: "unconfirmed" },
        },
        // The model's text as stored; the SERVER's decision is `serverChecks` below.
        filming: { ...FILMING_LINE, location: "a rooftop", equipment: ["drone"], people: "with_help", minutes: 1 },
      },
      {
        hook: "opinion hook",
        thesis: "an opinion thesis that asserts something",
        form: "explain_opinion",
        framework: "the mirror",
        frameworkProvenance: "offered",
        premise: {
          whatHappens: "you argue it to camera",
          interest: "most people get it backwards",
          payoff: "they know which setting to check",
          basis: { kind: "none" },
        },
        filming: FILMING_LINE,
      },
    ],
    ...UNIVERSAL_V2,
    // R-150 point 2: the server's stored decision — concept 1's place and kit
    // are not ones the creator listed; concepts 0 and 2 are fully declared.
    serverChecks: {
      filming: [
        { at: "/ideas/0", location: false, equipment: [] },
        { at: "/ideas/1", location: true, equipment: [0] },
        { at: "/ideas/2", location: false, equipment: [] },
      ],
      shotMap: [],
    },
  };

  it("a v2 concept batch renders what was asked for, each concept's form, premise, basis and filming needs", () => {
    const state = studioStateFor(v2Result(V2_BATCH), "Ideation");
    if (state.status !== "usable") throw new Error("expected usable");
    expect(state.document.creative?.requestedFormLabel).toBe("Choose for me");
    expect(state.document.ideas?.map((i) => i.creative?.formLabel)).toEqual([
      "Personal story or observation",
      "Demonstration or experiment",
      "Explain or give an opinion",
    ]);
    const text = detailsText(renderOutcome(state));
    expect(text).toContain("You asked for: Choose for me");
    expect(text).toContain("Form: Personal story or observation");
    expect(text).toContain("What happens: you change the lens again and again");
    expect(text).toContain("Why it is interesting: everyone has kept going too long");
    expect(text).toContain("The payoff: the take you keep");
    expect(text).toContain(
      "The line of yours this rests on. Check that it supports what happens: “shot the same lens change over and over”"
    );
    // THE SERVER'S STORED DECISIONS ARE RENDERED AS [check] by the facade's
    // `presentedFilming` (R-150 point 2) — the stored text carries no marker —
    // and explained ONCE for the document.
    expect(state.document.ideas?.[1].creative?.filming.location).toEqual({
      text: "a rooftop [check]",
      unconfirmed: true,
    });
    expect(state.document.ideas?.[0].creative?.filming.equipment).toEqual([
      { text: "phone", unconfirmed: false },
    ]);
    expect(renderOutcome(state).match(/data-testid="studio-filming-unconfirmed"/g) ?? []).toHaveLength(1);
    expect(text).toContain(FILMING_UNCONFIRMED_NOTE);
    expect(text).toContain("a rooftop [check]; drone [check]");
    expect(text).toContain(basisSentence({ kind: "unconfirmed" }));
    expect(text).toContain(basisSentence({ kind: "none" }));
    expect(text).toContain(PEOPLE_SENTENCES.solo);
    expect(text).toContain(PEOPLE_SENTENCES.with_help);
    expect(text).toContain("Estimated filming time: 20 minutes.");
    expect(text).toContain("Estimated filming time: 1 minute.");
    // A CUSTOM structure is labelled, never presented as a library framework.
    const customNotes = renderOutcome(state).match(/data-testid="studio-custom-structure"/g) ?? [];
    expect(customNotes).toHaveLength(1);
    expect(text).toContain(CUSTOM_STRUCTURE_NOTE);
  });

  it("the copy for a `none` basis CLAIMS NOTHING about the premise, and tells the creator to mark any event (round-1 compliance BLOCK)", () => {
    // It used to say the premise "describes no event that needs a source" — a
    // product-authored statement about model text the checks cannot vouch for.
    const none = basisSentence({ kind: "none" });
    expect(none).not.toMatch(/no event|describes no|needs no|explanation or opinion/i);
    expect(none).toMatch(/no source given/i);
    expect(none).toContain("[check]");
    // And a quoted basis is labelled as something to CHECK, not as proof.
    expect(basisSentence({ kind: "material", excerpt: "x y z w" })).toMatch(
      /^The line of yours this rests on\. Check that it supports what happens/
    );
  });

  it("R-150 point 2 / Low: the filming note renders ONCE per document, and for a server-marked SHOT-MAP line alone", () => {
    const flaggedTwice = {
      ...V2_BATCH,
      serverChecks: {
        ...V2_BATCH.serverChecks,
        filming: V2_BATCH.serverChecks.filming.map((e) => ({ ...e, location: true })),
      },
    };
    const twice = renderOutcome(studioStateFor(v2Result(flaggedTwice), "Ideation"));
    expect(twice.match(/data-testid="studio-filming-unconfirmed"/g) ?? []).toHaveLength(1);
    // A SCRIPT whose filming plan is fully declared and whose only server
    // decision is one shot-map line still gets the note, and the line its mark.
    const shotOnly = {
      contractVersion: 2,
      requestedForm: "explain_opinion",
      thesis: { statement: "S", why: "W" },
      framework: { name: "the evidence tutorial", why: "fits", provenance: "offered" },
      hooks: [{ text: "h", mechanic: "m" }],
      beats: [
        { atSeconds: 0, vo: "open", isTurn: false },
        { atSeconds: 6, vo: "the pivot", isTurn: true, pivot: "turn" },
      ],
      shotMap: [
        { beatIndex: 0, shot: "a slow drone pass over the roof", note: "n" },
        { beatIndex: 1, shot: "close on the dial", note: "n" },
      ],
      form: "explain_opinion",
      premise: { whatHappens: "you argue it", interest: "i", payoff: "p", basis: { kind: "none" } },
      filming: FILMING_LINE,
      ...UNIVERSAL_V2,
      serverChecks: {
        filming: [{ at: "", location: false, equipment: [] }],
        shotMap: [{ index: 0, shot: true, note: false }],
      },
    };
    const state = studioStateFor(v2Result(shotOnly), "Idea to script");
    if (state.status !== "usable") throw new Error("expected usable");
    expect(state.document.shotMap).toEqual([
      { beatIndex: 0, shot: "a slow drone pass over the roof [check]", note: "n", unconfirmed: true },
      { beatIndex: 1, shot: "close on the dial", note: "n", unconfirmed: false },
    ]);
    // ROUND 3 (Low): kit named only in a NOTE marks the note, not the shot.
    const noteOnly = studioStateFor(
      v2Result({ ...shotOnly, serverChecks: { ...shotOnly.serverChecks, shotMap: [{ index: 1, shot: false, note: true }] } }),
      "Idea to script"
    );
    if (noteOnly.status !== "usable") throw new Error("expected usable");
    expect(noteOnly.document.shotMap?.[1]).toEqual({
      beatIndex: 1,
      shot: "close on the dial",
      note: "n [check]",
      unconfirmed: true,
    });
    const html = renderOutcome(state);
    expect(html.match(/data-testid="studio-filming-unconfirmed"/g) ?? []).toHaveLength(1);
    expect(detailsText(html)).toContain(FILMING_UNCONFIRMED_NOTE);
    // …and with no server decision at all, no note.
    const clean = renderOutcome(
      studioStateFor(v2Result({ ...shotOnly, serverChecks: { ...shotOnly.serverChecks, shotMap: [] } }), "Idea to script")
    );
    expect(clean).not.toContain('data-testid="studio-filming-unconfirmed"');
  });

  it("R-150 point 3: the server's confirmation item renders, word for word, on EVERY v2 draft — a story batch and an opinion-only batch alike", () => {
    expect(EVENT_CONFIRMATION_ITEM).toBe(
      "Before you film: confirm every event and result here really happened (or will be filmed as shown), or mark it [check]."
    );
    const story = studioStateFor(v2Result(V2_BATCH), "Ideation");
    if (story.status !== "usable") throw new Error("expected usable");
    expect(story.document.creative?.eventConfirmation).toBe(EVENT_CONFIRMATION_ITEM);
    const html = renderOutcome(story);
    expect(html.match(/data-testid="studio-event-confirmation"/g) ?? []).toHaveLength(1);
    expect(detailsText(html)).toContain(EVENT_CONFIRMATION_ITEM);
    // An opinion-only batch with no basis carries it TOO (round-3 compliance
    // gate, High): no model-written label or basis decides whether it shows.
    const opinionOnly = {
      ...V2_BATCH,
      ideas: [V2_BATCH.ideas[2]],
      serverChecks: { filming: [{ at: "/ideas/0", location: false, equipment: [] }], shotMap: [] },
    };
    const quiet = studioStateFor(v2Result(opinionOnly), "Ideation");
    if (quiet.status !== "usable") throw new Error("expected usable");
    expect(quiet.document.creative?.eventConfirmation).toBe(EVENT_CONFIRMATION_ITEM);
    expect(renderOutcome(quiet).match(/data-testid="studio-event-confirmation"/g) ?? []).toHaveLength(1);
    // The register's own recall-gap example, labelled an opinion with no basis.
    const register = {
      ...opinionOnly,
      ideas: [
        {
          ...V2_BATCH.ideas[2],
          premise: {
            ...V2_BATCH.ideas[2].premise,
            whatHappens: "a stranger knocks your tripod over halfway through your best take",
          },
        },
      ],
    };
    const gap = studioStateFor(v2Result(register), "Ideation");
    expect(detailsText(renderOutcome(gap))).toContain(EVENT_CONFIRMATION_ITEM);
    // …and a LEGACY document never shows it.
    const legacy = studioStateFor(
      v2Result({ ideas: [{ hook: "h", thesis: "t", framework: "f" }], ...UNIVERSAL_V2 }),
      "Ideation"
    );
    expect(renderOutcome(legacy)).not.toContain("studio-event-confirmation");
  });

  it("a v2 SCRIPT names its pivot in words — the reveal of a demonstration, the turn of a story", () => {
    const script = (form: string, pivot: "turn" | "reveal") => ({
      contractVersion: 2,
      requestedForm: form,
      thesis: { statement: "S", why: "W" },
      framework: { name: "the evidence tutorial", why: "fits", provenance: "offered" },
      hooks: [{ text: "h", mechanic: "m" }],
      beats: [
        { atSeconds: 0, vo: "open", isTurn: false },
        { atSeconds: 6, vo: "the pivot", isTurn: true, pivot },
      ],
      form,
      premise: {
        whatHappens: "you film it twice",
        interest: "visible",
        payoff: "it holds [check]",
        basis: { kind: "unconfirmed" },
      },
      filming: FILMING_LINE,
      ...UNIVERSAL_V2,
      serverChecks: { filming: [{ at: "", location: false, equipment: [] }], shotMap: [] },
    });
    const reveal = studioStateFor(v2Result(script("demonstration_experiment", "reveal")), "Idea to script");
    const revealText = detailsText(renderOutcome(reveal));
    expect(revealText).toContain(PIVOT_SENTENCES.reveal);
    expect(revealText).not.toContain(PIVOT_SENTENCES.turn);
    expect(revealText).toContain("You asked for: Demonstration or experiment");
    expect(renderOutcome(reveal)).toContain('data-testid="studio-script-creative"');
    const turn = studioStateFor(v2Result(script("personal_story_observation", "turn")), "Idea to script");
    expect(detailsText(renderOutcome(turn))).toContain(PIVOT_SENTENCES.turn);
    expect(PIVOT_SENTENCES.turn).not.toBe(PIVOT_SENTENCES.reveal);
  });

  it("a LEGACY document renders exactly as before: no creative block, and the turn's own sentence", () => {
    const legacy = studioStateFor(
      v2Result({
        thesis: { statement: "S", why: "W" },
        framework: { name: "cost reveal", why: "fits" },
        hooks: [{ text: "h", mechanic: "m" }],
        beats: [
          { atSeconds: 0, vo: "open", isTurn: false },
          { atSeconds: 6, vo: "the turn", isTurn: true },
        ],
        ...UNIVERSAL_V2,
      }),
      "Idea to script"
    );
    if (legacy.status !== "usable") throw new Error("expected usable");
    expect(legacy.document.creative).toBeUndefined();
    expect(legacy.document.framework).toEqual({ name: "cost reveal", why: "fits" });
    const html = renderOutcome(legacy);
    expect(html).not.toContain("studio-creative");
    expect(html).not.toContain("studio-custom-structure");
    expect(html).not.toContain("studio-form-label");
    expect(detailsText(html)).toContain("This is the turn — where the piece changes direction.");
  });

  it("the v2 render passes the honesty canon — no performance claim, no guarantee", () => {
    const FORBIDDEN: [string, RegExp][] = [
      ...FORBIDDEN_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
      ...PERFORMANCE_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
    ];
    const text = detailsText(renderOutcome(studioStateFor(v2Result(V2_BATCH), "Ideation")));
    expect(claimHits(text, FORBIDDEN)).toEqual([]);
    const panel = detailsText(visibleCopy(renderPanel(FORM_FIRST)));
    expect(claimHits(panel, FORBIDDEN)).toEqual([]);
  });
});

// ------------------------------------------------------------------
// LAUNCH L2 (R-151): the entrances, the choice and the confirmation.
//
// Static renders of every new state, driven through the same honesty canon
// and fold rules as the rest of this screen. THE OPERATION-ID ATTRIBUTE, THE
// FREE PLAN BLOCK, LABELS, REQUIRED STATES and NO FOLD are asserted here; the
// actual-app walk (reload survival) is `e2e/journeys/free-concept.spec.ts`.
describe("L2: the Studio entrances and the piece confirmation", () => {
  const FORBIDDEN_L2: [string, RegExp][] = [
    ...FORBIDDEN_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
    ...PERFORMANCE_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
  ];
  const OP_ID = "0f6d7c2e-3a1b-4c5d-8e9f-0a1b2c3d4e5f";
  const conceptPiece = (planIncludesScript: boolean, credits: number | null = 3): PieceView => ({
    pieceId: "11111111-2222-4333-8444-555555555555",
    version: 1,
    state: "selected",
    operationAttemptId: OP_ID,
    origin: {
      kind: "concept",
      hook: "the room tone you ignored is why your edit sounds cheap",
      thesis: "audio decides whether a solo shoot reads as professional",
      framework: "the confession arc",
      formLabel: "Explain or give an opinion",
      formId: "explain_opinion",
      premise: { whatHappens: "you argue it to camera", interest: "most people get it backwards", payoff: "they know which setting to check" },
    },
    quote: { credits, configVersion: 4, planIncludesScript },
  });
  const pieceProps = (piece: PieceView, over: Partial<PieceConfirmationProps> = {}): PieceConfirmationProps => ({
    piece,
    commissionAction: async () => IDLE_ACTION_STATE,
    newGenerationAction: async () => undefined,
    cancelAction: async () => undefined,
    formOptions: CREATIVE_FORM_OPTIONS,
    peopleOptions: CREATIVE_PEOPLE_OPTIONS,
    creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
    block: null,
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
    ...over,
  });
  const entrancesProps = (over: Partial<StudioEntrancesProps> = {}): StudioEntrancesProps => ({
    findConceptAction: async () => IDLE_ACTION_STATE,
    selectConceptAction: async () => undefined,
    startOwnIdeaAction: async () => undefined,
    conceptReady: true,
    formOptions: CREATIVE_FORM_OPTIONS,
    peopleOptions: CREATIVE_PEOPLE_OPTIONS,
    creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
    ownIdeaMax: OWN_IDEA_MAX,
    reference: { status: "available", href: "/trends" },
    findConceptOffer: { id: "ideation", label: "Ideas", status: "available", cost: 3 },
    block: null,
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
    ...over,
  });
  /** Every form control has a label naming it (keyboard and screen-reader reach). */
  const unlabelled = (html: string): string[] => {
    const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    const labelled = new Set([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
    const missing = ids.filter((id) => !labelled.has(id));
    // Radios carry no id: each must sit INSIDE a <label>.
    const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
    const radiosInLabels = html.match(/<label[^>]*>\s*<input type="radio"/g) ?? [];
    if (radios.length !== radiosInLabels.length) missing.push(`${radios.length - radiosInLabels.length} unlabelled radio(s)`);
    return missing;
  };

  it("FREE (E-25(iv)): the confirmation states the configured price AND the named plan block — and offers no paid press", () => {
    const html = renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(false))} />);
    expect(html).toContain(`data-operation-id="${OP_ID}"`);
    expect(html).toContain('data-testid="studio-piece-plan-block"');
    expect(decoded(html)).toContain(PIECE_PLAN_BLOCK);
    expect(decoded(html)).toContain("Writing this script costs 3 credits — the configured price (config version 4).");
    expect(html).not.toContain('data-testid="studio-piece-commission"');
    expect(html).not.toContain('data-testid="studio-piece-new-generation"');
    // Backing out is still offered, and costs nothing.
    expect(html).toContain('data-testid="studio-piece-cancel"');
  });

  it("PAID: the confirmation's paid press carries the SERVER-MINTED operation id, defaults to the concept's own form, and every control is labelled", () => {
    const html = renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(true))} />);
    expect(html).toContain('data-testid="studio-piece-commission"');
    expect(html).toContain(`<input type="hidden" name="operationId" value="${OP_ID}"/>`);
    expect(html).not.toContain('data-testid="studio-piece-plan-block"');
    expect(html).toContain('data-testid="studio-piece-new-generation"');
    expect(html).toMatch(/value="explain_opinion"[^>]*checked=""|checked=""[^>]*value="explain_opinion"/);
    expect(unlabelled(html)).toEqual([]);
    // An unreadable price is stated as unreadable, never invented.
    const unpriced = decoded(renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(true, null))} />));
    expect(unpriced).toContain("could not be read right now");
  });

  it("a BLOCKED workspace (viewer, paused, no brain) gets the reason and no paid press, no New generation", () => {
    const html = renderToStaticMarkup(
      <PieceConfirmation {...pieceProps(conceptPiece(true), { block: { reason: "This workspace is paused." } })} />
    );
    expect(html).toContain('data-testid="studio-piece-blocked"');
    expect(html).not.toContain('data-testid="studio-piece-commission"');
    expect(html).not.toContain('data-testid="studio-piece-new-generation"');
  });

  it("the ENTRANCES: find (with the one question when the brain cannot say what they make), develop (bounded), and the reference breakdown offered or visibly withheld", () => {
    const ready = renderToStaticMarkup(<StudioEntrances {...entrancesProps()} />);
    for (const id of ["studio-entrance-find", "studio-entrance-develop", "studio-entrance-reference"]) {
      expect(ready).toContain(`data-testid="${id}"`);
    }
    expect(decoded(ready)).toContain(FIND_CONCEPT_HINT_LABEL);
    expect(ready).not.toMatch(/id="studio-find-hint"[^>]*required=""/);
    expect(ready).toContain(`maxLength="${OWN_IDEA_MAX}"`);
    expect(ready).toContain('href="/trends"');
    expect(unlabelled(ready)).toEqual([]);
    const notReady = renderToStaticMarkup(<StudioEntrances {...entrancesProps({ conceptReady: false })} />);
    expect(decoded(notReady)).toContain(FIND_CONCEPT_QUESTION);
    expect(notReady).toMatch(/id="studio-find-hint"[^>]*required=""/);
    const free = renderToStaticMarkup(<StudioEntrances {...entrancesProps({ reference: { status: "not_in_plan" } })} />);
    expect(free).toContain('data-testid="studio-entrance-reference-blocked"');
    expect(free).not.toContain('href="/trends"');
  });

  it("a v2 CONCEPT BATCH in the entrance renders through GenerationOutcome — the L1 blocks OUTSIDE any fold — with one zero-cost choice per concept naming its attempt and position", () => {
    const output = {
      contractVersion: 2,
      requestedForm: "auto",
      ideas: [0, 1, 2].map((i) => ({
        hook: `hook ${["one", "two", "three"][i]}`,
        thesis: "a thesis that asserts something",
        form: "explain_opinion",
        framework: "the mirror",
        frameworkProvenance: "offered",
        premise: { whatHappens: "you argue it to camera", interest: "most get it backwards", payoff: "they know what to check", basis: { kind: "none" } },
        filming: { location: "kitchen", equipment: ["phone"], people: "solo", minutes: 20 },
      })),
      whyThisPerforms: { reasoning: "R", weakestPoint: "the opening has not been tried on this audience" },
      disclosure: { platform: "TikTok", guidance: "G" },
      serverChecks: {
        filming: [0, 1, 2].map((i) => ({ at: `/ideas/${i}`, location: true, equipment: [0] })),
        shotMap: [],
      },
    };
    const killTest = {
      outcome: "passed", attempts: 1, rewritten: false, creatorRulesScored: false, creatorRuleVerdicts: [],
      traceabilityLimitNote: "LIMIT", firstAttempt: { hardRules: [], traceability: [], claims: [] },
      finalAttempt: { hardRules: [], traceability: [], claims: [] }, refusal: null,
    };
    const result = {
      attemptId: "ideas-attempt-1", replayed: false,
      generation: { id: "gen-ideas", mode: "ideation", outcome: "usable", weakestPoint: "W", refusalReason: null, promptBundleVersion: "b", rewriteCount: 0, parentId: null },
      creditsChargedNow: 3, balanceAfter: 20, configVersion: 1, resolvedTier: "free", frameworkOffer: null,
      run: { status: "usable", drafts: 1, promptBundleVersion: "x", killTest, output },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const conceptState = studioActionStateFor(IDLE_ACTION_STATE, result, "Ideation", "");
    const html = renderToStaticMarkup(<StudioEntrances {...entrancesProps({ conceptState })} />);
    expect((html.match(/<details/g) ?? []).length).toBe(0);
    expect(html.match(/data-testid="studio-event-confirmation"/g) ?? []).toHaveLength(1);
    expect(html).toContain('data-testid="studio-filming-unconfirmed"');
    expect(html.match(/data-testid="studio-choose-concept"/g) ?? []).toHaveLength(3);
    expect(html.match(/name="sourceAttemptId" value="ideas-attempt-1"/g) ?? []).toHaveLength(3);
    for (const i of [0, 1, 2]) expect(html).toContain(`name="ideaIndex" value="${i}"`);
    expect(decoded(html)).toContain(CHOOSE_CONCEPT_HELP);
    // ...and the same v2 state in the PANEL keeps both blocks outside its one fold.
    const panel = renderToStaticMarkup(<StudioPanel {...baseView.run!} initialState={conceptState} />);
    const folded = (panel.match(/<details[\s\S]*?<\/details>/g) ?? []).join("");
    expect(panel).toContain('data-testid="studio-event-confirmation"');
    expect(panel).toContain('data-testid="studio-filming-unconfirmed"');
    expect(folded).not.toContain("studio-event-confirmation");
    expect(folded).not.toContain("studio-filming-unconfirmed");
    // HONESTY: the new states claim nothing this product cannot support.
    for (const state of [
      html,
      renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(false))} />),
      renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(true))} />),
      renderToStaticMarkup(<StudioEntrances {...entrancesProps({ conceptReady: false, reference: { status: "not_in_plan" } })} />),
      renderToStaticMarkup(<StudioEntrances {...entrancesProps({ reference: { status: "unknown", href: "/trends" } })} />),
    ]) {
      expect(claimHits(visibleCopy(state).toLowerCase(), FORBIDDEN_L2)).toEqual([]);
    }
  });

  it("the VIEW puts the confirmation first and keeps the entrances and the other modes reachable", () => {
    const html = renderView({
      piece: pieceProps(conceptPiece(true)),
      entrances: entrancesProps(),
    });
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    expect(at("studio-piece-confirmation")).toBeGreaterThan(-1);
    expect(at("studio-piece-confirmation")).toBeLessThan(at("studio-entrances"));
    expect(at("studio-entrances")).toBeLessThan(at("studio-generate"));
    expect(decoded(html)).toContain(OTHER_MODES_HEADING);
  });
  // ------------------------------------------------ L2 CODE GATE (2026-10-04)

  /** A usable v2 concept batch, as `findConceptAction` returns it. */
  const usableConceptState = () => {
    const output = {
      contractVersion: 2,
      requestedForm: "auto",
      ideas: [0, 1, 2].map((i) => ({
        hook: `hook ${i}`,
        thesis: "a thesis that asserts something",
        form: "explain_opinion",
        framework: "the mirror",
        frameworkProvenance: "offered",
        premise: { whatHappens: "w", interest: "i", payoff: "p", basis: { kind: "none" } },
        filming: { location: "kitchen", equipment: ["phone"], people: "solo", minutes: 20 },
      })),
      whyThisPerforms: { reasoning: "R", weakestPoint: "the opening has not been tried on this audience" },
      disclosure: { platform: "TikTok", guidance: "G" },
      serverChecks: { filming: [0, 1, 2].map((i) => ({ at: `/ideas/${i}`, location: true, equipment: [0] })), shotMap: [] },
    };
    const killTest = {
      outcome: "passed", attempts: 1, rewritten: false, creatorRulesScored: false, creatorRuleVerdicts: [],
      traceabilityLimitNote: "LIMIT", firstAttempt: { hardRules: [], traceability: [], claims: [] },
      finalAttempt: { hardRules: [], traceability: [], claims: [] }, refusal: null,
    };
    const result = {
      attemptId: "ideas-attempt-1", replayed: false,
      generation: { id: "gen-ideas", mode: "ideation", outcome: "usable", weakestPoint: "W", refusalReason: null, promptBundleVersion: "b", rewriteCount: 0, parentId: null },
      creditsChargedNow: 3, balanceAfter: 20, configVersion: 1, resolvedTier: "free", frameworkOffer: null,
      run: { status: "usable", drafts: 1, promptBundleVersion: "x", killTest, output },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return studioActionStateFor(IDLE_ACTION_STATE, result, "Ideation", "");
  };
  const statusText = (html: string, testId: string): string => {
    const m = html.match(new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`));
    return m ? decoded(m[1]) : "";
  };

  it("A-N3: the confirmation is KEYED by piece id and version, so ?piece=A -> ?piece=B (or New generation) is a fresh mount", () => {
    const piece = pieceProps(conceptPiece(true));
    const tree = StudioView({ ...baseView, piece, entrances: entrancesProps() }) as React.ReactElement<{ children: React.ReactNode[] }>;
    const found: React.ReactElement[] = [];
    const walk = (node: React.ReactNode): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object" && "type" in node) {
        const el = node as React.ReactElement<{ children?: React.ReactNode }>;
        if (el.type === PieceConfirmation) found.push(el);
        walk(el.props.children);
      }
    };
    walk(tree);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe(pieceKey(piece.piece));
    expect(pieceKey({ pieceId: "a", version: 1 })).not.toBe(pieceKey({ pieceId: "b", version: 1 }));
    expect(pieceKey({ pieceId: "a", version: 1 })).not.toBe(pieceKey({ pieceId: "a", version: 2 }));
  });

  it("C-1: the confirmation heading is focusable by script (tabindex -1); a cancel lands on a focusable status line", () => {
    const html = renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(true))} />);
    expect(html).toMatch(/<h2 id="studio-piece-heading" tabindex="-1"/);
    const cancelled = renderView({ pieceCancelled: true, entrances: entrancesProps() });
    expect(cancelled).toMatch(/<p tabindex="-1" role="status" data-testid="studio-piece-cancelled">/);
    expect(decoded(cancelled)).toContain(PIECE_CANCELLED_STATUS);
    expect(renderView({ entrances: entrancesProps() })).not.toContain("studio-piece-cancelled");
  });

  it("C-2: every cost statement is tied to the control it prices by aria-describedby", () => {
    const piece = renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(true))} />);
    expect(piece).toMatch(/<p id="studio-piece-quote"/);
    expect(piece).toMatch(/aria-describedby="studio-piece-quote studio-piece-operation-note"[^>]*>Write the script/);
    expect(piece).toMatch(/aria-describedby="studio-piece-new-generation-help"/);
    expect(piece).toContain('id="studio-piece-new-generation-help"');
    expect(piece).toMatch(/aria-describedby="studio-piece-cancel-help"/);
    expect(piece).toContain('id="studio-piece-cancel-help"');
    const entrances = renderToStaticMarkup(<StudioEntrances {...entrancesProps({ conceptState: usableConceptState() })} />);
    expect(entrances).toMatch(/aria-describedby="studio-find-cost"/);
    expect(entrances).toContain('id="studio-find-cost"');
    expect(decoded(entrances)).toContain("Finding concepts costs 3 credits — the configured price.");
    expect(entrances.match(/aria-describedby="studio-choose-help"/g) ?? []).toHaveLength(3);
    expect(entrances).toContain('id="studio-choose-help"');
    expect(entrances).toMatch(/aria-describedby="studio-develop-help"/);
    expect(entrances).toContain('id="studio-develop-help"');
  });

  it("C-3: a concept_context_needed refusal marks the hint box invalid and points it at the refusal; no other state does", () => {
    const refused = renderToStaticMarkup(
      <StudioEntrances {...entrancesProps({ conceptState: { lineage: [], latest: { status: "refused", code: "concept_context_needed" } } })} />
    );
    expect(refused).toMatch(/<textarea[^>]*id="studio-find-hint"[^>]*aria-invalid="true"[^>]*aria-describedby="studio-find-refusal"/);
    expect(refused).toMatch(/id="studio-find-refusal"[^>]*data-testid="studio-refusal"|data-testid="studio-refusal"[^>]*id="studio-find-refusal"|role="alert" id="studio-find-refusal"/);
    const other = renderToStaticMarkup(
      <StudioEntrances {...entrancesProps({ conceptState: { lineage: [], latest: { status: "refused", code: "insufficient_credits" } } })} />
    );
    expect(other).not.toContain("aria-invalid");
    expect(renderToStaticMarkup(<StudioEntrances {...entrancesProps()} />)).not.toContain("aria-invalid");
  });

  it("C-4: success is announced in the polite status region — concepts, and the piece's script", () => {
    expect(statusText(renderToStaticMarkup(<StudioEntrances {...entrancesProps()} />), "studio-find-status")).toBe("");
    expect(statusText(renderToStaticMarkup(<StudioEntrances {...entrancesProps({ conceptState: usableConceptState() })} />), "studio-find-status")).toBe(FIND_CONCEPT_DONE_STATUS);
    expect(statusText(renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(true))} />), "studio-piece-status")).toBe("");
    expect(
      statusText(renderToStaticMarkup(<PieceConfirmation {...pieceProps(conceptPiece(true), { commissionState: usableConceptState() })} />), "studio-piece-status")
    ).toBe(PIECE_SCRIPT_DONE_STATUS);
  });

  it("A-3: an UNKNOWN reference plan renders neutral copy with the trends link — never the plan block", () => {
    const html = renderToStaticMarkup(<StudioEntrances {...entrancesProps({ reference: { status: "unknown", href: "/trends" } })} />);
    expect(html).toContain('data-testid="studio-entrance-reference-unknown"');
    expect(decoded(html)).toContain(REFERENCE_ENTRANCE_UNKNOWN);
    expect(html).toContain('href="/trends"');
    expect(decoded(html)).not.toContain(REFERENCE_ENTRANCE_BLOCKED);
  });

  it("A-2 and the operation note: the copy states what is checked and what holds — no certainty claim, no fixed count, no replay promise", () => {
    expect(FIND_CONCEPT_HELP).not.toMatch(/nothing is invented/i);
    expect(FIND_CONCEPT_HELP).not.toMatch(/\bthree\b|\b3\b/i);
    expect(FIND_CONCEPT_HELP).toContain("not of whether it is true");
    expect(PIECE_OPERATION_NOTE).not.toMatch(/returns this same script/i);
    expect(PIECE_OPERATION_NOTE).toContain("does not charge you twice");
  });
});

// ------------------------------------------- launch L3 (R-152): the two controls

describe("launch L3: the sequel request and \"Remember this for future drafts\"", () => {
  beforeEach(() => {
    actionMocks.requireUser.mockResolvedValue({ id: "user-1", email: "anna@example.test", name: "Anna" });
    actionMocks.scopeForUser.mockResolvedValue({ workspaceId: "workspace-1", role: "owner" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const MODES_L3: ModeChoiceView[] = [
    { id: "m-g", label: "Ideation", status: "available", cost: 4, takesCreativeForm: true },
    { id: "m-e", label: "Hooks", status: "available", cost: 5, takesCreativeForm: false },
  ];
  const panel = (modes: ModeChoiceView[]) =>
    renderToStaticMarkup(<StudioPanel {...baseView.run!} modes={modes} />);

  it("the sequel box is offered beside a history-reading mode ONLY, and is never pre-ticked", () => {
    const withHistory = panel(MODES_L3);
    expect(withHistory).toContain('data-testid="studio-sequel"');
    expect(withHistory).toContain(SEQUEL_LABEL);
    const box = withHistory.slice(withHistory.indexOf('name="sequel"') - 200, withHistory.indexOf('name="sequel"') + 200);
    expect(box).not.toMatch(/checked/);
    const withoutHistory = panel([MODES_L3[1]]);
    expect(withoutHistory).not.toContain('name="sequel"');
  });

  it("THE SEQUEL REACHES THE REQUEST only as the box's own value — anything else, and silence, is not a sequel", async () => {
    const generateSpy = vi
      .spyOn(respinCredits, "generate")
      .mockRejectedValue(new CreativeRequestError("unknown_form"));
    const send = async (sequel: string | null) => {
      const fd = new FormData();
      fd.set("mode", "m-g");
      fd.set("input", "a part two of last week");
      fd.set("platform", "TikTok");
      fd.set("revisionOf", "");
      if (sequel !== null) fd.set("sequel", sequel);
      await generateAction("profile-1", IDLE_ACTION_STATE, fd);
      return generateSpy.mock.calls.at(-1)![2];
    };
    expect((await send("1")).sequel).toBe(true);
    // The input says "part two"; nothing is inferred from it.
    expect("sequel" in (await send(null))).toBe(false);
    expect("sequel" in (await send("yes"))).toBe(false);
    expect("sequel" in (await send("true"))).toBe(false);
  });

  const remember = (state: RememberState, canPropose = true) =>
    decoded(
      renderToStaticMarkup(
        <RememberBlock
          canPropose={canPropose}
          brainHref="/brain"
          valueMax={BRAIN_EDIT_VALUE_MAX}
          formAction={() => {}}
          pending={false}
          state={state}
          refusalCopy={REFUSAL_COPY}
          fallbackCopy={REFUSAL_COPY.unknown}
        />
      )
    );

  it("REMEMBER says it PROPOSES and applies nothing, and a proposal names its version and the Brain page", () => {
    const idle = remember({ status: "idle" });
    expect(idle).toContain('data-testid="studio-remember"');
    expect(idle).toContain('name="preference"');
    expect(idle).toContain(`maxLength="${BRAIN_EDIT_VALUE_MAX}"`);
    expect(idle).toMatch(/proposed change/i);
    expect(idle).toMatch(/Nothing uses it until you confirm and activate/i);
    // NOT pre-filled from the reaction or its note (R11): the box is empty.
    expect(idle).toMatch(/<textarea[^>]*name="preference"[^>]*><\/textarea>/);
    const proposed = remember({ status: "proposed", version: 4 });
    expect(proposed).toContain(rememberProposedSentence(4));
    expect(proposed).toMatch(/It is not in force yet/);
    expect(proposed).toContain('href="/brain"');
    const refused = remember({ status: "refused", code: "profile_role", text: "", attempt: 1 });
    expect(refused).toContain('data-testid="studio-remember-refused"');
    expect(refused).toContain(REFUSAL_COPY.profile_role.title);
  });

  /** The persistent status region's inner markup. */
  const rememberStatus = (html: string) => {
    const start = html.indexOf('data-testid="studio-remember-status"');
    expect(start, "the persistent region is missing").toBeGreaterThan(-1);
    return html.slice(start, html.indexOf("</p>", start));
  };
  /** The textarea's opening tag and its content. */
  const rememberBox = (html: string) => {
    const start = html.indexOf("<textarea");
    return html.slice(start, html.indexOf("</textarea>", start));
  };

  it("D-L1: a proposal and an already-held answer render INSIDE the one persistent status region", () => {
    for (const state of [
      { status: "idle" },
      { status: "proposed", version: 4 },
      { status: "already_held", version: 4, active: true },
    ] as RememberState[]) {
      expect(remember(state).match(/role="status"/g), state.status).toHaveLength(1);
    }
    expect(rememberStatus(remember({ status: "idle" }))).not.toContain("Kill Test");
    const proposed = rememberStatus(remember({ status: "proposed", version: 4 }));
    expect(proposed).toContain('data-testid="studio-remember-proposed"');
    expect(proposed).toContain(rememberProposedSentence(4));
    expect(proposed).toContain('href="/brain"');
  });

  it("D-L2: the box's limit is stated in the help text the box is described by — the db's own number", () => {
    const html = remember({ status: "idle" });
    const helpStart = html.indexOf('id="studio-remember-help"');
    const help = html.slice(helpStart, html.indexOf("</p>", helpStart));
    expect(help).toContain(rememberLimitSentence(BRAIN_EDIT_VALUE_MAX));
    expect(help).toContain(String(BRAIN_EDIT_VALUE_MAX));
    expect(rememberBox(html)).toContain('aria-describedby="studio-remember-help"');
  });

  it("D-L3: a refused press hands the typed rule back into the box, and a refusal ABOUT the text is tied to the box", () => {
    const typed = "every shot is filmed by me alone";
    const aboutText = remember({ status: "refused", code: "brain_edit_limit", text: typed, attempt: 1 });
    const box = rememberBox(aboutText);
    expect(box).toContain(typed);
    expect(box).toContain('aria-invalid="true"');
    expect(box).toContain('aria-describedby="studio-remember-help studio-remember-refused"');
    expect(aboutText).toMatch(/role="alert" id="studio-remember-refused"/);
    // A refusal that is NOT about the words still gives them back, and leaves
    // the box valid.
    const notAboutText = rememberBox(
      remember({ status: "refused", code: "brain_edit_busy", text: typed, attempt: 2 })
    );
    expect(notAboutText).toContain(typed);
    expect(notAboutText).not.toContain("aria-invalid");
    expect(notAboutText).toContain('aria-describedby="studio-remember-help"');
    // Idle and after a proposal the box is EMPTY — never pre-filled from
    // anything but this box's own refused text (R11).
    for (const state of [{ status: "idle" }, { status: "proposed", version: 2 }] as RememberState[]) {
      expect(remember(state)).toMatch(/<textarea[^>]*name="preference"[^>]*><\/textarea>/);
    }
    // EVERY text-concerning code is one the remember press can return.
    for (const code of REMEMBER_TEXT_REFUSAL_CODES) {
      expect((STUDIO_ERROR_CODES as readonly string[]).includes(code), code).toBe(true);
    }
  });

  it("D-L3: the action echoes the text on a refusal — clamped to the box's ceiling — and counts consecutive refusals so the form remounts", async () => {
    vi.spyOn(respinDb, "rememberForFutureDrafts").mockRejectedValue(new BrainEditUnchangedError());
    const fd = new FormData();
    fd.set("preference", "[check]");
    const first = await rememberForFutureDraftsAction("profile-1", { status: "idle" }, fd);
    expect(first).toEqual({ status: "refused", code: "brain_edit_unchanged", text: "[check]", attempt: 1 });
    const second = await rememberForFutureDraftsAction("profile-1", first, fd);
    expect(second).toMatchObject({ status: "refused", attempt: 2 });
    const huge = new FormData();
    huge.set("preference", "x".repeat(BRAIN_EDIT_VALUE_MAX + 50));
    const clamped = await rememberForFutureDraftsAction("profile-1", { status: "idle" }, huge);
    expect(clamped.status === "refused" && [...clamped.text].length).toBe(BRAIN_EDIT_VALUE_MAX);
    // ...and the panel keys the form on that count (static markup cannot run
    // a reset, so the key is pinned in the source).
    const src = read("app/(product)/studio/feedback-block.tsx");
    expect(src).toMatch(/key=\{refused === null \? "remember" : `remember-refused-\$\{refused\.attempt\}`\}/);
  });

  it("C-L1: a press whose rule the editable version already holds writes nothing and SAYS so — active or proposed", async () => {
    vi.spyOn(respinDb, "rememberForFutureDrafts").mockResolvedValue({
      doc: { id: "d", version: 5, status: "active" } as never,
      pointer: "/rules/0",
      written: false,
    });
    const fd = new FormData();
    fd.set("preference", "it must not sound like an advert");
    const state = await rememberForFutureDraftsAction("profile-1", { status: "idle" }, fd);
    expect(state).toEqual({ status: "already_held", version: 5, active: true });
    const active = rememberStatus(remember({ status: "already_held", version: 5, active: true }));
    expect(active).toContain(rememberAlreadyHeldSentence(5, true));
    expect(active).toMatch(/Nothing new was saved/);
    expect(active).not.toMatch(/not in force/);
    const proposed = rememberStatus(remember({ status: "already_held", version: 6, active: false }));
    expect(proposed).toContain(rememberAlreadyHeldSentence(6, false));
    expect(proposed).toMatch(/not in force yet/);
  });

  it("T-L3: an editor or a viewer is told the box is the owner's, and offered no press", () => {
    const html = remember({ status: "idle" }, false);
    expect(html).toContain('data-testid="studio-remember-owner-only"');
    expect(html).toContain(REMEMBER_OWNER_ONLY);
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="preference"');
    // ...through the PANEL, from the page's resolved role.
    const panelFor = (rememberAllowed: boolean) =>
      renderToStaticMarkup(
        <StudioPanel
          {...baseView.run!}
          rememberAllowed={rememberAllowed}
          initialState={{ lineage: [], latest: HONEST_REFUSAL }}
        />
      );
    const owner = panelFor(true);
    const editor = panelFor(false);
    expect(owner).toContain('name="preference"');
    expect(editor).not.toContain('name="preference"');
    expect(editor).toContain('data-testid="studio-remember-owner-only"');
    expect(read("app/(product)/studio/page.tsx")).toMatch(/rememberAllowed: scope\.role === "owner"/);
  });

  it("every remember refusal code has Studio copy, and the two re-worded ones say what happened HERE", () => {
    for (const code of [
      "brain_edit_unchanged", "brain_edit_busy", "brain_edit_limit", "brain-edit-all-check",
      "provenance", "evidence_unreadable", "profile_role", "reference_echo",
      "brain_version_limit", "brain_document_limit", "onboarding_input_limit",
    ]) {
      expect((STUDIO_ERROR_CODES as readonly string[]).includes(code), code).toBe(true);
      expect(REFUSAL_COPY[code as keyof typeof REFUSAL_COPY], code).toBeDefined();
    }
    expect(REFUSAL_COPY.provenance.detail).not.toMatch(/build again/i);
    expect(REFUSAL_COPY.brain_edit_unchanged.title).toMatch(/nothing to remember/i);
  });

  it("no L3 sentence claims learning, training, improvement or a guarantee", () => {
    const surfaces = [
      SEQUEL_LABEL,
      SEQUEL_HELP,
      REMEMBER_HEADING,
      REMEMBER_HELP,
      REMEMBER_LABEL,
      rememberProposedSentence(2),
      visibleCopy(remember({ status: "idle" })),
      visibleCopy(remember({ status: "proposed", version: 2 })),
      visibleCopy(remember({ status: "idle" }, false)),
      rememberAlreadyHeldSentence(2, true),
      rememberAlreadyHeldSentence(2, false),
      rememberLimitSentence(BRAIN_EDIT_VALUE_MAX),
      REMEMBER_OWNER_ONLY,
      REFUSAL_COPY.provenance.detail,
      REFUSAL_COPY.brain_edit_unchanged.detail,
    ];
    for (const surface of surfaces) {
      expect(claimHits(surface, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), surface.slice(0, 80)).toEqual([]);
    }
  });

  it("the remember action hands the box's words to the db facade and returns the PROPOSED version, never the text", async () => {
    const spy = vi
      .spyOn(respinDb, "rememberForFutureDrafts")
      .mockResolvedValue({ doc: { id: "d", version: 3 } as never, pointer: "/rules/2", written: true });
    const fd = new FormData();
    fd.set("preference", "every shot is filmed by me alone");
    const state = await rememberForFutureDraftsAction("profile-1", { status: "idle" }, fd);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toEqual({ text: "every shot is filmed by me alone" });
    expect(state).toEqual({ status: "proposed", version: 3 });
    expect(JSON.stringify(state)).not.toContain("filmed");
  });
});

// ------------------------------------------------------------------------
// LAUNCH L4 (R-153): THE SAVED RECORDING PACK — the page, the copied script,
// the Markdown export, the two presses, the link from a finished draft, and
// the L3 card's BN-2 (the sequel box on "Find concepts" and the piece form).

describe("launch L4 (R-153): the saved recording pack", () => {
  const L4_PIECE: PieceConfirmationProps = {
    piece: {
      pieceId: "11111111-2222-4333-8444-555555555555",
      version: 1,
      state: "selected",
      operationAttemptId: "0f6d7c2e-3a1b-4c5d-8e9f-0a1b2c3d4e5f",
      origin: { kind: "own_idea", idea: "my own idea" },
      quote: { credits: 3, configVersion: 4, planIncludesScript: true },
    },
    commissionAction: async () => IDLE_ACTION_STATE,
    newGenerationAction: async () => undefined,
    cancelAction: async () => undefined,
    formOptions: CREATIVE_FORM_OPTIONS,
    peopleOptions: CREATIVE_PEOPLE_OPTIONS,
    creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
    block: null,
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
  };
  const L4_ENTRANCES: StudioEntrancesProps = {
    findConceptAction: async () => IDLE_ACTION_STATE,
    selectConceptAction: async () => undefined,
    startOwnIdeaAction: async () => undefined,
    conceptReady: true,
    formOptions: CREATIVE_FORM_OPTIONS,
    peopleOptions: CREATIVE_PEOPLE_OPTIONS,
    creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
    ownIdeaMax: OWN_IDEA_MAX,
    reference: { status: "available", href: "/trends" },
    findConceptOffer: { id: "ideation", label: "Ideas", status: "available", cost: 3 },
    block: null,
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
  };
  const USABLE_STATE_FOR_L4: StudioRunState = USABLE;

  const PRODUCT_GUIDANCE =
    "Before you post, check the platform's current rules on disclosing AI assistance and any paid partnership, and use the platform's own label where one applies. This product does not decide what those rules require.";

  /** A stored v2 script as the facade's read returns it — already parsed, model disclosure replaced. */
  function savedView(over: Partial<SavedGenerationView> = {}): SavedGenerationView {
    const output = {
      contractVersion: 2,
      requestedForm: "explain_opinion",
      form: "explain_opinion",
      thesis: { statement: "you lose more takes to a setting you never checked", why: "a reshoot traces back to one dial" },
      framework: { name: "the evidence tutorial", why: "the cost is the reshoot", provenance: "offered" },
      hooks: [{ text: "you are shooting three takes when one would do", mechanic: "contradiction" }],
      beats: [
        { atSeconds: 0, vo: "most people change the lens before they check one dial", isTurn: false },
        { atSeconds: 6, vo: "here is the dial nobody checks", isTurn: true, pivot: "turn" },
        { atSeconds: 14, vo: "show the shot again with the dial set ![x](https://evil.test/p.png) <img src=x>", isTurn: false },
      ],
      shotMap: [{ beatIndex: 1, shot: "close on the dial with a gimbal", note: "hold it long enough to read" }],
      onScreenText: [{ atSeconds: 7, text: "the dial nobody checks" }],
      caption: { text: "the reshoot nobody sees", hashtags: ["filmmaking"] },
      premise: {
        whatHappens: "you change the lens again and again",
        interest: "everyone has kept going on a shoot they should have stopped",
        payoff: "the take worth keeping comes after checking the dial",
        basis: { kind: "none" },
      },
      filming: { location: "kitchen", equipment: ["phone", "gimbal"], people: "solo", minutes: 20 },
      serverChecks: {
        filming: [{ at: "", location: true, equipment: [1] }],
        shotMap: [{ index: 0, shot: true, note: false }],
      },
      whyThisPerforms: { reasoning: "it opens on a cost the viewer already paid", weakestPoint: "nothing here rests on a result you logged" },
      disclosure: { platform: "TikTok", guidance: PRODUCT_GUIDANCE },
    } as unknown as NonNullable<SavedGenerationView["output"]>;
    return {
      attemptId: "att-rev-1",
      generationId: "gen-rev-1",
      modeId: "ideaToScript",
      modeLabel: "Idea to script",
      createdAt: "2026-10-04T14:03:00.000Z",
      platform: "TikTok",
      outcome: "usable",
      output,
      weakestPoint: "nothing here rests on a result you logged",
      killTest: {
        outcome: "passed",
        attempts: 1,
        rewritten: false,
        creatorRulesScored: true,
        creatorRuleVerdicts: [{ ruleId: "/rules/0", passed: false, ruleText: "it must not sound like an advert" }],
        traceabilityLimitNote: "LIMIT NOTE",
        finalAttempt: {
          traceability: [{ kind: "proper_noun", enforcement: "flag", token: "Lagos", field: "/hooks/0/text", unit: "I filmed in Lagos." }],
          claims: [],
          hardRules: [],
        },
        disclosureHardRulesWithheld: false,
        refusal: null,
      },
      disclosure: { kind: "policy_check_required" },
      disclosureGuidance: PRODUCT_GUIDANCE,
      lineage: {
        parent: { attemptId: "att-v1", modeLabel: "Idea to script" },
        source: { attemptId: "att-ideas", ideaIndex: 1 },
      },
      piece: {
        pieceId: "piece-1",
        version: 3,
        state: "scripted",
        selectedAttemptId: "att-v1",
        isSelected: false,
        selectable: true,
        versions: [
          { attemptId: "att-v1", createdAt: "2026-10-04T13:00:00.000Z", outcome: "usable", isSelected: true, isThis: false, parentAttemptId: null },
          { attemptId: "att-rev-1", createdAt: "2026-10-04T14:03:00.000Z", outcome: "usable", isSelected: false, isThis: true, parentAttemptId: "att-v1" },
        ],
        versionsTruncated: false,
      },
      reference: null,
      revisions: [],
      revisionsTruncated: false,
      revision: { revisable: true, blocked: null, credits: 2, quoteConfigVersion: 7, inPlan: true },
      ...over,
    } as SavedGenerationView;
  }

  const noop = async () => {};
  const reviseNoop = async (): Promise<SavedReviseState> => ({ status: "idle" });
  function packProps(view: SavedGenerationView, over: Partial<SavedPackProps> = {}): SavedPackProps {
    const pack = savedPackFor(view);
    return {
      kind: "pack",
      pack,
      scriptText: scriptText(pack),
      markdown: recordingPackMarkdown(pack),
      fileName: packFileName(pack),
      selectAction: noop,
      reviseAction: reviseNoop,
      reviseOptions: SAVED_REVISION_OPTIONS,
      reviseCostSentence: reviseCostSentence(view.revision.credits, view.createdAt),
      reviseBlock: null,
      selectBlock: null,
      selectedStatus: false,
      error: null,
      refusalCopy: REFUSAL_COPY,
      fallbackCopy: REFUSAL_COPY.unknown,
      ...over,
    };
  }
  const renderSaved = (props: SavedViewProps) => decoded(renderToStaticMarkup(<SavedView {...props} />));

  it("renders SCRIPT, SHOOTING PLAN and CHECKS AND RATIONALE from the one stored version, with its lineage and selected-version state", () => {
    const html = renderSaved(packProps(savedView()));
    for (const id of ["saved-script", "saved-shooting-plan", "saved-checks", "saved-lineage", "saved-export", "saved-revise"]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    for (const heading of [SCRIPT_HEADING, SHOOTING_PLAN_HEADING, CHECKS_HEADING]) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    // Every beat, the turn in words, the on-screen text and the caption.
    expect(html).toContain("most people change the lens before they check one dial");
    expect(html).toContain(PIVOT_SENTENCES.turn);
    expect(html).toContain("the reshoot nobody sees");
    // The SHOT CHECKLIST is checkboxes over the stored shot map, the server's mark on it.
    expect(html).toMatch(/data-testid="saved-shot-checklist"[\s\S]*type="checkbox"/);
    expect(html).toContain("close on the dial with a gimbal [check]");
    // The filming plan lives in the shooting plan only, with the server's marks.
    expect(html.match(/data-testid="studio-filming"/g)).toHaveLength(1);
    expect(html).toContain("kitchen [check]");
    expect(html).toContain("gimbal [check]");
    expect(html).toContain(FILMING_UNCONFIRMED_NOTE);
    // The server-authored confirmation item and the weakest point.
    expect(html).toContain(EVENT_CONFIRMATION_ITEM);
    expect(html).toContain("nothing here rests on a result you logged");
    // Lineage: the parent and the source concept batch, both saved-pack links.
    expect(html).toContain(`href="${savedPackHref("att-v1")}"`);
    expect(html).toContain(`href="${savedPackHref("att-ideas")}"`);
    expect(html).toContain(sourceSentence(1));
    // Selected-version state: another version is selected; this one may be chosen.
    expect(html).toContain(PIECE_OTHER_SELECTED_SENTENCE);
    expect(html).toContain('data-testid="saved-select-form"');
    expect(html).toMatch(/<input type="hidden" name="version" value="3"\/>/);
    expect(html).toContain(USE_THIS_VERSION_HELP);
    expect(html).toMatch(/aria-current="page"/);
    // Reading costs nothing — and the page says so.
    expect(html).toContain(SAVED_READ_FREE);
  });

  it("NEVER renders raw model-authored policy advice: the disclosure is the product's guidance, and the 'any disclosure guidance' note is absent", () => {
    // The facade already replaced the model's section; a projection of a view
    // that somehow still carried model text would show it — so plant one in
    // the DTO and prove the SAVED renderer reads `disclosureGuidance` only.
    const planted = savedView();
    (planted.output as unknown as { disclosure: { guidance: string } }).disclosure.guidance = "PLANTED MODEL ADVICE zqxv";
    const html = renderSaved(packProps(planted));
    expect(html).toContain(PRODUCT_GUIDANCE);
    expect(html).not.toContain('data-testid="studio-disclosure-provenance"');
    const md = recordingPackMarkdown(savedPackFor(planted));
    expect(md).toContain(PRODUCT_GUIDANCE.replace(/'/g, "'"));
    expect(md).not.toContain("PLANTED MODEL ADVICE");
    expect(scriptText(savedPackFor(planted))).not.toContain("PLANTED MODEL ADVICE");
    expect(html).not.toContain("PLANTED MODEL ADVICE");
  });

  it("the MARKDOWN EXPORT and the COPIED SCRIPT carry the exact version, its open checks and the deterministic disclosure — and the export is injection-safe", () => {
    const pack = savedPackFor(savedView());
    const md = recordingPackMarkdown(pack);
    const text = scriptText(pack);
    for (const out of [md, text]) {
      expect(out).toContain("most people change the lens before they check one dial");
      expect(out).toContain("here is the dial nobody checks");
      expect(out).toContain(EVENT_CONFIRMATION_ITEM);
      expect(out).toContain(FILMING_UNCONFIRMED_NOTE);
      expect(out).toContain("Weakest point: nothing here rests on a result you logged");
      // A stored traceability flag and a failed creator rule are open checks.
      expect(out).toContain('"Lagos"');
      expect(out).toContain('This draft did not pass your rule "it must not sound like an advert".');
      expect(out).toContain(basisSentence({ kind: "none" }));
    }
    expect(text).toContain(`Disclosure: ${PRODUCT_GUIDANCE}`);
    expect(md).toContain("## Disclosure");
    expect(md).toContain("- [ ] Beat 2: close on the dial with a gimbal [check]");
    expect(md).toContain("kitchen [check]");
    // MARKDOWN INJECTION: model text cannot become an image, a link or HTML.
    expect(md).not.toContain("![x](https://evil.test/p.png)");
    expect(md).toContain("!\\[x]\\(https\\://evil.test/p.png)");
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).toContain("\\<img src=x\\>");
    // [check] stays literal, and the file name is the attempt id, made safe.
    expect(md).toContain("[check]");
    expect(packFileName({ ...pack, attemptId: "../../etc/passwd" })).toBe("respin-recording-pack-etcpasswd.md");
  });

  it("export is PURE: building it twice from one view is identical, and reads nothing but the view", () => {
    const pack = savedPackFor(savedView());
    const frozen = JSON.parse(JSON.stringify(pack)) as SavedPackView;
    expect(recordingPackMarkdown(pack)).toBe(recordingPackMarkdown(frozen));
    expect(scriptText(pack)).toBe(scriptText(frozen));
    expect(packChecks(pack)).toEqual(packChecks(frozen));
    // The module imports no facade, database or network: only copy, types and the pure projection's output.
    const src = read("app/(product)/studio/saved/recording-pack.ts");
    expect(src).not.toMatch(/@respin\/(credits|db|config|llm|modes)|fetch\(|"use server"/);
  });

  it("a LEGACY draft (no version) reads, copies and exports: no creative half, no shooting plan, the weakest point still named", () => {
    const legacyOutput = {
      hooks: [{ text: "H one", mechanic: "M one" }],
      whyThisPerforms: { reasoning: "R", weakestPoint: "W legacy" },
      disclosure: { platform: "TikTok", guidance: PRODUCT_GUIDANCE },
    } as unknown as NonNullable<SavedGenerationView["output"]>;
    const view = savedView({ output: legacyOutput, piece: null, modeId: "hooks", modeLabel: "Hooks", lineage: { parent: null, source: null } });
    const html = renderSaved(packProps(view));
    expect(html).toContain("H one");
    expect(html).toContain(NO_SHOOTING_PLAN);
    expect(html).toContain(NOT_A_PIECE_NOTE);
    expect(html).toContain(ORIGINAL_NOTE);
    expect(html).not.toContain('data-testid="studio-creative"');
    const md = recordingPackMarkdown(savedPackFor(view));
    expect(md).toContain("1. H one (mechanic: M one)");
    expect(md).toContain("Weakest point: W legacy");
    expect(md).not.toContain(EVENT_CONFIRMATION_ITEM);
  });

  it("UNREADABLE stored checks are SAID on the page and in the export — never an empty list", () => {
    const view = savedView({ killTest: null });
    const html = renderSaved(packProps(view));
    expect(html).toContain('data-testid="saved-checks-unreadable"');
    expect(html).toContain(CHECKS_UNREADABLE);
    expect(recordingPackMarkdown(savedPackFor(view))).toContain(CHECKS_UNREADABLE);
  });

  it("an HONEST REFUSAL version shows why and a sharper angle, offers no copy/export and no revision", () => {
    const view = savedView({
      outcome: "honest_refusal",
      output: null,
      weakestPoint: null,
      killTest: {
        ...savedView().killTest!,
        outcome: "failed",
        attempts: 2,
        finalAttempt: { traceability: [], claims: [], hardRules: [{ rule: "antithesis", field: "/hooks/0/text", excerpt: null, remedy: "say the thing" }] },
        refusal: { headline: "This one did not survive the kill test", sharperAngle: "Try the smaller claim" },
      },
      revision: { revisable: false, blocked: "honest_refusal", credits: 2, quoteConfigVersion: 7, inPlan: true },
    });
    const html = renderSaved(packProps(view, { reviseBlock: REVISE_REFUSED_ONLY, selectAction: null }));
    expect(html).toContain('data-testid="saved-refusal"');
    // The refused draft's sentence is not shown (billing verification): rule, field, remedy.
    expect(html).toContain("antithesis at /hooks/0/text: say the thing");
    expect(html).not.toContain("not x but y");
    expect(html).toContain("Try the smaller claim");
    expect(html).toContain(NOTHING_TO_EXPORT);
    expect(html).not.toContain('data-testid="saved-pack-actions"');
    expect(html).toContain(REVISE_REFUSED_ONLY);
  });

  it("the REVISE presses disclose the configured price and the parent BEFORE the press, and each points aria-describedby at that sentence", () => {
    const html = renderSaved(packProps(savedView()));
    expect(html).toContain(reviseCostSentence(2, "2026-10-04T14:03:00.000Z"));
    expect(reviseCostSentence(2, "2026-10-04T14:03:00.000Z")).toContain("A revision currently costs 2 credits");
    expect(reviseCostSentence(2, "2026-10-04T14:03:00.000Z")).toContain("2026-10-04 14:03 UTC");
    expect(reviseCostSentence(null, "2026-10-04T14:03:00.000Z")).toMatch(/could not be read/);
    for (const o of SAVED_REVISION_OPTIONS) {
      const tag = html.match(new RegExp(`<button[^>]*data-testid="saved-revise-${o.id}"[^>]*>`))?.[0] ?? "";
      expect(tag, o.id).toContain('type="submit"');
      expect(tag, o.id).toContain('name="preset"');
      expect(tag, o.id).toContain(`value="${o.id}"`);
      expect(tag, o.id).toContain('aria-describedby="saved-revise-cost"');
    }
    // 44px targets on every press of the pack.
    for (const testid of ["saved-copy-script", "saved-copy-pack", "saved-download-pack"]) {
      expect(html).toMatch(new RegExp(`data-testid="${testid}"|style="min-height:44px[^"]*"[^>]*data-testid="${testid}"`));
    }
    expect(html.match(/min-height:44px/g)!.length).toBeGreaterThanOrEqual(6);
    // A plan without the mode, a viewer and a pause each replace the presses with a reason.
    for (const block of [REVISE_PLAN_BLOCK, "You have viewer access"]) {
      const blocked = renderSaved(packProps(savedView(), { reviseBlock: block, selectAction: null, selectBlock: block }));
      expect(blocked).not.toContain('name="preset"');
      expect(blocked).toContain(block);
      expect(blocked).not.toContain('data-testid="saved-select-form"');
    }
  });

  it("WHICH PRESSES ARE OFFERED: a viewer and a pause block both writes; a plan without the mode and a refusal block only the revision; reading is never blocked", () => {
    const open = { blocked: null, credits: 2, inPlan: true, isViewer: false, paused: false } as const;
    expect(savedPressBlocks(open)).toEqual({ select: null, revise: null });
    expect(savedPressBlocks({ ...open, isViewer: true })).toEqual({ select: VIEWER_BLOCK, revise: VIEWER_BLOCK });
    expect(savedPressBlocks({ ...open, paused: true })).toEqual({ select: PAUSED_BLOCK, revise: PAUSED_BLOCK });
    expect(savedPressBlocks({ ...open, inPlan: false })).toEqual({ select: null, revise: REVISE_PLAN_BLOCK });
    // An unreadable plan offers the press: the server's own gate answers with copy.
    expect(savedPressBlocks({ ...open, inPlan: null })).toEqual({ select: null, revise: null });
    expect(savedPressBlocks({ ...open, blocked: "honest_refusal" })).toEqual({ select: null, revise: REVISE_REFUSED_ONLY });
    for (const block of [VIEWER_BLOCK, PAUSED_BLOCK, REVISE_PLAN_BLOCK]) {
      expect(block).toMatch(/read|Reading/);
    }
  });

  it("LOADING, RESULT AND ERROR states complete in PERSISTENT live regions; a refusal is an alert with its copy", () => {
    const html = renderSaved(packProps(savedView()));
    // Both status regions exist BEFORE anything happens, so an announcement is
    // a change inside a region the assistive tech already knows (L3 gate D-L1).
    expect(html).toMatch(/role="status" aria-live="polite" data-testid="saved-pack-status"/);
    expect(html).toMatch(/role="status" aria-live="polite" data-testid="saved-revise-status"/);
    // The fallback text area carries the whole Markdown, labelled.
    expect(html).toMatch(/<label for="saved-pack-text"[^>]*>The recording pack as Markdown<\/label>/);
    // The press result sentences, and the selection status after the redirect.
    expect(reviseDoneSentence({ outcome: "usable", creditsChargedNow: 2, balanceAfter: 8, freeClaimRefusal: false })).toBe("The new version is saved. It cost 2 credits. Your balance is 8.");
    expect(reviseDoneSentence({ outcome: "replayed", creditsChargedNow: 0, balanceAfter: 8, freeClaimRefusal: false })).toMatch(/already finished/);
    const selected = renderSaved(packProps(savedView(), { selectedStatus: true }));
    expect(selected).toMatch(/tabindex="-1" role="status" data-testid="saved-selected-status"/);
    expect(selected).toContain(SELECTED_STATUS);
    const errored = renderSaved(packProps(savedView(), { error: studioErrorFor("creative_piece_stale") }));
    expect(errored).toMatch(/role="alert" data-testid="saved-error"/);
    expect(errored).toContain(REFUSAL_COPY.creative_piece_stale.title);
    // Every revise refusal code the page can receive has copy on this screen.
    expect(REFUSAL_COPY.revision_preset.title).toMatch(/not one this page offers/);
  });

  it("MISSING, PENDING, NOT STORED and UNREADABLE are honest, non-spending STATES with their own words", () => {
    for (const copy of Object.values(SAVED_STATE_COPY)) {
      const html = renderSaved({ kind: "state", copy });
      expect(html).toContain('data-testid="saved-state-banner"');
      expect(html).toContain(copy.title);
      expect(html).toMatch(/Nothing was charged|never charges|not charged|none was charged|nothing was charged/i);
      expect(html).not.toContain('name="preset"');
    }
  });

  it("MOBILE AND DESKTOP read ONE projection: one grid whose columns collapse, no second tree, and the export carries what the page shows", () => {
    const view = savedView();
    const html = renderSaved(packProps(view));
    expect(html).toMatch(/data-testid="saved-columns" style="display:grid;grid-template-columns:repeat\(auto-fit, minmax\(min\(100%, 22rem\), 1fr\)\)/);
    expect(html.match(/data-testid="saved-script"/g)).toHaveLength(1);
    expect(html.match(/data-testid="saved-shot-checklist"/g)).toHaveLength(1);
    const pack = savedPackFor(view);
    for (const b of pack.document!.beats!) {
      expect(html).toContain(b.vo.split(" ![")[0]);
      expect(recordingPackMarkdown(pack)).toContain(b.vo.split(" ![")[0]);
    }
  });

  it("THE CLAIMS CANON holds over the page, the export and every saved-pack sentence", () => {
    const html = renderSaved(packProps(savedView()));
    const pack = savedPackFor(savedView());
    const sentences = [
      ...Object.values(SAVED_STATE_COPY).flatMap((c) => [c.title, c.detail]),
      reviseCostSentence(2, "2026-10-04T14:03:00.000Z"),
      reviseDoneSentence({ outcome: "usable", creditsChargedNow: 2, balanceAfter: 8, freeClaimRefusal: false }),
      REVISE_PLAN_BLOCK, REVISE_REFUSED_ONLY, NOT_A_PIECE_NOTE, SAVED_READ_FREE,
    ].join("\n");
    for (const text of [detailsText(html), recordingPackMarkdown(pack), scriptText(pack), sentences]) {
      expect(claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toEqual([]);
    }
  });

  it("a FINISHED DRAFT links to its saved pack — usable, replayed and refused alike — and the replay no longer sends the creator to the export", () => {
    const usable = decoded(renderOutcome({ ...USABLE_STATE_FOR_L4, attemptId: "att-9" }));
    expect(usable).toContain(`href="${savedPackHref("att-9")}"`);
    expect(usable).toContain(SAVED_PACK_LINK_LABEL);
    const replayed = decoded(renderOutcome({
      status: "replayed", generationId: "g", attemptId: "att-9", modeId: "hooks", modeLabel: "Hooks",
      outcome: "usable", weakestPoint: "W", refusalReason: null, balanceAfter: 3, freeClaimRefusal: false,
    }));
    expect(replayed).toContain(REPLAY_SAVED_NOTE);
    expect(replayed).toContain(`href="${savedPackHref("att-9")}"`);
    expect(replayed).not.toContain("your export carries the stored one");
    expect(savedPackHref("a/b?c")).toBe("/studio/saved/a%2Fb%3Fc");
    // THE PROJECTION carries the operation's own attempt id onto every finished
    // state — so the link is built from the server's value, never the browser's.
    const minimalKillTest = {
      outcome: "passed", attempts: 1, rewritten: false, creatorRulesScored: false,
      creatorRuleVerdicts: [], traceabilityLimitNote: "L", finalAttempt: { traceability: [], claims: [] },
    };
    const generation = { id: "g", mode: "hooks", outcome: "usable", weakestPoint: "W", refusalReason: null, parentId: null };
    const base = { attemptId: "att-proj", generation, creditsChargedNow: 1, balanceAfter: 2, frameworkOffer: null };
    const fresh = studioStateFor({
      ...base,
      replayed: false,
      run: { status: "usable", killTest: minimalKillTest, output: { hooks: [{ text: "H", mechanic: "M" }], whyThisPerforms: { reasoning: "R", weakestPoint: "W" }, disclosure: { platform: "P", guidance: "G" } } },
    } as never, "Hooks");
    const refusedRun = studioStateFor({
      ...base,
      replayed: false,
      run: { status: "refused", killTest: minimalKillTest, refusal: { headline: "h", why: [], sharperAngle: "s" } },
    } as never, "Hooks");
    const replay = studioStateFor({ ...base, replayed: true, run: null } as never, "Hooks");
    for (const s of [fresh, refusedRun, replay]) {
      expect(s.status === "usable" || s.status === "honest_refusal" || s.status === "replayed" ? s.attemptId : null, s.status).toBe("att-proj");
    }
  });

  it("the RECENT list on /studio links each saved draft, says when it cannot be read, and is absent with no profile", () => {
    const listed = decoded(renderView({ recentPacks: [{ attemptId: "att-1", modeLabel: "Hooks", createdAt: "2026-10-04T14:03:00.000Z", outcome: "usable", title: "the first hook" }] }));
    expect(listed).toContain(`href="${savedPackHref("att-1")}"`);
    expect(listed).toContain("the first hook");
    expect(listed).toContain("2026-10-04 14:03 UTC");
    expect(decoded(renderView({ recentPacks: null }))).toContain(RECENT_PACKS_UNAVAILABLE);
    expect(decoded(renderView({ recentPacks: [] }))).toContain(RECENT_PACKS_EMPTY);
    expect(decoded(renderView({ profileName: null, recentPacks: [] }))).not.toContain('data-testid="studio-recent-packs"');
  });

  it("'USE THIS VERSION' redirects back with a status, or with the refusal CODE — and decides nothing itself", async () => {
    actionMocks.requireUser.mockResolvedValue({ id: "user-1", email: "a@example.test", name: "A" });
    actionMocks.scopeForUser.mockResolvedValue({ workspaceId: "ws-1", role: "owner" });
    const target = async (run: () => Promise<unknown>) => {
      try {
        await run();
        return "no redirect";
      } catch (e) {
        const digest = (e as { digest?: string }).digest ?? "";
        if (!digest.startsWith("NEXT_REDIRECT")) throw e;
        return digest.split(";")[2];
      }
    };
    const spy = vi.spyOn(respinCredits, "selectSavedVersion").mockResolvedValue({ pieceId: "piece-1", version: 4 });
    const fd = new FormData();
    fd.set("version", "3");
    expect(await target(() => selectSavedVersionAction("profile-1", "att-rev-1", "piece-1", fd))).toBe(`${savedPackHref("att-rev-1")}?selected=1`);
    expect(spy.mock.calls.at(-1)![2]).toEqual({ attemptId: "att-rev-1", pieceId: "piece-1", expectedVersion: 3 });
    // A non-numeric token is passed on as NaN for the capability to refuse.
    const bad = new FormData();
    bad.set("version", "3; drop");
    spy.mockRejectedValueOnce(new CreativePieceError("stale"));
    expect(await target(() => selectSavedVersionAction("profile-1", "att-rev-1", "piece-1", bad))).toBe(`${savedPackHref("att-rev-1")}?e=creative_piece_stale`);
    expect(Number.isNaN(spy.mock.calls.at(-1)![2].expectedVersion)).toBe(true);
    spy.mockRestore();
  });

  it("A REVISION PRESS mints its own id, sends the preset as wire input, and returns the money facts or a code", async () => {
    actionMocks.requireUser.mockResolvedValue({ id: "user-1", email: "a@example.test", name: "A" });
    actionMocks.scopeForUser.mockResolvedValue({ workspaceId: "ws-1", role: "owner" });
    const spy = vi.spyOn(respinCredits, "reviseSaved").mockImplementation(async (_s, _p, params) => ({
      attemptId: params.attemptId,
      replayed: false,
      run: { status: "usable" } as never,
      generation: { id: "g-new", mode: "ideaToScript", outcome: "usable", parentId: "g-parent", promptBundleVersion: "b", rewriteCount: 0 } as never,
      creditsChargedNow: 2,
      balanceAfter: 8,
      freeClaimRefusal: false,
      configVersion: 1,
      resolvedTier: "creator",
      frameworkOffer: null,
    }));
    const fd = new FormData();
    fd.set("preset", "shorter");
    fd.set("quote", "7");
    const one = await reviseSavedAction("profile-1", "att-rev-1", { status: "idle" }, fd);
    const two = await reviseSavedAction("profile-1", "att-rev-1", { status: "idle" }, fd);
    expect(one.status).toBe("done");
    expect(spy.mock.calls[0][2]).toMatchObject({ parentAttemptId: "att-rev-1", preset: "shorter", quotedConfigVersion: 7 });
    expect(spy.mock.calls[0][2].attemptId).not.toBe(spy.mock.calls[1][2].attemptId);
    expect(one).toMatchObject({ status: "done", outcome: "usable", creditsChargedNow: 2, balanceAfter: 8 });
    expect(two.status === "done" && one.status === "done" && two.attemptId !== one.attemptId).toBe(true);
    spy.mockRejectedValueOnce(new RevisionPresetError());
    const refused = await reviseSavedAction("profile-1", "att-rev-1", { status: "idle" }, fd);
    expect(refused).toEqual({ status: "refused", code: "revision_preset" });
    // THE QUOTE IS A CLOSED FORMAT: absent or garbage reaches the package as NaN, to be refused there.
    for (const raw of [null, "", "7; drop", "-1", "1e3"]) {
      const bad = new FormData();
      bad.set("preset", "shorter");
      if (raw !== null) bad.set("quote", raw);
      await reviseSavedAction("profile-1", "att-rev-1", { status: "idle" }, bad);
      expect(Number.isNaN(spy.mock.calls.at(-1)![2].quotedConfigVersion), String(raw)).toBe(true);
    }
    spy.mockRestore();
  });

  // ---------------------------------------------------------------- L4 gate fixes (R-153 amendment)

  const SPIN_REFERENCE = {
    kind: "spin" as const,
    summary: { source: "YouTube" as const, title: "A permitted shared reference", mechanismSummary: "open on a visible renovation regret" },
  };

  it("B1/B3 MARKDOWN, EVERY SHAPE PLANTED: a value at a line or list-item start cannot open a reference definition, footnote, fence, heading, quote, list or table, and a bare URL is not an autolink", () => {
    // THE ONE BUILDER, PLANT BY PLANT. Each value lands at a line start (the
    // caption, the thesis's why) or a list-item start (a shot, a check line).
    // A LINE START, or a list-item start (`- `, `1. `, a task box) before it.
    const ITEM = String.raw`^\s*(?:(?:[-*+]|\d{1,9}[.)])\s+(?:\[ \]\s+)?)?`;
    const at = (tail: string) => new RegExp(ITEM + tail, "m");
    const plants: { name: string; value: string; raw: RegExp }[] = [
      { name: "reference definition", value: "[check]: https://attacker.example \"Confirm\"", raw: at(String.raw`\[check\]:`) },
      { name: "footnote definition", value: "[^1]: see https://attacker.example", raw: /(^|[^\\])\[\^1\]/m },
      { name: "tilde fence", value: "~~~", raw: at("~~~") },
      { name: "backtick fence", value: "```", raw: at("```") },
      { name: "heading", value: "# Forged heading", raw: at(String.raw`#\sForged`) },
      { name: "block quote", value: "> forged quote", raw: at(String.raw`>\sforged`) },
      { name: "bullet", value: "- forged item", raw: at(String.raw`-\sforged`) },
      { name: "ordered item", value: "1. forged item", raw: at(String.raw`1\.\sforged`) },
      { name: "ordered paren", value: "1) forged item", raw: at(String.raw`1\)\sforged`) },
      { name: "setext underline", value: "===", raw: at("===") },
      { name: "table row", value: "| a | b |", raw: /(^|[^\\])\|\sa\s/m },
      { name: "task box", value: "[ ] forged task", raw: at(String.raw`\[ \] forged`) },
    ];
    for (const plant of plants) {
      const base = savedView();
      const out = base.output as unknown as {
        caption: { text: string; hashtags: string[] };
        thesis: { statement: string; why: string };
        hooks: { text: string; mechanic: string }[];
        shotMap: { beatIndex: number; shot: string; note: string }[];
      };
      // MULTI-LINE too: the plant on its own line inside a longer value.
      out.caption.text = `${plant.value}\n${plant.value}`;
      out.thesis.why = plant.value;
      out.shotMap[0].shot = plant.value;
      out.hooks[0].text = plant.value;
      const md = recordingPackMarkdown(savedPackFor(base));
      expect(md, plant.name).not.toMatch(plant.raw);
    }
    // [check] STAYS PLAIN TEXT: the planted definition is escaped (`]\:`), so
    // no line of the file is a definition and `[check]` cannot resolve.
    const view = savedView();
    (view.output as unknown as { caption: { text: string } }).caption.text = "[check]: https://attacker.example \"Confirm\"";
    const md = recordingPackMarkdown(savedPackFor(view));
    expect(md).toContain("\\[check]\\: https\\://attacker.example");
    expect(md).not.toMatch(/\]:\s*https?:/);
    expect(md).toContain("kitchen [check]");
    // B3: bare URLs and an e-mail are broken; the text still reads the same.
    const urls = savedView();
    (urls.output as unknown as { caption: { text: string } }).caption.text = "see https://a.example and http://b.example and www.c.example or me@d.example";
    const urlMd = recordingPackMarkdown(savedPackFor(urls));
    expect(urlMd).toContain("https\\://a.example");
    expect(urlMd).toContain("http\\://b.example");
    expect(urlMd).toContain("www\\.c.example");
    expect(urlMd).toContain("me\\@d.example");
    expect(urlMd).not.toMatch(/(^|[^\\])https?:\/\//m);
    // `md` itself: a leading marker is escaped once, an inner one is not a marker.
    expect(md_("# a # b")).toBe("\\# a # b");
    expect(md_("12) twelve")).toBe("12\\) twelve");
    expect(md_("plain words")).toBe("plain words");
  });

  it("A1 THE CREATOR'S RULE, NEVER THE SCORING MODEL'S NOTE: page, copied script and export name the rule by its own text", () => {
    const view = savedView();
    const pack = savedPackFor(view);
    const html = renderSaved(packProps(view));
    for (const out of [html, scriptText(pack), recordingPackMarkdown(pack)]) {
      expect(out).toContain('your rule "it must not sound like an advert"');
    }
    // A rule whose text cannot be read is said, not invented.
    const unread = savedView({
      killTest: { ...savedView().killTest!, creatorRuleVerdicts: [{ ruleId: "/rules/9", passed: false, ruleText: null }] },
    });
    expect(recordingPackMarkdown(savedPackFor(unread))).toContain("one of your rules (its wording could not be read back");
  });

  it("A2 A REOPENED SPIN keeps its original beside the draft, says it passed the similarity check, and the export carries the attribution", () => {
    const spin = savedView({ modeId: "analyseAndSpin", modeLabel: "Analyse and spin", piece: null, lineage: { parent: null, source: null }, reference: SPIN_REFERENCE });
    const html = renderSaved(packProps(spin));
    // SIDE BY SIDE: the reference is a column of the same grid as the script.
    expect(html).toMatch(/data-testid="saved-columns"[^>]*>[\s\S]*data-testid="saved-reference"[\s\S]*data-testid="saved-script"/);
    expect(html).toContain("YouTube: A permitted shared reference");
    expect(html).toContain("open on a visible renovation regret");
    expect(html).toContain(SPIN_GATE_PASSED);
    expect(html).toContain(ORIGINAL_NOTE);
    expect(ORIGINAL_NOTE).toBe("Not a revision of another version.");
    expect(html).not.toContain("original draft");
    const md = recordingPackMarkdown(savedPackFor(spin));
    expect(md).toContain("## What this was made from");
    expect(md).toContain("Spun from a reference (YouTube): A permitted shared reference.");
    expect(md).toContain(SPIN_GATE_PASSED);
    // A LEGACY row with no readable reference: an honest line, no crash, no gate claim.
    const legacy = savedView({ modeId: "analyseAndSpin", modeLabel: "Analyse and spin", piece: null, reference: { kind: "spin", summary: null } });
    const legacyHtml = renderSaved(packProps(legacy));
    expect(legacyHtml).toContain(REFERENCE_UNAVAILABLE);
    expect(legacyHtml).not.toContain(SPIN_GATE_PASSED);
    expect(recordingPackMarkdown(savedPackFor(legacy))).toContain(REFERENCE_UNAVAILABLE);
    // A SOURCE REEL: the creator's source beside it, and which text the check read.
    const reel = savedView({ modeId: "sourceToReel", modeLabel: "Source to reel", piece: null, lineage: { parent: null, source: null }, reference: { kind: "source", text: "the source the creator pasted", truncated: false, checkedAgainst: "source" } });
    const reelHtml = renderSaved(packProps(reel));
    expect(reelHtml).toContain("the source the creator pasted");
    expect(reelHtml).toContain(SOURCE_CHECKED_SOURCE);
    const reelMd = recordingPackMarkdown(savedPackFor(reel));
    expect(reelMd).toContain(SOURCE_ATTRIBUTION);
    expect(reelMd).not.toContain("the source the creator pasted");
    const revisedReel = savedView({ modeId: "sourceToReel", modeLabel: "Source to reel", piece: null, reference: { kind: "source", text: "the source the creator pasted", truncated: true, checkedAgainst: "revised_draft" } });
    const revisedHtml = renderSaved(packProps(revisedReel));
    expect(revisedHtml).toContain(SOURCE_CHECKED_REVISED);
    expect(revisedHtml).not.toContain(SOURCE_CHECKED_SOURCE);
    // Every other mode carries no reference section.
    expect(renderSaved(packProps(savedView()))).not.toContain('data-testid="saved-reference"');
  });

  it("A4 the three 'as saved' sentences claim only what is true", () => {
    const html = renderSaved(packProps(savedView()));
    const md = recordingPackMarkdown(savedPackFor(savedView()));
    for (const text of [SAVED_READ_FREE, CHECK_LEGEND, EXPORT_FOOTER, html, md]) {
      expect(text).not.toMatch(/exactly as it was saved|Nothing in this saved draft was changed/);
    }
    expect(html).toContain(CHECK_LEGEND);
    expect(md).toContain("with line breaks inside a line joined");
  });

  it("A6 an honest refusal whose only hard-rule reasons were in the model's disclosure SAYS so", () => {
    const view = savedView({
      outcome: "honest_refusal",
      output: null,
      weakestPoint: null,
      killTest: {
        ...savedView().killTest!,
        outcome: "failed",
        attempts: 2,
        finalAttempt: { traceability: [], claims: [], hardRules: [] },
        disclosureHardRulesWithheld: true,
        refusal: { headline: "This one did not survive the kill test", sharperAngle: "Try the smaller claim" },
      },
      revision: { revisable: false, blocked: "honest_refusal", credits: 2, quoteConfigVersion: 7, inPlan: true },
    });
    const html = renderSaved(packProps(view, { reviseBlock: REVISE_REFUSED_ONLY, selectAction: null }));
    expect(html).toContain('data-testid="saved-refusal-disclosure-withheld"');
    expect(html).toContain(DISCLOSURE_ADVICE_WITHHELD);
    expect(recordingPackMarkdown(savedPackFor(view))).toContain("The draft's own disclosure advice broke one of the hard rules");
    // And not when nothing was withheld.
    expect(renderSaved(packProps(savedView()))).not.toContain(DISCLOSURE_ADVICE_WITHHELD);
  });

  it("M1 THE QUOTE TRAVELS WITH THE PRESS: the form carries the quote's config version, and no quote means no press", () => {
    const html = renderSaved(packProps(savedView()));
    expect(html).toMatch(/<input type="hidden" name="quote" value="7"\/>/);
    expect(reviseCostSentence(2, "2026-10-04T14:03:00.000Z")).toMatch(/^A revision currently costs 2 credits\. If that price changes before you press, nothing is made and nothing is charged\./);
    const noQuote = savedView({ revision: { revisable: true, blocked: null, credits: null, quoteConfigVersion: null, inPlan: true } });
    const blocks = savedPressBlocks({ blocked: null, credits: null, inPlan: true, isViewer: false, paused: false });
    expect(blocks.revise).toBe(REVISE_PRICE_UNREADABLE);
    const noQuoteHtml = renderSaved(packProps(noQuote, { reviseBlock: blocks.revise, reviseCostSentence: reviseCostSentence(null, noQuote.createdAt) }));
    expect(noQuoteHtml).not.toContain('name="preset"');
    expect(noQuoteHtml).not.toContain('name="quote"');
    // Even with no block passed, a missing quote renders no form.
    expect(renderSaved(packProps(noQuote))).not.toContain('name="preset"');
    // The saved page's quote-refusal copy names THIS page's remedy.
    expect(SAVED_QUOTE_CHANGED.detail).toContain("Reload this page");
    expect(SAVED_QUOTE_CHANGED.detail).not.toContain("New generation");
  });

  it("M2 A VERSION'S OWN REVISIONS are listed, and the presses say one already exists, with a link to it", () => {
    const view = savedView({
      piece: null,
      revisions: [
        { attemptId: "att-r2", createdAt: "2026-10-04T15:10:00.000Z", outcome: "usable" },
        { attemptId: "att-r1", createdAt: "2026-10-04T15:00:00.000Z", outcome: "honest_refusal" },
      ],
    });
    const html = renderSaved(packProps(view));
    expect(html).toContain('data-testid="saved-revisions"');
    expect(html).toContain(`href="${savedPackHref("att-r2")}"`);
    expect(html).toContain(`href="${savedPackHref("att-r1")}"`);
    const already = html.match(/data-testid="saved-already-revised"[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(already).toContain(alreadyRevisedSentence("2026-10-04T15:10:00.000Z"));
    expect(already).toContain(`href="${savedPackHref("att-r2")}"`);
    // ABOVE the presses.
    expect(html.indexOf('data-testid="saved-already-revised"')).toBeLessThan(html.indexOf('name="preset"'));
    expect(renderSaved(packProps(savedView()))).not.toContain('data-testid="saved-already-revised"');
  });

  it("B2 / C3 / C4: version links carry an ordinal, the recent list is a labelled section with distinct refusal links", () => {
    const html = renderSaved(packProps(savedView()));
    expect(html).toContain(versionLinkLabel(1, "2026-10-04T13:00:00.000Z"));
    expect(html).toContain(versionLinkLabel(2, "2026-10-04T14:03:00.000Z"));
    expect(versionLinkLabel(2, "2026-10-04T14:03:00.000Z")).toBe("Version 2, saved 2026-10-04 14:03 UTC");
    const recent = decoded(renderView({
      recentPacks: [
        { attemptId: "r-1", modeLabel: "Hooks", createdAt: "2026-10-04T14:03:00.000Z", outcome: "honest_refusal", title: null },
        { attemptId: "r-2", modeLabel: "Hooks", createdAt: "2026-10-04T14:09:00.000Z", outcome: "honest_refusal", title: null },
      ],
    }));
    expect(recent).toMatch(/<section class="panel" aria-labelledby="studio-recent-packs-heading" data-testid="studio-recent-packs">/);
    expect(recent).toContain('id="studio-recent-packs-heading"');
    const texts = [...recent.matchAll(/href="\/studio\/saved\/r-\d"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(texts).toHaveLength(2);
    expect(new Set(texts).size).toBe(2);
    expect(texts[0]).toBe("Hooks honest refusal, saved 2026-10-04 14:03 UTC");
  });

  it("C1 / C2: each refused copy names the box that holds its text, both boxes exist, and a repeated press is announced again", () => {
    const html = renderSaved(packProps(savedView()));
    expect(html).toMatch(/<label for="saved-script-text"[^>]*>The script as plain text<\/label>/);
    expect(html).toMatch(/<label for="saved-pack-text"[^>]*>The recording pack as Markdown<\/label>/);
    expect(COPY_SCRIPT_FAILED_STATUS).toContain(`"${SCRIPT_TEXT_LABEL}"`);
    expect(COPY_PACK_FAILED_STATUS).toContain(`"${PACK_TEXT_LABEL}"`);
    // CLEAR, THEN SET: two presses of the same control are four writes.
    const writes: string[] = [];
    const queue: (() => void)[] = [];
    const schedule = (run: () => void) => queue.push(run);
    announce((t) => writes.push(t), COPIED_SCRIPT_STATUS, schedule);
    queue.shift()!();
    announce((t) => writes.push(t), COPIED_SCRIPT_STATUS, schedule);
    queue.shift()!();
    expect(writes).toEqual(["", COPIED_SCRIPT_STATUS, "", COPIED_SCRIPT_STATUS]);
  });

  it("C5 the saved pack's files take their spacing from the --sp-* tokens (a planted raw value is caught)", () => {
    const RAW_SPACING = /\b(?:padding|margin|gap)[A-Za-z]*:\s*"[^"]*\d(?:\.\d+)?(?:rem|px)\b/;
    expect(RAW_SPACING.test('padding: "0.6rem 1rem"')).toBe(true);
    expect(RAW_SPACING.test('gap: "var(--sp-2)"')).toBe(false);
    for (const rel of [
      "app/(product)/studio/saved/saved-view.tsx",
      "app/(product)/studio/saved/pack-actions.tsx",
      "app/(product)/studio/saved/revise-panel.tsx",
    ]) {
      const lines = read(rel).split(/\r?\n/).filter((l) => RAW_SPACING.test(l));
      expect(lines, rel).toEqual([]);
    }
  });

  it("WHICH PRESSES: an unreadable price, a Spin without its reference and a Source-to-reel draft offer no paid press", () => {
    const open = { blocked: null, credits: 2, inPlan: true, isViewer: false, paused: false } as const;
    expect(savedPressBlocks({ ...open, credits: null }).revise).toBe(REVISE_PRICE_UNREADABLE);
    expect(savedPressBlocks({ ...open, blocked: "reference_unavailable" }).revise).toBe(REVISE_REFERENCE_UNAVAILABLE);
    expect(savedPressBlocks({ ...open, blocked: "source_to_reel" }).revise).toBe(REVISE_SOURCE_TO_REEL);
    for (const b of ["reference_unavailable", "source_to_reel"] as const) {
      expect(savedPressBlocks({ ...open, blocked: b }).select).toBeNull();
    }
  });


  it("BN-2: 'Find concepts' and the piece confirmation carry the SEQUEL box, and their actions send it only as the box's own value", async () => {
    const entrances = decoded(renderToStaticMarkup(<StudioEntrances {...L4_ENTRANCES} />));
    const findBox = entrances.match(/<input[^>]*data-testid="studio-find-sequel"[^>]*>/)?.[0] ?? "";
    for (const attr of ['type="checkbox"', 'name="sequel"', 'value="1"', 'aria-describedby="studio-find-sequel-help"']) {
      expect(findBox, attr).toContain(attr);
    }
    expect(entrances).toContain('id="studio-find-sequel-help"');
    expect(entrances).toContain(SEQUEL_LABEL);
    const piece = decoded(renderToStaticMarkup(<PieceConfirmation {...L4_PIECE} />));
    const pieceBox = piece.match(/<input[^>]*data-testid="studio-piece-sequel"[^>]*>/)?.[0] ?? "";
    for (const attr of ['type="checkbox"', 'name="sequel"', 'value="1"', 'aria-describedby="studio-piece-sequel-help"']) {
      expect(pieceBox, attr).toContain(attr);
    }
    expect(piece).toContain(SEQUEL_HELP);
    // Unchecked by default, everywhere.
    expect(`${findBox}${pieceBox}`).not.toMatch(/checked/);

    actionMocks.requireUser.mockResolvedValue({ id: "user-1", email: "a@example.test", name: "A" });
    actionMocks.scopeForUser.mockResolvedValue({ workspaceId: "ws-1", role: "owner" });
    const find = vi.spyOn(respinCredits, "findConcept").mockRejectedValue(new CreativeRequestError("unknown_form"));
    const commission = vi.spyOn(respinCredits, "commissionPiece").mockRejectedValue(new CreativeRequestError("unknown_form"));
    const send = async (which: "find" | "piece", sequel: string | null) => {
      const fd = new FormData();
      fd.set("platform", "TikTok");
      fd.set("hint", "a part two of last week");
      fd.set("input", "a part two of last week");
      fd.set("operationId", "op-1");
      if (sequel !== null) fd.set("sequel", sequel);
      if (which === "find") {
        await findConceptAction("profile-1", IDLE_ACTION_STATE, fd);
        return find.mock.calls.at(-1)![2] as { sequel?: boolean };
      }
      await commissionPieceAction("profile-1", "piece-1", IDLE_ACTION_STATE, fd);
      return commission.mock.calls.at(-1)![2] as { sequel?: boolean };
    };
    for (const which of ["find", "piece"] as const) {
      expect((await send(which, "1")).sequel, which).toBe(true);
      expect("sequel" in (await send(which, null)), which).toBe(false);
      expect("sequel" in (await send(which, "yes")), which).toBe(false);
      expect("sequel" in (await send(which, "true")), which).toBe(false);
    }
    find.mockRestore();
    commission.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// P1-R5 (audit REG-29): `FEEDBACK_TODAY` IS PINNED TO THE READERS OF FEEDBACK.
//
// The sentence used to say nothing read a creator's feedback while two paths
// did. Launch L3 rewrote it; what was still owed is the PIN — a sentence about
// who reads feedback is a claim about a population, and a population changes
// by somebody adding a reader. So every accessor that reads
// `generation_feedback` is classified here, BY NAME, as a USE the sentence
// discloses (with the clause that discloses it) or a read that derives
// nothing (with why) — and EVERY accessor, use or not, carries the measured
// list of its production consumers, per file and counted (gate M4). A new
// accessor, or a new consumer of any of them, is red until this table — and,
// if it is a new use, the sentence — is edited deliberately (Respin rule 7).
type FeedbackAccessor = Readonly<{
  /** The `FEEDBACK_TODAY` clause that discloses this use, or `null` for a non-use. */
  clause: string | null;
  /** Why a non-use derives nothing from what the creator said. */
  why?: string;
  /** Production consumers: file → number of call or destructure sites. Measured 2026-10-05. */
  consumers: Readonly<Record<string, number>>;
}>;

const FEEDBACK_ACCESSORS: Readonly<Record<string, FeedbackAccessor>> = {
  // USE 1 — the proposal path: `buildFeedbackProposalDraft` reads these rows.
  promotionFeedbackInputs: {
    clause: "repeated reactions of the same kind across comparable drafts may be turned into a suggested edit to one of your brain documents",
    consumers: { "packages/db/src/promotion-ops.ts": 1 },
  },
  // USE 2 — the recent-work prompt channel (launch L3, R-152), built by
  // `packages/credits/src/recent-context.ts`.
  recentContextCandidates: {
    clause: "Your next concept and script drafts are shown some of your recent work as labelled history",
    consumers: { "packages/credits/src/generate.ts": 1 },
  },
  feedbackPage: {
    clause: null,
    why: "the creator's own record of what they said, shown back to them and in their export — nothing is derived",
    consumers: { "packages/db/src/with-workspace.ts": 2 },
  },
  brainAssetSummary: {
    clause: null,
    why: "a bare row count on the Brain and Usage pages; reads no reaction or note (KNOWN_FEEDBACK_AGGREGATES)",
    consumers: {
      "app/(product)/brain/page.tsx": 1,
      "app/(product)/usage/page.tsx": 1,
      "packages/db/src/app-server.ts": 1,
      "packages/db/src/with-workspace.ts": 1,
    },
  },
  recentContextPresent: {
    clause: null,
    why: "the settlement's ids-only presence check for the recent-work channel above; reads no reaction or note",
    consumers: { "packages/credits/src/generate.ts": 1 },
  },
  // Phase 6 tenancy gate (R-174): the correlated subquery inside
  // `recentContextCandidates` that withholds a draft every reaction on which
  // was left out. Part of USE 2's read, disclosed by its clause.
  reactionOn: {
    clause: null,
    why: "the leave-out condition inside recentContextCandidates: an EXISTS over whether a draft's reactions were left out, selecting a constant — it reads no reaction value and no note",
    consumers: { "packages/db/src/with-workspace.ts": 2 },
  },
  // Audit P6-A1 (R-174): the "Leave this out of future drafts" write. It
  // narrows USE 2 rather than being a use, and it is disclosed by the
  // sentence's own clause about the control.
  excludeGenerationFeedbackFromHistory: {
    clause: "Once you record a reaction to a concept or script, you can leave it out of future drafts",
    consumers: { "packages/db/src/feedback-ops.ts": 1 },
  },
  promotionProposalReview: {
    clause: null,
    why: "shows a proposal's own evidence to the creator reviewing it — the suggestion the proposal USE produces; and (R-171, audit Phase 2 P2-A2) the refresh's family guard reads a REJECTED proposal's evidence ids, so a family re-proposes only on evidence sharing no member with it — ids only, never a reaction or a note",
    consumers: {
      "app/(product)/brain/page.tsx": 1,
      "app/(product)/results/actions.ts": 1,
      "app/(product)/results/page.tsx": 1,
      "packages/db/src/promotion-ops.ts": 5,
    },
  },
};

/**
 * Every production consumer of a listed accessor: `{ name: { file: count } }`.
 *
 * THREE SHAPES, so no spelling of "a consumer" slips past (gate M4):
 *   - a MEMBER call — `scope.accessors.promotionFeedbackInputs(tx)`;
 *   - a BARE call — `promotionFeedbackInputs(tx)`, after an import or a
 *     destructure;
 *   - a DESTRUCTURE — `const { promotionFeedbackInputs: read } = …`, counted
 *     at the pattern, because an aliased call afterwards no longer names it.
 * A declaration (`function name(`, `name: async (`, `const name = (`) is not a
 * consumer. RegExp LITERALS only: an assembled pattern is one lost backslash
 * from matching nothing (CLAUDE.md 2026-08-26; this block's first draft did).
 */
function feedbackConsumers(
  files: readonly { file: string; text: string }[]
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const add = (name: string, file: string): void => {
    if (!Object.hasOwn(FEEDBACK_ACCESSORS, name)) return;
    const perFile = (out[name] ??= {});
    perFile[file] = (perFile[file] ?? 0) + 1;
  };
  for (const { file, text } of files) {
    const code = blankComments(text);
    for (const m of code.matchAll(/(?<!\bfunction\s+)\b(\w+)\s*\(/g)) add(m[1], file);
    for (const m of code.matchAll(/\{([^{}]*)\}\s*=(?![=>])/g)) {
      for (const name of m[1].matchAll(/\b(\w+)\b/g)) add(name[1], file);
    }
  }
  return out;
}

describe("P1-R5: FEEDBACK_TODAY is pinned to the list of feedback readers", () => {
  it("every accessor that reads generation_feedback is classified, and the list is the measured one", () => {
    // THE POPULATION IS `FEEDBACK_READERS` in `tests/feedback-readers.test.ts`,
    // which asserts it equal to a scan of the DB layer. Read as TEXT, because
    // importing a test file would re-register its suite in this one.
    const readersFile = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "feedback-readers.test.ts"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const block = /export const FEEDBACK_READERS[\s\S]*?\n\];/.exec(readersFile)?.[0] ?? "";
    const owners = [...new Set([...block.matchAll(/owner: "(\w+)"/g)].map((m) => m[1]))].sort();
    expect(owners.length, "FEEDBACK_READERS was not found — the pin would be vacuous").toBeGreaterThan(4);
    expect(Object.keys(FEEDBACK_ACCESSORS).sort()).toEqual(owners);
    for (const [owner, { clause, why }] of Object.entries(FEEDBACK_ACCESSORS)) {
      if (clause === null) expect(why?.length ?? 0, `${owner} is a non-use with no reason`).toBeGreaterThan(30);
    }
  });

  it("the sentence discloses every use, and says what is true today", () => {
    for (const [owner, { clause }] of Object.entries(FEEDBACK_ACCESSORS)) {
      if (clause !== null) expect(FEEDBACK_TODAY, `${owner}'s use is not disclosed`).toContain(clause);
    }
    // ...and the sentence it replaced stays gone.
    expect(FEEDBACK_TODAY).not.toMatch(/nothing reads/i);
  });

  it("every accessor — use or not — is consumed exactly where listed, per file and counted", () => {
    // A new consumer of a NON-use is a change too: it may start deriving from
    // what the creator said, and only a person reading it can tell.
    const production = sourceFilesUnder(PRODUCTION_ROOTS).filter(
      ({ file }) => !file.split("/").includes("tests")
    );
    const expected = Object.fromEntries(
      Object.entries(FEEDBACK_ACCESSORS).map(([name, { consumers }]) => [name, consumers])
    );
    expect(feedbackConsumers(production)).toEqual(expected);
  });

  it("NON-VACUITY: a member, a bare and a destructured consumer are each found; a comment is not", () => {
    expect(
      feedbackConsumers([
        { file: "worker/member.ts", text: "const rows = await scope.accessors.promotionFeedbackInputs(tx);" },
        { file: "app/bare.ts", text: "import { brainAssetSummary } from \"@respin/db\";\nawait brainAssetSummary(db, scope, id);" },
        { file: "lib/destructured.ts", text: "const { recentContextPresent: present } = scope.accessors;\nawait present(ids);" },
        { file: "worker/comment.ts", text: "// scope.accessors.feedbackPage(conn, 1, 0)\n" },
        { file: "worker/declaration.ts", text: "export async function feedbackPage(conn: unknown) {}\nconst x = { promotionProposalReview: async (id: string) => id };" },
      ])
    ).toEqual({
      promotionFeedbackInputs: { "worker/member.ts": 1 },
      brainAssetSummary: { "app/bare.ts": 1 },
      recentContextPresent: { "lib/destructured.ts": 1 },
    });
  });
});
