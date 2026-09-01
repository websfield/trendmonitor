// THE PROBE-ARTIFACT HYGIENE SUITE (slice 6).
//
// A non-vacuity test proves its scan is alive by planting a real violation in
// the tree it scans. That is the right proof and it leaves a loaded gun on the
// floor: while the file exists it IS the defect, and vitest runs test files in
// parallel, so every other suite's walk can see it. Slice 6 paid for both ends
// of that — a probe found on disk after an interrupted run (untracked, not
// ignored, one `git add -A` from being committed into `app/`), and a P6b
// failure naming an offender that could not be reproduced afterwards.
//
// The fix is one shared list (tests/support/probe-artifacts.ts) and two
// mechanisms that read it: the shared walker skips probe artifacts by default,
// and `.gitignore` hides them from git — which also hides them from the
// `git grep --untracked` scans. EACH MECHANISM IS TESTED IN BOTH DIRECTIONS,
// because "skips them" with no opt-in would silently disarm the very tests the
// probes exist for, and that is the same fail-open shape one level up.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { walkCodeFiles } from "./support/app-surface";
import {
  PLANTED_PROBE_PATHS,
  PROBE_DIRECTORY_NAMES,
  PROBE_FILE_RE,
  PROBE_GITIGNORE_PATTERNS,
  isProbeArtifactPath,
} from "./support/probe-artifacts";

const respinRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// AWAITED, never `execFileSync`: import-boundary.test.ts carries a scan that
// forbids a synchronous child process anywhere under tests/, because a blocked
// worker starves vitest's reporter RPC.
const execFileAsync = promisify(execFile);

/** A throwaway tree with one real file, one probe DIRECTORY and one probe FILE. */
function plantTree(): { root: string; real: string; inDir: string; file: string } {
  const root = mkdtempSync(join(tmpdir(), "respin-probe-"));
  const write = (rel: string, body: string) => {
    const full = join(root, ...rel.split("/"));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
    return full;
  };
  return {
    root,
    real: write("(product)/page.tsx", "export default () => null;\n"),
    inDir: write(
      `${PROBE_DIRECTORY_NAMES[0]}/probe.ts`,
      'export const x = async () => (await import("@respin/db")).createDb;\n'
    ),
    file: write("__p6_probe.ts", 'export const x = "id" as unknown as V;\n'),
  };
}

describe("walkCodeFiles hides probe artifacts by default, and shows them on request", () => {
  it("a planted probe DIRECTORY and probe FILE are invisible to a default walk", () => {
    const { root, real, inDir, file } = plantTree();
    const seen = walkCodeFiles(root);
    // NON-VACUITY FIRST: the walk really read this tree. Without this line an
    // empty result would satisfy every expectation below.
    expect(seen, "the walk found nothing at all").toContain(real);
    expect(
      seen,
      "a probe planted by a CONCURRENT test file must not become this scan's offender"
    ).not.toContain(inDir);
    expect(seen).not.toContain(file);
  });

  it("...and the SAME walk finds both when the caller opts in", () => {
    const { root, real, inDir, file } = plantTree();
    const seen = walkCodeFiles(root, { includeProbeArtifacts: true });
    expect(seen).toContain(real);
    expect(
      seen,
      "without this the non-vacuity suites would pass by finding nothing"
    ).toContain(inDir);
    expect(seen).toContain(file);
  });

  it("the live app/ walk is unaffected — the skip is not a way to hide product code", () => {
    const app = resolve(respinRoot, "app");
    const seen = walkCodeFiles(app);
    expect(seen.length, "the app walk collapsed").toBeGreaterThan(10);
    expect(seen.every((f) => !isProbeArtifactPath(f))).toBe(true);
    // A file whose name merely CONTAINS "probe" is not a probe artifact.
    expect(isProbeArtifactPath("app/(product)/usage/probe-view.tsx")).toBe(false);
    expect(isProbeArtifactPath("app/(product)/__p6_probe.ts")).toBe(true);
  });

  it("the classifier and the planted list are the same list", () => {
    // The drift guard. A probe added to PLANTED_PROBE_PATHS that the patterns
    // do not match would be gitignored by nothing and skipped by nothing.
    for (const path of Object.values(PLANTED_PROBE_PATHS)) {
      expect(isProbeArtifactPath(path), path).toBe(true);
    }
    // ...and the file convention is a REGEX LITERAL that actually matches the
    // shapes it claims (a pattern assembled from a string is one lost backslash
    // from matching nothing and reporting clean).
    expect(PROBE_FILE_RE.test("__p6_probe.ts")).toBe(true);
    expect(PROBE_FILE_RE.test("__cage_probe.ts")).toBe(true);
    expect(PROBE_FILE_RE.test("__p6b_probe.tsx")).toBe(true);
    expect(PROBE_FILE_RE.test("probe.ts")).toBe(false);
    expect(PROBE_FILE_RE.test("__probe.ts")).toBe(false);
    expect(PROBE_FILE_RE.test("with-workspace.ts")).toBe(false);
  });
});

describe("the INSTALLED git ignores every planted probe path", () => {
  /** 0 = ignored, 1 = not ignored, anything else is a broken check, not a pass. */
  const ignored = async (path: string): Promise<boolean> => {
    try {
      await execFileAsync("git", ["check-ignore", "-q", "--", path], {
        cwd: respinRoot,
      });
      return true;
    } catch (e) {
      const err = e as { code?: number | string };
      if (err.code === 1) return false;
      throw new Error(
        `git check-ignore failed in a way that is NOT "not ignored" (code ${String(
          err.code
        )}) — this check would otherwise report a pass without having run: ${String(e)}`
      );
    }
  };

  it.each(Object.entries(PLANTED_PROBE_PATHS))(
    "%s (%s) cannot be committed",
    async (_name, path) => {
      expect(
        await ignored(path),
        `${path} is a planted violation — an interrupted run must not leave it committable`
      ).toBe(true);
    }
  );

  it("NON-VACUITY: real product files are NOT ignored", async () => {
    // A check-ignore that answered "true" for everything would pass the block
    // above while proving nothing about the patterns.
    for (const path of [
      "app/(product)/usage/page.tsx",
      "lib/routes.ts",
      "packages/db/src/with-workspace.ts",
    ]) {
      expect(await ignored(path), path).toBe(false);
    }
  });

  it("the .gitignore lines and the pinned patterns are the same three lines", () => {
    const lines = readFileSync(resolve(respinRoot, ".gitignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim());
    for (const pattern of PROBE_GITIGNORE_PATTERNS) {
      expect(lines, `${pattern} is missing from respin/.gitignore`).toContain(
        pattern
      );
    }
  });
});
