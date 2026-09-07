// Lazy Stripe client (keyless-build discipline, M0 precedent): env is read at
// FIRST USE, never at module load — `pnpm build` with no STRIPE_* env stays
// green. API version: the SDK's bundled default (golden rule 9 — the installed
// SDK is the fact source; v22.5.0 pins 2026-07-29.dahlia).
import { createHash } from "node:crypto";
import Stripe from "stripe";

let instance: Stripe | null = null;
let instanceCredentialFingerprint: string | null = null;
let authenticatedIdentityCache: Readonly<{
  credentialFingerprint: string;
  identity: StripeAccountIdentity;
}> | null = null;

// Pinned so the rollout's fleet-quiescence proof cannot drift when the Stripe
// SDK changes its defaults. The installed v22.5.0 defaults are 80s, two
// retries, and a 5s maximum retry delay; these explicit values preserve that
// behaviour and make its worst-case call window derivable in our code.
export const STRIPE_REQUEST_TIMEOUT_MS = 80_000;
export const STRIPE_MAX_NETWORK_RETRIES = 2;
export const STRIPE_MAX_RETRY_DELAY_MS = 5_000;
export const STRIPE_MAX_CALL_WINDOW_MS =
  STRIPE_REQUEST_TIMEOUT_MS * (STRIPE_MAX_NETWORK_RETRIES + 1) +
  STRIPE_MAX_RETRY_DELAY_MS * STRIPE_MAX_NETWORK_RETRIES;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      "STRIPE_SECRET_KEY is not set. Add it to respin/.env.local (see respin/env.example) — get keys from the Stripe dashboard (test mode)."
    );
    this.name = "StripeNotConfiguredError";
  }
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  const credentialFingerprint = stripeCredentialFingerprint(key);
  if (instance && instanceCredentialFingerprint === credentialFingerprint) {
    return instance;
  }
  instance = new Stripe(key, {
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
  });
  instanceCredentialFingerprint = credentialFingerprint;
  return instance;
}

function stripeCredentialFingerprint(key: string): string {
  return `sha256:${createHash("sha256").update(key).digest("hex")}`;
}

export class AutoTopupAuthorityKeyError extends Error {
  constructor() {
    super(
      "RESPIN_AUTO_TOPUP_AUTHORITY_KEY must be configured with at least 32 characters before auto-top-up can create or recover a PaymentIntent."
    );
    this.name = "AutoTopupAuthorityKeyError";
  }
}

/** Stable HMAC key for provider-carried auto-top-up recovery authority. */
export const AUTO_TOPUP_AUTHORITY_KEY_ID = "v1";

export type AutoTopupAuthorityKeyMaterial = Readonly<{
  id: typeof AUTO_TOPUP_AUTHORITY_KEY_ID;
  key: string;
  fingerprint: string;
}>;

export function getAutoTopupAuthorityKeyMaterial(): AutoTopupAuthorityKeyMaterial {
  const key = process.env.RESPIN_AUTO_TOPUP_AUTHORITY_KEY;
  if (!key || key.length < 32) throw new AutoTopupAuthorityKeyError();
  return {
    id: AUTO_TOPUP_AUTHORITY_KEY_ID,
    key,
    fingerprint: `sha256:${createHash("sha256").update(key).digest("hex")}`,
  };
}

export function getAutoTopupAuthorityKey(): string {
  return getAutoTopupAuthorityKeyMaterial().key;
}

export type StripeAccountIdentity = Readonly<{
  accountId: string;
  livemode: boolean;
}>;

export class StripeAccountBindingError extends Error {
  constructor(detail: string) {
    super(`Stripe account binding refused: ${detail}`);
    this.name = "StripeAccountBindingError";
  }
}

/** Provider-authenticated identity checked against explicit operator intent. */
export async function getAuthenticatedStripeAccountIdentity(): Promise<StripeAccountIdentity> {
  const expectedAccountId = process.env.RESPIN_STRIPE_ACCOUNT_ID;
  const expectedMode = process.env.RESPIN_STRIPE_LIVEMODE;
  if (!expectedAccountId || !["true", "false"].includes(expectedMode ?? "")) {
    throw new StripeAccountBindingError(
      "RESPIN_STRIPE_ACCOUNT_ID and RESPIN_STRIPE_LIVEMODE=true|false are required"
    );
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  const credentialFingerprint = stripeCredentialFingerprint(key);
  if (
    authenticatedIdentityCache?.credentialFingerprint === credentialFingerprint
  ) {
    const cached = authenticatedIdentityCache.identity;
    if (
      cached.accountId !== expectedAccountId ||
      cached.livemode !== (expectedMode === "true")
    ) {
      throw new StripeAccountBindingError(
        `cached authenticated account/mode does not match the explicit expected binding (expected ${expectedAccountId}, livemode=${expectedMode})`
      );
    }
    return cached;
  }
  const stripe = getStripe();
  const [account, balance] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.balance.retrieve(),
  ]);
  const identity = { accountId: account.id, livemode: balance.livemode };
  if (
    identity.accountId !== expectedAccountId ||
    identity.livemode !== (expectedMode === "true")
  ) {
    throw new StripeAccountBindingError(
      `authenticated account/mode does not match the explicit expected binding (expected ${expectedAccountId}, livemode=${expectedMode})`
    );
  }
  authenticatedIdentityCache = { credentialFingerprint, identity };
  return identity;
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
