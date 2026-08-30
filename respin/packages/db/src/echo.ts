// The reference-echo bar: R-3 ("spin, never copy") as it reaches the brain.
//
// R-30 binding constraint 10 left this rule to M2b. `validateSourceEvidence`
// already stops a `reference` input being cited as PROVENANCE for the kinds
// that must be the creator's own. This module closes the other half, which the
// schema comment claimed and nothing enforced: no brain-doc CONTENT may echo a
// third party's post. That is the door R-3 fails through when a reference
// sentence appears in a field's *value* while an `own_post` quote supplies the
// warrant — and the spin similarity gate does not cover it, because that gate
// is spin-only (tech-spec §3 step 4).
//
// THREE MEASURED FACTS SHAPE THIS FILE. Each was checked against the installed
// runtime rather than assumed, because three plan-review rounds found the
// prose version of each of them wrong:
//
//   1. A SUBSTRING TEST IS THE WRONG INSTRUMENT. "Does this leaf appear in a
//      reference input" is whole-leaf containment: a 200-word field embedding
//      one stolen sentence passes, which is precisely the case the rule exists
//      for. The instrument has to be a sliding window.
//
//   2. WHITESPACE TOKENISING CANNOT SEE CJK. A 22-character Japanese span is
//      one whitespace "word", so an 8-word bar could never fire on Japanese,
//      Chinese, Thai or Khmer — the languages whose creators would be least
//      able to diagnose the silence. `Intl.Segmenter` is dictionary-based and
//      segments them properly; measured here, the ICU fixture below yields 11
//      word-like segments where a whitespace split yields 1.
//
//   3. `new Intl.Segmenter("und", …)` DOES NOT PIN ANYTHING. Measured on this
//      toolchain: `"und"` resolves to the HOST DEFAULT locale (`en-AU` here),
//      byte-identical to passing `undefined`. So the locale is pinned to a
//      locale that resolves to itself, and — because the real portability risk
//      is a small-ICU build rather than a locale — the load-time fixture below
//      is the actual control. Measured: word-like counts are identical under
//      "und", "en" and "ja" for both the CJK and the English fixture, so the
//      pin buys determinism in `resolvedOptions()`, not different behaviour.
import { createHash } from "node:crypto";
import { ProvenanceError, ReferenceEchoError } from "./errors";

/**
 * The window, in word-like segments, at or above which a span shared with a
 * `reference` input is refused.
 *
 * B-7 / TASK 47 (slice 4 honesty debt): the previous version of this comment
 * asserted "9 shared 8-grams in 607" under a heading that said MEASURED,
 * naming neither the two documents nor a reproducible method — a claim golden
 * rule 1 cannot verify is not a fact to restate, so it is corrected here
 * rather than carried forward. This is a JUDGMENT, plainly labelled as one,
 * following the precedent `REFERENCE_QUOTE_TOTAL_MAX_CHARS` below already
 * sets: nobody has run a fresh corpus measurement to derive 8, and none is
 * claimed. The reasoning that sets it there is qualitative and stands on its
 * own — ordinary phrasing collides well below 8 consecutive word-like
 * segments (a shared trigram or 5-gram is unremarkable between two posts on
 * the same topic), while 8 consecutive segments repeated verbatim is
 * distinctive enough that a false positive is rare and, when it happens,
 * recoverable by editing.
 *
 * IT IS A CODE CONSTANT AND NEVER A CONFIG KEY. `/admin/config` is a
 * paste-the-whole-document editor with no deploy, so a config home would be a
 * deploy-free path to weaken a hard rule — and no config flag may weaken one.
 *
 * A TRIPWIRE AGAINST WHOLESALE ECHO, NOT A PLAGIARISM DETECTOR. It errs closed
 * and its refusal is recoverable by editing, so a false positive costs an edit
 * while a false negative costs R-3. When a reference corpus exists at scale
 * (M2c), THIS is the number to re-derive against real collision rates — see
 * `REFERENCE_QUOTE_TOTAL_MAX_CHARS`'s docblock for the same trigger.
 */
export const ECHO_MIN_SEGMENTS = 8;

/**
 * A verbatim `reference`-classed quote may not exceed this many characters.
 *
 * `strategy` is exempt from the provenance bar because learning a MECHANISM
 * from someone else's post is what the shared library is for — but the quote
 * stored as its warrant is third-party text at rest, and the echo bar cannot
 * check a quote against the input it cites (that span is verbatim by
 * construction). This cap is therefore the operative control on that span, and
 * `assertReferenceQuoteBudget` below bounds the AGGREGATE so N capped quotes
 * cannot reassemble the post.
 */
