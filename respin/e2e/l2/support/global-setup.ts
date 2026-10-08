// The L2 Free journey's global setup: a FRESH isolated database, migrated and
// seeded by the repo's own commands (`pnpm db:migrate`, `pnpm db:seed`, run
// with `DATABASE_URL` pointed at the isolated database), and an empty
// fake-transport call ledger. No package import of the product's database
// layer — the `e2e/**` boundary `e2e/support/db-shortcut.ts` records — and no
// env file is read: `TEST_DATABASE_URL` names the compose maintenance database.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { L2_DB_NAME } from "./isolated-db";

export const FAKE_LEDGER = "test-results/l2-llm-fake-calls.json";

export default async function globalSetup(): Promise<void> {
  const maintenance = process.env.TEST_DATABASE_URL;
  if (!maintenance) {
    throw new Error(
      "The L2 Free journey needs TEST_DATABASE_URL (the docker-compose maintenance database, e.g. postgres://respin:respin_local_dev@localhost:5435/respin). It never runs against the dev database."
    );
  }
  // DROP AND RECREATE the isolated database only — its name is a constant.
  for (const statement of [
    `DROP DATABASE IF EXISTS ${L2_DB_NAME} WITH (FORCE)`,
    `CREATE DATABASE ${L2_DB_NAME}`,
  ]) {
    execFileSync(
      "docker",
      ["exec", "respin-postgres", "psql", "-U", "respin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statement],
      { stdio: "pipe" }
    );
  }
  const url = new URL(maintenance);
  url.pathname = `/${L2_DB_NAME}`;
  const env = { ...process.env, DATABASE_URL: url.toString() };
  execFileSync("pnpm", ["db:migrate"], { env, stdio: "pipe" });
  execFileSync("pnpm", ["db:seed"], { env, stdio: "pipe" });
  mkdirSync(dirname(FAKE_LEDGER), { recursive: true });
  writeFileSync(FAKE_LEDGER, "[]");
}
