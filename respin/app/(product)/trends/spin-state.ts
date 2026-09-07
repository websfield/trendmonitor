// The state returned by the Trends Spin server action.  This directive-free
// contract carries only a rendered candidate or settled spend facts; it never
// carries a transcript, a reference body, pricing input, or a workspace id.
//
// A REFUSAL CARRIES ITS WHY AND A WAY FORWARD, NEVER THE CANDIDATE (compliance
// gate round 1, 2026-09-03): `withheld` names the hard rules that fired and
// their static remedies plus the sharper angle, and nothing else — a finding's
// `excerpt` is candidate text and stays on the server.
import type { BillingErrorCode } from "../billing-errors";

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

export type SpinActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "result";
      spinResult: string;
      /** REQ-I04: every output names its weakest point. */
      weakestPoint: string;
      /** REQ-I05: platform-specific AI-assistance disclosure guidance. */
      disclosureGuidance: string;
      chargedCredits: number;
    }>
  | Readonly<{ status: "near_copy_refused"; chargedCredits: number }>
  | Readonly<{
      status: "withheld";
      chargedCredits: number;
      why: readonly SpinWithheldReason[];
      sharperAngle: string | null;
    }>
  | Readonly<{ status: "replayed"; balanceAfter: number }>
  | Readonly<{ status: "refused"; code: BillingErrorCode }>;

export const IDLE_SPIN_STATE: SpinActionState = { status: "idle" };
