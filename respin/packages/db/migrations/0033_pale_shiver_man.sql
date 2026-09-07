CREATE TYPE "public"."promotion_proposal_source" AS ENUM('results', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."promotion_proposal_status" AS ENUM('proposed', 'accepted', 'rejected', 'stale', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."promotion_proposal_strength" AS ENUM('early', 'repeated', 'corroborated');--> statement-breakpoint
CREATE TYPE "public"."proposal_evidence_result_role" AS ENUM('treatment', 'baseline');--> statement-breakpoint
ALTER TYPE "public"."onboarding_input_class" ADD VALUE 'result_summary';--> statement-breakpoint
ALTER TYPE "public"."onboarding_input_class" ADD VALUE 'feedback_summary';--> statement-breakpoint
CREATE TABLE "promotion_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" "promotion_proposal_source" NOT NULL,
	"target_kind" text NOT NULL,
	"target_pointer" text NOT NULL,
	"payload" jsonb NOT NULL,
	"family_key" text NOT NULL,
	"evidence_digest" text NOT NULL,
	"strength" "promotion_proposal_strength" NOT NULL,
	"basis_brain_doc_id" uuid,
	"status" "promotion_proposal_status" DEFAULT 'proposed' NOT NULL,
	"accepted_brain_doc_id" uuid,
	"accepted_activation_id" uuid,
	"decision_user_id" uuid,
	"decision_role" text,
	"decision_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_proposals_id_profile_workspace_uq" UNIQUE("id","profile_id","workspace_id"),
	CONSTRAINT "promotion_proposals_evidence_digest_uq" UNIQUE("profile_id","source","family_key","evidence_digest"),
	CONSTRAINT "promotion_proposals_payload_is_object" CHECK (jsonb_typeof("promotion_proposals"."payload") = 'object'),
	CONSTRAINT "promotion_proposals_identity_says_something" CHECK ("promotion_proposals"."family_key" ~ '[^[:space:]]' AND "promotion_proposals"."evidence_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "promotion_proposals_source_basis" CHECK (("promotion_proposals"."source" = 'results' AND "promotion_proposals"."basis_brain_doc_id" IS NULL)
          OR ("promotion_proposals"."source" = 'feedback' AND "promotion_proposals"."basis_brain_doc_id" IS NOT NULL)),
	CONSTRAINT "promotion_proposals_source_target" CHECK (("promotion_proposals"."source" = 'results'
            AND "promotion_proposals"."target_kind" = 'performance_meta'
            AND "promotion_proposals"."target_pointer" = '/rules/-')
          OR ("promotion_proposals"."source" = 'feedback'
            AND (("promotion_proposals"."target_kind" = 'voice' AND "promotion_proposals"."target_pointer" = '/avoid/-')
              OR ("promotion_proposals"."target_kind" = 'killtest' AND "promotion_proposals"."target_pointer" = '/rules/-')))),
	CONSTRAINT "promotion_proposals_decision_shape" CHECK (("promotion_proposals"."status" = 'accepted'
            AND "promotion_proposals"."decision_at" IS NOT NULL
            AND "promotion_proposals"."decision_role" IS NOT NULL
            AND "promotion_proposals"."decision_role" IN ('owner', 'editor')
            AND "promotion_proposals"."accepted_brain_doc_id" IS NOT NULL
            AND "promotion_proposals"."accepted_activation_id" IS NOT NULL)
          OR ("promotion_proposals"."status" = 'rejected'
            AND "promotion_proposals"."decision_at" IS NOT NULL
            AND "promotion_proposals"."decision_role" IS NOT NULL
            AND "promotion_proposals"."decision_role" IN ('owner', 'editor')
            AND "promotion_proposals"."accepted_brain_doc_id" IS NULL
            AND "promotion_proposals"."accepted_activation_id" IS NULL)
          OR ("promotion_proposals"."status" IN ('proposed', 'stale', 'superseded')
            AND "promotion_proposals"."decision_user_id" IS NULL
            AND "promotion_proposals"."decision_role" IS NULL
            AND "promotion_proposals"."decision_at" IS NULL
            AND "promotion_proposals"."accepted_brain_doc_id" IS NULL
            AND "promotion_proposals"."accepted_activation_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "proposal_evidence_feedback" (
	"proposal_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"feedback_id" uuid NOT NULL,
	CONSTRAINT "proposal_evidence_feedback_pk" PRIMARY KEY("proposal_id","feedback_id")
);
--> statement-breakpoint
CREATE TABLE "proposal_evidence_results" (
	"proposal_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"role" "proposal_evidence_result_role" NOT NULL,
	CONSTRAINT "proposal_evidence_results_pk" PRIMARY KEY("proposal_id","result_id")
);
--> statement-breakpoint
ALTER TABLE "brain_activation_snapshots" ADD CONSTRAINT "brain_activation_snapshots_id_profile_workspace_uq" UNIQUE("id","profile_id","workspace_id");--> statement-breakpoint
ALTER TABLE "generation_feedback" ADD CONSTRAINT "generation_feedback_id_profile_workspace_uq" UNIQUE("id","profile_id","workspace_id");--> statement-breakpoint
ALTER TABLE "promotion_proposals" ADD CONSTRAINT "promotion_proposals_decision_user_id_users_id_fk" FOREIGN KEY ("decision_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_proposals" ADD CONSTRAINT "promotion_proposals_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "promotion_proposals" ADD CONSTRAINT "promotion_proposals_basis_doc_fk" FOREIGN KEY ("basis_brain_doc_id","profile_id","workspace_id") REFERENCES "public"."brain_docs"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "promotion_proposals" ADD CONSTRAINT "promotion_proposals_accepted_doc_fk" FOREIGN KEY ("accepted_brain_doc_id","profile_id","workspace_id") REFERENCES "public"."brain_docs"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "promotion_proposals" ADD CONSTRAINT "promotion_proposals_accepted_activation_fk" FOREIGN KEY ("accepted_activation_id","profile_id","workspace_id") REFERENCES "public"."brain_activation_snapshots"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "proposal_evidence_feedback" ADD CONSTRAINT "proposal_evidence_feedback_proposal_fk" FOREIGN KEY ("proposal_id","profile_id","workspace_id") REFERENCES "public"."promotion_proposals"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "proposal_evidence_feedback" ADD CONSTRAINT "proposal_evidence_feedback_feedback_fk" FOREIGN KEY ("feedback_id","profile_id","workspace_id") REFERENCES "public"."generation_feedback"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "proposal_evidence_results" ADD CONSTRAINT "proposal_evidence_results_proposal_fk" FOREIGN KEY ("proposal_id","profile_id","workspace_id") REFERENCES "public"."promotion_proposals"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "proposal_evidence_results" ADD CONSTRAINT "proposal_evidence_results_result_fk" FOREIGN KEY ("result_id","profile_id","workspace_id") REFERENCES "public"."results"("id","profile_id","workspace_id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "onboarding_inputs" ADD CONSTRAINT "onboarding_inputs_summaries_have_no_caller_attribution" CHECK ("onboarding_inputs"."input_class"::text NOT IN ('result_summary', 'feedback_summary')
          OR ("onboarding_inputs"."field_key" IS NULL AND "onboarding_inputs"."source_url" IS NULL));
