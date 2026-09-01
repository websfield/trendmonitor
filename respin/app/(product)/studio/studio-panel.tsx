"use client";

// The generation control: the first place this product writes something a
// creator would publish, and the first place a press costs a credit every time.
//
// EVERYTHING STRUCTURAL HERE IS `../onboarding/run-inference-panel.tsx`'s, and
// deliberately so: that control's live regions, its pending label and its
// double-submit window were settled by four gate rounds and a browser walk, and
// the shape is identical — one press, one vendor sequence, one debit. What is
// different is stated where it differs.
//
// `useActionState` rather than a redirect, for the reason `./run-state.ts`
// gives: the draft, the charge and the resulting balance exist exactly once, on
// the value the operation returned.
//
// IT DOES NOT STREAM, AND IT SAYS SO (the slice card leaves the choice to the
// developer and requires the screen to say which way it went). `NO_STREAM_NOTE`
// is rendered next to the control rather than left to be inferred from a
// spinner — a spinner that implied a stream would be a promise of something
// that is not happening.
import { useActionState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import { GenerationOutcome } from "./generation-outcome";
// EVERYTHING THIS FILE IMPORTS FROM THE SCREEN COMES FROM `./run-copy.ts`, and
// none of it from `./copy.ts` — which reaches `@respin/credits/app-server` and
// therefore `pg`. `tests/client-bundle-boundary.test.ts` caught the first draft
// of this import doing exactly that; the build's own error would have named
// `dns`, not the import.
import {
  MODE_AVAILABILITY_NOTE,
  NO_RESULTS_BASIS,
  NO_STREAM_NOTE,
  PLATFORM_OPTIONS,
  STUDIO_MODE,
} from "./run-copy";
import { IDLE_STUDIO_STATE, type StudioRunState } from "./run-state";

/**
 * The refusal copy for every code this action can return, resolved SERVER-side
 * and handed over as plain data — the same reason `RefusalCopyByCode` exists on
 * the onboarding panel: a function cannot cross the server/client boundary, and
 * importing `../billing-errors` here would pull `@respin/credits/app-server`
 * (and therefore `pg`) into the client bundle.
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

export type StudioPanelProps = {
  action: (
    prev: StudioRunState,
    formData: FormData
  ) => Promise<StudioRunState>;
  /** What a press will spend, in words — computed server-side from config. */
  costSentence: string;
  /** Why the control is unavailable, if it is. Role, pause, or no brain. */
  block: { reason: string } | null;
  refusalCopy: RefusalCopyByCode;
  fallbackCopy: { title: string; detail: string };
};

export function StudioPanel({
  action,
  costSentence,
  block,
  refusalCopy,
  fallbackCopy,
}: StudioPanelProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    IDLE_STUDIO_STATE
  );

  return (
    <div data-testid="studio-panel">
      <p className="muted" data-testid="studio-mode-note">
        {MODE_AVAILABILITY_NOTE}
      </p>
      {/* R18's price, stated BEFORE the press (the `runCostSentence` rule). */}
      <p className="muted" data-testid="studio-cost">
        {costSentence}
      </p>
      {/* R21's n = 0 sentence. It sits above the control, not under the
          result: the claim it forecloses is one a reader would otherwise form
          while deciding to press. */}
      <p className="muted" data-testid="studio-no-results-basis">
        {NO_RESULTS_BASIS}
      </p>
      <p className="muted" data-testid="studio-no-stream">
        {NO_STREAM_NOTE}
      </p>

      {/*
        THE LIVE REGION IS ALWAYS PRESENT AND STARTS EMPTY — the half the
        onboarding control got wrong first time. A region that MOUNTS already
        populated is announced inconsistently; one that is present at load and
        then CHANGES is the reliable half of the pattern.
      */}
      <p
        role="status"
        aria-live="polite"
        data-testid="studio-status"
        className="muted"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {isPending ? "Working on your draft…" : ""}
      </p>

      {block ? (
        <p className="muted" data-testid="studio-blocked">
          {block.reason}
        </p>
      ) : (
        <form action={formAction}>
          {/*
            THE MODE IS A HIDDEN FIELD AND NOT A CHOICE, because there is one
            mode with a pipeline behind it. It is still untrusted input on the
            wire — `modeSpec` refuses a string that is not a mode and
            `assertModeAllowed` refuses one this plan does not include, both
            before any vendor is contacted. This field is the convenience; those
            two are the control.
          */}
          <input type="hidden" name="mode" value={STUDIO_MODE} />
          <p>
            <label htmlFor="studio-platform">Platform</label>
            <br />
            <select
              id="studio-platform"
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
            <br />
            <span className="muted">
              The disclosure guidance in the draft is written for the platform
              you pick.
            </span>
          </p>
          <p>
            <label htmlFor="studio-input">
              What is this about? An idea, an angle, a reference you want to
              start from.
            </label>
            <br />
            <textarea
              id="studio-input"
              name="input"
              rows={5}
              style={{ width: "100%", fontSize: "1rem" }}
            />
            <br />
            <span className="muted">
              This is sent to our model provider along with the brain you
              activated for this creator. Nothing else of yours is sent.
            </span>
          </p>
          {/*
            THE PENDING LABEL NAMES WHAT IS IN FLIGHT AND CLAIMS NO VENDOR CALL,
            for the reason the onboarding control records: a dozen refusal paths
            never contact the model at all, and a label asserting a call we may
            not have made is a false sentence on a money control. "Working on
            your draft…" is true on every path.
          */}
          <SubmitButton
            className={buttonClass("primary")}
            style={control}
            pendingLabel="Working on your draft…"
          >
            {/*
              THE LABEL NAMES WHAT IT PRODUCES. It says "hooks" and "draft"
              because that is what it does — R21 is exactly the point at which
              `/studio` is allowed to say those words, and a vaguer label on the
              control that spends a credit would be worse, not safer.
            */}
            Generate a hook set
          </SubmitButton>
        </form>
      )}

      <GenerationOutcome
        state={state}
        refusalCopy={refusalCopy}
        fallbackCopy={fallbackCopy}
      />
    </div>
  );
}
