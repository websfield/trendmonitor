// Slice 6 stage B, R5/R8: the hard integrity rules are DETERMINISTIC APPLICATION
// CODE, and every shape they claim to cover is proved against a PLANTED
// violation.
//
// WHY EVERY SHAPE IS PLANTED (CLAUDE.md, 2026-08-21). These scanners are the
// exact "guard that SCANS text" shape that fails OPEN when its pattern breaks:
// a scanner finding nothing is indistinguishable from a scanner that is not
// working. So each named shape gets a specimen that MUST match, and each gets a
// true negative that must NOT — a suite that only plants violations cannot tell
// a working detector from `() => [finding]`.
//
// No database, no network, no clock: everything here is a function from values
// to values (R2).
import { describe, expect, it } from "vitest";

import {
  ANTITHESIS_SHAPES,
  EQUAL_LENGTH_MAX_WORDS,
  FRAGMENT_MAX_WORDS,
  FRAGMENT_RUN,
  HARD_RULE_IDS,
  HOOK_MAX_WORDS,
  scanAntithesis,
  scanFragmentTriads,
  scanHookLength,
  scanTextOnlyHardRules,
} from "../src/hard-rules";
import { type TextUnit } from "../src/text";
import { SIXTEEN_WORD_HOOK } from "./support/fixtures";

const prose = (text: string, field = "beats/0/vo"): TextUnit => ({
  field,
  text,
  isHook: false,
});
const hook = (text: string, field = "hooks/0/text"): TextUnit => ({
  field,
  text,
  isHook: true,
});

describe("the rule ids are a closed set", () => {
  it("names the spec's four, the claim rule, and slice 7's five per-mode rules", () => {
    // THE FIRST FIVE are the product-wide rules: tech-spec §3 step 3's four,
    // plus `forbidden_claim` — REQ-I04 and REQ-I05 made deterministic on
    // model-authored text, which until slice 6 were enforced only by the
    // prompt (see `claims.ts`).
    //
    // THE LAST FIVE are slice 7's PER-MODE checks (`mode-checks.ts`), which a
    // mode declares in the registry rather than a scanner deciding by
    // inspection. They are hard rules for the same reason the first five are —
    // each is a property of the document no prompt can be trusted to hold —
    // and three of them are stand-ins for properties of meaning, with their
    // measured gaps recorded in `KNOWN_MODE_CHECK_GAPS`.
    //
    // THE LIST IS PINNED rather than counted so adding a rule is a visible
    // edit here: a rule id with no remedy, no sharper angle and no place in a
    // refusal is a rule a creator cannot act on.
    expect([...HARD_RULE_IDS].sort()).toEqual(
      [
        "antithesis",
        "forbidden_claim",
        "fragment_triad",
        "hook_too_long",
        "invented_specific",
        "collapsed_variants",
        "empty_weakest_point",
        "framework_not_offered",
        "idea_is_a_topic",
        "summarised_source",
      ].sort()
    );
  });
});

