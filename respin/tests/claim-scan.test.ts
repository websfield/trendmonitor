// THE SCANNER'S OWN SCANNER — the thing that was missing when three screens'
// honesty scans were structurally incapable of firing (audit 2026-09-19
// finding 27).
//
// The defect was never that a pattern was wrong. Every pattern in the canon
// was correct the whole time. The defect was that the PREDICATE which applies
// them had been re-invented three times and was broken in all three, and
// nothing outside those three files ever tried to break them — a verifier is
// not verified until something outside it tries (CLAUDE.md, 2026-08-26).
//
// So this file is outside. It plants a violation of EVERY entry of EVERY list
// and demands `claimHits` name it, and it keeps the broken idiom itself as a
// permanent fixture so the shape can never quietly come back.
import { describe, expect, it } from "vitest";
import * as canon from "./support/forbidden-claims";
import {
  FORBIDDEN_CLAIMS,
  MARKETING_CLAIM_GAPS,
  MARKETING_CLAIMS,
  NOT_BUILT_YET,
  PERFORMANCE_CLAIMS,
  type ForbiddenClaim,
} from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";
import {
  PRODUCTION_ROOTS,
  ROOT_DIRS,
  sourceFilesUnder,
  topLevelDirsHoldingTypeScript,
} from "./support/source-files";

const ALL = [FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS, MARKETING_CLAIMS, NOT_BUILT_YET] as const;

/**
 * Source with its comments removed.
 *
 * Every scan below reads CODE. A token in a docblock is prose about the rule,
 * not an instance of it, and the census predicate could be satisfied by one
 * until 2026-09-21 (batch-5 compliance gate, C-2). The `[^:]` guard keeps a
 * URL's `//` from eating the rest of a live line.
 */
// ONE ALTERNATION, NOT TWO PASSES, and that is a measured correction rather
// than a preference. Stripping block comments first made `` `app/**` `` inside
// a LINE comment open a phantom block that ran to the next `*/` hundreds of
// lines later: `tests/framework-ui.test.tsx` carries that exact string at
// `:48`, and the naive stripper deleted its real `CLAIM_SPECIMENS[label]`
// plant at `:856`, reporting a file with a working plant as plantless. A
// scanner that silently deletes the code it is about to read is the
// fail-open shape in its purest form, so the order is pinned by the case
// below. Leftmost-first alternation consumes whichever comment starts first.
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (_m, before?: string) =>
    before === undefined ? " " : `${before} `
  );

/**
 * What a real specimen plant looks like in code: a call, not a mention.
 *
 * `...CLAIM_SPECIMENS` counts. Two screens build a local specimen table by
 * spreading the canon's and adding their own screen-scoped words, then index
 * THAT — which is the plant, in the only form those screens can write it.
 */
