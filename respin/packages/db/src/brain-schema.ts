// M2a brain schema (tech-spec §2, plan `docs/plans/respin-m2a-cage-plan.md`).
//
// Every table here is profile-grained, which is the whole reason the cage
// exists: `creator_profiles` nests under `workspaces`, and R-9 says nothing
// crosses PROFILES either — not just workspaces. So each child carries
// `workspace_id` as a real column with a real FK, and every accessor filters on
// both (cage design rule 3, plan A-5).
//
// The composite FK is not defence in depth, it is the constraint that makes a
// cross-parented row unrepresentable. Both of its columns are NOT NULL for a
// measured reason: Postgres MATCH SIMPLE skips a composite FK entirely when ANY
// of its columns is NULL, so a nullable half admits a row naming a parent that
// does not exist. That was reproduced in both directions during review — a NULL
// profile_id accepted a bogus workspace_id, and a NULL workspace_id accepted a
// nonexistent profile_id.
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
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
import { memberships, users, workspaces } from "./schema";
import { contentRightsBasis } from "./content-rights-schema";
export { contentRightsBasis } from "./content-rights-schema";

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

export const brainKind = pgEnum("brain_kind", [
  "voice",
  "strategy",
  "performance_meta",
  "killtest",
]);

// M2a writes 'proposed' ONLY (plan A-10). Activation, supersession, the
// confirmation columns and `source_evidence NOT NULL` land together in M2b's
// migration — deliberately together, because an INSERT-only write surface plus
// a caller-chosen status plus the partial unique index below would let the
// first active row pin the brain forever with no supersede path.
export const brainDocStatus = pgEnum("brain_doc_status", [
  "proposed",
  "active",
  "superseded",
]);

export const frameworkSaturation = pgEnum("framework_saturation", [
  "observed",
  "emerging",
  "established",
  "saturated",
  "retired",
]);

export const frameworkVisibility = pgEnum("framework_visibility", [
  "shared",
  "private",
]);

export const curatorStatus = pgEnum("curator_status", [
  "proposed",
  "approved",
  "rejected",
]);

// Whether a profile counts against its workspace's per-tier `profileCaps`.
//
// THE DOWNGRADE COLUMN (R-30.3, slice 1's owner decision, default taken). A
// Studio workspace holding 5 profiles that downgrades to Creator (cap 1) must
// not lose four creators' brains — REQ-A04 deletion is a request, never a
// side effect of a plan change. So capacity is reduced by moving profiles OUT
// OF the cap rather than out of the database, and `archived` is that state.
//
// THE CAP THEREFORE COUNTS `active` ROWS ONLY, and that choice has a debt
// attached which is named here rather than discovered later: archive-then-
// reactivate is a route back over the cap unless reactivation re-checks it.
// Slice 1 ships NEITHER an archive nor a reactivate operation — nothing in
// product code can move this column off its default — so the route does not
// exist yet. Whichever slice adds `reactivateProfile` owes the same cap check
// `createProfile` makes; `decisions.md` records that as R-35's second half.
export const creatorProfileState = pgEnum("creator_profile_state", [
  "active",
  "archived",
  "deletion_tombstoned",
]);

// The tenancy anchor. `(id, workspace_id)` is unique so children can carry a
// composite FK to it — a plain FK to `id` alone would let a child name a
// profile whose workspace differs from its own.
export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    // SERVER-DERIVED, and in `GUARDED_WRITE_FIELDS` for the reason `status` is:
    // a caller who can supply this can supply `archived`, and a profile created
    // straight into `archived` costs nothing against the cap while still owning
    // brain documents — the per-tier entitlement would be bypassable by a
    // caller-chosen enum value, which is the exact shape of the M2b-1 round-2
    // silent-brain-activation finding one table over.
    state: creatorProfileState("state").notNull().default("active"),
    lifecycleVersion: integer("lifecycle_version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A table-level UNIQUE CONSTRAINT, deliberately, not `uniqueIndex`.
    // Composite FKs in the child tables reference these two columns, and
    // drizzle-kit emits every CREATE TABLE, then every FK ALTER TABLE, then
    // every CREATE INDEX — so a unique INDEX would not yet exist when the FKs
    // are added and the migration dies with "there is no unique constraint
    // matching given keys". A constraint is emitted inline in CREATE TABLE and
    // is therefore in place before any FK references it. Found by running the
    // migration, not by reading the emitted SQL: the constraint was present,
    // it was just present too late.
    unique("creator_profiles_id_workspace_uq").on(t.id, t.workspaceId),
    check("creator_profiles_lifecycle_version_positive", sql`${t.lifecycleVersion} >= 1`),
  ]
);

