// THE ONE SUBSTITUTION FOR MODEL-AUTHORED DISCLOSURE PROSE (P1-R1, audit R3-1).
//
// THE DEFECT. `packages/modes` asks the model for a disclosure section, and
// `output.disclosure.guidance` is a `line()` — model-authored text. The Sample
// Spin's presenter already refused to show it (R-121: the neutral object is the
// only disclosure a visitor sees), but the two PRODUCT presenters rendered it
// straight through, so a creator on `/studio` or `/trends` read whatever the
// model wrote about disclosing AI assistance. That is a live breach of an
// owner-approved decision, on the surface creators actually use.
//
// WHY IT LIVES IN `packages/credits` AND NOT `packages/modes`. `app/**` may not
// import `@respin/modes` — `respin/eslint.config.mjs` records the denial as
// deliberate ("it stays denied … app/** reaches a generation through
// @respin/credits/app-server"), and this package's facade re-exports pipeline
// types for exactly that reason. So the substitution is homed beside the
// compliant presenter that already performs it, and both product surfaces reach
// it through the facade.
//
// KIND ONLY, AND NO PLATFORM. `PresentedDisclosure` carries one member. There is
// deliberately no string to render: a type with no text member is a control a
// destructure, a bracket read or a whole-object pass-through cannot get around,
// which is what makes this a closure rather than two edited call sites. The
// model's `output.disclosure.platform` is a `line()` too and R-121 makes the
// platform closed REQUEST data — if a later phase wants to label the line, the
// value is the request's own `platform`, never the model's.
//
// What a screen SAYS for a kind is a product sentence and lives with the other
// product copy (`app/(product)/studio/run-copy.ts`'s `DISCLOSURE_LINE`), keyed
// on the kind so a new kind is a compile error rather than a blank.
import type { ScriptOutput } from "@respin/modes";
import { outputTextUnits } from "@respin/modes";

/**
 * The disclosure a surface may present: a KIND, never prose.
 *
 * The same shape the Sample Spin template has always returned, so its fixtures
 * are the witness that this type did not move.
 */
export type PresentedDisclosure = Readonly<{ kind: "policy_check_required" }>;

/**
 * The disclosure any surface may present for a generation.
 *
 * Deterministic and neutral, and it reads nothing off `output.disclosure`: the
 * model's own disclosure section is not an input to what a creator is shown.
 */
export function presentedDisclosure(): PresentedDisclosure {
  return { kind: "policy_check_required" };
}

/**
 * Every creator-facing text unit of an output, minus the model's disclosure.
 *
 * ONE FILTER, NOT TWO COPIES. `sample-spin/run.ts` carried this predicate and
 * the product surfaces carried none; a rule spelled once in one presenter is a
 * rule the next presenter does not have. The weakest point is NOT dropped here
 * — the Sample Spin drops it because it travels on its own field in that
 * response shape, which is a property of that response and not of this rule.
 */
export function presentedTextUnits(
  output: ScriptOutput
): readonly Readonly<{ field: string; text: string }>[] {
  return outputTextUnits(output)
    .filter((unit) => !unit.field.startsWith("/disclosure/"))
    .map((unit) => ({ field: unit.field, text: unit.text }));
}
