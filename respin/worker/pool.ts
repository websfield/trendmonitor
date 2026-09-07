export const WORKER_CONCURRENCY_CODE_CEILING = 8;
export const WORKER_QUEUE_CODE_CEILING = 32;

export class WorkerQueueFullError extends Error {}

export function resolveConcurrencyLimit(configuredLimit?: number): number {
  const configured = configuredLimit ?? WORKER_CONCURRENCY_CODE_CEILING;
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    throw new Error("configured concurrency limit must be a positive safe integer");
  }
  return Math.min(configured, WORKER_CONCURRENCY_CODE_CEILING);
}

export function resolveQueueLimit(configuredLimit?: number): number {
  const configured = configuredLimit ?? WORKER_QUEUE_CODE_CEILING;
  if (!Number.isSafeInteger(configured) || configured < 0) {
    throw new Error("configured queue limit must be a non-negative safe integer");
  }
  return Math.min(configured, WORKER_QUEUE_CODE_CEILING);
}

export interface PoolSnapshot {
  readonly active: number;
  readonly queued: number;
  readonly limit: number;
  readonly queueLimit: number;
}

export class BoundedConcurrencyPool {
  readonly #limit: number;
  readonly #queueLimit: number;
  #active = 0;
  readonly #queue: Array<() => void> = [];

  constructor(configuredLimit?: number, configuredQueueLimit?: number) {
    this.#limit = resolveConcurrencyLimit(configuredLimit);
    this.#queueLimit = resolveQueueLimit(configuredQueueLimit);
  }

  snapshot(): PoolSnapshot {
    return {
      active: this.#active,
      queued: this.#queue.length,
      limit: this.#limit,
      queueLimit: this.#queueLimit,
    };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.#acquire();
    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  async #acquire(): Promise<void> {
    if (this.#active < this.#limit) {
      this.#active += 1;
      return;
    }
    if (this.#queue.length >= this.#queueLimit) {
      throw new WorkerQueueFullError("worker local wait queue is full");
    }
    await new Promise<void>((resolve) => {
      this.#queue.push(() => {
        this.#active += 1;
        resolve();
      });
    });
  }

  #release(): void {
    this.#active -= 1;
    const next = this.#queue.shift();
    if (next) next();
  }
}
