import { describe, expect, it } from "vitest";
import type { AutopsyStage, AutopsyStageResult } from "@respin/trends";
import { FRAMEWORK_NAME_MAX } from "@respin/db";

import {
  SYSTEM_DAILY_BUDGET_CODE_CEILING_MICRO_USD,
  resolveSystemDailyBudgetCap,
  runSystemAutopsyAttempt,
  type AttemptClaim,
  type SystemAttemptRecord,
  type SystemUsagePort,
  type SystemVendorPort,
} from "../system-autopsy";

const COMMAND = {
  jobId: "job-1",
  itemId: "00000000-0000-7000-8000-000000000001",
  attemptId: "attempt-1",
  autopsyCacheClaimId: "cache-claim-1",
  businessDate: "2026-09-02",
  modelCode: "classification-model",
  maxCostMicroUsd: 5_000,
  maxInputTokens: 2_000,
  maxOutputTokens: 500,
  configuredDailyCapMicroUsd: 50_000,
} as const;

const ANALYSIS = {
  hookMechanic: "open on a visible tradeoff",
  beats: ["show the setup", "turn on the constraint"],
  ending: "return to the opening tradeoff",
  followTrigger: "name the next mechanism to test",
  subjectTerms: ["batch cooking", "weeknight meals"],
  hook: "The pan I stopped using on weeknights",
  structure: { beatCount: 2, turnBeat: 1 },
} as const;

class MemoryUsagePort implements SystemUsagePort {
  readonly records = new Map<string, SystemAttemptRecord>();
  readonly analyses = new Map<string, unknown>();
  readonly inFlight = new Set<string>();
  claim: AttemptClaim = {
    status: "granted",
    dailySpentMicroUsd: 0,
    dailyCapMicroUsd: 50_000,
    reservedCostMicroUsd: COMMAND.maxCostMicroUsd,
    transcript: "A rights-backed transcript for the fixed-order analysis.",
    contentDigest: "fixture-digest",
    // A SHARED claim by default: the pre-R-99 population, so every case that
    // does not say otherwise still drives the shared-library preflight.
    proposesSharedFramework: true,
  };
  finalizeCalls = 0;

  async startAttempt(input: { attemptId: string }): Promise<AttemptClaim> {
    const recorded = this.records.get(input.attemptId);
    if (recorded) return { status: "already_finalized", record: recorded };
    if (this.inFlight.has(input.attemptId)) return { status: "already_in_flight" };
    if (this.claim.status === "granted") this.inFlight.add(input.attemptId);
    return this.claim;
  }

  async finalizeAttempt(input: Parameters<SystemUsagePort["finalizeAttempt"]>[0]): Promise<"recorded" | "already_recorded"> {
    this.finalizeCalls += 1;
    const record = input.record;
    if (this.records.has(record.attemptId)) return "already_recorded";
    this.records.set(record.attemptId, record);
    if (input.autopsy) {
      this.analyses.set(input.autopsy.cacheClaimId, input.autopsy.analysis);
    }
    this.inFlight.delete(record.attemptId);
    return "recorded";
  }
}

function stageAnalysis(stage: AutopsyStage): AutopsyStageResult {
  switch (stage) {
    case "hook_mechanic":
      return {
        stage,
        hookMechanic: ANALYSIS.hookMechanic,
        subjectTerms: ANALYSIS.subjectTerms,
        hook: ANALYSIS.hook,
      };
    case "beats":
      return {
        stage,
        beats: ANALYSIS.beats,
        beatCount: ANALYSIS.structure.beatCount,
        turnBeat: ANALYSIS.structure.turnBeat,
      };
    case "ending":
      return { stage, ending: ANALYSIS.ending };
    case "follow_trigger":
      return { stage, followTrigger: ANALYSIS.followTrigger };
  }
}

