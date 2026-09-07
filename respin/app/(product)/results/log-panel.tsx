"use client";

// The log-a-result control. One press, one row, no vendor and no debit — which
// is why this panel says so rather than leaving a creator to wonder whether a
// button on a screen full of numbers costs anything.
//
// EVERY VOCABULARY ON THIS FORM ARRIVES AS A PROP, resolved server-side in
// `page.tsx` from `@respin/db`'s own `as const` arrays. This module imports
// only `./copy` (which imports nothing) and two UI primitives, because every
// `@respin/*` specifier a client module reaches drags `pg` into the browser
// bundle — `tests/client-bundle-boundary.test.ts` names the chain, `next build`
// names `tls`. A hand-typed list of confounder codes in this file would be the
// other failure: a second vocabulary, drifting from the enum the database
// checks against.
//
// STRUCTURAL, NOT REMEMBERED. `page.tsx` assigns `@respin/db`'s arrays into
// these props, so a code added upstream appears here and a code removed
// upstream disappears — and a code with no words in `./copy` renders as its
// raw code rather than vanishing (see `confounderLabel`).
import { useActionState, useState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import {
  DENOMINATOR_NOTE,
  EVIDENCE_DERIVED_NOTE,
  LOG_COSTS_NOTHING,
  LOG_PENDING_LABEL,
  NOTE_MEANING,
  resultNoteLimit,
  NO_GENERATION_MEANING,
  NO_GENERATION_OPTION_LABEL,
  PICKER_RECENT_ONLY,
  WINDOW_NOTE,
  confounderLabel,
  evidenceStateCopy,
  leverLabel,
} from "./copy";
import { LogOutcome } from "./log-outcome";
// THE WIRE NAMES, FROM THE ONE LIST BOTH SIDES READ. A `name="…"` typed here
// and a `formData.get("…")` typed in `./actions.ts` are two strings nothing
// binds; a rename on either side renders, lints, compiles, and silently stores
// a creator's typed number as absent.
import {
  IDLE_LOG_RESULT_STATE,
  RESULT_FIELD,
  leverField,
  type LogResultState,
} from "./log-state";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

/** One of this creator's own outputs, as the picker offers it. */
export type GenerationChoice = {
  generationId: string;
  /** Mode plus ISO day — server-formatted, so no locale question arises. */
  label: string;
};

export type LogPanelProps = {
  action: (
    prev: LogResultState,
    formData: FormData
  ) => Promise<LogResultState>;
  /** This creator's own outputs. Empty is a state, not an error. */
  generations: readonly GenerationChoice[];
  /** The platforms this product can compare on. Closed, and the form says why. */
  platforms: readonly string[];
  /** `RESULT_AUDIENCE_CLASSES`, from the database's own enum. Never pooled. */
  audienceClasses: readonly string[];
  /** `RESULT_EVIDENCE_STATES`, in the vocabulary's own order. */
  evidenceStates: readonly string[];
  /** `RESULT_CONFOUNDER_CODES`, from the database's own closed set. */
  confounderCodes: readonly string[];
  /** `RESULT_LEVERS` — two, and they never merge. */
  levers: readonly string[];
  /** `RESULT_NOTE_MAX`, stated on the control. Never a number typed here. */
  noteMax: number;
  /** Why the control is unavailable, if it is (role, pause, no profile). */
  block: { reason: string } | null;
};

export function LogPanel({
  action,
  generations,
  platforms,
  audienceClasses,
  evidenceStates,
  confounderCodes,
  levers,
  noteMax,
  block,
}: LogPanelProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    IDLE_LOG_RESULT_STATE
  );
  const offered = evidenceStates.filter((code) => evidenceStateCopy(code).offered);
  const withheld = evidenceStates.filter(
    (code) => !evidenceStateCopy(code).offered
  );
  // WHICH INTENT IS CHOSEN, held here for ONE reason: whether to show the
  // lever fields. `results_unquantified_has_no_numbers` refuses a row that
  // carries both a "no numbers" label and numbers, so offering fields whose
  // only outcome is a refusal is what `studio-panel.tsx` refuses to do for
  // modes.
  //
  // IT STARTS UNCHOSEN AND THE FIELDS START ENABLED, which is the JS-OFF
  // direction: with no script running this state never changes, so a default
  // of "no numbers" would leave every creator without JavaScript unable to
  // enter any, on a form whose whole point is numbers. The stored label is
  // derived from what actually arrives either way (`recordResult`), so an
  // enabled-but-unused field costs nothing and a disabled-and-needed one costs
  // the whole submission.
  //
  // THE BRANCH READS A FLAG, NOT A STRING: `evidenceStateCopy(...).numbers`.
  // A `"unquantified"` literal here would be a vocabulary member hand-typed
  // into a client module that may not import the vocabulary.
  const [evidenceState, setEvidenceState] = useState<string>("");
  const quantified =
    evidenceState === "" || evidenceStateCopy(evidenceState).numbers;

  return (
    <div data-testid="results-log-panel">
      <p className="muted" data-testid="results-log-cost">
        {LOG_COSTS_NOTHING}
      </p>

      {/* The live region is present at load and starts EMPTY — the half the
          onboarding control got wrong first: a region that MOUNTS populated is
          announced inconsistently, one that is present and then CHANGES is the
          reliable half. */}
      <p
        role="status"
        aria-live="polite"
        data-testid="results-log-status"
        className="muted"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {isPending ? LOG_PENDING_LABEL : ""}
      </p>

      {block ? (
        <p className="muted" data-testid="results-log-blocked">
          {block.reason}
        </p>
      ) : (
        <form action={formAction}>
          <fieldset
            style={{ border: 0, padding: 0, margin: "0 0 var(--sp-5)" }}
            data-testid="results-generation-field"
          >
            <legend>Which of your posts is this about?</legend>
            {/* WHAT THE LIST IS, BEFORE THE LIST. Unconditional: the bound it
                describes is one almost no fixture crosses, and copy that only
                appears past a threshold is copy nobody reviews. It narrows the
                gap rather than closing it, and its last clause says so. */}
            <p
              className="muted"
              id="results-generation-recency"
              data-testid="results-generation-recency"
            >
              {PICKER_RECENT_ONLY}
            </p>
            <label htmlFor="results-generation">The draft it came from</label>
            <br />
            <select
              id="results-generation"
              name={RESULT_FIELD.generationId}
              defaultValue=""
              style={control}
              aria-describedby="results-generation-recency results-generation-note"
            >
              <option value="">{NO_GENERATION_OPTION_LABEL}</option>
              {generations.map((g) => (
                <option key={g.generationId} value={g.generationId}>
                  {g.label}
                </option>
              ))}
            </select>
            <p
              className="muted"
              id="results-generation-note"
              data-testid="results-generation-note"
            >
              {NO_GENERATION_MEANING}
            </p>
          </fieldset>

          <fieldset
            style={{ border: 0, padding: 0, margin: "0 0 var(--sp-5)" }}
            data-testid="results-stratum-field"
          >
            <legend>Where and how it was posted</legend>
            <label htmlFor="results-platform">Platform</label>
            <br />
            <select
              id="results-platform"
              name={RESULT_FIELD.platform}
              required
              defaultValue=""
              style={control}
            >
              <option value="" disabled>
                Choose one
              </option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <p className="muted" data-testid="results-platform-note">
              These are the platforms this product compares on. The same metric
              on two platforms is two different populations wearing one name, so
              a result carries the platform it was posted to and is only ever
              compared against others from the same one.
            </p>

            {/* PAID AND ORGANIC NEVER POOL (R13/REQ-F01), and the form is where
                that starts: a required choice, from the database's own enum, so
                there is no "unspecified" bucket for the two to meet in. */}
            <fieldset
              style={{ border: 0, padding: 0 }}
              data-testid="results-audience-field"
            >
              <legend className="muted">
                Was this organic, or did you put money behind it?
              </legend>
              {audienceClasses.map((code) => (
                <label
                  key={code}
                  htmlFor={`results-audience-${code}`}
                  style={{ display: "block", padding: "0.25rem 0" }}
                >
                  <input
                    type="radio"
                    id={`results-audience-${code}`}
                    name={RESULT_FIELD.audienceClass}
                    value={code}
                    required
                  />{" "}
                  {code === "paid" ? "Paid" : "Organic"}
                </label>
              ))}
              <p className="muted" data-testid="results-audience-note">
                Paid and organic results are never pooled, in either direction.
                A paid post is never counted into an organic baseline and never
                compared against one.
              </p>
            </fieldset>
          </fieldset>

          <fieldset
            style={{ border: 0, padding: 0, margin: "0 0 var(--sp-5)" }}
            data-testid="results-window-field"
          >
            <legend>Over what window did you read these numbers?</legend>
            <label htmlFor="results-observed-from">First day</label>{" "}
            <input
              type="date"
              id="results-observed-from"
              name={RESULT_FIELD.observedFrom}
              required
              style={control}
              aria-describedby="results-window-note"
            />
            <br />
            <label htmlFor="results-observed-to">Last day</label>{" "}
            <input
              type="date"
              id="results-observed-to"
              name={RESULT_FIELD.observedTo}
              required
              style={control}
              aria-describedby="results-window-note"
            />
            <p
              className="muted"
              id="results-window-note"
              data-testid="results-window-note"
            >
              {WINDOW_NOTE}
            </p>
          </fieldset>

          {/* R6. TWO STATES ON THE FORM AND THE THIRD NAMED, never hidden.
              AND THE RADIO IS AN INTENT CONTROL, NOT AN AUTHORITY: it is
              posted and `logResultAction` deliberately ignores it, because
              `recordResult` DERIVES the stored label from whether numbers
              arrived and offers no parameter for it. That is what makes
              `connector_verified` unreachable from a browser rather than
              merely absent from this list — there is no request through which
              anything could claim it. `EVIDENCE_DERIVED_NOTE` says so out
              loud, so a creator is not told one thing by a radio and another
              by the row. */}
          <fieldset
            style={{ border: 0, padding: 0, margin: "0 0 var(--sp-5)" }}
            data-testid="results-evidence-field"
          >
            <legend>How good are these numbers?</legend>
            <p className="muted" data-testid="results-evidence-derived">
              {EVIDENCE_DERIVED_NOTE}
            </p>
            {offered.map((code) => {
              const copy = evidenceStateCopy(code);
              return (
                <label
                  key={code}
                  htmlFor={`results-evidence-${code}`}
                  style={{ display: "block", padding: "0.35rem 0" }}
                >
                  <input
                    type="radio"
                    id={`results-evidence-${code}`}
                    // NAMED FOR WHAT IT IS. `evidenceIntent`, not
                    // `evidenceState`: it is posted and `logResultAction`
                    // reads it nowhere, because the stored label is derived
                    // from the numbers. A field called `evidenceState` would
                    // read like an authority this form does not have.
                    name={RESULT_FIELD.evidenceIntent}
                    value={code}
                    checked={evidenceState === code}
                    onChange={() => setEvidenceState(code)}
                  />{" "}
                  {copy.label}
                  <br />
                  <span className="muted">{copy.meaning}</span>
                </label>
              );
            })}
            {withheld.map((code) => (
              <p
                className="muted"
                key={code}
                data-testid={`results-evidence-withheld-${code}`}
              >
                {evidenceStateCopy(code).whyNotOffered}
              </p>
            ))}
          </fieldset>

          {/* R9. TWO LEVERS, EACH WITH ITS OWN DENOMINATOR, entered separately.
              There is no third field that adds them and no place to type one
              number for both. */}
          <fieldset
            style={{ border: 0, padding: 0, margin: "0 0 var(--sp-5)" }}
            data-testid="results-levers-field"
            disabled={!quantified}
          >
            <legend>The numbers</legend>
            {!quantified ? (
              // A DISABLED CONTROL SUBMITS NOTHING, and here that is the
              // intent rather than the defect `studio-panel.tsx` records: an
              // `unquantified` row must carry no lever columns at all, and the
              // database refuses one that does. The reason is stated because a
              // silently dead field is worse than an absent one.
              <p className="muted" data-testid="results-levers-disabled">
                You said you do not have numbers for this one, so there is
                nothing to type here. The result is still stored, and it stays
                out of every comparison on this page until you log one with
                numbers.
              </p>
            ) : null}
            {levers.map((lever) => (
              <div key={lever} data-testid={`results-lever-${lever}`}>
                <p style={{ margin: "var(--sp-3) 0 0" }}>
                  <strong>{leverLabel(lever)}</strong>
                </p>
                <label htmlFor={`results-${lever}-value`}>
                  {leverLabel(lever)} count
                </label>{" "}
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  id={`results-${lever}-value`}
                  name={leverField(lever, "value")}
                  style={control}
                  aria-describedby="results-denominator-note"
                />
                <br />
                <label htmlFor={`results-${lever}-denominator`}>
                  {leverLabel(lever)} denominator
                </label>{" "}
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  id={`results-${lever}-denominator`}
                  name={leverField(lever, "denominator")}
                  style={control}
                  aria-describedby="results-denominator-note"
                />
              </div>
            ))}
            <p
              className="muted"
              id="results-denominator-note"
              data-testid="results-denominator-note"
            >
              {DENOMINATOR_NOTE}
            </p>
          </fieldset>

          {/* R7. STRUCTURED FLAGS, NEVER PROSE — checkboxes from the database's
              own closed set, so nothing here has to be parsed later. */}
          <fieldset
            style={{ border: 0, padding: 0, margin: "0 0 var(--sp-5)" }}
            data-testid="results-confounders-field"
          >
            <legend>What else could explain this?</legend>
            {confounderCodes.map((code) => (
              <label
                key={code}
                htmlFor={`results-confounder-${code}`}
                style={{ display: "block", padding: "0.25rem 0" }}
              >
                <input
                  type="checkbox"
                  id={`results-confounder-${code}`}
                  name={RESULT_FIELD.confounders}
                  value={code}
                />{" "}
                {confounderLabel(code)}
              </label>
            ))}
            <p className="muted" data-testid="results-confounders-note">
              Tick anything that was also true. These are shown beside every
              comparison this result is part of, not filed away — a comparison
              that hides what else was going on is a stronger claim than the
              numbers support.
            </p>
          </fieldset>

          <p>
            <label htmlFor="results-note">Anything you want to add</label>
            <br />
            <textarea
              id="results-note"
              name={RESULT_FIELD.note}
              rows={3}
              maxLength={noteMax}
              aria-describedby="results-note-limit results-note-meaning"
              style={{ width: "100%", fontSize: "1rem" }}
            />
            <br />
            {/* THE CEILING, STATED. It was absent while `recordResult`
                refused at 2,001 and `ResultInputError` told the creator to
                "check each against the limit shown beside it" — a limit
                nothing showed. The number comes from `RESULT_NOTE_MAX`
                through the page; see `resultNoteLimit` for why the browser's
                count and the writer's are not the same units. */}
            <span
              className="muted"
              id="results-note-limit"
              data-testid="results-note-limit"
            >
              {resultNoteLimit(noteMax)}
            </span>
            <br />
            <span
              className="muted"
              id="results-note-meaning"
              data-testid="results-note-meaning"
            >
              {NOTE_MEANING}
            </span>
          </p>

          <SubmitButton
            className={buttonClass("primary")}
            style={control}
            pendingLabel={LOG_PENDING_LABEL}
          >
            Log this result
          </SubmitButton>
        </form>
      )}

      {/* BOTH POST-PRESS STATES ARE A PURE COMPONENT, for the reason
          `log-outcome.tsx`'s header gives: `useActionState` yields only its
          initial state under `renderToStaticMarkup`, so a recorded or refused
          state rendered inline here is a state no test could drive. */}
      <LogOutcome state={state} />
    </div>
  );
}
