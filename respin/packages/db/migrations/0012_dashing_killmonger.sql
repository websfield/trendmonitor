ALTER TABLE "brain_docs" ALTER COLUMN "source_evidence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD COLUMN "reference_corpus_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD COLUMN "confirmed_content_sha256" text;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD COLUMN "confirmed_fields" jsonb;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD COLUMN "evidence_counts" jsonb;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD CONSTRAINT "brain_docs_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_docs" ADD CONSTRAINT "brain_docs_active_is_confirmed" CHECK ("brain_docs"."status" <> 'active' OR ("brain_docs"."confirmed_at" IS NOT NULL AND "brain_docs"."confirmed_content_sha256" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "brain_docs" ADD CONSTRAINT "brain_docs_source_evidence_non_empty" CHECK (jsonb_array_length("brain_docs"."source_evidence") > 0);