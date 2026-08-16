// Hermetic test database: in-process PGlite with the COMMITTED migrations
// applied (R-17). Tests exercise real SQL, not mocks. PGlite is single-session —
// concurrency tests here are serialized approximations (see phase-3 AC-2).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations"
);

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * Real-Postgres concurrency harness (M1 phase 1, retiring the PGlite-only
 * SHORTCUT). TEST_DATABASE_URL names the MAINTENANCE db (the docker-compose
 * `respin` database); the harness creates the named test database if absent,
 * reconnects there, **drops schema public**, and migrates.
 *
 * THE NAME IS THE GUARD (billing round-7 CHANGE / tenancy round-7 CHANGE).
 * Round 6 replaced the old comparison against a fixed literal with one against
 * the caller-supplied `dbName` — but the connection URL is BUILT from that same
 * `dbName`, so the check compared a value with itself and could essentially
 * never fail: `createDockerTestDb(url, "respin")` passed it and would have run
 * `DROP SCHEMA public CASCADE` on the live dev database (credit_ledger,
 * subscriptions, workspaces, the Better Auth tables and the migration state the
 * Phase-4 `stripe listen` evidence run depends on). The reviewer proved that
 * read-only against the live container. So the refusal is now on the NAME,
 * BEFORE any connection is opened, and it is a whitelist: only
 * `respin_test[_suffix]` may ever be reset.
 */
//
// The SUFFIX is required (tenancy round-10 NOTE): bare `respin_test` is the
// exact shared name whose reuse produced round 6's phantom B1/B3 symptom, and
// it is still live on the dev Postgres. Requiring `respin_test_<suite>` makes
// per-suite naming STRUCTURAL rather than conventional — a new Docker suite
// cannot rejoin the shared database even by typing its old name.
export const DOCKER_TEST_DB_NAME_PATTERN = /^respin_test_[a-z0-9]+$/;

/**
 * Each suite must pass its OWN database name — there is no default (billing +
 * tenancy round-6 CHANGE, reproduced independently by both; the default that
 * survived round 6 is billing round-7 CHANGE 6b). Every caller used to share
 * `respin_test`, and each one starts by dropping schema public — but vitest
 * runs test FILES in parallel, and CI sets TEST_DATABASE_URL at job scope, so
 * the ledger race suite was being reset mid-run by its neighbour. The visible
 * symptom was "11 of 20 concurrent debits of 10 succeeded against a 100
 * balance" — indistinguishable in the log from a real over-consumption of the
 * B1/B3 money invariant, intermittently, in the ONE suite whose whole job is
 * proving that invariant on real Postgres. A suite's own database cannot be
 * corrupted by a sibling — but only if it actually names one, which a default
 * argument quietly made optional again.
 */
export async function createDockerTestDb(maintenanceUrl: string, dbName: string) {
  // BEFORE connecting: an unrecognised name is refused outright. Everything
  // below this line is destructive, and `dbName` is also interpolated into
  // `CREATE DATABASE` — the pattern is what keeps that interpolation safe too.
  if (!DOCKER_TEST_DB_NAME_PATTERN.test(dbName)) {
    throw new Error(
      `createDockerTestDb: refusing to reset "${dbName}" — this harness DROPS SCHEMA public, so it only ever operates on a database matching ${DOCKER_TEST_DB_NAME_PATTERN} (e.g. respin_test_credits). Give your suite its own name; never point it at a dev or production database.`
    );
  }
  const { default: pg } = await import("pg");
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  const { migrate: migratePg } = await import(
    "drizzle-orm/node-postgres/migrator"
  );

  const maint = new pg.Client({ connectionString: maintenanceUrl });
  await maint.connect();
  try {
    const exists = await maint.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );
    if (exists.rowCount === 0) {
      // CREATE DATABASE has no IF NOT EXISTS; checked above.
      await maint.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await maint.end();
  }

  const testUrl = new URL(maintenanceUrl);
  testUrl.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: testUrl.toString(), max: 20 });

  // Second line of defence — NOT the guard. The URL above is built from
  // `dbName`, so this comparison is expected to pass always; it stays only as a
  // "landed where we said" assertion in case a maintenance URL ever carries
  // connection parameters that redirect the session. The guard that can
  // actually refuse is the name pattern at the top of this function, which runs
  // before any connection exists.
  const { rows } = await pool.query("SELECT current_database() AS db");
  if (rows[0].db !== dbName) {
    await pool.end();
    throw new Error(
      `createDockerTestDb: asked for "${dbName}" but the connection landed on "${rows[0].db}" — refusing to drop schema public on a database this harness did not name`
    );
  }
  // Drop BOTH public and drizzle's own migration-journal schema — leaving the
  // journal behind makes a re-run skip migrations against an empty public.
  await pool.query(
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;"
  );

  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder });
  return { db, pool };
}

/**
 * Seed a Better Auth `user` row so domain `users` inserts satisfy the
 * users.auth_user_id FK (D-M1-5). In production the auth row always exists
 * before bootstrap runs (a session is required); tests must create it first.
 */
export async function seedAuthUser(
  db: TestDb | Awaited<ReturnType<typeof createDockerTestDb>>["db"],
  authUserId: string,
  email = `${authUserId}@test.dev`
): Promise<void> {
  await db
    .insert(schema.user)
    .values({
      id: authUserId,
      name: authUserId,
      email,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}
