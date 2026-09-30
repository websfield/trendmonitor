// THE ONE WALKER OVER THIS WORKSPACE'S TYPESCRIPT, AND THE ONE ROOT LIST.
//
// WHY IT EXISTS (audit 2026-09-19, non-negotiable 7's fourth recurrence;
// remediation P1-R3 in shape, applied here for P1-R4). Every source scan in
// `tests/` had written its own root list, and every one of them was short:
// `retention.test.ts:100-104` scanned three of six production roots,
// `safe-log.test.ts:192-203` scanned `app/` alone, `no-scraping.test.ts:91-96`
// missed the repo's own root-level `.ts` files including `middleware.ts`, and
// `claim-scan.test.ts`'s re-invention scan — written to close the class of
// re-invented predicates — walked `tests/` only, while
// `packages/modes/tests/claims.test.ts` and `packages/modes/tests/
// kill-test.test.ts` import the very canon it guards.
//
// A ROOT LIST THAT IS NOT ASSERTED AGAINST DISK IS A GUESS. `ROOT_DIRS` below
// is compared to what is actually on disk by the first case in
// `tests/claim-scan.test.ts`'s re-invention block — this module's only
// consumer today — in the shape `no-scraping.test.ts:106-111` already uses for
// its package list:
// add a top-level directory holding TypeScript and the assertion is red until
// somebody decides, in writing, whether scans should read it.
//
// ROOT-LEVEL FILES ARE A ROOT. `middleware.ts` runs on every request,
// `instrumentation*.ts` run at boot, and a walker that only descends into
// directories reads none of them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** `respin/` — the workspace root every path below is relative to. */
export const WORKSPACE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/**
 * Directories a source scan never descends into.
 *
 * Installed packages and build output are not this workspace's code: a rule
 * about how this repo writes something cannot be violated by a file it did
 * not write, and `node_modules` alone would make every scan take minutes.
 */
const NOT_OURS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
]);

/**
 * Every top-level directory under `respin/` that holds TypeScript.
 *
 * A LIST, NOT A PRODUCER (non-negotiable 7). It is asserted equal to disk, so
 * a new top-level directory is a decision somebody records rather than a
 * silent exclusion from every scan that reads this.
 */
export const ROOT_DIRS = [
  "app",
  "e2e",
  "lib",
  "packages",
  "scripts",
  "tests",
  "worker",
] as const;

/**
 * The roots that hold what this workspace SHIPS — `ROOT_DIRS` without the two
 * test roots, plus `ops`.
 *
 * A LIST, NOT A PRODUCER (non-negotiable 7), and its relation to `ROOT_DIRS` is
 * ASSERTED rather than described: `PRODUCTION_ROOTS = ROOT_DIRS ∖ {tests, e2e}
 * ∪ {ops}`, checked in `tests/claim-scan.test.ts` so editing either list alone
 * is red. Lived at `tests/table-writers.test.ts:353` until P1-R3 moved it here,
 * where the scanners that need a production-only population can share it
 * instead of each writing its own short list.
 *
 * `ops` is here and not in `ROOT_DIRS` because it holds NO TypeScript
 * (measured 2026-09-21: `ops/systemd/` only) — `topLevelDirsHoldingTypeScript`
 * therefore cannot return it, while `table-writers.test.ts` reads non-TypeScript
 * writers there. That asymmetry is the whole reason the relation needs an
 * assertion rather than a sentence.
 */
export const PRODUCTION_ROOTS = [
  "packages",
  "app",
  "worker",
  "scripts",
  "lib",
  "ops",
] as const;

/** What is actually on disk, for the assertion that `ROOT_DIRS` matches it. */
export function topLevelDirsHoldingTypeScript(): string[] {
  const holdsTs = (dir: string): boolean => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (NOT_OURS.has(entry.name)) continue;
        if (holdsTs(join(dir, entry.name))) return true;
      } else if (/\.tsx?$/.test(entry.name)) return true;
    }
    return false;
  };
  return readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !NOT_OURS.has(entry.name) &&
        // DOT-DIRECTORIES ARE EXCLUDED, AND THE REASON IS WRITTEN DOWN — the
        // module's own docblock promises "a new top-level directory is a
        // DECISION SOMEBODY RECORDS rather than a silent exclusion", and until
        // 2026-09-21 this clause was exactly the silent one it forbids
        // (batch-5 compliance gate, C-8). Measured: `respin/.tmp` holds 1,543
        // `.ts` files of gitignored test scratch. A dot-directory is tooling
        // state, not this workspace's source, and scanning one would make
        // every guard here read code nobody wrote and nobody ships.
        !entry.name.startsWith(".") &&
        holdsTs(join(WORKSPACE_ROOT, entry.name))
    )
    .map((entry) => entry.name)
    .sort();
}

/** One file a scan reads: its workspace-relative path and its text. */
export type SourceFile = { file: string; text: string };

const relativePath = (full: string): string =>
  relative(WORKSPACE_ROOT, full).split(sep).join("/");

/**
 * Every `.ts`/`.tsx` file under the given roots, plus the workspace's own
 * root-level ones, with line endings normalised.
 *
 * ENDINGS ARE NORMALISED HERE AND NOWHERE ELSE. `.gitattributes` pins these
 * `eol=lf` and the worktree carries CRLF on some machines, so a scan matching
 * a multi-line literal reads bytes git does not pin: a positive match goes red
 * on a phantom change and a negative one goes silently green on a real
 * violation (CLAUDE.md, 2026-09-04 / 2026-09-18).
 */
export function sourceFilesUnder(
  roots: readonly string[] = ROOT_DIRS
): SourceFile[] {
  const out: SourceFile[] = [];
  const read = (full: string): void => {
    // ENOENT ONLY, AND NARROWLY — the race is real and was solved per-consumer
    // until P1-R3 moved the walk here. `tests/import-boundary.test.ts` writes a
    // probe file into `lib/` and deletes it, and vitest runs suites
    // concurrently, so this walk can list a path that is gone by the time it
    // reads it. A file that no longer exists is not in the committed tree and
    // cannot be a violation of it. EVERY OTHER read error still throws: a walk
    // that swallowed them would hand its callers a short file list and every
    // scan built on it would report "no violations" because it could not read
    // the files — the 2026-08-21 fail-open shape these scans exist to avoid.
    let text: string;
    try {
      text = readFileSync(full, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    out.push({ file: relativePath(full), text: text.replace(/\r\n/g, "\n") });
  };
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!NOT_OURS.has(entry.name)) walk(join(dir, entry.name));
      } else if (/\.tsx?$/.test(entry.name)) read(join(dir, entry.name));
    }
  };
  for (const root of roots) {
    const full = join(WORKSPACE_ROOT, root);
    if (statSync(full).isDirectory()) walk(full);
  }
  // The workspace's own root-level modules — `middleware.ts` runs on every
  // request, and it belongs to no directory root.
  for (const entry of readdirSync(WORKSPACE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() && /\.tsx?$/.test(entry.name)) {
      read(join(WORKSPACE_ROOT, entry.name));
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}
