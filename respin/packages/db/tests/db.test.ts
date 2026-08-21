import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/client";
import {
  assertSeedAllowed,
  CONFIG_V1_SEED,
  DEV_AUTH_USER_ID,
  seedDb,
} from "../src/seed";
import { memberships, users, workspaces } from "../src/schema";
import {
  createDockerTestDb,
  createTestDb,
  seedAuthUser,
  DOCKER_TEST_DB_NAME_PATTERN,
  type TestDb,
} from "../src/testing";

describe("@respin/db", () => {
  let db: TestDb;

  beforeEach(async () => {
    // AC-1: the COMMITTED migrations apply to a fresh database.
    db = await createTestDb();
  });

  it("applies the committed migration to a fresh PGlite and accepts inserts", async () => {
    await seedAuthUser(db, "user_a");
    const [u] = await db
      .insert(users)
      .values({ authUserId: "user_a" })
      .returning();
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/); // uuid v7 generated app-side
    expect(u.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a duplicate auth_user_id (AC-2)", async () => {
    await seedAuthUser(db, "dup");
    await db.insert(users).values({ authUserId: "dup" });
    await expect(
      db.insert(users).values({ authUserId: "dup" })
    ).rejects.toThrow();
  });

  it("rejects a duplicate (user, workspace) membership (AC-2)", async () => {
    await seedAuthUser(db, "u1");
    const [u] = await db
      .insert(users)
      .values({ authUserId: "u1" })
      .returning();
    const [w] = await db
      .insert(workspaces)
      .values({ name: "W" })
      .returning();
    await db
      .insert(memberships)
      .values({ userId: u.id, workspaceId: w.id, role: "owner" });
    await expect(
      db
        .insert(memberships)
        .values({ userId: u.id, workspaceId: w.id, role: "editor" })
    ).rejects.toThrow();
  });

  it("cascades membership deletes from both user and workspace (AC-7)", async () => {
    const mk = async (suffix: string) => {
      await seedAuthUser(db, `u_${suffix}`);
      const [u] = await db
        .insert(users)
        .values({ authUserId: `u_${suffix}` })
        .returning();
      const [w] = await db
        .insert(workspaces)
        .values({ name: `W_${suffix}` })
        .returning();
      await db
        .insert(memberships)
        .values({ userId: u.id, workspaceId: w.id, role: "owner" });
      return { u, w };
    };

    const a = await mk("a");
    await db.delete(users).where(eq(users.id, a.u.id));
    let rows = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, a.u.id));
    expect(rows).toHaveLength(0);

    const b = await mk("b");
    await db.delete(workspaces).where(eq(workspaces.id, b.w.id));
    rows = await db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, b.w.id));
    expect(rows).toHaveLength(0);
  });

  it("seed is idempotent: running twice changes no counts (AC-3)", async () => {
    await seedDb(db);
    const counts = async () => ({
      users: (await db.select({ n: count() }).from(users))[0].n,
      workspaces: (await db.select({ n: count() }).from(workspaces))[0].n,
      memberships: (await db.select({ n: count() }).from(memberships))[0].n,
    });
    const first = await counts();
    expect(first).toEqual({ users: 1, workspaces: 1, memberships: 1 });
    await seedDb(db);
    expect(await counts()).toEqual(first);
    const [seeded] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, DEV_AUTH_USER_ID));
    expect(seeded).toBeDefined();
  });
});

describe("createDb env guard (AC-4)", () => {
  it("throws a named, actionable error without a connection string", () => {
    expect(() => createDb(undefined)).toThrow(/DATABASE_URL is not set/);
  });
});

