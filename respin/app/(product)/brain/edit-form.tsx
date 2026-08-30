"use client";

import { useActionState, type ReactNode } from "react";
import { Banner } from "../../ui/banner";
import type {
  BrainEditAction,
  BrainEditRefusalState,
} from "./edit-state";

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
      <p className="muted">
        Rewrite this field in your own words, changing the wording and
        structure, then submit it again.
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
