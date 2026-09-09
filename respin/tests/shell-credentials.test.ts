// The credential-on-argv guard for the two operator shell scripts.
//
// `restore-drill.sh` carried a comment stating that only PGPASSWORD reached the
// database while all six of its psql/pg_restore invocations passed a fully
// credentialed `postgres://user:password@host/db` on argv — world-readable via
// /proc/<pid>/cmdline on the restore host, for the database holding customer
// email, name and billing address. The string `PGPASSWORD` appeared nowhere in
// the file. This is the test that makes the claim checkable rather than stated
// (CLAUDE.md 2026-07-30: a comment claiming a property is not the property).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPTS = ["backup.sh", "restore-drill.sh"] as const;

const read = (name: string): string => readFileSync(join(__dirname, "..", "scripts", name), "utf8");

/**
 * The shell variables that hold a URI WITH its password. An invocation naming
 * any of these puts a credential on argv.
 *
 * An explicit list rather than a pattern over "anything ending in _URL": the
 * password-less variants are named `*_SAFE`, so a suffix regex would match them
 * too and the guard would prove nothing (CLAUDE.md Respin rule 7 — a derived
 * guard's population is a list, not a producer). Adding a new credentialed
 * variable to either script means adding it here.
 */
const CREDENTIALED_VARS = [
  "DATABASE_URL",
  "MAINTENANCE_URL",
  "TARGET_URL",
  "BACKUP_DATABASE_URL",
] as const;

// Backslash-continued lines are JOINED first: a `pg_restore \` whose
// `--dbname="$TARGET_URL"` sits on the next physical line is one invocation,
// and a line-based scan let that shape carry the credential past the guard
// (security review of 10b-1, independent round 2).
const invocationLines = (source: string): string[] =>
  source
    .replace(/\\\r?\n\s*/g, " ")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .filter((line) => /\b(psql|pg_restore|pg_dump)\b/.test(line));

describe("operator scripts never put a database password on argv", () => {
  for (const name of SCRIPTS) {
    it(`${name}: no psql/pg_restore/pg_dump invocation names a credentialed URI`, () => {
      const lines = invocationLines(read(name));
      // Non-vacuity: a guard that finds zero invocations is asserting nothing,
      // which is exactly how a scanner fails open.
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        for (const variable of CREDENTIALED_VARS) {
          // `(?![A-Z_])` so `$TARGET_URL_SAFE` does not match `$TARGET_URL`.
          const onArgv = new RegExp(`\\$\\{?${variable}\\}?(?![A-Z_])`);
          expect(onArgv.test(line), `${name}: "${line.trim()}" passes $${variable} on argv`).toBe(false);
        }
      }
    });

    it(`${name}: actually EXPORTS PGPASSWORD, not merely mentions it`, () => {
      // The other half of the property. Without it, deleting every invocation
      // would satisfy the test above while the script did nothing at all.
      //
      // And it must match an EXPORT, not the string anywhere: the first version
      // of this assertion was `toMatch(/PGPASSWORD/)`, and a planted mutation
      // that deleted the real `export PGPASSWORD=...` line stayed GREEN because
      // the word still appeared in a comment two lines above. A guard satisfied
      // by prose about itself is the vacuous shape this file exists to refuse.
      const exports = read(name)
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith("#"))
        .filter((line) => /(^|\s)export\s+PGPASSWORD=/.test(line));
      expect(exports.length).toBeGreaterThan(0);
    });
  }
});

describe("the argv scanner itself (planted)", () => {
  it("catches a credentialed URI on a backslash-continued line, and the safe form passes", () => {
    const planted = 'pg_restore \\\n  --dbname="$TARGET_URL" \\\n  --no-owner';
    expect(invocationLines(planted)).toHaveLength(1);
    expect(/\$\{?TARGET_URL\}?(?![A-Z_])/.test(invocationLines(planted)[0]!)).toBe(true);
    const safe = 'pg_restore \\\n  --dbname="$TARGET_URL_SAFE"';
    expect(/\$\{?TARGET_URL\}?(?![A-Z_])/.test(invocationLines(safe)[0]!)).toBe(false);
  });
});
