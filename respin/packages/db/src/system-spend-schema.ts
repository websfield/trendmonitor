// Slice 8 sessionless product-overhead accounting. These rows deliberately
// carry no creator, workspace, or profile identifier: an autopsy is paid by
// the product budget, never a creator's credits or spend history.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

const id = () => uuid("id").primaryKey().$defaultFn(() => uuidv7());
const createdAt = () => timestamp("created_at", { withTimezone: true }).default(sql`clock_timestamp()`).notNull();

export const systemCostState = pgEnum("system_model_usage_cost_state", ["measured", "unknown"]);
export const systemUsageOutcome = pgEnum("system_model_usage_outcome", [
  "succeeded",
  "vendor_failed",
  "budget_exhausted",
  "reservation_overrun",
  "vendor_limit_overrun",
  "analysis_invalid",
]);
export const systemSpendClaimStatus = pgEnum("system_spend_claim_status", ["reserved", "cap_exhausted"]);
// R-117 (Phase 10a): the CLOSED purpose union. Every sessionless vendor call
// names which product overhead it is, and the attribution shape is CHECKed per
// purpose below: an autopsy names its trend item and cache claim; a public
// Sample Spin names only an opaque request id and never a tenant, profile or
// autopsy identifier. A third purpose is an enum value, a CHECK edit and a
// registry row-class — never a config change.
export const systemSpendPurpose = pgEnum("system_spend_purpose", ["trend_autopsy", "public_sample_spin"]);

