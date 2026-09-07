import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDockerTestDb } from "../src/testing";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations"
);

if (!MAINTENANCE_URL) {
  console.warn(
    "[promotion-migration.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: real-Postgres 0032→0033 and fresh-install migration paths."
  );
}

function migrationsThrough0032(): string {
  const folder = mkdtempSync(join(tmpdir(), "respin-migrations-0032-"));
  const meta = join(folder, "meta");
  mkdirSync(meta);
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta", "_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 32);
  writeFileSync(join(meta, "_journal.json"), JSON.stringify(journal, null, 2));
  for (const entry of journal.entries) {
    copyFileSync(
      join(MIGRATIONS, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`)
    );
  }
  return folder;
}

describe.skipIf(!MAINTENANCE_URL)(
  "0032→0033 and fresh install on real Postgres",
  () => {
    let upgraded: Awaited<ReturnType<typeof createDockerTestDb>>;
    let fresh: Awaited<ReturnType<typeof createDockerTestDb>>;
    let through0032Folder: string | undefined;

    beforeAll(async () => {
      upgraded = await createDockerTestDb(
        MAINTENANCE_URL as string,
        "respin_test_promo32"
      );
      fresh = await createDockerTestDb(
        MAINTENANCE_URL as string,
        "respin_test_promofresh"
      );

      await upgraded.pool.query(
        "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;"
      );
      through0032Folder = migrationsThrough0032();
      await migrate(upgraded.db, { migrationsFolder: through0032Folder });
      await upgraded.pool.query(
        "INSERT INTO workspaces (id, name) VALUES ('00000000-0000-4000-8000-000000000032', '0032 fixture')"
      );
      await upgraded.pool.query(
        "INSERT INTO creator_profiles (id, workspace_id, display_name) VALUES ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000032', 'Retained profile')"
      );
    }, 120_000);

    afterAll(async () => {
      await upgraded?.pool.end();
      await fresh?.pool.end();
      if (through0032Folder) rmSync(through0032Folder, { recursive: true, force: true });
    });

    it("upgrades a populated 0032 schema by applying only additive 0033", async () => {
      const before = await upgraded.pool.query(
        "SELECT to_regclass('public.promotion_proposals') AS proposal"
      );
      expect(before.rows[0].proposal).toBeNull();

      // The production migrator wraps every pending migration statement in
      // one transaction. This exact call is the regression: applying 0033's
      // statements one-by-one in autocommit mode masks PostgreSQL's enum-value
      // visibility rule and is not evidence the CLI can upgrade an 0032 DB.
      await migrate(upgraded.db, { migrationsFolder: MIGRATIONS });

      const tables = await upgraded.pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('promotion_proposals','proposal_evidence_results','proposal_evidence_feedback') ORDER BY tablename"
      );
      expect(tables.rows.map((row) => row.tablename)).toEqual([
        "promotion_proposals",
        "proposal_evidence_feedback",
        "proposal_evidence_results",
      ]);
      const constraints = await upgraded.pool.query(
        "SELECT conname FROM pg_constraint WHERE conname IN ('brain_activation_snapshots_id_profile_workspace_uq','generation_feedback_id_profile_workspace_uq','promotion_proposals_accepted_activation_fk','proposal_evidence_feedback_feedback_fk') ORDER BY conname"
      );
      expect(constraints.rows.map((row) => row.conname)).toEqual([
        "brain_activation_snapshots_id_profile_workspace_uq",
        "generation_feedback_id_profile_workspace_uq",
        "promotion_proposals_accepted_activation_fk",
        "proposal_evidence_feedback_feedback_fk",
      ]);
      const retained = await upgraded.pool.query(
        "SELECT display_name FROM creator_profiles WHERE id = '00000000-0000-4000-8000-000000000033'"
      );
      expect(retained.rows).toEqual([{ display_name: "Retained profile" }]);
    });

    it("fresh install reaches the identical proposal enum/table surface", async () => {
      const tables = await fresh.pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'proposal_%' OR tablename = 'promotion_proposals') ORDER BY tablename"
      );
      expect(tables.rows.map((row) => row.tablename)).toEqual([
        "promotion_proposals",
        "proposal_evidence_feedback",
        "proposal_evidence_results",
      ]);
      const labels = await fresh.pool.query(
        "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'promotion_proposal_status' ORDER BY e.enumsortorder"
      );
      expect(labels.rows.map((row) => row.enumlabel)).toEqual([
        "proposed",
        "accepted",
        "rejected",
        "stale",
        "superseded",
      ]);
    });
  }
);
