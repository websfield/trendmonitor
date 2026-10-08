// Slice 7 stage B fixtures: the seeded test brain, one valid document per mode,
// and the two documents that LIE in the ways the card names.
//
// A SECOND FILE RATHER THAN MORE OF `fixtures.ts`, for the reason that file
// already states about importing a `*.test.ts`: these are read by one suite
// (`mode-checks.test.ts`) plus the per-mode pipeline walk, and keeping slice
// 6's four planted violations separate from slice 7's keeps "which fixture is
// the clean one" answerable at a glance.
//
// EVERY DOCUMENT HERE IS WRITTEN TO `fixtures.ts`'s DISCIPLINE: no digits, no
// dates, no currency, so a mode fixture that comes back dirty is dirty for the
// reason the test is about rather than for a specific nobody supplied.
import {
  type CreativeContext,
  type GenerationContext,
  type SpinReferenceMechanism,
} from "../../src/assemble";
import {
  PIVOT_FOR_FORM,
  type CreativeForm,
  type FilmingConstraints,
  type FormChoice,
} from "../../src/creative";
import { MODE_IDS, type ModeId } from "../../src/modes";

import { CLEAN_HOOKS } from "./fixtures";

/**
 * The seeded brain every mode fixture is generated against (card R2, inherited
 * verbatim from M3: "every mode produces schema-valid `ScriptOutput` against a
 * seeded test brain").
 *
 * TWO FRAMEWORKS ARE OFFERED, and that is load-bearing rather than decorative:
 * the eligibility check (card R1, verification 11 — "hook + thesis + eligible
 * framework") is VACUOUS when no library is offered, so a fixture context with
 * an empty list would prove nothing about it.
 */
export const SEEDED_CONTEXT: GenerationContext = {
  universalLaws: ["open on a cost the viewer already feels"],
  frameworks: [
    { name: "cost reveal", summary: "name the price before the payoff" },
    { name: "open loop", summary: "ask the question the whole clip answers" },
  ],
  brain: {
    voice: ["writes in short plain sentences", "never hedges"],
    strategy: ["talks to people who film alone"],
    killtest: ["never open on a question"],
  },
  input:
    "today I shot the same lens change over and over and kept almost none of it",
  platform: "youtube",
  // An ORIGINAL, said out loud: `unvouchedSpecifics` is required, so a fixture
  // cannot inherit "nothing is unvouched" from a missing key.
  unvouchedSpecifics: [],
  // The LEGACY contract, stated (R-148): a context must say which it runs.
  creative: null,
  // No history, stated (launch L3): a context must say whether it reads any.
  recentWork: null,
};

/**
 * The mechanism a Spin adapts (slice 8c, R-97) — the autopsy's four-field
 * projection and nothing else of the reference.
 *
 * WRITTEN TO THE SAME DISCIPLINE AS EVERY FIXTURE HERE: no digits, no dates,
 * no currency, no proper nouns — so a spin that comes back dirty is dirty for
 * the reason its test is about. `spin-reference.test.ts` keeps its OWN
 * mechanism that deliberately plants specifics; this one is the clean one the
 * per-mode walk runs against.
 *
 * It shares NO content word with `mode-checks.test.ts`'s
 * `DISTANT_SPIN_REFERENCE` hook or `pipeline.test.ts`'s `SPIN_REFERENCE` hook
 * beyond grammar words, so a prompt that contained the gate's hook could not
 * pass the "gate's hook never reaches the prompt" witness by coincidence.
 */
export const SPIN_MECHANISM: SpinReferenceMechanism = {
  hookMechanic:
    "opens on a regret the viewer has already paid for, then names the shortcut that caused it",
  beats: [
    "show the shortcut being taken as if it were sensible",
    "turn on the hidden cost the shortcut was hiding all along",
    "return to the constraint that made the shortcut tempting",
  ],
  ending: "name the one preparation step that would have prevented the regret",
  followTrigger: "promise to compare a slower choice next time",
};

