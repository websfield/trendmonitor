// The Spin hard-release gate (REQ-E04 / REQ-I02).
//
// This is deliberately a deterministic, bounded comparison against the
// trusted autopsy projection. It does NOT receive generic generation input or
// a raw transcript: those are unbounded, caller-controlled material and would
// make this control's reference population ambiguous.
import { NOT_PRESENTED_FIELD_PREFIXES, straightApostrophes } from "./claims";
import { COMPARISON_STOPWORDS } from "./mode-checks";
import { outputTextUnits, type ScriptOutput } from "./output";
import { words, type TextUnit } from "./text";

/**
 * The least strict Spin policy code permits. A stored config may demand MORE
 * change, never less: `effectiveSpinStrictness` clamps it upward to this floor.
 */
export const CODE_SPIN_STRICTNESS_FLOOR = 0.7;

// THE REFERENCE BOUNDS ARE THE PRODUCER'S CONTRACT, NOT THIS FILE'S OPINION.
//
// FOUND BY THE FIRST GENERATION THAT EVER COMPLETED (2026-09-04). Every one of
// these four bounds used to be chosen here, independently, and every one of
// them was STRICTER than what `packages/trends/src/autopsy.ts` is specified to
// produce — hook 30 words against a producer told "the original opening
// wording (max 800 characters)", 8 subject terms against 20, 6 words a term
// against 120 characters, 20 beats against 50. The real autopsy the 8c walk
// created carries a 63-word hook, so `assertTrustedReference` threw on it, and
// a spin of a REAL autopsy was structurally impossible. Nothing could see it:
// `packages/modes` has no dependency on `packages/trends`, both sides' tests
// build their own fixtures, and no generation had ever run far enough to reach
// this function against producer output.
//
// They are expressed in the PRODUCER'S UNIT (characters, where it validates
// characters) so the two are comparable by reading them. The agreement is
// pinned by `respin/tests/spin-reference-bounds.test.ts`, which imports both
// sides — the only place in the tree that can — and fails the day either moves.
//
// THIS IS A VALIDATION OF TRUSTED DATA, NOT A SECOND POLICY GATE. Refusing a
// reference our own worker produced and already validated does not make a
// creator safer; it makes the R-3 gate refuse to run at all, which is the one
// outcome that protects nobody. The gate's strength lives in the comparison
// below, and the window is what keeps it independent of these numbers.
export const MAX_SUBJECT_TERMS = 20;
export const MAX_SUBJECT_TERM_CHARS = 120;
export const MAX_HOOK_CHARS = 800;
export const MAX_BEATS = 50;

/**
 * The span of reference hook a single comparison sees.
 *
 * WHY A WINDOW AND NOT A LONGER WHOLE-HOOK COMPARISON. `coverage()` divides by
 * the SOURCE token total, so a longer reference hook mechanically LOWERS the
 * score of a candidate that copies part of it: against a 30-word hook a copied
 * sentence scores ~1.0, against a 130-word hook the same copied sentence
 * scores ~0.25 and clears the gate. Simply widening the bound above would have
 * traded an unusable gate for a weak one.
 *
 * Windowing removes reference length from the answer entirely: a candidate
 * that reproduces ANY 30-word span of the reference scores against that span
 * alone. `hookSimilarityOf` takes the max over every window AND the whole
 * hook, so the result is never below what this file returned before — the
 * change can only refuse more, never less.
 */
export const HOOK_COMPARISON_WINDOW_WORDS = 30;

/**
 * The span of a SUBJECT TERM a single containment test sees.
 *
 * THE SAME DISEASE AS THE HOOK'S, ON THE AXIS NEXT TO IT (compliance gate,
 * 2026-09-04). `containsWordSequence` needs an exact contiguous normalised
 * token sequence, so a term gets monotonically HARDER to match as it grows.
 * Measured against a 20-word term well inside the new 120-character bound:
 * verbatim matched; **one word inserted in the middle did not**; 19 of its 20
 * words contiguously did not. Above roughly six words the axis silently
 * no-ops — and the vendor prompt places no shape constraint on `subjectTerms`
 * at all, so its strength was left to whatever the model happened to emit.
 *
 * That mattered because `subject` is one of R-3's three minimum-difference
 * axes, and it is the one the real walk's `honest_refusal` fired on.
 *
 * SIX, AND THE NUMBER IS NOT ARBITRARY: it is the old `MAX_SUBJECT_TERM_WORDS`.
 * Every term the previous bound could admit was at most six words, so for all
 * of them one window IS the whole term and this function is bit-for-bit what it
 * was. Only terms the old bound REFUSED outright — the ones that could never be
 * matched — behave differently, and for those the axis goes from inert to live.
 */
