// THE INPUT CEILING IS DERIVED, AND PINNED TO ITS DERIVATION (audit P3-R2,
// decisions R-158 as amended 2026-10-06).
//
// `llm.maxInputTokens` bounds every creator-facing vendor call on its
// assembled bytes. A ceiling below what the product's own caps legitimately
// assemble refuses a creator for using the product as built — so the ceiling
// is checked here against the LARGEST FRESH GENERATION those caps produce,
// assembled by the real assembler, and against the window total's margin
// rule. THE CEILING IS THE MARGIN RULE'S MAXIMUM (owner delegation,
// 2026-10-06): the owner's 60 USD window and its "≥ 50 worst-case attempts"
// rule stay, and the ceiling is the largest value they admit. That maximum
// sits ≈0.86% UNDER the derived product maximum (≈0.65% until audit Phase
// 8's untrusted-input fence, R-177), so a generation at every cap
// at once is refused before the call with zero spend — a named residual in
// R-158, pinned below so it cannot grow unseen. Raising any component cap (a
// budget, an edit limit, an idea limit, a creative cap), or any price, is red.
//
// WHAT IS INSIDE THE DERIVATION, by list:
//   - the product's share: every mode and every creative form, the
//     framework budget filled across `FRAMEWORK_ROWS` rows, recent work at
//     its budget across the maximum entry count with every label, the
//     creative block at its caps;
//   - the creator's share: three brain documents, each at ONE maximal edit
//     request (`BRAIN_EDIT_TOTAL_MAX` over `BRAIN_EDIT_MAX_FIELDS` lines), and
//     an idea at `OWN_IDEA_MAX`.
// WHAT IS OUTSIDE IT, and why it is the owner's (R-158): a revision of a
// 12,000-token draft, a brain grown past one edit per document (the storage
// cap is `BRAIN_DOCUMENT_TEXT_MAX` per document), a Spin reference at its
// per-field caps, and studio free text (which has no product cap). Admitting
// those would break the window total's margin rule asserted below.
//
// PLAIN ASCII TEXT IS ASSUMED, and since audit Phase 8 (R-177) "plain" is
// narrower than "ASCII": the ceiling compares UTF-8 bytes of the ASSEMBLED
// prompt, and the creator's input is assembled through `encodeUntrusted`
// (JSON-encoded, `<` escaped). So `"`, `\`, a tab and a line break cost 2
// bytes each, `<` costs 6 (`\u003c`) and so does any other control character
// (`\u00XX`), and text
// outside ASCII costs its UTF-8 bytes. An idea at `OWN_IDEA_MAX` made of those
// measures up to six times the plain figure below. Such an input FAILS CLOSED:
// it is refused before the call with zero spend, never admitted under-priced.
// Named in R-158's residual list (amended by R-177). Stated, not hidden.
import { describe, expect, it } from "vitest";
import {
  BRAIN_EDIT_MAX_FIELDS,
  BRAIN_EDIT_TOTAL_MAX,
  CONFIG_V1_SEED,
  OWN_IDEA_MAX,
  PRIVATE_FRAMEWORK_COUNT_MAX,
} from "@respin/db";
import { respinConfigV1 } from "@respin/config";
import {
  CREATIVE_FORMS,
  MODE_IDS,
  RECENT_WORK_LABEL_IDS,
  assembleGenerationPrompt,
  takesCreativeForm,
  type GenerationContext,
  type ModeId,
} from "@respin/modes";
import { UNIVERSAL_LAWS } from "../src/generate";
import {
  marginRuleMaximumInputTokens,
  rewriteExemptOverheadBytes,
  worstCaseAttemptNanoUsd,
  WINDOW_WORST_CASE_ATTEMPTS,
} from "./support/attempt-worst-case";

/** Shared curated frameworks seeded today (F1-F9) plus a profile's private maximum. */
const FRAMEWORK_ROWS = 9 + PRIVATE_FRAMEWORK_COUNT_MAX;
/** At most five drafts and three reaction notes reach a prompt (`RECENT_*_MAX`). */
const RECENT_ENTRIES = 5 + 3;
/** The longest platform the studio offers. */
const PLATFORM = "Instagram Reels";
const CONSTRAINT_LIST_MAX = 12;
const CONSTRAINT_ITEM_MAX = 80;
const FOOTAGE_MAX = 1_000;
const MINUTES_MAX = 240;

const content = respinConfigV1.parse(CONFIG_V1_SEED);
/** Pinned so a change to the rewrite's exempt wrapping is a named edit. */
const OVERHEAD_BYTES = 579;
/** Pinned so a change to any price, the window, or the overhead is a named edit. */
const MARGIN_MAXIMUM = 104_323;

