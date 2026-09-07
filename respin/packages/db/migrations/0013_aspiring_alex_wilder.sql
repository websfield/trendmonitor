CREATE TYPE "public"."creator_profile_state" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "state" "creator_profile_state" DEFAULT 'active' NOT NULL;