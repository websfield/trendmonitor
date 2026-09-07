// Phase 10b-1 Task 4 — the closed Resend auth-delivery authority (R-118).
//
// Every transactional mail the product sends goes through `admitAuthMail`
// first: one advisory lock, one count against the compiled daily/monthly
// ceilings, one outbox row — then the provider. A send that was not durably
// recorded as accepted is never reported delivered, and a refused admission
// leaves no row (refusals do not consume quota).
//
// This module is the sole APPLICATION writer of `auth_mail_outbox`; at
// identity erasure the registry-driven SQL port (`lifecycle-sql-port.ts`,
// `DYNAMIC_LIFECYCLE_WRITER`) nulls the recipient link, covered by registry
// closure and the independent probe rather than by the writer scanner. The
// Resend HTTP adapter lives in `packages/auth/src/resend-mail.ts` and
// implements the `AuthMailPort` below; this package never sees an API key.
import { createHash } from "node:crypto";
import { and, count, eq, isNull, lt, sql } from "drizzle-orm";
import { user as authUser } from "./auth-schema";
import {
  authMailOutbox,
  type AuthMailOutboxRow,
  type AuthMailPurpose,
} from "./auth-mail-schema";
import type { DbLike, TxLike } from "./db-like";
import type {
  RecoveryDeliveryPort,
  RecoveryDeliveryReconciliationRequest,
  RecoveryDeliveryRequest,
  RecoveryDeliveryResult,
} from "./deletion-ports";

export class AuthMailRefusedError extends Error {
  constructor(readonly code: string) {
    super(`auth_mail_refused:${code}`);
    this.name = "AuthMailRefusedError";
  }
}

function refuse(code: string): never {
  throw new AuthMailRefusedError(code);
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const HEX64 = /^[0-9a-f]{64}$/;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const AUTH_MAIL_PURPOSES = [
  "email_verification",
  "password_reset",
  "identity_deletion_recovery",
  "local_factor_enrollment",
  "workspace_invite",
] as const satisfies readonly AuthMailPurpose[];

/** Exact action lifetimes (plan C2). A caller may shorten, never extend. */
export const AUTH_MAIL_TTL_MS = {
  email_verification: 24 * HOUR,
  password_reset: 15 * MINUTE,
  identity_deletion_recovery: 7 * DAY,
  local_factor_enrollment: 15 * MINUTE,
  workspace_invite: 7 * DAY,
} as const satisfies Readonly<Record<AuthMailPurpose, number>>;

export type AuthMailCeilings = Readonly<{
  totalPerDay: number;
  totalPerMonth: number;
  invitesPerDay: number;
  invitesPerMonth: number;
}>;

/**
 * R-118: 80% of the cited Resend free allowance, with invites capped so that
 * account/security mail always retains a reserve. The reserve is DERIVED, not
 * configured, so nobody can configure it away.
 */
export const AUTH_MAIL_COMPILED_CEILINGS: AuthMailCeilings = {
  totalPerDay: 80,
  totalPerMonth: 2_400,
  invitesPerDay: 60,
  invitesPerMonth: 1_800,
};

export const AUTH_MAIL_SECURITY_RESERVE = {
  perDay: AUTH_MAIL_COMPILED_CEILINGS.totalPerDay - AUTH_MAIL_COMPILED_CEILINGS.invitesPerDay,
  perMonth:
    AUTH_MAIL_COMPILED_CEILINGS.totalPerMonth - AUTH_MAIL_COMPILED_CEILINGS.invitesPerMonth,
} as const;

/**
 * Runtime configuration may only TIGHTEN. Any value that is not a positive
 * safe integer at or below the compiled ceiling refuses (fail closed); an
 * invite ceiling can never exceed the total it sits inside, and the security
 * reserve is a FLOOR (R-118: at least 20/day, 600/month), not a ratio — a
 * total lowered without lowering invites is refused, never silently re-split.
 */
export function resolveAuthMailCeilings(
  override?: Partial<AuthMailCeilings> | null
): AuthMailCeilings {
  const resolved = { ...AUTH_MAIL_COMPILED_CEILINGS };
  for (const key of Object.keys(resolved) as (keyof AuthMailCeilings)[]) {
    const value = override?.[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 1 || value > AUTH_MAIL_COMPILED_CEILINGS[key]) {
      refuse(`ceiling_invalid:${key}`);
    }
    resolved[key] = value;
  }
  if (resolved.totalPerDay - resolved.invitesPerDay < AUTH_MAIL_SECURITY_RESERVE.perDay) {
    refuse("ceiling_invalid:invitesPerDay");
  }
  if (resolved.totalPerMonth - resolved.invitesPerMonth < AUTH_MAIL_SECURITY_RESERVE.perMonth) {
    refuse("ceiling_invalid:invitesPerMonth");
  }
  return resolved;
}

export type AuthMailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  /** The outbox row id — the provider idempotency key. */
  idempotencyKey: string;
}>;

