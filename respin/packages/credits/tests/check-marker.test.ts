// The `[check]` placeholder: ONE IDEA, A RECORDED TRIPLE OF HOMES, AND NO
// DECISION ANYWHERE ELSE (audit Phase 2, P2-R8).
//
// THE HOMES, AND WHY THERE ARE THREE. Each is a declaration a boundary forces:
//
//   1. `@respin/llm`'s `CHECK` (`packages/llm/src/assemble.ts`) — the marker a
//      model is told to emit. `@respin/llm` may not depend on `@respin/db`: a
//      provider adapter that needs the database is not a provider adapter (the
//      same precedent as `INFERENCE_OUTCOMES` in `packages/llm/src/types.ts`).
//   2. `@respin/db`'s `CHECK` (`packages/db/src/brain-content.ts`) — which
//      claim positions hold a value. Every SERVER-REACHABLE consumer reads this
//      one: `promotion-ops.ts`, and in `app/**` (allowlisted by name in
//      `eslint.config.mjs`) `brain-view.tsx`, `results/page.tsx` and
//      `landing-sections.tsx`.
//   3. `app/(product)/studio/run-copy.ts`'s `CHECK_MARKER` — the one
//      CLIENT-SAFE `app/**` home. Its consumers render inside two different
//      "use client" entries with no common server parent, and
//      `tests/client-bundle-boundary.test.ts` refuses any `@respin/*` value
//      import in a client graph (`@respin/db` imports `pg`). The client panel
//      that HAS a server parent — `results/promotion-panel.tsx` — takes the
//      marker as a prop instead and holds no literal.
//
// THIS TEST LIVES IN `@respin/credits`, which depends on BOTH packages already,
// so asserting their agreement costs no new edge; the repo root does not depend
// on `@respin/llm` at all, deliberately (`tests/import-boundary.test.ts` R6).
//
// THE POPULATION, BY PREDICATE. A decision, a mint or a declaration is a WHOLE
// STRING LITERAL whose contents are exactly `[check]` — `=== "[check]"`,
// `return "[check]"`, `split("[check]")` and `CHECK = "[check]"` all are. Prose
// that MENTIONS the token inside a longer string, or in JSX text, never is, so
// prose is out of the decision population by predicate, not by exemption
// (the batch-1 regex `/(["'`])\[check\]\1/` also matched a QUOTED token inside
// a longer string — `with-workspace.ts`'s "… or marked '[check]', and …" — and
// is retired). The prose mentions are nonetheless a MEASURED SET this file
// asserts, so a new one is a list edit.
//
// If the agreement goes red, do not "fix" it by editing one constant to match
// the other — decide which value is right, change that one, and let the others
// follow. They are the same string because they are the same idea.
import { describe, expect, it } from "vitest";

import { CHECK as DB_CHECK } from "@respin/db";
import { CHECK as LLM_CHECK } from "@respin/llm";

import { isProbeArtifactPath } from "../../../tests/support/probe-artifacts";
import {
  PRODUCTION_ROOTS,
  sourceFilesUnder,
  type SourceFile,
} from "../../../tests/support/source-files";

const TOKEN = "[check]";

/**
 * A small lexer, local to this file: comments are blanked (length-preserving),
 * and every string literal — `"`, `'` and `` ` `` delimited, escapes honoured,
 * template `${…}` expressions walked as code — is reported with its contents
 * and span. A `"`/`'` literal ends at a newline (an unterminated one cannot
 * span lines), which bounds the damage of JSX text such as "I've" to its line.
 * A `/` after an operator or an opening bracket starts a regex literal, which
 * is skipped whole, so a quote inside a pattern is not a string.
 */
