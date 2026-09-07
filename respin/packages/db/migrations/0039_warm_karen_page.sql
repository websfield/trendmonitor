CREATE TABLE "deletion_recovery_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"secret_digest" text NOT NULL,
	"secret_prefix" text NOT NULL,
	"rate_limit_key_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_recovery_sessions_digest_shape" CHECK ("deletion_recovery_sessions"."secret_digest" ~ '^[0-9a-f]{64}$' AND "deletion_recovery_sessions"."rate_limit_key_digest" ~ '^[0-9a-f]{64}$' AND length("deletion_recovery_sessions"."secret_prefix") = 8),
	CONSTRAINT "deletion_recovery_sessions_exact_ttl" CHECK ("deletion_recovery_sessions"."expires_at" = "deletion_recovery_sessions"."created_at" + interval '15 minutes'),
	CONSTRAINT "deletion_recovery_sessions_consumed_after_creation" CHECK ("deletion_recovery_sessions"."consumed_at" IS NULL OR "deletion_recovery_sessions"."consumed_at" >= "deletion_recovery_sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_cancellation_replay_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_recovery_delivery_shape";--> statement-breakpoint
ALTER TABLE "deletion_cancellation_proofs" ADD COLUMN "recovery_session_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "identity_cancellation_receipt_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deletion_recovery_sessions" ADD CONSTRAINT "deletion_recovery_sessions_operation_id_deletion_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."deletion_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_recovery_sessions_secret_digest_uq" ON "deletion_recovery_sessions" USING btree ("secret_digest");--> statement-breakpoint
CREATE INDEX "deletion_recovery_sessions_operation_created_idx" ON "deletion_recovery_sessions" USING btree ("operation_id","created_at");--> statement-breakpoint
CREATE INDEX "deletion_recovery_sessions_rate_created_idx" ON "deletion_recovery_sessions" USING btree ("rate_limit_key_digest","created_at");--> statement-breakpoint
ALTER TABLE "deletion_cancellation_proofs" ADD CONSTRAINT "deletion_cancellation_proofs_recovery_session_id_deletion_recovery_sessions_id_fk" FOREIGN KEY ("recovery_session_id") REFERENCES "public"."deletion_recovery_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_cancellation_proofs_recovery_session_uq" ON "deletion_cancellation_proofs" USING btree ("recovery_session_id");--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_cancellation_replay_shape" CHECK (("deletion_operations"."state" = 'cancelled' AND "deletion_operations"."cancellation_replay_digest" ~ '^[0-9a-f]{64}$'
            AND (("deletion_operations"."scope" = 'identity' AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NOT NULL)
              OR ("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL)))
          OR ("deletion_operations"."state" <> 'cancelled' AND "deletion_operations"."cancellation_replay_digest" IS NULL AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL));--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_recovery_delivery_shape" CHECK (("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."recovery_delivery_attempt" = 0 AND "deletion_operations"."recovery_delivery_command_id" IS NULL
            AND "deletion_operations"."recovery_delivery_recipient_digest" IS NULL AND "deletion_operations"."recovery_delivery_receipt_digest" IS NULL
            AND "deletion_operations"."recovery_delivery_reconciliation_digest" IS NULL AND "deletion_operations"."recovery_delivery_attempted_at" IS NULL
            AND "deletion_operations"."recovery_delivered_at" IS NULL)
          OR ("deletion_operations"."scope" = 'identity' AND "deletion_operations"."recovery_delivery_attempt" >= 1
            AND "deletion_operations"."recovery_delivery_command_id" IS NOT NULL
            AND "deletion_operations"."recovery_delivery_recipient_digest" ~ '^[0-9a-f]{64}$'
            AND "deletion_operations"."recovery_delivery_attempted_at" IS NOT NULL
            AND (("deletion_operations"."recovery_delivery_status" IN ('pending', 'failed') AND "deletion_operations"."recovery_delivery_receipt_digest" IS NULL AND "deletion_operations"."recovery_delivery_reconciliation_digest" IS NULL AND "deletion_operations"."recovery_delivered_at" IS NULL)
              OR ("deletion_operations"."recovery_delivery_status" = 'unknown' AND "deletion_operations"."recovery_delivery_receipt_digest" IS NULL AND "deletion_operations"."recovery_delivery_reconciliation_digest" ~ '^[0-9a-f]{64}$' AND "deletion_operations"."recovery_delivered_at" IS NULL)
              OR ("deletion_operations"."recovery_delivery_status" = 'confirmed' AND "deletion_operations"."recovery_delivery_receipt_digest" ~ '^[0-9a-f]{64}$' AND "deletion_operations"."recovery_delivery_reconciliation_digest" IS NULL
                AND "deletion_operations"."recovery_delivered_at" >= "deletion_operations"."recovery_delivery_attempted_at" AND "deletion_operations"."recovery_delivered_at" <= "deletion_operations"."recovery_expires_at"))));