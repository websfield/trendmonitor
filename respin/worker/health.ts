export interface WorkerHealthSnapshot {
  readonly observedAt: string;
  readonly lastHeartbeatAt: string;
  readonly latestScheduleDueAt: string;
  readonly lastSuccessfulScheduleAt: string | null;
  readonly lastSuccessfulRunAt: string | null;
  readonly activeJobs: number;
  readonly queuedJobs: number;
  readonly parkedJobs: number;
  readonly deadLetterJobs: number;
  readonly previousDeadLetterJobs: number;
  readonly poolLimit: number;
  readonly budgetSpentMicroUsd: number;
  readonly budgetCapMicroUsd: number;
}

export interface WorkerAlertPolicy {
  readonly heartbeatStaleAfterMs: number;
  readonly scheduleGraceMs: number;
  readonly nearBudgetRatio: number;
  readonly poolPressureRatio: number;
}

/**
 * The production alert thresholds. CODE-FIXED — not env, not config — so the
 * runbook's alert table means the same thing on every host. Every number here
 * is an UNMEASURED LAUNCH BOUND with its reason and revisit trigger stated.
 */
/**
 * Heartbeats missed before `stale_heartbeat`, as a multiple of the process's
 * own write interval (default `RESPIN_WORKER_HEARTBEAT_MS` = 30 s → 90 s). A
 * multiple rather than a fixed 90 s so raising the interval by env cannot make
 * every heartbeat "stale" by construction. One skipped write is a slow DB
 * round-trip; three in a row is not. Revisit trigger: the first week's
 * observed heartbeat-age distribution in `system_worker_health`.
 */
export const HEARTBEAT_STALE_INTERVALS = 3;
/**
 * pg-boss fires a cron within 60 s of its boundary (timekeeper: due while the
 * previous occurrence is under 60 s old) and the worker polls every 1 s, so
 * two minute-cadences absorb one late fire without a false `missed_schedule`.
 * Revisit trigger: the first week's `schedule_lag_seconds` distribution.
 */
export const SCHEDULE_GRACE_MS = 120_000;
/**
 * `budget_near_cap` at 80 % leaves ~$20 of the $100/day cap (R-89): about
 * 110 more attempts at the 180,000 micro-USD reservation, enough to act on.
 * Revisit trigger: the first month's `budget_near_cap` vs `budget_exhausted`
 * counts — a warning that always precedes exhaustion by minutes is too late.
 */
export const NEAR_BUDGET_RATIO = 0.8;
/**
 * `pool_pressure` when active/limit reaches 80 % (a full pool at the default
 * four slots; within one slot of full at the code ceiling of eight) or any
 * job waits. Revisit trigger: the first month's active-count distribution.
 */
export const POOL_PRESSURE_RATIO = 0.8;

export function productionAlertPolicy(heartbeatIntervalMs: number): WorkerAlertPolicy {
  if (!Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) {
    throw new Error("heartbeat interval must be a positive safe integer");
  }
  return {
    heartbeatStaleAfterMs: HEARTBEAT_STALE_INTERVALS * heartbeatIntervalMs,
    scheduleGraceMs: SCHEDULE_GRACE_MS,
    nearBudgetRatio: NEAR_BUDGET_RATIO,
    poolPressureRatio: POOL_PRESSURE_RATIO,
  };
}

export type WorkerAlertCode =
  | "stale_heartbeat"
  | "missed_schedule"
  | "growing_dead_letters"
  | "budget_near_cap"
  | "budget_exhausted"
  | "pool_pressure";

export interface WorkerAlert {
  readonly code: WorkerAlertCode;
  readonly severity: "warning" | "critical";
  readonly observedAt: string;
  readonly activeJobs: number;
  readonly queuedJobs: number;
  readonly deadLetterJobs: number;
  readonly budgetSpentMicroUsd: number;
  readonly budgetCapMicroUsd: number;
  readonly scheduleLagMs: number;
}

