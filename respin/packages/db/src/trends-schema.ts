// Slice 8 trends storage (REQ-E01–E06; tenancy REQ-A03; library contributions
// REQ-D04/R-9; decisions R-88 submitted-transcript-is-reference-class, R-89
// sessionless system spend, R-91 saturation measured-or-unmeasured, R-96 a
// pasted reference has NO channel baseline and none is invented).
// Raw third-party transcript text is never global by default: private rows
// carry the profile/workspace pair and shared rows require the affirmative
// shared_analysis rights scope.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
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
import { creatorProfiles, frameworks } from "./brain-schema";
import { contentRightsBasis } from "./content-rights-schema";
import { onboardingInputs } from "./onboarding-schema";
import { users } from "./schema";

const id = () => uuid("id").primaryKey().$defaultFn(() => uuidv7());
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date());

export const trendSourceKind = pgEnum("trend_source_kind", ["youtube", "submitted"]);
export const trendRightsScope = pgEnum("trend_rights_scope", ["profile_private", "shared_analysis"]);
export const transcriptState = pgEnum("trend_transcript_state", [
  "transcript_required",
  "transcript_available",
  "transcript_unavailable",
]);
export const trendSaturation = pgEnum("trend_saturation", ["measured", "unmeasured"]);
/**
 * Whether the item's CHANNEL BASELINE was observed (slice 8c, R-96 / R1).
 *
 * `measured` is every row that existed before migration 0026 (the column
 * default backfills them) and every row a metadata producer writes: the eight
 * baseline columns are NOT NULL and the two arithmetic CHECKs apply verbatim.
 * `unavailable` is a creator-pasted reference: there is no channel, no view
 * count, no observation window and no outlier ratio, and the CHECK below
 * refuses any of the eight being filled in — a ratio on a pasted item would be
 * an invented specific (REQ-I03). It is also PRIVATE BY CONSTRAINT: the same
 * CHECK ties `unavailable` to `rights_scope = 'profile_private'`, so an
 * unmeasured row can never sit in the shared feed that ranks by ratio.
 */
export const trendBaselineState = pgEnum("trend_baseline_state", ["measured", "unavailable"]);
export const autopsyStatus = pgEnum("trend_autopsy_status", ["completed", "failed"]);
export const autopsyCacheClaimStatus = pgEnum("trend_autopsy_cache_claim_status", ["pending", "completed", "failed", "parked"]);

export const trendSources = pgTable(
  "trend_sources",
  {
    id: id(),
    kind: trendSourceKind("kind").notNull(),
    externalId: text("external_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    profileId: uuid("profile_id"),
    workspaceId: uuid("workspace_id"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.profileId, t.workspaceId], foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId], name: "trend_sources_profile_workspace_fk" }).onDelete("cascade"),
    check("trend_sources_submitted_is_private", sql`(${t.kind} = 'submitted') = (${t.profileId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL)`),
    uniqueIndex("trend_sources_youtube_external_id_uq").on(t.externalId).where(sql`${t.kind} = 'youtube'`),
    uniqueIndex("trend_sources_submitted_profile_external_id_uq").on(t.profileId, t.externalId).where(sql`${t.kind} = 'submitted'`),
  ]
);

// Feed membership is stored creator data, never caller-selected query text.
// The entitlement cap is enforced by the scoped writer, not by this table.
export const trackedNiches = pgTable(
  "tracked_niches",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    niche: text("niche").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "tracked_niches_profile_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("tracked_niches_profile_niche_uq").on(t.profileId, t.niche),
    check("tracked_niches_niche_nonblank", sql`${t.niche} ~ '[^[:space:]]'`),
  ]
);