export const SUBJECT_MATCH_WINDOW_WORDS = 6;

export type SpinStructure = {
  /** The reference's autopsied beat count. */
  beatCount: number;
  /** Zero-based position of its marked turn, or null where it has no turn. */
  turnBeat: number | null;
};

/**
 * The only reference shape the Spin gate accepts.
 *
 * `subjectTerms`, `hook`, and `structure` are bounded fields produced by an
 * autopsy. They are intentionally not a transcript, a prompt, or `input`.
 */
export type SpinReference = {
  subjectTerms: readonly string[];
  hook: string;
  structure: SpinStructure;
};

export type SpinSimilarityFailure = "subject" | "hook" | "structure";

export type SpinSimilarityResult = {
  accepted: boolean;
  failed: readonly SpinSimilarityFailure[];
  effectiveStrictness: number;
  hookSimilarity: number;
  /**
   * The JSON-pointer field of the text unit that carried the worst overlap
   * with the reference hook — the thesis, a beat's VO or the caption as
   * readily as a hook — so a refusal can name where the copy sat rather than
   * always saying "/hooks". Null only when no unit had any overlap.
   */
  hookMatchField: string | null;
};

/** The config requests strictness; code preserves the non-negotiable floor. */
export function effectiveSpinStrictness(configured: number): number {
  if (!Number.isFinite(configured) || configured < 0 || configured > 1) {
    throw new SpinSimilarityError("similarity strictness must be a finite number from zero to one");
  }
  return Math.max(CODE_SPIN_STRICTNESS_FLOOR, configured);
}

export class SpinSimilarityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpinSimilarityError";
  }
}

/**
 * The three deterministic properties REQ-E04 requires.
 *
 * `contentOverlap` is a SET-Jaccard proxy, so it deliberately discards token
 * order and multiplicity. `hookSimilarity` takes the maximum of that proxy,
 * source-token coverage, and ordered-bigram coverage: reorder, padding, and
 * repeated-token evasions therefore do not lower a near-copy below the gate.
 * The reference hook is compared against EVERY creator-facing text unit
 * `outputTextUnits` registers (thesis, hooks, ideas, beats, caption, …), not
 * only the hook-marked ones, because the Spin surface renders more than hooks.
 * ONE EXCEPTION, for a reference hook with no content words (stopwords only,
 * P2-A4 / R-173): the three proxies cannot read it, so `sequenceSimilarityOf`
 * decides — a verbatim copy of a reference of three words or more refuses on
 * every presented unit, while the near-copy (edit-distance) test, and the
 * identity test for a reference of two words or fewer, read hook units only.
 * This remains lexical rather than semantic similarity; fixtures document the
 * proxy boundary rather than claiming a plagiarism detector.
 */
