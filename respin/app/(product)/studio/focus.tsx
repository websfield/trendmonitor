"use client";

// FOCUS AFTER A REDIRECT (launch L2, WCAG 2.4.3 / 4.1.3). Choosing a concept,
// "New generation" and cancelling are server actions that redirect, and a
// redirect leaves keyboard focus where the press was — below the confirmation
// that just appeared above it, or on `<body>` once the form is gone. These two
// helpers move it to the thing the press produced. The witness is the L2
// Playwright journey (`e2e/l2/free-concept.spec.ts`), the one harness in this
// workspace with a real focus model.
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A ref that receives focus on mount and again whenever `key` changes. The
 * element it lands on must be focusable by script (`tabIndex={-1}`).
 */
export function useFocusOnChange<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [key]);
  return ref;
}

/** A polite status line that takes focus when it appears. */
export function FocusedStatus({
  children,
  testId,
}: {
  children: ReactNode;
  testId: string;
}) {
  const ref = useFocusOnChange<HTMLParagraphElement>("mount");
  return (
    <p ref={ref} tabIndex={-1} role="status" data-testid={testId}>
      {children}
    </p>
  );
}
