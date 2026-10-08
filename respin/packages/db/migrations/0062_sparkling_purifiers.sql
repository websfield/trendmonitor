CREATE TYPE "public"."creative_piece_state" AS ENUM('selected', 'scripted', 'cancelled');--> statement-breakpoint
CREATE TABLE "creative_pieces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_generation_id" uuid,
	"source_idea_index" integer,
	"own_idea" text,
	"selected_generation_id" uuid,
	"state" "creative_piece_state" DEFAULT 'selected' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"operation_attempt_id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"quote_config_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_pieces_operation_attempt_uuid" CHECK ("creative_pieces"."operation_attempt_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
	CONSTRAINT "creative_pieces_source_pair" CHECK (("creative_pieces"."source_generation_id" IS NULL) = ("creative_pieces"."source_idea_index" IS NULL)),
	CONSTRAINT "creative_pieces_source_index_range" CHECK ("creative_pieces"."source_idea_index" IS NULL OR ("creative_pieces"."source_idea_index" >= 0 AND "creative_pieces"."source_idea_index" < 5)),
	CONSTRAINT "creative_pieces_one_origin" CHECK (("creative_pieces"."source_generation_id" IS NULL)
          = ("creative_pieces"."own_idea" IS NOT NULL AND "creative_pieces"."own_idea" ~ '[^[:space:]]')),
	CONSTRAINT "creative_pieces_own_idea_bounded" CHECK ("creative_pieces"."own_idea" IS NULL OR char_length("creative_pieces"."own_idea") <= 4000),
	CONSTRAINT "creative_pieces_scripted_has_selection" CHECK (("creative_pieces"."state" = 'scripted') = ("creative_pieces"."selected_generation_id" IS NOT NULL)),
	CONSTRAINT "creative_pieces_version_positive" CHECK ("creative_pieces"."version" >= 1),
	CONSTRAINT "creative_pieces_quote_version_positive" CHECK ("creative_pieces"."quote_config_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "intent_sha256" text;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "request_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "creative_pieces" ADD CONSTRAINT "creative_pieces_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_pieces" ADD CONSTRAINT "creative_pieces_source_generation_fk" FOREIGN KEY ("source_generation_id","profile_id","workspace_id") REFERENCES "public"."generations"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "creative_pieces" ADD CONSTRAINT "creative_pieces_selected_generation_fk" FOREIGN KEY ("selected_generation_id","profile_id","workspace_id") REFERENCES "public"."generations"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_pieces_operation_attempt_uq" ON "creative_pieces" USING btree ("operation_attempt_id");--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_intent_sha256_hex" CHECK ("generation_attempts"."intent_sha256" IS NULL OR "generation_attempts"."intent_sha256" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_request_snapshot_is_object" CHECK ("generation_attempts"."request_snapshot" IS NULL OR jsonb_typeof("generation_attempts"."request_snapshot") = 'object');--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_intent_with_snapshot" CHECK (("generation_attempts"."intent_sha256" IS NULL) = ("generation_attempts"."request_snapshot" IS NULL));