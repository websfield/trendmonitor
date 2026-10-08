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
// IT DOES NOT STREAM, AND IT SAYS SO — R16's second branch, verbatim: "if
// streaming is deferred, the screen says the output is being prepared and does
// not imply a stream — an animated placeholder that suggests live generation is
// a claim". `NO_STREAM_NOTE` is rendered next to the control, the busy label is
// `PREPARING_LABEL`, and there is no progress element, no percentage and no
// skeleton anywhere in this file. `tests/studio-ui.test.tsx` scans the rendered
// screen for all three shapes, because "we did not add a spinner" is the kind
// of claim that stops being true in a styling pass.
//
// TWO ACTIONS, TWO STATES, and they are separate on purpose: a feedback refusal
// must not clear the draft a creator is reading, and a new draft must not clear
// the record that their last reaction was stored.
import { useActionState, useState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import { FeedbackBlock, RememberBlock } from "./feedback-block";
import { GenerationOutcome } from "./generation-outcome";
import { LineageList } from "./lineage-view";
// EVERYTHING THIS FILE IMPORTS FROM THE SCREEN COMES FROM `./run-copy.ts`, and
// none of it from `./copy.ts` — which reaches `@respin/credits/app-server` and
// therefore `pg`. `tests/client-bundle-boundary.test.ts` caught the first draft
// of this import doing exactly that; the build's own error would have named
// `dns`, not the import.
import {
  FINISH_HELD_DRAFT_LABEL,
  HELD_DRAFTS_HEADING,
  HELD_DRAFTS_NOTE,
  HELD_DRAFTS_UNAVAILABLE,
  heldUntilText,
  FILMING_LIMITS_HELP,
  FILMING_LIMITS_SUMMARY,
  FORM_CONTROL_HELP,
  FORM_CONTROL_LEGEND,
  priceLineFor,
  resultsBasisSentence,
  NO_STREAM_NOTE,
  PLATFORM_OPTIONS,
  PREPARING_LABEL,
  REVISION_KEEPS_FORM_NOTE,
  REVISION_NOTE_HELP,
  REVISION_SAME_MODE_NOTE,
  SEQUEL_HELP,
  SEQUEL_LABEL,
  lineageChoiceLabel,
  inForceSentence,
  modeAvailabilityNote,
  type ActiveBrainKind,
  type CreativeBoundsView,
  type FormOptionView,
  type ModeChoiceView,
} from "./run-copy";
import {
  IDLE_EXCLUDE_STATE,
  IDLE_FEEDBACK_STATE,
  IDLE_REMEMBER_STATE,
  IDLE_STUDIO_STATE,
  type ExcludeState,
  type FeedbackState,
  type RememberState,
  type StudioActionState,
} from "./run-state";

/**
 * The refusal copy for every code these actions can return, resolved SERVER-side
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

/** One held draft, as plain values (audit P3-A4). */
export type HeldDraftLine = {
  attemptId: string;
  modeLabel: string;
  /** ISO instant the worker's clear removes it. */
  heldUntil: string;
};

export type StudioPanelProps = {
  action: (
    prev: StudioActionState,
    formData: FormData
  ) => Promise<StudioActionState>;
  /**
   * Audit P3-A4 (R-157): this creator's HELD drafts and the "Finish this
   * draft" action. `drafts` is `null` when the courtesy read failed. Absent on
   * a fixture that renders no held list.
   */
  held?: {
    drafts: readonly HeldDraftLine[] | null;
    resumeAction: (
      prev: StudioActionState,
      formData: FormData
    ) => Promise<StudioActionState>;
  };
  /**
   * Audit P3-R2: the input ceiling in words, from the server-read
   * `llm.maxInputTokens` — visible text, never a `maxLength`.
   */
  inputLimitSentence?: string;
  feedbackAction: (
    prev: FeedbackState,
    formData: FormData
  ) => Promise<FeedbackState>;
  /**
   * Audit P6-A1 (R-174): "Leave this out of future drafts", offered beside a
   * recorded reaction. Optional so a fixture that renders no feedback need
   * not pass one; the page always does.
   */
  excludeAction?: (
    prev: ExcludeState,
    formData: FormData
  ) => Promise<ExcludeState>;
  /**
   * HOW MANY RESULTS THIS CREATOR HAS LOGGED (audit P6-R6, register item 8):
   * the page's scoped `respinDb.countResults` read, or `null` when that read
   * failed. It selects which sentence `resultsBasisSentence` says; `null`
   * says the count could not be read and never falls back to "none".
   */
  resultCount: number | null;
  /**
   * Launch L3 (R-152): "Remember this for future drafts" — writes a PROPOSED
   * Kill Test version, never an active one.
   */
  rememberAction: (
    prev: RememberState,
    formData: FormData
  ) => Promise<RememberState>;
  /** The per-field ceiling the creator-edit path enforces, from `@respin/db`. */
  rememberValueMax: number;
  /**
   * Whether this seat may propose a brain edit: the page's resolved
   * `scope.role === "owner"` (R-118). Editors and viewers are told why instead
   * of being offered a press the server refuses (L3 gate, T-L3).
   */
  rememberAllowed: boolean;
  /**
   * Every mode Studio offers, with its label, whether this workspace may
   * press it, and what it costs — RESOLVED SERVER-SIDE from
   * `studioModeOffers(tier)` (every mode but the ones that run only from
   * /trends) and the active config. This screen holds no mode list of its own; see
   * `./copy.ts` for why a screen-side tier→mode map is refused.
   */
  modes: readonly ModeChoiceView[];
  /** What a press will spend, in words — computed server-side from config. */
  costSentence: string;
  /** What a REVISION will spend (R8) — `creditCosts.revision`, not the mode's. */
  revisionCostSentence: string;
  /**
   * The same number, so the per-selection line can say what THIS press costs.
   *
   * IT IS A SEPARATE PROP RATHER THAN A PARSE OF THE SENTENCE, and it exists
   * because of a real defect in this file's first draft: with a parent chosen,
   * the price beside the picker still showed the MODE's cost while the press
   * was going to be charged at `creditCosts.revision`. On a 12-credit script
   * revised for 2 that is a money lie on the control that spends it.
   */
  revisionCost: number | null;
  /**
   * R-148: the creative form choices, "Choose for me" first, and the two
   * who-films values — both RESOLVED SERVER-SIDE from the credits facade, so
   * this file holds no form vocabulary. Offered only beside a mode whose
   * `takesCreativeForm` the server set; the operation refuses anything else.
   */
  formOptions: readonly FormOptionView[];
  peopleOptions: readonly FormOptionView[];
  /** The bounds `parseCreativeRequest` enforces, advertised on the inputs. */
  creativeBounds: CreativeBoundsView;
  /** The closed reaction vocabulary, from the database's own enum. */
  reactions: readonly string[];
  /** The note ceiling, stated where it binds. */
  noteMax: number;
  /** Why the control is unavailable, if it is. Role, pause, or no brain. */
  block: { reason: string } | null;
  /** Confirmed brain document kinds, or null when that courtesy read failed. */
  activeKinds: readonly ActiveBrainKind[] | null;
  brainHref: string;
  usageHref: string;
  frameworksHref: string;
  /** @internal Static-render fixture state; no app call site passes this. */
  initialState?: StudioActionState;
  refusalCopy: RefusalCopyByCode;
  fallbackCopy: { title: string; detail: string };
};

/**
 * The form choice and the optional filming limits (R-148).
 *
 * UNCONTROLLED INPUTS, read by the action from the form's own data — there is
 * nothing here for client state to decide. Every input has a visible label;
 * the two choice groups are fieldsets with legends, so a screen reader hears
 * the question before the options. The `max`/`maxLength` values are the
 * parse's own bounds, ADVERTISED, never relied on: a hand-built post goes
 * straight past them to `parseCreativeRequest`, which is the gate.
 */
export function CreativeFormControl({
  formOptions,
  peopleOptions,
  bounds,
  defaultForm,
  idPrefix = "studio",
}: {
  formOptions: readonly FormOptionView[];
  peopleOptions: readonly FormOptionView[];
  bounds: CreativeBoundsView;
  /**
   * Launch L2: the option checked first — a chosen concept's own resolved form
   * (L1: "developing a stored concept defaults to its stored resolved form").
   * Absent, or not one of the options, means the first option ("Choose for me").
   */
  defaultForm?: string | null;
  /** Prefix for the input ids, so two controls on one page never share one. */
  idPrefix?: string;
}) {
  const checkedForm = formOptions.some((o) => o.id === defaultForm)
    ? defaultForm
    : formOptions[0]?.id;
  // A comma-separated box carries up to `listMax` entries of
  // `itemMaxCodePoints` each, plus a separator.
  const listChars = bounds.listMax * (bounds.itemMaxCodePoints + 2);
  return (
    <fieldset data-testid="studio-form-control" style={{ marginBottom: "1rem" }}>
      <legend>{FORM_CONTROL_LEGEND}</legend>
      {formOptions.map((option) => (
        <label
          key={option.id}
          style={{ display: "block", minHeight: "44px", lineHeight: "44px" }}
        >
          <input
            type="radio"
            name="formChoice"
            value={option.id}
            defaultChecked={option.id === checkedForm}
            data-testid="studio-form-option"
          />{" "}
          {option.label}
        </label>
      ))}
      <p className="muted" data-testid="studio-form-help">
        {FORM_CONTROL_HELP}
      </p>
      {/*
        A FIELDSET, NOT A NATIVE FOLD: the limits are binding once filled in,
        so they stay on the page, and `tests/page-wiring.test.tsx` pins the
        panel's native folds at the one it already has.
      */}
      <fieldset data-testid="studio-filming-limits">
        <legend>{FILMING_LIMITS_SUMMARY}</legend>
        <p className="muted">{FILMING_LIMITS_HELP}</p>
        <fieldset>
          <legend>Who films it?</legend>
          <label style={{ display: "block", minHeight: "44px", lineHeight: "44px" }}>
            <input type="radio" name="people" value="" defaultChecked /> Not saying
          </label>
          {peopleOptions.map((option) => (
            <label
              key={option.id}
              style={{ display: "block", minHeight: "44px", lineHeight: "44px" }}
            >
              <input type="radio" name="people" value={option.id} /> {option.label}
            </label>
          ))}
        </fieldset>
        <p>
          <label htmlFor={`${idPrefix}-max-minutes`}>
            The most minutes you have to film it
          </label>
          <br />
          <input
            id={`${idPrefix}-max-minutes`}
            name="maxMinutes"
            type="number"
            inputMode="numeric"
            min={bounds.minutesMin}
            max={bounds.minutesMax}
            step={1}
            style={control}
          />
        </p>
        <p>
          <label htmlFor={`${idPrefix}-locations`}>
            Places you can film, separated by commas
          </label>
          <br />
          <input
            id={`${idPrefix}-locations`}
            name="locations"
            type="text"
            maxLength={listChars}
            style={{ ...control, width: "100%" }}
          />
        </p>
        <p>
          <label htmlFor={`${idPrefix}-equipment`}>
            Equipment you have, separated by commas
          </label>
          <br />
          <input
            id={`${idPrefix}-equipment`}
            name="equipment"
            type="text"
            maxLength={listChars}
            style={{ ...control, width: "100%" }}
          />
        </p>
        <p>
          <label htmlFor={`${idPrefix}-footage`}>Footage you already have</label>
          <br />
          <textarea
            id={`${idPrefix}-footage`}
            name="footage"
            rows={3}
            maxLength={bounds.footageMaxCodePoints}
            style={{ width: "100%", fontSize: "1rem" }}
          />
        </p>
      </fieldset>
    </fieldset>
  );
}

export function StudioPanel({
  action,
  held,
  inputLimitSentence,
  feedbackAction,
  excludeAction,
  resultCount,
  rememberAction,
  rememberValueMax,
  rememberAllowed,
  modes,
  costSentence,
  revisionCostSentence,
  revisionCost,
  formOptions,
  peopleOptions,
  creativeBounds,
  reactions,
  noteMax,
  block,
  activeKinds,
  brainHref,
  usageHref,
  frameworksHref,
  initialState,
  refusalCopy,
  fallbackCopy,
}: StudioPanelProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialState ?? IDLE_STUDIO_STATE
  );
  const [feedback, feedbackFormAction, feedbackPending] = useActionState(
    feedbackAction,
    IDLE_FEEDBACK_STATE
  );
  const [remembered, rememberFormAction, rememberPending] = useActionState(
    rememberAction,
    IDLE_REMEMBER_STATE
  );
  // Audit P6-A1: a no-op stand-in when no exclusion action is passed, so the
  // hook order never moves (the `resumed` pattern below).
  const [excludedState, excludeFormAction, excludePending] = useActionState(
    excludeAction ?? (async (prev: ExcludeState) => prev),
    IDLE_EXCLUDE_STATE
  );
  // Audit P3-A4: "Finish this draft" has its own state — its outcome is a
  // settled held draft (or a held refusal), rendered under the held list. A
  // no-op stand-in when there is no held list, so the hook order never moves.
  const [resumed, resumeFormAction, resumePending] = useActionState(
    held?.resumeAction ?? (async (prev: StudioActionState) => prev),
    IDLE_STUDIO_STATE
  );

  const offered = modes.filter((m) => m.status === "available");
  // THE DEFAULT IS THE FIRST MODE THE SERVER SAID IS AVAILABLE, never a literal:
  // a hard-coded default would be a mode id in this directory (which
  // `tests/studio-ui.test.tsx` forbids) and, worse, could name a mode this
  // workspace's plan excludes — offering a control whose only outcome is a
  // refusal.
  const [modeId, setModeId] = useState<string>(offered[0]?.id ?? "");
  // WHICH EARLIER OUTPUT THIS PRESS REVISES, or "" for an original. Only outputs
  // the server marked `revisable` are offered: an honest refusal stored no
  // draft, so offering it would be a button whose only outcome is a refusal.
  const [revisionOf, setRevisionOf] = useState<string>("");
  // THE POSITION IS THE ONE THE CHAIN PRINTS, not the position in the filtered
  // list — a defect this file's first draft had. `LineageList` numbers every
  // entry, refusals included, so a picker numbering only the revisable ones
  // offered "#2" for the output the chain calls "#3": two numbering systems for
  // one draft, on the control that decides which draft is revised.
  const revisable = state.lineage
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.revisable);
  const parent =
    revisable.find(({ entry }) => entry.attemptId === revisionOf)?.entry ?? null;
  // A REVISION STAYS IN ITS PARENT'S MODE (R6, `different_mode`). The control
  // reflects the rule rather than letting a creator compose a request the
  // server will certainly refuse; `resolveRevisionParent` is still the
  // authority and its refusal has copy.
  const effectiveModeId = parent === null ? modeId : parent.modeId;
  const effectiveMode = modes.find((m) => m.id === effectiveModeId) ?? null;
  const feedbackTargetId =
    state.latest.status === "usable" || state.latest.status === "honest_refusal"
      ? state.latest.generationId
      : null;
  // "LEAVE THIS OUT" ONLY WHERE IT DOES SOMETHING (Phase 6 gate, LOW): recent
  // work is read only by the modes that take the creative form control
  // (R-152 (b)), so a reaction to a hook set or a caption never reaches a
  // later prompt and a control promising to keep it out would be a no-op. The
  // flag is the server's own `takesCreativeForm` for the run's mode.
  const latestModeId =
    state.latest.status === "usable" || state.latest.status === "honest_refusal"
      ? state.latest.modeId
      : null;
  const latestReadsHistory =
    latestModeId !== null &&
    modes.some((m) => m.id === latestModeId && m.takesCreativeForm === true);

  // WHAT THIS PRESS COSTS, which is NOT the selected mode's price when a parent
  // is chosen: R8 prices a revision as `creditCosts.revision` whatever it
  // revises. Computed here rather than inline so the branch is one expression a
  // reader can check against the rule, and so a test can drive every arm.
  const priceLine = priceLineFor({
    isRevision: parent !== null,
    revisionCost,
    mode: effectiveMode,
    parentModeLabel: parent?.modeLabel ?? null,
  });

  return (
    <div data-testid="studio-panel">
      <details>
        <summary>How this works and what it costs</summary>
        <p className="muted" data-testid="studio-intro">
          Every draft is written from the brain you confirmed and activated for
          this creator on the <a href={brainHref}>brain page</a>, plus what you
          type in below, plus the frameworks this creator can draw on — the
          shared library and any of your own, on the{" "}
          <a href={frameworksHref}>frameworks page</a>. Every charge appears in
          your credit history on the <a href={usageHref}>usage page</a>.
        </p>
        <p className="muted" data-testid="studio-revision-cost">
          {revisionCostSentence}
        </p>
      </details>
      <p className="muted" data-testid="studio-in-force">
        {inForceSentence(activeKinds)}
      </p>
      <p className="muted" data-testid="studio-mode-note">
        {modeAvailabilityNote(modes)}
      </p>
      {/* R18's price, stated BEFORE the press (the `runCostSentence` rule). */}
      <p className="muted" data-testid="studio-cost">
        {costSentence}
      </p>
      {/* R21's results sentence, now TWO-BRANCH on the creator's own scoped
          count and naming the recent-work channel for the modes that read it
          (audit P6-R6, R-174). It sits above the control, not under the
          result: the claim it forecloses is one a reader would otherwise form
          while deciding to press. */}
      <p className="muted" data-testid="studio-no-results-basis">
        {resultsBasisSentence(
          resultCount,
          modes.filter((m) => m.takesCreativeForm === true).map((m) => m.label)
        )}
      </p>
      <p className="muted" data-testid="studio-no-stream">
        {NO_STREAM_NOTE}
      </p>

      {/*
        THE LIVE REGION IS ALWAYS PRESENT AND STARTS EMPTY — the half the
        onboarding control got wrong first time. A region that MOUNTS already
        populated is announced inconsistently; one that is present at load and
        then CHANGES is the reliable half of the pattern.

        WHAT IT SAYS WHEN IT IS BUSY IS R16's WHOLE POINT: "being prepared", not
        "writing", not a percentage, not an animated placeholder filling in.
        Anything that suggested text was arriving would be a claim that a stream
        exists, and none does.
      */}
      <p
        role="status"
        aria-live="polite"
        data-testid="studio-status"
        className="muted"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {isPending ? PREPARING_LABEL : ""}
      </p>

      {block ? (
        <p className="muted" data-testid="studio-blocked">
          {block.reason}
        </p>
      ) : offered.length === 0 ? (
        // A NAMED STATE RATHER THAN AN EMPTY PICKER. A plan with no built,
        // included mode is not a bug the creator caused, and `modeAvailability
        // Note` above has already said which modes exist and why each is not
        // offered — so what belongs here is the absence of a control, stated.
        <p className="muted" data-testid="studio-no-modes">
          There is no mode this workspace can run here yet, so there is no
          control to offer. Nothing above is hidden from you: the note at the
          top of this panel lists every mode this product has and says, for each
          one, whether it is outside this plan or not built yet.
        </p>
      ) : (
        <form action={formAction}>
          {/*
            THE MODE IS A CHOICE NOW (slice 7, R1), and every option was
            resolved server-side by `studioModeOffers(tier)` — this file holds no mode
            id and no tier map. It is still untrusted input on the wire:
            `modeSpec` refuses a string that is not a mode and
            `assertModeAllowed` refuses one this plan does not include or one we
            have not built, all before any vendor is contacted. This control is
            the convenience; those three are the gate.
          */}
          <p>
            <label htmlFor="studio-mode">What do you want to make?</label>
            <br />
            <select
              id="studio-mode"
              name="mode"
              value={effectiveModeId}
              onChange={(e) => setModeId(e.target.value)}
              disabled={parent !== null}
              style={control}
            >
              {offered.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {/*
              A DISABLED CONTROL SUBMITS NOTHING, and this hidden field is the
              fix for a defect the first draft of this file shipped: with a
              parent chosen the `<select>` above is disabled — because a
              revision stays in its parent's mode — and HTML bars a disabled
              control from submission entirely, so `mode` arrived at the action
              as `""` and EVERY revision was refused with `UnknownModeError`.
              The whole revision path was dead, and nothing typed would have
              said so: `mode` is cast at the action boundary on purpose (the
              set of modes lives in a package `app/**` may not import).
            */}
            {parent !== null ? (
              <input type="hidden" name="mode" value={parent.modeId} />
            ) : null}
            <br />
            <span className="muted" data-testid="studio-selected-cost">
              {priceLine}
            </span>
            {parent !== null ? (
              <>
                <br />
                <span className="muted" data-testid="studio-revision-mode-locked">
                  {REVISION_SAME_MODE_NOTE}
                </span>
              </>
            ) : null}
          </p>

          {/*
            R6/R8/R9 — REVISE AN EARLIER OUTPUT. The value is an ATTEMPT id, and
            the server resolves it through the profile's own scoped capability;
            nothing here checks ownership, because the cage already does and a
            second check in `app/**` would be a second answer.
          */}
          {revisable.length > 0 ? (
            <p>
              <label htmlFor="studio-revision-of">Revise an earlier draft</label>
              <br />
              <select
                id="studio-revision-of"
                name="revisionOf"
                value={revisionOf}
                onChange={(e) => setRevisionOf(e.target.value)}
                style={control}
                data-testid="studio-revision-picker"
              >
                <option value="">
                  Start a new draft (not a revision of anything)
                </option>
                {revisable.map(({ entry, index }) => (
                  <option key={entry.attemptId} value={entry.attemptId}>
                    {lineageChoiceLabel(index, entry.modeLabel, entry.note)}
                  </option>
                ))}
              </select>
              <br />
              <span className="muted" data-testid="studio-revision-help">
                {REVISION_NOTE_HELP}
              </span>
            </p>
          ) : (
            // The hidden field keeps the form's shape constant, so the action
            // reads one name whether or not there is anything to revise.
            <input type="hidden" name="revisionOf" value="" />
          )}

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
              Pick the platform you will post this draft on.
            </span>
          </p>
          {/*
            R-148 — THE CREATIVE FORM CONTROL, beside the two modes the server
            marked `takesCreativeForm` and nowhere else. Its absence from the
            form IS the "no creative request" answer the action reads, so a
            mode without the control can never send one by accident.

            A REVISION DOES NOT OFFER IT: the operation keeps a v2 parent's
            form and limits and keeps a legacy parent legacy, and the note
            says so rather than presenting a control the server would
            override or refuse.
          */}
          {effectiveMode?.takesCreativeForm && parent === null ? (
            <CreativeFormControl
              formOptions={formOptions}
              peopleOptions={peopleOptions}
              bounds={creativeBounds}
            />
          ) : null}
          {effectiveMode?.takesCreativeForm && parent !== null ? (
            <p className="muted" data-testid="studio-revision-keeps-form">
              {REVISION_KEEPS_FORM_NOTE}
            </p>
          ) : null}
          {/*
            LAUNCH L3 (R-152 item c) — THE SEQUEL REQUEST, beside the two modes
            that read recent work and nowhere else (the operation refuses one on
            any other mode). UNCHECKED BY DEFAULT and never set for the creator:
            a sequel is something they ask for, not something inferred.
          */}
          {effectiveMode?.takesCreativeForm ? <SequelControl idPrefix="studio" /> : null}
          <p>
            <label htmlFor="studio-input">
              {parent === null
                ? "What is this about? An idea, an angle, a reference you want to start from."
                : "What should change? This note is sent with the draft you picked above."}
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
            {inputLimitSentence !== undefined ? (
              <>
                <br />
                <span className="muted" data-testid="studio-input-limit">
                  {inputLimitSentence}
                </span>
              </>
            ) : null}
          </p>
          {/*
            THE PENDING LABEL NAMES WHAT IS IN FLIGHT AND CLAIMS NO VENDOR CALL,
            for the reason the onboarding control records: a dozen refusal paths
            never contact the model at all, and a label asserting a call we may
            not have made is a false sentence on a money control.
            `PREPARING_LABEL` is true on every path — and it is deliberately not
            "writing your draft", which would imply a stream this slice does not
            have (R16).
          */}
          <SubmitButton
            className={buttonClass("primary")}
            style={control}
            pendingLabel={PREPARING_LABEL}
          >
            {/*
              THE LABEL NAMES WHAT IT PRODUCES. It says "draft" and "revision"
              because that is what it does — R21 is exactly the point at which
              `/studio` is allowed to say those words, and a vaguer label on the
              control that spends a credit would be worse, not safer.
            */}
            {parent === null ? "Make a draft" : "Revise that draft"}
          </SubmitButton>
        </form>
      )}

      <GenerationOutcome
        state={state.latest}
        refusalCopy={refusalCopy}
        fallbackCopy={fallbackCopy}
      />

      {held !== undefined ? (
        <HeldDrafts
          drafts={held.drafts}
          formAction={resumeFormAction}
          pending={resumePending}
        />
      ) : null}
      {held !== undefined ? (
        <GenerationOutcome
          state={resumed.latest}
          refusalCopy={refusalCopy}
          fallbackCopy={fallbackCopy}
        />
      ) : null}

      {/*
        R9 — THE LINEAGE, READABLE. Which output came from which, and what the
        note said. It is a PURE component (`./lineage-view.tsx`) rather than
        markup inlined here, for the reason that file's header records: this
        module's state comes from `useActionState`, which yields only its
        INITIAL value under a static render, so a chain rendered here would be a
        state no test could drive.
      */}
      <LineageList lineage={state.lineage} />

      {/*
        R10/R12 — FEEDBACK, offered on a finished run and on nothing else:
        `generationId` is what the composite foreign key needs, and a control
        with no target would post an empty id and earn a refusal. PURE for the
        same reason the chain above is.
      */}
      {feedbackTargetId !== null ? (
        <FeedbackBlock
          generationId={feedbackTargetId}
          reactions={reactions}
          noteMax={noteMax}
          formAction={feedbackFormAction}
          pending={feedbackPending}
          state={feedback}
          refusalCopy={refusalCopy}
          fallbackCopy={fallbackCopy}
          exclude={
            excludeAction === undefined || !latestReadsHistory
              ? undefined
              : { formAction: excludeFormAction, pending: excludePending, state: excludedState }
          }
        />
      ) : null}
      {/*
        LAUNCH L3 (R-152 item a) — "REMEMBER THIS FOR FUTURE DRAFTS", beside the
        reaction and separate from it: the reaction stays local evidence about
        one draft, this box is the creator writing a rule, which becomes a
        PROPOSED brain edit they still confirm and activate on the Brain page.
      */}
      {feedbackTargetId !== null ? (
        <RememberBlock
          canPropose={rememberAllowed}
          brainHref={brainHref}
          valueMax={rememberValueMax}
          formAction={rememberFormAction}
          pending={rememberPending}
          state={remembered}
          refusalCopy={refusalCopy}
          fallbackCopy={fallbackCopy}
        />
      ) : null}
    </div>
  );
}

