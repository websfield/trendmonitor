// Operator-facing copy the PAGE renders, in a module a test can import.
//
// Why this file exists: AC-5's keyless render evidence quoted strings that
// lived only inside `page.tsx`, while the suite rendered a DIFFERENT, shorter
// fixture remedy — so the words a real keyless install actually shows were
// asserted by nothing, and `pnpm stripe:setup` could have been deleted from
// them without a single test going red (round-2 CHANGE 7).
//
// A sibling module rather than an export from `page.tsx`: Next validates the
// exports of a `page` segment, so a page file is not a safe place to hang a
// constant a test imports.
//
// Every string here is a REFUSAL'S REMEDY — an action the operator may
// actually take (CLAUDE.md lesson 2026-07-30). The completeness test asserts
// each one names its command and its destination.
export const STRIPE_REMEDY =
  "No Stripe key is set on this server, so no billing action can run. An operator needs to put STRIPE_SECRET_KEY in respin/.env.local (see respin/env.example), run `pnpm stripe:setup`, and paste the printed price ids into /admin/config as `stripePriceMap`.";
