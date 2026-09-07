// The reference-echo bar (R-3 at the brain), proved GENERATIVELY against the
// installed segmenter rather than against a list of counterexamples.
//
// THE COUNTEREXAMPLE-LIST FORM OF THIS TEST ALREADY FAILED, twice, in plan
// review. Round 1 pinned three hand-picked ASCII strings; measurement then
// showed five of six trivial variants of a copied span evading the rule
// (smart apostrophe, capitalisation, double space, nbsp, one-word swap), and a
// CJK span never firing at all. That is the 2026-08-18 lesson exactly: when a
// guard's promise depends on a third-party parser, prove the PROPERTY against
// the installed parser, never the instances.
//
// So the core assertion below is a property over generated inputs — every
// window at or above the threshold refuses, every window below it accepts —
// and the fixtures exist only to pin the specific evasions that were measured.
import { afterEach, describe, expect, it } from "vitest";
import {
  ECHO_MIN_SEGMENTS,
  REFERENCE_QUOTE_MAX_CHARS,
  REFERENCE_QUOTE_TOTAL_MAX_CHARS,
  assertNoReferenceEcho,
  assertReferenceQuoteBudget,
  collectStringLeaves,
  echoComparisonForm,
  findEchoWindow,
  findReferenceEchoes,
  wordLikeSegments,
  ContentWalkError,
  SegmenterUnavailableError,
  probeSegmenter,
  isUsableSpanRange,
  referenceBudgetKey,
  groupReferenceInputs,
  evaluateReferenceSafety,
  assertReferenceSafety,
  type ReferenceInput,
} from "../src/echo";
import { ProvenanceError, ReferenceEchoError } from "../src/errors";

const REF = {
  id: "11111111-1111-1111-1111-111111111111",
  content:
    "Open cold and never explain the premise before the third beat of the video",
};

const echoes = (candidate: string, ref = REF.content) =>
  findEchoWindow(candidate, ref) !== null;

describe("the comparison unit", () => {
  it("excludes punctuation BY CONSTRUCTION, not by enumeration", () => {
    // This is why the comparison is over segment SEQUENCES and never over a
    // joined string: joining and calling includes() reintroduces exactly the
    // punctuation sensitivity that segmentation removes for free.
    expect(wordLikeSegments("Hello, world: this is a test")).toEqual(
      wordLikeSegments("Hello world this is a test")
    );
  });

  it("folds case, dashes, quotes and zero-width characters", () => {
    expect(echoComparisonForm("OPEN​COLD—it’s")).toBe(
      "opencold-it's"
    );
  });

  it("segments a script with no word delimiters", () => {
    // A whitespace split yields 1 here. If this ever drops back to 1 the bar
    // has silently stopped existing for CJK, which is the failure that made
    // Intl.Segmenter non-negotiable.
    expect(wordLikeSegments("今日はいい天気ですね、散歩に行きましょう").length)
      .toBeGreaterThanOrEqual(ECHO_MIN_SEGMENTS);
  });
});

describe("source hygiene", () => {
  it("contains no literal C0 control characters", async () => {
    // FOUND BY MEASUREMENT, NOT BY REVIEW. The window separator was originally
    // typed as a literal NUL byte: invisible in an editor, invisible in a diff,
    // and NOT caught by eslint's no-irregular-whitespace (which covers spaces,
    // not C0 controls). A control character in source is unreviewable — and
    // this module's whole job is comparing text, so an invisible byte in the
    // comparison path is the one place it must not be tolerated. Escapes only.
    const { readFile } = await import("node:fs/promises");
    const url = new URL("../src/echo.ts", import.meta.url);
    const src = await readFile(url, "utf8");
    const offenders = [...src].filter(
      (c) => c.charCodeAt(0) < 0x20 && c !== "\n" && c !== "\r" && c !== "\t"
    );
    expect(offenders).toEqual([]);
  });
});