export function evaluateSpinSimilarity(params: {
  output: ScriptOutput;
  reference: SpinReference;
  configuredStrictness: number;
}): SpinSimilarityResult {
  assertTrustedReference(params.reference);
  const effectiveStrictness = effectiveSpinStrictness(params.configuredStrictness);
  // `outputTextUnits` is the registered creator-facing text population — the
  // WHOLE of it is the release surface, and a later field joins this gate by
  // joining that population. The `isHook` marker still decides whether there is
  // a hook to compare at all; it no longer narrows what is compared (compliance
  // gate round 1, 2026-09-03: the reference hook verbatim in a thesis, a beat
  // or a caption measured `hookSimilarity=0.00` while `displayableSpin`
  // rendered all three).
  const units = outputTextUnits(params.output);
  if (!units.some((unit) => unit.isHook)) {
    throw new SpinSimilarityError("a spin has no hook to compare against its trusted structured reference");
  }

  const failed: SpinSimilarityFailure[] = [];
  const candidateTextUnits = units.map((unit) => normalisedWords(unit.text));
  if (
    params.reference.subjectTerms.some((term) =>
      candidateTextUnits.some((candidateWords) =>
        containsSubjectTerm(candidateWords, normalisedWords(term)),
      ),
    )
  ) {
    failed.push("subject");
  }

  // Every text unit the accepted output can expose is part of the release
  // surface. Checking only hooks[0] lets a near-copy move to hooks[1]; checking
  // only hook-marked units lets it move to the thesis, a beat's VO or the
  // caption — and the UI displays every one of those. The gate therefore
  // compares the reference hook against EVERY unit and retains the worst overlap.
  let hookSimilarity = 0;
  let hookMatchField: string | null = null;
  for (const unit of units) {
    const similarity = hookSimilarityOf(params.reference.hook, unit, effectiveStrictness);
    // Strictly greater: at a tie, the first unit in section order
    // (`SECTION_KEYS`, which `outputTextUnits` walks) at the worst overlap is
    // named. Thesis precedes hooks in that order, so a thesis and a hook tied
    // at 1.0 report `/thesis/statement`; a hook and a caption report the hook.
    if (similarity > hookSimilarity) {
      hookSimilarity = similarity;
      hookMatchField = unit.field;
    }
  }
  // Higher strictness means less lexical overlap is allowed.
  //
  // THE TOLERANCE IS LOAD-BEARING, NOT COSMETIC (compliance gate, 2026-09-04).
  // `1 - 0.7` is `0.30000000000000004`, and the window made the denominator a
  // CONSTANT 30 — so window coverage is exactly `k / 30`, and `9 / 30` is
  // exactly `0.3`, which is strictly less than the threshold. Measured twice: a
  // 9-contiguous-word lift and a distributed 4x9-word lift both scored `0.300`
  // and PASSED a hard gate. Before the window, denominators were arbitrary hook
  // lengths and landing exactly on the boundary was rare; now it is the most
  // likely operating point, so the documented "30% of a window" rule was off by
  // one ulp in the direction that admits a near-copy.
  //
  // The comparison is therefore made at the precision the ratios actually
  // carry. `1e-9` is far below any `k / n` this gate can produce (the smallest
  // gap between distinct ratios here is ~1/900) and far above the ~1e-16 error
  // that created the defect.
  if (hookSimilarity >= 1 - effectiveStrictness - 1e-9) failed.push("hook");

  const turnBeat = params.output.beats?.findIndex((beat) => beat.isTurn) ?? -1;
  const candidateStructure: SpinStructure = {
    beatCount: params.output.beats?.length ?? 0,
    turnBeat: turnBeat === -1 ? null : turnBeat,
  };
  if (
    candidateStructure.beatCount === params.reference.structure.beatCount &&
    candidateStructure.turnBeat === params.reference.structure.turnBeat
  ) {
    failed.push("structure");
  }

  return {
    accepted: failed.length === 0,
    failed,
    effectiveStrictness,
    hookSimilarity,
    hookMatchField,
  };
}

/**
 * Refuse a reference this gate cannot compare against.
 *
 * EXPORTED so `runGeneration` can run it at entry, BEFORE the first vendor
 * call. It is still run inside `evaluateSpinSimilarity` — the gate must not
 * depend on a caller having checked — so this is a second, earlier call of the
 * same assertion, never a replacement for it.
 */
export function assertTrustedReference(reference: SpinReference): void {
  if (!reference || typeof reference !== "object") {
    throw new SpinSimilarityError("a spin requires a trusted structured reference");
  }
  if (
    !Array.isArray(reference.subjectTerms) ||
    reference.subjectTerms.length === 0 ||
    reference.subjectTerms.length > MAX_SUBJECT_TERMS ||
    reference.subjectTerms.some(
      (term) =>
        typeof term !== "string" ||
        // THE PRODUCER'S EMPTINESS PREDICATE, not a second opinion about it.
        // `autopsy.ts` accepts on `value.trim().length > 0`; this used to
        // require a WORD character, so a producer-legal term of pure
        // punctuation or emoji was refused here — after the vendor call
        // (code review, 2026-09-04). Such a term simply matches nothing.
        term.trim().length === 0 ||
        term.length > MAX_SUBJECT_TERM_CHARS,
    )
  ) {
    throw new SpinSimilarityError("a spin requires bounded subject terms in its trusted structured reference");
  }
  // `trim()`, NOT `words()` — the producer's predicate. See the subject terms
  // above. A hook with no content words scores 0 against everything, which is
  // the honest outcome; refusing it stopped the whole gate instead.
  if (typeof reference.hook !== "string" || reference.hook.trim().length === 0 || reference.hook.length > MAX_HOOK_CHARS) {
    throw new SpinSimilarityError("a spin requires a bounded hook in its trusted structured reference");
  }
  const structure = reference.structure;
  if (
    !structure ||
    !Number.isInteger(structure.beatCount) ||
    structure.beatCount < 1 ||
    structure.beatCount > MAX_BEATS ||
    !(
      structure.turnBeat === null ||
      (Number.isInteger(structure.turnBeat) &&
        structure.turnBeat >= 0 &&
        structure.turnBeat < structure.beatCount)
    )
  ) {
    throw new SpinSimilarityError("a spin requires bounded structure in its trusted structured reference");
  }
}

