// THE `partSizes` COMPLETENESS WITNESS FOR THE MODES PRODUCERS (audit P3-R2,
// decisions R-158).
//
// The input ceiling sums a prompt's recorded parts. A part joined into the
// prompt WITHOUT a `partSizes` entry would be sent and billed with no bound on
// it, silently — so for every producer here the recorded parts must add up to
// the whole prompt: `partSizes.system === bytes(system)` and
// Σ(parts but `system`) + `separatorBytes` === bytes(prompt). The separators are
// counted by `composePrompt` from the join ARRAY, never from the text, so a
// segment concatenated outside the helper breaks the equality — which is what
// the planted segment below proves for each producer.
//
// It also pins what the exemption is FOR: the rewrite's bounded parts never
// exceed the first pass's, the scoring prompt's bounded parts never include
// the draft, and every declared exempt part is fed by a pipeline value — the
// vendor's own draft, the findings, our instruction — never by the creator's
// input or brain.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXEMPTABLE_PROMPT_PARTS, type AssembledPrompt } from "@respin/llm";

import {
  FRAMEWORK_BLOCK_EMPTY,
  FRAMEWORK_BLOCK_HEADER,
  FRAMEWORK_EVIDENCE_NOTE,
  HARD_RULE_BRIEF,
  INPUT_FENCE_CLOSE,
  INPUT_FENCE_OPEN,
  KILL_TEST_DRAFT_FENCE_OPEN,
  DRAFT_FENCE_CLOSE,
  MODE_BRIEFS,
  assembleGenerationPrompt,
  assembleRewritePrompt,
  encodeUntrusted,
  modeBriefText,
  outputContractFor,
  type GenerationContext,
} from "../src/assemble";
import { assembleKillTestPrompt } from "../src/kill-test";
import { SEEDED_CONTEXT, SPIN_CONTEXT, v2Context } from "./support/mode-fixtures";

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

/** The witness. True when the recorded parts add up to exactly the sent prompt. */
function complete(p: AssembledPrompt): boolean {
  const { system, ...rest } = p.partSizes;
  const sum = Object.values(rest).reduce((a, b) => a + b, 0);
  return system === bytes(p.system) && sum + p.separatorBytes === bytes(p.prompt);
}

/** What the ceiling counts: every separator, and every part but the declared, exemptable ones. */
function bounded(p: AssembledPrompt): number {
  return Object.entries(p.partSizes)
    .filter(([k]) => !(p.exemptParts.includes(k) && (EXEMPTABLE_PROMPT_PARTS as readonly string[]).includes(k)))
    .reduce((a, [, v]) => a + v, p.separatorBytes);
}

const sha256 = (p: AssembledPrompt) => createHash("sha256").update(`${p.system}\u0000${p.prompt}`).digest("hex");

/** A brain at the creator-edit bounds: 50 entries of 2,000 characters per document. */
const line = (kind: string, i: number) => `${kind} entry ${"w".repeat(1_980)} ${i}`;
const HEAVY: GenerationContext = {
  ...SPIN_CONTEXT,
  frameworks: Array.from({ length: 9 }, (_, i) => ({ name: `framework ${i}`, summary: "s".repeat(2_200) })),
  brain: {
    voice: Array.from({ length: 50 }, (_, i) => line("voice", i)),
    strategy: Array.from({ length: 50 }, (_, i) => line("strategy", i)),
    killtest: Array.from({ length: 50 }, (_, i) => line("killtest", i)),
  },
};

const FINDINGS = [
  { rule: "hook_word_ceiling", shape: "too_long", field: "/hooks/0/text", excerpt: "a hook that ran long", remedy: "cut it" },
] as never;
const RULES = [
  { id: "/rules/0", text: "never open on a question" },
  { id: "/rules/1", text: "say the cost before the payoff" },
];

