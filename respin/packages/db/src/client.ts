import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Connection factory — no module-level singleton reading env at import time
 * (testability; the caller decides where the connection string comes from).
 * Throws a named, actionable error at CALL time when the string is absent.
 */
export function createDb(connectionString: string | undefined) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. createDb requires a Postgres connection string — see respin/env.example for where to get one."
    );
  }
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
