// TRUE-interleaving concurrency suite on real Postgres (M1 phase 1 task 6).
// Retires the PGlite-single-session SHORTCUT: N genuinely parallel
// ensureUserWorkspace calls over separate pool connections must converge on
// exactly one workspace. TEST_DATABASE_URL names the maintenance db (the
// docker-compose `respin` database); the harness creates/resets `respin_test`.
//
// Without TEST_DATABASE_URL this suite SKIPS LOUDLY (AC-9): the skip message
// names exactly what was not proven. CI always provides a service container,
// so the skip never happens there.
import { count } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { memberships, users, workspaces } from "../src/schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[concurrency.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: true-interleaving bootstrap concurrency on real Postgres " +
      "(the M1-entry obligation). Start the docker-compose DB and set TEST_DATABASE_URL " +
      "to the maintenance database (postgres://respin:respin_local_dev@localhost:5435/respin)."
  );
}

describe.skipIf(!MAINTENANCE_URL)(
  "ensureUserWorkspace under REAL concurrency (Docker Postgres)",
  () => {
    let harness: Awaited<ReturnType<typeof createDockerTestDb>>;

    beforeAll(async () => {
      harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_db");
    }, 60_000);

    afterAll(async () => {
      await harness?.pool.end();
    });

    it(
      "N=8 genuinely parallel first-login bootstraps yield exactly one user/workspace/membership",
      { timeout: 60_000 },
      async () => {
        const { db } = harness;
        await seedAuthUser(db, "race_user", "race_user@test.dev");

        const results = await Promise.allSettled(
          Array.from({ length: 8 }, () =>
            ensureUserWorkspace(db, { authUserId: "race_user", name: "Race" })
          )
        );

        // The resolve-existing conflict branch means EVERY caller succeeds —
        // losers resolve the winner's row; a rejection here is a real defect.
        const fulfilled = results.filter(
          (r): r is PromiseFulfilledResult<
            Awaited<ReturnType<typeof ensureUserWorkspace>>
          > => r.status === "fulfilled"
        );
        expect(fulfilled).toHaveLength(8);
        const workspaceIds = new Set(
          fulfilled.map((r) => r.value.workspace.id)
        );
        expect(workspaceIds.size).toBe(1);

        const [u] = await db.select({ n: count() }).from(users);
        const [w] = await db.select({ n: count() }).from(workspaces);
        const [m] = await db.select({ n: count() }).from(memberships);
        expect({ users: u.n, workspaces: w.n, memberships: m.n }).toEqual({
          users: 1,
          workspaces: 1,
          memberships: 1,
        });
      }
    );
  }
);
