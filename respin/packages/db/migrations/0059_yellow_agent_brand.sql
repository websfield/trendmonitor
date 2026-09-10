CREATE TABLE "public_sample_spin_buckets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ip_hmac" text NOT NULL,
	"key_version" text NOT NULL,
	"bucket_started_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"admitted" integer DEFAULT 0 NOT NULL,
	"refused" integer DEFAULT 0 NOT NULL,
	"duplicate" integer DEFAULT 0 NOT NULL,
	"blocked" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "public_sample_spin_buckets_window_shape" CHECK ("public_sample_spin_buckets"."expires_at" > "public_sample_spin_buckets"."bucket_started_at" AND "public_sample_spin_buckets"."expires_at" <= "public_sample_spin_buckets"."bucket_started_at" + interval '24 hours'),
	CONSTRAINT "public_sample_spin_buckets_digest_shape" CHECK ("public_sample_spin_buckets"."ip_hmac" ~ '^[0-9a-f]{64}$' AND "public_sample_spin_buckets"."key_version" ~ '^v[0-9]{1,4}$'),
	CONSTRAINT "public_sample_spin_buckets_counts" CHECK ("public_sample_spin_buckets"."admitted" BETWEEN 0 AND 1 AND "public_sample_spin_buckets"."refused" >= 0 AND "public_sample_spin_buckets"."duplicate" >= 0 AND "public_sample_spin_buckets"."blocked" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_sample_spin_buckets_window_uq" ON "public_sample_spin_buckets" USING btree ("key_version","ip_hmac","bucket_started_at");--> statement-breakpoint
CREATE INDEX "public_sample_spin_buckets_expiry_idx" ON "public_sample_spin_buckets" USING btree ("expires_at");