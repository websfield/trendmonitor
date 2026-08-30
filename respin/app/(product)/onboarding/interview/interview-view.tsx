// PURE presentation for /onboarding/interview (slice 3b, Stage B1) — same
// split as `../onboarding-view.tsx`: the page does the gate, the scoping and
// the reads; this file renders exactly what it is handed, so every state —
// empty draft, resumed draft, a field-named refusal, viewer-blocked, review,
// submitted — is reachable from a test with a fixture rather than a database.
//
// R10, AND IT IS THE POINT OF THIS SCREEN. Every answer rendered here is a
// creator-AUTHORED declaration — their own stated goals, positioning, metric,
// bans, ambitions — never a model's output. No sentence on this screen may
// say one was "learned", "verified" or "measured": those are words for a
// DIFFERENT kind of claim (an inference, or a posted result this product has
// not built yet), and using them here would misrepresent this creator's own
// words as something the product concluded.
import type { ReactNode } from "react";
import { Banner } from "../../../ui/banner";
import { buttonClass } from "../../../ui/button";
import { FocusOnMount } from "../focus-on-mount";
import { SubmitButton } from "../submit-button";
import type { FormAction } from "../onboarding-view";
import {
  explicitlyEmptyFieldName,
  INTERVIEW_FIELD_LABELS,
  INTERVIEW_FIELD_WIDGETS,
  METRIC_DIRECTION_LABELS,
  notDecidedFieldName,
  reviewText,
  serializeListLines,
  type FieldState,
} from "./copy";
import { INTERVIEW_FIELDS, METRIC_DIRECTIONS, type InterviewFieldKey } from "@respin/db";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};
const field: React.CSSProperties = {
  minHeight: "44px",
  padding: "0.6rem",
  fontSize: "1rem",
};
const checkboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  minHeight: "44px",
  cursor: "pointer",
  marginTop: "0.4rem",
};

export type InterviewViewProps = {
  mode: "edit" | "review";
  profileName: string;
  /** One resolved position per field — computed server-side by `fieldState`. */
  fields: Record<InterviewFieldKey, FieldState>;
  /** Why the form is unavailable, if it is — role only (courtesy; the server enforces it either way). */
  writeBlock: { reason: string } | null;
  saveStayAction: FormAction;
  saveReviewAction: FormAction;
  submitAction: FormAction;
  /** Copy for a `?e=` refusal, resolved server-side. */
  error: { title: string; detail: string } | null;
  /** Which field the refusal named, if any — for the inline marker beside it. */
  errorField: InterviewFieldKey | null;
  /** The server's per-answer character ceiling, so the copy cannot drift from it. */
  answerMax: number;
  /** The server's per-list item-count ceiling, so the copy cannot drift from it. */
  listMax: number;
};

function Refusal({ error }: { error: { title: string; detail: string } }): ReactNode {
  return (
    <Banner
      title={error.title}
      data-testid="interview-error"
      role="alert"
      tabIndex={-1}
      id="interview-refusal"
    >
      <p className="muted">{error.detail}</p>
      <FocusOnMount targetId="interview-refusal" />
    </Banner>
  );
}

function EditField({
  fieldKey,
  state,
  hasError,
}: {
  fieldKey: InterviewFieldKey;
  state: FieldState;
  hasError: boolean;
}): ReactNode {
  const widget = INTERVIEW_FIELD_WIDGETS[fieldKey];
  const label = INTERVIEW_FIELD_LABELS[fieldKey];
  const notDecidedId = notDecidedFieldName(fieldKey);
  const notDecidedChecked = state.status === "not_decided";
  const prefillText = state.status === "decided_text" ? state.value : "";
  const prefillList =
    state.status === "decided_list" ? serializeListLines(state.values) : "";
  const explicitlyEmptyId = explicitlyEmptyFieldName(fieldKey);
  const explicitlyEmptyChecked =
    state.status === "decided_list" && state.values.length === 0;

  return (
    <div
      className="field-row"
      data-testid={`interview-field-${fieldKey}`}
      style={{ marginBottom: "1.2rem" }}
    >
      <label htmlFor={fieldKey}>{label}</label>
      {widget === "select" ? (
        <select
          id={fieldKey}
          name={fieldKey}
          defaultValue={prefillText}
          style={{ ...field, display: "block", width: "100%" }}
          aria-invalid={hasError || undefined}
        >
          <option value="">Not chosen</option>
          {METRIC_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {METRIC_DIRECTION_LABELS[d]}
            </option>
          ))}
        </select>
      ) : widget === "list" ? (
        <textarea
          id={fieldKey}
          name={fieldKey}
          rows={3}
          defaultValue={prefillList}
          placeholder="One item per line."
          style={{ ...field, display: "block", width: "100%" }}
          aria-invalid={hasError || undefined}
        />
      ) : widget === "textarea" ? (
        <textarea
          id={fieldKey}
          name={fieldKey}
          rows={3}
          defaultValue={prefillText}
          style={{ ...field, display: "block", width: "100%" }}
          aria-invalid={hasError || undefined}
        />
      ) : (
        <input
          id={fieldKey}
          name={fieldKey}
          type="text"
          defaultValue={prefillText}
          style={{ ...field, display: "block", width: "100%" }}
          aria-invalid={hasError || undefined}
        />
      )}
      {widget === "list" ? (
        <label htmlFor={explicitlyEmptyId} style={checkboxRow}>
          <input
            id={explicitlyEmptyId}
            name={explicitlyEmptyId}
            type="checkbox"
            defaultChecked={explicitlyEmptyChecked}
            style={{ width: "1.15rem", height: "1.15rem" }}
          />
          <span>None — I&rsquo;ve decided there are none.</span>
        </label>
      ) : null}
      <label htmlFor={notDecidedId} style={checkboxRow}>
        <input
          id={notDecidedId}
          name={notDecidedId}
          type="checkbox"
          defaultChecked={notDecidedChecked}
          style={{ width: "1.15rem", height: "1.15rem" }}
        />
        <span>I haven&rsquo;t decided this yet.</span>
      </label>
      {hasError ? (
        <p
          className="muted"
          data-testid={`interview-field-error-${fieldKey}`}
          style={{ borderLeft: "2px solid var(--border-strong)", paddingLeft: "0.6rem" }}
        >
          This answer could not be saved — see the notice above.
        </p>
      ) : null}
    </div>
  );
}

