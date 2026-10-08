// The Studio controls' sentences, as PURE functions with NO VALUE imports.
//
// SAME RULE AS `../onboarding/run-copy.ts`, and the same reason it is not in
// `./copy.ts`: these are rendered by client code, and `copy.ts` imports
// `../billing-errors` for its refusal table — which imports
// `@respin/credits/app-server`, which reaches `@respin/db` and therefore `pg`.
// A file with no value imports cannot put a Postgres driver in the client
// bundle. Its ONE import is a whole-clause `import type` (`PresentedDisclosure`,
// for `DISCLOSURE_LINE`), which is erased before bundling — a mixed
// `import { type X, y }` clause would not be, and
// `tests/client-bundle-boundary.test.ts` counts it as a value import.
import type { PresentedDisclosure } from "@respin/credits/app-server";
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
 * This file keeps its imports to the one erased type `DISCLOSURE_LINE` needs
 * (see the header), so it does not name the facade's type. A structural
 * parameter accepts `ModeOffer & { cost }` without naming its module, which is
 * the same trick `claimsHeading` already uses below.
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
  /**
   * Whether this mode takes the creative form control (R-148) — the facade's
   * `ModeOffer.takesCreativeForm`, resolved server-side. This file names no
   * mode; it only reads the flag the server set.
   *
   * OPTIONAL, AND ABSENT READS AS "NO CONTROL" — the direction that offers
   * less. The page always sets it from `modeOffers`; a view fixture that omits
   * it renders the legacy form, and the operation is the gate either way.
   */
  takesCreativeForm?: boolean;
};

/** One creative form choice as the screen receives it — id and label, server-resolved. */
export type FormOptionView = { id: string; label: string };

/** The bounds the form's inputs advertise, server-resolved from the parse's own. */
export type CreativeBoundsView = {
  itemMaxCodePoints: number;
  listMax: number;
  footageMaxCodePoints: number;
  minutesMin: number;
  minutesMax: number;
};

// --------------------------------------------- the creative form (R-148)

export const FORM_CONTROL_LEGEND = "What kind of piece is it?";

/**
 * Shown beside BOTH modes that take the control (`ideation` and
 * `ideaToScript`, R-148), so it names both outcomes: a set of ideas gets a
 * form per idea, a script gets one (audit P6-A4; it used to say "for each
 * idea" on the script path too).
 */
export const FORM_CONTROL_HELP =
  "Choose for me lets the draft pick from the three forms listed: one per idea when you ask for ideas, one for the whole script when you ask for a script. Every option costs the same as the mode itself: choosing a form adds no charge and no extra step.";

export const FILMING_LIMITS_SUMMARY = "Filming limits (optional)";

/**
 * WHAT THE FILMING CHECK COVERS, AND THAT IT CAN MISS (audit P6-A4). The
 * sentence it replaced said "any place or piece of kit" the draft needs is
 * marked; `mode-checks.ts`' recorded limits say otherwise: kit or help in a
 * shot-map line is read through two literal marker lists
 * (`shot-map-kit-not-in-list`), and kit named only in the story or a beat is
 * not compared at all (`kit-named-in-narrative`).
 */
export const FILMING_LIMITS_HELP =
  "Who films and the time you have are binding: the draft has to fit them. Places and kit in the filming plan that you did not list here are marked [check] for you to confirm. The check reads the plan and some shot lines, not the story, so it can miss kit a shot or a beat mentions: read the shot map before you film. The footage you already have is material the draft can draw on.";

/**
 * Once per document, whenever the server's stored decisions mark any filming
 * resource or shot-map line unconfirmed (R-150 point 2).
 */
export const FILMING_UNCONFIRMED_NOTE =
  "Items marked [check] are ones you did not list: confirm you have them, or change the plan, before you film.";

/** The revision note: a revision keeps its parent's form and limits. */
export const REVISION_KEEPS_FORM_NOTE =
  "A revision keeps the form and filming limits of the draft it revises, and a draft made before forms existed keeps its original format.";

/**
 * The pivot beat, IN WORDS (PRD §46, R-148 point 2) — never by styling alone.
 * A turn and a reveal are different instructions to the person filming, so
 * they are different sentences. The legacy line is the turn's, unchanged, and
 * the reveal's is written in the same shape so the pair reads as one control;
 * that is why it keeps the legacy sentence's dash, which DESIGN.md's copy rule
 * would otherwise not use.
 */
export const PIVOT_SENTENCES: Readonly<Record<"turn" | "reveal", string>> = {
  turn: "This is the turn — where the piece changes direction.",
  reveal: "This is the reveal — where the result is shown.",
};

