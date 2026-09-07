import { describe, expect, it } from "vitest";

import {
  CODE_SPIN_STRICTNESS_FLOOR,
  HOOK_COMPARISON_WINDOW_WORDS,
  MAX_BEATS,
  MAX_HOOK_CHARS,
  MAX_SUBJECT_TERMS,
  MAX_SUBJECT_TERM_CHARS,
  SUBJECT_MATCH_WINDOW_WORDS,
  effectiveSpinStrictness,
  evaluateSpinSimilarity,
  type SpinReference,
} from "../src/similarity";
import { contentOverlap, contentWords } from "../src/mode-checks";
import { words } from "../src/text";
import { parseScriptOutput } from "../src/output";
import { IDEATION_OUTPUT, SCRIPT_OUTPUT } from "./support/mode-fixtures";

const REFERENCE: SpinReference = {
  // This is the bounded AUTOPSY CONTRACT, not raw transcript or the generic
  // generation input. The trends owner constructs it from trusted metadata.
  subjectTerms: ["kitchen renovation", "cabinet paint", "weekend makeover"],
  hook: "I painted my kitchen cabinets in one weekend and regret every shortcut",
  structure: { beatCount: 3, turnBeat: 1 },
};

const CHANGED_STRUCTURE = [
  ...SCRIPT_OUTPUT.beats,
  { atSeconds: 20, vo: "keep the one take that proves the point", isTurn: false },
];

const CLEAN = parseScriptOutput({
  text: JSON.stringify({ ...SCRIPT_OUTPUT, beats: CHANGED_STRUCTURE }),
  mode: "analyseAndSpin",
});

function withSpin(changes: Partial<typeof SCRIPT_OUTPUT>) {
  return parseScriptOutput({
    text: JSON.stringify({ ...SCRIPT_OUTPUT, ...changes }),
    mode: "analyseAndSpin",
  });
}

