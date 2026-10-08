// Slice 7 stage B: the six remaining modes, and the checks that are ON THE
// OUTPUT rather than in the prompt (card R1-R5, R18).
//
// WHAT THIS SUITE CAN AND CANNOT PROVE, said here rather than discovered later,
// because the card's population note asks for exactly this distinction:
//
//   REAL CHECKS — the registry's completeness (R1), schema validity per mode
//   (R2), framework eligibility (verification 11's "eligible framework"), and
//   the STRUCTURAL half of R5 (an idea whose thesis is not a claim).
//
//   PROXIES — R3 ("never summarises"), R4 ("hooks differ in creative thesis")
//   and R18 ("the weakest point is real"). Each is a property of MEANING and
//   each is checked by a computable stand-in: verbatim overlap with the source
//   plus the summariser's register; content-word overlap between hooks; a
//   vocabulary of sentences that name no weakness. `KNOWN_MODE_CHECK_GAPS` is
//   the measured list of what each stand-in misses, and every entry in it is
//   driven below — a gap that is pinned is a fact, a gap that is described is
//   a hope.
import { describe, expect, it } from "vitest";

import {
  GenerationAssemblyError,
  CREATIVE_RULES,
  MODE_BRIEFS,
  contractOf,
  creativeCheckContextFor,
  modeBriefText,
  type CreativeContext,
  type GenerationContext,
} from "../src/assemble";
import {
  BASIS_EXCERPT_MIN_CONTENT_WORDS,
  BASIS_EXCERPT_MIN_WORDS,
  BASIS_RELATED_MIN_CONTENT_WORDS,
  CREATIVE_FORM_MODES,
  CREATIVE_FORMS,
} from "../src/creative";
import { HARD_RULE_IDS, remedyFor, type HardRuleFinding } from "../src/hard-rules";
import { honestRefusal, runKillTest } from "../src/kill-test";
import {
  HOOK_SPREAD_MAX_OVERLAP,
  HOOK_SPREAD_MIN_CONTENT_WORDS,
  IDEA_THESIS_MIN_WORDS,
  KNOWN_MODE_CHECK_GAPS,
  MODE_CHECK_GAP_IDS,
  NAMES_NOTHING_SHAPES,
  SOURCE_RUN_WORDS,
  SUMMARY_REGISTER_SHAPES,
  WEAKEST_POINT_MIN_WORDS,
  EVENT_SHAPES,
  SHOT_HELPER_SHAPES,
  SHOT_KIT_SHAPES,
  declaredCovers,
  eventShapeIn,
  excerptIsInMaterial,
  excerptRelatesTo,
  filmingItemDeclared,
  stampServerChecks,
  eventConfirmationFor,
  CONTINUATION_SHAPE,
  EVENT_CONFIRMATION_ITEM,
  EVENT_SCAN_EXCLUDED,
  EVENT_SCAN_POPULATION,
  contentOverlap,
  sameContentWords,
  sameFlattenedText,
  scanModeChecks,
  type ModeCheckGapId,
} from "../src/mode-checks";
import {
  IMPLEMENTED_MODES,
  MODE_CHECK_IDS,
  MODE_IDS,
  MODE_SPECS,
  modeSpec,
  type ModeId,
} from "../src/modes";
import { parseScriptOutput } from "../src/output";
import { runGeneration } from "../src/pipeline";
import { CLEAN_HOOKS, asReply } from "./support/fixtures";
import {
  CAPTION_OUTPUT,
  CONTEXT_FOR,
  HONEST_RESTATING_BEAT,
  IDEATION_V2_MIXED,
  REAL_EXCERPT,
  NO_LIMITS,
  ideationV2,
  scriptV2,
  v2Context,
  FIVE_WORDINGS_OF_ONE,
  IDEAS_AS_TOPICS,
  IDEATION_OUTPUT,
  OUTPUT_FOR,
  REBUILT_SOURCE,
  SCRIPT_OUTPUT,
  SEEDED_CONTEXT,
  SOURCE_CONTEXT,
  SOURCE_TEXT,
  SUMMARISED_SOURCE,
} from "./support/mode-fixtures";

const parsed = (
  mode: ModeId,
  doc: unknown,
  context: GenerationContext = CONTEXT_FOR[mode]
) => parseScriptOutput({ text: asReply(doc), mode, contract: contractOf(context) });

const DISTANT_SPIN_REFERENCE = {
  subjectTerms: ["aquarium", "coral lighting"],
  hook: "The reef light setting I stopped using",
  structure: { beatCount: 7, turnBeat: 5 },
} as const;

/**
 * The parsed document AS THE PIPELINE GATES IT: a v2 draft carries the server's
 * structural decision on every undeclared filming resource before any check
 * runs (`stampServerChecks`, R-150 point 2).
 */
const marked = (mode: ModeId, doc: unknown, context: GenerationContext = CONTEXT_FOR[mode]) => {
  const out = parsed(mode, doc, context);
  return out.contractVersion === 2 && context.creative !== null
    ? stampServerChecks(out, context.creative.constraints)
    : out;
};

/** The same checks over the UNSTAMPED draft — the backstop if the stamp were skipped. */
const rawChecks = (
  mode: ModeId,
  doc: unknown,
  context = CONTEXT_FOR[mode]
): HardRuleFinding[] =>
  scanModeChecks({
    mode,
    output: parsed(mode, doc, context),
    input: context.input,
    frameworks: context.frameworks,
    creative: creativeCheckContextFor(context),
  });

/** Run the per-mode checks over a document, in the mode's own context. */
const checks = (
  mode: ModeId,
  doc: unknown,
  context = CONTEXT_FOR[mode]
): HardRuleFinding[] =>
  scanModeChecks({
    mode,
    output: marked(mode, doc, context),
    input: context.input,
    frameworks: context.frameworks,
    // FROM THE SAME CONTEXT, as `runKillTest` derives it (R-148): `null` for
    // every legacy context above, the creative half for a v2 one.
    creative: creativeCheckContextFor(context),
  });

const rules = (findings: readonly HardRuleFinding[]) =>
  findings.map((f) => f.rule);
const shapes = (findings: readonly HardRuleFinding[]) =>
  findings.map((f) => f.shape);

// ---------------------------------------------------------------------- R1