const PRODUCERS: ReadonlyArray<readonly [string, () => AssembledPrompt]> = [
  ["assembleGenerationPrompt (v1, hooks)", () => assembleGenerationPrompt({ mode: "hooks", context: SEEDED_CONTEXT })],
  ["assembleGenerationPrompt (gated spin, heavy brain)", () => assembleGenerationPrompt({ mode: "analyseAndSpin", context: HEAVY })],
  ["assembleGenerationPrompt (v2, creative)", () => assembleGenerationPrompt({ mode: "ideation", context: v2Context("auto") })],
  ["assembleRewritePrompt (heavy brain)", () => assembleRewritePrompt({ mode: "analyseAndSpin", context: HEAVY, draft: "d".repeat(48_000), findings: FINDINGS })],
  ["assembleKillTestPrompt", () => assembleKillTestPrompt({ draft: "a rendered draft\nwith two lines", rules: RULES })],
];

describe("every modes prompt producer records every part it joins", () => {
  for (const [name, build] of PRODUCERS) {
    it(`${name}: Σ partSizes + separators is the whole prompt`, () => {
      const p = build();
      expect(complete(p), name).toBe(true);
    });

    it(`${name}: PLANTED — one more segment joined with no partSizes entry is red`, () => {
      const p = build();
      expect(complete({ ...p, prompt: `${p.prompt}\nPLANTED UNRECORDED SEGMENT` })).toBe(false);
      // ...and a segment hidden in the system text is red too.
      expect(complete({ ...p, system: `${p.system} PLANTED` })).toBe(false);
    });
  }
});

describe("the refactor changed no byte of the prompt (prompt_bundle_version does not move)", () => {
  it("assembleGenerationPrompt equals the inline join it replaced, for a v1 context", () => {
    // THE PRE-REFACTOR SHAPE, written out: one array per block, joined with
    // newlines. A refactor that moved a blank line, a header or a separator
    // would show here before it showed as a changed bundle digest.
    const c = SEEDED_CONTEXT;
    const legacyContext = [
      "Universal laws:",
      ...c.universalLaws.map((s) => "- " + s),
      "",
      ...(c.frameworks.length > 0
        ? [FRAMEWORK_BLOCK_HEADER, FRAMEWORK_EVIDENCE_NOTE, ...c.frameworks.map((f) => `- ${f.name}: ${f.summary}`)]
        : [FRAMEWORK_BLOCK_EMPTY]),
      "",
      "This creator's brain:",
      ...c.brain.voice.map((s) => "- voice: " + s),
      ...c.brain.strategy.map((s) => "- strategy: " + s),
      ...c.brain.killtest.map((s) => "- kill test: " + s),
      "",
      "Platform: " + c.platform,
      "",
      MODE_BRIEFS.hooks.inputLabel,
      // Audit Phase 8 (P8-R2) changed these lines DELIBERATELY: the input is
      // fenced and encoded, never appended raw (the bundle version moved with
      // it). Everything above is still the inline join P3-R2 replaced.
      INPUT_FENCE_OPEN,
      encodeUntrusted(c.input),
      INPUT_FENCE_CLOSE,
    ].join("\n");
    const legacy = [modeBriefText("hooks"), "", legacyContext, "", HARD_RULE_BRIEF, "", outputContractFor("hooks", 1)].join("\n");
    expect(assembleGenerationPrompt({ mode: "hooks", context: c }).prompt).toBe(legacy);
  });

  it("assembleKillTestPrompt equals the inline join it replaced", () => {
    const draft = "a rendered draft";
    const legacy = [
      "The creator's criteria:",
      ...RULES.map((r) => `- ${r.id}: ${r.text}`),
      "",
      // Audit Phase 8 (P8-R2) changed these lines DELIBERATELY: the draft is
      // fenced, its markers broken, never interpolated bare.
      KILL_TEST_DRAFT_FENCE_OPEN,
      draft,
      DRAFT_FENCE_CLOSE,
      "",
      "Answer every criterion by its id.",
    ].join("\n");
    expect(assembleKillTestPrompt({ draft, rules: RULES }).prompt).toBe(legacy);
  });
});

