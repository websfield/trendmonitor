// creator-ready Phase 2, AC2 (F-18): every `artifacts.screenshot(` call in the
// four journey specs is preceded — in the SAME block, with no other `await`
// statement between them — by a settled-state wait, so no capture happens
// mid-submit. Also T3's shared-path rule: each persona's MAIN-CHAPTER
// screenshot sits at the test body's own depth, never inside an `if`, so the
// CI scan's presence check cannot be satisfied on one branch only.
//
// A source scan, proven against planted violations (lesson 2026-08-26): a
// screenshot with no wait, and a screenshot after a block whose only wait
// sits inside an `if` — the exact shape the pre-Phase-2 solo spec carried at
// its feedback chapter — must both be reported; a planted correct pair must not.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_CHAPTERS, PERSONAS } from "../e2e/support/main-chapters";

const journeysDir = resolve(__dirname, "../e2e/journeys");

/** Helpers whose completion IS a settled state (they end in a terminal wait). */
const SETTLED_HELPERS = ["waitForGenerationOutcome", "buildVoiceBrain", "runStudioMode"] as const;

type Rec =
  | { kind: "stmt"; depth: number; text: string; line: number }
  | { kind: "open" | "close"; depth: number; line: number };

/**
 * Splits TypeScript source into statement records and block boundaries,
 * skipping comments, strings, template literals (including `${}` nesting)
 * and regex literals so braces inside them never move the depth.
 */
export function records(src: string): Rec[] {
  const out: Rec[] = [];
  let depth = 0;
  let buf = "";
  let line = 1;
  let stmtLine = 1;
  const flush = () => {
    const text = buf.replace(/\s+/g, " ").trim();
    if (text.length > 0) out.push({ kind: "stmt", depth, text, line: stmtLine });
    buf = "";
    stmtLine = line;
  };
  // Which kind each open brace was, so an object literal's `}` closes no block.
  const braceKinds: ("block" | "object")[] = [];
  let i = 0;
  const n = src.length;
  let lastSignificant = "";
  const regexPrefix = /[(,=:[!&|?{};]|return|typeof/;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "\n") {
      line += 1;
      buf += " ";
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch) {
        if (src[j] === "\\") j += 1;
        j += 1;
      }
      buf += src.slice(i, j + 1).replace(/\r?\n/g, " ");
      i = j + 1;
      lastSignificant = ch;
      continue;
    }
    if (ch === "`") {
      // Consume the template; `${` drops into code until its matching `}`.
      let j = i + 1;
      let inner = 0;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "\n") line += 1;
        if (inner === 0 && src[j] === "`") break;
        if (inner === 0 && src[j] === "$" && src[j + 1] === "{") {
          inner = 1;
          j += 2;
          continue;
        }
        if (inner > 0) {
          if (src[j] === "{") inner += 1;
          else if (src[j] === "}") inner -= 1;
          else if (src[j] === "`") {
            // nested template inside ${}: skip it wholesale (no nested ${} support needed here)
            j += 1;
            while (j < n && src[j] !== "`") j += 1;
          }
        }
        j += 1;
      }
      buf += src.slice(i, j + 1).replace(/\r?\n/g, " ");
      i = j + 1;
      lastSignificant = "`";
      continue;
    }
    if (ch === "/" && regexPrefix.test(lastSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j += 1;
      }
      j += 1;
      while (j < n && /[a-z]/.test(src[j])) j += 1;
      buf += src.slice(i, j);
      i = j;
      lastSignificant = "/";
      continue;
    }
    if (ch === "{") {
      // A BLOCK opens after `)` (if/for/while/catch/params), `=>`, `else`,
      // `try`, `finally`, `do`, or at a statement boundary; anything else —
      // `(`, `,`, `:`, `=`, `[`, `return`, an identifier — opens an OBJECT
      // LITERAL, which nests but is not a block and records nothing.
      const isBlock = /^(\)|>|else|try|finally|do|\{|\}|;|)$/.test(lastSignificant);
      braceKinds.push(isBlock ? "block" : "object");
      if (isBlock) {
        flush();
        out.push({ kind: "open", depth, line });
        depth += 1;
        stmtLine = line;
      } else {
        buf += ch;
      }
      i += 1;
      lastSignificant = "{";
      continue;
    }
    if (ch === "}") {
      const kind = braceKinds.pop() ?? "block";
      if (kind === "block") {
        flush();
        depth -= 1;
        out.push({ kind: "close", depth, line });
        stmtLine = line;
      } else {
        buf += ch;
      }
      i += 1;
      lastSignificant = "}";
      continue;
    }
    if (ch === ";") {
      flush();
      i += 1;
      lastSignificant = ";";
      continue;
    }
    buf += ch;
    if (!/\s/.test(ch)) {
      // keep the last WORD for `return`/`typeof` regex-prefix detection
      const m = /(\w+)\s*$/.exec(buf);
      lastSignificant = m ? m[1] : ch;
    }
    i += 1;
  }
  flush();
  return out;
}

