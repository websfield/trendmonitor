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
  boolean,
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

// Which post an input is. The class is what stops a third party's sentence
// becoming the creator's voice, and the similarity gate does not cover this
// route because that gate is spin-only (tech-spec §3 step 4).
//
// TWO RULES REST ON IT. Exactly one is ENFORCED in M2a, and this comment says
// which — it previously claimed both, while `input_class` had no reader
// anywhere in the repo (tenancy gate 2026-08-23):
//
//   ENFORCED — a `reference` input may not be the provenance of a `voice`
//     brain document. `validateSourceEvidence` in `with-workspace.ts` reads
//     this column and refuses with `ProvenanceError`; the barred-kind set is
//     deliberately just `voice`, because that is the kind M2a can name with
//     certainty.
//
//   NOT ENFORCED, carried as an M2b binding constraint in R-30 — that no
//     brain-doc CONTENT may be a verbatim substring of a `reference` input.
//     That is a corpus-wide check rather than a per-entry one, and M2a has no
//     content generator to gate.
export const PUBLIC_INPUT_CLASSES = [
  "own_post",
  "reference",
  "creator_authored",
] as const;

export const inputClass = pgEnum("onboarding_input_class", [
  ...PUBLIC_INPUT_CLASSES,
  // Product-built immutable evidence summaries. These are stored classes but
  // deliberately excluded from public InputClass below: generic intake may
  // never self-label creator input as a product conclusion.
  "result_summary",
  "feedback_summary",
]);

export const usageOutcome = pgEnum("model_usage_outcome", [
  "succeeded",
  "schema_invalid",
  "rate_limited",
  "unavailable",
  "refused",
]);

// Cost state is fixed at insert until a real provider, job, or operator-import
// integration owns an authenticated, idempotent transition. `reconciled`
// therefore means the provider figure was known when this row was inserted;
// estimated and unknown rows are not mutated by production code today.
export const costState = pgEnum("model_usage_cost_state", [
  "estimated",
  "reconciled",
  "unknown",
]);

// 'unmapped' is kept DISTINCT from 'free': `state.ts` returns
// {tier:"free", reason:"unmapped_price"} for an operator misconfiguration on a
// paying subscription, and collapsing the two would book a paying customer's
// spend against Free.
//
// WHO WRITES IT IS A CONSTRAINT ON M2b, NOT A PROPERTY OF THIS COLUMN — stated
// that way because the previous comment said "written from
// getWorkspaceBillingState, never re-derived" as though it were enforced, and
// it is not: `recordModelUsage` takes both this and `cost_state` as ordinary
// caller-supplied fields (billing gate 2026-08-23). It CANNOT be enforced here:
// `getWorkspaceBillingState` lives in @respin/credits, which depends on
// @respin/db, so packages/db calling it would invert the graph — the same
// structural reason `createProfile` is deferred (R-30 / A-11). R-30 binding
// constraint 8 binds the writer instead. A wrong value here understates cost
// and therefore OVERSTATES margin, which is the dangerous direction for the one
// number R-6 tunes pricing against.
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
    /**
     * WHICH INTERVIEW QUESTION this row answers (slice 3b, R1/R3) — set if
     * and only if `input_class = 'creator_authored'`, enforced by the CHECK
     * below rather than by convention.
     *
     * A `creator_authored` row is one creator-typed interview answer, one
     * onboarding input each — the same "one row per fact" shape `own_post`
     * and `reference` already use. `field_key` is what the interview-to-brain
     * builder (`interview-ops.ts`) reads back to know which claim position an
     * answer feeds: a LIST field (e.g. `goals`) may have several rows sharing
     * one `field_key`, each becoming one list entry in submission order
     * (`created_at`, `id` tie-break — the same order every other accessor in
     * this file uses).
     *
     * NOT a foreign id into anything — it is a short slug this product owns
     * (`interview-ops.ts`'s `INTERVIEW_FIELDS` registry), so no FK is possible
     * or needed.
     */
    fieldKey: text("field_key"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "onboarding_inputs_profile_workspace_fk",
    }).onDelete("cascade"),
    // THE PAIRING, AS A CONSTRAINT RATHER THAN A COMMENT (same discipline as
    // `model_usage_cost_present_unless_unknown` above). A `creator_authored`
    // row with no field key would be uncitable by anything that reads
    // `field_key` back; an `own_post` or `reference` row WITH one would be a
    // second, undeclared meaning for a column the interview owns.
    check(
      "onboarding_inputs_field_key_iff_creator_authored",
      sql`(${t.inputClass} = 'creator_authored') = (${t.fieldKey} IS NOT NULL)`
    ),
    check(
      "onboarding_inputs_summaries_have_no_caller_attribution",
      // TEXT COMPARISON IS DEPLOY-SAFETY, not a semantic widening. PostgreSQL
      // refuses a newly-added enum value used in the same transaction as
      // `ALTER TYPE ... ADD VALUE`; Drizzle applies all pending statements in
      // one transaction. Casting the column to text keeps the closed enum as
      // the storage authority while allowing the additive CHECK to be created
      // by the real migrator on an existing 0032 database.
      sql`${t.inputClass}::text NOT IN ('result_summary', 'feedback_summary')
          OR (${t.fieldKey} IS NULL AND ${t.sourceUrl} IS NULL)`
    ),
  ]
);

