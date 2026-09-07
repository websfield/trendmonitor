CREATE TYPE "public"."stripe_receipt_attribution" AS ENUM('workspace_attributed', 'customer_attributed', 'unattributed');--> statement-breakpoint
CREATE TYPE "public"."content_rights_basis" AS ENUM('profile_private', 'creator_consent', 'independently_licensed', 'product_seed');--> statement-breakpoint
ALTER TABLE "stripe_events" DROP CONSTRAINT "stripe_events_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "autopsies" DROP CONSTRAINT "autopsies_matched_framework_id_frameworks_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "receipt_attribution" "stripe_receipt_attribution";--> statement-breakpoint
ALTER TABLE "frameworks" ADD COLUMN "rights_basis" "content_rights_basis";--> statement-breakpoint
ALTER TABLE "frameworks" ADD COLUMN "rights_subject_user_id" uuid;--> statement-breakpoint
ALTER TABLE "frameworks" ADD COLUMN "rights_evidence_id" text;--> statement-breakpoint
ALTER TABLE "autopsies" ADD COLUMN "rights_basis" "content_rights_basis";--> statement-breakpoint
ALTER TABLE "autopsies" ADD COLUMN "rights_subject_user_id" uuid;--> statement-breakpoint
ALTER TABLE "autopsies" ADD COLUMN "rights_evidence_id" text;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD COLUMN "rights_basis" "content_rights_basis";--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD COLUMN "rights_subject_user_id" uuid;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD COLUMN "rights_evidence_id" text;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD COLUMN "rights_basis" "content_rights_basis";--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD COLUMN "rights_subject_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD COLUMN "rights_evidence_id" text;--> statement-breakpoint
-- Existing private rows have a deterministic rights classification. Existing
-- shared analysis does not: its old provenance can prove consent evidence, but
-- it cannot prove which domain user is the rights subject. Stop the migration
-- instead of guessing an identity and creating analysis that outlives consent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trend_transcripts" WHERE "rights_scope" = 'shared_analysis')
     OR EXISTS (SELECT 1 FROM "autopsy_cache_claims" WHERE "rights_scope" = 'shared_analysis')
     OR EXISTS (SELECT 1 FROM "autopsies" WHERE "rights_scope" = 'shared_analysis') THEN
    RAISE EXCEPTION '0034 requires explicit rights subject/evidence attribution for pre-existing shared transcript analysis; no subject was guessed';
  END IF;
END $$;--> statement-breakpoint
-- Only the checked-in library seed has a deterministic shared-framework basis.
-- Any other pre-existing shared row needs an operator-supplied licence or
-- consent subject and therefore fails closed here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "frameworks"
    WHERE "visibility" = 'shared'
      AND "curated_by" IS DISTINCT FROM 'seed:respin-library-v1'
  ) THEN
    RAISE EXCEPTION '0034 requires explicit rights attribution for pre-existing non-seed shared frameworks';
  END IF;
END $$;--> statement-breakpoint
UPDATE "trend_transcripts"
SET "rights_basis" = 'profile_private'
WHERE "rights_scope" = 'profile_private';--> statement-breakpoint
UPDATE "autopsy_cache_claims"
SET "rights_basis" = 'profile_private'
WHERE "rights_scope" = 'profile_private';--> statement-breakpoint
UPDATE "autopsies"
SET "rights_basis" = 'profile_private'
WHERE "rights_scope" = 'profile_private';--> statement-breakpoint
UPDATE "frameworks"
SET "rights_basis" = CASE
  WHEN "visibility" = 'private' THEN 'profile_private'::"content_rights_basis"
  WHEN "visibility" = 'shared' AND "curated_by" = 'seed:respin-library-v1' THEN 'product_seed'::"content_rights_basis"
END;--> statement-breakpoint
UPDATE "stripe_events"
SET "receipt_attribution" = CASE
  WHEN "workspace_id" IS NOT NULL THEN 'workspace_attributed'::"stripe_receipt_attribution"
  WHEN "stripe_customer_id" IS NOT NULL THEN 'customer_attributed'::"stripe_receipt_attribution"
  ELSE 'unattributed'::"stripe_receipt_attribution"
