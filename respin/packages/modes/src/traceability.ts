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
  /*
   * TWO CHANNELS, AND THE SPIN REFERENCE IS DELIBERATELY NOT A THIRD (R-97).
   * `GenerationContext.reference` — another creator's mechanism, rendered in
   * the spin prompt — has no slot here and `traceabilityCorpusFor` never reads
   * it: a specific that appears only in that block is one the creator never
   * gave, and it is refused as untraced exactly as a framework blurb's would
   * be. `spin-reference.test.ts` plants one and reddens on mutation M4 (the
   * block added to `input`).
   */
  brain: readonly string[];
  input: readonly string[];
  /**
   * Specifics that appear in `input` but that `input` DOES NOT VOUCH FOR.
   *
   * WHY THE CORPUS NEEDS A NEGATIVE AT ALL. A revision's `input` carries the
   * draft it revises, and that draft is this product's own output rather than
   * the creator's words. It was gated once — but "gated" is not "vouched for":
   * `traceability.ts` reports a `plain-number` or a `proper-noun` as a FLAG
   * and reports EVERY shape in a `FLAG_ONLY_FIELD_PREFIXES` section as a flag,
   * so a hard-shaped specific can sit in a stored parent draft having never
   * been traced to anything. Measured, on this build: a `$4,000` in a parent's
   * `/disclosure/guidance` (flag-only by field) was accepted with no finding
   * at all when the revision put it in a HOOK.
   *
   * So a revision's caller passes the parent's own reported specifics here and
   * they are removed from the index. It is the caller's job — and only the
   * caller can do it — to remove nothing the creator's own material carries;
   * `generate.ts`'s `unvouchedSpecifics` is that filter, and its false branch
   * is driven.
   */
  unvouched?: readonly string[];
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
    // THE `(?!\d)` ON THE DAY GROUP IS LOAD-BEARING, and it is the only thing
    // making this shape's extent agree with `buildCorpusIndex`, which reads
    // the creator's material with a DIFFERENT pair of regexes (`WORDLIKE` +
    // `WRITTEN_NUMBER`). Without it the optional day group is greedy with no
    // digit boundary, so "March 2024" tokenised as "March 20" — the year eaten
    // as a day-of-month — and the rule failed in BOTH directions, both of them
    // measured end to end through `runGeneration` (slice 8c round 1):
    //
    //   FAIL-OPEN. A brain holding "in June" and any bare `20` ("20 minutes")
    //   vouched for the span "June 20" of an INVENTED "June 2019" — `traceable`
    //   decomposes it to `june` + `20`, both present — and the over-wide span
    //   then made `plain-number`'s match on `2019` OVERLAP and be skipped. Zero
    //   findings, rendered under `TRACEABILITY_LIMIT_NOTE`'s claim that every
    //   number and date was checked. That is REQ-I03.
    //
    //   FALSE REFUSAL. A creator's own "March 2024" was refused after two paid
    //   vendor calls, quoting 'March 20' — a token absent from their draft —
    //   and `REWRITE_INSTRUCTION`'s remedy could not clear it, because a marker
    //   written beside the date left "24 " between the match end and the
    //   marker.
    //
    // `traceability.test.ts` pins both directions, the round trip over every
    // shape, and each date form's exact token.
    pattern:
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?(?:\s+\d{1,2}(?:st|nd|rd|th)?(?!\d))?(?:,?\s+\d{4})?/g,
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
 *
 * INTERNAL WHITESPACE IS COLLAPSED, because a token may now be COMPOSITE — a
 * `month-date` is one key such as `march 20 2024`, and `"March 20,  2024"` and
 * `"March 20, 2024"` are the same specific written twice. Folding the comma
 * away is what already made `20,` and `20` agree; folding the run of spaces is
 * the same fold one character wider.
 */
