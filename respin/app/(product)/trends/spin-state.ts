// The state returned by the Trends Spin server action.  This directive-free
// contract carries only a rendered candidate or settled spend facts; it never
// carries a transcript, a reference body, pricing input, or a workspace id.
//
// A REFUSAL CARRIES ITS WHY AND A WAY FORWARD, NEVER THE CANDIDATE (compliance
// gate round 1, 2026-09-03): `withheld` names the hard rules that fired and
// their static remedies plus the sharper angle, and nothing else — a finding's
// `excerpt` is candidate text and stays on the server.
import type { PresentedDisclosure } from "@respin/credits/app-server";
import type { BillingErrorCode, BillingErrorCopy } from "../billing-errors";
import type { KillTestSummary } from "../studio/run-state";

/**
 * One fired hard rule: its id, the static remedy copy, and WHERE it fired —
 * redacted to the shape and the section. Never an excerpt.
 */
export type SpinWithheldReason = Readonly<{
  rule: string;
  remedy: string;
  /**
   * THE REDACTED LOCATORS FOR THIS RULE — "a date in a hook", "a name in the
   * caption" — one per distinct place it fired, in the order the pipeline
   * reported them, and `[]` when nothing here can name one.
   *
   * WHY THE SCREEN NEEDS THEM (compliance gate round 2, CHANGE 4). This refusal
   * withholds the draft, so the creator reads "invented specific: this specific
   * is in neither your brain nor what you gave this generation" about a token
   * they cannot see, in an output they cannot see. That was tolerable while the
   * refusal population was rare shapes; a common one (a month-year date) makes
   * it the ordinary case, and a sentence a creator cannot act on is not a
   * sentence.
   *
   * WHAT THEY ARE BUILT FROM, and what they are not: the finding's `shape`
   * (which family of specific matched) and the SECTION of its `field` pointer.
   * The token, the excerpt, the surrounding unit and the position in the
   * section all stay on the server, so a locator says what KIND of thing fired
   * WHERE, and quotes nothing. `spinWithheldLocator` is the only place they are
   * built and `tests/trends-ui.test.tsx` derives both populations from
   * `@respin/modes`, so a new shape or section is a red test, not a silent gap.
   */
  locators: readonly string[];
}>;

/**
 * The families of specific a hard rule can name, as a creator reads them.
 *
 * KEYED ON `SPECIFIC_SHAPES[].id` in `@respin/modes` — which this file cannot
 * import (R-64 denies `@respin/modes` to `app/**`), so the population is
 * DERIVED IN THE TEST from the module itself rather than agreed with it. A
 * shape with no entry here contributes no noun and the locator falls back to
 * the section alone, which is honest but blunter.
 */
const SPECIFIC_NOUNS: Readonly<Record<string, string>> = {
  "iso-date": "a date",
  "month-date": "a date",
  currency: "an amount",
  percent: "a percentage",
  multiplier: "a multiplier",
  "plain-number": "a number",
  "proper-noun": "a name",
};

/**
 * Where in the draft, as a creator reads it — keyed on the FIRST SEGMENT of the
 * finding's RFC-6901 field pointer (`/hooks/0/text` -> `hooks`).
 *
 * The index is deliberately dropped: the draft is withheld, so "the third hook"
 * points at nothing the creator can look at, while "a hook" tells them which
 * part of the next spin to watch.
 */
const DRAFT_SECTIONS: Readonly<Record<string, string>> = {
  thesis: "in the thesis",
  framework: "in the framework",
  hooks: "in a hook",
  ideas: "in an idea",
  beats: "in a beat",
  shotMap: "in the shot map",
  onScreenText: "in the on-screen text",
  caption: "in the caption",
  whyThisPerforms: "in why this performs",
  disclosure: "in the disclosure guidance",
};

/**
 * The redacted locator for one finding, or `null` when neither its shape nor
 * its field is one this screen can name.
 *
 * NEITHER INPUT IS CREATOR OR CANDIDATE TEXT: `shape` is a rule-family id and
 * `field` is a pointer into the output document's structure. The excerpt is not
 * a parameter, so this function cannot leak it.
 */
export function spinWithheldLocator(shape: string, field: string): string | null {
  const noun = SPECIFIC_NOUNS[shape] ?? null;
  const where = DRAFT_SECTIONS[field.replace(/^\//, "").split("/")[0] ?? ""] ?? null;
  if (noun !== null && where !== null) return `${noun} ${where}`;
  return where ?? noun;
}

/**
 * THE PRESENTED FIELDS A SPIN RESULT DOES NOT PUT IN ITS DRAFT BLOCK — this
 * surface's one exclusion list (audit Phase 2, P2-R6), each with its reason.
 * Everything else the facade's `presentedTextUnits` yields is rendered, so a
 * new field in the output schema is displayed by default rather than silently
 * dropped.
 *
 * ONE REFUSAL-SCOPE AUTHORITY (audit Phase 2 gate, R-172). This list hid
 * `/whyThisPerforms/reasoning` while the claims scope treated it as
 * presented, so a Spin could be refused — and charged — over a sentence the
 * Spin screen never showed. The rationale is now rendered like every other
 * presented field (it is the most-checked text in a draft: every hard shape
 * refuses there), and the only member left is rendered elsewhere on the same
 * screen. `tests/trends-actions.test.ts` asserts the screen's rendered set
 * equals the presented scope.
 */
export const SPIN_RESULT_EXCLUDED_FIELDS: Readonly<Record<string, string>> = {
  "/whyThisPerforms/weakestPoint":
    "rendered on its own, under its own heading (REQ-I04), so it is not repeated inside the draft",
};

export type SpinActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "result";
      spinResult: string;
      /** REQ-I04: every output names its weakest point. */
      weakestPoint: string;
      /**
       * REQ-I05: the disclosure, as a KIND (R-121, audit P1-R1). The screen
       * renders the product's sentence for it (`DISCLOSURE_LINE`); the type has
       * no text member, so the model's disclosure prose cannot ride here.
       */
      disclosure: PresentedDisclosure;
      /**
       * What the checks found (R-172): the studio projection, so the Spin
       * screen renders the same flags, offers and limit note `/studio` does.
       */
      killTest: KillTestSummary;
      chargedCredits: number;
    }>
  | Readonly<{ status: "near_copy_refused"; chargedCredits: number }>
  | Readonly<{
      status: "withheld";
      chargedCredits: number;
      /** R-173: an honest refusal caused only by the claim scan, charged nothing. */
      freeClaimRefusal: boolean;
      why: readonly SpinWithheldReason[];
      sharperAngle: string | null;
    }>
  | Readonly<{ status: "replayed"; balanceAfter: number }>
  /**
   * A HELD Spin this press finished (audit P3-A2): the model had already
   * written it, no model was called by this press, and the charge WAS taken
   * by it. The draft is not re-shown here — this screen renders only a draft
   * the press itself produced and checked.
   */
  | Readonly<{ status: "settled_held"; chargedCredits: number; balanceAfter: number; freeClaimRefusal: boolean }>
  /**
   * The refusal's code and its words, resolved on the server
   * (`BILLING_ERROR_COPY[code]`) because this panel is a client component and
   * cannot import the error map. A HELD Spin (`generation_held_*`) arrives
   * here: its words say the draft is stored and where to finish it.
   */
  | Readonly<{ status: "refused"; code: BillingErrorCode; copy: BillingErrorCopy }>;

export const IDLE_SPIN_STATE: SpinActionState = { status: "idle" };
