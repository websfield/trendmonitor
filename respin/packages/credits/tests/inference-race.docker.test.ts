// The two `runInference` races PGlite cannot express, on real Postgres with
// two connections (slice 2a).
//
// The in-process suite proves the ORDER of the gates against a provider that
// throws if reached. What it cannot prove is what happens when two of these run
// at once, because PGlite is single-connection: its race is a sequence. Both
// properties below are about money, and both were claims made by reading the
// code until this file existed.
//
//   1. THE FREE-ATTEMPT TIE. The first billable attempt per profile is included
//      at 0 credits. Two concurrent first-ever attempts both read "no prior
//      attempts" before either had written a row, so on the pre-call count
//      alone BOTH would be free. The debit transaction re-counts under the
//      workspace lock over COMMITTED rows, excluding itself, so exactly one is
//      free and the other is charged. This was the slice own least-confident
//      claim, recorded as such in the progress ledger.
//
//   2. THE PAUSE THAT COMMITS MID-FLIGHT. A pause freezes entitlements
//      (REQ-G08) and the enforcement is a `hasOpenPause` read inside a
//      transaction holding the workspace lock. Until slice 2a,
//      `recordPauseStart` took no lock at all, so under READ COMMITTED a pause
//      committing a moment after that read was simply MISSED, and four refusal
//      messages tell a creator "nothing was spent" on the strength of it being
//      caught.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  createDockerTestDb,
  creditLedger,
  ensureUserWorkspace,
  modelUsage,
  seedAuthUser,
  seedDb,
  withWorkspace,
  workspaceSpendMonthly,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import type { LlmProvider } from "@respin/llm";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { recordPauseStart } from "../src/pause";
import { runInference } from "../src/inference";
import { deriveBalance } from "../src/balance";
import { WorkspacePausedError } from "../src/errors";
import { anySlots } from "./support/run-slots";
import {
  createRunSlotPool,
  isRunSlotCapacityError,
  pgRunSlots,
  runSlotKeyName,
} from "@respin/db";
import { RunSlotBusyError } from "../src/inference";
import { appendConfigVersion, getActiveConfig } from "@respin/config";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
const REBUILD_COST = CONFIG_V1_SEED.creditCosts.onboardingBrainRebuild;

