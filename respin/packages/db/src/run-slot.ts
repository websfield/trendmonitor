// A PER-WORKSPACE RUN SLOT, HELD ACROSS THE VENDOR CALL (tech-spec §6).
//
// WHAT THIS BOUNDS AND WHY IT IS IN `packages/db`.
//
//   `tech-spec.md:116` specifies per-tier generation concurrency (2 Free /
//   2 Creator / 4 Pro / 8 Studio) and, until this file, NOTHING implemented it.
//   The production gate found the consequence on 2026-08-28: at
//   `preCallCost === 0` the balance read is skipped entirely, and the seed
//   prices `onboardingBrainBuild` at 0 — so N concurrent first presses on a
//   fresh Free workspace all read "no priors", all skip the check, and all
//   reach Anthropic. Our vendor spend was bounded by request concurrency
//   rather than by anything the customer paid for.
//
//   It lives HERE and not in `packages/credits` because `packages/credits` is
//   handed a `DbLike` — a `PgDatabase`, which exposes `transaction` and a query
//   builder and NO connection. A session-level advisory lock is by definition a
//   property of a connection, so the capability has to be minted where the pool
//   is, and the pool is in this package (`client.ts`) behind the same
//   default-deny lint that keeps `createDb` out of `app/**`.
//
// WHY A SESSION LOCK AND NOT A TABLE.
//
//   A `run_slots` row is leaked forever by a process that dies mid-call — a
//   killed server permanently shrinks a workspace's concurrency and eventually
//   bricks generation for it, which is the control becoming the outage
//   (CLAUDE.md, 2026-07-30). A session advisory lock is released BY POSTGRES
//   when the session ends, so a crash cannot leak a slot. The cost is that the
//   lock is tied to a connection we must hold for the lease's lifetime, and
//   that is exactly the resource being rationed.
//
// WHY NOT AN XACT LOCK.
//
//   `takeWorkspaceLock` uses `pg_advisory_xact_lock`, which is right for the
//   debit: it is released at COMMIT, and the debit's whole life is inside one
//   transaction. This slot must outlive every transaction and span an HTTP call
//   to a third party — and holding a transaction open across a vendor call is
//   the exact shape the round-1 gate rejected around the `model_usage` write.
//
// WHY N KEYS AND NOT A COUNTER.
//
//   An advisory lock is binary. A counting semaphore over binary locks is N
//   keys tried in order: the first key nobody holds is this run's slot. There
//   is no counter to read, so there is no read-then-act window — `pg_try_*`
//   either takes the lock or does not, atomically, and no arithmetic derived
//   from a stale count can hand out an (N+1)th slot.
import type pg from "pg";
import type { VerifiedWorkspaceId } from "./with-workspace";
import { poolErrorFields } from "./client";

/**
 * The lock keyspace prefix.
 *
 * WHAT IT ACTUALLY BUYS, stated at the strength it holds. An earlier version of
 * this comment claimed the prefix makes the run-slot and workspace-lock
 * keyspaces "disjoint by construction rather than by the improbability of a
 * 64-bit collision". That is FALSE and the tenancy gate said so: every key here
 * goes through the same `hashtextextended(…, 0)` into the same single 64-bit
 * advisory keyspace that `takeWorkspaceLock` (`packages/credits/src/clock.ts`)
 * and `writeBrainDoc` (`with-workspace.ts`) use, and Postgres shares that space
 * between session and xact locks. Disjointness there IS the collision
 * improbability the comment disclaimed.
 *
 * What the prefix genuinely provides is injectivity of the key STRINGS:
 * `runslot:{workspaceId}:{index}` with an integer index (which contains no
 * colon) determines `(workspaceId, index)` uniquely for ANY string workspace
 * id, including one containing colons — so no two workspaces, and no two slots,
 * can ask for the same name. That property is asserted as a property in
 * `packages/db/tests/run-slot-key.test.ts`, not by comparing one pair.
 * Brain edits and exports use the separate `controlslot:` prefix plus a closed
 * operation namespace. This preserves the established generation key while
 * proving a control request cannot occupy a paid generation slot.
 *
 * The residual is a 64-bit hash collision between two distinct names, which is
 * the same residual every other advisory lock in this repo already carries.
 */
export const RUN_SLOT_KEY_PREFIX = "runslot:";
export const CONTROL_SLOT_KEY_PREFIX = "controlslot:";
export type RunSlotNamespace = "generation" | "brain-edit" | "export";

/**
 * The name hashed into the advisory-lock key for one slot.
 *
 * Exported so the Docker race asserts contention on THIS key by name, rather
 * than on "some advisory lock was contended" — the weaker assertion passes
 * against any lock in the process and would have stayed green through the
 * whole class of defect this file exists to close.
 */
