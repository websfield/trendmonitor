// Plan C3 (Phase 10b-1): the billing-contact handover. The property that
// matters: a failed or unverified provider write leaves the binding where it
// was — because the binding is what lifts identity deletion's refusal, and
// lifting it with the departing person's email still on the customer object
// is the leak C3 forbids. (Provider write and binding move share one
// transaction; their order inside it is not observable from here.)
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  schema,
  seedAuthUser,
  withWorkspace,
  type ReauthenticatedSessionRef,
  type TestDb,
  type WorkspaceScope,
} from "@respin/db";

import {
  acceptBillingContact,
  billingContactStatus,
  BillingContactProviderError,
} from "../src/stripe/billing-contact";
import { BillingReauthenticationError, BillingRoleError, NoStripeCustomerError } from "../src/stripe/actions";
import type { DeletionStripeClient } from "../src/stripe/deletion-commands";

type Person = { scope: WorkspaceScope; authority: ReauthenticatedSessionRef; userId: string; email: string };

async function member(db: TestDb, workspaceId: string, role: "owner" | "editor", tag: string): Promise<Person> {
  const authUserId = `bc_${tag}`;
  const email = `${tag}@example.test`;
  await seedAuthUser(db, authUserId, email);
  const [u] = await db.insert(schema.users).values({ authUserId }).returning();
  await db.insert(schema.memberships).values({ userId: u!.id, workspaceId, role });
  const reauthenticatedAt = new Date();
  const sessionId = `session-${authUserId}`;
  await db.insert(schema.session).values({
    id: sessionId,
    token: `token-${authUserId}`,
    userId: authUserId,
    expiresAt: new Date(reauthenticatedAt.getTime() + 3_600_000),
    updatedAt: reauthenticatedAt,
    reauthenticatedAt,
  });
  const scope = await withWorkspace(db, { authUserId, workspaceId });
  return { scope, authority: { authUserId, sessionId, reauthenticatedAt }, userId: u!.id, email };
}

function fakeCustomers(
  update: DeletionStripeClient["customers"]["update"] = async (id, params) =>
    ({ id, ...(params as object), address: null, shipping: null, metadata: { workspace_id: "kept" } }) as never
) {
  const calls: { id: string; params: unknown; options: unknown }[] = [];
  const client: Pick<DeletionStripeClient, "customers"> = {
    customers: {
      update: vi.fn(async (id, params, options) => {
        calls.push({ id, params, options });
        return update(id, params, options);
      }),
      retrieve: vi.fn(async () => {
        throw new Error("retrieve is not part of the handover");
      }),
    },
  };
  return { client: () => client, calls };
}

