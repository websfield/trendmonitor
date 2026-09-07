// Slice 9a results schema (phase-9 R5-R8, the pinned contract C1-C4 in
// `docs/plans/respin-finish-phase-9a.md`). This file models the LOGGED RESULT,
// its closed vocabularies and the invariants the DATABASE holds; the writer,
// the scoped reader and the role/pause gates live in `with-workspace.ts`
// behind the write capabilities, exactly as `generation-schema.ts` splits them.
//
// THE WRITERS, NAMED — the list `generation-schema.ts`'s header exists to keep
// honest, and it is checked: `tests/table-writers.test.ts` enumerates exactly
// this one and fails on a second, per verb.
//
//   results   INSERT — `recordResult`. The only writer, and there is
//                      deliberately NO update path: a logged observation is
//                      append-only like `generations` and
//                      `generation_feedback`, so the row carries no
//                      `updated_at`. A creator whose numbers changed logs a
//                      NEW observation window; a result set that can be
//                      rewritten is not evidence, and this table is the one
//                      slice 9b builds promotion proposals from.
//
// WHAT THIS TABLE IS NOT: a score. Reach and conversion are stored in FOUR
// separate columns and there is no column, no view and no expression here that
// adds them (R9/REQ-F04). Two levers that are never summed is a property of
// the shape, not of a reviewer noticing.
//
// THE COMPOSITE FKs. Three of them, all same-tenant, all carrying
// `(profile_id, workspace_id)`: to `creator_profiles` (the profile grain every
// child in this schema has), to `generations` (R5's optional linkage) and to
// `brain_docs` (C3's declared-metric pointer). Both scope columns are NOT NULL
// for the measured reason `brain-schema.ts`'s header records: Postgres MATCH
// SIMPLE skips a composite FK entirely when ANY of its columns is NULL, so a
// nullable half admits a row naming a parent that does not exist.
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { brainDocs, creatorProfiles } from "./brain-schema";
import { CHECK, METRIC_DIRECTIONS, metricKeyFromLabel } from "./brain-content";
import { generations, type Generation } from "./generation-schema";
import { TreatmentKeyError } from "./errors";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/**
 * HOW GOOD THE EVIDENCE IS — an enum, never a deceptive boolean (R6).
 *
 * `connector_verified` IS IN THE VOCABULARY AND IS UNREACHABLE IN V1, and the
 * unreachability is STRUCTURAL rather than conventional (contract C1). R6 says
 * that state requires immutable connector/source/event provenance, so the
 * three connector columns below plus
 * `results_connector_verified_iff_provenance` — an EQUALITY — make it
 * unassignable by anything that cannot produce all three. v1 produces none, so
 * v1 cannot assign it, and that is a database property.
 *
 * WHAT IS DELIBERATELY NOT SHIPPED: a `CHECK evidence_state <>
 * 'connector_verified'`. It would say the same thing today and would need
 * LIFTING BY MIGRATION the day a connector lands — a control that becomes the
 * outage (CLAUDE.md 2026-07-30). The equality needs no migration to open: it
 * opens exactly when there is evidence to open it with.
 *
 * `quantified_self_reported` IS NOT "verified" AND NEVER SILENTLY BECOMES IT:
 * numbers a creator typed are numbers a creator typed. `unquantified` rows are
 * stored — a creator who posted and cannot get numbers has still told us
 * something — and are excluded from every numerical cohort (R16), which is
 * enforced here by "no lever columns at all" rather than by a filter somebody
 * has to remember to write.
 */
export const RESULT_EVIDENCE_STATES = [
  "unquantified",
  "quantified_self_reported",
  "connector_verified",
] as const;

/** Paid and organic are never pooled (R13/REQ-F01). */
export const RESULT_AUDIENCE_CLASSES = ["organic", "paid"] as const;

/**
 * The two levers, which never collapse into one number (R9/REQ-F04).
 *
 * A VOCABULARY WITH NO COLUMN OF ITS OWN, deliberately: the row stores each
 * lever in its OWN value/denominator pair rather than in a `lever` column plus
 * one value, because one row per lever would make "sum the levers" a `GROUP BY`
 * away. It is exported because `@respin/brain`'s comparison builder names the
 * levers it emits and a second hand-typed copy of two strings is how two
 * vocabularies drift.
 */
export const RESULT_LEVERS = ["reach", "conversion"] as const;

/**
 * WHAT ELSE COULD EXPLAIN THIS (R7/REQ-F02) — structured flags, never prose.
 *
 * The closed-code discipline `brain-reason.ts` established and states its
 * reason for: a comparison that hides its confounders is a stronger claim than
 * the data supports, and a confounder written as a sentence cannot be counted,
 * displayed beside the comparison, or refused when it is not one of these.
 * `results_confounders_closed_set` is built FROM this array, so the database's
 * half and application code's half cannot be typed differently on two days.
 */
export const RESULT_CONFOUNDER_CODES = [
  "topic_overlap",
  "posting_time_unknown",
  "account_growth",
  "spillover_from_other_post",
  "external_promotion",
  "platform_change",
] as const;

export type ResultEvidenceState = (typeof RESULT_EVIDENCE_STATES)[number];
export type ResultAudienceClass = (typeof RESULT_AUDIENCE_CLASSES)[number];
export type ResultLever = (typeof RESULT_LEVERS)[number];
export type ResultConfounderCode = (typeof RESULT_CONFOUNDER_CODES)[number];

// THE pgEnums ARE DERIVED FROM THE ARRAYS ABOVE, not typed a second time. The
// `GENERATION_FEEDBACK_REACTIONS` precedent runs the other way (array derived
// from enum) because that enum predates its array; here the contract pins the
// arrays, so they are the source and the enum is the projection. Either
// direction is fine; TWO hand-typed lists is not.
export const resultEvidenceState = pgEnum(
  "result_evidence_state",
  RESULT_EVIDENCE_STATES
);
export const resultAudienceClass = pgEnum(
  "result_audience_class",
  RESULT_AUDIENCE_CLASSES
);

