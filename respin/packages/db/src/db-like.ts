import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Driver-agnostic database type: satisfied by the pg-pool db and the PGlite test db alike. */
export type DbLike = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The transaction context DbLike hands to callbacks. */
export type TxLike = Parameters<Parameters<DbLike["transaction"]>[0]>[0];
