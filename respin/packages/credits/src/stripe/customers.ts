// Stripe customer ↔ workspace mapping (D-M1-6): created at checkout-session
// creation, BEFORE redirect, so by webhook time the stored mapping — the SOLE
// resolution authority — always exists for legitimate events.
// This file is a sanctioned trustWorkspaceId import site (webhook resolution).
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  subscriptions,
  trustWorkspaceId,
  type DbLike,
  type TxLike,
  type VerifiedUserId,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { getStripe, STRIPE_MAX_RETRY_DELAY_MS } from "./adapter";
import {
  getTierCheckoutProtocolState,
  TierCheckoutRolloutError,
} from "./tier-checkout-rollout";

/**
 * Lost the mapping insert race AND the winning row is already gone — a
 * concurrent workspace delete. Typed (billing round-10 NOTE 1) because it is
 * reachable from `createTierCheckoutUrl`/`createPackCheckoutUrl`, i.e. from the
 * app-facing facade, and an anonymous Error on a payments path is one Phase 4
 * cannot tell from a Stripe outage. It also carries an operator action: a live
 * Stripe customer has been orphaned.
 */
export class CustomerMappingLostError extends Error {
  /**
   * IDS BELONG IN THE LOG, THE REMEDY IN THE MESSAGE (billing/tenancy round-11
   * NOTE, `customers.ts:23-30`). This class is re-exported to `app/**` and
   * Phase 4's billing page is what RENDERS it, so the workspace UUID and the
   * Stripe customer id it used to embed would have been printed to a creator —
   * identifiers that mean nothing to them and everything to anyone else
   * reading over their shoulder or in a screenshot on a support ticket. The
   * throw site logs both ids (server-side, ids-not-PII per D-M1-6) so the
   * orphaned Stripe customer is still findable; the message carries only what
   * the person in front of the screen can act on.
   */
  constructor() {
    super(
      "This workspace's billing record is no longer there, so the Checkout could not be started. Nothing was charged. This normally means the workspace was deleted while the page was open: reload, and if the workspace still exists, try again. If it does not, the ids needed to clean up in Stripe are in the server log."
    );
    this.name = "CustomerMappingLostError";
  }
}

/**
 * THE DURABLE IDEMPOTENCY KEY for the one Stripe Customer a workspace's mapping
 * names (audit Phase 8, P8-R5; register item 19, T-R2-4):
 * `customer:<workspaceId>:<first 16 hex of sha256(email)>`.
 *
 * ONE KEY PER WORKSPACE AND PER PARAMETER SET, NO ATTEMPT ORDINAL. Stripe
 * replays a key only for IDENTICAL parameters and answers a same-key call with
 * different ones `400 idempotency_error` for the rest of its 24-hour window —
 * so a key of the workspace alone would lock a creator out of Checkout for a
 * day after editing their billing email between a crash and a retry. With the
 * email's hash in the key:
 *  - a retry with the same email inside the window gets the SAME customer
 *    (a crash between the create and the mapping insert no longer orphans one);
 *  - a retry with a changed email, or any retry after the window, is a new key
 *    and a second customer, whose mapping insert then succeeds; the first is an
 *    orphan findable by `metadata.workspace_id`, never a `400` the creator
 *    cannot get past.
 * The hash, not the address, so the key Stripe logs carries no email.
 */
export function customerIdempotencyKey(
  workspaceId: VerifiedWorkspaceId,
  email: string
): string {
  const emailDigest = createHash("sha256").update(email, "utf8").digest("hex").slice(0, 16);
  return `customer:${workspaceId}:${emailDigest}`;
}

/**
 * Stripe's in-flight answer for a second request carrying a key whose first
 * request is still processing: `409 idempotency_key_in_use`. The SDK retries a
 * 409 itself (`maxNetworkRetries`, with its own backoff); if it still
 * surfaces, the create is tried ONCE more, after the SDK's own maximum retry
 * delay (`STRIPE_MAX_RETRY_DELAY_MS`), with the same key and parameters —
 * which replays the first request's customer if it has finished by then. If it
 * has not, the 409 propagates: the checkout fails before any Session exists,
 * nothing is charged, and a retry replays the same key.
 */
function isIdempotencyKeyInUse(error: unknown): boolean {
  const e = error as { statusCode?: unknown; code?: unknown } | null;
  return e?.statusCode === 409 || e?.code === "idempotency_key_in_use";
}