/** Who is needed on set, in words. */
export const PEOPLE_SENTENCES: Readonly<Record<"solo" | "with_help", string>> = {
  solo: "One person can film it alone.",
  with_help: "Needs a second person to film or appear.",
};

/** The model's own estimate, labelled as one. */
export function minutesSentence(minutes: number): string {
  return `Estimated filming time: ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/**
 * What a premise rests on (R-148 point 4), said plainly. A quote is labelled
 * as the creator's line WITH an instruction to check it supports the event —
 * the one thing the check that verified it cannot fully decide (round-1
 * compliance gate: the relatedness floor is a floor, not a meaning test).
 */
export function basisSentence(
  basis: { kind: "material"; excerpt: string } | { kind: "unconfirmed" } | { kind: "none" }
): string {
  if (basis.kind === "material") {
    return `The line of yours this rests on. Check that it supports what happens: “${basis.excerpt}”`;
  }
  if (basis.kind === "unconfirmed") {
    return "Not confirmed yet: the parts marked [check] are yours to confirm or replace before you film.";
  }
  // CLAIMS NOTHING (round-1 compliance BLOCK): this used to say the premise
  // "describes no event that needs a source", a product-authored statement
  // about text the model wrote. The checks now refuse the event shapes they
  // recognise; this sentence covers what they cannot.
  return "No source given. If this describes something that happened, or a result, mark it [check] before you film.";
}

/** A custom structure, never presented as a library framework (REQ-D02 as amended). */
export const CUSTOM_STRUCTURE_NOTE =
  "A structure of its own: not one from the framework library, and not reviewed by a curator.";

/** The confirmed document kinds this draft may draw from. */
export type ActiveBrainKind = "Voice" | "Strategy" | "Kill test";

/**
 * The model's disclosure section, as a field-pointer prefix. Findings in it —
 * traceability and claim findings alike — are stored on the generation and
 * not presented: the section itself is not shown (R-121, P1-R1), so a finding
 * would print its text as the finding's `unit`.
 */
export const DISCLOSURE_FIELD_PREFIX = "/disclosure/";

/**
 * WHAT `/studio` AND `/trends` SAY ABOUT DISCLOSURE — a product sentence keyed
 * on the facade's disclosure KIND, never the model's prose (R-121, audit
 * P1-R1). A `Record` over the kind, so a new kind is a compile error here
 * rather than a blank line on the screen.
 *
 * THE SAME WORDING AS `PRESENTED_DISCLOSURE_GUIDANCE`, which the saved pack and
 * its export render. It is declared twice only because this file is in the
 * client graph (`studio-panel.tsx`, `first-ideas-panel.tsx` and
 * `trends/spin-panel.tsx` value-import it) and that constant's module
 * value-imports `@respin/modes`. `tests/disclosure-presenters.test.ts` holds
 * the two equal key by key, so an edit to either alone is red.
 */
export const DISCLOSURE_LINE: Readonly<Record<PresentedDisclosure["kind"], string>> = {
  policy_check_required:
    "Before you post, check the platform's current rules on disclosing AI assistance and any paid partnership, and use the platform's own label where one applies. This product does not decide what those rules require.",
};

/**
 * Why the disclosure line has no traceability entries. The draft's own
 * disclosure section is not shown (`DISCLOSURE_LINE` replaces it), so nothing
 * in that section is listed or offered a `[check]`.
 */
export const DISCLOSURE_PROVENANCE =
  "The disclosure line on this draft is this product's own sentence, not the draft's and not from your material, so it has nothing to list here.";

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
  // "ON THIS PAGE", NOT "THIS PRODUCT HAS" (Phase 6 compliance gate): Studio's
  // picker omits the modes that run only from the Trends page
  // (`studioModeOffers`), so a sentence about every mode the product has would
  // be false on the one screen that renders it.
  if (parts.length === 0) return `${head} Every mode offered on this page is one of them.`;
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
 *
 * `settling` (audit Phase 8, P8-R1): the balance is the committed fold — read
 * while another transaction held the workspace's billing lock — so the sentence
 * says it may change (never that a write is in progress: a held lock proves
 * only that it is held) and that the server checks the real balance at the
 * press. It makes NO comparison against the cost: "insufficient" is decided
 * only in `generate` (the pre-call gate and the settlement's locked debit), on
 * the money path's own locked read, never on a display number.
 */
export function generateCostSentence(
  modes: readonly ModeChoiceView[],
  balance: number | null,
  settling = false
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
  if (settling) {
    return `${rule} Your balance shows ${creditWords(balance)} for now — it was read without waiting for other activity on your workspace, so it may change, and pressing the button checks it on the server before anything is spent.`;
  }
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
 * WHAT A DRAFT IS AND IS NOT BUILT FROM, AND WHETHER THIS CREATOR HAS LOGGED
 * RESULTS (R21; audit P6-R6 and register item 8; decisions R-174).
 *
 * TWO CONDITIONS, BOTH READ FROM THE SERVER, NEVER ASSUMED.
 *
 *   1. THE CREATOR'S OWN RESULT COUNT (`respinDb.countResults`, the scoped
 *      `ProfileScope.accessors.countResults`). The sentence this replaced said
 *      "No results of yours have been logged" to everyone, which was false for
 *      every creator who had used `/results` since slice 9a. Zero says none;
 *      a positive count says how many and that none of them changes a draft
 *      (R-115: nothing enters a comparison, baseline or proposal until a
 *      verified analytics connector exists, and the product holds none);
 *      `null` is a failed read and says so. A failed read NEVER falls back to
 *      the zero sentence, which would be the false claim this exists to remove.
 *   2. WHICH MODES READ RECENT WORK. The old last clause, "built from the
 *      brain you confirmed and from what you type in, and nothing else", has
 *      been false since launch L3: concept and script drafts are shown recent
 *      drafts and reactions as labelled history (R-152 (b)/(d), ratified as a
 *      T3 carve-out by R-174). The labels come from the server's own
 *      `ModeOffer.takesCreativeForm` flags, so this file names no mode, and a
 *      screen whose modes read no history says "nothing else" truthfully.
 *
 * NO `learn` STEM, NO NUMBER THE COUNT DID NOT SUPPLY. Both renderers run the
 * claims canon over the rendered screen, and `tests/support/forbidden-claims.ts`
 * holds the condition-not-wording `must` pattern for this marker.
 */
export function resultsBasisSentence(
  resultCount: number | null,
  historyModeLabels: readonly string[]
): string {
  const results =
    resultCount === null
      ? "This page could not read how many results you have logged, so it says nothing about them here."
      : resultCount === 0
        ? "Nothing here is based on how your posts have done. No results of yours have been logged, and this product is not measuring you."
        : `You have logged ${resultCount} ${resultCount === 1 ? "result. It does not change" : "results. None of them changes"} a draft: nothing you log enters any comparison, baseline or proposal this product computes until a verified analytics connector exists (this product does not hold one), and every brain change needs your approval.`;
  return `${results} ${historySentence(historyModeLabels)}`;
}

/**
 * THE RECENT-WORK CHANNEL, NAMED (R-152 (b)/(d), R-174): which drafts see
 * labelled history, that it steers and never vouches, and that a reaction can
 * be left out when it is recorded (the control appears beside it then; there
 * is no list of older reactions to leave out from). `labels` are the
 * server-resolved labels of the modes that read it; an empty list means none
 * on this screen does. "Nothing else OF YOURS": the framework library and the
 * product's own instructions are in every prompt, so the sentence is about the
 * creator's data, not about the whole prompt.
 */
export function historySentence(labels: readonly string[]): string {
  if (labels.length === 0) {
    return "A draft here is built from the brain you confirmed and from what you type in, and from nothing else of yours.";
  }
  return `A draft is built from the brain you confirmed and from what you type in. ${listOf(labels)} drafts also see some of your recent drafts and your reactions to them, as labelled history: it can steer a draft, it never counts as evidence for anything in one, and it never changes your brain. When you record a reaction to one of them, you can leave it out of future drafts.`;
}

/**
 * THE FREE CLAIM REFUSAL'S SENTENCE (owner decision 2026-10-07, R-173). The
 * owner's wording said "promised a result"; it is NEUTRAL here (billing
 * verification, same day) because a claim-only refusal can be concealment
 * advice ("skip the label") as well as a forecast or a guarantee, and the
 * sentence must be true of all three. Said exactly when
 * `GenerateResult.freeClaimRefusal` is true:
 * an honest refusal whose only cause was the claim scan, settled with no
 * ledger row. Every surface that reports a charge reads it from here.
 */
export const FREE_CLAIM_REFUSAL =
  "We stopped this draft because it made a claim this product won't make; no credits were used.";

/**
 * What the screen says AFTER a run, from the operation's own return value.
 *
 * `charged` of 0 is a REAL answer — an operator has priced this mode at zero —
 * and it is never rendered as "free" by absence: it is the number `generate`
 * returned, not a ledger row this screen failed to find. A FREE CLAIM REFUSAL
 * (R-173) is a third answer and says so in its own words.
 */
export function generateChargeSentence(charge: {
  creditsChargedNow: number;
  balanceAfter: number;
  freeClaimRefusal: boolean;
}): string {
  const { creditsChargedNow: charged, balanceAfter } = charge;
  const bal = balanceAfter === 1 ? "credit" : "credits";
  // `charged === 0` TOO: the settlement prices a free claim refusal at zero,
  // and a sentence saying "no credits were used" beside a debit would be the
  // exact lie this branch exists to prevent.
  if (charge.freeClaimRefusal && charged === 0) {
    return `${FREE_CLAIM_REFUSAL} Your balance is ${balanceAfter} ${bal}.`;
  }
  // THE LEDGER CLAUSE ONLY WHEN A ROW EXISTS (audit P3-A2): a zero-cost
  // settlement writes no `credit_ledger` row (`generate.ts` debits only when
  // the price is above zero), so "the entry is in your credit history" was a
  // pointer to nothing on every zero-priced draft.
  if (charged === 0) {
    return `Nothing was taken from your credit balance for this draft. Your balance is ${balanceAfter} ${bal}.`;
  }
  return `That cost ${charged} ${charged === 1 ? "credit" : "credits"}. Your balance is now ${balanceAfter} ${bal}. The entry is in your credit history on the usage page.`;
}

/**
 * THE THIRD OUTCOME'S NOTE (audit P3-A2): a held draft finished by this press.
 * The model was NOT called by this press — and the charge, when there is one,
 * WAS taken by it, which `generateChargeSentence` says beside this.
 */
export const HELD_SETTLED_NOTE =
  "This draft was finished from the copy the model had already written and held for you — this press called no model. The draft itself is not shown again here; open its saved recording pack to read it, copy it or export it.";

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

/**
 * THE SAVED RECORDING PACK'S ADDRESS (launch L4, R-153) — the attempt id a
 * generation settled under, encoded. Reopening it reads the stored draft and
 * never calls a model or takes a credit.
 */
export function savedPackHref(attemptId: string): string {
  return `/studio/saved/${encodeURIComponent(attemptId)}`;
}

/**
 * THE INPUT CEILING, STATED WHERE IT BINDS (audit P3-R2, register item 34).
 *
 * The number is the server-read `llm.maxInputTokens` the page hands down —
 * never a literal here. It is VISIBLE TEXT, not a `maxLength`: the attribute
 * silently truncates pasted text (`trends/paste-panel.tsx` records the rule),
 * and the server refusal, which names the part to shorten, is the control.
 * The ceiling is compared against UTF-8 bytes, so a character outside plain
 * ASCII counts for more than one — said, rather than promised away.
 */
export function inputLimitSentence(maxInputTokens: number | null): string {
  if (maxInputTokens === null) {
    return "One draft request has a size limit. A request over it is refused before anything is sent or spent, and says which part to shorten.";
  }
  return `One draft request can carry about ${maxInputTokens.toLocaleString("en-US")} characters in total — this creator's brain, the frameworks it is offered, and what you type here (accented letters and emoji count for more). A request over that is refused before anything is sent or spent, and says which part to shorten.`;
}

