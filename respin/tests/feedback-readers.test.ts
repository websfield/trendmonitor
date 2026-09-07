// R11 — THE FEEDBACK RAW-ACCESS AND CONSTRUCTION BOUNDARY (slice 7, card
// question 1).
//
// THE RULE THIS FILE ENFORCES, in the card's own words: "One scoped raw
// accessor serves UI/export and later `packages/brain`; scans forbid other raw
// table readers and proposal constructors outside `packages/brain`."
//
// WHY A SCAN AT ALL. R-10 and R-44 make `packages/brain` the SOLE construction
// site for promotion proposals, and it does not exist until slice 9. Capture
// and construction are different acts: storing "the creator said this was too
// cringe" is a fact; deriving "your voice profile should ban X" is a proposal.
// Slice 7 does the first and must be structurally unable to drift into the
// second — and neither eslint (which sees imports, not queries) nor the type
// system (which is perfectly happy with `db.select().from(generationFeedback)`)
// can say so.
//
// THE PRECEDENT IS IN THIS REPO. `@respin/trends` is pre-registered as a denied
// import name in `tests/import-boundary.test.ts` — a guard written before the
// thing it guards exists. `packages/brain` is registered the same way here: the
// allowance for it is driven by a PLANTED in-memory file, so the branch that
// will matter in slice 9 is exercised today rather than written today and first
// run in three months.
//
// ITS HONEST LIMIT, STATED RATHER THAN IMPLIED (the card says this too): a
// source scan CANNOT infer semantic intent. It enforces two things — who may
// read the table raw, and where a proposal constructor may live — and it claims
// nothing else. That a UI and an export return RAW SCOPED EVENTS is a
// behavioural property and is proved separately, in
// `packages/db/tests/lineage-feedback.test.ts` (the accessor and the
// export return the stored rows column for column) — not here.
//
// EVERY RULE BELOW IS DRIVEN BY A PLANTED VIOLATION. A scan that reports zero
// findings is indistinguishable from a scan that is broken (CLAUDE.md
// 2026-08-21), and this one would fail OPEN in the direction that matters: it
// is the only thing making "exactly one raw reader" true.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The drizzle export name of the one table this file guards.
 *
 * Its SQL name (`generation_feedback`) appears ONLY inside the raw-SQL regexp
 * literals below, deliberately: a regex built from a string constant needs
 * doubled backslashes, and one lost backslash turns the rule into a pattern
 * that matches nothing while the scan still reports success (CLAUDE.md
 * 2026-08-21).
 */
const TABLE_EXPORT = "generationFeedback";

/**
 * THE ONE FILE THAT MAY READ `generation_feedback` RAW.
 *
 * A LIST OF EXACT FILE PATHS, and both halves of that are load-bearing:
 *
 *  - A LIST, not a single string, because CLAUDE.md's 2026-08-29 lesson is
 *    that "a population written as one path narrows silently the day a second
 *    path appears". Adding a second entry is what a second reader costs, and
 *    it is a deliberate edit to this file rather than a silent one.
 *  - EXACT PATHS, compared with `===` and never with `startsWith`. That is
 *    mutation M4 ("raw feedback-reader allowance widened to a directory"):
 *    widening this to `packages/db/src/` would let any sibling read the table,
 *    and the test below plants a reader in a sibling to prove the comparison
 *    is exact.
 *
 * `exportPage`'s `generation_feedback` branch is in the SAME file and shares
 * the same query helper (`feedbackPage`), so the export costs no second entry
 * — which is the point of writing it as a helper rather than as a second
 * query.
 */
const RAW_FEEDBACK_READER_FILES: readonly string[] = [
  "packages/db/src/with-workspace.ts",
  // Phase 10b-1 Task 4: the deletion executor's SQL port renders every
  // registry table by identifier under the operation's subject predicate —
  // it erases and counts residue, it never reads content for a product path.
  "packages/db/src/lifecycle-sql-port.ts",
];

/**
 * The package that may construct promotion proposals — PRE-REGISTERED.
 *
 * It does not exist. That is deliberate: R-10/R-44 name it as the sole
 * construction site and slice 9 builds it, so the boundary is written now,
 * while there is nothing to grandfather in. A PREFIX here rather than exact
 * paths, because the allowance is a whole package rather than one file, and
 * the planted case below proves the prefix admits a file inside it.
 */
const PROPOSAL_CONSTRUCTOR_PACKAGE = "packages/brain/";

/**
 * FILES THAT MAY DECLARE A *CURATION* PROPOSAL — an explicit, reasoned
 * allowance, added 2026-09-03 (learning gate CHANGE 2).
 *
 * THE RECONCILIATION THIS RECORDS: the ledger's 2026-09-02 restore entry has
 * this test RED for "a proposal constructor outside `packages/brain`, in
 * `packages/trends`". The test file did not change; the declarations did —
 * the family became `proposeFramework` plus a handoff type (both in
 * `packages/trends/src/framework-proposal.ts`, since deleted) and `proposeSharedFramework`
 * / `insertProposedSharedFramework` / `resolveAutopsyFramework`
 * (`packages/db/src/frameworks.ts`), none of which contains "proposal" or
 * "promot", so the name rule stopped seeing them. That is passing by
 * SPELLING, and spelling is not a reason. (The trends-side port,
 * `framework-proposal.ts`, was dead code with no production caller and is no
 * longer in the tree as of this fix pass; the existence check below is what
 * noticed, and the list shrank to the one real authority.)
 *
 * THE REASON: R-94 distinguishes two acts that happen to share a word. A
 * PROMOTION proposal (R-10/R-44) derives a per-creator brain rule from
 * verified results — `packages/brain` only, slice 9. A CURATION proposal
 * (REQ-D03/D04, R-94) is a mechanism-level SHARED-LIBRARY candidate: it writes
 * exactly one table (`frameworks`), exactly one status (`curator_status =
 * 'proposed'`), never a brain document, and cannot enter generation until a
 * human curator approves it. The file below is the only one allowed to
 * declare the second kind, and ONLY under the `proposal` rule — a
 * `promotion`/`promote`-named declaration in it is still a finding.
 *
 * EXACT PATHS, compared with `===`, for the reason `RAW_FEEDBACK_READER_FILES`
 * gives. What keeps this allowance honest is not the list but the positive
 * test below it: the curation writers' sole write target is `frameworks`
 * with `curatorStatus: "proposed"`, checked structurally against the real
 * source and against doctored copies that violate it.
 */
const CURATION_PROPOSAL_FILES: readonly string[] = [
  "packages/db/src/frameworks.ts",
];