/**
 * The active creator profile chosen by ONE workspace member.
 *
 * This is deliberately membership-grained rather than cookie-, URL-, or
 * workspace-grained state: two people in the same Studio workspace may be
 * working on different creators at the same time. Both composite FKs carry
 * `workspace_id`, so neither a member nor a profile from another workspace can
 * be paired into this row even through a raw SQL writer.
 *
 * `profile_id` points at an existing profile, but "active" is a mutable state
 * and cannot be expressed by a foreign key. `profile-selection.ts` therefore
 * proves `creator_profiles.state = 'active'` while locking the row at every
 * sanctioned write, and joins the same predicate at every read. An archived
 * selection is absent, never a fallback to another profile.
 */
export const membershipProfileSelections = pgTable(
  "membership_profile_selections",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.workspaceId],
      foreignColumns: [memberships.userId, memberships.workspaceId],
      name: "membership_profile_selections_membership_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "membership_profile_selections_profile_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("membership_profile_selections_member_workspace_uq").on(
      t.userId,
      t.workspaceId
    ),
  ]
);

export const brainDocs = pgTable(
  "brain_docs",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    kind: brainKind("kind").notNull(),
    // Server-derived as max(version)+1 for the (profile_id, kind) pair, never
    // caller-supplied (plan A-4). The unique index below is what makes that a
    // property rather than a convention: without it nothing forces the value to
    // increment and nothing forbids a duplicate, so "editing creates a new
    // version" (REQ-C05) would be a comment.
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    // Per-field provenance (REQ-B02). Entry shape, enforced by
    // `sourceEvidenceEntrySchema` in with-workspace.ts:
    //   { field, quote, inputId, startUtf16, endUtf16 }
    // `field` is the RFC-6901 pointer naming which claim position this entry
    // supports (C-28) — without it this column is per-DOCUMENT provenance and
    // the REQ-B02 sentence above is not true of it. `confidence` is withdrawn
    // (C-15, and the dated REQ-B02 amendment).
    // `inputId` is a foreign id living inside jsonb, which the composite FK
    // cannot see — so `writeBrainDoc` validates it against `onboarding_inputs`
    // scoped to the same (profile_id, workspace_id). Offsets are UTF-16 code
    // units, indexing the NORMALISED content stored in `onboarding_inputs`.
    // NOT NULL from migration 0012, with a non-empty CHECK below. REQ-B02 is
    // per-field provenance, and a version carrying none records nothing — see
    // the CHECK for why an all-placeholder version is deliberately not
    // storable.
    sourceEvidence: jsonb("source_evidence").notNull(),
    status: brainDocStatus("status").notNull().default("proposed"),
    /**
     * THE REFERENCE CORPUS THIS VERSION WAS CHECKED AGAINST (C-29), recorded
     * as a SET OF INPUT IDS rather than compared by timestamp.
     *
     * Why a recorded set and not `created_at`: `created_at` is `defaultNow()`,
     * which in Postgres is TRANSACTION START time. An `onboarding_input` whose
     * transaction starts before a brain write and commits after it is invisible
     * at write time AND sits inside any `created_at`-bounded corpus rebuilt at
     * activation — so activation would refuse a version the write had already
     * cleared, permanently, with a priced rebuild as the only remedy. The
     * timestamp form does not remove that class; a recorded id set does,
     * because activation re-reads the exact corpus the write was judged
     * against.
     *
     * SERVER-DERIVED and in `GUARDED_WRITE_FIELDS`: it decides which corpus the
     * R-3 bar runs over, so a caller-suppliable value is a caller-suppliable
     * bar. An empty array means "this profile genuinely had no reference
     * inputs", which is a different fact from "nobody built a corpus" — the
     * distinction `assertNoReferenceEcho` refuses to guess at.
     */
    referenceCorpusIds: jsonb("reference_corpus_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Set by `confirmBrainDocFields`; server-derived from the session (C-13). */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: uuid("confirmed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * The sha256 of the content the human actually SAW when confirming.
     * Activation refuses unless it still matches, so a version cannot be
     * confirmed in one shape and activated in another (round-2 V3).
     */
    confirmedContentSha256: text("confirmed_content_sha256"),
    /**
     * Which claim positions were confirmed, and which as placeholders (C-18).
     *
     * NULLABLE, DELIBERATELY, and this is B-5's other half — settled in slice 3
     * as a contract rather than left as an unrecorded disagreement between the
     * plan and the schema. `NULL` means *never confirmed*; `[]` means
     * *confirmed, and nothing was*. A `NOT NULL DEFAULT '[]'` collapses those
     * into one value on the one column that answers "did a human decide
     * anything about this document" — and `activateBrainDoc`'s refusal counts
     * confirmed positions against the claim set to build its message, so it
     * needs the distinction to say an honest number. The plan document is what
     * changed here; the column did not.
     */
    confirmedFields: jsonb("confirmed_fields"),
    /** C-21's countable label, per field. Written by the server, never a caller.
     *  Nullable for the same reason as `confirmed_fields` above: unwritten and
     *  written-as-empty are different facts about our evidence. */
    evidenceCounts: jsonb("evidence_counts"),
    // Why this version exists. Never optional: R-8's "never silent" is only
    // true if every version carries its reason.
    reason: text("reason").notNull(),
    // Present now, written by M2b. They exist here so that "which version was
    // active at time T" is reconstructable — `created_at` ordering cannot
    // answer it once draft rows exist, since a draft written Monday may be
    // activated Friday.
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "brain_docs_profile_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("brain_docs_profile_kind_version_uq").on(
      t.profileId,
      t.kind,
      t.version
    ),
    // ADDED IN MIGRATION 0029 (slice 9a, contract C3) so that a child can carry
    // a SAME-TENANT composite FK to a brain document. `results.metric_declared_
    // by_doc_id` is the first: it names the STRATEGY VERSION that declared the
    // north-star metric a logged result was measured against, and the only FK
    // available without this unique would have been a bare one to `id` alone —
    // which `generations.brain_activation_id`'s docblock rejects in terms this
    // constraint exists to answer: it "would let this row name a snapshot
    // belonging to another profile: worse than none, because it would look like
    // tenancy". `brain_docs_profile_kind_version_uq` above cannot serve, because
    // a child holds an id, not a (kind, version) pair.
    //
    // ADDITIVE: `id` is already the primary key, so this constraint refuses
    // nothing that was previously storable — it exists purely to be a foreign
    // key TARGET, and it costs one index. A table `unique()` and not a
    // `uniqueIndex()` for the migration-0011 reason `creator_profiles` records:
    // drizzle-kit emits every CREATE TABLE, then every FK ALTER, then every
    // CREATE INDEX, so a unique INDEX would not yet exist when the referencing
    // FK is added. (`brain_docs` already exists, so 0029 emits this as an ALTER
    // TABLE ADD CONSTRAINT — which is exactly why the migration's statement
    // ORDER is checked rather than assumed; see 0029's header.)
    unique("brain_docs_id_profile_workspace_uq").on(
      t.id,
      t.profileId,
      t.workspaceId
    ),
    // At most one active version per (profile, kind). A partial unique index
    // rather than application code, for the same reason `credit_ledger`'s
    // money invariants are constraints: application-code uniqueness is a race.
    uniqueIndex("brain_docs_one_active_uq")
      .on(t.profileId, t.kind)
      .where(sql`${t.status} = 'active'`),
    // AN ACTIVE VERSION CARRIES ITS CONFIRMATION STAMP, as a constraint rather
    // than as application code. Round 2's V3 was exactly this: activation
    // never pinned the activated content to the confirmed content.
    //
    // `activated_at` JOINED THE CHECK IN SLICE 3 — register item B-5, closed.
    // An active row with no activation time is not a cosmetic gap: the column's
    // whole reason for existing is that "which version was active at time T" is
    // reconstructable once draft rows exist (see its own comment above), and a
    // NULL there makes that question unanswerable for that row FOREVER, because
    // `brain_docs` is append-only history. `activateBrainDoc` always sets it in
    // the same UPDATE that sets the status, so this constraint costs nothing on
    // the sanctioned path and closes the hand-run-UPDATE path that produced the
    // finding.
    //
    // WHAT THIS CHECK STILL DOES **NOT** COVER, stated because an earlier
    // version of this comment read wider than the constraint: AC-26 (every
    // claim position confirmed) remains an application-code guarantee in
    // `activateBrainDoc`, so a hand-run UPDATE during an incident can still
    // produce an active row with an inverted or incomplete `confirmed_fields`.
    // It is not expressible here — it needs `enumerateClaimFields`, which walks
    // a zod schema — and that limit is recorded rather than implied.
    check(
      "brain_docs_active_is_confirmed",
      sql`${t.status} <> 'active' OR (${t.confirmedAt} IS NOT NULL AND ${t.confirmedContentSha256} IS NOT NULL AND ${t.activatedAt} IS NOT NULL)`
    ),
    // REQ-B02 is PER-FIELD PROVENANCE, so a version with no evidence at all
    // records nothing about where its claims came from.
    //
    // THE INTERACTION WITH C-28 IS DELIBERATE AND IS STATED RATHER THAN LEFT
    // TO BE DISCOVERED: C-28 lets a claim position be either cited or hold
    // `[check]`, so an ALL-PLACEHOLDER version has zero evidence entries and
    // this CHECK refuses it. That is the decision — a version in which nothing
    // is grounded is not a version worth retaining, and storing one would put
    // a row in the append-only history that asserts nothing and still occupies
    // a version number. At least one claim must be grounded for the version to
    // exist. The refusal is named in `writeBrainDoc` so it reads as a rule
    // rather than as a constraint violation.
    check(
      "brain_docs_source_evidence_non_empty",
      sql`jsonb_array_length(${t.sourceEvidence}) > 0`
    ),
  ]
);

