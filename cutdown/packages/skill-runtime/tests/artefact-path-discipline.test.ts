import { ok, strictEqual } from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * A LINT, not a unit test: every path read out of a stored artefact must reach the
 * filesystem through `resolveJobRelative`, never a bare `join`.
 *
 * This exists because the same defect has now recurred three times in one phase, in
 * three different files, always the same shape: a field is guarded where a reviewer
 * named it, and the sibling on the next line is missed. `render-v1`'s `outputPath`
 * and `captions.{srtPath,vttPath,assPath}` and `source-asset-v1`'s `storedPath` are
 * *described* as job-relative and constrained only by `minLength: 1` — tightening
 * those patterns would be a BREAKING change to a Phase 4 contract, so the guard is
 * `resolveJobRelative` in code, and a guard that lives only in code needs something
 * that notices when a new call site forgets it.
 *
 * A grep-shaped assertion is deliberately crude, and the title above overstates it —
 * so here is what it actually does NOT catch, verified rather than guessed:
 *
 *   - a MULTI-LINE `join(` whose field sits on a later line;
 *   - an ALIASED local (`const s = asset.storedPath; join(dir, s)`) — a shape already
 *     present in `skills/render/src/main.ts`;
 *   - sinks other than `join(`: `readFileSync`, `copyFileSync`, `resolve`, `mkdirSync`,
 *     and `filtergraph.ts`'s `input.burnIn.assPath` into a subtitles filter — which is
 *     the ACTUAL sink the finding that prompted this lint was about;
 *   - bracket access (`asset['storedPath']`);
 *   - any line merely MENTIONING `resolveJobRelative`, which is exempted wholesale;
 *   - a new `minLength: 1` path field in a future contract, because the field list
 *     below is hardcoded rather than derived from the schemas.
 *
 * It is a tripwire, not a proof. It earns its place because it found six real sites
 * three review rounds had missed — not because it makes the invariant structural. The
 * thing that would make it structural is a `pattern` on those schema fields, which is
 * a breaking change to a Phase 4 contract and is carried as a residual.
 */

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to `cutdown/` by its marker file rather than counting `..` hops.
 *
 * This file runs from `dist/tests/`, not `tests/`, so a fixed hop count is wrong by
 * exactly one — and it fails SILENTLY, scanning an empty directory and passing. The
 * "finds source files at all" assertion below is the second half of that guard.
 */
function workspaceRoot(): string {
  let dir = here;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not locate the cutdown workspace root above ${here}`);
    dir = parent;
  }
}

const WORKSPACE = workspaceRoot();

/** Workspace-relative, forward-slashed, so a failure message is copy-pasteable. */
const rel = (file: string): string => relative(WORKSPACE, file).split('\\').join('/');

/**
 * The opt-out marker, which must carry a reason after it.
 *
 * For the case where a field NAME collides with an artefact field but the value is
 * not artefact-derived — e.g. a CLI `--output` option that happens to be called
 * `outputPath`. The marker keeps the exemption at the call site instead of in a list
 * nobody reads, and the assertion below requires a reason follows it.
 */
const LINT_OPT_OUT = 'artefact-path-lint: not-an-artefact';

/** The artefact fields that are paths and carry no schema pattern. */
const ARTEFACT_PATH_FIELDS = ['storedPath', 'outputPath', 'srtPath', 'vttPath', 'assPath'] as const;

/** Source roots that read stored artefacts. Excludes tests, which build fixtures. */
const SOURCE_ROOTS = ['skills', 'packages', 'workflows', 'apps'];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    // `dist` holds compiled copies of the same code, and `tests`/`fixtures`
    // legitimately construct these paths by hand to exercise the guards.
    if (entry === 'node_modules' || entry === 'dist' || entry === 'tests' || entry === 'fixtures') continue;
    // `withFileTypes` rather than `statSync`: `statSync` FOLLOWS a link, so a broken
    // symlink anywhere in the tree threw and took the whole lint down — a security
    // check that dies on an unrelated file is a check that silently stops running.
    let isDir: boolean;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      sourceFiles(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('artefact-derived paths never reach `join` directly', () => {
  it('finds source files to scan at all', () => {
    // Guards the lint itself: a path typo would make every assertion below vacuous,
    // which is the failure mode of every grep-based test.
    const files = SOURCE_ROOTS.flatMap((r) => sourceFiles(join(WORKSPACE, r)));
    ok(files.length > 20, `expected to scan the workspace, found ${String(files.length)} file(s)`);
  });

  it('every opt-out marker states a reason', () => {
    // An exemption with no reason is an exemption nobody can review.
    const bare: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(join(WORKSPACE, root))) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (!line.includes(LINT_OPT_OUT)) return;
            // The reason may continue onto the following comment lines — which is the
            // form the offender check's 4-line window ENCOURAGES. Checking only the
            // remainder of the marker's own line rejected exactly the shape the lint
            // documents, and `/\S{12}/` measured the longest TOKEN rather than the
            // reason: a URL passed, while a good plain-English sentence failed.
          const window = lines.slice(i, i + 5).join(' ');
          const tail = window.slice(window.indexOf(LINT_OPT_OUT) + LINT_OPT_OUT.length).replace(/[/*]/g, ' ');
          const words = tail.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
          if (words.length < 6) {
            bare.push(`${rel(file)}:${String(i + 1)} (reason too thin: ${String(words.length)} words)`);
          }
        });
      }
    }
    strictEqual(bare.length, 0, `opt-out with no stated reason:\n${bare.join('\n')}`);
  });

  it('no `join(...)` call interpolates an unguarded artefact path field', () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(join(WORKSPACE, root))) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (!line.includes('join(')) return;
          // The sanctioned wrappers; both call `join` themselves.
          if (line.includes('resolveJobRelative') || line.includes('resolveArtefactPath')) return;
          // An opt-out must state a REASON at the site. A bare allowlist in this file
          // would drift out of sight; a marker at the call site is visible to anyone
          // editing it and shows up in review as a claim that can be checked.
          //
          // The marker counts on the line itself or in the comment block immediately
          // above it, because a reason worth stating rarely fits in a trailing
          // comment — and a rule that only accepts the cramped form pushes authors
          // toward a reason too short to evaluate.
          const window = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
          if (window.includes(LINT_OPT_OUT)) return;
          for (const field of ARTEFACT_PATH_FIELDS) {
            // Only a READ of the field counts (`x.storedPath`), not a key being
            // written into an object literal (`storedPath: rel`).
            if (new RegExp(`\\.${field}\\b`).test(line)) {
              offenders.push(
                `${rel(file)}:${String(i + 1)} — ` +
                  `\`.${field}\` reaches join() without resolveJobRelative: ${line.trim()}`,
              );
            }
          }
        });
      }
    }
    strictEqual(
      offenders.length,
      0,
      `An artefact path field is joined without containment:\n${offenders.join('\n')}\n\n` +
        `Use resolveJobRelative(jobRoot, value, what) — these fields have no schema pattern, ` +
        `so a traversing value in a stored artefact would otherwise reach the filesystem.`,
    );
  });
});