/**
 * The interview's MUTABLE scratch state (slice 3b, R1/R2) — one row per
 * profile, upserted as the creator moves between fields and steps.
 *
 * DELIBERATELY NOT `onboarding_inputs`: that table is immutable after insert
 * (this file's own header states why — quote offsets index it, and a rewrite
 * would invalidate every citation built on it) and a person filling in a
 * multi-field form edits the SAME field repeatedly before submitting, which an
 * append-only table has no way to represent without minting a row per
 * keystroke. This table exists so "answer, go back, change your mind, leave
 * and come back" costs nothing until the creator actually submits — at which
 * point `interview-ops.ts` turns the decided answers into immutable
 * `creator_authored` rows, once, atomically.
 *
 * `answers` IS THE WHOLE DRAFT, keyed by the same `INTERVIEW_FIELDS` slug
 * `field_key` uses, so the draft and the submitted evidence share one
 * vocabulary. Its SHAPE is validated by `interview-ops.ts`'s zod schema at
 * every write — this table stores whatever passed that funnel, the same
 * "validate at the boundary, store the parse output" discipline `brain-content.ts`
 * uses for `brain_docs.content`.
 */
export const onboardingInterviewDrafts = pgTable(
  "onboarding_interview_drafts",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    answers: jsonb("answers").notNull().default(sql`'{}'::jsonb`),
    /**
     * Set once, when `submitInterview` turns this draft into `creator_authored`
     * inputs and brain-document drafts. NOT a delete-and-recreate: the
     * submitted answers stay visible for "what did I say" even after
     * submission, and re-submitting is refused rather than silently allowed
     * (R11 only covers RESUMING an unsubmitted draft).
     */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "onboarding_interview_drafts_profile_workspace_fk",
    }).onDelete("cascade"),
    // ONE DRAFT PER PROFILE. `profileId` alone is sufficient (it already
    // determines `workspaceId` via the composite FK above), and a second row
    // for the same profile would split "what the creator has answered so far"
    // across two places with no rule for which one is current.
    uniqueIndex("onboarding_interview_drafts_profile_uq").on(t.profileId),
  ]
);

