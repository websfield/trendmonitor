ALTER TABLE "stripe_events" DROP CONSTRAINT "stripe_events_outcome";--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_outcome" CHECK ("stripe_events"."outcome" IN ('processed','refused_unknown_customer','refused_identity_mismatch','ignored','held_tombstoned'));--> statement-breakpoint
-- R-165 (audit P5-A1). `held_tombstoned` is money Stripe collected for a
-- workspace that was tombstoned when the event arrived: a pack, a renewal
-- invoice or an auto-top-up. Before this migration the handler recorded it as
-- `ignored`, a FINAL outcome, so the money minted nothing and nothing could
-- ever replay it. It is now held, replayed if the workspace's deletion is
-- cancelled, and listed as refund owed if the erasure completes.
--
-- THE ONE NON-FINAL OUTCOME, made structural. Every other outcome was final by
-- convention only (no UPDATE ever touched it); the replay is the first writer
-- that rewrites one, so the rule moves into the database: an outcome may
-- change only FROM `held_tombstoned`, only TO a final outcome, and never back.
CREATE FUNCTION stripe_events_refuse_outcome_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome IS DISTINCT FROM OLD.outcome
     AND (OLD.outcome <> 'held_tombstoned' OR NEW.outcome = 'held_tombstoned') THEN
    RAISE EXCEPTION 'stripe event outcome is final once recorded; only held_tombstoned may settle'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER stripe_events_outcome_final
BEFORE UPDATE ON "stripe_events"
FOR EACH ROW EXECUTE FUNCTION stripe_events_refuse_outcome_change();--> statement-breakpoint
-- The replay settles a held receipt by UPDATE, which the 0049 finalization
-- guard (AFTER INSERT only) never sees. A held v1 paid invoice must meet the
-- same bar when it settles as it would have met had it arrived on an active
-- workspace: its exact grant, or the durable no-grant authority. Same function,
-- fired on the settling UPDATE.
CREATE CONSTRAINT TRIGGER "stripe_events_held_replay_finalization_guard"
AFTER UPDATE ON "stripe_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD."outcome" = 'held_tombstoned' AND NEW."outcome" <> 'held_tombstoned')
EXECUTE FUNCTION "respin_tier_checkout_event_finalization_guard"();
