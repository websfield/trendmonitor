import { describe, expect, it, vi } from "vitest";

import { createRunOnceHandlers } from "../handlers";
import { unavailableYouTubeDiscovery } from "../refresh";
import { unavailableDigestDelivery } from "../weekly-digest";
import type { SystemUsagePort, SystemVendorPort } from "../system-autopsy";

const usage: SystemUsagePort = {
  async startAttempt() {
    return {
      status: "budget_exhausted",
      dailySpentMicroUsd: 0,
      dailyCapMicroUsd: 0,
      reservedCostMicroUsd: 0,
    };
  },
  async finalizeAttempt() {
    return "recorded";
  },
};

describe("scheduler-neutral run-once composition", () => {
  it("routes external blockers honestly and makes no autopsy call at a zero cap", async () => {
    const analyseStage = vi.fn<SystemVendorPort["analyseStage"]>();
    const handlers = createRunOnceHandlers({
      discovery: unavailableYouTubeDiscovery,
      digestInputs: {
        async load(command) {
          return {
            digestId: command.digestId,
            weekStart: command.weekStart,
            nicheLabel: "Home cooking",
            items: [],
          };
        },
      },
      digestDelivery: unavailableDigestDelivery,
      systemUsage: usage,
      autopsyVendor: { analyseStage },
    });

    await expect(handlers.refresh({
      job: "refresh",
      runId: "refresh-1",
      scheduledAt: "2026-09-02T00:00:00.000Z",
      nicheId: "niche-1",
    })).resolves.toMatchObject({ status: "blocked_external_evidence" });
    await expect(handlers.digest({
      job: "weekly-digest",
      runId: "digest-run-1",
      scheduledAt: "2026-09-02T00:00:00.000Z",
      digestId: "digest-1",
      weekStart: "2026-08-31",
    })).resolves.toMatchObject({ status: "blocked_external_evidence" });
    await expect(handlers.autopsy({
      job: "autopsy",
      runId: "autopsy-run-1",
      scheduledAt: "2026-09-02T00:00:00.000Z",
      jobId: "job-1",
      itemId: "item-1",
      attemptId: "attempt-1",
      autopsyCacheClaimId: "cache-1",
      businessDate: "2026-09-02",
      modelCode: "classification-model",
      maxCostMicroUsd: 10,
      maxInputTokens: 100,
      maxOutputTokens: 100,
      configuredDailyCapMicroUsd: 0,
    })).resolves.toMatchObject({ status: "budget_exhausted" });
    expect(analyseStage).not.toHaveBeenCalled();
  });

  it("refuses digest data loaded for another durable command", async () => {
    const handlers = createRunOnceHandlers({
      discovery: unavailableYouTubeDiscovery,
      digestInputs: {
        async load() {
          return {
            digestId: "another-digest",
            weekStart: "2026-08-31",
            nicheLabel: "Home cooking",
            items: [],
          };
        },
      },
      digestDelivery: unavailableDigestDelivery,
      systemUsage: usage,
      autopsyVendor: { async analyseStage() { throw new Error("must not run"); } },
    });
    await expect(handlers.digest({
      job: "weekly-digest",
      runId: "digest-run-1",
      scheduledAt: "2026-09-02T00:00:00.000Z",
      digestId: "digest-1",
      weekStart: "2026-08-31",
    })).rejects.toThrow(/does not match/i);
  });
});
