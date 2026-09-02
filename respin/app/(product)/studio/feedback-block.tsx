// R10/R12's feedback control, as a PURE component.
//
// IT LIVES OUTSIDE THE CLIENT PANEL FOR THE RULE `./generation-outcome.tsx`
// already obeys, and the same measured reason `./lineage-view.tsx` records:
// `useActionState` yields only its INITIAL state under `renderToStaticMarkup`,
// so a recorded/refused state rendered inside `StudioPanel` is a state no test
// can drive — on the one control whose entire purpose is a promise about what
// the product does NOT do with what a creator says.
//
// `formAction` AND `pending` ARE PROPS rather than hooks, so this component is
// a function of its inputs and the wrapper owns the state. No directive of its
// own: it is imported by a `"use client"` module.
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import {
  FEEDBACK_HEADING,
  FEEDBACK_TODAY,
  feedbackNoteLimit,
  feedbackRecordedSentence,
  reactionLabel,
} from "./run-copy";
import type { FeedbackState } from "./run-state";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

export type FeedbackBlockProps = {
  /** The output this feedback is about — the composite FK's target. */
  generationId: string;
  /** The closed reaction vocabulary, from the database's own enum. */
  reactions: readonly string[];
  /** The note ceiling, from `@respin/db`. Never a number typed here. */
  noteMax: number;
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: FeedbackState;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
};

export function FeedbackBlock({
  generationId,
  reactions,
  noteMax,
  formAction,
  pending,
  state,
  refusalCopy,
  fallbackCopy,
}: FeedbackBlockProps) {
  return (
    <div
      className="panel"
      data-testid="studio-feedback"
      style={{ marginTop: "1rem" }}
    >
      <h3 style={{ marginTop: 0 }}>{FEEDBACK_HEADING}</h3>
      {/*
        THE SENTENCE THAT MAKES THIS HONEST (R12). It says feedback is recorded,
        that nothing reads it today, and that a later slice may PROPOSE — never
        apply — a change to a document the creator reviews. It does not say the
        brain is learning, because the brain is not: `tests/support/
        forbidden-claims.ts` bans `learn`, `improv` and `train` on every
        creator-facing surface, and this is the screen where a reader would
        otherwise assume all three.
      */}
      <p className="muted" data-testid="studio-feedback-today">
        {FEEDBACK_TODAY}
      </p>
      <p
        role="status"
        aria-live="polite"
        data-testid="studio-feedback-status"
        className="muted"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {pending ? "Recording what you said…" : ""}
      </p>
      <form action={formAction}>
        <input type="hidden" name="generationId" value={generationId} />
        <p>
          <label htmlFor="studio-feedback-note">Anything you want to add</label>
          <br />
          <textarea
            id="studio-feedback-note"
            name="note"
            rows={3}
            maxLength={noteMax}
            aria-describedby="studio-feedback-note-limit"
            style={{ width: "100%", fontSize: "1rem" }}
          />
          <br />
          <span
            className="muted"
            id="studio-feedback-note-limit"
            data-testid="studio-feedback-note-limit"
          >
            {feedbackNoteLimit(noteMax)}
          </span>
        </p>
        {/*
          A RADIO GROUP AND ONE SUBMIT, NOT A BUTTON PER REACTION, and the
          choice is about what is guaranteed rather than about looks. A
          button-per-reaction relies on the SUBMITTER's `name`/`value` reaching
          the action's `FormData`, which is a property of the installed React's
          form handling rather than of this code; a radio group is a plain form
          field. It also gives the group a `required`, so a press with nothing
          chosen is refused by the browser rather than by
          `FeedbackReactionError` — which would tell a creator that the reaction
          they did not pick is one this product does not have.

          THE CLOSED SET COMES FROM THE DATABASE'S OWN ENUM through the page, so
          this screen cannot offer a code the server would refuse. A free-text
          box in its place is what `brain-reason.ts` removed from a governed
          column one table over.
        */}
        <fieldset
          data-testid="studio-feedback-reactions"
          style={{ border: 0, padding: 0, margin: "0 0 0.75rem" }}
        >
          <legend className="muted">
            What happened with this draft? Pick the one that fits.
          </legend>
          {reactions.map((code) => (
            <label
              key={code}
              htmlFor={`studio-reaction-${code}`}
              style={{ display: "block", padding: "0.25rem 0" }}
            >
              <input
                type="radio"
                id={`studio-reaction-${code}`}
                name="reaction"
                value={code}
                required
              />{" "}
              {reactionLabel(code)}
            </label>
          ))}
        </fieldset>
        <SubmitButton
          className={buttonClass("secondary")}
          style={control}
          pendingLabel="Recording…"
        >
          Record what I said
        </SubmitButton>
      </form>
      {state.status === "recorded" ? (
        <p role="status" data-testid="studio-feedback-recorded">
          {feedbackRecordedSentence(state.reaction, state.noteKept)}
        </p>
      ) : null}
      {state.status === "refused" ? (
        <p role="alert" data-testid="studio-feedback-refused">
          <strong>{(refusalCopy[state.code] ?? fallbackCopy).title}</strong>{" "}
          {(refusalCopy[state.code] ?? fallbackCopy).detail}
        </p>
      ) : null}
    </div>
  );
}