export const trendItems = pgTable(
  "trend_items",
  {
    id: id(),
    sourceId: uuid("source_id").notNull().references(() => trendSources.id, { onDelete: "restrict" }),
    externalVideoId: text("external_video_id").notNull(),
    niche: text("niche").notNull(),
    title: text("title").notNull(),
    // THE EIGHT BASELINE COLUMNS (0026, R1): nullable at the column, NOT NULL
    // by CHECK when `baseline_state = 'measured'`, all NULL when
    // `'unavailable'`. Nullability moved from the column to the CHECK so the
    // measured shape is exactly what it was before the migration.
    channelId: text("channel_id"),
    videoViews: bigint("video_views", { mode: "bigint" }),
    channelMedianRecentViews: numeric("channel_median_recent_views", { precision: 24, scale: 8 }),
    baselineSampleSize: integer("baseline_sample_size"),
    baselineObservationIds: jsonb("baseline_observation_ids"),
    baselineWindowStartsAt: timestamp("baseline_window_starts_at", { withTimezone: true }),
    baselineWindowEndsAt: timestamp("baseline_window_ends_at", { withTimezone: true }),
    // NOT one of the eight. For a pasted reference this is the moment the
    // creator pasted it — the only date this product observed — and the R5
    // reader deliberately projects `createdAt`, never this, for such rows.
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }).notNull(),
    // Stored alongside exact inputs/provenance so this is reproducible.
    outlierRatio: numeric("outlier_ratio", { precision: 24, scale: 8 }),
    baselineState: trendBaselineState("baseline_state").notNull().default("measured"),
    rightsScope: trendRightsScope("rights_scope").notNull(),
    profileId: uuid("profile_id"),
    workspaceId: uuid("workspace_id"),
    transcriptState: transcriptState("transcript_state").notNull(),
    saturation: trendSaturation("saturation").notNull(),
    saturationMatchingItems: integer("saturation_matching_items"),
    saturationPopulationSize: integer("saturation_population_size"),
    saturationPrevalence: numeric("saturation_prevalence", { precision: 18, scale: 12 }),
    saturationWindowStartsAt: timestamp("saturation_window_starts_at", { withTimezone: true }),
    saturationWindowEndsAt: timestamp("saturation_window_ends_at", { withTimezone: true }),
    saturationMethodVersion: text("saturation_method_version"),
    saturationUnmeasuredReason: text("saturation_unmeasured_reason"),
    staleAt: timestamp("stale_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "trend_items_profile_workspace_fk",
    }).onDelete("cascade"),
    // The two arithmetic CHECKs keep applying VERBATIM to every `measured`
    // row; `'unavailable' OR (…)` exempts exactly that one state, so a third
    // state added later would have to satisfy the measured arithmetic (fail
    // closed) rather than silently skip it.
    check("trend_items_baseline_provenance", sql`${t.baselineState} = 'unavailable' OR (${t.channelMedianRecentViews} > 0 AND ${t.baselineSampleSize} > 0 AND jsonb_typeof(${t.baselineObservationIds}) = 'array' AND jsonb_array_length(${t.baselineObservationIds}) = ${t.baselineSampleSize} AND ${t.baselineWindowStartsAt} < ${t.baselineWindowEndsAt} AND ${t.sourcePublishedAt} <= ${t.baselineWindowEndsAt})`),
    check("trend_items_outlier_ratio_matches_inputs", sql`${t.baselineState} = 'unavailable' OR ${t.outlierRatio} = ROUND(${t.videoViews}::numeric / ${t.channelMedianRecentViews}, 8)`),
    // R1: `unavailable` ⇒ all eight NULL AND profile_private; `measured` ⇒ all
    // eight NOT NULL (the arithmetic above then applies). Written as two
    // conjunctions joined by OR rather than an equality so that a NULL in any
    // one column cannot make the whole predicate NULL-and-therefore-pass.
    check(
      "trend_items_baseline_state_shape",
      sql`(${t.baselineState} = 'unavailable' AND ${t.rightsScope} = 'profile_private' AND ${t.channelId} IS NULL AND ${t.videoViews} IS NULL AND ${t.channelMedianRecentViews} IS NULL AND ${t.baselineSampleSize} IS NULL AND ${t.baselineObservationIds} IS NULL AND ${t.baselineWindowStartsAt} IS NULL AND ${t.baselineWindowEndsAt} IS NULL AND ${t.outlierRatio} IS NULL) OR (${t.baselineState} = 'measured' AND ${t.channelId} IS NOT NULL AND ${t.videoViews} IS NOT NULL AND ${t.channelMedianRecentViews} IS NOT NULL AND ${t.baselineSampleSize} IS NOT NULL AND ${t.baselineObservationIds} IS NOT NULL AND ${t.baselineWindowStartsAt} IS NOT NULL AND ${t.baselineWindowEndsAt} IS NOT NULL AND ${t.outlierRatio} IS NOT NULL)`
    ),
    check(
      "trend_items_rights_profile_pair",
      sql`(${t.rightsScope} = 'profile_private') = (${t.profileId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL)`
    ),
    check(
      "trend_items_saturation_measurement_shape",
      sql`(${t.saturation} = 'unmeasured') = (${t.saturationMatchingItems} IS NULL AND ${t.saturationPopulationSize} IS NULL AND ${t.saturationPrevalence} IS NULL AND ${t.saturationWindowStartsAt} IS NULL AND ${t.saturationWindowEndsAt} IS NULL AND ${t.saturationMethodVersion} IS NULL)`
    ),
    // THE REASON IS TIED TO ITS CAUSE, not merely to a vocabulary (learning
    // gate CHANGE 5 / code review C11, fix round 1). Before 0028 the only
    // admitted reason was `incomplete_provenance`, so every creator paste
    // shipped — into the creator's own export — an absence attributed to a
    // cause it does not have: a pasted reference's provenance is COMPLETE;
    // what it has is no channel baseline and therefore NO POPULATION to
    // measure prevalence against. `no_population` is stamped exactly when
    // `baseline_state = 'unavailable'`, and the CASE makes that the database's
    // fact rather than one writer's habit. A future baseline state falls to
    // the `incomplete_provenance` branch — fail-closed: it must amend this
    // CHECK to claim a different reason, the same way a third baseline state
    // must satisfy the measured arithmetic above.
    check(
      "trend_items_saturation_measurement_nonempty",
      sql`(${t.saturation} = 'unmeasured' AND ${t.saturationUnmeasuredReason} = CASE WHEN ${t.baselineState} = 'unavailable' THEN 'no_population' ELSE 'incomplete_provenance' END) OR (${t.saturation} = 'measured' AND ${t.saturationMatchingItems} >= 0 AND ${t.saturationPopulationSize} > 0 AND ${t.saturationMatchingItems} <= ${t.saturationPopulationSize} AND ${t.saturationPrevalence} = ROUND(${t.saturationMatchingItems}::numeric / ${t.saturationPopulationSize}::numeric, 12) AND ${t.saturationWindowStartsAt} < ${t.saturationWindowEndsAt} AND ${t.saturationMethodVersion} ~ '[^[:space:]]' AND ${t.saturationUnmeasuredReason} IS NULL)`
    ),
    uniqueIndex("trend_items_shared_source_video_uq")
      .on(t.sourceId, t.externalVideoId)
      .where(sql`${t.rightsScope} = 'shared_analysis'`),
    uniqueIndex("trend_items_private_source_video_profile_uq")
      .on(t.sourceId, t.externalVideoId, t.profileId)
      .where(sql`${t.rightsScope} = 'profile_private'`),
    // A table-level UNIQUE CONSTRAINT (not an index) so the three composite
    // foreign keys below can reference (id, rights_scope): every transcript,
    // cache claim and autopsy carries its item's rights scope, and the
    // database refuses a row whose scope disagrees with its item's — the
    // producers in trends-storage.ts already select the item by scope, this
    // makes that agreement structural (10b-1 phase review, tenancy item).
    unique("trend_items_id_rights_scope_uq").on(t.id, t.rightsScope),
    // The same tie one notch further for the PRIVATE class: a private row's
    // profile must be its item's profile. `MATCH SIMPLE` semantics mean the
    // key is inert when the child's profile_id is NULL (every shared row), so
    // this constrains exactly the rows that carry a profile.
    unique("trend_items_id_profile_uq").on(t.id, t.profileId),
  ]
);