export function runSlotKeyName(
  workspaceId: VerifiedWorkspaceId,
  index: number,
  namespace: RunSlotNamespace = "generation"
): string {
  return namespace === "generation"
    ? `${RUN_SLOT_KEY_PREFIX}${workspaceId}:${index}`
    : `${CONTROL_SLOT_KEY_PREFIX}${namespace}:${workspaceId}:${index}`;
}

/** A held slot. `release` is idempotent; calling it twice is not an error. */
export type RunSlotLease = {
  /** Which of the tier's slots this run holds. Reported, never used to price anything. */
  readonly index: number;
  release(): Promise<void>;
};

/**
 * Why a slot was refused. TWO REASONS, kept apart because they are two
 * different sentences to a creator and two different actions by an operator.
 *
 * `workspace_limit` — this workspace already has `limit` runs in flight. The
 * creator waits for their own run to finish, and an operator does nothing.
 *
 * `server_capacity` — the PROCESS is at its ceiling (`createRunSlotPool`'s
 * `max`), regardless of which workspaces hold the slots. The creator waits, and
 * an operator has a number to raise. Collapsing this into `workspace_limit`
 * would tell a creator with no runs at all that they have too many.
 */
export type RunSlotRefusal = "workspace_limit" | "server_capacity";

/** Granted, or refused with a reason. A union rather than `Lease | null`, because `null` cannot carry which of the two happened. */
export type RunSlotOutcome =
  | { granted: true; lease: RunSlotLease }
  | { granted: false; reason: RunSlotRefusal };

/**
 * The port `runInference` takes.
 *
 * A PARAMETER rather than a module singleton, for the identical reason
 * `LlmProvider` is: "the slot was refused" is proved by handing in an
 * implementation that refuses, and "the slot was released even though the call
 * threw" is proved by an implementation that RECORDS its own release — neither
 * of which an assertion about a spy on a mocked module can express.
 */
export type RunSlots = {
  /**
   * Take a slot, or refuse.
   *
   * NEVER BLOCKS INDEFINITELY. A queue here would turn a concurrency bound into
   * a latency bound: the (N+1)th press would sit holding a Next.js
   * server-action worker until a slot freed, which is the thing the overall
   * deadline exists to stop. Refusing gives the creator a sentence they can act
   * on. The one bounded wait is for a POOL CONNECTION, capped by
   * `RUN_SLOT_CONNECT_TIMEOUT_MS` and reported as `server_capacity`.
   */
  acquire(
    workspaceId: VerifiedWorkspaceId,
    limit: number,
    namespace?: RunSlotNamespace
  ): Promise<RunSlotOutcome>;
};

/**
 * The exact messages `pg-pool` raises when a connection cannot be obtained in
 * time. BOTH of them, and the second is one three review rounds missed.
 *
 * `pg-pool@3.14.0/index.js:224` — the pool is at `max` and the wait for an
 *   existing client to free up expired. This is "we are at our own ceiling".
 * `pg-pool@3.14.0/index.js:276` — a NEW connection could not be established in
 *   time (Postgres slow, restarting, or at its own `max_connections`). This is
 *   the more operationally likely of the two and the original matcher did not
 *   catch it, so the most probable capacity event fell through to the unmapped
 *   rethrow and rendered "Something went wrong".
 *
 * Both are bare `new Error(...)` with no `code`, no subclass and no property to
 * test, so the message IS the only handle — verified by reading the installed
 * file, not from memory (golden rule 9).
 */
const PG_POOL_CONNECT_TIMEOUT_MESSAGES = [
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
] as const;

/**
 * Did this connect attempt fail because no connection was available in time?
 *
 * MATCHED ON THE MESSAGE, which is the brittle shape CLAUDE.md's 2026-08-18
 * lesson is about — so it is not left as an argument. `packages/credits/tests/
 * inference-race.docker.test.ts` builds a REAL one-connection
 * `createRunSlotPool`, exhausts it, and asserts both that the installed library
 * throws something this function recognises and that `acquire` reports
 * `server_capacity`. A reworded upstream message fails that test.
 *
 * (The previous docblock CLAIMED that test existed while it did not. All four
 * round-2 reviewers found it independently, which is what golden rule 1 is for:
 * a claim recorded is verified in the same action that records it.)
 *
 * FAIL-CLOSED WHEN IT DOES NOT MATCH: an unrecognised connect error is
 * rethrown, so the operation ends with an error and NO vendor call — never with
 * a granted slot. A reworded message costs an unmapped refusal, not an
 * unbounded spend.
 */