describe("R1: the seven modes are DATA in the registry, checks included", () => {
  it("every mode declares its checks, and every declared check is a known one", () => {
    for (const id of MODE_IDS) {
      for (const check of modeSpec(id).checks) {
        expect(MODE_CHECK_IDS, id).toContain(check);
      }
    }
  });

  it("every check the vocabulary names is declared by SOME mode", () => {
    // A check nothing declares is a scanner that never runs — the fail-open
    // shape a `Record` cannot catch on its own.
    for (const check of MODE_CHECK_IDS) {
      const declaring = MODE_IDS.filter((m) =>
        MODE_SPECS[m].checks.includes(check)
      );
      expect(declaring, check + " is declared by no mode").not.toEqual([]);
    }
  });

  it("the checks are DERIVED from what a mode's sections are, not remembered", () => {
    // CLAUDE.md 2026-08-29: state the population as a LIST and make adding to
    // it cost something. A mode that permits hooks and forgets `hook_spread`
    // would ship REQ-C04 unenforced for that mode alone, silently.
    for (const id of MODE_IDS) {
      const spec = modeSpec(id);
      const permits = (k: string) => spec.permitted.includes(k as never);
      expect(spec.checks, id + " must check its weakest point").toContain(
        "weakest_point"
      );
      if (permits("hooks") || permits("ideas")) {
        expect(spec.checks, id + " carries hooks").toContain("hook_spread");
      }
      if (permits("ideas")) {
        expect(spec.checks, id + " carries ideas").toContain(
          "ideas_not_topics"
        );
      }
      if (permits("framework") || permits("ideas")) {
        expect(spec.checks, id + " names a framework").toContain(
          "framework_eligibility"
        );
      }
    }
  });

  it("source fidelity is declared by source-to-reel and by nothing else", () => {
    expect(
      MODE_IDS.filter((m) => MODE_SPECS[m].checks.includes("source_fidelity"))
    ).toEqual(["sourceToReel"]);
  });

  it("every new rule id has a remedy and a sharper angle", () => {
    // Both are `Record<HardRuleId, …>` so a missing one is a compile error;
    // this is the runtime half — an empty string would compile.
    for (const rule of HARD_RULE_IDS) {
      expect(remedyFor(rule).length, rule).toBeGreaterThan(20);
      const refusal = honestRefusal({
        hardRules: [
          { rule, shape: "s", field: "/f", excerpt: "e", remedy: remedyFor(rule) },
        ],
        traceability: [],
        claims: [],
      });
      expect(refusal.sharperAngle.length, rule).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------- R2

describe("R2: every mode produces a schema-valid ScriptOutput (M3's criterion)", () => {
  it.each(MODE_IDS)("%s parses against its mode spec", (mode) => {
    const out = parsed(mode, OUTPUT_FOR[mode]);
    for (const key of modeSpec(mode).required) {
      expect(out[key], mode + " is missing " + key).toBeDefined();
    }
  });

  it.each(MODE_IDS)(
    "%s survives the whole pipeline against the seeded brain, first draft",
    async (mode) => {
      const run = await runGeneration({
        mode,
        context: CONTEXT_FOR[mode],
        generate: async () => asReply(OUTPUT_FOR[mode]),
        spinSimilarity: mode === "analyseAndSpin"
          ? { reference: DISTANT_SPIN_REFERENCE, configuredStrictness: 0 }
          : undefined,
      });
      if (run.status !== "usable") {
        throw new Error(
          mode +
            " was refused: " +
            run.refusal.why.join(" | ")
        );
      }
      expect(run.drafts).toBe(1);
      expect(run.killTest.outcome).toBe("passed");
      expect(run.killTest.finalAttempt.hardRules).toEqual([]);
    }
  );

  it("IMPLEMENTED_MODES names all seven reachable modes, including gated Spin", () => {
    expect([...IMPLEMENTED_MODES].sort()).toEqual([...MODE_IDS].sort());
    for (const m of IMPLEMENTED_MODES) expect(MODE_IDS).toContain(m);
  });
});

// ---------------------------------------------------------------------- R3

describe("R3: source-to-reel never summarises its source (PROXY, stated)", () => {
  it("NON-VACUITY: every register shape matches its own specimen", () => {
    // CLAUDE.md 2026-08-21: a scan reporting zero findings is otherwise
    // indistinguishable from a scan that is not working.
    for (const shape of SUMMARY_REGISTER_SHAPES) {
      expect(shape.pattern.test(shape.specimen), shape.id).toBe(true);
    }
  });

  it("catches the summariser: a verbatim run AND the summariser's register", () => {
    const found = checks("sourceToReel", SUMMARISED_SOURCE, SOURCE_CONTEXT);
    expect(rules(found)).toContain("summarised_source");
    expect(shapes(found)).toContain("verbatim-run");
    // THE REGISTER SHAPE REPORTED IS THE FIRST ONE THAT MATCHES THE LINE, and
    // one finding per field is the rule the other scanners already follow. The
    // beat that opens "here is a summary of what the piece found" carries both
    // `summary-frame` and `attributes-to-the-author`; the second is reported
    // because it matches earlier in the list, and two findings for one sentence
    // would make a refusal count places that do not exist.
    expect(shapes(found)).toContain("attributes-to-the-author");
    expect(new Set(found.map((f) => f.field)).size).toBe(found.length);
  });

  it("the REGISTER alone is enough — no verbatim run required", () => {
    // MEASURED, and it is why this case is separate: the first version of this
    // suite asserted `describes-the-source` on the fixture above and failed,
    // because that sentence ALSO carries a verbatim run and the scan reports
    // one finding per field. Register-only text is the case that isolates the
    // shape, and it is also the likelier real defect — a model that paraphrases
    // while still narrating the source.
    const narrated = {
      ...REBUILT_SOURCE,
      thesis: {
        statement:
          "In this article the writer lays out why the gap between sessions matters more than the sessions",
        why: "it lines up with what you filmed today",
      },
    };
    const found = checks("sourceToReel", narrated, SOURCE_CONTEXT);
    expect(shapes(found)).toEqual(["describes-the-source"]);
    expect(found[0].field).toBe("/thesis/statement");
  });

  it("the rebuilt document, on the SAME source, is clean", () => {
    // Non-vacuity from the other side: the check is about what the document
    // does with the source, not about the source being present.
    expect(rules(checks("sourceToReel", REBUILT_SOURCE, SOURCE_CONTEXT))).not.toContain(
      "summarised_source"
    );
  });

  it("a run of SOURCE_RUN_WORDS words fires; one word shorter does not", () => {
    const sourceWords = SOURCE_TEXT.split(/\s+/);
    const run = (n: number) => sourceWords.slice(2, 2 + n).join(" ");
    const doc = (vo: string) => ({
      ...REBUILT_SOURCE,
      beats: [
        { atSeconds: 0, vo, isTurn: false },
        { atSeconds: 6, vo: "here is the turn you can film today", isTurn: true },
      ],
      shotMap: [{ beatIndex: 0, shot: "wide handheld", note: "keep it moving" }],
    });
    expect(
      shapes(checks("sourceToReel", doc(run(SOURCE_RUN_WORDS)), SOURCE_CONTEXT))
    ).toContain("verbatim-run");
    expect(
      shapes(
        checks("sourceToReel", doc(run(SOURCE_RUN_WORDS - 1)), SOURCE_CONTEXT)
      )
    ).not.toContain("verbatim-run");
  });

  it("the check is the MODE's, not the pipeline's: idea-to-script does not run it", () => {
    // The registry decides, so a mode with no source cannot be refused for
    // repeating one. This is what makes the checks data rather than branches.
    expect(
      rules(checks("ideaToScript", SUMMARISED_SOURCE, SOURCE_CONTEXT))
    ).not.toContain("summarised_source");
  });

  it("M7: the source-to-reel BRIEF tells the model not to summarise", () => {
    // THE PROMPT HALF, and it is named as the half M7 reddens: turning this
    // brief into a summariser's brief fails here, while the check above is what
    // still fires when a model summarises anyway. Neither one is the other.
    const brief = modeBriefText("sourceToReel").toLowerCase();
    expect(brief).toContain("summarise");
    expect(brief).toMatch(/never summarise|do not summarise/);
    expect(MODE_BRIEFS.sourceToReel.instructions.length).toBeGreaterThan(2);
  });

  it("the summarising document is REFUSED end to end, with the spend named", async () => {
    const run = await runGeneration({
      mode: "sourceToReel",
      context: SOURCE_CONTEXT,
      generate: async () => asReply(SUMMARISED_SOURCE),
    });
    expect(run.status).toBe("refused");
    if (run.status !== "refused") return;
    expect(run.drafts).toBe(2);
    expect(run.refusal.why.join(" ")).toContain("summarised_source");
  });
});

// ---------------------------------------------------------------------- R4

describe("R4: hook sets span different mechanics (PROXY, stated)", () => {
  it("VERIFICATION 9: five wordings of one thesis are caught", () => {
    // The fixture LIES the way a model lies: five different `mechanic` labels,
    // five different sentences, one claim. The duplicate-label check that
    // already existed passes it, which is why this one exists.
    const out = parsed("hooks", FIVE_WORDINGS_OF_ONE);
    expect(out.hooks).toHaveLength(5);
    const found = checks("hooks", FIVE_WORDINGS_OF_ONE);
    expect(rules(found)).toContain("collapsed_variants");
    // THE WHOLE SET COLLAPSES: every hook after the first is flagged against an
    // earlier one, which is what "five wordings of one" means. One flagged pair
    // out of ten would satisfy `toContain` and would not be this fixture.
    expect(found).toHaveLength(4);
    // One finding per HOOK, never one per pair: a refusal that says "10 places"
    // about five hooks misdescribes where it fired.
    expect(new Set(found.map((f) => f.field)).size).toBe(found.length);
  });

  it("the fixture LIES REALISTICALLY: no two hooks are the same words reordered", () => {
    // MEASURED, AND IT CAUGHT A DEFECT IN THIS FIXTURE. The fourth hook was
    // originally a permutation of the first — identical content-word sets,
    // overlap 1.000 — so the set was caught by an IDENTITY rather than by the
    // threshold, and a planted mutation loosening `HOOK_SPREAD_MAX_OVERLAP` to
    // 0.95 left the test above green. The card asks for "a realistic lying
    // fixture, not a trivially-identical one"; this is the assertion that makes
    // that a fact instead of a claim.
    const texts = FIVE_WORDINGS_OF_ONE.hooks.map((h) => h.text);
    const pairs: number[] = [];
    for (let i = 0; i < texts.length; i++) {
      for (let j = 0; j < i; j++) pairs.push(contentOverlap(texts[i], texts[j]));
    }
    expect(Math.max(...pairs)).toBeLessThan(0.9);
    expect(new Set(texts).size).toBe(texts.length);
    expect(
      new Set(FIVE_WORDINGS_OF_ONE.hooks.map((h) => h.mechanic)).size
    ).toBe(texts.length);
  });

  // ------------------------------------------------------------------
  // THE ORDER-BLINDNESS FIX (spin-compliance gate, 2026-09-01). Measured in
  // BOTH directions, in this block, because a rescue that also rescued the
  // lying fixture would be the check turned off.
  // ------------------------------------------------------------------

  const REVERSALS: readonly [string, string][] = [
    ["Film less and edit more", "Edit less and film more"],
    ["Shoot more, plan less", "Plan more, shoot less"],
    [
      "Your gear is not the problem, your lighting is",
      "Your lighting is not the problem, your gear is",
    ],
  ];

  it("two hooks that assert OPPOSITE claims out of the same words are not one hook", () => {
    for (const [a, b] of REVERSALS) {
      // NON-VACUITY FIRST: without this the rescue below could be passing
      // because the pair never reached the threshold at all.
      expect(contentOverlap(a, b), `${a} / ${b}`).toBeGreaterThan(
        HOOK_SPREAD_MAX_OVERLAP
      );
      const found = checks("hooks", {
        ...CLEAN_HOOKS,
        hooks: [
          { text: a, mechanic: "one" },
          { text: b, mechanic: "two" },
          {
            text: "Nobody tells you the boring part is where the work happens",
            mechanic: "three",
          },
        ],
      });
      expect(rules(found), `${a} / ${b}`).not.toContain("collapsed_variants");
    }
  });

  it("...and the honest reversal is not refused END TO END either", async () => {
    // THE CREATOR-FACING HALF, and the shape the gate measured: before the
    // fix this was two vendor calls and `status: refused` — a debited refusal
    // telling a creator that two opposite hooks were "wordings of one idea".
    const [a, b] = REVERSALS[0];
    let calls = 0;
    const run = await runGeneration({
      mode: "hooks",
      context: SEEDED_CONTEXT,
      generate: async () => {
        calls += 1;
        return asReply({
          ...CLEAN_HOOKS,
          hooks: [
            { text: a, mechanic: "one" },
            { text: b, mechanic: "two" },
            {
              text: "Nobody tells you the boring part is where the work happens",
              mechanic: "three",
            },
          ],
        });
      },
    });
    expect(run.status).toBe("usable");
    expect(calls).toBe(1);
  });

  it("the LYING fixture is still refused — the rescue did not turn the check off", () => {
    // The other direction, run against the same code in the same commit: five
    // wordings of one thesis are caught exactly as before, because no pair of
    // them shares an identical content-word set.
    const found = checks("hooks", FIVE_WORDINGS_OF_ONE);
    expect(rules(found)).toContain("collapsed_variants");
    expect(found).toHaveLength(4);
    for (const hook of FIVE_WORDINGS_OF_ONE.hooks) {
      for (const other of FIVE_WORDINGS_OF_ONE.hooks) {
        if (hook === other) continue;
        expect(
          sameContentWords(hook.text, other.text),
          `${hook.text} / ${other.text}`
        ).toBe(false);
      }
    }
  });

  it("sameContentWords is exactly 'the measure scored 1.000'", () => {
    // The equivalence the rescue rests on, asserted rather than assumed: a
    // Jaccard of 1 over non-empty sets IS set equality, so this can only ever
    // silence a pair the threshold had already maxed out.
    for (const [a, b] of REVERSALS) {
      expect(sameContentWords(a, b)).toBe(contentOverlap(a, b) === 1);
    }
    expect(sameContentWords("Film less and edit more", "Edit more today")).toBe(
      false
    );
    // An empty content-word side is not "the same words as" anything.
    expect(sameContentWords("the and of", "the and of")).toBe(false);
  });

  // ------------------------------------------------------------------
  // THE OTHER END OF THAT FIX (spin-compliance gate round 2, 2026-09-01).
  // The rescue's predicate is SET EQUALITY, and set equality CONTAINS literal
  // duplication: three copies of one hook under three different mechanic
  // labels have identical content-word sets, so the rescue silenced them.
  // Measured on this code before `sameFlattenedText` existed — three copies of
  // "Film less and edit more" returned `status: usable`, `hardRules: []`,
  // where the same pair had been refused the day before the rescue landed.
  // ------------------------------------------------------------------

  const DUPLICATES: readonly [string, string, string][] = [
    ["byte for byte", "Film less and edit more", "Film less and edit more"],
    ["case only", "Film less and edit more", "FILM LESS AND EDIT MORE"],
    [
      "punctuation only",
      "Film less and edit more",
      "Film less, and edit more!",
    ],
  ];

  it.each(DUPLICATES)(
    "one hook written twice (%s) is one hook, and the rescue does not launder it",
    (_why, a, b) => {
      // NON-VACUITY, and it is the whole finding: `sameContentWords` is TRUE of
      // this pair, so without the identity refusal the rescue reaches its
      // `continue` and the set passes.
      expect(sameContentWords(a, b), `${a} / ${b}`).toBe(true);
      const found = checks("hooks", {
        ...CLEAN_HOOKS,
        hooks: [
          { text: a, mechanic: "one" },
          { text: b, mechanic: "two" },
          {
            text: "Nobody tells you the boring part is where the work happens",
            mechanic: "three",
          },
        ],
      });
      expect(rules(found), `${a} / ${b}`).toContain("collapsed_variants");
      expect(shapes(found), `${a} / ${b}`).toContain("identical");
    }
  );

  it("identity is decided on ALL the words, never on the content words", () => {
    // WHY `sameFlattenedText` AND NOT "the same content words in the same
    // order": "not" is a stopword, so a negation pair shares a content-word
    // SEQUENCE and is two opposite claims. Refusing on the content sequence
    // would re-open the exact false positive the rescue exists to close.
    const yes = "Your camera gear is the problem";
    const no = "Your camera gear is not the problem";
    expect(sameContentWords(yes, no)).toBe(true);
    expect(sameFlattenedText(yes, no)).toBe(false);
    expect(
      rules(
        checks("hooks", {
          ...CLEAN_HOOKS,
          hooks: [
            { text: yes, mechanic: "one" },
            { text: no, mechanic: "two" },
            {
              text: "Nobody tells you the boring part is where the work happens",
              mechanic: "three",
            },
          ],
        })
      )
    ).not.toContain("collapsed_variants");
  });

  it("a hook repeated below the comparison floor is STILL one hook", () => {
    // The floor is about an OVERLAP MEASURE having no information on short
    // text. Identity needs no measure, so it is decided before the floor —
    // otherwise "Shoot less" twice would be the same hole one length down.
    expect(
      shapes(
        checks("hooks", {
          ...CLEAN_HOOKS,
          hooks: [
            { text: "Shoot less", mechanic: "one" },
            { text: "Shoot less.", mechanic: "two" },
            {
              text: "Nobody tells you the boring part is where the work happens",
              mechanic: "three",
            },
          ],
        })
      )
    ).toContain("identical");
  });

  it("three copies of ONE hook are refused END TO END", async () => {
    // The shape the gate measured, run through the pipeline the creator's
    // request runs through: before the identity refusal this returned
    // `usable` with `hardRules: []` — the product handing back one hook three
    // times and calling it a hook set (REQ-C04).
    const text = "Film less and edit more";
    let calls = 0;
    const run = await runGeneration({
      mode: "hooks",
      context: SEEDED_CONTEXT,
      generate: async () => {
        calls += 1;
        return asReply({
          ...CLEAN_HOOKS,
          hooks: [
            { text, mechanic: "one" },
            { text, mechanic: "two" },
            { text, mechanic: "three" },
          ],
        });
      },
    });
    expect(run.status).toBe("refused");
    // The one rewrite (R6), and no third call.
    expect(calls).toBe(2);
    expect(
      run.killTest.finalAttempt.hardRules.map((f) => f.rule)
    ).toContain("collapsed_variants");
  });

  it("the clean hook set and the script fixture are NOT caught", () => {
    expect(rules(checks("hooks", CLEAN_HOOKS))).not.toContain(
      "collapsed_variants"
    );
    expect(rules(checks("ideaToScript", SCRIPT_OUTPUT))).not.toContain(
      "collapsed_variants"
    );
  });

  it("the overlap measure is the thing the threshold is set against", () => {
    const [a, b] = FIVE_WORDINGS_OF_ONE.hooks;
    expect(contentOverlap(a.text, b.text)).toBeGreaterThan(
      HOOK_SPREAD_MAX_OVERLAP
    );
    const [c, d] = CLEAN_HOOKS.hooks;
    expect(contentOverlap(c.text, d.text)).toBeLessThan(HOOK_SPREAD_MAX_OVERLAP);
  });

  it("a hook too short to compare is skipped rather than guessed at", () => {
    // Two two-word hooks share everything or nothing, and neither answers the
    // question. The floor is stated so the check's silence there is a decision.
    //
    // THE PAIR IS DIFFERENT TEXT, and it used to be "Shoot less" TWICE — which
    // asserted the floor and the duplicate hole in one fixture, so it read as
    // a decision that repeating a hook is fine below the floor. It never was:
    // identity is refused at every length (see the identity block above), and
    // what the floor decides is that two DIFFERENT short hooks are not
    // compared by an overlap measure that has no information about them.
    expect(HOOK_SPREAD_MIN_CONTENT_WORDS).toBeGreaterThanOrEqual(3);
    const tiny = {
      ...CLEAN_HOOKS,
      hooks: [
        { text: "Shoot less", mechanic: "one" },
        { text: "Plan more", mechanic: "two" },
        { text: "Nobody tells you the boring part is the work", mechanic: "three" },
      ],
    };
    expect(rules(checks("hooks", tiny))).not.toContain("collapsed_variants");
  });

  it("IDEATION gets the same check, because an idea carries a hook", () => {
    const collapsed = {
      ...IDEATION_OUTPUT,
      ideas: IDEATION_OUTPUT.ideas.map((idea, i) => ({
        ...idea,
        hook: [
          "Nobody tells you the first year of filming alone is the hardest",
          "The hardest year of filming alone is the first one nobody warns you about",
          "What nobody warns you about is the first year of filming alone",
        ][i],
      })),
    };
    const found = checks("ideation", collapsed);
    expect(rules(found)).toContain("collapsed_variants");
    expect(found.every((f) => f.field.startsWith("/ideas/"))).toBe(true);
  });
});

// ---------------------------------------------------------------------- R5

describe("R5: ideation returns ideas, never topics", () => {
  it("catches a hook repeated as its own thesis, a subject, and a question", () => {
    const found = checks("ideation", IDEAS_AS_TOPICS);
    expect(rules(found)).toContain("idea_is_a_topic");
    expect(shapes(found)).toEqual(
      expect.arrayContaining([
        "hook-repeats-thesis",
        "thesis-not-a-claim",
        "thesis-is-a-question",
      ])
    );
  });

  it("the real ideation batch is clean", () => {
    expect(checks("ideation", IDEATION_OUTPUT)).toEqual([]);
  });

  it("the word floor is what decides 'a subject, not a claim'", () => {
    expect(IDEA_THESIS_MIN_WORDS).toBeGreaterThanOrEqual(4);
    const short = {
      ...IDEATION_OUTPUT,
      ideas: IDEATION_OUTPUT.ideas.map((idea, i) =>
        i === 0 ? { ...idea, thesis: "Audio gear" } : idea
      ),
    };
    expect(shapes(checks("ideation", short))).toContain("thesis-not-a-claim");
  });
});

describe("R1/verification 11: a named framework is one the profile was OFFERED", () => {
  it("catches a framework nobody offered", () => {
    const invented = {
      ...IDEATION_OUTPUT,
      ideas: IDEATION_OUTPUT.ideas.map((idea, i) =>
        i === 1 ? { ...idea, framework: "the hero's journey" } : idea
      ),
    };
    const found = checks("ideation", invented);
    expect(rules(found)).toContain("framework_not_offered");
    expect(found[0].field).toBe("/ideas/1/framework");
  });

  it("tolerates the model decorating an offered name", () => {
    const decorated = {
      ...IDEATION_OUTPUT,
      ideas: IDEATION_OUTPUT.ideas.map((idea, i) =>
        i === 0 ? { ...idea, framework: "The Cost Reveal framework" } : idea
      ),
    };
    expect(rules(checks("ideation", decorated))).not.toContain(
      "framework_not_offered"
    );
  });

  it("checks the script modes' framework section too", () => {
    const invented = {
      ...SCRIPT_OUTPUT,
      framework: { name: "the hero's journey", why: "it felt right" },
    };
    const found = checks("footageToThesis", invented);
    expect(rules(found)).toContain("framework_not_offered");
    expect(found[0].field).toBe("/framework/name");
  });

  it("with no library offered, nothing is eligible-checked", () => {
    // THIS CASE'S REASON CHANGED IN SLICE 7 AND ITS ASSERTION DID NOT. It used
    // to be headed "STATED VACUITY" and to say "`packages/credits/src/
    // generate.ts` passes `frameworks: []` today (R-29 defers seeding the
    // shared library), so this check is DEAD until a library is offered". That
    // was true when it was written and is false now: stage C reads
    // `scope.accessors.eligibleFrameworks()` and passes the bounded set here,
    // so the check has a live path and this branch is the EXCEPTION rather than
    // every run — an unseeded server, or a profile whose eligible set is empty.
    //
    // The BEHAVIOUR it pins is unchanged and still wanted: refusing every
    // framework a model names while offering it none would refuse every script
    // generation in the product, which is a control becoming the outage.
    const invented = {
      ...SCRIPT_OUTPUT,
      framework: { name: "the hero's journey", why: "it felt right" },
    };
    const noLibrary = { ...SEEDED_CONTEXT, frameworks: [] };
    expect(rules(checks("footageToThesis", invented, noLibrary))).not.toContain(
      "framework_not_offered"
    );
  });
});

// --------------------------------------------------------------------- R18

describe("R18: the weakest point is named on EVERY mode, not just the easy two", () => {
  it("NON-VACUITY: every 'names nothing' shape matches its specimen", () => {
    for (const shape of NAMES_NOTHING_SHAPES) {
      expect(shape.pattern.test(shape.specimen), shape.id).toBe(true);
    }
  });

  it.each(MODE_IDS)(
    "%s: a weakest point that names nothing is caught, on that mode's own document",
    (mode) => {
      // WITNESSED PER MODE, on the real field (`/whyThisPerforms/weakestPoint`)
      // of the real fixture for that mode — slice 6's BLOCK was a rule pinned
      // only against a synthetic fixture, so it never landed on the field it
      // guarded.
      const doc = OUTPUT_FOR[mode] as { whyThisPerforms: unknown };
      const empty = {
        ...doc,
        whyThisPerforms: {
          ...(doc.whyThisPerforms as Record<string, string>),
          weakestPoint: "None.",
        },
      };
      const found = checks(mode, empty);
      expect(rules(found), mode).toContain("empty_weakest_point");
      expect(found.map((f) => f.field), mode).toContain(
        "/whyThisPerforms/weakestPoint"
      );
    }
  );

  it.each(MODE_IDS)("%s: the real fixture's weakest point is accepted", (mode) => {
    expect(rules(checks(mode, OUTPUT_FOR[mode])), mode).not.toContain(
      "empty_weakest_point"
    );
  });

  it("a weakest point that OPENS with 'None of this…' is not a refusal", () => {
    // The false positive this check would have shipped: the clean fixtures open
    // their weakest point with a sentence that STARTS with "None", and it is
    // the honest sentence rather than the empty one. Both real strings are
    // driven here — not a paraphrase of them — so a pattern that stopped being
    // anchored would fail against the text a creator actually receives.
    const HONEST = [
      CLEAN_HOOKS.whyThisPerforms.weakestPoint,
      "None of this has been checked against how your own audience actually behaves.",
    ];
    expect(HONEST[0]).toMatch(/^None /);
    for (const shape of NAMES_NOTHING_SHAPES) {
      for (const sentence of HONEST) {
        expect(shape.pattern.test(sentence), shape.id + " on: " + sentence).toBe(
          false
        );
      }
    }
  });

  it("catches a weakest point that just repeats the reasoning", () => {
    const doc = {
      ...CLEAN_HOOKS,
      whyThisPerforms: {
        reasoning: CLEAN_HOOKS.whyThisPerforms.reasoning,
        weakestPoint: CLEAN_HOOKS.whyThisPerforms.reasoning,
      },
    };
    expect(shapes(checks("hooks", doc))).toContain("repeats-the-reasoning");
  });

  it("catches a weakest point too short to say anything", () => {
    expect(WEAKEST_POINT_MIN_WORDS).toBeGreaterThanOrEqual(4);
    const doc = {
      ...CLEAN_HOOKS,
      whyThisPerforms: {
        ...CLEAN_HOOKS.whyThisPerforms,
        weakestPoint: "Timing, maybe",
      },
    };
    expect(shapes(checks("hooks", doc))).toContain("too-short");
  });
});

// ------------------------------------------------------------ the gate seam

describe("the mode checks reach the pipeline through the kill test (R7)", () => {
  it("runKillTest folds them into hardRules, so a revision re-runs them", () => {
    // Card R7: "a revision re-runs the kill test and the traceability scan. No
    // verdict is inherited." These checks live INSIDE `runKillTest`, so there
    // is no path that re-runs the kill test without re-running them — which is
    // the structural half stage C's wiring rests on.
    const found = runKillTest({
      output: parsed("hooks", FIVE_WORDINGS_OF_ONE),
      mode: "hooks",
      context: SEEDED_CONTEXT,
    });
    expect(rules(found.hardRules)).toContain("collapsed_variants");
  });

  it("the caption mode's document passes every gate it declares", () => {
    const found = runKillTest({
      output: parsed("caption", CAPTION_OUTPUT),
      mode: "caption",
      context: SEEDED_CONTEXT,
    });
    expect(found.hardRules).toEqual([]);
  });
});

// ------------------------------------------------------------- known limits

describe("KNOWN_MODE_CHECK_GAPS: what these stand-ins are MEASURED not to catch", () => {
  /**
   * One driver per gap, keyed by id, so a gap recorded in the source without a
   * driver here is a COMPILE ERROR rather than a paragraph nobody proved.
   */
  const DRIVERS: Record<ModeCheckGapId, () => HardRuleFinding[]> = {
    "topic-as-a-title": () =>
      checks("ideation", {
        ...IDEATION_OUTPUT,
        ideas: IDEATION_OUTPUT.ideas.map((idea, i) =>
          i === 0 ? { ...idea, thesis: "Why morning routines matter" } : idea
        ),
      }),
    "paraphrased-summary": () =>
      checks(
        "sourceToReel",
        {
          ...REBUILT_SOURCE,
          thesis: {
            statement:
              "Practice that is spread across days sticks better than practice crammed into one sitting",
            why: "the gap between sessions is where the work settles",
          },
        },
        SOURCE_CONTEXT
      ),
    "same-claim-different-words": () =>
      checks("hooks", {
        ...CLEAN_HOOKS,
        hooks: [
          { text: "The first year alone is brutal", mechanic: "one" },
          {
            text: "Nothing about your opening twelve months is gentle",
            mechanic: "two",
          },
          {
            text: "Nobody tells you the boring part is where the work happens",
            mechanic: "three",
          },
        ],
      }),
    "generic-weakest-point": () =>
      checks("hooks", {
        ...CLEAN_HOOKS,
        whyThisPerforms: {
          ...CLEAN_HOOKS.whyThisPerforms,
          weakestPoint: "Nothing here has been measured yet.",
        },
      }),
    // THE FALSE POSITIVE, and its document is an HONEST one: two hooks that
    // say the opposite thing about the same subject. A driver for this
    // direction asserts the check FIRES, because that firing is the defect.
    "reversal-reads-as-duplicate": () =>
      checks("hooks", {
        ...CLEAN_HOOKS,
        hooks: [
          {
            text: "Cheap mics sound expensive when the room is right",
            mechanic: "one",
          },
          {
            text: "Expensive mics sound cheap when the room is wrong",
            mechanic: "two",
          },
          {
            text: "Nobody tells you the boring part is where the work happens",
            mechanic: "three",
          },
        ],
      }),
    // What `sameContentWords` costs: one claim, reordered, is now silent.
    // "Edit more and film less" is "Film less and edit more" — the same
    // assignment of words to roles, unlike the reversal above.
    "permutation-of-one-claim": () =>
      checks("hooks", {
        ...CLEAN_HOOKS,
        hooks: [
          { text: "Film less and edit more today", mechanic: "one" },
          { text: "Edit more and film less today", mechanic: "two" },
          {
            text: "Nobody tells you the boring part is where the work happens",
            mechanic: "three",
          },
        ],
      }),
    // THE NON-PERMUTATION HALF OF THE SAME PREDICATE (spin-compliance gate,
    // 2026-09-02). The register said the rescue's cost "is PERMUTATIONS ONLY";
    // the predicate is SET EQUALITY, and these two hooks are neither a
    // reordering nor a copy. Hook one and hook two carry the same content
    // words in the SAME ORDER — [shoot, plan, less, today] — and differ only
    // in filler; hook two also REPEATS a pair of them, which a set discards.
    // Measured through `scanModeChecks`: overlap 1.000, findings `[]`.
    "same-set-different-filler": () =>
      checks("hooks", {
        ...CLEAN_HOOKS,
        hooks: [
          { text: "Shoot more and plan less today", mechanic: "one" },
          {
            text: "You should shoot more, and then you plan less today — shoot more",
            mechanic: "two",
          },
          {
            text: "Nobody tells you the boring part is where the work happens",
            mechanic: "three",
          },
        ],
      }),
    // R-148 (launch L1). THE QUOTE IS REAL, RELATED BY TWO WORDS, AND THE EVENT
    // IS NOT: the relatedness floor (round-1 compliance gate) now refuses an
    // invented event that shares nothing with the quote, so the residue is an
    // invented event that happens to reuse two of the quote's words.
    "real-quote-unrelated-event": () => {
      const doc = ideationV2(["personal_story_observation"]);
      doc.ideas[0] = {
        ...doc.ideas[0],
        premise: {
          ...doc.ideas[0].premise,
          whatHappens: "the lens change shatters the mirror and the whole shoot ends",
        },
      };
      // ROUND 4: an INVENTED OBJECT on a vouched verb — "burned" is the
      // quote's own, the kitchen is not.
      const loaf = "I burned the first loaf and kept filming anyway";
      const kitchen = ideationV2(["personal_story_observation"]);
      kitchen.ideas = kitchen.ideas.map((idea, i) => ({
        ...idea,
        premise: {
          ...idea.premise,
          whatHappens: "the first loaf burns while you keep filming",
          ...(i === 0 ? { interest: "I burned the whole kitchen down making the first loaf" } : {}),
          basis: { kind: "material", excerpt: loaf } as never,
        },
      }));
      return [
        ...checks("ideation", doc, v2Context("personal_story_observation")),
        ...checks(
          "ideation",
          kitchen,
          v2Context("personal_story_observation", NO_LIMITS, {}, { ...SEEDED_CONTEXT, input: loaf })
        ),
      ];
    },
    // THE FALSE POSITIVE, honest document: the creator declared "phone", the
    // concept needs a "smartphone" — the same object. In the product it is
    // MARKED [check]; the gate refuses it only when it arrives unmarked.
    "same-kit-different-name": () => {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas = doc.ideas.map((idea) => ({
        ...idea,
        filming: { ...idea.filming, location: "kitchen [check]", equipment: ["smartphone"] },
      }));
      return rawChecks(
        "ideation",
        doc,
        v2Context("explain_opinion", { ...NO_LIMITS, equipment: ["phone"] })
      );
    },
    // PRESENT-TENSE NARRATION: an invented event the past-tense shapes cannot see.
    "event-narrated-without-past-tense": () => {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas[0] = {
        ...doc.ideas[0],
        premise: {
          ...doc.ideas[0].premise,
          whatHappens: "a stranger knocks your tripod over halfway through your best take",
        },
      };
      // WHAT COVERS THIS GAP, ASSERTED (round-3 compliance gate, High): the
      // same document still carries the confirmation item.
      expect(eventConfirmationFor(marked("ideation", doc, v2Context("explain_opinion")))).toBe(
        EVENT_CONFIRMATION_ITEM
      );
      return checks("ideation", doc, v2Context("explain_opinion"));
    },
    // R-150 point 4: an OPINION in the grammar of a narrated event — refused.
    "honest-line-reads-as-event": () => {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas[0] = {
        ...doc.ideas[0],
        premise: {
          ...doc.ideas[0].premise,
          interest: "you used to need a crew for this, and now one phone is enough",
        },
      };
      return checks("ideation", doc, v2Context("explain_opinion"));
    },
    // ROUND 4: what pass (c) still lets through — an invention in NO shape
    // glued onto a restated run. The confirmation item is what covers it.
    "shared-run-carries-invention": () => {
      const script = scriptV2("explain_opinion");
      const doc = {
        ...script,
        beats: script.beats.map((b, i) =>
          i === 0 ? { ...b, vo: "today I shot the same lens change over and over and it made me famous" } : b
        ),
      };
      expect(eventConfirmationFor(marked("ideaToScript", doc, v2Context("explain_opinion")))).toBe(
        EVENT_CONFIRMATION_ITEM
      );
      return checks("ideaToScript", doc, v2Context("explain_opinion"));
    },
    // AN ANALYSIS FIELD is outside the scanned population.
    "event-in-unscanned-field": () =>
      checks(
        "ideation",
        {
          ...ideationV2(["explain_opinion"]),
          whyThisPerforms: {
            ...IDEATION_OUTPUT.whyThisPerforms,
            reasoning: "This format doubled my views last month, so it opens on the cost first.",
          },
        },
        v2Context("explain_opinion")
      ),
    // KIT IN THE NARRATIVE, solo with nothing but a phone declared.
    "kit-named-in-narrative": () => {
      const script = scriptV2("explain_opinion");
      return checks(
        "ideaToScript",
        {
          ...script,
          premise: { ...script.premise, whatHappens: "you fly the drone over the kitchen roof and land it on the bench" },
        },
        v2Context("explain_opinion", { ...NO_LIMITS, people: "solo", equipment: ["phone"], locations: ["kitchen"] })
      ).filter((f) => f.rule === "filming_outside_limits");
    },
    // A MISSPELT or run-together approved name is a different token.
    "custom-name-misspelt": () => {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas[0] = { ...doc.ideas[0], framework: "the opne loop", frameworkProvenance: "custom" as never };
      doc.ideas[1] = { ...doc.ideas[1], framework: "TheOpenLoop", frameworkProvenance: "custom" as never };
      return checks("ideation", doc, v2Context("explain_opinion"));
    },
    // ANY-ORDER CONTAINMENT refuses a name that merely uses the words.
    "custom-name-shares-approved-words": () => {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas[0] = {
        ...doc.ideas[0],
        framework: "open question, closed loop",
        frameworkProvenance: "custom" as never,
      };
      return checks("ideation", doc, v2Context("explain_opinion"));
    },
    // KIT AND HELP OUTSIDE THE MARKER LISTS, under a solo declaration.
    "shot-map-kit-not-in-list": () => {
      const script = scriptV2("explain_opinion");
      return checks(
        "ideaToScript",
        {
          ...script,
          shotMap: [
            { beatIndex: 0, shot: "film it from above on a pole camera", note: "your sister holds the phone" },
          ],
        },
        v2Context("explain_opinion", { ...NO_LIMITS, people: "solo" })
      );
    },
  };

  const missed = KNOWN_MODE_CHECK_GAPS.filter(
    (g) => g.direction === "false-negative"
  );
  const refused = KNOWN_MODE_CHECK_GAPS.filter(
    (g) => g.direction === "false-positive"
  );

  it.each(missed.map((g) => [g.id, g] as const))(
    "%s is NOT caught, and that is the measured limit",
    (id, gap) => {
      expect(DRIVERS[id](), gap.what).toEqual([]);
    }
  );

  it.each(refused.map((g) => [g.id, g] as const))(
    "%s IS caught on an honest document, and that is the measured cost",
    (id, gap) => {
      // THE OPPOSITE ASSERTION, for the opposite error. A `false-positive`
      // entry claiming a check refuses honest work is only a fact if the
      // refusal is produced here.
      expect(DRIVERS[id]().length, gap.what).toBeGreaterThan(0);
    }
  );

  it("THE REGISTER AND THE ID TUPLE ARE THE SAME SET — the direction the compile check cannot see", () => {
    // `DRIVERS` is keyed on `MODE_CHECK_GAP_IDS`, so a gap ID with no driver
    // is a compile error — the direction the source docblock states. THE
    // REVERSE WAS UNGUARDED (spin-compliance gate, 2026-09-02): deleting a
    // gap ENTRY while leaving its id in the tuple keeps the `Record` total,
    // removes that gap from the `it.each` above (which iterates the ENTRIES),
    // and leaves the vacuity case below green. MEASURED on a copy of this
    // tree: `79 passed` became `78 passed`, exit 0 — a register that silently
    // narrowed, in the file whose docblock promises it cannot.
    //
    // SET EQUALITY IN BOTH DIRECTIONS, plus uniqueness: two entries sharing
    // one id would run one gap twice and hide the other under a `Record` that
    // is still total.
    const entryIds = KNOWN_MODE_CHECK_GAPS.map((g) => g.id);
    expect(new Set(entryIds).size, "two entries share one id").toBe(
      entryIds.length
    );
    expect([...entryIds].sort()).toEqual([...MODE_CHECK_GAP_IDS].sort());
    // ...and the drivers really are the population that runs: every id in the
    // tuple has one, which is the compile rule asserted as a run.
    for (const id of MODE_CHECK_GAP_IDS) {
      expect(typeof DRIVERS[id], `${id} has no driver`).toBe("function");
    }
  });

  it("BOTH directions are represented, so neither list is vacuous", () => {
    // Without this, deleting every `false-positive` entry would leave the
    // `it.each` above with nothing to run and the suite green — a register of
    // one-sided errors reading exactly like a complete one, which is the
    // defect this direction field was added for.
    expect(missed.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
  });

  it("every recorded gap names the check it is a gap in", () => {
    for (const gap of KNOWN_MODE_CHECK_GAPS) {
      expect(MODE_CHECK_IDS, gap.id).toContain(gap.check);
    }
  });
});

// --------------------------------------------- R-148: the creative checks

describe("R-148: the creative checks are DATA on exactly the two form modes", () => {
  it("the four creative checks are declared by CREATIVE_FORM_MODES and by nothing else", () => {
    // THE DERIVATION, extended: the list of modes that take the form control is
    // the population, and a mode on it that forgot a check — or a mode off it
    // that declared one — is a red test rather than a silently unenforced form.
    const creative = [
      "creative_form",
      "premise_basis",
      "filming_limits",
      "framework_provenance",
    ] as const;
    for (const id of MODE_IDS) {
      const declared = modeSpec(id).checks;
      for (const check of creative) {
        expect(declared.includes(check), `${id} / ${check}`).toBe(
          CREATIVE_FORM_MODES.includes(id)
        );
      }
    }
    expect([...CREATIVE_FORM_MODES].sort()).toEqual(["ideaToScript", "ideation"]);
  });

  it("on a LEGACY document the creative checks have nothing to read — a v1 batch is unchanged", () => {
    expect(checks("ideation", IDEATION_OUTPUT)).toEqual([]);
    expect(checks("ideaToScript", SCRIPT_OUTPUT)).toEqual([]);
  });
});

describe("R-148: all three explicit form choices, and Choose for me", () => {
  it.each(CREATIVE_FORMS)(
    "an explicit %s concept batch in that form is clean",
    (form) => {
      expect(checks("ideation", ideationV2([form]), v2Context(form))).toEqual([]);
    }
  );

  it.each(CREATIVE_FORMS)(
    "an explicit %s script in that form, with that form's pivot, is clean",
    (form) => {
      expect(checks("ideaToScript", scriptV2(form), v2Context(form))).toEqual([]);
    }
  );

  it("Choose for me accepts each concept in ITS OWN supported form", () => {
    expect(checks("ideation", IDEATION_V2_MIXED, v2Context("auto"))).toEqual([]);
  });

  it("an EXPLICIT choice binds every concept: a mismatch is a form_mismatch at that concept's form", () => {
    const found = checks("ideation", IDEATION_V2_MIXED, v2Context("explain_opinion"));
    const mismatches = found.filter((f) => f.rule === "form_mismatch");
    // Ideas 0 and 2 are a story and a demonstration; idea 1 is the requested form.
    expect(mismatches.map((f) => f.field)).toEqual(["/ideas/0/form", "/ideas/2/form"]);
    expect(mismatches.every((f) => f.shape === "not-requested-form")).toBe(true);
  });

  it("...and binds a script too", () => {
    const found = checks(
      "ideaToScript",
      scriptV2("explain_opinion"),
      v2Context("demonstration_experiment")
    );
    expect(found.map((f) => [f.rule, f.field])).toContainEqual(["form_mismatch", "/form"]);
  });

  it("a demonstration whose pivot is marked as a turn is the wrong kind — and a story marked as a reveal too", () => {
    const demo = scriptV2("demonstration_experiment");
    const asTurn = {
      ...demo,
      beats: demo.beats.map((b) => (b.isTurn ? { ...b, pivot: "turn" } : b)),
    };
    const found = checks("ideaToScript", asTurn, v2Context("demonstration_experiment"));
    expect(found.map((f) => [f.rule, f.shape])).toEqual([["form_mismatch", "pivot-wrong-kind"]]);
    const story = scriptV2("personal_story_observation");
    const asReveal = {
      ...story,
      beats: story.beats.map((b) => (b.isTurn ? { ...b, pivot: "reveal" } : b)),
    };
    expect(
      checks("ideaToScript", asReveal, v2Context("auto")).map((f) => f.shape)
    ).toEqual(["pivot-wrong-kind"]);
  });
});

describe("R-148: an invented event or result is quoted or marked — never asserted", () => {
  const storyWith = (basis: unknown, whatHappens?: string) => {
    const doc = ideationV2(["personal_story_observation"]);
    doc.ideas = doc.ideas.map((idea) => ({
      ...idea,
      premise: {
        ...idea.premise,
        ...(whatHappens === undefined ? {} : { whatHappens }),
        basis: basis as typeof idea.premise.basis,
      },
    }));
    return doc;
  };
  const story = v2Context("personal_story_observation");
  const shapesOf = (found: readonly HardRuleFinding[]) =>
    found.filter((f) => f.rule === "unsupported_experience").map((f) => f.shape);

  it("a story quoting a line that is NOT in the creator's material is refused", () => {
    const found = checks(
      "ideation",
      storyWith({ kind: "material", excerpt: "I won the regional baking final that spring" }),
      story
    );
    expect(shapesOf(found)).toEqual([
      "excerpt-not-in-material",
      "excerpt-not-in-material",
      "excerpt-not-in-material",
    ]);
    expect(found[0].field).toBe("/ideas/0/premise/basis/excerpt");
  });

  it("the SAME quote, present in the creator's own input, is accepted — case and punctuation aside", () => {
    expect(
      shapesOf(
        checks(
          "ideation",
          storyWith({ kind: "material", excerpt: "Shot the SAME lens change, over and over!" }),
          story
        )
      )
    ).toEqual([]);
  });

  it("a quote stitched across two brain sentences is not found — each document is matched alone", () => {
    // `writes in short plain sentences` + `never hedges` are two voice lines.
    expect(
      excerptIsInMaterial("short plain sentences never hedges", SEEDED_CONTEXT.brain.voice)
    ).toBe(false);
    expect(
      excerptIsInMaterial("writes in short plain sentences", SEEDED_CONTEXT.brain.voice)
    ).toBe(true);
  });

  it("a quote too short to be a source, or one that is itself [check]ed, is refused", () => {
    expect(
      shapesOf(checks("ideation", storyWith({ kind: "material", excerpt: "the same lens" }), story))
    ).toContain("excerpt-too-short");
    expect(
      shapesOf(
        checks(
          "ideation",
          storyWith({ kind: "material", excerpt: "shot the same lens change [check]" }),
          story
        )
      )
    ).toContain("excerpt-is-unconfirmed");
    expect(BASIS_EXCERPT_MIN_WORDS).toBe(4);
    expect(BASIS_EXCERPT_MIN_CONTENT_WORDS).toBe(2);
  });

  it("an UNCONFIRMED story without a [check] where the event goes is refused; with one it passes", () => {
    const unmarked = storyWith({ kind: "unconfirmed" }, "you drop the camera into the sink");
    expect(shapesOf(checks("ideation", unmarked, story))).toEqual([
      "unconfirmed-without-check",
      "unconfirmed-without-check",
      "unconfirmed-without-check",
    ]);
    const marked = storyWith({ kind: "unconfirmed" }, "you drop the camera into the sink [check]");
    expect(shapesOf(checks("ideation", marked, story))).toEqual([]);
  });

  it("a DEMONSTRATION's unconfirmed result needs its [check] in the payoff, not elsewhere", () => {
    const doc = ideationV2(["demonstration_experiment"]);
    const resultAsserted = {
      ...doc,
      ideas: doc.ideas.map((idea) => ({
        ...idea,
        premise: { ...idea.premise, payoff: "the prepared take holds focus the whole way through" },
      })),
    };
    expect(
      checks("ideation", resultAsserted, v2Context("demonstration_experiment")).map(
        (f) => [f.shape, f.field]
      )[0]
    ).toEqual(["unconfirmed-without-check", "/ideas/0/premise/payoff"]);
  });

  it("an event form with NO basis at all is refused — and so is an EXPLANATION whose text describes an event (round-1 BLOCK)", () => {
    expect(shapesOf(checks("ideation", storyWith({ kind: "none" }), story))).toContain(
      "no-basis-for-event"
    );
    // An explanation that describes no event and no result is clean…
    expect(
      checks("ideation", ideationV2(["explain_opinion"]), v2Context("explain_opinion"))
    ).toEqual([]);
    // …and one that DOES is refused, whatever its label: the label is the
    // model's, and no model label may switch the basis rule off.
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas[0] = {
      ...doc.ideas[0],
      premise: {
        ...doc.ideas[0].premise,
        payoff: "your views doubled within a week",
      },
    };
    const found = checks("ideation", doc, v2Context("explain_opinion"));
    expect(found.map((f) => [f.rule, f.shape, f.field])).toEqual([
      ["unsupported_experience", "event-without-basis:result-claim", "/ideas/0/premise/payoff"],
    ]);
  });

  it("an explanation that CHOOSES to quote is held to the quote", () => {
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas = doc.ideas.map((idea) => ({
      ...idea,
      premise: {
        ...idea.premise,
        basis: { kind: "material" as const, excerpt: "a quote nobody ever wrote down" },
      },
    })) as unknown as typeof doc.ideas;
    expect(
      checks("ideation", doc, v2Context("explain_opinion")).map((f) => f.shape)
    ).toContain("excerpt-not-in-material");
  });

  it("a REVISION's basis corpus is the creator's own NOTE — never the scaffold or the parent draft; carried, verified excerpts count", () => {
    // `generate.ts` builds a revision's input as the note plus product text;
    // the basis corpus is built from the server-derived `creatorNote` alone.
    const parentDraft = "/ideas/0/premise/whatHappens: a stranger knocked the tripod over mid take";
    const note = "make the second one shorter";
    const scaffold =
      "This is a revision of a draft you produced earlier. What the creator asked to change:";
    const input = `${scaffold}\n${note}\n${parentDraft}`;
    const base: GenerationContext = { ...SEEDED_CONTEXT, input };
    const ctx = (over: Partial<CreativeContext> = {}) =>
      v2Context("personal_story_observation", NO_LIMITS, { creatorNote: note, ...over }, base);
    const quoting = (excerpt: string, whatHappens: string) =>
      storyWith({ kind: "material", excerpt }, whatHappens);
    // The parent draft is not quotable…
    expect(
      shapesOf(
        checks(
          "ideation",
          quoting("a stranger knocked the tripod over mid take", "a stranger knocked the tripod over"),
          ctx()
        )
      )
    ).toContain("excerpt-not-in-material");
    // …and neither is the product's own scaffold (round-1 tenancy gate, Medium).
    for (const excerpt of ["a draft you produced earlier", "what the creator asked to change"]) {
      expect(
        shapesOf(checks("ideation", quoting(excerpt, `you ${excerpt}`), ctx())),
        excerpt
      ).toContain("excerpt-not-in-material");
    }
    // What the parent's OWN gate verified travels as `carriedBasis` and counts.
    expect(
      shapesOf(
        checks(
          "ideation",
          quoting("a stranger knocked the tripod over mid take", "a stranger knocked the tripod over [check]"),
          ctx({ carriedBasis: ["a stranger knocked the tripod over mid take"] })
        )
      )
    ).toEqual([]);
    // A note that is not inside the input is refused — it is not the note the
    // prompt was built from.
    expect(() =>
      checks("ideation", ideationV2(["explain_opinion"]), ctx({ creatorNote: "words nobody sent" }))
    ).toThrow(/creator note/);
  });
});

describe("R-148: declared filming limits are binding, undeclared resources stay unknown", () => {
  const withFilming = (filming: Record<string, unknown>) => {
    const doc = ideationV2(["explain_opinion"]);
    return {
      ...doc,
      ideas: doc.ideas.map((idea) => ({ ...idea, filming: { ...idea.filming, ...filming } })),
    };
  };
  const limitsOf = (found: readonly HardRuleFinding[]) =>
    found.filter((f) => f.rule === "filming_outside_limits").map((f) => [f.shape, f.field]);

  it("solo declared refuses a concept that needs help", () => {
    const found = checks(
      "ideation",
      withFilming({ people: "with_help" }),
      v2Context("explain_opinion", { ...NO_LIMITS, people: "solo" })
    );
    expect(limitsOf(found)[0]).toEqual(["needs-help", "/ideas/0/filming/people"]);
  });

  it("a time limit is a ceiling", () => {
    const ctx = v2Context("explain_opinion", { ...NO_LIMITS, maxMinutes: 20 });
    expect(limitsOf(checks("ideation", withFilming({ minutes: 20 }), ctx))).toEqual([]);
    expect(limitsOf(checks("ideation", withFilming({ minutes: 21 }), ctx))[0]).toEqual([
      "over-time",
      "/ideas/0/filming/minutes",
    ]);
  });

  it("UNDECLARED EQUIPMENT is DECIDED by the server as structure — the model's words untouched, no rewrite — and the gate refuses it only if it arrives unstamped and unmarked", () => {
    const ctx = v2Context("explain_opinion", { ...NO_LIMITS, equipment: ["phone", "tripod"], locations: ["kitchen"] });
    // Covered items are left exactly as written and are not flagged.
    const covered = marked("ideation", withFilming({ equipment: ["your phone", "tripods"] }), ctx);
    if (covered.contractVersion !== 2) throw new Error("expected v2");
    expect(covered.ideas?.[0].filming.equipment).toEqual(["your phone", "tripods"]);
    expect(covered.serverChecks?.filming[0]).toEqual({ at: "/ideas/0", location: false, equipment: [] });
    expect(limitsOf(checks("ideation", withFilming({ equipment: ["your phone", "tripods"] }), ctx))).toEqual([]);
    // An uncovered item is FLAGGED by the server — its text is not changed —
    // so the gate has nothing to refuse…
    const light = withFilming({ equipment: ["phone", "ring light"] });
    const out = marked("ideation", light, ctx);
    if (out.contractVersion !== 2) throw new Error("expected v2");
    expect(out.ideas?.[0].filming.equipment).toEqual(["phone", "ring light"]);
    expect(out.serverChecks?.filming[0].equipment).toEqual([1]);
    expect(limitsOf(checks("ideation", light, ctx))).toEqual([]);
    // …and the BACKSTOP refuses the same item if the stamp were skipped.
    expect(limitsOf(rawChecks("ideation", light, ctx))[0]).toEqual([
      "undeclared-equipment",
      "/ideas/0/filming/equipment/1",
    ]);
    // An item the model already marked keeps its own text exactly.
    const premarked = marked("ideation", withFilming({ equipment: ["ring light [check]"] }), ctx);
    if (premarked.contractVersion !== 2) throw new Error("expected v2");
    expect(premarked.ideas?.[0].filming.equipment).toEqual(["ring light [check]"]);
    // "phone on a tripod" names TWO things and is covered only if both were declared.
    expect(declaredCovers("phone on a tripod", ["phone"])).toBe(false);
    expect(declaredCovers("phone on a tripod", ["phone on a tripod"])).toBe(true);
  });

  it("an undeclared PLACE is marked the same way", () => {
    const ctx = v2Context("explain_opinion", { ...NO_LIMITS, locations: ["kitchen", "car"] });
    const park = marked("ideation", withFilming({ location: "the park" }), ctx);
    if (park.contractVersion !== 2) throw new Error("expected v2");
    expect(park.ideas?.[0].filming.location).toBe("the park");
    expect(park.serverChecks?.filming.map((e) => e.location)).toEqual([true, true, true]);
    expect(limitsOf(rawChecks("ideation", withFilming({ location: "the park", equipment: [] }), ctx))[0]).toEqual([
      "undeclared-location",
      "/ideas/0/filming/location",
    ]);
    const kitchen = marked("ideation", withFilming({ location: "your kitchen" }), ctx);
    if (kitchen.contractVersion !== 2) throw new Error("expected v2");
    expect(kitchen.ideas?.[0].filming.location).toBe("your kitchen");
    expect(kitchen.serverChecks?.filming[0].location).toBe(false);
  });

  it("STRICT READING (R-148 point 3; R-149 item 1 as amended): with NOTHING declared, EVERY place and piece of kit is marked — an empty list covers nothing", () => {
    // The round-1 compliance gate's own measurement: nothing declared, a rented
    // rooftop studio, a drone, a motorised gimbal and two ring lights used to
    // pass with no finding and render as fact.
    const doc = withFilming({
      location: "a rented rooftop studio",
      equipment: ["drone", "motorised gimbal", "two ring lights"],
    });
    const out = marked("ideation", doc, v2Context("explain_opinion"));
    if (out.contractVersion !== 2) throw new Error("expected v2");
    expect(out.ideas?.[0].filming).toMatchObject({
      location: "a rented rooftop studio",
      equipment: ["drone", "motorised gimbal", "two ring lights"],
    });
    expect(out.serverChecks?.filming[0]).toEqual({ at: "/ideas/0", location: true, equipment: [0, 1, 2] });
    // Unmarked, the backstop refuses all four.
    expect(
      limitsOf(rawChecks("ideation", doc, v2Context("explain_opinion"))).filter(
        ([, field]) => String(field).startsWith("/ideas/0/")
      )
    ).toHaveLength(4);
    // One authority: an empty declaration covers nothing, even an item made only of grammar words.
    expect(filmingItemDeclared("here", [])).toBe(false);
    expect(filmingItemDeclared("phone", [])).toBe(false);
    expect(filmingItemDeclared("phone", ["phone"])).toBe(true);
  });

  it("declared limits bind the SHOT MAP: help under solo is refused, undeclared kit is marked", () => {
    const solo = v2Context("explain_opinion", { ...NO_LIMITS, people: "solo", equipment: ["phone"] });
    const script = scriptV2("explain_opinion");
    const needsHelp = {
      ...script,
      shotMap: [
        { beatIndex: 0, shot: "a friend holds the second camera over your shoulder", note: "keep it steady" },
      ],
    };
    expect(limitsOf(checks("ideaToScript", needsHelp, solo))).toContainEqual([
      "shot-needs-help",
      "/shotMap/0/shot",
    ]);
    const drone = {
      ...script,
      shotMap: [{ beatIndex: 0, shot: "a slow drone pass over the kitchen roof", note: "phone only for the close" }],
    };
    const out = marked("ideaToScript", drone, solo);
    expect(out.shotMap?.[0].shot).toBe("a slow drone pass over the kitchen roof");
    expect(out.shotMap?.[0].note).toBe("phone only for the close");
    if (out.contractVersion !== 2) throw new Error("expected v2");
    expect(out.serverChecks?.shotMap).toEqual([{ index: 0, shot: true, note: false }]);
    expect(limitsOf(checks("ideaToScript", drone, solo))).toEqual([]);
    expect(limitsOf(rawChecks("ideaToScript", drone, solo))).toContainEqual([
      "shot-undeclared-equipment",
      "/shotMap/0/shot",
    ]);
    // Kit the creator DID declare is left alone.
    const tripod = v2Context("explain_opinion", { ...NO_LIMITS, equipment: ["tripod"] });
    const steady = { ...script, shotMap: [{ beatIndex: 0, shot: "locked off on the tripod", note: "n" }] };
    const kept = marked("ideaToScript", steady, tripod);
    if (kept.contractVersion !== 2) throw new Error("expected v2");
    expect(kept.shotMap?.[0].shot).toBe("locked off on the tripod");
    expect(kept.serverChecks?.shotMap).toEqual([]);
  });

  it("NON-VACUITY: every shot-map marker shape matches its own specimen", () => {
    for (const shape of [...SHOT_KIT_SHAPES, ...SHOT_HELPER_SHAPES]) {
      expect(new RegExp(shape.pattern.source, shape.pattern.flags).test(shape.specimen), shape.id).toBe(true);
    }
  });
});

describe("R-148 / REQ-D02: custom structure is labelled, never promoted", () => {
  const customNamed = (name: string, provenance: "custom" | "offered" = "custom") => {
    const doc = ideationV2(["explain_opinion"]);
    return {
      ...doc,
      ideas: doc.ideas.map((idea, i) =>
        i === 0 ? { ...idea, framework: name, frameworkProvenance: provenance } : idea
      ),
    };
  };
  const ruleShapes = (found: readonly HardRuleFinding[]) =>
    found.map((f) => [f.rule, f.shape]);

  it("a custom structure with a name of its own passes, and is not held to the offered list", () => {
    expect(
      checks("ideation", customNamed("the burnt loaf arc"), v2Context("explain_opinion"))
    ).toEqual([]);
  });

  it("a custom structure CLAIMING an offered framework's name is refused", () => {
    expect(
      ruleShapes(checks("ideation", customNamed("my cost reveal twist"), v2Context("explain_opinion")))
    ).toEqual([["custom_framework_name", "custom-carries-approved-name"]]);
  });

  it("...and so is one claiming an APPROVED framework the budget did not offer", () => {
    const ctx = v2Context("explain_opinion", NO_LIMITS, {
      approvedFrameworkNames: ["slow burn"],
    });
    expect(
      ruleShapes(checks("ideation", customNamed("a slow burn for kitchens"), ctx))
    ).toEqual([["custom_framework_name", "custom-carries-approved-name"]]);
    // A whole-word match only: "slowburner" carries no approved name.
    expect(checks("ideation", customNamed("the slowburner"), ctx)).toEqual([]);
  });

  it("an OFFERED label on a name nobody offered is still refused by the eligibility check", () => {
    expect(
      ruleShapes(checks("ideation", customNamed("the burnt loaf arc", "offered"), v2Context("explain_opinion")))
    ).toEqual([["framework_not_offered", "not-in-library"]]);
  });

  it("an OFFERED label when NOTHING was offered is a false provenance claim under v2", () => {
    const ctx = v2Context("explain_opinion", NO_LIMITS, {}, { ...SEEDED_CONTEXT, frameworks: [] });
    const found = checks("ideation", ideationV2(["explain_opinion"]), ctx);
    expect(new Set(ruleShapes(found).map((r) => r.join("/")))).toEqual(
      new Set(["framework_not_offered/offered-but-none-offered"])
    );
    // ...whereas a legacy batch with no library is still left alone, as before.
    expect(
      checks("ideation", IDEATION_OUTPUT, { ...SEEDED_CONTEXT, frameworks: [] })
    ).toEqual([]);
  });
});

describe("R-148: the document's version and the request's creative half must agree", () => {
  it("a v2 document checked WITHOUT its creative context is an assembly refusal, not a pass", () => {
    const output = parseScriptOutput({
      text: asReply(IDEATION_V2_MIXED),
      mode: "ideation",
      contract: { version: 2, requestedForm: "auto" },
    });
    expect(() =>
      scanModeChecks({
        mode: "ideation",
        output,
        input: SEEDED_CONTEXT.input,
        frameworks: SEEDED_CONTEXT.frameworks,
        creative: null,
      })
    ).toThrow(GenerationAssemblyError);
  });

  it("a creative context over a LEGACY document is refused too — its form was never applied", () => {
    expect(() =>
      scanModeChecks({
        mode: "ideation",
        output: parsed("ideation", IDEATION_OUTPUT),
        input: SEEDED_CONTEXT.input,
        frameworks: SEEDED_CONTEXT.frameworks,
        creative: creativeCheckContextFor(v2Context("auto")),
      })
    ).toThrow(GenerationAssemblyError);
  });

  it("a stamped form that is not the context's form is refused", () => {
    const output = parsed("ideation", IDEATION_V2_MIXED, v2Context("auto"));
    expect(() =>
      scanModeChecks({
        mode: "ideation",
        output,
        input: SEEDED_CONTEXT.input,
        frameworks: SEEDED_CONTEXT.frameworks,
        creative: creativeCheckContextFor(v2Context("explain_opinion")),
      })
    ).toThrow(GenerationAssemblyError);
  });

  it("the creative findings reach the kill test, so a revision re-runs them (R7)", () => {
    const findings = runKillTest({
      output: parsed("ideation", IDEATION_V2_MIXED, v2Context("explain_opinion")),
      mode: "ideation",
      context: v2Context("explain_opinion"),
    });
    expect(findings.hardRules.some((f) => f.rule === "form_mismatch")).toBe(true);
  });
});

// ------------------------- round-1 compliance gate (2026-10-03): the class fix

describe("ROUND 1: no model label and no missing declaration switches an integrity rule off", () => {
  /** A batch whose FIRST concept is relabelled and carries the given premise text. */
  const relabelled = (
    form: "explain_opinion" | "personal_story_observation" | "demonstration_experiment",
    premise: Partial<Record<"whatHappens" | "interest" | "payoff", string>>,
    basis: unknown = { kind: "none" }
  ) => {
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas[0] = {
      ...doc.ideas[0],
      form: form as never,
      premise: { ...doc.ideas[0].premise, ...premise, basis: basis as never },
    };
    return doc;
  };
  /** THROUGH THE REAL GATE, as the reviewer measured it: `runKillTest` over the pipeline's marked draft. */
  const killTest = (doc: unknown, context: GenerationContext, mode: ModeId = "ideation") =>
    runKillTest({ output: marked(mode, doc, context), mode, context }).hardRules;
  const experience = (found: readonly HardRuleFinding[]) =>
    found.filter((f) => f.rule === "unsupported_experience").map((f) => [f.shape, f.field]);

  it("NON-VACUITY: every event shape matches its own specimen — and ordinary present-tense premises match none", () => {
    for (const shape of EVENT_SHAPES) {
      expect(shape.pattern.test(shape.specimen), shape.id).toBe(true);
      expect(eventShapeIn(shape.specimen), shape.id).toBe(shape.id);
    }
    for (const honest of [
      "you change the lens again and again and keep almost none of the takes",
      "you film the same shot twice, once without prep and once after a short checklist",
      "the take worth keeping comes after checking the dial",
      "you need a better reason, not a better camera",
      "we proceed one beat at a time",
      "everyone has kept going on a shoot they should have stopped",
      "here is the dial nobody checks before a lens change",
    ]) {
      expect(eventShapeIn(honest), honest).toBeNull();
    }
  });

  it("REVIEWER CASE 1: an explicit explain_opinion premise inventing a result is REFUSED", () => {
    const found = killTest(
      relabelled("explain_opinion", { payoff: "your views doubled within a week" }),
      v2Context("explain_opinion")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:result-claim", "/ideas/0/premise/payoff"],
    ]);
  });

  it("REVIEWER CASE 2: a story relabelled explain_opinion under Choose for me is REFUSED", () => {
    const found = killTest(
      relabelled("explain_opinion", { whatHappens: "I burned the first loaf on camera and kept filming anyway" }),
      v2Context("auto")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:first-person-past", "/ideas/0/premise/whatHappens"],
    ]);
  });

  it("REVIEWER CASE 3: a demonstration's OWNED result labelled explain_opinion is REFUSED — an ownerless everyday verb no longer is (R-150 point 4)", () => {
    const found = killTest(
      relabelled("explain_opinion", { payoff: "my cheap lights won every round" }),
      v2Context("auto")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:owned-result", "/ideas/0/premise/payoff"],
    ]);
    // THE NARROWING, measured: "won" with no owner is how people state an
    // opinion, and is recorded in `event-narrated-without-past-tense`.
    expect(eventShapeIn("the cheap lights won every round")).toBeNull();
  });

  it("REVIEWER CASE 4: a revision relabelling a parent's [check]ed event and dropping the [check] is REFUSED — in any tense", () => {
    const parentPassage = "you drop the camera into the sink on the first take [check]";
    const ctx = v2Context("auto", NO_LIMITS, { carriedUnconfirmed: [parentPassage] });
    const found = killTest(
      relabelled("explain_opinion", {
        whatHappens: "you drop the camera into the sink on the first take",
      }),
      ctx
    );
    expect(experience(found)).toEqual([
      ["parent-unconfirmed-unmarked", "/ideas/0/premise/whatHappens"],
    ]);
    // KEEPING the marker is fine…
    expect(
      experience(killTest(relabelled("explain_opinion", { whatHappens: parentPassage }), ctx))
    ).toEqual([]);
    // …and so is the creator's own note now carrying the fact.
    const confirmed = v2Context(
      "auto",
      NO_LIMITS,
      {
        carriedUnconfirmed: [parentPassage],
        creatorNote: "yes, I really did drop the camera into the sink on the first take",
      },
      { ...SEEDED_CONTEXT, input: "yes, I really did drop the camera into the sink on the first take" }
    );
    expect(
      experience(
        killTest(
          relabelled("explain_opinion", { whatHappens: "you drop the camera into the sink on the first take" }),
          confirmed
        )
      )
    ).toEqual([]);
  });

  it("an event in an UNCONFIRMED premise's unmarked line is refused too — the label cannot route around it", () => {
    const found = killTest(
      relabelled(
        "demonstration_experiment",
        { whatHappens: "we tried it on a cheap lens first", payoff: "it holds focus [check]" },
        { kind: "unconfirmed" }
      ),
      v2Context("auto")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:first-person-past", "/ideas/0/premise/whatHappens"],
    ]);
  });

  it("an explanation's UNCONFIRMED basis needs its [check] too — explain_opinion is no longer exempt", () => {
    const found = killTest(
      relabelled("explain_opinion", {}, { kind: "unconfirmed" }),
      v2Context("explain_opinion")
    );
    expect(experience(found)).toEqual([["unconfirmed-without-check", "/ideas/0/premise/whatHappens"]]);
  });

  it("a v2 SCRIPT's beats are read too: a narrated event in a beat is refused with no basis", () => {
    const script = scriptV2("explain_opinion");
    const narrated = {
      ...script,
      beats: script.beats.map((b, i) => (i === 0 ? { ...b, vo: "last year I lost a whole shoot to this dial" } : b)),
    };
    expect(experience(killTest(narrated, v2Context("explain_opinion"), "ideaToScript"))).toEqual([
      ["event-without-basis:first-person-past", "/beats/0/vo"],
    ]);
  });

  it("an UNCONFIRMED script premise needs [check] in a beat the creator will say, not only in the premise", () => {
    const demo = scriptV2("demonstration_experiment");
    const unmarkedBeats = {
      ...demo,
      beats: demo.beats.map((b) => ({ ...b, vo: b.vo.replace(" [check]", "") })),
    };
    expect(
      experience(killTest(unmarkedBeats, v2Context("demonstration_experiment"), "ideaToScript"))
    ).toEqual([["unconfirmed-script-beats-unmarked", "/beats"]]);
    expect(experience(killTest(demo, v2Context("demonstration_experiment"), "ideaToScript"))).toEqual([]);
  });

  it("a REAL quote about something ELSE is refused — the relatedness floor", () => {
    // The reviewer's laundering: an invented event, vouched for by a genuine but
    // unrelated line of the creator's.
    const found = killTest(
      relabelled(
        "personal_story_observation",
        { whatHappens: "a stranger knocks the tripod over halfway through your best take" },
        { kind: "material", excerpt: "kept almost none of it" }
      ),
      v2Context("personal_story_observation")
    );
    expect(experience(found)).toEqual([
      ["excerpt-unrelated", "/ideas/0/premise/basis/excerpt"],
    ]);
    expect(BASIS_RELATED_MIN_CONTENT_WORDS).toBe(2);
    expect(excerptRelatesTo("shot the same lens change over and over", "you change the lens again")).toBe(true);
    expect(excerptRelatesTo("shot the same lens change over and over", "you change the light")).toBe(false);
  });

  it("a custom name may not carry an approved name under ANY spelling — hyphens, apostrophes, plurals", () => {
    const customNamed = (name: string) => {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas[0] = { ...doc.ideas[0], framework: name, frameworkProvenance: "custom" as never };
      return doc;
    };
    for (const name of ["Open-Loop remix", "the cost-reveal twist", "Cost Reveals", "the open loop's cousin"]) {
      expect(
        killTest(customNamed(name), v2Context("explain_opinion")).map((f) => [f.rule, f.shape]),
        name
      ).toContainEqual(["custom_framework_name", "custom-carries-approved-name"]);
    }
    // …and a name of its own still passes.
    expect(killTest(customNamed("the burnt loaf arc"), v2Context("explain_opinion"))).toEqual([]);
  });

  it("the custom-name finding names only the model's own name, never the approved one it clashed with", () => {
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas[0] = { ...doc.ideas[0], framework: "my slow burn twist", frameworkProvenance: "custom" as never };
    const found = killTest(
      doc,
      v2Context("explain_opinion", NO_LIMITS, { approvedFrameworkNames: ["The Slow Burn"] })
    ).find((f) => f.rule === "custom_framework_name");
    expect(found?.excerpt).toContain("my slow burn twist");
    expect(found?.excerpt).not.toContain("The Slow Burn");
  });
});

// ------------------------- round-2 compliance gate (2026-10-03): R-150

describe("ROUND 2 (R-150 point 1): the event scan is PER LINE and NEVER GATED by a label or a basis kind", () => {
  /** THROUGH THE REAL GATE: `runKillTest` over the pipeline's stamped draft. */
  const killTest = (doc: unknown, context: GenerationContext, mode: ModeId = "ideation") =>
    runKillTest({ output: marked(mode, doc, context), mode, context }).hardRules;
  const experience = (found: readonly HardRuleFinding[]) =>
    found.filter((f) => f.rule === "unsupported_experience").map((f) => [f.shape, f.field]);
  /** A concept batch whose FIRST concept has the given form, premise text and basis. */
  const first = (
    form: "explain_opinion" | "personal_story_observation" | "demonstration_experiment",
    premise: Partial<Record<"whatHappens" | "interest" | "payoff", string>>,
    basis: unknown
  ) => {
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas[0] = {
      ...doc.ideas[0],
      form: form as never,
      premise: { ...doc.ideas[0].premise, ...premise, basis: basis as never },
    };
    return doc;
  };
  const QUOTED = { kind: "material", excerpt: REAL_EXCERPT };

  it("B1: a story with a VALID quote whose `interest` invents a hire is REFUSED at that line", () => {
    const found = killTest(
      first(
        "personal_story_observation",
        {
          whatHappens: "you change the lens again and again and keep almost none of the takes",
          interest: "I hired a second shooter for the whole weekend",
        },
        QUOTED
      ),
      v2Context("personal_story_observation")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:first-person-past", "/ideas/0/premise/interest"],
    ]);
  });

  it("B1b: a story with a VALID quote whose payoff invents a result is REFUSED", () => {
    const found = killTest(
      first(
        "personal_story_observation",
        { payoff: "the video went viral and your channel doubled" },
        QUOTED
      ),
      v2Context("personal_story_observation")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:result-claim", "/ideas/0/premise/payoff"],
    ]);
  });

  it("B2: Choose for me, labelled demonstration, a real quote on the payoff, an invented win in whatHappens — REFUSED", () => {
    const found = killTest(
      first(
        "demonstration_experiment",
        {
          whatHappens: "we won the regional award with the second take",
          payoff: "the same lens change over and over finally holds focus",
        },
        QUOTED
      ),
      v2Context("auto")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:first-person-past", "/ideas/0/premise/whatHappens"],
    ]);
  });

  it("B3: a story SCRIPT with a valid quote and a beat inventing a sale and an award — REFUSED at the beat", () => {
    const script = scriptV2("personal_story_observation");
    const found = killTest(
      {
        ...script,
        beats: script.beats.map((b, i) =>
          i === 2 ? { ...b, vo: "then I sold the footage to a studio and won an award for it" } : b
        ),
      },
      v2Context("personal_story_observation"),
      "ideaToScript"
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:first-person-past", "/beats/2/vo"],
    ]);
  });

  it("the SAME scan runs under every basis kind — material, unconfirmed and none all read the line", () => {
    const invented = { interest: "I hired a second shooter for the whole weekend" };
    for (const basis of [QUOTED, { kind: "unconfirmed" }, { kind: "none" }]) {
      const found = killTest(
        first("explain_opinion", { ...invented, payoff: "the take worth keeping comes after checking the dial [check]" }, basis),
        v2Context("auto")
      );
      expect(experience(found), JSON.stringify(basis)).toContainEqual([
        "event-without-basis:first-person-past",
        "/ideas/0/premise/interest",
      ]);
    }
  });

  it("PER LINE: a [check] on one line of a field does not cover an unmarked event on the next", () => {
    const found = killTest(
      first(
        "explain_opinion",
        { whatHappens: "I burned the first loaf [check]\nwe sold every loaf by noon" },
        { kind: "unconfirmed" }
      ),
      v2Context("auto")
    );
    expect(experience(found)).toEqual([
      ["event-without-basis:first-person-past", "/ideas/0/premise/whatHappens"],
    ]);
    // …and marking that line too clears it.
    expect(
      experience(
        killTest(
          first(
            "explain_opinion",
            { whatHappens: "I burned the first loaf [check]\nwe sold every loaf by noon [check]" },
            { kind: "unconfirmed" }
          ),
          v2Context("auto")
        )
      )
    ).toEqual([]);
  });

  it("PASS (b): a line relating to its OWN unit's verified quote passes; the same line under an unverified quote does not", () => {
    const line = { whatHappens: "I shot the lens change until the light went" };
    expect(experience(killTest(first("personal_story_observation", line, QUOTED), v2Context("auto")))).toEqual([]);
    expect(
      experience(
        killTest(
          first("personal_story_observation", line, { kind: "material", excerpt: "I shot the lens change at noon" }),
          v2Context("auto")
        )
      )
    ).toEqual([
      ["excerpt-not-in-material", "/ideas/0/premise/basis/excerpt"],
      ["event-without-basis:first-person-past", "/ideas/0/premise/whatHappens"],
    ]);
  });

  it("PASS (c) / E3: an honest beat that restates the creator's input passes — and the same beat with no such input is refused", () => {
    const script = scriptV2("explain_opinion");
    expect(script.beats[0].vo).toBe(HONEST_RESTATING_BEAT);
    expect(eventShapeIn(HONEST_RESTATING_BEAT)).toBe("first-person-past");
    expect(experience(killTest(script, v2Context("explain_opinion"), "ideaToScript"))).toEqual([]);
    const otherInput = { ...SEEDED_CONTEXT, input: "a note about lighting a small kitchen" };
    expect(
      experience(
        killTest(script, v2Context("explain_opinion", NO_LIMITS, {}, otherInput), "ideaToScript")
      )
    ).toEqual([["event-without-basis:first-person-past", "/beats/0/vo"]]);
  });

  it("E2: an unconfirmed script's [check] must sit on a beat that says the premise's event", () => {
    const demo = scriptV2("demonstration_experiment");
    const unrelatedMark = {
      ...demo,
      beats: demo.beats.map((b, i) =>
        i === 1
          ? { ...b, vo: b.vo.replace(" [check]", "") }
          : i === 2
            ? { ...b, vo: `${b.vo} [check]` }
            : b
      ),
    };
    expect(
      experience(killTest(unrelatedMark, v2Context("demonstration_experiment"), "ideaToScript"))
    ).toEqual([["unconfirmed-script-beats-unmarked", "/beats"]]);
  });

  it("every narrated field outside the premise is read too: hook, thesis, on-screen text, caption", () => {
    const script = scriptV2("explain_opinion");
    const cases: [string, unknown][] = [
      ["/hooks/0/text", { ...script, hooks: script.hooks.map((h, i) => (i === 0 ? { ...h, text: "I lost a whole shoot to this dial" } : h)) }],
      ["/thesis/statement", { ...script, thesis: { ...script.thesis, statement: "My views doubled the week I stopped reshooting" } }],
      ["/onScreenText/0/text", { ...script, onScreenText: [{ atSeconds: 1, text: "we sold out in a day" }] }],
      ["/caption/text", { ...script, caption: { ...script.caption, text: "I quit my job last year to film this" } }],
    ];
    for (const [field, doc] of cases) {
      const found = experience(killTest(doc, v2Context("explain_opinion"), "ideaToScript"));
      expect(found.map(([, f]) => f), field).toEqual([field]);
    }
  });

  it("THE POPULATION IS A LIST: every string field of a full v2 concept batch and script is scanned or excluded with a reason — and every listed field exists", () => {
    const leaves = (value: unknown, path: string): string[] => {
      if (typeof value === "string") return [path];
      if (Array.isArray(value)) return value.flatMap((v) => leaves(v, path));
      if (value !== null && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => leaves(v, path === "" ? k : `${path}.${k}`));
      }
      return [];
    };
    const ctx = v2Context("auto", { ...NO_LIMITS, equipment: ["phone"] });
    const script = marked(
      "ideaToScript",
      { ...scriptV2("personal_story_observation") },
      ctx
    );
    const batch = marked("ideation", ideationV2(["personal_story_observation"]), ctx);
    const found = new Set([...leaves(script, ""), ...leaves(batch, "")]);
    const listed = new Set<string>([...EVENT_SCAN_POPULATION, ...Object.keys(EVENT_SCAN_EXCLUDED)]);
    for (const path of found) expect(listed.has(path), `${path} is in neither list`).toBe(true);
    for (const path of listed) expect(found.has(path), `${path} is listed and no fixture carries it`).toBe(true);
    for (const path of EVENT_SCAN_POPULATION) {
      expect(path in EVENT_SCAN_EXCLUDED, `${path} is in both lists`).toBe(false);
    }
  });
});

