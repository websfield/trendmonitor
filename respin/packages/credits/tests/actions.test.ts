// Billing actions — keyless coverage: every guard fires BEFORE any Stripe
// call, so the matrix runs with no STRIPE_* env (AC-6) — reaching Stripe
// without a key would throw StripeNotConfiguredError, which none of these do.
import { describe, expect, it, vi } from "vitest";

// The ONLY mock in this suite, and it exists to reach the one branch a keyless
// test cannot: maybeAutoTopup's SUCCESS path (code-review CHANGE — the trigger
// path, the idempotency key the plan says "the Docker race case asserts", and
// the cap's ALLOW direction all shipped with no test at all).
const piCreate = vi.fn(async (params: Record<string, unknown>) => ({
  id: "pi_created",
  amount: params.amount,
  currency: params.currency,
  customer: params.customer,
  metadata: params.metadata,
  status: "succeeded",
}));
const piList = vi.fn(
  async (): Promise<{
    data: Record<string, unknown>[];
    has_more: boolean;
  }> => ({ data: [], has_more: false })
);
const piRetrieve = vi.fn();
const piCancel = vi.fn();
// Round-5 additions: the tier-checkout idempotency key and the pause resume
// date are both arguments this package hands to Stripe and never stores, so
// they are only observable through the client (billing review findings 3 + 4).
const sessionCreate = vi.fn(async (params: Record<string, unknown>) => ({
  id: "cs_created",
  url: "https://checkout.stripe.test/cs_created",
  mode: params.mode,
  customer: params.customer,
  metadata: params.metadata,
  payment_status: "unpaid",
  status: "open",
  subscription: null,
}));
const sessionList = vi.fn(
  async (): Promise<{
    data: Record<string, unknown>[];
    has_more: boolean;
  }> => ({ data: [], has_more: false })
);
const sessionRetrieve = vi.fn(async (id: string) => {
  const params = sessionCreate.mock.calls.at(-1)?.[0] as
    | Record<string, unknown>
    | undefined;
  const metadata = (params?.metadata ?? {}) as Record<string, unknown>;
  const priceId =
    typeof metadata.price_id === "string" ? metadata.price_id : "price_creator";
  return {
    id,
    url: `https://checkout.stripe.test/${id}`,
    mode: params?.mode ?? "subscription",
    customer: params?.customer ?? "cus_created",
    metadata,
    payment_status: "unpaid",
    status: "open",
    subscription: null,
    line_items: {
      data: [{ price: { id: priceId } }],
    },
  };
});
const customerCreate = vi.fn(async () => ({ id: "cus_created" }));
const subUpdate = vi.fn(async () => ({ id: "sub_updated" }));
// Audit #7 + #8 (billing gate 2026-08-18). `prices.retrieve` is what
// `resolvePackPrice` reads — it is now on BOTH charge paths, so the mock has to
// serve it. `subscriptions.retrieve` / `invoices.retrieve` are what
// `createInvoiceRecoveryUrl` reads; without them its whole Stripe half was
// unreachable and an inverted status check would have failed nothing.
const priceRetrieve = vi.fn(async () => ({
  id: "price_pack",
  active: true,
  unit_amount: 1000,
  currency: "usd",
}));
const subRetrieve = vi.fn(async (_id?: string): Promise<Record<string, unknown>> => {
  void _id;
  return {
    id: "sub_1",
    latest_invoice: {
      id: "in_open",
      status: "open",
      hosted_invoice_url: "https://invoice.stripe.test/in_open",
    },
  };
});
const invoiceRetrieve = vi.fn(async () => ({
  id: "in_expanded",
  status: "open",
  hosted_invoice_url: "https://invoice.stripe.test/in_expanded",
}));
const stripeIdentity = vi.fn(async () => ({
  accountId: "acct_actionstest",
  livemode: false,
}));
vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    paymentIntents: {
      create: piCreate,
      list: piList,
      retrieve: piRetrieve,
      cancel: piCancel,
    },
    customers: { create: customerCreate },
    checkout: {
      sessions: {
        create: sessionCreate,
        list: sessionList,
        retrieve: sessionRetrieve,
      },
    },
    subscriptions: { update: subUpdate, retrieve: subRetrieve },
    prices: { retrieve: priceRetrieve },
    invoices: { retrieve: invoiceRetrieve },
  }),
  getAutoTopupAuthorityKey: () => "test-auto-topup-authority-key-32chars",
  getAutoTopupAuthorityKeyMaterial: () => ({
    id: "v1",
    key: "test-auto-topup-authority-key-32chars",
    fingerprint:
      "sha256:fe3b3de1339e7ec571414d65c6f3091e4c11ebbae40b7b09031308abf4a734ab",
  }),
  getAuthenticatedStripeAccountIdentity: () => stripeIdentity(),
}));
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  autoTopupProtocolRollouts,
  createTestDb,
  schema,
  seedAuthUser,
  seedDb,
  pausePeriods,
  subscriptions,
  tierCheckoutProtocolRollouts,
  trustWorkspaceId,
  withWorkspace,
  type TestDb,
  type WorkspaceScope,
} from "@respin/db";
import {
  AlreadySubscribedError,
  BillingReauthenticationError,
  BillingRoleError,
  CheckoutInFlightError,
  CheckoutReconciliationRequiredError,
  TIER_CHECKOUT_IDEMPOTENCY_SAFE_RETRY_MS,
  createInvoiceRecoveryUrl as createInvoiceRecoveryUrlWithAuthority,
  createPackCheckoutUrl as createPackCheckoutUrlWithAuthority,
  createPortalUrl as createPortalUrlWithAuthority,
  createTierCheckoutUrl as createTierCheckoutUrlWithAuthority,
  InvoiceRecoveryUnavailableError,
  NoLiveSubscriptionError,
  NotChargeableError,
  SubscriptionPausedError,
  pauseSubscription,
  resumeSubscription,
  setAutoTopup as setAutoTopupWithAuthority,
  UnknownTierPriceError,
} from "../src/stripe/actions";
import {
  AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS,
  maybeAutoTopup,
} from "../src/stripe/auto-topup";
import { AutoTopupRolloutError } from "../src/stripe/auto-topup-rollout";
import { TierCheckoutRolloutError } from "../src/stripe/tier-checkout-rollout";
import { getWorkspaceBillingState } from "../src/state";
import { debitCredits } from "../src/ledger";
import {
  AutoTopupReconciliationRequiredError,
  ClockSkewError,
  WorkspacePausedError,
} from "../src/errors";
import { CLOCK_SKEW_MS } from "../src/clock";
import { addMonthsUtc } from "../src/months";
import {
  PackPriceMismatchError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
} from "../src/stripe/pack-price";
import { creditLedger, CONFIG_V1_SEED } from "@respin/db";
import { appendConfigVersion } from "@respin/config";

const URLS = { successUrl: "http://x/s", cancelUrl: "http://x/c" };
const autoTopupReceipt = (refId: string, createdAt: Date) => ({
  refType: "auto_topup" as const,
  refId,
  amountCents: 1000,
  configVersion: 1,
  stripeEventId: `evt_${refId}`,
  autoTopupAttemptId: crypto.randomUUID(),
  autoTopupPeriodMonthUtc: `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, "0")}`,
  createdAt,
});
const reauthenticationByScope = new WeakMap<
  WorkspaceScope,
  { authUserId: string; sessionId: string; reauthenticatedAt: Date }
>();

async function setAutoTopup(
  db: TestDb,
  scope: WorkspaceScope,
  opts: { enabled: boolean; monthlyCapCents?: number }
) {
  const authority = reauthenticationByScope.get(scope);
  if (!authority) throw new Error("test fixture is missing exact-session reauthentication");
  return setAutoTopupWithAuthority(db, scope, opts, authority);
}

function reauthenticationFor(scope: WorkspaceScope) {
  const authority = reauthenticationByScope.get(scope);
  if (!authority) throw new Error("test fixture is missing exact-session reauthentication");
  return authority;
}

async function pause(
  db: TestDb,
  scope: WorkspaceScope,
  months: number,
  at: Date
) {
  return pauseSubscription(db, scope, months, at, reauthenticationFor(scope));
}

async function resume(db: TestDb, scope: WorkspaceScope) {
  return resumeSubscription(db, scope, reauthenticationFor(scope));
}

async function createTierCheckoutUrl(
  db: TestDb,
  scope: WorkspaceScope,
  tier: "creator" | "pro" | "studio",
  email: string,
  urls: typeof URLS
) {
  return createTierCheckoutUrlWithAuthority(
    db,
    scope,
    tier,
    email,
    urls,
    reauthenticationFor(scope)
  );
}

async function createPackCheckoutUrl(
  db: TestDb,
  scope: WorkspaceScope,
  email: string,
  urls: typeof URLS
) {
  return createPackCheckoutUrlWithAuthority(
    db,
    scope,
    email,
    urls,
    reauthenticationFor(scope)
  );
}

async function createPortalUrl(
  db: TestDb,
  scope: WorkspaceScope,
  returnUrl: string
) {
  return createPortalUrlWithAuthority(
    db,
    scope,
    returnUrl,
    reauthenticationFor(scope)
  );
}

async function createInvoiceRecoveryUrl(db: TestDb, scope: WorkspaceScope) {
  return createInvoiceRecoveryUrlWithAuthority(db, scope, reauthenticationFor(scope));
}

