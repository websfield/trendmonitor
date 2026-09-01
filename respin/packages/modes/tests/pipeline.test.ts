// Slice 6 stage B, R2/R5/R6/R8: the pipeline, driven end to end WITHOUT HTTP.
//
// R8 IS THE ACCEPTANCE CRITERION AND IT IS INHERITED VERBATIM. M3's criterion
// names four fixtures — a fragment triad, an antithesis construction, an
// invented specific, a 16-word hook — "each caught and rewritten or honestly
// failed". Both halves of that disjunction are driven for all four below.
//
// Mutations this file is the witness for:
//   M1  hard rules routed through the model      -> "a scorer that passes
//                                                    everything cannot save a
//                                                    hard-rule violation"
//   M2  the one-rewrite bound becomes a loop     -> the call-count assertions
//   M7  the parse accepts a partial document     -> "a parse failure does not
//                                                    consume the rewrite"
import { describe, expect, it } from "vitest";

import {
  GenerationAssemblyError,
  assembleGenerationPrompt,
  assembleRewritePrompt,
  traceabilityCorpusFor,
  type GenerationContext,
} from "../src/assemble";
import { promptBundleVersion } from "../src/bundle";
import { runKillTest, type CreatorRule } from "../src/kill-test";
import { ScriptOutputError, parseScriptOutput } from "../src/output";
import { runGeneration, type GenerateFn } from "../src/pipeline";
import {
  CLEAN_HOOKS,
  SIXTEEN_WORD_HOOK,
  asReply,
} from "./support/fixtures";

const CONTEXT: GenerationContext = {
  universalLaws: ["open on a cost the viewer already feels"],
  frameworks: [
    { name: "cost reveal", summary: "name the price before the payoff" },
  ],
  brain: {
    voice: ["writes in short plain sentences", "never hedges"],
    strategy: ["talks to people who film alone"],
    killtest: ["never open on a question"],
  },
  input:
    "today I shot three takes of the same lens change and one of them worked",
  platform: "youtube",
};

const CREATOR_RULES: CreatorRule[] = [
  { id: "r1", text: "never open on a question" },
];

/** M3's four planted violations, each swapped into the first hook. */
const PLANTED: Record<string, { text: string; rule: string }> = {
  "fragment triad": {
    text: "Bold. Fearless. Unstoppable.",
    rule: "fragment_triad",
  },
  "antithesis construction": {
    text: "It's not a hack, it's a habit",
    rule: "antithesis",
  },
  // A CURRENCY AMOUNT, not the bare "412 percent" this fixture used to carry.
  // R-64's enforcement split now reads a bare integer as `flag` (an honest
  // listicle count is not a claim about a quantity), so only a MARKED quantity
  // can drive M3's "caught and rewritten or honestly failed" criterion.
  "invented specific": {
    text: "I saved $4,000 last year doing this",
    rule: "invented_specific",
  },
  "16-word hook": { text: SIXTEEN_WORD_HOOK, rule: "hook_too_long" },
};

const withHook = (text: string) => ({
  ...CLEAN_HOOKS,
  hooks: [
    { text, mechanic: CLEAN_HOOKS.hooks[0].mechanic },
    ...CLEAN_HOOKS.hooks.slice(1),
  ],
});

/** A stub vendor: hands back the queued replies, in order, and counts calls. */
function stubGenerate(replies: string[]): GenerateFn & { calls: number } {
  const stub = Object.assign(
    async (): Promise<string> => {
      const next = replies[stub.calls];
      stub.calls += 1;
      if (next === undefined) {
        // A DISTINCTIVE THROW, never a silent replay of the last reply: a
        // pipeline that looped would otherwise pass every assertion below by
        // being handed the same draft again.
        throw new Error(
          `the pipeline asked for draft ${stub.calls}, and only ${replies.length} were queued`
        );
      }
      return next;
    },
    { calls: 0 }
  );
  return stub;
}

