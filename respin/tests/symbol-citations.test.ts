// A COMMENT THAT NAMES A SYMBOL NAMES A SYMBOL THAT EXISTS.
//
// THE SIBLING OF `tests/source-citations.test.ts`, WHICH CANNOT SEE THIS CLASS
// BY ITS OWN ADMISSION: that file's header states its scope is FILE EXISTENCE,
// never symbols. So a comment could name a function deleted three commits ago
// and every one of this workspace's suites stayed green.
//
// THE DEFECT THIS CLOSES (billing + tenancy gates, 2026-09-02). R-80 deleted a
// money-counting accessor and recorded, in the decision itself, that it was
// deleted rather than left beside its replacement because "a money-counting
// accessor whose whole ordering story was wrong is a trap for the next
// reader" — and then left EIGHT live comments naming it in the present tense
// as the authority the code consults. One of them was the creator-facing
// money-copy file, explaining what the run button does not predict "because
// that would mean a second read of <the deleted accessor> — the same authority
// runInference consults inside its debit transaction". False twice: the symbol
// was gone and the authority had a different name.
//
// WHAT THIS SCAN IS, PRECISELY: a backticked MULTI-WORD identifier written in
// a comment must appear somewhere in this workspace's own TypeScript — as a
// real code token, or as a word inside a string literal (a config key, a gate
// id, a fixture name is still a name this workspace uses). If it appears
// nowhere, either the comment is stale or the name belongs to something
// outside this workspace, and the second case is a line in `KNOWN_ABSENT`.
//
// SCOPE, STATED PLAINLY, THREE WAYS IT IS NARROW:
//   - MULTI-WORD ONLY (a lowercase letter followed by an uppercase one).
//     `snake_case` column names, SCREAMING_SNAKE constants and single words
//     like `true`, `refused`, `drift` are NOT checked — they collide with
//     English and with Postgres, and a rule that flagged them would drown.
//   - EXISTENCE, NEVER MEANING. That a comment's description of a symbol is
//     accurate is a person's job; this file does not pretend to do it.
//   - A NAME KEPT ALIVE BY A STRING SOMEWHERE ELSE RESOLVES. If a deleted
//     function's name survives in a fixture map, this scan is satisfied. That
//     is the price of the filter that removed most of the false positives.
//
// THE MEASUREMENT, because a guard that drowns is a guard nobody keeps
// (`source-citations.test.ts` went from 140 raw hits to 8 real ones and says
// so). Over the same five trees: 3,167 backticked multi-word citations, 815
// distinct. 53 distinct resolved nowhere as code tokens; counting words inside
// string literals as present removed 11 of those; 3 of the remaining 42 were
// REAL stale citations found by writing this file and fixed in the same pass
// (a schema comment pointing at a framework retirement function under a name
// that never existed, an index comment naming the supersede-then-insert pair
// under a name that never existed, and a mock comment naming the burn-period
// derivation under its pre-rename name). The other 40 are below, each one a
// name this workspace deliberately does not declare.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The trees scanned, as a LIST — the same population and the same reason as
 * `tests/source-citations.test.ts`: a population written as one path narrows
 * silently the day a second appears (CLAUDE.md 2026-08-29).
 *
 * AND THE SAME CORRECTION (billing gate round 2, 2026-09-02): the five trees
 * are not the whole population. `middleware.ts`, `next.config.ts` and
 * `vitest.config.ts` are hand-written TypeScript at the workspace ROOT, in no
 * tree at all — and `vitest.config.ts` holds a paragraph that exists BECAUSE
 * an earlier version of it cited a key that does not exist, which is a live
 * instance of exactly this class sitting outside the guard. They are scanned
 * by `rootSources` below, non-recursively.
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
 * should not be edited"). Named one file at a time rather than as a `*.d.ts`
 * pattern, so a hand-written declaration file at the root would still be
 * scanned — and, here, would still contribute its identifiers to the presence
 * corpus.
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
 * THIS FILE IS EXCLUDED FROM THE PRESENCE CORPUS, AND THAT IS THE WHOLE REASON
 * THE GUARD WORKS.
 *
 * `KNOWN_ABSENT` below is a list of names, written as string literals, in a
 * scanned tree. Words inside string literals count as PRESENT — so without
 * this exclusion every name would resolve the moment it was registered, and
 * the registry would be a machine for silencing itself. Its comments are still
 * scanned as citations, so this file stays inside its own population exactly
 * the way `source-citations.test.ts` is inside its own.
 */
