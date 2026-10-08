ALTER TABLE "promotion_proposals" DROP CONSTRAINT "promotion_proposals_evidence_digest_uq";--> statement-breakpoint
ALTER TABLE "promotion_proposals" ADD COLUMN "decision_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_proposals_evidence_digest_uq" ON "promotion_proposals" USING btree ("profile_id","source","family_key","evidence_digest") WHERE "promotion_proposals"."status" NOT IN ('stale', 'superseded');--> statement-breakpoint
ALTER TABLE "promotion_proposals" ADD CONSTRAINT "promotion_proposals_decision_reason" CHECK ("promotion_proposals"."decision_reason" IS NULL
          OR ("promotion_proposals"."status" = 'accepted' AND "promotion_proposals"."decision_reason" = 'already_present'));