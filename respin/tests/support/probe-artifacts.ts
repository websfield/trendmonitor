// PROBE ARTIFACTS — the disposable files a non-vacuity test plants in the tree
// it is about to scan, listed ONCE so that every reader of the tree agrees on
// what they are.
//
// WHY THIS MODULE EXISTS (slice 6). `tests/import-boundary.test.ts` proves its
// dynamic-import scan is not vacuous by WRITING A REAL FILE into `app/` —
// `app/__scan_probe__/probe.ts`, importing `trustWorkspaceId` — and removing it
// in a `finally`. That is the right shape for the proof and the wrong shape for
// everything else in the repo, because the file is a genuine tenancy violation
// sitting in the product tree while it exists. Two windows were live at once,
// and both fired during slice 6:
//
//   1. THE WRITE SAT OUTSIDE THE `try`, so an interruption between the write
//      and the `try` never reached the `finally`. The artifact was found on
//      disk after an interrupted run — untracked, NOT gitignored, and therefore
//      one `git add -A` away from a planted tenancy violation in `app/`.
//   2. VITEST RUNS TEST FILES IN PARALLEL, so while the probe exists every
//      concurrently-running scan of `app/**` sees it. That produced a
//      non-reproducing failure of P6b — the scan that hunts exactly the kind of
//      thing the probe contains — whose offender could not be found afterwards.
//
// So a probe is now invisible to every scan BY DEFAULT, and a test that plants
// one has to name it:
//
//   - `walkCodeFiles` (tests/support/app-surface.ts) skips them unless asked;
//   - the `git grep` scans skip them because `.gitignore` hides them, and the
//     tests that plant one pass its path back in through `scanFor`'s
//     `includeIgnored`;
//   - `packageSources()` (tests/profile-cage.test.ts) skips them.
//
// BOTH DIRECTIONS MATTER AND BOTH ARE TESTED (tests/probe-artifacts.test.ts):
// without the skip, foreign probes poison other scans; without the opt-in, the
// non-vacuity tests silently stop proving anything — which is the exact
// fail-open shape this module exists to close.
//
// THE RESIDUAL, MEASURED 2026-09-01 RATHER THAN ARGUED. A probe that survives a
// killed run is now invisible to every scan, to `git status` and to `git grep`
// — and `app/__scan_probe__/probe.ts` is valid TypeScript that the app's own
// `tsconfig.json` does NOT exclude (that exclude is `**/__*_probe.ts`, which
// covers the single-file probes only), so `tsc --noEmit` exits 0 on it and
// `eslint` reports nothing. Both were run with the file planted. The leftover
// therefore costs a stray file in one working tree and nothing else: it cannot
// be committed and cannot make another suite red. A guard asserting "no probe
// exists on disk" is deliberately NOT written, because it would race the very
// tests that plant them — vitest runs test files in parallel, which is the
// same fact this module starts from.

/**
 * THE POPULATION, AS A LIST. Every probe any suite plants, with the guard it
 * is proving. Adding a probe means adding a line here — that is what a new one
 * costs, and it is cheaper than the day a scan reports clean because the file
 * it should have found was hidden from it (CLAUDE.md, 2026-08-29).
 *
 * Paths are relative to `respin/`.
 */
export const PLANTED_PROBE_PATHS = {
  /** import-boundary: the dynamic `import("@respin/…")` scan. */
  dynamicImport: "app/__scan_probe__/probe.ts",
  /** import-boundary: the dynamic `import("stripe")` scan. */
  dynamicStripe: "app/__stripe_scan_probe__/probe.ts",
  /** import-boundary P6: a cast to `VerifiedProfileId`. */
  profileBrandCast: "lib/__p6_probe.ts",
  /** import-boundary P6b: a cast to `VerifiedWorkspaceId`. */
  workspaceBrandCast: "lib/__p6b_probe.ts",
  /** import-boundary: a cage-registry registration, in app/** … */
  cageRegistrationApp: "lib/__cage_probe.ts",
  /** …and in packages/** (the same scan's second root). */
  cageRegistrationPackage: "packages/credits/src/__cage_probe.ts",
} as const;

/**
 * Directory names that hold probe files.
 *
 * A DIRECTORY rather than a file convention for these two because the probe
 * inside them is named `probe.ts`, which is a name product code could
 * plausibly use.
 */
export const PROBE_DIRECTORY_NAMES = [
  "__scan_probe__",
  "__stripe_scan_probe__",
] as const;

/**
 * The single-file probe convention: `__<anything>_probe.ts`.
 *
 * A REGEX LITERAL, never assembled from a string — one lost backslash in an
 * assembled pattern turns a guard into a scan that matches nothing and reports
 * clean (CLAUDE.md, 2026-08-21). `tsconfig.json` already excludes the same
 * `__*_probe.ts` convention at any depth, for the same family of reasons (a survivor otherwise fails
 * every later `pnpm typecheck`), so the two conventions are deliberately the
 * same one.
 */
export const PROBE_FILE_RE = /^__[A-Za-z0-9]+(_[A-Za-z0-9]+)*_probe\.(ts|tsx)$/;

/** True for ONE path segment that is a probe directory or a probe file. */
export function isProbeArtifactSegment(segment: string): boolean {
  return (
    (PROBE_DIRECTORY_NAMES as readonly string[]).includes(segment) ||
    PROBE_FILE_RE.test(segment)
  );
}

/**
 * True when ANY segment of the path is a probe artifact — so a file *inside* a
 * probe directory is one too, whatever it is called.
 *
 * Both separators, because these paths come from `node:path` on Windows and
 * from `git grep` (always `/`) alike.
 */
export function isProbeArtifactPath(filePath: string): boolean {
  return filePath.split(/[\\/]/).some(isProbeArtifactSegment);
}

/**
 * The `.gitignore` lines that make the paths above uncommittable.
 *
 * Pinned here and asserted against the INSTALLED git in
 * tests/probe-artifacts.test.ts — a pattern that looks right and does not match
 * is the same nothing as a scan that finds nothing.
 */
export const PROBE_GITIGNORE_PATTERNS = [
  "__scan_probe__/",
  "__stripe_scan_probe__/",
  "__*_probe.ts",
] as const;
