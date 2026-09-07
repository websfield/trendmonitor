// Deterministic real-Postgres proof for the auto-top-up charge fence. PGlite
// has one connection and cannot prove that a lifecycle/billing writer which
// wins the shared lock is observed before an irreversible provider call.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

const { paymentIntentCreate, priceRetrieve } = vi.hoisted(() => ({
  paymentIntentCreate: vi.fn(async (params: {
    amount: number;
    currency: string;
    customer: string;
    metadata: Record<string, string>;
  }) => ({
    id: "pi_race",
    status: "processing",
    amount: params.amount,
    currency: params.currency,
    customer: params.customer,
    metadata: params.metadata,
  })),
  priceRetrieve: vi.fn(async () => ({
    id: "price_pack",
    active: true,
    unit_amount: 1000,
    currency: "usd",
  })),
}));

vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    paymentIntents: { create: paymentIntentCreate },
    prices: { retrieve: priceRetrieve },
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

import {
  CONFIG_V1_SEED,
  createDockerTestDb,
  lockWorkspaceMembershipGraph,
  schema,
  seedAuthUser,
  seedDb,
  trustWorkspaceId,
  withWorkspace,
  type DbLike,
  type ReauthenticatedSessionRef,
  type TxLike,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import { takeWorkspaceLock } from "../src/clock";
import { setAutoTopup } from "../src/stripe/actions";
import { maybeAutoTopup } from "../src/stripe/auto-topup";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[auto-topup-race.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: a winning owner disable/lower-cap or workspace " +
      "tombstone is observed before auto-top-up can create a PaymentIntent."
  );
}

type Harness = Awaited<ReturnType<typeof createDockerTestDb>>;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function transactionOnlyDb(
  db: DbLike,
  run: <T>(callback: (tx: TxLike) => Promise<T>) => Promise<T>
): DbLike {
  return { transaction: run } as unknown as DbLike;
}

