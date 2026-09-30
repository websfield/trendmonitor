// THE GATE IS NOT A CATCHABLE ERROR (round-2 CHANGE 1).
//
// Next signals navigation and HTTP fallbacks by THROWING a plain `Error` with a
// `digest`, so `requireUser()`'s redirect and `requireAdmin()`'s notFound() are
// caught by any bare `catch (err)` that encloses them. When they were called
// INSIDE the actions' try/catch, an expired session on an open billing form
// became `/settings/billing?e=unknown` and a non-admin POST was told "The
// configuration could not be saved and no version was appended" — naming an
// internal failure that never occurred. No authorization was bypassed (both
// helpers throw before any operation runs) but the phase's own disclosure
// ("my catches wrap only the operation, never the redirect") was false, and
// nothing asserted it. This file is the assertion.
//
// Three levels, deliberately: the primitive, the two real actions, and a source
// scan over every catch in app/** and lib/** so the NEXT one cannot regress.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { scratchDir } from "./support/scratch-dir";
import ts from "typescript";
import { notFound, redirect } from "next/navigation";
import { rethrowNextControlFlow } from "../lib/next-control-flow";
import { SCAN_ROOTS, blankComments, walkCodeFiles } from "./support/app-surface";

const respinRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Capture the error a Next control-flow helper throws. */
function thrownBy(fn: () => void): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected the helper to throw — the premise of this file");
}