function lex(src: string): {
  code: string;
  literals: { start: number; end: number; contents: string; interpolated: boolean }[];
} {
  const out = src.split("");
  const literals: { start: number; end: number; contents: string; interpolated: boolean }[] = [];
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  // Template nesting: each entry is the brace depth at which a `${` opened.
  const templates: number[] = [];
  let braceDepth = 0;
  let lastSignificant = "";
  // `resumed` marks the tail of a template after a `${…}`: its contents are
  // never a whole literal.
  const readString = (quote: string, from: number, resumed = false): number => {
    let j = from + 1;
    let contents = "";
    let interpolated = resumed;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") {
        contents += src[j + 1] ?? "";
        j += 2;
        continue;
      }
      if (quote !== "`" && c === "\n") break;
      if (c === quote) {
        literals.push({ start: from, end: j + 1, contents, interpolated });
        return j + 1;
      }
      if (quote === "`" && c === "$" && src[j + 1] === "{") {
        interpolated = true;
        templates.push(braceDepth);
        braceDepth++;
        literals.push({ start: from, end: j, contents, interpolated });
        return j + 2;
      }
      contents += c;
      j++;
    }
    return j;
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && (lastSignificant === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant))) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "/" && !inClass) break;
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        j++;
      }
      i = j + 1;
      lastSignificant = "/";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i = readString(c, i);
      lastSignificant = "a";
      continue;
    }
    if (c === "{") braceDepth++;
    if (c === "}") {
      braceDepth--;
      if (templates.length > 0 && templates[templates.length - 1] === braceDepth) {
        templates.pop();
        // Resume the template after its expression.
        i = readString("`", i, true);
        lastSignificant = "a";
        continue;
      }
    }
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return { code: out.join(""), literals };
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** The production population: every root's source, minus package test trees and probes. */
function productionFiles(): SourceFile[] {
  return sourceFilesUnder(PRODUCTION_ROOTS).filter(
    (f) => !/^packages\/[^/]+\/tests\//.test(f.file) && !isProbeArtifactPath(f.file)
  );
}

/** Every whole-literal `[check]` — a decision, a mint or a declaration — as `file:line`. */
function exactTokenSites(files: readonly SourceFile[]): string[] {
  const sites: string[] = [];
  for (const f of files) {
    for (const lit of lex(f.text).literals) {
      if (!lit.interpolated && lit.contents === TOKEN) sites.push(f.file + ":" + lineOf(f.text, lit.start));
    }
  }
  return sites;
}

/**
 * The PROSE mentions, as file → number of lines: a line of comment-blanked
 * text carrying the token anywhere other than as a whole literal. Counted per
 * file rather than pinned per `file:line`, because a line number moves with
 * every edit above it (the R-154 ratchet): an ADDED mention in any file is red.
 */
function proseMentions(files: readonly SourceFile[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of files) {
    const { code, literals } = lex(f.text);
    const chars = code.split("");
    for (const lit of literals) {
      if (!lit.interpolated && lit.contents === TOKEN) {
        for (let k = lit.start; k < lit.end; k++) chars[k] = " ";
      }
    }
    const lines = chars.join("").split("\n").filter((l) => l.includes(TOKEN)).length;
    if (lines > 0) out[f.file] = lines;
  }
  return out;
}

/**
 * THE MEASURED PROSE SET, 2026-10-06, over every production root (`app`,
 * `packages/*\/src`, `worker`, `lib`, `scripts`): 37 lines in 15 files. The
 * plan measured seventeen sites in eleven files on 2026-09-21; since then the
 * launch and remediation phases added copy that names the marker (the saved
 * recording pack, the filming plan and its server checks, the event basis),
 * which is why this is re-measured rather than copied. `worker`, `lib` and
 * `scripts` carry none. NONE INTERPOLATES THE CONSTANT, and the reason is written: the
 * token's spelling is fixed above the code — CLAUDE.md rule 6 and REQ-I03 name
 * `[check]` — so copy that names the marker as a word is naming a product
 * term, not reading a variable. Prose names the term; decisions read the
 * constant.
 */
const PROSE_MENTIONS: Record<string, number> = {
  "app/(marketing)/audiences.ts": 4,
  "app/(marketing)/changelog/entries.ts": 1,
  "app/(marketing)/landing-sections.tsx": 2,
  // Audit P6-A3: the landing body moved from `page.tsx` to `landing-view.tsx`
  // when the page became an async config read; the one mention moved with it.
  "app/(marketing)/landing-view.tsx": 1,
  "app/(product)/billing-errors.ts": 1,
  "app/(product)/brain/copy.ts": 2,
  "app/(product)/results/promotion-panel.tsx": 2,
  "app/(product)/studio/copy.ts": 1,
  "app/(product)/studio/run-copy.ts": 4,
  "app/(product)/studio/saved/saved-copy.ts": 3,
  "packages/db/src/errors.ts": 1,
  "packages/db/src/with-workspace.ts": 1,
  "packages/modes/src/hard-rules.ts": 3,
  "packages/modes/src/mode-checks.ts": 9,
  "packages/modes/src/traceability.ts": 1,
};

