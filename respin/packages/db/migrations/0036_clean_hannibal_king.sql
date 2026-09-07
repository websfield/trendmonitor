CREATE TABLE "deletion_cancellation_proofs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"auth_user_id" text NOT NULL,
	"factor_verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_cancellation_proofs_exact_ttl" CHECK ("deletion_cancellation_proofs"."expires_at" = "deletion_cancellation_proofs"."factor_verified_at" + interval '10 minutes'),
	CONSTRAINT "deletion_cancellation_proofs_consumed_after_verification" CHECK ("deletion_cancellation_proofs"."consumed_at" IS NULL OR "deletion_cancellation_proofs"."consumed_at" >= "deletion_cancellation_proofs"."factor_verified_at")
);
--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_versions_non_negative";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_target_shape";--> statement-breakpoint
DROP INDEX "deletion_operations_scope_idempotency_uq";--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ALTER COLUMN "requester_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operations" ALTER COLUMN "requester_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "lifecycle_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "lifecycle_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD COLUMN "target_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "target_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "request_session_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "cancellation_replay_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "recovery_delivery_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "recovery_delivery_command_id" uuid;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "recovery_delivery_recipient_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "recovery_delivery_receipt_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "recovery_delivery_reconciliation_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_cancellation_proofs" ADD CONSTRAINT "deletion_cancellation_proofs_operation_id_deletion_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."deletion_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_cancellation_proofs" ADD CONSTRAINT "deletion_cancellation_proofs_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_cancellation_proofs_active_operation_uq" ON "deletion_cancellation_proofs" USING btree ("operation_id") WHERE "deletion_cancellation_proofs"."consumed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "deletion_cancellation_proofs_auth_user_idx" ON "deletion_cancellation_proofs" USING btree ("auth_user_id");--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_transition_identity_uq" UNIQUE("id","scope","target_key","requester_user_id","payload_hash");--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_operation_identity_fk" FOREIGN KEY ("operation_id","scope","target_key","requester_user_id","payload_hash") REFERENCES "public"."deletion_operations"("id","scope","target_key","requester_user_id","payload_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_operations_requester_scope_idempotency_uq" ON "deletion_operations" USING btree ("requester_user_id","scope","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_operations_delivery_command_uq" ON "deletion_operations" USING btree ("recovery_delivery_command_id") WHERE "deletion_operations"."recovery_delivery_command_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_operations_active_identity_target_uq" ON "deletion_operations" USING btree ("user_id") WHERE "deletion_operations"."scope" = 'identity' AND "deletion_operations"."state" NOT IN ('complete', 'cancelled');--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_operations_active_profile_target_uq" ON "deletion_operations" USING btree ("profile_id") WHERE "deletion_operations"."scope" = 'profile' AND "deletion_operations"."state" NOT IN ('complete', 'cancelled');--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_operations_active_workspace_target_uq" ON "deletion_operations" USING btree ("workspace_id") WHERE "deletion_operations"."scope" = 'workspace' AND "deletion_operations"."state" NOT IN ('complete', 'cancelled');--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_lifecycle_version_positive" CHECK ("workspaces"."lifecycle_version" >= 1);--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_lifecycle_version_positive" CHECK ("creator_profiles"."lifecycle_version" >= 1);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_request_session_digest_shape" CHECK (("deletion_operations"."scope" = 'identity' AND length("deletion_operations"."request_session_digest") = 64)
          OR ("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."request_session_digest" IS NULL));--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_cancellation_replay_shape" CHECK (("deletion_operations"."state" = 'cancelled' AND "deletion_operations"."cancellation_replay_digest" ~ '^[0-9a-f]{64}$')
          OR ("deletion_operations"."state" <> 'cancelled' AND "deletion_operations"."cancellation_replay_digest" IS NULL));--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_recovery_delivery_shape" CHECK (("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."recovery_delivery_attempt" = 0 AND "deletion_operations"."recovery_delivery_command_id" IS NULL
            AND "deletion_operations"."recovery_delivery_recipient_digest" IS NULL AND "deletion_operations"."recovery_delivery_receipt_digest" IS NULL
            AND "deletion_operations"."recovery_delivery_reconciliation_digest" IS NULL)
          OR ("deletion_operations"."scope" = 'identity' AND "deletion_operations"."recovery_delivery_attempt" >= 1
            AND "deletion_operations"."recovery_delivery_command_id" IS NOT NULL
            AND "deletion_operations"."recovery_delivery_recipient_digest" ~ '^[0-9a-f]{64}$'
            AND (("deletion_operations"."recovery_delivery_status" IN ('pending', 'failed') AND "deletion_operations"."recovery_delivery_receipt_digest" IS NULL AND "deletion_operations"."recovery_delivery_reconciliation_digest" IS NULL)
              OR ("deletion_operations"."recovery_delivery_status" = 'unknown' AND "deletion_operations"."recovery_delivery_receipt_digest" IS NULL AND "deletion_operations"."recovery_delivery_reconciliation_digest" ~ '^[0-9a-f]{64}$')
              OR ("deletion_operations"."recovery_delivery_status" = 'confirmed' AND "deletion_operations"."recovery_delivery_receipt_digest" ~ '^[0-9a-f]{64}$' AND "deletion_operations"."recovery_delivery_reconciliation_digest" IS NULL))));--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_versions_non_negative" CHECK ("deletion_operations"."state_version" >= 0 AND "deletion_operations"."journal_version" >= 0 AND "deletion_operations"."retry_count" >= 0 AND "deletion_operations"."recovery_delivery_attempt" >= 0);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_target_shape" CHECK (("deletion_operations"."scope" = 'identity' AND "deletion_operations"."user_id" IS NOT NULL AND "deletion_operations"."workspace_id" IS NULL AND "deletion_operations"."profile_id" IS NULL AND "deletion_operations"."target_key" = 'identity:' || "deletion_operations"."user_id"::text)
          OR ("deletion_operations"."scope" = 'profile' AND "deletion_operations"."user_id" IS NULL AND "deletion_operations"."workspace_id" IS NOT NULL AND "deletion_operations"."profile_id" IS NOT NULL AND "deletion_operations"."target_key" = 'profile:' || "deletion_operations"."workspace_id"::text || ':' || "deletion_operations"."profile_id"::text)
          OR ("deletion_operations"."scope" = 'workspace' AND "deletion_operations"."user_id" IS NULL AND "deletion_operations"."workspace_id" IS NOT NULL AND "deletion_operations"."profile_id" IS NULL AND "deletion_operations"."target_key" = 'workspace:' || "deletion_operations"."workspace_id"::text));