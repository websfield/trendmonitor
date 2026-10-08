import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  boolean,
  date,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { creatorProfileState, creatorProfiles } from "./brain-schema";
import { user as authUser } from "./auth-schema";
import { membershipRole, users, workspaces } from "./schema";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const deletionScope = pgEnum("deletion_scope", [
  "identity",
  "profile",
  "workspace",
]);

export const deletionOperationState = pgEnum("deletion_operation_state", [
  "requested",
  "journal_pending",
  "tombstoned",
  "external_actions_pending",
  "grace",
  "erasing",
  "verifying",
  "complete",
  "blocked",
  "cancelled",
]);

export const recoveryDeliveryStatus = pgEnum("recovery_delivery_status", [
  "not_required",
  "pending",
  "failed",
  "unknown",
  "confirmed",
]);

export const membershipRecoveryOutcome = pgEnum(
  "membership_recovery_outcome",
  [
    "pending",
    "restored",
    "removed",
    "changed",
    "workspace_unavailable",
    "seat_refused",
  ]
);

/**
 * Durable current projection of one deletion request. The external append-only
 * journal is the transition authority; this row is deliberately only a
 * projection and carries the last verified receipt/version used to advance it.
 */
export const activationContributionState = pgEnum("activation_contribution_state", [
  "pending",
  "applied",
]);

/**
 * Task 7 / R-121: the identifier-free cohort aggregate. Cohort date, counts and
 * the metric version — no request, user, workspace, profile, email or content
 * id, so nothing here can be relinked to the account that contributed it.
 */
export const activationCohortDaily = pgTable(
  "activation_cohort_daily",
  {
    cohortDate: date("cohort_date").notNull(),
    metricVersion: integer("metric_version").notNull(),
    signups: integer("signups").default(0).notNull(),
    activated: integer("activated").default(0).notNull(),
    excluded: integer("excluded").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`clock_timestamp()`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cohortDate, t.metricVersion] }),
    check("activation_cohort_daily_counts", sql`${t.signups} >= 0 AND ${t.activated} >= 0 AND ${t.excluded} >= 0 AND ${t.activated} <= ${t.signups}`),
  ]
);

