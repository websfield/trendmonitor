// THE ONE PLACE THE AUTOPSY'S CONTRACT AND THE SPIN GATE'S CONTRACT CAN MEET.
//
// `packages/modes` does not depend on `packages/trends`, and `packages/trends`
// depends on nothing at all — deliberately, and neither direction should be
// added just to share four numbers. The cost of that isolation is that each
// side's bounds were chosen alone, and by 2026-09-04 every one of the four
// disagreed: the autopsy is told to emit "the original opening wording (max 800
// characters)" and the gate refused anything over 30 WORDS, so the first
// `analyseAndSpin` generation that ever completed against the real vendor was
// refused on a 63-word hook the worker had correctly produced. A spin of a real
// autopsy was structurally impossible, and nothing could see it: both packages'
// suites build their own fixtures, so neither ever met the other's data.
//
// This file is the app-level test that imports BOTH, which only a test at this
// level can do. It is the whole witness for the agreement, so it fails the day
// either side moves — which is the point.
import { describe, expect, it } from "vitest";

// BY PATH, NOT BY PACKAGE NAME, following `claims-vocabulary-agreement.test.ts`:
// adding `@respin/modes` to the app package's dependencies would make it
// RESOLVABLE from `app/**`, and R-64's denial would then rest on the lint rule
// alone where today it also rests on module resolution.
import {
  AUTOPSY_MAX_BEATS,
  AUTOPSY_MAX_HOOK_CHARS,
  AUTOPSY_MAX_SUBJECT_TERMS,
  AUTOPSY_MAX_SUBJECT_TERM_CHARS,
  AUTOPSY_MAX_STAGE_TEXT_CHARS,
} from "../packages/trends/src/autopsy";
import { parseCanonicalAutopsyAnalysis } from "../packages/db/src/trends-storage";
import {
  CODE_SPIN_STRICTNESS_FLOOR,
  MAX_BEATS,
  MAX_HOOK_CHARS,
  MAX_SUBJECT_TERMS,
  MAX_SUBJECT_TERM_CHARS,
  evaluateSpinSimilarity,
  type SpinReference,
} from "../packages/modes/src/similarity";
import {
  REFERENCE_MECHANISM_BEATS_MAX,
  REFERENCE_MECHANISM_TEXT_MAX_CODE_POINTS,
} from "../packages/modes/src/assemble";
import { parseScriptOutput } from "../packages/modes/src/output";
import { SCRIPT_OUTPUT } from "../packages/modes/tests/support/mode-fixtures";

/**
 * A REAL parsed output, and the bare `.not.toThrow()` above is why it had to
 * become one. The fixture used to be `{ hooks: [...] } as never`, which made
 * `outputTextUnits` raise a `TypeError` on every run — and
 * `.not.toThrow(/trusted structured reference/i)` passes on a DIFFERENT error,
 * so this case never once reached the gate it exists to exercise.
 */
const OUTPUT = parseScriptOutput({
  text: JSON.stringify(SCRIPT_OUTPUT),
  mode: "analyseAndSpin",
});

