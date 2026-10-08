// The DETERMINISTIC control on model-authored text (REQ-I04, REQ-I05).
//
// WHY THIS FILE EXISTS, in the words of the finding that caused it: REQ-I04's
// no-guarantee rule and REQ-I05's no-concealment rule were enforced ONLY BY
// PROMPT on the one text a creator actually reads. `assemble.ts`'s
// `GENERATION_SYSTEM` says "never claim reach, views, growth, or that anything
// is guaranteed" — and by this package's own R5 logic that is a BRIEF, NOT A
// GATE. Nothing checked `whyThisPerforms.reasoning`, a hook's text, or
// `disclosure.guidance`, and all three were then rendered verbatim on
// `/studio` — a disclosure section reading "most people skip the label on a
// short like this" rendered under a **Disclosure** heading as the product's
// advice. Since audit P1-R1 the model's disclosure section is presented on NO
// surface (`/studio`, first-ideas and `/trends` show the product's sentence for
// the disclosure kind, the saved pack overwrites it, the Sample Spin filters
// it); `whyThisPerforms` and the hooks still are (R-154).
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
//   THE FIELD (`OutputClaimShape.fields`, R-168) — `/whyThisPerforms/` is the
//   section whose whole job is to explain the draft, so a forecast there is the
//   product asserting it (REQ-I04), and every hard shape refuses there. THREE
//   shapes — `guarantee`, `proven to`, `best-performing` — refuse on EVERY
//   presented field too (caption, hooks, VO beats, thesis …), because a
//   guarantee or a claim of proof is one in any text a creator publishes
//   (audit R3-2); the Phase 2 generator measured 441 such escapes in 1,500
//   before this, and chose the three from its false-fire numbers. `/disclosure/`
//   was a hard field while Studio rendered it as the product's advice; audit
//   P1-R1 removed every presentation of it, so it is flag-only now (R-154) —
//   refusing over text no creator reads would cost the creator a draft for
//   nothing (a claim-only refusal is free since R-173, but the draft is
//   lost). Everywhere else a claim is `flag` — a hook may legitimately say
//   "Want more views?" or "You can't miss the switch", and refusing a draft
//   over it would cost the creator that draft for a word rather than a claim.
//
//   THE SHAPE (`OutputClaimShape.enforcement`) — a pattern may only refuse if
//   it carries a PREDICATE. A bare noun or adjective is a word, not a claim.
//
//   THE CONTEXT (`CLAIM_CONTEXT_GUARDS`) — the same phrase inverted by the
//   words around it. "Skip the label" and "never skip the label" are opposite
//   instructions built from one string, and these patterns are negation-blind
//   by construction. A guard DEMOTES to `flag`; it never deletes a finding.
//   For the performance and certainty families the only context that demotes
//   is a SENTENCE that equals a phrase of the CLOSED hedge allowlist
//   (`CLAIM_HEDGE_ALLOWLIST`, R-173) plus at most one `CLAIM_HEDGE_TAILS`
//   entry and that nothing later in its unit takes back, and, on the weakest
//   point alone, an exact `ADMISSION_HEDGE_PHRASES` sentence.
//
//   EVERY OCCURRENCE (P2-R4): a sentence can carry a shape twice, the first
//   inside a hedge and the second not ("Nothing here makes it go viral, but
//   this hook goes viral anyway."). The scan reads every match and keeps the
//   STRICTEST, so a guarded first occurrence can no longer hide the claim.
//
// WHY `/disclosure/` WAS HARD HERE WHILE FLAG-ONLY IN `traceability.ts`, AND
// WHY IT NO LONGER IS. `FLAG_ONLY_FIELD_PREFIXES` demotes SPECIFICS in
// disclosure because that text is untraceable to the creator's corpus by
// construction (R-68). This rule was about the opposite property — whether
// displayed advice told a creator to hide something — and it was hard because
// the pipeline, with `/whyThisPerforms/` as the sole hard field, returned
// `status: usable` and DISPLAYED "Most people skip the label on a short like
// this, and nobody needs to know a tool helped." under the Disclosure heading.
// Audit P1-R1 closed that the other way: the model's disclosure section is no
// longer displayed anywhere, the product's sentence is, so REQ-I05 holds by
// what is shown and a debited refusal over the hidden section buys nothing.
// The concealment family keeps its hard half on `/whyThisPerforms/`, and every
// finding in `/disclosure/` is still recorded at flag level (R-154).
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
import { outputTextPointers, pointerMatches } from "./output";
import {
  excerpt,
  lines,
  type TextUnit,
} from "./text";

