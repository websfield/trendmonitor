"use client";

// The private-framework write controls (slice 7, R5c / REQ-D05).
//
// EVERY SENTENCE THIS FILE RENDERS COMES FROM `./form-copy.ts` and every bound
// from props — never from `./copy.ts`, which reaches `../../billing-errors` →
// `@respin/credits/app-server` → `pg`. `tests/client-bundle-boundary.test.ts`
// walks this file's import graph and fails on a hop into `@respin/*`.
//
// FOUR ACTIONS, ONE STATE. Create, edit, approve and retire are four different
// writes and each has its own form, but they share one `useActionState` slot
// per form kind — a creator who just retired a framework must not have that
// message replaced by an idle state when the create form re-renders, and the
// `act` field on `FrameworkActionState` is what tells them which write landed.
//
// THE VALIDATION IS NOT HERE, AND MUST NOT COME HERE. `maxLength` on an input
// is a courtesy that a POST bypasses; `prepareContent` in
// `packages/db/src/frameworks.ts` is the control — a strict parse, the bounds
// and the REQ-D04 mechanism-level scan, inside the transaction that writes the
// row. What this file owes is that the stated limit and the enforced one are
// the SAME NUMBER, which is why every bound arrives as a prop from `@respin/db`
// rather than as a literal typed here (the `POST_CONTENT_MAX` precedent).
import { useActionState } from "react";
import { buttonClass } from "../../../ui/button";
import { Field } from "../../../ui/field";
import { SubmitButton } from "../../onboarding/submit-button";
import {
  APPROVE_NOTE,
  EVIDENCE_NOTE,
  NO_PRIVATE_FRAMEWORKS,
  RETIRE_NOTE,
  frameworkCountNote,
  listLimitNote,
  nameLimitNote,
  textLimitNote,
} from "./form-copy";
import { FRAMEWORK_EVIDENCE_SLOTS } from "./form-state";
import { IDLE_FRAMEWORK_STATE, type FrameworkActionState } from "./view-state";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

type Action = (
  prev: FrameworkActionState,
  formData: FormData
) => Promise<FrameworkActionState>;

/** One framework as the curate controls need it — id, name, and its state. */
export type CuratableFramework = {
  id: string;
  name: string;
  version: number;
  approved: boolean;
  retired: boolean;
};

export type FrameworkPanelProps = {
  createAction: Action;
  editAction: Action;
  approveAction: Action;
  retireAction: Action;
  /** This creator's live frameworks — what approve/retire/edit can address. */
  frameworks: readonly CuratableFramework[];
  /** The closed goal vocabulary, from `@respin/db`. Never a list typed here. */
  goals: readonly string[];
  /** The closed niche vocabulary, same rule. */
  niches: readonly string[];
  nameMax: number;
  textMax: number;
  listMax: number;
  countMax: number;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
};

function Outcome({
  state,
  refusalCopy,
  fallbackCopy,
  testId,
}: {
  state: FrameworkActionState;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
  testId: string;
}) {
  if (state.status === "idle") return null;
  if (state.status === "refused") {
    // A code with no entry falls back to NEUTRAL copy, never to nothing — the
    // silent-nothing failure mode `../../onboarding/copy.ts` records. A refused
    // write that renders no explanation leaves the creator unable to tell a
    // refusal from a page that did nothing.
    const copy = refusalCopy[state.code] ?? fallbackCopy;
    return (
      <p role="alert" data-testid={`${testId}-refused`}>
        <strong>{copy.title}</strong> {copy.detail}
      </p>
    );
  }
  const verb =
    state.act === "created"
      ? "Written"
      : state.act === "edited"
        ? "A new version was written"
        : state.act === "approved"
          ? "Approved"
          : "Retired";
  return (
    <p role="status" data-testid={`${testId}-saved`}>
      {verb}: <strong>{state.name}</strong>, version {state.version}.{" "}
      {state.act === "created"
        ? "It is stored and it is not in use yet — approve it below when it is ready."
        : state.act === "edited"
          ? "The version you edited is kept, and so is this one; drafts built on the old one still name it."
          : state.act === "approved"
            ? "Your drafts may use it from now on."
            : "It is out of use and nothing was deleted."}
    </p>
  );
}

/**
 * The content fields, shared by the create form and the edit form.
 *
 * ONE COMPONENT FOR BOTH, because the two forms post the SAME field names to
 * the SAME pure parser (`frameworkContentFromForm`). Two copies of this markup
 * is how one form acquires a field the other does not have and the parser
 * silently reads `""` for it — a creator's edit dropping a section they never
 * touched.
 */
