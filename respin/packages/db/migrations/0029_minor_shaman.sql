-- Slice 9a (phase-9 R5-R8; the pinned contract C1-C3 in
-- `docs/plans/respin-finish-phase-9a.md`). THE LOGGED RESULT.
--
-- Every statement below is drizzle-generated from `results-schema.ts` and
-- `brain-schema.ts`. THE HAND-WRITTEN PARTS ARE THIS HEADER AND THE STATEMENT
-- ORDER, and the order is the whole reason a human touched this file:
--
--   drizzle-kit emits every CREATE TABLE, then every FK ALTER, then every
--   CREATE INDEX, then the remaining ALTERs. As GENERATED, `results_metric_doc_fk`
--   (an FK ALTER) came BEFORE `brain_docs_id_profile_workspace_uq` (the UNIQUE
--   it references), so applying the file died with
--     ERROR: there is no unique constraint matching given keys for referenced
--     table "brain_docs"
--   — the EXACT migration-0011 defect `creator_profiles` and
--   `generation_attempts` both record in their schema comments, arriving in the
--   one shape those comments could not prevent: the referenced table already
--   exists, so the unique cannot be emitted inline in a CREATE TABLE.
--
-- The unique is therefore moved to the TOP, ahead of everything that
-- references it. Nothing else is changed, and the snapshot
-- (`meta/0029_snapshot.json`) is exactly as generated — `db:check` compares the
-- schema to the snapshot, not to this file's line order, which is why the
-- reorder is safe and also why only RUNNING the migration proves it
-- (`packages/db/tests/results-schema.test.ts` runs the committed migrations
-- into PGlite; a broken order is a red suite, not a review finding).
--
-- WHAT IT ADDS.
--   `brain_docs_id_profile_workspace_uq` — additive, refuses nothing that was
--     storable before (`id` is already the primary key), and exists purely so a
--     child can carry a SAME-TENANT composite FK to a brain document (C3).
--   Two enums, `result_evidence_state` and `result_audience_class`.
--   The `results` table: three same-tenant composite FKs, nine CHECKs, one
--     partial unique index and one FK-target unique.
--   Nothing else. No column is added to, or removed from, any existing table.
ALTER TABLE "brain_docs" ADD CONSTRAINT "brain_docs_id_profile_workspace_uq" UNIQUE("id","profile_id","workspace_id");
--> statement-breakpoint
CREATE TYPE "public"."result_audience_class" AS ENUM('organic', 'paid');--> statement-breakpoint
CREATE TYPE "public"."result_evidence_state" AS ENUM('unquantified', 'quantified_self_reported', 'connector_verified');--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"generation_id" uuid,
	"platform" text NOT NULL,
	"audience_class" "result_audience_class" NOT NULL,
	"metric_key" text NOT NULL,
	"metric_declared_by_doc_id" uuid NOT NULL,
	"observed_from" timestamp with time zone NOT NULL,
	"observed_to" timestamp with time zone NOT NULL,
	"treatment_key" text,
	"evidence_state" "result_evidence_state" NOT NULL,
	"reach_value" numeric(24, 8),
	"reach_denominator" numeric(24, 8),
	"conversion_value" numeric(24, 8),
	"conversion_denominator" numeric(24, 8),
	"confounders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"connector_source" text,
	"connector_event_id" text,
	"connector_observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "results_id_profile_workspace_uq" UNIQUE("id","profile_id","workspace_id"),
	CONSTRAINT "results_unquantified_has_no_levers" CHECK ("results"."evidence_state" <> 'unquantified'
          OR ("results"."reach_value" IS NULL AND "results"."reach_denominator" IS NULL
              AND "results"."conversion_value" IS NULL AND "results"."conversion_denominator" IS NULL)),
	CONSTRAINT "results_quantified_has_a_lever" CHECK ("results"."evidence_state" = 'unquantified'
          OR (("results"."reach_value" IS NOT NULL AND "results"."reach_denominator" IS NOT NULL)
              OR ("results"."conversion_value" IS NOT NULL AND "results"."conversion_denominator" IS NOT NULL))),
	CONSTRAINT "results_lever_pairs_complete" CHECK (("results"."reach_value" IS NULL) = ("results"."reach_denominator" IS NULL)
          AND ("results"."conversion_value" IS NULL) = ("results"."conversion_denominator" IS NULL)),
	CONSTRAINT "results_denominators_positive" CHECK (("results"."reach_denominator" IS NULL OR "results"."reach_denominator" > 0)
          AND ("results"."conversion_denominator" IS NULL OR "results"."conversion_denominator" > 0)),
	CONSTRAINT "results_window_forward" CHECK ("results"."observed_to" > "results"."observed_from"),
	CONSTRAINT "results_connector_verified_iff_provenance" CHECK (("results"."evidence_state" = 'connector_verified')
          = ("results"."connector_source" IS NOT NULL AND "results"."connector_event_id" IS NOT NULL
             AND "results"."connector_observed_at" IS NOT NULL)),
	CONSTRAINT "results_note_says_something" CHECK ("results"."note" IS NULL OR "results"."note" ~ '[^[:space:]]'),
	CONSTRAINT "results_treatment_key_iff_generation" CHECK (("results"."generation_id" IS NOT NULL) = ("results"."treatment_key" IS NOT NULL)),
	CONSTRAINT "results_confounders_closed_set" CHECK (jsonb_typeof("results"."confounders") = 'array'
          AND "results"."confounders" <@ '["topic_overlap","posting_time_unknown","account_growth","spillover_from_other_post","external_promotion","platform_change"]'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_generation_fk" FOREIGN KEY ("generation_id","profile_id","workspace_id") REFERENCES "public"."generations"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_metric_doc_fk" FOREIGN KEY ("metric_declared_by_doc_id","profile_id","workspace_id") REFERENCES "public"."brain_docs"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "results_generation_metric_window_uq" ON "results" USING btree ("generation_id","metric_key","audience_class","observed_from","observed_to") WHERE "results"."generation_id" IS NOT NULL;
