// The DETERMINISTIC control on model-authored text (REQ-I04, REQ-I05).
//
// WHY THIS FILE EXISTS, in the words of the finding that caused it: REQ-I04's
// no-guarantee rule and REQ-I05's no-concealment rule were enforced ONLY BY
// PROMPT on the one text a creator actually reads. `assemble.ts`'s
// `GENERATION_SYSTEM` says "never claim reach, views, growth, or that anything
// is guaranteed" — and by this package's own R5 logic that is a BRIEF, NOT A
// GATE. Nothing checked `whyThisPerforms.reasoning`, a hook's text, or
// `disclosure.guidance`, and all three are rendered verbatim on `/studio`. A
// disclosure section reading "most people skip the label on a short like this"
// would have rendered under a **Disclosure** heading as the product's advice.
//
// SO THE RULE IS CODE, exactly like the other four: "a hard integrity rule
// decided by a model is a rule that can be talked out of firing"
// (`hard-rules.ts`). This scanner takes no callback, is not async, and names no
// scorer — `purity.test.ts` asserts all three by scanning this file.
//
// ------------------------------------------------------------------
// WHERE IT IS HARD AND WHERE IT ONLY FLAGS: THREE CEILINGS, AND A REFUSAL
// NEEDS ALL THREE TO ALLOW IT.
//
//   THE FIELD (`HARD_CLAIM_FIELD_PREFIXES`) — `/whyThisPerforms/` is the
//   section whose whole job is to explain the draft, so a forecast there is the
//   product asserting it (REQ-I04). `/disclosure/` is the section rendered
//   under a **Disclosure** heading as the product's advice, so concealment
//   advice there is REQ-I05's own case. Everywhere else a claim is `flag` — a
//   hook the creator wrote the input for may legitimately use the word "views",
//   and refusing a draft over it would charge them a credit (slice card
//   question 4) for a word rather than a claim.
//
//   THE SHAPE (`OutputClaimShape.enforcement`) — a pattern may only refuse if
//   it carries a PREDICATE. A bare noun or adjective is a word, not a claim.
//
//   THE CONTEXT (`CLAIM_CONTEXT_GUARDS`) — the same phrase inverted by the
//   words around it. "Skip the label" and "never skip the label" are opposite
//   instructions built from one string, and these patterns are negation-blind
//   by construction. A guard DEMOTES to `flag`; it never deletes a finding.
//
// WHY `/disclosure/` IS HARD HERE AND FLAG-ONLY IN `traceability.ts`, because
// the two lists disagreeing about one section looks like a mistake and is not.
// `FLAG_ONLY_FIELD_PREFIXES` demotes SPECIFICS in disclosure because that text
// is the product's answer about a platform's policy and is untraceable to the
// creator's corpus by construction (R-68). This rule is about the OPPOSITE
// property of the same text: whether the advice tells a viewer's creator to
// hide something. Untraceable-by-construction is a reason not to refuse over a
// step number; it is not a reason to publish "nobody needs to know".
//
// MEASURED, and it is what made this file's own opening paragraph false until
// this pass: with `/whyThisPerforms/` as the sole hard field, all seven
// concealment shapes were `hard` at the shape level and `flag` on the ONLY
// field they will ever land on. The pipeline returned `status: usable`,
// `hardRules: []`, and displayed "Most people skip the label on a short like
// this, and nobody needs to know a tool helped." under the Disclosure heading —
// the exact sentence quoted eleven lines above as the reason this file exists.
// The hard half of the concealment family had no live path at all.
// ------------------------------------------------------------------
//
// THE VOCABULARY IS DEFINED HERE, NOT IMPORTED FROM `tests/`. `packages/modes`
// must not import from the test tree, so the `performance` family below is a
// DELIBERATE COPY of `tests/support/forbidden-claims.ts`'s `PERFORMANCE_CLAIMS`
// — same ids, same pattern sources, in the same order. Two lists that must
// agree are the divergence this repo has already shipped once (`/brain` banned
// `guarantee`, `/onboarding` did not), so the agreement is asserted rather than
// intended: `kill-test.test.ts` compares the two by id AND by pattern source,
// and a test in `tests/` does the same from the other side.
//
// EVERY PATTERN IS A LITERAL and every shape carries a `specimen` a test
// asserts it matches (CLAUDE.md, 2026-08-21): a scan reporting no findings is
// otherwise indistinguishable from a scan that is not working.
import { excerpt, lines, sentenceUnits, type TextUnit } from "./text";

