import { describe, expect, it } from "vitest";

import {
  RETRY_ATTEMPT_CODE_CEILING,
  beginAttempt,
  finishAttempt,
  initialRetryState,
  resolveRetryPolicy,
} from "../retry";

describe("finite retry policy", () => {
  it("lets config tighten the bound but never exceed the code ceiling", () => {
    expect(resolveRetryPolicy({ configuredMaxAttempts: 2 }).maxAttempts).toBe(2);
    expect(
      resolveRetryPolicy({ configuredMaxAttempts: RETRY_ATTEMPT_CODE_CEILING + 99 })
        .maxAttempts,
    ).toBe(RETRY_ATTEMPT_CODE_CEILING);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "refuses an invalid configured attempt count (%s)",
    (configuredMaxAttempts) => {
      expect(() => resolveRetryPolicy({ configuredMaxAttempts })).toThrow(
        /positive safe integer/i,
      );
    },
  );

  it("parks after the finite bound and cannot begin another attempt", () => {
    let state = initialRetryState("job-1", resolveRetryPolicy({ configuredMaxAttempts: 3 }));

    for (const attemptId of ["attempt-1", "attempt-2", "attempt-3"]) {
      const running = beginAttempt(state, () => attemptId);
      state = finishAttempt(running, {
        status: "failed",
        failureCode: "vendor_unavailable",
        retryable: true,
      });
    }

    expect(state.status).toBe("parked");
    expect(state.attempts).toHaveLength(3);
    expect(() => beginAttempt(state, () => "attempt-4")).toThrow(/parked/i);
  });

  it("parks a permanent failure immediately", () => {
    const running = beginAttempt(
      initialRetryState("job-2", resolveRetryPolicy({ configuredMaxAttempts: 5 })),
      () => "attempt-permanent",
    );
    const state = finishAttempt(running, {
      status: "failed",
      failureCode: "request_invalid",
      retryable: false,
    });
    expect(state.status).toBe("parked");
    expect(state.attempts).toHaveLength(1);
  });

  it("refuses prose in an operational failure code", () => {
    const running = beginAttempt(
      initialRetryState("job-safe-code", resolveRetryPolicy({ configuredMaxAttempts: 2 })),
      () => "attempt-safe-code",
    );
    expect(() => finishAttempt(running, {
      status: "failed",
      failureCode: "the planted transcript must not become retry state",
      retryable: true,
    })).toThrow(/content-safe token/i);
  });

  it("requires a distinct attempt id for every paid-call attempt", () => {
    const first = beginAttempt(
      initialRetryState("job-3", resolveRetryPolicy({ configuredMaxAttempts: 3 })),
      () => "same-attempt",
    );
    const retry = finishAttempt(first, {
      status: "failed",
      failureCode: "vendor_unavailable",
      retryable: true,
    });
    expect(() => beginAttempt(retry, () => "same-attempt")).toThrow(
      /distinct attempt id/i,
    );
  });
});