export const trendTranscripts = pgTable(
  "trend_transcripts",
  {
    id: id(),
    trendItemId: uuid("trend_item_id").notNull().references(() => trendItems.id, { onDelete: "cascade" }),
    rightsScope: trendRightsScope("rights_scope").notNull(),
    profileId: uuid("profile_id"),
    workspaceId: uuid("workspace_id"),
    content: text("content").notNull(),
    contentDigest: text("content_digest").notNull(),
    provenance: jsonb("provenance").notNull(),
    rightsBasis: contentRightsBasis("rights_basis").notNull(),
    rightsSubjectUserId: uuid("rights_subject_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    rightsEvidenceId: text("rights_evidence_id"),
    /**
     * THE REFERENCE-CLASS ONBOARDING INPUT THIS TRANSCRIPT IS (slice 8c, R-96
     * / R2). A creator-pasted transcript is slice 4's `reference` intake —
     * quote budget, barred kinds, the echo corpus all apply — and this FK is
     * what makes that a fact of the database rather than of one writer:
     * `provenance->>'kind' = 'creator_paste'` iff this is set (CHECK below),
     * UNIQUE so one input backs one transcript, and ON DELETE CASCADE so
     * deleting the input deletes the third-party text with it. The
     * `trend_items` row it hangs off is NOT touched by that cascade (no
     * trigger, by the 2026-07-30 rule); the R5 reader derives the display
     * state from the transcript row's presence, never from the column alone.
     */
    referenceInputId: uuid("reference_input_id").references(() => onboardingInputs.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "trend_transcripts_profile_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.trendItemId, t.rightsScope],
      foreignColumns: [trendItems.id, trendItems.rightsScope],
      name: "trend_transcripts_trend_item_rights_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.trendItemId, t.profileId],
      foreignColumns: [trendItems.id, trendItems.profileId],
      name: "trend_transcripts_trend_item_profile_fk",
    }).onDelete("cascade"),
    check(
      "trend_transcripts_rights_profile_pair",
      sql`(${t.rightsScope} = 'profile_private') = (${t.profileId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL)`
    ),
    check(
      "trend_transcripts_rights_shape",
      sql`(${t.rightsScope} = 'profile_private'
            AND ${t.rightsBasis} = 'profile_private'
            AND ${t.rightsSubjectUserId} IS NULL
            AND ${t.rightsEvidenceId} IS NULL)
          OR (${t.rightsScope} = 'shared_analysis'
            AND ${t.rightsBasis} = 'creator_consent'
            AND ${t.rightsSubjectUserId} IS NOT NULL
            AND ${t.rightsEvidenceId} IS NOT NULL
            AND ${t.rightsEvidenceId} ~ '[^[:space:]]')
          OR (${t.rightsScope} = 'shared_analysis'
            AND ${t.rightsBasis} = 'independently_licensed'
            AND ${t.rightsSubjectUserId} IS NULL
            AND ${t.rightsEvidenceId} IS NOT NULL
            AND ${t.rightsEvidenceId} ~ '[^[:space:]]')`
    ),
    index("trend_transcripts_rights_subject_user_idx").on(t.rightsSubjectUserId),
    // `IS NOT DISTINCT FROM`, not `=`: a provenance with NO `kind` key yields
    // NULL under `=`, and a NULL CHECK passes — so `{}` beside a real
    // reference_input_id would have been ACCEPTED. Every pre-0026 fixture has
    // no `kind` and no reference id, which this form reads as false = false.
    check(
      "trend_transcripts_creator_paste_has_reference",
      sql`(${t.provenance}->>'kind' IS NOT DISTINCT FROM 'creator_paste') = (${t.referenceInputId} IS NOT NULL)`
    ),
    uniqueIndex("trend_transcripts_reference_input_uq").on(t.referenceInputId),
    uniqueIndex("trend_transcripts_shared_item_digest_uq")
      .on(t.trendItemId, t.contentDigest)
      .where(sql`${t.rightsScope} = 'shared_analysis'`),
    uniqueIndex("trend_transcripts_private_item_digest_profile_uq")
      .on(t.trendItemId, t.contentDigest, t.profileId)
      .where(sql`${t.rightsScope} = 'profile_private'`),
  ]
);

