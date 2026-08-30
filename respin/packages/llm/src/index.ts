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
  assembleVoicePrompt,
  locateQuote,
  parseVoiceReply,
  AssemblyError,
  NotEnoughPostsError,
  CHECK,
  type AssembledField,
  type AssembledPrompt,
  type AssembledValue,
  type ClaimSpec,
  type OwnPost,
} from "./assemble";
