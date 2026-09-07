// A `"use client"` module must not reach a server-only package.
//
// THE DEFECT THIS EXISTS FOR, and it shipped green through typecheck, lint and
// 994 tests before `next build` caught it (slice 2a, 2026-08-28). The metered
// run's result component imported one sentence helper from
// `app/(product)/onboarding/copy.ts`; that module imports `../billing-errors`
// for its refusal table; that imports `@respin/credits/app-server`, which
// reaches `@respin/db`, which imports `pg`. The client bundle was therefore
// handed a Postgres driver, and the build failed with
// "Module not found: Can't resolve 'dns'" — a message that names `dns`, not
// the import that caused it.
//
// `next build` IS in the entry gate, so this is not the only thing standing
// between the tree and that defect. What it adds is the thing the build does
// not give: the CHAIN. A test that names every hop from the client module to
// the server package turns a webpack module-resolution error into "run-outcome
// -> copy -> billing-errors -> @respin/credits/app-server", which is the
// sentence that tells you where to cut.
//
// It walks RELATIVE imports only, which is exactly the graph inside `app/**`,
// and stops at the first `@respin/*` specifier — package-level boundaries are
// already enforced by eslint in `import-boundary.test.ts`, and this is the
// question that rule cannot ask: not "may this file import it?" but "does a
// CLIENT file reach it, several hops away?".
import { readFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { blankComments, walkCodeFiles } from "./support/app-surface";

const respinRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(respinRoot, "app");

/**
 * Every package a module reaches that only runs on a server.
 *
 * `@respin/db` and `@respin/credits` pull in `pg`; `@respin/auth` and
 * `@respin/config`'s server entrypoints reach the same connection. A client
 * module may import NONE of them, at any depth.
 */
const SERVER_ONLY = /^@respin\//;

/**
 * The ONE `@respin/*` specifier a client module may import, and it is allowed
 * on evidence rather than on its name.
 *
 * `@respin/auth/client` is a declared client entrypoint
 * (`packages/auth/package.json` maps `"./client"` to `src/client.ts`) whose
 * whole body is `createAuthClient` from `better-auth/react` — a browser SDK.
 * The two modules that import it, the sign-in form and the sign-out button,
 * are the reason a session exists in the browser at all.
 *
 * IT IS NOT TRUSTED BY SUFFIX. The test below walks the allowlisted
 * entrypoint's OWN import graph and fails if it ever reaches a server-only
 * module, so the day someone adds a database read to it, this allowance
 * expires rather than covering it.
 */
const CLIENT_ENTRYPOINTS = new Set(["@respin/auth/client"]);

/**
 * `import type` and `export type` are ERASED before bundling, so they cannot
 * put anything in a bundle. Anything else is a value import and counts.
 *
 * Built from a RegExp literal rather than assembled from a string: a lost
 * backslash turns the pattern into one that matches nothing, and a scan that
 * matches nothing reports clean (CLAUDE.md, 2026-08-21).
 */
const VALUE_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)([\s\S]*?)from\s*["']([^"']+)["']/g;

/** Every specifier a file imports as a VALUE, in source order. */
export function valueImports(src: string): string[] {
  const code = blankComments(src);
  const out: string[] = [];
  for (const m of code.matchAll(VALUE_IMPORT)) {
    // `import { type A, foo }` is still a value import (of `foo`); only a
    // whole-clause `import type` is erased, and the lookahead above rejects it.
    out.push(m[2]);
  }
  // Bare side-effect imports (`import "./x"`) carry no clause and no `from`.
  for (const m of code.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  return out;
}

/** Resolve a relative specifier to a file on disk, trying the usual suffixes. */
function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = extname(base)
    ? [base]
    : [".ts", ".tsx", ".js", ".jsx"].flatMap((e) => [
        `${base}${e}`,
        resolve(base, `index${e}`),
      ]);
  for (const c of candidates) {
    try {
      readFileSync(c, "utf8");
      return c;
    } catch {
      // not this suffix
    }
  }
  return null;
}