const CLEAN = asReply(CLEAN_HOOKS);

describe("the fixtures are what they claim to be", () => {
  // NON-VACUITY FIRST. A pipeline test that plants a "violation" the scanners
  // do not see would prove the rewrite path with a clean document.
  it("the clean fixture violates nothing", () => {
    const out = runKillTest({
      output: parseScriptOutput({ text: CLEAN, mode: "hooks" }),
      corpus: traceabilityCorpusFor(CONTEXT),
    });
    expect(out.hardRules).toEqual([]);
  });

  it.each(Object.keys(PLANTED))("the %s fixture fires its own rule", (name) => {
    const planted = PLANTED[name];
    const out = runKillTest({
      output: parseScriptOutput({
        text: asReply(withHook(planted.text)),
        mode: "hooks",
      }),
      corpus: traceabilityCorpusFor(CONTEXT),
    });
    expect(out.hardRules.map((f) => f.rule)).toContain(planted.rule);
  });
});

describe("R8: each planted violation is CAUGHT AND REWRITTEN", () => {
  it.each(Object.keys(PLANTED))("%s -> one rewrite -> usable", async (name) => {
    const generate = stubGenerate([asReply(withHook(PLANTED[name].text)), CLEAN]);
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate,
    });
    expect(generate.calls).toBe(2);
    expect(run.status).toBe("usable");
    if (run.status !== "usable") return;
    expect(run.killTest.outcome).toBe("passed_after_rewrite");
    expect(run.killTest.rewritten).toBe(true);
    expect(run.killTest.attempts).toBe(2);
    expect(run.killTest.firstAttempt.hardRules.map((f) => f.rule)).toContain(
      PLANTED[name].rule
    );
    expect(run.killTest.finalAttempt.hardRules).toEqual([]);
  });
});

describe("R8: each planted violation is HONESTLY FAILED when the rewrite fails too", () => {
  it.each(Object.keys(PLANTED))("%s -> one rewrite -> refusal", async (name) => {
    const dirty = asReply(withHook(PLANTED[name].text));
    const generate = stubGenerate([dirty, dirty]);
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate,
    });
    // EXACTLY TWO. Never a third, and the stub would throw if it were asked.
    expect(generate.calls).toBe(2);
    expect(run.status).toBe("refused");
    if (run.status !== "refused") return;
    expect(run.killTest.outcome).toBe("failed");
    expect(run.refusal.why.join(" ")).toContain(PLANTED[name].rule);
    expect(run.refusal.sharperAngle.length).toBeGreaterThan(20);
    // "Everything died, here is why, here is a sharper angle" — and no draft.
    expect("output" in run).toBe(false);
  });
});

describe("the one-rewrite bound (R6, mutation M2)", () => {
  it("a clean first draft costs ONE vendor call", async () => {
    const generate = stubGenerate([CLEAN]);
    const run = await runGeneration({ mode: "hooks", context: CONTEXT, generate });
    expect(generate.calls).toBe(1);
    expect(run.status).toBe("usable");
    if (run.status !== "usable") return;
    expect(run.killTest.outcome).toBe("passed");
    expect(run.killTest.rewritten).toBe(false);
    expect(run.drafts).toBe(1);
  });

  it("never asks for a third draft, however bad the second is", async () => {
    const dirty = asReply(withHook("Bold. Fearless. Unstoppable."));
    // Only TWO replies are queued; a third request throws a distinctive error
    // rather than silently reusing one, so a loop cannot pass this test.
    const generate = stubGenerate([dirty, dirty]);
    await runGeneration({ mode: "hooks", context: CONTEXT, generate });
    expect(generate.calls).toBe(2);
  });
});

