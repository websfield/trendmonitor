// A-9 — the config-key migration, and the three ways of getting it wrong that
// two plan-gate rounds found.
//
// THE PROBLEM. `respinConfigV1` is `.strict()`, so a STORED document carrying a
// key older code does not know is a parse failure — and `getActiveConfig` is
// called five times inside the Stripe webhook's single transaction
// (`webhooks.ts:588,786,1082,1197,1283`). A throw there rolls back
// `stripe_events`, so Stripe retries forever and grants, packs and downgrades
// stop landing.
//
// THE DEPLOY ORDER, therefore, is PINNED: deploy the CODE first (the new key
// has a `.default(...)`, so the old stored document still parses), then run
// this. A rollback in the window between them is safe for the same reason.
//
// One consequence worth stating rather than discovering: the REVERSE window —
// where a rollback would break — opens at the first `/admin/config` append
// AFTER the deploy, not at this migration, because `appendConfigVersion`
// stores the PARSED (defaulted) document.
//
// THE THREE WRONG IMPLEMENTATIONS, each found by a gate:
//   1. reading v1 instead of the max/active version — which would resurrect an
//      empty `stripePriceMap` and un-map every Stripe price;
//   2. appending `CONFIG_V1_SEED` — same effect, by a different route;
//   3. UPDATING the source row in place — which preserves every value
//      byte-identically, is a no-op on re-run, and passes every other
//      assertion, while retroactively rewriting the document that priced every
//      debit already stamped with that version.
// The suite is red against all three.
import { desc } from "drizzle-orm";
import type { DbLike, TxLike } from "@respin/db";
import { schema } from "@respin/db";
import {
  appendConfigVersion,
  ConfigUnavailableError,
  takeConfigLock,
} from "./index";
import { respinConfigV1, type RespinConfigV1 } from "./schema";

/** A source document that does not parse is never migrated over silently. */
export class ConfigMigrationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigMigrationRefused";
  }
}

/** Someone appended a version between the read and the write. */
export class ConfigMigrationRaceError extends Error {
  constructor(expected: number, found: number) {
    super(
      `migrate-config: the active config moved from version ${expected} to ${found} while this migration was preparing. NOTHING was written. Re-run it — the merge is computed from whatever is active at read time, so a second run picks up the newer document rather than overwriting it.`
    );
    this.name = "ConfigMigrationRaceError";
  }
}

export type PreparedConfigMigration = {
  /** The version this merge was computed FROM — the compare-and-set token. */
  sourceVersion: number;
  /** Keys the current schema defines that the stored document lacks. */
  addedKeys: string[];
  /** The stored document plus ONLY the added keys. */
  merged: RespinConfigV1;
};

async function activeRow(db: DbLike | TxLike) {
  const [row] = await db
    .select()
    .from(schema.configVersions)
    .orderBy(desc(schema.configVersions.version))
    .limit(1);
  return row;
}

/**
 * Read the ACTIVE (max-version) document and compute the merge.
 *
 * Exported separately from `applyConfigMigration` for one reason, stated
 * because a test seam that looks like an accident becomes one: the
 * compare-and-set can only be TESTED if a concurrent append can be interleaved
 * between the read and the write. `migrateConfigDefaults` below is the single
 * call production uses.
 */
export async function prepareConfigMigration(
  db: DbLike | TxLike
): Promise<PreparedConfigMigration | null> {
  const row = await activeRow(db);
  if (!row) {
    throw new ConfigUnavailableError(
      "migrate-config: there is no config version to migrate. Seed the database (pnpm db:seed) first."
    );
  }
  const raw = row.content as Record<string, unknown>;
  const parsed = respinConfigV1.safeParse(raw);
  if (!parsed.success) {
    // LOUDLY, and without writing: a document this code cannot parse is one it
    // cannot merge into either, and guessing would replace an operator's real
    // configuration with defaults.
    throw new ConfigMigrationRefused(
      `migrate-config: the active config (version ${row.version}) does not parse under RespinConfigV1, so it was NOT migrated and NOTHING was written. Fix it at /admin/config first. Issues: ${parsed.error.message}`
    );
  }
  // ONLY the keys the stored document is MISSING. Every key it already has is
  // carried through byte-identically from `raw` — never from `parsed.data`,
  // whose defaults would silently overwrite a customised value with the
  // schema's idea of it.
  const addedKeys = Object.keys(parsed.data).filter((k) => !(k in raw));
  if (addedKeys.length === 0) return null;
  const additions: Record<string, unknown> = {};
  for (const k of addedKeys) {
    additions[k] = (parsed.data as Record<string, unknown>)[k];
  }
  return {
    sourceVersion: row.version,
    addedKeys,
    merged: { ...raw, ...additions } as RespinConfigV1,
  };
}

/**
 * APPEND the merged document, if and only if the active version is still the
 * one the merge was computed from.
 *
 * Append, never update: `config_versions` is append-only and the version a
 * debit stamped must keep meaning what it meant. An in-place UPDATE preserves
 * every value, is a no-op on re-run, and passes every assertion except this
 * one — which is exactly why the suite plants it.
 */
export async function applyConfigMigration(
  db: DbLike,
  prepared: PreparedConfigMigration,
  createdBy = "migrate-config"
): Promise<number> {
  return db.transaction(async (tx) => {
    // THE LOCK COMES FIRST, and the re-read below is worthless without it.
    // `config_versions.version` is `generatedAlwaysAsIdentity()`
    // (`billing-schema.ts:254`), so two concurrent appends NEVER conflict —
    // there is no unique violation to catch and no existing row to lock,
    // because the contention is on a row that does not exist yet. A bare
    // re-read of `max(version)` therefore cannot see an /admin/config append
    // that has INSERTED but not COMMITTED: that append takes the lower
    // identity value, this migration takes the higher one and becomes active,
    // and the operator's edit is silently reverted — the exact outcome this
    // guard is named for, on the document holding `graceDays`, `creditCosts`,
    // `allowances` and `stripePriceMap`. Found by the billing gate 2026-08-23;
    // the first version of this test could not express it, because PGlite is
    // single-connection.
    await takeConfigLock(tx);
    const row = await activeRow(tx);
    if (!row || row.version !== prepared.sourceVersion) {
      throw new ConfigMigrationRaceError(
        prepared.sourceVersion,
        row?.version ?? -1
      );
    }
    return appendConfigVersion(tx, prepared.merged, createdBy);
  });
}

export type MigrateConfigResult =
  | { status: "noop"; version: number }
  | { status: "migrated"; fromVersion: number; toVersion: number; addedKeys: string[] };

/** The one call production uses. Idempotent: a second run is a no-op. */
export async function migrateConfigDefaults(
  db: DbLike,
  createdBy = "migrate-config"
): Promise<MigrateConfigResult> {
  const prepared = await prepareConfigMigration(db);
  if (!prepared) {
    const row = await activeRow(db);
    return { status: "noop", version: row?.version ?? 0 };
  }
  const toVersion = await applyConfigMigration(db, prepared, createdBy);
  return {
    status: "migrated",
    fromVersion: prepared.sourceVersion,
    toVersion,
    addedKeys: prepared.addedKeys,
  };
}