/** The seeded context WITH the mechanism — what the gated mode requires. */
export const SPIN_CONTEXT: GenerationContext = {
  ...SEEDED_CONTEXT,
  reference: { mechanism: SPIN_MECHANISM },
};

/**
 * The article source-to-reel is given.
 *
 * Source-to-reel is the one mode whose input is somebody ELSE'S material, and
 * R3's check is a comparison against exactly this string — so it lives beside
 * the documents that are measured against it rather than inside one test.
 */
export const SOURCE_TEXT =
  "The team studied how people learn a physical skill and found that spacing practice out beats cramming it into one long session. " +
  "Learners who split the same total practice time across several days retained more of the movement a week later. " +
  "The authors argue that the gap between sessions is where the consolidation happens, and that the feeling of fluency during a long session is misleading.";

export const SOURCE_CONTEXT: GenerationContext = {
  ...SEEDED_CONTEXT,
  input: SOURCE_TEXT,
};

const WHY_AND_DISCLOSURE = {
  whyThisPerforms: {
    reasoning:
      "It opens on a cost the viewer already recognises and then hands them the one thing they can copy today.",
    weakestPoint:
      "None of this has been checked against how your own audience actually behaves.",
  },
  disclosure: {
    platform: "youtube",
    guidance:
      "Say in the description that a tool helped draft this, in your own words.",
  },
};

/** The full-script document the four script modes share. */
export const SCRIPT_OUTPUT = {
  thesis: {
    statement:
      "You lose more takes to a setting you never checked than to nerves",
    why: "the footage from today shows the same lens change failing twice",
  },
  framework: { name: "cost reveal", why: "the cost is the reshoot nobody sees" },
  hooks: [
    {
      text: "You are shooting three takes when one honest take would do",
      mechanic: "contradiction",
    },
    {
      text: "The setting you skipped is the one your viewer notices first",
      mechanic: "cost reveal",
    },
    {
      text: "Nobody tells you the boring part is where the work happens",
      mechanic: "withheld detail",
    },
  ],
  beats: [
    {
      atSeconds: 0,
      vo: "open on the take that failed and say out loud why you kept it",
      isTurn: false,
    },
    {
      atSeconds: 6,
      vo: "here is the dial nobody checks before a lens change",
      isTurn: true,
    },
    {
      atSeconds: 14,
      vo: "show the same shot again with the dial where it should have been",
      isTurn: false,
    },
  ],
  shotMap: [
    {
      beatIndex: 0,
      shot: "wide handheld of the take that failed",
      note: "keep the room audio",
    },
    {
      beatIndex: 1,
      shot: "close on the dial",
      note: "hold it long enough to read",
    },
  ],
  onScreenText: [
    { atSeconds: 1, text: "the take that failed" },
    { atSeconds: 7, text: "the dial nobody checks" },
  ],
  caption: {
    text: "The reshoot nobody sees is the one that costs you the whole day.",
    hashtags: ["filmmaking", "solocreator"],
  },
  ...WHY_AND_DISCLOSURE,
};

/** The source-to-reel document that REBUILDS rather than summarises (R3). */
export const REBUILT_SOURCE = {
  ...SCRIPT_OUTPUT,
  thesis: {
    statement:
      "The day you film the same move for hours is the day you keep the least of it",
    why: "your own footage from today is the argument, and the reading only gave it a name",
  },
  beats: [
    {
      atSeconds: 0,
      vo: "open on the pile of takes you shot today and how few you kept",
      isTurn: false,
    },
    {
      atSeconds: 6,
      vo: "here is the turn, the version you keep is the one you shot after a night off",
      isTurn: true,
    },
    {
      atSeconds: 14,
      vo: "put the camera down and book the same move for tomorrow instead",
      isTurn: false,
    },
  ],
};

