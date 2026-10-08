// THE ONE LOCK ORDER UNDER REAL CONTENTION (audit Phase 8, P8-A1, R-177;
// register 2026-10-05 item 5) — the four holders the register named, on one
// workspace, on REAL Postgres:
//
//   settle (via `generate`)  — billing, then a profile lifecycle fence
//   inferVoice               — billing, then `firstBillableAttempt` and the
//                              brain write (P3-A1), both fenced
//   maybeAutoTopup           — workspace membership, then billing
//   a webhook dispatch       — workspace membership, then billing, then a
//                              Stripe call under both
//
// Before Phase 8 the first two took billing FIRST and the membership graph
// (exclusive) second, the last two the other way round: a deadlock, whose
// victim is a paid vendor call stranded at `vendor_complete`. The run below
// queues all four behind one held billing lock so they are released into the
// same instant — settle first in the queue, which is exactly the interleaving
// that deadlocked — and records zero `40P01`, zero `LockOrderError`, and no
// `recovery_required` attempt.
//
// NON-VACUITY (CLAUDE.md 2026-08-26): the second case replays the OLD order on
// the same harness with raw lock statements (no guard) and gets a `40P01`; the
// third replays it through the real lock functions and gets a `LockOrderError`
// BEFORE any wait. So the harness can produce the deadlock, and the guard
// turns the inversion into a loud refusal rather than a deadlock.
//
// Ordering is by barriers and `pg_locks`, never by sleeps.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const stripeStub = vi.hoisted(() => ({
  retrieveCalls: 0,
  subscriptionSnapshot: null as unknown,
  paymentIntentCreate: async (params: {
    amount: number;
    currency: string;
    customer: string;
    metadata: Record<string, string>;
  }) => ({
    id: `pi_lockorder_${Math.random().toString(36).slice(2, 8)}`,
    status: "processing",
    amount: params.amount,
    currency: params.currency,
    customer: params.customer,
    metadata: params.metadata,
  }),
}));

vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    paymentIntents: { create: stripeStub.paymentIntentCreate },
    prices: {
      retrieve: async () => ({
        id: "price_pack",
        active: true,
        type: "one_time",
        billing_scheme: "per_unit",
        recurring: null,
        unit_amount: 1000,
        currency: "usd",
      }),
    },
    subscriptions: {
      retrieve: async () => {
        stripeStub.retrieveCalls += 1;
        return stripeStub.subscriptionSnapshot;
      },
    },
  }),
  getAutoTopupAuthorityKeyMaterial: () => ({
    id: "v1" as const,
    key: "race-authority-key-material-32b",
    fingerprint: `sha256:${"b".repeat(64)}`,
  }),
  getAutoTopupAuthorityKey: () => "race-authority-key-material-32b",
  getAuthenticatedStripeAccountIdentity: async () => ({
    accountId: "acct_race",
    livemode: false,
  }),
}));

import { and, eq, sql } from "drizzle-orm";
import {
  brainActivationSnapshots,
  brainDocs,
  CONFIG_V1_SEED,
  createDockerTestDb,
  ensureUserWorkspace,
  generationAttempts,
  LockOrderError,
  lockWorkspaceMembershipGraph,
  mintProfileScope,
  schema,
  seedAuthUser,
  seedDb,
  sqlStateOf,
  subscriptions,
  withWorkspace,
  writeCapabilities,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import type { LlmProvider } from "@respin/llm";
import { appendConfigVersion } from "@respin/config";
import { takeWorkspaceLock } from "../src/clock";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { generate } from "../src/generate";
import { inferVoice, VOICE_CORPUS_MAX_POSTS } from "../src/infer-voice";
import { maybeAutoTopup } from "../src/stripe/auto-topup";
import { handleStripeEvent } from "../src/stripe/webhooks";
import { anySlots } from "./support/run-slots";
import { PLATFORM, hooksOutput, killTestReply, reply } from "./support/generation-fixtures";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[lock-order.docker.test] SKIPPED - TEST_DATABASE_URL is not set. NOT PROVEN in this run: " +
      "that settle, onboarding inference, auto-top-up and a webhook dispatch released together on " +
      "one workspace never deadlock (zero 40P01, zero recovery_required), nor that the old lock " +
      "order deadlocks on the same harness and is refused by the runtime guard."
  );
}

