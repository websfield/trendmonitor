// R17 — THE FREE-TIER MINT, which is a WRITE ON A READ PATH.
//
// `allowances.free` has been in the schema and the seed since M1 and was read
// by nothing: the only `grantCredits` call site is the Stripe webhook, guarded
// to throw for any tier that is not creator/pro/studio. So a Free workspace had
// a permanent balance of zero, and slice 6's acceptance walk was unwalkable.
//
// WHAT THIS FILE HAS TO PROVE, beyond "25 credits appear":
//
//  1. It is IDEMPOTENT, and the idempotency is in the SCHEMA rather than in a
//     read-then-write (the concurrency half is `free-mint.docker.test.ts`;
//     PGlite is single-connection and its race is a sequence).
//  2. It does NOT run for a paid tier — mutation M5.
//  3. It CANNOT TAKE A BALANCE READ DOWN. Every balance read on a Free
//     workspace now writes a row, including reads inside the Stripe webhook's
//     single transaction, whose failure earns a redelivery. That is the cost
//     R17 names, and it is a test here rather than a hope.
//  4. Free has NO ROLLOVER, which is not a special case in the fold: the lot
//     simply expires at the end of its calendar month.
//  5. IT DOES NOT MINT ON A PAUSED WORKSPACE (billing gate, 2026-09-01). R-12
//     is "no charges, no grants, credits frozen", and the mint is a GRANT. The
//     file shipped with no pause case at all, which is why the hole existed:
//     `mintFreeAllowanceIfDue` read `billing.tier` and never `billing.state`
//     nor `hasOpenPause`, and TWO reachable states resolve `tier: "free"`
//     while paused — a live paused subscription whose price is unmapped
//     (`state.ts` returns `{tier: "free", state: "paused"}`) and the
//     `{open pause_periods, mirror canceled}` drift `state.ts` records as
//     reachable. It COMPOUNDS: `fold.ts`'s `effectiveExpiry` freezes a lot's
//     clock under an open pause, so grants minted while paused never expire
//     and accumulate, defeating the no-rollover property the expiry exists to
//     give. Both branches are driven separately below, because either one
//     alone leaves the other state minting.
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  createTestDb,
  creditLedger,
  ensureUserWorkspace,
  seedAuthUser,
  seedDb,
  subscriptions,
  withWorkspace,
  type TestDb,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import {
  deriveBalance,
  deriveBalanceInTx,
  freeAllowanceExpiry,
  freeAllowancePeriodKey,
} from "../src/balance";
import { recordPauseEnd, recordPauseStart } from "../src/pause";
import { getWorkspaceBillingState } from "../src/state";
import { handleStripeEvent } from "../src/stripe/webhooks";

const FREE = CONFIG_V1_SEED.allowances.free;

