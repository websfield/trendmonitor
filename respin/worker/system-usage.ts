import {
  createSystemAutopsyAttemptStore,
  recordSystemWorkerHealth,
  type DbLike,
} from "@respin/db";
import type { SystemUsagePort } from "./system-autopsy";
import type { WorkerHealthSnapshot } from "./health";

/**
 * The executable composition seam. Its return annotation is a compile-time
 * proof that the DB adapter implements the worker-owned port rather than a
 * similarly named, incompatible protocol.
 */
export function createSystemUsagePort(db: DbLike): SystemUsagePort {
  return createSystemAutopsyAttemptStore(db);
}

function instant(value: string, field: string): Date {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new Error(`${field} must be an ISO timestamp`);
  return new Date(epoch);
}

function optionalInstant(value: string | null, field: string): Date | null {
  return value === null ? null : instant(value, field);
}

/** Persist the worker's closed health snapshot without any content fields. */
export function persistSystemWorkerHealth(
  db: DbLike,
  workerName: string,
  snapshot: WorkerHealthSnapshot,
) {
  const observedAt = instant(snapshot.observedAt, "observedAt");
  const latestDueAt = instant(snapshot.latestScheduleDueAt, "latestScheduleDueAt");
  return recordSystemWorkerHealth(db, {
    workerName,
    lastHeartbeatAt: instant(snapshot.lastHeartbeatAt, "lastHeartbeatAt"),
    lastSuccessfulScheduleAt: optionalInstant(
      snapshot.lastSuccessfulScheduleAt,
      "lastSuccessfulScheduleAt",
    ),
    lastSuccessfulRunAt: optionalInstant(snapshot.lastSuccessfulRunAt, "lastSuccessfulRunAt"),
    scheduleLagSeconds: Math.floor(
      Math.max(0, observedAt.getTime() - latestDueAt.getTime()) / 1_000,
    ),
    activeCount: snapshot.activeJobs,
    parkedCount: snapshot.parkedJobs,
    deadLetterCount: snapshot.deadLetterJobs,
    poolInUse: snapshot.activeJobs,
    poolCapacity: snapshot.poolLimit,
    budgetExhausted:
      snapshot.budgetCapMicroUsd === 0 ||
      snapshot.budgetSpentMicroUsd >= snapshot.budgetCapMicroUsd,
  });
}
