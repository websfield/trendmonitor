// THE MIRROR HAS A WITNESS.
//
// `src/vocabulary.ts` holds C1's four closed sets as TYPE unions so this
// package compiles beside `@respin/db` rather than after it. A mirror with no
// mechanism behind it is the slice-8c defect wearing a comment: two packages
// owning the same closed set, both suites building their own fixtures, and
// neither ever meeting the other's data.
//
// SO THIS FILE IS THE MEETING. It reads the `as const` arrays out of
// `@respin/db`'s own sources and the unions out of this package's, TEXTUALLY,
// and requires them to agree member for member and in order. It is not an
// import: importing would make the mirror pointless and would put a
// cross-package dependency in a package that needs none.
//
// WHAT IT CANNOT SEE, said before it reports anything: it compares the sets a
// PRODUCT declares, not the enum a MIGRATION emits. `results-schema.ts` builds
// its pgEnums and its confounder CHECK from these same arrays, so that half is
// held by construction on the other side of the boundary — but this scan is
// not the thing holding it.
//
// EVERY REGEXP IS A LITERAL, never assembled from a string, and every one is
// driven against a planted violation below (CLAUDE.md 2026-08-21): a scan that
// reports agreement because it extracted nothing is indistinguishable from one
// that works.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbSourceDir = resolve(packageRoot, "..", "db", "src");
const mirrorFile = join(packageRoot, "src", "vocabulary.ts");

/** `export const NAME = ["a", "b"] as const;` — the shape C1 pins. */
const CONST_ARRAY = /export const ([A-Z][A-Z0-9_]*)\s*=\s*\[([^\]]*)\]\s*as const/g;

/** `export type Name = "a" | "b";` — the shape the mirror uses. */
const TYPE_UNION = /export type ([A-Za-z][A-Za-z0-9]*)\s*=([^;]*);/g;

/** Every double-quoted member inside one of the two shapes above. */
const MEMBER = /"([^"]*)"/g;

const members = (body: string): string[] =>
  [...body.matchAll(MEMBER)].map((match) => match[1]!);

export function constArrays(source: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const match of source.matchAll(CONST_ARRAY)) found.set(match[1]!, members(match[2]!));
  return found;
}

export function typeUnions(source: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const match of source.matchAll(TYPE_UNION)) {
    const extracted = members(match[2]!);
    // A type alias that is not a string union (an object type, a mapped type)
    // contributes nothing and must not be recorded as an EMPTY vocabulary —
    // "declared with no members" and "not a vocabulary" are different facts.
    if (extracted.length > 0) found.set(match[1]!, extracted);
  }
  return found;
}

/**
 * THE PAIRS, AS A LIST, because a population written any other way narrows
 * silently (CLAUDE.md 2026-08-29). Adding a vocabulary to either side is a
 * deliberate edit here.
 */
const PAIRS: readonly { declared: string; mirrored: string }[] = [
  { declared: "RESULT_EVIDENCE_STATES", mirrored: "EvidenceState" },
  { declared: "RESULT_AUDIENCE_CLASSES", mirrored: "AudienceClass" },
  { declared: "RESULT_LEVERS", mirrored: "Lever" },
  { declared: "RESULT_CONFOUNDER_CODES", mirrored: "ConfounderCode" },
  { declared: "METRIC_DIRECTIONS", mirrored: "MetricDirection" },
];

function declaredVocabularies(): Map<string, string[]> {
  const all = new Map<string, string[]>();
  let filesRead = 0;
  for (const name of readdirSync(dbSourceDir)) {
    if (!name.endsWith(".ts")) continue;
    filesRead += 1;
    for (const [key, value] of constArrays(readFileSync(join(dbSourceDir, name), "utf8"))) {
      all.set(key, value);
    }
  }
  // NON-VACUITY ON THE WALK ITSELF: an empty result must mean "no declaration
  // matched", never "no file was opened".
  expect(filesRead, "the walk read no @respin/db sources").toBeGreaterThan(10);
  return all;
}

describe("the C1 vocabularies are mirrored, not re-decided", () => {
  it("every pinned pair exists on BOTH sides", () => {
    const declared = declaredVocabularies();
    const mirrored = typeUnions(readFileSync(mirrorFile, "utf8"));
    expect(
      PAIRS.filter((pair) => !declared.has(pair.declared)).map((pair) => pair.declared),
      "a C1 vocabulary named here is not declared in @respin/db — it was renamed, moved out of src/, or has not landed yet, and until it is found this file is comparing nothing"
    ).toEqual([]);
    expect(
      PAIRS.filter((pair) => !mirrored.has(pair.mirrored)).map((pair) => pair.mirrored),
      "a mirrored union named here is missing from src/vocabulary.ts"
    ).toEqual([]);
  });

  it("each pair agrees member for member, IN ORDER", () => {
    const declared = declaredVocabularies();
    const mirrored = typeUnions(readFileSync(mirrorFile, "utf8"));
    for (const pair of PAIRS) {
      expect(
        mirrored.get(pair.mirrored),
        `${pair.mirrored} has drifted from ${pair.declared} — the mirror is temporary and must be RE-POINTED at @respin/db, never edited to agree by hand`
      ).toEqual(declared.get(pair.declared));
    }
  });

  it("NON-VACUITY: the extractors find planted declarations, and the comparison catches a planted mismatch", () => {
    const planted = constArrays(
      'export const RESULT_LEVERS = ["reach", "conversion"] as const;\n' +
        "export const NOT_AN_ARRAY = 3;\n"
    );
    expect([...planted.keys()]).toEqual(["RESULT_LEVERS"]);
    expect(planted.get("RESULT_LEVERS")).toEqual(["reach", "conversion"]);

    const mirrored = typeUnions(
      'export type Lever = "reach" | "conversion";\n' +
        "export type NotAVocabulary = { id: string };\n"
    );
    expect([...mirrored.keys()]).toEqual(["Lever"]);
    expect(mirrored.get("Lever")).toEqual(["reach", "conversion"]);

    // The mismatch the real cases would catch: a member added on one side,
    // and the same members in a different order.
    expect(
      constArrays('export const RESULT_LEVERS = ["reach", "conversion", "saves"] as const;').get(
        "RESULT_LEVERS"
      )
    ).not.toEqual(mirrored.get("Lever"));
    expect(
      typeUnions('export type Lever = "conversion" | "reach";').get("Lever")
    ).not.toEqual(planted.get("RESULT_LEVERS"));
  });

  it("NON-VACUITY: a multi-line union is extracted whole, not truncated at the first newline", () => {
    // `ConfounderCode` is written across seven lines. A pattern using `.`
    // instead of a negated class would capture the first member and report
    // agreement on a set of one.
    const extracted = typeUnions(
      'export type ConfounderCode =\n  | "topic_overlap"\n  | "account_growth"\n  | "platform_change";\n'
    );
    expect(extracted.get("ConfounderCode")).toEqual([
      "topic_overlap",
      "account_growth",
      "platform_change",
    ]);
  });
});