async function setup(db: TestDb) {
  await seedAuthUser(db, "actions_user");
  await seedDb(db);
  // Unit suites exercise the post-activation protocol. Migration-specific tests
  // keep 0048's real `expanded` state and drive the operator transitions.
  const rolloutAt = new Date();
  await db
    .update(autoTopupProtocolRollouts)
    .set({
      state: "active",
      revision: 1,
      fleetQuiescedAt: rolloutAt,
      drainStartedAt: rolloutAt,
      providerReconciledAt: rolloutAt,
      reconciledCustomers: 0,
      reconciledPaymentIntents: 0,
      authorityKeyId: "v1",
      authorityKeyFingerprint:
        "sha256:fe3b3de1339e7ec571414d65c6f3091e4c11ebbae40b7b09031308abf4a734ab",
      stripeAccountId: "acct_actionstest",
      stripeLivemode: false,
      activatedAt: rolloutAt,
    });
  await db
    .update(tierCheckoutProtocolRollouts)
    .set({
      state: "active",
      revision: 1,
      fleetQuiescedAt: rolloutAt,
      drainStartedAt: rolloutAt,
      providerReconciledAt: rolloutAt,
      reconciledCustomers: 0,
      reconciledSessions: 0,
      stripeAccountId: "acct_actionstest",
      stripeLivemode: false,
      activatedAt: rolloutAt,
    });
  // A MAPPED PACK PRICE is now part of the baseline (audit #7, billing gate
  // 2026-08-18). `seedDb` ships `stripePriceMap: {}`, which was fine while
  // `maybeAutoTopup` computed its amount from `pack.priceUsd` — but that was
  // the defect: the charge touched no Stripe Price and ran no divergence check.
  // Now the resolver is the authority on BOTH charge paths, so a workspace with
  // no mapped pack price cannot auto-top-up at all, and the five auto-top-up
  // cases below correctly began failing with PackPriceNotMappedError until this
  // line existed. This is the state a real install is in after `stripe:setup`.
  //
  // Tests that need the UNMAPPED state append their own config afterwards —
  // `appendConfigVersion` makes the newest version active, so they override this.
  await appendConfigVersion(
    db,
    {
      ...CONFIG_V1_SEED,
      stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
    },
    "actions-test-baseline"
  );
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name: "A" })
    .returning();
  const wsId = trustWorkspaceId(w.id);
  // REAL scopes, minted through `withWorkspace` (M2a task 11). This used to be
  // an object literal, which compiled while `WorkspaceScope` was a structural
  // type — and which the M2a gate found was ALREADY the shape that would break
  // the moment the scope became a class. It is the REQ-A02 owner-only matrix
  // that runs on these, so a cast-away literal here would have meant the
  // matrix tested a forgery rather than a scope.
  //
  // THREE users, not one: `memberships_user_workspace_uq` (`schema.ts:72`)
  // forbids one user holding owner AND editor AND viewer on one workspace, and
  // `seedDb`'s user belongs to its own workspace, not this one.
  const scopes = {} as Record<"owner" | "editor" | "viewer", WorkspaceScope>;
  for (const role of ["owner", "editor", "viewer"] as const) {
    const authUserId = `actions_${role}`;
    await seedAuthUser(db, authUserId);
    const [u] = await db
      .insert(schema.users)
      .values({ authUserId })
      .returning();
    await db
      .insert(schema.memberships)
      .values({ userId: u.id, workspaceId: w.id, role });
    const reauthenticatedAt = new Date();
    const sessionId = `session-${authUserId}`;
    await db.insert(schema.session).values({
      id: sessionId,
      token: `token-${authUserId}`,
      userId: authUserId,
      expiresAt: new Date(reauthenticatedAt.getTime() + 60 * 60 * 1_000),
      updatedAt: reauthenticatedAt,
      reauthenticatedAt,
    });
    scopes[role] = await withWorkspace(db, { authUserId, workspaceId: w.id });
    reauthenticationByScope.set(scopes[role], {
      authUserId,
      sessionId,
      reauthenticatedAt,
    });
  }
  const scopeOf = (role: "owner" | "editor" | "viewer"): WorkspaceScope =>
    scopes[role];
  return { wsId, scopeOf };
}

function activeTierCheckoutMapping(
  workspaceId: ReturnType<typeof trustWorkspaceId>,
  stripeCustomerId: string
) {
  return {
    workspaceId,
    stripeCustomerId,
    stripeSubscriptionId: `checkout_fence:${workspaceId}`,
    status: "incomplete" as const,
    tierCheckoutFenceAt: new Date(),
    tierCheckoutFenceSubscriptionId: null,
    tierCheckoutFenceStatus: "none",
    tierCheckoutFenceObservedSubscriptionId: null,
  };
}

async function forceArmAutoTopup(
  db: TestDb,
  wsId: ReturnType<typeof trustWorkspaceId>,
  monthlyCapCents = 5000
) {
  await db
    .update(subscriptions)
    .set({
      autoTopupV1Enabled: true,
      autoTopupMonthlyCapCents: monthlyCapCents,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
    })
    .where(eq(subscriptions.workspaceId, wsId));
}

async function ageTierCheckoutAttemptForTest(db: TestDb, wsId: string) {
  const [attempt] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, wsId));
  if (!attempt?.tierCheckoutAttemptId) {
    throw new Error("test fixture has no durable tier Checkout attempt to age");
  }
  const authority = {
    tierCheckoutAttemptId: attempt.tierCheckoutAttemptId,
    tierCheckoutAttemptTier: attempt.tierCheckoutAttemptTier,
    tierCheckoutAttemptPriceId: attempt.tierCheckoutAttemptPriceId,
    tierCheckoutAttemptCustomerId: attempt.tierCheckoutAttemptCustomerId,
    tierCheckoutAttemptSubscriptionGeneration:
      attempt.tierCheckoutAttemptSubscriptionGeneration,
    tierCheckoutAttemptIdempotencyKey: attempt.tierCheckoutAttemptIdempotencyKey,
    tierCheckoutAttemptSessionId: attempt.tierCheckoutAttemptSessionId,
    tierCheckoutAttemptSubscriptionId: attempt.tierCheckoutAttemptSubscriptionId,
    tierCheckoutAttemptStripeAccountId: attempt.tierCheckoutAttemptStripeAccountId,
    tierCheckoutAttemptStripeLivemode: attempt.tierCheckoutAttemptStripeLivemode,
    tierCheckoutAttemptAuthority: attempt.tierCheckoutAttemptAuthority,
  };
  await db
    .update(subscriptions)
    .set({
      tierCheckoutAttemptId: null,
      tierCheckoutAttemptTier: null,
      tierCheckoutAttemptPriceId: null,
      tierCheckoutAttemptCustomerId: null,
      tierCheckoutAttemptSubscriptionGeneration: null,
      tierCheckoutAttemptIdempotencyKey: null,
      tierCheckoutAttemptSessionId: null,
      tierCheckoutAttemptSubscriptionId: null,
      tierCheckoutAttemptStripeAccountId: null,
      tierCheckoutAttemptStripeLivemode: null,
      tierCheckoutAttemptAuthority: null,
      tierCheckoutAttemptReservedAt: null,
    })
    .where(eq(subscriptions.workspaceId, wsId));
  await db
    .update(subscriptions)
    .set({
      ...authority,
      tierCheckoutAttemptReservedAt: new Date(
        Date.now() - TIER_CHECKOUT_IDEMPOTENCY_SAFE_RETRY_MS - 60_000
      ),
    })
    .where(eq(subscriptions.workspaceId, wsId));
  return attempt;
}

describe("owner-only billing actions (REQ-A02, AC-6 matrix)", () => {
  it("all seven actions throw BillingRoleError for editor and viewer", async () => {
    const db = await createTestDb();
    const { scopeOf } = await setup(db);
    for (const role of ["editor", "viewer"] as const) {
      const scope = scopeOf(role);
      const calls: [string, () => Promise<unknown>][] = [
        ["tierCheckout", () => createTierCheckoutUrl(db, scope, "creator", "a@b.c", URLS)],
        ["packCheckout", () => createPackCheckoutUrl(db, scope, "a@b.c", URLS)],
        ["portal", () => createPortalUrl(db, scope, "http://x")],
        ["invoiceRecovery", () => createInvoiceRecoveryUrl(db, scope)],
        ["pause", () => pause(db, scope, 1, new Date())],
        ["resume", () => resume(db, scope)],
        ["autoTopup", () => setAutoTopup(db, scope, { enabled: false })],
      ];
      for (const [name, call] of calls) {
        await expect(call(), `${name} as ${role}`).rejects.toThrow(BillingRoleError);
      }
    }
  });

  it("round-2 NOTE 4: resume CONVERGES a mirror that says paused with no open pause period", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    // The drifted state: the reconciling webhook closed the period, the mirror
    // still says paused. `ensurePauseEnded` returns false there, and resume
    // used to redirect with no error at all — the button appeared to do
    // nothing while the page kept saying "Paused", with no event coming.
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_drift_action",
      stripeSubscriptionId: "sub_drift",
      status: "active",
      pausedAt: new Date(Date.now() - 3_600_000),
      resumesAt: new Date(Date.now() + 30 * 24 * 3_600_000),
    });
    await resume(db, scopeOf("owner"));
    // Stripe was told to un-pause (so the local state must follow) ...
    expect(subUpdate).toHaveBeenCalledWith("sub_drift", { pause_collection: "" });
    const [sub] = await db.select().from(subscriptions);
    expect(sub.pausedAt, "the mirror must converge on not-paused").toBeNull();
    expect(sub.resumesAt).toBeNull();
  });

  it("second tier checkout while a live subscription exists → AlreadySubscribedError, no Stripe call (plan-review F1)", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_live",
      stripeSubscriptionId: "sub_live", status: "active",
    });
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(AlreadySubscribedError);
  });

  it("unmapped tier price → UnknownTierPriceError naming the remedy", async () => {
    const db = await createTestDb();
    const { scopeOf } = await setup(db);
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(UnknownTierPriceError);
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(/stripe:setup/);
  });

  it("pause bounds come from CONFIG (never a type-level 1|2|3)", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_p",
      stripeSubscriptionId: "sub_p", status: "active",
    });
    for (const months of [0, 4, 2.5]) {
      await expect(
        pause(db, scopeOf("owner"), months, new Date())
      ).rejects.toThrow(/pauseMonths/);
    }
  });

  it("auto-top-up opt-in requires a positive integer cap; disable clears it", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    // A LIVE subscription. The fixture used to omit `stripeSubscriptionId`,
    // i.e. it modelled a workspace that had NEVER subscribed — and letting a
    // fixture define the contract is how `setAutoTopup` came to arm an
    // off-session charging authority on a dead mirror (round-10 CHANGE 4).
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_t",
      stripeSubscriptionId: "sub_t", status: "active",
    });
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: true })
    ).rejects.toThrow(/monthly cap/);
    await setAutoTopup(db, scopeOf("owner"), { enabled: true, monthlyCapCents: 3000 });
    let [row] = await db.select().from(subscriptions);
    expect(row.autoTopupV1Enabled).toBe(true);
    expect(row.autoTopupMonthlyCapCents).toBe(3000);
    await setAutoTopup(db, scopeOf("owner"), { enabled: false });
    [row] = await db.select().from(subscriptions);
    expect(row.autoTopupV1Enabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });

  it("auto-top-up binds fresh proof fields to a real session and refuses foreign, stale, future, or expired authority", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    const ownerScope = scopeOf("owner");
    const authority = reauthenticationByScope.get(ownerScope)!;
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_reauth",
      stripeSubscriptionId: "sub_reauth",
      status: "active",
    });

    const secondOwnerReauthenticatedAt = new Date();
    const secondOwnerSessionId = "session-actions_owner-second";
    await db.insert(schema.session).values({
      id: secondOwnerSessionId,
      token: "token-actions_owner-second",
      userId: authority.authUserId,
      expiresAt: new Date(secondOwnerReauthenticatedAt.getTime() + 60 * 60 * 1_000),
      updatedAt: secondOwnerReauthenticatedAt,
      reauthenticatedAt: secondOwnerReauthenticatedAt,
    });
    const secondOwnerAuthority = {
      authUserId: authority.authUserId,
      sessionId: secondOwnerSessionId,
      reauthenticatedAt: secondOwnerReauthenticatedAt,
    };
    await expect(
      setAutoTopupWithAuthority(
        db,
        ownerScope,
        { enabled: true, monthlyCapCents: 3000 },
        secondOwnerAuthority
      )
    ).resolves.toBeUndefined();
    await setAutoTopupWithAuthority(db, ownerScope, { enabled: false }, authority);

    const foreignAuthority = reauthenticationByScope.get(scopeOf("editor"))!;
    await expect(
      setAutoTopupWithAuthority(
        db,
        ownerScope,
        { enabled: true, monthlyCapCents: 3000 },
        foreignAuthority
      )
    ).rejects.toBeInstanceOf(BillingReauthenticationError);
    await expect(
      setAutoTopupWithAuthority(
        db,
        ownerScope,
        { enabled: true, monthlyCapCents: 3000 },
        { ...authority, sessionId: foreignAuthority.sessionId }
      )
    ).rejects.toBeInstanceOf(BillingReauthenticationError);
    expect((await db.select().from(subscriptions))[0].autoTopupV1Enabled).toBe(false);

    for (const [label, reauthenticatedAt, expiresAt] of [
      [
        "stale",
        new Date(Date.now() - 11 * 60 * 1_000),
        new Date(Date.now() + 60 * 60 * 1_000),
      ],
      [
        "future",
        new Date(Date.now() + 60 * 1_000),
        new Date(Date.now() + 60 * 60 * 1_000),
      ],
      ["expired", new Date(), new Date(Date.now() - 1)],
    ] as const) {
      await db
        .update(schema.session)
        .set({ reauthenticatedAt, expiresAt, updatedAt: new Date() })
        .where(eq(schema.session.id, secondOwnerSessionId));
      await expect(
        setAutoTopupWithAuthority(
          db,
          ownerScope,
          { enabled: true, monthlyCapCents: 3000 },
          { ...secondOwnerAuthority, reauthenticatedAt }
        ),
        label
      ).rejects.toBeInstanceOf(BillingReauthenticationError);
      expect((await db.select().from(subscriptions))[0].autoTopupV1Enabled).toBe(false);
    }

    await db
      .update(schema.memberships)
      .set({ role: "editor", version: ownerScope.membershipVersion + 1 })
      .where(eq(schema.memberships.userId, ownerScope.userId));
    await expect(
      setAutoTopupWithAuthority(
        db,
        ownerScope,
        { enabled: true, monthlyCapCents: 3000 },
        authority
      )
    ).rejects.toThrow("lifecycle_refused:scope_stale");
    expect((await db.select().from(subscriptions))[0].autoTopupV1Enabled).toBe(false);
  });

  it("every Stripe payment capability refuses a foreign exact-session proof before provider work", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    const ownerScope = scopeOf("owner");
    const foreignAuthority = reauthenticationFor(scopeOf("editor"));
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_payment_reauth",
      stripeSubscriptionId: "sub_payment_reauth",
      status: "incomplete",
    });
    sessionCreate.mockClear();
    priceRetrieve.mockClear();
    subRetrieve.mockClear();

    const calls = [
      () =>
        createTierCheckoutUrlWithAuthority(
          db,
          ownerScope,
          "creator",
          "a@b.c",
          URLS,
          foreignAuthority
        ),
      () =>
        createPackCheckoutUrlWithAuthority(
          db,
          ownerScope,
          "a@b.c",
          URLS,
          foreignAuthority
        ),
      () =>
        createPortalUrlWithAuthority(
          db,
          ownerScope,
          "https://return.test",
          foreignAuthority
        ),
      () => createInvoiceRecoveryUrlWithAuthority(db, ownerScope, foreignAuthority),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(BillingReauthenticationError);
    }
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(priceRetrieve).not.toHaveBeenCalled();
    expect(subRetrieve).not.toHaveBeenCalled();
  });
});