const PRESENCE_EXCLUDED = "tests/symbol-citations.test.ts";

/**
 * Names a comment may cite that this workspace does not declare.
 *
 * TWO KINDS, ONE LIST, because the CHECK is the same for both: the entry must
 * name something no file here declares, and it is deleted by whoever makes the
 * name real again (a hygiene case below enforces exactly that, so an entry
 * cannot become furniture).
 *
 * NOT OURS — a runtime global, a vendor SDK, a tool's option, another
 * library's internal. Verified against the citing comment, which in every case
 * names the owner:
 *   `APIStatusError`, `APITimeoutError`, `InternalServerError` — the Anthropic
 *     SDKs' error classes (`packages/llm/src/anthropic.ts` names the Python
 *     SDK as the owner of two of them).
 *   `OtherString`, `PriceUpdateParams` — Stripe SDK types.
 *   `RangeError`, `SyntaxError` — ECMAScript globals.
 *   `RequestInfo`, `RequestInit` — DOM lib types; the citing comment is ABOUT
 *     one of them not resolving under this package's `lib` setting.
 *   `TaggedTemplateExpression`, `TemplateExpression` — TypeScript AST node
 *     names.
 *   `allowImportNames` — an ESLint `no-restricted-imports` option key; it
 *     lives in `eslint.config.mjs`, which is not TypeScript and not scanned.
 *   `getIPFromHeader`, `parseCIDR`, `isDevelopment`, `isTest` — Better Auth
 *     internals.
 *   `onTaskUpdate` — vitest/birpc internal.
 *   `unhandledRejection` — a Node process event name.
 *
 * DELIBERATELY ABSENT FROM THIS WORKSPACE — deleted, renamed, never built, or
 * a name a comment introduces in order to say it does not exist. These are the
 * past-tense narratives the two gates confirmed must STAY:
 *   `countBillableAttempts` — R-80's deleted accessor. Its eight present-tense
 *     citations were fixed; five past-tense ones remain and are correct.
 *   `earlierThanAttemptId`, `excludeAttemptId`, `priorAttempts` — its removed
 *     parameters, narrated where the race was root-caused.
 *   `RunInferenceState`, `runOnboardingInferenceAction` — slice 2a's retired
 *     run state and server action.
 *   `activeBrainDocs`, `onboardingInputsForExport`,
 *     `acquireWorkspaceExportLock`, `exportBrain`, `exportBrainFile`,
 *     `withPreparedExport`, `markdownFor` — the export readers and accessors
 *     deleted in slice 5.
 *   `collectQueryObjects`, `isQueryApiRead` — the two resolvers the 2026-09-02
 *     feedback-reader scan replaced with one.
 *   `setupStripeProducts` — a symbol an isolation suite records it no longer
 *     lists.
 *   `isPaused` — the injected pause predicate two gates rejected; it never
 *     shipped, and both comments naming it exist to say why.
 *   `burnPeriodStart` — the burn-period derivation's pre-rename name, in the
 *     one comment that narrates the defect the rename came with.
 *   `assertStoredConfigKeys` — a name a comment gives in order to record that
 *     it has never existed.
 *   `poolOptions` — a vitest config key `vitest.config.ts` records it does NOT
 *     set. THE FIRST FINDING OF THE ROOT-LEVEL PASS (billing gate round 2,
 *     2026-09-02): that paragraph exists because an earlier version of it
 *     cited the key as if the block were there, so the workspace's one live
 *     instance of this class was sitting outside the guard's population until
 *     `rootSources` was added.
 *   `trustGenerationId`, `reactivateProfile` — one asserted never to exist,
 *     one owed by a future slice.
 *   `fullScrpit` — a deliberate misspelling, the cautionary tale in a comment
 *     about what a plan gate must not say to a typo.
 */
