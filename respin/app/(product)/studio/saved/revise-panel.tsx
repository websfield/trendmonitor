"use client";

// THE THREE FIXED REVISIONS OF A SAVED VERSION (launch L4, R-153): shorter,
// more natural, easier to film. A PAID press — the configured revision price
// and the version it revises are stated ABOVE the buttons, and each button
// points `aria-describedby` at that sentence, before anything is pressed.
//
// ONE FORM, THREE SUBMITTERS, so a press in flight makes all three
// unavailable (`useFormStatus` reads the one form); `aria-disabled` keeps focus
// on the pressed control (the `SubmitButton` rule). The outcome is announced in
// a PERSISTENT `role="status"` region; a refusal is an alert with its copy.
//
// THE QUOTE TRAVELS WITH THE PRESS (R-153 amendment, billing M1): the form
// carries the config version the price above was read under, and the server
// refuses the press when the price under the active version differs. And when
// this version ALREADY has a revision, that is said above the presses with a
// link to it (billing M2), so a creator whose last press lost its response
// opens it instead of paying for a second one.
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner } from "../../../ui/banner";
import { buttonClass } from "../../../ui/button";
import { savedPackHref } from "../run-copy";
import { IDLE_SAVED_REVISE_STATE, type SavedReviseState } from "../run-state";
import {
  OPEN_LATEST_REVISION_LABEL,
  OPEN_NEW_VERSION_LABEL,
  REVISE_HEADING,
  REVISE_PENDING,
  alreadyRevisedSentence,
  reviseDoneSentence,
} from "./saved-copy";

// Spacing from the `--sp-*` tokens (accessibility C5).
const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "var(--sp-2) var(--sp-4)",
  fontSize: "1rem",
};

const link: React.CSSProperties = {
  display: "inline-block",
  minHeight: "44px",
  paddingBlock: "var(--sp-2)",
};

const COST_ID = "saved-revise-cost";
const REFUSAL_ID = "saved-revise-refusal";

export type RevisePanelProps = {
  action: (prev: SavedReviseState, formData: FormData) => Promise<SavedReviseState>;
  options: readonly { id: string; label: string }[];
  /** The configured price and the parent, in words (`reviseCostSentence`). */
  costSentence: string;
  /** Why the presses are not offered (plan, role, pause, refusal), or null. */
  block: string | null;
  /** The config version the price was read under; sent back with the press. */
  quoteConfigVersion: number | null;
  /** This version's newest revision, when it already has one. */
  latestRevision: { attemptId: string; createdAt: string } | null;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
};

function PresetButtons({ options }: { options: RevisePanelProps["options"] }) {
  const { pending, data } = useFormStatus();
  const pressed = data?.get("preset");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="submit"
          name="preset"
          value={o.id}
          className={buttonClass("secondary")}
          style={control}
          aria-disabled={pending}
          aria-busy={pending && pressed === o.id}
          aria-describedby={COST_ID}
          data-testid={`saved-revise-${o.id}`}
          onClick={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          {pending && pressed === o.id ? REVISE_PENDING : o.label}
        </button>
      ))}
    </div>
  );
}

export function RevisePanel({
  action,
  options,
  costSentence,
  block,
  quoteConfigVersion,
  latestRevision,
  refusalCopy,
  fallbackCopy,
}: RevisePanelProps) {
  const [state, formAction] = useActionState(action, IDLE_SAVED_REVISE_STATE);
  const refusal =
    state.status === "refused" ? (refusalCopy[state.code] ?? fallbackCopy) : null;
  return (
    <section
      className="panel"
      aria-labelledby="saved-revise-heading"
      data-testid="saved-revise"
      style={{ marginTop: "var(--sp-4)" }}
    >
      <h2 id="saved-revise-heading" style={{ marginTop: 0 }}>
        {REVISE_HEADING}
      </h2>
      {latestRevision !== null ? (
        <p data-testid="saved-already-revised">
          {alreadyRevisedSentence(latestRevision.createdAt)}{" "}
          <a href={savedPackHref(latestRevision.attemptId)} style={link}>
            {OPEN_LATEST_REVISION_LABEL}
          </a>
        </p>
      ) : null}
      <p id={COST_ID} data-testid="saved-revise-cost">
        {costSentence}
      </p>
      {/* NO QUOTE, NO PRESS: a form without the version its price was read
          under is one the server would refuse anyway. */}
      {block !== null ? (
        <p className="muted" data-testid="saved-revise-block">
          {block}
        </p>
      ) : quoteConfigVersion === null ? null : (
        <form action={formAction} aria-describedby={refusal ? REFUSAL_ID : undefined}>
          <input type="hidden" name="quote" value={String(quoteConfigVersion)} />
          <PresetButtons options={options} />
        </form>
      )}
      <div role="status" aria-live="polite" data-testid="saved-revise-status">
        {state.status === "done" ? (
          <>
            <p>{reviseDoneSentence(state)}</p>
            <p>
              <a href={savedPackHref(state.attemptId)} style={link}>
                {OPEN_NEW_VERSION_LABEL}
              </a>
            </p>
          </>
        ) : null}
      </div>
      {refusal ? (
        <Banner title={refusal.title} role="alert" id={REFUSAL_ID} data-testid="saved-revise-refusal">
          <p className="muted">{refusal.detail}</p>
        </Banner>
      ) : null}
    </section>
  );
}
