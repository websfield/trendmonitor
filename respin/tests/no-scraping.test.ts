// Slice 8 R1/R3 compliance scanner. Its target is source and manifests, not
// this fixture: every forbidden shape has a planted specimen below.
//
// THE POPULATION IS A LIST (CLAUDE.md, 2026-08-29): it names every place a
// scraping dependency or a caption/media route could be introduced, and a new
// place joins the scan by joining the list. Until 2026-09-03 it was
// `packages/trends/src` plus that package's dependency-free manifest — so a
// `puppeteer` at the root or a `yt-dlp` shell-out in `worker/`, where the
// outbound HTTP lives, passed M4's compliance test (compliance gate round 1).
// The first widening read the root manifest and called it "where every
// runtime dependency actually lives" — measured false in round 2: six package
// manifests declare runtime dependencies (`packages/llm` carries the vendor
// SDK, `packages/credits` carries Stripe, `packages/db` carries `pg`), so a
// `puppeteer` added to `packages/llm/package.json` passed. The manifest
// population is now the root PLUS every `packages/*/package.json`, and the
// package list is pinned so a new package must be added here deliberately.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");

/**
 * THE WORKSPACE PACKAGES, as a list. Derived from the directory below and
 * pinned EQUAL to this constant: a package that appears on disk without
 * appearing here fails the population test, and the scan therefore cannot
 * quietly cover six of seven.
 */
const PACKAGES = ["auth", "brain", "config", "credits", "db", "llm", "modes", "trends"] as const;

/** Source files (`.ts`/`.tsx`) under `dir`, excluding tests and build output. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "node_modules" || name === "tests" || name === ".next" ? [] : walk(full);
    }
    const isSource = name.endsWith(".ts") || name.endsWith(".tsx");
    const isTest = /\.test\.tsx?$/.test(name);
    return isSource && !isTest ? [full] : [];
  });
}

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * The dependency NAMES a manifest declares — the population a scraping
 * dependency joins. Every dependency block is read, because a scraper listed
 * as optional or peer is still a scraper the install resolves.
 */
function dependencyNamesOf(manifest: Manifest): string {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]
    // The browser test runner is a local verification tool, not a production
    // scraper. Exact-name exclusion keeps runtime `playwright` forbidden.
    .filter((name) => name !== "@playwright/test")
    .join("\n");
}

function manifestDependencyNames(file: string): string {
  return dependencyNamesOf(JSON.parse(readFileSync(file, "utf8")) as Manifest);
}

const FORBIDDEN = [
  { id: "scraping dependency", pattern: /\b(?:puppeteer|playwright|cheerio|selenium|scrapy|yt-dlp)\b/i, specimen: 'import "puppeteer";' },
  { id: "caption endpoint", pattern: /\/youtube\/v3\/captions\b/i, specimen: 'const path = "/youtube/v3/captions?key=fixture";' },
  { id: "media download endpoint", pattern: /\/(?:media|download)\b/i, specimen: 'const path = "/media/download?key=fixture";' },
] as const;

function offenders(pattern: RegExp, sources: readonly { name: string; text: string }[]): string[] {
  return sources.filter((source) => pattern.test(source.text)).map((source) => source.name);
}

