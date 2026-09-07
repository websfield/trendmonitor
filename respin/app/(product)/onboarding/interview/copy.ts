// The decisions the structured-interview screen makes, as PURE functions —
// same discipline as `../copy.ts`: every branch worth being right about lives
// here, where a unit test drives it with a fixture, rather than inline in the
// page or the view (round-2 CHANGE 6's rule, applied to a new screen).
//
// THIS FILE OWNS THE ANSWER-SHAPE <-> FORM-FIELD TRANSLATION. `interview-ops.ts`
// (Stage A) defines the wire shape — decided/not_decided, scalar or list — and
// leaves the UI's OWN representation to this stage (its own header says so).
// The choices made here, stated once rather than scattered across the two
// files that use them:
//
//   - ONE SUBMIT, EVERY FIELD. This screen renders all eleven questions on one
//     page, so every save re-states the CURRENT position of every field. That
//     removes the "was this field touched this round" question a partial PATCH
//     would otherwise leave the form to invent.
//   - A NON-BLANK TYPED VALUE ALWAYS WINS over a ticked "not decided" checkbox.
//     Ticking the box and then typing an answer is read as changing your mind,
//     not as a conflict — R2's field-level errors are reserved for a REAL
//     problem (too long, or a list with too many items), never for an
//     ambiguity this screen can resolve on its own.
//   - A BLANK, UNTICKED SCALAR FIELD IS OMITTED — never sent as `decided` with
//     a blank value (the schema forbids that anyway; `decidedText`'s
//     `nonBlank` refine) and never sent as `not_decided` either.
//   - A LIST FIELD HAS A THIRD CHECKBOX, because "decided, zero items" is a
//     real and meaningful answer for a list (R1) — "no banned words" is not
//     the same claim as "I haven't decided my banned words yet" — and
//     `interview-ops.ts`'s `decidedList` schema explicitly allows
//     `values: []` (its own comment: "decided-with-zero-or-more-items"). A
//     blank textarea with NEITHER box ticked is still omitted (unanswered);
//     precedence when a form could satisfy more than one branch: typed items
//     always win (matches the scalar fields' rule above), then the explicit
//     "none" box, then "not decided" — so ticking both by mistake resolves to
//     the stronger claim (a decided empty list) rather than silently losing
//     the creator's more specific answer.
import {
  INTERVIEW_ANSWER_MAX,
  INTERVIEW_FIELDS,
  METRIC_DIRECTION_LABELS,
  type InterviewAnswers,
  type InterviewFieldKey,
  type OnboardingInterviewDraft,
  type TextAnswer,
} from "@respin/db";
import {
  billingErrorFromCode,
  type BillingErrorCode,
  type BillingErrorCopy,
} from "../../billing-errors";

/** One line of human copy per field — every rendered state uses this. */
export const INTERVIEW_FIELD_LABELS: Record<InterviewFieldKey, string> = {
  audience: "Audience",
  positioning: "Positioning",
  goals: "Goals",
  ambitions: "Ambitions",
  metricLabel: "North-star metric: name",
  metricUnit: "North-star metric: unit",
  metricDirection: "North-star metric: direction",
  metricPlatform: "North-star metric: platform (optional)",
  metricWindow: "North-star metric: measurement window (optional)",
  bannedWords: "Banned words",
  bannedVibes: "Banned vibes",
};

/** Which HTML control renders each field — a scalar line, a scalar block, an enum, or a list. */
export type FieldWidget = "input" | "textarea" | "select" | "list";

// RE-EXPORTED, NEVER REDECLARED (slice 5 stage 2, G0). `METRIC_DIRECTIONS` is
// a closed vocabulary `brain-content.ts` owns, and the two READABLE labels for
// it were held here AND in `packages/db/src/export.ts`, which renders the same
// two values into the downloaded file. Two copies of one label set is how the
// review screen and the export come to call the same stored enum by different
// names; the value lives with the vocabulary now and this screen re-exports it.
// `tests/shared-copy-identity.test.ts` proves the re-export is still one.
export { METRIC_DIRECTION_LABELS };

