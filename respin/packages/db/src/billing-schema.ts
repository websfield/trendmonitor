// M1 billing schema (tech-spec §2 as amended by R-20 / D-M1-1..8).
// Free tier is the ABSENCE of a subscriptions row (skill B6) — never a $0 price.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users, workspaces } from "./schema";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

// THE COLUMN DEFAULT IS `now()` = `transaction_timestamp()` — the instant the
// writing TRANSACTION BEGAN, not the instant of the write (round-10 BLOCK).
// Which tables may keep it, decided once for the whole class rather than per
// column, and audited rather than assumed:
//
//  - `credit_ledger.created_at`: NEVER. It IS the fold order (D-M1-7/D-M1-8), it
//    is compared against `pause_periods.started_at` to compute effective expiry,
//    and it bounds retroactive writes through `latestEventAt`. Every insert in
//    `packages/credits` stamps it explicitly from the clock its guards used, and
//    a source scan (credits/tests/ledger.test.ts) refuses a NEW mint path that
//    quietly takes this default — three mint paths were added during Phase 3
//    alone, so "remember to stamp it" is not a control.
//  - `pause_periods.started_at` / `ended_at`: not defaults at all — both are
//    caller-supplied, and both callers derive them from `getDbNow`
//    (`clock_timestamp`). `pause_periods.created_at`/`updated_at` ARE defaults
//    and may stay: no derivation reads them (the fold reads started_at/ended_at
//    only — checked by grep over packages/**, not assumed).
//  - `stripe_events.received_at`: may stay, and transaction-start is arguably
//    the RIGHT semantic here — the D-M1-1 single transaction begins when we
//    start handling the event, so that IS receipt. Nothing reads it, and
//    idempotency is the primary key, never a timestamp. `processed_at` is
//    already stamped from `getDbNow` at the end of the same transaction.
//  - `subscriptions.created_at`/`updated_at`: mirror bookkeeping; no derivation
//    reads either (the order guard uses `mirror_event_at`, which carries
//    Stripe's own `created`).
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

