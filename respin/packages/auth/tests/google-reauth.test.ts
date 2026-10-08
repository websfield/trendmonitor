// R-164 (audit P5-R8 amendment, row 44): the Google re-authentication flow,
// with NO network. The module takes its token verifier and code exchange as
// parameters; this suite injects a verifier that checks a real ES256 signature
// against a locally generated key pair (node:crypto — the same algorithm family
// Google signs with), so a token the test did not sign is refused for the same
// reason a forged one would be. What it cannot prove — that live Google EMITS
// `auth_time` under `max_age=0` — is the master plan's deferral-ledger row.
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  ensureUserWorkspace,
  GOOGLE_REAUTH_DB_REFUSAL_CODES,
  GOOGLE_REAUTH_MAX_ATTEMPTS,
  GOOGLE_REAUTH_MAX_OUTSTANDING,
  GOOGLE_REAUTH_STATE_PREFIX,
  recordedGoogleReauthentication,
  schema,
  seedAuthUser,
  stampGoogleReauthentication,
  type TestDb,
} from "@respin/db";
import {
  beginGoogleReauthentication,
  completeGoogleReauthentication,
  GOOGLE_REAUTH_REFUSAL_CODES,
  GoogleReauthenticationRefused,
  googleReauthLogCode,
  signGoogleReauthState,
  type GoogleIdTokenVerifier,
  type GoogleReauthConfig,
} from "../src/google-reauth";

