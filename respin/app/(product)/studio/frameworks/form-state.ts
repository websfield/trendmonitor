// The private-framework form's PURE half: what a creator typed → the content
// object `respinDb.createPrivateFramework` is handed (slice 7, R5c / REQ-D05).
//
// NO IMPORTS AT ALL, for two reasons that both bind:
//  - the client panel renders these constants and this file's sibling copy, and
//    `./copy.ts` reaches `../../billing-errors` → `@respin/credits/app-server`
//    → `pg`. `tests/client-bundle-boundary.test.ts` caught exactly that on the
//    first draft of the studio panel.
//  - a parser with no imports is a parser a test can drive with a plain object,
//    which is what makes "a field went missing on the way to the database" a
//    red test rather than a browser walk.
//
// ---------------------------------------------------------------------------
// WHAT THIS SCREEN DOES NOT ASK FOR, AND WHY EACH ABSENCE IS A DECISION.
//
// `frameworkContentSchema` is a `strictObject` with eight fields. This form
// fills six of them from the creator, sets one to a fixed honest value, and
// leaves one empty — and none of those three is an oversight:
//
//  - `saturation` IS NOT A CONTROL. It is a claim about how worn a shape is in
//    the MARKET, and nothing in this product has measured that — the trend
//    monitor that could is slice 8. `SHARED_FRAMEWORK_SEED` records the same
//    decision for the nine curated frameworks ("`observed` says 'we have seen
//    this work', which is what the corpus supports and no more"), and offering a
//    creator a dropdown that lets them label their own framework `established`
//    would be handing them a claim the product refuses to make itself.
//    `NEW_FRAMEWORK_SATURATION` below is that value, and a test parses it
//    through the real schema so the constant cannot drift from the enum.
//  - `sourceReferences` IS LEFT EMPTY, because the evidence entries carry the
//    same `{kind, ref}` pair plus what was observed. Asking twice would be
//    asking the same question twice, and a form that collects a fact under two
//    names collects it inconsistently.
//  - EVERY EVIDENCE ENTRY IS `creator_submitted`. The other two source kinds
//    (`internal_autopsy`, `trend_item`) name records this product produced; a
//    creator cannot truthfully claim either, so offering them as options would
//    be offering a way to mislabel provenance in the one table REQ-D04 governs.
//
// AND THE CONSEQUENCE, STATED RATHER THAN HIDDEN: `deriveFrameworkConfidence`
// is a function of how many evidence entries a framework carries, so a private
// framework built here reaches `single_case` with one example and `repeated`
// with two or three. It cannot reach `contrasted` from this screen, which needs
// five — and that is the honest ceiling for a form with three slots, not a
// limitation worth hiding. `FRAMEWORK_EVIDENCE_SLOTS` is the number, and the
// copy beside the form says what each rung means.

/**
 * How many evidence slots the form offers.
 *
 * THREE, AND THE NUMBER IS A JUDGEMENT rather than a constant somebody picked:
 * one is the difference between "I have seen this" and "I have seen this once",
 * and three is where `deriveFrameworkConfidence` reaches `repeated` — the rung
 * that means the creator has watched the same mechanism work more than once.
 * A repeating "add another" control is a better form and is a client-state
 * surface this slice did not build; the ceiling is stated on screen instead of
 * being discovered.
 */
export const FRAMEWORK_EVIDENCE_SLOTS = 3;

/**
 * The saturation rung a framework created here is stored at.
 *
 * See this file's header: a market claim nothing has measured is not a control.
 * `tests/framework-ui.test.tsx` parses a document carrying this value through
 * `frameworkContentSchema` itself, so a rename in the enum is a red test rather
 * than a refusal a creator would read as "that framework was not stored".
 */
export const NEW_FRAMEWORK_SATURATION = "observed";

/**
 * The source kind every evidence entry a creator writes is recorded under.
 *
 * `creator_submitted` is the only one of the three a creator can truthfully
 * claim — see the header. Pinned against `FRAMEWORK_SOURCE_KINDS` in the tests
 * for the same reason the saturation value is.
 */
