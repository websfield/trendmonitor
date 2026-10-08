// R-148 (launch L1) fixtures shared by `generate.test.ts` and
// `revision.test.ts`: version-2 ideation and script replies, the legacy batch
// they are compared against, and the request builder.
//
// DIGIT-FREE AND LOWERCASE, `generation-fixtures.ts`' discipline, so a v2
// document that comes back refused is refused for the reason its test is about.
// The framework names are the SEEDED shared library's, so `framework_eligibility`
// runs against a real offer rather than vacuously.
import { CONFIG_V1_SEED } from "@respin/db";

import type { GenerateParams } from "../../src/generate";
import { PLATFORM, hooksOutput } from "./generation-fixtures";

export const IDEATION_COST = CONFIG_V1_SEED.creditCosts.ideationBatch;
export const FULL_SCRIPT_COST = CONFIG_V1_SEED.creditCosts.fullScript;

/** The creator's input for the form cases — the basis a story may quote. */
export const FORM_INPUT =
  "today I shot the same lens change over and over and kept almost none of it";
/** A quote that IS in `FORM_INPUT`, word for word. */
export const FORM_EXCERPT = "shot the same lens change over and over";

export type Form =
  | "explain_opinion"
  | "demonstration_experiment"
  | "personal_story_observation";

const IDEA_BASES = [
  {
    hook: "you are shooting three takes when one honest take would do",
    thesis: "most reshoots come from a setting nobody checked, never from a bad performance",
    framework: "the evidence tutorial",
  },
  {
    hook: "the room tone you ignored is why your edit sounds cheap",
    thesis: "audio decides whether a solo shoot reads as professional long before the picture does",
    framework: "the confession arc",
  },
  {
    hook: "nobody tells you the boring part is where the work happens",
    thesis: "the unglamorous prep is what separates a usable filming day from a wasted one",
    framework: "the mirror",
  },
];

const WHY_AND_DISCLOSURE = {
  whyThisPerforms: hooksOutput().whyThisPerforms,
  disclosure: hooksOutput().disclosure,
};

/** A legacy (v1) ideation reply. */
export function legacyIdeas() {
  return { ideas: IDEA_BASES, ...WHY_AND_DISCLOSURE };
}

/** An honest premise for a form — a quote for a story, a [check]ed result for a demo. */
export function premiseFor(form: Form) {
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
    basis:
      form === "explain_opinion"
        ? { kind: "none" }
        : form === "personal_story_observation"
          ? { kind: "material", excerpt: FORM_EXCERPT }
          : { kind: "unconfirmed" },
  };
}

export const FILMING = {
  location: "kitchen",
  equipment: ["phone"],
  people: "solo",
  minutes: 20,
};

/** A v2 ideation reply, one form per idea (cycled), with optional per-idea overrides. */
export function v2Ideas(
  forms: readonly Form[],
  over: Partial<Record<number, object>> = {}
) {
  return {
    ideas: IDEA_BASES.map((base, i) => ({
      ...base,
      form: forms[i % forms.length],
      frameworkProvenance: "offered",
      premise: premiseFor(forms[i % forms.length]),
      filming: FILMING,
      ...(over[i] ?? {}),
    })),
    ...WHY_AND_DISCLOSURE,
  };
}

/** A v2 script reply for `ideaToScript`, its single pivot of the form's kind. */
export function v2Script(form: Form) {
  return {
    thesis: {
      statement: "you lose more takes to a setting you never checked than to nerves",
      why: "the footage from today shows the same lens change failing twice",
    },
    framework: {
      name: "the evidence tutorial",
      why: "the cost is the reshoot nobody sees",
      provenance: "offered",
    },
    hooks: IDEA_BASES.map((b, i) => ({
      text: b.hook,
      mechanic: ["contradiction", "cost reveal", "withheld detail"][i],
    })),
    // THE OPENING BEAT IS AN HONEST NARRATED EVENT (R-150 point 4): it
    // restates `FORM_INPUT`, so it passes the event scan by sharing a four-word
    // run with the creator's own words. A demonstration's premise is
    // unconfirmed, so its reveal beat carries the `[check]` it owes.
    beats: [
      {
        atSeconds: 0,
        vo: "today I shot the same lens change over and over",
        isTurn: false,
      },
      {
        atSeconds: 6,
        vo:
          form === "demonstration_experiment"
            ? "here is the second take with the dial set, and it holds focus [check]"
            : "here is the dial nobody checks before a lens change",
        isTurn: true,
        pivot: form === "demonstration_experiment" ? "reveal" : "turn",
      },
      {
        atSeconds: 14,
        vo: "show the same shot again with the dial where it should have been",
        isTurn: false,
      },
    ],
    shotMap: [
      { beatIndex: 1, shot: "close on the dial", note: "hold it long enough to read" },
    ],
    onScreenText: [{ atSeconds: 7, text: "the dial nobody checks" }],
    caption: {
      text: "the reshoot nobody sees is the one that costs you the whole day",
      hashtags: ["filmmaking"],
    },
    form,
    premise: premiseFor(form),
    filming: FILMING,
    ...WHY_AND_DISCLOSURE,
  };
}

/** A request for one of the two form modes. `creative` is untyped ON PURPOSE: hostile cases pass anything. */
export const formParams = (
  over: {
    attemptId?: string;
    creative?: unknown;
    mode?: "ideation" | "ideaToScript";
    input?: string;
    revisionOfAttemptId?: string;
  } = {}
): GenerateParams => ({
  mode: over.mode ?? "ideation",
  attemptId: over.attemptId ?? "gen-1",
  input: over.input ?? FORM_INPUT,
  platform: PLATFORM,
  ...(over.revisionOfAttemptId === undefined
    ? {}
    : { revisionOfAttemptId: over.revisionOfAttemptId }),
  ...(over.creative === undefined
    ? {}
    : { creative: over.creative as NonNullable<GenerateParams["creative"]> }),
});

/** The canonical empty limits `parseCreativeRequest` returns. */
export const NO_LIMITS = {
  people: null,
  maxMinutes: null,
  locations: [],
  equipment: [],
  footage: null,
};
