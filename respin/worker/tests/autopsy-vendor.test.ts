import { describe, expect, it, vi } from "vitest";
import type { LlmProvider } from "@respin/llm";
import { createAutopsyVendor } from "../autopsy-vendor";

const PRICES = {
  requested: { inputNanoUsdPerToken: 1_000, outputNanoUsdPerToken: 5_000 },
  served: { inputNanoUsdPerToken: 2_000, outputNanoUsdPerToken: 7_000 },
};

function provider(result: Awaited<ReturnType<LlmProvider["complete"]>>): LlmProvider {
  return { vendor: "test", complete: vi.fn(async () => result) };
}

const base = {
  jobId: "job-1",
  itemId: "item-1",
  attemptId: "attempt-1:hook_mechanic",
  stage: "hook_mechanic" as const,
  transcript: "An untrusted transcript",
  modelCode: "requested",
  maxInputTokens: 20_000,
  maxOutputTokens: 2_000,
  costCeilingMicroUsd: 20_000,
};

describe("production autopsy vendor adapter", () => {
  it("uses the served model price and returns parsed stage JSON with metering", async () => {
    const llm = provider({
      text: JSON.stringify({
        stage: "hook_mechanic",
        hookMechanic: "Open with a contradiction",
        subjectTerms: ["pricing"],
        hook: "The opening wording",
      }),
      servedModel: "served",
      usage: { tokensIn: 100, tokensOut: 20, raw: {} },
    });
    const vendor = createAutopsyVendor({
      provider: llm,
      prices: PRICES,
      overallDeadlineMs: 1_000,
      perStageOutputTokenCeiling: 500,
    });

    await expect(vendor.analyseStage(base)).resolves.toMatchObject({
      status: "succeeded",
      inputTokens: 100,
      outputTokens: 20,
      costMicroUsd: 340,
      analysis: { stage: "hook_mechanic" },
    });
    expect(llm.complete).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: base.attemptId,
      model: "requested",
      maxOutputTokens: 500,
    }));
  });

  it("refuses before calling when the prompt cannot fit the remaining input budget", async () => {
    const llm = provider({ text: "{}", servedModel: "requested", usage: { tokensIn: 1, tokensOut: 1, raw: {} } });
    const vendor = createAutopsyVendor({ provider: llm, prices: PRICES, overallDeadlineMs: 1_000, perStageOutputTokenCeiling: 500 });
    await expect(vendor.analyseStage({ ...base, maxInputTokens: 1 })).resolves.toEqual({
      status: "failed",
      errorCode: "vendor_input_token_limit",
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
    });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("records known spend when a successful response is not JSON", async () => {
    const llm = provider({
      text: "not-json",
      servedModel: "requested",
      usage: { tokensIn: 10, tokensOut: 5, raw: {} },
    });
    const vendor = createAutopsyVendor({ provider: llm, prices: PRICES, overallDeadlineMs: 1_000, perStageOutputTokenCeiling: 500 });
    await expect(vendor.analyseStage(base)).resolves.toMatchObject({
      status: "failed",
      errorCode: "vendor_response_invalid",
      inputTokens: 10,
      outputTokens: 5,
      costMicroUsd: 35,
    });
  });

  it("refuses a missing requested-model price before the paid call", async () => {
    const llm = provider({ text: "{}", servedModel: "requested", usage: { tokensIn: 1, tokensOut: 1, raw: {} } });
    const vendor = createAutopsyVendor({ provider: llm, prices: {}, overallDeadlineMs: 1_000, perStageOutputTokenCeiling: 500 });
    await expect(vendor.analyseStage(base)).resolves.toMatchObject({
      status: "failed",
      errorCode: "vendor_price_unavailable",
      costMicroUsd: 0,
    });
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
