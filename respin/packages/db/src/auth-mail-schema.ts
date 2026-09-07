// Phase 10b-1 Task 4 — the closed auth-delivery outbox (plan C2, R-118).
//
// One row per admitted transactional mail, written BEFORE the provider call.
// The row id is the provider idempotency key. Rows carry purpose, quota
// bucket, delivery outcome and the action's expiry — never a recipient
// address, a secret, a workspace or creator name, or any mail body.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { user as authUser } from "./auth-schema";
import { deletionOperations } from "./lifecycle-schema";

export const authMailPurpose = pgEnum("auth_mail_purpose", [
  "email_verification",
  "password_reset",
  "identity_deletion_recovery",
  "local_factor_enrollment",
  "workspace_invite",
]);

export const authMailDeliveryStatus = pgEnum("auth_mail_delivery_status", [
  "pending",
  "accepted",
  "failed",
  "unknown",
]);

export const authMailOutbox = pgTable(
  "auth_mail_outbox",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    purpose: authMailPurpose("purpose").notNull(),
    // Recipient link. Nullable so identity erasure can scrub it while the
    // content-free outcome survives its 90-day clock.
    authUserId: text("auth_user_id").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    recipientDigest: text("recipient_digest"),
    // Present only for identity-deletion recovery: the delivery command the
    // deletion operation minted, so both projections name the same attempt.
    operationId: uuid("operation_id").references(() => deletionOperations.id, {
      onDelete: "restrict",
    }),
    deliveryAttempt: integer("delivery_attempt"),
    admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull(),
    admittedDayUtc: text("admitted_day_utc").notNull(),
    admittedMonthUtc: text("admitted_month_utc").notNull(),
    status: authMailDeliveryStatus("status").default("pending").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    providerMessageDigest: text("provider_message_digest"),
    failureCode: text("failure_code"),
    reconciliationDigest: text("reconciliation_digest"),
    actionExpiresAt: timestamp("action_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("auth_mail_outbox_operation_attempt_uq")
      .on(t.operationId, t.deliveryAttempt)
      .where(sql`${t.operationId} IS NOT NULL`),
    index("auth_mail_outbox_day_purpose_idx").on(t.admittedDayUtc, t.purpose),
    index("auth_mail_outbox_month_purpose_idx").on(t.admittedMonthUtc, t.purpose),
    index("auth_mail_outbox_auth_user_idx").on(t.authUserId),
    check(
      "auth_mail_outbox_purpose_link_shape",
      sql`((${t.purpose} = 'identity_deletion_recovery' AND ${t.operationId} IS NOT NULL AND ${t.deliveryAttempt} >= 1)
          OR (${t.purpose} <> 'identity_deletion_recovery' AND ${t.operationId} IS NULL AND ${t.deliveryAttempt} IS NULL)) IS TRUE`
    ),
    check(
      "auth_mail_outbox_recipient_shape",
      sql`((${t.authUserId} IS NULL AND ${t.recipientDigest} IS NULL)
          OR (${t.authUserId} IS NOT NULL AND ${t.recipientDigest} ~ '^[0-9a-f]{64}$')) IS TRUE`
    ),
    check(
      "auth_mail_outbox_bucket_shape",
      sql`(${t.admittedDayUtc} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ${t.admittedMonthUtc} ~ '^[0-9]{4}-[0-9]{2}$' AND ${t.admittedMonthUtc} = left(${t.admittedDayUtc}, 7)) IS TRUE`
    ),
    check(
      "auth_mail_outbox_expiry_after_admission",
      sql`${t.actionExpiresAt} > ${t.admittedAt}`
    ),
    check(
      "auth_mail_outbox_status_shape",
      sql`((${t.status} = 'pending' AND ${t.resolvedAt} IS NULL AND ${t.providerMessageDigest} IS NULL AND ${t.failureCode} IS NULL AND ${t.reconciliationDigest} IS NULL)
          OR (${t.status} = 'accepted' AND ${t.dispatchedAt} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL AND ${t.resolvedAt} >= ${t.dispatchedAt} AND ${t.providerMessageDigest} ~ '^[0-9a-f]{64}$' AND ${t.failureCode} IS NULL AND ${t.reconciliationDigest} IS NULL)
          OR (${t.status} = 'failed' AND ${t.resolvedAt} IS NOT NULL AND ${t.failureCode} IS NOT NULL AND ${t.providerMessageDigest} IS NULL AND ${t.reconciliationDigest} IS NULL)
          OR (${t.status} = 'unknown' AND ${t.dispatchedAt} IS NOT NULL AND ${t.resolvedAt} IS NULL AND ${t.failureCode} IS NOT NULL AND ${t.providerMessageDigest} IS NULL AND ${t.reconciliationDigest} ~ '^[0-9a-f]{64}$')) IS TRUE`
    ),
  ]
);

export type AuthMailOutboxRow = typeof authMailOutbox.$inferSelect;
export type AuthMailPurpose = (typeof authMailPurpose.enumValues)[number];
export type AuthMailDeliveryStatus =
  (typeof authMailDeliveryStatus.enumValues)[number];
