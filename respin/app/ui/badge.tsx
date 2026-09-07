// Status badge (DESIGN.md): filled = VERIFIED / EMERGING; outline (solid
// border) = ESTABLISHED / SATURATED; dashed = UNVERIFIED / STALE-KEPT.
// Words always — status is never color-only, so children are required.
import type { ComponentPropsWithoutRef } from "react";

export type BadgeVariant = "filled" | "outline" | "dashed";

export function Badge({
  variant = "outline",
  className,
  ...rest
}: { variant?: BadgeVariant } & ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={`badge badge-${variant}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
