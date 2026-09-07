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

/**
 * The optional creator note on one piece of feedback (slice 7, R10).
 *
 * BOUNDED FOR THE REASON `POST_CONTENT_MAX` IS: `generation_feedback.note` is
 * `text` with no length constraint, it is browser-reachable, it is
 * export-included, and the table has no delete path. 2,000 code points is a
 * long paragraph and several orders below a paste-bomb.
 */
export const FEEDBACK_NOTE_MAX = 2_000;

/**
 * Bounds on ONE logged result (slice 9a, R5-R9).
 *
 * THE SAME CLASS AS `FEEDBACK_NOTE_MAX` AND FOR THE SAME REASON: both columns
 * are `text` with no length constraint, both are browser-reachable, both are
 * export-included, and `results` has no delete path either. The note bound is
 * deliberately the SAME NUMBER as feedback's — one creator paragraph is one
 * creator paragraph, and two limits that mean the same thing should not
 * disagree — but it is its own constant, because the two can move for
 * different reasons.
 *
 * `RESULT_PLATFORM_MAX` bounds a short label ("YouTube Shorts",
 * "Instagram Reels"). It is deliberately NOT an enum: the platform vocabulary
 * belongs to the product's surfaces rather than to this package, and pinning
 * it as a pgEnum would mean a migration per platform — the trade
 * `generation_attempts.mode` states one file over, with the same consequence
 * (a typo is storable, so it splits a cohort rather than corrupting one).
 */
export const RESULT_NOTE_MAX = 2_000;
export const RESULT_PLATFORM_MAX = 80;

/**
 * Bounds on ONE private framework, and on how many a profile may hold.
 *
 * The same class of ceiling as the onboarding pair above and for the same
 * reason: `frameworks` is `text`/`jsonb` throughout with no constraint on
 * size, slice 7 is the first slice on which a browser can write it, and every
 * version is retained (versioning appends a row). A creator on Pro can
 * otherwise mint unbounded 200 KB rows into the table the shared library
 * shares. Product limits with typed refusals, not safety properties dressed as
 * such — moving one is a code change with a test, not an operator dial.
 */
export const FRAMEWORK_NAME_MAX = 120;
export const FRAMEWORK_TEXT_MAX = 4_000;
export const FRAMEWORK_LIST_MAX = 24;
export const FRAMEWORK_SLUG_MAX = 80;
/** Distinct LIVE private frameworks per profile — versions are not counted. */
export const PRIVATE_FRAMEWORK_COUNT_MAX = 50;
/** Retained versions of ONE private framework, so the export stays finite. */
export const FRAMEWORK_VERSION_MAX = 50;
