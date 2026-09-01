// REQ-I03's traceability scan (slice 6 R19, slice card question 2).
//
// THE CLAIM, stated exactly as the card states it:
//
//   Every specific-shaped token in the output — a number, a date, a proper
//   noun, a place, a named quantity — is checked for membership in the union of
//   (the creator's active brain content, the input they gave this generation).
//   An unmatched token is an UNTRACEABLE SPECIFIC.
//
// AND THE LIMIT, which is the more important half. This is traceability, not
// verification: R-34 already narrowed the honest claim to "a claim is cited",
// never "the citation supports it", and this file does not widen it. It also
// cannot tell a creator whether a traced specific is TRUE. `TRACEABILITY_LIMIT_NOTE`
// is that sentence, and it is meant to be rendered next to the output rather
// than buried in a decision log.
//
// IT IS A RECALL CONTROL WITH KNOWN FALSE POSITIVES. A generic proper noun
// flags. That is the error this control chooses to make, so the behaviour is
// FLAG AND OFFER `[check]`, NEVER SILENTLY DELETE — deleting on a false
// positive corrupts the creator's script, and `[check]` is already a
// first-class token in `packages/db/src/brain-content.ts` and
// `packages/llm/src/assemble.ts`.
//
// ------------------------------------------------------------------
// WHY A FINDING CARRIES AN `enforcement` AND THE CARD DOES NOT MENTION ONE.
//
// The slice card asks this scan to be two things that cannot both be true of
// one verdict: tech-spec §3 step 3's HARD RULE ("invented specifics without
// `[check]`", which triggers a rewrite and then an honest refusal the creator
// paid a credit for) and question 2's RECALL CONTROL WITH KNOWN FALSE POSITIVES
// ("a generic proper noun will flag"). A hard rule that refuses on a known
// false positive refuses good scripts for a living.
//
// So the split is by SHAPE CONFIDENCE, and it is drawn where the card itself
// draws it:
//
//   - A MARKED QUANTITY — currency, a percentage, a multiplier, a date — is
//     unambiguously a claim about an amount or a time. Those shapes are
//     `enforcement: "hard"` and they are what `kill-test.ts` turns into an
//     `invented_specific` hard-rule finding.
//   - A BARE INTEGER IS NOT. R-64's first draft read "a digit string in a
//     script is a claim about a quantity", and the compliance gate measured
//     what that costs: an honest listicle hook ("The 5 mistakes that make
//     batch cooking taste like leftovers") was REFUSED, and the slice card's
//     question 4 DEBITS a refusal — a Free creator paying 1 of 25 monthly
//     credits for a script that was fine. A listicle count and a UI step
//     number are not claims about a quantity, so `plain-number` is
//     `enforcement: "flag"`.
//   - `proper_noun` is the shape question 2 names as the false-positive case.
//     It is `enforcement: "flag"`: surfaced with a `[check]` offer, never a
//     reason to refuse.
//   - THE `disclosure` SECTION IS FLAG-ONLY WHATEVER THE SHAPE, because the
//     corpus can never vouch for it: that guidance is the product's answer
//     about a platform's policy, not something the creator wrote, so every
//     specific in it is untraceable BY CONSTRUCTION. Enforcing there refuses
//     a draft over the one section the creator supplied no material for.
//
// This is the most reversible default — promoting a shape to "hard" later is
// one line, and un-refusing a creator's script is not — and it is recorded
// rather than assumed.
// ------------------------------------------------------------------
//
// EVERY REGEX IS A LITERAL and every shape carries a `specimen` a test asserts
// it matches (CLAUDE.md, 2026-08-21): a scan reporting no findings is otherwise
// indistinguishable from a scan that is not working.
import { CHECK } from "@respin/llm";

import { excerpt, type TextUnit } from "./text";

export type SpecificKind = "number" | "date" | "proper_noun";

/** Whether an untraceable specific may refuse a generation, or only flag it. */
export type TraceabilityEnforcement = "hard" | "flag";

export type TraceabilityFinding = {
  kind: SpecificKind;
  /** Which named shape matched — the discriminator a test plants. */
  shape: string;
  enforcement: TraceabilityEnforcement;
  /** The specific, exactly as it appears in the output. */
  token: string;
  /** RFC-6901-shaped pointer into the ScriptOutput document. */
  field: string;
  /** The sentence unit it sits in, so a reader sees the claim, not the word. */
  unit: string;
  /** UTF-16 offsets into the `TextUnit.text` this finding came from. */
  startUtf16: number;
  endUtf16: number;
};

