CREATE TYPE "public"."generation_feedback_reaction" AS ENUM('used_as_is', 'used_with_edits', 'off_voice', 'too_generic', 'wrong_angle', 'not_filmable', 'discarded');--> statement-breakpoint
CREATE TABLE "generation_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"generation_id" uuid NOT NULL,
	"reaction" "generation_feedback_reaction" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_feedback_note_says_something" CHECK ("generation_feedback"."note" IS NULL OR "generation_feedback"."note" ~ '[^[:space:]]')
);
--> statement-breakpoint
DROP INDEX "frameworks_slug_uq";--> statement-breakpoint
ALTER TABLE "frameworks" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frameworks" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_feedback" ADD CONSTRAINT "generation_feedback_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_feedback" ADD CONSTRAINT "generation_feedback_generation_fk" FOREIGN KEY ("generation_id","profile_id","workspace_id") REFERENCES "public"."generations"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_feedback_generation_reaction_uq" ON "generation_feedback" USING btree ("generation_id","reaction");--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_parent_fk" FOREIGN KEY ("parent_id","profile_id","workspace_id") REFERENCES "public"."generations"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "frameworks_shared_slug_version_uq" ON "frameworks" USING btree ("slug","version") WHERE "frameworks"."visibility" = 'shared';--> statement-breakpoint
CREATE UNIQUE INDEX "frameworks_private_slug_version_uq" ON "frameworks" USING btree ("owner_profile_id","slug","version") WHERE "frameworks"."visibility" = 'private';--> statement-breakpoint
CREATE UNIQUE INDEX "frameworks_shared_live_uq" ON "frameworks" USING btree ("slug") WHERE "frameworks"."visibility" = 'shared' AND "frameworks"."superseded_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "frameworks_private_live_uq" ON "frameworks" USING btree ("owner_profile_id","slug") WHERE "frameworks"."visibility" = 'private' AND "frameworks"."superseded_at" IS NULL;--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_retired_stamp" CHECK (("frameworks"."saturation" = 'retired') = ("frameworks"."retired_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_version_positive" CHECK ("frameworks"."version" >= 1);--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_confidence_matches_evidence" CHECK (CASE
            WHEN jsonb_typeof("frameworks"."evidence_entries") <> 'array' THEN false
            WHEN jsonb_array_length("frameworks"."evidence_entries") = 0 THEN "frameworks"."confidence" = 'unsupported'
            WHEN jsonb_array_length("frameworks"."evidence_entries") = 1 THEN "frameworks"."confidence" = 'single_case'
            WHEN jsonb_array_length("frameworks"."evidence_entries") < 5 THEN "frameworks"."confidence" = 'repeated'
            ELSE "frameworks"."confidence" = 'contrasted'
          END);--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_json_columns_are_arrays" CHECK (jsonb_typeof("frameworks"."beats") = 'array'
          AND jsonb_typeof("frameworks"."applicability") = 'array'
          AND jsonb_typeof("frameworks"."source_references") = 'array'
          AND jsonb_typeof("frameworks"."tested_caveats") = 'array');--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_parent_is_not_self" CHECK ("generations"."parent_id" IS NULL OR "generations"."parent_id" <> "generations"."id");--> statement-breakpoint
-- HAND-APPENDED TO A DRIZZLE-GENERATED MIGRATION (slice 7, R6). Everything
-- above this line is drizzle-kit's; the two statements below are not, because
-- drizzle has no trigger DSL and the property they hold is one the card
-- requires to be ENFORCED rather than described: "parent ids are immutable
-- after insert".
--
-- WHY A TRIGGER AND NOT A CHECK. A CHECK cannot see the previous value of a
-- row; Postgres has no other way to compare OLD to NEW. Without this, the only
-- thing keeping `parent_id` immutable is that `generations` has no UPDATE
-- writer — which `tests/table-writers.test.ts` does police, but that is a scan
-- over our own source, not a property of the database, and an incident-time
-- hand-run UPDATE is exactly the path this closes.
--
-- WHY IT MATTERS RATHER THAN BEING TIDINESS. Every parent must already exist
-- when its child is INSERTed (the composite FK), so the lineage relation is a
-- subrelation of "was inserted earlier" — a strict partial order, hence
-- acyclic. An UPDATE is the only operation that can point a row at a
-- generation created after it, and therefore the only way to build a cycle of
-- length two or more. (Length one is closed separately by
-- `generations_parent_is_not_self`, which is NOT redundant: a self-referencing
-- FK ACCEPTS `INSERT ... VALUES (x, x)` — measured on this repo's own PGlite
-- build, 2026-09-01, because Postgres checks the new row against itself after
-- inserting it.)
--
-- NARROW ON PURPOSE: it refuses only a CHANGE to `parent_id`. `generations` is
-- immutable in practice and its schema says so by carrying no `updated_at`,
-- but this migration deliberately does not turn that into a blanket refusal —
-- a future deletion/pseudonymisation executor may legitimately need to rewrite
-- other columns, and a control that becomes an outage is the 2026-07-30
-- lesson. `IS DISTINCT FROM` rather than `<>` so a NULL on either side is
-- compared rather than swallowed.
CREATE OR REPLACE FUNCTION generations_refuse_parent_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'generations.parent_id is immutable after insert (slice 7, R6): a revision names the output it was revised from, and rewriting that link is the only way to build a lineage cycle'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER generations_parent_id_immutable
BEFORE UPDATE ON "generations"
FOR EACH ROW EXECUTE FUNCTION generations_refuse_parent_change();