const SCREENSHOT = /\bartifacts\s*\.\s*screenshot\s*\(/;
const WAIT_EXPECT = /^await\s+expect\s*\(.*\)\s*\.\s*(?:not\s*\.\s*)?(?:toBeVisible|toBeDisabled|toHaveCount)\s*\(/;
const WAIT_FOR = /^(?:const\s+\w+\s*=\s*)?await\s+[\w.()[\]"'`:/, -]*?\.\s*waitFor\w*\s*\(/;
const WAIT_HELPER = new RegExp(`^(?:const\\s+\\w+\\s*=\\s*)?await\\s+(?:${SETTLED_HELPERS.join("|")})\\s*\\(`);

function isSettledWait(text: string): boolean {
  return WAIT_EXPECT.test(text) || WAIT_FOR.test(text) || WAIT_HELPER.test(text);
}

export type Violation = { line: number; text: string; reason: string };

/** Every screenshot call whose immediately-preceding await (same block) is not a settled wait. */
export function unsettledScreenshots(src: string): Violation[] {
  const recs = records(src);
  const violations: Violation[] = [];
  recs.forEach((rec, idx) => {
    if (rec.kind !== "stmt" || !SCREENSHOT.test(rec.text)) return;
    for (let k = idx - 1; k >= 0; k -= 1) {
      const prev = recs[k];
      if (prev.kind !== "stmt") {
        violations.push({ line: rec.line, text: rec.text, reason: "no settled wait in the same block before this screenshot" });
        return;
      }
      if (!/\bawait\b/.test(prev.text)) continue;
      if (!isSettledWait(prev.text)) {
        violations.push({ line: rec.line, text: rec.text, reason: `preceding await is not a settled wait: ${prev.text.slice(0, 80)}` });
      }
      return;
    }
    violations.push({ line: rec.line, text: rec.text, reason: "no statement precedes this screenshot" });
  });
  return violations;
}

/** Depth of the `test(...)` callback body: the block opened by the first `test(` statement. */
function testBodyDepth(recs: Rec[]): number {
  for (let i = 0; i < recs.length; i += 1) {
    const r = recs[i];
    if (r.kind === "stmt" && /^test\s*\(/.test(r.text) && recs[i + 1]?.kind === "open") {
      return recs[i + 1].depth + 1;
    }
  }
  throw new Error("no test(...) { body found");
}

/**
 * The specs in `e2e/journeys/` that are NOT persona journeys, BY LIST, each with
 * its reason (Respin rule 7: a second producer is a list edit). They take no
 * screenshots, so the settled-wait scan below does not apply to them.
 */
const NON_PERSONA_SPECS: Readonly<Record<string, string>> = {
  "recording-pack.spec.ts":
    "launch L4's paid recording-pack walk (R-153), written at L4 and SKIPPED until L6 LA-2 (it needs F-01's paid tier); not a persona journey",
};

function specFiles(): readonly string[] {
  return readdirSync(journeysDir)
    .filter((f) => f.endsWith(".spec.ts"))
    .filter((f) => !(f in NON_PERSONA_SPECS))
    .sort();
}

describe("journey specs: every screenshot follows a settled-state wait (AC2)", () => {
  const files = specFiles();

  it("scans exactly the four persona specs", () => {
    expect(files).toEqual(PERSONAS.map((p) => `${p}.spec.ts`).sort());
  });

  it("the directory holds exactly the four persona specs and the LISTED non-persona specs", () => {
    const all = readdirSync(journeysDir).filter((f) => f.endsWith(".spec.ts")).sort();
    expect(all).toEqual([...PERSONAS.map((p) => `${p}.spec.ts`), ...Object.keys(NON_PERSONA_SPECS)].sort());
    // The recording-pack walk is skipped LOUDLY until L6, with a reason that names it.
    const pack = readFileSync(resolve(journeysDir, "recording-pack.spec.ts"), "utf8");
    expect(pack).toMatch(/test\.skip\(true, SKIP_REASON\)/);
    expect(pack).toMatch(/L6 LA-2/);
    expect(pack).toMatch(/F-01/);
  });

  for (const file of files) {
    it(`${file}: no unsettled screenshot`, () => {
      const src = readFileSync(resolve(journeysDir, file), "utf8");
      const recs = records(src);
      const shots = recs.filter((r) => r.kind === "stmt" && SCREENSHOT.test(r.text));
      expect(shots.length, "the spec must take screenshots at all, or this scan is vacuous").toBeGreaterThan(3);
      expect(unsettledScreenshots(src)).toEqual([]);
    });
  }

  for (const persona of PERSONAS) {
    it(`${persona}: its MAIN-CHAPTER screenshot sits on the shared path (test-body depth), never inside an if`, () => {
      const src = readFileSync(resolve(journeysDir, `${persona}.spec.ts`), "utf8");
      const recs = records(src);
      const body = testBodyDepth(recs);
      const mains = recs.filter(
        (r): r is Extract<Rec, { kind: "stmt" }> =>
          r.kind === "stmt" && SCREENSHOT.test(r.text) && r.text.includes(`MAIN_CHAPTERS["${persona}"]`)
      );
      expect(mains.length, `exactly one screenshot names MAIN_CHAPTERS["${persona}"]`).toBe(1);
      expect(mains[0].depth, `main-chapter screenshot at line ${mains[0].line} must be at the test body's depth`).toBe(body);
      // And the name it resolves to is not a suffix of the bootstrap screenshot name (T3).
      expect("admin-bootstrap-identity-created".endsWith(`-${MAIN_CHAPTERS[persona]}`)).toBe(false);
    });
  }
});

describe("the scan catches PLANTED violations (lesson 2026-08-26)", () => {
  const base = readFileSync(resolve(journeysDir, "solo-creator.spec.ts"), "utf8");
  const anchor = 'await page.goto("/");';

  it("baseline: the real solo spec is clean and contains the anchor", () => {
    expect(base.includes(anchor)).toBe(true);
    expect(unsettledScreenshots(base)).toEqual([]);
  });

  it("a screenshot with no wait before it is reported", () => {
    const planted = base.replace(anchor, `${anchor}\n  await artifacts.screenshot(page, "planted-no-wait");`);
    const v = unsettledScreenshots(planted);
    expect(v.map((x) => x.text)).toEqual(['await artifacts.screenshot(page, "planted-no-wait")']);
  });

  it("a screenshot whose only wait sits inside an `if` is reported (the pre-Phase-2 feedback-chapter shape)", () => {
    const planted = base.replace(
      anchor,
      `${anchor}
  const plantedBlock = page.getByTestId("planted");
  if (await plantedBlock.isVisible().catch(() => false)) {
    await expect(plantedBlock).toBeVisible({ timeout: 15_000 });
  }
  await artifacts.screenshot(page, "planted-if-only");`
    );
    const v = unsettledScreenshots(planted);
    expect(v.map((x) => x.text)).toEqual(['await artifacts.screenshot(page, "planted-if-only")']);
  });

  it("positive control: a planted correct wait+screenshot pair is NOT reported", () => {
    const planted = base.replace(
      anchor,
      `${anchor}
  await expect(page.locator("body")).toBeVisible();
  await artifacts.screenshot(page, "planted-ok");`
    );
    expect(unsettledScreenshots(planted)).toEqual([]);
  });

  it("a non-await statement between the wait and the screenshot is allowed; a foreign await is not", () => {
    const ok = base.replace(
      anchor,
      `${anchor}
  await expect(page.locator("body")).toBeVisible();
  artifacts.note("between");
  await artifacts.screenshot(page, "planted-note-between");`
    );
    expect(unsettledScreenshots(ok)).toEqual([]);
    const bad = base.replace(
      anchor,
      `${anchor}
  await expect(page.locator("body")).toBeVisible();
  await page.goto("/legal");
  await artifacts.screenshot(page, "planted-goto-between");`
    );
    expect(unsettledScreenshots(bad).map((x) => x.text)).toEqual([
      'await artifacts.screenshot(page, "planted-goto-between")',
    ]);
  });

  it("moving a main-chapter screenshot inside an `if` is reported by the depth check", () => {
    const main = 'await artifacts.screenshot(page, MAIN_CHAPTERS["solo-creator"]);';
    expect(base.includes(main)).toBe(true);
    const planted = base.replace(main, `if (Math.random() > 2) {\n    ${main}\n  }`);
    const recs = records(planted);
    const body = testBodyDepth(recs);
    const mains = recs.filter(
      (r): r is Extract<Rec, { kind: "stmt" }> => r.kind === "stmt" && r.text.includes('MAIN_CHAPTERS["solo-creator"]')
    );
    expect(mains.length).toBe(1);
    expect(mains[0].depth).not.toBe(body);
  });

  it("the tokenizer ignores braces inside strings, templates and regex literals", () => {
    const src = 'test("t", async () => {\n  const a = "}{";\n  const b = `x${"}"}y`;\n  const c = /[{]/;\n  await artifacts.screenshot(page, "s");\n});';
    const recs = records(src);
    const body = testBodyDepth(recs);
    const shot = recs.find((r) => r.kind === "stmt" && SCREENSHOT.test(r.text));
    expect(shot && shot.depth).toBe(body);
    expect(recs.filter((r) => r.kind === "close").length).toBe(1);
  });
});