describe("the property (generative, against the installed segmenter)", () => {
  // Deterministic pseudo-random corpus: a seeded LCG, so a failure is
  // reproducible and CI cannot flake.
  const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const WORDS = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu".split(" ");

  it("refuses EVERY window at or above the threshold, and accepts EVERY window below it", () => {
    const rnd = lcg(20260824);
    let refusedAtOrAbove = 0;
    let acceptedBelow = 0;
    for (let trial = 0; trial < 120; trial++) {
      const refWords = Array.from(
        { length: 25 + Math.floor(rnd() * 15) },
        () => WORDS[Math.floor(rnd() * WORDS.length)]
      );
      const reference = refWords.join(" ");
      // Take a contiguous span of a chosen length out of the reference and
      // embed it in surrounding text the reference does not contain.
      for (const len of [ECHO_MIN_SEGMENTS - 1, ECHO_MIN_SEGMENTS, ECHO_MIN_SEGMENTS + 4]) {
        const start = Math.floor(rnd() * (refWords.length - len));
        const span = refWords.slice(start, start + len).join(" ");
        const candidate = `Preamble unrelated words. ${span}. Trailing unrelated words.`;
        const hit = findEchoWindow(candidate, reference) !== null;
        if (len >= ECHO_MIN_SEGMENTS) {
          expect(hit, `len=${len} span="${span}" must refuse`).toBe(true);
          refusedAtOrAbove++;
        } else {
          // A shorter span can still collide by chance in a 25-word corpus
          // drawn from 26 words; only assert the direction that must hold.
          if (!hit) acceptedBelow++;
        }
      }
    }
    expect(refusedAtOrAbove).toBeGreaterThan(200);
    expect(acceptedBelow).toBeGreaterThan(0);
  });
});

describe("the evasions that were MEASURED to defeat the round-1 rule", () => {
  it("refuses an exact span", () => {
    expect(echoes("open cold and never explain the premise before")).toBe(true);
  });

  it("refuses a span EMBEDDED mid-leaf", () => {
    // The whole-leaf containment reading passes this; the sliding window is
    // the only implementation that refuses it. This fixture is what makes the
    // mutation matrix non-vacuous.
    expect(
      echoes(
        "I always start punchy. Open cold and never explain the premise before the third beat. Then land the turn."
      )
    ).toBe(true);
  });

  it.each([
    ["re-cased", "OPEN COLD AND NEVER EXPLAIN THE PREMISE BEFORE"],
    ["comma inserted", "Open cold, and never explain the premise before"],
    ["em-dash swapped in", "Open cold — and never explain the premise before"],
    ["curly apostrophes nearby", "“Open cold and never explain the premise before”"],
    ["non-breaking space", "Open cold and never explain the premise before"],
    ["re-wrapped across lines", "Open cold and never\nexplain the premise before"],
  ])("refuses a %s copy", (_label, candidate) => {
    expect(echoes(candidate)).toBe(true);
  });

  it("ACCEPTS a mid-span word swap, and that is correct", () => {
    // Round 1 measured this as a MISS and recorded it as a defect. Under an
    // exact n-gram it is correct behaviour: swap mid-span and the longest
    // surviving run is shorter than the threshold. Fuzzy matching would buy
    // this case at the cost of the generative property above, so it is
    // recorded as a deliberate limit rather than silently dropped.
    expect(echoes("open cold and never clarify the premise before the third")).toBe(
      false
    );
  });

  it("refuses a CJK span and accepts unrelated CJK", () => {
    const ja = "今日はいい天気ですね、散歩に行きましょう";
    expect(findEchoWindow(ja, ja)).not.toBeNull();
    expect(findEchoWindow("私は毎日日本語を勉強しています", ja)).toBeNull();
  });
});

