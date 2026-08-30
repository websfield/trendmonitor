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
  const addedKeys: string[] = [];
  const merged = mergeMissing(raw, parsed.data as Record<string, unknown>, "", addedKeys);
  // ...THEN the corrections, which are a DIFFERENT operation and deliberately
  // so. See `CORRECTIONS` for why adding-only was not enough.
  const raised = applyCorrections(merged, addedKeys, row.createdBy);
  if (addedKeys.length === 0) return null;
  return {
    sourceVersion: row.version,
    addedKeys,
    merged: raised as RespinConfigV1,
  };
}

/**
 * Values this product SHIPPED WRONG, and may correct in place — once, and only
 * from the exact wrong value.
 *
 * WHY THIS EXISTS AT ALL, given `mergeMissing` refuses to touch a present key.
 * That refusal is right and is not being weakened: a schema default must never
 * overwrite a number an operator chose. But it left slice 3 undeployable
 * (billing gate BLOCK, 2026-08-29). `llm.maxOutputTokens` was shipped at 1024,
 * sized for a one-sentence connectivity ping; a voice document needs ~1,200
 * output tokens, so on EVERY database seeded before slice 3 the value is
 * present, wrong, and unreachable — and every voice inference truncates, is
 * billed, and refuses. Raising the schema default fixes fresh installs only.
 *
 * THE INVARIANT THAT MAKES THIS SAFE IS PROVENANCE, NOT VALUE (billing gate
 * round 2, 2026-08-29). The first version fired whenever the stored value
 * equalled `from` — and `Object.is` distinguishes values, not authors, so an
 * operator who had deliberately CHOSEN 1024 (a defensible choice: it is the
 * number that bounds per-call output spend) would have had it silently
 * quadrupled. The docblock claimed "it can never overwrite a decision somebody
 * made", which was false for exactly that operator.
 *
 * So it fires only when BOTH hold: the stored value is the one we wrote, AND
 * the active version was written by the product itself (`created_by` is `seed`
 * or `migrate-config`). A document an operator has touched is never corrected —
 * `/admin/config` stamps their id, and `config_versions.created_by` is the
 * record of who decided.
 *
 * A correction is a ONE-OFF with an expiry: once no database can still hold the
 * `from` value, the entry is deleted. Entries are not a growing list of dials.
 */
const CORRECTIONS: {
  path: readonly string[];
  from: unknown;
  to: unknown;
  why: string;
}[] = [
  {
    path: ["llm", "maxOutputTokens"],
    from: 1024,
    to: 4000,
    why: "1024 was sized for slice 2a's one-sentence ping; a voice document needs ~1,200 output tokens, so every voice inference truncated, was billed, and refused (browser walk + billing gate, 2026-08-29)",
  },
];

/**
 * Apply every correction whose `from` still matches, recording each as a
 * dotted path so the CLI prints what it changed.
 */
const PRODUCT_AUTHORS = new Set(["seed", "migrate-config"]);

function applyCorrections(
  doc: Record<string, unknown>,
  changed: string[],
  createdBy: string
): Record<string, unknown> {
  // PROVENANCE FIRST. An operator-authored document is never corrected, whatever
  // it holds — see `CORRECTIONS`.
  if (!PRODUCT_AUTHORS.has(createdBy)) return doc;
  let out = doc;
  for (const c of CORRECTIONS) {
    const parent = c.path.slice(0, -1);
    const key = c.path[c.path.length - 1];
    let node: unknown = out;
    for (const p of parent) {
      node = isPlainObject(node) ? node[p] : undefined;
    }
    if (!isPlainObject(node)) continue;
    // EXACTLY the wrong value, or nothing happens. `Object.is` rather than
    // `===` so a stored `-0` or `NaN` cannot masquerade as a match.
    if (!Object.is(node[key], c.from)) continue;
    // Rebuilt rather than mutated: `raw` is the operator's stored document and
    // every other key must come through it byte-identically.
    const rebuild = (
      obj: Record<string, unknown>,
      rest: readonly string[]
    ): Record<string, unknown> => {
      if (rest.length === 0) return { ...obj, [key]: c.to };
      const [head, ...tail] = rest;
      const child = obj[head];
      return {
        ...obj,
        [head]: rebuild(isPlainObject(child) ? child : {}, tail),
      };
    };
    out = rebuild(out, parent);
    changed.push(`${c.path.join(".")} (corrected ${String(c.from)} → ${String(c.to)})`);
  }
  return out;
}

/** A JSON object, as opposed to an array, a null, or a scalar. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * THE MERGE RECURSES, and slice 2a is why.
 *
 * Until now this walked TOP-LEVEL keys only, which was correct for every key
 * that had ever been added: `profileCaps` is a top-level object, so its whole
 * subtree arrived at once. `creditCosts.onboardingBrainRebuild` is the first
 * NESTED addition, and top-level-only would have skipped it silently —
 * `creditCosts` is already present in the stored document, so the whole object
 * is carried through from `raw` exactly as it is, minus the new key.
 *
 * That is not a cosmetic gap. R19's `getActiveConfigRequiringStored` fails
 * CLOSED on the raw stored document, so a key `config:migrate` can never add is
 * a key that is never stored, and the operation it prices is refused forever on
 * every database that existed before the deploy. "Record the limitation" was
 * the alternative the scope note offered; it is not available, because the
 * limitation is an outage.
 *
 * THE INVARIANT IS UNCHANGED AND IS WHAT THE RECURSION MUST NOT BREAK: a key
 * the stored document already has is carried through from `raw`, at every
 * depth, and is never read from `parsed.data`. Only ABSENT keys are taken from
 * the parsed (defaulted) document. `z.record` maps — `stripePriceMap`,
 * `llm.prices` — are unaffected by construction: a record has no schema
 * defaults, so `parsed.data` holds exactly the keys `raw` does and the loop
 * adds nothing.
 *
 * `addedKeys` are DOTTED PATHS now (`creditCosts.onboardingBrainRebuild`), not
 * bare names — the CLI prints them and an operator reading `onboardingBrainRebuild`
 * with no parent would have to guess where it landed.
 */
function mergeMissing(
  raw: Record<string, unknown>,
  parsed: Record<string, unknown>,
  prefix: string,
  added: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const [key, parsedValue] of Object.entries(parsed)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (!(key in raw)) {
      out[key] = parsedValue;
      added.push(path);
      continue;
    }
    const rawValue = raw[key];
    if (isPlainObject(rawValue) && isPlainObject(parsedValue)) {
      out[key] = mergeMissing(rawValue, parsedValue, path, added);
    }
    // Otherwise the stored value stands, byte-identically. No else branch, on
    // purpose: writing one is how a default overwrites a customised value.
  }
  return out;
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
