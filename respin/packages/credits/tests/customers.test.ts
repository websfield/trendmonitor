// THE STRIPE CUSTOMER UNDER A DURABLE IDEMPOTENCY KEY (audit Phase 8, P8-R5,
// AC6; register item 19, T-R2-4).
//
// `getOrCreateCustomer` creates the Stripe Customer that carries the creator's
// email, THEN writes the workspace's mapping. A crash between the two used to
// leave an orphan every retry multiplied. Now the create carries
// `customer:<workspace>:<sha256(email)[0..16]>`, so:
//   - a retry with the same email inside Stripe's window is the SAME customer;
//   - two concurrent callers end on ONE customer id, with no orphan warning;
//   - a retry with a CHANGED email (or after the window) is a new key and a
//     second customer — never Stripe's `400 idempotency_error`, which a key of
//     the workspace alone would have locked the creator into for 24 hours;
//   - an orphan is findable by `metadata.workspace_id`.
//
// The Stripe double below models the one behaviour under test — the key — from
// Stripe's documented rules: same key and same parameters replay the first
// result; same key and different parameters are `400 idempotency_error`; a
// second request while the first is in flight is `409 idempotency_key_in_use`.
import { beforeEach, describe, expect, it, vi } from "vitest";

type CreateParams = { email: string; metadata: { workspace_id: string } };
type Customer = { id: string; email: string; metadata: { workspace_id: string } };

const stripe = vi.hoisted(() => {
  const state = {
    customers: [] as Customer[],
    byKey: new Map<string, { params: string; customer: Customer | null }>(),
    ignoreKeys: false,
    holdFirst: null as null | { inFlight: () => void; release: Promise<void> },
    /** Called as a 409 is answered — the test finishes the first request here. */
    onConflict: null as null | (() => void),
    calls: [] as { params: CreateParams; key: string | undefined }[],
  };
  const create = async (params: CreateParams, options?: { idempotencyKey?: string }) => {
    const key = state.ignoreKeys ? undefined : options?.idempotencyKey;
    state.calls.push({ params, key });
    const serial = JSON.stringify(params);
    if (key !== undefined) {
      const seen = state.byKey.get(key);
      if (seen) {
        if (seen.params !== serial) {
          throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), {
            statusCode: 400,
            type: "idempotency_error",
          });
        }
        if (seen.customer === null) {
          state.onConflict?.();
          throw Object.assign(new Error("There is currently another in-progress request using this Idempotent Key"), {
            statusCode: 409,
            code: "idempotency_key_in_use",
          });
        }
        return seen.customer;
      }
      state.byKey.set(key, { params: serial, customer: null });
    }
    const hold = state.holdFirst;
    if (hold) {
      state.holdFirst = null;
      hold.inFlight();
      await hold.release;
    }
    const customer: Customer = { id: `cus_${state.customers.length + 1}`, email: params.email, metadata: params.metadata };
    state.customers.push(customer);
    if (key !== undefined) state.byKey.set(key, { params: serial, customer });
    return customer;
  };
  return { state, create };
});

vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({ customers: { create: stripe.create } }),
}));

import { eq } from "drizzle-orm";
import {
  createTestDb,
  ensureUserWorkspace,
  seedAuthUser,
  seedDb,
  subscriptions,
  trustWorkspaceId,
  type DbLike,
  type VerifiedUserId,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { customerIdempotencyKey, getOrCreateCustomer } from "../src/stripe/customers";

/** A db whose next `subscriptions` insert fails — the crash between the create and the mapping. */
function failingNextMappingInsert(db: DbLike): DbLike {
  let armed = true;
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop === "insert") {
        return (table: unknown) => {
          if (armed && table === subscriptions) {
            armed = false;
            throw new Error("simulated crash between the Stripe create and the mapping insert");
          }
          return (value as (t: unknown) => unknown).call(target, table);
        };
      }
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as DbLike;
}

