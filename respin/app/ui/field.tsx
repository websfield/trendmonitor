// Field (DESIGN.md): label, control, limit line. The caller wires
// aria-describedby on its own control to `limitId` — stated limits are part of
// the control, not decoration (WCAG 3.3.2).
import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  limit,
  limitId,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  /** The stated limit/rule sentence, rendered under the control. */
  limit?: ReactNode;
  /** id for the limit line, for the control's aria-describedby. */
  limitId?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {limit !== undefined ? (
        <p className="field-limit" id={limitId}>
          {limit}
        </p>
      ) : null}
    </div>
  );
}
