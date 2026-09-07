// Signal primitives (DESIGN.md component inventory). Presentational only:
// props in, markup out. Server-safe — no directive, no state, no data.
import type { ComponentPropsWithoutRef } from "react";

export type PanelLevel = 0 | 1 | 2;

/**
 * Panel/Card. Level 0 = hairline border; level 1 = soft shadow (proposals,
 * results); level 2 = floating (modals, the cancel interstitial).
 */
export function Panel({
  level = 0,
  className,
  ...rest
}: { level?: PanelLevel } & ComponentPropsWithoutRef<"div">) {
  const levelClass = level === 0 ? "" : ` panel-${level}`;
  return (
    <div
      className={`panel${levelClass}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
