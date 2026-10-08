// A PAGE RENDERS WHILE STRIPE HOLDS THE LOCK (audit Phase 8, P8-A3 + P8-R1,
// AC13; register 2026-10-05 item 12) — on REAL Postgres, through the REAL
// product layout and `/studio` page.
//
// Before Phase 8 every guarded read and every page's bootstrap took the
// EXCLUSIVE membership-graph lock, and the webhook dispatcher held that same
// lock — and the billing lock — across its Stripe calls (up to
// `STRIPE_MAX_CALL_WINDOW_MS` each). One slow Stripe answer therefore queued
// every page render of the workspace behind it, each holding a pooled
// connection, with no bound.
//
// Here a webhook dispatch's Stripe call (`subscriptions.retrieve`) is held on a
// barrier — it holds the membership lock (now SHARED) and the billing lock
// for as long as the test says — and meanwhile `/studio` renders through
// `ensureUserWorkspace`'s no-mint path, the lifecycle-guarded reads and the
// display balance's committed fold, well inside the 5 000 ms render budget,
// with the rail marked "may change". Then the three lock cases the reader/writer
// split rests on: two shared readers proceed together; a reader waits behind an
// exclusive (deletion-shaped) writer; and inside a render transaction that
// wait is bounded.
//
// Only the session (`requireUser`) and the Stripe client are stubbed.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@respin/auth", () => ({ requireUser: gate.requireUser, requireAdmin: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/studio",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  // The refusal paths (gate M2) call `rethrowNextControlFlow` first; nothing
  // here throws a Next control-flow signal, so it returns.
  unstable_rethrow: () => {},
}));

// REACT'S PER-REQUEST `cache`, STOOD IN FOR (gate M1). Under Next's RSC build
// `cache` memoises per server request; the node build vitest resolves is a
// pass-through (`react/cjs/react.development.js`: `return fn.apply(null,
// arguments)`, read 2026-10-07). So a test "request" is modelled here: a
// memoising `cache` whose store `newRequest()` replaces, and `passThrough`
// switches it off to show what one request does WITHOUT the dedupe.
const requestCache = vi.hoisted(() => ({
  store: new Map<unknown, Map<string, unknown>>(),
  passThrough: false,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (requestCache.passThrough) return fn(...args);
      let byArgs = requestCache.store.get(fn);
      if (!byArgs) requestCache.store.set(fn, (byArgs = new Map()));
      const key = JSON.stringify(args);
      if (!byArgs.has(key)) byArgs.set(key, fn(...args));
      return byArgs.get(key) as R;
    };
  return { ...actual, default: actual, cache };
});
function newRequest(): void {
  requestCache.store = new Map();
}

const stripeHold = vi.hoisted(() => {
  let enter!: () => void;
  let release!: () => void;
  const state = {
    entered: new Promise<void>((r) => (enter = r)),
    released: new Promise<void>((r) => (release = r)),
    snapshot: null as unknown,
    calls: 0,
  };
  return { state, enter: () => enter(), release: () => release() };
});