/**
 * The first path from `entry` to a server-only package, or null.
 *
 * Returned as the CHAIN rather than a boolean, because the chain is the whole
 * value of this test over the build error.
 */
export function pathToServerPackage(entry: string): string[] | null {
  const seen = new Set<string>();
  const stack: { file: string; chain: string[] }[] = [
    { file: entry, chain: [entry] },
  ];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const spec of valueImports(src)) {
      if (SERVER_ONLY.test(spec) && !CLIENT_ENTRYPOINTS.has(spec)) {
        return [...chain, spec];
      }
      const next = resolveRelative(file, spec);
      if (next !== null) stack.push({ file: next, chain: [...chain, next] });
    }
  }
  return null;
}

/** Every `"use client"` module under app/. */
function clientModules(): string[] {
  return [...walkCodeFiles(appRoot)].filter((f) => {
    const head = readFileSync(f, "utf8").slice(0, 200);
    return /^\s*(?:\/\/[^\n]*\n|\s)*["']use client["']/.test(head);
  });
}

const rel = (f: string) => relative(respinRoot, f).split(sep).join("/");

describe("no client module reaches a server-only package", () => {
  it("NON-VACUITY: this tree HAS client modules, and the walk finds them", () => {
    // An empty entry set would make the assertion below vacuously true — the
    // failure mode where a scan reports clean because it scanned nothing.
    const entries = clientModules();
    expect(entries.length, "no `use client` module was found at all").toBeGreaterThan(2);
    expect(entries.map(rel)).toContain(
      "app/(product)/onboarding/run-inference-panel.tsx"
    );
  });

  it("every `use client` module's import graph stays out of @respin/*", () => {
    const offenders = clientModules()
      .map((f) => pathToServerPackage(f))
      .filter((c): c is string[] => c !== null)
      .map((chain) => chain.map((h) => (h.startsWith("@") ? h : rel(h))).join(" -> "));
    expect(
      offenders,
      "a client module reaches a server-only package — the bundle gets `pg`, and the build fails naming `dns` rather than the import"
    ).toEqual([]);
  });

  it("the ONE allowlisted client entrypoint is clean ITSELF — allowed on evidence, not on its name", () => {
    // An allowlist that is never re-checked is a hole with a comment on it.
    // `@respin/auth/client` is permitted because its own graph is clean; this
    // is what makes that sentence true rather than believed.
    for (const spec of CLIENT_ENTRYPOINTS) {
      const file = resolve(
        respinRoot,
        "packages",
        spec.replace("@respin/", "").split("/")[0],
        "src",
        `${spec.split("/").slice(2).join("/") || "index"}.ts`
      );
      const chain = pathToServerPackage(file);
      expect(
        chain === null ? null : chain.join(" -> "),
        `${spec} is allowlisted for client modules but reaches a server-only package itself`
      ).toBeNull();
    }
  });


  it("NON-VACUITY: the walk really CAN report a chain (the defect, reconstructed)", () => {
    // The exact shape that shipped: the panel's result component reaching
    // `../billing-errors`, which imports `@respin/credits/app-server`. Driven
    // through the REAL `pathToServerPackage`, from a file that genuinely has
    // that import, so drift in the walk or the regex shows up here.
    const chain = pathToServerPackage(
      resolve(appRoot, "(product)", "billing-errors.ts")
    );
    expect(chain, "billing-errors imports a server package — that is the premise").not.toBeNull();
    expect(chain!.at(-1)).toMatch(SERVER_ONLY);
  });

  it("an `import type` clause is NOT counted — it is erased before bundling", () => {
    expect(valueImports('import type { A } from "@respin/db";\n')).toEqual([]);
    expect(valueImports('export type { A } from "@respin/db";\n')).toEqual([]);
    // ...and the value forms ARE counted, including a side-effect import and a
    // clause with an inline `type` specifier beside a real one.
    expect(valueImports('import { A } from "@respin/db";\n')).toEqual(["@respin/db"]);
    expect(valueImports('import { type A, b } from "@respin/db";\n')).toEqual([
      "@respin/db",
    ]);
    expect(valueImports('import "@respin/db";\n')).toEqual(["@respin/db"]);
  });
});
