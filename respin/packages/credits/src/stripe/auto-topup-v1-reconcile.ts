// Operator-only convergence for durable v1 attempts whose terminal Stripe
// webhook was lost or exhausted. This module never writes credits directly:
// success replays one real provider event through the normal webhook
// transaction, while canceled/failed attempts retire through the same signed
// attempt binder used by request-time recovery.
import { randomUUID } from "node:crypto";
import { eq, isNotNull } from "drizzle-orm";
import {
  creditLedger,
  lockWorkspaceMembershipGraph,
  subscriptions,
  type DbLike,
  type VerifiedWorkspaceId,
} from "@respin/db";
import type Stripe from "stripe";
import { getDbNow, takeWorkspaceLock } from "../clock";
import { getStripe } from "./adapter";
import {
  AutoTopupAttemptIntegrityError,
  AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS,
  bindPendingAutoTopupPaymentIntent,
  clearPendingAutoTopupAttempt,
  findPaymentIntentForAttempt,
  pendingAutoTopupAttempt,
} from "./auto-topup";
import { verifyAutoTopupAuthority } from "./auto-topup-authority";
import { assertAutoTopupProtocolRecoveryReady } from "./auto-topup-rollout";
import { workspaceForCustomer } from "./customers";
import {
  DuplicateStripeEvent,
  handleStripeEventInTransaction,
} from "./webhooks";

export class AutoTopupV1ReconcileError extends Error {
  constructor(detail: string) {
    super(`Auto-top-up v1 reconciliation refused: ${detail}`);
    this.name = "AutoTopupV1ReconcileError";
  }
}

export type AutoTopupV1ReconcileItem = Readonly<{
  attemptId: string;
  paymentIntentId: string | null;
  providerStatus: string;
  outcome:
    | "settled"
    | "retired"
    | "awaiting_provider_visibility"
    | "awaiting_provider_terminal"
    | "already_converged";
}>;

export type AutoTopupV1ReconcileReport = Readonly<{
  clear: boolean;
  rolloutRevision: number;
  attempts: readonly AutoTopupV1ReconcileItem[];
}>;

function customerIdOf(pi: Stripe.PaymentIntent): string | null {
  return typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
}

function sameProviderObject(
  eventPi: Stripe.PaymentIntent,
  retrieved: Stripe.PaymentIntent
): boolean {
  return (
    eventPi.id === retrieved.id &&
    eventPi.status === "succeeded" &&
    eventPi.amount === retrieved.amount &&
    eventPi.currency === retrieved.currency &&
    customerIdOf(eventPi) === customerIdOf(retrieved) &&
    eventPi.livemode === retrieved.livemode
  );
}

