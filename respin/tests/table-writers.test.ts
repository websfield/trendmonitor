// P8 — the WRITER ENUMERATION.
//
// Every table M2a creates has exactly one sanctioned writer, and for three of
// them that writer is `writeCapabilities` in `packages/db/src/with-workspace.ts`
// — the function the whole cage exists to funnel writes through. A second
// writer anywhere would make the cage decorative, and it would be caught by
// neither eslint (which sees imports, not queries) nor the type system (which
// is perfectly happy with `db.insert(brainDocs)`).
//
// FOUR SHAPES, because a scan that knows only one of them is a scan a careless
// change walks past:
//   direct    db.insert(TABLE)
//   aliased   const t = TABLE; ... db.insert(t)
//   schema.*  db.insert(schema.TABLE)
//   raw sql   a sql template naming the table
// Each is planted and found below, per verb, so "no writers" is a measurement
// rather than the absence of one.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** drizzle export name → SQL table name. All six of migration 0011. */
const TABLES: Record<string, string> = {
  brainDocs: "brain_docs",
  creatorProfiles: "creator_profiles",
  frameworks: "frameworks",
  onboardingInputs: "onboarding_inputs",
  modelUsage: "model_usage",
  workspaceSpendMonthly: "workspace_spend_monthly",
};

const VERBS = ["insert", "update", "delete"] as const;
type Verb = (typeof VERBS)[number] | "onConflictDoUpdate";
type Shape = "direct" | "aliased" | "schema" | "rawSql";
type Finding = { file: string; table: string; verb: Verb; shape: Shape };

/**
 * The ONE scanner, on a real TypeScript PARSE.
 *
 * The regex version knew four shapes and the tenancy gate ran it against five
 * more, each returning ZERO findings: an import rename
 * (`import { brainDocs as bd }`), a destructured alias
 * (`const { brainDocs: t } = schema`), a cast argument (`db.insert(t as never)`),
 * a computed member (`db.insert(schema["brainDocs"])`), and schema-qualified
 * raw SQL (`insert into public.brain_docs`). That matters more here than
 * anywhere else in the suite: `packages/**` may legitimately import every M2a
 * table object from the package root, neither tsc nor eslint constrains
 * `db.insert(brainDocs)` there, and P8 is therefore the ONLY thing making
 * "exactly one writer" true. An import rename is an ordinary edit.
 *
 * The parse resolves aliases through three routes — import clauses, variable
 * declarations, and object-destructuring patterns — then matches the CALL
 * ARGUMENT as a node, so a cast or a computed member is followed rather than
 * pattern-matched.
 */
function tableOfExpression(
  expr: ts.Expression,
  sf: ts.SourceFile,
  aliases: Map<string, string>
): string | undefined {
  // Unwrap `x as never`, `x!`, `(x)`.
  let node: ts.Expression = expr;
  for (;;) {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      node = node.expression;
    } else if (ts.isNonNullExpression(node)) {
      node = node.expression;
    } else if (ts.isParenthesizedExpression(node)) {
      node = node.expression;
    } else break;
  }
  if (ts.isIdentifier(node)) {
    const name = node.getText(sf);
    return aliases.get(name) ?? (name in TABLES ? name : undefined);
  }
  // `schema.brainDocs` and `schema["brainDocs"]`.
  if (ts.isPropertyAccessExpression(node)) {
    const prop = node.name.getText(sf);
    return prop in TABLES ? prop : undefined;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const arg = node.argumentExpression;
    if (ts.isStringLiteral(arg)) {
      return arg.text in TABLES ? arg.text : undefined;
    }
  }
  return undefined;
}

