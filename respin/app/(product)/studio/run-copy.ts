// The Studio controls' sentences, as PURE functions with NO imports at all.
//
// SAME RULE AS `../onboarding/run-copy.ts`, and the same reason it is not in
// `./copy.ts`: these are rendered by client code, and `copy.ts` imports
// `../billing-errors` for its refusal table — which imports
// `@respin/credits/app-server`, which reaches `@respin/db` and therefore `pg`.
// A file with no imports cannot put a Postgres driver in the client bundle.
//
// R18's rule applies here as it does on `/onboarding`: THE CONTROL SAYS WHAT IT
// WILL SPEND BEFORE IT SPENDS IT, and a sentence about money assembled inline
// in a component is a sentence no test drives.
//
// ---------------------------------------------------------------------------
// SLICE 7 TOOK THE ONE FIXED MODE OUT OF THIS FILE (R1/R13/R14).
//
// Slice 6 exported `STUDIO_MODE = "hooks"` and a `MODE_AVAILABILITY_NOTE`
// saying the other six were "specified and not built". Both were true then and
// both are false now: six modes have a pipeline, and which of them a creator
// may press depends on their plan. The replacement is NOT a list in this file —
// a screen-side list of modes is the second tier→mode derivation `./copy.ts`
// refuses, and `tests/studio-ui.test.tsx` scans this directory for mode ids to
// prove it does not exist. What the screen renders is `modeOffers(tier)` from
// `@respin/credits/app-server`, resolved server-side; the functions below take
// that data STRUCTURALLY and say what it means.

/**
 * The platforms the disclosure section can be written for.
 *
 * A LIST ON THE SCREEN, NOT A VALIDATION. `assembleGenerationPrompt` refuses a
 * blank platform and nothing else constrains the value, so these are the
 * suggestions the form offers — the server does not police membership and this
 * file must not pretend it does. It exists because the disclosure guidance is
 * platform-specific and a free-text box would produce a platform nobody named.
 */
export const PLATFORM_OPTIONS: readonly string[] = [
  "TikTok",
  "Instagram Reels",
  "YouTube Shorts",
];

/**
 * ONE MODE AS THE SCREEN RECEIVES IT — structural, never `ModeOffer` by name.
 *
 * This file imports nothing (see the header), so it cannot name the facade's
 * type. A structural parameter accepts `ModeOffer & { cost }` without naming
 * its module, which is the same trick `claimsHeading` already uses below.
 */
export type ModeChoiceView = {
  id: string;
  label: string;
  status: "available" | "not_in_plan";
  /**
   * What a press of this mode costs, from the active config, or `null` when the
   * price could not be read. NEVER a guess — non-negotiable 6.
   */
  cost: number | null;
};

/** The confirmed document kinds this draft may draw from. */
export type ActiveBrainKind = "Voice" | "Strategy" | "Kill test";

/** Disclosure traceability findings are stored but not offered to creators. */
export const DISCLOSURE_FIELD_PREFIX = "/disclosure/";

export const DISCLOSURE_PROVENANCE =
  "Any disclosure guidance is written by the product about the platform's policy, not from your material, so its names, numbers and dates are not listed here. It is checked against this product's list of concealment phrasings, which is a recall aid, not a complete check.";

/** Say exactly which confirmed documents are available to this draft. */
export function inForceSentence(
  activeKinds: readonly ActiveBrainKind[] | null
): string {
  if (activeKinds === null) {
    return "The documents in force could not be read. Reload this page.";
  }
  if (activeKinds.length === 0) return "No documents are in force.";
  return `${listOf(activeKinds)} ${activeKinds.length === 1 ? "is" : "are"} in force.`;
}

export const VOICE_DOCUMENT_NEEDED =
  "A voice document is needed before this creator can be written in their voice. Confirm a voice document on the brain page and activate it, then come back.";

/**
 * What the picker says about the modes it is NOT offering.
 *
 * Slice 8 made every registry mode reachable, so the only unavailable reason
 * this view receives is the server-owned plan decision.
 *
 * IT NAMES THE MODES BY LABEL, which is a server-derived value, never a list in
 * this file. An empty tail (everything offered) returns the short sentence
 * rather than an awkward "and nothing else is missing".
 */
export function modeAvailabilityNote(
  modes: readonly ModeChoiceView[]
): string {
  const label = (m: ModeChoiceView) => m.label;
  const notInPlan = modes.filter((m) => m.status === "not_in_plan").map(label);
  const offered = modes.filter((m) => m.status === "available").length;
  const head =
    offered === 1
      ? "One mode is available to you here."
      : `${offered} modes are available to you here.`;
  const parts: string[] = [];
  if (notInPlan.length > 0) {
    parts.push(
      `${listOf(notInPlan)} ${notInPlan.length === 1 ? "is" : "are"} not part of this workspace's plan`
    );
  }
  if (parts.length === 0) return `${head} Every mode this product has is one of them.`;
  return `${head} ${parts.join("; ")}.`;
}