describe("the hard rules are code, and a model cannot talk them out of firing (R5, M1)", () => {
  it("a scorer that passes EVERYTHING cannot save a hard-rule violation", async () => {
    const dirty = asReply(withHook("Bold. Fearless. Unstoppable."));
    const generate = stubGenerate([dirty, dirty]);
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      creatorRules: CREATOR_RULES,
      generate,
      scoreCreatorRules: async () =>
        JSON.stringify({
          verdicts: [{ ruleId: "r1", passed: true, note: "all good" }],
        }),
    });
    expect(run.status).toBe("refused");
  });

  it("a scorer that FAILS everything cannot refuse a clean draft", async () => {
    // The other direction, and it is the one that keeps a rewrite from being a
    // model's decision to spend the creator's money.
    const generate = stubGenerate([CLEAN]);
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      creatorRules: CREATOR_RULES,
      generate,
      scoreCreatorRules: async () =>
        JSON.stringify({
          verdicts: [{ ruleId: "r1", passed: false, note: "opens on a question" }],
        }),
    });
    expect(generate.calls).toBe(1);
    expect(run.status).toBe("usable");
    if (run.status !== "usable") return;
    expect(run.killTest.outcome).toBe("passed");
    expect(run.killTest.creatorRuleVerdicts[0].passed).toBe(false);
  });
});

describe("the creator-rule scoring is recorded honestly", () => {
  it("records that nothing was scored, rather than that everything passed", async () => {
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([CLEAN]),
    });
    expect(run.killTest.creatorRulesScored).toBe(false);
    expect(run.killTest.creatorRuleVerdicts).toEqual([]);
  });

  it("does not call the scorer when every criterion is a `[check]` placeholder", async () => {
    let scorerCalls = 0;
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      creatorRules: [{ id: "r1", text: "[check]" }],
      generate: stubGenerate([CLEAN]),
      scoreCreatorRules: async () => {
        scorerCalls += 1;
        return "{}";
      },
    });
    expect(scorerCalls).toBe(0);
    expect(run.killTest.creatorRulesScored).toBe(false);
  });

  it("does not spend a scoring call on a draft the creator will never see", async () => {
    let scorerCalls = 0;
    const dirty = asReply(withHook("Bold. Fearless. Unstoppable."));
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      creatorRules: CREATOR_RULES,
      generate: stubGenerate([dirty, dirty]),
      scoreCreatorRules: async () => {
        scorerCalls += 1;
        return "{}";
      },
    });
    expect(run.status).toBe("refused");
    expect(scorerCalls).toBe(0);
    expect(run.killTest.creatorRulesScored).toBe(false);
  });
});

describe("a parse failure is OURS, and never consumes the rewrite (R3, question 4)", () => {
  it("propagates and stops after one vendor call", async () => {
    const generate = stubGenerate(["not json at all", CLEAN]);
    await expect(
      runGeneration({ mode: "hooks", context: CONTEXT, generate })
    ).rejects.toBeInstanceOf(ScriptOutputError);
    expect(generate.calls).toBe(1);
  });

  it("propagates from the REWRITE too, without a third call", async () => {
    const dirty = asReply(withHook("Bold. Fearless. Unstoppable."));
    const generate = stubGenerate([dirty, "{}"]);
    await expect(
      runGeneration({ mode: "hooks", context: CONTEXT, generate })
    ).rejects.toBeInstanceOf(ScriptOutputError);
    expect(generate.calls).toBe(2);
  });
});

describe("the prompt bundle version (R4)", () => {
  it("is the same for two different creators in the same mode", async () => {
    const other: GenerationContext = {
      ...CONTEXT,
      brain: { voice: ["writes long"], strategy: ["b2b"], killtest: [] },
      input: "a totally different day of footage",
    };
    const a = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([CLEAN]),
    });
    const b = await runGeneration({
      mode: "hooks",
      context: other,
      generate: stubGenerate([CLEAN]),
    });
    expect(a.promptBundleVersion).toBe(b.promptBundleVersion);
    expect(a.promptBundleVersion).toBe(promptBundleVersion("hooks"));
  });

  it("is stored on the kill-test result too, so a stored refusal names its bundle", async () => {
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([CLEAN]),
    });
    expect(run.killTest.promptBundleVersion).toBe(run.promptBundleVersion);
  });
});

