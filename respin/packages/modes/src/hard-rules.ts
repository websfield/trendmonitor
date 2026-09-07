// The product's HARD integrity rules (tech-spec §3 step 3, slice 6 R5/R8).
//
// THESE ARE DETERMINISTIC APPLICATION CODE AND THEY NEVER GO TO A MODEL. A hard
// integrity rule decided by a model is a rule that can be talked out of firing
// — and `packages/db/src/brain-content.ts`'s `killtestContent` already states
// the other half: the creator's `rules` are their own criteria, and the
// product's hard rules "are SERVER-OWNED and deliberately not here", because "a
// rule the creator can edit or confirm away is not an integrity rule".
//
// FIVE RULES, THREE OF THEM HERE. tech-spec §3 step 3 lists four — fragment
// triads, antithesis constructions, invented specifics without `[check]`, and
// a hook over 14 words where the rule is active. The first, second and fourth
// are computable from the text alone and live in this file. The third needs the
// creator's brain and their input for this generation, so it is
// `traceability.ts`'s scan. The FIFTH is `forbidden_claim` (`claims.ts`) —
// REQ-I04's no-guarantee rule and REQ-I05's no-concealment rule, which were
// enforced only by the prompt until it existed. Both of those scans are
// converted into a finding of this shape by `kill-test.ts`, so that "which rule
// fired" (R7) reads the same way for all five.
//
// PRECISION IS A PRODUCT DECISION HERE, NOT A DETAIL. A hard-rule violation
// costs the creator one extra vendor call and, if the rewrite also fails, an
// honest refusal they paid a credit for (slice card question 4). So these three
// detectors target SHAPES that are specific to the tic rather than casting the
// widest net — the opposite trade from `traceability.ts`, which is deliberately
// a recall control because its consequence is a `[check]` offer, not a refusal.
//
// EVERY REGEX IS A LITERAL. Assembling one from a string loses a backslash and
// the scan silently matches nothing (CLAUDE.md, 2026-08-21); every antithesis
// shape below carries a `specimen` that a test asserts it matches, so a broken
// pattern is a red test rather than a clean report.
import {
  excerpt,
  lines,
  sentenceUnits,
  wordCount,
  type TextUnit,
} from "./text";

export const HARD_RULE_IDS = [
  "fragment_triad",
  "antithesis",
  "invented_specific",
  // THE FIFTH RULE, and it is not in tech-spec §3 step 3's list of four. It is
  // REQ-I04 and REQ-I05 made deterministic on MODEL-AUTHORED TEXT: until it
  // existed, "never claim reach, views, growth, or that anything is
  // guaranteed" and the whole of the no-concealment rule were enforced only by
  // the prompt, on the one text a creator actually reads. `claims.ts` decides
  // it; `kill-test.ts` folds the hard half in here, exactly as it does for
  // `invented_specific`.
  "forbidden_claim",
  "hook_too_long",
  // ---------------------------------------------------------------- slice 7
  //
  // THE PER-MODE RULES (`mode-checks.ts`), which are hard for the same reason
  // the five above are: each one is a property of the DOCUMENT that no prompt
  // can be trusted to hold. They differ from the first five in one way worth
  // stating — three of them (`summarised_source`, `collapsed_variants`,
  // `empty_weakest_point`) are computable STAND-INS for properties of meaning,
  // and `mode-checks.ts` carries the measured list of what each one misses.
  // They are appended rather than interleaved so `honestRefusal`'s declared
  // ordering does not shift for the rules that were already stored.
  "summarised_source",
  "collapsed_variants",
  "idea_is_a_topic",
  "framework_not_offered",
  "empty_weakest_point",
  // Slice 8's Spin-only pre-display release gate. This stays after the
  // established output rules so stored refusal ordering remains stable.
  "similarity",
] as const;

export type HardRuleId = (typeof HARD_RULE_IDS)[number];