describe("round-5 regression pins (billing review findings 3 + 4)", () => {
  const mapPrice = async (db: TestDb) =>
    appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
      "test-admin"
    );

  it("commits durable customer and attempt authority before a lost Checkout response", async () => {
    sessionCreate.mockClear();
    sessionList.mockClear();
    customerCreate.mockClear();
    sessionCreate.mockRejectedValueOnce(new Error("simulated Checkout response loss"));
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(CheckoutReconciliationRequiredError);
    expect(await db.select().from(subscriptions)).toEqual([
      expect.objectContaining({
        workspaceId: wsId,
        stripeCustomerId: "cus_created",
        tierCheckoutAttemptId: expect.any(String),
        tierCheckoutAttemptSessionId: null,
      }),
    ]);

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).resolves.toBe("https://checkout.stripe.test/cs_created");
    expect(customerCreate).toHaveBeenCalledTimes(1);
    expect(sessionCreate).toHaveBeenCalledTimes(2);
    const calls = sessionCreate.mock.calls as unknown as [
      unknown,
      { idempotencyKey: string },
    ][];
    expect(calls[1]![0]).toMatchObject({ customer: "cus_created" });
    expect(calls[1]![1].idempotencyKey).toBe(calls[0]![1].idempotencyKey);
  });

  it("refuses provider reconciliation before any Session read or create when Stripe account/mode drift", async () => {
    sessionCreate.mockClear();
    sessionList.mockClear();
    stripeIdentity.mockClear();
    sessionCreate.mockRejectedValueOnce(new Error("lost provider response"));
    const db = await createTestDb();
    const { scopeOf } = await setup(db);
    await mapPrice(db);
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(CheckoutReconciliationRequiredError);
    const readsBeforeDrift = sessionList.mock.calls.length;
    stripeIdentity.mockResolvedValueOnce({
      accountId: "acct_different",
      livemode: true,
    });

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(TierCheckoutRolloutError);
    expect(sessionList).toHaveBeenCalledTimes(readsBeforeDrift);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("FINDING 3: a same-tier follower retrieves the one durable provider Session", async () => {
    sessionCreate.mockClear();
    sessionList.mockClear();
    sessionRetrieve.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db
      .insert(subscriptions)
      .values(activeTierCheckoutMapping(wsId, "cus_race"));
    const urlA = await createTierCheckoutUrl(
      db,
      scopeOf("owner"),
      "creator",
      "a@b.c",
      URLS
    );
    const urlB = await createTierCheckoutUrl(
      db,
      scopeOf("owner"),
      "creator",
      "a@b.c",
      URLS
    );
    expect(urlA).toBe(urlB);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    expect(sessionRetrieve).toHaveBeenCalledTimes(1);
    const key = (
      sessionCreate.mock.calls[0] as unknown as [unknown, { idempotencyKey: string }]
    )[1].idempotencyKey;
    expect(key).toMatch(new RegExp(`^checkout:v1:${wsId}:[0-9a-f-]{36}$`));
  });

  it("FINDING 3: cross-tier racers produce one Session and one typed refusal", async () => {
    sessionCreate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { price_creator: "creator", price_pro: "pro" },
      },
      "test-admin"
    );
    await db
      .insert(subscriptions)
      .values(activeTierCheckoutMapping(wsId, "cus_xtier"));
    const outcomes = await Promise.allSettled([
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS),
      createTierCheckoutUrl(db, scopeOf("owner"), "pro", "a@b.c", URLS),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: expect.any(CheckoutInFlightError),
    });
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("FINDING 3: an uncertain provider response is a fail-closed reconciliation refusal", async () => {
    sessionCreate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db
      .insert(subscriptions)
      .values(activeTierCheckoutMapping(wsId, "cus_mismatch"));
    sessionCreate.mockRejectedValueOnce(
      Object.assign(new Error("Keys for idempotent requests..."), {
        type: "StripeIdempotencyError",
      })
    );
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(CheckoutReconciliationRequiredError);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("FINDING 3: a full subscription snapshot advances the generation and permits re-subscribe", async () => {
    sessionCreate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db
      .insert(subscriptions)
      .values(activeTierCheckoutMapping(wsId, "cus_again"));
    await createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS);
    await db
      .update(subscriptions)
      .set({
        stripeSubscriptionId: "sub_dead",
        status: "canceled",
        tierCheckoutAttemptId: null,
        tierCheckoutAttemptTier: null,
        tierCheckoutAttemptPriceId: null,
        tierCheckoutAttemptCustomerId: null,
        tierCheckoutAttemptSubscriptionGeneration: null,
        tierCheckoutAttemptIdempotencyKey: null,
        tierCheckoutAttemptSessionId: null,
        tierCheckoutAttemptSubscriptionId: null,
        tierCheckoutAttemptStripeAccountId: null,
        tierCheckoutAttemptStripeLivemode: null,
        tierCheckoutAttemptAuthority: null,
        tierCheckoutAttemptReservedAt: null,
        tierCheckoutFenceAt: null,
        tierCheckoutFenceSubscriptionId: null,
        tierCheckoutFenceStatus: null,
      })
      .where(eq(subscriptions.workspaceId, wsId));
    await createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS);
    const keyOf = (i: number) =>
      (sessionCreate.mock.calls[i] as unknown as [unknown, { idempotencyKey: string }])[1]
        .idempotencyKey;
    expect(keyOf(1)).not.toBe(keyOf(0));
    expect(keyOf(1)).toMatch(new RegExp(`^checkout:v1:${wsId}:[0-9a-f-]{36}$`));
  });

  it("ignores A/B historical Checkout Sessions only after Stripe proves both subscriptions terminal", async () => {
    sessionCreate.mockClear();
    sessionList.mockClear();
    subRetrieve.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db
      .insert(subscriptions)
      .values(activeTierCheckoutMapping(wsId, "cus_history"));
    await db
      .update(subscriptions)
      .set({
        tierCheckoutFenceSubscriptionId: "sub_history_b",
        tierCheckoutFenceStatus: "canceled",
      })
      .where(eq(subscriptions.workspaceId, wsId));
    sessionList.mockResolvedValueOnce({
      data: [
        {
          id: "cs_history_a",
          mode: "subscription",
          customer: "cus_history",
          metadata: { workspace_id: wsId },
          payment_status: "paid",
          status: "complete",
          subscription: "sub_history_a",
        },
        {
          id: "cs_history_b",
          mode: "subscription",
          customer: "cus_history",
          metadata: { workspace_id: wsId },
          payment_status: "paid",
          status: "complete",
          subscription: "sub_history_b",
        },
      ],
      has_more: false,
    });
    subRetrieve
      .mockImplementationOnce(async (id?: string) => ({ id, status: "canceled" }))
      .mockImplementationOnce(async (id?: string) => ({ id, status: "canceled" }));

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).resolves.toBe("https://checkout.stripe.test/cs_created");
    expect(subRetrieve.mock.calls.map(([id]) => id)).toEqual([
      "sub_history_a",
      "sub_history_b",
    ]);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing workspace metadata", {}],
    ["wrong workspace metadata", { workspace_id: "workspace-other" }],
  ])("refuses an open mapped-customer Session with %s", async (_label, metadata) => {
    sessionCreate.mockClear();
    sessionList.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);
    await db
      .insert(subscriptions)
      .values(activeTierCheckoutMapping(wsId, "cus_identity_conflict"));
    sessionList.mockResolvedValueOnce({
      data: [
        {
          id: "cs_identity_conflict",
          mode: "subscription",
          customer: "cus_identity_conflict",
          metadata,
          payment_status: "unpaid",
          status: "open",
          subscription: null,
        },
      ],
      has_more: false,
    });

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toBeInstanceOf(CheckoutReconciliationRequiredError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("finds a completed Session after idempotency expiry and never creates a second subscription", async () => {
    sessionCreate.mockClear();
    sessionList.mockClear();
    sessionCreate.mockRejectedValueOnce(new Error("lost after provider accepted"));
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(CheckoutReconciliationRequiredError);
    const attempt = await ageTierCheckoutAttemptForTest(db, wsId);
    sessionList.mockResolvedValueOnce({
      data: [
        {
          id: "cs_completed_delayed",
          url: null,
          mode: "subscription",
          customer: "cus_created",
          metadata: {
            workspace_id: wsId,
            respin_kind: "tier_checkout",
            respin_checkout_attempt_id: attempt!.tierCheckoutAttemptId,
            tier: "creator",
            price_id: "price_creator",
            ...(attempt!.tierCheckoutAttemptAuthority as Record<string, string>),
          },
          line_items: {
            data: [{ price: { id: "price_creator" } }],
          },
          payment_status: "paid",
          status: "complete",
          subscription: "sub_delayed",
        },
      ],
      has_more: false,
    });

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(CheckoutReconciliationRequiredError);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    expect(await db.select().from(subscriptions)).toEqual([
      expect.objectContaining({
        tierCheckoutAttemptId: attempt!.tierCheckoutAttemptId,
        tierCheckoutAttemptSessionId: "cs_completed_delayed",
      }),
    ]);
  });

  it("retires an old attempt only after a complete provider scan proves no Session exists", async () => {
    sessionCreate.mockClear();
    sessionList.mockClear();
    sessionCreate.mockRejectedValueOnce(new Error("lost before provider record"));
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mapPrice(db);

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(CheckoutReconciliationRequiredError);
    const oldAttempt = await ageTierCheckoutAttemptForTest(db, wsId);

    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).resolves.toBe("https://checkout.stripe.test/cs_created");
    const [replacement] = await db.select().from(subscriptions);
    expect(replacement?.tierCheckoutAttemptId).not.toBe(oldAttempt?.tierCheckoutAttemptId);
    expect(sessionCreate).toHaveBeenCalledTimes(2);
    const calls = sessionCreate.mock.calls as unknown as [
      unknown,
      { idempotencyKey: string },
    ][];
    expect(calls[1]![1].idempotencyKey).not.toBe(calls[0]![1].idempotencyKey);
  });

  it("derives the provider pause deadline from the locked database clock", async () => {
    subUpdate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_pause",
      stripeSubscriptionId: "sub_pause",
      status: "active",
    });
    const requestedAt = new Date();
    await pause(db, scopeOf("owner"), 1, requestedAt);
    const [, params] = subUpdate.mock.calls[0] as unknown as [
      string,
      { pause_collection: { resumes_at: number } },
    ];
    const providerResumeAt = new Date(params.pause_collection.resumes_at * 1000);
    const requestClockEstimate = addMonthsUtc(requestedAt, 1);
    expect(Math.abs(providerResumeAt.getTime() - requestClockEstimate.getTime()))
      .toBeLessThan(3_000);
    // ...and the local mirror agrees with what Stripe was told.
    const [row] = await db.select().from(subscriptions);
    expect(Math.abs(row.resumesAt!.getTime() - providerResumeAt.getTime())).toBeLessThan(1000);
  });

  it.each([-1, 1])("refuses a caller clock outside the skew window before Stripe (%i)", async (direction) => {
    subUpdate.mockClear();
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_pause_skew",
      stripeSubscriptionId: "sub_pause_skew",
      status: "active",
    });
    const skewed = new Date(
      Date.now() + direction * (CLOCK_SKEW_MS + 5_000)
    );
    await expect(pause(db, scopeOf("owner"), 1, skewed)).rejects.toThrow(
      ClockSkewError
    );
    expect(subUpdate).not.toHaveBeenCalled();
  });
});

