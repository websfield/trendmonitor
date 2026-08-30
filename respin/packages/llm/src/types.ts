// The provider-neutral surface. R1 / R-5 / tech-spec §1: Anthropic sits behind
// an adapter and the vendor is swappable, which means NO ANTHROPIC TYPE MAY
// CROSS THIS BOUNDARY. `tests/boundary.test.ts` asserts that by scanning the
// package's own source: `@anthropic-ai/sdk` may be imported by exactly one
// file, and it is not this one.

/**
 * How an attempt ended.
 *
 * These five strings are `model_usage.outcome` (`onboarding-schema.ts`), and
 * they are duplicated here rather than imported because `@respin/llm` must not
 * depend on `@respin/db` — a provider adapter that needs the database to
 * describe a failure is not a provider adapter. The duplication is not left to
 * trust: `packages/credits/tests/inference.test.ts` asserts the two sets are
 * identical and that every value is classified as billable or not, so adding a
 * value in one place and not the other is a red test rather than a row that
 * silently books spend against the wrong outcome (R13).
 */
export const INFERENCE_OUTCOMES = [
  "succeeded",
  "schema_invalid",
  "rate_limited",
  "unavailable",
  "refused",
] as const;

export type InferenceOutcome = (typeof INFERENCE_OUTCOMES)[number];

/**
 * One request to a model.
 *
 * `attemptId` is carried THROUGH the adapter rather than generated inside it,
 * and that is R5's actual invariant: a bounded retry is still one attempt, so
 * the id a `model_usage` row and a `credit_ledger` debit share must be minted
 * by the operation, above the layer that retries.
 */
export type InferenceRequest = {
  attemptId: string;
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /**
   * THE WHOLE CALL'S DEADLINE, RETRIES INCLUDED (production CHANGE 6).
   *
   * On the REQUEST rather than on the provider's construction options, and
   * that is the difference from `timeoutMs`: `timeoutMs` bounds ONE attempt and
   * so multiplies by `maxRetries + 1`, which is how a 60s timeout became ~181s
   * of a server action against tech-spec §7's 45s budget. A signal handed to
   * the SDK is checked across the retry loop, so it bounds the OPERATION —
   * the only shape that can express "this must be over by then".
   *
   * Optional so every existing caller and every test stub stays valid; the
   * operation (`runInference`) always supplies one, and a test asserts it does.
   */
  signal?: AbortSignal;
};

/**
 * METERING FIELDS ONLY — never prompt or completion text.
 *
 * This is what lands in `model_usage.usage_raw`, whose own docblock says the
 * same thing, and `assertMeteringOnly` in `@respin/db` enforces it at the write.
 * Two guards rather than one because they fail differently: this type stops it
 * being typed, that assertion stops it being cast.
 */
export type InferenceUsage = {
  tokensIn: number;
  tokensOut: number;
  raw: Record<string, number>;
};

export type InferenceResult = {
  /** The completion. The ONLY field in this package that holds model text. */
  text: string;
  /**
   * The model the vendor says actually served the request, which is not
   * necessarily the one we asked for — a provider may serve an alias or a
   * fallback. THE PRICE IS LOOKED UP FROM THIS VALUE, never from the request:
   * pricing what we asked for rather than what we got is how a fallback to a
   * more expensive model books at the cheaper one's rate.
   */
  servedModel: string;
  usage: InferenceUsage;
};

/**
 * The port. One method, no lifecycle, no vendor types.
 *
 * Injected as a plain parameter rather than resolved from a module registry so
 * a test can hand `runInference` a stub whose REFUSAL TO BE CALLED is itself
 * the proof — every pre-call gate is tested by a stub that throws if invoked,
 * which is unavailable to a `vi.mock` that has already replaced the module.
 */
export type LlmProvider = {
  readonly vendor: string;
  complete(request: InferenceRequest): Promise<InferenceResult>;
};
