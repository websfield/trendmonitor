// The one "am I the script node was asked to run?" guard for `scripts/*.ts`.
//
// WHY ONE MODULE (register 2026-10-05 item 3(b), R-155). Three operator scripts
// — `restore-verify.ts`, `journal-forecast.ts`, `journal-purge.ts` — each
// carried `import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))`: a
// file URL compared with a file path. Any character a URL percent-encodes (a
// space is `%20`) made it false, `main()` never ran, and the process exited 0.
// Reproduced 2026-10-05 under the pinned tsx from a directory whose name held a
// space: `restore-verify.ts` exited 0 having verified nothing, and
// `restore-drill.sh` read that 0 as "journal verified". The forecast's exit 2
// is a deploy gate and the purge's exit 2 is its alert, so the same skip
// silenced both. `tests/restore-verify.test.ts` scans the scripts for the old
// comparison so a fourth copy is a red test, not a review catch.
//
// This module imports builtins only, so a copy of it beside a copied script
// still resolves (the space-in-path test relies on that).
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * True when `moduleUrl` (pass `import.meta.url`) is the file `argv1` (pass
 * `process.argv[1]`) names.
 *
 * Compared as RESOLVED FILE PATHS. `realpathSync` is applied to both sides
 * because node resolves the main module through symlinks and junctions while
 * argv keeps the path as typed; a path that cannot be resolved falls back to
 * `resolve`. Windows paths compare case-insensitively, as the filesystem does.
 *
 * WITH THE SCRIPT EXTENSION STRIPPED (gate round 1). `tsx scripts/journal-purge`
 * runs `journal-purge.ts`, but argv keeps the extensionless path, so an exact
 * comparison was false and the script exited 0 having done nothing — the same
 * silent skip this module exists to end. The stripped set is the extensions a
 * script here can carry; two files differing only in extension are not a shape
 * this directory has.
 */
const SCRIPT_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;

export function isEntrypoint(moduleUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  const real = (path: string): string => {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  };
  const comparable = (path: string): string => {
    const stripped = real(path).replace(SCRIPT_EXTENSION, "");
    return process.platform === "win32" ? stripped.toLowerCase() : stripped;
  };
  return comparable(fileURLToPath(moduleUrl)) === comparable(resolve(argv1));
}