const CLIENT_ID = "client-id.apps.googleusercontent.test";
/** A pseudonymous client key, as `authRateLimitKeyDigest` produces. */
const CLIENT = "c".repeat(64);
const SECRET = "test-better-auth-secret-at-least-32-bytes-long";
const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function signToken(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: "local", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: keys.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Signature, audience and nonce — the checks `verifyGoogleIdToken` makes that matter here. */
const localVerifier: GoogleIdTokenVerifier = async ({ token, audience, nonce }) => {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const valid = verify(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key: keys.publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(signature, "base64url")
  );
  if (!valid) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  if (claims.aud !== audience || claims.iss !== "https://accounts.google.com") return null;
  if (nonce && claims.nonce !== nonce) return null;
  return claims;
};

let db: TestDb;
let issued: { idToken?: string };

function config(): GoogleReauthConfig {
  return {
    db,
    secret: SECRET,
    clientId: CLIENT_ID,
    clientSecret: "client-secret",
    redirectURI: "https://app.example/api/reauth/google/callback",
    verifyIdToken: vi.fn(localVerifier),
    exchangeCode: vi.fn(async () => issued),
  };
}

async function googleOnly(authUserId: string, sessionId: string) {
  await seedAuthUser(db, authUserId);
  await ensureUserWorkspace(db, { authUserId, name: authUserId });
  await db.insert(schema.account).values({
    id: `google-${authUserId}`,
    accountId: `sub-${authUserId}`,
    providerId: "google",
    userId: authUserId,
  });
  await db.insert(schema.session).values({
    id: sessionId,
    token: `token-${sessionId}`,
    userId: authUserId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    updatedAt: new Date(),
  });
  return { authUserId, sessionId };
}

async function start(current: { authUserId: string; sessionId: string }, client = CLIENT) {
  const url = new URL(await beginGoogleReauthentication(config(), current, client));
  return { url, state: url.searchParams.get("state")!, nonce: url.searchParams.get("nonce")! };
}

const nowSec = () => Math.floor(Date.now() / 1000) + 1;
const stampOf = async (sessionId: string) =>
  (await db.select({ id: schema.session.id, at: schema.session.reauthenticatedAt }).from(schema.session)).find(
    (row) => row.id === sessionId
  )!.at;

beforeEach(async () => {
  db = await createTestDb();
  issued = {};
});

describe("R-164: the Google re-authentication challenge", () => {
  it("asks Google for a FRESH authentication: prompt=login, max_age=0, PKCE S256, a signed state, a nonce", async () => {
    const current = await googleOnly("g-url", "session-g-url");
    const { url, state, nonce } = await start(current);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("max_age")).toBe("0");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    // The session id is NOT in the URL Google sees.
    expect(url.toString()).not.toContain("session-g-url");
  });

  it("a valid callback stamps THE STATE'S SESSION and nothing else — and the billing arm then admits it", async () => {
    const current = await googleOnly("g-ok", "session-g-ok");
    const bystander = await googleOnly("g-bystander", "session-g-bystander");
    const { state, nonce } = await start(current);
    issued = {
      idToken: signToken({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "sub-g-ok", nonce, auth_time: nowSec() }),
    };
    const ref = await completeGoogleReauthentication(config(), { state, code: "code-ok", current, rateLimitKeyDigest: CLIENT });
    expect(ref.sessionId).toBe("session-g-ok");
    expect(await stampOf("session-g-ok")).toEqual(ref.reauthenticatedAt);
    expect(await stampOf(bystander.sessionId)).toBeNull();
    expect(await recordedGoogleReauthentication(db, current)).toEqual(ref);
  });

  it.each([
    ["the silent-SSO plant: an ID token with NO auth_time", (nonce: string) => ({ sub: "sub-g-plant", nonce })],
    ["the silent-SSO plant: an auth_time OLDER than the challenge", (nonce: string) => ({ sub: "sub-g-plant", nonce, auth_time: nowSec() - 3600 })],
    ["a MISMATCHED sub", (nonce: string) => ({ sub: "sub-someone-else", nonce, auth_time: nowSec() })],
    ["a token for ANOTHER nonce", () => ({ sub: "sub-g-plant", nonce: "x".repeat(32), auth_time: nowSec() })],
  ])("refuses %s, and stamps nothing", async (_label, claims) => {
    const current = await googleOnly("g-plant", "session-g-plant");
    const { state, nonce } = await start(current);
    issued = { idToken: signToken({ iss: "https://accounts.google.com", aud: CLIENT_ID, ...claims(nonce) }) };
    await expect(completeGoogleReauthentication(config(), { state, code: "c", current, rateLimitKeyDigest: CLIENT })).rejects.toBeInstanceOf(
      GoogleReauthenticationRefused
    );
    expect(await stampOf("session-g-plant")).toBeNull();
    await expect(recordedGoogleReauthentication(db, current)).rejects.toThrow("auth_lifecycle_refused");
  });

  it("refuses a REPLAYED state: the first use consumed it", async () => {
    const current = await googleOnly("g-replay", "session-g-replay");
    const { state, nonce } = await start(current);
    issued = { idToken: signToken({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "sub-g-replay", nonce, auth_time: nowSec() }) };
    await completeGoogleReauthentication(config(), { state, code: "c1", current, rateLimitKeyDigest: CLIENT });
    await expect(completeGoogleReauthentication(config(), { state, code: "c2", current, rateLimitKeyDigest: CLIENT })).rejects.toMatchObject({
      code: "state_unavailable",
    });
  });

  it("refuses a state carried to ANOTHER session: the callback must arrive on the session the challenge was bound to", async () => {
    const victim = await googleOnly("g-victim", "session-g-victim");
    const attacker = await googleOnly("g-attacker", "session-g-attacker");
    const { state, nonce } = await start(victim);
    issued = { idToken: signToken({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "sub-g-attacker", nonce, auth_time: nowSec() }) };
    await expect(
      completeGoogleReauthentication(config(), { state, code: "c", current: attacker, rateLimitKeyDigest: CLIENT })
    ).rejects.toMatchObject({ code: "foreign_session" });
    expect(await stampOf(victim.sessionId)).toBeNull();
    expect(await stampOf(attacker.sessionId)).toBeNull();
  });

  it("refuses a state the server did not sign, and a token signed by another key", async () => {
    const current = await googleOnly("g-forged", "session-g-forged");
    const forged = signGoogleReauthState("not-the-secret-not-the-secret-not-the", "F".repeat(43));
    await expect(
      completeGoogleReauthentication(config(), { state: forged, code: "c", current, rateLimitKeyDigest: CLIENT })
    ).rejects.toMatchObject({ code: "state_signature" });
    const { state, nonce } = await start(current);
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const header = b64url(JSON.stringify({ alg: "ES256", kid: "other" }));
    const payload = b64url(
      JSON.stringify({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "sub-g-forged", nonce, auth_time: nowSec() })
    );
    const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key: other.privateKey, dsaEncoding: "ieee-p1363" });
    issued = { idToken: `${header}.${payload}.${b64url(signature)}` };
    await expect(completeGoogleReauthentication(config(), { state, code: "c", current, rateLimitKeyDigest: CLIENT })).rejects.toMatchObject({
      code: "id_token_unverified",
    });
    expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64);
  });
});

/** One flow run whose token carries `claims`; returns the refusal code, or "stamped". */
async function runWith(
  current: { authUserId: string; sessionId: string },
  claims: (nonce: string) => Record<string, unknown>,
  before?: () => Promise<void>
): Promise<string> {
  const { state, nonce } = await start(current);
  issued = { idToken: signToken({ iss: "https://accounts.google.com", aud: CLIENT_ID, ...claims(nonce) }) };
  await before?.();
  try {
    await completeGoogleReauthentication(config(), { state, code: "c", current, rateLimitKeyDigest: CLIENT });
    return "stamped";
  } catch (error) {
    expect(error).toBeInstanceOf(GoogleReauthenticationRefused);
    return (error as GoogleReauthenticationRefused).code;
  }
}

