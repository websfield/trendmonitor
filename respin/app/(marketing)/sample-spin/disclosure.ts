// WHAT THE PUBLIC SAMPLE SPIN KEEPS, AND WHERE THE TEXT GOES — one sentence,
// three producers.
//
// WHY THIS MODULE EXISTS (batch-5 compliance gate, C-3; P6-R7's file row 15).
// The third-party model provider was disclosed in ONE of the three places a
// visitor reads this claim — the panel's shouted foot — and the two that were
// missed are the two that matter most:
//
//   1. The TEXTAREA LABEL said only "Nothing you type is kept." It is the
//      sentence a person reads at the moment they are typing, and the only one
//      a screen-reader user hears when the field takes focus.
//   2. `/legal` said the Sample Spin "keeps neither the idea you type nor the
//      output it shows you" and named no provider anywhere on the page. That
//      is the page a visitor opens precisely to find out.
//
// "We keep nothing" and "your text is sent to a third party" are both true and
// only the pair is honest; splitting them across surfaces let the reassuring
// half ship alone. The fix that landed first was one line in the foot, which
// is the instance rather than the class — and the test pinning it read
// `toContain("NOTHING YOU TYPE IS KEPT")`, a string the PRE-FIX copy also
// satisfied, so a revert would have been green.
//
// So the claim lives here once. Every producer imports it, and
// `tests/sample-spin-copy.test.tsx` asserts each surface carries BOTH clauses
// rather than the comfortable one.

/** The two clauses, so a surface can never assert one without the other. */
export const SAMPLE_SPIN_KEEPS_NOTHING = "Nothing you type is kept";
export const SAMPLE_SPIN_GOES_TO_PROVIDER = "it does go to a third-party model provider";

/**
 * The sentence, for a surface that renders ordinary prose.
 *
 * Used by the panel's field label and by `/legal`'s Sample Spin bullet.
 */
export const SAMPLE_SPIN_RETENTION = `${SAMPLE_SPIN_KEEPS_NOTHING} here, though ${SAMPLE_SPIN_GOES_TO_PROVIDER}.`;
