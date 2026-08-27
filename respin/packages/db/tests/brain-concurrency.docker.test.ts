// AC-9 + AC-17 on REAL POSTGRES — the two M2a properties PGlite cannot prove.
//
// PGlite is single-session, so "two concurrent inserts of an active brain doc"
// is a serialized approximation there and proves nothing about the partial
// unique index. And `mode: "bigint"` is a node-postgres type-parser property:
// PGlite's driver and the pg driver decode int8 differently, so a round-trip
// that passes in-process says nothing about production.
//
// Without TEST_DATABASE_URL this suite SKIPS LOUDLY, naming exactly what was
// not proven. Its own database name — `respin_test_brain` — is required by the
// harness and must be unique per suite: vitest runs FILES in parallel and each
// suite starts by dropping schema public, so a shared name is a suite being
// reset mid-run by its neighbour.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { modelUsage } from "../src/onboarding-schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[brain-concurrency.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: (1) that the partial unique index on brain_docs " +
      "(profile_id, kind) WHERE status='active' actually holds under TRUE " +
      "concurrency, so 'at most one active version per kind' is a database " +
      "guarantee rather than a serialized approximation; and (2) that " +
      "model_usage.cost_micro_usd round-trips 9007199254740993 as a bigint " +
      "through node-postgres, which returns int8 as a STRING by default — the " +
      "one column a margin dashboard sums. Start the docker-compose DB and set " +
      "TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

/** Migration 0012 made `source_evidence` NOT NULL with a non-empty CHECK. */
const RAW_EVIDENCE = [
  {
    quote: "c",
    inputId: "00000000-0000-4000-8000-000000000001",
    startUtf16: 0,
    endUtf16: 1,
    confidence: "high",
  },
];

describe.skipIf(!MAINTENANCE_URL)("M2a on real Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let workspaceId: string;
  let profileId: string;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_brain"
    );
    await seedAuthUser(harness.db, "brain_user", "brain_user@test.dev");
    workspaceId = (
      await ensureUserWorkspace(harness.db, {
        authUserId: "brain_user",
        name: "Brain",
      })
    ).workspace.id;
    const [p] = await harness.db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "P" })
      .returning();
    profileId = p.id;
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it(
    "AC-9: eight PARALLEL inserts of an active brain doc leave exactly one",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          db.insert(brainDocs).values({
            profileId,
            workspaceId,
            kind: "voice",
            version: i + 1,
            content: { i },
            reason: "race",
            // Migration 0012: `source_evidence` is NOT NULL and non-empty, and
            // an `active` row must carry its confirmation columns.
            sourceEvidence: RAW_EVIDENCE,
            status: "active",
            confirmedAt: new Date(),
            confirmedContentSha256: "0".repeat(64),
          })
        )
      );
      // Distinct `version` per racer, so the (profile, kind, version) unique
      // index cannot be what refuses them — this is the PARTIAL index or
      // nothing. Without it every insert would land.
      expect(
        results.filter((r) => r.status === "fulfilled"),
        "more than one active version survived — the partial unique index is not enforcing REQ-C05"
      ).toHaveLength(1);

      const active = await db
        .select()
        .from(brainDocs)
        .where(eq(brainDocs.status, "active"));
      expect(active).toHaveLength(1);

      // NON-VACUITY, and it is the assertion that makes the count above mean
      // something: the index is PARTIAL, so any number of PROPOSED rows for the
      // same (profile, kind) is fine. A plain unique index would refuse these.
      await db.insert(brainDocs).values([
        { profileId, workspaceId, kind: "voice", version: 20, content: {}, reason: "p1", sourceEvidence: RAW_EVIDENCE },
        { profileId, workspaceId, kind: "voice", version: 21, content: {}, reason: "p2", sourceEvidence: RAW_EVIDENCE },
      ]);
      const proposed = await db
        .select()
        .from(brainDocs)
        .where(eq(brainDocs.status, "proposed"));
      expect(proposed.length).toBeGreaterThanOrEqual(2);
    }
  );

  it(
    "AC-17: cost_micro_usd round-trips 9007199254740993 through node-postgres",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      // 2^53 + 1. Chosen because 2^53 + 2 IS exactly representable as a double
      // and would pass vacuously under `mode: "number"`; this value is not, so
      // a number-mode column returns 9007199254740992 and the test fails.
      const value = 9007199254740993n;
      const [row] = await db
        .insert(modelUsage)
        .values({
          profileId,
          workspaceId,
          attemptId: "att_big",
          purpose: "onboarding_brain_build",
          model: "claude-opus-5",
          tokensIn: 1,
          tokensOut: 1,
          costMicroUsd: value,
          costState: "estimated",
          resolvedTier: "free",
          promptBundleVersion: "pb-1",
          configVersion: 1,
          outcome: "succeeded",
        })
        .returning();
      expect(typeof row.costMicroUsd).toBe("bigint");
      expect(row.costMicroUsd).toBe(value);

      const [read] = await db
        .select()
        .from(modelUsage)
        .where(eq(modelUsage.id, row.id));
      expect(read.costMicroUsd).toBe(value);
      // ...and the DATABASE agrees, so this is not two copies of the same
      // JS-side decode agreeing with each other.
      const raw = await db.execute(
        sql`select cost_micro_usd::text as v from model_usage where id = ${row.id}`
      );
      expect((raw.rows[0] as { v: string }).v).toBe("9007199254740993");
    }
  );
});