function epoch(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO timestamp`);
  return parsed;
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

export function evaluateWorkerAlerts(
  snapshot: WorkerHealthSnapshot,
  policy: WorkerAlertPolicy,
): readonly WorkerAlert[] {
  const observed = epoch(snapshot.observedAt, "observedAt");
  const heartbeat = epoch(snapshot.lastHeartbeatAt, "lastHeartbeatAt");
  const due = epoch(snapshot.latestScheduleDueAt, "latestScheduleDueAt");
  const successfulSchedule = snapshot.lastSuccessfulScheduleAt === null
    ? null
    : epoch(snapshot.lastSuccessfulScheduleAt, "lastSuccessfulScheduleAt");
  if (snapshot.lastSuccessfulRunAt !== null) {
    epoch(snapshot.lastSuccessfulRunAt, "lastSuccessfulRunAt");
  }
  for (const [label, value] of Object.entries({
    activeJobs: snapshot.activeJobs,
    queuedJobs: snapshot.queuedJobs,
    parkedJobs: snapshot.parkedJobs,
    deadLetterJobs: snapshot.deadLetterJobs,
    previousDeadLetterJobs: snapshot.previousDeadLetterJobs,
    budgetSpentMicroUsd: snapshot.budgetSpentMicroUsd,
  })) nonNegativeInteger(value, label);
  if (!Number.isSafeInteger(snapshot.poolLimit) || snapshot.poolLimit <= 0) {
    throw new Error("poolLimit must be a positive safe integer");
  }
  if (snapshot.activeJobs > snapshot.poolLimit) {
    throw new Error("activeJobs cannot exceed the bounded pool limit");
  }
  if (!Number.isSafeInteger(snapshot.budgetCapMicroUsd) || snapshot.budgetCapMicroUsd < 0) {
    throw new Error("budgetCapMicroUsd must be a non-negative safe integer");
  }
  if (!Number.isFinite(policy.heartbeatStaleAfterMs) || policy.heartbeatStaleAfterMs <= 0) {
    throw new Error("heartbeatStaleAfterMs must be positive");
  }
  if (!Number.isFinite(policy.scheduleGraceMs) || policy.scheduleGraceMs < 0) {
    throw new Error("scheduleGraceMs must be non-negative");
  }
  if (!Number.isFinite(policy.nearBudgetRatio)
    || policy.nearBudgetRatio <= 0
    || policy.nearBudgetRatio >= 1) {
    throw new Error("nearBudgetRatio must be between zero and one");
  }
  if (!Number.isFinite(policy.poolPressureRatio)
    || policy.poolPressureRatio <= 0
    || policy.poolPressureRatio > 1) {
    throw new Error("poolPressureRatio must be greater than zero and at most one");
  }

  const scheduleLagMs = Math.max(0, observed - due);
  const alerts: WorkerAlert[] = [];
  const add = (code: WorkerAlertCode, severity: WorkerAlert["severity"]): void => {
    alerts.push({
      code,
      severity,
      observedAt: snapshot.observedAt,
      activeJobs: snapshot.activeJobs,
      queuedJobs: snapshot.queuedJobs,
      deadLetterJobs: snapshot.deadLetterJobs,
      budgetSpentMicroUsd: snapshot.budgetSpentMicroUsd,
      budgetCapMicroUsd: snapshot.budgetCapMicroUsd,
      scheduleLagMs,
    });
  };

  if (observed - heartbeat > policy.heartbeatStaleAfterMs) add("stale_heartbeat", "critical");
  if ((successfulSchedule === null || successfulSchedule < due)
    && scheduleLagMs > policy.scheduleGraceMs) {
    add("missed_schedule", "critical");
  }
  if (snapshot.deadLetterJobs > snapshot.previousDeadLetterJobs) {
    add("growing_dead_letters", "warning");
  }
  const budgetRatio = snapshot.budgetCapMicroUsd === 0
    ? Number.POSITIVE_INFINITY
    : snapshot.budgetSpentMicroUsd / snapshot.budgetCapMicroUsd;
  if (snapshot.budgetCapMicroUsd === 0 || budgetRatio >= 1) {
    add("budget_exhausted", "critical");
  } else if (budgetRatio >= policy.nearBudgetRatio) {
    add("budget_near_cap", "warning");
  }
  const poolRatio = snapshot.activeJobs / snapshot.poolLimit;
  if (snapshot.queuedJobs > 0 || poolRatio >= policy.poolPressureRatio) {
    add("pool_pressure", "warning");
  }
  return alerts;
}

export interface SafeWorkerEventInput {
  readonly code: string;
  readonly observedAt: string;
  readonly jobId?: string;
  readonly itemId?: string;
  readonly attemptId?: string;
  readonly reasonCode?: string;
  readonly activeJobs?: number;
  readonly queuedJobs?: number;
  readonly parkedJobs?: number;
  readonly deadLetterJobs?: number;
  readonly poolLimit?: number;
  readonly budgetSpentMicroUsd?: number;
  readonly budgetCapMicroUsd?: number;
  readonly scheduleLagMs?: number;
  // Phase 10b-1 Task 4: deletion executor tick counts. Counts only — the
  // operation ids stay in the database (plan C5: codes/counts/opaque ids).
  readonly deletionClaimed?: number;
  readonly deletionAdvanced?: number;
  readonly deletionWaiting?: number;
  readonly deletionBlocked?: number;
  readonly deletionErased?: number;
  // Phase 10b-1 Task 6: retention receiver counts. Same discipline — counts and
  // one content-safe key, never a row. `retentionKey` is a registry key
  // (`table::row_class::field_set`), which SAFE_TOKEN admits; it names WHICH
  // sweep a count belongs to without naming anything in it.
  readonly retentionKey?: string;
  readonly retentionScanned?: number;
  readonly retentionRedacted?: number;
  readonly retentionDeleted?: number;
  readonly retentionFinanceExtracts?: number;
  readonly retentionOldestOverdueMs?: number;
  /** Rows this tick could not write EVEN ALONE. Non-zero is always actionable. */
  readonly retentionPoisoned?: number;
  readonly retentionFailures?: number;
  readonly retentionTruncated?: number;
  readonly generationAbandoned?: number;
  readonly generationPastDeadline?: number;
  readonly generationSettleable?: number;
  readonly generationHardCleared?: number;
  /** Phase 10a: public Sample Spin stale-attempt recovery, per tick. Non-zero `failed` is always actionable. */
  readonly sampleSpinRecovered?: number;
  readonly sampleSpinRecoveryFailed?: number;
  // Phase 10a plan C5: the daily aggregate activation emitter. Counts of
  // cohorts, never a cohort's numbers — those go to the sink, not the log.
  readonly activationMatured?: number;
  readonly activationEmitted?: number;
  readonly activationSuppressedSmallCell?: number;
  readonly activationWithheldExpired?: number;
  readonly activationNotSent?: number;
  readonly activationFailed?: number;
}

export type SafeWorkerEvent = Readonly<Record<string, string | number>>;

const STRING_FIELDS = [
  "code",
  "observedAt",
  "jobId",
  "itemId",
  "attemptId",
  "reasonCode",
  "retentionKey",
] as const;
const NUMBER_FIELDS = [
  "activeJobs",
  "queuedJobs",
  "parkedJobs",
  "deadLetterJobs",
  "poolLimit",
  "budgetSpentMicroUsd",
  "budgetCapMicroUsd",
  "scheduleLagMs",
  "deletionClaimed",
  "deletionAdvanced",
  "deletionWaiting",
  "deletionBlocked",
  "deletionErased",
  "retentionScanned",
  "retentionRedacted",
  "retentionDeleted",
  "retentionFinanceExtracts",
  "retentionOldestOverdueMs",
  "retentionPoisoned",
  "retentionFailures",
  "retentionTruncated",
  "generationAbandoned",
  "generationPastDeadline",
  "generationSettleable",
  "generationHardCleared",
  "sampleSpinRecovered",
  "sampleSpinRecoveryFailed",
  "activationMatured",
  "activationEmitted",
  "activationSuppressedSmallCell",
  "activationWithheldExpired",
  "activationNotSent",
  "activationFailed",
] as const;

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function toSafeWorkerEvent(input: SafeWorkerEventInput): SafeWorkerEvent {
  const source = input as unknown as Record<string, unknown>;
  const safe: Record<string, string | number> = {};
  for (const field of STRING_FIELDS) {
    const value = source[field];
    if (typeof value !== "string") continue;
    if (field === "observedAt") {
      if (!Number.isFinite(Date.parse(value))) throw new Error("observedAt must be an ISO timestamp");
    } else if (!SAFE_TOKEN.test(value)) {
      throw new Error(`${field} must be a content-safe token`);
    }
    safe[field] = value;
  }
  for (const field of NUMBER_FIELDS) {
    const value = source[field];
    if (typeof value === "number") {
      nonNegativeInteger(value, field);
      safe[field] = value;
    }
  }
  if (typeof safe.code !== "string" || typeof safe.observedAt !== "string") {
    throw new Error("safe worker events require code and observedAt");
  }
  return Object.freeze(safe);
}