/**
 * HELD DRAFTS (audit P3-A4, R-157) — finished by the model, stored, not yet
 * charged. The heading is the name the refusal copy points to.
 */
export const HELD_DRAFTS_HEADING = "Held drafts";
export const HELD_DRAFTS_NOTE =
  "These drafts were written by the model but not yet added to your drafts or charged — the workspace was paused, the balance was short, or saving met a brief conflict. Finish one to store it and take its charge. Each is removed at the time shown, and nothing is charged for a draft that is removed.";
export const HELD_DRAFTS_UNAVAILABLE =
  "Held drafts could not be read just now. Reload the page to see them; nothing about them has changed.";
export const FINISH_HELD_DRAFT_LABEL = "Finish this draft";

/** When a held draft is removed, as a fixed, unambiguous UTC string. */
export function heldUntilText(heldUntilIso: string): string {
  const at = new Date(heldUntilIso);
  if (Number.isNaN(at.getTime())) return "within 24 hours of when the model answered";
  const iso = at.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** The recent-drafts list on `/studio` (launch L4): the way back to a pack. */
export const RECENT_PACKS_HEADING = "Your saved drafts";
export const RECENT_PACKS_NOTE =
  "Every finished draft is saved. Open one to read it, copy it or export it; that costs nothing.";
export const RECENT_PACKS_EMPTY = "Nothing has been saved for this creator yet.";
export const RECENT_PACKS_UNAVAILABLE =
  "Your saved drafts could not be listed just now. Reload this page to try again.";

/** The link every finished draft carries to its saved recording pack. */
export const SAVED_PACK_LINK_LABEL = "Open the saved recording pack";

/** What a replay says about the stored draft, now that it can be reopened. */
export const REPLAY_SAVED_NOTE =
  "The draft itself is not shown again here, because this press did not run anything. Open its saved recording pack to read it, copy it or export it; that costs nothing.";

/**
 * The same sentence for a re-submission that settled earlier (R14c's replay).
 * SAID ONLY ON A TRUE REPLAY (`replayed: true`) — never on a press that
 * settled a held draft, which charged (audit P3-A2). A replay of a FREE CLAIM
 * REFUSAL (R-173) was never paid for, so "already been paid for" would be false.
 */
export function replayChargeSentence(
  balanceAfter: number,
  freeClaimRefusal: boolean
): string {
  const bal = balanceAfter === 1 ? "credit" : "credits";
  if (freeClaimRefusal) {
    return `This draft had already finished, so nothing was called again. ${FREE_CLAIM_REFUSAL} Your balance is ${balanceAfter} ${bal}.`;
  }
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
 *
 * A DECLARATION, NOT AN IMPORT, AND THE REASON IS THE CLIENT BUNDLE (audit
 * Phase 2, P2-R8). This module is value-imported by `studio-panel.tsx` and
 * `first-ideas-panel.tsx`, both "use client", and
 * `tests/client-bundle-boundary.test.ts` refuses any `@respin/*` value import
 * in a client graph (`@respin/db` imports `pg`). The two consumers render in
 * different client entries with no common server parent to hand the marker
 * down, so this is the one client-safe `app/**` home of the marker, and
 * `packages/credits/tests/check-marker.test.ts` pins it EQUAL to
 * `@respin/llm`'s and `@respin/db`'s `CHECK`.
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
 * ones reached nobody, which is inventory rather than a control (Definition of
 * Done, reachability).
 *
 * WHY SHOWING THE PHRASE IS HONEST RATHER THAN A CLAIM. A shown `flag` finding
 * sits in text the creator is already reading — a hook, a beat, a caption.
 * Findings in the model's disclosure section are NOT shown: that section is
 * not on the page (R-121, audit P1-R1), so `summariseKillTest` drops them
 * before the screen's state is built, and quoting one would put the model's
 * disclosure prose back on the page as the finding's `unit`. Hard findings
 * refuse the draft; a shown flag remains a finding the creator can inspect.
 * Quoting a line to say "this is a claim we cannot back" adds no word to the
 * page that was not already on it, and labelling it is the opposite of making
 * it.
 */
export function claimsHeading(
  // STRUCTURAL, NOT `ClaimFlag`: this file takes no value imports (see the
  // header — one can pull a Postgres driver into the client bundle), and a
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
      `${hard} ${hard === 1 ? "line" : "lines"} in this draft made a claim this product may not make, which is what the draft was stopped over`
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
    // COUNT-INDEPENDENT (audit P6-R6, site 2): this note is a pure
    // `family -> string` rendered beside each flagged claim, with no count in
    // reach, so it states the R-115 precondition rather than how many results
    // this creator has logged, which it cannot know.
    return "a claim about how the post will do once it is up — nothing you have logged enters a draft's evidence until a verified analytics connector exists, so nothing here has any evidence for it";
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
 * `/disclosure/` traceability stays stored at flag level, but the model's
 * disclosure section is not shown (R-121, P1-R1), so none of its findings is
 * listed — hard or flag. The displayed flag bucket therefore holds bare numbers
 * and names from the other fields.
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
 * an honest refusal is charged for — except one caused only by a promised
 * result, which is free (R-173). Somebody who did not know that would
 * reasonably call it a bug.
 */
export const REVISION_NOTE_HELP =
  "Say what to change. The draft above is sent back to the model along with this note, and what comes back is a new draft that goes through the same checks from scratch — a revision is never assumed to be safe because the draft it came from was. It can be refused where the first one passed. A refusal is charged like any other run, except one stopped only because the draft made a claim this product won't make: that one uses no credits.";

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
 * output came from which is a fact the product keeps. Scoped readers of it now
 * exist (corrected by audit P6-A4: this said none did, which stopped being true
 * at slice 9a's `generationsNewest` and launch L4's saved pages, where each
 * draft links the draft it revises), but THIS chain does not use them: it is
 * assembled from the runs THIS PAGE has performed since it loaded, so a reload
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
 * FOUR CLAIMS, and the last two are the ones that cost something to write:
 *   1. it is RECORDED — a stored event, and it is in the creator's export;
 *   2. it does NOT change the brain. Not a rule, not a summary, not a weighting
 *      (R-10/R-44, R11);
 *   3. SINCE LAUNCH L3 (R-152) IT IS READ — the sentence this used to carry,
 *      "nothing reads it today ... it does not change the next draft", became
 *      false the day the next concept or script draft was shown recent work as
 *      LABELLED HISTORY. Reactions reach it TWO ways, and the sentence names
 *      both (L3 gate, learning Low B-L1 — it used to name only the second):
 *      every reaction on each of up to five recent drafts rides as a LABEL on
 *      that draft (`RECENT_DRAFTS_MAX`), and up to three recent reactions are
 *      also shown on their own WITH their note (`RECENT_NOTES_MAX`) — unless
 *      the note carries a hard-enforced specific shape (a date, an amount, a
 *      percentage, a multiple), whose words are then left out
 *      (`recent-context.ts`). They are shown as the creator's words about an
 *      earlier draft, never as a fact, and the draft is told not to repeat
 *      what was rejected unless a sequel is asked for. `tests/studio-ui.test.tsx`
 *      pins both numbers to the two constants;
 *   4. what MAY happen later is a PROPOSAL, for a person to approve — never an
 *      application. Brains are context, never weights, never silent (R-8).
 *   5. SINCE AUDIT P6-A1 (R-174) THE CREATOR CAN WITHDRAW ONE: "Leave this out
 *      of future drafts" stops a recorded reaction, and its note, reaching the
 *      history in point 3. It does not touch point 4's proposals, which read
 *      reactions through `promotionFeedbackInputs`.
 *
 * IT AVOIDS `learn`, `improve` and `train` NOT BY LUCK. Those three words are
 * banned on every creator-facing screen, and this sentence is the one place a
 * writer would reach for all three at once. What replaces them is the
 * mechanism: repeated reactions of the same kind on comparable outputs may
 * become a suggested change to a document you review.
 */
export const FEEDBACK_TODAY =
  "What you choose here is stored as a record of what you said, and it is yours — it is in your export. It does not change your brain. Your next concept and script drafts are shown some of your recent work as labelled history: up to five of your most relevant recent concept batches and scripts, each labelled with every reaction you recorded on it, and up to three of your most relevant recent reactions with the note you wrote — leaving out a note's words when they contain a date, an amount, a percentage or a multiple. All of it is your words about an earlier draft, never a fact about you, and those drafts are told not to repeat what you rejected unless you ask for a sequel. Once you record a reaction to a concept or script, you can leave it out of future drafts with the control that appears beside it. Later, repeated reactions of the same kind across comparable drafts may be turned into a suggested edit to one of your brain documents — a suggestion you read and approve or reject yourself. Nothing is ever applied to your brain without you.";

/**
 * The note ceiling, stated where it binds. The number comes from the server.
 *
 * IT NAMES THE NORMALISATION AND MAKES NO "AS YOU TYPED" CLAIM AT ALL. The
 * first draft said "exactly as you type it", which is false:
 * `recordGenerationFeedback` runs `normaliseContent` (NFC plus CRLF to LF),
 * the one normalisation this package stores text under, so two notes a person
 * cannot tell apart are one note in the column. The second draft said "stored
 * as you typed it, only line endings and unicode form are normalised", which
 * the audit (2026-10-05 item 45, P6-A4) read as the banned phrase with a
 * caveat after it. This one states what is changed and that nothing else is.
 */
export function feedbackNoteLimit(max: number): string {
  // LAUNCH L3 (R-152): "Nothing reads it for meaning" became false — the note
  // can be shown to the next concept or script draft as the creator's words.
  return `Optional. Up to ${max} characters. It is stored with its line endings and Unicode form made consistent and nothing else changed, goes into your export beside the reaction, and may be shown to your next concept or script drafts as your words about this one.`;
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
    ? " Your note was stored with it."
    : " No note was sent with it.";
  // LAUNCH L3 (R-152): "nothing in the product has changed" became too broad —
  // the next concept or script draft may be shown this reaction as history. What
  // stays true, and is what a creator needs to hear, is that the BRAIN did not.
  return `Recorded: “${what}”.${note} It is in your export, and your brain has not changed because of it.`;
}

// ------------------------------------------------------------------------
// AUDIT P6-A1 (R-174): "LEAVE THIS OUT OF FUTURE DRAFTS".

/** The control beside a recorded reaction. */
export const EXCLUDE_FROM_HISTORY_LABEL = "Leave this out of future drafts";

/**
 * What the control does, and what it does not. It narrows what later concept
 * and script drafts are shown (the reaction and its note, as a note and as a
 * label on its draft, and a draft whose every reaction was left out); it
 * deletes nothing, the export keeps both, the reaction still feeds feedback
 * proposals (`promotionFeedbackInputs` ignores the stamp, R-174), and it
 * cannot be undone anywhere (the stamp moves one way, migration 0069).
 */
export const EXCLUDE_FROM_HISTORY_HELP =
  "Your next concept and script drafts will not be shown this reaction or its note. It stays recorded and in your export. It can still count toward a suggested edit to your brain, which you approve or reject. Leaving it out cannot be undone.";

/** After the press. */
export const EXCLUDED_FROM_HISTORY_SENTENCE =
  "Left out: later concept and script drafts will not be shown this reaction or its note. It is still in your export.";

// ------------------------------------------------------------------------
// LAUNCH L3 (R-152): THE SEQUEL REQUEST AND "REMEMBER THIS FOR FUTURE DRAFTS".

/** The sequel checkbox's label — the creator's explicit request, never inferred. */
export const SEQUEL_LABEL = "This is a follow-up to my recent work (a sequel)";

/** What the sequel box does, and what leaving it empty does. */
export const SEQUEL_HELP =
  "Your next concept or script draft is shown a few of your recent drafts and reactions as labelled history. Left empty, it is told not to repeat them and not to bring back anything you rejected. Ticked, it may build on them — including a direction you set aside. Nothing is ticked for you.";

/** The heading over the preference box. */
export const REMEMBER_HEADING = "Remember this for future drafts";

/**
 * WHAT THE PRESS DOES, IN FULL (R-8, REQ-B02/C05): it PROPOSES; it applies
 * nothing. The words become a new rule on a proposed Kill Test version, which
 * is not in force until the creator confirms and activates it on the Brain
 * page — the same review every brain edit gets.
 */
export const REMEMBER_HELP =
  "Write the rule in your own words — how you film, or something you never want in a draft. It is added to your Kill Test as a proposed change with your words as its evidence. Nothing uses it until you confirm and activate that version on the Brain page, where you can also change or replace it later.";

/** The textarea's label. */
export const REMEMBER_LABEL = "The rule, in your words";

/**
 * The box's ceiling, stated in the help text the box is described by (L3 gate,
 * accessibility Low D-L2). The number is `BRAIN_EDIT_VALUE_MAX`, passed in by
 * the page — never typed here.
 */
export function rememberLimitSentence(max: number): string {
  return `Up to ${max} characters.`;
}

/** After the press: which version holds the proposal, and that it is not in force. */
export function rememberProposedSentence(version: number): string {
  return `Proposed as Kill Test version ${version}. It is not in force yet — confirm and activate it on the Brain page for future drafts to use it.`;
}

/**
 * After a press that wrote NOTHING because the editable version already holds
 * the same rule (L3 gate, C-L1). Whether that version is the active one or a
 * proposal decides which sentence is true.
 */
export function rememberAlreadyHeldSentence(version: number, active: boolean): string {
  return active
    ? `That rule is already in your Kill Test — version ${version}, the active version. Nothing new was saved.`
    : `That rule is already in proposed Kill Test version ${version}. Nothing new was saved. It is not in force yet — confirm and activate that version on the Brain page for future drafts to use it.`;
}

/**
 * Shown in place of the box to an editor or a viewer (L3 gate, tenancy Low
 * T-L3): proposing a brain edit is the owner's act (R-118), and the server
 * refuses anyone else, so the screen does not offer a press that can only fail.
 */
export const REMEMBER_OWNER_ONLY =
  "Only a workspace owner can propose a rule for this creator's Kill Test. Ask an owner to add it, or to change your role.";

// ------------------------------------------------------------------------
// LAUNCH L2 (R-151): THE ENTRANCES, THE CHOICE AND THE CONFIRMATION.
//
// Every sentence here is TRUE ON EVERY PATH IT RENDERS ON, and none of them
// names a mode id, a tier map or an upgrade: the price is the configured
// number the server read under the quote's own config version, and the plan
// block states what this workspace's plan does not include without selling the
// one that does (the `an upgrade as the remedy` clause this screen's honesty
// scan refuses).

export const FIND_CONCEPT_HEADING = "Find my next concept";
/**
 * WHAT IS CHECKED, IN `TRACEABILITY_LIMIT_NOTE`'S TERMS (L2 compliance gate,
 * A-2): the trace is about where a specific came from, never whether it is
 * true, and it does not read every field (`EVENT_SCAN_EXCLUDED`). No count:
 * the scaffold asks for three, and the parser accepts three to five.
 */
export const FIND_CONCEPT_HELP =
  "A few concepts drawn from what your confirmed brain says about you, the platform you pick and any filming limits. The numbers, dates and names in them are checked against your brain and what you type here — a check of where a specific came from, not of whether it is true — and it does not cover every sentence, so read each concept before you choose one. The result lists what it asks you to confirm.";
export const FIND_CONCEPT_HINT_LABEL = "Anything to steer towards (optional)";
/**
 * The ONE clarifying question, asked when the confirmed brain does not yet say
 * what the creator makes — decided by a deterministic rule on the server, never
 * by a model call.
 */
export const FIND_CONCEPT_QUESTION =
  "Your confirmed brain does not say what you make yet. In one sentence, what are your videos about?";
export const FIND_CONCEPT_SUBMIT = "Find concepts";
/**
 * What the "Find concepts" press costs (L2 billing gate, B-5): the configured
 * price of the mode `findConcept` runs, from the same server-resolved offer
 * the panel prices — never a literal. `null` = the offer was not found.
 */
export function findConceptCostSentence(offer: ModeChoiceView | null): string {
  if (offer === null || (offer.status === "available" && offer.cost === null)) {
    return "The price of finding concepts could not be read just now, so it is not shown. Pressing the button still prices and checks it on the server before anything is spent.";
  }
  if (offer.status === "not_in_plan") {
    return "Finding concepts is not part of this workspace's plan, so pressing the button is refused before anything is spent.";
  }
  return `Finding concepts costs ${creditWords(offer.cost as number)} — the configured price.`;
}
/** Announced in the polite status region when a concept batch arrives (WCAG 4.1.3). */
export const FIND_CONCEPT_DONE_STATUS = "Your concepts are ready below.";
export const DEVELOP_IDEA_HEADING = "Develop an idea I already have";
export const DEVELOP_IDEA_LABEL = "Your idea, in your own words";
export const DEVELOP_IDEA_HELP =
  "Continuing costs nothing. The next step shows the script's price before anything is written, and your words are kept exactly as you typed them.";
export const DEVELOP_IDEA_SUBMIT = "Continue to the script's price";
export const CHOOSE_CONCEPT_HEADING = "Pick one to develop";
export const CHOOSE_CONCEPT_HELP =
  "Choosing costs nothing. The next step shows what the script would cost before anything is written.";
export function chooseConceptLabel(position: number, hook: string): string {
  return `Choose concept ${position + 1}: ${hook}`;
}
export const REFERENCE_ENTRANCE_HEADING = "Break down a reference";
export const REFERENCE_ENTRANCE_HELP =
  "Paste a reference you are allowed to use and get its structure taken apart, on the trends page.";
export const REFERENCE_ENTRANCE_BLOCKED =
  "Breaking down a pasted reference is not part of this workspace's plan, so it is not offered here. Nothing has been charged.";
/**
 * The plan could not be read (L2 compliance gate, A-3): a neutral pointer,
 * never the plan block — that would state a plan fact nobody read.
 */
export const REFERENCE_ENTRANCE_UNKNOWN =
  "Breaking down a pasted reference happens on the trends page, which shows whether your plan includes it and what it costs before anything is charged.";
export const OTHER_MODES_HEADING = "Other ways to start";

export const PIECE_HEADING = "Your chosen piece";
export const PIECE_OWN_IDEA_LABEL = "Your idea";
export const PIECE_CONCEPT_LABEL = "The concept you chose";
/** The configured price, or the honest absence of one (non-negotiable 6). */
export function pieceQuoteSentence(credits: number | null, configVersion: number): string {
  if (credits === null) {
    return "The script's price could not be read right now, so none is shown; nothing will be charged without one. Reload to try again.";
  }
  return `Writing this script costs ${credits} ${credits === 1 ? "credit" : "credits"} — the configured price (config version ${configVersion}). Choosing it cost nothing.`;
}
/** The named plan block: what this plan does not include, never a sale. */
export const PIECE_PLAN_BLOCK =
  "Writing a script from a chosen piece is not part of this workspace's plan, so it cannot be written here. Choosing it cost nothing, nothing has been charged, and no model was called.";
export const PIECE_COMMISSION_SUBMIT = "Write the script";
export const PIECE_NOTE_LABEL = "Anything to add for this script (optional)";
export const PIECE_OPERATION_NOTE =
  "This press is one operation: pressing again, reloading or retrying after a lost connection does not charge you twice for it. Only New generation starts another, charged one.";
/** Announced in the polite status region when the script arrives (WCAG 4.1.3). */
export const PIECE_SCRIPT_DONE_STATUS = "Your script is ready below.";
export const PIECE_NEW_GENERATION_LABEL = "New generation";
export const PIECE_NEW_GENERATION_HELP =
  "Starts a separate script for this piece, even with the same words, and is charged as a new script when you write it.";
export const PIECE_CANCEL_LABEL = "Cancel this piece";
export const PIECE_CANCEL_HELP = "Backing out costs nothing.";
/** The status line `/studio?cancelled=1` shows, and focuses, after a cancel. */
export const PIECE_CANCELLED_STATUS = "The piece was cancelled. Nothing was charged.";
export function pieceStateSentence(state: string): string {
  if (state === "scripted") return "A script has been written for this piece.";
  if (state === "cancelled") return "This piece was cancelled. Choose a concept again to start a new one.";
  return "No script has been written for this piece yet.";
}