/**
 * THE CURATION PATH'S WRITERS, as a list. `resolveAutopsyFramework` is what
 * `system-spend.ts`'s finalize transaction calls (R-94's durable decision);
 * `insertProposedSharedFramework` is the one INSERT it reaches;
 * `proposeSharedFramework` is the direct trend-derived entry. A function
 * renamed away from this list fails LOUDLY (`<fn not found>`) rather than
 * silently leaving the scan with nothing to check.
 */
const CURATION_WRITERS: readonly string[] = [
  "insertProposedSharedFramework",
  "resolveAutopsyFramework",
  "proposeSharedFramework",
];

type CurationWriteFinding =
  | { fn: string; kind: "write"; verb: string; target: string }
  | { fn: string; kind: "curatorStatus"; via: "values" | "set"; value: string }
  | { fn: string; kind: "missing" };

/**
 * Every `.insert(X)` / `.update(X)` / `.delete(X)` inside the named functions,
 * plus every `curatorStatus:` property inside a `.values({...})` or
 * `.set({...})` there. Structural (parsed), not a text window.
 */
export function scanCurationWrites(
  source: string,
  fns: readonly string[]
): CurationWriteFinding[] {
  const sf = ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true);
  const out: CurationWriteFinding[] = [];
  const bodies = new Map<string, ts.Node>();
  const findFns = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && fns.includes(node.name.getText(sf))) {
      bodies.set(node.name.getText(sf), node);
    }
    ts.forEachChild(node, findFns);
  };
  findFns(sf);
  for (const fn of fns) {
    const body = bodies.get(fn);
    if (!body) {
      out.push({ fn, kind: "missing" });
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const verb = node.expression.name.getText(sf);
        if ((verb === "insert" || verb === "update" || verb === "delete") && node.arguments[0]) {
          out.push({ fn, kind: "write", verb, target: node.arguments[0].getText(sf) });
        }
        if ((verb === "values" || verb === "set") && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
          for (const prop of node.arguments[0].properties) {
            if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === "curatorStatus") {
              out.push({ fn, kind: "curatorStatus", via: verb, value: prop.initializer.getText(sf) });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
  }
  return out;
}

/**
 * How the table was NAMED at the read site.
 *
 * An IMPORT RENAME and a local `const` alias both report `aliased`, and that
 * is the alias resolver working rather than a gap: both bind a new identifier
 * to the same table, and the scan resolves both through the same set. The
 * shape exists so a probe can say WHICH spelling it drove, not because the
 * guard treats them differently — both are driven below.
 */
type ReaderShape =
  | "direct"
  | "aliased"
  | "schema"
  | "computed"
  | "cast"
  | "rawSql"
  | "queryApi"
  | "sqlTemplate"
  // A `from`/`join` hole this scan CANNOT resolve — a call, an await, a
  // conditional. Reported rather than ignored, because "I could not tell" and
  // "there is nothing there" are different answers and only one of them is
  // safe to report as no finding.
  | "unresolvedFrom";
type ReaderFinding = { file: string; shape: ReaderShape };

/** Unwrap `x as never`, `x!`, `(x)` — a cast must not hide the table. */
function unwrap(expr: ts.Expression): ts.Expression {
  let node: ts.Expression = expr;
  for (;;) {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      node = node.expression;
    } else if (ts.isNonNullExpression(node)) node = node.expression;
    else if (ts.isParenthesizedExpression(node)) node = node.expression;
    else break;
  }
  return node;
}

/**
 * EVERY LOCAL NAME THIS FILE RESOLVES, IN ONE PASS AND ONE SHAPE.
 *
 * THE STRUCTURAL DEFECT THIS CLOSES (tenancy gate, 2026-09-02). There used to
 * be TWO resolvers that never spoke: `collectAliases` bound a name to the
 * TABLE, `collectQueryObjects` bound a name to the QUERY ROOT, and the
 * `queryApi` rule asked only "is this member the table, off a query root".
 * So `const { generationFeedback } = db.query;` — the direct sibling of the
 * `const { query } = db` case the previous round DID add — bound
 * `generationFeedback` as a TABLE alias, was never asked about as an ACCESSOR,
 * and `await generationFeedback.findMany()` returned BOTH WORKSPACES' ROWS
 * with the scan reporting ZERO findings. Adding a spelling would have left the
 * class open a third time; the fix is that there is now ONE question —
 * `isAccessorExpr`: does this expression evaluate to the relational accessor
 * for the table? — and every rule asks it.
 *
 * FOUR SETS, one per thing a name can BE:
 *   `tables`      — the table object (`generationFeedback`, an import rename,
 *                   `const t = schema.generationFeedback`, `alias(t, "gf")`);
 *   `queryRoots`  — a relational-query root (`db.query`, `const q = db.query`,
 *                   `const { query } = db`);
 *   `accessors`   — THE RELATIONAL ACCESSOR FOR THIS TABLE
 *                   (`db.query.generationFeedback`, and every name bound to
 *                   one, including the destructure above);
 *   `strings`     — a compile-time-constant string, so a table NAME assembled
 *                   from literals is still seen (`"generation_" + "feedback"`).
 *
 * RUN TO A FIXPOINT rather than once in source order, because a binding may be
 * declared after the one it depends on and a single forward pass would resolve
 * the pair in only one of the two orders — which is a scan whose answer
 * depends on how the author happened to write the file.
 */
type Bindings = {
  tables: Set<string>;
  queryRoots: Set<string>;
  accessors: Set<string>;
  strings: Map<string, string>;
};

/** The member name of `x.y` / `x["y"]`, or `null` when it is not statically known. */
function memberName(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  sf: ts.SourceFile
): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.getText(sf);
  const arg = node.argumentExpression;
  return arg && ts.isStringLiteralLike(arg) ? arg.text : null;
}

/** Is this expression a relational-query ROOT (`db.query`, or a name bound to one)? */
function isQueryRootExpr(
  expr: ts.Expression,
  sf: ts.SourceFile,
  b: Bindings
): boolean {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) return b.queryRoots.has(node.getText(sf));
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.getText(sf) === "query" || b.queryRoots.has(node.getText(sf));
  }
  return false;
}

/**
 * DOES THIS EXPRESSION EVALUATE TO THE RELATIONAL ACCESSOR FOR THE TABLE?
 *
 * The one question, asked by the binding collector and by the read rule alike.
 *
 * A COMPUTED MEMBER OFF A QUERY ROOT WITH A NON-LITERAL KEY IS A FINDING
 * (`db.query[k]`): the scan cannot know which table `k` names, and the whole
 * point of this file is that it is the only thing making "exactly one raw
 * reader" true — so it fails CLOSED, with a way forward (name the table
 * directly, or add the file to `RAW_FEEDBACK_READER_FILES` with a reason).
 */
