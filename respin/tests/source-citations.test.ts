// A COMMENT THAT CITES A TEST FILE CITES A FILE THAT EXISTS.
//
// THE DEFECT THIS CLOSES (learning-honesty gate, 2026-09-01). Five comments in
// slice 7 cited a `lineage-feedback.docker` variant of the lineage suite. No
// such file has ever existed — the real one carries no `.docker` in its name —
// and one of the five is the R11 feedback-boundary scan's own header, which is
// exactly where its STATED HONEST LIMIT hands off the behavioural proof:
//
//   "That a UI and an export return RAW SCOPED EVENTS is a behavioural
//    property and is proved separately, in <file> — not here."
//
// A limit that names its compensating control, pointing at nothing, is the
// worst place in the repo for this typo to live: a reader checking whether the
// scan's admitted weakness is covered finds no file and cannot tell whether the
// proof is missing or merely misnamed. `decisions.md` cited the correct path,
// so the source comments were the stale half.
//
// WHY THIS IS A CLASS AND NOT A TYPO. CLAUDE.md's first golden rule is that a
// claim you RECORD is verified against the file it names in the same action
// that records it — and nothing in this repo checked that a recorded filename
// resolves. Renaming a test file is an ordinary act; every comment naming it
// goes stale silently, and the suite stays green.
//
// SCOPE, STATED PLAINLY: this checks EXISTENCE, never that the named test
// asserts what the comment says it asserts. That second half is a person's job
// and this file does not pretend to do it.
//
// AND IT CHECKS FILES, NEVER SYMBOLS — which is a hole this file's own scope
// statement described and nothing closed, until a deleted money-counting
// accessor left eight comments naming it as a live authority (R-81, the
// billing and tenancy gates of 2026-09-02). The symbol half is
// `tests/symbol-citations.test.ts`, built the same way and measured the same
// way; the two are siblings, not one file, because their populations and
// their false-positive filters are different.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The trees scanned, as a LIST.
 *
 * A population written as one path narrows silently the day a second appears
 * (CLAUDE.md 2026-08-29), so adding a tree is a deliberate edit here.
 *
 * THESE FIVE TREES ARE NOT THE WHOLE POPULATION, AND SAYING SO WAS THIS FILE'S
 * OWN INSTANCE OF THE LESSON IT CITES (billing gate round 2, 2026-09-02). The
 * docblock claimed they were "every tree that holds hand-written TypeScript in
 * this workspace" — and `middleware.ts`, `next.config.ts` and
 * `vitest.config.ts` sit at the workspace ROOT, in no tree at all. That was
 * not hypothetical: `vitest.config.ts` carries a paragraph that exists BECAUSE
 * an earlier version of it cited a key that does not exist, i.e. a live
 * instance of this class sitting outside the guard written to close it. The
 * root files are scanned by `rootSources` below; the population is these
 * trees PLUS that one non-recursive pass.
 */
const SCANNED_ROOTS: readonly string[] = [
  "packages",
  "app",
  "tests",
  "lib",
  "scripts",
];

/**
 * Root-level files that are GENERATED, not hand-written.
 *
 * `next-env.d.ts` is written by Next and says so in its own body ("This file
 * should not be edited"); it holds three `///` references and no comment
 * anybody wrote. Named one file at a time rather than as a `*.d.ts` pattern,
 * so a hand-written declaration file at the root would still be scanned.
 */
const SKIP_ROOT_FILES = new Set(["next-env.d.ts"]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  "migrations",
]);

