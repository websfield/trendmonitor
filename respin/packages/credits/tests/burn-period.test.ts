// THE PERIOD /usage MEASURES BURN OVER — one derivation, read by the total and
// by the by-mode split.
//
// THE 2026-09-01 BILLING-GATE FINDING IS THE REASON HALF THIS FILE EXISTS.
// `burnPeriodStart` took a raw `subscriptions` row and used its
// `currentPeriodStart` whenever one was present. `DEAD_SUBSCRIPTION_FIELDS`
// does not clear that column, so a CANCELLED subscriber's window never advanced
// again — and slice 6's Free mint is what turned that from harmless into a
// wrong number on a money screen: a former subscriber now mints Free credits on
// the UTC calendar month, spends them, and the page summed every month since
// the cancellation under the label "this month".
//
// SO THE TESTS BELOW COME IN TWO LAYERS, and the second one is the one the
// finding demanded:
//
//  1. UNIT — `burnPeriod` chooses by the RESOLVED TIER, driven on both sides
//     (a required parameter every caller happens to pass correctly is not a
//     guard until a test drives its false branch, CLAUDE.md 2026-08-26).
//  2. INTEGRATION — a real dead `subscriptions` row, through the real
//     `getWorkspaceBillingState`, proving the implication this module relies on
//     instead of asserting it: a row that has stopped entitling anybody
//     resolves to `free`, and therefore to the calendar month.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createTestDb,
  ensureUserWorkspace,
  seedAuthUser,
  seedDb,
  subscriptions,
  withWorkspace,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import {
  BURN_PERIOD_COPY,
  burnPeriod,
  type BurnPeriodTier,
} from "../src/burn-period";
import { getWorkspaceBillingState } from "../src/state";

const NOW = new Date("2026-07-15T12:00:00Z");
const CALENDAR = "2026-07-01T00:00:00.000Z";
const ANCHOR = new Date("2026-06-23T14:05:00Z");

