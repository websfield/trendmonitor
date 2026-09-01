CREATE TYPE "public"."generation_attempt_state" AS ENUM('claimed', 'vendor_started', 'vendor_complete', 'settled', 'refused', 'recovery_required');--> statement-breakpoint
CREATE TYPE "public"."generation_outcome" AS ENUM('usable', 'honest_refusal');--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" text NOT NULL,
	"purpose" text NOT NULL,
	"mode" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"state" "generation_attempt_state" DEFAULT 'claimed' NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"vendor_started_at" timestamp with time zone,
	"vendor_completed_at" timestamp with time zone,
	"terminal_at" timestamp with time zone,
	"generation_id" uuid,
	"debit_ledger_id" uuid,
	"refusal_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_attempts_attempt_mode_profile_workspace_uq" UNIQUE("attempt_id","mode","profile_id","workspace_id"),
	CONSTRAINT "generation_attempts_payload_sha256_hex" CHECK ("generation_attempts"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "generation_attempts_claimed_has_no_vendor_start" CHECK ("generation_attempts"."state" <> 'claimed' OR "generation_attempts"."vendor_started_at" IS NULL),
	CONSTRAINT "generation_attempts_vendor_start_recorded" CHECK ("generation_attempts"."state" NOT IN ('vendor_started','vendor_complete','settled','recovery_required')
          OR "generation_attempts"."vendor_started_at" IS NOT NULL),
	CONSTRAINT "generation_attempts_vendor_completion_recorded" CHECK (("generation_attempts"."state" NOT IN ('vendor_complete','settled') OR "generation_attempts"."vendor_completed_at" IS NOT NULL)
          AND ("generation_attempts"."state" NOT IN ('claimed','vendor_started') OR "generation_attempts"."vendor_completed_at" IS NULL)),
	CONSTRAINT "generation_attempts_terminal_stamp" CHECK (("generation_attempts"."state" IN ('settled','refused','recovery_required')) = ("generation_attempts"."terminal_at" IS NOT NULL)),
	CONSTRAINT "generation_attempts_settled_has_generation" CHECK (("generation_attempts"."state" = 'settled') = ("generation_attempts"."generation_id" IS NOT NULL)),
	CONSTRAINT "generation_attempts_debit_only_when_settled" CHECK ("generation_attempts"."debit_ledger_id" IS NULL OR "generation_attempts"."state" = 'settled'),
	CONSTRAINT "generation_attempts_refusal_code" CHECK ("generation_attempts"."state" <> 'refused' OR "generation_attempts"."refusal_code" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" text NOT NULL,
	"mode" text NOT NULL,
	"brain_activation_id" uuid NOT NULL,
	"framework_versions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_input_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_bundle_version" text NOT NULL,
	"config_version" integer NOT NULL,
	"outcome" "generation_outcome" NOT NULL,
	"output" jsonb,
	"weakest_point" text,
	"refusal_reason" text,
	"kill_test" jsonb NOT NULL,
	"rewrite_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generations_id_profile_workspace_uq" UNIQUE("id","profile_id","workspace_id"),
	CONSTRAINT "generations_output_iff_usable" CHECK (("generations"."outcome" = 'usable') = ("generations"."output" IS NOT NULL)),
	CONSTRAINT "generations_usable_names_weakest_point" CHECK ("generations"."outcome" <> 'usable'
          OR ("generations"."weakest_point" IS NOT NULL AND "generations"."weakest_point" ~ '[^[:space:]]')),
	CONSTRAINT "generations_refusal_states_reason" CHECK (("generations"."outcome" = 'honest_refusal')
          = ("generations"."refusal_reason" IS NOT NULL AND "generations"."refusal_reason" ~ '[^[:space:]]')),
	CONSTRAINT "generations_one_rewrite" CHECK ("generations"."rewrite_count" >= 0 AND "generations"."rewrite_count" <= 1)
);
--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_attempt_fk" FOREIGN KEY ("attempt_id","mode","profile_id","workspace_id") REFERENCES "public"."generation_attempts"("attempt_id","mode","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_attempt_uq" ON "generation_attempts" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generations_attempt_uq" ON "generations" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_free_allowance_uq" ON "credit_ledger" USING btree ("workspace_id","ref_id") WHERE "credit_ledger"."ref_type" = 'free_allowance';--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_free_allowance_ref" CHECK ("credit_ledger"."ref_type" IS DISTINCT FROM 'free_allowance' OR "credit_ledger"."ref_id" IS NOT NULL);