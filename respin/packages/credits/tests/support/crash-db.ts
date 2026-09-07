// A DATABASE THAT DIES ON CUE (slice 6, R14c).
//
// WHY THIS EXISTS. R14c draws a line through the middle of a generation: a
// crash BEFORE the durable response checkpoint becomes `recovery_required` and
// the creator is charged nothing; a crash AFTER it leaves an attempt a retry
// can settle without calling the vendor again. Both halves are claims about
// what survives a failure, and neither can be tested by asserting on a happy
// path — the only way to know which side of the line a failure falls on is to
// PUT ONE THERE.
//
// WHY THE PREDICATE READS THE DATABASE INSTEAD OF COUNTING TRANSACTIONS. The
// obvious version is "fail the Nth transaction", and it encodes the current
// shape of `generate` into a number: a metering call added or removed silently
// moves the failure somewhere else and the test keeps passing while measuring
// something else. A predicate over the attempt's own STATE names the moment in
// the vocabulary the requirement uses ("after the vendor answered, before the
// checkpoint"), so a refactor that reorders the steps either still hits that
// moment or fails loudly.
//
// WHAT IT DOES NOT SIMULATE, stated rather than implied: a process that is
// killed. The `finally` blocks still run and the caller still returns. What it
// reproduces is an unreachable database, which is the failure this code path
// actually handles — and, when `mode` is `"always"`, it also takes down the
// bookkeeping write that would otherwise flag the attempt, which is what leaves
// a row at `vendor_complete` exactly the way a lost process would.
import type { DbLike } from "@respin/db";

/**
 * The injected failure.
 *
 * ITS OWN CLASS so a test can tell "the failure I planted" from "something else
 * broke" — an assertion that a call rejected is satisfied by any bug at all.
 */
export class SimulatedDbOutageError extends Error {
  constructor() {
    super("simulated database outage");
    this.name = "SimulatedDbOutageError";
  }
}

/**
 * Wrap a database so that `transaction` throws while `when()` holds.
 *
 * `mode: "once"` fails a single transaction and then gets out of the way — the
 * shape of a transient failure, which is what lets the code under test run its
 * own recovery bookkeeping.
 *
 * `mode: "always"` keeps failing — the shape of a database that has gone away,
 * which is what stops the recovery bookkeeping too and leaves the row where the
 * last COMMITTED transaction put it.
 *
 * A `Proxy`, not a subclass: `DbLike` is drizzle's `PgDatabase`, whose surface
 * this file has no business restating. Every other member is forwarded to the
 * real instance (methods bound to it, so nothing observes the proxy as `this`).
 */
export function dbThatFailsWhen(
  db: DbLike,
  when: () => Promise<boolean>,
  mode: "once" | "always"
): DbLike {
  let fired = false;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "transaction") {
        return async (...args: unknown[]) => {
          if ((mode === "always" || !fired) && (await when())) {
            fired = true;
            throw new SimulatedDbOutageError();
          }
          return (
            target as unknown as {
              transaction: (...a: unknown[]) => Promise<unknown>;
            }
          ).transaction(...args);
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DbLike;
}

/**
 * Wrap a database so that `action()` runs — to completion — immediately BEFORE
 * the first transaction opened while `when()` holds.
 *
 * WHY THIS EXISTS RATHER THAN A SECOND CONCURRENT CALLER. The property under
 * test is "two callers holding one `vendor_complete` row, and only one may
 * debit". Two real callers race, and a race decided by scheduling is a test
 * that passes for whichever ordering it happened to get — under PGlite, always
 * the same one. This makes the interleaving a FACT: the other caller finishes
 * while this one is between reading the claim and taking the lock, which is
 * precisely the window the in-lock re-read exists to close.
 *
 * NAMING THE MOMENT IS THE CALLER'S JOB. On a FRESH generation, the first
 * transaction opened while the attempt reads `vendor_complete` is the
 * settlement — the checkpoint's own transaction is opened while the row still
 * reads `vendor_started`, because the predicate runs BEFORE it is delegated.
 */
export function dbThatRunsBefore(
  db: DbLike,
  when: () => Promise<boolean>,
  action: () => Promise<unknown>
): DbLike {
  let fired = false;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "transaction") {
        return async (...args: unknown[]) => {
          if (!fired && (await when())) {
            fired = true;
            await action();
          }
          return (
            target as unknown as {
              transaction: (...a: unknown[]) => Promise<unknown>;
            }
          ).transaction(...args);
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DbLike;
}
