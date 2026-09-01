// Slice 6 stage B, R19 / REQ-I03: the traceability scan.
//
// THE TWO PROPERTIES THIS FILE EXISTS TO PIN:
//
//  1. It is a RECALL CONTROL WITH KNOWN FALSE POSITIVES (slice card question
//     2). A generic proper noun flags. That is not a defect to be tuned away —
//     it is the error this control chooses to make, and the test below asserts
//     it rather than tolerating it.
//  2. Because of (1) the product FLAGS AND OFFERS `[check]`, and NEVER deletes.
//     Deleting on a false positive corrupts the creator's script. Mutation M9
//     ("traceability scan deletes instead of flagging") reddens here.
//
// Every shape the scan claims to cover is planted, per CLAUDE.md's 2026-08-21
// lesson: a scan reporting zero findings is indistinguishable from a scan that
// is not working.
import { describe, expect, it } from "vitest";

import {
  COMMON_OPENERS,
  FLAG_ONLY_FIELD_PREFIXES,
  SPECIFIC_SHAPES,
  TRACEABILITY_LIMIT_NOTE,
  buildCorpusIndex,
  offerCheck,
  scanTraceability,
  type TraceabilityCorpus,
} from "../src/traceability";
import { type TextUnit } from "../src/text";
import { outputTextUnits, type ScriptOutput } from "../src/output";
import { EVERY_SECTION } from "./support/fixtures";

const unit = (text: string, field = "beats/0/vo"): TextUnit => ({
  field,
  text,
  isHook: false,
});

const EMPTY: TraceabilityCorpus = { brain: [], input: [] };

const corpus = (brain: string[], input: string[] = []): TraceabilityCorpus => ({
  brain,
  input,
});

describe("the shape list is not vacuous", () => {
  it("EVERY named specific shape matches its own specimen", () => {
    // One specimen per shape, for the reason forbidden-claims.ts gives for
    // CLAIM_SPECIMENS: a broken pattern otherwise hides behind another
    // pattern's match and the suite stays green.
    for (const shape of SPECIFIC_SHAPES) {
      const re = new RegExp(shape.pattern.source, shape.pattern.flags);
      expect(re.test(shape.specimen), shape.id).toBe(true);
    }
  });

  it("every shape is REACHED by the scan, not merely declared", () => {
    // The stronger version: the pattern matching in isolation proves nothing
    // about whether the scan consults it. Each specimen goes through the real
    // scan against an empty corpus and must produce a finding of that kind.
    for (const shape of SPECIFIC_SHAPES) {
      const found = scanTraceability([unit(shape.specimen)], EMPTY);
      expect(found.map((f) => f.kind), shape.id + ": " + shape.specimen).toContain(
        shape.kind
      );
    }
  });
});

describe("membership in (brain ∪ this generation's input)", () => {
  it("flags a number that is in neither", () => {
    const found = scanTraceability(
      [unit("We grew 412 percent last quarter.")],
      corpus(["I post about camera settings."])
    );
    expect(found.map((f) => f.token)).toContain("412");
  });

  it("does NOT flag a number the creator's BRAIN carries", () => {
    const found = scanTraceability(
      [unit("We grew 412 percent last quarter.")],
      corpus(["My channel grew 412 percent last quarter."])
    );
    expect(found.map((f) => f.token)).not.toContain("412");
  });

  it("does NOT flag a number THIS GENERATION'S INPUT carries", () => {
    const found = scanTraceability(
      [unit("We grew 412 percent last quarter.")],
      corpus([], ["today's clips: the 412 percent month"])
    );
    expect(found.map((f) => f.token)).not.toContain("412");
  });

  it("matches a THOUSANDS-SEPARATED number against its plain form", () => {
    // "1,200" in the draft and "1200" in the brain are the same specific; a
    // scan that flags it is a scan nobody will read.
    expect(
      scanTraceability([unit("It took 1,200 takes.")], corpus(["1200 takes"]))
        .map((f) => f.token)
    ).not.toContain("1,200");
  });

  it("strips a currency symbol and a percent sign before matching", () => {
    expect(
      scanTraceability(
        [unit("It cost $40 and lifted 12%.")],
        corpus(["40 dollars", "12 percent"])
      )
    ).toEqual([]);
  });

  it("flags a multi-word proper noun when ANY of its words is untraceable", () => {
    // The recall-preserving direction: "all words present" is the only way a
    // multi-word name is traceable, so a half-known name still flags.
    const found = scanTraceability(
      [unit("She learned it at Vantage Studios.")],
      corpus(["I trained at Vantage."])
    );
    expect(found.map((f) => f.token)).toContain("Vantage Studios");
  });

  it("is case-insensitive — the brain may spell it lowercase", () => {
    expect(
      scanTraceability([unit("Instagram changed it.")], corpus(["i post on instagram"]))
    ).toEqual([]);
  });
});