export function isRunSlotCapacityError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (PG_POOL_CONNECT_TIMEOUT_MESSAGES as readonly string[]).includes(e.message)
  );
}

/** A `limit` that is not a positive integer is a config defect, and guessing one would silently unbound the spend this file exists to bound. */
function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `runSlots: concurrency limit must be a positive integer, received ${String(limit)}. Refusing rather than defaulting — a defaulted limit is an unbounded vendor spend.`
    );
  }
}

/**
 * The real implementation, over a `pg.Pool`.
 *
 * THE CONNECTION IS DESTROYED, NEVER RETURNED, ON ANY PATH WHERE THIS CODE
 * CANNOT PROVE THE LOCK IS GONE. A pooled connection handed back while still
 * holding a session lock passes that lock to the NEXT borrower, who never took
 * it and will never release it — one workspace's slot silently consumed
 * forever, in a pool that outlives every request. `release(true)` ends the
 * session, and Postgres drops the lock with it. Destroying a connection costs
 * one reconnect; leaking a lock costs a slot until the process restarts.
 */
export function pgRunSlots(pool: pg.Pool): RunSlots {
  return {
    async acquire(workspaceId, limit, namespace = "generation") {
      assertLimit(limit);
      let conn;
      try {
        conn = await pool.connect();
      } catch (e) {
        // The process is at its ceiling. Refused, not thrown — the creator gets
        // a sentence rather than a 500, and no vendor call happens either way.
        if (isRunSlotCapacityError(e)) {
          return { granted: false, reason: "server_capacity" };
        }
        throw e;
      }
      let settled = false;
      try {
        for (let index = 0; index < limit; index++) {
          const name = runSlotKeyName(workspaceId, index, namespace);
          const { rows } = await conn.query(
            "SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS taken",
            [name]
          );
          // STRICTLY `=== true`. `pg` parses booleans as booleans, but a
          // truthiness test would read the string "f" — what a driver without
          // a bool parser returns for FALSE — as a granted lock, handing out
          // every slot at once, which is the fail-OPEN direction on the one
          // control bounding vendor spend.
          if (rows[0]?.taken === true) {
            settled = true;
            let freed = false;
            // THE POOL'S OWN GUARD DOES NOT COVER THIS WINDOW, and that is the
            // whole reason this listener exists. `pg-pool` removes its idle
            // listener at checkout (pg-pool@3.14.0/index.js:344), so between
            // here and `release()` the client is emitting `'error'` to nobody —
            // and this design deliberately holds it, silent, for the length of
            // a vendor call. An unhandled `'error'` is an uncaught exception,
            // which ends the process and takes every concurrent generation with
            // it, including any whose tokens are already spent.
            //
            // The listener is removed at release so it cannot accumulate on a
            // connection that goes back to the pool and is checked out again.
            const onClientError = (err: Error) => {
              console.error(
                `[respin-db] run-slot connection error while a slot was held (the process survives; the run fails normally): ${poolErrorFields(err)}`
              );
            };
            conn.on("error", onClientError);
            return {
              granted: true,
              lease: {
                index,
                async release() {
                if (freed) return;
                freed = true;
                conn.removeListener("error", onClientError);
                try {
                  const res = await conn.query(
                    "SELECT pg_advisory_unlock(hashtextextended($1::text, 0)) AS freed",
                    [name]
                  );
                  // `false` means Postgres says this session did not hold the
                  // lock we think we are releasing. That cannot be reconciled
                  // from inside the process, so end the session rather than
                  // return a connection whose lock state we are guessing at.
                  if (res.rows[0]?.freed === true) conn.release();
                  else conn.release(true);
                } catch {
                  // THIS BRANCH IS LOAD-BEARING AND IT WAS PROVED BY ACCIDENT.
                  // A mutation that replaced the unlock with malformed SQL was
                  // expected to leak the lock; it did not, because the malformed
                  // query THREW and landed here, and destroying the session made
                  // Postgres drop the lock anyway. A release that cannot
                  // complete therefore still frees the slot — the failure mode
                  // is one reconnect, never a slot consumed forever.
                  conn.release(true);
                }
                },
              },
            };
          }
        }
        // Every slot is held. This connection took no lock, so it goes back.
        settled = true;
        conn.release();
        return { granted: false, reason: "workspace_limit" };
      } catch (e) {
        if (!settled) {
          settled = true;
          // An error mid-loop may have left a lock taken by a query whose
          // result we never saw. Destroy rather than guess.
          conn.release(true);
        }
        throw e;
      }
    },
  };
}
