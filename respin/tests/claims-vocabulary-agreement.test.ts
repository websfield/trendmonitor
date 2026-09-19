// THE TWO COPIES OF ONE VOCABULARY, BOUND TOGETHER.
//
// `packages/modes/src/claims.ts` scans model-authored text for performance
// forecasts, certainty promises and concealment advice (REQ-I04, REQ-I05). Its
// `performance` family is a DELIBERATE COPY of `tests/support/forbidden-claims`
// `PERFORMANCE_CLAIMS`, because a production module may not import from the
// test tree — and two copies of one list are the divergence this repo has
// already shipped once: `/brain` banned `guarantee` and `confiden`, `/onboarding`
// — the screen that spends a credit — banned neither, and neither list was a
// superset of the other (compliance gate, 2026-08-29).
//
// SO THE AGREEMENT IS ASSERTED FROM BOTH SIDES. `packages/modes`' own suite
// compares them one way; this file is the other, and it lives in `tests/`
// because that is the only tree that may import `@respin/modes` (the T1
// default-deny in `eslint.config.mjs` ignores `packages/**` and `tests/**`;
// `app/**` is denied it outright by R-64).
//
// THE RELATION IS SUPERSET, NOT EQUALITY, and saying so precisely is the whole
// job of this file:
//
//   - the `performance` family is PERFORMANCE_CLAIMS, id for id and source for
//     source, IN ORDER;
//   - `certainty:guarantee` is `FORBIDDEN_CLAIMS`' own `guarantee`, which lives
//     in the canon rather than in the performance list;
//   - everything else is an EXTRA that the canon has no entry for, and the
//     extras are enumerated here so that adding one is a decision rather than a
//     drift.
//
// A pattern is compared by `source` AND `flags`, never by `toString()` alone
// and never by "it matches the same specimen": two different patterns can share
// a specimen, and that is exactly the kind of agreement that looks like one.
import { describe, expect, it } from "vitest";

// BY PATH, NOT BY PACKAGE NAME, and that is the stronger of the two. Adding
// `@respin/modes` to the app package's dependencies would make it RESOLVABLE
// from `app/**` — R-64's denial would then rest on the lint rule alone, where
// today it also rests on module resolution. `tests/creator-data-registry.test.ts`
// already reads package source this way, and `tests/**` is exempt from both the
// T1 default-deny and the specifier-shape deny (`eslint.config.mjs`).
import {
  OUTPUT_CLAIM_SHAPES,
  type OutputClaimShape,
} from "../packages/modes/src/claims";
import { FLAG_ONLY_FIELD_PREFIXES } from "../packages/modes/src/traceability";
import { DISCLOSURE_FIELD_PREFIX } from "../app/(product)/studio/run-copy";

import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";

const performance = OUTPUT_CLAIM_SHAPES.filter(
  (s: OutputClaimShape) => s.family === "performance"
);
const canonSource = (label: string) => {
  const entry = [...FORBIDDEN_CLAIMS, ...PERFORMANCE_CLAIMS].find(
    ([l]) => l === label
  );
  return entry ? { source: entry[1].source, flags: entry[1].flags } : null;
};

/**
 * The claims `@respin/modes` carries that the repo's canon does not.
 *
 * NAMED, NOT COUNTED. "There are nine extras" is satisfied by any nine; naming
 * them means an extra that appears — or one that quietly disappears — is a red
 * test rather than an arithmetic coincidence. `concealment` has no canon entry
 * at all because until slice 6 nothing in this product generated a disclosure
 * section for a creator to read.
 */
const EXPECTED_EXTRAS: readonly string[] = [
  "certainty:cannot fail",
  "concealment:skip the label",
  "concealment:no need to disclose",
  "concealment:disclosure is optional",
  "concealment:do not mention",
  "concealment:nobody needs to know",
  "concealment:leave it out",
  "concealment:hide that a tool made it",
];