export const REFERENCE_QUOTE_MAX_CHARS = 240;

/**
 * Aggregate ceiling on the DISTINCT material one profile has taken from ONE
 * reference input, across every retained brain version and kind (C-41).
 *
 * The per-quote cap alone bounds one quote, not the reassembly: nothing
 * otherwise stops N entries each carrying a different 240-character slice of
 * the SAME reference input. Both halves are needed and neither is sufficient.
 *
 * 600 IS AN UNMEASURED JUDGMENT, recorded as one rather than implied to be
 * derived. It is 2.5x the per-quote cap — enough for a handful of distinct
 * mechanism-level lines, well short of a short-form post's body. No corpus was
 * sampled to choose it and no reassembly threshold was measured; when a
 * reference corpus exists (M2c), the number is re-derivable from it and this
 * comment is the thing to come back to. Naming it a judgment is the difference
 * between a known limit and a false claim of derivation.
 */
export const REFERENCE_QUOTE_TOTAL_MAX_CHARS = 600;

const SEGMENTER_LOCALE = "en";

/**
 * Invisible characters, stripped before comparison — as a UNICODE CLASS,
 * never as a list.
 *
 * The enumerated version of this missed U+00AD SOFT HYPHEN, and a reviewer
 * measured that inserting it per word defeated the bar OUTRIGHT on a span
 * that otherwise refused. U+00AD is not exotic: PDF and web text extraction
 * insert it routinely, so a reference post pasted from a hyphenating source
 * silently disabled the bar for that input. A list of counterexamples is not
 * a class (2026-08-18) — and this file's own header makes exactly that
 * argument about tokenising.
 *
 * MEASURED, and the measurement is why this is TWO properties and not one.
 * `\p{Default_Ignorable_Code_Point}` alone is a strict superset of the list
 * it replaced — and it still excludes **32** `\p{Cf}` format characters
 * (U+0600-0605, U+06DD, U+070F, U+0890, U+0891, U+08E2, U+FFF9-FFFB,
 * U+110BD, U+110CD, U+13430-1343F), every one of which was measured to
 * defeat an otherwise-refusing span outright. Swapping one list for a
 * larger list is not the same as naming the class, which is the whole
 * point of the 2026-08-18 lesson — so the fold is `Cf` UNION `DI`.
 *
 * KNOWN RESIDUALS, recorded rather than implied — each defeats the bar for
 * that input, and naming them is the difference between a known limit and
 * a false claim of coverage:
 *   - combining marks (`\p{Mn}`, `\p{Me}`): measured, all defeat it;
 *   - modifier symbols (`\p{Sk}`, e.g. U+02C2-02C5): a fourth group, not
 *     a combining mark and not a homoglyph;
 *   - homoglyph substitution (Cyrillic for Latin).
 * Measured as NOT defeating it, and worth recording as a positive:
 * `\p{Cc}`, `\p{Zs}`, `\p{Zl}`, `\p{Zp}` — the segmenter handles those.
 */
// Written as escapes, never as the literal characters: they are invisible in
// source, so a literal class is unreviewable and unmaintainable — and eslint's
// no-irregular-whitespace refuses them outright. Still a regex LITERAL, not a
// string-assembled one (2026-08-21: one lost backslash turns `\s` into `s`).
const ZERO_WIDTH = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/** Every Unicode dash, folded to one, so an em-dash swap is not an escape. */
const DASHES = /[‐-―−﹘﹣－]/gu;

/** Every Unicode quote, folded to one, for the same reason. */
const QUOTES = /[‘’‚‛“”„‟′‵«»]/gu;

/**
 * The form BOTH sides are compared in.
 *
 * DELIBERATELY NOT `normaliseContent`. That function's output carries the
 * load-bearing UTF-16 offsets recorded in `source_evidence`, so moving it would
 * silently invalidate every stored quote; a regression test asserts it is
 * byte-identical to what it was. This is a separate, lossier form used only at
 * compare time and never stored.
 *
 * NFKC rather than NFC: NFKC folds full-width and compatibility forms, which is
 * the difference between catching a re-typed CJK span and missing it.
 */
