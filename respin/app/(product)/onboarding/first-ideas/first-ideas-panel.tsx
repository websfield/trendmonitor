"use client";

// PRD B04's control: one press, one Ideation batch, one debit (slice 7, R5).
//
// STRUCTURALLY `../../studio/studio-panel.tsx`'s generation control, minus the
// mode picker and the revision picker — same live region, same pending label
// discipline, same `SubmitButton`, and the SAME result renderer. Reusing
// `GenerationOutcome` is not a shortcut: R18 says "why this performs names the
// weakest point on every mode", and a B04 screen with its own result markup is
// exactly the second place a weakest point would go missing.
//
// EVERY SENTENCE COMES FROM `./copy.ts`, which imports NOTHING — the
// client-bundle rule `tests/client-bundle-boundary.test.ts` enforces.
//
// IT DOES NOT STREAM AND DOES NOT IMPLY ONE (R16). The busy label says the
// output is being PREPARED; there is no progress element, no percentage and no
// placeholder that fills in. `NO_STREAM_NOTE` is rendered from the studio's own
// copy module so the two screens cannot say different things about the same
// pipeline.
import { useActionState } from "react";
import { buttonClass } from "../../../ui/button";
import { NO_STREAM_NOTE, PLATFORM_OPTIONS } from "../../studio/run-copy";
import type { StudioRunState } from "../../studio/run-state";
import { SubmitButton } from "../submit-button";
import { FirstIdeasResult } from "./first-ideas-result";
import {
  FIRST_IDEAS_BUTTON,
  FIRST_IDEAS_INTRO,
  FIRST_IDEAS_NO_RESULTS_BASIS,
  FIRST_IDEAS_PENDING_LABEL,
} from "./copy";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

export type FirstIdeasPanelProps = {
  action: (
    prev: StudioRunState,
    formData: FormData
  ) => Promise<StudioRunState>;
  /** What a press will spend, in words — computed server-side from config. */
  costSentence: string;
  /** Why the control is unavailable, if it is. Role, pause, plan, or no brain. */
  block: { reason: string } | null;
  /** @internal Static-render fixture state; no app call site passes this. */
  initialState?: StudioRunState;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
};

const IDLE: StudioRunState = { status: "idle" };

export function FirstIdeasPanel({
  action,
  costSentence,
  block,
  initialState,
  refusalCopy,
  fallbackCopy,
}: FirstIdeasPanelProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialState ?? IDLE
  );

  return (
    <div data-testid="first-ideas-panel">
      <details>
        <summary>How this works and what it costs</summary>
        <p data-testid="first-ideas-intro">{FIRST_IDEAS_INTRO}</p>
      </details>
      <p className="muted" data-testid="first-ideas-cost">
        {costSentence}
      </p>
      <p className="muted" data-testid="first-ideas-no-results-basis">
        {FIRST_IDEAS_NO_RESULTS_BASIS}
      </p>
      <p className="muted" data-testid="first-ideas-no-stream">
        {NO_STREAM_NOTE}
      </p>

      {/*
        PRESENT AT LOAD AND EMPTY — the half the onboarding run control got
        wrong first time. A region that MOUNTS already populated is announced
        inconsistently; one present at load that then CHANGES is the reliable
        half of the pattern.
      */}
      <p
        role="status"
        aria-live="polite"
        data-testid="first-ideas-status"
        className="muted"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {isPending ? FIRST_IDEAS_PENDING_LABEL : ""}
      </p>

      {block ? (
        <p className="muted" data-testid="first-ideas-blocked">
          {block.reason}
        </p>
      ) : (
        <form action={formAction}>
          <p>
            <label htmlFor="first-ideas-platform">Platform</label>
            <br />
            <select
              id="first-ideas-platform"
              name="platform"
              defaultValue={PLATFORM_OPTIONS[0]}
              style={control}
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </p>
          <p>
            <label htmlFor="first-ideas-input">
              What is this creator working on right now? A few words is enough.
            </label>
            <br />
            <textarea
              id="first-ideas-input"
              name="input"
              rows={4}
              style={{ width: "100%", fontSize: "1rem" }}
            />
            <br />
            <span className="muted">
              This is sent to our model provider along with the brain you
              activated for this creator. Nothing else of yours is sent.
            </span>
          </p>
          <SubmitButton
            className={buttonClass("primary")}
            style={control}
            pendingLabel={FIRST_IDEAS_PENDING_LABEL}
          >
            {FIRST_IDEAS_BUTTON}
          </SubmitButton>
        </form>
      )}

      {/*
        THE WHOLE RESULT REGION, IN ONE PURE COMPONENT. It wraps `/studio`'s
        `GenerationOutcome` — the ideas, the weakest point, the disclosure, the
        kill test's verdict, the traceability findings, the charge and the
        honest refusal — and adds B04's own count heading and the paragraph
        that follows it. It is a separate module because `useActionState` yields
        only its INITIAL state under `renderToStaticMarkup`, so anything written
        HERE is a state no test can drive.
      */}
      <FirstIdeasResult
        state={state}
        refusalCopy={refusalCopy}
        fallbackCopy={fallbackCopy}
      />
    </div>
  );
}
