import { PgBoss, type JobWithMetadata, type Queue, type UpdateQueueOptions } from "pg-boss";
import {
  AUTOPSY_CLAIM_LEASE_MS,
  type SystemAutopsyQueueCandidate,
  type SystemWorkerOperationalState,
} from "@respin/db";
import { BoundedConcurrencyPool, resolveConcurrencyLimit, resolveQueueLimit } from "./pool";
import type { WorkerDeletionTickSummary } from "./deletion-lifecycle";
import {
  evaluateWorkerAlerts,
  toSafeWorkerEvent,
  type SafeWorkerEvent,
  type WorkerAlertPolicy,
  type WorkerHealthSnapshot,
} from "./health";
import type {
  AutopsyRunOnceCommand,
  RefreshRunOnceCommand,
  RunOnceHandlers,
} from "./run-once";
import {
  evaluateRetentionAlerts,
  retentionTableEvents,
  retentionTickEvent,
  type RetentionRunSummary,
} from "./retention";
import { evaluateActivationAlerts, type ActivationEmitSummary } from "./activation-emitter";

export const PG_BOSS_SCHEMA = "respin_worker";
export const REFRESH_QUEUE = "respin.refresh.v1";
export const AUTOPSY_DISPATCH_QUEUE = "respin.autopsy-dispatch.v1";
export const AUTOPSY_QUEUE = "respin.autopsy.v1";
export const DEAD_LETTER_QUEUE = "respin.dead-letter.v1";
/** Phase 10b-1 Task 4: the deletion executor's one-minute tick. */
export const DELETION_LIFECYCLE_QUEUE = "respin.deletion-lifecycle.v1";
/** Phase 10b-1 Task 6: the retention receiver and attempt-recovery tick. */
export const RETENTION_QUEUE = "respin.retention.v1";
/** Phase 10a plan C5: the daily aggregate activation emitter (R-121). */
export const ACTIVATION_QUEUE = "respin.activation.v1";
/** Ten past midnight UTC: after the day's last cohort has had its full window. */
export const ACTIVATION_CRON = "10 0 * * *";
export const DAILY_REFRESH_CRON = "0 2 * * *";
export const AUTOPSY_DISPATCH_CRON = "* * * * *";
export const DELETION_LIFECYCLE_CRON = "* * * * *";
// One minute, set by the SHORTEST rule the tick owns: C5 puts the generation
// attempt boundaries on a one-minute receiver. The retention clocks themselves
// are 24 h and longer, so they are swept far more often than they need to be —
// which is the safe direction, and cheap because each sweep counts first.
export const RETENTION_CRON = "* * * * *";
export const PG_BOSS_POOL_CODE_CEILING = 2;
// The daily refresh's completed jobs are the only durable evidence that a
// 02:00 UTC run happened. pg-boss deletes completed jobs `deleteAfterSeconds`
// after completion on its maintenance sweep, and its cron has no catch-up
// (`timekeeper.js shouldSendIt`: due only while the previous occurrence is
// under 60 s old), so a completion kept for exactly ONE cadence is gone by the
// time a worker restarted after the next 02:00 asks for it — and the restart
// would then anchor the next due date on its own start time and mask the miss.
// Two cadences keep yesterday's completion visible across today's window.
export const DAILY_REFRESH_HISTORY_RETENTION_SECONDS = 2 * 86_400;

/**
 * The autopsy job's pg-boss expiry is the THIRD member of the wall-clock
 * family `autopsy-policy.ts` owns (lease, per-stage deadline ceiling, job
 * expiry). A job that expired before its claim lease would be re-sent with the
 * same `attemptId` — money-safe (`already_in_flight`) but a second worker slot
 * spent on a claim that is still held. Derived, never a literal (billing gate
 * round 1, CHANGE 2 + the code review's qualification, 2026-09-03).
 */
export const AUTOPSY_JOB_EXPIRE_SECONDS = Math.ceil(AUTOPSY_CLAIM_LEASE_MS / 1000);

/**
 * The refresh and dispatch queues' retry shape. Every number is an UNMEASURED
 * launch choice, cited in place (billing gate round 2, NOTE); the autopsy queue
 * overrides `expireInSeconds` with the lease-derived value above.
 */
