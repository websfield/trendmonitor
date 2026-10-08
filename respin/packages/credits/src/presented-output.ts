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
// What a screen SAYS for a kind is a product sentence keyed on the kind, so a
// new kind is a compile error rather than a blank: `PRESENTED_DISCLOSURE_
// GUIDANCE` below (launch L4), which the saved recording pack and its Markdown
// export both render. The live `/studio` result panel and `/trends` render the
// same wording from `DISCLOSURE_LINE` in `app/(product)/studio/run-copy.ts` —
// a second declaration only because that file is in the client graph and this
// one value-imports `@respin/modes`; `tests/disclosure-presenters.test.ts`
// holds the two equal key by key (audit P1-R1, 2026-10-05 amendment).
import { CHECK } from "@respin/llm";
import type { Filming, ScriptOutput, ScriptOutputV2 } from "@respin/modes";
import {
  NOT_PRESENTED_FIELD_PREFIXES,
  eventConfirmationFor,
  outputTextUnits,
  serverCheckedFields,
} from "@respin/modes";

/**
 * One filming resource or shot-map text as a surface may present it: the
 * model's text, with `[check]` appended where the server decided it is
 * unconfirmed and the model did not already write one.
 */
export type PresentedFilmingItem = Readonly<{ text: string; unconfirmed: boolean }>;

/**
 * THE ONE READING OF THE SERVER'S FILMING DECISIONS (R-148 point 3; R-150
 * point 2). The decision is `@respin/modes`' `stampServerChecks`, made once at
 * generation time and stored as the structural `serverChecks` field; the
 * model's text is never changed. A surface reads it here, so the Studio
 * presenter and the L4 saved recording pack cannot disagree about which
 * resources the creator has NOT said they have: both reach these through
 * `app/(product)/studio/projection.ts` (`projectDocument`, which
 * `savedPackFor` calls), and the pack's Markdown export reads that projection.
 *
 * FAIL-CLOSED: a v2 document with no `serverChecks` (only possible between the
 * reply parse and the stamp — never stored) presents every resource as
 * unconfirmed rather than as the creator's.
 */
function presentedItem(
  checked: ReadonlySet<string> | null,
  field: string,
  text: string
): PresentedFilmingItem {
  const unconfirmed = checked === null || checked.has(field) || text.includes(CHECK);
  return {
    text: unconfirmed && !text.includes(CHECK) ? `${text} ${CHECK}` : text,
    unconfirmed,
  };
}

/**
 * A v2 filming plan as a surface presents it. `at` is the plan's place in the
 * document: `""` for the script's own, `/ideas/N` for a concept's. `people`
 * and `minutes` are closed values and pass through as stored.
 */
export function presentedFilming(
  output: ScriptOutputV2,
  at: string
): Readonly<{
  location: PresentedFilmingItem;
  equipment: readonly PresentedFilmingItem[];
  people: Filming["people"];
  minutes: number;
}> {
  const match = /^\/ideas\/(\d+)$/.exec(at);
  const filming =
    at === "" ? output.filming : match ? output.ideas?.[Number(match[1])]?.filming : undefined;
  if (filming === undefined) {
    throw new Error(`no filming plan at '${at}'`);
  }
  const checked = serverCheckedFields(output);
  return {
    location: presentedItem(checked, `${at}/filming/location`, filming.location),
    equipment: filming.equipment.map((e, i) =>
      presentedItem(checked, `${at}/filming/equipment/${i}`, e)
    ),
    people: filming.people,
    minutes: filming.minutes,
  };
}

/**
 * A v2 shot map as a surface presents it: each line's shot and note, EACH
 * marked `[check]` where the server decided THAT field names kit the creator
 * did not list (round-3 compliance gate, Low). `undefined` when the document
 * has no shot map.
 */
export function presentedShotMap(output: ScriptOutputV2): readonly Readonly<{
  beatIndex: number;
  shot: string;
  note: string;
  unconfirmed: boolean;
}>[] | undefined {
  if (output.shotMap === undefined) return undefined;
  const checked = serverCheckedFields(output);
  return output.shotMap.map((s, i) => {
    const shot = presentedItem(checked, `/shotMap/${i}/shot`, s.shot);
    const note = presentedItem(checked, `/shotMap/${i}/note`, s.note);
    return {
      beatIndex: s.beatIndex,
      shot: shot.text,
      note: note.text,
      unconfirmed: shot.unconfirmed || note.unconfirmed,
    };
  });
}

/**
 * THE CONFIRMATION ITEM (R-150 point 3): `EVENT_CONFIRMATION_ITEM` for EVERY
 * version-2 output, whatever its form, basis or wording, and `null` for a
 * legacy one (`eventConfirmationFor` — no input a reply can author decides
 * it). Server-authored, never model text. Studio and the L4 saved recording
 * pack (page and Markdown export) read it through the same projection.
 */
export function presentedEventConfirmation(output: ScriptOutput): string | null {
  return eventConfirmationFor(output);
}

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
 * THE DETERMINISTIC DISCLOSURE GUIDANCE a recording pack carries (launch L4,
 * R-153), keyed on the kind so a new kind is a compile error rather than a
 * blank. Product words, never the model's: they name no platform rule, no
 * number and no outcome — they send the creator to the platform's own current
 * rules, which only the platform can state. Homed here rather than in
 * `run-copy.ts` because the saved page AND the exported Markdown read it, and
 * the export must not carry a second wording.
 */
export const PRESENTED_DISCLOSURE_GUIDANCE: Readonly<
  Record<PresentedDisclosure["kind"], string>
> = {
  policy_check_required:
    "Before you post, check the platform's current rules on disclosing AI assistance and any paid partnership, and use the platform's own label where one applies. This product does not decide what those rules require.",
};

/**
 * Every creator-facing text unit of an output, minus the model's disclosure.
 *
 * ONE FILTER, NOT TWO COPIES. `sample-spin/run.ts` carried this predicate and
 * the product surfaces carried none; a rule spelled once in one presenter is a
 * rule the next presenter does not have. The exclusion is `@respin/modes`'
 * `NOT_PRESENTED_FIELD_PREFIXES` — the SAME list the claims refusal scope reads
 * (audit Phase 2 gate: one refusal-scope authority). The weakest point is NOT dropped here
 * — the Sample Spin drops it because it travels on its own field in that
 * response shape, which is a property of that response and not of this rule.
 */
export function presentedTextUnits(
  output: ScriptOutput
): readonly Readonly<{ field: string; text: string }>[] {
  return outputTextUnits(output)
    .filter((unit) => !NOT_PRESENTED_FIELD_PREFIXES.some((prefix) => unit.field.startsWith(prefix)))
    .map((unit) => ({ field: unit.field, text: unit.text }));
}
