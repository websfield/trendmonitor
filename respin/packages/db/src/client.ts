import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Connection factory — no module-level singleton reading env at import time
 * (testability; the caller decides where the connection string comes from).
 * Throws a named, actionable error at CALL time when the string is absent.
 */
function createDbWithPoolOptions(
  connectionString: string | undefined,
  options: { max: number; applicationName?: string; label: string },
) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. createDb requires a Postgres connection string — see respin/env.example for where to get one."
    );
  }
  const pool = new pg.Pool({
    connectionString,
    ...(options.applicationName ? { application_name: options.applicationName } : {}),
    // EXPLICIT, because the run slot made the arithmetic load-bearing. `pg`
    // defaults `max` to 10 and `connectionTimeoutMillis` to 0 (queue forever).
    // With `DEFAULT_RUN_SLOT_POOL_MAX` slot connections held for the length of
    // a vendor call, an implicit 10 shared between page renders, the metered
    // run's own `model_usage` + debit, and the Stripe webhook's five config
    // reads inside ONE transaction is a queue that can outlast Stripe's
    // delivery timeout and earn a redelivery. See the footprint note below.
    max: options.max,
    connectionTimeoutMillis: QUERY_POOL_CONNECT_TIMEOUT_MS,
  });
  attachPoolErrorGuard(pool, options.label);
  return drizzle(pool, { schema });
}

export function createDb(connectionString: string | undefined) {
  return createDbWithPoolOptions(connectionString, {
    max: DEFAULT_QUERY_POOL_MAX,
    label: "query",
  });
}

export const SYSTEM_WORKER_QUERY_POOL_CODE_CEILING = 2;

/**
 * Dedicated Slice 8 worker query pool. This is separate from pg-boss's own
 * bounded pool and its LISTEN session; the deployment footprint is therefore
 * `query max + pg-boss max + 1`, never the app process's 26-connection shape.
 */
export function createSystemWorkerDb(
  connectionString: string | undefined,
  configuredMax = 1,
) {
  if (!Number.isSafeInteger(configuredMax) || configuredMax <= 0) {
    throw new Error("worker query pool max must be a positive safe integer");
  }
  return createDbWithPoolOptions(connectionString, {
    max: Math.min(configuredMax, SYSTEM_WORKER_QUERY_POOL_CODE_CEILING),
    applicationName: "respin-system-worker-query",
    label: "system-worker-query",
  });
}

export async function closeSystemWorkerDb(db: Db): Promise<void> {
  await db.$client.end();
}

/**
 * WHY EVERY POOL IN THIS PROCESS NEEDS THIS, AND WHY THE RUN SLOT MADE IT URGENT.
 *
 * `pg-pool` removes its own idle listener the moment a client is checked out
 * (`pg-pool@3.14.0/index.js:344`), and `pg`'s Client then emits `'error'`
 * unconditionally on a dead socket (`pg@8.23.0/lib/client.js:416-423`). An
 * `'error'` event with no listener is an uncaught exception, which ends the
 * Node process — dropping every concurrent request, including any whose vendor
 * call has returned but whose `model_usage` has not committed. That is vendor
 * spend with no record, which is the one thing step 8b exists to prevent.
 *
 * THE CLASS IS OLDER THAN THE RUN SLOT — the billing gate reproduced the same
 * crash against a plain `createDb()` pool, so this is not a defect the slot
 * introduced. What the slot changed is the exposure: a checked-out connection
 * carrying NO traffic for the length of a vendor call turns a millisecond
 * window between statements into ~40 seconds on every generation. A Postgres
 * restart, an OOM kill, a `pg_terminate_backend` or a NAT reset during any run
 * used to be a lost query; now it is a lost process.
 *
 * The handler deliberately does nothing but keep the process alive and say so
 * on stderr: pg discards the broken client itself, the caller's own query
 * rejects through its normal path, and swallowing it silently would hide a
 * database that is actually failing.
 */
export function poolErrorFields(err: Error): string {
    // NO MESSAGE, CONNECTION STRING, QUERY OR PARAMETERS. A pool error can
    // carry a DrizzleQueryError whose message includes bound creator content.
    // Retain only a closed-shape error class and PostgreSQL's five-character
    // driver code; anything outside those alphabets is reported as unknown.
    const errorName = /^[A-Za-z][A-Za-z0-9]*$/.test(err.name)
      ? err.name
      : "Error";
    const rawCode = (err as Error & { code?: unknown }).code;
    const driverCode =
      typeof rawCode === "string" && /^[A-Z0-9]{5}$/.test(rawCode)
        ? rawCode
        : "unknown";
  return `class=${errorName} code=${driverCode}`;
}

function attachPoolErrorGuard(pool: pg.Pool, label: string): void {
  pool.on("error", (err: Error) => {
    console.error(
      `[respin-db] ${label} pool connection error (the process survives; the query that owned it fails normally): ${poolErrorFields(err)}`
    );
  });
}

export type Db = ReturnType<typeof createDb>;

/**
 * How many run slots this PROCESS may hold open at once, across every
 * workspace. Overridable per deployment; see `createRunSlotPool` for why a
 * number is needed at all.
 */
export const DEFAULT_RUN_SLOT_POOL_MAX = 16;

