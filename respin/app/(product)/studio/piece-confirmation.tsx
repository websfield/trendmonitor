"use client";

// THE CONFIRMATION (launch L2, R-151): a chosen piece, its configured script
// price, the operation id it will be commissioned under, and the one paid
// press.
//
// WHAT SURVIVES A RELOAD, AND WHY. Every value here is read from the database
// by the page (`/studio?piece=<id>`): the piece, the concept it names, the
// quote's config version and the SERVER-MINTED operation id — rendered on the
// root as `data-operation-id` and sent back as a hidden field. A duplicate
// submit, a refresh and a retry after a lost response therefore send the same
// id, and the server returns the stored script instead of charging again.
// "New generation" is the only control that yields another id.
//
// ON A PLAN WITHOUT SCRIPTS the price is still shown and the named plan block
// replaces the paid press: nothing is charged and no model is called. The
// result reuses `GenerationOutcome`, so the L1 blocks render as they do in the
// panel and never inside a fold (this file renders no native fold element).
import { useActionState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import { GenerationOutcome } from "./generation-outcome";
import { CreativeFormControl, SequelControl, type RefusalCopyByCode } from "./studio-panel";
import { useFocusOnChange } from "./focus";
import {
  PIECE_CANCEL_HELP,
  PIECE_CANCEL_LABEL,
  PIECE_COMMISSION_SUBMIT,
  PIECE_CONCEPT_LABEL,
  PIECE_HEADING,
  PIECE_NEW_GENERATION_HELP,
  PIECE_NEW_GENERATION_LABEL,
  PIECE_NOTE_LABEL,
  PIECE_OPERATION_NOTE,
  PIECE_OWN_IDEA_LABEL,
  PIECE_PLAN_BLOCK,
  PIECE_SCRIPT_DONE_STATUS,
  PLATFORM_OPTIONS,
  PREPARING_LABEL,
  pieceQuoteSentence,
  pieceStateSentence,
  type CreativeBoundsView,
  type FormOptionView,
} from "./run-copy";
import { IDLE_STUDIO_STATE, type StudioActionState } from "./run-state";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

/** The piece as the page projected it — plain values only. */
export type PieceView = {
  pieceId: string;
  version: number;
  state: "selected" | "scripted" | "cancelled";
  operationAttemptId: string;
  origin:
    | {
        kind: "concept";
        hook: string;
        thesis: string;
        framework: string;
        formLabel: string | null;
        formId: string | null;
        premise: { whatHappens: string; interest: string; payoff: string } | null;
      }
    | { kind: "own_idea"; idea: string };
  quote: { credits: number | null; configVersion: number; planIncludesScript: boolean };
};

export type PieceConfirmationProps = {
  piece: PieceView;
  commissionAction: (prev: StudioActionState, formData: FormData) => Promise<StudioActionState>;
  newGenerationAction: (formData: FormData) => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
  formOptions: readonly FormOptionView[];
  peopleOptions: readonly FormOptionView[];
  creativeBounds: CreativeBoundsView;
  /** Why nothing can be started (role, pause, no brain), if so. */
  block: { reason: string } | null;
  refusalCopy: RefusalCopyByCode;
  fallbackCopy: { title: string; detail: string };
  /** @internal Static-render fixture state; no app call site passes this. */
  commissionState?: StudioActionState;
};

export function PieceConfirmation({
  piece,
  commissionAction,
  newGenerationAction,
  cancelAction,
  formOptions,
  peopleOptions,
  creativeBounds,
  block,
  refusalCopy,
  fallbackCopy,
  commissionState,
}: PieceConfirmationProps) {
  const [state, formAction, isPending] = useActionState(
    commissionAction,
    commissionState ?? IDLE_STUDIO_STATE
  );
  const open = piece.state !== "cancelled";
  const canCommission = open && piece.quote.planIncludesScript && block === null;
  // WCAG 2.4.3: choosing and "New generation" redirect here, so the heading
  // takes focus on mount and whenever the piece or its version changes.
  const headingRef = useFocusOnChange<HTMLHeadingElement>(`${piece.pieceId}:${piece.version}`);

  return (
    <section
      className="panel"
      aria-labelledby="studio-piece-heading"
      data-testid="studio-piece-confirmation"
      data-operation-id={piece.operationAttemptId}
      data-piece-state={piece.state}
    >
      <h2 id="studio-piece-heading" ref={headingRef} tabIndex={-1} style={{ marginTop: 0 }}>
        {PIECE_HEADING}
      </h2>
      {piece.origin.kind === "concept" ? (
        <div data-testid="studio-piece-concept">
          <h3>{PIECE_CONCEPT_LABEL}</h3>
          <p>
            <strong>{piece.origin.hook}</strong>
          </p>
          <p>{piece.origin.thesis}</p>
          {piece.origin.formLabel !== null ? (
            <p className="muted">Form: {piece.origin.formLabel}</p>
          ) : null}
          {piece.origin.premise !== null ? (
            <dl>
              <dt>What happens</dt>
              <dd>{piece.origin.premise.whatHappens}</dd>
              <dt>Why it is interesting</dt>
              <dd>{piece.origin.premise.interest}</dd>
              <dt>The payoff</dt>
              <dd>{piece.origin.premise.payoff}</dd>
            </dl>
          ) : null}
        </div>
      ) : (
        <div data-testid="studio-piece-own-idea">
          <h3>{PIECE_OWN_IDEA_LABEL}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{piece.origin.idea}</p>
        </div>
      )}
      <p className="muted" data-testid="studio-piece-state">
        {pieceStateSentence(piece.state)}
      </p>
      <p id="studio-piece-quote" data-testid="studio-piece-quote">
        {pieceQuoteSentence(piece.quote.credits, piece.quote.configVersion)}
      </p>
      {block !== null ? (
        <p className="muted" data-testid="studio-piece-blocked">
          {block.reason}
        </p>
      ) : null}
      {open && !piece.quote.planIncludesScript ? (
        <p className="muted" role="note" data-testid="studio-piece-plan-block">
          {PIECE_PLAN_BLOCK}
        </p>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className="muted"
        data-testid="studio-piece-status"
        style={{ minHeight: "1.2em", margin: 0 }}
      >
        {isPending
          ? PREPARING_LABEL
          : state.latest.status === "usable"
            ? PIECE_SCRIPT_DONE_STATUS
            : ""}
      </p>

      {canCommission ? (
        <form action={formAction} data-testid="studio-piece-commission">
          <input type="hidden" name="operationId" value={piece.operationAttemptId} />
          <p>
            <label htmlFor="studio-piece-platform">Platform</label>
            <br />
            <select
              id="studio-piece-platform"
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
          <CreativeFormControl
            formOptions={formOptions}
            peopleOptions={peopleOptions}
            bounds={creativeBounds}
            defaultForm={piece.origin.kind === "concept" ? piece.origin.formId : null}
            idPrefix="studio-piece"
          />
          {/* Launch L4 (BN-2): a piece's script reads recent work, so it takes the sequel request too. */}
          <SequelControl idPrefix="studio-piece" />
          <p>
            <label htmlFor="studio-piece-note">{PIECE_NOTE_LABEL}</label>
            <br />
            <textarea
              id="studio-piece-note"
              name="input"
              rows={2}
              style={{ width: "100%", fontSize: "1rem" }}
            />
          </p>
          <p className="muted" id="studio-piece-operation-note" data-testid="studio-piece-operation-note">
            {PIECE_OPERATION_NOTE}
          </p>
          <SubmitButton
            className={buttonClass("primary")}
            style={control}
            pendingLabel={PREPARING_LABEL}
            ariaDescribedBy="studio-piece-quote studio-piece-operation-note"
          >
            {PIECE_COMMISSION_SUBMIT}
          </SubmitButton>
        </form>
      ) : null}

      <GenerationOutcome
        state={state.latest}
        refusalCopy={refusalCopy}
        fallbackCopy={fallbackCopy}
      />

      {open && block === null ? (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
          {piece.quote.planIncludesScript ? (
            <form action={newGenerationAction} data-testid="studio-piece-new-generation">
              <input type="hidden" name="version" value={String(piece.version)} />
              <SubmitButton
                className={buttonClass("secondary")}
                style={control}
                pendingLabel="Starting a new generation…"
                ariaDescribedBy="studio-piece-new-generation-help"
              >
                {PIECE_NEW_GENERATION_LABEL}
              </SubmitButton>
              <br />
              <span className="muted" id="studio-piece-new-generation-help">
                {PIECE_NEW_GENERATION_HELP}
              </span>
            </form>
          ) : null}
          {piece.state === "selected" ? (
            <form action={cancelAction} data-testid="studio-piece-cancel">
              <input type="hidden" name="version" value={String(piece.version)} />
              <SubmitButton
                className={buttonClass("quiet")}
                style={control}
                pendingLabel="Cancelling…"
                ariaDescribedBy="studio-piece-cancel-help"
              >
                {PIECE_CANCEL_LABEL}
              </SubmitButton>
              <br />
              <span className="muted" id="studio-piece-cancel-help">
                {PIECE_CANCEL_HELP}
              </span>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
