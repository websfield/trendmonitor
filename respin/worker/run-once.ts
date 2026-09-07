import type { SystemAutopsyCommand } from "./system-autopsy";
import { strictCalendarDate } from "./calendar-date";

interface RunOnceCommon {
  readonly runId: string;
  readonly scheduledAt: string;
}

export interface RefreshRunOnceCommand extends RunOnceCommon {
  readonly job: "refresh";
  readonly nicheId: string;
}

export interface DigestRunOnceCommand extends RunOnceCommon {
  readonly job: "weekly-digest";
  readonly digestId: string;
  readonly weekStart: string;
}

export interface AutopsyRunOnceCommand extends RunOnceCommon, SystemAutopsyCommand {
  readonly job: "autopsy";
}

export type RunOnceCommand =
  | RefreshRunOnceCommand
  | DigestRunOnceCommand
  | AutopsyRunOnceCommand;

export type RunOnceStatus =
  | "completed"
  | "succeeded"
  | "already_finalized"
  | "failed"
  | "blocked_external_evidence"
  | "budget_exhausted"
  | "already_in_flight";

export interface RunOnceHandlerResult {
  readonly status: RunOnceStatus;
  readonly errorCode?: string;
}

export interface RunOnceHandlers {
  readonly refresh: (command: RefreshRunOnceCommand) => Promise<RunOnceHandlerResult>;
  readonly digest: (command: DigestRunOnceCommand) => Promise<RunOnceHandlerResult>;
  readonly autopsy: (command: AutopsyRunOnceCommand) => Promise<RunOnceHandlerResult>;
}

export interface RunOnceExecution {
  readonly exitCode: 0 | 1 | 2;
  readonly status: RunOnceStatus;
  readonly job: RunOnceCommand["job"];
}

const KNOWN_FLAGS = new Set([
  "--job",
  "--run-id",
  "--scheduled-at",
  "--niche-id",
  "--digest-id",
  "--week-start",
  "--job-id",
  "--item-id",
  "--attempt-id",
  "--autopsy-cache-claim-id",
  "--business-date",
  "--model-code",
  "--max-cost-micro-usd",
  "--max-input-tokens",
  "--max-output-tokens",
  "--configured-daily-cap-micro-usd",
]);

function parseFlags(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !flag.startsWith("--")) {
      throw new Error(`expected an explicit --argument at position ${index + 1}`);
    }
    if (!KNOWN_FLAGS.has(flag)) throw new Error(`unknown argument: ${flag}`);
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    if (flags.has(flag)) throw new Error(`${flag} may be supplied only once`);
    flags.set(flag, value);
  }
  return flags;
}

function required(flags: ReadonlyMap<string, string>, flag: string): string {
  const value = flags.get(flag)?.trim();
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function isoTimestamp(value: string, flag: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${flag} must be an ISO timestamp`);
  return value;
}

function isoDate(value: string, flag: string): string {
  return strictCalendarDate(value, flag);
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive safe integer`);
  return parsed;
}

function nonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative safe integer`);
  }
  return parsed;
}

function assertOnly(flags: ReadonlyMap<string, string>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const flag of flags.keys()) {
    if (!allowedSet.has(flag)) throw new Error(`argument ${flag} is not valid for this job`);
  }
}

export function parseRunOnceArgs(argv: readonly string[]): RunOnceCommand {
  const flags = parseFlags(argv);
  const job = required(flags, "--job");
  const runId = required(flags, "--run-id");
  const scheduledAt = isoTimestamp(required(flags, "--scheduled-at"), "--scheduled-at");

  if (job === "refresh") {
    assertOnly(flags, ["--job", "--run-id", "--scheduled-at", "--niche-id"]);
    return { job, runId, scheduledAt, nicheId: required(flags, "--niche-id") };
  }
  if (job === "weekly-digest") {
    assertOnly(flags, ["--job", "--run-id", "--scheduled-at", "--digest-id", "--week-start"]);
    return {
      job,
      runId,
      scheduledAt,
      digestId: required(flags, "--digest-id"),
      weekStart: isoDate(required(flags, "--week-start"), "--week-start"),
    };
  }
  if (job === "autopsy") {
    assertOnly(flags, [
      "--job",
      "--run-id",
      "--scheduled-at",
      "--job-id",
      "--item-id",
      "--attempt-id",
      "--autopsy-cache-claim-id",
      "--business-date",
      "--model-code",
      "--max-cost-micro-usd",
      "--max-input-tokens",
      "--max-output-tokens",
      "--configured-daily-cap-micro-usd",
    ]);
    return {
      job,
      runId,
      scheduledAt,
      jobId: required(flags, "--job-id"),
      itemId: required(flags, "--item-id"),
      attemptId: required(flags, "--attempt-id"),
      autopsyCacheClaimId: required(flags, "--autopsy-cache-claim-id"),
      businessDate: isoDate(required(flags, "--business-date"), "--business-date"),
      modelCode: required(flags, "--model-code"),
      maxCostMicroUsd: positiveInteger(
        required(flags, "--max-cost-micro-usd"),
        "--max-cost-micro-usd",
      ),
      maxInputTokens: positiveInteger(
        required(flags, "--max-input-tokens"),
        "--max-input-tokens",
      ),
      maxOutputTokens: positiveInteger(
        required(flags, "--max-output-tokens"),
        "--max-output-tokens",
      ),
      configuredDailyCapMicroUsd: nonNegativeInteger(
        required(flags, "--configured-daily-cap-micro-usd"),
        "--configured-daily-cap-micro-usd",
      ),
    };
  }
  throw new Error(`unsupported --job: ${job}`);
}

function exitCode(status: RunOnceStatus): 0 | 1 | 2 {
  switch (status) {
    case "completed":
    case "succeeded":
    case "already_finalized":
      return 0;
    case "failed":
      return 1;
    case "blocked_external_evidence":
    case "budget_exhausted":
    case "already_in_flight":
      return 2;
    default: {
      const unsupported: never = status;
      throw new Error(`unsupported run-once result status: ${String(unsupported)}`);
    }
  }
}

export async function executeRunOnce(
  argv: readonly string[],
  handlers: RunOnceHandlers,
): Promise<RunOnceExecution> {
  const command = parseRunOnceArgs(argv);
  const result =
    command.job === "refresh"
      ? await handlers.refresh(command)
      : command.job === "weekly-digest"
        ? await handlers.digest(command)
        : await handlers.autopsy(command);
  return { exitCode: exitCode(result.status), status: result.status, job: command.job };
}