describe("fragment triads (R8 fixture 1)", () => {
  // The PLANTED VIOLATION M3's acceptance criterion names, verbatim in shape:
  // three consecutive one-word units.
  it("catches the planted fragment triad", () => {
    const found = scanFragmentTriads(prose("Bold. Fearless. Unstoppable."));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("fragment_triad");
    expect(found[0].excerpt).toContain("Bold");
  });

  it("catches the ANAPHORA shape too — same length, same opening word", () => {
    const found = scanFragmentTriads(prose("No fluff. No filler. No excuses."));
    expect(found).toHaveLength(1);
    expect(found[0].shape).toBe("same-opening-word");
  });

  it("names the EQUAL-LENGTH shape when the openings differ", () => {
    const found = scanFragmentTriads(prose("Bold. Fearless. Unstoppable."));
    expect(found[0].shape).toBe("equal-length-run");
  });

  it("TRUE NEGATIVE: three ordinary short sentences of DIFFERENT shapes do not fire", () => {
    // The precision case that decides whether this rule is usable: an honest
    // hook line built from three unlike sentences is not the tic, and a
    // creator refused for it paid a credit for nothing.
    expect(
      scanFragmentTriads(prose("Stop scrolling. You are wrong here. Here is why."))
    ).toEqual([]);
  });

  it("TRUE NEGATIVE: a plain CTA of three equal-length sentences", () => {
    // MEASURED: "Buy it now. Use it once. Tell me later." fired the old
    // equal-length rule — three three-word units of identical length, which is
    // a rhythm rather than the figure. Equal length is only evidence at one
    // word (`EQUAL_LENGTH_MAX_WORDS`); anaphora keeps the wider bound.
    expect(
      scanFragmentTriads(prose("Buy it now. Use it once. Tell me later."))
    ).toEqual([]);
  });

  it("TRUE NEGATIVE: three unlike two-word sentences", () => {
    // The false positive the old rule's own docblock admitted to and priced as
    // acceptable. It is not: the consequence is a rewrite the creator pays for.
    expect(scanFragmentTriads(prose("It works. I tried. She left."))).toEqual([]);
  });

  it("...and the ANAPHORA form of the same CTA still fires", () => {
    // Non-vacuity for the narrowing above: it removes a shape of evidence, not
    // the rule. A repeated opening word is the tic at any length up to the cap.
    expect(
      scanFragmentTriads(prose("Buy it now. Buy it once. Buy it later.")).map(
        (f) => f.shape
      )
    ).toEqual(["same-opening-word"]);
  });

  it("TRUE NEGATIVE: two parallel fragments are not a triad", () => {
    expect(scanFragmentTriads(prose("Bold. Fearless."))).toEqual([]);
  });

  it("TRUE NEGATIVE: long parallel sentences are not fragments", () => {
    expect(
      scanFragmentTriads(
        prose(
          "I ship one small thing every day. I write one short note every day. I read one long piece every day."
        )
      )
    ).toEqual([]);
  });

  it("does NOT join separate LINES into a triad — a hook set is not one paragraph", () => {
    // Three separate one-word hooks are three outputs, not a fragment triad
    // inside one. Scanning across the line break would refuse every hook set
    // this mode exists to produce.
    expect(scanFragmentTriads(prose("Bold.\nFearless.\nUnstoppable."))).toEqual([]);
  });

  it("the constants are the ones the rule documents", () => {
    expect(FRAGMENT_MAX_WORDS).toBe(3);
    expect(FRAGMENT_RUN).toBe(3);
    expect(EQUAL_LENGTH_MAX_WORDS).toBe(1);
  });
});

