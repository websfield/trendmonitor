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
  EXCLUDED_FROM_HISTORY_SENTENCE,
  EXCLUDE_FROM_HISTORY_HELP,
  EXCLUDE_FROM_HISTORY_LABEL,
  FEEDBACK_HEADING,
  FEEDBACK_TODAY,
  REMEMBER_HEADING,
  REMEMBER_HELP,
  REMEMBER_LABEL,
  REMEMBER_OWNER_ONLY,
  feedbackNoteLimit,
  feedbackRecordedSentence,
  reactionLabel,
  rememberAlreadyHeldSentence,
  rememberLimitSentence,
  rememberProposedSentence,
} from "./run-copy";
import type { ExcludeState, FeedbackState, RememberState } from "./run-state";

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
  /**
   * "Leave this out of future drafts" (audit P6-A1, R-174), offered beside a
   * reaction once it is recorded. ABSENT when the run's mode reads no recent
   * work (the panel passes it only for a `takesCreativeForm` mode), and on a
   * fixture that renders none.
   */
  exclude?: {
    formAction: (formData: FormData) => void;
    pending: boolean;
    state: ExcludeState;
  };
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
  exclude,
}: FeedbackBlockProps) {
  // THE CONTROL TARGETS THE ROW JUST STORED, by the id the action returned —
  // never a reaction code, which a second press could make ambiguous.
  const recordedId =
    state.status === "recorded" && typeof state.feedbackId === "string"
      ? state.feedbackId
      : null;
  const excluded =
    exclude !== undefined &&
    exclude.state.status === "excluded" &&
    exclude.state.feedbackId === recordedId;
  return (
    <div
      className="panel"
      data-testid="studio-feedback"
      style={{ marginTop: "1rem" }}
    >
      <h3 style={{ marginTop: 0 }}>{FEEDBACK_HEADING}</h3>
      {/*
        THE SENTENCE THAT MAKES THIS HONEST (R12). It says feedback is recorded,
        that it does not change the brain, that since launch L3 (R-152) the
        next concept and script drafts are shown recent reactions as labelled
        history — as labels on recent drafts and, for a few, with their notes —
        and that a later slice may PROPOSE, never apply, a change to a document
        the creator reviews. It does not say the brain is learning, because the
        brain is not: `tests/support/forbidden-claims.ts` bans `learn`, `improv`
        and `train` on every creator-facing surface, and this is the screen
        where a reader would otherwise assume all three.
      */}
      <p className="muted" data-testid="studio-feedback-today">
        {FEEDBACK_TODAY}
      </p>
      {/*
        ONE PERSISTENT LIVE REGION FOR BOTH THE PENDING TEXT AND THE RESULT (L3
        gate, accessibility Low D-L1). A `role="status"` mounted together with
        its text may not be announced, so the recorded sentence is rendered
        INSIDE this region, which is in the DOM from the first render.
      */}
      <p
        role="status"
        aria-live="polite"
        data-testid="studio-feedback-status"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {pending ? (
          <span className="muted">Recording what you said…</span>
        ) : state.status === "recorded" ? (
          <span data-testid="studio-feedback-recorded">
            {feedbackRecordedSentence(state.reaction, state.noteKept)}
          </span>
        ) : null}
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
      {state.status === "refused" ? (
        <p role="alert" data-testid="studio-feedback-refused">
          <strong>{(refusalCopy[state.code] ?? fallbackCopy).title}</strong>{" "}
          {(refusalCopy[state.code] ?? fallbackCopy).detail}
        </p>
      ) : null}
      {/*
        AUDIT P6-A1 (R-174): "LEAVE THIS OUT OF FUTURE DRAFTS", beside the
        reaction it is about and only once that reaction is stored. Its own
        form, posting only the stored row's id; the server resolves it through
        the profile scope.
      */}
      {exclude !== undefined && recordedId !== null ? (
        <div data-testid="studio-feedback-exclude">
          <p className="muted" id="studio-feedback-exclude-help">
            {EXCLUDE_FROM_HISTORY_HELP}
          </p>
          <p
            role="status"
            aria-live="polite"
            data-testid="studio-feedback-exclude-status"
            style={{ minHeight: "1.2em", margin: 0 }}
          >
            {exclude.pending ? (
              <span className="muted">Leaving it out…</span>
            ) : excluded ? (
              <span data-testid="studio-feedback-excluded">{EXCLUDED_FROM_HISTORY_SENTENCE}</span>
            ) : null}
          </p>
          {excluded ? null : (
            <form action={exclude.formAction}>
              <input type="hidden" name="feedbackId" value={recordedId} />
              <SubmitButton
                className={buttonClass("quiet")}
                style={control}
                pendingLabel="Leaving it out…"
                ariaDescribedBy="studio-feedback-exclude-help"
              >
                {EXCLUDE_FROM_HISTORY_LABEL}
              </SubmitButton>
            </form>
          )}
          {exclude.state.status === "refused" ? (
            <p role="alert" data-testid="studio-feedback-exclude-refused">
              <strong>{(refusalCopy[exclude.state.code] ?? fallbackCopy).title}</strong>{" "}
              {(refusalCopy[exclude.state.code] ?? fallbackCopy).detail}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type RememberBlockProps = {
  /**
   * Whether this seat may propose a brain edit — the page's resolved role is
   * `owner` (R-118). Anyone else is shown why instead of a press the server
   * can only refuse (L3 gate, T-L3). The server's own owner gate is unchanged.
   */
  canPropose: boolean;
  /** The Brain page, where a proposed version is confirmed and activated. */
  brainHref: string;
  /** The per-field ceiling `editBrainDocument` enforces, from `@respin/db`. */
  valueMax: number;
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: RememberState;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
};

/**
 * The refusal codes that are ABOUT THE TYPED TEXT — blank or only `[check]`,
 * over the per-field limit, every field `[check]`, or an echo of reference
 * material. A LIST, not a predicate over the copy (CLAUDE.md Respin rule 7):
 * for these the alert is tied to the box (`aria-invalid` + `aria-describedby`);
 * every other remember refusal is about the role, the workspace or the
 * document rather than the words, and leaves the box valid. Adding a code here
 * is a deliberate edit, and `tests/studio-ui.test.tsx` checks every member is
 * in `STUDIO_ERROR_CODES` (`./copy.ts`), the set this screen can render.
 */
export const REMEMBER_TEXT_REFUSAL_CODES: readonly string[] = [
  "brain_edit_unchanged",
  "brain_edit_limit",
  "brain-edit-all-check",
  "reference_echo",
];

/**
 * "REMEMBER THIS FOR FUTURE DRAFTS" (launch L3, R-152) — PURE, for
 * `FeedbackBlock`'s reason: every state is a prop, so a test can drive it.
 *
 * A SEPARATE FORM FROM THE REACTION, deliberately: a reaction is local
 * evidence about one draft and never becomes a rule; this box is the creator
 * writing a rule, which becomes a PROPOSED brain edit they still have to
 * approve. Nothing here is pre-filled from the reaction or its note — the
 * words are the ones typed into this box (R11). The one pre-fill is the
 * creator's OWN text handed back by a refusal of this same box (L3 gate,
 * D-L3), so a refused press does not cost them what they wrote.
 */
export function RememberBlock({
  canPropose,
  brainHref,
  valueMax,
  formAction,
  pending,
  state,
  refusalCopy,
  fallbackCopy,
}: RememberBlockProps) {
  if (!canPropose) {
    return (
      <div className="panel" data-testid="studio-remember" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>{REMEMBER_HEADING}</h3>
        <p className="muted" data-testid="studio-remember-owner-only">
          {REMEMBER_OWNER_ONLY}
        </p>
      </div>
    );
  }
  const refused = state.status === "refused" ? state : null;
  const textInvalid =
    refused !== null && REMEMBER_TEXT_REFUSAL_CODES.includes(refused.code);
  return (
    <div className="panel" data-testid="studio-remember" style={{ marginTop: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>{REMEMBER_HEADING}</h3>
      <p className="muted" id="studio-remember-help" data-testid="studio-remember-help">
        {REMEMBER_HELP}{" "}
        <span data-testid="studio-remember-limit">{rememberLimitSentence(valueMax)}</span>
      </p>
      {/*
        ONE PERSISTENT LIVE REGION FOR THE PENDING TEXT AND THE RESULT (L3
        gate, D-L1): the result sentence renders INSIDE this region, which is
        in the DOM from the first render, rather than in a status region that
        mounts together with its text.
      */}
      <p
        role="status"
        aria-live="polite"
        data-testid="studio-remember-status"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {pending ? (
          <span className="muted">Saving your proposed rule…</span>
        ) : state.status === "proposed" ? (
          <span data-testid="studio-remember-proposed">
            {rememberProposedSentence(state.version)}{" "}
            <a href={brainHref}>Open the Brain page</a>
          </span>
        ) : state.status === "already_held" ? (
          <span data-testid="studio-remember-already">
            {rememberAlreadyHeldSentence(state.version, state.active)}{" "}
            <a href={brainHref}>Open the Brain page</a>
          </span>
        ) : null}
      </p>
      {/*
        KEYED ON THE REFUSAL COUNT (L3 gate, D-L3). React 19 resets an
        uncontrolled form after its action; a new key per refusal REMOUNTS the
        textarea with the refused text as its default value, so two refusals in
        a row still bring the words back.
      */}
      <form
        key={refused === null ? "remember" : `remember-refused-${refused.attempt}`}
        action={formAction}
      >
        <p>
          <label htmlFor="studio-remember-text">{REMEMBER_LABEL}</label>
          <br />
          <textarea
            id="studio-remember-text"
            name="preference"
            rows={2}
            required
            maxLength={valueMax}
            defaultValue={refused?.text ?? ""}
            aria-invalid={textInvalid ? true : undefined}
            aria-describedby={
              textInvalid
                ? "studio-remember-help studio-remember-refused"
                : "studio-remember-help"
            }
            style={{ width: "100%", fontSize: "1rem" }}
          />
        </p>
        <SubmitButton
          className={buttonClass("secondary")}
          style={control}
          pendingLabel="Saving…"
        >
          Propose this rule
        </SubmitButton>
      </form>
      {refused !== null ? (
        <p role="alert" id="studio-remember-refused" data-testid="studio-remember-refused">
          <strong>{(refusalCopy[refused.code] ?? fallbackCopy).title}</strong>{" "}
          {(refusalCopy[refused.code] ?? fallbackCopy).detail}
        </p>
      ) : null}
    </div>
  );
}
