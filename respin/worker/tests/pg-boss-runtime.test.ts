import { describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { AUTOPSY_CLAIM_LEASE_MS } from "@respin/db";
import {
  ACTIVATION_QUEUE,
  AUTOPSY_DISPATCH_CRON,
  AUTOPSY_DISPATCH_QUEUE,
  AUTOPSY_QUEUE,
  DAILY_REFRESH_CRON,
  DAILY_REFRESH_HISTORY_RETENTION_SECONDS,
  DEAD_LETTER_QUEUE,
  REFRESH_QUEUE,
  RespinPgBossRuntime,
} from "../pg-boss-runtime";
import type { AutopsyRunOnceCommand, RunOnceHandlers } from "../run-once";

function job(id: string, data: unknown = null) {
  return [{ id, name: "queue", data, createdOn: new Date("2026-09-03T02:00:00.000Z") }];
}

// Mirrors the INSTALLED pg-boss 12.29.0 `updateQueue` refusals verbatim
// (`node_modules/pg-boss/dist/manager.js`): an empty update, or ANY presence
// of `policy` / `partition` — an unchanged value included — throws. An
// accept-anything fake let the production runtime send its create shape to
// `updateQueue` and crash-loop from its second start (slice 8 review BLOCK);
// the fake must refuse exactly what the library refuses so it cannot mask
// this class again. `tests/pg-boss.docker.test.ts` proves the same sequence
// against the real library.
function installedUpdateQueueRefusals(options: Record<string, unknown>): void {
  if (Object.keys(options).length === 0) throw new Error("no properties found to update");
  if ("policy" in options) throw new Error("queue policy cannot be changed after creation");
  if ("partition" in options) throw new Error("queue partitioning cannot be changed after creation");
}

function fakeBoss() {
  const queues = new Map<string, unknown>();
  const workers = new Map<string, (jobs: unknown[]) => Promise<unknown>>();
  const history = new Map<string, unknown[]>();
  const schedules: unknown[] = [];
  const sent: unknown[] = [];
  const boss = {
    on: vi.fn(),
    start: vi.fn(async () => boss),
    stop: vi.fn(async () => undefined),
    getQueue: vi.fn(async (name: string) => queues.get(name) ?? null),
    createQueue: vi.fn(async (name: string, shape: unknown) => { queues.set(name, shape); }),
    updateQueue: vi.fn(async (name: string, shape: Record<string, unknown>) => {
      installedUpdateQueueRefusals(shape);
      queues.set(name, { ...(queues.get(name) as object), ...shape });
    }),
    schedule: vi.fn(async (...args: unknown[]) => { schedules.push(args); }),
    work: vi.fn(async (name: string, _options: unknown, handler: (jobs: unknown[]) => Promise<unknown>) => {
      workers.set(name, handler);
      return `worker:${name}`;
    }),
    send: vi.fn(async (...args: unknown[]) => { sent.push(args); return "sent-id"; }),
    findJobs: vi.fn(async (name: string) => history.get(name) ?? []),
    getQueueStats: vi.fn(async () => [{
      deferredCount: 0,
      queuedCount: 0,
      readyCount: 0,
      activeCount: 0,
      failedCount: 0,
      totalCount: 0,
      capturedOn: new Date(),
    }]),
  };
  return { boss: boss as unknown as PgBoss, queues, workers, history, schedules, sent, raw: boss };
}

const command: AutopsyRunOnceCommand = {
  job: "autopsy",
  runId: "attempt-1",
  scheduledAt: "2026-09-03T02:00:00.000Z",
  jobId: "autopsy:claim-1",
  itemId: "item-1",
  attemptId: "attempt-1",
  autopsyCacheClaimId: "claim-1",
  businessDate: "2026-09-03",
  modelCode: "classification",
  maxCostMicroUsd: 100,
  maxInputTokens: 1_000,
  maxOutputTokens: 500,
  configuredDailyCapMicroUsd: 1_000,
};

describe("production pg-boss runtime", () => {
  it("installs the exact schedules, bounded queues and graceful shutdown", async () => {
    const fake = fakeBoss();
    const persisted: unknown[] = [];
    const refresh = vi.fn(async () => ({ status: "blocked_external_evidence" as const }));
    const autopsy = vi.fn(async () => ({ status: "succeeded" as const }));
    const candidates = [
      { cacheClaimId: "claim-1", itemId: "item-1", attemptNumber: 1 },
      { cacheClaimId: "claim-2", itemId: "item-2", attemptNumber: 1 },
    ];
    const autopsyCommands = vi.fn(async () => [command]);
    const handlers: RunOnceHandlers = {
      refresh,
      digest: vi.fn(async () => ({ status: "blocked_external_evidence" as const })),
      autopsy,
    };
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      handlers,
      events: { emit: vi.fn() },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 3,
        queueLimit: 4,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: {
          heartbeatStaleAfterMs: 90_000,
          scheduleGraceMs: 120_000,
          nearBudgetRatio: 0.8,
          poolPressureRatio: 0.8,
        },
      },
      sources: {
        refreshNiches: async () => ["editing", "business"],
        autopsyCandidates: async () => candidates,
        autopsyCommands,
        operationalState: async () => ({
          parkedJobs: 0,
          budgetSpentMicroUsd: 0,
          budgetCapMicroUsd: 1_000,
          lastSuccessfulScheduleAt: null,
          lastSuccessfulRunAt: null,
        }),
        persistHealth: async (snapshot) => { persisted.push(snapshot); },
      },
    });

    await runtime.start();
    expect([...fake.queues.keys()]).toEqual([
      DEAD_LETTER_QUEUE,
      REFRESH_QUEUE,
      AUTOPSY_DISPATCH_QUEUE,
      AUTOPSY_QUEUE,
    ]);
    expect(fake.schedules).toEqual([
      [REFRESH_QUEUE, DAILY_REFRESH_CRON, null, { tz: "UTC", key: "daily-refresh-v1" }],
      [AUTOPSY_DISPATCH_QUEUE, AUTOPSY_DISPATCH_CRON, null, { tz: "UTC", key: "autopsy-dispatch-v1" }],
    ]);
    expect(fake.schedules.flat()).not.toContain("weekly-digest");
    expect(persisted).toHaveLength(1);

    await fake.workers.get(REFRESH_QUEUE)!(job("refresh-job"));
    expect(refresh).toHaveBeenCalledTimes(2);
    await fake.workers.get(AUTOPSY_DISPATCH_QUEUE)!(job("dispatch-job"));
    // ONE planning call per tick for the whole batch — the config and
    // operational reads behind it happen once, not once per candidate.
    expect(autopsyCommands).toHaveBeenCalledTimes(1);
    expect(autopsyCommands).toHaveBeenCalledWith(candidates, new Date("2026-09-03T02:00:00.000Z"));
    expect(fake.sent).toEqual([[AUTOPSY_QUEUE, command, {
      id: "attempt-1",
      singletonKey: "claim-1",
    }]]);
    await fake.workers.get(AUTOPSY_QUEUE)!(job("attempt-1", command));
    expect(autopsy).toHaveBeenCalledWith(command);

    await runtime.stop();
    expect(fake.raw.stop).toHaveBeenCalledWith({ graceful: true, timeout: 30_000 });
  });

  it("rejects malformed job payloads before the autopsy handler", async () => {
    const fake = fakeBoss();
    const autopsy = vi.fn(async () => ({ status: "succeeded" as const }));
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy,
      },
      events: { emit: vi.fn() },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async () => undefined,
      },
    });
    await runtime.start();
    await expect(fake.workers.get(AUTOPSY_QUEUE)!(job("bad", { prompt: "must not cross" }))).rejects.toThrow("closed shape");
    expect(autopsy).not.toHaveBeenCalled();
    await runtime.stop();
  });

  it("drains a refresh batch larger than the bounded local queue without overflow", async () => {
    const fake = fakeBoss();
    const refresh = vi.fn(async () => ({ status: "completed" as const }));
    const niches = Array.from({ length: 25 }, (_, index) => `niche-${index}`);
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      handlers: {
        refresh,
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: vi.fn() },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 2,
        queueLimit: 1,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => niches,
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async () => undefined,
      },
    });
    await runtime.start();
    await expect(fake.workers.get(REFRESH_QUEUE)!(job("large-refresh"))).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(25);
    await runtime.stop();
  });

  it("restores each schedule independently so dispatcher success cannot hide a missed refresh", async () => {
    const fake = fakeBoss();
    const persisted: Array<{ latestScheduleDueAt: string; lastSuccessfulScheduleAt: string | null }> = [];
    fake.history.set(REFRESH_QUEUE, [{
      state: "completed",
      createdOn: new Date("2026-09-02T02:00:00.000Z"),
    }]);
    fake.history.set(AUTOPSY_DISPATCH_QUEUE, [{
      state: "completed",
      createdOn: new Date("2026-09-03T01:59:00.000Z"),
    }]);
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      now: () => new Date("2026-09-03T02:05:00.000Z"),
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: vi.fn() },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async (snapshot) => { persisted.push(snapshot); },
      },
    });

    await runtime.start();
    expect(fake.raw.findJobs).toHaveBeenCalledWith(REFRESH_QUEUE);
    expect(fake.raw.findJobs).toHaveBeenCalledWith(AUTOPSY_DISPATCH_QUEUE);
    expect(persisted[0]).toMatchObject({
      latestScheduleDueAt: "2026-09-03T02:00:00.000Z",
      lastSuccessfulScheduleAt: "2026-09-02T02:00:00.000Z",
    });
    await runtime.stop();
  });

  it("cleans up pg-boss when startup fails after opening resources", async () => {
    const fake = fakeBoss();
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: vi.fn() },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async () => { throw new Error("health store unavailable"); },
      },
    });

    await expect(runtime.start()).rejects.toThrow("health store unavailable");
    expect(fake.raw.stop).toHaveBeenCalledWith({ graceful: false, timeout: 5_000 });
  });

  it("survives a second start: existing queues are updated without the keys pg-boss fixes at creation", async () => {
    const fake = fakeBoss();
    const make = () => new RespinPgBossRuntime({
      boss: fake.boss,
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: vi.fn() },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async () => undefined,
      },
    });

    const first = make();
    await first.start();
    expect(fake.raw.createQueue).toHaveBeenCalledTimes(4);
    expect(fake.raw.updateQueue).not.toHaveBeenCalled();
    await first.stop();

    const second = make();
    await expect(second.start()).resolves.toBeUndefined();
    expect(fake.raw.createQueue).toHaveBeenCalledTimes(4);
    expect(fake.raw.updateQueue).toHaveBeenCalledTimes(4);
    for (const [, shape] of fake.raw.updateQueue.mock.calls as Array<[string, Record<string, unknown>]>) {
      expect(shape).not.toHaveProperty("policy");
      expect(shape).not.toHaveProperty("partition");
      expect(Object.keys(shape).length).toBeGreaterThan(0);
    }
    // The policies chosen at creation are what the queues still carry.
    expect((fake.queues.get(AUTOPSY_QUEUE) as { policy: string }).policy).toBe("stately");
    // The autopsy job expiry is derived from the claim lease (one wall-clock
    // family), so it can never be shorter than the lease it protects.
    expect((fake.queues.get(AUTOPSY_QUEUE) as { expireInSeconds: number }).expireInSeconds)
      .toBe(Math.ceil(AUTOPSY_CLAIM_LEASE_MS / 1000));
    expect((fake.queues.get(AUTOPSY_QUEUE) as { expireInSeconds: number }).expireInSeconds * 1000)
      .toBeGreaterThanOrEqual(AUTOPSY_CLAIM_LEASE_MS);
    expect((fake.queues.get(REFRESH_QUEUE) as { policy: string }).policy).toBe("exclusive");
    await second.stop();
  });

  it("evaluates stale_heartbeat against the PREVIOUS persisted heartbeat, never the row it just wrote", async () => {
    const fake = fakeBoss();
    const persisted: Array<{ observedAt: string; lastHeartbeatAt: string }> = [];
    const events: Array<Record<string, string | number>> = [];
    let now = new Date("2026-09-03T10:00:00.000Z");
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      now: () => now,
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: (event) => { events.push(event); } },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 5,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async (snapshot) => { persisted.push(snapshot); },
      },
    });

    await runtime.start();
    expect(persisted).toHaveLength(1);
    expect(events.some((event) => event.code === "stale_heartbeat")).toBe(false);

    // The process stalls for 200 s between heartbeats (threshold 90 s).
    now = new Date("2026-09-03T10:03:20.000Z");
    const deadline = Date.now() + 5_000;
    while (persisted.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await runtime.stop();
    expect(persisted.length).toBeGreaterThanOrEqual(2);
    const second = persisted[1]!;
    // The PERSISTED row is the heartbeat itself: what an out-of-process
    // reader evaluates. It is self-consistent, never back-dated.
    expect(second.lastHeartbeatAt).toBe(second.observedAt);
    expect(second.observedAt).toBe("2026-09-03T10:03:20.000Z");
    // The IN-PROCESS evaluation saw the 200 s gap.
    expect(events.some((event) => event.code === "stale_heartbeat"
      && event.observedAt === "2026-09-03T10:03:20.000Z")).toBe(true);
  });

  it("reports the current day's refresh as missed when history is empty and the clock is past 02:00 UTC", async () => {
    const fake = fakeBoss();
    const persisted: Array<{ latestScheduleDueAt: string; lastSuccessfulScheduleAt: string | null }> = [];
    const events: Array<Record<string, string | number>> = [];
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      now: () => new Date("2026-09-03T02:05:00.000Z"),
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: (event) => { events.push(event); } },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async (snapshot) => { persisted.push(snapshot); },
      },
    });

    await runtime.start();
    // No completed refresh exists in pg-boss history (a restart after the
    // one-cadence deletion, or a first start): the refresh due at 02:00 today
    // is due-and-unfulfilled, NOT re-anchored to tomorrow by the start time.
    expect(persisted[0]).toMatchObject({
      latestScheduleDueAt: "2026-09-03T02:00:00.000Z",
      lastSuccessfulScheduleAt: null,
    });
    expect(events.some((event) => event.code === "missed_schedule")).toBe(true);
    await runtime.stop();
  });

  it("keeps daily refresh completions for two cadences so a restart cannot lose the previous day's evidence", async () => {
    const fake = fakeBoss();
    const runtime = new RespinPgBossRuntime({
      boss: fake.boss,
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: vi.fn() },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async () => undefined,
      },
    });
    await runtime.start();
    expect(DAILY_REFRESH_HISTORY_RETENTION_SECONDS).toBeGreaterThanOrEqual(2 * 86_400);
    expect((fake.queues.get(REFRESH_QUEUE) as { deleteAfterSeconds: number }).deleteAfterSeconds)
      .toBe(DAILY_REFRESH_HISTORY_RETENTION_SECONDS);
    await runtime.stop();
  });
});