const QUEUE_RETRY = Object.freeze({
  // Two retries, then dead-letter: a refused config (a deadline the lease
  // cannot hold) throws on every retry, so this is what turns that refusal
  // into a dead-letter alert about two minutes after the first throw
  // (`growing_dead_letters` in health.ts). Not more, so a permanent cause is
  // visible quickly; not zero, so one transient DB hiccup is not an alert.
  retryLimit: 2,
  // Seconds; the installed pg-boss backs off as 1–2 s then 2–4 s (`plans.js`,
  // proven in `tests/pg-boss.docker.test.ts`). One second is the smallest the
  // backoff formula accepts (`GREATEST(retry_delay, 1)`).
  retryDelay: 1,
  retryBackoff: true,
  // Caps the backoff so a retry never waits longer than half the dispatch
  // cadence (the dispatcher runs every minute).
  retryDelayMax: 30,
  // A stuck refresh or dispatch handler is failed at five minutes — these
  // handlers hold no claim and no lease, so this is outside the wall-clock
  // family `autopsy-policy.ts` owns; it is a plain liveness bound.
  expireInSeconds: 300,
  // A failed row (its `output` carries the refusal sentence — see the runbook)
  // survives one day before the maintenance sweep deletes it.
  retentionSeconds: 86_400,
  deleteAfterSeconds: 86_400,
  // A handler must beat this to keep its job active; the runtime's own
  // heartbeat interval is a separate, env-derived number (`main.ts`).
  heartbeatSeconds: 30,
  notify: true,
  deadLetter: DEAD_LETTER_QUEUE,
});

export interface PgBossRuntimeSources {
  readonly refreshNiches: () => Promise<readonly string[]>;
  readonly autopsyCandidates: () => Promise<readonly SystemAutopsyQueueCandidate[]>;
  /**
   * One call per dispatch tick for the whole admitted batch, so the config and
   * operational reads behind it happen once per tick rather than once per
   * candidate (up to 32 per minute through a one-connection query pool).
   */
  readonly autopsyCommands: (
    candidates: readonly SystemAutopsyQueueCandidate[],
    scheduledAt: Date,
  ) => Promise<readonly AutopsyRunOnceCommand[]>;
  readonly operationalState: (businessDate: string) => Promise<SystemWorkerOperationalState>;
  readonly persistHealth: (snapshot: WorkerHealthSnapshot) => Promise<void>;
  /**
   * Phase 10b-1 Task 4: one executor tick per minute. Optional so a runtime
   * composed without the deletion ports registers no lifecycle queue at all
   * rather than a queue whose handler has nothing to call.
   */
  readonly advanceDeletionLifecycle?: (scheduledAt: Date) => Promise<WorkerDeletionTickSummary>;
  /**
   * Phase 10b-1 Task 6: the retention receiver. Optional for the same reason
   * the lifecycle tick is — a runtime composed without it registers no queue,
   * rather than a queue whose handler has nothing to call.
   */
  readonly runRetention?: (scheduledAt: Date) => Promise<RetentionRunSummary>;
  /**
   * Phase 10a plan C5: the daily aggregate activation emitter. Optional for
   * the same reason as the two above; the production composition supplies it
   * and `production-sources.test.ts` proves the queue is registered.
   */
  readonly emitActivationAggregates?: (scheduledAt: Date) => Promise<ActivationEmitSummary>;
}

export interface WorkerEventSink {
  emit(event: SafeWorkerEvent): void;
}

export interface PgBossRuntimeConfig {
  readonly connectionString: string;
  readonly queuePoolMax: number;
  readonly concurrency: number;
  readonly queueLimit: number;
  readonly heartbeatIntervalMs: number;
  readonly workerName: string;
  readonly alertPolicy: WorkerAlertPolicy;
}

type QueueShape = Omit<Queue, "name">;

/**
 * The create shape minus the two keys the installed pg-boss refuses on update.
 * 12.29.0 (`dist/manager.js updateQueue`) throws "queue policy cannot be
 * changed after creation" whenever `'policy' in options` — an UNCHANGED value
 * included — and likewise for `partition`; `UpdateQueueOptions` omits both.
 * Sending the create shape to `updateQueue` made the worker exit 1 on its
 * second-ever start (slice 8 review BLOCK). Key filtering, not destructuring,
 * so the shape is stripped by NAME and lint cannot mistake it for dead code.
 */