/**
 * Which promise a shape is about.
 *
 * `performance` — how the post will DO once it is posted. The product has
 * logged no result of this creator's (n = 0 until slice 9), so every one of
 * these is a claim about a future it holds no evidence about.
 *
 * `certainty` — REQ-I04's own word. `guarantee` is in the repo's shared canon
 * (`FORBIDDEN_CLAIMS`) rather than in `PERFORMANCE_CLAIMS`, so it is a family
 * of its own here rather than smuggled into the performance list, which has to
 * stay id-for-id identical to the canon's.
 *
 * `concealment` — REQ-I05. This half has no canon anywhere in the repo, because
 * until this slice nothing generated a disclosure section for a creator to
 * read.
 */
export type ClaimFamily = "performance" | "certainty" | "concealment";

/** Whether a claim finding may refuse a generation, or only flag it. */
export type ClaimEnforcement = "hard" | "flag";

export type OutputClaimShape = {
  /**
   * THE CEILING this shape may reach — never the enforcement on its own.
   * `enforcementFor` takes the lower of this and what the FIELD allows.
   *
   * "hard" is only for a shape whose PATTERN CARRIES A PREDICATE: a verb
   * ("will perform", "outperform", "blow up", "skip the label"), a comparative
   * ("more reach"), or an assertion of certainty ("guarantee", "cannot fail").
   * Those are claims however you finish the sentence.
   *
   * "flag" is for a BARE NOUN OR ADJECTIVE — `views`, `engagement`, `viral`.
   * A word is not a claim, and the same reasoning that demoted `plain-number`
   * applies with more force here, because the section this rule is hard on is
   * the one REQ-I04 asks to be honest: "Nothing here has been checked against
   * how your views actually behave" is the product doing exactly what it is
   * told to do, and it was REFUSED — measured, `drafts: 2`, and a refusal is
   * debited. So is "Nothing here makes it go viral". A bare metric noun in an
   * honest weakest point is the likely case, not the exotic one.
   *
   * A forecast BUILT from one of those nouns is still caught, because the
   * predicate is what the other shapes match: "this will perform", "it gets
   * more reach", "it is going to blow up".
   */
  enforcement: ClaimEnforcement;
  /**
   * The discriminator a test plants — and, for the `performance` family, the
   * LABEL `PERFORMANCE_CLAIMS` uses, so the two lists can be compared by id.
   */
  id: string;
  family: ClaimFamily;
  /**
   * Matched against LOWERCASED text, which is how the repo's canon is used
   * everywhere else (`pattern.test(copy.toLowerCase())`) — so these sources can
   * be compared with the canon's byte for byte.
   */
  pattern: RegExp;
  specimen: string;
};

/**
 * ==========================================================================
 * WHAT THIS VOCABULARY IS, AND WHAT IT IS NOT — a stated limit, in the shape
 * `tests/profile-cage.test.ts` uses for `COVERED_PARAM_SHAPES` (owner
 * decision, 2026-09-01).
 *
 * IT IS A RECALL AID WITH KNOWN GAPS, NOT A COMPLETE CONTROL. It is a list of
 * strings, and REQ-I04 and REQ-I05 are about meaning. Three review rounds each
 * found new strings and each addition created new false-positive surface, so
 * this is recorded as a limit rather than treated as a defect to be tuned away
 * round by round: the list converges on nobody's definition of finished.
 *
 * A SENTENCE THAT CARRIES NO SHAPE BELOW IS NOT THEREBY HONEST. "No finding"
 * means "no listed string matched" and nothing more. `KNOWN_VOCABULARY_GAPS`
 * names classes it is measured NOT to catch, each pinned by a test, so the
 * limit is a measured fact rather than an impression — and so a later slice
 * that closes one of them turns a test red rather than quietly widening a
 * claim nobody re-read.
 *
 * THE CONTROLS ARE STRUCTURAL, AND THIS SUPPLEMENTS THEM. What actually holds
 * REQ-I03/I04/I05 up is deterministic and shape-based rather than lexical: the
 * hard rules in `hard-rules.ts` (fragment triads, antithesis, hook length), the
 * traceability scan in `traceability.ts` (every specific is matched against the
 * creator's own corpus, so an INVENTED number is caught whatever words surround
 * it), the `[check]` placeholder contract, and the schema's requirement that
 * every mode emit `whyThisPerforms` and `disclosure` at all. This file adds a
 * fifth rule over the vocabulary those cannot see; it is not the floor.
 *
 * REVISIT TRIGGER: a measured claim reaching a creator through a class not in
 * `KNOWN_VOCABULARY_GAPS` — that is a gap this limit did not predict, and it
 * is the signal to change the MECHANISM (a classifier with its own gate, a
 * corpus-relative check) rather than to add a fourteenth string.
 * ==========================================================================
 *
 * The vocabulary, in three families.
 *
 * ORDER IS NOT LOAD-BEARING (unlike `SPECIFIC_SHAPES`): a sentence may break
 * two of these at once and both are worth naming, so nothing here consumes a
 * span.
 */