describe("audit P3-R6: three silent losses made loud", () => {
  type Persisted = { latestScheduleDueAt: string; lastSuccessfulScheduleAt: string | null; deadLetterJobs: number };
  function runtimeWith(opts: {
    fake: ReturnType<typeof fakeBoss>;
    now: () => Date;
    refresh?: () => Promise<{ status: "completed" | "blocked_external_evidence" }>;
    niches?: string[];
    heartbeatIntervalMs?: number;
    activation?: () => Promise<{ matured: number; emitted: number; suppressedSmallCell: number; withheldExpired: number; notSent: number; failed: number }>;
  }) {
    const persisted: Persisted[] = [];
    const events: Array<Record<string, string | number>> = [];
    const runtime = new RespinPgBossRuntime({
      boss: opts.fake.boss,
      now: opts.now,
      handlers: {
        refresh: (opts.refresh ?? (async () => ({ status: "completed" as const }))) as RunOnceHandlers["refresh"],
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      events: { emit: (event) => { events.push(event); } },
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 2,
        concurrency: 1,
        queueLimit: 4,
        heartbeatIntervalMs: opts.heartbeatIntervalMs ?? 600_000,
        workerName: "test-worker",
        alertPolicy: { heartbeatStaleAfterMs: 90_000, scheduleGraceMs: 120_000, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      sources: {
        refreshNiches: async () => opts.niches ?? [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({ parkedJobs: 0, budgetSpentMicroUsd: 0, budgetCapMicroUsd: 1_000, lastSuccessfulScheduleAt: null, lastSuccessfulRunAt: null }),
        persistHealth: async (snapshot) => { persisted.push(snapshot as unknown as Persisted); },
        ...(opts.activation ? { emitActivationAggregates: opts.activation } : {}),
      },
    });
    return { runtime, persisted, events };
  }
  const waitFor = async (check: () => boolean) => {
    const deadline = Date.now() + 5_000;
    while (!check() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
    expect(check()).toBe(true);
  };

  it("a failed activation send emits an alert CODE with the count; a clean emit emits none", async () => {
    for (const failed of [2, 0]) {
      const fake = fakeBoss();
      const { runtime, events } = runtimeWith({
        fake,
        now: () => new Date("2026-09-03T10:00:00.000Z"),
        activation: async () => ({ matured: 3, emitted: 3 - failed, suppressedSmallCell: 0, withheldExpired: 0, notSent: 0, failed }),
      });
      await runtime.start();
      await fake.workers.get(ACTIVATION_QUEUE)!(job("act"));
      await runtime.stop();
      const alerts = events.filter((e) => String(e.code).startsWith("activation_alert_"));
      if (failed === 0) {
        expect(alerts).toEqual([]);
      } else {
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ code: "activation_alert_warning_activation_send_failed", activationFailed: 2 });
      }
    }
  });

  it("a refresh in which EVERY niche blocked does not advance the anchor, so missed_schedule can fire; one that completed does", async () => {
    const run = async (status: "completed" | "blocked_external_evidence") => {
      const fake = fakeBoss();
      let now = new Date("2026-09-03T02:01:00.000Z");
      const { runtime, persisted, events } = runtimeWith({
        fake,
        now: () => now,
        niches: ["n1", "n2"],
        refresh: async () => ({ status }),
        heartbeatIntervalMs: 5,
      });
      await runtime.start();
      await fake.workers.get(REFRESH_QUEUE)!(job("refresh"));
      // Past the 2-minute grace, so a still-due 02:00 refresh is MISSED.
      now = new Date("2026-09-03T02:05:00.000Z");
      const seen = persisted.length;
      await waitFor(() => persisted.length > seen);
      await runtime.stop();
      return { last: persisted.at(-1)!, events };
    };
    const blocked = await run("blocked_external_evidence");
    expect(blocked.last.latestScheduleDueAt).toBe("2026-09-03T02:00:00.000Z");
    expect(blocked.last.lastSuccessfulScheduleAt).toBeNull();
    expect(blocked.events.some((e) => e.code === "missed_schedule" && e.observedAt === "2026-09-03T02:05:00.000Z")).toBe(true);
    const completed = await run("completed");
    // The completed refresh moved its anchor: the next refresh is tomorrow,
    // so 02:00 today is no longer the earliest schedule due.
    expect(completed.last.latestScheduleDueAt).not.toBe("2026-09-03T02:00:00.000Z");
  });

  it("the dead-letter count is read from the NEWEST snapshot by capturedOn, not from array position", async () => {
    const fake = fakeBoss();
    const snapshot = (capturedOn: string, failedCount: number) => ({
      deferredCount: 0, queuedCount: 0, readyCount: 0, activeCount: 0, failedCount, totalCount: failedCount,
      capturedOn: new Date(capturedOn),
    });
    // NEWEST FIRST — the order a persisted-history reply can come back in.
    (fake.raw.getQueueStats as ReturnType<typeof vi.fn>).mockResolvedValue([
      snapshot("2026-09-03T10:00:00.000Z", 7),
      snapshot("2026-09-03T09:00:00.000Z", 1),
    ]);
    const { runtime, persisted } = runtimeWith({ fake, now: () => new Date("2026-09-03T10:00:30.000Z") });
    await runtime.start();
    await runtime.stop();
    expect(persisted[0]!.deadLetterJobs).toBe(7);
  });
});