describe("createDockerTestDb name guard (billing/tenancy round-7 CHANGE 6)", () => {
  // The harness runs `DROP SCHEMA public CASCADE`. Round 6's guard compared
  // current_database() against the caller-supplied name the connection URL is
  // built FROM, so it compared a value with itself: the reviewer proved
  // read-only against the live container that `dbName: "respin"` produced "no
  // throw" on a database holding 12 public tables — credit_ledger,
  // subscriptions, workspaces, the Better Auth tables and the migration state.
  //
  // These cases run with NO TEST_DATABASE_URL and no Docker: the refusal must
  // happen BEFORE any connection is attempted, which is the whole point. A
  // connection attempt against this bogus URL would surface as ECONNREFUSED /
  // ENOTFOUND, so `.rejects.toThrow(/refusing to reset/)` also proves the
  // ordering, not just the message.
  const NOWHERE = "postgres://nobody:nobody@127.0.0.1:1/respin";

  it("refuses the live dev database by NAME, before opening any connection", async () => {
    await expect(createDockerTestDb(NOWHERE, "respin")).rejects.toThrow(
      /refusing to reset "respin"/
    );
  });

  it("refuses every non-test name shape (postgres, template1, prefix/suffix lookalikes)", async () => {
    for (const name of [
      "postgres",
      "template1",
      "respin_prod",
      "notrespin_test",
      "respin_test; DROP DATABASE respin",
      "respin_test-credits",
      // The bare shared name itself (tenancy round-10 NOTE). It is a real
      // database on the dev Postgres, and it is the one round 6's
      // mid-run-reset corruption came through.
      "respin_test",
      "RESPIN_TEST",
      "",
    ]) {
      await expect(
        createDockerTestDb(NOWHERE, name),
        `must refuse ${JSON.stringify(name)}`
      ).rejects.toThrow(/refusing to reset/);
    }
  });

  it("the guard is not a blanket ban: the two real suite names PASS it and proceed to connect", async () => {
    // Non-vacuity in the other direction. These names get past the name guard
    // and fail at the (deliberately unreachable) connection instead — if the
    // pattern were too tight, the Docker suites would be silently unrunnable.
    for (const name of ["respin_test_db", "respin_test_credits"]) {
      await expect(
        createDockerTestDb(NOWHERE, name),
        `must get past the name guard: ${name}`
      ).rejects.not.toThrow(/refusing to reset/);
    }
  });

  it("the dbName argument is REQUIRED — a new suite cannot silently inherit a shared default", () => {
    // The other half of the round-6 defect (billing round-7 CHANGE 6b):
    // `dbName` defaulted to a shared "respin_test", so a third
    // *.docker.test.ts suite that simply omitted the argument rejoined the
    // shared database and re-created the mid-run reset corruption. This is a
    // TYPE-level assertion by necessity: restoring the default would make the
    // suppression directive below unused, which is itself a `pnpm typecheck`
    // failure (TS2578). The call is constructed, never invoked.
    // @ts-expect-error — omitting the database name must not compile.
    const omitted = () => createDockerTestDb("postgres://nobody@127.0.0.1:1/x");
    expect(typeof omitted).toBe("function");
  });

  it("the two Docker suites each name their OWN database (no shared default left to inherit)", async () => {
    // `dbName` used to default to a shared "respin_test", so a third
    // *.docker.test.ts suite that simply omitted the argument would rejoin the
    // shared database and re-create the mid-run reset corruption round 6 fixed.
    // The default is gone; this asserts the callers are distinct AND that every
    // caller passes one, read from the sources rather than from memory.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const suites = [
      resolve(here, "concurrency.docker.test.ts"),
      resolve(here, "../../credits/tests/concurrency.docker.test.ts"),
    ];
    const names = suites.map((f) => {
      const src = readFileSync(f, "utf8");
      const m = src.match(/createDockerTestDb\([^,)]+,\s*"([^"]+)"\s*\)/);
      expect(m, `${f} must pass an explicit database name`).not.toBeNull();
      return m![1];
    });
    expect(new Set(names).size, `suites share a database: ${names.join(", ")}`).toBe(
      names.length
    );
    for (const n of names) {
      expect(n).toMatch(DOCKER_TEST_DB_NAME_PATTERN);
    }
  });
});

