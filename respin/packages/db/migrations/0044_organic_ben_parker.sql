ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_cancellation_replay_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_cancellation_replay_shape" CHECK ((("deletion_operations"."state" = 'cancelled' AND (
            ("deletion_operations"."cancellation_replay_digest" ~ '^[0-9a-f]{64}$'
              AND (("deletion_operations"."scope" = 'identity' AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NOT NULL)
                OR ("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL)))
            OR ("deletion_operations"."scope" = 'identity'
              AND "deletion_operations"."cancellation_replay_digest" IS NULL
              AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL
              AND "deletion_operations"."recovery_delivery_status" <> 'not_required'
              AND "deletion_operations"."state_version" = 2
              AND "deletion_operations"."journal_receipt_digest" ~ '^[0-9a-f]{64}$'
              AND "deletion_operations"."journal_version" = 2)))
          OR ("deletion_operations"."state" <> 'cancelled' AND "deletion_operations"."cancellation_replay_digest" IS NULL AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL)) IS TRUE);