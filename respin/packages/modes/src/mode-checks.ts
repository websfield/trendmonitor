// The PER-MODE OUTPUT checks (slice 7 stage B; card R3, R4, R5, R18).
//
// WHY THESE ARE CHECKS ON THE OUTPUT AND NOT LINES IN A PROMPT. The card says
// it for R4 and the same argument carries the other three: "this is a property
// of the output, so it needs a check on the output, not an instruction in the
// prompt". `assemble.ts` already told the model not to summarise, not to write
// five wordings of one hook and not to hand back topics — and by this package's
// own R5 logic that is a BRIEF, NOT A GATE. This file is the gate: it takes no
// callback, it is not async, and it names no scorer, exactly like
// `hard-rules.ts`, `traceability.ts` and `claims.ts` (`purity.test.ts` scans
// all four).
//
// ==========================================================================
// WHAT IS REAL HERE AND WHAT IS A STAND-IN — stated at the top, because the
// slice card demands the distinction be made rather than blurred: "state which
// of the four have a real check and which have a proxy, and do not report a
// proxy as coverage".
//
//   REAL. `framework_eligibility` compares a named framework against the list
//   this generation was actually offered — a decidable question with a right
//   answer. The structural half of `ideas_not_topics` (a thesis that is the
//   hook again, or a question, or too short to assert anything) is decidable
//   too.
//
//   STAND-INS. `summarised_source` (R3), `hook_spread` (R4) and
//   `weakest_point` (R18) are about MEANING, and nothing in a pure TypeScript
//   module decides meaning. Each is a computable correlate — verbatim overlap
//   plus the summariser's register, content-word overlap between hooks, a
//   vocabulary of sentences that name no weakness — and `KNOWN_MODE_CHECK_GAPS`
//   is the measured list of what each one misses, every entry driven by a test.
//   A sentence that carries no shape below is not thereby honest.
// ==========================================================================
//
// PRECISION IS A PRODUCT DECISION, the trade `hard-rules.ts` already states: a
// finding here costs the creator one extra vendor call and, if the rewrite also
// fails, an honest refusal they paid a credit for (slice 6, question 4). So
// every threshold below is MOVED OFF ITS FIRST VALUE BY A MEASURED FALSE
// POSITIVE where one was found — the anchored `names-nothing` patterns exist
// because the clean fixtures in this package open their weakest point with
// "None of these has been tested against how your own audience actually
// behaves" (`fixtures.ts`) and "None of this has been checked against…"
// (`mode-fixtures.ts`), and an unanchored `none` would have refused both.
//
// WHAT THAT SENTENCE USED TO SAY, AND WHY IT WAS WRONG (spin-compliance gate,
// 2026-09-01). It read "every threshold below is set where a MEASURED false
// positive stops", which claims a property NO THRESHOLD ON THIS MEASURE CAN
// HAVE: `contentOverlap` scores "Film less and edit more" against "Edit less
// and film more" at 1.000, so there is no number below 1.0 that admits that
// honest pair, and lowering `HOOK_SPREAD_MAX_OVERLAP` would only refuse more.
// A threshold answers "how much overlap is too much"; it cannot answer a pair
// whose whole difference is in a dimension the measure discarded. The
// false-positive residue is therefore recorded in `KNOWN_MODE_CHECK_GAPS`
// beside the false negatives, with a driver, rather than implied away here.
//
// EVERY REGEX IS A LITERAL and every shape carries a `specimen` a test asserts
// it matches (CLAUDE.md, 2026-08-21): a scan reporting no findings is otherwise
// indistinguishable from a scan that is not working.
import { CHECK } from "@respin/llm";

import { GenerationAssemblyError } from "./assemble";
import {
  BASIS_EXCERPT_MIN_CONTENT_WORDS,
  BASIS_EXCERPT_MIN_WORDS,
  BASIS_RELATED_MIN_CONTENT_WORDS,
  EVENT_FIELDS,
  PIVOT_FOR_FORM,
  type FilmingConstraints,
  type FormChoice,
} from "./creative";
import {
  remedyFor,
  type HardRuleFinding,
  type HardRuleId,
} from "./hard-rules";
import { modeSpec, type ModeCheckId, type ModeId } from "./modes";
import {
  outputTextUnits,
  type Filming,
  type Premise,
  type ScriptOutput,
  type ScriptOutputV2,
} from "./output";
import { excerpt, lines, wordCount, wordSpans, words } from "./text";

/**
 * The creative half of a version-2 generation, as the checks need it (R-148).
 *
 * BUILT BY `creativeCheckContextFor` FROM THE SAME `GenerationContext` THE
 * PROMPT WAS BUILT FROM — the rule `input` below already follows. `basisCorpus`
 * is the creator's own material for this generation with this product's own
 * words removed (see `basisCorpusFor`), and `approvedFrameworkNames` includes
 * the eligible frameworks the budget did not offer.
 */
export type CreativeCheckContext = {
  formChoice: FormChoice;
  constraints: FilmingConstraints;
  basisCorpus: readonly string[];
  approvedFrameworkNames: readonly string[];
  /**
   * The basis excerpts a v2 parent's own gate verified — quotes a revision's
   * lines may relate to (R-150 point 1 (b)). `[]` for an original.
   */
  carriedBasis: readonly string[];
  /**
   * A revision's parent passages that were marked `[check]`. They arrive WITH
   * the marker — the parent's stored text, exactly — and `checkPremiseBasis`
   * removes it before comparing runs. `[]` for an original.
   */
  carriedUnconfirmed: readonly string[];
};

/** What one run of the per-mode checks is handed. */
export type ModeCheckArgs = {
  mode: ModeId;
  output: ScriptOutput;
  /**
   * What the creator gave THIS generation — which, in source-to-reel, is
   * somebody else's article or transcript.
   *
   * IT IS THE SAME VALUE THE PROMPT WAS BUILT FROM (`GenerationContext.input`),
   * because `kill-test.ts` derives both from one context. A second copy
   * assembled by a caller is a second population that can drift from the one
   * the model actually saw.
   */
  input: string;
  /** The frameworks this generation was OFFERED, by name. */
  frameworks: readonly { name: string }[];
  /**
   * The creative half (R-148), or `null` for the legacy contract.
   *
   * REQUIRED, with `null` stated, for `GenerationContext.creative`'s reason. The
   * four creative checks read ONLY a version-2 output and this; `runKillTest`
   * refuses an output whose version disagrees with whether this is null before
   * any check runs, so "a v2 document checked as legacy" is not reachable.
   */
  creative: CreativeCheckContext | null;
};

function finding(
  rule: HardRuleId,
  shape: string,
  field: string,
  text: string
): HardRuleFinding {
  return { rule, shape, field, excerpt: excerpt(text), remedy: remedyFor(rule) };
}

// ------------------------------------------------------------- text helpers

/**
 * Function words, dropped before two pieces of text are compared.
 *
 * WITHOUT THIS, EVERY PAIR OF ENGLISH SENTENCES OVERLAPS: "the", "you" and "is"
 * are in almost every hook, so an overlap measure over raw tokens measures
 * grammar rather than claim. The list is deliberately short and closed to
 * determiners, pronouns, auxiliaries, prepositions and conjunctions — a content
 * word wrongly on it would make two different hooks look identical.
 */
export const COMPARISON_STOPWORDS: ReadonlySet<string> = new Set([
  "a", "about", "after", "all", "am", "an", "and", "any", "anyone", "are", "as",
  "at", "back", "be", "because", "been", "before", "being", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing", "done", "down", "each", "even",
  "every", "everyone", "for", "from", "get", "got", "had", "has", "have", "he",
  "her", "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is",
  "it", "its", "just", "like", "me", "might", "more", "most", "much", "must",
  "my", "never", "no", "nobody", "none", "nor", "not", "nothing", "now", "of",
  "off", "on", "once", "one", "only", "or", "other", "our", "out", "over",
  "own", "same", "she", "should", "so", "some", "someone", "something", "still",
  "such", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "through", "to", "too", "up", "us", "very", "was",
  "we", "were", "what", "when", "where", "which", "while", "who", "why",
  "will", "with", "without", "would", "yet", "you", "your", "yours",
]);

/** Every word of a string, lowercased. */
function normalWords(text: string): string[] {
  return words(text).map((w) => w.toLowerCase());
}

/** The words that carry the claim: lowercased, function words dropped. */
export function contentWords(text: string): string[] {
  return normalWords(text).filter((w) => !COMPARISON_STOPWORDS.has(w));
}

/**
 * How much of the claim two pieces of text share — Jaccard over content words.
 *
 * JACCARD RATHER THAN CONTAINMENT, deliberately: containment reads a short
 * hook inside a long one as a total match, and "shoot less" would then collide
 * with every hook that happens to say "shoot". Jaccard punishes the words each
 * one has that the other does not, which is what "a different creative thesis"
 * looks like in tokens.
 */