/** Every local name that refers to one of the M2a tables, however bound. */
function collectAliases(sf: ts.SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    // import { brainDocs as bd } from "@respin/db"
    if (ts.isImportSpecifier(node)) {
      const original = (node.propertyName ?? node.name).getText(sf);
      if (original in TABLES) aliases.set(node.name.getText(sf), original);
    }
    // const t = brainDocs / const t = schema.brainDocs
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isIdentifier(node.name)
    ) {
      const target = tableOfExpression(node.initializer, sf, aliases);
      if (target) aliases.set(node.name.getText(sf), target);
    }
    // const { brainDocs: t } = schema  /  const { brainDocs } = schema
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      for (const el of node.name.elements) {
        const original = (el.propertyName ?? el.name).getText(sf);
        if (original in TABLES && ts.isIdentifier(el.name)) {
          aliases.set(el.name.getText(sf), original);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return aliases;
}

function scanWriters(files: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const [file, raw] of files) {
    const sf = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
    const aliases = collectAliases(sf);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const verb = node.expression.name.getText(sf) as Verb;
        if ((VERBS as readonly string[]).includes(verb) && node.arguments.length > 0) {
          const table = tableOfExpression(node.arguments[0], sf, aliases);
          if (table) {
            const shape: Shape = shapeOf(node.arguments[0], sf, aliases);
            out.push({ file, table: TABLES[table], verb, shape });
            if (verb === "insert" && chainHasUpsert(node, sf)) {
              out.push({
                file,
                table: TABLES[table],
                verb: "onConflictDoUpdate",
                shape,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    // Raw SQL naming a table. A template literal reaches the database without
    // touching a table object at all, so no pass above can see it. `public.`
    // and quoted spellings both count.
    const text = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [name, sqlName] of Object.entries(TABLES)) {
      void name;
      const q = String.raw`(?:"?public"?\s*\.\s*)?"?` + sqlName + String.raw`"?`;
      const raws: [RegExp, Verb][] = [
        [new RegExp(String.raw`insert\s+into\s+` + q + String.raw`\b`, "gi"), "insert"],
        [new RegExp(String.raw`update\s+` + q + String.raw`\s+set\b`, "gi"), "update"],
        [new RegExp(String.raw`delete\s+from\s+` + q + String.raw`\b`, "gi"), "delete"],
      ];
      for (const [re, verb] of raws) {
        for (const m of text.matchAll(re)) {
          out.push({ file, table: sqlName, verb, shape: "rawSql" });
          const window = text.slice(m.index ?? 0, (m.index ?? 0) + 600);
          if (verb === "insert" && /on\s+conflict[\s\S]{0,200}?do\s+update/i.test(window)) {
            out.push({ file, table: sqlName, verb: "onConflictDoUpdate", shape: "rawSql" });
          }
        }
      }
    }
  }
  return out;
}

/** Which spelling reached the table — reported so a probe can name it. */
function shapeOf(
  expr: ts.Expression,
  sf: ts.SourceFile,
  aliases: Map<string, string>
): Shape {
  let node: ts.Expression = expr;
  for (;;) {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression;
    else if (ts.isNonNullExpression(node)) node = node.expression;
    else if (ts.isParenthesizedExpression(node)) node = node.expression;
    else break;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return "schema";
  }
  if (ts.isIdentifier(node) && aliases.has(node.getText(sf))) return "aliased";
  return "direct";
}

/** Does this insert chain reach `.onConflictDoUpdate(...)`? */
function chainHasUpsert(call: ts.CallExpression, sf: ts.SourceFile): boolean {
  let node: ts.Node = call;
  while (node.parent) {
    if (
      ts.isCallExpression(node.parent) &&
      ts.isPropertyAccessExpression(node.parent.expression) &&
      node.parent.expression.name.getText(sf) === "onConflictDoUpdate"
    ) {
      return true;
    }
    if (
      ts.isPropertyAccessExpression(node.parent) ||
      ts.isCallExpression(node.parent)
    ) {
      node = node.parent;
      continue;
    }
    break;
  }
  return false;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "migrations",
  "coverage",
]);

function productSources(dir: string, acc: Map<string, string> = new Map()) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    // ENOENT ONLY, and narrowly — the THIRD scanner to hit this race today.
    // `import-boundary.test.ts` writes probe files into `respin/lib` and
    // `packages/credits/src` and deletes them, vitest runs files in parallel,
    // and both `statSync` and `readFileSync` below can land after the delete.
    // The whole suite died at collection. A file that no longer exists is not
    // in the committed tree and cannot be a writer of anything.
    //
    // Every OTHER error still throws: a scan that swallowed read failures would
    // report "no unreviewed writers" because it could not read the files, which
    // is the 2026-08-21 fail-open shape this suite exists to prevent.
    let entry;
    try {
      entry = statSync(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (entry.isDirectory()) {
      // Package TESTS are not a product surface: they seed fixtures directly,
      // which is how these guards are verified at all. Same scoping rule as
      // retention.test.ts, and the same reason.
      if (name === "tests") continue;
      productSources(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      let src: string;
      try {
        src = readFileSync(full, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      acc.set(relative(ROOT, full).split(sep).join("/"), src);
    }
  }
  return acc;
}

/**
 * The expected writer set, per table, with the reason each entry is there.
 * A file here is a REVIEWED decision; a file in the scan and not here fails.
 */
const EXPECTED: Record<string, Record<string, string>> = {
  brain_docs: {
    "packages/db/src/with-workspace.ts":
      "writeCapabilities() — THREE capabilities write this table, all cage-asserted and pause-gated: writeBrainDoc (status and version server-derived), confirmBrainDocFields (confirmed_by server-derived from the session), activateBrainDoc (supersedes the incumbent, refuses unconfirmed or drifted content). It said 'the ONE write surface' after two more landed, so the scan stayed green while its stated reason was false — a reviewed decision is only reviewed if it describes what is there (learning gate 2026-08-26)",
  },
  onboarding_inputs: {
    "packages/db/src/with-workspace.ts":
      "writeCapabilities().appendOnboardingInput — normalises, hashes, and stamps the scope's ids",
  },
  model_usage: {
    "packages/db/src/with-workspace.ts":
      "writeCapabilities().recordModelUsage — the append-only spend record",
  },
  // Deliberately EMPTY in M2a. createProfile is DEFERRED to M2b (plan A-11):
  // it needs the per-tier cap AND the tier, and the tier's sole authority is
  // credits/src/state.ts, which packages/db cannot import without creating a
  // second tier authority — the defect class that caused two M1 gate findings.
  creator_profiles: {},
  // Written by M2b. Named here with an empty set so the FIRST writer is a
  // deliberate edit to this file rather than a silent addition.
  workspace_spend_monthly: {},
  // Written by NOTHING, and that is the point: frameworks is created by M2a and
  // seeded by a later milestone under R-29's evidence rules. An empty
  // expectation is the strongest assertion this file can carry.
  frameworks: {},
};

describe("P8 — every M2a table's writers are enumerated", () => {
  const files = productSources(join(ROOT, "packages"));
  productSources(join(ROOT, "app"), files);

  it("the scan is not vacuous: it sees all four shapes, for every verb", () => {
    const probe = new Map<string, string>([
      [
        "probe/direct.ts",
        "db.insert(brainDocs).values(x); db.update(brainDocs).set(y); db.delete(brainDocs);",
      ],
      [
        "probe/aliased.ts",
        "const t = brainDocs;\ndb.insert(t).values(x); db.update(t).set(y); db.delete(t);",
      ],
      [
        "probe/schema.ts",
        "db.insert(schema.brainDocs).values(x); db.update(schema.brainDocs).set(y); db.delete(schema.brainDocs);",
      ],
      [
        "probe/raw.ts",
        "q(RAW1); q(RAW2); q(RAW3);".replace("RAW1", "'insert into brain_docs (a) values (1)'")
          .replace("RAW2", "'update brain_docs set a = 1'")
          .replace("RAW3", "'delete from brain_docs where a = 1'"),
      ],
      [
        "probe/upsert.ts",
        "db.insert(workspaceSpendMonthly).values(v).onConflictDoUpdate({ target: t, set: s });",
      ],
      [
        "probe/upsert-alias.ts",
        "const w = workspaceSpendMonthly;\ndb.insert(w).values(v).onConflictDoUpdate({ target: t, set: s });",
      ],
      [
        "probe/upsert-raw.ts",
        "q('insert into workspace_spend_monthly (a) values (1) on conflict (a) do update set b = 2');",
      ],
    ]);
    const found = scanWriters(probe);
    for (const shape of ["direct", "aliased", "schema", "rawSql"] as const) {
      for (const verb of VERBS) {
        expect(
          found.some((f) => f.shape === shape && f.verb === verb),
          shape + "/" + verb + " is invisible to the scanner"
        ).toBe(true);
      }
    }
    for (const shape of ["direct", "aliased", "rawSql"] as const) {
      expect(
        found.some((f) => f.shape === shape && f.verb === "onConflictDoUpdate"),
        shape + "/onConflictDoUpdate is invisible to the scanner"
      ).toBe(true);
    }
    // ...and a COMMENT naming a table is not a writer.
    expect(
      scanWriters(new Map([["c.ts", "// db.insert(brainDocs).values(x)\n"]]))
    ).toEqual([]);
  });

  it("the scan is non-empty against the real repo (it is reading something)", () => {
    expect(files.size).toBeGreaterThan(20);
    expect(scanWriters(files).length).toBeGreaterThan(0);
  });

  it.each(Object.keys(EXPECTED))("%s has exactly its expected writers", (table) => {
    const actual = new Set(
      scanWriters(files)
        .filter((f) => f.table === table)
        .map((f) => f.file)
    );
    const expected = new Set(Object.keys(EXPECTED[table]));
    expect(
      [...actual].filter((f) => !expected.has(f)).sort(),
      "unexpected writer of " +
        table +
        " — route it through writeCapabilities, or add it to EXPECTED with a reason"
    ).toEqual([]);
    expect(
      [...expected].filter((f) => !actual.has(f)).sort(),
      "EXPECTED claims a writer of " + table + " that no longer exists — delete the stale entry"
    ).toEqual([]);
  });
});

describe("P8 (the scanner's own coverage): the spellings a rename produces", () => {
  // Each of these returned ZERO findings against the regex scanner when the
  // tenancy gate ran it. None is exotic — an import rename and a destructured
  // alias are what an ordinary refactor produces, and `as never` is already
  // used in this repo's own test fixtures.
  const SPELLINGS: [string, string][] = [
    [
      "import rename",
      'import { brainDocs as bd } from "@respin/db";\ndb.insert(bd).values(x);',
    ],
    [
      "destructured alias",
      "const { brainDocs: t } = schema;\ndb.insert(t).values(x);",
    ],
    [
      "destructured shorthand",
      "const { brainDocs } = schema;\ndb.insert(brainDocs).values(x);",
    ],
    ["cast argument", "db.insert(brainDocs as never).values(x);"],
    ["computed member", 'db.insert(schema["brainDocs"]).values(x);'],
    [
      "schema-qualified raw SQL",
      "q('insert into public.brain_docs (a) values (1)');",
    ],
    [
      "quoted raw SQL",
      "q('delete from \"brain_docs\" where a = 1');",
    ],
  ];

  it.each(SPELLINGS)("sees a brain_docs writer spelled as a %s", (_label, src) => {
    const found = scanWriters(new Map([["probe/x.ts", src]]));
    expect(
      found.filter((f) => f.table === "brain_docs"),
      "this writer spelling is invisible to P8 — and P8 is the ONLY thing making 'exactly one writer' true"
    ).not.toEqual([]);
  });

  it("still does not mistake a COMMENT or an unrelated identifier for a writer", () => {
    expect(
      scanWriters(
        new Map([
          ["a.ts", "// db.insert(brainDocs).values(x)\n"],
          ["b.ts", "const brainDocsCount = 3; db.insert(other).values(x);"],
          ["c.ts", "db.select().from(brainDocs);"],
        ])
      )
    ).toEqual([]);
  });
});