describe("seed dev-guard (AC-8)", () => {
  it("allows local hosts without force", () => {
    expect(() =>
      assertSeedAllowed("postgres://x:y@localhost:5432/db", {})
    ).not.toThrow();
    expect(() =>
      assertSeedAllowed("postgres://x:y@127.0.0.1:5432/db", {})
    ).not.toThrow();
  });

  it("refuses a non-local host without RESPIN_SEED_FORCE=1", () => {
    expect(() =>
      assertSeedAllowed("postgres://x:y@ep-foo.neon.tech/db", {})
    ).toThrow(/refused/);
  });

  it("allows a non-local host only with the explicit opt-in", () => {
    expect(() =>
      assertSeedAllowed("postgres://x:y@ep-foo.neon.tech/db", {
        RESPIN_SEED_FORCE: "1",
      })
    ).not.toThrow();
  });

  it("refuses an unparseable connection string", () => {
    expect(() => assertSeedAllowed("not a url", {})).toThrow(
      /unidentifiable/
    );
  });

  it("refuses when DATABASE_URL is absent", () => {
    expect(() => assertSeedAllowed(undefined, {})).toThrow(/DATABASE_URL/);
  });
});

// ---------------------------------------------------------------------------
// M1 phase 1 — billing schema constraints (AC-4): every CHECK/unique/cascade
// in the Schema section proven by an attempted violation, enumerated 1:1.
// ---------------------------------------------------------------------------
import {
  configVersions,
  creditLedger,
  pausePeriods,
  stripeEvents,
  subscriptions,
  user as authUserTable,
} from "../src/schema";

