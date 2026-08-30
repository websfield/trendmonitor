// P9 — the creator-data registry is COMPLETE against the migration that
// created the tables, not against anyone's memory.
//
// THE PREDICATE IS "every table created in migration 0011", and the choice of
// predicate is the finding. An FK-based one ("every table with a foreign key
// to creator_profiles") yields FIVE and silently excludes
// `workspace_spend_monthly` — the one table created this round that
// deliberately has no FK, deliberately outlives workspace deletion, and would
// therefore have shipped a per-workspace spend series with no retention
// decision and no reviewer. The table hardest to notice is the one that most
// needed the entry.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATOR_DATA_REGISTRY,
  creatorDataEntry,
  NOT_CREATOR_DATA,
} from "../packages/db/src/creator-data-registry";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "packages/db/migrations");

/**
 * Every table ANY migration creates.
 *
 * The predicate used to read the `0011_` prefix alone. Migrations are
 * append-only NEW files, so that guarded a file nobody will edit again: a
 * creator-data table added in `0012_*` would never have entered the check, and
 * the suite would have passed with no export decision and no deletion decision
 * (tenancy gate 2026-08-23). The header claimed "red when a seventh table is
 * added without an entry"; it was red only for a seventh table added to a
 * frozen file.
 */
function tablesInAllMigrations(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([a-z_]+)"/gi)) {
      found.add(m[1]);
    }
  }
  return [...found].sort();
}

/** Table names CREATE TABLEd by the M2a migration specifically. */
/** Table names CREATE TABLEd by the M2a migration. */
function tablesCreatedIn(prefix: string): string[] {
  const file = readdirSync(MIGRATIONS).find(
    (f) => f.startsWith(prefix) && f.endsWith(".sql")
  );
  if (!file) throw new Error("no migration found for prefix " + prefix);
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  return [...sql.matchAll(/CREATE TABLE\s+"([a-z_]+)"/gi)].map((m) => m[1]).sort();
}

describe("P9 — the creator-data registry covers every table M2a created", () => {
  const created = tablesCreatedIn("0011_");

  it("the fixture is real: migration 0011 creates the six M2a tables", () => {
    expect(created).toEqual([
      "brain_docs",
      "creator_profiles",
      "frameworks",
      "model_usage",
      "onboarding_inputs",
      "workspace_spend_monthly",
    ]);
  });

  it("every created table has an entry — a seventh without one is RED", () => {
    const missing = created.filter((t) => !creatorDataEntry(t));
    expect(
      missing,
      "a table created by M2a with no export/deletion decision: add it to CREATOR_DATA_REGISTRY"
    ).toEqual([]);
    // ...and no stale entries naming a table that does not exist.
    //
    // AGAINST `tablesInAllMigrations()`, NOT `created` (0011-only) — slice 3b
    // is the case this comment already promised and the check did not yet
    // make true: it added two MORE creator-data tables in a LATER migration
    // (`onboarding_interview_drafts`, `brain_activation_snapshots`), each
    // registered because it holds or points at real creator content. Checking
    // against the 0011-only list would call those "stale" for the same reason
    // the file's own header names for the sibling predicate one describe block
    // down — "a table added in `0012_*` would never have entered the check".
    // A registry entry is stale when it names a table NO migration creates,
    // not when it names a table 0011 in particular does not.
    const stale = CREATOR_DATA_REGISTRY.map((e) => e.table).filter(
      (t) => !tablesInAllMigrations().includes(t)
    );
    expect(stale).toEqual([]);
  });

  it("every entry carries an export decision, a deletion decision, and a real reason", () => {
    for (const entry of CREATOR_DATA_REGISTRY) {
      expect(typeof entry.export.included, entry.table).toBe("boolean");
      // A reason short enough to be a placeholder is not a decision. The floor
      // is deliberately high: these are the two rights REQ-A04 grants, and a
      // one-word reason is how "we decided" becomes "we assumed".
      expect(
        entry.export.reason.length,
        entry.table + ": export reason is too short to be a decision"
      ).toBeGreaterThan(40);
      expect(
        ["cascade", "retained", "pseudonymised"].includes(
          entry.deletion.behaviour
        ),
        entry.table
      ).toBe(true);
      expect(
        entry.deletion.reason.length,
        entry.table + ": deletion reason is too short to be a decision"
      ).toBeGreaterThan(40);
    }
  });

  it("workspace_spend_monthly states its retention BASIS and its pseudonymisation answer", () => {
    // The plan requires this row specifically to answer two questions rather
    // than one, because "retained" without a basis is just "we kept it", and a
    // retained row keyed by a resolvable workspace id after a deletion request
    // is the exact shape REQ-A04 is about.
    const entry = creatorDataEntry("workspace_spend_monthly");
    expect(entry).toBeDefined();
    expect(entry!.deletion.behaviour).toBe("retained");
    expect(
      /financial records/i.test(entry!.deletion.reason),
      "the retention BASIS must be named, not implied"
    ).toBe(true);
    expect(
      /pseudonymis/i.test(entry!.deletion.reason),
      "the decision must answer whether workspace_id is pseudonymised at deletion"
    ).toBe(true);
  });

  it("the tables holding creator CONTENT are all exported", () => {
    // Non-vacuity in the direction that matters: an export that included
    // nothing would satisfy every assertion above.
    const content = CREATOR_DATA_REGISTRY.filter((e) => e.holdsCreatorContent);
    expect(content.length).toBeGreaterThanOrEqual(4);
    for (const entry of content) {
      expect(
        entry.export.included,
        entry.table + " holds creator content but is excluded from the export"
      ).toBe(true);
    }
  });

  it("the exporter walks this registry instead of maintaining a second export list", () => {
    const source = readFileSync(join(ROOT, "packages/db/src/export.ts"), "utf8");
    expect(source).toContain("for (const entry of CREATOR_DATA_REGISTRY)");
    expect(source).toContain("if (!entry.export.included) continue");
    expect(source).toContain("tables[entry.table] = await reader()");
    expect(source).toContain("registry: CREATOR_DATA_REGISTRY.map");
  });
});