/**
 * The query pool's ceiling, and the connection footprint it implies.
 *
 * ONE APP PROCESS HOLDS AT MOST `DEFAULT_QUERY_POOL_MAX + DEFAULT_RUN_SLOT_POOL_MAX`
 * = 10 + 16 = **26** Postgres connections. Postgres's own default
 * `max_connections` is 100 and `docker-compose.yml` does not override it, so
 * three app processes fit with room for `psql` and the migration CLI; a fourth
 * does not. That arithmetic is written here rather than left to be rediscovered
 * because the two numbers are set in different places and neither is meaningful
 * alone (production gate, 2026-08-28: "is 16 defensible?" was not answerable
 * from the repo).
 *
 * Raising `RUN_SLOT_POOL_MAX` without checking this is how a deploy runs out of
 * connections rather than out of slots — and the symptom of that is
 * `server_capacity` refusals, which point at the wrong number.
 */
export const DEFAULT_QUERY_POOL_MAX = 10;

/**
 * Bounded, so a saturated pool fails a request instead of queueing forever and
 * outlasting Stripe's delivery timeout.
 *
 * 10s rather than something tighter, and the reason is recorded because it is a
 * behaviour CHANGE and not just a number: this pool previously had NO connect
 * timeout, so a saturated pool queued indefinitely. Bounding it means a request
 * that would once have waited now fails — correct in production, and a new way
 * for a heavily parallel test run to flake. One full-suite run failed once
 * immediately after this bound was introduced and did not reproduce in two
 * subsequent runs (one isolated, one full); the cause was not established
 * either way, so the value is set generously rather than the failure being
 * called unrelated.
 */
export const QUERY_POOL_CONNECT_TIMEOUT_MS = 10_000;

/** How long `acquire` waits for a slot connection before reporting capacity. */
export const RUN_SLOT_CONNECT_TIMEOUT_MS = 2_000;

/**
 * How long a slot's own lock/unlock statement may take.
 *
 * These are `pg_try_advisory_lock` and `pg_advisory_unlock` — no I/O, no
 * planning, microseconds on a healthy connection. Anything approaching this
 * bound means the socket is wedged rather than the database being busy, and a
 * bounded rejection is what lets `release` fall through to `release(true)`
 * instead of hanging forever in a `finally`.
 */
export const RUN_SLOT_QUERY_TIMEOUT_MS = 5_000;

/**
 * A SEPARATE pool for run slots, and separating it is a correctness
 * requirement rather than tidiness.
 *
 * THE DEADLOCK IT AVOIDS. A run slot is a session advisory lock, which means a
 * connection held for the whole length of the vendor call. Take those from the
 * query pool and the failure is total: with `pg`'s default `max` of 10, ten
 * concurrent runs hold all ten connections, every one of them then needs an
 * eleventh to commit `model_usage` and its debit, `pool.connect()` waits
 * forever by default — and the `finally` that would release the slot is
 * downstream of the wait that never ends. Nothing recovers, and the control
 * bounding our spend becomes a hang on every generation in the process. Held
 * on their own pool, slots cannot starve the queries that end them.
 *
 * `connectionTimeoutMillis` is set for the second half of the same argument: at
 * the ceiling, `acquire` must REFUSE rather than queue. `RunSlots.acquire`
 * promises never to block, and an unbounded wait for a connection would break
 * that promise in the one place it matters — holding a Next.js server-action
 * worker open on a request the creator has already been told nothing about.
 *
 * The locks themselves are unaffected by the split: advisory locks are scoped
 * to the DATABASE, not to a pool, so a slot taken on this pool contends
 * correctly with one taken on any other connection to the same database.
 */
export function createRunSlotPool(
  connectionString: string | undefined,
  max: number = DEFAULT_RUN_SLOT_POOL_MAX
): pg.Pool {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. createRunSlotPool requires a Postgres connection string — see respin/env.example for where to get one."
    );
  }
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(
      `createRunSlotPool: max must be a positive integer, received ${String(max)}. Refusing rather than defaulting — this number is the process-wide ceiling on concurrent vendor calls.`
    );
  }
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: RUN_SLOT_CONNECT_TIMEOUT_MS,
    // THE ONE HOLE IN THE "NEVER DRAINS" ARGUMENT, and the production gate
    // found it. A slot connection sits with ZERO packets for the whole vendor
    // call, so a stateful firewall or load balancer reaping an idle flow — or a
    // silent NAT drop — leaves it half-open: `conn.query` for the unlock then
    // neither resolves nor rejects, `await lease.release()` hangs inside
    // `runInference`'s `finally`, and that connection never comes back. One per
    // event, until every run is refused `server_capacity`. That is precisely
    // the outage the bound exists to prevent, arriving through the socket.
    //
    // `keepAlive` stops the flow being idle; `query_timeout` bounds the unlock
    // itself, and the existing `catch` around it already converts a rejection
    // into `release(true)` — which destroys the session and so frees the lock
    // anyway. Two mechanisms because they fail differently: one prevents the
    // half-open socket, the other survives it.
    keepAlive: true,
    query_timeout: RUN_SLOT_QUERY_TIMEOUT_MS,
  });
  attachPoolErrorGuard(pool, "run-slot");
  return pool;
}