describe("round-7 pins (billing round-7 CHANGE 1 + CHANGE 7)", () => {
  it("CHANGE 1: a CANCELED workspace never gets an off-session charge, however armed the flags are", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    // The exact end state of the ordinary REQ-G01 self-serve cancel: the
    // mirror is canceled and free everywhere else in the product, but the
    // auto-top-up opt-in is still on the row (a workspace that cancelled
    // before round 7's webhook fix, or any path that leaves it set).
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_gone",
      stripeSubscriptionId: "sub_gone",
      status: "canceled",
      autoTopupV1Enabled: true,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
    });
    await forceArmAutoTopup(db, wsId);
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false,
      reason: "not_subscribed",
    });
    expect(piCreate).not.toHaveBeenCalled();
  });

  it("CHANGE 1: a workspace that never subscribed (pack-only customer) is refused too — there is no saved payment method to charge", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      ...activeTierCheckoutMapping(wsId, "cus_packs_only"),
      autoTopupV1Enabled: true,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
    });
    await forceArmAutoTopup(db, wsId);
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false,
      reason: "not_subscribed",
    });
    expect(piCreate).not.toHaveBeenCalled();
  });

  it("CHANGE 1 (not a blanket ban): dunning and cancel-at-period-end subscriptions STILL top up", async () => {
    for (const row of [
      { status: "past_due" as const, cancelAtPeriodEnd: false },
      { status: "active" as const, cancelAtPeriodEnd: true },
    ]) {
      piCreate.mockClear();
      const db = await createTestDb();
      const { wsId } = await setup(db);
      await db.insert(subscriptions).values({
        workspaceId: wsId,
        stripeCustomerId: "cus_live",
        stripeSubscriptionId: "sub_live",
        status: row.status,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        autoTopupV1Enabled: true,
        autoTopupProtocolVersion: 1,
        autoTopupAttemptCutoverAt: new Date(),
        autoTopupMonthlyCapCents: 5000,
      });
      await forceArmAutoTopup(db, wsId);
      // A subscription in dunning, or one cancelling at period end, is still a
      // subscription: it exists in Stripe and the customer is still served.
      expect(
        (await maybeAutoTopup(db, wsId, 100, new Date())).triggered,
        `${row.status} cancelAtPeriodEnd=${row.cancelAtPeriodEnd}`
      ).toBe(true);
      expect(piCreate).toHaveBeenCalledTimes(1);
    }
  });

  it("CHANGE 7: an INCOMPLETE subscription is refused with the remedy that state actually permits — never 'manage it in the Portal'", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    // Card needed SCA or was declined at the payment step, so Stripe left the
    // subscription `incomplete` and holds it for ~23 hours. It counts as live
    // (a second Checkout really would double-bill), but the Portal has nothing
    // to manage for it — the old message sent the creator to a dead end with
    // money on the table.
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_sca",
      stripeSubscriptionId: "sub_sca",
      status: "incomplete",
    });
    const call = () =>
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS);
    await expect(call()).rejects.toThrow(AlreadySubscribedError);
    await expect(call()).rejects.toThrow(/FIRST PAYMENT has not completed/);
    await expect(call()).rejects.toThrow(/23 hours/);
    await expect(call()).rejects.not.toThrow(
      /Manage or change the plan in the Customer Portal instead/
    );
  });

  it("CHANGE 7: an ACTIVE subscription still gets the portal message (the branch is on STATE, not a rewrite)", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_ok",
      stripeSubscriptionId: "sub_ok",
      status: "active",
    });
    await expect(
      createTierCheckoutUrl(db, scopeOf("owner"), "creator", "a@b.c", URLS)
    ).rejects.toThrow(/Customer Portal/);
  });
});

describe("maybeAutoTopup refusal paths (keyless — every refusal precedes Stripe)", () => {
  it("disabled / paused / no_customer refuse without any Stripe call", async () => {
    const db = await createTestDb();
    const { wsId } = await setup(db);
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false, reason: "no_customer",
    });
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_a",
      // A LIVE subscription id: auto-top-up is a subscriber feature, so every
      // fixture that expects to get past the liveness guard must model one
      // (billing round-7 CHANGE 1 — these fixtures all modelled a workspace
      // that had never subscribed, which is why they went red when the guard
      // landed; the guard is right and the fixtures were unrealistic).
      stripeSubscriptionId: "sub_a", status: "active",
    });
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false, reason: "disabled",
    });
    // Always workspace-keyed, even in a single-workspace fixture: an unscoped
    // UPDATE is the exact shape the tenancy lint exists to prevent, and a test
    // that models it teaches the wrong pattern (code-review NOTE).
    await db
      .update(subscriptions)
      .set({
        autoTopupV1Enabled: true,
        autoTopupProtocolVersion: 1,
        autoTopupAttemptCutoverAt: new Date(),
        autoTopupMonthlyCapCents: 5000,
        pausedAt: new Date(),
      })
      .where(eq(subscriptions.workspaceId, wsId));
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false, reason: "paused",
    });
  });

  it("AC-7: the monthly cap is computed in CENTS from this-calendar-month auto-top-up rows and respects the month boundary", async () => {
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_cap",
      stripeSubscriptionId: "sub_cap", status: "active",
      autoTopupV1Enabled: true, autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 2500, // 2 packs max ($10 each)
    });
    await forceArmAutoTopup(db, wsId, 2500);
    const at = new Date();
    const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const lastMonth = new Date(monthStart.getTime() - 24 * 3_600_000);
    // LAST month's top-ups never count against THIS month's cap
    await db.insert(creditLedger).values([
      { workspaceId: wsId, delta: 1000, kind: "pack", ...autoTopupReceipt("pi_old", lastMonth),
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000) },
      // two top-ups THIS month = 2000c spent; a third pack (1000c) would break the 2500c cap
      { workspaceId: wsId, delta: 1000, kind: "pack", ...autoTopupReceipt("pi_1", new Date(monthStart.getTime() + 1000)),
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000) },
      { workspaceId: wsId, delta: 1000, kind: "pack", ...autoTopupReceipt("pi_2", new Date(monthStart.getTime() + 2000)),
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000) },
    ]);
    expect(await maybeAutoTopup(db, wsId, 100, at)).toEqual({
      triggered: false, reason: "cap_reached",
    });
    // ordinary (non-auto-top-up) pack purchases do NOT count against the cap
    const [capRow] = await db.select().from(subscriptions);
    expect(capRow.autoTopupMonthlyCapCents).toBe(2500);
  });
});

