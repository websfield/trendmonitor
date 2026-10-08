ALTER TABLE "stripe_events" DROP CONSTRAINT "stripe_events_outcome";--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reauthenticated_method" text;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "refund_owed_amount" bigint;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "refund_owed_currency" text;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "refund_owed_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "cancelled_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "cascade_parent_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_reauthenticated_method_shape" CHECK ("session"."reauthenticated_method" IS NULL OR "session"."reauthenticated_method" IN ('password', 'google'));--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_refund_owed_shape" CHECK (("stripe_events"."outcome" = 'refund_owed') = ("stripe_events"."refund_owed_operation_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_outcome" CHECK ("stripe_events"."outcome" IN ('processed','refused_unknown_customer','refused_identity_mismatch','ignored','held_tombstoned','refund_owed'));--> statement-breakpoint
-- R-165 / gate H1+M1: `refund_owed` is the durable record of money held for a
-- workspace that was then ERASED. The workspace's own erasure transaction
-- moves each `held_tombstoned` receipt to it, with the amount, the currency
-- and the erasing operation's id, BEFORE it clears the payload. Final, like
-- every outcome but `held_tombstoned`: the replay never touches it, and the
-- trigger below refuses any move out of it.
CREATE OR REPLACE FUNCTION stripe_events_refuse_outcome_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome IS DISTINCT FROM OLD.outcome
     AND (OLD.outcome <> 'held_tombstoned' OR NEW.outcome = 'held_tombstoned') THEN
    RAISE EXCEPTION 'stripe event outcome is final once recorded; only held_tombstoned may settle'
      USING ERRCODE = '23514';
  END IF;
  IF (NEW.refund_owed_amount IS DISTINCT FROM OLD.refund_owed_amount
      OR NEW.refund_owed_currency IS DISTINCT FROM OLD.refund_owed_currency
      OR NEW.refund_owed_operation_id IS DISTINCT FROM OLD.refund_owed_operation_id)
     AND NOT (OLD.outcome = 'held_tombstoned' AND NEW.outcome = 'refund_owed') THEN
    RAISE EXCEPTION 'the refund-owed record is written once, as a held receipt becomes refund_owed'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
-- A receipt that becomes `refund_owed` minted nothing and owes a refund; the
-- v1 finalization guard is for a held receipt that SETTLES into a mint.
DROP TRIGGER "stripe_events_held_replay_finalization_guard" ON "stripe_events";--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "stripe_events_held_replay_finalization_guard"
AFTER UPDATE ON "stripe_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD."outcome" = 'held_tombstoned' AND NEW."outcome" NOT IN ('held_tombstoned', 'refund_owed'))
EXECUTE FUNCTION "respin_tier_checkout_event_finalization_guard"();
