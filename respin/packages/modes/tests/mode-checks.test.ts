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

import { MODE_BRIEFS, modeBriefText } from "../src/assemble";
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

const parsed = (mode: ModeId, doc: unknown) =>
  parseScriptOutput({ text: asReply(doc), mode });

const DISTANT_SPIN_REFERENCE = {
  subjectTerms: ["aquarium", "coral lighting"],
  hook: "The reef light setting I stopped using",
  structure: { beatCount: 7, turnBeat: 5 },
} as const;

/** Run the per-mode checks over a document, in the mode's own context. */
const checks = (
  mode: ModeId,
  doc: unknown,
  context = CONTEXT_FOR[mode]
): HardRuleFinding[] =>
  scanModeChecks({
    mode,
    output: parsed(mode, doc),
    input: context.input,
    frameworks: context.frameworks,
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
