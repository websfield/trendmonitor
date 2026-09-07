ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_journal_intent_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_request_session_digest_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_request_authority_epoch_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_cancellation_replay_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_blocked_resume_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_target_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_recovery_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_recovery_delivery_shape";--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_journal_intent_shape" CHECK ((("deletion_operations"."journal_intent_base_version" IS NULL AND "deletion_operations"."journal_intent_plan_digest" IS NULL AND "deletion_operations"."journal_intent_effective_at" IS NULL)
          OR ("deletion_operations"."journal_intent_base_version" >= 0 AND "deletion_operations"."journal_intent_plan_digest" ~ '^[0-9a-f]{64}$' AND "deletion_operations"."journal_intent_effective_at" IS NOT NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_request_session_digest_shape" CHECK ((("deletion_operations"."scope" = 'identity' AND "deletion_operations"."request_session_digest" IS NOT NULL AND "deletion_operations"."request_session_digest" ~ '^[0-9a-f]{64}$')
          OR ("deletion_operations"."scope" <> 'identity' AND ("deletion_operations"."request_session_digest" IS NULL OR "deletion_operations"."request_session_digest" ~ '^[0-9a-f]{64}$'))) IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_request_authority_epoch_shape" CHECK ((("deletion_operations"."scope" = 'identity' AND "deletion_operations"."request_membership_version" IS NULL AND "deletion_operations"."request_workspace_lifecycle_version" IS NULL AND "deletion_operations"."request_profile_lifecycle_version" IS NULL)
          OR ("deletion_operations"."scope" = 'workspace' AND "deletion_operations"."request_membership_version" >= 1 AND "deletion_operations"."request_workspace_lifecycle_version" >= 1 AND "deletion_operations"."request_profile_lifecycle_version" IS NULL)
          OR ("deletion_operations"."scope" = 'profile' AND "deletion_operations"."request_membership_version" >= 1 AND "deletion_operations"."request_workspace_lifecycle_version" >= 1 AND "deletion_operations"."request_profile_lifecycle_version" >= 1)) IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_cancellation_replay_shape" CHECK ((("deletion_operations"."state" = 'cancelled' AND (
            ("deletion_operations"."cancellation_replay_digest" ~ '^[0-9a-f]{64}$'
              AND (("deletion_operations"."scope" = 'identity' AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NOT NULL)
                OR ("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL)))
            OR ("deletion_operations"."scope" = 'identity'
              AND "deletion_operations"."cancellation_replay_digest" IS NULL
              AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL
              AND "deletion_operations"."recovery_delivery_status" = 'confirmed'
              AND "deletion_operations"."state_version" = 2
              AND "deletion_operations"."journal_receipt_digest" ~ '^[0-9a-f]{64}$'
              AND "deletion_operations"."journal_version" = 2)))
          OR ("deletion_operations"."state" <> 'cancelled' AND "deletion_operations"."cancellation_replay_digest" IS NULL AND "deletion_operations"."identity_cancellation_receipt_expires_at" IS NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_blocked_resume_shape" CHECK ((("deletion_operations"."state" = 'blocked' AND "deletion_operations"."blocked_resume_state" IN ('tombstoned', 'external_actions_pending', 'grace', 'erasing', 'verifying'))
          OR ("deletion_operations"."state" <> 'blocked' AND "deletion_operations"."blocked_resume_state" IS NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_target_shape" CHECK ((("deletion_operations"."scope" = 'identity' AND "deletion_operations"."user_id" IS NOT NULL AND "deletion_operations"."workspace_id" IS NULL AND "deletion_operations"."profile_id" IS NULL AND "deletion_operations"."target_key" = 'identity:' || "deletion_operations"."user_id"::text)
          OR ("deletion_operations"."scope" = 'profile' AND "deletion_operations"."user_id" IS NULL AND "deletion_operations"."workspace_id" IS NOT NULL AND "deletion_operations"."profile_id" IS NOT NULL AND "deletion_operations"."target_key" = 'profile:' || "deletion_operations"."workspace_id"::text || ':' || "deletion_operations"."profile_id"::text)
          OR ("deletion_operations"."scope" = 'workspace' AND "deletion_operations"."user_id" IS NULL AND "deletion_operations"."workspace_id" IS NOT NULL AND "deletion_operations"."profile_id" IS NULL AND "deletion_operations"."target_key" = 'workspace:' || "deletion_operations"."workspace_id"::text)) IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_recovery_shape" CHECK ((("deletion_operations"."scope" = 'identity' AND "deletion_operations"."recovery_expires_at" IS NOT NULL AND "deletion_operations"."recovery_delivery_status" <> 'not_required'
            AND (("deletion_operations"."recovery_consumed_at" IS NULL AND "deletion_operations"."recovery_secret_digest" IS NOT NULL AND "deletion_operations"."recovery_secret_prefix" IS NOT NULL)
              OR ("deletion_operations"."recovery_consumed_at" IS NOT NULL AND "deletion_operations"."recovery_secret_digest" IS NULL AND "deletion_operations"."recovery_secret_prefix" IS NULL)))
          OR ("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."recovery_secret_digest" IS NULL AND "deletion_operations"."recovery_secret_prefix" IS NULL AND "deletion_operations"."recovery_expires_at" IS NULL AND "deletion_operations"."recovery_consumed_at" IS NULL AND "deletion_operations"."recovery_delivery_status" = 'not_required')) IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_recovery_delivery_shape" CHECK ((("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."recovery_delivery_attempt" = 0 AND "deletion_operations"."recovery_delivery_command_id" IS NULL
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
                AND "deletion_operations"."recovery_delivered_at" >= "deletion_operations"."recovery_delivery_attempted_at" AND "deletion_operations"."recovery_delivered_at" <= "deletion_operations"."recovery_expires_at")))) IS TRUE);