describe("assembly is pure and refuses before any vendor call (R2)", () => {
  it("gives byte-identical prompts for the same inputs", () => {
    const args = { mode: "hooks" as const, context: CONTEXT };
    expect(assembleGenerationPrompt(args)).toEqual(assembleGenerationPrompt(args));
  });

  it("puts the brain, the frameworks, the laws, the platform and the input in the prompt", () => {
    const { prompt } = assembleGenerationPrompt({ mode: "hooks", context: CONTEXT });
    for (const s of [
      ...CONTEXT.brain.voice,
      ...CONTEXT.brain.strategy,
      ...CONTEXT.brain.killtest,
      CONTEXT.universalLaws[0],
      CONTEXT.frameworks[0].name,
      CONTEXT.platform,
      CONTEXT.input,
    ]) {
      expect(prompt).toContain(s);
    }
  });

  it("states the mode's own output contract, and not another mode's", () => {
    const { prompt } = assembleGenerationPrompt({ mode: "hooks", context: CONTEXT });
    expect(prompt).toContain('"hooks"');
    expect(prompt).toContain('"whyThisPerforms"');
    expect(prompt).not.toContain('"shotMap"');
  });

  it("refuses an empty input, a missing platform and an empty brain", () => {
    for (const bad of [
      { ...CONTEXT, input: "   " },
      { ...CONTEXT, platform: "" },
      { ...CONTEXT, brain: { voice: [], strategy: [], killtest: [] } },
    ]) {
      expect(() =>
        assembleGenerationPrompt({ mode: "hooks", context: bad })
      ).toThrow(GenerationAssemblyError);
    }
  });

  it("refuses a rewrite with nothing to fix — that is a paid call for nothing", () => {
    expect(() =>
      assembleRewritePrompt({
        mode: "hooks",
        context: CONTEXT,
        draft: CLEAN,
        findings: [],
      })
    ).toThrow(GenerationAssemblyError);
  });

  it("the rewrite prompt shows the previous draft AND what was found", () => {
    const output = parseScriptOutput({
      text: asReply(withHook("Bold. Fearless. Unstoppable.")),
      mode: "hooks",
    });
    const found = runKillTest({
      output,
      corpus: traceabilityCorpusFor(CONTEXT),
    });
    const { prompt } = assembleRewritePrompt({
      mode: "hooks",
      context: CONTEXT,
      draft: "THE PREVIOUS DRAFT",
      findings: found.hardRules,
    });
    expect(prompt).toContain("THE PREVIOUS DRAFT");
    expect(prompt).toContain("fragment_triad");
    expect(prompt).toMatch(/do not delete the sentence/);
  });
});

describe("the traceability corpus comes from the same value the prompt did (R19)", () => {
  it("is the creator's brain plus this generation's input — and not the frameworks", () => {
    const corpus = traceabilityCorpusFor(CONTEXT);
    expect(corpus.brain).toEqual([
      ...CONTEXT.brain.voice,
      ...CONTEXT.brain.strategy,
      ...CONTEXT.brain.killtest,
    ]);
    // THE PLATFORM IS PART OF WHAT THEY GAVE THIS GENERATION. They pick it on
    // the form; while it was missing from this list, every generation flagged
    // the creator's own platform underneath a note telling them everything had
    // been "checked against what you gave this generation".
    expect(corpus.input).toEqual([CONTEXT.input, CONTEXT.platform]);
    expect(JSON.stringify(corpus)).not.toContain("cost reveal");
  });

  it("the creator's OWN PLATFORM does not flag (measured end to end)", async () => {
    const run = await runGeneration({
      mode: "hooks",
      context: { ...CONTEXT, platform: "TikTok" },
      generate: stubGenerate([
        asReply({
          ...CLEAN_HOOKS,
          disclosure: {
            platform: "TikTok",
            guidance: "Say a tool helped draft this, in your own words.",
          },
        }),
      ]),
    });
    expect(run.status).toBe("usable");
    if (run.status !== "usable") return;
    expect(
      run.killTest.finalAttempt.traceability.map((f) => f.token)
    ).not.toContain("TikTok");
  });

  it("a specific the creator's OWN INPUT carries survives the gate", async () => {
    // The same "$4,000" that is refused above, this time in the input.
    const run = await runGeneration({
      mode: "hooks",
      context: { ...CONTEXT, input: CONTEXT.input + " and it saved me $4,000" },
      generate: stubGenerate([
        asReply(withHook("I saved $4,000 last year doing this")),
      ]),
    });
    expect(run.status).toBe("usable");
  });
});

