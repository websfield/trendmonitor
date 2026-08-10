import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { GENERATED_PY_PACKAGE, GENERATED_TS_DIR } from './paths.js';
import { generatePython, generateTypeScript } from './generate.js';

/**
 * `build:contracts --check` — fail when regeneration would dirty either
 * committed generated tree (tech-spec §3).
 *
 * This is the gate that makes "generated types are committed" mean something.
 * Without it, a schema could change while the committed TypeScript and Python
 * still described the old shape, and both languages would compile happily
 * against a contract that no longer exists.
 *
 * It regenerates into a temp directory and compares, rather than regenerating
 * in place and asking git — so it works on a dirty tree, needs no git, and
 * never modifies the committed output as a side effect of checking it.
 */

export interface DriftReport {
  /** Files whose regenerated content differs from what is committed. */
  changed: string[];
  /** Files regeneration would create. */
  added: string[];
  /** Committed files regeneration would not produce. */
  removed: string[];
}

export function isClean(report: DriftReport): boolean {
  return report.changed.length === 0 && report.added.length === 0 && report.removed.length === 0;
}

/**
 * Artefacts of *running* the generated code, which are not generator output.
 *
 * Importing the generated Pydantic models — which `validate:contracts` does on
 * every run — makes CPython write `__pycache__/*.pyc` beside them. Those are
 * gitignored, but this walker reads the filesystem, not the index, so without
 * this filter the first `validate:contracts` would leave `--check` permanently
 * red and reporting "stale" files that no schema change could ever fix.
 */
function isRunArtefact(name: string): boolean {
  return name === '__pycache__' || name.endsWith('.pyc') || name.endsWith('.pyo');
}

function readTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (isRunArtefact(entry)) continue;
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else {
        out.set(relative(root, abs).split(sep).join('/'), readFileSync(abs, 'utf8'));
      }
    }
  };
  walk(root);
  return out;
}

function diff(committed: Map<string, string>, fresh: Map<string, string>, prefix: string): DriftReport {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [path, content] of fresh) {
    const existing = committed.get(path);
    if (existing === undefined) {
      added.push(`${prefix}/${path}`);
    } else if (normalise(existing) !== normalise(content)) {
      changed.push(`${prefix}/${path}`);
    }
  }
  for (const path of committed.keys()) {
    if (!fresh.has(path)) removed.push(`${prefix}/${path}`);
  }
  return { changed, added, removed };
}

/**
 * Compare ignoring line-ending style.
 *
 * Windows is the primary dev machine and git may check these files out with
 * CRLF; the generators always emit LF. Without this, `--check` would fail on
 * every Windows clone for a reason that has nothing to do with the contracts.
 */
function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Which trees to compare the freshly generated output against. Defaults to the
 * committed ones, which is what every production caller wants and passes.
 *
 * It exists so a TEST can point the comparison at a temp COPY. Manufacturing drift
 * by writing a stray file into the committed `generated/typescript/` was measured
 * failing: `node:test` runs the two async tests of one `describe` concurrently, so
 * the probe was live while the sibling test asserted the trees were current, and a
 * full `pnpm -r --no-bail run test` returned `fail 1` with
 * `removed: ["generated/typescript/__drift-probe.ts"]`. The same window is visible
 * across packages — `apps/cli`'s `doctor` suite calls `checkGenerated` and runs in
 * parallel under `pnpm -r` — and a crashed run leaves the working tree dirty for
 * CI's "the gate did not modify the working tree" step (D-57).
 */
export interface CheckRoots {
  /** Stand-in for `generated/typescript/`. */
  readonly ts?: string;
  /** Stand-in for `generated/python/cutdown_contracts/`. */
  readonly py?: string;
}

export async function checkGenerated(roots: CheckRoots = {}): Promise<DriftReport> {
  const tsRoot = roots.ts ?? GENERATED_TS_DIR;
  const pyRoot = roots.py ?? GENERATED_PY_PACKAGE;
  const scratch = mkdtempSync(join(tmpdir(), 'cutdown-contracts-check-'));
  try {
    const tsOut = join(scratch, 'typescript');
    const pyOut = join(scratch, 'python');

    const freshTs = new Map<string, string>();
    for (const [abs, contents] of await generateTypeScript(tsOut)) {
      freshTs.set(relative(tsOut, abs).split(sep).join('/'), contents);
    }
    generatePython(pyOut);

    const tsReport = diff(readTree(tsRoot), freshTs, 'generated/typescript');
    const pyFresh = readTree(pyOut);
    // The committed package has an `__init__.py` banner that `generateAll`
    // prepends after the generator runs; compare it on the same footing.
    const pyCommitted = readTree(pyRoot);
    pyCommitted.delete('__init__.py');
    pyFresh.delete('__init__.py');
    const pyReport = diff(pyCommitted, pyFresh, 'generated/python/cutdown_contracts');

    return {
      changed: [...tsReport.changed, ...pyReport.changed],
      added: [...tsReport.added, ...pyReport.added],
      removed: [...tsReport.removed, ...pyReport.removed],
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function formatDrift(report: DriftReport): string {
  const lines: string[] = [];
  for (const p of report.changed) lines.push(`  modified: ${p}`);
  for (const p of report.added) lines.push(`  new:      ${p}`);
  for (const p of report.removed) lines.push(`  stale:    ${p}`);
  return lines.join('\n');
}