describe("maybeAutoTopup SUCCESS path (the branch keyless tests cannot reach)", () => {
  const enable = async (db: TestDb, wsId: ReturnType<typeof trustWorkspaceId>) =>
    db
      .update(subscriptions)
      .set({
        autoTopupV1Enabled: true,
        autoTopupMonthlyCapCents: 3000,
        autoTopupProtocolVersion: 1,
        autoTopupAttemptCutoverAt: new Date(),
      })
      .where(eq(subscriptions.workspaceId, wsId));

  it("triggers ONE PaymentIntent for the pack price, and writes NO ledger row (credits land via the webhook)", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_A",
      stripeSubscriptionId: "sub_A",
      status: "active",
    });
    await enable(db, wsId);

    const at = new Date();
    expect(await maybeAutoTopup(db, wsId, 100, at)).toEqual({
      triggered: true,
      paymentIntentId: "pi_created",
    });
    expect(piCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = piCreate.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect(params.amount).toBe(1000); // config pack price in cents, not a literal
    expect(params.customer).toBe("cus_A");
    expect(params.off_session).toBe(true);
    expect(params.confirm).toBe(true);
    expect(params.metadata).toMatchObject({
      respin_kind: "auto_topup",
      workspace_id: wsId,
    });
    // n = 0 rows this month → the FIRST key. Asserted here because the plan
    // claims the Docker race case asserts it, and no test did.
    const yyyyMm = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(opts.idempotencyKey).toMatch(
      new RegExp(
        `^autotopup:v1:${wsId}:${yyyyMm}:1:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
        "i"
      )
    );
    // The credit is the WEBHOOK's job (single-tx, event-id idempotent).
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it.each([
    ["ahead", CLOCK_SKEW_MS * 2],
    ["behind", -(CLOCK_SKEW_MS * 2)],
  ] as const)(
    "refuses a caller clock %s of the database clock before creating a PaymentIntent",
    async (_direction, offsetMs) => {
      piCreate.mockClear();
      const db = await createTestDb();
      const { wsId } = await setup(db);
      await db.insert(subscriptions).values({
        workspaceId: wsId,
        stripeCustomerId: "cus_clock",
        stripeSubscriptionId: "sub_clock",
        status: "active",
        autoTopupV1Enabled: true,
        autoTopupProtocolVersion: 1,
        autoTopupAttemptCutoverAt: new Date(),
        autoTopupMonthlyCapCents: 3000,
      });
      await forceArmAutoTopup(db, wsId, 3000);

      await expect(
        maybeAutoTopup(db, wsId, 100, new Date(Date.now() + offsetMs))
      ).rejects.toBeInstanceOf(ClockSkewError);
      expect(piCreate).not.toHaveBeenCalled();
    }
  );

  it("the idempotency key advances with the month's row count (n=2 → :3)", async () => {
    piCreate.mockClear();
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_A",
      stripeSubscriptionId: "sub_A",
      status: "active",
    });
    await enable(db, wsId);
    const at = new Date();
    const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const expiresAt = new Date(at.getTime() + 365 * 24 * 3_600_000);
    await db.insert(creditLedger).values([
      { workspaceId: wsId, delta: 1000, kind: "pack",
        ...autoTopupReceipt("pi_1", new Date(monthStart.getTime() + 1000)), expiresAt },
      { workspaceId: wsId, delta: 1000, kind: "pack",
        ...autoTopupReceipt("pi_2", new Date(monthStart.getTime() + 2000)), expiresAt },
    ]);
    expect((await maybeAutoTopup(db, wsId, 100, at)).triggered).toBe(true);
    const [, opts] = piCreate.mock.calls[0] as unknown as [
      unknown,
      { idempotencyKey: string },
    ];
    const yyyyMm = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(opts.idempotencyKey).toMatch(
      new RegExp(
        `^autotopup:v1:${wsId}:${yyyyMm}:3:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
        "i"
      )
    );
  });

  it("the cap boundary ALLOWS exactly-at-cap and refuses one cent over (the direction no test covered)", async () => {
    for (const [capCents, expected] of [
      [2000, true], // 1000 spent + 1000 pack === cap → allowed
      [1999, false], // one cent short → refused
    ] as const) {
      piCreate.mockClear();
      const db = await createTestDb();
      const { wsId } = await setup(db);
      await db.insert(subscriptions).values({
        workspaceId: wsId,
        stripeCustomerId: "cus_A",
        stripeSubscriptionId: "sub_A",
        status: "active",
        autoTopupV1Enabled: true,
        autoTopupProtocolVersion: 1,
        autoTopupAttemptCutoverAt: new Date(),
        autoTopupMonthlyCapCents: capCents,
      });
      await forceArmAutoTopup(db, wsId, capCents);
      const at = new Date();
      const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
      await db.insert(creditLedger).values({
        workspaceId: wsId, delta: 1000, kind: "pack",
        ...autoTopupReceipt("pi_1", new Date(monthStart.getTime() + 1000)),
        expiresAt: new Date(at.getTime() + 365 * 24 * 3_600_000),
      });
      const result = await maybeAutoTopup(db, wsId, 100, at);
      expect(result.triggered, `cap ${capCents}`).toBe(expected);
      if (!expected) {
        expect(result).toEqual({ triggered: false, reason: "cap_reached" });
        expect(piCreate).not.toHaveBeenCalled();
      }
    }
  });
});

describe("durable auto-top-up dispatch recovery", () => {
  async function armed(db: TestDb, customerId: string) {
    const { wsId } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: `sub_${customerId}`,
      status: "active",
      autoTopupV1Enabled: true,
      autoTopupMonthlyCapCents: 5000,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
    });
    await forceArmAutoTopup(db, wsId);
    return wsId;
  }

  it("a lost create response reconciles the signed attempt and never creates a second PaymentIntent", async () => {
    const db = await createTestDb();
    const wsId = await armed(db, "cus_lost_response");
    let providerPi: Record<string, unknown> | undefined;
    piCreate.mockClear();
    piList.mockClear();
    piCreate.mockImplementationOnce(async (params) => {
      providerPi = {
        id: "pi_lost_response",
        amount: params.amount,
        currency: params.currency,
        customer: params.customer,
        created: Math.floor(Date.now() / 1000),
        metadata: params.metadata,
        status: "processing",
      };
      throw new Error("transport ended after Stripe accepted the request");
    });

    const unknown = await maybeAutoTopup(db, wsId, 100, new Date());
    expect(unknown).toMatchObject({
      triggered: false,
      reason: "reconciliation_required",
    });
    let [pending] = await db.select().from(subscriptions);
    expect(pending.autoTopupAttemptDispatchedAt).not.toBeNull();
    expect(pending.autoTopupAttemptPaymentIntentId).toBeNull();

    piList.mockResolvedValueOnce({ data: [providerPi!], has_more: false });
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: true,
      paymentIntentId: "pi_lost_response",
    });
    expect(piCreate).toHaveBeenCalledTimes(1);
    expect((piList.mock.calls as unknown[][])[0]?.[0]).not.toHaveProperty(
      "created"
    );
    [pending] = await db.select().from(subscriptions);
    expect(pending.autoTopupAttemptPaymentIntentId).toBe("pi_lost_response");
    expect(pending.autoTopupAttemptPaymentIntentStatus).toBe("processing");
  });

  it("an unresolved response older than the safe idempotency window retires only after a full empty reconciliation, then creates a fresh attempt", async () => {
    const db = await createTestDb();
    const wsId = await armed(db, "cus_old_unknown");
    piCreate.mockClear();
    piList.mockClear();
    piCreate.mockRejectedValueOnce(new Error("unknown provider outcome"));
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toMatchObject({
      triggered: false,
      reason: "reconciliation_required",
    });

    const old = new Date(Date.now() - AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS - 60_000);
    await db
      .update(subscriptions)
      .set({
        autoTopupAttemptReservedAt: old,
        autoTopupAttemptDispatchedAt: old,
      })
      .where(eq(subscriptions.workspaceId, wsId));
    piList.mockResolvedValueOnce({ data: [], has_more: false });

    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: true,
      paymentIntentId: "pi_created",
    });
    expect(piList).toHaveBeenCalledTimes(1);
    expect(piCreate).toHaveBeenCalledTimes(2);
  });

  it.each(["disabled", "paused", "cap"] as const)(
    "reconciles a durable pre-provider reservation before retiring it when %s wins the transaction gap",
    async (change) => {
      const db = await createTestDb();
      const wsId = await armed(db, `cus_undispatched_${change}`);
      piCreate.mockClear();
      piList.mockClear();
      piCreate.mockRejectedValueOnce(new Error("unknown provider outcome"));
      expect(await maybeAutoTopup(db, wsId, 100, new Date())).toMatchObject({
        triggered: false,
        reason: "reconciliation_required",
      });
      await db
        .update(subscriptions)
        .set({
          ...(change === "disabled" ? { autoTopupV1Enabled: false } : {}),
          ...(change === "paused" ? { pausedAt: new Date() } : {}),
          ...(change === "cap" ? { autoTopupMonthlyCapCents: 1 } : {}),
        })
        .where(eq(subscriptions.workspaceId, wsId));

      const result = await maybeAutoTopup(db, wsId, 100, new Date());
      expect(result).toEqual({
        triggered: false,
        reason: change === "cap" ? "cap_reached" : change,
      });
      const [sub] = await db.select().from(subscriptions);
      expect(sub.autoTopupAttemptId).toBeNull();
      expect(piCreate).toHaveBeenCalledTimes(1);
      expect(piList).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["disabled", "paused", "cap"] as const)(
    "reconciles a dispatched unknown before honoring a later %s refusal",
    async (change) => {
      const db = await createTestDb();
      const wsId = await armed(db, `cus_dispatched_${change}`);
      piCreate.mockClear();
      piList.mockClear();
      piCreate.mockRejectedValueOnce(new Error("lost create response"));
      expect(await maybeAutoTopup(db, wsId, 100, new Date())).toMatchObject({
        triggered: false,
        reason: "reconciliation_required",
      });
      const [params] = piCreate.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      await db
        .update(subscriptions)
        .set({
          ...(change === "disabled" ? { autoTopupV1Enabled: false } : {}),
          ...(change === "paused" ? { pausedAt: new Date() } : {}),
          ...(change === "cap" ? { autoTopupMonthlyCapCents: 1 } : {}),
        })
        .where(eq(subscriptions.workspaceId, wsId));
      piList.mockResolvedValueOnce({
        data: [{
          id: `pi_dispatched_${change}`,
          amount: params.amount,
          currency: params.currency,
          customer: params.customer,
          created: Math.floor(Date.now() / 1000),
          metadata: params.metadata,
          status: "processing",
        }],
        has_more: false,
      });

      expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
        triggered: true,
        paymentIntentId: `pi_dispatched_${change}`,
      });
      expect(piList).toHaveBeenCalledTimes(1);
      expect(piCreate).toHaveBeenCalledTimes(1);
    }
  );

  it("cancels and retires a first-call decline before returning the manual-purchase refusal", async () => {
    const db = await createTestDb();
    const wsId = await armed(db, "cus_declined_bound");
    piCreate.mockClear();
    piList.mockClear();
    piCreate.mockImplementationOnce(async (params) => {
      const error = new Error("card declined") as Error & {
        payment_intent: Record<string, unknown>;
      };
      error.payment_intent = {
        id: "pi_declined_bound",
        amount: params.amount,
        currency: params.currency,
        customer: params.customer,
        created: Math.floor(Date.now() / 1000),
        metadata: params.metadata,
        status: "requires_payment_method",
      };
      piCancel.mockResolvedValueOnce({
        ...error.payment_intent,
        status: "canceled",
      });
      throw error;
    });

    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toEqual({
      triggered: false,
      reason: "payment_failed",
    });
    expect(piCancel).toHaveBeenCalledWith("pi_declined_bound");
    expect(piCreate).toHaveBeenCalledTimes(1);
    expect(piList).not.toHaveBeenCalled();
    const [pending] = await db.select().from(subscriptions);
    expect(pending.autoTopupAttemptId).toBeNull();
    expect(pending.autoTopupAttemptPaymentIntentId).toBeNull();
  });
});

