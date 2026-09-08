CREATE TYPE "public"."activation_contribution_state" AS ENUM('pending', 'applied');--> statement-breakpoint
CREATE TABLE "activation_cohort_daily" (
	"cohort_date" date NOT NULL,
	"metric_version" integer NOT NULL,
	"signups" integer DEFAULT 0 NOT NULL,
	"activated" integer DEFAULT 0 NOT NULL,
	"excluded" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "activation_cohort_daily_cohort_date_metric_version_pk" PRIMARY KEY("cohort_date","metric_version"),
	CONSTRAINT "activation_cohort_daily_counts" CHECK ("activation_cohort_daily"."signups" >= 0 AND "activation_cohort_daily"."activated" >= 0 AND "activation_cohort_daily"."excluded" >= 0 AND "activation_cohort_daily"."activated" <= "activation_cohort_daily"."signups")
);
--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_cohort_date" date;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_excluded" boolean;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_exclusion_source" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_denominator" integer;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_numerator" integer;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_metric_version" integer;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_membership_version" integer;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_payload_hash" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_contribution_state" "activation_contribution_state";--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "activation_receipt_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_activation_shape" CHECK (("deletion_operations"."scope" <> 'identity' AND "deletion_operations"."activation_contribution_state" IS NULL)
          OR ("deletion_operations"."scope" = 'identity' AND ("deletion_operations"."activation_contribution_state" IS NULL OR (
            "deletion_operations"."activation_cohort_date" IS NOT NULL AND "deletion_operations"."activation_excluded" IS NOT NULL
            AND "deletion_operations"."activation_denominator" IN (0, 1) AND "deletion_operations"."activation_numerator" IN (0, 1)
            AND "deletion_operations"."activation_numerator" <= "deletion_operations"."activation_denominator"
            AND ("deletion_operations"."activation_excluded" = ("deletion_operations"."activation_denominator" = 0))
            AND "deletion_operations"."activation_metric_version" IS NOT NULL
            AND (("deletion_operations"."activation_contribution_state" = 'applied') = ("deletion_operations"."activation_applied_at" IS NOT NULL))
            AND (("deletion_operations"."activation_contribution_state" = 'applied') = ("deletion_operations"."activation_receipt_digest" IS NOT NULL))
          ))));