describe("ROUND 2 (R-150 points 4 and 5): the event shapes — recall widened, false positives narrowed, every one a literal with a specimen", () => {
  it("NON-VACUITY: every shape matches its own specimen, and a context shape's context matches it too", () => {
    for (const shape of EVENT_SHAPES) {
      expect(shape.pattern.test(shape.specimen), shape.id).toBe(true);
      if (shape.context) expect(shape.context.test(shape.specimen), `${shape.id} context`).toBe(true);
      expect(eventShapeIn(shape.specimen), shape.id).toBe(shape.id);
    }
  });

  // The reviewer's eight strings. Four were quoted truncated ("…"); each
  // completion below is ours, and adds only what a past-tense line carries.
  it.each([
    ["I quit my job last year to film this full time", "base-form-past"],
    ["we put the camera down and walked away from the shoot", "base-form-past"],
    ["I hit record and the oven caught fire", "base-form-past"],
    ["I nearly gave up on the channel", "first-person-past"],
    ["we both cried when the first order shipped", "first-person-past"],
    ["I’d already filmed it twice", "contracted-pluperfect"],
    ["I set the camera on the shelf and it fell", "base-form-past"],
    ["me and my sister opened a bakery", "first-person-past"],
  ])("RECALL: '%s' is read as %s", (line, shape) => {
    expect(eventShapeIn(line)).toBe(shape);
  });

  it("RECALL reaches the gate: two of the reviewer's strings are refused through runKillTest", () => {
    for (const line of ["me and my sister opened a bakery", "I hit record and the oven caught fire"]) {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas[0] = { ...doc.ideas[0], premise: { ...doc.ideas[0].premise, whatHappens: line } };
      const found = runKillTest({
        output: marked("ideation", doc, v2Context("explain_opinion")),
        mode: "ideation",
        context: v2Context("explain_opinion"),
      }).hardRules.filter((f) => f.rule === "unsupported_experience");
      expect(found.map((f) => f.field), line).toEqual(["/ideas/0/premise/whatHappens"]);
    }
  });

  it("compound subjects both ways, and the base form needs a past word on its line", () => {
    expect(eventShapeIn("my sister and I opened a bakery")).toBe("first-person-past");
    expect(eventShapeIn("I set the camera on the shelf and press record")).toBeNull();
    expect(eventShapeIn("I put the lid on before the steam builds")).toBeNull();
  });

  it("FALSE POSITIVES NARROWED: an everyday result verb needs an owner, and the generic you of advice is not narration", () => {
    for (const honest of [
      "the cheap lights won every round",
      "it worked better than the expensive one",
      "the shot dropped out of focus halfway",
      "the setting you skipped is the one your viewer notices first",
      "the room tone you ignored is why your edit sounds cheap",
      "a setting you never checked costs more than nerves",
      "the economy grew and so did the gear budgets",
    ]) {
      expect(eventShapeIn(honest), honest).toBeNull();
    }
    for (const [owned, shape] of [
      ["my views jumped after the first post", "owned-result"],
      ["our channel grew all summer", "owned-result"],
      ["we lost the light at four", "first-person-past"],
      ["and you dropped the camera into the sink", "second-person-past"],
      ["last year you lost a whole shoot to it", "second-person-past"],
    ] as const) {
      expect(eventShapeIn(owned), owned).toBe(shape);
    }
  });

  it("the remedy says the draft names no source — never that the event is not in the creator's material", () => {
    expect(remedyFor("unsupported_experience")).toContain("names no source that says it");
    expect(remedyFor("unsupported_experience")).not.toContain("not in your own material");
  });
});

