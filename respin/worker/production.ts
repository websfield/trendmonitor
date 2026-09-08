import { runRetentionAndRecovery } from "./retention";
import { randomUUID } from "node:crypto";
import {
  assertAutopsyDeadlineWithinLease,
  closeSystemWorkerDb,
  createSystemAutopsyAttemptStore,
  createSystemWorkerDb,
  recoverStaleSystemAutopsyAttempts,
  systemAutopsyQueueCandidates,
  systemRefreshNiches,
  systemWorkerOperationalState,
  type Db,
  type SystemAutopsyQueueCandidate,
  type SystemWorkerOperationalState,
} from "@respin/db";
import {
  getActiveConfig,
  getActiveConfigRequiringStored,
  type ActiveConfig,
} from "@respin/config";
import {
  costMicroUsd,
  createAnthropicProvider,
  priceFor,
  type LlmProvider,
} from "@respin/llm";
import { createStripeExternalCommandPort } from "@respin/credits/deletion-server";
import { createAutopsyVendor } from "./autopsy-vendor";
import {
  createDeletionLifecycleTick,
  loadMigrationInventory,
  resolveDeletionJournal,
  resolveErasureEnablement,
} from "./deletion-lifecycle";
import { createRunOnceHandlers } from "./handlers";
import {
  RespinPgBossRuntime,
  consoleWorkerEventSink,
  type PgBossRuntimeConfig,
  type WorkerEventSink,
} from "./pg-boss-runtime";
import { unavailableYouTubeDiscovery } from "./refresh";
import type { AutopsyRunOnceCommand } from "./run-once";
import { persistSystemWorkerHealth } from "./system-usage";
import type { SystemVendorPortFactory } from "./system-autopsy";
import { unavailableDigestDelivery } from "./weekly-digest";

/**
 * Per-attempt input-token ceiling — and, times the classification price plus
 * the four-stage output ceiling, THE per-attempt reservation the daily $100
 * cap (R-89) is drawn down by (at seed prices 100k × 1,000 nano + 16k × 5,000
 * nano = 180,000 micro-USD). UNMEASURED LAUNCH BOUND: the vendor adapter
 * counts prompt BYTES as its token upper bound (`autopsy-vendor.ts`
 * `inputTokenUpperBound`), so this admits a transcript of up to ~100 KB of
 * UTF-8 per stage; the number was chosen to fit that, not from observed usage.
 * Revisit trigger: the first 200 finalized autopsies' measured `tokens_in`
 * in `system_model_usage` — reset the ceiling to their p99 with headroom, or
 * move it to config with a `.default` if operators need to tune it (slice 8
 * billing review, CHANGE 4).
 */
export const SYSTEM_AUTOPSY_INPUT_TOKEN_CODE_CEILING = 100_000;
export const SYSTEM_AUTOPSY_OUTPUT_STAGE_COUNT = 4;

function safeNumber(value: bigint, label: string): number {
  const out = Number(value);
  if (!Number.isSafeInteger(out) || out <= 0) {
    throw new Error(`${label} must fit a positive safe integer`);
  }
  return out;
}

/**
 * THE ONE config read every production autopsy path goes through: worker
 * construction, each dispatch tick, each attempt (once, before its claim —
 * `attemptBoundAutopsyVendor`) and each heartbeat. Exported so a test can
 * drive it against a real database (billing gate round 2, CHANGE 1); it is
 * not a second way to read config, it is the same one named.
 */
export async function resolveSystemConfig(db: Db): Promise<ActiveConfig> {
  return activeSystemConfig(db);
}

async function activeSystemConfig(db: Db): Promise<ActiveConfig> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const observed = await getActiveConfig(db);
    const model = observed.content.llm.models.classification;
    const required = await getActiveConfigRequiringStored(db, [
      "systemAutopsy.dailyCapMicroUsd",
      "llm.models.classification",
      `llm.prices.${model}`,
      "llm.maxOutputTokens",
      "llm.timeoutMs",
      "llm.overallDeadlineMs",
      "llm.maxRetries",
    ]);
    if (required.version === observed.version
      && required.content.llm.models.classification === model) {
      // A per-stage deadline four of which would outrun the claim lease is
      // REFUSED here, before any vendor adapter is built — never clamped
      // (`autopsy-policy.ts`; billing gate round 1, CHANGE 2).
      assertAutopsyDeadlineWithinLease(required.content.llm.overallDeadlineMs);
      return required;
    }
  }
  throw new Error("active config changed while the worker was resolving its spend bounds");
}

