// R-30.5 / R-54 (phase-2b card R17) — the deletion-executor tripwire.
//
// `workspace_spend_monthly` deliberately outlives a REQ-A04 workspace
// deletion (`creator-data-registry.ts`'s entry). R-54 says HOW it survives
// safely: at deletion time `workspace_id` is replaced by one fresh random id
// (`pseudonymiseWorkspaceSpend`, `packages/db/src/spend-rollup.ts`), and the
// obligation is on whoever deletes a workspace, not on this table.
//
// THE EXECUTOR THAT MUST CALL IT DOES NOT EXIST YET — slice 10b is six slices
// away. A prose obligation carried that far is exactly the CLAUDE.md
// 2026-08-21 lesson ("a guard that scans source fails OPEN when its pattern
// breaks", and a guard with no target to find is indistinguishable from one
// that works): so this scan is proven against a PLANTED deletion executor
// below, not only run (and passed vacuously) against today's real tree.
//
// THE SIGNAL: a "deletion executor" is source that deletes from `workspaces`
// — the top of every cascade in this schema (creator_profiles, and
// everything FK'd to it, cascade from there; `workspace_spend_monthly` is the
// one table that does NOT, by design). Scanning for a DELETE against
// `workspaces` is therefore the widest true signal available today, without
// guessing the executor's eventual name or shape.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "migrations", "coverage"]);