describe("Next control-flow signals are re-thrown, never swallowed", () => {
  it("redirect() and notFound() throw digest-bearing plain Errors (the premise, verified against the INSTALLED next)", () => {
    const red = thrownBy(() => redirect("/sign-in")) as Error & {
      digest?: string;
    };
    const nf = thrownBy(() => notFound()) as Error & { digest?: string };
    // Plain Errors: `instanceof` cannot distinguish them from a domain failure,
    // which is exactly why a bare catch swallows them.
    expect(red.constructor.name).toBe("Error");
    expect(nf.constructor.name).toBe("Error");
    expect(red.digest).toMatch(/^NEXT_REDIRECT;/);
    expect(red.digest).toContain("/sign-in");
    expect(nf.digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("rethrowNextControlFlow re-throws BOTH, and the SAME object", () => {
    for (const err of [
      thrownBy(() => redirect("/sign-in")),
      thrownBy(() => notFound()),
    ]) {
      let caught: unknown;
      try {
        rethrowNextControlFlow(err);
      } catch (e) {
        caught = e;
      }
      expect(caught, "the signal must propagate unchanged").toBe(err);
    }
  });

  it("NON-VACUITY: a real domain error passes straight through (this is not a blanket rethrow)", () => {
    expect(() => rethrowNextControlFlow(new Error("stripe is down"))).not.toThrow();
    expect(() => rethrowNextControlFlow("not even an error")).not.toThrow();
    expect(() => rethrowNextControlFlow(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------- the actions

// The gates are mocked to throw exactly what the real ones throw. That is the
// whole failure: `requireUser()` REFUSES by throwing, so an action that calls
// it inside a try/catch converts an authentication outcome into a domain error.
vi.mock("@respin/auth", () => ({
  requireUser: vi.fn(async () => {
    redirect("/sign-in");
    throw new Error("unreachable");
  }),
  requireAdmin: vi.fn(async () => {
    notFound();
    throw new Error("unreachable");
  }),
}));

describe("the billing server actions propagate their gate's refusal", () => {
  it("every billing action re-throws requireUser()'s NEXT_REDIRECT — never `?e=unknown`", async () => {
    const actions = await import("../app/(product)/settings/billing/actions");
    // DERIVED from the module's own exports, not hand-listed (audit
    // 2026-08-17 remediation R2). This list used to be six literals with
    // `expect(named).toHaveLength(6)` beside them — which meant the assertion
    // guarded the list's length, not the module's surface, so #8's new
    // `recoverInvoiceAction` was added and the gate check simply did not see
    // it. A `"use server"` module may export only async functions, so every
    // export IS a POST endpoint with a stable action id, and every one of them
    // must carry the gate. Same rule as the isolation suite's enumeration:
    // derive what SHOULD be covered from the source, or a new export escapes.
    const named = Object.entries(actions).filter(
      (entry): entry is [string, (fd: FormData) => Promise<void>] =>
        typeof entry[1] === "function"
    );
    expect(
      named.length,
      "every export of a `use server` module is a POST endpoint and must be gated"
    ).toBeGreaterThanOrEqual(7);
    for (const [name, action] of named) {
      const fd = new FormData();
      fd.set("tier", "creator");
      fd.set("months", "1");
      let caught: (Error & { digest?: string }) | undefined;
      try {
        await action(fd);
      } catch (err) {
        caught = err as Error & { digest?: string };
      }
      expect(caught?.digest, `${name} must propagate the gate's redirect`).toMatch(
        /^NEXT_REDIRECT;/
      );
      expect(caught?.digest, `${name} must redirect to sign-in`).toContain(
        "/sign-in"
      );
      // ...and specifically NOT the failure channel: a domain refusal would
      // redirect to the billing page with a code.
      expect(caught?.digest).not.toContain("e=unknown");
    }
  });

  it("appendConfigAction re-throws requireAdmin()'s 404 — never 'the configuration could not be saved'", async () => {
    const { appendConfigAction } = await import(
      "../app/(admin)/admin/config/actions"
    );
    const fd = new FormData();
    fd.set("content", "{}");
    let caught: (Error & { digest?: string }) | undefined;
    let returned: unknown;
    try {
      returned = await appendConfigAction({ status: "idle" }, fd);
    } catch (err) {
      caught = err as Error & { digest?: string };
    }
    expect(returned, "a refused admin POST must not RETURN a form state").toBe(
      undefined
    );
    expect(caught?.digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});

// ------------------------------------------------------- the class, by source

/**
 * The per-action fix closes the seven call sites that exist. This closes the
 * CLASS: M2's pages and actions inherit it without anyone remembering.
 *//**
 * Every `catch (x) {` whose FIRST statement is not `rethrowNextControlFlow(x)`.
 * A binding-less `catch {` is reported too: it cannot re-throw what it cannot
 * name, so it may not exist in this tree.
 *
 * The walk comes from `./support/app-surface`, shared
 * with gate-completeness.test.ts (round-3 meta-finding): this file used to
 * define its own `SCAN_ROOTS = ["app","lib"]` — one root short of the
 * import-boundary suite's, so a swallowing catch in `middleware.ts` was
 * unscanned — and its own `CODE_FILE = /\.tsx?$/`, so a `.js`/`.jsx` file in
 * `app/` was unscanned too. Syntax traversal ignores string contents while
 * still visiting executable expressions inside template interpolations.
 *
 * The AST rewrite introduced two fail-OPEN holes that the regex did not have,
 * both caught by the phase-1 gate and both fixed here. `ScriptKind` was picked
 * with `endsWith("x")`, so `.js` — which `CODE_EXTENSIONS` includes and which
 * Next accepts as a page — parsed as `ScriptKind.TS`, and TS cannot parse JSX:
 * idiomatic React in a `.js` file yielded ZERO catches and three discarded
 * parse errors. And `ts.createSourceFile` never throws, so any file the parser
 * chokes on was scanned as clean. `scriptKindFor` below maps every extension
 * in `CODE_EXTENSIONS`, and an unparseable file is now an OFFENDER, not a pass:
 * a scanner that did not read a file must say so rather than report success
 * (the 2026-08-26 lesson). Both shapes are planted in the matrix below.
 */
function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx") || file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

export function findSwallowingCatches(root: string): string[] {
  const offenders: string[] = [];
  for (const file of walkCodeFiles(root)) {
    const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
      scriptKindFor(file));
    const rel = relative(root, file).split(sep).join("/") || basename(file);
    // A truncated tree hides every catch below the syntax error. Report the
    // file instead of silently scanning nothing.
    const parseErrors = (src as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
    if (parseErrors && parseErrors.length > 0) {
      offenders.push(`${rel}: did not parse — the catch scan is not evidence for this file`);
      continue;
    }
    function visit(node: ts.Node): void {
      if (ts.isCatchClause(node)) {
        const name = node.variableDeclaration?.name;
        if (!name || !ts.isIdentifier(name)) {
          offenders.push(`${rel}: catch with no binding cannot re-throw`);
        } else {
          const first = node.block.statements[0];
          const call = first && ts.isExpressionStatement(first) && ts.isCallExpression(first.expression)
            ? first.expression : undefined;
          if (!call || !ts.isIdentifier(call.expression) || call.expression.text !== "rethrowNextControlFlow"
            || call.arguments.length !== 1 || !ts.isIdentifier(call.arguments[0]) || call.arguments[0].text !== name.text) {
            offenders.push(`${rel}: catch (${name.text}) does not re-throw Next control flow first`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(src);
  }
  return offenders;
}

describe("no catch in app/, lib/ or middleware.ts can swallow a Next signal (source scan)", () => {
  it("ignores quoted code but still detects a swallowing catch inside a template interpolation", () => {
    const root = scratchDir("respin-catch-literals-");
    writeFileSync(join(root, "literals.ts"), [
      'export const text = "try {} catch {}";',
      'export const template = `example catch {}`;',
      'export const active = `prefix ${(() => { try { f(); } catch (err) { handle(err); } })()}`;',
    ].join("\n"));
    expect(findSwallowingCatches(root)).toEqual([
      "literals.ts: catch (err) does not re-throw Next control flow first",
    ]);
  });
  it("every catch re-throws control flow as its FIRST statement", () => {
    const offenders = SCAN_ROOTS.flatMap((r) =>
      findSwallowingCatches(resolve(respinRoot, r))
    );
    expect(
      offenders,
      "add `rethrowNextControlFlow(err);` as the first line of the catch — a redirect() or notFound() thrown inside it is otherwise reported as a domain failure"
    ).toEqual([]);
  });

  it("the scan is READING real code (non-vacuity: this tree has catches, and they pass)", () => {
    const seen = SCAN_ROOTS.flatMap((r) => walkCodeFiles(resolve(respinRoot, r)));
    expect(seen.length).toBeGreaterThan(10);
    // middleware.ts is in the walk — the root this file used to be missing.
    expect(seen.some((f) => f.endsWith(`${sep}middleware.ts`))).toBe(true);
    const catchCount = seen
      .map((f) => blankComments(readFileSync(f, "utf8")))
      .join("\n")
      .match(/\bcatch\s*\(/g);
    expect(catchCount?.length ?? 0).toBeGreaterThan(8);
    // The count above is a REGEX over the same files — it cannot tell whether
    // findSwallowingCatches itself read anything, so a scanner that saw zero
    // catch clauses used to leave this test green (phase-1 gate, BLOCK). Count
    // what the REAL function's own parser sees, and require it to agree.
    const astCatches = seen.reduce((total, f) => {
      const src = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, scriptKindFor(f));
      expect(
        (src as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [],
        `${f} does not parse under the ScriptKind the scanner picks — every catch below the error is invisible to it`
      ).toEqual([]);
      let count = 0;
      const visit = (node: ts.Node): void => {
        if (ts.isCatchClause(node)) count += 1;
        ts.forEachChild(node, visit);
      };
      visit(src);
      return total + count;
    }, 0);
    expect(
      astCatches,
      "the scanner's own AST walk must see the catches the regex sees — if this is 0 while the regex count is not, the scan is vacuous"
    ).toBeGreaterThan(8);
  });

  it("PLANTED SHAPES: the REAL findSwallowingCatches reports every swallow, in every extension it must scan", () => {
    // Round 2 re-spelled the regex inline here instead of calling the
    // function, so drift in the walk, the regex or the first-statement
    // comparison shipped silently — an in-memory mutation making
    // findSwallowingCatches return [] unconditionally left this 7/7 GREEN
    // (round-3 CHANGE 2). This writes a tree and runs the real function.
    const root = scratchDir("respin-catch-");
    const write = (p: string, body: string) => {
      const full = join(root, ...p.split("/"));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    };
    write("bare.ts", "export const a = () => { try { f(); } catch (err) { console.error(err); } };\n");
    write("nested/nobinding.tsx", "export const b = () => { try { f(); } catch { console.error('nope'); } };\n");
    write(
      "commentfirst.ts",
      "export const c = () => { try { f(); } catch (e) { /* comment first */ console.log(e); } };\n"
    );
    // ...and the extensions the old `/\.tsx?$/` filter skipped entirely.
    write("legacy.js", "const d = () => { try { f(); } catch (err) { console.error(err); } };\n");
    write("legacy.jsx", "const e = () => { try { f(); } catch (err) { console.error(err); } };\n");
    // .mjs/.cjs — absent from CODE_EXTENSIONS until batch 1, so nothing walked
    // them and a swallowing catch here was never reported by any scanner.
    write("esm.mjs", "export const m = () => { try { f(); } catch (err) { console.error(err); } };\n");
    write("cjs.cjs", "const n = () => { try { f(); } catch (err) { console.error(err); } };\n");
    // JSX inside a `.js` file. Next accepts `.js` as a page extension and
    // `CODE_EXTENSIONS` includes it, but `endsWith("x")` sent it to
    // ScriptKind.TS, which cannot parse JSX: this exact shape returned ZERO
    // catches and three discarded parse errors (phase-1 gate, BLOCK). The
    // JSX-free `legacy.js` above passes either way, so it never covered this.
    write(
      "jsx-in-js.js",
      "export default function P({ items }) {\n" +
        "  return <ul>{items.map((i) => { try { return <li>{i}</li>; } catch (err) { log(err); } })}</ul>;\n" +
        "}\n"
    );
    // A file the parser cannot lex. `ts.createSourceFile` never throws, so this
    // used to be scanned as clean; it must now name itself instead.
    write(
      "unlexable.ts",
      "export const s = `unterminated\nexport const t = () => { try { f(); } catch (err) { console.error(err); } };\n"
    );
    // The COMPLIANT shape, which must NOT be reported (not a blanket ban).
    write(
      "good.ts",
      "export const g = () => { try { f(); } catch (err) { rethrowNextControlFlow(err); handle(err); } };\n"
    );
    // A catch mentioned only in a COMMENT must not be reported either.
    write("prose.ts", "// try { f(); } catch (err) { console.error(err); }\nexport const h = 1;\n");

    expect(findSwallowingCatches(root).sort()).toEqual([
      "bare.ts: catch (err) does not re-throw Next control flow first",
      "cjs.cjs: catch (err) does not re-throw Next control flow first",
      "commentfirst.ts: catch (e) does not re-throw Next control flow first",
      "esm.mjs: catch (err) does not re-throw Next control flow first",
      "jsx-in-js.js: catch (err) does not re-throw Next control flow first",
      "legacy.js: catch (err) does not re-throw Next control flow first",
      "legacy.jsx: catch (err) does not re-throw Next control flow first",
      "nested/nobinding.tsx: catch with no binding cannot re-throw",
      "unlexable.ts: did not parse — the catch scan is not evidence for this file",
    ]);
  });
});