/**
 * Which promise a shape is about.
 *
 * `performance` — how the post will DO once it is posted. No result a creator
 * logs enters a draft's evidence until a verified analytics connector exists
 * (R-115), so every one of these is a claim about a future the draft holds no
 * evidence about.
 *
 * `certainty` — REQ-I04's own word. `guarantee` is in the repo's shared canon
 * (`FORBIDDEN_CLAIMS`) rather than in `PERFORMANCE_CLAIMS`, so it is a family
 * of its own here rather than smuggled into the performance list, which has to
 * stay id-for-id identical to the canon's.
 *
 * `concealment` — REQ-I05. This half has no canon anywhere in the repo, because
 * until this slice nothing generated a disclosure section for a creator to
 * read (and since audit P1-R1 the model's disclosure section is not presented
 * — R-154).
 */
export type ClaimFamily = "performance" | "certainty" | "concealment";

/** Whether a claim finding may refuse a generation, or only flag it. */
export type ClaimEnforcement = "hard" | "flag";

/**
 * Where a hard-ceiling shape may refuse (R-168).
 *
 * `explanation` — the fields under `HARD_CLAIM_FIELD_PREFIXES`, the product
 * explaining its own draft. `presented` — every schema pointer a surface
 * presents (`outputTextPointers()` minus `NOT_PRESENTED_FIELD_PREFIXES`).
 * A `flag`-ceiling shape never refuses, so its scope is `explanation` and
 * carries no meaning.
 */
