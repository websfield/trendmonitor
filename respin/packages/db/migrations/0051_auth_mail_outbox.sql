CREATE TYPE "public"."auth_mail_delivery_status" AS ENUM('pending', 'accepted', 'failed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."auth_mail_purpose" AS ENUM('email_verification', 'password_reset', 'identity_deletion_recovery', 'local_factor_enrollment', 'workspace_invite');--> statement-breakpoint
CREATE TABLE "auth_mail_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" "auth_mail_purpose" NOT NULL,
	"auth_user_id" text,
	"recipient_digest" text,
	"operation_id" uuid,
	"delivery_attempt" integer,
	"admitted_at" timestamp with time zone NOT NULL,
	"admitted_day_utc" text NOT NULL,
	"admitted_month_utc" text NOT NULL,
	"status" "auth_mail_delivery_status" DEFAULT 'pending' NOT NULL,
	"dispatched_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"provider_message_digest" text,
	"failure_code" text,
	"reconciliation_digest" text,
	"action_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_mail_outbox_purpose_link_shape" CHECK ((("auth_mail_outbox"."purpose" = 'identity_deletion_recovery' AND "auth_mail_outbox"."operation_id" IS NOT NULL AND "auth_mail_outbox"."delivery_attempt" >= 1)
          OR ("auth_mail_outbox"."purpose" <> 'identity_deletion_recovery' AND "auth_mail_outbox"."operation_id" IS NULL AND "auth_mail_outbox"."delivery_attempt" IS NULL)) IS TRUE),
	CONSTRAINT "auth_mail_outbox_recipient_shape" CHECK ((("auth_mail_outbox"."auth_user_id" IS NULL AND "auth_mail_outbox"."recipient_digest" IS NULL)
          OR ("auth_mail_outbox"."auth_user_id" IS NOT NULL AND "auth_mail_outbox"."recipient_digest" ~ '^[0-9a-f]{64}$')) IS TRUE),
	CONSTRAINT "auth_mail_outbox_bucket_shape" CHECK (("auth_mail_outbox"."admitted_day_utc" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "auth_mail_outbox"."admitted_month_utc" ~ '^[0-9]{4}-[0-9]{2}$' AND "auth_mail_outbox"."admitted_month_utc" = left("auth_mail_outbox"."admitted_day_utc", 7)) IS TRUE),
	CONSTRAINT "auth_mail_outbox_expiry_after_admission" CHECK ("auth_mail_outbox"."action_expires_at" > "auth_mail_outbox"."admitted_at"),
	CONSTRAINT "auth_mail_outbox_status_shape" CHECK ((("auth_mail_outbox"."status" = 'pending' AND "auth_mail_outbox"."resolved_at" IS NULL AND "auth_mail_outbox"."provider_message_digest" IS NULL AND "auth_mail_outbox"."failure_code" IS NULL AND "auth_mail_outbox"."reconciliation_digest" IS NULL)
          OR ("auth_mail_outbox"."status" = 'accepted' AND "auth_mail_outbox"."dispatched_at" IS NOT NULL AND "auth_mail_outbox"."resolved_at" IS NOT NULL AND "auth_mail_outbox"."resolved_at" >= "auth_mail_outbox"."dispatched_at" AND "auth_mail_outbox"."provider_message_digest" ~ '^[0-9a-f]{64}$' AND "auth_mail_outbox"."failure_code" IS NULL AND "auth_mail_outbox"."reconciliation_digest" IS NULL)
          OR ("auth_mail_outbox"."status" = 'failed' AND "auth_mail_outbox"."resolved_at" IS NOT NULL AND "auth_mail_outbox"."failure_code" IS NOT NULL AND "auth_mail_outbox"."provider_message_digest" IS NULL AND "auth_mail_outbox"."reconciliation_digest" IS NULL)
          OR ("auth_mail_outbox"."status" = 'unknown' AND "auth_mail_outbox"."dispatched_at" IS NOT NULL AND "auth_mail_outbox"."resolved_at" IS NULL AND "auth_mail_outbox"."failure_code" IS NOT NULL AND "auth_mail_outbox"."provider_message_digest" IS NULL AND "auth_mail_outbox"."reconciliation_digest" ~ '^[0-9a-f]{64}$')) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "auth_mail_outbox" ADD CONSTRAINT "auth_mail_outbox_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mail_outbox" ADD CONSTRAINT "auth_mail_outbox_operation_id_deletion_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."deletion_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_mail_outbox_operation_attempt_uq" ON "auth_mail_outbox" USING btree ("operation_id","delivery_attempt") WHERE "auth_mail_outbox"."operation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_mail_outbox_day_purpose_idx" ON "auth_mail_outbox" USING btree ("admitted_day_utc","purpose");--> statement-breakpoint
CREATE INDEX "auth_mail_outbox_month_purpose_idx" ON "auth_mail_outbox" USING btree ("admitted_month_utc","purpose");--> statement-breakpoint
CREATE INDEX "auth_mail_outbox_auth_user_idx" ON "auth_mail_outbox" USING btree ("auth_user_id");