// Mutable MIRROR of Stripe state — sanctioned non-ledger state (D-M1-6).
// No `tier` column: tier is derived at read time from stripePriceId × the
// active config's stripePriceMap, so a config fix self-heals without replay.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    // R-122 / Task 6: the foreign key STAYS, and only its delete action moves
    // (cascade -> restrict). Dropping it entirely was the first attempt and it
    // was wrong: this key is not only a cascade, it is the structural refusal
    // of a cross-parented row, and `brain-schema.test.ts` proved the leak the
    // moment it went (Respin non-negotiable 5). A seven-year clock and a
    // CASCADE are what contradict each other; a seven-year clock and RESTRICT
    // do not. At erasure the `link` scrub rule repoints this column to the
    // "Deleted workspace" stub `lifecycle-sql-port.ts` already mints, so the
    // money row survives with referential integrity and no re-linkable id.
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    // Plan C3 (Phase 10b-1): the ONE active owner whose personal details the
    // Stripe customer carries. Set by the customer authority at creation to the
    // owner who started Checkout; moved only by `acceptBillingContact`, which
    // rewrites the provider copy FIRST. Identity deletion refuses while the
    // deleting person is this contact (or while it is unknown on a workspace
    // that has a customer), so no erasure can complete with their email still
    // on the customer object. NULL = unknown: pre-C3 rows are backfilled to
    // NULL and an owner must confirm the contact before any owner of that
    // workspace can delete their account. ON DELETE SET NULL, never cascade:
    // the row is a seven-year financial record and the link must simply go.
    // Workspace erasure nulls it through the `workspace_link` field set.
    billingContactUserId: uuid("billing_contact_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    status: text("status").notNull().default("none"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    graceExpiresAt: timestamp("grace_expires_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    resumesAt: timestamp("resumes_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    // The scheduled end of a subscription that is still LIVE. Both columns
    // exist because Stripe expresses one fact two ways and the evidence run
    // proved the boolean alone is not enough: cancelling through the Customer
    // Portal on api_version 2026-05-27.dahlia emitted
    // `{cancel_at: <ts>, cancel_at_period_end: FALSE, status: active}`, so a
    // mirror reading only the boolean stored "not cancelling" for a
    // subscription Stripe had already scheduled to end, and the billing page
    // told a paying creator nothing. The installed SDK documents `cancel_at`
    // as "a date in the future at which the subscription will automatically
    // get canceled" (stripe@22.5.0 resources/Subscriptions.d.ts:128-130) and
    // the boolean as "will (if status=active) or DID (if status=canceled)
    // cancel at the end of the current billing period" — different questions,
    // so both are mirrored and `scheduledCancelAt` (state.ts) is the ONE
    // reader that turns the pair into a date.
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    // Mixed-version Checkout fence. Migration 0049 rewrites every workspace
    // that is eligible to subscribe (and every later legacy insert) to an
    // `incomplete` sentinel that old binaries already interpret as LIVE. The
    // original dead/absent generation is retained here for v1 reconciliation.
    // Only a full subscription webhook removes the fence.
    tierCheckoutFenceAt: timestamp("tier_checkout_fence_at", {
      withTimezone: true,
    }),
    tierCheckoutFenceSubscriptionId: text(
      "tier_checkout_fence_subscription_id"
    ),
    tierCheckoutFenceStatus: text("tier_checkout_fence_status"),
    tierCheckoutFenceObservedSubscriptionId: text(
      "tier_checkout_fence_observed_subscription_id"
    ),
    // Immutable marker for the currently mirrored Stripe generation. The
    // pending attempt is cleared after the first full provider snapshot, but
    // later invoices must still know that this subscription was born under
    // signed v1 authority and may never downgrade to the legacy grant path.
    tierCheckoutGenerationAttemptId: uuid(
      "tier_checkout_generation_attempt_id"
    ),
    // One durable subscription-Checkout attempt per workspace and subscription
    // generation. Stripe's idempotency cache is explicitly time-bounded, so it
    // cannot be the only authority preventing a delayed/lost webhook from
    // opening a second subscription after that cache expires. These fields are
    // committed before provider dispatch and retained until a full subscription
    // snapshot advances the generation (or provider reconciliation proves the
    // abandoned Session expired without completing).
    tierCheckoutAttemptId: uuid("tier_checkout_attempt_id"),
    tierCheckoutAttemptTier: text("tier_checkout_attempt_tier"),
    tierCheckoutAttemptPriceId: text("tier_checkout_attempt_price_id"),
    tierCheckoutAttemptCustomerId: text("tier_checkout_attempt_customer_id"),
    tierCheckoutAttemptSubscriptionGeneration: text(
      "tier_checkout_attempt_subscription_generation"
    ),
    tierCheckoutAttemptIdempotencyKey: text(
      "tier_checkout_attempt_idempotency_key"
    ),
    tierCheckoutAttemptSessionId: text("tier_checkout_attempt_session_id"),
    tierCheckoutAttemptSubscriptionId: text(
      "tier_checkout_attempt_subscription_id"
    ),
    tierCheckoutAttemptStripeAccountId: text(
      "tier_checkout_attempt_stripe_account_id"
    ),
    tierCheckoutAttemptStripeLivemode: boolean(
      "tier_checkout_attempt_stripe_livemode"
    ),
    tierCheckoutAttemptAuthority: jsonb("tier_checkout_attempt_authority"),
    tierCheckoutAttemptReservedAt: timestamp("tier_checkout_attempt_reserved_at", {
      withTimezone: true,
    }),
    // Legacy protocol-0 flag. Migration 0048 permanently fences this column
    // OFF so a migrate-first deploy or rollback cannot route an off-session
    // charge through code that does not reserve durable attempt authority.
    autoTopupEnabled: boolean("auto_topup_enabled").notNull().default(false),
    // Sole charge authority for the durable protocol. Keeping it physically
    // separate from the legacy flag is what makes mixed-build rollout safe:
    // old binaries cannot observe or mutate this bit.
    autoTopupV1Enabled: boolean("auto_topup_v1_enabled")
      .notNull()
      .default(false),
    autoTopupMonthlyCapCents: integer("auto_topup_monthly_cap_cents"),
    autoTopupProtocolVersion: integer("auto_topup_protocol_version")
      .notNull()
      .default(0),
    // Desired opt-in while the fleet is between expansion and activation. It
    // is never a charge authority; the rollout activator moves it to the v1
    // bit only after fleet quiescence and complete provider reconciliation.
    autoTopupRearmAfterUpgrade: boolean("auto_topup_rearm_after_upgrade")
      .notNull()
      .default(false),
    // Persisted cutover for the pre-attempt auto-top-up protocol. A verified
    // Stripe PI without `respin_attempt_id` is legacy only when Stripe created
    // it no later than this row's cutover; a rolling time window would leave a
    // permanent metadata-bypass mint path.
    autoTopupAttemptCutoverAt: timestamp("auto_topup_attempt_cutover_at", {
      withTimezone: true,
    }),
    // One durable, fail-closed off-session attempt per workspace. The complete
    // pack/price authority is reserved before provider dispatch so a retry,
    // delayed webhook, UTC rollover, or config edit cannot change either the
    // charge or the credits it mints. Null means no unresolved attempt.
    autoTopupAttemptId: uuid("auto_topup_attempt_id"),
    autoTopupAttemptPeriodMonthUtc: text("auto_topup_attempt_period_month_utc"),
    autoTopupAttemptOrdinal: integer("auto_topup_attempt_ordinal"),
    autoTopupAttemptIdempotencyKey: text("auto_topup_attempt_idempotency_key"),
    autoTopupAttemptAmountCents: integer("auto_topup_attempt_amount_cents"),
    autoTopupAttemptCurrency: text("auto_topup_attempt_currency"),
    autoTopupAttemptPriceId: text("auto_topup_attempt_price_id"),
    autoTopupAttemptCredits: integer("auto_topup_attempt_credits"),
    autoTopupAttemptValidityMonths: integer("auto_topup_attempt_validity_months"),
    autoTopupAttemptConfigVersion: integer("auto_topup_attempt_config_version"),
    autoTopupAttemptCustomerId: text("auto_topup_attempt_customer_id"),
    autoTopupAttemptPaymentIntentId: text("auto_topup_attempt_payment_intent_id"),
    autoTopupAttemptPaymentIntentStatus: text(
      "auto_topup_attempt_payment_intent_status"
    ),
    autoTopupAttemptClaimId: uuid("auto_topup_attempt_claim_id"),
    autoTopupAttemptClaimedAt: timestamp("auto_topup_attempt_claimed_at", {
      withTimezone: true,
    }),
    // Written and committed before the first provider mutation. If the network
    // outcome is unknown, this marker forces a provider reconciliation before
    // any same-key retry and permanently fences re-creation after Stripe's
    // idempotency retention window.
    autoTopupAttemptDispatchedAt: timestamp("auto_topup_attempt_dispatched_at", {
      withTimezone: true,
    }),
    autoTopupAttemptReservedAt: timestamp("auto_topup_attempt_reserved_at", {
      withTimezone: true,
    }),
    // Stripe does not guarantee webhook delivery ORDER. This records the
    // `created` timestamp of the newest subscription event already applied to
    // this mirror; a stale event is ignored rather than overwriting newer
    // state (billing code-review CHANGE: order-blind mirror writes).
    mirrorEventAt: timestamp("mirror_event_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("subscriptions_workspace_uq").on(t.workspaceId),
    uniqueIndex("subscriptions_customer_uq").on(t.stripeCustomerId),
    uniqueIndex("subscriptions_subscription_uq").on(t.stripeSubscriptionId),
    uniqueIndex("subscriptions_tier_checkout_attempt_uq").on(
      t.tierCheckoutAttemptId
    ),
    uniqueIndex("subscriptions_tier_checkout_attempt_key_uq").on(
      t.tierCheckoutAttemptIdempotencyKey
    ),
    uniqueIndex("subscriptions_tier_checkout_attempt_session_uq").on(
      t.tierCheckoutAttemptSessionId
    ),
    uniqueIndex("subscriptions_auto_topup_attempt_uq").on(t.autoTopupAttemptId),
    uniqueIndex("subscriptions_auto_topup_attempt_key_uq").on(
      t.autoTopupAttemptIdempotencyKey
    ),
    uniqueIndex("subscriptions_auto_topup_attempt_pi_uq").on(
      t.autoTopupAttemptPaymentIntentId
    ),
    check(
      "subscriptions_tier_checkout_attempt_shape",
      sql`((
        ${t.tierCheckoutAttemptId} IS NULL
        AND ${t.tierCheckoutAttemptTier} IS NULL
        AND ${t.tierCheckoutAttemptPriceId} IS NULL
        AND ${t.tierCheckoutAttemptCustomerId} IS NULL
        AND ${t.tierCheckoutAttemptSubscriptionGeneration} IS NULL
        AND ${t.tierCheckoutAttemptIdempotencyKey} IS NULL
        AND ${t.tierCheckoutAttemptSessionId} IS NULL
        AND ${t.tierCheckoutAttemptSubscriptionId} IS NULL
        AND ${t.tierCheckoutAttemptStripeAccountId} IS NULL
        AND ${t.tierCheckoutAttemptStripeLivemode} IS NULL
        AND ${t.tierCheckoutAttemptAuthority} IS NULL
        AND ${t.tierCheckoutAttemptReservedAt} IS NULL
      ) OR (
        ${t.tierCheckoutAttemptId} IS NOT NULL
        AND ${t.tierCheckoutAttemptTier} IN ('creator', 'pro', 'studio')
        AND ${t.tierCheckoutAttemptPriceId} IS NOT NULL
        AND ${t.tierCheckoutAttemptCustomerId} IS NOT NULL
        AND ${t.tierCheckoutAttemptIdempotencyKey} =
          'checkout:v1:' || ${t.workspaceId}::text || ':' || ${t.tierCheckoutAttemptId}::text
        AND (
          ${t.tierCheckoutAttemptSessionId} IS NULL
          OR ${t.tierCheckoutAttemptSessionId} ~ '^cs_[A-Za-z0-9_]+$'
        )
        AND (
          ${t.tierCheckoutAttemptSubscriptionId} IS NULL
          OR ${t.tierCheckoutAttemptSubscriptionId} ~ '^sub_[A-Za-z0-9_]+$'
        )
        AND ${t.tierCheckoutAttemptStripeAccountId} ~ '^acct_[A-Za-z0-9]+$'
        AND ${t.tierCheckoutAttemptStripeLivemode} IS NOT NULL
        AND jsonb_typeof(${t.tierCheckoutAttemptAuthority}) = 'object'
        AND ${t.tierCheckoutAttemptReservedAt} IS NOT NULL
        AND ${t.tierCheckoutFenceAt} IS NOT NULL
      )) IS TRUE`
    ),
    check(
      "subscriptions_tier_checkout_fence_shape",
      sql`((
        ${t.tierCheckoutFenceAt} IS NULL
        AND ${t.tierCheckoutFenceSubscriptionId} IS NULL
        AND ${t.tierCheckoutFenceStatus} IS NULL
        AND ${t.tierCheckoutFenceObservedSubscriptionId} IS NULL
      ) OR (
        ${t.tierCheckoutFenceAt} IS NOT NULL
        AND ${t.tierCheckoutFenceStatus} IS NOT NULL
        AND (
          (
            ${t.tierCheckoutFenceObservedSubscriptionId} IS NULL
            AND ${t.stripeSubscriptionId} =
              'checkout_fence:' || ${t.workspaceId}::text
          ) OR (
            ${t.tierCheckoutFenceObservedSubscriptionId} ~ '^sub_[A-Za-z0-9_]+$'
            AND ${t.stripeSubscriptionId} =
              ${t.tierCheckoutFenceObservedSubscriptionId}
          )
        )
        AND ${t.status} = 'incomplete'
      )) IS TRUE`
    ),
    check(
      "subscriptions_tier_checkout_generation_shape",
      sql`((${t.tierCheckoutGenerationAttemptId} IS NULL) OR (
        ${t.stripeSubscriptionId} ~ '^sub_[A-Za-z0-9_]+$'
        OR ${t.tierCheckoutFenceSubscriptionId} ~ '^sub_[A-Za-z0-9_]+$'
      )) IS TRUE`
    ),
    check(
      "subscriptions_auto_topup_attempt_shape",
      sql`((
        ${t.autoTopupAttemptId} IS NULL
        AND ${t.autoTopupAttemptPeriodMonthUtc} IS NULL
        AND ${t.autoTopupAttemptOrdinal} IS NULL
        AND ${t.autoTopupAttemptIdempotencyKey} IS NULL
        AND ${t.autoTopupAttemptAmountCents} IS NULL
        AND ${t.autoTopupAttemptCurrency} IS NULL
        AND ${t.autoTopupAttemptPriceId} IS NULL
        AND ${t.autoTopupAttemptCredits} IS NULL
        AND ${t.autoTopupAttemptValidityMonths} IS NULL
        AND ${t.autoTopupAttemptConfigVersion} IS NULL
        AND ${t.autoTopupAttemptCustomerId} IS NULL
        AND ${t.autoTopupAttemptPaymentIntentId} IS NULL
        AND ${t.autoTopupAttemptPaymentIntentStatus} IS NULL
        AND ${t.autoTopupAttemptClaimId} IS NULL
        AND ${t.autoTopupAttemptClaimedAt} IS NULL
        AND ${t.autoTopupAttemptDispatchedAt} IS NULL
        AND ${t.autoTopupAttemptReservedAt} IS NULL
      ) OR (
        ${t.autoTopupAttemptId} IS NOT NULL
        AND ${t.autoTopupAttemptPeriodMonthUtc} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND ${t.autoTopupAttemptOrdinal} > 0
        AND ${t.autoTopupAttemptIdempotencyKey} IS NOT NULL
        AND ${t.autoTopupAttemptAmountCents} > 0
        AND ${t.autoTopupAttemptCurrency} = 'usd'
        AND ${t.autoTopupAttemptPriceId} IS NOT NULL
        AND ${t.autoTopupAttemptCredits} > 0
        AND ${t.autoTopupAttemptValidityMonths} > 0
        AND ${t.autoTopupAttemptConfigVersion} > 0
        AND ${t.autoTopupAttemptCustomerId} IS NOT NULL
        AND (
          (
            ${t.autoTopupAttemptPaymentIntentId} IS NULL
            AND ${t.autoTopupAttemptPaymentIntentStatus} IS NULL
          ) OR (
            ${t.autoTopupAttemptPaymentIntentId} IS NOT NULL
            AND ${t.autoTopupAttemptPaymentIntentStatus} IN (
              'requires_payment_method',
              'requires_confirmation',
              'requires_action',
              'processing',
              'requires_capture',
              'succeeded'
            )
          )
        )
        AND ${t.autoTopupAttemptReservedAt} IS NOT NULL
        AND ${t.autoTopupAttemptDispatchedAt} >= ${t.autoTopupAttemptReservedAt}
        AND ${t.autoTopupAttemptClaimId} IS NOT NULL
        AND ${t.autoTopupAttemptClaimedAt} >= ${t.autoTopupAttemptDispatchedAt}
      )) IS TRUE`
    ),
    check(
      "subscriptions_auto_topup_protocol_version",
      sql`${t.autoTopupProtocolVersion} IN (0, 1)`
    ),
    check(
      "subscriptions_auto_topup_protocol_shape",
      sql`((
        ${t.autoTopupProtocolVersion} = 0
        AND NOT ${t.autoTopupV1Enabled}
        AND ${t.autoTopupAttemptCutoverAt} IS NULL
      ) OR (
        ${t.autoTopupProtocolVersion} = 1
        AND ${t.autoTopupAttemptCutoverAt} IS NOT NULL
      )) IS TRUE`
    ),
  ]
);

// One global, durable proof chain for the protocol-0 -> durable-attempt
// rollout. Expansion is migrate-first compatible. Draining is entered only
// after the old fleet is quiescent; activation requires a complete paginated
// Stripe reconciliation and is serialized against subscription/ledger writers.
export const autoTopupProtocolRollouts = pgTable(
  "auto_topup_protocol_rollouts",
  {
    protocol: text("protocol").primaryKey(),
    state: text("state").notNull().default("expanded"),
    revision: integer("revision").notNull().default(0),
    fleetQuiescedAt: timestamp("fleet_quiesced_at", { withTimezone: true }),
    drainStartedAt: timestamp("drain_started_at", { withTimezone: true }),
    providerReconciledAt: timestamp("provider_reconciled_at", {
      withTimezone: true,
    }),
    reconciledCustomers: integer("reconciled_customers"),
    reconciledPaymentIntents: integer("reconciled_payment_intents"),
    // Non-secret binding for the immutable HMAC key used by provider-carried
    // restore authority. A same-id key change must fail before another charge.
    authorityKeyId: text("authority_key_id"),
    authorityKeyFingerprint: text("authority_key_fingerprint"),
    stripeAccountId: text("stripe_account_id"),
    stripeLivemode: boolean("stripe_livemode"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("auto_topup_protocol_rollouts_protocol", sql`${t.protocol} = 'v1'`),
    check(
      "auto_topup_protocol_rollouts_state",
      sql`${t.state} IN ('expanded','draining','active')`
    ),
    check(
      "auto_topup_protocol_rollouts_shape",
      sql`((
        ${t.state} = 'expanded'
        AND ${t.revision} = 0
        AND ${t.fleetQuiescedAt} IS NULL
        AND ${t.drainStartedAt} IS NULL
        AND ${t.providerReconciledAt} IS NULL
        AND ${t.reconciledCustomers} IS NULL
        AND ${t.reconciledPaymentIntents} IS NULL
        AND ${t.authorityKeyId} IS NULL
        AND ${t.authorityKeyFingerprint} IS NULL
        AND ${t.stripeAccountId} IS NULL
        AND ${t.stripeLivemode} IS NULL
        AND ${t.activatedAt} IS NULL
      ) OR (
        ${t.state} = 'draining'
        AND ${t.revision} > 0
        AND ${t.fleetQuiescedAt} IS NOT NULL
        AND ${t.drainStartedAt} IS NOT NULL
        AND ${t.fleetQuiescedAt} <= ${t.drainStartedAt}
        AND ${t.authorityKeyId} = 'v1'
        AND ${t.authorityKeyFingerprint} ~ '^sha256:[0-9a-f]{64}$'
        AND ${t.stripeAccountId} ~ '^acct_[A-Za-z0-9]+$'
        AND ${t.stripeLivemode} IS NOT NULL
        AND (
          (
            ${t.providerReconciledAt} IS NULL
            AND ${t.reconciledCustomers} IS NULL
            AND ${t.reconciledPaymentIntents} IS NULL
          ) OR (
            ${t.providerReconciledAt} IS NOT NULL
            AND ${t.drainStartedAt} <= ${t.providerReconciledAt}
            AND ${t.reconciledCustomers} >= 0
            AND ${t.reconciledPaymentIntents} >= 0
          )
        )
        AND ${t.activatedAt} IS NULL
      ) OR (
        ${t.state} = 'active'
        AND ${t.revision} > 0
        AND ${t.fleetQuiescedAt} IS NOT NULL
        AND ${t.drainStartedAt} IS NOT NULL
        AND ${t.providerReconciledAt} IS NOT NULL
        AND ${t.fleetQuiescedAt} <= ${t.drainStartedAt}
        AND ${t.drainStartedAt} <= ${t.providerReconciledAt}
        AND ${t.reconciledCustomers} >= 0
        AND ${t.reconciledPaymentIntents} >= 0
        AND ${t.authorityKeyId} = 'v1'
        AND ${t.authorityKeyFingerprint} ~ '^sha256:[0-9a-f]{64}$'
        AND ${t.stripeAccountId} ~ '^acct_[A-Za-z0-9]+$'
        AND ${t.stripeLivemode} IS NOT NULL
        AND ${t.activatedAt} IS NOT NULL
        AND ${t.providerReconciledAt} <= ${t.activatedAt}
      )) IS TRUE`
    ),
  ]
);

// One global, durable proof chain for the legacy tier-Checkout -> durable
// attempt rollout. Expansion alone never authorizes a v1 Session create.
// Activation requires an operator-asserted fleet stop, a database-authored
// quiescence window, and a complete account-wide Stripe Session audit.
export const tierCheckoutProtocolRollouts = pgTable(
  "tier_checkout_protocol_rollouts",
  {
    protocol: text("protocol").primaryKey(),
    state: text("state").notNull().default("expanded"),
    revision: integer("revision").notNull().default(0),
    fleetQuiescedAt: timestamp("fleet_quiesced_at", { withTimezone: true }),
    drainStartedAt: timestamp("drain_started_at", { withTimezone: true }),
    providerReconciledAt: timestamp("provider_reconciled_at", {
      withTimezone: true,
    }),
    reconciledCustomers: integer("reconciled_customers"),
    reconciledSessions: integer("reconciled_sessions"),
    stripeAccountId: text("stripe_account_id"),
    stripeLivemode: boolean("stripe_livemode"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "tier_checkout_protocol_rollouts_protocol",
      sql`${t.protocol} = 'v1'`
    ),
    check(
      "tier_checkout_protocol_rollouts_state",
      sql`${t.state} IN ('expanded','draining','active')`
    ),
    check(
      "tier_checkout_protocol_rollouts_shape",
      sql`((
        ${t.state} = 'expanded'
        AND ${t.revision} = 0
        AND ${t.fleetQuiescedAt} IS NULL
        AND ${t.drainStartedAt} IS NULL
        AND ${t.providerReconciledAt} IS NULL
        AND ${t.reconciledCustomers} IS NULL
        AND ${t.reconciledSessions} IS NULL
        AND ${t.stripeAccountId} IS NULL
        AND ${t.stripeLivemode} IS NULL
        AND ${t.activatedAt} IS NULL
      ) OR (
        ${t.state} = 'draining'
        AND ${t.revision} > 0
        AND ${t.fleetQuiescedAt} IS NOT NULL
        AND ${t.drainStartedAt} IS NOT NULL
        AND ${t.fleetQuiescedAt} <= ${t.drainStartedAt}
        AND ${t.stripeAccountId} ~ '^acct_[A-Za-z0-9]+$'
        AND ${t.stripeLivemode} IS NOT NULL
        AND (
          (
            ${t.providerReconciledAt} IS NULL
            AND ${t.reconciledCustomers} IS NULL
            AND ${t.reconciledSessions} IS NULL
          ) OR (
            ${t.providerReconciledAt} IS NOT NULL
            AND ${t.drainStartedAt} <= ${t.providerReconciledAt}
            AND ${t.reconciledCustomers} >= 0
            AND ${t.reconciledSessions} >= 0
          )
        )
        AND ${t.activatedAt} IS NULL
      ) OR (
        ${t.state} = 'active'
        AND ${t.revision} > 0
        AND ${t.fleetQuiescedAt} IS NOT NULL
        AND ${t.drainStartedAt} IS NOT NULL
        AND ${t.providerReconciledAt} IS NOT NULL
        AND ${t.fleetQuiescedAt} <= ${t.drainStartedAt}
        AND ${t.drainStartedAt} <= ${t.providerReconciledAt}
        AND ${t.reconciledCustomers} >= 0
        AND ${t.reconciledSessions} >= 0
        AND ${t.stripeAccountId} ~ '^acct_[A-Za-z0-9]+$'
        AND ${t.stripeLivemode} IS NOT NULL
        AND ${t.activatedAt} IS NOT NULL
        AND ${t.providerReconciledAt} <= ${t.activatedAt}
      )) IS TRUE`
    ),
  ]
);

export const creditKind = pgEnum("credit_kind", [
  "grant",
  "pack",
  "debit",
  "refund",
  "adjust",
  "expiry",
]);

// Immutable receipt-time attribution. This survives workspace FK detachment,
// so a retained audit row never becomes indistinguishable from an event that
// was genuinely unattributed when received.
export const stripeReceiptAttribution = pgEnum("stripe_receipt_attribution", [
  "workspace_attributed",
  "customer_attributed",
  "unattributed",
]);

// APPEND-ONLY (non-negotiable 2 / B1): no updatedAt — rows are never updated.
// Balance is the D-M1-7 lot-allocation fold; never a stored counter.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id(),
    // R-122 / Task 6: the foreign key STAYS, and only its delete action moves
    // (cascade -> restrict). Dropping it entirely was the first attempt and it
    // was wrong: this key is not only a cascade, it is the structural refusal
    // of a cross-parented row, and `brain-schema.test.ts` proved the leak the
    // moment it went (Respin non-negotiable 5). A seven-year clock and a
    // CASCADE are what contradict each other; a seven-year clock and RESTRICT
    // do not. At erasure the `link` scrub rule repoints this column to the
    // "Deleted workspace" stub `lifecycle-sql-port.ts` already mints, so the
    // money row survives with referential integrity and no re-linkable id.
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    kind: creditKind("kind").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    reasonCode: text("reason_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Money attribution for PURCHASED lots (packs, auto-top-ups): feeds the
    // auto-top-up monthly cap (in real cents) and the M6 margin rollup.
    amountCents: integer("amount_cents"),
    // The config version that priced a config-priced row (grants, auto-top-ups).
    configVersion: integer("config_version"),
    // Auto-top-up cap attribution is the DB-authoritative initiation month,
    // not webhook arrival time. The attempt id binds the ledger mint to the
    // durable reservation whose exact config/price authority it consumed.
    autoTopupAttemptId: uuid("auto_topup_attempt_id"),
    autoTopupPeriodMonthUtc: text("auto_topup_period_month_utc"),
    // Signed manual-pack protocol identity. Migration 0049's receipt guard
    // requires this to match provider metadata, fencing rolled-back webhooks.
    packCheckoutAttemptId: uuid("pack_checkout_attempt_id"),
    tierCheckoutAttemptId: uuid("tier_checkout_attempt_id"),
    stripeEventId: text("stripe_event_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("credit_ledger_stripe_event_uq").on(t.stripeEventId),
    // D-M1-7 idempotent lazy expiry materialization: one expiry row per lot.
    // Phase-2 handoff pin: an expiry row's ref_id is ALWAYS the consumed lot's
    // ledger uuid (globally unique), which is why this index needs no
    // workspace_id — a cross-workspace collision is a writer defect that
    // fails closed here, never a retry.
    uniqueIndex("credit_ledger_expiry_lot_uq")
      .on(t.kind, t.refId)
      .where(sql`${t.kind} = 'expiry'`),
    // ONE pack per Checkout session, whatever the event id (code-review
    // BLOCK). Stripe can drive a session's fulfilment from more than one
    // event — `checkout.session.completed` and
    // `checkout.session.async_payment_succeeded` carry DIFFERENT event ids, so
    // credit_ledger_stripe_event_uq cannot dedupe them and the session minted
    // twice. Stripe's own fulfilment guidance is that a session's handler must
    // be idempotent PER SESSION; the handler pre-checks, and this index is the
    // guarantee under concurrency.
    //
    // Deliberately NOT workspace-keyed, for the same reason as
    // credit_ledger_expiry_lot_uq above: a Stripe Checkout session id is
    // globally unique and belongs to exactly one customer, hence exactly one
    // workspace. Two workspaces claiming one session id is a writer defect (or
    // a forged payload) and must fail closed here rather than mint twice — so
    // the global scope IS the guarantee, not an oversight. The handler's
    // pre-check is still workspace-scoped: this index is what holds under
    // concurrency, the pre-check is what makes the ordinary second event
    // converge quietly.
    uniqueIndex("credit_ledger_checkout_session_uq")
      .on(t.refType, t.refId)
      .where(sql`${t.refType} = 'checkout_session'`),
    // ONE monthly allowance per INVOICE, symmetric with the session rule
    // above (code-review CHANGE). Round 3 learned "one mint per business
    // object, not per event id" and applied it to Checkout only; a grant still
    // leaned solely on the event-id unique, so any second event id carrying
    // the same invoice minted a second allowance. Same global-scope reasoning:
    // an invoice id is globally unique and belongs to one customer.
    uniqueIndex("credit_ledger_invoice_grant_uq")
      .on(t.refType, t.refId)
      .where(sql`${t.refType} = 'invoice'`),
    // ONE pack per PAYMENT INTENT — the third and last mint path, which had
    // been left leaning on credit_ledger_stripe_event_uq alone while its two
    // siblings above each got a business-object unique (billing review finding
    // 2). Every path that turns a Stripe object into credits now has one, so
    // the rule "one mint per business object, not per event id" is structural
    // for all three rather than for the two that were reported. Same
    // global-scope reasoning as the siblings: a PaymentIntent id is globally
    // unique and belongs to exactly one customer, hence one workspace, so two
    // workspaces claiming one PI is a writer defect that must fail closed here
    // rather than mint twice.
    uniqueIndex("credit_ledger_auto_topup_uq")
      .on(t.refType, t.refId)
      .where(sql`${t.refType} = 'auto_topup'`),
    uniqueIndex("credit_ledger_auto_topup_attempt_uq")
      .on(t.autoTopupAttemptId)
      .where(sql`${t.autoTopupAttemptId} IS NOT NULL`),
    uniqueIndex("credit_ledger_pack_checkout_attempt_uq")
      .on(t.packCheckoutAttemptId)
      .where(sql`${t.packCheckoutAttemptId} IS NOT NULL`),
    // AT MOST ONE DEBIT PER INFERENCE ATTEMPT (R12, slice 2a). The fourth
    // partial unique on this pair, and the first one guarding a SPEND rather
    // than a mint.
    //
    // SETTLED IN THE SCHEMA, NOT IN APPLICATION CODE, and that distinction is
    // the requirement. `runInference` writes `model_usage` in its own
    // committed transaction and debits AFTERWARDS (the A-7 settlement-tail
    // order), so a crash, a redeploy or a user's second click between those
    // two commits leaves an attempt recorded and unbilled — which is exactly
    // when something retries the debit. An application-level "have we already
    // debited this attempt?" read is a read-then-write on a table with no
    // constraint behind it: two connections both read "no" and both insert,
    // and the creator is charged twice for one call with no way to tell from
    // the ledger which row was the duplicate.
    //
    // `ref_id` is the `attempt_id` and `ref_type` is the literal 'inference'.
    // Global rather than per-workspace scope, for the same reason as the three
    // siblings above: an attempt id is minted per attempt and belongs to
    // exactly one workspace, so two workspaces claiming one attempt is a
    // writer defect that must fail closed rather than debit twice.
    uniqueIndex("credit_ledger_inference_debit_uq")
      .on(t.refType, t.refId)
      .where(sql`${t.refType} = 'inference'`),
    // ONE FREE-TIER ALLOWANCE PER WORKSPACE PER CALENDAR MONTH (R17, slice 6).
    // The sixth partial unique on this table, and the FIRST one that is
    // WORKSPACE-KEYED — which is the whole reason it needs its own paragraph
    // rather than a copy of a sibling's.
    //
    // SETTLED IN THE SCHEMA, NOT IN APPLICATION CODE, for exactly the reason
    // `credit_ledger_inference_debit_uq` states three indexes up. The Free
    // grant is to be minted LAZILY at balance-derivation time (the mechanism
    // R-20 already chose for expiry), so an application-level "have we granted
    // this month?" read would be a read-then-write on a table with no
    // constraint behind it: two connections both read no, both insert, and a
    // Free workspace gets 50 credits for a month it is entitled to 25. That
    // doubling was measured against this schema with the index dropped, which
    // is why the index is here BEFORE the writer is.
    //
    // NO WRITER EXISTS YET, and this sentence is the honest form of the one
    // above: nothing in `packages/**` or `app/**` inserts a `free_allowance`
    // row today. `balance.ts` owns the mint — which tiers may mint (a
    // Free-only rule this index cannot express) and the end-of-month
    // `expires_at` that gives Free its no-rollover semantics through the
    // ordinary lot fold — and that is a later stage of slice 6.
    //
    // `(workspace_id, ref_id)` AND NOT `(ref_type, ref_id)`, and the departure
    // from the five siblings is the point rather than an inconsistency. Every
    // sibling keys on a STRIPE object id — an invoice, a Checkout session, a
    // PaymentIntent, a ledger lot uuid — each globally unique and belonging to
    // exactly one customer, so a global index is a guarantee. `ref_id` here is
    // the PERIOD KEY (`yyyy-MM`, UTC calendar month — the same string
    // `packages/credits/src/stripe/auto-topup.ts` builds for its per-month
    // idempotency key), and every workspace on the platform mints '2026-08'. A
    // global index would let the FIRST Free workspace to derive a balance in a
    // month take that key and refuse the grant to every other workspace for
    // the rest of the month — the same index shape, one column short, is a
    // platform-wide outage instead of a guarantee.
    uniqueIndex("credit_ledger_free_allowance_uq")
      .on(t.workspaceId, t.refId)
      .where(sql`${t.refType} = 'free_allowance'`),
    // ONE DEBIT AND ONE REFUND PER AUTOPSY CLAIM (slice 8c R8/R9, R-98). The
    // seventh and eighth partial uniques on this table, and the FIRST PAIR: a
    // creator-paid autopsy is the ledger's first COMPENSATED spend, so it has
    // two ref types over one business object rather than one.
    //
    // SETTLED IN THE SCHEMA, NOT IN APPLICATION CODE, for the reason
    // `credit_ledger_inference_debit_uq` states in full above. Both writers
    // read before they write — `submitPastedReference` looks the claim's debit
    // up (`autopsyClaimDebit`) before debiting, and `settleParkedAutopsies`
    // looks the refund up before crediting — and both reads are inside the
    // WORKSPACE ADVISORY LOCK, which is what serialises them today. That lock
    // is a real proof (`pasted-reference.docker.test.ts` races two of each),
    // but it is an application convention: a future writer that forgets to
    // take it, or a repair script run by hand, is a read-then-write on a table
    // with no constraint behind it. Two connections both read "no refund yet"
    // and both credit, and a creator is paid back twice for one parked
    // autopsy — a mint out of nothing, which is the one direction the ledger
    // must never fail in.
    //
    // `(ref_type, ref_id)` GLOBALLY, like the five Stripe-object siblings and
    // unlike `credit_ledger_free_allowance_uq`: `ref_id` is an
    // `autopsy_cache_claims` uuid, minted per claim and belonging to exactly
    // one workspace, so two workspaces claiming one is a writer defect that
    // must fail closed here rather than debit or refund twice. It is NOT a
    // period key, which is the property that forced the free-allowance index
    // to carry `workspace_id`.
    uniqueIndex("credit_ledger_autopsy_claim_uq")
      .on(t.refType, t.refId)
      .where(sql`${t.refType} = 'autopsy_claim'`),
    uniqueIndex("credit_ledger_autopsy_refund_uq")
      .on(t.refType, t.refId)
      .where(sql`${t.refType} = 'autopsy_refund'`),
    check("credit_ledger_delta_nonzero", sql`${t.delta} <> 0`),
    check(
      "credit_ledger_delta_sign",
      sql`(${t.kind} IN ('grant','pack','refund') AND ${t.delta} > 0)
          OR (${t.kind} IN ('debit','expiry') AND ${t.delta} < 0)
          OR (${t.kind} = 'adjust')`
    ),
    check(
      "credit_ledger_adjust_reason",
      sql`${t.kind} <> 'adjust' OR ${t.reasonCode} IS NOT NULL`
    ),
    // Review round 1: make the D-M1-7 invariants structural, not prose.
    // An expiry row must name its lot (NULLs would bypass the partial unique).
    check(
      "credit_ledger_expiry_ref",
      sql`${t.kind} <> 'expiry' OR ${t.refId} IS NOT NULL`
    ),
    // grant/pack/refund lots always carry an expiry (nullable only for adjust).
    check(
      "credit_ledger_lot_expiry",
      sql`${t.kind} NOT IN ('grant','pack','refund') OR ${t.expiresAt} IS NOT NULL`
    ),
    // A FREE ALLOWANCE MUST NAME ITS PERIOD — the same sentence
    // `credit_ledger_expiry_ref` two checks up already carries for its own
    // partial unique, and for the same measured reason: NULLs are DISTINCT in
    // a unique index, so a `free_allowance` row with a NULL `ref_id` slips
    // past `credit_ledger_free_allowance_uq` entirely and every balance read
    // that month mints another 25 credits. Without this the index is
    // idempotency-unless-the-writer-forgets, which is the shape R17 exists to
    // refuse. `IS DISTINCT FROM` rather than `<>` because a CHECK passes when
    // its expression is NULL, and `NULL <> 'free_allowance'` is NULL.
    check(
      "credit_ledger_free_allowance_ref",
      sql`${t.refType} IS DISTINCT FROM 'free_allowance' OR ${t.refId} IS NOT NULL`
    ),
    // AN AUTOPSY DEBIT OR REFUND MUST NAME ITS CLAIM — the third instance of
    // the sentence `credit_ledger_expiry_ref` and `credit_ledger_free_allowance_ref`
    // already carry, for the identical measured reason: NULLs are DISTINCT in a
    // unique index, so a row with a NULL `ref_id` slips past
    // `credit_ledger_autopsy_claim_uq` / `…_refund_uq` entirely and the index
    // above becomes idempotency-unless-the-writer-forgets. `IS DISTINCT FROM`
    // rather than `<>` because a CHECK passes when its expression is NULL, and
    // `NULL <> 'autopsy_claim'` is NULL.
    check(
      "credit_ledger_autopsy_ref",
      sql`${t.refType} NOT IN ('autopsy_claim','autopsy_refund') OR ${t.refId} IS NOT NULL`
    ),
    check(
      "credit_ledger_auto_topup_attempt_shape",
      sql`((
        ${t.refType} = 'auto_topup'
        AND ${t.kind} = 'pack'
        AND ${t.refId} IS NOT NULL
        AND ${t.stripeEventId} IS NOT NULL
        AND ${t.amountCents} > 0
        AND ${t.configVersion} > 0
        AND (
          (
            ${t.autoTopupAttemptId} IS NOT NULL
            AND ${t.autoTopupPeriodMonthUtc} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          ) OR (
            ${t.autoTopupAttemptId} IS NULL
            AND ${t.autoTopupPeriodMonthUtc} IS NULL
          )
        )
      ) OR (
        ${t.refType} IS DISTINCT FROM 'auto_topup'
        AND ${t.autoTopupAttemptId} IS NULL
        AND ${t.autoTopupPeriodMonthUtc} IS NULL
      )) IS TRUE`
    ),
    check(
      "credit_ledger_pack_checkout_attempt_shape",
      sql`(${t.packCheckoutAttemptId} IS NULL OR (
        ${t.refType} = 'checkout_session'
        AND ${t.kind} = 'pack'
        AND ${t.refId} IS NOT NULL
        AND ${t.stripeEventId} IS NOT NULL
        AND ${t.amountCents} > 0
        AND ${t.configVersion} > 0
      )) IS TRUE`
    ),
    check(
      "credit_ledger_tier_checkout_attempt_shape",
      sql`(${t.tierCheckoutAttemptId} IS NULL OR (
        ${t.refType} = 'invoice'
        AND ${t.kind} = 'grant'
        AND ${t.refId} IS NOT NULL
        AND ${t.stripeEventId} IS NOT NULL
        AND ${t.configVersion} > 0
      )) IS TRUE`
    ),
  ]
);

// Webhook idempotency (D-M1-1): written ONLY inside the single-transaction
// dispatch — insert + handler + processed-mark commit together, so an existing
// row always means its outcome is final. workspace_id is resolved at receipt
// whenever the customer maps (regardless of outcome). Workspace deletion
// detaches that FK; the immutable receipt class preserves the original fact
// while the lifecycle receivers separately remove payload and identifiers.
export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    // Verified provider Invoice metadata captured during the same transaction
    // as a v1 allowance grant. The historical Event payload is immutable and
    // can predate an Invoice metadata update, so it must never be rewritten to
    // pretend the signed invoice-time economic receipt was in the Event.
    tierInvoiceAuthority: jsonb("tier_invoice_authority"),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    stripeCustomerId: text("stripe_customer_id"),
    receiptAttribution: stripeReceiptAttribution("receipt_attribution").notNull(),
    outcome: text("outcome").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    // The Phase-3 handoff vocabulary, made structural (review round 1).
    check(
      "stripe_events_outcome",
      sql`${t.outcome} IN ('processed','refused_unknown_customer','refused_identity_mismatch','ignored')`
    ),
    check(
      "stripe_events_receipt_attribution_shape",
      sql`(${t.receiptAttribution} = 'workspace_attributed' AND ${t.stripeCustomerId} IS NOT NULL)
          OR (${t.receiptAttribution} = 'customer_attributed' AND ${t.workspaceId} IS NULL AND ${t.stripeCustomerId} IS NOT NULL)
          OR (${t.receiptAttribution} = 'unattributed' AND ${t.workspaceId} IS NULL AND ${t.stripeCustomerId} IS NULL)`
    ),
    check(
      "stripe_events_tier_invoice_authority_shape",
      sql`${t.tierInvoiceAuthority} IS NULL OR jsonb_typeof(${t.tierInvoiceAuthority}) = 'object'`
    ),
    index("stripe_events_customer_attribution_idx").on(
      t.stripeCustomerId,
      t.receiptAttribution,
    ),
  ]
);