/** The caption document. */
export const CAPTION_OUTPUT = {
  thesis: {
    statement:
      "You lose more takes to a setting you never checked than to nerves",
    why: "the footage from today shows the same lens change failing twice",
  },
  caption: {
    text: "The reshoot nobody sees is the one that costs you the whole day.",
    hashtags: ["filmmaking", "solocreator"],
  },
  ...WHY_AND_DISCLOSURE,
};

/** The ideation document: hook + thesis + eligible framework, never topics. */
export const IDEATION_OUTPUT = {
  ideas: [
    {
      hook: "You are shooting three takes when one honest take would do",
      thesis:
        "Most reshoots come from a setting nobody checked, never from a bad performance",
      framework: "cost reveal",
    },
    {
      hook: "The room tone you ignored is why your edit sounds cheap",
      thesis:
        "Audio decides whether a solo shoot reads as professional long before the picture does",
      framework: "open loop",
    },
    {
      hook: "Nobody tells you the boring part is where the work happens",
      thesis:
        "The unglamorous prep is what separates a usable filming day from a wasted one",
      framework: "cost reveal",
    },
  ],
  ...WHY_AND_DISCLOSURE,
};

/**
 * ONE VALID DOCUMENT PER MODE (R2).
 *
 * A `Record<ModeId, …>`, so a later mode cannot arrive without a fixture — the
 * same map-not-a-chain discipline the registry itself uses.
 */
export const OUTPUT_FOR: Record<ModeId, unknown> = {
  footageToThesis: SCRIPT_OUTPUT,
  ideaToScript: SCRIPT_OUTPUT,
  sourceToReel: REBUILT_SOURCE,
  analyseAndSpin: SCRIPT_OUTPUT,
  hooks: CLEAN_HOOKS,
  caption: CAPTION_OUTPUT,
  ideation: IDEATION_OUTPUT,
};

/** The context each mode's fixture is generated against. */
export const CONTEXT_FOR: Record<ModeId, GenerationContext> =
  Object.fromEntries(
    MODE_IDS.map((m) => [
      m,
      // The gated mode carries its mechanism (R-97) and no other mode may —
      // `assertReferenceMechanism` refuses both directions at assembly.
      m === "sourceToReel"
        ? SOURCE_CONTEXT
        : m === "analyseAndSpin"
          ? SPIN_CONTEXT
          : SEEDED_CONTEXT,
    ])
  ) as Record<ModeId, GenerationContext>;

/**
 * VERIFICATION 9's LYING HOOK SET: five wordings of ONE thesis.
 *
 * IT IS REALISTIC RATHER THAN TRIVIAL, and every part of that is deliberate:
 * the five `mechanic` labels are all DIFFERENT (so `parseScriptOutput`'s
 * duplicate-mechanic refusal, which already existed, does not fire), every hook
 * is under the word cap, no two are byte-identical, and each is a sentence a
 * model would plausibly emit. What they share is the claim — which is the thing
 * REQ-C04 is actually about, and the thing a label check cannot see.
 *
 * "NO TWO ARE BYTE-IDENTICAL" IS A PROPERTY OF THIS FIXTURE, NOT A GAP IN THE
 * CHECK, and for one slice it was both (spin-compliance gate round 2). This
 * docblock recorded that the identity case was avoided here by construction
 * while NO fixture anywhere drove it — and `sameContentWords` was silently
 * passing it, because set equality contains literal duplication. The identity
 * case now has its own drivers in `mode-checks.test.ts` (byte for byte, case
 * only, punctuation only, plus one end to end), so this line describes a
 * deliberately harder fixture rather than an untested case.
 */
