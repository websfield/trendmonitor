-- R-96 (slice 8c): A PASTED REFERENCE HAS NO CHANNEL BASELINE, AND A PASTED
-- TRANSCRIPT IS THE REFERENCE-CLASS ONBOARDING INPUT IT WAS STORED AS.
--
-- Every statement below is drizzle-generated from `trends-schema.ts`; this
-- header is the only hand-written part. Two columns, one enum, one FK, one
-- unique index, and the two existing baseline CHECKs re-issued with a
-- one-state exemption.
--
-- WHAT IT ADDS.
--   trend_items.baseline_state   enum trend_baseline_state('measured' |
--     'unavailable'), NOT NULL DEFAULT 'measured'. The default is the BACKFILL:
--     every row that exists when this runs was written by a metadata producer
--     with all eight baseline columns filled, and is `measured`.
--   trend_items.{channel_id, video_views, channel_median_recent_views,
--     baseline_sample_size, baseline_observation_ids,
--     baseline_window_starts_at, baseline_window_ends_at, outlier_ratio}
--     DROP NOT NULL — nullability moves from the column to the CHECK
--     `trend_items_baseline_state_shape`: 'measured' ⇒ all eight NOT NULL;
--     'unavailable' ⇒ all eight NULL AND rights_scope = 'profile_private'.
--     `trend_items_baseline_provenance` and
--     `trend_items_outlier_ratio_matches_inputs` are DROPPED and RE-ADDED as
--     `baseline_state = 'unavailable' OR (<the previous predicate, verbatim>)`,
--     so every measured row is held to exactly what it was held to before.
--   trend_transcripts.reference_input_id uuid NULL, FK → onboarding_inputs(id)
--     ON DELETE CASCADE, UNIQUE (NULLs distinct), with CHECK
--     `trend_transcripts_creator_paste_has_reference`:
--     (provenance->>'kind' IS NOT DISTINCT FROM 'creator_paste') =
--     (reference_input_id IS NOT NULL). `IS NOT DISTINCT FROM` because a
--     provenance with no `kind` key is NULL under `=`, and a NULL CHECK passes.
--
-- FORWARD / BACKWARD COMPATIBILITY (expand-only).
--   Old code against the new schema: every INSERT it makes fills the eight
--   columns and omits `baseline_state`, which defaults to 'measured' — the
--   CHECK it lands under is the one it always satisfied. It never writes
--   `reference_input_id`, so the new transcript CHECK reads false = false. It
--   never reads either new column.
--   New code against the old schema: `recordPrivateTrendItem` with an
--   unavailable baseline and `recordPrivateTrendTranscript` both name the new
--   columns and FAIL (undefined column) rather than store a half-shaped row —
--   so this migration runs BEFORE the deploy that carries the intake, and the
--   window between them is closed rather than silently wrong.
--
-- ORDER: expand → migrate → contract.
--   EXPAND is this whole file (one transaction under the drizzle migrator):
--   drop the two CHECKs, relax the eight NOT NULLs, add the column with its
--   default, add the FK/index, re-add the three CHECKs. The re-add validates
--   every existing row; a populated table passes because the default puts each
--   row on the 'measured' branch it already satisfied.
--   MIGRATE is nothing: no data moves. CONTRACT is nothing: no column is
--   removed. B-4's lesson (0012 set NOT NULL + a CHECK on a populated table)
--   does not apply — no constraint here can be violated by a row this
--   migration did not write.
--
-- ROLLBACK (no automated down; hand SQL, in this order):
--   ALTER TABLE trend_transcripts DROP CONSTRAINT trend_transcripts_creator_paste_has_reference;
--   DROP INDEX trend_transcripts_reference_input_uq;
--   ALTER TABLE trend_transcripts DROP COLUMN reference_input_id;   -- drops its FK
--   DELETE FROM trend_items WHERE baseline_state = 'unavailable';   -- see below
--   ALTER TABLE trend_items DROP CONSTRAINT trend_items_baseline_state_shape,
--     DROP CONSTRAINT trend_items_baseline_provenance,
--     DROP CONSTRAINT trend_items_outlier_ratio_matches_inputs;
--   ALTER TABLE trend_items DROP COLUMN baseline_state;
--   ALTER TABLE trend_items ALTER COLUMN <each of the eight> SET NOT NULL;
--   ALTER TABLE trend_items ADD CONSTRAINT trend_items_baseline_provenance CHECK (<0025 predicate>),
--     ADD CONSTRAINT trend_items_outlier_ratio_matches_inputs CHECK (<0025 predicate>);
--   The DELETE is the one destructive step and it is stated rather than
--   hidden: an 'unavailable' row has NULL in eight columns the pre-0026 schema
--   requires, so SET NOT NULL fails while any exists. Those rows are creator
--   pastes; their transcripts and cache claims cascade from the item, and
--   their onboarding inputs (the reference-class text) SURVIVE — the paste is
--   still in the creator's record, only the trends-side projection is gone.
--   The enum type `trend_baseline_state` STAYS (dropping it is safe once no
--   column uses it, and leaving it costs nothing).
--
-- RESTORE IMPLICATIONS. A pre-0026 dump restored onto the new schema lands
--   every trend_items row on 'measured' by default and every transcript with
--   reference_input_id NULL — both valid. A post-0026 dump restored onto the
--   OLD schema fails on the unknown columns; restore in migration order.
--   Dumps that include `onboarding_inputs` must restore it BEFORE
--   `trend_transcripts` (the new FK), which `pg_dump`'s dependency ordering
--   already does for a whole-database dump; a per-table restore must respect
--   it by hand.
--
-- DELETION-REGISTRY IMPACT (`creator-data-registry.ts`, `trend_transcripts`):
--   the entry now names TWO cascades — the composite profile FK it already
--   had, and this one from `onboarding_inputs`. Deleting a creator's reference
--   input deletes the third-party transcript with it; the `trend_items` row
--   is NOT touched (no trigger, deliberately), so the owner-only reader derives
--   "transcript unavailable" from the row's absence. `brain-schema.test.ts`
--   witnesses both cascades; `export.test.ts` witnesses `referenceInputId`
--   in the JSON export beside the transcript row.
CREATE TYPE "public"."trend_baseline_state" AS ENUM('measured', 'unavailable');--> statement-breakpoint
ALTER TABLE "trend_items" DROP CONSTRAINT "trend_items_baseline_provenance";--> statement-breakpoint
ALTER TABLE "trend_items" DROP CONSTRAINT "trend_items_outlier_ratio_matches_inputs";--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "channel_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "video_views" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "channel_median_recent_views" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "baseline_sample_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "baseline_observation_ids" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "baseline_window_starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "baseline_window_ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ALTER COLUMN "outlier_ratio" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ADD COLUMN "baseline_state" "trend_baseline_state" DEFAULT 'measured' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD COLUMN "reference_input_id" uuid;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD CONSTRAINT "trend_transcripts_reference_input_id_onboarding_inputs_id_fk" FOREIGN KEY ("reference_input_id") REFERENCES "public"."onboarding_inputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trend_transcripts_reference_input_uq" ON "trend_transcripts" USING btree ("reference_input_id");--> statement-breakpoint
ALTER TABLE "trend_items" ADD CONSTRAINT "trend_items_baseline_state_shape" CHECK (("trend_items"."baseline_state" = 'unavailable' AND "trend_items"."rights_scope" = 'profile_private' AND "trend_items"."channel_id" IS NULL AND "trend_items"."video_views" IS NULL AND "trend_items"."channel_median_recent_views" IS NULL AND "trend_items"."baseline_sample_size" IS NULL AND "trend_items"."baseline_observation_ids" IS NULL AND "trend_items"."baseline_window_starts_at" IS NULL AND "trend_items"."baseline_window_ends_at" IS NULL AND "trend_items"."outlier_ratio" IS NULL) OR ("trend_items"."baseline_state" = 'measured' AND "trend_items"."channel_id" IS NOT NULL AND "trend_items"."video_views" IS NOT NULL AND "trend_items"."channel_median_recent_views" IS NOT NULL AND "trend_items"."baseline_sample_size" IS NOT NULL AND "trend_items"."baseline_observation_ids" IS NOT NULL AND "trend_items"."baseline_window_starts_at" IS NOT NULL AND "trend_items"."baseline_window_ends_at" IS NOT NULL AND "trend_items"."outlier_ratio" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "trend_items" ADD CONSTRAINT "trend_items_baseline_provenance" CHECK ("trend_items"."baseline_state" = 'unavailable' OR ("trend_items"."channel_median_recent_views" > 0 AND "trend_items"."baseline_sample_size" > 0 AND jsonb_typeof("trend_items"."baseline_observation_ids") = 'array' AND jsonb_array_length("trend_items"."baseline_observation_ids") = "trend_items"."baseline_sample_size" AND "trend_items"."baseline_window_starts_at" < "trend_items"."baseline_window_ends_at" AND "trend_items"."source_published_at" <= "trend_items"."baseline_window_ends_at"));--> statement-breakpoint
ALTER TABLE "trend_items" ADD CONSTRAINT "trend_items_outlier_ratio_matches_inputs" CHECK ("trend_items"."baseline_state" = 'unavailable' OR "trend_items"."outlier_ratio" = ROUND("trend_items"."video_views"::numeric / "trend_items"."channel_median_recent_views", 8));--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD CONSTRAINT "trend_transcripts_creator_paste_has_reference" CHECK (("trend_transcripts"."provenance"->>'kind' IS NOT DISTINCT FROM 'creator_paste') = ("trend_transcripts"."reference_input_id" IS NOT NULL));