export type AuthMailSendResult =
  | Readonly<{ outcome: "accepted"; providerMessageId: string }>
  | Readonly<{ outcome: "failed"; failureCode: string }>
  | Readonly<{ outcome: "unknown"; failureCode: string }>;

/** Domain port. `send` is called at most once per outbox row. */
export interface AuthMailPort {
  send(message: AuthMailMessage): Promise<AuthMailSendResult>;
}

const SUBJECTS = {
  email_verification: "Verify your email address",
  password_reset: "Reset your password",
  identity_deletion_recovery: "Your account deletion request",
  local_factor_enrollment: "Set up a password for your account",
  workspace_invite: "You have been invited to a workspace",
} as const satisfies Readonly<Record<AuthMailPurpose, string>>;

const ACTION_LINES = {
  email_verification: "Confirm this email address by opening the link below.",
  password_reset: "Choose a new password by opening the link below.",
  identity_deletion_recovery:
    "Account deletion was requested. Keep this link: it is the only way to cancel the deletion during the seven-day grace period.",
  local_factor_enrollment: "Set a password for your account by opening the link below.",
  workspace_invite: "Accept the invitation by opening the link below.",
} as const satisfies Readonly<Record<AuthMailPurpose, string>>;

/**
 * Purpose, action URL and expiry — nothing else. No name, workspace, creator
 * content or secret other than the one the URL itself carries.
 */
export function renderAuthMail(input: Readonly<{
  purpose: AuthMailPurpose;
  actionUrl: string;
  actionExpiresAt: Date;
}>): Readonly<{ subject: string; text: string }> {
  return {
    subject: SUBJECTS[input.purpose],
    text: [
      ACTION_LINES[input.purpose],
      "",
      input.actionUrl,
      "",
      `This link expires at ${input.actionExpiresAt.toISOString()}.`,
      "",
      "If you did not request this, you can ignore this message.",
    ].join("\n"),
  };
}

async function databaseNow(tx: TxLike): Promise<Date> {
  const result = (await tx.execute(
    sql`SELECT clock_timestamp() AS now`
  )) as unknown as { rows: { now: Date | string }[] };
  const raw = result.rows[0]?.now;
  const value = raw instanceof Date ? raw : new Date(raw ?? Number.NaN);
  if (Number.isNaN(value.getTime())) refuse("database_clock_unavailable");
  return value;
}

