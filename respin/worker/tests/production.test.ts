import { describe, expect, it, vi } from "vitest";
import type { ActiveConfig } from "@respin/config";
import type { LlmProvider } from "@respin/llm";
import { createRunOnceHandlers } from "../handlers";
import {
  attemptBoundAutopsyVendor,
  buildProductionAutopsyCommand,
  buildProductionAutopsyCommands,
} from "../production";
import { unavailableYouTubeDiscovery } from "../refresh";
import type { AutopsyRunOnceCommand } from "../run-once";
import type {
  AttemptClaim,
  SystemAttemptRecord,
  SystemUsagePort,
  SystemVendorPortFactory,
} from "../system-autopsy";
import { unavailableDigestDelivery } from "../weekly-digest";

const active = {
  version: 8,
  content: {
    systemAutopsy: { dailyCapMicroUsd: 1_000_000 },
    llm: {
      models: { classification: "classification" },
      prices: {
        classification: {
          inputNanoUsdPerToken: 1_000,
          outputNanoUsdPerToken: 5_000,
        },
      },
      maxOutputTokens: 1_000,
    },
  },
} as unknown as ActiveConfig;

const operational = {
  parkedJobs: 0,
  budgetSpentMicroUsd: 0,
  budgetCapMicroUsd: 1_000_000,
  lastSuccessfulScheduleAt: null,
  lastSuccessfulRunAt: null,
};

