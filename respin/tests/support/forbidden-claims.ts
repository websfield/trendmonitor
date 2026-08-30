// ONE canon of claims no creator-facing screen may make, read by every screen's
// honesty scan.
//
// WHY IT IS SHARED (compliance gate, 2026-08-29). `/onboarding` and `/brain`
// each grew their own list, and the two diverged in the worst possible
// direction: `/brain` banned `guarantee` and `confiden`, and `/onboarding` —
// the screen that SPENDS A CREDIT and sends a creator's writing to a vendor —
// banned neither. So "guaranteed" and "we are 80% confident" were sayable on
// the money screen with the whole suite green, on exactly the two words REQ-I04
// names. Neither list was a superset of the other.
//
// A shared canon also fixes the class rather than the instance: a screen added
// in a later slice inherits every word, instead of starting from whatever its
// author remembered.
//
// SCOPE, stated so this file is not mistaken for a style guide: these are
// claims about CAPABILITY and CERTAINTY — things the product would be asserting
// about itself or about the creator. Words that merely name what a screen does
// ("brain", "voice rules") are not here; they left `/onboarding`'s list
// deliberately in slice 3 when the screen started genuinely doing the thing,
// and the four claim-shaped bans below replaced them.

/** One forbidden claim: a label for the failure message, and its pattern. */
export type ForbiddenClaim = readonly [label: string, pattern: RegExp];

/**
 * Claims NO creator-facing screen may make, on any surface, ever.
 *
 * Every entry is a promise this product cannot keep today, and most of them it
 * is not built to keep at all:
 *
 * - `learn` / `improve` — R-8 and non-negotiable 3. A brain is CONTEXT, never
 *   weights; nothing in this product learns, and the learning loop is slice 9
 *   and beyond. `train` is the sharpest of the three and was missing from both
 *   lists: it is the single most likely word on a screen that posts a creator's
 *   corpus to a model, and it would falsify "context, never weights" outright.
 * - `accurate` / `confiden` — the product holds no accuracy or confidence
 *   number. `confidence` was withdrawn from the evidence shape entirely (C-15),
 *   so a screen showing one would be inventing it.
 * - `guarantee` — REQ-I04. Nothing here is guaranteed.
 * - `understands you` / `knows your` — a claim about comprehension that no
 *   part of this system supports.
 */
export const FORBIDDEN_CLAIMS: readonly ForbiddenClaim[] = [
  ["learn", /\blearn/],
  ["train", /\btrain(s|ed|ing)?\b/],
  ["improve", /\bimprov/],
  ["accurate", /\baccura/],
  ["confidence", /\bconfiden/],
  ["guarantee", /\bguarantee/],
  ["understands you", /\bunderstands? (you|your)/],
  ["knows your", /\bknows your\b/],
  ["we will", /\bwe will/],
];

/**
 * Additional bans for screens that do not do the thing yet.
 *
 * SEPARATE FROM THE CANON because these are true of a screen at a point in
 * TIME, not forever: `/onboarding` may not promise a script because no script
 * exists, and the day one does the ban is retired for that screen. The canon
 * above is never retired.
 */
export const NOT_BUILT_YET: readonly ForbiddenClaim[] = [
  ["generate", /\bgenerat/],
  ["script", /\bscript/],
  ["hook", /\bhook/],
  ["analyse", /\banaly/],
];

/**
 * A specimen that MUST match each claim, so the scan is proved non-vacuous per
 * word rather than as a whole.
 *
 * The failure this rules out: a typo in one pattern leaves that word sayable
 * while the suite stays green, because some OTHER pattern matched the injected
 * string. `/onboarding`'s scan already learned this once — the compliance gate
 * found a probe satisfied by two words alone (2026-08-27).
 */
export const CLAIM_SPECIMENS: Readonly<Record<string, string>> = {
  learn: "we learn your style over time",
  train: "we train a model on your posts",
  improve: "it improves with every post",
  accurate: "these rules are accurate",
  confidence: "we are 80% confident in this",
  guarantee: "results are guaranteed",
  "understands you": "the product understands your voice",
  "knows your": "it knows your audience",
  "we will": "we will do this next",
  generate: "we generate hooks for you",
  script: "your script is ready",
  hook: "ten hooks per batch",
  analyse: "we analyse your posts",
};
