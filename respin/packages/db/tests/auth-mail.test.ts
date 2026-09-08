// Phase 10b-1 Task 4.2 — the closed auth-delivery authority.
//
// Quota admission, TTLs, content-free rendering, the single outcome writer,
// the RecoveryDeliveryPort over the outbox (driven through the REAL Task 3
// identity-deletion request path), the 90-day receiver, and the erasure scrub.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  admitAuthMail,
  AUTH_MAIL_COMPILED_CEILINGS,
  AUTH_MAIL_PURPOSES,
  AUTH_MAIL_SECURITY_RESERVE,
  AUTH_MAIL_CLOCK_SKEW_MS,
  AUTH_MAIL_TTL_MS,
  createAuthMailRecoveryDelivery,
  deliverAuthMail,
  recordAuthMailOutcome,
  renderAuthMail,
  resolveAuthMailCeilings,
  sendAdmittedAuthMail,
  sweepExpiredAuthMail,
  type AuthMailPort,
  type AuthMailSendResult,
} from "../src/auth-mail";
import { authMailOutbox, type AuthMailPurpose } from "../src/auth-mail-schema";
import { NO_ACTIVATION_EXCLUSIONS } from "../src/activation";
import { session } from "../src/auth-schema";
import { ensureUserWorkspace } from "../src/bootstrap";
import {
  requestIdentityDeletion,
  resumeIdentityDeletionRequest,
} from "../src/deletion-lifecycle";
import type { DeletionJournalPort, JournalTransitionRequest } from "../src/deletion-ports";
import { journalReceiptDigest, journalRequestChecksum } from "../src/deletion-ports";
import { deletionOperations } from "../src/lifecycle-schema";
import { memberships } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fakeMailer(results: AuthMailSendResult[] = []) {
  const sent: Parameters<AuthMailPort["send"]>[0][] = [];
  const port: AuthMailPort = {
    send: vi.fn(async (message) => {
      sent.push(message);
      return results.shift() ?? { outcome: "accepted" as const, providerMessageId: `msg-${sent.length}` };
    }),
  };
  return { port, sent };
}

function confirmedJournal(): DeletionJournalPort {
  return {
    appendTransition: async (request: JournalTransitionRequest) => {
      const object = {
        objectKey: `test/deletion-journal/${request.operationId}/${String(request.version).padStart(8, "0")}.json`,
        objectVersionId: `version-${request.version}`,
        checksumSha256: journalRequestChecksum(request),
      };
      return {
        outcome: "confirmed" as const,
        ...request,
        ...object,
        receiptDigest: journalReceiptDigest(request, object),
      };
    },
  };
}

/** Admitted rows for a bucket, so a tighten-only ceiling can be reached without eroding the compiled reserve. */
async function backfill(db: TestDb, authUserId: string, count: number, day = new Date().toISOString().slice(0, 10)) {
  const start = new Date(`${day}T00:00:00.000Z`).getTime();
  await db.insert(authMailOutbox).values(Array.from({ length: count }, (_, n) => ({
    purpose: "password_reset" as const,
    authUserId,
    recipientDigest: sha(`auth-mail-recipient:v1:${authUserId}`),
    admittedAt: new Date(start + n * 1_000),
    admittedDayUtc: day,
    admittedMonthUtc: day.slice(0, 7),
    actionExpiresAt: new Date(start + 15 * 60_000),
  })));
}

async function identityWithSurvivor(db: TestDb) {
  await seedAuthUser(db, "target-auth", "target@example.test");
  const target = await ensureUserWorkspace(db, { authUserId: "target-auth", name: "Target" });
  await seedAuthUser(db, "survivor-auth", "survivor@example.test");
  const survivor = await ensureUserWorkspace(db, { authUserId: "survivor-auth", name: "Survivor" });
  await db.insert(memberships).values({
    userId: survivor.user.id,
    workspaceId: target.workspace.id,
    role: "owner",
  });
  await db.insert(session).values({
    id: "session-target",
    token: "token-target",
    userId: "target-auth",
    expiresAt: new Date(Date.now() + HOUR),
    updatedAt: new Date(),
    reauthenticatedAt: new Date(),
  });
  return target;
}

