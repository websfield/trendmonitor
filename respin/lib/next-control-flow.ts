// Next signals control flow BY THROWING, and a bare `catch (err)` catches it.
//
// Verified against the INSTALLED next@15.5.23 (golden rule 9 — probed, not
// remembered): `redirect("/sign-in")` throws a plain `Error` whose `digest` is
// `"NEXT_REDIRECT;replace;/sign-in;307;"`, and `notFound()` throws one whose
// digest is `"NEXT_HTTP_ERROR_FALLBACK;404"`. Neither is a subclass of
// anything, so `instanceof` cannot tell them from a domain failure and every
// `catch (err)` in `app/**` swallows them by default.
//
// That is not hypothetical: `requireUser()` redirects and `requireAdmin()`
// calls notFound(). A gate called INSIDE a try/catch therefore stops gating and
// starts producing a mis-labelled domain error — an expired session on a
// billing form became `?e=unknown` instead of `/sign-in`, and a non-admin POST
// was told "the configuration could not be saved" for a save that was never
// attempted (billing/tenancy round-2 CHANGE 1).
//
// TWO mechanisms, because either alone leaves the class open:
//  1. Every gate is hoisted ABOVE the try (so the redirect cannot be caught).
//  2. Every catch in app/** and lib/** re-throws Next's control flow FIRST —
//     enforced by the source scan in `tests/action-gate.test.ts`, so a new
//     catch in M2 cannot quietly reintroduce it.
//
// `unstable_rethrow` is Next's OWN predicate over its internal errors, so this
// stays correct when Next adds a new signal (it already carries `forbidden()`,
// `unauthorized()` and the RSC postpone). A hand-maintained digest allowlist
// here would be exactly the "second definition" this repo keeps punishing.
import { unstable_rethrow } from "next/navigation";

/**
 * Re-throw a Next control-flow signal; return normally for a real error.
 * Call this as the FIRST statement of every catch block in app/** and lib/**.
 */
export function rethrowNextControlFlow(err: unknown): void {
  unstable_rethrow(err);
}