/** "a", "a and b", "a, b and c" — never an Oxford-comma-less ambiguity. */
function listOf(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * What the generate control says BEFORE it is pressed, for the CHOSEN mode.
 *
 * NO "first one is included" CLAUSE, and the difference from the voice control
 * is real rather than an inconsistency: `priceOf` prices a generation by its
 * mode EVERY time (`packages/credits/src/inference.ts`) — D-M2-2's one free
 * build per profile is a property of the onboarding brain, not of the product's
 * output. Printing the voice screen's rule here would tell a creator their
 * first draft is free and then charge them for it.
 *
 * IT NAMES EVERY MODE'S PRICE, not just the selected one, because the selection
 * lives in the browser and this sentence is rendered on the server. A creator
 * choosing between a caption and a full script is choosing between two prices,
 * and a control that showed one of them would be showing the wrong one half the
 * time. `cost` is nullable for the reason every other number on these screens
 * is: when the server could not read one, the screen says so rather than
 * inventing it (non-negotiable 6).
 */
export function generateCostSentence(
  modes: readonly ModeChoiceView[],
  balance: number | null
): string {
  const offered = modes.filter((m) => m.status === "available");
  if (offered.length === 0) {
    return "There is no mode available to run here, so there is no price to state.";
  }
  const unpriced = offered.filter((m) => m.cost === null);
  const priced = offered.filter((m) => m.cost !== null);
  const parts: string[] = [];
  if (priced.length > 0) {
    parts.push(
      `${priced
        .map((m) => `${m.label} costs ${creditWords(m.cost as number)}`)
        .join(", ")}, every time — there is no included draft`
    );
  }
  if (unpriced.length > 0) {
    parts.push(
      `the price of ${listOf(unpriced.map((m) => m.label))} could not be read just now, so it is not shown — pressing the button still prices and checks it on the server before anything is spent`
    );
  }
  const rule = `${capitalise(parts.join("; "))}.`;
  if (balance === null) return rule;
  return `${rule} You have ${creditWords(balance)}.`;
}

/** "5 credits" / "1 credit" / "nothing" — the singular is not an afterthought. */
function creditWords(n: number): string {
  if (n === 0) return "nothing";
  return `${n} ${n === 1 ? "credit" : "credits"}`;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * What a REVISION costs, said beside the revise control (R8).
 *
 * A REVISION IS PRICED AS A REVISION, NEVER AT THE PARENT MODE'S PRICE — the
 * whole content of R8 — and the number here is `creditCosts.revision` read
 * through the same `priceOf`/`generationOp` pair the debit is taken from, not a
 * screen-side rule about revisions being cheaper. If an operator prices a
 * revision ABOVE a mode, this sentence says so.
 */
export function revisionCostSentence(cost: number | null): string {
  if (cost === null) {
    return "The price of a revision could not be read just now, so it is not shown here. Pressing the button still prices and checks it on the server before anything is spent.";
  }
  return `A revision costs ${creditWords(cost)}, whichever mode it revises — a revision is priced as a revision, not at the price of the draft it came from.`;
}

/**
 * WHAT *THIS PRESS* COSTS, for the mode (or the revision) currently selected.
 *
 * IT IS A FUNCTION RATHER THAN AN INLINE TERNARY because of the defect it was
 * written to close: with a parent chosen, the line beside the picker showed the
 * MODE's price while the press was going to be charged `creditCosts.revision`.
 * On a 12-credit script revised for 2 that is a money lie on the control that
 * spends it — and an inline ternary in a component is a decision no test drives
 * (`../onboarding/copy.ts`'s rule).
 *
 * FOUR ANSWERS AND EACH IS A DIFFERENT FACT: this is a revision and costs the
 * revision price; this is a revision whose price could not be read; this mode
 * costs N; this mode's price could not be read. Non-negotiable 6 is why the two
 * unread branches say so instead of showing a number from somewhere else.
 */
export function priceLineFor(params: {
  isRevision: boolean;
  revisionCost: number | null;
  mode: ModeChoiceView | null;
  parentModeLabel: string | null;
}): string {
  if (params.isRevision) {
    const what =
      params.parentModeLabel === null
        ? "This revision"
        : `This revision of a ${params.parentModeLabel} draft`;
    if (params.revisionCost === null) {
      return `${what} is priced as a revision, and that price could not be read just now. Pressing the button still prices it on the server before anything is spent.`;
    }
    return `${what} costs ${creditWords(params.revisionCost)} — a revision is priced as a revision, not at the price of the draft it came from.`;
  }
  if (params.mode === null) return "Pick a mode to see what it costs.";
  if (params.mode.cost === null) {
    return `The price of ${params.mode.label} could not be read just now. Pressing the button still prices it on the server before anything is spent.`;
  }
  return `${params.mode.label} costs ${creditWords(params.mode.cost)}.`;
}

/**
 * WHETHER THIS SLICE STREAMS, said on the screen instead of implied by a
 * spinner (R16: "if streaming is deferred, the screen says the output is being
 * prepared and does not imply a stream — an animated placeholder that suggests
 * live generation is a claim").
 *
 * IT DOES NOT STREAM, AND SLICE 7 DID NOT CHANGE THAT. The kill test and the
 * traceability scan both run over the WHOLE parsed document — `runKillTest`
 * takes a `ScriptOutput`, not a token stream — and a rewrite replaces the draft
 * outright, so anything shown while the model was typing could be a draft the
 * product is about to refuse. Showing a creator text that then vanishes is
 * worse than showing nothing, and the one honest streaming design (stream, mark
 * it unchecked, then finalise) is a surface of its own.
 */
export const NO_STREAM_NOTE =
  "This runs in one pass: nothing appears until the whole draft has been through the checks, and a draft that fails them is replaced once before you see anything. A part-written draft is never shown, because the product may still be about to refuse it.";

/**
 * WHAT THE SCREEN SAYS WHILE IT IS WORKING (R16's second branch, literally).
 *
 * "being prepared", never "writing" and never a progress bar. The distinction
 * is not decoration: an animated placeholder that fills in, or a label that
 * says text is arriving, is a CLAIM that a stream exists — and no stream does.
 * `tests/studio-ui.test.tsx` scans this screen's rendered pending state for the
 * vocabulary of live generation and for a progress element, so a future spinner
 * that implies one is a red test rather than a design review.
 */
export const PREPARING_LABEL = "Preparing your draft…";

/**
 * R21's n = 0 sentence — THE ONE THIS SLICE IS MOST LIKELY TO GET WRONG.
 *
 * No result of this creator's has been logged: the results loop is slice 9, so
 * `n` is zero for everybody, always, today. Anything on this screen that hinted
 * the draft was shaped by what has worked for this person would be a claim
 * about evidence the product does not hold — which is the exact shape
 * non-negotiable 6 forbids and which nothing in the schema prevents.
 *
 * SLICE 7 ADDED A REASON IT MATTERS MORE, not less: this screen now records
 * feedback. A creator who has just pressed "off voice" is at exactly the moment
 * they would assume the product is adjusting to them, and it is not.
 * `FEEDBACK_TODAY` below is where that is said in full.
 */
export const NO_RESULTS_BASIS =
  "Nothing here is based on how your posts have done. No results of yours have been logged — this product holds none, and it is not measuring you. A draft is built from the brain you confirmed and from what you type in, and nothing else.";

/**
 * What the screen says AFTER a run, from the operation's own return value.
 *
 * `charged` of 0 is a REAL answer — an operator has priced this mode at zero —
 * and it is never rendered as "free" by absence: it is the number `generate`
 * returned, not a ledger row this screen failed to find.
 */
export function generateChargeSentence(
  charged: number,
  balanceAfter: number
): string {
  const bal = balanceAfter === 1 ? "credit" : "credits";
  const spent =
    charged === 0
      ? "Nothing was taken from your credit balance for this draft."
      : `That cost ${charged} ${charged === 1 ? "credit" : "credits"}.`;
  return `${spent} Your balance is now ${balanceAfter} ${bal}. The entry is in your credit history on the usage page.`;
}

/**
 * WHAT THE PROMPT COULD NOT CARRY OF THE CREATOR'S OWN FRAMEWORKS (R17).
 *
 * `null` MEANS THIS PRESS BUILT NO OFFER — a replay or a retry settles a
 * stored candidate without assembling a prompt — and `0` means it built one
 * and everything fitted. Both return `null` here, because there is nothing to
 * say in either case; the DIFFERENCE between them is preserved in the state
 * (`PrivateFrameworksNotUsed`), so a later surface that needs to distinguish
 * them still can.
 *
 * WHAT THE SENTENCE MAY AND MAY NOT DO. It states a COUNT and a CAUSE, both of
 * which are facts this call holds:
 *
 *   - IT DOES NOT PROMISE. It says nothing about what the draft would have
 *     been with them, because nobody knows that — non-negotiable 6.
 *   - IT DOES NOT SELL. There is no upgrade that raises this bound: the budget
 *     is one number in the versioned config for the whole install, identical on
 *     Free and on Studio (R15's rule applied where it would be easiest to
 *     break, since "your frameworks did not fit" reads like a paywall and is
 *     not one).
 *   - IT NAMES THE ONE THING THE CREATOR CAN DO, which is retire frameworks
 *     they no longer use — the same remedy `framework_limit` gives, and it is
 *     lossless, because every version of a retired framework is kept.
 *   - IT DOES NOT BLAME THE CURATED LIBRARY, AND IT DOES NOT CLAIM THE
 *     LIBRARY SURVIVED EITHER. `frameworksForContext` sorts shared rows first
 *     and only then private ones, so a private row cannot cause a curated one
 *     to be dropped — that ordering claim is TRUE IN EVERY CASE and is what
 *     the sentence states. The first draft said "the shared library was
 *     unaffected", which is a claim about the OUTCOME and is false when a
 *     single curated row is larger than the whole budget: this sentence is
 *     rendered off `droppedPrivate` alone and has no way to know. Caught by
 *     re-reading the diff, and it is the same defect this pass fixed on two
 *     other screens — saying more than the check behind it can support.
 */
export function frameworksNotUsedSentence(
  privateFrameworksNotUsed: number | null
): string | null {
  if (privateFrameworksNotUsed === null || privateFrameworksNotUsed < 1) {
    return null;
  }
  const n = privateFrameworksNotUsed;
  const noun = n === 1 ? "framework" : "frameworks";
  const verb = n === 1 ? "was" : "were";
  return `${n} of your own ${noun} ${verb} not put in the prompt for this one: one prompt can only carry so much of the framework library, and yours did not all fit. The curated library is offered first, so none of it was displaced by yours. Nothing about the charge changes, and nothing was lost — if you want a different set in front of the model, retire the ones you no longer use on the frameworks page.`;
}

/** The same sentence for a re-submission that settled earlier (R14c's replay). */
export function replayChargeSentence(balanceAfter: number): string {
  const bal = balanceAfter === 1 ? "credit" : "credits";
  return `This draft had already been paid for and finished, so nothing was called and nothing extra was spent. Your balance is ${balanceAfter} ${bal}.`;
}

/**
 * What the kill test found, in words.
 *
 * THREE OUTCOMES AND THEY ARE NOT INTERCHANGEABLE. "It passed first time",
 * "it broke a hard rule and was rewritten once, and the rewrite passed" and
 * "both attempts broke a hard rule" are three different facts about the draft
 * in front of the reader, and the middle one is the one a creator would never
 * otherwise know happened.
 *
 * A REVISION RE-RUNS IT (R7, the card's question 2): a revision produces new
 * text and a kill test is a property of text, so no verdict is inherited. That
 * is `runGeneration`'s doing, not this sentence's — what this sentence must not
 * do is imply otherwise, which is why it never mentions a parent.
 */
// `rewritten` is NOT a parameter: `KillTestResult.rewritten` and its `outcome`
// are two views of one fact (`outcome === "passed_after_rewrite"` is exactly
// `rewritten && passed`), and taking both would let a caller hand this function
// a pair that disagrees — a sentence saying "it was rewritten" above a result
// that says it was not. One input, one answer.
export function killTestSentence(outcome: string, attempts: number): string {
  if (outcome === "passed") {
    return "This draft passed the product's hard rules on the first attempt.";
  }
  if (outcome === "passed_after_rewrite") {
    return "The first attempt broke one of the product's hard rules, so it was rewritten once — and the rewrite is what you are reading. That rewrite is the only one; there is no second.";
  }
  return `Both attempts (${attempts}) broke one of the product's hard rules, so there is no draft to show. What follows is why, and a sharper angle to try.`;
}

/**
 * Whether the creator's OWN criteria were scored, said separately from what
 * they said.
 *
 * "No criteria were scored" and "every criterion passed" are different facts
 * and a reader must not be able to mistake one for the other — the same
 * distinction `KillTestResult.creatorRulesScored` exists to keep, carried
 * through to the sentence.
 */
export function creatorRulesSentence(
  scored: boolean,
  verdictCount: number
): string {
  if (!scored) {
    return "Your own kill-test criteria were not scored for this draft. That is not the same as saying they passed — it means nothing was asked about them. Criteria you have written on the brain page are scored on drafts that get past the hard rules.";
  }
  if (verdictCount === 0) {
    return "Your own kill-test criteria were scored and came back with nothing to report.";
  }
  // THE VERB AGREES WITH THE NOUN. "1 kill-test criterion were scored" is what
  // a fixed verb beside a switched noun produces, and it shipped — found by
  // rendering the sentence rather than by reading it (learning honesty gate,
  // 2026-09-01). A creator reading their own money screen should not be able to
  // tell that nobody looked at the singular case.
  const noun = verdictCount === 1 ? "criterion was" : "criteria were";
  return `Your own ${verdictCount} kill-test ${noun} scored against this draft. These verdicts are a model's opinion of criteria you wrote — advisory, not a check the product enforces.`;
}

/**
 * R20 / REQ-I04 / REQ-C02, AS A SCREEN CONTROL RATHER THAN A SCHEMA ONE.
 *
 * `output.ts`'s zod schema already requires a non-blank `weakestPoint` on every
 * `ScriptOutput`, so on today's code path this function's false branch cannot
 * fire from a parsed document. It exists anyway, and it is not decoration:
 *
 *  - the schema guards the DOCUMENT; this guards the SCREEN. A component is
 *    free to render `reasoning` and forget `weakestPoint`, and no parse would
 *    notice — "why this performs" with no weakest point is precisely the claim
 *    this product may not make, and it would ship green.
 *  - the two are separated by a jsonb column and a network boundary. A replayed
 *    or later-read generation arrives as `unknown`, and a projection is a place
 *    a field goes missing.
 *
 * R18 (slice 7) IS WHY THIS MATTERS ON SIX MODES RATHER THAN ONE: "why this
 * performs names the weakest point on EVERY mode, not just the two where it was
 * easy". `whyThisPerforms` is in `UNIVERSAL_SECTIONS`, so every mode's document
 * carries it — and `generation-outcome.tsx` renders every mode through THIS
 * function, which is what makes the requirement a screen property rather than a
 * schema one.
 *
 * SO THE REASONING IS WITHHELD, NOT SHOWN ALONE. Rendering the confident half
 * of a pair whose honest half is missing is worse than rendering neither, and
 * that is the whole content of the false branch. `tests/studio-ui.test.tsx`
 * DRIVES it — CLAUDE.md, 2026-08-26: a required parameter with no default reads
 * exactly like a guard and is not one until a test drives its false branch.
 */
export type WhyThisPerformsView =
  | { ok: true; reasoning: string; weakestPoint: string }
  | { ok: false; note: string };

export function whyThisPerformsView(section: {
  reasoning: string;
  weakestPoint: string;
}): WhyThisPerformsView {
  if (section.weakestPoint.trim().length === 0) {
    return {
      ok: false,
      note: "This draft came back without naming its own weakest point, so the reasoning that went with it is not shown. Every explanation this product gives names the part it is least sure of; one that does not is withheld rather than shown as if it were complete.",
    };
  }
  return {
    ok: true,
    reasoning: section.reasoning,
    weakestPoint: section.weakestPoint,
  };
}

/**
 * The offer beside an untraceable specific (R19).
 *
 * ADDITIVE AND NOTHING ELSE. The product flags and offers `[check]`; it never
 * edits the creator's draft, because the scan is a recall control with known
 * false positives and deleting on one corrupts a script. This function builds
 * the SUGGESTION a creator may copy; the draft above it is rendered untouched,
 * and `tests/studio-ui.test.tsx` asserts the flagged token still appears in the
 * rendered draft byte for byte.
 */
export const CHECK_MARKER = "[check]";

export function checkOffer(token: string): string {
  return `${token} ${CHECK_MARKER}`;
}

/**
 * REQ-I04 / REQ-I05's fifth deterministic rule, ON THE SCREEN.
 *
 * WHY THIS EXISTS AT ALL: `runKillTest` now scans the model's own text for
 * performance forecasts, certainty promises and concealment advice, and stores
 * EVERY finding on `killTest.*Attempt.claims` — hard-enforced or flag-only.
 * The hard ones reach a creator through the refusal's `why`; the flag-level
 * ones reached nobody. A concealment sentence in the disclosure guidance was
 * being detected, recorded, and never shown, which is inventory rather than a
 * control (Definition of Done, reachability).
 *
 * WHY SHOWING THE PHRASE IS HONEST RATHER THAN A CLAIM. A `flag` finding sits
 * in text the creator is already reading — the hook, the disclosure — because
 * `HARD_CLAIM_FIELD_PREFIXES` covers `/whyThisPerforms/` and `/disclosure/`.
 * Hard findings refuse the draft; a shown flag remains a finding the creator
 * can inspect. Quoting a
 * line to say "this is a claim we cannot back" adds no word to the page that
 * was not already on it, and labelling it is the opposite of making it.
 */
export function claimsHeading(
  // STRUCTURAL, NOT `ClaimFlag`: this file imports NOTHING (see the header —
  // one import here can pull a Postgres driver into the client bundle), and a
  // structural parameter accepts `ClaimFlag[]` without naming its module.
  claims: readonly { enforcement: "hard" | "flag"; field: string }[]
): string {
  // LINES ARE FIELDS, NOT FINDINGS — the same correction `honestRefusal`
  // (`packages/modes/src/kill-test.ts`) made to its "N places", and it is here
  // for the same reason one level up. The counts used to be taken at the call
  // site as `claims.filter(...).length`, so ONE sentence matching TWO shapes
  // read to the creator as "2 lines". That was already reachable — two
  // forecasts in one sentence — and the fifth rule's shape list makes it
  // ordinary, since a single line can carry two concealment or two performance
  // shapes at once. Sending someone to look for a second line that does not
  // exist is the same defect as a refusal that misdescribes where it fired.
  //
  // COUNTED HERE RATHER THAN BY THE CALLER, so the wrong count is not something
  // a call site can reintroduce: the function that writes the noun is the
  // function that counts it.
  const distinctFields = (enforcement: "hard" | "flag"): number =>
    new Set(
      claims.filter((c) => c.enforcement === enforcement).map((c) => c.field)
    ).size;
  const hard = distinctFields("hard");
  const flagged = distinctFields("flag");
  const parts: string[] = [];
  if (hard > 0) {
    parts.push(
      `${hard} ${hard === 1 ? "line" : "lines"} in the explanation made a claim this product may not make, which is what the draft was stopped over`
    );
  }
  if (flagged > 0) {
    parts.push(
      `${flagged} ${flagged === 1 ? "line" : "lines"} in this draft ${flagged === 1 ? "makes" : "make"} a claim this product cannot stand behind`
    );
  }
  if (parts.length === 0) return "";
  return `${parts.join("; ")}. Nothing was changed in your draft — these are yours to keep or to cut.`;
}

/**
 * What one claim family IS, in the product's own words.
 *
 * NOT A COPY OF `@respin/modes`' `REMEDIES`. Those are the sentences the model
 * is told what to do instead, carried on a hard-rule finding; these say what the
 * flagged line is, to the person reading it. A second copy of the remedy text
 * here would be a description of a control maintained apart from the control —
 * the rule this screen already obeys for `TRACEABILITY_LIMIT_NOTE`.
 *
 * AN UNKNOWN FAMILY GETS THE NEUTRAL SENTENCE, never an invented one: a family
 * added in `@respin/modes` must show as something rather than vanish, and
 * `tests/studio-ui.test.tsx` asserts the three known ones are covered so a new
 * one is a visible gap rather than a silent fallback.
 */
export function claimFamilyNote(family: string): string {
  if (family === "performance") {
    return "a claim about how the post will do once it is up — no result of yours has been logged, so nothing here has any evidence for it";
  }
  if (family === "certainty") {
    return "a promise that something is certain, which this product does not make about anything";
  }
  if (family === "concealment") {
    return "advice not to say a tool was involved — this product does not tell you to leave that out, and platforms and regulators are the ones who decide";
  }
  return "a claim this product cannot stand behind";
}

/**
 * How a flagged specific is introduced, BY ENFORCEMENT — never by kind.
 *
 * TWO SENTENCES BECAUSE R-64 SPLIT THE ENFORCEMENT, and the split is NOT the
 * same partition as the kinds. The first version of this function said "numbers
 * or dates" for the hard bucket and "names" for the flag one, which read like a
 * kind split and was true for exactly as long as `plain-number` was hard.
 *
 * IT IS NOT ANY MORE, and the compliance fix that changed it is the reason:
 * `traceability.ts` demoted `plain-number` to `flag` (a listicle's "The 5
 * mistakes…" was being REFUSED, and a refusal is debited), and the whole
 * `/disclosure/` traceability stays stored at flag level, but its product-written
 * guidance is not listed with creator-specific offers. The displayed flag bucket
 * therefore holds bare numbers and names from creator fields.
 *
 * The hard bucket is the shapes that are unambiguously a claim about an amount
 * or a time: `currency`, `percent`, `multiplier`, `iso-date`, `month-date`.
 */
export function traceabilityHeading(hard: number, flagged: number): string {
  if (hard === 0 && flagged === 0) {
    return "Every number, date and name outside the disclosure guidance in this draft was found in your brain or in what you typed in.";
  }
  const parts: string[] = [];
  if (hard > 0) {
    parts.push(
      `${hard} ${hard === 1 ? "amount or date is" : "amounts or dates are"} in neither your brain nor what you typed in — a price, a percentage, a multiplier or a calendar date`
    );
  }
  if (flagged > 0) {
    parts.push(
      `${flagged} other ${flagged === 1 ? "specific was" : "specifics were"} not found either — a plain number or a name, where an ordinary word can land, so these are a prompt to look, never a fault`
    );
  }
  return `${parts.join("; ")}. Nothing was changed in your draft; a ${CHECK_MARKER} marker is offered beside each one so you can decide.`;
}

/**
 * The note beside ONE flagged specific, saying why it landed in the soft bucket.
 *
 * IT KEYS ON WHAT IS ACTUALLY TRUE OF THAT FINDING, because the screen used to
 * print "(a name, not a rule violation — ordinary words land here)" beside every
 * `flag` — which became false the moment the flag bucket stopped being only
 * proper nouns. Telling a creator the number `5` is "a name" is a smaller lie
 * than a false refusal and it is still a lie on the screen that just charged
 * them.
 *
 * THREE BRANCHES, STATED AS THE POPULATION they cover (CLAUDE.md, 2026-08-29):
 * creator-field findings are soft because their shape is a `plain-number` or
 * `proper-noun`. Disclosure traceability findings are filtered before this
 * note; a kind this screen does not know falls back to neutral words. */
export function traceabilityFlagNote(kind: string): string {
  if (kind === "proper_noun") {
    return "(a name, not a rule violation — ordinary words land here)";
  }
  if (kind === "number") {
    return "(a plain number — a count, a step or an age reads the same as a claim, so this one only asks you to look)";
  }
  return "(not a rule violation — this one only asks you to look)";
}

// ---------------------------------------------------------------- revision
//
// R6/R8/R9's sentences. The mechanism is stage A's (a composite same-tenant
// `parent_id`, immutable after insert) and stage C's (`resolveRevisionParent`,
// priced as `creditCosts.revision`); what these say is what a creator needs to
// know before pressing a second paid button on a draft they already own.

/**
 * What the revise control says about what it will and will not do.
 *
 * IT SAYS THE KILL TEST RUNS AGAIN, and that is not filler: a creator's natural
 * model of "revise" is "edit", and an edit does not get re-checked. Here it
 * does — a revision is new text and a kill test is a property of text (the
 * card's question 2), so a revision can be REFUSED where its parent passed, and
 * an honest refusal is charged for. Somebody who did not know that would
 * reasonably call it a bug.
 */
export const REVISION_NOTE_HELP =
  "Say what to change. The draft above is sent back to the model along with this note, and what comes back is a new draft that goes through the same checks from scratch — a revision is never assumed to be safe because the draft it came from was. It can be refused where the first one passed, and a refusal is charged for like any other run.";

/** What a revision cannot do, said where a creator would try it. */
export const REVISION_SAME_MODE_NOTE =
  "A revision stays in the mode its draft was written in. To get a different kind of output from the same idea, start a new draft in that mode instead.";

/**
 * The label on one earlier output in the "revise this" picker.
 *
 * IT NAMES THE MODE AND THE POSITION, never a timestamp: the chain is this
 * session's (see `LINEAGE_SCOPE_NOTE`), so "3 minutes ago" would be precision
 * about something the screen is about to admit it does not durably hold.
 */
export function lineageChoiceLabel(
  index: number,
  modeLabel: string,
  note: string
): string {
  const trimmed = note.trim();
  const excerpt =
    trimmed.length === 0
      ? "no note"
      : trimmed.length > 60
        ? `${trimmed.slice(0, 57)}…`
        : trimmed;
  return `#${index + 1} · ${modeLabel} · ${excerpt}`;
}

/**
 * R9 — how one output's parentage reads, from the row's own fields.
 *
 * "WHICH OUTPUT CAME FROM WHICH, AND WHAT THE NOTE SAID" is the requirement
 * verbatim, and both halves are here: the position of the parent in the chain,
 * and the note that produced this one.
 */
export function lineageLineFor(entry: {
  index: number;
  modeLabel: string;
  parentIndex: number | null;
  note: string;
}): string {
  const note = entry.note.trim();
  const said =
    note.length === 0
      ? "No note was sent with it."
      : `What you asked for: “${note}”`;
  if (entry.parentIndex === null) {
    return `#${entry.index + 1} · ${entry.modeLabel} · a first draft, not a revision of anything. ${said}`;
  }
  return `#${entry.index + 1} · ${entry.modeLabel} · revised from #${entry.parentIndex + 1}. ${said}`;
}

/**
 * THE HONEST LIMIT OF WHAT THIS SCREEN CAN SHOW YOU (R9), and it is a real
 * limitation rather than a caveat.
 *
 * The DURABLE lineage is in the database: `generations.parent_id` is a
 * composite, same-tenant foreign key that is immutable after insert, so which
 * output came from which is a fact the product keeps. What does NOT exist yet
 * is a scoped reader for it in `@respin/db` — there is no accessor any screen
 * can call to page a creator's past generations, and building one is a
 * `packages/db` change slice 7's app stage did not make. So the chain below is
 * assembled from the runs THIS PAGE has performed since it loaded, and a reload
 * empties it while the stored lineage is untouched.
 *
 * SAYING SO IS NOT OPTIONAL. A list that looks like history and empties on
 * reload teaches a creator that the product forgot their work; naming the two
 * facts separately — the chain is stored, this view is not — is the difference
 * between a limitation and an apparent bug. The export is the durable read that
 * exists today, and it carries `parent_id` and the note.
 *
 * IT NAMES THE JSON FILE, AND THAT WORD IS LOAD-BEARING (tenancy gate,
 * 2026-09-01). An export is TWO files. The sentence used to say "your export
 * carries every draft", which is true of the JSON and FALSE of the markdown
 * projection: that one carries the brain documents and the quotes behind them
 * and no generation history at all — `EXPORT_MARKDOWN_SCOPE` in
 * `packages/db/src/export.ts` says so in its own header, which is the only
 * place it was said. The markdown is the file a creator is most likely to
 * open, so the sentence that promised the lineage was describing the file they
 * would not be reading it in.
 */
export const LINEAGE_SCOPE_NOTE =
  "This chain is what you have run on this page since it loaded, so a reload empties it. The links themselves are stored with each draft and are not lost — the JSON file in your export carries every draft, which one it was revised from, and the note you sent with it. The markdown file in the same export is your brain documents only, and says so at the top.";

// ---------------------------------------------------------------- feedback
//
// R10/R12. The screen must say what feedback DOES and DOES NOT do today, and it
// must not say the brain is learning — `tests/support/forbidden-claims.ts`
// bans `learn`, `improv` and `train` on every creator-facing surface, and this
// is the screen where that ban earns its keep: a reaction button is exactly
// where a reader forms the belief that the product is adjusting to them.

/** The heading over the reaction buttons. States the act, promises nothing. */
export const FEEDBACK_HEADING = "Tell the product what you thought";

/**
 * WHAT FEEDBACK DOES TODAY, AND WHAT IT DOES NOT — R12, in the screen's words.
 *
 * THREE CLAIMS, and the third is the one that costs something to write:
 *   1. it is RECORDED — a stored event, and it is in the creator's export;
 *   2. NOTHING reads it today. Not a rule, not a summary, not a weighting.
 *      This slice captures; deriving anything from feedback is `packages/brain`'s
 *      and `packages/brain` does not exist (R-10/R-44, R11);
 *   3. what a later slice MAY do is PROPOSE, for a person to approve — never
 *      apply. Brains are context, never weights, never silent (R-8).
 *
 * IT AVOIDS `learn`, `improve` and `train` NOT BY LUCK. Those three words are
 * banned on every creator-facing screen, and this sentence is the one place a
 * writer would reach for all three at once. What replaces them is the
 * mechanism: repeated reactions of the same kind on comparable outputs may
 * become a suggested change to a document you review.
 */
export const FEEDBACK_TODAY =
  "What you choose here is stored as a record of what you said, and it is yours — it is in your export. Nothing reads it today: it does not change your brain, it does not change the next draft, and no part of this product adjusts itself because of it. Later, repeated reactions of the same kind across comparable drafts may be turned into a suggested edit to one of your brain documents — a suggestion you read and approve or reject yourself. Nothing is ever applied to your brain without you.";

/**
 * The note ceiling, stated where it binds. The number comes from the server.
 *
 * "AS YOU TYPED IT, EXCEPT FOR..." RATHER THAN "EXACTLY AS YOU TYPE IT", which
 * is what the first draft said and which is false: `recordGenerationFeedback`
 * runs `normaliseContent` — NFC plus CRLF→LF — the one normalisation this
 * package stores text under, so two notes a person cannot tell apart are one
 * note in the column. `/onboarding`'s paste form already words it this way
 * ("stored as you typed them — only line endings are normalised"), and saying
 * less than that here would be a small false claim about a creator's own words
 * on the screen whose whole subject is what the product does with them.
 */
export function feedbackNoteLimit(max: number): string {
  return `Optional. Up to ${max} characters, stored as you typed it — only line endings and unicode form are normalised. Nothing reads it for meaning, and it goes into your export beside the reaction.`;
}

/**
 * What ONE reaction code means, to the creator pressing it.
 *
 * THE CODES ARE THE DATABASE'S, THE WORDS ARE THE SCREEN'S. `pgEnum` holds the
 * closed set (`GENERATION_FEEDBACK_REACTIONS`), which the page renders its
 * buttons from so this screen cannot offer a code the server would refuse; this
 * function turns each code into a sentence a person recognises.
 *
 * AN UNKNOWN CODE RETURNS THE CODE ITSELF rather than vanishing or inventing a
 * label — a reaction added to the enum must show as something, and a button
 * reading `used_as_is` is a visible gap where a dropped button is an invisible
 * one. `tests/studio-ui.test.tsx` asserts every code in the shipped set has
 * real words, so the fallback is a safety net rather than the normal path.
 */
export function reactionLabel(code: string): string {
  const labels: Record<string, string> = {
    used_as_is: "I used it as it is",
    used_with_edits: "I used it, after rewriting parts",
    off_voice: "It does not sound like me",
    too_generic: "It is true of anyone",
    wrong_angle: "The thesis is not the point I wanted",
    not_filmable: "I cannot actually film this",
    discarded: "I will not use it — none of the above",
  };
  return labels[code] ?? code;
}

/** What the screen says once a reaction is stored. No inference, no thanks-we-learned. */
export function feedbackRecordedSentence(
  reactionCode: string,
  noteKept: boolean
): string {
  const what = reactionLabel(reactionCode);
  const note = noteKept
    ? " Your note was stored with it, as you typed it."
    : " No note was sent with it.";
  return `Recorded: “${what}”.${note} It is in your export, and nothing in the product has changed because of it.`;
}