describe("ROUND 2 (R-150 point 2): the server's filming decision is STRUCTURE, so the model's text is read as written", () => {
  const C4_FILMING = {
    location: "the bakery on Elm Street",
    equipment: ["a camera rented for $400", "drone bought in 2019"],
    people: "solo" as const,
    minutes: 20,
  };
  const c4 = () => {
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas[0] = { ...doc.ideas[0], filming: C4_FILMING as never };
    return doc;
  };
  const solo = () => v2Context("explain_opinion", { ...NO_LIMITS, people: "solo" });

  it("C4: undeclared specifics in a filming plan are REPORTED by traceability exactly as if no server decision existed", () => {
    const context = solo();
    const stamped = marked("ideation", c4(), context);
    const unstamped = parsed("ideation", c4(), context);
    if (stamped.contractVersion !== 2) throw new Error("expected v2");
    // The model's words are untouched, and the decision is the structural field.
    expect(stamped.ideas?.[0].filming.location).toBe("the bakery on Elm Street");
    expect(stamped.ideas?.[0].filming.equipment).toEqual(C4_FILMING.equipment);
    expect(stamped.serverChecks?.filming[0]).toEqual({ at: "/ideas/0", location: true, equipment: [0, 1] });
    const withStamp = runKillTest({ output: stamped, mode: "ideation", context });
    const withoutStamp = runKillTest({ output: unstamped, mode: "ideation", context });
    expect(withStamp.traceability).toEqual(withoutStamp.traceability);
    const tokens = withStamp.traceability
      .filter((f) => f.field.startsWith("/ideas/0/filming/"))
      .map((f) => f.token)
      .join(" | ");
    for (const specific of ["Elm Street", "400", "2019"]) expect(tokens).toContain(specific);
    expect(withStamp.hardRules.filter((f) => f.rule === "invented_specific").length).toBe(
      withoutStamp.hardRules.filter((f) => f.rule === "invented_specific").length
    );
    expect(withStamp.hardRules.some((f) => f.rule === "invented_specific")).toBe(true);
    // …and the only difference the stamp makes is that the filming backstop is satisfied.
    expect(withStamp.hardRules.filter((f) => f.rule === "filming_outside_limits")).toEqual([]);
    expect(withoutStamp.hardRules.some((f) => f.rule === "filming_outside_limits")).toBe(true);
  });

  it("the stamp NEVER writes the marker into the model's text, anywhere in the document", () => {
    const context = v2Context("explain_opinion");
    const script = scriptV2("explain_opinion");
    const doc = {
      ...script,
      shotMap: [{ beatIndex: 0, shot: "a slow drone pass over the kitchen roof", note: "gimbal for the close" }],
    };
    const out = marked("ideaToScript", doc, context);
    if (out.contractVersion !== 2) throw new Error("expected v2");
    const { serverChecks, ...rest } = out;
    expect(JSON.stringify(rest)).not.toContain("[check]");
    expect(serverChecks).toEqual({
      filming: [{ at: "", location: true, equipment: [0] }],
      shotMap: [{ index: 0, shot: true, note: true }],
    });
  });
});