/**
 * What the scan compares against: the creator's active brain content and the
 * input they gave THIS generation, as plain strings.
 *
 * PLAIN STRINGS, deliberately. `packages/modes` has no dependency on
 * `@respin/db` and must not gain one — flattening a brain document into the
 * strings it asserts is the caller's job, because the caller is the layer that
 * may name a brain kind (the same division `packages/llm/src/assemble.ts`
 * already draws for the voice inference).
 */
export type TraceabilityCorpus = {
  brain: readonly string[];
  input: readonly string[];
};

/**
 * The sentence a creator reads under the output (question 2: "the limit is
 * stated to the creator, not buried").
 *
 * It states what was checked, what the check is NOT, and that the control's
 * error direction is a false positive. It makes no claim from
 * `tests/support/forbidden-claims.ts`'s canon.
 */
export const TRACEABILITY_LIMIT_NOTE =
  "Every number, date and name in this draft was checked against your brain and against what you gave this generation. " +
  "That check is about where a specific came from — it is not about whether it is true. " +
  "An ordinary word or a common name can be flagged even when nothing is wrong with it, which is why the product offers a [check] marker instead of changing your words.";

/**
 * Words that are capitalised for grammar rather than because they name
 * something.
 *
 * THE ASYMMETRY IS THE WHOLE DESIGN, so it is stated: a word MISSING from this
 * list produces a FLAG (the safe direction — the creator sees a `[check]`
 * offer they can ignore), while a word wrongly ON it produces a MISS. Every
 * entry is a determiner, pronoun, auxiliary, conjunction or bare imperative —
 * none of them names a person, a place, a product or a quantity — so the miss
 * direction is bounded by construction rather than by review.
 */
export const COMMON_OPENERS: ReadonlySet<string> = new Set([
  "a", "about", "after", "all", "also", "an", "and", "another", "any", "anyone",
  "anything", "are", "as", "at", "be", "because", "been", "before", "both",
  "but", "by", "can", "could", "did", "do", "does", "each", "either", "else",
  "even", "every", "everyone", "everything", "few", "first", "for", "from",
  "get", "give", "go", "had", "has", "have", "he", "her", "here", "hers", "him",
  "his", "how", "i", "if", "imagine", "in", "is", "it", "its", "just", "keep",
  "last", "let", "listen", "look", "make", "many", "maybe", "me", "might",
  "more", "most", "much", "must", "my", "never", "next", "no", "nobody", "none",
  "not", "nothing", "now", "of", "on", "once", "one", "only", "or", "other",
  "our", "out", "over", "own", "people", "pick", "put", "remember", "say",
  "see", "she", "should", "show", "so", "some", "someone", "something", "start",
  "stop", "take", "tell", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "think", "this", "those", "though", "three", "to",
  "today", "tomorrow", "too", "try", "two", "up", "us", "use", "want", "was",
  "watch", "we", "were", "what", "when", "where", "which", "while", "who",
  "why", "will", "with", "without", "would", "yes", "yesterday", "yet", "you",
  "your", "yours",
]);

/**
 * The specific-shaped token families, IN PRIORITY ORDER.
 *
 * Order is load-bearing: `2026-08-31` must be read as one date and not as three
 * numbers, and `$40` as one quantity and not as the number `40`. A match that
 * overlaps a span an earlier shape already claimed is skipped.
 */