function context(mode: ModeId, form: (typeof CREATIVE_FORMS)[number] | null, creator: boolean): GenerationContext {
  const budget = content.generation.frameworkContextCharBudget;
  const per = Math.floor(budget / FRAMEWORK_ROWS);
  const recentBudget = content.generation.recentContextCharBudget;
  // One maximal edit request per document, spread over the most lines one
  // request may carry (each line carries a per-line label in the prompt).
  const brainDoc = creator
    ? Array.from({ length: BRAIN_EDIT_MAX_FIELDS }, () => "b".repeat(Math.floor(BRAIN_EDIT_TOTAL_MAX / BRAIN_EDIT_MAX_FIELDS)))
    : ["b"];
  // Plain letters: the encoding adds only its two quotes. See the header for
  // the characters it expands, and why their excess fails closed.
  const input = creator ? "i".repeat(OWN_IDEA_MAX) : "i";
  return {
    universalLaws: UNIVERSAL_LAWS,
    frameworks: Array.from({ length: FRAMEWORK_ROWS }, () => ({ name: "n", summary: "s".repeat(per - 1) })),
    brain: { voice: brainDoc, strategy: creator ? brainDoc : [], killtest: creator ? brainDoc : [] },
    input,
    platform: PLATFORM,
    unvouchedSpecifics: [],
    creative:
      form === null
        ? null
        : {
            formChoice: form,
            constraints: {
              people: "with_help",
              maxMinutes: MINUTES_MAX,
              locations: Array.from({ length: CONSTRAINT_LIST_MAX }, () => "l".repeat(CONSTRAINT_ITEM_MAX)),
              equipment: Array.from({ length: CONSTRAINT_LIST_MAX }, () => "e".repeat(CONSTRAINT_ITEM_MAX)),
              footage: "f".repeat(FOOTAGE_MAX),
            },
            creatorNote: input,
            carriedBasis: [],
            carriedUnconfirmed: [],
            approvedFrameworkNames: [],
          },
    recentWork: takesCreativeForm(mode)
      ? {
          sequel: false,
          entries: Array.from({ length: RECENT_ENTRIES }, (_, i) => ({
            kind: i < 5 ? ("draft" as const) : ("note" as const),
            labels: [...RECENT_WORK_LABEL_IDS],
            text: "r".repeat(Math.floor(recentBudget / RECENT_ENTRIES)),
          })),
        }
      : null,
    ...(mode === "analyseAndSpin"
      ? { reference: { mechanism: { hookMechanic: "h", beats: ["b"], ending: "e", followTrigger: "f" } } }
      : {}),
  } as GenerationContext;
}

/** The largest bounded size over every mode and every form. */
function largest(creator: boolean): { bytes: number; where: string } {
  let best = { bytes: 0, where: "" };
  for (const mode of MODE_IDS) {
    for (const form of takesCreativeForm(mode) ? [...CREATIVE_FORMS] : [null]) {
      const p = assembleGenerationPrompt({ mode, context: context(mode, form, creator) });
      const bytes = Object.values(p.partSizes).reduce((a, b) => a + b, 0) + p.separatorBytes;
      if (bytes > best.bytes) best = { bytes, where: `${mode}/${form ?? "legacy"}` };
    }
  }
  return best;
}

/** The rewrite's own exempt wrapping, measured from the real assembler. */
const overhead = rewriteExemptOverheadBytes();

/** The highest ceiling the window total's "≥ 50 worst-case attempts" rule admits. */
function marginRuleMaximum(): number {
  return marginRuleMaximumInputTokens(content.llm, content.generation.maxBillableCostMicroUsdPerWindow, overhead);
}

describe("llm.maxInputTokens against what the product's own caps assemble (R-158)", () => {
  // The product's share: everything at its cap with a one-line brain and a
  // one-character input — the floor every creator starts from.
  const product = largest(false);
  const derived = largest(true);
  const ceiling = content.llm.maxInputTokens;

  it("the derivation's numbers, pinned — a cap change moves one, and this case names it", () => {
    // Audit Phase 8 (P8-R2) moved both by 211 bytes, named here: the
    // untrusted-input clause in `GENERATION_SYSTEM` and the input fence
    // (37,318 / 105,006 before). The rewrite's exempt wrapping did NOT move
    // (`OVERHEAD_BYTES`): the draft fence replaced the old label.
    expect(product).toEqual({ bytes: 37_529, where: "ideaToScript/demonstration_experiment" });
    expect(derived).toEqual({ bytes: 105_217, where: "ideaToScript/demonstration_experiment" });
    expect(overhead).toBe(OVERHEAD_BYTES);
    expect(marginRuleMaximum()).toBe(MARGIN_MAXIMUM);
  });

  it("the ceiling IS the margin rule's maximum — computed, not a remembered literal", () => {
    expect(ceiling).toBe(marginRuleMaximum());
    // ...and at that ceiling the window total still covers the rule's count.
    const attempt = worstCaseAttemptNanoUsd(content.llm, overhead).total;
    expect(content.generation.maxBillableCostMicroUsdPerWindow * 1000).toBeGreaterThanOrEqual(WINDOW_WORST_CASE_ATTEMPTS * attempt);
    expect(content.generation.maxBillableCostMicroUsdPerWindow * 1000).toBeLessThan(
      WINDOW_WORST_CASE_ATTEMPTS * worstCaseAttemptNanoUsd({ ...content.llm, maxInputTokens: ceiling + 1 }, overhead).total
    );
  });

  it("THE NAMED RESIDUAL (R-158): the all-caps product maximum exceeds the ceiling by under 1%, and is refused before the call", () => {
    // A cap raised without a matching margin decision widens this gap; the
    // bound turns red instead of letting the refusal reach ordinary use.
    expect(derived.bytes).toBeGreaterThan(ceiling);
    expect((derived.bytes - ceiling) / ceiling).toBeLessThan(0.01);
    // The product's own share alone (everything at its cap, a one-line brain
    // and a one-character input) fits with room for the creator's material.
    expect(product.bytes).toBeLessThan(ceiling / 2);
  });

  it("the schema default and the seed agree on it", () => {
    expect(respinConfigV1.shape.llm.parse(undefined).maxInputTokens).toBe(ceiling);
    expect(CONFIG_V1_SEED.llm.maxInputTokens).toBe(ceiling);
  });

  it("OUTSIDE THE DERIVATION, recorded as the owner's: a revision of a 12,000-token draft on the same brain does not fit", () => {
    // ESTIMATED, not measured: ~4 bytes per output token for English prose.
    const revisionDraftBytes = content.llm.maxOutputTokens * 4;
    expect(derived.bytes - OWN_IDEA_MAX + revisionDraftBytes).toBeGreaterThan(marginRuleMaximum());
  });
});