/**
 * A hook's word ceiling (tech-spec §3 step 3).
 *
 * A CONSTANT, not config, and the choice is deliberate. `packages/config`'s
 * `RespinConfigV1` holds credit costs, allowances, model tiers and the SPIN
 * similarity thresholds; `/admin/config` edits that document with no deploy.
 * tech-spec §5 records why a hard compliance rule must not live there — "a
 * config home for a hard compliance rule would be a deploy-free path to weaken
 * it". The same argument covers this number. If it ever needs to be tunable,
 * that is a decision entry, not an edit.
 */
export const HOOK_MAX_WORDS = 14;

/** The longest a unit may be and still count as a fragment. */
export const FRAGMENT_MAX_WORDS = 3;

/**
 * The longest a unit may be for EQUAL LENGTH ALONE to be evidence of the tic.
 *
 * ONE WORD, and the number is the compliance gate's measurement rather than a
 * guess. "Buy it now. Use it once. Tell me later." is three three-word units of
 * identical length — an ordinary CTA, and under the old rule a hard-rule
 * violation costing the creator a rewrite and, on a second failure, a debited
 * refusal. Three sentences of the same length is a rhythm; three single-word
 * sentences is the figure ("Bold. Fearless. Unstoppable.").
 *
 * ANAPHORA IS UNAFFECTED and still runs to `FRAGMENT_MAX_WORDS`, because a
 * repeated opening word is a far stronger signal than a repeated length: "No
 * fluff. No filler. No excuses." is the tic at two words each.
 *
 * WHAT THIS GIVES UP, stated: an unlike-opening triad of two- or three-word
 * fragments ("Three shots. Two lights. One take.") is now MISSED. That is the
 * error this rule chooses, because its other error is charging a creator for a
 * script that was fine.
 */
export const EQUAL_LENGTH_MAX_WORDS = 1;

/** How many parallel fragments in a row make a triad. */
export const FRAGMENT_RUN = 3;

/** One rule violation, in the shape stage C stores on the generation (R7). */
export type HardRuleFinding = {
  rule: HardRuleId;
  /** Which named shape of the rule fired — the discriminator a test plants. */
  shape: string;
  /** RFC-6901-shaped pointer into the ScriptOutput document. */
  field: string;
  /** What was found, short enough to render. */
  excerpt: string;
  /**
   * What to do instead — STATIC COPY, never a claim about outcomes.
   *
   * It states a craft move, and it names no number, no platform and no result,
   * because non-negotiable 6 forbids invented specifics and guarantees on any
   * creator-facing surface.
   */
  remedy: string;
};

const REMEDIES: Record<HardRuleId, string> = {
  fragment_triad:
    "Three parallel fragments in a row read as filler. Say the thing once, in a sentence that carries a verb.",
  antithesis:
    "The not-X-but-Y shape sounds like a conclusion without doing the work. State the claim on its own, then give the evidence.",
  invented_specific:
    "This specific is in neither your brain nor what you gave this generation. Replace it with one you can point to, or mark it [check] and fill it in before you post.",
  forbidden_claim:
    "This says how the post will do once it is up, or how to avoid disclosing it. Neither is something this product can stand behind. Say what the idea does, and name what is weakest about it.",
  hook_too_long: `A hook over ${HOOK_MAX_WORDS} words stops being a hook. Cut it to the one claim that makes someone stay.`,
  summarised_source:
    "This repeats the source instead of rebuilding it. Take the one insight that changed something for you, drop the source's words and its order, and say what it cost you.",
  collapsed_variants:
    "These are wordings of one idea. A set earns its place when each entry could fail for a different reason — change what one of them claims, not how it is phrased.",
  idea_is_a_topic:
    "This is a subject, not an idea. An idea is a claim somebody could disagree with, plus the hook that opens it and the framework that carries it.",
  framework_not_offered:
    "This names a framework you were not given. Use one from the list you were offered, or say in the weakest point that none of them fits.",
  empty_weakest_point:
    "Every output names its weakest point, and this one names nothing. Say what would have to be true for this to work, and what you do not know yet.",
  similarity:
    "This stays too close to the reference. Change the subject, rewrite the hook in your own words, and alter at least one beat or turn.",
};

