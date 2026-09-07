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
import { respinConfigV1 } from "../src/schema";
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
  delete rest.performanceLearning;
  delete rest.daysToEmpty;
  return rest;
})();

const PRE_9B_SCHEMA = respinConfigV1
  .omit({ performanceLearning: true, daysToEmpty: true })
  .strict();

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

      // SYNCHRONISATION, NOT A SLEEP. An earlier version of this case started
      // the migration and asserted "not settled after 300ms" while merely
      // HOPING appendConfigVersion had already taken its lock. Under load it
      // had not, the migration won the lock first, and the case failed with
      // nothing wrong in the product — observed 2026-08-27. A racing test that
      // never establishes its own precondition is the M4 lesson from slice 1
      // in the opposite direction: there the racers never contended, here the
      // contention never started.
      //
      // So the handoff is explicit: `lockHeld` resolves INSIDE the genuine
      // transaction, after the real function body has run `takeConfigLock` and
      // inserted, and the transaction then stays open until the test releases
      // it. No wall-clock assumption decides whether the race is set up.
      let signalLockHeld!: () => void;
      const lockHeld = new Promise<void>((r) => {
        signalLockHeld = r;
      });
      let release!: () => void;
      const released = new Promise<void>((r) => {
        release = r;
      });

      const delayedDb = {
        transaction: (cb: Parameters<typeof db.transaction>[0]) =>
          db.transaction(async (tx) => {
            const result = await cb(tx);
            signalLockHeld();
            await released;
            return result;
          }),
      } as unknown as Parameters<typeof appendConfigVersion>[0];

      const editedByAppend = { ...PRE_CHANGE, graceDays: 33 };
      const appendResult = appendConfigVersion(
        delayedDb,
        editedByAppend as never,
        "operator-append"
      );

      // The lock is genuinely held before the migration is allowed to start.
      await lockHeld;

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

      // With the lock provably held, this can only go true if the migration
      // sailed past it — which is the defect under test. A slow machine
      // delays the migration further, it never fakes a pass.
      await new Promise((r) => setTimeout(r, 300));
      expect(
        settled,
        "migrate-config completed while appendConfigVersion's own transaction was still open — that call site's takeConfigLock is not serialising against the migration"
      ).toBe(false);

      release();
      await appendResult;
      const outcome = await migration;

      // NON-VACUITY: the assertion above must be capable of going true. Once
      // the append has committed and freed the lock, the migration DOES
      // settle — so `settled === false` above was the lock blocking it, not
      // the migration having never been reachable in the first place.
      expect(
        settled,
        "the migration never settled even after the lock was released — the case above proved nothing"
      ).toBe(true);

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

  it("proves both 9b config rollback windows on real Postgres", async () => {
    const { db } = harness;
    await db.insert(schema.configVersions).values({
      content: PRE_CHANGE,
      createdBy: "pre-9b-fixture",
    });

    // Before materialisation, old strict code still parses and new code reads
    // the two defaults. This is the safe old-code rollback window.
    expect(PRE_9B_SCHEMA.safeParse(PRE_CHANGE).success).toBe(true);
    const beforeMaterialisation = await getActiveConfig(db);
    expect(beforeMaterialisation.content.performanceLearning.free).toBe(
      "view_only"
    );
    expect(beforeMaterialisation.content.daysToEmpty).toEqual({
      trailingWindowDays: 30,
      minimumDebitDays: 3,
    });

    expect((await migrateConfigDefaults(db)).status).toBe("migrated");
    const [stored] = await db
      .select()
      .from(schema.configVersions)
      .orderBy(desc(schema.configVersions.version))
      .limit(1);
    const materialised = stored.content as Record<string, unknown>;
    expect(materialised.performanceLearning).toBeDefined();
    expect(materialised.daysToEmpty).toBeDefined();

    // After materialisation, an old strict parser is intentionally unsafe;
    // the forward-compatible release remains able to read the stored row.
    expect(PRE_9B_SCHEMA.safeParse(materialised).success).toBe(false);
    await expect(getActiveConfig(db)).resolves.toMatchObject({
      content: {
        performanceLearning: { free: "view_only" },
        daysToEmpty: { trailingWindowDays: 30, minimumDebitDays: 3 },
      },
    });
  });
});