describe("the compliance gate's measured drafts, at the pipeline level", () => {
  // EVERY CASE BELOW WAS RUN THROUGH THIS EXACT FUNCTION by the reviewer, and
  // is pinned in the direction they measured it.

  it("BLOCK: one `[check]` per sentence no longer makes a draft usable", async () => {
    // MEASURED BEFORE: `hardRules: []`, `traceability: []`, `status: "usable"`,
    // with `$4,000`, `11`, `3` and `2019` returned for display verbatim.
    const draft = asReply({
      ...CLEAN_HOOKS,
      hooks: [
        {
          text: "I saved $4,000 last year doing this, ask my [check]",
          mechanic: "cost reveal",
        },
        {
          text: "It took 11 weeks and 3 failed batches [check] to work this out",
          mechanic: "contradiction",
        },
        {
          text: "In 2019 I threw away half my fridge every Friday [check]",
          mechanic: "withheld detail",
        },
      ],
    });
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([draft, draft]),
    });
    expect(run.status).toBe("refused");
    if (run.status !== "refused") return;
    expect(run.refusal.why.join(" ")).toContain("invented_specific");
    // The bare integers do not refuse, but they are on the record the screen
    // renders, each with a `[check]` offer.
    const flagged = run.killTest.finalAttempt.traceability.map((f) => f.token);
    for (const token of ["11", "3", "2019"]) {
      expect(flagged, token + " lost its [check] offer").toContain(token);
    }
  });

  it("an HONEST LISTICLE is not refused, and its count is still flagged", async () => {
    // MEASURED BEFORE: `drafts: 2`, `outcome: "failed"` — a Free creator paying
    // 1 of 25 monthly credits for a script that was fine.
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([
        asReply(
          withHook("The 5 mistakes that make batch cooking taste like leftovers")
        ),
      ]),
    });
    expect(run.status).toBe("usable");
    if (run.status !== "usable") return;
    expect(run.drafts).toBe(1);
    expect(
      run.killTest.finalAttempt.traceability.map((f) => f.token)
    ).toContain("5");
  });

  it("a STEP NUMBER in the disclosure guidance is not a refusal either", async () => {
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([
        asReply({
          ...CLEAN_HOOKS,
          disclosure: {
            platform: "youtube",
            guidance: "Tag it as AI-assisted at step 3 of the flow before you post.",
          },
        }),
      ]),
    });
    expect(run.status).toBe("usable");
  });

  it("a CONCEALMENT sentence in the disclosure guidance is REFUSED, end to end", async () => {
    // THE BLOCK, at the level the reviewer measured it. This test used to
    // assert `status: "usable"` and a recorded flag, which is exactly what the
    // gate measured and rejected: the sentence rendered under the product's own
    // **Disclosure** heading with `hardRules: []`. REQ-I05 / S5 is a release
    // gate — "disclosure guidance is platform-appropriate and never advises
    // concealment" — so it refuses, after the one rewrite R6 allows.
    const draft = asReply({
      ...CLEAN_HOOKS,
      disclosure: {
        platform: "youtube",
        guidance:
          "Most people skip the label on a short like this, and nobody needs to know a tool helped.",
      },
    });
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([draft, draft]),
    });
    expect(run.status).toBe("refused");
    if (run.status !== "refused") return;
    expect(run.drafts).toBe(2);
    expect(run.killTest.finalAttempt.claims.map((f) => f.shape)).toContain(
      "skip the label"
    );
    expect(
      run.killTest.finalAttempt.hardRules.map((f) => f.rule)
    ).toContain("forbidden_claim");
    // The creator is told WHICH rule and WHERE, not just that something failed.
    expect(run.refusal.why.join(" ")).toContain("/disclosure/guidance");
  });

  it("...and HONEST guidance in the same section still ships in one draft", async () => {
    // The other half, at the same level: the promotion of `/disclosure/` to a
    // hard field is a rule about concealment, not a ban on a section whose
    // whole subject is labels. Without the context guard each of these refused
    // — and a refusal is debited.
    for (const guidance of [
      "Do not leave the label out of the caption.",
      "Never skip the label on a short like this.",
      "There is no need to disclose sponsorship here, but you must tag AI assistance.",
    ]) {
      const run = await runGeneration({
        mode: "hooks",
        context: CONTEXT,
        generate: stubGenerate([
          asReply({
            ...CLEAN_HOOKS,
            disclosure: { platform: "youtube", guidance },
          }),
        ]),
      });
      expect(run.status, guidance).toBe("usable");
      if (run.status !== "usable") return;
      expect(run.drafts, guidance).toBe(1);
    }
  });

  it("an HONEST WEAKEST POINT naming a metric runs clean, and is not charged", async () => {
    // MEASURED BEFORE: `status: "refused"`, `drafts: 2`, on
    // `forbidden_claim:views` — a creator debited for the one sentence REQ-I04
    // exists to require. The same shape as the listicle `5`, on the same money
    // path: a bare noun is not a claim.
    const honest = [
      "Nothing here has been checked against how your views actually behave.",
      "This is a structure, not an engagement trick.",
      "Nothing here makes it go viral.",
    ];
    for (const weakestPoint of honest) {
      const run = await runGeneration({
        mode: "hooks",
        context: CONTEXT,
        generate: stubGenerate([
          asReply({
            ...CLEAN_HOOKS,
            whyThisPerforms: {
              reasoning: CLEAN_HOOKS.whyThisPerforms.reasoning,
              weakestPoint,
            },
          }),
        ]),
      });
      expect(run.status, weakestPoint).toBe("usable");
      if (run.status !== "usable") return;
      // ONE draft: no rewrite was spent either, which is the half of the cost
      // that does not show up as a refusal.
      expect(run.drafts, weakestPoint).toBe(1);
      // Still on the record the screen renders — narrowed, not silenced.
      // EVERY finding, not one: "Nothing here makes it go viral." matches two
      // shapes now (the bare adjective, and the predicate `goes viral` that
      // R20's third noun was missing), and both must be flag — the first by
      // its shape ceiling, the second by the negated-clause context guard.
      const enforcement = run.killTest.finalAttempt.claims.map(
        (f) => f.enforcement
      );
      expect(enforcement.length, weakestPoint).toBeGreaterThan(0);
      expect(new Set(enforcement), weakestPoint).toEqual(new Set(["flag"]));
    }
  });

  it("a FORECAST in `whyThisPerforms` refuses after its one rewrite", async () => {
    const draft = asReply({
      ...CLEAN_HOOKS,
      whyThisPerforms: {
        reasoning: "This one will perform, because openers like it get more reach.",
        weakestPoint: "Nothing here has been checked against your own results.",
      },
    });
    const run = await runGeneration({
      mode: "hooks",
      context: CONTEXT,
      generate: stubGenerate([draft, draft]),
    });
    expect(run.status).toBe("refused");
    if (run.status !== "refused") return;
    expect(run.refusal.why.join(" ")).toContain("forbidden_claim");
  });
});
