// R-52's verify-first task, executed against the INSTALLED pg-boss (pinned exact
// in package.json) on REAL Postgres. R-52 chose pg-boss from memory and said
// so: "Slice 8's FIRST task installs it and proves retry, cron scheduling and
// the pool bound against the installed version before anything is built on
// them." This suite is that proof. It does not wire a single application
// worker; it establishes that the six behaviours the worker adapter will lean
// on actually hold in this version, with the relevant options named. The LAST
// block is the stated exception: it drives the production worker's own config
// resolution and attempt composition against this same real Postgres (billing
// gate round 2, CHANGEs 1 and 2).
//
// THE DISPOSABLE SCHEMA: the suite runs in its own throwaway database
// (`respin_test_pgboss`, reset by `createDockerTestDb`) AND installs pg-boss
// into its own schema (`pgboss_proof`) inside it — never `public`, which holds
// the product's migrations. `createDockerTestDb` resets only `public` and
// `drizzle`, so the proof schema is dropped explicitly before start and after
// stop; a stale schedule left behind by a previous run would otherwise fire
// into the next run's "cron fires" case and make it pass for the wrong reason.
//
// EVERY BOUND HERE IS THE INSTALLED CODE'S, READ RATHER THAN REMEMBERED:
// - cron: `timekeeper.shouldSendIt` marks a schedule due when its PREVIOUS
//   occurrence is under 60s old, checked every `cronMonitorIntervalSeconds`
//   (floor 1s), and the resulting send is worked by an internal worker polling
//   every `cronWorkerIntervalSeconds` (floor 1s). So `* * * * *` fires within a
//   few seconds of being scheduled — the chain schedule row → timekeeper →
//   internal send queue → our queue → our handler is what is proven, at the
//   minute granularity pg-boss supports.
// - retry: `plans.js` computes the next `start_after` for a backoff retry as
//   `GREATEST(retry_delay,1) * (2^(retry_count+1)/2 + 2^(retry_count+1)/2 * random())`
//   seconds — with `retryDelay: 1` the first retry waits 1–2s and the second
//   2–4s — and stops retrying exactly when `retry_count = retry_limit`.
// - concurrency: `localConcurrency` spawns that many independent pollers for
//   one queue in this process (`manager.js`).
// - singleton: `stately` queues permit one job per state and singleton key, so
//   duplicate queued dispatches for one cache claim collapse while a different
//   claim remains independent. The database attempt row remains the authority
//   once a job becomes active.
// - connections: `max` is handed to `pg.Pool` (`db.js`). The LISTEN/NOTIFY
//   listener is a SEPARATE `pg.Client` outside the pool, opened at `start()`
//   ONLY when the constructor sets `useListenNotify: true` (`index.js
//   #doStart`; the installed default is `false`, `types.d.ts`) and acted on
//   only for queues created with `notify: true`. The proof boss sets both, as
//   production does, so the whole-process bound is `max` pooled sessions plus
//   EXACTLY ONE listener session — asserted as an equality at peak, because a
//   `<=` would have passed with no listener at all (which is what the first
//   version of this suite did: slice 8 code review, CHANGE 3).
// - the production runtime's own option set is proven below by starting the
//   real `RespinPgBossRuntime` TWICE against the same database: `createQueue`
//   with the full shape, `updateQueue` with the create-fixed keys stripped
//   (the installed `updateQueue` throws on any `policy`/`partition` key —
//   the slice 8 BLOCK), `schedule(…, { tz, key })` twice on the same key,
//   `work` options, `findJobs`, `getQueueStats({ force })`, and the
//   constructor's `useListenNotify`/`schedule`/`max`.
// - shutdown: `stop({ graceful: true })` waits for in-flight handlers (up to
//   `timeout`), fails whatever is still running, closes the pool, and only then
//   emits `stopped` (`index.js #doStop`).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgBoss, type Job } from "pg-boss";
import {
  AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS,
  CONFIG_V1_SEED,
  claimSharedAutopsyForSystem,
  closeSystemWorkerDb,
  createDockerTestDb,
  createSystemAutopsyAttemptStore,
  createSystemWorkerDb,
  createTrendSource,
  ensureUserWorkspace,
  recordSharedTrendItem,
  recordSharedTrendTranscript,
  seedAuthUser,
  systemAutopsyQueueCandidates,
  systemModelUsage,
  systemSpendClaims,
  type Db,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import type { LlmProvider } from "@respin/llm";
import { createRunOnceHandlers } from "../worker/handlers";
import {
  attemptBoundAutopsyVendor,
  productionAutopsyCommands,
  productionAutopsyVendor,
  resolveSystemConfig,
} from "../worker/production";
import { unavailableYouTubeDiscovery } from "../worker/refresh";
import type { SystemUsagePort } from "../worker/system-autopsy";
import { unavailableDigestDelivery } from "../worker/weekly-digest";
import {
  AUTOPSY_DISPATCH_CRON,
  AUTOPSY_DISPATCH_QUEUE,
  AUTOPSY_JOB_EXPIRE_SECONDS,
  AUTOPSY_QUEUE,
  DAILY_REFRESH_CRON,
  DAILY_REFRESH_HISTORY_RETENTION_SECONDS,
  DEAD_LETTER_QUEUE,
  PG_BOSS_SCHEMA,
  REFRESH_QUEUE,
  RespinPgBossRuntime,
} from "../worker/pg-boss-runtime";
import type { WorkerHealthSnapshot } from "../worker/health";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.error(
    "[pg-boss.docker.test] SKIPPED — TEST_DATABASE_URL is not set. NOT PROVEN in this run: R-52's verify-first task — that the installed pg-boss fires a cron schedule, retries a failed job exactly retryLimit times with backoff, honours localConcurrency, stays within its `max` pool bound, and stops cleanly, on REAL Postgres. Start the docker-compose DB and set TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const describeIfDocker = MAINTENANCE_URL ? describe : describe.skip;

const PROOF_SCHEMA = "pgboss_proof";
const APPLICATION_NAME = "respin_pgboss_proof";
// Deliberately SMALLER than the parallelism asked of it below (3 pollers plus
// pg-boss's own timekeeper and maintenance), so the pool bound is actually
// exercised — an unbounded pool would show more sessions than this, not the
// same number.
const POOL_MAX = 2;
const LISTENER_SESSIONS = 1;
const LOCAL_CONCURRENCY = 3;
const RETRY = { retryLimit: 2, retryDelay: 1, retryBackoff: true } as const;
const LONG = 45_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Sessions pg-boss holds on THIS database under one application_name, split
// into the pooled half and the listener half. The listener session is
// recognisable by its last statement: `LISTEN "..."` at connect, then its
// periodic `pg_listening_channels()` heartbeat (`db.js listen`). Everything
// else under the application_name is a pool session.
async function sessionsFor(
  pool: Awaited<ReturnType<typeof createDockerTestDb>>["pool"],
  applicationName: string
): Promise<{ total: number; pooled: number }> {
  const { rows } = await pool.query<{ total: number; pooled: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (
              WHERE query NOT ILIKE 'LISTEN %'
                AND query NOT ILIKE '%pg_listening_channels%'
            )::int AS pooled
       FROM pg_stat_activity
      WHERE application_name = $1
        AND datname = current_database()`,
    [applicationName]
  );
  return rows[0];
}

// Samples sessions every 25 ms while `run` executes and returns the peaks.
async function peakSessionsWhile(
  sample: () => Promise<{ total: number; pooled: number }>,
  run: () => Promise<void>
): Promise<{ total: number; pooled: number; samples: number }> {
  let peak = { total: 0, pooled: 0, samples: 0 };
  const sampler = setInterval(() => {
    void sample().then((s) => {
      peak = {
        total: Math.max(peak.total, s.total),
        pooled: Math.max(peak.pooled, s.pooled),
        samples: peak.samples + 1,
      };
    });
  }, 25);
  try {
    await run();
  } finally {
    clearInterval(sampler);
  }
  return peak;
}

async function waitFor(
  label: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  everyMs = 100
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(everyMs);
  }
  throw new Error(`waited ${timeoutMs}ms for ${label}`);
}

describeIfDocker("R-52 verify-first: the installed pg-boss on real Postgres", () => {
  let pool: Awaited<ReturnType<typeof createDockerTestDb>>["pool"];
  let boss: PgBoss;
  const bossErrors: Error[] = [];

  async function sessions(): Promise<{ total: number; pooled: number }> {
    return sessionsFor(pool, APPLICATION_NAME);
  }

  beforeAll(async () => {
    const harness = await createDockerTestDb(MAINTENANCE_URL!, "respin_test_pgboss");
    pool = harness.pool;
    await pool.query(`DROP SCHEMA IF EXISTS ${PROOF_SCHEMA} CASCADE`);
    boss = new PgBoss({
      connectionString: harness.url,
      schema: PROOF_SCHEMA,
      application_name: APPLICATION_NAME,
      max: POOL_MAX,
      // As production (`pg-boss-runtime.ts` constructor). Without this the
      // listener never exists and the "+1" below measures nothing.
      useListenNotify: true,
      cronMonitorIntervalSeconds: 1,
      cronWorkerIntervalSeconds: 1,
    });
    boss.on("error", (error) => bossErrors.push(error));
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: false, timeout: 1_000 }).catch(() => undefined);
    await pool.query(`DROP SCHEMA IF EXISTS ${PROOF_SCHEMA} CASCADE`);
    await pool.end();
  });

  it("installs into the disposable schema and leaves public untouched", async () => {
    expect(await boss.isInstalled()).toBe(true);
    expect(typeof (await boss.schemaVersion())).toBe("number");
    const schemata = await pool.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
      [PROOF_SCHEMA]
    );
    expect(schemata.rowCount).toBe(1);
    const leaked = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('job', 'queue', 'version', 'schedule', 'subscription')`
    );
    expect(leaked.rows).toEqual([]);
  });

  it(
    "a cron schedule fires: schedule row → timekeeper → queue → handler",
    async () => {
      const queue = "proof_cron";
      const fired: Job<{ source: string }>[] = [];
      await boss.createQueue(queue);
      await boss.work(
        queue,
        { pollingIntervalSeconds: 0.5 },
        async (jobs: Job<{ source: string }>[]) => {
          fired.push(...jobs);
        }
      );
      await boss.schedule(queue, "* * * * *", { source: "cron" });

      const schedules = await boss.getSchedules(queue);
      expect(schedules.map((s) => s.cron)).toEqual(["* * * * *"]);

      await waitFor("the cron-scheduled job to reach the handler", () => fired.length >= 1, 30_000);
      expect(fired[0].name).toBe(queue);
      expect(fired[0].data).toEqual({ source: "cron" });

      await boss.unschedule(queue);
      expect(await boss.getSchedules(queue)).toEqual([]);
      await boss.offWork(queue);
    },
    LONG
  );

  it(
    "a failing job retries exactly retryLimit times with exponential backoff, then fails terminally",
    async () => {
      const queue = "proof_retry";
      const attemptsAt: number[] = [];
      await boss.createQueue(queue, RETRY);
      await boss.work(queue, { pollingIntervalSeconds: 0.5 }, async () => {
        attemptsAt.push(Date.now());
        throw new Error("proof: deliberate failure");
      });
      const id = await boss.send(queue, { n: 1 });
      expect(id).toBeTypeOf("string");

      const job = async () => (await boss.findJobs(queue, { id: id! }))[0];
      await waitFor(
        "the job to fail terminally",
        async () => (await job())?.state === "failed",
        30_000,
        250
      );

      const failed = await job();
      expect(failed.retryLimit).toBe(RETRY.retryLimit);
      expect(failed.retryDelay).toBe(RETRY.retryDelay);
      expect(failed.retryBackoff).toBe(true);
      expect(failed.retryCount).toBe(RETRY.retryLimit);
      expect(JSON.stringify(failed.output)).toContain("proof: deliberate failure");
      expect(attemptsAt).toHaveLength(RETRY.retryLimit + 1);

      // Lower bounds are the formula's; the upper half of each window is
      // deliberate random jitter, so only the floors are asserted (with 100ms
      // of clock tolerance). 900 = 1s floor, 1900 = 2s floor.
      expect(attemptsAt[1] - attemptsAt[0]).toBeGreaterThanOrEqual(900);
      expect(attemptsAt[2] - attemptsAt[1]).toBeGreaterThanOrEqual(1_900);

      // FINITE: nothing arrives after the limit, even given another window.
      await sleep(3_000);
      expect(attemptsAt).toHaveLength(RETRY.retryLimit + 1);
      await boss.offWork(queue);
    },
    LONG
  );

  it(
    "localConcurrency bounds in-process parallelism and `max` bounds the pool",
    async () => {
      const queue = "proof_conc";
      const JOBS = 12;
      let active = 0;
      let peakActive = 0;
      let done = 0;

      // `notify: true` as the production queues are, so the listener is not
      // merely connected but in use for this queue.
      await boss.createQueue(queue, { notify: true });
      expect((await boss.getQueue(queue))?.notify).toBe(true);
      await boss.insert(
        queue,
        Array.from({ length: JOBS }, (_, i) => ({ data: { i } }))
      );

      const peakSessions = await peakSessionsWhile(sessions, async () => {
        // Under `notify: true` the installed worker polls at
        // `notifyPollingIntervalSeconds` (default max(30 s, base) —
        // `attorney.js`) and relies on NOTIFY for immediacy; these jobs were
        // inserted BEFORE the workers existed, so no NOTIFY wakes them and the
        // backstop is what drains the batch. Measured: at the 30 s default,
        // 12 jobs over 3 pollers needed ~90 s and this case timed out at 40 s.
        // Pinned to the floor so this case proves concurrency and the pool
        // bound, not notify latency. Production's runtime sets only
        // `pollingIntervalSeconds: 1`, so a job already queued when the worker
        // starts is picked up within 30 s there — the runbook says so.
        await boss.work(
          queue,
          {
            localConcurrency: LOCAL_CONCURRENCY,
            pollingIntervalSeconds: 0.5,
            notifyPollingIntervalSeconds: 0.5,
          },
          async () => {
            active += 1;
            peakActive = Math.max(peakActive, active);
            await sleep(300);
            active -= 1;
            done += 1;
          }
        );
        await waitFor(`all ${JOBS} jobs to complete`, () => done === JOBS, 40_000);
      });
      await boss.offWork(queue);

      expect(peakActive).toBeLessThanOrEqual(LOCAL_CONCURRENCY);
      // The option is live, not vacuous: with 12 jobs of 300ms and 3 pollers,
      // serial execution would never show two in flight at once.
      expect(peakActive).toBeGreaterThanOrEqual(2);

      expect(peakSessions.samples).toBeGreaterThan(0);
      expect(peakSessions.pooled).toBeGreaterThanOrEqual(1);
      expect(peakSessions.pooled).toBeLessThanOrEqual(POOL_MAX);
      // EQUALITY, not `<=`: the listener is a persistent session, so at every
      // sample total = pooled + 1, hence at peak too. `<=` was vacuous.
      expect(peakSessions.total).toBe(peakSessions.pooled + LISTENER_SESSIONS);

      const completed = (await boss.findJobs(queue)).filter((j) => j.state === "completed");
      expect(completed).toHaveLength(JOBS);
    },
    LONG
  );

  it("a stately queue rejects a duplicate queued singleton key", async () => {
    const queue = "proof_stately";
    await boss.createQueue(queue, { policy: "stately" });

    const first = await boss.send(queue, { claim: "first" }, {
      singletonKey: "cache-claim-a",
    });
    const duplicate = await boss.send(queue, { claim: "duplicate" }, {
      singletonKey: "cache-claim-a",
    });
    const independent = await boss.send(queue, { claim: "independent" }, {
      singletonKey: "cache-claim-b",
    });

    expect(first).toBeTypeOf("string");
    expect(duplicate).toBeNull();
    expect(independent).toBeTypeOf("string");

    const queued = (await boss.findJobs(queue)).filter((job) => job.state === "created");
    expect(queued).toHaveLength(2);
    expect(queued.map((job) => job.singletonKey).sort()).toEqual([
      "cache-claim-a",
      "cache-claim-b",
    ]);
    // `send(…, { id })` as the dispatcher uses it (`id: attemptId`): the
    // caller's id is the job id, and re-sending the same id is a no-op that
    // returns null (`insertJobs … ON CONFLICT DO NOTHING`), never a second job.
    const attemptId = randomUUID();
    expect(await boss.send(queue, { claim: "by-id" }, { id: attemptId, singletonKey: "cache-claim-c" }))
      .toBe(attemptId);
    expect(await boss.send(queue, { claim: "by-id-again" }, { id: attemptId, singletonKey: "cache-claim-d" }))
      .toBeNull();
    expect((await boss.findJobs(queue, { id: attemptId })).map((job) => job.singletonKey))
      .toEqual(["cache-claim-c"]);
  });

  it(
    "graceful stop finishes in-flight work, closes every session, then emits `stopped`",
    async () => {
      const queue = "proof_stop";
      let started = false;
      let finished = false;
      await boss.createQueue(queue);
      await boss.work(queue, { pollingIntervalSeconds: 0.5 }, async () => {
        started = true;
        await sleep(1_500);
        finished = true;
      });
      const id = await boss.send(queue, {});
      await waitFor("the long job to start", () => started, 15_000);

      const stopped = new Promise<void>((resolve) => boss.once("stopped", resolve));
      await boss.stop({ graceful: true, timeout: 10_000 });
      await stopped;

      expect(finished).toBe(true);
      const { rows } = await pool.query<{ state: string }>(
        `SELECT state FROM ${PROOF_SCHEMA}.job WHERE id = $1`,
        [id]
      );
      expect(rows.map((r) => r.state)).toEqual(["completed"]);

      await waitFor(
        "every pg-boss session to close",
        async () => (await sessions()).total === 0,
        10_000,
        200
      );
      expect(bossErrors).toEqual([]);
    },
    LONG
  );
});