export const systemSpendDaily = pgTable("system_spend_daily", {
  businessDate: date("business_date").primaryKey(),
  capMicroUsd: bigint("cap_micro_usd", { mode: "bigint" }).notNull(),
  reservedMicroUsd: bigint("reserved_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  knownCostMicroUsd: bigint("known_cost_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  callCount: integer("call_count").notNull().default(0),
  unknownCallCount: integer("unknown_call_count").notNull().default(0),
  overrunCallCount: integer("overrun_call_count").notNull().default(sql`0`),
  overrunMicroUsd: bigint("overrun_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: createdAt(),
}, (t) => [
  check("system_spend_daily_nonnegative", sql`${t.capMicroUsd} >= 0 AND ${t.reservedMicroUsd} >= 0 AND ${t.reservedMicroUsd} <= ${t.capMicroUsd} AND ${t.knownCostMicroUsd} >= 0 AND ${t.callCount} >= 0 AND ${t.unknownCallCount} >= 0 AND ${t.overrunCallCount} >= 0 AND ${t.overrunMicroUsd} >= 0 AND ${t.unknownCallCount} <= ${t.callCount} AND ${t.overrunCallCount} <= ${t.callCount}`),
]);

// A successful unique reservation is append-only. It makes the cap decision
// idempotent per fixed-order worker attempt before any stage call is made.
export const systemSpendClaims = pgTable(
  "system_spend_claims",
  {
    id: id(),
    jobAttemptId: text("job_attempt_id").notNull(),
    // These operational identifiers bind an idempotency key to exactly one
    // proposed paid pipeline. They are deliberately not creator/workspace/profile
    // identifiers; the system budget remains outside every tenant ledger.
    jobId: text("job_id").notNull(),
    // NOT NULL exactly when purpose = trend_autopsy (CHECK below). A public
    // Sample Spin has no trend item and no cache claim, by construction.
    trendItemId: uuid("trend_item_id"),
    autopsyCacheClaimId: uuid("autopsy_cache_claim_id"),
    purpose: systemSpendPurpose("purpose").notNull(),
    model: text("model").notNull(),
    businessDate: date("business_date").notNull().references(() => systemSpendDaily.businessDate, { onDelete: "restrict" }),
    reservedMicroUsd: bigint("reserved_micro_usd", { mode: "bigint" }).notNull(),
    requestedMicroUsd: bigint("requested_micro_usd", { mode: "bigint" }).notNull(),
    status: systemSpendClaimStatus("status").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("system_spend_claims_job_attempt_uq").on(t.jobAttemptId),
    check("system_spend_claims_reservation_shape", sql`(${t.status} = 'reserved' AND ${t.reservedMicroUsd} > 0 AND ${t.requestedMicroUsd} = ${t.reservedMicroUsd}) OR (${t.status} = 'cap_exhausted' AND ${t.reservedMicroUsd} = 0 AND ${t.requestedMicroUsd} > 0)`),
    // The autopsy ids are REQUIRED AT THE WRITE (`claimValues`) and NULLED at
    // 90 days by the identifier scrubber, so the CHECK cannot demand them for
    // the autopsy purpose; what it guards is the PUBLIC shape — a Sample Spin
    // row never names a trend item or a cache claim.
    check("system_spend_claims_attribution_shape", sql`${t.jobAttemptId} ~ '[^[:space:]]' AND ${t.jobId} ~ '[^[:space:]]' AND ${t.model} ~ '[^[:space:]]' AND (${t.purpose} <> 'public_sample_spin' OR (${t.trendItemId} IS NULL AND ${t.autopsyCacheClaimId} IS NULL))`),
  ]
);

// Append-only system counterpart of model_usage. One job attempt aggregates
// its fixed pipeline (four autopsy stages, or a Sample Spin's at most two
// drafts plus one scoring call) and retains its actual call count; retries
// mint a new job-attempt id rather than overwriting the first failure.
export const systemModelUsage = pgTable(
  "system_model_usage",
  {
    id: id(),
    jobAttemptId: text("job_attempt_id").notNull(),
    jobId: text("job_id").notNull(),
    trendItemId: uuid("trend_item_id"),
    purpose: systemSpendPurpose("purpose").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costMicroUsd: bigint("cost_micro_usd", { mode: "bigint" }),
    reservedCostMicroUsd: bigint("reserved_cost_micro_usd", { mode: "bigint" }).notNull(),
    reservationOverrunMicroUsd: bigint("reservation_overrun_micro_usd", { mode: "bigint" }),
    costState: systemCostState("cost_state").notNull(),
    outcome: systemUsageOutcome("outcome").notNull(),
    callCount: integer("call_count").notNull(),
    unknownCallCount: integer("unknown_call_count").notNull(),
    errorCode: text("error_code"),
    businessDate: date("business_date").notNull().references(() => systemSpendDaily.businessDate, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("system_model_usage_job_attempt_uq").on(t.jobAttemptId),
    check("system_model_usage_tokens_nonnegative", sql`(${t.tokensIn} IS NULL OR ${t.tokensIn} >= 0) AND (${t.tokensOut} IS NULL OR ${t.tokensOut} >= 0)`),
    check("system_model_usage_cost_known_iff", sql`(${t.costState} = 'unknown' AND ${t.costMicroUsd} IS NULL AND ${t.reservationOverrunMicroUsd} IS NULL) OR (${t.costState} = 'measured' AND ${t.costMicroUsd} >= 0 AND ${t.reservationOverrunMicroUsd} = GREATEST(${t.costMicroUsd} - ${t.reservedCostMicroUsd}, 0))`),
    check("system_model_usage_overrun_nonnegative", sql`${t.reservedCostMicroUsd} >= 0 AND (${t.reservationOverrunMicroUsd} IS NULL OR ${t.reservationOverrunMicroUsd} >= 0)`),
    // A SUCCESSFUL attempt records exactly its pipeline's calls: four autopsy
    // stages, or a Sample Spin's one or two drafts plus the scoring call (2..3).
    // A fourth Sample Spin call is impossible here as well as in code (R-123).
    check("system_model_usage_call_shape", sql`${t.callCount} BETWEEN 0 AND 4 AND ${t.unknownCallCount} BETWEEN 0 AND ${t.callCount} AND ((${t.outcome} = 'budget_exhausted') = (${t.callCount} = 0)) AND (${t.purpose} <> 'public_sample_spin' OR ${t.callCount} <= 3) AND (${t.outcome} <> 'succeeded' OR ((${t.purpose} = 'trend_autopsy' AND ${t.costState} = 'measured' AND ${t.callCount} = 4) OR (${t.purpose} = 'public_sample_spin' AND ${t.callCount} BETWEEN 2 AND 3))) AND ((${t.costState} = 'unknown') = (${t.unknownCallCount} > 0))`),
    check("system_model_usage_budget_refusal_zero", sql`${t.outcome} <> 'budget_exhausted' OR (${t.tokensIn} = 0 AND ${t.tokensOut} = 0 AND ${t.costMicroUsd} = 0 AND ${t.reservedCostMicroUsd} = 0 AND ${t.reservationOverrunMicroUsd} = 0 AND ${t.costState} = 'measured' AND ${t.callCount} = 0 AND ${t.unknownCallCount} = 0)`),
    check("system_model_usage_error_code_shape", sql`(${t.outcome} = 'succeeded') = (${t.errorCode} IS NULL) AND (${t.errorCode} IS NULL OR ${t.errorCode} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')`),
    check("system_model_usage_attribution_shape", sql`${t.jobAttemptId} ~ '[^[:space:]]' AND ${t.jobId} ~ '[^[:space:]]' AND ${t.model} ~ '[^[:space:]]' AND (${t.purpose} <> 'public_sample_spin' OR ${t.trendItemId} IS NULL)`),
  ]
);

// Reconciliation never rewrites a usage fact. One durable adjustment per
// attempt makes the retained daily projection exact and replay-safe.
export const systemModelUsageReconciliations = pgTable(
  "system_model_usage_reconciliations",
  {
    id: id(),
    jobAttemptId: text("job_attempt_id").notNull(),
    businessDate: date("business_date").notNull().references(() => systemSpendDaily.businessDate, { onDelete: "restrict" }),
    actualCostMicroUsd: bigint("actual_cost_micro_usd", { mode: "bigint" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("system_model_usage_reconciliations_attempt_uq").on(t.jobAttemptId),
    check("system_model_usage_reconciliations_cost_nonnegative", sql`${t.actualCostMicroUsd} >= 0`),
  ]
);

// Operational state owned by our worker rather than pg-boss. It deliberately
// contains no tenant key or content reference.
export const systemWorkerHealth = pgTable("system_worker_health", {
  workerName: text("worker_name").primaryKey(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull(),
  lastSuccessfulScheduleAt: timestamp("last_successful_schedule_at", { withTimezone: true }),
  lastSuccessfulRunAt: timestamp("last_successful_run_at", { withTimezone: true }),
  scheduleLagSeconds: integer("schedule_lag_seconds").notNull(),
  activeCount: integer("active_count").notNull(),
  parkedCount: integer("parked_count").notNull(),
  deadLetterCount: integer("dead_letter_count").notNull(),
  poolInUse: integer("pool_in_use").notNull(),
  poolCapacity: integer("pool_capacity").notNull(),
  budgetExhausted: integer("budget_exhausted").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`clock_timestamp()`).notNull(),
}, (t) => [
  check("system_worker_health_counts_nonnegative", sql`${t.scheduleLagSeconds} >= 0 AND ${t.activeCount} >= 0 AND ${t.parkedCount} >= 0 AND ${t.deadLetterCount} >= 0 AND ${t.poolInUse} >= 0 AND ${t.poolCapacity} >= ${t.poolInUse}`),
  check("system_worker_health_budget_exhausted_boolean", sql`${t.budgetExhausted} IN (0, 1)`),
]);

export type SystemModelUsage = typeof systemModelUsage.$inferSelect;
export type SystemModelUsageReconciliation = typeof systemModelUsageReconciliations.$inferSelect;
export type SystemWorkerHealth = typeof systemWorkerHealth.$inferSelect;
