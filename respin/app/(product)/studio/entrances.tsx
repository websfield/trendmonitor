"use client";

// THE STUDIO'S ENTRANCES (launch L2, R-151): "Find my next concept", "Develop
// an idea I already have" and the standalone reference breakdown — above the
// existing panel, which stays reachable for every other mode.
//
// EVERYTHING HERE IS A FORM, AND NOTHING HERE DECIDES. "Find my next concept"
// is one generation through `findConceptAction` (every gate `generate` runs);
// choosing one of its concepts and stating your own idea are ZERO-COST server
// actions that store a creative piece and redirect to its own page, where the
// script's configured price is shown before anything is written. The server
// resolves each concept from the STORED output by the attempt id and position
// the buttons post — no concept text is sent back.
//
// THE RESULT REUSES `GenerationOutcome`, so a concept batch renders exactly as
// the panel renders one — the L1 blocks (the event confirmation item, the
// unconfirmed filming items) included, and never inside a fold: this file
// renders no native fold element (`tests/page-wiring.test.tsx` pins the count).
import { useActionState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import { GenerationOutcome } from "./generation-outcome";
import { CreativeFormControl, SequelControl, type RefusalCopyByCode } from "./studio-panel";
import {
  CHOOSE_CONCEPT_HEADING,
  CHOOSE_CONCEPT_HELP,
  DEVELOP_IDEA_HEADING,
  DEVELOP_IDEA_HELP,
  DEVELOP_IDEA_LABEL,
  DEVELOP_IDEA_SUBMIT,
  FIND_CONCEPT_DONE_STATUS,
  FIND_CONCEPT_HEADING,
  FIND_CONCEPT_HELP,
  FIND_CONCEPT_HINT_LABEL,
  FIND_CONCEPT_QUESTION,
  FIND_CONCEPT_SUBMIT,
  PLATFORM_OPTIONS,
  PREPARING_LABEL,
  REFERENCE_ENTRANCE_BLOCKED,
  REFERENCE_ENTRANCE_HEADING,
  REFERENCE_ENTRANCE_HELP,
  REFERENCE_ENTRANCE_UNKNOWN,
  chooseConceptLabel,
  findConceptCostSentence,
  type CreativeBoundsView,
  type FormOptionView,
  type ModeChoiceView,
} from "./run-copy";
import { IDLE_STUDIO_STATE, type StudioActionState } from "./run-state";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

export type StudioEntrancesProps = {
  findConceptAction: (prev: StudioActionState, formData: FormData) => Promise<StudioActionState>;
  selectConceptAction: (formData: FormData) => Promise<void>;
  startOwnIdeaAction: (formData: FormData) => Promise<void>;
  /**
   * Whether the confirmed brain already says what the creator makes — the
   * server's deterministic rule. `false` asks the one question up front;
   * `null` (the courtesy read failed) leaves the hint optional and lets the
   * server's own refusal ask it.
   */
  conceptReady: boolean | null;
  /**
   * The server-resolved offer for the mode "Find concepts" runs — the SAME
   * `modes` entry the panel prices — or `null` when it was not found. Its
   * price is stated beside the press (L2 billing gate, B-5).
   */
  findConceptOffer: ModeChoiceView | null;
  formOptions: readonly FormOptionView[];
  peopleOptions: readonly FormOptionView[];
  creativeBounds: CreativeBoundsView;
  ownIdeaMax: number;
  /**
   * The standalone reference breakdown, in THREE states (L2 compliance gate,
   * A-3): in the plan, not in the plan, or unknown (the read failed — neutral
   * copy and the link, never the plan block).
   */
  reference:
    | { status: "available"; href: string }
    | { status: "not_in_plan" }
    | { status: "unknown"; href: string };
  /** Why nothing can be started (role, pause, no brain), if so. */
  block: { reason: string } | null;
  refusalCopy: RefusalCopyByCode;
  fallbackCopy: { title: string; detail: string };
  /** @internal Static-render fixture state for the concept batch; no app call site passes this. */
  conceptState?: StudioActionState;
};

export function StudioEntrances({
  findConceptAction,
  selectConceptAction,
  startOwnIdeaAction,
  conceptReady,
  findConceptOffer,
  formOptions,
  peopleOptions,
  creativeBounds,
  ownIdeaMax,
  reference,
  block,
  refusalCopy,
  fallbackCopy,
  conceptState,
}: StudioEntrancesProps) {
  const [state, formAction, isPending] = useActionState(
    findConceptAction,
    conceptState ?? IDLE_STUDIO_STATE
  );
  const latestEntry = state.lineage[state.lineage.length - 1] ?? null;
  const concepts =
    state.latest.status === "usable" && latestEntry !== null
      ? (state.latest.document.ideas ?? [])
      : [];
  // WCAG 3.3.1: the one refusal that is about the hint box points the box at
  // its explanation.
  const hintRefused =
    state.latest.status === "refused" && state.latest.code === "concept_context_needed";

  return (
    <div data-testid="studio-entrances">
      <section aria-labelledby="studio-find-concept-heading" data-testid="studio-entrance-find">
        <h3 id="studio-find-concept-heading">{FIND_CONCEPT_HEADING}</h3>
        <p className="muted">{FIND_CONCEPT_HELP}</p>
        <p
          role="status"
          aria-live="polite"
          className="muted"
          data-testid="studio-find-status"
          style={{ minHeight: "1.2em", margin: 0 }}
        >
          {isPending ? PREPARING_LABEL : concepts.length > 0 ? FIND_CONCEPT_DONE_STATUS : ""}
        </p>
        {block ? (
          <p className="muted" data-testid="studio-entrance-blocked">
            {block.reason}
          </p>
        ) : (
          <form action={formAction} data-testid="studio-find-form">
            <p>
              <label htmlFor="studio-find-platform">Platform</label>
              <br />
              <select
                id="studio-find-platform"
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
              <label htmlFor="studio-find-hint">
                {conceptReady === false ? FIND_CONCEPT_QUESTION : FIND_CONCEPT_HINT_LABEL}
              </label>
              <br />
              <textarea
                id="studio-find-hint"
                name="hint"
                rows={2}
                required={conceptReady === false}
                aria-required={conceptReady === false}
                {...(hintRefused
                  ? { "aria-invalid": true, "aria-describedby": "studio-find-refusal" }
                  : {})}
                data-testid="studio-find-hint"
                style={{ width: "100%", fontSize: "1rem" }}
              />
            </p>
            <CreativeFormControl
              formOptions={formOptions}
              peopleOptions={peopleOptions}
              bounds={creativeBounds}
              idPrefix="studio-find"
            />
            {/* Launch L4 (BN-2): "find concepts" reads recent work, so it takes the sequel request too. */}
            <SequelControl idPrefix="studio-find" />
            <p className="muted" id="studio-find-cost" data-testid="studio-find-cost">
              {findConceptCostSentence(findConceptOffer)}
            </p>
            <SubmitButton
              className={buttonClass("primary")}
              style={control}
              pendingLabel={PREPARING_LABEL}
              ariaDescribedBy="studio-find-cost"
            >
              {FIND_CONCEPT_SUBMIT}
            </SubmitButton>
          </form>
        )}
        <GenerationOutcome
          state={state.latest}
          refusalCopy={refusalCopy}
          fallbackCopy={fallbackCopy}
          refusalId="studio-find-refusal"
        />
        {concepts.length > 0 && latestEntry !== null ? (
          <div data-testid="studio-choose-concepts">
            <h4>{CHOOSE_CONCEPT_HEADING}</h4>
            <p className="muted" id="studio-choose-help">{CHOOSE_CONCEPT_HELP}</p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {concepts.map((idea, index) => (
                <li key={index} style={{ marginBottom: "0.5rem" }}>
                  <form action={selectConceptAction}>
                    <input type="hidden" name="sourceAttemptId" value={latestEntry.attemptId} />
                    <input type="hidden" name="ideaIndex" value={String(index)} />
                    <SubmitButton
                      className={buttonClass("secondary")}
                      style={control}
                      pendingLabel="Choosing…"
                      ariaDescribedBy="studio-choose-help"
                    >
                      <span data-testid="studio-choose-concept">
                        {chooseConceptLabel(index, idea.hook)}
                      </span>
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="studio-develop-heading" data-testid="studio-entrance-develop">
        <h3 id="studio-develop-heading">{DEVELOP_IDEA_HEADING}</h3>
        {block ? null : (
          <form action={startOwnIdeaAction} data-testid="studio-develop-form">
            <p>
              <label htmlFor="studio-own-idea">{DEVELOP_IDEA_LABEL}</label>
              <br />
              <textarea
                id="studio-own-idea"
                name="idea"
                rows={3}
                required
                aria-required
                maxLength={ownIdeaMax}
                style={{ width: "100%", fontSize: "1rem" }}
              />
              <br />
              <span className="muted" id="studio-develop-help">{DEVELOP_IDEA_HELP}</span>
            </p>
            <SubmitButton
              className={buttonClass("primary")}
              style={control}
              pendingLabel="Saving your idea…"
              ariaDescribedBy="studio-develop-help"
            >
              {DEVELOP_IDEA_SUBMIT}
            </SubmitButton>
          </form>
        )}
      </section>

      <section aria-labelledby="studio-reference-heading" data-testid="studio-entrance-reference">
        <h3 id="studio-reference-heading">{REFERENCE_ENTRANCE_HEADING}</h3>
        {reference.status === "available" ? (
          <p>
            {REFERENCE_ENTRANCE_HELP} <a href={reference.href}>Go to trends</a>
          </p>
        ) : reference.status === "unknown" ? (
          <p data-testid="studio-entrance-reference-unknown">
            {REFERENCE_ENTRANCE_UNKNOWN} <a href={reference.href}>Go to trends</a>
          </p>
        ) : (
          <p className="muted" data-testid="studio-entrance-reference-blocked">
            {REFERENCE_ENTRANCE_BLOCKED}
          </p>
        )}
      </section>
    </div>
  );
}
