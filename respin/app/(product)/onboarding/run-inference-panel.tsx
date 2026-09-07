"use client";

// The voice-inference control: the first place a creator's OWN WORDS are sent
// to a model provider, and the first place the product forms a belief about a
// person.
//
// IT REPLACED SLICE 2a's CONNECTIVITY PING IN PLACE (owner decision,
// 2026-08-29), rather than being written beside it. Everything below about the
// live regions, the pending label and the double-submit window was established
// by four gate rounds and a browser walk on that control; the properties are
// identical here because the shape is identical — one press, one vendor call,
// one debit — so the file was repointed rather than duplicated.
//
// R18 IS THE WHOLE POINT OF THIS FILE: the button says what it will spend
// BEFORE it spends it, and the refusal names an action the reader can take.
// The sentences are not written here — they come from `./copy.ts` as pure
// functions a test drives, because a sentence about money assembled inline in
// a component is a sentence nothing asserts.
//
// `useActionState` rather than a redirect, for the reason `./run-state.ts`
// gives: the charge and the resulting balance exist exactly once, on the value
// the operation returned, and neither a URL nor a re-read can carry them
// honestly.
//
// PENDING-DISABLED, and here it is not a courtesy. `SubmitButton` exists
// because a double click on a slow connection writes two immutable rows; on
// THIS control a double click is two attempt ids, two model calls and two
// debits. It narrows the window and does not close it — two tabs still submit
// twice, and each attempt is billed exactly once by
// `credit_ledger_inference_debit_uq` rather than not at all.
import { useActionState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "./submit-button";
import { RunOutcome } from "./run-outcome";
import { IDLE_VOICE_STATE, type VoiceInferenceState } from "./run-state";

/**
 * The refusal copy for every code this action can return, resolved SERVER-side
 * and handed over as plain data.
 *
 * It is a record and not a function on purpose. A function cannot cross the
 * server/client boundary unless it is a server action, and the obvious
 * alternative — importing `onboardingErrorFor` here — would pull
 * `../billing-errors` into the client bundle, and that module imports
 * `@respin/credits/app-server` for its `instanceof` table. So the server
 * resolves the words and this component renders them.
 */
export type RefusalCopyByCode = Readonly<
  Record<string, { title: string; detail: string }>
>;

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

export type RunInferencePanelProps = {
  /** The action, already bound to a profile id by the server component. */
  action: (
    prev: VoiceInferenceState,
    formData: FormData
  ) => Promise<VoiceInferenceState>;
  /** What it will spend, in words — computed server-side from config. */
  costSentence: string;
  /** Why the control is unavailable, if it is. Role, or an open pause. */
  block: { reason: string } | null;
  /** Refusal copy for every code this action can return, keyed by code. */
  refusalCopy: RefusalCopyByCode;
  /** The words for a code that is not in the record. Never invented here. */
  fallbackCopy: { title: string; detail: string };
};

export function RunInferencePanel({
  action,
  costSentence,
  block,
  refusalCopy,
  fallbackCopy,
}: RunInferencePanelProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    IDLE_VOICE_STATE
  );

  return (
    <div data-testid="run-panel">
      <p className="muted" data-testid="run-cost">
        {costSentence}
      </p>

      {/*
        THE LIVE REGION IS ALWAYS PRESENT AND STARTS EMPTY, which is the half
        the first fix got wrong. `RunOutcome` returns `null` while a run is in
        flight, so putting `role="status"` on the OUTCOME meant there was no
        live region in the DOM at all between the press and the result — a
        screen-reader user pressed the money control and heard silence for the
        whole call. And a live region that MOUNTS already populated is the less
        reliable half of the pattern: JAWS and VoiceOver announce it
        inconsistently, which this repo already knows (`focus-on-mount.tsx`).
        A region that is present at load and then CHANGES is the reliable one.

        It carries the flight, and the outcome's own region carries the detail —
        so a reader hears that something started, then what it cost.
      */}
      <p
        role="status"
        aria-live="polite"
        data-testid="run-status"
        className="muted"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {isPending ? "Working on your run…" : ""}
      </p>

      {block ? (
        <p className="muted" data-testid="run-blocked">
          {block.reason}
        </p>
      ) : (
        <form action={formAction}>
          {/*
            THE PENDING LABEL IS NOT "Saving…", and it is not "Running the
            model…" either — the second draft was also false.

            "Saving…" was wrong because this control does not save the creator's
            data: it calls a model provider and spends whatever this run is
            priced at (the sentence above the button states both prices — the
            first run for a creator and every run after it — and neither is
            assumed here). But "Running the model…" asserts a vendor call that SIX
            refusal paths never make — role, archived profile, pause, config,
            price and the run slot all refuse strictly before `provider.complete`
            (compliance gate, 2026-08-28). A label on a money control that
            claims a call we may not have made is the same class of defect as
            the copy this slice already fixed four times.

            "Working on your run…" is true on every path, and the outcome that
            follows says which one happened.
          */}
          <SubmitButton
            className={buttonClass("primary")}
            style={control}
            pendingLabel="Working on your run…"
          >
            {/*
              THE LABEL NAMES WHAT IT PRODUCES, not what it costs and not what
              it calls. "Build my voice brain" is what the creator gets; the
              price is stated above by `costSentence` (R18) and the vendor is
              an implementation detail they did not ask about.

              It does NOT say "analyse my writing" or "learn my voice". Nothing
              here learns — R-8 — and what comes back is a draft the creator
              confirms field by field before anything acts on it.
            */}
            Build my voice brain
          </SubmitButton>
        </form>
      )}

      <RunOutcome
        state={state}
        refusalCopy={refusalCopy}
        fallbackCopy={fallbackCopy}
      />
    </div>
  );
}
