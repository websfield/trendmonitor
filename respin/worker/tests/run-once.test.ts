import { describe, expect, it, vi } from "vitest";

import { executeRunOnce, parseRunOnceArgs } from "../run-once";

describe("idempotent run-once CLI contract", () => {
  it("requires an explicit job and all job-specific arguments", () => {
    expect(() => parseRunOnceArgs([])).toThrow(/--job/i);
    expect(() =>
      parseRunOnceArgs([
        "--job", "refresh",
        "--run-id", "refresh-1",
        "--scheduled-at", "2026-09-02T00:00:00.000Z",
      ]),
    ).toThrow(/--niche-id/i);
  });

  it("parses refresh, digest and autopsy commands without environment defaults", () => {
    expect(
      parseRunOnceArgs([
        "--job", "refresh",
        "--run-id", "refresh-1",
        "--scheduled-at", "2026-09-02T00:00:00.000Z",
        "--niche-id", "niche-1",
      ]),
    ).toMatchObject({ job: "refresh", nicheId: "niche-1" });
    expect(
      parseRunOnceArgs([
        "--job", "weekly-digest",
        "--run-id", "digest-run-1",
        "--scheduled-at", "2026-09-02T00:00:00.000Z",
        "--digest-id", "digest-1",
        "--week-start", "2026-08-31",
      ]),
    ).toMatchObject({ job: "weekly-digest", digestId: "digest-1" });
    expect(
      parseRunOnceArgs([
        "--job", "autopsy",
        "--run-id", "autopsy-run-1",
        "--scheduled-at", "2026-09-02T00:00:00.000Z",
        "--job-id", "job-1",
        "--item-id", "item-1",
        "--attempt-id", "attempt-1",
        "--autopsy-cache-claim-id", "cache-claim-1",
        "--business-date", "2026-09-02",
        "--model-code", "classification-model",
        "--max-cost-micro-usd", "5000",
        "--max-input-tokens", "2000",
        "--max-output-tokens", "500",
        "--configured-daily-cap-micro-usd", "50000",
      ]),
    ).toMatchObject({
      job: "autopsy",
      attemptId: "attempt-1",
      maxCostMicroUsd: 5_000,
      maxInputTokens: 2_000,
      maxOutputTokens: 500,
      autopsyCacheClaimId: "cache-claim-1",
    });
  });

  it("rejects unknown arguments instead of silently ignoring scheduler drift", () => {
    expect(() =>
      parseRunOnceArgs([
        "--job", "refresh",
        "--run-id", "refresh-1",
        "--scheduled-at", "2026-09-02T00:00:00.000Z",
        "--niche-id", "niche-1",
        "--surprise", "value",
      ]),
    ).toThrow(/unknown argument/i);
  });

  it("accepts an explicit zero daily cap as the emergency-disable setting", () => {
    const command = parseRunOnceArgs([
      "--job", "autopsy",
      "--run-id", "autopsy-run-1",
      "--scheduled-at", "2026-09-02T00:00:00.000Z",
      "--job-id", "job-1",
      "--item-id", "item-1",
      "--attempt-id", "attempt-1",
      "--autopsy-cache-claim-id", "cache-claim-1",
      "--business-date", "2026-09-02",
      "--model-code", "classification-model",
      "--max-cost-micro-usd", "5000",
      "--max-input-tokens", "2000",
      "--max-output-tokens", "500",
      "--configured-daily-cap-micro-usd", "0",
    ]);
    expect(command).toMatchObject({
      job: "autopsy",
      configuredDailyCapMicroUsd: 0,
    });
  });

  it("refuses unsafe integer ceilings before dispatch", () => {
    const base = [
      "--job", "autopsy",
      "--run-id", "autopsy-run-1",
      "--scheduled-at", "2026-09-02T00:00:00.000Z",
      "--job-id", "job-1",
      "--item-id", "item-1",
      "--attempt-id", "attempt-1",
      "--autopsy-cache-claim-id", "cache-claim-1",
      "--business-date", "2026-09-02",
      "--model-code", "classification-model",
      "--max-cost-micro-usd", "5000",
      "--max-input-tokens", "2000",
      "--max-output-tokens", "500",
      "--configured-daily-cap-micro-usd", "50000",
    ];
    const unsafeInteger = String(Number.MAX_SAFE_INTEGER + 1);
    for (const flag of [
      "--max-cost-micro-usd",
      "--max-input-tokens",
      "--max-output-tokens",
      "--configured-daily-cap-micro-usd",
    ]) {
      const args = [...base];
      args[args.indexOf(flag) + 1] = unsafeInteger;
      expect(() => parseRunOnceArgs(args)).toThrow(/safe integer/i);
    }
  });

  it("round-trips calendar dates and refuses impossible leap/day values", () => {
    const base = [
      "--job", "weekly-digest",
      "--run-id", "digest-run-1",
      "--scheduled-at", "2026-09-02T00:00:00.000Z",
      "--digest-id", "digest-1",
      "--week-start",
    ];
    expect(parseRunOnceArgs([...base, "2024-02-29"])).toMatchObject({
      weekStart: "2024-02-29",
    });
    for (const impossible of ["2026-99-99", "2025-02-29", "2026-04-31"]) {
      expect(() => parseRunOnceArgs([...base, impossible])).toThrow(/calendar date/i);
    }
  });

  it("dispatches exactly once to the selected injected handler", async () => {
    const refresh = vi.fn(async () => ({ status: "completed" as const }));
    const digest = vi.fn(async () => ({ status: "completed" as const }));
    const autopsy = vi.fn(async () => ({ status: "succeeded" as const }));
    const result = await executeRunOnce(
      [
        "--job", "refresh",
        "--run-id", "refresh-1",
        "--scheduled-at", "2026-09-02T00:00:00.000Z",
        "--niche-id", "niche-1",
      ],
      { refresh, digest, autopsy },
    );
    expect(result).toEqual({ exitCode: 0, status: "completed", job: "refresh" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(digest).not.toHaveBeenCalled();
    expect(autopsy).not.toHaveBeenCalled();
  });

  it("fails closed when an untyped adapter returns an unsupported status", async () => {
    const refresh = vi.fn(async () => ({ status: "invented_success" })) as never;
    await expect(executeRunOnce(
      [
        "--job", "refresh",
        "--run-id", "refresh-1",
        "--scheduled-at", "2026-09-02T00:00:00.000Z",
        "--niche-id", "niche-1",
      ],
      {
        refresh,
        digest: vi.fn(async () => ({ status: "completed" as const })),
        autopsy: vi.fn(async () => ({ status: "succeeded" as const })),
      },
    )).rejects.toThrow(/unsupported run-once result status/i);
  });
});
