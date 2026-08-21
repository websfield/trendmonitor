// Runnable migration entrypoint: `pnpm -C respin db:migrate` (via tsx).
//
// drizzle-kit wraps the same ORM migrator in a spinner whose rejected-task
// handler exits without printing the caught error. Keep the migration path
// programmatic so database failures reach the operator and CI.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations"
);

function formatErrorChain(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    parts.push(current.stack ?? `${current.name}: ${current.message}`);
    current = (current as Error & { cause?: unknown }).cause;
  }

  if (current !== undefined) {
    parts.push(String(current));
  }

  return parts.join("\nCaused by: ");
}

let pool: pg.Pool | undefined;

try {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("db:migrate requires DATABASE_URL to be set.");
  }

  pool = new pg.Pool({ connectionString, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("migrations applied successfully");
} catch (error) {
  console.error("db:migrate failed:");
  console.error(formatErrorChain(error));
  process.exitCode = 1;
} finally {
  await pool?.end();
}