const KNOWN_ABSENT: readonly string[] = [
  "APIStatusError",
  "APITimeoutError",
  "InternalServerError",
  "OtherString",
  "PriceUpdateParams",
  "RangeError",
  "RequestInfo",
  "RequestInit",
  "RunInferenceState",
  "SyntaxError",
  "TaggedTemplateExpression",
  "TemplateExpression",
  "acquireWorkspaceExportLock",
  "activeBrainDocs",
  "allowImportNames",
  "assertStoredConfigKeys",
  "burnPeriodStart",
  "collectQueryObjects",
  "countBillableAttempts",
  "earlierThanAttemptId",
  "excludeAttemptId",
  "exportBrain",
  "exportBrainFile",
  "fullScrpit",
  "getIPFromHeader",
  "isDevelopment",
  "isPaused",
  "isQueryApiRead",
  "isTest",
  "markdownFor",
  "onTaskUpdate",
  "onboardingInputsForExport",
  "parseCIDR",
  "poolOptions",
  "priorAttempts",
  "reactivateProfile",
  "runOnboardingInferenceAction",
  "setupStripeProducts",
  "trustGenerationId",
  "unhandledRejection",
  "withPreparedExport",
];

/**
 * A symbol citation: a backticked identifier with a lower-to-upper transition.
 *
 * A REGEXP LITERAL, never assembled from a string — one lost backslash turns
 * the rule into a pattern that matches nothing, and a scan reporting zero
 * findings is indistinguishable from a scan that is broken (CLAUDE.md
 * 2026-08-21). The non-vacuity cases below plant one of each shape.
 */
const SYMBOL_CITATION = /`([A-Za-z_$][A-Za-z0-9_$]*)`/g;
const MULTI_WORD = /[a-z][A-Z]/;

type SymbolCitation = { file: string; cited: string };

/** Spans that are STRING OR TEMPLATE LITERALS, from a real parse. */
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

