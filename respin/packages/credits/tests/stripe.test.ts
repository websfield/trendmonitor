// Webhook integration suite (M1 phase 3 task 9): every build-plan M1
// accept-when case + every phase-plan edge bullet, on PGlite with constructed
// Stripe.Event objects typed from the installed SDK. Keyless: the handler
// never touches the Stripe API; signature verification is the route's edge
// (tested separately via the SDK's test-header helper in routes.test.ts land).
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
  createTestDb,
  creditLedger,
  schema,
  stripeEvents,
  subscriptions,
  trustWorkspaceId,
  seedAuthUser,
  seedDb,
  type TestDb,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import { CONFIG_V1_SEED } from "@respin/db";
import { handleStripeEvent, DuplicateStripeEvent } from "../src/stripe/webhooks";
import { deriveBalance } from "../src/balance";
import { getWorkspaceBillingState } from "../src/state";
import { ensurePauseEnded, ensurePauseStarted, hasOpenPause } from "../src/pause";
import { maybeAutoTopup } from "../src/stripe/auto-topup";
import { addMonthsUtc } from "../src/months";
import { hasLiveStripeSubscription } from "../src/state";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HOUR = 3_600_000;
let eventSeq = 0;

/**
 * Fixture type pressure (code-review CHANGE, and the ROOT CAUSE of blockers 1
 * and 3): every fixture below is checked against the INSTALLED SDK's own types
 * via `satisfies DeepPartial<T>`. A field that does not exist on the real
 * Stripe object — the fabricated `customer` on a Customer that hid blocker 1 —
 * or one with the wrong value type is now a red typecheck, not a green test.
 *
 * DeepPartial (not Partial) keeps fixtures small without losing that check at
 * nested levels, where both blockers actually lived (`invoice.lines[].period`,
 * `session.payment_status`). Required fields we deliberately omit are not the
 * defect class these tests exist to catch; MISNAMED and MIS-TYPED ones are.
 *
 * KNOWN LIMITS — do not over-trust this guard (code-review NOTE):
 *  1. An OMITTED field is invisible, by construction.
 *  2. Stripe widens many unions with `OtherString` (= string & {}), so a wrong
 *     VALUE on those still compiles: `payment_status: "settled"` type-checks.
 *     `billing_reason` has no OtherString, which is why the untyped one there
 *     was caught.
 *  3. It is a SHAPE check, not a semantics check. It could not have caught
 *     reading the wrong invoice LINE — that defect needed a fixture with two
 *     lines and a test that asserts which one was used.
 */
type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * The ONE remaining cast, and why it is not the hole the blockers came through:
 * `Stripe.Event.data.object` is a discriminated union over every Stripe object,
 * so no literal can satisfy it generically. The type pressure that matters has
 * already been applied to `object` by its builder before it arrives here.
 */
function mkEvent(type: string, object: object): Stripe.Event {
  eventSeq += 1;
  return {
    id: `evt_test_${eventSeq}`,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: nowSec(),
    type,
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

async function setup(): Promise<{
  db: TestDb;
  ws: VerifiedWorkspaceId;
  customer: string;
}> {
  const db = await createTestDb();
  await seedAuthUser(db, "stripe_user");
  await seedDb(db); // config v1
  // Map a price to the creator tier (as /admin/config would after stripe:setup)
  await appendConfigVersion(
    db,
    { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator", price_pack: "pack" } },
    "test-admin"
  );
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name: "S" })
    .returning();
  const ws = trustWorkspaceId(w.id);
  // The stored customer→workspace mapping (created at checkout creation)
  await db.insert(subscriptions).values({
    workspaceId: ws,
    stripeCustomerId: "cus_test",
    status: "none",
  });
  return { db, ws, customer: "cus_test" };
}

function subObject(over: DeepPartial<Stripe.Subscription> = {}) {
  const now = nowSec();
  const base = {
    id: "sub_1",
    object: "subscription",
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: false,
    pause_collection: null,
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          price: { id: "price_creator", object: "price" },
          current_period_start: now,
          current_period_end: now + 30 * 86400,
        },
      ],
    },
  } satisfies DeepPartial<Stripe.Subscription>;
  return { ...base, ...over };
}

/**
 * A subscription invoice. The service period lives on the LINE ITEM; the
 * top-level `period_end` deliberately sits at invoice-CREATION time, exactly
 * as Stripe emits it for `subscription_create` ("the latest timestamp at which
 * invoice items can be associated with this invoice" — SDK docs). Reading the
 * top-level field is blocker 3, and this fixture now makes that read produce a
 * visibly wrong expiry instead of a coincidentally-right one.
 */
function invoiceObject(
  over: DeepPartial<Stripe.Invoice> = {},
  priceId = "price_creator"
) {
  const now = nowSec();
  const base = {
    id: "in_1",
    object: "invoice",
    customer: "cus_test",
    billing_reason: "subscription_cycle",
    period_start: now,
    period_end: now,
    // The line item is the authority for BOTH the service period and the
    // price the invoice actually charged.
    lines: {
      object: "list",
      data: [subscriptionLine(priceId, now)],
    },
    parent: { subscription_details: { subscription: "sub_1" } },
  } satisfies DeepPartial<Stripe.Invoice>;
  return { ...base, ...over };
}

/**
 * The RECURRING subscription line item — the one that carries the allowance.
 * `proration: false` is stated rather than omitted: DeepPartial makes an
 * omitted field invisible, and "is this a proration" is the exact question
 * the selector now asks.
 */
function subscriptionLine(priceId: string, now: number) {
  return {
    id: "il_1",
    object: "line_item",
    period: { start: now, end: now + 30 * 86400 },
    pricing: { price_details: { price: priceId } },
    parent: {
      type: "subscription_item_details",
      subscription_item_details: {
        subscription: "sub_1",
        subscription_item: "si_1",
        proration: false,
      },
    },
  } satisfies DeepPartial<Stripe.InvoiceLineItem>;
}

/**
 * A SUBSCRIPTION-ITEM proration — the real trap, and the shape this fixture
 * got WRONG for two review rounds. A plan switch prorates the subscription
 * item itself, so the line carries `parent.type: "subscription_item_details"`
 * with `proration: true` (installed SDK: `Parent.SubscriptionItemDetails` has
 * its own `proration` boolean; Invoices.d.ts names exactly this field as the
 * recommended way to identify prorations). Building it as an invoice-item
 * proration made the BLOCKER 5 pin pass against a selector that still picked
 * prorations — the test asserted the wrong shape and so proved nothing.
 */
function prorationLine(priceId: string, now: number) {
  return {
    id: "il_proration",
    object: "line_item",
    period: { start: now, end: now + 5 * 86400 },
    pricing: { price_details: { price: priceId } },
    parent: {
      type: "subscription_item_details",
      subscription_item_details: {
        subscription: "sub_1",
        subscription_item: "si_1",
        proration: true,
      },
    },
  } satisfies DeepPartial<Stripe.InvoiceLineItem>;
}

/** The other proration shape: a standalone invoice item, not a subscription item. */
function invoiceItemProrationLine(priceId: string, now: number) {
  return {
    id: "il_ii_proration",
    object: "line_item",
    period: { start: now, end: now + 5 * 86400 },
    pricing: { price_details: { price: priceId } },
    parent: {
      type: "invoice_item_details",
      invoice_item_details: { invoice_item: "ii_1", proration: true },
    },
  } satisfies DeepPartial<Stripe.InvoiceLineItem>;
}

/** An ANNUAL subscription line — a service period REQ-G02's arithmetic cannot honour. */
function annualSubscriptionLine(priceId: string, now: number) {
  return {
    id: "il_annual",
    object: "line_item",
    period: { start: now, end: now + 365 * 86400 },
    pricing: { price_details: { price: priceId } },
    parent: {
      type: "subscription_item_details",
      subscription_item_details: {
        subscription: "sub_1",
        subscription_item: "si_1",
        proration: false,
      },
    },
  } satisfies DeepPartial<Stripe.InvoiceLineItem>;
}

/** The service-period end this fixture's line item declares. */
const LINE_PERIOD_END_SEC = () => nowSec() + 30 * 86400;

function sessionObject(over: DeepPartial<Stripe.Checkout.Session> = {}) {
  const base = {
    id: "cs_1",
    object: "checkout.session",
    customer: "cus_test",
    mode: "payment",
    amount_total: 1000,
    // A completed session is NOT settled money: delayed-notification methods
    // complete as `unpaid` (blocker 4). Fixtures must state this explicitly.
    payment_status: "paid",
    metadata: { respin_kind: "pack" },
  } satisfies DeepPartial<Stripe.Checkout.Session>;
  return { ...base, ...over };
}

function piObject(over: DeepPartial<Stripe.PaymentIntent> = {}) {
  const base = {
    id: "pi_1",
    object: "payment_intent",
    customer: "cus_test",
    amount: 1000,
    metadata: { respin_kind: "auto_topup" },
  } satisfies DeepPartial<Stripe.PaymentIntent>;
  return { ...base, ...over };
}

/**
 * The REAL `customer.*` payload: the object IS the customer. It carries `id`
 * and creator PII (email/name/address) and has NO `customer` field — the
 * shape blocker 1's fixture fabricated one onto.
 */
function customerObject(over: DeepPartial<Stripe.Customer> = {}) {
  const base = {
    id: "cus_test",
    object: "customer",
    email: "creator@example.com",
    name: "A Creator",
  } satisfies DeepPartial<Stripe.Customer>;
  return { ...base, ...over };
}

describe("accept-when: subscribe → grant", () => {
  it("subscription.created mirrors state; invoice.paid (subscription_create) grants the tier allowance expiring the SERVICE period end + 1 month", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    const linePeriodEnd = LINE_PERIOD_END_SEC();
    const invoice = invoiceObject({ billing_reason: "subscription_create" });
    const out = await handleStripeEvent(db, mkEvent("invoice.paid", invoice));
    expect(out).toBe("processed");
    const view = await deriveBalance(db, ws);
    expect(view.balance).toBe(CONFIG_V1_SEED.allowances.creator);
    const [grant] = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "grant"
    );
    // REQ-G02: expiry = SERVICE period end + 1 month (the rollover). On a real
    // subscription_create invoice the top-level period_end is creation time,
    // so the two differ by a full cycle — reading the wrong one (blocker 3)
    // costs every new subscriber their first rollover.
    // Computed with the SAME helper the code uses — not with the naive
    // naive month-setter form it replaced (tenancy round-5 CHANGE). This oracle and
    // the one in BLOCKER 5 both still overflowed month-ends, so on the 7 run
    // dates a year where the fixture's `now + 30 days` lands on a 29th-31st
    // they would have gone RED against correct code — a test that fails by
    // calendar is worse than no test.
    const expected = addMonthsUtc(new Date(linePeriodEnd * 1000), 1);
    expect(grant.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      expected.getTime() - 2000
    );
    expect(grant.expiresAt!.getTime()).toBeLessThanOrEqual(
      expected.getTime() + 2000
    );
    // and the top-level field is NOT what was used (the discriminator)
    const wrong = addMonthsUtc(new Date(invoice.period_end * 1000), 1);
    expect(grant.expiresAt!.getTime()).toBeGreaterThan(
      wrong.getTime() + 20 * 24 * HOUR
    );
    expect(grant.configVersion).toBe(2);
    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(state).toMatchObject({ tier: "creator", state: "active" });
  });
});

