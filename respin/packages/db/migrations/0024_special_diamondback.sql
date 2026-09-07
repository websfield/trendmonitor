-- R-80: THE INCLUDED BUILD BECOMES A DURABLE CLAIM, DECIDED BY THIS INDEX.
--
-- The generated half is the table, its composite FK and the unique index. The
-- hand-written half is the BACKFILL at the bottom, and it is the part that
-- matters on a populated database: every profile that has already used its
-- included build must arrive at this migration still holding a claim on it.
-- Without the backfill, a table that starts empty means "nobody has claimed a
-- build yet" — and every creator who already spent theirs would silently get a
-- second one. That is the same defect this migration fixes, pointing the other
-- way, and it is worse (revenue lost on purpose, once per existing profile).
--
-- ORDER, AND WHY THE INDEX IS CREATED BEFORE THE BACKFILL: if the backfill
-- could ever produce two winners for one (profile, purpose), the migration
-- must fail rather than seed the exact ambiguity it exists to remove.
-- `DISTINCT ON` makes that unreachable; the index is what proves it rather
-- than asserting it.
--
-- B-4's LESSON IS OBSERVED (migration 0012 set NOT NULL + a non-empty CHECK on
-- a populated table with no backfill and no NOT VALID/VALIDATE split, which
-- aborts a deploy mid-migration): NOTHING HERE ALTERS AN EXISTING TABLE. A new
-- table is created empty, then filled from data that already exists, so there
-- is no constraint that can be violated by a row this migration did not write.
--
-- THE BACKFILL IS RE-RUNNABLE (`ON CONFLICT DO NOTHING`). It is written that
-- way deliberately: between this migration and the deploy of the code that
-- writes claims, the OLD code can still record a first billable attempt with
-- no claim, and re-running the final statement afterwards closes that window
-- without touching any claim already made.
CREATE TABLE "first_billable_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"attempt_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "first_billable_attempts" ADD CONSTRAINT "first_billable_attempts_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "first_billable_attempts_profile_purpose_uq" ON "first_billable_attempts" USING btree ("profile_id","purpose");--> statement-breakpoint
-- THE BACKFILL. The winner is chosen by the EXACT rule that priced these rows
-- before this migration existed — the billable, entitlement-consuming attempts
-- of a (profile, purpose), ranked by `(MIN(created_at), attempt_id)`, first one
-- wins — so no existing creator's price changes by one credit. What changes is
-- only how the answer is decided FROM NOW ON: by this index at commit time,
-- rather than by ranking a snapshot that can hide an uncommitted earlier row.
--
--   - The outcome list is `BILLABLE_USAGE_OUTCOMES` (onboarding-schema.ts):
--     `refused` and `schema_invalid` are billable, not only `succeeded`, and a
--     policy refusal really does consume the included build.
--   - `consumed_included_build = true` is the second half of that pair: a
--     truncated reply is billable and NON-consuming (our own reply ceiling),
--     and must not be backfilled as anybody's free build.
--   - ATTEMPT GRAIN, not row grain: a bounded retry writes two rows for one
--     attempt, and its position is where it STARTED (`MIN(created_at)`).
--   - `id` is REUSED FROM THE WINNING USAGE ROW rather than generated. It is
--     already a uuid v7, it is unique (it is that table's primary key), and one
--     usage row can back at most one claim — the same trick migration 0019 used
--     when it backfilled `membership_profile_selections` from `memberships.id`.
--     Postgres 17 has no uuid v7 generator, and `gen_random_uuid()` would put
--     v4 ids in a table whose whole convention is v7.
--   - `created_at` is the instant the claim was actually EARNED, not the
--     instant this migration ran.
WITH "billable_attempts" AS (
	SELECT
		"profile_id",
		"workspace_id",
		"purpose",
		"attempt_id",
		MIN("created_at") AS "first_at",
		(array_agg("id" ORDER BY "created_at", "id"))[1] AS "usage_id"
	FROM "model_usage"
	WHERE "outcome" IN ('succeeded', 'schema_invalid', 'refused')
		AND "consumed_included_build" = true
	GROUP BY "profile_id", "workspace_id", "purpose", "attempt_id"
),
"winners" AS (
	SELECT DISTINCT ON ("profile_id", "purpose")
		"profile_id",
		"workspace_id",
		"purpose",
		"attempt_id",
		"first_at",
		"usage_id"
	FROM "billable_attempts"
	ORDER BY "profile_id", "purpose", "first_at", "attempt_id"
)
INSERT INTO "first_billable_attempts" ("id", "profile_id", "workspace_id", "purpose", "attempt_id", "created_at")
SELECT "usage_id", "profile_id", "workspace_id", "purpose", "attempt_id", "first_at"
FROM "winners"
ON CONFLICT ("profile_id", "purpose") DO NOTHING;
