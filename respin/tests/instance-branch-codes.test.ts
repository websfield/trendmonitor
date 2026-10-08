// `INSTANCE_BRANCH_CODES` IS DERIVED FROM `billingErrorCode`'s OWN BRANCHES
// (launch L2, E-25(iii); billing re-check finding 7).
//
// The screens derive "which codes can this path produce" from the class table
// PLUS `INSTANCE_BRANCH_CODES` — so a class `billingErrorCode` branches on that
// is missing from that map, or a code a branch can return (its `??` fallback
// included) that the map does not list, is a refusal that renders the neutral
// fallback on the screen that raised it. L1 shipped exactly that:
// `CreativeRequestError` had a branch and no entry. This scanner READS the
// branches — every `if (err instanceof X ...)` in the function, every string
// literal its region returns, and every literal of a `*_CODES` map it indexes —
// and must catch a PLANTED missing branch and a PLANTED missing code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  BILLING_ERROR_CODES,
  INSTANCE_BRANCH_CODES,
} from "../app/(product)/billing-errors";

const SOURCE = readFileSync(
  fileURLToPath(new URL("../app/(product)/billing-errors.ts", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

/** `billingErrorCode`'s body, up to the class-table loop that ends it. */
function functionBody(source: string): string {
  const start = source.indexOf("export function billingErrorCode(");
  if (start < 0) throw new Error("billingErrorCode not found");
  const end = source.indexOf("for (const h of HANDLERS)", start);
  if (end < 0) throw new Error("the HANDLERS loop that ends billingErrorCode was not found");
  return source.slice(start, end);
}

/** The string values of a `const NAME ... = { ... };` map in the file. */
function mapValues(source: string, name: string): string[] {
  const at = source.search(new RegExp(String.raw`const ${name}\b[^=]*=\s*\{`));
  if (at < 0) throw new Error(`the map ${name} was not found`);
  const open = source.indexOf("{", at);
  const close = source.indexOf("};", open);
  return [...source.slice(open, close).matchAll(/:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

/** Class name -> every code its instance branch(es) can return. */
export function branchCodes(source: string): Map<string, Set<string>> {
  const body = functionBody(source);
  const known = new Set<string>(BILLING_ERROR_CODES as readonly string[]);
  const branches = [...body.matchAll(/if \(err instanceof (\w+)/g)];
  const out = new Map<string, Set<string>>();
  branches.forEach((match, i) => {
    const from = match.index ?? 0;
    const to = branches[i + 1]?.index ?? body.length;
    const region = body.slice(from, to);
    const codes = out.get(match[1]) ?? new Set<string>();
    for (const lit of region.matchAll(/"([a-z0-9_]+)"/g)) {
      if (known.has(lit[1])) codes.add(lit[1]);
    }
    for (const map of region.matchAll(/\b([A-Z][A-Z0-9_]*_CODES)\[/g)) {
      for (const value of mapValues(source, map[1])) codes.add(value);
    }
    out.set(match[1], codes);
  });
  return out;
}

/** Every disagreement between the branches and the map, as sentences. */
function disagreements(
  branches: Map<string, Set<string>>,
  map: Readonly<Record<string, readonly string[]>>
): string[] {
  const out: string[] = [];
  for (const [cls, codes] of branches) {
    const listed = map[cls];
    if (!listed) {
      out.push(`${cls} has an instance branch and no INSTANCE_BRANCH_CODES entry`);
      continue;
    }
    for (const code of codes) {
      if (!listed.includes(code)) out.push(`${cls} can return ${code}, which its entry does not list`);
    }
  }
  for (const [cls, listed] of Object.entries(map)) {
    if (!branches.has(cls)) out.push(`${cls} is listed but billingErrorCode has no branch for it`);
    for (const code of listed) {
      if (!branches.get(cls)?.has(code)) out.push(`${cls} lists ${code}, which no branch returns`);
    }
  }
  return out;
}

describe("INSTANCE_BRANCH_CODES matches billingErrorCode's instanceof branches", () => {
  it("every branch has an entry and every code it can return (fallbacks included) is listed — and nothing else is", () => {
    const branches = branchCodes(SOURCE);
    expect(disagreements(branches, INSTANCE_BRANCH_CODES)).toEqual([]);
  });

  it("NON-VACUITY: it SEES the branches E-25(iii) names, fallbacks included", () => {
    const branches = branchCodes(SOURCE);
    expect([...branches.keys()].sort()).toEqual(
      expect.arrayContaining(["CreativePieceError", "CreativeRequestError", "LlmError", "PastedReferenceInputError", "RevisionParentError", "RunSlotBusyError"])
    );
    // The `??` fallback the re-check named, read off the map-indexing branch.
    expect(branches.get("PastedReferenceInputError")).toContain("pasted_reference_input");
    expect(branches.get("PastedReferenceInputError")).toContain("pasted_reference_url");
    expect(branches.get("CreativeRequestError")).toEqual(
      new Set(["creative_revision_legacy", "creative_revision_form", "creative_request"])
    );
    expect(branches.get("CreativePieceError")).toContain("creative_piece");
  });

  it("PLANTED: a NEW branch with no entry is caught", () => {
    const planted = SOURCE.replace(
      "  for (const h of HANDLERS)",
      '  if (err instanceof PlantedError) return "unknown";\n  for (const h of HANDLERS)'
    );
    expect(planted).not.toBe(SOURCE);
    expect(disagreements(branchCodes(planted), INSTANCE_BRANCH_CODES)).toContain(
      "PlantedError has an instance branch and no INSTANCE_BRANCH_CODES entry"
    );
  });

  it("PLANTED: a code DROPPED from an entry — the L1 shape, and the `??` fallback shape — is caught", () => {
    const branches = branchCodes(SOURCE);
    const withoutCreative = { ...INSTANCE_BRANCH_CODES };
    delete (withoutCreative as Record<string, unknown>).CreativeRequestError;
    expect(disagreements(branches, withoutCreative)).toContain(
      "CreativeRequestError has an instance branch and no INSTANCE_BRANCH_CODES entry"
    );
    const withoutFallback = {
      ...INSTANCE_BRANCH_CODES,
      PastedReferenceInputError: INSTANCE_BRANCH_CODES.PastedReferenceInputError.filter(
        (c) => c !== "pasted_reference_input"
      ),
    };
    expect(disagreements(branches, withoutFallback)).toContain(
      "PastedReferenceInputError can return pasted_reference_input, which its entry does not list"
    );
  });

  it("PLANTED: a new code returned inside an EXISTING branch is caught", () => {
    const planted = SOURCE.replace(
      'if (err.reason === "revision_keeps_form") return "creative_revision_form";',
      'if (err.reason === "revision_keeps_form") return "creative_revision_form";\n    if (err.reason === ("x" as never)) return "unknown";'
    );
    expect(planted).not.toBe(SOURCE);
    expect(disagreements(branchCodes(planted), INSTANCE_BRANCH_CODES)).toContain(
      "CreativeRequestError can return unknown, which its entry does not list"
    );
  });
});