async function realSucceededEvent(
  pi: Stripe.PaymentIntent,
  workspaceId: string
): Promise<Stripe.Event> {
  const matches: Stripe.Event[] = [];
  let startingAfter: string | undefined;
  const seenPageEnds = new Set<string>();
  for (;;) {
    const page = await getStripe().events.list({
      type: "payment_intent.succeeded",
      created: { gte: Math.max(0, pi.created - 1) },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.has_more && page.data.length === 0) {
      throw new AutoTopupV1ReconcileError(
        `Stripe returned an empty nonterminal event page while recovering ${pi.id}`
      );
    }
    for (const event of page.data) {
      const eventPi = event.data.object as Stripe.PaymentIntent;
      if (event.type === "payment_intent.succeeded" && eventPi.id === pi.id) {
        matches.push(event);
      }
    }
    if (!page.has_more) break;
    const pageEnd = page.data.at(-1)!.id;
    if (seenPageEnds.has(pageEnd)) {
      throw new AutoTopupV1ReconcileError(
        `Stripe repeated event page cursor ${pageEnd} while recovering ${pi.id}`
      );
    }
    seenPageEnds.add(pageEnd);
    startingAfter = pageEnd;
  }
  if (matches.length !== 1) {
    throw new AutoTopupV1ReconcileError(
      `expected exactly one real Stripe payment_intent.succeeded event for ${pi.id}, found ${matches.length}`
    );
  }
  const event = matches[0]!;
  const eventPi = event.data.object as Stripe.PaymentIntent;
  verifyAutoTopupAuthority(eventPi, workspaceId);
  if (event.livemode !== pi.livemode || !sameProviderObject(eventPi, pi)) {
    throw new AutoTopupV1ReconcileError(
      `real Stripe event ${event.id} does not match retrieved v1 success ${pi.id}`
    );
  }
  return event;
}

async function retireCanceledAttempt(
  db: DbLike,
  row: { workspaceId: string; attemptId: string; paymentIntentId: string },
  pi: Stripe.PaymentIntent
): Promise<"retired" | "already_converged"> {
  const customerId = customerIdOf(pi);
  if (!customerId) {
    throw new AutoTopupV1ReconcileError(
      `PaymentIntent ${pi.id} has no customer mapping authority`
    );
  }
  const mappedWorkspace = await workspaceForCustomer(db, customerId);
  if (!mappedWorkspace || mappedWorkspace !== row.workspaceId) {
    throw new AutoTopupV1ReconcileError(
      `PaymentIntent ${pi.id} no longer resolves to its stored workspace`
    );
  }
  return db.transaction(async (tx) => {
    await lockWorkspaceMembershipGraph(tx, mappedWorkspace);
    await takeWorkspaceLock(tx, mappedWorkspace);
    await assertAutoTopupProtocolRecoveryReady(tx);
    const reboundWorkspace = await workspaceForCustomer(tx, customerId);
    if (reboundWorkspace !== mappedWorkspace) {
      throw new AutoTopupV1ReconcileError(
        `PaymentIntent ${pi.id} customer mapping changed during reconciliation`
      );
    }
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, mappedWorkspace))
      .limit(1);
    if (!sub) return "already_converged";
    const pending = pendingAutoTopupAttempt(sub);
    if (
      !pending ||
      pending.id !== row.attemptId ||
      pending.paymentIntentId !== row.paymentIntentId
    ) {
      // The exact provider object is terminal-canceled. A concurrent canceled
      // webhook/reconciler correctly clears it without minting a ledger row.
      if (!pending && pi.status === "canceled") return "already_converged";
      const [settled] = await tx
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, row.attemptId))
        .limit(1);
      if (!settled) {
        throw new AutoTopupV1ReconcileError(
          `attempt ${row.attemptId} changed without a matching settlement`
        );
      }
      return "already_converged";
    }
    await bindPendingAutoTopupPaymentIntent(tx, mappedWorkspace, pending, pi);
    return "retired";
  });
}

async function bindObservedAttempt(
  db: DbLike,
  row: { workspaceId: string; attemptId: string },
  pi: Stripe.PaymentIntent
): Promise<"bound" | "retired" | "already_converged"> {
  const customerId = customerIdOf(pi);
  if (!customerId) {
    throw new AutoTopupV1ReconcileError(
      `PaymentIntent ${pi.id} has no customer mapping authority`
    );
  }
  const mappedWorkspace = await workspaceForCustomer(db, customerId);
  if (!mappedWorkspace || mappedWorkspace !== row.workspaceId) {
    throw new AutoTopupV1ReconcileError(
      `PaymentIntent ${pi.id} no longer resolves to its stored workspace`
    );
  }
  return db.transaction(async (tx) => {
    await lockWorkspaceMembershipGraph(tx, mappedWorkspace);
    await takeWorkspaceLock(tx, mappedWorkspace);
    await assertAutoTopupProtocolRecoveryReady(tx);
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, mappedWorkspace))
      .limit(1);
    const pending = sub ? pendingAutoTopupAttempt(sub) : null;
    if (!pending || pending.id !== row.attemptId) {
      if (!pending && pi.status === "canceled") return "already_converged";
      const [settled] = await tx
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(eq(creditLedger.autoTopupAttemptId, row.attemptId))
        .limit(1);
      if (!settled) {
        throw new AutoTopupV1ReconcileError(
          `attempt ${row.attemptId} changed without a matching settlement`
        );
      }
      return "already_converged";
    }
    if (pending.paymentIntentId !== null && pending.paymentIntentId !== pi.id) {
      throw new AutoTopupV1ReconcileError(
        `attempt ${row.attemptId} is already bound to a different PaymentIntent`
      );
    }
    await bindPendingAutoTopupPaymentIntent(tx, mappedWorkspace, pending, pi);
    return pi.status === "canceled" ? "retired" : "bound";
  });
}

