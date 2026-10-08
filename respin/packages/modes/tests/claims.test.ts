// The fifth hard rule: REQ-I04 and REQ-I05 made DETERMINISTIC on the text a
// creator actually reads.
//
// THE DEFECT THIS FILE IS THE WITNESS FOR, measured by the compliance gate on
// the real pipeline: `whyThisPerforms.reasoning`, hook text and
// `disclosure.guidance` were rendered verbatim on `/studio`, and nothing checked
// any of them. A disclosure section reading "Most people skip the label on a
// short like this." was returned with `hardRules: []` and appeared under a
// **Disclosure** heading as the product's own advice. By this package's own R5
// logic a prompt line is a BRIEF, NOT A GATE. (Since audit P1-R1 the model's
// disclosure section is presented on no surface — R-154 — so it is a gate
// input stored at flag level, not displayed text; `whyThisPerforms` and the
// hooks are still displayed.)
//
// Every shape carries a specimen that MUST match (CLAUDE.md, 2026-08-21), and
// every family has TRUE NEGATIVES, because a suite that only plants violations
// cannot tell a working scanner from `() => [finding]`.
//
// WHY THE PERFORMANCE FAMILY IS PINNED HERE RATHER THAN COMPARED WITH
// `tests/support/forbidden-claims.ts`. `packages/modes` may not import from the
// test tree at all, and its TESTS deliberately do not lean on a symbol another
// surface owns: the ids and pattern sources below are the copy's PROVENANCE,
// pinned so that editing the vocabulary is a visible edit here (the "named
// rather than counted" idiom `bundle.test.ts` already uses). The two-list
// agreement itself is asserted from the canon's own side — `OUTPUT_CLAIM_SHAPES`
// is exported from `@respin/modes` for exactly that.
import { describe, expect, it } from "vitest";

import { FORBIDDEN_CLAIMS } from "../../../tests/support/forbidden-claims";
import { claimHits, specimensFor } from "../../../tests/support/claim-scan";
import {
  ADMISSION_CLAIM_FIELDS,
  CLAIM_CONTEXT_GUARDS,
  CLAIM_HEDGE_ALLOWLIST,
  CLAIM_HEDGE_TAILS,
  HARD_CLAIM_FIELD_PREFIXES,
  KNOWN_VOCABULARY_GAPS,
  NOT_PRESENTED_FIELD_PREFIXES,
  OUTPUT_CLAIM_SHAPES,
  claimContextGuard,
  claimFieldsFor,
  claimRefusesOn,
  claimRemedyFor,
  refusalIsClaimOnly,
  scanOutputClaims,
  type ClaimFamily,
} from "../src/claims";
import {
  outputTextPointers,
  outputTextUnits,
  type ScriptOutput,
} from "../src/output";
import { type TextUnit } from "../src/text";
import { EVERY_SECTION } from "./support/fixtures";

const at = (field: string, text: string): TextUnit => ({
  field,
  text,
  isHook: false,
});

/** The section the rule is HARD on, and two it is not. */
const why = (text: string) => at("/whyThisPerforms/reasoning", text);
const hook = (text: string) => at("/hooks/0/text", text);
const guidance = (text: string) => at("/disclosure/guidance", text);

describe("the vocabulary is not vacuous", () => {
  it("EVERY shape matches its own specimen", () => {
    // A typo in one pattern otherwise hides behind another pattern's match and
    // the suite stays green.
    for (const shape of OUTPUT_CLAIM_SHAPES) {
      expect(shape.pattern.test(shape.specimen), shape.id).toBe(true);
    }
  });

  it("every shape is REACHED BY THE SCAN, not merely declared", () => {
    // The stronger version: a pattern matching in isolation proves nothing
    // about whether the scan consults it.
    for (const shape of OUTPUT_CLAIM_SHAPES) {
      const found = scanOutputClaims([why(shape.specimen + ".")]);
      expect(
        found.map((f) => f.shape),
        shape.id + ": " + shape.specimen
      ).toContain(shape.id);
    }
  });

  it("names all three families, and none of them is empty", () => {
    const families: ClaimFamily[] = ["performance", "certainty", "concealment"];
    for (const family of families) {
      expect(
        OUTPUT_CLAIM_SHAPES.filter((s) => s.family === family).length,
        family
      ).toBeGreaterThan(0);
    }
    expect(new Set(OUTPUT_CLAIM_SHAPES.map((s) => s.id)).size).toBe(
      OUTPUT_CLAIM_SHAPES.length
    );
  });
});

describe("the copy's provenance is pinned, so a silent edit is a red test", () => {
  const performance = OUTPUT_CLAIM_SHAPES.filter(
    (s) => s.family === "performance"
  );

  it("the performance family is the canon's list, id for id and in order", () => {
    expect(performance.map((s) => s.id)).toEqual([
      "viral",
      "goes viral",
      "views",
      "engagement",
      "more reach",
      "reach an audience",
      "will perform",
      "outperform",
      "blow up",
      "beats your baseline",
      "better than your last",
      "best-performing",
      "more views",
      "proven to",
    ]);
  });

  it("...and pattern source for pattern source", () => {
    // BY SOURCE, not by behaviour on a handful of strings: two patterns that
    // agree on the specimens and differ on everything else are exactly the
    // divergence this repo has already shipped once (`/brain` banned
    // `guarantee`, `/onboarding` — the screen that spends a credit — did not).
    expect(performance.map((s) => s.pattern.source)).toEqual([
      "\\bviral|\\bvirality",
      "\\b(go(es|ing)?|went|will go|gonna go)\\s+viral\\b",
      "\\bviews\\b",
      "\\bengagement\\b",
      "\\b(more|wider|bigger|larger|extra|higher) reach\\b",
      "\\breach(es|ing)? (a |an |your |the )?(wider |bigger |larger |new |whole |right )?(audience|following|viewers)\\b",
      "\\bwill perform",
      "\\boutperform",
      "\\bblow(s|ing)? up\\b",
      "\\bbeat(s|ing)? (your|my|our|their|the) (baseline|average|numbers|usual|best)\\b",
      "\\b(perform(s|ed|ing)?|do(es)?|did|work(s|ed)?|land(s|ed)?|hit(s)?) better than (your|my|our|their|the)\\b",
      "\\bbest[- ]performing\\b",
      "\\bmore (views|engagement|followers|saves|shares|comments)\\b",
      "\\bproven to\\b",
    ]);
  });

  it("`guarantee` IS the shared canon's own pattern, not a second spelling", () => {
    // The one entry `FORBIDDEN_CLAIMS` and this list both carry. It is compared
    // against the canon directly, because that symbol is stable and the whole
    // point is that the two cannot drift apart.
    const mine = OUTPUT_CLAIM_SHAPES.find((s) => s.id === "guarantee");
    const theirs = FORBIDDEN_CLAIMS.find(([label]) => label === "guarantee");
    expect(theirs, "the canon no longer bans `guarantee`").toBeDefined();
    expect(mine?.pattern.source).toBe(theirs?.[1].source);
  });

  it("names the part of this list that is WIDER than the canon", () => {
    // The relation is a superset, not an equality, and the extra is named
    // rather than left for a reader to diff.
    expect(
      OUTPUT_CLAIM_SHAPES.filter((s) => s.family !== "performance").map(
        (s) => s.family + ":" + s.id
      )
    ).toEqual([
      "certainty:guarantee",
      "certainty:cannot fail",
      "concealment:skip the label",
      "concealment:no need to disclose",
      "concealment:disclosure is optional",
      "concealment:do not mention",
      "concealment:nobody needs to know",
      "concealment:leave it out",
      "concealment:hide that a tool made it",
    ]);
  });
});

