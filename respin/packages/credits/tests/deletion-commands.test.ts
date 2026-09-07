// Phase 10b-1 Task 4 — the Stripe/local external-command adapter, driven with
// a fake client. Every case is about honest classification: an effect that
// landed is `succeeded`, a definitive provider refusal is `failed`, and an
// indeterminate exchange is `unknown` — never guessed either way.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_TOPUP_DISARMED_FIELDS,
  createTestDb,
  ensureUserWorkspace,
  schema,
  seedAuthUser,
  type DeletionExternalCommand,
} from "@respin/db";
import { createStripeExternalCommandPort, type DeletionStripeClient } from "../src/stripe/deletion-commands";

type Db = Awaited<ReturnType<typeof createTestDb>>;

function command(kind: DeletionExternalCommand["kind"], workspaceId: string, attempt = 1): DeletionExternalCommand {
  return {
    id: "019b0d7a-86df-7000-8000-00000000c0de",
    operationId: "019b0d7a-86df-7000-8000-00000000000f",
    scope: "workspace",
    targetKey: `workspace:${workspaceId}`,
    userId: null,
    workspaceId,
    profileId: null,
    kind,
    phase: kind === "stripe_subscription_reopen" ? "cancellation" : kind.endsWith("_now") || kind.endsWith("_clear") ? "erasing" : "pre_grace",
    attempt,
    status: "pending",
    payloadHash: "0".repeat(64),
    dispatchedAt: new Date(),
    resolvedAt: null,
    providerRefDigest: null,
    failureCode: null,
    reconciliationDigest: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function stripeError(type: string, code?: string) {
  return Object.assign(new Error(`${type}:${code ?? ""}`), { type, code });
}

function fakeClient(overrides: Partial<{
  update: DeletionStripeClient["subscriptions"]["update"];
  cancel: DeletionStripeClient["subscriptions"]["cancel"];
  retrieve: DeletionStripeClient["subscriptions"]["retrieve"];
  customerUpdate: DeletionStripeClient["customers"]["update"];
  customerRetrieve: DeletionStripeClient["customers"]["retrieve"];
}> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = <T>(method: string, impl: (...args: never[]) => T) => vi.fn((...args: unknown[]) => {
    calls.push({ method, args });
    return (impl as (...a: unknown[]) => T)(...args);
  });
  const client: DeletionStripeClient = {
    subscriptions: {
      update: record("subscriptions.update", overrides.update ?? (async (id: string, params: unknown) => ({ id, ...(params as object), status: "active" }) as never)),
      cancel: record("subscriptions.cancel", overrides.cancel ?? (async (id: string) => ({ id, status: "canceled" }) as never)),
      retrieve: record("subscriptions.retrieve", overrides.retrieve ?? (async (id: string) => ({ id, status: "active", cancel_at_period_end: true }) as never)),
    },
    customers: {
      update: record("customers.update", overrides.customerUpdate ?? (async (id: string) => ({ id, name: "", email: "", phone: "", description: "", address: null, shipping: null, metadata: {} }) as never)),
      retrieve: record("customers.retrieve", overrides.customerRetrieve ?? (async (id: string) => ({ id, name: "", email: "", phone: "", description: "", address: null, shipping: null, metadata: {} }) as never)),
    },
  };
  return { client, calls };
}

describe("Stripe external-command adapter", () => {
  let db: Db;
  let workspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "owner-auth");
    workspaceId = (await ensureUserWorkspace(db, { authUserId: "owner-auth", name: "W" })).workspace.id;
    await db.insert(schema.subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
    });
    // Migration 0048's insert trigger normalises every new row to protocol 0
    // with v1 OFF; only an UPDATE arms v1 — the way actions.ts arms it. Armed
    // the same way here (the only armed shape production holds; the legacy
    // bit is fenced off), plus a remembered rearm desire the rollout
    // activator could re-arm v1 from.
    await db
      .update(schema.subscriptions)
      .set({ autoTopupProtocolVersion: 1, autoTopupAttemptCutoverAt: new Date(), autoTopupV1Enabled: true, autoTopupRearmAfterUpgrade: true, autoTopupMonthlyCapCents: 1_000 })
      .where(eq(schema.subscriptions.workspaceId, workspaceId));
  });

  it("cancels at period end with the command as the idempotency key and reopens on cancellation", async () => {
    const { client, calls } = fakeClient();
    const port = createStripeExternalCommandPort(db, () => client);
    const cmd = command("stripe_subscription_cancel_at_period_end", workspaceId);
    expect(await port.execute(cmd)).toEqual({ outcome: "succeeded", providerRef: "sub_1" });
    expect(calls[0]).toEqual({
      method: "subscriptions.update",
      args: ["sub_1", { cancel_at_period_end: true }, { idempotencyKey: `deletion:${cmd.id}:1` }],
    });
    expect(await port.execute(command("stripe_subscription_reopen", workspaceId, 2))).toEqual({ outcome: "succeeded", providerRef: "sub_1" });
    expect(calls[1]!.args[1]).toEqual({ cancel_at_period_end: false });
    expect((calls[1]!.args[2] as { idempotencyKey: string }).idempotencyKey).toMatch(/:2$/);
  });

  it("cancels immediately with prorate=false and invoice_now=false, and treats an already-gone subscription as done", async () => {
    const { client, calls } = fakeClient();
    const port = createStripeExternalCommandPort(db, () => client);
    expect(await port.execute(command("stripe_subscription_cancel_now", workspaceId))).toEqual({ outcome: "succeeded", providerRef: "sub_1" });
    expect(calls[0]!.args[1]).toEqual({ prorate: false, invoice_now: false });
    const gone = fakeClient({
      cancel: vi.fn(async () => {
        throw stripeError("StripeInvalidRequestError", "resource_missing");
      }),
    });
    expect(await createStripeExternalCommandPort(db, () => gone.client).execute(command("stripe_subscription_cancel_now", workspaceId))).toEqual({ outcome: "succeeded" });
  });

  it("treats every irreversible mirror status as already done, without a provider call", async () => {
    await db.update(schema.subscriptions).set({ status: "incomplete_expired" }).where(eq(schema.subscriptions.workspaceId, workspaceId));
    const { client, calls } = fakeClient();
    const port = createStripeExternalCommandPort(db, () => client);
    expect(await port.execute(command("stripe_subscription_reopen", workspaceId))).toEqual({ outcome: "succeeded" });
    expect(await port.execute(command("stripe_subscription_cancel_now", workspaceId))).toEqual({ outcome: "succeeded" });
    expect(await port.execute(command("stripe_subscription_cancel_at_period_end", workspaceId))).toEqual({ outcome: "succeeded" });
    expect(calls).toEqual([]);
  });

  it("disables auto top-up locally by clearing EVERY charge-authority field, and reconciles from the mirror", async () => {
    const { client } = fakeClient();
    const port = createStripeExternalCommandPort(db, () => client);
    const cmd = command("auto_topup_disable", workspaceId);
    const [armed] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId));
    expect(armed).toMatchObject({ autoTopupV1Enabled: true, autoTopupRearmAfterUpgrade: true, autoTopupProtocolVersion: 1 });
    // The class, pinned: the fence writes exactly the fields the webhook's
    // dead-subscription reset clears (round-1 billing BLOCK: it wrote one).
    expect(Object.keys(AUTO_TOPUP_DISARMED_FIELDS).sort()).toEqual([
      "autoTopupEnabled",
      "autoTopupMonthlyCapCents",
      "autoTopupRearmAfterUpgrade",
      "autoTopupV1Enabled",
    ]);
    expect(await port.reconcile(cmd)).toEqual({ outcome: "failed", failureCode: "not_applied" });
    expect(await port.execute(cmd)).toEqual({ outcome: "succeeded" });
    const [row] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId));
    expect(row).toMatchObject({
      autoTopupEnabled: false,
      autoTopupV1Enabled: false,
      autoTopupRearmAfterUpgrade: false,
      autoTopupMonthlyCapCents: null,
      autoTopupProtocolVersion: 1,
    });
    expect(await port.reconcile(cmd)).toEqual({ outcome: "succeeded" });

    // Each field alone is charge authority: the rearm desire by itself is
    // not disarmed, and the fence clears it.
    await db.update(schema.subscriptions).set({ autoTopupRearmAfterUpgrade: true }).where(eq(schema.subscriptions.workspaceId, workspaceId));
    expect(await port.reconcile(cmd)).toEqual({ outcome: "failed", failureCode: "not_applied" });
    expect(await port.execute(cmd)).toEqual({ outcome: "succeeded" });
    const [again] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId));
    expect(again!.autoTopupRearmAfterUpgrade).toBe(false);
  });

  it("leaves an in-flight durable attempt to the v1 reconciler; an undispatched attempt cannot exist (CHECK proven, not assumed)", async () => {
    const { client } = fakeClient();
    const port = createStripeExternalCommandPort(db, () => client);
    const cmd = command("auto_topup_disable", workspaceId);
    const at = new Date();
    const attempt = {
      autoTopupAttemptId: "019b0d7a-86df-7000-8000-0000000a77e1",
      autoTopupAttemptPeriodMonthUtc: "2026-09",
      autoTopupAttemptOrdinal: 1,
      autoTopupAttemptIdempotencyKey: "auto-topup:test:1",
      autoTopupAttemptAmountCents: 1_000,
      autoTopupAttemptCurrency: "usd",
      autoTopupAttemptPriceId: "price_test",
      autoTopupAttemptCredits: 100,
      autoTopupAttemptValidityMonths: 12,
      autoTopupAttemptConfigVersion: 1,
      autoTopupAttemptCustomerId: "cus_1",
      autoTopupAttemptReservedAt: at,
      autoTopupAttemptDispatchedAt: at,
      autoTopupAttemptClaimId: "019b0d7a-86df-7000-8000-0000000c1a1d",
      autoTopupAttemptClaimedAt: at,
    };
    // The schema's own shape rule: a reserved attempt is dispatched and
    // claimed, so "undispatched pending attempt" is not a state this fence
    // can meet — that is why it clears no attempt fields.
    const violation = await db
      .update(schema.subscriptions)
      .set({ ...attempt, autoTopupAttemptDispatchedAt: null })
      .where(eq(schema.subscriptions.workspaceId, workspaceId))
      .then(() => null, (error: unknown) => error as { cause?: { code?: string; constraint?: string } });
    expect(violation?.cause?.code).toBe("23514");
    expect(violation?.cause?.constraint).toBe("subscriptions_auto_topup_attempt_shape");

    await db.update(schema.subscriptions).set(attempt).where(eq(schema.subscriptions.workspaceId, workspaceId));
    expect(await port.execute(cmd)).toEqual({ outcome: "succeeded" });
    const [row] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId));
    expect(row!.autoTopupV1Enabled).toBe(false);
    expect(row!.autoTopupAttemptId).toBe(attempt.autoTopupAttemptId);
    expect(await port.reconcile(cmd)).toEqual({ outcome: "succeeded" });
  });

  it("clears every personal customer field with the SDK's empty form and refuses when the provider echoes data back", async () => {
    const { client, calls } = fakeClient();
    const port = createStripeExternalCommandPort(db, () => client);
    expect(await port.execute(command("stripe_customer_personal_fields_clear", workspaceId))).toEqual({ outcome: "succeeded", providerRef: "cus_1" });
    expect(calls[0]!.args[1]).toEqual({ name: "", email: "", phone: "", description: "", address: "", shipping: "", metadata: "" });
    const echoing = fakeClient({
      customerUpdate: vi.fn(async (id: string) => ({ id, name: "", email: "still@example.test", phone: "", description: "", address: null, shipping: null, metadata: {} }) as never),
    });
    expect(await createStripeExternalCommandPort(db, () => echoing.client).execute(command("stripe_customer_personal_fields_clear", workspaceId))).toEqual({
      outcome: "failed",
      failureCode: "customer_fields_not_cleared",
    });
  });

  it("classifies provider outcomes honestly: definitive refusals fail, indeterminate exchanges are unknown", async () => {
    const refused = fakeClient({ update: vi.fn(async () => { throw stripeError("StripeInvalidRequestError", "parameter_invalid"); }) });
    expect(await createStripeExternalCommandPort(db, () => refused.client).execute(command("stripe_subscription_cancel_at_period_end", workspaceId))).toEqual({
      outcome: "failed",
      failureCode: "provider_invalid_request:parameter_invalid",
    });
    const unauthorised = fakeClient({ update: vi.fn(async () => { throw stripeError("StripeAuthenticationError"); }) });
    expect(await createStripeExternalCommandPort(db, () => unauthorised.client).execute(command("stripe_subscription_cancel_at_period_end", workspaceId))).toEqual({
      outcome: "failed",
      failureCode: "provider_unauthorized",
    });
    const dropped = fakeClient({ update: vi.fn(async () => { throw stripeError("StripeConnectionError"); }) });
    const result = await createStripeExternalCommandPort(db, () => dropped.client).execute(command("stripe_subscription_cancel_at_period_end", workspaceId));
    expect(result.outcome).toBe("unknown");
    expect((result as { reconciliationDigest: string }).reconciliationDigest).toMatch(/^[0-9a-f]{64}$/);
    const thrown = fakeClient({ cancel: vi.fn(async () => { throw new Error("socket hang up"); }) });
    expect((await createStripeExternalCommandPort(db, () => thrown.client).execute(command("stripe_subscription_cancel_now", workspaceId))).outcome).toBe("unknown");
  });

  it("reconciles from provider state without re-executing", async () => {
    const { client, calls } = fakeClient({
      retrieve: vi.fn(async (id: string) => ({ id, status: "active", cancel_at_period_end: false }) as never),
    });
    const port = createStripeExternalCommandPort(db, () => client);
    expect(await port.reconcile(command("stripe_subscription_cancel_at_period_end", workspaceId))).toEqual({ outcome: "failed", failureCode: "not_applied" });
    expect(await port.reconcile(command("stripe_subscription_cancel_now", workspaceId))).toEqual({ outcome: "failed", failureCode: "not_applied" });
    expect(await port.reconcile(command("stripe_customer_personal_fields_clear", workspaceId))).toEqual({ outcome: "succeeded", providerRef: "cus_1" });
    expect(calls.map((call) => call.method)).toEqual(["subscriptions.retrieve", "subscriptions.retrieve", "customers.retrieve"]);
  });

  it("succeeds trivially when the workspace has no subscription or customer to act on", async () => {
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId));
    const { client, calls } = fakeClient();
    const port = createStripeExternalCommandPort(db, () => client);
    expect(await port.execute(command("stripe_subscription_cancel_now", workspaceId))).toEqual({ outcome: "succeeded" });
    expect(await port.execute(command("stripe_customer_personal_fields_clear", workspaceId))).toEqual({ outcome: "succeeded" });
    expect(calls).toHaveLength(0);
  });
});