/**
 * THE COHERENT ACTIVATION SNAPSHOT (slice 3b, R8) — an IMMUTABLE record of
 * which Voice/Strategy/Kill-Test (and, from slice 9, Performance Meta)
 * version was active AT THE MOMENT one of them was activated.
 *
 * APPEND-ONLY, LIKE `credit_ledger` AND `brain_docs`: activating any one
 * document creates a NEW row here, carrying the OTHER kinds' unchanged active
 * ids forward, rather than updating a single "current state" row in place —
 * which is what lets a later generation record EXACTLY the snapshot id it ran
 * under (R9) instead of a state that may have moved by the time anyone reads
 * it.
 *
 * EACH DOC ID IS A PLAIN COLUMN — NO FK AT ALL, not even a bare one to
 * `brain_docs.id` (tenancy gate finding, 2026-08-30 — an earlier version of
 * this comment claimed a bare FK "is real referential integrity", which
 * overstated what the migration actually creates: there is none). A bare FK
 * was considered and rejected, not merely omitted: `brain_activation_snapshots`
 * ALREADY cascades from `(profile_id, workspace_id)` via the FK below, and a
 * SEPARATE `onDelete` FK from each doc-id column to `brain_docs.id` would
 * race that same cascade the moment anything ever deletes a `brain_docs` row
 * directly (today nothing does — see below) — `cascade` on the doc-id column
 * would delete this WHOLE snapshot row over just one of its four kinds going
 * away, wrongly discarding the other three kinds' still-valid active ids;
 * `set null` avoids that but adds an untested second delete path alongside
 * the profile cascade for no benefit this table needs today.
 *
 * SO THE PROPERTIES THIS TABLE ACTUALLY HAS: the TENANCY property — that a
 * doc named here really belongs to THIS profile/workspace — is proved by the
 * writer (`activateBrainDocCoherent` reads each doc scoped through the
 * profile's own accessors before it is ever named here), the same division
 * of labour `source_evidence.inputId` already uses for a jsonb-embedded
 * foreign id one table over. REFERENTIAL integrity (a doc id here always
 * points at a REAL `brain_docs` row) has NO database-level backstop — it
 * holds today only because `brain_docs` rows are never deleted except by the
 * SAME profile cascade that deletes this table's own rows in the same
 * operation (no individual-doc deletion path exists anywhere in this
 * codebase). If a future slice ever adds one, it must also decide this
 * table's FK question — a dangling id here would be silent, not refused.
 *
 * NULLABLE, EACH ONE — a coherent snapshot is coherent even when a kind has
 * never been activated yet (an early creator may activate Voice before they
 * have even started the Kill Test interview), and `performance_meta` is
 * nullable FOREVER before slice 9 makes it writable at all.
 */
export const brainActivationSnapshots = pgTable(
  "brain_activation_snapshots",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    voiceDocId: uuid("voice_doc_id"),
    strategyDocId: uuid("strategy_doc_id"),
    killtestDocId: uuid("killtest_doc_id"),
    performanceMetaDocId: uuid("performance_meta_doc_id"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "brain_activation_snapshots_profile_workspace_fk",
    }).onDelete("cascade"),
    unique("brain_activation_snapshots_id_profile_workspace_uq").on(
      t.id,
      t.profileId,
      t.workspaceId
    ),
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
    /**
     * Did this attempt spend the profile's ONE INCLUDED BUILD?
     *
     * ITS OWN COLUMN, because `outcome` was answering two questions and the
     * billing gate caught it giving the wrong answer to one (2026-08-29).
     * `outcome` says what happened and drives the REQ-G05 margin rollup;
     * whether the creator's entitlement was consumed is a different fact, and
     * for a TRUNCATION the two diverge: the vendor really charged us (so the
     * cost is real and `schema_invalid` is honest), but the reason nothing
     * usable came back is that this server's own reply ceiling was too low.
     * Charging a creator their one free build for our deterministic
     * misconfiguration is what R14 already forbids one case over.
     *
     * `NOT NULL DEFAULT true` so every row written before this column existed
     * keeps exactly the meaning it had — the entitlement question used to be
     * "was it billable", and for every one of those rows it still is.
     */
    consumedIncludedBuild: boolean("consumed_included_build")
      .notNull()
      .default(true),
    // clock_timestamp(), not now(): now() is transaction-start, and this is a
    // per-call record whose ordering is read by the margin rollup.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    // R-122 / Task 6: cascade -> restrict, for the reason credit_ledger's
    // workspace link changed. This COMPOSITE key is the profile cage's own
    // refusal of a cross-parented row (M2a; `brain-schema.test.ts` and
    // `profile-scope.test.ts` both prove it), so it must not be dropped — only
    // its delete action moves, so a retained REQ-G05 margin input can outlive
    // the profile by being repointed to the "Deleted profile" stub.
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "model_usage_profile_workspace_fk",
    }).onDelete("restrict"),
    check(
      "model_usage_cost_present_unless_unknown",
      sql`(${t.costState} = 'unknown') = (${t.costMicroUsd} IS NULL)`
    ),
  ]
);

