// EVERY VENDOR CALL SITE AND EVERY PROMPT PRODUCER, AS LISTS ASSERTED EQUAL TO
// SCANS (audit P3-R2 / P3-R9, decisions R-158).
//
// The input ceiling (`assertInputWithinCeiling`, `@respin/llm`) binds in the
// CALLER, before `provider.complete(`, so a provider stub that refuses to be
// called can prove a refusal made no call. That makes the call sites a
// population: a fifth site that skips the check is a vendor call nobody
// bounded. And the ceiling reads a prompt's `partSizes`, so the PRODUCERS are a
// population too: a producer that reached a vendor outside the typed receivers
// would be bounded on nothing it recorded.
//
// Both are written out (CLAUDE.md Respin rule 7: a population is a list, not a
// producer) and asserted equal to a scan, both ways: a site or producer the
// list lacks is red, and a listed one the tree lacks is red. Each scan also
// asserts it CATCHES a planted violation of every shape it claims (CLAUDE.md
// 2026-08-26) and does not fire on a plant inside a comment.
import { describe, expect, it } from "vitest";

import { blankComments } from "./support/app-surface";
import { PRODUCTION_ROOTS, sourceFilesUnder, type SourceFile } from "./support/source-files";

/** A path with a `tests/` segment is test code: a stub is exercised there, no vendor is called. */
const isTestPath = (file: string): boolean => /(^|\/)tests\//.test(file);