export function echoComparisonForm(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(DASHES, "-")
    .replace(QUOTES, "'")
    .toLowerCase();
}

let segmenter: Intl.Segmenter | undefined;

/**
 * The CJK fixture that proves this runtime's ICU can actually segment a script
 * without word delimiters.
 *
 * THIS IS THE REAL PORTABILITY CONTROL. A small-ICU build still exposes
 * `Intl.Segmenter`, so the constructor succeeding proves nothing; what it
 * cannot do is segment Japanese, and there the whole bar degrades to silence
 * for exactly the creators least able to notice. Measured on full ICU: 11
 * word-like segments. Asserted at >= 8 so an ICU version bump that shifts the
 * count by one does not break the build, while a degraded runtime (which
 * yields 1) fails loudly at module load.
 */
const ICU_FIXTURE = "今日はいい天気ですね、散歩に行きましょう";
const ICU_FIXTURE_MIN_SEGMENTS = 8;

export class SegmenterUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `The word segmenter this runtime provides cannot support the reference-echo bar: ${detail}. The bar refuses rather than degrading, because a segmenter that cannot split a script silently turns the bar into a no-op for exactly the creators least able to diagnose it (R-3).`
    );
    this.name = "SegmenterUnavailableError";
  }
}

function getSegmenter(): Intl.Segmenter {
  if (segmenter) return segmenter;
  if (typeof Intl.Segmenter !== "function") {
    throw new SegmenterUnavailableError(
      "Intl.Segmenter is not a function in this runtime. A whitespace split cannot segment Japanese, Chinese, Thai or Khmer, so the bar would never fire for those scripts. Run on a Node build with full ICU"
    );
  }
  const s = new Intl.Segmenter(SEGMENTER_LOCALE, { granularity: "word" });
  const probe = [...s.segment(ICU_FIXTURE)].filter((x) => x.isWordLike).length;
  if (probe < ICU_FIXTURE_MIN_SEGMENTS) {
    throw new SegmenterUnavailableError(
      `the CJK fixture yielded ${probe} word-like segments, expected at least ${ICU_FIXTURE_MIN_SEGMENTS}. Run on a Node build with full ICU (small-icu is not supported)`
    );
  }
  segmenter = s;
  return s;
}

/**
 * The comparison unit: the sequence of word-like segments, each in comparison
 * form.
 *
 * PUNCTUATION IS EXCLUDED BY CONSTRUCTION rather than by enumeration — it is
 * not word-like — so an inserted comma, a changed full stop and a re-wrapped
 * line all fold away without anyone having to list them. That is why the
 * comparison is over SEQUENCES and never over a joined string: joining and
 * calling `includes()` reintroduces exactly the punctuation sensitivity this
 * shape removes.
 */
/**
 * Build a segmenter and run the ICU fixture through it.
 *
 * Exported so the loud failure is TESTABLE: a suite can stub `Intl.Segmenter`
 * and drive this directly. Round 4 and round 6 both found the probe had no
 * detector — the fixture is called "the real portability control" in this
 * file, and until now it could be weakened to zero or deleted outright with
 * the suite green.
 */
export function probeSegmenter(): number {
  if (typeof Intl.Segmenter !== "function") {
    throw new SegmenterUnavailableError(
      "Intl.Segmenter is not a function in this runtime"
    );
  }
  const s = new Intl.Segmenter(SEGMENTER_LOCALE, { granularity: "word" });
  const probe = [...s.segment(ICU_FIXTURE)].filter((x) => x.isWordLike).length;
  if (probe < ICU_FIXTURE_MIN_SEGMENTS) {
    throw new SegmenterUnavailableError(
      `the CJK fixture yielded ${probe} word-like segments, expected at least ${ICU_FIXTURE_MIN_SEGMENTS}`
    );
  }
  return probe;
}

export function wordLikeSegments(raw: string): string[] {
  const out: string[] = [];
  for (const seg of getSegmenter().segment(echoComparisonForm(raw))) {
    if (seg.isWordLike) out.push(seg.segment);
  }
  return out;
}

/**
 * The first window of >= ECHO_MIN_SEGMENTS consecutive word-like segments that
 * `candidate` shares with `reference`, or null.
 *
 * Returns the offending span so the refusal can name it (operator-facing: the
 * reference input is the creator's own submission, so naming it leaks nothing
 * to them, and it turns a false positive from a mystery into an edit).
 */