describe("antithesis constructions (R8 fixture 2)", () => {
  it("EVERY named shape has a planted specimen that fires it", () => {
    // NON-VACUITY PER SHAPE, not per rule: one broken pattern must not hide
    // behind another pattern's match (the CLAIM_SPECIMENS discipline
    // tests/support/forbidden-claims.ts already uses in this repo).
    for (const shape of ANTITHESIS_SHAPES) {
      const found = scanAntithesis(prose(shape.specimen));
      expect(found.map((f) => f.shape), shape.id).toContain(shape.id);
    }
  });

  it("catches the planted antithesis construction", () => {
    const found = scanAntithesis(prose("It's not a hack, it's a habit."));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("antithesis");
  });

  it("ONE FINDING PER LINE, even when two shapes describe the same tic", () => {
    // Both `its-not-its` and `repeated-subject-copula` match the line above
    // now that the comma is a separator for both. Two findings for one tic is
    // not a stronger signal, it is a wrong count: `honestRefusal` prints the
    // FIELD when a rule fired once and `N places` when it fired more, so the
    // refusal would have said "2 places" about one place. The most specific
    // shape is the one reported, because it is the one a creator recognises.
    expect(
      scanAntithesis(prose("It's not a hack, it's a habit.")).map((f) => f.shape)
    ).toEqual(["its-not-its"]);
    // NON-VACUITY: both patterns really do match that line, so the single
    // finding is the de-duplication rather than one dead pattern.
    for (const id of ["its-not-its", "repeated-subject-copula"]) {
      const shape = ANTITHESIS_SHAPES.find((s) => s.id === id)!;
      expect(shape.pattern.test("It's not a hack, it's a habit."), id).toBe(true);
    }
    // ...and a line carrying two DIFFERENT figures still reports once.
    expect(
      scanAntithesis(prose("Less polish, more proof. Stop guessing, start measuring.")).length
    ).toBe(1);
  });

  // ------------------------------------------------------------------
  // THE ERROR PROFILE, MEASURED. The shape these tests replaced
  // (`negated-then-its`) matched "a negated verb, then a sentence opening on
  // `it's`" — adjacency, not parallelism. The compliance gate measured both of
  // its errors on real writing, and every string below is one it named, in the
  // direction it measured.
  //
  // The cost of each direction is not symmetric, which is why both are pinned:
  // a MISS is a tic that ships, a FALSE POSITIVE is a second vendor call and,
  // twice over, a refusal the creator is charged for.
  // ------------------------------------------------------------------
  it.each([
    ["the comma form with `isn't`", "It isn't talent, it's tempo."],
    ["the spelled-out copula", "It is not a hack, it is a habit."],
    ["a repeated subject across a full stop", "That's not luck. That's reps."],
    [
      "a repeated subject AND verb",
      "You don't need a better camera. You need a better reason.",
    ],
  ])("MUST FIRE: %s", (_name, text) => {
    expect(scanAntithesis(prose(text)).map((f) => f.shape), text).not.toEqual([]);
  });

  // ------------------------------------------------------------------
  // THE PUNCTUATION AXIS. The rewrite that bound these shapes with a
  // backreference gave `its-not-its` the comma forms and gave the two
  // cross-sentence shapes only `[.!?]+`, so THE SAME TIC FIRED OR MISSED ON
  // PUNCTUATION ALONE — measured across seven subject pairs, six of seven
  // comma forms missed while all seven full-stop forms fired. A creator who
  // writes the figure with a comma is the common case, not the exotic one.
  //
  // Both spellings of each pair are asserted, so a future narrowing that
  // restores the split is a red test rather than a silent regression.
  // ------------------------------------------------------------------
  it.each([
    ["That's not luck, that's reps.", "That's not luck. That's reps."],
    ["You're not lazy, you're tired.", "You're not lazy. You're tired."],
    [
      "This isn't a shortcut, this is the work.",
      "This isn't a shortcut. This is the work.",
    ],
    [
      "They aren't lucky, they're consistent.",
      "They aren't lucky. They're consistent.",
    ],
    ["We're not guessing, we're measuring.", "We're not guessing. We're measuring."],
    [
      "You don't need a camera, you need a reason.",
      "You don't need a camera. You need a reason.",
    ],
    ["It isn't talent, it's tempo.", "It isn't talent. It's tempo."],
  ])("MUST FIRE IN BOTH PUNCTUATIONS: %s", (comma, stop) => {
    expect(scanAntithesis(prose(comma)).map((f) => f.shape), comma).not.toEqual([]);
    expect(scanAntithesis(prose(stop)).map((f) => f.shape), stop).not.toEqual([]);
  });

  it("the dash and the semicolon are the same separator", () => {
    // Named because the character class carries them and an untested member of
    // a class is an untested member of a class.
    expect(scanAntithesis(prose("That's not luck; that's reps."))).not.toEqual([]);
    expect(scanAntithesis(prose("That's not luck — that's reps."))).not.toEqual([]);
  });

  it.each([
    ["a reason for a refusal", "I don't shoot at night. It's too grainy."],
    [
      "a negation followed by an unrelated subject",
      "You can't fake this. It's the whole point of the video.",
    ],
    ["an ordinary negation", "I do not know why this one worked."],
    ["a bare `but`", "But I tried it anyway."],
    [
      "two sentences that share nothing",
      "We can't shoot it that way. The room is too small.",
    ],
  ])("MUST NOT FIRE: %s", (_name, text) => {
    expect(scanAntithesis(prose(text)).map((f) => f.shape), text).toEqual([]);
  });

  it("the REPEATED SUBJECT is what does the work, not the adjacency", () => {
    // The same two sentences, differing only in whether the subject comes back.
    // If the backreference were dropped, the second of these would fire too.
    expect(scanAntithesis(prose("It isn't talent. It's tempo.")).map((f) => f.shape)).toEqual(
      ["repeated-subject-copula"]
    );
    expect(scanAntithesis(prose("It isn't talent. That's tempo."))).toEqual([]);
  });

  it("the KNOWN MISS is stated rather than discovered", () => {
    // "This isn't a trick. It's a discipline." is structurally identical to
    // "You can't fake this. It's the whole point of the video.", which is
    // ordinary writing. Nothing computable separates them, so the pair is left
    // alone in the direction that does not charge a creator for a clean draft.
    expect(scanAntithesis(prose("This isn't a trick. It's a discipline."))).toEqual(
      []
    );
  });

  it("does not reach ACROSS a line break for the single-sentence shapes", () => {
    expect(scanAntithesis(prose("It's not a hack,\nit's a habit."))).toEqual([]);
  });

  it("does not reach across a line break for the CROSS-SENTENCE shapes either", () => {
    // `scanAntithesis` runs per line, so a hook set — several one-line outputs
    // in one field — can never be read as one antithesis.
    expect(scanAntithesis(prose("That's not luck.\nThat's reps."))).toEqual([]);
  });
});