describe("accept-when: double-delivered webhook (no double grant)", () => {
  it("the same event id delivered twice grants once; second delivery reports duplicate", async () => {
    const { db, ws } = await setup();
    const event = mkEvent("invoice.paid", invoiceObject());
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    expect(await handleStripeEvent(db, event)).toBe("processed");
    await expect(handleStripeEvent(db, event)).rejects.toThrow(DuplicateStripeEvent);
    const grants = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "grant"
    );
    expect(grants).toHaveLength(1);
    expect((await deriveBalance(db, ws)).balance).toBe(
      CONFIG_V1_SEED.allowances.creator
    );
  });

  /**
   * The handled-type list is DERIVED from the dispatch switch, not typed out
   * (billing round-10 CHANGE 1). AC-3 says EVERY handled event type has a
   * double-delivery test, and a hand-maintained list has now failed that claim
   * twice: round 4 found `checkout.session.async_payment_succeeded` missing and
   * fixed the instance, and round 10 found `customer.subscription.updated`
   * missing — 7 of the 8 `case` labels covered, while the list also carried
   * `customer.updated`, which dispatch does not handle at all. Fixing the CLASS
   * means adding a `case` without a test is a red suite (CLAUDE.md 2026-07-30:
   * fix where the list is BUILT, not the entry that was missing).
   */
  const dispatchCaseTypes = (): string[] => {
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/stripe/webhooks.ts"),
      "utf8"
    );
    const at = src.indexOf("switch (event.type)");
    expect(at, "the dispatch switch must be findable").toBeGreaterThan(0);
    return [...src.slice(at).matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
  };

  it("EVERY handled event type is double-delivery safe (re-dispatch reports duplicate, zero extra writes)", async () => {
    const { db } = await setup();
    const events = [
      mkEvent("customer.subscription.created", subObject()),
      // The type this list was missing while claiming to cover EVERY one.
      mkEvent("customer.subscription.updated", subObject()),
      mkEvent("checkout.session.completed", sessionObject()),
      // The other settlement event round 3 added — omitted from this list
      // until now, so "EVERY handled event type" was one short (code-review
      // NOTE). A different session id: the same one would converge to
      // "ignored" on the per-session rule before reaching the duplicate path.
      mkEvent(
        "checkout.session.async_payment_succeeded",
        sessionObject({ id: "cs_async_dd" })
      ),
      mkEvent("invoice.paid", invoiceObject()),
      mkEvent("invoice.payment_failed", invoiceObject({ billing_reason: "subscription_cycle" })),
      mkEvent("customer.subscription.deleted", subObject({ status: "canceled" })),
      mkEvent("payment_intent.succeeded", piObject({ id: "pi_at" })),
      mkEvent("customer.updated", customerObject()),
    ];
    // THE DERIVED CHECK: the list above must cover every `case` label in
    // dispatch. `customer.updated` is deliberately ALSO exercised (it lands on
    // the `default` branch) — extra coverage is fine, missing coverage is not.
    const handled = dispatchCaseTypes();
    expect(handled.length, "the case-label scan went blind").toBeGreaterThanOrEqual(8);
    expect(handled, "sanity: the scan reads real labels").toContain("invoice.paid");
    const tested = new Set<string>(events.map((e) => e.type));
    expect(
      handled.filter((t) => !tested.has(t)),
      "a `case` in dispatch with no double-delivery test — AC-3 says EVERY handled type has one"
    ).toEqual([]);

    for (const e of events) await handleStripeEvent(db, e);
    const countsBefore = (await db.select().from(creditLedger)).length;
    for (const e of events) {
      await expect(handleStripeEvent(db, e)).rejects.toThrow(DuplicateStripeEvent);
    }
    expect((await db.select().from(creditLedger)).length).toBe(countsBefore);
  });
});

describe("accept-when: cancel → downgrade & payment-failed → grace → downgrade", () => {
  it("subscription.deleted → effective free", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    await handleStripeEvent(db, mkEvent("customer.subscription.deleted", subObject({ status: "canceled" })));
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });

  it("payment_failed → grace for config graceDays; past deadline → free; a second failure never EXTENDS; recovery invoice clears grace", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    await handleStripeEvent(db, mkEvent("invoice.payment_failed", invoiceObject()));
    const s1 = await getWorkspaceBillingState(db, ws, new Date());
    expect(s1.state).toBe("grace");
    const deadline = s1.graceExpiresAt!;
    // ~7 days out (config graceDays)
    expect(deadline.getTime()).toBeGreaterThan(Date.now() + 6.9 * 24 * HOUR);
    expect(deadline.getTime()).toBeLessThan(Date.now() + 7.1 * 24 * HOUR);
    // idempotent: second failure keeps the SAME deadline
    await handleStripeEvent(db, mkEvent("invoice.payment_failed", invoiceObject()));
    const s2 = await getWorkspaceBillingState(db, ws, new Date());
    expect(s2.graceExpiresAt?.getTime()).toBe(deadline.getTime());
    // past the deadline → free (lazy)
    const after = await getWorkspaceBillingState(
      db, ws, new Date(deadline.getTime() + 1000)
    );
    expect(after).toEqual({ tier: "free", state: "free" });
    // recovery: a paid cycle invoice clears grace and grants
    await handleStripeEvent(db, mkEvent("invoice.paid", invoiceObject()));
    const s3 = await getWorkspaceBillingState(db, ws, new Date());
    expect(s3.state).toBe("active");
    expect(s3.graceExpiresAt).toBeUndefined();
  });
});

describe("accept-when: pack purchase", () => {
  it("checkout.session.completed (payment + pack metadata) → pack row with amountCents and 12-month expiry", async () => {
    const { db, ws } = await setup();
    const out = await handleStripeEvent(
      db,
      mkEvent(
        "checkout.session.completed",
        sessionObject({
          id: "cs_pack",
          metadata: { respin_kind: "pack", workspace_id: ws },
        })
      )
    );
    expect(out).toBe("processed");
    const [pack] = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "pack"
    );
    expect(pack.delta).toBe(CONFIG_V1_SEED.pack.credits);
    expect(pack.amountCents).toBe(Math.round(CONFIG_V1_SEED.pack.priceUsd * 100));
    const months =
      (pack.expiresAt!.getTime() - Date.now()) / (30.4 * 24 * HOUR);
    expect(months).toBeGreaterThan(11);
    expect(months).toBeLessThan(13);
  });
  it("records what STRIPE charged, and warns loudly if it ever has to substitute", async () => {
    const { db, ws } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // The normal case: the ledger records Stripe's own figure, not config's.
      await handleStripeEvent(
        db,
        mkEvent(
          "checkout.session.completed",
          sessionObject({
            id: "cs_amt_real",
            amount_total: 1234,
            metadata: { respin_kind: "pack", workspace_id: ws },
          })
        )
      );
      const [rec] = (await db.select().from(creditLedger)).filter(
        (r) => r.refId === "cs_amt_real"
      );
      expect(rec.amountCents).toBe(1234);

      // The unreachable case, made diagnosable rather than silent: a paid
      // session with no amount_total falls back to the configured price — which
      // audit #7's resolver guarantees is the same number — and says so.
      await handleStripeEvent(
        db,
        mkEvent(
          "checkout.session.completed",
          sessionObject({
            id: "cs_amt_null",
            amount_total: null,
            metadata: { respin_kind: "pack", workspace_id: ws },
          })
        )
      );
      const [sub] = (await db.select().from(creditLedger)).filter(
        (r) => r.refId === "cs_amt_null"
      );
      expect(sub.amountCents).toBe(
        Math.round(CONFIG_V1_SEED.pack.priceUsd * 100)
      );
      expect(
        warn.mock.calls.flat().join(" "),
        "a substituted money figure must never be silent"
      ).toContain("NO amount_total");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("R-28: a PACK settling during a pause still mints — decided, not incidental", () => {
  function mkEventAt(type: string, object: object, createdSec: number): Stripe.Event {
    return { ...mkEvent(type, object), created: createdSec } as Stripe.Event;
  }

  /** Subscribe, then open a pause — the same fixture the D-AUDIT-1 suite uses. */
  async function pausedWs() {
    const s = await setup();
    await handleStripeEvent(s.db, mkEvent("customer.subscription.created", subObject()));
    await handleStripeEvent(
      s.db,
      mkEvent(
        "customer.subscription.updated",
        subObject({ pause_collection: { behavior: "void" } })
      )
    );
    expect(await s.db.transaction((t) => hasOpenPause(t, s.ws))).toBe(true);
    return s;
  }

  /**
   * The pack mint branch had no pause consideration at all, in contrast to
   * `invoice.paid`, whose during-pause behaviour is a recorded decision with a
   * greppable log line (D-AUDIT-1). That made this behaviour-by-absence: the
   * window is real (checkout opens → owner pauses → payment settles), and
   * nothing said whether minting was intended or merely unimplemented.
   *
   * R-28 decides it: MINT. The distinction from D-AUDIT-1 is what a pause
   * suspends. A monthly allowance is an ENTITLEMENT the pause suspends, so
   * granting one during a pause would hand over something not owed. A pack is a
   * PURCHASE the owner initiated and Stripe has already collected — refusing
   * the mint would take the money and deliver nothing, which is the one outcome
   * worse than minting into a frozen ledger. The credits are frozen, not lost:
   * the fold freezes every lot's expiry clock for the duration of the pause.
   */
  it("mints the pack, and the credits are frozen rather than lost", async () => {
    const { db, ws } = await pausedWs();

    const out = await handleStripeEvent(
      db,
      mkEventAt(
        "checkout.session.completed",
        sessionObject({
          id: "cs_pack_paused",
          metadata: { respin_kind: "pack", workspace_id: ws },
        }),
        nowSec() + 3600
      )
    );

    // The customer paid; the credits exist.
    expect(out).toBe("processed");
    const packs = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "pack"
    );
    expect(packs).toHaveLength(1);
    expect(packs[0].delta).toBe(CONFIG_V1_SEED.pack.credits);
  });


  /**
   * The CONTINUATION of the INERT deferral, and the reason "inert" needed a
   * bound (billing gate NOTE, 2026-08-18). A drifted `{canceled, pausedAt}` row
   * is harmless only while the subscription stays dead — a RE-SUBSCRIBE restores
   * liveness, and the stale flag comes back to life: the workspace would render
   * `paused` and be refused a pack purchase on a subscription it just bought.
   *
   * The pause-sync branch now pairs `ensurePauseEnded` with `clearPauseMirror`,
   * like its two siblings, so the revival converges the mirror rather than
   * inheriting the stale flag.
   */
  it("a RE-SUBSCRIBE clears a drifted pausedAt instead of reviving it", async () => {
    const { db, ws } = await setup();
    // The drift state: dead subscription, pause flag that outlived it, and NO
    // open pause_periods row (which is what makes it drift rather than a pause).
    await db
      .update(subscriptions)
      .set({
        stripeSubscriptionId: "sub_old_dead",
        stripePriceId: "price_creator",
        status: "canceled",
        pausedAt: new Date(),
        resumesAt: new Date(),
      })
      .where(eq(subscriptions.workspaceId, ws));
    expect(await db.transaction((t) => hasOpenPause(t, ws))).toBe(false);

    // New business: a different subscription id, active, not paused.
    await handleStripeEvent(
      db,
      mkEvent(
        "customer.subscription.updated",
        subObject({ id: "sub_new_after_drift", status: "active" })
      )
    );

    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, ws));
    expect(row.stripeSubscriptionId).toBe("sub_new_after_drift");
    expect(
      row.pausedAt,
      "a revived subscription must not inherit the dead one's pause flag"
    ).toBeNull();
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).not.toBe(
      "paused"
    );
  });

  it("CONTRAST with D-AUDIT-1: a monthly GRANT in the same pause is refused", async () => {
    const { db, ws } = await pausedWs();

    // Same workspace, same open pause, an entitlement rather than a purchase.
    // An hour after the pause became known, so this is a genuine during-pause
    // event and not the delivery race D-AUDIT-1 allows.
    const out = await handleStripeEvent(
      db,
      mkEventAt(
        "invoice.paid",
        invoiceObject({ id: "in_during_pause_contrast" }),
        nowSec() + 3600
      )
    );
    expect(out).toBe("ignored");
    // Workspace-scoped, like every other assertion in this package: the row
    // that must not exist is THIS workspace's grant, not any grant anywhere.
    expect(
      (await db.select().from(creditLedger)).filter(
        (r) => r.workspaceId === ws && r.kind === "grant"
      )
    ).toHaveLength(0);
  });
});

