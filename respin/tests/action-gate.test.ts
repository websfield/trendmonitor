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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
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

describe("the seven server actions propagate their gate's refusal", () => {
  it("every billing action re-throws requireUser()'s NEXT_REDIRECT — never `?e=unknown`", async () => {
    const actions = await import("../app/(product)/settings/billing/actions");
    const named: [string, (fd: FormData) => Promise<void>][] = [
      ["subscribeAction", actions.subscribeAction],
      ["buyPackAction", actions.buyPackAction],
      ["openPortalAction", actions.openPortalAction],
      ["pauseAction", actions.pauseAction],
      ["resumeAction", actions.resumeAction],
      ["setAutoTopupAction", actions.setAutoTopupAction],
    ];
    expect(named).toHaveLength(6);
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
 * The walk and the comment blanking come from `./support/app-surface`, shared
 * with gate-completeness.test.ts (round-3 meta-finding): this file used to
 * define its own `SCAN_ROOTS = ["app","lib"]` — one root short of the
 * import-boundary suite's, so a swallowing catch in `middleware.ts` was
 * unscanned — and its own `CODE_FILE = /\.tsx?$/`, so a `.js`/`.jsx` file in
 * `app/` was unscanned too.
 */
export function findSwallowingCatches(root: string): string[] {
  const offenders: string[] = [];
  for (const file of walkCodeFiles(root)) {
    const src = blankComments(readFileSync(file, "utf8"));
    const rel = relative(root, file).split(sep).join("/") || basename(file);
    const re = /\bcatch\s*(?:\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*)?\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const binding = m[1];
      const body = src.slice(m.index + m[0].length);
      if (!binding) {
        offenders.push(`${rel}: catch with no binding cannot re-throw`);
        continue;
      }
      const first = body.replace(/^\s+/, "");
      if (!first.startsWith(`rethrowNextControlFlow(${binding})`)) {
        offenders.push(
          `${rel}: catch (${binding}) does not re-throw Next control flow first`
        );
      }
    }
  }
  return offenders;
}

describe("no catch in app/, lib/ or middleware.ts can swallow a Next signal (source scan)", () => {
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
  });

  it("PLANTED SHAPES: the REAL findSwallowingCatches reports every swallow, in every extension it must scan", () => {
    // Round 2 re-spelled the regex inline here instead of calling the
    // function, so drift in the walk, the regex or the first-statement
    // comparison shipped silently — an in-memory mutation making
    // findSwallowingCatches return [] unconditionally left this 7/7 GREEN
    // (round-3 CHANGE 2). This writes a tree and runs the real function.
    const root = mkdtempSync(join(tmpdir(), "respin-catch-"));
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
    // The COMPLIANT shape, which must NOT be reported (not a blanket ban).
    write(
      "good.ts",
      "export const g = () => { try { f(); } catch (err) { rethrowNextControlFlow(err); handle(err); } };\n"
    );
    // A catch mentioned only in a COMMENT must not be reported either.
    write("prose.ts", "// try { f(); } catch (err) { console.error(err); }\nexport const h = 1;\n");

    expect(findSwallowingCatches(root).sort()).toEqual([
      "bare.ts: catch (err) does not re-throw Next control flow first",
      "commentfirst.ts: catch (e) does not re-throw Next control flow first",
      "legacy.js: catch (err) does not re-throw Next control flow first",
      "legacy.jsx: catch (err) does not re-throw Next control flow first",
      "nested/nobinding.tsx: catch with no binding cannot re-throw",
    ]);
  });
});
