// Lazy Stripe client (keyless-build discipline, M0 precedent): env is read at
// FIRST USE, never at module load — `pnpm build` with no STRIPE_* env stays
// green. API version: the SDK's bundled default (golden rule 9 — the installed
// SDK is the fact source; v22.5.0 pins 2026-07-29.dahlia).
import Stripe from "stripe";

let instance: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      "STRIPE_SECRET_KEY is not set. Add it to respin/.env.local (see respin/env.example) — get keys from the Stripe dashboard (test mode)."
    );
    this.name = "StripeNotConfiguredError";
  }
}

export function getStripe(): Stripe {
  if (instance) return instance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  instance = new Stripe(key);
  return instance;
}

/**
 * Is a Stripe secret key present? The ONE reader of that env var besides
 * `getStripe` itself, added so the M1 billing page can DISABLE its controls
 * with a named remedy instead of offering buttons that throw
 * `StripeNotConfiguredError` on click (phase-4 keyless requirement). It answers
 * "is a key configured", never "is the key valid" — only a real API call can
 * answer that, and the page says so.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new StripeNotConfiguredError();
  }
  return secret;
}

export type { Stripe };
