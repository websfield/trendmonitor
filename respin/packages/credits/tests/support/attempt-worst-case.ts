// THE WORST-CASE COST OF ONE COUNTED GENERATION ATTEMPT (audit P3-R2/P3-R3,
// decisions R-158 as amended 2026-10-06) — ONE implementation, read by
// `generation-pricing.test.ts` (the window total covers at least 50 of these)
// and `input-ceiling-derivation.test.ts` (the input ceiling is the largest
// value that rule admits), so the two cannot price an attempt differently.
//
// THE COUNTED WORST CASE (`pipeline.ts`): draft 1 on the generation model, the
// one rewrite on the generation model, the scoring call on the classification
// model. Each call's BOUNDED input is at most `llm.maxInputTokens` (the
// rewrite's and the scoring prompt's bounded parts never exceed the first
// pass's — `packages/modes/tests/prompt-parts.test.ts`). On top of that, the
// two calls that carry a vendor reply carry it EXEMPT from the ceiling:
//   - the rewrite carries draft 1 (at most `maxOutputTokens` tokens) plus our
//     own exempt wrapping — the draft header, the rewrite instruction and the
//     findings block — measured here from the real assembler;
//   - the scoring call carries the accepted draft, at most `maxOutputTokens`
//     tokens on the classification model.
//
// NOT COUNTED, NAMED (R-158): findings beyond the one measured here (their
// number follows the draft's violations and has no product cap; each is an
// excerpt of the draft), and the scoring call's draft is `renderDraft` of the
// parsed output, assumed no longer than the reply it was parsed from.
import { assembleRewritePrompt, type GenerationContext, type HardRuleFinding } from "@respin/modes";
import type { RespinConfigV1 } from "@respin/config";

/** The owner's rule (R-158): the window total covers at least this many worst-case attempts. */
export const WINDOW_WORST_CASE_ATTEMPTS = 50;

const ONE_FINDING = [
  { rule: "hook_word_ceiling", shape: "too_long", field: "/hooks/0/text", excerpt: "e", remedy: "r" },
] as unknown as readonly HardRuleFinding[];

/**
 * The smallest context the rewrite assembler accepts. The exempt parts do not
 * read the context (`prompt-parts.test.ts`: "every DECLARED exempt part is fed
 * by a pipeline value"), so any usable one gives the same overhead.
 */
const MINIMAL_CONTEXT = {
  universalLaws: ["u"],
  frameworks: [],
  brain: { voice: ["v"], strategy: [], killtest: [] },
  input: "i",
  platform: "TikTok",
  unvouchedSpecifics: [],
  creative: null,
  recentWork: null,
  reference: { mechanism: { hookMechanic: "h", beats: ["b"], ending: "e", followTrigger: "f" } },
} as unknown as GenerationContext;

/**
 * The bytes of the rewrite's exempt parts around an EMPTY draft with one
 * finding — our own wrapping, counted at one token per byte (an over-count).
 */
export function rewriteExemptOverheadBytes(): number {
  const p = assembleRewritePrompt({ mode: "analyseAndSpin", context: MINIMAL_CONTEXT, draft: "", findings: ONE_FINDING });
  return p.exemptParts.reduce((sum, part) => sum + (p.partSizes[part] ?? 0), 0);
}

type Llm = Pick<RespinConfigV1["llm"], "prices" | "models" | "maxOutputTokens" | "maxInputTokens">;

export function worstCaseAttemptNanoUsd(llm: Llm, overheadBytes: number) {
  const sonnet = llm.prices[llm.models.generation]!;
  const haiku = llm.prices[llm.models.classification]!;
  const output = 2 * llm.maxOutputTokens * sonnet.outputNanoUsdPerToken + llm.maxOutputTokens * haiku.outputNanoUsdPerToken;
  const boundedInput = (2 * sonnet.inputNanoUsdPerToken + haiku.inputNanoUsdPerToken) * llm.maxInputTokens;
  const exemptInput =
    (llm.maxOutputTokens + overheadBytes) * sonnet.inputNanoUsdPerToken + llm.maxOutputTokens * haiku.inputNanoUsdPerToken;
  return { output, boundedInput, exemptInput, total: output + boundedInput + exemptInput };
}

/** The largest `maxInputTokens` the window total's "≥ 50 worst-case attempts" rule admits. */
export function marginRuleMaximumInputTokens(
  llm: Llm,
  windowMicroUsd: number,
  overheadBytes: number
): number {
  const fixed = worstCaseAttemptNanoUsd({ ...llm, maxInputTokens: 0 }, overheadBytes).total;
  const sonnet = llm.prices[llm.models.generation]!;
  const haiku = llm.prices[llm.models.classification]!;
  const perAttemptBudget = (windowMicroUsd * 1000) / WINDOW_WORST_CASE_ATTEMPTS;
  return Math.floor((perAttemptBudget - fixed) / (2 * sonnet.inputNanoUsdPerToken + haiku.inputNanoUsdPerToken));
}