export type ClaimFieldScope = "explanation" | "presented";

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
   * WHICH FIELDS the hard ceiling reaches (R-168). `presented` for the three
   * shapes audit R3-2 names — `guarantee`, `proven to`, `best-performing` — a
   * guarantee or a claim of proof is one in any text a creator publishes. The
   * other certainty and own-baseline shapes stay `explanation`: the Phase 2
   * generator found an ordinary non-claim reading of each ("You can't miss the
   * switch on the left side.", "Want more views? Cut the first second.") that
   * would be a debited refusal on a hook or a beat. The false-fire the three
   * cost is pinned in `KNOWN_VOCABULARY_GAPS`.
   */
  fields: ClaimFieldScope;
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
    fields: "explanation",
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
    fields: "explanation",
    family: "performance",
    pattern: /\b(go(es|ing)?|went|will go|gonna go)\s+viral\b/,
    specimen: "this hook goes viral",
  },
  {
    id: "views",
    enforcement: "flag",
    fields: "explanation",
    family: "performance",
    pattern: /\bviews\b/,
    specimen: "expect more views on this one",
  },
  {
    id: "engagement",
    enforcement: "flag",
    fields: "explanation",
    family: "performance",
    pattern: /\bengagement\b/,
    specimen: "this lifts engagement",
  },
  {
    id: "more reach",
    enforcement: "hard",
    fields: "explanation",
    family: "performance",
    pattern: /\b(more|wider|bigger|larger|extra|higher) reach\b/,
    specimen: "this one gets more reach",
  },
  {
    id: "reach an audience",
    enforcement: "hard",
    fields: "explanation",
    family: "performance",
    pattern:
      /\breach(es|ing)? (a |an |your |the )?(wider |bigger |larger |new |whole |right )?(audience|following|viewers)\b/,
    specimen: "this will reach a wider audience",
  },
  {
    id: "will perform",
    enforcement: "hard",
    fields: "explanation",
    family: "performance",
    pattern: /\bwill perform/,
    specimen: "this draft will perform well",
  },
  {
    id: "outperform",
    enforcement: "hard",
    fields: "explanation",
    family: "performance",
    pattern: /\boutperform/,
    specimen: "it outperforms your last post",
  },
  {
    id: "blow up",
    enforcement: "hard",
    fields: "explanation",
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
    fields: "explanation",
    family: "performance",
    pattern: /\bbeat(s|ing)? (your|my|our|their|the) (baseline|average|numbers|usual|best)\b/,
    specimen: "this beats your baseline",
  },
  {
    id: "better than your last",
    enforcement: "hard",
    fields: "explanation",
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
    fields: "presented",
    family: "performance",
    pattern: /\bbest[- ]performing\b/,
    specimen: "your best-performing hook shape is this one",
  },
  {
    id: "more views",
    enforcement: "hard",
    fields: "explanation",
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
    fields: "presented",
    family: "performance",
    pattern: /\bproven to\b/,
    specimen: "it is proven to work for this audience",
  },

  // --- certainty: REQ-I04. `guarantee` is `FORBIDDEN_CLAIMS`' own entry,
  //     pattern source included, so the two agree here too.
  {
    id: "guarantee",
    enforcement: "hard",
    fields: "presented",
    family: "certainty",
    pattern: /\bguarantee/,
    specimen: "results are guaranteed",
  },
  {
    id: "cannot fail",
    enforcement: "hard",
    fields: "explanation",
    family: "certainty",
    // WIDENED (final compliance verification): "This won't fail." and "It
    // never fails." produced no finding at all.
    pattern: /\b(?:can(?:no|['’])?t|won['’]?t|will not|never) (?:fail|fails|miss|misses|lose|loses)\b/,
    specimen: "this one can't miss",
  },

  // --- concealment: REQ-I05. Written for the `disclosure` section, which is
  //     no longer presented (audit P1-R1, R-154): there they FLAG; they refuse
  //     on the remaining hard field, `/whyThisPerforms/`.
  {
    id: "skip the label",
    enforcement: "hard",
    fields: "explanation",
    family: "concealment",
    pattern: /\bskip(s|ping|ped)? (the |a |any |your )?(label|disclosure|disclaimer|tag|credit)\b/,
    specimen: "most people skip the label on a short like this",
  },
  {
    id: "no need to disclose",
    enforcement: "hard",
    fields: "explanation",
    family: "concealment",
    pattern: /\b(no|not) (need|necessary|required) to (disclose|declare|mention|label|tag)\b/,
    specimen: "there is no need to disclose this one",
  },
  {
    id: "disclosure is optional",
    enforcement: "hard",
    fields: "explanation",
    family: "concealment",
    pattern:
      /\b(disclosure|disclosing|the label|labelling|labeling) is (optional|not required|unnecessary|not needed)\b/,
    specimen: "disclosure is optional here",
  },
  {
    id: "do not mention",
    enforcement: "hard",
    fields: "explanation",
    family: "concealment",
    pattern: /\b(do|does|did)(n['’]?t| not) (mention|say|tell|reveal|admit|disclose)\b/,
    specimen: "don't mention that a tool helped",
  },
  {
    id: "nobody needs to know",
    enforcement: "hard",
    fields: "explanation",
    family: "concealment",
    pattern: /\b(nobody|no one) (needs|has|needs to|ever needs) to know\b/,
    specimen: "nobody needs to know how this was made",
  },
  {
    id: "leave it out",
    enforcement: "hard",
    fields: "explanation",
    family: "concealment",
    pattern: /\bleave (it|that|this|the label|the disclosure|the tag) out\b/,
    specimen: "leave it out of the caption",
  },
  {
    id: "hide that a tool made it",
    enforcement: "hard",
    fields: "explanation",
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
 * `false-fire` is an honest draft refused — free when the claim scan is its
 * only cause (R-173), still a lost draft.
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
    // On the remaining HARD field (R-154): `/disclosure/` is flag-only since
    // audit P1-R1, and a gap is pinned where a refusal is possible.
    field: "/whyThisPerforms/reasoning",
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
  // SYNONYM AND ELLIPSIS PROMISES (final compliance verification, 2026-10-07),
  // pinned rather than patched: the certainty family is a list of phrasings.
  {
    id: "a synonym for a guarantee",
    direction: "miss",
    field: "/whyThisPerforms/reasoning",
    sentence: "We promise it lands.",
    why: "`promise` is not one of the certainty shapes: a verb this common also introduces honest sentences (\"we promise nothing\"), and the shape list is the phrasings that were measured, not the class. A synonym added later is a shape line, with its own specimen and false-fire probe.",
  },
  {
    id: "an elliptical certainty",
    direction: "miss",
    field: "/whyThisPerforms/reasoning",
    sentence: "It's certain.",
    why: "The certainty is stated about a pronoun with the claim elided, so no listed shape has a predicate to match; reading `certain` alone as a claim would refuse \"Nothing here is certain\", the product's own most common honest sentence.",
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
  // A DENIAL THE CLOSED ALLOWLIST DOES NOT LIST (R-173): a negator that
  // reaches a relative clause only THROUGH its antecedent.
  {
    id: "a negated antecedent governing a relative clause",
    direction: "false-fire",
    field: "/whyThisPerforms/reasoning",
    sentence: "No draft is one that can't miss.",
    why: "A hedge counts only as one of the closed allowlist's fixed phrases (R-173), and this denial is not one of them, so it reads as the claim. Admitting it would need the antecedent's scope, which a phrase list cannot see; the refusal is free under R-173, while the other direction ships a guarantee.",
  },
  // THE COST OF R-168, named rather than discovered. `guarantee` and
  // `best-performing` refuse on every presented field because audit R3-2 names
  // them, and the Phase 2 generator's synthetic vocabulary found an ordinary
  // non-claim reading of each. Neither occurred in the 356 presented units of
  // the pipeline fixtures or the 564 of the local stored generations.
  {
    id: "the noun `guarantee` on a presented field",
    direction: "false-fire",
    field: "/beats/0/vo",
    sentence: "The lens came with a two-year guarantee.",
    why: "`guarantee` is matched as a stem, so the warranty noun reads as a promise. On a VO beat that is a refusal for a sentence promising nothing — free under R-173, but a lost draft; the alternative — leaving a guarantee in a caption to flag — is the R3-2 escape this field population exists to close.",
  },
  {
    id: "an instruction naming the creator's `best-performing` post",
    direction: "false-fire",
    field: "/hooks/0/text",
    sentence: "Open your best-performing post and watch the first second.",
    why: "Pointing the creator at their own best post is an instruction, not a claim that this draft performs. The pattern cannot tell the two apart, and R3-2 requires the claim reading to refuse on a hook.",
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
 * `/disclosure/` WAS THE SECOND, AND IS NOT ANY MORE (R-154). It was added
 * because Studio DISPLAYED the model's disclosure guidance as the product's
 * advice, and REQ-I05 / S5 says disclosure guidance never advises concealment.
 * Audit P1-R1 made that hold by presentation instead: no surface shows the
 * model's disclosure section (`/studio`, first-ideas and `/trends` render the
 * product's sentence for the disclosure kind, the saved pack overwrites it,
 * the Sample Spin filters it, the JSON export carries the stored record, not
 * advice). Keeping it hard would refuse — and debit — a draft over text no
 * creator reads. `tests/disclosure-presenters.test.ts` is the presentation
 * half's witness; `claims.test.ts` pins that every concealment shape still
 * FLAGS there and still REFUSES on `/whyThisPerforms/`.
 *
 * A second hard field is a line here, taken deliberately — and a surface that
 * starts presenting the model's disclosure section again must put this one
 * back in the same change (and take it out of `NOT_PRESENTED_FIELD_PREFIXES`).
 *
 * THIS IS THE `explanation` SCOPE. The three `presented`-scope shapes refuse on
 * this list AND on every other presented pointer (R-168).
 */
export const HARD_CLAIM_FIELD_PREFIXES: readonly string[] = [
  "/whyThisPerforms/",
];

/**
 * The schema pointers NO SURFACE PRESENTS (R-154): the model's disclosure
 * section. THE ONE AUTHORITY (R-172): `@respin/credits`' `presentedTextUnits`
 * reads this list, and so does the claims refusal scope below, so what a
 * screen presents and what can refuse are decided once.
 */
export const NOT_PRESENTED_FIELD_PREFIXES: readonly string[] = ["/disclosure/"];

/**
 * Schema leaves whose text is THE CREATOR'S OWN WORDS — a premise's basis
 * excerpt, which `mode-checks.ts` verifies is quoted from the creator's
 * material. Presented, but outside the claims refusal scope (audit Phase 2
 * gate): a creator who once wrote "my best-performing post" is quoting
 * themselves, not being promised anything, and refusing would charge them for
 * their own sentence. Findings there are still recorded at flag level.
 */
export const CREATOR_QUOTE_LEAVES: readonly string[] = ["/basis/excerpt"];

/**
 * THE FIELD POPULATION a shape may refuse on, as schema pointer patterns
 * (`/hooks/*\/text`) — derived from `outputTextPointers()`, never hand-typed,
 * so a `line()` added to the schema joins the `presented` scope the day it is
 * written (P2-R5's pointer set is this axis). Empty for a `flag` ceiling.
 */
export function claimFieldsFor(
  shape: Pick<OutputClaimShape, "enforcement" | "fields">
): readonly string[] {
  if (shape.enforcement === "flag") return [];
  const pointers = outputTextPointers();
  return shape.fields === "presented"
    ? pointers.filter(
        (p) =>
          !NOT_PRESENTED_FIELD_PREFIXES.some((x) => p.startsWith(x)) &&
          !CREATOR_QUOTE_LEAVES.some((leaf) => p.endsWith(leaf))
      )
    : pointers.filter((p) => HARD_CLAIM_FIELD_PREFIXES.some((x) => p.startsWith(x)));
}

/**
 * THE THIRD CEILING: the same string, inverted by the words around it.
 *
 * WHY IT EXISTS, MEASURED. Promoting `/disclosure/` to a hard field without
 * this made three of seven honest guidance sentences refuse a generation — and
 * question 4's table DEBITS a refusal, so a creator would pay a credit for the
 * product telling them, correctly, to label their video. (`/disclosure/` is
 * flag-only again since R-154; the guard still governs every concealment line
 * on `/whyThisPerforms/`, where `claims.test.ts` measures it.)
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
 * refusal and its charge. On a hard field the honest sentences above therefore
 * flag — no refusal, no debit — while the concealment sentences refuse.
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
   * match; `outside` sees the text on either side of it. Neither ever sees the
   * match itself.
   *
   * THE SPAN EXCLUSION IS LOAD-BEARING (audit R3-6 — this said it was not,
   * from a measurement whose numbers were right and whose conclusion was
   * wrong). The directive vocabulary excluding `need to` keeps "no need to
   * disclose" from clearing itself, but it is not the only way a phrase can
   * satisfy a guard with its own words: a directive word OUTSIDE the match and
   * the guard's object noun INSIDE it. "Always skip the label on a short like
   * this." and "Make sure you leave the label out." each match
   * `disclosure-directive` when read whole (`always … label`, `make sure …
   * label`) and would be demoted; read with the match excluded, both refuse.
   * `claims.test.ts` pins both as refusals AND pins that the whole-sentence
   * reading would clear them, so deleting the exclusion is red.
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
];

/** Every combination of the parts, joined by single spaces; an empty part drops out. */
function phrases(...parts: readonly (readonly string[])[]): readonly string[] {
  let out: string[] = [""];
  for (const part of parts) {
    out = out.flatMap((head) => part.map((w) => [head, w].filter((x) => x.length > 0).join(" ")));
  }
  return out;
}

/**
 * ONE ENTRY OF THE CLOSED HEDGE ALLOWLIST (owner decision 2026-10-07,
 * "strict + free refusal", R-173; compliance verification BLOCK, same day).
 *
 * A FIXED TOKEN SEQUENCE, NOT A PATTERN. `phrases` is the whole entry: every
 * accepted wording, written out, each ending with the shape's own word, so the
 * negator directly governs the shape and there is no free word anywhere in it.
 * The first version of this list used patterns with factive verbs and
 * free-word runs, and "Nobody tells you this hook is guaranteed to work." read
 * as a hedge; the second matched a phrase ANYWHERE in a sentence, and "There's
 * no guarantee like this hook." read as one. Since the final compliance
 * verification (2026-10-07) a phrase admits only a sentence that IS the phrase,
 * optionally followed by one `CLAIM_HEDGE_TAILS` entry (`hedgeSentenceAdmits`).
 */
export type ClaimHedge = {
  id: string;
  /** The shape ids the phrase's last word is — the only shapes it governs. */
  shapes: readonly string[];
  /** Every accepted wording, lowercase, straight apostrophes, single spaces. */
  phrases: readonly string[];
  /** A sentence the hedge MUST clear (flag), with its shape. */
  specimen: { sentence: string; shape: string };
  /** A sentence that looks like it and must still REFUSE. */
  counterSpecimen: { sentence: string; shape: string };
};

/**
 * THE HEDGE ALLOWLIST: for the performance and certainty families, a hard
 * shape REFUSES unless its WHOLE SENTENCE is one of these phrases plus at most
 * one closed tail, and nothing later in the unit can take it back
 * (`hedgeSentenceAdmits`). Small and closed on purpose: a refusal caused only by
 * the claim scan costs the creator nothing (R-173, `refusalIsClaimOnly`), so a
 * missing honest wording is a free rewrite, while a wrong entry ships a
 * promise. A new wording is a line here, with its specimen.
 */
export const CLAIM_HEDGE_ALLOWLIST: readonly ClaimHedge[] = [
  {
    id: "hedge-no-guarantee",
    shapes: ["guarantee"],
    phrases: ["no guarantee", "no guarantees", "there is no guarantee", "there's no guarantee", "there are no guarantees"],
    specimen: { sentence: "No guarantees, just what worked for me.", shape: "guarantee" },
    counterSpecimen: { sentence: "No more guessing with this guaranteed method.", shape: "guarantee" },
  },
  {
    id: "hedge-cannot-guarantee",
    shapes: ["guarantee"],
    phrases: phrases(["i", "we"], ["can't", "cannot", "can not", "won't", "will not", "don't", "do not"], ["guarantee"]),
    specimen: { sentence: "I can't guarantee this works for you.", shape: "guarantee" },
    counterSpecimen: { sentence: "Don't miss this guaranteed growth hack.", shape: "guarantee" },
  },
  {
    id: "hedge-nothing-guaranteed",
    shapes: ["guarantee"],
    phrases: phrases(["nothing", "nothing here", "nothing in this draft", "none of this"], ["is", "is ever", "was", "will be"], ["guaranteed"]),
    specimen: { sentence: "Nothing in this draft is guaranteed.", shape: "guarantee" },
    counterSpecimen: { sentence: "Nothing but guaranteed growth.", shape: "guarantee" },
  },
  {
    id: "hedge-not-guaranteed",
    shapes: ["guarantee"],
    phrases: [
      ...phrases(["results", "the results", "outcomes"], ["aren't", "are not"], ["guaranteed"]),
      ...phrases(["it", "this", "that", "success"], ["isn't", "is not"], ["guaranteed"]),
      ...phrases(["it's not", "that's not"], ["guaranteed"]),
    ],
    specimen: { sentence: "Results aren't guaranteed.", shape: "guarantee" },
    counterSpecimen: { sentence: "Not everyone knows the results are guaranteed.", shape: "guarantee" },
  },
  {
    id: "hedge-not-proven",
    shapes: ["proven to"],
    phrases: [
      ...phrases(["this", "it", "that", "this hook", "this draft", "this idea", "this method"], ["isn't", "is not"], ["", "yet"], ["proven to"]),
      ...phrases(["it's not", "that's not"], ["", "yet"], ["proven to"]),
    ],
    specimen: { sentence: "This isn't proven to work for everyone.", shape: "proven to" },
    counterSpecimen: { sentence: "Not everyone knows this method is proven to work.", shape: "proven to" },
  },
];

/** Straight apostrophes, so one phrase list matches both spellings; same length, so offsets hold. */
export function straightApostrophes(text: string): string {
  return text.replace(/[‘’ʼ′`]/g, "'");
}

/**
 * THE CLOSED TAIL LIST (final compliance verification, 2026-10-07): the only
 * words that may follow an allowlisted hedge phrase in its sentence. Written
 * out as data; none carries a claim shape, a negator that could re-negate the
 * hedge, or an object a hedge could be turned into a comparison with ("like
 * this hook", "comes close to"). "" is the bare phrase.
 */
export const CLAIM_HEDGE_TAILS: readonly string[] = [
  "",
  ", just what worked for me",
  ", only what worked for me",
  ", but it worked for me",
  " for everyone",
  " for every creator",
  " for you",
  " here",
  " in this draft",
  " this works",
  " this works for you",
  " that this works",
  " it lands",
  " this lands",
  " work",
  " work for everyone",
  " land",
];

/**
 * THE ADMISSION PHRASES (final compliance verification, 2026-10-07): the only
 * sentences besides the hedge allowlist that FLAG a performance or certainty
 * shape on an admission field (`ADMISSION_CLAIM_FIELDS`). Exact sentences,
 * written out; every other weakest point carrying a hard shape refuses (free).
 */
export const ADMISSION_HEDGE_PHRASES: readonly string[] = [
  "it's unlikely to go viral",
  "it is unlikely to go viral",
  "this is unlikely to go viral",
  "it is not guaranteed that this will perform",
  "it's not guaranteed that this will perform",
  "this may not perform",
  "this might not perform",
  "results may vary",
  "this will not outperform your last post on its own",
  "this won't outperform your last post on its own",
];

/** An exception anywhere else in the unit can take a hedge back ("…except results."). */
const EXCEPTION = /\b(?:except|but|apart from|aside from|other than|unless|besides|save for)\b/;

/**
 * A sentence as the allowlists compare it: lowercase, straight apostrophes,
 * single spaces, no trailing `.`, `!` or ellipsis. A `?` is kept, so a
 * question never equals a phrase.
 */
export function normaliseHedgeSentence(sentence: string): string {
  return straightApostrophes(sentence.toLowerCase())
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!…]+$/, "")
    .trim();
}

/** Where a sentence sits in its unit — what the "taken back later" rule reads. */
export type HedgeUnitContext = {
  /** It is the unit's LAST sentence: nothing after it can take it back. */
  last: boolean;
  /** Another sentence of the same unit carries an exception word. */
  exceptionElsewhere: boolean;
};

const HEDGE_SENTENCES: ReadonlyMap<string, readonly string[]> = new Map(
  CLAIM_HEDGE_ALLOWLIST.flatMap((h) =>
    h.phrases.flatMap((ph) => CLAIM_HEDGE_TAILS.map((tail) => [ph + tail, h.shapes] as const))
  )
);

/**
 * THE ENDPOINT RULE: the id of the hedge entry that admits this sentence for
 * this shape, or null. Admitted only when the WHOLE normalised sentence is an
 * allowlisted phrase plus one closed tail (or, on an admission field, an
 * admission phrase), it is the last sentence of its unit, and no other
 * sentence of the unit carries an exception.
 */
export function hedgeSentenceAdmits(params: {
  sentence: string;
  shape: string;
  field?: string;
  unit?: HedgeUnitContext;
}): string | null {
  const unit = params.unit ?? { last: true, exceptionElsewhere: false };
  if (!unit.last || unit.exceptionElsewhere) return null;
  const normalised = normaliseHedgeSentence(params.sentence);
  const shapes = HEDGE_SENTENCES.get(normalised);
  if (shapes !== undefined && shapes.includes(params.shape)) {
    return CLAIM_HEDGE_ALLOWLIST.find(
      (h) => h.shapes.includes(params.shape) && CLAIM_HEDGE_TAILS.some((t) => h.phrases.some((ph) => ph + t === normalised))
    )!.id;
  }
  if (
    params.field !== undefined &&
    ADMISSION_CLAIM_FIELDS.includes(params.field) &&
    ADMISSION_HEDGE_PHRASES.includes(normalised)
  ) {
    return "admission-hedge";
  }
  return null;
}

/**
 * THE ADMISSION FIELDS (R-173): `/whyThisPerforms/weakestPoint` is where
 * REQ-I04 asks the draft to name its weakness. It is inside the hard
 * explanation scope; a performance or certainty shape there flags only when
 * its sentence is an allowlisted hedge or one of `ADMISSION_HEDGE_PHRASES`
 * exactly, and refuses (free) otherwise — "Nobody tells you…", "It's unlikely
 * this won't go viral." and "Results are guaranteed." all refuse.
 */
export const ADMISSION_CLAIM_FIELDS: readonly string[] = ["/whyThisPerforms/weakestPoint"];

/**
 * Which guard, if any, softens this match — the id, so a caller can say WHY.
 *
 * Takes the sentence and the match's own span rather than a pre-sliced string,
 * because "the text outside the match" is the whole mechanism of the second
 * guard and a caller reconstructing it is a caller that can get it wrong.
 */
export function claimContextGuard(params: {
  family: ClaimFamily;
  /** The matched shape's id — a hedge governs only the shapes it names. */
  shape?: string;
  /** The pointer, so an ADMISSION field can read its own phrases. */
  field?: string;
  /** Where the sentence sits in its unit; absent reads as "alone in it". */
  unit?: HedgeUnitContext;
  sentence: string;
  matchStart: number;
  matchEnd: number;
}): string | null {
  const { family, shape, field, matchStart, matchEnd } = params;
  const sentence = straightApostrophes(params.sentence.toLowerCase());
  const before = sentence.slice(0, matchStart);
  const after = sentence.slice(matchEnd);
  for (const guard of CLAIM_CONTEXT_GUARDS) {
    if (!guard.families.includes(family)) continue;
    if (guard.pattern.test(before)) return guard.id;
    if (guard.reads === "outside" && guard.pattern.test(after)) return guard.id;
  }
  if (family !== "performance" && family !== "certainty") return null;
  if (shape === undefined) return null;
  return hedgeSentenceAdmits({ sentence, shape, field, unit: params.unit });
}

/**
 * WAS THIS REFUSAL CAUSED BY THE CLAIM SCAN ALONE? (owner decision
 * 2026-10-07, R-173; amends R-68.) True exactly when the kill test failed and
 * every hard rule on its final attempt is `forbidden_claim` — no fragment
 * triad, antithesis, hook length, invented specific, mode check or
 * similarity finding. Such a refusal is FREE: the settlement takes no debit,
 * because the strict hedge allowlist above refuses some honest sentences and
 * a creator is never charged for that. The pipeline's one rewrite has already
 * named the refused sentences to the model as must-remove.
 *
 * Reads plain stored JSON (`generations.kill_test`), so a replay and a held
 * settlement decide it from the same record the fresh path wrote.
 */
export function refusalIsClaimOnly(killTest: unknown): boolean {
  if (typeof killTest !== "object" || killTest === null) return false;
  const k = killTest as { outcome?: unknown; finalAttempt?: { hardRules?: unknown } };
  if (k.outcome !== "failed") return false;
  const rules = k.finalAttempt?.hardRules;
  return (
    Array.isArray(rules) &&
    rules.length > 0 &&
    rules.every((r) => typeof r === "object" && r !== null && (r as { rule?: unknown }).rule === "forbidden_claim")
  );
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
  // COUNT-INDEPENDENT (audit P2-R7, Phase 6 AC9's fourth site). This read "no
  // result of yours has been logged" — a claim about the creator's history from
  // a package that holds no scope and no count, false for everyone who has
  // logged one. What is true for every creator is the R-115 precondition.
  performance:
    "This says how the post will do once it is up. Nothing you log enters a draft's evidence until a verified analytics connector exists, so nothing here has any evidence about that. Say what the idea does instead.",
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
  shape: OutputClaimShape,
  field: string,
  context: { sentence: string; matchStart: number; matchEnd: number; unit: HedgeUnitContext }
): ClaimEnforcement {
  if (shape.enforcement === "flag") return "flag";
  if (!claimRefusesOn(shape, field)) return "flag";
  return claimContextGuard({ family: shape.family, shape: shape.id, field, ...context }) === null
    ? "hard"
    : "flag";
}

/**
 * Whether a hard-ceiling shape may refuse on this concrete pointer — the
 * field ceiling alone, before the context guard. A pointer outside the schema
 * matches no pattern and can only flag.
 */
export function claimRefusesOn(
  shape: Pick<OutputClaimShape, "enforcement" | "fields">,
  field: string
): boolean {
  return claimFieldsFor(shape).some((pattern) => pointerMatches(pattern, field));
}

/** Each shape's pattern, global, so every occurrence is read (P2-R4). */
const GLOBAL_PATTERNS: ReadonlyMap<string, RegExp> = new Map(
  OUTPUT_CLAIM_SHAPES.map((s) => [s.id, new RegExp(s.pattern.source, s.pattern.flags + "g")])
);

/**
 * `sentenceUnits`, KEEPING EACH SENTENCE'S TERMINATOR: a hedge is void in a
 * question (`normaliseHedgeSentence` keeps the `?`), and `sentenceUnits` splits the `?` away — "No
 * guarantee here?" read as the statement it is not (measured by the
 * generator's DISQUALIFIED property, 183 in 1,500, on the first run).
 */
function sentencesWithTerminators(line: string): string[] {
  return (line.match(/[^.!?\u2026]+[.!?\u2026]*/g) ?? []).map((x) => x.trim()).filter((x) => /[^.!?\u2026\s]/.test(x));
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
 *
 * ONE FINDING PER SHAPE PER SENTENCE, at the STRICTEST enforcement across
 * every occurrence (P2-R4). The match used to be non-global, so a guarded
 * first occurrence decided for the whole sentence and "Nothing here makes it
 * go viral, but this hook goes viral anyway." only flagged (360 escapes in
 * 1,500 on the generator's first run). The token reported is the occurrence
 * that decided: the first hard one, or the first one if none is hard.
 */
export function scanOutputClaims(
  units: readonly TextUnit[]
): ClaimFinding[] {
  const out: ClaimFinding[] = [];
  for (const unit of units) {
    // THE UNIT'S SENTENCES, ACROSS LINES (final compliance verification): a
    // hedge is taken back by a LATER sentence ("Nothing here is guaranteed!
    // Results are.") or an exception anywhere else in the unit, so each
    // sentence knows its place in the whole unit, not only in its line.
    const all = lines(unit.text).flatMap(sentencesWithTerminators);
    const exceptional = all.map((x) => EXCEPTION.test(straightApostrophes(x.toLowerCase())));
    for (const [index, sentence] of all.entries()) {
      {
        const unitContext: HedgeUnitContext = {
          last: index === all.length - 1,
          exceptionElsewhere: exceptional.some((e, j) => e && j !== index),
        };
        const haystack = sentence.toLowerCase();
        for (const shape of OUTPUT_CLAIM_SHAPES) {
          let decided: { enforcement: ClaimEnforcement; token: string } | null = null;
          for (const m of haystack.matchAll(GLOBAL_PATTERNS.get(shape.id)!)) {
            // The SPAN, not the string: the third ceiling reads the words
            // around the match, and `m.index` is the only place they are known.
            const matchStart = m.index ?? 0;
            const enforcement = enforcementFor(shape, unit.field, {
              sentence: haystack,
              matchStart,
              matchEnd: matchStart + m[0].length,
              unit: unitContext,
            });
            if (decided === null || enforcement === "hard") {
              decided = { enforcement, token: m[0] };
            }
            if (enforcement === "hard") break;
          }
          if (decided === null) continue;
          out.push({
            shape: shape.id,
            family: shape.family,
            enforcement: decided.enforcement,
            token: decided.token,
            field: unit.field,
            unit: excerpt(sentence),
          });
        }
      }
    }
  }
  return out;
}