// Constructor literals from `pg-boss-runtime.ts` that the runtime does not
// export; asserted here so a rename there reddens this proof rather than
// silently measuring nothing.
const RUNTIME_APPLICATION_NAME = "respin-system-worker-queue";
const RUNTIME_QUEUE_POOL_MAX = 2;

describeIfDocker("the production runtime against the installed pg-boss (start twice)", () => {
  let pool: Awaited<ReturnType<typeof createDockerTestDb>>["pool"];
  let url: string;

  async function runtimeSessions(): Promise<{ total: number; pooled: number }> {
    return sessionsFor(pool, RUNTIME_APPLICATION_NAME);
  }

  // pg-boss keeps internal queues of its own in the same table
  // (`__pgboss__send-it` carries cron sends); only the runtime's four are ours.
  async function queueRows() {
    const { rows } = await pool.query(
      `SELECT name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
              expire_seconds, retention_seconds, deletion_seconds, heartbeat_seconds,
              notify, dead_letter
         FROM ${PG_BOSS_SCHEMA}.queue
        WHERE name NOT LIKE '__pgboss__%'
        ORDER BY name`
    );
    return rows;
  }

  async function scheduleRows() {
    const { rows } = await pool.query(
      `SELECT name, key, cron, timezone FROM ${PG_BOSS_SCHEMA}.schedule ORDER BY name`
    );
    return rows;
  }

  function makeRuntime(persisted: WorkerHealthSnapshot[], events: Array<Record<string, string | number>>) {
    return new RespinPgBossRuntime({
      config: {
        connectionString: url,
        queuePoolMax: RUNTIME_QUEUE_POOL_MAX,
        concurrency: 2,
        queueLimit: 4,
        heartbeatIntervalMs: 600_000,
        workerName: "docker-proof-worker",
        alertPolicy: {
          heartbeatStaleAfterMs: 90_000,
          scheduleGraceMs: 120_000,
          nearBudgetRatio: 0.8,
          poolPressureRatio: 0.8,
        },
      },
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "succeeded" }),
      },
      sources: {
        refreshNiches: async () => [],
        autopsyCandidates: async () => [],
        autopsyCommands: async () => [],
        operationalState: async () => ({
          parkedJobs: 0,
          budgetSpentMicroUsd: 0,
          budgetCapMicroUsd: 1_000,
          lastSuccessfulScheduleAt: null,
          lastSuccessfulRunAt: null,
        }),
        persistHealth: async (snapshot) => { persisted.push(snapshot); },
      },
      events: { emit: (event) => { events.push(event); } },
    });
  }

  beforeAll(async () => {
    const harness = await createDockerTestDb(MAINTENANCE_URL!, "respin_test_pgbossruntime");
    pool = harness.pool;
    url = harness.url;
    // The runtime installs into its own fixed schema; the harness resets only
    // `public`/`drizzle`, so drop it explicitly (a leftover queue from a
    // previous run would make "second start" the FIRST thing this test sees).
    await pool.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE`);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE`);
    await pool.end();
  });

  it(
    "starts, stops, and starts AGAIN: existing queues are updated, schedules re-upserted, sessions bounded",
    async () => {
      const persisted: WorkerHealthSnapshot[] = [];
      const events: Array<Record<string, string | number>> = [];

      // FIRST start: every queue is created.
      const first = makeRuntime(persisted, events);
      const firstPeak = await peakSessionsWhile(runtimeSessions, async () => {
        await first.start();
        await sleep(1_000);
      });
      expect(events.some((event) => event.code === "worker_started")).toBe(true);
      const afterFirst = await queueRows();
      expect(afterFirst.map((row) => row.name)).toEqual(
        [AUTOPSY_DISPATCH_QUEUE, AUTOPSY_QUEUE, DEAD_LETTER_QUEUE, REFRESH_QUEUE].sort()
      );
      const byName = Object.fromEntries(afterFirst.map((row) => [row.name, row]));
      expect(byName[AUTOPSY_QUEUE]).toMatchObject({
        policy: "stately", retry_limit: 2, retry_delay: 1, retry_backoff: true,
        retry_delay_max: 30, expire_seconds: AUTOPSY_JOB_EXPIRE_SECONDS, retention_seconds: 86_400,
        deletion_seconds: 86_400, heartbeat_seconds: 30, notify: true,
        dead_letter: DEAD_LETTER_QUEUE,
      });
      expect(byName[REFRESH_QUEUE]).toMatchObject({
        policy: "exclusive", deletion_seconds: DAILY_REFRESH_HISTORY_RETENTION_SECONDS,
      });
      expect(byName[AUTOPSY_DISPATCH_QUEUE]).toMatchObject({ policy: "exclusive" });
      expect(byName[DEAD_LETTER_QUEUE]).toMatchObject({
        policy: "standard", retention_seconds: 2_592_000, deletion_seconds: 2_592_000,
      });
      expect(await scheduleRows()).toEqual([
        { name: AUTOPSY_DISPATCH_QUEUE, key: "autopsy-dispatch-v1", cron: AUTOPSY_DISPATCH_CRON, timezone: "UTC" },
        { name: REFRESH_QUEUE, key: "daily-refresh-v1", cron: DAILY_REFRESH_CRON, timezone: "UTC" },
      ]);
      // The production constructor's footprint: `max` pooled + exactly one
      // LISTEN client (`useListenNotify: true`), measured under its own
      // application_name.
      expect(firstPeak.samples).toBeGreaterThan(0);
      expect(firstPeak.pooled).toBeGreaterThanOrEqual(1);
      expect(firstPeak.pooled).toBeLessThanOrEqual(RUNTIME_QUEUE_POOL_MAX);
      expect(firstPeak.total).toBe(firstPeak.pooled + LISTENER_SESSIONS);
      expect(persisted).toHaveLength(1);

      await first.stop();
      expect(events.some((event) => event.code === "worker_stopped")).toBe(true);
      await waitFor(
        "every runtime session to close after the first stop",
        async () => (await runtimeSessions()).total === 0,
        10_000,
        200
      );

      // SECOND start against the same database: every queue already exists,
      // so `#ensureQueue` takes the `updateQueue` path. With the create shape
      // (policy included) the installed pg-boss throws here and the worker
      // exits 1 on every restart forever (slice 8 review BLOCK).
      const second = makeRuntime(persisted, events);
      await expect(second.start()).resolves.toBeUndefined();
      expect(persisted).toHaveLength(2);
      // The update changed nothing the first start did not already set, and
      // the policies fixed at creation are what the queues still carry.
      expect(await queueRows()).toEqual(afterFirst);
      expect(await scheduleRows()).toHaveLength(2);
      expect(events.filter((event) => event.code === "pg_boss_error")).toEqual([]);

      await second.stop();
      await waitFor(
        "every runtime session to close after the second stop",
        async () => (await runtimeSessions()).total === 0,
        10_000,
        200
      );
    },
    LONG * 2
  );
});

