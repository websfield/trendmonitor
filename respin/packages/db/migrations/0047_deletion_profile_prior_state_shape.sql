DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "deletion_operations"
    WHERE ("scope" = 'profile' AND (
             "profile_prior_state" IS NULL
             OR "profile_prior_state" NOT IN ('active', 'archived')
           ))
       OR ("scope" <> 'profile' AND "profile_prior_state" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'migration 0047 refuses invalid deletion profile restore authority';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_profile_prior_state_shape" CHECK ((("deletion_operations"."scope" = 'profile' AND "deletion_operations"."profile_prior_state" IN ('active', 'archived'))
          OR ("deletion_operations"."scope" <> 'profile' AND "deletion_operations"."profile_prior_state" IS NULL)) IS TRUE);
