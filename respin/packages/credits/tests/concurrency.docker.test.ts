// Real-Postgres race suite (Phase 2 task 9). Loud skip without
// TEST_DATABASE_URL (CI always provides the service container).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  createDockerTestDb,
  creditLedger,
  pausePeriods,
  schema,
  seedAuthUser,
  seedDb,
  stripeEvents,
  subscriptions,
  trustWorkspaceId,
  type VerifiedWorkspaceId,
} from "@respin/db";
import {
  debitCredits,
  grantCredits,
} from "../src/ledger";
import { ensurePauseStarted } from "../src/pause";
import { handleStripeEvent, DuplicateStripeEvent } from "../src/stripe/webhooks";
import { appendConfigVersion } from "@respin/config";
import { deriveBalance } from "../src/balance";
import { getWorkspaceBillingState } from "../src/state";
import { InsufficientCreditsError } from "../src/errors";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
const HOUR = 3_600_000;

if (!MAINTENANCE_URL) {
  console.warn(
    "[credits concurrency.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: ledger races on real Postgres (concurrent debits never " +
      "over-consume; same-event grants dedupe; concurrent materialization writes one expiry row; " +
      "the debit-tx/bare-db lock composition never hangs; the same event id x8 yields one grant; " +
      "a grant committing while a debit transaction is open still sorts BEFORE that debit " +
      "(the write clock, round 10); " +
      "one PaymentIntent under 8 DISTINCT event ids mints one auto-top-up pack; " +
      "owner-Pause racing its reconciling webhook keeps ONE open pause and never silently " +
      "acknowledges-and-discards the event; " +
      "DIFFERENTIAL-PAYLOAD mirror races — audit 2026-08-17 #3's own required proof — where two " +
      "concurrent Stripe deliveries carry DIFFERENT state and the newer one must survive whichever " +
      "wins the scheduler)."
  );
}