/**
 * Lowercased words, ONE APOSTROPHE and NO HYPHENS (compliance verification,
 * 2026-10-07): curly and straight apostrophes are the same character here, so
 * "It’s not you" is the reference "It's not you", and a hyphenated token is
 * its parts, so "kitchen-renovation" holds the term "kitchen renovation". The
 * subject-term test and the stopword fallback both read these words.
 */
function normalisedWords(value: string): string[] {
  return words(straightApostrophes(value)).flatMap((word) =>
    word.toLocaleLowerCase().split("-").filter((part) => part.length > 0)
  );
}

/** `normalisedWords` without the comparison stopwords: the main path's content words. */
function significantWords(value: string): string[] {
  return normalisedWords(value).filter((word) => !COMPARISON_STOPWORDS.has(word));
}

/** Whether a text is made only of comparison stopwords once contractions are expanded. */
function stopwordOnly(expanded: readonly string[]): boolean {
  return expanded.every((word) => COMPARISON_STOPWORDS.has(word));
}

/**
 * Does this candidate reuse the reference's subject term?
 *
 * A term of at most `SUBJECT_MATCH_WINDOW_WORDS` tokens is tested whole, which
 * is exactly what this gate did before the window existed. A LONGER term is
 * tested as the union of its overlapping windows, so reusing any six-word run
 * of it counts — see `SUBJECT_MATCH_WINDOW_WORDS` for why a whole-sequence test
 * made long terms unmatchable.
 *
 * Like the hook's window, this can only ever match MORE: the whole-sequence
 * test is the `length <= window` case, and for longer terms a whole-sequence
 * match implies a window match, so nothing that used to fail can now pass.
 */
function containsSubjectTerm(
  candidate: readonly string[],
  term: readonly string[],
): boolean {
  if (term.length === 0) return false;
  if (term.length <= SUBJECT_MATCH_WINDOW_WORDS) {
    return containsWordSequence(candidate, term);
  }
  for (
    let start = 0;
    start + SUBJECT_MATCH_WINDOW_WORDS <= term.length;
    start += 1
  ) {
    const span = term.slice(start, start + SUBJECT_MATCH_WINDOW_WORDS);
    if (containsWordSequence(candidate, span)) return true;
  }
  return false;
}

/** Exact normalised token sequence, never a substring of another word. */
function containsWordSequence(
  candidate: readonly string[],
  term: readonly string[],
): boolean {
  if (term.length === 0 || term.length > candidate.length) return false;
  for (let start = 0; start <= candidate.length - term.length; start += 1) {
    if (term.every((word, index) => candidate[start + index] === word)) {
      return true;
    }
  }
  return false;
}

/**
 * The worst overlap between the reference hook and one candidate text unit.
 *
 * THE WHOLE HOOK IS SCORED FIRST, AND ITS SCORE IS KEPT IN THE MAX. That is
 * what makes this change one-directional: whatever this function returned
 * before the window existed is still one of the values being maximised over,
 * so no candidate that used to fail can now pass. The windows can only add
 * higher scores, never remove one.
 */