/**
 * ONE config read per ATTEMPT, before `startAttempt` — never per stage. The
 * previous shape re-resolved the config inside `analyseStage`, AFTER the
 * claim had placed its reservation and set the lease: a document appended in
 * that window whose deadline the lease refuses threw inside the stage, and
 * `runStage` counts any throw as a vendor call of unknown cost — a
 * `system_model_usage` row with `unknownCallCount: 1` for a call that never
 * left the process, and one of the five R-93 attempts spent on a config
 * refusal (billing gate round 2, CHANGE 2). Bound here, a refused config is
 * refused with no reservation to retain and no call to account for (the job
 * throws, retries and dead-letters exactly as a refused dispatch does), and
 * a document appended mid-attempt prices NOTHING of that attempt: the
 * prices, deadline and output ceiling an attempt was admitted under are the
 * ones it runs under. `createProvider` is injected so the composition can be
 * driven without a network; production passes the Anthropic adapter.
 */
export function attemptBoundAutopsyVendor(input: {
  resolveConfig: () => Promise<ActiveConfig>;
  createProvider: (settings: { timeoutMs: number; maxRetries: number }) => LlmProvider;
}): SystemVendorPortFactory {
  return async () => {
    const { content } = await input.resolveConfig();
    const provider = input.createProvider({
      timeoutMs: content.llm.timeoutMs,
      maxRetries: content.llm.maxRetries,
    });
    return createAutopsyVendor({
      provider,
      prices: content.llm.prices,
      overallDeadlineMs: content.llm.overallDeadlineMs,
      perStageOutputTokenCeiling: content.llm.maxOutputTokens,
    });
  };
}

export function productionAutopsyVendor(input: {
  db: Db;
  apiKey: string;
}): SystemVendorPortFactory {
  return attemptBoundAutopsyVendor({
    resolveConfig: () => activeSystemConfig(input.db),
    createProvider: (settings) => createAnthropicProvider({ apiKey: input.apiKey, ...settings }),
  });
}

/**
 * The cap a pre-dispatch check must compare against. The retained daily row's
 * cap is what reservations are actually admitted under (`reserved + x <= cap`
 * in `system-spend.ts`) and, once clamped, sits at or below config; a day
 * whose retained cap was clamped below config would otherwise dispatch up to
 * 32 candidates a minute that each write a durable `cap_exhausted` claim and
 * a `budget_exhausted` usage row — zero vendor calls, unbounded row growth
 * (slice 8 billing review, NOTE 2). Zero means "no row yet today".
 */
function effectiveDailyCapMicroUsd(
  active: ActiveConfig,
  operational: SystemWorkerOperationalState,
): number {
  const configured = active.content.systemAutopsy.dailyCapMicroUsd;
  return operational.budgetCapMicroUsd > 0
    ? Math.min(operational.budgetCapMicroUsd, configured)
    : configured;
}

