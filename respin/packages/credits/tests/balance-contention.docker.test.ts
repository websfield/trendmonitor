// A PAGE RENDER NEVER BLOCKS ON THE MONEY LOCK (audit Phase 8, P8-R1, P8-A2,
// R-177) — on REAL Postgres, because the whole subject is two connections.
//
//   AC1  a billing lock held past the render budget does not fail a render:
//        the committed fold renders with `settling: true`, in well under the
//        budget — and so does the branch where the try-lock SUCCEEDED and a
//        row lock inside the mint met `lock_timeout` (55P03).
//   AC2  a render transaction that would wait unboundedly refuses at 5 000 ms
//        with the named code; THE NON-VACUITY PROBE: the same wait in a plain
//        transaction is still waiting at 6 000 ms. THE LEAK TEST: the next
//        transaction on the same pooled connection reads the default
//        `lock_timeout`, and a planted bare `SET` turns that check red. THE
//        SCAN: no direct `getBalance(` under `app/(product)/**`, and every
//        `withRenderTransaction(` in `packages/credits` is `getDisplayBalance`'s.
//   AC8  the committed fold is `foldLedger`'s answer, emits `settling: true`,
//        and writes nothing.
//   AC12 a debit committed while `/usage`'s runway snapshot is open leaves every
//        later fold working (no `materialization drifted`), and
//        `deriveBalanceInTx` inside REPEATABLE READ refuses.
//
// Ordering is by barriers and `pg_locks`, never by sleeps. The two timed
// assertions (5 000 / 6 000 ms) measure the budget itself.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  createDockerTestDb,
  creditLedger,
  LOCK_NOT_AVAILABLE_SQLSTATE,
  RENDER_LOCK_TIMEOUT_MS,
  RenderLockTimeoutError,
  schema,
  seedAuthUser,
  seedDb,
  ensureUserWorkspace,
  withRenderTransaction,
  withWorkspace,
  trustWorkspaceId,
  type DbLike,
  type VerifiedWorkspaceId,
} from "@respin/db";
import {
  committedFoldInTx,
  deriveBalance,
  deriveBalanceInTx,
  freeAllowancePeriodKey,
  freeAllowanceExpiry,
  getDisplayBalance,
} from "../src/balance";
import { takeWorkspaceLock } from "../src/clock";
import { debitCredits } from "../src/ledger";
import { BalanceIsolationError } from "../src/errors";
import { setFoldMetricSink, type FoldMetric } from "../src/metrics";
import {
  USAGE_RUNWAY_READERS,
  usageRunwayForWithReaders,
} from "../src/days-to-empty";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[balance-contention.docker.test] SKIPPED - TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that a product page's balance read never waits on a held " +
      "billing lock (AC1), that a render transaction stops at lock_timeout = 5000 ms while a " +
      "plain one is still waiting at 6000 ms, that SET LOCAL does not leak to the pooled " +
      "connection's next transaction (AC2), and that a debit committed during /usage's runway " +
      "snapshot leaves later folds working (AC12). The source scan below still runs."
  );
}