async function assertSettledPostcondition(
  db: DbLike,
  attemptId: string
): Promise<void> {
  const [ledger] = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(eq(creditLedger.autoTopupAttemptId, attemptId))
    .limit(1);
  const [stillPending] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.autoTopupAttemptId, attemptId))
    .limit(1);
  if (!ledger || stillPending) {
    throw new AutoTopupV1ReconcileError(
      `success replay for attempt ${attemptId} did not settle the exact ledger row and clear pending authority`
    );
  }
}

async function settleSucceededAttempt(
  db: DbLike,
  row: { workspaceId: string; attemptId: string; paymentIntentId: string },
  pi: Stripe.PaymentIntent
): Promise<"settled" | "already_converged"> {
  const event = await realSucceededEvent(pi, row.workspaceId);
  let outcome: "settled" | "already_converged" = "settled";
  try {
    const webhookOutcome = await db.transaction((tx) =>
      handleStripeEventInTransaction(tx, event)
    );
    if (webhookOutcome !== "processed") outcome = "already_converged";
  } catch (error) {
    if (!(error instanceof DuplicateStripeEvent)) throw error;
    const [settled] = await db
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.autoTopupAttemptId, row.attemptId))
      .limit(1);
    if (!settled) {
      throw new AutoTopupV1ReconcileError(
        `real provider event ${event.id} has a finalized receipt without settlement; canonical refused receipts cannot be replayed or minted, so keep charge authority fenced and resolve/refund the charge at Stripe`
      );
    }
    outcome = "already_converged";
  }
  await assertSettledPostcondition(db, row.attemptId);
  return outcome;
}

async function listProviderV1PaymentIntents(): Promise<Stripe.PaymentIntent[]> {
  const paymentIntents: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  const seenPageEnds = new Set<string>();
  for (;;) {
    const page = await getStripe().paymentIntents.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.has_more && page.data.length === 0) {
      throw new AutoTopupV1ReconcileError(
        "Stripe returned an empty nonterminal account-wide PaymentIntent page"
      );
    }
    for (const pi of page.data) {
      if (
        pi.metadata?.respin_kind === "auto_topup" &&
        pi.metadata?.respin_attempt_id
      ) {
        paymentIntents.push(pi);
      }
    }
    if (!page.has_more) break;
    const pageEnd = page.data.at(-1)!.id;
    if (seenPageEnds.has(pageEnd)) {
      throw new AutoTopupV1ReconcileError(
        `Stripe repeated account-wide PaymentIntent page cursor ${pageEnd}`
      );
    }
    seenPageEnds.add(pageEnd);
    startingAfter = pageEnd;
  }
  return paymentIntents;
}

async function claimExpiredProviderAbsentAttempt(
  db: DbLike,
  mappedWorkspace: VerifiedWorkspaceId,
  row: { workspaceId: string; attemptId: string; claimId: string }
): Promise<string | null> {
  if (mappedWorkspace !== row.workspaceId) {
    throw new AutoTopupV1ReconcileError(
      `provider-absent attempt ${row.attemptId} lost its customer mapping`
    );
  }
  return db.transaction(async (tx) => {
    await lockWorkspaceMembershipGraph(tx, mappedWorkspace);
    await takeWorkspaceLock(tx, mappedWorkspace);
    await assertAutoTopupProtocolRecoveryReady(tx);
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, mappedWorkspace))
      .limit(1);
    const pending = sub ? pendingAutoTopupAttempt(sub) : null;
    if (
      !pending ||
      pending.id !== row.attemptId ||
      pending.claimId !== row.claimId ||
      pending.paymentIntentId !== null
    ) {
      return null;
    }
    const now = await getDbNow(tx);
    if (
      now.getTime() - pending.reservedAt.getTime() <=
      AUTO_TOPUP_IDEMPOTENCY_SAFE_RETRY_MS
    ) {
      return null;
    }
    const operatorClaimId = randomUUID();
    const [claimed] = await tx
      .update(subscriptions)
      .set({
        autoTopupAttemptClaimId: operatorClaimId,
        autoTopupAttemptClaimedAt: now,
      })
      .where(
        eq(subscriptions.autoTopupAttemptId, pending.id)
      )
      .returning({ id: subscriptions.id });
    if (!claimed) {
      throw new AutoTopupV1ReconcileError(
        `provider-absent attempt ${pending.id} changed before operator claim`
      );
    }
    return operatorClaimId;
  });
}

