// R-80, THE MIGRATION HALF: migration 0024's backfill, run against a POPULATED
// `model_usage`.
//
// WHY THIS FILE EXISTS. The code half of R-80 is easy to prove — two racing
// connections, one claim. The migration half is the one that can only be proved
// against data that already exists, and it is the half with the worse failure
// mode: a claim table that arrives EMPTY means "nobody has claimed a build
// yet", so every creator who already spent their included build silently gets a
// second one. That is the defect R-80 fixes, pointing the other way, once per
// existing profile.
//
// AND IT RUNS THE REAL STATEMENT. The backfill is read out of
// `migrations/0024_*.sql` rather than retyped here, so this cannot pass against
// a copy that has drifted from what a deploy would actually execute — the shape
// `migration-shape.test.ts` takes for structure, taken here for behaviour.
//
// DOCKER, NOT PGLITE: `array_agg(... ORDER BY ...)` and `DISTINCT ON` are the
// backfill's whole tie-break, and the claim is that POSTGRES resolves them the
// way the old pricing rule did. That is a claim about the database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq, sql } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import { creatorProfiles } from "../src/brain-schema";
import { firstBillableAttempts, modelUsage } from "../src/onboarding-schema";
import type { NewModelUsage } from "../src/onboarding-schema";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[db included-build-backfill.docker.test] SKIPPED - TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that migration 0024's backfill gives every profile " +
      "that has ALREADY used its included build a claim on it, that it picks the " +
      "same attempt the pre-R-80 ranking priced as free, that a truncated reply " +
      "never becomes anybody's free build, and that re-running it changes nothing. " +
      "Start the docker-compose DB and set TEST_DATABASE_URL to " +
      "postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

/**
 * The backfill, read from the migration a deploy would run.
 *
 * The LAST statement of the file, split on drizzle's own breakpoint marker. If
 * a later edit adds a statement after it, this reads that one instead and the
 * assertions below go red — which is the right direction: a backfill that has
 * moved is a backfill nobody has re-proved.
 */
function backfillStatement(): string {
  const dir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "migrations"
  );
  const file = readdirSync(dir).find(
    (f) => f.startsWith("0024_") && f.endsWith(".sql")
  );
  if (!file) throw new Error("migration 0024 is missing");
  const parts = readFileSync(join(dir, file), "utf8").split(
    "--> statement-breakpoint"
  );
  const last = parts[parts.length - 1];
  if (!/INSERT INTO "first_billable_attempts"/.test(last)) {
    throw new Error(
      "the last statement of migration 0024 is not the backfill — this test is reading the wrong thing"
    );
  }
  return last;
}

const at = (iso: string) => new Date(iso);