function parse(file: string, raw: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    raw,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

/**
 * Every name this workspace USES: identifiers from a real parse, plus the
 * identifier-shaped words inside string literals.
 *
 * THE SECOND HALF IS WHAT STOPS THE SCAN DROWNING. A version-bundle part id, a
 * config key and an eslint option are all names written as data, and flagging
 * them would have added eleven findings nobody can act on.
 */
export function presentNames(files: Map<string, string>): Set<string> {
  const WORD = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  const names = new Set<string>();
  for (const [file, raw] of files) {
    if (file === PRESENCE_EXCLUDED) continue;
    const sf = parse(file, raw);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
        names.add(node.text);
      } else if (ts.isStringLiteralLike(node)) {
        for (const w of node.text.matchAll(WORD)) names.add(w[0]);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }
  return names;
}

/** Every symbol citation in a set of sources, outside string literals. */
export function scanSymbolCitations(
  files: Map<string, string>
): SymbolCitation[] {
  const out: SymbolCitation[] = [];
  for (const [file, raw] of files) {
    const spans = literalSpans(parse(file, raw));
    const seen = new Set<string>();
    for (const match of raw.matchAll(SYMBOL_CITATION)) {
      const index = match.index ?? 0;
      if (spans.some(([a, b]) => index >= a && index < b)) continue;
      const cited = match[1];
      if (!MULTI_WORD.test(cited)) continue;
      if (seen.has(cited)) continue;
      seen.add(cited);
      out.push({ file, cited });
    }
  }
  return out;
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
      // Sibling suites write and delete probe files while vitest runs files in
      // parallel — the same ENOENT tolerance `source-citations.test.ts` keeps.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (entry.isDirectory()) sources(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) {
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

// MEMOISED, not because parsing is expensive to write but because it is
// expensive to repeat: six readers plus five presence passes over five trees
// cost 12s unmemoised, and a guard that slows the suite is a guard somebody
// eventually skips.
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

let sourcesCache: Map<string, string> | null = null;
const allSources = () => {
  if (sourcesCache) return sourcesCache;
  const acc = new Map<string, string>();
  for (const root of SCANNED_ROOTS) sources(join(ROOT, root), acc);
  sourcesCache = rootSources(acc);
  return sourcesCache;
};

let presenceCache: Set<string> | null = null;
const presentInRepo = () => (presenceCache ??= presentNames(allSources()));

describe("the symbol-citation scan is not vacuous", () => {
  it("sees a PLANTED citation of a symbol nothing declares, in every comment shape", () => {
    const SHAPES: [string, string, string][] = [
      [
        "line comment",
        "packages/db/src/x.ts",
        "// the authority is `noSuchAuthorityHere`, consulted at the debit\n",
      ],
      [
        "docblock",
        "packages/db/src/x.ts",
        "/**\n * Priced from `noSuchAuthorityHere`.\n */\n",
      ],
      [
        "trailing comment",
        "tests/x.ts",
        "const a = 1; // see `noSuchAuthorityHere`\n",
      ],
      [
        "a .tsx file",
        "app/(product)/x.tsx",
        "// rendered from `noSuchAuthorityHere`\n",
      ],
      [
        // The shape the population fix added: a file at the workspace ROOT, in
        // none of the five trees.
        "a workspace-root file",
        "vitest.config.ts",
        "// the timeout comes from `noSuchAuthorityHere`\n",
      ],
    ];
    const present = presentInRepo();
    for (const [label, file, src] of SHAPES) {
      const found = scanSymbolCitations(new Map([[file, src]]));
      expect(
        found.map((f) => f.cited),
        `${label}: the citation was not extracted at all`
      ).toEqual(["noSuchAuthorityHere"]);
      expect(
        present.has(found[0].cited),
        `${label}: a symbol nothing declares was reported as present`
      ).toBe(false);
    }
  });

  it("...and a REAL symbol resolves — the scan does not simply call everything stale", () => {
    const present = presentInRepo();
    for (const real of [
      "reconcileSpend",
      "recordModelUsage",
      "firstBillableAttempts",
      "withWorkspace",
      "priceOf",
    ]) {
      expect(
        present.has(real),
        `${real} is a live export and did not resolve`
      ).toBe(true);
    }
  });

  it("THE POPULATION really includes the workspace ROOT (billing gate round 2)", () => {
    // The five trees are not the whole population, and the docblock used to
    // say they were — while `vitest.config.ts` held the workspace's one live
    // instance of this class (`poolOptions`, now in KNOWN_ABSENT). Read from
    // the real tree, so the guard cannot narrow back silently.
    const files = allSources();
    for (const rootFile of ["middleware.ts", "next.config.ts", "vitest.config.ts"]) {
      expect(
        files.has(rootFile),
        `${rootFile} is hand-written TypeScript at the workspace root and is not being scanned`
      ).toBe(true);
    }
    expect(files.has("next-env.d.ts")).toBe(false);
    expect([...files.keys()].filter((f) => f.startsWith(".next"))).toEqual([]);
    // The root files are in the PRESENCE corpus too, which is the half that
    // stops a name declared only at the root reading as stale everywhere else.
    expect(presentInRepo().has("isProtectedPath")).toBe(true);
  });

  it("a backticked name inside a STRING LITERAL is not a citation", () => {
    // Every planted fixture in `tests/import-boundary`, `tests/profile-cage`
    // and the sibling citation scan writes source as string literals. Reading
    // those as citations would report findings nobody can act on.
    expect(
      scanSymbolCitations(
        new Map([
          [
            "tests/x.ts",
            'const planted = "// see `noSuchAuthorityHere` for the proof";\nvoid planted;',
          ],
        ])
      )
    ).toEqual([]);
  });

  it("a SINGLE-WORD name is out of scope, deliberately and visibly", () => {
    // Stated in the header and asserted here so the limit is a fact rather
    // than a sentence: `refused`, `drift` and `profile_id` are English and SQL
    // before they are symbols.
    expect(
      scanSymbolCitations(
        new Map([
          ["tests/x.ts", "// `refused` and `profile_id` and `zzznotasymbol`\n"],
        ])
      )
    ).toEqual([]);
  });

  it("THE SELF-DEFEAT CASE: this file's own registry does not count as declaring anything", () => {
    // Without `PRESENCE_EXCLUDED` every registered name would resolve the
    // moment it was written down, and the guard would be a machine for
    // silencing itself. Read from the real tree, not from a fixture.
    const files = allSources();
    expect(
      files.has(PRESENCE_EXCLUDED),
      "this file is not in the scanned population — the exclusion is guarding nothing"
    ).toBe(true);
    const present = presentInRepo();
    for (const absent of KNOWN_ABSENT) {
      expect(
        present.has(absent),
        `${absent} resolved only because this file lists it`
      ).toBe(false);
    }
  });
});

describe("THE REAL REPO: every cited symbol exists, or is registered as absent", () => {
  it("no comment names a multi-word symbol that is nowhere in this workspace", () => {
    const files = allSources();
    // Non-vacuity against the repo itself: the scan really read the trees and
    // really found citations. Without these the assertion below passes on a
    // scan that broke.
    expect(files.size, "the scan read nothing").toBeGreaterThan(100);
    const citations = scanSymbolCitations(files);
    expect(
      citations.length,
      "the scan found NO symbol citations at all — the pattern is broken, not the repo"
    ).toBeGreaterThan(500);
    const present = presentInRepo();
    const stale = citations
      .filter((c) => !present.has(c.cited) && !KNOWN_ABSENT.includes(c.cited))
      .map((c) => `${c.file} -> ${c.cited}`);
    expect(
      stale,
      "a comment names a symbol this workspace does not have — fix the name, or add it to KNOWN_ABSENT with its owner and reason"
    ).toEqual([]);
  });

  it("every KNOWN_ABSENT entry is still absent — the registry cannot become furniture", () => {
    // The half that makes the list shrink. A name that becomes real again is
    // an entry that now hides a live symbol from the check, so it must be
    // deleted rather than left.
    const present = presentInRepo();
    expect(
      KNOWN_ABSENT.filter((name) => present.has(name)),
      "these names exist again — delete their KNOWN_ABSENT entries"
    ).toEqual([]);
    expect([...KNOWN_ABSENT].sort()).toEqual([...KNOWN_ABSENT]);
  });

  it("THE INSTANCE: R-80's deleted accessor is not cited as a live authority anywhere", () => {
    // The eight present-tense citations the two gates found, pinned beside the
    // class. The name stays in five PAST-TENSE narratives, which are correct
    // and must stay — so this asserts the files that reasoned FROM it, not the
    // files that narrate its removal.
    for (const file of [
      "packages/credits/src/inference.ts",
      "app/(product)/onboarding/run-copy.ts",
      "packages/credits/tests/inference.test.ts",
      "packages/credits/tests/isolation.test.ts",
      "packages/db/tests/spend-rollup.test.ts",
      "tests/usage-burn-by-mode.test.ts",
    ]) {
      expect(
        readFileSync(join(ROOT, file), "utf8"),
        `${file} still names the accessor R-80 deleted`
      ).not.toContain("countBillableAttempts");
    }
  });
});