function successfulVendor(): SystemVendorPort & { calls: number; stages: AutopsyStage[] } {
  const port = {
    calls: 0,
    stages: [] as AutopsyStage[],
    async analyseStage(input: Parameters<SystemVendorPort["analyseStage"]>[0]) {
      port.calls += 1;
      port.stages.push(input.stage);
      return {
        status: "succeeded" as const,
        inputTokens: 30,
        outputTokens: 10,
        costMicroUsd: 225,
        analysis: stageAnalysis(input.stage),
      };
    },
  };
  return port;
}

describe("sessionless system autopsy", () => {
  it.each(["2026-99-99", "2025-02-29", "2026-04-31"])(
    "refuses impossible business date %s before a budget claim",
    async (invalidDate) => {
      const usage = new MemoryUsagePort();
      const vendor = successfulVendor();
      await expect(
        runSystemAutopsyAttempt({
          command: { ...COMMAND, businessDate: invalidDate },
          usage,
          vendor,
        }),
      ).rejects.toThrow(/calendar date/i);
      expect(vendor.calls).toBe(0);
      expect(usage.inFlight).toHaveLength(0);
    },
  );

  it("lets config tighten the system cap but never exceed the code ceiling", () => {
    expect(resolveSystemDailyBudgetCap(25_000)).toBe(25_000);
    expect(
      resolveSystemDailyBudgetCap(SYSTEM_DAILY_BUDGET_CODE_CEILING_MICRO_USD + 1),
    ).toBe(SYSTEM_DAILY_BUDGET_CODE_CEILING_MICRO_USD);
    expect(() => resolveSystemDailyBudgetCap(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
  });

  it("refuses unsafe numeric command bounds before the budget or vendor boundary", async () => {
    const usage = new MemoryUsagePort();
    const vendor = successfulVendor();
    await expect(runSystemAutopsyAttempt({
      command: { ...COMMAND, maxCostMicroUsd: Number.MAX_SAFE_INTEGER + 1 },
      usage,
      vendor,
    })).rejects.toThrow(/positive safe integer/i);
    expect(vendor.calls).toBe(0);
    expect(usage.inFlight).toHaveLength(0);
  });

  it("makes zero vendor calls when the atomic system budget claim is exhausted", async () => {
    const usage = new MemoryUsagePort();
    usage.claim = {
      status: "budget_exhausted",
      dailySpentMicroUsd: 50_000,
      dailyCapMicroUsd: 50_000,
      reservedCostMicroUsd: 0,
    };
    const vendor = successfulVendor();

    const result = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });
    const replay = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });

    expect(result.status).toBe("budget_exhausted");
    expect(replay.status).toBe("already_finalized");
    expect(vendor.calls).toBe(0);
    expect(usage.finalizeCalls).toBe(1);
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "budget_exhausted",
      callCount: 0,
      unknownCallCount: 0,
      costMicroUsd: 0,
      reservedCostMicroUsd: 0,
    });
  });

  it("treats a zero configured cap as an emergency disable with zero vendor calls", async () => {
    const usage = new MemoryUsagePort();
    usage.claim = {
      status: "budget_exhausted",
      dailySpentMicroUsd: 0,
      dailyCapMicroUsd: 0,
      reservedCostMicroUsd: 0,
    };
    const vendor = successfulVendor();

    const result = await runSystemAutopsyAttempt({
      command: { ...COMMAND, configuredDailyCapMicroUsd: 0 },
      usage,
      vendor,
    });

    expect(result.status).toBe("budget_exhausted");
    expect(vendor.calls).toBe(0);
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "budget_exhausted",
      callCount: 0,
      costMicroUsd: 0,
    });
  });

  it("does not call or record twice when the same attempt is repeated", async () => {
    const usage = new MemoryUsagePort();
    const vendor = successfulVendor();

    const first = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });
    const second = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("already_finalized");
    expect(vendor.calls).toBe(4);
    expect(vendor.stages).toEqual(["hook_mechanic", "beats", "ending", "follow_trigger"]);
    expect(usage.finalizeCalls).toBe(1);
    expect(usage.records).toHaveLength(1);
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "succeeded",
      inputTokens: 120,
      outputTokens: 40,
      costMicroUsd: 900,
      callCount: 4,
      unknownCallCount: 0,
    });
    expect(usage.analyses.get(COMMAND.autopsyCacheClaimId)).toEqual(ANALYSIS);
  });

  it("fails closed on a repeated in-flight attempt instead of making a second paid call", async () => {
    const usage = new MemoryUsagePort();
    usage.inFlight.add(COMMAND.attemptId);
    const vendor = successfulVendor();

    await expect(runSystemAutopsyAttempt({ command: COMMAND, usage, vendor })).resolves.toEqual({
      status: "already_in_flight",
      attemptId: COMMAND.attemptId,
    });
    expect(vendor.calls).toBe(0);
    expect(usage.finalizeCalls).toBe(0);
  });

  it("records an unknown-cost call honestly when the vendor throws", async () => {
    const usage = new MemoryUsagePort();
    const vendor: SystemVendorPort = {
      async analyseStage() {
        throw new Error("planted prompt and transcript must never escape");
      },
    };

    const result = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });

    expect(result.status).toBe("failed");
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "vendor_failed",
      errorCode: "vendor_unhandled_error",
      callCount: 1,
      unknownCallCount: 1,
      costMicroUsd: null,
    });
    expect(JSON.stringify(usage.records.get(COMMAND.attemptId))).not.toContain("planted");
  });

  it("replaces a vendor-supplied prose error with a fixed content-safe code", async () => {
    const usage = new MemoryUsagePort();
    const vendor: SystemVendorPort = {
      async analyseStage() {
        return {
          status: "failed",
          errorCode: "the planted transcript must not become an operational code",
          inputTokens: 10,
          outputTokens: 2,
          costMicroUsd: 50,
        };
      },
    };

    await expect(runSystemAutopsyAttempt({ command: COMMAND, usage, vendor })).resolves.toEqual({
      status: "failed",
      attemptId: COMMAND.attemptId,
      errorCode: "vendor_response_invalid",
    });
    const stored = usage.records.get(COMMAND.attemptId);
    expect(stored).toMatchObject({ errorCode: "vendor_response_invalid", callCount: 1 });
    expect(JSON.stringify(stored)).not.toContain("planted");
  });

  it("stops after a successful response with unknown usage instead of spending an unbounded next stage", async () => {
    const usage = new MemoryUsagePort();
    let calls = 0;
    const vendor: SystemVendorPort = {
      async analyseStage(input) {
        calls += 1;
        return {
          status: "succeeded",
          inputTokens: 30,
          outputTokens: 10,
          costMicroUsd: null as never,
          analysis: stageAnalysis(input.stage),
        };
      },
    };

    await expect(runSystemAutopsyAttempt({ command: COMMAND, usage, vendor })).resolves.toEqual({
      status: "failed",
      attemptId: COMMAND.attemptId,
      errorCode: "vendor_usage_unknown",
    });
    expect(calls).toBe(1);
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "vendor_failed",
      callCount: 1,
      unknownCallCount: 1,
      costMicroUsd: null,
    });
  });

  it("durably records and fails a vendor response above its hard reservation", async () => {
    const usage = new MemoryUsagePort();
    const seen: Array<Record<string, unknown>> = [];
    const vendor: SystemVendorPort = {
      async analyseStage(input) {
        seen.push(input);
        return {
          status: "succeeded",
          inputTokens: 1_500,
          outputTokens: 400,
          costMicroUsd: COMMAND.maxCostMicroUsd + 1,
          analysis: stageAnalysis(input.stage),
        };
      },
    };

    const result = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });

    expect(seen).toEqual([
      expect.objectContaining({
        maxInputTokens: COMMAND.maxInputTokens,
        maxOutputTokens: COMMAND.maxOutputTokens,
        costCeilingMicroUsd: COMMAND.maxCostMicroUsd,
      }),
    ]);
    expect(result).toEqual({
      status: "failed",
      attemptId: COMMAND.attemptId,
      errorCode: "vendor_cost_over_reservation",
    });
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "reservation_overrun",
      costMicroUsd: COMMAND.maxCostMicroUsd + 1,
      reservedCostMicroUsd: COMMAND.maxCostMicroUsd,
      reservationOverrunMicroUsd: 1,
      callCount: 1,
      unknownCallCount: 0,
    });
    expect(usage.finalizeCalls).toBe(1);
  });

  it("records failure and cannot complete without a valid canonical analysis", async () => {
    const usage = new MemoryUsagePort();
    const vendor: SystemVendorPort = {
      async analyseStage() {
        return {
          status: "succeeded",
          inputTokens: 100,
          outputTokens: 50,
          costMicroUsd: 800,
          analysis: {
            hookMechanic: "missing most required stages",
            subjectTerms: ["one term"],
          },
        };
      },
    };

    const result = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });

    expect(result).toEqual({
      status: "failed",
      attemptId: COMMAND.attemptId,
      errorCode: "autopsy_analysis_invalid",
    });
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "analysis_invalid",
      costMicroUsd: 800,
      callCount: 1,
    });
    expect(usage.analyses).toHaveLength(0);
    expect(JSON.stringify(usage.records.get(COMMAND.attemptId))).not.toContain(
      "missing most required stages",
    );
  });

  it("records a paid canonical analysis that fails the DB mechanism boundary as invalid", async () => {
    const usage = new MemoryUsagePort();
    const vendor = successfulVendor();
    const original = vendor.analyseStage.bind(vendor);
    vendor.analyseStage = async (input) => {
      const result = await original(input);
      if (result.status === "succeeded" && input.stage === "hook_mechanic") {
        return {
          ...result,
          analysis: {
            ...stageAnalysis("hook_mechanic"),
            hookMechanic: "It reached 40,000 views for @alice",
          },
        };
      }
      return result;
    };

    const result = await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor });

    expect(result).toEqual({
      status: "failed",
      attemptId: COMMAND.attemptId,
      errorCode: "framework_candidate_invalid",
    });
    expect(usage.records.get(COMMAND.attemptId)).toMatchObject({
      outcome: "analysis_invalid",
      callCount: 4,
      costMicroUsd: 900,
      errorCode: "framework_candidate_invalid",
    });
    expect(usage.analyses).toHaveLength(0);
  });

  // ------------------------------------------------------------------ R-99
  // CHANGE B: the preflight's two halves. `proposesSharedFramework` is the ONLY
  // difference between the ports in each pair below, and each pair runs the
  // SAME vendor — so every difference in outcome is that boolean and nothing
  // else.
  const privatePort = (): MemoryUsagePort => {
    const usage = new MemoryUsagePort();
    if (usage.claim.status !== "granted") throw new Error("fixture claim is not granted");
    usage.claim = { ...usage.claim, proposesSharedFramework: false };
    return usage;
  };

  /** The same successful vendor with one stage field replaced. */
  const vendorWithHookMechanic = (hookMechanic: string) => {
    const vendor = successfulVendor();
    const original = vendor.analyseStage.bind(vendor);
    vendor.analyseStage = async (input) => {
      const result = await original(input);
      if (result.status === "succeeded" && input.stage === "hook_mechanic") {
        return { ...result, analysis: { ...stageAnalysis("hook_mechanic"), hookMechanic } };
      }
      return result;
    };
    return vendor;
  };

  // Content-clean (no handle, no link, no number, no performance noun) and over
  // the shared library's NAME limit — derived from the limit, not a magic
  // string, so it stays over the line if the limit moves.
  const LONG_MECHANIC =
    `open on a visible tradeoff and keep naming the constraint out loud ${"again and ".repeat(20)}before the turn`;

  it("R-99/CHANGE B: a PRIVATE claim COMPLETES on an analysis only the shared library's own bounds would refuse — same analysis, same vendor, and the SHARED claim still refuses it", async () => {
    expect([...LONG_MECHANIC].length).toBeGreaterThan(FRAMEWORK_NAME_MAX);

    const priv = privatePort();
    const privateResult = await runSystemAutopsyAttempt({
      command: COMMAND, usage: priv, vendor: vendorWithHookMechanic(LONG_MECHANIC),
    });
    expect(privateResult).toEqual({ status: "succeeded", attemptId: COMMAND.attemptId });
    expect(priv.records.get(COMMAND.attemptId)).toMatchObject({ outcome: "succeeded", callCount: 4 });
    // The analysis reached the finalize transaction, which is the whole point:
    // the creator's paste is autopsyable again.
    expect(priv.analyses.size).toBe(1);

    // THE CONTROL, and it is the same 150-character mechanic: a SHARED claim is
    // unchanged — it still cannot become a library row with an over-long name.
    const shared = new MemoryUsagePort();
    const sharedResult = await runSystemAutopsyAttempt({
      command: COMMAND, usage: shared, vendor: vendorWithHookMechanic(LONG_MECHANIC),
    });
    expect(sharedResult).toEqual({
      status: "failed", attemptId: COMMAND.attemptId, errorCode: "framework_candidate_invalid",
    });
    expect(shared.analyses.size).toBe(0);
  });

  it.each([
    ["a personal detail", "the mechanic @alice uses at https://example.test/x"],
    ["a performance number", "the mechanic that reached 40,000 views"],
    ["a metric with a unit", "promise the 10x version before the constraint lands"],
  ])(
    "R-99/CHANGE B: a PRIVATE claim carrying %s STILL FAILS — the CONTENT scan is not what was dropped",
    async (_label, hookMechanic) => {
      const priv = privatePort();
      const result = await runSystemAutopsyAttempt({
        command: COMMAND, usage: priv, vendor: vendorWithHookMechanic(hookMechanic),
      });

      // The reason is the honest one: a private analysis never was a
      // shared-library candidate, so it does not fail as one.
      expect(result).toEqual({
        status: "failed", attemptId: COMMAND.attemptId, errorCode: "analysis_not_mechanism_level",
      });
      expect(priv.records.get(COMMAND.attemptId)).toMatchObject({
        outcome: "analysis_invalid", errorCode: "analysis_not_mechanism_level",
      });
      // NOTHING IS PERSISTED, which is the property `packages/modes`'
      // `assemble.ts` depends on: this text never reaches a generation prompt.
      expect(priv.analyses.size).toBe(0);
      // ...and the failing text is not copied into the content-free usage row.
      expect(JSON.stringify(priv.records.get(COMMAND.attemptId))).not.toContain(hookMechanic);

      // THE SHARED CONTROL: the same content still fails on the shared branch,
      // under the candidacy reason.
      const shared = new MemoryUsagePort();
      await expect(runSystemAutopsyAttempt({
        command: COMMAND, usage: shared, vendor: vendorWithHookMechanic(hookMechanic),
      })).resolves.toEqual({
        status: "failed", attemptId: COMMAND.attemptId, errorCode: "framework_candidate_invalid",
      });
    },
  );

  it("R-99/CHANGE B: a PRIVATE claim with an ordinary mechanism-level analysis completes, exactly as a shared one does", async () => {
    const priv = privatePort();
    await expect(runSystemAutopsyAttempt({ command: COMMAND, usage: priv, vendor: successfulVendor() }))
      .resolves.toEqual({ status: "succeeded", attemptId: COMMAND.attemptId });
    expect(priv.analyses.size).toBe(1);
  });

  it("contains no tenant identity fields in the persistence record", async () => {
    const usage = new MemoryUsagePort();
    await runSystemAutopsyAttempt({ command: COMMAND, usage, vendor: successfulVendor() });
    const serialized = JSON.stringify(usage.records.get(COMMAND.attemptId));
    expect(serialized).not.toMatch(/creator|workspace|profile/i);
  });
});
