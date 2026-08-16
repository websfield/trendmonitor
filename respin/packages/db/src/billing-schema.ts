// M1 billing schema (tech-spec §2 as amended by R-20 / D-M1-1..8).
// Free tier is the ABSENCE of a subscriptions row (skill B6) — never a $0 price.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { workspaces } from "./schema";

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
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
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
    autoTopupEnabled: boolean("auto_topup_enabled").notNull().default(false),
    autoTopupMonthlyCapCents: integer("auto_topup_monthly_cap_cents"),
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

// APPEND-ONLY (non-negotiable 2 / B1): no updatedAt — rows are never updated.
// Balance is the D-M1-7 lot-allocation fold; never a stored counter.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
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
  ]
);

// Webhook idempotency (D-M1-1): written ONLY inside the single-transaction
// dispatch — insert + handler + processed-mark commit together, so an existing
// row always means its outcome is final. workspace_id is resolved at receipt
// whenever the customer maps (regardless of outcome) so attributed payloads
// join the REQ-A04 deletion cascade; unattributable rows fall to the M6 sweep.
export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    stripeCustomerId: text("stripe_customer_id"),
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
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
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

export type Subscription = typeof subscriptions.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
export type StripeEventRow = typeof stripeEvents.$inferSelect;
export type ConfigVersionRow = typeof configVersions.$inferSelect;
export type PausePeriod = typeof pausePeriods.$inferSelect;
export type CreditKind = (typeof creditKind.enumValues)[number];