describe("D-M1-6 identity: sole-authority mapping", () => {
  it("unknown customer → refused_unknown_customer, 0 ledger writes, event row recorded null-workspace", async () => {
    const { db } = await setup();
    const out = await handleStripeEvent(
      db,
      mkEvent("invoice.paid", invoiceObject({ customer: "cus_stranger" }))
    );
    expect(out).toBe("refused_unknown_customer");
    expect(await db.select().from(creditLedger)).toHaveLength(0);
    const [row] = await db.select().from(stripeEvents);
    expect(row.outcome).toBe("refused_unknown_customer");
    expect(row.workspaceId).toBeNull();
  });

  it("metadata/mapping MISMATCH → refused_identity_mismatch, 0 ledger writes", async () => {
    const { db } = await setup();
    const out = await handleStripeEvent(
      db,
      mkEvent("checkout.session.completed", {
        id: "cs_evil", object: "checkout.session", customer: "cus_test",
        mode: "payment", amount_total: 1000,
        metadata: { respin_kind: "pack", workspace_id: "workspace-B-forged" },
      })
    );
    expect(out).toBe("refused_identity_mismatch");
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it("AC-4: pack checkout with NO workspace_id metadata → processed for the MAPPED workspace (metadata is a cross-check, not the authority)", async () => {
    const { db, ws } = await setup();
    // The plan originally demanded a refusal here; D-M1-6 makes the stored
    // mapping the sole authority, so absent metadata is fine. Reconciled in
    // the code-review round — this test pins the surviving rule in the
    // direction the implementation actually takes.
    const session = sessionObject({ id: "cs_nometa", metadata: { respin_kind: "pack" } });
    expect(Object.keys(session.metadata ?? {})).not.toContain("workspace_id");
    const out = await handleStripeEvent(db, mkEvent("checkout.session.completed", session));
    expect(out).toBe("processed");
    const packs = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "pack"
    );
    expect(packs).toHaveLength(1);
    expect(packs[0].workspaceId).toBe(ws);
  });

  it("null/absent customer field on a handled type → refusal, never a metadata fallback", async () => {
    const { db, ws } = await setup();
    const out = await handleStripeEvent(
      db,
      mkEvent("invoice.paid", invoiceObject({ customer: null, metadata: { workspace_id: ws } }))
    );
    expect(out).toBe("refused_unknown_customer");
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });
});

describe("edge bullets", () => {
  it("out-of-order: subscription.updated BEFORE created converges to the same mirror state", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.updated", subObject()));
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(state).toMatchObject({ tier: "creator", state: "active" });
    const [mirror] = await db.select().from(subscriptions);
    expect(mirror.stripeSubscriptionId).toBe("sub_1");
  });

  it("proration/non-cycle invoice.paid → ignored, ZERO ledger writes (plan-review F2)", async () => {
    const { db } = await setup();
    const reasons: Stripe.Invoice.BillingReason[] = [
      "subscription_update",
      "manual",
      "subscription_threshold",
    ];
    for (const reason of reasons) {
      const out = await handleStripeEvent(
        db,
        mkEvent("invoice.paid", invoiceObject({ billing_reason: reason }))
      );
      expect(out, reason).toBe("ignored");
    }
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it("unmapped price on a GRANT-BEARING invoice THROWS (tx rolls back incl. event row) and self-heals after a config fix", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(
      db,
      mkEvent(
        "customer.subscription.created",
        subObject({
          items: {
            data: [
              {
                id: "si",
                price: { id: "price_unmapped" },
                current_period_start: nowSec(),
                current_period_end: nowSec() + 30 * 86400,
              },
            ],
          },
        })
      )
    );
    // The INVOICE LINE is the price authority (the mirror is only a fallback),
    // so the unmapped price has to be where the invoice actually charged it.
    const invoice = mkEvent("invoice.paid", invoiceObject({}, "price_unmapped"));
    await expect(handleStripeEvent(db, invoice)).rejects.toThrow(/not mapped to a tier/);
    // the event row rolled back with the tx → Stripe would redeliver
    expect(
      (await db.select().from(stripeEvents)).filter((r) => r.id === invoice.id)
    ).toHaveLength(0);
    // config fix → the SAME event id now processes (self-healing)
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_unmapped: "creator" } },
      "test-admin"
    );
    expect(await handleStripeEvent(db, invoice)).toBe("processed");
    expect((await deriveBalance(db, ws)).balance).toBe(
      CONFIG_V1_SEED.allowances.creator
    );
  });

  it("pause_collection appearing on subscription.updated records a pause; clearing it resumes; deleted-while-paused closes the pause", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.updated", subObject({ pause_collection: { behavior: "void", resumes_at: Math.floor(Date.now() / 1000) + 30 * 86400 } }))
    );
    expect(await db.transaction((t) => hasOpenPause(t, ws))).toBe(true);
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("paused");
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.updated", subObject({ pause_collection: null }))
    );
    expect(await db.transaction((t) => hasOpenPause(t, ws))).toBe(false);
    // re-pause then delete: canceled wins, pause closed
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.updated", subObject({ pause_collection: { behavior: "void" } }))
    );
    await handleStripeEvent(db, mkEvent("customer.subscription.deleted", subObject({ status: "canceled" })));
    expect(await db.transaction((t) => hasOpenPause(t, ws))).toBe(false);
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("free");
  });

  /**
   * RETITLED 2026-08-18 (billing gate, audit remediation). This case was called
   * *"invoice.paid arriving while mirror-paused is PROCESSED … never dropped"*
   * and R-25/D-AUDIT-1 names it as the test that "actively pinned the
   * violation" of REQ-G08. D-AUDIT-1 changed the rule underneath it and the
   * test was never touched — it stayed green for a reason nobody had written
   * down: `mkEvent` stamps `created: nowSec()` and the pause is opened
   * milliseconds earlier, so `lagMs ≈ 0` and it exercises the **tolerance
   * exception**, not the general property its old title claimed.
   *
   * A test asserting a property the system no longer has is CLAUDE.md's
   * 2026-07-30 lesson inverted. It now says what it actually proves, and the
   * refusal branch it never covered is tested below.
   */
  it("a PRE-PAUSE invoice delivered late still grants — the ONE accepted exception (D-AUDIT-1), not a general rule", async () => {
    const { db } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.updated", subObject({ pause_collection: { behavior: "void" } }))
    );
    // `created: nowSec()` — contemporaneous with the pause, so lagMs ≈ 0 and
    // this is the pre-pause delivery race the decision allows.
    const out = await handleStripeEvent(db, mkEvent("invoice.paid", invoiceObject()));
    expect(out).toBe("processed");
    const grants = (await db.select().from(creditLedger)).filter((r) => r.kind === "grant");
    expect(grants).toHaveLength(1);
  });

  it("payment_intent.succeeded WITHOUT auto-top-up metadata (the pack-Checkout PI) → ignored, zero ledger writes", async () => {
    const { db } = await setup();
    const out = await handleStripeEvent(
      db,
      mkEvent("payment_intent.succeeded", {
        id: "pi_plain", object: "payment_intent", customer: "cus_test", amount: 1000, metadata: {},
      })
    );
    expect(out).toBe("ignored");
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it("auto-top-up payment_intent.succeeded → pack-kind row with refType auto_topup + amountCents", async () => {
    const { db, ws } = await setup();
    const out = await handleStripeEvent(
      db,
      mkEvent("payment_intent.succeeded", {
        id: "pi_topup", object: "payment_intent", customer: "cus_test", amount: 1000,
        metadata: { respin_kind: "auto_topup", workspace_id: ws },
      })
    );
    expect(out).toBe("processed");
    const [row] = (await db.select().from(creditLedger)).filter((r) => r.kind === "pack");
    expect(row.refType).toBe("auto_topup");
    expect(row.amountCents).toBe(
      Math.round(CONFIG_V1_SEED.pack.priceUsd * 100)
    );
  });

  it("injected handler failure rolls the event row back; redelivery succeeds with ONE grant total (D-M1-1 discriminator)", async () => {
    const { db } = await setup();
    // First attempt fails via config-unavailability-equivalent: unmapped price.
    await handleStripeEvent(
      db,
      mkEvent(
        "customer.subscription.created",
        subObject({ items: { data: [{ id: "si", price: { id: "price_x" }, current_period_start: 1, current_period_end: 2 }] } })
      )
    );
    const invoice = mkEvent("invoice.paid", invoiceObject({}, "price_x"));
    await expect(handleStripeEvent(db, invoice)).rejects.toThrow();
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_x: "creator" } },
      "test-admin"
    );
    expect(await handleStripeEvent(db, invoice)).toBe("processed");
    const grants = (await db.select().from(creditLedger)).filter((r) => r.kind === "grant");
    expect(grants).toHaveLength(1);
  });

  it("unhandled event types → ignored, recorded, attributed when the customer maps", async () => {
    const { db, ws } = await setup();
    const out = await handleStripeEvent(
      db,
      mkEvent("customer.updated", customerObject())
    );
    expect(out).toBe("ignored");
    const [row] = await db.select().from(stripeEvents);
    expect(row.outcome).toBe("ignored");
    expect(row.workspaceId).toBe(ws); // receipt-time attribution regardless of outcome
  });
});

