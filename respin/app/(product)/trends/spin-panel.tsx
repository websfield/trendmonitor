"use client";

import { useActionState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import { DISCLOSURE_LINE, FREE_CLAIM_REFUSAL } from "../studio/run-copy";
import { KillTestBlock } from "../studio/generation-outcome";
import type { OriginalReferenceSummary } from "./trends-view";
import { IDLE_SPIN_STATE, type SpinActionState } from "./spin-state";

type SpinPanelProps = Readonly<{
  autopsyId: string;
  originalReference: OriginalReferenceSummary;
  action: (prev: SpinActionState, formData: FormData) => Promise<SpinActionState>;
}>;

export function SpinPanel({ autopsyId, originalReference, action }: SpinPanelProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_SPIN_STATE);
  return (
    <section aria-labelledby={`spin-${autopsyId}`}>
      <h3 id={`spin-${autopsyId}`}>Spin this reference</h3>
      <p className="muted">The reference stays in the server-side similarity check; write the angle you want to make your own.</p>
    <p role="status" aria-live="polite" className="muted" style={{ minHeight: "1.2em" }}>
        {pending ? "Preparing your spin…" : ""}
      </p>
      <form action={formAction}>
        <input type="hidden" name="autopsyId" value={autopsyId} />
        <p>
          <label htmlFor={`spin-input-${autopsyId}`}>Your angle</label>
          <br />
          <textarea id={`spin-input-${autopsyId}`} name="input" rows={4} style={{ width: "100%" }} />
        </p>
        <p>
          <label htmlFor={`spin-platform-${autopsyId}`}>Platform</label>
          <br />
          <select id={`spin-platform-${autopsyId}`} name="platform">
            <option value="Short-form video">Short-form video</option>
          </select>
        </p>
        <SubmitButton className={buttonClass("primary")} pendingLabel="Preparing your spin…">
          Spin this reference
        </SubmitButton>
      </form>
      <SpinOutcome state={state} originalReference={originalReference} />
    </section>
  );
}

/** A hard-rule id as a creator reads it: `invented_specific` -> `invented specific`. */
function ruleLabel(rule: string): string {
  return rule.replace(/_/g, " ");
}