async function clearProviderAbsentOperatorClaim(
  db: DbLike,
  mappedWorkspace: VerifiedWorkspaceId,
  row: { attemptId: string; operatorClaimId: string }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockWorkspaceMembershipGraph(tx, mappedWorkspace);
    await takeWorkspaceLock(tx, mappedWorkspace);
    await assertAutoTopupProtocolRecoveryReady(tx);
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, mappedWorkspace))
      .limit(1);
    const pending = sub ? pendingAutoTopupAttempt(sub) : null;
    if (
      !pending ||
      pending.id !== row.attemptId ||
      pending.claimId !== row.operatorClaimId ||
      pending.paymentIntentId !== null
    ) {
      return false;
    }
    return clearPendingAutoTopupAttempt(tx, mappedWorkspace, pending.id);
  });
}

async function exactLocalAttemptAppeared(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  customerId: string,
  attemptId: string
): Promise<"none" | "exact"> {
  return db.transaction(async (tx) => {
    await lockWorkspaceMembershipGraph(tx, workspaceId);
    await takeWorkspaceLock(tx, workspaceId);
    await assertAutoTopupProtocolRecoveryReady(tx);
    if ((await workspaceForCustomer(tx, customerId)) !== workspaceId) {
      throw new AutoTopupV1ReconcileError(
        `provider attempt ${attemptId} customer mapping changed during reconciliation`
      );
    }
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);
    if (!sub?.autoTopupAttemptId) return "none";
    const pending = pendingAutoTopupAttempt(sub);
    if (!pending) {
      throw new AutoTopupAttemptIntegrityError(
        "the provider-only reconciliation found a partial concurrent attempt"
      );
    }
    if (pending.id !== attemptId) {
      throw new AutoTopupV1ReconcileError(
        `provider-only attempt ${attemptId} conflicts with concurrent pending attempt ${pending.id}`
      );
    }
    return "exact";
  });
}

const CANCELABLE_FAILURE_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
]);

