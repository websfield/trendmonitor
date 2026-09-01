// Slice 6 generation schema (tech-spec §2, plan `docs/plans/respin-finish-phase-6.md`
// R9/R9a/R14/R14c). This file models the claim, the record and the constraints;
// the state machine, the settlement transaction and every writer live in
// `with-workspace.ts` behind the write capabilities.
//
// THE WRITERS, NAMED — because this header used to say there were none.
// Through stage B it read "there is deliberately no writer of either table in
// `packages/**` or `app/**` today, and `tests/table-writers.test.ts` carries
// that as an EMPTY expectation". Both halves went false in stage C, in this
// same slice, and the sentence survived into the gate (2026-09-01). It is
// replaced by the list rather than deleted, because the list is the thing a
// reader of this file actually needs and it is checked: `tests/table-writers.
// test.ts` enumerates exactly these four and fails on a fifth.
//
//   generations            INSERT  — `settleGeneration`. The only writer, and
//                                    there is deliberately NO update path: the
//                                    record is immutable and carries no
//                                    `updated_at`.
//   generation_attempts    INSERT  — `claimGenerationAttempt` (the durable
//                                    claim, committed before outbound HTTP).
//                          UPDATE  — `advanceGenerationAttempt` (every
//                                    transition except `settled`, and the
//                                    writer of the R14c `candidate`) and
//                                    `settleGeneration` (the `settled`
//                                    transition, deliberately unreachable from
//                                    the first).
//
// Every one of them is role-gated, scope-caged, and builds each column from the
// scope rather than from a caller's object — the state, the timestamps, the
// terminal ids and the candidate are all server-derived.
//
// TWO TABLES, ONE ATTEMPT:
//
//  - `generation_attempts` is the DURABLE CLAIM committed before outbound HTTP
//    (R14). It is the only table in this package that is neither append-only
//    nor immutable — its whole purpose is to transition — so it carries
//    `updated_at`, which `generations` deliberately does not.
//  - `generations` is the RECORD. It is immutable, like `onboarding_inputs`
//    and `brain_activation_snapshots`: no `updated_at`, no update path.
//    "A later brain or metric edit cannot change the historical explanation"
//    (R9a) is what `brain_activation_id` buys — the snapshot it names is an
//    append-only row (`brain_activation_snapshots`' own docblock), so pointing
//    at the snapshot id records the exact Voice/Strategy/Kill-Test versions
//    without copying them into a second place that could disagree with the
//    first.
//
// The composite FK on `(profile_id, workspace_id)`, both columns NOT NULL, is
// the rule every profile-grained child in this schema follows and the reason
// is measured rather than stylistic: Postgres MATCH SIMPLE skips a composite
// FK entirely when ANY of its columns is NULL, so a nullable half admits a row
// naming a parent that does not exist (`brain-schema.ts`'s header records both
// directions of that reproduction).
import { sql } from "drizzle-orm";
import {
  check,
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

/**
 * The attempt's SERVER-DERIVED state (R14), in the order it advances:
 * `claimed → vendor_started → vendor_complete → settled | refused |
 * recovery_required`.
 *
 * The ORDER is not expressible as a constraint — Postgres cannot compare a row
 * to its own previous value without a trigger, and this repo generates every
 * migration with drizzle-kit rather than hand-writing SQL it did not produce.
 * What IS expressible, and is expressed below, is that each state carries the
 * evidence it claims: a `vendor_started` row cannot exist without a
 * `vendor_started_at`, a `settled` row cannot exist without its generation,
 * and a `refused` row cannot exist without a reason. A state reached by
 * skipping a step therefore cannot also skip its stamp, which is the half of
 * "forward only" a schema can hold.
 */
export const generationAttemptState = pgEnum("generation_attempt_state", [
  "claimed",
  "vendor_started",
  "vendor_complete",
  "settled",
  "refused",
  "recovery_required",
]);

/**
 * What a stored generation IS.
 *
 * `honest_refusal` is a first-class OUTCOME rather than an absence, because
 * REQ-C03 says an honest failure is the product working — "everything died,
 * here is why, here is a sharper angle" — and the creator who was told that
 * received a real answer. It is stored, it is inspectable, and (per the slice
 * card's question-4 table) it is debited. A refusal a creator cannot inspect
 * is indistinguishable from a bug, which is R7.
 */
export const generationOutcome = pgEnum("generation_outcome", [
  "usable",
  "honest_refusal",
]);

/**
 * THE DURABLE CLAIM (R14). One row per attempt, committed BEFORE outbound HTTP.
 *
 * `attempt_id` IS THE BUSINESS KEY, and it is the SAME string three tables
 * key on: `model_usage.attempt_id` (the spend record), `credit_ledger.ref_id`
 * under `ref_type = 'inference'` (the debit), and this row. That is R14c's
 * "schema unique constraint on the attempt/business reference" — the debit is
 * protected by `credit_ledger_inference_debit_uq`, which already exists and
 * already keys on exactly this pair. A generation debit therefore uses
 * `ref_type = 'inference'` and `ref_id = attempt_id`; a SECOND ref_type for
 * generations would need a second partial unique index and would split "at
 * most one debit per vendor attempt" into two constraints over disjoint
 * halves of one class. `packages/credits/src/inference.ts` already names that
 * literal beside the index it keys on.
 *
 * `attempt_id` IS GLOBALLY UNIQUE, not per workspace, for the reason its four
 * ledger siblings state one file over: an attempt id is minted per attempt and
 * belongs to exactly one workspace, so two workspaces claiming one attempt is
 * a writer defect that must FAIL CLOSED here rather than be silently accepted
 * as two claims. Scoping it per workspace would make this table permissive
 * exactly where the ledger index it pairs with is strict, and the debit would
 * then refuse what the claim had allowed.
 */
export const generationAttempts = pgTable(
  "generation_attempts",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    /**
     * R12's per-purpose grain, the same column `model_usage.purpose` carries.
     * TEXT rather than an enum, matching `model_usage`: the purpose vocabulary
     * belongs to `packages/credits`, and a pgEnum here would put it in a
     * migration instead.
     */
    purpose: text("purpose").notNull(),
    /**
     * Which mode this claim is for.
     *
     * TEXT, NOT A pgEnum, deliberately. The mode vocabulary belongs to
     * `packages/modes` and `packages/config`'s `creditCosts` keys; pinning it
     * as a database enum here would mean a migration per mode in slice 7 and
     * would fix a vocabulary this package does not own. The trade is stated
     * rather than discovered: a typo is storable, so the tier gate (R18) and
     * the price lookup (R13) are what refuse an unknown mode, before the claim
     * is written.
     */
    mode: text("mode").notNull(),
    /**
     * The payload identity (R14). Lowercase hex sha256 over the assembled
     * request, CHECKed below — the same "hash the normalised bytes" discipline
     * `onboarding_inputs.content_sha256` uses.
     *
     * "Same `attempt_id` + different payload refuses" is TWO halves. This
     * column plus `generation_attempts_attempt_uq` is the half the schema
     * owns: a second claim on the same attempt id cannot land, whatever its
     * payload, so the retry path is forced to READ the stored hash rather than
     * insert beside it. Comparing the hashes and refusing is stage C's half —
     * it is application code and it is named here so the division is legible,
     * not so this file can claim it.
     */
    payloadSha256: text("payload_sha256").notNull(),
    state: generationAttemptState("state").notNull().default("claimed"),
    // `clock_timestamp()`, not `now()`, for the reason `model_usage.created_at`
    // gives: `now()` is TRANSACTION START, and these four stamps are read as a
    // per-attempt timeline by whoever is diagnosing a `recovery_required` row.
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    vendorStartedAt: timestamp("vendor_started_at", { withTimezone: true }),
    vendorCompletedAt: timestamp("vendor_completed_at", { withTimezone: true }),
    /** The stamp of whichever terminal state this attempt reached. */
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    /**
     * THE TERMINAL IDS (R14), as PLAIN COLUMNS WITH NO FOREIGN KEY — the same
     * decision `brain_activation_snapshots` records for its four doc ids, for
     * the same two reasons, and stated here rather than left to be discovered.
     *
     * The AUTHORITATIVE links run the other way and are real: `generations`
     * carries a four-column same-tenant FK back to this row, and the debit is
     * held by `credit_ledger_inference_debit_uq` on `(ref_type, ref_id)` where
     * `ref_id = attempt_id`. These two columns are this row's OWN record of
     * what it settled into, so an operator reading a `settled` or
     * `recovery_required` row does not have to join two tables to know what
     * happened.
     *
     * A bare FK on either was considered and rejected: `generation_attempts`
     * already cascades from `(profile_id, workspace_id)`, and a second
     * `onDelete` path from here to `generations` (which cascades from the SAME
     * profile) would race that cascade for no property this table needs — and
     * an FK from here to `generations` while `generations` has one to here is
     * a cycle whose only benefit is a back-pointer that
     * `generations_attempt_uq` already makes derivable.
     */
    generationId: uuid("generation_id"),
    debitLedgerId: uuid("debit_ledger_id"),
    /**
     * THE DURABLE VALIDATED CANDIDATE (R14c), and its RETENTION.
     *
     * WHAT IT IS: the vendor's answer after it was parsed and after the kill
     * and traceability gates ran — the settlement's whole input, written in
     * the SAME transaction as the `vendor_complete` stamp. Before this column
     * existed, a crash between the vendor answering and the settlement
     * committing meant we had paid the vendor, the creator got nothing, and
     * the validated output we already held was discarded. R14c exists to
     * recover that value, not merely to fail honestly about losing it.
     *
     * ITS RETENTION IS A CONSTRAINT, NOT A COMMENT.
     * `generation_attempts_candidate_iff_vendor_complete` is an EQUALITY, so
     * this column holds words for EXACTLY the window between the response
     * checkpoint and settlement, and NO terminal row can carry it: `settled`
     * clears it because `generations` is then the record, and `refused` /
     * `recovery_required` clear it because an attempt that produced nothing
     * for the creator must not keep a copy of what it refused to give. A
     * second, permanent copy of output text is exactly what R11 forbids one
     * table over, and "it is deleted at settlement" written as prose is a
     * claim; written as an equality it is a thing the database refuses.
     *
     * WHAT THAT COSTS, stated rather than discovered. The equality means a
     * `vendor_complete` row with no candidate is UNREPRESENTABLE — which is
     * the property that makes "a retry of `vendor_complete` settles the
     * stored candidate" total rather than best-effort — and it means the ONE
     * transition into `vendor_complete` must always carry one.
     * **Revisit trigger:** the first path that needs a legal
     * `vendor_complete` with nothing stored (a streaming checkpoint taken
     * before validation is the plausible one) — that case is a settlement
     * outage whose only remedy is another migration, so it is answered here
     * rather than discovered there.
     *
     * WHAT IT IS NOT: caller-suppliable. `claimGenerationAttempt` never
     * copies it, and the only writer is the transition that follows an actual
     * vendor call. `generation-write.test.ts` smuggles one in through
     * `as unknown as` at every writer rather than trusting the type.
     */
    candidate: jsonb("candidate"),
    /** Why a `refused` attempt refused. Required by CHECK, like `adjust` rows. */
    refusalCode: text("refusal_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "generation_attempts_profile_workspace_fk",
    }).onDelete("cascade"),
    // A table-level UNIQUE CONSTRAINT, deliberately, not `uniqueIndex` — the
    // migration-0011 lesson, recorded on `creator_profiles`: drizzle-kit emits
    // every CREATE TABLE, then every FK ALTER TABLE, then every CREATE INDEX,
    // so a unique INDEX does not yet exist when `generations_attempt_fk`
    // references it and the migration dies with "there is no unique constraint
    // matching given keys". A constraint is emitted INLINE in CREATE TABLE.
    //
    // FOUR COLUMNS, because this is what makes two separate properties of
    // `generations` unrepresentable in one constraint: a generation can name
    // neither an attempt belonging to another profile or workspace (R-9), nor
    // an attempt claimed for a DIFFERENT MODE than the one it records — which
    // is what stops a hookSet claim settling as a fullScript generation and
    // being priced as one.
    unique("generation_attempts_attempt_mode_profile_workspace_uq").on(
      t.attemptId,
      t.mode,
      t.profileId,
      t.workspaceId
    ),
    // THE CLAIM'S UNIQUENESS, globally — see the table docblock.
    uniqueIndex("generation_attempts_attempt_uq").on(t.attemptId),
    // A hash column that can hold anything is not an identity. Lowercase hex
    // only, so "same payload" is a byte comparison rather than a
    // case-insensitive one nobody wrote.
    check(
      "generation_attempts_payload_sha256_hex",
      sql`${t.payloadSha256} ~ '^[0-9a-f]{64}$'`
    ),
    // A `claimed` row has not called anything yet.
    check(
      "generation_attempts_claimed_has_no_vendor_start",
      sql`${t.state} <> 'claimed' OR ${t.vendorStartedAt} IS NULL`
    ),
    // ...and every state that implies the vendor WAS called carries the stamp.
    // `refused` is deliberately absent from BOTH sides: a refusal can happen
    // before the call (a zero balance, R15) or after it (an unparseable reply),
    // so it is the one state that says nothing about whether HTTP happened.
    check(
      "generation_attempts_vendor_start_recorded",
      sql`${t.state} NOT IN ('vendor_started','vendor_complete','settled','recovery_required')
          OR ${t.vendorStartedAt} IS NOT NULL`
    ),
    check(
      "generation_attempts_vendor_completion_recorded",
      sql`(${t.state} NOT IN ('vendor_complete','settled') OR ${t.vendorCompletedAt} IS NOT NULL)
          AND (${t.state} NOT IN ('claimed','vendor_started') OR ${t.vendorCompletedAt} IS NULL)`
    ),
    // The terminal stamp exists EXACTLY for the terminal states — an equality,
    // not an implication, so neither a terminal row without its time nor a
    // live row wearing one is storable.
    check(
      "generation_attempts_terminal_stamp",
      sql`(${t.state} IN ('settled','refused','recovery_required')) = (${t.terminalAt} IS NOT NULL)`
    ),
    // SETTLED MEANS THERE IS SOMETHING TO SHOW: R14b persists the usable
    // generation or the billable honest refusal AND its debit atomically, so a
    // `settled` attempt naming no generation is a settlement that produced
    // nothing.
    check(
      "generation_attempts_settled_has_generation",
      sql`(${t.state} = 'settled') = (${t.generationId} IS NOT NULL)`
    ),
    // The debit id is ONE-DIRECTIONAL on purpose, and this is the interesting
    // half: `settled` does NOT imply a debit row exists. `debitCredits`
    // refuses a zero cost outright (`assertPositiveInt`, ledger.ts), and
    // `creditCosts` is versioned config an operator may set to 0 for a mode —
    // so an equality here would turn a legal free mode into a settlement
    // outage, which is a control becoming the outage. What IS forbidden is a
    // debit recorded against an attempt that never settled.
    check(
      "generation_attempts_debit_only_when_settled",
      sql`${t.debitLedgerId} IS NULL OR ${t.state} = 'settled'`
    ),
    // THE CANDIDATE'S WINDOW, as an equality in BOTH directions (R14c). One
    // direction is the retention rule — no terminal row keeps output text.
    // The other is what makes the retry total: a `vendor_complete` attempt
    // ALWAYS has something to settle from, so the retry path has no "we
    // reached the checkpoint but stored nothing" branch to guess in.
    check(
      "generation_attempts_candidate_iff_vendor_complete",
      sql`(${t.state} = 'vendor_complete') = (${t.candidate} IS NOT NULL)`
    ),
    // ...and a candidate has to BE a document. `jsonb` accepts the scalar
    // `'null'::jsonb`, which is NOT SQL NULL and so satisfies the equality
    // above while carrying nothing to settle — the same class of hole
    // `credit_ledger_free_allowance_ref` closes for a NULL that slips past a
    // partial unique index.
    check(
      "generation_attempts_candidate_is_object",
      sql`${t.candidate} IS NULL OR jsonb_typeof(${t.candidate}) = 'object'`
    ),
    // Symmetric with `credit_ledger_adjust_reason`: the state that exists to
    // explain itself must carry the explanation.
    check(
      "generation_attempts_refusal_code",
      sql`${t.state} <> 'refused' OR ${t.refusalCode} IS NOT NULL`
    ),
  ]
);

