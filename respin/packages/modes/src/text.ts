// The text primitives every scan in this package shares (slice 6, R5/R8/R19).
//
// PURE BY CONSTRUCTION: no database, no network, no clock. `packages/modes` is
// the pipeline's assemble half (tech-spec §1 — "generation logic lives in
// packages/modes, callable from tests without HTTP"), and everything in this
// file is a function from strings to values.
//
// WHY ONE FILE RATHER THAN A HELPER PER SCANNER. The hard rules (hard-rules.ts)
// and the traceability scan (traceability.ts) both need "what counts as a
// sentence" and "what counts as a word". Two answers to those questions is two
// populations that drift, and this repo has already paid for a guard whose
// population was written as one path and silently narrowed the day a second
// appeared (CLAUDE.md, 2026-08-29).
//
// EVERY REGEX HERE IS A LITERAL, never assembled from a string. One lost
// backslash turns `\s` into `s` and the scan silently matches nothing, which is
// the fail-open shape CLAUDE.md's 2026-08-21 lesson names. `CLAUSE_SEPARATOR`
// is a literal too; its consumers in `hard-rules.ts` splice its `.source` into
// `String.raw` templates (raw, so no backslash is consumed), and every pattern
// built that way is held to a specimen it must match.

/**
 * One piece of the model's output, addressed by where it came from.
 *
 * `field` is an RFC-6901-shaped pointer into the `ScriptOutput` document
 * (`hooks/0/text`), so a finding names a place a creator can look rather than
 * an offset into a blob.
 *
 * `isHook` is what makes tech-spec §3 step 3's "hook over 14 words WHERE THE
 * RULE IS ACTIVE" decidable. Active is a property of the FIELD, not of the
 * creator: `brain-content.ts`'s `killtestContent` states the product's hard
 * integrity rules are server-owned and deliberately not in the creator's
 * document, "because a rule the creator can edit or confirm away is not an
 * integrity rule". So the 14-word cap is active on hook-bearing fields and
 * nowhere else, and no setting turns it off.
 */
export type TextUnit = {
  field: string;
  text: string;
  isHook: boolean;
};

/** Sentence-ending punctuation, including the ellipsis a model likes. */
const SENTENCE_END = /[.!?…]+/;

/**
 * A CLAUSE SEPARATOR inside one sentence — the ONE spelling of the concept
 * (audit Phase 2, P2-R3). It had three copies in `hard-rules.ts` (`[,;—–-]`)
 * and a fourth, narrower one in `claims.ts`'s negated-clause guard (`[^,;]`),
 * and the narrower one let "Nothing is guaranteed — this will perform."
 * through: the em dash is how a model hedges, and `assemble.ts` tells it to.
 *
 * THE MEMBERS: comma, semicolon, colon, em dash, en dash, and a hyphen USED AS
 * A DASH. A hyphen inside a word ("low-key", "well-lit") is not a clause
 * break — read as one, an honest "Nothing about this low-key hook will
 * perform." would detach its negator and refuse, a debited false-fire. The
 * colon was added by the Phase 2 generator's measurement (50 escapes in 1,500
 * on the negated-clause guard); in `hard-rules.ts` it makes "It's not luck:
 * it's reps." the same tic it already was with a comma.
 *
 * NO CAPTURING GROUP, because `hard-rules.ts` composes it into patterns that
 * use backreferences (`\1`), and a group here would renumber them.
 */
export const CLAUSE_SEPARATOR = /\s*(?:[,;:—–]|(?<!\w)-|-(?!\w))\s*/;

/**
 * A word-like token: letters or digits, plus the apostrophes and hyphens that
 * live INSIDE a word. Deliberately not `\S+`, which counts a bare em dash as a
 * word and would inflate a hook's length past 14 for punctuation.
 */
const WORDLIKE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** Every word-like token of a string, in order. */
export function words(text: string): string[] {
  return text.match(WORDLIKE) ?? [];
}

/**
 * Every word-like token with where it sits — the same tokens `words` returns,
 * in the same order, so a run found over `words` can be mapped back onto the
 * text it came from.
 */
export function wordSpans(text: string): { word: string; start: number; end: number }[] {
  return [...text.matchAll(WORDLIKE)].map((m) => ({
    word: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * One line's sentence units, in order, with the blanks dropped.
 *
 * PER LINE, and the line boundary is load-bearing rather than incidental. A
 * hook set is three to five SEPARATE one-line outputs; splitting the whole
 * document into sentences would read three short hooks as one fragment triad
 * and refuse every hook set this mode exists to produce (`hard-rules.test.ts`
 * pins that case).
 */
export function sentenceUnits(line: string): string[] {
  return line
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A unit's lines, blanks dropped, so a scan can stay inside one of them. */
export function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Shorten an excerpt so a finding is readable in a UI and in a log. */
export function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1) + "…";
}