/**
 * The window separator, written as an ESCAPE and never as the byte.
 *
 * NUL rather than a space because a space can occur inside a segment and NUL
 * cannot, so two different segment sequences can never collide into one key.
 * It was originally typed as a literal control character, which is invisible
 * in source and survived review — the scan in echo.test.ts now refuses that.
 */
const SEGMENT_SEP = "\u0000";

export function findEchoWindow(
  candidate: string,
  reference: string,
  minSegments: number = ECHO_MIN_SEGMENTS
): string | null {
  const a = wordLikeSegments(candidate);
  const b = wordLikeSegments(reference);
  if (a.length < minSegments || b.length < minSegments) return null;
  const windows = new Set<string>();
  for (let i = 0; i + minSegments <= b.length; i++) {
    windows.add(b.slice(i, i + minSegments).join(SEGMENT_SEP));
  }
  for (let i = 0; i + minSegments <= a.length; i++) {
    const key = a.slice(i, i + minSegments).join(SEGMENT_SEP);
    if (windows.has(key)) return a.slice(i, i + minSegments).join(" ");
  }
  return null;
}

/**
 * Bounds on the content walk, and they REFUSE rather than skip.
 *
 * Same discipline as `assertMeteringOnly`, for the same reason: a walker that
 * silently skips a shape it does not understand fails OPEN on exactly the leaf
 * carrying the echo. Content is schema-validated before it reaches here, so
 * hitting either bound means the schema and this walker disagree — which is a
 * defect to surface, not to tolerate.
 */
const WALK_MAX_DEPTH = 8;
const WALK_MAX_NODES = 4096;

export class ContentWalkError extends Error {
  constructor(detail: string) {
    super(
      `Brain-doc content could not be walked safely: ${detail}. The reference-echo bar refuses rather than skips, because a walker that silently skips a shape it does not understand fails open on exactly the leaf that carries the echo (R-3).`
    );
    this.name = "ContentWalkError";
  }
}

/**
 * Every string leaf of a content value, with its RFC-6901 JSON Pointer.
 *
 * Object KEYS are collected as well as values: a model that puts a copied
 * sentence in a key would otherwise walk straight past this bar.
 */
export function collectStringLeaves(
  value: unknown
): Array<{ pointer: string; text: string }> {
  const out: Array<{ pointer: string; text: string }> = [];
  let nodes = 0;
  const escape = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");

  const walk = (node: unknown, pointer: string, depth: number): void => {
    if (++nodes > WALK_MAX_NODES) {
      throw new ContentWalkError(`more than ${WALK_MAX_NODES} nodes`);
    }
    if (depth > WALK_MAX_DEPTH) {
      throw new ContentWalkError(`nesting deeper than ${WALK_MAX_DEPTH}`);
    }
    if (typeof node === "string") {
      out.push({ pointer, text: node });
      return;
    }
    if (node === null || typeof node === "number" || typeof node === "boolean") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${pointer}/${i}`, depth + 1));
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        // The KEY is content too.
        out.push({ pointer: `${pointer}/${escape(k)}#key`, text: k });
        walk(v, `${pointer}/${escape(k)}`, depth + 1);
      }
      return;
    }
    throw new ContentWalkError(`an unsupported value of type ${typeof node}`);
  };

  walk(value, "", 0);
  return out;
}

/** One `reference`-classed input, as the bar sees it. */
export type ReferenceInput = { id: string; content: string };

/**
 * Refuse if any string leaf of `content` echoes any reference input.
 *
 * Runs at WRITE and at ACTIVATION. It deliberately does NOT refuse on the
 * export path — an export is a data-subject right (REQ-A04), `onboarding_inputs`
 * is immutable with no delete path, and brain versions are append-only, so a
 * reference input appended later would otherwise deny the creator their own
 * data permanently with no product action that clears it. Export annotates
 * instead; the third enforcement point is M3's prompt-bundle read, which is
 * where the leak route actually runs.
 */