/**
 * Citations this pass did NOT fix, each with its owner and the reason.
 *
 * NAMED AND DATED, never a prefix or a directory. An entry is deleted by
 * whoever fixes it, so the list shrinks rather than becoming furniture; an
 * entry that outlives its citation costs a line, and an entry nobody records
 * costs the guard.
 *
 * EMPTY, AND THAT IS A RESULT RATHER THAN A DEFAULT (slice 7 cross-boundary
 * pass, 2026-09-01). All four entries this file shipped with are closed, and
 * they closed two different ways, which is worth recording because only one of
 * them was a typo:
 *
 *   `packages/credits/src/profiles.ts` cited the right file at the top and
 *   then SPELLED OUT the wrong historical path as an example of the mistake.
 *   The prose now describes that path instead of naming it — the same move
 *   this file's own header had to make on itself, and for the same reason: a
 *   scan that resolves every filename in a comment cannot tell a citation from
 *   a cautionary tale.
 *
 *   `packages/llm`'s three named guards that DID NOT EXIST — an absent guard
 *   described as present, which is a bigger finding than a wrong path. They
 *   were closed by WRITING the guards at the paths the comments name:
 *   `packages/llm/tests/boundary.test.ts` (the vendor SDK is imported by
 *   exactly one file, read through the TypeScript parser so a mention in a
 *   comment is not an import) and `packages/llm/tests/no-text.test.ts` (no
 *   constructor parameter in `errors.ts` can carry free text). Writing the
 *   second one corrected the claim it was written to defend: `errors.ts` said
 *   "there is no parameter that can carry vendor or creator text" and the file
 *   had three string parameters. They are exempted BY NAME with a behavioural
 *   case each, and the header now says what is true.
 *
 * The list stays because the next stale citation needs somewhere to be
 * recorded, not because anything is owed today.
 */
const CITATIONS_OWED: readonly string[] = [];

/**
 * A citation: anything shaped like a path to a `*.test.ts(x)` file.
 *
 * A REGEXP LITERAL, never assembled from a string — one lost backslash turns
 * the rule into a pattern that matches nothing and the scan reports "no stale
 * citations" because it found no citations at all (CLAUDE.md 2026-08-21). The
 * non-vacuity cases below plant one of each shape.
 *
 * The lookbehind stops a match starting mid-path, so a citation written inside
 * parentheses yields the path and not the paren; the leading `[A-Za-z0-9_]`
 * stops a bare `.docker.` suffix fragment being read as a whole filename.
 *
 * THIS FILE IS INSIDE ITS OWN POPULATION, which is deliberate and cost
 * something: the first draft named every stale path in prose and the real-repo
 * case went red on its own comments. Naming them in STRING literals (which the
 * parser filter excludes) and describing them in words is the version that
 * holds — a guard exempting itself is the hole this repo has paid for.
 */
const CITATION = /(?<![A-Za-z0-9_./()-])[A-Za-z0-9_][A-Za-z0-9_./()-]*\.test\.tsx?/g;

type Citation = { file: string; cited: string };

/**
 * Spans that are STRING OR TEMPLATE LITERALS, from a real parse.
 *
 * THE DISCRIMINATOR BETWEEN A CITATION AND A FIXTURE. `tests/import-boundary`,
 * `tests/profile-cage` and `tests/probe-artifacts` all plant IN-MEMORY files at
 * paths that deliberately do not exist — that is how those scans prove
 * themselves non-vacuous. Those paths are string literals in code; a citation
 * is prose in a comment. Using
 * the parser rather than a regex for the difference is what makes this rule a
 * property instead of a heuristic: the scan measured 140 "stale" paths before
 * this filter and 8 after, and every one of the 132 was a planted fixture or a
 * `.tsx` file matched as `.ts`.
 */