describe("the Spin similarity hard gate (REQ-E04 / REQ-I02)", () => {
  it("clamps a weaker stored config to the code refusal floor, while allowing stricter config", () => {
    expect(effectiveSpinStrictness(0)).toBe(CODE_SPIN_STRICTNESS_FLOOR);
    expect(effectiveSpinStrictness(CODE_SPIN_STRICTNESS_FLOOR - 0.1)).toBe(
      CODE_SPIN_STRICTNESS_FLOOR,
    );
    expect(effectiveSpinStrictness(CODE_SPIN_STRICTNESS_FLOOR + 0.1)).toBe(
      CODE_SPIN_STRICTNESS_FLOOR + 0.1,
    );
  });

  it("never lets a weaker stored config pass a hook the code floor refuses, and a stricter config can refuse more", () => {
    const partlyOverlapping = withSpin({
      hooks: [
        { text: "Painted mistakes finally taught me a better workflow", mechanic: "cold open" },
        ...SCRIPT_OUTPUT.hooks.slice(1),
      ],
      beats: CHANGED_STRUCTURE,
    });

    expect(
      evaluateSpinSimilarity({
        output: partlyOverlapping,
        reference: REFERENCE,
        configuredStrictness: 0,
      }).failed,
    ).not.toContain("hook");
    expect(
      evaluateSpinSimilarity({
        output: partlyOverlapping,
        reference: REFERENCE,
        configuredStrictness: 0.95,
      }).failed,
    ).toContain("hook");
  });

  it("requires an explicit bounded, structured reference rather than generic input", () => {
    expect(() =>
      evaluateSpinSimilarity({
        output: CLEAN,
        reference: { hook: REFERENCE.hook } as unknown as SpinReference,
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }),
    ).toThrow(/trusted structured reference/i);
  });

  it("accepts a spin that changes subject, hook wording, and structure", () => {
    const result = evaluateSpinSimilarity({
      output: CLEAN,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.accepted).toBe(true);
  });

  it("uses exact word boundaries for subject terms, but still rejects an exact multiword subject", () => {
    const cartOnly = withSpin({
      thesis: {
        statement: "A cart carries the camera through the difficult take",
        why: "the filming setup needs less friction",
      },
      beats: CHANGED_STRUCTURE,
    });
    const artReference: SpinReference = {
      subjectTerms: ["art"],
      hook: "A stranger taught me to read the tide before sunrise",
      structure: REFERENCE.structure,
    };
    expect(
      evaluateSpinSimilarity({
        output: cartOnly,
        reference: artReference,
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).not.toContain("subject");

    const exactMultiword = withSpin({
      thesis: {
        statement: "Cabinet paint fails when the prep is rushed",
        why: "the finish needs time to cure",
      },
      beats: CHANGED_STRUCTURE,
    });
    expect(
      evaluateSpinSimilarity({
        output: exactMultiword,
        reference: REFERENCE,
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).toContain("subject");
  });

  it("refuses each required change independently", () => {
    const sameSubject = withSpin({
      thesis: {
        statement: "A kitchen renovation only works when cabinet paint dries slowly",
        why: "the weekend makeover needs patience",
      },
      hooks: [
        { text: "Film one honest lens change before you blame the camera", mechanic: "cold open" },
        ...SCRIPT_OUTPUT.hooks.slice(1),
      ],
      beats: CHANGED_STRUCTURE,
    });
    const sameHook = withSpin({
      hooks: [
        { text: REFERENCE.hook, mechanic: "cold open" },
        ...SCRIPT_OUTPUT.hooks.slice(1),
      ],
      beats: CHANGED_STRUCTURE,
    });
    const sameStructure = withSpin({
      beats: [
        { atSeconds: 0, vo: "show the first bad take", isTurn: false },
        { atSeconds: 6, vo: "change the dial", isTurn: true },
        { atSeconds: 14, vo: "film it again", isTurn: false },
      ],
    });

    for (const [name, output] of [
      ["subject", sameSubject],
      ["hook", sameHook],
      ["structure", sameStructure],
    ] as const) {
      const result = evaluateSpinSimilarity({
        output,
        reference: REFERENCE,
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      });
      expect(result.accepted, name).toBe(false);
      expect(result.failed, name).toContain(name);
    }
  });

  it.each([
    ["reordered", "shortcut every regret and weekend one in cabinets kitchen my painted I"],
    ["multiplicity", "I painted painted painted my kitchen cabinets in one weekend"],
    ["padding", "I painted my kitchen cabinets in one weekend and regret every shortcut while filming a long unrelated tutorial about camera settings"],
  ])("blocks %s hook near-copy evasions", (_name, hook) => {
    const output = withSpin({
      hooks: [{ text: hook, mechanic: "cold open" }, ...SCRIPT_OUTPUT.hooks.slice(1)],
      beats: CHANGED_STRUCTURE,
    });
    const result = evaluateSpinSimilarity({
      output,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.accepted).toBe(false);
    expect(result.failed).toContain("hook");
  });

  it("blocks a near-copy moved into a later displayed hook", () => {
    const output = withSpin({
      hooks: [
        { text: "A fresh opening about filming one honest take", mechanic: "cold open" },
        { text: REFERENCE.hook, mechanic: "confession" },
        ...SCRIPT_OUTPUT.hooks.slice(2),
      ],
      beats: CHANGED_STRUCTURE,
    });

    const result = evaluateSpinSimilarity({
      output,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });

    expect(result.accepted).toBe(false);
    expect(result.failed).toContain("hook");
    expect(result.hookSimilarity).toBe(1);
  });

  it("blocks a near-copy placed in a later ideas hook", () => {
    const output = parseScriptOutput({
      text: JSON.stringify({
        ...IDEATION_OUTPUT,
        ideas: [
          IDEATION_OUTPUT.ideas[0],
          { ...IDEATION_OUTPUT.ideas[1], hook: REFERENCE.hook },
          IDEATION_OUTPUT.ideas[2],
        ],
      }),
      mode: "ideation",
    });
    const result = evaluateSpinSimilarity({
      output,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });

    expect(result.accepted).toBe(false);
    expect(result.failed).toContain("hook");
    expect(result.hookSimilarity).toBe(1);
  });

  // THE POPULATION BLOCK (compliance gate round 1, 2026-09-03). The gate used
  // to compare the reference hook only against `isHook` units, while the Spin
  // surface (`displayableSpin`) renders the thesis, every beat's VO and the
  // caption as well — and the reference hook verbatim in any of those three
  // MEASURED `accepted=true, hookSimilarity=0.00`. Each placement below is a
  // non-hook field the screen shows; each must fail on `hook` ALONE, so the
  // witness is the population and not a coincidental subject/structure hit.
  it.each([
    [
      "thesis statement",
      withSpin({
        thesis: { statement: REFERENCE.hook, why: "the footage shows the same shortcut failing twice" },
        beats: CHANGED_STRUCTURE,
      }),
    ],
    [
      "a beat's voice-over",
      withSpin({
        beats: [
          CHANGED_STRUCTURE[0],
          { atSeconds: 6, vo: REFERENCE.hook, isTurn: true },
          ...CHANGED_STRUCTURE.slice(2),
        ],
      }),
    ],
    [
      "the caption",
      withSpin({
        caption: { text: REFERENCE.hook, hashtags: ["filmmaking"] },
        beats: CHANGED_STRUCTURE,
      }),
    ],
    [
      "an ideas hook",
      parseScriptOutput({
        text: JSON.stringify({
          ...IDEATION_OUTPUT,
          ideas: [
            IDEATION_OUTPUT.ideas[0],
            { ...IDEATION_OUTPUT.ideas[1], hook: REFERENCE.hook },
            IDEATION_OUTPUT.ideas[2],
          ],
        }),
        mode: "ideation",
      }),
    ],
  ])("blocks the reference hook placed verbatim in %s, a displayed non-hook field", (_placement, output) => {
    const result = evaluateSpinSimilarity({
      output,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.accepted).toBe(false);
    expect(result.failed).toEqual(["hook"]);
    expect(result.hookSimilarity).toBe(1);
  });

  it("still refuses to compare an output with no hook-marked unit at all", () => {
    // The widened population must not quietly turn "nothing to compare" into
    // "compared against the thesis and passed".
    // A parsed caption-mode document is a real `ScriptOutput` with no hook-
    // marked unit (the spin parser itself refuses a hookless reply).
    const hookless = parseScriptOutput({
      text: JSON.stringify({
        thesis: SCRIPT_OUTPUT.thesis,
        caption: SCRIPT_OUTPUT.caption,
        whyThisPerforms: SCRIPT_OUTPUT.whyThisPerforms,
        disclosure: SCRIPT_OUTPUT.disclosure,
      }),
      mode: "caption",
    });
    expect(() =>
      evaluateSpinSimilarity({
        output: hookless,
        reference: REFERENCE,
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }),
    ).toThrow(/no hook to compare/i);
  });
});

/**
 * THE DECLARED PROXY BOUNDARY (compliance gate round 1 NOTE, 2026-09-03).
 *
 * These pin CURRENT behaviour, not desired behaviour. The gate is a
 * deterministic lexical/structural comparison (R-87); it is not semantic
 * similarity and not plagiarism detection, and each case below is a shape it
 * is KNOWN to let through. They are here so the boundary is measured and
 * visible rather than argued, and so that a future lemmatiser, a stricter
 * structure property or a semantic pass changes a red line here on purpose.
 * Each score is the number the probe measured on 2026-09-03.
 */
describe("the Spin gate's documented lexical boundary (R-87 — a proxy, not a detector)", () => {
  it("subject inflection passes: `kitchen renovations` / `cabinet paints` are not the exact term sequence", () => {
    const inflected = withSpin({
      thesis: {
        statement: "Kitchen renovations fail when cabinet paints are rushed",
        why: "weekend makeovers hide the preparation cost",
      },
      beats: CHANGED_STRUCTURE,
    });
    const result = evaluateSpinSimilarity({
      output: inflected,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.failed).not.toContain("subject");
    expect(result.accepted).toBe(true);
  });

  it("a turn moved by one beat with the same beat count passes `structure`", () => {
    const turnShifted = withSpin({
      beats: [
        { atSeconds: 0, vo: "show the first bad take", isTurn: false },
        { atSeconds: 6, vo: "change the dial", isTurn: false },
        { atSeconds: 14, vo: "film it again", isTurn: true },
      ],
    });
    const result = evaluateSpinSimilarity({
      output: turnShifted,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.failed).not.toContain("structure");
    expect(result.accepted).toBe(true);
  });

  it("a semantic paraphrase of the hook with no shared content token scores 0", () => {
    const paraphrased = withSpin({
      hooks: [
        {
          text: "Rushing a cupboard refinish across a single Saturday taught me why prep matters",
          mechanic: "cold open",
        },
        ...SCRIPT_OUTPUT.hooks.slice(1),
      ],
      beats: CHANGED_STRUCTURE,
    });
    const result = evaluateSpinSimilarity({
      output: paraphrased,
      reference: REFERENCE,
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.hookSimilarity).toBe(0);
    expect(result.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE REFERENCE THE PRODUCER ACTUALLY PRODUCES (2026-09-04).
//
// The first `analyseAndSpin` generation that ever completed against the real
// vendor reached this gate and was refused — not for copying anything, but
// because `assertTrustedReference` demanded a hook of 30 words or fewer and the
// autopsy of a real video carries its opening verbatim, which is 63. Three
// other bounds disagreed with the producer the same way. A spin of a real
// autopsy was therefore impossible, and no test could see it: this package has
// no dependency on `packages/trends`, so both sides built their own fixtures.

/** The hook from the autopsy the 8c walk created, verbatim. 63 words. */
const REAL_AUTOPSY_HOOK =
  "Your second draft is almost always worse than your first, and I can tell you exactly why.\n\n" +
  "The first draft is written by the part of you that had something to say. The second is " +
  "written by the part of you that has now read the first. Those are different people with " +
  "different goals. One wants to be understood. The other wants to be safe.";

const letters = "abcdefghijklmnopqrstuvwxyz";
/** Distinct, letter-only, non-stopword tokens, so the counts are exact. */
function tokens(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${prefix}${letters[i % 26]}${letters[Math.floor(i / 26) % 26]}`,
  );
}

describe("the Spin gate accepts what the autopsy is specified to produce", () => {
  it("does not refuse the hook of a real autopsy, which is longer than one comparison window", () => {
    expect(words(REAL_AUTOPSY_HOOK).length).toBeGreaterThan(
      HOOK_COMPARISON_WINDOW_WORDS,
    );
    // The bound that matters is the PRODUCER's, and it is characters.
    expect(REAL_AUTOPSY_HOOK.length).toBeLessThanOrEqual(MAX_HOOK_CHARS);
    expect(() =>
      evaluateSpinSimilarity({
        output: CLEAN,
        reference: { ...REFERENCE, hook: REAL_AUTOPSY_HOOK },
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }),
    ).not.toThrow();
  });

  it("still refuses a reference that is genuinely unbounded, at the producer's own limits", () => {
    const over = (ref: Partial<SpinReference>) => () =>
      evaluateSpinSimilarity({
        output: CLEAN,
        reference: { ...REFERENCE, ...ref },
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      });
    expect(over({ hook: "x".repeat(MAX_HOOK_CHARS + 1) })).toThrow(/bounded hook/i);
    expect(over({ subjectTerms: tokens("term", MAX_SUBJECT_TERMS + 1) })).toThrow(
      /bounded subject terms/i,
    );
    expect(over({ subjectTerms: ["y".repeat(MAX_SUBJECT_TERM_CHARS + 1)] })).toThrow(
      /bounded subject terms/i,
    );
    expect(
      over({ structure: { beatCount: MAX_BEATS + 1, turnBeat: null } }),
    ).toThrow(/bounded structure/i);
    // An EMPTY hook is still no hook, however the bound is expressed — and the
    // same holds for a term. Both use the PRODUCER's `trim()` predicate now, so
    // these two cases are what stops that widening from becoming "accept
    // anything": deleting either emptiness check leaves the suite green
    // otherwise (mutation M6, code review matrix 2026-09-04).
    expect(over({ hook: "   " })).toThrow(/bounded hook/i);
    expect(over({ hook: "" })).toThrow(/bounded hook/i);
    expect(over({ subjectTerms: ["   "] })).toThrow(/bounded subject terms/i);
    expect(over({ subjectTerms: [""] })).toThrow(/bounded subject terms/i);
  });
});

describe("the hook comparison is independent of reference length", () => {
  // A 30-word span the candidate reproduces verbatim, buried in a reference
  // hook four times that length. This is the shape a real near-copy takes: a
  // creator lifts the opening line, not the whole opening.
  const span = tokens("s", HOOK_COMPARISON_WINDOW_WORDS);
  // 105 tokens / 419 characters — inside the producer's own 800-character
  // bound, so this is a reference the autopsy could really emit. At that
  // length the pre-window score of a copied 30-word span is 30/105 = 0.286,
  // just under the floor's 0.3 threshold: the dilution is not hypothetical.
  const longHook = [...span, ...tokens("f", 75)].join(" ");
  const copied = withSpin({
    hooks: [
      { text: span.join(" "), mechanic: "cold open" },
      ...SCRIPT_OUTPUT.hooks.slice(1),
    ],
    beats: CHANGED_STRUCTURE,
  });

  it("catches a verbatim span that whole-hook scoring dilutes below the gate", () => {
    const result = evaluateSpinSimilarity({
      output: copied,
      reference: { ...REFERENCE, hook: longHook },
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.failed).toContain("hook");
    expect(result.hookSimilarity).toBe(1);
  });

  it("is non-vacuous: the pre-window formula would have cleared this exact copy", () => {
    // What the gate computed before the window existed, on the same inputs:
    // Jaccard over the whole hook, and coverage divided by the whole hook's
    // token total. Both sit far under the floor's 1 - 0.7 = 0.3 threshold, so
    // this candidate passed. If this assertion ever fails, the test above has
    // stopped proving anything and the window has stopped being load-bearing.
    const candidateWords = contentWords(span.join(" "));
    const sourceWords = contentWords(longHook);
    const right = new Set(candidateWords);
    const shared = [...new Set(sourceWords)].filter((w) => right.has(w)).length;
    const wholeHookJaccard =
      shared / (new Set(sourceWords).size + right.size - shared);
    const wholeHookCoverage = shared / sourceWords.length;
    // ALL THREE PROXIES, because the max is over three (code review,
    // 2026-09-04). This asserted only two, and the omitted one —
    // ordered-bigram coverage — sits just 0.021 under the threshold here: at
    // 60 filler tokens instead of 75 it reaches 0.3258 and the claim above
    // would be FALSE while both asserted terms still passed. An assertion that
    // cannot detect its own falsification is not a non-vacuity witness.
    const bigrams = (t: readonly string[]): string[] =>
      t.slice(1).map((w, i) => `${t[i]}\u0000${w}`);
    const candidateBigrams = new Set(bigrams(candidateWords));
    const sourceBigrams = bigrams(sourceWords);
    const wholeHookBigramCoverage =
      sourceBigrams.filter((b) => candidateBigrams.has(b)).length /
      sourceBigrams.length;
    const threshold = 1 - CODE_SPIN_STRICTNESS_FLOOR;
    expect(wholeHookJaccard).toBeLessThan(threshold);
    expect(wholeHookCoverage).toBeLessThan(threshold);
    expect(wholeHookBigramCoverage).toBeLessThan(threshold);
  });

  it("leaves the short-hook path untouched — the window loop cannot run there", () => {
    // "Never weaker" has two halves. The half this file can prove directly is
    // that a hook shorter than one window takes the SAME code path it always
    // did: the loop's guard `start + WINDOW <= sourceWords.length` is false at
    // start 0, so the only value in the max is the whole-hook score.
    //
    // The other half — that the whole-hook score itself is unchanged — is
    // witnessed by the sixteen cases above this block, every one of which
    // scores the short `REFERENCE.hook` and every one of which was written
    // before the window existed and still passes unmodified.
    expect(words(REFERENCE.hook).length).toBeLessThanOrEqual(
      HOOK_COMPARISON_WINDOW_WORDS,
    );
    expect(
      evaluateSpinSimilarity({
        output: CLEAN,
        reference: REFERENCE,
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).not.toContain("hook");
  });
});

// ---------------------------------------------------------------------------
// THE PROXIES, ONE FIXTURE EACH (code review, 2026-09-04).
//
// A reviewer planted ten mutations on this gate and NINE survived this file at
// 24/24 green — including dropping each of `scoreSpan`'s three proxies in turn.
// The three "reordered / multiplicity / padding" cases above do not
// discriminate: each proxy alone already scores those fixtures over the gate,
// so removing any one of them changes nothing.
//
// These fixtures were FOUND BY SEARCH over the real formulas rather than
// constructed by hand, precisely because hand-built cases produced the blind
// spot. Each has exactly one proxy at or above the floor's 0.3 threshold and
// the other two below it, so deleting that proxy turns the case red. Tokens are
// `z`-prefixed so the stopword filter cannot touch them while the multiset
// structure that makes each case work is preserved.

const zmap = (letters: string): string =>
  letters.split(" ").map((l) => `z${l}`).join(" ");

function referenceWithHook(hook: string): SpinReference {
  return {
    subjectTerms: ["quite unrelated subject matter"],
    hook,
    structure: { beatCount: 3, turnBeat: 1 },
  };
}

function outputWithHook(text: string) {
  return withSpin({
    hooks: [{ text, mechanic: "cold open" }, ...SCRIPT_OUTPUT.hooks.slice(1)],
    beats: CHANGED_STRUCTURE,
  });
}

describe("each REQ-E04 proxy is load-bearing on its own", () => {
  const cases = [
    { proxy: "source coverage", source: "j l d k f l i j c", candidate: "n a f p c e e l n h" },
    { proxy: "set Jaccard", source: "p m a p c p b b e b", candidate: "b a" },
    { proxy: "ordered-bigram coverage", source: "n n j n e d f", candidate: "o j n j c h j h i" },
  ] as const;

  for (const c of cases) {
    it(`${c.proxy} alone carries the refusal`, () => {
      const result = evaluateSpinSimilarity({
        output: outputWithHook(zmap(c.candidate)),
        reference: referenceWithHook(zmap(c.source)),
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      });
      expect(result.failed).toContain("hook");
      // The VALUE is pinned, not just the outcome: delete this proxy and the
      // score falls to the max of the other two, both of which are under 0.3,
      // so this assertion and the one above go red together.
      expect(result.hookSimilarity).toBeCloseTo(1 / 3, 10);
    });
  }
});

describe("the window's own boundaries", () => {
  const span = tokens("s", HOOK_COMPARISON_WINDOW_WORDS);

  it("catches a copy sitting in the FINAL window", () => {
    // `start + WINDOW <= sourceWords.length` — an off-by-one to `<` drops the
    // last window silently, and every other long-hook case in this file puts
    // the copied span at the FRONT, where such a mutation survives.
    const longHook = [...tokens("f", 75), ...span].join(" ");
    const result = evaluateSpinSimilarity({
      output: outputWithHook(span.join(" ")),
      reference: referenceWithHook(longHook),
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.failed).toContain("hook");
    expect(result.hookSimilarity).toBe(1);
  });

  it("refuses a lift landing EXACTLY on the threshold — the float boundary", () => {
    // `1 - 0.7` is `0.30000000000000004` and window coverage is `k / 30`, so
    // `9 / 30` is exactly `0.3` and used to clear a hard gate by one ulp. With
    // a constant denominator this is the most likely operating point, not a
    // curiosity.
    const longHook = [...span, ...tokens("f", 75)].join(" ");
    const result = evaluateSpinSimilarity({
      output: outputWithHook(span.slice(0, 9).join(" ")),
      reference: referenceWithHook(longHook),
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(result.hookSimilarity).toBeCloseTo(0.3, 10);
    expect(result.failed).toContain("hook");
  });

  it("relates a whole-hook score to `contentOverlap` — the citation in `scoreSpan`", () => {
    // `scoreSpan`'s docblock says its Jaccard "is the same number
    // `contentOverlap` returns" over a whole hook, and named this file as the
    // witness. It was not: this file never imported `contentOverlap`, and the
    // case that claimed to check it hand-reimplemented the formula — a copy of
    // the implementation, not an oracle (code review, 2026-09-04).
    const hook = "painted kitchen cabinets over one long regretful weekend";
    const unit = "painted cabinets weekend";
    const result = evaluateSpinSimilarity({
      output: outputWithHook(unit),
      reference: referenceWithHook(hook),
      configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
    });
    expect(contentOverlap(hook, unit)).toBeGreaterThan(0);
    expect(result.hookSimilarity).toBeGreaterThanOrEqual(
      contentOverlap(hook, unit),
    );
  });
});

describe("the subject axis matches a long term the old rule could not", () => {
  // `containsWordSequence` needed the WHOLE contiguous term, so a term longer
  // than about six words was unmatchable — measured: a 20-word term with one
  // word inserted in the middle went unflagged (compliance gate, 2026-09-04).
  const long =
    "authenticity versus safety in composition and the quiet cost of revising your own sentences twice over";
  const withSubject = (subjectTerms: readonly string[]) => ({
    subjectTerms,
    hook: "an entirely different opening line about lighting",
    structure: { beatCount: 3, turnBeat: 1 },
  });

  it("flags a six-word run of a long term", () => {
    expect(
      evaluateSpinSimilarity({
        output: outputWithHook("the quiet cost of revising your own sentences again"),
        reference: withSubject([long]),
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).toContain("subject");
  });

  it("NON-VACUITY: an unrelated candidate is not flagged on the same long term", () => {
    expect(
      evaluateSpinSimilarity({
        output: outputWithHook("three camera settings that flattened my kitchen footage"),
        reference: withSubject([long]),
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).not.toContain("subject");
  });

  it("catches a term reused at the very END of a text unit", () => {
    // `containsWordSequence`'s `start <= candidate.length - term.length`: an
    // off-by-one to `<` drops the LAST start position, so a term reused at the
    // end of a unit goes unflagged. It survived the whole suite (code review,
    // round 2) because every other subject fixture puts the term mid-sentence.
    expect(
      evaluateSpinSimilarity({
        output: outputWithHook("everything I learned came down to kitchen renovation"),
        reference: withSubject(["kitchen renovation"]),
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).toContain("subject");
  });

  it("catches the FINAL window of a long term", () => {
    // The subject axis's twin of the hook axis's final-window case. The window
    // loop's `start + WINDOW <= term.length` has the same off-by-one, and this
    // change created that loop without creating its witness (compliance +
    // code review, round 2, independently).
    //
    // The last six words of `long` and nothing else, so only the final window
    // can match.
    const tail = long.split(" ").slice(-6).join(" ");
    expect(
      evaluateSpinSimilarity({
        output: outputWithHook(`what it came to was ${tail}`),
        reference: withSubject([long]),
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).toContain("subject");
  });

  it("a term inside the OLD six-word bound behaves exactly as before", () => {
    // The window IS the old `MAX_SUBJECT_TERM_WORDS`, so every term the old
    // bound could admit is still tested whole. This is the unchanged path.
    expect(SUBJECT_MATCH_WINDOW_WORDS).toBe(6);
    expect(
      evaluateSpinSimilarity({
        output: outputWithHook("my kitchen renovation ran three weeks long"),
        reference: withSubject(["kitchen renovation"]),
        configuredStrictness: CODE_SPIN_STRICTNESS_FLOOR,
      }).failed,
    ).toContain("subject");
  });
});