vi.mock("../packages/credits/src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../packages/credits/src/stripe/adapter")>()),
  getStripe: () => ({
    subscriptions: {
      // THE HELD STRIPE CALL: entered with both workspace locks held.
      retrieve: async () => {
        stripeHold.state.calls += 1;
        stripeHold.enter();
        await stripeHold.state.released;
        return stripeHold.state.snapshot;
      },
    },
  }),
}));

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
if (!MAINTENANCE_URL) {
  console.warn(
    "[render-under-stripe-lock.docker.test] SKIPPED - TEST_DATABASE_URL is not set. NOT PROVEN in this run: " +
      "that /studio renders while a webhook holds the workspace's membership and billing locks across a Stripe " +
      "call, nor the shared/exclusive lock cases. Set TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const DB_NAME = "respin_test_renderlock";
const USER = "render_lock_user";

describe.skipIf(!MAINTENANCE_URL)("a page renders while Stripe holds the workspace locks (AC13)", () => {
  let harness: Awaited<ReturnType<typeof import("@respin/db")["createDockerTestDb"]>>;
  let ws = "" as unknown as import("@respin/db").VerifiedWorkspaceId;
  let mirrorAt = new Date();

  beforeAll(async () => {
    const dbMod = await import("@respin/db");
    harness = await dbMod.createDockerTestDb(MAINTENANCE_URL as string, DB_NAME);
    await dbMod.seedDb(harness.db);
    const url = new URL(MAINTENANCE_URL as string);
    url.pathname = `/${DB_NAME}`;
    // The SERVER's own environment, as the page reads it.
    process.env.DATABASE_URL = url.toString();
    const config = await import("@respin/config");
    const { content } = await config.getActiveConfig(harness.db);
    await config.appendConfigVersion(harness.db, { ...content, stripePriceMap: { price_creator: "creator" } }, "render-lock");

    await dbMod.seedAuthUser(harness.db, USER, `${USER}@test.dev`);
    await dbMod.ensureUserWorkspace(harness.db, { authUserId: USER, name: "Render" });
    const scope = await dbMod.withWorkspace(harness.db, { authUserId: USER });
    ws = scope.workspaceId;
    const { createProfile } = await import("../packages/credits/src/profiles");
    await createProfile(harness.db, scope, "Lee", new Date());
    const { grantCredits } = await import("../packages/credits/src/ledger");
    await harness.db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: ws,
        amount: 120,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test",
        refId: "render-grant",
        configVersion: 1,
      })
    );
    mirrorAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await harness.db.insert(dbMod.subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_render",
      stripeSubscriptionId: "sub_render",
      stripePriceId: "price_creator",
      status: "active",
      mirrorEventAt: mirrorAt,
      cancelAtPeriodEnd: false,
    });
    gate.requireUser.mockResolvedValue({ id: USER, name: "Render" });
  }, 120_000);

  afterAll(async () => {
    stripeHold.release();
    await harness?.pool.end();
  });

  /**
   * Advisory locks held (granted) or waited on (not granted) in THIS test's
   * database. pg_locks is server-wide, and the live harness runs other suites'
   * databases on the same server at the same time.
   */
  async function advisory(granted: boolean): Promise<number> {
    const r = await harness.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted = $1 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
      [granted]
    );
    return r.rows[0].n;
  }

  it(
    "/studio renders — bootstrap, guarded reads, display balance — while a webhook's Stripe call holds both locks",
    { timeout: 120_000 },
    async () => {
      const { handleStripeEvent } = await import("../packages/credits/src/stripe/webhooks");
      const created = Math.floor(mirrorAt.getTime() / 1000);
      const sub = {
        id: "sub_render", object: "subscription", customer: "cus_render",
        status: "active", cancel_at_period_end: true, cancel_at: null, pause_collection: null,
        items: { object: "list", data: [{
          id: "si_render", object: "subscription_item",
          price: { id: "price_creator", object: "price" },
          current_period_start: created, current_period_end: created + 30 * 86400,
        }] },
      };
      stripeHold.state.snapshot = sub;
      const webhook = handleStripeEvent(harness.db, {
        id: "evt_render_lock", object: "event", type: "customer.subscription.updated",
        api_version: "x", created, livemode: false, pending_webhooks: 0, request: null,
        data: { object: sub },
      } as never);
      // THE WEBHOOK IS INSIDE STRIPE, holding the membership lock (shared) and
      // the billing lock (exclusive) — two granted advisory locks, nobody waiting.
      await stripeHold.state.entered;
      expect(stripeHold.state.calls).toBe(1);
      expect(await advisory(true)).toBeGreaterThanOrEqual(2);

      const { renderToStaticMarkup } = await import("react-dom/server");
      const ProductLayout = (await import("../app/(product)/layout")).default;
      const StudioPage = (await import("../app/(product)/studio/page")).default;
      const started = Date.now();
      // BOUNDED, so a render that queues behind the webhook fails in seconds
      // with its own message rather than at the test's timeout: a blocked
      // render would otherwise wait for a Stripe stub only this test releases.
      const RENDER_DEADLINE_MS = 15_000;
      newRequest();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const html = await Promise.race([
        (async () => {
          const page = await StudioPage({ searchParams: Promise.resolve({}) });
          return renderToStaticMarkup(await ProductLayout({ children: page }));
        })(),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => {
            stripeHold.release();
            reject(new Error(`/studio did not render within ${RENDER_DEADLINE_MS} ms while the webhook held its locks — it queued behind them`));
          }, RENDER_DEADLINE_MS);
        }),
      ]).finally(() => clearTimeout(deadline));
      const elapsed = Date.now() - started;
      console.info(`[AC13] /studio + layout rendered in ${elapsed} ms while the webhook held both locks inside Stripe`);

      // Still held: the render did not wait for the webhook to finish.
      expect(stripeHold.state.calls).toBe(1);
      const { RENDER_LOCK_TIMEOUT_MS } = await import("@respin/db");
      expect(elapsed, `rendered in ${elapsed} ms under the held Stripe call`).toBeLessThan(RENDER_LOCK_TIMEOUT_MS);
      // The rail rendered the committed fold, marked "may change" — not null.
      expect(html).toContain('data-testid="shell-credits"');
      expect(html).toMatch(/120 credits \(may change\)/);
      expect(html).toContain('data-settling="true"');
      // /studio's own cost sentence carries the same indication and no refusal
      // (AC1): the page read the committed fold too, and decided nothing from it.
      expect(html).toMatch(/120 credits for now — it was read without waiting for other activity on your workspace/);
      expect(html).not.toMatch(/not enough credits|insufficient/i);
      // ...and nobody queued behind the webhook while it held its locks.
      expect(await advisory(false)).toBe(0);

      stripeHold.release();
      await webhook;
      // Once released, the next render (a new request) reads the SETTLED balance.
      newRequest();
      const settledHtml = renderToStaticMarkup(
        await ProductLayout({ children: await StudioPage({ searchParams: Promise.resolve({}) }) })
      );
      expect(settledHtml).not.toContain('data-settling="true"');
    }
  );

  it("gate L6: bootstrap's no-mint path holds its advisory locks as ShareLock in pg_locks — exactly two, none exclusive; the mint path's show ExclusiveLock", { timeout: 30_000 }, async () => {
    const db = await import("@respin/db");
    /** Hold a bootstrap transaction open and read its advisory locks from another connection. */
    const modesIn = async (mode: "shared" | "exclusive"): Promise<string[]> => {
      let inside!: () => void;
      const entered = new Promise<void>((r) => (inside = r));
      let release!: () => void;
      const released = new Promise<void>((r) => (release = r));
      const held = harness.db.transaction(async (tx) => {
        await db.bootstrapInTx(tx, { authUserId: USER }, mode);
        inside();
        await released;
      });
      await entered;
      const r = await harness.pool.query<{ mode: string }>(
        "SELECT mode FROM pg_locks WHERE locktype = 'advisory' AND granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) ORDER BY mode"
      );
      release();
      await held;
      return r.rows.map((row) => row.mode);
    };
    expect(await advisory(true)).toBe(0);
    expect(await modesIn("shared")).toEqual(["ShareLock", "ShareLock"]);
    // Non-vacuity: the same view reports the exclusive form when it is taken.
    const exclusive = await modesIn("exclusive");
    expect(exclusive).toContain("ExclusiveLock");
    expect(exclusive).not.toContain("ShareLock");
  });

  it("two SHARED readers hold the membership lock together", { timeout: 30_000 }, async () => {
    const { lockWorkspaceMembershipGraph } = await import("@respin/db");
    let firstHolds!: () => void;
    const held = new Promise<void>((r) => (firstHolds = r));
    let releaseFirst!: () => void;
    const release = new Promise<void>((r) => (releaseFirst = r));
    const first = harness.db.transaction(async (tx) => {
      await lockWorkspaceMembershipGraph(tx, ws, "shared");
      firstHolds();
      await release;
    });
    await held;
    const started = Date.now();
    await harness.db.transaction((tx) => lockWorkspaceMembershipGraph(tx, ws, "shared"));
    expect(Date.now() - started).toBeLessThan(1_000);
    releaseFirst();
    await first;
  });

  it("a reader WAITS behind an exclusive (deletion-shaped) writer — and inside a render transaction the wait is bounded", { timeout: 40_000 }, async () => {
    const { lockWorkspaceMembershipGraph, withRenderTransaction, RenderLockTimeoutError, RENDER_LOCK_TIMEOUT_MS } =
      await import("@respin/db");
    let writerHolds!: () => void;
    const held = new Promise<void>((r) => (writerHolds = r));
    let releaseWriter!: () => void;
    const release = new Promise<void>((r) => (releaseWriter = r));
    const writer = harness.db.transaction(async (tx) => {
      await lockWorkspaceMembershipGraph(tx, ws, "exclusive");
      writerHolds();
      await release;
    });
    await held;
    // An unbounded reader is queued, not admitted.
    let readerDone = false;
    const reader = harness.db
      .transaction((tx) => lockWorkspaceMembershipGraph(tx, ws, "shared"))
      .then(() => {
        readerDone = true;
      });
    for (let i = 0; i < 300 && (await advisory(false)) === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(await advisory(false)).toBe(1);
    expect(readerDone).toBe(false);
    // A reader inside the render budget stops at 5 000 ms with the named code.
    const started = Date.now();
    const refused = await withRenderTransaction(harness.db, (tx) => lockWorkspaceMembershipGraph(tx, ws, "shared")).then(
      () => null,
      (e: unknown) => e
    );
    expect(refused).toBeInstanceOf(RenderLockTimeoutError);
    expect(Date.now() - started).toBeGreaterThanOrEqual(RENDER_LOCK_TIMEOUT_MS - 100);
    releaseWriter();
    await writer;
    await reader;
    expect(readerDone).toBe(true);
  });
  it(
    "gate M1: on an IDLE workspace the layout and /studio rendered TOGETHER make ONE display read — settling false, one number on the rail and in the cost sentence",
    { timeout: 60_000 },
    async () => {
      const { setFoldMetricSink } = await import("../packages/credits/src/metrics");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const ProductLayout = (await import("../app/(product)/layout")).default;
      const StudioPage = (await import("../app/(product)/studio/page")).default;
      const folds: { settling?: boolean }[] = [];
      setFoldMetricSink((m) => {
        if (m.workspaceId === ws) folds.push(m);
      });
      try {
        // ONE REQUEST: layout and page started together, as Next renders them.
        newRequest();
        const [shell, page] = await Promise.all([
          ProductLayout({ children: null }),
          StudioPage({ searchParams: Promise.resolve({}) }),
        ]);
        const shellHtml = renderToStaticMarkup(shell);
        const pageHtml = renderToStaticMarkup(page);
        // One display read for the whole request, and it was the settled one.
        expect(folds).toHaveLength(1);
        expect(folds[0].settling).not.toBe(true);
        expect(shellHtml).not.toContain('data-settling="true"');
        expect(shellHtml).not.toContain("(may change)");
        const railNumber = shellHtml.match(/([\d,]+) credits/)?.[1];
        const sentenceNumber = pageHtml.match(/You have ([\d,]+) credits?\./)?.[1];
        expect(railNumber).toBeDefined();
        expect(sentenceNumber).toBe(railNumber);
        expect(pageHtml).not.toMatch(/read without waiting for other activity/);

        // NON-VACUITY: the same request WITHOUT the per-request dedupe makes
        // TWO display reads — the race whose loser used to report settling.
        folds.length = 0;
        requestCache.passThrough = true;
        newRequest();
        await Promise.all([
          ProductLayout({ children: null }),
          StudioPage({ searchParams: Promise.resolve({}) }),
        ]);
        expect(folds).toHaveLength(2);
      } finally {
        requestCache.passThrough = false;
        setFoldMetricSink(null);
      }
    }
  );

  it(
    "gate M2: behind a deletion-shaped EXCLUSIVE waiter queued on a webhook-shaped SHARED hold, the REAL bootstrap, guarded reads and /studio refuse at the render budget with the named state — and the same bootstrap unbounded is still waiting at 6 000 ms",
    { timeout: 120_000 },
    async () => {
      const db = await import("@respin/db");
      const { takeWorkspaceLockInOrder } = await import("../packages/credits/src/clock");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const ProductLayout = (await import("../app/(product)/layout")).default;
      const StudioPage = (await import("../app/(product)/studio/page")).default;
      const scope = (await db.withWorkspace(harness.db, { authUserId: USER })) as import("@respin/db").WorkspaceScope;

      // 1. THE WEBHOOK'S HOLD: the ordered helper the dispatcher runs (shared
      //    workspace membership, then billing), held open as if inside Stripe.
      let holderHas!: () => void;
      const holderHeld = new Promise<void>((r) => (holderHas = r));
      let releaseHolder!: () => void;
      const holderRelease = new Promise<void>((r) => (releaseHolder = r));
      const holder = harness.db.transaction(async (tx) => {
        await takeWorkspaceLockInOrder(tx, { workspaceId: ws });
        holderHas();
        await holderRelease;
      });
      await holderHeld;

      // 2. THE DELETION WRITER: the exclusive form `deletion-executor.ts`'s
      //    `lockScopeInTx` takes, QUEUED behind the shared hold.
      let releaseWriter!: () => void;
      const writerRelease = new Promise<void>((r) => (releaseWriter = r));
      const writer = harness.db.transaction(async (tx) => {
        await db.lockWorkspaceMembershipGraph(tx, ws, "exclusive");
        await writerRelease;
      });
      for (let i = 0; i < 500 && (await advisory(false)) < 1; i += 1) await new Promise((r) => setTimeout(r, 10));
      expect(await advisory(false)).toBe(1);

      // 3. THE PAGE PATH, all at once, each timed.
      const timed = async <T,>(fn: () => Promise<T>) => {
        const started = Date.now();
        const outcome = await fn().then(
          (value) => ({ value, error: null as unknown }),
          (error: unknown) => ({ value: null, error })
        );
        return { ...outcome, ms: Date.now() - started };
      };
      // THE NON-VACUITY PROBE: the same shared bootstrap in a PLAIN transaction.
      let plainDone = false;
      const plain = harness.db
        .transaction((tx) => db.bootstrapInTx(tx, { authUserId: USER }, "shared"))
        .then(() => {
          plainDone = true;
        });
      const probeAt6s = new Promise<boolean>((r) => setTimeout(() => r(plainDone), 6_000));
      newRequest();
      const [bootstrap, accessor, selected, render] = await Promise.all([
        timed(() => db.ensureUserWorkspace(harness.db, { authUserId: USER })),
        timed(() => scope.accessors.workspace()),
        timed(() => db.selectedProfileForMember(harness.db, scope)),
        timed(async () => {
          const [shell, page] = await Promise.all([
            ProductLayout({ children: null }),
            StudioPage({ searchParams: Promise.resolve({}) }),
          ]);
          return renderToStaticMarkup(shell) + renderToStaticMarkup(page);
        }),
      ]);
      const plainStillWaitingAt6s = !(await probeAt6s);
      console.info(
        `[M2] bootstrap ${bootstrap.ms} ms, accessor ${accessor.ms} ms, selectedProfile ${selected.ms} ms, layout+/studio ${render.ms} ms; plain bootstrap still waiting at 6000 ms: ${plainStillWaitingAt6s}`
      );

      for (const [name, r] of Object.entries({ bootstrap, accessor, selected })) {
        expect(r.error, name).toBeInstanceOf(db.RenderLockTimeoutError);
        expect(r.ms, name).toBeGreaterThanOrEqual(db.RENDER_LOCK_TIMEOUT_MS - 100);
        expect(r.ms, name).toBeLessThan(db.RENDER_LOCK_TIMEOUT_MS + 3_000);
      }
      // The page rendered its NAMED state — not Next's error page, not a hang.
      expect(render.error).toBeNull();
      expect(render.ms).toBeLessThan(db.RENDER_LOCK_TIMEOUT_MS + 3_000);
      expect(String(render.value)).toContain("This page waited too long for this workspace");
      expect(String(render.value)).toContain('data-testid="workspace-access-error"');
      expect(String(render.value)).toContain("Your workspace");
      // ...while the unbounded reader is still queued.
      expect(plainStillWaitingAt6s).toBe(true);

      releaseHolder();
      await holder;
      releaseWriter();
      await writer;
      await plain;
      expect(plainDone).toBe(true);
    }
  );
});