function productSources(dir: string, acc: Map<string, string> = new Map()) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let entry;
    try {
      entry = statSync(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (entry.isDirectory()) {
      if (name === "tests") continue;
      productSources(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      let src: string;
      try {
        src = readFileSync(full, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      acc.set(relative(ROOT, full).split(sep).join("/"), src);
    }
  }
  return acc;
}

function stripComments(src: string): string {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Three shapes of "deletes a workspace": `db.delete(workspaces)` (however the
 * import is named — the delete-verb call on the workspaces table object), raw
 * SQL `delete from ... workspaces`, and the generic registry-driven port's
 * `DELETE FROM ${relation(...)}` (Phase 10b-1 Task 4, lifecycle-sql-port.ts),
 * which names no table at all in source. All three are checked, the way
 * `table-writers.test.ts` checks both a query-builder call and raw SQL for
 * the same reason: a scan that knows only one shape is a scan a careless
 * change walks past.
 */
const DELETES_WORKSPACES = [
  /\.delete\s*\(\s*workspaces\s*\)/,
  /delete\s+from\s+(?:"?public"?\s*\.\s*)?"?workspaces"?\b/i,
  /delete\s+from\s+\$\{\s*relation\s*\(/i,
];

/** Does the executor also call the pseudonymisation instrument, by name? */
const CALLS_PSEUDONYMISE = /pseudonymiseWorkspaceSpend\s*\(/;

/**
 * The ALLOWED set — files that are legitimately allowed to delete a workspace
 * WITHOUT calling the instrument directly, each with why. Empty today: the one
 * deletion executor (lifecycle-sql-port.ts) calls the instrument itself. Adding an
 * entry is the reviewed decision the scan exists to force — e.g. a thin
 * caller that composes a function which itself calls the instrument one file
 * over would name that file and explain the indirection.
 */
const ALLOWED: Map<string, string> = new Map();

function findViolations(files: Map<string, string>): string[] {
  const offenders: string[] = [];
  for (const [file, raw] of files) {
    if (ALLOWED.has(file)) continue;
    const src = stripComments(raw);
    const deletesWorkspace = DELETES_WORKSPACES.some((re) => re.test(src));
    if (deletesWorkspace && !CALLS_PSEUDONYMISE.test(src)) {
      offenders.push(file);
    }
  }
  return offenders;
}

describe("R-30.5/R-54 tripwire: a workspace-deletion executor must pseudonymise workspace_spend_monthly", () => {
  it("the scan is NOT vacuous: it sees the files it is supposed to police", () => {
    const scanned = productSources(join(ROOT, "packages"));
    productSources(join(ROOT, "app"), scanned);
    productSources(join(ROOT, "lib"), scanned);
    expect(scanned.size).toBeGreaterThan(20);
  });

  it("the real deletion executor is SEEN by the scan (not vacuous) and calls the instrument", () => {
    const scanned = productSources(join(ROOT, "packages"));
    productSources(join(ROOT, "app"), scanned);
    productSources(join(ROOT, "lib"), scanned);
    // Round-1 billing NOTE: the port deletes through `relation()`, a shape the
    // first two regexes cannot see; a green here was vacuous until the third.
    const port = scanned.get("packages/db/src/lifecycle-sql-port.ts");
    expect(port, "lifecycle-sql-port.ts moved — re-point this witness").toBeDefined();
    expect(DELETES_WORKSPACES.some((re) => re.test(stripComments(port!)))).toBe(true);
    expect(CALLS_PSEUDONYMISE.test(stripComments(port!))).toBe(true);
    expect(
      findViolations(scanned),
      "a deletion executor exists with no accompanying pseudonymisation call — see R-30.5/R-54 and packages/db/src/spend-rollup.ts's pseudonymiseWorkspaceSpend"
    ).toEqual([]);
  });

  // THE PROOF THIS SCAN IS NOT FAIL-OPEN (CLAUDE.md 2026-08-21): a planted
  // executor of each shape, with and without the pseudonymisation call.
  it("FIXTURE PROOF: catches a query-builder deletion executor with no pseudonymisation call", () => {
    const planted = new Map([
      [
        "packages/db/src/zz-delete-workspace.ts",
        'import { workspaces } from "./schema";\n' +
          "export async function deleteWorkspace(db: DbLike, id: string) {\n" +
          "  await db.delete(workspaces).where(eq(workspaces.id, id));\n" +
          "}\n",
      ],
    ]);
    expect(findViolations(planted)).toEqual([
      "packages/db/src/zz-delete-workspace.ts",
    ]);
  });

  it("FIXTURE PROOF: catches a raw-SQL deletion executor with no pseudonymisation call", () => {
    const planted = new Map([
      [
        "packages/db/src/zz-delete-workspace-raw.ts",
        "export async function deleteWorkspace(db: DbLike, id: string) {\n" +
          '  await db.execute(sql`delete from workspaces where id = ${id}`);\n' +
          "}\n",
      ],
    ]);
    expect(findViolations(planted)).toEqual([
      "packages/db/src/zz-delete-workspace-raw.ts",
    ]);
  });

  it("FIXTURE PROOF: catches a generic registry-driven port that deletes through relation() with no pseudonymisation call", () => {
    const planted = new Map([
      [
        "packages/db/src/zz-generic-port.ts",
        "export async function cascade(tx: TxLike, table: string, where: SQL) {\n" +
          "  await tx.execute(sql`DELETE FROM ${relation(\"public\", table)} WHERE ${where}`);\n" +
          "}\n",
      ],
    ]);
    expect(findViolations(planted)).toEqual(["packages/db/src/zz-generic-port.ts"]);
  });

  it("FIXTURE PROOF: a deletion executor that DOES call pseudonymiseWorkspaceSpend is not flagged (the deny is default-deny, not a blanket ban)", () => {
    const planted = new Map([
      [
        "packages/db/src/zz-delete-workspace-ok.ts",
        'import { workspaces } from "./schema";\n' +
          'import { pseudonymiseWorkspaceSpend } from "./spend-rollup";\n' +
          "export async function deleteWorkspace(tx: TxLike, id: string) {\n" +
          "  await pseudonymiseWorkspaceSpend(tx, id);\n" +
          "  await tx.delete(workspaces).where(eq(workspaces.id, id));\n" +
          "}\n",
      ],
    ]);
    expect(findViolations(planted)).toEqual([]);
  });

  it("FIXTURE PROOF: a file that merely MENTIONS deletion in a comment is not flagged (comment-satisfiable is not a defence, but comment-triggered is not a violation either)", () => {
    const planted = new Map([
      [
        "packages/db/src/zz-unrelated.ts",
        "// TODO: someday this file will delete from workspaces\n" +
          "export const x = 1;\n",
      ],
    ]);
    expect(findViolations(planted)).toEqual([]);
  });
});
