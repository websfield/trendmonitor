// Reading the confirm form, as a PURE function.
//
// A DIRECTIVE-FREE MODULE, and it is here rather than in `./actions.ts` for a
// rule this repo already wrote down once and I broke anyway: a `"use server"`
// file may export ONLY async functions. `./run-state.ts` in the onboarding
// folder carries the same note for the same reason.
//
// FOUND BY THE BROWSER WALK (2026-08-29), and it could not have been found any
// other way here: `readConfirmations` is synchronous and exported, TypeScript is
// perfectly happy, and the unit tests import it directly and pass. The rule is
// enforced by Next's compiler, so the only symptom is that `/brain` — the whole
// surface of this slice — returns a 500 on first load. A suite that never
// compiles the route cannot see it.
import type { ConfirmedFieldSubmission } from "./confirm-types";

/**
 * The submitted confirmation set, read from the form.
 *
 * TWO FIELDS PER POSITION AND BOTH ARE UNTRUSTED. `confirm:<pointer>` is the
 * tick; `shown:<pointer>` is the placeholder state the screen DISPLAYED. The
 * second exists so the server can refuse a disagreement rather than derive the
 * value and never notice one (R12) — `confirmBrainDocFields` compares it
 * against the stored content and throws when they differ.
 *
 * ONLY TICKED POSITIONS ARE SUBMITTED. An unticked checkbox is absent from a
 * form submission, so an untouched field simply does not appear in the set —
 * which is the honest encoding of "the creator has not decided this yet", and
 * is what leaves activation refusing until they do.
 */
export function readConfirmations(
  formData: FormData
): ConfirmedFieldSubmission[] {
  const out: ConfirmedFieldSubmission[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("confirm:")) continue;
    // The browser sends "on" for a ticked checkbox with no `value`. Anything
    // else is not a tick this screen produced, and is ignored rather than
    // interpreted — the same strictness `addOwnPostAction` applies to R8's
    // attestation, and for the same reason: a loose read turns an absence or a
    // stray value into a decision about a person.
    if (value !== "on") continue;
    const pointer = key.slice("confirm:".length);
    // `shown:` MUST be present and MUST be one of the two words this screen
    // renders. A missing or unrecognised value is dropped rather than defaulted
    // — defaulting it would invent the half of R12 that exists to be compared.
    const shown = formData.get(`shown:${pointer}`);
    if (shown !== "unknown" && shown !== "stated") continue;
    out.push({ pointer, asPlaceholder: shown === "unknown" });
  }
  return out;
}