export const autopsies = pgTable(
  "autopsies",
  {
    id: id(),
    trendItemId: uuid("trend_item_id").notNull().references(() => trendItems.id, { onDelete: "cascade" }),
    contentDigest: text("content_digest").notNull(),
    analysisVersion: text("analysis_version").notNull(),
    rightsScope: trendRightsScope("rights_scope").notNull(),
    rightsBasis: contentRightsBasis("rights_basis").notNull(),
    rightsSubjectUserId: uuid("rights_subject_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    rightsEvidenceId: text("rights_evidence_id"),
    profileId: uuid("profile_id"),
    workspaceId: uuid("workspace_id"),
    status: autopsyStatus("status").notNull(),
    analysis: jsonb("analysis").notNull(),
    matchedFrameworkId: uuid("matched_framework_id").references(() => frameworks.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "autopsies_profile_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.trendItemId, t.rightsScope],
      foreignColumns: [trendItems.id, trendItems.rightsScope],
      name: "autopsies_trend_item_rights_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.trendItemId, t.profileId],
      foreignColumns: [trendItems.id, trendItems.profileId],
      name: "autopsies_trend_item_profile_fk",
    }).onDelete("cascade"),
    check(
      "autopsies_rights_profile_pair",
      sql`(${t.rightsScope} = 'profile_private') = (${t.profileId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL)`
    ),
    check(
      "autopsies_rights_shape",
      sql`(${t.rightsScope} = 'profile_private'
            AND ${t.rightsBasis} = 'profile_private'
            AND ${t.rightsSubjectUserId} IS NULL
            AND ${t.rightsEvidenceId} IS NULL)
          OR (${t.rightsScope} = 'shared_analysis'
            AND ${t.rightsBasis} = 'creator_consent'
            AND ${t.rightsSubjectUserId} IS NOT NULL
            AND ${t.rightsEvidenceId} IS NOT NULL
            AND ${t.rightsEvidenceId} ~ '[^[:space:]]')
          OR (${t.rightsScope} = 'shared_analysis'
            AND ${t.rightsBasis} = 'independently_licensed'
            AND ${t.rightsSubjectUserId} IS NULL
            AND ${t.rightsEvidenceId} IS NOT NULL
            AND ${t.rightsEvidenceId} ~ '[^[:space:]]')`
    ),
    index("autopsies_rights_subject_user_idx").on(t.rightsSubjectUserId),
    uniqueIndex("autopsies_shared_cache_identity_uq")
      .on(t.contentDigest, t.analysisVersion)
      .where(sql`${t.rightsScope} = 'shared_analysis'`),
    uniqueIndex("autopsies_private_cache_identity_uq")
      .on(t.contentDigest, t.analysisVersion, t.profileId)
      .where(sql`${t.rightsScope} = 'profile_private'`),
  ]
);