const HOUR = 3_600_000;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!MAINTENANCE_URL)("the render path under a held money lock, on REAL Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let n = 0;

  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_balcontention");
    await seedDb(harness.db);
  }, 60_000);

  afterAll(async () => {
    setFoldMetricSink(null);
    await harness?.pool.end();
  });

  /** A Free workspace with a 100-credit grant committed (and this month's mint written). */
  async function fundedWorkspace(): Promise<VerifiedWorkspaceId> {
    n += 1;
    const [w] = await harness.db.insert(schema.workspaces).values({ name: `C${n}` }).returning();
    const ws = trustWorkspaceId(w.id);
    await harness.db.insert(creditLedger).values({
      workspaceId: ws,
      delta: 100,
      kind: "grant",
      expiresAt: new Date(Date.now() + 30 * 24 * HOUR),
      refType: "test",
      refId: `grant-${n}`,
    });
    // Settle once so the month's Free mint exists; later reads compare like with like.
    await deriveBalance(harness.db, ws);
    return ws;
  }

  /** Hold the workspace's billing lock in its own transaction until released. */
  function holdBillingLock(ws: VerifiedWorkspaceId): { held: Promise<void>; release: () => void; done: Promise<void> } {
    const held = deferred();
    const release = deferred();
    const done = harness.db.transaction(async (tx) => {
      await takeWorkspaceLock(tx, ws);
      held.resolve();
      await release.promise;
    });
    return { held: held.promise, release: release.resolve, done };
  }

  async function waitForWaiter(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const r = await harness.pool.query<{ waiting: number }>(
        "SELECT count(*)::int AS waiting FROM pg_locks WHERE pid = $1 AND NOT granted",
        [pid]
      );
      if ((r.rows[0]?.waiting ?? 0) > 0) return;
      await new Promise((r2) => setTimeout(r2, 10));
    }
    throw new Error(`backend ${pid} never waited on a lock`);
  }

  it(
    "AC1: with the billing lock held, the display read returns the COMMITTED FOLD, settling, without waiting",
    { timeout: 30_000 },
    async () => {
      const ws = await fundedWorkspace();
      const settled = await getDisplayBalance(harness.db, ws);
      expect(settled.settling).toBe(false);

      const holder = holdBillingLock(ws);
      await holder.held;
      const metrics: FoldMetric[] = [];
      setFoldMetricSink((m) => metrics.push(m));
      const started = Date.now();
      const view = await getDisplayBalance(harness.db, ws);
      const elapsed = Date.now() - started;
      setFoldMetricSink(null);
      holder.release();
      await holder.done;

      expect(view.settling).toBe(true);
      // The committed rows' balance: the same number the settled read gave.
      expect(view.balance).toBe(settled.balance);
      // Not a wait of any length: far under the 5 000 ms budget.
      expect(elapsed).toBeLessThan(1_000);
      // AC8 (iv): measured by construction, flagged as a settling fold.
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({ workspaceId: ws, settling: true });
    }
  );

  it(
    "AC1: the try-lock SUCCEEDED and the Free mint met a row lock past the budget — 55P03 is caught, the committed fold renders settling, never null",
    { timeout: 30_000 },
    async () => {
      n += 1;
      const [w] = await harness.db.insert(schema.workspaces).values({ name: `M${n}` }).returning();
      const ws = trustWorkspaceId(w.id);
      // ANOTHER TRANSACTION HOLDS THIS MONTH'S MINT ROW, UNCOMMITTED, WITHOUT
      // the billing lock: the display read's own mint then waits on the
      // partial unique index (`credit_ledger_free_allowance_uq`) — a row lock
      // inside the derive, after a successful try-lock.
      const inserted = deferred();
      const release = deferred();
      const blocker = harness.db.transaction(async (tx) => {
        const now = new Date();
        await tx.insert(creditLedger).values({
          workspaceId: ws,
          delta: 25,
          kind: "grant",
          expiresAt: freeAllowanceExpiry(now),
          refType: "free_allowance",
          refId: freeAllowancePeriodKey(now),
          configVersion: 1,
        });
        inserted.resolve();
        await release.promise;
        throw new Error("rolled back on purpose");
      }).catch(() => undefined);
      await inserted.promise;

      const started = Date.now();
      const view = await getDisplayBalance(harness.db, ws);
      const elapsed = Date.now() - started;
      release.resolve();
      await blocker;

      expect(view.settling).toBe(true);
      expect(view.balance).toBe(0);
      // It waited for the budget (that IS the row lock), and not much more.
      expect(elapsed).toBeGreaterThanOrEqual(RENDER_LOCK_TIMEOUT_MS - 200);
      expect(elapsed).toBeLessThan(RENDER_LOCK_TIMEOUT_MS + 3_000);
    }
  );

  it(
    "gate M3: the FALLBACK for A, with A's billing lock held, ignores B's open pause — A's expired lot stays out of the settling number",
    { timeout: 30_000 },
    async () => {
      n += 1;
      const [wa] = await harness.db.insert(schema.workspaces).values({ name: `PA${n}` }).returning();
      const [wb] = await harness.db.insert(schema.workspaces).values({ name: `PB${n}` }).returning();
      const A = trustWorkspaceId(wa.id);
      const B = trustWorkspaceId(wb.id);
      const now = Date.now();
      await harness.db.insert(creditLedger).values([
        { workspaceId: A, delta: 40, kind: "grant", createdAt: new Date(now - 48 * HOUR), expiresAt: new Date(now - HOUR), refType: "test", refId: `pa-expired-${n}` },
        { workspaceId: A, delta: 7, kind: "grant", createdAt: new Date(now - 48 * HOUR), expiresAt: new Date(now + 24 * HOUR), refType: "test", refId: `pa-live-${n}` },
      ]);
      await harness.db.insert(schema.pausePeriods).values({ workspaceId: B, startedAt: new Date(now - 47 * HOUR) });
      const holder = holdBillingLock(A);
      await holder.held;
      const view = await getDisplayBalance(harness.db, A);
      holder.release();
      await holder.done;
      expect(view.settling).toBe(true);
      // The live lot only. (A Free mint is never in a fallback: it is skipped.)
      expect(view.balance).toBe(7);
      expect(view.lots.every((l) => l.frozen === false)).toBe(true);
    }
  );

  it(
    "AC2: a render transaction refuses at lock_timeout = 5000 ms with the named code; the SAME wait in a plain transaction is still waiting at 6000 ms",
    { timeout: 40_000 },
    async () => {
      const ws = await fundedWorkspace();
      const holder = holdBillingLock(ws);
      await holder.held;

      // The render transaction, waiting on the held key.
      const started = Date.now();
      const refused = await withRenderTransaction(harness.db, (tx) => takeWorkspaceLock(tx, ws)).then(
        () => null,
        (e: unknown) => e
      );
      const elapsed = Date.now() - started;
      expect(refused).toBeInstanceOf(RenderLockTimeoutError);
      expect((refused as RenderLockTimeoutError).code).toBe("render_lock_timeout");
      expect(elapsed).toBeGreaterThanOrEqual(RENDER_LOCK_TIMEOUT_MS - 100);
      expect(elapsed).toBeLessThan(RENDER_LOCK_TIMEOUT_MS + 2_000);

      // THE NON-VACUITY PROBE: no budget, so it is still waiting at 6 000 ms.
      let plainPid = 0;
      let plainFinished = false;
      const plain = harness.db
        .transaction(async (tx) => {
          const r = (await tx.execute(sql`SELECT pg_backend_pid() AS pid`)) as unknown as { rows: { pid: number }[] };
          plainPid = Number(r.rows[0].pid);
          await takeWorkspaceLock(tx, ws);
        })
        .then(() => {
          plainFinished = true;
        });
      while (plainPid === 0) await new Promise((r) => setTimeout(r, 5));
      await waitForWaiter(plainPid);
      await new Promise((r) => setTimeout(r, 6_000));
      const stillWaiting = await harness.pool.query<{ waiting: number }>(
        "SELECT count(*)::int AS waiting FROM pg_locks WHERE pid = $1 AND NOT granted",
        [plainPid]
      );
      expect(stillWaiting.rows[0].waiting).toBeGreaterThan(0);
      expect(plainFinished).toBe(false);

      holder.release();
      await holder.done;
      await plain;
      expect(plainFinished).toBe(true);
    }
  );

  it(
    "AC2 LEAK TEST: after a render transaction, the next transaction on the SAME pooled connection reads the default lock_timeout — and a planted bare SET is caught",
    { timeout: 30_000 },
    async () => {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      // ONE checked-out connection of the harness pool, so "the next
      // transaction" is the same session — the pooled-connection reuse the
      // leak would ride on.
      const single = await harness.pool.connect();
      const db = drizzle(single, { schema }) as unknown as DbLike;
      try {
        const nextLockTimeout = async (): Promise<string> => {
          const r = (await db.transaction((tx) => tx.execute(sql`SHOW lock_timeout`))) as unknown as {
            rows: { lock_timeout: string }[];
          };
          return r.rows[0].lock_timeout;
        };
        const defaultValue = await nextLockTimeout();
        expect(defaultValue).toBe("0");

        // Inside: the budget is set.
        const inside = await withRenderTransaction(db, async (tx) => {
          const r = (await tx.execute(sql`SHOW lock_timeout`)) as unknown as { rows: { lock_timeout: string }[] };
          return r.rows[0].lock_timeout;
        });
        expect(inside).toBe("5s");
        // After: gone.
        expect(await nextLockTimeout()).toBe(defaultValue);

        // THE PLANT: the same statement without LOCAL. The check above would
        // have read "5s" — which is the leak the helper's `LOCAL` prevents.
        await db.transaction((tx) => tx.execute(sql.raw(`SET lock_timeout = ${RENDER_LOCK_TIMEOUT_MS}`)));
        expect(await nextLockTimeout()).not.toBe(defaultValue);
        await single.query("RESET lock_timeout");
        expect(await nextLockTimeout()).toBe(defaultValue);
      } finally {
        single.release();
      }
    }
  );

  it(
    "AC12: a debit committed while /usage's runway snapshot is open leaves later folds working, and writes nothing from the stale snapshot",
    { timeout: 30_000 },
    async () => {
      n += 1;
      const user = `contention_user_${n}`;
      await seedAuthUser(harness.db, user, `${user}@test.dev`);
      await ensureUserWorkspace(harness.db, { authUserId: user, name: `R${n}` });
      const scope = await withWorkspace(harness.db, { authUserId: user });
      const ws = scope.workspaceId;
      // A lot about to expire, and one that is not.
      const soon = new Date(Date.now() + 2_500);
      await harness.db.insert(creditLedger).values([
        { workspaceId: ws, delta: 10, kind: "grant", expiresAt: soon, refType: "test", refId: `soon-${n}` },
        { workspaceId: ws, delta: 10, kind: "grant", expiresAt: new Date(Date.now() + 30 * 24 * HOUR), refType: "test", refId: `later-${n}` },
      ]);
      // Includes this month's Free mint, settled now, so every number below is relative.
      const initial = (await deriveBalance(harness.db, ws)).balance;

      // THE RUNWAY, PAUSED INSIDE ITS SNAPSHOT: its first statement (the clock)
      // has fixed the REPEATABLE READ snapshot; the barrier holds it there.
      const snapshotTaken = deferred();
      const resume = deferred();
      const runway = usageRunwayForWithReaders(harness.db, scope, {
        ...USAGE_RUNWAY_READERS,
        pause: async (tx, id) => {
          snapshotTaken.resolve();
          await resume.promise;
          return USAGE_RUNWAY_READERS.pause(tx, id);
        },
      });
      await snapshotTaken.promise;

      // A DEBIT COMMITS from another connection, consuming the soon-to-expire lot.
      await harness.db.transaction((tx) =>
        debitCredits(tx, {
          workspaceId: ws,
          cost: 5,
          refType: "test",
          refId: `debit-${n}`,
          at: new Date(),
          configVersion: 1,
        })
      );
      // ...and the soon lot's expiry instant passes before the runway folds.
      while (Date.now() <= soon.getTime() + 50) await new Promise((r) => setTimeout(r, 25));
      const rowsBefore = await harness.db.select().from(creditLedger).where(eq(creditLedger.workspaceId, ws));
      resume.resolve();
      const result = await runway;

      expect(result.state).not.toBe("read_unavailable");
      // The runway WROTE NOTHING from its stale snapshot.
      const rowsAfter = await harness.db.select().from(creditLedger).where(eq(creditLedger.workspaceId, ws));
      expect(rowsAfter.length).toBe(rowsBefore.length);
      // Every later fold works: the materialisation is written from a FRESH
      // read, so the expiry row claims the remainder that actually exists.
      // The debit took 5 of the soon lot (oldest expiry first); its other 5 expired.
      const later = await deriveBalance(harness.db, ws);
      expect(later.balance).toBe(initial - 5 - 5);
      const expiries = await harness.db
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.workspaceId, ws), eq(creditLedger.kind, "expiry")));
      expect(expiries.map((e) => e.delta)).toEqual([-5]);
      expect((await deriveBalance(harness.db, ws)).balance).toBe(initial - 10);
    }
  );

  it(
    "AC12: deriveBalanceInTx refuses a REPEATABLE READ transaction before any write; the committed fold does not need to",
    { timeout: 30_000 },
    async () => {
      const ws = await fundedWorkspace();
      const before = await harness.db.select().from(creditLedger).where(eq(creditLedger.workspaceId, ws));
      await expect(
        harness.db.transaction((tx) => deriveBalanceInTx(tx, ws), { isolationLevel: "repeatable read" })
      ).rejects.toBeInstanceOf(BalanceIsolationError);
      await expect(
        harness.db.transaction((tx) => deriveBalanceInTx(tx, ws), { isolationLevel: "serializable" })
      ).rejects.toBeInstanceOf(BalanceIsolationError);
      const pure = await harness.db.transaction((tx) => committedFoldInTx(tx, ws), {
        isolationLevel: "repeatable read",
      });
      expect(pure.balance).toBe((await deriveBalance(harness.db, ws)).balance);
      const after = await harness.db.select().from(creditLedger).where(eq(creditLedger.workspaceId, ws));
      expect(after.length).toBe(before.length);
    }
  );

  it("the SQLSTATE the helper maps is the one lock_timeout raises", () => {
    expect(LOCK_NOT_AVAILABLE_SQLSTATE).toBe("55P03");
  });
});