export function buildProductionAutopsyCommand(input: {
  active: ActiveConfig;
  operational: SystemWorkerOperationalState;
  candidate: SystemAutopsyQueueCandidate;
  scheduledAt: Date;
  createAttemptId?: () => string;
}): AutopsyRunOnceCommand | null {
  const configuredDailyCapMicroUsd = input.active.content.systemAutopsy.dailyCapMicroUsd;
  if (configuredDailyCapMicroUsd === 0
    || input.operational.budgetSpentMicroUsd
      >= effectiveDailyCapMicroUsd(input.active, input.operational)) {
    return null;
  }
  const modelCode = input.active.content.llm.models.classification;
  const maxOutputTokens = input.active.content.llm.maxOutputTokens
    * SYSTEM_AUTOPSY_OUTPUT_STAGE_COUNT;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new Error("aggregate system autopsy output ceiling is invalid");
  }
  const maxCostMicroUsd = safeNumber(
    costMicroUsd(
      priceFor(input.active.content.llm.prices, modelCode),
      SYSTEM_AUTOPSY_INPUT_TOKEN_CODE_CEILING,
      maxOutputTokens,
    ),
    "system autopsy reservation",
  );
  const attemptId = (input.createAttemptId ?? randomUUID)();
  return {
    job: "autopsy",
    runId: attemptId,
    scheduledAt: input.scheduledAt.toISOString(),
    jobId: `autopsy:${input.candidate.cacheClaimId}`,
    itemId: input.candidate.itemId,
    attemptId,
    autopsyCacheClaimId: input.candidate.cacheClaimId,
    businessDate: input.scheduledAt.toISOString().slice(0, 10),
    modelCode,
    maxCostMicroUsd,
    maxInputTokens: SYSTEM_AUTOPSY_INPUT_TOKEN_CODE_CEILING,
    maxOutputTokens,
    configuredDailyCapMicroUsd,
  };
}

/**
 * One dispatch tick from ONE config/operational snapshot. Each planned command
 * adds its own reservation to the projected spend, so a nearly exhausted cap
 * admits only the candidates that can still fit rather than every candidate
 * against the same pre-reservation number; the rest stay candidates for the
 * next tick, which re-reads the state.
 */
export function buildProductionAutopsyCommands(input: {
  active: ActiveConfig;
  operational: SystemWorkerOperationalState;
  candidates: readonly SystemAutopsyQueueCandidate[];
  scheduledAt: Date;
  createAttemptId?: () => string;
}): AutopsyRunOnceCommand[] {
  const commands: AutopsyRunOnceCommand[] = [];
  let projectedSpendMicroUsd = input.operational.budgetSpentMicroUsd;
  for (const candidate of input.candidates) {
    const command = buildProductionAutopsyCommand({
      active: input.active,
      operational: { ...input.operational, budgetSpentMicroUsd: projectedSpendMicroUsd },
      candidate,
      scheduledAt: input.scheduledAt,
      ...(input.createAttemptId ? { createAttemptId: input.createAttemptId } : {}),
    });
    if (command === null) break;
    commands.push(command);
    projectedSpendMicroUsd += command.maxCostMicroUsd;
  }
  return commands;
}

export async function productionAutopsyCommands(input: {
  db: Db;
  workerName: string;
  candidates: readonly SystemAutopsyQueueCandidate[];
  scheduledAt: Date;
  createAttemptId?: () => string;
}): Promise<AutopsyRunOnceCommand[]> {
  // Read ONCE per tick, not once per candidate (up to 32 a minute through a
  // one-connection query pool).
  const [active, operational] = await Promise.all([
    activeSystemConfig(input.db),
    systemWorkerOperationalState(
      input.db,
      input.workerName,
      input.scheduledAt.toISOString().slice(0, 10),
    ),
  ]);
  return buildProductionAutopsyCommands({
    active,
    operational,
    candidates: input.candidates,
    scheduledAt: input.scheduledAt,
    ...(input.createAttemptId ? { createAttemptId: input.createAttemptId } : {}),
  });
}