// Append-only versioned runtime config (D-M1-2 / B5): active = max(version).
export const configVersions = pgTable("config_versions", {
  version: integer("version").primaryKey().generatedAlwaysAsIdentity(),
  content: jsonb("content").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

// One row per pause period (D-M1-3). NOT append-only: closing the open row by
// setting ended_at on resume is its ONE sanctioned update; no other column is
// ever rewritten. Expiry-clock suspension is derivation-time (D-M1-7 fold).
export const pausePeriods = pgTable(
  "pause_periods",
  {
    id: id(),
    // R-122 / Task 6: the foreign key STAYS, and only its delete action moves
    // (cascade -> restrict). Dropping it entirely was the first attempt and it
    // was wrong: this key is not only a cascade, it is the structural refusal
    // of a cross-parented row, and `brain-schema.test.ts` proved the leak the
    // moment it went (Respin non-negotiable 5). A seven-year clock and a
    // CASCADE are what contradict each other; a seven-year clock and RESTRICT
    // do not. At erasure the `link` scrub rule repoints this column to the
    // "Deleted workspace" stub `lifecycle-sql-port.ts` already mints, so the
    // money row survives with referential integrity and no re-linkable id.
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // The KNOWLEDGE time of the OPEN, symmetric with ended_known_at below
    // (round-3 CHANGE 1). Migration 0007 fixed one side of the bound and left
    // the other on the wrong clock: `ensurePauseEnded` compared the caller's
    // knowledge time (`event.created`) against `started_at`, which is our
    // PROCESSING time. Probe-reproduced through the real migrations — a pause
    // Stripe applied at T0 but processed at T0+5min, then resumed in Stripe at
    // T0+2min, saw 3 minutes of "staleness" and returned false: the pause row
    // stays OPEN, `effectiveExpiry` freezes every lot's clock indefinitely,
    // `state.ts` reports `paused` and M3's debit would refuse with
    // WorkspacePausedError — while Stripe bills normally and no further event
    // is coming. It self-heals only if the owner presses Resume in-app.
    //
    // Nullable for the same reason as ended_known_at: rows written before this
    // column existed have none, and both readers fall back to the processing
    // column there (the old, conservative behaviour).
    startedKnownAt: timestamp("started_known_at", { withTimezone: true }),
    // The KNOWLEDGE time of the close, as distinct from the moment we wrote it.
    //
    // `ended_at` is the DB clock at PROCESSING time. For the owner's own resume
    // that is the same instant as the knowledge; for a webhook it is not — a
    // resume event delivered after Stripe backoff is processed minutes after
    // `event.created`. ensurePauseStarted's staleness bound compares a caller's
    // `knownAt` against the last close, so mixing the two clocks made it refuse
    // a REAL, current pause: resume at T0 processed at T0+5m, portal pause at
    // T0+2m, bound sees 3m of "staleness" and writes no pause_periods row at
    // all — expiry clocks keep running through a pause Stripe has applied, and
    // no further event is coming (round-2 NOTE 3).
    //
    // Nullable: rows written before this column existed have none, and the
    // bound falls back to `ended_at` there (the old, conservative behaviour).
    endedKnownAt: timestamp("ended_known_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("pause_periods_open_uq")
      .on(t.workspaceId)
      .where(sql`${t.endedAt} IS NULL`),
    // The one sanctioned update must be unable to record a nonsense interval —
    // a negative pause would shift expiries BACKWARD in the D-M1-7 fold.
    check(
      "pause_periods_interval",
      sql`${t.endedAt} IS NULL OR ${t.endedAt} > ${t.startedAt}`
    ),
    // The knowledge of a close cannot exist without the close (round-3 NOTE).
    // Both are written in ONE `.set()` by recordPauseEnd, so this is structural
    // rather than aspirational — it makes a future writer that stamps only the
    // knowledge column impossible.
    //
    // DELIBERATELY ABSENT, and this is the interesting half: there is NO check
    // ordering the two knowledge columns against each other, and there must not
    // be. `ensurePauseEnded` tolerates CLOCK_SKEW_MS, so a legitimate close can
    // carry `ended_known_at` up to 60s BEFORE `started_known_at` (Stripe's
    // `event.created` is second-granularity while the pause row is written on
    // the millisecond DB clock). A `ended_known_at > started_known_at` check
    // would therefore reject real resumes on the money path — the same class of
    // defect migration 0007 and 0008 exist to fix. Nor is there one relating a
    // knowledge column to its processing column: knowledge legitimately
    // PRECEDES processing (that is the whole point), and by no bounded amount,
    // since Stripe's redelivery backoff is unbounded.
    check(
      "pause_periods_ended_known",
      sql`${t.endedKnownAt} IS NULL OR ${t.endedAt} IS NOT NULL`
    ),
  ]
);

// Phase 10b-1 Task 6 / C5 — the pre-redaction Stripe finance extract.
//
// `stripe_events.payload` is redacted at 90 days. Everything 10b-2's revenue
// projector needs must therefore be lifted out of the payload BEFORE that, in
// the SAME transaction, or the fact is gone. This table is that lift, and it
// is content-free by construction: ids, amounts, currency, periods, states.
// No email, no name, no address, no raw payload.
//
// `workspace_key` is TEXT, not a `workspaces` reference: it is the pseudonymous
// financial-chain key (C3), so it survives the workspace it came from and can
// never be re-linked to it.
export const stripeFinanceExtractStatus = pgEnum("stripe_finance_extract_status", [
  "complete",
  "incomplete",
]);

export const stripeFinanceExtracts = pgTable(
  "stripe_finance_extracts",
  {
    id: id(),
    sourceStripeEventId: text("source_stripe_event_id")
      .notNull()
      .references(() => stripeEvents.id, { onDelete: "restrict" }),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    invoiceLineId: text("invoice_line_id"),
    paymentIntentId: text("payment_intent_id"),
    refundId: text("refund_id"),
    creditNoteId: text("credit_note_id"),
    disputeId: text("dispute_id"),
    chargeId: text("charge_id"),
    workspaceKey: text("workspace_key"),
    // The currency Stripe actually reported, NOT a constant. A row withheld for
    // `non_usd_currency` or `missing_currency` must not claim USD: the reason code
    // carried the truth while this column contradicted it, on the row C5 calls the
    // permanent authority for withholding the period. Nullable, because a withheld
    // row may have had no readable currency at all.
    currency: text("currency"),
    // Excluding tax, in cents — the same integer-cents precedent
    // `credit_ledger.amount_cents` sets. SIGNED: a mid-cycle plan downgrade emits
    // a proration credit line whose `amount_excluding_tax` is NEGATIVE. That is a
    // real economic fact, not a malformed one, and refusing it with a `>= 0` CHECK
    // aborted the whole redaction batch on every tick, forever.
    amountExcludingTaxCents: integer("amount_excluding_tax_cents"),
    // Stripe's `charge.amount`, `payment_intent.amount` and `refund.amount` are
    // tax-INCLUSIVE and have no tax-excluding sibling on the object. Booking them
    // in the column above mixed tax into revenue (T69-R14) while the module
    // refused exactly that substitution for invoice lines and credit notes;
    // withholding them instead would lose a real fact. They land here, labelled
    // for what they are, and 10b-2 decides what a tax-inclusive number is worth.
    amountIncludingTaxCents: integer("amount_including_tax_cents"),
    disputedAmountCents: integer("disputed_amount_cents"),
    servicePeriodStart: timestamp("service_period_start", { withTimezone: true }),
    servicePeriodEnd: timestamp("service_period_end", { withTimezone: true }),
    disputeStatus: text("dispute_status"),
    disputeEffectiveAt: timestamp("dispute_effective_at", { withTimezone: true }),
    extractionVersion: integer("extraction_version").notNull(),
    status: stripeFinanceExtractStatus("status").notNull(),
    // Non-null exactly when the status is `incomplete`. C5: an unparseable or
    // historically absent field becomes an incomplete row rather than a zero,
    // and that row is the permanent authority for withholding the period.
    incompleteReason: text("incomplete_reason"),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    // Stamped by 10b-2's projector when it has verifiably ingested the row.
    // The 30-day expiry clock measures from HERE, so a row nothing has
    // consumed is never swept.
    ingestedAt: timestamp("ingested_at", { withTimezone: true }),
  },
  (t) => [
    // One extract per (event, object). Re-running the receiver over an
    // already-extracted event is a no-op rather than a duplicate revenue row.
    uniqueIndex("stripe_finance_extracts_event_object_uq").on(
      t.sourceStripeEventId,
      t.objectId
    ),
    index("stripe_finance_extracts_sweep_idx").on(t.status, t.ingestedAt),
    check(
      "stripe_finance_extracts_incomplete_reason",
      sql`(${t.status} = 'incomplete') = (${t.incompleteReason} IS NOT NULL)`
    ),
    // R-122's clocks are stated in USD, so a COMPLETE row must be USD — a non-USD
    // complete row would be a silent currency mix in 10b-2's margin dashboard. An
    // INCOMPLETE row records whatever Stripe reported, or NULL: that is the point
    // of a withheld period, and the stored currency must agree with the reason
    // code rather than contradict it.
    check(
      "stripe_finance_extracts_currency_shape",
      sql`${t.status} <> 'complete' OR ${t.currency} = 'USD'`
    ),
    // A disputed amount is a magnitude and stays non-negative. The two revenue
    // columns ADMIT a sign, and the sign is per `object_type`: an invoice LINE
    // carries Stripe's own sign (a proration credit line is negative, the 0055
    // wedge), while a `credit_note` and a `refund` are stored as POSITIVE
    // magnitudes under their own object type (`finance-extract.test.ts` pins
    // 700 and 2280). A projector therefore subtracts BY OBJECT TYPE and never
    // sums this column across types. What is forbidden here is one row carrying
    // BOTH amount columns: one economic fact occupies one column. That guards
    // the pair within a row only — one payment still yields an invoice line, a
    // charge and a payment intent as separate rows, and the projector must
    // de-duplicate them by `payment_intent_id` / `charge_id`.
    check(
      "stripe_finance_extracts_amounts_shape",
      sql`(${t.disputedAmountCents} IS NULL OR ${t.disputedAmountCents} >= 0)
          AND NOT (${t.amountExcludingTaxCents} IS NOT NULL AND ${t.amountIncludingTaxCents} IS NOT NULL)`
    ),
    check(
      "stripe_finance_extracts_service_period_order",
      sql`${t.servicePeriodStart} IS NULL OR ${t.servicePeriodEnd} IS NULL OR ${t.servicePeriodEnd} >= ${t.servicePeriodStart}`
    ),
  ]
);

export type StripeFinanceExtract = typeof stripeFinanceExtracts.$inferSelect;

export type Subscription = typeof subscriptions.$inferSelect;
export type AutoTopupProtocolRollout = typeof autoTopupProtocolRollouts.$inferSelect;
export type TierCheckoutProtocolRollout =
  typeof tierCheckoutProtocolRollouts.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
export type StripeEventRow = typeof stripeEvents.$inferSelect;
export type ConfigVersionRow = typeof configVersions.$inferSelect;
export type PausePeriod = typeof pausePeriods.$inferSelect;
export type CreditKind = (typeof creditKind.enumValues)[number];
