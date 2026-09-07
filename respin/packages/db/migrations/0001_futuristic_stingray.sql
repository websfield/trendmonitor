CREATE TYPE "public"."credit_kind" AS ENUM('grant', 'pack', 'debit', 'refund', 'adjust', 'expiry');--> statement-breakpoint
CREATE TABLE "config_versions" (
	"version" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "config_versions_version_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"content" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"kind" "credit_kind" NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"reason_code" text,
	"expires_at" timestamp with time zone,
	"amount_cents" integer,
	"config_version" integer,
	"stripe_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_delta_nonzero" CHECK ("credit_ledger"."delta" <> 0),
	CONSTRAINT "credit_ledger_delta_sign" CHECK (("credit_ledger"."kind" IN ('grant','pack','refund') AND "credit_ledger"."delta" > 0)
          OR ("credit_ledger"."kind" IN ('debit','expiry') AND "credit_ledger"."delta" < 0)
          OR ("credit_ledger"."kind" = 'adjust')),
	CONSTRAINT "credit_ledger_adjust_reason" CHECK ("credit_ledger"."kind" <> 'adjust' OR "credit_ledger"."reason_code" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "pause_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"workspace_id" uuid,
	"stripe_customer_id" text,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"status" text DEFAULT 'none' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_expires_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"resumes_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"auto_topup_enabled" boolean DEFAULT false NOT NULL,
	"auto_topup_monthly_cap_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pause_periods" ADD CONSTRAINT "pause_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_stripe_event_uq" ON "credit_ledger" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_expiry_lot_uq" ON "credit_ledger" USING btree ("kind","ref_id") WHERE "credit_ledger"."kind" = 'expiry';--> statement-breakpoint
CREATE UNIQUE INDEX "pause_periods_open_uq" ON "pause_periods" USING btree ("workspace_id") WHERE "pause_periods"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_workspace_uq" ON "subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_customer_uq" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_subscription_uq" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";