describe("hook length (R8 fixture 4)", () => {
  it("counts sixteen words in the planted fixture", () => {
    // Pinning the fixture's own length, so the test cannot pass because the
    // word counter is broken in the same direction as the rule.
    expect(SIXTEEN_WORD_HOOK.split(/\s+/)).toHaveLength(14 + 2);
  });

  it("catches the planted 16-word hook", () => {
    const found = scanHookLength(hook(SIXTEEN_WORD_HOOK));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("hook_too_long");
    expect(found[0].excerpt).toContain("16");
  });

  it("TRUE NEGATIVE: a 14-word hook is at the limit and passes", () => {
    const fourteen = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen";
    expect(fourteen.split(/\s+/)).toHaveLength(14);
    expect(scanHookLength(hook(fourteen))).toEqual([]);
  });

  it("is INACTIVE where the unit is not a hook — a VO line may run long", () => {
    // "where the rule is active" (tech-spec §3 step 3): active on hook-bearing
    // fields, never on the script body.
    expect(scanHookLength(prose(SIXTEEN_WORD_HOOK))).toEqual([]);
  });

  it("the limit is the documented 14", () => {
    expect(HOOK_MAX_WORDS).toBe(14);
  });
});

describe("the text-only scan runs every rule over every unit", () => {
  it("collects findings from all three text-only rules at once", () => {
    const units = [
      hook(SIXTEEN_WORD_HOOK),
      prose("Bold. Fearless. Unstoppable."),
      prose("It's not a hack, it's a habit."),
    ];
    const rules = new Set(scanTextOnlyHardRules(units).map((f) => f.rule));
    expect([...rules].sort()).toEqual([
      "antithesis",
      "fragment_triad",
      "hook_too_long",
    ]);
  });

  it("does NOT decide invented_specific — that rule needs the corpus", () => {
    // R5's split: three rules are computable from the text alone; the fourth
    // is the traceability scan, which needs the creator's brain and input.
    const found = scanTextOnlyHardRules([prose("We grew 412% in March.")]);
    expect(found.map((f) => f.rule)).not.toContain("invented_specific");
  });

  it("every finding names a field and carries a remedy", () => {
    const found = scanTextOnlyHardRules([prose("Bold. Fearless. Unstoppable.")]);
    expect(found[0].field).toBe("beats/0/vo");
    expect(found[0].remedy.length).toBeGreaterThan(10);
  });
});
