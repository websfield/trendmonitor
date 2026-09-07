ALTER TABLE "deletion_operations" ADD COLUMN "blocked_resume_state" "deletion_operation_state";--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_blocked_resume_shape" CHECK (("deletion_operations"."state" = 'blocked' AND "deletion_operations"."blocked_resume_state" IN ('tombstoned', 'external_actions_pending', 'grace', 'erasing', 'verifying'))
          OR ("deletion_operations"."state" <> 'blocked' AND "deletion_operations"."blocked_resume_state" IS NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION refuse_disabled_identity_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  disabled_at timestamp with time zone;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  SELECT ordinary_login_disabled_at
    INTO disabled_at
    FROM "user"
   WHERE id = NEW.user_id
   FOR SHARE;

  IF disabled_at IS NOT NULL THEN
    RAISE EXCEPTION 'ordinary login disabled while identity deletion is pending'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER session_refuse_disabled_identity
BEFORE INSERT OR UPDATE OF user_id ON "session"
FOR EACH ROW EXECUTE FUNCTION refuse_disabled_identity_session();
