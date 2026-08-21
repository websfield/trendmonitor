// M2a onboarding + metering schema (plan `docs/plans/respin-m2a-cage-plan.md`).
//
// Two tables that exist because a guard needed something to check against:
//
//  - `onboarding_inputs` is the corpus the provenance validator validates
//    against. Three plan-gate reviewers independently found that without it,
//    `source_evidence.inputId` was a dangling reference and its offsets indexed
//    text the product never kept — so a model-fabricated quote was storable and
//    renderable as evidence. An invented quote is worse than an invented field,
//    because it carries a fabricated warrant.
//  - `model_usage` is the only possible record of token spend. `debitCredits`
//    rejects a zero cost (`ledger.ts:339`) and the seeded onboarding price is
//    0, so a zero-cost operation writes no ledger row at all. Without this
//    table "metered" would mean "returned on an object and discarded", which is
//    the inversion of M1's build-metering-first intent.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
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
import { creatorProfiles } from "./brain-schema";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// Which post an input is. The class is what stops a third party's sentence
// becoming the creator's voice: a `reference` quote may never be provenance on
// a writable brain kind, and no brain-doc content may be a verbatim substring
// of a `reference` input. The similarity gate is spin-only (tech-spec §3 step
// 4), so nothing else covers that route into M3's prompt bundle.
export const inputClass = pgEnum("onboarding_input_class", [
  "own_post",
  "reference",
  "creator_authored",
]);

export const usageOutcome = pgEnum("model_usage_outcome", [
  "succeeded",
  "schema_invalid",
  "rate_limited",
  "unavailable",
  "refused",
]);

// 'estimated' at insert; 'reconciled' when the provider's own figure lands.
// That transition is this table's ONE sanctioned update — named here rather
// than discovered, because declaring the table append-only while `cost_state`
// must transition would make "REQ-G05 prefers reconciled" describe a state the
// table could never reach.
export const costState = pgEnum("model_usage_cost_state", [
  "estimated",
  "reconciled",
  "unknown",
]);

// Written from getWorkspaceBillingState, never re-derived. 'unmapped' is kept
// DISTINCT from 'free': `state.ts` returns {tier:"free", reason:"unmapped_price"}
// for an operator misconfiguration on a paying subscription, and collapsing the
// two would book a paying customer's spend against Free.
export const resolvedTier = pgEnum("model_usage_resolved_tier", [
  "creator",
  "pro",
  "studio",
  "free",
  "unmapped",
]);

// IMMUTABLE after insert. There is no update path, and `content_sha256` is
// taken over the NORMALISED bytes so a silent rewrite is detectable — hashing
// the raw input would leave the very mismatch the normalisation prevents
// sitting inside the fix.
export const onboardingInputs = pgTable(
  "onboarding_inputs",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    inputClass: inputClass("input_class").notNull(),
    // Normalised at write: Unicode NFC, CRLF -> LF. Quote offsets recorded in
    // `brain_docs.source_evidence` are UTF-16 code units into THIS value.
    // Without a fixed unit and a fixed normalisation the offsets differ on
    // every emoji and shift on every textarea submission, which is green under
    // ASCII fixtures and wrong in production.
    content: text("content").notNull(),
    contentSha256: text("content_sha256").notNull(),
    sourceUrl: text("source_url"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "onboarding_inputs_profile_workspace_fk",
    }).onDelete("cascade"),
  ]
);

export const modelUsage = pgTable(
  "model_usage",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    // One logical build may span several HTTP calls (a bounded retry writes
    // two rows). Attempts are counted as DISTINCT attempt_ids, never rows —
    // and this is the same value M2b's debit carries as `ref_id`, so REQ-G05
    // can join spend to revenue. M2b enforces one debit per attempt_id.
    attemptId: text("attempt_id").notNull(),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    // The vendor's own usage object, verbatim. METERING FIELDS ONLY — never
    // prompt or completion text. Carrying it raw means cache-token components
    // arriving in a later provider version need no migration.
    usageRaw: jsonb("usage_raw"),
    // Integer micro-USD, matching the repo's money precedent (amountCents).
    // `mode: "bigint"` is explicit because node-postgres returns int8 as a
    // STRING by default, and a silent string concatenation on the one column a
    // margin dashboard sums is the accumulation error the integer choice exists
    // to avoid. NULL only when costState is 'unknown'.
    costMicroUsd: bigint("cost_micro_usd", { mode: "bigint" }),
    costState: costState("cost_state").notNull().default("estimated"),
    resolvedTier: resolvedTier("resolved_tier").notNull(),
    stripePriceId: text("stripe_price_id"),
    promptBundleVersion: text("prompt_bundle_version").notNull(),
    configVersion: integer("config_version").notNull(),
    outcome: usageOutcome("outcome").notNull(),
    // clock_timestamp(), not now(): now() is transaction-start, and this is a
    // per-call record whose ordering is read by the margin rollup.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "model_usage_profile_workspace_fk",
    }).onDelete("cascade"),
    check(
      "model_usage_cost_present_unless_unknown",
      sql`(${t.costState} = 'unknown') = (${t.costMicroUsd} IS NULL)`
    ),
  ]
);

// The margin history that must OUTLIVE a REQ-A04 deletion.
//
// `model_usage` cascades from the profile, because `restrict` plus the
// both-columns-NOT-NULL rule made deletion structurally impossible: `set null`
// is forbidden by construction, so a profile with one usage row could never be
// deleted — and since profiles cascade from workspaces, workspace deletion
// would have failed too. So the cost side is preserved here instead.
//
// `workspace_id` is a PLAIN COLUMN with NO FOREIGN KEY, deliberately. Every
// other workspace-grained table in billing-schema.ts cascades from
// `workspaces`, so a conventional FK here would die with the very thing this
// table exists to outlive.
//
// This is an UPSERT-MAINTAINED ROLLUP, not an append-only table: incrementing
// the two aggregates via onConflictDoUpdate is its ONE sanctioned update. The
// alternative — unique grain plus aggregate columns plus append-only plus a
// per-generation writer — has no implementation, and calling an aggregate table
// append-only is the mutable-stored-counter shape `credit_ledger` forbids
// wearing the wrong label.
export const workspaceSpendMonthly = pgTable(
  "workspace_spend_monthly",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    periodMonth: date("period_month").notNull(),
    tier: resolvedTier("tier").notNull(),
    // `sql\`0\`` rather than `.default(0n)`: drizzle-kit 0.31.10 throws
    // "Do not know how to serialize a BigInt" when a JS bigint literal reaches
    // its snapshot JSON, so a bigint default must be expressed as SQL. Found by
    // running db:generate, not by reading — the schema typechecks either way.
    costMicroUsd: bigint("cost_micro_usd", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    callCount: integer("call_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("workspace_spend_monthly_grain_uq").on(
      t.workspaceId,
      t.periodMonth,
      t.tier
    ),
  ]
);

export type OnboardingInput = typeof onboardingInputs.$inferSelect;
export type NewOnboardingInput = typeof onboardingInputs.$inferInsert;
export type ModelUsageRow = typeof modelUsage.$inferSelect;
export type NewModelUsage = typeof modelUsage.$inferInsert;
export type WorkspaceSpendMonthlyRow = typeof workspaceSpendMonthly.$inferSelect;
export type InputClass = (typeof inputClass.enumValues)[number];
export type CostState = (typeof costState.enumValues)[number];
export type ResolvedTier = (typeof resolvedTier.enumValues)[number];