const plantShape = /\bspecimensFor\s*\(|\bCLAIM_SPECIMENS\s*[[.]|\.\.\.\s*CLAIM_SPECIMENS\b/;

/**
 * The shapes a re-invented predicate is written in, each with a running plant.
 *
 * WHAT THIS LIST DOES AND DOES NOT CATCH, stated because the previous version
 * of this scan claimed the class and carried one spelling (batch-4 gate). Each
 * entry is a SHAPE a hand-rolled extractor takes: pulling `.pattern` off a
 * tuple, falling back to `String(claim)`, branching on `instanceof RegExp`, or
 * casting the entry to an object with a `pattern` field. All four were in the
 * three vacuous scans; all four are compile-legal today, which is why a source
 * scan rather than a type is what sees them.
 *
 * KNOWN GAP, NAMED RATHER THAN ROUNDED AWAY: a re-invention that is correctly
 * SHAPED but weaker — say a consumer that destructures `[label, pattern]`
 * properly and then tests only the first 200 characters of a page — matches
 * none of these and is invisible here. That class is covered from the other
 * side by the consumer census below, which demands every canon consumer plant
 * a specimen of its own: a weaker predicate that still catches a planted
 * violation of every entry is not the defect this file exists for.
 */
const REINVENTION_SHAPES: readonly ForbiddenClaim[] = [
  ["pattern-or-string", /\.pattern\s*\?\?\s*String\(/],
  ["regexp-branch", /instanceof RegExp/],
  ["pattern-cast", /as \{\s*pattern/],
  // THE FOURTH SHAPE, AND THE ONE THE "KNOWN GAP" PARAGRAPH ABOVE USED TO
  // DESCRIBE AS UNREACHABLE (batch-5 compliance gate, C-1). It is the
  // CORRECTLY-SHAPED re-invention: destructure a canon list and call `.test()`
  // yourself. Six files were doing exactly that on 2026-09-21 — five under
  // `tests/` and `packages/modes/tests/claims.test.ts` — and every scanner in
  // this file was blind to all six, because nothing about them is malformed.
  //
  // They are a re-invention all the same: each skips the `lastIndex` reset
  // `claim-scan.ts` exists to guarantee, and each is a second place where
  // "does this string make this claim" gets decided. P1-R4's headline clause
  // is "the helper is the ONLY exported way to run the canon", and a list of
  // consumers owed a plant is not that clause — it is a softer one that was
  // recorded in its place.
  //
  // WHY A SOURCE SCAN AND NOT A TYPE: the lists have to stay exported, because
  // WHICH lists apply to a screen is that screen's own decision. What may not
  // be re-invented is the predicate, and a call shape is not a type.
  //
  // It is not a flat regex either, so it lives in `canonPredicateSites` below
  // rather than in this list: iterating a canon list is legitimate for
  // METADATA (comparing a pattern's `source` against another vocabulary,
  // asserting `flags`, driving `CLAIM_SPECIMENS` through a PRODUCTION scan),
  // and a pattern that cannot tell those from a decision would have to be
  // loosened until it saw nothing.
];

/**
 * Files where a canon list is destructured and the pattern's own `.test()` is
 * what decides whether a string makes a claim — i.e. `claimHits` re-invented.
 *
 * THE SHAPE, PRECISELY. Two constructs bind a canon entry's pattern:
 * `for (const [label, pattern] of <CANON>)` and
 * `<CANON>.some(([, pattern]) => …)`. The re-invention is not the iteration,
 * it is calling `pattern.test(...)` on what it bound. Iterating for metadata —
 * `pattern.flags`, `pattern.source`, or `[label]` alone to fetch a specimen —
 * binds nothing that is then used as the decision, and is left alone.
 *
 * Deliberately conservative in the safe direction: a file that binds a pattern
 * ANYWHERE and calls `.test()` on that binding ANYWHERE is reported, without
 * scope analysis. A false positive is a name somebody has to justify in
 * `PREDICATE_ALLOWED`; a false negative is the class staying open.
 */
const CANON_IDENT = "(?:FORBIDDEN_CLAIMS|PERFORMANCE_CLAIMS|MARKETING_CLAIMS|NOT_BUILT_YET)";

function canonPredicateSites(text: string): string[] {
  const bound = new Set<string>();
  const forOf = new RegExp(
    String.raw`for\s*\(\s*const\s*\[\s*[\w$]*\s*,\s*([\w$]+)\s*\]\s*of\s+(?:\[[^\]]*)?` + CANON_IDENT,
    "g"
  );
  const callback = new RegExp(
    CANON_IDENT + String.raw`[^\n]{0,40}?\.\s*(?:some|filter|every|find|map)\s*\(\s*\(?\s*\[\s*[\w$]*\s*,\s*([\w$]+)\s*\]`,
    "g"
  );
  for (const re of [forOf, callback]) {
    for (const match of text.matchAll(re)) bound.add(match[1]!);
  }
  return [...bound].filter((name) =>
    new RegExp(String.raw`\b${name}\s*\.\s*test\s*\(`).test(text)
  );
}

/**
 * The files allowed to contain those shapes, and why each one may.
 *
 * A list, not a pattern (non-negotiable 7), and each entry carries its reason
 * so a third name cannot be added without stating one:
 *
 *   - `tests/claim-scan.test.ts` — this file, which keeps the defect as a
 *     RUNNING fixture so the repo demonstrates why it cannot come back.
 *   - `tests/support/claim-scan.ts` — quotes the idiom in its docblock, to say
 *     what was removed and what it did. Prose, never executed.
 *
 * Sorted, because the assertion below compares against a sorted scan.
 */
const IDIOM_ALLOWED = ["tests/claim-scan.test.ts"];

/**
 * Per-shape allowlists, because the fourth shape has a different one.
 *
 * The three malformed shapes may appear only where the broken idiom is kept as
 * a fixture or quoted as prose. `canon-iterated-directly` is different: this
 * file legitimately iterates a canon list inside the running fixture that
 * demonstrates the old predicate, and `forbidden-claims.ts` may iterate its own
 * lists for its own internal checks. Every OTHER file must go through
 * `claimHits`.
 *
 * A list, not a pattern (non-negotiable 7). Adding a name means writing why.
 */
const SHAPE_ALLOWED: Record<string, readonly string[]> = {
  "pattern-or-string": IDIOM_ALLOWED,
  "regexp-branch": IDIOM_ALLOWED,
  "pattern-cast": IDIOM_ALLOWED,
};

/**
 * The only files allowed to decide a claim with a canon pattern's own `.test`.
 *
 * ONE ENTRY, AND IT IS THE FIXTURE. `tests/claim-scan.test.ts` runs the broken
 * idiom as a live demonstration and plants a flagged pattern to prove the
 * `lastIndex` reset works; both need a direct `.test()`.
 *
 * Anything else that appears here is a re-invention somebody has to justify in
 * writing.
 *
 * MEASURED, AND THE MEASUREMENT MOVED TWICE. The batch-5 gate reported six
 * files from a token search. This detector's first run found **nine**:
 * `usage-honesty`, `results-honesty`, `onboarding-ui`,
 * `onboarding-interview-ui` and `studio-ui` were not among the gate's six, and
 * two of the gate's six turned out to be metadata reads rather than decisions.
 * Repairing the comment stripper (see `stripComments`) then exposed **two
 * more** — `framework-ui` and `trends-ui` — which a phantom block comment had
 * been hiding. **Eleven** files in total now go through `claimHits`.
 *
 * The count is written here, beside the assertion that maintains it, because a
 * count kept in a progress document is the thing this programme has shipped
 * stale five times.
 */
const PREDICATE_ALLOWED = ["tests/claim-scan.test.ts"];

/**
 * The canon's list exports, DERIVED from the module rather than typed out.
 *
 * A fifth list added to `forbidden-claims.ts` joins the census with no edit
 * here — which is the difference between a population and a list somebody
 * remembered to update.
 */
const CANON_LIST_NAMES: readonly string[] = Object.entries(canon)
  .filter(
    ([, value]) =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === "string" &&
          entry[1] instanceof RegExp
      )
  )
  .map(([name]) => name)
  .sort();

/**
 * Consumers that run the canon today with no specimen plant of their own.
 *
 * **EMPTY AS OF 2026-09-21, and that is the point of the list.** It held six
 * entries, measured 2026-09-20 — and the batch-5 compliance gate found that
 * calling them "owed a plant" understated what they were: all six ran the
 * canon through their own loop, which is P1-R4's headline clause unmet, not a
 * missing witness. All six now go through `claimHits` and carry a per-entry
 * `specimensFor` plant, and the loops themselves are caught by the
 * `canon-iterated-directly` shape above, so the two halves agree.
 *
 * ONE OF THE SIX WAS BORN IN THE SAME UNCOMMITTED CHANGE as the helper that
 * was meant to end the class (`tests/shell-rail.test.tsx`), and this list
 * absorbed it silently. A ratchet that a NEW consumer can enter by being added
 * to it is not a ratchet, which is why the empty list is now the assertion:
 * any entry at all is a decision somebody has to write down.
 *
 * It stays a RATCHET in the other direction too: a new consumer with no plant
 * appears in the measured set, does not appear here, and is red.
 */
const PLANT_OWED: readonly string[] = [];

describe("claimHits is the one predicate, and it fires", () => {
  it("the lists are not empty — an empty canon makes every scan in the repo vacuous", () => {
    expect(FORBIDDEN_CLAIMS.length).toBeGreaterThanOrEqual(9);
    expect(PERFORMANCE_CLAIMS.length).toBeGreaterThanOrEqual(14);
    expect(MARKETING_CLAIMS.length).toBeGreaterThanOrEqual(1);
    expect(NOT_BUILT_YET.length).toBeGreaterThanOrEqual(4);
  });

  it.each(specimensFor(...ALL))(
    "%s: a planted violation is caught and named",
    (label, specimen) => {
      expect(claimHits(specimen, ...ALL)).toContain(label);
    }
  );

  it("honest text is not flagged — the scan discriminates rather than always failing", () => {
    // Every one of these is live product or marketing copy that must pass, so
    // "it catches everything" cannot be mistaken for "it works".
    for (const honest of [
      "Scripts in your voice, built on reviewed mechanisms.",
      "Respin builds your voice rules from your own posts.",
      "Log results. Approve every change.",
      "It never promises a video will take off.",
      "Your clip [check]: the shelf pan in morning light.",
      "Why this could perform",
    ]) {
      expect(claimHits(honest, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS, MARKETING_CLAIMS), honest).toEqual([]);
    }
  });

  it("no canon entry carries a regex flag, and the predicate survives one that does", () => {
    // TWO HALVES, because either alone fails open (batch-4 gate, BLOCK-3).
    //
    // The canon's patterns are module-level and shared. A `g` or `y` flag makes
    // `.test()` advance `lastIndex`, so the same input alternates true/false
    // across calls — and `marketing-claims.test.tsx` calls `claimHits` eight
    // times per run over these lists. The first half pins the tree's current
    // property; the second proves the predicate no longer depends on it.
    for (const list of ALL) {
      for (const [label, pattern] of list) {
        expect(pattern.flags, `${label} carries a regex flag; claimHits shares these objects across calls`).toBe("");
      }
    }
    const stateful: readonly [string, RegExp][] = [["planted-g", /\blearn/g]];
    const three = [0, 1, 2].map(() => claimHits("we learn your style", stateful));
    expect(three, "a flagged pattern must not alternate across identical calls").toEqual([
      ["planted-g"],
      ["planted-g"],
      ["planted-g"],
    ]);
    // `y` IS A DIFFERENT FAILURE, AND THE HELPER'S DOCBLOCK CLAIMED THE RESET
    // FIXED BOTH (batch-5 compliance gate, C-7). It does not. `lastIndex = 0`
    // makes a STICKY pattern anchored at position 0, so it stops alternating
    // and starts UNDER-matching — deterministically, silently, and in the
    // direction that lets a claim through. Measured here rather than argued,
    // which is what the docblock was doing.
    //
    // So for `y` the control is the first half of this case, which pins every
    // canon entry flagless from the tree. The helper's docblock now says that.
    const sticky: readonly [string, RegExp][] = [["planted-y", /\blearn/y]];
    expect(claimHits("we learn your style", sticky), "sticky under-matches mid-string").toEqual([]);
    expect(claimHits("learn your style", sticky), "...and matches only at position 0").toEqual([
      "planted-y",
    ]);
  });

  it("MEASURED GAPS: every sales shape the vocabulary misses is recorded, and still misses", () => {
    // THE GAP LIST IS AN ASSERTION, NOT A NOTE. `MARKETING_CLAIM_GAPS` records
    // what a 2026-09-20 measurement found the three marketing patterns cannot
    // reach — 17 of 17 plausible sales sentences passed, one of them live copy
    // — and this test holds the record and the code together. If a future
    // pattern catches one of these, this goes red and the list is edited in
    // the same change, so "the class is closed" can never be written while the
    // list says otherwise (CLAUDE.md non-negotiable 7, fourth recurrence).
    expect(MARKETING_CLAIM_GAPS.length, "an empty gap list claims a complete vocabulary").toBeGreaterThan(0);
    for (const sentence of MARKETING_CLAIM_GAPS) {
      expect(
        claimHits(sentence, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS, MARKETING_CLAIMS),
        `"${sentence}" is caught now — delete it from MARKETING_CLAIM_GAPS in this change`
      ).toEqual([]);
    }
    // Non-vacuous: the same predicate on the same lists DOES catch the shapes
    // the vocabulary was written for, so the gaps above are a scope statement
    // rather than a broken scan.
    expect(claimHits("built on mechanisms proven by posted results", MARKETING_CLAIMS)).toContain("proven");
  });

  it("the case fold is the helper's, not the caller's", () => {
    // Every pattern is lowercase with no `i` flag. A caller that passed
    // already-cased text used to get a silently weaker scan; the helper folds.
    expect(claimHits("WE LEARN YOUR STYLE OVER TIME", FORBIDDEN_CLAIMS)).toContain("learn");
  });

  it("specimensFor refuses a claim with no specimen rather than skipping it", () => {
    const orphan = [["no-such-claim", /\bzzz\b/]] as const;
    expect(() => specimensFor(orphan)).toThrow(/no specimen/);
  });

  /**
   * THE BROKEN IDIOM, KEPT AS A FIXTURE.
   *
   * Verbatim what `changelog.test.ts`, `sample-spin-copy.test.tsx` and
   * `activation-view.test.tsx` each carried. It is reproduced here — and only
   * here — so the repo holds a RUNNING demonstration of why it cannot come
   * back, instead of a paragraph asserting it.
   */
  it("REGRESSION: the idiom the three vacuous scans used cannot catch anything", () => {
    const brokenScan = (text: string): string[] => {
      const lower = text.toLowerCase();
      const hits: string[] = [];
      for (const claim of FORBIDDEN_CLAIMS as readonly unknown[]) {
        const pattern =
          typeof claim === "string"
            ? claim
            : (claim as { pattern?: RegExp | string }).pattern ?? String(claim);
        const hit =
          pattern instanceof RegExp
            ? pattern.test(lower)
            : lower.includes(String(pattern).toLowerCase());
        if (hit) hits.push(String(pattern));
      }
      return hits;
    };

    const plainly = "we learn your style over time and we train a model on your posts";
    // The old predicate: nothing, on a sentence that violates two entries.
    expect(brokenScan(plainly)).toEqual([]);
    // The shipped predicate: both, by name.
    expect(claimHits(plainly, FORBIDDEN_CLAIMS)).toEqual(
      expect.arrayContaining(["learn", "train"])
    );
  });

  it("the scanned population is every root on disk, not the three somebody remembered", () => {
    // THE POPULATION IS THE FINDING. Until 2026-09-20 this scan walked
    // `tests/` alone, so 513 files under `app/`, `packages/`, `worker/` and
    // `e2e/` were outside it — including `packages/modes/tests/claims.test.ts`
    // and `kill-test.test.ts`, which import the very canon it guards. The
    // root list is asserted against disk, so a new top-level directory is a
    // red test rather than a silent exclusion (non-negotiable 7).
    expect([...ROOT_DIRS].sort()).toEqual(topLevelDirsHoldingTypeScript());
    const scanned = sourceFilesUnder();
    expect(scanned.length, "the scan read no files — it would pass vacuously").toBeGreaterThan(500);
    // Root-level modules belong to no directory root and are read too.
    expect(scanned.map(({ file }) => file)).toContain("middleware.ts");
    // ...and the roots the previous version missed really are in it now.
    expect(scanned.map(({ file }) => file)).toContain(
      "packages/modes/tests/claims.test.ts"
    );
  });

  it.each(REINVENTION_SHAPES)(
    "REGRESSION: no file in this workspace re-invents the predicate (%s)",
    (label, shape) => {
      // The class, not the three instances. A fourth screen that inlines the
      // cast is a red test here rather than a silently open gate — which is
      // the only form of this fix the register's own wording accepts. Checked
      // by source scan because the defect is a SHAPE, not a behaviour any
      // rendered output can reveal.
      //
      // COMMENTS ARE STRIPPED FIRST (batch-5). Four of these shapes are now
      // quoted in docblocks in this very file to explain what they are; a scan
      // that read prose would report its own explanations as violations, and
      // the obvious repair — loosening the pattern until the comments pass —
      // is how a scanner quietly stops seeing the code.
      const offenders = sourceFilesUnder()
        .filter(({ text }) => shape.test(stripComments(text)))
        .map(({ file }) => file)
        .sort();
      // Non-vacuous from the other side, per shape: a running fixture carries
      // each one, so a shape that matched nothing would fail here first rather
      // than reporting a clean tree (CLAUDE.md, 2026-08-26).
      expect(offenders, `${label} matched nothing at all`).toEqual(SHAPE_ALLOWED[label]);
    }
  );

  it("REGRESSION: no file decides a claim with a canon pattern's own .test()", () => {
    // THE CORRECTLY-SHAPED RE-INVENTION — the class the three shapes above
    // cannot see, and the one P1-R4's headline clause is actually about
    // ("the helper is the only exported way to run the canon").
    const offenders = sourceFilesUnder()
      .filter(({ text }) => canonPredicateSites(stripComments(text)).length > 0)
      .map(({ file }) => file)
      .sort();
    expect(offenders).toEqual(PREDICATE_ALLOWED);
  });

  it("NON-VACUITY: the detector separates a DECISION from a metadata read", () => {
    // Both directions, against the real detector. Without the second half this
    // scan would have to be loosened until it saw nothing, because legitimate
    // metadata iteration outnumbers the defect in this repo.
    const decides = `for (const [label, pattern] of FORBIDDEN_CLAIMS) { if (pattern.test(t)) hits.push(label); }`;
    const decidesViaCallback = `const hit = [...FORBIDDEN_CLAIMS, ...PERFORMANCE_CLAIMS].some(([, re]) => re.test(t));`;
    expect(canonPredicateSites(decides)).toEqual(["pattern"]);
    expect(canonPredicateSites(decidesViaCallback)).toEqual(["re"]);
    // ...and these are the three legitimate shapes that live in the tree today
    // and must NOT be reported.
    const readsFlags = `for (const [label, pattern] of FORBIDDEN_CLAIMS) { expect(pattern.flags, label).toBe(""); }`;
    const readsSource = `const theirs = FORBIDDEN_CLAIMS.find(([label]) => label === "guarantee");`;
    const drivesSpecimen = `for (const [label] of PERFORMANCE_CLAIMS) { expect(() => write(CLAIM_SPECIMENS[label])).toThrow(); }`;
    for (const legit of [readsFlags, readsSource, drivesSpecimen]) {
      expect(canonPredicateSites(legit), legit).toEqual([]);
    }
  });

  it("CENSUS: every file that runs the canon plants a specimen against its own scan", () => {
    // THE OTHER HALF OF THE CLASS. The shape scan above cannot see a
    // re-invention that is correctly shaped and merely weaker. What can is the
    // plant: a scan that catches an injected violation of every entry is live,
    // whatever its author wrote. The audit's three vacuous scans were also the
    // only three canon consumers with no plant.
    expect(CANON_LIST_NAMES, "the canon exports no lists — the census is vacuous").toEqual(
      ["FORBIDDEN_CLAIMS", "MARKETING_CLAIMS", "NOT_BUILT_YET", "PERFORMANCE_CLAIMS"]
    );
    const namesCanonList = new RegExp(`\\b(${CANON_LIST_NAMES.join("|")})\\b`);
    const consumers = sourceFilesUnder().filter(
      ({ file, text }) =>
        file !== "tests/support/claim-scan.ts" &&
        /from "[^"]*support\/forbidden-claims"/.test(text) &&
        namesCanonList.test(text)
    );
    expect(consumers.length, "no consumer was found — the census read nothing").toBeGreaterThan(15);
    // THE PREDICATE READS CODE, NOT PROSE (batch-5 compliance gate, C-2).
    // It was `!/CLAIM_SPECIMENS|specimensFor/.test(text)` over RAW source, and
    // that mis-measured in both directions: it reported two files as plantless
    // that carried real planted-violation witnesses, and a new consumer could
    // have cleared the ratchet by writing `CLAIM_SPECIMENS` in a comment. The
    // false positives mattered most — the instruments file drew a conclusion
    // ("absence of a plant is the measured predictor") from a list that could
    // not measure absence.
    //
    // A plant is now a CALL: `specimensFor(` or `CLAIM_SPECIMENS[`, with
    // comments stripped first.
    const plantless = consumers
      .filter(({ text }) => !plantShape.test(stripComments(text)))
      .map(({ file }) => file)
      .sort();
    expect(plantless, "a canon consumer with no plant is a scan nobody has tried to break").toEqual(
      PLANT_OWED
    );
  });

  it("CENSUS NON-VACUITY: a mention in a comment is not a plant", () => {
    // The two error directions the old predicate had, both driven through the
    // real stripper rather than restated.
    expect(plantShape.test(stripComments("// drives specimensFor(FORBIDDEN_CLAIMS) one day\n"))).toBe(false);
    expect(plantShape.test(stripComments("/* CLAIM_SPECIMENS[label] */\n"))).toBe(false);
    expect(plantShape.test(stripComments("it.each(specimensFor(FORBIDDEN_CLAIMS))(\n"))).toBe(true);
    expect(plantShape.test(stripComments("const s = CLAIM_SPECIMENS[label];\n"))).toBe(true);
    expect(plantShape.test(stripComments("const S = { ...CLAIM_SPECIMENS, later: 'x' };\n"))).toBe(true);
    // A URL's `//` must survive, or the stripper would eat live code.
    expect(stripComments('const u = "https://x"; specimensFor(L);\n')).toContain("specimensFor(L)");
  });

  it("STRIPPER NON-VACUITY: a `/**` inside a LINE comment does not eat the file", () => {
    // THE DEFECT THIS ORDER EXISTS FOR, as a case rather than as the docblock
    // above. Measured on 2026-09-21: `tests/framework-ui.test.tsx:48` says
    // "`app/**` is the only tree exempt" in a `//` comment, and a
    // block-comments-first stripper treated that `/**` as an opener, ran to a
    // real `*/` 800 lines later, and deleted the file's working plant. Every
    // scan in this file reads stripped source, so that is a scanner deleting
    // its own evidence.
    const src = [
      "// the single place in `app/**` this appears",
      "const s = CLAIM_SPECIMENS[label];",
      "/** a real docblock */",
      "const t = specimensFor(FORBIDDEN_CLAIMS);",
    ].join("\n");
    const stripped = stripComments(src);
    expect(stripped).toContain("CLAIM_SPECIMENS[label]");
    expect(stripped).toContain("specimensFor(FORBIDDEN_CLAIMS)");
    expect(stripped).not.toContain("a real docblock");
    expect(stripped).not.toContain("the single place");
    // ...and the file that actually carried it still reads as planted.
    const framework = sourceFilesUnder(["tests"]).find(
      ({ file }) => file === "tests/framework-ui.test.tsx"
    );
    expect(framework, "the file this case is about is no longer scanned").toBeDefined();
    expect(plantShape.test(stripComments(framework!.text))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE ROOT-LIST CENSUS (P1-R3b)
//
// `ROOT_DIRS` and `PRODUCTION_ROOTS` are only "the one root list" if nothing
// quietly carries a second one. The first version of this predicate looked for
// a root ARRAY, which is blind to the walker shape — `walk(join(ROOT,
// "worker"))` is a private root list with no array in sight — so it counted six
// files where the tree holds 21 (plan-review batch 1, #16).
//
// TWO SHAPES, because one of them alone is the undercount that made this a
// finding:
//   A  a root-array literal          const ROOTS = ["packages", "app"]
//   B  a path to a top-level root    walk(join(ROOT, "worker"))
// Shape B takes the root as the LAST argument, so `join(ROOT, "app",
// "(product)")` — a surface directory, not a root list — is out by construction.
//
// An entry leaves this list by MIGRATING onto the shared module, never by being
// deleted from it; an entry that stays carries the reason its population is
// deliberately narrower. "A package test cannot reach the shared module" is not
// such a reason — `packages/modes/tests/*.test.ts` already import root
// `tests/support/` by relative path.
const ROOT_LIST_SHAPES = {
  A: /\[\s*("(app|e2e|lib|packages|scripts|tests|worker|ops|middleware\.ts)"\s*,?\s*){2,}\]/,
  B: /(join|resolve)\(\s*[A-Za-z_.]+\s*,\s*"(app|e2e|lib|packages|scripts|tests|worker|ops)"\s*\)/,
} as const;

/** Every file carrying its own root list, by the two shapes, over CODE. */
function rootListCensus(files: readonly { file: string; text: string }[]): string[] {
  return files
    .filter(({ text }) => {
      const code = stripComments(text);
      return ROOT_LIST_SHAPES.A.test(code) || ROOT_LIST_SHAPES.B.test(code);
    })
    .map(({ file }) => file)
    .sort();
}

/** The test files the census reads: `tests/**` and every package's `tests/**`. */
function censusFiles(): { file: string; text: string }[] {
  return sourceFilesUnder(["tests", "packages"]).filter(({ file }) =>
    file.startsWith("tests/") || /^packages\/[^/]+\/tests\//.test(file)
  );
}

/**
 * The census, each entry with its disposition.
 *
 * MEASURED, NEVER TYPED: 21 files over comment-stripped code and 22 over the
 * raw text (`tests/action-gate.test.ts` is the one comment-only match, and it
 * is the live proof that the stripping is real). Re-measured 2026-09-21.
 */
const ROOT_LIST_CENSUS: Readonly<Record<string, string>> = {
  // THE HOME. The one legitimate root-array literal, and the ratchet's fixed
  // anchor — on the list so the count is honest, never migrated because there
  // is nothing to migrate it onto.
  "tests/support/source-files.ts":
    "the shared module itself — ROOT_DIRS and PRODUCTION_ROOTS live here",

  // NARROWER BY DECISION. Each reads a population that is deliberately not the
  // root list, and says which.
  // THIS FILE IS INSIDE ITS OWN POPULATION, and that is deliberate. The
  // non-vacuity cases below plant `["packages", "app"]` and `join(ROOT,
  // "worker")` as string literals, which is what makes them plants — so the
  // census finds its own file, exactly as `source-citations.test.ts` is inside
  // its own. A guard exempting itself is the hole this repo has paid for.
  "tests/claim-scan.test.ts":
    "the census's own planted specimens — the literals that prove both shapes fire",
  // NOT A SOURCE-ROOT WALK. `PACKAGES_DIR = join(ROOT, "packages")` is a
  // directory handle for the MANIFEST population (`packages/*/package.json`)
  // and for the on-disk package-list assertion; this file's source population
  // migrated onto `sourceFilesUnder(PRODUCTION_ROOTS)` on 2026-09-21. Shape B
  // cannot tell a handle from a walk, and it is not going to be taught to —
  // that is the cleverness that fails open — so the entry is recorded instead.
  "tests/no-scraping.test.ts":
    "join(ROOT, \"packages\") is the MANIFEST directory handle; the source population is the shared list",
  "tests/support/app-surface.ts": "SCAN_ROOTS is the ROUTABLE app surface, not every root",
  "tests/support/no-streaming.ts": "app/ only — streaming is a response concern",
  "tests/client-bundle-boundary.test.ts": "app/ only — the client bundle is built from app/",
  "tests/probe-artifacts.test.ts": "app/ only — probes are route handlers",
  "tests/profile-cage.test.ts": "packages/*/src — scopes live there",
  "tests/studio-ui.test.tsx": "packages/*/src — the mode registry lives there",
  "tests/import-boundary.test.ts": "declares the TEST-side roots, which ROOT_DIRS deliberately is not",
  "tests/feedback-readers.test.ts": "PRODUCT_SOURCE_TREES — the product trees, not the workspace",
  "tests/table-writers.test.ts":
    "the self-pin asserting PRODUCTION_ROOTS' exact value — the control that the shared list did not drift",
  "packages/db/tests/connector-verified-closure.test.ts":
    "the production set minus scripts and ops — a closure over DB writers",
  "packages/db/tests/lifecycle-registry.test.ts": "packages/*/src — the registry lives there",
  "packages/llm/tests/boundary.test.ts": "packages/*/src — the provider boundary",
  "packages/llm/tests/no-text.test.ts": "packages/*/src — the provider boundary",
  "packages/credits/tests/stripe.test.ts":
    "resolve(pkgDir, \"tests\") — pkgDir is THAT PACKAGE's directory, not the workspace root; " +
    "recorded rather than silently excluded, because the predicate cannot tell a root identifier from a package one",
};

describe("the root list is shared, and nothing carries a second one", () => {
  it("PRODUCTION_ROOTS = ROOT_DIRS ∖ {tests, e2e} ∪ {ops} — asserted, not described", () => {
    // EITHER LIST EDITED ALONE IS RED. `ops` is in the production list and not
    // in ROOT_DIRS because it holds no TypeScript, so the relation cannot be
    // read off `topLevelDirsHoldingTypeScript()` and needs this assertion.
    const derived = [
      ...[...ROOT_DIRS].filter((root) => root !== "tests" && root !== "e2e"),
      "ops",
    ].sort();
    expect([...PRODUCTION_ROOTS].sort()).toEqual(derived);
    // THE EXACT VALUE IS PINNED ONCE, AND NOT HERE. `table-writers.test.ts`
    // ("the scan is non-empty against the real repo") carries the literal
    // `["packages", "app", "worker", "scripts", "lib", "ops"]` and now asserts
    // it against the shared copy — the control that survived the move. A second
    // copy of that literal here would be a second root list in the very file
    // whose census exists to find them, which is how it first appeared.
  });

  it("every file carrying its own root list is on the census, with its reason", () => {
    const measured = rootListCensus(censusFiles());
    expect(measured.sort()).toEqual(Object.keys(ROOT_LIST_CENSUS).sort());
    // A ratchet: every entry states WHY its population is narrower.
    for (const [file, reason] of Object.entries(ROOT_LIST_CENSUS)) {
      expect(reason.length, `${file} is on the census with no reason`).toBeGreaterThan(20);
    }
  });

  it("NON-VACUITY: both shapes fire, and a commented one does not", () => {
    const planted = (text: string) => rootListCensus([{ file: "tests/planted.test.ts", text }]);
    // Shape A — a root-array literal.
    expect(planted('const ROOTS = ["packages", "app"];\n')).toEqual(["tests/planted.test.ts"]);
    // Shape B — a walker built onto a top-level root.
    expect(planted('walk(join(ROOT, "worker"));\n')).toEqual(["tests/planted.test.ts"]);
    // THE SAME TWO LINES INSIDE A COMMENT DO NOT FIRE — the stripping is real,
    // and this is the case that proves the census reads code rather than prose.
    expect(planted('// const ROOTS = ["packages", "app"];\n')).toEqual([]);
    expect(planted('/* walk(join(ROOT, "worker")); */\n')).toEqual([]);
    // ...and a SURFACE directory is not a root list: the root is the last
    // argument, so a deeper join is out by construction rather than by luck.
    expect(planted('walk(join(ROOT, "app", "(product)", "results"));\n')).toEqual([]);
  });

  it("deleting an entry without migrating its file is red", () => {
    // THE RATCHET'S DIRECTION. Removing a name from the census while the file
    // still carries a private root list must fail — otherwise the census is a
    // list somebody edits instead of a measurement.
    const shortened = { ...ROOT_LIST_CENSUS };
    delete (shortened as Record<string, string>)["tests/support/app-surface.ts"];
    const measured = rootListCensus(censusFiles());
    expect(measured.sort()).not.toEqual(Object.keys(shortened).sort());
  });

  it("the raw text carries one more match than the code — the stripping is measured", () => {
    // 22 raw / 21 stripped. `tests/action-gate.test.ts` matches only inside a
    // comment, so it is the live non-vacuity case for the stripping above.
    const files = censusFiles();
    const raw = files
      .filter(({ text }) => ROOT_LIST_SHAPES.A.test(text) || ROOT_LIST_SHAPES.B.test(text))
      .map(({ file }) => file);
    const code = rootListCensus(files);
    expect(raw.length).toBe(code.length + 1);
    expect(raw.filter((file) => !code.includes(file))).toEqual([
      "tests/action-gate.test.ts",
    ]);
  });
});
