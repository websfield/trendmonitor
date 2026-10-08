// Phase 10a plan C1 (R-115): ONLY the future connector seam may mint
// `connector_verified`. Today there is no such seam, so the production tree
// must contain no writer that assigns the value — a source scan over every
// package's `src/**` and the app, with an ALLOWLIST of the files that may
// spell the literal for a non-write reason (the schema, the vocabulary, the
// comparison allowlist, copy) and a planted violation proving the scan reads.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isPlantedProbePath } from "../../../tests/support/probe-artifacts";

const RESPIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Files that may mention the literal WITHOUT writing it. A LIST, never a grep (rule 7). */
const MAY_MENTION = new Set([
  "packages/db/src/results-schema.ts",          // the enum and its CHECK
  "packages/db/src/with-workspace.ts",           // recordResult's derivation comment and the NULL connector columns
  "packages/db/src/promotion-ops.ts",            // the eligibility reading
  "packages/db/src/promotion-audit.ts",          // the audit's predicate
  "packages/db/src/lifecycle-column-census.ts",
  "packages/db/src/creator-data-registry.ts",
  "packages/brain/src/vocabulary.ts",
  "packages/brain/src/comparison.ts",            // the ONE numerical allowlist
  "packages/brain/src/proposal.ts",              // the refusal
  "app/(product)/results/copy.ts",               // the evidence-state badge copy
  "app/(product)/results/log-panel.tsx",         // says the state is unreachable from a browser
  "app/(product)/results/results-view.tsx",      // the verification-unavailable notice
  "app/(product)/brain/brain-view.tsx",          // counts on screen
  "packages/db/src/export-brain.ts",
  "packages/db/src/results-ops.ts",
]);