describe("R1/R3: no scraper or caption/media download route in any package, the worker, lib, the app, or any manifest", () => {
  // THE POPULATION, as a list. Dependencies are proved from manifests, never by
  // walking node_modules (which would make the result depend on unrelated
  // transitive installations). Every workspace manifest is read: the root and
  // each package's own, because each package declares its own runtime
  // dependencies (compliance gate round 2, 2026-09-03).
  const sourceFiles = [
    ...PACKAGES.flatMap((name) => walk(join(PACKAGES_DIR, name, "src"))),
    ...walk(join(ROOT, "lib")),
    ...walk(join(ROOT, "worker")),
    ...walk(join(ROOT, "app")),
  ];
  const manifests = [
    join(ROOT, "package.json"),
    ...PACKAGES.map((name) => join(PACKAGES_DIR, name, "package.json")),
  ];
  const sources = [
    ...sourceFiles.map((file) => ({ name: relative(ROOT, file), text: readFileSync(file, "utf8") })),
    ...manifests.map((file) => ({ name: `${relative(ROOT, file)} (dependency names)`, text: manifestDependencyNames(file) })),
  ];

  it("the package list is the directory: a package on disk that is not in PACKAGES fails here", () => {
    const onDisk = readdirSync(PACKAGES_DIR)
      .filter((name) => statSync(join(PACKAGES_DIR, name)).isDirectory())
      .sort();
    expect(onDisk).toEqual([...PACKAGES].sort());
  });

  it("scans the real population: every package src, lib, worker, app server files, and every manifest", () => {
    const names = sources.map((source) => source.name);
    expect(names).toContain(join("packages", "trends", "src", "sources.ts"));
    // The package where outbound HTTP to the vendor lives — the round-2 gap.
    expect(names).toContain(join("packages", "llm", "src", "index.ts"));
    expect(names).toContain(join("packages", "credits", "src", "generate.ts"));
    expect(names).toContain(join("lib", "routes.ts"));
    expect(names).toContain(join("worker", "production.ts"));
    expect(names).toContain(join("app", "(product)", "trends", "actions.ts"));
    expect(names).toContain(join("app", "(product)", "trends", "spin-panel.tsx"));
    expect(names).toContain("package.json (dependency names)");
    for (const name of PACKAGES) {
      expect(names).toContain(`${join("packages", name, "package.json")} (dependency names)`);
    }
    expect(names.some((name) => /\.test\.tsx?$/.test(name))).toBe(false);
    expect(names.some((name) => name.split(sep).includes("tests"))).toBe(false);
    // A shrinking population is a weakened guard: the count is asserted, not
    // merely logged. 2026-09-03 (round 2): 102 package src + 2 lib + 17 worker
    // + 102 app = 223 source files, + 8 manifests (root + 7 packages).
    expect(sourceFiles.length).toBeGreaterThanOrEqual(218);
    expect(manifests).toHaveLength(1 + PACKAGES.length);
    expect(sources.map((source) => source.text).join("\n").length).toBeGreaterThan(100_000);
  });

  it.each(FORBIDDEN)("NON-VACUITY: finds planted $id in a source file", ({ pattern, specimen }) => {
    expect(offenders(pattern, [{ name: "planted.ts", text: specimen }])).toEqual(["planted.ts"]);
  });

  it("NON-VACUITY: finds a planted scraping dependency by NAME in a manifest's dependency list", () => {
    // The manifest text scanned is the dependency-name list, not the raw JSON,
    // so a planted dependency has to be found in that derived shape — through
    // the SAME derivation the real manifests go through, not a re-typed copy.
    const planted: Manifest = { dependencies: { next: "^15", puppeteer: "^23" }, devDependencies: {} };
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "planted-manifest", text: dependencyNamesOf(planted) }])).toEqual(["planted-manifest"]);
  });

  it("NON-VACUITY: finds a planted scraping dependency in a NON-ROOT package manifest shape", () => {
    // The round-2 gap, as a specimen: a package manifest (name, private, its
    // own runtime dependencies) that carries the vendor SDK AND a scraper. The
    // real `packages/llm/package.json` has the first; this one adds the second.
    const packageShaped: Manifest & { name: string; private: boolean } = {
      name: "@respin/llm",
      private: true,
      dependencies: { "@anthropic-ai/sdk": "^0.50.0", zod: "^3", playwright: "^1.40" },
      devDependencies: { typescript: "^5", vitest: "^3" },
    };
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "packages/llm/package.json (dependency names)", text: dependencyNamesOf(packageShaped) }]))
      .toEqual(["packages/llm/package.json (dependency names)"]);
    // ...and the same scraper hidden in an optional or peer block is found too.
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "optional", text: dependencyNamesOf({ optionalDependencies: { cheerio: "^1" } }) }])).toEqual(["optional"]);
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "peer", text: dependencyNamesOf({ peerDependencies: { selenium: "^4" } }) }])).toEqual(["peer"]);
  });

  it.each(FORBIDDEN)("contains no $id", ({ pattern }) => {
    expect(offenders(pattern, sources)).toEqual([]);
  });
});