describe("round-10 pins (billing CHANGE 4: one liveness definition, three readers)", () => {
  const mkSub = async (
    db: TestDb,
    wsId: string,
    over: Record<string, unknown> = {}
  ) => {
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_live_x",
      stripeSubscriptionId: "sub_live_x",
      status: "active",
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      ...over,
    } as never);
    if (over.autoTopupV1Enabled === true) {
      await forceArmAutoTopup(
        db,
        trustWorkspaceId(wsId),
        typeof over.autoTopupMonthlyCapCents === "number"
          ? over.autoTopupMonthlyCapCents
          : 5000
      );
    }
  };

  it("CHANGE 4: setAutoTopup REFUSES to arm on a canceled subscription — the state DEAD_SUBSCRIPTION_FIELDS exists to make impossible", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, { status: "canceled" });
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: true, monthlyCapCents: 5000 })
    ).rejects.toThrow(NoLiveSubscriptionError);
    // ...and the row was NOT armed. The round-8 defence was "the trigger
    // refuses anyway", which is true and beside the point: Phase 4 renders THIS
    // row, and {canceled, autoTopupV1Enabled: true} is the state the whole
    // DEAD_SUBSCRIPTION_FIELDS mechanism was introduced to prevent.
    const [row] = await db.select().from(subscriptions);
    expect(row.autoTopupV1Enabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });

  it("CHANGE 4: a workspace that NEVER subscribed (pack-only customer) cannot arm it either", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, {
      stripeSubscriptionId: `checkout_fence:${wsId}`,
      status: "incomplete",
      tierCheckoutFenceAt: new Date(),
      tierCheckoutFenceSubscriptionId: null,
      tierCheckoutFenceStatus: "none",
      tierCheckoutFenceObservedSubscriptionId: null,
    });
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: true, monthlyCapCents: 5000 })
    ).rejects.toThrow(NoLiveSubscriptionError);
  });

  it("CHANGE 4 (the direction that must NOT change): DISABLING is always allowed, even on a dead mirror", async () => {
    // Guarding the disable would trap an owner whose subscription died while
    // the flag was armed with a switch they cannot turn off. Turning it off can
    // only move the row toward the safe state, so it is deliberately ungated —
    // and that choice is pinned here rather than left to be re-derived.
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, {
      status: "canceled",
      autoTopupV1Enabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    await setAutoTopup(db, scopeOf("owner"), { enabled: false });
    const [row] = await db.select().from(subscriptions);
    expect(row.autoTopupV1Enabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });

  it("CHANGE 4 (not a blanket ban): a live subscription in dunning or cancel-at-period-end can still arm it", async () => {
    // The same non-vacuity direction the round-7 auto-top-up guard needed: a
    // liveness rule that refused everything would pass the two tests above and
    // be useless.
    // `unpaid` MOVED OUT of this set by audit 2026-08-17 #6 — see the test
    // below. It is still LIVE (recoverable through the Portal), which is why
    // round-5 deliberately kept it out of IRREVERSIBLE_STATUSES; it is not
    // CHARGEABLE, which is a different question this suite had conflated.
    for (const over of [
      { status: "past_due" },
      { status: "active", cancelAtPeriodEnd: true },
    ]) {
      const db = await createTestDb();
      const { wsId, scopeOf } = await setup(db);
      await mkSub(db, wsId, over);
      await setAutoTopup(db, scopeOf("owner"), {
        enabled: true,
        monthlyCapCents: 5000,
      });
      const [row] = await db.select().from(subscriptions);
      expect(row.autoTopupV1Enabled, JSON.stringify(over)).toBe(true);
    }
  });

  // AUDIT 2026-08-17 #6 — the case this suite previously asserted the OPPOSITE
  // of. `unpaid` means Stripe has stopped collecting: the subscription is live
  // enough to recover, and NOT live enough to charge off-session. Arming the
  // authority there would show an owner auto-top-up as ON for a subscription
  // the rest of the product already renders as `free`.
  it("AUDIT #6: `unpaid` cannot ARM auto-top-up — liveness is not chargeability", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, { status: "unpaid" });
    await expect(
      setAutoTopup(db, scopeOf("owner"), {
        enabled: true,
        monthlyCapCents: 5000,
      })
    ).rejects.toThrow(NotChargeableError);
    // NOTHING was written — the refusal precedes the update.
    const [row] = await db.select().from(subscriptions);
    expect(row.autoTopupV1Enabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });

  it("AUDIT #6 (the direction that must NOT change): an `unpaid` owner can still DISARM it", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await mkSub(db, wsId, {
      status: "unpaid",
      autoTopupV1Enabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    await setAutoTopup(db, scopeOf("owner"), { enabled: false });
    const [row] = await db.select().from(subscriptions);
    expect(row.autoTopupV1Enabled).toBe(false);
  });

  // AUDIT #6, the CHARGE site. `setAutoTopup` refusing to arm is not enough on
  // its own: a row armed BEFORE this change (or armed while healthy and then
  // fallen into dunning) must still not produce an off-session PaymentIntent.
  it("AUDIT #6: maybeAutoTopup refuses an `unpaid` subscription — no PaymentIntent, even when fully armed", async () => {
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await mkSub(db, wsId, {
      status: "unpaid",
      autoTopupV1Enabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    piCreate.mockClear();
    const result = await maybeAutoTopup(db, wsId, 10, new Date());
    expect(result).toEqual({ triggered: false, reason: "not_chargeable" });
    expect(piCreate).not.toHaveBeenCalled();
  });

  it("an `incomplete` subscription is live but cannot trigger an off-session PaymentIntent", async () => {
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await mkSub(db, wsId, {
      status: "incomplete",
      autoTopupV1Enabled: true,
      autoTopupMonthlyCapCents: 5000,
    });
    piCreate.mockClear();
    expect(await maybeAutoTopup(db, wsId, 10, new Date())).toEqual({
      triggered: false,
      reason: "not_chargeable",
    });
    expect(piCreate).not.toHaveBeenCalled();
  });
});

// ========== billing gate 2026-08-18: the untested money paths ==============

describe("audit #1 (package half): the AUTHORITATIVE pause refusal on the pack path", () => {
  it("refuses Stripe account drift before creating a customer or durable mapping", async () => {
    const db = await createTestDb();
    const { scopeOf } = await setup(db);
    stripeIdentity.mockResolvedValueOnce({
      accountId: "acct_wrong_deployment",
      livemode: false,
    });
    customerCreate.mockClear();
    priceRetrieve.mockClear();
    sessionCreate.mockClear();

    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).rejects.toBeInstanceOf(TierCheckoutRolloutError);
    expect(customerCreate).not.toHaveBeenCalled();
    expect(priceRetrieve).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("a paused workspace's pack checkout throws SubscriptionPausedError and reaches NO Stripe call", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "test"
    );
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_paused",
      stripeSubscriptionId: "sub_paused", stripePriceId: "price_creator",
      status: "active", pausedAt: new Date(),
    });
    sessionCreate.mockClear();

    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).rejects.toBeInstanceOf(SubscriptionPausedError);

    // THE POINT. The code argues this guard is the authoritative one and that
    // the UI's disabled button is merely presentational — so a refusal that had
    // already created a Stripe customer or a payable session would be a weaker
    // refusal than the one REQ-G08 promises. Nothing reached Stripe.
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("NON-VACUITY: the same workspace UNPAUSED reaches Stripe and gets a URL", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "test"
    );
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_live",
      stripeSubscriptionId: "sub_live", stripePriceId: "price_creator",
      status: "active", pausedAt: null,
    });
    sessionCreate.mockClear();
    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).resolves.toContain("checkout.stripe.test");
    expect(sessionCreate).toHaveBeenCalled();
  });
});

describe("manual pack checkout is fenced by durable auto-top-up authority", () => {
  async function armedPackWorkspace(db: TestDb, suffix: string) {
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: `cus_pack_fence_${suffix}`,
      stripeSubscriptionId: `sub_pack_fence_${suffix}`,
      status: "active",
      autoTopupV1Enabled: true,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
    });
    await forceArmAutoTopup(db, wsId);
    return { wsId, scope: scopeOf("owner") };
  }

  it.each([
    ["provider visibility is unknown", "unknown"],
    ["the exact PaymentIntent is processing", "processing"],
    ["the exact PaymentIntent succeeded before settlement", "succeeded"],
  ] as const)("refuses before Checkout when %s", async (_label, state) => {
    const db = await createTestDb();
    const { wsId, scope } = await armedPackWorkspace(db, state);
    piCreate.mockClear();
    sessionCreate.mockClear();
    if (state === "unknown") {
      piCreate.mockRejectedValueOnce(
        new Error("transport ended after Stripe accepted the request")
      );
    } else {
      piCreate.mockImplementationOnce(async (params) => ({
        id: `pi_pack_fence_${state}`,
        amount: params.amount,
        currency: params.currency,
        customer: params.customer,
        metadata: params.metadata,
        status: state,
      }));
    }
    await maybeAutoTopup(db, wsId, 100, new Date());

    await expect(
      createPackCheckoutUrl(db, scope, "a@b.test", URLS)
    ).rejects.toBeInstanceOf(AutoTopupReconciliationRequiredError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("allows Checkout after the exact failed automatic intent is canceled and retired", async () => {
    const db = await createTestDb();
    const { wsId, scope } = await armedPackWorkspace(db, "retired");
    piCreate.mockClear();
    piCancel.mockClear();
    sessionCreate.mockClear();
    let failedPi: {
      id: string;
      amount: unknown;
      currency: unknown;
      customer: unknown;
      metadata: unknown;
      status: string;
    } | null = null;
    piCreate.mockImplementationOnce(async (params) => {
      failedPi = {
        id: "pi_pack_fence_retired",
        amount: params.amount,
        currency: params.currency,
        customer: params.customer,
        metadata: params.metadata,
        status: "requires_payment_method",
      };
      return failedPi;
    });
    piCancel.mockImplementationOnce(async () => ({
      ...failedPi!,
      status: "canceled",
    }));
    expect(await maybeAutoTopup(db, wsId, 100, new Date())).toMatchObject({
      triggered: false,
      reason: "payment_failed",
    });

    await expect(
      createPackCheckoutUrl(db, scope, "a@b.test", URLS)
    ).resolves.toContain("checkout.stripe.test");
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });
});

describe("auto-top-up preference saves revalidate active rollout authority", () => {
  it("refuses enabling under key drift while still allowing the owner to disable", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId,
      stripeCustomerId: "cus_binding_drift",
      stripeSubscriptionId: "sub_binding_drift",
      status: "active",
      autoTopupV1Enabled: true,
      autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
    });
    await db
      .update(autoTopupProtocolRollouts)
      .set({ authorityKeyFingerprint: `sha256:${"0".repeat(64)}` });

    await expect(
      setAutoTopup(db, scopeOf("owner"), {
        enabled: true,
        monthlyCapCents: 5000,
      })
    ).rejects.toBeInstanceOf(AutoTopupRolloutError);
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: false })
    ).resolves.toBeUndefined();
    const [row] = await db.select().from(subscriptions);
    expect(row.autoTopupV1Enabled).toBe(false);
    expect(row.autoTopupMonthlyCapCents).toBeNull();
  });
});

