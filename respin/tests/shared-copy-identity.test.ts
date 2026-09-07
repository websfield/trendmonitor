// THE SCREEN AND THE DOWNLOADED FILE SAY THE SAME THING — as a guard, not as a
// hand check (slice 5 stage 2, G0).
//
// WHAT WENT WRONG. `app/(product)/brain/copy.ts` and
// `packages/db/src/export.ts` each held their own copy of the same absence
// sentences and the same claim-label maps. Two copies of one sentence is not a
// style problem: the markdown export printed the VOICE sentence ("we could not
// point to a quote from your posts for this one") for `strategy` and
// `killtest` documents, where nobody searched anything — the creator was asked
// in the interview and left the field undecided. The artefact of record stated
// a false REASON for an absence and told the reader to "confirm" it inside a
// file with no such control (REQ-I03). All three slice-5 reviewer gates found
// it independently.
//
// Stage 1 moved the values down into `@respin/db` (which `app/**` may import
// and which cannot import `app/**`) and verified BY HAND that the app-side
// copies were byte-identical before deleting them. A hand check is evidence
// about one afternoon; this file is the guard.
//
// WHY BOTH HALVES ARE NEEDED, and why value equality alone is not enough:
// `expect(a).toBe(b)` on two STRINGS compares by VALUE, so a future author who
// pastes the sentence back into `copy.ts` as a local literal passes it
// forever — right up until one of the two is edited. The SOURCE half is what
// makes "there is only one of these" checkable; the VALUE half is what catches
// a re-export pointed at the wrong name. Neither subsumes the other, and each
// has a planted-violation test below, because a scanner that finds nothing is
// indistinguishable from a scanner that is broken (CLAUDE.md 2026-08-21).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as db from "@respin/db";
import * as brainCopy from "../app/(product)/brain/copy";
import * as interviewCopy from "../app/(product)/onboarding/interview/copy";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(HERE, "..", rel), "utf8");

/**
 * THE POPULATION, WRITTEN AS A LIST — the 2026-08-29 lesson applied before it
 * can bite. A shared value added to `export.ts` and re-exported by a screen is
 * not covered by this suite until its name is added here, and adding it is
 * what a new shared value costs. `tests/import-boundary.test.ts` is the other
 * half: a name reaching `app/**` at all requires a deliberate entry on the
 * ESLint allowlist.
 */
const SHARED: { module: string; file: string; name: string }[] = [
  ...[
    "PLACEHOLDER_ABSENCE",
    "INTERVIEW_PLACEHOLDER_ABSENCE",
    // The (kind, reason) SELECTOR the two constants above are two answers of
    // (compliance gate round 2). A function, so the `toBe` identity check
    // below is a REFERENCE check — a hand-copied selector can never pass it.
    "screenAbsenceSentence",
    "VOICE_FIELD_LABELS",
    "STRATEGY_FIELD_LABELS",
    "STRATEGY_METRIC_FIELD_LABELS",
    "KILLTEST_FIELD_LABELS",
    "claimLabel",
    "strategyClaimLabel",
    "killtestClaimLabel",
    "isMetricPointer",
    "quoteIntro",
  ].map((name) => ({
    module: "app/(product)/brain/copy.ts",
    file: "app/(product)/brain/copy.ts",
    name,
  })),
  {
    module: "app/(product)/onboarding/interview/copy.ts",
    file: "app/(product)/onboarding/interview/copy.ts",
    name: "METRIC_DIRECTION_LABELS",
  },
];

const MODULES: Record<string, Record<string, unknown>> = {
  "app/(product)/brain/copy.ts": brainCopy as unknown as Record<string, unknown>,
  "app/(product)/onboarding/interview/copy.ts":
    interviewCopy as unknown as Record<string, unknown>,
};

/** Names one module re-exports FROM `@respin/db`, in either sanctioned spelling. */
export function reExportedFromDb(source: string): Set<string> {
  const names = new Set<string>();
  const list = (block: string) =>
    block
      .split(",")
      .map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
      .filter((part) => part.length > 0);

  // Form 1: `export { A, B } from "@respin/db";`
  for (const match of source.matchAll(
    /export\s*\{([^}]*)\}\s*from\s*["']@respin\/db["']/g
  )) {
    for (const name of list(match[1])) names.add(name);
  }
  // Form 2: `import { A } from "@respin/db";` … `export { A };` — the shape a
  // module uses when it also CONSUMES the value it re-exports.
  const imported = new Set<string>();
  for (const match of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["']@respin\/db["']/g
  )) {
    for (const name of list(match[1])) imported.add(name);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*;/g)) {
    for (const name of list(match[1])) {
      if (imported.has(name)) names.add(name);
    }
  }
  return names;
}

/** True when this module DECLARES the name itself — i.e. holds a second copy. */
export function declaresLocally(source: string, name: string): boolean {
  return new RegExp(
    `export\\s+(?:const|let|var|function|async\\s+function|class)\\s+${name}\\b`
  ).test(source);
}