/** The jsonb literal `results_confounders_closed_set` compares against. */
const CONFOUNDER_CODES_JSON = JSON.stringify([...RESULT_CONFOUNDER_CODES]);

/**
 * A RESULT A CREATOR LOGGED (R5-R9).
 *
 * APPEND-ONLY AND IMMUTABLE, the shape of `generations` and
 * `generation_feedback`: no `updated_at`, no update writer. The absence of an
 * UPDATE writer is held by `tests/table-writers.test.ts` — the database does
 * not forbid an UPDATE and this docblock does not pretend it does.
 *
 * THE FIVE COMPARABILITY PREDICATES ARE COLUMNS, not a query somebody writes
 * (phase-9 question 1): profile (the two scope columns), declared metric
 * VERSION (`metric_key` + `metric_declared_by_doc_id`), platform,
 * paid/organic class, and the stated observation window. Each is stored so a
 * comparison can be shown WITH the population it was drawn from, and so that
 * "these three results are comparable" is inspectable rather than asserted.
 *
 * ONE PLAIN INDEX, AND ITS REVISIT TRIGGER ALREADY FIRED. This docblock said
 * "NO INDEX BEYOND THE UNIQUE ONE, deliberately — a creator's own results are
 * tens of rows, and adding one here would state a performance property nobody
 * has measured", with the trigger "the first cohort query measured slow". Both
 * halves changed on 2026-09-04: `COMPARISON_POPULATION_MAX` was re-derived from
 * the domain (5 posts/day for 5 years, several observation windows each) and
 * went from 200 to 50,000, so "tens of rows" stopped being the population the
 * bound is sized for — and the query was then MEASURED rather than argued
 * about. See `results_profile_observed_idx` below for the numbers.
 */
