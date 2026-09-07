CREATE TYPE "public"."deletion_external_command_kind" AS ENUM('stripe_subscription_cancel_at_period_end', 'stripe_subscription_reopen', 'auto_topup_disable', 'stripe_subscription_cancel_now', 'stripe_customer_personal_fields_clear');--> statement-breakpoint
CREATE TYPE "public"."deletion_external_command_phase" AS ENUM('pre_grace', 'cancellation', 'erasing');--> statement-breakpoint
CREATE TYPE "public"."deletion_external_command_status" AS ENUM('pending', 'succeeded', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "deletion_external_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"scope" "deletion_scope" NOT NULL,
	"target_key" text NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"profile_id" uuid,
	"kind" "deletion_external_command_kind" NOT NULL,
	"phase" "deletion_external_command_phase" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "deletion_external_command_status" DEFAULT 'pending' NOT NULL,
	"payload_hash" text NOT NULL,
	"dispatched_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"provider_ref_digest" text,
	"failure_code" text,
	"reconciliation_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_external_commands_attempt_positive" CHECK ("deletion_external_commands"."attempt" >= 1),
	CONSTRAINT "deletion_external_commands_payload_hash_shape" CHECK (("deletion_external_commands"."payload_hash" ~ '^[0-9a-f]{64}$') IS TRUE),
	CONSTRAINT "deletion_external_commands_target_shape" CHECK ((("deletion_external_commands"."scope" = 'identity' AND "deletion_external_commands"."user_id" IS NOT NULL AND "deletion_external_commands"."workspace_id" IS NULL AND "deletion_external_commands"."profile_id" IS NULL AND "deletion_external_commands"."target_key" = 'identity:' || "deletion_external_commands"."user_id"::text)
          OR ("deletion_external_commands"."scope" = 'profile' AND "deletion_external_commands"."user_id" IS NULL AND "deletion_external_commands"."workspace_id" IS NOT NULL AND "deletion_external_commands"."profile_id" IS NOT NULL AND "deletion_external_commands"."target_key" = 'profile:' || "deletion_external_commands"."workspace_id"::text || ':' || "deletion_external_commands"."profile_id"::text)
          OR ("deletion_external_commands"."scope" = 'workspace' AND "deletion_external_commands"."user_id" IS NULL AND "deletion_external_commands"."workspace_id" IS NOT NULL AND "deletion_external_commands"."profile_id" IS NULL AND "deletion_external_commands"."target_key" = 'workspace:' || "deletion_external_commands"."workspace_id"::text)) IS TRUE),
	CONSTRAINT "deletion_external_commands_kind_phase_shape" CHECK ((("deletion_external_commands"."kind" IN ('stripe_subscription_cancel_at_period_end', 'auto_topup_disable') AND "deletion_external_commands"."phase" = 'pre_grace')
          OR ("deletion_external_commands"."kind" = 'stripe_subscription_reopen' AND "deletion_external_commands"."phase" = 'cancellation')
          OR ("deletion_external_commands"."kind" IN ('stripe_subscription_cancel_now', 'stripe_customer_personal_fields_clear') AND "deletion_external_commands"."phase" = 'erasing')) IS TRUE),
	CONSTRAINT "deletion_external_commands_kind_scope_shape" CHECK ((("deletion_external_commands"."kind" IN ('stripe_subscription_cancel_at_period_end', 'stripe_subscription_reopen', 'auto_topup_disable', 'stripe_subscription_cancel_now') AND "deletion_external_commands"."scope" = 'workspace')
          OR ("deletion_external_commands"."kind" = 'stripe_customer_personal_fields_clear' AND "deletion_external_commands"."scope" IN ('identity', 'workspace'))) IS TRUE),
	CONSTRAINT "deletion_external_commands_status_shape" CHECK ((("deletion_external_commands"."status" = 'pending' AND "deletion_external_commands"."resolved_at" IS NULL AND "deletion_external_commands"."provider_ref_digest" IS NULL AND "deletion_external_commands"."failure_code" IS NULL AND "deletion_external_commands"."reconciliation_digest" IS NULL)
          OR ("deletion_external_commands"."status" = 'succeeded' AND "deletion_external_commands"."dispatched_at" IS NOT NULL AND "deletion_external_commands"."resolved_at" IS NOT NULL AND "deletion_external_commands"."resolved_at" >= "deletion_external_commands"."dispatched_at" AND "deletion_external_commands"."failure_code" IS NULL AND "deletion_external_commands"."reconciliation_digest" IS NULL AND ("deletion_external_commands"."provider_ref_digest" IS NULL OR "deletion_external_commands"."provider_ref_digest" ~ '^[0-9a-f]{64}$'))
          OR ("deletion_external_commands"."status" = 'failed' AND "deletion_external_commands"."resolved_at" IS NOT NULL AND "deletion_external_commands"."failure_code" IS NOT NULL AND "deletion_external_commands"."provider_ref_digest" IS NULL AND "deletion_external_commands"."reconciliation_digest" IS NULL)
          OR ("deletion_external_commands"."status" = 'unknown' AND "deletion_external_commands"."dispatched_at" IS NOT NULL AND "deletion_external_commands"."resolved_at" IS NULL AND "deletion_external_commands"."failure_code" IS NULL AND "deletion_external_commands"."provider_ref_digest" IS NULL AND "deletion_external_commands"."reconciliation_digest" ~ '^[0-9a-f]{64}$')) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "deletion_external_commands" ADD CONSTRAINT "deletion_external_commands_operation_id_deletion_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."deletion_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_external_commands" ADD CONSTRAINT "deletion_external_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_external_commands" ADD CONSTRAINT "deletion_external_commands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_external_commands" ADD CONSTRAINT "deletion_external_commands_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_external_commands_operation_kind_attempt_uq" ON "deletion_external_commands" USING btree ("operation_id","kind","attempt");--> statement-breakpoint
CREATE INDEX "deletion_external_commands_operation_status_idx" ON "deletion_external_commands" USING btree ("operation_id","phase","status");