describe("ROUND 3 (R-150 point 3): the confirmation item is on EVERY version-2 output — no condition a reply can influence", () => {
  it("is the server's sentence, word for word, and reads right for a demonstration still to be filmed", () => {
    expect(EVENT_CONFIRMATION_ITEM).toBe(
      "Before you film: confirm every event and result here really happened (or will be filmed as shown), or mark it [check]."
    );
  });

  // THE REGISTER'S OWN EXAMPLE and the reviewer's beats: each passes the gate
  // (they are the recorded recall gap), and each still carries the item.
  const REGISTER_EXAMPLE = "a stranger knocks your tripod over halfway through your best take";
  const REVIEWER_BEATS = [
    "my neighbour knocked the light over in the middle of the take",
    "I swam out to the buoy with the camera in a bag",
    "I quit my job to do this",
  ];

  it.each([["explain_opinion"], ["auto"]] as const)(
    "the register example under %s: usable in ONE call with no finding — and the item is there",
    async (formChoice) => {
      const doc = ideationV2(["explain_opinion"]);
      doc.ideas[0] = { ...doc.ideas[0], premise: { ...doc.ideas[0].premise, whatHappens: REGISTER_EXAMPLE } };
      let calls = 0;
      const run = await runGeneration({
        mode: "ideation",
        context: v2Context(formChoice),
        generate: async () => {
          calls += 1;
          return asReply(doc);
        },
      });
      expect(calls).toBe(1);
      if (run.status !== "usable") throw new Error("expected usable");
      expect(run.killTest.finalAttempt.hardRules).toEqual([]);
      expect(eventConfirmationFor(run.output)).toBe(EVENT_CONFIRMATION_ITEM);
    }
  );

  it.each(REVIEWER_BEATS)("a script beat '%s' passes the gate and still carries the item", async (vo) => {
    const script = scriptV2("explain_opinion");
    const doc = { ...script, beats: script.beats.map((b, i) => (i === 2 ? { ...b, vo } : b)) };
    const run = await runGeneration({
      mode: "ideaToScript",
      context: v2Context("auto"),
      generate: async () => asReply(doc),
    });
    if (run.status !== "usable") throw new Error("expected usable");
    expect(run.killTest.finalAttempt.hardRules).toEqual([]);
    expect(eventConfirmationFor(run.output)).toBe(EVENT_CONFIRMATION_ITEM);
  });

  it("an honest explanation that narrates nothing, with no basis, carries it too — and a legacy output never does", () => {
    const out = marked("ideation", ideationV2(["explain_opinion"]), v2Context("explain_opinion"));
    expect(eventConfirmationFor(out)).toBe(EVENT_CONFIRMATION_ITEM);
    expect(eventConfirmationFor(parsed("ideation", IDEATION_OUTPUT))).toBeNull();
  });

  it("its only input is the server-stamped version: the form and basis a reply writes cannot remove it", () => {
    for (const forms of [
      ["explain_opinion"],
      ["personal_story_observation"],
      ["demonstration_experiment"],
    ] as const) {
      const out = marked("ideation", ideationV2(forms), v2Context("auto"));
      expect(eventConfirmationFor(out), forms[0]).toBe(EVENT_CONFIRMATION_ITEM);
    }
  });
});