export const SPECIFIC_SHAPES: readonly {
  id: string;
  kind: SpecificKind;
  /**
   * Whether THIS shape may refuse a generation.
   *
   * PER SHAPE, NOT PER KIND, and the difference is a creator's credit. `$4,000`
   * and `5` are both `kind: "number"`; only one of them is a claim about an
   * amount, and a per-kind switch had no way to say so.
   */
  enforcement: TraceabilityEnforcement;
  pattern: RegExp;
  specimen: string;
}[] = [
  {
    id: "iso-date",
    kind: "date",
    enforcement: "hard",
    pattern: /\b\d{4}-\d{2}-\d{2}\b/g,
    specimen: "Filmed on 2026-08-31.",
  },
  {
    id: "month-date",
    kind: "date",
    enforcement: "hard",
    pattern:
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?(?:\s+\d{1,2}(?:st|nd|rd|th)?)?(?:,?\s+\d{4})?/g,
    specimen: "Filmed in March 2024.",
  },
  {
    id: "currency",
    kind: "number",
    enforcement: "hard",
    pattern: /[$£€]\s?\d[\d,]*(?:\.\d+)?/g,
    specimen: "It cost $40.",
  },
  {
    id: "percent",
    kind: "number",
    enforcement: "hard",
    pattern: /\b\d[\d,]*(?:\.\d+)?\s?%/g,
    specimen: "Views rose 12%.",
  },
  {
    id: "multiplier",
    kind: "number",
    enforcement: "hard",
    pattern: /\b\d[\d,]*(?:\.\d+)?x\b/g,
    specimen: "It ran 3x longer.",
  },
  {
    id: "plain-number",
    kind: "number",
    // FLAG, NOT HARD. A bare integer is a list length, a step number, an age,
    // a count of takes. The compliance gate measured a REFUSAL on the `5` in
    // "The 5 mistakes..." and on the `3` in "step 3 of the flow", and a
    // refusal is debited — so a hard bare-integer rule charges a creator for
    // an honest listicle.
    enforcement: "flag",
    pattern: /\b\d[\d,]*(?:\.\d+)?\b/g,
    specimen: "It took 412 takes.",
  },
  {
    id: "proper-noun",
    kind: "proper_noun",
    enforcement: "flag",
    // A capitalised word, or a run of them joined by single spaces. The literal
    // space (never `\s`) keeps a run inside one line.
    pattern: /\p{Lu}[\p{L}’'-]*(?:[ ]\p{Lu}[\p{L}’'-]*)*/gu,
    specimen: "I still play The Beatles.",
  },
];

/**
 * Fields where NO shape may refuse, stated as a LIST of pointer prefixes.
 *
 * A POPULATION, NOT A PATH (CLAUDE.md, 2026-08-29). `disclosure` is here
 * because its text is the product's answer about a platform's policy: the
 * creator's brain and their input can never contain it, so every specific in it
 * is untraceable by construction, and enforcing there refuses a draft over the
 * one section the creator supplied no material for. A second such section is a
 * line in this list, taken deliberately.
 *
 * `output.ts`'s `SECTION_TEXT` is what mints these pointers, and
 * `traceability.test.ts` derives the disclosure units from `outputTextUnits`
 * rather than from a hand-written string — so a renamed pointer is a red test
 * rather than a silently dead prefix.
 */
export const FLAG_ONLY_FIELD_PREFIXES: readonly string[] = ["/disclosure/"];

function enforcementFor(
  shape: { enforcement: TraceabilityEnforcement },
  field: string
): TraceabilityEnforcement {
  if (FLAG_ONLY_FIELD_PREFIXES.some((prefix) => field.startsWith(prefix))) {
    return "flag";
  }
  return shape.enforcement;
}

/** A word-like token, for both the corpus index and a proper noun's parts. */
const WORDLIKE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** A number as written, separators and all. */
const WRITTEN_NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Fold a token to the form membership is decided in.
 *
 * Currency symbols, percent signs and thousands separators are stripped,
 * because `$1,200` in a draft and `1200` in the creator's brain are the same
 * specific and a scan that flagged it is a scan nobody reads.
 */
