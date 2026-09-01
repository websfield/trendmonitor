// The generation control's sentences, as PURE functions with NO imports at all.
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

/**
 * The mode this screen submits.
 *
 * ONE STRING, NOT A LIST. It is `hooks` because that is the mode slice 6 built
 * and because PRD §4G puts Hooks in the Free plan — the acceptance walk runs on
 * the tier that has not paid yet. A `ModeId` is a union of string literals, so
 * this value typechecks against the facade's `GenerateParams` without importing
 * `@respin/modes`, which is denied to `app/**` (R-64).
 *
 * IT LIVES IN THIS FILE AND NOT IN `./copy.ts` for the reason this file's
 * header gives: the client panel renders it, and `copy.ts` reaches `pg`.
 */
export const STUDIO_MODE = "hooks";

/** What the reader is choosing between today, said without overstating it. */
export const MODE_AVAILABILITY_NOTE =
  "Hooks is the mode with a pipeline behind it today. The other six are specified and not built; when one is, it appears here rather than in this sentence.";

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
 * What the generate control says BEFORE it is pressed.
 *
 * NO "first one is included" CLAUSE, and the difference from the voice control
 * is real rather than an inconsistency: `priceOf` prices a generation by its
 * mode EVERY time (`packages/credits/src/inference.ts`) — D-M2-2's one free
 * build per profile is a property of the onboarding brain, not of the product's
 * output. Printing the voice screen's rule here would tell a creator their
 * first draft is free and then charge them for it.
 *
 * `cost` and `balance` are nullable for the reason every other number on these
 * screens is: when the server could not read one, the screen says so rather
 * than inventing it (non-negotiable 6).
 */
export function generateCostSentence(
  cost: number | null,
  balance: number | null
): string {
  if (cost === null) {
    return "The price of a draft could not be read just now, so it is not shown here. Pressing the button still prices and checks it on the server before anything is spent.";
  }
  const plural = cost === 1 ? "credit" : "credits";
  const rule =
    cost === 0
      ? "A hook set costs nothing on this server's current settings."
      : `A hook set costs ${cost} ${plural}, every time — there is no included draft.`;
  if (balance === null) return rule;
  const bal = balance === 1 ? "credit" : "credits";
  return `${rule} You have ${balance} ${bal}.`;
}

/**
 * WHETHER THIS SLICE STREAMS, said on the screen instead of implied by a
 * spinner (the slice card leaves the choice to the developer and requires the
 * screen to say which way it went).
 *
 * IT DOES NOT STREAM. The kill test and the traceability scan both run over the
 * WHOLE parsed document — `runKillTest` takes a `ScriptOutput`, not a token
 * stream — and a rewrite replaces the draft outright, so anything shown while
 * the model was typing could be a draft the product is about to refuse. Showing
 * a creator text that then vanishes is worse than showing nothing, and the one
 * honest streaming design (stream, mark it unchecked, then finalise) is a
 * surface of its own. Deferred to slice 7, and said out loud here.
 */
export const NO_STREAM_NOTE =
  "This runs in one pass: nothing appears until the whole draft has been through the checks, and a draft that fails them is replaced once before you see anything. A part-written draft is never shown, because the product may still be about to refuse it.";

/**
 * R21's n = 0 sentence — THE ONE THIS SLICE IS MOST LIKELY TO GET WRONG.
 *
 * No result of this creator's has been logged: the results loop is slice 9, so
 * `n` is zero for everybody, always, today. Anything on this screen that hinted
 * the draft was shaped by what has worked for this person would be a claim
 * about evidence the product does not hold — which is the exact shape
 * non-negotiable 6 forbids and which nothing in the schema prevents.
 *
 * It says what the draft IS built from (the brain the creator confirmed, and
 * what they typed in), so the sentence is a statement of provenance rather than
 * an apology.
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
 * `HARD_CLAIM_FIELD_PREFIXES` is `/whyThisPerforms/` alone and a hard finding
 * refuses the draft outright, so a shown draft's claims are all soft. Quoting a
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
 * `/disclosure/` section is flag-only whatever the shape, because the product
 * wrote that guidance and the creator's corpus can never vouch for it. So the
 * flag bucket now holds bare numbers and disclosure dates as well as names —
 * and this screen would have told a creator that the number `5` was "1 name
 * that was not found". A comment claiming a property is not the property
 * (2026-07-30), and neither is a sentence: both were wrong, so both changed.
 *
 * The hard bucket is the shapes that are unambiguously a claim about an amount
 * or a time: `currency`, `percent`, `multiplier`, `iso-date`, `month-date`.
 */
export function traceabilityHeading(hard: number, flagged: number): string {
  if (hard === 0 && flagged === 0) {
    return "Every number, date and name in this draft was found in your brain or in what you typed in.";
  }
  const parts: string[] = [];
  if (hard > 0) {
    parts.push(
      `${hard} ${hard === 1 ? "amount or date is" : "amounts or dates are"} in neither your brain nor what you typed in — a price, a percentage, a multiplier or a calendar date`
    );
  }
  if (flagged > 0) {
    parts.push(
      `${flagged} other ${flagged === 1 ? "specific was" : "specifics were"} not found either — a plain number, a name, or something in the disclosure guidance, where an ordinary word can land, so these are a prompt to look, never a fault`
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
 * `enforcementFor` in `@respin/modes` flags a finding for exactly two reasons —
 * the shape is soft (`plain-number`, `proper-noun`), or the field is under a
 * flag-only prefix (`/disclosure/`) whatever the shape. The field test comes
 * FIRST because it overrides the shape. A `kind` this screen does not know
 * falls back to the neutral sentence rather than to a guess.
 */
export function traceabilityFlagNote(kind: string, field: string): string {
  if (field.startsWith("/disclosure/")) {
    return "(this is in the disclosure guidance, which the product wrote rather than you — nothing there can be traced to your material, so it is never a rule violation)";
  }
  if (kind === "proper_noun") {
    return "(a name, not a rule violation — ordinary words land here)";
  }
  if (kind === "number") {
    return "(a plain number — a count, a step or an age reads the same as a claim, so this one only asks you to look)";
  }
  return "(not a rule violation — this one only asks you to look)";
}