describe("ROUND 3: every match is judged on its own clause, inside the creator's own words", () => {
  const killTest = (doc: unknown, context: GenerationContext, mode: ModeId = "ideation") =>
    runKillTest({ output: marked(mode, doc, context), mode, context }).hardRules;
  const experience = (found: readonly HardRuleFinding[]) =>
    found.filter((f) => f.rule === "unsupported_experience").map((f) => [f.shape, f.field]);
  const withBeat = (vo: string) => {
    const script = scriptV2("explain_opinion");
    return { ...script, beats: script.beats.map((b, i) => (i === 2 ? { ...b, vo } : b)) };
  };
  const story = (premise: Partial<Record<"whatHappens" | "interest" | "payoff", string>>) => {
    const doc = ideationV2(["personal_story_observation"]);
    doc.ideas[0] = { ...doc.ideas[0], premise: { ...doc.ideas[0].premise, ...premise } };
    return doc;
  };

  it("PASS (a) ADJACENCY: a [check] in another sentence, or another clause, covers nothing", () => {
    expect(
      experience(
        killTest(
          withBeat("the dial [check]. I sold the footage to a studio and won an award for it"),
          v2Context("explain_opinion"),
          "ideaToScript"
        )
      )
    ).toEqual([["event-without-basis:first-person-past", "/beats/2/vo"]]);
    expect(
      experience(
        killTest(
          withBeat("I quit my job [check] and my channel tripled within a month"),
          v2Context("explain_opinion"),
          "ideaToScript"
        )
      )
    ).toEqual([["event-without-basis:result-claim", "/beats/2/vo"]]);
    // Each clause marked: clean.
    expect(
      experience(
        killTest(
          withBeat("I quit my job [check] and my channel tripled within a month [check]"),
          v2Context("explain_opinion"),
          "ideaToScript"
        )
      )
    ).toEqual([]);
  });

  it("PASS (b): a real quote never vouches for a verb or a result that is not in it", () => {
    const story_ = v2Context("personal_story_observation");
    for (const line of [
      "the lens change I shot over and over went viral",
      "we made a fortune from the same lens change",
      "the same lens change shot over and over doubled my views",
    ]) {
      expect(experience(killTest(story({ interest: line }), story_)), line).toEqual([
        [expect.stringMatching(/^event-without-basis:/), "/ideas/0/premise/interest"],
      ]);
    }
    // NON-VACUITY: the quote's own verb, in a clause about it, still passes.
    expect(experience(killTest(story({ interest: "I shot the lens change until the light went" }), story_))).toEqual([]);
  });

  it("PASS (c): only a match INSIDE the creator's own run passes — input, brain and declared-limit runs alike", () => {
    // From the input: the restatement passes, the award glued onto it does not.
    expect(
      experience(
        killTest(
          withBeat("today I shot the same lens change over and over and I won an award for it"),
          v2Context("explain_opinion"),
          "ideaToScript"
        )
      )
    ).toEqual([["event-without-basis:first-person-past", "/beats/2/vo"]]);
    expect(
      experience(
        killTest(
          withBeat("today I shot the same lens change over and over and it went viral"),
          v2Context("explain_opinion"),
          "ideaToScript"
        )
      )
    ).toEqual([["event-without-basis:result-claim", "/beats/2/vo"]]);
    // From the brain.
    const brainRun: GenerationContext = {
      ...SEEDED_CONTEXT,
      brain: { ...SEEDED_CONTEXT.brain, strategy: ["last year my channel grew slowly"] },
    };
    expect(
      experience(killTest(withBeat("last year my channel tripled"), v2Context("explain_opinion", NO_LIMITS, {}, brainRun), "ideaToScript"))
    ).toEqual([["event-without-basis:result-claim", "/beats/2/vo"]]);
    expect(
      experience(killTest(withBeat("last year my channel grew slowly"), v2Context("explain_opinion", NO_LIMITS, {}, brainRun), "ideaToScript"))
    ).toEqual([]);
    // From a declared limit.
    const declared = v2Context("explain_opinion", { ...NO_LIMITS, locations: ["the bakery on main street"] });
    expect(
      experience(killTest(withBeat("the first batch sold out at the bakery on main street"), declared, "ideaToScript"))
    ).toEqual([["event-without-basis:result-claim", "/beats/2/vo"]]);
  });

  it("DISPLAYED FREE TEXT is read by the same rule: a shot note and a hook mechanic", () => {
    const script = scriptV2("explain_opinion");
    const note = {
      ...script,
      shotMap: [{ beatIndex: 0, shot: "close on the dial", note: "hold up the trophy I won at the festival for this clip" }],
    };
    expect(experience(killTest(note, v2Context("explain_opinion"), "ideaToScript"))).toEqual([
      ["event-without-basis:first-person-past", "/shotMap/0/note"],
    ]);
    const mechanic = {
      ...script,
      hooks: script.hooks.map((h, i) => (i === 0 ? { ...h, mechanic: "the award I won with this hook" } : h)),
    };
    expect(experience(killTest(mechanic, v2Context("explain_opinion"), "ideaToScript"))).toEqual([
      ["event-without-basis:first-person-past", "/hooks/0/mechanic"],
    ]);
  });

  it("the prompt says viewer-addressed past tense and 'we've all' lines count, and offers no 'share two words' route", () => {
    const rules = CREATIVE_RULES.join("\n");
    expect(rules).toContain('Lines that speak to the viewer in the past tense ("you dropped the camera") and "we\'ve all…" lines count as events too');
    expect(rules).not.toMatch(/share at least \d+ meaning words with the quoted excerpt/);
    // …and the two examples it names really are read as events.
    expect(eventShapeIn("you dropped the camera")).not.toBeNull();
    expect(eventShapeIn("we've all been there")).not.toBeNull();
  });

  it("the stamp marks shot-map kit PER FIELD: kit named only in the note flags the note", () => {
    const script = scriptV2("explain_opinion");
    const out = marked(
      "ideaToScript",
      { ...script, shotMap: [{ beatIndex: 0, shot: "close on the dial", note: "steady it on the gimbal" }] },
      v2Context("explain_opinion")
    );
    if (out.contractVersion !== 2) throw new Error("expected v2");
    expect(out.serverChecks?.shotMap).toEqual([{ index: 0, shot: false, note: true }]);
  });
});