function literalSpans(sf: ts.SourceFile): [number, number][] {
  const spans: [number, number][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      spans.push([node.getStart(sf), node.getEnd()]);
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return spans;
}

/** Every test-file citation in a set of sources, outside string literals. */
export function scanCitations(files: Map<string, string>): Citation[] {
  const out: Citation[] = [];
  for (const [file, raw] of files) {
    const sf = ts.createSourceFile(
      file,
      raw,
      ts.ScriptTarget.Latest,
      true,
      /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const spans = literalSpans(sf);
    const seen = new Set<string>();
    for (const match of raw.matchAll(CITATION)) {
      const index = match.index ?? 0;
      if (spans.some(([a, b]) => index >= a && index < b)) continue;
      const cited = match[0].replace(/^respin\//, "");
      if (seen.has(cited)) continue;
      seen.add(cited);
      out.push({ file, cited });
    }
  }
  return out;
}

/**
 * Does a citation resolve? Three ways, and each is a real convention here.
 *
 *  - REPO-RELATIVE (`packages/db/tests/frameworks.test.ts`) — how a comment in
 *    one package names a test in another.
 *  - PACKAGE-RELATIVE — a bare `tests/<name>` path inside `packages/<pkg>/`,
 *    which is the dominant idiom in package sources and the reason a naive
 *    repo-root-only scan reports 18 false positives.
 *  - A BARE BASENAME (`lineage-feedback.test.ts`) — how a comment names a
 *    sibling. Two of the five stale citations were this shape, which is why the
 *    rule cannot require a slash.
 */
function resolves(
  citation: Citation,
  basenames: ReadonlySet<string>
): boolean {
  if (!citation.cited.includes("/")) return basenames.has(citation.cited);
  if (existsSync(join(ROOT, citation.cited))) return true;
  const pkg = citation.file.startsWith("packages/")
    ? citation.file.split("/").slice(0, 2).join("/")
    : null;
  return pkg !== null && existsSync(join(ROOT, pkg, citation.cited));
}

function sources(dir: string, acc: Map<string, string> = new Map()) {
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
      // Sibling suites write and delete probe files and vitest runs files in
      // parallel — the reason `table-writers.test.ts` swallows ENOENT and
      // nothing else.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (entry.isDirectory()) sources(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) {
      try {
        acc.set(relative(ROOT, full).split(sep).join("/"), readFileSync(full, "utf8"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
    }
  }
  return acc;
}

/**
 * The workspace root's OWN TypeScript files, NON-RECURSIVELY.
 *
 * Non-recursive because the directories below the root are either already in
 * `SCANNED_ROOTS` or deliberately skipped (`node_modules`, `.next`), and a
 * recursive pass here would silently re-scan both.
 */
function rootSources(acc: Map<string, string>): Map<string, string> {
  for (const name of readdirSync(ROOT)) {
    if (SKIP_ROOT_FILES.has(name)) continue;
    if (!/\.(ts|tsx)$/.test(name)) continue;
    const full = join(ROOT, name);
    try {
      if (!statSync(full).isFile()) continue;
      acc.set(name, readFileSync(full, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return acc;
}

const allSources = () => {
  const acc = new Map<string, string>();
  for (const root of SCANNED_ROOTS) sources(join(ROOT, root), acc);
  return rootSources(acc);
};

describe("the citation scan is not vacuous", () => {
  const basenames = new Set(
    [...allSources().keys()].map((f) => basename(f)).filter((f) => /\.test\.tsx?$/.test(f))
  );

  it("sees a PLANTED stale citation of every shape it claims to cover", () => {
    const SHAPES: [string, string, string][] = [
      [
        "repo-relative",
        "packages/db/src/x.ts",
        "// see `packages/db/tests/nope-there-is-no-such.test.ts` for the proof\n",
      ],
      [
        "package-relative",
        "packages/db/src/x.ts",
        "// driven in `tests/nope-there-is-no-such.test.ts`\n",
      ],
      [
        "bare basename",
        "packages/db/src/x.ts",
        "// `nope-there-is-no-such.test.ts` asserts it\n",
      ],
      [
        "a .tsx citation",
        "app/(product)/x.ts",
        "// `tests/nope-there-is-no-such.test.tsx` renders it\n",
      ],
      [
        "in a trailing comment",
        "tests/x.ts",
        "const a = 1; // `nope-there-is-no-such.test.ts`\n",
      ],
      [
        // The shape the population fix added: a file at the workspace ROOT, in
        // none of the five trees.
        "a workspace-root file",
        "vitest.config.ts",
        "// the ordering is proved in `tests/nope-there-is-no-such.test.ts`\n",
      ],
    ];
    for (const [label, file, src] of SHAPES) {
      const found = scanCitations(new Map([[file, src]]));
      expect(found.length, `${label}: the citation was not extracted at all`).toBe(1);
      expect(
        resolves(found[0], basenames),
        `${label}: a citation to a file that does not exist was reported as resolving`
      ).toBe(false);
    }
  });

  it("...and a REAL citation of every shape resolves", () => {
    // The other direction, which is what stops "no stale citations" being
    // satisfied by a rule that calls everything stale or extracts nothing.
    const REAL: [string, string, string][] = [
      [
        "repo-relative",
        "packages/db/src/x.ts",
        "// `packages/db/tests/frameworks.test.ts` drives it\n",
      ],
      ["package-relative", "packages/db/src/x.ts", "// `tests/frameworks.test.ts` drives it\n"],
      ["bare basename", "packages/db/src/x.ts", "// `frameworks.test.ts` drives it\n"],
      ["repo tree", "app/(product)/x.ts", "// `tests/studio-ui.test.tsx` renders it\n"],
    ];
    for (const [label, file, src] of REAL) {
      const found = scanCitations(new Map([[file, src]]));
      expect(found.length, label).toBe(1);
      expect(resolves(found[0], basenames), `${label}: ${found[0].cited}`).toBe(true);
    }
  });

  it("THE POPULATION really includes the workspace ROOT (billing gate round 2)", () => {
    // The five trees are not the whole population, and the docblock used to
    // say they were. Read from the real tree: if `rootSources` stops running,
    // or the root files move, this fails rather than the guard silently
    // narrowing back to where it started.
    const files = allSources();
    for (const rootFile of ["middleware.ts", "next.config.ts", "vitest.config.ts"]) {
      expect(
        files.has(rootFile),
        `${rootFile} is hand-written TypeScript at the workspace root and is not being scanned`
      ).toBe(true);
    }
    // ...and the generated one is still excluded, so the skip is a decision
    // rather than an accident of the glob.
    expect(files.has("next-env.d.ts")).toBe(false);
    // The root pass is NON-RECURSIVE: nothing under `.next/` may enter, and it
    // is full of generated `.ts`.
    expect([...files.keys()].filter((f) => f.startsWith(".next"))).toEqual([]);
  });

  it("a path in a STRING LITERAL is a fixture, not a citation", () => {
    // `tests/import-boundary`, `tests/profile-cage` and `tests/probe-artifacts`
    // plant in-memory files at paths that deliberately do not exist — that is
    // how they prove themselves non-vacuous. Treating those as citations would
    // make this scan report 132 findings it cannot act on.
    expect(
      scanCitations(
        new Map([
          [
            "tests/x.ts",
            [
              'const planted = new Map([["packages/credits/tests/anything.test.ts", "x"]]);',
              'const p = `packages/db/tests/${name}.test.ts`;',
              "void planted; void p;",
            ].join("\n"),
          ],
        ])
      )
    ).toEqual([]);
  });
});

describe("THE REAL REPO: every cited test file exists", () => {
  it("no comment names a test file that is not there", () => {
    const files = allSources();
    // Non-vacuity against the repo itself: the scan really read the trees and
    // really found citations. Without these the assertion below passes on a
    // scan that broke.
    expect(files.size, "the scan read nothing").toBeGreaterThan(100);
    const citations = scanCitations(files);
    expect(
      citations.length,
      "the scan found NO citations at all — the pattern is broken, not the repo"
    ).toBeGreaterThan(50);
    const basenames = new Set(
      [...files.keys()].map((f) => basename(f)).filter((f) => /\.test\.tsx?$/.test(f))
    );
    const stale = citations
      .filter((c) => !resolves(c, basenames))
      .map((c) => `${c.file} -> ${c.cited}`);
    expect(
      stale.filter((s) => !CITATIONS_OWED.includes(s)),
      "a comment cites a test file that does not exist — fix the path, or add it to CITATIONS_OWED with an owner and a reason"
    ).toEqual([]);
  });

  it("the five slice-7 citations this pass fixed really resolve now", () => {
    // The INSTANCE, pinned beside the class. The `.docker` variant never
    // existed; the plain one does, and it carries every
    // assertion the five comments claim (verified by reading it in the same
    // action that rewrote them: the raw column-for-column read, the enum/array
    // set equality, the future-stamped-parent false branch, and the stored
    // parent id equalling the requested one).
    expect(
      existsSync(join(ROOT, "packages/db/tests/lineage-feedback.test.ts"))
    ).toBe(true);
    expect(
      existsSync(join(ROOT, "packages/db/tests/lineage-feedback.docker.test.ts")),
      "the docker variant exists after all — then the five comments were right and this pass was wrong"
    ).toBe(false);
    for (const file of [
      "packages/db/src/feedback-ops.ts",
      "packages/db/src/generation-schema.ts",
      "packages/db/src/with-workspace.ts",
      "tests/feedback-readers.test.ts",
    ]) {
      expect(
        readFileSync(join(ROOT, file), "utf8"),
        `${file} still cites the file that does not exist`
      ).not.toContain("lineage-feedback.docker.test.ts");
    }
  });
});