export const deletionOperations = pgTable(
  "deletion_operations",
  {
    id: id(),
    scope: deletionScope("scope").notNull(),
    targetKey: text("target_key").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "restrict",
    }),
    profileId: uuid("profile_id").references(() => creatorProfiles.id, {
      onDelete: "restrict",
    }),
    profilePriorState: creatorProfileState("profile_prior_state"),
    requesterUserId: uuid("requester_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requesterDigest: text("requester_digest").notNull(),
    requestSessionDigest: text("request_session_digest"),
    requestMembershipVersion: integer("request_membership_version"),
    requestWorkspaceLifecycleVersion: integer("request_workspace_lifecycle_version"),
    requestProfileLifecycleVersion: integer("request_profile_lifecycle_version"),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    state: deletionOperationState("state").default("requested").notNull(),
    blockedResumeState: deletionOperationState("blocked_resume_state"),
    stateVersion: integer("state_version").default(0).notNull(),
    journalVersion: integer("journal_version").default(0).notNull(),
    journalReceiptDigest: text("journal_receipt_digest"),
    journalIntentBaseVersion: integer("journal_intent_base_version"),
    journalIntentPlanDigest: text("journal_intent_plan_digest"),
    journalIntentEffectiveAt: timestamp("journal_intent_effective_at", {
      withTimezone: true,
    }),
    cancellationReplayDigest: text("cancellation_replay_digest"),
    identityCancellationReceiptExpiresAt: timestamp(
      "identity_cancellation_receipt_expires_at",
      { withTimezone: true }
    ),
    recoverySecretDigest: text("recovery_secret_digest"),
    recoverySecretPrefix: text("recovery_secret_prefix"),
    recoveryExpiresAt: timestamp("recovery_expires_at", {
      withTimezone: true,
    }),
    recoveryConsumedAt: timestamp("recovery_consumed_at", {
      withTimezone: true,
    }),
    recoveryDeliveryStatus: recoveryDeliveryStatus("recovery_delivery_status")
      .default("not_required")
      .notNull(),
    recoveryDeliveryAttempt: integer("recovery_delivery_attempt").default(0).notNull(),
    recoveryDeliveryCommandId: uuid("recovery_delivery_command_id"),
    recoveryDeliveryRecipientDigest: text("recovery_delivery_recipient_digest"),
    recoveryDeliveryReceiptDigest: text("recovery_delivery_receipt_digest"),
    recoveryDeliveryReconciliationDigest: text(
      "recovery_delivery_reconciliation_digest"
    ),
    recoveryDeliveryAttemptedAt: timestamp("recovery_delivery_attempted_at", {
      withTimezone: true,
    }),
    recoveryDeliveredAt: timestamp("recovery_delivered_at", {
      withTimezone: true,
    }),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    tombstonedAt: timestamp("tombstoned_at", { withTimezone: true }),
    graceExpiresAt: timestamp("grace_expires_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    retryCount: integer("retry_count").default(0).notNull(),
    lastFailureCode: text("last_failure_code"),
    // Task 7 / R-121: the activation contribution captured at REQUEST time,
    // before memberships suspend. Applied exactly once before erasure; the
    // keyed hash is erased with the target and only the receipt digest stays.
    activationCohortDate: date("activation_cohort_date"),
    activationExcluded: boolean("activation_excluded"),
    activationExclusionSource: text("activation_exclusion_source"),
    activationDenominator: integer("activation_denominator"),
    activationNumerator: integer("activation_numerator"),
    activationMetricVersion: integer("activation_metric_version"),
    activationMembershipVersion: integer("activation_membership_version"),
    activationPayloadHash: text("activation_payload_hash"),
    activationContributionState: activationContributionState("activation_contribution_state"),
    activationAppliedAt: timestamp("activation_applied_at", { withTimezone: true }),
    activationReceiptDigest: text("activation_receipt_digest"),
    // R-166 (gate M4): WHO cancelled — any active owner may (R-162), so the
    // requester is not the answer. Set in the transaction that reserves the
    // cancellation's journal plan; scrubbed with the canceller's identity at
    // erasure, like the requester.
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // R-166 (gate M4): the canceller's DIGEST, the way `requester_digest`
    // records the requester — a receipt fact that outlives the canceller's
    // identity erasure, which scrubs `cancelled_by_user_id`. Both written in
    // the transaction that reserves the cancellation's journal plan.
    cancelledByDigest: text("cancelled_by_digest"),
    // R-166 (gate Low): the identity operation that CASCADED this workspace
    // deletion (R-160) — server-owned, never inferred from a client key. No
    // foreign key: the parent receipt expires on its own one-year clock, and
    // a child row must not hold it.
    cascadeParentOperationId: uuid("cascade_parent_operation_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "deletion_operations_activation_shape",
      sql`(${t.scope} <> 'identity' AND ${t.activationContributionState} IS NULL)
          OR (${t.scope} = 'identity' AND (${t.activationContributionState} IS NULL OR (
            ${t.activationCohortDate} IS NOT NULL AND ${t.activationExcluded} IS NOT NULL
            AND ${t.activationDenominator} IN (0, 1) AND ${t.activationNumerator} IN (0, 1)
            AND ${t.activationNumerator} <= ${t.activationDenominator}
            AND (${t.activationExcluded} = (${t.activationDenominator} = 0))
            AND ${t.activationMetricVersion} IS NOT NULL
            AND ((${t.activationContributionState} = 'applied') = (${t.activationAppliedAt} IS NOT NULL))
            AND ((${t.activationContributionState} = 'applied') = (${t.activationReceiptDigest} IS NOT NULL))
          )))`
    ),
    uniqueIndex("deletion_operations_requester_scope_idempotency_uq").on(
      t.requesterUserId,
      t.scope,
      t.idempotencyKey
    ),
    unique("deletion_operations_transition_identity_uq").on(
      t.id,
      t.scope,
      t.targetKey,
      t.requesterDigest,
      t.payloadHash
    ),
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "deletion_operations_profile_workspace_fk",
    }).onDelete("restrict"),
    uniqueIndex("deletion_operations_delivery_command_uq")
      .on(t.recoveryDeliveryCommandId)
      .where(sql`${t.recoveryDeliveryCommandId} IS NOT NULL`),
    uniqueIndex("deletion_operations_active_identity_target_uq")
      .on(t.userId)
      .where(
        sql`${t.scope} = 'identity' AND ${t.state} NOT IN ('complete', 'cancelled')`
      ),
    uniqueIndex("deletion_operations_active_profile_target_uq")
      .on(t.profileId)
      .where(
        sql`${t.scope} = 'profile' AND ${t.state} NOT IN ('complete', 'cancelled')`
      ),
    uniqueIndex("deletion_operations_active_workspace_target_uq")
      .on(t.workspaceId)
      .where(
        sql`${t.scope} = 'workspace' AND ${t.state} NOT IN ('complete', 'cancelled')`
      ),
    index("deletion_operations_user_idx").on(t.userId, t.state),
    index("deletion_operations_workspace_idx").on(t.workspaceId, t.state),
    index("deletion_operations_profile_idx").on(t.profileId, t.state),
    check(
      "deletion_operations_versions_non_negative",
      sql`${t.stateVersion} >= 0 AND ${t.journalVersion} >= 0 AND ${t.retryCount} >= 0 AND ${t.recoveryDeliveryAttempt} >= 0`
    ),
    check(
      "deletion_operations_journal_intent_shape",
      sql`((${t.journalIntentBaseVersion} IS NULL AND ${t.journalIntentPlanDigest} IS NULL AND ${t.journalIntentEffectiveAt} IS NULL)
          OR (${t.journalIntentBaseVersion} >= 0 AND ${t.journalIntentPlanDigest} ~ '^[0-9a-f]{64}$' AND ${t.journalIntentEffectiveAt} IS NOT NULL)) IS TRUE`
    ),
    check(
      "deletion_operations_payload_hash_shape",
      sql`length(${t.payloadHash}) = 64`
    ),
    check(
      "deletion_operations_requester_digest_shape",
      sql`(${t.requesterDigest} ~ '^[0-9a-f]{64}$') IS TRUE`
    ),
    check(
      "deletion_operations_request_session_digest_shape",
      sql`((${t.state} IN ('complete', 'cancelled') AND ${t.requestSessionDigest} IS NULL)
          OR (${t.state} NOT IN ('complete', 'cancelled') AND ${t.requestSessionDigest} ~ '^[0-9a-f]{64}$')) IS TRUE`
    ),
    check(
      "deletion_operations_request_authority_epoch_shape",
      sql`((${t.scope} = 'identity' AND ${t.requestMembershipVersion} IS NULL AND ${t.requestWorkspaceLifecycleVersion} IS NULL AND ${t.requestProfileLifecycleVersion} IS NULL)
          OR (${t.scope} = 'workspace' AND ${t.requestMembershipVersion} >= 1 AND ${t.requestWorkspaceLifecycleVersion} >= 1 AND ${t.requestProfileLifecycleVersion} IS NULL)
          OR (${t.scope} = 'profile' AND ${t.requestMembershipVersion} >= 1 AND ${t.requestWorkspaceLifecycleVersion} >= 1 AND ${t.requestProfileLifecycleVersion} >= 1)) IS TRUE`
    ),
    check(
      "deletion_operations_profile_prior_state_shape",
      sql`((${t.scope} = 'profile' AND ${t.profilePriorState} IN ('active', 'archived'))
          OR (${t.scope} <> 'profile' AND ${t.profilePriorState} IS NULL)) IS TRUE`
    ),
    check(
      "deletion_operations_cancellation_replay_shape",
      sql`((${t.state} = 'cancelled' AND (
            (${t.cancellationReplayDigest} ~ '^[0-9a-f]{64}$'
              AND ((${t.scope} = 'identity' AND ${t.identityCancellationReceiptExpiresAt} IS NOT NULL)
                OR (${t.scope} <> 'identity' AND ${t.identityCancellationReceiptExpiresAt} IS NULL)))
            OR (${t.scope} = 'identity'
              AND ${t.cancellationReplayDigest} IS NULL
              AND ${t.identityCancellationReceiptExpiresAt} IS NULL
              AND ${t.recoveryDeliveryStatus} <> 'not_required'
              AND ${t.stateVersion} = 2
              AND ${t.journalReceiptDigest} ~ '^[0-9a-f]{64}$'
              AND ${t.journalVersion} = 2
              AND ${t.acknowledgedAt} IS NULL
              AND ${t.tombstonedAt} IS NULL
              AND ${t.lastFailureCode} = 'recovery_expired_before_tombstone')))
          OR (${t.state} <> 'cancelled' AND ${t.cancellationReplayDigest} IS NULL AND ${t.identityCancellationReceiptExpiresAt} IS NULL)) IS TRUE`
    ),
    check(
      "deletion_operations_blocked_resume_shape",
      sql`((${t.state} = 'blocked' AND ${t.blockedResumeState} IN ('tombstoned', 'external_actions_pending', 'grace', 'erasing', 'verifying'))
          OR (${t.state} <> 'blocked' AND ${t.blockedResumeState} IS NULL)) IS TRUE`
    ),
    check(
      "deletion_operations_target_shape",
      sql`((${t.scope} = 'identity' AND ${t.userId} IS NOT NULL AND ${t.workspaceId} IS NULL AND ${t.profileId} IS NULL AND ${t.targetKey} = 'identity:' || ${t.userId}::text)
          OR (${t.scope} = 'profile' AND ${t.userId} IS NULL AND ${t.workspaceId} IS NOT NULL AND ${t.profileId} IS NOT NULL AND ${t.targetKey} = 'profile:' || ${t.workspaceId}::text || ':' || ${t.profileId}::text)
          OR (${t.scope} = 'workspace' AND ${t.userId} IS NULL AND ${t.workspaceId} IS NOT NULL AND ${t.profileId} IS NULL AND ${t.targetKey} = 'workspace:' || ${t.workspaceId}::text)) IS TRUE`
    ),
    check(
      "deletion_operations_recovery_shape",
      sql`((${t.scope} = 'identity' AND ${t.recoveryExpiresAt} IS NOT NULL AND ${t.recoveryDeliveryStatus} <> 'not_required'
            AND ((${t.recoveryConsumedAt} IS NULL AND ${t.recoverySecretDigest} IS NOT NULL AND ${t.recoverySecretPrefix} IS NOT NULL)
              OR (${t.recoveryConsumedAt} IS NOT NULL AND ${t.recoverySecretDigest} IS NULL AND ${t.recoverySecretPrefix} IS NULL)))
          OR (${t.scope} <> 'identity' AND ${t.recoverySecretDigest} IS NULL AND ${t.recoverySecretPrefix} IS NULL AND ${t.recoveryExpiresAt} IS NULL AND ${t.recoveryConsumedAt} IS NULL AND ${t.recoveryDeliveryStatus} = 'not_required')) IS TRUE`
    ),
    check(
      "deletion_operations_recovery_delivery_shape",
      sql`((${t.scope} <> 'identity' AND ${t.recoveryDeliveryAttempt} = 0 AND ${t.recoveryDeliveryCommandId} IS NULL
            AND ${t.recoveryDeliveryRecipientDigest} IS NULL AND ${t.recoveryDeliveryReceiptDigest} IS NULL
            AND ${t.recoveryDeliveryReconciliationDigest} IS NULL AND ${t.recoveryDeliveryAttemptedAt} IS NULL
            AND ${t.recoveryDeliveredAt} IS NULL)
          OR (${t.scope} = 'identity' AND ${t.recoveryDeliveryAttempt} >= 1
            AND ${t.recoveryDeliveryCommandId} IS NOT NULL
            AND ${t.recoveryDeliveryRecipientDigest} ~ '^[0-9a-f]{64}$'
            AND ${t.recoveryDeliveryAttemptedAt} IS NOT NULL
            AND ((${t.recoveryDeliveryStatus} IN ('pending', 'failed') AND ${t.recoveryDeliveryReceiptDigest} IS NULL AND ${t.recoveryDeliveryReconciliationDigest} IS NULL AND ${t.recoveryDeliveredAt} IS NULL)
              OR (${t.recoveryDeliveryStatus} = 'unknown' AND ${t.recoveryDeliveryReceiptDigest} IS NULL AND ${t.recoveryDeliveryReconciliationDigest} ~ '^[0-9a-f]{64}$' AND ${t.recoveryDeliveredAt} IS NULL)
              OR (${t.recoveryDeliveryStatus} = 'confirmed' AND ${t.recoveryDeliveryReceiptDigest} ~ '^[0-9a-f]{64}$' AND ${t.recoveryDeliveryReconciliationDigest} IS NULL AND ${t.recoveryDeliveredAt} IS NOT NULL
                AND ${t.recoveryDeliveredAt} >= ${t.recoveryDeliveryAttemptedAt} AND ${t.recoveryDeliveredAt} <= ${t.recoveryExpiresAt})))) IS TRUE`
    ),
    check(
      "deletion_operations_lease_shape",
      sql`(${t.leaseOwner} IS NULL AND ${t.leaseExpiresAt} IS NULL)
          OR (${t.leaseOwner} IS NOT NULL AND ${t.leaseExpiresAt} IS NOT NULL)`
    ),
  ]
);