describe.skipIf(!MAINTENANCE_URL)("auto-top-up lifecycle and billing races on REAL Postgres", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_autotopuprace"
    );
    await seedDb(harness.db);
    await appendConfigVersion(
      harness.db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_pack: "pack" } },
      "auto-topup-race"
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

  async function waitForBlockedAdvisoryLock(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await harness.pool.query<{ waiting: number }>(
        "SELECT count(*)::int AS waiting FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted",
        [pid]
      );
      if ((result.rows[0]?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("auto-top-up never blocked on the billing advisory lock");
  }

  async function armedWorkspace(): Promise<{
    workspaceId: VerifiedWorkspaceId;
    scope: WorkspaceScope;
    authority: ReauthenticatedSessionRef;
  }> {
    const suffix = Math.random().toString(36).slice(2, 10);
    const authUserId = `auto_topup_race_${suffix}`;
    const reauthenticatedAt = new Date();
    const sessionId = `session_${suffix}`;
    await seedAuthUser(harness.db, authUserId);
    const [workspace] = await harness.db
      .insert(schema.workspaces)
      .values({ name: `Auto top-up race ${suffix}` })
      .returning();
    const [user] = await harness.db
      .insert(schema.users)
      .values({ authUserId })
      .returning();
    await harness.db.insert(schema.memberships).values({
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
    });
    await harness.db.insert(schema.session).values({
      id: sessionId,
      token: `token_${suffix}`,
      userId: authUserId,
      expiresAt: new Date(reauthenticatedAt.getTime() + 60 * 60 * 1000),
      updatedAt: reauthenticatedAt,
      reauthenticatedAt,
    });
    const scope = await withWorkspace(harness.db, {
      authUserId,
      workspaceId: workspace.id,
    });
    const workspaceId = trustWorkspaceId(workspace.id);
    await harness.db.insert(schema.subscriptions).values({
      workspaceId,
      stripeCustomerId: `cus_${suffix}`,
      stripeSubscriptionId: `sub_${suffix}`,
      status: "active",
      autoTopupV1Enabled: true,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
    });
    // The insert-normalization trigger deliberately clears caller-supplied
    // opt-in. Arm only after the protocol/cutover row exists so every race
    // starts from genuine charge authority rather than a disabled fixture.
    await harness.db
      .update(schema.subscriptions)
      .set({ autoTopupV1Enabled: true })
      .where(eq(schema.subscriptions.workspaceId, workspaceId));
    return {
      workspaceId,
      scope,
      authority: { authUserId, sessionId, reauthenticatedAt },
    };
  }

  it(
    "non-vacuity: an armed control workspace reaches PaymentIntent creation",
    { timeout: 60_000 },
    async () => {
      paymentIntentCreate.mockClear();
      const { workspaceId } = await armedWorkspace();

      await expect(
        maybeAutoTopup(harness.db, workspaceId, 1, new Date())
      ).resolves.toEqual({ triggered: true, paymentIntentId: "pi_race" });
      expect(paymentIntentCreate).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["disable", { enabled: false }, "disabled"],
    ["lower-cap", { enabled: true, monthlyCapCents: 500 }, "cap_reached"],
  ] as const)(
    "a winning owner %s commits before the charge decision and creates no PaymentIntent",
    { timeout: 60_000 },
    async (_label, setting, expectedReason) => {
      paymentIntentCreate.mockClear();
      const { db } = harness;
      const { workspaceId, scope, authority } = await armedWorkspace();
      const settingWritten = deferred();
      const releaseSettingCommit = deferred();
      const chargingTransactionStarted = deferred();

      const heldActionDb = transactionOnlyDb(db, (callback) =>
        db.transaction(async (tx) => {
          const result = await callback(tx);
          settingWritten.resolve();
          await releaseSettingCommit.promise;
          return result;
        })
      );
      const settingPromise = setAutoTopup(heldActionDb, scope, setting, authority);
      await settingWritten.promise;

      const chargingDb = transactionOnlyDb(db, (callback) =>
        db.transaction(async (tx) => {
          chargingTransactionStarted.resolve();
          return callback(tx);
        })
      );
      const chargePromise = maybeAutoTopup(chargingDb, workspaceId, 1, new Date());
      await chargingTransactionStarted.promise;
      releaseSettingCommit.resolve();
      await settingPromise;

      await expect(chargePromise).resolves.toEqual({
        triggered: false,
        reason: expectedReason,
      });
      expect(paymentIntentCreate).not.toHaveBeenCalled();
    }
  );

  it(
    "a webhook-shaped pause which wins only the billing lock prevents the PaymentIntent",
    { timeout: 60_000 },
    async () => {
      paymentIntentCreate.mockClear();
      const { db } = harness;
      const { workspaceId } = await armedWorkspace();
      const pauseWritten = deferred();
      const releasePauseCommit = deferred();
      const chargingTransactionStarted = deferred();
      let chargingPid = 0;

      const pausePromise = db.transaction(async (tx) => {
        await takeWorkspaceLock(tx, workspaceId);
        await tx
          .update(schema.subscriptions)
          .set({ pausedAt: new Date() })
          .where(eq(schema.subscriptions.workspaceId, workspaceId));
        pauseWritten.resolve();
        await releasePauseCommit.promise;
      });
      await pauseWritten.promise;

      const chargingDb = transactionOnlyDb(db, (callback) =>
        db.transaction(async (tx) => {
          const result = (await tx.execute(
            sql`SELECT pg_backend_pid() AS pid`
          )) as unknown as { rows: { pid: number }[] };
          chargingPid = Number(result.rows[0]?.pid ?? 0);
          chargingTransactionStarted.resolve();
          return callback(tx);
        })
      );
      const chargePromise = maybeAutoTopup(chargingDb, workspaceId, 1, new Date());
      await chargingTransactionStarted.promise;
      await waitForBlockedAdvisoryLock(chargingPid);
      releasePauseCommit.resolve();
      await pausePromise;

      await expect(chargePromise).resolves.toEqual({
        triggered: false,
        reason: "paused",
      });
      expect(paymentIntentCreate).not.toHaveBeenCalled();
    }
  );

  it(
    "a workspace tombstone which wins the lifecycle lock prevents the PaymentIntent",
    { timeout: 60_000 },
    async () => {
      paymentIntentCreate.mockClear();
      const { db } = harness;
      const { workspaceId } = await armedWorkspace();
      const tombstoneWritten = deferred();
      const releaseTombstoneCommit = deferred();
      const chargingTransactionStarted = deferred();

      const tombstonePromise = db.transaction(async (tx) => {
        await lockWorkspaceMembershipGraph(tx, workspaceId);
        await tx
          .update(schema.workspaces)
          .set({
            lifecycleState: "tombstoned",
            lifecycleVersion: sql`${schema.workspaces.lifecycleVersion} + 1`,
          })
          .where(eq(schema.workspaces.id, workspaceId));
        tombstoneWritten.resolve();
        await releaseTombstoneCommit.promise;
      });
      await tombstoneWritten.promise;

      const chargingDb = transactionOnlyDb(db, (callback) =>
        db.transaction(async (tx) => {
          chargingTransactionStarted.resolve();
          return callback(tx);
        })
      );
      const chargePromise = maybeAutoTopup(chargingDb, workspaceId, 1, new Date());
      await chargingTransactionStarted.promise;
      releaseTombstoneCommit.resolve();
      await tombstonePromise;

      await expect(chargePromise).rejects.toThrow(
        "lifecycle_refused:workspace_not_active"
      );
      expect(paymentIntentCreate).not.toHaveBeenCalled();
    }
  );
});