describe("the known false positive is asserted, not tolerated (R19)", () => {
  it("a GENERIC proper noun flags even though nothing is wrong with it", () => {
    const found = scanTraceability(
      [unit("Film it on Monday.")],
      corpus(["I film short pieces about cameras."])
    );
    expect(found.map((f) => f.token)).toEqual(["Monday"]);
    expect(found[0].kind).toBe("proper_noun");
  });

  it("the scan NEVER mutates the text it was given (mutation M9)", () => {
    const text = "Film it on Monday.";
    const u = unit(text);
    const found = scanTraceability([u], EMPTY);
    expect(found.length).toBeGreaterThan(0);
    expect(u.text).toBe(text);
  });

  it("offerCheck OFFERS `[check]` and deletes nothing (mutation M9)", () => {
    const text = "Film it on Monday.";
    const found = scanTraceability([unit(text)], EMPTY);
    const offered = offerCheck(text, found);
    expect(offered).not.toBe(text);
    // Everything that was there is still there, in order, and the marker is
    // ADDED. A scan that deleted the token would fail the first assertion.
    expect(offered).toContain("Monday");
    expect(offered).toContain("[check]");
    expect(offered.replace(/ \[check\]/g, "")).toBe(text);
  });

  it("offering `[check]` clears the finding on a re-scan", () => {
    const text = "Film it on Monday.";
    const offered = offerCheck(text, scanTraceability([unit(text)], EMPTY));
    expect(scanTraceability([unit(offered)], EMPTY)).toEqual([]);
  });

  it("offerCheck on NO findings returns the text unchanged", () => {
    const text = "Film it on Monday.";
    expect(offerCheck(text, [])).toBe(text);
  });
});

describe("`[check]` exempts THE SPECIFIC IT IS ATTACHED TO, never the sentence", () => {
  // THE BLOCK THIS DESCRIBE EXISTS FOR. The exemption used to be
  // `if (span.text.includes(CHECK)) continue`, so ONE marker anywhere in a
  // sentence cleared EVERY specific in it. The compliance gate ran the real
  // pipeline on the three hooks below and got `hardRules: []`,
  // `traceability: []`, `status: "usable"` — four invented specifics returned
  // for display. The model is INSTRUCTED to emit this token, and
  // `REWRITE_INSTRUCTION` invites it on the rewrite, so that draft is the
  // likely shape rather than the exotic one.
  const MEASURED = [
    "I saved $4,000 last year doing this, ask my [check].",
    "It took 11 weeks and 3 failed batches [check] to work this out.",
    "In 2019 I threw away half my fridge every Friday [check].",
  ];

  it("a marker ATTACHED to a specific exempts that specific", () => {
    // The rule is "invented specifics WITHOUT [check]" (tech-spec §3 step 3): a
    // model that marked its own uncertainty did the right thing. The marker
    // sits where `offerCheck` writes it.
    expect(
      scanTraceability([unit("We grew 412 [check] percent last quarter.")], EMPTY)
    ).toEqual([]);
  });

  it("...on either side of it, because a model may write it in place", () => {
    expect(
      scanTraceability([unit("We grew [check] 412 percent last quarter.")], EMPTY)
    ).toEqual([]);
  });

  it("REGRESSION: every UNMARKED specific in a marked sentence still fires", () => {
    // The reviewer's exact draft, one marker per sentence. Each `[check]`
    // covers only what it touches; the four inventions beside them do not
    // inherit it.
    const found = scanTraceability(
      MEASURED.map((t) => unit(t)),
      EMPTY
    );
    const tokens = found.map((f) => f.token);
    for (const invented of ["$4,000", "11", "3", "2019"]) {
      expect(
        tokens,
        invented + " was exempted by a marker it is not attached to"
      ).toContain(invented);
    }
  });

  it("...while the specific the marker IS attached to stays exempt", () => {
    // Non-vacuity in the other direction: a "fix" that simply deleted the
    // exemption would pass the regression above and fail here.
    const found = scanTraceability([unit(MEASURED[2])], EMPTY);
    expect(found.map((f) => f.token)).not.toContain("Friday");
    expect(found.map((f) => f.token)).toContain("2019");
  });

  it("a marker two words away does NOT vouch for the specific", () => {
    // "3 failed batches [check]" — the shape the sentence-scoped version read
    // as "the model marked this one".
    expect(
      scanTraceability(
        [unit("It took 3 failed batches [check] to work it out.")],
        EMPTY
      ).map((f) => f.token)
    ).toContain("3");
  });

  it("a marker BETWEEN two adjacent specifics covers both — stated, not discovered", () => {
    // THE RESIDUAL EDGE of adjacency, pinned rather than left to be found: a
    // marker touching a specific on each side vouches for both, because it is
    // genuinely adjacent to both and nothing in the text says which it meant.
    // It needs a model to write two specifics separated by nothing but the
    // marker; the sentence-scoped version this replaced cleared the whole
    // sentence, so the shape is bounded to a token on either side rather than
    // to everything in sight.
    expect(
      scanTraceability([unit("It cost $40 [check] 2019 and worked.")], EMPTY)
    ).toEqual([]);
  });

  it("...but a marker one word away from either covers neither", () => {
    expect(
      scanTraceability([unit("It cost $40 then [check] then 2019.")], EMPTY).map(
        (f) => f.token
      )
    ).toEqual(["$40", "2019"]);
  });

  it("a marker in the NEXT sentence does not reach back", () => {
    expect(
      scanTraceability([unit("It cost $40. [check] is elsewhere.")], EMPTY).map(
        (f) => f.token
      )
    ).toContain("$40");
  });

  it("the exemption is scoped to the unit as well, not the whole field", () => {
    const found = scanTraceability(
      [unit("We grew 412 [check] percent. We filmed it on a Sony.")],
      EMPTY
    );
    expect(found.map((f) => f.token)).toEqual(["Sony"]);
  });
});

