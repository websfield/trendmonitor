// Phase 10a closes T69-R5 BEHAVIOURALLY: the production composition, started
// on a fake pg-boss, registers and schedules the retention, deletion-lifecycle
// and activation queues. Removing any source from `composeProductionSources`
// reddens the corresponding assertion — the non-vacuity half below proves
// the runtime really does skip a queue whose source is absent.
import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@respin/db";
import { composeProductionSources } from "../production";
import {
  ACTIVATION_CRON,
  ACTIVATION_QUEUE,
  DELETION_LIFECYCLE_CRON,
  DELETION_LIFECYCLE_QUEUE,
  RETENTION_CRON,
  RETENTION_QUEUE,
  RespinPgBossRuntime,
  type PgBossRuntimeSources,
} from "../pg-boss-runtime";
import type { RunOnceHandlers } from "../run-once";

function fakeBoss() {
  const queues = new Map<string, unknown>();
  const schedules: unknown[] = [];
  const boss = {
    on: vi.fn(),
    start: vi.fn(async () => boss),
    stop: vi.fn(async () => undefined),
    getQueue: vi.fn(async (name: string) => queues.get(name) ?? null),
    createQueue: vi.fn(async (name: string, shape: unknown) => { queues.set(name, shape); }),
    updateQueue: vi.fn(async () => undefined),
    schedule: vi.fn(async (...args: unknown[]) => { schedules.push(args); }),
    work: vi.fn(async () => "worker"),
    send: vi.fn(async () => "sent"),
    findJobs: vi.fn(async () => []),
    getQueueStats: vi.fn(async () => [{ deferredCount: 0, queuedCount: 0, readyCount: 0, activeCount: 0, failedCount: 0, totalCount: 0, capturedOn: new Date() }]),
  };
  return { boss: boss as unknown as PgBoss, queues, schedules };
}

const handlers: RunOnceHandlers = {
  refresh: vi.fn(async () => ({ status: "blocked_external_evidence" as const })),
  digest: vi.fn(async () => ({ status: "blocked_external_evidence" as const })),
  autopsy: vi.fn(async () => ({ status: "succeeded" as const })),
};

function runtimeWith(sources: PgBossRuntimeSources, boss: PgBoss) {
  return new RespinPgBossRuntime({
    boss,
    handlers,
    events: { emit: vi.fn() },
    config: {
      connectionString: "postgres://unused",
      queuePoolMax: 2,
      concurrency: 1,
      queueLimit: 4,
      heartbeatIntervalMs: 600_000,
      workerName: "test-worker",
      alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
    },
    sources,
  });
}

// A database handle that refuses to be queried: start() must register queues
// without touching a table, and the sources are lazy until a tick runs.
const refusingDb = new Proxy({}, {
  get(_target, property) {
    if (property === "then") return undefined;
    throw new Error(`the production sources touched the database at start(): ${String(property)}`);
  },
}) as unknown as Db;

describe("composeProductionSources", () => {
  it("supplies the retention, lifecycle and activation sources, and the runtime schedules all three", async () => {
    const sources = composeProductionSources({
      db: refusingDb,
      workerName: "test-worker",
      deletionLifecycle: vi.fn(async () => ({ claimed: 0, advanced: 0, waiting: 0, blocked: 0, erased: 0 }) as never),
      env: {},
    });
    expect(typeof sources.runRetention).toBe("function");
    expect(typeof sources.advanceDeletionLifecycle).toBe("function");
    expect(typeof sources.emitActivationAggregates).toBe("function");
    const fake = fakeBoss();
    // persistHealth is the one source start() calls; it must not be the real one here.
    const runtime = runtimeWith({ ...sources, persistHealth: vi.fn(async () => undefined), operationalState: vi.fn(async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null })) }, fake.boss);
    await runtime.start();
    expect([...fake.queues.keys()]).toEqual(expect.arrayContaining([RETENTION_QUEUE, DELETION_LIFECYCLE_QUEUE, ACTIVATION_QUEUE]));
    expect(fake.schedules).toEqual(expect.arrayContaining([
      [RETENTION_QUEUE, RETENTION_CRON, null, { tz: "UTC", key: "retention-v1" }],
      [DELETION_LIFECYCLE_QUEUE, DELETION_LIFECYCLE_CRON, null, { tz: "UTC", key: "deletion-lifecycle-v1" }],
      [ACTIVATION_QUEUE, ACTIVATION_CRON, null, { tz: "UTC", key: "activation-v1" }],
    ]));
    await runtime.stop();
  });

  it("NON-VACUITY: a composition WITHOUT runRetention registers no retention queue and no schedule", async () => {
    const sources = composeProductionSources({
      db: refusingDb,
      workerName: "test-worker",
      deletionLifecycle: vi.fn(async () => ({}) as never),
      env: {},
    });
    const { runRetention: _dropped, ...without } = sources;
    void _dropped;
    const fake = fakeBoss();
    const runtime = runtimeWith({ ...without, persistHealth: vi.fn(async () => undefined), operationalState: vi.fn(async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null })) }, fake.boss);
    await runtime.start();
    expect([...fake.queues.keys()]).not.toContain(RETENTION_QUEUE);
    expect(fake.schedules.flat()).not.toContain(RETENTION_QUEUE);
    expect([...fake.queues.keys()]).toContain(ACTIVATION_QUEUE);
    await runtime.stop();
  });
});
