import { AUTOPSY_ATTEMPT_CODE_CEILING } from "@respin/db";

// The DB cache lifecycle and scheduler policy share one ceiling. A scheduler
// retry can therefore never outlive the cache authority it is trying to fill.
export const RETRY_ATTEMPT_CODE_CEILING = AUTOPSY_ATTEMPT_CODE_CEILING;

export interface RetryPolicy {
  readonly maxAttempts: number;
}

export interface AttemptSummary {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly status: "succeeded" | "failed";
  readonly failureCode?: string;
}

interface RetryStateBase {
  readonly jobId: string;
  readonly policy: RetryPolicy;
  readonly attempts: readonly AttemptSummary[];
}

export interface ReadyRetryState extends RetryStateBase {
  readonly status: "ready";
}

export interface RunningRetryState extends RetryStateBase {
  readonly status: "running";
  readonly attemptId: string;
  readonly attemptNumber: number;
}

export interface SucceededRetryState extends RetryStateBase {
  readonly status: "succeeded";
}

export interface ParkedRetryState extends RetryStateBase {
  readonly status: "parked";
  readonly failureCode: string;
  readonly parkingReason: "permanent_failure" | "retry_bound_exhausted";
}

export type RetryState =
  | ReadyRetryState
  | RunningRetryState
  | SucceededRetryState
  | ParkedRetryState;

export type AttemptResult =
  | { readonly status: "succeeded" }
  | {
      readonly status: "failed";
      readonly failureCode: string;
      readonly retryable: boolean;
    };

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

const SAFE_OPERATIONAL_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function resolveRetryPolicy(input: {
  readonly configuredMaxAttempts?: number;
}): RetryPolicy {
  const configured = positiveInteger(
    input.configuredMaxAttempts ?? RETRY_ATTEMPT_CODE_CEILING,
    "configuredMaxAttempts",
  );
  return { maxAttempts: Math.min(configured, RETRY_ATTEMPT_CODE_CEILING) };
}

export function initialRetryState(jobId: string, policy: RetryPolicy): RetryState {
  if (jobId.trim().length === 0) throw new Error("jobId is required");
  positiveInteger(policy.maxAttempts, "maxAttempts");
  if (policy.maxAttempts > RETRY_ATTEMPT_CODE_CEILING) {
    throw new Error("maxAttempts exceeds the code ceiling");
  }
  return { status: "ready", jobId, policy, attempts: [] };
}

export function beginAttempt(
  state: RetryState,
  createAttemptId: (input: { jobId: string; attemptNumber: number }) => string,
): RunningRetryState {
  if (state.status !== "ready") {
    throw new Error(`cannot begin an attempt while retry state is ${state.status}`);
  }
  const attemptNumber = state.attempts.length + 1;
  if (attemptNumber > state.policy.maxAttempts) {
    throw new Error("retry policy is exhausted");
  }
  const attemptId = createAttemptId({ jobId: state.jobId, attemptNumber }).trim();
  if (attemptId.length === 0) throw new Error("attempt id is required");
  if (state.attempts.some((attempt) => attempt.attemptId === attemptId)) {
    throw new Error("each paid call requires a distinct attempt id");
  }
  return { ...state, status: "running", attemptId, attemptNumber };
}

export function finishAttempt(
  state: RunningRetryState,
  result: AttemptResult,
): RetryState {
  if (result.status === "failed" && !SAFE_OPERATIONAL_CODE.test(result.failureCode)) {
    throw new Error("failureCode must be a bounded content-safe token");
  }
  const summary: AttemptSummary =
    result.status === "succeeded"
      ? {
          attemptId: state.attemptId,
          attemptNumber: state.attemptNumber,
          status: "succeeded",
        }
      : {
          attemptId: state.attemptId,
          attemptNumber: state.attemptNumber,
          status: "failed",
          failureCode: result.failureCode,
        };
  const attempts = [...state.attempts, summary];
  const base = { jobId: state.jobId, policy: state.policy, attempts };

  if (result.status === "succeeded") return { ...base, status: "succeeded" };
  if (!result.retryable || attempts.length >= state.policy.maxAttempts) {
    return {
      ...base,
      status: "parked",
      failureCode: result.failureCode,
      parkingReason: result.retryable ? "retry_bound_exhausted" : "permanent_failure",
    };
  }
  return { ...base, status: "ready" };
}