const QUEUE_KEYS_FIXED_AT_CREATION = ["policy", "partition"] as const;

function queueUpdateShape(shape: QueueShape): UpdateQueueOptions {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(shape)) {
    if ((QUEUE_KEYS_FIXED_AT_CREATION as readonly string[]).includes(key)) continue;
    update[key] = value;
  }
  return update as UpdateQueueOptions;
}

function positiveInteger(value: number, label: string, ceiling?: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return ceiling === undefined ? value : Math.min(value, ceiling);
}

function required(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  return clean;
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function nextMinuteAfter(value: Date): Date {
  const next = new Date(value);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);
  return next;
}

function nextDailyRefreshAfter(value: Date): Date {
  const next = new Date(value);
  next.setUTCHours(2, 0, 0, 0);
  if (next.getTime() <= value.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * The most recent 02:00 UTC at or before `value`. With NO completed refresh on
 * record this is the refresh that is due: absence of evidence is not success,
 * so a worker (re)started after 02:00 with empty history reports today's
 * refresh as due-and-unfulfilled until one completes, rather than anchoring
 * on its own start time and reporting nothing until tomorrow.
 */
function latestDailyRefreshAtOrBefore(value: Date): Date {
  const latest = new Date(value);
  latest.setUTCHours(2, 0, 0, 0);
  if (latest.getTime() > value.getTime()) latest.setUTCDate(latest.getUTCDate() - 1);
  return latest;
}

function safeEvent(code: string, now: Date, fields: Omit<Parameters<typeof toSafeWorkerEvent>[0], "code" | "observedAt"> = {}): SafeWorkerEvent {
  return toSafeWorkerEvent({ code, observedAt: now.toISOString(), ...fields });
}

function parseAutopsyPayload(value: unknown): AutopsyRunOnceCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("autopsy job payload is invalid");
  }
  const row = value as Record<string, unknown>;
  const keys = [
    "job", "runId", "scheduledAt", "jobId", "itemId", "attemptId",
    "autopsyCacheClaimId", "businessDate", "modelCode", "maxCostMicroUsd",
    "maxInputTokens", "maxOutputTokens", "configuredDailyCapMicroUsd",
  ];
  if (Object.keys(row).some((key) => !keys.includes(key))
    || keys.some((key) => !(key in row))
    || row.job !== "autopsy") {
    throw new Error("autopsy job payload has an invalid closed shape");
  }
  for (const key of [
    "runId", "scheduledAt", "jobId", "itemId", "attemptId",
    "autopsyCacheClaimId", "businessDate", "modelCode",
  ]) {
    if (typeof row[key] !== "string" || !(row[key] as string).trim()) {
      throw new Error("autopsy job payload has an invalid string field");
    }
  }
  for (const key of [
    "maxCostMicroUsd", "maxInputTokens", "maxOutputTokens",
    "configuredDailyCapMicroUsd",
  ]) {
    const number = row[key];
    if (!Number.isSafeInteger(number) || (number as number) < 0) {
      throw new Error("autopsy job payload has an invalid numeric field");
    }
  }
  if ((row.maxCostMicroUsd as number) === 0
    || (row.maxInputTokens as number) === 0
    || (row.maxOutputTokens as number) === 0) {
    throw new Error("autopsy job payload has a zero paid-call ceiling");
  }
  return row as unknown as AutopsyRunOnceCommand;
}

export class RespinPgBossRuntime {
  readonly #boss: PgBoss;
  readonly #handlers: RunOnceHandlers;
  readonly #sources: PgBossRuntimeSources;
  readonly #events: WorkerEventSink;
  readonly #config: PgBossRuntimeConfig;
  readonly #pool: BoundedConcurrencyPool;
  readonly #now: () => Date;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #startedAt: Date | null = null;
  #lastSuccessfulRefreshAt: Date | null = null;
  #lastSuccessfulAutopsyDispatchAt: Date | null = null;
  #lastSuccessfulRunAt: string | null = null;
  #previousDeadLetterJobs = 0;
  #lastPersistedHeartbeatAt: string | null = null;