// The four code-review blockers, each pinned by a case that FAILS against the
// code as it stood. All four survived round 1 only because the fixtures above
// contradicted the payload shapes Stripe actually sends.
describe("code-review blockers (regression pins)", () => {
  it("BLOCKER 1: customer.* events — where the object IS the customer — are attributed, keeping resolvable creator PII inside the REQ-A04 deletion cascade", async () => {
    const { db, ws } = await setup();
    for (const type of ["customer.updated", "customer.deleted"]) {
      // The REAL payload: id + PII, and NO `customer` field to read.
      const obj = customerObject();
      expect("customer" in obj).toBe(false);
      await handleStripeEvent(db, mkEvent(type, obj));
    }
    const rows = await db.select().from(stripeEvents);
    expect(rows).toHaveLength(2);
    // Attributed → they cascade on workspace delete. Unattributed (the old
    // behaviour) would leave email/name/address behind after a deletion.
    expect(rows.every((r) => r.workspaceId === ws)).toBe(true);
    expect(rows.every((r) => r.stripeCustomerId === "cus_test")).toBe(true);

    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, ws));
    expect(await db.select().from(stripeEvents)).toHaveLength(0);
  });

  it("BLOCKER 5: a grant-bearing invoice whose FIRST line is a proration grants from the SUBSCRIPTION line — right tier, right expiry", async () => {
    const { db, ws } = await setup();
    // Stripe sorts `lines` with pending invoice items (INCLUDING PRORATIONS)
    // first, so lines.data[0] is the proration after any portal plan switch.
    // Reading position instead of parent.type gave a Pro subscriber the
    // Creator allowance, expiring a month early.
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { price_creator: "creator", price_pro: "pro" },
      },
      "test-admin"
    );
    const sec = nowSec();
    const invoice = invoiceObject({
      billing_reason: "subscription_cycle",
      lines: {
        object: "list",
        data: [
          // Both proration shapes ahead of the real line. The first is the one
          // that defeated two rounds of fixes: a proration that IS a
          // subscription_item_details line, so selecting on parent.type alone
          // still picks it.
          prorationLine("price_creator", sec),
          invoiceItemProrationLine("price_creator", sec),
          subscriptionLine("price_pro", sec),
        ],
      },
    });
    // Pin the TRAP, not the fix: index 0 must be a subscription-item proration,
    // or this test silently stops exercising the defect it exists for.
    expect(invoice.lines.data?.[0]?.parent?.type).toBe("subscription_item_details");
    expect(
      invoice.lines.data?.[0]?.parent?.subscription_item_details?.proration
    ).toBe(true);

    expect(await handleStripeEvent(db, mkEvent("invoice.paid", invoice))).toBe(
      "processed"
    );
    const [grant] = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "grant"
    );
    // The PRO allowance, not the proration line's creator allowance.
    expect(grant.delta).toBe(CONFIG_V1_SEED.allowances.pro);
    expect(grant.delta).not.toBe(CONFIG_V1_SEED.allowances.creator);
    expect((await deriveBalance(db, ws)).balance).toBe(
      CONFIG_V1_SEED.allowances.pro
    );
    // ...and the expiry from the SUBSCRIPTION line's period, not the
    // proration's short window.
    // Same helper as the code (see the note on the other oracle above).
    const expected = addMonthsUtc(new Date((sec + 30 * 86400) * 1000), 1);
    expect(
      Math.abs(grant.expiresAt!.getTime() - expected.getTime())
    ).toBeLessThan(2000);
  });

  it("BLOCKER 5b: a grant-bearing invoice carrying ONLY prorations fails closed (never prices the allowance off a proration or the mirror)", async () => {
    const { db } = await setup();
    const sec = nowSec();
    const invoice = invoiceObject({
      billing_reason: "subscription_cycle",
      lines: {
        object: "list",
        data: [
          prorationLine("price_creator", sec),
          invoiceItemProrationLine("price_creator", sec),
        ],
      },
    });
    await expect(
      handleStripeEvent(db, mkEvent("invoice.paid", invoice))
    ).rejects.toThrow(/non-proration "subscription_item_details" line/);
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it("BLOCKER 5c: an AMBIGUOUS invoice — two recurring subscription lines — fails closed rather than guessing which one is the allowance", async () => {
    const { db } = await setup();
    const sec = nowSec();
    const second = { ...subscriptionLine("price_pro", sec), id: "il_2" };
    const invoice = invoiceObject({
      billing_reason: "subscription_cycle",
      lines: {
        object: "list",
        data: [subscriptionLine("price_creator", sec), second],
      },
    });
    await expect(
      handleStripeEvent(db, mkEvent("invoice.paid", invoice))
    ).rejects.toThrow(/2 recurring subscription lines/);
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it("BLOCKER 3: an ANNUAL service period is REFUSED, not silently granted one month's credits", async () => {
    const { db } = await setup();
    const sec = nowSec();
    const invoice = invoiceObject({
      billing_reason: "subscription_create",
      lines: {
        object: "list",
        data: [annualSubscriptionLine("price_creator", sec)],
      },
    });
    // The previous guard read `line.price.recurring` — a field `InvoiceLineItem`
    // does not have, hidden behind a cast — so it was dead code that failed
    // OPEN. This asserts the refusal actually fires, on data the payload
    // always carries.
    await expect(
      handleStripeEvent(db, mkEvent("invoice.paid", invoice))
    ).rejects.toThrow(/outside the monthly band/);
    expect(await db.select().from(creditLedger)).toHaveLength(0);
    // ...and the ordinary monthly invoice still passes the same guard.
    expect(
      await handleStripeEvent(db, mkEvent("invoice.paid", invoiceObject()))
    ).toBe("processed");
  });

  it("BLOCKER 6: a LATE invoice.paid after cancellation never resurrects the paid tier", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    // Dunning: payment fails → grace deadline is written.
    await handleStripeEvent(db, mkEvent("invoice.payment_failed", invoiceObject()));
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("grace");
    // Stripe gives up and cancels.
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.deleted", subObject({ status: "canceled" }))
    );
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });

    // The customer now pays the still-open invoice from Stripe's emailed link
    // (or a final invoice.paid simply arrives late — delivery order is not
    // guaranteed). This must NOT hand back a paid tier forever.
    const out = await handleStripeEvent(db, mkEvent("invoice.paid", invoiceObject()));
    expect(out).toBe("processed"); // the money is real; the grant is a fact
    // ...and "the grant is a fact" is ASSERTED, not just declared in a comment
    // (billing round-10 NOTE). This behaviour — a canceled workspace that
    // derives to free still receiving the credits it paid for — was pinned in
    // NEITHER direction, so a future change that quietly stopped granting here
    // would have been invisible. Taking the money and granting nothing is the
    // worse failure; that is the choice, and this is where it is recorded.
    const grants = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "grant"
    );
    expect(grants, "a paid invoice grants even on a canceled subscription").toHaveLength(1);
    expect(grants[0].delta).toBe(CONFIG_V1_SEED.allowances.creator);
    expect((await deriveBalance(db, ws)).balance).toBe(
      CONFIG_V1_SEED.allowances.creator
    );
    const [mirror] = await db.select().from(subscriptions);
    expect(mirror.status).toBe("canceled");
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });

  it("BLOCKER 6b: the TWO-event resurrection — deleted → payment_failed → paid — cannot revive a canceled workspace", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    // End of dunning: Stripe emits payment_failed and subscription.deleted
    // together, delivery order unguaranteed. Here `deleted` lands first.
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.deleted", subObject({ status: "canceled" }))
    );
    // The straggler. Round 3 guarded invoice.paid but left THIS writer open,
    // so it wrote past_due + a fresh grace deadline onto a dead subscription —
    // restoring the paid tier, and making the mirror non-terminal so the next
    // late invoice.paid then set it permanently active.
    expect(
      await handleStripeEvent(db, mkEvent("invoice.payment_failed", invoiceObject()))
    ).toBe("ignored");
    let [mirror] = await db.select().from(subscriptions);
    expect(mirror.status).toBe("canceled");
    expect(mirror.graceExpiresAt).toBeNull();
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });

    // ...and the second half of the sequence still cannot revive it.
    await handleStripeEvent(db, mkEvent("invoice.paid", invoiceObject()));
    [mirror] = await db.select().from(subscriptions);
    expect(mirror.status).toBe("canceled");
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });

  it("a failed ONE-OFF invoice never puts the SUBSCRIPTION into dunning", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    // Same customer, but no subscription generated this invoice.
    const oneOff = invoiceObject({ billing_reason: "manual" });
    delete (oneOff as { parent?: unknown }).parent;
    expect(
      await handleStripeEvent(db, mkEvent("invoice.payment_failed", oneOff))
    ).toBe("ignored");
    const [mirror] = await db.select().from(subscriptions);
    expect(mirror.status).toBe("active");
    expect(mirror.graceExpiresAt).toBeNull();
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("active");
  });

  it("recovery still works: a paid invoice while PAST_DUE (not terminal) lifts the tier back", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    await handleStripeEvent(db, mkEvent("invoice.payment_failed", invoiceObject()));
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("grace");
    await handleStripeEvent(db, mkEvent("invoice.paid", invoiceObject()));
    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(state.state).toBe("active");
    expect(state.tier).toBe("creator");
  });

  it("BLOCKER 8: the subscription-mode checkout branch binds the subscription id — for BOTH the id and expanded-object shapes", async () => {
    for (const subscription of [
      "sub_from_string",
      { id: "sub_from_object", object: "subscription" },
    ]) {
      const { db } = await setup();
      const out = await handleStripeEvent(
        db,
        mkEvent(
          "checkout.session.completed",
          sessionObject({
            id: "cs_sub",
            mode: "subscription",
            metadata: {},
            subscription,
          } as DeepPartial<Stripe.Checkout.Session>)
        )
      );
      expect(out).toBe("processed");
      const [mirror] = await db.select().from(subscriptions);
      expect(mirror.stripeSubscriptionId).toBe(
        typeof subscription === "string" ? subscription : subscription.id
      );
      // ...and does NOT stamp the shared watermark. This branch writes only
      // the subscription id, so claiming "the mirror is current as of this
      // event" would be a lie that suppresses the real snapshot (BLOCKER 8c).
      expect(mirror.mirrorEventAt).toBeNull();
    }
  });

  it("BLOCKER 8c: a checkout event with a LATER timestamp never suppresses the subscription snapshot that follows it", async () => {
    const { db, ws } = await setup();
    const base = nowSec();
    // Checkout arrives first and is stamped LATER than the subscription event
    // — the ordinary case when both land in the same second and Stripe
    // delivers them out of order.
    expect(
      await handleStripeEvent(db, {
        ...mkEvent(
          "checkout.session.completed",
          sessionObject({
            id: "cs_sub",
            mode: "subscription",
            metadata: {},
            subscription: "sub_1",
          } as DeepPartial<Stripe.Checkout.Session>)
        ),
        created: base + 5,
      })
    ).toBe("processed");
    expect(
      await handleStripeEvent(db, {
        ...mkEvent("customer.subscription.created", subObject()),
        created: base,
      })
    ).toBe("processed");

    // The FULL mirror must be recorded. Round 3 stamped the watermark from the
    // checkout branch's partial write, so this snapshot was discarded as
    // "stale" and the paying workspace kept deriving to free.
    const [mirror] = await db.select().from(subscriptions);
    expect(mirror.stripePriceId).toBe("price_creator");
    expect(mirror.status).toBe("active");
    expect(mirror.currentPeriodEnd).not.toBeNull();
    // The consequences, asserted rather than described: the tier is real, and
    // the F1 double-billing guard can therefore still see a live subscription.
    expect((await getWorkspaceBillingState(db, ws, new Date())).tier).toBe(
      "creator"
    );
  });

  it("BLOCKER 8b: a STALE subscription-mode checkout never repoints the mirror at a dead subscription", async () => {
    const { db } = await setup();
    // Newer truth lands first.
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.created", subObject({ id: "sub_NEW" }))
    );
    const [before] = await db.select().from(subscriptions);
    expect(before.stripeSubscriptionId).toBe("sub_NEW");

    // A redelivered OLDER checkout event for a since-canceled subscription.
    const stale = mkEvent(
      "checkout.session.completed",
      sessionObject({
        id: "cs_old",
        mode: "subscription",
        metadata: {},
        subscription: "sub_OLD_CANCELED",
      } as DeepPartial<Stripe.Checkout.Session>)
    );
    (stale as { created: number }).created =
      Math.floor(before.mirrorEventAt!.getTime() / 1000) - 3600;

    expect(await handleStripeEvent(db, stale)).toBe("ignored");
    const [after] = await db.select().from(subscriptions);
    expect(after.stripeSubscriptionId).toBe("sub_NEW");
  });

  it("BLOCKER 2: a NON-idempotency unique violation propagates (never a silent 200-with-no-row)", async () => {
    const { db } = await setup();
    // Bind sub_1 to a SECOND workspace, so mirroring it onto ours violates
    // subscriptions_subscription_uq — a real 23505 that is NOT idempotency.
    const [other] = await db
      .insert(schema.workspaces)
      .values({ name: "other" })
      .returning();
    await db.insert(subscriptions).values({
      workspaceId: other.id,
      stripeCustomerId: "cus_other",
      stripeSubscriptionId: "sub_1",
      status: "active",
    });

    const event = mkEvent("customer.subscription.created", subObject());
    // Must reach the route as a 500 (Stripe redelivers), NOT DuplicateStripeEvent.
    await expect(handleStripeEvent(db, event)).rejects.not.toThrow(
      DuplicateStripeEvent
    );
    await expect(handleStripeEvent(db, event)).rejects.toThrow();
    // and the event was NOT recorded as finally-outcomed
    expect(
      (await db.select().from(stripeEvents)).filter((r) => r.id === event.id)
    ).toHaveLength(0);
  });

  it("BLOCKER 4: a pack Checkout that completed UNPAID mints nothing; the later async_payment_succeeded settles it", async () => {
    const { db, ws } = await setup();
    // Delayed-notification methods complete as `unpaid` and settle later.
    const out = await handleStripeEvent(
      db,
      mkEvent(
        "checkout.session.completed",
        sessionObject({ id: "cs_slow", payment_status: "unpaid" })
      )
    );
    expect(out).toBe("ignored");
    expect(await db.select().from(creditLedger)).toHaveLength(0);
    expect((await deriveBalance(db, ws)).balance).toBe(0);

    // Settlement arrives → NOW the credits mint, exactly once.
    const settled = await handleStripeEvent(
      db,
      mkEvent(
        "checkout.session.async_payment_succeeded",
        sessionObject({ id: "cs_slow", payment_status: "paid" })
      )
    );
    expect(settled).toBe("processed");
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.kind === "pack")
    ).toHaveLength(1);
  });

  it("BLOCKER 7: ONE session mints ONE pack even when BOTH settlement events arrive under different event ids", async () => {
    const { db, ws } = await setup();
    const session = sessionObject({ id: "cs_both", payment_status: "paid" });
    // Different EVENT ids, same SESSION — credit_ledger_stripe_event_uq cannot
    // see this, so before the fix the customer was charged once and credited
    // twice.
    const first = mkEvent("checkout.session.completed", session);
    const second = mkEvent("checkout.session.async_payment_succeeded", session);
    expect(first.id).not.toBe(second.id);

    expect(await handleStripeEvent(db, first)).toBe("processed");
    expect(await handleStripeEvent(db, second)).toBe("ignored");

    const packs = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "pack"
    );
    expect(packs).toHaveLength(1);
    expect((await deriveBalance(db, ws)).balance).toBe(CONFIG_V1_SEED.pack.credits);
  });

  it("BLOCKER 7b: the per-session guarantee is STRUCTURAL — a second pack row for one session is refused by the database", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(
      db,
      mkEvent("checkout.session.completed", sessionObject({ id: "cs_uq" }))
    );
    // Bypass the handler entirely: the index, not the pre-check, is the
    // guarantee under true concurrency.
    const err = await db
      .insert(creditLedger)
      .values({
        workspaceId: ws,
        delta: 1000,
        kind: "pack",
        refType: "checkout_session",
        refId: "cs_uq",
        amountCents: 1000,
        expiresAt: new Date(Date.now() + 24 * HOUR),
      })
      .then(
        () => null,
        (e) => e as { cause?: { code?: string; constraint?: string } }
      );
    expect(err, "a second pack row for one session must be refused").not.toBeNull();
    expect(err!.cause?.code).toBe("23505");
    expect(err!.cause?.constraint).toBe("credit_ledger_checkout_session_uq");
    // ...and it is NOT an idempotency constraint, so the handler lets it reach
    // the 500-retry path rather than answering 200 (blocker 2's rule).
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.kind === "pack")
    ).toHaveLength(1);
  });

  it("BLOCKER 9: ONE invoice mints ONE allowance, even under two different event ids", async () => {
    const { db, ws } = await setup();
    const invoice = invoiceObject({ billing_reason: "subscription_cycle" });
    expect(await handleStripeEvent(db, mkEvent("invoice.paid", invoice))).toBe(
      "processed"
    );
    // A second event id carrying the SAME invoice. The event-id unique cannot
    // see this — round 3 fixed it for Checkout sessions and left grants, the
    // larger of the two amounts, on the event id alone (code-review CHANGE).
    expect(await handleStripeEvent(db, mkEvent("invoice.paid", invoice))).toBe(
      "ignored"
    );
    const grants = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "grant"
    );
    expect(grants).toHaveLength(1);
    expect((await deriveBalance(db, ws)).balance).toBe(
      CONFIG_V1_SEED.allowances.creator
    );
  });

  it("BLOCKER 9b: the per-invoice guarantee is STRUCTURAL — a second grant row for one invoice is refused by the database", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("invoice.paid", invoiceObject()));
    const err = await db
      .insert(creditLedger)
      .values({
        workspaceId: ws,
        delta: CONFIG_V1_SEED.allowances.creator,
        kind: "grant",
        refType: "invoice",
        refId: "in_1",
        expiresAt: new Date(Date.now() + 24 * HOUR),
      })
      .then(
        () => null,
        (e) => e as { cause?: { code?: string; constraint?: string } }
      );
    expect(err, "a second grant row for one invoice must be refused").not.toBeNull();
    expect(err!.cause?.code).toBe("23505");
    expect(err!.cause?.constraint).toBe("credit_ledger_invoice_grant_uq");
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.kind === "grant")
    ).toHaveLength(1);
  });
});

