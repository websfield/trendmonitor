// The metered run's sentences, as PURE functions with no value imports.
//
// WHY THEY ARE NOT IN `./copy.ts` WITH THE REST. These two are rendered by
// `run-outcome.tsx`, which is client code, and `copy.ts` imports
// `../billing-errors` for its refusal table — which imports
// `@respin/credits/app-server`, which reaches `@respin/db` and therefore `pg`.
// Putting them there compiled and tested green and broke `next build` with
// "Module not found: Can't resolve 'dns'/'net'", because the client bundle had
// been handed a Postgres driver. The import graph is the boundary; a file with
// no value imports cannot cross it.
//
// R18: THE BUTTON SAYS WHAT IT WILL SPEND BEFORE IT SPENDS IT. These are pure
// functions for the same reason every other decision on this screen is: a
// sentence about money assembled inline in a component is a sentence no test
// drives.
import type { AssemblyKind } from "@respin/credits/app-server";

export const ASSEMBLY_KIND_COPY: Readonly<Record<AssemblyKind, string>> = {
  no_fields_supplied:
    "The product prepared no voice checks before the run. Nothing was sent to the model and nothing was spent. This is our fault; tell us so we can investigate it.",
  duplicate_post:
    "The product prepared the same saved post more than once. Nothing was sent to the model and nothing was spent. This is our fault; tell us so we can investigate it.",
  duplicate_field_request:
    "The product prepared the same voice check more than once. Nothing was sent to the model and nothing was spent. This is our fault; tell us so we can investigate it.",
  not_json: "The model reply was not readable as the required data.",
  bad_shape: "The model reply did not have the required voice-draft structure.",
  unknown_field: "The model reply included a voice section the product did not request.",
  duplicate_field: "The model reply repeated a voice section.",
  empty_values: "The model reply left a requested voice section empty.",
  single_arity: "The model reply gave multiple answers where one voice answer was required.",
  list_max: "The model reply gave more voice items than the product can review safely.",
  placeholder_with_citation: "The model reply attached evidence to an unknown voice value.",
  placeholder_in_list: "The model reply mixed an unknown voice value with stated values.",
  value_without_quote: "The model reply stated a voice value without a supporting quote.",
  post_not_supplied: "The model reply cited material that was not supplied to this run.",
  quote_not_found: "The model reply cited words that did not match the supplied post.",
  fields_unfilled: "The model reply left a requested voice section unfilled.",
};

/**
 * What the run control says BEFORE it is pressed.
 *
 * It states the RULE and the PRICES, and deliberately does not predict which of
 * the two branches this press will take. Predicting it would mean a second read
 * of the included-build claim (`firstBillableAttempt` — the same authority
 * `runInference` consults inside its debit transaction) and a prediction that
 * has gone stale between the render and the press is a wrong number about
 * money on the screen. The
 * authority is the operation; the screen states the rule it will be judged by,
 * and reports the ACTUAL charge afterwards.
 *
 * IT TAKES BOTH PRICES, AND "INCLUDED" IS A BRANCH RATHER THAN THE RULE
 * (billing gate, 2026-09-02). This sentence asserted "Your first run for a
 * creator is included" unconditionally while the page read ONE number,
 * `creditCosts.onboardingBrainRebuild`. R-82 exists because
 * `creditCosts.onboardingBrainBuild` is `z.number().int().min(0)` and not
 * `literal(0)`: under the document R-82's own test appends
 * (`onboardingBrainBuild: 25`) the creator was told their first build was free
 * and was then debited 25 — the debit correct, the sentence a frozen
 * assumption. Both numbers now come from `onboardingBrainPrices`, which is
 * `priceOf`'s two onboarding branches, so the screen states the rule it read.
 *
 * `included`, `rebuild` and `balance` are nullable for the reason the cap
 * sentence is: when the server could not read them, the screen says so rather
 * than inventing a number (non-negotiable 6).
 */
export function runCostSentence(
  included: number | null,
  rebuild: number | null,
  balance: number | null
): string {
  if (included === null || rebuild === null) {
    return "The price of a run could not be read just now, so it is not shown here. Running it still prices and checks it on the server.";
  }
  const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;
  // FOUR BRANCHES, because a document that prices two runs has four shapes and
  // only one of them is the one this product ships with: both free, first free
  // and later priced (today's), both priced the same, both priced differently.
  // This comment said THREE until 2026-09-02 (learning gate) — an unbound
  // count written by the pass that was correcting unbound counts three files
  // over, above the expression it was miscounting. It is bound now:
  // `tests/onboarding-ui.test.tsx` asserts the four shapes are four DISTINCT
  // sentences, so a branch added or merged reddens the number with the code.
  const rule =
    included === 0
      ? rebuild === 0
        ? "Runs for this creator cost nothing on this server's current settings."
        : `Your first run for a creator is included. Every run after that costs ${credits(rebuild)}.`
      : included === rebuild
        ? `Every run for a creator costs ${credits(included)}.`
        : `Your first run for a creator costs ${credits(included)}. Every run after that costs ${credits(rebuild)}.`;
  if (balance === null) return rule;
  const bal = balance === 1 ? "credit" : "credits";
  return `${rule} You have ${balance} ${bal}.`;
}

