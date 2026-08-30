/**
 * Hard ceilings for immutable creator-authored onboarding storage.
 *
 * These live below both the browser-facing onboarding operations and the
 * scoped write capability so neither layer can drift into a different limit.
 * They are code-reviewed safety bounds, not deploy-time pricing/config dials.
 */
export const POST_CONTENT_MAX = 20_000;
export const POST_COUNT_MAX = 2_000;

/** Ancillary text stored with one immutable input is bounded as well. */
export const ONBOARDING_SOURCE_URL_MAX = 2_048;
export const ONBOARDING_FIELD_KEY_MAX = 256;

/**
 * A profile may retain this many append-only brain versions across all kinds.
 * Two hundred is generous for human-reviewed revisions while giving a complete
 * REQ-A04 export a finite upper bound.
 */
export const BRAIN_VERSION_MAX = 200;

/** Per-version bounds that preserve the interview schema's legitimate maxima. */
export const BRAIN_CLAIM_POSITION_MAX = 250;
export const BRAIN_EVIDENCE_ENTRY_MAX = 250;
export const BRAIN_DOCUMENT_TEXT_MAX = 500_000;