/**
 * Round-5 pins. Every case below is written to FAIL against the code as it
 * stood before this round — the failure mode this project keeps hitting is a
 * test that passes against both the defect and the fix, so each one names the
 * old behaviour it discriminates against.
 */
describe("round-5 regression pins (billing review findings 1, 2, 4, 5, 6, 8)", () => {
  /** mkEvent with an explicit `created` second — delivery ORDER is the subject here. */
  function mkEventAt(type: string, object: object, createdSec: number): Stripe.Event {
    return { ...mkEvent(type, object), created: createdSec } as Stripe.Event;
  }

  it("FINDING 1: the grace deadline does NOT depend on delivery order — the dunning subscription event opens it when payment_failed is ordered out", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    // Stripe emits the dunning `subscription.updated` and `payment_failed`
    // together with no ordering guarantee. Deliver the NEWER subscription
    // snapshot first — which is what makes the older payment_failed stale.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 10)
      )
    ).toBe("processed");
    // Correctly ignored: its opinion about status IS older than the mirror.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("invoice.payment_failed", invoiceObject(), t)
      )
    ).toBe("ignored");
    // BEFORE this round nobody wrote the deadline in this order, and
    // `past_due` with a null deadline derives to FREE — the customer lost the
    // entire grace window to a delivery-order coin flip.
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state, "past_due with no deadline would derive to free").toBe("grace");
    expect(s.tier).toBe("creator");
    const deadline = s.graceExpiresAt!;
    expect(deadline.getTime()).toBeGreaterThan(
      Date.now() + (CONFIG_V1_SEED.graceDays - 0.1) * 24 * HOUR
    );
    expect(deadline.getTime()).toBeLessThan(
      Date.now() + (CONFIG_V1_SEED.graceDays + 0.1) * 24 * HOUR
    );

    // ...and ONE deadline total: neither a later payment_failed nor a later
    // dunning snapshot may EXTEND it (the idempotency half of the rule).
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject(), t + 20)
    );
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 30)
    );
    const s2 = await getWorkspaceBillingState(db, ws, new Date());
    expect(s2.graceExpiresAt?.getTime()).toBe(deadline.getTime());
  });

  it("FINDING 1: the OPPOSITE order still yields exactly one deadline (the fix did not double-open it)", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject(), t + 10)
    );
    const first = (await getWorkspaceBillingState(db, ws, new Date())).graceExpiresAt!;
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 20)
    );
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("grace");
    expect(s.graceExpiresAt?.getTime()).toBe(first.getTime());
  });

  it("FINDING 5: a subscription event sharing the deleted event's SECOND cannot resurrect a canceled subscription", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 10)
    );
    // Stripe emits `deleted` and a trailing `updated` together at the end of a
    // subscription's life, routinely inside one second — and the order guard is
    // strict (`>`), so an equal second was APPLIED. Whichever arrived second
    // won, and if that was `updated`, a canceled workspace held a paid tier
    // with no later event that would ever correct it.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("customer.subscription.updated", subObject({ status: "active" }), t + 10)
      )
    ).toBe("ignored");
    const [row] = await db.select().from(subscriptions);
    expect(row.status).toBe("canceled");
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });

  it("FINDING 5: a genuine RE-subscribe (a different subscription id) is still mirrored — the guard refuses resurrection, not new business", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 10)
    );
    expect(
      await handleStripeEvent(
        db,
        mkEventAt(
          "customer.subscription.created",
          subObject({ id: "sub_2", status: "active" }),
          t + 10
        )
      )
    ).toBe("processed");
    const [row] = await db.select().from(subscriptions);
    expect(row.stripeSubscriptionId).toBe("sub_2");
    expect(row.status).toBe("active");
    expect((await getWorkspaceBillingState(db, ws, new Date())).tier).toBe("creator");
  });

  it("FINDING 6: a MULTI-ITEM subscription fails closed rather than mirroring one of its prices (symmetric with the invoice rule)", async () => {
    const { db } = await setup();
    const now = nowSec();
    const twoItems = subObject({
      items: {
        object: "list",
        data: [
          {
            id: "si_1",
            object: "subscription_item",
            price: { id: "price_creator", object: "price" },
            current_period_start: now,
            current_period_end: now + 30 * 86400,
          },
          {
            id: "si_2",
            object: "subscription_item",
            price: { id: "price_addon", object: "price" },
            current_period_start: now,
            current_period_end: now + 30 * 86400,
          },
        ],
      },
    });
    // Before this round `items.data[0]` was taken on trust, so the workspace
    // could be charged for one plan and entitled to another (tier is derived
    // from the mirrored price at read time).
    await expect(
      handleStripeEvent(db, mkEvent("customer.subscription.updated", twoItems))
    ).rejects.toThrow(/2 items/);
    // Fail CLOSED means the whole tx rolled back: no mirror write, no event row.
    const [row] = await db.select().from(subscriptions);
    expect(row.stripeSubscriptionId).toBeNull();
    expect(row.status).toBe("none");
    expect(await db.select().from(stripeEvents)).toHaveLength(0);
  });

  it("FINDING 2: ONE PaymentIntent mints ONE auto-top-up pack, even under two different event ids", async () => {
    const { db, ws } = await setup();
    const pi = piObject({ id: "pi_topup_once" });
    expect(await handleStripeEvent(db, mkEvent("payment_intent.succeeded", pi))).toBe(
      "processed"
    );
    // The third mint path had neither the pre-check nor the index its two
    // siblings (checkout session, invoice) were given — it leaned on the event
    // id alone, so a second event id carrying this PI minted a second pack.
    expect(await handleStripeEvent(db, mkEvent("payment_intent.succeeded", pi))).toBe(
      "ignored"
    );
    const packs = (await db.select().from(creditLedger)).filter(
      (r) => r.refType === "auto_topup"
    );
    expect(packs).toHaveLength(1);
    expect((await deriveBalance(db, ws)).balance).toBe(CONFIG_V1_SEED.pack.credits);
  });

  it("FINDING 2: the per-PaymentIntent guarantee is STRUCTURAL — a second auto-top-up row for one PI is refused by the database", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(
      db,
      mkEvent("payment_intent.succeeded", piObject({ id: "pi_structural" }))
    );
    const err = await db
      .insert(creditLedger)
      .values({
        workspaceId: ws,
        delta: CONFIG_V1_SEED.pack.credits,
        kind: "pack",
        refType: "auto_topup",
        refId: "pi_structural",
        amountCents: 1000,
        expiresAt: new Date(Date.now() + 24 * HOUR),
      })
      .then(
        () => null,
        (e) => e as { cause?: { code?: string; constraint?: string } }
      );
    expect(err, "a second auto-top-up row for one PI must be refused").not.toBeNull();
    expect(err!.cause?.code).toBe("23505");
    expect(err!.cause?.constraint).toBe("credit_ledger_auto_topup_uq");
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.refType === "auto_topup")
    ).toHaveLength(1);
  });

  it("FINDING 4: a service period ending 31 January expires the allowance on 28 February — never 3 March", async () => {
    const { db } = await setup();
    const start = Math.floor(Date.UTC(2027, 0, 1) / 1000);
    const end = Math.floor(Date.UTC(2027, 0, 31) / 1000); // 30 days — monthly
    const invoice = invoiceObject({
      lines: {
        object: "list",
        data: [
          {
            id: "il_jan",
            object: "line_item",
            period: { start, end },
            pricing: { price_details: { price: "price_creator" } },
            parent: {
              type: "subscription_item_details",
              subscription_item_details: {
                subscription: "sub_1",
                subscription_item: "si_1",
                proration: false,
              },
            },
          },
        ],
      },
    });
    expect(await handleStripeEvent(db, mkEvent("invoice.paid", invoice))).toBe(
      "processed"
    );
    const [grant] = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "grant"
    );
    // The naive month setter overflowed "31 February" to 3 March, quietly extending
    // every month-end subscriber's credit life (REQ-G02 rollover).
    expect(grant.expiresAt?.toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });

  it("FINDING 8: a grant-bearing invoice whose line carries NO service period is refused, never priced off the mirror", async () => {
    const { db, ws } = await setup();
    // Give the mirror a period, so the old fallback would have had something
    // plausible-looking to guess with — from a DIFFERENT cycle.
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    const noPeriod = invoiceObject({
      id: "in_noperiod",
      lines: {
        object: "list",
        data: [
          {
            id: "il_noperiod",
            object: "line_item",
            pricing: { price_details: { price: "price_creator" } },
            parent: {
              type: "subscription_item_details",
              subscription_item_details: {
                subscription: "sub_1",
                subscription_item: "si_1",
                proration: false,
              },
            },
          },
        ],
      },
    });
    await expect(
      handleStripeEvent(db, mkEvent("invoice.paid", noPeriod))
    ).rejects.toThrow(/no complete service period/);
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.kind === "grant")
    ).toHaveLength(0);
    expect((await deriveBalance(db, ws)).balance).toBe(0);
  });

  it("FINDING 8: a line missing only period.START is refused — it must not skip the monthly-interval guard", async () => {
    const { db } = await setup();
    // The old guard was `if (line.period?.start && line.period.end)`, so this
    // shape sailed past the annual-price check that BLOCKER 3 exists to
    // enforce: it failed OPEN to the monthly assumption.
    const halfPeriod = invoiceObject({
      id: "in_halfperiod",
      lines: {
        object: "list",
        data: [
          {
            id: "il_halfperiod",
            object: "line_item",
            period: { end: nowSec() + 365 * 86400 },
            pricing: { price_details: { price: "price_creator" } },
            parent: {
              type: "subscription_item_details",
              subscription_item_details: {
                subscription: "sub_1",
                subscription_item: "si_1",
                proration: false,
              },
            },
          },
        ],
      },
    });
    await expect(
      handleStripeEvent(db, mkEvent("invoice.paid", halfPeriod))
    ).rejects.toThrow(/no complete service period/);
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.kind === "grant")
    ).toHaveLength(0);
  });

  // ---- pins for the defects the round-5 REVIEWER GATE found, three of them
  // inside round-5's own fixes. Same pattern as rounds 3 and 4; the point of
  // writing them here is that the next round cannot reintroduce them quietly.

  it("GATE BLOCK: a re-subscribe whose CHECKOUT arrives before the subscription snapshot still activates — the terminal guard must not eat the new subscription's own first event", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 10)
    );
    // The re-subscribe. `checkout.session.completed` repoints the mirror's
    // subscription id but writes no status — so keying the terminal guard on
    // that id made the mirror {canceled, sub_2}, and sub_2's own
    // `subscription.created` then looked exactly like a resurrection of sub_1
    // and was refused FOREVER: the workspace paid, was granted its credits,
    // and derived to `free` with no event that could ever correct it — and
    // `isLive()` reading `canceled` switched the F1 double-billing guard off
    // too, so the next checkout would have made a THIRD subscription.
    await handleStripeEvent(
      db,
      mkEventAt(
        "checkout.session.completed",
        sessionObject({ mode: "subscription", subscription: "sub_2" }),
        t + 20
      )
    );
    expect(
      await handleStripeEvent(
        db,
        mkEventAt(
          "customer.subscription.created",
          subObject({ id: "sub_2", status: "active" }),
          t + 20
        )
      )
    ).toBe("processed");
    const [row] = await db.select().from(subscriptions);
    expect(row.stripeSubscriptionId).toBe("sub_2");
    expect(row.status).toBe("active");
    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(state, "a paying re-subscriber must not derive to free").toEqual({
      tier: "creator",
      state: "active",
    });
  });

  it("GATE CHANGE: `unpaid` is recoverable — an active snapshot after unpaid is applied, unlike canceled", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "unpaid" }), t + 10)
    );
    // The installed SDK documents `unpaid` as a state a customer can pay out
    // of ("you may choose to reopen and pay their closed invoices"). Treating
    // it as irreversible on the mirror made such a workspace unrecoverable by
    // ANY event — a worse failure than the resurrection the guard prevents.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("customer.subscription.updated", subObject({ status: "active" }), t + 20)
      )
    ).toBe("processed");
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("active");
    // ...while `canceled` stays one-way, so the fix did not simply weaken it.
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 30)
    );
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("customer.subscription.updated", subObject({ status: "active" }), t + 40)
      )
    ).toBe("ignored");
  });

  it("GATE CHANGE: an EXPIRED deadline is not a live one — a later dunning episode opens a fresh window", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject(), t + 10)
    );
    const first = (await getWorkspaceBillingState(db, ws, new Date())).graceExpiresAt!;
    // Stand in for "months later": the workspace recovered (observed only as a
    // subscription snapshot, so no invoice.paid ever cleared the deadline) and
    // the first window has long since lapsed.
    const stale = new Date(Date.now() - 30 * 24 * HOUR);
    await db
      .update(subscriptions)
      .set({ status: "active", graceExpiresAt: stale })
      .where(eq(subscriptions.workspaceId, ws));
    // A SECOND episode. Round 5 read "a deadline exists" and reused the lapsed
    // one, so state.ts derived `free` with ZERO grace — REQ-G06's window
    // silently skipped. The rule is now "never extend a LIVE deadline", which
    // needs nobody to clear anything and so cannot be raced by a stale event.
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject({ id: "in_2" }), t + 20)
    );
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state, "a lapsed deadline must not deny the next episode its window").toBe(
      "grace"
    );
    expect(s.graceExpiresAt!.getTime()).toBeGreaterThan(stale.getTime());
    expect(s.graceExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(s.graceExpiresAt!.getTime()).not.toBe(first.getTime());
  });

  it("GATE CHANGE: an OLDER active snapshot cannot wipe a LIVE grace deadline (payment_failed never stamps the watermark, so the order guard cannot protect it)", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject(), t + 100)
    );
    const deadline = (await getWorkspaceBillingState(db, ws, new Date())).graceExpiresAt!;
    // Round 5 cleared the deadline on any ACTIVE snapshot. `payment_failed`
    // deliberately does not stamp `mirrorEventAt`, so the watermark says
    // nothing about the deadline's age and this OLDER event sailed through the
    // order guard — serving the paid tier to a non-payer, and handing the next
    // failure a fresh 7 days.
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "active" }), t + 50)
    );
    const [row] = await db.select().from(subscriptions);
    expect(
      row.graceExpiresAt?.getTime(),
      "a live deadline survives an older active snapshot"
    ).toBe(deadline.getTime());
  });

  it("GATE BLOCK 2: an ordinary cancel-at-period-end does NOT lock the workspace out of re-subscribing", async () => {
    const { db } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    // The REQ-G01 self-serve flow: the owner cancels in the Portal, Stripe
    // flags the subscription, and the period end later deletes it.
    await handleStripeEvent(
      db,
      mkEventAt(
        "customer.subscription.updated",
        subObject({ cancel_at_period_end: true }),
        t + 10
      )
    );
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 20)
    );
    const [row] = await db.select().from(subscriptions);
    expect(row.status).toBe("canceled");
    // Nothing ever reset this flag, and `isLive()` counted it as liveness — so
    // the mirror read FREE everywhere else and "already subscribed" at the
    // checkout action, refusing the owner forever and pointing them at a Portal
    // with nothing left to manage. Liveness now derives from irreversibility,
    // and the deleted branch clears the flag as well.
    expect(row.cancelAtPeriodEnd).toBe(false);
    expect(hasLiveStripeSubscription(row)).toBe(false);
  });

  it("GATE BLOCK 2 (sibling): an `unpaid` subscription still counts as LIVE, so no second one can be started", async () => {
    const { db } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "unpaid" }), t + 10)
    );
    const [row] = await db.select().from(subscriptions);
    // The old allowlist omitted `unpaid`, so the F1 guard waved a second
    // Checkout through for a subscription that is still alive in Stripe — one
    // workspace, two subscriptions, on a single-row mirror. Same rule, so the
    // two readers of this row can no longer disagree.
    expect(row.status).toBe("unpaid");
    expect(hasLiveStripeSubscription(row)).toBe(true);
  });

  it("GATE (mirror image): a late `deleted` for an OLD subscription never cancels the current one", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.created", subObject({ id: "sub_2" }), t)
    );
    // sub_1 was cancelled earlier but its event is delivered late. The deleted
    // branch writes `stripeSubscriptionId: sub.id` unconditionally, so without
    // a guard this cancels the LIVE subscription and repoints the mirror at
    // the dead one.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("customer.subscription.deleted", subObject({ id: "sub_1", status: "canceled" }), t + 10)
      )
    ).toBe("ignored");
    const [row] = await db.select().from(subscriptions);
    expect(row.stripeSubscriptionId).toBe("sub_2");
    expect(row.status).toBe("active");
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("active");
  });
});