function finding(
  rule: HardRuleId,
  shape: string,
  unit: TextUnit,
  text: string,
): HardRuleFinding {
  return {
    rule,
    shape,
    field: unit.field,
    excerpt: excerpt(text),
    remedy: REMEDIES[rule],
  };
}

// ------------------------------------------------------------ fragment triads

/** The first word-like token of a unit, lowercased, or "" if it has none. */
const FIRST_WORD = /[\p{L}\p{N}]+/u;

/**
 * Three or more consecutive short units, on one line, that are PARALLEL.
 *
 * WHY PARALLELISM AND NOT "VERBLESSNESS". The obvious reading of "fragment" is
 * "has no finite verb", and the only way to decide that without a parser is a
 * hand-written list of English verbs — a list whose gaps are silent misses and
 * whose contents are a guess. The figure this rule is actually about is
 * asyndetic parallelism ("Bold. Fearless. Unstoppable.", "No fluff. No filler.
 * No excuses."), and parallelism IS computable: the units are all short, and
 * they either all run to the same length or all open on the same word.
 *
 * The precision this buys is the point. "Stop scrolling. You are wrong here.
 * Here is why." is three short sentences of three different shapes — ordinary
 * writing, and a creator refused for it would have paid a credit for nothing.
 * It does not fire, and `hard-rules.test.ts` pins that case as a true negative.
 *
 * THE EQUAL-LENGTH SHAPE IS THE NARROW ONE. It requires SINGLE-WORD units
 * (`EQUAL_LENGTH_MAX_WORDS`), because equal length on its own stops being
 * evidence the moment the units carry a verb and an object: "Buy it now. Use it
 * once. Tell me later." fired the old rule, and "It works. I tried. She left."
 * did too. Both are ordinary writing, and both cost a rewrite. Same-opening-word
 * runs keep the wider `FRAGMENT_MAX_WORDS` bound.
 */
export function scanFragmentTriads(unit: TextUnit): HardRuleFinding[] {
  const out: HardRuleFinding[] = [];
  for (const line of lines(unit.text)) {
    const units = sentenceUnits(line);
    const counts = units.map(wordCount);
    for (let i = 0; i + FRAGMENT_RUN <= units.length; i++) {
      const window = units.slice(i, i + FRAGMENT_RUN);
      const windowCounts = counts.slice(i, i + FRAGMENT_RUN);
      if (windowCounts.some((c) => c === 0 || c > FRAGMENT_MAX_WORDS)) continue;
      const sameLength =
        windowCounts.every((c) => c === windowCounts[0]) &&
        windowCounts.every((c) => c <= EQUAL_LENGTH_MAX_WORDS);
      const openers = window.map((u) =>
        (u.match(FIRST_WORD) ?? [""])[0].toLowerCase(),
      );
      const sameOpener = openers.every((o) => o.length > 0 && o === openers[0]);
      if (!sameLength && !sameOpener) continue;
      // THE OPENING-WORD SHAPE IS REPORTED when both hold, because it is the
      // more specific claim about the text and is the one a creator will
      // recognise ("you started three sentences with 'No'").
      out.push(
        finding(
          "fragment_triad",
          sameOpener ? "same-opening-word" : "equal-length-run",
          unit,
          window.join(". ") + ".",
        ),
      );
      // ONE FINDING PER LINE. A four-fragment run is the same defect as a
      // three-fragment run, and reporting it twice is the padding R6 forbids.
      break;
    }
  }
  return out;
}

// ----------------------------------------------------------------- antithesis