function hookSimilarityOf(rawSource: string, unit: TextUnit, strictness: number): number {
  const source = straightApostrophes(rawSource);
  const candidate = straightApostrophes(unit.text);
  // THE SAME NORMALISER ON THE MAIN PATH (final compliance verification):
  // `contentWords` kept "you-know-who" as one token, so "you know who did
  // this" passed against it. One apostrophe, hyphens split, stopwords dropped.
  const sourceWords = significantWords(source);
  const candidateWords = significantWords(candidate);
  const sourceExpanded = expandedWords(source);
  const candidateExpanded = expandedWords(candidate);
  // A SIDE WITH NO CONTENT WORDS IS NOT A SIDE WITH NO WORDS (audit Phase 2,
  // P2-A4, register item 37). This returned 0 here, so a reference hook made
  // wholly of `COMPARISON_STOPWORDS` — "If this is you" — scored 0 against a
  // verbatim copy of itself and passed the hard pre-display gate.
  //
  // THE FALLBACK READS EVERY PRESENTED UNIT FOR A VERBATIM COPY, AND ONLY
  // HOOK UNITS FOR A NEAR-COPY (owner decision 2026-10-07, R-173; compliance
  // gate High 2). The reference copied whole into a caption, the thesis or a
  // beat is a copy wherever it lands, so containment runs on every unit the
  // creator is shown; the looser edit-distance test stays on hooks, because a
  // short stopword run recurs in ordinary prose ("…if this is the only take").
  // The model's disclosure section is not presented (R-154) and is skipped.
  //
  // "STOPWORD-ONLY" IS DECIDED ON THE EXPANDED WORDS (compliance verification,
  // 2026-10-07): "It's not you" has the content word "it's" until it is read
  // as "it is not you", so the fallback never ran for a contracted reference
  // and "If it is you, keep watching" passed against "If it's you".
  if (stopwordOnly(sourceExpanded) || stopwordOnly(candidateExpanded)) {
    if (NOT_PRESENTED_FIELD_PREFIXES.some((prefix) => unit.field.startsWith(prefix))) return 0;
    return sequenceSimilarityOf(sourceExpanded, candidateExpanded, strictness, unit.isHook);
  }

  const candidateCounts = count(candidateWords);
  const candidateBigrams = count(bigrams(candidateWords));
  let worst = scoreSpan(sourceWords, candidateWords, candidateCounts, candidateBigrams);
  // A hook shorter than one window IS one window, so the loop below does not
  // run and the result is bit-for-bit what this file computed before.
  for (
    let start = 0;
    start + HOOK_COMPARISON_WINDOW_WORDS <= sourceWords.length;
    start += 1
  ) {
    const span = sourceWords.slice(start, start + HOOK_COMPARISON_WINDOW_WORDS);
    const score = scoreSpan(span, candidateWords, candidateCounts, candidateBigrams);
    if (score > worst) worst = score;
  }
  return worst;
}

/** The stems `n't` leaves that are not words of their own. */
const NOT_STEMS: Readonly<Record<string, string>> = { ca: "can", wo: "will", sha: "shall" };

/** A contraction's suffix and the words it stands for. */
const CONTRACTIONS: Readonly<Record<string, readonly string[]>> = {
  "n't": ["not"],
  "'re": ["are"],
  "'m": ["am"],
  "'ve": ["have"],
  "'ll": ["will"],
  "'d": ["would"],
  "'s": ["is"],
};

/**
 * Normalised words with contractions EXPANDED, so "it's you" and "it is you"
 * are the same sequence (Phase 2 gate). `can't` is `can not`, `won't` is
 * `will not`. A possessive `'s` also reads as `is`; both sides get the same
 * expansion, so it misreads them alike.
 */
function expandedWords(value: string): string[] {
  const out: string[] = [];
  for (const word of normalisedWords(value)) {
    // `cannot` is `can not`, like `can't` (compliance verification).
    if (word === "cannot") {
      out.push("can", "not");
      continue;
    }
    const suffix = Object.keys(CONTRACTIONS).find((s) => word.length > s.length && word.endsWith(s));
    if (suffix === undefined) {
      out.push(word);
      continue;
    }
    const stem = word.slice(0, -suffix.length);
    // `can't` leaves "ca", `won't` "wo", `shan't` "sha": each restored.
    const restored = suffix === "n't" ? (NOT_STEMS[stem] ?? stem) : stem;
    out.push(restored, ...CONTRACTIONS[suffix]!);
  }
  return out;
}

