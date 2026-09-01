"use client";

import { useActionState, type ReactNode } from "react";
import { Banner } from "../../ui/banner";
// The two clauses this banner shares with `billing-errors.ts`'s `?e=` copy.
// Imported from `../refusal-clauses` and NOT from `billing-errors.ts` itself:
// that module imports `@respin/credits/app-server`, and this is a client
// component, so importing it would pull the Stripe adapter into the browser
// bundle. See `refusal-clauses.ts`'s header for the finding.
import {
  ECHO_NO_GUARANTEE_CLAUSE,
  NOTHING_SAVED_CLAUSE,
} from "../refusal-clauses";
import type {
  BrainEditAction,
  BrainEditRefusalState,
} from "./edit-state";

/**
 * The R15a echo refusal, rendered IN the form (not via `?e=`) because it is the
 * one edit refusal whose exact cause the server can show without guessing.
 *
 * IT CARRIES THE SAME TWO CLAUSES EVERY OTHER REFUSAL DOES (slice 5 gate round
 * 1, G2). Returning an action state instead of redirecting routed this banner
 * around `billing-errors.ts`, and with it around both: it never said the draft
 * had not been stored, and it never carried REQ-I04's no-guarantee sentence —
 * so "Rewrite this field in your own words … then submit it again" read as if
 * clearing the bar meant the field was clean. The sentences are imported, not
 * retyped, so the in-form refusal and the redirect refusal cannot drift.
 */
export function BrainEditRefusal({
  state,
  fieldLabels,
}: {
  state: BrainEditRefusalState;
  fieldLabels: Readonly<Record<string, string>>;
}): ReactNode {
  const field = fieldLabels[state.pointer] ?? "The field you edited";
  return (
    <Banner
      title="This is too close to a saved reference"
      role="alert"
      aria-live="assertive"
      data-testid="brain-edit-refusal"
    >
      <p>
        <strong>{field}</strong> matched saved reference{" "}
        <code>{state.referenceInputId}</code>.
      </p>
      <blockquote
        style={{
          margin: "var(--sp-3) 0",
          paddingLeft: "var(--sp-3)",
          borderLeft: "3px solid var(--border-strong)",
          whiteSpace: "pre-wrap",
        }}
      >
        {state.matchedSpan}
        {state.matchedSpanTruncated ? "…" : ""}
      </blockquote>
      <p className="muted" data-testid="brain-edit-refusal-nothing-saved">
        {NOTHING_SAVED_CLAUSE} The version already in force is unchanged, and so
        is the draft you were editing.
      </p>
      <p className="muted">
        Rewrite this field in your own words, changing the wording and
        structure, then submit it again.
      </p>
      <p className="muted" data-testid="brain-edit-refusal-no-guarantee">
        {ECHO_NO_GUARANTEE_CLAUSE}
      </p>
    </Banner>
  );
}

export function BrainEditForm({
  action,
  fieldLabels,
  testId,
  children,
}: {
  action: BrainEditAction | string;
  fieldLabels: Readonly<Record<string, string>>;
  testId: string;
  children: ReactNode;
}): ReactNode {
  if (typeof action === "string") {
    return (
      <form action={action} data-testid={testId}>
        {children}
      </form>
    );
  }
  return (
    <StatefulBrainEditForm
      action={action}
      fieldLabels={fieldLabels}
      testId={testId}
    >
      {children}
    </StatefulBrainEditForm>
  );
}

function StatefulBrainEditForm({
  action,
  fieldLabels,
  testId,
  children,
}: {
  action: BrainEditAction;
  fieldLabels: Readonly<Record<string, string>>;
  testId: string;
  children: ReactNode;
}): ReactNode {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} data-testid={testId}>
      {state ? <BrainEditRefusal state={state} fieldLabels={fieldLabels} /> : null}
      {children}
    </form>
  );
}