/** One global lock: every admission on every instance serialises here. */
async function lockQuota(tx: TxLike): Promise<void> {
  const key = createHash("sha256").update("respin:auth-mail-quota:v1", "utf8").digest();
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${key.readInt32BE(0)}, ${key.readInt32BE(4)})`
  );
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type AuthMailAdmissionParams = Readonly<{
  purpose: AuthMailPurpose;
  authUserId: string;
  /** The action's real expiry; must not exceed now + the purpose TTL. */
  actionExpiresAt: Date;
  /** Fixed by the caller when it already minted the command (recovery). */
  id?: string;
  operationId?: string;
  deliveryAttempt?: number;
  ceilings?: Partial<AuthMailCeilings> | null;
}>;

export type AuthMailAdmission = Readonly<{
  row: AuthMailOutboxRow;
  /** Returned in memory for the send; never persisted here. */
  recipientEmail: string;
}>;

/**
 * The action expiry is computed on the APP clock and checked against the
 * database clock; app and database are separate hosts in the Lightsail
 * target, so a database lagging by a millisecond would otherwise refuse every
 * reset and verification mail (round-1 lean CHANGE C4). One minute of skew is
 * tolerated on the upper bound only; the lower bound stays exact.
 */
export const AUTH_MAIL_CLOCK_SKEW_MS = 60_000;

/**
 * DB-atomic admission. Counts the whole outbox under the advisory lock, so
 * two instances cannot both see 79 and both admit the 80th.
 */
export async function admitAuthMail(
  db: DbLike,
  params: AuthMailAdmissionParams
): Promise<AuthMailAdmission> {
  if (!(AUTH_MAIL_PURPOSES as readonly string[]).includes(params.purpose)) {
    refuse("purpose_unknown");
  }
  const ceilings = resolveAuthMailCeilings(params.ceilings);
  const recovery = params.purpose === "identity_deletion_recovery";
  if (recovery !== (params.operationId !== undefined)) refuse("operation_link_shape");
  if (recovery && !(Number.isSafeInteger(params.deliveryAttempt) && params.deliveryAttempt! >= 1)) {
    refuse("delivery_attempt_invalid");
  }
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    if (
      !(params.actionExpiresAt instanceof Date) ||
      Number.isNaN(params.actionExpiresAt.getTime()) ||
      params.actionExpiresAt.getTime() <= now.getTime() ||
      params.actionExpiresAt.getTime() > now.getTime() + AUTH_MAIL_TTL_MS[params.purpose] + AUTH_MAIL_CLOCK_SKEW_MS
    ) {
      refuse("action_expiry_out_of_range");
    }
    const [recipient] = await tx
      .select({ email: authUser.email })
      .from(authUser)
      .where(eq(authUser.id, params.authUserId))
      .limit(1);
    if (!recipient?.email) refuse("recipient_unknown");
    await lockQuota(tx);
    const day = utcDay(now);
    const month = day.slice(0, 7);
    const countWhere = async (conditions: ReturnType<typeof and>) => {
      const [row] = await tx.select({ value: count() }).from(authMailOutbox).where(conditions);
      return Number(row?.value) || 0;
    };
    const [totalDay, totalMonth] = await Promise.all([
      countWhere(and(eq(authMailOutbox.admittedDayUtc, day))),
      countWhere(and(eq(authMailOutbox.admittedMonthUtc, month))),
    ]);
    if (totalDay >= ceilings.totalPerDay) refuse("quota_day_exhausted");
    if (totalMonth >= ceilings.totalPerMonth) refuse("quota_month_exhausted");
    if (params.purpose === "workspace_invite") {
      const [inviteDay, inviteMonth] = await Promise.all([
        countWhere(and(eq(authMailOutbox.admittedDayUtc, day), eq(authMailOutbox.purpose, "workspace_invite"))),
        countWhere(and(eq(authMailOutbox.admittedMonthUtc, month), eq(authMailOutbox.purpose, "workspace_invite"))),
      ]);
      if (inviteDay >= ceilings.invitesPerDay) refuse("invite_quota_day_exhausted");
      if (inviteMonth >= ceilings.invitesPerMonth) refuse("invite_quota_month_exhausted");
    }
    const [row] = await tx
      .insert(authMailOutbox)
      .values({
        ...(params.id ? { id: params.id } : {}),
        purpose: params.purpose,
        authUserId: params.authUserId,
        recipientDigest: digest(`auth-mail-recipient:v1:${params.authUserId}`),
        operationId: params.operationId ?? null,
        deliveryAttempt: recovery ? params.deliveryAttempt! : null,
        admittedAt: now,
        admittedDayUtc: day,
        admittedMonthUtc: month,
        actionExpiresAt: params.actionExpiresAt,
      })
      .returning();
    if (!row) refuse("insert_failed");
    return { row, recipientEmail: recipient.email };
  });
}

async function markDispatched(db: DbLike, id: string): Promise<AuthMailOutboxRow | null> {
  const [row] = await db
    .update(authMailOutbox)
    .set({ dispatchedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(authMailOutbox.id, id),
        eq(authMailOutbox.status, "pending"),
        isNull(authMailOutbox.dispatchedAt)
      )
    )
    .returning();
  return row ?? null;
}

/** The ONE outcome writer; terminal rows accept only an identical replay. */
export async function recordAuthMailOutcome(
  db: DbLike,
  id: string,
  result: AuthMailSendResult
): Promise<AuthMailOutboxRow> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(authMailOutbox)
      .where(eq(authMailOutbox.id, id))
      .limit(1)
      .for("update");
    if (!current) refuse("outbox_row_not_found");
    const now = await databaseNow(tx);
    const providerMessageDigest =
      result.outcome === "accepted"
        ? digest(`auth-mail:${current.id}:${result.providerMessageId}`)
        : null;
    const reconciliationDigest =
      result.outcome === "unknown"
        ? digest(`auth-mail-unknown:${current.id}:${result.failureCode}`)
        : null;
    if (current.status === "accepted") {
      if (result.outcome !== "accepted" || current.providerMessageDigest !== providerMessageDigest) {
        refuse("terminal_outcome_conflict");
      }
      return current;
    }
    if (current.status === "failed") {
      if (result.outcome !== "failed" || current.failureCode !== result.failureCode) {
        refuse("terminal_outcome_conflict");
      }
      return current;
    }
    if (result.outcome !== "failed" && current.dispatchedAt === null) {
      refuse("outcome_before_dispatch");
    }
    if (result.outcome !== "accepted" && (!result.failureCode || result.failureCode.length > 64)) {
      refuse("failure_code_invalid");
    }
    const [updated] = await tx
      .update(authMailOutbox)
      .set(
        result.outcome === "accepted"
          ? { status: "accepted", resolvedAt: now, providerMessageDigest, failureCode: null, reconciliationDigest: null, updatedAt: now }
          : result.outcome === "failed"
            ? { status: "failed", resolvedAt: now, providerMessageDigest: null, failureCode: result.failureCode, reconciliationDigest: null, updatedAt: now }
            // An indeterminate exchange keeps the provider's reason code so
            // the outbox row explains itself; the digest is the replay key.
            : { status: "unknown", resolvedAt: null, providerMessageDigest: null, failureCode: result.failureCode, reconciliationDigest, updatedAt: now }
      )
      .where(and(eq(authMailOutbox.id, current.id), eq(authMailOutbox.status, current.status)))
      .returning();
    if (!updated) refuse("concurrent_outcome");
    return updated;
  });
}

/**
 * Admitted row → provider → recorded outcome. If another process already
 * marked this row dispatched, nothing is sent again and the durable row is
 * returned as it stands.
 */
export async function sendAdmittedAuthMail(
  db: DbLike,
  mailer: AuthMailPort,
  admission: AuthMailAdmission,
  content: Readonly<{ subject: string; text: string }>
): Promise<AuthMailOutboxRow> {
  const dispatched = await markDispatched(db, admission.row.id);
  if (!dispatched) {
    const [current] = await db
      .select()
      .from(authMailOutbox)
      .where(eq(authMailOutbox.id, admission.row.id))
      .limit(1);
    if (!current) refuse("outbox_row_not_found");
    return current;
  }
  let result: AuthMailSendResult;
  try {
    result = await mailer.send({
      to: admission.recipientEmail,
      subject: content.subject,
      text: content.text,
      idempotencyKey: dispatched.id,
    });
  } catch {
    result = { outcome: "unknown", failureCode: "adapter_threw" };
  }
  return recordAuthMailOutcome(db, dispatched.id, result);
}

/**
 * The whole path for a Better Auth hook: admit, render, send. Throws
 * `AuthMailRefusedError` on quota refusal and `AuthMailDeliveryError` when the
 * provider did not durably accept, so a caller can never report a dropped
 * send as delivered.
 */
export class AuthMailDeliveryError extends Error {
  constructor(readonly status: "failed" | "unknown", readonly code: string) {
    super(`auth_mail_delivery_${status}:${code}`);
    this.name = "AuthMailDeliveryError";
  }
}

export async function deliverAuthMail(
  db: DbLike,
  mailer: AuthMailPort,
  params: Readonly<{
    purpose: Exclude<AuthMailPurpose, "identity_deletion_recovery">;
    authUserId: string;
    actionUrl: string;
    actionExpiresAt: Date;
    ceilings?: Partial<AuthMailCeilings> | null;
  }>
): Promise<AuthMailOutboxRow> {
  const admission = await admitAuthMail(db, {
    purpose: params.purpose,
    authUserId: params.authUserId,
    actionExpiresAt: params.actionExpiresAt,
    ceilings: params.ceilings,
  });
  const row = await sendAdmittedAuthMail(
    db,
    mailer,
    admission,
    renderAuthMail({
      purpose: params.purpose,
      actionUrl: params.actionUrl,
      actionExpiresAt: params.actionExpiresAt,
    })
  );
  if (row.status !== "accepted") {
    throw new AuthMailDeliveryError(
      row.status === "failed" ? "failed" : "unknown",
      row.failureCode ?? row.status
    );
  }
  return row;
}

function confirmedRecovery(
  request: RecoveryDeliveryReconciliationRequest,
  row: AuthMailOutboxRow
): RecoveryDeliveryResult {
  if (!row.resolvedAt || !row.providerMessageDigest) {
    return { outcome: "failed", failureCode: "not_delivered" };
  }
  return {
    outcome: "confirmed",
    operationId: request.operationId,
    commandId: request.commandId,
    attempt: request.attempt,
    secretDigest: request.secretDigest,
    recipientDigest: request.recipientDigest,
    expiresAt: request.expiresAt,
    deliveredAt: row.resolvedAt,
    deliveryReceiptDigest: row.providerMessageDigest,
  };
}

function mapFailure(code: string | null): RecoveryDeliveryResult {
  const failureCode =
    code === "recipient_rejected" || code === "provider_rejected"
      ? code
      : "not_delivered";
  return { outcome: "failed", failureCode };
}

/**
 * `RecoveryDeliveryPort` over the outbox. The deletion operation's delivery
 * command id becomes the outbox row id, so the provider idempotency key, the
 * operation projection and this row all name one attempt.
 *
 * Reconciliation never reconstructs plaintext and never re-sends: a row that
 * is durably `accepted` confirms; anything else resolves to `failed`, which
 * lets Task 3's request path rotate the secret and redeliver under the same
 * request and original expiry. A possibly-delivered older mail is harmless
 * because its digest is gone.
 */
export function createAuthMailRecoveryDelivery(
  db: DbLike,
  mailer: AuthMailPort,
  options: Readonly<{
    /** Builds the cancellation URL; the secret is passed once and not kept. */
    actionUrl: (operationId: string, secret: string) => string;
    ceilings?: Partial<AuthMailCeilings> | null;
  }>
): RecoveryDeliveryPort {
  return {
    async deliverIdentityRecovery(request: RecoveryDeliveryRequest) {
      let admission: AuthMailAdmission;
      try {
        admission = await admitAuthMail(db, {
          id: request.commandId,
          purpose: "identity_deletion_recovery",
          authUserId: request.authUserId,
          actionExpiresAt: request.expiresAt,
          operationId: request.operationId,
          deliveryAttempt: request.attempt,
          ceilings: options.ceilings,
        });
      } catch (error) {
        if (error instanceof AuthMailRefusedError) {
          return { outcome: "failed", failureCode: "not_delivered" };
        }
        throw error;
      }
      let row: AuthMailOutboxRow;
      try {
        row = await sendAdmittedAuthMail(
          db,
          mailer,
          admission,
          renderAuthMail({
            purpose: "identity_deletion_recovery",
            actionUrl: options.actionUrl(request.operationId, request.secret),
            actionExpiresAt: request.expiresAt,
          })
        );
      } catch (error) {
        // A reconciliation racing this send already closed the row (the
        // status-guarded outcome writer is the fence). The secret in hand is
        // then stale: report the typed failure so the caller rotates, rather
        // than surfacing the writer's conflict (round-1 lean NOTE C8).
        if (error instanceof AuthMailRefusedError && error.code === "terminal_outcome_conflict") {
          return { outcome: "failed", failureCode: "not_delivered" };
        }
        throw error;
      }
      if (row.status === "accepted") return confirmedRecovery(request, row);
      if (row.status === "unknown") {
        return {
          outcome: "unknown",
          reconciliationDigest: row.reconciliationDigest ?? refuse("reconciliation_digest_missing"),
        };
      }
      return mapFailure(row.failureCode);
    },
    async reconcileIdentityRecovery(request) {
      const [row] = await db
        .select()
        .from(authMailOutbox)
        .where(
          and(
            eq(authMailOutbox.id, request.commandId),
            eq(authMailOutbox.operationId, request.operationId),
            eq(authMailOutbox.deliveryAttempt, request.attempt)
          )
        )
        .limit(1);
      if (row?.status === "accepted") return confirmedRecovery(request, row);
      if (row && row.status === "pending" && row.dispatchedAt === null) {
        // Admitted but never dispatched: nothing reached the provider. Close
        // the row so it cannot be dispatched later with a rotated secret.
        await recordAuthMailOutcome(db, row.id, {
          outcome: "failed",
          failureCode: "not_delivered",
        });
      }
      return { outcome: "failed", failureCode: "not_delivered" };
    },
  };
}

export const AUTH_MAIL_OUTCOME_RETENTION_MS = 90 * DAY;

/** Retention receiver: content-free outcomes expire 90 days after admission. */
export async function sweepExpiredAuthMail(
  db: DbLike,
  now: Date
): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTH_MAIL_OUTCOME_RETENTION_MS);
  const rows = await db
    .delete(authMailOutbox)
    .where(lt(authMailOutbox.admittedAt, cutoff))
    .returning({ id: authMailOutbox.id });
  return rows.length;
}

export function isHex64(value: string | null | undefined): boolean {
  return typeof value === "string" && HEX64.test(value);
}