export const FIVE_WORDINGS_OF_ONE = {
  hooks: [
    {
      text: "Nobody tells you the first year of filming alone is the hardest",
      mechanic: "withheld detail",
    },
    {
      text: "The hardest year of filming alone is the first one nobody warns you about",
      mechanic: "cost reveal",
    },
    {
      text: "What nobody warns you about is the first year of filming alone",
      mechanic: "contradiction",
    },
    {
      // NOT A PERMUTATION OF ANOTHER HOOK, and that is measured rather than
      // intended: this line used to be "Filming alone is hardest in the first
      // year and nobody tells you", whose content-word SET is identical to the
      // first hook's. The set overlapped at 1.000, so the fixture was caught by
      // an identity rather than by the threshold — a mutation loosening
      // `HOOK_SPREAD_MAX_OVERLAP` all the way to 0.95 left the R4 test green.
      // `mode-checks.test.ts` now pins that no pair here is identical.
      text: "Your first year of filming alone is the hardest thing nobody mentions",
      mechanic: "curiosity gap",
    },
    {
      text: "The first year filming alone is the hardest part nobody mentions",
      mechanic: "authority",
    },
  ],
  ...WHY_AND_DISCLOSURE,
};

/**
 * M7's OUTPUT: source-to-reel as a summariser.
 *
 * It carries both shapes the check names — a verbatim run out of `SOURCE_TEXT`
 * and the summariser's register ("in this article", "the authors argue") — and
 * is otherwise a well-formed script document, so a test that catches it is
 * catching the summary rather than a broken fixture.
 */
export const SUMMARISED_SOURCE = {
  ...SCRIPT_OUTPUT,
  thesis: {
    statement:
      "In this article the team explains that spacing practice out beats cramming it into one long session",
    why: "the authors argue that the gap between sessions is where the consolidation happens",
  },
  beats: [
    {
      atSeconds: 0,
      vo: "here is a summary of what the piece found about learning a physical skill",
      isTurn: false,
    },
    {
      atSeconds: 6,
      vo: "learners who split the same total practice time across several days retained more of the movement",
      isTurn: true,
    },
    {
      atSeconds: 14,
      vo: "put the camera down and book the same move for tomorrow instead",
      isTurn: false,
    },
  ],
};

/**
 * The ideation document that returns TOPICS (R5's failure mode).
 *
 * Each idea fails a different way, so one shape cannot carry the whole test:
 * the first repeats its hook as its thesis, the second's thesis is a subject
 * rather than a claim, and the third asks a question instead of asserting.
 */
export const IDEAS_AS_TOPICS = {
  ideas: [
    {
      hook: "Morning routines for people who film alone",
      thesis: "Morning routines for people who film alone",
      framework: "cost reveal",
    },
    {
      hook: "The room tone you ignored is why your edit sounds cheap",
      thesis: "Audio gear",
      framework: "open loop",
    },
    {
      hook: "Nobody tells you the boring part is where the work happens",
      thesis: "Should you film every day or only when you feel ready?",
      framework: "cost reveal",
    },
  ],
  ...WHY_AND_DISCLOSURE,
};

// ---------------------------------------------- OUTPUT CONTRACT v2 (R-148)
//
// THE SAME DISCIPLINE AS EVERY FIXTURE ABOVE — no digits in text, no dates, no
// currency, no capitalised name mid-sentence — so a v2 document that comes back
// dirty is dirty for the reason its test is about. A minute count is a closed
// integer field, never text, so it is the one number these documents carry.

/** No declared filming limits — the canonical empty form `parseCreativeRequest` returns. */
export const NO_LIMITS: FilmingConstraints = {
  people: null,
  maxMinutes: null,
  locations: [],
  equipment: [],
  footage: null,
};

/** A quote that IS in `SEEDED_CONTEXT.input`, word for word. */
export const REAL_EXCERPT = "shot the same lens change over and over";

/**
 * A narrated event that RESTATES the creator's input (R-150 point 4): it reads
 * as first-person past, and it is honest because the creator said it.
 */
export const HONEST_RESTATING_BEAT = "today I shot the same lens change over and over";

/**
 * A version-2 context: the seeded brain and input, plus the creator's choice and
 * limits. Every server-derived field is stated, as `generate.ts` must state it.
 */