describe("audit #5 drift: the pack path and the billing page agree on 'paused'", () => {
  /**
   * The remediation left the two readers of "is this paused?" disagreeing, and
   * the deferred NOTE described it as cosmetic (a Buy-pack button that renders
   * live and fails on click). It was not cosmetic.
   *
   * `state.ts` was liveness-gated by audit #5; `createPackCheckoutUrl` read the
   * raw `pausedAt` column. In the #5 drift state the page therefore derived
   * `free` — no pause, control live — while the server refused every click. A
   * dead subscription emits no further events, so nothing was coming to clear
   * that column: the workspace could never buy a pack again, which is the one
   * purchase a workspace with no live subscription is meant to make.
   */
  async function driftRow(db: TestDb) {
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "test"
    );
    // The exact #5 drift: cancelled in Stripe, with a pause flag that outlived
    // the subscription it described (ensurePauseEnded is a no-op when no open
    // pause_periods row exists — pause.ts concedes the state is reachable).
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_drift",
      stripeSubscriptionId: "sub_drift", stripePriceId: "price_creator",
      status: "canceled", pausedAt: new Date(), resumesAt: new Date(),
    });
    return { wsId, scopeOf };
  }

  it("a drifted row does NOT permanently block the pack purchase", async () => {
    const db = await createTestDb();
    const { scopeOf } = await driftRow(db);
    sessionCreate.mockClear();

    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).resolves.toContain("checkout.stripe.test");
    expect(sessionCreate).toHaveBeenCalled();
  });

  it("SYMMETRY: the page shows no pause for that row, and the server does not refuse one", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await driftRow(db);

    // The page's answer...
    const state = await getWorkspaceBillingState(db, wsId, new Date());
    expect(state.state).not.toBe("paused");
    // ...and the server's, on the same row. Before the fix these disagreed:
    // free page, SubscriptionPausedError on click.
    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).resolves.toBeTypeOf("string");
  });

  /**
   * The case the billing gate said was missing, and it is the one that matters:
   * every other case in this file builds "paused" by inserting a `subscriptions`
   * row, so the invariant was pinned only against the MIRROR. The authority is
   * `pause_periods` — it is what `debitCredits` refuses on — and the mirror can
   * read `canceled` while an open period still exists.
   *
   * Gating the charge on the mirror let that row BUY a pack whose credits
   * `debitCredits` would then refuse to spend, with no way to close the pause.
   */
  it("AUTHORITY: an OPEN pause_periods row refuses the charge even when the mirror says canceled", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "test"
    );
    // Mirror looks DEAD — no live subscription, so `isPausedSubscription` (and
    // the billing page) both say "not paused".
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_auth",
      stripeSubscriptionId: "sub_auth", stripePriceId: "price_creator",
      status: "canceled", pausedAt: null,
    });
    // ...but the AUTHORITY still holds an open period.
    await db.insert(pausePeriods).values({
      workspaceId: wsId, startedAt: new Date(), startedKnownAt: new Date(),
    });
    sessionCreate.mockClear();

    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).rejects.toBeInstanceOf(SubscriptionPausedError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("AUTHORITY: the charge and the SPEND now refuse on the same table", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "test"
    );
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_both",
      stripeSubscriptionId: "sub_both", stripePriceId: "price_creator",
      status: "canceled", pausedAt: null,
    });
    await db.insert(pausePeriods).values({
      workspaceId: wsId, startedAt: new Date(), startedKnownAt: new Date(),
    });

    // The spend refuses (this was always true)...
    await expect(
      db.transaction((tx) =>
        debitCredits(tx, {
          workspaceId: wsId, cost: 1, refType: "generation",
          refId: "gen_1", at: new Date(), configVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(WorkspacePausedError);

    // ...and the CHARGE now refuses too. Selling credits that cannot be spent
    // is the failure this pairing exists to make impossible.
    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).rejects.toBeInstanceOf(SubscriptionPausedError);
  });


  /**
   * The drifted `pausedAt` has no reaper — `resumeSubscription` reads the raw
   * column, passes its NotPausedError check, then dead-ends on liveness, so
   * nothing clears it. The billing gate's judgement was that the residue is
   * inert at every reader, and deferring the reaper is correct on that basis.
   *
   * "Inert" is a property, so it is asserted rather than believed: this pins
   * every reader at once, and turns a future change that makes the stale column
   * load-bearing again into a failing test instead of a silent regression.
   */
  it("INERT: the stale pausedAt changes no reader's answer", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await driftRow(db);

    // 1. The page derives free, not a paid paused tier (audit #5's fix).
    const state = await getWorkspaceBillingState(db, wsId, new Date());
    expect(state.state).not.toBe("paused");
    expect(state.tier).toBe("free");

    // 2. Auto-top-up refuses on LIVENESS, never reaching the pause clause —
    //    so the stale flag is not what protects the customer here.
    expect(await maybeAutoTopup(db, wsId, 10, new Date())).toEqual({
      triggered: false,
      reason: "not_subscribed",
    });

    // 3. Arming refuses too, and not because of the pause.
    await expect(
      setAutoTopup(db, scopeOf("owner"), { enabled: true, monthlyCapCents: 5000 })
    ).rejects.toBeInstanceOf(NoLiveSubscriptionError);

    // 4. Resume cannot clear it — this is exactly why no reaper exists yet.
    await expect(
      resume(db, scopeOf("owner"))
    ).rejects.toBeInstanceOf(NoLiveSubscriptionError);

    // 5. And the charge path is permitted, because the AUTHORITY has no open
    //    period — the stale mirror column does not veto a legitimate purchase.
    sessionCreate.mockClear();
    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).resolves.toBeTypeOf("string");
  });

  it("SYMMETRY, the direction that must NOT change: a LIVE paused row is paused to both", async () => {
    const db = await createTestDb();
    const { wsId, scopeOf } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "test"
    );
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_live_paused",
      stripeSubscriptionId: "sub_live_paused", stripePriceId: "price_creator",
      status: "active", pausedAt: new Date(),
    });
    sessionCreate.mockClear();

    // REQ-G08 is intact: this is the row audit #1 is about, and it still
    // refuses before anything reaches Stripe.
    const state = await getWorkspaceBillingState(db, wsId, new Date());
    expect(state.state).toBe("paused");
    await expect(
      createPackCheckoutUrl(db, scopeOf("owner"), "a@b.test", URLS)
    ).rejects.toBeInstanceOf(SubscriptionPausedError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe("audit #7: ONE pack-price authority — the auto-top-up half", () => {
  async function armed(db: TestDb) {
    const { wsId } = await setup(db);
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "test"
    );
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_at", stripeSubscriptionId: "sub_at",
      stripePriceId: "price_creator", status: "active",
      autoTopupV1Enabled: true, autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
    });
    await forceArmAutoTopup(db, wsId);
    return { wsId };
  }

  it("charges the amount STRIPE holds, read through the shared resolver", async () => {
    const db = await createTestDb();
    const { wsId } = await armed(db);
    piCreate.mockClear();
    priceRetrieve.mockClear();
    const out = await maybeAutoTopup(db, wsId, 10, new Date());
    expect(out.triggered).toBe(true);
    // The resolver ran — this path used to touch no Stripe Price at all.
    expect(priceRetrieve).toHaveBeenCalled();
    expect(piCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, currency: "usd" }),
      expect.anything()
    );
  });

  it("DIVERGENCE: config and Stripe disagreeing REFUSES before any PaymentIntent", async () => {
    const db = await createTestDb();
    const { wsId } = await armed(db);
    // An /admin/config edit to pack.priceUsd — append-only, no deploy needed.
    // Before this fix the manual path refused while THIS path silently charged
    // the new, un-validated number.
    await appendConfigVersion(
      db,
      {
        ...CONFIG_V1_SEED,
        pack: { ...CONFIG_V1_SEED.pack, priceUsd: 25 },
        stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" },
      },
      "admin-who-changed-the-price"
    );
    piCreate.mockClear();
    await expect(maybeAutoTopup(db, wsId, 10, new Date())).rejects.toBeInstanceOf(
      PackPriceMismatchError
    );
    expect(
      piCreate,
      "a divergence must refuse BEFORE money moves, not after"
    ).not.toHaveBeenCalled();
  });

  it("an ARCHIVED Stripe pack price refuses too — no charge built on a dead price", async () => {
    const db = await createTestDb();
    const { wsId } = await armed(db);
    piCreate.mockClear();
    priceRetrieve.mockResolvedValueOnce({
      id: "price_pack", active: false, unit_amount: 1000, currency: "usd",
    } as never);
    await expect(maybeAutoTopup(db, wsId, 10, new Date())).rejects.toBeInstanceOf(
      PackPriceUnavailableError
    );
    expect(piCreate).not.toHaveBeenCalled();
  });

  it("no mapped pack price refuses — there is nothing to charge", async () => {
    const db = await createTestDb();
    const { wsId } = await setup(db);
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
      "test"
    );
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_np", stripeSubscriptionId: "sub_np",
      stripePriceId: "price_creator", status: "active",
      autoTopupV1Enabled: true, autoTopupProtocolVersion: 1,
      autoTopupAttemptCutoverAt: new Date(),
      autoTopupMonthlyCapCents: 5000,
    });
    await forceArmAutoTopup(db, wsId);
    piCreate.mockClear();
    await expect(maybeAutoTopup(db, wsId, 10, new Date())).rejects.toBeInstanceOf(
      PackPriceNotMappedError
    );
    expect(piCreate).not.toHaveBeenCalled();
  });
});