describe("round-7 regression pins (billing round-7 CHANGE 1 + NOTEs)", () => {
  function mkEventAt(type: string, object: object, createdSec: number): Stripe.Event {
    return { ...mkEvent(type, object), created: createdSec } as Stripe.Event;
  }

  it("CHANGE 1: `customer.subscription.deleted` DISARMS auto-top-up — no off-session charging authority survives a cancellation", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    // The owner armed auto-top-up at a $50 cap while subscribed.
    await db
      .update(subscriptions)
      .set({ autoTopupEnabled: true, autoTopupMonthlyCapCents: 5000 })
      .where(eq(subscriptions.workspaceId, ws));
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 10)
    );
    const [row] = await db.select().from(subscriptions);
    // Before this fix the flag survived the cancellation and no later event
    // existed to clear it, so M3's debit site would have charged an
    // off-session $10 PaymentIntent to a customer who had cancelled.
    expect(row.autoTopupEnabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
    // ...and the trigger itself refuses, so BOTH halves are proven together:
    // the cleared flag AND the liveness guard behind it.
    expect(await maybeAutoTopup(db, ws, 100, new Date())).toEqual({
      triggered: false,
      reason: "not_subscribed",
    });
  });

  it("NOTE 1: a trailing `updated` carrying status canceled cannot RE-ARM what `deleted` just cleared", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await db
      .update(subscriptions)
      .set({ autoTopupEnabled: true, autoTopupMonthlyCapCents: 5000 })
      .where(eq(subscriptions.workspaceId, ws));
    await handleStripeEvent(
      db,
      mkEventAt(
        "customer.subscription.deleted",
        subObject({ status: "canceled", cancel_at_period_end: true }),
        t + 10
      )
    );
    // The installed SDK: cancel_at_period_end records whether the subscription
    // "did (if status=canceled) cancel at the end of the current billing
    // period" — so a canceled object legitimately still carries `true`, and
    // the terminal guard lets a canceled→canceled snapshot through to the
    // mirror writer. Mirroring it verbatim re-wrote the flag `deleted` had
    // just cleared, seconds later, and Phase 4's UI is the next reader.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt(
          "customer.subscription.updated",
          subObject({ status: "canceled", cancel_at_period_end: true }),
          t + 11
        )
      )
    ).toBe("processed");
    const [row] = await db.select().from(subscriptions);
    expect(row.status).toBe("canceled");
    expect(row.cancelAtPeriodEnd).toBe(false);
    expect(row.autoTopupEnabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
    expect(hasLiveStripeSubscription(row)).toBe(false);
  });

  it("NOTE 2: a recovery seen ONLY as `updated → active` does not shorten the NEXT dunning episode's window", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    // Episode 1 recovered without an invoice.paid (Stripe voided the failed
    // invoice), so nothing cleared its deadline — 2 days of it are left.
    const stale = new Date(Date.now() + 2 * 24 * HOUR);
    await db
      .update(subscriptions)
      .set({ status: "active", graceExpiresAt: stale })
      .where(eq(subscriptions.workspaceId, ws));
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject(), t + 100)
    );
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("grace");
    // The old rule ("never extend a live deadline") handed episode 2 the 2 days
    // left of episode 1's window; REQ-G06 promises 7.
    expect(s.graceExpiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 6.9 * 24 * HOUR
    );
    expect(s.graceExpiresAt!.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("NOTE 2: the same holds when the new episode arrives as the dunning `subscription.updated` instead", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    const stale = new Date(Date.now() + 2 * 24 * HOUR);
    await db
      .update(subscriptions)
      .set({ status: "active", graceExpiresAt: stale })
      .where(eq(subscriptions.workspaceId, ws));
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 100)
    );
    const s = await getWorkspaceBillingState(db, ws, new Date());
    expect(s.state).toBe("grace");
    expect(s.graceExpiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 6.9 * 24 * HOUR
    );
  });

  it("NOTE 2 (the direction that must NOT change): inside ONE episode a second failure still never extends the deadline", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject(), t + 10)
    );
    const first = (await getWorkspaceBillingState(db, ws, new Date())).graceExpiresAt!;
    // The mirror is now `past_due` — still inside the episode that opened this
    // deadline, so this failure is a continuation, not a new window.
    await handleStripeEvent(
      db,
      mkEventAt("invoice.payment_failed", invoiceObject(), t + 20)
    );
    expect(
      (await getWorkspaceBillingState(db, ws, new Date())).graceExpiresAt?.getTime()
    ).toBe(first.getTime());
  });

  it("NOTE 3: a STALE snapshot cannot close a pause the owner opened after it was created", async () => {
    const { db, ws } = await setup();
    const t = nowSec() - 600;
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    // The owner's pauseSubscription writes the local pause WITHOUT stamping
    // mirrorEventAt (that watermark means "a full subscription snapshot"), so
    // a snapshot created before the pause still passes the order guard.
    await db.transaction((tx) => ensurePauseStarted(tx, ws, new Date()));
    expect(await db.transaction((tx) => hasOpenPause(tx, ws))).toBe(true);
    await handleStripeEvent(
      db,
      // 5 minutes older than the pause: it cannot possibly know about it.
      mkEventAt("customer.subscription.updated", subObject(), nowSec() - 300)
    );
    expect(
      await db.transaction((tx) => hasOpenPause(tx, ws)),
      "a snapshot older than the pause must not close it"
    ).toBe(true);
  });

  it("NOTE 3 (non-vacuity): a CONTEMPORANEOUS snapshot without pause_collection still resumes", async () => {
    const { db, ws } = await setup();
    const t = nowSec() - 600;
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await db.transaction((tx) => ensurePauseStarted(tx, ws, new Date()));
    await handleStripeEvent(
      db,
      // Stripe's `created` is second-granularity while started_at is the
      // millisecond DB clock, so the reconciling snapshot for a pause Stripe
      // just applied is routinely a few hundred ms "older" than the row — the
      // guard carries the package's CLOCK_SKEW_MS tolerance for exactly this.
      mkEventAt("customer.subscription.updated", subObject(), nowSec())
    );
    expect(await db.transaction((tx) => hasOpenPause(tx, ws))).toBe(false);
  });

  it("CHANGE 3: the monthly band is CONFIG — widening `monthlyPeriodDays` self-heals the refused invoice with no deploy", async () => {
    const { db, ws } = await setup();
    const sec = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), sec));
    const annual = mkEvent(
      "invoice.paid",
      invoiceObject({
        billing_reason: "subscription_create",
        lines: { object: "list", data: [annualSubscriptionLine("price_creator", sec)] },
      })
    );
    // The band used to be two constants in this file — a threshold with no
    // decision, no PRD row and no config key, deciding whether a PAID invoice
    // grants or throws. Out-of-band ⇒ the D-M1-1 transaction rolls back ⇒ 500
    // ⇒ Stripe retries forever: the money is taken, the grant never lands, and
    // the only signal is Stripe's failing-webhook list.
    await expect(handleStripeEvent(db, annual)).rejects.toThrow(
      /monthlyPeriodDays/
    );
    // The refusal names the operator's way forward, and the way forward works.
    await expect(handleStripeEvent(db, annual)).rejects.toThrow(/\/admin\/config/);
    await expect(handleStripeEvent(db, annual)).rejects.toThrow(/SELF-HEALS/);
    expect(await db.select().from(creditLedger)).toHaveLength(0);
    expect(await db.select().from(stripeEvents)).toHaveLength(1); // only the subscription event

    // Append (never mutate — D-M1-2) a config version whose band accepts it,
    // exactly as /admin/config would, then let Stripe redeliver.
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { price_creator: "creator", price_pack: "pack" },
        monthlyPeriodDays: { min: 20, max: 400 },
      },
      "test-admin"
    );
    expect(await handleStripeEvent(db, annual)).toBe("processed");
    expect((await deriveBalance(db, ws)).balance).toBe(
      CONFIG_V1_SEED.allowances.creator
    );
  });

  it("NOTE 4: a grant-bearing invoice with NO id is REFUSED, never granted against the event id", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(db, mkEventAt("customer.subscription.created", subObject(), t));
    await expect(
      handleStripeEvent(
        db,
        mkEventAt("invoice.paid", invoiceObject({ id: undefined }), t + 10)
      )
    ).rejects.toThrow(/carries no id/);
    // Fail CLOSED, whole-transaction: no allowance, and no event row either,
    // so Stripe's redelivery is not answered with a silent duplicate.
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.kind === "grant")
    ).toHaveLength(0);
    expect(await deriveBalance(db, ws)).toMatchObject({ balance: 0 });
    expect(
      (await db.select().from(stripeEvents)).filter((r) => r.type === "invoice.paid")
    ).toHaveLength(0);
  });
});

