// @respin/llm — the provider adapter (R1, R-5, tech-spec §1).
//
// The vendor is swappable because nothing outside `anthropic.ts` names it:
// callers depend on `LlmProvider`, `InferenceRequest`, `InferenceResult` and
// the error classes, none of which mention Anthropic. `createAnthropicProvider`
// is the single Anthropic-shaped export, and it returns the neutral port.
export {
  INFERENCE_OUTCOMES,
  type InferenceOutcome,
  type InferenceRequest,
  type InferenceResult,
  type InferenceUsage,
  type LlmProvider,
} from "./types";
export {
  LlmError,
  LlmHostNotAllowedError,
  LlmNotConfiguredError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmSchemaInvalidError,
  LlmTruncatedError,
  LlmUnavailableError,
} from "./errors";
export {
  costMicroUsd,
  priceFor,
  ModelPriceUnknownError,
  TokenCountInvalidError,
  type ModelPrice,
} from "./pricing";
export {
  ANTHROPIC_ORIGIN,
  createAnthropicProvider,
  pinnedFetch,
  type AnthropicProviderOptions,
} from "./anthropic";
export {
  EXEMPTABLE_PROMPT_PARTS,
  LlmInputTooLargeError,
  assertInputWithinCeiling,
  type CeilingInput,
} from "./input-ceiling";
export {
  assembleVoicePrompt,
  composePrompt,
  nothingGroundedError,
  type PromptSegment,
  acceptCanonicalMatch,
  ASSEMBLY_KINDS,
  ASSEMBLY_KINDS_PRE_VENDOR,
  CANON_CODE_POINT_TABLE,
  canon,
  locateQuote,
  parseVoiceReply,
  stripFence,
  AssemblyError,
  NotEnoughPostsError,
  CHECK,
  type AssemblyKind,
  type AssembledField,
  type AssembledPrompt,
  type AssembledValue,
  type ClaimSpec,
  type MapBack,
  type OwnPost,
} from "./assemble";