export function assertNoReferenceEcho(
  content: unknown,
  references: readonly ReferenceInput[] | null | undefined
): void {
  // AN ABSENT CORPUS IS A REFUSAL, NOT A NO-OP.
  //
  // The previous form returned early whenever the array was empty, so a
  // caller that failed to build the corpus — or handed in an empty one —
  // turned the whole R-3 brain echo bar off SILENTLY, with every test still
  // green. That is the fail-open shape this repo has already met twice.
  // "This profile genuinely has no reference inputs" and "nobody gave me a
  // corpus" have to be different values, so the caller must say which it
  // means rather than leaving the bar to guess.
  if (references === null || references === undefined) {
    throw new ProvenanceError(
      "the reference-echo bar was called without a corpus. Pass the profile's reference inputs explicitly — an empty array means 'this profile has none', while a missing corpus would silently disable the check R-3 rests on"
    );
  }
  if (references.length === 0) return;
  const leaves = collectStringLeaves(content);
  for (const leaf of leaves) {
    for (const ref of references) {
      const span = findEchoWindow(leaf.text, ref.content);
      if (span !== null) {
        throw new ReferenceEchoError(
          `the field at ${leaf.pointer || "/"} repeats a span of at least ${ECHO_MIN_SEGMENTS} words from a reference post (input ${ref.id}): "${span}". A brain document records how YOU write; a reference post is somebody else's work, kept so a mechanism can be noted from it (R-3). Rewrite the span in your own words`,
          { pointer: leaf.pointer || "/", inputId: ref.id, span }
        );
      }
    }
  }
}

/**
 * Annotate rather than refuse — the export path's form of the same check.
 */
export function findReferenceEchoes(
  content: unknown,
  references: readonly ReferenceInput[] | null | undefined
): Array<{ pointer: string; inputId: string; span: string }> {
  const found: Array<{ pointer: string; inputId: string; span: string }> = [];
  // The export path must NEVER throw (C-35, REQ-A04): an export is a
  // data-subject right and the creator cannot be denied their own data by a
  // caller's wiring bug. Its refusing twin above treats a missing corpus as an
  // error; here the same input yields "no annotations", deliberately, because
  // the failure modes are opposite. Previously this dereferenced `.length`
  // and raised a raw TypeError on exactly that path.
  if (references === null || references === undefined) return found;
  if (references.length === 0) return found;
  for (const leaf of collectStringLeaves(content)) {
    for (const ref of references) {
      const span = findEchoWindow(leaf.text, ref.content);
      if (span !== null) {
        found.push({ pointer: leaf.pointer, inputId: ref.id, span });
      }
    }
  }
  return found;
}

/**
 * One cited span, as the budget sees it.
 *
 * `postSha` — NOT `inputId` — is the aggregation key. The gate found that the
 * same third-party post pasted twice as two `onboarding_inputs` rows bought two
 * separate 600-character budgets, and reassembled a 989-character post exactly
 * and contiguously through the public capabilities alone. `input_class` has no
 * content dedupe and never had one, so the id was never the identity of the
 * post; the sha of its normalised content is.
 */
export type ReferenceQuoteSpan = {
  /** sha256 of the normalised reference post this span was taken from. */
  postSha: string;
  /** Kept for the refusal message only — never for aggregation. */
  inputId: string;
  startUtf16: number;
  endUtf16: number;
  quote: string;
};

/**
 * The ONE predicate for "is this a usable [start, end) range", shared by the
 * two call sites the tenancy gate found disagreeing (G-16): this module's own
 * `assertUsableSpan` below (which THROWS on a bad range, because it runs on
 * material this write is about to cite) and `retainedReferenceSpans` in
 * `with-workspace.ts` (which must SKIP a bad range on an already-stored row,
 * because a stored malformed span must never make a profile permanently
 * unable to write again — C-9 / C-41's never-brick property, one layer up).
 *
 * Two call sites computing this independently is exactly the shape that
 * disagreed: the skip-list checked `Number.isInteger` only, the refuse-list
 * also checked negative and inverted, and a stored inverted range fell through
 * the gap — skipped by neither, so it reached `assertUsableSpan` on every
 * later write and bricked the profile permanently. One predicate, two callers
 * choosing what to DO with a `false` (throw vs skip), removes the gap by
 * construction rather than by keeping both lists in sync by hand.
 */
export function isUsableSpanRange(startUtf16: number, endUtf16: number): boolean {
  return (
    Number.isInteger(startUtf16) &&
    Number.isInteger(endUtf16) &&
    startUtf16 >= 0 &&
    endUtf16 >= startUtf16
  );
}