describe("enforcement is split by SHAPE and by FIELD, and the split is asserted", () => {
  // The card asks this scan to be BOTH tech-spec §3 step 3's hard rule and a
  // recall control with known false positives. Those cannot both govern a
  // refusal, so the split is pinned here rather than left in a comment.
  it("every shape declares an enforcement, and BOTH values are used", () => {
    const values = SPECIFIC_SHAPES.map((shape) => shape.enforcement);
    expect(values).toContain("hard");
    expect(values).toContain("flag");
  });

  it.each([
    ["currency", "It saved me $4,000 last year."],
    ["percent", "Views rose 12% that week."],
    ["multiplier", "It ran 3x longer than the last one."],
    ["iso-date", "It shipped on 2026-08-31."],
    ["month-date", "We filmed it in March 2024."],
  ])("a %s claim is HARD — it can refuse a generation", (shape, text) => {
    const hit = scanTraceability([unit(text)], EMPTY).find(
      (f) => f.shape === shape
    );
    expect(hit, shape + " did not fire on: " + text).toBeDefined();
    expect(hit?.enforcement).toBe("hard");
  });

  it("a BARE INTEGER is FLAG ONLY — an honest listicle is not a refusal", () => {
    // MEASURED: "The 5 mistakes that make batch cooking taste like leftovers."
    // was REFUSED as an invented specific, and question 4's table debits a
    // refusal — a Free creator paying 1 of 25 monthly credits for a script that
    // was fine.
    const hit = scanTraceability(
      [unit("The 5 mistakes that make batch cooking taste like leftovers.")],
      EMPTY
    ).find((f) => f.shape === "plain-number");
    expect(hit?.token).toBe("5");
    expect(hit?.enforcement).toBe("flag");
  });

  it("a proper noun is FLAG ONLY — the known false positive never refuses", () => {
    const found = scanTraceability(
      [unit("We film it on Monday.")],
      corpus(["I film short pieces."])
    );
    expect(found.map((f) => f.token)).toEqual(["Monday"]);
    expect(found[0].enforcement).toBe("flag");
  });

  it("NOTHING in the `disclosure` section is hard, whatever the shape", () => {
    // Its guidance is the product's answer about a platform's policy, so the
    // corpus can never vouch for it. MEASURED: the `3` in "step 3 of the flow"
    // refused a generation.
    const text =
      "Tag it as AI-assisted at step 3 before 2026-08-31, and it costs $0 to do.";
    const inDisclosure = scanTraceability(
      [{ field: "/disclosure/guidance", text, isHook: false }],
      EMPTY
    );
    expect(inDisclosure.length).toBeGreaterThan(2);
    for (const f of inDisclosure) expect(f.enforcement, f.shape).toBe("flag");

    // NON-VACUITY: the same sentence anywhere else still refuses, so the case
    // above is about the FIELD and not about a harmless sentence.
    expect(
      scanTraceability([unit(text)], EMPTY).some((f) => f.enforcement === "hard")
    ).toBe(true);
  });

  it("the flag-only prefix names a field some mode actually emits", () => {
    // Derived from `outputTextUnits`, so a renamed pointer is a red test rather
    // than a prefix that silently matches nothing.
    const units = outputTextUnits(EVERY_SECTION as unknown as ScriptOutput);
    for (const prefix of FLAG_ONLY_FIELD_PREFIXES) {
      expect(units.some((u) => u.field.startsWith(prefix)), prefix).toBe(true);
    }
  });

  it("a number is never decomposed into words the brain happens to hold", () => {
    // "1" and "200" in the brain must not vouch for the quantity "1,200" — a
    // hard finding silently cleared by two unrelated tokens.
    const found = scanTraceability(
      [unit("It took $1,200 of gear.")],
      corpus(["1 take", "200 takes"])
    );
    expect(found.map((f) => f.token)).toEqual(["$1,200"]);
  });
});