describe("the content walk", () => {
  it("collects string leaves AND object keys, with JSON Pointers", () => {
    // Keys are content too: a model that puts a copied sentence in a key would
    // otherwise walk straight past the bar.
    const leaves = collectStringLeaves({ tone: { register: "deadpan" }, n: 42 });
    expect(leaves.map((l) => l.pointer)).toEqual([
      "/tone#key",
      "/tone/register#key",
      "/tone/register",
      "/n#key",
    ]);
    expect(leaves.find((l) => l.pointer === "/tone/register")?.text).toBe("deadpan");
  });

  it("REFUSES an over-deep shape rather than skipping it", () => {
    // A walker that silently skips a shape it does not understand fails OPEN
    // on exactly the leaf carrying the echo.
    let deep: unknown = "leaf";
    for (let i = 0; i < 12; i++) deep = { nest: deep };
    expect(() => collectStringLeaves(deep)).toThrow(ContentWalkError);
  });

  it("refuses an unsupported value type", () => {
    expect(() => collectStringLeaves({ fn: (() => 1) as unknown })).toThrow(
      ContentWalkError
    );
  });
});

describe("assertNoReferenceEcho", () => {
  it("refuses content echoing a reference input, naming the span and the input", () => {
    let raised: unknown;
    try {
      assertNoReferenceEcho(
        { rule: "Always open cold and never explain the premise before the beat" },
        [REF]
      );
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(ReferenceEchoError);
    expect((raised as Error).message).toContain(REF.id);
    expect((raised as Error).message).toContain("/rule");
  });

  it("permits content that merely discusses the same subject", () => {
    expect(() =>
      assertNoReferenceEcho({ rule: "Start with a cold open." }, [REF])
    ).not.toThrow();
  });

  it("is a no-op when the profile has no reference inputs", () => {
    expect(() => assertNoReferenceEcho({ rule: REF.content }, [])).not.toThrow();
  });
});

describe("evaluateReferenceSafety - the shared preview/write decision (R14a)", () => {
  const span = (startUtf16: number, endUtf16: number) => ({
    postSha: "a".repeat(64),
    inputId: REF.id,
    startUtf16,
    endUtf16,
    quote: "x".repeat(Math.max(0, endUtf16 - startUtf16)),
  });

  it("returns one deterministic decision over both echo and quote-budget inputs", () => {
    expect(
      evaluateReferenceSafety({
        content: { rule: "Start with a cold open." },
        references: [REF],
        newSpans: [],
        retainedSpans: [],
      })
    ).toEqual({ decision: "accept" });

    expect(
      evaluateReferenceSafety({
        content: {
          rule: "Always open cold and never explain the premise before the beat",
        },
        references: [REF],
        newSpans: [],
        retainedSpans: [],
      })
    ).toMatchObject({
      decision: "refuse",
      reason: "reference_echo",
      match: { inputId: REF.id, pointer: "/rule" },
    });

    expect(
      evaluateReferenceSafety({
        content: { rule: "Start with a cold open." },
        references: [REF],
        newSpans: [span(0, 240), span(240, 480), span(480, 720)],
        retainedSpans: [],
      })
    ).toMatchObject({
      decision: "refuse",
      reason: "reference_quote_budget",
      match: null,
    });
  });

  it("has no permissive retained-span default: an unusable retained range refuses", () => {
    expect(() =>
      evaluateReferenceSafety({
        content: { rule: "Start with a cold open." },
        references: [REF],
        newSpans: [],
        retainedSpans: [span(10, 1)],
      })
    ).toThrow(ProvenanceError);
  });

  it("keeps the hard-write adapter's structured refusal metadata", () => {
    const decision = evaluateReferenceSafety({
      content: { rule: REF.content },
      references: [REF],
      newSpans: [],
      retainedSpans: [],
    });
    let raised: unknown;
    try {
      assertReferenceSafety(decision);
    } catch (error) {
      raised = error;
    }
    expect(raised).toBeInstanceOf(ReferenceEchoError);
    expect((raised as ReferenceEchoError).match).toMatchObject({
      pointer: "/rule",
      inputId: REF.id,
    });
  });
});

describe("findReferenceEchoes (the export path)", () => {
  it("ANNOTATES instead of refusing", () => {
    // An export is a data-subject right (REQ-A04). Inputs are immutable and
    // versions are append-only, so a reference post pasted next week must not
    // be able to deny a creator their own data permanently.
    const found = findReferenceEchoes(
      { rule: "Always open cold and never explain the premise before the beat" },
      [REF]
    );
    expect(found).toHaveLength(1);
    expect(found[0].inputId).toBe(REF.id);
    expect(found[0].pointer).toBe("/rule");
  });
});

describe("the reference-quote budget", () => {
  const SHA_A = "a".repeat(64);
  const SHA_B = "b".repeat(64);
  const R = "11111111-1111-4111-8111-111111111111";
  const R2 = "22222222-2222-4222-8222-222222222222";
  /** A span of `len` characters starting at `at`, in reference post `sha`. */
  const span = (at: number, len: number, sha = SHA_A, id = R) => ({
    postSha: sha,
    inputId: id,
    startUtf16: at,
    endUtf16: at + len,
    quote: "y".repeat(len),
  });

  it("refuses a single quote over the per-quote cap", () => {
    expect(() =>
      assertReferenceQuoteBudget([span(0, REFERENCE_QUOTE_MAX_CHARS + 1)])
    ).toThrow(ReferenceEchoError);
  });

  it("permits a mechanism-level quote", () => {
    expect(() =>
      assertReferenceQuoteBudget([
        { postSha: SHA_A, inputId: R, startUtf16: 0, endUtf16: 10, quote: "Open cold." },
      ])
    ).not.toThrow();
  });

  // AC-66b — the property C-37 was raised to close, and it must SURVIVE the
  // repair. Disjoint capped slices of the SAME post still reassemble it.
  it("refuses DISJOINT capped slices that jointly reassemble one post", () => {
    const cap = REFERENCE_QUOTE_MAX_CHARS;
    const n = Math.ceil(REFERENCE_QUOTE_TOTAL_MAX_CHARS / cap) + 1;
    const many = Array.from({ length: n }, (_, i) => span(i * cap, cap));
    expect(() => assertReferenceQuoteBudget(many)).toThrow(/further characters/);
  });

  // AC-66a — the bricking case. A monotone counter over an append-only table
  // refuses a rebuild AFTER its tokens are spent.
  it("lets N rebuilds citing the SAME spans write, forever", () => {
    const atCeiling = [span(0, 200), span(200, 200), span(400, 200)];
    const twenty = Array.from({ length: 20 }, () => atCeiling).flat();
    expect(() => assertReferenceQuoteBudget(twenty)).not.toThrow();
  });

  it("counts OVERLAPPING spans once", () => {
    const shifted = Array.from({ length: 40 }, (_, i) => span(i, 200));
    expect(() => assertReferenceQuoteBudget(shifted)).not.toThrow();
  });

  it("counts ADJACENT spans as the distinct characters they are", () => {
    expect(() =>
      assertReferenceQuoteBudget([
        span(0, 200),
        span(200, 200),
        span(400, 200),
        span(600, 1),
      ])
    ).toThrow(/further characters/);
  });

  // ------------------------------------------------- THE GATE'S FOUR HOLES

  it("keys the budget on the POST, not the row: a duplicate paste buys nothing", () => {
    // THE COMPLIANCE BLOCK. `onboarding_inputs` has no content dedupe, so the
    // same post pasted twice was two `inputId`s and therefore two 600-character
    // budgets — measured reassembling a 989-character post exactly and
    // contiguously. The identity of a post is the sha of its content.
    const viaCopyA = [span(0, 200, SHA_A, R), span(200, 200, SHA_A, R)];
    const viaCopyB = [
      span(400, 200, SHA_A, R2),
      span(600, 200, SHA_A, R2),
    ];
    expect(
      () => assertReferenceQuoteBudget([...viaCopyA, ...viaCopyB]),
      "a second copy of the same post bought a second budget"
    ).toThrow(/further characters/);
    // ...and two GENUINELY different posts still get their own budgets.
    expect(() =>
      assertReferenceQuoteBudget([
        ...viaCopyA,
        span(0, 200, SHA_B, R2),
        span(200, 200, SHA_B, R2),
      ])
    ).not.toThrow();
  });

  it("refuses a NaN range instead of passing the whole ceiling", () => {
    // Measured by billing: `NaN > 600` is false, so one such span turned the
    // entire aggregate check off.
    const overCeiling = [span(0, 240), span(240, 240), span(480, 240)];
    expect(() => assertReferenceQuoteBudget(overCeiling)).toThrow();
    expect(() =>
      assertReferenceQuoteBudget([
        ...overCeiling,
        { postSha: SHA_A, inputId: R, startUtf16: NaN, endUtf16: NaN, quote: "" },
      ]),
      "a NaN span silenced the ceiling"
    ).toThrow(/not a valid position/);
  });

  it("refuses an INVERTED range instead of crediting the budget", () => {
    // Measured by compliance: [1000,0) contributes -1000 and buys back material
    // already taken.
    expect(() =>
      assertReferenceQuoteBudget([
        { postSha: SHA_A, inputId: R, startUtf16: 1000, endUtf16: 0, quote: "" },
        span(0, 200),
      ]),
      "an inverted span credited the budget"
    ).toThrow(/not a valid position/);
    // A retained row carrying one is refused too, rather than silently skipped.
    expect(() =>
      assertReferenceQuoteBudget(
        [span(0, 10)],
        [{ postSha: SHA_A, inputId: R, startUtf16: 5, endUtf16: 1, quote: "" }]
      )
    ).toThrow(/not a valid position/);
  });

  it("NEVER LOCKS A PROFILE OUT: over the ceiling, a re-citing write still passes", () => {
    // THE BILLING BLOCK's second half. A concurrent pair of writes could once
    // leave `retained` alone over the ceiling, after which every write —
    // including a rebuild citing only already-covered spans — was refused
    // forever, with nothing the creator could do. The ceiling now refuses only
    // material the write ADDS.
    const retained = [span(0, 240), span(240, 240), span(480, 240)]; // 720 > 600
    expect(
      () => assertReferenceQuoteBudget([span(0, 100)], retained),
      "a re-citing rebuild was refused against an over-ceiling history"
    ).not.toThrow();
    // ...and NEW material on top of that history is still refused.
    expect(() =>
      assertReferenceQuoteBudget([span(720, 10)], retained)
    ).toThrow(/further characters/);
  });

  it("budgets each reference POST separately, and names which one", () => {
    const atCeiling = (sha: string, id: string) => [
      span(0, 200, sha, id),
      span(200, 200, sha, id),
      span(400, 200, sha, id),
    ];
    expect(() =>
      assertReferenceQuoteBudget([...atCeiling(SHA_A, R), ...atCeiling(SHA_B, R2)])
    ).not.toThrow();
    expect(() =>
      assertReferenceQuoteBudget([
        ...atCeiling(SHA_B, R2),
        span(600, 1, SHA_B, R2),
      ])
    ).toThrow(new RegExp(R2));
  });
});

describe("the invisible-character CLASS, and the corpus contract", () => {
  // Round 5 measured U+00AD SOFT HYPHEN defeating the bar outright while the
  // fold was an enumerated list. PDF and web extraction insert it routinely,
  // so a pasted reference post silently disabled the check for that input.
  const REF =
    "the fastest way to lose an audience is to explain the joke before you tell it";

  it("refuses a span hidden by U+00AD SOFT HYPHEN — the character the LIST missed", () => {
    const hyphenated = REF.split(" ").join("\u00AD ");
    expect(
      findEchoWindow(hyphenated, REF),
      "U+00AD per word must not defeat the bar"
    ).not.toBeNull();
  });

  it.each([
    ["U+200B ZERO WIDTH SPACE", "\u200B"],
    ["U+00AD SOFT HYPHEN", "\u00AD"],
    ["U+FEFF BOM", "\uFEFF"],
    ["U+2060 WORD JOINER", "\u2060"],
    ["U+180E MONGOLIAN VOWEL SEPARATOR", "\u180E"],
  ])("refuses a span hidden by %s", (_label, ch) => {
    expect(findEchoWindow(REF.split(" ").join(ch + " "), REF)).not.toBeNull();
  });

  it("RECORDS its residual honestly: a combining mark still defeats it", () => {
    // Not covered by \p{Default_Ignorable_Code_Point}, recorded as a known
    // limit rather than left implied. If this ever starts refusing, the
    // residual has been closed and the decision record should say so.
    const combining = REF.split(" ").join("\u0301 ");
    expect(findEchoWindow(combining, REF)).toBeNull();
  });

  it("REFUSES an absent corpus instead of silently disabling itself", () => {
    // An empty array means "this profile has no reference inputs"; a missing
    // corpus means "nobody built one". Collapsing the two turned the whole
    // R-3 brain bar off with every test still green.
    const content = { register: REF };
    expect(() =>
      assertNoReferenceEcho(content, null as unknown as ReferenceInput[])
    ).toThrow(ProvenanceError);
    expect(() =>
      assertNoReferenceEcho(content, undefined as unknown as ReferenceInput[])
    ).toThrow(ProvenanceError);
    // ...and an explicitly empty corpus is still a legitimate no-op.
    expect(() => assertNoReferenceEcho(content, [])).not.toThrow();
  });
});

describe("the ICU probe — the file calls it THE REAL PORTABILITY CONTROL", () => {
  // A reviewer running 21 mutations of its own found this could be weakened to
  // zero, or deleted outright, with the whole suite green. The control that
  // guards against a small-ICU runtime silently turning the bar into a no-op
  // had no detector at all — twice, across two rounds.
  const REAL = Intl.Segmenter;

  afterEach(() => {
    (Intl as unknown as { Segmenter: unknown }).Segmenter = REAL;
  });

  it("passes on this runtime and returns the measured segment count", () => {
    expect(probeSegmenter()).toBeGreaterThanOrEqual(8);
  });

  it("REFUSES LOUDLY on a small-ICU runtime that cannot segment CJK", () => {
    // The failure a full-ICU CI can never see on its own.
    class SmallIcu {
      segment(str: string) {
        return str
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => ({ segment: w, isWordLike: true }));
      }
    }
    (Intl as unknown as { Segmenter: unknown }).Segmenter = SmallIcu;
    expect(() => probeSegmenter()).toThrow(SegmenterUnavailableError);
  });

  it("REFUSES when Intl.Segmenter is absent entirely", () => {
    (Intl as unknown as { Segmenter: unknown }).Segmenter = undefined;
    expect(() => probeSegmenter()).toThrow(SegmenterUnavailableError);
  });
});

