// The refusal component (DESIGN.md honesty states): strong neutral border and
// plain words — no alarm red anywhere. Callers own the a11y wiring (role,
// tabIndex, focus islands) because WHEN a refusal announces depends on how it
// arrived (redirect vs in-place), which only the call site knows.
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function Banner({
  title,
  children,
  className,
  ...rest
}: {
  title: ReactNode;
  children?: ReactNode;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={`banner${className ? ` ${className}` : ""}`} {...rest}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}