export async function createProductionWorker(input: {
  databaseUrl: string;
  anthropicApiKey: string;
  queryPoolMax: number;
  runtime: Omit<PgBossRuntimeConfig, "connectionString">;
  events?: WorkerEventSink;
  /** `RESPIN_DELETION_ERASURE_SCOPES`; unset = no irreversible erasure. */
  erasureScopesEnv?: string;
  /**
   * The `RESPIN_DELETION_JOURNAL_*` block. Passed in rather than read from
   * `process.env` here so the composition is testable without mutating the
   * process, exactly as `erasureScopesEnv` already is. Empty = no journal, and
   * every append then refuses.
   */
  journalEnv?: Readonly<Record<string, string | undefined>>;
}): Promise<{ start(): Promise<void>; stop(): Promise<void> }> {
  if (!input.anthropicApiKey.trim()) {
    throw new Error("ANTHROPIC_API_KEY is required by the system autopsy worker");
  }
  // Refuse startup on a malformed scope list BEFORE any pool is opened.
  const erasureEnablement = resolveErasureEnablement({
    RESPIN_DELETION_ERASURE_SCOPES: input.erasureScopesEnv,
  });
  // Same rule for the journal: a partial configuration is refused here, before
  // a pool is opened, rather than surfacing as a refused append an hour into a
  // deletion's grace window.
  const deletionJournal = resolveDeletionJournal(input.journalEnv ?? {});
  const db = createSystemWorkerDb(input.databaseUrl, input.queryPoolMax);
  try {
    await activeSystemConfig(db);
    const deletionLifecycle = createDeletionLifecycleTick({
      db,
      env: process.env,
      workerName: input.runtime.workerName,
      migrations: loadMigrationInventory(),
      ports: {
        // Task 5: the R-124 S3 append-only store when the deployment configures
        // one, and the refusing journal when it does not. There is no third
        // option — no local file, no database table — because a journal inside
        // the thing it is meant to outlive proves nothing on restore.
        journal: deletionJournal,
        commands: createStripeExternalCommandPort(db),
        enablement: erasureEnablement,
      },
    });
    const handlers = createRunOnceHandlers({
      discovery: unavailableYouTubeDiscovery,
      digestInputs: {
        async load() {
          throw new Error("weekly digest delivery is deferred to Slice 10a");
        },
      },
      digestDelivery: unavailableDigestDelivery,
      systemUsage: createSystemAutopsyAttemptStore(db),
      autopsyVendor: productionAutopsyVendor({ db, apiKey: input.anthropicApiKey }),
    });
    const runtime = new RespinPgBossRuntime({
      config: { ...input.runtime, connectionString: input.databaseUrl },
      handlers,
      sources: {
        refreshNiches: () => systemRefreshNiches(db),
        async autopsyCandidates() {
          await recoverStaleSystemAutopsyAttempts(db);
          return systemAutopsyQueueCandidates(db);
        },
        autopsyCommands: (candidates, scheduledAt) => productionAutopsyCommands({
          db,
          workerName: input.runtime.workerName,
          candidates,
          scheduledAt,
        }),
        async operationalState(businessDate) {
          const [state, active] = await Promise.all([
            systemWorkerOperationalState(db, input.runtime.workerName, businessDate),
            activeSystemConfig(db),
          ]);
          return state.budgetCapMicroUsd === 0
            ? { ...state, budgetCapMicroUsd: active.content.systemAutopsy.dailyCapMicroUsd }
            : state;
        },
        persistHealth: (snapshot) => persistSystemWorkerHealth(
          db,
          input.runtime.workerName,
          snapshot,
        ).then(() => undefined),
        advanceDeletionLifecycle: deletionLifecycle,
        // Task 6: the retention receiver and the attempt-recovery boundaries.
        // The deadline is resolved ONCE per tick from the active config, before
        // any row moves, for the reason the autopsy dispatcher resolves its
        // vendor before the claim: a config change mid-sweep must not move the
        // boundary under half the attempts.
        runRetention: async (scheduledAt) => {
          const active = await activeSystemConfig(db);
          return runRetentionAndRecovery(
            { db, overallDeadlineMs: active.content.llm.overallDeadlineMs },
            scheduledAt,
          );
        },
      },
      events: input.events ?? consoleWorkerEventSink(),
    });
    let started = false;
    let closed = false;
    const closeDb = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await closeSystemWorkerDb(db);
    };
    return {
      async start() {
        try {
          await runtime.start();
          started = true;
        } catch (error) {
          try {
            await closeDb();
          } catch (closeError) {
            throw new AggregateError(
              [error, closeError],
              "production worker startup and database cleanup both failed",
            );
          }
          throw error;
        }
      },
      async stop() {
        try {
          if (started) {
            started = false;
            await runtime.stop();
          }
        } finally {
          await closeDb();
        }
      },
    };
  } catch (error) {
    await closeSystemWorkerDb(db);
    throw error;
  }
}
