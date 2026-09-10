// Phase 10b-1 Task 4 — the Stripe/local adapter behind `ExternalCommandPort`.
//
// The deletion executor stores every command BEFORE calling this adapter and
// records whatever it returns; this file therefore has exactly one job per
// kind: perform the provider action idempotently (the command id is the
// Stripe idempotency key) and classify the result honestly. `reconcile` is
// read-only at the provider and answers "did the effect land?" for a command
// whose first outcome was indeterminate.
//
// Facts pinned from the installed stripe@22.5.0 types
// (`cjs/resources/Subscriptions.d.ts`, `cjs/resources/Customers.d.ts`):
//   subscriptions.cancel(id, { prorate?: boolean; invoice_now?: boolean })
//   subscriptions.update(id, { cancel_at_period_end?: boolean })
//   customers.update(id, { name?, email?, phone?, description?: string;
//     address?: Emptyable<AddressParam>; shipping?: Emptyable<Shipping>;
//     metadata?: Emptyable<MetadataParam> })   // Emptyable<T> = T | ''
// The SDK types say '' empties an Emptyable field and unsets a string
// param; a LIVE proof against a real account is separate external evidence
// (10b-1 rollout) and is not claimed here.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  AUTO_TOPUP_DISARMED_FIELDS,
  autoTopupChargeAuthorityArmed,
  schema,
  type DbLike,
  type DeletionExternalCommand,
  type ExternalCommandPort,
  type ExternalCommandResult,
} from "@respin/db";
import type Stripe from "stripe";
import { IRREVERSIBLE_STATUSES } from "../state";
import { getStripe } from "./adapter";

type SubscriptionRow = Readonly<{
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  status: string;
  autoTopupEnabled: boolean;
  autoTopupV1Enabled: boolean;
  autoTopupRearmAfterUpgrade: boolean;
  autoTopupMonthlyCapCents: number | null;
}>;

/** The narrow client surface the adapter needs; tests inject a fake. */
export type DeletionStripeClient = Readonly<{
  subscriptions: Readonly<{
    update(id: string, params: Stripe.SubscriptionUpdateParams, options?: Stripe.RequestOptions): Promise<Stripe.Response<Stripe.Subscription>>;
    cancel(id: string, params?: Stripe.SubscriptionCancelParams, options?: Stripe.RequestOptions): Promise<Stripe.Response<Stripe.Subscription>>;
    retrieve(id: string): Promise<Stripe.Response<Stripe.Subscription>>;
  }>;
  customers: Readonly<{
    update(id: string, params: Stripe.CustomerUpdateParams, options?: Stripe.RequestOptions): Promise<Stripe.Response<Stripe.Customer>>;
    retrieve(id: string): Promise<Stripe.Response<Stripe.Customer | Stripe.DeletedCustomer>>;
  }>;
}>;

function isStripeError(error: unknown): error is { type?: string; code?: string; statusCode?: number } {
  return typeof error === "object" && error !== null && "type" in error;
}

/** Definitive-versus-indeterminate mapping of one provider exchange. */
function classifyStripeFailure(error: unknown): ExternalCommandResult {
  if (isStripeError(error)) {
    if (error.type === "StripeInvalidRequestError") {
      return error.code === "resource_missing"
        ? { outcome: "failed", failureCode: "provider_resource_missing" }
        : { outcome: "failed", failureCode: `provider_invalid_request:${error.code ?? "unknown"}` };
    }
    if (error.type === "StripeAuthenticationError" || error.type === "StripePermissionError") {
      return { outcome: "failed", failureCode: "provider_unauthorized" };
    }
    if (error.type === "StripeRateLimitError") {
      return { outcome: "failed", failureCode: "provider_rate_limited" };
    }
  }
  // Connection, timeout, 5xx, or anything unclassified: the provider may
  // have acted. Indeterminate.
  return { outcome: "unknown", reconciliationDigest: reconciliationDigest(error) };
}

function reconciliationDigest(seed: unknown): string {
  const text = typeof seed === "object" && seed !== null && "message" in seed
    ? String((seed as { message: unknown }).message)
    : String(seed);
  return createHash("sha256").update(`deletion-command-unknown:${text}`, "utf8").digest("hex");
}

