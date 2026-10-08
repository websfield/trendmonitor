// What the log control says AFTER a press, as a PURE component.
//
// IT LIVES OUTSIDE THE CLIENT PANEL FOR THE RULE `../studio/feedback-block.tsx`
// already obeys, and the same measured reason: `useActionState` yields only its
// INITIAL state under `renderToStaticMarkup`, so a recorded or refused state
// rendered inside `LogPanel` is a state no test can drive — on the two
// sentences that carry R6 (what label the row really got) and the whole
// refusal channel (which the registered `8c-R15` finding is about).
//
// No directive of its own: it is imported by a `"use client"` module and by a
// test, and it imports only `./copy`, which imports nothing.
import { evidenceStateCopy } from "./copy";
import type { LogResultState } from "./log-state";

export function LogOutcome({ state }: { state: LogResultState }) {
  if (state.status === "recorded") {
    return (
      <p role="status" data-testid="results-log-recorded">
        {/* R6's SENTENCE, AND IT DESCRIBES THE ROW. `evidenceState` was read
            back off the write, so this says what the stored label IS rather
            than what the form asked for — the two cannot drift, because the
            form never sent one. */}
        Stored, labelled{" "}
        <strong>{evidenceStateCopy(state.evidenceState).label}</strong>.{" "}
        {/* R-115 (audit Phase 2, P2-A1): every result this form can write is
            self reported or has no numbers, and neither is ever counted. The
            two sentences used to say it "can join a treatment group" and
            "counts towards your own baseline". */}
        {state.joinsTreatmentGroup
          ? "It names one of your drafts, so it is filed with that draft. It is stored and shown, and it is not counted into a comparison: only a verified analytics connector could supply a counted result."
          : "It names no draft of yours, so it never joins a treatment group. It is stored and shown, and it is not counted into a baseline: only a verified analytics connector could supply a counted result."}{" "}
        {/* THE REMEDY THIS USED TO PRINT WAS "log the same output over a
            different observation window", which invites a creator whose
            numbers were wrong to write a window they did not observe into an
            append-only table with no delete path — where the window is a
            comparability predicate. That is the falsified-baseline class
            migration 0032 exists to close, printed as advice. The sibling
            copy in `billing-errors.ts` gives the same suggestion CONDITIONED
            on it being a real second observation; unconditioned, it is a
            recipe. So this states the constraint and offers nothing. */}
        Results are kept exactly as logged: this one cannot be edited or
        removed. A later observation of the same post over a genuinely
        different period is a second result and can be logged as one.
      </p>
    );
  }
  if (state.status === "refused") {
    return (
      <p role="alert" data-testid="results-log-refused">
        <strong>{state.copy.title}</strong> {state.copy.detail}
      </p>
    );
  }
  return null;
}