describe("the Free-tier monthly mint (R17)", () => {
  let db: TestDb;
  let ws: VerifiedWorkspaceId;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" });
    ws = (await withWorkspace(db, { authUserId: "user_a" })).workspaceId;
  });

  const mints = () =>
    db
      .select()
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.workspaceId, ws),
          eq(creditLedger.refType, "free_allowance")
        )
      );

  it("the FIRST balance read mints the allowance; the second mints nothing", async () => {
    const first = await deriveBalance(db, ws);
    expect(first.balance).toBe(FREE);
    const second = await deriveBalance(db, ws);
    expect(second.balance).toBe(FREE);
    expect(await mints()).toHaveLength(1);
  });

  it("the row is a GRANT keyed on the UTC calendar month, expiring at that month's end", async () => {
    const view = await deriveBalance(db, ws);
    const [row] = await mints();
    expect(row.kind).toBe("grant");
    expect(row.delta).toBe(FREE);
    expect(row.refId).toBe(freeAllowancePeriodKey(view.asOf));
    expect(row.expiresAt).toEqual(freeAllowanceExpiry(view.asOf));
    // NO ROLLOVER (PRD §4G), and it is the ordinary lot fold that enforces it:
    // the expiry is the first instant of the next month, so the lot is live
    // for the rest of this one and crosses on its own.
    expect(row.expiresAt!.getTime()).toBeGreaterThan(view.asOf.getTime());
    // THE WRITE CLOCK, not the column default (the rule at the top of
    // ledger.ts): a lot stamped at transaction start can look born before a
    // pause it did not exist for, and would be invisible to the very fold that
    // wrote it.
    expect(row.createdAt.getTime()).toBeLessThanOrEqual(view.asOf.getTime());
    // ...and the version that set the number is recorded, like every other lot.
    expect(row.configVersion).toBeGreaterThan(0);
  });

  it("M5: a PAID tier mints NOTHING", async () => {
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, stripePriceMap: { price_pro: "pro" } },
      "test-admin"
    );
    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_x",
      stripePriceId: "price_pro",
      status: "active",
    });
    expect((await deriveBalance(db, ws)).balance).toBe(0);
    expect(await mints()).toHaveLength(0);
  });

  it("a workspace that FALLS BACK to Free mints — the tier is read at balance time, never cached", async () => {
    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_x",
      stripePriceId: "price_pro",
      // No `stripePriceMap` entry for it: `getWorkspaceBillingState` resolves
      // `unmapped_price` to FREE entitlements, so the Free allowance is what
      // this workspace is entitled to right now.
      status: "active",
    });
    expect((await deriveBalance(db, ws)).balance).toBe(FREE);
  });

  it("R-12 (B4): an OPEN PAUSE mints nothing — a grant is a grant, and credits are frozen", async () => {
    // THE AUTHORITY BRANCH. `hasOpenPause` (`pause_periods`) is what
    // `debitCredits`, `grantCredits` and `createPackCheckoutUrl` all refuse on;
    // the mint is the one grant that did not ask it. This workspace has no
    // subscription at all, so `getWorkspaceBillingState` reads `{tier: "free",
    // state: "free"}` — the mirror says nothing and only the authority can
    // refuse.
    await db.transaction((tx) => recordPauseStart(tx, ws, new Date()));
    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(
      state.state,
      "fixture check: the MIRROR must be silent here, or this drives the wrong branch"
    ).toBe("free");
    expect((await deriveBalance(db, ws)).balance).toBe(0);
    expect(await mints()).toHaveLength(0);
  });

  it("a PAUSED subscription resolving to Free (unmapped price) mints nothing", async () => {
    // THE MIRROR BRANCH, driven ALONE: there is no `pause_periods` row, so
    // `hasOpenPause` is false and only `billing.state === "paused"` can refuse.
    // The price is unmapped on purpose — that is what makes `resolveTier`
    // answer `free` while `state` answers `paused`, which is the exact pair the
    // pre-fix code minted on (the "FALLS BACK to Free mints" case above is the
    // same row without the pause).
    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_x",
      stripePriceId: "price_unmapped",
      status: "active",
      pausedAt: new Date(),
    });
    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(state.tier, "fixture check").toBe("free");
    expect(state.state, "fixture check").toBe("paused");
    expect((await deriveBalance(db, ws)).balance).toBe(0);
    expect(await mints()).toHaveLength(0);
  });

  it("the pause SUSPENDS the mint rather than cancelling it: the month is still mintable after a resume", async () => {
    // "Credits are frozen" is not "credits are forfeited" — R-12's own wording,
    // and the reason the refusal is a SKIP rather than a poisoned period key.
    await db.transaction((tx) => recordPauseStart(tx, ws, new Date()));
    expect((await deriveBalance(db, ws)).balance).toBe(0);
    await db.transaction((tx) => recordPauseEnd(tx, ws, new Date()));
    expect((await deriveBalance(db, ws)).balance).toBe(FREE);
    expect(await mints()).toHaveLength(1);
  });

  it("an allowance configured to ZERO mints nothing and does not throw", async () => {
    // `credit_ledger_delta_nonzero` and `credit_ledger_delta_sign` both refuse
    // a zero grant, so a legitimate operator decision must SKIP the mint rather
    // than become a 500 on every Free workspace's usage page.
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, allowances: { ...content.allowances, free: 0 } },
      "test-admin"
    );
    expect((await deriveBalance(db, ws)).balance).toBe(0);
    expect(await mints()).toHaveLength(0);
  });

  it("a database with NO active config does not lose its balance authority", async () => {
    // The mint needs config; a balance read must not. `createTestDb` alone has
    // no `config_versions` row, which is the state this asserts.
    const bare = await createTestDb();
    await seedAuthUser(bare, "user_b");
    await ensureUserWorkspace(bare, { authUserId: "user_b", name: "B" });
    const bareWs = (await withWorkspace(bare, { authUserId: "user_b" }))
      .workspaceId;
    const view = await deriveBalance(bare, bareWs);
    expect(view.balance).toBe(0);
  });

  it("R17's COST: a balance read INSIDE the Stripe webhook's transaction does not fail the webhook", async () => {
    // THE REAL DISPATCHER, with a balance read composed into ITS OWN
    // transaction — which is the only way to assert the property R17 names.
    // A wrapper around `db.transaction` is what reaches inside
    // `handleStripeEvent`; the alternative (a webhook-SHAPED transaction
    // written here) would assert a property of this test file.
    let readInsideWebhook = 0;
    const wrapped = new Proxy(db as object, {
      get(target, prop, receiver) {
        if (prop === "transaction") {
          return (fn: (tx: never) => Promise<unknown>) =>
            (target as TestDb).transaction(async (tx) => {
              const out = await fn(tx as never);
              // Inside the webhook's transaction, holding its workspace lock.
              await deriveBalanceInTx(tx, ws);
              readInsideWebhook += 1;
              return out;
            });
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as TestDb;

    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_free",
      status: "none",
    });
    // THE PAYLOAD SHAPE IS THE ONE `stripe.test.ts` uses, field for field: the
    // service period lives on the ITEM, not at the top level, and a handler
    // reading a missing one produces "Invalid time value" rather than the
    // property this case is about.
    const sec = Math.floor(Date.now() / 1000);
    const event = {
      id: "evt_free_mint",
      object: "event",
      api_version: "2026-07-29.dahlia",
      type: "customer.subscription.updated",
      created: sec,
      livemode: false,
      pending_webhooks: 0,
      request: null,
      data: {
        object: {
          id: "sub_free",
          object: "subscription",
          customer: "cus_free",
          status: "active",
          cancel_at_period_end: false,
          pause_collection: null,
          items: {
            object: "list",
            data: [
              {
                id: "si_free",
                object: "subscription_item",
                // UNMAPPED on purpose: the workspace stays entitled to FREE,
                // which is the tier whose mint this case is about.
                price: { id: "price_unmapped", object: "price" },
                current_period_start: sec,
                current_period_end: sec + 30 * 86400,
              },
            ],
          },
        },
      },
    } as unknown as Parameters<typeof handleStripeEvent>[1];

    const outcome = await handleStripeEvent(wrapped, event);
    expect(outcome).toBe("processed");
    expect(readInsideWebhook, "the wrapper never ran").toBeGreaterThan(0);
    // The mint landed inside the webhook's own committed transaction, and the
    // webhook still succeeded — which is the whole property.
    expect(await mints()).toHaveLength(1);
    // ...and a SECOND delivery of a different event still mints nothing more.
    const again = { ...event, id: "evt_free_mint_2" } as typeof event;
    expect(await handleStripeEvent(wrapped, again)).toBe("processed");
    expect(await mints()).toHaveLength(1);
  });

  it("the mint composes into a transaction that has ALREADY written ledger rows", async () => {
    // The shape `debitCredits`/`refundCredits` produce: the workspace lock is
    // held, rows exist, and the fold that runs next must see the mint it just
    // wrote (which it only does if `created_at` is the fold's own instant).
    const view = await db.transaction(async (tx) => {
      await tx.insert(creditLedger).values({
        workspaceId: ws,
        delta: 10,
        kind: "grant",
        expiresAt: new Date(Date.now() + 86400_000),
        refType: "test",
        refId: "pre",
        configVersion: 1,
      });
      return deriveBalanceInTx(tx, ws);
    });
    expect(view.balance).toBe(10 + FREE);
  });
});
