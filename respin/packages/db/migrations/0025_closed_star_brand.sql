CREATE TYPE "public"."trend_autopsy_cache_claim_status" AS ENUM('pending', 'completed', 'failed', 'parked');--> statement-breakpoint
CREATE TYPE "public"."trend_autopsy_status" AS ENUM('completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."trend_transcript_state" AS ENUM('transcript_required', 'transcript_available', 'transcript_unavailable');--> statement-breakpoint
CREATE TYPE "public"."trend_rights_scope" AS ENUM('profile_private', 'shared_analysis');--> statement-breakpoint
CREATE TYPE "public"."trend_saturation" AS ENUM('measured', 'unmeasured');--> statement-breakpoint
CREATE TYPE "public"."trend_source_kind" AS ENUM('youtube', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."system_model_usage_cost_state" AS ENUM('measured', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."system_spend_claim_status" AS ENUM('reserved', 'cap_exhausted');--> statement-breakpoint
CREATE TYPE "public"."system_model_usage_outcome" AS ENUM('succeeded', 'vendor_failed', 'budget_exhausted', 'reservation_overrun', 'vendor_limit_overrun', 'analysis_invalid');--> statement-breakpoint
CREATE TABLE "autopsies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trend_item_id" uuid NOT NULL,
	"content_digest" text NOT NULL,
	"analysis_version" text NOT NULL,
	"rights_scope" "trend_rights_scope" NOT NULL,
	"profile_id" uuid,
	"workspace_id" uuid,
	"status" "trend_autopsy_status" NOT NULL,
	"analysis" jsonb NOT NULL,
	"matched_framework_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "autopsies_rights_profile_pair" CHECK (("autopsies"."rights_scope" = 'profile_private') = ("autopsies"."profile_id" IS NOT NULL AND "autopsies"."workspace_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "autopsy_cache_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trend_item_id" uuid NOT NULL,
	"content_digest" text NOT NULL,
	"analysis_version" text NOT NULL,
	"rights_scope" "trend_rights_scope" NOT NULL,
	"profile_id" uuid,
	"workspace_id" uuid,
	"cache_scope_key" text NOT NULL,
	"status" "trend_autopsy_cache_claim_status" NOT NULL,
	"autopsy_id" uuid,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"active_system_attempt_id" text,
	"last_failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "autopsy_cache_claims_rights_profile_pair" CHECK (("autopsy_cache_claims"."rights_scope" = 'profile_private') = ("autopsy_cache_claims"."profile_id" IS NOT NULL AND "autopsy_cache_claims"."workspace_id" IS NOT NULL)),
	CONSTRAINT "autopsy_cache_claims_scope_key" CHECK (("autopsy_cache_claims"."rights_scope" = 'shared_analysis' AND "autopsy_cache_claims"."cache_scope_key" = 'shared') OR ("autopsy_cache_claims"."rights_scope" = 'profile_private' AND "autopsy_cache_claims"."cache_scope_key" = "autopsy_cache_claims"."profile_id"::text)),
	CONSTRAINT "autopsy_cache_claims_attempt_count_positive" CHECK ("autopsy_cache_claims"."attempt_count" > 0),
	CONSTRAINT "autopsy_cache_claims_completed_has_autopsy" CHECK (("autopsy_cache_claims"."status" = 'completed') = ("autopsy_cache_claims"."autopsy_id" IS NOT NULL)),
	CONSTRAINT "autopsy_cache_claims_active_attempt_pending" CHECK ("autopsy_cache_claims"."active_system_attempt_id" IS NULL OR "autopsy_cache_claims"."status" = 'pending')
);
--> statement-breakpoint
CREATE TABLE "tracked_niches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"niche" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_niches_niche_nonblank" CHECK ("tracked_niches"."niche" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "trend_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"external_video_id" text NOT NULL,
	"niche" text NOT NULL,
	"title" text NOT NULL,
	"channel_id" text NOT NULL,
	"video_views" bigint NOT NULL,
	"channel_median_recent_views" numeric(24, 8) NOT NULL,
	"baseline_sample_size" integer NOT NULL,
	"baseline_observation_ids" jsonb NOT NULL,
	"baseline_window_starts_at" timestamp with time zone NOT NULL,
	"baseline_window_ends_at" timestamp with time zone NOT NULL,
	"source_published_at" timestamp with time zone NOT NULL,
	"outlier_ratio" numeric(24, 8) NOT NULL,
	"rights_scope" "trend_rights_scope" NOT NULL,
	"profile_id" uuid,
	"workspace_id" uuid,
	"transcript_state" "trend_transcript_state" NOT NULL,
	"saturation" "trend_saturation" NOT NULL,
	"saturation_matching_items" integer,
	"saturation_population_size" integer,
	"saturation_prevalence" numeric(18, 12),
	"saturation_window_starts_at" timestamp with time zone,
	"saturation_window_ends_at" timestamp with time zone,
	"saturation_method_version" text,
	"saturation_unmeasured_reason" text,
	"stale_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_items_baseline_provenance" CHECK ("trend_items"."channel_median_recent_views" > 0 AND "trend_items"."baseline_sample_size" > 0 AND jsonb_typeof("trend_items"."baseline_observation_ids") = 'array' AND jsonb_array_length("trend_items"."baseline_observation_ids") = "trend_items"."baseline_sample_size" AND "trend_items"."baseline_window_starts_at" < "trend_items"."baseline_window_ends_at" AND "trend_items"."source_published_at" <= "trend_items"."baseline_window_ends_at"),
	CONSTRAINT "trend_items_outlier_ratio_matches_inputs" CHECK ("trend_items"."outlier_ratio" = ROUND("trend_items"."video_views"::numeric / "trend_items"."channel_median_recent_views", 8)),
	CONSTRAINT "trend_items_rights_profile_pair" CHECK (("trend_items"."rights_scope" = 'profile_private') = ("trend_items"."profile_id" IS NOT NULL AND "trend_items"."workspace_id" IS NOT NULL)),
	CONSTRAINT "trend_items_saturation_measurement_shape" CHECK (("trend_items"."saturation" = 'unmeasured') = ("trend_items"."saturation_matching_items" IS NULL AND "trend_items"."saturation_population_size" IS NULL AND "trend_items"."saturation_prevalence" IS NULL AND "trend_items"."saturation_window_starts_at" IS NULL AND "trend_items"."saturation_window_ends_at" IS NULL AND "trend_items"."saturation_method_version" IS NULL)),
	CONSTRAINT "trend_items_saturation_measurement_nonempty" CHECK (("trend_items"."saturation" = 'unmeasured' AND "trend_items"."saturation_unmeasured_reason" = 'incomplete_provenance') OR ("trend_items"."saturation" = 'measured' AND "trend_items"."saturation_matching_items" >= 0 AND "trend_items"."saturation_population_size" > 0 AND "trend_items"."saturation_matching_items" <= "trend_items"."saturation_population_size" AND "trend_items"."saturation_prevalence" = ROUND("trend_items"."saturation_matching_items"::numeric / "trend_items"."saturation_population_size"::numeric, 12) AND "trend_items"."saturation_window_starts_at" < "trend_items"."saturation_window_ends_at" AND "trend_items"."saturation_method_version" ~ '[^[:space:]]' AND "trend_items"."saturation_unmeasured_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "trend_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "trend_source_kind" NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"profile_id" uuid,
	"workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_sources_submitted_is_private" CHECK (("trend_sources"."kind" = 'submitted') = ("trend_sources"."profile_id" IS NOT NULL AND "trend_sources"."workspace_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "trend_transcripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trend_item_id" uuid NOT NULL,
	"rights_scope" "trend_rights_scope" NOT NULL,
	"profile_id" uuid,
	"workspace_id" uuid,
	"content" text NOT NULL,
	"content_digest" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_transcripts_rights_profile_pair" CHECK (("trend_transcripts"."rights_scope" = 'profile_private') = ("trend_transcripts"."profile_id" IS NOT NULL AND "trend_transcripts"."workspace_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "system_model_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_attempt_id" text NOT NULL,
	"job_id" text NOT NULL,
	"trend_item_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micro_usd" bigint,
	"reserved_cost_micro_usd" bigint NOT NULL,
	"reservation_overrun_micro_usd" bigint,
	"cost_state" "system_model_usage_cost_state" NOT NULL,
	"outcome" "system_model_usage_outcome" NOT NULL,
	"call_count" integer NOT NULL,
	"unknown_call_count" integer NOT NULL,
	"error_code" text,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "system_model_usage_tokens_nonnegative" CHECK (("system_model_usage"."tokens_in" IS NULL OR "system_model_usage"."tokens_in" >= 0) AND ("system_model_usage"."tokens_out" IS NULL OR "system_model_usage"."tokens_out" >= 0)),
	CONSTRAINT "system_model_usage_cost_known_iff" CHECK (("system_model_usage"."cost_state" = 'unknown' AND "system_model_usage"."cost_micro_usd" IS NULL AND "system_model_usage"."reservation_overrun_micro_usd" IS NULL) OR ("system_model_usage"."cost_state" = 'measured' AND "system_model_usage"."cost_micro_usd" >= 0 AND "system_model_usage"."reservation_overrun_micro_usd" = GREATEST("system_model_usage"."cost_micro_usd" - "system_model_usage"."reserved_cost_micro_usd", 0))),
	CONSTRAINT "system_model_usage_overrun_nonnegative" CHECK ("system_model_usage"."reserved_cost_micro_usd" >= 0 AND ("system_model_usage"."reservation_overrun_micro_usd" IS NULL OR "system_model_usage"."reservation_overrun_micro_usd" >= 0)),
	CONSTRAINT "system_model_usage_call_shape" CHECK ("system_model_usage"."call_count" BETWEEN 0 AND 4 AND "system_model_usage"."unknown_call_count" BETWEEN 0 AND "system_model_usage"."call_count" AND (("system_model_usage"."outcome" = 'budget_exhausted') = ("system_model_usage"."call_count" = 0)) AND ("system_model_usage"."outcome" <> 'succeeded' OR ("system_model_usage"."call_count" = 4 AND "system_model_usage"."cost_state" = 'measured')) AND (("system_model_usage"."cost_state" = 'unknown') = ("system_model_usage"."unknown_call_count" > 0))),
	CONSTRAINT "system_model_usage_budget_refusal_zero" CHECK ("system_model_usage"."outcome" <> 'budget_exhausted' OR ("system_model_usage"."tokens_in" = 0 AND "system_model_usage"."tokens_out" = 0 AND "system_model_usage"."cost_micro_usd" = 0 AND "system_model_usage"."reserved_cost_micro_usd" = 0 AND "system_model_usage"."reservation_overrun_micro_usd" = 0 AND "system_model_usage"."cost_state" = 'measured' AND "system_model_usage"."call_count" = 0 AND "system_model_usage"."unknown_call_count" = 0)),
	CONSTRAINT "system_model_usage_error_code_shape" CHECK (("system_model_usage"."outcome" = 'succeeded') = ("system_model_usage"."error_code" IS NULL) AND ("system_model_usage"."error_code" IS NULL OR "system_model_usage"."error_code" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')),
	CONSTRAINT "system_model_usage_attribution_shape" CHECK ("system_model_usage"."job_attempt_id" ~ '[^[:space:]]' AND "system_model_usage"."job_id" ~ '[^[:space:]]' AND "system_model_usage"."purpose" = 'trend_autopsy' AND "system_model_usage"."model" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "system_model_usage_reconciliations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_attempt_id" text NOT NULL,
	"business_date" date NOT NULL,
	"actual_cost_micro_usd" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "system_model_usage_reconciliations_cost_nonnegative" CHECK ("system_model_usage_reconciliations"."actual_cost_micro_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "system_spend_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_attempt_id" text NOT NULL,
	"job_id" text NOT NULL,
	"trend_item_id" uuid NOT NULL,
	"autopsy_cache_claim_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"business_date" date NOT NULL,
	"reserved_micro_usd" bigint NOT NULL,
	"requested_micro_usd" bigint NOT NULL,
	"status" "system_spend_claim_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "system_spend_claims_reservation_shape" CHECK (("system_spend_claims"."status" = 'reserved' AND "system_spend_claims"."reserved_micro_usd" > 0 AND "system_spend_claims"."requested_micro_usd" = "system_spend_claims"."reserved_micro_usd") OR ("system_spend_claims"."status" = 'cap_exhausted' AND "system_spend_claims"."reserved_micro_usd" = 0 AND "system_spend_claims"."requested_micro_usd" > 0)),
	CONSTRAINT "system_spend_claims_attribution_shape" CHECK ("system_spend_claims"."job_attempt_id" ~ '[^[:space:]]' AND "system_spend_claims"."job_id" ~ '[^[:space:]]' AND "system_spend_claims"."purpose" = 'trend_autopsy' AND "system_spend_claims"."model" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "system_spend_daily" (
	"business_date" date PRIMARY KEY NOT NULL,
	"cap_micro_usd" bigint NOT NULL,
	"reserved_micro_usd" bigint DEFAULT 0 NOT NULL,
	"known_cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"unknown_call_count" integer DEFAULT 0 NOT NULL,
	"overrun_call_count" integer DEFAULT 0 NOT NULL,
	"overrun_micro_usd" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "system_spend_daily_nonnegative" CHECK ("system_spend_daily"."cap_micro_usd" >= 0 AND "system_spend_daily"."reserved_micro_usd" >= 0 AND "system_spend_daily"."reserved_micro_usd" <= "system_spend_daily"."cap_micro_usd" AND "system_spend_daily"."known_cost_micro_usd" >= 0 AND "system_spend_daily"."call_count" >= 0 AND "system_spend_daily"."unknown_call_count" >= 0 AND "system_spend_daily"."overrun_call_count" >= 0 AND "system_spend_daily"."overrun_micro_usd" >= 0 AND "system_spend_daily"."unknown_call_count" <= "system_spend_daily"."call_count" AND "system_spend_daily"."overrun_call_count" <= "system_spend_daily"."call_count")
);
--> statement-breakpoint
CREATE TABLE "system_worker_health" (
	"worker_name" text PRIMARY KEY NOT NULL,
	"last_heartbeat_at" timestamp with time zone NOT NULL,
	"last_successful_schedule_at" timestamp with time zone,
	"last_successful_run_at" timestamp with time zone,
	"schedule_lag_seconds" integer NOT NULL,
	"active_count" integer NOT NULL,
	"parked_count" integer NOT NULL,
	"dead_letter_count" integer NOT NULL,
	"pool_in_use" integer NOT NULL,
	"pool_capacity" integer NOT NULL,
	"budget_exhausted" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "system_worker_health_counts_nonnegative" CHECK ("system_worker_health"."schedule_lag_seconds" >= 0 AND "system_worker_health"."active_count" >= 0 AND "system_worker_health"."parked_count" >= 0 AND "system_worker_health"."dead_letter_count" >= 0 AND "system_worker_health"."pool_in_use" >= 0 AND "system_worker_health"."pool_capacity" >= "system_worker_health"."pool_in_use"),
	CONSTRAINT "system_worker_health_budget_exhausted_boolean" CHECK ("system_worker_health"."budget_exhausted" IN (0, 1))
);
--> statement-breakpoint
ALTER TABLE "autopsies" ADD CONSTRAINT "autopsies_trend_item_id_trend_items_id_fk" FOREIGN KEY ("trend_item_id") REFERENCES "public"."trend_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsies" ADD CONSTRAINT "autopsies_matched_framework_id_frameworks_id_fk" FOREIGN KEY ("matched_framework_id") REFERENCES "public"."frameworks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsies" ADD CONSTRAINT "autopsies_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD CONSTRAINT "autopsy_cache_claims_trend_item_id_trend_items_id_fk" FOREIGN KEY ("trend_item_id") REFERENCES "public"."trend_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD CONSTRAINT "autopsy_cache_claims_autopsy_id_autopsies_id_fk" FOREIGN KEY ("autopsy_id") REFERENCES "public"."autopsies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD CONSTRAINT "autopsy_cache_claims_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_niches" ADD CONSTRAINT "tracked_niches_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_items" ADD CONSTRAINT "trend_items_source_id_trend_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."trend_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_items" ADD CONSTRAINT "trend_items_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_sources" ADD CONSTRAINT "trend_sources_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD CONSTRAINT "trend_transcripts_trend_item_id_trend_items_id_fk" FOREIGN KEY ("trend_item_id") REFERENCES "public"."trend_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD CONSTRAINT "trend_transcripts_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_model_usage" ADD CONSTRAINT "system_model_usage_business_date_system_spend_daily_business_date_fk" FOREIGN KEY ("business_date") REFERENCES "public"."system_spend_daily"("business_date") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_model_usage_reconciliations" ADD CONSTRAINT "system_model_usage_reconciliations_business_date_system_spend_daily_business_date_fk" FOREIGN KEY ("business_date") REFERENCES "public"."system_spend_daily"("business_date") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_spend_claims" ADD CONSTRAINT "system_spend_claims_business_date_system_spend_daily_business_date_fk" FOREIGN KEY ("business_date") REFERENCES "public"."system_spend_daily"("business_date") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "autopsies_shared_cache_identity_uq" ON "autopsies" USING btree ("content_digest","analysis_version") WHERE "autopsies"."rights_scope" = 'shared_analysis';--> statement-breakpoint
CREATE UNIQUE INDEX "autopsies_private_cache_identity_uq" ON "autopsies" USING btree ("content_digest","analysis_version","profile_id") WHERE "autopsies"."rights_scope" = 'profile_private';--> statement-breakpoint
CREATE UNIQUE INDEX "autopsy_cache_claims_identity_uq" ON "autopsy_cache_claims" USING btree ("content_digest","analysis_version","rights_scope","cache_scope_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_niches_profile_niche_uq" ON "tracked_niches" USING btree ("profile_id","niche");--> statement-breakpoint
CREATE UNIQUE INDEX "trend_items_shared_source_video_uq" ON "trend_items" USING btree ("source_id","external_video_id") WHERE "trend_items"."rights_scope" = 'shared_analysis';--> statement-breakpoint
CREATE UNIQUE INDEX "trend_items_private_source_video_profile_uq" ON "trend_items" USING btree ("source_id","external_video_id","profile_id") WHERE "trend_items"."rights_scope" = 'profile_private';--> statement-breakpoint
CREATE UNIQUE INDEX "trend_sources_youtube_external_id_uq" ON "trend_sources" USING btree ("external_id") WHERE "trend_sources"."kind" = 'youtube';--> statement-breakpoint
CREATE UNIQUE INDEX "trend_sources_submitted_profile_external_id_uq" ON "trend_sources" USING btree ("profile_id","external_id") WHERE "trend_sources"."kind" = 'submitted';--> statement-breakpoint
CREATE UNIQUE INDEX "trend_transcripts_shared_item_digest_uq" ON "trend_transcripts" USING btree ("trend_item_id","content_digest") WHERE "trend_transcripts"."rights_scope" = 'shared_analysis';--> statement-breakpoint
CREATE UNIQUE INDEX "trend_transcripts_private_item_digest_profile_uq" ON "trend_transcripts" USING btree ("trend_item_id","content_digest","profile_id") WHERE "trend_transcripts"."rights_scope" = 'profile_private';--> statement-breakpoint
CREATE UNIQUE INDEX "system_model_usage_job_attempt_uq" ON "system_model_usage" USING btree ("job_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_model_usage_reconciliations_attempt_uq" ON "system_model_usage_reconciliations" USING btree ("job_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_spend_claims_job_attempt_uq" ON "system_spend_claims" USING btree ("job_attempt_id");