// ---------------------------------------------------------------------------
// Billing gate round 2. CHANGE 1: the guard in `production.ts` that refuses a
// stored `llm.overallDeadlineMs` four of which would outrun the claim lease
// had no witness — nothing drove the WORKER'S call against a real document.
// CHANGE 2: that same call, reached after a claim, used to record a vendor
// call of unknown cost for a request that never left the process. Both are
// driven here through the exported production paths against real Postgres.
// ---------------------------------------------------------------------------

const STAGE_JSON: Record<string, Record<string, unknown>> = {
  hook_mechanic: {
    stage: "hook_mechanic",
    hookMechanic: "open on a visible tradeoff",
    subjectTerms: ["batch cooking", "weeknight meals"],
    hook: "The pan I stopped using on weeknights",
  },
  beats: {
    stage: "beats",
    beats: ["show the setup", "turn on the constraint"],
    beatCount: 2,
    turnBeat: 1,
  },
  ending: { stage: "ending", ending: "return to the opening tradeoff" },
  follow_trigger: { stage: "follow_trigger", followTrigger: "name the next mechanism to test" },
};

/** Answers each stage from its stage-qualified attempt id; never touches a network. */
function stageProvider(): LlmProvider & { readonly stages: string[] } {
  const provider = {
    vendor: "test",
    stages: [] as string[],
    async complete(request: Parameters<LlmProvider["complete"]>[0]) {
      const stage = request.attemptId.split(":").pop() ?? "";
      provider.stages.push(stage);
      const body = STAGE_JSON[stage];
      if (!body) throw new Error(`unexpected stage ${stage}`);
      return {
        text: JSON.stringify(body),
        servedModel: request.model,
        usage: { tokensIn: 30, tokensOut: 10, raw: {} },
      };
    },
  };
  return provider;
}

