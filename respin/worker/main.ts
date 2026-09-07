import { envInteger, requiredEnv } from "./env";
import { productionAlertPolicy } from "./health";
import { createProductionWorker } from "./production";

async function main(): Promise<void> {
  const env = process.env;
  const heartbeatIntervalMs = envInteger(env, "RESPIN_WORKER_HEARTBEAT_MS", 30_000);
  const worker = await createProductionWorker({
    databaseUrl: requiredEnv(env, "DATABASE_URL"),
    anthropicApiKey: requiredEnv(env, "ANTHROPIC_API_KEY"),
    queryPoolMax: envInteger(env, "RESPIN_WORKER_QUERY_POOL_MAX", 1),
    runtime: {
      queuePoolMax: envInteger(env, "RESPIN_WORKER_QUEUE_POOL_MAX", 2),
      concurrency: envInteger(env, "RESPIN_WORKER_CONCURRENCY", 4),
      // 0 is legal here and means "no local wait queue" — the same floor
      // `resolveQueueLimit` (pool.ts) accepts, so env and code agree.
      queueLimit: envInteger(env, "RESPIN_WORKER_LOCAL_QUEUE_MAX", 16, { minimum: 0 }),
      heartbeatIntervalMs,
      workerName: "respin-system-worker",
      // Code-fixed thresholds, named and cited in health.ts.
      alertPolicy: productionAlertPolicy(heartbeatIntervalMs),
    },
    // Task 4 declared `erasureScopesEnv` but main never passed it, so setting
    // RESPIN_DELETION_ERASURE_SCOPES in production did nothing at all — the
    // startup refusal that is supposed to reject a held scope was unreachable.
    // Both lifecycle env blocks are read here now, so a misconfiguration fails
    // loudly at boot rather than silently disabling erasure (Task 5 wiring).
    ...(env.RESPIN_DELETION_ERASURE_SCOPES === undefined
      ? {}
      : { erasureScopesEnv: env.RESPIN_DELETION_ERASURE_SCOPES }),
    journalEnv: {
      RESPIN_DELETION_JOURNAL_BUCKET: env.RESPIN_DELETION_JOURNAL_BUCKET,
      RESPIN_DELETION_JOURNAL_REGION: env.RESPIN_DELETION_JOURNAL_REGION,
      RESPIN_DELETION_JOURNAL_ENVIRONMENT: env.RESPIN_DELETION_JOURNAL_ENVIRONMENT,
      RESPIN_DELETION_JOURNAL_ENDPOINT: env.RESPIN_DELETION_JOURNAL_ENDPOINT,
    },
  });
  await worker.start();

  let stopping = false;
  const stop = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`${JSON.stringify({
      code: "worker_signal",
      observedAt: new Date().toISOString(),
      reasonCode: signal.toLowerCase(),
    })}\n`);
    await worker.stop();
  };
  const stopAfterSignal = (signal: "SIGINT" | "SIGTERM"): void => {
    void stop(signal).catch(() => {
      process.stderr.write(`${JSON.stringify({
        code: "worker_stop_failed",
        observedAt: new Date().toISOString(),
        reasonCode: signal.toLowerCase(),
      })}\n`);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => stopAfterSignal("SIGINT"));
  process.once("SIGTERM", () => stopAfterSignal("SIGTERM"));
}

void main().catch(() => {
  process.stderr.write(`${JSON.stringify({
    code: "worker_start_failed",
    observedAt: new Date().toISOString(),
  })}\n`);
  process.exitCode = 1;
});
