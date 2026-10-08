// R-164 (audit P5-R8, register 2026-10-05 item 25): a Google re-authentication
// that meets R-118's own bar, so a Google-only creator can reach the
// reauth-gated billing actions — checkout, pack, portal, pause, resume,
// auto-top-up — without a password they never had.
//
// WHY A ROUTE OF OUR OWN, NOT THE PROVIDER'S SIGN-IN. R-118 says "recent" is a
// server-recorded stamp set only by a FRESH challenge for that exact session,
// and that ordinary session creation never qualifies. Measured against the
// installed `better-auth@1.6.28` (`@better-auth/core/dist/social-providers/
// google.mjs`): its Google provider takes `prompt` as a static option, sends
// no `max_age`, and its user-info step decodes the ID token without checking
// `auth_time` — so its sign-in cannot prove the person just authenticated.
// What the installed package DOES give, re-exported by `better-auth` itself
// (so no new dependency): `verifyGoogleIdToken` (signature, issuer, audience,
// nonce, token age; returns the payload) and `validateAuthorizationCode` +
// `generateCodeChallenge` (the PKCE code exchange).
//
// THE FLOW.
//   1. begin: bind a single-use state to THIS session (server row: session
//      digest, PKCE verifier, nonce, the database request instant); send the
//      person to Google with `prompt=login`, `max_age=0`, PKCE, the HMAC-signed
//      state and the nonce.
//   2. complete: verify the state's signature, CONSUME its row (a replay finds
//      none), require the callback's own session to be the bound one, exchange
//      the code, verify the ID token, then hand `sub` and `auth_time` to
//      `stampGoogleReauthentication`, which checks them on the server and
//      stamps the bound session — never one the callback created.
//
// THE ONE FACT THIS TREE CANNOT PROVE: that Google EMITS `auth_time` when
// `max_age` is sent (OIDC Core requires it). A token without it is refused,
// fail closed, so if Google omits it nothing is weakened — Google-only
// creators simply still cannot buy, and R-118's 10b-2 enrolment path is the
// recorded fallback (R-164; the master plan's deferral ledger row).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { generateCodeChallenge, validateAuthorizationCode } from "better-auth/oauth2";
import { verifyGoogleIdToken } from "better-auth/social-providers";
import {
  consumeGoogleReauthentication,
  GOOGLE_REAUTH_DB_REFUSAL_CODES,
  googleReauthDbRefusalCode,
  reserveGoogleReauthentication,
  stampGoogleReauthentication,
  type DbLike,
  type ReauthenticatedSessionRef,
} from "@respin/db";

export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REAUTH_CALLBACK_PATH = "/api/reauth/google/callback";

/** The verifier's contract: the verified claims, or null. `verifyGoogleIdToken` by default. */
export type GoogleIdTokenVerifier = (args: {
  token: string;
  audience: string;
  nonce: string;
}) => Promise<Readonly<Record<string, unknown>> | null>;

/** The code exchange: returns the ID token, if any. `validateAuthorizationCode` by default. */
export type GoogleCodeExchange = (args: {
  code: string;
  codeVerifier: string;
  redirectURI: string;
}) => Promise<Readonly<{ idToken?: string }>>;

export type GoogleReauthConfig = Readonly<{
  db: DbLike;
  /** `BETTER_AUTH_SECRET`: signs the state. */
  secret: string;
  clientId: string;
  clientSecret: string;
  redirectURI: string;
  /** Test seams; production takes the installed package's functions. */
  verifyIdToken?: GoogleIdTokenVerifier;
  exchangeCode?: GoogleCodeExchange;
}>;

export type CurrentSession = Readonly<{ authUserId: string; sessionId: string }>;

/**
 * EVERY CODE THIS FLOW CAN REFUSE WITH, as a closed list (R-166, gate M6 and
 * the security Low; Respin rule 7): the flow's own checks, then the server's
 * (`GOOGLE_REAUTH_DB_REFUSAL_CODES`, one per stamp condition), then
 * `stamp_refused` for a stamp failure that is not one of them (a database
 * error). The routes log only a member of this list (`googleReauthLogCode`).
 */
export const GOOGLE_REAUTH_REFUSAL_CODES = [
  "not_configured",
  "state_signature",
  "state_unavailable",
  "no_session",
  "foreign_session",
  "no_code",
  "code_exchange",
  "no_id_token",
  "id_token_unverified",
  "nonce",
  "stamp_refused",
  ...GOOGLE_REAUTH_DB_REFUSAL_CODES,
] as const;
export type GoogleReauthRefusalCode = (typeof GOOGLE_REAUTH_REFUSAL_CODES)[number];

/** Content-free: a code naming the condition, never a value. */
export class GoogleReauthenticationRefused extends Error {
  constructor(public readonly code: GoogleReauthRefusalCode) {
    super(`google_reauthentication_refused:${code}`);
    this.name = "GoogleReauthenticationRefused";
  }
}

function refuse(code: GoogleReauthRefusalCode): never {
  throw new GoogleReauthenticationRefused(code);
}

/** The log code for any error a Google route caught: a listed refusal code, or `unlisted`. */
export function googleReauthLogCode(error: unknown): GoogleReauthRefusalCode | "unlisted" {
  return error instanceof GoogleReauthenticationRefused &&
    (GOOGLE_REAUTH_REFUSAL_CODES as readonly string[]).includes(error.code)
    ? error.code
    : "unlisted";
}