describe("ROUND 2: a custom name may not carry an approved name — connectors, run-together and suffix forms", () => {
  const approved = v2Context("explain_opinion", NO_LIMITS, {
    approvedFrameworkNames: ["Before and After", "The Confession Arc"],
  });
  const customNamed = (name: string) => {
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas[0] = { ...doc.ideas[0], framework: name, frameworkProvenance: "custom" as never };
    return doc;
  };
  it.each(["Before & After", "Before/After", "OpenLoop", "Cost Revealed", "The Confessional Arc", "Loop, Open"])(
    "'%s' is REFUSED",
    (name) => {
      expect(
        runKillTest({
          output: marked("ideation", customNamed(name), approved),
          mode: "ideation",
          context: approved,
        }).hardRules.map((f) => [f.rule, f.shape])
      ).toContainEqual(["custom_framework_name", "custom-carries-approved-name"]);
    }
  );

  it("…and a name of its own, including one that merely contains an approved name's letters, still passes", () => {
    for (const name of ["the burnt loaf arc", "the slowburner", "after hours"]) {
      expect(checks("ideation", customNamed(name), approved), name).toEqual([]);
    }
  });
});

// ------------------------- round-4 compliance gate (2026-10-03): the classes

describe("ROUND 4: mark ownership is by POSITION — one [check] can never satisfy two events", () => {
  const killTest = (doc: unknown, context: GenerationContext, mode: ModeId = "ideation") =>
    runKillTest({ output: marked(mode, doc, context), mode, context }).hardRules;
  const experience = (found: readonly HardRuleFinding[]) =>
    found.filter((f) => f.rule === "unsupported_experience").map((f) => [f.shape, f.field]);
  const beat = (vo: string, context: GenerationContext = v2Context("explain_opinion")) => {
    const script = scriptV2("explain_opinion");
    return experience(
      killTest({ ...script, beats: script.beats.map((b, i) => (i === 2 ? { ...b, vo } : b)) }, context, "ideaToScript")
    );
  };

  // The reviewer's joiners, each with ONE mark (refused) and with one mark per
  // event (clean). "I quit" is read because "tripled" says it is past.
  it.each([
    ["comma", "I quit my job [check], my channel tripled", "I quit my job [check], my channel tripled [check]"],
    ["spaced em dash", "I quit my job [check] — my channel tripled", "I quit my job [check] — my channel tripled [check]"],
    ["glued —and", "I quit my job [check]—and my channel tripled", "I quit my job [check]—and my channel tripled [check]"],
    ["glued —", "I quit my job [check]—my channel tripled", "I quit my job [check]—my channel tripled [check]"],
    [",and", "I quit my job [check],and my channel tripled", "I quit my job [check],and my channel tripled [check]"],
    [", yet", "I quit my job [check], yet my channel tripled", "I quit my job [check], yet my channel tripled [check]"],
    ["plus", "I quit my job [check] plus my channel tripled", "I quit my job [check] plus my channel tripled [check]"],
    ["&", "I quit my job [check] & my channel tripled", "I quit my job [check] & my channel tripled [check]"],
    [", though", "I quit my job [check], though my channel tripled", "I quit my job [check], though my channel tripled [check]"],
    ["or", "I quit my job [check] or my channel tripled", "I quit my job [check] or my channel tripled [check]"],
    ["parenthesis", "I quit my job [check] (my channel tripled)", "I quit my job [check] (my channel tripled [check])"],
    ["leading When", "When I quit my job [check], my channel tripled", "When I quit my job [check], my channel tripled [check]"],
  ])("%s: one mark covers only the event before it", (_joiner, oneMark, eachMarked) => {
    expect(beat(oneMark), oneMark).toEqual([["event-without-basis:result-claim", "/beats/2/vo"]]);
    expect(beat(eachMarked), eachMarked).toEqual([]);
  });

  it("a mark belongs to the event BEFORE it: the second event's mark does not reach back to the first", () => {
    expect(beat("I quit my job, my channel tripled [check]")).toEqual([
      ["event-without-basis:base-form-past", "/beats/2/vo"],
    ]);
  });

  it("the prompt says one [check] marks only the event before it, whatever joins the next", () => {
    expect(CREATIVE_RULES.join("\n")).toContain('Each "[check]" marks only the event just before it');
  });

  it("a span never runs past its own sentence: a mark after the full stop covers nothing before it", () => {
    expect(beat("I won the regional final. [check]")).toEqual([
      ["event-without-basis:first-person-past", "/beats/2/vo"],
    ]);
    expect(beat("I won the regional final [check].")).toEqual([]);
  });
});