describe("the Spin gate accepts every reference the autopsy is allowed to produce", () => {
  it("bounds the gate at EXACTLY the producer's numbers, field by field", () => {
    // EQUALITY, NOT `>=` (code review, 2026-09-04). The original assertions
    // were one-sided, so `MAX_HOOK_CHARS: 100_000` and
    // `MAX_SUBJECT_TERMS: 5_000` were both planted as mutations and both
    // SURVIVED — while `similarity.ts`' own header says unbounded reference
    // material is the one thing this control must not accept. A consumer bound
    // WIDER than the producer's contract is as wrong as a narrower one; it is
    // just wrong in the direction nobody was watching.
    expect(MAX_HOOK_CHARS).toBe(AUTOPSY_MAX_HOOK_CHARS);
    expect(MAX_SUBJECT_TERMS).toBe(AUTOPSY_MAX_SUBJECT_TERMS);
    expect(MAX_SUBJECT_TERM_CHARS).toBe(AUTOPSY_MAX_SUBJECT_TERM_CHARS);
    expect(MAX_BEATS).toBe(AUTOPSY_MAX_BEATS);
  });

  it("the PROMPT ASSEMBLER's beat bound is the producer's too — the fourth consumer", () => {
    // THE POPULATION WAS THREE-QUARTERS OF ITSELF. This file called itself
    // "the whole witness for the agreement" while comparing only the similarity
    // gate's constants. `assemble.ts` is a second consumer of the same producer
    // contract, it was left at 20 against the producer's 50, and the compliance
    // gate proved by execution that a 25-beat autopsy passes validation, passes
    // the similarity gate, and is then refused by the assembler BEFORE the
    // vendor call — the exact class R-101 says it closed.
    expect(REFERENCE_MECHANISM_BEATS_MAX).toBe(AUTOPSY_MAX_BEATS);
  });

  it("does not refuse a reference sitting on every one of the producer's limits at once", () => {
    // A COMPARISON, NOT AN ASSERTION ABOUT NUMBERS. The test above compares
    // constants and would still pass if `assertTrustedReference` grew a fifth
    // bound nobody exported. This one builds the largest reference the producer
    // may emit and puts it through the gate, so a new refusal is caught by the
    // behaviour rather than by the bookkeeping.
    const maximal: SpinReference = {
      hook: "a".repeat(AUTOPSY_MAX_HOOK_CHARS),
      // Distinct, and EXACTLY on the character bound rather than near it: a
      // term one character over would make this test pass for the wrong reason.
      subjectTerms: Array.from(
        { length: AUTOPSY_MAX_SUBJECT_TERMS },
        (_, i) =>
          `${String(i).padStart(2, "0")}${"b".repeat(AUTOPSY_MAX_SUBJECT_TERM_CHARS - 2)}`,
      ),
      structure: { beatCount: AUTOPSY_MAX_BEATS, turnBeat: AUTOPSY_MAX_BEATS - 1 },
    };
    expect(() =>
      evaluateSpinSimilarity({
        output: OUTPUT,
        reference: maximal,
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }),
    // BARE `.not.toThrow()`, and the reason is measured: driven against the
    // installed vitest, `.not.toThrow(/regex/)` PASSES when a DIFFERENT error is
    // thrown. The original assertion therefore went green on
    // `new Error("a brand new fifth bound")` — it could not catch the very
    // thing its comment claims ("a new refusal is caught by the behaviour
    // rather than by the bookkeeping"), which is the only reason this case
    // exists (code review, 2026-09-04).
    ).not.toThrow();
  });

  it("does not refuse a producer-legal reference whose text has no word characters", () => {
    // THE FIFTH MEMBER OF THE CLASS, invisible to the maximal fixture above
    // because that one uses `"a".repeat(...)`. The producer's emptiness
    // predicate is `value.trim().length === 0` (`autopsy.ts`); the gate's is
    // `words(...).length === 0`. A hook of pure punctuation or emoji is
    // producer-legal and the gate refuses it AFTER the vendor call, into
    // 8c-G4's "Something went wrong" (code review, 2026-09-04).
    for (const text of ["!!! ??? ---", "\u{1F600}\u{1F680}"]) {
      expect(text.trim().length, "the producer accepts this").toBeGreaterThan(0);
      expect(() =>
        evaluateSpinSimilarity({
          output: OUTPUT,
          reference: {
            hook: text,
            subjectTerms: [text],
            structure: { beatCount: 3, turnBeat: 1 },
          },
          configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
        }),
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// THE OTHER TWO CONSUMERS, ADDED IN ROUND 2 (compliance gate).
//
// This file called itself "the whole witness for the agreement" while comparing
// the similarity gate's four constants and nothing else. There are two more
// copies of the producer's contract in the tree, and the class had already
// recurred twice before either was found.

describe("every consumer of the autopsy contract agrees with the producer", () => {
  it("the PROMPT ASSEMBLER's stage-text bound is the producer's", () => {
    // `REFERENCE_MECHANISM_TEXT_MAX_CODE_POINTS` was documented as matching
    // `MAX_STAGE_TEXT_CHARS`, which was not exported and therefore not
    // compared. Safe only by an unwritten argument about code points versus
    // UTF-16 units; the day the producer's bound moves, this file stayed green
    // and a producer-legal mechanism was refused before the vendor call.
    expect(REFERENCE_MECHANISM_TEXT_MAX_CODE_POINTS).toBe(
      AUTOPSY_MAX_STAGE_TEXT_CHARS,
    );
  });

  it("the DB-layer canonical parser accepts exactly what the producer emits", () => {
    // `parseCanonicalAutopsyAnalysis` re-states all five bounds as bare
    // literals, because `packages/db` cannot import `@respin/trends`. It gates
    // the trend feed, the spin reference and the worker's completion — the last
    // of which throws AFTER the vendor is paid. Driven through the real
    // function at each producer maximum rather than compared as constants.
    const maximal = {
      hookMechanic: "m".repeat(AUTOPSY_MAX_STAGE_TEXT_CHARS),
      beats: Array.from({ length: AUTOPSY_MAX_BEATS }, (_, i) => `beat ${i}`),
      ending: "e".repeat(AUTOPSY_MAX_STAGE_TEXT_CHARS),
      followTrigger: "f".repeat(AUTOPSY_MAX_STAGE_TEXT_CHARS),
      subjectTerms: Array.from(
        { length: AUTOPSY_MAX_SUBJECT_TERMS },
        (_, i) => `${String(i).padStart(2, "0")}${"t".repeat(AUTOPSY_MAX_SUBJECT_TERM_CHARS - 2)}`,
      ),
      hook: "h".repeat(AUTOPSY_MAX_HOOK_CHARS),
      structure: { beatCount: AUTOPSY_MAX_BEATS, turnBeat: AUTOPSY_MAX_BEATS - 1 },
    };
    expect(parseCanonicalAutopsyAnalysis(maximal)).not.toBeNull();

    // NON-VACUITY on every bound: one past each maximum must be refused, or
    // the case above passes against a parser that accepts anything.
    const over: Record<string, unknown>[] = [
      { ...maximal, hook: "h".repeat(AUTOPSY_MAX_HOOK_CHARS + 1) },
      { ...maximal, hookMechanic: "m".repeat(AUTOPSY_MAX_STAGE_TEXT_CHARS + 1) },
      {
        ...maximal,
        beats: Array.from({ length: AUTOPSY_MAX_BEATS + 1 }, (_, i) => `beat ${i}`),
        structure: { beatCount: AUTOPSY_MAX_BEATS + 1, turnBeat: null },
      },
      {
        ...maximal,
        subjectTerms: Array.from(
          { length: AUTOPSY_MAX_SUBJECT_TERMS + 1 },
          (_, i) => `term ${i}`,
        ),
      },
      { ...maximal, subjectTerms: ["s".repeat(AUTOPSY_MAX_SUBJECT_TERM_CHARS + 1)] },
    ];
    for (const [i, candidate] of over.entries()) {
      expect(parseCanonicalAutopsyAnalysis(candidate), `over-bound case ${i}`).toBeNull();
    }
  });
});