describe("audit #8: createInvoiceRecoveryUrl's STRIPE half", () => {
  async function incomplete(db: TestDb) {
    const { wsId, scopeOf } = await setup(db);
    await db.insert(subscriptions).values({
      workspaceId: wsId, stripeCustomerId: "cus_inc", stripeSubscriptionId: "sub_inc",
      stripePriceId: "price_creator", status: "incomplete",
    });
    return { wsId, scopeOf };
  }

  it("an OPEN latest invoice yields its hosted URL", async () => {
    const db = await createTestDb();
    const { scopeOf } = await incomplete(db);
    await expect(createInvoiceRecoveryUrl(db, scopeOf("owner"))).resolves.toBe(
      "https://invoice.stripe.test/in_open"
    );
    expect(subRetrieve).toHaveBeenCalledWith(
      "sub_inc",
      expect.objectContaining({ expand: ["latest_invoice"] })
    );
  });

  it("a PAID latest invoice refuses — there is nothing left to pay", async () => {
    const db = await createTestDb();
    const { scopeOf } = await incomplete(db);
    subRetrieve.mockResolvedValueOnce({
      id: "sub_inc",
      latest_invoice: { id: "in_paid", status: "paid", hosted_invoice_url: "https://x" },
    } as never);
    await expect(
      createInvoiceRecoveryUrl(db, scopeOf("owner"))
    ).rejects.toBeInstanceOf(InvoiceRecoveryUnavailableError);
  });

  it("an OPEN invoice with NO hosted page refuses (Stripe returns null until finalized)", async () => {
    const db = await createTestDb();
    const { scopeOf } = await incomplete(db);
    subRetrieve.mockResolvedValueOnce({
      id: "sub_inc",
      latest_invoice: { id: "in_draft", status: "open", hosted_invoice_url: null },
    } as never);
    await expect(
      createInvoiceRecoveryUrl(db, scopeOf("owner"))
    ).rejects.toBeInstanceOf(InvoiceRecoveryUnavailableError);
  });

  it("NO latest invoice at all refuses", async () => {
    const db = await createTestDb();
    const { scopeOf } = await incomplete(db);
    subRetrieve.mockResolvedValueOnce({ id: "sub_inc", latest_invoice: null } as never);
    await expect(
      createInvoiceRecoveryUrl(db, scopeOf("owner"))
    ).rejects.toBeInstanceOf(InvoiceRecoveryUnavailableError);
  });

  it("the UN-EXPANDED shape is handled: a string id triggers a second retrieve", async () => {
    // latest_invoice is typed `string | Invoice | null` in the installed SDK.
    // Reading .hosted_invoice_url off a bare id would be undefined — a silent
    // "no invoice" for a customer who has one — so both shapes are handled, and
    // this is the case that proves the string branch actually works.
    const db = await createTestDb();
    const { scopeOf } = await incomplete(db);
    subRetrieve.mockResolvedValueOnce({
      id: "sub_inc", latest_invoice: "in_expanded",
    } as never);
    invoiceRetrieve.mockClear();
    await expect(createInvoiceRecoveryUrl(db, scopeOf("owner"))).resolves.toBe(
      "https://invoice.stripe.test/in_expanded"
    );
    expect(invoiceRetrieve).toHaveBeenCalledWith("in_expanded");
  });
});

describe("the owner's pause/resume path serializes with the webhook writers", () => {
  /**
   * `pauseSubscription` and `resumeSubscription` must take `takeWorkspaceLock`,
   * like every other writer of this workspace's money state (billing gate,
   * 2026-08-18). Without it an uncommitted owner pause is invisible to a
   * concurrently-processing webhook, whose `ensurePauseEnded` then returns false
   * and whose `clearPauseMirror` clears `pausedAt` after the owner's write
   * commits — `{open pause_periods, mirror clear}`. Money-safe (every money
   * guard reads `pause_periods`), but the page reads `active` while credits are
   * frozen and the owner cannot resume early.
   *
   * WHAT THIS PROVES, and what it does not. It is a SOURCE assertion: it proves
   * the call is present, not that it serializes. The behavioural proof needs two
   * real connections, which means the Docker suite — and driving it through
   * `pauseSubscription` there would mean mocking the Stripe adapter inside the
   * one suite that proves the ledger's money invariants under real concurrency.
   * That trade is not worth it for this, so the honest instrument is the cheap
   * one, labelled: before this, removing either lock turned NOTHING red.
   */
  const SRC = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../src/stripe/actions.ts"),
    "utf8"
  );

  function bodyOf(fn: string): string {
    const start = SRC.indexOf(`export async function ${fn}(`);
    expect(start, `${fn} must exist in actions.ts`).toBeGreaterThan(-1);
    const next = SRC.indexOf("\nexport ", start + 1);
    return SRC.slice(start, next === -1 ? SRC.length : next);
  }

  it.each(["pauseSubscription", "resumeSubscription", "setAutoTopup"])(
    "%s rechecks exact-session authority after billing locks and before mutation",
    (fn) => {
      const body = bodyOf(fn)
        .replace(/\/\/.*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      expect(
        body,
        `${fn} writes this workspace's pause state and must serialize against handleStripeEvent, which takes the same lock before dispatch`
      ).toContain("takeWorkspaceLock(tx, scope.workspaceId)");

      // …and takes it FIRST. Placement is load-bearing twice over, so
      // asserting mere presence would let a reorder pass (billing gate NOTE):
      //
      //  - before `getDbNow`, or a contended wait leaves `at` stale and
      //    `assertWriteClock`'s `latestEventAt` comparison can throw
      //    `ClockSkewError` on an ordinary pause;
      //  - before any write, which is the property that rules out an
      //    advisory-lock-vs-row-lock cycle across the seven call sites.
      const lockAt = body.indexOf("takeWorkspaceLock");
      const authorityCalls = [
        ...body.matchAll(/requireReauthenticatedOwnerInTx/g),
      ].map((match) => match.index!);
      const rowLockAt = body.indexOf('.for("update")');
      const mutationAt =
        fn === "setAutoTopup"
          ? body.indexOf(".update(subscriptions)", rowLockAt)
          : body.indexOf("getStripe().subscriptions.update", rowLockAt);
      const clockAt = body.indexOf(
        fn === "pauseSubscription" ? "assertWriteClock(" : "getDbNow("
      );
      expect(
        authorityCalls,
        `${fn} must verify before and after billing locks`
      ).toHaveLength(2);
      expect(authorityCalls[0], `${fn} must lock lifecycle authority before billing state`)
        .toBeLessThan(lockAt);
      expect(lockAt).toBeLessThan(rowLockAt);
      expect(rowLockAt).toBeLessThan(authorityCalls[1]!);
      expect(authorityCalls[1], `${fn} must recheck immediately before mutation`)
        .toBeLessThan(mutationAt);
      if (fn === "setAutoTopup") return;
      expect(clockAt, `${fn} must read the db clock inside its transaction`)
        .toBeGreaterThan(-1);
      expect(
        lockAt,
        `${fn} must take the lock BEFORE reading the clock — reading it first lets a contended wait produce a ClockSkewError on an ordinary pause`
      ).toBeLessThan(clockAt);
      if (fn === "pauseSubscription") {
        const configAt = body.indexOf("getActiveConfig(");
        expect(configAt, "pause bounds must be re-read under the billing lock")
          .toBeGreaterThan(lockAt);
        expect(configAt).toBeLessThan(mutationAt);
      }
    }
  );

  it.each([
    ["createTierCheckoutUrl", ".checkout.sessions"],
    ["createPackCheckoutUrl", ".checkout.sessions.create("],
    ["createPortalUrl", "getStripe().billingPortal.sessions.create"],
    ["createInvoiceRecoveryUrl", "getStripe().subscriptions.retrieve"],
  ] as const)(
    "%s keeps lifecycle and billing authority locked through the Stripe capability call",
    (fn, providerNeedle) => {
      const body = bodyOf(fn)
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      const providerAt = body.indexOf(providerNeedle);
      const lockAt = body.lastIndexOf("takeWorkspaceLock", providerAt);
      const rowLockAt = Math.max(
        body.lastIndexOf("subscriptionRow(tx", providerAt),
        body.lastIndexOf('.for("update")', providerAt)
      );
      const authorityAt = body.lastIndexOf(
        "requireReauthenticatedOwnerInTx",
        providerAt
      );
      expect(providerAt, `${fn} must contain the provider call`).toBeGreaterThan(-1);
      expect(lockAt).toBeGreaterThan(-1);
      expect(rowLockAt).toBeGreaterThan(lockAt);
      expect(authorityAt).toBeGreaterThan(rowLockAt);
      expect(providerAt).toBeGreaterThan(authorityAt);
      if (fn === "createInvoiceRecoveryUrl") {
        const returnAt = body.indexOf("return invoice.hosted_invoice_url");
        expect(body.lastIndexOf("requireReauthenticatedOwnerInTx", returnAt))
          .toBeGreaterThan(providerAt);
      }
    }
  );

  it("subscriptionRow takes a row lock for checkout serialization", () => {
    const start = SRC.indexOf("async function subscriptionRow(");
    const end = SRC.indexOf("\nexport type CheckoutUrls", start);
    const body = SRC.slice(start, end);
    expect(body).toContain('.for("update")');
  });

  it("tier checkout persists the active price before provider dispatch and recovers from that authority", () => {
    const body = bodyOf("createTierCheckoutUrl")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const configAt = body.indexOf("getActiveConfig(tx)");
    const priceAt = body.indexOf("const priceId", configAt);
    const persistedAt = body.indexOf("tierCheckoutAttemptPriceId: reserved.priceId");
    const providerCreateAt = body.indexOf(".checkout.sessions.create");
    expect(configAt).toBeGreaterThan(-1);
    expect(priceAt).toBeGreaterThan(configAt);
    expect(persistedAt).toBeGreaterThan(priceAt);
    expect(providerCreateAt).toBeGreaterThan(persistedAt);
    expect(body.slice(providerCreateAt, body.indexOf(");", providerCreateAt))).toContain(
      "line_items: [{ price: dispatchAttempt.priceId"
    );
    // A config edit after reservation cannot strand recovery or silently swap
    // the price of an already-authoritative provider attempt.
    expect(body.slice(persistedAt, providerCreateAt)).not.toContain("getActiveConfig(tx)");
  });

  it("NON-VACUITY: the slicer really isolates one function", () => {
    expect(bodyOf("pauseSubscription")).not.toContain("resumeSubscription(");
    expect(bodyOf("resumeSubscription")).toContain("NotPausedError");
  });
});

describe("the billing server action forwards the exact-session authority", () => {
  const SRC = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../app/(product)/settings/billing/actions.ts"
    ),
    "utf8"
  );

  it.each([
    ["subscribeAction", "respinCredits.createTierCheckoutUrl("],
    ["buyPackAction", "respinCredits.createPackCheckoutUrl("],
    ["openPortalAction", "respinCredits.createPortalUrl("],
    ["recoverInvoiceAction", "respinCredits.createInvoiceRecoveryUrl("],
    ["pauseAction", "respinCredits.pauseSubscription("],
    ["resumeAction", "respinCredits.resumeSubscription("],
    ["setAutoTopupAction", "respinCredits.setAutoTopup("],
  ] as const)("%s reauthenticates the current session and forwards that result", (fn, call) => {
    const start = SRC.indexOf(`export async function ${fn}(`);
    const next = SRC.indexOf("\nexport async function ", start + 1);
    const body = SRC.slice(start, next === -1 ? SRC.length : next);
    const reauthenticationAt = body.indexOf(
      "const authority = await billingReauthentication(formData)"
    );
    const mutationAt = body.indexOf(call);
    expect(start).toBeGreaterThan(-1);
    expect(reauthenticationAt).toBeGreaterThan(-1);
    expect(reauthenticationAt).toBeLessThan(mutationAt);
    expect(body.slice(mutationAt)).toMatch(/authority\s*\)/);
  });
});
