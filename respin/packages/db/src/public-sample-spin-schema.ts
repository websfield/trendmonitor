// Phase 10a plan C4 (R-117, R-123): the public Sample Spin's abuse buckets.
//
// ONE ROW PER (key version, IP HMAC, window). The row stores only
// HMAC-SHA256(dedicated versioned key, canonical client IP), the key version,
// an immutable window start, an expiry no later than 24 hours after it, and
// counters. Never the raw IP, never the idea, never any output, never a tenant
// identifier. Counters advance; `expires_at` never does — a request after
// expiry opens a separately identified new window.
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

export const publicSampleSpinBuckets = pgTable(
  "public_sample_spin_buckets",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    ipHmac: text("ip_hmac").notNull(),
    keyVersion: text("key_version").notNull(),
    bucketStartedAt: timestamp("bucket_started_at", { withTimezone: true }).default(sql`clock_timestamp()`).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Admitted outbound-capable logical requests in this window: at most one. */
    admitted: integer("admitted").notNull().default(0),
    /** Admitted requests that ended in a typed refusal (gate, vendor, recovery). */
    refused: integer("refused").notNull().default(0),
    /** Replays of an already-admitted request id. */
    duplicate: integer("duplicate").notNull().default(0),
    /** Requests turned away because the window's one admission was spent. */
    blocked: integer("blocked").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`clock_timestamp()`).notNull(),
  },
  (t) => [
    uniqueIndex("public_sample_spin_buckets_window_uq").on(t.keyVersion, t.ipHmac, t.bucketStartedAt),
    index("public_sample_spin_buckets_expiry_idx").on(t.expiresAt),
    check("public_sample_spin_buckets_window_shape", sql`${t.expiresAt} > ${t.bucketStartedAt} AND ${t.expiresAt} <= ${t.bucketStartedAt} + interval '24 hours'`),
    check("public_sample_spin_buckets_digest_shape", sql`${t.ipHmac} ~ '^[0-9a-f]{64}$' AND ${t.keyVersion} ~ '^v[0-9]{1,4}$'`),
    check("public_sample_spin_buckets_counts", sql`${t.admitted} BETWEEN 0 AND 1 AND ${t.refused} >= 0 AND ${t.duplicate} >= 0 AND ${t.blocked} >= 0`),
  ],
);

export type PublicSampleSpinBucket = typeof publicSampleSpinBuckets.$inferSelect;
