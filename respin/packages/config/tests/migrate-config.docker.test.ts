// The CAS case PGlite CANNOT express, on real Postgres with TWO connections.
//
// The billing gate found that `applyConfigMigration`'s "compare-and-set" was
// not one: `config_versions.version` is `generatedAlwaysAsIdentity()`, so two
// concurrent appends never conflict, and a bare re-read of `max(version)`
// cannot see an append that has INSERTED but not COMMITTED. The in-process
// suite could not catch it because PGlite is single-connection, so its "race"
// case awaited the concurrent append to completion — testing only the
// already-committed interleaving, which was never the dangerous one.
//
// This suite opens a SECOND connection, leaves an append uncommitted, and
// checks that the migration blocks on the advisory lock rather than sailing
// past it. Without the lock the migration reads the stale max, appends a HIGHER
// identity value, and the operator's edit is silently superseded.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc } from "drizzle-orm";
import {
  createDockerTestDb,
  schema,
  seedAuthUser,
  seedDb,
  CONFIG_V1_SEED,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "../src/index";
import { migrateConfigDefaults } from "../src/migrate-config";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[migrate-config.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that migrate-config's compare-and-set holds " +
      "against an /admin/config append that is INSERTED BUT NOT COMMITTED. " +
      "That is the only interleaving that loses an operator edit, and PGlite " +
      "cannot express it (single connection). Start the docker-compose DB and " +
      "set TEST_DATABASE_URL to " +
      "postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const PRE_CHANGE = (() => {
  const rest: Record<string, unknown> = {
    ...(CONFIG_V1_SEED as Record<string, unknown>),
  };
  delete rest.profileCaps;
  return rest;
})();

describe.skipIf(!MAINTENANCE_URL)("migrate-config CAS on real Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_cfg"
    );
    await seedAuthUser(harness.db, "cfg_docker", "cfg_docker@test.dev");
    await seedDb(harness.db);
    await harness.db
      .update(schema.configVersions)
      .set({ content: PRE_CHANGE });
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it(
    "an UNCOMMITTED concurrent append is not sailed past — the operator edit survives",
    { timeout: 60_000 },
    async () => {
      const { db, pool } = harness;
      const before = await db
        .select()
        .from(schema.configVersions)
        .orderBy(desc(schema.configVersions.version));

      // CONNECTION A: an operator saving at /admin/config. Inserted, NOT yet
      // committed — the window a re-read of max(version) is blind to.
      const a = await pool.connect();
      await a.query("BEGIN");
      await a.query("SELECT pg_advisory_xact_lock($1)", ["8140251907463120"]);
      const edited = { ...PRE_CHANGE, graceDays: 21 };
      await a.query(
        "INSERT INTO config_versions (content, created_by) VALUES ($1, $2)",
        [JSON.stringify(edited), "operator"]
      );

      // CONNECTION B: the deploy running migrate-config. It must NOT complete
      // while A is open — it has to wait for the lock.
      let settled = false;
      const migration = migrateConfigDefaults(db).then(
        (r) => {
          settled = true;
          return { ok: true as const, r };
        },
        (e: Error) => {
          settled = true;
          return { ok: false as const, e };
        }
      );
      await new Promise((r) => setTimeout(r, 750));
      expect(
        settled,
        "migrate-config completed while an uncommitted append was open — the CAS is not serialising, and the operator edit is about to be superseded"
      ).toBe(false);

      await a.query("COMMIT");
      a.release();
      const outcome = await migration;

      // Whichever way it resolves, the OPERATOR EDIT MUST SURVIVE. That is the
      // property; the error class is the mechanism.
      const active = await getActiveConfig(db);
      expect(
        active.content.graceDays,
        "the concurrent operator edit was reverted"
      ).toBe(21);
      expect(active.content.profileCaps).toBeDefined();

      const after = await db
        .select()
        .from(schema.configVersions)
        .orderBy(desc(schema.configVersions.version));
      // A appended one row. B either refused (1 new row total) or appended on
      // top of A's committed state (2). Never: B appended on top of the STALE
      // state, which is what would have lost graceDays.
      expect(after.length - before.length).toBeGreaterThanOrEqual(1);
      expect(after.length - before.length).toBeLessThanOrEqual(2);
      expect(typeof outcome.ok).toBe("boolean");
    }
  );

  it(
    "the ADMIN-APPEND side of the lock is load-bearing too — appendConfigVersion's own takeConfigLock call, not just applyConfigMigration's",
    { timeout: 60_000 },
    async () => {
      // The case above proves applyConfigMigration's half: it opens the
      // uncommitted transaction ITSELF via raw SQL, so it cannot detect a
      // removal of appendConfigVersion's OWN `takeConfigLock` call (billing
      // gate 2026-08-23, round 2 of the re-gate — mutation-tested: deleting
      // that line left every existing test green). This case runs the REAL
      // appendConfigVersion as connection A, with its commit deliberately
      // delayed by wrapping only `.transaction` — the one method
      // appendConfigVersion calls on `db` — so the lock/insert happen inside
      // the genuine function body and the transaction only stays open because
      // we hold the callback's return.
      const { db } = harness;
      const before = await db
        .select()
        .from(schema.configVersions)
        .orderBy(desc(schema.configVersions.version));

      const delayedDb = {
        transaction: (cb: Parameters<typeof db.transaction>[0]) =>
          db.transaction(async (tx) => {
            const result = await cb(tx);
            await new Promise((r) => setTimeout(r, 750));
            return result;
          }),
      } as unknown as Parameters<typeof appendConfigVersion>[0];

      const editedByAppend = { ...PRE_CHANGE, graceDays: 33 };
      const appendResult = appendConfigVersion(
        delayedDb,
        editedByAppend as never,
        "operator-append"
      );

      let settled = false;
      const migration = migrateConfigDefaults(db).then(
        (r) => {
          settled = true;
          return { ok: true as const, r };
        },
        (e: Error) => {
          settled = true;
          return { ok: false as const, e };
        }
      );

      await new Promise((r) => setTimeout(r, 300));
      expect(
        settled,
        "migrate-config completed while appendConfigVersion's own transaction was still open — that call site's takeConfigLock is not serialising against the migration"
      ).toBe(false);

      await appendResult;
      const outcome = await migration;

      const active = await getActiveConfig(db);
      expect(
        active.content.graceDays,
        "the concurrent operator edit made via appendConfigVersion was reverted"
      ).toBe(33);
      expect(active.content.profileCaps).toBeDefined();

      const after = await db
        .select()
        .from(schema.configVersions)
        .orderBy(desc(schema.configVersions.version));
      expect(after.length - before.length).toBeGreaterThanOrEqual(1);
      expect(after.length - before.length).toBeLessThanOrEqual(2);
      expect(typeof outcome.ok).toBe("boolean");
    }
  );
});