/**
 * The named antithesis shapes, each with the specimen that proves its pattern
 * still matches (`hard-rules.test.ts` iterates this list).
 *
 * ONE SPECIMEN PER SHAPE, for the reason `tests/support/forbidden-claims.ts`
 * gives for its own `CLAIM_SPECIMENS`: a typo in one pattern otherwise hides
 * behind another pattern's match and the suite stays green.
 *
 * ------------------------------------------------------------------
 * THE CROSS-SENTENCE SHAPES REQUIRE A REPEATED SUBJECT, NOT ADJACENCY.
 *
 * The shape these two replaced (`negated-then-its`) matched "any negated verb,
 * then a sentence starting with `it's`". The compliance gate measured both of
 * its error directions on real writing:
 *
 *   IT FIRED ON ORDINARY PROSE — "I don't shoot at night. It's too grainy."
 *   and "You can't fake this. It's the whole point of the video." Each false
 *   positive is a second vendor call, and two in a row is a refusal the creator
 *   is charged for (slice card question 4).
 *
 *   IT MISSED THE CANONICAL TIC — "It isn't talent, it's tempo.", "That's not
 *   luck. That's reps.", "You don't need a better camera. You need a better
 *   reason." The figure is a REPEATED SUBJECT answering itself, and adjacency
 *   is not that.
 *
 * So the pair is now bound by a BACKREFERENCE: the same subject — and, for the
 * verb shape, the same verb — has to come back on the other side of the
 * separator. That is what makes it parallelism rather than proximity.
 *
 * THE SEPARATOR IS EITHER PUNCTUATION, and it was a full stop only until this
 * pass. `its-not-its` gained the comma forms and the two backreference shapes
 * did not, so the SAME TIC fired or missed on punctuation alone — measured
 * across seven subject pairs, six of seven comma forms missed while all seven
 * full-stop forms fired:
 *
 *   MISS "That's not luck, that's reps."   FIRES "That's not luck. That's reps."
 *   MISS "You're not lazy, you're tired."  FIRES "You're not lazy. You're tired."
 *   MISS "We're not guessing, we're measuring."          (and three more)
 *
 * Only "It isn't talent, it's tempo." fired, and only because `its-not-its`
 * covers the literal subject `it`. The separator is now `[.!?]+` OR a comma,
 * semicolon or dash — the backreference is still what does the work, so the
 * five pinned true negatives ("I don't shoot at night, it's too grainy.") stay
 * clean in both punctuations, which is asserted in both punctuations.
 *
 * THE MISS THIS BUYS, stated: "This isn't a trick. It's a discipline." no
 * longer fires, because its subject changes. It is structurally identical to
 * "You can't fake this. It's the whole point of the video.", which is ordinary
 * writing — nothing computable separates them, so the pair is left alone in the
 * direction that does not charge a creator for a clean draft.
 * ------------------------------------------------------------------
 *
 * Every pattern is bounded by a class that excludes newline, and
 * `scanAntithesis` runs per LINE, so none of them reaches across a line break.
 */
