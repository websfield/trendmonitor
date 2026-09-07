DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "deletion_operations"
    WHERE "request_session_digest" IS NULL
      AND "state" NOT IN ('complete', 'cancelled')
  ) THEN
    RAISE EXCEPTION '0046 refuses to fabricate missing deletion request session authority; remediate legacy NULL request_session_digest rows before retrying';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_request_session_digest_shape";--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" DROP CONSTRAINT "deletion_operation_transitions_requester_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" DROP CONSTRAINT "deletion_operation_transitions_operation_identity_fk";
--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_transition_identity_uq";--> statement-breakpoint
ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_requester_user_id_users_id_fk";
--> statement-breakpoint
UPDATE "deletion_operations"
SET "request_session_digest" = NULL
WHERE "state" IN ('complete', 'cancelled');--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD COLUMN "requester_digest" text;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD COLUMN "requester_digest" text;--> statement-breakpoint
UPDATE "deletion_operation_transitions"
SET "requester_digest" = encode(
  sha256(convert_to('respin:deletion-requester:v1:' || "requester_user_id"::text, 'UTF8')),
  'hex'
);--> statement-breakpoint
UPDATE "deletion_operations"
SET "requester_digest" = encode(
  sha256(convert_to('respin:deletion-requester:v1:' || "requester_user_id"::text, 'UTF8')),
  'hex'
);--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ALTER COLUMN "requester_digest" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operations" ALTER COLUMN "requester_digest" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ALTER COLUMN "requester_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operations" ALTER COLUMN "requester_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_transition_identity_uq" UNIQUE("id","scope","target_key","requester_digest","payload_hash");--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_operation_identity_fk" FOREIGN KEY ("operation_id","scope","target_key","requester_digest","payload_hash") REFERENCES "public"."deletion_operations"("id","scope","target_key","requester_digest","payload_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_operation_transitions" ADD CONSTRAINT "deletion_operation_transitions_requester_digest_shape" CHECK (("deletion_operation_transitions"."requester_digest" ~ '^[0-9a-f]{64}$') IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_requester_digest_shape" CHECK (("deletion_operations"."requester_digest" ~ '^[0-9a-f]{64}$') IS TRUE);--> statement-breakpoint
ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_request_session_digest_shape" CHECK ((("deletion_operations"."state" IN ('complete', 'cancelled') AND "deletion_operations"."request_session_digest" IS NULL)
  OR ("deletion_operations"."state" NOT IN ('complete', 'cancelled') AND "deletion_operations"."request_session_digest" ~ '^[0-9a-f]{64}$')) IS TRUE);