function isAccessorExpr(
  expr: ts.Expression,
  sf: ts.SourceFile,
  b: Bindings
): boolean {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) return b.accessors.has(node.getText(sf));
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    if (!isQueryRootExpr(node.expression, sf, b)) return false;
    const name = memberName(node, sf);
    return name === null || name === TABLE_EXPORT;
  }
  return false;
}

/** Does this expression name the feedback table, in any spelling? */
function namesTable(expr: ts.Expression, sf: ts.SourceFile, b: Bindings): boolean {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) return b.tables.has(node.getText(sf));
  // `schema.generationFeedback` / `schema["generationFeedback"]`
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return memberName(node, sf) === TABLE_EXPORT;
  }
  // `alias(generationFeedback, "gf")` — drizzle's own self-join helper, and a
  // first-class join idiom rather than an exotic spelling. It returned ZERO
  // findings until 2026-09-02 because the argument of `.from(...)` was a CALL
  // rather than a name.
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    const fn = ts.isIdentifier(callee)
      ? callee.getText(sf)
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.getText(sf)
        : "";
    if ((fn === "alias" || fn === "aliasedTable") && node.arguments.length > 0) {
      return namesTable(node.arguments[0], sf, b);
    }
  }
  return false;
}

/** Fold a compile-time-constant string expression, or `null`. */
function constString(
  expr: ts.Expression,
  sf: ts.SourceFile,
  b: Bindings
): string | null {
  const node = unwrap(expr);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return b.strings.get(node.getText(sf)) ?? null;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = constString(node.left, sf, b);
    const right = constString(node.right, sf, b);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function collectBindings(sf: ts.SourceFile): Bindings {
  const b: Bindings = {
    tables: new Set([TABLE_EXPORT]),
    queryRoots: new Set(),
    accessors: new Set(),
    strings: new Map(),
  };
  const size = () =>
    b.tables.size + b.queryRoots.size + b.accessors.size + b.strings.size;
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) {
      const original = (node.propertyName ?? node.name).getText(sf);
      if (original === TABLE_EXPORT) b.tables.add(node.name.getText(sf));
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isIdentifier(node.name)) {
        const name = node.name.getText(sf);
        // ORDER MATTERS: the accessor question is asked BEFORE the table one,
        // because `db.query.generationFeedback` is not a table object and
        // treating it as one is exactly the confusion that let the destructure
        // through.
        if (isAccessorExpr(init, sf, b)) b.accessors.add(name);
        else if (namesTable(init, sf, b)) b.tables.add(name);
        else if (isQueryRootExpr(init, sf, b)) b.queryRoots.add(name);
        const folded = constString(init, sf, b);
        if (folded !== null) b.strings.set(name, folded);
      }
      if (ts.isObjectBindingPattern(node.name)) {
        // A DESTRUCTURE IS RESOLVED AGAINST WHAT IT DESTRUCTURES, which is the
        // whole finding: `{ generationFeedback } = db.query` binds an ACCESSOR
        // and `{ generationFeedback: t } = schema` binds a TABLE. Reading the
        // property name alone cannot tell them apart, and did not.
        const fromQueryRoot = isQueryRootExpr(node.initializer, sf, b);
        for (const el of node.name.elements) {
          const original = (el.propertyName ?? el.name).getText(sf);
          if (!ts.isIdentifier(el.name)) continue;
          const local = el.name.getText(sf);
          if (original === TABLE_EXPORT) {
            if (fromQueryRoot) b.accessors.add(local);
            else b.tables.add(local);
          }
          if (original === "query") b.queryRoots.add(local);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  // FIXPOINT: at most a handful of rounds in practice, bounded so a pathological
  // file cannot spin.
  for (let i = 0; i < 5; i += 1) {
    const before = size();
    visit(sf);
    if (size() === before) break;
  }
  return b;
}

/**
 * A template literal that interpolates a TABLE after `from` / `join`.
 *
 * THE MIRROR GAP: the raw-SQL rule below is a regex over TEXT and sees the
 * table's SQL NAME, while the parse pass only looks at `.from(...)` arguments.
 * `` sql`select * from ${generationFeedback}` `` is neither — the SQL name
 * never appears in the source, and the table object is not a call argument.
 *
 * A HOLE IT CANNOT RESOLVE IS A FINDING (2026-09-02). `` sql`select * from
 * ${pick()}` `` returned zero findings, and no source scan can know what a
 * call returns — so an unresolvable expression in a `from`/`join` hole fails
 * CLOSED and says so, with the remedy in the assertion message. A NAME is
 * treated as resolvable, because `collectBindings` follows names: an
 * identifier that is not bound to this table is another table.
 *
 * IT REQUIRES `from` OR `join` IMMEDIATELY BEFORE THE HOLE, so this stays a
 * READ rule: `` sql`insert into ${generationFeedback}` `` is
 * `tests/table-writers.test.ts`' subject and is enumerated there.
 */
function sqlTemplateReads(
  node: ts.Node,
  sf: ts.SourceFile,
  b: Bindings
): ReaderShape[] {
  // THE `TemplateExpression` ITSELF, never the `TaggedTemplateExpression`
  // around it: the visitor reaches both, and matching on the tag as well would
  // count every `` sql`…` `` twice. The tag is deliberately NOT required —
  // `sql`, `sql.raw` and a plain template all reach the same place, and a
  // tag-name allowlist is a list to keep up to date (which is how a scan starts
  // failing open).
  if (!ts.isTemplateExpression(node)) return [];
  const found: ReaderShape[] = [];
  let precedingText = node.head.text;
  for (const span of node.templateSpans) {
    if (/\b(from|join)\s*$/i.test(precedingText)) {
      const hole = unwrap(span.expression);
      if (namesTable(hole, sf, b)) found.push("sqlTemplate");
      else if (
        !ts.isIdentifier(hole) &&
        !ts.isPropertyAccessExpression(hole) &&
        !ts.isElementAccessExpression(hole) &&
        !ts.isStringLiteralLike(hole)
      ) {
        found.push("unresolvedFrom");
      }
    }
    precedingText = span.literal.text;
  }
  return found;
}

function shapeOf(expr: ts.Expression, sf: ts.SourceFile, b: Bindings): ReaderShape {
  const raw = expr;
  const node = unwrap(expr);
  if (raw !== node) return "cast";
  if (ts.isCallExpression(node)) return "aliased";
  if (ts.isPropertyAccessExpression(node)) return "schema";
  if (ts.isElementAccessExpression(node)) return "computed";
  if (ts.isIdentifier(node) && node.getText(sf) !== TABLE_EXPORT) {
    return b.tables.has(node.getText(sf)) ? "aliased" : "direct";
  }
  return "direct";
}

/**
 * Every READ of `generation_feedback` in a set of sources.
 *
 * READS, not writes. THE POPULATION, WRITTEN AS A LIST because that is what a
 * new spelling costs (CLAUDE.md 2026-08-29) — widened on 2026-09-01 and again
 * on 2026-09-02, the second time after the gate measured that the FIRST
 * widening had added spellings and left the class open:
 *
 *   1. `.from(TABLE)` and the four joins, through a table object, a `const`
 *      alias, an import rename, a destructured alias, `schema.TABLE`,
 *      `schema["TABLE"]`, a cast, or `alias(TABLE, "x")`;
 *   2. RAW SQL naming `generation_feedback` after `from` / `join`, quoted or
 *      schema-qualified — including a name ASSEMBLED FROM STRING LITERALS,
 *      which the text regexes cannot see;
 *   3. THE RELATIONAL ACCESSOR for the table, however it is reached:
 *      `db.query.TABLE`, a hoisted `const q = db.query`, a destructured
 *      `{ query }`, a destructured `{ TABLE } = db.query`, the computed member,
 *      or any name bound to one of those. All of it is ONE question
 *      (`isAccessorExpr`) rather than a list of spellings;
 *   4. a TEMPLATE LITERAL interpolating the table after `from` / `join`, and —
 *      failing closed — a `from`/`join` hole this scan cannot resolve at all.
 *
 * The WRITE surface is `tests/table-writers.test.ts`' subject and is
 * enumerated there; this file is about who may look at the rows, which is the
 * R11 question.
 */
export function scanFeedbackReaders(
  files: Map<string, string>
): ReaderFinding[] {
  const out: ReaderFinding[] = [];
  const READ_METHODS = new Set([
    "from",
    "innerJoin",
    "leftJoin",
    "rightJoin",
    "fullJoin",
  ]);
  for (const [file, raw] of files) {
    const sf = ts.createSourceFile(
      file,
      raw,
      ts.ScriptTarget.Latest,
      true,
      /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const bindings = collectBindings(sf);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        READ_METHODS.has(node.expression.name.getText(sf)) &&
        node.arguments.length > 0 &&
        namesTable(node.arguments[0], sf, bindings)
      ) {
        out.push({ file, shape: shapeOf(node.arguments[0], sf, bindings) });
      }
      // THE ACCESSOR, WHEREVER IT APPEARS. Not "the accessor followed by a
      // method": `findMany`, `findFirst` and whatever drizzle adds next all
      // hang off the same member, so keying on the method name would be a list
      // to keep up to date. Naming the accessor IS the raw read.
      if (
        (ts.isIdentifier(node) ||
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        isAccessorExpr(node as ts.Expression, sf, bindings)
      ) {
        // ONE FINDING PER OCCURRENCE, and the nesting cannot double-count:
        // `db.query.TABLE` is an accessor, its own `db.query` sub-expression is
        // a query ROOT (member name `query`, not the table) and is not, so the
        // walk over both nodes yields exactly one. Driven below.
        out.push({ file, shape: "queryApi" });
      }
      for (const shape of sqlTemplateReads(node, sf, bindings)) {
        out.push({ file, shape });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    // Raw SQL reaches the database without touching a table object at all, so
    // no parse pass above can see it. Comments are stripped first — a comment
    // naming the table is not a reader.
    //
    // REGEXP LITERALS, never assembled from strings: a lost backslash turns
    // `\s` into `s`, the rule matches nothing, and the scan reports "no
    // readers" because it found none of anything (CLAUDE.md 2026-08-21).
    const text = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const RAW_SQL: RegExp[] = [
      /\bfrom\s+(?:"?public"?\s*\.\s*)?"?generation_feedback"?\b/gi,
      /\bjoin\s+(?:"?public"?\s*\.\s*)?"?generation_feedback"?\b/gi,
    ];
    for (const re of RAW_SQL) {
      for (const _m of text.matchAll(re)) {
        void _m;
        out.push({ file, shape: "rawSql" });
      }
    }
    // ...and the same two rules over CONCATENATED literals, which the text
    // pass cannot see because the name does not exist in the source as one
    // token: `'select * from generation_' + 'feedback'`, or a `const` folded
    // out of two halves. Only BINARY concatenations are folded here — a bare
    // literal is already the text pass's subject and would double-count.
    const foldVisit = (node: ts.Node): void => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken
      ) {
        const folded = constString(node, sf, bindings);
        if (folded !== null) {
          for (const re of RAW_SQL) {
            re.lastIndex = 0;
            for (const _m of folded.matchAll(re)) {
              void _m;
              out.push({ file, shape: "rawSql" });
            }
          }
          return; // never fold a sub-expression of an already-folded one twice
        }
      }
      ts.forEachChild(node, foldVisit);
    };
    foldVisit(sf);
  }
  return out;
}

type DerivationFinding = { file: string; symbol: string; rule: string };

/**
 * DECLARATIONS whose NAME says they construct a promotion proposal or a
 * derived rule.
 *
 * A NAME RULE, on DECLARED IDENTIFIERS ONLY, and its honesty is that it says
 * exactly what it is: it enforces WHERE a proposal constructor may live, not
 * whether some other function is secretly one. Comments and string literals
 * are not declarations, so mentioning a proposal in prose costs nothing —
 * which is why this file's own header can discuss them.
 *
 * The vocabulary is R-10's and R-44's: a "proposal" is the artefact
 * `packages/brain` produces, and "promote"/"promotion" is what the learning
 * loop calls the act. A file outside `packages/brain` declaring either is
 * doing slice 9's job in slice 7's package.
 */
const PROPOSAL_NAME_RULES: readonly { rule: string; pattern: RegExp }[] = [
  { rule: "proposal", pattern: /proposal/i },
  { rule: "promotion", pattern: /promoti(on|ng)/i },
  { rule: "promote", pattern: /^promote[A-Z_]?/ },
];

function scanNamedProposalConstructors(
  files: Map<string, string>
): DerivationFinding[] {
  const out: DerivationFinding[] = [];
  for (const [file, raw] of files) {
    if (file.startsWith(PROPOSAL_CONSTRUCTOR_PACKAGE)) continue;
    const sf = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
    const curationFile = CURATION_PROPOSAL_FILES.includes(file);
    const record = (name: string) => {
      for (const { rule, pattern } of PROPOSAL_NAME_RULES) {
        // The R-94 allowance: a curation file may declare a *proposal*;
        // the promotion vocabulary stays a finding everywhere but brain.
        if (curationFile && rule === "proposal") continue;
        if (pattern.test(name)) out.push({ file, symbol: name, rule });
      }
    };
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) record(node.name.getText(sf));
      if (ts.isClassDeclaration(node) && node.name) record(node.name.getText(sf));
      if (
        (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
        node.name
      ) {
        record(node.name.getText(sf));
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        record(node.name.getText(sf));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/**
 * The promotion boundary is structural, not an identifier convention.
 *
 * `promotion-ops.ts` is allowed to PROJECT a minted draft into its database
 * columns, but it must not mint a draft-shaped value itself.  A real draft has
 * a target/evidence pair in addition to its source identity; the DB projection
 * has `targetKind`/`payload` instead.  That distinction lets this guard catch
 * an inline object even when its function is called `deriveCandidate`, without
 * mistaking persistence for a second constructor.
 */
type PromotionBoundaryFinding = {
  file: string;
  shape: "inline-draft" | "draft-cast" | "public-payload";
};

const DRAFT_TYPE = /(?:Promotion|Result|Feedback)ProposalDraft\b/;
const DRAFT_KEYS = new Set([
  "source", "familyKey", "evidenceDigest", "target", "evidence", "rule", "value", "basisBrainDocId",
]);

function objectKeys(node: ts.ObjectLiteralExpression, sf: ts.SourceFile): Set<string> {
  const keys = new Set<string>();
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      keys.add(property.name.getText(sf).replace(/["']/g, ""));
    }
  }
  return keys;
}

function isDraftLiteral(node: ts.ObjectLiteralExpression, sf: ts.SourceFile): boolean {
  const keys = objectKeys(node, sf);
  const matched = [...keys].filter((key) => DRAFT_KEYS.has(key));
  return keys.has("source") && keys.has("familyKey") && keys.has("evidenceDigest") &&
    keys.has("target") && keys.has("evidence") && matched.length >= 6;
}

/**
 * Finds a second promotion mint or a client-shaped promotion API outside the
 * sole constructor package.  It intentionally does not use "proposal" in a
 * candidate identifier: callers can rename a bypass, but they cannot remove
 * the fields needed to make a usable draft.
 */
export function scanPromotionConstructorBoundary(
  files: Map<string, string>
): PromotionBoundaryFinding[] {
  const out: PromotionBoundaryFinding[] = [];
  for (const [file, raw] of files) {
    if (file.startsWith(PROPOSAL_CONSTRUCTOR_PACKAGE)) continue;
    const sf = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
    const record = (shape: PromotionBoundaryFinding["shape"]) => out.push({ file, shape });
    const payloadText = (text: string) =>
      DRAFT_TYPE.test(text) ||
      (text.includes("familyKey") && text.includes("evidenceDigest")) ||
      (text.includes("source") && text.includes("evidence") && text.includes("target"));
    const exportedPayload = (node: ts.Node): boolean => {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false;
      if (ts.isTypeAliasDeclaration(node)) return payloadText(node.type.getText(sf));
      if (ts.isInterfaceDeclaration(node)) return payloadText(node.members.map((member) => member.getText(sf)).join("\n"));
      if (ts.isFunctionDeclaration(node)) {
        return node.parameters.some((parameter) => payloadText(parameter.type?.getText(sf) ?? ""));
      }
      if (ts.isVariableStatement(node)) {
        return node.declarationList.declarations.some((declaration) => {
          const init = declaration.initializer;
          if (init === undefined) return false;
          if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) return false;
          return init.parameters.some((parameter) => payloadText(parameter.type?.getText(sf) ?? ""));
        });
      }
      return false;
    };
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node) && isDraftLiteral(node, sf)) record("inline-draft");
      if (
        (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
        DRAFT_TYPE.test(node.type.getText(sf)) &&
        !(ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "validateDraft")
      ) {
        record("draft-cast");
      }
      if (
        (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isVariableStatement(node)) &&
        exportedPayload(node)
      ) record("public-payload");
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/**
 * AGGREGATION INSIDE THE ONE PERMITTED READER.
 *
 * The reader-ownership rule above means exactly one file may touch the table,
 * so "nothing aggregates feedback" reduces to "that file's feedback query
 * aggregates nothing". Checked STRUCTURALLY rather than by a text window: the
 * `feedbackPage` helper is located by parse and its call subtree is inspected
 * for a drizzle aggregate or a `groupBy`.
 *
 * Returns the aggregate names found, so a probe can name them.
 */
export function scanFeedbackAggregation(source: string): string[] {
  const AGGREGATES = new Set([
    "count",
    "countDistinct",
    "sum",
    "sumDistinct",
    "avg",
    "avgDistinct",
    "min",
    "max",
    "groupBy",
    "having",
  ]);
  const sf = ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  let helper: ts.Node | undefined;
  const findHelper = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.getText(sf) === "feedbackPage"
    ) {
      helper = node;
    }
    ts.forEachChild(node, findHelper);
  };
  findHelper(sf);
  if (!helper) return ["<feedbackPage helper not found>"];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.getText(sf)
        : ts.isIdentifier(callee)
          ? callee.getText(sf)
          : "";
      if (AGGREGATES.has(name)) found.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(helper);
  return found;
}

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "migrations", "coverage"]);

/**
 * Product sources under `packages/**` and `app/**`.
 *
 * ENOENT is swallowed and nothing else, for the reason `table-writers.test.ts`
 * records: sibling suites write and delete probe files and vitest runs files in
 * parallel. A scan that swallowed read failures would report "no unsanctioned
 * readers" because it could not read the files.
 */
function productSources(dir: string, acc: Map<string, string> = new Map()) {
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
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (entry.isDirectory()) {
      // Package TESTS are not a product surface: they seed and read fixtures
      // directly, which is how these guards are verified at all.
      if (name === "tests") continue;
      productSources(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
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

describe("R11 (the scanner is not vacuous): every reader spelling is seen", () => {
  // Each of these returned ZERO findings against a regex-only scanner when the
  // tenancy gate ran the equivalent list at `table-writers.test.ts`. None is
  // exotic — an import rename and a destructured alias are what an ordinary
  // refactor produces.
  const SPELLINGS: [ReaderShape, string][] = [
    ["direct", "db.select().from(generationFeedback);"],
    ["aliased", "const t = generationFeedback;\ndb.select().from(t);"],
    [
      // An import rename resolves to `aliased` — see `ReaderShape`. It is
      // driven separately from the `const` alias because it is a DIFFERENT
      // resolver route (import specifiers, not variable declarations), and the
      // regex scanner whose precedent this shape follows saw neither.
      "aliased",
      'import { generationFeedback as gf } from "@respin/db";\ndb.select().from(gf);',
    ],
    [
      "aliased",
      "const { generationFeedback: t } = schema;\ndb.select().from(t);",
    ],
    ["schema", "db.select().from(schema.generationFeedback);"],
    ["computed", 'db.select().from(schema["generationFeedback"]);'],
    ["cast", "db.select().from(generationFeedback as never);"],
    ["rawSql", "q('select * from generation_feedback where a = 1');"],
    // ADDED 2026-09-01. BOTH RETURNED ZERO FINDINGS when the tenancy gate ran
    // them, and neither is exotic: `db.query.users.findFirst` is already the
    // opening statement of `withWorkspace` in the very file this scan permits,
    // and `drizzle(pool, { schema })` at `packages/db/src/client.ts:29` builds
    // a `query.<table>` accessor for EVERY table in the schema. The accessor's
    // docblock listed six spellings and the class it omitted is the one an
    // ordinary refactor produces.
    ["queryApi", "const rows = await db.query.generationFeedback.findMany();"],
    ["queryApi", "await db.query.generationFeedback.findFirst({ where: x });"],
    // The computed spelling of the same member, which `schema["…"]` already
    // taught this file to expect.
    ["queryApi", 'await db.query["generationFeedback"].findMany();'],
    // ...and the HOISTED root, which is what a refactor that touches two
    // queries produces.
    ["queryApi", "const q = db.query;\nawait q.generationFeedback.findMany();"],
    [
      "queryApi",
      "const { query } = db;\nawait query.generationFeedback.findMany();",
    ],
    // A TEMPLATE LITERAL interpolating the table OBJECT: invisible to the parse
    // pass (not a call argument) and to the raw-SQL regexes (the SQL name never
    // appears in the source).
    [
      "sqlTemplate",
      "await db.execute(sql`select * from ${generationFeedback} where a = 1`);",
    ],
    [
      "sqlTemplate",
      "await db.execute(sql`select 1 from generations join ${generationFeedback} on x`);",
    ],
    // ...and through an ALIAS of the table, so the two resolvers compose rather
    // than each covering half.
    [
      "sqlTemplate",
      "const t = generationFeedback;\nawait db.execute(sql`select * from ${t}`);",
    ],
    // ADDED 2026-09-02. ALL FIVE RETURNED ZERO FINDINGS against the scan that
    // had just been widened for this exact class — which is the finding: the
    // previous round added SPELLINGS and the class stayed open.
    //
    // THE DIRECT SIBLING of the `const { query } = db` case that round DID
    // add. `collectAliases` bound this name as a TABLE and `isQueryApiRead`
    // only ever asked about a member off a query root, so nothing consulted
    // the binding the other resolver had made. Measured returning BOTH
    // workspaces' rows.
    [
      "queryApi",
      "const { generationFeedback } = db.query;\nawait generationFeedback.findMany();",
    ],
    // `alias(TABLE, "x")` — drizzle's own self-join helper and a first-class
    // join idiom, invisible because the argument of `.from(...)` was a CALL.
    ["aliased", 'db.select().from(alias(generationFeedback, "gf"));'],
    [
      "aliased",
      'const gf = alias(generationFeedback, "gf");\ndb.select().from(generations).innerJoin(gf, on);',
    ],
    // A HOLE THE SCAN CANNOT RESOLVE, reported as such rather than as nothing.
    [
      "unresolvedFrom",
      "await db.execute(sql`select * from ${pick()}`);",
    ],
    // A COMPUTED ACCESSOR whose key is a variable: `db.query[k]`. The scan
    // cannot know which table `k` names, so it fails closed.
    ["queryApi", "const k = chooseTable();\nawait db.query[k].findMany();"],
    // A TABLE NAME BUILT FROM LITERALS, which the raw-SQL text pass cannot see
    // because the name never exists in the source as one token — folded here
    // through the same binding resolver.
    [
      "rawSql",
      "await db.execute(sql.raw('select * from generation_' + 'feedback'));",
    ],
    [
      "rawSql",
      "const t = 'generation_' + 'feedback';\nawait db.execute(sql.raw('select * from ' + t));",
    ],
  ];

  it.each(SPELLINGS)("sees a %s read", (shape, src) => {
    const found = scanFeedbackReaders(new Map([["probe/x.ts", src]]));
    expect(
      found.length,
      "this read spelling is invisible to the scan — and the scan is the ONLY thing making 'exactly one raw reader' true"
    ).toBeGreaterThan(0);
    expect(found.some((f) => f.shape === shape)).toBe(true);
  });

  it("sees a JOIN, and schema-qualified / quoted raw SQL", () => {
    for (const src of [
      "db.select().from(generations).innerJoin(generationFeedback, on);",
      "q('select 1 from public.generation_feedback');",
      "q('select 1 from \"generation_feedback\"');",
      "q('select 1 from generations join generation_feedback on x');",
    ]) {
      expect(
        scanFeedbackReaders(new Map([["probe/x.ts", src]])).length,
        src
      ).toBeGreaterThan(0);
    }
  });

  it("does NOT mistake a comment, a write, or an unrelated name for a read", () => {
    expect(
      scanFeedbackReaders(
        new Map([
          ["a.ts", "// db.select().from(generationFeedback)\n"],
          ["b.ts", "/* select * from generation_feedback */\n"],
          ["c.ts", "const generationFeedbackCount = 3; db.select().from(other);"],
          // A WRITE is `table-writers.test.ts`' subject, not this file's.
          ["d.ts", "db.insert(generationFeedback).values(x);"],
          // ...including the TEMPLATE spelling of a write. The `from`/`join`
          // requirement is what keeps the two files' subjects apart, and it is
          // the same rule the raw-SQL regexes above use.
          ["e.ts", "db.execute(sql`insert into ${generationFeedback} values (1)`);"],
          ["f.ts", "db.execute(sql`update ${generationFeedback} set a = 1`);"],
          // A property NAMED like the table that is not under `.query`: a
          // returned object, a props bag, a result field. Flagging these would
          // make the real-repo assertion below meaningless.
          ["g.ts", "const out = { generationFeedback: rows };\nreturn out.generationFeedback;"],
          ["h.ts", "export const shape = { generationFeedback: [] as Row[] };"],
          // ANOTHER TABLE'S relational accessor. The rule keys on the member
          // being THIS table, so `withWorkspace`'s own opening statement is not
          // a finding — if it were, the real-repo case below would be noise.
          ["i.ts", "const u = await db.query.users.findFirst({ where: w });"],
          ["j.ts", "const { users } = db.query;\nawait users.findMany();"],
          // A NAMED table in a `from` hole. The fail-closed rule covers holes
          // the scan cannot resolve; a NAME is resolvable, and this one
          // resolves to a different table.
          ["k.ts", "await db.execute(sql`select * from ${generations}`);"],
          // A concatenation that folds to something else entirely.
          ["l.ts", "const q = 'select * from ' + 'generations';"],
        ])
      )
    ).toEqual([]);
  });

  it("the two RESOLVERS compose rather than each covering half", () => {
    // `queryApi` resolves the QUERY ROOT; `direct`/`aliased` resolve the TABLE.
    // A source that hoists both is the case where a scan built as two
    // independent rules quietly returns nothing.
    const found = scanFeedbackReaders(
      new Map([
        [
          "probe/x.ts",
          [
            'import { generationFeedback as gf } from "@respin/db";',
            "const q = db.query;",
            "await q.generationFeedback.findMany();",
            "await db.execute(sql`select * from ${gf}`);",
          ].join("\n"),
        ],
      ])
    );
    expect(found.map((f) => f.shape).sort()).toEqual(["queryApi", "sqlTemplate"]);
  });
});

describe("R11 (verification 7): a SECOND raw reader anywhere else fails", () => {
  const isAllowed = (file: string) => RAW_FEEDBACK_READER_FILES.includes(file);

  it("the planted second reader in another package is NOT allowed", () => {
    // Verification 7's first half, planted: a raw `generation_feedback` query
    // in `@respin/credits`.
    const planted = new Map([
      [
        "packages/credits/src/feedback-summary.ts",
        'import { generationFeedback } from "@respin/db";\nexport const rows = () => db.select().from(generationFeedback);',
      ],
    ]);
    const findings = scanFeedbackReaders(planted);
    expect(findings.length, "the plant was not seen at all").toBeGreaterThan(0);
    expect(findings.filter((f) => !isAllowed(f.file))).not.toEqual([]);
  });

  it("M4: the allowance is EXACT FILES, so widening it to a directory is a red test", () => {
    // Every entry is a concrete `.ts` path, never a directory or a glob. If a
    // future edit replaces one with `packages/db/src/` (M4), THIS fails.
    for (const entry of RAW_FEEDBACK_READER_FILES) {
      expect(entry.endsWith(".ts"), entry).toBe(true);
      expect(entry.endsWith("/"), entry).toBe(false);
      expect(entry.includes("*"), entry).toBe(false);
    }
    // ...and the comparison itself is exact: a SIBLING of the permitted file
    // is refused. This is the behavioural half — the assertions above would
    // still pass if `isAllowed` used `startsWith`.
    expect(isAllowed("packages/db/src/with-workspace.ts")).toBe(true);
    expect(isAllowed("packages/db/src/feedback-ops.ts")).toBe(false);
    expect(isAllowed("packages/db/src/with-workspace.ts.bak")).toBe(false);
    const sibling = new Map([
      [
        "packages/db/src/feedback-ops.ts",
        "db.select().from(generationFeedback);",
      ],
    ]);
    expect(
      scanFeedbackReaders(sibling).filter((f) => !isAllowed(f.file))
    ).not.toEqual([]);
  });

  it("THE REAL REPO: exactly the permitted files read the table", () => {
    const files = productSources(join(ROOT, "packages"));
    productSources(join(ROOT, "app"), files);
    expect(files.size, "the scan read nothing").toBeGreaterThan(20);
    const findings = scanFeedbackReaders(files);
    // Non-vacuity against the repo itself: the permitted reader really is
    // there. Without this the next assertion passes on a scan that broke.
    expect(
      findings.map((f) => f.file),
      "the sanctioned raw reader was not found — the scan is broken, not the repo"
    ).toContain(RAW_FEEDBACK_READER_FILES[0]);
    expect(
      [...new Set(findings.map((f) => f.file))].filter((f) => !isAllowed(f)),
      "an unsanctioned raw reader of generation_feedback — route it through ProfileScope.accessors.generationFeedback, or add the file here with a reason"
    ).toEqual([]);
  });
});

describe("R10: promotion proposal construction is structurally restricted to packages/brain", () => {
  it("an inline draft, a cast, and a differently named public payload outside packages/brain are findings", () => {
    const findings = scanPromotionConstructorBoundary(new Map([
      ["packages/db/src/derive.ts", "export function deriveCandidate() { return { source: 'results', familyKey: 'f', evidenceDigest: 'd', target: {}, evidence: [], rule: {} }; }\n"],
      ["app/(product)/x.ts", "const x = {} as unknown as PromotionProposalDraft;\n"],
      ["packages/db/src/api.ts", "export type Input = { source: string; familyKey: string; evidenceDigest: string; target: object; evidence: unknown[] };\n"],
    ]));
    expect(findings.map((f) => `${f.file}:${f.shape}`).sort()).toEqual([
      "app/(product)/x.ts:draft-cast",
      "packages/db/src/api.ts:public-payload",
      "packages/db/src/derive.ts:inline-draft",
    ]);
  });

  it("...and the SAME declarations inside packages/brain are permitted", () => {
    // The pre-registered branch, exercised today against a package that does
    // not exist yet — the `@respin/trends` shape from
    // `tests/import-boundary.test.ts:862`. Without this the allowance is a
    // string nobody has run.
    expect(
      scanPromotionConstructorBoundary(
        new Map([
          [
            "packages/brain/src/promote.ts",
            "export function deriveCandidate() { return { source: 'results', familyKey: 'f', evidenceDigest: 'd', target: {}, evidence: [], rule: {} }; }\n",
          ],
        ])
      )
    ).toEqual([]);
  });

  it("a MENTION in prose or a string is not a declaration", () => {
    expect(
      scanPromotionConstructorBoundary(
        new Map([
          ["a.ts", "// slice 9 builds the promotion proposal constructor\n"],
          ["b.ts", 'export const copy = "we may propose a rule, never apply one";\n'],
        ])
      )
    ).toEqual([]);
  });

  it("THE REAL REPO: nothing outside packages/brain constructs one", () => {
    const files = productSources(join(ROOT, "packages"));
    productSources(join(ROOT, "app"), files);
    expect(files.size).toBeGreaterThan(20);
    expect(
      scanPromotionConstructorBoundary(files),
      "a caller-built promotion draft, cast, or public payload escaped the sole @respin/brain constructor"
    ).toEqual([]);
  });
});

describe("R-94: the CURATION-proposal allowance is explicit, exact, and narrower than the promotion rule", () => {
  it("a `proposal`-named declaration in a curation file is permitted; `promotion`/`promote` there is still a finding", () => {
    const planted = new Map([
      [
        "packages/db/src/frameworks.ts",
        "export function buildSharedFrameworkProposal(x) { return x; }\nexport function promoteFrameworkToApproved(x) { return x; }\ntype PromotionCandidate = { id: string };\n",
      ],
    ]);
    expect(scanNamedProposalConstructors(planted).map((f) => `${f.symbol}:${f.rule}`).sort()).toEqual(
      ["PromotionCandidate:promotion", "promoteFrameworkToApproved:promote"].sort()
    );
  });

  it("the allowance is EXACT FILES: the same declaration in a sibling of a curation file is a finding", () => {
    // `packages/trends/src/framework-proposal.ts` is here on purpose: it was
    // the deleted port, and a re-created file of that name gets no allowance.
    for (const sibling of ["packages/db/src/feedback-ops.ts", "packages/trends/src/access.ts", "packages/trends/src/framework-proposal.ts", "packages/db/src/frameworks.test.ts"]) {
      expect(
        scanNamedProposalConstructors(new Map([[sibling, "export function buildSharedFrameworkProposal(x) { return x; }\n"]])).map((f) => f.symbol),
        sibling
      ).toEqual(["buildSharedFrameworkProposal"]);
    }
    // ...and every allowed path really exists, so the list cannot rot.
    for (const file of CURATION_PROPOSAL_FILES) expect(statSync(join(ROOT, file)).isFile(), file).toBe(true);
  });

  const frameworksSource = () => readFileSync(join(ROOT, "packages/db/src/frameworks.ts"), "utf8");
  const systemSpendSource = () => readFileSync(join(ROOT, "packages/db/src/system-spend.ts"), "utf8");

  it("POSITIVE, THE REAL REPO: the curation path's sole write target is `frameworks`, always `curatorStatus: \"proposed\"`, never via `.set`", () => {
    // AST-level over `packages/db/src/frameworks.ts` (the three named writers)
    // and `packages/db/src/system-spend.ts` (the finalize transaction that
    // calls them) — not a DB-level assertion, because what R-94 forbids is a
    // second write TARGET, which is a property of the source.
    const findings = scanCurationWrites(frameworksSource(), CURATION_WRITERS);
    expect(findings.filter((f) => f.kind === "missing"), "a curation writer was renamed away — update CURATION_WRITERS").toEqual([]);
    const writes = findings.filter((f): f is Extract<CurationWriteFinding, { kind: "write" }> => f.kind === "write");
    expect(writes.length, "the scan saw no writes at all — it is measuring nothing").toBeGreaterThan(0);
    expect([...new Set(writes.map((w) => w.target))]).toEqual(["frameworks"]);
    expect(writes.some((w) => w.verb === "insert")).toBe(true);
    const statuses = findings.filter((f): f is Extract<CurationWriteFinding, { kind: "curatorStatus" }> => f.kind === "curatorStatus");
    expect(statuses.length, "no curatorStatus literal seen on the insert").toBeGreaterThan(0);
    for (const s of statuses) {
      expect(s.via, `${s.fn} writes curatorStatus through .set — an UPDATE of a curation status is approval, which is 10b-1's human act`).toBe("values");
      expect(s.value, s.fn).toBe('"proposed"');
    }
    // The finalize transaction reaches the curation path only by CALL; it
    // never writes `frameworks` itself.
    const spend = systemSpendSource();
    expect(spend).toContain("resolveAutopsyFramework(");
    expect(spend).not.toMatch(/\.(insert|update|delete)\(\s*frameworks\s*\)/);
    // ...and the negation is non-vacuous: the same regex sees a planted write.
    expect("await tx.insert(frameworks).values({})").toMatch(/\.(insert|update|delete)\(\s*frameworks\s*\)/);
  });

  it("...and the positive check SEES each violation it forbids (doctored copies of the real source)", () => {
    const real = frameworksSource();
    const approved = real.replace(
      /(async function insertProposedSharedFramework[\s\S]*?curatorStatus: )"proposed"/,
      '$1"approved"'
    );
    expect(approved, "the doctoring anchor no longer exists").not.toBe(real);
    expect(
      scanCurationWrites(approved, CURATION_WRITERS).filter((f) => f.kind === "curatorStatus").map((f) => (f as { value: string }).value)
    ).toContain('"approved"');

    const secondTarget = real.replace(
      "async function insertProposedSharedFramework(",
      "async function insertProposedSharedFramework(\n  _p = db.insert(brainDocs).values({}),"
    );
    expect(secondTarget).not.toBe(real);
    expect(
      scanCurationWrites(secondTarget, CURATION_WRITERS).filter((f) => f.kind === "write").map((f) => (f as { target: string }).target)
    ).toContain("brainDocs");

    const viaSet = real.replace(
      /(async function resolveAutopsyFramework[\s\S]*?\.set\(\{ )supersededAt/,
      '$1curatorStatus: "approved", supersededAt'
    );
    expect(viaSet).not.toBe(real);
    expect(
      scanCurationWrites(viaSet, CURATION_WRITERS).filter((f) => f.kind === "curatorStatus" && (f as { via: string }).via === "set")
    ).toHaveLength(1);

    expect(scanCurationWrites("const other = 1;", CURATION_WRITERS)).toEqual(
      CURATION_WRITERS.map((fn) => ({ fn, kind: "missing" }))
    );
  });
});

describe("R11: the one permitted feedback query aggregates nothing", () => {
  const readerSource = () =>
    readFileSync(join(ROOT, RAW_FEEDBACK_READER_FILES[0]), "utf8");

  it("the real `feedbackPage` helper contains no aggregate and no groupBy", () => {
    expect(
      scanFeedbackAggregation(readerSource()),
      "the one permitted feedback query aggregates — slice 7 captures feedback and derives nothing from it (R11)"
    ).toEqual([]);
  });

  it("...and the check SEES a planted aggregate (it is not vacuous)", () => {
    // The plant is a doctored copy of the REAL source, so the negative case is
    // this repo minus the property rather than a hand-typed fixture.
    const doctored = readerSource().replace(
      ".from(generationFeedback)",
      ".from(generationFeedback)\n        .groupBy(generationFeedback.reaction)"
    );
    expect(
      doctored,
      "the doctoring anchor no longer exists — this probe is measuring nothing"
    ).not.toBe(readerSource());
    expect(scanFeedbackAggregation(doctored)).toContain("groupBy");
    // ...and a `count()` inside the helper is seen too, which is the shape a
    // "you have said this three times" banner would arrive as.
    const counted = readerSource().replace(
      "const feedbackPage = (",
      "const feedbackPage = (\n      // @ts-expect-error probe\n      _probe = count(),"
    );
    expect(scanFeedbackAggregation(counted)).toContain("count");
  });

  it("...and it fails LOUDLY if the helper is renamed away", () => {
    // A scan that cannot find its subject must say so rather than return `[]`,
    // which is the fail-open shape this whole file exists to avoid.
    expect(scanFeedbackAggregation("const other = 1;")).toEqual([
      "<feedbackPage helper not found>",
    ]);
  });
});
