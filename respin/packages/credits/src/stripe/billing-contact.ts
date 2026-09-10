// Plan C3 (Phase 10b-1): the workspace billing contact, the ONE active owner
// whose personal details the Stripe customer object carries.
//
// Why this exists. `getOrCreateCustomer` creates the customer with the email
// of whichever owner started Checkout, so that owner's email lives on a
// provider object outside this database. Identity deletion refuses while the
// deleting person is that contact (`assertBillingContactReleased`), and the
// ONLY way to lift the refusal is this handover: another active owner accepts
// the contact, which rewrites the provider copy and, only if that write is
// verified on the object the provider returns, moves the binding — both inside
// one transaction, so a refused or unverified provider write rolls the binding
// back. A binding that moved with the departing person's email still on the
// customer is exactly the leak C3 forbids.
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  assertReauthenticatedWorkspaceScopeInTx,
  assertScoped,
  subscriptions,
  type DbLike,
  type ReauthenticatedSessionRef,
  type WorkspaceScope,
} from "@respin/db";
import type Stripe from "stripe";
import { takeWorkspaceLock } from "../clock";
import { getStripe } from "./adapter";
import { BillingReauthenticationError, BillingRoleError, NoStripeCustomerError } from "./actions";
import {
  CUSTOMER_PERSONAL_FIELDS_CLEARED,
  customerPersonalFieldsClear,
  type DeletionStripeClient,
} from "./deletion-commands";

export type BillingContactStatus = Readonly<{
  /** A Stripe customer exists for this workspace (a subscriptions row). */
  hasCustomer: boolean;
  /** NULL = unknown: a mapping made before C3. Refused like a live binding. */
  contactUserId: string | null;
  /** The calling scope's user is the current contact. */
  isCurrentUser: boolean;
}>;

/**
 * The provider write failed, or landed but the object read back does not show
 * the handover. Content-free on purpose: the message never carries the email.
 */
export class BillingContactProviderError extends Error {
  constructor(public readonly code: string) {
    super(
      `The billing contact could not be moved on the payment provider (${code}). Nothing was changed here; try again, and if it keeps failing an operator can check the customer object in Stripe.`
    );
    this.name = "BillingContactProviderError";
  }
}

export async function billingContactStatus(db: DbLike, scope: WorkspaceScope): Promise<BillingContactStatus> {
  assertScoped(scope);
  const [row] = await db
    .select({ billingContactUserId: subscriptions.billingContactUserId })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, scope.workspaceId))
    .limit(1);
  if (!row) return { hasCustomer: false, contactUserId: null, isCurrentUser: false };
  return {
    hasCustomer: true,
    contactUserId: row.billingContactUserId,
    isCurrentUser: row.billingContactUserId === scope.userId,
  };
}

function isStripeError(error: unknown): error is { type: string; code?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof (error as { type: unknown }).type === "string"
  );
}

/**
 * Make the calling owner the billing contact. Owner-only, fresh password
 * proof required, workspace money lock held; the customer's personal-field
 * class is cleared and the acceptor's email written in the SAME provider call,
 * verified on the object Stripe returns, and only then is the binding moved.
 * Idempotent: an owner who already is the contact makes no provider call.
 */
export async function acceptBillingContact(
  db: DbLike,
  scope: WorkspaceScope,
  email: string,
  authority: ReauthenticatedSessionRef,
  client: () => Pick<DeletionStripeClient, "customers"> = () => getStripe() as unknown as DeletionStripeClient
): Promise<BillingContactStatus> {
  assertScoped(scope);
  if (scope.role !== "owner") throw new BillingRoleError(scope.role);
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new BillingContactProviderError("acceptor_email_invalid");
  return db.transaction(async (tx) => {
    let role: "owner" | "editor" | "viewer";
    try {
      ({ role } = await assertReauthenticatedWorkspaceScopeInTx(tx, scope, authority));
    } catch (error) {
      if (error instanceof Error && error.message === "auth_lifecycle_refused") {
        throw new BillingReauthenticationError();
      }
      throw error;
    }
    if (role !== "owner") throw new BillingRoleError(role);
    await takeWorkspaceLock(tx, scope.workspaceId);
    const [row] = await tx
      .select({
        stripeCustomerId: subscriptions.stripeCustomerId,
        billingContactUserId: subscriptions.billingContactUserId,
      })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .limit(1);
    if (!row) throw new NoStripeCustomerError("Accepting the billing contact");
    if (row.billingContactUserId === scope.userId) {
      return { hasCustomer: true, contactUserId: scope.userId, isCurrentUser: true };
    }

    // PROVIDER FIRST, INSIDE the transaction that later moves the binding: if
    // the provider refuses, or the object it returns does not show the
    // handover, the throw rolls the transaction back and the binding never
    // moves. (The order inside one transaction is not itself observable; the
    // guarantee the tests pin is that a failed or unverified provider write
    // leaves the binding where it was.) Metadata is deliberately NOT in this
    // write: it carries `workspace_id`, the orphan-resolution key, and no
    // person's details.
    const params: Stripe.CustomerUpdateParams = { ...CUSTOMER_PERSONAL_FIELDS_CLEARED, email };
    const emailDigest = createHash("sha256").update(email, "utf8").digest("hex").slice(0, 16);
    // THE KEY IS FRESH PER CALL. Stripe answers a repeated idempotency key
    // with the CACHED first response for 24 hours without re-executing the
    // write, so a key of (customer, acceptor) let A -> B -> A within a day
    // return A's stale object on the third call: the verification below
    // passed on it, the binding moved to A, and the real customer still
    // carried B's email (tenancy gate, fix round 2 BLOCK). Naming the outgoing
    // contact was not enough either — D -> A -> D -> A repeats the first
    // transition's key (found by the witness). A per-call nonce means the key
    // does exactly one job: it lets the SDK's own automatic retries of THIS
    // request replay safely. A later handover is always a new request, and a
    // crash between provider success and the commit below simply re-runs an
    // idempotent-in-effect write on the next attempt.
    const outgoing = row.billingContactUserId ?? "unknown";
    let updated: Stripe.Customer;
    try {
      updated = await client().customers.update(row.stripeCustomerId, params, {
        idempotencyKey: `billing-contact:${row.stripeCustomerId}:${outgoing}:${scope.userId}:${emailDigest}:${randomUUID()}`,
      });
    } catch (error) {
      throw new BillingContactProviderError(
        isStripeError(error) ? `provider:${error.code ?? error.type}` : "provider_unreachable"
      );
    }
    // Verified on the object the provider returned, never assumed from a 200.
    if (updated.email !== email || !customerPersonalFieldsClear(updated)) {
      throw new BillingContactProviderError("provider_object_not_handed_over");
    }

    const [moved] = await tx
      .update(subscriptions)
      .set({ billingContactUserId: scope.userId })
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .returning({ billingContactUserId: subscriptions.billingContactUserId });
    if (!moved) throw new NoStripeCustomerError("Accepting the billing contact");
    return { hasCustomer: true, contactUserId: moved.billingContactUserId, isCurrentUser: true };
  });
}
