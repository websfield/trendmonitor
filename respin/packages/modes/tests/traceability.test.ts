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

import { CHECK } from "@respin/llm";

import {
  COMMON_OPENERS,
  EXTENT_PROBES,
  FLAG_ONLY_FIELD_PREFIXES,
  SPECIFIC_SHAPES,
  TRACEABILITY_LIMIT_NOTE,
  buildCorpusIndex,
  offerCheck,
  scanTraceability,
  specificExtents,
  stripMarkedSpecifics,
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

  it("ROUND TRIP: every shape's own specimen, placed in the CORPUS, produces NO hard finding", () => {
    // THE SELF-CONSISTENCY PROPERTY, and the population is `SPECIFIC_SHAPES`
    // itself rather than a hand-written list (CLAUDE.md, 2026-08-29: a
    // population written as one path narrows the day a second path appears —
    // a new shape is covered here the moment it is declared).
    //
    // The two sides of this scan are written in different regexes:
    // `SPECIFIC_SHAPES` tokenises the OUTPUT, `buildCorpusIndex` tokenises the
    // CREATOR'S MATERIAL with `WORDLIKE` + `WRITTEN_NUMBER`. Nothing else makes
    // them agree. When they disagree the failure is symmetric and both halves
    // are creator-visible: a specific the creator typed themselves is REFUSED
    // after two paid vendor calls (with an excerpt quoting a token absent from
    // their draft), and — because a shape claims a span, and an overlapping
    // later match is skipped — an INVENTED specific inside that over-wide span
    // is never scanned at all, reaching the creator under
    // `TRACEABILITY_LIMIT_NOTE`'s claim that every number and date was checked.
    //
    // MEASURED (slice 8c round 1): `month-date` was the only failing shape —
    // "March 2024" tokenised as "March 20". This loop is the regression witness
    // for that whole class, and it is what the shape-by-shape tables above
    // could not see.
    for (const shape of SPECIFIC_SHAPES) {
      const found = scanTraceability(
        [unit(shape.specimen)],
        corpus([shape.specimen])
      );
      const hard = found.filter((f) => f.enforcement === "hard");
      expect(
        hard.map((f) => f.shape + ":" + f.token),
        shape.id +
          ": the creator's own " +
          JSON.stringify(shape.specimen) +
          " was refused"
      ).toEqual([]);
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

  it("offerCheck never lands the marker INSIDE the token it is marking", () => {
    // THE HOLE THE ROUND TRIP ABOVE CANNOT SEE. "Nothing is removed, nothing is
    // reworded" is satisfied byte-for-byte by a marker inserted in the MIDDLE
    // of a number: MEASURED in slice 8c round 1,
    // `offerCheck("We filmed this in March 2024", findings)` returned
    // "We filmed this in March 20 [check]24" — stripping " [check]" restores
    // the input exactly, so the existing M9 assertion stayed green while the
    // creator's date became nonsense on screen. `offerCheck` writes at a
    // finding's `endUtf16`, so this is an assertion about EVERY shape's extent,
    // and the population is `SPECIFIC_SHAPES` rather than a list.
    const splitsAToken = (out: string) => /\[check\][\p{L}\p{N}]/u.test(out);

    const measured = "We filmed this in March 2024";
    const offered = offerCheck(
      measured,
      scanTraceability([unit(measured)], EMPTY)
    );
    expect(offered).toBe("We filmed this in March 2024 " + CHECK);
    expect(splitsAToken(offered)).toBe(false);

    for (const shape of SPECIFIC_SHAPES) {
      const out = offerCheck(
        shape.specimen,
        scanTraceability([unit(shape.specimen)], EMPTY)
      );
      expect(splitsAToken(out), shape.id + ": " + out).toBe(false);
      // NON-VACUITY: a marker really was written for this specimen, so a shape
      // that stopped firing cannot pass this by producing no insertions.
      expect(out, shape.id).toContain(CHECK);
      expect(out.replaceAll(" " + CHECK, ""), shape.id).toBe(shape.specimen);
    }
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

  // THE TOKEN IS ASSERTED, NOT ONLY THE SHAPE. An earlier version of this
  // table checked "something of shape X fired at `hard`" and nothing else, and
  // that is exactly how the `month-date` extent defect (slice 8c round 1) hid:
  // "March 2024" tokenised as "March 20" — still `shape: "month-date"`, still
  // `kind: "date"`, still `enforcement: "hard"` — so the table stayed green
  // while the rule refused a token absent from the creator's draft and cleared
  // an invented year. The sibling `plain-number` case below always asserted its
  // token; these now do too. A shape whose extent is wrong is a red row here.
  it.each([
    ["currency", "It saved me $4,000 last year.", "$4,000"],
    ["percent", "Views rose 12% that week.", "12%"],
    ["multiplier", "It ran 3x longer than the last one.", "3x"],
    ["iso-date", "It shipped on 2026-08-31.", "2026-08-31"],
    ["month-date", "We filmed it in March 2024.", "March 2024"],
  ])(
    "a %s claim is HARD, and it claims EXACTLY its own token",
    (shape, text, token) => {
      const hit = scanTraceability([unit(text)], EMPTY).find(
        (f) => f.shape === shape
      );
      expect(hit, shape + " did not fire on: " + text).toBeDefined();
      expect(hit?.enforcement).toBe("hard");
      expect(hit?.token, shape + " claimed the wrong extent in: " + text).toBe(
        token
      );
    }
  );

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

  it("an INVENTED YEAR beside a month the brain does hold is still caught", () => {
    // THE FAIL-OPEN DIRECTION, measured end to end in slice 8c round 1: with a
    // greedy day group, "June 2019" was consumed as "June 20", which the corpus
    // could vouch for (`june` from "in June", `20` from "20 minutes") — and the
    // over-wide span then made `plain-number`'s match on `2019` OVERLAP and be
    // skipped, so the invented year produced ZERO findings under
    // `TRACEABILITY_LIMIT_NOTE`'s claim that every number and date was checked.
    const brain = ["I train 20 minutes a day and I started in June"];
    const found = scanTraceability(
      [unit("The June 2019 rebuild is the one nobody films.")],
      corpus(brain)
    );
    expect(found.map((f) => f.shape + ":" + f.token)).toContain(
      "month-date:June 2019"
    );

    // CONTROL, so the case above is about the YEAR and not about the month
    // word: without the month, the same year is reached by `plain-number`.
    // (Flag, not hard — `plain-number`'s enforcement, asserted below.)
    const control = scanTraceability(
      [unit("The 2019 rebuild is the one nobody films.")],
      corpus(brain)
    );
    expect(control.map((f) => f.shape + ":" + f.token)).toContain(
      "plain-number:2019"
    );
  });

  it("a month-date the creator's OWN material carries is not refused, and `[check]` beside it clears it", () => {
    // THE OVER-STRICT DIRECTION of the same defect. Both halves matter to a
    // creator: the first is a refusal they paid two vendor calls for, and the
    // second is whether `REWRITE_INSTRUCTION`'s remedy — a marker written
    // IMMEDIATELY BESIDE the specific — can actually clear it. With the greedy
    // day group it could not: "March 2024 [check]" still fired, because the
    // match ended inside the year and "24 " is not a whitespace-only gap.
    expect(
      scanTraceability(
        [unit("The March 2024 rebuild is the one nobody films.")],
        corpus(["I rebuilt the whole kitchen in March 2024"])
      )
    ).toEqual([]);
    expect(
      scanTraceability(
        [unit("The March 2024 " + CHECK + " rebuild is the one nobody films.")],
        EMPTY
      ).filter((f) => f.enforcement === "hard")
    ).toEqual([]);
  });

  it.each([
    ["March 20th, 2024", "March 20th, 2024"],
    ["March 20, 2024", "March 20, 2024"],
    ["March 20 2024", "March 20 2024"],
    ["Sept 5", "Sept 5"],
    ["December 31, 1999", "December 31, 1999"],
    ["May 2024", "May 2024"],
    ["May 5 2024", "May 5 2024"],
    ["March", "March"],
  ])(
    "the date form %s is claimed whole, day or no day",
    (form, token) => {
      // The extent is the thing under test, so every form the shape claims to
      // read is pinned to the token it must produce. A day-of-month is read as
      // a day; a bare year after a month is read as a YEAR and never as a
      // two-digit day with the rest left dangling.
      const found = scanTraceability(
        [unit("We filmed it in " + form + " and stopped.")],
        EMPTY
      );
      expect(
        found.filter((f) => f.shape === "month-date").map((f) => f.token),
        form
      ).toEqual([token]);
      // And nothing is left over for a later shape to pick up out of the
      // middle of the date.
      expect(found.map((f) => f.shape + ":" + f.token), form).toEqual([
        "month-date:" + token,
      ]);
    }
  );
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

  // ------------------------------------------------------------------
  // A `[check]`-MARKED SPECIFIC VOUCHES FOR NOTHING (spin-compliance gate,
  // 2026-09-01). The marker is the model's own statement that the material
  // does not carry this specific, so it is the one token that can never put it
  // into the corpus — see `stripMarkedSpecifics`.
  // ------------------------------------------------------------------

  it("a `[check]`-MARKED specific contributes nothing to the index", () => {
    const marked = `The $4,000 ${CHECK} rig cost you the whole year`;
    expect(buildCorpusIndex(corpus([marked])).has("4000")).toBe(false);
    // NON-VACUITY: the same sentence WITHOUT the marker does index it, so this
    // is the marker doing the work rather than the tokeniser missing it.
    const bare = "The $4,000 rig cost you the whole year";
    expect(buildCorpusIndex(corpus([bare])).has("4000")).toBe(true);
  });

  it("...and only the marked one — an unmarked specific beside it still counts", () => {
    const both = `We shot 12% ${CHECK} of it in March 2024`;
    const ix = buildCorpusIndex(corpus([both]));
    expect(ix.has("12")).toBe(false);
    expect(ix.has("march")).toBe(true);
    expect(ix.has("2024")).toBe(true);
  });

  it("the words around a marked specific survive — nothing is joined or lost", () => {
    const ix = buildCorpusIndex(corpus([`the ${"$4,000"} ${CHECK} rig`]));
    expect(ix.has("the")).toBe(true);
    expect(ix.has("rig")).toBe(true);
  });

  it("an EMOJI before the marked specific does not shift the blanking (UTF-16)", () => {
    // THE DEFECT THIS PINS, found by running the fix rather than by reading it.
    // `m.index` and `span.start` are UTF-16 offsets; the first version of
    // `stripMarkedSpecifics` blanked into a `[...text]` array, which iterates
    // CODE POINTS — so every astral character before the specific shifted the
    // window one unit right. At six the whole amount survived and the
    // laundering was back, on a draft whose only unusual property is that a
    // creator used emoji.
    const emoji = "🎥🎬📸🎞️🎥🎬";
    const text = `the rig ${emoji} cost $4,000 ${CHECK} last year`;
    expect(buildCorpusIndex(corpus([text])).has("4000")).toBe(false);
    // ...and the strip is length-preserving, so no offset computed against the
    // original text can point somewhere else afterwards.
    expect(stripMarkedSpecifics(text)).toHaveLength(text.length);
  });

  it("`unvouched` tokens are subtracted from the index, in every written form", () => {
    // The caller's half of REQ-I05's revision case: a specific the parent's
    // own gate REPORTED rather than traced is removed from what the parent's
    // draft can vouch for. `generate.ts`'s `unvouchedSpecifics` is what
    // guarantees nothing the creator typed reaches this list.
    const ix = buildCorpusIndex({
      brain: [],
      input: ["the rig cost $4,000 and we shot it in March 2024"],
      unvouched: ["$4,000"],
    });
    expect(ix.has("4000")).toBe(false);
    // Only that one: the rest of the document still vouches for itself.
    expect(ix.has("2024")).toBe(true);
    expect(ix.has("march")).toBe(true);
  });

  it("an EMPTY `unvouched` list removes nothing — the original behaviour", () => {
    const both = { brain: [], input: ["the rig cost $4,000"] };
    expect(buildCorpusIndex({ ...both, unvouched: [] }).has("4000")).toBe(true);
    expect(buildCorpusIndex(both).has("4000")).toBe(true);
  });

});

// ------------------------------------------------------------------
// ONE TOKENISER, PROVEN GENERATIVELY (slice 8c round 2).
//
// WHY THE TABLES ABOVE ARE NOT ENOUGH, stated as history rather than as
// principle. Round 1 blocked on `month-date` failing in both directions; the
// fix was correct, closed every enumerated case, and shipped an eight-row
// table of date forms as its witness. Round 2 blocked on the SAME class one
// regex group over — because the forms that fail are the ones nobody thought
// to type (`June 250000`, `March 12,000`, `June 3x`). CLAUDE.md's 2026-08-18
// lesson names exactly this: a list of counterexamples fixes instances and
// leaves the class open; prove the property GENERATIVELY.
//
// The two properties below are the class. Both were RED before the two-sided
// tokeniser landed and green after, measured on the real module:
//
//   self-vouch            48 / 2,000 violations  ->  0 / 20,000
//   suppression (month)  120 / 1,000 violations  ->  0 / 10,000  (all hard)
//   suppression (any)     52 / 1,500 violations  ->  0 / 10,000
//
// The specimen tables above are kept. They are fine; they were never enough.
//
// THE TWO PROPERTIES ARE COMPLEMENTARY, AND EACH ONE'S BLIND SPOT IS MEASURED.
// Self-vouch catches the two sides DISAGREEING; it cannot catch them agreeing
// on a wrong extent, and a planted mutation deleting both boundary rules of
// `repairedExtent` left it GREEN (both sides then over-reach identically)
// while the suppression properties and the digit-boundary property went red.
// Neither is the witness on its own.
// ------------------------------------------------------------------
describe("the two sides tokenise the same text the same way (generative)", () => {
  /** Deterministic, so a violation is reproducible from the seed in the message. */
  const rng = (seed: number) => {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  };
  const pick = <T,>(r: () => number, xs: readonly T[]): T =>
    xs[Math.floor(r() * xs.length) % xs.length];

  const MONTHS = [
    "January", "Jan", "February", "Feb", "March", "Mar", "April", "Apr", "May",
    "June", "Jun", "July", "Jul", "August", "Aug", "September", "Sept", "Sep",
    "October", "Oct", "November", "Nov", "December", "Dec",
  ];

  /** How a model writes a number, beside the bare digits it is built from. */
  const NUMBERS = [
    { written: "3x", plain: "3" },
    { written: "1.5x", plain: "1.5" },
    { written: "5x", plain: "5" },
    { written: "12,000", plain: "12000" },
    { written: "250000", plain: "250000" },
    { written: "1,200", plain: "1200" },
    { written: "20%", plain: "20" },
    { written: "12.5%", plain: "12.5" },
    { written: "$40", plain: "40" },
    { written: "$1,200", plain: "1200" },
    { written: "412", plain: "412" },
    { written: "2024", plain: "2024" },
    { written: "20th", plain: "20" },
    { written: "5", plain: "5" },
    { written: "2026-08-31", plain: "2026" },
  ];

  const NAMES = ["Anna", "Vantage Studios", "Sony", "TikTok", "The Beatles"];

  const FRAMES = [
    "Since {} more people watch the slow way",
    "By {} views it was over",
    "The {} rebuild is the one nobody films",
    "It took {} to get this right",
    "We filmed it in {} and stopped",
    "Nobody tells you about {}, and then it is too late",
    "I lost {} before I worked it out",
    "{} is what changed everything",
    "Stop doing this. {} is why.",
    "Cut the first line and keep {} in the second",
  ];

  /** Creator-shaped text: a month, a number and sometimes a name, in a frame. */
  const creatorText = (r: () => number): string => {
    const shape = r();
    const month = pick(r, MONTHS);
    const n = pick(r, NUMBERS);
    const name = pick(r, NAMES);
    const frame = pick(r, FRAMES);
    let specific: string;
    if (shape < 0.35) specific = month + " " + n.written;
    else if (shape < 0.5)
      specific =
        month +
        " " +
        Math.floor(r() * 28 + 1) +
        ", 20" +
        Math.floor(r() * 26 + 10);
    else if (shape < 0.6) specific = month + " 20" + Math.floor(r() * 26 + 10);
    else if (shape < 0.7) specific = n.written + " " + name;
    else if (shape < 0.8) specific = month;
    else if (shape < 0.9) specific = n.written;
    else specific = name + " " + n.written + " in " + month;
    return frame.replace("{}", specific);
  };

  /** The UTF-16 positions some finding reported, so "lost" is about characters. */
  const covered = (
    findings: ReturnType<typeof scanTraceability>,
    hardOnly: boolean
  ): Set<number> => {
    const out = new Set<number>();
    for (const f of findings) {
      if (hardOnly && f.enforcement !== "hard") continue;
      for (let i = f.startUtf16; i < f.endUtf16; i++) out.add(i);
    }
    return out;
  };

  const HARD_SHAPES = SPECIFIC_SHAPES.filter(
    (s) => s.enforcement === "hard"
  ).map((s) => s.id);

  it("SELF-VOUCH: text the creator typed is never a HARD finding against itself", () => {
    // THE PROPERTY, and it is the one a specimen table cannot state: for ANY
    // creator text T, `scanTraceability(T, corpus=[T])` has no hard finding.
    // It can only hold if the two sides agree about where a specific starts
    // and ends, which is why it was the witness this fix was built around
    // rather than the witness written after it.
    //
    // MEASURED on the pre-fix module at 20,000 cases: 423 violations, every
    // one of them `month-date` claiming part of a following number
    // ("Oct 2500" out of "Oct 250000"). After: 0.
    const r = rng(20260904);
    const violations: string[] = [];
    const reached = new Set<string>();
    let wouldFlag = 0;
    for (let i = 0; i < 1500; i++) {
      const text = creatorText(r);
      const unvouched = scanTraceability([unit(text)], EMPTY);
      for (const f of unvouched) reached.add(f.shape);
      if (unvouched.some((f) => f.enforcement === "hard")) wouldFlag++;
      const hard = scanTraceability([unit(text)], corpus([text])).filter(
        (f) => f.enforcement === "hard"
      );
      if (hard.length > 0) {
        violations.push(
          JSON.stringify(text) +
            " -> " +
            hard.map((f) => f.shape + ":" + JSON.stringify(f.token)).join(", ")
        );
      }
    }
    expect(violations.slice(0, 5), "seed 20260904").toEqual([]);

    // NON-VACUITY, TWO WAYS. A generator that produced innocuous prose would
    // satisfy the property trivially, so: most of these drafts DO refuse when
    // the corpus is empty, and every HARD shape is reached — the population is
    // derived from `SPECIFIC_SHAPES`, not from a list written here.
    expect(wouldFlag).toBeGreaterThan(700);
    for (const id of HARD_SHAPES) expect([...reached], id).toContain(id);
  });

  it("NO SUPPRESSION: a month word beside a number never removes a finding", () => {
    // THE REVIEWER'S SHAPE, generatively: the brain holds the month word and
    // the number's PLAIN token, the model invents the unit-bearing form, and
    // the month is inserted immediately in front of it. Before the fix, 1,254
    // of 10,000 such pairs lost a finding the control produced — every one of
    // them HARD (`3x`, `1.5x`, `5x`), i.e. an invented performance claim
    // reaching the creator because a month word sat next to it.
    //
    // Stated over CHARACTERS, not tokens: a legitimate re-grouping may rename
    // the token ("Anna" -> "Meet Anna") while still reporting the same text.
    const r = rng(870126);
    const violations: string[] = [];
    let controlHadHard = 0;
    for (let i = 0; i < 800; i++) {
      const month = pick(r, MONTHS);
      const n = pick(r, NUMBERS);
      const frame = pick(r, FRAMES);
      const brain = [
        "I started this in " + month + " and I did " + n.plain + " takes a week.",
      ];
      const control = frame.replace("{}", n.written);
      const at = control.indexOf(n.written);
      const variant = control.slice(0, at) + month + " " + control.slice(at);
      const shift = month.length + 1;

      const before = scanTraceability([unit(control)], corpus(brain));
      const after = scanTraceability([unit(variant)], corpus(brain));
      if (before.some((f) => f.enforcement === "hard")) controlHadHard++;
      const afterCovered = covered(after, false);
      for (const i2 of covered(before, false)) {
        if (!afterCovered.has(i2 >= at ? i2 + shift : i2)) {
          violations.push(
            JSON.stringify(control) +
              " -> " +
              JSON.stringify(variant) +
              " lost " +
              JSON.stringify(control[i2 >= at ? i2 : i2])
          );
          break;
        }
      }
    }
    expect(violations.slice(0, 5), "seed 870126").toEqual([]);
    // NON-VACUITY: the controls really do refuse, so "nothing was lost" is not
    // "nothing was ever found".
    expect(controlHadHard).toBeGreaterThan(100);
  });

  it("...and neither does ANY extra adjacent token, anywhere in the draft", () => {
    // The general form, because the month word was only the instance. Adding a
    // token to the DRAFT adds nothing to the corpus, so it can only ever ADD
    // findings. Inserting INSIDE a reported span is excluded: that destroys
    // the specific rather than putting a neighbour beside it.
    //
    // MEASURED before the fix: 344 of 10,000 lost a reported character, 34 of
    // them hard — including the capitalised-run case ("In March Anna arrived."
    // reported nothing for `Anna`, while "In the room Anna arrived." did).
    const r = rng(31337);
    const extras = [...MONTHS, ...NAMES, "20", "2024", "really", "quietly", "The"];
    const violations: string[] = [];
    for (let i = 0; i < 800; i++) {
      const control = creatorText(r);
      const brain = [creatorText(r), creatorText(r)];
      const before = scanTraceability([unit(control)], corpus(brain));
      const boundaries = [...control.matchAll(/(?<= )/g)]
        .map((m) => m.index)
        .filter(
          (at) => !before.some((f) => at > f.startUtf16 && at < f.endUtf16)
        );
      if (boundaries.length === 0) continue;
      const at = pick(r, boundaries);
      const extra = pick(r, extras);
      const variant = control.slice(0, at) + extra + " " + control.slice(at);
      const shift = extra.length + 1;
      const afterCovered = covered(
        scanTraceability([unit(variant)], corpus(brain)),
        false
      );
      for (const i2 of covered(before, false)) {
        if (!afterCovered.has(i2 >= at ? i2 + shift : i2)) {
          violations.push(
            JSON.stringify(control) + " -> " + JSON.stringify(variant)
          );
          break;
        }
      }
    }
    expect(violations.slice(0, 5), "seed 31337").toEqual([]);
  });

  it("no EDGE of a specific ever sits inside a run of digits", () => {
    // ROUND 1's `(?!\d)` LOOKAHEAD, RESTATED AS A PROPERTY OF THE TOKENISER.
    // The lookahead guarded one regex group of one shape, which is why round 2
    // found the same defect on the group next to it. This asserts it for every
    // shape over generated text and over `SPECIFIC_SHAPES`' own specimens, so
    // a new shape is in the population the moment it is declared.
    //
    // AND THE PROPERTY IS THE NARROW ONE ON PURPOSE. The first draft of this
    // test said "never begins or ends flush against a digit" and that is
    // FALSE — `currency` opens on a symbol, so "It was 20$40 total." yields
    // `plain-number:"20"` then `currency:"$40"`, the amount starting straight
    // after a digit with nothing cut and both specifics reported. The
    // generator never produced that string, so the wider claim would have
    // passed here and been wrong in the code: exactly the shape of defect this
    // whole block exists to stop. What is actually true, and what the fix
    // enforces, is that no edge lands INSIDE a number.
    const r = rng(4242);
    const texts = [
      ...SPECIFIC_SHAPES.map((s) => s.specimen),
      ...EXTENT_PROBES,
      "It was 20$40 total.",
      "It was 20%40 total.",
      ...Array.from({ length: 400 }, () => creatorText(r)),
    ];
    const digit = (c: string | undefined) => /\d/.test(c ?? "");
    let tokens = 0;
    for (const text of texts) {
      for (const found of scanTraceability([unit(text)], EMPTY)) {
        tokens++;
        const where = text + " | " + found.token;
        expect(
          digit(text[found.startUtf16 - 1]) && digit(text[found.startUtf16]),
          where + " starts inside a number"
        ).toBe(false);
        expect(
          digit(text[found.endUtf16 - 1]) && digit(text[found.endUtf16]),
          where + " ends inside a number"
        ).toBe(false);
      }
    }
    expect(tokens).toBeGreaterThan(400);

    // ...and the case that forced the narrow wording keeps BOTH specifics, so
    // the narrowing did not buy itself a miss.
    expect(
      scanTraceability([unit("It was 20$40 total.")], EMPTY).map(
        (f) => f.shape + ":" + f.token
      )
    ).toEqual(["plain-number:20", "currency:$40"]);
  });

  it("`plain-number` sits BELOW every hard shape — the coupling the invariant rests on", () => {
    // WHY THIS IS A TEST AND NOT A COMMENT. `repairedExtent`'s digit-boundary
    // block (rule A) is REDUNDANT today: deleting it was planted as a mutation
    // and the suite stayed green at 173/173, because rule B already cuts
    // wherever an edge lands inside a digit run — and it does so only because
    // `plain-number` matches every bare digit run and sits at a LOWER priority
    // than the shapes that can over-reach into one. Reorder the list, or drop
    // `plain-number`, and one of the two mechanisms delivering the invariant
    // silently goes away. That coupling is asserted here rather than assumed.
    const at = (id: string) => SPECIFIC_SHAPES.findIndex((s) => s.id === id);
    expect(at("plain-number")).toBeGreaterThanOrEqual(0);
    for (const shape of SPECIFIC_SHAPES) {
      if (shape.enforcement !== "hard") continue;
      expect(at(shape.id), shape.id + " must outrank plain-number").toBeLessThan(
        at("plain-number")
      );
    }
  });

  it("the extent probes the VERSION is fingerprinted over reach every shape", () => {
    // `bundle.ts` hashes `specificExtents` over `EXTENT_PROBES`, so the probe
    // set is what decides whether a resolution change moves
    // `prompt_bundle_version`. A probe set that reached only some shapes would
    // silently stop covering the others.
    const seen = new Set(
      EXTENT_PROBES.flatMap((t) => specificExtents(t)).map((s) => s.split(":")[0])
    );
    for (const shape of SPECIFIC_SHAPES) {
      expect([...seen], shape.id).toContain(shape.id);
    }
  });
});

// ------------------------------------------------------------------
// A DATE IS ONE SPECIFIC (slice 8c round 2 BLOCK, both lanes).
// ------------------------------------------------------------------
describe("a date is never decomposed, and the corpus can still vouch for one", () => {
  it("two words the brain holds SEPARATELY do not vouch for a date", () => {
    // MEASURED before this closed: brain "I filmed in March" + "2024 was a
    // hard year" cleared the hook "The March 2024 rebuild" with ZERO findings,
    // under `TRACEABILITY_LIMIT_NOTE`'s sentence that every date was checked.
    // Month names and a recent year are near-certain in any real brain.
    expect(
      scanTraceability(
        [unit("The March 2024 rebuild is the one nobody films.")],
        corpus(["I filmed in March", "2024 was a hard year"])
      ).map((f) => f.shape + ":" + f.token)
    ).toEqual(["month-date:March 2024"]);
  });

  it("...nor in ONE document, and nor do three words vouch for a full date", () => {
    expect(
      scanTraceability(
        [unit("The March 2024 rebuild.")],
        corpus(["In March I bought 20 lenses. Later, 2024 rolled around."])
      ).map((f) => f.token)
    ).toEqual(["March 2024"]);
    expect(
      scanTraceability(
        [unit("On March 20, 2024 we filmed.")],
        corpus(["I shot in March, took 20 lenses, and 2024 was hard"])
      ).map((f) => f.token)
    ).toEqual(["March 20, 2024"]);
  });

  it("...while the SAME date in the creator's own material still clears", () => {
    // THE HALF THE NAIVE TIGHTENING BREAKS. `kind === "date" -> false` on its
    // own hard-refuses every month-date including one the creator typed, which
    // is round 1's false-refusal direction restored. It only works because
    // `buildCorpusIndex` now indexes COMPOSITES.
    expect(buildCorpusIndex(corpus(["I rebuilt it in March 2024"])).has("march 2024")).toBe(
      true
    );
    expect(
      scanTraceability(
        [unit("The March 2024 rebuild is the one nobody films.")],
        corpus(["I rebuilt the whole kitchen in March 2024"])
      )
    ).toEqual([]);
    expect(
      scanTraceability(
        [unit("On March 20, 2024 we filmed.")],
        corpus(["we filmed on March 20, 2024 in the kitchen"])
      )
    ).toEqual([]);
  });

  it("`iso-date` and `month-date` now behave the SAME way, and the reason is stated", () => {
    // The contrast that made this a real inconsistency rather than a taste:
    // `iso-date` is `kind: "date"` too and never decomposed — but only by
    // accident of tokenisation (one `WORDLIKE` token, so `parts.length > 1`
    // was false). Two hard date shapes, opposite behaviour, no stated reason.
    const brain = corpus(["2026 was the year", "08 takes", "31 of them"]);
    expect(
      scanTraceability([unit("It shipped on 2026-08-31.")], brain).map(
        (f) => f.shape
      )
    ).toContain("iso-date");
    expect(
      scanTraceability(
        [unit("The March 2024 rebuild.")],
        corpus(["March was hard", "2024 was worse"])
      ).map((f) => f.shape)
    ).toContain("month-date");
  });
});

// ------------------------------------------------------------------
// THE ROUND-1 AND ROUND-2 CASES, each with the control that makes it a
// measurement rather than an assertion.
// ------------------------------------------------------------------
describe("the extent cases, with controls", () => {
  it("a month word does not cancel the check on the multiplier beside it", () => {
    // ROUND 2's BLOCK, scenario A. Before: `usable`, `hardRules: []`,
    // `traceability: []` — an invented `3x` reach claim rendered under the
    // sentence saying every number was checked. The control is the same hook
    // with the month removed.
    const brain = corpus(["…I run 3 times a week and I started in June."]);
    expect(
      scanTraceability(
        [unit("Since June 3x more people watch the slow way")],
        brain
      ).map((f) => f.shape + ":" + f.enforcement + ":" + f.token)
    ).toEqual(["multiplier:hard:3x"]);
    expect(
      scanTraceability(
        [unit("It is 3x more people watching the slow way")],
        brain
      ).map((f) => f.shape + ":" + f.enforcement + ":" + f.token)
    ).toEqual(["multiplier:hard:3x"]);
  });

  it("...nor on the thousands-separated number beside it", () => {
    const brain = corpus(["…I shot 12 videos in March."]);
    expect(
      scanTraceability([unit("In March 12,000 people signed up")], brain).map(
        (f) => f.shape + ":" + f.token
      )
    ).toEqual(["plain-number:12,000"]);
    expect(
      scanTraceability([unit("Then 12,000 people signed up")], brain).map(
        (f) => f.shape + ":" + f.token
      )
    ).toEqual(["plain-number:12,000"]);
  });

  it("a number the creator typed is not refused, and the marker lands beside it", () => {
    // ROUND 2's BLOCK, scenario B: refused after two paid vendor calls with
    // the excerpt 'June 2500' — a token absent from the draft — and the
    // model's own remedy could not clear it.
    const text = "By June 250000 views it was over";
    expect(scanTraceability([unit(text)], corpus([text]))).toEqual([]);
    expect(offerCheck(text, scanTraceability([unit(text)], EMPTY))).toBe(
      "By June " + CHECK + " 250000 " + CHECK + " views it was over"
    );
  });

  it("a capitalised run is NARROWED by a month, never cancelled by it", () => {
    // The flag-side instance of the same class, and the control is the same
    // sentence with an ordinary word where the month was.
    expect(
      scanTraceability([unit("In March Anna arrived.")], corpus(["I was there"]))
        .map((f) => f.shape + ":" + f.token)
    ).toEqual(["month-date:March", "proper-noun:Anna"]);
    expect(
      scanTraceability(
        [unit("In the room Anna arrived.")],
        corpus(["I was there"])
      ).map((f) => f.shape + ":" + f.token)
    ).toEqual(["proper-noun:Anna"]);
  });

  it("a DECIMAL quantity is one specific, not the two halves of a split sentence", () => {
    // FOUND BY THE FUZZ, not by review: `spans()` treated the decimal point as
    // a sentence ender, so "12.5%" became the span "…12" and the span "5%…"
    // and a brain holding "12" and "5%" in unrelated documents vouched for an
    // invented `12.5%` with zero findings. Same for `1` + `5x` -> `1.5x` and
    // `1200` + `50` -> `$1,200.50`. All three are HARD shapes, and it is the
    // decomposition `traceable`'s docblock exists to refuse, arriving through
    // the splitter instead.
    expect(
      scanTraceability(
        [unit("Views rose 12.5% that week.")],
        corpus(["I shot 12 videos", "5% of the time it works"])
      ).map((f) => f.shape + ":" + f.token)
    ).toEqual(["percent:12.5%"]);
    expect(
      scanTraceability([unit("It ran 1.5x longer.")], corpus(["1 take", "5x the gear"]))
        .map((f) => f.token)
    ).toEqual(["1.5x"]);
    expect(
      scanTraceability(
        [unit("It cost $1,200.50 all in.")],
        corpus(["1200 of gear", "50 lenses"])
      ).map((f) => f.token)
    ).toEqual(["$1,200.50"]);

    // ...and the creator's own decimal still clears, so this is not a blanket
    // refusal of decimals.
    expect(
      scanTraceability(
        [unit("Views rose 12.5% that week.")],
        corpus(["views rose 12.5% that week"])
      )
    ).toEqual([]);

    // A SENTENCE END IS STILL A SENTENCE END: the exception is a dot BETWEEN
    // digits, and nothing else.
    expect(
      scanTraceability([unit("It cost $40. [check] is elsewhere.")], EMPTY).map(
        (f) => f.token
      )
    ).toContain("$40");
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
