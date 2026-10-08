ALTER TABLE "stripe_events" ADD COLUMN "held_replay_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "money_needs_operator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "money_needs_operator_paged_at" timestamp with time zone;