export const ANTITHESIS_SHAPES: readonly {
  id: string;
  pattern: RegExp;
  specimen: string;
}[] = [
  {
    id: "its-not-its",
    // THE COMMA FORM, in all three spellings a model reaches for: "it's not",
    // "it isn't", "it is not". The last two were missing, and "It isn't talent,
    // it's tempo." is one of the strings the gate measured escaping.
    pattern:
      /\bit(?:['’]s\s+not|\s+is\s+not|\s+isn['’]?t)\b[^.!?\n]{1,80}[,;—–-]\s*it(?:['’]s|\s+is)\b/i,
    specimen: "It's not a hack, it's a habit.",
  },
  {
    id: "not-just-but",
    pattern: /\bnot\s+(?:just|only|merely|simply)\b[^.!?\n]{1,80}?\bbut\b/i,
    specimen: "This is not just a camera setting, but a whole way of shooting.",
  },
  {
    id: "repeated-subject-copula",
    // "<subject> is not X<sep> <same subject> is Y." The `\1` is the whole
    // control: without it, this is the pattern that fired on "I don't shoot at
    // night. It's too grainy."
    pattern:
      /\b(it|that|this|he|she|they|we|you|i)(?:['’]s\s+not|['’]re\s+not|\s+is\s+not|\s+are\s+not|\s+isn['’]?t|\s+aren['’]?t)\b[^.!?\n]{0,80}(?:[.!?]+\s+|\s*[,;—–-]\s*)\1(?:['’]s|['’]re|\s+is|\s+are)\b/i,
    specimen: "It isn't talent. It's tempo.",
  },
  {
    id: "repeated-subject-verb",
    // "<subject> doesn't <verb> X<sep> <same subject> <same verb> Y." TWO
    // backreferences, because the figure is the same verb coming back affirmed.
    pattern:
      /\b(i|you|we|they|it|that|this|he|she)\s+(?:do|does|did|can|could|will|would|should)(?:n['’]?t|\s+not)\s+(\w+)\b[^.!?\n]{0,80}(?:[.!?]+\s+|\s*[,;—–-]\s*)\1\s+\2\b/i,
    specimen: "You don't need a better camera. You need a better reason.",
  },
  {
    id: "less-more",
    pattern: /\bless\b[^.!?\n]{1,60},\s*more\b/i,
    specimen: "Less polish, more proof.",
  },
  {
    id: "stop-start",
    pattern: /\bstop\s+\w+ing\b[^.!?\n]{0,40},\s*start\s+\w+ing\b/i,
    specimen: "Stop guessing, start measuring.",
  },
];

export function scanAntithesis(unit: TextUnit): HardRuleFinding[] {
  const out: HardRuleFinding[] = [];
  for (const line of lines(unit.text)) {
    for (const shape of ANTITHESIS_SHAPES) {
      const m = line.match(shape.pattern);
      if (!m) continue;
      out.push(finding("antithesis", shape.id, unit, m[0]));
      // ONE FINDING PER LINE, the rule `scanFragmentTriads` already follows and
      // for its reason: "reporting it twice is the padding R6 forbids".
      //
      // IT BECAME LOAD-BEARING WITH THE COMMA SEPARATOR. `its-not-its` and
      // `repeated-subject-copula` now describe the same figure for the subject
      // `it` — "It's not a hack, it's a habit." matches both — and two findings
      // for one tic is not a stronger signal, it is a wrong count: a refusal
      // over that line printed `antithesis at 2 places` for one place, because
      // `honestRefusal` reads the FIELD when a rule fired once and the COUNT
      // when it fired more. The shapes are ordered most-specific first, so the
      // reported id is the one a creator will recognise.
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- hook length

/**
 * A hook over `HOOK_MAX_WORDS` words, on hook-bearing fields only.
 *
 * "Where the rule is active" is decided by the FIELD (`TextUnit.isHook`), which
 * `output.ts` derives from the mode's own section spec. A VO beat may run long;
 * a hook may not. Nothing a creator can set turns this off — see `text.ts`'s
 * note on why the hard rules are server-owned.
 */
export function scanHookLength(unit: TextUnit): HardRuleFinding[] {
  if (!unit.isHook) return [];
  const n = wordCount(unit.text);
  if (n <= HOOK_MAX_WORDS) return [];
  return [
    {
      rule: "hook_too_long",
      shape: "over-word-cap",
      field: unit.field,
      excerpt: `${n} words (cap ${HOOK_MAX_WORDS}): ${excerpt(unit.text, 90)}`,
      remedy: REMEDIES.hook_too_long,
    },
  ];
}

// ------------------------------------------------------------------- the scan

/**
 * The three rules computable from the text alone, over every unit.
 *
 * `invented_specific` is DELIBERATELY ABSENT: it needs the corpus, so it is
 * produced by `traceability.ts` and folded in by `kill-test.ts`. A test pins
 * that absence, because a scan that answered a fourth rule from the text alone
 * would be inventing the corpus.
 */
export function scanTextOnlyHardRules(
  units: readonly TextUnit[],
): HardRuleFinding[] {
  return units.flatMap((u) => [
    ...scanFragmentTriads(u),
    ...scanAntithesis(u),
    ...scanHookLength(u),
  ]);
}

/** The static remedy copy, exposed so a surface renders it rather than guessing. */
export function remedyFor(rule: HardRuleId): string {
  return REMEDIES[rule];
}
