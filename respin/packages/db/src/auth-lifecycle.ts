import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { account, rateLimit, session, user as authUser } from "./auth-schema";
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
    const nowMs = now.getTime();
    const windowStartMs = nowMs - REAUTHENTICATION_ATTEMPT_WINDOW_MS;
    const keys = [
      `r118:account:${digest(input.authUserId)}`,
      `r118:client:${input.rateLimitKeyDigest}`,
    ] as const;
    // One stable lock order makes the per-account and pseudonymous-client
    // decision atomic as a pair. A refused pair still commits the independent
    // bucket consumptions; throwing inside this transaction would roll them
    // back and make the durable admission look present while doing no work.
    for (const key of [...keys].sort()) await lockAuthRateKey(tx, key);
    const existing = await tx
      .select({
        key: rateLimit.key,
        count: rateLimit.count,
        lastRequest: rateLimit.lastRequest,
      })
      .from(rateLimit)
      .where(inArray(rateLimit.key, keys));
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
      if (current.count >= REAUTHENTICATION_MAX_ATTEMPTS) {
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
      .set({ reauthenticatedAt: now, updatedAt: now })
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