export const frameworks = pgTable(
  "frameworks",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    beats: jsonb("beats").notNull(),
    whyItConverts: text("why_it_converts").notNull(),
    applicability: jsonb("applicability").notNull(),
    // REQ-D01's "source references, evidence entries". `confidence` is derived
    // from these at load, never hand-typed in the seed — a value that can
    // exceed its evidence is the authority-borrowing R-29 forbids.
    //
    // SLICE 7 MADE THAT A CONSTRAINT (`frameworks_confidence_matches_evidence`
    // below). It was a comment for two milestones, on a `text NOT NULL` column
    // any writer could set to anything, in the one place the product states
    // how sure it is about somebody else's mechanism. `deriveFrameworkConfidence`
    // in `frameworks.ts` is the one producer and the CHECK is what makes it
    // the only one.
    sourceReferences: jsonb("source_references").notNull(),
    evidenceEntries: jsonb("evidence_entries").notNull(),
    testedCaveats: jsonb("tested_caveats").notNull(),
    confidence: text("confidence").notNull(),
    saturation: frameworkSaturation("saturation").notNull(),
    visibility: frameworkVisibility("visibility").notNull(),
    rightsBasis: contentRightsBasis("rights_basis").notNull(),
    rightsSubjectUserId: uuid("rights_subject_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    rightsEvidenceId: text("rights_evidence_id"),
    // Deliberately carved out of the both-columns-NOT-NULL rule (plan A-5): a
    // SHARED framework belongs to no profile and no workspace, so both are NULL
    // and MATCH SIMPLE skips the FK — which is correct here, and is why the
    // CHECKs below carry the invariant instead.
    ownerProfileId: uuid("owner_profile_id"),
    workspaceId: uuid("workspace_id"),
    curatorStatus: curatorStatus("curator_status").notNull().default("proposed"),
    curatedBy: text("curated_by"),
    version: integer("version").notNull().default(1),
    /**
     * WHEN THIS FRAMEWORK WAS RETIRED (slice 7, R5b / REQ-D02).
     *
     * A COLUMN AND NOT ONLY THE `saturation = 'retired'` VALUE THAT ALREADY
     * EXISTED, and the reason is that two things needed saying and one enum
     * slot could only say one of them. `saturation` is a claim about the
     * MARKET (how worn out the mechanism is); retirement is a claim about the
     * LIBRARY (we no longer recommend this). They usually coincide and
     * sometimes do not — a private framework its owner is done with is
     * retired without any claim about saturation at all.
     *
     * SO THEY ARE ONE FACT WITH TWO SPELLINGS, AND THE DATABASE KEEPS THEM
     * AGREEING (`frameworks_retired_stamp`, an EQUALITY). Two independent
     * columns answering "is this retired?" is the second-authority defect this
     * repo has paid for twice; an equality means the reader may filter on
     * either and get the same set, which is what lets R5b's stated rule
     * (`approved AND retired_at IS NULL`) be implemented literally without
     * inventing a second answer.
     */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    /**
     * WHEN A LATER VERSION REPLACED THIS ROW (slice 7, R5c).
     *
     * VERSIONING IS A NEW ROW, exactly as `brain_docs` versioning is, and that
     * is forced rather than chosen: `generations.framework_versions` records
     * `[{id, version}]` and its own docblock promises "a framework edited
     * later does not rewrite this generation's explanation". In-place editing
     * would make that sentence false the first time anyone edited anything —
     * the recorded version number would name text that no longer exists.
     *
     * `NULL` means THIS is the live version. The two partial unique indexes
     * below are what make "at most one live version per framework identity"
     * a property rather than an application-code race, the same way
     * `brain_docs_one_active_uq` does for a brain document.
     */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.ownerProfileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "frameworks_owner_profile_workspace_fk",
    }).onDelete("cascade"),
    index("frameworks_rights_subject_user_idx").on(t.rightsSubjectUserId),
    // FOUR PARTIAL UNIQUES REPLACING ONE GLOBAL `frameworks_slug_uq` (slice 7).
    //
    // The old index was `UNIQUE (slug)` over the whole table, which had two
    // consequences nobody had needed until private frameworks became writable:
    // a creator naming their own framework `confession-arc` would have been
    // refused because the LIBRARY has one, and versioning could not be a new
    // row at all because the second version would collide with the first.
    //
    // SPLIT BY VISIBILITY rather than expressed with `coalesce(owner, nil)` or
    // `NULLS NOT DISTINCT`, because within each predicate every key column is
    // non-NULL (a shared row has no owner by CHECK; a private row has one by
    // CHECK), so the ordinary NULL-distinct semantics cannot silently widen
    // either index.
    uniqueIndex("frameworks_shared_slug_version_uq")
      .on(t.slug, t.version)
      .where(sql`${t.visibility} = 'shared'`),
    uniqueIndex("frameworks_private_slug_version_uq")
      .on(t.ownerProfileId, t.slug, t.version)
      .where(sql`${t.visibility} = 'private'`),
    // ONE LIVE VERSION PER IDENTITY. Without these, `editPrivateFramework`'s
    // supersede-then-insert pair is a read-then-write two connections can both
    // win — the same reason `brain_docs_one_active_uq` exists rather than a
    // check in application code.
    uniqueIndex("frameworks_shared_live_uq")
      .on(t.slug)
      .where(sql`${t.visibility} = 'shared' AND ${t.supersededAt} IS NULL`),
    uniqueIndex("frameworks_private_live_uq")
      .on(t.ownerProfileId, t.slug)
      .where(sql`${t.visibility} = 'private' AND ${t.supersededAt} IS NULL`),
    // R-9 as a constraint rather than a seeder convention. `owner_profile_id IS
    // NULL` is the marker for "library-owned", so a private framework that lost
    // its owner would silently BECOME library content — creator data entering
    // the shared library by deletion.
    check(
      "frameworks_shared_has_no_owner",
      sql`${t.visibility} <> 'shared' OR (${t.ownerProfileId} IS NULL AND ${t.workspaceId} IS NULL)`
    ),
    check(
      "frameworks_private_has_owner",
      sql`${t.visibility} <> 'private' OR (${t.ownerProfileId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL)`
    ),
    check(
      "frameworks_rights_shape",
      sql`(${t.visibility} = 'private'
            AND ${t.rightsBasis} = 'profile_private'
            AND ${t.rightsSubjectUserId} IS NULL
            AND ${t.rightsEvidenceId} IS NULL)
          OR (${t.visibility} = 'shared'
            AND ${t.rightsBasis} = 'creator_consent'
            AND ${t.rightsSubjectUserId} IS NOT NULL
            AND ${t.rightsEvidenceId} IS NOT NULL
            AND ${t.rightsEvidenceId} ~ '[^[:space:]]')
          OR (${t.visibility} = 'shared'
            AND ${t.rightsBasis} = 'independently_licensed'
            AND ${t.rightsSubjectUserId} IS NULL
            AND ${t.rightsEvidenceId} IS NOT NULL
            AND ${t.rightsEvidenceId} ~ '[^[:space:]]')
          OR (${t.visibility} = 'shared'
            AND ${t.rightsBasis} = 'product_seed'
            AND ${t.rightsSubjectUserId} IS NULL
            AND ${t.rightsEvidenceId} IS NULL
            AND ${t.curatedBy} = 'seed:respin-library-v1')`
    ),
    // THE TWO SPELLINGS OF "RETIRED", AS AN EQUALITY — see `retiredAt` above.
    // Not an implication: a row stamped `retired_at` while still claiming an
    // active saturation is exactly the disagreement this closes, and so is a
    // `saturation = 'retired'` row with no stamp (the reader R5b specifies
    // filters on the stamp, so that row would come BACK as recommendable).
    check(
      "frameworks_retired_stamp",
      sql`(${t.saturation} = 'retired') = (${t.retiredAt} IS NOT NULL)`
    ),
    // `version` IS A SEQUENCE POSITION, so 0 and negatives are not versions.
    check("frameworks_version_positive", sql`${t.version} >= 1`),
    // CONFIDENCE CANNOT EXCEED ITS EVIDENCE (R-29), as a constraint.
    //
    // A `CASE`, NOT AN `AND` CHAIN, deliberately: `jsonb_array_length` RAISES
    // on a non-array, and Postgres does not guarantee that the left operand of
    // an `AND` is evaluated first — so an `AND` form would sometimes surface a
    // driver error instead of a constraint violation. `CASE` evaluates its
    // branches in order, by definition.
    //
    // The ladder is `deriveFrameworkConfidence`'s, and
    // `packages/db/tests/frameworks.test.ts` drives the two against each other
    // across the range rather than trusting that they were typed together
    // (CLAUDE.md 2026-08-18: a property that depends on two things agreeing is
    // proved generatively against the real producer).
    check(
      "frameworks_confidence_matches_evidence",
      sql`CASE
            WHEN jsonb_typeof(${t.evidenceEntries}) <> 'array' THEN false
            WHEN jsonb_array_length(${t.evidenceEntries}) = 0 THEN ${t.confidence} = 'unsupported'
            WHEN jsonb_array_length(${t.evidenceEntries}) = 1 THEN ${t.confidence} = 'single_case'
            WHEN jsonb_array_length(${t.evidenceEntries}) < 5 THEN ${t.confidence} = 'repeated'
            ELSE ${t.confidence} = 'contrasted'
          END`
    ),
    // ...and the four remaining jsonb columns really are arrays. `jsonb`
    // accepts the scalar `'null'::jsonb` and the string `'"x"'::jsonb`, both of
    // which satisfy NOT NULL while carrying nothing a reader can iterate — the
    // same hole `generation_attempts_candidate_is_object` closes one file over.
    check(
      "frameworks_json_columns_are_arrays",
      sql`jsonb_typeof(${t.beats}) = 'array'
          AND jsonb_typeof(${t.applicability}) = 'array'
          AND jsonb_typeof(${t.sourceReferences}) = 'array'
          AND jsonb_typeof(${t.testedCaveats}) = 'array'`
    ),
  ]
);

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;
export type MembershipProfileSelection =
  typeof membershipProfileSelections.$inferSelect;
export type NewMembershipProfileSelection =
  typeof membershipProfileSelections.$inferInsert;
export type CreatorProfileState =
  (typeof creatorProfileState.enumValues)[number];
export type BrainDoc = typeof brainDocs.$inferSelect;
export type NewBrainDoc = typeof brainDocs.$inferInsert;
export type Framework = typeof frameworks.$inferSelect;
export type NewFramework = typeof frameworks.$inferInsert;
export type BrainKind = (typeof brainKind.enumValues)[number];
export type BrainDocStatus = (typeof brainDocStatus.enumValues)[number];
export type FrameworkVisibility = (typeof frameworkVisibility.enumValues)[number];
