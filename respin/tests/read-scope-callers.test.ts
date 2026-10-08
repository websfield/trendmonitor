// R-166 (gate tenancy Low): `readScopeForUser`'s docstring says "EXACTLY THREE
// CALLERS, and the list is the contract". A docstring is not a property
// (CLAUDE.md 2026-07-30): this scans every production source file and asserts
// the callers ARE the list, and the scanner proves it catches a planted fourth.
import { describe, expect, it } from "vitest";
import { blankComments } from "./support/app-surface";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";

const DEFINITION = "app/(product)/workspace-scope.ts";
/** The contract. A fourth caller is an edit here and in the docstring, together. */
const READ_SCOPE_CALLERS = [
  "app/(product)/brain/page.tsx",
  "app/(product)/settings/account/page.tsx",
  "app/api/export/route.ts",
] as const;

/** A file CALLS it when its code — comments blanked — invokes it. */
function callsReadScope(source: string): boolean {
  return /\breadScopeForUser\s*\(/.test(blankComments(source));
}

/**
 * THE OTHER TWO DOORS to the read grade (R-166 follow-up): the facade's
 * `withWorkspaceReadGrade(` and a direct `withWorkspace(…, { grade: "read" })`.
 * Each has its own pinned population, so a page minting the read grade
 * without `readScopeForUser` is red here too.
 */
const READ_GRADE_FACADE_CALLERS = ["app/(product)/workspace-scope.ts"] as const;
const READ_GRADE_DIRECT_CALLERS = ["packages/db/src/app-server.ts"] as const;

function callsReadGradeFacade(source: string): boolean {
  return /\bwithWorkspaceReadGrade\s*\(/.test(blankComments(source));
}

/** `withWorkspace(` whose argument list (nested parens allowed) carries `grade: "read"`. */
function callsWithWorkspaceReadGrade(source: string): boolean {
  const code = blankComments(source);
  for (const match of code.matchAll(/\bwithWorkspace\s*\(/g)) {
    // A declaration (the overloads in with-workspace.ts) is not a call.
    if (/\bfunction\s+$/.test(code.slice(Math.max(0, match.index - 20), match.index))) continue;
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < code.length; end += 1) {
      if (code[end] === "(") depth += 1;
      else if (code[end] === ")" && --depth === 0) break;
    }
    if (/\bgrade\s*:\s*["'`]read["'`]/.test(code.slice(match.index, end + 1))) return true;
  }
  return false;
}

function productionCallers(predicate: (source: string) => boolean): string[] {
  return sourceFilesUnder(PRODUCTION_ROOTS)
    .filter((file) => !/\.test\.tsx?$/.test(file.file))
    .filter((file) => predicate(file.text))
    .map((file) => file.file)
    .sort();
}

describe("readScopeForUser has EXACTLY the three callers its docstring lists", () => {
  it("the scanned population is the list", () => {
    const files = sourceFilesUnder(PRODUCTION_ROOTS);
    expect(files.some((file) => file.file === DEFINITION)).toBe(true);
    const callers = files
      .filter((file) => file.file !== DEFINITION && !/\.test\.tsx?$/.test(file.file))
      .filter((file) => callsReadScope(file.text))
      .map((file) => file.file);
    expect(callers.sort()).toEqual([...READ_SCOPE_CALLERS].sort());
  });

  it("the docstring names the same three", () => {
    const definition = sourceFilesUnder(PRODUCTION_ROOTS).find((file) => file.file === DEFINITION)!;
    const doc = definition.text.replace(/\n \* /g, "");
    for (const caller of READ_SCOPE_CALLERS) expect(doc).toContain(caller);
  });

  it("the facade's withWorkspaceReadGrade( and a direct withWorkspace(…, { grade: 'read' }) have exactly their pinned callers", () => {
    expect(productionCallers(callsReadGradeFacade)).toEqual([...READ_GRADE_FACADE_CALLERS]);
    expect(productionCallers(callsWithWorkspaceReadGrade)).toEqual([...READ_GRADE_DIRECT_CALLERS]);
  });

  it("PLANTED: both other doors are caught, multi-line and nested, and a write-grade call or a comment is not", () => {
    expect(callsReadGradeFacade("const s = await respinDb.withWorkspaceReadGrade({ authUserId: id });")).toBe(true);
    expect(callsReadGradeFacade("// respinDb.withWorkspaceReadGrade({ authUserId })")).toBe(false);
    expect(callsWithWorkspaceReadGrade('await withWorkspace(db, { authUserId: id }, { grade: "read" })')).toBe(true);
    expect(callsWithWorkspaceReadGrade('withWorkspace(\n  getServerDb(),\n  ctx(user),\n  { grade: "read" }\n)')).toBe(true);
    expect(callsWithWorkspaceReadGrade("await withWorkspace(db, { authUserId: id })")).toBe(false);
    expect(callsWithWorkspaceReadGrade('export async function withWorkspace(db: DbLike, options: Readonly<{ grade: "read" }>)')).toBe(false);
    expect(callsWithWorkspaceReadGrade('/* withWorkspace(db, ctx, { grade: "read" }) */')).toBe(false);
  });

  it("PLANTED: the scanner catches a call, and does not count a comment", () => {
    expect(callsReadScope("const scope = await readScopeForUser(user);")).toBe(true);
    expect(callsReadScope("x = readScopeForUser\n  (user)")).toBe(true);
    expect(callsReadScope("// readScopeForUser(user) is the read grade")).toBe(false);
    expect(callsReadScope("/* readScopeForUser(user) */ const a = 1;")).toBe(false);
  });
});