describe("the enforcement split: BOTH the shape and the field must allow a refusal", () => {
  // TWO CEILINGS, and either one alone was measured refusing an honest draft.
  //
  //   THE FIELD's — `/whyThisPerforms/` is the section whose job is to explain
  //   the draft, so a claim there is the product asserting one (REQ-I04).
  //
  //   THE SHAPE's — a pattern only refuses if it carries a PREDICATE. A bare
  //   noun or adjective (`views`, `engagement`, `viral`) is a word, not a
  //   claim, and the section it is hard on is the one asked to be HONEST: the
  //   sentence a model writes to admit what it has not checked is exactly where
  //   a metric noun belongs.
  it("every shape declares a ceiling, and BOTH values are used", () => {
    for (const shape of OUTPUT_CLAIM_SHAPES) {
      expect(["hard", "flag"], shape.id).toContain(shape.enforcement);
    }
    const values = OUTPUT_CLAIM_SHAPES.map((s) => s.enforcement);
    expect(values).toContain("hard");
    expect(values).toContain("flag");
  });

  it("the bare NOUNS AND ADJECTIVES are the flag-ceiling set, named", () => {
    // Pinned as a list, so demoting a predicate shape into it is a visible edit
    // rather than a quiet softening of the rule.
    expect(
      OUTPUT_CLAIM_SHAPES.filter((s) => s.enforcement === "flag").map((s) => s.id)
    ).toEqual(["viral", "views", "engagement"]);
  });

  it("a FORECAST in `whyThisPerforms` is HARD", () => {
    const found = scanOutputClaims([
      why("This one will perform, and it outperforms your last post."),
    ]);
    expect(found.map((f) => f.shape).sort()).toEqual([
      "outperform",
      "will perform",
    ]);
    for (const f of found) expect(f.enforcement, f.shape).toBe("hard");
  });

  it("a GUARANTEE in `whyThisPerforms` is HARD", () => {
    const found = scanOutputClaims([why("Results are guaranteed on this one.")]);
    expect(found.map((f) => f.shape)).toEqual(["guarantee"]);
    expect(found[0].enforcement).toBe("hard");
  });

  it("a CONCEALMENT line refuses in `whyThisPerforms` and only FLAGS in the unpresented disclosure section (R-154)", () => {
    // The disclosure half of this test asserted `hard` while Studio rendered
    // the model's disclosure under the product's own **Disclosure** heading.
    // Audit P1-R1 stopped every presentation of that section, so a refusal
    // there would debit a creator for text nobody reads: the field is
    // flag-only now (R-154), and the finding is still recorded.
    const inWhy = scanOutputClaims([why("Most people skip the label on a short like this.")]);
    expect(inWhy.map((f) => f.shape)).toEqual(["skip the label"]);
    expect(inWhy[0].enforcement).toBe("hard");
    const inDisclosure = scanOutputClaims([guidance("Most people skip the label on a short like this.")]);
    expect(inDisclosure.map((f) => f.shape)).toEqual(["skip the label"]);
    expect(inDisclosure[0].enforcement).toBe("flag");
  });

  it("a BARE METRIC NOUN is flag-only EVEN IN `whyThisPerforms`", () => {
    // MEASURED: each of these three refused end to end (`drafts: 2`), and a
    // refusal is debited. Every one of them is the product doing what REQ-I04
    // asks — naming the thing it has not checked.
    //
    // THE SHAPES ARE NAMED, NOT COUNTED. ("Nothing here makes it go viral."
    // was the third row: it matches `goes viral` too, which R-173's closed
    // allowlist no longer softens — it refuses, free, and is pinned below.)
    for (const [sentence, shapes] of [
      [
        "Nothing here has been checked against how your views actually behave.",
        ["views"],
      ],
      ["This is a structure, not an engagement trick.", ["engagement"]],
    ] as const) {
      const found = scanOutputClaims([why(sentence)]);
      expect(found.map((f) => f.shape), sentence).toEqual(shapes);
      for (const f of found) expect(f.enforcement, sentence + " / " + f.shape).toBe("flag");
    }
  });

  it("...and the FORECAST built from the same noun still refuses", () => {
    // Non-vacuity for the demotion: it narrows a word, it does not soften the
    // rule. The predicate is what the other shapes match.
    for (const [sentence, shape] of [
      ["This one will perform for you.", "will perform"],
      ["It gets more reach than your last one.", "more reach"],
      ["This is going to blow up.", "blow up"],
      ["It will reach a wider audience.", "reach an audience"],
    ] as const) {
      const found = scanOutputClaims([why(sentence)]);
      expect(found.map((f) => f.shape), sentence).toContain(shape);
      expect(
        found.find((f) => f.shape === shape)?.enforcement,
        sentence
      ).toBe("hard");
    }
  });

  it("the same word in a HOOK is flag-only — a word is not a claim", () => {
    const found = scanOutputClaims([hook("Your views are not the problem.")]);
    expect(found.map((f) => f.shape)).toEqual(["views"]);
    expect(found[0].enforcement).toBe("flag");
  });

  it("the MEASURED concealment sentence is flagged, verbatim", () => {
    // It was returned for display with no rule fired, under a heading that
    // makes it the product's advice.
    const found = scanOutputClaims([
      guidance("Most people skip the label on a short like this."),
    ]);
    expect(found.map((f) => f.shape)).toEqual(["skip the label"]);
    expect(found[0].family).toBe("concealment");
    expect(found[0].unit).toContain("skip the label");
    expect(found[0].field).toBe("/disclosure/guidance");
  });

  it("the hard-field list is a POPULATION, and it names a real pointer", () => {
    // Derived from `outputTextUnits` rather than from a hand-written string, so
    // a renamed pointer is a red test rather than a prefix matching nothing.
    const units = outputTextUnits(EVERY_SECTION as unknown as ScriptOutput);
    for (const prefix of HARD_CLAIM_FIELD_PREFIXES) {
      expect(
        units.some((u) => u.field.startsWith(prefix)),
        prefix + " matches no field any mode emits"
      ).toBe(true);
    }
  });
});

