// Slice 6 stage B, R2: `@respin/modes` is pure and offline, and that is a
// SCAN rather than a promise in a docblock.
//
// A GUARD THAT SCANS SOURCE FAILS OPEN WHEN ITS PATTERN BREAKS (CLAUDE.md,
// 2026-08-21), so every shape below carries a planted specimen the test asserts
// it matches, every regex is a LITERAL rather than assembled from a string, and
// the walk itself is asserted to have read real files. A scan reporting zero
// violations is otherwise indistinguishable from a scan that never ran.
//
// THIS FILE IS NOT IN THE SCANNED POPULATION — the walk is `src/` only — which
// is why it may hold the specimens. A scanner cannot scan its own fixtures.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SRC = join(PKG, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : name.endsWith(".ts")
        ? [full]
        : [];
  });
}

/**
 * Length-preserving comment blanking.
 *
 * LOCAL, NOT IMPORTED FROM `tests/support/app-surface.ts`, and the reason is
 * dependency rather than preference: that module imports `next/dist/...` and
 * the app's `next.config`, which would drag the whole Next surface into this
 * package's typecheck — the exact coupling this suite exists to prove does not
 * exist. It is three lines, and the "comments really are blanked" case below is
 * its own non-vacuity proof.
 *
 * LINE COMMENTS FIRST: a `/* ... *\/` inside a `//` line would otherwise eat
 * everything to the next block terminator.
 */
