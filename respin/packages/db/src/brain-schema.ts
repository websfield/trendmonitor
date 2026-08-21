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
import { workspaces } from "./schema";

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
    // Per-field provenance (REQ-B02). Entry shape, pinned by plan A-8:
    //   { quote, inputId, startUtf16, endUtf16, confidence }
    // `inputId` is a foreign id living inside jsonb, which the composite FK
    // cannot see — so `writeBrainDoc` validates it against `onboarding_inputs`
    // scoped to the same (profile_id, workspace_id). Offsets are UTF-16 code
    // units, indexing the NORMALISED content stored in `onboarding_inputs`.
    sourceEvidence: jsonb("source_evidence"),
    status: brainDocStatus("status").notNull().default("proposed"),
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
    // At most one active version per (profile, kind). A partial unique index
    // rather than application code, for the same reason `credit_ledger`'s
    // money invariants are constraints: application-code uniqueness is a race.
    uniqueIndex("brain_docs_one_active_uq")
      .on(t.profileId, t.kind)
      .where(sql`${t.status} = 'active'`),
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
    sourceReferences: jsonb("source_references").notNull(),
    evidenceEntries: jsonb("evidence_entries").notNull(),
    testedCaveats: jsonb("tested_caveats").notNull(),
    confidence: text("confidence").notNull(),
    saturation: frameworkSaturation("saturation").notNull(),
    visibility: frameworkVisibility("visibility").notNull(),
    // Deliberately carved out of the both-columns-NOT-NULL rule (plan A-5): a
    // SHARED framework belongs to no profile and no workspace, so both are NULL
    // and MATCH SIMPLE skips the FK — which is correct here, and is why the
    // CHECKs below carry the invariant instead.
    ownerProfileId: uuid("owner_profile_id"),
    workspaceId: uuid("workspace_id"),
    curatorStatus: curatorStatus("curator_status").notNull().default("proposed"),
    curatedBy: text("curated_by"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.ownerProfileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "frameworks_owner_profile_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("frameworks_slug_uq").on(t.slug),
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
  ]
);

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;
export type BrainDoc = typeof brainDocs.$inferSelect;
export type NewBrainDoc = typeof brainDocs.$inferInsert;
export type Framework = typeof frameworks.$inferSelect;
export type NewFramework = typeof frameworks.$inferInsert;
export type BrainKind = (typeof brainKind.enumValues)[number];
export type BrainDocStatus = (typeof brainDocStatus.enumValues)[number];
export type FrameworkVisibility = (typeof frameworkVisibility.enumValues)[number];