describe("the concealment family after audit P1-R1 (R-154): the disclosure section is not presented", () => {
  // `/disclosure/` was a hard field because Studio DISPLAYED the model's
  // disclosure under the product's own heading — the measured sentence below
  // rendered there with `hardRules: []`. P1-R1 removed every presentation of
  // that section (`/studio`, first-ideas and `/trends` render the product's
  // sentence for the disclosure kind; the saved pack overwrites it; the Sample
  // Spin filters it). A refusal is debited, so refusing over it would charge a
  // creator for text nobody reads. The finding is kept, at flag level.
  it("the sentence the gate measured is still FOUND, and only flagged", () => {
    const found = scanOutputClaims([
      guidance(
        "Most people skip the label on a short like this, and nobody needs to know a tool helped."
      ),
    ]);
    expect(found.map((f) => f.shape)).toEqual([
      "skip the label",
      "nobody needs to know",
    ]);
    for (const f of found) expect(f.enforcement, f.shape).toBe("flag");
  });

  it("EVERY concealment shape is still found on `/disclosure/guidance` (flag) and still REFUSES on a hard field", () => {
    // Both halves per shape: the vocabulary did not shrink, and the family's
    // hard half keeps a live field — `whyThisPerforms` is presented on every
    // surface that shows a draft.
    for (const shape of OUTPUT_CLAIM_SHAPES.filter(
      (s) => s.family === "concealment"
    )) {
      const inDisclosure = scanOutputClaims([guidance(shape.specimen + ".")]).find((f) => f.shape === shape.id);
      expect(inDisclosure, shape.id + ": " + shape.specimen).toBeDefined();
      expect(inDisclosure!.enforcement, shape.id).toBe("flag");
      const inWhy = scanOutputClaims([why(shape.specimen + ".")]).find((f) => f.shape === shape.id);
      expect(inWhy, shape.id + " (why)").toBeDefined();
      expect(inWhy!.enforcement, shape.id + " (why)").toBe("hard");
    }
  });

  it("the hard-field list is `whyThisPerforms` alone, and every mode emits it", () => {
    // `output.ts` requires `whyThisPerforms` of every mode
    // (`assertUniversalSections`), which is what makes the prefix a live
    // string. Derived from the fixture's own pointers, never hand-written.
    // R-173 after its verification: the whole section again. The weakest
    // point is an ADMISSION field — an unhedged claim refuses there, a hedged
    // one flags (`ADMISSION_CLAIM_FIELDS`).
    expect([...HARD_CLAIM_FIELD_PREFIXES]).toEqual(["/whyThisPerforms/"]);
    expect([...ADMISSION_CLAIM_FIELDS]).toEqual(["/whyThisPerforms/weakestPoint"]);
    const units = outputTextUnits(EVERY_SECTION as unknown as ScriptOutput);
    for (const prefix of HARD_CLAIM_FIELD_PREFIXES) {
      expect(
        units.some((u) => u.field.startsWith(prefix)),
        prefix + " matches no field any mode emits"
      ).toBe(true);
    }
  });
});

