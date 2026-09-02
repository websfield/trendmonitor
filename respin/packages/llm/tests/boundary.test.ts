// THE VENDOR BOUNDARY, AS A SCAN RATHER THAN AS A SENTENCE IN A DOCBLOCK.
//
// WHY THIS FILE EXISTS (slice 7 handoff, 2026-09-01). Two comments in this
// package asserted this guard as a fact — `anthropic.ts`'s header ("`@respin/llm`
// is THE ONLY FILE IN THIS REPOSITORY THAT IMPORTS A MODEL VENDOR'S SDK … asserts
// that by scanning `packages/**/src` and `app/**`, with a planted violation
// proving the scan can fail") and `types.ts`'s ("`@anthropic-ai/sdk` may be
// imported by exactly one file, and it is not this one"). NO SUCH TEST EXISTED.
// `tests/source-citations.test.ts` found the dangling citations and recorded
// them on `CITATIONS_OWED` as "a bigger finding than a wrong path: an absent
// guard described as present". A comment claiming a property is not the
// property — assert it in a test or delete the claim (CLAUDE.md 2026-07-30).
// The claim is worth keeping, so here is the guard.
//
// WHAT IT IS NOT. This does not prove the vendor is swappable, and it does not
// prove no Anthropic *shape* leaks through a structurally-typed value. It
// proves the one thing the two comments state: exactly one file names the SDK,
// and it is `anthropic.ts`.
//
// A GUARD THAT SCANS SOURCE FAILS OPEN WHEN ITS PATTERN BREAKS (CLAUDE.md
// 2026-08-21), so the walk is asserted to have read real files, every import
// shape carries a planted specimen the scan must catch, and the one shape that
// must NOT count — the SDK named in a COMMENT, which `packages/credits` really
// does — is planted as a negative. That negative is why this reads module
// specifiers through the TypeScript parser instead of grepping: a text scan
// reports `packages/credits/src/inference.ts` as a second importer and is then
// either wrong or suppressed by an exception list that hides the real thing.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** The vendor SDK, by the exact specifier `package.json` depends on. */
const VENDOR = "@anthropic-ai/sdk";

/** The ONE file allowed to name it, repo-relative and POSIX-separated. */
const SOLE_IMPORTER = "packages/llm/src/anthropic.ts";

/**
 * The scanned population, as a LIST.
 *
 * A population written as one path narrows silently the day a second appears
 * (CLAUDE.md 2026-08-29). These are the two trees the comments name —
 * `packages/**\/src` and `app/**` — enumerated so that adding a tree is a
 * deliberate edit here rather than a silent escape.
 *
 * TEST TREES ARE DELIBERATELY OUT. `packages/llm/tests/adapter.test.ts` builds
 * fakes against the adapter and `packages/modes/tests/purity.test.ts` holds the
 * vendor specifier as a PLANTED SPECIMEN in a string; both are correct, and a
 * rule that counted them would have to be suppressed per-file, which is how a
 * scan stops meaning anything. What ships to a user is `src/` and `app/`.
 */
const SCANNED: readonly string[] = ["packages", "app"];

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  "migrations",
  "tests",
]);

function sources(dir: string, acc: Map<string, string>): Map<string, string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return acc;
    throw err;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let entry;
    try {
      entry = statSync(full);
    } catch (err) {
      // Sibling suites write and delete probe files while vitest runs files in
      // parallel — the reason `table-writers.test.ts` swallows ENOENT and
      // nothing else.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (entry.isDirectory()) sources(full, acc);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      try {
        acc.set(
          relative(ROOT, full).split(sep).join("/"),
          readFileSync(full, "utf8")
        );
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
    }
  }
  return acc;
}

const population = (): Map<string, string> => {
  const acc = new Map<string, string>();
  for (const tree of SCANNED) sources(join(ROOT, tree), acc);
  return acc;
};

/**
 * Every module specifier a file really RESOLVES, from a parse.
 *
 * FOUR SHAPES, because a rule that knows only `import … from` is bypassed by an
 * ordinary refactor: a static import (`import type` included — a type-only
 * import of a vendor type is exactly the leak `types.ts` forbids), a re-export
 * (`export … from`), a dynamic `import()`, and `require()`. A specifier that is
 * not a plain string literal (a computed `import(name)`) cannot be read here
 * and is reported separately rather than passed over in silence.
 */
