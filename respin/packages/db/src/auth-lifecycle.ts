import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { account, rateLimit, session, user as authUser, verification } from "./auth-schema";
import type { DbLike, TxLike } from "./db-like";
import { DELETION_REAUTH_MAX_AGE_MS } from "./deletion-lifecycle";
import {
  deletionCancellationProofs,
  deletionOperations,
  deletionRecoverySessions,
} from "./lifecycle-schema";
import {
  assertFreshWorkspaceAuthority,
  assertWorkspaceLifecycleTransactionAccess,
  lockIdentityMembershipGraph,
} from "./membership-lifecycle";
import { users } from "./schema";
import { assertScoped, type WorkspaceScope } from "./with-workspace";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
export const CANCELLATION_RECOVERY_SESSION_TTL_MS = 15 * 60 * 1_000;
export const CANCELLATION_FACTOR_MAX_ATTEMPTS = 5;
export const REAUTHENTICATION_ATTEMPT_WINDOW_MS = 15 * 60 * 1_000;
export const REAUTHENTICATION_MAX_ATTEMPTS = 5;
/**
 * Better Auth's credential authority uses this exact JavaScript-string ceiling
 * (configured explicitly in packages/auth/src/create-auth.ts). Keep direct
 * reauthentication inside the same accepted-password domain before scrypt.
 */
export const AUTH_PASSWORD_MAX_LENGTH = 128;

function refuse(): never {
  throw new Error("auth_lifecycle_refused");
}

/**
 * A refusal that names its condition (R-166, gate M6), for the Google
 * challenge's server checks. The message stays `auth_lifecycle_refused` plus a
 * code from a CLOSED list, never a value: the flow maps it to its own closed
 * code and the route logs only that.
 */
function refuseWith(code: GoogleReauthDbRefusalCode): never {
  throw new Error(`auth_lifecycle_refused:${code}`);
}

/**
 * THE GOOGLE CHALLENGE'S SERVER REFUSALS, as a list (R-166, gate M6; Respin
 * rule 7). Every `refuseWith` call site below names one of these; a new cause
 * is an edit here and a pinned case in `packages/auth/tests/google-reauth.test.ts`.
 */
export const GOOGLE_REAUTH_DB_REFUSAL_CODES = [
  "rate_limited",
  "not_reauthenticable",
  "stamp_input_invalid",
  "stamp_sub_missing",
  "stamp_auth_time_missing",
  "stamp_session_unavailable",
  "stamp_sub_mismatch",
  "stamp_login_disabled",
  "stamp_session_expired",
  "stamp_auth_time_before_challenge",
  "stamp_auth_time_future",
  "stamp_auth_time_stale",
  "stamp_session_changed",
] as const;
export type GoogleReauthDbRefusalCode = (typeof GOOGLE_REAUTH_DB_REFUSAL_CODES)[number];

/** The code a `refuseWith` error carries, or null for any other error. */
export function googleReauthDbRefusalCode(error: unknown): GoogleReauthDbRefusalCode | null {
  const message = error instanceof Error ? error.message : "";
  const prefix = "auth_lifecycle_refused:";
  if (!message.startsWith(prefix)) return null;
  const code = message.slice(prefix.length);
  return (GOOGLE_REAUTH_DB_REFUSAL_CODES as readonly string[]).includes(code)
    ? (code as GoogleReauthDbRefusalCode)
    : null;
}

/**
 * ONE fixed-window bucket per key, consumed atomically as a set (R-118's
 * shape, shared by the password arm and R-164's Google challenge). Keys are
 * locked in a stable order, so a pair decision is atomic. Every bucket is
 * consumed even when another refuses; the caller COMMITS this transaction and
 * refuses after it, because throwing inside would roll the consumption back
 * and make the limit look applied while doing no work. A bucket resets when
 * its last request is older than the window.
 */
