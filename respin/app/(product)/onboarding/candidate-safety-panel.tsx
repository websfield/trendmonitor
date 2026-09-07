"use client";

import { useActionState } from "react";
import type { CandidateSafetyState } from "./candidate-safety-state";
import { INITIAL_CANDIDATE_SAFETY_STATE } from "./candidate-safety-state";
import { SubmitButton } from "./submit-button";

export type SafetyAction = (
  state: CandidateSafetyState,
  formData: FormData,
) => Promise<CandidateSafetyState>;

const controlStyle = { minHeight: 44, width: "100%" } as const;

export function CandidateSafetyPanel({ action }: { action: SafetyAction }) {
  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_CANDIDATE_SAFETY_STATE,
  );

  return (
    <section className="panel" aria-labelledby="candidate-safety-title">
      <p className="eyebrow">Candidate draft check</p>
      <h3 id="candidate-safety-title">Check against saved references</h3>
      <p className="muted">
        Paste a draft to check the current creator&apos;s saved reference
        posts before you use it.
      </p>
      <form action={formAction} className="stack">
        <label htmlFor="candidate-safety-text">Candidate draft</label>
        <textarea
          id="candidate-safety-text"
          name="candidate"
          required
          rows={7}
          style={controlStyle}
        />
        <SubmitButton
          className="btn btn-secondary"
          pendingLabel="Checking this draft…"
          style={{ minHeight: 44 }}
        >
          Check draft
        </SubmitButton>
      </form>
      <div aria-live="polite" aria-atomic="true">
        {isPending ? (
          <p className="muted">Checking this draft against current references…</p>
        ) : (
          <CandidateSafetyOutcome state={state} />
        )}
      </div>
    </section>
  );
}

export function CandidateSafetyOutcome({
  state,
}: {
  state: CandidateSafetyState;
}) {
  if (state.status === "idle") {
    return (
      <p className="muted">
        The check does not call a model, use credits, or save the draft.
      </p>
    );
  }
  if (state.status === "choose_profile") {
    return (
      <p role="alert">
        Choose a creator profile above, then run the check again.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert">
        The draft could not be checked. Nothing was saved. Try again.
      </p>
    );
  }
  if (state.status === "safe") {
    return (
      <p>
        No blocked overlap was found against the reference posts currently
        saved for this creator. This is not an originality or non-infringement
        guarantee. No model was called, no credits were used, and neither the
        draft nor this result was saved. The current reference corpus and
        citation budgets are checked again on an actual write.
      </p>
    );
  }
  if (state.reason === "reference_quote_budget") {
    return (
      <p role="alert">
        This draft exceeds the current reference quotation budget. Shorten or
        remove quoted reference language, then check the revised draft again.
        Nothing was saved, and the current corpus and budgets are checked again
        on an actual write.
      </p>
    );
  }
  return (
    <div role="alert">
      <p>
        Blocked overlap was found with reference{" "}
        <code>{state.referenceInputId}</code> in field{" "}
        <code>{state.field}</code>.
      </p>
      <p>
        Matched text: <q>{state.matchedSpan}</q>
        {state.matchedSpanTruncated ? " (excerpt shortened)" : ""}
      </p>
      <p>
        Rewrite or remove the matched language, then check the revised draft
        again. Nothing was saved, and the current corpus and budgets are
        checked again on an actual write.
      </p>
    </div>
  );
}