function ReviewField({
  fieldKey,
  state,
}: {
  fieldKey: InterviewFieldKey;
  state: FieldState;
}): ReactNode {
  return (
    <div
      className="field-row"
      data-testid={`interview-review-${fieldKey}`}
      style={{ marginBottom: "0.8rem" }}
    >
      <strong>{INTERVIEW_FIELD_LABELS[fieldKey]}</strong>
      <p className="muted" style={{ margin: "0.2rem 0 0" }}>
        {reviewText(fieldKey, state)}
      </p>
    </div>
  );
}

export function InterviewView({
  mode,
  profileName,
  fields,
  writeBlock,
  saveStayAction,
  saveReviewAction,
  submitAction,
  error,
  errorField,
  answerMax,
  listMax,
}: InterviewViewProps): ReactNode {
  return (
    <section>
      <h1>Tell us about {profileName}</h1>
      <p className="muted">
        These are your own answers — goals, positioning, a north-star metric,
        words and vibes to avoid, and where you want this to go. They are
        stored as creator-authored statements, cited by field, never labelled
        as anything a model produced.
      </p>
      {error ? <Refusal error={error} /> : null}

      {mode === "edit" ? (
        <div className="panel">
          <h2>The interview</h2>
          <p className="muted" data-testid="interview-answer-limit">
            Each answer is up to {answerMax.toLocaleString("en-US")} characters;
            a list holds up to {listMax} items. Every question also has an
            &ldquo;I haven&rsquo;t decided this yet&rdquo; box — leaving a
            field blank is not the same as marking it not decided.
          </p>
          {writeBlock ? (
            <p className="muted" data-testid="interview-blocked">
              {writeBlock.reason}
            </p>
          ) : (
            <form action={saveReviewAction} data-testid="interview-edit-form">
              {INTERVIEW_FIELDS.map((f) => (
                <EditField
                  key={f.key}
                  fieldKey={f.key}
                  state={fields[f.key]}
                  hasError={errorField === f.key}
                />
              ))}
              <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
                <SubmitButton
                  className={buttonClass("primary")}
                  style={control}
                  formAction={saveReviewAction}
                  pendingLabel="Saving your answers…"
                >
                  Save and review my answers
                </SubmitButton>
                <SubmitButton
                  className={buttonClass("secondary")}
                  style={control}
                  formAction={saveStayAction}
                  pendingLabel="Saving your answers…"
                >
                  Save without leaving
                </SubmitButton>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="panel">
          <h2>Review your answers</h2>
          <p className="muted">
            Nothing below has been submitted yet. Go back and edit anything —
            what you already typed is saved, not lost.
          </p>
          <p>
            <a href="/onboarding/interview" data-testid="interview-edit-link">
              Go back and edit
            </a>
          </p>
          {INTERVIEW_FIELDS.map((f) => (
            <ReviewField key={f.key} fieldKey={f.key} state={fields[f.key]} />
          ))}
          {writeBlock ? (
            <p className="muted" data-testid="interview-submit-blocked">
              {writeBlock.reason}
            </p>
          ) : (
            <form action={submitAction} data-testid="interview-submit-form">
              <SubmitButton
                className={buttonClass("primary")}
                style={control}
                pendingLabel="Submitting your interview…"
              >
                Submit my interview
              </SubmitButton>
            </form>
          )}
          {/*
            R13, THE HONEST B04 ABSENCE. PRD B04 is "create my first three
            ideas into Studio's Ideation mode" and it is owned by slice 7,
            not this one. Naming that here rather than rendering a button
            that goes nowhere, or a claim that ideas exist, is the whole
            point of this paragraph.
          */}
          <p className="muted" data-testid="interview-b04-absence">
            After you submit, creating your first three ideas in Studio is
            not part of this product yet. Submitting turns any answers you
            decided above into a draft Strategy and/or Kill Test — only for
            whichever of the two your answers actually touch — that you
            review, correct and activate on the brain screen; nothing runs on
            its own.
          </p>
        </div>
      )}
    </section>
  );
}