describe("ROUND 4: a coordinated past verb shares its subject and is its own event (CONTINUATION_SHAPE)", () => {
  const killTest = (doc: unknown, context: GenerationContext, mode: ModeId = "ideation") =>
    runKillTest({ output: marked(mode, doc, context), mode, context }).hardRules;
  const experience = (found: readonly HardRuleFinding[]) =>
    found.filter((f) => f.rule === "unsupported_experience").map((f) => [f.shape, f.field]);
  const beat = (vo: string, context: GenerationContext = v2Context("explain_opinion")) => {
    const script = scriptV2("explain_opinion");
    return experience(
      killTest({ ...script, beats: script.beats.map((b, i) => (i === 2 ? { ...b, vo } : b)) }, context, "ideaToScript")
    );
  };

  it("NON-VACUITY: the literal matches its specimen, and the specimen is refused as a continuation", () => {
    expect(CONTINUATION_SHAPE.pattern.test(CONTINUATION_SHAPE.specimen)).toBe(true);
    expect(beat(CONTINUATION_SHAPE.specimen)).toEqual([["event-without-basis:continuation", "/beats/2/vo"]]);
  });

  it.each([
    "today I shot the same lens change over and over and won an award for it",
    "I quit my job last year [check] and won an award for it",
    "we packed the van [check], drove to the coast and sold every print",
    "I burned the first loaf [check] — sold the rest by noon",
    "you dropped the camera [check] but then caught it before it hit the floor",
  ])("'%s' is refused at the unmarked continuation", (vo) => {
    expect(beat(vo)).toEqual([["event-without-basis:continuation", "/beats/2/vo"]]);
  });

  it("a runGeneration REWRITE that keeps the continuation unmarked ends in an honest refusal, not a usable draft", async () => {
    const script = scriptV2("explain_opinion");
    const doc = {
      ...script,
      beats: script.beats.map((b, i) => (i === 2 ? { ...b, vo: "I quit my job last year [check] and won an award for it" } : b)),
    };
    let calls = 0;
    const run = await runGeneration({
      mode: "ideaToScript",
      context: v2Context("auto"),
      generate: async () => {
        calls += 1;
        return asReply(doc);
      },
    });
    expect(calls).toBe(2);
    expect(run.status).toBe("refused");
  });

  it("an honest continuation the creator wrote passes on their own run, and a 'and red lights' is no verb", () => {
    // The seeded input stays (the fixture's opening beat restates it); the loaf line joins it.
    const loaf: GenerationContext = {
      ...SEEDED_CONTEXT,
      input: `${SEEDED_CONTEXT.input}\nI burned the first loaf and kept filming anyway`,
    };
    expect(beat("I burned the first loaf and kept filming anyway", v2Context("explain_opinion", NO_LIMITS, {}, loaf))).toEqual([]);
    expect(beat(HONEST_RESTATING_BEAT + " and kept almost none of it")).toEqual([]);
    expect(beat("I shot it [check] and red lights filled the frame")).toEqual([]);
  });

  it("the continuation is read ONLY after a first- or second-person subject: 'the oven caught fire and burned' is not one", () => {
    expect(beat("the oven caught fire and burned the tray")).toEqual([]);
  });
});

describe("ROUND 4: a revision restating a parent's [check]ed passage needs its OWN mark", () => {
  const PARENT = "a stranger knocks your tripod over halfway through your best take [check]";
  const RESTATED = "a stranger knocks your tripod over halfway through your best take";
  const ctx = v2Context("auto", NO_LIMITS, { carriedUnconfirmed: [PARENT] });
  const beat = (vo: string) => {
    const script = scriptV2("explain_opinion");
    const doc = { ...script, beats: script.beats.map((b, i) => (i === 2 ? { ...b, vo } : b)) };
    return runKillTest({ output: marked("ideaToScript", doc, ctx), mode: "ideaToScript", context: ctx })
      .hardRules.filter((f) => f.rule === "unsupported_experience")
      .map((f) => [f.shape, f.field]);
  };

  it("(a) a [check] in ANOTHER SENTENCE of the same beat covers nothing", () => {
    expect(beat(`${RESTATED}. Then the light goes [check]`)).toEqual([
      ["parent-unconfirmed-unmarked", "/beats/2/vo"],
    ]);
  });

  it("(b) a [check] on ANOTHER LINE covers nothing", () => {
    expect(beat(`${RESTATED}\nthe light goes [check]`)).toEqual([
      ["parent-unconfirmed-unmarked", "/beats/2/vo"],
    ]);
  });

  it("its own mark — after it, or inside it — clears it", () => {
    expect(beat(`${RESTATED} [check]. Then the light goes`)).toEqual([]);
    expect(beat("a stranger knocks your tripod over [check] halfway through your best take")).toEqual([]);
  });
});

describe("ROUND 4, REVERSED BY AUDIT P1-R1: the model's disclosure is not presented, so it is not read (R-154)", () => {
  it("an invented event in the disclosure guidance no longer refuses — the same event in a beat still does", () => {
    // Round 4 added the two fields BECAUSE Studio rendered them. Nothing does
    // now, and a refusal is debited, so refusing over text no creator reads
    // would charge a credit for nothing.
    const script = scriptV2("explain_opinion");
    const doc = { ...script, disclosure: { ...script.disclosure, guidance: "I won an award for saying a tool helped" } };
    const context = v2Context("explain_opinion");
    const found = runKillTest({ output: marked("ideaToScript", doc, context), mode: "ideaToScript", context })
      .hardRules.filter((f) => f.rule === "unsupported_experience")
      .map((f) => [f.shape, f.field]);
    expect(found).toEqual([]);
    // NON-VACUITY: the sentence is an event the rule refuses in a field a
    // creator reads, so the empty list above is the field, not the sentence.
    const inBeat = { ...script, beats: script.beats!.map((b, i) => (i === 0 ? { ...b, vo: "I won an award for saying a tool helped" } : b)) };
    const beatFound = runKillTest({ output: marked("ideaToScript", inBeat, context), mode: "ideaToScript", context })
      .hardRules.filter((f) => f.rule === "unsupported_experience")
      .map((f) => f.field);
    expect(beatFound).toContain("/beats/0/vo");
  });

  it("…the render site no longer shows it, and the two fields are EXCLUDED with that reason", async () => {
    // A render site that started showing the model's section again would be
    // the R-121 breach `tests/disclosure-presenters.test.ts` exists to catch —
    // and this pin, which reads the render site, would have to move with it.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname } = await import("node:path");
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/(product)/studio/generation-outcome.tsx"),
      "utf8"
    );
    expect(src).not.toContain("{doc.disclosure.guidance}");
    expect(src).not.toContain("{doc.disclosure.platform}");
    expect(src).toContain("{DISCLOSURE_LINE[doc.disclosure.kind]}");
    expect(EVENT_SCAN_POPULATION).not.toContain("disclosure.guidance" as never);
    expect(EVENT_SCAN_POPULATION).not.toContain("disclosure.platform" as never);
    expect(EVENT_SCAN_EXCLUDED["disclosure.guidance"]).toMatch(/never presented/);
    expect(EVENT_SCAN_EXCLUDED["disclosure.platform"]).toMatch(/never presented/);
  });
});

describe("ROUND 4: -t past spellings fold to -ed, and the honest-paraphrase count is pinned", () => {
  /** Measured on this build; `honest-line-reads-as-event` states the same number. */
  const MEASURED_LOAF_REFUSALS = 3;
  const LOAF = "I burned the first loaf and kept filming anyway";
  const loafContext = v2Context("personal_story_observation", NO_LIMITS, {}, { ...SEEDED_CONTEXT, input: LOAF });
  const story = (whatHappens: string) => {
    const doc = ideationV2(["personal_story_observation"]);
    doc.ideas[0] = {
      ...doc.ideas[0],
      premise: { ...doc.ideas[0].premise, whatHappens, basis: { kind: "material", excerpt: LOAF } as never },
    };
    return doc;
  };
  const refusedAt0 = (whatHappens: string) =>
    runKillTest({ output: marked("ideation", story(whatHappens), loafContext), mode: "ideation", context: loafContext })
      .hardRules.some((f) => f.rule === "unsupported_experience" && f.field.startsWith("/ideas/0/"));

  it("'I burnt the first loaf and kept filming anyway' passes against the quote 'I burned the first loaf…'", () => {
    expect(refusedAt0("I burnt the first loaf and kept filming anyway")).toBe(false);
    // NON-VACUITY: a verb the quote does not have is still refused.
    expect(refusedAt0("I sold the first loaf and kept filming anyway")).toBe(true);
  });

  // THE NUMBER `honest-line-reads-as-event` STATES, pinned. Our own nine
  // honest paraphrases of one story, author-written — indicative, never a rate.
  const HONEST_LOAF_PARAPHRASES = [
    "I burnt the first loaf and kept filming anyway",
    "I burned my first loaf but kept the camera rolling",
    "the first loaf burned and I kept filming",
    "I scorched the first loaf and kept filming anyway",
    "I burned the first loaf and carried on filming",
    "my first loaf burned and I filmed anyway",
    "I'd burned the first loaf, so I kept filming",
    "I burned the very first loaf and kept on filming anyway",
    "we burned the first loaf and kept filming regardless",
  ];
  it("refuses exactly the count the register records", () => {
    const refused = HONEST_LOAF_PARAPHRASES.filter(refusedAt0);
    expect(HONEST_LOAF_PARAPHRASES).toHaveLength(9);
    expect(refused.length, refused.join(" | ")).toBe(MEASURED_LOAF_REFUSALS);
    const gap = KNOWN_MODE_CHECK_GAPS.find((g) => g.id === "honest-line-reads-as-event");
    expect(gap?.what).toContain(`refuse ${MEASURED_LOAF_REFUSALS} of 9`);
  });
});