describe("auth-mail authority — purposes, ceilings and rendering", () => {
  it("keeps the purpose union closed and the TTLs exact", () => {
    expect([...AUTH_MAIL_PURPOSES].sort()).toEqual([
      "email_verification",
      "identity_deletion_recovery",
      "local_factor_enrollment",
      "password_reset",
      "workspace_invite",
    ]);
    expect(AUTH_MAIL_TTL_MS).toEqual({
      email_verification: 24 * HOUR,
      password_reset: 15 * 60_000,
      identity_deletion_recovery: 7 * DAY,
      local_factor_enrollment: 15 * 60_000,
      workspace_invite: 7 * DAY,
    });
  });

  it("derives the security reserve from the compiled ceilings and only tightens", () => {
    expect(AUTH_MAIL_COMPILED_CEILINGS).toEqual({
      totalPerDay: 80,
      totalPerMonth: 2_400,
      invitesPerDay: 60,
      invitesPerMonth: 1_800,
    });
    expect(AUTH_MAIL_SECURITY_RESERVE).toEqual({ perDay: 20, perMonth: 600 });
    expect(resolveAuthMailCeilings(null)).toEqual(AUTH_MAIL_COMPILED_CEILINGS);
    expect(resolveAuthMailCeilings({ totalPerDay: 40, invitesPerDay: 20 })).toMatchObject({
      totalPerDay: 40,
      invitesPerDay: 20,
      totalPerMonth: 2_400,
    });
    expect(() => resolveAuthMailCeilings({ totalPerDay: 81 })).toThrow("auth_mail_refused:ceiling_invalid:totalPerDay");
    expect(() => resolveAuthMailCeilings({ invitesPerMonth: 0 })).toThrow("auth_mail_refused:ceiling_invalid:invitesPerMonth");
    expect(() => resolveAuthMailCeilings({ totalPerDay: 10.5 })).toThrow("auth_mail_refused:ceiling_invalid:totalPerDay");
    // Tightening the total below the invite ceiling cannot leave invites above it.
    expect(() => resolveAuthMailCeilings({ totalPerDay: 30 })).toThrow("auth_mail_refused:ceiling_invalid:invitesPerDay");
    // The reserve is a floor: tightening only the totals cannot erode it
    // (round-1 billing CHANGE — {60, 1800} used to resolve to a 0/0 reserve).
    expect(() => resolveAuthMailCeilings({ totalPerDay: 60, totalPerMonth: 1_800 })).toThrow("auth_mail_refused:ceiling_invalid:invitesPerDay");
    expect(() => resolveAuthMailCeilings({ totalPerDay: 79 })).toThrow("auth_mail_refused:ceiling_invalid:invitesPerDay");
    expect(() => resolveAuthMailCeilings({ totalPerMonth: 2_399 })).toThrow("auth_mail_refused:ceiling_invalid:invitesPerMonth");
    expect(() => resolveAuthMailCeilings({ totalPerDay: 60, invitesPerDay: 41 })).toThrow("auth_mail_refused:ceiling_invalid:invitesPerDay");
    expect(resolveAuthMailCeilings({ totalPerDay: 60, invitesPerDay: 40, totalPerMonth: 1_800, invitesPerMonth: 1_200 })).toEqual({
      totalPerDay: 60,
      invitesPerDay: 40,
      totalPerMonth: 1_800,
      invitesPerMonth: 1_200,
    });
  });

  it("renders purpose, action URL and expiry — nothing else", () => {
    const expires = new Date("2026-09-14T10:00:00.000Z");
    for (const purpose of AUTH_MAIL_PURPOSES) {
      const rendered = renderAuthMail({ purpose, actionUrl: "https://app.example/act?x=1", actionExpiresAt: expires });
      const lines = rendered.text.split("\n");
      expect(lines).toHaveLength(7);
      expect(lines[2]).toBe("https://app.example/act?x=1");
      expect(lines[4]).toBe(`This link expires at ${expires.toISOString()}.`);
      expect(lines[6]).toBe("If you did not request this, you can ignore this message.");
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(`${rendered.subject}\n${rendered.text}`).not.toMatch(/workspace name|creator|@/i);
    }
  });
});