/** Token edit distance (insertions, deletions, substitutions — Levenshtein over words). */
function tokenEditDistance(a: readonly string[], b: readonly string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * THE STOPWORD-ONLY FALLBACK: a hook unit compared to the reference hook as a
 * word SEQUENCE, contractions expanded.
 *
 * A COPY IS THE REFERENCE HOOK INSIDE A UNIT, OR A NEAR-IDENTICAL HOOK, so
 * this refuses (scores 1) in two cases and scores 0 otherwise:
 *
 *   CONTAINMENT, ON EVERY PRESENTED UNIT — the unit holds the whole
 *   reference hook as a contiguous word sequence, anywhere ("If this is you,
 *   here's what nobody tells you about mornings"; the same four words as a
 *   caption or a beat). Only for a reference of THREE words or more: a run of
 *   two common words recurs in ordinary prose, so a reference of two words or
 *   fewer is a copy only under the identity test on a hook unit below.
 *
 *   NEAR-IDENTITY, ON A HOOK UNIT ONLY — the token edit distance between the
 *   two is at most `k` AND their lengths differ by at most `k`.
 *
 * Both read normalised, contraction-expanded words (`hookSimilarityOf`). `k` is DERIVED from the configured gate,
 * not typed: the allowed overlap `1 - strictness` times the reference hook's
 * length, rounded down — at the code floor (0.7) a four-word hook allows one
 * changed, inserted or dropped word ("If this was you", "If this is really
 * you"), and a hook of three words or fewer allows none, because a stricter
 * test than identity would refuse ordinary three-word phrases. A stricter
 * configured gate shrinks `k`; the code floor bounds how far a looser one can
 * widen it.
 *
 * NOT the content-word proxies: every long text holds "if", "this", "is" and
 * "you", so bag coverage over stopwords refused almost any draft — a debited
 * refusal for words, not a copy.
 *
 * THE EMPTY-INPUT RETURN BELOW IS ONE OF TWO in this file, a measured list
 * (`similarity.test.ts`): here a side has no words AT ALL, and in `scoreSpan`
 * an empty span. A third early `return 0` is a list edit (rule 7).
 */
function sequenceSimilarityOf(
  source: readonly string[],
  candidate: readonly string[],
  strictness: number,
  isHook: boolean
): number {
  if (source.length === 0 || candidate.length === 0) return 0;
  if (source.length >= 3 && containsWordSequence(candidate, source)) return 1;
  if (!isHook) return 0;
  const k = Math.floor(source.length * (1 - strictness) + 1e-9);
  if (Math.abs(source.length - candidate.length) > k) return 0;
  return tokenEditDistance(source, candidate) <= k ? 1 : 0;
}

/**
 * The three REQ-E04 proxies over one span of reference tokens.
 *
 * Set-Jaccard is computed from the token arrays rather than by calling
 * `contentOverlap` on strings, because a WINDOW has no string form — rejoining
 * its tokens would re-tokenise them and make the two paths disagree. Over a
 * whole hook the Jaccard TERM is the number `contentOverlap` returns: both are
 * Jaccard over the content-word sets (`significantWords`, the same words
 * `contentWords` returns once hyphens are split and apostrophes unified).
 *
 * WHAT `similarity.test.ts` ACTUALLY ASSERTS is the weaker, observable relation
 * — that the reported `hookSimilarity` is at least `contentOverlap`'s value —
 * because the term is not separately exported and coverage usually dominates
 * it. The stronger equality is stated here as a property of the code, not
 * claimed as tested: an earlier draft of this docblock named a witness that did
 * not exist (code review, rounds 1 and 2).
 */
function scoreSpan(
  sourceWords: readonly string[],
  candidateWords: readonly string[],
  candidateCounts: ReadonlyMap<string, number>,
  candidateBigrams: ReadonlyMap<string, number>,
): number {
  if (sourceWords.length === 0) return 0;
  const left = new Set(sourceWords);
  const right = new Set(candidateWords);
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const jaccard = shared / (left.size + right.size - shared);
  const sourceCoverage = coverage(count(sourceWords), candidateCounts);
  const orderedBigramCoverage = coverage(count(bigrams(sourceWords)), candidateBigrams);
  return Math.max(jaccard, sourceCoverage, orderedBigramCoverage);
}

function count(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function coverage(source: ReadonlyMap<string, number>, candidate: ReadonlyMap<string, number>): number {
  let sourceTotal = 0;
  let shared = 0;
  for (const [token, sourceCount] of source) {
    sourceTotal += sourceCount;
    shared += Math.min(sourceCount, candidate.get(token) ?? 0);
  }
  return sourceTotal === 0 ? 0 : shared / sourceTotal;
}

function bigrams(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    out.push(`${tokens[index - 1]}\u0000${tokens[index]}`);
  }
  return out;
}