describe("P9 (the predicate): EVERY table any migration creates has an answer", () => {
  const all = tablesInAllMigrations();

  it("the fixture is real: it sees tables from migrations other than 0011", () => {
    expect(all.length).toBeGreaterThan(10);
    expect(all).toContain("credit_ledger"); // M1
    expect(all).toContain("rate_limit"); // the audit's auth work
    expect(all).toContain("brain_docs"); // M2a
  });

  it("every table is EITHER registered creator data OR explicitly not, with a reason", () => {
    const unanswered = all.filter(
      (t) => !creatorDataEntry(t) && !(t in NOT_CREATOR_DATA)
    );
    expect(
      unanswered,
      "a table exists with no export decision, no deletion decision, and no reason it needs neither — add it to CREATOR_DATA_REGISTRY or to NOT_CREATOR_DATA"
    ).toEqual([]);
  });

  it("nothing is in both, and no entry names a table that does not exist", () => {
    const both = all.filter((t) => creatorDataEntry(t) && t in NOT_CREATOR_DATA);
    expect(both, "a table cannot be creator data AND not creator data").toEqual([]);
    const ghosts = [
      ...CREATOR_DATA_REGISTRY.map((e) => e.table),
      ...Object.keys(NOT_CREATOR_DATA),
    ].filter((t) => !all.includes(t));
    expect(ghosts, "delete these stale entries").toEqual([]);
  });

  it("every NOT_CREATOR_DATA reason is a reason, not a placeholder", () => {
    for (const [table, reason] of Object.entries(NOT_CREATOR_DATA)) {
      expect(reason.length, table).toBeGreaterThan(20);
    }
  });

  it("NON-VACUITY: a table in a LATER migration with no entry is caught", () => {
    // The exact case the prefix predicate could not see. Simulated over the
    // real function's own logic rather than by writing a migration file.
    const pretend = [...all, "results_2027"];
    const unanswered = pretend.filter(
      (t) => !creatorDataEntry(t) && !(t in NOT_CREATOR_DATA)
    );
    expect(unanswered).toEqual(["results_2027"]);
  });
});