/**
 * LAUNCH L3 (R-152 item c) — THE SEQUEL REQUEST, one control for every form
 * whose mode reads recent work: the main Studio form (beside those modes only),
 * and — launch L4, the L3 card's BN-2 — "Find concepts" and the piece's script
 * confirmation, whose modes always read it. UNCHECKED BY DEFAULT and never set
 * for the creator; the actions read only its own value, `"1"`. `idPrefix`
 * keeps the help text's id unique when several forms share the page.
 */
/**
 * HELD DRAFTS (audit P3-A4, R-157): each with the time it is removed and a
 * "Finish this draft" control that posts ITS attempt id — never a resubmission
 * of generate params. PURE, so a static render can drive every branch: a
 * failed read says so, an empty list renders nothing.
 */
export function HeldDrafts({
  drafts,
  formAction,
  pending,
}: {
  drafts: readonly HeldDraftLine[] | null;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  if (drafts !== null && drafts.length === 0) return null;
  return (
    <div className="panel" data-testid="studio-held-drafts" style={{ marginTop: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>{HELD_DRAFTS_HEADING}</h3>
      {drafts === null ? (
        <p className="muted" data-testid="studio-held-unavailable">
          {HELD_DRAFTS_UNAVAILABLE}
        </p>
      ) : (
        <>
          <p className="muted">{HELD_DRAFTS_NOTE}</p>
          <ul>
            {drafts.map((draft) => (
              <li key={draft.attemptId} data-testid="studio-held-draft">
                <form action={formAction}>
                  <input type="hidden" name="heldAttemptId" value={draft.attemptId} />
                  <span>
                    {draft.modeLabel} — held until {heldUntilText(draft.heldUntil)}.{" "}
                  </span>
                  <button type="submit" className={buttonClass("secondary")} disabled={pending}>
                    {FINISH_HELD_DRAFT_LABEL}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function SequelControl({ idPrefix }: { idPrefix: string }) {
  const helpId = `${idPrefix}-sequel-help`;
  return (
    <p>
      <label style={{ display: "block", minHeight: "44px", lineHeight: "44px" }}>
        <input
          type="checkbox"
          name="sequel"
          value="1"
          aria-describedby={helpId}
          data-testid={`${idPrefix}-sequel`}
        />{" "}
        {SEQUEL_LABEL}
      </label>
      <span className="muted" id={helpId}>
        {SEQUEL_HELP}
      </span>
    </p>
  );
}