// Durable cache ownership is claimed before a vendor call. This is separate
// from the completed artefact so a racing miss cannot make two paid calls.
export const autopsyCacheClaims = pgTable("autopsy_cache_claims", {
  id: id(),
  trendItemId: uuid("trend_item_id").notNull().references(() => trendItems.id, { onDelete: "cascade" }),
  contentDigest: text("content_digest").notNull(),
  analysisVersion: text("analysis_version").notNull(),
  rightsScope: trendRightsScope("rights_scope").notNull(),
  rightsBasis: contentRightsBasis("rights_basis").notNull(),
  rightsSubjectUserId: uuid("rights_subject_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  rightsEvidenceId: text("rights_evidence_id"),
  profileId: uuid("profile_id"),
  workspaceId: uuid("workspace_id"),
  cacheScopeKey: text("cache_scope_key").notNull(),
  status: autopsyCacheClaimStatus("status").notNull(),
  autopsyId: uuid("autopsy_id").references(() => autopsies.id, { onDelete: "restrict" }),
  attemptCount: integer("attempt_count").notNull().default(sql`1`),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  // Opaque worker-attempt ownership prevents two scheduler retries from
  // spending concurrently against one cache identity. It carries no tenant
  // identity and is cleared by every terminal transition.
  activeSystemAttemptId: text("active_system_attempt_id"),
  lastFailureCode: text("last_failure_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ columns: [t.profileId, t.workspaceId], foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId], name: "autopsy_cache_claims_profile_workspace_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.trendItemId, t.rightsScope], foreignColumns: [trendItems.id, trendItems.rightsScope], name: "autopsy_cache_claims_trend_item_rights_scope_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.trendItemId, t.profileId], foreignColumns: [trendItems.id, trendItems.profileId], name: "autopsy_cache_claims_trend_item_profile_fk" }).onDelete("cascade"),
  check("autopsy_cache_claims_rights_profile_pair", sql`(${t.rightsScope} = 'profile_private') = (${t.profileId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL)`),
  check(
    "autopsy_cache_claims_rights_shape",
    sql`(${t.rightsScope} = 'profile_private'
          AND ${t.rightsBasis} = 'profile_private'
          AND ${t.rightsSubjectUserId} IS NULL
          AND ${t.rightsEvidenceId} IS NULL)
        OR (${t.rightsScope} = 'shared_analysis'
          AND ${t.rightsBasis} = 'creator_consent'
          AND ${t.rightsSubjectUserId} IS NOT NULL
          AND ${t.rightsEvidenceId} IS NOT NULL
          AND ${t.rightsEvidenceId} ~ '[^[:space:]]')
        OR (${t.rightsScope} = 'shared_analysis'
          AND ${t.rightsBasis} = 'independently_licensed'
          AND ${t.rightsSubjectUserId} IS NULL
          AND ${t.rightsEvidenceId} IS NOT NULL
          AND ${t.rightsEvidenceId} ~ '[^[:space:]]')`
  ),
  index("autopsy_cache_claims_rights_subject_user_idx").on(t.rightsSubjectUserId),
  check("autopsy_cache_claims_scope_key", sql`(${t.rightsScope} = 'shared_analysis' AND ${t.cacheScopeKey} = 'shared') OR (${t.rightsScope} = 'profile_private' AND ${t.cacheScopeKey} = ${t.profileId}::text)`),
  check("autopsy_cache_claims_attempt_count_positive", sql`${t.attemptCount} > 0`),
  check("autopsy_cache_claims_completed_has_autopsy", sql`(${t.status} = 'completed') = (${t.autopsyId} IS NOT NULL)`),
  check("autopsy_cache_claims_active_attempt_pending", sql`${t.activeSystemAttemptId} IS NULL OR ${t.status} = 'pending'`),
  uniqueIndex("autopsy_cache_claims_identity_uq").on(t.contentDigest, t.analysisVersion, t.rightsScope, t.cacheScopeKey),
]);

export type TrendItem = typeof trendItems.$inferSelect;
export type TrendTranscript = typeof trendTranscripts.$inferSelect;
export type Autopsy = typeof autopsies.$inferSelect;
export type AutopsyCacheClaim = typeof autopsyCacheClaims.$inferSelect;
export type TrackedNiche = typeof trackedNiches.$inferSelect;
