// The fifth hard rule: REQ-I04 and REQ-I05 made DETERMINISTIC on the text a
// creator actually reads.
//
// THE DEFECT THIS FILE IS THE WITNESS FOR, measured by the compliance gate on
// the real pipeline: `whyThisPerforms.reasoning`, hook text and
// `disclosure.guidance` are rendered verbatim on `/studio`, and nothing checked
// any of them. A disclosure section reading "Most people skip the label on a
// short like this." was returned with `hardRules: []` and would have appeared
// under a **Disclosure** heading as the product's own advice. By this package's
// own R5 logic a prompt line is a BRIEF, NOT A GATE.
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
  CLAIM_CONTEXT_GUARDS,
  HARD_CLAIM_FIELD_PREFIXES,
  KNOWN_VOCABULARY_GAPS,
  OUTPUT_CLAIM_SHAPES,
  claimContextGuard,
  claimRemedyFor,
  scanOutputClaims,
  type ClaimFamily,
} from "../src/claims";
import { outputTextUnits, type ScriptOutput } from "../src/output";
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

  it("a CONCEALMENT line keeps its full strength wherever it lands", () => {
    // THIS TEST WAS NAMED FOR THE PROPERTY AND PINNED ITS ABSENCE: it asserted
    // `flag` for `/disclosure/guidance`, which is the ONLY field concealment
    // vocabulary ever lands on, so the whole family's hard half was witnessed
    // by a synthetic `whyThisPerforms` fixture and nothing else (CLAUDE.md,
    // 2026-07-30 — a comment, or a title, claiming a property is not the
    // property). Both halves are asserted now, and the guidance half is the
    // one the compliance gate measured being DISPLAYED under the product's own
    // **Disclosure** heading with `hardRules: []`.
    for (const at of [why, guidance]) {
      const found = scanOutputClaims([
        at("Most people skip the label on a short like this."),
      ]);
      expect(found.map((f) => f.shape)).toEqual(["skip the label"]);
      expect(found[0].enforcement).toBe("hard");
    }
  });

  it("a BARE METRIC NOUN is flag-only EVEN IN `whyThisPerforms`", () => {
    // MEASURED: each of these three refused end to end (`drafts: 2`), and a
    // refusal is debited. Every one of them is the product doing what REQ-I04
    // asks — naming the thing it has not checked.
    //
    // THE SHAPES ARE NAMED, NOT COUNTED, because "Nothing here makes it go
    // viral." now matches TWO of them: the bare adjective, which can only
    // flag, and `goes viral`, which is hard by shape and demoted by the
    // negated-clause guard. A count would have hidden which one softened.
    for (const [sentence, shapes] of [
      [
        "Nothing here has been checked against how your views actually behave.",
        ["views"],
      ],
      ["This is a structure, not an engagement trick.", ["engagement"]],
      ["Nothing here makes it go viral.", ["viral", "goes viral"]],
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

describe("the concealment family's LIVE PATH (REQ-I05 / S5)", () => {
  // THE BLOCK THIS SUITE MISSED. Every concealment shape is `hard` at the shape
  // level, and `/disclosure/guidance` is the only field concealment vocabulary
  // will ever land on. With `/whyThisPerforms/` as the sole hard field the
  // entire family was `flag` on its only live path, and its hard half was
  // witnessed by a `why(...)` fixture — a hard rule with no live path is the
  // vacuous witness (CLAUDE.md, 2026-08-21).
  it("the sentence the gate MEASURED being displayed is now refused", () => {
    // Measured on the real pipeline before this pass: `status: usable`,
    // `drafts: 1`, `hardRules: []`, and this text rendered under the product's
    // own **Disclosure** heading.
    const found = scanOutputClaims([
      guidance(
        "Most people skip the label on a short like this, and nobody needs to know a tool helped."
      ),
    ]);
    expect(found.map((f) => f.shape)).toEqual([
      "skip the label",
      "nobody needs to know",
    ]);
    for (const f of found) expect(f.enforcement, f.shape).toBe("hard");
  });

  it("EVERY concealment shape refuses on the field it actually lands on", () => {
    // Per shape, on `/disclosure/guidance` — not on a `whyThisPerforms`
    // fixture. One shape left `hard` in a section it can never reach is the
    // defect this whole describe exists for.
    for (const shape of OUTPUT_CLAIM_SHAPES.filter(
      (s) => s.family === "concealment"
    )) {
      const found = scanOutputClaims([guidance(shape.specimen + ".")]);
      const mine = found.find((f) => f.shape === shape.id);
      expect(mine, shape.id + ": " + shape.specimen).toBeDefined();
      expect(mine!.enforcement, shape.id).toBe("hard");
    }
  });

  it("the hard-field list names BOTH sections, and every mode emits both", () => {
    // `output.ts` requires `whyThisPerforms` and `disclosure` of every mode
    // (`assertUniversalSections`), which is what makes neither prefix a dead
    // string. Derived from the fixture's own pointers, never hand-written.
    expect([...HARD_CLAIM_FIELD_PREFIXES]).toEqual([
      "/whyThisPerforms/",
      "/disclosure/",
    ]);
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
        const field =
          guard.families[0] === "concealment"
            ? "/disclosure/guidance"
            : "/whyThisPerforms/reasoning";
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
    const found = scanOutputClaims([guidance(sentence)]);
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
  ])("...and REAL concealment advice still refuses: %s", (sentence) => {
    const found = scanOutputClaims([guidance(sentence)]);
    expect(found.some((f) => f.enforcement === "hard"), sentence).toBe(true);
  });

  it("a guard DEMOTES, it never DELETES", () => {
    // R-68's own direction, in R-68's own words: "a flagged claim is still
    // recorded and surfaced rather than silently allowed". A guard that
    // removed the finding would make a misfiring guard indistinguishable from
    // a clean sentence — and `generation-outcome.tsx` renders flag-level
    // findings, so demoting keeps the line in front of the creator.
    for (const guard of CLAIM_CONTEXT_GUARDS) {
      const field =
        guard.families[0] === "concealment"
          ? "/disclosure/guidance"
          : "/whyThisPerforms/reasoning";
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
    const conceal = scanOutputClaims([guidance("Never skip the label.")]);
    expect(conceal[0].enforcement).toBe("flag");
    const perform = scanOutputClaims([why("Never outperform your last post.")]);
    expect(perform.map((f) => f.shape)).toEqual(["outperform"]);
    expect(perform[0].enforcement, "a concealment guard softened a forecast").toBe(
      "hard"
    );
    // The pattern WOULD have cleared it, had `families` said so.
    expect(
      claimContextGuard({
        family: "concealment",
        sentence: "never outperform your last post.",
        matchStart: "never ".length,
        matchEnd: "never outperform".length,
      })
    ).toBe("prohibited-just-before");

    // ...and the same in the other direction: the negated-clause guard is for
    // the honest weakest point (`performance`, `certainty`) and does not reach
    // concealment advice.
    const hedged = scanOutputClaims([
      guidance("Nothing here says you can skip the label."),
    ]);
    expect(hedged.map((f) => f.shape)).toEqual(["skip the label"]);
    expect(hedged[0].enforcement).toBe("hard");
    expect(
      claimContextGuard({
        family: "performance",
        sentence: "nothing here says you can skip the label.",
        matchStart: "nothing here says you can ".length,
        matchEnd: "nothing here says you can skip the label".length,
      })
    ).toBe("negated-clause");
  });

  it("the directive vocabulary cannot be satisfied by the SHAPE'S OWN WORDS", () => {
    // "no need to disclose" is made of the words a disclosure directive is
    // made of, so the risk is a guard the phrase satisfies itself. TWO
    // independent things stop that, and only one of them is witnessed by a
    // mutation, which is why this test says which:
    //
    //   1. THE VOCABULARY. `need to` is deliberately absent from the directive
    //      list and `still need to` is deliberately present. Asserted against
    //      the WHOLE sentence below, so it holds however the window is sliced.
    //   2. The `outside` window excludes the matched span.
    //
    // MEASURED: with (1) in place, mutating (2) to read the whole sentence
    // leaves every test in this repo green — the two are redundant today, and
    // (2) is the one that would still hold if a shape whose own text carries
    // `must`/`should` were ever added. Recorded rather than claimed, because a
    // comment asserting a property no test can see is the defect this pass
    // spent its round on.
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
      // On a HARD field, so "no finding" is a fact about the vocabulary rather
      // than about a field that could only ever flag anyway.
      expect(
        HARD_CLAIM_FIELD_PREFIXES.some((p) => gap.field.startsWith(p)),
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