describe("getOrCreateCustomer under a durable idempotency key (P8-R5, AC6)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ws: VerifiedWorkspaceId;
  let contact: VerifiedUserId;

  beforeEach(async () => {
    stripe.state.customers = [];
    stripe.state.byKey = new Map();
    stripe.state.ignoreKeys = false;
    stripe.state.holdFirst = null;
    stripe.state.onConflict = null;
    stripe.state.calls = [];
    db = await createTestDb();
    await seedDb(db);
    await seedAuthUser(db, "cust_user", "cust_user@test.dev");
    const boot = await ensureUserWorkspace(db, { authUserId: "cust_user", name: "C" });
    ws = trustWorkspaceId(boot.workspace.id);
    contact = boot.user.id as VerifiedUserId;
  });

  const mappings = () => db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ws));

  it("the key is per workspace AND per email, and carries no address", () => {
    const key = customerIdempotencyKey(ws, "a@example.com");
    expect(key).toMatch(new RegExp(`^customer:${ws}:[0-9a-f]{16}$`));
    expect(key).not.toContain("example");
    expect(customerIdempotencyKey(ws, "a@example.com")).toBe(key);
    expect(customerIdempotencyKey(ws, "b@example.com")).not.toBe(key);
  });

  /** The `[stripe-customers]` warnings that name an orphan (ids only). */
  const orphanWarnings = (warn: { mock: { calls: unknown[][] } }) =>
    warn.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith("[stripe-customers]") && m.includes("orphan"));

  it("a retry with the SAME email after a crash before the mapping: ONE customer — the warning named it, and the retry mapped it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(getOrCreateCustomer(failingNextMappingInsert(db), ws, "a@example.com", contact)).rejects.toThrow(
        /simulated crash/
      );
      const id = await getOrCreateCustomer(db, ws, "a@example.com", contact);
      expect(stripe.state.customers).toHaveLength(1);
      expect(id).toBe(stripe.state.customers[0].id);
      expect(await mappings()).toHaveLength(1);
      expect(stripe.state.calls.map((c) => c.key)).toEqual([
        customerIdempotencyKey(ws, "a@example.com"),
        customerIdempotencyKey(ws, "a@example.com"),
      ]);
      // The failed insert named the unmapped customer once — and it is the one
      // the replayed retry then mapped, so it is not left an orphan.
      const warned = orphanWarnings(warn);
      expect(warned).toHaveLength(1);
      expect(warned[0]).toContain(id);
    } finally {
      warn.mockRestore();
    }
  });

  it("PLANTED: the same crash and retry WITHOUT the key makes TWO customers — the key is what dedupes", async () => {
    stripe.state.ignoreKeys = true;
    await expect(getOrCreateCustomer(failingNextMappingInsert(db), ws, "a@example.com", contact)).rejects.toThrow();
    await getOrCreateCustomer(db, ws, "a@example.com", contact);
    expect(stripe.state.customers).toHaveLength(2);
  });

  it("two CONCURRENT callers: one customer id, no orphan warning (the in-flight 409 is retried once)", async () => {
    let signal!: () => void;
    const inFlight = new Promise<void>((r) => (signal = r));
    let release!: () => void;
    stripe.state.holdFirst = { inFlight: () => signal(), release: new Promise<void>((r) => (release = r)) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const first = getOrCreateCustomer(db, ws, "a@example.com", contact);
      await inFlight;
      // The second caller meets the first's in-flight key: Stripe answers 409,
      // and AT THAT MOMENT the first request finishes. The second's one retry
      // (after the SDK's maximum retry delay) is then Stripe's replay.
      stripe.state.onConflict = () => release();
      const second = getOrCreateCustomer(db, ws, "a@example.com", contact);
      const ids = await Promise.allSettled([first, second]);
      const values = ids.map((r) => (r.status === "fulfilled" ? r.value : `rejected:${String((r as PromiseRejectedResult).reason)}`));
      expect(stripe.state.customers).toHaveLength(1);
      expect(new Set(values)).toEqual(new Set([stripe.state.customers[0].id]));
      expect(orphanWarnings(warn)).toEqual([]);
      expect(warn.mock.calls.filter((c) => String(c[0]).includes("orphan"))).toEqual([]);
      expect(await mappings()).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("a retry with a CHANGED email inside the window: two customers, one mapping, ONE orphan warning, never idempotency_error — and the orphan is findable by metadata.workspace_id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let id: string;
    try {
      await expect(getOrCreateCustomer(failingNextMappingInsert(db), ws, "old@example.com", contact)).rejects.toThrow(
        /simulated crash/
      );
      // No `idempotency_error`: the changed email is a different key.
      id = await getOrCreateCustomer(db, ws, "new@example.com", contact);
      expect(stripe.state.calls.map((c) => c.key)).toEqual([
        customerIdempotencyKey(ws, "old@example.com"),
        customerIdempotencyKey(ws, "new@example.com"),
      ]);
      // ONE orphan warning, and it names the customer the mapping does NOT.
      const warned = orphanWarnings(warn);
      expect(warned).toHaveLength(1);
      expect(warned[0]).toContain(stripe.state.customers[0].id);
      expect(warned[0]).not.toContain(id);
      expect(warned[0]).toContain(`metadata.workspace_id=${ws}`);
    } finally {
      warn.mockRestore();
    }
    expect(stripe.state.customers).toHaveLength(2);
    const rows = await mappings();
    expect(rows).toHaveLength(1);
    expect(rows[0].stripeCustomerId).toBe(id);
    // The orphan is the one the mapping does not name, and it carries the
    // workspace id Stripe can be searched by.
    const orphans = stripe.state.customers.filter((c) => c.id !== id);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].metadata.workspace_id).toBe(ws);
    // The witness that a workspace-only key would have failed here: the same
    // key with a different email is Stripe's 400.
    await expect(
      stripe.create({ email: "other@example.com", metadata: { workspace_id: ws } }, { idempotencyKey: customerIdempotencyKey(ws, "new@example.com") })
    ).rejects.toMatchObject({ statusCode: 400, type: "idempotency_error" });
  });

  it("every customer this path creates carries metadata.workspace_id", async () => {
    await getOrCreateCustomer(db, ws, "a@example.com", contact);
    expect(stripe.state.calls.every((c) => c.params.metadata.workspace_id === ws)).toBe(true);
    expect(stripe.state.calls.every((c) => c.params.email === "a@example.com")).toBe(true);
  });
});