function ContentFields({
  idPrefix,
  goals,
  niches,
  nameMax,
  textMax,
  listMax,
}: {
  idPrefix: string;
  goals: readonly string[];
  niches: readonly string[];
  nameMax: number;
  textMax: number;
  listMax: number;
}) {
  return (
    <>
      <Field
        label="What is this move called?"
        htmlFor={`${idPrefix}-name`}
        limit={nameLimitNote(nameMax)}
        limitId={`${idPrefix}-name-limit`}
      >
        <input
          id={`${idPrefix}-name`}
          name="name"
          type="text"
          required
          maxLength={nameMax}
          aria-describedby={`${idPrefix}-name-limit`}
          style={{ ...control, width: "100%" }}
        />
      </Field>
      <Field
        label="The beats — what happens, in order"
        htmlFor={`${idPrefix}-beats`}
        limit={listLimitNote(listMax, "beats")}
        limitId={`${idPrefix}-beats-limit`}
      >
        <textarea
          id={`${idPrefix}-beats`}
          name="beats"
          rows={5}
          aria-describedby={`${idPrefix}-beats-limit`}
          style={{ width: "100%", fontSize: "1rem" }}
        />
      </Field>
      <Field
        label="Why it works"
        htmlFor={`${idPrefix}-why`}
        limit={textLimitNote(textMax)}
        limitId={`${idPrefix}-why-limit`}
      >
        <textarea
          id={`${idPrefix}-why`}
          name="whyItConverts"
          rows={4}
          maxLength={textMax}
          aria-describedby={`${idPrefix}-why-limit`}
          style={{ width: "100%", fontSize: "1rem" }}
        />
      </Field>
      <Field label="What it is for" htmlFor={`${idPrefix}-goal`}>
        <select
          id={`${idPrefix}-goal`}
          name="goal"
          style={control}
          defaultValue={goals[0]}
        >
          {goals.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Where it applies" htmlFor={`${idPrefix}-niche`}>
        <select
          id={`${idPrefix}-niche`}
          name="niche"
          style={control}
          defaultValue={niches[0]}
        >
          {niches.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="A note on where it applies"
        htmlFor={`${idPrefix}-applicability`}
        limit={textLimitNote(textMax)}
        limitId={`${idPrefix}-applicability-limit`}
      >
        <textarea
          id={`${idPrefix}-applicability`}
          name="applicabilityNote"
          rows={2}
          maxLength={textMax}
          aria-describedby={`${idPrefix}-applicability-limit`}
          style={{ width: "100%", fontSize: "1rem" }}
        />
      </Field>
      <Field
        label="When it does not work"
        htmlFor={`${idPrefix}-caveats`}
        limit={listLimitNote(listMax, "caveats")}
        limitId={`${idPrefix}-caveats-limit`}
      >
        <textarea
          id={`${idPrefix}-caveats`}
          name="testedCaveats"
          rows={3}
          aria-describedby={`${idPrefix}-caveats-limit`}
          style={{ width: "100%", fontSize: "1rem" }}
        />
      </Field>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>
          <strong>Times you have watched this work</strong>
        </legend>
        <p className="muted" data-testid="framework-evidence-note">
          {EVIDENCE_NOTE}
        </p>
        {Array.from({ length: FRAMEWORK_EVIDENCE_SLOTS }, (_, i) => (
          <div key={i}>
            <Field
              label={`Example ${i + 1} — which post or batch`}
              htmlFor={`${idPrefix}-evidence-ref-${i}`}
            >
              <input
                id={`${idPrefix}-evidence-ref-${i}`}
                name={`evidenceRef${i}`}
                type="text"
                maxLength={textMax}
                style={{ ...control, width: "100%" }}
              />
            </Field>
            <Field
              label={`Example ${i + 1} — what you saw the mechanism do`}
              htmlFor={`${idPrefix}-evidence-observation-${i}`}
            >
              <textarea
                id={`${idPrefix}-evidence-observation-${i}`}
                name={`evidenceObservation${i}`}
                rows={2}
                maxLength={textMax}
                style={{ width: "100%", fontSize: "1rem" }}
              />
            </Field>
          </div>
        ))}
      </fieldset>
    </>
  );
}

export function FrameworkPanel({
  createAction,
  editAction,
  approveAction,
  retireAction,
  frameworks,
  goals,
  niches,
  nameMax,
  textMax,
  listMax,
  countMax,
  refusalCopy,
  fallbackCopy,
}: FrameworkPanelProps) {
  const [createState, createFormAction] = useActionState(
    createAction,
    IDLE_FRAMEWORK_STATE
  );
  const [editState, editFormAction] = useActionState(
    editAction,
    IDLE_FRAMEWORK_STATE
  );
  const [curationState, curationFormAction] = useActionState(
    approveAction,
    IDLE_FRAMEWORK_STATE
  );
  const [retireState, retireFormAction] = useActionState(
    retireAction,
    IDLE_FRAMEWORK_STATE
  );

  const editable = frameworks.filter((f) => !f.retired);
  const approvable = editable.filter((f) => !f.approved);

  return (
    <div data-testid="framework-panel">
      {frameworks.length === 0 ? (
        <p className="muted" data-testid="frameworks-private-empty">
          {NO_PRIVATE_FRAMEWORKS}
        </p>
      ) : null}
      <p className="muted" data-testid="frameworks-count-note">
        {frameworkCountNote(countMax)}
      </p>

      <form action={createFormAction} data-testid="framework-create-form">
        <h3>Write a framework</h3>
        <ContentFields
          idPrefix="framework-create"
          goals={goals}
          niches={niches}
          nameMax={nameMax}
          textMax={textMax}
          listMax={listMax}
        />
        <SubmitButton
          className={buttonClass("primary")}
          style={control}
          pendingLabel="Storing it…"
        >
          Store this framework
        </SubmitButton>
      </form>
      <Outcome
        state={createState}
        refusalCopy={refusalCopy}
        fallbackCopy={fallbackCopy}
        testId="framework-create"
      />

      {editable.length > 0 ? (
        <>
          <form action={editFormAction} data-testid="framework-edit-form">
            <h3>Write the next version of one</h3>
            <Field
              label="Which framework"
              htmlFor="framework-edit-base"
              limit="Editing writes a NEW version. The one you are replacing is kept, and drafts already built on it still name it."
              limitId="framework-edit-base-limit"
            >
              <select
                id="framework-edit-base"
                name="baseFrameworkId"
                required
                aria-describedby="framework-edit-base-limit"
                style={control}
              >
                {editable.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} (v{f.version})
                  </option>
                ))}
              </select>
            </Field>
            <ContentFields
              idPrefix="framework-edit"
              goals={goals}
              niches={niches}
              nameMax={nameMax}
              textMax={textMax}
              listMax={listMax}
            />
            <SubmitButton
              className={buttonClass("primary")}
              style={control}
              pendingLabel="Storing the new version…"
            >
              Store a new version
            </SubmitButton>
          </form>
          <Outcome
            state={editState}
            refusalCopy={refusalCopy}
            fallbackCopy={fallbackCopy}
            testId="framework-edit"
          />

          <form action={curationFormAction} data-testid="framework-approve-form">
            <h3>Put one into use</h3>
            <p className="muted" data-testid="framework-approve-note">
              {APPROVE_NOTE}
            </p>
            {approvable.length === 0 ? (
              <p className="muted" data-testid="framework-nothing-to-approve">
                Every framework you have written is already in use.
              </p>
            ) : (
              <>
                <Field label="Which framework" htmlFor="framework-approve-id">
                  <select
                    id="framework-approve-id"
                    name="frameworkId"
                    required
                    style={control}
                  >
                    {approvable.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (v{f.version})
                      </option>
                    ))}
                  </select>
                </Field>
                <SubmitButton
                  className={buttonClass("secondary")}
                  style={control}
                  pendingLabel="Approving…"
                >
                  Approve it for my drafts
                </SubmitButton>
              </>
            )}
          </form>
          <Outcome
            state={curationState}
            refusalCopy={refusalCopy}
            fallbackCopy={fallbackCopy}
            testId="framework-approve"
          />

          <form action={retireFormAction} data-testid="framework-retire-form">
            <h3>Take one out of use</h3>
            <p className="muted" data-testid="framework-retire-note">
              {RETIRE_NOTE}
            </p>
            <Field label="Which framework" htmlFor="framework-retire-id">
              <select
                id="framework-retire-id"
                name="frameworkId"
                required
                style={control}
              >
                {editable.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} (v{f.version})
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton
              className={buttonClass("quiet")}
              style={control}
              pendingLabel="Retiring…"
            >
              Retire it
            </SubmitButton>
          </form>
          <Outcome
            state={retireState}
            refusalCopy={refusalCopy}
            fallbackCopy={fallbackCopy}
            testId="framework-retire"
          />
        </>
      ) : null}
    </div>
  );
}
