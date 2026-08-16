// Stripe customer ↔ workspace mapping (D-M1-6): created at checkout-session
// creation, BEFORE redirect, so by webhook time the stored mapping — the SOLE
// resolution authority — always exists for legitimate events.
// This file is a sanctioned trustWorkspaceId import site (webhook resolution).
import { eq } from "drizzle-orm";
import {
  subscriptions,
  trustWorkspaceId,
  type DbLike,
  type TxLike,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { getStripe } from "./adapter";

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
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  email: string
): Promise<string> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  if (existing) return existing.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email,
    metadata: { workspace_id: workspaceId },
  });
  const [row] = await db
    .insert(subscriptions)
    .values({ workspaceId, stripeCustomerId: customer.id, status: "none" })
    .onConflictDoNothing({ target: subscriptions.workspaceId })
    .returning();
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