async function subscriptionRow(db: DbLike, workspaceId: string): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select({
      stripeCustomerId: schema.subscriptions.stripeCustomerId,
      stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
      cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
      status: schema.subscriptions.status,
      autoTopupEnabled: schema.subscriptions.autoTopupEnabled,
      autoTopupV1Enabled: schema.subscriptions.autoTopupV1Enabled,
      autoTopupRearmAfterUpgrade: schema.subscriptions.autoTopupRearmAfterUpgrade,
      autoTopupMonthlyCapCents: schema.subscriptions.autoTopupMonthlyCapCents,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/**
 * Plan C3's Stripe customer PERSONAL-FIELD CLASS, in one place: every field a
 * person's details can land in on a Customer object. Two consumers share it so
 * they cannot disagree about what "personal" means: the workspace erasure
 * command below clears all of it (plus metadata, whose values may name a
 * person), and `acceptBillingContact` clears all of it and then writes the
 * accepting owner's email in place of the departing one. A list, not a
 * producer (CLAUDE.md Respin rule 7): a new personal field on the Stripe API
 * is an edit here.
 */
export const CUSTOMER_PERSONAL_FIELDS_CLEARED = {
  name: "",
  email: "",
  phone: "",
  description: "",
  address: "",
  shipping: "",
} as const satisfies Stripe.CustomerUpdateParams;

const CLEARED_CUSTOMER_FIELDS: Stripe.CustomerUpdateParams = {
  ...CUSTOMER_PERSONAL_FIELDS_CLEARED,
  metadata: "",
};

/**
 * The personal-field class (email aside) is clear on a customer object read
 * back from the provider. DERIVED from the list above rather than re-typed,
 * so a field added to the class is checked here without a second edit
 * (lean gate R-2). Stripe returns a cleared string field as "" or null and a
 * cleared object field (address, shipping) as null; both read as "empty".
 */
export function customerPersonalFieldsClear(customer: Stripe.Customer): boolean {
  return (Object.keys(CUSTOMER_PERSONAL_FIELDS_CLEARED) as (keyof typeof CUSTOMER_PERSONAL_FIELDS_CLEARED)[])
    .filter((field) => field !== "email")
    .every((field) => {
      const value = (customer as unknown as Record<string, unknown>)[field];
      return value === null || value === undefined || value === "";
    });
}

/**
 * Success condition of the fence: no field left that could authorise a
 * charge. An in-flight durable attempt is NOT cleared — under
 * `subscriptions_auto_topup_attempt_shape` a reserved attempt is always
 * already dispatched and claimed (proven in deletion-commands.test.ts), so
 * it may own a PaymentIntent and is settled by the v1 reconciler; disarming
 * the four authority fields stops every NEXT charge, which is the fence.
 */
function autoTopupDisarmed(row: SubscriptionRow): boolean {
  return !autoTopupChargeAuthorityArmed(row);
}

/** The live subscription id, or null when the effect is already the case (round-2 billing NOTE). */
function liveSubscriptionId(row: SubscriptionRow | null): string | null {
  if (!row?.stripeSubscriptionId || IRREVERSIBLE_STATUSES.has(row.status)) return null;
  return row.stripeSubscriptionId;
}

function customerIsClear(customer: Stripe.Customer | Stripe.DeletedCustomer): boolean {
  if (customer.deleted) return true;
  return customerPersonalFieldsClear(customer) && !customer.email
    && Object.keys(customer.metadata ?? {}).length === 0;
}

export function createStripeExternalCommandPort(
  db: DbLike,
  client: () => DeletionStripeClient = () => getStripe() as unknown as DeletionStripeClient
): ExternalCommandPort {
  const idempotency = (command: DeletionExternalCommand): Stripe.RequestOptions => ({
    idempotencyKey: `deletion:${command.id}:${command.attempt}`,
  });

  async function execute(command: DeletionExternalCommand): Promise<ExternalCommandResult> {
    if (!command.workspaceId) return { outcome: "failed", failureCode: "workspace_target_missing" };
    const row = await subscriptionRow(db, command.workspaceId);
    switch (command.kind) {
      case "auto_topup_disable": {
        // Local mirror only; this package owns `subscriptions` writes. Every
        // charge-authority field goes together (AUTO_TOPUP_DISARMED_FIELDS,
        // the same set the webhook's dead-subscription reset spreads): the v1
        // bit is the sole charge authority, the legacy bit is fenced off by
        // migration 0048, and the rearm desire would otherwise let the rollout
        // activator re-arm v1 (round-1 billing BLOCK: this wrote one flag).
        await db
          .update(schema.subscriptions)
          .set(AUTO_TOPUP_DISARMED_FIELDS)
          .where(eq(schema.subscriptions.workspaceId, command.workspaceId));
        return { outcome: "succeeded" };
      }
      case "stripe_subscription_cancel_at_period_end": {
        const subscriptionId = liveSubscriptionId(row);
        if (!subscriptionId) return { outcome: "succeeded" };
        try {
          const updated = await client().subscriptions.update(
            subscriptionId,
            { cancel_at_period_end: true },
            idempotency(command)
          );
          return { outcome: "succeeded", providerRef: updated.id };
        } catch (error) {
          return classifyStripeFailure(error);
        }
      }
      case "stripe_subscription_reopen": {
        const subscriptionId = liveSubscriptionId(row);
        if (!subscriptionId) return { outcome: "succeeded" };
        try {
          const updated = await client().subscriptions.update(
            subscriptionId,
            { cancel_at_period_end: false },
            idempotency(command)
          );
          return { outcome: "succeeded", providerRef: updated.id };
        } catch (error) {
          return classifyStripeFailure(error);
        }
      }
      case "stripe_subscription_cancel_now": {
        const subscriptionId = liveSubscriptionId(row);
        if (!subscriptionId) return { outcome: "succeeded" };
        try {
          // Plan C2: no proration, no final invoice, no implicit refund.
          const cancelled = await client().subscriptions.cancel(
            subscriptionId,
            { prorate: false, invoice_now: false },
            idempotency(command)
          );
          return { outcome: "succeeded", providerRef: cancelled.id };
        } catch (error) {
          const classified = classifyStripeFailure(error);
          // Already cancelled is the effect we wanted.
          return classified.outcome === "failed" && classified.failureCode === "provider_resource_missing"
            ? { outcome: "succeeded" }
            : classified;
        }
      }
      case "stripe_customer_personal_fields_clear": {
        if (!row?.stripeCustomerId) return { outcome: "succeeded" };
        try {
          const updated = await client().customers.update(row.stripeCustomerId, CLEARED_CUSTOMER_FIELDS, idempotency(command));
          return customerIsClear(updated)
            ? { outcome: "succeeded", providerRef: updated.id }
            : { outcome: "failed", failureCode: "customer_fields_not_cleared" };
        } catch (error) {
          return classifyStripeFailure(error);
        }
      }
      default:
        return { outcome: "failed", failureCode: "unsupported_command_kind" };
    }
  }

  async function reconcile(command: DeletionExternalCommand): Promise<ExternalCommandResult> {
    if (!command.workspaceId) return { outcome: "failed", failureCode: "workspace_target_missing" };
    const row = await subscriptionRow(db, command.workspaceId);
    try {
      switch (command.kind) {
        case "auto_topup_disable":
          return row === null || autoTopupDisarmed(row)
            ? { outcome: "succeeded" }
            : { outcome: "failed", failureCode: "not_applied" };
        case "stripe_subscription_cancel_at_period_end": {
          if (!row?.stripeSubscriptionId) return { outcome: "succeeded" };
          const current = await client().subscriptions.retrieve(row.stripeSubscriptionId);
          return current.cancel_at_period_end || current.status === "canceled"
            ? { outcome: "succeeded", providerRef: current.id }
            : { outcome: "failed", failureCode: "not_applied" };
        }
        case "stripe_subscription_reopen": {
          if (!row?.stripeSubscriptionId) return { outcome: "succeeded" };
          const current = await client().subscriptions.retrieve(row.stripeSubscriptionId);
          return !current.cancel_at_period_end || current.status === "canceled"
            ? { outcome: "succeeded", providerRef: current.id }
            : { outcome: "failed", failureCode: "not_applied" };
        }
        case "stripe_subscription_cancel_now": {
          if (!row?.stripeSubscriptionId) return { outcome: "succeeded" };
          const current = await client().subscriptions.retrieve(row.stripeSubscriptionId);
          return current.status === "canceled"
            ? { outcome: "succeeded", providerRef: current.id }
            : { outcome: "failed", failureCode: "not_applied" };
        }
        case "stripe_customer_personal_fields_clear": {
          if (!row?.stripeCustomerId) return { outcome: "succeeded" };
          const current = await client().customers.retrieve(row.stripeCustomerId);
          return customerIsClear(current)
            ? { outcome: "succeeded", providerRef: current.id }
            : { outcome: "failed", failureCode: "not_applied" };
        }
        default:
          return { outcome: "failed", failureCode: "unsupported_command_kind" };
      }
    } catch (error) {
      const classified = classifyStripeFailure(error);
      return classified.outcome === "failed" && classified.failureCode === "provider_resource_missing"
        ? { outcome: "succeeded" }
        : classified;
    }
  }

  return { execute, reconcile };
}
