-- PRE-FLIGHT MUST BE STATEMENT 1. PGlite and some operator migration runners
-- do not guarantee transactional DDL; refusing after ALTERs would leave an
-- unjournaled half-migration that cannot be rerun safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "credit_ledger"
    WHERE "ref_type" = 'auto_topup'
      AND (
        "kind" IS DISTINCT FROM 'pack'
        OR "ref_id" IS NULL
        OR "stripe_event_id" IS NULL
        OR "amount_cents" IS NULL OR "amount_cents" <= 0
        OR "config_version" IS NULL OR "config_version" <= 0
      )
  ) THEN
    RAISE EXCEPTION '0048 preflight: a legacy auto_topup row lacks its required pack, PaymentIntent, Stripe event, amount, or config authority';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "auto_topup_protocol_rollouts" (
	"protocol" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'expanded' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"fleet_quiesced_at" timestamp with time zone,
	"drain_started_at" timestamp with time zone,
	"provider_reconciled_at" timestamp with time zone,
	"reconciled_customers" integer,
	"reconciled_payment_intents" integer,
	"authority_key_id" text,
	"authority_key_fingerprint" text,
	"stripe_account_id" text,
	"stripe_livemode" boolean,
	"activated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auto_topup_protocol_rollouts_protocol" CHECK ("auto_topup_protocol_rollouts"."protocol" = 'v1'),
	CONSTRAINT "auto_topup_protocol_rollouts_state" CHECK ("auto_topup_protocol_rollouts"."state" IN ('expanded','draining','active')),
	CONSTRAINT "auto_topup_protocol_rollouts_shape" CHECK ((("auto_topup_protocol_rollouts"."state" = 'expanded'
        AND "auto_topup_protocol_rollouts"."revision" = 0
        AND "auto_topup_protocol_rollouts"."fleet_quiesced_at" IS NULL
        AND "auto_topup_protocol_rollouts"."drain_started_at" IS NULL
        AND "auto_topup_protocol_rollouts"."provider_reconciled_at" IS NULL
        AND "auto_topup_protocol_rollouts"."reconciled_customers" IS NULL
        AND "auto_topup_protocol_rollouts"."reconciled_payment_intents" IS NULL
        AND "auto_topup_protocol_rollouts"."authority_key_id" IS NULL
        AND "auto_topup_protocol_rollouts"."authority_key_fingerprint" IS NULL
        AND "auto_topup_protocol_rollouts"."stripe_account_id" IS NULL
        AND "auto_topup_protocol_rollouts"."stripe_livemode" IS NULL
        AND "auto_topup_protocol_rollouts"."activated_at" IS NULL
      ) OR ("auto_topup_protocol_rollouts"."state" = 'draining'
        AND "auto_topup_protocol_rollouts"."revision" > 0
        AND "auto_topup_protocol_rollouts"."fleet_quiesced_at" IS NOT NULL
        AND "auto_topup_protocol_rollouts"."drain_started_at" IS NOT NULL
        AND "auto_topup_protocol_rollouts"."fleet_quiesced_at" <= "auto_topup_protocol_rollouts"."drain_started_at"
        AND "auto_topup_protocol_rollouts"."authority_key_id" = 'v1'
        AND "auto_topup_protocol_rollouts"."authority_key_fingerprint" ~ '^sha256:[0-9a-f]{64}$'
        AND "auto_topup_protocol_rollouts"."stripe_account_id" ~ '^acct_[A-Za-z0-9]+$'
        AND "auto_topup_protocol_rollouts"."stripe_livemode" IS NOT NULL
        AND (
          ("auto_topup_protocol_rollouts"."provider_reconciled_at" IS NULL
            AND "auto_topup_protocol_rollouts"."reconciled_customers" IS NULL
            AND "auto_topup_protocol_rollouts"."reconciled_payment_intents" IS NULL
          ) OR ("auto_topup_protocol_rollouts"."provider_reconciled_at" IS NOT NULL
            AND "auto_topup_protocol_rollouts"."drain_started_at" <= "auto_topup_protocol_rollouts"."provider_reconciled_at"
            AND "auto_topup_protocol_rollouts"."reconciled_customers" >= 0
            AND "auto_topup_protocol_rollouts"."reconciled_payment_intents" >= 0
          )
        )
        AND "auto_topup_protocol_rollouts"."activated_at" IS NULL
      ) OR ("auto_topup_protocol_rollouts"."state" = 'active'
        AND "auto_topup_protocol_rollouts"."revision" > 0
        AND "auto_topup_protocol_rollouts"."fleet_quiesced_at" IS NOT NULL
        AND "auto_topup_protocol_rollouts"."drain_started_at" IS NOT NULL
        AND "auto_topup_protocol_rollouts"."provider_reconciled_at" IS NOT NULL
        AND "auto_topup_protocol_rollouts"."fleet_quiesced_at" <= "auto_topup_protocol_rollouts"."drain_started_at"
        AND "auto_topup_protocol_rollouts"."drain_started_at" <= "auto_topup_protocol_rollouts"."provider_reconciled_at"
        AND "auto_topup_protocol_rollouts"."reconciled_customers" >= 0
        AND "auto_topup_protocol_rollouts"."reconciled_payment_intents" >= 0
        AND "auto_topup_protocol_rollouts"."authority_key_id" = 'v1'
        AND "auto_topup_protocol_rollouts"."authority_key_fingerprint" ~ '^sha256:[0-9a-f]{64}$'
        AND "auto_topup_protocol_rollouts"."stripe_account_id" ~ '^acct_[A-Za-z0-9]+$'
        AND "auto_topup_protocol_rollouts"."stripe_livemode" IS NOT NULL
        AND "auto_topup_protocol_rollouts"."activated_at" IS NOT NULL
        AND "auto_topup_protocol_rollouts"."provider_reconciled_at" <= "auto_topup_protocol_rollouts"."activated_at"
      )) IS TRUE)
);
--> statement-breakpoint
INSERT INTO "auto_topup_protocol_rollouts" ("protocol", "state")
VALUES ('v1', 'expanded');--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "auto_topup_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "auto_topup_period_month_utc" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_v1_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Expansion deliberately retains protocol-0 defaults. The reviewed activation
-- operation changes these defaults only after the old fleet is quiescent and
-- every legacy PaymentIntent has been paginated and reconciled.
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_protocol_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_rearm_after_upgrade" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_cutover_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_period_month_utc" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_ordinal" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_currency" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_price_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_credits" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_validity_months" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_config_version" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_payment_intent_status" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_claim_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_topup_attempt_reserved_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_auto_topup_attempt_uq" ON "credit_ledger" USING btree ("auto_topup_attempt_id") WHERE "credit_ledger"."auto_topup_attempt_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_auto_topup_attempt_uq" ON "subscriptions" USING btree ("auto_topup_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_auto_topup_attempt_key_uq" ON "subscriptions" USING btree ("auto_topup_attempt_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_auto_topup_attempt_pi_uq" ON "subscriptions" USING btree ("auto_topup_attempt_payment_intent_id");--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_auto_topup_attempt_shape" CHECK (((
        "credit_ledger"."ref_type" = 'auto_topup'
        AND "credit_ledger"."kind" = 'pack'
        AND "credit_ledger"."ref_id" IS NOT NULL
        AND "credit_ledger"."stripe_event_id" IS NOT NULL
        AND "credit_ledger"."amount_cents" > 0
        AND "credit_ledger"."config_version" > 0
        AND (
          (
            "credit_ledger"."auto_topup_attempt_id" IS NOT NULL
            AND "credit_ledger"."auto_topup_period_month_utc" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          ) OR (
            "credit_ledger"."auto_topup_attempt_id" IS NULL
            AND "credit_ledger"."auto_topup_period_month_utc" IS NULL
          )
        )
      ) OR (
        "credit_ledger"."ref_type" IS DISTINCT FROM 'auto_topup'
        AND "credit_ledger"."auto_topup_attempt_id" IS NULL
        AND "credit_ledger"."auto_topup_period_month_utc" IS NULL
      )) IS TRUE);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_auto_topup_attempt_shape" CHECK (((
        "subscriptions"."auto_topup_attempt_id" IS NULL
        AND "subscriptions"."auto_topup_attempt_period_month_utc" IS NULL
        AND "subscriptions"."auto_topup_attempt_ordinal" IS NULL
        AND "subscriptions"."auto_topup_attempt_idempotency_key" IS NULL
        AND "subscriptions"."auto_topup_attempt_amount_cents" IS NULL
        AND "subscriptions"."auto_topup_attempt_currency" IS NULL
        AND "subscriptions"."auto_topup_attempt_price_id" IS NULL
        AND "subscriptions"."auto_topup_attempt_credits" IS NULL
        AND "subscriptions"."auto_topup_attempt_validity_months" IS NULL
        AND "subscriptions"."auto_topup_attempt_config_version" IS NULL
        AND "subscriptions"."auto_topup_attempt_customer_id" IS NULL
        AND "subscriptions"."auto_topup_attempt_payment_intent_id" IS NULL
        AND "subscriptions"."auto_topup_attempt_payment_intent_status" IS NULL
        AND "subscriptions"."auto_topup_attempt_claim_id" IS NULL
        AND "subscriptions"."auto_topup_attempt_claimed_at" IS NULL
        AND "subscriptions"."auto_topup_attempt_dispatched_at" IS NULL
        AND "subscriptions"."auto_topup_attempt_reserved_at" IS NULL
      ) OR (
        "subscriptions"."auto_topup_attempt_id" IS NOT NULL
        AND "subscriptions"."auto_topup_attempt_period_month_utc" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND "subscriptions"."auto_topup_attempt_ordinal" > 0
        AND "subscriptions"."auto_topup_attempt_idempotency_key" IS NOT NULL
        AND "subscriptions"."auto_topup_attempt_amount_cents" > 0
        AND "subscriptions"."auto_topup_attempt_currency" = 'usd'
        AND "subscriptions"."auto_topup_attempt_price_id" IS NOT NULL
        AND "subscriptions"."auto_topup_attempt_credits" > 0
        AND "subscriptions"."auto_topup_attempt_validity_months" > 0
        AND "subscriptions"."auto_topup_attempt_config_version" > 0
        AND "subscriptions"."auto_topup_attempt_customer_id" IS NOT NULL
        AND (
          (
            "subscriptions"."auto_topup_attempt_payment_intent_id" IS NULL
            AND "subscriptions"."auto_topup_attempt_payment_intent_status" IS NULL
          ) OR (
            "subscriptions"."auto_topup_attempt_payment_intent_id" IS NOT NULL
            AND "subscriptions"."auto_topup_attempt_payment_intent_status" IN (
              'requires_payment_method',
              'requires_confirmation',
              'requires_action',
              'processing',
              'requires_capture',
              'succeeded'
            )
          )
        )
        AND "subscriptions"."auto_topup_attempt_reserved_at" IS NOT NULL
        AND "subscriptions"."auto_topup_attempt_dispatched_at" >= "subscriptions"."auto_topup_attempt_reserved_at"
        AND "subscriptions"."auto_topup_attempt_claim_id" IS NOT NULL
        AND "subscriptions"."auto_topup_attempt_claimed_at" >= "subscriptions"."auto_topup_attempt_dispatched_at"
      )) IS TRUE);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_auto_topup_protocol_version" CHECK ("subscriptions"."auto_topup_protocol_version" IN (0, 1));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_auto_topup_protocol_shape" CHECK (((
        "subscriptions"."auto_topup_protocol_version" = 0
        AND NOT "subscriptions"."auto_topup_v1_enabled"
        AND "subscriptions"."auto_topup_attempt_cutover_at" IS NULL
      ) OR (
        "subscriptions"."auto_topup_protocol_version" = 1
        AND "subscriptions"."auto_topup_attempt_cutover_at" IS NOT NULL
      )) IS TRUE);--> statement-breakpoint