describe("the opener stoplist and the sentence-initial rule", () => {
  it("does not flag ordinary sentence-opening capitals", () => {
    expect(
      scanTraceability(
        [unit("This is the thing nobody says. Here is why it works.")],
        EMPTY
      )
    ).toEqual([]);
  });

  it("strips a leading opener off a capitalised sequence rather than dropping it", () => {
    // "The Beatles" is a name with a determiner in front of it. Dropping the
    // whole match because it starts with "The" would be a silent miss.
    const found = scanTraceability([unit("I still play The Beatles.")], EMPTY);
    expect(found.map((f) => f.token)).toEqual(["Beatles"]);
  });

  it("is lowercased throughout, so membership cannot depend on case", () => {
    for (const w of COMMON_OPENERS) expect(w).toBe(w.toLowerCase());
  });

  it("SKIPS a lone sentence-initial capital — grammar capitalised it", () => {
    // MEASURED: a draft with ZERO specifics produced six proper-noun flags —
    // `Sunday`, `Cook`, `Untested`, `Post`, `TikTok`, `TikTok's AI-generated`.
    // A real flagged name is lost in that, which is the failure mode of a
    // control nobody reads.
    const noisy = [
      "Sunday is the day you lose to the fridge.",
      "Cook once and eat it all week.",
      "Untested against your own audience.",
      "Post it before you forget.",
    ];
    expect(scanTraceability(noisy.map((t) => unit(t)), EMPTY)).toEqual([]);
  });

  it("...but RESCUES it when the same word appears capitalised mid-sentence", () => {
    // The census is what tells grammar from a name, and it is taken over the
    // whole output rather than one unit — the direction that rescues more
    // names.
    const found = scanTraceability(
      [unit("Sunday is the day you lose."), unit("Nothing survives Sunday.")],
      EMPTY
    );
    expect(found.map((f) => f.token)).toEqual(["Sunday", "Sunday"]);
  });

  it("...and never skips a MULTI-WORD run, wherever it starts", () => {
    const found = scanTraceability([unit("Vantage Studios shot it.")], EMPTY);
    expect(found.map((f) => f.token)).toEqual(["Vantage Studios"]);
  });

  it("a name mid-sentence is unaffected — the rule is about position only", () => {
    expect(
      scanTraceability([unit("Film it on Monday.")], EMPTY).map((f) => f.token)
    ).toEqual(["Monday"]);
  });
});

describe("the corpus index", () => {
  it("indexes a number with separators under its plain form", () => {
    const ix = buildCorpusIndex(corpus(["we hit 1,200 subscribers"]));
    expect(ix.has("1200")).toBe(true);
  });

  it("is EMPTY for an empty corpus — so a passing scan is never vacuous", () => {
    expect(buildCorpusIndex(EMPTY).size).toBe(0);
  });
});

describe("the stated limit (question 2)", () => {
  it("says what the check is about and what it is not", () => {
    expect(TRACEABILITY_LIMIT_NOTE).toMatch(/not about whether it is true/i);
  });

  it("makes no forbidden claim", () => {
    // The canon lives in ONE place for the reason its own header gives; this
    // package reads it rather than growing a second list that diverges.
    expect(TRACEABILITY_LIMIT_NOTE.toLowerCase()).not.toMatch(/\bguarantee|\baccura|\bconfiden|\blearn|\bimprov/);
  });
});

describe("findings name where they came from (R7)", () => {
  it("carries the field pointer, the unit and offsets into the field text", () => {
    const text = "Film it on Monday.";
    const found = scanTraceability(
      [unit(text, "hooks/2/text")],
      corpus(["I film short pieces about cameras."])
    );
    expect(found).toHaveLength(1);
    expect(found[0].field).toBe("hooks/2/text");
    expect(text.slice(found[0].startUtf16, found[0].endUtf16)).toBe("Monday");
    expect(found[0].unit).toContain("Monday");
  });
});