/** Reconcile every pending v1 attempt across all workspaces. */
export async function reconcileBoundAutoTopupAttempts(
  db: DbLike
): Promise<AutoTopupV1ReconcileReport> {
  const rolloutRevision = await db.transaction(async (tx) =>
    (await assertAutoTopupProtocolRecoveryReady(tx)).revision
  );
  const rows = await db
    .select()
    .from(subscriptions)
    .where(isNotNull(subscriptions.autoTopupAttemptId));
  const localAttemptIds = new Set(
    rows.flatMap((row) =>
      row.autoTopupAttemptId ? [row.autoTopupAttemptId] : []
    )
  );

  const attempts: AutoTopupV1ReconcileItem[] = [];
  for (const selected of rows) {
    const pending = pendingAutoTopupAttempt(selected);
    if (!pending) {
      throw new AutoTopupAttemptIntegrityError(
        "the v1 reconciliation scan returned a partial pending attempt"
      );
    }
    const row = {
      workspaceId: selected.workspaceId,
      attemptId: pending.id,
      paymentIntentId: pending.paymentIntentId,
    };
    const mappedWorkspace = await workspaceForCustomer(db, pending.customerId);
    if (!mappedWorkspace || mappedWorkspace !== row.workspaceId) {
      throw new AutoTopupV1ReconcileError(
        `attempt ${pending.id} no longer resolves through its stored customer mapping`
      );
    }
    let pi: Stripe.PaymentIntent;
    if (pending.paymentIntentId === null) {
      let found = await findPaymentIntentForAttempt(mappedWorkspace, pending);
      if (!found) {
        const operatorClaimId = await claimExpiredProviderAbsentAttempt(
          db,
          mappedWorkspace,
          {
            workspaceId: row.workspaceId,
            attemptId: row.attemptId,
            claimId: pending.claimId,
          }
        );
        if (operatorClaimId) {
          // Re-prove only after the claim replacement has waited out and
          // revoked every in-flight dispatcher that could have entered the
          // provider call under the old claim.
          found = await findPaymentIntentForAttempt(mappedWorkspace, pending);
        }
        if (found) {
          pi = found;
          const bindOutcome = await bindObservedAttempt(db, row, pi);
          row.paymentIntentId = pi.id;
          if (bindOutcome !== "bound") {
            attempts.push({
              ...row,
              providerStatus: pi.status,
              outcome: bindOutcome,
            });
            continue;
          }
        } else {
          const retired = operatorClaimId
            ? await clearProviderAbsentOperatorClaim(db, mappedWorkspace, {
                attemptId: row.attemptId,
                operatorClaimId,
              })
            : false;
          attempts.push({
            ...row,
            providerStatus: "not_found",
            outcome: retired ? "retired" : "awaiting_provider_visibility",
          });
          continue;
        }
      } else {
        pi = found;
        const bindOutcome = await bindObservedAttempt(db, row, pi);
        row.paymentIntentId = pi.id;
        if (bindOutcome !== "bound") {
          attempts.push({
            ...row,
            providerStatus: pi.status,
            outcome: bindOutcome,
          });
          continue;
        }
      }
    } else {
      pi = await getStripe().paymentIntents.retrieve(pending.paymentIntentId);
    }
    if (pi.id !== row.paymentIntentId) {
      throw new AutoTopupV1ReconcileError(
        `Stripe retrieve/search returned ${pi.id} for bound ${row.paymentIntentId}`
      );
    }
    const authority = verifyAutoTopupAuthority(pi, row.workspaceId);
    if (authority.attemptId !== row.attemptId) {
      throw new AutoTopupV1ReconcileError(
        `PaymentIntent ${pi.id} does not match stored attempt ${row.attemptId}`
      );
    }

    if (CANCELABLE_FAILURE_STATUSES.has(pi.status)) {
      try {
        pi = await getStripe().paymentIntents.cancel(pi.id);
      } catch {
        // The status may have advanced between retrieve and cancel. Re-read the
        // exact PI; any still-unknown outcome remains a hard refusal below.
        pi = await getStripe().paymentIntents.retrieve(row.paymentIntentId);
      }
      verifyAutoTopupAuthority(pi, row.workspaceId);
    }

    if (pi.status === "succeeded") {
      const outcome = await settleSucceededAttempt(
        db,
        { ...row, paymentIntentId: pi.id },
        pi
      );
      attempts.push({
        ...row,
        providerStatus: pi.status,
        outcome,
      });
      continue;
    }
    if (pi.status === "canceled") {
      const outcome = await retireCanceledAttempt(
        db,
        { ...row, paymentIntentId: pi.id },
        pi
      );
      attempts.push({ ...row, providerStatus: pi.status, outcome });
      continue;
    }
    if (pi.status === "processing") {
      attempts.push({
        ...row,
        providerStatus: pi.status,
        outcome: "awaiting_provider_terminal",
      });
      continue;
    }
    throw new AutoTopupV1ReconcileError(
      `PaymentIntent ${pi.id} remains in unsupported/nonterminal status ${pi.status}`
    );
  }

  // A point-in-time restore can predate Phase A itself. Local pending rows
  // therefore cannot define the recovery population: enumerate the bound Stripe
  // account and use the signed provider-carried authority to find v1 attempts
  // absent from both subscriptions and the ledger.
  const providerAttemptIds = new Set<string>();
  for (let pi of await listProviderV1PaymentIntents()) {
    const customerId = customerIdOf(pi);
    if (!customerId) {
      throw new AutoTopupV1ReconcileError(
        `provider-only PaymentIntent ${pi.id} has no customer identity`
      );
    }
    const mappedWorkspace = await workspaceForCustomer(db, customerId);
    if (!mappedWorkspace) {
      throw new AutoTopupV1ReconcileError(
        `provider-only PaymentIntent ${pi.id} has no durable customer mapping; canonical unknown-customer receipts cannot be re-attributed, so refund or resolve it at Stripe`
      );
    }
    if (pi.metadata?.workspace_id !== mappedWorkspace) {
      throw new AutoTopupV1ReconcileError(
        `provider-only PaymentIntent ${pi.id} customer maps to a different workspace`
      );
    }
    const authority = verifyAutoTopupAuthority(pi, mappedWorkspace);
    if (providerAttemptIds.has(authority.attemptId)) {
      throw new AutoTopupV1ReconcileError(
        `provider account contains multiple PaymentIntents for signed attempt ${authority.attemptId}`
      );
    }
    providerAttemptIds.add(authority.attemptId);
    if (localAttemptIds.has(authority.attemptId)) continue;

    // The initial local scan is intentionally not a global initiation fence.
    // A request may reserve and dispatch while the operator is enumerating
    // Stripe. Re-enter the lifecycle -> billing lock order after provider
    // discovery so a just-created real local attempt is reconciled through the
    // local bind/retire path instead of being misclassified as provider-only.
    if (
      (await exactLocalAttemptAppeared(
        db,
        mappedWorkspace,
        customerId,
        authority.attemptId
      )) === "exact"
    ) {
      const row = {
        workspaceId: mappedWorkspace,
        attemptId: authority.attemptId,
        paymentIntentId: pi.id,
      };
      const bindOutcome = await bindObservedAttempt(db, row, pi);
      if (bindOutcome !== "bound") {
        attempts.push({
          attemptId: authority.attemptId,
          paymentIntentId: pi.id,
          providerStatus: pi.status,
          outcome: bindOutcome,
        });
        continue;
      }
      if (CANCELABLE_FAILURE_STATUSES.has(pi.status)) {
        try {
          pi = await getStripe().paymentIntents.cancel(pi.id);
        } catch {
          pi = await getStripe().paymentIntents.retrieve(pi.id);
        }
        verifyAutoTopupAuthority(pi, mappedWorkspace);
      }
      if (pi.status === "succeeded") {
        const outcome = await settleSucceededAttempt(db, row, pi);
        attempts.push({
          attemptId: authority.attemptId,
          paymentIntentId: pi.id,
          providerStatus: pi.status,
          outcome,
        });
      } else if (pi.status === "canceled") {
        const outcome = await retireCanceledAttempt(db, row, pi);
        attempts.push({
          attemptId: authority.attemptId,
          paymentIntentId: pi.id,
          providerStatus: pi.status,
          outcome,
        });
      } else if (pi.status === "processing") {
        attempts.push({
          attemptId: authority.attemptId,
          paymentIntentId: pi.id,
          providerStatus: pi.status,
          outcome: "awaiting_provider_terminal",
        });
      } else {
        throw new AutoTopupV1ReconcileError(
          `concurrent local PaymentIntent ${pi.id} remains in unsupported/nonterminal status ${pi.status}`
        );
      }
      continue;
    }

    const [settled] = await db
      .select({ id: creditLedger.id, refId: creditLedger.refId })
      .from(creditLedger)
      .where(eq(creditLedger.autoTopupAttemptId, authority.attemptId))
      .limit(1);
    if (settled) {
      if (settled.refId !== pi.id) {
        throw new AutoTopupV1ReconcileError(
          `signed attempt ${authority.attemptId} settled against a different PaymentIntent`
        );
      }
      attempts.push({
        attemptId: authority.attemptId,
        paymentIntentId: pi.id,
        providerStatus: pi.status,
        outcome: "already_converged",
      });
      continue;
    }

    if (CANCELABLE_FAILURE_STATUSES.has(pi.status)) {
      try {
        pi = await getStripe().paymentIntents.cancel(pi.id);
      } catch {
        pi = await getStripe().paymentIntents.retrieve(pi.id);
      }
      verifyAutoTopupAuthority(pi, mappedWorkspace);
    }
    if (pi.status === "succeeded") {
      const outcome = await settleSucceededAttempt(
        db,
        {
          workspaceId: mappedWorkspace,
          attemptId: authority.attemptId,
          paymentIntentId: pi.id,
        },
        pi
      );
      attempts.push({
        attemptId: authority.attemptId,
        paymentIntentId: pi.id,
        providerStatus: pi.status,
        outcome,
      });
    } else if (pi.status === "canceled") {
      attempts.push({
        attemptId: authority.attemptId,
        paymentIntentId: pi.id,
        providerStatus: pi.status,
        outcome: "retired",
      });
    } else if (pi.status === "processing") {
      attempts.push({
        attemptId: authority.attemptId,
        paymentIntentId: pi.id,
        providerStatus: pi.status,
        outcome: "awaiting_provider_terminal",
      });
    } else {
      throw new AutoTopupV1ReconcileError(
        `provider-only PaymentIntent ${pi.id} remains in unsupported/nonterminal status ${pi.status}`
      );
    }
  }
  const finalRollout = await db.transaction((tx) =>
    assertAutoTopupProtocolRecoveryReady(tx)
  );
  if (finalRollout.revision !== rolloutRevision) {
    throw new AutoTopupV1ReconcileError(
      "the drain was restarted during v1 provider reconciliation; run it again against the new fence"
    );
  }
  return {
    clear: attempts.every(
      (attempt) =>
        attempt.outcome !== "awaiting_provider_visibility" &&
        attempt.outcome !== "awaiting_provider_terminal"
    ),
    rolloutRevision,
    attempts,
  };
}