export function specifiersOf(file: string, src: string): string[] {
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: string[] = [];
  const push = (node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) out.push(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) push(node.moduleSpecifier);
    else if (ts.isExportDeclaration(node)) push(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        push(node.moduleReference.expression);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      if (isDynamicImport || isRequire) push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

/** Files whose resolved specifiers include the vendor SDK (or a subpath). */
export function vendorImporters(files: Map<string, string>): string[] {
  const hits: string[] = [];
  for (const [file, src] of files) {
    const specs = specifiersOf(file, src);
    if (specs.some((s) => s === VENDOR || s.startsWith(`${VENDOR}/`))) {
      hits.push(file);
    }
  }
  return hits.sort();
}

describe("the vendor-SDK scan is not vacuous", () => {
  it("catches a PLANTED import of every shape it claims to cover", () => {
    const SHAPES: [string, string][] = [
      ["default import", 'import Anthropic from "@anthropic-ai/sdk";'],
      [
        "named import",
        'import { APIError } from "@anthropic-ai/sdk";',
      ],
      [
        "TYPE-ONLY import (the leak types.ts forbids)",
        'import type { Message } from "@anthropic-ai/sdk";',
      ],
      [
        "namespace import",
        'import * as sdk from "@anthropic-ai/sdk";',
      ],
      [
        "a re-export",
        'export { APIError } from "@anthropic-ai/sdk";',
      ],
      [
        "a subpath",
        'import { toFile } from "@anthropic-ai/sdk/uploads";',
      ],
      [
        "a dynamic import",
        'const sdk = await import("@anthropic-ai/sdk");',
      ],
      ["require", 'const sdk = require("@anthropic-ai/sdk");'],
      [
        "import-equals",
        'import sdk = require("@anthropic-ai/sdk");',
      ],
    ];
    for (const [label, src] of SHAPES) {
      expect(
        vendorImporters(new Map([["packages/db/src/planted.ts", src]])),
        `${label}: the scan did not see it`
      ).toEqual(["packages/db/src/planted.ts"]);
    }
  });

  it("does NOT count the SDK named in a comment or a string", () => {
    // THE NEGATIVE THAT DECIDES THE IMPLEMENTATION. `packages/credits/src/
    // inference.ts` and `packages/credits/tests/inference.test.ts` both name
    // `@anthropic-ai/sdk@0.71.2` in prose to pin a verified-against-the-
    // installed-version fact, and `packages/modes/tests/purity.test.ts` holds
    // the specifier as a planted specimen in a string literal. A text scan
    // reports all three as importers; this one reads module specifiers.
    const NEGATIVES: [string, string][] = [
      [
        "a line comment",
        '// assumed: `@anthropic-ai/sdk@0.71.2` checks the signal at boundaries\nexport const a = 1;',
      ],
      [
        "a block comment",
        '/** verified against @anthropic-ai/sdk 0.71.2 */\nexport const a = 1;',
      ],
      [
        "a string literal specimen",
        'const specimen = \'import Anthropic from "@anthropic-ai/sdk";\';\nexport { specimen };',
      ],
      [
        "a different package with a similar name",
        'import x from "@anthropic-ai/sdk-mock";\nexport { x };',
      ],
    ];
    for (const [label, src] of NEGATIVES) {
      expect(
        vendorImporters(new Map([["packages/db/src/planted.ts", src]])),
        `${label}: reported as an importer`
      ).toEqual([]);
    }
  });
});

describe("THE REAL REPO: exactly one file imports the vendor SDK", () => {
  it("...and it is packages/llm/src/anthropic.ts", () => {
    const files = population();
    // Non-vacuity against the repo itself: the walk really read the trees.
    expect(files.size, "the scan read nothing").toBeGreaterThan(100);
    expect(
      [...files.keys()].some((f) => f === SOLE_IMPORTER),
      "the scan never reached the one file that is SUPPOSED to import the SDK"
    ).toBe(true);
    expect(vendorImporters(files)).toEqual([SOLE_IMPORTER]);
  });

  it("the provider-neutral surface names no vendor type (types.ts, index.ts)", () => {
    // `types.ts`'s own claim, asserted where it is made: "NO ANTHROPIC TYPE MAY
    // CROSS THIS BOUNDARY … it may be imported by exactly one file, and it is
    // not this one." `index.ts` is the package's whole public surface, so it
    // carries the same obligation.
    const files = population();
    for (const file of ["packages/llm/src/types.ts", "packages/llm/src/index.ts"]) {
      const src = files.get(file);
      expect(src, `${file} is not in the scanned population`).toBeDefined();
      expect(
        specifiersOf(file, src as string).filter(
          (s) => s === VENDOR || s.startsWith(`${VENDOR}/`)
        ),
        `${file} names the vendor SDK`
      ).toEqual([]);
    }
  });
});
