CREATE TABLE "tier_checkout_protocol_rollouts" (
	"protocol" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'expanded' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"fleet_quiesced_at" timestamp with time zone,
	"drain_started_at" timestamp with time zone,
	"provider_reconciled_at" timestamp with time zone,
	"reconciled_customers" integer,
	"reconciled_sessions" integer,
	"stripe_account_id" text,
	"stripe_livemode" boolean,
	"activated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_checkout_protocol_rollouts_protocol" CHECK ("tier_checkout_protocol_rollouts"."protocol" = 'v1'),
	CONSTRAINT "tier_checkout_protocol_rollouts_state" CHECK ("tier_checkout_protocol_rollouts"."state" IN ('expanded','draining','active')),
	CONSTRAINT "tier_checkout_protocol_rollouts_shape" CHECK ((("tier_checkout_protocol_rollouts"."state" = 'expanded'
        AND "tier_checkout_protocol_rollouts"."revision" = 0
        AND "tier_checkout_protocol_rollouts"."fleet_quiesced_at" IS NULL
        AND "tier_checkout_protocol_rollouts"."drain_started_at" IS NULL
        AND "tier_checkout_protocol_rollouts"."provider_reconciled_at" IS NULL
        AND "tier_checkout_protocol_rollouts"."reconciled_customers" IS NULL
        AND "tier_checkout_protocol_rollouts"."reconciled_sessions" IS NULL
        AND "tier_checkout_protocol_rollouts"."stripe_account_id" IS NULL
        AND "tier_checkout_protocol_rollouts"."stripe_livemode" IS NULL
        AND "tier_checkout_protocol_rollouts"."activated_at" IS NULL
      ) OR ("tier_checkout_protocol_rollouts"."state" = 'draining'
        AND "tier_checkout_protocol_rollouts"."revision" > 0
        AND "tier_checkout_protocol_rollouts"."fleet_quiesced_at" IS NOT NULL
        AND "tier_checkout_protocol_rollouts"."drain_started_at" IS NOT NULL
        AND "tier_checkout_protocol_rollouts"."fleet_quiesced_at" <= "tier_checkout_protocol_rollouts"."drain_started_at"
        AND "tier_checkout_protocol_rollouts"."stripe_account_id" ~ '^acct_[A-Za-z0-9]+$'
        AND "tier_checkout_protocol_rollouts"."stripe_livemode" IS NOT NULL
        AND (
          ("tier_checkout_protocol_rollouts"."provider_reconciled_at" IS NULL
            AND "tier_checkout_protocol_rollouts"."reconciled_customers" IS NULL
            AND "tier_checkout_protocol_rollouts"."reconciled_sessions" IS NULL
          ) OR ("tier_checkout_protocol_rollouts"."provider_reconciled_at" IS NOT NULL
            AND "tier_checkout_protocol_rollouts"."drain_started_at" <= "tier_checkout_protocol_rollouts"."provider_reconciled_at"
            AND "tier_checkout_protocol_rollouts"."reconciled_customers" >= 0
            AND "tier_checkout_protocol_rollouts"."reconciled_sessions" >= 0
          )
        )
        AND "tier_checkout_protocol_rollouts"."activated_at" IS NULL
      ) OR ("tier_checkout_protocol_rollouts"."state" = 'active'
        AND "tier_checkout_protocol_rollouts"."revision" > 0
        AND "tier_checkout_protocol_rollouts"."fleet_quiesced_at" IS NOT NULL
        AND "tier_checkout_protocol_rollouts"."drain_started_at" IS NOT NULL
        AND "tier_checkout_protocol_rollouts"."provider_reconciled_at" IS NOT NULL
        AND "tier_checkout_protocol_rollouts"."fleet_quiesced_at" <= "tier_checkout_protocol_rollouts"."drain_started_at"
        AND "tier_checkout_protocol_rollouts"."drain_started_at" <= "tier_checkout_protocol_rollouts"."provider_reconciled_at"
        AND "tier_checkout_protocol_rollouts"."reconciled_customers" >= 0
        AND "tier_checkout_protocol_rollouts"."reconciled_sessions" >= 0
        AND "tier_checkout_protocol_rollouts"."stripe_account_id" ~ '^acct_[A-Za-z0-9]+$'
        AND "tier_checkout_protocol_rollouts"."stripe_livemode" IS NOT NULL
        AND "tier_checkout_protocol_rollouts"."activated_at" IS NOT NULL
        AND "tier_checkout_protocol_rollouts"."provider_reconciled_at" <= "tier_checkout_protocol_rollouts"."activated_at"
      )) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_fence_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_fence_subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_fence_status" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_fence_observed_subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_generation_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_tier" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_price_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_subscription_generation" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_session_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_stripe_livemode" boolean;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_authority" jsonb;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier_checkout_attempt_reserved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "pack_checkout_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "tier_checkout_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "tier_invoice_authority" jsonb;--> statement-breakpoint
INSERT INTO "tier_checkout_protocol_rollouts" ("protocol", "state", "revision")
VALUES ('v1', 'expanded', 0);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "respin_pack_checkout_config_write_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rollout_state text;
  legacy_pack_mappings integer;
  v1_pack_mappings integer;
BEGIN
  SELECT "state" INTO rollout_state
    FROM "tier_checkout_protocol_rollouts"
   WHERE "protocol" = 'v1'
   FOR SHARE;

  IF rollout_state IN ('draining', 'active') THEN
    SELECT
      count(*) FILTER (
        WHERE value = 'pack'
          AND key !~ '^respin_pack_checkout_v1:price_[A-Za-z0-9_]+$'
      ),
      count(*) FILTER (
        WHERE value = 'pack'
          AND key ~ '^respin_pack_checkout_v1:price_[A-Za-z0-9_]+$'
      )
      INTO legacy_pack_mappings, v1_pack_mappings
      FROM jsonb_each_text(COALESCE(NEW."content"->'stripePriceMap', '{}'::jsonb));

    IF legacy_pack_mappings <> 0 OR v1_pack_mappings > 1 THEN
      RAISE EXCEPTION 'active tier Checkout rollout allows zero or one rollback-safe v1 pack price mapping and no legacy pack mapping';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "config_versions_pack_checkout_write_guard"
BEFORE INSERT ON "config_versions"
FOR EACH ROW EXECUTE FUNCTION "respin_pack_checkout_config_write_guard"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "respin_pack_checkout_receipt_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rollout_state text;
  rollout_drain_started_at timestamp with time zone;
  receipt_payload jsonb;
  metadata jsonb;
  provider_attempt text;
  provider_created bigint;
  provider_validity integer;
BEGIN
  IF NEW."kind" IS DISTINCT FROM 'pack'
     OR NEW."ref_type" IS DISTINCT FROM 'checkout_session' THEN
    RETURN NEW;
  END IF;

  SELECT "state", "drain_started_at"
    INTO rollout_state, rollout_drain_started_at
    FROM "tier_checkout_protocol_rollouts"
   WHERE "protocol" = 'v1'
   FOR SHARE;
  IF rollout_state IS NULL THEN
    RAISE EXCEPTION 'tier Checkout rollout authority is missing';
  END IF;
  IF rollout_state = 'expanded' THEN
    RETURN NEW;
  END IF;

  SELECT "payload" INTO receipt_payload
    FROM "stripe_events"
   WHERE "id" = NEW."stripe_event_id"
   FOR SHARE;
  IF receipt_payload IS NULL THEN
    RAISE EXCEPTION 'pack checkout ledger requires its in-transaction Stripe receipt';
  END IF;

  metadata := receipt_payload #> '{data,object,metadata}';
  provider_attempt := metadata->>'respin_pack_attempt_id';
  IF provider_attempt IS NULL THEN
    IF NEW."pack_checkout_attempt_id" IS NOT NULL THEN
      RAISE EXCEPTION 'legacy pack receipt cannot claim v1 attempt authority';
    END IF;
    IF rollout_state <> 'expanded' AND (
      rollout_drain_started_at IS NULL
      OR (receipt_payload #>> '{data,object,created}' ~ '^[0-9]+$') IS DISTINCT FROM TRUE
      OR (receipt_payload #>> '{data,object,created}')::bigint * 1000 >
         extract(epoch FROM rollout_drain_started_at) * 1000 + 250000
    ) THEN
      RAISE EXCEPTION 'unsigned legacy pack receipt is outside the provider-bound fleet-drain cutoff';
    END IF;
    RETURN NEW;
  END IF;

  IF (provider_attempt ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') IS DISTINCT FROM TRUE
     OR (metadata->>'credits' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE
     OR (metadata->>'amount_cents' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE
     OR (metadata->>'config_version' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE
     OR (metadata->>'validity_months' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE
     OR (metadata->>'respin_authority_sig' ~ '^[0-9a-fA-F]{64}$') IS DISTINCT FROM TRUE
     OR (receipt_payload->>'created' ~ '^[0-9]+$') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'signed pack receipt authority has invalid database-visible fields';
  END IF;

  provider_created := (receipt_payload->>'created')::bigint;
  provider_validity := (metadata->>'validity_months')::integer;
  IF NEW."pack_checkout_attempt_id"::text IS DISTINCT FROM provider_attempt
     OR NEW."ref_id" IS DISTINCT FROM receipt_payload #>> '{data,object,id}'
     OR NEW."delta" IS DISTINCT FROM (metadata->>'credits')::integer
     OR NEW."amount_cents" IS DISTINCT FROM (metadata->>'amount_cents')::integer
     OR NEW."config_version" IS DISTINCT FROM (metadata->>'config_version')::integer
     OR NEW."expires_at" IS DISTINCT FROM
          (
            (to_timestamp(provider_created) AT TIME ZONE 'UTC')
            + make_interval(months => provider_validity)
          ) AT TIME ZONE 'UTC' THEN
    RAISE EXCEPTION 'pack checkout ledger differs from signed provider authority';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "credit_ledger_pack_checkout_receipt_guard"
AFTER INSERT ON "credit_ledger"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "respin_pack_checkout_receipt_guard"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "respin_tier_checkout_receipt_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rollout_state text;
  receipt_payload jsonb;
  subscription_metadata jsonb;
  authority jsonb;
  provider_attempt text;
  provider_subscription text;
  expected_generation uuid;
  provider_period_end bigint;
BEGIN
  IF NEW."kind" IS DISTINCT FROM 'grant'
     OR NEW."ref_type" IS DISTINCT FROM 'invoice' THEN
    RETURN NEW;
  END IF;
  SELECT "state" INTO rollout_state
    FROM "tier_checkout_protocol_rollouts"
   WHERE "protocol" = 'v1'
   FOR SHARE;
  IF rollout_state IS NULL THEN
    RAISE EXCEPTION 'tier Checkout rollout authority is missing';
  END IF;
  IF rollout_state = 'expanded' THEN
    RETURN NEW;
  END IF;
  SELECT "payload" INTO receipt_payload
    FROM "stripe_events"
   WHERE "id" = NEW."stripe_event_id"
   FOR SHARE;
  IF receipt_payload IS NULL THEN
    RAISE EXCEPTION 'invoice grant has no immutable Stripe receipt';
  END IF;
  subscription_metadata := receipt_payload #> '{data,object,parent,subscription_details,metadata}';
  provider_attempt := subscription_metadata->>'respin_checkout_attempt_id';
  provider_subscription := CASE
    WHEN jsonb_typeof(receipt_payload #> '{data,object,parent,subscription_details,subscription}') = 'string'
      THEN receipt_payload #>> '{data,object,parent,subscription_details,subscription}'
    WHEN jsonb_typeof(receipt_payload #> '{data,object,parent,subscription_details,subscription}') = 'object'
      THEN receipt_payload #>> '{data,object,parent,subscription_details,subscription,id}'
    ELSE NULL
  END;
  SELECT CASE
           WHEN "tier_checkout_generation_attempt_id" IS NOT NULL
                AND (
                  "stripe_subscription_id" = provider_subscription
                  OR "tier_checkout_fence_subscription_id" = provider_subscription
                )
             THEN "tier_checkout_generation_attempt_id"
           WHEN "tier_checkout_attempt_id" IS NOT NULL
                AND (
                  "tier_checkout_attempt_subscription_id" = provider_subscription
                  OR (
                    "tier_checkout_fence_at" IS NOT NULL
                    AND provider_subscription IS NOT NULL
                    AND provider_subscription IS DISTINCT FROM "tier_checkout_fence_subscription_id"
                  )
                )
             THEN "tier_checkout_attempt_id"
           ELSE NULL
         END INTO expected_generation
    FROM "subscriptions"
   WHERE "workspace_id" = NEW."workspace_id"
   FOR SHARE;
  IF expected_generation IS NOT NULL AND provider_attempt IS NULL THEN
    RAISE EXCEPTION 'v1 invoice generation cannot downgrade to legacy grant authority';
  END IF;
  IF expected_generation IS NOT NULL
     AND provider_attempt::uuid IS DISTINCT FROM expected_generation THEN
    RAISE EXCEPTION 'invoice grant names the wrong durable v1 generation';
  END IF;
  authority := (
    SELECT "tier_invoice_authority"
      FROM "stripe_events"
     WHERE "id" = NEW."stripe_event_id"
  );
  IF provider_attempt IS NOT NULL AND (
    (provider_attempt ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') IS DISTINCT FROM TRUE
    OR NEW."tier_checkout_attempt_id"::text IS DISTINCT FROM provider_attempt
    OR authority->>'respin_tier_checkout_attempt_id' IS DISTINCT FROM provider_attempt
    OR authority->>'respin_tier_invoice_id' IS DISTINCT FROM NEW."ref_id"
    OR (authority->>'respin_tier_allowance' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE
    OR NEW."delta" IS DISTINCT FROM (authority->>'respin_tier_allowance')::integer
    OR (authority->>'respin_tier_config_version' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE
    OR NEW."config_version" IS DISTINCT FROM (authority->>'respin_tier_config_version')::integer
    OR (authority->>'respin_tier_period_end' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE
    OR (authority->>'respin_tier_invoice_authority_sig' ~ '^[0-9a-fA-F]{64}$') IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'v1 invoice grant differs from its signed invoice-time authority';
  END IF;
  IF provider_attempt IS NOT NULL THEN
    provider_period_end := (authority->>'respin_tier_period_end')::bigint;
    IF NEW."expires_at" IS DISTINCT FROM
         (
           (to_timestamp(provider_period_end) AT TIME ZONE 'UTC')
           + make_interval(months => 1)
         ) AT TIME ZONE 'UTC' THEN
      RAISE EXCEPTION 'v1 invoice grant expiry differs from its signed service period';
    END IF;
  END IF;
  IF provider_attempt IS NULL AND NEW."tier_checkout_attempt_id" IS NOT NULL THEN
    RAISE EXCEPTION 'legacy invoice grant cannot claim v1 tier Checkout authority';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "credit_ledger_tier_checkout_receipt_guard"
AFTER INSERT ON "credit_ledger"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "respin_tier_checkout_receipt_guard"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "respin_tier_checkout_event_finalization_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  subscription_metadata jsonb;
  authority jsonb;
  provider_attempt text;
  provider_subscription text;
  expected_generation uuid;
  invoice_id text;
  event_created timestamptz;
  workspace_active boolean;
BEGIN
  IF NEW."type" <> 'invoice.paid'
     OR (NEW."payload" #>> '{data,object,billing_reason}' IN
        ('subscription_create', 'subscription_cycle')) IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  subscription_metadata := NEW."payload" #> '{data,object,parent,subscription_details,metadata}';
  provider_attempt := subscription_metadata->>'respin_checkout_attempt_id';
  provider_subscription := CASE
    WHEN jsonb_typeof(NEW."payload" #> '{data,object,parent,subscription_details,subscription}') = 'string'
      THEN NEW."payload" #>> '{data,object,parent,subscription_details,subscription}'
    WHEN jsonb_typeof(NEW."payload" #> '{data,object,parent,subscription_details,subscription}') = 'object'
      THEN NEW."payload" #>> '{data,object,parent,subscription_details,subscription,id}'
    ELSE NULL
  END;
  SELECT CASE
           WHEN "tier_checkout_generation_attempt_id" IS NOT NULL
                AND (
                  "stripe_subscription_id" = provider_subscription
                  OR "tier_checkout_fence_subscription_id" = provider_subscription
                )
             THEN "tier_checkout_generation_attempt_id"
           WHEN "tier_checkout_attempt_id" IS NOT NULL
                AND (
                  "tier_checkout_attempt_subscription_id" = provider_subscription
                  OR (
                    "tier_checkout_fence_at" IS NOT NULL
                    AND provider_subscription IS NOT NULL
                    AND provider_subscription IS DISTINCT FROM "tier_checkout_fence_subscription_id"
                  )
                )
             THEN "tier_checkout_attempt_id"
           ELSE NULL
         END INTO expected_generation
    FROM "subscriptions"
   WHERE "workspace_id" = NEW."workspace_id"
   FOR SHARE;
  IF expected_generation IS NOT NULL AND provider_attempt IS NULL THEN
    RAISE EXCEPTION 'v1 paid invoice generation cannot finalize as legacy';
  END IF;
  IF expected_generation IS NOT NULL AND (
    (provider_attempt ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') IS DISTINCT FROM TRUE
    OR provider_attempt::uuid IS DISTINCT FROM expected_generation
  ) THEN
    RAISE EXCEPTION 'paid invoice names the wrong durable v1 generation';
  END IF;
  IF provider_attempt IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT ("lifecycle_state" = 'active') INTO workspace_active
    FROM "workspaces" WHERE "id" = NEW."workspace_id";
  IF workspace_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;
  invoice_id := NEW."payload" #>> '{data,object,id}';
  IF EXISTS (
    SELECT 1 FROM "credit_ledger" ledger
     WHERE ledger."ref_type" = 'invoice'
       AND ledger."ref_id" = invoice_id
       AND ledger."tier_checkout_attempt_id"::text = provider_attempt
  ) THEN
    authority := NEW."tier_invoice_authority";
    IF authority->>'respin_tier_checkout_attempt_id' IS DISTINCT FROM provider_attempt
       OR (authority->>'respin_tier_invoice_authority_sig' ~ '^[0-9a-fA-F]{64}$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'v1 invoice receipt lacks signed invoice-time economic authority';
    END IF;
    RETURN NEW;
  END IF;
  authority := NEW."tier_invoice_authority";
  IF authority->>'respin_tier_checkout_attempt_id' IS DISTINCT FROM provider_attempt
     OR (authority->>'respin_tier_invoice_authority_sig' ~ '^[0-9a-fA-F]{64}$') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'v1 invoice receipt lacks signed invoice-time economic authority';
  END IF;
  IF NEW."outcome" = 'ignored' AND NEW."payload"->>'created' ~ '^[0-9]+$' THEN
    event_created := to_timestamp((NEW."payload"->>'created')::bigint);
    IF EXISTS (
      SELECT 1 FROM "pause_periods" pause
       WHERE pause."workspace_id" = NEW."workspace_id"
         AND event_created > COALESCE(pause."started_known_at", pause."started_at") + interval '60 seconds'
         AND (pause."ended_known_at" IS NULL OR event_created <= pause."ended_known_at")
    ) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'v1 paid invoice cannot finalize without its exact grant or durable no-grant authority';
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "stripe_events_tier_checkout_finalization_guard"
AFTER INSERT ON "stripe_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "respin_tier_checkout_event_finalization_guard"();--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_tier_invoice_authority_shape" CHECK (
  "stripe_events"."tier_invoice_authority" IS NULL
  OR jsonb_typeof("stripe_events"."tier_invoice_authority") = 'object'
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "respin_tier_checkout_write_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rollout_state text;
  rollout_account text;
  rollout_livemode boolean;
BEGIN
  SELECT "state", "stripe_account_id", "stripe_livemode"
    INTO rollout_state, rollout_account, rollout_livemode
    FROM "tier_checkout_protocol_rollouts"
   WHERE "protocol" = 'v1'
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tier Checkout rollout authority is missing';
  END IF;

  -- Expansion is deliberately transparent to the old webhook binary. No row
  -- is fenced until the operator has stopped that fleet and begins draining;
  -- otherwise an old invoice handler could finalize an ignored receipt.
  IF rollout_state = 'expanded' THEN
    IF NEW."tier_checkout_attempt_id" IS NOT NULL THEN
      RAISE EXCEPTION 'tier Checkout attempt creation requires active rollout';
    END IF;
    RETURN NEW;
  END IF;

  -- Mapping creation is fully closed while provider calls from the stopped
  -- legacy fleet drain. Rewriting the old INSERT is insufficient: that binary
  -- never rereads the row before calling Stripe.
  IF TG_OP = 'INSERT'
     AND rollout_state = 'draining'
     AND NEW."tier_checkout_fence_at" IS NULL
     AND NEW."stripe_subscription_id" IS NULL THEN
    RAISE EXCEPTION 'new Stripe customer mappings are closed during tier Checkout drain';
  END IF;

  -- After activation only the v1 build's explicit sentinel shape can create a
  -- mapping. The old build emits {subscription_id: null, status: none}; reject
  -- it inside the INSERT, before it can proceed to Checkout Session creation.
  IF TG_OP = 'INSERT' AND rollout_state = 'active' THEN
    IF NEW."tier_checkout_fence_at" IS NULL
       AND NEW."stripe_subscription_id" IS NULL THEN
      RAISE EXCEPTION 'active tier Checkout mapping requires the explicit v1 fence shape';
    END IF;
    IF NEW."tier_checkout_fence_at" IS NOT NULL
       AND (
         NEW."tier_checkout_fence_subscription_id" IS NOT NULL
         OR NEW."tier_checkout_fence_status" IS DISTINCT FROM 'none'
         OR NEW."tier_checkout_fence_observed_subscription_id" IS NOT NULL
         OR NEW."stripe_subscription_id" IS DISTINCT FROM
              'checkout_fence:' || NEW."workspace_id"::text
         OR NEW."status" IS DISTINCT FROM 'incomplete'
       ) THEN
      RAISE EXCEPTION 'active tier Checkout mapping has an invalid v1 fence shape';
    END IF;
  END IF;

  -- A rollback/legacy terminal mirror update must not reopen Checkout. Retain
  -- the dead generation while presenting the same live sentinel to old code.
  IF TG_OP = 'UPDATE'
     AND NEW."tier_checkout_fence_at" IS NULL
     AND (
       NEW."stripe_subscription_id" IS NULL
       OR NEW."status" IN ('canceled', 'incomplete_expired')
     ) THEN
    NEW."tier_checkout_fence_at" := clock_timestamp();
    NEW."tier_checkout_fence_subscription_id" := NEW."stripe_subscription_id";
    NEW."tier_checkout_fence_status" := NEW."status";
    NEW."tier_checkout_fence_observed_subscription_id" := NULL;
    NEW."stripe_subscription_id" := 'checkout_fence:' || NEW."workspace_id"::text;
    NEW."status" := 'incomplete';
  END IF;

  IF NEW."tier_checkout_attempt_id" IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD."tier_checkout_attempt_id" IS DISTINCT FROM NEW."tier_checkout_attempt_id"
     ) THEN
    -- Recovery must be able to restore a provider-only v1 Session while the
    -- fleet is draining; application Session creation remains active-only.
    IF rollout_state NOT IN ('draining', 'active')
       OR NEW."tier_checkout_attempt_stripe_account_id" IS DISTINCT FROM rollout_account
       OR NEW."tier_checkout_attempt_stripe_livemode" IS DISTINCT FROM rollout_livemode THEN
      RAISE EXCEPTION 'tier Checkout attempt authority is not active or provider-bound';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."tier_checkout_attempt_id" IS NOT NULL
     AND OLD."tier_checkout_attempt_id" = NEW."tier_checkout_attempt_id"
     AND (
       OLD."tier_checkout_attempt_tier" IS DISTINCT FROM NEW."tier_checkout_attempt_tier"
       OR OLD."tier_checkout_attempt_price_id" IS DISTINCT FROM NEW."tier_checkout_attempt_price_id"
       OR OLD."tier_checkout_attempt_customer_id" IS DISTINCT FROM NEW."tier_checkout_attempt_customer_id"
       OR OLD."tier_checkout_attempt_subscription_generation" IS DISTINCT FROM NEW."tier_checkout_attempt_subscription_generation"
       OR OLD."tier_checkout_attempt_idempotency_key" IS DISTINCT FROM NEW."tier_checkout_attempt_idempotency_key"
       OR OLD."tier_checkout_attempt_stripe_account_id" IS DISTINCT FROM NEW."tier_checkout_attempt_stripe_account_id"
       OR OLD."tier_checkout_attempt_stripe_livemode" IS DISTINCT FROM NEW."tier_checkout_attempt_stripe_livemode"
       OR OLD."tier_checkout_attempt_authority" IS DISTINCT FROM NEW."tier_checkout_attempt_authority"
       OR OLD."tier_checkout_attempt_reserved_at" IS DISTINCT FROM NEW."tier_checkout_attempt_reserved_at"
     ) THEN
    RAISE EXCEPTION 'tier Checkout attempt authority is immutable';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "subscriptions_tier_checkout_write_guard"
BEFORE INSERT OR UPDATE ON "subscriptions"
FOR EACH ROW EXECUTE FUNCTION "respin_tier_checkout_write_guard"();--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tier_checkout_attempt_uq" ON "subscriptions" USING btree ("tier_checkout_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tier_checkout_attempt_key_uq" ON "subscriptions" USING btree ("tier_checkout_attempt_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tier_checkout_attempt_session_uq" ON "subscriptions" USING btree ("tier_checkout_attempt_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_pack_checkout_attempt_uq" ON "credit_ledger" USING btree ("pack_checkout_attempt_id") WHERE "credit_ledger"."pack_checkout_attempt_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_pack_checkout_attempt_shape" CHECK (("credit_ledger"."pack_checkout_attempt_id" IS NULL OR (
        "credit_ledger"."ref_type" = 'checkout_session'
        AND "credit_ledger"."kind" = 'pack'
        AND "credit_ledger"."ref_id" IS NOT NULL
        AND "credit_ledger"."stripe_event_id" IS NOT NULL
        AND "credit_ledger"."amount_cents" > 0
        AND "credit_ledger"."config_version" > 0
      )) IS TRUE);--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_tier_checkout_attempt_shape" CHECK (("credit_ledger"."tier_checkout_attempt_id" IS NULL OR (
        "credit_ledger"."ref_type" = 'invoice'
        AND "credit_ledger"."kind" = 'grant'
        AND "credit_ledger"."ref_id" IS NOT NULL
        AND "credit_ledger"."stripe_event_id" IS NOT NULL
        AND "credit_ledger"."config_version" > 0
      )) IS TRUE);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tier_checkout_attempt_shape" CHECK (((
        "subscriptions"."tier_checkout_attempt_id" IS NULL
        AND "subscriptions"."tier_checkout_attempt_tier" IS NULL
        AND "subscriptions"."tier_checkout_attempt_price_id" IS NULL
        AND "subscriptions"."tier_checkout_attempt_customer_id" IS NULL
        AND "subscriptions"."tier_checkout_attempt_subscription_generation" IS NULL
        AND "subscriptions"."tier_checkout_attempt_idempotency_key" IS NULL
        AND "subscriptions"."tier_checkout_attempt_session_id" IS NULL
        AND "subscriptions"."tier_checkout_attempt_subscription_id" IS NULL
        AND "subscriptions"."tier_checkout_attempt_stripe_account_id" IS NULL
        AND "subscriptions"."tier_checkout_attempt_stripe_livemode" IS NULL
        AND "subscriptions"."tier_checkout_attempt_authority" IS NULL
        AND "subscriptions"."tier_checkout_attempt_reserved_at" IS NULL
      ) OR (
        "subscriptions"."tier_checkout_attempt_id" IS NOT NULL
        AND "subscriptions"."tier_checkout_attempt_tier" IN ('creator', 'pro', 'studio')
        AND "subscriptions"."tier_checkout_attempt_price_id" IS NOT NULL
        AND "subscriptions"."tier_checkout_attempt_customer_id" IS NOT NULL
        AND "subscriptions"."tier_checkout_attempt_idempotency_key" =
          'checkout:v1:' || "subscriptions"."workspace_id"::text || ':' || "subscriptions"."tier_checkout_attempt_id"::text
        AND (
          "subscriptions"."tier_checkout_attempt_session_id" IS NULL
          OR "subscriptions"."tier_checkout_attempt_session_id" ~ '^cs_[A-Za-z0-9_]+$'
        )
        AND (
          "subscriptions"."tier_checkout_attempt_subscription_id" IS NULL
          OR "subscriptions"."tier_checkout_attempt_subscription_id" ~ '^sub_[A-Za-z0-9_]+$'
        )
        AND "subscriptions"."tier_checkout_attempt_stripe_account_id" ~ '^acct_[A-Za-z0-9]+$'
        AND "subscriptions"."tier_checkout_attempt_stripe_livemode" IS NOT NULL
        AND jsonb_typeof("subscriptions"."tier_checkout_attempt_authority") = 'object'
        AND "subscriptions"."tier_checkout_attempt_reserved_at" IS NOT NULL
        AND "subscriptions"."tier_checkout_fence_at" IS NOT NULL
      )) IS TRUE);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tier_checkout_generation_shape" CHECK (
  (("subscriptions"."tier_checkout_generation_attempt_id" IS NULL) OR (
    "subscriptions"."stripe_subscription_id" ~ '^sub_[A-Za-z0-9_]+$'
    OR "subscriptions"."tier_checkout_fence_subscription_id" ~ '^sub_[A-Za-z0-9_]+$'
  )) IS TRUE
);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tier_checkout_fence_shape" CHECK (((
        "subscriptions"."tier_checkout_fence_at" IS NULL
        AND "subscriptions"."tier_checkout_fence_subscription_id" IS NULL
        AND "subscriptions"."tier_checkout_fence_status" IS NULL
        AND "subscriptions"."tier_checkout_fence_observed_subscription_id" IS NULL
      ) OR (
        "subscriptions"."tier_checkout_fence_at" IS NOT NULL
        AND "subscriptions"."tier_checkout_fence_status" IS NOT NULL
        AND (
          (
            "subscriptions"."tier_checkout_fence_observed_subscription_id" IS NULL
            AND "subscriptions"."stripe_subscription_id" =
              'checkout_fence:' || "subscriptions"."workspace_id"::text
          ) OR (
            "subscriptions"."tier_checkout_fence_observed_subscription_id" ~ '^sub_[A-Za-z0-9_]+$'
            AND "subscriptions"."stripe_subscription_id" =
              "subscriptions"."tier_checkout_fence_observed_subscription_id"
          )
        )
        AND "subscriptions"."status" = 'incomplete'
      )) IS TRUE);
