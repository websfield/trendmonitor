CREATE TYPE "public"."brain_doc_status" AS ENUM('proposed', 'active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."brain_kind" AS ENUM('voice', 'strategy', 'performance_meta', 'killtest');--> statement-breakpoint
CREATE TYPE "public"."curator_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."framework_saturation" AS ENUM('observed', 'emerging', 'established', 'saturated', 'retired');--> statement-breakpoint
CREATE TYPE "public"."framework_visibility" AS ENUM('shared', 'private');--> statement-breakpoint
CREATE TYPE "public"."model_usage_cost_state" AS ENUM('estimated', 'reconciled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."onboarding_input_class" AS ENUM('own_post', 'reference', 'creator_authored');--> statement-breakpoint
CREATE TYPE "public"."model_usage_resolved_tier" AS ENUM('creator', 'pro', 'studio', 'free', 'unmapped');--> statement-breakpoint
CREATE TYPE "public"."model_usage_outcome" AS ENUM('succeeded', 'schema_invalid', 'rate_limited', 'unavailable', 'refused');--> statement-breakpoint
CREATE TABLE "brain_docs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "brain_kind" NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"source_evidence" jsonb,
	"status" "brain_doc_status" DEFAULT 'proposed' NOT NULL,
	"reason" text NOT NULL,
	"activated_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_id_workspace_uq" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "frameworks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"beats" jsonb NOT NULL,
	"why_it_converts" text NOT NULL,
	"applicability" jsonb NOT NULL,
	"source_references" jsonb NOT NULL,
	"evidence_entries" jsonb NOT NULL,
	"tested_caveats" jsonb NOT NULL,
	"confidence" text NOT NULL,
	"saturation" "framework_saturation" NOT NULL,
	"visibility" "framework_visibility" NOT NULL,
	"owner_profile_id" uuid,
	"workspace_id" uuid,
	"curator_status" "curator_status" DEFAULT 'proposed' NOT NULL,
	"curated_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frameworks_shared_has_no_owner" CHECK ("frameworks"."visibility" <> 'shared' OR ("frameworks"."owner_profile_id" IS NULL AND "frameworks"."workspace_id" IS NULL)),
	CONSTRAINT "frameworks_private_has_owner" CHECK ("frameworks"."visibility" <> 'private' OR ("frameworks"."owner_profile_id" IS NOT NULL AND "frameworks"."workspace_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "model_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" text NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"usage_raw" jsonb,
	"cost_micro_usd" bigint,
	"cost_state" "model_usage_cost_state" DEFAULT 'estimated' NOT NULL,
	"resolved_tier" "model_usage_resolved_tier" NOT NULL,
	"stripe_price_id" text,
	"prompt_bundle_version" text NOT NULL,
	"config_version" integer NOT NULL,
	"outcome" "model_usage_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "model_usage_cost_present_unless_unknown" CHECK (("model_usage"."cost_state" = 'unknown') = ("model_usage"."cost_micro_usd" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "onboarding_inputs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"input_class" "onboarding_input_class" NOT NULL,
	"content" text NOT NULL,
	"content_sha256" text NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_spend_monthly" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"tier" "model_usage_resolved_tier" NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brain_docs" ADD CONSTRAINT "brain_docs_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_owner_profile_workspace_fk" FOREIGN KEY ("owner_profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_inputs" ADD CONSTRAINT "onboarding_inputs_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brain_docs_profile_kind_version_uq" ON "brain_docs" USING btree ("profile_id","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_docs_one_active_uq" ON "brain_docs" USING btree ("profile_id","kind") WHERE "brain_docs"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "frameworks_slug_uq" ON "frameworks" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_spend_monthly_grain_uq" ON "workspace_spend_monthly" USING btree ("workspace_id","period_month","tier");