/** A span that is not a finite, non-negative, non-inverted half-open range. */
function assertUsableSpan(s: ReferenceQuoteSpan): void {
  // FAIL CLOSED ON THE RANGE ITSELF, because this function is a public export
  // (`index.ts`) and its old doc comment justified trusting the numbers on the
  // ground that "`validateSourceEvidence` has already proved each one
  // in-bounds". That is a CALLER OBLIGATION, and this module refuses caller
  // obligations 100 lines up: an absent corpus is a refusal, not a no-op.
  //
  // Both fail-OPEN cases were measured by reviewers, independently:
  //   - one `{startUtf16: NaN, endUtf16: NaN}` span makes the union `NaN`, and
  //     `NaN > 600` is FALSE, so the entire ceiling passes;
  //   - one inverted `{startUtf16: 1000, endUtf16: 0}` contributes -1000, which
  //     CREDITS the budget and buys back material already taken.
  if (!isUsableSpanRange(s.startUtf16, s.endUtf16)) {
    throw new ProvenanceError(
      `a cited span records the range [${String(s.startUtf16)}, ${String(s.endUtf16)}), which is not a valid position in reference post ${s.inputId}. A range that is inverted, negative or not a whole number cannot be measured, and a budget that cannot measure a span must refuse it rather than skip it (R-3)`
    );
  }
}

/**
 * G-11 LAYER A — the budget's aggregation key, keyed on the COMPARISON FORM of
 * a reference post's content rather than on `content_sha256`.
 *
 * `content_sha256` (stored on `onboarding_inputs`, taken over `normaliseContent`
 * — NFC + CRLF->LF only) is the WRONG equivalence relation for this purpose: a
 * trailing space, a re-cased letter, a smart quote or a soft hyphen all change
 * it, so pasting the same reference post twice with one trailing space bought
 * TWO separate 600-character budgets — measured reassembling a 989-character
 * post exactly and contiguously. `echoComparisonForm` already folds every one
 * of those (NFKC, zero-width strip, dash/quote fold, lowercase) because it is
 * the form the echo bar itself compares in, so keying the budget on a digest
 * of THAT form closes the class in one line with no new machinery.
 *
 * DELIBERATELY A SEPARATE DIGEST, never `content_sha256` itself. That column
 * indexes `source_evidence`'s stored offsets (`echo.ts`'s own header states
 * why `echoComparisonForm` must never replace `normaliseContent`) and is read
 * for reasons that have nothing to do with the R-3 budget; conflating the two
 * would make a future change to one silently change the other.
 */
/**
 * The normalised form the budget's identity is computed over — deliberately
 * ONE STEP FURTHER than `echoComparisonForm`.
 *
 * MEASURED, not assumed: `echoComparisonForm` folds case, dashes, quotes and
 * zero-width characters, but it does not touch an ORDINARY space — U+0020 is
 * outside both `\p{Cf}` and `\p{Default_Ignorable_Code_Point}` by definition,
 * so a genuinely trailing or doubled space survives it unchanged. That is
 * precisely the running example this slice's own register entry and phase
 * card use for G-11 ("a trailing space… mints a fresh 600-character budget"),
 * so leaving it unclosed here would ship the fix under the name of the bug it
 * does not fix. `trim()` plus collapsing internal whitespace runs closes it
 * without touching `echoComparisonForm` itself, which stays exactly the form
 * the echo bar compares in (its own docblock explains why that must not move).
 */
function budgetComparisonForm(content: string): string {
  return echoComparisonForm(content).trim().replace(/\s+/g, " ");
}

export function referenceBudgetKey(content: string): string {
  return createHash("sha256")
    .update(budgetComparisonForm(content), "utf8")
    .digest("hex");
}

/**
 * G-11 LAYER B — the containment bucket.
 *
 * Layer A alone cannot see a SUBSTRING: a 500-character excerpt of a
 * 1,000-character reference post is a different document under any exact
 * digest, so pasting an excerpt as a second reference input would buy it a
 * second 600-character budget and the reassembly attack survives Layer A
 * intact. Two reference inputs are "the same post" for budget purposes when
 * they share at least `ECHO_MIN_SEGMENTS` word-like segments in a sliding
 * window — the IDENTICAL relation `findEchoWindow` already computes for the
 * echo bar itself, so this reuses it rather than inventing a second
 * similarity measure with its own edge cases.
 *
 * UNION-FIND OVER THE WHOLE CORPUS, computed ONCE per write and shared by the
 * caller across both the spans this write adds and every span already
 * retained (with-workspace.ts composes it that way) — never recomputed
 * independently for "new" and "retained", which would let the two disagree
 * about which bucket a post belongs to inside the SAME write.
 *
 * THE RETURNED KEY IS INTERNAL AND OPAQUE — a representative input id from
 * each connected component — and is meaningful only for the ONE call that
 * produced it. Nothing persists it: `retainedReferenceSpans` recomputes the
 * whole map fresh on every write from the CURRENT corpus, which is what keeps
 * a newly-added reference post able to merge into an existing bucket rather
 * than being compared against a snapshot frozen at some earlier write.
 *
 * O(n^2) `findEchoWindow` comparisons over the corpus. Reference inputs are
 * capped per profile (`REFERENCE_COUNT_MAX`, onboarding-ops.ts) precisely so
 * this stays a write-path-appropriate cost rather than an unbounded one.
 */
