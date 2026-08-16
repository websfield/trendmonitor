// THE ASSERTION app-server.ts's comment claimed (billing + tenancy round-7
// CHANGE 2). The comment said "the isolation suite now asserts this set covers
// the thrown surface"; no such assertion existed — `isolation.test.ts` builds
// its `exported` list from the union of ENUMERATED modules, so deleting a
// facade re-export left every one of its assertions green. And the claim was
// false: `respinCredits.getBalance` → `deriveBalance` → `foldLedger` throws
// `LedgerIntegrityError`, which the facade did not re-export, so the Phase-4
// usage page — whose only permitted entrypoint IS the facade — could not
// `instanceof` it.
//
// The property, stated once: every Error SUBCLASS that a STATIC call-graph walk
// can reach from a facade method must be re-exported by that facade. It is
// checked by walking the real source, not by a list someone maintains.
//
// Honest limits of the mechanism, so nobody over-trusts it. Round 10 turned
// each one from prose into something checked below, because "a comment claiming
// a property is not the property" is a CLAUDE.md lesson this very file exists to
// discharge:
//  1. Plain `throw new Error(...)` has no class to re-export, so the walk cannot
//     demand one. Rather than only disclosing that, the app-facing facade now
//     has ZERO reachable plain throws (round-10 NOTE 1 converted nine of them to
//     typed classes) and the test below ASSERTS that set is empty. The webhook
//     facade keeps its bare throws on purpose — they exist to become a 500 so
//     Stripe redelivers — and they are pinned to exactly one file.
//  2. It follows RELATIVE imports only. A class thrown by another package
//     reaches app/** through THAT package's own facade; the one that matters
//     today, ConfigUnavailableError, is asserted below on @respin/config's.
//  3. It resolves identifiers, not values: a function stored in a data structure
//     and called dynamically would be invisible, a namespace or default import
//     would not resolve, and a class extending an intermediate Error subclass
//     would not be recognised. All three are NON-BINDING today, and the last
//     test in this file checks that they still are — it does not ask you to
//     believe it.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import ts from "typescript";
import * as appServer from "../src/app-server";
import * as webhookServer from "../src/webhook-server";
import * as configAppServer from "@respin/config/app-server";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

function walkDir(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walkDir(resolve(dir, e.name))
      : e.name.endsWith(".ts")
        ? [resolve(dir, e.name)]
        : []
  );
}

type Analysed = {
  /** local name → { file, name } for RELATIVE imports only. */
  imports: Map<string, { file: string; name: string }>;
  /** top-level function-ish declarations by name. */
  functions: Map<string, ts.Node>;
  /** `const x = y;` aliases by name. */
  aliases: Map<string, string>;
  /** classes declared here that extend Error. */
  errorClasses: Set<string>;
  /** classes declared here that extend something OTHER than Error (limit 3). */
  nonErrorSubclasses: Map<string, string>;
  /** relative import declarations whose bindings the walk cannot resolve (limit 3). */
  unresolvableRelativeImports: string[];
  source: ts.SourceFile;
};

function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, resolve(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

/**
 * @param text optional source OVERRIDE — the seam the non-vacuity proof needs:
 * it re-analyses one real file from mutated text (with a planted unexported
 * error class) and re-runs the walk over that map.
 */
function analyse(file: string, text?: string): Analysed {
  const source = ts.createSourceFile(
    file,
    text ?? readFileSync(file, "utf8"),
    ts.ScriptTarget.ES2022,
    true
  );
  const imports = new Map<string, { file: string; name: string }>();
  const functions = new Map<string, ts.Node>();
  const aliases = new Map<string, string>();
  const errorClasses = new Set<string>();
  const nonErrorSubclasses = new Map<string, string>();
  const unresolvableRelativeImports: string[] = [];

  for (const stmt of source.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = resolveRelative(file, stmt.moduleSpecifier.text);
      const bindings = stmt.importClause?.namedBindings;
      if (target && bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          imports.set(el.name.text, {
            file: target,
            name: (el.propertyName ?? el.name).text,
          });
        }
      } else if (target && !stmt.importClause?.isTypeOnly) {
        // A relative import the walk cannot follow: a namespace import
        // (`import * as x`), a default import, or a bare side-effect import.
        // Limit 3 in the header claims there are none; this is what makes that
        // claim checkable instead of remembered.
        unresolvableRelativeImports.push(
          `${relative(SRC, file).replace(/\\/g, "/")}: ${stmt.getText(source).split("\n")[0]}`
        );
      }
      continue;
    }
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      functions.set(stmt.name.text, stmt);
      continue;
    }
    if (ts.isClassDeclaration(stmt) && stmt.name) {
      const heritage = (stmt.heritageClauses ?? []).find(
        (h) => h.token === ts.SyntaxKind.ExtendsKeyword
      );
      const base = heritage?.types[0]?.expression.getText(source);
      if (base === "Error") errorClasses.add(stmt.name.text);
      else if (base) nonErrorSubclasses.set(stmt.name.text, base);
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        if (ts.isIdentifier(decl.initializer)) {
          aliases.set(decl.name.text, decl.initializer.text);
        } else {
          functions.set(decl.name.text, decl.initializer);
        }
      }
    }
  }
  return {
    imports,
    functions,
    aliases,
    errorClasses,
    nonErrorSubclasses,
    unresolvableRelativeImports,
    source,
  };
}