export const OUTPUT_CLAIM_SHAPES: readonly OutputClaimShape[] = [
  // --- performance: copied id-for-id from `PERFORMANCE_CLAIMS`. Three of them
  //     are bare nouns and adjectives and can only ever flag; the rest carry a
  //     predicate and may refuse in `whyThisPerforms`.
  {
    id: "viral",
    enforcement: "flag",
    family: "performance",
    pattern: /\bviral|\bvirality/,
    specimen: "this hook goes viral",
  },
  {
    // THE PREDICATE VIRALITY WAS MISSING ENTIRELY, and that is what made
    // `viral`'s demotion (R-68) wider than the reasoning behind it. R20 names
    // "reach, performance and virality"; `reach` and `performance` each kept a
    // PREDICATE shape beside their bare noun (`more reach`, `will perform`),
    // and virality took the demotion with no promotion to complete it — so
    // "This hook goes viral because the opening is a cost nobody expects."
    // returned `usable`, `hardRules: []` and rendered. Measured, on the real
    // pipeline. The bare word stays `flag`; the forecast built from it refuses,
    // which is exactly what R-68 said the other two nouns already did.
    id: "goes viral",
    enforcement: "hard",
    family: "performance",
    pattern: /\b(go(es|ing)?|went|will go|gonna go)\s+viral\b/,
    specimen: "this hook goes viral",
  },
  {
    id: "views",
    enforcement: "flag",
    family: "performance",
    pattern: /\bviews\b/,
    specimen: "expect more views on this one",
  },
  {
    id: "engagement",
    enforcement: "flag",
    family: "performance",
    pattern: /\bengagement\b/,
    specimen: "this lifts engagement",
  },
  {
    id: "more reach",
    enforcement: "hard",
    family: "performance",
    pattern: /\b(more|wider|bigger|larger|extra|higher) reach\b/,
    specimen: "this one gets more reach",
  },
  {
    id: "reach an audience",
    enforcement: "hard",
    family: "performance",
    pattern:
      /\breach(es|ing)? (a |an |your |the )?(wider |bigger |larger |new |whole |right )?(audience|following|viewers)\b/,
    specimen: "this will reach a wider audience",
  },
  {
    id: "will perform",
    enforcement: "hard",
    family: "performance",
    pattern: /\bwill perform/,
    specimen: "this draft will perform well",
  },
  {
    id: "outperform",
    enforcement: "hard",
    family: "performance",
    pattern: /\boutperform/,
    specimen: "it outperforms your last post",
  },
  {
    id: "blow up",
    enforcement: "hard",
    family: "performance",
    pattern: /\bblow(s|ing)? up\b/,
    specimen: "this one is going to blow up",
  },

  // --- performance, the OWN-BASELINE half. Everything above is a claim about
  //     the world; these five are PRD §5 metric 2 — "better than what you were
  //     doing" — stated as fact at n = 0, which is the exact direction R-10
  //     forbids. Not one of them fired before this pass: measured in
  //     `/whyThisPerforms/reasoning`, "This beats your baseline.", "This
  //     performs better than your last three posts.", "It is proven to work for
  //     this audience." and "Your best-performing hook shape is this one." each
  //     returned NO FINDING AT ALL, so nothing was shown and nothing stored.
  //
  //     THE SHAPES WERE ALREADY WRITTEN, and that is why this is a population
  //     defect rather than vocabulary tuning (CLAUDE.md, 2026-08-29):
  //     `tests/studio-ui.test.tsx` enforces `\bproven to\b`,
  //     `\bbest[- ]performing\b` and `\bwill (get|do|land|hit|work)\b` on the
  //     product's STATIC copy. One vocabulary, two enforcement points, and the
  //     model-authored one — the only text that is not written by a person and
  //     reviewed — was the one missing them.
  {
    id: "beats your baseline",
    enforcement: "hard",
    family: "performance",
    pattern: /\bbeat(s|ing)? (your|my|our|their|the) (baseline|average|numbers|usual|best)\b/,
    specimen: "this beats your baseline",
  },
  {
    id: "better than your last",
    enforcement: "hard",
    family: "performance",
    // The COMPARATIVE against the creator's own history, which is the sentence
    // the learning loop is not built to support until results exist (slice 9).
    pattern:
      /\b(perform(s|ed|ing)?|do(es)?|did|work(s|ed)?|land(s|ed)?|hit(s)?) better than (your|my|our|their|the)\b/,
    specimen: "this performs better than your last three posts",
  },
  {
    id: "best-performing",
    enforcement: "hard",
    family: "performance",
    pattern: /\bbest[- ]performing\b/,
    specimen: "your best-performing hook shape is this one",
  },
  {
    id: "more views",
    enforcement: "hard",
    family: "performance",
    // `more reach`'s sibling, and named for the likeliest of its metrics. The
    // bare nouns stay `flag`; the COMPARATIVE built from one is the predicate,
    // exactly as `more reach` is.
    pattern: /\bmore (views|engagement|followers|saves|shares|comments)\b/,
    specimen: "this will get you more views than your last post",
  },
  {
    // Filed under `performance` rather than `certainty` because what it asserts
    // is EVIDENCE about how content does — the thing this product holds none of
    // at n = 0 — and because the canon's `PERFORMANCE_CLAIMS` is the list that
    // has to stay id-for-id identical to this family (see the header).
    id: "proven to",
    enforcement: "hard",
    family: "performance",
    pattern: /\bproven to\b/,
    specimen: "it is proven to work for this audience",
  },

  // --- certainty: REQ-I04. `guarantee` is `FORBIDDEN_CLAIMS`' own entry,
  //     pattern source included, so the two agree here too.
  {
    id: "guarantee",
    enforcement: "hard",
    family: "certainty",
    pattern: /\bguarantee/,
    specimen: "results are guaranteed",
  },
  {
    id: "cannot fail",
    enforcement: "hard",
    family: "certainty",
    pattern: /\bcan(no|['’])?t (fail|miss|lose)\b/,
    specimen: "this one can't miss",
  },

  // --- concealment: REQ-I05. The section this protects is `disclosure`, whose
  //     guidance is rendered under a heading that makes it the product's advice.
  {
    id: "skip the label",
    enforcement: "hard",
    family: "concealment",
    pattern: /\bskip(s|ping|ped)? (the |a |any |your )?(label|disclosure|disclaimer|tag|credit)\b/,
    specimen: "most people skip the label on a short like this",
  },
  {
    id: "no need to disclose",
    enforcement: "hard",
    family: "concealment",
    pattern: /\b(no|not) (need|necessary|required) to (disclose|declare|mention|label|tag)\b/,
    specimen: "there is no need to disclose this one",
  },
  {
    id: "disclosure is optional",
    enforcement: "hard",
    family: "concealment",
    pattern:
      /\b(disclosure|disclosing|the label|labelling|labeling) is (optional|not required|unnecessary|not needed)\b/,
    specimen: "disclosure is optional here",
  },
  {
    id: "do not mention",
    enforcement: "hard",
    family: "concealment",
    pattern: /\b(do|does|did)(n['’]?t| not) (mention|say|tell|reveal|admit|disclose)\b/,
    specimen: "don't mention that a tool helped",
  },
  {
    id: "nobody needs to know",
    enforcement: "hard",
    family: "concealment",
    pattern: /\b(nobody|no one) (needs|has|needs to|ever needs) to know\b/,
    specimen: "nobody needs to know how this was made",
  },
  {
    id: "leave it out",
    enforcement: "hard",
    family: "concealment",
    pattern: /\bleave (it|that|this|the label|the disclosure|the tag) out\b/,
    specimen: "leave it out of the caption",
  },
  {
    id: "hide that a tool made it",
    enforcement: "hard",
    family: "concealment",
    pattern: /\bhid(e|es|ing) (the fact|that (a |an )?(tool|ai|model|it was))\b/,
    specimen: "hide the fact a tool wrote it",
  },
];

/**
 * The classes this vocabulary is MEASURED not to answer — the limit stated
 * above, as data a test drives rather than as a paragraph.
 *
 * `direction` says which way each one errs, because both directions are real
 * and they cost different things: a `miss` is a claim that ships, a
 * `false-fire` is a refusal a creator is charged for.
 *
 * EVERY ENTRY IS PINNED BY A TEST in `claims.test.ts`, which asserts the
 * behaviour recorded here is the behaviour the scan actually has. So closing
 * one of these later is a RED TEST and a deliberate edit, never a silent
 * widening — and a reader who wants to know what "no finding" is worth has a
 * list rather than an assurance.
 */
export type VocabularyLimit = {
  id: string;
  /** `miss` — a real claim no shape catches. `false-fire` — an honest sentence one does. */
  direction: "miss" | "false-fire";
  /** The pointer that makes the case live: a flag-only field proves nothing. */
  field: string;
  sentence: string;
  why: string;
};

export const KNOWN_VOCABULARY_GAPS: readonly VocabularyLimit[] = [
  {
    id: "concealment by negating a disclosure verb",
    direction: "miss",
    field: "/disclosure/guidance",
    sentence: "Never tell them a tool helped.",
    why: "The concealment shapes name AVOIDANCE verbs (skip, leave out, hide). Concealment written as a prohibition on a DISCLOSURE verb is the same instruction with the negation moved, and the third ceiling reads a leading `never` as the honest direction — which is what makes this the exact class the guard cannot also cover.",
  },
  {
    id: "a forecast in slang or metaphor",
    direction: "miss",
    field: "/whyThisPerforms/reasoning",
    sentence: "This one is going to do numbers.",
    why: "A forecast needs no listed noun to be a forecast. There is no bounded list of the ways a model can say a post will do well.",
  },
  {
    id: "an own-baseline comparative with none of the listed verbs",
    direction: "miss",
    field: "/whyThisPerforms/reasoning",
    sentence: "You have never had a hook this strong.",
    why: "PRD §5 metric 2 stated as fact at n = 0, with no comparative verb and no metric noun in it. The five own-baseline shapes are the phrasings that were measured, not the class.",
  },
  {
    id: "a misspelling",
    direction: "miss",
    field: "/whyThisPerforms/reasoning",
    sentence: "This is garanteed to land.",
    why: "Every pattern is a literal. One transposed letter is a different string, and a fuzzy matcher would trade this miss for false refusals on ordinary words.",
  },
  {
    id: "a MENTION rather than a USE",
    direction: "false-fire",
    field: "/whyThisPerforms/reasoning",
    sentence:
      "The brief says the method is proven to work; this draft does not repeat that.",
    why: "The scan reads strings, not speech acts: quoting a claim to disown it carries the same string as making it. The cost is one refusal, and the sentence is rare in a section whose job is to explain the draft — but it is a cost, so it is named rather than discovered.",
  },
];

/**
 * The fields where a claim REFUSES rather than flags, as a LIST of pointer
 * prefixes.
 *
 * A POPULATION, NOT A PATH (CLAUDE.md, 2026-08-29). `/whyThisPerforms/` is the
 * section whose job is to explain the draft, so a forecast there is the product
 * asserting one — REQ-I04's exact case, and `output.ts` requires the section of
 * every mode, so this prefix is never absent.
 *
 * `/disclosure/` IS THE SECOND, AND ITS ABSENCE WAS THE BLOCK. Every
 * concealment shape is `hard` at the shape level and `/disclosure/guidance` is
 * the only field concealment vocabulary will ever land on, so with one prefix
 * in this list the whole family collapsed to `flag` on its only live path — a
 * hard rule witnessed solely by a synthetic `whyThisPerforms` fixture, which is
 * the vacuous-witness shape (CLAUDE.md, 2026-08-21). REQ-I05 / S5 is a release
 * gate: disclosure guidance is platform-appropriate and NEVER advises
 * concealment. `output.ts` requires this section of every mode too, so this
 * prefix is never absent either.
 *
 * A third hard field is a line here, taken deliberately.
 */
export const HARD_CLAIM_FIELD_PREFIXES: readonly string[] = [
  "/whyThisPerforms/",
  "/disclosure/",
];

/**
 * THE THIRD CEILING: the same string, inverted by the words around it.
 *
 * WHY IT EXISTS, MEASURED. Promoting `/disclosure/` to a hard field without
 * this made three of seven honest guidance sentences refuse a generation — and
 * question 4's table DEBITS a refusal, so a creator would pay a credit for the
 * product telling them, correctly, to label their video:
 *
 *   "Do not leave the label out of the caption."
 *   "Never skip the label on a short like this."
 *   "There is no need to disclose sponsorship here, but you must tag AI
 *    assistance."
 *
 * Every pattern above is NEGATION-BLIND: "skip the label" and "never skip the
 * label" are opposite instructions built from one string, and no list of
 * strings can tell them apart. So the guard is about the words the pattern did
 * not match.
 *
 * IT DEMOTES, IT NEVER DELETES, and that direction is R-68's own, in R-68's own
 * words: "a flagged claim is still recorded and surfaced rather than silently
 * allowed". A guard that removed the finding would make a misfiring guard
 * indistinguishable from a clean sentence; a guard that demotes leaves the line
 * quoted on screen and stored in the kill-test result, and only takes away the
 * refusal and its charge. The honest sentences above therefore behave EXACTLY
 * as they do in the shipped build — flag, no refusal, no debit — and the
 * concealment sentences move from flag to hard, which is the whole change.
 *
 * ITS COST, STATED: a sentence that both advises concealment and instructs
 * disclosure ("Nobody needs to know a tool helped, but you must tag the brand.")
 * is demoted to flag. It is displayed and stored rather than refused. That is
 * the same error direction the two ceilings above already take, and it is
 * pinned by a test so it is a measured cost rather than an impression.
 *
 * A LIST, so a fourth guard is a line here (CLAUDE.md, 2026-08-29), and every
 * guard names the FAMILIES it applies to — a guard is a licence to soften a
 * rule, and one that quietly applied to a family nobody checked it against
 * would be a hole with a docblock.
 */
export type ClaimContextGuard = {
  /** The discriminator a test plants, and the reason a demotion happened. */
  id: string;
  families: readonly ClaimFamily[];
  /**
   * Where the guard reads. `before` sees the lowercased text to the LEFT of the
   * match, `outside` sees the text on either side of it — never the match
   * itself.
   *
   * THAT EXCLUSION IS BELT-AND-BRACES TODAY, AND IT IS SAID PLAINLY RATHER
   * THAN OVERSOLD. The risk it is aimed at is a phrase that satisfies a guard
   * with its own words — "no need to disclose" is built from the vocabulary of
   * a disclosure directive. What actually stops that today is the DIRECTIVE
   * LIST, which excludes `need to` on purpose, and `claims.test.ts` asserts
   * that against the whole sentence. Measured: mutating this to read the whole
   * sentence leaves every test green, so the span exclusion is the half that
   * would still hold if a shape whose own text carried `must` or `should` were
   * ever added, and it is not load-bearing before then.
   */
  reads: "before" | "outside";
  pattern: RegExp;
  /** A sentence the guard MUST clear, with the shape that matched it. */
  specimen: { sentence: string; shape: string };
  /** A sentence the guard must NOT clear — the escape it is not. */
  counterSpecimen: { sentence: string; shape: string };
};

export const CLAIM_CONTEXT_GUARDS: readonly ClaimContextGuard[] = [
  {
    id: "prohibited-just-before",
    families: ["concealment"],
    reads: "before",
    // A PROHIBITION IMMEDIATELY BEFORE THE PHRASE, anchored to the end of the
    // left window: "do not <skip the label>", "never <skip the label>",
    // "shouldn't <leave it out>". Modal negations, `never`, `avoid` and the
    // two substitution forms — NOT a bare "is not", which would let "It is not
    // obvious, but nobody needs to know a tool helped." clear itself on a
    // negation belonging to a different clause.
    //
    // `cannot` IS SPELLED OUT SEPARATELY because it is one word: the
    // contraction branch reads `can` + `n't` and the spaced branch reads `can`
    // + ` not`, and neither is "cannot". Found by widening the probe past the
    // seven sentences the gate measured — "You cannot skip the label on a paid
    // partnership." was refused, which is the exact defect this guard exists
    // to prevent, one spelling further out.
    pattern:
      /(?:\b(?:do|does|did|should|must|can|could|would)\s*n(?:['’])?t|\b(?:do|does|did|should|must|could|would|can)\s+not|\bcannot|\bnever|\bavoid(?:s|ing)?|\brather than|\binstead of)(?:[\s,]+(?:ever|just|simply|merely|even))?[\s,]*$/,
    specimen: {
      sentence: "Do not leave the label out of the caption.",
      shape: "leave it out",
    },
    counterSpecimen: {
      sentence: "Leave it out of the caption.",
      shape: "leave it out",
    },
  },
  {
    id: "disclosure-directive",
    families: ["concealment"],
    reads: "outside",
    // THE SENTENCE ALSO TELLS THEM TO DISCLOSE, somewhere the matched phrase
    // is not: "…, but you must tag AI assistance." `need to` is deliberately
    // absent and `still need to` is deliberately present — "no need to
    // disclose" is itself one of the shapes above, so a bare `need to` would
    // let the phrase clear itself, and "no still need to" is not a sentence.
    // The lookahead is what keeps "you must not mention the tool" out.
    pattern:
      /\b(?:must|should|always|be sure to|make sure|remember to|still (?:need|have) to)\b(?!\s*(?:not|never|n(?:['’])?t))(?:\s+\w+){0,3}\s+(?:disclose|disclosing|declare|label|labels|labelling|labeling|tag|tags|tagging|mention|credit)\b/,
    specimen: {
      sentence:
        "There is no need to disclose sponsorship here, but you must tag AI assistance.",
      shape: "no need to disclose",
    },
    counterSpecimen: {
      sentence: "There is no need to disclose this one.",
      shape: "no need to disclose",
    },
  },
  {
    id: "negated-clause",
    families: ["performance", "certainty"],
    reads: "before",
    // THE HONEST WEAKEST POINT, which REQ-I04 asks every output to name. The
    // clause the claim sits in is negated at its subject — "Nothing here is
    // guaranteed.", "Nothing here makes it go viral." — and the negator has to
    // be in the SAME clause as the match (no `,` or `;` between them), so
    // "Nothing else matters, this will perform." is untouched.
    //
    // This is the guard that lets `goes viral` carry the bare infinitive the
    // gate prescribed without re-refusing the sentence R-68 pinned as honest.
    pattern: /^[^,;]*\b(?:nothing|none|no part|nobody|not one)\b[^,;]*$/,
    specimen: {
      sentence: "Nothing here makes it go viral.",
      shape: "goes viral",
    },
    counterSpecimen: {
      sentence: "Nothing else matters, this hook goes viral.",
      shape: "goes viral",
    },
  },
];

/**
 * Which guard, if any, softens this match — the id, so a caller can say WHY.
 *
 * Takes the sentence and the match's own span rather than a pre-sliced string,
 * because "the text outside the match" is the whole mechanism of the second
 * guard and a caller reconstructing it is a caller that can get it wrong.
 */
export function claimContextGuard(params: {
  family: ClaimFamily;
  sentence: string;
  matchStart: number;
  matchEnd: number;
}): string | null {
  const { family, sentence, matchStart, matchEnd } = params;
  const before = sentence.slice(0, matchStart);
  const after = sentence.slice(matchEnd);
  for (const guard of CLAIM_CONTEXT_GUARDS) {
    if (!guard.families.includes(family)) continue;
    if (guard.pattern.test(before)) return guard.id;
    if (guard.reads === "outside" && guard.pattern.test(after)) return guard.id;
  }
  return null;
}

/** One claim found in model-authored text. */
export type ClaimFinding = {
  /** Which named shape fired — the discriminator a test plants. */
  shape: string;
  family: ClaimFamily;
  enforcement: ClaimEnforcement;
  /** The matched vocabulary, lowercased (the text it matched is lowercased). */
  token: string;
  /** RFC-6901-shaped pointer into the ScriptOutput document. */
  field: string;
  /** The sentence it sits in, as written, so a reader sees the claim. */
  unit: string;
};

/**
 * What to do instead — STATIC COPY, one line per family.
 *
 * It names no number, no platform and no result, because non-negotiable 6
 * forbids invented specifics and guarantees on any creator-facing surface.
 */
const REMEDIES: Record<ClaimFamily, string> = {
  performance:
    "This says how the post will do once it is up. Nothing here has any evidence about that — no result of yours has been logged — so say what the idea does instead, and leave what happens after to the results you log.",
  // NO BANNED WORD IN THE REMEDY ITSELF. This copy is creator-facing and is
  // scanned by `kill-test.test.ts` against both the repo canon and the list
  // above, so it says "certain" rather than the word it is refusing.
  certainty:
    "Nothing about a piece of content is certain, and a line that promises otherwise is a promise this product cannot keep. State the idea, then name what is weakest about it.",
  concealment:
    "Disclosure guidance says how to disclose, never how to avoid it. Rewrite it as the plainest true sentence a viewer could read.",
};

/** The static remedy copy, exposed so a surface renders it rather than guessing. */
export function claimRemedyFor(family: ClaimFamily): string {
  return REMEDIES[family];
}

/**
 * THE LOWEST OF THREE CEILINGS: the shape's, the field's, and the context's.
 *
 * All three have to allow "hard" for a claim to refuse a generation. The
 * shape's ceiling is about whether the VOCABULARY is a claim at all (a
 * predicate, not a bare noun); the field's is about whether the SECTION is the
 * product speaking; the context's is about whether the sentence says the
 * OPPOSITE of what the phrase says on its own. EACH WAS ADDED BECAUSE THE SET
 * WITHOUT IT WAS MEASURED REFUSING AN HONEST DRAFT — the shape ceiling on
 * "Nothing here has been checked against how your views actually behave."
 * (R-68), the context ceiling on "You cannot skip the label on a paid
 * partnership." and two other honest guidance sentences — and a refusal is
 * debited.
 *
 * The window each ceiling reads is ONE SENTENCE: `scanOutputClaims` splits per
 * line and then per sentence, so a guard can never reach across a full stop
 * into a neighbouring claim.
 */
function enforcementFor(
  shape: { enforcement: ClaimEnforcement; family: ClaimFamily },
  field: string,
  context: { sentence: string; matchStart: number; matchEnd: number }
): ClaimEnforcement {
  if (shape.enforcement === "flag") return "flag";
  if (!HARD_CLAIM_FIELD_PREFIXES.some((prefix) => field.startsWith(prefix))) {
    return "flag";
  }
  return claimContextGuard({ family: shape.family, ...context }) === null
    ? "hard"
    : "flag";
}

/**
 * Scan the output's text units for performance, certainty and concealment
 * claims.
 *
 * PURE, AND IT MUTATES NOTHING — the same contract `scanTraceability` carries.
 * It returns findings; `kill-test.ts` decides which of them are hard.
 *
 * PER SENTENCE, so a finding names the claim rather than a whole VO beat, and
 * per LINE first, so a hook set (several one-line outputs in one field) is
 * never read as one sentence.
 */
export function scanOutputClaims(
  units: readonly TextUnit[]
): ClaimFinding[] {
  const out: ClaimFinding[] = [];
  for (const unit of units) {
    for (const line of lines(unit.text)) {
      for (const sentence of sentenceUnits(line)) {
        const haystack = sentence.toLowerCase();
        for (const shape of OUTPUT_CLAIM_SHAPES) {
          const m = haystack.match(shape.pattern);
          if (!m) continue;
          // The SPAN, not the string: the third ceiling reads the words around
          // the match, and `m.index` is the only place they are known.
          const matchStart = m.index ?? 0;
          out.push({
            shape: shape.id,
            family: shape.family,
            enforcement: enforcementFor(shape, unit.field, {
              sentence: haystack,
              matchStart,
              matchEnd: matchStart + m[0].length,
            }),
            token: m[0],
            field: unit.field,
            unit: excerpt(sentence),
          });
        }
      }
    }
  }
  return out;
}
