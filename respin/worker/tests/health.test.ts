import { describe, expect, it } from "vitest";

import {
  HEARTBEAT_STALE_INTERVALS,
  NEAR_BUDGET_RATIO,
  POOL_PRESSURE_RATIO,
  SCHEDULE_GRACE_MS,
  evaluateWorkerAlerts,
  productionAlertPolicy,
  toSafeWorkerEvent,
  type WorkerHealthSnapshot,
} from "../health";

const BASE: WorkerHealthSnapshot = {
  observedAt: "2026-09-02T12:00:00.000Z",
  lastHeartbeatAt: "2026-09-02T11:59:50.000Z",
  latestScheduleDueAt: "2026-09-02T11:55:00.000Z",
  lastSuccessfulScheduleAt: "2026-09-02T11:55:01.000Z",
  lastSuccessfulRunAt: "2026-09-02T11:56:00.000Z",
  activeJobs: 1,
  queuedJobs: 0,
  parkedJobs: 0,
  deadLetterJobs: 2,
  previousDeadLetterJobs: 2,
  poolLimit: 4,
  budgetSpentMicroUsd: 40_000,
  budgetCapMicroUsd: 100_000,
};

const POLICY = {
  heartbeatStaleAfterMs: 60_000,
  scheduleGraceMs: 60_000,
  nearBudgetRatio: 0.8,
  poolPressureRatio: 0.75,
} as const;

function has(snapshot: WorkerHealthSnapshot, code: string): boolean {
  return evaluateWorkerAlerts(snapshot, POLICY).some((alert) => alert.code === code);
}

describe("production alert policy", () => {
  it("is code-fixed and derives the stale threshold from the heartbeat interval", () => {
    expect(productionAlertPolicy(30_000)).toEqual({
      heartbeatStaleAfterMs: 90_000,
      scheduleGraceMs: SCHEDULE_GRACE_MS,
      nearBudgetRatio: NEAR_BUDGET_RATIO,
      poolPressureRatio: POOL_PRESSURE_RATIO,
    });
    // A longer configured interval cannot make every heartbeat stale.
    expect(productionAlertPolicy(120_000).heartbeatStaleAfterMs)
      .toBe(HEARTBEAT_STALE_INTERVALS * 120_000);
    expect(HEARTBEAT_STALE_INTERVALS).toBeGreaterThan(1);
    expect(() => productionAlertPolicy(0)).toThrow(/positive safe integer/);
    // The policy the runtime validates accepts what this produces.
    expect(() => evaluateWorkerAlerts(BASE, productionAlertPolicy(30_000))).not.toThrow();
  });
});

describe("deterministic worker alerts", () => {
  it("covers stale-heartbeat false and true branches", () => {
    expect(has(BASE, "stale_heartbeat")).toBe(false);
    expect(has({ ...BASE, lastHeartbeatAt: "2026-09-02T11:58:00.000Z" }, "stale_heartbeat")).toBe(true);
  });

  it("covers missed-schedule false and true branches", () => {
    expect(has(BASE, "missed_schedule")).toBe(false);
    expect(
      has({ ...BASE, lastSuccessfulScheduleAt: "2026-09-02T11:50:00.000Z" }, "missed_schedule"),
    ).toBe(true);
    expect(has({ ...BASE, lastSuccessfulScheduleAt: null }, "missed_schedule")).toBe(true);
  });

  it("covers growing-dead-letter false and true branches", () => {
    expect(has(BASE, "growing_dead_letters")).toBe(false);
    expect(has({ ...BASE, deadLetterJobs: 3 }, "growing_dead_letters")).toBe(true);
  });

  it("covers near-budget false and true branches without duplicating exhausted", () => {
    expect(has(BASE, "budget_near_cap")).toBe(false);
    expect(has({ ...BASE, budgetSpentMicroUsd: 80_000 }, "budget_near_cap")).toBe(true);
    expect(has({ ...BASE, budgetSpentMicroUsd: 100_000 }, "budget_near_cap")).toBe(false);
  });

  it("covers exhausted-budget false and true branches", () => {
    expect(has(BASE, "budget_exhausted")).toBe(false);
    expect(has({ ...BASE, budgetSpentMicroUsd: 100_000 }, "budget_exhausted")).toBe(true);
    expect(
      has({ ...BASE, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 0 }, "budget_exhausted"),
    ).toBe(true);
  });

  it("covers pool-pressure false and true branches", () => {
    expect(has(BASE, "pool_pressure")).toBe(false);
    expect(has({ ...BASE, activeJobs: 3 }, "pool_pressure")).toBe(true);
    expect(has({ ...BASE, queuedJobs: 1 }, "pool_pressure")).toBe(true);
  });

  it("refuses impossible or fractional operational counts", () => {
    expect(() => evaluateWorkerAlerts({ ...BASE, activeJobs: 5 }, POLICY))
      .toThrow(/bounded pool limit/i);
    expect(() => evaluateWorkerAlerts({ ...BASE, deadLetterJobs: 2.5 }, POLICY))
      .toThrow(/safe integer/i);
    expect(() => toSafeWorkerEvent({
      code: "attempt_failed",
      observedAt: BASE.observedAt,
      activeJobs: -1,
    })).toThrow(/non-negative safe integer/i);
    expect(() => evaluateWorkerAlerts(BASE, { ...POLICY, nearBudgetRatio: Number.NaN }))
      .toThrow(/nearBudgetRatio/i);
    expect(() => evaluateWorkerAlerts(BASE, { ...POLICY, poolPressureRatio: Number.NaN }))
      .toThrow(/poolPressureRatio/i);
  });

  it("copies only the closed content-safe event field set", () => {
    const event = toSafeWorkerEvent({
      code: "attempt_failed",
      observedAt: BASE.observedAt,
      jobId: "job-1",
      itemId: "item-1",
      attemptId: "attempt-1",
      reasonCode: "vendor_unavailable",
      activeJobs: 2,
      prompt: "PLANTED PROMPT",
      transcript: "PLANTED TRANSCRIPT",
      creatorId: "creator-secret",
    } as unknown as Parameters<typeof toSafeWorkerEvent>[0]);

    expect(event).toEqual({
      code: "attempt_failed",
      observedAt: BASE.observedAt,
      jobId: "job-1",
      itemId: "item-1",
      attemptId: "attempt-1",
      reasonCode: "vendor_unavailable",
      activeJobs: 2,
    });
    expect(JSON.stringify(event)).not.toMatch(/PLANTED|creator/i);
  });

  it("rejects content smuggled into an id or code field", () => {
    expect(() =>
      toSafeWorkerEvent({
        code: "attempt_failed",
        observedAt: BASE.observedAt,
        jobId: "the planted prompt has spaces and prose",
      }),
    ).toThrow(/content-safe token/i);
    expect(() =>
      toSafeWorkerEvent({
        code: "the planted transcript is not an event code",
        observedAt: BASE.observedAt,
      }),
    ).toThrow(/content-safe token/i);
  });
});