const CALL_SITE = /\.complete\s*\(/g;
/** (A) a function whose return type annotation is `AssembledPrompt`. */
const PRODUCER_ANNOTATED = /\)\s*:\s*AssembledPrompt\b/g;
/** (B1) an object literal whose `system` is a module constant or a string literal — the producer spelling. */
const PRODUCER_SYSTEM_LITERAL = /\bsystem\s*:\s*([A-Za-z_]*SYSTEM\b|["'`])/g;
/** (B2) the returned shorthand pair — anchored on `return`, so a receiver's destructure is not a producer. */
const PRODUCER_RETURNED_PAIR = /\breturn\s*\{\s*system\s*,\s*prompt\s*\}/g;
/** A receiver's destructure — counted on the receiver side, never as a producer. */
const RECEIVER_DESTRUCTURE = /(?:const|let)\s*\{\s*system\s*,\s*prompt\s*\}\s*=/g;

/** The name of the function (or `const x = async (`) enclosing `index`, or `"<module>"`. */
function enclosingFunction(text: string, index: number): { name: string; start: number } {
  const before = text.slice(0, index);
  const re = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*async\s*\()/g;
  let found: { name: string; start: number } = { name: "<module>", start: 0 };
  for (const m of before.matchAll(re)) {
    found = { name: m[1] ?? m[2]!, start: m.index! };
  }
  return found;
}

type Hit = { file: string; fn: string; start: number; index: number; text: string };

function scan(files: readonly SourceFile[], pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    const text = blankComments(f.text);
    for (const m of text.matchAll(new RegExp(pattern.source, "g"))) {
      const fn = enclosingFunction(text, m.index!);
      hits.push({ file: f.file, fn: fn.name, start: fn.start, index: m.index!, text });
    }
  }
  return hits;
}

const keyOf = (h: Hit) => `${h.file}#${h.fn}`;
const keys = (hits: readonly Hit[]) => hits.map(keyOf).sort();

const ALL = sourceFilesUnder(PRODUCTION_ROOTS);
const PRODUCTION = ALL.filter((f) => !isTestPath(f.file));
const TEST_SIDE = ALL.filter((f) => isTestPath(f.file));

/**
 * THE FOUR PHYSICAL VENDOR CALL SITES, measured 2026-10-05. One is outside
 * `packages/` (the autopsy worker's stage call), which the deferral ledger's
 * re-homing row tracks.
 */
const CALL_SITES = [
  "packages/credits/src/generate.ts#meteredCall",
  "packages/credits/src/inference.ts#runInference",
  "packages/credits/src/sample-spin/run.ts#metered",
  "worker/autopsy-vendor.ts#createAutopsyVendor",
] as const;

/**
 * Each site's bound, which must appear in its enclosing function BEFORE the
 * call. The autopsy worker's bound is its own per-stage check, fed a
 * `maxInputTokens` of `min(llm.maxInputTokens, the compiled ceiling)`.
 */
const SITE_BOUND: Readonly<Record<(typeof CALL_SITES)[number], RegExp>> = {
  "packages/credits/src/generate.ts#meteredCall": /assertInputWithinCeiling\(/,
  "packages/credits/src/inference.ts#runInference": /assertInputWithinCeiling\(/,
  "packages/credits/src/sample-spin/run.ts#metered": /assertInputWithinCeiling\(/,
  "worker/autopsy-vendor.ts#createAutopsyVendor": /inputTokenUpperBound\s*>\s*input\.maxInputTokens/,
};

/**
 * THE TEST-SIDE `.complete(` CALLS — out of the production population by the
 * `tests/` predicate, and PINNED here so that exemption is a record, not a
 * hole: a stub provider exercised directly, no vendor reached.
 */
const TEST_SIDE_CALLS = [
  "packages/credits/tests/sample-spin-spend.test.ts",
  "packages/llm/tests/adapter.test.ts",
  "packages/llm/tests/adapter.test.ts",
  "packages/llm/tests/adapter.test.ts",
];

/**
 * THE PROMPT PRODUCERS (P3-R2's five), plus the one composition helper two of
 * them share. Each is the function a scan hit sits in:
 *   - `assembleGenerationPrompt`, `assembleRewritePrompt` (modes) — via
 *     `assembled`, the helper that records `partSizes`;
 *   - `assembleKillTestPrompt` (modes) — annotated AND a `system:` literal;
 *   - `assembleVoicePrompt` (llm);
 *   - the autopsy worker's stage prompt — a `system:` literal, deliberately
 *     not typed `AssembledPrompt`: it carries no vendor-authored part, so its
 *     whole-prompt bound is exact;
 *   - `priceMarkerBreaks` (modes, audit Phase 8 gate L2) — not a new prompt:
 *     it takes the rewrite's or the kill test's `AssembledPrompt` and moves the
 *     bytes the marker breaks added out of the exempt part into the bounded
 *     `markersBroken` part, so it returns one.
 */
const PRODUCERS = [
  "packages/llm/src/assemble.ts#assembleVoicePrompt",
  "packages/modes/src/assemble.ts#assembleGenerationPrompt",
  "packages/modes/src/assemble.ts#assembleRewritePrompt",
  "packages/modes/src/assemble.ts#assembled",
  "packages/modes/src/assemble.ts#priceMarkerBreaks",
  "packages/modes/src/kill-test.ts#assembleKillTestPrompt",
  "worker/autopsy-vendor.ts#createAutopsyVendor",
] as const;

function producerKeys(files: readonly SourceFile[]): string[] {
  const hits = [
    ...scan(files, PRODUCER_ANNOTATED),
    ...scan(files, PRODUCER_SYSTEM_LITERAL),
    ...scan(files, PRODUCER_RETURNED_PAIR),
  ];
  return [...new Set(keys(hits))].sort();
}

function siteKeys(files: readonly SourceFile[]): string[] {
  return keys(scan(files, CALL_SITE));
}

describe("the vendor call sites are a list (audit P3-R9)", () => {
  it("the production scan equals the four listed sites, both ways", () => {
    expect(siteKeys(PRODUCTION)).toEqual([...CALL_SITES].sort());
  });

  it("each listed site's enclosing function bounds the input BEFORE the call", () => {
    for (const hit of scan(PRODUCTION, CALL_SITE)) {
      const key = keyOf(hit) as (typeof CALL_SITES)[number];
      // A site with no listed bound is red here, never a vacuous pass.
      expect(Object.keys(SITE_BOUND), key).toContain(key);
      const body = hit.text.slice(hit.start, hit.index);
      expect(body, key).toMatch(SITE_BOUND[key]);
    }
  });

  it("the test-side calls are a pinned set of their own", () => {
    expect(scan(TEST_SIDE, CALL_SITE).map((h) => h.file).sort()).toEqual([...TEST_SIDE_CALLS].sort());
  });

  it("PLANTED: a fifth production site is red, a removed listed site is red, a plant in a comment is not seen", () => {
    const planted: SourceFile = {
      file: "packages/credits/src/planted.ts",
      text: "export async function planted(p: any) {\n  return p.complete({});\n}\n",
    };
    expect(siteKeys([...PRODUCTION, planted])).not.toEqual([...CALL_SITES].sort());
    // A renamed receiver is still a site.
    const renamed: SourceFile = { ...planted, text: "async function x(llm: any) { return llm.complete ({}); }" };
    expect(siteKeys([renamed])).toEqual(["packages/credits/src/planted.ts#x"]);
    // Removing a listed site from the tree.
    expect(
      siteKeys(PRODUCTION.filter((f) => f.file !== "packages/credits/src/inference.ts"))
    ).not.toEqual([...CALL_SITES].sort());
    // A comment does not fire.
    const commented: SourceFile = { ...planted, text: "// provider.complete({})\n/* x.complete( */\n" };
    expect(siteKeys([commented])).toEqual([]);
  });

  it("PLANTED: a site whose function makes the call BEFORE bounding it fails the bound check", () => {
    const text = "async function meteredCall(a: any) {\n  await a.provider.complete({});\n  assertInputWithinCeiling(a.prompt, 1);\n}\n";
    const [hit] = scan([{ file: "packages/credits/src/generate.ts", text }], CALL_SITE);
    expect(text.slice(hit!.start, hit!.index)).not.toMatch(SITE_BOUND["packages/credits/src/generate.ts#meteredCall"]);
  });
});

describe("the prompt producers are a list (audit P3-R2)", () => {
  it("the producer scan equals the listed producers, both ways", () => {
    expect(producerKeys(PRODUCTION)).toEqual([...PRODUCERS].sort());
  });

  it("the one receiver destructure is a receiver, not a producer", () => {
    expect(keys(scan(PRODUCTION, RECEIVER_DESTRUCTURE))).toEqual([
      "packages/credits/src/infer-voice.ts#inferVoice",
    ]);
  });

  it("PLANTED: a sixth producer of each shape is red; a removed producer is red; a comment is not seen", () => {
    const plants: SourceFile[] = [
      { file: "packages/modes/src/plant.ts", text: "export function p(): { system: string } { return { system: PLANT_SYSTEM, prompt: x }; }" },
      { file: "packages/modes/src/plant.ts", text: "export function q() { return { system: \"literal\", prompt: x }; }" },
      { file: "packages/modes/src/plant.ts", text: "export function r(system: string, prompt: string) { return { system, prompt }; }" },
      { file: "packages/modes/src/plant.ts", text: "export function s(a: A): AssembledPrompt { return a; }" },
    ];
    for (const plant of plants) {
      expect(producerKeys([...PRODUCTION, plant]), plant.text).not.toEqual([...PRODUCERS].sort());
    }
    expect(
      producerKeys(PRODUCTION.filter((f) => f.file !== "packages/modes/src/kill-test.ts"))
    ).not.toEqual([...PRODUCERS].sort());
    expect(
      producerKeys([{ file: "packages/modes/src/plant.ts", text: "// return { system: PLANT_SYSTEM, prompt }\n" }])
    ).toEqual([]);
  });
});