const FILES = walkDir(SRC);
const ANALYSED = new Map<string, Analysed>(FILES.map((f) => [f, analyse(f)]));

type WalkResult = {
  /** Error subclasses constructible from anything reachable from `starts`. */
  errors: Set<string>;
  /** Files reachable from `starts` that construct a BARE `new Error(...)`. */
  plainErrorFiles: Set<string>;
};

/** Error classes thrown by anything reachable from `starts`. */
function reachableErrors(
  starts: { file: string; node: ts.Node }[],
  analysed: Map<string, Analysed> = ANALYSED
): WalkResult {
  const errors = new Set<string>();
  const plainErrorFiles = new Set<string>();
  const seen = new Set<string>();
  const queue = [...starts];

  const lookup = (
    file: string,
    name: string
  ): { file: string; node: ts.Node } | { file: string; errorClass: string } | null => {
    const a = analysed.get(file);
    if (!a) return null;
    if (a.errorClasses.has(name)) return { file, errorClass: name };
    const alias = a.aliases.get(name);
    if (alias && alias !== name) return lookup(file, alias);
    const fn = a.functions.get(name);
    if (fn) return { file, node: fn };
    const imp = a.imports.get(name);
    if (imp) return lookup(imp.file, imp.name);
    return null;
  };

  while (queue.length > 0) {
    const { file, node } = queue.shift()!;
    const a = analysed.get(file);
    if (!a) continue;
    const visit = (n: ts.Node): void => {
      if (
        (ts.isCallExpression(n) || ts.isNewExpression(n)) &&
        ts.isIdentifier(n.expression)
      ) {
        if (ts.isNewExpression(n) && n.expression.text === "Error") {
          plainErrorFiles.add(relative(SRC, file).replace(/\\/g, "/"));
        }
        const target = lookup(file, n.expression.text);
        if (target && "errorClass" in target) {
          errors.add(target.errorClass);
        } else if (target) {
          const key = `${target.file}#${n.expression.text}`;
          if (!seen.has(key)) {
            seen.add(key);
            queue.push(target);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
  }
  return { errors, plainErrorFiles };
}

/** The methods of an exported facade object literal, as start nodes. */
function facadeMethods(
  file: string,
  constName: string,
  analysed: Map<string, Analysed> = ANALYSED
): { file: string; node: ts.Node }[] {
  const a = analysed.get(file)!;
  const obj = a.functions.get(constName);
  expect(obj, `${constName} must be an exported object literal in ${file}`).toBeDefined();
  expect(ts.isObjectLiteralExpression(obj!)).toBe(true);
  return (obj as ts.ObjectLiteralExpression).properties.map((p) => ({
    file,
    node: p,
  }));
}

const APP_SERVER = resolve(SRC, "app-server.ts");
const WEBHOOK_SERVER = resolve(SRC, "webhook-server.ts");

function exportedErrorNames(mod: Record<string, unknown>): Set<string> {
  return new Set(
    Object.entries(mod)
      .filter(
        ([, v]) =>
          typeof v === "function" &&
          (v === Error || Object.prototype.isPrototypeOf.call(Error, v))
      )
      .map(([k]) => k)
  );
}

describe("facade error surface (billing/tenancy round-7 CHANGE 2)", () => {
  it("@respin/credits/app-server re-exports every Error subclass the static call-graph walk reaches from its methods", () => {
    const { errors: reachable } = reachableErrors(
      facadeMethods(APP_SERVER, "respinCredits")
    );
    // Non-vacuity: the walk must actually reach through several modules — if
    // resolution silently broke, this set would collapse and the assertion
    // below would pass by finding nothing.
    expect(reachable.size).toBeGreaterThanOrEqual(4);
    expect(reachable, "the walk must reach the ledger fold").toContain(
      "LedgerIntegrityError"
    );
    expect(reachable, "the walk must reach the Stripe adapter").toContain(
      "StripeNotConfiguredError"
    );
    const exported = exportedErrorNames(appServer as unknown as Record<string, unknown>);
    expect(
      [...reachable].filter((name) => !exported.has(name)),
      "app/** may import ONLY this facade, so an error it cannot instanceof is an opaque failure"
    ).toEqual([]);
  });

  it("@respin/credits/webhook-server re-exports every Error subclass the walk reaches from its methods", () => {
    const { errors: reachable } = reachableErrors(
      facadeMethods(WEBHOOK_SERVER, "respinStripeWebhook")
    );
    expect(reachable).toContain("DuplicateStripeEvent");
    const exported = exportedErrorNames(
      webhookServer as unknown as Record<string, unknown>
    );
    expect(
      [...reachable].filter((name) => !exported.has(name)),
      "the webhook route may import ONLY this facade"
    ).toEqual([]);
  });

  it("does NOT demand errors that are unreachable from a facade method", () => {
    // The rule is "what it can throw", not "everything in the package": the
    // debit-path errors live behind `debitCredits`/`adjustCredits`, which no
    // facade method calls (their caller is M3's generation pipeline). Adding
    // them here would be a claim the code does not support.
    const reachable = new Set([
      ...reachableErrors(facadeMethods(APP_SERVER, "respinCredits")).errors,
      ...reachableErrors(facadeMethods(WEBHOOK_SERVER, "respinStripeWebhook")).errors,
    ]);
    expect(reachable).not.toContain("InsufficientCreditsError");
    expect(reachable).not.toContain("WorkspacePausedError");
    expect(reachable).not.toContain("RefundSourceNeverExpiresError");
    // ...and those classes really do exist, so the assertion is about
    // reachability rather than about a typo.
    const declared = new Set(
      [...ANALYSED.values()].flatMap((a) => [...a.errorClasses])
    );
    for (const name of [
      "InsufficientCreditsError",
      "WorkspacePausedError",
      "RefundSourceNeverExpiresError",
    ]) {
      expect(declared, name).toContain(name);
    }
  });

  it("LIMIT 1 is EMPTY on the app facade: no plain `new Error` is reachable from a respinCredits method", () => {
    // The walk's one real blind spot, closed rather than disclosed (round-10
    // NOTE 1). `app/**` may import only the facade, so a bare Error thrown by
    // `createPortalUrl` ("no Stripe customer") was indistinguishable from a
    // Stripe outage at the only place that can render it — Phase 4's billing
    // page, which is the next thing written.
    const app = reachableErrors(facadeMethods(APP_SERVER, "respinCredits"));
    expect(
      [...app.plainErrorFiles].sort(),
      "these files still throw an anonymous Error on an app-reachable path — give it a class and re-export it"
    ).toEqual([]);

    // The WEBHOOK facade deliberately keeps its bare throws: each one exists to
    // become a non-2xx so Stripe redelivers (unmapped price, multi-item
    // subscription, missing service period). Typing them would suggest a caller
    // decision that does not exist — the route's only correct response is 500.
    // Pinned to exactly one file, so a bare throw appearing anywhere ELSE on
    // that path is a red test rather than a silent addition.
    const hook = reachableErrors(facadeMethods(WEBHOOK_SERVER, "respinStripeWebhook"));
    expect([...hook.plainErrorFiles].sort()).toEqual(["stripe/webhooks.ts"]);
  });

  it("the analysis is not vacuous: a PLANTED unexported error class is reported", () => {
    expect(FILES.length).toBeGreaterThan(10);
    const declared = new Set(
      [...ANALYSED.values()].flatMap((a) => [...a.errorClasses])
    );
    expect(declared.size).toBeGreaterThanOrEqual(8);
    expect(
      [...ANALYSED.entries()].filter(([, a]) => a.functions.size > 0).length
    ).toBeGreaterThan(8);

    // THE REAL PROOF (round-10 CHANGE 2 / tenancy CHANGE 1). What stood here
    // was `expect(relative(SRC, resolve(SRC, "balance.ts"))).toBe("balance.ts")`
    // under a comment claiming a planted class "must be reported — proven
    // here": a pure node:path identity that returns the same string for a file
    // that does not exist, and that touches neither ANALYSED nor
    // reachableErrors. It was the exact defect class this file was written to
    // eliminate, sitting inside the fix for that class.
    //
    // This plants a class in `balance.ts`'s SOURCE TEXT, on the real shape the
    // walk depends on — a facade method → a relative import → a function that
    // constructs an Error subclass — re-analyses that one file, and re-runs the
    // walk over the mutated map.
    const balanceFile = resolve(SRC, "balance.ts");
    const original = readFileSync(balanceFile, "utf8");
    const anchor = "await takeWorkspaceLock(tx, workspaceId);";
    expect(
      original.includes(anchor),
      "the plant needs a known statement inside deriveBalanceInTx"
    ).toBe(true);
    const mutatedText =
      original.replace(anchor, `throw new PlantedFacadeProbeError();\n  ${anchor}`) +
      "\nclass PlantedFacadeProbeError extends Error {}\n";
    expect(mutatedText).not.toBe(original);

    const mutatedMap = new Map(ANALYSED);
    mutatedMap.set(balanceFile, analyse(balanceFile, mutatedText));

    const planted = reachableErrors(
      facadeMethods(APP_SERVER, "respinCredits", mutatedMap),
      mutatedMap
    );
    expect(
      planted.errors,
      "the walk must reach a planted error class through getBalance → deriveBalance → deriveBalanceInTx"
    ).toContain("PlantedFacadeProbeError");
    // ...and it is NOT exported by the facade, so the round-7 assertion would
    // have failed on it — which is the property being proven.
    expect(
      exportedErrorNames(appServer as unknown as Record<string, unknown>)
    ).not.toContain("PlantedFacadeProbeError");
    // The un-mutated walk does not report it, so the report came from the
    // plant and not from somewhere else.
    expect(
      reachableErrors(facadeMethods(APP_SERVER, "respinCredits")).errors
    ).not.toContain("PlantedFacadeProbeError");
  });

  it("LIMIT 3 is non-binding today, and that is CHECKED rather than asserted in prose", () => {
    // (a) every relative import in credits/src is a NamedImports declaration,
    //     so `lookup` can follow all of them;
    const unresolvable = [...ANALYSED.values()].flatMap(
      (a) => a.unresolvableRelativeImports
    );
    expect(
      unresolvable,
      "a namespace/default relative import is invisible to the walk — it would silently shrink the graph"
    ).toEqual([]);

    // (b) every declared class extends `Error` DIRECTLY, so `errorClasses` is
    //     complete (a class extending an intermediate subclass would be missed);
    const indirect = [...ANALYSED.values()].flatMap((a) => [
      ...a.nonErrorSubclasses.entries(),
    ]);
    expect(
      indirect,
      "a class extending an Error SUBCLASS is not recognised as an error class by this walk"
    ).toEqual([]);

    // (c) the dispatcher is a `switch` with identifier calls, not a handler map
    //     — a table of functions is the shape the walk cannot follow at all.
    const webhookSrc = readFileSync(resolve(SRC, "stripe/webhooks.ts"), "utf8");
    expect(webhookSrc).toMatch(/switch\s*\(event\.type\)/);

    // Non-vacuity for (a) and (b): the collectors must actually have run over
    // real declarations, otherwise two empty arrays prove nothing.
    const classesSeen = [...ANALYSED.values()].reduce(
      (n, a) => n + a.errorClasses.size + a.nonErrorSubclasses.size,
      0
    );
    expect(classesSeen).toBeGreaterThanOrEqual(8);
    const relativeImportsSeen = [...ANALYSED.values()].reduce(
      (n, a) => n + a.imports.size,
      0
    );
    expect(relativeImportsSeen).toBeGreaterThan(20);
  });

  it("a cross-package error reaches app/** through ITS OWN facade (@respin/config)", () => {
    // getBillingState → getWorkspaceBillingState → getActiveConfig throws
    // ConfigUnavailableError. The walk above deliberately does not follow
    // package imports; this is the assertion that the other end is covered.
    expect(
      exportedErrorNames(configAppServer as unknown as Record<string, unknown>)
    ).toContain("ConfigUnavailableError");
  });
});