describe("what the exemption admits, and what it never can", () => {
  it("the rewrite's BOUNDED size never exceeds the admitted first pass's, however long the draft", () => {
    const first = assembleGenerationPrompt({ mode: "analyseAndSpin", context: HEAVY });
    for (const length of [10, 48_000, 200_000]) {
      const rewrite = assembleRewritePrompt({ mode: "analyseAndSpin", context: HEAVY, draft: "d".repeat(length), findings: FINDINGS });
      expect(bounded(rewrite), String(length)).toBeLessThanOrEqual(bounded(first));
    }
  });

  it("the scoring prompt's bounded size is the creator's rules and our headers — never the draft", () => {
    const small = assembleKillTestPrompt({ draft: "x", rules: RULES });
    const huge = assembleKillTestPrompt({ draft: "x".repeat(100_000), rules: RULES });
    expect(bounded(huge)).toBe(bounded(small));
    expect(bytes(huge.prompt)).toBeGreaterThan(100_000);
  });

  it("the scoring prompt's bounded size never exceeds the admitted first pass's — the rules come from the same brain", () => {
    // The scoring rules are the creator's kill-test lines, which the first
    // pass already carries inside `brain.killtest`; the scoring prompt adds
    // only its own short headers. So a first pass the ceiling admitted always
    // admits its scoring call, at any draft length.
    for (const context of [SEEDED_CONTEXT, HEAVY]) {
      const first = assembleGenerationPrompt({ mode: "analyseAndSpin", context: { ...context, reference: SPIN_CONTEXT.reference } });
      const rules = context.brain.killtest.map((text, i) => ({ id: `/rules/${i}`, text }));
      const scoring = assembleKillTestPrompt({ draft: "x".repeat(100_000), rules });
      expect(bounded(scoring)).toBeLessThanOrEqual(bounded(first));
    }
  });

  it("THE BYTES ARE PINNED for the spin-with-reference first pass and the rewrite — a change to either prompt is a visible edit", () => {
    // Pinned at the bytes this phase's composed assembly produces. The inline
    // join equality above covers the v1 first pass and the scoring prompt;
    // these two carry the reference block and the exempt parts, so their
    // digests stand in for that equality and move only with a deliberate
    // prompt change (which also moves prompt_bundle_version). Re-pinned by
    // audit Phase 8 (P8-R2): the untrusted-input clause, the input fence and
    // the draft fence (530547d8… / bf5ab6a4… before).
    expect(sha256(assembleGenerationPrompt({ mode: "analyseAndSpin", context: SPIN_CONTEXT }))).toBe("5c40e7916e3583aa2f3445028208445494a906a67f011d1a7d63bd9451061ebf");
    expect(sha256(assembleRewritePrompt({ mode: "analyseAndSpin", context: SPIN_CONTEXT, draft: "a draft", findings: FINDINGS }))).toBe("2cd2c2889251812883aeabc2dbb6a71e46a04e1e39d752f7ff5a568fcb5a8be6");
  });

  it("every DECLARED exempt part is fed by a pipeline value, never by the creator's input or brain", () => {
    const base = { mode: "analyseAndSpin" as const, draft: "the draft", findings: FINDINGS };
    const a = assembleRewritePrompt({ ...base, context: HEAVY });
    const grown = assembleRewritePrompt({
      ...base,
      context: { ...HEAVY, input: HEAVY.input + " more creator words".repeat(500), brain: { ...HEAVY.brain, voice: [...HEAVY.brain.voice, "another voice line"] } },
    });
    expect(a.exemptParts).toEqual(["draft", "rewriteInstruction", "findings"]);
    for (const part of a.exemptParts) {
      expect(grown.partSizes[part], part).toBe(a.partSizes[part]);
    }
    // ...while the creator's input really did grow — in a BOUNDED part.
    expect(grown.partSizes.input).toBeGreaterThan(a.partSizes.input!);
    expect(assembleKillTestPrompt({ draft: "d", rules: RULES }).exemptParts).toEqual(["draft"]);
    // A first pass exempts nothing.
    expect(assembleGenerationPrompt({ mode: "hooks", context: SEEDED_CONTEXT }).exemptParts).toEqual([]);
  });

  it("the three brain documents are separate parts, so a refusal can name the one to trim", () => {
    const p = assembleGenerationPrompt({ mode: "analyseAndSpin", context: HEAVY });
    for (const part of ["brain.voice", "brain.strategy", "brain.killtest", "frameworks", "input", "reference", "universalLaws", "platform", "hardRuleBrief", "outputContract", "modeBrief"]) {
      expect(p.partSizes, part).toHaveProperty([part]);
    }
    expect(p.partSizes["brain.killtest"]).toBeGreaterThan(100_000);
  });
});