export const INTERVIEW_FIELD_WIDGETS: Record<InterviewFieldKey, FieldWidget> = {
  audience: "textarea",
  positioning: "textarea",
  goals: "list",
  ambitions: "list",
  metricLabel: "input",
  metricUnit: "input",
  metricDirection: "select",
  metricPlatform: "input",
  metricWindow: "input",
  bannedWords: "list",
  bannedVibes: "list",
};

/**
 * Mirrors `interview-ops.ts`'s inline `decidedList` ceiling (`.max(50)`) —
 * not exported (Stage A's own file, off limits to this stage beyond its
 * app-server.ts bind), so restated here WITH THIS CITATION rather than
 * invented. If that ceiling ever moves, this constant silently drifts from
 * it; `saveInterviewDraft`'s own `InterviewAnswerError` is the backstop —
 * see `interviewErrorFor`'s fallback below — so a drift degrades to generic
 * (rather than field-named) copy, never to a silent acceptance.
 */
export const INTERVIEW_LIST_ITEMS_MAX = 50;

export const notDecidedFieldName = (key: InterviewFieldKey): string =>
  `${key}_notdecided`;

/** The "I've decided there are none" checkbox — list fields only (see this file's header). */
export const explicitlyEmptyFieldName = (key: InterviewFieldKey): string =>
  `${key}_none`;

/** One item per line — the list widget's on-the-wire shape. */
export function parseListLines(raw: string): string[] {
  return raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function serializeListLines(values: readonly string[]): string {
  return values.join("\n");
}

/**
 * One field's resolved position, for rendering — the pre-fill on the edit
 * screen and every row on the review screen.
 */
export type FieldState =
  | { status: "unanswered" }
  | { status: "not_decided" }
  | { status: "decided_text"; value: string }
  | { status: "decided_list"; values: string[] };

/**
 * Read one field's current position out of a (possibly absent) draft.
 *
 * `draft.answers` IS CAST, NOT RE-VALIDATED: `saveInterviewDraft` runs every
 * patch through `interview-ops.ts`'s own zod schema before it is ever stored
 * (that file's own header: "this table stores whatever passed that funnel"),
 * so a row read back here has already been proven to match `InterviewAnswers`.
 * Re-validating would need that same schema, which stays package-internal.
 */
export function fieldState(
  draft: OnboardingInterviewDraft | null,
  key: InterviewFieldKey
): FieldState {
  const answers = (draft?.answers ?? {}) as InterviewAnswers;
  const answer = answers[key];
  if (!answer) return { status: "unanswered" };
  if (answer.status === "not_decided") return { status: "not_decided" };
  if ("values" in answer) {
    return { status: "decided_list", values: [...answer.values] };
  }
  return {
    status: "decided_text",
    value: (answer as Extract<TextAnswer, { status: "decided" }>).value,
  };
}

/**
 * The read-only line the review screen renders for one field (R2).
 *
 * `metricDirection` renders through `METRIC_DIRECTION_LABELS` rather than the
 * raw enum value — `"higher_is_better"` is a wire value, not a sentence.
 *
 * NAMES NO SOURCE OTHER THAN THE CREATOR (R10): every branch says exactly
 * what was typed, or that nothing was typed yet, or that the field was
 * explicitly declined — never "learned", "verified" or "measured".
 */
export function reviewText(key: InterviewFieldKey, state: FieldState): string {
  switch (state.status) {
    case "unanswered":
      return "Not answered yet.";
    case "not_decided":
      return "Marked as not decided yet.";
    case "decided_text":
      return key === "metricDirection"
        ? (METRIC_DIRECTION_LABELS[state.value] ?? state.value)
        : state.value;
    case "decided_list":
      return state.values.length > 0 ? state.values.join(", ") : "None listed.";
  }
}

export type InterviewPatchResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; field: InterviewFieldKey };