function normalise(token: string): string {
  return token
    .normalize("NFC")
    .replace(/[$£€%]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A CORPUS DOCUMENT WITH ITS `[check]`-MARKED SPECIFICS REMOVED.
 *
 * WHY A DOCUMENT IN THE CORPUS MAY CARRY A MARKER AT ALL. `GenerationContext`
 * has one channel for creator material, so a revision's `input` is the
 * creator's note AND the parent draft this product produced (see
 * `generate.ts`). That draft went through this same scan, and the model is
 * INSTRUCTED to write `[check]` beside any specific the material did not
 * support (`assemble.ts`'s `GENERATION_SYSTEM`) — so a stored, gated,
 * displayed draft can legitimately contain `$4,000 [check]`.
 *
 * WHAT THAT COST BEFORE THIS FUNCTION EXISTED, measured end to end on this
 * build (spin-compliance gate, 2026-09-01):
 *
 *   parent hook "The $4,000 [check] rig cost you the whole year"
 *     as an ORIGINAL             -> hardRules []          (correct: marked)
 *   the same hook, marker dropped
 *     as an ORIGINAL             -> invented_specific/currency  (correct)
 *     as a REVISION of that parent -> hardRules [], traceability []
 *
 * The third line is the defect: the marker put `4000` in the corpus index, the
 * revision's scan then found it "traceable", and the creator was shown an
 * unsupported amount UNDER the sentence "Every number, date and name in this
 * draft was found in your brain or in what you typed in." A marker is the
 * model's own statement that the material does NOT carry this specific, so it
 * is the one token that can never make the material carry it. REQ-I05.
 *
 * IT IS DONE HERE, IN THE INDEX, RATHER THAN AT THE REVISION CALL SITE,
 * because the class is "a `[check]` in corpus text", not "a `[check]` in a
 * parent draft" — CLAUDE.md's 2026-08-29 lesson about a population written as
 * one path. Every present and future channel that puts gated output into the
 * corpus is covered by construction.
 *
 * BLANKED, NOT DELETED: each removed span becomes spaces, so nothing either
 * side of it joins into a token that was never written — and the blanking is
 * done with STRING SLICES, in UTF-16 units, because that is what `m.index` and
 * `span.start` are. The first version of this function built a `[...text]`
 * array, which iterates CODE POINTS: measured on `the rig 🎥 cost $4,000
 * [check] last year`, the window landed one unit to the right and left the
 * `$` in the corpus, and enough leading astral characters would have left the
 * whole amount there — the laundering this function exists to stop, back
 * again, on any draft with an emoji in it. `traceability.test.ts` pins the
 * emoji case.
 *
 * THE ERROR DIRECTION, stated: a creator who types `[check]` next to a number
 * in their OWN note loses that number as corpus material and may see it
 * flagged. That is the safe direction — they wrote "I am not sure about this"
 * beside it — and the price is a `[check]` offer, not a deletion.
 *
 * THIS IS THE ONE PLACE THAT STILL READS RAW MATCHES rather than
 * `resolveSpecifics`, and it is deliberate. Blanking every shape's raw match
 * beside a marker removes MORE than the resolved tokenisation would, and more
 * removed from the corpus means more flagged in the draft — the direction this
 * file already chooses everywhere. Using the resolver here would only ever
 * leave more marked material vouching, which is the direction that laundered
 * `$4,000` in the first place.
 */
export function stripMarkedSpecifics(text: string): string {
  if (!text.includes(CHECK)) return text;
  const blank: [number, number][] = [];
  for (const span of spans(text)) {
    const markers = markerPositions(span.text);
    if (markers.length === 0) continue;
    for (const shape of SPECIFIC_SHAPES) {
      // A FRESH RegExp PER SPAN, for `scanTraceability`'s reason: a shared /g
      // regex carries `lastIndex` between calls.
      const re = new RegExp(shape.pattern.source, shape.pattern.flags);
      for (const m of span.text.matchAll(re)) {
        const end = m.index + m[0].length;
        if (!markedAdjacently(span.text, m.index, end, markers)) continue;
        blank.push([span.start + m.index, span.start + end]);
      }
    }
  }
  // Right to left, so an earlier replacement cannot shift a later offset —
  // `offerCheck`'s discipline, and here the replacement is the same LENGTH
  // anyway, which is the second reason the offsets stay meaningful.
  let out = text;
  for (const [from, to] of blank.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, from) + " ".repeat(to - from) + out.slice(to);
  }
  return out;
}

/**
 * Every token the corpus can vouch for.
 *
 * THREE PASSES, AND THE THIRD IS THE ONE THAT MAKES THE TWO SIDES AGREE.
 *
 *   `WORDLIKE` reads `1,200` as `1` and `200` (the comma is not part of a
 *   word), so a second pass over `WRITTEN_NUMBER` adds the separator-stripped
 *   `1200` a draft would be compared against. Both are kept: a proper noun is
 *   traceable word by word, and those words come from `WORDLIKE`.
 *
 *   THE THIRD PASS RUNS `resolveSpecifics` — the SAME tokeniser
 *   `scanTraceability` reads the model's output with — so the index holds the
 *   creator's specifics AT THE EXTENTS THE SCAN WILL LOOK THEM UP AT, and
 *   holds COMPOSITE entries: `march 2024` is one key, not two. Before this,
 *   the corpus was read with a different pair of regexes and the two sides'
 *   extents disagreed, which is the whole of this rule's defect history (see
 *   `resolveSpecifics`). It is also what lets `traceable` refuse to decompose
 *   a date: the traceable direction now has a key to hit.
 *
 * A NOTE ON WHAT THE THIRD PASS DOES NOT CHANGE. Every token it adds for a
 * single-word shape is already there from the first two passes once
 * `normalise` has folded it (`$40` → `40`, `12%` → `12`). Its whole new
 * contribution is multi-token specifics and agreed extents.
 *
 * AND WHAT IT COSTS, MEASURED RATHER THAN GUESSED. Seven patterns per sentence
 * instead of two over the document: on a 42 kB corpus, warm, this function
 * went from 2.1 ms to 12.6 ms per call and `scanTraceability` from 2.5 ms to
 * 15 ms — about 6x, linear in corpus size, a few times per generation, against
 * a path whose vendor call takes seconds. It was NOT optimised: the obvious
 * win (reusing the raw match pass when nothing has been claimed yet) is a
 * branch whose two sides must stay equivalent inside the tokeniser this
 * product's hard integrity rule depends on, and that trade is not worth 5 ms.
 * If a brain ever makes this matter, the fix is to build the index ONCE per
 * generation instead of once per scan — the corpus does not change between a
 * draft and its rewrite.
 *
 * A `[check]`-MARKED SPECIFIC CONTRIBUTES NOTHING — see `stripMarkedSpecifics`.
 *
 * `unvouched` IS SUBTRACTED LAST, and it is the caller's answer to a question
 * this module cannot ask: which specifics a document already inside `input`
 * was GATED ON rather than vouched for. `traceabilityCorpusFor` fills it from
 * the parent generation's own stored findings for a revision, and it is
 * DELIBERATELY safe to apply globally because the caller only ever puts a
 * token here after checking the creator's own material does not carry it —
 * that check is `unvouchedSpecifics` in `generate.ts`, and it is what stops
 * this from deleting a number the creator typed in their note.
 */
export function buildCorpusIndex(corpus: TraceabilityCorpus): Set<string> {
  const index = new Set<string>();
  for (const raw of [...corpus.brain, ...corpus.input]) {
    const text = stripMarkedSpecifics(raw);
    for (const m of text.matchAll(WORDLIKE)) index.add(normalise(m[0]));
    for (const m of text.matchAll(WRITTEN_NUMBER)) index.add(normalise(m[0]));
    for (const span of spans(text)) {
      for (const found of resolveSpecifics(span.text)) {
        index.add(normalise(found.token));
      }
    }
  }
  for (const token of corpus.unvouched ?? []) {
    // THE WHOLE TOKEN FIRST, and it is now enough for a composite: the caller
    // reports the specifics THIS scan found, and this scan and the index read
    // the text with the same tokeniser — so a parent draft's reported
    // `March 2024` is exactly the key the index holds for it.
    index.delete(normalise(token));
    for (const m of token.matchAll(WORDLIKE)) index.delete(normalise(m[0]));
    for (const m of token.matchAll(WRITTEN_NUMBER)) index.delete(normalise(m[0]));
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
 *
 * A DECIMAL POINT IS NOT A SENTENCE ENDER, and leaving it as one was the same
 * defect `traceable` refuses decomposition for, arriving through the splitter
 * instead of through the shape list. MEASURED before this exception existed:
 * `12.5%` was split into the span "…12" and the span "5%…", so a brain holding
 * "I shot 12 videos" and "5% of the time it works" — two unrelated documents —
 * vouched for an INVENTED `12.5%` with zero findings; likewise `1` + `5x` for
 * `1.5x` and `1200` + `50` for `$1,200.50`. All three are HARD shapes. A
 * quantity is one specific whichever function takes it apart.
 */
function spans(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(/(?:[^.!?…\n]|(?<=\d)\.(?=\d))+/g)) {
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
  // `1200` in the brain — and, since `buildCorpusIndex` runs the SAME
  // tokeniser, so that `March 2024` in a draft matches `March 2024` in the
  // brain as ONE key.
  if (index.has(normalise(token))) return true;
  // A NUMBER OR A DATE IS ONE SPECIFIC AND IS NEVER DECOMPOSED. Falling
  // through to the per-word rule below would let a brain that merely contains
  // the digits `1` and `200` vouch for the quantity `1,200` — a
  // hard-enforcement finding silently cleared by two unrelated tokens.
  //
  // A DATE IS THE SAME ARGUMENT, and it was left out of it for one round.
  // MEASURED before this line changed: a brain saying "I filmed in March" in
  // one document and "2024 was a hard year" in another vouched for the hook
  // "The March 2024 rebuild" with ZERO findings, and three unrelated tokens
  // (`March`, `20`, `2024`) vouched for "On March 20, 2024 we filmed". A
  // creator's own history was dated for them, under `TRACEABILITY_LIMIT_NOTE`.
  // `iso-date` never decomposed — but only by accident of tokenisation (one
  // `WORDLIKE` token, so `parts.length > 1` was false), so the two hard date
  // shapes behaved oppositely for no reason anyone had stated.
  //
  // THIS LINE IS ONLY SAFE BECAUSE THE INDEX CARRIES COMPOSITES. On its own it
  // would hard-refuse EVERY month-date including one the creator typed
  // verbatim — round 1's false-refusal direction, restored. The whole-token
  // lookup above is what makes the traceable direction still work, and it can
  // only hit because `buildCorpusIndex` now tokenises with `resolveSpecifics`.
  // The two changes are one change.
  if (kind === "number" || kind === "date") return false;
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
 * ONE TOKENISER, RUN ON BOTH SIDES — the extent is a COMPUTED property.
 * ==================================================================
 *
 * WHAT WENT WRONG TWICE. `buildCorpusIndex` read the creator's material with
 * `WORDLIKE` + `WRITTEN_NUMBER`; `scanTraceability` read the model's output
 * with `SPECIFIC_SHAPES`. Two tokenisers, so their EXTENTS disagreed, and
 * every defect this rule has shipped is a consequence of that one fact:
 *
 *   ROUND 1. `month-date`'s greedy day group read "March 2024" as "March 20",
 *   which the corpus could vouch for word by word, and the over-wide span made
 *   `plain-number`'s match on the year OVERLAP and be skipped. Fixed with a
 *   `(?!\d)` lookahead on the day group.
 *
 *   ROUND 2, one regex group over. The YEAR group has no digit boundary and
 *   the day group still claims a 1-2 digit number followed by `%`, `x` or `,`.
 *   MEASURED end to end through `runGeneration`: a brain saying "…I run 3
 *   times a week and I started in June." cleared the hook "Since June 3x more
 *   people watch the slow way" with `hardRules: []` and `traceability: []` —
 *   `month-date` claimed "June 3", `multiplier`'s "3x" overlapped and was
 *   skipped, and an INVENTED performance claim rendered under
 *   `TRACEABILITY_LIMIT_NOTE`'s sentence that every number was checked. And in
 *   the other direction, "By June 250000 views it was over" against a corpus
 *   containing that exact sentence was REFUSED after two paid vendor calls,
 *   quoting 'June 2500'.
 *
 * SO THE HEURISTIC IS NOT TUNED A THIRD TIME (CLAUDE.md's ledger: stop tuning,
 * make it structural). No pattern in `SPECIFIC_SHAPES` changed for this fix.
 * What changed is that ONE function decides every extent, and both sides call
 * it: `scanTraceability` on the model's output and `buildCorpusIndex` on the
 * creator's material. A specific found in the draft is looked up as the same
 * token the same tokeniser would have found in the brain, so `corpus == draft`
 * cannot produce a finding BY CONSTRUCTION rather than by enumeration.
 *
 * THE TWO RULES IT ADDS TO PRIORITY ORDER, both stated as properties:
 *
 *   1. PRIORITY RESOLVES CONTAINMENT; IT DOES NOT LICENCE A CUT. An earlier
 *      shape may CONTAIN a later one — that is what priority is for
 *      (`2026-08-31` is one date and not three numbers; `$40` is one amount
 *      and not the number 40). It may not swallow the HEAD of one, and no
 *      match may end inside a run of digits. Both conditions are checked and
 *      the match is re-taken inside the narrowed window (`repairedExtent`,
 *      where the two are stated as properties). "June 3x" → `month-date`
 *      gives up the day and reads "June"; "3x" is then scanned as the
 *      multiplier it is. "June 250000" → "June", and `plain-number` reads the
 *      whole 250000. "March 12,000" → "March". No pattern was touched.
 *
 *   2. A CLAIMED SPAN NARROWS A LATER SHAPE, IT DOES NOT CANCEL IT. A later
 *      shape is re-matched in the GAPS between claimed spans instead of being
 *      dropped whole. MEASURED before this change: "In March Anna arrived."
 *      produced NO finding for `Anna` at all — the capitalised run "In March
 *      Anna" overlapped the month's span and was discarded entire — while "In
 *      the room Anna arrived." flagged it. One adjacent month word suppressed
 *      a finding, on the flag side of the same defect class.
 *
 * TERMINATION is by construction: each repair step strictly shrinks the
 * window, and `REPAIR_STEPS` bounds it anyway. A match that cannot be repaired
 * is DROPPED, which is the safe direction — dropping an outer match exposes
 * the specifics inside it to their own shapes.
 */
type ResolvedSpecific = {
  shape: (typeof SPECIFIC_SHAPES)[number];
  /** The specific, exactly as it appears in the text. */
  token: string;
  /** UTF-16 offsets into the span text this was resolved in. */
  start: number;
  end: number;
};

/** A match of ANY shape, before priority or extent repair — boundary evidence. */
type RawMatch = { priority: number; start: number; end: number };

/** How many times an extent may be re-taken before the match is dropped. */
const REPAIR_STEPS = 8;

/** A shape's regex, FRESH: a shared /g regex carries `lastIndex` between calls. */
function shapeRegex(priority: number): RegExp {
  const shape = SPECIFIC_SHAPES[priority];
  return new RegExp(shape.pattern.source, shape.pattern.flags);
}

function rawMatches(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (let priority = 0; priority < SPECIFIC_SHAPES.length; priority++) {
    for (const m of text.matchAll(shapeRegex(priority))) {
      out.push({ priority, start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

const DIGIT = /\d/;

/** Where the run of digits containing `at - 1` begins (or `at`, if none does). */
function digitRunStart(text: string, at: number): number {
  let i = at;
  while (i > 0 && DIGIT.test(text[i - 1])) i--;
  return i;
}

/** One past the end of the run of digits containing `at` (or `at`, if none). */
function digitRunEnd(text: string, at: number): number {
  let i = at;
  while (i < text.length && DIGIT.test(text[i])) i++;
  return i;
}

/**
 * Re-take a match until its boundaries are legal, or drop it.
 *
 * TWO BOUNDARY CONDITIONS, both properties of the token set rather than of any
 * one pattern:
 *
 *  A. NO EDGE OF A SPECIFIC SITS INSIDE A RUN OF DIGITS. This is round 1's
 *     `(?!\d)` lookahead, stated ONCE for every shape at the tokenising layer
 *     instead of on one regex group — which is why round 2 found the same
 *     defect one group over. Only `month-date` can violate it (every other
 *     pattern is bounded by `\b`, a symbol or a greedy digit run), and
 *     `traceability.test.ts` asserts the invariant over `SPECIFIC_SHAPES`
 *     rather than over a list of date forms. "June 250000" retakes as "June".
 *
 *     THE CONDITION IS "INSIDE A RUN", NOT "BESIDE A DIGIT", and the
 *     difference is measured: `currency` opens on a symbol, so "It was 20$40
 *     total." legitimately yields `plain-number:"20"` and `currency:"$40"`
 *     with the amount starting immediately after a digit. Nothing is cut
 *     there and both specifics are reported, so the wider claim would have
 *     been false — the kind of over-stated property this rule has already
 *     shipped twice.
 *
 *     AND IT IS REDUNDANT TODAY — SAID OUT LOUD RATHER THAN LEFT TO LOOK
 *     LOAD-BEARING. Deleting this block was planted as a mutation and the
 *     whole suite stayed GREEN (175/175), because `plain-number` matches every
 *     bare digit run, so rule B is already cutting at the same place. It is
 *     kept as the direct statement of the invariant at the point of
 *     enforcement, so the invariant does not silently depend on another
 *     shape's presence and priority. What has the witness is the PROPERTY
 *     ("no specific ever begins or ends flush against a digit", asserted
 *     generatively) and the coupling that currently delivers it
 *     ("`plain-number` sits below every hard shape") — not this mechanism.
 *     Deleting BOTH A and B reddens the property.
 *
 *  B. A MATCH MAY CONTAIN A LOWER-PRIORITY TOKEN, NEVER SWALLOW ITS HEAD.
 *     Containment is what priority is for; cutting is an extent error. The
 *     rule is one-sided on purpose, and the reason is a property of these
 *     patterns rather than a list of cases: EVERY SHAPE IS LEFT-ANCHORED, so a
 *     token whose head survives is re-found by rule 2 in the gap before the
 *     claimed span (the capitalised run "Since June" keeps "Since"), while a
 *     token whose head is swallowed is gone for good ("June 3" leaves "x", and
 *     the multiplier is unscanned). MEASURED: making it two-sided instead
 *     dropped `month-date` entirely from "Since June 3x…", because a
 *     capitalised run ending inside a month name is an ordinary sentence.
 *
 * Each step strictly shrinks the window, so this terminates; `REPAIR_STEPS`
 * bounds it regardless. An unrepairable match is DROPPED, which is the safe
 * direction: the specifics inside it are then scanned by their own shapes.
 */
function repairedExtent(
  text: string,
  priority: number,
  start: number,
  end: number,
  raws: readonly RawMatch[]
): { start: number; end: number } | null {
  let lo = start;
  let hi = end;
  for (let step = 0; step < REPAIR_STEPS; step++) {
    let cutLo = lo;
    let cutHi = hi;
    // (A) the edges may not sit inside a run of digits.
    if (hi < text.length && DIGIT.test(text[hi])) {
      cutHi = Math.min(cutHi, digitRunStart(text, hi));
    }
    if (lo > 0 && DIGIT.test(text[lo - 1])) {
      cutLo = Math.max(cutLo, digitRunEnd(text, lo - 1));
    }
    // (B) the right edge may not swallow the head of a lower-priority token.
    for (const r of raws) {
      if (r.priority <= priority) continue;
      if (r.start > lo && r.start < hi && r.end > hi) {
        cutHi = Math.min(cutHi, r.start);
      }
    }
    if (cutLo === lo && cutHi === hi) return { start: lo, end: hi };
    if (cutLo >= cutHi) return null;
    const again = [...text.slice(cutLo, cutHi).matchAll(shapeRegex(priority))][0];
    if (!again) return null;
    lo = cutLo + again.index;
    hi = lo + again[0].length;
  }
  return null;
}

/** The stretches of `[0, length)` no accepted match has claimed, in order. */
function gapsIn(length: number, used: readonly [number, number][]): [number, number][] {
  const claimed = [...used].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let at = 0;
  for (const [from, to] of claimed) {
    if (from > at) out.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < length) out.push([at, length]);
  return out;
}

/**
 * Every specific in ONE span, with its resolved extent.
 *
 * `skip` is the caller's veto, applied BEFORE the span is claimed — so a
 * skipped match is as if the shape never matched there. `scanTraceability`
 * passes the sentence-initial-capital census; `buildCorpusIndex` passes
 * nothing, because the corpus is the vouching side and a word capitalised only
 * by grammar still vouches for itself (`WORDLIKE` indexes it either way, so
 * the two sides cannot disagree about it).
 */
function resolveSpecifics(
  text: string,
  skip?: (found: ResolvedSpecific) => boolean
): ResolvedSpecific[] {
  const raws = rawMatches(text);
  const used: [number, number][] = [];
  const overlaps = (s: number, e: number) => used.some(([a, b]) => s < b && a < e);
  const out: ResolvedSpecific[] = [];

  for (let priority = 0; priority < SPECIFIC_SHAPES.length; priority++) {
    const shape = SPECIFIC_SHAPES[priority];
    for (const [from, to] of gapsIn(text.length, used)) {
      for (const m of text.slice(from, to).matchAll(shapeRegex(priority))) {
        const fixed = repairedExtent(
          text,
          priority,
          from + m.index,
          from + m.index + m[0].length,
          raws
        );
        if (!fixed) continue;
        let { start } = fixed;
        let token = text.slice(start, fixed.end);
        if (shape.kind === "proper_noun") {
          const trimmed = trimOpeners(token);
          if (!trimmed) continue;
          start += trimmed.offset;
          token = trimmed.token;
        }
        const found = { shape, token, start, end: start + token.length };
        // A BACKSTOP, NOT THE MECHANISM: the gap walk already excludes every
        // claimed span, matches within one gap are disjoint, and a repair only
        // ever shrinks — so nothing should reach this. It is kept because a
        // double-claimed span is a silently dropped finding, and deleting it
        // would make that depend on all three of those facts staying true.
        if (overlaps(found.start, found.end)) continue;
        if (skip?.(found)) continue;
        used.push([found.start, found.end]);
        out.push(found);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The tokenisation of a text, as `shape:token` — the extent policy, OBSERVABLE.
 *
 * It exists so the policy can be hashed into `prompt_bundle_version` and
 * asserted in a test, rather than described in a comment. REQ-J02's question
 * is "what changed?", and this rule's history is that its PATTERNS stayed
 * byte-identical while the population of drafts reaching a creator moved
 * twice.
 */
export function specificExtents(text: string): string[] {
  const out: string[] = [];
  for (const span of spans(text)) {
    for (const found of resolveSpecifics(span.text)) {
      out.push(found.shape.id + ":" + found.token);
    }
  }
  return out;
}

/**
 * The texts `bundle.ts` fingerprints the extent policy over.
 *
 * A FIXTURE, AND ITS LIMIT IS STATED. Every other line of `gateDescription` is
 * derived from a constant that changes when the rule changes; the resolution
 * policy has no such constant, and a hand-bumped one is the
 * `VOICE_PROMPT_BUNDLE_VERSION` anti-pattern `bundle.ts`'s own header names.
 * So the version carries the policy's BEHAVIOUR on these texts instead: change
 * how extents resolve and the digest moves with no one remembering to bump
 * anything. THE RESIDUAL: a resolution change invisible to every probe here
 * moves no version. The list is therefore the adjacency classes this rule has
 * actually failed on plus one specimen per shape, and `traceability.test.ts`
 * asserts every shape id appears in the tokenisation of some probe.
 */
export const EXTENT_PROBES: readonly string[] = [
  // The round-2 straddles: a month word beside a unit-bearing number.
  "Since June 3x more people watch",
  "In March 12,000 people signed up",
  "By June 250000 views it was over",
  "Sept 5 was 20% up on the week",
  // The round-1 forms, where the day and the year are the date's own.
  "The March 2024 rebuild",
  "On March 20, 2024 we filmed",
  "We filmed it in March 20th, 2024 and stopped",
  // A capitalised run that CONTAINS a higher-priority shape.
  "In March Anna arrived",
  // One specimen per remaining shape, so the fingerprint is not date-only.
  "Filmed on 2026-08-31",
  "It cost $40 and lifted 12%",
  "It took 1,200 takes",
  "I still play The Beatles",
];

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

      // ONE TOKENISER, AND `buildCorpusIndex` CALLS THE SAME ONE — see
      // `resolveSpecifics`. The census veto is passed in rather than applied
      // afterwards, because a skipped match must not claim its span: it has to
      // be as if this shape never matched here.
      const resolved = resolveSpecifics(
        span.text,
        (found) =>
          found.shape.kind === "proper_noun" &&
          (found.token.match(WORDLIKE) ?? []).length === 1 &&
          found.start === opening &&
          !midCaps.has(normalise(found.token))
      );

      for (const { shape, token, start, end } of resolved) {
        if (markedAdjacently(span.text, start, end, markers)) continue;
        if (traceable(token, shape.kind, index)) continue;
        out.push({
          kind: shape.kind,
          shape: shape.id,
          enforcement: enforcementFor(shape, unit.field),
          token,
          field: unit.field,
          unit: excerpt(span.text),
          startUtf16: span.start + start,
          endUtf16: span.start + end,
        });
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
 * AND THE MARKER LANDS BESIDE THE TOKEN, NEVER INSIDE IT. That is a weaker
 * claim than the one above and it is the one that was false: this function
 * writes at a finding's `endUtf16`, so a shape claiming an over-wide extent
 * splits the creator's own text and the byte-for-byte round trip above stays
 * green anyway (MEASURED, slice 8c round 1: "…in March 2024" came back as
 * "…in March 20 [check]24"). `traceability.test.ts`'s "offerCheck never lands
 * the marker INSIDE the token it is marking" asserts it over every shape in
 * `SPECIFIC_SHAPES`, which is where an extent bug can come back.
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