describe("G0: /brain's and the interview's shared vocabulary is ONE value, not two", () => {
  it.each(SHARED)(
    "$module re-exports $name from @respin/db and declares no copy of it",
    ({ file, name }) => {
      const source = src(file);
      expect(reExportedFromDb(source), `${file} re-exports ${name}`).toContain(name);
      expect(declaresLocally(source, name), `${file} redeclares ${name}`).toBe(false);
    }
  );

  it.each(SHARED)("$module's $name IS @respin/db's value", ({ module, name }) => {
    const app = MODULES[module][name];
    const pkg = (db as unknown as Record<string, unknown>)[name];
    expect(pkg, `@respin/db exports ${name}`).toBeDefined();
    // `toBe` on purpose: objects and functions must be the SAME reference (a
    // re-export), which a hand-copied map or function can never be. Strings
    // fall back to value equality here — which is exactly why the source scan
    // above exists and why the plant below proves it fires.
    expect(app, `${module} -> ${name}`).toBe(pkg);
  });

  // THE POPULATION CANNOT BE OUTGROWN SILENTLY (CLAUDE.md 2026-08-29).
  //
  // `SHARED` above is hand-written, and the lesson says a hand-written
  // population narrows the day a second path appears. So the list is DERIVED
  // BACK from the modules: every name either screen re-exports from
  // `@respin/db` must be IN it. A twelfth shared value added to `copy.ts`
  // without an entry above fails HERE, rather than joining the surface with no
  // identity check — which is the exact shape of the defect this round is
  // fixing, one value later.
  it.each([...new Set(SHARED.map((entry) => entry.file))])(
    "%s re-exports NOTHING from @respin/db that this suite is not watching",
    (file) => {
      const listed = new Set(
        SHARED.filter((entry) => entry.file === file).map((entry) => entry.name)
      );
      const unwatched = [...reExportedFromDb(src(file))].filter(
        (name) => !listed.has(name)
      );
      expect(
        unwatched,
        `add these to SHARED (or stop re-exporting them): ${unwatched.join(", ")}`
      ).toEqual([]);
    }
  );

  it("NON-VACUITY: an unlisted re-export IS caught by the derivation above", () => {
    // Drives the same scanner over a planted module source, so the check is
    // proven to FIND something rather than merely to return an empty list.
    const planted = 'export { PLACEHOLDER_ABSENCE, NOT_LISTED_YET } from "@respin/db";';
    const listed = new Set(SHARED.map((entry) => entry.name));
    expect([...reExportedFromDb(planted)].filter((n) => !listed.has(n))).toEqual([
      "NOT_LISTED_YET",
    ]);
  });

  it("every /brain absence sentence still names WHOSE absence it is", () => {
    // The defect in one assertion, at the level the words actually matter:
    // the two sentences must not be interchangeable. `voice` is OUR failed
    // search; `strategy`/`killtest` is the creator's own deliberate choice.
    expect(brainCopy.PLACEHOLDER_ABSENCE).not.toBe(
      brainCopy.INTERVIEW_PLACEHOLDER_ABSENCE
    );
    expect(brainCopy.PLACEHOLDER_ABSENCE).toMatch(/we could not/i);
    expect(brainCopy.INTERVIEW_PLACEHOLDER_ABSENCE).toMatch(/you left this undecided/i);
    expect(brainCopy.INTERVIEW_PLACEHOLDER_ABSENCE).not.toMatch(/we could not/i);
  });

  it("the selector's third answer names the CREATOR's own edit, not our search", () => {
    // Literals, not the two constants above: this is the round-2 finding, and
    // an assertion reading the value it checks would move with a mutation.
    const edited = brainCopy.screenAbsenceSentence(
      "voice",
      "Version 2: you edited this document."
    );
    expect(edited.toLowerCase()).toContain(
      "you left this unstated when you edited this version"
    );
    expect(edited.toLowerCase()).not.toContain("we could not point to a quote");
    expect(edited.toLowerCase()).not.toContain("you left this undecided in the interview");
    // The screen's half still ends in a control the reader can operate.
    expect(edited.toLowerCase()).toContain("edit it again to state it");
    // ...and the INFERRED voice answer is still exactly the shipped constant,
    // so widening the selector did not quietly re-word the original case.
    expect(
      brainCopy.screenAbsenceSentence(
        "voice",
        "Version 1: inferred from 3 of your onboarding inputs."
      )
    ).toBe(brainCopy.PLACEHOLDER_ABSENCE);
    expect(
      brainCopy.screenAbsenceSentence(
        "strategy",
        "Version 1: inferred from 3 of your onboarding inputs."
      )
    ).toBe(brainCopy.INTERVIEW_PLACEHOLDER_ABSENCE);
  });

  it("NON-VACUITY: a re-introduced local literal IS caught", () => {
    const planted = [
      'export { quoteIntro } from "@respin/db";',
      'export const PLACEHOLDER_ABSENCE =',
      '  "We could not point to a quote from your posts for this one, so we are not stating it. Confirm it as still unknown.";',
    ].join("\n");
    expect(reExportedFromDb(planted)).not.toContain("PLACEHOLDER_ABSENCE");
    expect(declaresLocally(planted, "PLACEHOLDER_ABSENCE")).toBe(true);
  });

  it("NON-VACUITY: a local FUNCTION copy is caught too", () => {
    const planted = [
      "export function claimLabel(pointer: string): string | null {",
      "  return pointer;",
      "}",
    ].join("\n");
    expect(declaresLocally(planted, "claimLabel")).toBe(true);
    expect(reExportedFromDb(planted)).not.toContain("claimLabel");
  });

  it("NON-VACUITY: the scanner reads BOTH re-export spellings, and only from @respin/db", () => {
    expect(
      reExportedFromDb('export { A, B as C } from "@respin/db";')
    ).toEqual(new Set(["A", "B"]));
    expect(
      reExportedFromDb(
        'import { D } from "@respin/db";\nexport { D };'
      )
    ).toEqual(new Set(["D"]));
    // A name re-exported from somewhere ELSE is not a shared value.
    expect(reExportedFromDb('export { E } from "./local";')).toEqual(new Set());
    expect(
      reExportedFromDb('import { F } from "./local";\nexport { F };')
    ).toEqual(new Set());
  });
});