describe("acceptance rules proven by source scan (not by hand-grep)", () => {
  it("AC-9: `new Stripe(` appears ONLY inside getStripe — the setup script no longer builds its own client", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname, relative } = await import("node:path");
    const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(resolve(dir, e.name))
          : e.name.endsWith(".ts")
            ? [resolve(dir, e.name)]
            : []
      );
    const offenders = walk(srcDir).filter((f) =>
      /new Stripe\(/.test(readFileSync(f, "utf8"))
    );
    const rel = offenders.map((f) => relative(srcDir, f).replace(/\\/g, "/"));
    // AC-9 was recorded as satisfied for four review rounds while
    // stripe/setup.ts constructed a second client — the rule was checked by
    // hand-grep, and a hand-grep is only run when someone remembers to.
    expect(rel, "only the lazy factory may construct a Stripe client").toEqual([
      "stripe/adapter.ts",
    ]);
    // ...and NOT vacuous: the scan must actually be reading source that
    // contains the pattern somewhere.
    expect(offenders.length).toBe(1);
    expect(readFileSync(offenders[0], "utf8")).toContain("export function getStripe");
  });

  it("month arithmetic goes through addMonthsUtc ONLY — the raw Date month setter appears nowhere else in src/ or tests/", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname, relative } = await import("node:path");
    const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(resolve(dir, e.name))
          : e.name.endsWith(".ts")
            ? [resolve(dir, e.name)]
            : []
      );
    // Assembled from parts so THIS file does not contain the token it bans —
    // the sibling AC-9 scan caught its own explanatory comment the same way,
    // which is a fair sign both scans actually read what they claim to.
    const banned = new RegExp(["set", "UTC", "Month"].join(""));
    const offenders = [...walk(resolve(pkgDir, "src")), ...walk(resolve(pkgDir, "tests"))]
      .map((f) => relative(pkgDir, f).replace(/\\/g, "/"))
      .filter(
        (rel) =>
          // months.ts DEFINES the helper; months.test.ts deliberately keeps a
          // naive copy to prove the two disagree.
          rel !== "src/months.ts" &&
          rel !== "tests/months.test.ts" &&
          banned.test(readFileSync(resolve(pkgDir, rel), "utf8"))
      );
    // Non-vacuity: the scan must find the token where it legitimately lives.
    expect(banned.test(readFileSync(resolve(pkgDir, "src/months.ts"), "utf8"))).toBe(
      true
    );
    // Scanning TESTS too, because that is where the leak actually was: the
    // round-5 fix replaced every raw month-setter call in src/ and left two expected-
    // expiry ORACLES computing the overflowed answer, so two regression pins
    // would have gone red on 7 calendar days a year (tenancy round-5 CHANGE).
    // months.ts's header claims it is the only month arithmetic in the package;
    // this is that claim asserted rather than asserted-in-a-comment.
    expect(
      offenders,
      "use addMonthsUtc — the raw Date month setter overflows month-ends (31 Jan + 1 month = 3 Mar)"
    ).toEqual([]);
  });
});

describe("round-10 regression pins (billing NOTE 3: the pause bound is SYMMETRIC)", () => {
  it("a pause-era snapshot arriving AFTER the owner resumed cannot RE-OPEN the pause", async () => {
    const { db, ws } = await setup();
    // The mirror snapshot is an HOUR old, so the stale pause event below is
    // NEWER than the watermark and genuinely passes the order guard — which is
    // the whole point: the order guard cannot see the local pause writers at
    // all, because pauseSubscription/resumeSubscription deliberately do not
    // stamp it.
    const created = mkEvent("customer.subscription.created", subObject());
    (created as { created: number }).created = nowSec() - 3600;
    await handleStripeEvent(db, created);

    // The owner pauses locally (pauseSubscription's local half), then resumes.
    // Neither writes `mirrorEventAt` — deliberately: that watermark means "a
    // full subscription snapshot", and stamping it from a partial write is a
    // regression this handler has already made once.
    await db.transaction(async (t) => {
      await ensurePauseStarted(t, ws, new Date());
    });
    await db.transaction(async (t) => {
      await ensurePauseEnded(t, ws, new Date());
    });
    expect(await db.transaction((t) => hasOpenPause(t, ws))).toBe(false);

    // Now Stripe's reconciling snapshot from DURING the pause finally lands.
    // It is older than the resume by minutes, and it still carries
    // pause_collection because that is what was true when it was created.
    const stale = mkEvent(
      "customer.subscription.updated",
      subObject({
        pause_collection: {
          behavior: "void",
          resumes_at: nowSec() + 30 * 86400,
        },
      })
    );
    (stale as { created: number }).created = nowSec() - 600; // 10 minutes old
    expect(await handleStripeEvent(db, stale)).toBe("processed");

    // Round 8 bounded ensurePauseEnded and left ensurePauseStarted open, so
    // this re-opened the pause: credits frozen and state "paused" for a paying
    // customer, plus a permanent spurious pause_periods row shifting every
    // lot's expiry — with no further event coming to correct it.
    expect(
      await db.transaction((t) => hasOpenPause(t, ws)),
      "a snapshot older than the resume must not re-open the pause"
    ).toBe(false);
    const periods = await db.select().from(schema.pausePeriods);
    expect(periods, "and it must not have written a second period row").toHaveLength(1);
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("active");
  });

  it("NON-VACUITY: a CONTEMPORANEOUS pause snapshot still opens a pause (the bound is not a blanket refusal)", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    await db.transaction(async (t) => {
      await ensurePauseStarted(t, ws, new Date());
    });
    await db.transaction(async (t) => {
      await ensurePauseEnded(t, ws, new Date());
    });
    // A snapshot created NOW — i.e. after the resume — is genuine new
    // information: the owner (or an admin in the dashboard) paused again.
    const fresh = mkEvent(
      "customer.subscription.updated",
      subObject({
        pause_collection: { behavior: "void", resumes_at: nowSec() + 30 * 86400 },
      })
    );
    expect(await handleStripeEvent(db, fresh)).toBe("processed");
    expect(await db.transaction((t) => hasOpenPause(t, ws))).toBe(true);
  });
});