describe("the modes vocabulary and the repo canon agree", () => {
  it("the performance family is PERFORMANCE_CLAIMS, id for id, IN ORDER", () => {
    // ORDER IS ASSERTED because `claims.ts` says the copy is "same ids, same
    // pattern sources, in the same order" — and a claim recorded in a comment
    // is verified by the test that records it or it is not a claim.
    expect(performance.map((s) => s.id)).toEqual(PERFORMANCE_CLAIMS.map(([l]) => l));
    // NON-VACUITY: the list is the fourteen the canon actually holds, so an
    // accidentally-empty filter cannot pass this by matching an empty canon.
    //
    // EIGHT UNTIL 2026-09-01. Six joined together, and the count is pinned so
    // that adding a seventh on ONE side is a red test: `goes viral` (R20's
    // third noun, which had a demotion and no predicate shape to complete it)
    // and the five OWN-BASELINE shapes the learning-honesty gate measured
    // reaching a creator through `whyThisPerforms` with no finding at all.
    expect(performance.length).toBe(14);
    expect(PERFORMANCE_CLAIMS.length).toBe(14);
  });

  it("...and pattern for pattern, by SOURCE and FLAGS", () => {
    // The failure this rules out: an id list that agrees while one pattern was
    // edited on one side only, so the scanner and the screen guard disagree
    // about what the word means.
    for (const [i, shape] of performance.entries()) {
      const [label, pattern] = PERFORMANCE_CLAIMS[i];
      expect(shape.id, `entry ${i}`).toBe(label);
      expect(shape.pattern.source, `${label} source`).toBe(pattern.source);
      expect(shape.pattern.flags, `${label} flags`).toBe(pattern.flags);
    }
  });

  it("...and specimen for specimen, so neither list's non-vacuity probe drifts", () => {
    // Both files prove their patterns non-vacuous with a specimen. If the two
    // specimens diverge, each list is proving something about a different
    // sentence and "they agree" stops meaning anything.
    for (const shape of performance) {
      expect(CLAIM_SPECIMENS[shape.id], shape.id).toBe(shape.specimen);
      // ...and the specimen really matches BOTH patterns, lowercased — which is
      // how the canon is used everywhere in this repo.
      expect(shape.pattern.test(shape.specimen.toLowerCase()), shape.id).toBe(true);
    }
  });

  it("certainty:guarantee is FORBIDDEN_CLAIMS' own entry, not a second spelling", () => {
    // `guarantee` is REQ-I04's word and it lives in the CANON rather than in
    // the performance list, so it is a family of its own in `claims.ts` instead
    // of being smuggled into a list that has to stay id-for-id identical.
    const shape = OUTPUT_CLAIM_SHAPES.find(
      (s) => s.family === "certainty" && s.id === "guarantee"
    );
    expect(shape, "certainty:guarantee").toBeDefined();
    const canon = canonSource("guarantee");
    expect(canon, "FORBIDDEN_CLAIMS' guarantee").not.toBeNull();
    expect(shape!.pattern.source).toBe(canon!.source);
    expect(shape!.pattern.flags).toBe(canon!.flags);
    expect(CLAIM_SPECIMENS.guarantee).toBe(shape!.specimen);
  });

  it("the SUPERSET is exactly the named extras — no more, no fewer", () => {
    // Every shape that is not a canon entry, keyed `family:id`. This is the
    // assertion that makes the relation "superset" rather than "whatever landed
    // last": a new concealment word is a one-line decision recorded here, and a
    // deleted one is a red test rather than a quiet loosening of REQ-I05.
    const extras = OUTPUT_CLAIM_SHAPES.filter(
      (s) => !(s.family === "performance" || (s.family === "certainty" && s.id === "guarantee"))
    ).map((s) => `${s.family}:${s.id}`);
    expect(extras).toEqual(EXPECTED_EXTRAS);
  });

  it("EVERY shape is non-vacuous against its own specimen, canon or extra", () => {
    // CLAUDE.md, 2026-08-21: a scan reporting zero findings is otherwise
    // indistinguishable from a scan whose pattern broke. Per shape, not for the
    // list as a whole — a specimen satisfied by some OTHER pattern would leave
    // a typo invisible.
    for (const shape of OUTPUT_CLAIM_SHAPES) {
      expect(shape.specimen.length, `${shape.family}:${shape.id}`).toBeGreaterThan(3);
      expect(
        shape.pattern.test(shape.specimen.toLowerCase()),
        `${shape.family}:${shape.id} does not match its own specimen`
      ).toBe(true);
    }
    expect(OUTPUT_CLAIM_SHAPES.length).toBe(
      PERFORMANCE_CLAIMS.length + 1 + EXPECTED_EXTRAS.length
    );
  });

  it("no pattern carries the `g` flag, which would make `test` stateful", () => {
    // A `/g` RegExp's `test` advances `lastIndex`, so the SECOND call on the
    // same pattern can return false for text that matches. Both lists are used
    // with `.test` across many strings in a loop, so this is a correctness
    // property of the agreement rather than style.
    for (const [label, pattern] of [...FORBIDDEN_CLAIMS, ...PERFORMANCE_CLAIMS]) {
      expect(pattern.flags, label).not.toContain("g");
    }
    for (const shape of OUTPUT_CLAIM_SHAPES) {
      expect(shape.pattern.flags, `${shape.family}:${shape.id}`).not.toContain("g");
    }
  });
});

// ---------------------------------------------------------------------------

describe("the OTHER two-copy list: which fields are flag-only", () => {
  /**
   * A SECOND VOCABULARY WITH THE SAME FAILURE MODE, bound in the same file.
   *
   * `enforcementFor` in `@respin/modes` softens a traceability finding for two
   * reasons: a soft SHAPE, or a field under `FLAG_ONLY_FIELD_PREFIXES`. The
   * `/studio` screen has to explain WHICH reason applied — telling a creator
   * that a flagged number is "a name" is the defect this pass fixed — so
   * `traceabilityFlagNote` tests the field prefix itself. `app/**` may not
   * import `@respin/modes` (R-64), so that prefix is a hand-written copy, and a
   * hand-written copy of a list is exactly what the header above is about.
   *
   * THE DRIFT IS BENIGN AND STILL WRONG. A prefix added over there and not here
   * degrades to the neutral sentence rather than to a false one — but it would
   * stop naming the reason, which is the whole point of the note. So it is
   * asserted rather than tolerated.
   */
  it("pins the flag-only prefix used by Studio's stored-not-listed filter", () => {
    expect(
      FLAG_ONLY_FIELD_PREFIXES,
      "a new flag-only prefix needs a presentation decision"
    ).toEqual([DISCLOSURE_FIELD_PREFIX]);
  });
});
