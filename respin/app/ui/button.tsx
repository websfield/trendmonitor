// Button (DESIGN.md): primary / secondary / quiet. `buttonClass` is the one
// source of the class string — the stateful controls that own their own
// markup (billing's ActionButton, onboarding's SubmitButton call sites, the
// landing's link-buttons, the auth form) call it rather than assembling
// "btn btn-*" by hand. Disabled-with-linked-reason and pending stay at those
// call sites, which own that state.
import type { ComponentPropsWithoutRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export function buttonClass(
  variant: ButtonVariant = "primary",
  className?: string
): string {
  return `btn btn-${variant}${className ? ` ${className}` : ""}`;
}

export function Button({
  variant = "primary",
  className,
  ...rest
}: { variant?: ButtonVariant } & ComponentPropsWithoutRef<"button">) {
  return <button className={buttonClass(variant, className)} {...rest} />;
}
