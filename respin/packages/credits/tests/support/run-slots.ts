// Test doubles for the run-slot semaphore (tech-spec §6).
//
// WHY DOUBLES AND NOT THE REAL THING in most suites: `pgRunSlots` needs a
// `pg.Pool` and two live connections to say anything, and PGlite — which the
// non-Docker suites run on — is single-connection by construction, so it
// cannot express "a second run while the first is in flight" at all. The REAL
// implementation is proved in `inference-race.docker.test.ts` against real
// Postgres. These doubles exist so every OTHER assertion about `runInference`
// can be made without a database race, and so the two refusals can be driven
// deterministically rather than by contriving a collision.
//
// WHAT KEEPS THEM HONEST: `granting()` COUNTS its acquires and releases, so a
// test can assert the slot was actually taken and actually given back. A double
// that silently returned a lease nobody checked would let a mutation deleting
// the whole acquisition call stay green here — the Docker suite would still
// catch it, but a unit suite that cannot see its own subject is the vacuous
// shape this repo has shipped before (CLAUDE.md, 2026-08-21).
import type {
  RunSlotOutcome,
  RunSlotRefusal,
  RunSlots,
  VerifiedWorkspaceId,
} from "@respin/db";

export type SlotLog = {
  /** One entry per acquire, in order, with the limit the operation asked for. */
  acquired: { workspaceId: string; limit: number }[];
  /** Incremented by `release()`. Compare with `acquired.length`. */
  released: number;
};

/** Always grants. Records every acquire and release so a test can assert both. */
export function granting(): { slots: RunSlots; log: SlotLog } {
  const log: SlotLog = { acquired: [], released: 0 };
  return {
    log,
    slots: {
      async acquire(
        workspaceId: VerifiedWorkspaceId,
        limit: number
      ): Promise<RunSlotOutcome> {
        log.acquired.push({ workspaceId, limit });
        let freed = false;
        return {
          granted: true,
          lease: {
            index: log.acquired.length - 1,
            async release() {
              // Idempotent, like the real one — a double release is not an
              // error, and a test asserting `released === 1` after two calls
              // is asserting exactly that.
              if (freed) return;
              freed = true;
              log.released += 1;
            },
          },
        };
      },
    },
  };
}

/** Always refuses, with the reason under test. Never yields a lease. */
export function refusing(reason: RunSlotRefusal): {
  slots: RunSlots;
  log: SlotLog;
} {
  const log: SlotLog = { acquired: [], released: 0 };
  return {
    log,
    slots: {
      async acquire(workspaceId: VerifiedWorkspaceId, limit: number) {
        log.acquired.push({ workspaceId, limit });
        return { granted: false, reason } as RunSlotOutcome;
      },
    },
  };
}

/**
 * Grants the first `n` acquires and refuses the rest — the semaphore's shape
 * without a database. Used where the point is "the (n+1)th is refused" rather
 * than "two real connections contend", which is the Docker suite's job.
 */
export function bounded(n: number): { slots: RunSlots; log: SlotLog } {
  const log: SlotLog = { acquired: [], released: 0 };
  let held = 0;
  return {
    log,
    slots: {
      async acquire(workspaceId: VerifiedWorkspaceId, limit: number) {
        log.acquired.push({ workspaceId, limit });
        if (held >= n) {
          return { granted: false, reason: "workspace_limit" } as RunSlotOutcome;
        }
        held += 1;
        let freed = false;
        return {
          granted: true,
          lease: {
            index: held - 1,
            async release() {
              if (freed) return;
              freed = true;
              held -= 1;
              log.released += 1;
            },
          },
        } as RunSlotOutcome;
      },
    },
  };
}

/**
 * The default for suites whose subject is not the slot.
 *
 * A bare granting semaphore with its log discarded. Deliberately NOT the same
 * object across calls: a shared one would let one test's acquires show up in
 * another's assertions.
 */
export function anySlots(): RunSlots {
  return granting().slots;
}