describe.skipIf(!MAINTENANCE_URL)("credit ledger under REAL concurrency", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;

  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_credits");
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  /**
   * PRE-WARM the pool before a race, and it is not cosmetic — without it the
   * differential-payload cases below were VACUOUS.
   *
   * `pg.Pool.connect()` opens a real TCP connection plus auth for a racer that
   * finds no idle client, which measured ~11ms here. `handleStripeEvent`'s whole
   * transaction is ~6 round trips, i.e. FASTER than that setup — so the second
   * racer's transaction began after the first had already committed, its mirror
   * SELECT saw the committed watermark, and it converged to `ignored` for the
   * honest reason rather than because of the lock. Both cases passed with the
   * lock disabled (verified, 3 runs) until this was added: a green result that
   * proved the harness, not the invariant. This is the "present-and-unrun"
   * failure mode from CLAUDE.md's 2026-08-10 lesson, in race form.
   */
  async function prewarmPool(n: number): Promise<void> {
    const clients = await Promise.all(
      Array.from({ length: n }, () => harness.pool.connect())
    );
    for (const c of clients) c.release();
  }

  async function mkWorkspace(): Promise<VerifiedWorkspaceId> {
    const [w] = await harness.db
      .insert(schema.workspaces)
      .values({ name: `W${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    return trustWorkspaceId(w.id);
  }

  it(
    "20 concurrent debits of 10 against a 100 balance: exactly 10 succeed, final balance 0, never negative",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const ws = await mkWorkspace();
      await db.transaction((t) =>
        grantCredits(t, {
          workspaceId: ws, amount: 100,
          expiresAt: new Date(Date.now() + 24 * HOUR),
          // A distinct invoice id per test. `in_race` belonged to the webhook
          // race below, and one invoice id appearing under TWO workspaces is a
          // shape Stripe cannot produce — credit_ledger_invoice_grant_uq is
          // global precisely to refuse it, and it caught this fixture.
          refType: "invoice", refId: "in_debit_race", configVersion: 1,
        })
      );
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          db.transaction((t) =>
            debitCredits(t, {
              workspaceId: ws, cost: 10, refType: "race", refId: `d${i}`,
              at: new Date(), configVersion: 1,
            })
          )
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled");
      const refused = results.filter(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof InsufficientCreditsError
      );
      expect(ok).toHaveLength(10);
      expect(refused).toHaveLength(10);
      const view = await deriveBalance(db, ws);
      expect(view.balance).toBe(0);
      const rows = await db.select().from(creditLedger);
      const consumed = rows
        .filter((r) => r.workspaceId === ws && r.kind === "debit")
        .reduce((s, r) => s - r.delta, 0);
      expect(consumed).toBe(100); // never over-consumed
    }
  );

  it(
    "ROUND 7 (B1/B3): a debit CANNOT ignore a debit that committed after its own transaction began — `now()` is the transaction's start, not the clock",
    { timeout: 60_000 },
    async () => {
      // THE DETERMINISTIC FORM of the intermittent "11 of 20 concurrent debits
      // of 10 succeeded against a 100 balance" failure. Round 6 read that
      // symptom as suite interference and gave each Docker suite its own
      // database; the symptom survived (2 of 5 standalone runs of this file,
      // with no neighbour that could reset anything), because the real cause is
      // in the balance authority:
      //
      //   `getDbNow` ran `SELECT now()`, and in PostgreSQL `now()` is
      //   `transaction_timestamp()` — fixed at the START of the calling
      //   transaction. `foldLedger` then drops every row whose `created_at` is
      //   later than that `asOf`. A debit row written by a transaction that
      //   BEGAN after mine but COMMITTED before I took the workspace lock is
      //   therefore invisible to my fold: I see a balance that has already been
      //   spent, and B3's "refuse before writing" check passes on it.
      //
      // The race above only reproduces it when the 20 BEGINs happen to overlap
      // the right way. This case forces the interleaving, so it fails EVERY run
      // against `now()` and passes every run against `clock_timestamp()`.
      const { db } = harness;
      const ws = await mkWorkspace();
      await db.transaction((t) =>
        grantCredits(t, {
          workspaceId: ws, amount: 100,
          expiresAt: new Date(Date.now() + 24 * HOUR),
          refType: "invoice", refId: "in_txstart_race", configVersion: 1,
        })
      );

      let releaseB: () => void = () => {};
      const bMayRun = new Promise<void>((r) => {
        releaseB = r;
      });
      let bDone: Promise<unknown> = Promise.resolve();

      const aResult = await db
        .transaction(async (tx) => {
          // Pin A's transaction_timestamp BEFORE B exists, and take no lock.
          await tx.execute(sql`SELECT 1`);
          // Now let B spend the whole balance on another connection and commit.
          bDone = db.transaction((t2) =>
            debitCredits(t2, {
              workspaceId: ws, cost: 100, refType: "race", refId: "b_spends_all",
              at: new Date(), configVersion: 1,
            })
          );
          releaseB();
          await bDone;
          // A's debit runs strictly AFTER B committed. It must see B's row.
          return debitCredits(tx, {
            workspaceId: ws, cost: 10, refType: "race", refId: "a_after_b",
            at: new Date(), configVersion: 1,
          });
        })
        .then(
          (row) => ({ ok: true as const, row }),
          (err: unknown) => ({ ok: false as const, err })
        );
      await bMayRun;
      await bDone.catch(() => undefined);

      expect(
        aResult.ok,
        "A debited a balance B had already spent — the ledger over-consumed"
      ).toBe(false);
      expect(
        aResult.ok ? null : aResult.err,
        "and it must be the ordinary typed refusal, not some other failure"
      ).toBeInstanceOf(InsufficientCreditsError);
      // B1: the ledger is the balance, and it never went negative.
      const rows = (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws
      );
      expect(rows.reduce((s, r) => s + r.delta, 0)).toBe(0);
      expect((await deriveBalance(db, ws)).balance).toBe(0);
    }
  );

  it(
    "ROUND 10 (write clock): a GRANT that commits while a debit's transaction is open must sort BEFORE that debit — deriveBalance keeps folding forever after",
    { timeout: 60_000 },
    async () => {
      // THE MIRROR IMAGE of the ROUND 7 case above. That one constructs this
      // exact interleaving in the DEBIT direction, where the right outcome is a
      // refusal — so it proved the READ clock and said nothing about the WRITE
      // clock. Here B GRANTS instead of spending, so the debit is correctly
      // ALLOWED, and the question becomes what instant its row is dated at.
      //
      //   A BEGINs at t0. B grants 100 and commits at t1 > t0. A folds at t2
      //   (clock_timestamp), SEES the grant, and debits 10 — correctly. With the
      //   column default that row is written at `now()` = transaction_timestamp
      //   = t0, i.e. BEFORE the grant that funded it. Every later fold then
      //   replays debit-then-grant, finds no live lot, and throws
      //   LedgerIntegrityError "over-consumes" — PERMANENTLY, because
      //   credit_ledger is append-only and the row cannot be removed. The
      //   workspace loses its usage page, every future debit and every refund,
      //   while webhook grants keep landing and the customer keeps paying.
      //
      // So the assertion is not "the debit is refused" but "the ledger is still
      // readable" — deriveBalance must FOLD, not throw.
      const { db } = harness;
      const ws = await mkWorkspace();

      let bDone: Promise<unknown> = Promise.resolve();
      const aResult = await db
        .transaction(async (tx) => {
          // Pin A's transaction_timestamp BEFORE B exists, and take no lock.
          await tx.execute(sql`SELECT 1`);
          await tx.execute(sql`SELECT pg_sleep(0.05)`);
          // B grants on another connection and commits.
          bDone = db.transaction((t2) =>
            grantCredits(t2, {
              workspaceId: ws, amount: 100,
              expiresAt: new Date(Date.now() + 24 * HOUR),
              refType: "invoice", refId: "in_write_clock", configVersion: 1,
            })
          );
          await bDone;
          // A's debit runs strictly AFTER B committed and is FUNDED by it.
          return debitCredits(tx, {
            workspaceId: ws, cost: 10, refType: "race", refId: "a_funded_by_b",
            at: new Date(), configVersion: 1,
          });
        })
        .then(
          (row) => ({ ok: true as const, row }),
          (err: unknown) => ({ ok: false as const, err })
        );
      await bDone.catch(() => undefined);

      expect(
        aResult.ok ? null : aResult.err,
        "the debit is funded by a grant the fold can see — it must succeed"
      ).toBeNull();

      // THE DISCRIMINATOR: the row must be dated at or after the grant that
      // funded it, so the chronological fold can replay it.
      const rows = (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws
      );
      const grant = rows.find((r) => r.kind === "grant")!;
      const debit = rows.find((r) => r.kind === "debit")!;
      expect(
        debit.createdAt.getTime(),
        `debit dated ${debit.createdAt.toISOString()} but the grant funding it is dated ${grant.createdAt.toISOString()} — the ledger now folds to an integrity error that can never be repaired`
      ).toBeGreaterThanOrEqual(grant.createdAt.getTime());

      // ...stated as the consequence, not just the cause: the balance authority
      // still answers, now and on every future read.
      const view = await deriveBalance(db, ws);
      expect(view.balance).toBe(90);
      expect(rows.reduce((s, r) => s + r.delta, 0)).toBe(90);
      // A second read (the usage page after a refresh) must also survive.
      expect((await deriveBalance(db, ws)).balance).toBe(90);
    }
  );

  it(
    "concurrent identical grants (same stripeEventId) yield exactly one row",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const ws = await mkWorkspace();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          db.transaction((t) =>
            grantCredits(t, {
              workspaceId: ws, amount: 250,
              expiresAt: new Date(Date.now() + 24 * HOUR),
              stripeEventId: "evt_dup_race",
              refType: "invoice", refId: "in_dup", configVersion: 1,
            })
          )
        )
      );
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      const rows = await db.select().from(creditLedger);
      const grants = rows.filter(
        (r) => r.workspaceId === ws && r.stripeEventId === "evt_dup_race"
      );
      expect(grants).toHaveLength(1);
      expect((await deriveBalance(db, ws)).balance).toBe(250);
    }
  );

  it(
    "N=8 concurrent deriveBalance over an expired lot: exactly ONE expiry row, all callers agree",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const ws = await mkWorkspace();
      await db.insert(creditLedger).values({
        workspaceId: ws, delta: 100, kind: "grant",
        createdAt: new Date(Date.now() - 48 * HOUR),
        expiresAt: new Date(Date.now() - 24 * HOUR), // already expired
      });
      const views = await Promise.all(
        Array.from({ length: 8 }, () => deriveBalance(db, ws))
      );
      expect(views.every((v) => v.balance === 0)).toBe(true);
      const expiries = (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws && r.kind === "expiry"
      );
      expect(expiries).toHaveLength(1);
      expect(expiries[0].delta).toBe(-100);
    }
  );

  it(
    "MIXED lock composition: a debit transaction racing bare-db derivations over the same expired lot — no hang, one expiry row, consistent results",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const ws = await mkWorkspace();
      await db.insert(creditLedger).values([
        {
          workspaceId: ws, delta: 100, kind: "grant",
          createdAt: new Date(Date.now() - 48 * HOUR),
          expiresAt: new Date(Date.now() - 24 * HOUR), // expired with remainder
        },
        {
          workspaceId: ws, delta: 50, kind: "pack",
          createdAt: new Date(Date.now() - 48 * HOUR),
          expiresAt: new Date(Date.now() + 24 * HOUR), // live
        },
      ]);
      const [debitResult, ...viewResults] = await Promise.allSettled([
        db.transaction((t) =>
          debitCredits(t, {
            workspaceId: ws, cost: 30, refType: "mixed", refId: "m1",
            at: new Date(), configVersion: 1,
          })
        ),
        ...Array.from({ length: 6 }, () => deriveBalance(db, ws)),
      ]);
      expect(debitResult.status).toBe("fulfilled"); // no deadlock, no hang
      expect(viewResults.every((r) => r.status === "fulfilled")).toBe(true);
      const expiries = (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws && r.kind === "expiry"
      );
      expect(expiries).toHaveLength(1); // materialized exactly once
      expect((await deriveBalance(db, ws)).balance).toBe(20); // 50 - 30
    }
  );

  it(
    "PHASE 3: the same Stripe event id delivered concurrently x8 yields exactly ONE grant (D-M1-1 single-tx + PK race)",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      await seedAuthUser(db, "wh_race_user");
      await seedDb(db);
      await appendConfigVersion(
        db,
        { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
        "test"
      );
      const ws = await mkWorkspace();
      await db.insert(subscriptions).values({
        workspaceId: ws, stripeCustomerId: "cus_race",
        stripeSubscriptionId: "sub_race", stripePriceId: "price_creator",
        status: "active",
      });
      const now = Math.floor(Date.now() / 1000);
      const event = {
        id: "evt_concurrent_race", object: "event", type: "invoice.paid",
        api_version: "x", created: now, livemode: false, pending_webhooks: 0, request: null,
        data: { object: {
          id: "in_race", object: "invoice", customer: "cus_race",
          billing_reason: "subscription_cycle",
          // The SERVICE period lives on the line item; the top-level period
          // collapses to creation time on a real invoice (code-review BLOCK 3).
          period_start: now, period_end: now,
          lines: { object: "list", data: [{
            id: "il_race", object: "line_item",
            period: { start: now, end: now + 30 * 86400 },
            pricing: { price_details: { price: "price_creator" } },
            // The handler selects the subscription line by discriminator, so
            // the fixture must carry it (code-review BLOCK).
            parent: {
              type: "subscription_item_details",
              subscription_item_details: { subscription: "sub_race" },
            },
          }] },
          // THE INVOICE's own subscription binding, distinct from the LINE's.
          // Absent here until the 2026-08-17 remediation, and its absence is a
          // FIXTURE defect, not a code one: a real subscription invoice always
          // carries `parent.subscription_details` (stripe@22.5.0 Invoices.d.ts),
          // and audit #4's identity check reads exactly that field before
          // granting. Without it every delivery in this race threw and the case
          // measured ZERO grants against an expected one.
          //
          // Identical to the fixture defect R1 already corrected in
          // isolation.test.ts — and it survived here only because the Docker
          // suites were never run after R1 landed, which is the gap this run
          // closes. The sibling fixture in stripe.test.ts has always set both.
          parent: { subscription_details: { subscription: "sub_race" } },
        } },
      } as never;
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => handleStripeEvent(db, event))
      );
      const processed = results.filter((r) => r.status === "fulfilled");
      const duplicates = results.filter(
        (r) => r.status === "rejected" && r.reason instanceof DuplicateStripeEvent
      );
      expect(processed).toHaveLength(1);
      expect(duplicates).toHaveLength(7);
      const grants = (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws && r.kind === "grant"
      );
      expect(grants).toHaveLength(1);
      expect((await deriveBalance(db, ws)).balance).toBe(250);
    }
  );

  it(
    "PHASE 3 / round-5 finding 2: one PaymentIntent under EIGHT DISTINCT event ids concurrently mints exactly ONE auto-top-up pack",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      await seedAuthUser(db, "pi_race_user");
      await seedDb(db);
      const ws = await mkWorkspace();
      await db.insert(subscriptions).values({
        workspaceId: ws, stripeCustomerId: "cus_pi_race", status: "active",
      });
      // DISTINCT event ids, deliberately: the event-id unique is exactly what
      // this path used to lean on, so reusing one id would let that constraint
      // answer and the test would prove nothing about the new one. This is the
      // race credit_ledger_auto_topup_uq exists for — the in-tx pre-check
      // cannot see a sibling transaction that has not committed yet.
      // NON-VACUITY: assert on the live database that the index this race
      // depends on actually exists here. Without this the test would pass just
      // as happily on a Postgres where migration 0006 never ran — the
      // pre-check alone can absorb a race that happens to serialize, so a
      // green result would not distinguish "the guarantee holds" from "the
      // guarantee is absent and we got lucky".
      const indexes = (await harness.pool.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'credit_ledger'`
      )) as unknown as { rows: { indexname: string }[] };
      expect(
        indexes.rows.map((r) => r.indexname),
        "migration 0006 must be applied for this race to prove anything"
      ).toContain("credit_ledger_auto_topup_uq");

      const now = Math.floor(Date.now() / 1000);
      const mk = (id: string) =>
        ({
          id, object: "event", type: "payment_intent.succeeded",
          api_version: "x", created: now, livemode: false,
          pending_webhooks: 0, request: null,
          data: { object: {
            id: "pi_race_one", object: "payment_intent",
            customer: "cus_pi_race", amount: 1000,
            metadata: { respin_kind: "auto_topup", workspace_id: ws },
          } },
        }) as never;
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          handleStripeEvent(db, mk(`evt_pi_race_${i}`))
        )
      );
      const packs = (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws && r.refType === "auto_topup"
      );
      expect(packs, "one PaymentIntent must mint one pack").toHaveLength(1);
      expect((await deriveBalance(db, ws)).balance).toBe(
        CONFIG_V1_SEED.pack.credits
      );
      // Exactly one delivery may report "processed"; the losers either
      // converge quietly to "ignored" (pre-check saw the committed winner) or
      // fail LOUDLY on the index (23505 → 500 → Stripe redelivers → the
      // pre-check converges next time). What none of them may do is claim
      // DuplicateStripeEvent: each carried its OWN event id, so no committed
      // row backs that verdict and the 200 it produces would discard a real
      // event — the exact dishonesty the pause race above was written to catch.
      const outcomes = results.map((r) =>
        r.status === "fulfilled" ? r.value : "threw"
      );
      expect(outcomes.filter((o) => o === "processed")).toHaveLength(1);
      for (const r of results) {
        if (r.status === "rejected") {
          expect(r.reason instanceof DuplicateStripeEvent).toBe(false);
        }
      }
    }
  );

  it(
    "PHASE 3 code-review: owner Pause racing its own reconciling webhook — one open pause, and a lost race NEVER becomes a silent acknowledged-and-discarded event",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const ws = await mkWorkspace();
      await db.insert(subscriptions).values({
        workspaceId: ws, stripeCustomerId: "cus_pause_race",
        stripeSubscriptionId: "sub_pause_race", stripePriceId: "price_creator",
        status: "active",
      });
      const now = Math.floor(Date.now() / 1000);
      // DISTINCT event ids for the two concurrent deliveries (code-review
      // NOTE). With one shared id the honesty clause below was
      // non-discriminating: once either call committed the stripe_events row,
      // "isDuplicate AND no row exists" was false whether or not a FOREIGN
      // 23505 had been mis-mapped to DuplicateStripeEvent. Distinct ids mean a
      // duplicate verdict can only come from that mis-mapping — which is the
      // defect the case exists to catch.
      const mkPauseEvent = (id: string) => ({
        id, object: "event",
        type: "customer.subscription.updated",
        api_version: "x", created: now, livemode: false,
        pending_webhooks: 0, request: null,
        data: { object: {
          id: "sub_pause_race", object: "subscription", customer: "cus_pause_race",
          status: "active", cancel_at_period_end: false,
          pause_collection: { behavior: "void", resumes_at: now + 30 * 86400 },
          items: { object: "list", data: [{
            id: "si_pause", object: "subscription_item",
            price: { id: "price_creator", object: "price" },
            current_period_start: now, current_period_end: now + 30 * 86400,
          }] },
        } },
      }) as never;
      const eventIds = ["evt_pause_race_a", "evt_pause_race_b"];

      // The owner's action commits the local pause at the same moment the
      // reconciling webhook does. Both now go through ensurePauseStarted.
      const results = await Promise.allSettled([
        db.transaction((t) => ensurePauseStarted(t, ws, new Date(), undefined)),
        ...eventIds.map((id) => handleStripeEvent(db, mkPauseEvent(id))),
      ]);

      // 1. The invariant: never two open pauses.
      const open = (await db.select().from(pausePeriods)).filter(
        (p) => p.workspaceId === ws && p.endedAt === null
      );
      expect(open).toHaveLength(1);

      // 2. A loser must fail LOUDLY. The pre-fix code mapped every 23505 —
      //    pause_periods_open_uq included — to DuplicateStripeEvent, so the
      //    route answered 200 with no stripe_events row and no mirror update:
      //    the event was acknowledged and discarded. Any rejection here must
      //    be a real error that reaches the 500-retry path instead.
      //    Each webhook call carries its OWN event id, so a DuplicateStripeEvent
      //    verdict can only be honest if a committed row for THAT id exists —
      //    and here none can, because no other delivery used it.
      const [, ...webhookResults] = results;
      for (const [i, r] of webhookResults.entries()) {
        if (r.status === "rejected") {
          expect(
            r.reason instanceof DuplicateStripeEvent &&
              !(await eventRowExists(db, eventIds[i])),
            `a duplicate verdict for ${eventIds[i]} is only honest when a committed row backs it`
          ).toBe(false);
        }
      }

      // 3. Convergence: redelivery after the race settles is safe and the
      //    mirror ends up paused either way.
      const settled = await Promise.allSettled([
        handleStripeEvent(db, mkPauseEvent("evt_pause_race_c")),
      ]);
      expect(
        settled[0].status === "fulfilled" ||
          settled[0].reason instanceof DuplicateStripeEvent
      ).toBe(true);
      const [mirror] = (await db.select().from(subscriptions)).filter(
        (s) => s.workspaceId === ws
      );
      expect(mirror.pausedAt).not.toBeNull();
    }
  );

  // ==========================================================================
  // AUDIT 2026-08-17 #3 — THE DIFFERENTIAL-PAYLOAD RACES.
  //
  // The audit's most cross-confirmed finding (a Claude depth read, the
  // correctness critic, and Codex, independently, on the same lines) and the
  // one the plan names as needing a race "where the winning state is
  // observable". Every pre-existing webhook race in this file fires the SAME
  // payload concurrently — which idempotency masks, so they could not have
  // caught this: two deliveries carrying the same facts converge no matter how
  // badly they interleave.
  //
  // These carry DIFFERENT facts. Each of the five mirror writers was an
  // unlocked read-then-write: read the mirror, check staleness against THAT
  // snapshot, then a plain `.update()`. Unlocked, both racers read the SAME
  // pre-state, both pass their own staleness check, and whichever commits
  // second wins — so a stale delivery silently reverts newer billing state,
  // with no later event to correct it.
  //
  // The assertion in each case is ORDER-INDEPENDENCE: the final mirror is the
  // NEWER payload's, whichever racer the scheduler happens to run first. That
  // is the property the lock buys, and it is false without it.
  // ==========================================================================

  it(
    "AUDIT #3: two subscription snapshots with DIFFERENT payloads — the NEWER one survives, whichever wins the scheduler",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      await seedAuthUser(db, "diff_sub_user");
      await seedDb(db);
      await prewarmPool(4);

      // ROUNDS, and the count is load-bearing. A real race is scheduler-
      // dependent: with the lock removed this assertion failed on 3 of 5
      // single-round runs, so ONE round would be a flaky proof — green on the
      // mutant two times in five. Each round is an independent workspace and an
      // independent coin flip; six of them makes the mutant reliably red while
      // the fixed code stays deterministically green (it does not depend on who
      // wins — that is the whole property).
      const ROUNDS = 6;
      for (let round = 0; round < ROUNDS; round += 1) {
        const ws = await mkWorkspace();
        const cus = `cus_diff_sub_${round}`;
        const subId = `sub_diff_${round}`;
        await db.insert(subscriptions).values({
          workspaceId: ws, stripeCustomerId: cus,
          stripeSubscriptionId: subId, stripePriceId: "price_creator",
          status: "active",
        });
        const now = Math.floor(Date.now() / 1000);
        const OLD_AT = now;
        const NEW_AT = now + 3600; // an hour later — an unambiguous ordering.

        const mkSnapshot = (id: string, priceId: string, createdSec: number) =>
          ({
            id, object: "event",
            type: "customer.subscription.updated",
            api_version: "x", created: createdSec, livemode: false,
            pending_webhooks: 0, request: null,
            data: { object: {
              id: subId, object: "subscription", customer: cus,
              status: "active", cancel_at_period_end: false,
              pause_collection: null,
              items: { object: "list", data: [{
                id: `si_diff_${round}`, object: "subscription_item",
                price: { id: priceId, object: "price" },
                current_period_start: createdSec,
                current_period_end: createdSec + 30 * 86400,
              }] },
            } },
          }) as never;

        // The creator→pro UPGRADE (newer) racing a stale creator snapshot.
        // `stripePriceId` is what `state.ts` derives the TIER from at read
        // time, so a reverted price is a paying customer served the wrong
        // entitlement — silently, with no later event to correct it.
        await Promise.allSettled([
          handleStripeEvent(db, mkSnapshot(`evt_diff_new_${round}`, "price_pro", NEW_AT)),
          handleStripeEvent(db, mkSnapshot(`evt_diff_old_${round}`, "price_creator", OLD_AT)),
        ]);

        const [mirror] = (await db.select().from(subscriptions)).filter(
          (s) => s.workspaceId === ws
        );
        // UNLOCKED this is `price_creator` whenever the stale racer commits
        // second: both read `mirrorEventAt: null`, both pass the order guard,
        // and the loser's plain `.update()` lands last. The lock makes the
        // loser re-read the committed watermark, so it is `ignored` instead.
        expect(
          mirror.stripePriceId,
          `round ${round}: the newer snapshot's price must survive whichever racer commits last`
        ).toBe("price_pro");
        expect(mirror.mirrorEventAt?.getTime()).toBe(NEW_AT * 1000);
      }
    }
  );

  it(
    "AUDIT #3: a stale invoice racing a NEWER dunning snapshot cannot end the grace period it opens",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      await seedAuthUser(db, "diff_grace_user");
      await seedDb(db);
      await appendConfigVersion(
        db,
        { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
        "test-admin"
      );
      const ws = await mkWorkspace();
      await db.insert(subscriptions).values({
        workspaceId: ws, stripeCustomerId: "cus_diff_grace",
        stripeSubscriptionId: "sub_diff_grace", stripePriceId: "price_creator",
        status: "active",
      });
      const now = Math.floor(Date.now() / 1000);
      const STALE_AT = now;
      const DUNNING_AT = now + 3600;

      // NEWER: the dunning snapshot that opens the 7-day window and stamps the
      // watermark. Only subscription snapshots stamp `mirrorEventAt`.
      const dunning = {
        id: "evt_diff_dunning", object: "event",
        type: "customer.subscription.updated",
        api_version: "x", created: DUNNING_AT, livemode: false,
        pending_webhooks: 0, request: null,
        data: { object: {
          id: "sub_diff_grace", object: "subscription", customer: "cus_diff_grace",
          status: "past_due", cancel_at_period_end: false, pause_collection: null,
          items: { object: "list", data: [{
            id: "si_diff_grace", object: "subscription_item",
            price: { id: "price_creator", object: "price" },
            current_period_start: now, current_period_end: now + 30 * 86400,
          }] },
        } },
      } as never;

      // The dunning snapshot is applied FIRST and allowed to COMMIT, rather
      // than raced against the invoice — and that ordering is the point, not a
      // shortcut. Raced, this case was VACUOUS: the invoice's own mirror read
      // lands before the snapshot's UPDATE commits, so it sees no deadline and
      // skips the clear for an innocent reason. Verified by mutation — with the
      // staleness guard removed the raced version passed 3 of 3.
      //
      // The production shape that actually bites is a grace window already
      // OPEN and DURABLE when the late invoice arrives, which is exactly what
      // "delivered late" means. So: commit the window, then race the late
      // delivery against its own redelivery.
      await handleStripeEvent(db, dunning);
      const [opened] = (await db.select().from(subscriptions)).filter(
        (s) => s.workspaceId === ws
      );
      expect(opened.graceExpiresAt, "the dunning window must be open").not.toBeNull();
      const deadline = opened.graceExpiresAt as Date;

      // OLDER: a paid invoice delivered late, twice, concurrently, under
      // DISTINCT event ids — the redelivery race Stripe actually produces. Its
      // allowance is a fact and is still granted; its opinion about the dunning
      // window is stale. One invoice must still mint one allowance (the
      // per-invoice unique), and NEITHER delivery may end the window.
      const mkStaleInvoice = (id: string) =>
        ({
          id, object: "event",
          type: "invoice.paid",
          api_version: "x", created: STALE_AT, livemode: false,
          pending_webhooks: 0, request: null,
          data: { object: {
            id: "in_diff_stale", object: "invoice", customer: "cus_diff_grace",
            billing_reason: "subscription_cycle",
            period_start: now, period_end: now,
            // The RECURRING subscription line — the one that carries the
            // allowance. `parent.type` and the proration flag live INSIDE
            // `subscription_item_details` (installed SDK Invoices.d.ts), and
            // getting that wrong is not cosmetic: an earlier draft of this
            // fixture put `proration` at the line level and omitted
            // `parent.type`, the selector correctly rejected it as not-a-
            // subscription-line, `invoice.paid` was `ignored`, and the case
            // "passed" its grace assertions having granted nothing at all.
            lines: { object: "list", data: [{
              id: "il_diff", object: "line_item",
              period: { start: now, end: now + 30 * 86400 },
              pricing: { price_details: { price: "price_creator" } },
              parent: {
                type: "subscription_item_details",
                subscription_item_details: {
                  subscription: "sub_diff_grace",
                  subscription_item: "si_diff_grace",
                  proration: false,
                },
              },
            }] },
            parent: { subscription_details: { subscription: "sub_diff_grace" } },
          } },
        }) as never;

      await prewarmPool(4);
      await Promise.allSettled([
        handleStripeEvent(db, mkStaleInvoice("evt_diff_stale_a")),
        handleStripeEvent(db, mkStaleInvoice("evt_diff_stale_b")),
      ]);

      const [mirror] = (await db.select().from(subscriptions)).filter(
        (s) => s.workspaceId === ws
      );
      // BOTH halves of #3 are needed here, and only one of them is the lock.
      // The lock serializes the two deliveries (so the per-invoice pre-check
      // sees the committed winner instead of losing a unique-index race);
      // `invoiceIsStale` in webhooks.ts is what stops the older opinion winning
      // once they are serialized. With the deadline gone, `past_due` derives to
      // `free` in state.ts — a paying customer dropped out of the window they
      // were promised, permanently, because nothing re-opens a deadline.
      expect(
        mirror.graceExpiresAt?.getTime(),
        "a stale paid invoice must not end the newer dunning window"
      ).toBe(deadline.getTime());
      expect(mirror.status).toBe("past_due");
      expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe(
        "grace"
      );
      // …and the redelivery race still mints exactly one allowance.
      const grants = (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws && r.refType === "invoice"
      );
      expect(grants, "one invoice must mint one allowance").toHaveLength(1);
    }
  );
});

async function eventRowExists(
  db: Awaited<ReturnType<typeof createDockerTestDb>>["db"],
  id: string
): Promise<boolean> {
  const rows = await db.select().from(stripeEvents);
  return rows.some((r) => r.id === id);
}