/**
 * WHICH ATTEMPT IS A PROFILE'S FIRST BILLABLE ONE, per purpose — decided by the
 * DATABASE, at COMMIT TIME (R-80).
 *
 * WHAT THIS REPLACES AND WHY IT IS A TABLE. The same fact used to be DERIVED
 * from `model_usage` by ranking attempts on `(created_at, attempt_id)` and
 * calling the one with no predecessors free. Those VALUES are a total order.
 * The READER'S SNAPSHOT is not: `created_at` is `clock_timestamp()` assigned at
 * INSERT and a row becomes visible at COMMIT, so under READ COMMITTED an
 * attempt that inserted FIRST and committed SECOND is invisible to the attempt
 * that committed before it, and then finds that attempt LATER by the ordering
 * key. Both read "no predecessors"; both took the included build; one debit was
 * never written. Reproduced on real Postgres, deterministically, in
 * `packages/credits/tests/inference-race.docker.test.ts` ("INSERTED FIRST,
 * COMMITTED SECOND").
 *
 * A unique index cannot be fooled that way: it is enforced against COMMITTED
 * state, so the second inserter BLOCKS until the first commits and then
 * conflicts. Exactly one row can exist per (profile, purpose), whatever the
 * interleaving — which is the property the ordering only ever claimed.
 *
 * WRITTEN IN THE SAME TRANSACTION AS THE `model_usage` ROW IT NAMES, by
 * `recordModelUsage` (with-workspace.ts) — never by the debit. Two reasons, and
 * both are load-bearing:
 *   - R11 (the A-7 settlement tail) commits the spend record BEFORE the debit
 *     is attempted, so a claim written at the debit would not exist for the
 *     attempts that never reach one.
 *   - A billable failure that CONSUMES the entitlement (a policy `refused`,
 *     `LlmError.consumesIncludedBuild`) never reaches the debit at all, and it
 *     is exactly the case the old ranking counted. Claiming at the debit would
 *     silently hand the free build back to the next attempt.
 *
 * PURPOSE-NEUTRAL, DELIBERATELY. It records "the first attempt of this purpose
 * we were billed for", which is a true fact for every purpose; whether that
 * attempt is PRICED differently is a question `priceOf` (@respin/credits)
 * answers, and only the onboarding brain answers it "yes" today. The
 * alternative — writing rows only for purposes that have an included build —
 * needs a list of those purposes inside @respin/db, which does not own them.
 *
 * NO `updated_at`, and no writer that updates: the row is claimed once and is
 * never moved. Its lifetime is the profile's (composite FK, cascade), the same
 * as the `model_usage` rows it ranks.
 */
