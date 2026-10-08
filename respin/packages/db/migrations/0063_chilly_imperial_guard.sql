ALTER TABLE "subscriptions" ADD COLUMN "dunning_started_at" timestamp with time zone;--> statement-breakpoint
-- THE BACKFILL (audit P3-R4, decisions R-159). After this migration the
-- episode marker is the only thing the webhook writers consult before opening
-- a grace window, so every `past_due` row that already carries a deadline is
-- stamped here — a NULL marker beside it would read as "no open episode" and
-- the next `invoice.payment_failed` would open a second window inside the same
-- unpaid episode (REG-3). Rows whose deadline has LAPSED are stamped too, for
-- the same reason: they are still inside the episode that wrote it.
--
-- THE START IS DERIVED, never invented: the deadline was written as
-- `now + graceDays` with `graceDays` read from the stored config document, so
-- `grace_expires_at - graceDays` is the instant the row never stored. The
-- number is read from the NEWEST stored document (what `getActiveConfig`
-- parses), never a literal 7. THE ONE IMPRECISION: a row whose deadline was
-- written under an older `graceDays` than the newest document's is stamped off
-- by the difference. The marker's two uses — NULL-vs-set at the writers, and
-- `eventAt > marker` for the clear on `active` — tolerate that.
--
-- REFUSED, NOT GUESSED, when such rows exist and no config document does
-- (unreachable on a tree the app wrote: `graceDays` has no default and
-- `getActiveConfig` fails closed, so no deadline was ever written without
-- one). The condition is CONJUNCTIVE, so a database with no dunning rows
-- migrates clean whether or not config is seeded.
DO $$
DECLARE
  dunning_rows bigint;
  grace_days integer;
BEGIN
  SELECT count(*) INTO dunning_rows
  FROM "subscriptions"
  WHERE "status" = 'past_due' AND "grace_expires_at" IS NOT NULL;
  IF dunning_rows = 0 THEN
    RETURN;
  END IF;
  SELECT ("content"->>'graceDays')::integer INTO grace_days
  FROM "config_versions"
  ORDER BY "version" DESC
  LIMIT 1;
  IF grace_days IS NULL OR grace_days <= 0 THEN
    RAISE EXCEPTION '0063 refuses to guess the dunning episode start for % past_due subscription row(s) with a grace deadline: no stored config document carries graceDays. REMEDY: run `pnpm -C respin config:migrate` to seed the config document, then re-run the migration', dunning_rows;
  END IF;
  UPDATE "subscriptions"
  SET "dunning_started_at" = "grace_expires_at" - make_interval(days => grace_days)
  WHERE "status" = 'past_due' AND "grace_expires_at" IS NOT NULL;
END
$$;