function blankComments(src: string): string {
  const noLine = src.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return noLine.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * The shapes that would make this package impure, each with a specimen.
 *
 * `node:crypto` is DELIBERATELY ABSENT from the ban and its absence is not an
 * oversight: `bundle.ts` uses `createHash` for the prompt-bundle digest, which
 * is deterministic and touches nothing. The RANDOM half of that module is
 * banned by name below, because a random value is exactly the impurity a
 * blanket `node:crypto` ban would have been reaching for.
 */
const FORBIDDEN: readonly { id: string; pattern: RegExp; specimen: string }[] = [
  {
    id: "the database, by package name",
    pattern: /from\s+["'][^"']*@respin\/db/,
    specimen: 'import { brainDocs } from "@respin/db";',
  },
  {
    id: "the database, by an aliased path",
    pattern: /from\s+["'][^"']*packages\/db/,
    specimen: 'import { x } from "@/packages/db/src/client";',
  },
  {
    id: "the database, by a relative climb",
    // The specifier-shape hole eslint's CROSS_PACKAGE_DENY closes, asserted
    // here too: a rule anchored to a package NAME is bypassable by spelling
    // the same module as a path.
    pattern: /from\s+["']\.\.\/\.\.\/db\//,
    specimen: 'import { x } from "../../db/src/brain-content";',
  },
  {
    id: "fetch",
    pattern: /\bfetch\s*\(/,
    specimen: "const r = await fetch(url);",
  },
  {
    id: "node http",
    pattern: /from\s+["']node:https?["']/,
    specimen: 'import { request } from "node:https";',
  },
  {
    id: "the vendor SDK",
    pattern: /from\s+["']@anthropic-ai\/sdk["']/,
    specimen: 'import Anthropic from "@anthropic-ai/sdk";',
  },
  {
    id: "the clock (Date.now)",
    pattern: /\bDate\s*\.\s*now\s*\(/,
    specimen: "const t = Date.now();",
  },
  {
    id: "the clock (new Date)",
    pattern: /\bnew\s+Date\s*\(/,
    specimen: "const d = new Date();",
  },
  {
    id: "the clock (performance)",
    pattern: /\bperformance\s*\.\s*now\s*\(/,
    specimen: "const t = performance.now();",
  },
  {
    id: "randomness (Math.random)",
    pattern: /\bMath\s*\.\s*random\s*\(/,
    specimen: "const r = Math.random();",
  },
  {
    id: "randomness (crypto)",
    pattern: /\brandom(UUID|Bytes|Int)\b/,
    specimen: "const id = randomUUID();",
  },
  {
    id: "a regex assembled from a STRING LITERAL",
    // CLAUDE.md 2026-08-21: "never build its regex from a string literal, where
    // one lost backslash turns `\s` into `s` and the scan silently matches
    // nothing". `traceability.ts` clones a literal via `new RegExp(p.source,
    // p.flags)` to get a fresh `lastIndex`; that is not this shape and does not
    // match, because the argument is not a quoted string.
    pattern: /new\s+RegExp\s*\(\s*["'`]/,
    specimen: 'const re = new RegExp("[a-z]+\\s");',
  },
  {
    id: "the filesystem",
    pattern: /from\s+["']node:fs/,
    specimen: 'import { readFileSync } from "node:fs";',
  },
  {
    id: "a child process",
    // THE IMPORT, not the call names, and the reason is a real collision:
    // `tests/import-boundary.test.ts` scans every test file in this repo for
    // `execFileSync|execSync|spawnSync` and its scan does not blank STRING
    // LITERALS, so a specimen spelling one of those names would make this
    // package's own suite an offender in that guard. The import is the only
    // route to a child process anyway, and the positive "only node:crypto is
    // imported" assertion below covers the class a second time.
    pattern: /from\s+["']node:child_process["']/,
    specimen: 'import { execFile } from "node:child_process";',
  },
];

describe("the scan reads real files", () => {
  const files = walk(SRC);

  it("found this package's modules", () => {
    // A walk that found nothing would report a clean scan forever.
    expect(files.length).toBeGreaterThanOrEqual(8);
    const total = files.reduce(
      (n, f) => n + readFileSync(f, "utf8").length,
      0
    );
    expect(total).toBeGreaterThan(20_000);
  });

  it("blanks comments, so a docblock NAMING an impurity is not one", () => {
    // These files discuss `@respin/db` constantly — the whole design note is
    // about not depending on it. A scan that read comments would refuse the
    // package for explaining itself.
    const planted =
      '// import { brainDocs } from "@respin/db";\n/* const t = Date.now(); */\nconst ok = 1;\n';
    const blanked = blankComments(planted);
    expect(/from\s+["'][^"']*@respin\/db/.test(blanked)).toBe(false);
    expect(/\bDate\s*\.\s*now\s*\(/.test(blanked)).toBe(false);
    expect(blanked).toContain("const ok = 1;");
    expect(blanked.length).toBe(planted.length);
  });
});

describe("NON-VACUITY: every banned shape matches its planted specimen", () => {
  it.each(FORBIDDEN.map((f) => [f.id, f] as const))("%s", (_id, shape) => {
    expect(shape.pattern.test(shape.specimen)).toBe(true);
  });
});

describe("R2: no source file in this package is impure", () => {
  const sources = walk(SRC).map(
    (f) => [f.replace(PKG, ""), blankComments(readFileSync(f, "utf8"))] as const
  );

  it.each(FORBIDDEN.map((f) => [f.id, f] as const))(
    "no %s",
    (_id, shape) => {
      const offenders = sources
        .filter(([, src]) => shape.pattern.test(src))
        .map(([name]) => name);
      expect(offenders).toEqual([]);
    }
  );

  it("the one sanctioned node import is the DETERMINISTIC half of crypto", () => {
    // Stated positively rather than by the absence of a ban: `createHash` is
    // the only `node:` import in this package, and it is what the prompt-bundle
    // digest is built from.
    // Separators normalised, so this reads the same on Windows and on CI.
    const nodeImports = sources.flatMap(([name, src]) =>
      [...src.matchAll(/from\s+"(node:[^"]+)"/g)].map(
        (m) => name.replace(/\\/g, "/") + " -> " + m[1]
      )
    );
    expect(nodeImports).toEqual(["/src/bundle.ts -> node:crypto"]);
  });
});

describe("R6: the one-rewrite bound is structural, not a loop condition", () => {
  // `pipeline.ts`'s header makes a STRUCTURAL CLAIM ("exactly two `await
  // generate(...)` and no iteration construct"). Golden rule 1: a structural
  // claim is proven by running it, not by an argument in a comment.
  const src = blankComments(readFileSync(join(SRC, "pipeline.ts"), "utf8"));

  it("calls the vendor from exactly TWO places", () => {
    expect([...src.matchAll(/await\s+generate\s*\(/g)]).toHaveLength(2);
  });

  it("contains no loop at all", () => {
    expect(/\bfor\s*\(/.test(src), "a for loop").toBe(false);
    expect(/\bwhile\s*\(/.test(src), "a while loop").toBe(false);
    expect(/\bdo\s*\{/.test(src), "a do-while loop").toBe(false);
  });

  it("NON-VACUITY: those patterns catch planted versions of each", () => {
    // This assertion has already earned its place once: an editing pass turned
    // the word-boundary escape in the three patterns above into a literal
    // BACKSPACE, so "no loop at all" passed by matching nothing -- the exact
    // 2026-08-21 shape, caught here rather than in review.
    expect(/await\s+generate\s*\(/.test("const r = await generate(p, 1);")).toBe(true);
    expect(/\bfor\s*\(/.test("for (let i = 0; i < 5; i++) {}")).toBe(true);
    expect(/\bwhile\s*\(/.test("while (findings.length) {}")).toBe(true);
    expect(/\bdo\s*\{/.test("do { retry(); } while (bad);")).toBe(true);
  });
});

describe("R5: the hard gates take no model input, structurally", () => {
  // A LIST, and adding a gate costs a line here (CLAUDE.md, 2026-08-29): a
  // population written as one path narrows silently the day a second appears.
  // `claims.ts` is the fifth rule's gate and joined this list with it.
  // `mode-checks.ts` joined it in slice 7, and paying that line is the whole
  // point of writing the population as a list: the per-mode checks decide
  // whether a draft reaches a creator exactly as the other three do.
  const GATE_FILES = [
    "hard-rules.ts",
    "traceability.ts",
    "claims.ts",
    "mode-checks.ts",
  ];

  it("neither gate file is async, and neither names the scorer", () => {
    // A hard integrity rule decided by a model is a rule that can be talked out
    // of firing. There is nowhere in these two files for a vendor reply to
    // reach a verdict: no `await`, no `async`, and no reference to the creator-
    // rule scoring at all.
    for (const name of GATE_FILES) {
      const src = blankComments(readFileSync(join(SRC, name), "utf8"));
      expect(/\basync\b/.test(src), name + " is async").toBe(false);
      expect(/\bawait\b/.test(src), name + " awaits").toBe(false);
      expect(/scoreCreatorRules|CreatorRuleVerdict|LlmProvider/.test(src), name).toBe(
        false
      );
    }
  });

  it("NON-VACUITY: those patterns catch a planted violation", () => {
    const planted =
      "export async function scan() { return await scoreCreatorRules(x); }";
    expect(/\basync\b/.test(planted)).toBe(true);
    expect(/\bawait\b/.test(planted)).toBe(true);
    expect(/scoreCreatorRules|CreatorRuleVerdict|LlmProvider/.test(planted)).toBe(
      true
    );
  });
});

describe("the manifest agrees with the scan", () => {
  const pkg = JSON.parse(
    readFileSync(join(PKG, "package.json"), "utf8")
  ) as {
    name: string;
    dependencies: Record<string, string>;
  };

  it("declares no dependency on @respin/db", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@respin/llm", "zod"]);
  });

  it("is the package the import boundary denies by name", () => {
    expect(pkg.name).toBe("@respin/modes");
  });
});