END;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ALTER COLUMN "rights_basis" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ALTER COLUMN "rights_basis" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "autopsies" ALTER COLUMN "rights_basis" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "frameworks" ALTER COLUMN "rights_basis" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_events" ALTER COLUMN "receipt_attribution" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_rights_subject_user_id_users_id_fk" FOREIGN KEY ("rights_subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsies" ADD CONSTRAINT "autopsies_rights_subject_user_id_users_id_fk" FOREIGN KEY ("rights_subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsies" ADD CONSTRAINT "autopsies_matched_framework_id_frameworks_id_fk" FOREIGN KEY ("matched_framework_id") REFERENCES "public"."frameworks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD CONSTRAINT "autopsy_cache_claims_rights_subject_user_id_users_id_fk" FOREIGN KEY ("rights_subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD CONSTRAINT "trend_transcripts_rights_subject_user_id_users_id_fk" FOREIGN KEY ("rights_subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stripe_events_customer_attribution_idx" ON "stripe_events" USING btree ("stripe_customer_id","receipt_attribution");--> statement-breakpoint
CREATE INDEX "frameworks_rights_subject_user_idx" ON "frameworks" USING btree ("rights_subject_user_id");--> statement-breakpoint
CREATE INDEX "autopsies_rights_subject_user_idx" ON "autopsies" USING btree ("rights_subject_user_id");--> statement-breakpoint
CREATE INDEX "autopsy_cache_claims_rights_subject_user_idx" ON "autopsy_cache_claims" USING btree ("rights_subject_user_id");--> statement-breakpoint
CREATE INDEX "trend_transcripts_rights_subject_user_idx" ON "trend_transcripts" USING btree ("rights_subject_user_id");--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_receipt_attribution_shape" CHECK (("stripe_events"."receipt_attribution" = 'workspace_attributed' AND "stripe_events"."stripe_customer_id" IS NOT NULL)
          OR ("stripe_events"."receipt_attribution" = 'customer_attributed' AND "stripe_events"."workspace_id" IS NULL AND "stripe_events"."stripe_customer_id" IS NOT NULL)
          OR ("stripe_events"."receipt_attribution" = 'unattributed' AND "stripe_events"."workspace_id" IS NULL AND "stripe_events"."stripe_customer_id" IS NULL));--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_rights_shape" CHECK (("frameworks"."visibility" = 'private'
            AND "frameworks"."rights_basis" = 'profile_private'
            AND "frameworks"."rights_subject_user_id" IS NULL
            AND "frameworks"."rights_evidence_id" IS NULL)
          OR ("frameworks"."visibility" = 'shared'
            AND "frameworks"."rights_basis" = 'creator_consent'
            AND "frameworks"."rights_subject_user_id" IS NOT NULL
            AND "frameworks"."rights_evidence_id" IS NOT NULL
            AND "frameworks"."rights_evidence_id" ~ '[^[:space:]]')
          OR ("frameworks"."visibility" = 'shared'
            AND "frameworks"."rights_basis" = 'independently_licensed'
            AND "frameworks"."rights_subject_user_id" IS NULL
            AND "frameworks"."rights_evidence_id" IS NOT NULL
            AND "frameworks"."rights_evidence_id" ~ '[^[:space:]]')
          OR ("frameworks"."visibility" = 'shared'
            AND "frameworks"."rights_basis" = 'product_seed'
            AND "frameworks"."rights_subject_user_id" IS NULL
            AND "frameworks"."rights_evidence_id" IS NULL
            AND "frameworks"."curated_by" = 'seed:respin-library-v1'));--> statement-breakpoint