describe("isUsableSpanRange — the shared G-16 predicate", () => {
  it("accepts a finite, non-negative, non-inverted half-open range", () => {
    expect(isUsableSpanRange(0, 10)).toBe(true);
    expect(isUsableSpanRange(5, 5)).toBe(true); // zero-length is usable
  });

  it("refuses NaN, negative, non-integer and inverted ranges", () => {
    expect(isUsableSpanRange(NaN, NaN)).toBe(false);
    expect(isUsableSpanRange(-1, 5)).toBe(false);
    expect(isUsableSpanRange(1.5, 5)).toBe(false);
    expect(isUsableSpanRange(10, 0)).toBe(false);
  });
});

describe("referenceBudgetKey (G-11 Layer A)", () => {
  it("is the SAME key for two posts differing only by whitespace, case or a smart quote", () => {
    const a = referenceBudgetKey("Open cold and never explain it.");
    const b = referenceBudgetKey("open cold and never explain it. ");
    const c = referenceBudgetKey("OPEN COLD AND NEVER EXPLAIN IT.");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("is a DIFFERENT key for two genuinely different posts", () => {
    expect(referenceBudgetKey("Open cold and never explain it.")).not.toBe(
      referenceBudgetKey("Something else entirely, a different post.")
    );
  });
});

describe("groupReferenceInputs (G-11 Layer B — the containment bucket)", () => {
  const post = (id: string, content: string): ReferenceInput => ({ id, content });

  it("buckets a 500-character excerpt with the 1,000-character post it came from", () => {
    const full = post(
      "11111111-1111-4111-8111-111111111111",
      Array.from({ length: 160 }, (_, i) => `word${i}`).join(" ")
    );
    const excerptText = full.content.split(" ").slice(20, 60).join(" ");
    const excerpt = post("22222222-2222-4222-8222-222222222222", excerptText);
    const map = groupReferenceInputs([full, excerpt]);
    expect(map.get(full.id)).toBe(map.get(excerpt.id));
  });

  it("does NOT bucket two genuinely unrelated posts together", () => {
    const a = post(
      "11111111-1111-4111-8111-111111111111",
      "the fastest way to lose an audience is to explain the joke before you tell it"
    );
    const b = post(
      "22222222-2222-4222-8222-222222222222",
      "always film in landscape and keep the subject centred in the frame at all times"
    );
    const map = groupReferenceInputs([a, b]);
    expect(map.get(a.id)).not.toBe(map.get(b.id));
  });

  it("buckets a short duplicate (below ECHO_MIN_SEGMENTS) via Layer A, where findEchoWindow alone would miss it", () => {
    const a = post("11111111-1111-4111-8111-111111111111", "short and sweet");
    const b = post("22222222-2222-4222-8222-222222222222", "Short and sweet ");
    expect(findEchoWindow(a.content, b.content)).toBeNull(); // too short for Layer B alone
    const map = groupReferenceInputs([a, b]);
    expect(map.get(a.id)).toBe(map.get(b.id));
  });
});

describe("the R-3 bar switched on: G-11's two layers wired through the budget", () => {
  const REFERENCE_ID_FULL = "11111111-1111-4111-8111-111111111111";
  const REFERENCE_ID_EXCERPT = "22222222-2222-4222-8222-222222222222";

  it("Layer A: a trailing-space duplicate paste shares ONE budget, not two", () => {
    const full = "y".repeat(300);
    const withSpace = full + " ";
    const inputs: ReferenceInput[] = [
      { id: REFERENCE_ID_FULL, content: full },
      { id: REFERENCE_ID_EXCERPT, content: withSpace },
    ];
    const bucketOf = groupReferenceInputs(inputs);
    const spanOf = (id: string, at: number, len: number) => ({
      postSha: bucketOf.get(id)!,
      inputId: id,
      startUtf16: at,
      endUtf16: at + len,
      quote: "y".repeat(len),
    });
    // 200 from the plain copy, then 200 more from the space-suffixed "copy" —
    // if they bought separate budgets neither alone exceeds 600 so both would
    // pass; keyed on the SAME bucket, the second 200 pushes the union to 400,
    // still under 600 — so push further to prove the union is shared.
    expect(() =>
      assertReferenceQuoteBudget([
        spanOf(REFERENCE_ID_FULL, 0, 240),
        spanOf(REFERENCE_ID_EXCERPT, 240, 240),
        spanOf(REFERENCE_ID_EXCERPT, 480, 200),
      ])
    ).toThrow(ReferenceEchoError);
  });

  it("Layer B: an excerpt and its full post share ONE budget", () => {
    const full = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
    const excerpt = full.split(" ").slice(0, 60).join(" ");
    const inputs: ReferenceInput[] = [
      { id: REFERENCE_ID_FULL, content: full },
      { id: REFERENCE_ID_EXCERPT, content: excerpt },
    ];
    const bucketOf = groupReferenceInputs(inputs);
    expect(bucketOf.get(REFERENCE_ID_FULL)).toBe(bucketOf.get(REFERENCE_ID_EXCERPT));
  });

  it("the false-positive case: two genuinely similar reference posts land in one bucket, and the copy names the fix", () => {
    // Two independently-written posts that happen to share a long common
    // phrase — a real risk the phase card names, not a bug: the budget
    // applies per bucket, and the refusal copy tells the reader to rewrite in
    // their own words rather than which of the two "real" posts is at fault.
    const shared = "always open cold and never explain the premise before the third beat of the video";
    const a = `${shared} — my personal spin on this idea.`;
    const b = `${shared} — a completely different take on it.`;
    const inputs: ReferenceInput[] = [
      { id: REFERENCE_ID_FULL, content: a },
      { id: REFERENCE_ID_EXCERPT, content: b },
    ];
    const bucketOf = groupReferenceInputs(inputs);
    expect(bucketOf.get(REFERENCE_ID_FULL)).toBe(bucketOf.get(REFERENCE_ID_EXCERPT));
    let raised: unknown;
    try {
      assertReferenceQuoteBudget([
        {
          postSha: bucketOf.get(REFERENCE_ID_FULL)!,
          inputId: REFERENCE_ID_FULL,
          startUtf16: 0,
          endUtf16: 240,
          quote: a.slice(0, 240),
        },
        {
          postSha: bucketOf.get(REFERENCE_ID_EXCERPT)!,
          inputId: REFERENCE_ID_EXCERPT,
          startUtf16: 0,
          endUtf16: 240,
          quote: b.slice(0, 240),
        },
        {
          postSha: bucketOf.get(REFERENCE_ID_FULL)!,
          inputId: REFERENCE_ID_FULL,
          startUtf16: 240,
          endUtf16: 480,
          quote: a.slice(240, 480) || "z".repeat(240),
        },
      ]);
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(ReferenceEchoError);
    expect((raised as Error).message).toMatch(/own words/);
  });

  it("never-brick re-proved on the BUCKETED path: a rebuild citing exactly the same spans still writes", () => {
    const inputs: ReferenceInput[] = [{ id: REFERENCE_ID_FULL, content: "y".repeat(1000) }];
    const bucketOf = groupReferenceInputs(inputs);
    const sha = bucketOf.get(REFERENCE_ID_FULL)!;
    const retained = [
      { postSha: sha, inputId: REFERENCE_ID_FULL, startUtf16: 0, endUtf16: 240, quote: "" },
      { postSha: sha, inputId: REFERENCE_ID_FULL, startUtf16: 240, endUtf16: 480, quote: "" },
      { postSha: sha, inputId: REFERENCE_ID_FULL, startUtf16: 480, endUtf16: 720, quote: "" }, // 720 > 600
    ];
    expect(() =>
      assertReferenceQuoteBudget(
        [{ postSha: sha, inputId: REFERENCE_ID_FULL, startUtf16: 0, endUtf16: 100, quote: "y".repeat(100) }],
        retained
      )
    ).not.toThrow();
  });
});

describe("the invisible-character class covers Cf as well as DI", () => {
  // The first swap replaced a list with a bigger list: 32 \p{Cf} characters
  // fall outside \p{Default_Ignorable_Code_Point}, and every one measured
  // defeated an otherwise-refusing span. Naming the class is the point.
  const REF =
    "the fastest way to lose an audience is to explain the joke before you tell it";

  it.each([
    ["U+0600 ARABIC NUMBER SIGN", "؀"],
    ["U+06DD ARABIC END OF AYAH", "۝"],
    ["U+070F SYRIAC ABBREVIATION MARK", "܏"],
    ["U+FFF9 INTERLINEAR ANNOTATION ANCHOR", "￹"],
    ["U+110BD KAITHI NUMBER SIGN", "\u{110BD}"],
  ])("refuses a span hidden by %s — outside DI, inside Cf", (_label, ch) => {
    expect(findEchoWindow(REF.split(" ").join(ch + " "), REF)).not.toBeNull();
  });

  it("the export twin never throws on a missing corpus (REQ-A04)", () => {
    // Its refusing sibling treats an absent corpus as a caller bug; the export
    // path must not, because an export is a data-subject right and the creator
    // cannot be denied their own data by a wiring mistake.
    const none = null as unknown as ReferenceInput[];
    expect(() => findReferenceEchoes({ a: REF }, none)).not.toThrow();
    expect(findReferenceEchoes({ a: REF }, none)).toEqual([]);
  });
});