describe("the [check] marker: one idea, a recorded triple of homes (P2-R8)", () => {
  it("the three homes agree, and are the literal the doc set names", () => {
    expect(LLM_CHECK).toBe(DB_CHECK);
    // `run-copy.ts`'s declaration is READ, not imported: `packages/**` may
    // never import from `app/**` (tech-spec §1, the eslint import-direction
    // rule). `tests/studio-ui.test.tsx` holds the same equality by import.
    const runCopy = sourceFilesUnder(["app"]).find((f) => f.file === "app/(product)/studio/run-copy.ts");
    const declared = runCopy?.text.match(/export const CHECK_MARKER = "([^"]*)";/)?.[1];
    expect(declared, "run-copy.ts no longer declares CHECK_MARKER as a literal").toBe(LLM_CHECK);
    // Pinned to the LITERAL as well as to each other: three constants that
    // agree can still all be wrong, and every stored placeholder would stop
    // being recognised as one. REQ-I03 names this string.
    expect(DB_CHECK).toBe("[check]");
  });

  it("the exact-token literal appears in exactly the recorded triple, and nowhere else", () => {
    const files = productionFiles();
    // NON-VACUITY: the walk found the tree.
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.file.startsWith("app/"))).toBe(true);
    expect(files.some((f) => f.file.startsWith("packages/db/src/"))).toBe(true);
    expect(exactTokenSites(files).map((s) => s.replace(/:\d+$/, ""))).toEqual([
      "app/(product)/studio/run-copy.ts",
      "packages/db/src/brain-content.ts",
      "packages/llm/src/assemble.ts",
    ]);
  });

  it("the prose mentions are exactly the measured set", () => {
    expect(proseMentions(productionFiles())).toEqual(PROSE_MENTIONS);
  });

  describe("PLANTED: the scan catches every shape it claims to cover", () => {
    const one = (file: string, text: string): SourceFile[] => [{ file, text }];

    it.each([
      ["a comparison", 'if (value === "[check]") return;'],
      ["a mint", "return '[check]';"],
      ["a split", "text.split(`[check]`);"],
      ["a declaration", 'export const MARKER = "[check]";'],
      ["a JSX attribute", '<p title="[check]" />'],
    ])("%s is a decision", (_name, text) => {
      expect(exactTokenSites(one("app/x.tsx", text))).toEqual(["app/x.tsx:1"]);
    });

    it("a planted literal in promotion-panel.tsx is red against the triple", () => {
      const files = [
        ...productionFiles(),
        { file: "app/(product)/results/promotion-panel.tsx", text: 'const x = "[check]";' },
      ];
      expect(exactTokenSites(files).map((s) => s.replace(/:\d+$/, ""))).toContain(
        "app/(product)/results/promotion-panel.tsx"
      );
    });

    it("a QUOTED token inside a longer string is NOT a decision — it is prose", () => {
      const files = one("packages/db/src/x.ts", `const m = "… or marked '[check]', and …";`);
      expect(exactTokenSites(files)).toEqual([]);
      expect(proseMentions(files)).toEqual({ "packages/db/src/x.ts": 1 });
    });

    it("a token in a comment is neither", () => {
      const files = one("app/x.ts", '// "[check]" here\n/* "[check]" */\nconst y = 1;');
      expect(exactTokenSites(files)).toEqual([]);
      expect(proseMentions(files)).toEqual({});
    });

    it("an interpolated template is not a whole literal", () => {
      expect(exactTokenSites(one("app/x.ts", "const z = `${a}[check]`;"))).toEqual([]);
    });

    it("a quote inside a regex literal does not open a string", () => {
      const files = one("app/x.ts", 'const r = /["\']/;\nif (v === "[check]") {}');
      expect(exactTokenSites(files)).toEqual(["app/x.ts:2"]);
    });

    it("one more prose mention is red against the measured set", () => {
      const files = [
        ...productionFiles(),
        { file: "app/(product)/new-copy.ts", text: 'export const S = "Add a [check] marker.";' },
      ];
      expect(proseMentions(files)).not.toEqual(PROSE_MENTIONS);
    });
  });
});