describe("burnPeriod (R7/R17a): the period is chosen by the TIER, never by the presence of a row", () => {
  it("a PAID tier uses the subscription's own current_period_start", () => {
    const p = burnPeriod({
      subscription: { currentPeriodStart: ANCHOR },
      tier: "creator",
      now: NOW,
    });
    expect(p.start).toBe(ANCHOR);
    expect(p.kind).toBe("billing_cycle");
  });

  it("no subscription at all (Free, never subscribed) is the UTC calendar month", () => {
    const p = burnPeriod({ subscription: undefined, tier: "free", now: NOW });
    expect(p.start.toISOString()).toBe(CALENDAR);
    expect(p.kind).toBe("calendar_month");
  });

  it("a subscription row with a null current_period_start also falls back", () => {
    const p = burnPeriod({
      subscription: { currentPeriodStart: null },
      tier: "creator",
      now: NOW,
    });
    expect(p.start.toISOString()).toBe(CALENDAR);
    expect(p.kind).toBe("calendar_month");
  });

  // THE FINDING, AS A UNIT CASE: the row still carries a window and the tier no
  // longer entitles anyone to it. Before the fix this returned ANCHOR, forever.
  it("a DEAD subscription's stale current_period_start is IGNORED once the tier resolves to free", () => {
    const p = burnPeriod({
      subscription: { currentPeriodStart: ANCHOR },
      tier: "free",
      now: NOW,
    });
    expect(p.start.toISOString()).toBe(CALENDAR);
    expect(p.kind).toBe("calendar_month");
  });

  // THE `tier` PARAMETER'S OTHER FALSE BRANCH, driven so it is a control and
  // not a decoration: a failed billing-state read must not inherit the row's
  // window either. A shorter window that is labelled honestly is the safe
  // degradation; a stale one labelled "this month" is the defect.
  it("an UNKNOWN tier (the billing-state read failed) is the calendar month, not the row's window", () => {
    const p = burnPeriod({
      subscription: { currentPeriodStart: ANCHOR },
      tier: "unknown",
      now: NOW,
    });
    expect(p.start.toISOString()).toBe(CALENDAR);
    expect(p.kind).toBe("calendar_month");
  });

  it("every tier the billing authority can return is decided, and only the paid ones read the row", () => {
    // A LIST RATHER THAN THE TWO CASES ABOVE (CLAUDE.md 2026-08-29): the
    // population is every value `BillingState["tier"]` can take plus the page's
    // `unknown`, so a fourth tier cannot be added without landing here.
    const paid: BurnPeriodTier[] = ["creator", "pro", "studio"];
    const calendar: BurnPeriodTier[] = ["free", "unknown"];
    for (const tier of paid) {
      expect(
        burnPeriod({ subscription: { currentPeriodStart: ANCHOR }, tier, now: NOW }).kind,
        tier
      ).toBe("billing_cycle");
    }
    for (const tier of calendar) {
      expect(
        burnPeriod({ subscription: { currentPeriodStart: ANCHOR }, tier, now: NOW }).kind,
        tier
      ).toBe("calendar_month");
    }
  });

  it("the calendar month is UTC and is the same instant the Free mint keys on", () => {
    const p = burnPeriod({
      subscription: undefined,
      tier: "free",
      now: new Date("2026-12-31T23:59:59Z"),
    });
    expect(p.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("R17a: the creator is told WHICH period they are reading", () => {
  it("each kind has its own noun and phrase, and neither pair says the other's word", () => {
    expect(BURN_PERIOD_COPY.calendar_month.noun).toBe("this month");
    expect(BURN_PERIOD_COPY.calendar_month.phrase).toBe("this calendar month");
    expect(BURN_PERIOD_COPY.billing_cycle.noun).toBe("this billing period");
    expect(BURN_PERIOD_COPY.billing_cycle.phrase).toBe(
      "your current billing period"
    );
    // THE POINT OF THE SPLIT: a paid workspace's total may not be labelled
    // "this month" when the window it covers is an anniversary.
    expect(BURN_PERIOD_COPY.billing_cycle.noun).not.toMatch(/month/i);
    expect(BURN_PERIOD_COPY.billing_cycle.phrase).not.toMatch(/month/i);
  });

  it("the copy map is TOTAL over the kinds a period can have", () => {
    const kinds = [
      burnPeriod({ subscription: undefined, tier: "free", now: NOW }).kind,
      burnPeriod({
        subscription: { currentPeriodStart: ANCHOR },
        tier: "creator",
        now: NOW,
      }).kind,
    ];
    for (const k of kinds) expect(BURN_PERIOD_COPY[k]).toBeTruthy();
    expect(Object.keys(BURN_PERIOD_COPY).sort()).toEqual([
      "billing_cycle",
      "calendar_month",
    ]);
  });

  // THE VIEW'S `period` PROP IS REQUIRED, AND THIS SENTENCE USED TO SAY IT WAS
  // OPTIONAL (corrected, billing gate round 2, 2026-09-01). It was true when
  // written and false by the end of the same pass: `usage-view.tsx:105` reads
  // `period: BurnPeriodView;`, both fallbacks are gone, and
  // `tests/usage-honesty.test.tsx` asserts the requirement and renders every
  // branch that uses it. A scan justified by a stale sentence is the exact
  // defect this whole round is about, so the JUSTIFICATION is rewritten and
  // the scan is kept: a type cannot say that `page.tsx` DERIVES the period
  // rather than passing a literal, and that derivation is what stops a dead
  // subscription's stale anchor being labelled "this month" again.
  // It asserts it catches a PLANTED violation, because a scan that reports
  // zero violations is otherwise indistinguishable from a scan that is not
  // working (CLAUDE.md 2026-08-21).
  it("SCAN: /usage's page really passes a derived period to the view", () => {
    const file = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "app",
      "(product)",
      "usage",
      "page.tsx"
    );
    const src = readFileSync(file, "utf8");
    const passesPeriod = (text: string) =>
      /<UsageView[\s\S]*?\bperiod=\{/.test(text);
    const derivesIt = (text: string) => /\bburnPeriod\(\{/.test(text);
    expect(derivesIt(src), "page.tsx no longer derives the period").toBe(true);
    expect(passesPeriod(src), "page.tsx no longer passes `period=` to UsageView").toBe(
      true
    );
    // PLANTED: the prop removed. The scan must go red on it.
    const planted = src.replace(/\bperiod=\{[^}]*\}/, "");
    expect(passesPeriod(planted), "the scan fails OPEN on a removed prop").toBe(
      false
    );
    // PLANTED: the derivation removed.
    expect(derivesIt(src.replace(/burnPeriod\(\{/, "STALE_PERIOD({"))).toBe(false);
  });

  // AND THE VIEW REALLY RENDERS IT. The stand-in disclaimer that used to sit
  // here — "the rendered line has no behavioural assertion yet" — is retired
  // (billing gate round 2, 2026-09-01): `tests/usage-honesty.test.tsx` now
  // renders the panel for both period kinds AND for the failed-burn branch
  // this file's source scan could never see. What is left here is a source
  // scan over the WIRING (which expression each line takes its noun from),
  // which a render cannot distinguish from a literal that happens to agree.
  // Each shape asserts a PLANTED counterexample for the 2026-08-21 reason.
  it("SCAN: /usage's view renders the period line and takes its noun from the prop", () => {
    const file = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "app",
      "(product)",
      "usage",
      "usage-view.tsx"
    );
    const src = readFileSync(file, "utf8");
    const rendersLine = (t: string) => /data-testid="burn-period"/.test(t);
    const totalUsesProp = (t: string) => /credits spent \$\{periodNoun\}/.test(t);
    const headingUsesProp = (t: string) => /capitalise\(period\.noun\)/.test(t);
    expect(rendersLine(src), "the period line is gone").toBe(true);
    expect(totalUsesProp(src), "the burn total went back to a hard-coded period").toBe(
      true
    );
    expect(headingUsesProp(src), "the panel heading went back to a literal").toBe(
      true
    );
    // PLANTED, one per shape.
    expect(rendersLine(src.replace('data-testid="burn-period"', ""))).toBe(false);
    expect(
      totalUsesProp(src.replace("credits spent ${periodNoun}", "credits spent this month"))
    ).toBe(false);
    expect(
      headingUsesProp(src.replace("capitalise(period.noun)", '"This month"'))
    ).toBe(false);
  });
});

describe("the implication burnPeriod relies on, proved rather than argued", () => {
  // `burnPeriod` needs no second liveness test ONLY because a paid tier can
  // only come out of a branch that already passed one. That is a property of
  // `getWorkspaceBillingState`, not of this module, so it is asserted against
  // the real function with real rows.
  const deadStatuses = ["canceled", "incomplete_expired", "none", "unpaid"];

  it("every dead subscription status resolves to `free`, so its stale window can never be chosen", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" });
    const ws = (await withWorkspace(db, { authUserId: "user_a" })).workspaceId;
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, stripePriceMap: { price_creator: "creator" } },
      "test-admin"
    );

    for (const status of deadStatuses) {
      await db.delete(subscriptions);
      // THE SHAPE `DEAD_SUBSCRIPTION_FIELDS` REALLY LEAVES BEHIND: it clears
      // `stripePriceId`, `cancelAt`, `graceExpiresAt` and the auto-top-up
      // fields, and deliberately does NOT clear `currentPeriodStart`.
      await db.insert(subscriptions).values({
        workspaceId: ws,
        stripeCustomerId: "cus_x",
        stripeSubscriptionId: "sub_x",
        stripePriceId: null,
        status,
        currentPeriodStart: ANCHOR,
      });
      const state = await getWorkspaceBillingState(db, ws, NOW);
      expect(state.tier, `status=${status}`).toBe("free");
      const [row] = await db.select().from(subscriptions);
      expect(
        row.currentPeriodStart,
        `status=${status}: the stale window is still on the row — that is the point`
      ).toEqual(ANCHOR);
      const p = burnPeriod({ subscription: row, tier: state.tier, now: NOW });
      expect(p.start.toISOString(), `status=${status}`).toBe(CALENDAR);
      expect(p.kind, `status=${status}`).toBe("calendar_month");
    }
  });

  it("a LIVE, mapped subscription still gets its anniversary — the fix is not a blanket calendar month", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "user_b");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_b", name: "W" });
    const ws = (await withWorkspace(db, { authUserId: "user_b" })).workspaceId;
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, stripePriceMap: { price_creator: "creator" } },
      "test-admin"
    );
    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_y",
      stripeSubscriptionId: "sub_y",
      stripePriceId: "price_creator",
      status: "active",
      currentPeriodStart: ANCHOR,
    });
    const state = await getWorkspaceBillingState(db, ws, NOW);
    expect(state.tier).toBe("creator");
    const [row] = await db.select().from(subscriptions);
    const p = burnPeriod({ subscription: row, tier: state.tier, now: NOW });
    expect(p.start).toEqual(ANCHOR);
    expect(p.kind).toBe("billing_cycle");
  });

  it("an UNMAPPED price on a LIVE subscription is Free-entitled, and reads the Free period", async () => {
    // The same state the Free MINT now refuses to mint on while paused, and the
    // one `state.ts` resolves to `{tier: "free", reason: "unmapped_price"}`:
    // the workspace is entitled to Free credits, which are granted on the
    // calendar month, so that is the window their burn is measured over.
    const db = await createTestDb();
    await seedAuthUser(db, "user_c");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_c", name: "W" });
    const ws = (await withWorkspace(db, { authUserId: "user_c" })).workspaceId;
    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_z",
      stripeSubscriptionId: "sub_z",
      stripePriceId: "price_not_in_the_map",
      status: "active",
      currentPeriodStart: ANCHOR,
    });
    const state = await getWorkspaceBillingState(db, ws, NOW);
    expect(state.tier).toBe("free");
    const [row] = await db.select().from(subscriptions);
    expect(
      burnPeriod({ subscription: row, tier: state.tier, now: NOW }).kind
    ).toBe("calendar_month");
  });
});