/** One local receipt per externally confirmed immutable journal version. */
export const deletionOperationTransitions = pgTable(
  "deletion_operation_transitions",
  {
    id: id(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => deletionOperations.id, { onDelete: "restrict" }),
    scope: deletionScope("scope").notNull(),
    targetKey: text("target_key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "restrict",
    }),
    profileId: uuid("profile_id").references(() => creatorProfiles.id, {
      onDelete: "restrict",
    }),
    requesterUserId: uuid("requester_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requesterDigest: text("requester_digest").notNull(),
    version: integer("version").notNull(),
    fromState: deletionOperationState("from_state").notNull(),
    toState: deletionOperationState("to_state").notNull(),
    payloadHash: text("payload_hash").notNull(),
    externalReceiptDigest: text("external_receipt_digest").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("deletion_operation_transitions_operation_version_uq").on(
      t.operationId,
      t.version
    ),
    foreignKey({
      columns: [
        t.operationId,
        t.scope,
        t.targetKey,
        t.requesterDigest,
        t.payloadHash,
      ],
      foreignColumns: [
        deletionOperations.id,
        deletionOperations.scope,
        deletionOperations.targetKey,
        deletionOperations.requesterDigest,
        deletionOperations.payloadHash,
      ],
      name: "deletion_operation_transitions_operation_identity_fk",
    }).onDelete("restrict"),
    check(
      "deletion_operation_transitions_version_positive",
      sql`${t.version} >= 1`
    ),
    check(
      "deletion_operation_transitions_requester_digest_shape",
      sql`(${t.requesterDigest} ~ '^[0-9a-f]{64}$') IS TRUE`
    ),
    check(
      "deletion_operation_transitions_hash_shape",
      sql`length(${t.payloadHash}) = 64 AND length(${t.externalReceiptDigest}) = 64`
    ),
    check(
      "deletion_operation_transitions_target_shape",
      sql`(${t.scope} = 'identity' AND ${t.userId} IS NOT NULL AND ${t.workspaceId} IS NULL AND ${t.profileId} IS NULL AND ${t.targetKey} = 'identity:' || ${t.userId}::text)
          OR (${t.scope} = 'profile' AND ${t.userId} IS NULL AND ${t.workspaceId} IS NOT NULL AND ${t.profileId} IS NOT NULL AND ${t.targetKey} = 'profile:' || ${t.workspaceId}::text || ':' || ${t.profileId}::text)
          OR (${t.scope} = 'workspace' AND ${t.userId} IS NULL AND ${t.workspaceId} IS NOT NULL AND ${t.profileId} IS NULL AND ${t.targetKey} = 'workspace:' || ${t.workspaceId}::text)`
    ),
  ]
);

