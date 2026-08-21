"use client";

// The admin config editor's presentation (REQ-G05/J01 slice, D-M1-2).
//
// Split deliberately: `ConfigEditorForm` is PURE — it takes the action state as
// a prop, so a test can render the rejected-with-field-errors state directly.
// `ConfigEditor` is the thin `useActionState` wrapper the page mounts. Without
// the split the error branch would only be reachable by driving a real form
// submission, i.e. present-and-unrun (CLAUDE.md 2026-08-10).
//
// It is a client component for ONE reason: an operator pasting a price map into
// a textarea must not lose that paste when the document fails validation.
// `useActionState` carries the draft back; a redirect could not.
import { useActionState, useEffect, useRef } from "react";
import {
  IDLE_CONFIG_FORM_STATE,
  type ConfigFormState,
} from "./config-form-state";

export type ConfigVersionRowView = {
  version: number;
  createdBy: string;
  createdAt: Date;
};

/** The server action's shape. Deliberately NOT widened to `string`: it is fed
 *  straight to `useActionState`, and a cast to make a test-only string fit
 *  would be a lie the compiler stopped checking. Tests render
 *  `ConfigEditorForm` (which does take a plain action) instead. */
export type ConfigFormAction = (
  prev: ConfigFormState,
  formData: FormData
) => Promise<ConfigFormState>;

const section: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "1rem",
  marginBottom: "1rem",
};
const muted: React.CSSProperties = { color: "#555", fontSize: "0.9rem" };
const warn: React.CSSProperties = {
  ...section,
  borderColor: "#c00",
  background: "#fff5f5",
};
const cell: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "0.4rem 0.6rem",
  textAlign: "left",
};

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ConfigEditorFormProps = {
  /** The active document, pretty-printed — or the fail-closed explanation. */
  active:
    | { ok: true; version: number; json: string }
    | { ok: false; title: string; detail: string };
  state: ConfigFormState;
  action: string | ((formData: FormData) => void | Promise<void>);
  savedVersion: number | null;
};

/** Stable ids — the association is by CONSTANT, not by a string typed twice. */
const TEXTAREA_ID = "config-content";
const ISSUES_ID = "config-issues-list";

export function ConfigEditorForm({
  active,
  state,
  action,
  savedVersion,
}: ConfigEditorFormProps) {
  const hasError = state.status === "error";
  const hasIssues = hasError && (state.issues?.length ?? 0) > 0;
  const errorRef = useRef<HTMLDivElement>(null);
  // MOVE FOCUS on a rejected submit (audit #16). Keyed on the `state` OBJECT,
  // not on `hasError`: `useActionState` returns a fresh object per submission,
  // so a second rejection re-focuses the summary — whereas a boolean dependency
  // would stay `true` and fire only once, leaving the operator's second failed
  // save silent. Effects do not run under `renderToStaticMarkup`, so the
  // component stays renderable by the suite exactly as before.
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <div style={section} data-testid="config-editor">
      <h2 style={{ marginTop: 0 }}>
        {active.ok ? `Active version: v${active.version}` : "No active config"}
      </h2>

      {savedVersion !== null ? (
        <p data-testid="config-saved">
          Saved as <strong>v{savedVersion}</strong>. Earlier versions are
          untouched — this table is append-only, so the previous document is
          still readable exactly as it was.
        </p>
      ) : null}

      {!active.ok ? (
        <div style={warn} data-testid="config-missing">
          <strong>{active.title}</strong>
          <p style={muted}>{active.detail}</p>
        </div>
      ) : null}

      {/* THE ERROR SUMMARY (audit 2026-08-17 #16, WCAG 2.4.3 / 1.3.1).
          `role="alert"` announces it, but the operator who submitted was
          scrolled to the Save button BELOW a 24-row textarea — so a sighted
          keyboard user got no indication at all that anything had happened, and
          the issue list had no programmatic link to the field it describes.
          Two fixes, both needed: `tabIndex={-1}` + the focus effect below move
          the caret here on a rejected submit (which scrolls it into view as a
          side effect), and the textarea's `aria-describedby` names the list. */}
      {hasError ? (
        <div
          style={warn}
          data-testid="config-form-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          <strong>{state.message ?? "The configuration was not saved."}</strong>
          {hasIssues ? (
            <ul data-testid="config-issues" id={ISSUES_ID}>
              {state.issues?.map((i) => (
                <li key={`${i.path}:${i.message}`}>
                  <code>{i.path}</code>: {i.message}
                </li>
              ))}
            </ul>
          ) : null}
          <p style={muted}>
            No version was appended. Correct the document below and save again —
            your edit is still here.
          </p>
        </div>
      ) : null}

      <form action={action}>
        <label
          style={{ display: "block", marginBottom: "0.5rem" }}
          htmlFor={TEXTAREA_ID}
        >
          Configuration document (JSON)
        </label>
        <textarea
          id={TEXTAREA_ID}
          name="content"
          rows={24}
          spellCheck={false}
          style={{ width: "100%", fontFamily: "monospace" }}
          // Only when there IS a list to point at: a dangling
          // `aria-describedby` is announced as nothing and is worse than none.
          aria-describedby={hasIssues ? ISSUES_ID : undefined}
          aria-invalid={hasError || undefined}
          defaultValue={state.draft ?? (active.ok ? active.json : "")}
        />
        <button type="submit">Save as a new version</button>
        <p style={muted}>
          Saving never edits a row: it appends a new version, and the newest
          version is the active one. Credit costs, tier allowances, the pack
          price and the Stripe price map all come from here — nothing in the
          code carries a copy.
        </p>
      </form>
    </div>
  );
}

export function ConfigEditor(props: {
  active: ConfigEditorFormProps["active"];
  action: ConfigFormAction;
  savedVersion: number | null;
}) {
  const [state, formAction] = useActionState(
    props.action,
    IDLE_CONFIG_FORM_STATE
  );
  return (
    <ConfigEditorForm
      active={props.active}
      state={state}
      action={formAction}
      savedVersion={props.savedVersion}
    />
  );
}

export function ConfigHistory({ rows }: { rows: ConfigVersionRowView[] }) {
  return (
    <div style={section} data-testid="config-history">
      <h2 style={{ marginTop: 0 }}>Version history</h2>
      {rows.length === 0 ? (
        <p style={muted} data-testid="config-history-empty">
          No versions yet.
        </p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={cell}>Version</th>
              <th style={cell}>Appended by</th>
              <th style={cell}>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.version}>
                <td style={cell}>v{r.version}</td>
                <td style={cell}>{r.createdBy}</td>
                <td style={cell}>{day(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