describe("acceptBillingContact", () => {
  let db: TestDb;
  let workspaceId: string;
  let departing: Person;
  let acceptor: Person;
  let editor: Person;

  beforeEach(async () => {
    db = await createTestDb();
    const [w] = await db.insert(schema.workspaces).values({ name: "Contact WS" }).returning();
    workspaceId = w!.id;
    departing = await member(db, workspaceId, "owner", "departing");
    acceptor = await member(db, workspaceId, "owner", "acceptor");
    editor = await member(db, workspaceId, "editor", "editor");
    await db.insert(schema.subscriptions).values({
      workspaceId,
      stripeCustomerId: "cus_contact",
      status: "active",
      billingContactUserId: departing.userId,
    });
  });

  const contactRow = async () =>
    (await db.select({ c: schema.subscriptions.billingContactUserId }).from(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId)))[0]!.c;

  it("reports who the contact is, relative to the caller", async () => {
    expect(await billingContactStatus(db, departing.scope)).toEqual({ hasCustomer: true, contactUserId: departing.userId, isCurrentUser: true });
    expect(await billingContactStatus(db, acceptor.scope)).toEqual({ hasCustomer: true, contactUserId: departing.userId, isCurrentUser: false });
  });

  it("PROVIDER FIRST: clears every personal field, writes the acceptor's email, keeps metadata, then moves the binding", async () => {
    const stripe = fakeCustomers();
    const result = await acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stripe.client);
    expect(result).toEqual({ hasCustomer: true, contactUserId: acceptor.userId, isCurrentUser: true });
    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]!.id).toBe("cus_contact");
    // The whole personal-field class, blanked, with ONLY the acceptor's email
    // written — and no `metadata` key at all, because `workspace_id` lives
    // there and is the orphan-resolution key, not a person's detail.
    expect(stripe.calls[0]!.params).toEqual({
      name: "",
      email: acceptor.email,
      phone: "",
      description: "",
      address: "",
      shipping: "",
    });
    // The key names the transition AND carries a per-call nonce (see the module).
    expect(stripe.calls[0]!.options).toMatchObject({
      idempotencyKey: expect.stringMatching(new RegExp(`^billing-contact:cus_contact:${departing.userId}:${acceptor.userId}:[0-9a-f]{16}:[0-9a-f-]{36}$`)),
    });
    expect(await contactRow()).toBe(acceptor.userId);
  });

  it("a provider failure leaves the binding where it was — the refusal stays in force", async () => {
    const stripe = fakeCustomers(async () => {
      throw Object.assign(new Error("boom"), { type: "StripeAPIError" });
    });
    await expect(acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stripe.client)).rejects.toBeInstanceOf(
      BillingContactProviderError
    );
    expect(await contactRow()).toBe(departing.userId);
  });

  it("a 200 whose object does NOT show the handover is refused, and the binding stays", async () => {
    // The provider echoed the old email back: the write did not take.
    const stripe = fakeCustomers(async (id) => ({ id, name: "", email: departing.email, phone: "", description: "", address: null, shipping: null, metadata: {} }) as never);
    await expect(acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stripe.client)).rejects.toThrow(
      /provider_object_not_handed_over/
    );
    expect(await contactRow()).toBe(departing.userId);
  });

  it("refuses a 200 whose object carries the acceptor's email but a PERSONAL field still set (the personal-field half of the verification)", async () => {
    // The previous fake failed on the EMAIL clause alone, so deleting the
    // `customerPersonalFieldsClear` clause kept the suite green (billing gate).
    const stripe = fakeCustomers(async (id) => ({ id, name: "Departing Person", email: acceptor.email, phone: "", description: "", address: null, shipping: null, metadata: {} }) as never);
    await expect(acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stripe.client)).rejects.toThrow(
      /provider_object_not_handed_over/
    );
    expect(await contactRow()).toBe(departing.userId);
  });

  it("EVERY handover call carries a fresh idempotency key — D -> A -> D -> A is four requests — and a replayed stale object is refused (tenancy gate BLOCK)", async () => {
    // Stripe answers a repeated key with the cached first response. A fake
    // that does exactly that: if the key repeats, the previous response comes
    // back untouched, whatever the new params say.
    const cache = new Map<string, unknown>();
    const keys: string[] = [];
    const stripe = fakeCustomers(async (id, params, options) => {
      const key = String((options as { idempotencyKey?: string } | undefined)?.idempotencyKey);
      keys.push(key);
      if (cache.has(key)) return cache.get(key) as never;
      const response = { id, ...(params as object), address: null, shipping: null, metadata: {} };
      cache.set(key, response);
      return response as never;
    });
    // departing -> acceptor -> departing -> acceptor, all "within 24 hours".
    // The fourth call repeats the second's TRANSITION (departing -> acceptor),
    // which is exactly where a transition-named key replayed and the first
    // fix still leaked: every call must be its own request.
    await acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stripe.client);
    await acceptBillingContact(db, departing.scope, departing.email, departing.authority, stripe.client);
    await acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stripe.client);
    await acceptBillingContact(db, departing.scope, departing.email, departing.authority, stripe.client);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
    expect(await contactRow()).toBe(departing.userId);
    // ...and the real object was rewritten on EVERY call (never served from cache).
    expect(cache.size).toBe(4);
    // And a STALE object, however it arrives (a provider replaying despite a
    // fresh key, or any other way), is refused and the binding stays. This
    // fake returns the departing person's object regardless of the key.
    const stale = fakeCustomers(async (id) => ({ id, name: "", email: departing.email, phone: "", description: "", address: null, shipping: null, metadata: {} }) as never);
    await expect(acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stale.client)).rejects.toThrow(/provider_object_not_handed_over/);
    expect(await contactRow()).toBe(departing.userId);
  });

  it("is idempotent for the current contact — no provider call", async () => {
    const stripe = fakeCustomers();
    const result = await acceptBillingContact(db, departing.scope, departing.email, departing.authority, stripe.client);
    expect(result.isCurrentUser).toBe(true);
    expect(stripe.calls).toHaveLength(0);
  });

  it("refuses an editor, a stale proof, and a workspace with no customer — each before any provider call", async () => {
    const stripe = fakeCustomers();
    await expect(acceptBillingContact(db, editor.scope, editor.email, editor.authority, stripe.client)).rejects.toBeInstanceOf(BillingRoleError);
    const stale: ReauthenticatedSessionRef = { ...acceptor.authority, reauthenticatedAt: new Date(Date.now() - 24 * 3_600_000) };
    await expect(acceptBillingContact(db, acceptor.scope, acceptor.email, stale, stripe.client)).rejects.toBeInstanceOf(
      BillingReauthenticationError
    );
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId));
    await expect(acceptBillingContact(db, acceptor.scope, acceptor.email, acceptor.authority, stripe.client)).rejects.toBeInstanceOf(
      NoStripeCustomerError
    );
    expect(stripe.calls).toHaveLength(0);
    expect(await billingContactStatus(db, acceptor.scope)).toEqual({ hasCustomer: false, contactUserId: null, isCurrentUser: false });
  });
});
