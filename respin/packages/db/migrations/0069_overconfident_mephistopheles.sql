-- AUDIT P6-A1 (decisions R-174, ratifying R-152 (b)/(d)): a creator can leave
-- one reaction out of the labelled history a later concept or script draft is
-- shown. The column is NULL while the reaction may be shown, and holds the
-- instant the creator left it out.
ALTER TABLE "generation_feedback" ADD COLUMN "history_excluded_at" timestamp with time zone;--> statement-breakpoint
-- THE FIRST UPDATE PATH ON AN APPEND-ONLY TABLE, AND WHAT IT MAY NOT DO.
--
-- `generation_feedback` had no update path at all until this migration
-- (`tests/table-writers.test.ts` asserted the absence of a `::update` key).
-- The exclusion needs one, so the property that made the table evidence is
-- moved from "nobody writes an UPDATE" to this trigger: an UPDATE may not
-- change which output a reaction is about, what the reaction was, whose it is
-- or when it was recorded, and `history_excluded_at` moves only from NULL to
-- a value, never back and never to a different value. A reaction a creator
-- regrets is still a different reaction recorded beside it, not a rewrite.
--
-- NARROW ON PURPOSE, the 0022 precedent: `note` is NOT in the refused set,
-- because a future pseudonymisation executor may need to rewrite creator text
-- (CLAUDE.md 2026-07-30: a control that becomes an outage). Today nothing
-- writes it after insert, and `tests/table-writers.test.ts` names the one
-- UPDATE writer that exists. `IS DISTINCT FROM` rather than `<>` so a NULL on
-- either side is compared rather than swallowed.
CREATE OR REPLACE FUNCTION generation_feedback_refuse_event_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.generation_id IS DISTINCT FROM OLD.generation_id
     OR NEW.reaction IS DISTINCT FROM OLD.reaction
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'generation_feedback is an event record (slice 7, R10): which output a reaction is about, what it was, whose it is and when it was recorded never change after insert'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.history_excluded_at IS NOT NULL
     AND NEW.history_excluded_at IS DISTINCT FROM OLD.history_excluded_at THEN
    RAISE EXCEPTION 'generation_feedback.history_excluded_at moves only from NULL to a value (R-174): a reaction left out of future drafts stays left out'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER generation_feedback_event_immutable
BEFORE UPDATE ON "generation_feedback"
FOR EACH ROW EXECUTE FUNCTION generation_feedback_refuse_event_change();