/**
 * Build a full-interview patch from the edit form's `FormData` (R1/R2).
 *
 * Field-level validation lives HERE, before `saveInterviewDraft` is ever
 * called, so a length or list-size problem can be reported by FIELD NAME
 * (R2) — the package's own `InterviewAnswerError` carries only a message,
 * never a structured field, and this repo's `?e=` channel is a CODE, never a
 * message (`billing-errors.ts`'s own header). Reporting the field requires
 * catching the problem before the throw, not after it.
 */
export function buildInterviewPatch(formData: FormData): InterviewPatchResult {
  const patch: Record<string, unknown> = {};
  for (const field of INTERVIEW_FIELDS) {
    const notDecided = formData.get(notDecidedFieldName(field.key)) === "on";
    if (field.kind === "list") {
      const raw = String(formData.get(field.key) ?? "");
      const values = parseListLines(raw);
      const explicitlyEmpty =
        formData.get(explicitlyEmptyFieldName(field.key)) === "on";
      if (values.length > INTERVIEW_LIST_ITEMS_MAX) {
        return { ok: false, field: field.key };
      }
      if (values.some((v) => [...v].length > INTERVIEW_ANSWER_MAX)) {
        return { ok: false, field: field.key };
      }
      if (values.length > 0) {
        patch[field.key] = { status: "decided", values };
      } else if (explicitlyEmpty) {
        patch[field.key] = { status: "decided", values: [] };
      } else if (notDecided) {
        patch[field.key] = { status: "not_decided" };
      }
      // Blank AND both boxes unticked: omitted — see this file's header.
    } else if (field.key === "metricDirection") {
      const raw = String(formData.get(field.key) ?? "").trim();
      if (raw !== "") {
        patch[field.key] = { status: "decided", value: raw };
      } else if (notDecided) {
        patch[field.key] = { status: "not_decided" };
      }
    } else {
      const raw = String(formData.get(field.key) ?? "").trim();
      if (raw !== "") {
        if ([...raw].length > INTERVIEW_ANSWER_MAX) {
          return { ok: false, field: field.key };
        }
        patch[field.key] = { status: "decided", value: raw };
      } else if (notDecided) {
        patch[field.key] = { status: "not_decided" };
      }
    }
  }
  return { ok: true, patch };
}

/**
 * Copy for a `?e=`/`&field=` pair this screen's own actions produced.
 *
 * NOT A CLOSED ALLOWLIST like `../copy.ts`'s `ONBOARDING_ERROR_CODES` —
 * deliberately, and the difference is not an oversight. That list exists
 * because its screen's fallback for an unrecognised code is `null` (no alert
 * at all), so a narrow list can silently swallow a real refusal — the exact
 * defect CLAUDE.md's 2026-08-29 lesson names. This screen's fallback is
 * `billingErrorFromCode`, which is ALREADY safe for the whole `BillingErrorCode`
 * union (it degrades an unrecognised string to `unknown`'s neutral copy, never
 * to nothing) — so narrowing further here would only add a NEW way to lose an
 * alert, not remove one. The one thing this screen adds beyond the shared
 * fallback is naming the FIELD for its own `interview_answer` refusals (R2).
 */
export function interviewErrorFor(
  code: string | undefined,
  field: string | undefined
): (BillingErrorCopy & { code: BillingErrorCode }) | null {
  if (code === "interview_answer" && field) {
    const label = INTERVIEW_FIELD_LABELS[field as InterviewFieldKey];
    if (label) {
      return {
        code: "interview_answer",
        title: `"${label}" could not be saved`,
        detail: `That answer is too long, or its list has more than ${INTERVIEW_LIST_ITEMS_MAX} items. Nothing else on the draft was lost. Shorten "${label}" and save again.`,
      };
    }
  }
  return billingErrorFromCode(code);
}