const OWN_POSTS = [
  "I open on a number every single time, and then I say why it matters.",
  "The camera is not the problem. Your first three seconds are the problem.",
  "Say the thing that costs you something to admit. Discomfort travels far.",
];

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A provider that holds its FIRST call until released; later calls answer at once. */
function heldProvider(first: () => string, rest: () => string) {
  const inFlight = deferred();
  const released = deferred();
  let calls = 0;
  const provider: LlmProvider = {
    vendor: "held-stub",
    complete: async () => {
      calls += 1;
      const isFirst = calls === 1;
      if (isFirst) {
        inFlight.resolve();
        await released.promise;
      }
      return {
        text: isFirst ? first() : rest(),
        servedModel: "claude-sonnet-5",
        usage: { tokensIn: 10, tokensOut: 5, raw: { input_tokens: 10, output_tokens: 5 } },
      };
    },
  };
  return { provider, inFlight: inFlight.promise, release: released.resolve };
}

describe.skipIf(!MAINTENANCE_URL)("the one lock order under four-way contention, on REAL Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let n = 0;

  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_lockorder");
    await seedDb(harness.db);
    await appendConfigVersion(
      harness.db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_pack: "pack", price_creator: "creator" } },
      "lock-order-race"
    );
    const rolloutAt = new Date();
    await harness.db
      .update(schema.autoTopupProtocolRollouts)
      .set({
        state: "active",
        revision: 1,
        fleetQuiescedAt: rolloutAt,
        drainStartedAt: rolloutAt,
        providerReconciledAt: rolloutAt,
        reconciledCustomers: 0,
        reconciledPaymentIntents: 0,
        authorityKeyId: "v1",
        authorityKeyFingerprint: `sha256:${"b".repeat(64)}`,
        stripeAccountId: "acct_race",
        stripeLivemode: false,
        activatedAt: rolloutAt,
      })
      .where(eq(schema.autoTopupProtocolRollouts.protocol, "v1"));
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  async function prewarmPool(count: number): Promise<void> {
    const clients = await Promise.all(Array.from({ length: count }, () => harness.pool.connect()));
    for (const c of clients) c.release();
  }

  /**
   * Backends WAITING on an advisory lock in THIS test's database (pg_locks is
   * server-wide; the live harness runs other suites' databases alongside).
   */
  async function advisoryWaiters(): Promise<number> {
    const r = await harness.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())"
    );
    return r.rows[0].n;
  }

  async function waitForAdvisoryWaiters(count: number): Promise<void> {
    for (let i = 0; i < 1_000; i += 1) {
      if ((await advisoryWaiters()) >= count) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`fewer than ${count} backends ever waited on an advisory lock (now ${await advisoryWaiters()})`);
  }

  type Fixture = {
    ws: VerifiedWorkspaceId;
    owner: WorkspaceScope;
    profileId: string;
    postIds: string[];
    customerId: string;
    subscriptionId: string;
    mirrorAt: Date;
  };

  async function fixture(): Promise<Fixture> {
    n += 1;
    const user = `lockorder_user_${n}`;
    await seedAuthUser(harness.db, user, `${user}@test.dev`);
    await ensureUserWorkspace(harness.db, { authUserId: user, name: `L${n}` });
    const owner = await withWorkspace(harness.db, { authUserId: user });
    const ws = owner.workspaceId;
    const profile = await createProfile(harness.db, owner, "Anna", new Date());
    await harness.db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: ws,
        amount: 1000,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test",
        refId: `lockorder-grant-${n}`,
        configVersion: 1,
      })
    );
    // An activated brain (voice + kill test), for `generate`.
    const evidence = [
      { field: "/register", quote: "c", inputId: "00000000-0000-4000-8000-000000000001", startUtf16: 0, endUtf16: 1 },
    ];
    const confirmed = { confirmedAt: new Date(), confirmedContentSha256: "0".repeat(64), activatedAt: new Date() };
    const [voice] = await harness.db
      .insert(brainDocs)
      .values({
        profileId: profile.id, workspaceId: ws, kind: "voice", version: 1,
        content: { register: "plain and direct", sentenceRhythm: "short lines", signatureMoves: ["opens on what went wrong"], avoid: ["never uses hype words"] },
        reason: "Version 1: you edited this document.", sourceEvidence: evidence, status: "active", ...confirmed,
      })
      .returning();
    const [killtest] = await harness.db
      .insert(brainDocs)
      .values({
        profileId: profile.id, workspaceId: ws, kind: "killtest", version: 1,
        content: { rules: ["it must not sound like an advert"] },
        reason: "Version 1: you edited this document.", sourceEvidence: evidence, status: "active", ...confirmed,
      })
      .returning();
    await harness.db.insert(brainActivationSnapshots).values({
      profileId: profile.id, workspaceId: ws, voiceDocId: voice.id, killtestDocId: killtest.id,
    });
    // Three own posts, through the real capability, for `inferVoice`.
    const profileScope = await mintProfileScope(harness.db, owner, profile.id);
    const caps = writeCapabilities(profileScope);
    const postIds: string[] = [];
    for (const content of OWN_POSTS) {
      postIds.push((await caps.appendOnboardingInput({ inputClass: "own_post", content })).id);
    }
    // A paid, armed subscription mirror, for `maybeAutoTopup` and the webhook.
    const customerId = `cus_lockorder_${n}`;
    const subscriptionId = `sub_lockorder_${n}`;
    const mirrorAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await harness.db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: "price_creator",
      status: "active",
      autoTopupV1Enabled: true,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
      mirrorEventAt: mirrorAt,
      cancelAtPeriodEnd: false,
    });
    await harness.db.update(subscriptions).set({ autoTopupV1Enabled: true }).where(eq(subscriptions.workspaceId, ws));
    return { ws, owner, profileId: profile.id, postIds, customerId, subscriptionId, mirrorAt };
  }

  /**
   * A `customer.subscription.updated` at the mirror's own instant whose snapshot
   * differs from the mirror — the shape that makes the dispatcher ask Stripe
   * (`subscriptions.retrieve`) while it holds both workspace locks.
   */
  function subscriptionEvent(f: Fixture, eventId: string) {
    const created = Math.floor(f.mirrorAt.getTime() / 1000);
    const sub = {
      id: f.subscriptionId, object: "subscription", customer: f.customerId,
      status: "active", cancel_at_period_end: true, cancel_at: null, pause_collection: null,
      items: { object: "list", data: [{
        id: "si_lockorder", object: "subscription_item",
        price: { id: "price_creator", object: "price" },
        current_period_start: created, current_period_end: created + 30 * 86400,
      }] },
    };
    stripeStub.subscriptionSnapshot = sub;
    return {
      id: eventId, object: "event", type: "customer.subscription.updated",
      api_version: "x", created, livemode: false, pending_webhooks: 0, request: null,
      data: { object: sub },
    } as never;
  }

  it(
    "settle, inferVoice, maybeAutoTopup and a webhook dispatch released together: zero 40P01, zero LockOrderError, no recovery_required",
    { timeout: 120_000 },
    async () => {
      const f = await fixture();
      await prewarmPool(8);
      stripeStub.retrieveCalls = 0;

      // 1. Two vendor calls in flight (no lock held during either).
      const gen = heldProvider(() => reply(hooksOutput()), () => killTestReply(["/rules/0"]));
      const voiceReply = JSON.stringify({
        fields: [
          { key: "register", values: [{ value: "Direct", inputId: f.postIds[0], quote: OWN_POSTS[0].slice(0, 20) }] },
          { key: "sentenceRhythm", values: [{ value: "[check]", inputId: null, quote: null }] },
          { key: "signatureMoves", values: [{ value: "[check]", inputId: null, quote: null }] },
          { key: "avoid", values: [{ value: "[check]", inputId: null, quote: null }] },
        ],
      });
      const voice = heldProvider(() => voiceReply, () => voiceReply);
      const settlePromise = generate(
        harness.db, f.owner, f.profileId, gen.provider, anySlots(),
        { mode: "hooks", attemptId: `lockorder-gen-${n}`, input: "what my first year actually looked like", platform: PLATFORM },
        new Date()
      );
      const inferPromise = inferVoice(
        harness.db, f.owner, f.profileId, voice.provider, anySlots(), `lockorder-voice-${n}`, 3, VOICE_CORPUS_MAX_POSTS, new Date()
      );
      await Promise.all([gen.inFlight, voice.inFlight]);

      // 2. THE GATE: one transaction holds the billing lock (billing only — it
      //    breaks no order), so every holder below queues behind it.
      const gateHeld = deferred();
      const gateRelease = deferred();
      const gate = harness.db.transaction(async (tx) => {
        await takeWorkspaceLock(tx, f.ws);
        gateHeld.resolve();
        await gateRelease.promise;
      });
      await gateHeld.promise;

      // 3. Settlement and the inference debit queue FIRST — the interleaving
      //    that deadlocked: under the old order they held billing and then
      //    asked for the membership graph the Stripe paths already held.
      gen.release();
      voice.release();
      await waitForAdvisoryWaiters(2);
      // 4. The Stripe-facing pair queue behind them.
      const topupPromise = maybeAutoTopup(harness.db, f.ws, 1, new Date());
      const webhookPromise = handleStripeEvent(harness.db, subscriptionEvent(f, `evt_lockorder_${n}`));
      await waitForAdvisoryWaiters(4);

      // 5. Release all four into the same instant.
      gateRelease.resolve();
      await gate;
      const results = await Promise.allSettled([settlePromise, inferPromise, topupPromise, webhookPromise]);

      const failures = results
        .map((r, i) => ({ r, who: ["settle", "inferVoice", "maybeAutoTopup", "webhook"][i] }))
        .filter((x) => x.r.status === "rejected")
        .map((x) => ({ who: x.who, reason: (x.r as PromiseRejectedResult).reason as unknown }));
      const deadlocks = failures.filter((x) => sqlStateOf(x.reason) === "40P01");
      const orderErrors = failures.filter((x) => x.reason instanceof LockOrderError);
      expect(deadlocks, "a deadlock victim").toEqual([]);
      expect(orderErrors, "a lock-order inversion").toEqual([]);
      // Every holder completed, not merely "did not deadlock".
      expect(failures.map((x) => `${x.who}: ${String(x.reason)}`)).toEqual([]);

      // The webhook really did call Stripe under both locks (the shape the
      // render test holds open).
      expect(stripeStub.retrieveCalls).toBe(1);
      // No paid vendor call was stranded.
      const attempts = await harness.db
        .select({ state: generationAttempts.state })
        .from(generationAttempts)
        .where(eq(generationAttempts.workspaceId, f.ws));
      expect(attempts.map((a) => a.state)).not.toContain("recovery_required");
      expect(attempts.map((a) => a.state)).not.toContain("vendor_complete");
    }
  );

  it(
    "gate L7: settle against a membership WRITER that holds the exclusive form and then needs billing — the one order completes with zero 40P01; the old order (planted) is a real deadlock",
    { timeout: 120_000 },
    async () => {
      // WHY THIS SHAPE, MEASURED 2026-10-07. Under the shared form the race
      // above cannot deadlock whatever the order. The gate asked for a
      // deletion-shaped exclusive WAITER queued behind the webhook's shared
      // hold; planted (settle back on `takeWorkspaceLock`, the guard's
      // "after_billing" refusal removed) that shape stayed GREEN: a cycle that
      // runs through a lock request that is only WAITING is a "soft" deadlock,
      // and Postgres's detector rearranges the wait queue instead of aborting
      // anyone. The hard cycle needs the writer to HOLD the exclusive form —
      // the shape every membership writer has once granted — and then take
      // billing, which the one order allows (membership, then billing). Under
      // the OLD order settle holds billing and asks for the membership graph
      // the writer holds while the writer asks for billing: 40P01. Measured by
      // the same plant: this case goes red with a deadlock victim.
      const f = await fixture();
      await prewarmPool(8);
      const gen = heldProvider(() => reply(hooksOutput()), () => killTestReply(["/rules/0"]));
      const settlePromise = generate(
        harness.db, f.owner, f.profileId, gen.provider, anySlots(),
        { mode: "hooks", attemptId: `lockorder-l7-${n}`, input: "what my first year actually looked like", platform: PLATFORM },
        new Date()
      );
      await gen.inFlight;

      // 1. THE GATE on billing, so the order of arrival is the test's.
      const gateHeld = deferred();
      const gateRelease = deferred();
      const gate = harness.db.transaction(async (tx) => {
        await takeWorkspaceLock(tx, f.ws);
        gateHeld.resolve();
        await gateRelease.promise;
      });
      await gateHeld.promise;

      // 2. Settle arrives first. Under the one order it takes the membership
      //    graph (shared) and queues on billing.
      gen.release();
      await waitForAdvisoryWaiters(1);
      // 3. THE MEMBERSHIP WRITER: exclusive form, then billing — the one
      //    order's shape for a writer that touches money.
      const writer = harness.db.transaction(async (tx) => {
        await lockWorkspaceMembershipGraph(tx, f.ws, "exclusive");
        await takeWorkspaceLock(tx, f.ws);
      });
      await waitForAdvisoryWaiters(2);

      // 4. Release.
      gateRelease.resolve();
      await gate;
      const results = await Promise.allSettled([settlePromise, writer]);
      const failures = results
        .map((r, i) => ({ r, who: ["settle", "membership writer"][i] }))
        .filter((x) => x.r.status === "rejected")
        .map((x) => ({ who: x.who, reason: (x.r as PromiseRejectedResult).reason as unknown }));
      expect(failures.filter((x) => sqlStateOf(x.reason) === "40P01"), "a deadlock victim").toEqual([]);
      expect(failures.filter((x) => x.reason instanceof LockOrderError), "a lock-order inversion").toEqual([]);
      expect(failures.map((x) => `${x.who}: ${String(x.reason)}`)).toEqual([]);
      const attempts = await harness.db
        .select({ state: generationAttempts.state })
        .from(generationAttempts)
        .where(eq(generationAttempts.workspaceId, f.ws));
      expect(attempts.map((a) => a.state)).not.toContain("recovery_required");
      expect(attempts.map((a) => a.state)).not.toContain("vendor_complete");
    }
  );

  it(
    "NON-VACUITY: the OLD order, replayed with raw lock statements on this harness, deadlocks (40P01)",
    { timeout: 60_000 },
    async () => {
      const f = await fixture();
      const billing = sql`SELECT pg_advisory_xact_lock(hashtextextended(${f.ws}::text, 0))`;
      const membership = sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-membership:${f.ws}`}, 0))`;
      const aHasBilling = deferred();
      const bHasMembership = deferred();
      // A — the pre-Phase-8 settle: billing, then the membership graph.
      const a = harness.db.transaction(async (tx) => {
        await tx.execute(billing);
        aHasBilling.resolve();
        await bHasMembership.promise;
        await tx.execute(membership);
      });
      // B — the Stripe path: membership, then billing.
      const b = harness.db.transaction(async (tx) => {
        await aHasBilling.promise;
        await tx.execute(membership);
        bHasMembership.resolve();
        await tx.execute(billing);
      });
      const results = await Promise.allSettled([a, b]);
      const codes = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => sqlStateOf(r.reason));
      expect(codes).toEqual(["40P01"]);
    }
  );

  it(
    "the SAME inversion through the real lock functions is refused by the guard BEFORE it waits — a LockOrderError, never a 40P01",
    { timeout: 60_000 },
    async () => {
      const f = await fixture();
      const aHasBilling = deferred();
      const bHasMembership = deferred();
      const bRelease = deferred();
      const a = harness.db.transaction(async (tx) => {
        await takeWorkspaceLock(tx, f.ws);
        aHasBilling.resolve();
        await bHasMembership.promise;
        await lockWorkspaceMembershipGraph(tx, f.ws, "exclusive");
      });
      const b = harness.db.transaction(async (tx) => {
        await aHasBilling.promise;
        await lockWorkspaceMembershipGraph(tx, f.ws, "exclusive");
        bHasMembership.resolve();
        await bRelease.promise;
      });
      const aResult = await a.then(() => null, (e: unknown) => e);
      expect(aResult).toBeInstanceOf(LockOrderError);
      expect((aResult as LockOrderError).reason).toBe("after_billing");
      bRelease.resolve();
      await b;
      // Nobody is left waiting.
      expect(await advisoryWaiters()).toBe(0);
    }
  );

  it("the fixture's mirror row is the one the webhook resolves (sanity for case 1)", async () => {
    const f = await fixture();
    const [row] = await harness.db
      .select({ ws: subscriptions.workspaceId })
      .from(subscriptions)
      .where(and(eq(subscriptions.stripeCustomerId, f.customerId), eq(subscriptions.workspaceId, f.ws)));
    expect(row?.ws).toBe(f.ws);
  });
});
