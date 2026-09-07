import { describe, expect, it } from "vitest";

import {
  WORKER_CONCURRENCY_CODE_CEILING,
  WORKER_QUEUE_CODE_CEILING,
  BoundedConcurrencyPool,
  WorkerQueueFullError,
  resolveConcurrencyLimit,
  resolveQueueLimit,
} from "../pool";

describe("bounded worker pool", () => {
  it("lets config tighten concurrency but clamps above the code ceiling", () => {
    expect(resolveConcurrencyLimit(2)).toBe(2);
    expect(resolveConcurrencyLimit(WORKER_CONCURRENCY_CODE_CEILING + 100)).toBe(
      WORKER_CONCURRENCY_CODE_CEILING,
    );
    expect(resolveQueueLimit(3)).toBe(3);
    expect(resolveQueueLimit(WORKER_QUEUE_CODE_CEILING + 100)).toBe(
      WORKER_QUEUE_CODE_CEILING,
    );
    expect(() => resolveConcurrencyLimit(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
    expect(() => resolveQueueLimit(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
  });

  it("never runs more jobs than its resolved limit", async () => {
    const pool = new BoundedConcurrencyPool(2);
    let active = 0;
    let maximumActive = 0;

    const jobs = Array.from({ length: 12 }, (_, index) =>
      pool.run(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => setTimeout(resolve, index % 3));
        active -= 1;
        return index;
      }),
    );

    await expect(Promise.all(jobs)).resolves.toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    );
    expect(maximumActive).toBe(2);
    expect(pool.snapshot()).toEqual({
      active: 0,
      queued: 0,
      limit: 2,
      queueLimit: WORKER_QUEUE_CODE_CEILING,
    });
  });

  it("releases a slot after a job rejects", async () => {
    const pool = new BoundedConcurrencyPool(1);
    await expect(pool.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    await expect(pool.run(async () => "next")).resolves.toBe("next");
  });

  it("refuses instead of growing its local wait queue without bound", async () => {
    const pool = new BoundedConcurrencyPool(1, 1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = pool.run(async () => gate);
    const second = pool.run(async () => "second");

    await expect(pool.run(async () => "overflow")).rejects.toBeInstanceOf(
      WorkerQueueFullError,
    );
    release();
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBe("second");
  });
});