describe("M1 billing schema constraints (AC-4)", () => {
  const FUTURE = new Date("2027-01-01T00:00:00Z");
  let db: TestDb;
  let wsId: string;
  let wsId2: string;

  beforeEach(async () => {
    db = await createTestDb();
    const [w1] = await db
      .insert(workspaces)
      .values({ name: "W1" })
      .returning();
    const [w2] = await db
      .insert(workspaces)
      .values({ name: "W2" })
      .returning();
    wsId = w1.id;
    wsId2 = w2.id;
  });

  it("credit_ledger: delta ≠ 0 CHECK", async () => {
    await expect(
      db
        .insert(creditLedger)
        .values({ workspaceId: wsId, delta: 0, kind: "adjust", reasonCode: "x" })
    ).rejects.toThrow();
  });

  it("credit_ledger: delta sign per kind CHECK (negative grant, positive debit)", async () => {
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: -5, kind: "grant", expiresAt: FUTURE })
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: 5, kind: "debit" })
    ).rejects.toThrow();
  });

  it("credit_ledger: adjust requires a reason code CHECK", async () => {
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: 5, kind: "adjust" })
    ).rejects.toThrow();
    await db
      .insert(creditLedger)
      .values({ workspaceId: wsId, delta: 5, kind: "adjust", reasonCode: "goodwill" });
  });

  it("credit_ledger: stripe_event_id unique", async () => {
    await db
      .insert(creditLedger)
      .values({ workspaceId: wsId, delta: 10, kind: "grant", expiresAt: FUTURE, stripeEventId: "evt_1" });
    await expect(
      db
        .insert(creditLedger)
        .values({ workspaceId: wsId, delta: 10, kind: "grant", expiresAt: FUTURE, stripeEventId: "evt_1" })
    ).rejects.toThrow();
  });

  it("credit_ledger: one expiry row per lot (partial unique index)", async () => {
    await db
      .insert(creditLedger)
      .values({ workspaceId: wsId, delta: -3, kind: "expiry", refId: "lot_1" });
    await expect(
      db
        .insert(creditLedger)
        .values({ workspaceId: wsId, delta: -2, kind: "expiry", refId: "lot_1" })
    ).rejects.toThrow();
    // non-expiry kinds may share ref ids freely
    await db
      .insert(creditLedger)
      .values({ workspaceId: wsId, delta: -1, kind: "debit", refId: "lot_1" });
    await db
      .insert(creditLedger)
      .values({ workspaceId: wsId2, delta: -1, kind: "debit", refId: "lot_1" });
  });

  // The two per-business-object uniques added in review rounds 3 and 4. They
  // are proven behaviourally in the credits suite, but this file claims a 1:1
  // enumeration of every CHECK/unique/cascade, and a hand-written enumeration
  // drifts silently — round 3's index landed with no case here (code-review
  // NOTE). Both are DELIBERATELY not workspace-keyed: Stripe session and
  // invoice ids are globally unique, so a cross-workspace collision is a
  // writer defect that must fail closed, never mint twice.
  it("credit_ledger: one pack per checkout session, and one grant per invoice (partial uniques, global by design)", async () => {
    const lot = { expiresAt: new Date(Date.now() + 24 * 3_600_000) };
    await db.insert(creditLedger).values({
      workspaceId: wsId, delta: 1000, kind: "pack",
      refType: "checkout_session", refId: "cs_1", ...lot,
    });
    await expect(
      db.insert(creditLedger).values({
        workspaceId: wsId, delta: 1000, kind: "pack",
        refType: "checkout_session", refId: "cs_1", ...lot,
      })
    ).rejects.toThrow();
    // ...and a SECOND workspace claiming the same session id is refused too.
    await expect(
      db.insert(creditLedger).values({
        workspaceId: wsId2, delta: 1000, kind: "pack",
        refType: "checkout_session", refId: "cs_1", ...lot,
      })
    ).rejects.toThrow();

    await db.insert(creditLedger).values({
      workspaceId: wsId, delta: 250, kind: "grant",
      refType: "invoice", refId: "in_1", ...lot,
    });
    await expect(
      db.insert(creditLedger).values({
        workspaceId: wsId, delta: 250, kind: "grant",
        refType: "invoice", refId: "in_1", ...lot,
      })
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({
        workspaceId: wsId2, delta: 250, kind: "grant",
        refType: "invoice", refId: "in_1", ...lot,
      })
    ).rejects.toThrow();

    // Other ref types still share ids freely — the uniques are partial: this
    // auto_topup row reuses "cs_1" and is accepted because it is scoped by a
    // DIFFERENT ref_type, not because auto_topup is unguarded (see the case
    // below, which is the third partial unique).
    await db.insert(creditLedger).values({
      workspaceId: wsId, delta: 1000, kind: "pack",
      refType: "auto_topup", refId: "cs_1", ...lot,
    });
  });

  it("credit_ledger: one pack per PaymentIntent (the third partial unique, global by design)", async () => {
    const lot = { expiresAt: new Date(Date.now() + 24 * 3_600_000) };
    await db.insert(creditLedger).values({
      workspaceId: wsId, delta: 1000, kind: "pack",
      refType: "auto_topup", refId: "pi_1", amountCents: 1000, ...lot,
    });
    // The mint path that had no business-object unique while its two siblings
    // did (billing review finding 2) — a second event id carrying one PI.
    await expect(
      db.insert(creditLedger).values({
        workspaceId: wsId, delta: 1000, kind: "pack",
        refType: "auto_topup", refId: "pi_1", amountCents: 1000, ...lot,
      })
    ).rejects.toThrow();
    // ...and a SECOND workspace claiming the same PaymentIntent is refused
    // too: a PI id is globally unique and belongs to exactly one customer, so
    // two workspaces claiming it is a writer defect that must fail closed.
    await expect(
      db.insert(creditLedger).values({
        workspaceId: wsId2, delta: 1000, kind: "pack",
        refType: "auto_topup", refId: "pi_1", amountCents: 1000, ...lot,
      })
    ).rejects.toThrow();
    // Still partial: a checkout_session row may reuse the same ref id.
    await db.insert(creditLedger).values({
      workspaceId: wsId, delta: 1000, kind: "pack",
      refType: "checkout_session", refId: "pi_1", ...lot,
    });
  });

  it("subscriptions: workspace 1:1, customer id, and subscription id uniques", async () => {
    await db
      .insert(subscriptions)
      .values({ workspaceId: wsId, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
    await expect(
      db.insert(subscriptions).values({ workspaceId: wsId, stripeCustomerId: "cus_2" })
    ).rejects.toThrow(); // workspace 1:1
    await expect(
      db.insert(subscriptions).values({ workspaceId: wsId2, stripeCustomerId: "cus_1" })
    ).rejects.toThrow(); // customer unique
    await expect(
      db
        .insert(subscriptions)
        .values({ workspaceId: wsId2, stripeCustomerId: "cus_2", stripeSubscriptionId: "sub_1" })
    ).rejects.toThrow(); // subscription unique
  });

  it("pause_periods: one open pause per workspace (partial unique index)", async () => {
    await db
      .insert(pausePeriods)
      .values({ workspaceId: wsId, startedAt: new Date("2026-01-01T00:00:00Z") });
    await expect(
      db
        .insert(pausePeriods)
        .values({ workspaceId: wsId, startedAt: new Date("2026-02-01T00:00:00Z") })
    ).rejects.toThrow();
    // a CLOSED pause coexists with a new open one
    await db.insert(pausePeriods).values({
      workspaceId: wsId2,
      startedAt: new Date("2026-01-01T00:00:00Z"),
      endedAt: new Date("2026-02-01T00:00:00Z"),
    });
    await db
      .insert(pausePeriods)
      .values({ workspaceId: wsId2, startedAt: new Date("2026-03-01T00:00:00Z") });
  });

  it("cascades: workspace delete removes ledger, subscription, pauses, and ATTRIBUTED stripe_events; null-workspace events survive (teardown enumeration)", async () => {
    await db
      .insert(creditLedger)
      .values({ workspaceId: wsId, delta: 10, kind: "grant", expiresAt: FUTURE });
    await db
      .insert(subscriptions)
      .values({ workspaceId: wsId, stripeCustomerId: "cus_c" });
    await db
      .insert(pausePeriods)
      .values({ workspaceId: wsId, startedAt: new Date("2026-01-01T00:00:00Z") });
    await db.insert(stripeEvents).values({
      id: "evt_attributed",
      type: "invoice.paid",
      payload: {},
      workspaceId: wsId,
      outcome: "processed",
    });
    await db.insert(stripeEvents).values({
      id: "evt_unattributed",
      type: "invoice.paid",
      payload: {},
      outcome: "refused_unknown_customer",
    });

    await db.delete(workspaces).where(eq(workspaces.id, wsId));

    expect(await db.select().from(creditLedger)).toHaveLength(0);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
    expect(await db.select().from(pausePeriods)).toHaveLength(0);
    const events = await db.select().from(stripeEvents);
    expect(events.map((e) => e.id)).toEqual(["evt_unattributed"]);
  });

  it("users.auth_user_id FK: unknown auth id rejected; auth-user delete RESTRICTED while a domain row exists", async () => {
    await expect(
      db.insert(users).values({ authUserId: "never_created" })
    ).rejects.toThrow(); // FK enforcement
    await seedAuthUser(db, "fk_user");
    await db.insert(users).values({ authUserId: "fk_user" });
    await expect(
      db.delete(authUserTable).where(eq(authUserTable.id, "fk_user"))
    ).rejects.toThrow(); // restrict — the M6 deletion flow is the sanctioned path
  });

  it("config_versions: identity versions ascend; append-only usage shape", async () => {
    await db.insert(configVersions).values({ content: { a: 1 }, createdBy: "test" });
    await db.insert(configVersions).values({ content: { a: 2 }, createdBy: "test" });
    const rows = await db.select().from(configVersions);
    const versions = rows.map((r) => r.version).sort((a, b) => a - b);
    expect(versions[1]).toBeGreaterThan(versions[0]);
  });

  it("seed writes config v1 exactly once (idempotent, AC-6)", async () => {
    await seedDb(db);
    await seedDb(db);
    const rows = await db.select().from(configVersions);
    expect(rows).toHaveLength(1);
    expect(rows[0].createdBy).toBe("seed");
    expect(rows[0].content).toEqual(CONFIG_V1_SEED);
  });

  it("credit_ledger: delta sign per kind CHECK — remaining kinds (pack, refund, expiry)", async () => {
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: -5, kind: "pack", expiresAt: FUTURE })
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: -5, kind: "refund", expiresAt: FUTURE })
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: 5, kind: "expiry", refId: "lot_x" })
    ).rejects.toThrow();
  });

  it("credit_ledger: an expiry row must name its lot (ref_id NOT NULL CHECK — the NULL-bypass probe)", async () => {
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: -3, kind: "expiry" })
    ).rejects.toThrow();
  });

  it("credit_ledger: grant/pack/refund lots must carry an expiry (lot_expiry CHECK)", async () => {
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: 10, kind: "grant" })
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: 10, kind: "pack" })
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({ workspaceId: wsId, delta: 10, kind: "refund" })
    ).rejects.toThrow();
    // adjust may be never-expiring
    await db.insert(creditLedger).values({ workspaceId: wsId, delta: 10, kind: "adjust", reasonCode: "goodwill" });
  });

  it("pause_periods: a closed pause must have ended_at > started_at (interval CHECK — the inverted-interval probe)", async () => {
    await expect(
      db.insert(pausePeriods).values({
        workspaceId: wsId,
        startedAt: new Date("2026-05-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:00:00Z"),
      })
    ).rejects.toThrow();
    await expect(
      db.insert(pausePeriods).values({
        workspaceId: wsId,
        startedAt: new Date("2026-05-01T00:00:00Z"),
        endedAt: new Date("2026-05-01T00:00:00Z"),
      })
    ).rejects.toThrow();
  });

  // Migration 0008's CHECK, and the enumeration this file claims to be 1:1.
  it("pause_periods: ended_known_at cannot exist without ended_at (ended_known CHECK)", async () => {
    await expect(
      db.insert(pausePeriods).values({
        workspaceId: wsId,
        startedAt: new Date("2026-05-01T00:00:00Z"),
        endedKnownAt: new Date("2026-05-02T00:00:00Z"), // no endedAt
      })
    ).rejects.toThrow();
    // ...and the legal shapes still insert: open with a knowledge time for the
    // OPEN, and closed with both. The CHECK constrains the close pair only,
    // deliberately — see billing-schema.ts for why no ordering CHECK relating
    // the two knowledge columns can exist (CLOCK_SKEW_MS tolerance).
    await db.insert(pausePeriods).values({
      workspaceId: wsId,
      startedAt: new Date("2026-05-01T00:00:00Z"),
      startedKnownAt: new Date("2026-04-30T23:00:00Z"),
      endedAt: new Date("2026-05-03T00:00:00Z"),
      // knowledge of the close 60s BEFORE knowledge of the open — legal, and
      // an `ended_known_at > started_known_at` CHECK would have refused it.
      endedKnownAt: new Date("2026-04-30T22:59:00Z"),
    });
  });

  it("stripe_events: outcome vocabulary CHECK", async () => {
    await expect(
      db.insert(stripeEvents).values({ id: "evt_bad", type: "x", payload: {}, outcome: "totally_new_outcome" })
    ).rejects.toThrow();
  });
});

describe("db:migrate CLI", () => {
  it(
    "prints the underlying database error instead of only the spinner failure",
    { timeout: 60_000 },
    async () => {
      const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
      const tsxCli = resolve(pkg, "node_modules/tsx/dist/cli.mjs");
      const cli = resolve(pkg, "src/migrate-cli.ts");
      const child = spawn(process.execPath, [tsxCli, cli], {
        cwd: pkg,
        env: {
          ...process.env,
          // Port 1 is intentionally unreachable; this exercises the failure
          // after the migrator has started, where drizzle-kit used to erase
          // the useful connection error behind its spinner.
          DATABASE_URL: "postgres://respin:respin@127.0.0.1:1/respin",
        },
      });

      const output = await new Promise<{ code: number | null; out: string }>(
        (resolveResult) => {
          let out = "";
          child.stdout.on("data", (chunk) => (out += String(chunk)));
          child.stderr.on("data", (chunk) => (out += String(chunk)));
          child.on("close", (code) => resolveResult({ code, out }));
        }
      );

      expect(output.code).toBe(1);
      expect(output.out).toMatch(/db:migrate failed/i);
      expect(output.out).toMatch(/ECONNREFUSED|connect/i);
    }
  );
});