export function contentOverlap(a: string, b: string): number {
  const left = new Set(contentWords(a));
  const right = new Set(contentWords(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const w of left) if (right.has(w)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Lowercased, punctuation-flattened text — for "is this the same string?". */
function flatten(text: string): string {
  return normalWords(text).join(" ");
}

// --------------------------------------------------------- source fidelity
//
// R3: "source-to-reel never summarises its source. It extracts insights and
// rebuilds them through the creator's stakes. A summariser is a different
// product and is the failure mode this mode has by default."

/**
 * How many consecutive words of the source, reproduced, count as copying.
 *
 * EIGHT, and the number is bounded from both sides. Below about six, ordinary
 * English collides by accident ("the same thing over and over again"); far
 * above eight, a model can lift a whole clause and stay clean. Eight
 * consecutive words in the creator's own voice is not a coincidence — and this
 * check runs on ONE mode, whose input is somebody else's material.
 */
export const SOURCE_RUN_WORDS = 8;

/**
 * The summariser's REGISTER — the sentences a report about a source opens with.
 *
 * These catch the failure mode's tell rather than its substance: a document
 * that says "in this article" is describing the source instead of arguing from
 * it, whatever else it does. A faithful paraphrase carrying none of these
 * phrases is NOT caught, and that gap is recorded below.
 */
export const SUMMARY_REGISTER_SHAPES: readonly {
  id: string;
  pattern: RegExp;
  specimen: string;
}[] = [
  {
    id: "describes-the-source",
    pattern:
      /\b(?:in|from)\s+(?:this|the)\s+(?:article|piece|post|paper|study|report|video|transcript|thread|episode|newsletter)\b/i,
    specimen: "In this article the team explains what they found.",
  },
  {
    id: "attributes-to-the-author",
    pattern:
      /\b(?:the\s+)?(?:author|authors|writer|writers|study|report|paper|piece|article|speaker)\s+(?:say|says|said|argue|argues|argued|explain|explains|explained|claim|claims|found|finds|note|notes|write|writes|point|points|conclude|concludes)\b/i,
    specimen: "The authors argue that the gap is where it happens.",
  },
  {
    id: "summary-frame",
    pattern:
      /\b(?:to\s+sum\s*(?:up|marise|marize)|in\s+summary|key\s+takeaways?|the\s+(?:main|key)\s+points?|here(?:'s|’s|\s+is)\s+(?:a|the)\s+(?:summary|recap|rundown)|tl;?dr)\b/i,
    specimen: "Here is a summary of what the piece found.",
  },
  {
    id: "according-to",
    pattern: /\baccording\s+to\s+(?:the|this|that|a|an)\b/i,
    specimen: "According to the study, spacing beats cramming.",
  },
];

/** Every window of `size` consecutive words, joined by single spaces. */
function ngrams(tokens: readonly string[], size: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + size <= tokens.length; i++) {
    out.add(tokens.slice(i, i + size).join(" "));
  }
  return out;
}

function checkSourceFidelity(args: ModeCheckArgs): HardRuleFinding[] {
  const out: HardRuleFinding[] = [];
  const sourceRuns = ngrams(normalWords(args.input), SOURCE_RUN_WORDS);
  for (const unit of outputTextUnits(args.output)) {
    const tokens = normalWords(unit.text);
    let copied: string | undefined;
    for (const run of ngrams(tokens, SOURCE_RUN_WORDS)) {
      if (sourceRuns.has(run)) {
        copied = run;
        break;
      }
    }
    if (copied !== undefined) {
      out.push(
        finding(
          "summarised_source",
          "verbatim-run",
          unit.field,
          `${SOURCE_RUN_WORDS} words straight out of the source: ${copied}`
        )
      );
      // ONE FINDING PER FIELD, the rule the other scanners already follow:
      // "reporting it twice is the padding R6 forbids", and a refusal that
      // counts fields must not be handed two findings for one place.
      continue;
    }
    for (const line of lines(unit.text)) {
      const shape = SUMMARY_REGISTER_SHAPES.find((s) => s.pattern.test(line));
      if (!shape) continue;
      out.push(finding("summarised_source", shape.id, unit.field, line));
      break;
    }
  }
  return out;
}

// -------------------------------------------------------------- hook spread
//
// R4 / REQ-C04: "hook sets deliberately span different mechanics; requested
// variants must differ in creative thesis, not clip order or wording."

/**
 * Above this share of content words, two hooks are one hook.
 *
 * MEASURED FROM BOTH DIRECTIONS on this package's own fixtures: the five
 * wordings of one thesis in `mode-fixtures.ts` sit between 0.6 and 0.8 of each
 * other, and the three genuinely different hooks in `CLEAN_HOOKS` sit under
 * 0.1. The gap is wide, which is what makes a single number defensible here —
 * and `mode-checks.test.ts` drives both ends against this constant rather than
 * against a literal, so moving it moves the evidence with it.
 */
export const HOOK_SPREAD_MAX_OVERLAP = 0.6;

/**
 * How many content words a hook needs before it is compared at all.
 *
 * A two-word hook shares everything or nothing with its neighbour and neither
 * answers REQ-C04's question. Staying silent there is a decision, stated: the
 * alternative is refusing a set over an arithmetic artefact of short text.
 */
export const HOOK_SPREAD_MIN_CONTENT_WORDS = 3;

/**
 * TWO HOOKS BUILT FROM THE SAME CONTENT WORDS, in whatever order.
 *
 * THE ONE PLACE THE OVERLAP MEASURE HAS NO INFORMATION, and it is a rescue
 * rather than a threshold. `contentOverlap` is Jaccard over an unordered SET,
 * so the order of the words is discarded — and when the two sets are EQUAL,
 * the order is the only thing left that could distinguish the two hooks.
 * Everything the measure can see says "identical"; everything that decides
 * whether these are one claim or opposite claims is in the half it deleted.
 *
 * MEASURED, on real code, which is why this exists (spin-compliance gate,
 * 2026-09-01):
 *
 *   "Film less and edit more"          vs "Edit less and film more"      1.000
 *   "Your gear is not the problem…"    vs "Your lighting is not…"        1.000
 *   "Shoot more, plan less"            vs "Plan more, shoot less"        1.000
 *
 * Each pair asserts the OPPOSITE thing, and each was refused as
 * `collapsed_variants/near-duplicate` — end to end that is two vendor calls
 * and a debited refusal telling the creator "these are wordings of one idea"
 * about two hooks that contradict each other. That is the class R-68 corrected
 * one slice earlier, in the same direction.
 *
 * WHAT IT COSTS, stated rather than discovered: any genuinely collapsed pair
 * whose content-word SETS are equal is now missed. A permutation ("Film less
 * and edit more" / "Edit more and film less") is one instance and was for one
 * slice the only one recorded — THE PREDICATE IS SET EQUALITY AND NOT A
 * PERMUTATION TEST (spin-compliance gate, 2026-09-02), so a stopword-only
 * difference in the SAME order and a repeated content word are silenced too.
 * Both are in `KNOWN_MODE_CHECK_GAPS` with drivers, as
 * `permutation-of-one-claim` and `same-set-different-filler`. It is the
 * cheaper error — the miss costs a creator a hook they can delete, the false
 * positive costs them a credit and a script that was fine.
 *
 * WHAT IT MUST NEVER SILENCE, AND DID (round 2 of the same gate). Set equality
 * CONTAINS literal duplication, so for one slice this rescue passed a hook
 * copied verbatim — three copies of one sentence under three mechanic labels,
 * `status: usable`, `hardRules: []`. `checkHookSpread` now decides
 * `sameFlattenedText` FIRST, before this rescue and before the length floor,
 * so the only thing this function can still silence is a DIFFERENT order.
 *
 * IT IS NOT A THRESHOLD AND CANNOT BE ONE. No value of
 * `HOOK_SPREAD_MAX_OVERLAP` below 1.0 admits a pair scoring 1.000; lowering it
 * refuses more, raising it above 1.0 turns the check off. See the file header.
 */
export function sameContentWords(a: string, b: string): boolean {
  const left = new Set(contentWords(a));
  const right = new Set(contentWords(b));
  if (left.size === 0 || right.size === 0) return false;
  return left.size === right.size && [...left].every((w) => right.has(w));
}

/**
 * THE SAME TEXT, WRITTEN TWICE — case and punctuation are not a difference.
 *
 * WHY IT EXISTS (spin-compliance gate round 2, 2026-09-01). `sameContentWords`
 * is SET EQUALITY, and set equality CONTAINS literal duplication: three copies
 * of "Film less and edit more" under three different mechanic labels have one
 * content-word set between them, so the rescue above silenced them. Measured
 * end to end through `runGeneration` before this existed — `status: usable`,
 * `hardRules: []` — on a document the same check had refused at 1.000 the day
 * before the rescue landed. `parseScriptOutput` refuses duplicate mechanic
 * LABELS and never duplicate text, so nothing else in the pipeline saw it.
 *
 * WHY IT COMPARES ALL THE WORDS AND NOT THE CONTENT WORDS IN ORDER. A content-
 * word SEQUENCE would be the wider net and the wrong one: "not" is a
 * comparison stopword, so "Your camera gear is the problem" and "Your camera
 * gear is not the problem" share a content-word sequence and assert opposite
 * things. Refusing on that sequence would re-open the exact false positive the
 * rescue above was written to close. Identity over every word is the one
 * predicate that cannot: if it holds, there is nothing left to differ in.
 *
 * IT IS AN IDENTITY, NOT A THRESHOLD, so it is decided before the overlap
 * measure and before `HOOK_SPREAD_MIN_CONTENT_WORDS`. The floor exists because
 * an overlap measure has no information on short text; identity needs no
 * measure, and a floor applied to it would just move the hole one length down
 * ("Shoot less" twice).
 */
export function sameFlattenedText(a: string, b: string): boolean {
  const left = flatten(a);
  // AN EMPTY SIDE IS NOT "THE SAME TEXT AS" ANYTHING — the discipline
  // `sameContentWords` already follows. Two hooks of pure punctuation flatten
  // to the same empty string and are two hooks nobody has compared.
  return left.length > 0 && left === flatten(b);
}

/**
 * `parseScriptOutput` ALREADY REFUSES TWO HOOKS WITH THE SAME `mechanic` LABEL.
 *
 * This is the other half, and the card is explicit about why it is needed: a
 * label is what the model SAYS about a hook, and five wordings of one thesis
 * under five different labels passes a label check completely. The population
 * is `isHook` text units, so an idea's hook is covered by the same code — one
 * population, the discipline `output.ts` states for `SECTION_TEXT`.
 */
function checkHookSpread(args: ModeCheckArgs): HardRuleFinding[] {
  const hooks = outputTextUnits(args.output).filter((u) => u.isHook);
  const out: HardRuleFinding[] = [];
  for (let i = 1; i < hooks.length; i++) {
    const shortEnoughToSkip =
      contentWords(hooks[i].text).length < HOOK_SPREAD_MIN_CONTENT_WORDS;
    for (let j = 0; j < i; j++) {
      // IDENTITY FIRST, BEFORE THE FLOOR AND BEFORE THE MEASURE. It is the one
      // question here with a right answer, it needs no overlap score, and both
      // of the escapes below would otherwise let it through: the floor skips
      // short hooks, and the order rescue silences every pair whose sets are
      // equal — which includes a hook copied verbatim (`sameFlattenedText`).
      if (sameFlattenedText(hooks[i].text, hooks[j].text)) {
        out.push(
          finding(
            "collapsed_variants",
            "identical",
            hooks[i].field,
            `${hooks[i].text} — the same hook as ${hooks[j].field}, word for word`
          )
        );
        break;
      }
      if (shortEnoughToSkip) continue;
      if (contentWords(hooks[j].text).length < HOOK_SPREAD_MIN_CONTENT_WORDS) {
        continue;
      }
      if (
        contentOverlap(hooks[i].text, hooks[j].text) <= HOOK_SPREAD_MAX_OVERLAP
      ) {
        continue;
      }
      // THE SAME WORDS IN A DIFFERENT ORDER IS NOT EVIDENCE OF ONE CLAIM —
      // see `sameContentWords`. Checked AFTER the threshold rather than
      // instead of it, so the only pairs this can silence are ones the
      // measure had already scored 1.000 — and, since the identity refusal
      // above runs first, a DIFFERENT order is now the only thing it silences.
      if (sameContentWords(hooks[i].text, hooks[j].text)) continue;
      out.push(
        finding(
          "collapsed_variants",
          "near-duplicate",
          hooks[i].field,
          `${hooks[i].text} — the same claim as ${hooks[j].field}: ${hooks[j].text}`
        )
      );
      // ONE FINDING PER HOOK, never one per pair: five wordings of one thesis
      // make ten pairs, and a refusal reading "collapsed_variants at 10 places"
      // about five hooks misdescribes where it fired.
      break;
    }
  }
  return out;
}

// --------------------------------------------------------- ideas, not topics
//
// R5 / REQ-C01 mode 7: ideas are delivered as hook + thesis + framework, never
// as a list of topics.

/**
 * The shortest a thesis can be and still assert something.
 *
 * A TOPIC LABEL IS SHORT BY NATURE ("audio gear", "morning routines"), and a
 * claim needs a subject and a predicate. Four is the floor rather than a
 * target: it catches the label and leaves ordinary short claims alone.
 *
 * ITS GAP IS REAL AND RECORDED: "Why morning routines matter" clears this floor
 * and is still a topic. See `KNOWN_MODE_CHECK_GAPS`.
 */
export const IDEA_THESIS_MIN_WORDS = 4;

const THESIS_IS_A_QUESTION = /\?\s*$/;

function checkIdeasNotTopics(args: ModeCheckArgs): HardRuleFinding[] {
  const out: HardRuleFinding[] = [];
  (args.output.ideas ?? []).forEach((idea, i) => {
    const field = `/ideas/${i}/thesis`;
    // ONE FINDING PER IDEA, most specific first: an idea that is its own hook
    // is not additionally interesting for being short.
    if (flatten(idea.hook) === flatten(idea.thesis)) {
      out.push(
        finding(
          "idea_is_a_topic",
          "hook-repeats-thesis",
          field,
          `the thesis is the hook again: ${idea.thesis}`
        )
      );
      return;
    }
    if (THESIS_IS_A_QUESTION.test(idea.thesis.trim())) {
      out.push(
        finding(
          "idea_is_a_topic",
          "thesis-is-a-question",
          field,
          `a question is not a claim: ${idea.thesis}`
        )
      );
      return;
    }
    if (wordCount(idea.thesis) < IDEA_THESIS_MIN_WORDS) {
      out.push(
        finding(
          "idea_is_a_topic",
          "thesis-not-a-claim",
          field,
          `a subject, not a claim: ${idea.thesis}`
        )
      );
    }
  });
  return out;
}

// ---------------------------------------------------- framework eligibility
//
// R1: "the registry reads only approved, non-retired shared frameworks plus the
// scoped profile's eligible private frameworks" — and verification 11 asks the
// ideation output for "hook + thesis + ELIGIBLE framework". A model that names
// a framework nobody offered has stepped outside the library the product
// curates, whatever the library happens to contain.

/** Lowercased, punctuation-flattened, for comparing two framework names. */
function flattenName(name: string): string {
  return flatten(name);
}

/**
 * Every framework an output NAMES, with where and under which provenance.
 *
 * THE TWO POSITIONS, as one population for both framework checks: the
 * document's own `/framework/name` and each idea's `/ideas/N/framework`.
 * `provenance` is `null` on a legacy document, which has none.
 */
function namedFrameworks(output: ScriptOutput): {
  field: string;
  name: string;
  provenance: "offered" | "custom" | null;
}[] {
  if (output.contractVersion === 2) {
    return [
      ...(output.framework
        ? [
            {
              field: "/framework/name",
              name: output.framework.name,
              provenance: output.framework.provenance,
            },
          ]
        : []),
      ...(output.ideas ?? []).map((idea, i) => ({
        field: `/ideas/${i}/framework`,
        name: idea.framework,
        provenance: idea.frameworkProvenance,
      })),
    ];
  }
  return [
    ...(output.framework
      ? [{ field: "/framework/name", name: output.framework.name, provenance: null }]
      : []),
    ...(output.ideas ?? []).map((idea, i) => ({
      field: `/ideas/${i}/framework`,
      name: idea.framework,
      provenance: null,
    })),
  ];
}

function checkFrameworkEligibility(args: ModeCheckArgs): HardRuleFinding[] {
  const offered = args.frameworks
    .map((f) => flattenName(f.name))
    .filter((n) => n.length > 0);
  // THE REVISIT TRIGGER THIS COMMENT CARRIED HAS FIRED (slice 7, stage C), and
  // the comment is corrected rather than left as a claim the code no longer has.
  //
  // WHAT IT USED TO SAY: "`packages/credits/src/generate.ts` passes
  // `frameworks: []` today (R-29 defers seeding the shared library), so this
  // check has no live path". That was true when it was written and is false now
  // — `generate.ts` reads `scope.accessors.eligibleFrameworks()`, bounds the set
  // with `frameworksForContext`, and passes it here for every mode whose spec
  // declares this check. The check therefore RUNS in production against a real
  // offer rather than never running at all.
  //
  // THE EARLY RETURN IS STILL CORRECT AND STILL REACHABLE, for the reason it
  // always had: treating "no library" as "nothing is eligible" would refuse
  // every script generation on a server whose shared library has not been
  // seeded, or for a profile whose eligible set is genuinely empty — a control
  // becoming the outage. What changed is that this is now the EXCEPTION rather
  // than every run. `mode-checks.test.ts`'s "with no library offered, nothing
  // is eligible-checked" still pins this branch — that assertion is about the
  // BEHAVIOUR, which is unchanged and still wanted; what changed is only the
  // reason the branch is reachable, and that file's comment says so too.
  if (offered.length === 0) return [];

  // A v2 `custom` STRUCTURE IS NOT A CLAIM TO HAVE USED AN OFFERED FRAMEWORK
  // (R-148 point 5), so it is not this check's to refuse; `framework_provenance`
  // holds it to the opposite rule — it may not carry an approved name. Every
  // `offered` name, and every legacy name, is checked here exactly as before.
  const named = namedFrameworks(args.output).filter(
    (n) => n.provenance !== "custom"
  );

  return named
    .filter(({ name }) => {
      const flat = flattenName(name);
      // CONTAINMENT IN EITHER DIRECTION, because a model decorates: "The Cost
      // Reveal framework" is the offered "cost reveal", and refusing over an
      // article and a noun would charge a creator for the model's manners.
      return !offered.some((o) => flat.includes(o) || o.includes(flat));
    })
    .map(({ field, name }) =>
      finding(
        "framework_not_offered",
        "not-in-library",
        field,
        `'${name}' is not one of the frameworks this generation was offered`
      )
    );
}

// ------------------------------------------------------------ weakest point
//
// R18 / REQ-I04 / non-negotiable 6: "every output names its weakest point", on
// EVERY mode — "not just on the two where it was easy".
//
// The SCHEMA already requires a non-blank `weakestPoint` for every mode
// (`output.ts`), and every mode spec requires the section. This is the third
// control and the only one that reads what the sentence SAYS.

/**
 * The shortest a weakest point can be and still name something.
 *
 * FOUR WORDS. "Timing, maybe" names nothing a creator can act on; "nothing here
 * has been measured" does. The floor is low on purpose — the cost of a false
 * positive is a rewrite the creator pays for.
 */
export const WEAKEST_POINT_MIN_WORDS = 4;

/**
 * Sentences that occupy the weakest-point field while naming no weakness.
 *
 * EVERY PATTERN IS ANCHORED OR PREDICATED, and that is the whole difference
 * between this list and a false-positive machine: the clean fixtures in this
 * package open their weakest point with "None of these has been tested…" and
 * "None of this has been checked…", which are the HONEST sentences. An
 * unanchored `none` would have refused both, and `mode-checks.test.ts` pins
 * that true negative against the real string rather than against a paraphrase.
 */
export const NAMES_NOTHING_SHAPES: readonly {
  id: string;
  pattern: RegExp;
  specimen: string;
}[] = [
  {
    id: "bare-none",
    pattern:
      /^\s*(?:none|nothing|n\/a|na|not applicable|no weakness|no weaknesses|no weak point|no weak points|unknown|tbd)\s*[.!]?\s*$/i,
    specimen: "None.",
  },
  {
    id: "denies-a-weakness",
    pattern:
      /\bthere\s+(?:are|is)\s+no\s+(?:real\s+|obvious\s+|significant\s+)?(?:weakness|weaknesses|weak\s+points?|downsides?|risks?|flaws?)\b/i,
    specimen: "There are no real weaknesses in this one.",
  },
  {
    id: "nothing-is-weak",
    pattern:
      /\bnothing\s+(?:is|seems|feels|looks)\s+(?:weak|wrong|off)\b|\bnothing\s+weak\s+(?:here|about)\b/i,
    specimen: "Nothing is weak about this angle.",
  },
  {
    id: "declares-it-strong",
    pattern:
      /^\s*(?:this|it|the\s+idea|the\s+hook)\s*(?:'s|’s|\s+is)\s+(?:a\s+)?(?:very\s+|really\s+)?(?:strong|solid|bulletproof|airtight|watertight)\b/i,
    specimen: "This is a strong idea all round.",
  },
  {
    id: "hard-to-say",
    pattern: /^\s*(?:hard|difficult|impossible)\s+to\s+say\b/i,
    specimen: "Hard to say, it depends on the edit.",
  },
];

function checkWeakestPoint(args: ModeCheckArgs): HardRuleFinding[] {
  const field = "/whyThisPerforms/weakestPoint";
  const { reasoning, weakestPoint } = args.output.whyThisPerforms;
  const shape = NAMES_NOTHING_SHAPES.find((s) => s.pattern.test(weakestPoint));
  if (shape) {
    return [finding("empty_weakest_point", shape.id, field, weakestPoint)];
  }
  if (flatten(weakestPoint) === flatten(reasoning)) {
    // A weakest point that is the explanation again has not named a weakness;
    // it has named the strength twice.
    return [
      finding(
        "empty_weakest_point",
        "repeats-the-reasoning",
        field,
        weakestPoint
      ),
    ];
  }
  if (wordCount(weakestPoint) < WEAKEST_POINT_MIN_WORDS) {
    return [finding("empty_weakest_point", "too-short", field, weakestPoint)];
  }
  return [];
}

// ------------------------------------------------- the creative checks (R-148)
//
// FOUR CHECKS, ALL OF THEM ON A VERSION-2 DOCUMENT AND THE REQUEST'S CREATIVE
// HALF, NONE OF THEM ON MEANING. Each question below has a right answer that
// code can compute — is this the form that was asked for, is this quote really
// in the creator's material, is this minute count under the declared limit, is
// this custom name an approved name — which is why they are hard rules and why
// none of them asks a model. What they do NOT decide (whether a quote is the
// event's real basis, whether a filming plan is realistic) is in
// `KNOWN_MODE_CHECK_GAPS`, driven.

/** One premise and filming plan, wherever it sits in the document. */
type CreativeUnit = {
  /** "" for the script's own, `/ideas/N` for a concept's. */
  prefix: string;
  form: NonNullable<ScriptOutputV2["form"]>;
  premise: Premise;
  filming: Filming;
};

/** Every premise in a v2 document — each concept's, or the script's own. */
function creativeUnits(output: ScriptOutputV2): CreativeUnit[] {
  const units: CreativeUnit[] = (output.ideas ?? []).map((d, i) => ({
    prefix: `/ideas/${i}`,
    form: d.form,
    premise: d.premise,
    filming: d.filming,
  }));
  if (output.form && output.premise && output.filming) {
    units.push({
      prefix: "",
      form: output.form,
      premise: output.premise,
      filming: output.filming,
    });
  }
  return units;
}

/**
 * THE V2 HALF OF A CHECK RUNS ONLY ON A V2 DOCUMENT WITH ITS CREATIVE CONTEXT.
 * `scanModeChecks` has already refused the two disagreeing combinations, so
 * `null` here means "legacy document, nothing to check" and nothing else.
 */
function v2Of(
  args: ModeCheckArgs
): { output: ScriptOutputV2; creative: CreativeCheckContext } | null {
  if (args.output.contractVersion !== 2 || args.creative === null) return null;
  return { output: args.output, creative: args.creative };
}

/**
 * R-148 point 1: an EXPLICIT choice binds every concept and the script; and
 * point 2: the pivot is a turn or a reveal according to the form.
 *
 * `auto` HAS NO FORM FINDING HERE, and that is not leniency: the reply schema's
 * `form` is the closed enum of the three supported forms, so a reply that
 * resolved "Choose for me" to anything else was refused at parse — no
 * generation, no debit — and never reaches this check.
 */
function checkCreativeForm(args: ModeCheckArgs): HardRuleFinding[] {
  const v2 = v2Of(args);
  if (v2 === null) return [];
  const out: HardRuleFinding[] = [];
  const requested = v2.creative.formChoice;
  for (const unit of creativeUnits(v2.output)) {
    if (requested !== "auto" && unit.form !== requested) {
      out.push(
        finding(
          "form_mismatch",
          "not-requested-form",
          `${unit.prefix}/form`,
          `written as ${unit.form}, and ${requested} was asked for`
        )
      );
    }
  }
  const script = v2.output;
  if (script.form && script.beats) {
    const index = script.beats.findIndex((b) => b.isTurn);
    const pivot = index >= 0 ? script.beats[index].pivot : undefined;
    const wanted = PIVOT_FOR_FORM[script.form];
    if (pivot !== undefined && pivot !== wanted) {
      out.push(
        finding(
          "form_mismatch",
          "pivot-wrong-kind",
          `/beats/${index}/pivot`,
          `the pivot is marked as the ${pivot}, and a ${script.form} script's pivot is the ${wanted}`
        )
      );
    }
  }
  return out;
}

/** Every word, lowercased, joined by one space — the match form for a quote. */
function quoteForm(text: string): string {
  return normalWords(text).join(" ");
}

/**
 * IS THIS EXCERPT REALLY IN THE CREATOR'S MATERIAL — word for word, ignoring
 * only case, punctuation and whitespace, and inside ONE document.
 *
 * ONE DOCUMENT AT A TIME, so a "quote" stitched from the end of one brain
 * sentence and the start of the next is not found. The space padding makes the
 * match whole-word: "burned the first loaf" does not match inside
 * "sunburned the first loafers".
 */
export function excerptIsInMaterial(
  excerptText: string,
  corpus: readonly string[]
): boolean {
  const needle = quoteForm(excerptText);
  if (needle.length === 0) return false;
  return corpus.some((doc) => ` ${quoteForm(doc)} `.includes(` ${needle} `));
}

/**
 * The words two texts are compared on: content words with a trailing plural
 * `s` folded ("lights" and "light" are one thing). Deliberately crude; used by
 * the basis relatedness floor and the declared-resource cover, so the two
 * cannot disagree about what a word is. Framework names fold further
 * (`nameFold`), on top of this one.
 */
function foldedWord(w: string): string {
  const spelling = T_PAST_SPELLINGS[w];
  if (spelling !== undefined) return spelling;
  return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

/**
 * Past forms with two spellings, folded to the `-ed` one (round-4 compliance
 * gate, Low): "I burnt the first loaf" says what "I burned the first loaf"
 * says. A closed list, not a stemmer.
 */
const T_PAST_SPELLINGS: Readonly<Record<string, string>> = {
  burnt: "burned",
  learnt: "learned",
  spelt: "spelled",
  dreamt: "dreamed",
  leapt: "leaped",
  spilt: "spilled",
  smelt: "smelled",
};

function resourceWords(text: string): Set<string> {
  return new Set(contentWords(text).map(foldedWord));
}

/**
 * DOES THIS VERIFIED QUOTE RELATE TO THIS TEXT — at least
 * `BASIS_RELATED_MIN_CONTENT_WORDS` of the quote's content words appear in it.
 *
 * Read against THE LINE THAT NARRATES AN EVENT (R-150 point 1), never against a
 * field a label selected: a genuine line of the creator's about one thing must
 * not vouch for an invented event on another line. A floor, not a meaning
 * test: `KNOWN_MODE_CHECK_GAPS` records what still passes it.
 */
export function excerptRelatesTo(excerptText: string, eventText: string): boolean {
  const event = resourceWords(eventText);
  let shared = 0;
  for (const w of resourceWords(excerptText)) if (event.has(w)) shared += 1;
  return shared >= BASIS_RELATED_MIN_CONTENT_WORDS;
}

/** A passage without its `[check]` markers — what it says, not how it is marked. */
function unmarked(text: string): string {
  return text.split(CHECK).join(" ");
}

/** One narrated-event or claimed-result shape. */
export type EventShape = {
  id: string;
  pattern: RegExp;
  /**
   * A SECOND literal the SAME LINE must also match, for shapes whose verb is
   * ambiguous on its own: "I put the camera down" is an instruction until the
   * line also says when ("…yesterday", "…and walked away").
   */
  context?: RegExp;
  specimen: string;
};

/**
 * NARRATED EVENTS AND CLAIMED RESULTS, recognised from the TEXT (R-150 point 1;
 * round-1 and round-2 compliance gates).
 *
 * WHY THIS EXISTS. A model-authored label (the form) or a model-authored basis
 * kind must never decide whether a line is read. These shapes read what each
 * line of `EVENT_SCAN_POPULATION` actually SAYS, and `checkPremiseBasis` runs
 * them over every one of those lines whatever the form and whatever the basis.
 *
 * PRECISION FIRST, as everywhere a hard rule costs the creator a rewrite: the
 * narration shapes need a first- or second-person subject (or a compound one —
 * "me and my sister", "my sister and I") and a past form, with an optional
 * one-or-two-word adverb or quantifier between ("I nearly gave up", "we both
 * cried"); the `-ed` arm excludes the common present-tense words that end in
 * "ed"; a bare result verb that is everyday English ("worked", "lost", "won",
 * "dropped", "grew" …) counts only with an I/we/you subject or a my/your/our
 * owner; and a past form that is spelled like its present ("quit", "put",
 * "hit", "set" …) counts only when the same line also says it is past. A
 * "you" counts only where it opens a clause — at the start of the line, after
 * punctuation, or after a conjunction or a time word ("…and you dropped it",
 * "last year you lost") — because "the setting you skipped" and "the room tone
 * you ignored" are the generic you of advice, not a narrated event. What
 * they still miss, and what they still refuse that is honest, is recorded in
 * `KNOWN_MODE_CHECK_GAPS` with a driver. Every pattern is a LITERAL and every
 * shape carries a specimen `mode-checks.test.ts` asserts it matches.
 */
export const EVENT_SHAPES: readonly EventShape[] = [
  {
    id: "first-person-past",
    pattern:
      /\b(?:i|we|me\s+and\s+(?:my|our|a|the)\s+[a-z]+|[a-z]+\s+and\s+i)\s+(?:(?:(?!(?:apply|reply|supply|rely|fly|imply|comply|multiply)\b)[a-z]{2,}ly|all|both|almost|already|just|once|never|then|also|still|even|first)\s+){0,2}(?!(?:need|feed|speed|seed|proceed|succeed|exceed|bleed|breed|weed|indeed)\b)(?:[a-z]+ed|went|made|got|took|saw|found|did|had|ran|won|lost|built|bought|sold|grew|shot|spent|left|kept|broke|burnt|wrote|told|heard|learnt|began|became|came|gave|thought|knew|felt|fell|caught|drove|flew|ate|paid|met|forgot|brought|threw|woke|stood)\b/i,
    specimen: "I burned the first loaf and kept filming anyway.",
  },
  {
    id: "second-person-past",
    pattern:
      /(?:^|[,.;:!?—–]\s*|\b(?:and|but|so|then|when|once|because|until|after|before|yesterday|today|tonight|ago|year|week|month|night|time|day)\s+)you\s+(?:(?:(?!(?:apply|reply|supply|rely|fly|imply|comply|multiply)\b)[a-z]{2,}ly|all|both|almost|already|just|once|never|then|also|still|even|first)\s+){0,2}(?!(?:need|feed|speed|seed|proceed|succeed|exceed|bleed|breed|weed|indeed)\b)(?:[a-z]+ed|went|made|took|saw|found|did|had|ran|won|lost|built|bought|sold|grew|shot|spent|left|kept|broke|burnt|wrote|told|heard|began|became|came|gave|thought|knew|felt|fell|caught|drove|flew|paid|met|forgot|brought|threw)\b/i,
    specimen: "you dropped the camera into the sink on the first take",
  },
  {
    id: "perfect-narration",
    pattern:
      /(?:\b(?:i|we)|(?:^|[,.;:!?—–]\s*|\b(?:and|but|so|then|when|once|because|until|after|before|yesterday|today|tonight|ago|year|week|month|night|time|day)\s+)you)(?:['’]ve|\s+have|\s+had)\s+(?:(?:(?!(?:apply|reply|supply|rely|fly|imply|comply|multiply)\b)[a-z]{2,}ly|all|both|almost|already|just|once|never|then|also|still|even|first)\s+){0,2}(?!(?:need|feed|speed|seed|proceed|succeed|exceed|bleed|breed|weed|indeed)\b)(?:[a-z]+ed|been|done|made|gotten|taken|seen|found|had|run|won|lost|built|bought|sold|grown|shot|spent|left|kept|broken|burnt|written|told|heard|begun|become|come|given|known|felt|fallen|caught|driven|flown|eaten|paid|met|forgotten)\b/i,
    specimen: "I've tried every setting on this camera.",
  },
  {
    // "I'd" IS "I had" OR "I would", so the participle list here is the one
    // whose words cannot follow "would": no "come", "run", "become", "had".
    id: "contracted-pluperfect",
    pattern:
      /(?:\b(?:i|we)|(?:^|[,.;:!?—–]\s*|\b(?:and|but|so|then|when|once|because|until|after|before|yesterday|today|tonight|ago|year|week|month|night|time|day)\s+)you)['’]d\s+(?:(?:(?!(?:apply|reply|supply|rely|fly|imply|comply|multiply)\b)[a-z]{2,}ly|all|both|almost|already|just|once|never|then|also|still|even|first)\s+){0,2}(?!(?:need|feed|speed|seed|proceed|succeed|exceed|bleed|breed|weed|indeed)\b)(?:[a-z]+ed|been|done|made|gotten|taken|seen|found|built|bought|sold|grown|shot|spent|broken|written|told|heard|given|known|fallen|caught|eaten|paid|forgotten)\b/i,
    specimen: "I’d already filmed it twice",
  },
  {
    id: "base-form-past",
    pattern:
      /\b(?:i|we|me\s+and\s+(?:my|our|a|the)\s+[a-z]+|[a-z]+\s+and\s+i)\s+(?:(?:(?!(?:apply|reply|supply|rely|fly|imply|comply|multiply)\b)[a-z]{2,}ly|all|both|almost|already|just|once|never|then|also|still|even|first)\s+){0,2}(?:quit|put|hit|set|cut|let|shut|read)\b/i,
    context:
      /\b(?:yesterday|ago|last\s+(?:year|month|week|night|time|summer|winter|spring|autumn)|back\s+then|that\s+(?:day|night|morning|week|year)|in\s+(?:19|20)\d\d|was|were|had|did|went|came|caught|got|took|fell|broke|left|said|told|(?!(?:need|feed|speed|seed|proceed|succeed|exceed|bleed|breed|weed|indeed|hundred)\b)[a-z]{3,}ed)\b/i,
    specimen: "I quit my job last year to film full time",
  },
  {
    id: "result-claim",
    pattern:
      /\b(?:doubled|tripled|quadrupled|halved|skyrocketed|soared|plummeted|outperformed|outsold|went\s+viral|sold\s+out|blew\s+up)\b/i,
    specimen: "the video went viral overnight",
  },
  {
    // THE EVERYDAY RESULT VERBS, ONLY WITH AN OWNER (R-150 point 4): "the
    // cheap lights won every round" and "it worked" are opinions about how
    // things go; "my views jumped" and "we won" say something happened to
    // somebody.
    id: "owned-result",
    pattern:
      /(?:(?:\b(?:i|we)|(?:^|[,.;:!?—–]\s*|\b(?:and|but|so|then|when|once|because|until|after|before|yesterday|today|tonight|ago|year|week|month|night|time|day)\s+)you)\s+(?:(?:(?!(?:apply|reply|supply|rely|fly|imply|comply|multiply)\b)[a-z]{2,}ly|all|both|almost|already|just|once|never|then|also|still|even|first)\s+){0,2}|\b(?:my|your|our)\s+(?:[a-z'’-]+\s+){0,3})(?:worked|failed|lost|won|dropped|grew|rose|jumped|increased|decreased|succeeded|paid\s+off|took\s+off)\b/i,
    specimen: "my views jumped after the first post",
  },
];

/**
 * The first narrated-event or result shape ONE LINE carries, if any. A shape
 * with a `context` matches only when the same line matches that too.
 */
function eventShapeInLine(line: string): string | null {
  const shape = EVENT_SHAPES.find(
    (s) => s.pattern.test(line) && (s.context === undefined || s.context.test(line))
  );
  return shape ? shape.id : null;
}

/** The first narrated-event or result shape any line of a text carries, if any. */
export function eventShapeIn(text: string): string | null {
  for (const line of lines(text)) {
    const shape = eventShapeInLine(line);
    if (shape !== null) return shape;
  }
  return null;
}

/** Four-word runs with at least two content words — the unit a carried event is matched on. */
function eventRuns(text: string): Set<string> {
  const tokens = normalWords(text);
  const out = new Set<string>();
  for (let i = 0; i + 4 <= tokens.length; i++) {
    const run = tokens.slice(i, i + 4);
    if (run.filter((w) => !COMPARISON_STOPWORDS.has(w)).length >= 2) {
      out.add(run.join(" "));
    }
  }
  return out;
}

/**
 * EVERY V2 TEXT FIELD THE EVENT SCAN READS — A LIST, NOT A PRODUCER (CLAUDE.md
 * non-negotiable 7; R-150 point 1).
 *
 * Paths are the document's own keys with array indices dropped. Every string
 * leaf of a v2 document is either here or in `EVENT_SCAN_EXCLUDED` with its
 * reason, and `mode-checks.test.ts` walks a full concept batch and a full
 * script to assert exactly that — so a field added to the v2 schema is a red
 * test until somebody decides which list it belongs to.
 */
export const EVENT_SCAN_POPULATION = [
  "ideas.hook",
  "ideas.thesis",
  "ideas.premise.whatHappens",
  "ideas.premise.interest",
  "ideas.premise.payoff",
  "thesis.statement",
  "hooks.text",
  "hooks.mechanic",
  "premise.whatHappens",
  "premise.interest",
  "premise.payoff",
  "beats.vo",
  "onScreenText.text",
  "caption.text",
  // Round-3 compliance gate (Medium): DISPLAYED free text, so read by the same
  // per-line rule — a shot note can invent a trophy as surely as a beat can.
  "shotMap.shot",
  "shotMap.note",
  // `disclosure.platform` and `disclosure.guidance` were read here from the
  // round-4 compliance gate (Medium 4) because Studio RENDERED them. Audit
  // P1-R1 stopped every presentation of the model's disclosure section
  // (`/studio`, first-ideas and `/trends` show the product's sentence for the
  // disclosure kind; the saved pack overwrites it), so an invented event there
  // reaches no creator — and refusing over it would DEBIT a refusal for text
  // nobody reads. They moved to `EVENT_SCAN_EXCLUDED` with that reason (R-154).
] as const;

export type EventScanField = (typeof EVENT_SCAN_POPULATION)[number];

/**
 * The v2 string fields the event scan does NOT read, each with its reason.
 * Every one that a creator SEES is a recorded false negative
 * (`event-in-unscanned-field`), driven, and covered by the confirmation item
 * every v2 output carries (R-150 point 3) — never described as checked.
 */
export const EVENT_SCAN_EXCLUDED: Readonly<Record<string, string>> = {
  requestedForm: "server-stamped closed value",
  form: "closed value",
  "ideas.form": "closed value",
  "ideas.frameworkProvenance": "closed value",
  "framework.provenance": "closed value",
  "premise.basis.kind": "closed value",
  "ideas.premise.basis.kind": "closed value",
  "beats.pivot": "closed value",
  "filming.people": "closed value",
  "ideas.filming.people": "closed value",
  "premise.basis.excerpt": "the quote itself, verified against the creator's material by this check",
  "ideas.premise.basis.excerpt": "the quote itself, verified against the creator's material by this check",
  "filming.location":
    "displayed; the filming authority (`stampServerChecks`) shows it marked [check] unless the creator declared it, and it is NOT read for narrated events (gap: event-in-unscanned-field)",
  "filming.equipment":
    "displayed; the filming authority (`stampServerChecks`) shows each item marked [check] unless the creator declared it, and it is NOT read for narrated events (gap: event-in-unscanned-field)",
  "ideas.filming.location":
    "displayed; the filming authority (`stampServerChecks`) shows it marked [check] unless the creator declared it, and it is NOT read for narrated events (gap: event-in-unscanned-field)",
  "ideas.filming.equipment":
    "displayed; the filming authority (`stampServerChecks`) shows each item marked [check] unless the creator declared it, and it is NOT read for narrated events (gap: event-in-unscanned-field)",
  "ideas.framework": "displayed; a structure's name, read by `framework_provenance` and NOT for narrated events (gap: event-in-unscanned-field)",
  "framework.name": "displayed; a structure's name, read by `framework_provenance` and NOT for narrated events (gap: event-in-unscanned-field)",
  "framework.why": "displayed analysis of the structure, NOT read for narrated events (gap: event-in-unscanned-field)",
  "thesis.why": "displayed analysis of the thesis, NOT read for narrated events (gap: event-in-unscanned-field)",
  "caption.hashtags": "displayed tags, not sentences; NOT read for narrated events (gap: event-in-unscanned-field)",
  "whyThisPerforms.reasoning": "displayed analysis, NOT read for narrated events (gap: event-in-unscanned-field)",
  "whyThisPerforms.weakestPoint": "displayed analysis, NOT read for narrated events (gap: event-in-unscanned-field)",
  "serverChecks.filming.at": "server-owned pointer, never presented",
  // Audit P1-R1 / R-154: the model's disclosure section is stored and never
  // presented — every surface shows the product's sentence for the disclosure
  // kind instead — so it is not a place an invented event can mislead anyone.
  "disclosure.platform":
    "stored, never presented (R-121, audit P1-R1): `/studio`, first-ideas and `/trends` render `DISCLOSURE_LINE` and the saved pack overwrites the section (R-154)",
  "disclosure.guidance":
    "stored, never presented (R-121, audit P1-R1): `/studio`, first-ideas and `/trends` render `DISCLOSURE_LINE` and the saved pack overwrites the section (R-154)",
};

/** One scanned field instance: where it is, what it says, whose basis applies. */
type ScannedText = {
  field: string;
  text: string;
  /** The creative unit whose quoted basis may vouch for it: `/ideas/N` or "". */
  owner: string;
};

const EVENT_SCAN_READERS: Record<EventScanField, (o: ScriptOutputV2) => ScannedText[]> = {
  "ideas.hook": (o) =>
    (o.ideas ?? []).map((d, i) => ({ field: `/ideas/${i}/hook`, text: d.hook, owner: `/ideas/${i}` })),
  "ideas.thesis": (o) =>
    (o.ideas ?? []).map((d, i) => ({ field: `/ideas/${i}/thesis`, text: d.thesis, owner: `/ideas/${i}` })),
  "ideas.premise.whatHappens": (o) =>
    (o.ideas ?? []).map((d, i) => ({
      field: `/ideas/${i}/premise/whatHappens`,
      text: d.premise.whatHappens,
      owner: `/ideas/${i}`,
    })),
  "ideas.premise.interest": (o) =>
    (o.ideas ?? []).map((d, i) => ({
      field: `/ideas/${i}/premise/interest`,
      text: d.premise.interest,
      owner: `/ideas/${i}`,
    })),
  "ideas.premise.payoff": (o) =>
    (o.ideas ?? []).map((d, i) => ({
      field: `/ideas/${i}/premise/payoff`,
      text: d.premise.payoff,
      owner: `/ideas/${i}`,
    })),
  "thesis.statement": (o) =>
    o.thesis ? [{ field: "/thesis/statement", text: o.thesis.statement, owner: "" }] : [],
  "hooks.text": (o) =>
    (o.hooks ?? []).map((h, i) => ({ field: `/hooks/${i}/text`, text: h.text, owner: "" })),
  "premise.whatHappens": (o) =>
    o.premise ? [{ field: "/premise/whatHappens", text: o.premise.whatHappens, owner: "" }] : [],
  "premise.interest": (o) =>
    o.premise ? [{ field: "/premise/interest", text: o.premise.interest, owner: "" }] : [],
  "premise.payoff": (o) =>
    o.premise ? [{ field: "/premise/payoff", text: o.premise.payoff, owner: "" }] : [],
  "beats.vo": (o) =>
    (o.beats ?? []).map((b, i) => ({ field: `/beats/${i}/vo`, text: b.vo, owner: "" })),
  "onScreenText.text": (o) =>
    (o.onScreenText ?? []).map((t, i) => ({
      field: `/onScreenText/${i}/text`,
      text: t.text,
      owner: "",
    })),
  "caption.text": (o) =>
    o.caption ? [{ field: "/caption/text", text: o.caption.text, owner: "" }] : [],
  "hooks.mechanic": (o) =>
    (o.hooks ?? []).map((h, i) => ({ field: `/hooks/${i}/mechanic`, text: h.mechanic, owner: "" })),
  "shotMap.shot": (o) =>
    (o.shotMap ?? []).map((s, i) => ({ field: `/shotMap/${i}/shot`, text: s.shot, owner: "" })),
  "shotMap.note": (o) =>
    (o.shotMap ?? []).map((s, i) => ({ field: `/shotMap/${i}/note`, text: s.note, owner: "" })),
};

/** Every instance of every field in `EVENT_SCAN_POPULATION`, in list order. */
export function eventScanTexts(output: ScriptOutputV2): ScannedText[] {
  return EVENT_SCAN_POPULATION.flatMap((key) => EVENT_SCAN_READERS[key](output));
}

/**
 * THE SERVER-AUTHORED CONFIRMATION ITEM (R-150 point 3), worded so it reads
 * right for a story that happened and for a demonstration still to be filmed.
 */
export const EVENT_CONFIRMATION_ITEM = `Before you film: confirm every event and result here really happened (or will be filmed as shown), or mark it ${CHECK}.`;

/**
 * THE ITEM IS SHOWN ON EVERY VERSION-2 OUTPUT, AND ON NOTHING ELSE (round-3
 * compliance gate, High — the fifth member of the label-gating class).
 *
 * It used to be conditioned on the model's own form label, its own basis kind
 * and the recall-limited event shapes — so it was absent in exactly the gap it
 * exists to disclose: a present-tense invention ("a stranger knocks your
 * tripod over halfway through your best take") labelled `explain_opinion` with
 * basis `none` passed the gate AND showed no item. The only input now is the
 * server-stamped `contractVersion`, which no reply can author. Studio renders
 * it today; L4's export presenter must (`presentedEventConfirmation` on the
 * facade). `null` for a legacy output, which predates R-150.
 */
export function eventConfirmationFor(output: ScriptOutput): string | null {
  return output.contractVersion === 2 ? EVENT_CONFIRMATION_ITEM : null;
}

/** Shapes whose match states a RESULT, not an action (`quoteVouches`). */
const RESULT_SHAPE_IDS: ReadonlySet<string> = new Set(["result-claim", "owned-result"]);

/**
 * The shapes whose match names a first- or second-person SUBJECT and a past
 * verb — the ones a coordinated second verb (`CONTINUATION_SHAPE`) continues.
 */
const SUBJECT_SHAPE_IDS: ReadonlySet<string> = new Set([
  "first-person-past",
  "second-person-past",
  "perfect-narration",
  "contracted-pluperfect",
  "base-form-past",
]);

/** One event inside one line: which shape, and where its words sit. */
type EventMatch = { shape: string; start: number; end: number; text: string };

/**
 * What a match's leading characters are that are NOT what it says: punctuation,
 * and the clause-opening word that licenses a "you" ("and you dropped it" says
 * "you dropped"). A literal; the "you" alternation is `EVENT_SHAPES`' own.
 */
const MATCH_LEAD =
  /^[^\p{L}\p{N}]*(?:(?:and|but|so|then|when|once|because|until|after|before|yesterday|today|tonight|ago|year|week|month|night|time|day)\s+(?=you\b))?/iu;

/**
 * THE ONE STRUCTURAL CONTINUATION (round-4 compliance gate, Medium 2): a past
 * verb coordinated after a first- or second-person subject match — "…over and
 * over and won an award for it", "I quit my job last year [check] and won an
 * award" — shares that subject, so it is its own event and owns its own span.
 * It is read ONLY after a `SUBJECT_SHAPE_IDS` match on the same line, never on
 * its own. A LITERAL with a specimen; the `-ed` arm needs five letters and
 * excludes the common non-verbs that end in "ed", so "and red lights" is not
 * a verb. What it does not reach (another connector, a verb off the list) is
 * recorded in `event-narrated-without-past-tense`; no further shapes are
 * added round after round — the confirmation item covers the rest (R-150).
 */
export const CONTINUATION_SHAPE: EventShape = {
  id: "continuation",
  pattern:
    /(?:\band|\bbut|\bthen|,|—)\s*(?:then\s+)?(?!(?:need|feed|speed|seed|proceed|succeed|exceed|bleed|breed|weed|indeed|hundred|sacred|naked|wicked|kindred)\b)(?:[a-z]{3,}ed|went|made|got|took|saw|found|did|had|ran|won|lost|built|bought|sold|grew|shot|spent|left|kept|broke|burnt|wrote|told|heard|learnt|began|became|came|gave|thought|knew|felt|fell|caught|drove|flew|ate|paid|met|forgot|brought|threw|woke|stood)\b/i,
  specimen: "I quit my job last year [check] and won an award for it",
};

/** The last word of a continuation match — the verb it adds. */
const LAST_WORD = /[a-z]+$/i;

/**
 * Every EVENT in one line, in order: every `EVENT_SHAPES` match at every
 * position (trimmed by `MATCH_LEAD`; a shape with a `context` only on a line
 * the context matches), then every `CONTINUATION_SHAPE` verb after the first
 * subject match — with overlapping matches merged into one event (the earliest
 * shape names it), because "we won" read by two shapes is one claim.
 */
function eventMatchesInLine(line: string): EventMatch[] {
  const raw: EventMatch[] = [];
  for (const shape of EVENT_SHAPES) {
    if (shape.context !== undefined && !shape.context.test(line)) continue;
    // A FRESH global RegExp from the literal's own source, for `undeclaredKit`'s
    // reason: a shared /g regex carries `lastIndex` between calls.
    const re = new RegExp(shape.pattern.source, `${shape.pattern.flags}g`);
    for (const m of line.matchAll(re)) {
      const at = m.index ?? 0;
      const start = at + (MATCH_LEAD.exec(m[0])?.[0].length ?? 0);
      const end = at + m[0].length;
      if (end > start) raw.push({ shape: shape.id, start, end, text: line.slice(start, end) });
    }
  }
  const subjects = raw.filter((m) => SUBJECT_SHAPE_IDS.has(m.shape));
  if (subjects.length > 0) {
    const after = Math.min(...subjects.map((m) => m.end));
    const re = new RegExp(CONTINUATION_SHAPE.pattern.source, `${CONTINUATION_SHAPE.pattern.flags}g`);
    for (const m of line.matchAll(re)) {
      const at = m.index ?? 0;
      if (at < after) continue;
      const verb = LAST_WORD.exec(m[0])?.[0] ?? "";
      const end = at + m[0].length;
      if (verb.length > 0) {
        raw.push({ shape: CONTINUATION_SHAPE.id, start: end - verb.length, end, text: verb });
      }
    }
  }
  // STABLE sort: at one start, the longer match first, then `EVENT_SHAPES`
  // order — so the earliest-listed shape names a merged event.
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const events: EventMatch[] = [];
  for (const m of raw) {
    const last = events[events.length - 1];
    if (last !== undefined && m.start < last.end) {
      last.end = Math.max(last.end, m.end);
      last.text = line.slice(last.start, last.end);
    } else {
      events.push({ ...m });
    }
  }
  return events;
}

/** A sentence end: terminal punctuation followed by a space or the line's end. */
const SENTENCE_END = /[.!?…]+(?=\s|$)/g;

/**
 * THE SPAN AN EVENT OWNS (round-4 compliance gate, Medium 1 — the class fix
 * for mark adjacency): from its own start to the start of the next event or
 * anchor on the line, and never past the end of its own sentence. A `[check]`
 * counts only inside the span of the event it follows, so ONE MARK CAN NEVER
 * SATISFY TWO EVENTS, whatever joins them — a comma, a dash, "&", "plus",
 * "or", a parenthesis, a leading "When…". No list of joining words decides it;
 * position does. The sentence cap only ever shortens a span (a mark after the
 * full stop does not reach back), so it can refuse more, never pass more.
 */
function ownedSpan(line: string, from: number, matchEnd: number, nextStart: number): [number, number] {
  let to = nextStart;
  for (const s of line.matchAll(new RegExp(SENTENCE_END.source, SENTENCE_END.flags))) {
    const at = s.index ?? 0;
    if (at >= matchEnd && at < to) {
      to = at + s[0].length;
      break;
    }
  }
  return [from, to];
}

/**
 * The marker's own word ("check" inside "[check]") is not one of the
 * passage's words, so a run is matched across it: "…your tripod over [check]
 * halfway through…" is still one restatement of "…your tripod over halfway
 * through…".
 */
function wordSpansWithoutMarkers(line: string): { word: string; start: number; end: number }[] {
  return wordSpans(line).filter((s) => line.slice(s.start - 1, s.end + 1) !== CHECK);
}

/**
 * The stretches of a line that are, four words at a time, runs in `runs` —
 * overlapping runs joined — each with the runs that make it up.
 */
function runStretches(
  line: string,
  runs: ReadonlySet<string>
): { from: number; to: number; runs: string[] }[] {
  const spans = wordSpansWithoutMarkers(line);
  const out: { from: number; to: number; runs: string[] }[] = [];
  for (let i = 0; i + 4 <= spans.length; i++) {
    const run = spans.slice(i, i + 4).map((s) => s.word.toLowerCase());
    if (run.filter((w) => !COMPARISON_STOPWORDS.has(w)).length < 2) continue;
    const key = run.join(" ");
    if (!runs.has(key)) continue;
    const from = spans[i].start;
    const to = spans[i + 3].end;
    const last = out[out.length - 1];
    if (last !== undefined && from <= last.to) {
      last.to = Math.max(last.to, to);
      last.runs.push(key);
    } else {
      out.push({ from, to, runs: [key] });
    }
  }
  return out;
}

/**
 * DOES A VERIFIED QUOTE VOUCH FOR THIS EVENT (pass (b), round-3 compliance
 * gate, Medium). The event's context — the line from the previous event's
 * end to the end of this event's own span — must relate to the quote
 * (`BASIS_RELATED_MIN_CONTENT_WORDS`), AND the words that say what happened
 * must be the quote's own: the verb, for a narrated action ("I shot" on "shot
 * the same lens change over and over"); every content word, for a stated
 * result ("my channel doubled" needs "channel" and "doubled" in the quote). A
 * genuine line about a lens change no longer carries "it went viral" or "we
 * made a fortune" on its shared words.
 */
function quoteVouches(quote: string, context: string, m: EventMatch): boolean {
  if (!excerptRelatesTo(quote, context)) return false;
  const have = new Set(normalWords(quote).map(foldedWord));
  const said = RESULT_SHAPE_IDS.has(m.shape)
    ? contentWords(m.text).filter((w) => !/['’]/.test(w))
    : normalWords(m.text).slice(-1);
  return said.every((w) => have.has(foldedWord(w)));
}

/**
 * IS THE EVENT ITSELF INSIDE WORDS THE CREATOR WROTE (pass (c), round-3
 * compliance gate, Medium): its whole span lies inside a stretch of the line
 * that is, four words at a time, a run of the creator's own material. A line
 * that restates four of their words and then invents ("…over and over and it
 * went viral") does not pass on the restated half.
 */
function insideSharedRun(line: string, m: EventMatch, materialRuns: ReadonlySet<string>): boolean {
  return runStretches(line, materialRuns).some((r) => r.from <= m.start && m.end <= r.to);
}

/**
 * The first event on one line that none of the three passes clears, or
 * `undefined`. Each event is judged on its own: (a) a `[check]` inside the span
 * it owns (`ownedSpan`); (b) a verified quote that vouches for it
 * (`quoteVouches`); (c) its words lie inside the creator's own run
 * (`insideSharedRun`).
 */
function firstUnsupportedEvent(
  line: string,
  quotes: readonly string[],
  materialRuns: ReadonlySet<string>
): EventMatch | undefined {
  const events = eventMatchesInLine(line);
  return events.find((m, k) => {
    const next = k + 1 < events.length ? events[k + 1].start : line.length;
    const [from, to] = ownedSpan(line, m.start, m.end, next);
    if (line.slice(from, to).includes(CHECK)) return false; // (a)
    const context = line.slice(k > 0 ? events[k - 1].end : 0, to);
    if (quotes.some((q) => quoteVouches(q, context, m))) return false; // (b)
    if (insideSharedRun(line, m, materialRuns)) return false; // (c)
    return true;
  });
}

/**
 * R-148 point 4 as amended by R-150 point 1: PER MATCH, NEVER GATED.
 *
 * Every line of every field in `EVENT_SCAN_POPULATION` is read for narrated
 * events and claimed results — including a past verb coordinated after a
 * first- or second-person subject (`CONTINUATION_SHAPE`) — whatever the form
 * label and whatever the basis kind, and EVERY event on the line must pass on
 * its own:
 *   (a) a `[check]` lies inside the span it owns — from its own start to
 *       the next event, never past its sentence (`ownedSpan`); or
 *   (b) a VERIFIED quote — its own unit's material excerpt once that is proved
 *       to be in the creator's material, or one the parent's gate verified
 *       (`carriedBasis`) — vouches for it (`quoteVouches`); or
 *   (c) the match lies inside a four-word run of the creator's own material
 *       (their brain, their note, their declared limits) — it restates them
 *       (`insideSharedRun`).
 * The basis kind SUPPLIES QUOTES; it never switches the scan off.
 *
 * Around that floor, unchanged in kind: a quoted excerpt is verified (not
 * marked, long enough, really in the material, related to what the premise
 * says happens and pays off); a story or demonstration may not claim no basis;
 * an `unconfirmed` premise marks its event field and, for a script, a beat
 * that says the same event; and a revision may not restate its parent's marked
 * passage unmarked.
 */
function checkPremiseBasis(args: ModeCheckArgs): HardRuleFinding[] {
  const v2 = v2Of(args);
  if (v2 === null) return [];
  const { output, creative } = v2;
  const out: HardRuleFinding[] = [];
  const scanned = eventScanTexts(output);

  // ---- Each quoted basis, verified. Only a verified one supplies a quote.
  const verified = new Map<string, string>();
  for (const unit of creativeUnits(output)) {
    const { basis } = unit.premise;
    if (basis.kind !== "material") continue;
    const at = `${unit.prefix}/premise/basis/excerpt`;
    const text = basis.excerpt;
    if (text.includes(CHECK)) {
      out.push(
        finding(
          "unsupported_experience",
          "excerpt-is-unconfirmed",
          at,
          `a quote that carries ${CHECK} is not a confirmed basis: ${text}`
        )
      );
    } else if (
      wordCount(text) < BASIS_EXCERPT_MIN_WORDS ||
      contentWords(text).length < BASIS_EXCERPT_MIN_CONTENT_WORDS
    ) {
      out.push(
        finding(
          "unsupported_experience",
          "excerpt-too-short",
          at,
          `too short to be a quote of anything: ${text}`
        )
      );
    } else if (!excerptIsInMaterial(text, creative.basisCorpus)) {
      out.push(
        finding(
          "unsupported_experience",
          "excerpt-not-in-material",
          at,
          `not in your brain or in what you gave this generation: ${text}`
        )
      );
    } else {
      verified.set(unit.prefix, text);
      // WHAT THE PREMISE SAYS HAPPENS AND PAYS OFF, BOTH — never the field a
      // form label selects.
      if (!excerptRelatesTo(text, unmarked(`${unit.premise.whatHappens}\n${unit.premise.payoff}`))) {
        out.push(
          finding(
            "unsupported_experience",
            "excerpt-unrelated",
            at,
            `your words, but not about what this premise says happens: ${text}`
          )
        );
      }
    }
  }

  // ---- Every MATCH on every scanned line, whatever the form and the basis.
  const materialRuns = new Set<string>();
  for (const doc of creative.basisCorpus) for (const run of eventRuns(doc)) materialRuns.add(run);
  for (const s of scanned) {
    const own = verified.get(s.owner);
    const quotes = [...(own === undefined ? [] : [own]), ...creative.carriedBasis];
    for (const line of lines(s.text)) {
      // ONE FINDING PER LINE: the first event none of the three passes clears.
      const unsupported = firstUnsupportedEvent(line, quotes, materialRuns);
      if (unsupported === undefined) continue;
      out.push(
        finding(
          "unsupported_experience",
          `event-without-basis:${unsupported.shape}`,
          s.field,
          `this says something happened, or a result, and names no source for it and no ${CHECK}: ${line}`
        )
      );
    }
  }

  // ---- A REVISION MAY NOT DROP A PARENT'S `[check]` (round-1 compliance gate,
  // BLOCK, revision half; round-4 gate, Medium 3). The parent's marked
  // passages arrive WITH their marker (`carriedUnconfirmed`); it is removed
  // here before runs are compared. EACH RESTATEMENT on a line — a stretch of
  // the parent's marked runs — must carry its OWN `[check]`, inside the span
  // it owns under the same position rule as an event (`ownedSpan`): a mark in
  // another sentence of the field, or on another line, covers nothing. A
  // restatement this generation's own creator material now carries is
  // confirmed and needs no mark.
  const carried = new Set<string>();
  for (const text of creative.carriedUnconfirmed) {
    for (const run of eventRuns(unmarked(text))) carried.add(run);
  }
  if (carried.size > 0) {
    for (const s of scanned) {
      for (const line of lines(s.text)) {
        const restated = runStretches(line, carried);
        if (restated.length === 0) continue;
        const events = eventMatchesInLine(line);
        const bare = restated.find((r) => {
          if (r.runs.some((run) => excerptIsInMaterial(run, creative.basisCorpus))) return false;
          const next = Math.min(
            line.length,
            ...events.filter((e) => e.start >= r.to).map((e) => e.start),
            ...restated.filter((o) => o.from >= r.to).map((o) => o.from)
          );
          const [from, to] = ownedSpan(line, r.from, r.to, next);
          return !line.slice(from, to).includes(CHECK);
        });
        if (bare === undefined) continue;
        out.push(
          finding(
            "unsupported_experience",
            "parent-unconfirmed-unmarked",
            s.field,
            `the draft this revises marked this unconfirmed, and it is now stated without its own ${CHECK}: ${line}`
          )
        );
      }
    }
  }

  // ---- Per premise: the kind's own obligations. (A label making a rule
  // STRICTER is fine; only a label switching one off was the defect.)
  for (const unit of creativeUnits(output)) {
    const { basis } = unit.premise;
    const at = `${unit.prefix}/premise/basis`;
    if (basis.kind === "none" && unit.form !== "explain_opinion") {
      out.push(
        finding(
          "unsupported_experience",
          "no-basis-for-event",
          at,
          `a ${unit.form} describes an event or a result, and this one names no source for it`
        )
      );
      continue;
    }
    if (basis.kind !== "unconfirmed") continue;
    const eventFields = EVENT_FIELDS[unit.form];
    if (!eventFields.some((k) => unit.premise[k].includes(CHECK))) {
      out.push(
        finding(
          "unsupported_experience",
          "unconfirmed-without-check",
          `${unit.prefix}/premise/${eventFields[0]}`,
          `marked unconfirmed, and nothing here says ${CHECK}: ${unit.premise[eventFields[0]]}`
        )
      );
    }
    // THE MARK HAS TO BE ON A BEAT THAT SAYS THIS EVENT (round-2 compliance
    // gate, Low): a `[check]` on an unrelated beat leaves the one the creator
    // will say about the event unmarked.
    const event = unmarked(`${unit.premise.whatHappens}\n${unit.premise.payoff}`);
    if (
      unit.prefix === "" &&
      !(output.beats ?? []).some(
        (b) => b.vo.includes(CHECK) && excerptRelatesTo(unmarked(b.vo), event)
      )
    ) {
      out.push(
        finding(
          "unsupported_experience",
          "unconfirmed-script-beats-unmarked",
          "/beats",
          `the premise is unconfirmed, and no beat that says what happens carries ${CHECK}`
        )
      );
    }
  }
  return out;
}

// ------------------------------------------ the filming authority (R-148 pt 3)

/**
 * IS THIS ITEM SOMETHING THE CREATOR DECLARED — every content word of it inside
 * ONE declared entry. "your phone" is the declared "phone"; "phone on a tripod"
 * is not, because nobody said tripod.
 */
export function declaredCovers(item: string, declared: readonly string[]): boolean {
  const wanted = resourceWords(item);
  if (wanted.size === 0) return true;
  return declared.some((entry) => {
    const have = resourceWords(entry);
    return [...wanted].every((w) => have.has(w));
  });
}

/**
 * THE ONE AUTHORITY on whether a filming resource is the creator's own
 * declaration (R-148 point 3, strict reading — R-149 item 1). AN EMPTY OR
 * ABSENT LIST COVERS NOTHING: the absence of a declaration is never permission
 * to present a place or a piece of kit as something the creator has.
 */
export function filmingItemDeclared(item: string, declared: readonly string[]): boolean {
  return declared.length > 0 && declaredCovers(item, declared);
}

/**
 * Equipment a shot map can call for, and the people a solo creator does not
 * have. LITERALS with specimens; what they do not list is a recorded gap.
 */
export const SHOT_KIT_SHAPES: readonly { id: string; pattern: RegExp; specimen: string }[] = [
  {
    id: "kit",
    pattern:
      /\b(?:drones?|gimbals?|tripods?|sliders?|dolly|jib|cranes?|ring\s*lights?|softbox(?:es)?|light\s+kit|lav(?:alier)?\s+mics?|lapel\s+mics?|shotgun\s+mics?|microphones?|teleprompters?|green\s*screens?|second\s+camera|gopro|action\s+cam(?:era)?|stabili[sz]ers?)\b/gi,
    specimen: "a slow drone pass over the kitchen roof",
  },
];

export const SHOT_HELPER_SHAPES: readonly { id: string; pattern: RegExp; specimen: string }[] = [
  {
    id: "helper",
    pattern:
      /\b(?:second\s+(?:person|shooter|operator|pair\s+of\s+hands)|camera\s+operator|operator|friend|helper|assistant|crew|co-?host|someone\s+else|another\s+person|somebody\s+else)\b/i,
    specimen: "a friend holds the second camera over your shoulder",
  },
];

/** Every kit mention in a text that the declared equipment does not cover. */
function undeclaredKit(text: string, equipment: readonly string[]): string[] {
  const out: string[] = [];
  for (const shape of SHOT_KIT_SHAPES) {
    // A FRESH RegExp, for `scanTraceability`'s reason: a shared /g regex
    // carries `lastIndex` between calls.
    const re = new RegExp(shape.pattern.source, shape.pattern.flags);
    for (const m of text.matchAll(re)) {
      if (!filmingItemDeclared(m[0], equipment)) out.push(m[0]);
    }
  }
  return out;
}

/**
 * THE SERVER'S DECISION ON EVERY FILMING RESOURCE NO DECLARATION COVERS, STORED
 * AS STRUCTURE (R-148 point 3; R-150 point 2).
 *
 * APPLIED BY THE PIPELINE TO EACH PARSED V2 DRAFT, BEFORE THE KILL TEST, and
 * stored with it as `serverChecks`. THE MODEL'S WORDS ARE NOT TOUCHED: the
 * decision used to be appended to them as ` [check]`, which made it the same
 * token a model writes, so the traceability scan read the server's mark as the
 * model's own and stopped reporting the specific beside it (round-2 compliance
 * gate, High — "a camera rented for $400" passed clean). Every scanner now
 * reads the model's unmarked text; the presenter (`presentedFilming`,
 * `presentedShotMap` on the credits facade) renders the decision as `[check]`.
 *
 * Covered: every concept's and the script's filming location and equipment,
 * in `filmingSlots` order, and every shot-map line that names kit the declared
 * equipment does not cover.
 */
export function stampServerChecks(
  output: ScriptOutputV2,
  constraints: FilmingConstraints
): ScriptOutputV2 {
  const plans = [
    ...(output.ideas ?? []).map((d, i) => ({ at: `/ideas/${i}`, filming: d.filming })),
    ...(output.filming ? [{ at: "", filming: output.filming }] : []),
  ];
  return {
    ...output,
    serverChecks: {
      filming: plans.map(({ at, filming }) => ({
        at,
        location: !filmingItemDeclared(filming.location, constraints.locations),
        equipment: filming.equipment.flatMap((item, i) =>
          filmingItemDeclared(item, constraints.equipment) ? [] : [i]
        ),
      })),
      // PER FIELD (round-3 compliance gate, Low): kit named only in a note
      // marks the note, not the shot.
      shotMap: (output.shotMap ?? []).flatMap((s, index) => {
        const shot = undeclaredKit(s.shot, constraints.equipment).length > 0;
        const note = undeclaredKit(s.note, constraints.equipment).length > 0;
        return shot || note ? [{ index, shot, note }] : [];
      }),
    },
  };
}

/**
 * R-148 point 3: DECLARED LIMITS ARE BINDING. Solo means one person — in the
 * filming plan AND in the shot map; a time limit is a ceiling.
 *
 * AND THE STRICT READING'S BACKSTOP: any place, piece of equipment or shot-map
 * kit that no declaration covers must reach this gate either decided by the
 * server (`serverChecks`, stamped by `stampServerChecks` before the gate in the
 * pipeline, so these never cost a rewrite there) or marked `[check]` by the
 * model itself. They fire if something skips the stamp.
 */
function checkFilmingLimits(args: ModeCheckArgs): HardRuleFinding[] {
  const v2 = v2Of(args);
  if (v2 === null) return [];
  const limits = v2.creative.constraints;
  const checks = v2.output.serverChecks;
  const out: HardRuleFinding[] = [];
  for (const unit of creativeUnits(v2.output)) {
    const at = `${unit.prefix}/filming`;
    const f = unit.filming;
    const stamped = checks?.filming.find((e) => e.at === unit.prefix);
    if (limits.people === "solo" && f.people !== "solo") {
      out.push(
        finding(
          "filming_outside_limits",
          "needs-help",
          `${at}/people`,
          "needs a second person, and you said you film alone"
        )
      );
    }
    if (limits.maxMinutes !== null && f.minutes > limits.maxMinutes) {
      out.push(
        finding(
          "filming_outside_limits",
          "over-time",
          `${at}/minutes`,
          `needs ${f.minutes} minutes, and you said you have ${limits.maxMinutes}`
        )
      );
    }
    if (
      stamped?.location !== true &&
      !f.location.includes(CHECK) &&
      !filmingItemDeclared(f.location, limits.locations)
    ) {
      out.push(
        finding(
          "filming_outside_limits",
          "undeclared-location",
          `${at}/location`,
          `not a place you listed, and not marked ${CHECK}: ${f.location}`
        )
      );
    }
    f.equipment.forEach((item, i) => {
      if (stamped?.equipment.includes(i) === true) return;
      if (item.includes(CHECK) || filmingItemDeclared(item, limits.equipment)) return;
      out.push(
        finding(
          "filming_outside_limits",
          "undeclared-equipment",
          `${at}/equipment/${i}`,
          `not something you said you have, and not marked ${CHECK}: ${item}`
        )
      );
    });
  }
  (v2.output.shotMap ?? []).forEach((s, i) => {
    const entry = checks?.shotMap.find((e) => e.index === i);
    for (const [key, text] of [["shot", s.shot], ["note", s.note]] as const) {
      const stamped = entry?.[key] === true;
      const field = `/shotMap/${i}/${key}`;
      if (limits.people === "solo" && SHOT_HELPER_SHAPES.some((h) => h.pattern.test(text))) {
        out.push(
          finding(
            "filming_outside_limits",
            "shot-needs-help",
            field,
            `this shot needs someone else, and you said you film alone: ${text}`
          )
        );
      }
      if (!stamped && !text.includes(CHECK) && undeclaredKit(text, limits.equipment).length > 0) {
        out.push(
          finding(
            "filming_outside_limits",
            "shot-undeclared-equipment",
            field,
            `this shot needs kit you did not list, and is not marked ${CHECK}: ${text}`
          )
        );
      }
    }
  });
  return out;
}

/**
 * A framework name's own fold, on top of the plural one: `-ed` and `-al` are
 * dropped too, so "Cost Revealed" and "cost reveal", "The Confessional Arc" and
 * "The Confession Arc" read as one name (round-2 compliance gate, Medium). Both
 * sides of a comparison go through it, so an over-fold ("reveal" to "reve")
 * folds both alike.
 */
function nameFold(w: string): string {
  let out = foldedWord(w);
  if (out.length > 4 && out.endsWith("ed")) out = out.slice(0, -2);
  if (out.length > 4 && out.endsWith("al")) out = out.slice(0, -2);
  return out;
}

/**
 * Tokens a framework name is compared WITHOUT: the possessive `s`, the
 * articles, and "and" — the connector "&" and "/" spell too (neither is a word
 * character, so both already split). Every seeded library name opens "The …",
 * so with the article kept a custom "Confession Arc remix" did not carry "The
 * Confession Arc".
 */
const NAME_FILLER: ReadonlySet<string> = new Set(["s", "the", "a", "an", "and"]);

/**
 * A framework name's comparison tokens: words split on hyphens and apostrophes
 * too, filler dropped, `nameFold` applied — so "Open-Loop remix", "the
 * cost-reveal twist", "Cost Reveals", "Before & After" and "Before/After" all
 * reduce to the tokens of the approved name they carry.
 */
function nameTokens(name: string): string[] {
  return normalWords(name)
    .flatMap((w) => w.split(/['’-]+/))
    .filter((w) => w.length > 0 && !NAME_FILLER.has(w))
    .map(nameFold);
}

/**
 * DOES `name` CARRY `approved`: every approved token is one of the name's, in
 * any order ("Loop, Open"), or some run of the name's words, written together,
 * IS the approved name written together ("OpenLoop", "Open-loop" → "openloop").
 * Whole runs only, so "the slowburner" does not carry "slow burn".
 */
function carriesName(name: string, approved: string): boolean {
  const n = nameTokens(name);
  const a = nameTokens(approved);
  if (a.length === 0 || n.length === 0) return false;
  const have = new Set(n);
  if (a.every((t) => have.has(t))) return true;
  const joined = a.join("");
  for (let i = 0; i < n.length; i++) {
    for (let j = i + 1; j <= n.length; j++) {
      if (n.slice(i, j).join("") === joined) return true;
    }
  }
  return false;
}

/**
 * R-148 point 5 / REQ-D02 as amended: `offered` names an offered framework, and
 * `custom` NEVER carries an approved framework's name — so a creator can never
 * mistake an unreviewed structure for a reviewed one, and nothing the model
 * invents is ever attributed to the library.
 *
 * `offered` WITH NOTHING OFFERED IS REFUSED HERE and only here. The legacy
 * `framework_eligibility` deliberately stays silent on an empty library (its
 * docblock: "a control becoming the outage"); under v2 that reason is gone,
 * because `custom` is the honest way out, so claiming to have used an offered
 * framework when none was offered is a false provenance claim.
 *
 * THE FINDING NAMES ONLY THE MODEL'S OWN CUSTOM NAME, never the approved name
 * it clashed with: the finding reaches the rewrite prompt, and the approved
 * list (which includes eligible frameworks the budget did not offer) is never
 * rendered into a prompt.
 */
function checkFrameworkProvenance(args: ModeCheckArgs): HardRuleFinding[] {
  const v2 = v2Of(args);
  if (v2 === null) return [];
  const approved = v2.creative.approvedFrameworkNames;
  const out: HardRuleFinding[] = [];
  for (const named of namedFrameworks(v2.output)) {
    if (named.provenance === "offered") {
      if (args.frameworks.length === 0) {
        out.push(
          finding(
            "framework_not_offered",
            "offered-but-none-offered",
            named.field,
            `'${named.name}' is labelled as an offered framework, and this generation was offered none`
          )
        );
      }
      continue;
    }
    if (named.provenance !== "custom") continue;
    if (approved.some((a) => carriesName(named.name, a))) {
      out.push(
        finding(
          "custom_framework_name",
          "custom-carries-approved-name",
          named.field,
          `a custom structure named '${named.name}' carries the name of a framework in the library`
        )
      );
    }
  }
  return out;
}

// ------------------------------------------------------------------ the scan

/**
 * One implementation per check id.
 *
 * A `Record<ModeCheckId, …>`, so a check named in the registry with nothing
 * behind it is a COMPILE ERROR rather than a mode that declares a gate nobody
 * wrote.
 */
const CHECKS: Record<ModeCheckId, (args: ModeCheckArgs) => HardRuleFinding[]> =
  {
    source_fidelity: checkSourceFidelity,
    hook_spread: checkHookSpread,
    ideas_not_topics: checkIdeasNotTopics,
    framework_eligibility: checkFrameworkEligibility,
    weakest_point: checkWeakestPoint,
    creative_form: checkCreativeForm,
    premise_basis: checkPremiseBasis,
    filming_limits: checkFilmingLimits,
    framework_provenance: checkFrameworkProvenance,
  };

/**
 * Run the checks THIS MODE DECLARES over its parsed output.
 *
 * The mode decides, from the registry — so "which checks ran" is answerable
 * from data rather than by reading a scanner, and a mode that carries hooks
 * cannot silently skip REQ-C04.
 *
 * THE DOCUMENT'S VERSION AND THE REQUEST'S CREATIVE HALF MUST AGREE (R-148),
 * checked HERE — the one function every caller of the checks goes through —
 * rather than left to each check. A v2 document with no creative context would
 * otherwise pass all four creative checks by having nothing to compare against,
 * and a creative context over a legacy document would mean a creator's explicit
 * form and limits were silently never applied. Both are our defect, so both
 * are an assembly refusal and never a finding that spends the rewrite.
 */
export function scanModeChecks(args: ModeCheckArgs): HardRuleFinding[] {
  const isV2 = args.output.contractVersion === 2;
  const hasCreative = args.creative !== null;
  if (isV2 !== hasCreative) {
    throw new GenerationAssemblyError(
      isV2
        ? "a version-2 output was checked without the creative request it was written against"
        : "a creative request was checked against a legacy output, so its form and limits were never applied"
    );
  }
  if (isV2 && args.output.requestedForm !== args.creative!.formChoice) {
    throw new GenerationAssemblyError(
      "the output's stamped form choice is not the one this request carries"
    );
  }
  return modeSpec(args.mode).checks.flatMap((id) => CHECKS[id](args));
}

// ------------------------------------------------------------- stated limits

export const MODE_CHECK_GAP_IDS = [
  "topic-as-a-title",
  "paraphrased-summary",
  "same-claim-different-words",
  "generic-weakest-point",
  "reversal-reads-as-duplicate",
  "permutation-of-one-claim",
  "same-set-different-filler",
  // R-148 (launch L1).
  "real-quote-unrelated-event",
  "same-kit-different-name",
  // Round-1 compliance gate (2026-10-03): the residues of the event guard and
  // the shot-map scan.
  "event-narrated-without-past-tense",
  "shot-map-kit-not-in-list",
  // Round-2 compliance gate (2026-10-03), R-150: what the per-line scan still
  // refuses that is honest, what it still lets through, and the name fold's
  // residue.
  "honest-line-reads-as-event",
  // Round-4 gate: REOPENED. Round 3 deleted it as closed; the round-4 gate
  // measured what pass (c) still lets through, and it is recorded and driven.
  "shared-run-carries-invention",
  "event-in-unscanned-field",
  "kit-named-in-narrative",
  "custom-name-misspelt",
  "custom-name-shares-approved-words",
] as const;

export type ModeCheckGapId = (typeof MODE_CHECK_GAP_IDS)[number];

/**
 * WHAT THESE STAND-INS ARE MEASURED TO GET WRONG — IN BOTH DIRECTIONS.
 *
 * The shape `claims.ts`'s `KNOWN_VOCABULARY_GAPS` uses, and for its reason: a
 * limit that is pinned by a test is a fact, and a limit described in prose is a
 * hope. Every entry here is driven in `mode-checks.test.ts` through a
 * `Record<ModeCheckGapId, …>`, so a gap recorded without a driver is a compile
 * error — and a later slice that CLOSES one turns that test red rather than
 * quietly widening what this file claims.
 *
 * `direction` EXISTS BECAUSE THIS LIST WAS ONE-SIDED AND SAID SO NOWHERE
 * (spin-compliance gate, 2026-09-01). Every original entry is a MISS, and a
 * register of misses reads as "what this check lets through" — while the
 * expensive error here is the other one: a false positive costs the creator a
 * rewrite and, if it survives that, a refusal they were debited for. The
 * order-blind entries below were live, measured, and recorded in NO list at
 * all; the knowledge was even in the suite, where `mode-checks.test.ts`
 * removed a permutation from the lying fixture BECAUSE it scored 1.000, and
 * the creator-facing consequence of that same fact was never written down.
 *
 * A `false-negative` driver asserts the check finds NOTHING on a document that
 * deserves a finding. A `false-positive` driver asserts it finds SOMETHING on
 * a document that deserves none. Both are runs, not sentences.
 *
 * REVISIT TRIGGER, shared by all of them: a defect of one of these classes
 * reaching a creator is the signal to change the MECHANISM (a model-scored
 * rubric with its own gate, an embedding distance) rather than to add another
 * string to a list.
 */
export const KNOWN_MODE_CHECK_GAPS: readonly {
  id: ModeCheckGapId;
  check: ModeCheckId;
  /** Which error this is: something missed, or something honest refused. */
  direction: "false-negative" | "false-positive";
  what: string;
}[] = [
  {
    id: "topic-as-a-title",
    direction: "false-negative",
    check: "ideas_not_topics",
    what: "A topic dressed as a title — 'Why morning routines matter' — clears the word floor, is not a question and is not the hook, and is still a subject rather than a claim.",
  },
  {
    id: "paraphrased-summary",
    direction: "false-negative",
    check: "source_fidelity",
    what: "A summary rewritten word by word is still a summary. With no verbatim run and none of the register phrases, nothing here sees it — which is why R3 is reported as a proxy and not as coverage.",
  },
  {
    id: "same-claim-different-words",
    direction: "false-negative",
    check: "hook_spread",
    what: "Two hooks that assert the same thing in disjoint vocabulary overlap at zero. The measure is over words; REQ-C04 is about creative thesis.",
  },
  {
    id: "generic-weakest-point",
    direction: "false-negative",
    check: "weakest_point",
    what: "A true but generic weakest point ('nothing here has been measured yet') is indistinguishable from a specific one by any lexical test, and it is what a model reaches for.",
  },
  {
    id: "reversal-reads-as-duplicate",
    direction: "false-positive",
    check: "hook_spread",
    what: "Two hooks that assert OPPOSITE claims out of nearly the same words are refused as one hook. 'Cheap mics sound expensive when the room is right' against 'Expensive mics sound cheap when the room is wrong' scores 0.714 — above HOOK_SPREAD_MAX_OVERLAP — because the measure is a set and the reversal lives in the order. `sameContentWords` rescues only the pairs whose sets are IDENTICAL; this is the residue where the words differ too, and no threshold reaches it: the five wordings of one thesis this check exists to catch sit in the same 0.6-0.8 band. Separating them needs a mechanism that reads order or meaning.",
  },
  {
    id: "permutation-of-one-claim",
    direction: "false-negative",
    check: "hook_spread",
    what: "One instance of the rescue's predicate, which is SET EQUALITY over content words and not a permutation test: two hooks that are one claim REORDERED ('Film less and edit more today' / 'Edit more and film less today') share an identical content-word set, so the check stays silent. The predicate's other instances are recorded beside this one as `same-set-different-filler`, because a register that names only the reordering understates what it lets through. It is the cheaper error — the creator deletes a hook, rather than paying a credit for a refusal on a draft that was fine — and it is the same trade R-68 took for the traceability shapes.",
  },
  {
    id: "same-set-different-filler",
    direction: "false-negative",
    check: "hook_spread",
    what: "THE REST OF `sameContentWords`' PREDICATE, which is set equality and not reordering (spin-compliance gate, 2026-09-02). Two hooks whose content-word sets are equal are silenced however they differ, so the register's 'it is PERMUTATIONS ONLY' understated it in two measured ways. STOPWORD-ONLY DIFFERENCES: 'Shoot more and plan less' against 'You should shoot more, and then you plan less' both reduce to [shoot, plan, less] — the same claim in the SAME word order, differing only in filler, which is not a reordering at all. REPEATED CONTENT WORDS: 'Film less and edit more' against 'Film less, edit more, film less' — a set discards multiplicity, so saying a thing twice is invisible to it. Both measured through `scanModeChecks` at overlap 1.000 with an empty finding list. `sameFlattenedText` catches only the case where every word is identical, so it does not reach either of these.",
  },
  {
    id: "real-quote-unrelated-event",
    direction: "false-negative",
    check: "premise_basis",
    what: "The basis check proves the excerpt is REALLY in the creator's material, word for word, and that at least BASIS_RELATED_MIN_CONTENT_WORDS of its content words appear in what the premise says happens and pays off; a narrated match passes on the quote only if its clause shares that many words with IT and the words that say what happened are the quote's own — the verb, or for a result every content word (R-150 point 1, round-3 gate). Sharing two words is not being the basis of the event: an invented 'the lens change shatters the mirror' passes on the genuine quote 'shot the same lens change over and over'. Relating the two is a question of meaning. What bounds it is the quote's visibility — it is rendered beside the premise as 'The line of yours this rests on', with an instruction to check it supports what happens — and the confirmation item every version-2 output carries, whatever it says (R-150 point 3). Measured too (round-4 gate): an invented OBJECT on a vouched verb — 'I burned the whole kitchen down making the first loaf' on the genuine quote 'I burned the first loaf and kept filming anyway' — passes, because pass (b) vouches for the subject and the verb, never for what the verb did.",
  },
  {
    id: "same-kit-different-name",
    direction: "false-positive",
    check: "filming_limits",
    what: "A declared equipment list is compared on content words with a crude plural fold, so the same object under another name is not covered: 'smartphone' is not a declared 'phone', and 'mic' is not 'microphone'. In the product the server then decides the item is unconfirmed (`stampServerChecks`) and it is shown marked [check], costing the creator a needless mark rather than a rewrite; this check refuses it only if it ever reached the gate unstamped and unmarked, which is what the driver shows.",
  },
  {
    id: "event-narrated-without-past-tense",
    direction: "false-negative",
    check: "premise_basis",
    what: "The event guard (`EVENT_SHAPES`) reads first- and second-person PAST narration (with compound subjects and a one-or-two-word adverb slot), contracted and full perfects, base-form pasts on a line that also says when, and result verbs. An invented event written in the present tense ('a stranger knocks your tripod over halfway through your best take') or in the third person ('my neighbour knocked the light over') is not recognised and passes with a `none` basis. Also measured and not read: a base-form past with no past word on its line ('I quit my job to do this'), a second-person base-form past ('you put the camera down and it rolled'), an irregular past outside the list ('we swam out to the buoy'), an adverb slot of three words or more, a second-person past inside a clause ('the tripod you knocked over' — read as the generic you of advice), an everyday result verb with no owner ('the cheap lights won every round', R-150 point 4's narrowing), and a verb that shares an earlier subject but that `CONTINUATION_SHAPE` does not reach — joined by 'plus', '&', 'or' or ';' ('I quit my job [check] plus won an award'), or off its verb list ('I quit my job [check] and swam the channel'). By the round-4 gate's diagnosis no further shapes are added for these. None of these is refused. What covers them is not this check: every version-2 output carries the confirmation item whatever its form, basis or wording (R-150 point 3, `eventConfirmationFor`), and the presenter's copy for a `none` basis claims nothing.",
  },
  {
    id: "shot-map-kit-not-in-list",
    direction: "false-negative",
    check: "filming_limits",
    what: "Declared limits bind the shot map through two literal marker lists (`SHOT_KIT_SHAPES`, `SHOT_HELPER_SHAPES`). Kit or help phrased outside them ('film it from above on a pole camera', 'your sister holds the phone') is neither marked nor refused, and no place in a shot-map line is compared with the declared places at all.",
  },
  {
    id: "honest-line-reads-as-event",
    direction: "false-positive",
    check: "premise_basis",
    what: "The per-match scan cannot tell a narrated event from a general statement in the same grammar. 'You used to need a crew for this, and now one phone is enough' is an opinion, reads as second-person past, lies in no run of the creator's material and carries no [check] — so it is refused, costing a rewrite, and if the rewrite keeps it, a debited honest refusal. INDICATIVE, NOT A RATE (author-written lines, never a sample of model output): the round-3 compliance gate measured 12 of 20 generic hook, caption and beat lines refused — viewer-addressed past tense, 'we've all…', 'your …' results — and 2 of 5 honest paraphrases of the creator's own words; the round-4 gate re-measured 5 of 9 honest paraphrases of one loaf story refused BEFORE the burnt/burned fold. After the fold (`T_PAST_SPELLINGS`), this suite's own nine paraphrases of that story (`HONEST_LOAF_PARAPHRASES` in `mode-checks.test.ts`, which pins the count) refuse 3 of 9 — a changed verb ('I scorched the first loaf'), a coordinated verb the story does not use ('…and carried on filming'), and the verb in another form ('I filmed anyway' against the quote's 'filming'). The prompt tells the model that viewer-addressed past-tense lines and 'we've all' lines count as events and need a mark or the present tense (`CREATIVE_RULES`). The remedy line says the draft 'names no source that says it' rather than that it is not in their material, because the line may well be true. L6 measures the real rate on real drafts (R-150 point 4).",
  },
  {
    id: "shared-run-carries-invention",
    direction: "false-negative",
    check: "premise_basis",
    what: "Pass (c) vouches for an EVENT only when the event's own words lie inside a run of the creator's material, and every first- or second-person past verb — including one coordinated after the subject (`CONTINUATION_SHAPE`) — is its own event. What an invention glued onto a restated run can still carry is an event in no shape at all: 'today I shot the same lens change over and over and it made me famous' (a third-person 'it made', a present-tense result, a verb joined by 'plus' or '&') passes on the restated half. The confirmation item every version-2 output carries asks the creator to confirm it (R-150 point 3).",
  },
  {
    id: "event-in-unscanned-field",
    direction: "false-negative",
    check: "premise_basis",
    what: "`EVENT_SCAN_POPULATION` reads every premise field, hook, hook mechanic, idea hook and thesis, thesis statement, beat, shot-map shot and note, on-screen text, caption, and the model's disclosure platform and guidance (Studio renders both until audit P1-R1). What a creator sees and this check does NOT read is exactly the displayed fields `EVENT_SCAN_EXCLUDED` marks so: the analysis fields (`whyThisPerforms.reasoning`, `whyThisPerforms.weakestPoint`, `thesis.why`, `framework.why`), the structure names (`framework.name`, `ideas.framework`), the hashtags, and the filming location and equipment (which the filming authority shows marked [check] when undeclared, but never reads for a narrated event). An invented result written there ('this format doubled my views last month', in `whyThisPerforms.reasoning`) is not refused; the confirmation item every version-2 output carries is what asks the creator about it.",
  },
  {
    id: "kit-named-in-narrative",
    direction: "false-negative",
    check: "filming_limits",
    what: "Declared equipment binds the filming plan and the shot map. Kit named only in what happens or in a beat's VO ('I fly the drone over the bakery roof') is not compared with the declared equipment, so a solo creator with no drone is neither marked nor refused there. The narrative fields belong to the event scan; reading them for kit too is a second population over the same text, deferred until a real draft shows the miss.",
  },
  {
    id: "custom-name-misspelt",
    direction: "false-negative",
    check: "framework_provenance",
    what: "Names are compared on folded tokens, run-together forms and any-order containment. A misspelling ('the opne loop'), a name run together with other words ('TheOpenLoop'), a synonym ('Hidden Price Reveal' for 'Cost Reveal') or a translation is a different token, so a custom structure can still be named almost like an approved one; the custom label beside it ('A structure of its own: not one from the framework library, and not reviewed by a curator.') is what the creator reads.",
  },
  {
    id: "custom-name-shares-approved-words",
    direction: "false-positive",
    check: "framework_provenance",
    what: "Any-order containment refuses a custom name that merely USES an approved name's words: 'Open question, closed loop' carries 'open' and 'loop' and is refused against 'Open Loop'. The cost is one rewrite naming the structure differently; the opposite error is a custom structure the creator mistakes for a reviewed one.",
  },
];