describe.skipIf(!MAINTENANCE_URL)("migration 0024's backfill (R-80)", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let workspaceId: string;
  let pA: string;
  let pB: string;
  let n = 0;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_backfill"
    );
    await seedAuthUser(harness.db, "backfill_user", "backfill@test.dev");
    workspaceId = (
      await ensureUserWorkspace(harness.db, {
        authUserId: "backfill_user",
        name: "W",
      })
    ).workspace.id;
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  beforeEach(async () => {
    // FRESH PROFILES PER CASE rather than a truncate of `model_usage`: "which
    // attempt is this profile's first" is the whole subject, so rows left by an
    // earlier case would decide a later one.
    n += 1;
    const profiles = await harness.db
      .insert(creatorProfiles)
      .values([
        { workspaceId, displayName: `A${n}` },
        { workspaceId, displayName: `B${n}` },
      ])
      .returning();
    pA = profiles[0].id;
    pB = profiles[1].id;
  });

  const usage = (
    profileId: string,
    attemptId: string,
    createdAt: Date,
    over: Partial<NewModelUsage> = {}
  ): NewModelUsage => ({
    profileId,
    workspaceId,
    attemptId,
    purpose: "onboarding_brain",
    model: "claude-sonnet-5",
    tokensIn: 10,
    tokensOut: 5,
    usageRaw: { input_tokens: 10, output_tokens: 5 },
    costMicroUsd: 100n,
    costState: "estimated",
    resolvedTier: "free",
    promptBundleVersion: "pb-1",
    configVersion: 1,
    outcome: "succeeded",
    consumedIncludedBuild: true,
    createdAt,
    ...over,
  });

  const runBackfill = async () => {
    await harness.db.execute(sql.raw(backfillStatement()));
  };

  const claims = (profileId: string) =>
    harness.db
      .select()
      .from(firstBillableAttempts)
      .where(eq(firstBillableAttempts.profileId, profileId))
      .orderBy(asc(firstBillableAttempts.purpose));

  it("gives an existing profile a claim on the attempt the OLD rule priced as free", async () => {
    // The rule this replaces: billable AND entitlement-consuming attempts,
    // ranked by `(MIN(created_at), attempt_id)`, first one free. Every trap in
    // that sentence is a row here.
    await harness.db.insert(modelUsage).values([
      // EARLIEST OF ALL and NOT billable — a 429 produced nothing and cost us
      // nothing. If the backfill ranked on `created_at` alone this wins.
      usage(pA, "att-rate-limited", at("2026-08-01T10:00:00Z"), {
        outcome: "rate_limited",
        consumedIncludedBuild: false,
        costState: "unknown",
        costMicroUsd: null,
      }),
      // Billable but NON-CONSUMING: a truncated reply is our own reply
      // ceiling, not the creator's doing (2026-08-29 billing gate).
      usage(pA, "att-truncated", at("2026-08-01T10:01:00Z"), {
        outcome: "schema_invalid",
        consumedIncludedBuild: false,
      }),
      // THE REAL FIRST ONE.
      usage(pA, "att-first", at("2026-08-01T11:00:00Z")),
      // Its RETRY row, written later under the SAME attempt id: an attempt's
      // position is where it STARTED, so this must not push `att-first` behind
      // `att-second`.
      usage(pA, "att-first", at("2026-08-01T13:00:00Z")),
      usage(pA, "att-second", at("2026-08-01T12:00:00Z")),
    ]);

    await runBackfill();

    const rows = await claims(pA);
    expect(rows).toHaveLength(1);
    expect(rows[0].attemptId).toBe("att-first");
    expect(rows[0].workspaceId).toBe(workspaceId);
    // The claim is dated when it was EARNED, not when the migration ran.
    expect(rows[0].createdAt.toISOString()).toBe("2026-08-01T11:00:00.000Z");
  });

  it("a profile whose only billable attempt was NON-CONSUMING gets no claim at all", async () => {
    // ...so their included build is still there, which is exactly what the
    // truncation carve-out promises. The opposite direction — backfilling this
    // as a claim — would charge a creator 50 credits for an outage we caused.
    await harness.db.insert(modelUsage).values([
      usage(pB, "att-trunc-only", at("2026-08-02T10:00:00Z"), {
        outcome: "schema_invalid",
        consumedIncludedBuild: false,
      }),
    ]);

    await runBackfill();

    expect(await claims(pB)).toEqual([]);
  });

  it("a POLICY REFUSAL is a claim — it is billable AND consuming", async () => {
    // The case `spend-rollup.ts` has documented since 2026-08-29: a profile
    // whose first attempt is a refusal has its free slot consumed by THAT row,
    // and the next successful attempt is priced. Backfilling only `succeeded`
    // rows would hand that profile a second free build.
    await harness.db.insert(modelUsage).values([
      usage(pA, "att-refused", at("2026-08-03T10:00:00Z"), {
        outcome: "refused",
      }),
      usage(pA, "att-succeeded", at("2026-08-03T11:00:00Z")),
    ]);

    await runBackfill();

    const rows = await claims(pA);
    expect(rows).toHaveLength(1);
    expect(rows[0].attemptId).toBe("att-refused");
  });

  it("ONE CLAIM PER PURPOSE, not one per profile", async () => {
    await harness.db.insert(modelUsage).values([
      usage(pA, "att-onboarding", at("2026-08-04T10:00:00Z")),
      usage(pA, "att-generation", at("2026-08-04T11:00:00Z"), {
        purpose: "generation",
      }),
    ]);

    await runBackfill();

    expect((await claims(pA)).map((r) => [r.purpose, r.attemptId])).toEqual([
      ["generation", "att-generation"],
      ["onboarding_brain", "att-onboarding"],
    ]);
  });

  it("a SAME-INSTANT tie is broken by attempt_id, deterministically", async () => {
    // `created_at` is `clock_timestamp()` per row and two rows CAN share one.
    // The old rule broke that tie on `attempt_id`; the backfill keeps the same
    // tie-break, so a database that has such a pair migrates to the same answer
    // it was already being priced against.
    const same = at("2026-08-05T10:00:00Z");
    await harness.db
      .insert(modelUsage)
      .values([usage(pA, "att-zzz", same), usage(pA, "att-aaa", same)]);

    await runBackfill();

    expect((await claims(pA))[0].attemptId).toBe("att-aaa");
  });

  it("RE-RUNNING IT CHANGES NOTHING — the deploy window is closable", async () => {
    // The window this covers is real: between the migration and the deploy of
    // the code that writes claims, the OLD code can still record a profile's
    // first billable attempt with no claim. Re-running the statement closes it
    // — and must not move a claim already made, or a creator who spent their
    // build in the window would have somebody else's attempt take it.
    await harness.db
      .insert(modelUsage)
      .values([usage(pA, "att-original", at("2026-08-06T10:00:00Z"))]);
    await runBackfill();
    const before = await claims(pA);
    expect(before).toHaveLength(1);

    // A LATER attempt arrives, and the backfill runs again.
    await harness.db
      .insert(modelUsage)
      .values([usage(pA, "att-later", at("2026-08-06T12:00:00Z"))]);
    await runBackfill();

    const after = await claims(pA);
    expect(after).toHaveLength(1);
    expect(after[0].attemptId).toBe("att-original");
    expect(after[0].id).toBe(before[0].id);

    // ...and an EARLIER row arriving late does not move it either. The claim is
    // decided once; nothing re-opens it.
    await harness.db
      .insert(modelUsage)
      .values([usage(pA, "att-earlier", at("2026-08-06T08:00:00Z"))]);
    await runBackfill();
    expect((await claims(pA))[0].attemptId).toBe("att-original");
  });
});
