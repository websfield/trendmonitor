// R-94's exactly-one curation handoff on REAL Postgres.
//
// PGlite has one connection, so its replay test is sequential. This suite
// starts six independent transactions for one canonical mechanism. Removing
// the shared fingerprint advisory lock makes at least one transaction lose to
// the unique index instead of reusing the winner, which is observably not the
// resumable all-success contract R-94 requires.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { frameworks } from "../src/brain-schema";
import { resolveAutopsyFramework } from "../src/frameworks";
import { createDockerTestDb } from "../src/testing";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[frameworks-concurrency.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: concurrent unmatched autopsies create or reuse exactly one proposed-only framework row."
  );
}

describe.skipIf(!MAINTENANCE_URL)("R-94 framework handoff on real Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_frameworkhandoff"
    );
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it("six concurrent unmatched autopsies all resolve to one proposed row", async () => {
    const analysis = {
      hookMechanic: "Open on the cost before naming the choice",
      beats: ["Show the cost", "Name the choice"],
      ending: "Return to the cost with the choice visible",
      followTrigger: "Ask which cost should be inspected next",
    } as const;

    const resolved = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        harness.db.transaction((tx) =>
          resolveAutopsyFramework(tx, {
            trendItemId: `00000000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
            analysis,
            rights: {
              basis: "independently_licensed",
              evidenceId: "test-license:framework-concurrency",
            },
          })
        )
      )
    );

    expect(new Set(resolved.map((result) => result.framework.id))).toHaveLength(1);
    expect(resolved.filter((result) => result.created)).toHaveLength(1);
    expect(resolved.every((result) => result.kind === "proposed")).toBe(true);
    const slug = resolved[0].framework.slug;
    const rows = await harness.db
      .select()
      .from(frameworks)
      .where(eq(frameworks.slug, slug));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ curatorStatus: "proposed", version: 1 });
  });
});
