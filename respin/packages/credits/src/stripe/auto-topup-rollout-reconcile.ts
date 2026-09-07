// Operator-only recovery for a legacy auto-top-up whose Stripe success was
// committed but whose webhook never reached the ledger. The PaymentIntent is
// fetched from authenticated Stripe, then passed through the normal idempotent
// webhook transaction. No manual credit-ledger write exists here.
import type { DbLike } from "@respin/db";
import { getStripe } from "./adapter";
import {
  auditAutoTopupLegacyDrain,
  AutoTopupRolloutError,
  type AutoTopupLegacyDrainReport,
} from "./auto-topup-rollout";
import {
  DuplicateStripeEvent,
  handleStripeEvent,
} from "./webhooks";

export type AutoTopupLegacyReconcileResult = Readonly<{
  replayedPaymentIntents: readonly string[];
  report: AutoTopupLegacyDrainReport;
}>;

/**
 * Replay only provider-authenticated, already-succeeded protocol-0 attempts.
 * Nonterminal and identity blockers stay blocked for explicit operator action.
 */
export async function reconcileMissingLegacyAutoTopups(
  db: DbLike
): Promise<AutoTopupLegacyReconcileResult> {
  const before = await auditAutoTopupLegacyDrain(db);
  const replayedPaymentIntents: string[] = [];
  for (const blocker of before.blockers) {
    if (blocker.reason !== "succeeded_without_ledger") continue;
    if (!blocker.workspaceId) {
      throw new AutoTopupRolloutError(
        `audited legacy success ${blocker.paymentIntentId} has no workspace identity`
      );
    }
    const pi = await getStripe().paymentIntents.retrieve(blocker.paymentIntentId);
    if (
      pi.id !== blocker.paymentIntentId ||
      pi.status !== "succeeded" ||
      pi.metadata?.respin_kind !== "auto_topup" ||
      pi.metadata?.respin_attempt_id ||
      pi.metadata?.workspace_id !== blocker.workspaceId
    ) {
      throw new AutoTopupRolloutError(
        `Stripe recovery object ${blocker.paymentIntentId} no longer matches the audited legacy success`
      );
    }
    let startingAfter: string | undefined;
    const matches = [];
    for (;;) {
      const page = await getStripe().events.list({
        type: "payment_intent.succeeded",
        created: { gte: Math.max(0, pi.created - 1) },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      if (page.has_more && page.data.length === 0) {
        throw new AutoTopupRolloutError(
          `Stripe returned an empty nonterminal event page while recovering ${pi.id}`
        );
      }
      for (const event of page.data) {
        const eventPi = event.data.object;
        if ("id" in eventPi && eventPi.id === pi.id) matches.push(event);
      }
      if (!page.has_more) break;
      startingAfter = page.data.at(-1)!.id;
    }
    if (matches.length !== 1) {
      throw new AutoTopupRolloutError(
        `expected exactly one real Stripe payment_intent.succeeded event for ${pi.id}, found ${matches.length}`
      );
    }
    const event = matches[0]!;
    const eventPi = event.data.object as typeof pi;
    const eventCustomer =
      typeof eventPi.customer === "string"
        ? eventPi.customer
        : eventPi.customer?.id ?? null;
    const retrievedCustomer =
      typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
    if (
      event.type !== "payment_intent.succeeded" ||
      eventPi.status !== "succeeded" ||
      eventPi.amount !== pi.amount ||
      eventPi.currency !== pi.currency ||
      eventCustomer !== retrievedCustomer ||
      eventPi.metadata?.respin_kind !== "auto_topup" ||
      eventPi.metadata?.workspace_id !== blocker.workspaceId ||
      eventPi.metadata?.respin_attempt_id
    ) {
      throw new AutoTopupRolloutError(
        `real Stripe event ${event.id} does not match retrieved legacy success ${pi.id}`
      );
    }
    try {
      await handleStripeEvent(db, event);
    } catch (error) {
      if (!(error instanceof DuplicateStripeEvent)) throw error;
      throw new AutoTopupRolloutError(
        `real provider event ${event.id} has a finalized receipt without settlement; canonical refused receipts cannot be replayed or minted, so keep activation fenced and resolve/refund the charge at Stripe`
      );
    }
    replayedPaymentIntents.push(pi.id);
  }
  return {
    replayedPaymentIntents,
    report: await auditAutoTopupLegacyDrain(db),
  };
}