// ---------------------------------------------------------------- the scan
// Runs without Docker: it reads source, not a database.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir: string, exts: readonly string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(resolve(dir, e.name), exts)
      : exts.some((x) => e.name.endsWith(x))
        ? [resolve(dir, e.name)]
        : []
  );
}

const code = (src: string) =>
  src
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

/** Files under app/(product)/** that call the LOCKED balance read directly. */
function directGetBalanceCallers(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([, src]) => /respinCredits\.getBalance\(/.test(code(src)))
    .map(([rel]) => rel)
    .sort();
}

/** Every `withRenderTransaction(` call in packages/credits/src, by enclosing function. */
function renderTransactionCallers(files: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  for (const [rel, src] of Object.entries(files)) {
    const lines = code(src).split("\n");
    lines.forEach((line, i) => {
      if (!/\bwithRenderTransaction\(/.test(line)) return;
      let fn = "<module>";
      for (let j = i; j >= 0; j -= 1) {
        const m = lines[j].match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (m) {
          fn = m[1];
          break;
        }
      }
      out.push(`${rel}#${fn}`);
    });
  }
  return out.sort();
}

const read = (abs: string) => readFileSync(abs, "utf8");

describe("AC2 (d): the render path's reads, by scan", () => {
  const productFiles = Object.fromEntries(
    walk(resolve(ROOT, "app/(product)"), [".ts", ".tsx"]).map((abs) => [
      relative(ROOT, abs).replace(/\\/g, "/"),
      read(abs),
    ])
  );
  const creditsFiles = Object.fromEntries(
    walk(resolve(ROOT, "packages/credits/src"), [".ts"]).map((abs) => [
      relative(ROOT, abs).replace(/\\/g, "/"),
      read(abs),
    ])
  );

  it("the scan reads the tree (non-vacuity floor)", () => {
    expect(Object.keys(productFiles).length).toBeGreaterThan(20);
    expect(Object.keys(creditsFiles).length).toBeGreaterThan(20);
    // ...and the five former readers (and the layout) now call the ONE
    // per-request display read (gate M1).
    const displayCallers = Object.entries(productFiles)
      .filter(([, src]) => /\bdisplayBalanceFor\(/.test(code(src)))
      .map(([rel]) => rel)
      .sort();
    expect(displayCallers).toEqual([
      "app/(product)/layout.tsx",
      "app/(product)/onboarding/first-ideas/page.tsx",
      "app/(product)/onboarding/page.tsx",
      "app/(product)/studio/page.tsx",
      "app/(product)/usage/page.tsx",
    ]);
  });

  it("gate M1: the facade's display read is called from ONE file under app/(product), and that file memoises it per request with React's cache", () => {
    const facadeCallers = (files: Readonly<Record<string, string>>) =>
      Object.entries(files)
        .filter(([, src]) => /respinCredits\.getDisplayBalance\(/.test(code(src)))
        .map(([rel]) => rel)
        .sort();
    expect(facadeCallers(productFiles)).toEqual(["app/(product)/display-balance.ts"]);
    const wrapper = code(productFiles["app/(product)/display-balance.ts"]);
    expect(wrapper).toMatch(/import \{ cache \} from "react";/);
    expect(wrapper).toMatch(/export const displayBalanceFor = cache\(/);
    // PLANTED: a page calling the facade directly again (two reads per request) is red.
    const planted = {
      ...productFiles,
      "app/(product)/planted/page.tsx":
        "export default async function P() {\n  const v = await respinCredits.getDisplayBalance(scope.workspaceId);\n}\n",
    };
    expect(facadeCallers(planted)).toEqual([
      "app/(product)/display-balance.ts",
      "app/(product)/planted/page.tsx",
    ]);
  });

  it("ZERO direct respinCredits.getBalance( under app/(product)/**", () => {
    expect(directGetBalanceCallers(productFiles)).toEqual([]);
  });

  it("PLANTED: a page reverting to the locked read is red", () => {
    const planted = {
      ...productFiles,
      "app/(product)/planted/page.tsx":
        "export default async function P() {\n  const v = await respinCredits.getBalance(scope.workspaceId);\n}\n",
    };
    expect(directGetBalanceCallers(planted)).toEqual(["app/(product)/planted/page.tsx"]);
  });

  it("EXACTLY ONE withRenderTransaction( wrap in packages/credits, and it is getDisplayBalance's — the money path never runs under the render budget", () => {
    expect(renderTransactionCallers(creditsFiles)).toEqual([
      "packages/credits/src/balance.ts#getDisplayBalance",
    ]);
  });

  it("PLANTED: a money-path transaction wrapped in the render budget is red", () => {
    const planted = {
      ...creditsFiles,
      "packages/credits/src/planted.ts":
        "export async function settlePlanted(db) {\n  return withRenderTransaction(db, async (tx) => tx);\n}\n",
    };
    expect(renderTransactionCallers(planted)).toContain("packages/credits/src/planted.ts#settlePlanted");
  });
});
