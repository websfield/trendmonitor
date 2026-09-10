CREATE TYPE "public"."stripe_finance_extract_status" AS ENUM('complete', 'incomplete');--> statement-breakpoint
CREATE TABLE "stripe_finance_extracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_stripe_event_id" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"invoice_line_id" text,
	"payment_intent_id" text,
	"refund_id" text,
	"credit_note_id" text,
	"dispute_id" text,
	"charge_id" text,
	"workspace_key" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount_excluding_tax_cents" integer,
	"disputed_amount_cents" integer,
	"service_period_start" timestamp with time zone,
	"service_period_end" timestamp with time zone,
	"dispute_status" text,
	"dispute_effective_at" timestamp with time zone,
	"extraction_version" integer NOT NULL,
	"status" "stripe_finance_extract_status" NOT NULL,
	"incomplete_reason" text,
	"extracted_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"ingested_at" timestamp with time zone,
	CONSTRAINT "stripe_finance_extracts_incomplete_reason" CHECK (("stripe_finance_extracts"."status" = 'incomplete') = ("stripe_finance_extracts"."incomplete_reason" IS NOT NULL)),
	CONSTRAINT "stripe_finance_extracts_currency_usd" CHECK ("stripe_finance_extracts"."currency" = 'USD'),
	CONSTRAINT "stripe_finance_extracts_amounts_nonnegative" CHECK (("stripe_finance_extracts"."amount_excluding_tax_cents" IS NULL OR "stripe_finance_extracts"."amount_excluding_tax_cents" >= 0)
          AND ("stripe_finance_extracts"."disputed_amount_cents" IS NULL OR "stripe_finance_extracts"."disputed_amount_cents" >= 0)),
	CONSTRAINT "stripe_finance_extracts_service_period_order" CHECK ("stripe_finance_extracts"."service_period_start" IS NULL OR "stripe_finance_extracts"."service_period_end" IS NULL OR "stripe_finance_extracts"."service_period_end" >= "stripe_finance_extracts"."service_period_start")
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" DROP CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "pause_periods" DROP CONSTRAINT "pause_periods_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "model_usage" DROP CONSTRAINT "model_usage_profile_workspace_fk";
--> statement-breakpoint
ALTER TABLE "stripe_finance_extracts" ADD CONSTRAINT "stripe_finance_extracts_source_stripe_event_id_stripe_events_id_fk" FOREIGN KEY ("source_stripe_event_id") REFERENCES "public"."stripe_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_finance_extracts_event_object_uq" ON "stripe_finance_extracts" USING btree ("source_stripe_event_id","object_id");--> statement-breakpoint
CREATE INDEX "stripe_finance_extracts_sweep_idx" ON "stripe_finance_extracts" USING btree ("status","ingested_at");--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pause_periods" ADD CONSTRAINT "pause_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE restrict ON UPDATE no action;