describeIfDocker("the production worker's config resolution and attempt binding on real Postgres", () => {
  const WORKER_NAME = "respin-system-worker";
  let pool: Awaited<ReturnType<typeof createDockerTestDb>>["pool"];
  let db: Db;

  const withDeadline = (overallDeadlineMs: number) => ({
    ...CONFIG_V1_SEED,
    llm: { ...CONFIG_V1_SEED.llm, overallDeadlineMs },
  });

  /** A shared item with a rights-backed transcript and a prepared cache claim — the system-spend fixture shape. */
  async function pendingSharedAutopsy(suffix: string) {
    const authUserId = `pgboss-rights-${suffix}`;
    await seedAuthUser(db, authUserId);
    const rightsSubject = await ensureUserWorkspace(db, { authUserId });
    const source = await createTrendSource(db, {
      kind: "youtube",
      externalId: `r2-source-${suffix}`,
      sourceUrl: `https://example.test/${suffix}`,
    });
    const item = await recordSharedTrendItem(db, {
      sourceId: source.id,
      externalVideoId: `r2-video-${suffix}`,
      niche: "business",
      title: "A bounded system autopsy",
      channelId: "channel",
      videoViews: 200n,
      channelMedianRecentViews: "100.00000000",
      baselineSampleSize: 2,
      baselineObservationIds: ["baseline-a", "baseline-b"],
      baselineWindowStartsAt: new Date("2026-08-01T00:00:00Z"),
      baselineWindowEndsAt: new Date("2026-09-01T00:00:00Z"),
      sourcePublishedAt: new Date("2026-08-31T00:00:00Z"),
      transcriptState: "transcript_required",
      saturation: "unmeasured",
      saturationUnmeasuredReason: "incomplete_provenance",
    });
    const transcript = await recordSharedTrendTranscript(db, {
      trendItemId: item.id,
      content: `Rights-backed transcript for ${suffix}.`,
      rightsSubjectUserId: rightsSubject.user.id,
      provenance: {
        provider: "youtube_creator_owned_oauth",
        sourceReference: `https://www.youtube.com/watch?v=r2-video-${suffix}`,
        sharedAnalysisRightsBasis: "creator_owned_caption_consent",
        consentEvidenceId: `consent-fixture-${suffix}`,
      },
    });
    return claimSharedAutopsyForSystem(db, {
      trendItemId: item.id,
      contentDigest: transcript.contentDigest,
      analysisVersion: "v1",
    });
  }

  beforeAll(async () => {
    const harness = await createDockerTestDb(MAINTENANCE_URL!, "respin_test_workerconfig");
    pool = harness.pool;
    // The worker's OWN pool shape (one connection), not the harness pool.
    db = createSystemWorkerDb(harness.url, 1);
  });

  afterAll(async () => {
    await closeSystemWorkerDb(db);
    await pool.end();
  });

  it("CHANGE 1: a stored deadline one millisecond over the lease ceiling is refused by every production read, before any claim; the ceiling itself is admitted", async () => {
    await appendConfigVersion(db, withDeadline(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS + 1), "billing-round-2");
    const candidate = { cacheClaimId: "00000000-0000-7000-8000-0000000000aa", itemId: "00000000-0000-7000-8000-0000000000bb", attemptNumber: 1 };
    const scheduledAt = new Date();

    // The dispatch tick's read.
    await expect(productionAutopsyCommands({ db, workerName: WORKER_NAME, candidates: [candidate], scheduledAt }))
      .rejects.toThrow(/outruns the .* claim lease/);
    // The attempt's read (bound before the claim, CHANGE 2) — and the named read itself.
    await expect(productionAutopsyVendor({ db, apiKey: "test-key" })({
      jobId: "autopsy:x", itemId: candidate.itemId, attemptId: "attempt-r2-1", autopsyCacheClaimId: candidate.cacheClaimId,
      businessDate: scheduledAt.toISOString().slice(0, 10), modelCode: CONFIG_V1_SEED.llm.models.classification,
      maxCostMicroUsd: 1, maxInputTokens: 1, maxOutputTokens: 1, configuredDailyCapMicroUsd: 1,
    })).rejects.toThrow(/outruns the .* claim lease/);
    await expect(resolveSystemConfig(db)).rejects.toThrow(/outruns the .* claim lease/);
    expect(await db.select().from(systemSpendClaims)).toEqual([]);
    expect(await db.select().from(systemModelUsage)).toEqual([]);

    // Non-vacuity at the edge: the ceiling itself resolves and dispatches.
    await appendConfigVersion(db, withDeadline(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS), "billing-round-2");
    const commands = await productionAutopsyCommands({ db, workerName: WORKER_NAME, candidates: [candidate], scheduledAt });
    expect(commands.map((command) => command.autopsyCacheClaimId)).toEqual([candidate.cacheClaimId]);
    expect(await db.select().from(systemSpendClaims)).toEqual([]);
  }, LONG);

  it("CHANGE 2: a document refused AFTER the claim prices nothing of that attempt — four measured calls, zero unknown, and the NEXT tick is what refuses", async () => {
    await appendConfigVersion(db, withDeadline(CONFIG_V1_SEED.llm.overallDeadlineMs), "billing-round-2");
    await pendingSharedAutopsy("bound");
    const store = createSystemAutopsyAttemptStore(db);
    // The operator's refusing document lands the instant the real adapter
    // has placed the reservation — the window the per-stage read fell into.
    const usage: SystemUsagePort = {
      async startAttempt(input) {
        const claim = await store.startAttempt(input);
        await appendConfigVersion(db, withDeadline(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS + 1), "operator-mid-attempt");
        return claim;
      },
      finalizeAttempt: (input) => store.finalizeAttempt(input),
    };
    const provider = stageProvider();
    const handlers = createRunOnceHandlers({
      discovery: unavailableYouTubeDiscovery,
      digestInputs: { async load() { throw new Error("not under test"); } },
      digestDelivery: unavailableDigestDelivery,
      systemUsage: usage,
      autopsyVendor: attemptBoundAutopsyVendor({
        resolveConfig: () => resolveSystemConfig(db),
        createProvider: () => provider,
      }),
    });

    const candidates = await systemAutopsyQueueCandidates(db);
    expect(candidates).toHaveLength(1);
    const [command] = await productionAutopsyCommands({ db, workerName: WORKER_NAME, candidates, scheduledAt: new Date() });
    if (!command) throw new Error("the admitted candidate produced no command");

    await expect(handlers.autopsy(command)).resolves.toMatchObject({ status: "succeeded" });

    expect(provider.stages).toEqual(["hook_mechanic", "beats", "ending", "follow_trigger"]);
    const rows = (await db.select().from(systemModelUsage))
      .filter((row) => row.jobAttemptId === command.attemptId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: "succeeded",
      callCount: 4,
      unknownCallCount: 0,
      costState: "measured",
      errorCode: null,
    });
    const claims = (await db.select().from(systemSpendClaims))
      .filter((row) => row.jobAttemptId === command.attemptId);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ status: "reserved" });

    // The document appended mid-attempt is what the next dispatch tick sees.
    await expect(productionAutopsyCommands({ db, workerName: WORKER_NAME, candidates, scheduledAt: new Date() }))
      .rejects.toThrow(/outruns the .* claim lease/);
  }, LONG);
});