describe("THE THIRD CEILING: the context guard", () => {
  // The patterns are negation-blind by construction: "skip the label" and
  // "never skip the label" are opposite instructions built from one string.
  // Both directions are driven, because a guard is a licence to soften a rule
  // and one that only ever cleared things would be a hole.
  it("EVERY guard clears its specimen AND refuses its counter-specimen", () => {
    for (const guard of CLAIM_CONTEXT_GUARDS) {
      for (const [kind, probe] of [
        ["specimen", guard.specimen],
        ["counter", guard.counterSpecimen],
      ] as const) {
        // THE ONE HARD FIELD (R-154). A guard can only be measured where a
        // refusal is possible; on the flag-only disclosure section both
        // directions would read `flag` and this case would prove nothing.
        const field = "/whyThisPerforms/reasoning";
        const found = scanOutputClaims([at(field, probe.sentence)]);
        const mine = found.find((f) => f.shape === probe.shape);
        expect(
          mine,
          `${guard.id} / ${kind}: ${probe.shape} did not match "${probe.sentence}"`
        ).toBeDefined();
        expect(mine!.enforcement, `${guard.id} / ${kind}`).toBe(
          kind === "specimen" ? "flag" : "hard"
        );
      }
    }
  });

  it.each([
    // THE THREE THE GATE MEASURED. Promoting `/disclosure/` to a hard field
    // WITHOUT the guard refused each of these, and a refusal is debited — so
    // the product would charge a creator a credit for telling them, correctly,
    // to label their video.
    "Do not leave the label out of the caption.",
    "Never skip the label on a short like this.",
    "There is no need to disclose sponsorship here, but you must tag AI assistance.",
    // ...AND THE PHRASINGS A WIDER PROBE FOUND, because three sentences is a
    // sample and this is a class. `cannot` is the one that was still refused
    // after the first fix — one word, not two, so neither negation branch read
    // it — and it is the likeliest sentence on this whole surface.
    "You cannot skip the label on a paid partnership.",
    "Do not skip the disclosure, even in a comment reply.",
    "You should never hide that a tool helped with the script.",
    "Avoid hiding that a tool helped; the label costs you nothing.",
    "Nobody needs to know your exact process, but you must tag the AI assistance.",
  ])("HONEST GUIDANCE does not refuse: %s", (sentence) => {
    // Read on the hard field, so the `flag` below is the GUARD's doing — on the
    // flag-only disclosure section it would hold whatever the guard did.
    const found = scanOutputClaims([why(sentence)]);
    // NON-VACUITY: each of these really does carry a concealment shape, so
    // this is measuring the guard rather than a sentence nothing matched.
    expect(found.length, sentence + " matched no shape at all").toBeGreaterThan(
      0
    );
    for (const f of found) expect(f.enforcement, sentence).toBe("flag");
  });

  it.each([
    "Skip the tag; the algorithm punishes it.",
    "No need to label this as AI.",
    "Nobody needs to know a tool helped.",
  ])("...and REAL concealment advice still refuses on a hard field: %s", (sentence) => {
    const found = scanOutputClaims([why(sentence)]);
    expect(found.some((f) => f.enforcement === "hard"), sentence).toBe(true);
  });

  it("a guard DEMOTES, it never DELETES", () => {
    // R-68's own direction, in R-68's own words: "a flagged claim is still
    // recorded and surfaced rather than silently allowed". A guard that
    // removed the finding would make a misfiring guard indistinguishable from
    // a clean sentence — and `generation-outcome.tsx` renders flag-level
    // findings, so demoting keeps the line in front of the creator.
    for (const guard of CLAIM_CONTEXT_GUARDS) {
      const field = "/whyThisPerforms/reasoning";
      const found = scanOutputClaims([at(field, guard.specimen.sentence)]);
      expect(
        found.map((f) => f.shape),
        guard.id
      ).toContain(guard.specimen.shape);
    }
  });

  it("a guard applies ONLY to the families it names", () => {
    // NON-VACUITY FOR `families`, planted from both sides: the same left-hand
    // window that clears a concealment shape leaves a performance shape hard,
    // and the pattern itself is shown to match — so this measures the family
    // list rather than a pattern that happens not to fire.
    const conceal = scanOutputClaims([why("Never skip the label.")]);
    expect(conceal[0].enforcement).toBe("flag");
    // `avoid` is a prohibition the concealment guard reads and the negator
    // vocabulary does not, so this isolates the family list (since the
    // clause analysis, a `never` would be read as negation by the
    // performance guard on its own).
    const perform = scanOutputClaims([why("Avoid outperforming your last post.")]);
    expect(perform.map((f) => f.shape)).toEqual(["outperform"]);
    expect(perform[0].enforcement, "a concealment guard softened a forecast").toBe(
      "hard"
    );
    // The pattern WOULD have cleared it, had `families` said so.
    expect(
      claimContextGuard({
        family: "concealment",
        sentence: "avoid outperforming your last post.",
        matchStart: "avoid ".length,
        matchEnd: "avoid outperform".length,
      })
    ).toBe("prohibited-just-before");

    // ...and the same in the other direction: the hedge allowlist governs
    // only the performance and certainty families, so a concealment shape
    // inside an allowlisted wording is not softened by it.
    expect(
      claimContextGuard({
        family: "concealment",
        shape: "guarantee",
        sentence: "there is no guarantee.",
        matchStart: "there is no ".length,
        matchEnd: "there is no guarantee".length,
      })
    ).toBeNull();
    expect(
      claimContextGuard({
        family: "certainty",
        shape: "guarantee",
        sentence: "there is no guarantee.",
        matchStart: "there is no ".length,
        matchEnd: "there is no guarantee".length,
      })
    ).toBe("hedge-no-guarantee");
  });

  it("the directive vocabulary cannot be satisfied by the SHAPE'S OWN WORDS", () => {
    // "no need to disclose" is made of the words a disclosure directive is
    // made of, so the risk is a guard the phrase satisfies itself. TWO things
    // stop that, and BOTH are load-bearing:
    //
    //   1. THE VOCABULARY. `need to` is deliberately absent from the directive
    //      list and `still need to` is deliberately present. Asserted against
    //      the WHOLE sentence below, so it holds however the window is sliced.
    //   2. The `outside` window excludes the matched span.
    //
    // THIS COMMENT USED TO SAY (2) WAS NOT LOAD-BEARING, from a measurement
    // whose numbers were right and whose conclusion was wrong (audit R3-6): no
    // test then carried a directive word OUTSIDE the match with the guard's
    // object noun INSIDE it. The next test does, and deleting (2) turns it red.
    const directive = CLAIM_CONTEXT_GUARDS.find(
      (g) => g.id === "disclosure-directive"
    )!;
    expect(directive.pattern.test("there is no need to disclose this one.")).toBe(
      false
    );
    // NON-VACUITY: the same pattern DOES fire on a real directive.
    expect(
      directive.pattern.test(
        "there is no need to disclose sponsorship here, but you must tag ai assistance."
      )
    ).toBe(true);
    // ...and the span-excluding call agrees, on the same sentence.
    expect(
      claimContextGuard({
        family: "concealment",
        sentence: "there is no need to disclose this one.",
        matchStart: "there is ".length,
        matchEnd: "there is no need to disclose".length,
      })
    ).toBeNull();
  });
});

