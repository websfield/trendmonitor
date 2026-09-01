CREATE TABLE "membership_profile_selections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_profile_selections" ADD CONSTRAINT "membership_profile_selections_membership_workspace_fk" FOREIGN KEY ("user_id","workspace_id") REFERENCES "public"."memberships"("user_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_profile_selections" ADD CONSTRAINT "membership_profile_selections_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id") REFERENCES "public"."creator_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_profile_selections_member_workspace_uq" ON "membership_profile_selections" USING btree ("user_id","workspace_id");--> statement-breakpoint
WITH "single_active_profiles" AS (
	SELECT "workspace_id"
	FROM "creator_profiles"
	WHERE "state" = 'active'
	GROUP BY "workspace_id"
	HAVING count(*) = 1
)
INSERT INTO "membership_profile_selections" ("id", "user_id", "workspace_id", "profile_id")
SELECT "memberships"."id", "memberships"."user_id", "memberships"."workspace_id", "creator_profiles"."id"
FROM "memberships"
INNER JOIN "single_active_profiles"
	ON "single_active_profiles"."workspace_id" = "memberships"."workspace_id"
INNER JOIN "creator_profiles"
	ON "creator_profiles"."workspace_id" = "memberships"."workspace_id"
	AND "creator_profiles"."state" = 'active';