export function groupReferenceInputs(
  inputs: readonly ReferenceInput[]
): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    // Path compression, iterative — flattens the chain so repeated lookups on
    // a large corpus stay cheap.
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const inp of inputs) parent.set(inp.id, inp.id);

  // Layer A folded in here too: an EXACT comparison-form match unions
  // trivially, which matters for a pair of posts too short to carry a full
  // `ECHO_MIN_SEGMENTS`-word window (findEchoWindow returns null below that
  // length even for byte-identical content) — a short duplicate must still
  // land in one bucket.
  const byForm = new Map<string, string>();
  for (const inp of inputs) {
    const form = budgetComparisonForm(inp.content);
    const seen = byForm.get(form);
    if (seen !== undefined) union(seen, inp.id);
    else byForm.set(form, inp.id);
  }

  // Layer B: any pair sharing an echo window is the same post.
  for (let i = 0; i < inputs.length; i++) {
    for (let j = i + 1; j < inputs.length; j++) {
      if (find(inputs[i].id) === find(inputs[j].id)) continue;
      if (findEchoWindow(inputs[i].content, inputs[j].content) !== null) {
        union(inputs[i].id, inputs[j].id);
      }
    }
  }

  const out = new Map<string, string>();
  for (const inp of inputs) out.set(inp.id, find(inp.id));
  return out;
}

/**
 * The per-quote cap AND the aggregate ceiling, together.
 *
 * Splitting these into two functions would invite one of them being called
 * alone, which is how the per-quote cap came to look sufficient in the first
 * place.
 *
 * THE AGGREGATION UNIT IS `(profile, reference POST)` AND THE MEASURE IS THE
 * UNION OF DISTINCT COVERED RANGES (C-41, superseding C-37's unit; the key
 * corrected from `inputId` to `postSha` after the compliance gate).
 *
 * A SUM over an append-only table is a MONOTONE COUNTER. `brain_docs` versions
 * are append-only with no delete path, so summing every quote ever cited from
 * reference R means a first brain build citing 600 characters of R exhausts
 * that profile's budget for R PERMANENTLY: every later rebuild citing the same
 * spans is refused, and refused AFTER the model tokens are spent.
 *
 * A UNION over ranges keeps the property C-37 wanted and drops the one it did
 * not. What R-3 bounds is how much of somebody else's post this profile has
 * extracted, and re-citing a span already extracted extracts nothing further.
 *
 * `newSpans` is what THIS write adds; `retained` is every span already on the
 * profile. The split is load-bearing and is the second half of the
 * never-brick property: the ceiling refuses only when the write adds NEW
 * material. If `retained` alone already exceeds the ceiling — which a
 * concurrent pair of writes could once produce — a rebuild citing only
 * already-covered spans still writes, because it extracts nothing further.
 * Refusing on the union total instead would lock the profile out permanently
 * with no action available to the creator, which is the exact outage C-41
 * exists to remove.
 */
