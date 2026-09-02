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
import {
  remedyFor,
  type HardRuleFinding,
  type HardRuleId,
} from "./hard-rules";
import { modeSpec, type ModeCheckId, type ModeId } from "./modes";
import { outputTextUnits, type ScriptOutput } from "./output";
import { excerpt, lines, wordCount, words } from "./text";

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
 * WHAT IT COSTS, stated rather than discovered: a genuinely collapsed pair
 * that IS an exact permutation ("Film less and edit more" / "Edit more and
 * film less") is now missed. That is recorded in `KNOWN_MODE_CHECK_GAPS` as
 * `permutation-of-one-claim`, with a driver, and it is the cheaper error —
 * the miss costs a creator a hook they can delete, the false positive costs
 * them a credit and a script that was fine.
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

  const named: { field: string; name: string }[] = [];
  if (args.output.framework) {
    named.push({ field: "/framework/name", name: args.output.framework.name });
  }
  (args.output.ideas ?? []).forEach((idea, i) => {
    named.push({ field: `/ideas/${i}/framework`, name: idea.framework });
  });

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
  };

/**
 * Run the checks THIS MODE DECLARES over its parsed output.
 *
 * The mode decides, from the registry — so "which checks ran" is answerable
 * from data rather than by reading a scanner, and a mode that carries hooks
 * cannot silently skip REQ-C04.
 */
export function scanModeChecks(args: ModeCheckArgs): HardRuleFinding[] {
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
    what: "The price of `sameContentWords`, and it is PERMUTATIONS ONLY: two hooks that ARE one claim REORDERED ('Film less and edit more' / 'Edit more and film less') share an identical content-word set, so the check stays silent. The rescue's predicate is set equality, which also contains LITERAL duplication — that half was live for one slice (three copies of one hook returned `usable`) and is now refused by `sameFlattenedText` before the rescue runs, with its own driver, so what remains recorded here is the reordering. It is the cheaper error — the creator deletes a hook, rather than paying a credit for a refusal on a draft that was fine — and it is the same trade R-68 took for the traceability shapes.",
  },
];