CREATE FUNCTION "normalize_auto_topup_protocol_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."auto_topup_v1_enabled" := false;
  NEW."auto_topup_rearm_after_upgrade" := false;
  IF EXISTS (
    SELECT 1 FROM "auto_topup_protocol_rollouts"
    WHERE "protocol" = 'v1' AND "state" = 'active'
  ) THEN
    NEW."auto_topup_protocol_version" := 1;
    NEW."auto_topup_attempt_cutover_at" := clock_timestamp();
  ELSE
    NEW."auto_topup_protocol_version" := 0;
    NEW."auto_topup_attempt_cutover_at" := NULL;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "subscriptions_auto_topup_protocol_insert_trg"
BEFORE INSERT ON "subscriptions"
FOR EACH ROW
EXECUTE FUNCTION "normalize_auto_topup_protocol_insert"();--> statement-breakpoint
CREATE FUNCTION "fence_legacy_auto_topup_subscription_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."auto_topup_enabled"
    AND EXISTS (
      SELECT 1 FROM "auto_topup_protocol_rollouts"
      WHERE "protocol" = 'v1' AND "state" IN ('draining', 'active')
    )
  THEN
    RAISE EXCEPTION 'legacy auto_topup_enabled is fenced after drain starts'
      USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_auto_topup_legacy_fence';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "subscriptions_auto_topup_legacy_fence_trg"