// EVIDENCE-RUN FINDING 1 (2026-08-17). These fixtures are the shape the LIVE
// Customer Portal produced on api_version 2026-05-27.dahlia — read out of this
// repo's own `stripe_events` table after the run, not imagined: `cancel_at` set,
// `cancel_at_period_end` FALSE, `status` still active. Every fixture in this
// file before today expressed the same fact the other way round, which is
// exactly why twelve review rounds could not catch it.
describe("evidence-run finding 1: the PORTAL sets cancel_at, not the legacy boolean", () => {
  it("mirrors cancel_at and surfaces it as a scheduled end — with the boolean FALSE", async () => {
    const { db, ws } = await setup();
    const endsAt = nowSec() + 30 * 86400;
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    expect(
      await handleStripeEvent(
        db,
        mkEvent(
          "customer.subscription.updated",
          subObject({ cancel_at: endsAt, cancel_at_period_end: false, status: "active" })
        )
      )
    ).toBe("processed");

    const [row] = await db.select().from(subscriptions);
    expect(row.cancelAt?.getTime()).toBe(endsAt * 1000);
    // The legacy column is mirrored faithfully — it really is false. Reading
    // only THAT is what told a paying creator nothing.
    expect(row.cancelAtPeriodEnd).toBe(false);

    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(state.state).toBe("active");
    expect(state.cancelAt?.getTime()).toBe(endsAt * 1000);
  });

  it("the scheduled end DIES with the subscription (DEAD_SUBSCRIPTION_FIELDS clears it)", async () => {
    const { db, ws } = await setup();
    const endsAt = nowSec() + 30 * 86400;
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.created", subObject({ cancel_at: endsAt }))
    );
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.deleted", subObject({ status: "canceled", cancel_at: endsAt }))
    );
    const [row] = await db.select().from(subscriptions);
    expect(row.cancelAt).toBeNull();
    // …and the read path would refuse it anyway, so a stale value cannot
    // resurface as "your plan ends on <date>" for a workspace with no plan.
    const state = await getWorkspaceBillingState(db, ws, new Date());
    expect(state).toEqual({ tier: "free", state: "free" });
  });

  it("NON-VACUITY: an ordinary active subscription carries no scheduled end", async () => {
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    const [row] = await db.select().from(subscriptions);
    expect(row.cancelAt).toBeNull();
    expect((await getWorkspaceBillingState(db, ws, new Date())).cancelAt).toBeUndefined();
  });
});

describe("audit 2026-08-17 #3 — the STALENESS half of the mirror-race finding", () => {
  function mkEventAt(type: string, object: object, createdSec: number): Stripe.Event {
    return { ...mkEvent(type, object), created: createdSec } as Stripe.Event;
  }

  /**
   * The concrete instance the correctness critic reported and the depth room
   * and Codex both re-found: `invoice.paid`'s grace-clear had NO order guard
   * while the status-lift beside it did.
   *
   * The workspace lock added for #3 cannot close this and never could — the
   * lock serializes two writers, it does not give a stale writer a newer
   * opinion. Both halves of #3 were needed and only one had landed.
   */
  it("a STALE invoice.paid does NOT end a newer, still-live dunning grace period", async () => {
    const { db, ws } = await setup();
    const t = nowSec();

    // T+100: the dunning snapshot opens the 7-day window and STAMPS the
    // watermark (only subscription snapshots stamp `mirrorEventAt`).
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 100)
    );
    const [opened] = await db.select().from(subscriptions);
    expect(opened.status).toBe("past_due");
    expect(opened.graceExpiresAt).not.toBeNull();
    const deadline = opened.graceExpiresAt as Date;
    // The customer is inside the window they were promised.
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("grace");

    // T+50: an OLDER paid invoice is delivered late. Its allowance is still a
    // fact and is still granted (idempotent per invoice), but its opinion
    // about the dunning window predates the failure that opened this one.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("invoice.paid", invoiceObject({ id: "in_stale_clear" }), t + 50)
      )
    ).toBe("processed");

    const [after] = await db.select().from(subscriptions);
    // BEFORE the fix: `graceExpiresAt` was null here. `past_due` + a null
    // deadline derives to `free` in state.ts, so a paying customer inside
    // their grace window was downgraded by a late delivery — permanently,
    // because no later event re-opens a deadline.
    expect(after.graceExpiresAt?.getTime()).toBe(deadline.getTime());
    expect(after.status).toBe("past_due");
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("grace");
  });

  it("NON-VACUITY: a CURRENT invoice.paid still clears the grace and lifts the status", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 100)
    );
    expect((await db.select().from(subscriptions))[0].graceExpiresAt).not.toBeNull();
    // Delivered AFTER the snapshot that opened the window — the ordinary
    // recovery. The guard must not turn this into a customer stuck in dunning.
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("invoice.paid", invoiceObject({ id: "in_fresh_clear" }), t + 200)
      )
    ).toBe("processed");
    const [after] = await db.select().from(subscriptions);
    expect(after.graceExpiresAt).toBeNull();
    expect(after.status).toBe("active");
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("active");
  });

  it("a TERMINAL mirror is still tidied by a CURRENT paid invoice — cleared, and never revived", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 100)
    );
    // Death. DEAD_SUBSCRIPTION_FIELDS clears the deadline with everything else,
    // so re-open one by hand: the branch under test is the split predicate's
    // TERMINAL half, not the death writer's own tidy-up.
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 150)
    );
    await db
      .update(subscriptions)
      .set({ graceExpiresAt: new Date(Date.now() + 7 * 24 * HOUR) })
      .where(eq(subscriptions.workspaceId, ws));

    // Delivered AFTER the death notice — the customer paying the still-open
    // invoice from Stripe's emailed link. `invoiceMayWriteStatus` refuses it
    // (TERMINAL) but `invoiceIsStale` does not, which is exactly the asymmetry
    // the split exists to preserve: the deadline is cleared, the subscription
    // is NOT resurrected (BLOCKER 6's rule, still holding).
    await handleStripeEvent(
      db,
      mkEventAt("invoice.paid", invoiceObject({ id: "in_terminal_clear" }), t + 200)
    );
    const [after] = await db.select().from(subscriptions);
    expect(after.graceExpiresAt).toBeNull();
    expect(after.status).toBe("canceled");
    expect((await getWorkspaceBillingState(db, ws, new Date())).state).toBe("free");
  });

  /**
   * The one direction the split leaves open, asserted rather than assumed: a
   * STALE invoice against a TERMINAL mirror leaves the deadline standing. That
   * is deliberate and it is free — `state.ts` reads `graceExpiresAt` ONLY inside
   * its `past_due` branch, which a terminal status never reaches — so the
   * surviving value can never become a user-visible claim.
   */
  it("a stale invoice on a terminal mirror leaves the deadline, and it STILL cannot surface as grace", async () => {
    const { db, ws } = await setup();
    const t = nowSec();
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.updated", subObject({ status: "past_due" }), t + 100)
    );
    await handleStripeEvent(
      db,
      mkEventAt("customer.subscription.deleted", subObject({ status: "canceled" }), t + 150)
    );
    await db
      .update(subscriptions)
      .set({ graceExpiresAt: new Date(Date.now() + 7 * 24 * HOUR) })
      .where(eq(subscriptions.workspaceId, ws));

    await handleStripeEvent(
      db,
      mkEventAt("invoice.paid", invoiceObject({ id: "in_terminal_stale" }), t + 50)
    );
    const [after] = await db.select().from(subscriptions);
    expect(after.graceExpiresAt).not.toBeNull();
    // The claim that makes leaving it harmless — asserted, not promised.
    expect(await getWorkspaceBillingState(db, ws, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });
});

describe("D-AUDIT-1 (audit #2): the REFUSAL branch — REQ-G08's 'no monthly grants while paused'", () => {
  function mkEventAt(type: string, object: object, createdSec: number): Stripe.Event {
    return { ...mkEvent(type, object), created: createdSec } as Stripe.Event;
  }

  /** Subscribe, then open a pause. The pause's knowledge time is ~now. */
  async function paused() {
    const s = await setup();
    await handleStripeEvent(s.db, mkEvent("customer.subscription.created", subObject()));
    await handleStripeEvent(
      s.db,
      mkEvent(
        "customer.subscription.updated",
        subObject({ pause_collection: { behavior: "void" } })
      )
    );
    expect(await s.db.transaction((t) => hasOpenPause(t, s.ws))).toBe(true);
    return s;
  }

  /**
   * THE BRANCH THAT HAD NO TEST. It denies a paying creator a month's
   * allowance and records `ignored` permanently, and until now deleting the
   * entire pause check left the suite green — so REQ-G08's enforcement was
   * unproven in the one direction that actually refuses.
   */
  it("a GENUINE during-pause invoice is refused: outcome `ignored`, and ZERO credits minted", async () => {
    const { db, ws } = await paused();
    // An hour AFTER the pause became known — far outside the tolerance, so
    // this is not a delivery race by any reading.
    const event = mkEventAt(
      "invoice.paid",
      invoiceObject({ id: "in_during_pause" }),
      nowSec() + 3600
    );
    expect(await handleStripeEvent(db, event)).toBe("ignored");

    // NOTHING was minted — the assertion the refusal exists for.
    const rows = (await db.select().from(creditLedger)).filter(
      (r) => r.workspaceId === ws
    );
    expect(rows, "a during-pause invoice must write no ledger row at all").toHaveLength(0);
    expect((await deriveBalance(db, ws)).balance).toBe(0);

    // …and THIS event is RECORDED as ignored, not dropped: the refusal is
    // greppable, which R-25 names as the tripwire for ever observing one live.
    // Selected BY ID — the table also holds the two subscription events this
    // fixture used to open the pause, and both are `processed`.
    const [evt] = (await db.select().from(stripeEvents)).filter(
      (r) => r.id === event.id
    );
    expect(evt.outcome).toBe("ignored");
  });

  it("the refusal is idempotent — a redelivery of the same event does not sneak a grant through", async () => {
    const { db, ws } = await paused();
    const event = mkEventAt(
      "invoice.paid",
      invoiceObject({ id: "in_during_pause_2" }),
      nowSec() + 3600
    );
    expect(await handleStripeEvent(db, event)).toBe("ignored");
    await expect(handleStripeEvent(db, event)).rejects.toBeInstanceOf(
      DuplicateStripeEvent
    );
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.workspaceId === ws)
    ).toHaveLength(0);
  });

  it("BOUNDARY: inside the tolerance grants, outside it refuses — the rule is the clock, not the pause flag", async () => {
    // INSIDE. The tolerance deliberately WIDENS the grant window so an
    // ambiguous ordering at the pause boundary resolves in the customer's
    // favour (D-AUDIT-1); 59s of the 60s tolerance is unambiguously inside.
    {
      const { db, ws } = await paused();
      expect(
        await handleStripeEvent(
          db,
          mkEventAt("invoice.paid", invoiceObject({ id: "in_inside" }), nowSec() + 59)
        )
      ).toBe("processed");
      expect((await deriveBalance(db, ws)).balance).toBeGreaterThan(0);
    }
    // OUTSIDE, on a fresh workspace so the two directions cannot mask each
    // other. 10 minutes past the tolerance.
    {
      const { db, ws } = await paused();
      expect(
        await handleStripeEvent(
          db,
          mkEventAt("invoice.paid", invoiceObject({ id: "in_outside" }), nowSec() + 600)
        )
      ).toBe("ignored");
      expect((await deriveBalance(db, ws)).balance).toBe(0);
    }
  });

  it("the direction that must NOT change: an UNPAUSED workspace still gets its allowance", async () => {
    // Non-vacuity for the whole branch — the guard must refuse during a pause,
    // not refuse late invoices generally. Same "an hour later" event that is
    // refused above, against a workspace with no pause.
    const { db, ws } = await setup();
    await handleStripeEvent(db, mkEvent("customer.subscription.created", subObject()));
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("invoice.paid", invoiceObject({ id: "in_unpaused" }), nowSec() + 3600)
      )
    ).toBe("processed");
    expect((await deriveBalance(db, ws)).balance).toBeGreaterThan(0);
  });

  it("a RESUMED workspace grants again — the refusal is tied to the OPEN pause, not to having ever paused", async () => {
    const { db, ws } = await paused();
    // Clearing pause_collection resumes.
    await handleStripeEvent(
      db,
      mkEvent("customer.subscription.updated", subObject({ pause_collection: null }))
    );
    expect(await db.transaction((t) => hasOpenPause(t, ws))).toBe(false);
    expect(
      await handleStripeEvent(
        db,
        mkEventAt("invoice.paid", invoiceObject({ id: "in_after_resume" }), nowSec() + 3600)
      )
    ).toBe("processed");
    expect((await deriveBalance(db, ws)).balance).toBeGreaterThan(0);
  });
});