const STATE_ID_RE = /^[A-Za-z0-9_-]{43}$/;

function stateMac(secret: string, stateId: string): string {
  return createHmac("sha256", secret).update(`respin:google-reauth-state:v1:${stateId}`, "utf8").digest("base64url");
}

export function signGoogleReauthState(secret: string, stateId: string): string {
  return `${stateId}.${stateMac(secret, stateId)}`;
}

/** The state id, iff the signature is ours. Constant-time. */
export function verifyGoogleReauthState(secret: string, state: string): string | null {
  const [stateId, mac, extra] = state.split(".");
  if (extra !== undefined || !stateId || !mac || !STATE_ID_RE.test(stateId)) return null;
  const expected = Buffer.from(stateMac(secret, stateId), "utf8");
  const actual = Buffer.from(mac, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? stateId : null;
}

function sessionDigest(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

function requireConfig(config: GoogleReauthConfig): void {
  if (!config.secret || !config.clientId || !config.clientSecret || !config.redirectURI) {
    refuse("not_configured");
  }
}

/**
 * Step 1. Returns the Google authorization URL for THIS session's challenge.
 * `rateLimitKeyDigest` is the pseudonymous client key (`authRateLimitKeyDigest`
 * in `server.ts`); the server limits per account and per client (R-166, M5).
 */
export async function beginGoogleReauthentication(
  config: GoogleReauthConfig,
  current: CurrentSession,
  rateLimitKeyDigest: string
): Promise<string> {
  requireConfig(config);
  const stateId = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  await reserveGoogleReauthentication(config.db, {
    stateId,
    authUserId: current.authUserId,
    sessionId: current.sessionId,
    codeVerifier,
    nonce,
    rateLimitKeyDigest,
  }).catch((error: unknown) =>
    refuse(googleReauthDbRefusalCode(error) === "rate_limited" ? "rate_limited" : "not_reauthenticable")
  );
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectURI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", signGoogleReauthState(config.secret, stateId));
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", await generateCodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  // The two parameters the provider's own sign-in cannot send: re-prompt, and
  // make the authentication itself — not the session — no older than now.
  url.searchParams.set("prompt", "login");
  url.searchParams.set("max_age", "0");
  return url.toString();
}

const DEFAULT_EXCHANGE = (config: GoogleReauthConfig): GoogleCodeExchange => async (args) =>
  validateAuthorizationCode({
    code: args.code,
    codeVerifier: args.codeVerifier,
    redirectURI: args.redirectURI,
    options: { clientId: config.clientId, clientSecret: config.clientSecret },
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
  });

/**
 * Step 2. Every refusal is fail-closed, and the state row is consumed before
 * anything else can refuse, so a refused callback can never be retried with
 * the same state.
 */
export async function completeGoogleReauthentication(
  config: GoogleReauthConfig,
  input: Readonly<{
    state: string;
    code: string;
    current: CurrentSession | null;
    rateLimitKeyDigest: string;
  }>
): Promise<ReauthenticatedSessionRef> {
  requireConfig(config);
  const stateId = verifyGoogleReauthState(config.secret, input.state);
  if (stateId === null) refuse("state_signature");
  const reserved = await consumeGoogleReauthentication(config.db, stateId, input.rateLimitKeyDigest).catch(
    (error: unknown) =>
      refuse(googleReauthDbRefusalCode(error) === "rate_limited" ? "rate_limited" : "state_unavailable")
  );
  // The callback must arrive on the SAME session the challenge was bound to: a
  // state carried to another session's browser stamps nothing.
  if (!input.current) refuse("no_session");
  const expected = Buffer.from(reserved.sessionDigest, "utf8");
  const actual = Buffer.from(sessionDigest(input.current.sessionId), "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    refuse("foreign_session");
  }
  if (!input.code) refuse("no_code");
  const tokens = await (config.exchangeCode ?? DEFAULT_EXCHANGE(config))({
    code: input.code,
    codeVerifier: reserved.codeVerifier,
    redirectURI: config.redirectURI,
  }).catch(() => refuse("code_exchange"));
  if (!tokens.idToken) refuse("no_id_token");
  const claims = await (config.verifyIdToken ?? verifyGoogleIdToken)({
    token: tokens.idToken,
    audience: config.clientId,
    nonce: reserved.nonce,
  });
  if (!claims) refuse("id_token_unverified");
  // Re-checked here, not trusted to the verifier: it compares the nonce only
  // when one is passed, and an injected verifier is a different function.
  if (claims.nonce !== reserved.nonce) refuse("nonce");
  return stampGoogleReauthentication(config.db, {
    authUserId: input.current.authUserId,
    sessionId: input.current.sessionId,
    sub: typeof claims.sub === "string" ? claims.sub : "",
    // ABSENT stays absent: `stampGoogleReauthentication` refuses it.
    authTime: typeof claims.auth_time === "number" ? claims.auth_time : undefined,
    requestedAt: reserved.requestedAt,
    // Each server condition keeps its own code (R-166, gate M6); anything
    // else — a database failure — is `stamp_refused`.
  }).catch((error: unknown) => refuse(googleReauthDbRefusalCode(error) ?? "stamp_refused"));
}