export function SpinOutcome({ state, originalReference }: { state: SpinActionState; originalReference: OriginalReferenceSummary }) {
  if (state.status === "idle") return null;
  if (state.status === "near_copy_refused") {
    return <section className="banner" role="status" data-testid="spin-near-copy-refusal">
      <h4>Spin refused</h4>
      <p>The candidate is withheld because it was too close to the reference.</p>
      <p>One rewrite was attempted. Charge applied: <span className="mono">{state.chargedCredits}</span> credits.</p>
      <p>What to try: start from a different subject, write a fresh hook, and change a beat or turn.</p>
    </section>;
  }
  if (state.status === "withheld") {
    // The checks did their job; the copy says what fired, WHERE, and what is
    // true about the next press. It never quotes the withheld draft
    // (spin-state.ts): a `locator` is the finding's shape and section, built on
    // the server by `spinWithheldLocator`, and the excerpt is not a field this
    // state can carry. An EMPTY `why` is not a refusal (a refusal always names
    // at least one rule): it is a usable run whose output had nothing this
    // projection can display, and the copy must not claim a check failed when
    // none did.
    return <section className="banner" role="status" data-testid="spin-withheld">
      <h4>Spin withheld</h4>
      {state.why.length > 0 ? (
        <>
          {state.freeClaimRefusal && state.chargedCredits === 0 ? (
            <p data-testid="spin-withheld-charge">The candidate did not pass the required checks, so it is not shown. {FREE_CLAIM_REFUSAL}</p>
          ) : (
            <p data-testid="spin-withheld-charge">The candidate did not pass the required checks, so it is not shown. Charge applied: <span className="mono">{state.chargedCredits}</span> credits.</p>
          )}
          <h5>What fired</h5>
          <ul data-testid="spin-withheld-why">
            {state.why.map((reason) => (
              <li key={reason.rule}>
                <span className="label">{ruleLabel(reason.rule)}</span>: {reason.remedy}
                {reason.locators.length > 0 ? (
                  <>
                    {" "}
                    <span className="muted" data-testid={`spin-withheld-where-${reason.rule}`}>
                      Where: {reason.locators.join("; ")}.
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          {/*
            WHAT IS TRUE ABOUT THE NEXT MOVE, and nothing more (compliance gate
            round 2, CHANGE 4). The remedies above are written for a surface
            that shows the draft — "replace it", "mark it [check]" — and here
            the draft is withheld, so there is nothing on this screen to edit.
            The only control is the Spin form above, and pressing it starts a
            fresh run at a fresh attempt id, which is charged like any other.
            No retry, resume or "try again" is offered, because none exists.
          */}
          <p data-testid="spin-withheld-next">
            The draft itself is not shown, so there is nothing here to edit. The Spin form above starts a new run from what you give it, and a new run is charged like any other.
          </p>
        </>
      ) : (
        <p>The run settled, but the accepted draft carried nothing this screen can show. Charge applied: <span className="mono">{state.chargedCredits}</span> credits.</p>
      )}
      {state.sharperAngle ? (
        <>
          <h5>A sharper angle</h5>
          <p data-testid="spin-withheld-sharper-angle">{state.sharperAngle}</p>
        </>
      ) : null}
    </section>;
  }
  if (state.status === "replayed") {
    return <p className="muted">This request was already settled. No new charge was applied by this press.</p>;
  }
  if (state.status === "settled_held") {
    return <p className="muted" data-testid="spin-settled-held">
      This Spin was finished from the draft the model had already written and held for you; this press called no model.{" "}
      {state.freeClaimRefusal && state.chargedCredits === 0 ? (
        FREE_CLAIM_REFUSAL
      ) : (
        <>Charge applied: <span className="mono">{state.chargedCredits}</span> credits.</>
      )}{" "}
      Your balance is <span className="mono">{state.balanceAfter}</span> credits. The draft is stored with your saved drafts on Studio.
    </p>;
  }
  if (state.status === "refused") {
    return <section role="alert" data-testid="spin-refused">
      <p><strong>{state.copy.title}</strong></p>
      <p className="muted">{state.copy.detail}</p>
    </section>;
  }
  return <section data-testid="spin-result">
    <p className="muted">Charge applied: <span className="mono">{state.chargedCredits}</span> credits.</p>
    <div className="trends-side-by-side" style={{ display: "grid", gap: "var(--sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))" }}>
      <section aria-label="Original reference">
        <h4>Original reference</h4>
        <p>{originalReference.source}: {originalReference.title}</p>
        <p>{originalReference.mechanismSummary}</p>
      </section>
      <section aria-label="Your spin result">
        <h4>Your spin result</h4>
        <pre style={{ whiteSpace: "pre-wrap" }}>{state.spinResult}</pre>
      </section>
    </div>
    <section aria-labelledby="spin-weakest-point-heading" data-testid="spin-weakest-point">
      <h4 id="spin-weakest-point-heading">Weakest point</h4>
      <p>{state.weakestPoint}</p>
    </section>
    <section aria-labelledby="spin-disclosure-heading" data-testid="spin-disclosure">
      <h4 id="spin-disclosure-heading">Disclosure guidance</h4>
      {/* The product's sentence for the disclosure kind, never the model's
          prose (R-121, audit P1-R1). */}
      <p>{DISCLOSURE_LINE[state.disclosure.kind]}</p>
    </section>
    {/* PARITY WITH /studio, NOT A STATED OMISSION (audit Phase 2 gate, R-172).
        The same block `/studio`, first-ideas and the saved pack render:
        traceability flags, the marker offers beside them, claim flags and the
        limit note. A claim the analysis could not decide is flagged rather
        than refused, so it has to be visible here. The disclosure provenance
        sentence is not shown: this screen renders the product's disclosure
        line under its own heading above. */}
    <KillTestBlock summary={state.killTest} showDisclosureProvenance={false} />
  </section>;
}