describe("the span exclusion is load-bearing (audit R3-6)", () => {
  // Each counterexample has a directive word OUTSIDE the match (`always`,
  // `make sure`) and the guard's object noun INSIDE it (`label`). Read whole,
  // `disclosure-directive` matches and would demote the concealment shape;
  // read with the match excluded, it refuses.
  it.each([
    ["Always skip the label on a short like this.", "skip the label"],
    ["Make sure you leave the label out.", "leave it out"],
  ])("REFUSES: %s", (sentence, shape) => {
    const found = scanOutputClaims([why(sentence)]);
    expect(found.find((f) => f.shape === shape)?.enforcement, sentence).toBe("hard");
    // ...and the whole-sentence reading the exclusion prevents WOULD clear it,
    // so this is the exclusion's witness, not a sentence nothing matched.
    const directive = CLAIM_CONTEXT_GUARDS.find((g) => g.id === "disclosure-directive")!;
    expect(directive.pattern.test(sentence.toLowerCase()), sentence).toBe(true);
  });
});

describe("the round-3 escapes and the generator's three further classes (P2-R3, P2-R4)", () => {
  it("AC3: a hedge before an em dash does not soften the claim after it", () => {
    const found = scanOutputClaims([
      why("Nothing is guaranteed — this will perform better than your last post."),
    ]);
    // R-173's endpoint rule: the sentence is not the hedge phrase, so BOTH
    // refuse — the hedge admits only a sentence that IS it.
    expect(found.find((f) => f.shape === "guarantee")?.enforcement).toBe("hard");
    expect(found.find((f) => f.shape === "will perform")?.enforcement).toBe("hard");
  });

  it("AC3: a guarded first occurrence does not hide an unguarded second", () => {
    const found = scanOutputClaims([
      why("Nothing here makes it go viral, but this hook goes viral anyway."),
    ]);
    const goesViral = found.filter((f) => f.shape === "goes viral");
    // ONE finding per shape per sentence, at the strictest enforcement.
    expect(goesViral).toHaveLength(1);
    expect(goesViral[0].enforcement).toBe("hard");
  });

  it.each([
    ["colon", "Nothing here is certain: this will perform."],
    ["bare but", "Nothing here is certain but this will perform."],
    ["spaced hyphen", "Nothing here is certain - this will perform."],
    ["en dash", "Nothing here is certain – this will perform."],
  ])("every separator ends the negated clause: %s", (_name, sentence) => {
    expect(
      scanOutputClaims([why(sentence)]).find((f) => f.shape === "will perform")?.enforcement
    ).toBe("hard");
  });

  it.each([
    "Honestly, there is no guarantee this works.",
    "To be clear, I can't guarantee it lands.",
    "In short; this isn't proven to work.",
  ])("THE ENDPOINT RULE: a lead-in makes the sentence something other than the hedge, so it refuses (free): %s", (sentence) => {
    const found = scanOutputClaims([why(sentence)]);
    expect(found.some((f) => f.enforcement === "hard"), sentence).toBe(true);
  });

  it.each([
    ["/caption/text", "There's no guarantee like this hook."],
    ["/caption/text", "No guarantee comes close to this hook."],
    ["/caption/text", "I don't guarantee results, the hook does."],
    ["/caption/text", "Nothing is guaranteed; this hook is."],
    ["/caption/text", "No guarantee, it just works every time."],
    ["/caption/text", "I can't guarantee anything less than results."],
    ["/caption/text", "Results aren't guaranteed, they're inevitable."],
    ["/caption/text", "Nothing here is guaranteed... except results."],
    ["/caption/text", "Nothing here is guaranteed! Results are."],
    ["/caption/text", "Except this hook. Nothing is guaranteed."],
  ])("THE ENDPOINT RULE (final verification): %s — %s REFUSES", (field, sentence) => {
    const found = scanOutputClaims([at(field, sentence)]);
    expect(found.find((f) => f.shape === "guarantee")?.enforcement, sentence).toBe("hard");
  });

  it.each([
    "This won't fail.",
    "It never fails.",
    "This will not miss.",
  ])("`cannot fail` widened: %s is a finding, and refuses in the explanation", (sentence) => {
    expect(scanOutputClaims([why(sentence)]).find((f) => f.shape === "cannot fail")?.enforcement, sentence).toBe("hard");
  });

  it("the closed tail list is data with no claim shape and no negator in it", () => {
    for (const tail of CLAIM_HEDGE_TAILS) {
      expect(scanOutputClaims([why("x" + tail + ".")]), JSON.stringify(tail)).toEqual([]);
      expect(tail, JSON.stringify(tail)).not.toMatch(/\b(?:not|no|never|nothing|nobody|none|without)\b|n't\b/);
    }
    expect(CLAIM_HEDGE_TAILS).toContain("");
  });
});

describe("STRICT + FREE REFUSAL (owner decision 2026-10-07, R-173): the gate's specimens", () => {
  // A hard shape refuses unless an ALLOWLISTED hedge governs it directly.
  // Everything else refuses — which is affordable because a refusal caused
  // only by this scan costs the creator nothing (`refusalIsClaimOnly`).
  it.each([
    ["/caption/text", "I can't guarantee this works for you."],
    ["/hooks/0/text", "No guarantees, just what worked for me."],
    ["/beats/0/vo", "This isn't proven to work for everyone."],
    ["/caption/text", "There's no guarantee this works."],
    ["/thesis/statement", "Nothing in this draft is guaranteed."],
    ["/whyThisPerforms/reasoning", "Results aren't guaranteed."],
    ["/caption/text", "I can\u2019t guarantee this works for you."],
  ])("ALLOWLISTED, FLAGS: %s — %s", (field, sentence) => {
    const found = scanOutputClaims([at(field, sentence)]);
    expect(found.length, sentence + " matched nothing").toBeGreaterThan(0);
    for (const f of found) expect(f.enforcement, sentence + " / " + f.shape).toBe("flag");
  });

  it.each([
    // The compliance gate's under-refusals.
    ["/caption/text", "Don't miss this guaranteed growth hack.", "guarantee"],
    ["/hooks/0/text", "Never post again without this guaranteed hook.", "guarantee"],
    ["/beats/0/vo", "No more guessing with this guaranteed method.", "guarantee"],
    ["/caption/text", "Not everyone knows this method is proven to work.", "proven to"],
    ["/hooks/0/text", "You won't believe how this is guaranteed to work.", "guarantee"],
    ["/caption/text", "Nothing but guaranteed growth.", "guarantee"],
    ["/whyThisPerforms/reasoning", "Nothing is certain-this will perform.", "will perform"],
    ["/caption/text", "Nothing beats a method that is guaranteed to work.", "guarantee"],
    ["/hooks/0/text", "Nobody talks about this and it's proven to work.", "proven to"],
    ["/whyThisPerforms/reasoning", "Nothing else matters and this hook goes viral.", "goes viral"],
    // The billing gate's over-refusals: OFF the allowlist, so they refuse —
    // free (R-173), never debited.
    ["/whyThisPerforms/reasoning", "Nothing — and I mean nothing — is guaranteed here.", "guarantee"],
    ["/whyThisPerforms/reasoning", "Nobody but you can guarantee it lands.", "guarantee"],
    ["/whyThisPerforms/reasoning", "Nothing in this draft, as written, is guaranteed.", "guarantee"],
    ["/caption/text", "Zero guarantees here.", "guarantee"],
    ["/caption/text", "Without any guarantee, this is how I shoot it.", "guarantee"],
    ["/hooks/0/text", "Is this guaranteed to work?", "guarantee"],
    ["/beats/0/vo", "If this were guaranteed to work, everyone would do it.", "guarantee"],
    ["/caption/text", "They say it's proven to work.", "proven to"],
    ["/whyThisPerforms/reasoning", "Nothing about this low-key hook will perform.", "will perform"],
    // The verification BLOCK: factive and reporting verbs are never a hedge.
    ["/whyThisPerforms/reasoning", "Nobody tells you this hook is guaranteed to work.", "guarantee"],
    ["/caption/text", "Nothing says growth like this guaranteed hook.", "guarantee"],
    ["/whyThisPerforms/reasoning", "Nothing makes it go viral faster than this hook.", "goes viral"],
    ["/caption/text", "Nothing shows this is the best-performing hook like the numbers do.", "best-performing"],
    ["/whyThisPerforms/reasoning", "Nothing here makes it go viral.", "goes viral"],
    // The verification High: an allowlisted wording negated, questioned or excepted.
    ["/caption/text", "Who says this isn't guaranteed?", "guarantee"],
    ["/caption/text", "Nothing here means the results aren't guaranteed.", "guarantee"],
    ["/caption/text", "Never not guaranteed.", "guarantee"],
    ["/caption/text", "Nothing is ever guaranteed, except this hook.", "guarantee"],
    ["/hooks/0/text", "No guarantee here?", "guarantee"],
  ])("REFUSED: %s — %s", (field, sentence, shape) => {
    const found = scanOutputClaims([at(field, sentence)]);
    expect(found.find((f) => f.shape === shape)?.enforcement, sentence).toBe("hard");
  });

  it.each([
    "It's unlikely to go viral.",
    "It is not guaranteed that this will perform.",
    "This will not outperform your last post on its own.",
    "There is no guarantee this lands.",
    "It\u2019s unlikely to go viral!",
  ])("the WEAKEST POINT flags only an EXACT admission or hedge sentence: %s", (sentence) => {
    const found = scanOutputClaims([at("/whyThisPerforms/weakestPoint", sentence)]);
    expect(found.length, sentence + " matched nothing").toBeGreaterThan(0);
    for (const f of found) expect(f.enforcement, sentence + " / " + f.shape).toBe("flag");
  });

  it.each([
    ["Results are guaranteed.", "guarantee"],
    ["This one can't miss.", "cannot fail"],
    ["Who says this isn't guaranteed?", "guarantee"],
    ["Never not guaranteed.", "guarantee"],
    ["Nothing is ever guaranteed, except this hook.", "guarantee"],
    ["Nothing is certain: this will perform.", "will perform"],
    ["It's unlikely to fail, and it will perform.", "will perform"],
    ["Nobody tells you this hook is guaranteed to work.", "guarantee"],
    ["It's unlikely this won't go viral.", "goes viral"],
    ["Honestly, it's unlikely to go viral.", "goes viral"],
    ["This might not perform as well as it will perform.", "will perform"],
  ])("...and every other weakest point with a hard shape REFUSES there (free): %s", (sentence, shape) => {
    const found = scanOutputClaims([at("/whyThisPerforms/weakestPoint", sentence)]);
    expect(found.find((f) => f.shape === shape)?.enforcement, sentence).toBe("hard");
  });

  it("EVERY allowlist entry clears its specimen, refuses its counter-specimen, and is a closed phrase list", () => {
    for (const hedge of CLAIM_HEDGE_ALLOWLIST) {
      for (const [kind, probe] of [["specimen", hedge.specimen], ["counter", hedge.counterSpecimen]] as const) {
        const mine = scanOutputClaims([why(probe.sentence)]).find((f) => f.shape === probe.shape);
        expect(mine, hedge.id + " / " + kind + ": " + probe.sentence).toBeDefined();
        expect(mine!.enforcement, hedge.id + " / " + kind).toBe(kind === "specimen" ? "flag" : "hard");
      }
      for (const phrase of hedge.phrases) {
        // Lowercase, straight apostrophes, single spaces, and ending with a
        // word of the shape it governs — so the negator governs the shape.
        expect(phrase, hedge.id).toBe(phrase.toLowerCase().replace(/\s+/g, " ").trim());
        expect(phrase, hedge.id).not.toMatch(/\u2019/);
        expect(
          hedge.shapes.some((id) => OUTPUT_CLAIM_SHAPES.find((x) => x.id === id)!.pattern.test(phrase)),
          hedge.id + ": " + phrase
        ).toBe(true);
        // No reporting or factive verb anywhere in the list (the BLOCK's class).
        expect(phrase, hedge.id).not.toMatch(/\b(?:says?|means?|makes?|shows?|tells?|suggests?|claims?|promises?)\b/);
      }
    }
  });

  it("refusalIsClaimOnly: true only when EVERY final hard rule is the claim scan's", () => {
    const killTest = (rules: string[]) => ({ outcome: "failed", finalAttempt: { hardRules: rules.map((rule) => ({ rule })) } });
    expect(refusalIsClaimOnly(killTest(["forbidden_claim"]))).toBe(true);
    expect(refusalIsClaimOnly(killTest(["forbidden_claim", "forbidden_claim"]))).toBe(true);
    expect(refusalIsClaimOnly(killTest(["forbidden_claim", "similarity"]))).toBe(false);
    expect(refusalIsClaimOnly(killTest(["invented_specific"]))).toBe(false);
    expect(refusalIsClaimOnly(killTest([]))).toBe(false);
    expect(refusalIsClaimOnly({ outcome: "passed", finalAttempt: { hardRules: [{ rule: "forbidden_claim" }] } })).toBe(false);
    expect(refusalIsClaimOnly(null)).toBe(false);
  });
});

describe("THE PER-FIELD × PER-SHAPE TABLE (P2-R2, R-168)", () => {
  // THE DECISION, PINNED. The field axis is the schema-derived pointer set
  // (`outputTextPointers`, P2-R5), never a hand list. The Phase 2 generator
  // chose these three for every presented field from its count (441 escapes
  // in 1,500 across the seven certainty/own-baseline shapes, and 0 would-refuse
  // units in the fixtures and the local stored generations); the other four
  // stayed explanation-only because its synthetic vocabulary found an ordinary
  // non-claim reading of each. Editing this list is a visible edit here.
  const EVERY_PRESENTED = ["best-performing", "proven to", "guarantee"];

  it("exactly the three R3-2 shapes refuse on every presented field", () => {
    expect(
      OUTPUT_CLAIM_SHAPES.filter((s) => s.enforcement === "hard" && s.fields === "presented").map((s) => s.id)
    ).toEqual(EVERY_PRESENTED);
    // A flag ceiling never carries a scope that means anything.
    for (const s of OUTPUT_CLAIM_SHAPES.filter((x) => x.enforcement === "flag")) {
      expect(s.fields, s.id).toBe("explanation");
      expect(claimFieldsFor(s), s.id).toEqual([]);
    }
  });

  it("the table, cell by cell, over every schema pointer", () => {
    const pointers = outputTextPointers();
    expect(pointers.length).toBeGreaterThan(20);
    for (const pointer of pointers) {
      const field = pointer.replace(/\*/g, "0");
      // The creator's own quote is presented but outside the refusal scope
      // (audit Phase 2 gate): their words, never the product's claim.
      // The weakest point is an admission field (R-173): the UNHEDGED
      // specimens below refuse there like anywhere in `whyThisPerforms`.
      const presented =
        !NOT_PRESENTED_FIELD_PREFIXES.some((x) => pointer.startsWith(x)) &&
        !/\/basis\/excerpt$/.test(pointer);
      const explanation = HARD_CLAIM_FIELD_PREFIXES.some((x) => pointer.startsWith(x));
      for (const shape of OUTPUT_CLAIM_SHAPES) {
        const expected =
          shape.enforcement === "flag"
            ? "flag"
            : explanation || (presented && EVERY_PRESENTED.includes(shape.id))
              ? "hard"
              : "flag";
        const found = scanOutputClaims([at(field, shape.specimen + ".")]).find((f) => f.shape === shape.id);
        expect(found?.enforcement, pointer + " × " + shape.id).toBe(expected);
      }
    }
  });

  it("the `/disclosure/*` row: not presented, so FLAG for every shape — stored, never rendered (R-154)", () => {
    // The concealment family keeps a live hard field (`/whyThisPerforms/`),
    // so retiring the disclosure row leaves no family with nothing to refuse.
    for (const pointer of outputTextPointers().filter((p) => p.startsWith("/disclosure/"))) {
      for (const shape of OUTPUT_CLAIM_SHAPES) {
        expect(claimRefusesOn(shape, pointer), pointer + " × " + shape.id).toBe(false);
      }
    }
    for (const family of ["performance", "certainty", "concealment"] as const) {
      expect(
        OUTPUT_CLAIM_SHAPES.some((s) => s.family === family && claimRefusesOn(s, "/whyThisPerforms/reasoning")),
        family
      ).toBe(true);
    }
  });

  it("AC4: a `guarantee` in the caption and in a hook REFUSES, and is not merely flagged", () => {
    for (const field of ["/caption/text", "/hooks/0/text", "/beats/0/vo", "/thesis/statement"]) {
      for (const sentence of [
        "Results are guaranteed.",
        "It is proven to work for this audience.",
        "Your best-performing hook shape is this one.",
      ]) {
        const found = scanOutputClaims([at(field, sentence)]);
        expect(found.some((f) => f.enforcement === "hard"), field + ": " + sentence).toBe(true);
      }
    }
  });

  it("...while the explanation-only four stay flags on a hook, where their ordinary readings live", () => {
    for (const sentence of [
      "You can't miss the switch on the left side.",
      "Want more views? Cut the first second.",
      "Try to beat your best take from yesterday.",
      "Here is how to do better than your last take.",
    ]) {
      const found = scanOutputClaims([hook(sentence)]);
      expect(found.length, sentence).toBeGreaterThan(0);
      for (const f of found) expect(f.enforcement, sentence).toBe("flag");
    }
  });
});

describe("the OWN-BASELINE half: PRD §5 metric 2 stated as fact at n = 0", () => {
  // MEASURED BEFORE THIS PASS, in `/whyThisPerforms/reasoning`: the first four
  // produced NO FINDING AT ALL — nothing refused, nothing flagged, nothing
  // shown, nothing stored — and the fifth flagged on the bare noun `views`
  // only. Three of the five shapes were ALREADY enforced on the product's
  // static copy by `tests/studio-ui.test.tsx`; one vocabulary, two enforcement
  // points, and the model-authored one was missing them (CLAUDE.md,
  // 2026-08-29).
  it.each([
    ["This beats your baseline.", "beats your baseline"],
    ["This performs better than your last three posts.", "better than your last"],
    ["It is proven to work for this audience.", "proven to"],
    ["Your best-performing hook shape is this one.", "best-performing"],
    ["This will get you more views than your last post.", "more views"],
  ])("REFUSES: %s", (sentence, shape) => {
    const found = scanOutputClaims([why(sentence)]);
    expect(found.map((f) => f.shape), sentence).toContain(shape);
    expect(found.find((f) => f.shape === shape)!.enforcement, sentence).toBe(
      "hard"
    );
  });

  it.each([
    ["the section's own label", "Here is why this performs the way it does."],
    [
      "an honest admission about the same absence",
      "Nothing here has been checked against how your own posts behaved.",
    ],
    [
      "the creator's own baseline as INPUT rather than as a result",
      "The baseline you set in the interview is what this is written against.",
    ],
    ["a claim about the draft, not about its future", "This performs the job the brief asked for."],
  ])("TRUE NEGATIVE: %s", (_name, sentence) => {
    expect(scanOutputClaims([why(sentence)]), sentence).toEqual([]);
  });

  it("the VIRALITY predicate refuses while the bare adjective still only flags", () => {
    // R20 names reach, performance AND virality. `reach` and `performance` each
    // kept a predicate shape beside their bare noun; virality took R-68's
    // demotion with no promotion to complete it, so "This hook goes viral
    // because the opening is a cost nobody expects." returned `usable`,
    // `hardRules: []` and rendered.
    const claim = scanOutputClaims([
      why("This hook goes viral because the opening is a cost nobody expects."),
    ]);
    expect(claim.find((f) => f.shape === "goes viral")!.enforcement).toBe("hard");
    expect(claim.find((f) => f.shape === "viral")!.enforcement).toBe("flag");
    expect(
      scanOutputClaims([why("This is not a viral formula.")]).map(
        (f) => f.enforcement
      )
    ).toEqual(["flag"]);
  });
});

describe("the vocabulary's STATED LIMITS are measured, not asserted", () => {
  // CLAUDE.md, 2026-07-30: a comment claiming a property is not the property.
  // `claims.ts` records that this list is a KNOWN-INCOMPLETE recall aid rather
  // than a complete control, and `KNOWN_VOCABULARY_GAPS` is that limit as data.
  // Closing one of these later turns this test red, which is the point: the
  // limit changes by a deliberate edit, never by drift.
  it("names both error directions, and neither list is empty", () => {
    const directions = new Set(KNOWN_VOCABULARY_GAPS.map((g) => g.direction));
    expect([...directions].sort()).toEqual(["false-fire", "miss"]);
    for (const gap of KNOWN_VOCABULARY_GAPS) {
      expect(gap.why.length, gap.id).toBeGreaterThan(40);
      // On a field where SOME hard shape can refuse, so "no finding" is a fact
      // about the vocabulary rather than about a field that could only ever
      // flag anyway (R-168 made that a per-shape population).
      expect(
        OUTPUT_CLAIM_SHAPES.some((s) => claimRefusesOn(s, gap.field)),
        gap.id + " is pinned on a field that cannot refuse"
      ).toBe(true);
    }
  });

  it.each(KNOWN_VOCABULARY_GAPS.map((g) => [g.id, g] as const))(
    "%s",
    (_id, gap) => {
      const hard = scanOutputClaims([at(gap.field, gap.sentence)]).filter(
        (f) => f.enforcement === "hard"
      );
      if (gap.direction === "miss") {
        expect(hard, gap.sentence + " is caught after all").toEqual([]);
      } else {
        expect(
          hard.length,
          gap.sentence + " no longer false-fires"
        ).toBeGreaterThan(0);
      }
    }
  );
});

describe("TRUE NEGATIVES: ordinary writing does not fire", () => {
  it.each([
    [
      "a hook about the craft",
      "The setting you skipped is the one your viewer notices first.",
    ],
    [
      "an honest weakest point",
      "None of these has been tested against how your own audience actually behaves.",
    ],
    [
      "real disclosure guidance",
      "Say in the description that a tool helped draft this, in your own words.",
    ],
    ["the word perform in a label", "Here is why this performs the way it does."],
    [
      "a plain instruction",
      "Tell them what it cost you before you tell them what it gave you.",
    ],
  ])("%s", (_name, text) => {
    expect(scanOutputClaims([why(text), hook(text), guidance(text)])).toEqual([]);
  });

  it("the all-sections fixture is clean", () => {
    expect(
      scanOutputClaims(outputTextUnits(EVERY_SECTION as unknown as ScriptOutput))
    ).toEqual([]);
  });
});

describe("the remedy copy", () => {
  it("names one per family and makes none of the claims it refuses", () => {
    const families: ClaimFamily[] = ["performance", "certainty", "concealment"];
    for (const family of families) {
      const remedy = claimRemedyFor(family);
      expect(remedy.length, family).toBeGreaterThan(40);
      for (const shape of OUTPUT_CLAIM_SHAPES) {
        expect(
          shape.pattern.test(remedy.toLowerCase()),
          family + " remedy trips " + shape.id + ": " + remedy
        ).toBe(false);
      }
      // ONE PREDICATE (P1-R4, applied 2026-09-21). This loop was the sixth
      // survivor the batch-5 compliance gate counted, and the only one OUTSIDE
      // `tests/` — which is why the re-invention scan, when it walked `tests/`
      // alone, could never have seen it.
      expect(claimHits(remedy, FORBIDDEN_CLAIMS), family).toEqual([]);
    }
  });

  it("the performance remedy makes no claim about the creator's history (P2-R7)", () => {
    // It read "no result of yours has been logged" — false for every creator
    // who has logged one, from a package that holds no scope and no count.
    // Phase 6 AC9 consumes this as its fourth "none logged" site.
    const remedy = claimRemedyFor("performance");
    expect(remedy).not.toMatch(/has been logged|none logged|no result of yours/i);
    expect(remedy).toContain("until a verified analytics connector exists");
    expect(remedy).not.toMatch(/\d/);
  });

  // The plant this file was recorded as owing (`PLANT_OWED`). Per ENTRY: a
  // remedy scan that goes green because one pattern matched everything is the
  // same vacuity one layer down.
  it.each(specimensFor(FORBIDDEN_CLAIMS))(
    "PLANTED: %s would be caught in a remedy sentence",
    (label, specimen) => {
      expect(claimHits(specimen, FORBIDDEN_CLAIMS)).toContain(label);
    }
  );
});