export const results = pgTable(
  "results",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    /**
     * WHICH OUTPUT THIS IS A RESULT FOR — optional (R5).
     *
     * NULLABLE, and that nullability is what makes MATCH SIMPLE correct here
     * rather than dangerous, the same argument `generations.parent_id` records:
     * a result about a post this product did not write names no generation, so
     * the composite FK is skipped entirely for it — the intended meaning —
     * while any non-NULL value drags `profile_id` and `workspace_id` (both NOT
     * NULL) into the check and so can only name a generation of the SAME
     * creator in the SAME workspace. Caller scope is never trusted: the writer
     * re-reads the generation through the profile's own scoped predicate AND
     * the FK refuses what the read would have missed.
     */
    generationId: uuid("generation_id"),
    /** Where it was posted. A follows/1k on Shorts and on Reels are different populations. */
    platform: text("platform").notNull(),
    audienceClass: resultAudienceClass("audience_class").notNull(),
    /**
     * THE DECLARED NORTH-STAR METRIC'S STABLE KEY — `strategy.metric.key`
     * (REQ-B03, R8).
     *
     * A COPY OF THE KEY AND A POINTER TO THE VERSION, never a copy of `unit`
     * and `direction`. That split is C3's, and its reason is the codebase's
     * own, from `generations.brain_activation_id`: copying them would create
     * "a second answer to which versions did this run under, and the two could
     * disagree with nothing to adjudicate". `brain_docs` versions are
     * append-only, so the pointer cannot move under this row, and unit and
     * direction are read from the named version at comparison time.
     *
     * The KEY is here as well as the pointer because it is a COMPARABILITY
     * PREDICATE — two strategy versions can declare the same metric, and the
     * key is what a cohort groups on — and because the treatment key is
     * composed from it (C4). It is not a second authority on unit/direction:
     * nothing reads unit or direction from this column, because it does not
     * carry them.
     */
    metricKey: text("metric_key").notNull(),
    /**
     * THE `brain_docs` ROW ID OF THE STRATEGY VERSION THAT DECLARED IT (C3).
     *
     * SAME-TENANT COMPOSITE FK, which is the WHOLE POINT of this column's
     * mechanics and is why migration 0029 adds `UNIQUE (id, profile_id,
     * workspace_id)` to `brain_docs`. Without that unique the only available
     * FK would be a bare one to `id` alone, which
     * `generations.brain_activation_id`'s docblock rejects in terms this column
     * inherits: it "would let this row name a snapshot belonging to another
     * profile: worse than none, because it would look like tenancy". The
     * unique is additive, costs one index, and converts a recorded limitation
     * into a database-enforced property.
     *
     * WHAT THE FK STILL DOES NOT PROVE, stated rather than implied: that the
     * named document is a `strategy` version, that it is or ever was ACTIVE,
     * or that its content declares `metric.key = metric_key`. No CHECK can
     * reach across a table. `recordResult` derives BOTH this id and
     * `metric_key` from the profile's own active strategy document — neither
     * is caller-suppliable — so the three properties hold by construction at
     * the one writer, and `results-schema-write.test.ts` drives the refusal
     * when there is no compatible declaration (R8).
     */
    metricDeclaredByDocId: uuid("metric_declared_by_doc_id").notNull(),
    /** The stated observation window. A ratio with no period is an undefined denominator. */
    observedFrom: timestamp("observed_from", { withTimezone: true }).notNull(),
    observedTo: timestamp("observed_to", { withTimezone: true }).notNull(),
    /**
     * THE PROPOSAL COHORT'S SIXTH PREDICATE (C4) — server-computed, normalized,
     * stable, and NEVER creator-typed.
     *
     * NULLABLE, WHICH IS A DEVIATION FROM CONTRACT C2'S `treatmentKey: string`
     * AND IS FORCED BY CONTRACT C4'S OWN SENTENCE: "A result with no
     * `generationId` therefore has no derivable treatment key… 9a stores such a
     * result and it is eligible for the baseline, never for a treatment
     * cohort." The two halves of the contract cannot both be honoured by a NOT
     * NULL column: the only values left for a generation-less result would be
     * `''` or a sentinel, and three generation-less results sharing `''` would
     * form a "cohort" of three unrelated posts — the exact fabrication C4
     * forbids in its next clause ("do not fabricate a key"). So the absence is
     * spelled NULL, and `results_treatment_key_iff_generation` makes
     * "no generation ⇒ no key, a generation ⇒ a key" a database property in
     * BOTH directions rather than a writer's habit.
     */
    treatmentKey: text("treatment_key"),
    evidenceState: resultEvidenceState("evidence_state").notNull(),
    /**
     * THE TWO LEVERS, STORED APART AND NEVER SUMMED (R9/REQ-F04).
     *
     * `numeric` rather than `bigint`, and rather than one "value" column: a
     * reach is a whole number of views and a conversion rate is not, the
     * per-1k normalisation divides, and `trend_items.channel_median_recent_views`
     * already establishes `numeric` for a measured quantity in this schema.
     * Drizzle returns `numeric` as a STRING, which is deliberate at this layer:
     * the bytes a creator typed survive the round trip exactly, and whoever
     * computes a per-1k does the conversion where the rounding is visible.
     *
     * FOUR COLUMNS, NOT A `lever` DISCRIMINATOR PLUS ONE VALUE. One row per
     * lever would put "sum the levers" one `GROUP BY` away; four columns make
     * M8 (reach and conversion summed into one score) a thing somebody has to
     * WRITE rather than a thing a query returns.
     */
    reachValue: numeric("reach_value", { precision: 24, scale: 8 }),
    reachDenominator: numeric("reach_denominator", { precision: 24, scale: 8 }),
    conversionValue: numeric("conversion_value", { precision: 24, scale: 8 }),
    conversionDenominator: numeric("conversion_denominator", {
      precision: 24,
      scale: 8,
    }),
    /**
     * The structured confounder flags (R7). NOT NULL with a `[]` default,
     * because "the creator named none" is a real answer and is a different
     * fact from "nobody was asked" — the same distinction
     * `generations.framework_versions` draws for its empty array.
     *
     * `$type<ResultConfounderCode[]>()` IS LOAD-BEARING, NOT COSMETIC, and it
     * was added because builder B MEASURED its absence (2026-09-04): a bare
     * `jsonb()` reads back as `unknown`, so the closed set
     * `results_confounders_closed_set` enforces at the database did not survive
     * into `ResultRow`, and the comparison builder could not accept the row
     * without widening its own input to a vocabulary nobody owns. The CHECK is
     * still what makes the claim TRUE at runtime — three writers exist for this
     * column's contents and only one of them (`parseConfounders`) is ours — so
     * this annotation is a promise the database keeps, not one the type does.
     * It is asserted rather than assumed: `results-schema.test.ts` reads a
     * stored row back and pins its element type against
     * `RESULT_CONFOUNDER_CODES`.
     */
    confounders: jsonb("confounders")
      .$type<ResultConfounderCode[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * The creator's own words, optional.
     *
     * NOT A SECOND VOCABULARY — the `generation_feedback.note` precedent,
     * verbatim. Nothing branches on this column, nothing counts it, and no
     * comparison, cohort or proposal may be derived from it; it exists so a
     * creator can say something the six confounder codes cannot. The CHECK
     * below is the byte-identical predicate
     * `generation_feedback_note_says_something` uses, for the reason recorded
     * there: NOT NULL is not the property, "says something" is, and `''` and
     * `'\n'` both satisfy the first while failing the second.
     */
    note: text("note"),
    /**
     * THE THREE COLUMNS THAT GATE `connector_verified` (R6, contract C1).
     *
     * All three NULL in v1, because v1 has no connector — and the equality
     * CHECK below is what turns that from a fact about today's code into a
     * fact about the database. `connector_observed_at` is the connector's own
     * observation stamp, NOT `created_at`: the point of the state is that
     * something other than the creator's typing witnessed the number.
     */
    connectorSource: text("connector_source"),
    connectorEventId: text("connector_event_id"),
    connectorObservedAt: timestamp("connector_observed_at", {
      withTimezone: true,
    }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "results_profile_workspace_fk",
    }).onDelete("cascade"),
    // R5's same-tenant linkage. THREE columns, so a result cannot name a
    // generation belonging to another profile or another workspace; the target
    // is `generations_id_profile_workspace_uq`, which the slice-6 schema put
    // there for exactly this arrival ("slices 7 and 9 add lineage… and results
    // (`results >─ generations`)").
    //
    // `onDelete: "cascade"` — a result about a deleted generation is an
    // observation whose subject is gone, and REQ-A04 deletion removes the whole
    // profile tree anyway; `onUpdate: "restrict"` for the reason
    // `generation_feedback_generation_fk` gives: the identity columns of a row
    // something else names cannot be rewritten underneath it.
    foreignKey({
      columns: [t.generationId, t.profileId, t.workspaceId],
      foreignColumns: [
        generations.id,
        generations.profileId,
        generations.workspaceId,
      ],
      name: "results_generation_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    // C3's declared-metric pointer, same-tenant. Its target is the
    // `brain_docs_id_profile_workspace_uq` migration 0029 adds — see this
    // column's docblock for why a bare FK to `id` alone was refused.
    //
    // `onDelete: "cascade"`: `brain_docs` has no delete path at all (it is
    // append-only history), so the only way this fires is the profile cascade
    // that is already taking this row anyway. `restrict` would have been a
    // second cascade path racing the first, for no property this table needs.
    foreignKey({
      columns: [t.metricDeclaredByDocId, t.profileId, t.workspaceId],
      foreignColumns: [brainDocs.id, brainDocs.profileId, brainDocs.workspaceId],
      name: "results_metric_doc_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    // ONE OBSERVATION PER (OUTPUT, METRIC, CLASS, WINDOW) — beyond contract
    // C2's six, and here because the hazard is this slice's own:
    // `generation_feedback_generation_reaction_uq`'s docblock already names it
    // ("slice 9's 'n >= 3 comparable results' must not be reachable by one
    // creator clicking seven times"), and a cohort minimum reached by pressing
    // submit three times is the learning dishonesty 9a exists to prevent.
    //
    // WHAT IT STILL PERMITS, deliberately: the same post logged over a
    // DIFFERENT window (day 1 and day 7 are two observations, not a duplicate),
    // under a different metric version, or for the paid and organic halves
    // separately. PARTIAL, `WHERE generation_id IS NOT NULL`, because a result
    // naming no generation has nothing to be a duplicate OF — there is no
    // identity to key on, and a NULL in a unique index is distinct from every
    // other NULL anyway, so the predicate says what is true rather than
    // relying on that.
    // THE COMPARISON READ'S INDEX (migration 0030), and the only plain index on
    // this table. It is here because it was MEASURED — `EXPLAIN (ANALYZE,
    // BUFFERS)` on real Postgres (Docker, 2026-09-04), running exactly the
    // query `comparableResults` emits with no stratum, in two shapes:
    //
    //   THE ORDINARY CREATOR (300 own rows in a 60,300-row table)
    //     Index Scan using this index, Index Cond on (profile_id,
    //     workspace_id), 16 buffers, then a 102 kB in-memory quicksort.
    //     0.18 ms. WITHOUT it this is a scan of the whole table for one
    //     creator's history, and it is what every creator does.
    //
    //   AT THE BOUND (60,000 own rows beside another 60,000)
    //     Seq Scan + "Sort Method: external merge Disk: 3592kB", 35.6 ms.
    //     The planner IGNORES this index there and is right to: forcing it
    //     with `enable_seqscan = off` gives 38.5 ms, slightly WORSE. At 83% of
    //     a profile's rows an index adds random heap access and saves nothing.
    //
    // SO THE WARRANT IS THE ORDINARY CASE, NOT THE OUTLIER. That is a
    // CORRECTION of what this comment said when the index landed: it claimed
    // "WITH: Index Scan, no sort node, 11.4 ms" at 60,000 rows, which was a
    // real reading and does NOT reproduce — that probe built the index INSIDE
    // the loading transaction, so it had perfect physical correlation and
    // fresh statistics that a normally-maintained index does not. Re-measured
    // fairly, the bound case gets no help from any index and ~36 ms is simply
    // what it costs. The number was wrong; the index is still right, for a
    // better reason.
    //
    // FOUR COLUMNS IN THE QUERY'S OWN ORDER: the two scope columns (the
    // equality predicate every read of this table carries) then the sort key.
    // The `DESC` mirrors the `ORDER BY` and is NOT load-bearing — Postgres
    // reads a btree backwards just as happily — it is written this way so a
    // reader can match the index to the query without thinking about it.
    //
    // IT SERVES THE STRATUM BRANCH TOO, as a prefix: that query adds equality
    // predicates on `platform`, `audience_class`, `metric_key` and
    // `metric_declared_by_doc_id` plus a range on the window, all of which are
    // applied after this index has already narrowed to one profile.
    index("results_profile_observed_idx").on(
      t.profileId,
      t.workspaceId,
      t.observedTo.desc(),
      t.id.desc()
    ),
    uniqueIndex("results_generation_metric_window_uq")
      .on(
        t.generationId,
        t.metricKey,
        // PLATFORM JOINED THE KEY IN MIGRATION 0032, and leaving it out was a
        // defect with a HARMFUL printed remedy rather than a missing niceness.
        // One draft posted to TikTok AND to Reels is TWO results over the same
        // window and class — platform is a comparability predicate precisely
        // because "a follows/1k on Shorts and on Reels are different
        // populations wearing one name". Without it here the second platform
        // was refused as a duplicate, and `ResultDuplicateError` told the
        // creator to "log a different observation window" — on an APPEND-ONLY
        // table with no delete path, so a creator who followed the instruction
        // wrote a falsified window into their own baseline permanently. A
        // usable and WRONG remedy is the class `billing-errors.ts` names, and
        // the index was the half that was wrong.
        t.platform,
        t.audienceClass,
        t.observedFrom,
        t.observedTo
      )
      .where(sql`${t.generationId} IS NOT NULL`),
    // `UNIQUE (id, profile_id, workspace_id)` for the reason `generations` has
    // its twin: 9b hangs `proposal_evidence_results` off this table (R19a's
    // same-tenant FKs), and a plain FK to `id` alone would let an evidence row
    // name a result belonging to another profile. A table `unique()` and not a
    // `uniqueIndex()` so that it is emitted INLINE in CREATE TABLE and
    // therefore exists before any future FK ALTER references it — the
    // migration-0011 lesson `creator_profiles` records.
    unique("results_id_profile_workspace_uq").on(
      t.id,
      t.profileId,
      t.workspaceId
    ),
    // ---------------------------------------------------------------------
    // THE INVARIANTS THE DATABASE ENFORCES (contract C2). Each is driven by a
    // test that inserts a violating row directly: a CHECK nothing has ever
    // tried to violate is a comment.
    // ---------------------------------------------------------------------
    // 1. `unquantified` ⇒ NO lever columns at all. This is what makes R16
    //    ("unquantified never enters a numerical cohort") structural rather
    //    than a filter every reader has to remember: there is no number on the
    //    row for a cohort to include.
    check(
      "results_unquantified_has_no_levers",
      sql`${t.evidenceState} <> 'unquantified'
          OR (${t.reachValue} IS NULL AND ${t.reachDenominator} IS NULL
              AND ${t.conversionValue} IS NULL AND ${t.conversionDenominator} IS NULL)`
    ),
    // 2. ...and anything CLAIMING to be quantified carries at least one FULL
    //    lever pair. A "quantified" row with no numbers is the deceptive
    //    boolean R6 replaced, wearing an enum.
    check(
      "results_quantified_has_a_lever",
      sql`${t.evidenceState} = 'unquantified'
          OR ((${t.reachValue} IS NOT NULL AND ${t.reachDenominator} IS NOT NULL)
              OR (${t.conversionValue} IS NOT NULL AND ${t.conversionDenominator} IS NOT NULL))`
    ),
    // 3. ...and a lever is present as a PAIR or not at all. Not one of C2's
    //    six literally, and it is the same sentence as the denominator rule
    //    below applied to the other absence: a value with no denominator is a
    //    per-1k over an UNDEFINED denominator, which is not a small number
    //    either. Written as two boolean equalities, so neither side can be
    //    NULL and make the whole predicate pass by being unknown.
    check(
      "results_lever_pairs_complete",
      sql`(${t.reachValue} IS NULL) = (${t.reachDenominator} IS NULL)
          AND (${t.conversionValue} IS NULL) = (${t.conversionDenominator} IS NULL)`
    ),
    // 4. Any denominator present ⇒ > 0. "A per-1k over a zero denominator is
    //    not a small number, it is undefined."
    //
    //    IT IS NOT SUFFICIENT ON ITS OWN, and saying so here is the correction
    //    rather than an aside: `'NaN'::numeric > 0` is TRUE in Postgres, so
    //    this predicate ADMITS a NaN denominator. Measured on Postgres 17
    //    (2026-09-04), not reasoned about. `results_lever_figures_are_numbers`
    //    below is the other half; the two together are what makes "any
    //    denominator present ⇒ a real number greater than zero" a database
    //    property. Neither alone says that.
    check(
      "results_denominators_positive",
      sql`(${t.reachDenominator} IS NULL OR ${t.reachDenominator} > 0)
          AND (${t.conversionDenominator} IS NULL OR ${t.conversionDenominator} > 0)`
    ),
    // 4b. ...AND EVERY LEVER FIGURE IS A REAL NUMBER (migration 0031).
    //
    //    THE DEFECT THIS CLOSES, found by builder C running it rather than
    //    writing the plausible sentence about CHECK constraints: `numeric`
    //    has a NaN, `NaN > 0` is TRUE, and `NaN IS NULL` is FALSE — so a NaN
    //    denominator satisfied every constraint on this table and the invariant
    //    the contract lists under "the database enforces, not the application"
    //    was, for that one value, enforced only by `decimalOrThrow` at the
    //    single writer. One layer where the contract claimed two.
    //
    //    ALL FOUR COLUMNS, NOT JUST THE DENOMINATORS, and the scope was decided
    //    by measurement: `'NaN'::numeric / 1000 * 1000` is NaN and
    //    `1000 / 'NaN'::numeric * 1000` is NaN. A NaN VALUE poisons a per-1k
    //    exactly as thoroughly as a NaN denominator.
    //
    //    WHAT IT WOULD ACTUALLY HAVE DONE, checked rather than dramatised:
    //    NOT a wrong median. `@respin/brain`'s `per1k` already refuses a
    //    non-finite value or denominator (`Number.isFinite`) and THROWS
    //    `ComparisonInputError`, so a single stored NaN would have taken out
    //    the creator's WHOLE comparison screen, permanently, with no way for
    //    them to remove the row. That is the honest blast radius: an
    //    unrecoverable refusal rather than a quiet lie, and it is still exactly
    //    what a constraint on an append-only table exists to prevent. The
    //    silent-wrong-median outcome is what the same row would produce if that
    //    guard were ever relaxed to skip bad rows instead of throwing.
    //
    //    `<> 'NaN'::numeric` IS THE DETECTOR, AND THE OBVIOUS ONE DOES NOT
    //    WORK: `numeric` NaN EQUALS ITSELF (unlike IEEE floats), so the usual
    //    `x = x` idiom returns TRUE for NaN and detects nothing. Measured:
    //    `'NaN' = 'NaN'` → true, `'NaN' <> 'NaN'` → false, `42 <> 'NaN'` → true,
    //    `NULL <> 'NaN'` → NULL. The `IS NULL OR` arm is therefore belt and
    //    braces rather than load-bearing (a NULL comparison already yields NULL
    //    and a CHECK passes on NULL), and it is written out so the predicate
    //    reads as "absent, or a real number" instead of relying on three-valued
    //    logic a reader has to reconstruct.
    //
    //    INFINITY IS DELIBERATELY NOT MENTIONED, because it is already
    //    unreachable and a clause that can never fire is a dead control: the
    //    columns are `numeric(24, 8)`, and `'Infinity'::numeric(24,8)` is
    //    refused by the TYPE with "numeric field overflow" (measured, both
    //    signs). `results-schema.test.ts` pins that second layer, so removing
    //    the precision/scale is a red test rather than a silent reopening.
    check(
      "results_lever_figures_are_numbers",
      sql`(${t.reachValue} IS NULL OR ${t.reachValue} <> 'NaN'::numeric)
          AND (${t.reachDenominator} IS NULL OR ${t.reachDenominator} <> 'NaN'::numeric)
          AND (${t.conversionValue} IS NULL OR ${t.conversionValue} <> 'NaN'::numeric)
          AND (${t.conversionDenominator} IS NULL OR ${t.conversionDenominator} <> 'NaN'::numeric)`
    ),
    // 5. A window with no width is not a window.
    check("results_window_forward", sql`${t.observedTo} > ${t.observedFrom}`),
    // 6. `connector_verified` IFF all three connector columns — an EQUALITY in
    //    both directions, which is what makes the state unassignable to a
    //    caller that cannot produce the provenance AND makes the provenance
    //    columns unfillable on a row that does not claim the state. See the
    //    vocabulary's docblock for why this is not spelled as a ban.
    check(
      "results_connector_verified_iff_provenance",
      sql`(${t.evidenceState} = 'connector_verified')
          = (${t.connectorSource} IS NOT NULL AND ${t.connectorEventId} IS NOT NULL
             AND ${t.connectorObservedAt} IS NOT NULL)`
    ),
    // 7. The `generation_feedback_note_says_something` predicate, verbatim.
    check(
      "results_note_says_something",
      sql`${t.note} IS NULL OR ${t.note} ~ '[^[:space:]]'`
    ),
    // 8. THE TREATMENT KEY EXISTS EXACTLY WHEN IT IS DERIVABLE (C4) — see the
    //    column's docblock. An equality, so neither a generation-linked result
    //    with no key nor a generation-less result WEARING one is storable, and
    //    "do not fabricate a key" is a thing the database refuses.
    check(
      "results_treatment_key_iff_generation",
      sql`(${t.generationId} IS NOT NULL) = (${t.treatmentKey} IS NOT NULL)`
    ),
    // 9. The confounder codes are CLOSED at the database (R7), built from
    //    `RESULT_CONFOUNDER_CODES` above rather than re-typed here — `<@` is
    //    jsonb containment, so it is true exactly when every element of the
    //    column is one of the six. `jsonb_typeof` is the half `<@` does not
    //    cover: the scalar `'"topic_overlap"'::jsonb` is contained in the array
    //    too, and an array is what every reader iterates.
    check(
      "results_confounders_closed_set",
      sql`jsonb_typeof(${t.confounders}) = 'array'
          AND ${t.confounders} <@ ${sql.raw(`'${CONFOUNDER_CODES_JSON}'::jsonb`)}`
    ),
  ]
);

export type ResultRow = typeof results.$inferSelect;
export type NewResult = typeof results.$inferInsert;

/**
 * THE COLUMNS A COMPARISON READ CROSSES THE BOUNDARY WITH (slice 9a fix pass,
 * 2026-09-04) — ONE list, used as the SELECT and as the source of the row
 * type, so the two cannot disagree.
 *
 * WHY A PROJECTION AT ALL. `COMPARISON_POPULATION_MAX` governs BYTES as well as
 * rows, and `SELECT *` made those bytes unbounded in the one place the bound
 * was supposed to be the bound: at 50,000 rows a typical page is ~15 MB, and a
 * page whose rows each carry the `RESULT_NOTE_MAX` cap is ~120 MB in one server
 * render. `note` is the only large column and NO COMPARISON READS IT — so it
 * does not cross. The cap on one row is now structural (no unbounded text at
 * all) rather than a number nobody enforces.
 *
 * WHAT IS IN IT, and the rule that decides: EXACTLY what the comparison reads,
 * PLUS `workspace_id`. The fifteen comparison fields are
 * `@respin/brain`'s `ComparisonResultInput`, read from that file rather than
 * remembered. `workspace_id` is the sixteenth and is NOT one of them: it is
 * here because the CAGE's own tests assert both scope columns on every row a
 * scoped accessor returns, and a projection that dropped it would make the
 * workspace axis unassertable on the one read whose population is a whole
 * history. A tenancy assertion removed to save 16 bytes is not a saving.
 *
 * WHAT IS OUT, named so nobody has to diff two lists: `note` (the reason this
 * exists), the three `connector_*` columns, `generation_id` and `created_at`.
 * None can change a median. Adding one back is a deliberate edit to this
 * object, which is the point of there being an object.
 *
 * IT IS NOT TYPED AS `ComparisonResultInput`, deliberately, even though the
 * dependency edge would now allow it. Typing `@respin/db`'s read surface by its
 * CONSUMER would make this package's contract depend on what `@respin/brain`
 * happens to need this month, which is the inversion the edge direction exists
 * to prevent. The two are held together STRUCTURALLY instead, and
 * `tests/results-comparison-contract.test.ts` is what proves the assignability
 * still holds — the `llm-deadline-coherence.test.ts` arrangement for two
 * packages that must agree without importing each other.
 */
export const comparableResultProjection = {
  id: results.id,
  profileId: results.profileId,
  // THE SIXTEENTH, and not one of the comparison's fifteen — see above.
  workspaceId: results.workspaceId,
  platform: results.platform,
  audienceClass: results.audienceClass,
  metricKey: results.metricKey,
  metricDeclaredByDocId: results.metricDeclaredByDocId,
  observedFrom: results.observedFrom,
  observedTo: results.observedTo,
  treatmentKey: results.treatmentKey,
  evidenceState: results.evidenceState,
  reachValue: results.reachValue,
  reachDenominator: results.reachDenominator,
  conversionValue: results.conversionValue,
  conversionDenominator: results.conversionDenominator,
  confounders: results.confounders,
};

/**
 * One row of a comparison read.
 *
 * `Pick<ResultRow, keyof typeof comparableResultProjection>` rather than a
 * hand-written field list, so there is ONE definition of which columns cross
 * and the column types come from the schema itself. A field added to or removed
 * from the projection object changes this type in the same edit; two lists
 * could not be got wrong in different ways because there is one.
 */
export type ComparableResultRow = Pick<
  ResultRow,
  keyof typeof comparableResultProjection
>;

/**
 * THE FIVE COMPARABILITY PREDICATES A SCOPED READ CAN APPLY (phase-9 question
 * 1, contract C5).
 *
 * IT IS OPTIONAL AT THE ACCESSOR (2026-09-04). 9a fetches the WHOLE
 * population and lets `@respin/brain` derive the strata from it, because
 * partitioning results into comparable strata IS comparability logic and lives
 * beside `inStratum` — and because a caller cannot know the strata before it
 * has the rows. This type is what 9b passes to fetch ONE cohort, and what
 * keeps the SQL and `inStratum` reading the window the same way.
 *
 * IT IS `ComparisonStratum` MINUS `profileId`, and the missing field is the
 * point rather than an omission: the profile predicate is the CAGE's, supplied
 * by the accessor from a minted `ProfileScope` and never by a caller. A
 * `profileId` here would be a second answer to "whose results are these", and
 * a caller-suppliable one at that — which is the whole shape `withWorkspace`
 * exists to remove.
 *
 * THE WINDOW IS CONTAINMENT, AND IT IS PINNED TO `@respin/brain`'s OWN
 * `inStratum`: a row is in the stratum when `observed_from >=
 * stratum.observedFrom AND observed_to <= stratum.observedTo`. Written here
 * because the SQL that applies it and the TypeScript that re-applies it are in
 * two packages, and slice 8c's most expensive defect was exactly two packages
 * choosing bounds independently. `results-schema.test.ts` drives each of the
 * five predicates with a row that fails only that one, so a SQL predicate
 * that drifts wider or narrower than `inStratum` is a red test rather than a
 * cohort nobody can reproduce.
 */
export type ComparableResultsStratum = {
  platform: string;
  audienceClass: ResultAudienceClass;
  metricKey: string;
  /**
   * C3's pointers for the non-empty set of Strategy versions declaring the
   * exact same `{key,label,unit,direction}` tuple. Those versions are one
   * semantic metric population; the scoped SQL reader uses this set only as
   * provenance membership and never accepts profile/workspace from it.
   */
  metricDeclaredByDocIds: readonly string[];
  observedFrom: Date;
  observedTo: Date;
};

/**
 * What a scoped comparison read returns.
 *
 * `truncated` EXISTS BECAUSE A CLIPPED POPULATION IS NOT A SMALLER ONE, IT IS
 * A DIFFERENT CLAIM. Every scoped list in this package is clamped (an
 * append-only table read by a server component whose caller may pass a
 * URL-derived page size), and until this type existed the comparison read
 * inherited that clamp SILENTLY: a creator past the bound got a median over
 * their most recent page while the screen reported it as their history. That
 * is not a weaker claim, it is a false one, on the screen R20 governs.
 *
 * `rows` IS A PROJECTION, NOT A `ResultRow` (2026-09-04). See
 * `comparableResultProjection` for why: `SELECT *` put the unbounded `note`
 * column into a read bounded at 50,000 rows, and no comparison reads it.
 *
 * A BOOLEAN AND THE BOUND, NOT A TOTAL COUNT. The honest sentence a screen can
 * say is "this used your most recent N results in this population, and you
 * have more"; a precise total costs a second aggregate query over the same
 * predicate on every render and buys a number nobody acts on differently.
 * **Revisit trigger:** the first screen that needs to say HOW MANY more —
 * that is the moment to add the count, not before.
 */
export type ComparableResults = {
  rows: ComparableResultRow[];
  /** True when the population is larger than `limit` and was clipped to it. */
  truncated: boolean;
  /** The bound that was applied, so a caller can name it without importing it. */
  limit: number;
};

/**
 * The declared north-star metric a result can be measured against (R8, C3).
 *
 * `unit` and `direction` are NOT stored on the result row — they are read from
 * the `brain_docs` version `metric_declared_by_doc_id` names, at comparison
 * time, through this one function. That is C3's rule and its reason is
 * `generations.brain_activation_id`'s: a copy would be "a second answer… and
 * the two could disagree with nothing to adjudicate".
 */
export type DeclaredMetric = {
  key: string;
  label: string;
  unit: string;
  direction: (typeof METRIC_DIRECTIONS)[number];
};

/**
 * READ A STRATEGY VERSION'S DECLARED METRIC, or `null` if it has not declared
 * a usable one — the ONE reader, so the write path (which refuses a result
 * with no compatible declaration) and the comparison path (which labels the
 * number and decides which direction is better) cannot disagree about what
 * "declared" means.
 *
 * THE KEY IS DERIVED FROM THE LABEL, NEVER READ FROM STORAGE, and this is the
 * slice-9a BLOCK's correction rather than a preference. The earlier version
 * read `metric.key` off the stored content and required it to be non-empty.
 * `metric.key` is `serverOwned`, `parseBrainContent` STRIPS every server-owned
 * position in the single funnel, and `writeBrainDoc` stores that stripped
 * output — so no document any product path has ever written contains a key,
 * this function returned `null` for every creator, `/results` rendered
 * "no declared metric" for all of them and `recordResult` refused every
 * submission. The whole slice was unreachable.
 *
 * The proof was already in the repo and green: `interview-ops.test.ts` asserts
 * `metric.key` is `undefined` on a document produced by the real
 * `submitInterview`. Both results suites hand-built their `brain_docs` fixture
 * with a key in it and so never met the real producer — CLAUDE.md's slice-8c
 * lesson exactly. `results-schema-write.test.ts` now drives the interview.
 *
 * `metricKeyFromLabel` (brain-content.ts) is the one definition of the slug,
 * shared with the interview that names it in the pre-strip payload.
 *
 * `null` FOR FOUR DIFFERENT ABSENCES, all of which mean "there is nothing to
 * measure against yet": no `metric` object at all; a `label` that is blank or
 * is the `[check]` placeholder (no label, no identity); a `unit` that is blank
 * or `[check]`; and a `direction` that is not one of the two closed values
 * (which `[check]` is not). The caller turns that into a refusal that NAMES
 * the missing piece — this function does not compose copy.
 *
 * WHY `[check]` IS AN ABSENCE HERE AND NOT A VALUE: `[check]` means the
 * creator has not committed to that claim. A per-1k printed with a `[check]`
 * unit is a number with no name, and "higher is better" inferred from a
 * `[check]` direction is the product guessing which way a creator wants their
 * own metric to go — REQ-I03's invented specific, one screen further on.
 */
export function declaredMetricOf(content: unknown): DeclaredMetric | null {
  if (typeof content !== "object" || content === null) return null;
  const metric = (content as { metric?: unknown }).metric;
  if (typeof metric !== "object" || metric === null) return null;
  const record = metric as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const unit = typeof record.unit === "string" ? record.unit.trim() : "";
  const direction = record.direction;
  // THE LABEL IS THE IDENTITY'S SOURCE. A stored `metric.key` is not read at
  // all, even when one is present (a hand-built fixture, a legacy row): two
  // sources would be two answers, and the stored one is the answer that does
  // not exist in production.
  if (label.length === 0 || label === CHECK) return null;
  const key = metricKeyFromLabel(label);
  if (unit.length === 0 || unit === CHECK) return null;
  if (
    typeof direction !== "string" ||
    !(METRIC_DIRECTIONS as readonly string[]).includes(direction)
  ) {
    return null;
  }
  return { key, label, unit, direction: direction as DeclaredMetric["direction"] };
}

/** The separator between the treatment key's four positions. */
const TREATMENT_KEY_SEPARATOR = "|";

/**
 * ONE FUNCTION, ONE READER (contract C4) — the R15 discipline applied to a
 * field rather than to a constant.
 *
 * WHAT IT IS: a server-computed, normalized, stable string naming WHAT WAS
 * TESTED, so that three results sharing it are three runs of one thing rather
 * than three unrelated posts. Never creator-typed and never free text: the
 * only caller is `recordResult`, which builds it from the generation it has
 * just re-read through the profile's own scoped predicate.
 *
 * THE FOUR POSITIONS, in this fixed order:
 *
 *     frameworkId@version(+…) | mode | brainActivationId | metricKey
 *
 * EVERY POSITION IS ALWAYS EMITTED, EMPTY IF ABSENT, which is a spelling
 * choice C4 leaves open and this comment is where it is written down: C4 says
 * "the parts that are present", and OMITTING an absent part makes the key
 * positionally ambiguous — a three-part key could be read as either the first
 * three or the last three positions. In practice only the framework position
 * can be empty (`mode` and `brain_activation_id` are NOT NULL on `generations`
 * and `metric_key` is NOT NULL here), so the cost is one leading separator on
 * a generation that named no framework, and the benefit is that "same key"
 * means "same tuple" for every shape this key can take.
 *
 * FRAMEWORKS ARE SORTED AND JOINED WITH `+`, because `generations.framework_
 * versions` is an ARRAY (`frameworkVersionsUsed` in `@respin/credits` can
 * return more than one) and the array's ORDER is the order the frameworks were
 * offered in, which is not a property of the treatment. Sorting is what makes
 * two identical treatments produce one key instead of two.
 *
 * IT REFUSES RATHER THAN GUESSES. A blank part, a part containing the
 * separator, or a `framework_versions` value that is not the shape
 * `generations` promises raises `TreatmentKeyError` — because a treatment key
 * that quietly absorbed a `|` from one of its parts could impersonate a
 * different treatment, and a key derived from an unreadable array is a cohort
 * predicate nobody can reproduce. `generations.framework_versions` crossed a
 * `jsonb` boundary, so it is checked here for the reason
 * `frameworkVersionsOf` checks it there: "the alternative to checking it is a
 * cast".
 */
export function treatmentKeyFor(args: {
  generation: Pick<
    Generation,
    "mode" | "frameworkVersions" | "brainActivationId"
  >;
  metricKey: string;
}): string {
  const { generation, metricKey } = args;
  const frameworks = parseFrameworkVersions(generation.frameworkVersions);
  const frameworkPart = frameworks
    .map((f) => `${part(f.id, "framework id")}@${f.version}`)
    .sort()
    .join("+");
  return [
    frameworkPart,
    part(generation.mode, "mode"),
    part(generation.brainActivationId, "brain activation id"),
    part(metricKey, "metric key"),
  ].join(TREATMENT_KEY_SEPARATOR);
}

/** NFC + trimmed, refusing blanks and any part carrying the separator. */
function part(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new TreatmentKeyError(`the ${what} is not text`);
  }
  const normalised = value.normalize("NFC").trim();
  if (normalised.length === 0) {
    throw new TreatmentKeyError(`the ${what} is blank`);
  }
  if (normalised.includes(TREATMENT_KEY_SEPARATOR)) {
    throw new TreatmentKeyError(
      `the ${what} contains the '${TREATMENT_KEY_SEPARATOR}' the key is built with`
    );
  }
  return normalised;
}

/**
 * `[{id, version}]`, fail-closed — the shape `generations` promises.
 *
 * `id` is returned as `unknown` rather than cast: `part()` is what validates
 * it (non-blank text carrying no separator), and a cast here would be a second
 * claim about the same value that nothing checks.
 */
function parseFrameworkVersions(
  value: unknown
): { id: unknown; version: number }[] {
  if (!Array.isArray(value)) {
    throw new TreatmentKeyError("the generation's framework versions are not an array");
  }
  return value.map((entry, i) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TreatmentKeyError(`framework version ${i} is not an object`);
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.version !== "number" || !Number.isInteger(record.version)) {
      throw new TreatmentKeyError(
        `framework version ${i} does not carry an integer version`
      );
    }
    return { id: record.id as string, version: record.version };
  });
}