if (!MAINTENANCE_URL) {
  console.warn(
    "[credits inference-race.docker.test] SKIPPED - TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that two concurrent FIRST-EVER attempts resolve to " +
      "exactly one included build and one charged one (never two free, never two " +
      "charged); that at most one debit exists per attempt id; and that a pause " +
      "committing while an attempt is in flight is not missed by the debit that " +
      "follows it. PGlite cannot express any of these - it is single-connection, " +
      "so its race is a sequence. ALSO NOT PROVEN: that the run slot (tech-spec " +
      "S6) actually refuses a second concurrent run at limit 1 and allows it at " +
      "limit 2 - the slot is a SESSION advisory lock, which needs two real " +
      "connections and therefore cannot exist in PGlite at all. " +
      "Start the docker-compose DB and set " +
      "TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

/**
 * A provider that HOLDS until released, so the test controls the flight window.
 *
 * The window between the pre-call gates and the debit is exactly where both
 * races live, and it is normally the duration of an HTTP call. Holding it open
 * deliberately is what makes the interleaving reproducible rather than a timing
 * hope - the `migrate-config` lesson from the same day: a racing test that never
 * establishes its own precondition fails for reasons that have nothing to do
 * with the product.
 */
function heldProvider(): {
  provider: LlmProvider;
  inFlight: Promise<void>;
  release: () => void;
  callCount: () => number;
} {
  let signalInFlight!: () => void;
  const inFlight = new Promise<void>((r) => {
    signalInFlight = r;
  });
  let releaseFn!: () => void;
  const released = new Promise<void>((r) => {
    releaseFn = r;
  });
  const state = { calls: 0 };
  const provider: LlmProvider = {
    vendor: "held-stub",
    complete: async () => {
      state.calls += 1;
      signalInFlight();
      await released;
      return {
        text: "ok",
        servedModel: "claude-sonnet-5",
        usage: {
          tokensIn: 10,
          tokensOut: 5,
          raw: { input_tokens: 10, output_tokens: 5 },
        },
      };
    },
  };
  return {
    provider,
    inFlight,
    release: () => releaseFn(),
    callCount: () => state.calls,
  };
}

const fastProvider = (): LlmProvider => ({
  vendor: "stub",
  complete: async () => ({
    text: "ok",
    servedModel: "claude-sonnet-5",
    usage: {
      tokensIn: 10,
      tokensOut: 5,
      raw: { input_tokens: 10, output_tokens: 5 },
    },
  }),
});

describe.skipIf(!MAINTENANCE_URL)("runInference under REAL concurrency", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let owner: WorkspaceScope;
  let ws: VerifiedWorkspaceId;
  let profileId: string;
  let n = 0;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_infrace"
    );
    await seedDb(harness.db);
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  beforeEach(async () => {
    // A FRESH WORKSPACE PER CASE rather than a truncate: "the first ever
    // attempt for this profile" is the whole subject here, so state left by an
    // earlier case would silently make a later one exercise the priced path.
    n += 1;
    const user = `race_user_${n}`;
    await seedAuthUser(harness.db, user, `${user}@test.dev`);
    await ensureUserWorkspace(harness.db, { authUserId: user, name: `W${n}` });
    owner = await withWorkspace(harness.db, { authUserId: user });
    ws = owner.workspaceId;
    const profile = await createProfile(harness.db, owner, "Anna", new Date());
    profileId = profile.id;
  }, 60_000);

  /**
   * PRE-WARM the pool, for the reason `concurrency.docker.test.ts` records at
   * length: `pool.connect()` opens a real TCP connection plus auth for a racer
   * that finds no idle client, which is slower than a short transaction — so
   * unwarmed racers arrive one at a time and the case passes without ever
   * having contended. Slice 1 shipped a lock test that was vacuous for exactly
   * this reason (`warmPool`, mutation M4).
   */
  async function prewarmPool(count: number): Promise<void> {
    const clients = await Promise.all(
      Array.from({ length: count }, () => harness.pool.connect())
    );
    for (const c of clients) c.release();
  }

  const grant = (amount: number) =>
    harness.db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: ws,
        amount,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test",
        refId: `grant-${ws}-${amount}`,
        configVersion: 1,
      })
    );

  const inferenceDebits = () =>
    harness.db
      .select()
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.workspaceId, ws),
          eq(creditLedger.refType, "inference")
        )
      );

  /**
   * Wait until Postgres reports a transaction WAITING on an advisory lock.
   *
   * This is the deterministic alternative to sleeping. `pg_locks.granted =
   * false` on an advisory lock is the database's own statement that one
   * transaction is blocked behind another — exactly the claim the pause
   * control makes. Returns false on timeout rather than throwing, so the
   * caller can assert on it and say WHY the case failed instead of dying in a
   * helper.
   */
  async function waitForBlockedAdvisoryLock(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await harness.pool.query(
        "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
      );
      if ((res.rows[0] as { n: number }).n > 0) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  }

  const run = (attemptId: string, provider: LlmProvider) =>
    runInference(
      harness.db,
      owner,
      profileId,
      provider,
      anySlots(),
      { attemptId, system: "s", prompt: "p", promptBundleVersion: "test-bundle" },
      new Date()
    );

  it("two concurrent FIRST-EVER attempts: exactly one is included, one is charged", async () => {
    await grant(REBUILD_COST * 4);
    await prewarmPool(4);

    const [a, b] = await Promise.all([
      run(`att-a-${n}`, fastProvider()),
      run(`att-b-${n}`, fastProvider()),
    ]);

    // THE PROPERTY: one and only one included build. Not "both free", which is
    // what the pre-call count alone would give and is revenue lost on every
    // rebuild; and not "both charged", which bills a creator for the build they
    // were promised free.
    const charges = [a.creditsCharged, b.creditsCharged].sort((x, y) => x - y);
    expect(charges).toEqual([0, REBUILD_COST]);

    // ...and the LEDGER agrees with what the callers were told.
    const debits = await inferenceDebits();
    expect(debits).toHaveLength(1);
    // `delta` is signed and a debit is negative — the ledger is append-only and
    // the sign is the direction, so the magnitude is what the price is compared
    // against.
    expect(debits[0].delta).toBe(-REBUILD_COST);

    // Both attempts are recorded as spend even though only one was billed:
    // `model_usage` is the margin record and it must not lose the free one.
    const usage = await harness.db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.workspaceId, ws));
    expect(usage).toHaveLength(2);

    const view = await deriveBalance(harness.db, ws);
    // THE GRANT, MINUS THE ONE CHARGE, PLUS THE WORKSPACE'S OWN FREE
    // ALLOWANCE (slice 6, R17). This workspace has no subscription row, so
    // `getWorkspaceBillingState` resolves it to `free` and the balance read
    // inside the debit transaction mints its monthly grant. The CHARGE — what
    // this case is about — is asserted exactly, above and below.
    expect(view.balance).toBe(
      REBUILD_COST * 4 - REBUILD_COST + CONFIG_V1_SEED.allowances.free
    );
    // The balance each caller was HANDED must be one the ledger can produce. A
    // returned number nobody checks is how a screen ends up showing a balance
    // the database never had.
    expect([a.balanceAfter, b.balanceAfter]).toContain(view.balance);
  }, 60_000);

  it("NON-VACUITY: the racers really can overlap (an unwarmed pool made this shape vacuous once)", async () => {
    // The premise, asserted rather than assumed. If two attempts ran to
    // completion one after the other, the case above would pass for the wrong
    // reason — the second would see the first COMMITTED row and price honestly
    // with the lock doing nothing. Holding the provider open forces the overlap
    // and proves the dangerous interleaving is reachable at all.
    await grant(REBUILD_COST * 4);
    await prewarmPool(4);

    const held = heldProvider();
    const first = run(`att-hold-${n}`, held.provider);
    // The first attempt is now PAST its pre-call gates and inside the vendor
    // call — the exact window both races live in.
    await held.inFlight;

    // The second runs to completion while the first is still in flight, so it
    // sees NO committed prior attempt and takes the included build.
    const b = await run(`att-fast-${n}`, fastProvider());
    expect(b.creditsCharged).toBe(0);

    held.release();
    const a = await first;
    // ...and the first, whose pre-call count ALSO said free, is charged —
    // because the debit transaction re-counted under the lock.
    expect(a.creditsCharged).toBe(REBUILD_COST);
    expect(held.callCount()).toBe(1);
  }, 60_000);

  /**
   * A `db` whose `model_usage` TRANSACTION IS HELD OPEN between the usage
   * INSERT and its rollup upsert — i.e. the row exists, with its
   * `clock_timestamp()` already assigned, and has NOT committed.
   *
   * The transactional lifecycle fence is acquired before that INSERT and stays
   * held until commit. Holding between these two statements therefore gives the
   * test an exact, observable boundary: a second writer must wait at the fence
   * before it can write its own usage row. No timing sleep is involved.
   */
  function dbHoldingTheUsageCommit(gate: Promise<void>): {
    db: typeof harness.db;
    reached: Promise<void>;
  } {
    let signalReached!: () => void;
    const reached = new Promise<void>((r) => {
      signalReached = r;
    });
    let armed = true;
    const real = harness.db;

    type Chain = Record<string | symbol, unknown>;
    const gatedChain = (target: Chain): Chain =>
      new Proxy(target, {
        get(t, prop) {
          const value = Reflect.get(t, prop, t);
          if (typeof value !== "function") return value;
          if (prop === "then") {
            // THE AWAIT POINT: hold BEFORE the statement runs, so the usage row
            // is inserted and the rollup upsert has not yet taken its lock.
            return (onOk: unknown, onErr: unknown) =>
              (async () => {
                if (armed) {
                  armed = false;
                  signalReached();
                  await gate;
                }
                return await (t as unknown as PromiseLike<unknown>);
              })().then(
                onOk as (v: unknown) => unknown,
                onErr as (e: unknown) => unknown
              );
          }
          return (...args: unknown[]) =>
            gatedChain(
              (value as (...a: unknown[]) => Chain).apply(t, args) as Chain
            );
        },
      }) as Chain;

    const held = Object.create(real) as typeof real;
    (held as unknown as { transaction: unknown }).transaction = (
      fn: (tx: unknown) => Promise<unknown>,
      ...rest: unknown[]
    ) =>
      (
        real.transaction as unknown as (
          f: (tx: unknown) => Promise<unknown>,
          ...r: unknown[]
        ) => Promise<unknown>
      )(async (tx: unknown) => {
        const proxiedTx = Object.create(tx as object) as {
          insert: (table: unknown) => unknown;
        };
        proxiedTx.insert = (table: unknown) => {
          const builder = (tx as { insert: (t: unknown) => Chain }).insert(
            table
          );
          // ONLY the rollup upsert is gated. The usage INSERT itself runs
          // untouched, so its `clock_timestamp()` is the earlier one.
          return table === workspaceSpendMonthly
            ? gatedChain(builder)
            : builder;
        };
        return fn(proxiedTx);
      }, ...rest);

    return { db: held, reached };
  }

  it("an uncommitted usage writer serializes the next run: exactly one included build", async () => {
    // THE INTERLEAVING THE OLD `(created_at, attempt_id)` ORDER COULD NOT SEE.
    //
    // The values are a total order. The READER'S SNAPSHOT is not: `created_at`
    // is `clock_timestamp()` assigned at INSERT, but a row becomes visible at
    // COMMIT, and under READ COMMITTED the two can disagree.
    //
    //   A inserts (earlier clock_timestamp) and does NOT commit
    // The transactional lifecycle fence now makes that exact interleaving
    // unreachable: while A is uncommitted, B waits before its usage write. Once
    // A commits, B proceeds and the durable unique claim leaves exactly one
    // included build.
    //
    // Two included builds on one profile, one debit never written. Revenue
    // lost, never an overcharge — which is why it is not an emergency and is
    // not a reason to leave it.
    await grant(REBUILD_COST * 4);
    await prewarmPool(6);

    let releaseA!: () => void;
    const aMayCommit = new Promise<void>((r) => {
      releaseA = r;
    });
    const holder = dbHoldingTheUsageCommit(aMayCommit);

    const a = runInference(
      holder.db,
      owner,
      profileId,
      fastProvider(),
      anySlots(),
      {
        attemptId: `att-a-${n}`,
        system: "s",
        prompt: "p",
        promptBundleVersion: "test-bundle",
      },
      new Date()
    );
    // A's usage row now EXISTS and is UNCOMMITTED.
    await holder.reached;

    // B waits behind A's lifecycle fence before its usage write. Awaiting B
    // before releasing A is an impossible ordering and used to make this test
    // time out; Postgres's own lock table establishes the serialization without
    // a timing sleep.
    const b = run(`att-b-${n}`, fastProvider());
    let blocked = false;
    try {
      blocked = await waitForBlockedAdvisoryLock(5_000);
    } finally {
      // Always release A: if the premise assertion fails, leaving its transaction
      // open would turn the useful failure into an afterAll timeout.
      releaseA();
    }
    const [aResult, bResult] = await Promise.all([a, b]);
    expect(
      blocked,
      "B waited behind A's lifecycle fence before writing its own usage row"
    ).toBe(true);

    const charges = [aResult.creditsCharged, bResult.creditsCharged].sort(
      (x, y) => x - y
    );
    expect(
      charges,
      "two attempts, one included build: one free and one charged"
    ).toEqual([0, REBUILD_COST]);

    const debits = await inferenceDebits();
    expect(debits, "the ledger is the balance — one debit, not zero").toHaveLength(
      1
    );
    expect(debits[0].delta).toBe(-REBUILD_COST);

    // Both attempts are still recorded as spend (R11), free one included.
    const usage = await harness.db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.workspaceId, ws));
    expect(usage).toHaveLength(2);
  }, 60_000);

  it("a pause still UNCOMMITTED when the debit begins is not sailed past", async () => {
    // B-10, and the version of this case that actually proves something.
    //
    // THE FIRST VERSION OF THIS TEST WAS VACUOUS AND IS RECORDED HERE BECAUSE
    // THAT IS THE INTERESTING PART. It committed the pause outright while the
    // attempt was in flight, then asserted the refusal — and it passed with
    // `recordPauseStart`'s workspace lock DELETED (verified by planting that
    // mutation). Of course it did: a pause that has already committed is
    // visible to any later READ COMMITTED read, lock or no lock. It tested
    // Postgres, not the control. Slice 1 shipped exactly this shape once
    // (`warmPool`, M4) and the lesson is that a race test must be run against
    // the mutation it claims to catch.
    //
    // The dangerous interleaving is the UNCOMMITTED one: the pause has taken
    // the lock and inserted its row, and the debit begins while that
    // transaction is still open. Without the lock the debit reads "no open
    // pause" — the row is invisible — spends the credits, and the pause commits
    // a moment later onto a workspace that has just been charged. With the
    // lock, the debit blocks at its very first statement and, once the pause
    // commits, sees it.
    await grant(REBUILD_COST * 4);
    // A prior committed attempt, so this one is PRICED: the free branch skips
    // `debitCredits` entirely and would prove nothing about the debit gate.
    await run(`att-warm-${n}`, fastProvider());
    await prewarmPool(6);

    const held = heldProvider();
    const attempt = run(`att-paused-${n}`, held.provider);
    await held.inFlight;

    // A pause transaction that takes its lock, inserts, and STAYS OPEN.
    let signalPauseOpen!: () => void;
    const pauseOpen = new Promise<void>((r) => {
      signalPauseOpen = r;
    });
    let commitPause!: () => void;
    const pauseMayCommit = new Promise<void>((r) => {
      commitPause = r;
    });
    const pauseTx = harness.db.transaction(async (tx) => {
      await recordPauseStart(tx, ws, new Date());
      signalPauseOpen();
      await pauseMayCommit;
    });
    await pauseOpen;

    // The attempt now proceeds into its debit, with the pause still uncommitted.
    held.release();

    // WAIT FOR POSTGRES TO SAY THE DEBIT IS BLOCKED, rather than sleeping.
    // A sleep would make this pass under load for the wrong reason: the debit
    // would simply not have run yet when the pause committed. An ungranted
    // advisory lock is the database's own statement that one transaction is
    // waiting on another — which is the property under test.
    const blocked = await waitForBlockedAdvisoryLock(5_000);

    commitPause();
    await pauseTx;

    await expect(attempt).rejects.toBeInstanceOf(WorkspacePausedError);
    // ...and the reason it refused was the LOCK, not luck. Without it the debit
    // never waits: it reads past the uncommitted row and spends.
    expect(
      blocked,
      "the debit never blocked on the workspace lock — the pause writer is not contending, so this refusal proves nothing"
    ).toBe(true);

    // NOTHING WAS CHARGED, which is exactly what the refusal copy promises.
    const debits = await inferenceDebits();
    expect(debits.filter((d) => d.refId === `att-paused-${n}`)).toHaveLength(0);

    // ...and the SPEND IS STILL RECORDED. The tokens were genuinely burnt, so
    // hiding the usage row would make the margin history lie in our favour.
    // R11 settlement tail, doing its job on the refusal path.
    const usage = await harness.db
      .select()
      .from(modelUsage)
      .where(
        and(
          eq(modelUsage.workspaceId, ws),
          eq(modelUsage.attemptId, `att-paused-${n}`)
        )
      );
    expect(
      usage,
      "the vendor was paid for this call; a refused debit must not erase that"
    ).toHaveLength(1);
  }, 60_000);

  it("audit P3-A1 (R-156): the persisted output runs INSIDE the debit's transaction, under the workspace lock — a second run's debit WAITS on it, and a refused write takes its own debit with it", async () => {
    await grant(REBUILD_COST * 6);
    // Spend the included build so both racers are PRICED and must debit.
    await run(`att-included-${n}`, fastProvider());
    await prewarmPool(4);
    let enterPersist!: () => void;
    const inPersist = new Promise<void>((r) => {
      enterPersist = r;
    });
    let releasePersist!: () => void;
    const persistReleased = new Promise<void>((r) => {
      releasePersist = r;
    });
    const a = `att-persist-a-${n}`;
    const b = `att-persist-b-${n}`;
    // A: debits, then its persist HOLDS the transaction open, then refuses.
    const runA = runInference(harness.db, owner, profileId, fastProvider(), anySlots(), {
      attemptId: a, system: "s", prompt: "p", promptBundleVersion: "test-bundle",
      persist: async () => {
        enterPersist();
        await persistReleased;
        throw new Error("the write refused");
      },
    }, new Date()).catch((e: unknown) => e);
    await inPersist;
    // B starts while A sits inside persist, holding the workspace lock.
    const runB = runInference(harness.db, owner, profileId, fastProvider(), anySlots(), {
      attemptId: b, system: "s", prompt: "p", promptBundleVersion: "test-bundle",
      persist: async () => undefined,
    }, new Date());
    // B's debit transaction is BLOCKED on the workspace lock A's persist holds.
    expect(await waitForBlockedAdvisoryLock(5_000), "B never waited on A's lock — the persist is not inside the locked debit transaction").toBe(true);
    // A's debit is not visible from outside: it has not committed.
    expect((await inferenceDebits()).filter((d) => d.refId === a)).toHaveLength(0);
    releasePersist();
    expect(await runA).toBeInstanceOf(Error);
    await runB;
    // A's refused write rolled A's debit back; B's committed.
    expect((await inferenceDebits()).filter((d) => d.refId === a)).toHaveLength(0);
    expect((await inferenceDebits()).filter((d) => d.refId === b)).toHaveLength(1);
  }, 60_000);

  it("the same attempt id cannot be debited twice, even from two connections", async () => {
    // `credit_ledger_inference_debit_uq` is the durable half of the
    // double-submit story that the pending-disabled button only narrows.
    await grant(REBUILD_COST * 6);
    await run(`att-first-${n}`, fastProvider());
    await prewarmPool(4);

    const id = `att-dup-${n}`;
    const results = await Promise.allSettled([
      run(id, fastProvider()),
      run(id, fastProvider()),
    ]);

    const debits = (await inferenceDebits()).filter((d) => d.refId === id);
    expect(
      debits.length,
      "one attempt id must carry at most ONE debit, whatever the callers did"
    ).toBeLessThanOrEqual(1);
    // At least one caller got an answer; the property is about the ledger, not
    // about which caller won.
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  }, 60_000);

  // ------------------------------------- THE RUN SLOT (tech-spec S6, BLOCK 4)
  //
  // The bound that did not exist until 2026-08-28. `pgRunSlots` is a counting
  // semaphore over N session advisory locks, and a session lock lives on a
  // CONNECTION -- so this is the one property in the whole slice that PGlite
  // could not have expressed even in principle.
  //
  // Both directions are asserted in every case. A semaphore that refuses
  // everything bounds vendor spend perfectly and is also a total outage, so
  // "the second one was refused" on its own is not evidence of anything.

  it("REFUSES the second concurrent run at limit 1, and ALLOWS it at limit 2", async () => {
    await prewarmPool(4);
    const slots = pgRunSlots(harness.pool);

    // LIMIT 1: hold the only slot, then ask for another from a second
    // connection. The holder is a real lease on a real connection, not a stub.
    const held = await slots.acquire(ws, 1);
    expect(held.granted, "the first run gets the only slot").toBe(true);
    const refused = await slots.acquire(ws, 1);
    expect(refused.granted, "the second run is refused at limit 1").toBe(false);
    if (!refused.granted) expect(refused.reason).toBe("workspace_limit");

    // LIMIT 2: the SAME held lease, the SAME workspace, one more slot -- so the
    // only thing that changed is the number. Without this half the case would
    // pass against an `acquire` that always refuses.
    const second = await slots.acquire(ws, 2);
    expect(second.granted, "a second slot exists at limit 2").toBe(true);
    const third = await slots.acquire(ws, 2);
    expect(third.granted, "but only two of them").toBe(false);

    if (held.granted) await held.lease.release();
    if (second.granted) await second.lease.release();

    // ...and once released, limit 1 grants again. A lease that never came back
    // would shrink the workspace forever, which is the leak `finally` exists
    // for -- asserted here against the real lock rather than against a counter.
    const afterRelease = await slots.acquire(ws, 1);
    expect(afterRelease.granted, "the slot came back").toBe(true);
    if (afterRelease.granted) await afterRelease.lease.release();
  }, 60_000);

  it("the SERVER_CAPACITY valve works against a real exhausted pool", async () => {
    // THE TEST `isRunSlotCapacityError`'s DOCBLOCK CLAIMED AND DID NOT HAVE.
    // All four round-2 reviewers found the same thing independently: the
    // comment asserted "the Docker suite exhausts a real pool and asserts this
    // function returns true for what the installed library actually throws",
    // and no such test existed. Golden rule 1 — a claim recorded is verified in
    // the action that records it.
    //
    // IT MATTERS BECAUSE THE MATCH IS A STRING COMPARE against a third-party
    // message with no `code` and no subclass to test. If upstream reworded it,
    // `acquire` would rethrow instead of refusing, `billingErrorCode` would
    // fall through to `unknown`, and every at-capacity refusal would render
    // "Something went wrong" on the spend path — silently.
    //
    // A REAL `createRunSlotPool`, not the harness's drizzle pool: the harness
    // pool has neither `max` nor a connect timeout, so nothing about the
    // capacity branch could be exercised through it.
    const tiny = createRunSlotPool(harness.url, 1);
    try {
      const slots = pgRunSlots(tiny);
      const held = await slots.acquire(ws, 4);
      expect(held.granted, "the one connection is taken").toBe(true);

      // The pool now has no connection left, so this cannot even ASK about a
      // lock — a different refusal from "every slot key is held", and the
      // reason must say so.
      const refused = await slots.acquire(ws, 4);
      expect(refused.granted).toBe(false);
      if (!refused.granted) {
        expect(
          refused.reason,
          "an exhausted POOL is server capacity, not the workspace's own limit"
        ).toBe("server_capacity");
      }

      // ...and the classifier really does recognise what the INSTALLED library
      // throws, rather than a string we wrote down once and never checked.
      const raw = await tiny.connect().then(
        () => null,
        (e: unknown) => e
      );
      expect(raw, "the pool really is exhausted").toBeInstanceOf(Error);
      expect(
        isRunSlotCapacityError(raw),
        `pg-pool's connect-timeout message changed: ${(raw as Error).message}`
      ).toBe(true);

      // BOTH DIRECTIONS. Without this the case passes against an `acquire`
      // hard-wired to report capacity forever.
      if (held.granted) await held.lease.release();
      const after = await slots.acquire(ws, 4);
      expect(after.granted, "the pool recovers once the lease is released").toBe(
        true
      );
      if (after.granted) await after.lease.release();
    } finally {
      await tiny.end();
    }
  }, 60_000);

  it("an UNRECOGNISED connect error is rethrown, never treated as capacity", async () => {
    // FAIL-CLOSED, asserted rather than argued. The matcher is a string
    // compare, so the question that matters is what happens when it does NOT
    // match: the operation must end with an error and no vendor call, never
    // with a granted slot. A reworded upstream message must cost an unmapped
    // refusal, not an unbounded spend.
    const broken = {
      connect: () => Promise.reject(new Error("some other connection failure")),
    } as unknown as Parameters<typeof pgRunSlots>[0];
    await expect(pgRunSlots(broken).acquire(ws, 2)).rejects.toThrow(
      "some other connection failure"
    );
    // ...and the two messages that DO map are recognised, so this case is not
    // just asserting that everything throws.
    expect(
      isRunSlotCapacityError(new Error("timeout exceeded when trying to connect"))
    ).toBe(true);
    expect(
      isRunSlotCapacityError(
        new Error("Connection terminated due to connection timeout")
      )
    ).toBe(true);
  }, 60_000);

  it("release DROPS THE LOCK, not just the connection", async () => {
    // FOUND BY A SURVIVING MUTATION, not by reading the code. Replacing the
    // `pg_advisory_unlock` call with a query that merely reports success left
    // every other case in this file GREEN -- because a session lock is
    // RE-ENTRANT, so when the pool happened to hand the next acquire the same
    // connection, the leaked lock was invisible and the slot appeared to come
    // back. It only bites when the pool hands out a different connection, which
    // is a coin flip in a test and a certainty in production.
    //
    // So the assertion is about THE LOCK, not about a later acquire succeeding:
    // a proxy that the leak can slip past is not a control. `pg_locks` is
    // Postgres's own answer to "is this held", filtered to THIS database so a
    // parallel suite's locks cannot mask or fake the result.
    const advisoryLocks = async (): Promise<number> => {
      const { rows } = await harness.pool.query(
        `SELECT count(*)::int AS n FROM pg_locks
           WHERE locktype = 'advisory'
             AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`
      );
      return (rows[0] as { n: number }).n;
    };

    await prewarmPool(4);
    const slots = pgRunSlots(harness.pool);
    const before = await advisoryLocks();

    const lease = await slots.acquire(ws, 1);
    expect(lease.granted).toBe(true);
    expect(
      await advisoryLocks(),
      "holding a slot must be visible as a real advisory lock"
    ).toBe(before + 1);

    if (lease.granted) await lease.lease.release();
    expect(
      await advisoryLocks(),
      "the lock is GONE after release -- a connection returned to the pool still holding one silently consumes that slot forever"
    ).toBe(before);
  }, 60_000);

  it("the slot is scoped to the WORKSPACE - one workspace at its limit does not block another", async () => {
    // TENANCY. A key that collided across workspaces would be a cross-tenant
    // denial of service: one busy workspace silently stopping every other one.
    await prewarmPool(4);
    const slots = pgRunSlots(harness.pool);
    const otherUser = `race_user_slot_${n}`;
    await seedAuthUser(harness.db, otherUser, `${otherUser}@test.dev`);
    await ensureUserWorkspace(harness.db, {
      authUserId: otherUser,
      name: "Other",
    });
    const other = await withWorkspace(harness.db, { authUserId: otherUser });
    expect(other.workspaceId).not.toBe(ws);

    const mine = await slots.acquire(ws, 1);
    expect(mine.granted).toBe(true);
    const theirs = await slots.acquire(other.workspaceId, 1);
    expect(theirs.granted, "a different workspace is unaffected").toBe(true);
    if (mine.granted) await mine.lease.release();
    if (theirs.granted) await theirs.lease.release();

    // The keys are DIFFERENT STRINGS, asserted directly: the isolation above
    // holds because of this, and a future refactor that dropped the workspace
    // id from the key would pass neither.
    expect(runSlotKeyName(ws, 0)).not.toBe(runSlotKeyName(other.workspaceId, 0));
  }, 60_000);

  it("runInference REFUSES a real second concurrent run while the first holds the vendor", async () => {
    // END TO END, and this is the case that actually reproduces BLOCK 4. Two
    // concurrent FIRST-EVER presses on a fresh Free workspace: the pre-call
    // balance read is skipped entirely at `preCallCost === 0`, so before the
    // slot existed BOTH reached Anthropic. The provider holds, so the second
    // press arrives while the first is genuinely mid-call.
    //
    // THE LIMIT IS LOWERED TO 1 FOR THIS CASE, and the first draft of it did
    // not do that and FAILED -- correctly. The shipped Free limit is 2, so two
    // concurrent runs are ALLOWED by design and the second press reached the
    // vendor exactly as the product intends. Lowering the limit is what makes
    // the refusal reachable at all; the "allowed at 2" direction is the case
    // above, on the real locks.
    await prewarmPool(4);
    const { content } = await getActiveConfig(harness.db);
    await appendConfigVersion(
      harness.db,
      {
        ...content,
        concurrencyLimits: { ...content.concurrencyLimits, free: 1 },
      },
      "test"
    );
    const slots = pgRunSlots(harness.pool);
    const held = heldProvider();

    const first = runInference(
      harness.db,
      owner,
      profileId,
      held.provider,
      slots,
      { attemptId: "slot-a", system: "s", prompt: "p", promptBundleVersion: "test-bundle" },
      new Date()
    );
    // DETERMINISTIC, not a sleep: the second press is not made until the first
    // is provably inside the vendor call and therefore provably holding a slot.
    await held.inFlight;

    let second: unknown;
    try {
      second = await runInference(
        harness.db,
        owner,
        profileId,
        // THROWS IF INVOKED, so "the second run never reached the vendor" is
        // the stub's own refusal rather than an assertion about a call count.
        {
          vendor: "must-not-be-called",
          complete: async () => {
            throw new Error(
              "THE VENDOR WAS CALLED for the run that had no slot."
            );
          },
        },
        slots,
        { attemptId: "slot-b", system: "s", prompt: "p", promptBundleVersion: "test-bundle" },
        new Date()
      ).catch((e: unknown) => e);
    } finally {
      // RELEASED HERE, NOT AFTER THE ASSERTIONS. A failing assertion below
      // would otherwise leave `first` parked inside the held provider forever,
      // holding its slot connection -- and `afterAll`'s `pool.end()` then hangs
      // until the hook times out, which is what the first run of this case did:
      // one real failure reported as two, the second of them meaningless.
      held.release();
      await first;
    }

    expect(second).toBeInstanceOf(RunSlotBusyError);
    expect((second as RunSlotBusyError).reason).toBe("workspace_limit");
    // The refusal's two claims, checked against the database rather than
    // trusted: no spend record for the refused attempt, and no debit.
    const usageRows = await harness.db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.attemptId, "slot-b"));
    expect(usageRows, "a refused run writes no spend record").toHaveLength(0);
    expect(held.callCount(), "exactly one run reached the vendor").toBe(1);

    // AND THE SLOT CAME BACK: the same press that was just refused now goes
    // through. Without this the case cannot tell a working semaphore from one
    // that refuses everything after the first run forever.
    //
    // GRANTED FIRST, because the first run consumed this profile's included
    // build, so the third is a PRICED rebuild. Without the grant it is refused
    // for credits and this assertion would say nothing about the slot -- which
    // is how the first draft failed, on the right control for the wrong reason.
    await grant(REBUILD_COST);
    const third = await runInference(
      harness.db,
      owner,
      profileId,
      fastProvider(),
      slots,
      { attemptId: "slot-c", system: "s", prompt: "p", promptBundleVersion: "test-bundle" },
      new Date()
    );
    expect(third.attemptId).toBe("slot-c");
  }, 60_000);
});