describe("production worker command construction", () => {
  it("derives an explicit system-budget command with no tenant identity", () => {
    const result = buildProductionAutopsyCommand({
      active,
      operational,
      candidate: { cacheClaimId: "claim-1", itemId: "item-1", attemptNumber: 1 },
      scheduledAt: new Date("2026-09-03T02:00:00.000Z"),
      createAttemptId: () => "attempt-1",
    });
    expect(result).toEqual({
      job: "autopsy",
      runId: "attempt-1",
      scheduledAt: "2026-09-03T02:00:00.000Z",
      jobId: "autopsy:claim-1",
      itemId: "item-1",
      attemptId: "attempt-1",
      autopsyCacheClaimId: "claim-1",
      businessDate: "2026-09-03",
      modelCode: "classification",
      maxCostMicroUsd: 120_000,
      maxInputTokens: 100_000,
      maxOutputTokens: 4_000,
      configuredDailyCapMicroUsd: 1_000_000,
    });
    expect(result).not.toHaveProperty("profileId");
    expect(result).not.toHaveProperty("workspaceId");
  });

  it("compares against the RETAINED daily cap when the day has a row, never only config", () => {
    // Config says $1; the day's retained row was clamped to 0.5 and is spent.
    expect(buildProductionAutopsyCommand({
      active,
      operational: { ...operational, budgetCapMicroUsd: 500_000, budgetSpentMicroUsd: 500_000 },
      candidate: { cacheClaimId: "claim-1", itemId: "item-1", attemptNumber: 1 },
      scheduledAt: new Date("2026-09-03T02:00:00.000Z"),
    })).toBeNull();
    expect(buildProductionAutopsyCommand({
      active,
      operational: { ...operational, budgetCapMicroUsd: 500_000, budgetSpentMicroUsd: 400_000 },
      candidate: { cacheClaimId: "claim-1", itemId: "item-1", attemptNumber: 1 },
      scheduledAt: new Date("2026-09-03T02:00:00.000Z"),
    })).not.toBeNull();
    // A retained cap ABOVE config (config lowered, not yet clamped) does not widen admission.
    expect(buildProductionAutopsyCommand({
      active: {
        ...active,
        content: { ...active.content, systemAutopsy: { dailyCapMicroUsd: 300_000 } },
      },
      operational: { ...operational, budgetCapMicroUsd: 1_000_000, budgetSpentMicroUsd: 300_000 },
      candidate: { cacheClaimId: "claim-1", itemId: "item-1", attemptNumber: 1 },
      scheduledAt: new Date("2026-09-03T02:00:00.000Z"),
    })).toBeNull();
  });

  it("plans a whole tick from one snapshot and stops once projected reservations reach the cap", () => {
    let n = 0;
    const commands = buildProductionAutopsyCommands({
      active,
      // Each command reserves 120,000; a 240,000 cap fits two, not three.
      operational: { ...operational, budgetCapMicroUsd: 240_000, budgetSpentMicroUsd: 0 },
      candidates: [1, 2, 3, 4].map((i) => ({ cacheClaimId: `claim-${i}`, itemId: `item-${i}`, attemptNumber: 1 })),
      scheduledAt: new Date("2026-09-03T02:00:00.000Z"),
      createAttemptId: () => `attempt-${++n}`,
    });
    expect(commands.map((command) => command.autopsyCacheClaimId)).toEqual(["claim-1", "claim-2"]);
    expect(commands.every((command) => command.maxCostMicroUsd === 120_000)).toBe(true);
  });

  it("enqueues nothing when the configured cap is exhausted or disabled", () => {
    expect(buildProductionAutopsyCommand({
      active,
      operational: { ...operational, budgetSpentMicroUsd: 1_000_000 },
      candidate: { cacheClaimId: "claim-1", itemId: "item-1", attemptNumber: 1 },
      scheduledAt: new Date("2026-09-03T02:00:00.000Z"),
    })).toBeNull();
    expect(buildProductionAutopsyCommand({
      active: {
        ...active,
        content: { ...active.content, systemAutopsy: { dailyCapMicroUsd: 0 } },
      },
      operational,
      candidate: { cacheClaimId: "claim-1", itemId: "item-1", attemptNumber: 1 },
      scheduledAt: new Date("2026-09-03T02:00:00.000Z"),
    })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Billing gate round 2, CHANGE 2: the vendor is bound to ONE config read per
// attempt, taken BEFORE the claim. The shape it replaces re-read config inside
// every stage, after `startAttempt` had reserved and leased — and a document
// refused in that window was recorded as a vendor call of unknown cost.
// ---------------------------------------------------------------------------

const BOUND_CONFIG = {
  version: 9,
  content: {
    systemAutopsy: { dailyCapMicroUsd: 1_000_000 },
    llm: {
      models: { classification: "classification" },
      prices: {
        classification: {
          inputNanoUsdPerToken: 1_000,
          outputNanoUsdPerToken: 5_000,
        },
      },
      maxOutputTokens: 1_000,
      timeoutMs: 60_000,
      overallDeadlineMs: 40_000,
      maxRetries: 2,
    },
  },
} as unknown as ActiveConfig;

const REFUSAL = "llm.overallDeadlineMs 135001 × 4 stages + 60000 ms margin outruns the 600000 ms claim lease; the ceiling is 135000 ms per stage";

const ATTEMPT_COMMAND: AutopsyRunOnceCommand = {
  job: "autopsy",
  runId: "attempt-1",
  scheduledAt: "2026-09-03T02:00:00.000Z",
  jobId: "autopsy:claim-1",
  itemId: "00000000-0000-7000-8000-000000000001",
  attemptId: "attempt-1",
  autopsyCacheClaimId: "claim-1",
  businessDate: "2026-09-03",
  modelCode: "classification",
  maxCostMicroUsd: 120_000,
  maxInputTokens: 100_000,
  maxOutputTokens: 4_000,
  configuredDailyCapMicroUsd: 1_000_000,
};

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

/** A provider that answers each stage from its stage-qualified attempt id. No network. */
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

class OrderedUsagePort implements SystemUsagePort {
  readonly order: string[] = [];
  readonly records = new Map<string, SystemAttemptRecord>();
  constructor(private readonly onStart: () => void = () => undefined) {}

  async startAttempt(): Promise<AttemptClaim> {
    this.order.push("startAttempt");
    this.onStart();
    return {
      status: "granted",
      dailySpentMicroUsd: 0,
      dailyCapMicroUsd: 1_000_000,
      reservedCostMicroUsd: ATTEMPT_COMMAND.maxCostMicroUsd,
      transcript: "A rights-backed transcript for the fixed-order analysis.",
      contentDigest: "fixture-digest",
      proposesSharedFramework: true,
    };
  }

  async finalizeAttempt(input: Parameters<SystemUsagePort["finalizeAttempt"]>[0]): Promise<"recorded" | "already_recorded"> {
    this.records.set(input.record.attemptId, input.record);
    return "recorded";
  }
}

function handlersWith(usage: SystemUsagePort, autopsyVendor: SystemVendorPortFactory) {
  return createRunOnceHandlers({
    discovery: unavailableYouTubeDiscovery,
    digestInputs: {
      async load() {
        throw new Error("not under test");
      },
    },
    digestDelivery: unavailableDigestDelivery,
    systemUsage: usage,
    autopsyVendor,
  });
}

describe("production vendor binding: one config read per attempt, before the claim", () => {
  it("a document refused AFTER the claim never reaches a stage: four measured calls, zero unknown, the bound prices", async () => {
    let refused = false;
    const order: string[] = [];
    const resolveConfig = vi.fn(async () => {
      order.push("resolve");
      if (refused) throw new Error(REFUSAL);
      return BOUND_CONFIG;
    });
    const provider = stageProvider();
    const createProvider = vi.fn(() => provider);
    // The operator's refusing document lands the instant the claim is placed —
    // the exact window the per-stage read used to fall into.
    const usage = new OrderedUsagePort(() => {
      order.push("startAttempt");
      refused = true;
    });
    const handlers = handlersWith(
      usage,
      attemptBoundAutopsyVendor({ resolveConfig, createProvider }),
    );

    await expect(handlers.autopsy(ATTEMPT_COMMAND)).resolves.toMatchObject({ status: "succeeded" });

    expect(order).toEqual(["resolve", "startAttempt"]);
    expect(resolveConfig).toHaveBeenCalledTimes(1);
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(createProvider).toHaveBeenCalledWith({ timeoutMs: 60_000, maxRetries: 2 });
    expect(provider.stages).toEqual(["hook_mechanic", "beats", "ending", "follow_trigger"]);
    // 4 × (30 in × 1,000 nano + 10 out × 5,000 nano) = 320 micro-USD, measured.
    expect(usage.records.get("attempt-1")).toMatchObject({
      outcome: "succeeded",
      callCount: 4,
      unknownCallCount: 0,
      costState: "measured",
      costMicroUsd: 320,
      reservedCostMicroUsd: 120_000,
    });
    expect(usage.records.get("attempt-1")).not.toHaveProperty("errorCode");
  });

  it("a document refused BEFORE the claim reserves nothing, calls nothing and records nothing", async () => {
    const resolveConfig = vi.fn(async () => {
      throw new Error(REFUSAL);
    });
    const provider = stageProvider();
    const createProvider = vi.fn(() => provider);
    const usage = new OrderedUsagePort();
    const handlers = handlersWith(
      usage,
      attemptBoundAutopsyVendor({ resolveConfig, createProvider }),
    );

    await expect(handlers.autopsy(ATTEMPT_COMMAND)).rejects.toThrow(/outruns the .* claim lease/);

    expect(usage.order).toEqual([]);
    expect(usage.records.size).toBe(0);
    expect(createProvider).not.toHaveBeenCalled();
    expect(provider.stages).toEqual([]);
  });
});