/**
 * Immutable role/version capture made before identity membership suspension.
 * Cancellation updates outcome only; the original snapshot columns never
 * change and remain able to explain every independently-won conflict.
 */
export const deletionMembershipSnapshots = pgTable(
  "deletion_membership_snapshots",
  {
    id: id(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => deletionOperations.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    role: membershipRole("role").notNull(),
    membershipVersion: integer("membership_version").notNull(),
    outcome: membershipRecoveryOutcome("outcome").default("pending").notNull(),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("deletion_membership_snapshots_operation_membership_uq").on(
      t.operationId,
      t.membershipId
    ),
    index("deletion_membership_snapshots_user_idx").on(t.userId),
    check(
      "deletion_membership_snapshots_version_positive",
      sql`${t.membershipVersion} >= 1`
    ),
    check(
      "deletion_membership_snapshots_outcome_shape",
      sql`(${t.outcome} = 'pending' AND ${t.outcomeAt} IS NULL)
          OR (${t.outcome} <> 'pending' AND ${t.outcomeAt} IS NOT NULL)`
    ),
  ]
);

/**
 * One-use server challenge obtained only after presenting the identity recovery
 * credential. Rows also form the durable, bounded password-attempt population.
 */
export const deletionRecoverySessions = pgTable(
  "deletion_recovery_sessions",
  {
    id: id(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => deletionOperations.id, { onDelete: "restrict" }),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    secretDigest: text("secret_digest").notNull(),
    secretPrefix: text("secret_prefix").notNull(),
    rateLimitKeyDigest: text("rate_limit_key_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("deletion_recovery_sessions_identity_uq").on(
      t.id,
      t.operationId,
      t.authUserId
    ),
    uniqueIndex("deletion_recovery_sessions_secret_digest_uq").on(t.secretDigest),
    index("deletion_recovery_sessions_operation_created_idx").on(
      t.operationId,
      t.createdAt
    ),
    index("deletion_recovery_sessions_rate_created_idx").on(
      t.rateLimitKeyDigest,
      t.createdAt
    ),
    check(
      "deletion_recovery_sessions_digest_shape",
      sql`${t.secretDigest} ~ '^[0-9a-f]{64}$' AND ${t.rateLimitKeyDigest} ~ '^[0-9a-f]{64}$' AND length(${t.secretPrefix}) = 8`
    ),
    check(
      "deletion_recovery_sessions_exact_ttl",
      sql`${t.expiresAt} = ${t.createdAt} + interval '15 minutes'`
    ),
    check(
      "deletion_recovery_sessions_consumed_after_creation",
      sql`${t.consumedAt} IS NULL OR ${t.consumedAt} >= ${t.createdAt}`
    ),
  ]
);

/**
 * A cancellation-only fresh-factor proof. It is never a Better Auth session,
 * so possessing it cannot authorize ordinary product or account access.
 */
export const deletionCancellationProofs = pgTable(
  "deletion_cancellation_proofs",
  {
    id: id(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => deletionOperations.id, { onDelete: "restrict" }),
    recoverySessionId: uuid("recovery_session_id")
      .notNull()
      .references(() => deletionRecoverySessions.id, { onDelete: "restrict" }),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    // Legacy, unconsumed proofs created before receipts existed fail closed at
    // the service boundary. New proofs always populate this digest. Keeping
    // the additive column nullable avoids inventing or deleting credentials in
    // a rolling migration.
    statusReceiptDigest: text("status_receipt_digest"),
    factorVerifiedAt: timestamp("factor_verified_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("deletion_cancellation_proofs_active_operation_uq")
      .on(t.operationId)
      .where(sql`${t.consumedAt} IS NULL`),
    uniqueIndex("deletion_cancellation_proofs_recovery_session_uq").on(
      t.recoverySessionId
    ),
    index("deletion_cancellation_proofs_auth_user_idx").on(t.authUserId),
    foreignKey({
      columns: [t.recoverySessionId, t.operationId, t.authUserId],
      foreignColumns: [
        deletionRecoverySessions.id,
        deletionRecoverySessions.operationId,
        deletionRecoverySessions.authUserId,
      ],
      name: "deletion_cancellation_proofs_recovery_identity_fk",
    }).onDelete("restrict"),
    check(
      "deletion_cancellation_proofs_status_receipt_digest_shape",
      sql`${t.statusReceiptDigest} IS NULL OR ${t.statusReceiptDigest} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "deletion_cancellation_proofs_exact_ttl",
      sql`${t.expiresAt} = ${t.factorVerifiedAt} + interval '10 minutes'`
    ),
    check(
      "deletion_cancellation_proofs_consumed_after_verification",
      sql`${t.consumedAt} IS NULL OR ${t.consumedAt} >= ${t.factorVerifiedAt}`
    ),
  ]
);

export const deletionExternalCommandKind = pgEnum(
  "deletion_external_command_kind",
  [
    "stripe_subscription_cancel_at_period_end",
    "stripe_subscription_reopen",
    "auto_topup_disable",
    "stripe_subscription_cancel_now",
    "stripe_customer_personal_fields_clear",
  ]
);

export const deletionExternalCommandPhase = pgEnum(
  "deletion_external_command_phase",
  ["pre_grace", "cancellation", "erasing"]
);

export const deletionExternalCommandStatus = pgEnum(
  "deletion_external_command_status",
  ["pending", "succeeded", "failed", "unknown"]
);

/**
 * Task 4 (10b-1 C2): one durable command identity per external side effect,
 * stored BEFORE dispatch. The row id is the provider idempotency key. An
 * `unknown` outcome is never guessed successful: it stays until reconciled and
 * blocks every later lifecycle transition that depends on it.
 */
export const deletionExternalCommands = pgTable(
  "deletion_external_commands",
  {
    id: id(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => deletionOperations.id, { onDelete: "restrict" }),
    scope: deletionScope("scope").notNull(),
    targetKey: text("target_key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "restrict",
    }),
    profileId: uuid("profile_id").references(() => creatorProfiles.id, {
      onDelete: "restrict",
    }),
    kind: deletionExternalCommandKind("kind").notNull(),
    phase: deletionExternalCommandPhase("phase").notNull(),
    attempt: integer("attempt").default(1).notNull(),
    status: deletionExternalCommandStatus("status").default("pending").notNull(),
    payloadHash: text("payload_hash").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    providerRefDigest: text("provider_ref_digest"),
    failureCode: text("failure_code"),
    reconciliationDigest: text("reconciliation_digest"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deletion_external_commands_operation_kind_attempt_uq").on(
      t.operationId,
      t.kind,
      t.attempt
    ),
    index("deletion_external_commands_operation_status_idx").on(
      t.operationId,
      t.phase,
      t.status
    ),
    check(
      "deletion_external_commands_attempt_positive",
      sql`${t.attempt} >= 1`
    ),
    check(
      "deletion_external_commands_payload_hash_shape",
      sql`(${t.payloadHash} ~ '^[0-9a-f]{64}$') IS TRUE`
    ),
    check(
      "deletion_external_commands_target_shape",
      sql`((${t.scope} = 'identity' AND ${t.userId} IS NOT NULL AND ${t.workspaceId} IS NULL AND ${t.profileId} IS NULL AND ${t.targetKey} = 'identity:' || ${t.userId}::text)
          OR (${t.scope} = 'profile' AND ${t.userId} IS NULL AND ${t.workspaceId} IS NOT NULL AND ${t.profileId} IS NOT NULL AND ${t.targetKey} = 'profile:' || ${t.workspaceId}::text || ':' || ${t.profileId}::text)
          OR (${t.scope} = 'workspace' AND ${t.userId} IS NULL AND ${t.workspaceId} IS NOT NULL AND ${t.profileId} IS NULL AND ${t.targetKey} = 'workspace:' || ${t.workspaceId}::text)) IS TRUE`
    ),
    check(
      "deletion_external_commands_kind_phase_shape",
      sql`((${t.kind} IN ('stripe_subscription_cancel_at_period_end', 'auto_topup_disable') AND ${t.phase} = 'pre_grace')
          OR (${t.kind} = 'stripe_subscription_reopen' AND ${t.phase} = 'cancellation')
          OR (${t.kind} IN ('stripe_subscription_cancel_now', 'stripe_customer_personal_fields_clear') AND ${t.phase} = 'erasing')) IS TRUE`
    ),
    check(
      "deletion_external_commands_kind_scope_shape",
      sql`((${t.kind} IN ('stripe_subscription_cancel_at_period_end', 'stripe_subscription_reopen', 'auto_topup_disable', 'stripe_subscription_cancel_now') AND ${t.scope} = 'workspace')
          OR (${t.kind} = 'stripe_customer_personal_fields_clear' AND ${t.scope} IN ('identity', 'workspace'))) IS TRUE`
    ),
    check(
      "deletion_external_commands_status_shape",
      sql`((${t.status} = 'pending' AND ${t.resolvedAt} IS NULL AND ${t.providerRefDigest} IS NULL AND ${t.failureCode} IS NULL AND ${t.reconciliationDigest} IS NULL)
          OR (${t.status} = 'succeeded' AND ${t.dispatchedAt} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL AND ${t.resolvedAt} >= ${t.dispatchedAt} AND ${t.failureCode} IS NULL AND ${t.reconciliationDigest} IS NULL AND (${t.providerRefDigest} IS NULL OR ${t.providerRefDigest} ~ '^[0-9a-f]{64}$'))
          OR (${t.status} = 'failed' AND ${t.resolvedAt} IS NOT NULL AND ${t.failureCode} IS NOT NULL AND ${t.providerRefDigest} IS NULL AND ${t.reconciliationDigest} IS NULL)
          OR (${t.status} = 'unknown' AND ${t.dispatchedAt} IS NOT NULL AND ${t.resolvedAt} IS NULL AND ${t.failureCode} IS NULL AND ${t.providerRefDigest} IS NULL AND ${t.reconciliationDigest} ~ '^[0-9a-f]{64}$')) IS TRUE`
    ),
  ]
);

export type DeletionOperation = typeof deletionOperations.$inferSelect;
export type DeletionOperationTransition =
  typeof deletionOperationTransitions.$inferSelect;
export type DeletionExternalCommand =
  typeof deletionExternalCommands.$inferSelect;
export type DeletionExternalCommandKind =
  (typeof deletionExternalCommandKind.enumValues)[number];
export type DeletionExternalCommandPhase =
  (typeof deletionExternalCommandPhase.enumValues)[number];
export type DeletionExternalCommandStatus =
  (typeof deletionExternalCommandStatus.enumValues)[number];
export type DeletionMembershipSnapshot =
  typeof deletionMembershipSnapshots.$inferSelect;
export type DeletionCancellationProof =
  typeof deletionCancellationProofs.$inferSelect;
export type DeletionRecoverySession = typeof deletionRecoverySessions.$inferSelect;
export type DeletionScope = (typeof deletionScope.enumValues)[number];
export type DeletionOperationState =
  (typeof deletionOperationState.enumValues)[number];
export type RecoveryDeliveryStatus =
  (typeof recoveryDeliveryStatus.enumValues)[number];
export type MembershipRecoveryOutcome =
  (typeof membershipRecoveryOutcome.enumValues)[number];