/** A WRITE: the literal as an assigned value, not a comparison or a type. */
const WRITES = /(?:evidenceState|evidence_state)\s*[:=]\s*["']connector_verified["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "tests" || entry === "migrations") continue;
    const full = join(dir, entry);
    // PROBE ARTIFACTS ARE NOT THE TREE (audit Phase 2): other suites plant
    // and delete files such as `lib/__p6b_probe.ts` while this walk runs, so
    // a listed probe could vanish before it is read (ENOENT, measured on the
    // Phase 2 full run). `isPlantedProbePath` skips exactly those plants, never a
    // real `__*.ts` production file.
    if (isPlantedProbePath(relative(RESPIN, full).replace(/\\/g, "/"))) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no production writer mints connector_verified", () => {
  const files = [
    ...walk(join(RESPIN, "packages")).filter((f) => /[\\/]src[\\/]/.test(f)),
    ...walk(join(RESPIN, "app")),
    ...walk(join(RESPIN, "lib")),
    ...walk(join(RESPIN, "worker")),
  ];

  it("scans a real population", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("every file that assigns the literal is refused; every file that mentions it is on the list", () => {
    const writes: string[] = [];
    const unlisted: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("connector_verified")) continue;
      const rel = relative(RESPIN, file).replace(/\\/g, "/");
      if (WRITES.test(source)) writes.push(rel);
      if (!MAY_MENTION.has(rel)) unlisted.push(rel);
    }
    expect(writes, "a production file ASSIGNS connector_verified — only the future connector seam may").toEqual([]);
    expect(unlisted, "a production file mentions connector_verified and is not on MAY_MENTION — list it with a reason").toEqual([]);
  });

  // ------------------------------------------------------------------
  // THE SECOND SHAPE: AN INDIRECT WRITER (audit Phase 2, P2-R12).
  //
  // `WRITES` sees the literal as an assigned value, so `evidenceState:
  // input.evidenceState` — a caller-supplied value — was invisible to both
  // assertions above. The real mitigation stands (`recordResult` derives the
  // column with no caller parameter); this closes the hole in the tripwire.
  //
  // A WRITE is a keyed or shorthand `evidenceState` INSIDE A WRITER ARGUMENT —
  // the balanced-paren extent of a Drizzle `.values(` or `.set(` call — or a
  // raw `INSERT INTO`/`UPDATE … results … evidence_state` statement. A type
  // member, a column declaration, a `.select({ … })` projection and a typed
  // local are not writes, and are out BY CONTEXT, not by exemption.
  // ------------------------------------------------------------------

  /** (a) keyed, any right-hand side that is NOT a closed-vocabulary literal. `(?=\S)` pins the lookahead past the spaces, so `\s*` cannot backtrack onto one. */
  const KEYED = /(?:evidenceState|evidence_state)\s*:\s*(?=\S)(?!["'](?:connector_verified|quantified_self_reported|unquantified)["'])[^,\n]+/g;
  /** (b) shorthand — the property's value is a same-named local. */
  const SHORTHAND = /^\s*evidenceState\s*,?\s*$/gm;
  /** (c) raw SQL writing the column. */
  const RAW = /\b(?:INSERT\s+INTO|UPDATE)\s+"?results\b[\s\S]*?evidence_state/gi;

  /** The balanced-paren extents of every `.values(` / `.set(` call. */
  function writerExtents(source: string): [number, number][] {
    const out: [number, number][] = [];
    for (const m of source.matchAll(/\.(?:values|set)\s*\(/g)) {
      let depth = 0;
      let i = m.index! + m[0].length - 1;
      for (; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")" && --depth === 0) break;
      }
      out.push([m.index!, i]);
    }
    return out;
  }

  /** Every indirect write in a source, as `shape@line`. */
  function indirectWrites(source: string): string[] {
    const extents = writerExtents(source);
    const inside = (at: number) => extents.some(([s, e]) => at > s && at < e);
    const line = (at: number) => source.slice(0, at).split("\n").length;
    const out: string[] = [];
    for (const m of source.matchAll(KEYED)) if (inside(m.index!)) out.push(`keyed@${line(m.index!)}`);
    for (const m of source.matchAll(SHORTHAND)) if (inside(m.index!)) out.push(`shorthand@${line(m.index!)}`);
    for (const m of source.matchAll(RAW)) out.push(`raw@${line(m.index!)}`);
    return out;
  }

  /** Every `.insert(results)` / `.update(results)` whose `.values(`/`.set(` argument is NOT an object literal. */
  function nonLiteralResultWriters(source: string): string[] {
    const out: string[] = [];
    for (const m of source.matchAll(/\.(?:insert|update)\(\s*results\s*\)\s*\.(?:values|set)\(\s*(\S)/g)) {
      if (m[1] !== "{") out.push(`identifier@${source.slice(0, m.index!).split("\n").length}`);
    }
    return out;
  }

  /** How many `.insert(results)` / `.update(results)` calls a source makes at all. */
  const resultWriterCalls = (source: string) => [...source.matchAll(/\.(?:insert|update)\(\s*results\s*\)/g)].length;

  /**
   * THE ONE MEASURED WRITER AND ITS PINNED EXEMPTION. `recordResult`'s insert
   * writes the shorthand `evidenceState,` — a local DERIVED two statements up
   * from whether numbers were supplied, with no branch that reaches
   * `connector_verified`. The exemption is pinned to that derivation: an
   * exemption that outlived it would be a hole with a docblock.
   */
  const EXEMPT = {
    file: "packages/db/src/with-workspace.ts",
    shapes: ["shorthand"],
    derivation: 'reach || conversion ? "quantified_self_reported" : "unquantified"',
  };
  const exemptionHolds = (source: string) => source.includes(EXEMPT.derivation);

  /**
   * Keyed sites outside every writer extent, measured 2026-10-06: fourteen,
   * the plan's count — type members (`log-state.ts`, `results-view.tsx`,
   * `proposal.ts` x2, `vocabulary.ts`), the column declaration and a
   * projection (`results-schema.ts`), the zod schema and read projections
   * (`promotion-ops.ts` x3), read projections (`actions.ts`, `projection.ts`,
   * `proposal.ts`), and the derivation's typed local (`with-workspace.ts`).
   */
  const CONTEXT_EXCLUDED: Record<string, number> = {
    "packages/brain/src/proposal.ts": 3,
    "packages/brain/src/vocabulary.ts": 1,
    "packages/db/src/promotion-ops.ts": 3,
    "packages/db/src/results-schema.ts": 2,
    "packages/db/src/with-workspace.ts": 1,
    "app/(product)/results/actions.ts": 1,
    "app/(product)/results/log-state.ts": 1,
    "app/(product)/results/projection.ts": 1,
    "app/(product)/results/results-view.tsx": 1,
  };

  it("P2-R12: the measured indirect-writer set is exactly the one pinned exemption, and its derivation still stands", () => {
    const found: Record<string, string[]> = {};
    let calls = 0;
    const nonLiteral: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      const rel = relative(RESPIN, file).replace(/\\/g, "/");
      const writes = indirectWrites(source).map((w) => w.replace(/@\d+$/, ""));
      if (writes.length) found[rel] = writes;
      calls += resultWriterCalls(source);
      nonLiteral.push(...nonLiteralResultWriters(source).map((w) => rel + ":" + w));
    }
    expect(found).toEqual({ [EXEMPT.file]: EXEMPT.shapes });
    // THE KEYED SITES THE CONTEXT RULE EXCLUDES, recorded as a measurement
    // rather than trusted: type members, the column declaration, the zod
    // schema, read projections and the derivation's typed local. A new keyed
    // site outside every writer extent is a list edit here, so the exclusion
    // is never a silent widening.
    const excluded: Record<string, number> = {};
    for (const file of files) {
      const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      const extents = writerExtents(source);
      const n = [...source.matchAll(KEYED)].filter((m) => !extents.some(([s, e]) => m.index! > s && m.index! < e)).length;
      if (n > 0) excluded[relative(RESPIN, file).replace(/\\/g, "/")] = n;
    }
    expect(excluded).toEqual(CONTEXT_EXCLUDED);
    expect(exemptionHolds(readFileSync(join(RESPIN, EXEMPT.file), "utf8"))).toBe(true);
    // The one hop the context rule opens: a values object assembled OUTSIDE
    // the call. Every production results writer passes a literal — one today.
    expect(calls, "the results writer population").toBe(1);
    expect(nonLiteral).toEqual([]);
  });

  it("PLANTED: every indirect shape is red, and the two non-writes are not", () => {
    const planted = {
      keyed: "await tx.insert(results).values({ id, evidenceState: input.evidenceState, note });",
      shorthand: "await tx.insert(results).values({\n  id,\n  evidenceState,\n});",
      raw: "await tx.execute(sql`UPDATE results SET evidence_state = ${x} WHERE id = ${id}`);",
      setKeyed: "await tx.update(results).set({ evidenceState: chosen });",
    };
    expect(indirectWrites(planted.keyed)).toEqual(["keyed@1"]);
    expect(indirectWrites(planted.shorthand)).toEqual(["shorthand@3"]);
    expect(indirectWrites(planted.raw)).toEqual(["raw@1"]);
    expect(indirectWrites(planted.setKeyed)).toEqual(["keyed@1"]);
    expect(nonLiteralResultWriters("const row = { evidenceState: input.evidenceState };\nawait tx.insert(results).values(row);"))
      .toEqual(["identifier@2"]);
    // NON-PLANTS: the anchored lookahead's own case, and a type member.
    expect(indirectWrites('await tx.insert(results).values({ evidenceState: "unquantified" });')).toEqual([]);
    expect(indirectWrites("type Row = { evidenceState: string };\nconst x = db.select({ evidenceState: results.evidenceState });")).toEqual([]);
    // ...and the exemption goes red the moment its derivation is gone.
    const source = readFileSync(join(RESPIN, EXEMPT.file), "utf8");
    expect(exemptionHolds(source.replace(EXEMPT.derivation, "input.evidenceState"))).toBe(false);
  });

  it("NON-VACUITY: the write predicate catches the shapes a writer would take", () => {
    for (const planted of [
      'evidenceState: "connector_verified"',
      "evidence_state = 'connector_verified'",
      'evidenceState:"connector_verified"',
    ]) expect(WRITES.test(planted), planted).toBe(true);
    for (const safe of [
      'result.evidenceState === "connector_verified"',
      'evidenceState !== "connector_verified"',
      '"connector_verified" as const',
    ]) expect(WRITES.test(safe), safe).toBe(false);
  });
});