BEFORE INSERT OR UPDATE OF "auto_topup_enabled" ON "subscriptions"
FOR EACH ROW
EXECUTE FUNCTION "fence_legacy_auto_topup_subscription_write"();--> statement-breakpoint
CREATE FUNCTION "fence_unbound_auto_topup_ledger_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."ref_type" = 'auto_topup'
    AND NEW."auto_topup_attempt_id" IS NULL
  THEN
    IF EXISTS (
      SELECT 1 FROM "auto_topup_protocol_rollouts"
      WHERE "protocol" = 'v1' AND "state" = 'active'
    ) THEN
      RAISE EXCEPTION 'auto_topup ledger rows require durable attempt authority after activation'
        USING ERRCODE = '23514', CONSTRAINT = 'credit_ledger_auto_topup_protocol_gate';
    END IF;
    -- A protocol-0 binary deployed during expansion does not know the additive
    -- columns. Normalize its immutable settlement at insert time so activation
    -- cannot make historical monthly spend disappear from the v1 cap query.
    NEW."auto_topup_attempt_id" := NEW."id";
    NEW."auto_topup_period_month_utc" := to_char(
      coalesce(NEW."created_at", clock_timestamp()) AT TIME ZONE 'UTC',
      'YYYY-MM'
    );
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "credit_ledger_auto_topup_protocol_gate_trg"
BEFORE INSERT ON "credit_ledger"
FOR EACH ROW
EXECUTE FUNCTION "fence_unbound_auto_topup_ledger_write"();