const directRefusal = async (input: Parameters<typeof stampGoogleReauthentication>[1]) =>
  stampGoogleReauthentication(db, input).then(
    () => "stamped",
    (error: Error) => error.message.replace(/^auth_lifecycle_refused:/, "")
  );

describe("R-166 (gate M6): every stamp refusal has its own code, pinned", () => {
  it("auth_time ONE MINUTE before the challenge is refused as stamp_auth_time_before_challenge — inside the window, so only that check can refuse it", async () => {
    const current = await googleOnly("g-minute", "session-g-minute");
    const beforeStartSec = Math.floor(Date.now() / 1000);
    // requestedAt is the database instant of `start`, so >= beforeStartSec;
    // this auth_time is >= 60 s earlier than it and well inside R-118's window.
    expect(await runWith(current, (nonce) => ({ sub: "sub-g-minute", nonce, auth_time: beforeStartSec - 60 }))).toBe(
      "stamp_auth_time_before_challenge"
    );
    expect(await stampOf(current.sessionId)).toBeNull();
  });

  /**
   * THE LIST, witnessed: every server stamp code but the one unreachable by
   * construction (`stamp_session_changed`: the stamp's UPDATE runs under the
   * row lock its own SELECT took). A new stamp code in
   * `GOOGLE_REAUTH_DB_REFUSAL_CODES` with no row here goes red below.
   */
  const WITNESSES: Record<string, (current: { authUserId: string; sessionId: string }) => Promise<string>> = {
    stamp_auth_time_missing: (current) => runWith(current, (nonce) => ({ sub: `sub-${current.authUserId}`, nonce })),
    stamp_sub_missing: (current) => runWith(current, (nonce) => ({ nonce, auth_time: nowSec() })),
    stamp_sub_mismatch: (current) => runWith(current, (nonce) => ({ sub: "sub-nobody", nonce, auth_time: nowSec() })),
    stamp_auth_time_future: (current) =>
      runWith(current, (nonce) => ({ sub: `sub-${current.authUserId}`, nonce, auth_time: nowSec() + 3600 })),
    stamp_auth_time_before_challenge: (current) =>
      runWith(current, (nonce) => ({ sub: `sub-${current.authUserId}`, nonce, auth_time: nowSec() - 120 })),
    stamp_login_disabled: (current) =>
      runWith(
        current,
        (nonce) => ({ sub: `sub-${current.authUserId}`, nonce, auth_time: nowSec() }),
        async () => {
          await db.update(schema.user).set({ ordinaryLoginDisabledAt: new Date() });
        }
      ),
    stamp_session_expired: (current) =>
      runWith(
        current,
        (nonce) => ({ sub: `sub-${current.authUserId}`, nonce, auth_time: nowSec() }),
        async () => {
          await db.update(schema.session).set({ expiresAt: new Date(Date.now() - 1_000) });
        }
      ),
    stamp_session_unavailable: (current) =>
      runWith(
        current,
        (nonce) => ({ sub: `sub-${current.authUserId}`, nonce, auth_time: nowSec() }),
        async () => {
          await db.delete(schema.session);
        }
      ),
    stamp_auth_time_stale: (current) =>
      directRefusal({
        ...current,
        sub: `sub-${current.authUserId}`,
        requestedAt: new Date(Date.now() - 20 * 60_000),
        authTime: Math.floor(Date.now() / 1000) - 15 * 60,
      }),
    stamp_input_invalid: (current) =>
      directRefusal({ ...current, sub: `sub-${current.authUserId}`, requestedAt: new Date(Number.NaN), authTime: nowSec() }),
  };

  it.each(Object.keys(WITNESSES))("%s", async (code) => {
    const current = await googleOnly(`g-${code}`, `session-g-${code}`);
    expect(await WITNESSES[code]!(current)).toBe(code);
  });

  it("the witnessed set IS the stamp list, minus the one code unreachable by construction", () => {
    const stampCodes = GOOGLE_REAUTH_DB_REFUSAL_CODES.filter((code) => code.startsWith("stamp_"));
    expect([...Object.keys(WITNESSES), "stamp_session_changed"].sort()).toEqual([...stampCodes].sort());
    // Every server code is a flow code, so the route's log can name it.
    for (const code of GOOGLE_REAUTH_DB_REFUSAL_CODES) expect(GOOGLE_REAUTH_REFUSAL_CODES).toContain(code);
  });

  it("the route's log code is the refusal's own code, and `unlisted` for anything else", () => {
    expect(googleReauthLogCode(new GoogleReauthenticationRefused("stamp_sub_mismatch"))).toBe("stamp_sub_mismatch");
    expect(googleReauthLogCode(new Error("DrizzleQueryError params: secret"))).toBe("unlisted");
    expect(googleReauthLogCode({ code: "rate_limited" })).toBe("unlisted");
  });
});