  constructor(input: {
    config: PgBossRuntimeConfig;
    handlers: RunOnceHandlers;
    sources: PgBossRuntimeSources;
    events: WorkerEventSink;
    boss?: PgBoss;
    now?: () => Date;
  }) {
    const queuePoolMax = positiveInteger(
      input.config.queuePoolMax,
      "worker pg-boss pool max",
      PG_BOSS_POOL_CODE_CEILING,
    );
    const heartbeatIntervalMs = positiveInteger(
      input.config.heartbeatIntervalMs,
      "worker heartbeat interval",
    );
    this.#config = {
      ...input.config,
      connectionString: required(input.config.connectionString, "worker database URL"),
      workerName: required(input.config.workerName, "worker name"),
      queuePoolMax,
      concurrency: resolveConcurrencyLimit(input.config.concurrency),
      queueLimit: resolveQueueLimit(input.config.queueLimit),
      heartbeatIntervalMs,
    };
    this.#handlers = input.handlers;
    this.#sources = input.sources;
    this.#events = input.events;
    this.#now = input.now ?? (() => new Date());
    this.#pool = new BoundedConcurrencyPool(
      this.#config.concurrency,
      this.#config.queueLimit,
    );
    this.#boss = input.boss ?? new PgBoss({
      connectionString: this.#config.connectionString,
      schema: PG_BOSS_SCHEMA,
      application_name: "respin-system-worker-queue",
      max: queuePoolMax,
      connectionTimeoutMillis: 10_000,
      useListenNotify: true,
      schedule: true,
    });
  }

  async start(): Promise<void> {
    this.#boss.on("error", () => {
      this.#events.emit(safeEvent("pg_boss_error", new Date()));
    });
    this.#boss.on("warning", () => {
      this.#events.emit(safeEvent("pg_boss_warning", new Date()));
    });
    try {
      await this.#boss.start();
      this.#startedAt = this.#now();
      await this.#ensureQueue(DEAD_LETTER_QUEUE, {
        policy: "standard",
        retentionSeconds: 2_592_000,
        deleteAfterSeconds: 2_592_000,
      });
      await this.#ensureQueue(REFRESH_QUEUE, {
        policy: "exclusive",
        ...QUEUE_RETRY,
        deleteAfterSeconds: DAILY_REFRESH_HISTORY_RETENTION_SECONDS,
      });
      await this.#ensureQueue(AUTOPSY_DISPATCH_QUEUE, { policy: "exclusive", ...QUEUE_RETRY });
      await this.#ensureQueue(AUTOPSY_QUEUE, {
        policy: "stately",
        ...QUEUE_RETRY,
        expireInSeconds: AUTOPSY_JOB_EXPIRE_SECONDS,
      });

      await this.#boss.schedule(REFRESH_QUEUE, DAILY_REFRESH_CRON, null, {
        tz: "UTC",
        key: "daily-refresh-v1",
      });
      await this.#boss.schedule(AUTOPSY_DISPATCH_QUEUE, AUTOPSY_DISPATCH_CRON, null, {
        tz: "UTC",
        key: "autopsy-dispatch-v1",
      });

      await this.#boss.work<null>(
        REFRESH_QUEUE,
        { includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 1 },
        async (jobs) => this.#runRefresh(jobs as JobWithMetadata<null>[]),
      );
      await this.#boss.work<null>(
        AUTOPSY_DISPATCH_QUEUE,
        { includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 1 },
        async (jobs) => this.#dispatchAutopsies(jobs as JobWithMetadata<null>[]),
      );
      await this.#boss.work<AutopsyRunOnceCommand>(
        AUTOPSY_QUEUE,
        {
          includeMetadata: true,
          localConcurrency: this.#config.concurrency,
          pollingIntervalSeconds: 1,
        },
        async (jobs) => this.#runAutopsy(jobs as JobWithMetadata<AutopsyRunOnceCommand>[]),
      );
      if (this.#sources.runRetention) {
        // Exclusive, like the lifecycle tick: two concurrent sweeps would both
        // count the same overdue rows and each report a backlog the other was
        // already clearing.
        await this.#ensureQueue(RETENTION_QUEUE, { policy: "exclusive", ...QUEUE_RETRY });
        await this.#boss.schedule(RETENTION_QUEUE, RETENTION_CRON, null, {
          tz: "UTC",
          key: "retention-v1",
        });
        await this.#boss.work<null>(
          RETENTION_QUEUE,
          { includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 1 },
          async (jobs) => this.#runRetention(jobs as JobWithMetadata<null>[]),
        );
      }
      if (this.#sources.emitActivationAggregates) {
        await this.#ensureQueue(ACTIVATION_QUEUE, { policy: "exclusive", ...QUEUE_RETRY });
        await this.#boss.schedule(ACTIVATION_QUEUE, ACTIVATION_CRON, null, {
          tz: "UTC",
          key: "activation-v1",
        });
        await this.#boss.work<null>(
          ACTIVATION_QUEUE,
          { includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 1 },
          async (jobs) => this.#runActivationEmit(jobs as JobWithMetadata<null>[]),
        );
      }
      if (this.#sources.advanceDeletionLifecycle) {
        // Exclusive: one tick in flight per queue; the executor's own lease is
        // the per-operation fence across workers.
        await this.#ensureQueue(DELETION_LIFECYCLE_QUEUE, { policy: "exclusive", ...QUEUE_RETRY });
        await this.#boss.schedule(DELETION_LIFECYCLE_QUEUE, DELETION_LIFECYCLE_CRON, null, {
          tz: "UTC",
          key: "deletion-lifecycle-v1",
        });
        await this.#boss.work<null>(
          DELETION_LIFECYCLE_QUEUE,
          { includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 1 },
          async (jobs) => this.#runDeletionLifecycle(jobs as JobWithMetadata<null>[]),
        );
      }

      await this.#restoreScheduleHistory();
      await this.#recordHealth(this.#now());
      this.#heartbeat = setInterval(() => {
        void this.#recordHealth(this.#now()).catch(() => {
          this.#events.emit(safeEvent("worker_health_write_failed", new Date()));
        });
      }, this.#config.heartbeatIntervalMs);
      this.#heartbeat.unref?.();
      this.#events.emit(safeEvent("worker_started", new Date(), {
        poolLimit: this.#config.concurrency,
      }));
    } catch (error) {
      if (this.#heartbeat !== null) {
        clearInterval(this.#heartbeat);
        this.#heartbeat = null;
      }
      try {
        await this.#boss.stop({ graceful: false, timeout: 5_000 });
      } catch {
        this.#events.emit(safeEvent("worker_start_cleanup_failed", new Date()));
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.#heartbeat !== null) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }
    await this.#boss.stop({ graceful: true, timeout: 30_000 });
    this.#events.emit(safeEvent("worker_stopped", new Date()));
  }

  /** Counts only: operation ids never enter the event stream. */
  async #runDeletionLifecycle(jobs: JobWithMetadata<null>[]): Promise<void> {
    const job = jobs[0];
    if (!job) throw new Error("deletion lifecycle worker received no job");
    const tick = this.#sources.advanceDeletionLifecycle;
    if (!tick) throw new Error("deletion lifecycle tick is not composed");
    const summary = await tick(job.createdOn);
    const observedAt = new Date();
    this.#events.emit(safeEvent("deletion_lifecycle_tick", observedAt, {
      deletionClaimed: summary.claimed,
      deletionAdvanced: summary.advanced,
      deletionWaiting: summary.waiting,
      deletionBlocked: summary.blocked,
      deletionErased: summary.erased,
      deletionWedgesResumed: summary.wedgesResumed,
      deletionWedgesRefused: summary.wedgesRefused,
      deletionHeldMoneyReplayed: summary.heldMoneyReplayed,
      deletionHeldMoneyFailed: summary.heldMoneyFailed,
      deletionHeldMoneyStillHeld: summary.heldMoneyStillHeld,
      deletionMoneyNeedsOperator: summary.moneyNeedsOperator,
      deletionRefundOwed: summary.refundOwed,
      deletionStalledWaits: summary.stalledWaits,
    }));
    // R-162 / R-165: each sweep isolates a failing item so the rest proceed,
    // so each failure count PAGES here rather than sitting in a counter
    // nobody reads (CLAUDE.md 2026-09-09). A refund owed is an operator
    // action by definition: money was collected for an erased workspace.
    if (summary.wedgesRefused > 0) {
      this.#events.emit(safeEvent("deletion_alert_page_wedge_resume_refused", observedAt, { deletionWedgesRefused: summary.wedgesRefused }));
    }
    if (summary.heldMoneyFailed > 0) {
      this.#events.emit(safeEvent("deletion_alert_page_held_money_replay_failed", observedAt, { deletionHeldMoneyFailed: summary.heldMoneyFailed }));
    }
    if (summary.refundOwed > 0) {
      this.#events.emit(safeEvent("deletion_alert_page_refund_owed", observedAt, { deletionRefundOwed: summary.refundOwed }));
    }
    // R-166: money held on an ACTIVE workspace (its customer no longer maps
    // to it) and a wait older than a day change by no tick on their own.
    if (summary.heldMoneyStillHeld > 0) {
      this.#events.emit(safeEvent("deletion_alert_page_held_money_still_held", observedAt, { deletionHeldMoneyStillHeld: summary.heldMoneyStillHeld }));
    }
    // R-166: late refund-owed money, and money no workspace could take.
    if (summary.moneyNeedsOperator > 0) {
      this.#events.emit(safeEvent("deletion_alert_page_money_needs_operator", observedAt, { deletionMoneyNeedsOperator: summary.moneyNeedsOperator }));
    }
    if (summary.stalledWaits > 0) {
      this.#events.emit(safeEvent("deletion_alert_page_wait_stalled", observedAt, { deletionStalledWaits: summary.stalledWaits }));
    }
  }

  /** Phase 10a C5: cohort COUNTS only; a cohort's own numbers go to the sink, never the log. */
  async #runActivationEmit(jobs: JobWithMetadata<null>[]): Promise<void> {
    const job = jobs[0];
    if (!job) throw new Error("activation worker received no job");
    const emit = this.#sources.emitActivationAggregates;
    if (!emit) throw new Error("activation emitter is not composed");
    const summary = await emit(job.createdOn);
    const observedAt = new Date();
    this.#events.emit(safeEvent("activation_emit", observedAt, {
      activationMatured: summary.matured,
      activationEmitted: summary.emitted,
      activationSuppressedSmallCell: summary.suppressedSmallCell,
      activationWithheldExpired: summary.withheldExpired,
      activationNotSent: summary.notSent,
      activationFailed: summary.failed,
    }));
    // Audit P3-R6: the count above paged nobody. Same code shape as the
    // retention alerts below — the severity rides the code.
    for (const alert of evaluateActivationAlerts(summary)) {
      this.#events.emit(safeEvent(`activation_alert_${alert.severity}_${alert.code}`, observedAt, alert.detail));
    }
  }

  /** Codes and counts only (C5): no table row or identifier enters the stream. */
  async #runRetention(jobs: JobWithMetadata<null>[]): Promise<void> {
    const job = jobs[0];
    if (!job) throw new Error("retention worker received no job");
    const tick = this.#sources.runRetention;
    if (!tick) throw new Error("retention tick is not composed");
    const summary = await tick(job.createdOn);
    const observedAt = new Date();
    this.#events.emit(safeEvent("retention_tick", observedAt, retentionTickEvent(summary)));
    for (const table of retentionTableEvents(summary)) {
      this.#events.emit(safeEvent("retention_table", observedAt, table));
    }
    for (const alert of evaluateRetentionAlerts(summary)) {
      // The severity rides the CODE rather than a field: the event allowlist
      // takes no `severity`, and a dropped one would make every alert look
      // like a warning.
      this.#events.emit(safeEvent(`retention_alert_${alert.severity}_${alert.code}`, observedAt, alert.detail));
    }
  }

  async #ensureQueue(name: string, shape: QueueShape): Promise<void> {
    if (await this.#boss.getQueue(name)) {
      await this.#boss.updateQueue(name, queueUpdateShape(shape));
    } else {
      await this.#boss.createQueue(name, shape);
    }
  }

  async #latestCompletedSchedule(name: string): Promise<Date | null> {
    const jobs = await this.#boss.findJobs(name);
    let latest: Date | null = null;
    for (const job of jobs) {
      if (job.state !== "completed") continue;
      if (latest === null || job.createdOn.getTime() > latest.getTime()) {
        latest = job.createdOn;
      }
    }
    return latest;
  }

  async #restoreScheduleHistory(): Promise<void> {
    [this.#lastSuccessfulRefreshAt, this.#lastSuccessfulAutopsyDispatchAt] = await Promise.all([
      this.#latestCompletedSchedule(REFRESH_QUEUE),
      this.#latestCompletedSchedule(AUTOPSY_DISPATCH_QUEUE),
    ]);
  }

  async #runRefresh(jobs: JobWithMetadata<null>[]): Promise<void> {
    const job = jobs[0];
    if (!job) throw new Error("refresh worker received no job");
    const scheduledAt = job.createdOn;
    const niches = await this.#sources.refreshNiches();
    let nextIndex = 0;
    let completed = 0;
    const consumerCount = Math.min(this.#config.concurrency, niches.length);
    await Promise.all(Array.from({ length: consumerCount }, async () => {
      while (nextIndex < niches.length) {
        const index = nextIndex;
        nextIndex += 1;
        const nicheId = niches[index];
        if (nicheId === undefined) return;
        await this.#pool.run(async () => {
          const command: RefreshRunOnceCommand = {
            job: "refresh",
            runId: `${job.id}:${index}`,
            scheduledAt: scheduledAt.toISOString(),
            nicheId,
          };
          const result = await this.#handlers.refresh(command);
          this.#events.emit(safeEvent(`refresh_${result.status}`, new Date(), { jobId: job.id }));
          if (result.status === "completed") {
            completed += 1;
            this.#lastSuccessfulRunAt = new Date().toISOString();
          }
        });
      }
    }));
    // THE ANCHOR MOVES ONLY FOR A RUN THAT ACCOMPLISHED SOMETHING (audit
    // P3-R6): at least one niche completed, or there was no niche to refresh.
    // It used to move on every run, so a refresh whose every niche BLOCKED
    // read as on schedule and `missed_schedule` could never fire. That alert
    // is the true state when discovery blocks; the remedy for its noise is
    // disabling the schedule, never advancing an anchor for work not done.
    if (niches.length === 0 || completed > 0) this.#lastSuccessfulRefreshAt = scheduledAt;
  }

  async #dispatchAutopsies(jobs: JobWithMetadata<null>[]): Promise<void> {
    const job = jobs[0];
    if (!job) throw new Error("autopsy dispatcher received no job");
    const candidates = await this.#sources.autopsyCandidates();
    const commands = await this.#sources.autopsyCommands(candidates, job.createdOn);
    for (const command of commands) {
      await this.#boss.send(AUTOPSY_QUEUE, command, {
        id: command.attemptId,
        singletonKey: command.autopsyCacheClaimId,
      });
    }
    this.#lastSuccessfulAutopsyDispatchAt = job.createdOn;
    this.#events.emit(safeEvent("autopsy_dispatch_completed", new Date(), {
      jobId: job.id,
    }));
  }

  async #runAutopsy(jobs: JobWithMetadata<AutopsyRunOnceCommand>[]): Promise<void> {
    const job = jobs[0];
    if (!job) throw new Error("autopsy worker received no job");
    const command = parseAutopsyPayload(job.data);
    const result = await this.#pool.run(() => this.#handlers.autopsy(command));
    this.#events.emit(safeEvent(`autopsy_${result.status}`, new Date(), {
      jobId: command.jobId,
      itemId: command.itemId,
      attemptId: command.attemptId,
      ...(result.status === "failed" && result.errorCode
        ? { reasonCode: result.errorCode }
        : {}),
    }));
    if (result.status === "succeeded" || result.status === "already_finalized") {
      this.#lastSuccessfulRunAt = new Date().toISOString();
    }
  }

  async #recordHealth(now: Date): Promise<void> {
    const pool = this.#pool.snapshot();
    const operational = await this.#sources.operationalState(utcDate(now));
    if (this.#lastSuccessfulRunAt === null && operational.lastSuccessfulRunAt) {
      this.#lastSuccessfulRunAt = operational.lastSuccessfulRunAt.toISOString();
    }
    const scheduleAnchor = this.#startedAt ?? now;
    const scheduleChecks = [
      {
        dueAt: this.#lastSuccessfulRefreshAt === null
          ? latestDailyRefreshAtOrBefore(now)
          : nextDailyRefreshAfter(this.#lastSuccessfulRefreshAt),
        successfulAt: this.#lastSuccessfulRefreshAt,
      },
      {
        dueAt: nextMinuteAfter(this.#lastSuccessfulAutopsyDispatchAt ?? scheduleAnchor),
        successfulAt: this.#lastSuccessfulAutopsyDispatchAt,
      },
    ].sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());
    const earliestSchedule = scheduleChecks[0];
    if (!earliestSchedule) throw new Error("worker schedule checks are unavailable");
    const stats = await this.#boss.getQueueStats(DEAD_LETTER_QUEUE, { force: true });
    // THE NEWEST SNAPSHOT BY `capturedOn`, NOT BY POSITION (audit P3-R6).
    // `stats.at(-1)` was right only because queue-stat persistence is off and
    // one snapshot comes back; pg-boss 12.29.0 returns `QueueStats[]` whose
    // order this code does not control once history is on.
    const current = stats.reduce<(typeof stats)[number] | undefined>(
      (newest, snapshot) =>
        newest === undefined || snapshot.capturedOn.getTime() > newest.capturedOn.getTime()
          ? snapshot
          : newest,
      undefined,
    );
    const deadLetterJobs = current
      ? current.deferredCount + current.queuedCount + current.readyCount
        + current.activeCount + current.failedCount
      : 0;
    const snapshot: WorkerHealthSnapshot = {
      observedAt: now.toISOString(),
      lastHeartbeatAt: now.toISOString(),
      latestScheduleDueAt: earliestSchedule.dueAt.toISOString(),
      lastSuccessfulScheduleAt: earliestSchedule.successfulAt?.toISOString() ?? null,
      lastSuccessfulRunAt: this.#lastSuccessfulRunAt,
      activeJobs: pool.active,
      queuedJobs: pool.queued,
      parkedJobs: operational.parkedJobs,
      deadLetterJobs,
      previousDeadLetterJobs: this.#previousDeadLetterJobs,
      poolLimit: pool.limit,
      budgetSpentMicroUsd: operational.budgetSpentMicroUsd,
      budgetCapMicroUsd: operational.budgetCapMicroUsd,
    };
    await this.#sources.persistHealth(snapshot);
    // WHAT THIS PROCESS CAN AND CANNOT ALERT ON. The persisted row carries
    // `lastHeartbeatAt = now` — that is the heartbeat, and it is what an
    // out-of-process reader must evaluate (slice 10b-1's admin read over
    // `system_worker_health.last_heartbeat_at`; until it exists, the runbook's
    // verification query). Evaluating the row we just wrote would make
    // heartbeat age 0 by construction, so in-process we evaluate against the
    // PREVIOUS successfully persisted heartbeat: `stale_heartbeat` from this
    // process means "my own heartbeat loop stalled longer than the threshold"
    // (a hung DB write, a blocked event loop). A STOPPED worker evaluates
    // nothing and can never fire it — only the external reader can.
    const evaluated: WorkerHealthSnapshot = {
      ...snapshot,
      lastHeartbeatAt: this.#lastPersistedHeartbeatAt ?? snapshot.lastHeartbeatAt,
    };
    this.#lastPersistedHeartbeatAt = snapshot.lastHeartbeatAt;
    for (const alert of evaluateWorkerAlerts(evaluated, this.#config.alertPolicy)) {
      this.#events.emit(toSafeWorkerEvent({
        code: alert.code,
        observedAt: alert.observedAt,
        activeJobs: alert.activeJobs,
        queuedJobs: alert.queuedJobs,
        deadLetterJobs: alert.deadLetterJobs,
        budgetSpentMicroUsd: alert.budgetSpentMicroUsd,
        budgetCapMicroUsd: alert.budgetCapMicroUsd,
        scheduleLagMs: alert.scheduleLagMs,
      }));
    }
    this.#previousDeadLetterJobs = deadLetterJobs;
  }
}

export function consoleWorkerEventSink(): WorkerEventSink {
  return {
    emit(event) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  };
}