describe("auth-mail authority — admission and outcomes (PGlite)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "u1", "u1@example.test");
  });

  const admit = (purpose: AuthMailPurpose, ceilings?: Parameters<typeof resolveAuthMailCeilings>[0]) =>
    admitAuthMail(db, {
      purpose,
      authUserId: "u1",
      actionExpiresAt: new Date(Date.now() + Math.min(AUTH_MAIL_TTL_MS[purpose], HOUR) - 5_000),
      ceilings,
    });

  it("admits a row before dispatch with the recipient address in memory only", async () => {
    const admission = await admit("password_reset");
    expect(admission.recipientEmail).toBe("u1@example.test");
    expect(admission.row).toMatchObject({
      purpose: "password_reset",
      status: "pending",
      authUserId: "u1",
      dispatchedAt: null,
      operationId: null,
      deliveryAttempt: null,
    });
    expect(admission.row.recipientDigest).toBe(sha("auth-mail-recipient:v1:u1"));
    expect(admission.row.admittedMonthUtc).toBe(admission.row.admittedDayUtc.slice(0, 7));
    expect(JSON.stringify(admission.row)).not.toContain("u1@example.test");
  });

  it("refuses an expiry beyond the purpose TTL, a non-positive expiry, an unknown recipient and an unknown purpose", async () => {
    await expect(
      admitAuthMail(db, { purpose: "password_reset", authUserId: "u1", actionExpiresAt: new Date(Date.now() + AUTH_MAIL_TTL_MS.password_reset + AUTH_MAIL_CLOCK_SKEW_MS + 60_000) })
    ).rejects.toThrow("auth_mail_refused:action_expiry_out_of_range");
    await expect(
      admitAuthMail(db, { purpose: "password_reset", authUserId: "u1", actionExpiresAt: new Date(Date.now() - 1_000) })
    ).rejects.toThrow("auth_mail_refused:action_expiry_out_of_range");
    await expect(
      admitAuthMail(db, { purpose: "password_reset", authUserId: "nobody", actionExpiresAt: new Date(Date.now() + 60_000) })
    ).rejects.toThrow("auth_mail_refused:recipient_unknown");
    await expect(
      admitAuthMail(db, { purpose: "newsletter" as AuthMailPurpose, authUserId: "u1", actionExpiresAt: new Date(Date.now() + 60_000) })
    ).rejects.toThrow("auth_mail_refused:purpose_unknown");
    await expect(
      admitAuthMail(db, { purpose: "password_reset", authUserId: "u1", actionExpiresAt: new Date(Date.now() + 60_000), operationId: "019b0d7a-86df-7000-8000-000000000003" })
    ).rejects.toThrow("auth_mail_refused:operation_link_shape");
    expect(await db.select().from(authMailOutbox)).toHaveLength(0);
  });

  it("admits an expiry inside the clock-skew margin (round-1 lean CHANGE C4: app clock ahead of the database)", async () => {
    const skewed = await admitAuthMail(db, { purpose: "password_reset", authUserId: "u1", actionExpiresAt: new Date(Date.now() + AUTH_MAIL_TTL_MS.password_reset + 30_000) });
    expect(skewed.row.status).toBe("pending");
  });

  it("enforces the daily total, keeps the security reserve out of invite reach, and refusals consume nothing", async () => {
    for (let index = 0; index < AUTH_MAIL_COMPILED_CEILINGS.invitesPerDay; index += 1) {
      await admit("workspace_invite");
    }
    await expect(admit("workspace_invite")).rejects.toThrow("auth_mail_refused:invite_quota_day_exhausted");
    // Security mail still has the derived reserve.
    for (let index = 0; index < AUTH_MAIL_SECURITY_RESERVE.perDay; index += 1) {
      await admit("password_reset");
    }
    await expect(admit("password_reset")).rejects.toThrow("auth_mail_refused:quota_day_exhausted");
    await expect(admit("email_verification")).rejects.toThrow("auth_mail_refused:quota_day_exhausted");
    expect(await db.select().from(authMailOutbox)).toHaveLength(AUTH_MAIL_COMPILED_CEILINGS.totalPerDay);
  });

  it("lets security mail use unused invite capacity", async () => {
    for (let index = 0; index < AUTH_MAIL_COMPILED_CEILINGS.totalPerDay; index += 1) {
      await admit("email_verification");
    }
    await expect(admit("email_verification")).rejects.toThrow("auth_mail_refused:quota_day_exhausted");
    await expect(admit("workspace_invite")).rejects.toThrow("auth_mail_refused:quota_day_exhausted");
  });

  it("enforces the monthly ceiling across days through the tighten-only override", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    if (today.endsWith("-01")) {
      console.warn("[auth-mail.test] monthly-ceiling case SKIPPED on the 1st: the backfilled month would share today's daily bucket.");
      return;
    }
    // 603 = the compiled monthly reserve (600) + three invites: the smallest
    // month a tighten-only override can express without eroding the reserve.
    await backfill(db, "u1", 602, `${month}-01`);
    const month603 = { totalPerMonth: 603, invitesPerMonth: 3 };
    await admit("password_reset", month603);
    await expect(admit("password_reset", month603)).rejects.toThrow("auth_mail_refused:quota_month_exhausted");
  });

  it("sends once, records provider acceptance as a digest, and never reports an unaccepted send delivered", async () => {
    const admission = await admit("password_reset");
    const { port, sent } = fakeMailer([{ outcome: "accepted", providerMessageId: "re_123" }]);
    const row = await sendAdmittedAuthMail(db, port, admission, { subject: "s", text: "t" });
    expect(sent).toEqual([{ to: "u1@example.test", subject: "s", text: "t", idempotencyKey: admission.row.id }]);
    expect(row.status).toBe("accepted");
    expect(row.providerMessageDigest).toBe(sha(`auth-mail:${admission.row.id}:re_123`));
    expect(JSON.stringify(row)).not.toContain("re_123");
    // A second call for the same admission does not send again.
    const again = await sendAdmittedAuthMail(db, port, admission, { subject: "s", text: "t" });
    expect(again.id).toBe(row.id);
    expect(port.send).toHaveBeenCalledTimes(1);

    const failedAdmission = await admit("email_verification");
    const failing = fakeMailer([{ outcome: "failed", failureCode: "provider_rejected" }]);
    const failed = await sendAdmittedAuthMail(db, failing.port, failedAdmission, { subject: "s", text: "t" });
    expect(failed).toMatchObject({ status: "failed", failureCode: "provider_rejected", providerMessageDigest: null });

    const unknownAdmission = await admit("email_verification");
    const throwing: AuthMailPort = { send: vi.fn(async () => { throw new Error("socket"); }) };
    const unknown = await sendAdmittedAuthMail(db, throwing, unknownAdmission, { subject: "s", text: "t" });
    expect(unknown.status).toBe("unknown");
    expect(unknown.reconciliationDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses outcomes before dispatch and rewrites of a terminal outcome", async () => {
    const admission = await admit("password_reset");
    await expect(
      recordAuthMailOutcome(db, admission.row.id, { outcome: "accepted", providerMessageId: "x" })
    ).rejects.toThrow("auth_mail_refused:outcome_before_dispatch");
    const failed = await recordAuthMailOutcome(db, admission.row.id, { outcome: "failed", failureCode: "quota_unavailable_at_dispatch" });
    expect(failed.status).toBe("failed");
    await expect(
      recordAuthMailOutcome(db, admission.row.id, { outcome: "failed", failureCode: "other" })
    ).rejects.toThrow("auth_mail_refused:terminal_outcome_conflict");
    await expect(
      recordAuthMailOutcome(db, admission.row.id, { outcome: "failed", failureCode: "quota_unavailable_at_dispatch" })
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("deliverAuthMail throws on refusal or non-acceptance and returns the accepted row", async () => {
    const { port } = fakeMailer([{ outcome: "accepted", providerMessageId: "ok" }, { outcome: "unknown", failureCode: "request_failed" }]);
    const row = await deliverAuthMail(db, port, {
      purpose: "email_verification",
      authUserId: "u1",
      actionUrl: "https://app.example/verify?token=t",
      actionExpiresAt: new Date(Date.now() + AUTH_MAIL_TTL_MS.email_verification),
    });
    expect(row.status).toBe("accepted");
    await expect(
      deliverAuthMail(db, port, {
        purpose: "email_verification",
        authUserId: "u1",
        actionUrl: "https://app.example/verify?token=t",
        actionExpiresAt: new Date(Date.now() + AUTH_MAIL_TTL_MS.email_verification),
      })
    ).rejects.toThrow("auth_mail_delivery_unknown:request_failed");
    await backfill(db, "u1", 20); // 2 sent above + 20 = the 22 ceiling below (20 = the compiled reserve)
    await expect(
      deliverAuthMail(db, port, {
        purpose: "email_verification",
        authUserId: "u1",
        actionUrl: "https://app.example/verify?token=t",
        actionExpiresAt: new Date(Date.now() + AUTH_MAIL_TTL_MS.email_verification),
        ceilings: { totalPerDay: 22, invitesPerDay: 2 },
      })
    ).rejects.toThrow("auth_mail_refused:quota_day_exhausted");
  });

  it("sweeps outcomes 90 days after admission (the receiver Task 6 wires into the worker; the recipient scrub is the SQL port's, see deletion-executor.test.ts)", async () => {
    const admission = await admit("password_reset");
    const old = await db
      .insert(authMailOutbox)
      .values({
        purpose: "password_reset",
        authUserId: "u1",
        recipientDigest: sha("auth-mail-recipient:v1:u1"),
        admittedAt: new Date(Date.now() - 91 * DAY),
        admittedDayUtc: new Date(Date.now() - 91 * DAY).toISOString().slice(0, 10),
        admittedMonthUtc: new Date(Date.now() - 91 * DAY).toISOString().slice(0, 7),
        actionExpiresAt: new Date(Date.now() - 91 * DAY + 60_000),
      })
      .returning();
    expect(await sweepExpiredAuthMail(db, new Date())).toBe(1);
    expect(await db.select().from(authMailOutbox).where(eq(authMailOutbox.id, old[0]!.id))).toHaveLength(0);
    expect(await db.select().from(authMailOutbox).where(eq(authMailOutbox.id, admission.row.id))).toHaveLength(1);
  });
});

describe("auth-mail recovery delivery through the real identity-deletion request", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  const params = (idempotencyKey: string) => ({ sessionId: "session-target", idempotencyKey });

  it("admits the operation's command id as the outbox row, passes the secret once, and confirms only from durable acceptance", async () => {
    const target = await identityWithSurvivor(db);
    const { port, sent } = fakeMailer();
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, port, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}/cancel#${secret}`,
    });
    const result = await requestIdentityDeletion(db, params("identity-mail-1"), {
      recoveryDelivery,
      journal: confirmedJournal(),
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(result.acknowledged).toBe(true);
    expect(result.delivery).toBe("confirmed");
    const operation = result.operation;
    expect(operation.state).toBe("tombstoned");
    expect(operation.userId).toBe(target.user.id);

    const rows = await db.select().from(authMailOutbox);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      id: operation.recoveryDeliveryCommandId,
      purpose: "identity_deletion_recovery",
      operationId: operation.id,
      deliveryAttempt: 1,
      status: "accepted",
      authUserId: "target-auth",
    });
    expect(row.actionExpiresAt.getTime()).toBe(operation.recoveryExpiresAt!.getTime());
    expect(operation.recoveryDeliveryReceiptDigest).toBe(row.providerMessageDigest);
    expect(operation.recoveryDeliveredAt!.getTime()).toBe(row.resolvedAt!.getTime());

    expect(sent).toHaveLength(1);
    const message = sent[0]!;
    expect(message.to).toBe("target@example.test");
    expect(message.idempotencyKey).toBe(row.id);
    const secret = /#([A-Za-z0-9_-]{43})$/m.exec(message.text)?.[1];
    expect(secret).toBeDefined();
    expect(sha(secret!)).toBe(operation.recoverySecretDigest);
    expect(message.text).not.toContain("Target");
    expect(message.text).not.toContain("Survivor");
    expect(JSON.stringify(rows)).not.toContain(secret!);
  });

  it("reports a failed provider outcome as failed, and a later request rotates the secret under the same operation", async () => {
    await identityWithSurvivor(db);
    const { port, sent } = fakeMailer([{ outcome: "failed", failureCode: "recipient_rejected" }]);
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, port, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}/cancel#${secret}`,
    });
    const first = await requestIdentityDeletion(db, params("identity-mail-2"), {
      recoveryDelivery,
      journal: confirmedJournal(),
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(first.acknowledged).toBe(false);
    expect(first.delivery).toBe("failed");
    expect(first.operation.state).toBe("requested");
    expect(first.operation.lastFailureCode).toBe("delivery_recipient_rejected");

    const second = await requestIdentityDeletion(db, params("identity-mail-2"), {
      recoveryDelivery,
      journal: confirmedJournal(),
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(second.operation.id).toBe(first.operation.id);
    expect(second.acknowledged).toBe(true);
    expect(second.operation.recoveryDeliveryAttempt).toBe(2);
    expect(second.operation.recoveryExpiresAt!.getTime()).toBe(first.operation.recoveryExpiresAt!.getTime());
    expect(second.operation.recoverySecretDigest).not.toBe(first.operation.recoverySecretDigest);
    const rows = await db
      .select()
      .from(authMailOutbox)
      .where(eq(authMailOutbox.operationId, first.operation.id))
      .orderBy(authMailOutbox.deliveryAttempt);
    expect(rows.map((row) => [row.deliveryAttempt, row.status])).toEqual([[1, "failed"], [2, "accepted"]]);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.text).not.toBe(sent[1]!.text);
  });

  it("reports a typed failure when a reconciliation closed the row during the send, so the request rotates (round-1 lean NOTE C8)", async () => {
    await identityWithSurvivor(db);
    // The provider call is slow; a racing reconciliation closes the row as
    // failed before the send's acceptance can be recorded.
    const port: AuthMailPort = {
      send: vi.fn(async (message) => {
        await recordAuthMailOutcome(db, message.idempotencyKey, { outcome: "failed", failureCode: "not_delivered" });
        return { outcome: "accepted" as const, providerMessageId: "re_late" };
      }),
    };
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, port, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}/cancel#${secret}`,
    });
    const first = await requestIdentityDeletion(db, params("identity-mail-race"), {
      recoveryDelivery,
      journal: confirmedJournal(),
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(first.acknowledged).toBe(false);
    expect(first.delivery).toBe("failed");
    expect(first.operation.state).toBe("requested");
    const rows = await db.select().from(authMailOutbox).where(eq(authMailOutbox.operationId, first.operation.id));
    expect(rows.map((row) => [row.status, row.failureCode])).toEqual([["failed", "not_delivered"]]);
  });

  it("resolves an indeterminate send to failed on reconciliation instead of guessing delivery, then redelivers", async () => {
    await identityWithSurvivor(db);
    const { port } = fakeMailer([{ outcome: "unknown", failureCode: "request_failed" }]);
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, port, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}/cancel#${secret}`,
    });
    const first = await requestIdentityDeletion(db, params("identity-mail-3"), {
      recoveryDelivery,
      journal: confirmedJournal(),
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(first.delivery).toBe("unknown");
    expect(first.operation.recoveryDeliveryStatus).toBe("unknown");
    const [row] = await db.select().from(authMailOutbox);
    expect(row!.status).toBe("unknown");

    const reconciled = await resumeIdentityDeletionRequest(db, first.operation.id, {
      recoveryDelivery,
      journal: confirmedJournal(),
    });
    expect(reconciled.delivery).toBe("failed");
    expect(reconciled.acknowledged).toBe(false);
    expect(reconciled.operation.lastFailureCode).toBe("delivery_not_delivered");
    expect(port.send).toHaveBeenCalledTimes(1);

    const redelivered = await requestIdentityDeletion(db, params("identity-mail-3"), {
      recoveryDelivery,
      journal: confirmedJournal(),
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(redelivered.acknowledged).toBe(true);
    expect(redelivered.operation.recoveryDeliveryAttempt).toBe(2);
    expect(port.send).toHaveBeenCalledTimes(2);
    const [unchanged] = await db
      .select()
      .from(authMailOutbox)
      .where(and(eq(authMailOutbox.operationId, first.operation.id), eq(authMailOutbox.deliveryAttempt, 1)));
    // The indeterminate row is left as the durable record of what happened.
    expect(unchanged!.status).toBe("unknown");
  });

  it("refuses quota as a failed delivery and leaves the identity fully active", async () => {
    await identityWithSurvivor(db);
    const { port } = fakeMailer();
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, port, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}/cancel#${secret}`,
      ceilings: { totalPerDay: 21, invitesPerDay: 1 },
    });
    await backfill(db, "survivor-auth", 20); // + the survivor's mail below = the 21 ceiling
    await admitAuthMail(db, {
      purpose: "email_verification",
      authUserId: "survivor-auth",
      actionExpiresAt: new Date(Date.now() + HOUR),
    });
    const result = await requestIdentityDeletion(db, params("identity-mail-4"), {
      recoveryDelivery,
      journal: confirmedJournal(),
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(result.delivery).toBe("failed");
    expect(result.acknowledged).toBe(false);
    expect(port.send).not.toHaveBeenCalled();
    expect(await db.select().from(session).where(eq(session.userId, "target-auth"))).toHaveLength(1);
    expect(
      (await db.select().from(deletionOperations).where(eq(deletionOperations.id, result.operation.id)))[0]!.state
    ).toBe("requested");
  });
});