async function consumeRateBucketsInTx(
  tx: TxLike,
  keys: readonly string[],
  nowMs: number,
  windowMs: number,
  maxAttempts: number
): Promise<boolean> {
  const windowStartMs = nowMs - windowMs;
  for (const key of [...keys].sort()) await lockAuthRateKey(tx, key);
  const existing = await tx
    .select({
      key: rateLimit.key,
      count: rateLimit.count,
      lastRequest: rateLimit.lastRequest,
    })
    .from(rateLimit)
    .where(inArray(rateLimit.key, [...keys]));
  const byKey = new Map(existing.map((row) => [row.key, row]));
  let allowed = true;
  for (const key of keys) {
    const current = byKey.get(key);
    if (!current) {
      await tx
        .insert(rateLimit)
        .values({ id: key, key, count: 1, lastRequest: nowMs });
      continue;
    }
    if (current.lastRequest < windowStartMs) {
      await tx
        .insert(rateLimit)
        .values({ id: key, key, count: 1, lastRequest: nowMs })
        .onConflictDoUpdate({
          target: rateLimit.key,
          set: { count: 1, lastRequest: nowMs },
        });
      continue;
    }
    if (current.count >= maxAttempts) {
      allowed = false;
      continue;
    }
    await tx
      .insert(rateLimit)
      .values({ id: key, key, count: current.count + 1, lastRequest: nowMs })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: { count: current.count + 1, lastRequest: nowMs },
      });
  }
  return allowed;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalDigest(plaintext: string, expectedHex: string): boolean {
  const actual = Buffer.from(digest(plaintext), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validRecoverySecret(value: string): boolean {
  if (!RECOVERY_SECRET_RE.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === value;
}

async function lockAuthRateKey(tx: TxLike, rateLimitKey: string): Promise<void> {
  const key = createHash("sha256").update(rateLimitKey, "utf8").digest();
  const first = key.readInt32BE(0);
  const second = key.readInt32BE(4);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${first}, ${second})`);
}

async function databaseNow(tx: TxLike): Promise<Date> {
  const result = (await tx.execute(
    sql`SELECT clock_timestamp() AS now`
  )) as unknown as { rows: { now: Date | string }[] };
  const raw = result.rows[0]?.now;
  if (raw === undefined) refuse();
  const value = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(value.getTime())) refuse();
  return value;
}

/** Friendly only; the migration trigger is the atomic session-write authority. */
export async function ordinaryLoginAllowed(
  db: DbLike,
  authUserId: string
): Promise<boolean> {
  const [identity] = await db
    .select({ disabledAt: authUser.ordinaryLoginDisabledAt })
    .from(authUser)
    .where(eq(authUser.id, authUserId))
    .limit(1);
  return identity !== undefined && identity.disabledAt === null;
}

export type ReauthenticatedSessionRef = Readonly<{
  authUserId: string;
  sessionId: string;
  reauthenticatedAt: Date;
}>;

/**
 * Transactional R-118 proof for a workspace mutation. The same transaction
 * takes the lifecycle/membership locks, validates the minted scope epochs, and
 * pins the exact server-recorded reauthentication event for the exact session.
 * Callers must keep their mutation inside this transaction.
 */
export async function assertReauthenticatedWorkspaceScopeInTx(
  tx: TxLike,
  scope: WorkspaceScope,
  authority: ReauthenticatedSessionRef,
  maxAgeMs = DELETION_REAUTH_MAX_AGE_MS
): Promise<{ role: "owner" | "editor" | "viewer" }> {
  assertScoped(scope);
  if (
    !authority.authUserId ||
    !authority.sessionId ||
    !(authority.reauthenticatedAt instanceof Date) ||
    Number.isNaN(authority.reauthenticatedAt.getTime()) ||
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs <= 0 ||
    maxAgeMs > DELETION_REAUTH_MAX_AGE_MS
  ) {
    refuse();
  }
  const current = await assertWorkspaceLifecycleTransactionAccess(
    tx,
    scope.userId,
    scope.workspaceId
  );
  assertFreshWorkspaceAuthority(current, scope);
  const [proof] = await tx
    .select({
      authUserId: users.authUserId,
      sessionAuthUserId: session.userId,
      reauthenticatedAt: session.reauthenticatedAt,
      expiresAt: session.expiresAt,
      ordinaryLoginDisabledAt: authUser.ordinaryLoginDisabledAt,
    })
    .from(users)
    .innerJoin(
      session,
      and(eq(session.userId, users.authUserId), eq(session.id, authority.sessionId))
    )
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(
      and(
        eq(users.id, scope.userId),
        eq(users.authUserId, authority.authUserId),
        eq(session.userId, authority.authUserId)
      )
    )
    .limit(1)
    .for("update");
  const now = await databaseNow(tx);
  const recordedAt = proof?.reauthenticatedAt?.getTime();
  if (
    !proof ||
    proof.authUserId !== authority.authUserId ||
    proof.sessionAuthUserId !== authority.authUserId ||
    proof.ordinaryLoginDisabledAt !== null ||
    proof.expiresAt.getTime() <= now.getTime() ||
    recordedAt === undefined ||
    recordedAt !== authority.reauthenticatedAt.getTime() ||
    recordedAt > now.getTime() ||
    now.getTime() - recordedAt > maxAgeMs
  ) {
    refuse();
  }
  return { role: current.role };
}

/** Sole writer for an exact session's server-recorded password reauthentication. */
export async function reauthenticateSessionWithPassword(
  db: DbLike,
  input: Readonly<{
    authUserId: string;
    sessionId: string;
    password: string;
    rateLimitKeyDigest: string;
  }>
): Promise<ReauthenticatedSessionRef> {
  if (
    !input.authUserId ||
    !input.sessionId ||
    typeof input.password !== "string" ||
    input.password.length > AUTH_PASSWORD_MAX_LENGTH ||
    !/^[0-9a-f]{64}$/.test(input.rateLimitKeyDigest)
  ) {
    refuse();
  }
  const admitted = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    // The per-account and pseudonymous-client pair (`consumeRateBucketsInTx`).
    const allowed = await consumeRateBucketsInTx(
      tx,
      [`r118:account:${digest(input.authUserId)}`, `r118:client:${input.rateLimitKeyDigest}`],
      now.getTime(),
      REAUTHENTICATION_ATTEMPT_WINDOW_MS,
      REAUTHENTICATION_MAX_ATTEMPTS
    );
    if (!allowed) return null;

    const credentials = await tx
      .select({
        accountId: account.id,
        passwordHash: account.password,
        accountUpdatedAt: account.updatedAt,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        sessionUpdatedAt: session.updatedAt,
        sessionReauthenticatedAt: session.reauthenticatedAt,
        loginDisabledAt: authUser.ordinaryLoginDisabledAt,
      })
      .from(session)
      .innerJoin(authUser, eq(authUser.id, session.userId))
      .innerJoin(
        account,
        and(eq(account.userId, session.userId), eq(account.providerId, "credential"))
      )
      .where(
        and(eq(session.id, input.sessionId), eq(session.userId, input.authUserId))
      )
      .limit(2);
    const credential = credentials.length === 1 ? credentials[0] : undefined;
    if (
      !credential?.passwordHash ||
      credential.loginDisabledAt !== null ||
      credential.sessionExpiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }
    return {
      accountId: credential.accountId,
      passwordHash: credential.passwordHash,
      accountUpdatedAt: credential.accountUpdatedAt,
      sessionTokenDigest: digest(credential.sessionToken),
      sessionExpiresAt: credential.sessionExpiresAt,
      sessionUpdatedAt: credential.sessionUpdatedAt,
      sessionReauthenticatedAt: credential.sessionReauthenticatedAt,
    };
  });

  if (!admitted) refuse();

  if (
    !(await verifyPassword({
      hash: admitted.passwordHash,
      password: input.password,
    }))
  ) {
    refuse();
  }

  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [credential] = await tx
      .select({
        accountId: account.id,
        passwordHash: account.password,
        accountUpdatedAt: account.updatedAt,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        sessionUpdatedAt: session.updatedAt,
        sessionReauthenticatedAt: session.reauthenticatedAt,
        loginDisabledAt: authUser.ordinaryLoginDisabledAt,
      })
      .from(session)
      .innerJoin(authUser, eq(authUser.id, session.userId))
      .innerJoin(
        account,
        and(eq(account.userId, session.userId), eq(account.providerId, "credential"))
      )
      .where(
        and(
          eq(session.id, input.sessionId),
          eq(session.userId, input.authUserId),
          eq(account.id, admitted.accountId)
        )
      )
      .limit(1)
      .for("update");
    if (
      !credential?.passwordHash ||
      credential.accountId !== admitted.accountId ||
      credential.passwordHash !== admitted.passwordHash ||
      credential.accountUpdatedAt.getTime() !==
        admitted.accountUpdatedAt.getTime() ||
      digest(credential.sessionToken) !== admitted.sessionTokenDigest ||
      credential.sessionExpiresAt.getTime() !==
        admitted.sessionExpiresAt.getTime() ||
      credential.sessionUpdatedAt.getTime() !==
        admitted.sessionUpdatedAt.getTime() ||
      (credential.sessionReauthenticatedAt?.getTime() ?? null) !==
        (admitted.sessionReauthenticatedAt?.getTime() ?? null) ||
      credential.loginDisabledAt !== null ||
      credential.sessionExpiresAt.getTime() <= now.getTime()
    ) {
      refuse();
    }
    const [updated] = await tx
      .update(session)
      .set({ reauthenticatedAt: now, reauthenticatedMethod: "password", updatedAt: now })
      .where(
        and(eq(session.id, input.sessionId), eq(session.userId, input.authUserId))
      )
      .returning({ id: session.id });
    if (!updated) refuse();
    return {
      authUserId: input.authUserId,
      sessionId: input.sessionId,
      reauthenticatedAt: now,
    };
  });
}

// --------------------------------------------- R-164: Google reauthentication
//
// R-118's bar: "recent" means a server-recorded `reauthenticated_at`, set only
// by a FRESH challenge for that exact account and session; ordinary session
// creation never qualifies. A Google sign-in is ordinary session creation, and
// `better-auth@1.6.28`'s Google provider sends no `max_age` and checks no
// `auth_time` (measured in `@better-auth/core/dist/social-providers/google.mjs`),
// so a Google-only creator had no way to meet the bar: every billing action
// joined `providerId = 'credential'` and required a password hash they do not
// have. R-164 adds the challenge: a dedicated route asks Google with
// `prompt=login` and `max_age=0`, and the callback stamps the SESSION THE
// CHALLENGE WAS STARTED FROM only after the server has checked `auth_time` and
// `sub` itself (`stampGoogleReauthentication`). The rows below are that
// route's server-side state; `packages/auth/src/google-reauth.ts` is the flow.

/** The identifier prefix of the single-use state row (Better Auth's `verification` table). */
export const GOOGLE_REAUTH_STATE_PREFIX = "respin-google-reauth:";
const GOOGLE_REAUTH_STATE_ID_RE = /^[A-Za-z0-9_-]{43}$/;

export type GoogleReauthState = Readonly<{
  sessionDigest: string;
  codeVerifier: string;
  nonce: string;
  /** The DATABASE instant the challenge was requested; `auth_time` may not precede it. */
  requestedAt: Date;
}>;

/**
 * R-166 (gate M5): the Google challenge's limits. Start and callback each take
 * R-118's bucket shape — five per fifteen minutes — per account (start only;
 * the callback knows no account until it has consumed the state) and per
 * pseudonymous client. And at most this many challenge rows are OUTSTANDING
 * per account: a new one deletes that account's oldest beyond it.
 */
export const GOOGLE_REAUTH_MAX_ATTEMPTS = REAUTHENTICATION_MAX_ATTEMPTS;
export const GOOGLE_REAUTH_ATTEMPT_WINDOW_MS = REAUTHENTICATION_ATTEMPT_WINDOW_MS;
export const GOOGLE_REAUTH_MAX_OUTSTANDING = 3;

/**
 * Start a Google challenge for EXACTLY this session: refused unless the session
 * is live, ordinary login is enabled, and the user has a linked Google account.
 * The row carries no user id — only digests of the account and the session
 * id, the PKCE verifier and the nonce — and expires with R-118's window.
 *
 * Rate-limited per account and per client (`rate_limited`, committed before
 * the refusal so a refused attempt still counts); expired challenge rows are
 * swept here, and the account's outstanding rows are capped at
 * `GOOGLE_REAUTH_MAX_OUTSTANDING` (R-166, gate M5).
 */
export async function reserveGoogleReauthentication(
  db: DbLike,
  input: Readonly<{
    stateId: string;
    authUserId: string;
    sessionId: string;
    codeVerifier: string;
    nonce: string;
    rateLimitKeyDigest: string;
  }>
): Promise<GoogleReauthState> {
  if (
    !GOOGLE_REAUTH_STATE_ID_RE.test(input.stateId) ||
    !input.authUserId ||
    !input.sessionId ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier) ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(input.nonce) ||
    !/^[0-9a-f]{64}$/.test(input.rateLimitKeyDigest)
  ) {
    refuse();
  }
  const accountDigest = digest(input.authUserId);
  const reserved = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const allowed = await consumeRateBucketsInTx(
      tx,
      [`r164:start:account:${accountDigest}`, `r164:start:client:${input.rateLimitKeyDigest}`],
      now.getTime(),
      GOOGLE_REAUTH_ATTEMPT_WINDOW_MS,
      GOOGLE_REAUTH_MAX_ATTEMPTS
    );
    if (!allowed) return null;
    const [live] = await tx
      .select({ expiresAt: session.expiresAt, loginDisabledAt: authUser.ordinaryLoginDisabledAt })
      .from(session)
      .innerJoin(authUser, eq(authUser.id, session.userId))
      .innerJoin(
        account,
        and(eq(account.userId, session.userId), eq(account.providerId, "google"))
      )
      .where(and(eq(session.id, input.sessionId), eq(session.userId, input.authUserId)))
      .limit(1);
    if (!live || live.loginDisabledAt !== null || live.expiresAt.getTime() <= now.getTime()) {
      refuseWith("not_reauthenticable");
    }
    // Expired challenge rows, every account's: a consumed row is deleted as it
    // is read, an abandoned one only here.
    await tx
      .delete(verification)
      .where(
        and(
          sql`${verification.identifier} LIKE ${`${GOOGLE_REAUTH_STATE_PREFIX}%`}`,
          sql`${verification.expiresAt} <= ${now}`
        )
      );
    // This account's outstanding rows, newest first; all but the newest
    // `GOOGLE_REAUTH_MAX_OUTSTANDING - 1` go, so with the insert below the
    // account never holds more than the cap. The marker is a hex digest
    // inside JSON this function wrote, so the LIKE pattern has no wildcard.
    const outstanding = await tx
      .select({ id: verification.id })
      .from(verification)
      .where(
        and(
          sql`${verification.identifier} LIKE ${`${GOOGLE_REAUTH_STATE_PREFIX}%`}`,
          sql`${verification.value} LIKE ${`%"accountDigest":"${accountDigest}"%`}`
        )
      )
      .orderBy(sql`${verification.createdAt} DESC`, sql`${verification.id} DESC`);
    const superseded = outstanding.slice(GOOGLE_REAUTH_MAX_OUTSTANDING - 1).map((row) => row.id);
    if (superseded.length > 0) {
      await tx.delete(verification).where(inArray(verification.id, superseded));
    }
    const state: GoogleReauthState = {
      sessionDigest: digest(input.sessionId),
      codeVerifier: input.codeVerifier,
      nonce: input.nonce,
      requestedAt: now,
    };
    await tx.insert(verification).values({
      id: randomBytes(16).toString("hex"),
      identifier: `${GOOGLE_REAUTH_STATE_PREFIX}${input.stateId}`,
      value: JSON.stringify({ v: 1, ...state, requestedAt: now.toISOString(), accountDigest }),
      expiresAt: new Date(now.getTime() + DELETION_REAUTH_MAX_AGE_MS),
      createdAt: now,
      updatedAt: now,
    });
    return state;
  });
  if (reserved === null) refuseWith("rate_limited");
  return reserved;
}

/**
 * SINGLE-USE: the row is DELETED as it is read, so a replayed state finds
 * nothing and refuses. An expired row is refused too (and is gone either way).
 * Rate-limited per client FIRST (R-166, gate M5): a limited callback consumes
 * nothing, and its bucket consumption commits before the refusal.
 */
export async function consumeGoogleReauthentication(
  db: DbLike,
  stateId: string,
  rateLimitKeyDigest: string
): Promise<GoogleReauthState> {
  if (!GOOGLE_REAUTH_STATE_ID_RE.test(stateId) || !/^[0-9a-f]{64}$/.test(rateLimitKeyDigest)) refuse();
  const allowed = await db.transaction(async (tx) =>
    consumeRateBucketsInTx(
      tx,
      [`r164:callback:client:${rateLimitKeyDigest}`],
      (await databaseNow(tx)).getTime(),
      GOOGLE_REAUTH_ATTEMPT_WINDOW_MS,
      GOOGLE_REAUTH_MAX_ATTEMPTS
    )
  );
  if (!allowed) refuseWith("rate_limited");
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [row] = await tx
      .delete(verification)
      .where(eq(verification.identifier, `${GOOGLE_REAUTH_STATE_PREFIX}${stateId}`))
      .returning({ value: verification.value, expiresAt: verification.expiresAt });
    if (!row || row.expiresAt.getTime() <= now.getTime()) refuse();
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      refuse();
    }
    const value = parsed as Partial<Record<"v" | "sessionDigest" | "codeVerifier" | "nonce" | "requestedAt", unknown>>;
    const requestedAt = typeof value.requestedAt === "string" ? new Date(value.requestedAt) : null;
    if (
      value.v !== 1 ||
      typeof value.sessionDigest !== "string" ||
      typeof value.codeVerifier !== "string" ||
      typeof value.nonce !== "string" ||
      requestedAt === null ||
      Number.isNaN(requestedAt.getTime())
    ) {
      refuse();
    }
    return {
      sessionDigest: value.sessionDigest,
      codeVerifier: value.codeVerifier,
      nonce: value.nonce,
      requestedAt,
    };
  });
}

/**
 * THE STAMP (R-164 step 3). Every check is the SERVER'S, on claims the
 * verifier returned, and each refusal names its own condition
 * (`GOOGLE_REAUTH_DB_REFUSAL_CODES`, R-166 gate M6):
 *   - `authTime` is REQUIRED — a token without `auth_time` is refused, fail
 *     closed; that is the silent-SSO case `max_age=0` exists to rule out;
 *   - `authTime` is not earlier than the challenge's own request instant
 *     (second granularity, the claim's), and inside R-118's ten-minute window;
 *   - `sub` equals the `accountId` of a `google` account linked to THIS
 *     session's user;
 *   - the stamp lands on THIS session (the one the state was bound to), never
 *     a session the callback created.
 * The stamp is `min(now, auth_time)` (R-166, gate Low): the window then runs
 * from when the person actually authenticated, never from when the callback
 * happened to arrive. It records `reauthenticated_method = 'google'`, which
 * billing admits and DELETION does not (`requireReauthenticatedSession`).
 */
export async function stampGoogleReauthentication(
  db: DbLike,
  input: Readonly<{
    authUserId: string;
    sessionId: string;
    sub: string;
    authTime: number | undefined;
    requestedAt: Date;
  }>
): Promise<ReauthenticatedSessionRef> {
  if (
    !input.authUserId ||
    !input.sessionId ||
    !(input.requestedAt instanceof Date) ||
    Number.isNaN(input.requestedAt.getTime())
  ) {
    refuseWith("stamp_input_invalid");
  }
  if (typeof input.sub !== "string" || input.sub.length === 0) refuseWith("stamp_sub_missing");
  if (typeof input.authTime !== "number" || !Number.isSafeInteger(input.authTime)) {
    refuseWith("stamp_auth_time_missing");
  }
  const authTime = input.authTime;
  const authTimeMs = authTime * 1_000;
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [live] = await tx
      .select({
        expiresAt: session.expiresAt,
        loginDisabledAt: authUser.ordinaryLoginDisabledAt,
      })
      .from(session)
      .innerJoin(authUser, eq(authUser.id, session.userId))
      .where(and(eq(session.id, input.sessionId), eq(session.userId, input.authUserId)))
      .limit(1)
      .for("update");
    if (!live) refuseWith("stamp_session_unavailable");
    const [linked] = await tx
      .select({ accountId: account.accountId })
      .from(account)
      .where(
        and(
          eq(account.userId, input.authUserId),
          eq(account.providerId, "google"),
          eq(account.accountId, input.sub)
        )
      )
      .limit(1);
    if (!linked || linked.accountId !== input.sub) refuseWith("stamp_sub_mismatch");
    if (live.loginDisabledAt !== null) refuseWith("stamp_login_disabled");
    if (live.expiresAt.getTime() <= now.getTime()) refuseWith("stamp_session_expired");
    // Not earlier than the challenge (both at the claim's second granularity).
    if (authTime < Math.floor(input.requestedAt.getTime() / 1_000)) {
      refuseWith("stamp_auth_time_before_challenge");
    }
    // Not in the future beyond ordinary clock skew (Google's clock, ours).
    if (authTimeMs > now.getTime() + REAUTH_CROSS_CLOCK_TOLERANCE_MS) refuseWith("stamp_auth_time_future");
    // Inside R-118's window.
    if (now.getTime() - authTimeMs > DELETION_REAUTH_MAX_AGE_MS) refuseWith("stamp_auth_time_stale");
    const stampedAt = new Date(Math.min(now.getTime(), authTimeMs));
    const [updated] = await tx
      .update(session)
      .set({ reauthenticatedAt: stampedAt, reauthenticatedMethod: "google", updatedAt: now })
      .where(and(eq(session.id, input.sessionId), eq(session.userId, input.authUserId)))
      .returning({ id: session.id });
    // Unreachable while the row lock above holds; named so it is never a bare refusal.
    if (!updated) refuseWith("stamp_session_changed");
    return { authUserId: input.authUserId, sessionId: input.sessionId, reauthenticatedAt: stampedAt };
  });
}

/** Future-side skew only (`deletion-lifecycle.ts`'s `CROSS_CLOCK_TOLERANCE_MS` reason). */
const REAUTH_CROSS_CLOCK_TOLERANCE_MS = 60_000;

/**
 * THE ARMS OF BILLING REAUTHENTICATION, as a list (R-164, Respin rule 7). One
 * query reads the session's provider rows; each provider is admitted by its own
 * arm, and a provider not listed here is REFUSED — a third provider is an edit
 * here and a red test until it is made:
 *   - `credential`: the password arm, unchanged —
 *     `reauthenticateSessionWithPassword` verifies the password NOW and stamps;
 *   - `google`: the recorded-stamp arm — the stamp
 *     `stampGoogleReauthentication` wrote after a `max_age=0` challenge, read
 *     here and admitted only while it is inside R-118's window.
 */
export const BILLING_REAUTHENTICATION_ARMS = ["credential", "google"] as const;
export type BillingReauthenticationArm = (typeof BILLING_REAUTHENTICATION_ARMS)[number];

/**
 * The `google` arm: the session's recorded stamp, admitted iff the session's
 * user has a linked `google` account, the session is live, ordinary login is
 * enabled, and the stamp is inside the window. Returns the exact ref
 * `assertReauthenticatedWorkspaceScopeInTx` re-checks in the billing
 * transaction. Never writes: this arm only ever READS a stamp a challenge made.
 */
export async function recordedGoogleReauthentication(
  db: DbLike,
  input: Readonly<{ authUserId: string; sessionId: string }>
): Promise<ReauthenticatedSessionRef> {
  if (!input.authUserId || !input.sessionId) refuse();
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const rows = await tx
      .select({
        providerId: account.providerId,
        reauthenticatedAt: session.reauthenticatedAt,
        expiresAt: session.expiresAt,
        loginDisabledAt: authUser.ordinaryLoginDisabledAt,
      })
      .from(session)
      .innerJoin(authUser, eq(authUser.id, session.userId))
      .innerJoin(account, eq(account.userId, session.userId))
      .where(and(eq(session.id, input.sessionId), eq(session.userId, input.authUserId)));
    const arms = new Set(
      rows
        .map((row) => row.providerId)
        .filter((provider): provider is BillingReauthenticationArm =>
          (BILLING_REAUTHENTICATION_ARMS as readonly string[]).includes(provider)
        )
    );
    const first = rows[0];
    const at = first?.reauthenticatedAt?.getTime();
    if (
      !first ||
      !arms.has("google") ||
      first.loginDisabledAt !== null ||
      first.expiresAt.getTime() <= now.getTime() ||
      at === undefined ||
      at > now.getTime() + REAUTH_CROSS_CLOCK_TOLERANCE_MS ||
      now.getTime() - at > DELETION_REAUTH_MAX_AGE_MS
    ) {
      refuse();
    }
    return {
      authUserId: input.authUserId,
      sessionId: input.sessionId,
      reauthenticatedAt: first.reauthenticatedAt!,
    };
  });
}

/** Exchange the delivered recovery credential for one short-lived password attempt. */
export async function beginIdentityCancellationRecoverySession(
  db: DbLike,
  operationId: string,
  recoverySecret: string,
  rateLimitKeyDigest: string
): Promise<{ recoverySession: string; expiresAt: Date }> {
  if (
    !UUID_RE.test(operationId) ||
    !validRecoverySecret(recoverySecret) ||
    !/^[0-9a-f]{64}$/.test(rateLimitKeyDigest)
  ) {
    refuse();
  }
  const admitted = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [operation] = await tx
      .select({
        userId: deletionOperations.userId,
        authUserId: users.authUserId,
        recoverySecretDigest: deletionOperations.recoverySecretDigest,
        recoveryConsumedAt: deletionOperations.recoveryConsumedAt,
        recoveryExpiresAt: deletionOperations.recoveryExpiresAt,
        graceExpiresAt: deletionOperations.graceExpiresAt,
      })
      .from(deletionOperations)
      .innerJoin(users, eq(users.id, deletionOperations.userId))
      .where(
        and(
          eq(deletionOperations.id, operationId),
          eq(deletionOperations.scope, "identity"),
          inArray(deletionOperations.state, [
            "tombstoned",
            "external_actions_pending",
            "grace",
          ])
        )
      )
      .limit(1)
      .for("update");
    if (
      !operation?.userId ||
      !operation.recoverySecretDigest ||
      operation.recoveryConsumedAt ||
      !operation.recoveryExpiresAt ||
      operation.recoveryExpiresAt.getTime() <= now.getTime() ||
      !operation.graceExpiresAt ||
      operation.graceExpiresAt.getTime() <= now.getTime()
    ) {
      refuse();
    }
    // Operation locking serialises one identity; the advisory key additionally
    // serialises the shared pseudonymous client bucket across different
    // operations, closing the count-then-insert race without retaining raw IP.
    await lockAuthRateKey(tx, rateLimitKeyDigest);
    const attemptWindowStart = new Date(
      now.getTime() - CANCELLATION_RECOVERY_SESSION_TTL_MS
    );
    const [[operationAttempts], [keyAttempts]] = await Promise.all([
      tx
        .select({ value: count() })
        .from(deletionRecoverySessions)
        .where(
          and(
            eq(deletionRecoverySessions.operationId, operationId),
            gte(deletionRecoverySessions.createdAt, attemptWindowStart)
          )
        ),
      tx
        .select({ value: count() })
        .from(deletionRecoverySessions)
        .where(
          and(
            eq(deletionRecoverySessions.rateLimitKeyDigest, rateLimitKeyDigest),
            gte(deletionRecoverySessions.createdAt, attemptWindowStart)
          )
        ),
    ]);
    if (
      (operationAttempts?.value ?? 0) >= CANCELLATION_FACTOR_MAX_ATTEMPTS ||
      (keyAttempts?.value ?? 0) >= CANCELLATION_FACTOR_MAX_ATTEMPTS
    ) {
      refuse();
    }
    const recoverySession = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + CANCELLATION_RECOVERY_SESSION_TTL_MS);
    const secretAccepted = equalDigest(recoverySecret, operation.recoverySecretDigest);
    await tx.insert(deletionRecoverySessions).values({
      operationId,
      authUserId: operation.authUserId,
      secretDigest: digest(recoverySession),
      secretPrefix: recoverySession.slice(0, 8),
      rateLimitKeyDigest,
      expiresAt,
      consumedAt: secretAccepted ? null : now,
      createdAt: now,
    });
    return secretAccepted ? { recoverySession, expiresAt } : null;
  });
  if (!admitted) refuse();
  return admitted;
}

/**
 * Fresh-factor authority after identity tombstoning. Admission consumes the
 * exact recovery session before password verification, so expensive hashing
 * runs without holding identity/workspace locks and every attempt is bounded.
 */
export async function createIdentityCancellationProofWithPassword(
  db: DbLike,
  operationId: string,
  recoverySession: string,
  password: string,
  rateLimitKeyDigest: string
): Promise<{ proofId: string; cancellationReceipt: string; expiresAt: Date }> {
  if (
    !UUID_RE.test(operationId) ||
    !validRecoverySecret(recoverySession) ||
    typeof password !== "string" ||
    password.length > AUTH_PASSWORD_MAX_LENGTH ||
    !/^[0-9a-f]{64}$/.test(rateLimitKeyDigest)
  ) {
    refuse();
  }
  const admitted = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const authorities = await tx
      .select({
        recoverySessionId: deletionRecoverySessions.id,
        recoverySessionDigest: deletionRecoverySessions.secretDigest,
        recoverySessionExpiresAt: deletionRecoverySessions.expiresAt,
        recoverySessionConsumedAt: deletionRecoverySessions.consumedAt,
        persistedAuthUserId: deletionRecoverySessions.authUserId,
        userId: deletionOperations.userId,
        authUserId: users.authUserId,
        accountId: account.id,
        passwordHash: account.password,
        accountUpdatedAt: account.updatedAt,
        loginDisabledAt: authUser.ordinaryLoginDisabledAt,
        journalIntentPlanDigest: deletionOperations.journalIntentPlanDigest,
        graceExpiresAt: deletionOperations.graceExpiresAt,
      })
      .from(deletionRecoverySessions)
      .innerJoin(
        deletionOperations,
        eq(deletionOperations.id, deletionRecoverySessions.operationId)
      )
      .innerJoin(users, eq(users.id, deletionOperations.userId))
      .innerJoin(authUser, eq(authUser.id, users.authUserId))
      .innerJoin(
        account,
        and(eq(account.userId, users.authUserId), eq(account.providerId, "credential"))
      )
      .where(
        and(
          eq(deletionOperations.id, operationId),
          eq(deletionOperations.scope, "identity"),
          eq(deletionRecoverySessions.authUserId, users.authUserId),
          eq(deletionRecoverySessions.secretDigest, digest(recoverySession)),
          eq(deletionRecoverySessions.rateLimitKeyDigest, rateLimitKeyDigest),
          isNull(deletionRecoverySessions.consumedAt),
          inArray(deletionOperations.state, [
            "tombstoned",
            "external_actions_pending",
            "grace",
          ])
        )
      )
      .limit(2)
      .for("update");
    const authority = authorities.length === 1 ? authorities[0] : undefined;
    if (
      !authority?.recoverySessionId ||
      !authority?.userId ||
      authority.persistedAuthUserId !== authority.authUserId ||
      !authority.passwordHash ||
      authority.loginDisabledAt === null ||
      authority.recoverySessionConsumedAt !== null ||
      authority.recoverySessionExpiresAt.getTime() <= now.getTime() ||
      !authority.graceExpiresAt ||
      authority.graceExpiresAt.getTime() <= now.getTime()
    ) {
      refuse();
    }
    const [consumed] = await tx
      .update(deletionRecoverySessions)
      .set({ consumedAt: now })
      .where(
        and(
          eq(deletionRecoverySessions.id, authority.recoverySessionId),
          isNull(deletionRecoverySessions.consumedAt)
        )
      )
      .returning({ id: deletionRecoverySessions.id });
    if (!consumed) refuse();
    return {
      ...authority,
      userId: authority.userId,
      passwordHash: authority.passwordHash,
    } as typeof authority & { userId: string; passwordHash: string };
  });

  if (!(await verifyPassword({ hash: admitted.passwordHash, password }))) refuse();

  const cancellationReceipt = randomBytes(32).toString("base64url");

  return db.transaction(async (tx) => {
    if (!admitted.userId) refuse();
    await lockIdentityMembershipGraph(tx, admitted.userId);
    const now = await databaseNow(tx);
    const authorities = await tx
      .select({
        userId: deletionOperations.userId,
        authUserId: users.authUserId,
        accountId: account.id,
        passwordHash: account.password,
        accountUpdatedAt: account.updatedAt,
        loginDisabledAt: authUser.ordinaryLoginDisabledAt,
        journalIntentPlanDigest: deletionOperations.journalIntentPlanDigest,
        graceExpiresAt: deletionOperations.graceExpiresAt,
        recoverySessionId: deletionRecoverySessions.id,
        recoverySessionExpiresAt: deletionRecoverySessions.expiresAt,
        recoverySessionConsumedAt: deletionRecoverySessions.consumedAt,
        persistedAuthUserId: deletionRecoverySessions.authUserId,
      })
      .from(deletionRecoverySessions)
      .innerJoin(
        deletionOperations,
        eq(deletionOperations.id, deletionRecoverySessions.operationId)
      )
      .innerJoin(users, eq(users.id, deletionOperations.userId))
      .innerJoin(authUser, eq(authUser.id, users.authUserId))
      .innerJoin(
        account,
        and(eq(account.userId, users.authUserId), eq(account.providerId, "credential"))
      )
      .where(
        and(
          eq(deletionRecoverySessions.id, admitted.recoverySessionId),
          eq(deletionRecoverySessions.operationId, operationId),
          eq(deletionRecoverySessions.authUserId, users.authUserId),
          eq(deletionRecoverySessions.rateLimitKeyDigest, rateLimitKeyDigest),
          inArray(deletionOperations.state, [
            "tombstoned",
            "external_actions_pending",
            "grace",
          ])
        )
      )
      .limit(2)
      .for("update");
    const authority = authorities.length === 1 ? authorities[0] : undefined;
    if (
      !authority?.userId ||
      authority.userId !== admitted.userId ||
      authority.authUserId !== admitted.authUserId ||
      authority.persistedAuthUserId !== admitted.authUserId ||
      authority.accountId !== admitted.accountId ||
      authority.accountUpdatedAt.getTime() !== admitted.accountUpdatedAt.getTime() ||
      authority.passwordHash !== admitted.passwordHash ||
      authority.loginDisabledAt === null ||
      authority.journalIntentPlanDigest !== null ||
      !authority.recoverySessionConsumedAt ||
      authority.recoverySessionExpiresAt.getTime() <= now.getTime() ||
      !authority.graceExpiresAt ||
      authority.graceExpiresAt.getTime() <= now.getTime()
    ) {
      refuse();
    }
    await tx
      .update(deletionCancellationProofs)
      .set({ consumedAt: now })
      .where(
        and(
          eq(deletionCancellationProofs.operationId, operationId),
          isNull(deletionCancellationProofs.consumedAt)
        )
      );
    const expiresAt = new Date(now.getTime() + DELETION_REAUTH_MAX_AGE_MS);
    const [proof] = await tx
      .insert(deletionCancellationProofs)
      .values({
        operationId,
        authUserId: authority.authUserId,
        recoverySessionId: authority.recoverySessionId,
        statusReceiptDigest: digest(cancellationReceipt),
        factorVerifiedAt: now,
        expiresAt,
      })
      .returning({ id: deletionCancellationProofs.id });
    if (!proof) refuse();
    return { proofId: proof.id, cancellationReceipt, expiresAt };
  });
}