export const firstBillableAttempts = pgTable(
  "first_billable_attempts",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    purpose: text("purpose").notNull(),
    // A BARE `text`, WITH NO FOREIGN KEY TO `model_usage` — a stated residual,
    // not an oversight (tenancy gate NOTE, 2026-09-02).
    //
    // AT THE DATABASE LEVEL this column could therefore name an attempt
    // belonging to another profile, or no usage row at all. THE FK IS NOT
    // AVAILABLE: it would reference `model_usage(profile_id, attempt_id)`,
    // which Postgres requires to be UNIQUE, and that table has no such unique
    // ON PURPOSE — "a bounded retry writes two rows" for one logical attempt
    // (`modelUsage.attemptId`'s own comment above). The constraint that would
    // prove this column would forbid the shape the table was built to allow.
    //
    // SO THE PROPERTY RESTS ON ONE WRITER, and it is named here so the next
    // reader does not have to rediscover it: `recordModelUsage`
    // (`with-workspace.ts`) builds EVERY column of this row from the RETURNED
    // `model_usage` row, in that row's own transaction — never from caller
    // input — so a claim always names a usage row of the same profile. Both
    // readers narrow by profile as well: the `firstBillableAttempt` accessor
    // matches `(workspace, profile, purpose)` through the shared `both()`
    // predicate, and `reconcileSpend`'s subquery matches
    // `(profile_id, purpose, attempt_id)`. A second writer would be the thing
    // that breaks this, and it would break it silently — which is why "one
    // writer" is not left as a sentence: `tests/table-writers.test.ts`
    // enumerates this table's write surface and a second `.insert` anywhere,
    // in any of its four shapes, fails there.
    attemptId: text("attempt_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "first_billable_attempts_profile_workspace_fk",
    }).onDelete("cascade"),
    // THE WHOLE CONTROL. `profile_id` is globally unique (it is
    // `creator_profiles.id`), so keying on it alone is already per-workspace —
    // and the composite FK above is what proves the pair on the row is real, so
    // adding `workspace_id` to the key would widen it, not narrow it: a second
    // row could then exist for the same profile under a forged workspace id.
    uniqueIndex("first_billable_attempts_profile_purpose_uq").on(
      t.profileId,
      t.purpose
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
    // Slice 2b-c / R4: the retained denominator for the excluded-`unknown`
    // share. `call_count` alone cannot answer "what fraction of this grain's
    // calls had no price" once `model_usage` detail is gone (REQ-A04
    // deletion, or simply time — this table is the one that outlives it) —
    // deriving the share from surviving `model_usage` rows is exactly what
    // R4 forbids, because after a deletion there ARE no surviving rows to
    // derive it from. So the count moves onto THIS row at write time, same
    // as `cost_micro_usd` and `call_count` do: incremented by
    // `upsertSpendRollup` whenever `costState === 'unknown'`. It is not
    // decremented today because no real reconciliation source exists; a future
    // integration must add the usage transition and same-transaction rollup
    // delta together, against that integration's proven payload identity.
    unknownCallCount: integer("unknown_call_count").notNull().default(0),
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

/**
 * Did the vendor produce a response WE WERE BILLED FOR? (R13, R14, slice 2a.)
 *
 * D-M2-2 gives each profile ONE included onboarding brain build and prices
 * every rebuild after it, and "which build is this" is counted as DISTINCT
 * `attempt_id`s. That count has to be over BILLED attempts only: a 429, a 5xx
 * or a dropped connection produced no response, cost us nothing, and consuming
 * a creator's included build for our own outage would be charging them for it.
 * A policy refusal and a response with no usable text DID cost us input
 * tokens, so both consume it.
 *
 * `satisfies Record<UsageOutcome, boolean>` is the exhaustiveness, and it is
 * the whole reason this is a map rather than an array: adding a sixth value to
 * `usageOutcome` — which slice 3 is expected to do for the post-call brain-write
 * refusals — is then a COMPILE ERROR here rather than an outcome silently
 * treated as non-billable, which is the direction that hands out free rebuilds.
 */
export const USAGE_OUTCOME_BILLABLE = {
  succeeded: true,
  schema_invalid: true,
  refused: true,
  rate_limited: false,
  unavailable: false,
} satisfies Record<(typeof usageOutcome.enumValues)[number], boolean>;

export const BILLABLE_USAGE_OUTCOMES = Object.entries(USAGE_OUTCOME_BILLABLE)
  .filter(([, billable]) => billable)
  .map(([outcome]) => outcome) as readonly UsageOutcome[];

export type UsageOutcome = (typeof usageOutcome.enumValues)[number];

export type OnboardingInput = typeof onboardingInputs.$inferSelect;
export type NewOnboardingInput = typeof onboardingInputs.$inferInsert;
export type ModelUsageRow = typeof modelUsage.$inferSelect;
export type NewModelUsage = typeof modelUsage.$inferInsert;
export type WorkspaceSpendMonthlyRow = typeof workspaceSpendMonthly.$inferSelect;
export type FirstBillableAttempt = typeof firstBillableAttempts.$inferSelect;
export type NewFirstBillableAttempt =
  typeof firstBillableAttempts.$inferInsert;
/** The generic creator-intake API's pre-9b public union. */
export type InputClass = (typeof PUBLIC_INPUT_CLASSES)[number];
/** Every value persisted in onboarding_inputs, including product summaries. */
export type StoredInputClass = (typeof inputClass.enumValues)[number];
export type CostState = (typeof costState.enumValues)[number];
export type ResolvedTier = (typeof resolvedTier.enumValues)[number];
export type OnboardingInterviewDraft =
  typeof onboardingInterviewDrafts.$inferSelect;
export type NewOnboardingInterviewDraft =
  typeof onboardingInterviewDrafts.$inferInsert;
export type BrainActivationSnapshot =
  typeof brainActivationSnapshots.$inferSelect;
export type NewBrainActivationSnapshot =
  typeof brainActivationSnapshots.$inferInsert;
