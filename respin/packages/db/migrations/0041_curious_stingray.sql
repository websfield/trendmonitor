ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_recovery_delivery_shape";--> statement-breakpoint
ALTER TABLE "deletion_cancellation_proofs" ADD COLUMN "status_receipt_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_recovery_sessions" ADD CONSTRAINT "deletion_recovery_sessions_identity_uq" UNIQUE("id","operation_id","auth_user_id");--> statement-breakpoint
ALTER TABLE "deletion_cancellation_proofs" ADD CONSTRAINT "deletion_cancellation_proofs_recovery_identity_fk" FOREIGN KEY ("recovery_session_id","operation_id","auth_user_id") REFERENCES "public"."deletion_recovery_sessions"("id","operation_id","auth_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_cancellation_proofs" ADD CONSTRAINT "deletion_cancellation_proofs_status_receipt_digest_shape" CHECK ("deletion_cancellation_proofs"."status_receipt_digest" IS NULL OR "deletion_cancellation_proofs"."status_receipt_digest" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
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
              OR ("deletion_operations"."recovery_delivery_status" = 'confirmed' AND "deletion_operations"."recovery_delivery_receipt_digest" ~ '^[0-9a-f]{64}$' AND "deletion_operations"."recovery_delivery_reconciliation_digest" IS NULL AND "deletion_operations"."recovery_delivered_at" IS NOT NULL
                AND "deletion_operations"."recovery_delivered_at" >= "deletion_operations"."recovery_delivery_attempted_at" AND "deletion_operations"."recovery_delivered_at" <= "deletion_operations"."recovery_expires_at"))));
