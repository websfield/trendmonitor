CREATE TYPE "public"."identity_lifecycle_state" AS ENUM('active', 'tombstoned');--> statement-breakpoint
CREATE TYPE "public"."membership_lifecycle_state" AS ENUM('active', 'deletion_suspended');--> statement-breakpoint
CREATE TYPE "public"."workspace_lifecycle_state" AS ENUM('active', 'tombstoned');--> statement-breakpoint
CREATE TYPE "public"."deletion_operation_state" AS ENUM('requested', 'journal_pending', 'tombstoned', 'external_actions_pending', 'grace', 'erasing', 'verifying', 'complete', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deletion_scope" AS ENUM('identity', 'profile', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."membership_recovery_outcome" AS ENUM('pending', 'restored', 'removed', 'changed', 'workspace_unavailable', 'seat_refused');--> statement-breakpoint
CREATE TYPE "public"."recovery_delivery_status" AS ENUM('not_required', 'pending', 'failed', 'unknown', 'confirmed');--> statement-breakpoint
ALTER TYPE "public"."creator_profile_state" ADD VALUE 'deletion_tombstoned';--> statement-breakpoint
CREATE TABLE "deletion_membership_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"membership_version" integer NOT NULL,
	"outcome" "membership_recovery_outcome" DEFAULT 'pending' NOT NULL,
	"outcome_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_membership_snapshots_version_positive" CHECK ("deletion_membership_snapshots"."membership_version" >= 1),
	CONSTRAINT "deletion_membership_snapshots_outcome_shape" CHECK (("deletion_membership_snapshots"."outcome" = 'pending' AND "deletion_membership_snapshots"."outcome_at" IS NULL)
          OR ("deletion_membership_snapshots"."outcome" <> 'pending' AND "deletion_membership_snapshots"."outcome_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "deletion_operation_transitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"scope" "deletion_scope" NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"profile_id" uuid,
	"requester_user_id" uuid,
	"version" integer NOT NULL,
	"from_state" "deletion_operation_state" NOT NULL,
	"to_state" "deletion_operation_state" NOT NULL,
	"payload_hash" text NOT NULL,
	"external_receipt_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_operation_transitions_version_positive" CHECK ("deletion_operation_transitions"."version" >= 1),
	CONSTRAINT "deletion_operation_transitions_hash_shape" CHECK (length("deletion_operation_transitions"."payload_hash") = 64 AND length("deletion_operation_transitions"."external_receipt_digest") = 64),
	CONSTRAINT "deletion_operation_transitions_target_shape" CHECK (("deletion_operation_transitions"."scope" = 'identity' AND "deletion_operation_transitions"."user_id" IS NOT NULL AND "deletion_operation_transitions"."workspace_id" IS NULL AND "deletion_operation_transitions"."profile_id" IS NULL)
          OR ("deletion_operation_transitions"."scope" = 'profile' AND "deletion_operation_transitions"."user_id" IS NULL AND "deletion_operation_transitions"."workspace_id" IS NOT NULL AND "deletion_operation_transitions"."profile_id" IS NOT NULL)
          OR ("deletion_operation_transitions"."scope" = 'workspace' AND "deletion_operation_transitions"."user_id" IS NULL AND "deletion_operation_transitions"."workspace_id" IS NOT NULL AND "deletion_operation_transitions"."profile_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "deletion_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" "deletion_scope" NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"profile_id" uuid,
	"profile_prior_state" "creator_profile_state",
	"requester_user_id" uuid,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"state" "deletion_operation_state" DEFAULT 'requested' NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"journal_version" integer DEFAULT 0 NOT NULL,
	"journal_receipt_digest" text,
	"recovery_secret_digest" text,
	"recovery_secret_prefix" text,
	"recovery_expires_at" timestamp with time zone,
	"recovery_consumed_at" timestamp with time zone,
	"recovery_delivery_status" "recovery_delivery_status" DEFAULT 'not_required' NOT NULL,
	"recovery_delivery_attempted_at" timestamp with time zone,
	"recovery_delivered_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"tombstoned_at" timestamp with time zone,
	"grace_expires_at" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_operations_versions_non_negative" CHECK ("deletion_operations"."state_version" >= 0 AND "deletion_operations"."journal_version" >= 0 AND "deletion_operations"."retry_count" >= 0),
	CONSTRAINT "deletion_operations_payload_hash_shape" CHECK (length("deletion_operations"."payload_hash") = 64),
	CONSTRAINT "deletion_operations_target_shape" CHECK (("deletion_operations"."scope" = 'identity' AND "deletion_operations"."user_id" IS NOT NULL AND "deletion_operations"."workspace_id" IS NULL AND "deletion_operations"."profile_id" IS NULL)
          OR ("deletion_operations"."scope" = 'profile' AND "deletion_operations"."user_id" IS NULL AND "deletion_operations"."workspace_id" IS NOT NULL AND "deletion_operations"."profile_id" IS NOT NULL)
          OR ("deletion_operations"."scope" = 'workspace' AND "deletion_operations"."user_id" IS NULL AND "deletion_operations"."workspace_id" IS NOT NULL AND "deletion_operations"."profile_id" IS NULL)),
	CONSTRAINT "deletion_operations_recovery_shape" CHECK (("deletion_operations"."scope" = 'identity' AND "deletion_operations"."recovery_expires_at" IS NOT NULL AND "deletion_operations"."recovery_delivery_status" <> 'not_required'
            AND (("deletion_operations"."recovery_consumed_at" IS NULL AND "deletion_operations"."recovery_secret_digest" IS NOT NULL AND "deletion_operations"."recovery_secret_prefix" IS NOT NULL)
              OR ("deletion_operations"."recovery_consumed_at" IS NOT NULL AND "deletion_operations"."recovery_secret_digest" IS NULL AND "deletion_operations"."recovery_secret_prefix" IS NULL)))
          OR ("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."recovery_secret_digest" IS NULL AND "deletion_operations"."recovery_secret_prefix" IS NULL AND "deletion_operations"."recovery_expires_at" IS NULL AND "deletion_operations"."recovery_consumed_at" IS NULL AND "deletion_operations"."recovery_delivery_status" = 'not_required')),
	CONSTRAINT "deletion_operations_lease_shape" CHECK (("deletion_operations"."lease_owner" IS NULL AND "deletion_operations"."lease_expires_at" IS NULL)
          OR ("deletion_operations"."lease_owner" IS NOT NULL AND "deletion_operations"."lease_expires_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "lifecycle_state" "membership_lifecycle_state" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "suspended_role" "membership_role";--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "suspended_version" integer;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "suspension_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lifecycle_state" "identity_lifecycle_state" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "lifecycle_state" "workspace_lifecycle_state" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reauthenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ordinary_login_disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deletion_membership_snapshots" ADD CONSTRAINT "deletion_membership_snapshots_operation_id_deletion_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."deletion_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_membership_snapshots" ADD CONSTRAINT "deletion_membership_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_membership_snapshots" ADD CONSTRAINT "deletion_membership_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_operation_id_deletion_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."deletion_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_membership_snapshots_operation_membership_uq" ON "deletion_membership_snapshots" USING btree ("operation_id","membership_id");--> statement-breakpoint
CREATE INDEX "deletion_membership_snapshots_user_idx" ON "deletion_membership_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_operation_transitions_operation_version_uq" ON "deletion_operation_transitions" USING btree ("operation_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_operations_scope_idempotency_uq" ON "deletion_operations" USING btree ("scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "deletion_operations_user_idx" ON "deletion_operations" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "deletion_operations_workspace_idx" ON "deletion_operations" USING btree ("workspace_id","state");--> statement-breakpoint
CREATE INDEX "deletion_operations_profile_idx" ON "deletion_operations" USING btree ("profile_id","state");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_version_positive" CHECK ("memberships"."version" >= 1);--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_suspension_shape" CHECK (("memberships"."lifecycle_state" = 'active' AND "memberships"."suspended_role" IS NULL AND "memberships"."suspended_version" IS NULL AND "memberships"."suspension_operation_id" IS NULL)
          OR ("memberships"."lifecycle_state" = 'deletion_suspended' AND "memberships"."suspended_role" IS NOT NULL AND "memberships"."suspended_version" IS NOT NULL AND "memberships"."suspended_version" >= 1 AND "memberships"."suspension_operation_id" IS NOT NULL));