CREATE TABLE "brain_activation_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"voice_doc_id" uuid,
	"strategy_doc_id" uuid,
	"killtest_doc_id" uuid,
	"performance_meta_doc_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_interview_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_inputs" ADD COLUMN "field_key" text;--> statement-breakpoint
ALTER TABLE "brain_activation_snapshots" ADD CONSTRAINT "brain_activation_snapshots_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_interview_drafts" ADD CONSTRAINT "onboarding_interview_drafts_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_interview_drafts_profile_uq" ON "onboarding_interview_drafts" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "onboarding_inputs" ADD CONSTRAINT "onboarding_inputs_field_key_iff_creator_authored" CHECK (("onboarding_inputs"."input_class" = 'creator_authored') = ("onboarding_inputs"."field_key" IS NOT NULL));