function normalise(token: string): string {
  return token
    .normalize("NFC")
    .replace(/[$£€%]/g, "")
    .replace(/,/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Every token the corpus can vouch for.
 *
 * TWO PASSES, because one tokeniser cannot do both jobs: `WORDLIKE` reads
 * `1,200` as `1` and `200` (the comma is not part of a word), so a second pass
 * over `WRITTEN_NUMBER` adds the separator-stripped `1200` a draft would be
 * compared against.
 */
export function buildCorpusIndex(corpus: TraceabilityCorpus): Set<string> {
  const index = new Set<string>();
  for (const text of [...corpus.brain, ...corpus.input]) {
    for (const m of text.matchAll(WORDLIKE)) index.add(normalise(m[0]));
    for (const m of text.matchAll(WRITTEN_NUMBER)) index.add(normalise(m[0]));
  }
  index.delete("");
  return index;
}

/** A sentence unit with its offsets into the field text. */
type Span = { text: string; start: number };

/**
 * Sentence units WITH OFFSETS — the same unit `text.ts`'s `sentenceUnits`
 * yields, kept positioned so a finding can point at the token and `offerCheck`
 * can insert beside it.
 *
 * The separator class carries `\n` as well as sentence enders, so a unit never
 * spans a line break (a hook set is several outputs, not one paragraph).
 */
function spans(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(/[^.!?…\n]+/g)) {
    if (m[0].trim().length === 0) continue;
    out.push({ text: m[0], start: m.index });
  }
  return out;
}

/** Nothing but whitespace — what may sit between a specific and its marker. */
const GAP = /^\s*$/;

/** A capitalised word, for the mid-sentence census (finding 5). */
const CAPITALISED = /\p{Lu}[\p{L}’'-]*/gu;

/** Where a span's first word-like token starts, or -1 when it has none. */
function firstWordStart(text: string): number {
  const first = [...text.matchAll(WORDLIKE)][0];
  return first ? first.index : -1;
}

/**
 * Every `[check]` position in a span.
 *
 * `indexOf` on the SHARED `CHECK` constant rather than a pattern of its own:
 * the token is `@respin/llm`'s, and a second spelling of it here is the two
 * lists that diverge.
 */
function markerPositions(text: string): number[] {
  const out: number[] = [];
  let from = 0;
  let at = text.indexOf(CHECK, from);
  while (at >= 0) {
    out.push(at);
    from = at + CHECK.length;
    at = text.indexOf(CHECK, from);
  }
  return out;
}

/**
 * THE `[check]` EXEMPTION, SCOPED TO THE SPECIFIC — never to the sentence.
 *
 * WHY ADJACENCY AND NOT "SOMEWHERE IN THIS SENTENCE", which is what this
 * function replaced. A sentence-scoped exemption means ONE marker anywhere
 * clears EVERY specific beside it, and the compliance gate ran the real
 * pipeline on a draft with one marker per sentence: `$4,000`, `11`, `3` and
 * `2019` were all returned for display with `hardRules: []`. The model is
 * INSTRUCTED to emit this token (`assemble.ts`'s `GENERATION_SYSTEM` and
 * `REWRITE_INSTRUCTION`), so that shape is the likely one, not the exotic one.
 *
 * WHAT COUNTS AS ATTACHED: only whitespace between the marker and the span of
 * the specific, on either side. That is exactly what `offerCheck` writes and
 * what "write `[check]` in its place" produces, so the honest case still
 * clears; a marker two words away no longer vouches for anything.
 *
 * THE ERROR DIRECTION, stated: a model that writes `11 weeks [check]` meaning
 * the 11 gets a flag it did not deserve. That costs a `[check]` offer on a
 * flag shape and one rewrite on a hard one — the same price this file's header
 * already prices for a false positive, and the opposite of the price the
 * sentence-scoped version charged, which was a silently displayed invention.
 */
function markedAdjacently(
  text: string,
  start: number,
  end: number,
  markers: readonly number[]
): boolean {
  return markers.some((at) => {
    if (at >= end && GAP.test(text.slice(end, at))) return true;
    const after = at + CHECK.length;
    return after <= start && GAP.test(text.slice(after, start));
  });
}

/**
 * The words that appear capitalised somewhere OTHER than at the start of a
 * sentence, across every unit in this scan.
 *
 * FINDING 5's RESCUE LIST. A draft with no specifics at all produced six
 * proper-noun flags in the gate's run — `Sunday`, `Cook`, `Untested`, `Post`,
 * `TikTok` — five of which were only capitalised because a sentence started.
 * A real flagged name drowns in that. So a LONE sentence-initial capital is
 * skipped unless this census saw the same word capitalised mid-sentence, where
 * grammar is not what capitalised it.
 *
 * THE COST, stated rather than discovered: a genuine name that only ever
 * appears sentence-initially is MISSED. That miss is bounded by construction —
 * `proper-noun` is `enforcement: "flag"`, so the loss is one prompt to look,
 * never a refusal — and the census is taken over the WHOLE output rather than
 * one unit, which is the direction that rescues more names.
 */
function midSentenceCapitals(units: readonly TextUnit[]): Set<string> {
  const seen = new Set<string>();
  for (const unit of units) {
    for (const span of spans(unit.text)) {
      const opening = firstWordStart(span.text);
      for (const m of span.text.matchAll(CAPITALISED)) {
        if (m.index > opening) seen.add(normalise(m[0]));
      }
    }
  }
  return seen;
}

function traceable(
  token: string,
  kind: SpecificKind,
  index: ReadonlySet<string>
): boolean {
  // WHOLE TOKEN FIRST, with separators folded, so `1,200` in a draft matches
  // `1200` in the brain.
  if (index.has(normalise(token))) return true;
  // A NUMBER IS ONE SPECIFIC AND IS NEVER DECOMPOSED. Falling through to the
  // per-word rule below would let a brain that merely contains the digits `1`
  // and `200` vouch for the quantity `1,200` — a hard-enforcement finding
  // silently cleared by two unrelated tokens.
  if (kind === "number") return false;
  const parts = token.match(WORDLIKE) ?? [];
  // A MULTI-WORD NAME IS TRACEABLE ONLY IF EVERY WORD IS. The recall-preserving
  // direction: half a known name is still a specific the creator did not give.
  return parts.length > 1 && parts.every((p) => index.has(normalise(p)));
}

/**
 * Drop the leading grammar words off a capitalised run.
 *
 * "The Beatles" is a name with a determiner in front of it; dropping the whole
 * match because it starts with "The" would be a silent miss, and keeping "The"
 * in the token would make membership depend on a word nobody claims.
 */
function trimOpeners(
  match: string
): { token: string; offset: number } | null {
  const parts = [...match.matchAll(WORDLIKE)];
  let i = 0;
  while (i < parts.length && COMMON_OPENERS.has(parts[i][0].toLowerCase())) i++;
  if (i >= parts.length) return null;
  const from = parts[i].index;
  const last = parts[parts.length - 1];
  return { token: match.slice(from, last.index + last[0].length), offset: from };
}

/**
 * Scan the output's text units for untraceable specifics.
 *
 * PURE, AND IT MUTATES NOTHING. It returns findings; what happens next is the
 * caller's decision, and the only sanctioned change to the text is
 * `offerCheck`, which ADDS a marker (mutation M9 reddens on both halves).
 */
export function scanTraceability(
  units: readonly TextUnit[],
  corpus: TraceabilityCorpus
): TraceabilityFinding[] {
  const index = buildCorpusIndex(corpus);
  const midCaps = midSentenceCapitals(units);
  const out: TraceabilityFinding[] = [];

  for (const unit of units) {
    for (const span of spans(unit.text)) {
      // THE `[check]` EXEMPTION IS PER SPECIFIC, not per sentence — see
      // `markedAdjacently`. tech-spec §3 step 3's rule is "invented specifics
      // WITHOUT `[check]`", and the specific a marker vouches for is the one it
      // is attached to.
      const markers = markerPositions(span.text);
      const opening = firstWordStart(span.text);

      const used: [number, number][] = [];
      const overlaps = (s: number, e: number) =>
        used.some(([a, b]) => s < b && a < e);

      for (const shape of SPECIFIC_SHAPES) {
        // A FRESH RegExp PER SPAN. A module-level /g regex carries `lastIndex`
        // between calls, so sharing one would make the scan's result depend on
        // what it scanned before it — the most confusing kind of fail-open.
        const re = new RegExp(shape.pattern.source, shape.pattern.flags);
        for (const m of span.text.matchAll(re)) {
          let token = m[0];
          let local = m.index;
          if (shape.kind === "proper_noun") {
            const trimmed = trimOpeners(token);
            if (!trimmed) continue;
            local += trimmed.offset;
            token = trimmed.token;
          }
          const end = local + token.length;
          if (overlaps(local, end)) continue;
          // A LONE SENTENCE-INITIAL CAPITAL is grammar until the census says
          // otherwise. Skipped BEFORE the span is marked used, so it is as if
          // this shape never matched here.
          if (
            shape.kind === "proper_noun" &&
            (token.match(WORDLIKE) ?? []).length === 1 &&
            local === opening &&
            !midCaps.has(normalise(token))
          ) {
            continue;
          }
          used.push([local, end]);
          if (markedAdjacently(span.text, local, end, markers)) continue;
          if (traceable(token, shape.kind, index)) continue;
          out.push({
            kind: shape.kind,
            shape: shape.id,
            enforcement: enforcementFor(shape, unit.field),
            token,
            field: unit.field,
            unit: excerpt(span.text),
            startUtf16: span.start + local,
            endUtf16: span.start + end,
          });
        }
      }
    }
  }
  // Offsets ascending, so `offerCheck` and a UI read the same order.
  return out.sort((a, b) => a.startUtf16 - b.startUtf16);
}

/**
 * Offer `[check]` beside every flagged specific, returning a NEW string.
 *
 * THE ONE SANCTIONED EDIT, and it is additive. Nothing is removed, nothing is
 * reworded, and the original string is untouched — `traceability.test.ts`
 * asserts that stripping the added markers returns the input byte for byte, so
 * a version of this function that deleted the token could not pass.
 *
 * Applied right to left so an earlier insertion cannot shift a later offset.
 */
export function offerCheck(
  text: string,
  findings: readonly TraceabilityFinding[]
): string {
  const marks = [...findings]
    .map((f) => f.endUtf16)
    .filter((n) => n >= 0 && n <= text.length)
    .sort((a, b) => b - a);
  let out = text;
  let previous = -1;
  for (const at of marks) {
    if (at === previous) continue;
    previous = at;
    out = out.slice(0, at) + " " + CHECK + out.slice(at);
  }
  return out;
}