/** Resolve a Stripe customer id to its workspace via the stored mapping. */
export async function workspaceForCustomer(
  db: DbLike | TxLike,
  stripeCustomerId: string
): Promise<VerifiedWorkspaceId | null> {
  const [row] = await db
    .select({ workspaceId: subscriptions.workspaceId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  // The mapping row is written only through get-or-create below (checkout
  // creation) — resolving through it is the sanctioned non-session mint.
  return row ? trustWorkspaceId(row.workspaceId) : null;
}

/**
 * Get or create the Stripe customer for a workspace, persisting the mapping
 * (the subscriptions row is created here with status 'none'). Upsert-on-
 * conflict keeps concurrent first-checkouts single-rowed (workspace unique).
 */
export async function getOrCreateCustomer(
  db: DbLike | TxLike,
  workspaceId: VerifiedWorkspaceId,
  email: string,
  /**
   * Plan C3: the owner whose email the customer is created with becomes the
   * workspace's billing contact. Recorded on the mapping row so identity
   * deletion can refuse while that person is still the contact.
   */
  billingContactUserId: VerifiedUserId
): Promise<string> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  if (existing) return existing.stripeCustomerId;

  // A new mapping is also the point at which an old tier-Checkout binary can
  // escape the durable-attempt protocol: the legacy build creates the Stripe
  // Customer, inserts {subscription_id: null, status: none}, and immediately
  // creates a subscription Session without rereading the row. During the drain
  // we therefore refuse before the first provider write. Once active, this
  // build emits an explicit fenced insert shape that the 0049 trigger accepts;
  // an old build cannot manufacture that shape and is rejected by the trigger
  // before it can create Checkout.
  const tierCheckoutProtocolState = await getTierCheckoutProtocolState(db);
  if (tierCheckoutProtocolState === "draining") {
    throw new TierCheckoutRolloutError(
      "new Stripe customer mappings remain closed while legacy Checkout calls drain"
    );
  }

  // `email` stays on the create, so the customer carries the receipt address
  // from its first second; its hash is in the key (`customerIdempotencyKey`).
  const createParams = { email, metadata: { workspace_id: workspaceId } };
  const requestOptions = { idempotencyKey: customerIdempotencyKey(workspaceId, email) };
  let customer: { id: string };
  try {
    customer = await getStripe().customers.create(createParams, requestOptions);
  } catch (error) {
    if (!isIdempotencyKeyInUse(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, STRIPE_MAX_RETRY_DELAY_MS));
    customer = await getStripe().customers.create(createParams, requestOptions);
  }
  // AN ORPHAN MADE BY A FAILED MAPPING INSERT IS NAMED WHEN IT IS MADE (audit
  // Phase 8, P8-R5, AC6). If the mapping insert fails after Stripe returned the
  // customer, the customer exists unmapped. A retry with the same email inside
  // Stripe's 24-hour window replays it under the same key and maps it; a retry
  // with a changed email, or after the window, creates a second one and leaves
  // this one an orphan. Which of the two happens is unknowable here, so the id
  // is logged now (ids only), the error propagates unchanged, and the orphan
  // stays findable by `metadata.workspace_id` either way. A process that dies
  // between the create and the insert logs nothing; the metadata is what
  // reconciles that case.
  const insertMapping = () => db
    .insert(subscriptions)
    .values(
      tierCheckoutProtocolState === "active"
        ? {
            workspaceId,
            stripeCustomerId: customer.id,
            billingContactUserId,
            stripeSubscriptionId: `checkout_fence:${workspaceId}`,
            status: "incomplete",
            tierCheckoutFenceAt: new Date(),
            tierCheckoutFenceSubscriptionId: null,
            tierCheckoutFenceStatus: "none",
            tierCheckoutFenceObservedSubscriptionId: null,
          }
        : {
            workspaceId,
            stripeCustomerId: customer.id,
            billingContactUserId,
            // Expansion remains readable and writable by the legacy binary.
            stripeSubscriptionId: null,
            status: "none",
          }
    )
    .onConflictDoNothing({ target: subscriptions.workspaceId })
    .returning();
  let row: Awaited<ReturnType<typeof insertMapping>>[number] | undefined;
  try {
    [row] = await insertMapping();
  } catch (error) {
    console.warn(
      `[stripe-customers] unmapped Stripe customer ${customer.id} for workspace ${workspaceId}: the mapping insert failed after the create. A retry with the same billing email within Stripe's 24-hour idempotency window replays and maps it; otherwise it is an orphan (metadata.workspace_id=${workspaceId}) and should be deleted in the Stripe dashboard.`
    );
    throw error;
  }
  if (row) return row.stripeCustomerId;
  // Lost a concurrent race — the winner's mapping is authoritative.
  const [winner] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  if (!winner) {
    // Lost the insert race AND the winning row is already gone (a concurrent
    // workspace delete). Say that, rather than dereferencing undefined and
    // reporting a TypeError from a payments path (code-review NOTE).
    // The IDS go here — never into the rendered message (round-11 NOTE).
    console.warn(
      `[stripe-customers] mapping lost for workspace ${workspaceId}: the subscriptions row vanished after losing the insert race (concurrent workspace delete). Stripe customer ${customer.id} is now orphaned and should be deleted in the Stripe dashboard.`
    );
    throw new CustomerMappingLostError();
  }
  // The customer we just created is now an ORPHAN: it exists in Stripe with
  // metadata.workspace_id but is absent from the mapping, so any event it
  // emits refuses (fails closed) — it is still a live customer nobody will
  // ever reconcile. Deleting it here would be a destructive external write on
  // a race path, so instead name it loudly enough to be cleaned up
  // (code-review NOTE). Ids only — never payloads.
  if (winner.stripeCustomerId !== customer.id) {
    console.warn(
      `[stripe-customers] orphaned Stripe customer ${customer.id} for workspace ${workspaceId}: lost the mapping race to ${winner.stripeCustomerId}. It is unmapped (its events fail closed) and should be deleted in the Stripe dashboard.`
    );
  }
  return winner.stripeCustomerId;
}