export function v2Context(
  formChoice: FormChoice,
  constraints: FilmingConstraints = NO_LIMITS,
  over: Partial<CreativeContext> = {},
  base: GenerationContext = SEEDED_CONTEXT
): GenerationContext {
  return {
    ...base,
    creative: {
      formChoice,
      constraints,
      // An ORIGINAL: the creator's note IS the input.
      creatorNote: base.input,
      carriedBasis: [],
      carriedUnconfirmed: [],
      approvedFrameworkNames: [],
      ...over,
    },
  };
}

/** The basis each form takes by default in these fixtures — every one honest. */
function basisFor(form: CreativeForm) {
  return form === "explain_opinion"
    ? ({ kind: "none" } as const)
    : form === "personal_story_observation"
      ? ({ kind: "material", excerpt: REAL_EXCERPT } as const)
      : ({ kind: "unconfirmed" } as const);
}

/** An honest premise for a form: a demonstration's unconfirmed result is marked. */
export function premiseFor(form: CreativeForm) {
  return {
    whatHappens:
      form === "demonstration_experiment"
        ? "you film the same shot twice, once without prep and once after a short checklist"
        : "you change the lens again and again and keep almost none of the takes",
    interest: "everyone has kept going on a shoot they should have stopped",
    payoff:
      form === "demonstration_experiment"
        ? "the prepared take holds focus the whole way through [check]"
        : "the take worth keeping comes after checking the dial",
    basis: basisFor(form),
  };
}

export const SOLO_KITCHEN_FILMING = {
  location: "kitchen",
  equipment: ["phone"],
  people: "solo" as const,
  minutes: 20,
};

/** One v2 concept per idea of `IDEATION_OUTPUT`, in the form given for each. */
export function ideationV2(forms: readonly CreativeForm[]) {
  return {
    ...IDEATION_OUTPUT,
    ideas: IDEATION_OUTPUT.ideas.map((idea, i) => ({
      ...idea,
      form: forms[i % forms.length],
      frameworkProvenance: "offered" as const,
      premise: premiseFor(forms[i % forms.length]),
      filming: SOLO_KITCHEN_FILMING,
    })),
  };
}

/** Three concepts, one in each form — what "Choose for me" may plausibly return. */
export const IDEATION_V2_MIXED = ideationV2([
  "personal_story_observation",
  "explain_opinion",
  "demonstration_experiment",
]);

/**
 * A v2 script in one form, its single pivot beat of that form's kind.
 *
 * ITS OPENING BEAT IS AN HONEST NARRATED EVENT (R-150 point 4): "today I shot
 * the same lens change over and over" says something happened, and it is the
 * creator's own input restated — so it passes the event scan by sharing a
 * four-word run with their material, the way a real creator's script will.
 * `REAL_EXCERPT` is that input, and `HONEST_RESTATING_BEAT` is asserted to pass
 * by that route alone in `mode-checks.test.ts`. A demonstration's premise is
 * unconfirmed, so its reveal beat carries the `[check]` an unconfirmed script
 * owes in a beat that says the same event.
 */
export function scriptV2(form: CreativeForm) {
  return {
    ...SCRIPT_OUTPUT,
    framework: { ...SCRIPT_OUTPUT.framework, provenance: "offered" as const },
    beats: [
      { atSeconds: 0, vo: HONEST_RESTATING_BEAT, isTurn: false },
      {
        atSeconds: 6,
        vo:
          form === "demonstration_experiment"
            ? "here is the second take with the dial set, and it holds focus [check]"
            : "here is the dial nobody checks before a lens change",
        isTurn: true,
        pivot: PIVOT_FOR_FORM[form],
      },
      { atSeconds: 14, vo: "show the same shot again with the dial where it should be", isTurn: false },
    ],
    form,
    premise: premiseFor(form),
    filming: SOLO_KITCHEN_FILMING,
  };
}