/**
 * What the screen says AFTER a run, from the operation's own return value.
 *
 * `charged` of 0 is a REAL answer here — "this was your included run" — and is
 * never rendered as "free" by absence: it is the number `runInference`
 * returned, not a row this screen failed to find.
 */
export function voiceOutcomeSentence(
  claimPositions: number,
  placeholders: number
): string {
  // NEVER A RATIO AND NEVER A PERCENTAGE (task 20). "Grounded 7 of your 12
  // posts" and "58% confident" both read as a measurement OF THE CREATOR, when
  // what is being counted is the strength of OUR evidence. Two independent
  // counts, each named for what it is.
  //
  // AND NEVER "we could not find enough in your writing", which was the first
  // draft: that is a sentence about them. The absence is ours.
  const grounded = claimPositions - placeholders;
  const rules = claimPositions === 1 ? "rule" : "rules";
  if (placeholders === 0) {
    return `We drafted ${claimPositions} ${rules} about how you write, and found a quote from your posts behind every one. Read each one and confirm it before it is used.`;
  }
  if (grounded === 0) {
    return `We drafted ${claimPositions} ${rules} about how you write, but we could not point to a quote from your posts for any of them, so every one is marked unknown. Read them and confirm them before they are used.`;
  }
  const left = placeholders === 1 ? "one is" : `${placeholders} are`;
  return `We drafted ${claimPositions} ${rules} about how you write. ${grounded} ${grounded === 1 ? "has" : "have"} a quote from your posts behind ${grounded === 1 ? "it" : "them"}; ${left} marked unknown because we could not point to one. Read each one and confirm it before it is used.`;
}

/**
 * What the panel says the press will SEND, before it is pressed.
 *
 * IT STATES THE CORPUS BOUND UNCONDITIONALLY (compliance gate round 2,
 * 2026-08-29). The previous sentence was "This sends the posts you saved
 * above", which is false the moment a creator has more posts than one
 * inference reads — the bound existed in the code (`voiceCorpusMaxPosts`) and
 * on the operation's return value, and was stated nowhere a creator could see.
 * A sentence about what leaves this server must not imply "all of it" when the
 * read is bounded.
 *
 * `corpusMax` is nullable for the reason `runCostSentence`'s numbers are: when
 * the config read failed, the screen says the bound exists and could not be
 * shown, rather than inventing a number or reverting to the unbounded claim.
 */
export function preSendSentence(corpusMax: number | null): string {
  const bound =
    corpusMax === null
      ? "your most recent posts saved above (there is a ceiling on how many one run reads; it could not be shown just now)"
      : `your posts saved above — the most recent ${corpusMax} at most —`;
  // "…each one quoting the post it came from" was CORRECTED (compliance gate
  // round 3, 2026-08-29): a rule the model could not ground carries no quote —
  // it renders as a named unknown — so the unconditional "each one" was false
  // on exactly the branch the sibling absence copy exists for.
  return `This sends ${bound} to our model provider and comes back with a draft set of rules describing how you write — each one shown beside the quote it came from, or marked as unknown when we cannot point to one.`;
}

/**
 * What the outcome says about the corpus AFTER a run — rendered ONLY when the
 * bound actually bound (compliance gate round 2, 2026-08-29).
 *
 * Both numbers come off the operation's own return value (`postsUsed`,
 * `postsAvailable`), never re-derived here. When everything the creator saved
 * was read, this says nothing: "read all 3 of your posts" would be noise, and
 * the pre-press sentence already stated the ceiling.
 */
export function corpusBoundSentence(
  postsUsed: number,
  postsAvailable: number
): string | null {
  if (postsAvailable <= postsUsed) return null;
  const unread = postsAvailable - postsUsed;
  return `This draft read your ${postsUsed} most recent posts. You have ${postsAvailable} saved, so the oldest ${
    unread === 1 ? "one was" : `${unread} were`
  } not read.`;
}

export function runChargeSentence(charged: number, balanceAfter: number): string {
  const bal = balanceAfter === 1 ? "credit" : "credits";
  const spent =
    charged === 0
      ? "That was your included run for this creator, so nothing was spent."
      : `That cost ${charged} ${charged === 1 ? "credit" : "credits"}.`;
  return `${spent} Your balance is now ${balanceAfter} ${bal}.`;
}