/**
 * THE GENERATION RECORD (R9, R9a).
 *
 * IMMUTABLE, and the shape says so rather than a comment claiming it: there is
 * no `updated_at`, exactly as `onboarding_inputs` and
 * `brain_activation_snapshots` have none. The absence of an update WRITER is
 * held by `tests/table-writers.test.ts`, which is the instrument — the
 * database does not forbid an UPDATE and this file does not pretend it does.
 *
 * `UNIQUE (id, profile_id, workspace_id)` is here for the reason
 * `creator_profiles` has its `(id, workspace_id)` twin: slices 7 and 9 add
 * lineage (`generations >─ generations`) and results (`results >─
 * generations`), and a plain FK to `id` alone would let a child name a
 * generation belonging to another profile. It is a table `unique()` and not a
 * `uniqueIndex()` so that it is emitted INLINE in CREATE TABLE and therefore
 * exists before any future FK ALTER references it.
 */
export const generations = pgTable(
  "generations",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    /** The claim this settled from. One generation per attempt (unique below). */
    attemptId: text("attempt_id").notNull(),
    /**
     * Carried here as well as on the claim, and NOT as a duplicate that can
     * drift: `generations_attempt_fk` includes this column, so a generation
     * whose mode differs from its attempt's is refused by Postgres rather than
     * by a reviewer noticing. It lives on the row so the export, the by-mode
     * credit burn (R17a) and `/studio` all read one column instead of joining.
     */
    mode: text("mode").notNull(),
    /**
     * THE COHERENT BRAIN THIS RAN UNDER (R9a) — the `brain_activation_snapshots`
     * id, which is an APPEND-ONLY row naming the exact Voice, Strategy,
     * Kill-Test (and, from slice 9, Performance Meta) versions that were
     * active together at that instant.
     *
     * THE SNAPSHOT ID RATHER THAN FOUR COPIED DOC IDS, deliberately. Copying
     * them would create a second answer to "which versions did this run
     * under", and the two could disagree with nothing to adjudicate; pointing
     * at the snapshot cannot, because the snapshot is never rewritten. That is
     * the mechanism `brain_activation_snapshots`' own docblock was built for:
     * "what lets a later generation record EXACTLY the snapshot id it ran
     * under instead of a state that may have moved".
     *
     * NO FOREIGN KEY, for the same reason its own doc-id columns have none —
     * a same-tenant composite FK would need `UNIQUE (id, profile_id,
     * workspace_id)` on `brain_activation_snapshots`, which that table does
     * not have, and a BARE FK to `id` alone would let this row name a snapshot
     * belonging to another profile: worse than none, because it would look
     * like tenancy. The tenancy property is proved by the WRITER (stage C
     * reads the snapshot through the profile's own scoped accessors before
     * naming it), the same division of labour `source_evidence.inputId`
     * already uses for a foreign id the composite FK cannot see. A dangling id
     * here would be silent, not refused; that limit is recorded rather than
     * implied.
     */
    brainActivationId: uuid("brain_activation_id").notNull(),
    /**
     * The exact framework versions used (R9a) — `[{id, version}]`, so a
     * framework edited later does not rewrite this generation's explanation.
     * `[]` is a real answer ("no framework was used"), which is why it is NOT
     * NULL with a default rather than nullable.
     */
    frameworkVersions: jsonb("framework_versions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * The creator-input/context rows this generation was assembled from (R9a)
     * — `onboarding_inputs` ids. Immutable rows, so the ids are enough.
     */
    contextInputIds: jsonb("context_input_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** What the creator asked for, as assembled — the object `payload_sha256` hashes. */
    request: jsonb("request").notNull(),
    model: text("model").notNull(),
    /** REQ-J02. Required with no default upstream (`RunInferenceParams`). */
    promptBundleVersion: text("prompt_bundle_version").notNull(),
    configVersion: integer("config_version").notNull(),
    outcome: generationOutcome("outcome").notNull(),
    /**
     * THE OUTPUT LIVES HERE (R11), and NEVER in `model_usage.usage_raw` —
     * which `assertMeteringOnly` already refuses at the write capability. R11
     * is the reminder that the temptation exists, and this column is what
     * removes the excuse.
     */
    output: jsonb("output"),
    /** REQ-I04 / REQ-C02: every usable output names its weakest point. */
    weakestPoint: text("weakest_point"),
    /** REQ-C03's honest failure, in the creator's own record. */
    refusalReason: text("refusal_reason"),
    /**
     * R7: which rule fired, and whether the one rewrite happened. Stored so a
     * refusal is inspectable — its shape is `packages/modes`' to declare.
     */
    killTest: jsonb("kill_test").notNull(),
    /**
     * R6's bound, as a CONSTRAINT rather than as a loop condition. Exactly one
     * automatic rewrite is allowed; a second is a product that retries until
     * something passes, which is the behaviour REQ-C03 exists to forbid. The
     * loop lives in `packages/modes`; this is what makes its result storable
     * only if it obeyed.
     */
    rewriteCount: integer("rewrite_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "generations_profile_workspace_fk",
    }).onDelete("cascade"),
    // FOUR COLUMNS, one constraint, two properties — see the parent's
    // `generation_attempts_attempt_mode_profile_workspace_uq`. `onUpdate`
    // RESTRICT is named explicitly rather than defaulted: once a generation
    // exists, the attempt's identity columns cannot be rewritten underneath
    // it, which is the one piece of R14's "immutable" the database can hold on
    // its own.
    foreignKey({
      columns: [t.attemptId, t.mode, t.profileId, t.workspaceId],
      foreignColumns: [
        generationAttempts.attemptId,
        generationAttempts.mode,
        generationAttempts.profileId,
        generationAttempts.workspaceId,
      ],
      name: "generations_attempt_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    unique("generations_id_profile_workspace_uq").on(
      t.id,
      t.profileId,
      t.workspaceId
    ),
    // ONE terminal generation per attempt (R14c): a retry of `vendor_complete`
    // settles the stored candidate, it does not mint a second record.
    uniqueIndex("generations_attempt_uq").on(t.attemptId),
    // An equality, not an implication, in BOTH directions: a usable generation
    // with no output is an empty product, and an honest refusal carrying
    // output is a refusal that leaked the thing it refused to give.
    check(
      "generations_output_iff_usable",
      sql`(${t.outcome} = 'usable') = (${t.output} IS NOT NULL)`
    ),
    // REQ-I04 as a constraint. NOT NULL is not enough — '' satisfies it and
    // names no weakest point at all — so the predicate is "contains at least
    // one non-whitespace character". `~ '[^[:space:]]'` RATHER THAN
    // `length(btrim(x)) > 0`, and the difference is measured, not stylistic:
    // Postgres `btrim` with one argument strips SPACES ONLY, so a
    // weakest-point of "\n" passed the btrim form and the first run of
    // `generation-schema.test.ts` caught it. The class it left open is exactly
    // the one a UI textarea produces.
    check(
      "generations_usable_names_weakest_point",
      sql`${t.outcome} <> 'usable'
          OR (${t.weakestPoint} IS NOT NULL AND ${t.weakestPoint} ~ '[^[:space:]]')`
    ),
    check(
      "generations_refusal_states_reason",
      sql`(${t.outcome} = 'honest_refusal')
          = (${t.refusalReason} IS NOT NULL AND ${t.refusalReason} ~ '[^[:space:]]')`
    ),
    check(
      "generations_one_rewrite",
      sql`${t.rewriteCount} >= 0 AND ${t.rewriteCount} <= 1`
    ),
  ]
);

export type GenerationAttempt = typeof generationAttempts.$inferSelect;
export type NewGenerationAttempt = typeof generationAttempts.$inferInsert;
export type GenerationAttemptState =
  (typeof generationAttemptState.enumValues)[number];
export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;
export type GenerationOutcome = (typeof generationOutcome.enumValues)[number];
