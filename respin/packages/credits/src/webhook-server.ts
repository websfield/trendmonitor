// Webhook-only entrypoint (code-review CHANGE). handleStripeEvent dispatches
// a Stripe event into the ledger, so it must NOT sit on @respin/credits/
// app-server, which every app/** file may import: a future server action could
// hand-build an event object and drive the dispatcher past the signature layer.
// Identity rules keep such a write from crossing tenants (writes land only
// where the stored customer→workspace mapping points) — they do not keep it
// from happening at all. The signature check is the authority for "Stripe said
// this", and it lives in app/api/stripe/webhook/route.ts.
//
// The enforcing mechanism is the same one @respin/config/admin-server uses:
// eslint allowlists this subpath to app/api/stripe/webhook/** only, proven by
// deny/allow fixtures in tests/import-boundary.test.ts.
//
// Honest limit of that mechanism: eslint's no-restricted-imports sees only
// STATIC import/export declarations — it has no ImportExpression handler, so
// `await import(...)` slips past every rule. That gap is covered separately by
// the dynamic-import source scan in tests/import-boundary.test.ts (itself
// proven non-vacuous against a planted violation), not by the lint.
import { getServerDb } from "@respin/db";
import type Stripe from "stripe";
import {
  handleStripeEvent,
  DuplicateStripeEvent,
  type StripeEventOutcome,
} from "./stripe/webhooks";
import { StripeNotConfiguredError, getWebhookSecret } from "./stripe/adapter";
import { LedgerIntegrityError } from "./fold";
import { ClockSkewError } from "./errors";

// Same rule as the app-server facade, same enforcement
// (tests/facade-errors.test.ts walks the call graph from `handleEvent`): the
// route may import ONLY this entrypoint, so every Error subclass reachable
// from a method here is re-exported. `LedgerIntegrityError` earns its place
// beyond bookkeeping — a ledger the fold refuses to replay will NOT be fixed
// by Stripe redelivering the event, so it is the one handler failure the route
// could reasonably stop treating as retryable (billing/tenancy round-7
// CHANGE 2).
export {
  ClockSkewError,
  DuplicateStripeEvent,
  LedgerIntegrityError,
  StripeNotConfiguredError,
  getWebhookSecret,
};
export type { StripeEventOutcome };

export const respinStripeWebhook = {
  handleEvent: (event: Stripe.Event): Promise<StripeEventOutcome> =>
    handleStripeEvent(getServerDb(), event),
};