export function assertReferenceQuoteBudget(
  newSpans: readonly ReferenceQuoteSpan[],
  retained: readonly ReferenceQuoteSpan[] = []
): void {
  for (const s of newSpans) {
    assertUsableSpan(s);
    if (s.quote.length > REFERENCE_QUOTE_MAX_CHARS) {
      throw new ReferenceEchoError(
        `a quote drawn from a reference post is ${s.quote.length} characters, over the ${REFERENCE_QUOTE_MAX_CHARS}-character limit. Evidence drawn from somebody else's post stays mechanism-level (R-9, REQ-D04): quote the line that shows the mechanism, not the passage`
      );
    }
  }
  // Retained spans are checked for MEASURABILITY but not for the per-quote cap:
  // re-applying the cap to stored rows would let a future cap reduction brick
  // every profile that wrote under the old one.
  for (const s of retained) assertUsableSpan(s);

  // GROUPED BY BUCKET, THEN BY inputId WITHIN THE BUCKET.
  //
  // G-11 Layer B can put TWO DIFFERENT `onboarding_inputs` rows in one bucket
  // (a full reference post and a separately-pasted excerpt of it) — and their
  // UTF-16 offsets are two DIFFERENT COORDINATE SPACES: `[0,100)` into the
  // excerpt's own stored content is not the same 100 characters as `[0,100)`
  // into the full post's. Unioning raw numeric ranges ACROSS inputIds treats
  // those as the same axis and silently UNDER-counts whenever they happen to
  // overlap numerically — found by this slice's own bucket tests, not by a
  // reviewer. Union stays WITHIN one inputId (safe: same coordinate space,
  // and identical to every pre-slice-4 behaviour when a bucket holds exactly
  // one inputId, which is every case before Layer B existed); ACROSS inputIds
  // in the same bucket the totals are SUMMED, the conservative direction —
  // it can only over-count material genuinely repeated across two rows that
  // are the same post, never under-count material actually taken.
  const group = (list: readonly ReferenceQuoteSpan[]) => {
    const by = new Map<
      string,
      { id: string; byInput: Map<string, Array<[number, number]>> }
    >();
    for (const s of list) {
      const e = by.get(s.postSha) ?? { id: s.inputId, byInput: new Map() };
      const ranges = e.byInput.get(s.inputId) ?? [];
      ranges.push([s.startUtf16, s.endUtf16]);
      e.byInput.set(s.inputId, ranges);
      by.set(s.postSha, e);
    }
    return by;
  };
  const coveredLengthOf = (entry: {
    byInput: Map<string, Array<[number, number]>>;
  }): number => {
    let total = 0;
    for (const ranges of entry.byInput.values()) total += unionLength(ranges);
    return total;
  };
  const before = group(retained);
  const after = group([...retained, ...newSpans]);

  for (const [sha, entry] of after) {
    const coveredAfter = coveredLengthOf(entry);
    if (coveredAfter <= REFERENCE_QUOTE_TOTAL_MAX_CHARS) continue;
    const beforeEntry = before.get(sha);
    const coveredBefore = beforeEntry ? coveredLengthOf(beforeEntry) : 0;
    // Already over the ceiling and adding nothing new: permitted, deliberately.
    // See the header — this is what makes the refusal unable to become an
    // unclearable outage.
    if (coveredAfter <= coveredBefore) continue;
    throw new ReferenceEchoError(
      `this write would take ${coveredAfter - coveredBefore} further characters from reference post ${entry.id}, bringing the total distinct material quoted from it to ${coveredAfter} — over the ${REFERENCE_QUOTE_TOTAL_MAX_CHARS}-character limit. The per-quote cap alone would let several capped quotes reassemble somebody else's post, so the distinct material taken from one post is bounded too (R-3). Re-citing a span you already cited costs nothing; quoting a further passage is what raises this`
    );
  }
}

/**
 * Total length covered by a set of half-open ranges, counting overlap once.
 *
 * Sort-and-merge rather than a per-character set: a `Set<number>` would be
 * correct and would allocate one entry per covered code unit, so a pathological
 * evidence list turns a compliance check into a memory event on the write path.
 *
 * Every range reaching here has passed `assertUsableSpan`, so the arithmetic
 * cannot go negative or `NaN`. `Math.max(0, ...)` is belt-and-braces on the one
 * line where a fail-open would be silent rather than loud.
 */
function unionLength(ranges: Array<[number, number]>): number {
  if (ranges.length === 0) return 0;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let total = 0;
  let [curStart, curEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= curEnd) {
      // Overlapping or adjacent — extend, never add. `<=` rather than `<` is
      // deliberate for the ADJACENT case: [0,10) and [10,20) are 20 distinct
      // characters either way, and merging them keeps the interval list short.
      if (e > curEnd) curEnd = e;
    } else {
      total += Math.max(0, curEnd - curStart);
      curStart = s;
      curEnd = e;
    }
  }
  total += Math.max(0, curEnd - curStart);
  return total;
}