export const CREATOR_EVIDENCE_KIND = "creator_submitted";

/**
 * The shape this form produces. It is `FrameworkContent`'s shape written out
 * structurally, because this file imports nothing (see the header) — and
 * `tests/framework-ui.test.tsx` parses a real instance of it through
 * `frameworkContentSchema` rather than trusting that the two agree.
 */
export type FrameworkFormContent = {
  name: string;
  beats: string[];
  whyItConverts: string;
  applicability: { goal: string; niche: string; note: string }[];
  sourceReferences: { kind: string; ref: string }[];
  evidenceEntries: { kind: string; ref: string; observation: string }[];
  testedCaveats: string[];
  saturation: string;
};

/** The minimal reader this parser needs — `FormData` satisfies it structurally. */
export type FieldReader = { get(name: string): unknown };

function text(form: FieldReader, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * One textarea, one entry per line.
 *
 * BLANK LINES ARE DROPPED AND NOTHING ELSE IS. A creator separating beats with
 * an empty line is formatting, not declaring an empty beat, and an empty string
 * in `beats` would be a beat that says nothing — which the mechanism-level scan
 * has no rule against and which no reader could act on. Each surviving line is
 * TRIMMED at its ends and otherwise stored exactly as typed: this is a
 * creator's own text in a table their export carries, and a parser that
 * rewrote it would be editing their words.
 */
export function linesOf(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The form → the content object. PURE, TOTAL, AND IT VALIDATES NOTHING.
 *
 * THAT LAST PART IS THE POINT, not a gap. `prepareContent` in
 * `packages/db/src/frameworks.ts` parses this with a `strictObject`, bounds
 * every field and runs the REQ-D04 mechanism-level scan — and it does it inside
 * the same call that writes the row, reading the parsed copy so no getter can
 * hand one value to the scan and another to the insert. A second validation
 * here would be a second answer that can disagree with the first, and the one
 * that a creator's data actually passes through is the one in the package.
 *
 * What this function owes is FAITHFULNESS: every field the creator filled in
 * arrives, nothing is invented, and the three server-decided values are the
 * ones this file's header justifies.
 */
export function frameworkContentFromForm(
  form: FieldReader
): FrameworkFormContent {
  const evidenceEntries: FrameworkFormContent["evidenceEntries"] = [];
  for (let i = 0; i < FRAMEWORK_EVIDENCE_SLOTS; i += 1) {
    const ref = text(form, `evidenceRef${i}`).trim();
    // A SLOT WITH NO REFERENCE IS AN EMPTY SLOT, not an entry with a blank ref.
    // `deriveFrameworkConfidence` counts entries, so a blank one would raise a
    // framework's confidence rung for a field the creator left alone — the
    // evidence ladder inflated by an empty textarea.
    if (ref.length === 0) continue;
    evidenceEntries.push({
      kind: CREATOR_EVIDENCE_KIND,
      ref,
      observation: text(form, `evidenceObservation${i}`).trim(),
    });
  }
  return {
    name: text(form, "name").trim(),
    beats: linesOf(text(form, "beats")),
    whyItConverts: text(form, "whyItConverts").trim(),
    // ONE APPLICABILITY ENTRY. `goal` and `niche` are closed vocabularies the
    // page renders from `FRAMEWORK_GOALS`/`FRAMEWORK_NICHES`, so this screen
    // holds no copy of either; the note is the creator's sentence about where
    // the mechanism applies, and the scan refuses a person or a metric in it
    // like anywhere else.
    applicability: [
      {
        goal: text(form, "goal"),
        niche: text(form, "niche"),
        note: text(form, "applicabilityNote").trim(),
      },
    ],
    // Deliberately empty — see the header. The evidence entries carry the refs.
    sourceReferences: [],
    evidenceEntries,
    testedCaveats: linesOf(text(form, "testedCaveats")),
    saturation: NEW_FRAMEWORK_SATURATION,
  };
}