describe("R-166 (gate Low): the stamp is min(now, auth_time) and records the google method", () => {
  it("stamps the moment the person authenticated, not the callback's arrival", async () => {
    const current = await googleOnly("g-min", "session-g-min");
    const { state, nonce } = await start(current);
    // >= the challenge's second (computed after start), <= now.
    const authTime = Math.floor(Date.now() / 1000);
    issued = { idToken: signToken({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "sub-g-min", nonce, auth_time: authTime }) };
    const ref = await completeGoogleReauthentication(config(), { state, code: "c", current, rateLimitKeyDigest: CLIENT });
    expect(ref.reauthenticatedAt.getTime()).toBe(authTime * 1000);
    const [row] = await db
      .select({ at: schema.session.reauthenticatedAt, method: schema.session.reauthenticatedMethod })
      .from(schema.session);
    expect(row).toEqual({ at: new Date(authTime * 1000), method: "google" });
  });
});

describe("R-166 (gate M5): start and callback are rate-limited server-side, and outstanding challenges are capped", () => {
  const verificationRows = async () =>
    (await db.select({ identifier: schema.verification.identifier }).from(schema.verification)).filter((row) =>
      row.identifier.startsWith(GOOGLE_REAUTH_STATE_PREFIX)
    );

  it(`start: the ${GOOGLE_REAUTH_MAX_ATTEMPTS + 1}th challenge for ONE account is refused rate_limited, whichever client sends it`, async () => {
    const current = await googleOnly("g-rate-account", "session-g-rate-account");
    for (let i = 0; i < GOOGLE_REAUTH_MAX_ATTEMPTS; i += 1) await start(current, String(i).padStart(64, "a"));
    await expect(start(current, "f".repeat(64))).rejects.toMatchObject({ code: "rate_limited" });
  });

  it(`start: the ${GOOGLE_REAUTH_MAX_ATTEMPTS + 1}th challenge from ONE client is refused rate_limited, across accounts`, async () => {
    for (let i = 0; i < GOOGLE_REAUTH_MAX_ATTEMPTS; i += 1) {
      await start(await googleOnly(`g-rate-client-${i}`, `session-g-rate-client-${i}`));
    }
    const fresh = await googleOnly("g-rate-client-x", "session-g-rate-client-x");
    await expect(start(fresh)).rejects.toMatchObject({ code: "rate_limited" });
    // Another client still gets through for that same account.
    await expect(start(fresh, "e".repeat(64))).resolves.toBeDefined();
  });

  it(`callback: the ${GOOGLE_REAUTH_MAX_ATTEMPTS + 1}th callback from ONE client is refused rate_limited and consumes nothing`, async () => {
    const current = await googleOnly("g-rate-cb", "session-g-rate-cb");
    for (let i = 0; i < GOOGLE_REAUTH_MAX_ATTEMPTS; i += 1) {
      await expect(
        completeGoogleReauthentication(config(), {
          state: signGoogleReauthState(SECRET, String(i).padStart(43, "Q")),
          code: "c",
          current,
          rateLimitKeyDigest: "b".repeat(64),
        })
      ).rejects.toMatchObject({ code: "state_unavailable" });
    }
    const { state, nonce } = await start(current, "d".repeat(64));
    issued = { idToken: signToken({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "sub-g-rate-cb", nonce, auth_time: nowSec() }) };
    await expect(
      completeGoogleReauthentication(config(), { state, code: "c", current, rateLimitKeyDigest: "b".repeat(64) })
    ).rejects.toMatchObject({ code: "rate_limited" });
    // The limited callback did not consume the state: another client completes it.
    const ref = await completeGoogleReauthentication(config(), { state, code: "c", current, rateLimitKeyDigest: "9".repeat(64) });
    expect(ref.sessionId).toBe(current.sessionId);
  });

  it(`at most ${GOOGLE_REAUTH_MAX_OUTSTANDING} challenge rows are outstanding per account; the oldest are superseded`, async () => {
    const current = await googleOnly("g-cap", "session-g-cap");
    const states: string[] = [];
    for (let i = 0; i < GOOGLE_REAUTH_MAX_ATTEMPTS; i += 1) {
      states.push((await start(current, String(i).padStart(64, "7"))).state);
    }
    expect(await verificationRows()).toHaveLength(GOOGLE_REAUTH_MAX_OUTSTANDING);
    await expect(
      completeGoogleReauthentication(config(), { state: states[0]!, code: "c", current, rateLimitKeyDigest: CLIENT })
    ).rejects.toMatchObject({ code: "state_unavailable" });
  });

  it("an expired challenge row is swept by the next start", async () => {
    const current = await googleOnly("g-sweep", "session-g-sweep");
    await start(current);
    await db.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1_000) });
    await start(current, "8".repeat(64));
    expect(await verificationRows()).toHaveLength(1);
  });
});
