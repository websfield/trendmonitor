"use client";

// A submit button that disables itself while its form is in flight.
//
// WHY IT IS NOT COSMETIC (production gate, 2026-08-27). `onboarding_inputs`
// has no content dedupe — R-33 records that absence in terms — and slice 1
// ships no delete. So a double click on a slow connection leaves TWO identical
// rows that the creator cannot remove, in an immutable table, and both flow
// into the corpus later slices count `n` over. The cost of the second click is
// permanent and the creator has no remedy for it.
//
// `useFormStatus` rather than local state: it reads the pending state of the
// enclosing form, so it is correct for a server action's full round trip
// including the redirect, and it needs no wiring at the call site.
//
// NOT A GUARD. It narrows the window; it does not close it — two browser tabs,
// or JS disabled, still submit twice. The durable fix is a content hash or an
// idempotency key on the write, which is a schema change this slice does not
// own; it is recorded as an open item rather than implied to be handled.
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  style,
  className,
  pendingLabel = "Saving…",
  formAction,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Signal button classes (e.g. "btn btn-primary") — styling only. */
  className?: string;
  /**
   * A DIFFERENT action from the enclosing `<form>`'s own — the native
   * multi-submit-button pattern (slice 3b: the interview screen's edit form
   * has a "save and review" primary button and a "save without leaving"
   * secondary one, and both need to be pending-aware and double-submit-safe
   * the same way a single-action form already is). Optional: every existing
   * caller has exactly one action, on the `<form>` itself, and this prop is
   * absent for all of them.
   */
  // Same union as `./onboarding-view.tsx`'s `FormAction` (not imported —
  // that file imports THIS one, and a back-import would be circular): a
  // string is a plain URL a JS-off form still posts to correctly.
  formAction?: string | ((formData: FormData) => void | Promise<void>);
  /**
   * WHAT THE BUTTON SAYS WHILE IT IS WORKING, and it is a prop rather than a
   * constant because "Saving…" was WRONG on one of the three controls using it.
   *
   * The run control does not save anything: it calls a model provider and
   * spends a credit. A creator who pressed it and read "Saving…" was told that
   * the thing in flight was a write to their own data — so a slow run reads as
   * a slow save, and someone who wanted to stop it has no idea that money is
   * what is moving. The pending state is the ONLY moment the product can say
   * what it is actually doing, and on a spending control it has to.
   *
   * Defaulted, so the two intake controls keep the label that is true for them
   * and nothing else had to change.
   */
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    // `aria-disabled`, NOT `disabled` — measured in a real browser, 2026-08-28.
    //
    // `disabled` removes the element from the focus order, so the browser drops
    // focus to `<body>` the instant the press lands. A keyboard or
    // screen-reader user then loses their place on the one control in the
    // product that spends money, and `aria-busy` on an unfocused, unfocusable
    // element is announced by nothing. `aria-disabled` keeps the control
    // focused and still tells assistive tech it is unavailable.
    //
    // THE DOUBLE-SUBMIT NARROWING SURVIVES, and that is the point of the
    // guard below rather than of the attribute: `aria-disabled` is advisory, so
    // the click must be refused in code. `onClick` prevents the second submit
    // while one is in flight — the same window `disabled` closed, without
    // taking focus with it. It is still a narrowing and not a guard: two tabs
    // submit twice, and the durable answer stays the idempotency key.
    <button
      type="submit"
      className={className}
      aria-disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (pending) e.preventDefault();
      }}
      style={style}
      {...(formAction !== undefined ? { formAction } : {})}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
