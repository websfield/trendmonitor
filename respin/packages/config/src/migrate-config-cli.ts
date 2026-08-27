// Runnable entrypoint: `pnpm -C respin config:migrate`.
//
// DEPLOY ORDER, and it is not advisory (plan A-9): deploy the CODE first, then
// run this. `respinConfigV1` is `.strict()`, so a stored document carrying a
// key older code does not know is a PARSE FAILURE — and that parse happens
// five times inside the Stripe webhook's single transaction. Migrating first,
// or rolling back after, would roll back `stripe_events` and make Stripe retry
// forever while grants stop landing.
//
// Programmatic, like `db:migrate`, and for the same reason recorded in the M2a
// ledger: drizzle-kit's spinner swallowed the underlying database error and
// printed nothing but "applying migrations...", which made a failure invisible
// exactly when something was wrong.
import { createDb } from "@respin/db";
import { migrateConfigDefaults } from "./migrate-config";

function formatErrorChain(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    parts.push(current.stack ?? current.name + ": " + current.message);
    current = (current as Error & { cause?: unknown }).cause;
  }
  if (current !== undefined && !(current instanceof Error)) {
    parts.push(String(current));
  }
  return parts.join("\ncaused by: ");
}

/**
 * Close the pool explicitly, like `db:migrate` does.
 *
 * `createDb` opens a pg Pool, and a Pool with an idle client keeps the event
 * loop alive for its 10s idle timeout. Without this the CLI lingers after
 * printing its result, and a deploy script cannot tell "finished" from "hung"
 * (billing gate 2026-08-23; `packages/db/src/migrate-cli.ts:52` already does it).
 */
async function closePool(db: ReturnType<typeof createDb>): Promise<void> {
  const pool = (db as unknown as { $client?: { end?: () => Promise<void> } })
    .$client;
  await pool?.end?.();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "config:migrate: DATABASE_URL is not set. See respin/env.example."
    );
    process.exit(1);
  }
  const db = createDb(url);
  try {
    await run(db);
  } finally {
    await closePool(db);
  }
}

async function run(db: ReturnType<typeof createDb>) {
  const result = await migrateConfigDefaults(db);
  if (result.status === "noop") {
    console.log(
      "config:migrate: nothing to do — the active config (version " +
        result.version +
        ") already carries every key this build defines."
    );
    return;
  }
  console.log(
    "config:migrate: appended version " +
      result.toVersion +
      " from version " +
      result.fromVersion +
      ", adding: " +
      result.addedKeys.join(", ") +
      ". Every existing value was carried through unchanged, and no earlier row was modified."
  );
}

main().catch((error) => {
  console.error("config:migrate FAILED — nothing was written.");
  console.error(formatErrorChain(error));
  process.exit(1);
});
