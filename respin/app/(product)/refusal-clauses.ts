// THE CLAUSES A REFUSAL MUST CARRY, as constants both readers import.
//
// WHY THIS FILE EXISTS AS ITS OWN MODULE — a layering fact, not tidiness.
// `billing-errors.ts` (the `?e=` copy map) imports `@respin/credits/app-server`
// and `@respin/config/app-server`, so a `"use client"` component cannot import
// it without pulling the Stripe adapter and the config reader into the browser
// bundle. This file imports nothing at all, which is what lets the in-form
// banner and the redirect copy map share one source instead of two literals.
//
// THE FINDING (slice 5 gate round 1, G2). `brain/edit-form.tsx` renders the
// R15a echo refusal INSIDE the form, as a returned action state rather than a
// `?e=` redirect — so it routed around `billing-errors.ts` entirely and, with
// it, around two things every other refusal in this product says:
//
//   1. WHAT HAPPENED TO THE WORK. The banner named the field, the reference id
//      and the matched span, and never said the draft was not stored. A
//      creator who has just been refused needs to know whether their edit
//      survived; every other refusal here says so in its second sentence.
//   2. THE NO-GUARANTEE DISCLAIMER (REQ-I04). `billing-errors.ts`'s own
//      comment marks it load-bearing — "R-3 is a control, not a guarantee".
//      Without it, "Rewrite this field in your own words … then submit it
//      again" reads as if clearing the bar means the field is clean. The
//      similarity gate stops the one thing it can measure — reuse of a
//      reference post's own wording — and promises nothing beyond that.
//
// `reference_echo`'s detail sentence is COMPOSED from these two, so the two
// surfaces cannot drift; `tests/brain-ui.test.tsx` asserts the composition and
// the banner both still contain them.

/** What happened to the creator's work. Every refusal answers this. */
export const NOTHING_SAVED_CLAUSE =
  "Nothing was saved and no credits were spent.";

/**
 * REQ-I04 / R-3: the similarity gate is a CONTROL, not a guarantee.
 *
 * It says exactly what the check does and refuses the inference a reader would
 * otherwise draw from passing it. Never softened into "we check for
 * originality", which would be the promise this sentence exists to withhold.
 */
export const ECHO_NO_GUARANTEE_CLAUSE =
  "This check does not promise the result is original or safe to publish — it only stops the one thing it can measure: repeating a reference post's own wording.";