ALTER TABLE "autopsies" ADD CONSTRAINT "autopsies_rights_shape" CHECK (("autopsies"."rights_scope" = 'profile_private'
            AND "autopsies"."rights_basis" = 'profile_private'
            AND "autopsies"."rights_subject_user_id" IS NULL
            AND "autopsies"."rights_evidence_id" IS NULL)
          OR ("autopsies"."rights_scope" = 'shared_analysis'
            AND "autopsies"."rights_basis" = 'creator_consent'
            AND "autopsies"."rights_subject_user_id" IS NOT NULL
            AND "autopsies"."rights_evidence_id" IS NOT NULL
            AND "autopsies"."rights_evidence_id" ~ '[^[:space:]]')
          OR ("autopsies"."rights_scope" = 'shared_analysis'
            AND "autopsies"."rights_basis" = 'independently_licensed'
            AND "autopsies"."rights_subject_user_id" IS NULL
            AND "autopsies"."rights_evidence_id" IS NOT NULL
            AND "autopsies"."rights_evidence_id" ~ '[^[:space:]]'));--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD CONSTRAINT "autopsy_cache_claims_rights_shape" CHECK (("autopsy_cache_claims"."rights_scope" = 'profile_private'
          AND "autopsy_cache_claims"."rights_basis" = 'profile_private'
          AND "autopsy_cache_claims"."rights_subject_user_id" IS NULL
          AND "autopsy_cache_claims"."rights_evidence_id" IS NULL)
        OR ("autopsy_cache_claims"."rights_scope" = 'shared_analysis'
          AND "autopsy_cache_claims"."rights_basis" = 'creator_consent'
          AND "autopsy_cache_claims"."rights_subject_user_id" IS NOT NULL
          AND "autopsy_cache_claims"."rights_evidence_id" IS NOT NULL
          AND "autopsy_cache_claims"."rights_evidence_id" ~ '[^[:space:]]')
        OR ("autopsy_cache_claims"."rights_scope" = 'shared_analysis'
          AND "autopsy_cache_claims"."rights_basis" = 'independently_licensed'
          AND "autopsy_cache_claims"."rights_subject_user_id" IS NULL
          AND "autopsy_cache_claims"."rights_evidence_id" IS NOT NULL
          AND "autopsy_cache_claims"."rights_evidence_id" ~ '[^[:space:]]'));--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD CONSTRAINT "trend_transcripts_rights_shape" CHECK (("trend_transcripts"."rights_scope" = 'profile_private'
            AND "trend_transcripts"."rights_basis" = 'profile_private'
            AND "trend_transcripts"."rights_subject_user_id" IS NULL
            AND "trend_transcripts"."rights_evidence_id" IS NULL)
          OR ("trend_transcripts"."rights_scope" = 'shared_analysis'
            AND "trend_transcripts"."rights_basis" = 'creator_consent'
            AND "trend_transcripts"."rights_subject_user_id" IS NOT NULL
            AND "trend_transcripts"."rights_evidence_id" IS NOT NULL
            AND "trend_transcripts"."rights_evidence_id" ~ '[^[:space:]]')
          OR ("trend_transcripts"."rights_scope" = 'shared_analysis'
            AND "trend_transcripts"."rights_basis" = 'independently_licensed'
            AND "trend_transcripts"."rights_subject_user_id" IS NULL
            AND "trend_transcripts"."rights_evidence_id" IS NOT NULL
            AND "trend_transcripts"."rights_evidence_id" ~ '[^[:space:]]'));--> statement-breakpoint
-- Rights attribution is receipt-time/source-time truth. Reclassification would
-- let a consent-derived artefact silently become independently permanent.
CREATE FUNCTION content_rights_refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rights_basis IS DISTINCT FROM OLD.rights_basis
     OR NEW.rights_subject_user_id IS DISTINCT FROM OLD.rights_subject_user_id
     OR NEW.rights_evidence_id IS DISTINCT FROM OLD.rights_evidence_id THEN
    RAISE EXCEPTION 'content rights basis, subject and evidence are immutable after insert'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER trend_transcripts_rights_immutable
BEFORE UPDATE ON "trend_transcripts"
FOR EACH ROW EXECUTE FUNCTION content_rights_refuse_change();--> statement-breakpoint
CREATE TRIGGER autopsy_cache_claims_rights_immutable
BEFORE UPDATE ON "autopsy_cache_claims"
FOR EACH ROW EXECUTE FUNCTION content_rights_refuse_change();--> statement-breakpoint
CREATE TRIGGER autopsies_rights_immutable
BEFORE UPDATE ON "autopsies"
FOR EACH ROW EXECUTE FUNCTION content_rights_refuse_change();--> statement-breakpoint
CREATE TRIGGER frameworks_rights_immutable
BEFORE UPDATE ON "frameworks"
FOR EACH ROW EXECUTE FUNCTION content_rights_refuse_change();--> statement-breakpoint
CREATE FUNCTION stripe_events_refuse_receipt_attribution_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_attribution IS DISTINCT FROM OLD.receipt_attribution THEN
    RAISE EXCEPTION 'stripe receipt attribution is immutable after insert'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER stripe_events_receipt_attribution_immutable
BEFORE UPDATE ON "stripe_events"
FOR EACH ROW EXECUTE FUNCTION stripe_events_refuse_receipt_attribution_change();
